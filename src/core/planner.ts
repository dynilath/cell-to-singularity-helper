/**
 * v5 规划器：多资源、多工厂、多升级的状态空间搜索（A*）。
 *
 * 目标：
 *   - 存在数量为 0 的工厂（新工厂）：最快买出列表里的第一个新工厂首台。
 *   - 否则：最快完成所有未购买的升级。
 *
 * 每个状态都可以选择“攒到某个工厂/升级可买，然后买它”；A* 按总耗时找最短路径，
 * 因此会考虑跨多个升级的组合（例如先多买工厂、稍晚升级但后续更快）。
 * 原贪心路径作为搜索上界和搜索预算耗尽时的兜底。
 */

import type {
  FactoryState,
  PlanResult,
  PlanStep,
  SimulationState,
  UpgradeState,
} from '../types.ts';

type State = SimulationState & { time?: number };
type OfflineOptions = { adDoubling?: boolean };

export const MAX_ACTIONS = 400;
/** 一次离线必须超过 1 分钟才会触发离线收益。 */
const MIN_OFFLINE_BLOCK_SECONDS = 60;
/** 离线等待只按完整的 3 分钟块计算；精确等待改走在线。 */
const OFFLINE_CHUNK_SECONDS = 180;
/** 手算经验值：以 3 分钟为检查点（常见 12/15/17 分钟档位）。 */
const OFFLINE_CHECKPOINT_SECONDS = 180;
const MAX_OFFLINE_CHECKPOINTS = 3;
const MAX_FACTORIES_PER_CHECKPOINT = 2;

/**
 * @typedef {{ id: string, name: string, amount: number, baseRate: number }} ResourceState
 * @typedef {{
 *   id: string, label: string, price: number, unit: number, growth: number,
 *   owned: number, outputResourceId: string, costResourceId: string,
 * }} FactoryState
 * @typedef {{
 *   id: string, label: string, cost: number, costResourceId: string,
 *   targetFactoryId: string, multiplier: number, purchased: boolean,
 * }} UpgradeState
 * @typedef {{ resources: ResourceState[], factories: FactoryState[], upgrades: UpgradeState[] }} ExplorationState
 */

function multipliersFor(state: State): Map<string, number> {
  const multipliers = new Map<string, number>(
    state.factories.map((factory) => [factory.id, 1]),
  );
  for (const upgrade of state.upgrades) {
    if (!upgrade.purchased || upgrade.multiplier <= 0) continue;
    if (!multipliers.has(upgrade.targetFactoryId)) continue;
    multipliers.set(
      upgrade.targetFactoryId,
      (multipliers.get(upgrade.targetFactoryId) ?? 1) * upgrade.multiplier,
    );
  }
  return multipliers;
}

function computeRates(
  state: State,
  multipliers: Map<string, number> = multipliersFor(state),
): Map<string, number> {
  const rates = new Map<string, number>(
    state.resources.map((resource) => [resource.id, resource.baseRate]),
  );
  const globalMultiplier = state.globalAdMultiplier ?? 1;
  for (const factory of state.factories) {
    if (factory.owned <= 0 || factory.unit <= 0) continue;
    const contribution =
      factory.owned *
      factory.unit *
      (multipliers.get(factory.id) ?? 1) *
      globalMultiplier;
    rates.set(
      factory.outputResourceId,
      (rates.get(factory.outputResourceId) ?? 0) + contribution,
    );
  }
  return rates;
}

function contributionOf(factory: FactoryState, multipliers: Map<string, number>) {
  if (factory.owned <= 0 || factory.unit <= 0) return 0;
  return factory.owned * factory.unit * (multipliers.get(factory.id) ?? 1);
}

function amountOf(state: State, resourceId: string) {
  return state.resources.find((resource) => resource.id === resourceId)?.amount ?? 0;
}

function resourceNameOf(state: State, resourceId: string) {
  return state.resources.find((item) => item.id === resourceId)?.emoji ?? '资源';
}

function wait(state: State, rates: Map<string, number>, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  for (const resource of state.resources) {
    resource.amount += (rates.get(resource.id) ?? 0) * seconds;
  }
}

function currentGoal(state: State) {
  const target = state.factories.find(
    (factory) => factory.owned < 1 && factoryActionable(state, factory),
  );
  if (target) return { type: 'new-factory', factory: target };
  return {
    type: 'upgrades',
    remaining: state.upgrades.filter((upgrade) => !upgrade.purchased),
  };
}

function goalReached(state: State) {
  const target = state.factories.find(
    (factory) => factory.owned < 1 && factoryActionable(state, factory),
  );
  if (target) return false;
  return state.upgrades.every((upgrade) => upgrade.purchased);
}

function requirementMet(state: State, requires: any) {
  if (!requires) return true;
  if (requires.type === 'factory') {
    return (
      (state.factories.find((factory) => factory.id === requires.id)?.owned ?? 0) >=
      Math.max(1, Number(requires.owned) || 1)
    );
  }
  if (requires.type === 'upgrade') {
    return state.completedUpgrades?.has(requires.id) === true;
  }
  return true;
}

function factoryActionable(state: State, factory: FactoryState) {
  if (factory.owned > 0) return true;
  return requirementMet(state, factory.requires);
}

function upgradeActionable(state: State, upgrade: UpgradeState) {
  const target = state.factories.find((factory) => factory.id === upgrade.targetFactoryId);
  if (!target || target.owned < 1) return false;
  return requirementMet(state, upgrade.requires);
}

function affordableUpgrade(state: State) {
  const multipliers = multipliersFor(state);
  const candidates = state.upgrades
    .filter(
      (upgrade) =>
        !upgrade.purchased &&
        upgradeActionable(state, upgrade) &&
        upgrade.cost > 0 &&
        amountOf(state, upgrade.costResourceId) >= upgrade.cost - 1e-9,
    )
    .map((upgrade) => {
      const target = state.factories.find((factory) => factory.id === upgrade.targetFactoryId);
      const benefit = target
        ? contributionOf(target, multipliers) * Math.max(0, upgrade.multiplier - 1)
        : 0;
      return { upgrade, score: benefit / Math.max(1, upgrade.cost) };
    });

  if (candidates.length === 0) return null;
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0].upgrade;
}

function nextUpgradeTime(state: State, rates: Map<string, number>, resourceId: string | null = null) {
  let best = Number.POSITIVE_INFINITY;
  for (const upgrade of state.upgrades) {
    if (upgrade.purchased || upgrade.cost <= 0) continue;
    if (!upgradeActionable(state, upgrade)) continue;
    if (resourceId && upgrade.costResourceId !== resourceId) continue;
    const rate = rates.get(upgrade.costResourceId) ?? 0;
    if (rate <= 0) continue;
    const missing = upgrade.cost - amountOf(state, upgrade.costResourceId);
    if (missing <= 1e-9) return 0;
    best = Math.min(best, missing / rate);
  }
  return best;
}

function buyFactory(state: State, factory: FactoryState, price: number) {
  state.resources.find((resource) => resource.id === factory.costResourceId).amount -= price;
  factory.owned += 1;
  factory.price = price * factory.growth;
}

function buyUpgrade(state: State, upgrade: UpgradeState) {
  state.resources.find((resource) => resource.id === upgrade.costResourceId).amount -=
    upgrade.cost;
  upgrade.purchased = true;
  if (!state.completedUpgrades) state.completedUpgrades = new Set();
  state.completedUpgrades.add(upgrade.id);
}

function pushBuyStep(steps: PlanStep[], state: State, factory: FactoryState, price: number, elapsed: number) {
  steps.push({
    type: 'buy',
    factoryId: factory.id,
    label: factory.label,
    nth: factory.owned + 1,
    price,
    resourceId: factory.costResourceId,
    resourceName: resourceNameOf(state, factory.costResourceId),
    t: elapsed,
  });
  buyFactory(state, factory, price);
}

function pushUpgradeStep(steps: PlanStep[], state: State, upgrade: UpgradeState, elapsed: number) {
  steps.push({
    type: 'upgrade',
    upgradeId: upgrade.id,
    label: upgrade.label,
    cost: upgrade.cost,
    resourceId: upgrade.costResourceId,
    resourceName: resourceNameOf(state, upgrade.costResourceId),
    t: elapsed,
  });
  buyUpgrade(state, upgrade);
}

function usefulFactory(state: State, rates: Map<string, number>, neededResources: Set<string>) {
  const multipliers = multipliersFor(state);
  let best = null;
  for (const factory of state.factories) {
    if (!neededResources.has(factory.outputResourceId)) continue;
    if (!factoryActionable(state, factory)) continue;
    if (factory.unit <= 0 || factory.price <= 0 || factory.growth <= 0) continue;
    if (amountOf(state, factory.costResourceId) < factory.price - 1e-9) continue;
    const payback = factory.price / factory.unit;
    if (!best || payback < best.payback) {
      best = { factory, payback, contribution: contributionOf(factory, multipliers) };
    }
  }
  return best;
}

function nextUsefulFactoryTime(state: State, rates: Map<string, number>, neededResources: Set<string>) {
  let best = Number.POSITIVE_INFINITY;
  for (const factory of state.factories) {
    if (!neededResources.has(factory.outputResourceId)) continue;
    if (!factoryActionable(state, factory)) continue;
    if (factory.unit <= 0 || factory.price <= 0) continue;
    best = Math.min(best, timeToFactory(state, rates, factory));
  }
  return best;
}

function timeToFactory(state: State, rates: Map<string, number>, factory: FactoryState) {
  if (factory.unit <= 0 || factory.price <= 0) return Number.POSITIVE_INFINITY;
  const rate = rates.get(factory.costResourceId) ?? 0;
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  const missing = factory.price - amountOf(state, factory.costResourceId);
  return missing <= 1e-9 ? 0 : missing / rate;
}

/**
 * @param {ExplorationState} input
 * @returns {{
 *   steps: object[], complete: boolean,
 *   goal: 'new-factory' | 'upgrades', goalLabel: string, total: number,
 * }}
 */
export function planExploration(input: State): PlanResult {
  const start = searchClone(input);
  const goal = searchGoal(start);
  const greedy = greedyExploration(input);
  if (goal.type === 'upgrades' && goal.remaining.length === 0) {
    return {
      steps: [],
      complete: true,
      goal: 'upgrades',
      goalLabel: '没有配置升级',
      total: 0,
    };
  }

  const result = searchPlan(start, goal, greedy.complete ? greedy : null);
  if (result.steps.length === 0 && !result.complete) {
    const fallback = fallbackGatePlan(start);
    if (fallback) return fallback;
  }
  return {
    steps: result.steps,
    complete: result.complete,
    goal: goal.type as PlanResult['goal'],
    goalLabel:
      goal.type === 'new-factory'
        ? `点出第一个新工厂：${goal.target.label}`
        : `完成全部 ${start.upgrades.length} 个升级`,
    total: result.total,
  };
}

/**
 * 搜索完全失败时，至少给出“下一个可执行前置”的一段计划：
 * 找到锁定项最近的可执行前置升级/工厂，只规划到它，买完再重新规划。
 */
function fallbackGatePlan(state: State): PlanResult | null {
  const target = findNextGateTarget(state);
  if (!target) return null;
  const rates = searchRates(state);
  if (target.kind === 'upgrade') {
    const upgrade = state.upgrades.find((item) => item.id === target.id);
    if (!upgrade) return null;
    const amount = searchAmount(state, upgrade.costResourceId);
    const rate = rates.get(upgrade.costResourceId) ?? 0;
    if (rate <= 1e-9 && amount < upgrade.cost) return null;
    const wait = amount >= upgrade.cost ? 0 : (upgrade.cost - amount) / rate;
    return {
      steps: [
        {
          type: 'upgrade',
          upgradeId: upgrade.id,
          label: upgrade.label,
          cost: upgrade.cost,
          resourceId: upgrade.costResourceId,
          resourceName: resourceNameOf(state, upgrade.costResourceId),
          t: wait,
        },
      ],
      complete: false,
      goal: 'unlock',
      goalLabel: `先解锁「${upgrade.label}」`,
      total: wait,
    };
  }
  const factory = state.factories.find((item) => item.id === target.id);
  if (!factory) return null;
  const amount = searchAmount(state, factory.costResourceId);
  const rate = rates.get(factory.costResourceId) ?? 0;
  if (rate <= 1e-9 && amount < factory.price) return null;
  const wait = amount >= factory.price ? 0 : (factory.price - amount) / rate;
  return {
    steps: [
      {
        type: 'buy',
        factoryId: factory.id,
        label: factory.label,
        nth: factory.owned + 1,
        price: factory.price,
        resourceId: factory.costResourceId,
        resourceName: resourceNameOf(state, factory.costResourceId),
        t: wait,
      },
    ],
    complete: false,
    goal: 'unlock',
    goalLabel:
      target.requiredOwned > 1
        ? `先把「${factory.label}」补到 ${target.requiredOwned} 台`
        : `先买出「${factory.label}」首台`,
    total: wait,
  };
}

interface GateTarget {
  kind: 'factory' | 'upgrade';
  id: string;
  requiredOwned: number;
  wait: number;
}

function findNextGateTarget(state: State): GateTarget | null {
  const rates = searchRates(state);
  const factoryRequired = new Map<string, number>();
  const visited = new Set<string>();
  const candidates = new Map<string, GateTarget>();
  const factoryById = new Map(state.factories.map((item) => [item.id, item]));
  const upgradeById = new Map(state.upgrades.map((item) => [item.id, item]));

  const addUpgradeCandidate = (upgrade: UpgradeState) => {
    if (upgrade.purchased) return;
    if (!upgradeActionable(state, upgrade)) return;
    const rate = rates.get(upgrade.costResourceId) ?? 0;
    const amount = searchAmount(state, upgrade.costResourceId);
    const missing = Math.max(0, upgrade.cost - amount);
    if (missing > 0 && rate <= 1e-9) return;
    const wait = missing <= 0 ? 0 : missing / rate;
    candidates.set(`u:${upgrade.id}`, {
      kind: 'upgrade',
      id: upgrade.id,
      requiredOwned: 1,
      wait,
    });
  };

  const addFactoryCandidate = (factory: FactoryState, requiredOwned: number) => {
    if (!factoryActionable(state, factory)) return;
    if (factory.owned >= requiredOwned) return;
    const rate = rates.get(factory.costResourceId) ?? 0;
    const amount = searchAmount(state, factory.costResourceId);
    const missing = Math.max(0, factory.price - amount);
    if (missing > 0 && rate <= 1e-9) return;
    const wait = missing <= 0 ? 0 : missing / rate;
    candidates.set(`f:${factory.id}`, {
      kind: 'factory',
      id: factory.id,
      requiredOwned,
      wait,
    });
  };

  const visitUpgrade = (upgradeId: string) => {
    const key = `u:${upgradeId}`;
    if (visited.has(key)) return;
    visited.add(key);
    const upgrade = upgradeById.get(upgradeId);
    if (!upgrade || upgrade.purchased) return;
    addFactoryRequirement(upgrade.targetFactoryId, 1);
    if (upgrade.requires?.type === 'upgrade') {
      const required = upgradeById.get(upgrade.requires.id);
      if (required && !required.purchased) {
        if (upgradeActionable(state, required)) addUpgradeCandidate(required);
        else visitUpgrade(required.id);
      }
    } else if (upgrade.requires?.type === 'factory') {
      addFactoryRequirement(
        upgrade.requires.id,
        Math.max(1, upgrade.requires.owned ?? 1),
      );
    }
  };

  const addFactoryRequirement = (factoryId: string, requiredOwned: number) => {
    const key = `f:${factoryId}`;
    const factory = factoryById.get(factoryId);
    if (!factory) return;
    const desired = Math.max(factoryRequired.get(factoryId) ?? 1, requiredOwned);
    factoryRequired.set(factoryId, desired);
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
      addFactoryRequirement(
        factory.requires.id,
        Math.max(1, factory.requires.owned ?? 1),
      );
    }
  };

  for (const upgrade of state.upgrades) {
    if (!upgrade.purchased && !upgradeActionable(state, upgrade)) {
      visitUpgrade(upgrade.id);
    }
  }
  for (const factory of state.factories) {
    if (factory.owned < 1 && !factoryActionable(state, factory)) {
      addFactoryRequirement(factory.id, 1);
    }
  }

  let best: GateTarget | null = null;
  for (const candidate of candidates.values()) {
    if (!best || candidate.wait < best.wait - 1e-9) best = candidate;
  }
  return best;
}

/**
 * 离线攒钱策略：分段构建，每段结束后从新状态重新规划。
 *
 * 离线期间收入按 offlineRate 累积，但不会买入工厂，因此没有阶梯式增产。
 * 每段先沿用当前状态下的在线最优动作顺序，挑选不慢于最短时间的最长段；
 * 买完这一段后重新搜索后续动作。这样不会把「先买升级再买工厂」的后续变化
 * 锁死在最初的动作顺序里。
 *
 * @param {ExplorationState} input
 * @param {number} offlineRate
 * @param {{ adDoubling?: boolean }} [options]
 */
export function planOfflineExploration(input: State, offlineRate = 1, options: OfflineOptions = {}): PlanResult {
  const base = planOfflineCore(input, offlineRate, options);
  if (!base.complete || base.steps.length === 0) return base;
  return tryCheckpointInsertion(input, base, offlineRate, options) ?? base;
}

/**
 * 3 分钟检查点：在等待第一个动作的途中，如果资源已经能买工厂，
 * 尝试“返回买工厂 → 重新规划剩余部分”，让同一资源路径上的策略稳定。
 */
function tryCheckpointInsertion(input: State, base: PlanResult, offlineRate: number, options: OfflineOptions) {
  // 长计划反复重算代价太高；检查点只用于中小规模状态。
  if (base.steps.length > 40) return null;
  if (input.upgrades.length + input.factories.length > 12) return null;
  const firstActionTime = base.steps[0]?.t ?? 0;
  if (firstActionTime <= OFFLINE_CHECKPOINT_SECONDS) return null;
  const adDoubling = options.adDoubling === true;
  const rate =
    (Number.isFinite(offlineRate) && offlineRate > 0 ? offlineRate : 1) *
    (adDoubling ? 2 : 1);
  let best = base;
  let improved = false;
  const limit = Math.min(
    MAX_OFFLINE_CHECKPOINTS,
    Math.floor((firstActionTime - 1e-6) / OFFLINE_CHECKPOINT_SECONDS),
  );
  for (let index = 1; index <= limit; index += 1) {
    const checkpoint = index * OFFLINE_CHECKPOINT_SECONDS;
    const checkpointState = offlineClone(input);
    const rates = searchRates(checkpointState);
    for (const resource of checkpointState.resources) {
      resource.amount += (rates.get(resource.id) ?? 0) * checkpoint * rate;
    }
    const multipliers = multipliersFor(checkpointState);
    const factories = checkpointState.factories
      .filter(
        (factory) =>
          factoryActionable(checkpointState, factory) &&
          factory.price > 0 &&
          (rates.get(factory.costResourceId) ?? 0) > 0 &&
          amountOf(checkpointState, factory.costResourceId) >= factory.price - 1e-9,
      )
      .sort(
        (left, right) =>
          contributionOf(right, multipliers) / right.price -
          contributionOf(left, multipliers) / left.price,
      )
      .slice(0, MAX_FACTORIES_PER_CHECKPOINT);

    for (const factory of factories) {
      const next = offlineClone(checkpointState);
      const target = next.factories.find((item) => item.id === factory.id);
      if (!target) continue;
      const price = target.price;
      next.resources.find((item) => item.id === target.costResourceId).amount -= price;
      target.owned += 1;
      target.price = price * target.growth;
      const checkpointStep: PlanStep = {
        type: 'buy',
        factoryId: target.id,
        label: target.label,
        nth: target.owned,
        price,
        resourceId: target.costResourceId,
        resourceName: resourceNameOf(next, target.costResourceId),
        t: checkpoint,
        offline: true,
        offlineBlock: 1,
        offlineWait: checkpoint,
      };
      const rest = planOfflineCore(next, offlineRate, options);
      if (!rest.complete) continue;
      const total = checkpoint + rest.total;
      if (total > best.total + 1e-6) continue;
      const steps = [
        checkpointStep,
        ...rest.steps.map((step) => ({
          ...step,
          t: checkpoint + step.t,
          offlineBlock:
            step.offlineBlock > 0 ? 1 + step.offlineBlock : 0,
        })),
      ];
      best = {
        ...base,
        steps,
        complete: true,
        total,
        offlineBlocks: 1 + rest.offlineBlocks,
        onlineTime: rest.onlineTime,
        offlineTime: checkpoint + rest.offlineTime,
        baselineTotal: base.baselineTotal,
      };
      improved = true;
    }
  }
  return improved ? best : null;
}

function planOfflineCore(input: State, offlineRate = 1, options: OfflineOptions = {}): PlanResult {
  const base = planExploration(input);
  const adDoubling = options.adDoubling === true;
  // 离线收入广告是「整段离线收入 ×2」，不是半程才翻倍。
  const rate =
    (Number.isFinite(offlineRate) && offlineRate > 0 ? offlineRate : 1) *
    (adDoubling ? 2 : 1);
  const baseResult: PlanResult = {
    ...base,
    strategy: 'offline',
    offlineBlocks: 0,
    onlineTime: 0,
    offlineTime: base.total,
    baselineTotal: base.total,
    adDoubled: adDoubling,
  };
  if (!base.complete || base.steps.length === 0) return baseResult;

  const state = offlineClone(input);
  const targetId =
    base.goal === 'new-factory' ? searchGoal(state).targetId : null;
  const steps = [];
  let time = 0;
  let blocks = 0;
  let guard = 0;
  const replanLimit =
    input.upgrades.length + input.factories.length > 12 ? 10 : 40;
  let onlineTime = 0;
  let offlineTime = 0;
  let fallback = false;
  let fallbackComplete = false;
  while (
    guard < 500 &&
    !offlineGoalReached(state, base.goal, targetId)
  ) {
    // 逐段重算能保证顺序一致，但长计划（几百次购买）会反复搜索。
    // 只在前若干段逐段重算，剩余部分一次性按当前在线顺序排完。
    if (guard >= replanLimit) {
      fallback = true;
      break;
    }
    guard += 1;
    const online = planExploration(state);
    if (!online.complete || online.steps.length === 0) break;
    // 已经买得起的“下一步”必须当场买，不能为了凑离线批次把它推迟到
    // 12 分钟后再买；先买下可以立即提高离线期间的产出。
    const nextStep = online.steps[0];
    if (offlineStepAffordable(state, nextStep)) {
      const applied = applyOfflineBatch(state, [nextStep], rate, time, blocks);
      if (!applied) break;
      steps.push(...applied.steps);
      time = applied.endTime;
      blocks += applied.offlineBlocks;
      onlineTime += applied.onlineTime;
      offlineTime += applied.offlineTime;
      continue;
    }
    // 会改变产出的购买不提前合并：买完一个就重新搜索，避免把
    // 「升级后工厂更划算」的后续顺序锁死在旧计划里。
    const allowMerge = online.steps.every(
      (step) => !stepChangesProduction(state, step),
    );
    const candidates = offlineCandidates(state, online.steps, rate, allowMerge);
    if (candidates.length === 0) break;
    const chosen = chooseOfflineCandidate(candidates, online.total);
    const batch = online.steps.slice(0, chosen.batchSize);
    const applied = applyOfflineBatch(state, batch, rate, time, blocks);
    if (!applied) break;
    steps.push(...applied.steps);
    time = applied.endTime;
    blocks += applied.offlineBlocks;
    onlineTime += applied.onlineTime;
    offlineTime += applied.offlineTime;
  }

  if (fallback && !offlineGoalReached(state, base.goal, targetId)) {
    const online = planExploration(state);
    if (online.complete && online.steps.length > 0) {
      const candidates = offlineCandidates(state, online.steps, rate, true);
      if (candidates.length > 0) {
        const chosen = chooseOfflineCandidate(candidates, online.total);
        for (const step of chosen.steps) {
          steps.push({
            ...step,
            t: time + step.t,
            offlineBlock:
              step.offlineBlock > 0 ? blocks + step.offlineBlock : 0,
          });
        }
        time += chosen.total;
        blocks += chosen.offlineBlocks;
        onlineTime += chosen.onlineTime;
        offlineTime += chosen.offlineTime;
        fallbackComplete = true;
      }
    }
  }

  const complete = fallbackComplete || offlineGoalReached(state, base.goal, targetId);
  return {
    ...base,
    steps,
    complete,
    total: time,
    strategy: 'offline',
    offlineBlocks: blocks,
    onlineTime,
    offlineTime,
    baselineTotal: base.total,
    adDoubled: adDoubling,
  };
}

function offlineGoalReached(state: State, goal: PlanResult['goal'], targetId?: string) {
  if (goal === 'new-factory') {
    return (state.factories.find((factory) => factory.id === targetId)?.owned ?? 0) >= 1;
  }
  return state.upgrades.every((upgrade) => upgrade.purchased);
}

function stepChangesProduction(state: State, step: PlanStep) {
  if (step.type === 'buy') return true;
  const upgrade = state.upgrades.find((item) => item.id === step.upgradeId);
  return !upgrade || upgrade.multiplier !== 1;
}

function offlineStepAffordable(state: State, step: PlanStep | undefined) {
  if (!step) return false;
  if (step.type === 'buy') {
    const factory = state.factories.find((item) => item.id === step.factoryId);
    return (
      !!factory &&
      factoryActionable(state, factory) &&
      amountOf(state, factory.costResourceId) >= factory.price - 1e-9
    );
  }
  const upgrade = state.upgrades.find((item) => item.id === step.upgradeId);
  return (
    !!upgrade &&
    upgradeActionable(state, upgrade) &&
    amountOf(state, upgrade.costResourceId) >= upgrade.cost - 1e-9
  );
}

function offlineCandidates(state: State, steps: PlanStep[], rate: number, allowMerge = true) {
  const baseSizes = [1, 2, 3, 5, 8, 13, steps.length];
  // 升级后紧接的一串工厂购买，可以尝试并入升级前的同一次离线攒钱。
  let upgradeFactoryRun = 1;
  if (steps[0]?.type === 'upgrade') {
    while (
      upgradeFactoryRun < steps.length &&
      steps[upgradeFactoryRun].type === 'buy'
    ) {
      upgradeFactoryRun += 1;
    }
  }
  const runSizes = [2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 30, 40, 50, upgradeFactoryRun];
  const sizes = [
    ...new Set(
      [1, ...(allowMerge ? baseSizes : []), ...runSizes].filter(
        (size) => size > 0 && size <= steps.length,
      ),
    ),
  ];
  const candidates = [];
  for (const size of sizes) {
    const candidate = simulateOfflineBatches(state, steps, size, rate);
    if (!candidate) continue;
    // 会改变产出的动作默认逐个重算；但同一工厂的连续购买，或
    // 「一次升级 + 紧随其后的工厂购买」可以合成一段，让工厂资源
    // 也在同一段离线里享受离线加成。
    if (!allowMerge && size > 1) {
      const firstBatch = steps.slice(0, size);
      const factoryIds = new Set(
        firstBatch.filter((step) => step.type === 'buy').map((step) => step.factoryId),
      );
      const sameFactory =
        firstBatch.length > 1 &&
        firstBatch.every((step) => step.type === 'buy') &&
        factoryIds.size === 1;
      const upgradeThenFactories =
        firstBatch.length > 1 &&
        firstBatch[0].type === 'upgrade' &&
        firstBatch.slice(1).every((step) => step.type === 'buy');
      if (!sameFactory && !upgradeThenFactories) continue;
    }
    candidates.push(candidate);
  }
  return candidates;
}

function chooseOfflineCandidate(candidates: any[], onlineTotal: number) {
  const bestTotal = candidates.reduce(
    (best, candidate) => Math.min(best, candidate.total),
    Number.POSITIVE_INFINITY,
  );
  const eligible = candidates.filter(
    (candidate) =>
      candidate.total <= onlineTotal + 1e-6 &&
      candidate.total <= bestTotal + 1e-6,
  );
  const pool =
    eligible.length > 0
      ? eligible
      : [candidates.reduce((best, item) => (item.total < best.total ? item : best))];
  pool.sort(
    (left, right) =>
      left.offlineBlocks - right.offlineBlocks || left.total - right.total,
  );
  return pool[0];
}

function chooseWaitMode(state: State, costs: any, offlineRate: number) {
  const rates = searchRates(state);
  let onlineWait = 0;
  let rawOfflineWait = 0;
  for (const [resourceId, cost] of costs.entries()) {
    const missing = cost - searchAmount(state, resourceId);
    if (missing <= 1e-9) continue;
    const rate = rates.get(resourceId) ?? 0;
    if (rate <= 1e-9) return null;
    onlineWait = Math.max(onlineWait, missing / rate);
    rawOfflineWait = Math.max(
      rawOfflineWait,
      missing / (rate * offlineRate),
    );
  }
  if (onlineWait <= 1e-9) {
    return { wait: 0, offline: false, onlineTime: 0, offlineTime: 0, rates };
  }
  // 离线等待只按完整 3 分钟块取整；放不下一个完整块时改走在线等待，
  // 差额部分不会以“精确等待”的形式冒充离线时长。
  const offlineWait = Math.max(
    MIN_OFFLINE_BLOCK_SECONDS + 1e-6,
    Math.ceil(rawOfflineWait / OFFLINE_CHUNK_SECONDS) * OFFLINE_CHUNK_SECONDS,
  );
  if (offlineWait < onlineWait - 1e-9) {
    return {
      wait: offlineWait,
      offline: true,
      onlineTime: 0,
      offlineTime: offlineWait,
      rates,
    };
  }
  return {
    wait: onlineWait,
    offline: false,
    onlineTime: onlineWait,
    offlineTime: 0,
    rates,
  };
}

/** 应用一段离线购买，返回带绝对时间的步骤。 */
function applyOfflineBatch(state: State, batch: any[], offlineRate: number, startTime: number, blockCount: number) {
  const costs = offlineBatchCosts(state, batch);
  if (!costs) return null;
  const decision = chooseWaitMode(state, costs, offlineRate);
  if (!decision) return null;
  for (const resource of state.resources) {
    const rate = decision.rates.get(resource.id) ?? 0;
    resource.amount +=
      rate * decision.wait * (decision.offline ? offlineRate : 1);
  }
  const endTime = startTime + decision.wait;
  const offline = decision.offline;
  const blockId = offline ? blockCount + 1 : 0;
  const steps = [];
  for (const reference of batch) {
    if (reference.type === 'buy') {
      const factory = state.factories.find((item) => item.id === reference.factoryId);
      if (!factory) return null;
      const price = factory.price;
      state.resources.find((item) => item.id === factory.costResourceId).amount -= price;
      factory.owned += 1;
      factory.price = price * factory.growth;
      steps.push({
        type: 'buy',
        factoryId: factory.id,
        label: factory.label,
        nth: factory.owned,
        price,
        resourceId: factory.costResourceId,
        resourceName: resourceNameOf(state, factory.costResourceId),
        t: endTime,
        offline,
        offlineBlock: blockId,
        offlineWait: decision.wait,
      });
    } else {
      const upgrade = state.upgrades.find((item) => item.id === reference.upgradeId);
      if (!upgrade || upgrade.purchased) return null;
      const cost = upgrade.cost;
      state.resources.find((item) => item.id === upgrade.costResourceId).amount -= cost;
      upgrade.purchased = true;
      state.completedUpgrades.add(upgrade.id);
      const target = state.factories.find(
        (item) => item.id === upgrade.targetFactoryId,
      );
      if (target) target.unit *= upgrade.multiplier;
      // 与真实存档一致：买完后升级从列表移除，倍率只保留在 unit 上。
      state.upgrades = state.upgrades.filter((item) => item.id !== upgrade.id);
      steps.push({
        type: 'upgrade',
        upgradeId: upgrade.id,
        label: upgrade.label,
        cost,
        resourceId: upgrade.costResourceId,
        resourceName: resourceNameOf(state, upgrade.costResourceId),
        t: endTime,
        offline,
        offlineBlock: blockId,
        offlineWait: decision.wait,
      });
    }
  }
  return {
    steps,
    endTime,
    offlineBlocks: offline ? 1 : 0,
    onlineTime: decision.onlineTime,
    offlineTime: decision.offlineTime,
  };
}

function offlineClone(input: State): State {
  return {
    resources: input.resources.map((resource) => ({ ...resource })),
    factories: input.factories.map((factory) => ({ ...factory })),
    upgrades: input.upgrades.map((upgrade) => ({ ...upgrade })),
    completedUpgrades: new Set(input.completedUpgrades ?? []),
    globalAdMultiplier: input.globalAdMultiplier ?? 1,
  };
}

/** 只推进价格/倍率，不改资源，用于计算一段动作的总价。 */
function offlineBatchCosts(state: State, batch: any[]) {
  const shadow = offlineClone(state);
  const costs = new Map();
  for (const step of batch) {
    if (step.type === 'buy') {
      const factory = shadow.factories.find((item) => item.id === step.factoryId);
      if (!factory) return null;
      costs.set(
        factory.costResourceId,
        (costs.get(factory.costResourceId) ?? 0) + factory.price,
      );
      factory.owned += 1;
      factory.price *= factory.growth;
    } else {
      const upgrade = shadow.upgrades.find((item) => item.id === step.upgradeId);
      if (!upgrade || upgrade.purchased) return null;
      costs.set(
        upgrade.costResourceId,
        (costs.get(upgrade.costResourceId) ?? 0) + upgrade.cost,
      );
      upgrade.purchased = true;
      shadow.completedUpgrades.add(upgrade.id);
      const target = shadow.factories.find(
        (item) => item.id === upgrade.targetFactoryId,
      );
      if (target) target.unit *= upgrade.multiplier;
      // 购买后从状态中移除，倍率已经烘进 unit，避免下次搜索重复乘。
      shadow.upgrades = shadow.upgrades.filter((item) => item.id !== upgrade.id);
    }
  }
  return costs;
}

function simulateOfflineBatches(input: State, steps: PlanStep[], batchSize: number, offlineRate: number) {
  const state = offlineClone(input);
  const out = [];
  let time = 0;
  let block = 0;
  let onlineTime = 0;
  let offlineTime = 0;
  for (let index = 0; index < steps.length; index += batchSize) {
    const batch = steps.slice(index, index + batchSize);
    const costs = offlineBatchCosts(state, batch);
    if (!costs) return null;
    const decision = chooseWaitMode(state, costs, offlineRate);
    if (!decision) return null;
    for (const resource of state.resources) {
      const rate = decision.rates.get(resource.id) ?? 0;
      resource.amount +=
        rate * decision.wait * (decision.offline ? offlineRate : 1);
    }
    time += decision.wait;
    onlineTime += decision.onlineTime;
    offlineTime += decision.offlineTime;
    const offline = decision.offline;
    if (offline) block += 1;
    for (const reference of batch) {
      if (reference.type === 'buy') {
        const factory = state.factories.find((item) => item.id === reference.factoryId);
        if (!factory) return null;
        const price = factory.price;
        state.resources.find((item) => item.id === factory.costResourceId).amount -= price;
        factory.owned += 1;
        factory.price = price * factory.growth;
        out.push({
          type: 'buy',
          factoryId: factory.id,
          label: factory.label,
          nth: factory.owned,
          price,
          resourceId: factory.costResourceId,
          resourceName: resourceNameOf(state, factory.costResourceId),
          t: time,
          offline,
          offlineBlock: offline ? block : 0,
          offlineWait: decision.wait,
        });
      } else {
        const upgrade = state.upgrades.find((item) => item.id === reference.upgradeId);
        if (!upgrade || upgrade.purchased) return null;
        const cost = upgrade.cost;
        state.resources.find((item) => item.id === upgrade.costResourceId).amount -= cost;
        upgrade.purchased = true;
        state.completedUpgrades.add(upgrade.id);
        const target = state.factories.find(
          (item) => item.id === upgrade.targetFactoryId,
        );
        if (target) target.unit *= upgrade.multiplier;
        state.upgrades = state.upgrades.filter((item) => item.id !== upgrade.id);
        out.push({
          type: 'upgrade',
          upgradeId: upgrade.id,
          label: upgrade.label,
          cost,
          resourceId: upgrade.costResourceId,
          resourceName: resourceNameOf(state, upgrade.costResourceId),
          t: time,
          offline,
          offlineBlock: offline ? block : 0,
          offlineWait: decision.wait,
        });
      }
    }
  }
  return {
    steps: out,
    total: time,
    offlineBlocks: block,
    batchSize,
    onlineTime,
    offlineTime,
  };
}

/** 原贪心路径：作为搜索上界和搜索失败时的兜底。 */
function greedyExploration(input: State): PlanResult {
  const state = {
    resources: input.resources.map((resource) => ({ ...resource })),
    factories: input.factories.map((factory) => ({ ...factory })),
    upgrades: input.upgrades.map((upgrade) => ({ ...upgrade })),
    completedUpgrades: new Set(input.completedUpgrades ?? []),
    globalAdMultiplier: input.globalAdMultiplier ?? 1,
  };

  const initialGoal = currentGoal(state);
  const steps = [];
  let elapsed = 0;
  let complete = goalReached(state);

  for (let iteration = 0; iteration < MAX_ACTIONS && !complete; iteration += 1) {
    const goal = currentGoal(state);
    const rates = computeRates(state);

    if (goal.type === 'new-factory') {
      const target = goal.factory;
      if (
        factoryActionable(state, target) &&
        amountOf(state, target.costResourceId) >= target.price - 1e-9 &&
        target.price > 0
      ) {
        pushBuyStep(steps, state, target, target.price, elapsed);
        if (initialGoal.type === 'new-factory') {
          complete = true;
          break;
        }
        // 初始目标是升级时，中途解锁的新工厂只是顺路购买，不能当作完成。
        continue;
      }

      const needed = new Set([target.costResourceId]);
      const useful = usefulFactory(state, rates, needed);
      const targetTime = timeToFactory(state, rates, target);
      if (useful && useful.payback < targetTime) {
        pushBuyStep(steps, state, useful.factory, useful.factory.price, elapsed);
        continue;
      }
      const nextFactoryTime = nextUsefulFactoryTime(state, rates, needed);
      const nextEvent = Math.min(
        targetTime,
        nextFactoryTime > 1e-9 ? nextFactoryTime : Number.POSITIVE_INFINITY,
      );
      if (Number.isFinite(nextEvent) && nextEvent > 0) {
        wait(state, rates, nextEvent);
        elapsed += nextEvent;
        continue;
      }
      if (useful) {
        pushBuyStep(steps, state, useful.factory, useful.factory.price, elapsed);
        continue;
      }
      break;
    }

    const upgrade = affordableUpgrade(state);
    if (upgrade) {
      pushUpgradeStep(steps, state, upgrade, elapsed);
      complete = goalReached(state);
      continue;
    }

    const needed = new Set(goal.remaining.map((item) => item.costResourceId));
    const useful = usefulFactory(state, rates, needed);
    if (useful) {
      const resourceTime = nextUpgradeTime(state, rates, useful.factory.outputResourceId);
      if (!Number.isFinite(resourceTime) || useful.payback < resourceTime) {
        pushBuyStep(steps, state, useful.factory, useful.factory.price, elapsed);
        continue;
      }
    }

    const nextUpgrade = nextUpgradeTime(state, rates);
    const nextFactory = nextUsefulFactoryTime(state, rates, needed);
    const nextEvent = Math.min(
      nextUpgrade,
      nextFactory > 1e-9 ? nextFactory : Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(nextEvent) && nextEvent > 0) {
      wait(state, rates, nextEvent);
      elapsed += nextEvent;
      continue;
    }

    // 目标资源没有产出：买一个负担得起的、能生产目标资源的工厂。
    const fallback = state.factories.find(
      (factory) =>
        factoryActionable(state, factory) &&
        needed.has(factory.outputResourceId) &&
        factory.unit > 0 &&
        factory.price > 0 &&
        factory.growth > 0 &&
        amountOf(state, factory.costResourceId) >= factory.price - 1e-9,
    );
    if (fallback) {
      pushBuyStep(steps, state, fallback, fallback.price, elapsed);
      continue;
    }
    break;
  }

  if (initialGoal.type === 'new-factory') {
    complete = initialGoal.factory.owned >= 1;
  } else {
    complete = state.upgrades.every((upgrade) => upgrade.purchased);
  }
  const goalLabel =
    initialGoal.type === 'new-factory'
      ? `点出第一个新工厂：${initialGoal.factory.label}`
      : state.upgrades.length === 0
        ? '没有配置升级'
        : `完成全部 ${state.upgrades.length} 个升级`;

  return {
    steps,
    complete,
    goal: initialGoal.type as PlanResult['goal'],
    goalLabel,
    total: elapsed,
  };
}

// ---------------------------------------------------------------------------
// 状态空间搜索（A*）：每一步选择“攒到某个工厂/升级可买，然后买它”。
// 贪心结果只作为上界和搜索预算耗尽时的兜底。
// ---------------------------------------------------------------------------

const MAX_SEARCH_NODES = 30000;
const MAX_FRONTIER_PER_CONFIG = 48;

function searchClone(input: State): State {
  return {
    resources: input.resources.map((resource) => ({ ...resource })),
    factories: input.factories.map((factory) => ({ ...factory })),
    upgrades: input.upgrades.map((upgrade) => ({ ...upgrade })),
    completedUpgrades: new Set(input.completedUpgrades ?? []),
    globalAdMultiplier: input.globalAdMultiplier ?? 1,
    time: 0,
  };
}

function searchGoal(state: State) {
  const target = state.factories.find(
    (factory) => factory.owned < 1 && factoryActionable(state, factory),
  );
  if (target) return { type: 'new-factory', targetId: target.id, target };
  return {
    type: 'upgrades',
    remaining: state.upgrades.filter((upgrade) => !upgrade.purchased),
  };
}

function searchReached(state: State, goal: any) {
  if (goal.type === 'new-factory') {
    return (state.factories.find((factory) => factory.id === goal.targetId)?.owned ?? 0) >= 1;
  }
  return state.upgrades.every((upgrade) => upgrade.purchased);
}

function searchRates(state: State): Map<string, number> {
  const rates = new Map(state.resources.map((resource) => [resource.id, resource.baseRate]));
  const globalMultiplier = state.globalAdMultiplier ?? 1;
  for (const factory of state.factories) {
    if (factory.owned <= 0 || factory.unit <= 0) continue;
    rates.set(
      factory.outputResourceId,
      (rates.get(factory.outputResourceId) ?? 0) +
        factory.owned * factory.unit * globalMultiplier,
    );
  }
  return rates;
}

function searchAmount(state: State, resourceId: string) {
  return state.resources.find((resource) => resource.id === resourceId)?.amount ?? 0;
}

function searchHeuristic(state: State, goal: any) {
  const rates = searchRates(state);
  const remaining = new Map();
  if (goal.type === 'new-factory') {
    const target = state.factories.find((factory) => factory.id === goal.targetId);
    if (!target) return Number.POSITIVE_INFINITY;
    remaining.set(
      target.costResourceId,
      Math.max(0, target.price - searchAmount(state, target.costResourceId)),
    );
  } else {
    for (const upgrade of state.upgrades) {
      if (upgrade.purchased || upgrade.cost <= 0) continue;
      remaining.set(
        upgrade.costResourceId,
        (remaining.get(upgrade.costResourceId) ?? 0) + upgrade.cost,
      );
    }
  }

  let lowerBound = 0;
  for (const [resourceId, total] of remaining) {
    const missing = Math.max(0, total - searchAmount(state, resourceId));
    if (missing <= 1e-9) continue;
    let maxRate = rates.get(resourceId) ?? 0;
    for (const factory of state.factories) {
      if (factory.outputResourceId !== resourceId) continue;
      let multiplier = 1;
      for (const upgrade of state.upgrades) {
        if (upgrade.purchased || upgrade.multiplier <= 0) continue;
        if (upgrade.targetFactoryId === factory.id) multiplier *= upgrade.multiplier;
      }
      maxRate +=
        Math.max(0, factory.unit) *
        multiplier *
        (state.globalAdMultiplier ?? 1);
    }
    if (maxRate <= 1e-9) return Number.POSITIVE_INFINITY;
    lowerBound = Math.max(lowerBound, missing / maxRate);
  }
  return lowerBound;
}

function searchConfigKey(state: State) {
  return `${state.factories.map((factory) => `${factory.id}:${factory.owned}`).join('|')}#${state.upgrades
    .map((upgrade) => (upgrade.purchased ? 1 : 0))
    .join('')}`;
}

function searchAmounts(state: State) {
  return state.resources.map((resource) => resource.amount);
}

function searchDominates(frontier: any[], state: State) {
  const amounts = searchAmounts(state);
  for (const entry of frontier) {
    if (
      entry.time <= state.time + 1e-9 &&
      entry.amounts.every((amount, index) => amount >= amounts[index] - 1e-7)
    ) {
      return true;
    }
  }
  return false;
}

function searchAddFrontier(frontier: any[], state: State) {
  const amounts = searchAmounts(state);
  const next = frontier.filter(
    (entry) =>
      !(
        state.time <= entry.time + 1e-9 &&
        amounts.every((amount, index) => amount >= entry.amounts[index] - 1e-7)
      ),
  );
  next.push({ time: state.time, amounts });
  if (next.length > MAX_FRONTIER_PER_CONFIG) {
    next.sort((left, right) => left.time - right.time);
    next.length = MAX_FRONTIER_PER_CONFIG;
  }
  return next;
}

function createSearchHeap() {
  const items = [];
  const less = (left, right) =>
    left.f < right.f - 1e-9 || (Math.abs(left.f - right.f) <= 1e-9 && left.time < right.time);
  return {
    get size() {
      return items.length;
    },
    push(item) {
      items.push(item);
      let index = items.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (!less(items[index], items[parent])) break;
        [items[parent], items[index]] = [items[index], items[parent]];
        index = parent;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length > 0) {
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

/**
 * A* 搜索。返回开销最小的动作序列；搜索预算耗尽时返回已知上界。
 * 每个动作 = 等到目标可买，然后立即购买。任意购买序列都能这样表达。
 */
function searchPlan(start: State, goal: any, upperBound?: PlanResult | null): PlanResult {
  if (searchReached(start, goal)) {
    return {
      steps: [],
      complete: true,
      goal: 'upgrades',
      goalLabel: '',
      total: 0,
    };
  }

  let bestSteps = upperBound?.steps ?? [];
  let bestTotal = upperBound?.complete ? upperBound.total : Number.POSITIVE_INFINITY;
  if (!upperBound?.complete) {
    bestSteps = [];
    bestTotal = Number.POSITIVE_INFINITY;
  }

  const heap = createSearchHeap();
  const frontiers = new Map();
  const complexity = start.upgrades.length + start.factories.length;
  const maxNodes = complexity > 12 ? 5000 : MAX_SEARCH_NODES;
  const startHeuristic = searchHeuristic(start, goal);
  if (Number.isFinite(startHeuristic)) {
    heap.push({ state: start, path: [], f: startHeuristic, time: 0 });
    frontiers.set(searchConfigKey(start), [{ time: 0, amounts: searchAmounts(start) }]);
  }

  let expanded = 0;
  while (heap.size > 0 && expanded < maxNodes) {
    const node = heap.pop();
    if (node.time >= bestTotal - 1e-9 || node.f >= bestTotal - 1e-9) continue;
    expanded += 1;
    const state = node.state;
    const rates = searchRates(state);

    const neededResources = new Set();
    if (goal.type === 'new-factory') {
      const target = state.factories.find((factory) => factory.id === goal.targetId);
      if (target) neededResources.add(target.costResourceId);
    } else {
      for (const upgrade of state.upgrades) {
        if (!upgrade.purchased && upgrade.cost > 0) {
          neededResources.add(upgrade.costResourceId);
        }
      }
    }

    const targets = [];
    if (goal.type === 'new-factory') {
      const target = state.factories.find((factory) => factory.id === goal.targetId);
      if (target && factoryActionable(state, target)) {
        targets.push({ kind: 'factory', factory: target });
      }
      // 新工厂目标允许顺路购买已解锁升级：便宜的产出升级可能缩短
      // 攒钱时间，即使它不是目标工厂的前置条件。
      for (const upgrade of state.upgrades) {
        if (upgrade.purchased || upgrade.cost <= 0) continue;
        if (!upgradeActionable(state, upgrade)) continue;
        targets.push({ kind: 'upgrade', upgrade });
      }
    } else {
      for (const upgrade of state.upgrades) {
        if (upgrade.purchased || upgrade.cost <= 0) continue;
        if (!upgradeActionable(state, upgrade)) continue;
        targets.push({ kind: 'upgrade', upgrade });
      }
    }
    for (const factory of state.factories) {
      if (!neededResources.has(factory.outputResourceId)) continue;
      if (!factoryActionable(state, factory)) continue;
      if (factory.unit <= 0 || factory.price <= 0 || factory.growth <= 0) continue;
      targets.push({ kind: 'factory', factory });
    }

    for (const target of targets) {
      const isFactory = target.kind === 'factory';
      const cost = isFactory ? target.factory.price : target.upgrade.cost;
      const resourceId = isFactory
        ? target.factory.costResourceId
        : target.upgrade.costResourceId;
      const rate = rates.get(resourceId) ?? 0;
      const amount = searchAmount(state, resourceId);
      if (!(cost > 0)) continue;
      let wait = 0;
      if (amount + 1e-9 < cost) {
        if (rate <= 1e-9) continue;
        wait = (cost - amount) / rate;
      }
      const time = node.time + wait;
      if (time >= bestTotal - 1e-9) continue;

      const next: State = {
        resources: state.resources.map((resource) => ({ ...resource })),
        factories: state.factories.map((factory) => ({ ...factory })),
        upgrades: state.upgrades.map((upgrade) => ({ ...upgrade })),
        completedUpgrades: new Set<string>(state.completedUpgrades ?? []),
        globalAdMultiplier: state.globalAdMultiplier ?? 1,
        time,
      };
      for (const resource of next.resources) {
        resource.amount += (rates.get(resource.id) ?? 0) * wait;
      }

      let step: PlanStep;
      if (isFactory) {
        const factory = next.factories.find((item) => item.id === target.factory.id);
        if (!factory) continue;
        step = {
          type: 'buy',
          factoryId: factory.id,
          label: factory.label,
          nth: factory.owned + 1,
          price: factory.price,
          resourceId: factory.costResourceId,
          resourceName: resourceNameOf(next, factory.costResourceId),
          t: time,
        };
        next.resources.find((resource) => resource.id === factory.costResourceId).amount -=
          factory.price;
        factory.owned += 1;
        factory.price *= factory.growth;
      } else {
        const upgrade = next.upgrades.find((item) => item.id === target.upgrade.id);
        if (!upgrade) continue;
        step = {
          type: 'upgrade',
          upgradeId: upgrade.id,
          label: upgrade.label,
          cost: upgrade.cost,
          resourceId: upgrade.costResourceId,
          resourceName: resourceNameOf(next, upgrade.costResourceId),
          t: time,
        };
        next.resources.find((resource) => resource.id === upgrade.costResourceId).amount -=
          upgrade.cost;
        upgrade.purchased = true;
        next.completedUpgrades.add(upgrade.id);
        const factory = next.factories.find(
          (item) => item.id === upgrade.targetFactoryId,
        );
        if (factory) factory.unit *= upgrade.multiplier;
      }

      const path = [...node.path, step];
      if (searchReached(next, goal)) {
        if (time < bestTotal - 1e-9) {
          bestTotal = time;
          bestSteps = path;
        }
        continue;
      }

      const heuristic = searchHeuristic(next, goal);
      if (!Number.isFinite(heuristic) || time + heuristic >= bestTotal - 1e-9) continue;
      const key = searchConfigKey(next);
      const frontier = frontiers.get(key) ?? [];
      if (searchDominates(frontier, next)) continue;
      frontiers.set(key, searchAddFrontier(frontier, next));
      heap.push({ state: next, path, f: time + heuristic, time });
    }
  }

  return {
    steps: bestSteps,
    complete: Number.isFinite(bestTotal),
    total: Number.isFinite(bestTotal) ? bestTotal : 0,
    goal: 'upgrades',
    goalLabel: '',
  };
}
