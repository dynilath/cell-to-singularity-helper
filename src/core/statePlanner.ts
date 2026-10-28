import { factoryQuote } from './exploration.ts';
import {
  amountOf,
  emptyCursor,
  factoryActionable,
  ratesOf,
  replayAction,
  replayPath,
  upgradeActionable,
  waitForResource,
  type MacroAction,
  type PlanCursor,
  type PlannerState,
  type ReplayResult,
} from './plannerSimulation.ts';
import type { PlanResult } from '../types.ts';

const MAX_OWNED_DELTA = 1000;
const MAX_BEAM_WIDTH = 32;
const MAX_MACRO_DEPTH = 24;
const MAX_GREEDY_DEPTH = 16;
const MAX_FRONTIER = 4;
const MAX_UPGRADES_PER_STATE = 10;
const MAX_ROLLOUTS_PER_DEPTH = 4;
const MAX_SIMULATIONS = 60_000;
const SEARCH_TIME_BUDGET_MS = 1200;
const EPSILON = 1e-9;

type TargetKind = 'factory' | 'upgrade';

interface Target {
  kind: TargetKind;
  id: string;
  label: string;
  requiredOwned: number;
}

interface PlannerContext {
  target: Target;
  offlineMultiplier: number;
  factoryIds: Set<string>;
  upgradeIds: Set<string>;
  requiredFactories: Map<string, number>;
  requiredUpgradeIds: Set<string>;
  maxOwned: Map<string, number>;
}

interface SearchNode {
  state: PlannerState;
  cursor: PlanCursor;
  path: MacroAction[];
  score: number;
}

interface Incumbent {
  path: MacroAction[];
  cursor: PlanCursor;
}

interface SearchBudget {
  deadline: number;
  simulations: number;
}

interface FrontierEntry {
  time: number;
  amounts: number[];
}

function targetReached(state: PlannerState, target: Target) {
  if (target.kind === 'upgrade') {
    return state.upgrades.find((upgrade) => upgrade.id === target.id)?.purchased === true;
  }
  return (
    (state.factories.find((factory) => factory.id === target.id)?.owned ?? 0) >=
    target.requiredOwned
  );
}

function targetActionCost(state: PlannerState, target: Target) {
  if (target.kind === 'upgrade') {
    const upgrade = state.upgrades.find((item) => item.id === target.id);
    return upgrade ? { resourceId: upgrade.costResourceId, cost: upgrade.cost } : null;
  }
  const factory = state.factories.find((item) => item.id === target.id);
  if (!factory) return null;
  const remaining = Math.max(0, target.requiredOwned - factory.owned);
  if (remaining < 1) return { resourceId: factory.costResourceId, cost: 0 };
  const quote = factoryQuote(factory, remaining);
  return quote && Number.isFinite(quote.totalCost)
    ? { resourceId: factory.costResourceId, cost: quote.totalCost }
    : null;
}

function targetWaitEstimate(state: PlannerState, target: Target, offlineMultiplier: number) {
  if (targetReached(state, target)) return 0;
  const action = targetActionCost(state, target);
  if (!action) return Number.POSITIVE_INFINITY;
  const waits = waitForResource(
    state,
    ratesOf(state),
    action.resourceId,
    action.cost,
    offlineMultiplier,
  );
  if (!waits) return Number.POSITIVE_INFINITY;
  return Math.min(waits.online.seconds, waits.offline?.seconds ?? Number.POSITIVE_INFINITY);
}

function singleItemWait(state: PlannerState, resourceId: string, cost: number) {
  const waits = waitForResource(state, ratesOf(state), resourceId, cost, 1);
  return waits?.online.seconds ?? null;
}

function findLockedTarget(state: PlannerState): Target | null {
  const candidates: { target: Target; wait: number }[] = [];
  const factoryById = new Map(state.factories.map((item) => [item.id, item]));
  const upgradeById = new Map(state.upgrades.map((item) => [item.id, item]));
  const requiredFactories = new Map<string, number>();
  const visited = new Set<string>();

  const addUpgradeCandidate = (upgradeId: string) => {
    const upgrade = upgradeById.get(upgradeId);
    if (!upgrade || upgrade.purchased || !upgradeActionable(state, upgradeId)) return;
    const wait = singleItemWait(state, upgrade.costResourceId, upgrade.cost);
    if (wait === null) return;
    candidates.push({
      target: { kind: 'upgrade', id: upgrade.id, label: upgrade.label, requiredOwned: 1 },
      wait,
    });
  };

  const addFactoryCandidate = (factoryId: string, requiredOwned: number) => {
    const factory = factoryById.get(factoryId);
    if (!factory || !factoryActionable(state, factoryId) || factory.owned >= requiredOwned) {
      return;
    }
    const wait = singleItemWait(state, factory.costResourceId, factory.price);
    if (wait === null) return;
    candidates.push({
      target: { kind: 'factory', id: factory.id, label: factory.label, requiredOwned },
      wait,
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
        if (upgradeActionable(state, required.id)) addUpgradeCandidate(required.id);
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
    if (factoryActionable(state, id)) addFactoryCandidate(id, desired);
    if (visited.has(key)) return;
    visited.add(key);
    if (factory.requires?.type === 'upgrade') {
      const required = upgradeById.get(factory.requires.id);
      if (required && !required.purchased) {
        if (upgradeActionable(state, required.id)) addUpgradeCandidate(required.id);
        else visitUpgrade(required.id);
      }
    } else if (factory.requires?.type === 'factory') {
      addFactory(factory.requires.id, Math.max(1, factory.requires.owned ?? 1));
    }
  }

  for (const upgrade of state.upgrades) {
    if (!upgrade.purchased && !upgradeActionable(state, upgrade.id)) visitUpgrade(upgrade.id);
  }
  for (const factory of state.factories) {
    if (factory.owned < 1 && !factoryActionable(state, factory.id)) addFactory(factory.id, 1);
  }

  candidates.sort((left, right) => left.wait - right.wait);
  return candidates[0]?.target ?? null;
}

function findOpenTarget(state: PlannerState): Target | null {
  const candidates: { target: Target; wait: number }[] = [];
  for (const factory of state.factories) {
    if (factory.owned >= 1 || !factoryActionable(state, factory.id)) continue;
    const wait = singleItemWait(state, factory.costResourceId, factory.price);
    if (wait === null) continue;
    candidates.push({
      target: { kind: 'factory', id: factory.id, label: factory.label, requiredOwned: 1 },
      wait,
    });
  }
  for (const upgrade of state.upgrades) {
    if (upgrade.purchased || !upgradeActionable(state, upgrade.id)) continue;
    const wait = singleItemWait(state, upgrade.costResourceId, upgrade.cost);
    if (wait === null) continue;
    candidates.push({
      target: { kind: 'upgrade', id: upgrade.id, label: upgrade.label, requiredOwned: 1 },
      wait,
    });
  }
  candidates.sort((left, right) => left.wait - right.wait);
  return candidates[0]?.target ?? null;
}

function nextTarget(state: PlannerState): Target | null {
  return findLockedTarget(state) ?? findOpenTarget(state);
}

/** 静态相关图包含产出/成本、升级增益和前置解锁边，不用任意层数截断。 */
function buildContext(
  state: PlannerState,
  target: Target,
  offlineMultiplier: number,
): PlannerContext {
  const factoryIds = new Set<string>();
  const upgradeIds = new Set<string>();
  const targetResources = new Set<string>();
  const requiredFactories = new Map<string, number>();
  const requiredUpgradeIds = new Set<string>();
  const factoryById = new Map(state.factories.map((factory) => [factory.id, factory]));
  const upgradeById = new Map(state.upgrades.map((upgrade) => [upgrade.id, upgrade]));

  function addFactory(id: string, requiredOwned = 1) {
    const factory = factoryById.get(id);
    if (!factory) return;
    const alreadyIncluded = factoryIds.has(id);
    factoryIds.add(id);
    requiredFactories.set(id, Math.max(requiredFactories.get(id) ?? 0, requiredOwned));
    if (alreadyIncluded) return;
    if (factory.requires?.type === 'factory') {
      addFactory(factory.requires.id, Math.max(1, factory.requires.owned ?? 1));
    } else if (factory.requires?.type === 'upgrade') {
      requiredUpgradeIds.add(factory.requires.id);
      addUpgrade(factory.requires.id);
    }
  }

  function addUpgrade(id: string) {
    const upgrade = upgradeById.get(id);
    if (!upgrade || upgrade.purchased || upgradeIds.has(id)) return;
    upgradeIds.add(id);
    addFactory(upgrade.targetFactoryId, 1);
    if (upgrade.requires?.type === 'factory') {
      addFactory(upgrade.requires.id, Math.max(1, upgrade.requires.owned ?? 1));
    } else if (upgrade.requires?.type === 'upgrade') {
      requiredUpgradeIds.add(upgrade.requires.id);
      addUpgrade(upgrade.requires.id);
    }
  }

  if (target.kind === 'factory') addFactory(target.id, target.requiredOwned);
  else addUpgrade(target.id);

  for (let iteration = 0; iteration <= state.factories.length + state.upgrades.length; iteration += 1) {
    const before = factoryIds.size + upgradeIds.size + targetResources.size;
    for (const id of factoryIds) {
      const factory = factoryById.get(id);
      if (factory) targetResources.add(factory.costResourceId);
    }
    for (const id of upgradeIds) {
      const upgrade = upgradeById.get(id);
      if (upgrade) targetResources.add(upgrade.costResourceId);
    }
    for (const factory of state.factories) {
      if (targetResources.has(factory.outputResourceId)) addFactory(factory.id);
    }
    for (const upgrade of state.upgrades) {
      if (!upgrade.purchased && upgrade.multiplier > 1 && factoryIds.has(upgrade.targetFactoryId)) {
        addUpgrade(upgrade.id);
      }
    }
    if (before === factoryIds.size + upgradeIds.size + targetResources.size) break;
  }

  const maxOwned = new Map(
    state.factories.map((factory) => [
      factory.id,
      Math.max(
        factory.owned + MAX_OWNED_DELTA,
        factory.id === target.id && target.kind === 'factory' ? target.requiredOwned : 0,
        requiredFactories.get(factory.id) ?? 0,
      ),
    ]),
  );
  return {
    target,
    offlineMultiplier,
    factoryIds,
    upgradeIds,
    requiredFactories,
    requiredUpgradeIds,
    maxOwned,
  };
}

function targetMacros(state: PlannerState, context: PlannerContext): MacroAction[] {
  const { target } = context;
  const count =
    target.kind === 'factory'
      ? Math.max(
          1,
          target.requiredOwned -
            (state.factories.find((factory) => factory.id === target.id)?.owned ?? 0),
        )
      : 1;
  return [
    { kind: target.kind, id: target.id, count, offline: false },
    { kind: target.kind, id: target.id, count, offline: true },
  ];
}

function affordableBatch(state: PlannerState, factoryId: string, limit: number) {
  const factory = state.factories.find((item) => item.id === factoryId)!;
  const amount = amountOf(state, factory.costResourceId);
  let low = 0;
  let high = Math.max(0, Math.floor(limit));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const quote = factoryQuote(factory, middle);
    if (
      quote &&
      Number.isFinite(quote.totalCost) &&
      quote.totalCost <= amount + Math.max(EPSILON, quote.totalCost * 1e-12)
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function batchCandidates(
  state: PlannerState,
  factoryId: string,
  context: PlannerContext,
  limit: number,
) {
  const factory = state.factories.find((item) => item.id === factoryId)!;
  const maximum = Math.min(
    MAX_OWNED_DELTA,
    (context.maxOwned.get(factoryId) ?? factory.owned) - factory.owned,
  );
  if (maximum < 1) return [];
  const q0 = affordableBatch(state, factoryId, maximum);
  const required = Math.max(
    0,
    (context.requiredFactories.get(factoryId) ?? 0) - factory.owned,
    factoryId === context.target.id && context.target.kind === 'factory'
      ? context.target.requiredOwned - factory.owned
      : 0,
  );
  const counts: number[] = [];
  const add = (value: number) => {
    const count = Math.min(maximum, Math.floor(value));
    if (count >= 1 && !counts.includes(count)) counts.push(count);
  };
  add(1);
  add(required);
  add(q0);
  add(q0 + 1);
  const powers = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1000];
  powers.sort((left, right) => {
    if (q0 <= 0) return left - right;
    return Math.abs(Math.log(left / q0)) - Math.abs(Math.log(right / q0));
  });
  for (const power of powers) {
    add(power);
    if (counts.length >= limit) break;
  }
  return counts.slice(0, limit);
}

function generateActions(state: PlannerState, context: PlannerContext, batchLimit: number) {
  const actions: MacroAction[] = [];
  const keys = new Set<string>();
  const add = (action: MacroAction) => {
    const key = `${action.kind}:${action.id}:${action.count}:${action.offline ? 1 : 0}`;
    if (keys.has(key)) return;
    keys.add(key);
    actions.push(action);
  };

  for (const factory of state.factories) {
    if (!context.factoryIds.has(factory.id) || !factoryActionable(state, factory.id)) continue;
    for (const count of batchCandidates(state, factory.id, context, batchLimit)) {
      add({ kind: 'factory', id: factory.id, count, offline: false });
      const quote = factoryQuote(factory, count);
      const allAffordable =
        quote &&
        quote.totalCost <=
          amountOf(state, factory.costResourceId) + Math.max(EPSILON, quote.totalCost * 1e-12);
      if (!allAffordable) add({ kind: 'factory', id: factory.id, count, offline: true });
    }
  }

  const upgrades = state.upgrades
    .filter(
      (upgrade) =>
        context.upgradeIds.has(upgrade.id) &&
        !upgrade.purchased &&
        upgradeActionable(state, upgrade.id),
    )
    .sort((left, right) => {
      const leftRequired =
        left.id === context.target.id || context.requiredUpgradeIds.has(left.id) ? 1 : 0;
      const rightRequired =
        right.id === context.target.id || context.requiredUpgradeIds.has(right.id) ? 1 : 0;
      return rightRequired - leftRequired || Math.log(right.multiplier) - Math.log(left.multiplier);
    });
  const selected = upgrades.slice(0, MAX_UPGRADES_PER_STATE);
  if (
    context.target.kind === 'upgrade' &&
    !selected.some((upgrade) => upgrade.id === context.target.id)
  ) {
    const target = upgrades.find((upgrade) => upgrade.id === context.target.id);
    if (target) selected.push(target);
  }
  for (const upgrade of selected) {
    add({ kind: 'upgrade', id: upgrade.id, count: 1, offline: false });
    if (amountOf(state, upgrade.costResourceId) < upgrade.cost) {
      add({ kind: 'upgrade', id: upgrade.id, count: 1, offline: true });
    }
  }
  for (const action of targetMacros(state, context)) add(action);
  return actions;
}

function simulate(
  state: PlannerState,
  cursor: PlanCursor,
  action: MacroAction,
  context: PlannerContext,
  budget: SearchBudget,
): ReplayResult | null {
  if (budget.simulations >= MAX_SIMULATIONS || Date.now() > budget.deadline) return null;
  budget.simulations += 1;
  return replayAction(state, cursor, action, context.offlineMultiplier);
}

function greedyComplete(
  startState: PlannerState,
  startCursor: PlanCursor,
  startPath: MacroAction[],
  context: PlannerContext,
  budget: SearchBudget,
): Incumbent | null {
  let state = startState;
  let cursor = startCursor;
  const path = [...startPath];
  for (let depth = path.length; depth < MAX_GREEDY_DEPTH; depth += 1) {
    if (targetReached(state, context.target)) return { path, cursor };
    const currentScore = cursor.time + targetWaitEstimate(state, context.target, context.offlineMultiplier);
    if (!Number.isFinite(currentScore)) return null;
    let best: { action: MacroAction; result: ReplayResult; score: number } | null = null;
    for (const action of generateActions(state, context, 2)) {
      const result = simulate(state, cursor, action, context, budget);
      if (!result) continue;
      const score =
        result.cursor.time +
        targetWaitEstimate(result.state, context.target, context.offlineMultiplier);
      if (
        score < currentScore - EPSILON &&
        (!best || score < best.score - EPSILON || (Math.abs(score - best.score) <= EPSILON && result.cursor.time < best.result.cursor.time))
      ) {
        best = { action, result, score };
      }
    }
    if (!best) return null;
    state = best.result.state;
    cursor = best.result.cursor;
    path.push(best.action);
  }
  return targetReached(state, context.target) ? { path, cursor } : null;
}

function configKey(state: PlannerState) {
  return `${state.factories.map((factory) => `${factory.id}:${factory.owned}`).join('|')}#${state.upgrades
    .map((upgrade) => (upgrade.purchased ? 1 : 0))
    .join('')}`;
}

function dominates(frontier: FrontierEntry[], state: PlannerState, cursor: PlanCursor) {
  return frontier.some(
    (entry) =>
      entry.time <= cursor.time + EPSILON &&
      entry.amounts.every(
        (amount, index) =>
          amount >=
          state.resources[index].amount - Math.max(1e-7, Math.abs(state.resources[index].amount) * 1e-12),
      ),
  );
}

function addFrontier(frontier: FrontierEntry[], result: ReplayResult) {
  const entry = {
    time: result.cursor.time,
    amounts: result.state.resources.map((resource) => resource.amount),
  };
  const next = frontier.filter(
    (existing) =>
      !(
        entry.time <= existing.time + EPSILON &&
        entry.amounts.every(
          (amount, index) =>
            amount >=
            existing.amounts[index] - Math.max(1e-7, Math.abs(existing.amounts[index]) * 1e-12),
        )
      ),
  );
  next.push(entry);
  if (next.length <= MAX_FRONTIER) return next;
  const keep: FrontierEntry[] = [];
  const earliest = [...next].sort((left, right) => left.time - right.time)[0];
  keep.push(earliest);
  for (let resourceIndex = 0; resourceIndex < entry.amounts.length; resourceIndex += 1) {
    const richest = [...next].sort(
      (left, right) => right.amounts[resourceIndex] - left.amounts[resourceIndex],
    )[0];
    if (!keep.includes(richest)) keep.push(richest);
    if (keep.length >= MAX_FRONTIER) break;
  }
  for (const candidate of [...next].sort((left, right) => left.time - right.time)) {
    if (!keep.includes(candidate)) keep.push(candidate);
    if (keep.length >= MAX_FRONTIER) break;
  }
  return keep;
}

function optimisticLowerBound(state: PlannerState, context: PlannerContext) {
  if (targetReached(state, context.target)) return 0;
  const action = targetActionCost(state, context.target);
  if (!action) return Number.POSITIVE_INFINITY;
  const missing = Math.max(0, action.cost - amountOf(state, action.resourceId));
  if (missing <= EPSILON) return 0;
  let maximumRate = state.resources.find((resource) => resource.id === action.resourceId)?.baseRate ?? 0;
  for (const factory of state.factories) {
    if (factory.outputResourceId !== action.resourceId) continue;
    let multiplier = state.globalAdMultiplier ?? 1;
    for (const upgrade of state.upgrades) {
      if (!upgrade.purchased && upgrade.targetFactoryId === factory.id && upgrade.multiplier > 1) {
        multiplier *= upgrade.multiplier;
      }
    }
    maximumRate += (context.maxOwned.get(factory.id) ?? factory.owned) * factory.unit * multiplier;
  }
  if (!Number.isFinite(maximumRate)) return 0;
  if (maximumRate <= EPSILON) return Number.POSITIVE_INFINITY;
  return missing / (maximumRate * Math.max(1, context.offlineMultiplier));
}

function isTargetOnly(path: MacroAction[], target: Target) {
  return path.length === 1 && path[0].kind === target.kind && path[0].id === target.id;
}

function targetLabel(target: Target) {
  if (target.kind === 'upgrade') return `先买「${target.label}」`;
  return target.requiredOwned > 1
    ? `先把「${target.label}」补到 ${target.requiredOwned} 台`
    : `先买出「${target.label}」首台`;
}

function emptyResult(target: Target | null, adDoubled: boolean): PlanResult {
  return {
    steps: [],
    complete: !target,
    goal: target ? 'unlock' : 'upgrades',
    goalLabel: target ? targetLabel(target) : '当前配置下已经没有待完成目标',
    total: 0,
    strategy: 'search',
    offlineBlocks: 0,
    onlineTime: 0,
    offlineTime: 0,
    baselineTotal: 0,
    adDoubled,
  };
}

/**
 * 有界分段规划：直接目标计划保底，批量宏和多步贪心补全发现延迟收益，
 * Beam 在固定预算内改进；最终所有宏都重放成逐台可执行步骤。
 */
export function planStateSpace(
  input: PlannerState,
  offlineRate = 1,
  options: {
    adDoubling?: boolean;
    /** @deprecated 统一搜索不再分 direct/full 两遍。 */
    directOnly?: boolean;
    /** @deprecated 统一搜索不再分 direct/full 两遍。 */
    fullOnly?: boolean;
  } = {},
): PlanResult {
  const offlineMultiplier =
    (Number.isFinite(offlineRate) && offlineRate > 0 ? offlineRate : 1) *
    (options.adDoubling ? 2 : 1);
  const target = nextTarget(input);
  if (!target) return emptyResult(null, options.adDoubling === true);
  const context = buildContext(input, target, offlineMultiplier);
  const budget: SearchBudget = {
    deadline: Date.now() + SEARCH_TIME_BUDGET_MS,
    simulations: 0,
  };
  let best: Incumbent | null = null;
  const consider = (candidate: Incumbent | null) => {
    if (!candidate || !Number.isFinite(candidate.cursor.time)) return;
    if (
      !best ||
      candidate.cursor.time < best.cursor.time - EPSILON ||
      (Math.abs(candidate.cursor.time - best.cursor.time) <= EPSILON &&
        candidate.path.length < best.path.length)
    ) {
      best = candidate;
    }
  };

  // 无投资直接计划是独立的 anytime 保底，不与完整链搜索竞争节点预算。
  let direct: Incumbent | null = null;
  for (const action of targetMacros(input, context)) {
    const replay = replayPath(input, [action], offlineMultiplier);
    if (!replay || !targetReached(replay.state, target)) continue;
    const candidate = { path: [action], cursor: replay.cursor };
    consider(candidate);
    if (!direct || candidate.cursor.time < direct.cursor.time) direct = candidate;
  }

  consider(greedyComplete(input, emptyCursor(), [], context, budget));

  // 强制首动作后的完整补全：即使投资让目标暂时变晚，也能通过后续升级证明价值。
  const rootActionMap = new Map<string, MacroAction>();
  for (const action of generateActions(input, context, 2)) {
    if (action.kind !== 'factory' || action.id === target.id) continue;
    // 每个工厂/等待模式只强制评估最有覆盖力的批量；单台和其余档位交给 Beam。
    rootActionMap.set(`${action.id}:${action.offline ? 1 : 0}`, action);
  }
  for (const action of rootActionMap.values()) {
    if (budget.simulations >= MAX_SIMULATIONS || Date.now() > budget.deadline) break;
    const result = simulate(input, emptyCursor(), action, context, budget);
    if (!result) continue;
    if (targetReached(result.state, target)) consider({ path: [action], cursor: result.cursor });
    else consider(greedyComplete(result.state, result.cursor, [action], context, budget));
  }

  let beam: SearchNode[] = [
    {
      state: input,
      cursor: emptyCursor(),
      path: [],
      score: targetWaitEstimate(input, target, offlineMultiplier),
    },
  ];
  const frontiers = new Map<string, FrontierEntry[]>();

  for (let depth = 0; depth < MAX_MACRO_DEPTH && beam.length > 0; depth += 1) {
    if (budget.simulations >= MAX_SIMULATIONS || Date.now() > budget.deadline) break;
    const children: SearchNode[] = [];
    for (const node of beam) {
      for (const action of generateActions(node.state, context, 4)) {
        const result = simulate(node.state, node.cursor, action, context, budget);
        if (!result) continue;
        const path = [...node.path, action];
        if (targetReached(result.state, target)) {
          consider({ path, cursor: result.cursor });
          continue;
        }
        if (
          best &&
          result.cursor.time + optimisticLowerBound(result.state, context) >= best.cursor.time - EPSILON
        ) {
          continue;
        }
        const key = configKey(result.state);
        const frontier = frontiers.get(key) ?? [];
        if (dominates(frontier, result.state, result.cursor)) continue;
        frontiers.set(key, addFrontier(frontier, result));
        children.push({
          state: result.state,
          cursor: result.cursor,
          path,
          score:
            result.cursor.time +
            targetWaitEstimate(result.state, target, offlineMultiplier),
        });
      }
      if (budget.simulations >= MAX_SIMULATIONS || Date.now() > budget.deadline) break;
    }
    if (children.length === 0) break;
    children.sort((left, right) => left.score - right.score || left.cursor.time - right.cursor.time);

    // 保留每种末动作的代表，避免所有宽度都被直接生产者的微小变体占满。
    const nextBeam: SearchNode[] = [];
    const actionKinds = new Set<string>();
    for (const child of children) {
      const action = child.path.at(-1)!;
      const key = `${action.kind}:${action.id}`;
      if (actionKinds.has(key)) continue;
      actionKinds.add(key);
      nextBeam.push(child);
      if (nextBeam.length >= MAX_BEAM_WIDTH) break;
    }
    for (const child of children) {
      if (!nextBeam.includes(child)) nextBeam.push(child);
      if (nextBeam.length >= MAX_BEAM_WIDTH) break;
    }
    beam = nextBeam;

    for (const node of beam.slice(0, MAX_ROLLOUTS_PER_DEPTH)) {
      consider(greedyComplete(node.state, node.cursor, node.path, context, budget));
      if (budget.simulations >= MAX_SIMULATIONS || Date.now() > budget.deadline) break;
    }
  }

  let chosen = best ?? direct;
  if (chosen && direct && !isTargetOnly(chosen.path, target)) {
    const gain = direct.cursor.time - chosen.cursor.time;
    const minimumGain = Math.max(5, direct.cursor.time * 0.005);
    if (gain < minimumGain) chosen = direct;
  }
  if (!chosen) return emptyResult(target, options.adDoubling === true);

  const replay = replayPath(input, chosen.path, offlineMultiplier, true);
  if (!replay || !targetReached(replay.state, target)) return emptyResult(target, options.adDoubling === true);
  return {
    steps: replay.steps,
    complete: false,
    goal: 'unlock',
    goalLabel: targetLabel(target),
    total: replay.cursor.time,
    strategy: 'search',
    offlineBlocks: replay.cursor.offlineBlocks,
    onlineTime: replay.cursor.onlineTime,
    offlineTime: replay.cursor.offlineTime,
    baselineTotal: direct?.cursor.time ?? replay.cursor.time,
    adDoubled: options.adDoubling === true,
  };
}
