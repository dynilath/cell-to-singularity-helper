/**
 * 小型规划算法基准：对比当前规划器与事件图 Dijkstra / A*。
 *
 * 运行：npm run bench
 *
 * 事件图把“等待到某个目标可买，然后买它”当作边；已经买得起的目标
 * 作为 0 秒边。离线段只允许完整的 3 分钟块。场景规模很小，用于观察
 * 当前启发式与短路径算法之间的差距，不作为生产状态规模下的性能结论。
 */

import { performance } from 'node:perf_hooks';
import { planExploration, planOfflineExploration } from '../src/core/planner.ts';
import type {
  FactoryState,
  Requirement,
  SimulationState,
  UpgradeState,
} from '../src/types.ts';

type Scenario = { name: string; state: SimulationState };

function factory(
  id: string,
  label: string,
  price: number,
  unit: number,
  owned: number,
  options: Partial<FactoryState> = {},
): FactoryState {
  return {
    id,
    label,
    price,
    unit,
    growth: 1.15,
    owned,
    outputResourceId: 'r',
    costResourceId: 'r',
    ...options,
  };
}

function upgrade(
  id: string,
  label: string,
  cost: number,
  targetFactoryId: string,
  multiplier: number,
  options: Partial<UpgradeState> = {},
): UpgradeState {
  return {
    id,
    label,
    cost,
    costResourceId: 'r',
    targetFactoryId,
    multiplier,
    purchased: false,
    ...options,
  };
}

function oneResource(
  amount: number,
  baseRate: number,
  factories: FactoryState[],
  upgrades: UpgradeState[],
): SimulationState {
  return {
    resources: [{ id: 'r', emoji: '🔥', amount, baseRate }],
    factories,
    upgrades,
    completedUpgrades: new Set(),
    globalAdMultiplier: 1,
  };
}

const scenarios: Scenario[] = [
  {
    name: '简单升级',
    state: oneResource(0, 10, [factory('a', 'A', 1e15, 1, 1)], [
      upgrade('u', '升级', 1000, 'a', 2),
    ]),
  },
  {
    name: '先补工厂再升级',
    state: oneResource(0, 1, [factory('a', 'A', 100, 2, 1)], [
      upgrade('u', '升级', 10000, 'a', 2),
    ]),
  },
  {
    name: '两台工厂/两个升级',
    state: oneResource(100, 5, [
      factory('a', 'A', 80, 2, 1),
      factory('b', 'B', 500, 8, 1),
    ], [
      upgrade('ua', 'A升级', 3000, 'a', 2),
      upgrade('ub', 'B升级', 12000, 'b', 3),
    ]),
  },
  {
    name: '肺：已买得起第一台',
    state: oneResource(4.94e13, 0, [factory('lung', '肺', 2.66e13, 1e12, 7)], [
      upgrade('u', '目标升级', 1e16, 'lung', 2),
    ]),
  },
  {
    name: '多资源工厂',
    state: {
      resources: [
        { id: 'a', emoji: '🔵', amount: 0, baseRate: 0 },
        { id: 'b', emoji: '🔴', amount: 0, baseRate: 0 },
      ],
      factories: [
        factory('fa', 'A工厂', 1000, 10, 1, {
          costResourceId: 'a',
          outputResourceId: 'b',
        }),
        factory('fb', 'B工厂', 500, 5, 1, {
          costResourceId: 'b',
          outputResourceId: 'a',
        }),
      ],
      upgrades: [
        upgrade('ua', 'A升级', 20000, 'fa', 2, { costResourceId: 'b' }),
        upgrade('ub', 'B升级', 5000, 'fb', 2, { costResourceId: 'a' }),
      ],
      completedUpgrades: new Set(),
      globalAdMultiplier: 1,
    },
  },
  {
    name: '前置解锁链',
    state: oneResource(
      0,
      2,
      [
        factory('f0', '基础工厂', 100, 2, 1),
        factory('f1', '进阶工厂', 2000, 10, 0, {
          requires: { type: 'upgrade', id: 'u1' },
        }),
      ],
      [
        upgrade('u1', '解锁升级', 500, 'f0', 2, {
          requires: { type: 'factory', id: 'f0' },
        }),
        upgrade('u2', '进阶升级', 5000, 'f1', 2, {
          requires: { type: 'factory', id: 'f1' },
        }),
        upgrade('u3', '最终升级', 50000, 'f0', 2, {
          requires: { type: 'upgrade', id: 'u2' },
        }),
      ],
    ),
  },
];

function clone(state: SimulationState): SimulationState {
  return {
    resources: state.resources.map((resource) => ({ ...resource })),
    factories: state.factories.map((item) => ({ ...item })),
    upgrades: state.upgrades.map((item) => ({ ...item })),
    completedUpgrades: new Set(state.completedUpgrades),
    globalAdMultiplier: state.globalAdMultiplier ?? 1,
  };
}

function requirementMet(state: SimulationState, requires?: Requirement | null) {
  if (!requires) return true;
  if (requires.type === 'factory') {
    const owned = state.factories.find((item) => item.id === requires.id)?.owned ?? 0;
    return owned >= Math.max(1, requires.owned ?? 1);
  }
  return state.completedUpgrades.has(requires.id);
}

function factoryActionable(state: SimulationState, item: FactoryState) {
  return item.owned > 0 || requirementMet(state, item.requires);
}

function upgradeActionable(state: SimulationState, item: UpgradeState) {
  const target = state.factories.find((factory) => factory.id === item.targetFactoryId);
  return !!target && target.owned >= 1 && requirementMet(state, item.requires);
}

function rates(state: SimulationState) {
  const map = new Map(state.resources.map((resource) => [resource.id, resource.baseRate]));
  for (const item of state.factories) {
    if (item.owned <= 0 || item.unit <= 0) continue;
    map.set(
      item.outputResourceId,
      (map.get(item.outputResourceId) ?? 0) + item.owned * item.unit,
    );
  }
  for (const [id, value] of map) {
    map.set(id, value * (state.globalAdMultiplier ?? 1));
  }
  return map;
}

function goalReached(state: SimulationState) {
  return state.upgrades.every((item) => item.purchased);
}

function waitTime(state: SimulationState, resourceCosts: Map<string, number>) {
  const map = rates(state);
  let seconds = 0;
  for (const [resourceId, cost] of resourceCosts) {
    const amount = state.resources.find((resource) => resource.id === resourceId)?.amount ?? 0;
    const missing = cost - amount;
    if (missing <= 1e-9) continue;
    const rate = map.get(resourceId) ?? 0;
    if (rate <= 1e-9) return null;
    seconds = Math.max(seconds, missing / rate);
  }
  return seconds;
}

function addIncome(state: SimulationState, seconds: number, multiplier: number) {
  const map = rates(state);
  for (const resource of state.resources) {
    resource.amount += (map.get(resource.id) ?? 0) * seconds * multiplier;
  }
}

function buyFactory(state: SimulationState, factoryId: string) {
  const item = state.factories.find((factory) => factory.id === factoryId);
  if (!item) return false;
  const resource = state.resources.find((entry) => entry.id === item.costResourceId);
  const tolerance = Math.max(1e-9, item.price * 1e-12);
  if (!resource || resource.amount < item.price - tolerance) return false;
  resource.amount -= item.price;
  item.owned += 1;
  item.price *= item.growth;
  return true;
}

function buyUpgrade(state: SimulationState, upgradeId: string) {
  const item = state.upgrades.find((entry) => entry.id === upgradeId);
  if (!item || item.purchased) return false;
  const resource = state.resources.find((entry) => entry.id === item.costResourceId);
  const tolerance = Math.max(1e-9, item.cost * 1e-12);
  if (!resource || resource.amount < item.cost - tolerance) return false;
  resource.amount -= item.cost;
  item.purchased = true;
  state.completedUpgrades.add(item.id);
  const target = state.factories.find((factory) => factory.id === item.targetFactoryId);
  if (target) target.unit *= item.multiplier;
  return true;
}

function key(state: SimulationState) {
  return `${state.factories.map((item) => item.owned).join(',')}|${state.upgrades
    .map((item) => (item.purchased ? 1 : 0))
    .join('')}`;
}

function amounts(state: SimulationState) {
  return state.resources.map((resource) => resource.amount);
}

function dominates(frontier: { time: number; amounts: number[] }[], state: SimulationState, time: number) {
  const values = amounts(state);
  return frontier.some(
    (entry) =>
      entry.time <= time + 1e-9 &&
      entry.amounts.every((amount, index) => amount >= values[index] - 1e-7),
  );
}

function addFrontier(
  frontier: { time: number; amounts: number[] }[],
  state: SimulationState,
  time: number,
) {
  const values = amounts(state);
  const next = frontier.filter(
    (entry) =>
      !(
        time <= entry.time + 1e-9 &&
        values.every((amount, index) => amount >= entry.amounts[index] - 1e-7)
      ),
  );
  next.push({ time, amounts: values });
  return next;
}

function heuristic(state: SimulationState) {
  if (goalReached(state)) return 0;
  const remaining = new Map<string, number>();
  for (const item of state.upgrades) {
    if (item.purchased) continue;
    remaining.set(
      item.costResourceId,
      (remaining.get(item.costResourceId) ?? 0) + item.cost,
    );
  }
  const map = rates(state);
  let bound = 0;
  for (const [resourceId, total] of remaining) {
    const amount = state.resources.find((resource) => resource.id === resourceId)?.amount ?? 0;
    const missing = Math.max(0, total - amount);
    if (missing <= 1e-9) continue;
    let maxRate = map.get(resourceId) ?? 0;
    for (const item of state.factories) {
      if (item.outputResourceId !== resourceId) continue;
      let multiplier = 1;
      for (const upgrade of state.upgrades) {
        if (upgrade.purchased) continue;
        if (upgrade.targetFactoryId === item.id) multiplier *= upgrade.multiplier;
      }
      maxRate += Math.max(0, item.unit) * multiplier;
    }
    if (maxRate <= 1e-9) return Number.POSITIVE_INFINITY;
    bound = Math.max(bound, missing / maxRate);
  }
  return bound;
}

interface Gate {
  key: string;
  label: string;
  kind: 'factory' | 'upgrade';
  id: string;
  owned: number;
}

function extractGates(input: SimulationState): Gate[] {
  const factoryById = new Map(input.factories.map((item) => [item.id, item]));
  const upgradeById = new Map(input.upgrades.map((item) => [item.id, item]));
  const requiredFactories = new Map<string, number>();
  const requiredUpgrades = new Set<string>();

  const addFactory = (id: string, owned: number) => {
    const factory = factoryById.get(id);
    if (!factory) return;
    requiredFactories.set(id, Math.max(requiredFactories.get(id) ?? 1, owned));
    if (factory.requires?.type === 'upgrade') addUpgrade(factory.requires.id);
    if (factory.requires?.type === 'factory') {
      addFactory(factory.requires.id, Math.max(1, factory.requires.owned ?? 1));
    }
  };

  const addUpgrade = (id: string) => {
    if (requiredUpgrades.has(id)) return;
    const item = upgradeById.get(id);
    if (!item) return;
    requiredUpgrades.add(id);
    addFactory(item.targetFactoryId, 1);
    if (item.requires?.type === 'upgrade') addUpgrade(item.requires.id);
    if (item.requires?.type === 'factory') {
      addFactory(item.requires.id, Math.max(1, item.requires.owned ?? 1));
    }
  };

  for (const item of input.upgrades) {
    if (!item.purchased) addUpgrade(item.id);
  }

  const dependencies = new Map<string, Set<string>>();
  const dependents = new Set<string>();
  const addDependency = (from: string, to: string) => {
    if (!dependencies.has(from)) dependencies.set(from, new Set());
    dependencies.get(from).add(to);
    dependents.add(to);
  };

  for (const id of requiredUpgrades) {
    const item = upgradeById.get(id);
    if (!item) continue;
    addDependency(`u:${id}`, `f:${item.targetFactoryId}`);
    if (item.requires?.type === 'upgrade') {
      addDependency(`u:${id}`, `u:${item.requires.id}`);
    } else if (item.requires?.type === 'factory') {
      addDependency(`u:${id}`, `f:${item.requires.id}`);
    }
  }
  for (const [id] of requiredFactories) {
    const item = factoryById.get(id);
    if (!item?.requires) continue;
    if (item.requires.type === 'upgrade') {
      addDependency(`f:${id}`, `u:${item.requires.id}`);
    } else {
      addDependency(`f:${id}`, `f:${item.requires.id}`);
    }
  }

  const gates = new Map<string, Gate>();
  for (const id of requiredUpgrades) {
    const key = `u:${id}`;
    if (!dependents.has(key)) continue;
    const item = upgradeById.get(id);
    if (!item) continue;
    gates.set(key, { key, label: item.label, kind: 'upgrade', id, owned: 1 });
  }
  for (const [id, owned] of requiredFactories) {
    const key = `f:${id}`;
    if (!dependents.has(key)) continue;
    const item = factoryById.get(id);
    if (!item) continue;
    gates.set(key, { key, label: item.label, kind: 'factory', id, owned });
  }

  const ordered: Gate[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (key: string) => {
    if (visited.has(key) || visiting.has(key)) return;
    visiting.add(key);
    for (const dependency of dependencies.get(key) ?? []) {
      if (gates.has(dependency)) visit(dependency);
    }
    visiting.delete(key);
    visited.add(key);
    const gate = gates.get(key);
    if (gate) ordered.push(gate);
  };
  for (const key of [...gates.keys()].sort()) visit(key);
  return ordered;
}

function gateSatisfied(state: SimulationState, gate: Gate) {
  if (gate.kind === 'upgrade') {
    return state.upgrades.find((item) => item.id === gate.id)?.purchased === true;
  }
  return (state.factories.find((item) => item.id === gate.id)?.owned ?? 0) >= gate.owned;
}

interface Node {
  state: SimulationState;
  time: number;
  f: number;
  path: string[];
}

function solve(
  input: SimulationState,
  algorithm: 'dijkstra' | 'astar',
  offlineMultiplier?: number,
  goal: (state: SimulationState) => boolean = goalReached,
) {
  const start = clone(input);
  const heap: Node[] = [
    {
      state: start,
      time: 0,
      f: algorithm === 'astar' ? heuristic(start) : 0,
      path: [],
    },
  ];
  const frontiers = new Map<string, { time: number; amounts: number[] }[]>();
  const started = performance.now();
  let nodes = 0;
  const maxNodes = 120_000;
  const maxFactoryOwned = Math.max(...start.factories.map((item) => item.owned), 0) + 40;

  const push = (node: Node) => {
    heap.push(node);
  };
  const pop = () => {
    let best = 0;
    for (let index = 1; index < heap.length; index += 1) {
      if (heap[index].f < heap[best].f - 1e-9) best = index;
    }
    const [node] = heap.splice(best, 1);
    return node;
  };

  while (heap.length > 0 && nodes < maxNodes) {
    const node = pop();
    if (goal(node.state)) {
      return {
        total: node.time,
        nodes,
        ms: performance.now() - started,
        path: node.path,
        state: node.state,
      };
    }
    nodes += 1;
    const config = key(node.state);
    const frontier = frontiers.get(config) ?? [];
    if (dominates(frontier, node.state, node.time)) continue;
    frontiers.set(config, addFrontier(frontier, node.state, node.time));

    const actionableFactories = node.state.factories.filter(
      (item) => factoryActionable(node.state, item) && item.owned < maxFactoryOwned,
    );
    const actionableUpgrades = node.state.upgrades.filter(
      (item) => !item.purchased && upgradeActionable(node.state, item),
    );

    for (const item of actionableFactories) {
      const resource = node.state.resources.find(
        (entry) => entry.id === item.costResourceId,
      );
      if (!resource) continue;
      const onlineWait = waitTime(node.state, new Map([[item.costResourceId, item.price]]));
      if (onlineWait === null) continue;
      const offlineWait =
        offlineMultiplier && onlineWait > 0
          ? Math.ceil((onlineWait / offlineMultiplier) / 180) * 180
          : null;
      const wait = offlineMultiplier
        ? Math.min(onlineWait, offlineWait ?? Number.POSITIVE_INFINITY)
        : onlineWait;
      if (!Number.isFinite(wait)) continue;
      const next = clone(node.state);
      addIncome(next, wait, offlineMultiplier && offlineWait === wait ? offlineMultiplier : 1);
      if (!buyFactory(next, item.id)) continue;
      const time = node.time + wait;
      push({
        state: next,
        time,
        f: time + (algorithm === 'astar' ? heuristic(next) : 0),
        path: [...node.path, item.label],
      });
    }

    for (const item of actionableUpgrades) {
      const onlineWait = waitTime(node.state, new Map([[item.costResourceId, item.cost]]));
      if (onlineWait === null) continue;
      const offlineWait =
        offlineMultiplier && onlineWait > 0
          ? Math.ceil((onlineWait / offlineMultiplier) / 180) * 180
          : null;
      const wait = offlineMultiplier
        ? Math.min(onlineWait, offlineWait ?? Number.POSITIVE_INFINITY)
        : onlineWait;
      if (!Number.isFinite(wait)) continue;
      const next = clone(node.state);
      addIncome(next, wait, offlineMultiplier && offlineWait === wait ? offlineMultiplier : 1);
      if (!buyUpgrade(next, item.id)) continue;
      const time = node.time + wait;
      push({
        state: next,
        time,
        f: time + (algorithm === 'astar' ? heuristic(next) : 0),
        path: [...node.path, item.label],
      });
    }
  }

  return {
    total: Number.POSITIVE_INFINITY,
    nodes,
    ms: performance.now() - started,
    path: [],
    state: start,
  };
}

function segmentedSolve(input: SimulationState, offlineMultiplier?: number) {
  const gates = extractGates(input);
  let state = clone(input);
  let total = 0;
  let nodes = 0;
  let ms = 0;
  const path: string[] = [];

  for (const gate of gates) {
    if (gateSatisfied(state, gate)) continue;
    const result = solve(
      state,
      'dijkstra',
      offlineMultiplier,
      (candidate) => gateSatisfied(candidate, gate),
    );
    if (!Number.isFinite(result.total)) {
      return { total, nodes, ms, path, gates, failedAt: gate.label };
    }
    state = result.state;
    total += result.total;
    nodes += result.nodes;
    ms += result.ms;
    path.push(...result.path);
  }

  const result = solve(state, 'dijkstra', offlineMultiplier);
  total += result.total;
  nodes += result.nodes;
  ms += result.ms;
  path.push(...result.path);
  return { total, nodes, ms, path, gates };
}

function fmtTime(seconds: number) {  if (!Number.isFinite(seconds)) return '无解';
  if (seconds < 120) return `${seconds.toFixed(2)}s`;
  return `${(seconds / 60).toFixed(2)}m`;
}

function fmtGap(current: number, exact: number) {
  if (!Number.isFinite(current) || !Number.isFinite(exact)) return '-';
  const gap = ((current - exact) / exact) * 100;
  return `${gap >= 0 ? '+' : ''}${gap.toFixed(2)}%`;
}

function printTable(rows: string[][]) {
  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => String(row[index] ?? '').length)),
  );
  for (const row of rows) {
    console.log(
      row.map((cell, index) => String(cell ?? '').padEnd(widths[index])).join('  '),
    );
  }
}

console.log('在线策略');
printTable([
  ['场景', '当前', 'Dijkstra', 'A*', '分段Dijkstra', '当前差距', 'Dijkstra节点', '分段节点'],
  ...scenarios.map((scenario) => {
    const current = planExploration(scenario.state);
    const dijkstra = solve(scenario.state, 'dijkstra');
    const astar = solve(scenario.state, 'astar');
    const segmented = segmentedSolve(scenario.state);
    return [
      scenario.name,
      fmtTime(current.total),
      fmtTime(dijkstra.total),
      fmtTime(astar.total),
      fmtTime(segmented.total),
      fmtGap(current.total, dijkstra.total),
      `${dijkstra.nodes}/${dijkstra.ms.toFixed(1)}ms`,
      `${segmented.nodes}/${segmented.ms.toFixed(1)}ms (${segmented.gates.length}关)`,
    ];
  }),
]);

console.log('\n离线策略（3 分钟块，离线倍率 2，广告 ×2）');
printTable([
  ['场景', '当前', 'Dijkstra', 'A*', '分段Dijkstra', '当前差距', 'Dijkstra节点', '分段节点'],
  ...scenarios.map((scenario) => {
    const current = planOfflineExploration(scenario.state, 2, { adDoubling: true });
    const dijkstra = solve(scenario.state, 'dijkstra', 4);
    const astar = solve(scenario.state, 'astar', 4);
    const segmented = segmentedSolve(scenario.state, 4);
    return [
      scenario.name,
      fmtTime(current.total),
      fmtTime(dijkstra.total),
      fmtTime(astar.total),
      fmtTime(segmented.total),
      fmtGap(current.total, dijkstra.total),
      `${dijkstra.nodes}/${dijkstra.ms.toFixed(1)}ms`,
      `${segmented.nodes}/${segmented.ms.toFixed(1)}ms (${segmented.gates.length}关)`,
    ];
  }),
]);
