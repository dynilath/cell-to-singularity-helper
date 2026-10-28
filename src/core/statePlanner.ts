import type {
  FactoryState,
  PlanResult,
  PlanStep,
  Requirement,
  SimulationState,
  UpgradeState,
} from '../types.ts';

const OFFLINE_CHUNK_SECONDS = 180;
const MAX_NODES = 20_000;
const MAX_FRONTIER = 32;
const MAX_ACTION_DEPTH = 8;

interface State extends SimulationState {
  time?: number;
}

type TargetKind = 'factory' | 'upgrade';

interface Target {
  kind: TargetKind;
  id: string;
  label: string;
  requiredOwned: number;
}

interface SearchNode {
  state: State;
  time: number;
  f: number;
  steps: PlanStep[];
  offlineBlocks: number;
  onlineTime: number;
  offlineTime: number;
}

function clone(input: State): State {
  return {
    resources: input.resources.map((resource) => ({ ...resource })),
    factories: input.factories.map((factory) => ({ ...factory })),
    upgrades: input.upgrades.map((upgrade) => ({ ...upgrade })),
    completedUpgrades: new Set(input.completedUpgrades ?? []),
    globalAdMultiplier: input.globalAdMultiplier ?? 1,
    invalidFactoryIds: input.invalidFactoryIds,
    ignoredUpgradeIds: input.ignoredUpgradeIds,
  };
}

function ratesOf(state: State) {
  const rates = new Map(state.resources.map((resource) => [resource.id, resource.baseRate]));
  const global = state.globalAdMultiplier ?? 1;
  for (const factory of state.factories) {
    if (factory.owned <= 0 || factory.unit <= 0) continue;
    rates.set(
      factory.outputResourceId,
      (rates.get(factory.outputResourceId) ?? 0) + factory.owned * factory.unit * global,
    );
  }
  return rates;
}

function amountOf(state: State, resourceId: string) {
  return state.resources.find((resource) => resource.id === resourceId)?.amount ?? 0;
}

function requirementMet(state: State, requires?: Requirement | null) {
  if (!requires) return true;
  if (requires.type === 'factory') {
    return (
      (state.factories.find((factory) => factory.id === requires.id)?.owned ?? 0) >=
      Math.max(1, requires.owned ?? 1)
    );
  }
  return state.completedUpgrades.has(requires.id);
}

function factoryActionable(state: State, factory: FactoryState) {
  return factory.owned > 0 || requirementMet(state, factory.requires);
}

function upgradeActionable(state: State, upgrade: UpgradeState) {
  const target = state.factories.find((factory) => factory.id === upgrade.targetFactoryId);
  return !!target && target.owned >= 1 && requirementMet(state, upgrade.requires);
}

function waitForItem(
  state: State,
  rates: Map<string, number>,
  resourceId: string,
  cost: number,
  offlineMultiplier: number,
) {
  const missing = cost - amountOf(state, resourceId);
  if (missing <= 1e-9) {
    return { online: { seconds: 0, offline: false }, offline: null };
  }
  const rate = rates.get(resourceId) ?? 0;
  if (rate <= 1e-9) return null;
  const onlineSeconds = missing / rate;
  const offlineSeconds =
    Math.ceil(missing / (rate * offlineMultiplier) / OFFLINE_CHUNK_SECONDS) *
    OFFLINE_CHUNK_SECONDS;
  return {
    online: { seconds: onlineSeconds, offline: false },
    offline:
      offlineSeconds > 0 && offlineSeconds < onlineSeconds
        ? { seconds: offlineSeconds, offline: true }
        : null,
  };
}

function targetReached(state: State, target: Target) {
  if (target.kind === 'upgrade') {
    return state.upgrades.find((upgrade) => upgrade.id === target.id)?.purchased === true;
  }
  return (state.factories.find((factory) => factory.id === target.id)?.owned ?? 0) >=
    target.requiredOwned;
}

function targetHeuristic(state: State, target: Target, productionMultiplier = 1) {
  if (targetReached(state, target)) return 0;
  const rates = ratesOf(state);
  const multiplier = Math.max(1, productionMultiplier);
  if (target.kind === 'upgrade') {
    const upgrade = state.upgrades.find((item) => item.id === target.id);
    if (!upgrade) return Number.POSITIVE_INFINITY;
    const rate = (rates.get(upgrade.costResourceId) ?? 0) * multiplier;
    if (rate <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, upgrade.cost - amountOf(state, upgrade.costResourceId)) / rate;
  }
  const factory = state.factories.find((item) => item.id === target.id);
  if (!factory) return Number.POSITIVE_INFINITY;
  const rate = (rates.get(factory.costResourceId) ?? 0) * multiplier;
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  const remaining = Math.max(0, target.requiredOwned - factory.owned);
  return Math.max(0, factory.price * remaining - amountOf(state, factory.costResourceId)) / rate;
}

function configKey(state: State) {
  return `${state.factories.map((factory) => `${factory.id}:${factory.owned}`).join('|')}#${state.upgrades
    .map((upgrade) => (upgrade.purchased ? 1 : 0))
    .join('')}`;
}

function advance(state: State, rates: Map<string, number>, seconds: number, multiplier: number) {
  if (seconds <= 0) return;
  for (const resource of state.resources) {
    resource.amount += (rates.get(resource.id) ?? 0) * seconds * multiplier;
  }
}

function buyFactory(state: State, factoryId: string) {
  const factory = state.factories.find((item) => item.id === factoryId);
  if (!factory) return false;
  const resource = state.resources.find((item) => item.id === factory.costResourceId);
  if (!resource) return false;
  const tolerance = Math.max(1e-9, factory.price * 1e-12);
  if (resource.amount < factory.price - tolerance) return false;
  resource.amount -= factory.price;
  factory.owned += 1;
  factory.price *= factory.growth;
  return true;
}

function buyUpgrade(state: State, upgradeId: string) {
  const upgrade = state.upgrades.find((item) => item.id === upgradeId);
  if (!upgrade || upgrade.purchased) return false;
  const resource = state.resources.find((item) => item.id === upgrade.costResourceId);
  if (!resource) return false;
  const tolerance = Math.max(1e-9, upgrade.cost * 1e-12);
  if (resource.amount < upgrade.cost - tolerance) return false;
  resource.amount -= upgrade.cost;
  upgrade.purchased = true;
  state.completedUpgrades.add(upgrade.id);
  const target = state.factories.find((factory) => factory.id === upgrade.targetFactoryId);
  if (target) target.unit *= upgrade.multiplier;
  return true;
}

function frontierDominates(
  frontier: { time: number; amounts: number[] }[],
  state: State,
  time: number,
) {
  const amounts = state.resources.map((resource) => resource.amount);
  return frontier.some(
    (entry) =>
      entry.time <= time + 1e-9 &&
      entry.amounts.every((amount, index) => amount >= amounts[index] - 1e-7),
  );
}

function addFrontier(
  frontier: { time: number; amounts: number[] }[],
  state: State,
  time: number,
) {
  const amounts = state.resources.map((resource) => resource.amount);
  const next = frontier.filter(
    (entry) =>
      !(
        time <= entry.time + 1e-9 &&
        amounts.every((amount, index) => amount >= entry.amounts[index] - 1e-7)
      ),
  );
  next.push({ time, amounts });
  if (next.length > MAX_FRONTIER) {
    next.sort((left, right) => left.time - right.time);
    next.length = MAX_FRONTIER;
  }
  return next;
}

function createHeap() {
  const items: SearchNode[] = [];
  const less = (a: SearchNode, b: SearchNode) =>
    a.f < b.f - 1e-9 || (Math.abs(a.f - b.f) <= 1e-9 && a.time < b.time);
  return {
    get size() {
      return items.length;
    },
    push(item: SearchNode) {
      items.push(item);
      let index = items.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (!less(items[index], items[parent])) break;
        [items[index], items[parent]] = [items[parent], items[index]];
        index = parent;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length > 0 && last) {
        items[0] = last;
        let index = 0;
        for (;;) {
          const left = index * 2 + 1;
          const right = left + 1;
          let smallest = index;
          if (left < items.length && less(items[left], items[smallest])) smallest = left;
          if (right < items.length && less(items[right], items[smallest])) smallest = right;
          if (smallest === index) break;
          [items[index], items[smallest]] = [items[smallest], items[index]];
          index = smallest;
        }
      }
      return top;
    },
  };
}

function findLockedTarget(state: State): Target | null {
  const rates = ratesOf(state);
  const candidates: { target: Target; wait: number }[] = [];
  const factoryById = new Map(state.factories.map((item) => [item.id, item]));
  const upgradeById = new Map(state.upgrades.map((item) => [item.id, item]));
  const requiredFactories = new Map<string, number>();
  const visited = new Set<string>();

  const addUpgradeCandidate = (upgrade: UpgradeState) => {
    if (upgrade.purchased || !upgradeActionable(state, upgrade)) return;
    const wait = waitForItem(
      state,
      rates,
      upgrade.costResourceId,
      upgrade.cost,
      1,
    );
    if (!wait) return;
    candidates.push({
      target: { kind: 'upgrade', id: upgrade.id, label: upgrade.label, requiredOwned: 1 },
      wait: wait.online.seconds,
    });
  };

  const addFactoryCandidate = (factory: FactoryState, requiredOwned: number) => {
    if (!factoryActionable(state, factory) || factory.owned >= requiredOwned) return;
    const wait = waitForItem(state, rates, factory.costResourceId, factory.price, 1);
    if (!wait) return;
    candidates.push({
      target: {
        kind: 'factory',
        id: factory.id,
        label: factory.label,
        requiredOwned,
      },
      wait: wait.online.seconds,
    });
  };

  const visitUpgrade = (id: string) => {
    const key = `u:${id}`;
    if (visited.has(key)) return;
    visited.add(key);
    const upgrade = upgradeById.get(id);
    if (!upgrade || upgrade.purchased) return;
    addFactory(upgrade.targetFactoryId, 1);
    if (upgrade.requires?.type === 'upgrade') {
      const required = upgradeById.get(upgrade.requires.id);
      if (required && !required.purchased) {
        if (upgradeActionable(state, required)) addUpgradeCandidate(required);
        else visitUpgrade(required.id);
      }
    } else if (upgrade.requires?.type === 'factory') {
      addFactory(upgrade.requires.id, Math.max(1, upgrade.requires.owned ?? 1));
    }
  };

  function addFactory(id: string, requiredOwned: number) {
    const key = `f:${id}`;
    const factory = factoryById.get(id);
    if (!factory) return;
    const desired = Math.max(requiredFactories.get(id) ?? 1, requiredOwned);
    requiredFactories.set(id, desired);
    if (factoryActionable(state, factory)) {
      addFactoryCandidate(factory, desired);
    }
    if (visited.has(key)) return;
    visited.add(key);
    if (factory.requires?.type === 'upgrade') {
      const required = upgradeById.get(factory.requires.id);
      if (required && !required.purchased) {
        if (upgradeActionable(state, required)) addUpgradeCandidate(required);
        else visitUpgrade(required.id);
      }
    } else if (factory.requires?.type === 'factory') {
      addFactory(factory.requires.id, Math.max(1, factory.requires.owned ?? 1));
    }
  }

  for (const upgrade of state.upgrades) {
    if (!upgrade.purchased && !upgradeActionable(state, upgrade)) visitUpgrade(upgrade.id);
  }
  for (const factory of state.factories) {
    if (factory.owned < 1 && !factoryActionable(state, factory)) addFactory(factory.id, 1);
  }

  if (candidates.length === 0) return null;
  candidates.sort((left, right) => left.wait - right.wait);
  return candidates[0].target;
}

function findOpenTarget(state: State): Target | null {
  const rates = ratesOf(state);
  const candidates: { target: Target; wait: number }[] = [];
  for (const factory of state.factories) {
    if (factory.owned >= 1 || !factoryActionable(state, factory)) continue;
    const wait = waitForItem(state, rates, factory.costResourceId, factory.price, 1);
    if (!wait) continue;
    candidates.push({
      target: { kind: 'factory', id: factory.id, label: factory.label, requiredOwned: 1 },
      wait: wait.online.seconds,
    });
  }
  for (const upgrade of state.upgrades) {
    if (upgrade.purchased || !upgradeActionable(state, upgrade)) continue;
    const wait = waitForItem(state, rates, upgrade.costResourceId, upgrade.cost, 1);
    if (!wait) continue;
    candidates.push({
      target: { kind: 'upgrade', id: upgrade.id, label: upgrade.label, requiredOwned: 1 },
      wait: wait.online.seconds,
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => left.wait - right.wait);
  return candidates[0].target;
}

function nextTarget(state: State): Target | null {
  return findLockedTarget(state) ?? findOpenTarget(state);
}

/**
 * 统一收集当前分段可用动作：
 * 1. 目标花费资源的生产工厂；
 * 2. 这些工厂对应的升级；
 * 3. 把工厂/升级的成本资源加入目标资源；
 * 4. 重复，直到不再增加或达到深度限制。
 */
function collectSegmentActions(state: State, target: Target) {
  const factoryIds = new Set<string>();
  const upgradeIds = new Set<string>();
  const targetResources = new Set<string>();
  const targetUpgrade =
    target.kind === 'upgrade'
      ? state.upgrades.find((upgrade) => upgrade.id === target.id)
      : null;
  const targetFactory =
    target.kind === 'factory'
      ? state.factories.find((factory) => factory.id === target.id)
      : null;

  if (targetUpgrade) {
    upgradeIds.add(targetUpgrade.id);
    targetResources.add(targetUpgrade.costResourceId);
    const targetOfUpgrade = state.factories.find(
      (factory) => factory.id === targetUpgrade.targetFactoryId,
    );
    if (targetOfUpgrade) {
      factoryIds.add(targetOfUpgrade.id);
      targetResources.add(targetOfUpgrade.costResourceId);
    }
  }
  if (targetFactory) {
    factoryIds.add(targetFactory.id);
    targetResources.add(targetFactory.costResourceId);
  }

  for (let depth = 0; depth < MAX_ACTION_DEPTH; depth += 1) {
    let changed = false;
    for (const factory of state.factories) {
      if (!factoryActionable(state, factory)) continue;
      if (factoryIds.has(factory.id)) {
        if (!targetResources.has(factory.costResourceId)) {
          targetResources.add(factory.costResourceId);
          changed = true;
        }
        continue;
      }
      if (!targetResources.has(factory.outputResourceId)) continue;
      factoryIds.add(factory.id);
      targetResources.add(factory.costResourceId);
      changed = true;
    }
    for (const upgrade of state.upgrades) {
      if (upgrade.purchased || !upgradeActionable(state, upgrade)) continue;
      if (upgradeIds.has(upgrade.id)) {
        if (!targetResources.has(upgrade.costResourceId)) {
          targetResources.add(upgrade.costResourceId);
          changed = true;
        }
        continue;
      }
      if (upgrade.multiplier <= 1) continue;
      if (!factoryIds.has(upgrade.targetFactoryId)) continue;
      upgradeIds.add(upgrade.id);
      targetResources.add(upgrade.costResourceId);
      changed = true;
    }
    if (!changed) break;
  }
  return { factoryIds, upgradeIds };
}

function targetActionOf(state: State, target: Target) {
  if (target.kind === 'upgrade') {
    const upgrade = state.upgrades.find((item) => item.id === target.id);
    if (!upgrade) return null;
    return {
      kind: 'upgrade' as const,
      id: upgrade.id,
      label: upgrade.label,
      cost: upgrade.cost,
      resourceId: upgrade.costResourceId,
    };
  }
  const factory = state.factories.find((item) => item.id === target.id);
  if (!factory) return null;
  return {
    kind: 'factory' as const,
    id: factory.id,
    label: factory.label,
    cost: factory.price,
    resourceId: factory.costResourceId,
  };
}

/**
 * 先构造一个“把当前买得起的相关工厂先买掉”的种子路径。
 * 主搜索仍会继续找更优路径，但至少不会因为节点预算耗尽而漏掉
 * “先补肌肉再等耳朵/软骨”这种工厂投资。
 */
function buildSeedPath(
  start: State,
  target: Target,
  offlineMultiplier: number,
): SearchNode | null {
  const state = clone(start);
  const steps: PlanStep[] = [];
  const time = 0;
  let offlineBlocks = 0;
  let onlineTime = 0;
  let offlineTime = 0;

  const targetWaitSeconds = (candidate: State) => {
    if (targetReached(candidate, target)) return 0;
    const action = targetActionOf(candidate, target);
    if (!action) return Number.POSITIVE_INFINITY;
    const waits = waitForItem(
      candidate,
      ratesOf(candidate),
      action.resourceId,
      action.cost,
      offlineMultiplier,
    );
    if (!waits) return Number.POSITIVE_INFINITY;
    return Math.min(
      waits.online.seconds,
      waits.offline?.seconds ?? Number.POSITIVE_INFINITY,
    );
  };

  let current = targetWaitSeconds(state);
  if (!Number.isFinite(current)) return null;
  for (let purchase = 0; purchase < 40; purchase += 1) {
    const { factoryIds } = collectSegmentActions(state, target);
    let best: { factoryId: string; wait: number } | null = null;
    for (const factoryId of factoryIds) {
      const factory = state.factories.find((item) => item.id === factoryId);
      if (!factory || !factoryActionable(state, factory)) continue;
      if (factory.price <= 0 || factory.unit <= 0 || factory.growth <= 0) continue;
      if (amountOf(state, factory.costResourceId) < factory.price - 1e-9) continue;
      const trial = clone(state);
      if (!buyFactory(trial, factoryId)) continue;
      const wait = targetWaitSeconds(trial);
      if (wait < current - 1e-9 && (!best || wait < best.wait)) {
        best = { factoryId, wait };
      }
    }
    if (!best) break;
    const factory = state.factories.find((item) => item.id === best.factoryId);
    if (!factory) break;
    const price = factory.price;
    if (!buyFactory(state, factory.id)) break;
    steps.push({
      type: 'buy',
      factoryId: factory.id,
      label: factory.label,
      nth: factory.owned,
      price,
      resourceId: factory.costResourceId,
      resourceName:
        state.resources.find((item) => item.id === factory.costResourceId)?.emoji ??
        '资源',
      t: time,
    });
    current = best.wait;
  }

  if (targetReached(state, target)) {
    return {
      state,
      time,
      f: time,
      steps,
      offlineBlocks,
      onlineTime,
      offlineTime,
    };
  }

  const action = targetActionOf(state, target);
  if (!action) return null;
  const rates = ratesOf(state);
  const waits = waitForItem(
    state,
    rates,
    action.resourceId,
    action.cost,
    offlineMultiplier,
  );
  if (!waits) return null;
  const wait =
    waits.offline && waits.offline.seconds < waits.online.seconds
      ? waits.offline
      : waits.online;
  advance(state, rates, wait.seconds, wait.offline ? offlineMultiplier : 1);
  if (action.kind === 'factory') {
    if (!buyFactory(state, action.id)) return null;
  } else if (!buyUpgrade(state, action.id)) {
    return null;
  }
  const total = time + wait.seconds;
  const block = offlineBlocks + (wait.offline ? 1 : 0);
  const resourceName =
    state.resources.find((item) => item.id === action.resourceId)?.emoji ?? '资源';
  steps.push(
    action.kind === 'factory'
      ? {
          type: 'buy',
          factoryId: action.id,
          label: action.label,
          nth: state.factories.find((item) => item.id === action.id)?.owned ?? 1,
          price: action.cost,
          resourceId: action.resourceId,
          resourceName,
          t: total,
          offline: wait.offline,
          offlineBlock: wait.offline ? block : 0,
          offlineWait: wait.seconds,
        }
      : {
          type: 'upgrade',
          upgradeId: action.id,
          label: action.label,
          cost: action.cost,
          resourceId: action.resourceId,
          resourceName,
          t: total,
          offline: wait.offline,
          offlineBlock: wait.offline ? block : 0,
          offlineWait: wait.seconds,
        },
  );
  if (wait.offline) {
    offlineBlocks = block;
    offlineTime += wait.seconds;
  } else {
    onlineTime += wait.seconds;
  }
  return {
    state,
    time: total,
    f: total,
    steps,
    offlineBlocks,
    onlineTime,
    offlineTime,
  };
}

/**
 * 贪心种子：每一步都选“执行后到目标剩余等待最短”的动作。
 * 不保证最优，但能在主搜索预算耗尽前提供包含工厂投资的可行解。
 */
/**
 * 把当前买得起、且直接生产目标资源的工厂先买掉。
 * 作为递归规划的安全种子，避免主搜索在节点预算内漏掉“先补肌肉再等软骨”。
 */
function buildPrebuyState(
  start: State,
  target: Target,
  offlineMultiplier: number,
) {
  const state = clone(start);
  const targetAction = targetActionOf(state, target);
  if (!targetAction) return null;
  const steps: PlanStep[] = [];
  const targetWaitSeconds = (candidate: State) => {
    if (targetReached(candidate, target)) return 0;
    const action = targetActionOf(candidate, target);
    if (!action) return Number.POSITIVE_INFINITY;
    const waits = waitForItem(
      candidate,
      ratesOf(candidate),
      action.resourceId,
      action.cost,
      offlineMultiplier,
    );
    if (!waits) return Number.POSITIVE_INFINITY;
    return Math.min(
      waits.online.seconds,
      waits.offline?.seconds ?? Number.POSITIVE_INFINITY,
    );
  };
  for (let round = 0; round < 20; round += 1) {
    const { factoryIds } = collectSegmentActions(state, target);
    let changed = false;
    for (const factoryId of factoryIds) {
      const factory = state.factories.find((item) => item.id === factoryId);
      if (!factory || !factoryActionable(state, factory)) continue;
      const isTargetFactory = target.kind === 'factory' && target.id === factory.id;
      if (
        !isTargetFactory &&
        factory.outputResourceId !== targetAction.resourceId
      ) {
        continue;
      }
      if (factory.price <= 0 || factory.unit <= 0 || factory.growth <= 0) continue;
      if (amountOf(state, factory.costResourceId) < factory.price - 1e-9) continue;
      const price = factory.price;
      if (!buyFactory(state, factory.id)) continue;
      steps.push({
        type: 'buy',
        factoryId: factory.id,
        label: factory.label,
        nth: factory.owned,
        price,
        resourceId: factory.costResourceId,
        resourceName:
          state.resources.find((item) => item.id === factory.costResourceId)?.emoji ??
          '资源',
        t: 0,
      });
      changed = true;
    }
    if (!changed) break;
  }

  let current = targetWaitSeconds(state);
  for (let round = 0; round < 20 && Number.isFinite(current); round += 1) {
    const { upgradeIds } = collectSegmentActions(state, target);
    let best: { upgradeId: string; wait: number } | null = null;
    for (const upgradeId of upgradeIds) {
      const upgrade = state.upgrades.find((item) => item.id === upgradeId);
      if (!upgrade || upgrade.purchased || !upgradeActionable(state, upgrade)) {
        continue;
      }
      if (amountOf(state, upgrade.costResourceId) < upgrade.cost - 1e-9) continue;
      const trial = clone(state);
      if (!buyUpgrade(trial, upgradeId)) continue;
      const wait = targetWaitSeconds(trial);
      if (wait < current - 1e-9 && (!best || wait < best.wait)) {
        best = { upgradeId, wait };
      }
    }
    if (!best) break;
    const upgrade = state.upgrades.find((item) => item.id === best.upgradeId);
    if (!upgrade) break;
    const cost = upgrade.cost;
    const resourceId = upgrade.costResourceId;
    if (!buyUpgrade(state, upgrade.id)) break;
    steps.push({
      type: 'upgrade',
      upgradeId: upgrade.id,
      label: upgrade.label,
      cost,
      resourceId,
      resourceName:
        state.resources.find((item) => item.id === resourceId)?.emoji ?? '资源',
      t: 0,
    });
    current = best.wait;
  }

  return steps.length > 0 ? { state, steps } : null;
}

function buildGreedyPath(
  start: State,
  target: Target,
  offlineMultiplier: number,
): SearchNode | null {
  const state = clone(start);
  const steps: PlanStep[] = [];
  let time = 0;
  let offlineBlocks = 0;
  let onlineTime = 0;
  let offlineTime = 0;

  const targetWaitSeconds = (candidate: State) => {
    if (targetReached(candidate, target)) return 0;
    const action = targetActionOf(candidate, target);
    if (!action) return Number.POSITIVE_INFINITY;
    const waits = waitForItem(
      candidate,
      ratesOf(candidate),
      action.resourceId,
      action.cost,
      offlineMultiplier,
    );
    if (!waits) return Number.POSITIVE_INFINITY;
    return Math.min(
      waits.online.seconds,
      waits.offline?.seconds ?? Number.POSITIVE_INFINITY,
    );
  };

  for (let iteration = 0; iteration < 100; iteration += 1) {
    if (iteration === 0) {
      // 先把当前买得起、且能缩短目标剩余时间的工厂买掉。
      // 这些工厂的成本资源不是目标资源，但会提高目标资源产出。
      let current = targetWaitSeconds(state);
      for (let purchase = 0; purchase < 40 && Number.isFinite(current); purchase += 1) {
        const { factoryIds } = collectSegmentActions(state, target);
        let best: { factoryId: string; wait: number } | null = null;
        for (const factoryId of factoryIds) {
          const factory = state.factories.find((item) => item.id === factoryId);
          if (!factory || !factoryActionable(state, factory)) continue;
          if (factory.price <= 0 || factory.unit <= 0 || factory.growth <= 0) continue;
          if (amountOf(state, factory.costResourceId) < factory.price - 1e-9) continue;
          const trial = clone(state);
          if (!buyFactory(trial, factoryId)) continue;
          const wait = targetWaitSeconds(trial);
          if (wait < current - 1e-9 && (!best || wait < best.wait)) {
            best = { factoryId, wait };
          }
        }
        if (!best) break;
        const factory = state.factories.find((item) => item.id === best.factoryId);
        if (!factory) break;
        const price = factory.price;
        if (!buyFactory(state, factory.id)) break;
        steps.push({
          type: 'buy',
          factoryId: factory.id,
          label: factory.label,
          nth: factory.owned,
          price,
          resourceId: factory.costResourceId,
          resourceName:
            state.resources.find((item) => item.id === factory.costResourceId)?.emoji ??
            '资源',
          t: time,
        });
        current = best.wait;
      }
    }
    if (targetReached(state, target)) {
      return {
        state,
        time,
        f: time,
        steps,
        offlineBlocks,
        onlineTime,
        offlineTime,
      };
    }
    const { factoryIds, upgradeIds } = collectSegmentActions(state, target);
    const actions: {
      kind: TargetKind;
      id: string;
      label: string;
      cost: number;
      resourceId: string;
    }[] = [];
    for (const factoryId of factoryIds) {
      const factory = state.factories.find((item) => item.id === factoryId);
      if (!factory || !factoryActionable(state, factory)) continue;
      actions.push({
        kind: 'factory',
        id: factory.id,
        label: factory.label,
        cost: factory.price,
        resourceId: factory.costResourceId,
      });
    }
    for (const upgradeId of upgradeIds) {
      const upgrade = state.upgrades.find((item) => item.id === upgradeId);
      if (!upgrade || upgrade.purchased || !upgradeActionable(state, upgrade)) continue;
      actions.push({
        kind: 'upgrade',
        id: upgrade.id,
        label: upgrade.label,
        cost: upgrade.cost,
        resourceId: upgrade.costResourceId,
      });
    }

    let best:
      | {
          action: (typeof actions)[number];
          wait: { seconds: number; offline: boolean };
          score: number;
          trial: State;
        }
      | null = null;
    const rates = ratesOf(state);
    for (const action of actions) {
      const waits = waitForItem(
        state,
        rates,
        action.resourceId,
        action.cost,
        offlineMultiplier,
      );
      if (!waits) continue;
      const wait =
        waits.offline && waits.offline.seconds < waits.online.seconds
          ? waits.offline
          : waits.online;
      const trial = clone(state);
      advance(trial, rates, wait.seconds, wait.offline ? offlineMultiplier : 1);
      const bought =
        action.kind === 'factory'
          ? buyFactory(trial, action.id)
          : buyUpgrade(trial, action.id);
      if (!bought) continue;
      const remaining = targetWaitSeconds(trial);
      if (!Number.isFinite(remaining)) continue;
      const score = time + wait.seconds + remaining;
      if (!best || score < best.score - 1e-9) {
        best = { action, wait, score, trial };
      }
    }
    if (!best) break;
    const before = state.factories.find((item) => item.id === best.action.id);
    const beforePrice = before?.price ?? best.action.cost;
    const next = best.trial;
    const block = offlineBlocks + (best.wait.offline ? 1 : 0);
    const nextTime = time + best.wait.seconds;
    const resourceName =
      next.resources.find((item) => item.id === best.action.resourceId)?.emoji ?? '资源';
    if (best.action.kind === 'factory') {
      const factory = next.factories.find((item) => item.id === best.action.id);
      if (!factory) break;
      steps.push({
        type: 'buy',
        factoryId: factory.id,
        label: factory.label,
        nth: factory.owned,
        price: beforePrice,
        resourceId: factory.costResourceId,
        resourceName,
        t: nextTime,
        offline: best.wait.offline,
        offlineBlock: best.wait.offline ? block : 0,
        offlineWait: best.wait.seconds,
      });
    } else {
      const upgrade = next.upgrades.find((item) => item.id === best.action.id);
      steps.push({
        type: 'upgrade',
        upgradeId: best.action.id,
        label: best.action.label,
        cost: best.action.cost,
        resourceId: best.action.resourceId,
        resourceName,
        t: nextTime,
        offline: best.wait.offline,
        offlineBlock: best.wait.offline ? block : 0,
        offlineWait: best.wait.seconds,
      });
      void upgrade;
    }
    state.resources = next.resources;
    state.factories = next.factories;
    state.upgrades = next.upgrades;
    state.completedUpgrades = next.completedUpgrades;
    time = nextTime;
    offlineBlocks = block;
    if (best.wait.offline) offlineTime += best.wait.seconds;
    else onlineTime += best.wait.seconds;
  }
  return null;
}

function targetLabel(target: Target) {
  if (target.kind === 'upgrade') return `先买「${target.label}」`;  return target.requiredOwned > 1
    ? `先把「${target.label}」补到 ${target.requiredOwned} 台`
    : `先买出「${target.label}」首台`;
}

/**
 * 分段状态空间搜索：每个计划只推进到下一个门禁/升级目标。
 * 每次等待同时尝试在线精确等待和 3 分钟离线块，由搜索选择总时间更短者。
 */
export function planStateSpace(
  input: State,
  offlineRate = 1,
  options: {
    adDoubling?: boolean;
    targetOverride?: Target;
    skipPrebuy?: boolean;
  } = {},
): PlanResult {
  const offlineMultiplier =
    (Number.isFinite(offlineRate) && offlineRate > 0 ? offlineRate : 1) *
    (options.adDoubling ? 2 : 1);
  const target = options.targetOverride ?? nextTarget(input);
  if (!target) {
    return {
      steps: [],
      complete: true,
      goal: 'upgrades',
      goalLabel: '当前配置下已经没有待完成目标',
      total: 0,
      strategy: 'search',
      offlineBlocks: 0,
      onlineTime: 0,
      offlineTime: 0,
      baselineTotal: 0,
      adDoubled: options.adDoubling === true,
    };
  }

  const start = clone(input);
  if (!options.skipPrebuy) {
    const prebuy = buildPrebuyState(start, target, offlineMultiplier);
    if (prebuy) {
      const rest = planStateSpace(prebuy.state, offlineRate, {
        ...options,
        skipPrebuy: true,
        targetOverride: target,
      });
      if (rest.steps.length > 0 || rest.complete) {
        return {
          ...rest,
          steps: [...prebuy.steps, ...rest.steps],
        };
      }
    }
  }
  const maxOwned = new Map(
    input.factories.map((factory) => [factory.id, factory.owned + 30]),
  );
  const heap = createHeap();
  const frontiers = new Map<string, { time: number; amounts: number[] }[]>();
  const heuristic = targetHeuristic(start, target, offlineMultiplier);
  const seed = buildSeedPath(start, target, offlineMultiplier);
  const greedySeed = buildGreedyPath(start, target, offlineMultiplier);
  let bestTarget: SearchNode | null =
    seed && greedySeed
      ? seed.time <= greedySeed.time
        ? seed
        : greedySeed
      : seed ?? greedySeed;
  heap.push({
    state: start,
    time: 0,
    f: heuristic,
    steps: [],
    offlineBlocks: 0,
    onlineTime: 0,
    offlineTime: 0,
  });
  let expanded = 0;

  while (heap.size > 0 && expanded < MAX_NODES) {
    const node = heap.pop();
    expanded += 1;
    if (bestTarget && node.time >= bestTarget.time - 1e-9) continue;
    if (targetReached(node.state, target)) {
      if (!bestTarget || node.time < bestTarget.time - 1e-9) bestTarget = node;
      continue;
    }

    const key = configKey(node.state);
    const frontier = frontiers.get(key) ?? [];
    if (frontierDominates(frontier, node.state, node.time)) continue;
    frontiers.set(key, addFrontier(frontier, node.state, node.time));

    const rates = ratesOf(node.state);
    const { factoryIds, upgradeIds } = collectSegmentActions(node.state, target);
    const items: {
      kind: TargetKind;
      id: string;
      label: string;
      cost: number;
      resourceId: string;
    }[] = [];
    for (const factory of node.state.factories) {
      if (!factoryIds.has(factory.id)) continue;
      if (factory.owned >= (maxOwned.get(factory.id) ?? factory.owned)) continue;
      items.push({
        kind: 'factory',
        id: factory.id,
        label: factory.label,
        cost: factory.price,
        resourceId: factory.costResourceId,
      });
    }
    for (const upgrade of node.state.upgrades) {
      if (!upgradeIds.has(upgrade.id)) continue;
      items.push({
        kind: 'upgrade',
        id: upgrade.id,
        label: upgrade.label,
        cost: upgrade.cost,
        resourceId: upgrade.costResourceId,
      });
    }

    for (const item of items) {
      const waits = waitForItem(
        node.state,
        rates,
        item.resourceId,
        item.cost,
        offlineMultiplier,
      );
      if (!waits) continue;
      const optionsList = [waits.online, waits.offline].filter(Boolean) as {
        seconds: number;
        offline: boolean;
      }[];
      for (const wait of optionsList) {
        const next = clone(node.state);
        const multiplier = wait.offline ? offlineMultiplier : 1;
        advance(next, rates, wait.seconds, multiplier);
        const bought =
          item.kind === 'factory'
            ? buyFactory(next, item.id)
            : buyUpgrade(next, item.id);
        if (!bought) continue;
        const time = node.time + wait.seconds;
        const offlineBlock = node.offlineBlocks + (wait.offline ? 1 : 0);
        const nextSteps: PlanStep[] = [
          ...node.steps,
          item.kind === 'factory'
            ? {
                type: 'buy',
                factoryId: item.id,
                label: item.label,
                nth: (next.factories.find((factory) => factory.id === item.id)?.owned ?? 1),
                price: item.cost,
                resourceId: item.resourceId,
                resourceName:
                  next.resources.find((resource) => resource.id === item.resourceId)?.emoji ??
                  '资源',
                t: time,
                offline: wait.offline,
                offlineBlock: wait.offline ? offlineBlock : 0,
                offlineWait: wait.seconds,
              }
            : {
                type: 'upgrade',
                upgradeId: item.id,
                label: item.label,
                cost: item.cost,
                resourceId: item.resourceId,
                resourceName:
                  next.resources.find((resource) => resource.id === item.resourceId)?.emoji ??
                  '资源',
                t: time,
                offline: wait.offline,
                offlineBlock: wait.offline ? offlineBlock : 0,
                offlineWait: wait.seconds,
              },
        ];
        const nextHeuristic = targetHeuristic(next, target, offlineMultiplier);
        if (!Number.isFinite(nextHeuristic)) continue;
        const nextNode: SearchNode = {
          state: next,
          time,
          f: time + nextHeuristic,
          steps: nextSteps,
          offlineBlocks: offlineBlock,
          onlineTime: node.onlineTime + (wait.offline ? 0 : wait.seconds),
          offlineTime: node.offlineTime + (wait.offline ? wait.seconds : 0),
        };
        if (targetReached(next, target)) {
          if (!bestTarget || nextNode.time < bestTarget.time - 1e-9) {
            bestTarget = nextNode;
          }
          continue;
        }
        heap.push(nextNode);
      }
    }
  }

  if (bestTarget) {
    return {
      steps: bestTarget.steps,
      complete: false,
      goal: 'unlock',
      goalLabel: targetLabel(target),
      total: bestTarget.time,
      strategy: 'search',
      offlineBlocks: bestTarget.offlineBlocks,
      onlineTime: bestTarget.onlineTime,
      offlineTime: bestTarget.offlineTime,
      baselineTotal: bestTarget.time,
      adDoubled: options.adDoubling === true,
    };
  }

  return {
    steps: [],
    complete: false,
    goal: 'unlock',
    goalLabel: targetLabel(target),
    total: 0,
    strategy: 'search',
    offlineBlocks: 0,
    onlineTime: 0,
    offlineTime: 0,
    baselineTotal: 0,
    adDoubled: options.adDoubling === true,
  };
}
