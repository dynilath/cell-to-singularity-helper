import type { PlanStep, Requirement, SimulationState } from '../types.ts';

export const OFFLINE_CHUNK_SECONDS = 180;
const EPSILON = 1e-9;

export interface PlannerState extends SimulationState {
  time?: number;
}

export interface MacroAction {
  kind: 'factory' | 'upgrade';
  id: string;
  count: number;
  offline: boolean;
}

export interface PlanCursor {
  time: number;
  offlineBlocks: number;
  onlineTime: number;
  offlineTime: number;
}

export interface ReplayResult {
  state: PlannerState;
  cursor: PlanCursor;
  steps: PlanStep[];
}

export interface WaitChoice {
  seconds: number;
  offline: boolean;
}

export function emptyCursor(): PlanCursor {
  return { time: 0, offlineBlocks: 0, onlineTime: 0, offlineTime: 0 };
}

export function cloneState(input: PlannerState): PlannerState {
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

export function ratesOf(state: PlannerState) {
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

export function amountOf(state: PlannerState, resourceId: string) {
  return state.resources.find((resource) => resource.id === resourceId)?.amount ?? 0;
}

export function requirementMet(state: PlannerState, requires?: Requirement | null) {
  if (!requires) return true;
  if (requires.type === 'factory') {
    return (
      (state.factories.find((factory) => factory.id === requires.id)?.owned ?? 0) >=
      Math.max(1, requires.owned ?? 1)
    );
  }
  return state.completedUpgrades.has(requires.id);
}

export function factoryActionable(state: PlannerState, factoryId: string) {
  const factory = state.factories.find((item) => item.id === factoryId);
  return !!factory && (factory.owned > 0 || requirementMet(state, factory.requires));
}

export function upgradeActionable(state: PlannerState, upgradeId: string) {
  const upgrade = state.upgrades.find((item) => item.id === upgradeId);
  if (!upgrade || upgrade.purchased) return false;
  const target = state.factories.find((factory) => factory.id === upgrade.targetFactoryId);
  return !!target && target.owned >= 1 && requirementMet(state, upgrade.requires);
}

function tolerance(cost: number) {
  return Math.max(EPSILON, cost * 1e-12);
}

export function waitForResource(
  state: PlannerState,
  rates: Map<string, number>,
  resourceId: string,
  cost: number,
  offlineMultiplier: number,
): { online: WaitChoice; offline: WaitChoice | null } | null {
  const missing = cost - amountOf(state, resourceId);
  if (missing <= tolerance(cost)) {
    return { online: { seconds: 0, offline: false }, offline: null };
  }
  const rate = rates.get(resourceId) ?? 0;
  if (rate <= EPSILON) return null;
  const onlineSeconds = missing / rate;
  const offlineSeconds =
    Math.ceil(missing / (rate * offlineMultiplier) / OFFLINE_CHUNK_SECONDS) *
    OFFLINE_CHUNK_SECONDS;
  if (!Number.isFinite(onlineSeconds) || !Number.isFinite(offlineSeconds)) return null;
  return {
    online: { seconds: onlineSeconds, offline: false },
    offline: { seconds: offlineSeconds, offline: true },
  };
}

function advance(state: PlannerState, rates: Map<string, number>, seconds: number, multiplier: number) {
  if (seconds <= 0) return true;
  for (const resource of state.resources) {
    resource.amount += (rates.get(resource.id) ?? 0) * seconds * multiplier;
    if (!Number.isFinite(resource.amount)) return false;
  }
  return true;
}

export function buyFactory(state: PlannerState, factoryId: string) {
  const factory = state.factories.find((item) => item.id === factoryId);
  if (!factory || !factoryActionable(state, factoryId)) return false;
  const resource = state.resources.find((item) => item.id === factory.costResourceId);
  if (!resource || resource.amount < factory.price - tolerance(factory.price)) return false;
  resource.amount = Math.max(0, resource.amount - factory.price);
  factory.owned += 1;
  factory.price *= factory.growth;
  return Number.isFinite(factory.price);
}

export function buyUpgrade(state: PlannerState, upgradeId: string) {
  const upgrade = state.upgrades.find((item) => item.id === upgradeId);
  if (!upgrade || !upgradeActionable(state, upgradeId)) return false;
  const resource = state.resources.find((item) => item.id === upgrade.costResourceId);
  if (!resource || resource.amount < upgrade.cost - tolerance(upgrade.cost)) return false;
  resource.amount = Math.max(0, resource.amount - upgrade.cost);
  upgrade.purchased = true;
  state.completedUpgrades.add(upgrade.id);
  const target = state.factories.find((factory) => factory.id === upgrade.targetFactoryId);
  if (target) target.unit *= upgrade.multiplier;
  return Number.isFinite(target?.unit ?? 1);
}

function factoryStep(state: PlannerState, factoryId: string, cursor: PlanCursor, wait: WaitChoice | null): PlanStep {
  const factory = state.factories.find((item) => item.id === factoryId)!;
  const offline = wait?.offline === true;
  return {
    type: 'buy',
    factoryId,
    label: factory.label,
    nth: factory.owned,
    price: factory.price / factory.growth,
    resourceId: factory.costResourceId,
    resourceName:
      state.resources.find((resource) => resource.id === factory.costResourceId)?.emoji ?? '资源',
    t: cursor.time,
    offline,
    offlineBlock: offline ? cursor.offlineBlocks : 0,
    offlineWait: offline ? wait.seconds : 0,
  };
}

function upgradeStep(state: PlannerState, upgradeId: string, cursor: PlanCursor, wait: WaitChoice | null): PlanStep {
  const upgrade = state.upgrades.find((item) => item.id === upgradeId)!;
  const offline = wait?.offline === true;
  return {
    type: 'upgrade',
    upgradeId,
    label: upgrade.label,
    cost: upgrade.cost,
    resourceId: upgrade.costResourceId,
    resourceName:
      state.resources.find((resource) => resource.id === upgrade.costResourceId)?.emoji ?? '资源',
    t: cursor.time,
    offline,
    offlineBlock: offline ? cursor.offlineBlocks : 0,
    offlineWait: offline ? wait.seconds : 0,
  };
}

function applyWait(
  state: PlannerState,
  cursor: PlanCursor,
  wait: WaitChoice,
  offlineMultiplier: number,
) {
  const rates = ratesOf(state);
  if (!advance(state, rates, wait.seconds, wait.offline ? offlineMultiplier : 1)) return false;
  cursor.time += wait.seconds;
  if (wait.offline && wait.seconds > 0) {
    cursor.offlineBlocks += 1;
    cursor.offlineTime += wait.seconds;
  } else {
    cursor.onlineTime += wait.seconds;
  }
  return true;
}

/**
 * 重放一个宏动作。工厂宏内部仍逐台等待、购买和更新产出；
 * 离线宏每次回来后连续买下当前可负担的计划内工厂，只计一段离线。
 */
export function replayAction(
  input: PlannerState,
  inputCursor: PlanCursor,
  action: MacroAction,
  offlineMultiplier: number,
  includeSteps = false,
): ReplayResult | null {
  const state = cloneState(input);
  const cursor = { ...inputCursor };
  const steps: PlanStep[] = [];
  if (!Number.isInteger(action.count) || action.count < 1) return null;

  if (action.kind === 'upgrade') {
    if (action.count !== 1) return null;
    const upgrade = state.upgrades.find((item) => item.id === action.id);
    if (!upgrade || !upgradeActionable(state, action.id)) return null;
    const waits = waitForResource(
      state,
      ratesOf(state),
      upgrade.costResourceId,
      upgrade.cost,
      offlineMultiplier,
    );
    if (!waits) return null;
    const wait = action.offline ? (waits.offline ?? waits.online) : waits.online;
    if (!applyWait(state, cursor, wait, offlineMultiplier) || !buyUpgrade(state, action.id)) {
      return null;
    }
    if (includeSteps) steps.push(upgradeStep(state, action.id, cursor, wait.seconds > 0 ? wait : null));
    return { state, cursor, steps };
  }

  if (!factoryActionable(state, action.id)) return null;
  let bought = 0;
  while (bought < action.count) {
    const factory = state.factories.find((item) => item.id === action.id);
    if (!factory) return null;
    const waits = waitForResource(
      state,
      ratesOf(state),
      factory.costResourceId,
      factory.price,
      offlineMultiplier,
    );
    if (!waits) return null;
    const wait = action.offline ? (waits.offline ?? waits.online) : waits.online;
    if (!applyWait(state, cursor, wait, offlineMultiplier)) return null;

    // 在线宏每轮买一台；离线宏在同一次回来后把可负担的计划内工厂连续买完。
    do {
      const current = state.factories.find((item) => item.id === action.id)!;
      const price = current.price;
      if (!buyFactory(state, action.id)) break;
      bought += 1;
      if (includeSteps) {
        const step = factoryStep(state, action.id, cursor, wait.seconds > 0 ? wait : null);
        step.price = price;
        steps.push(step);
      }
    } while (action.offline && bought < action.count);
  }
  return { state, cursor, steps };
}

export function replayPath(
  input: PlannerState,
  path: readonly MacroAction[],
  offlineMultiplier: number,
  includeSteps = false,
): ReplayResult | null {
  let state = cloneState(input);
  let cursor = emptyCursor();
  const steps: PlanStep[] = [];
  for (const action of path) {
    const result = replayAction(state, cursor, action, offlineMultiplier, includeSteps);
    if (!result) return null;
    state = result.state;
    cursor = result.cursor;
    if (includeSteps) steps.push(...result.steps);
  }
  return { state, cursor, steps };
}
