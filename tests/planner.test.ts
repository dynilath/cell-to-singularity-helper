import { describe, expect, it } from 'vitest';
import { planExploration, planOfflineExploration } from '../src/core/planner.ts';

function baseState(overrides = {}) {
  return {
    resources: [{ id: 'r', name: '资源1', amount: 0, baseRate: 0 }],
    factories: [
      {
        id: 'f',
        label: '工厂1',
        price: 100,
        unit: 10,
        growth: 2,
        owned: 1,
        outputResourceId: 'r',
        costResourceId: 'r',
      },
    ],
    upgrades: [
      {
        id: 'u',
        label: '升级1',
        cost: 1000,
        costResourceId: 'r',
        targetFactoryId: 'f',
        multiplier: 2,
        purchased: false,
      },
    ],
    ...overrides,
  };
}

describe('planExploration', () => {
  it('buys a useful upgrade before the first new factory when it speeds up the target', () => {
    const state = {
      resources: [{ id: 'r', name: 'r', amount: 0, baseRate: 10 }],
      factories: [
        {
          id: 'producer',
          label: '产出工厂',
          price: 1e15,
          unit: 10,
          growth: 2,
          owned: 1,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
        {
          id: 'target',
          label: '新工厂',
          price: 1000,
          unit: 100,
          growth: 2,
          owned: 0,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
      ],
      upgrades: [
        {
          id: 'boost',
          label: '产出升级',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'producer',
          multiplier: 2,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    };
    const result = planExploration(state);
    expect(result.goal).toBe('new-factory');
    expect(result.steps[0]).toMatchObject({ type: 'upgrade', upgradeId: 'boost' });
    expect(result.steps.some((step) => step.type === 'buy' && step.factoryId === 'target')).toBe(
      true,
    );
  });

  it('buys factories before an upgrade when their payback is faster', () => {
    const result = planExploration(baseState());
    expect(result.complete).toBe(true);
    expect(result.goal).toBe('upgrades');
    expect(result.steps.map((step) => step.type)).toEqual(['buy', 'buy', 'upgrade']);
    expect(result.steps.map((step) => step.nth ?? null)).toEqual([2, 3, null]);
    expect(result.steps.map((step) => step.price ?? step.cost)).toEqual([100, 200, 1000]);
    expect(result.total).toBeCloseTo(53.3333, 3);
  });

  it('finishes immediately when the upgrade is already affordable', () => {
    const result = planExploration(
      baseState({ resources: [{ ...baseState().resources[0], amount: 2000 }] }),
    );
    expect(result.complete).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ type: 'upgrade', cost: 1000, t: 0 });
    expect(result.total).toBe(0);
  });

  it('uses the first zero-owned factory as the goal and stops after its first unit', () => {
    const state = baseState();
    state.factories.push({
      id: 'f2',
      label: '工厂2',
      price: 500,
      unit: 20,
      growth: 2,
      owned: 0,
      outputResourceId: 'r',
      costResourceId: 'r',
    });
    const result = planExploration(state);
    expect(result.goal).toBe('new-factory');
    expect(result.goalLabel).toContain('工厂2');
    expect(result.complete).toBe(true);
    expect(result.steps.at(-1)).toMatchObject({
      type: 'buy',
      factoryId: 'f2',
      nth: 1,
    });
    expect(result.steps.some((step) => step.type === 'upgrade')).toBe(false);
  });

  it('completes multiple upgrades and applies their multipliers', () => {
    const state = baseState({
      resources: [{ ...baseState().resources[0], amount: 100 }],
      factories: [{ ...baseState().factories[0], owned: 2 }],
      upgrades: [
        {
          id: 'u1',
          label: '升级1',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 2,
          purchased: false,
        },
        {
          id: 'u2',
          label: '升级2',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 3,
          purchased: false,
        },
      ],
    });
    const result = planExploration(state);
    expect(result.complete).toBe(true);
    expect(result.steps.filter((step) => step.type === 'upgrade')).toHaveLength(2);
    expect(result.goalLabel).toContain('2 个升级');
  });

  it('supports separate output and cost resources', () => {
    const state = {
      resources: [
        { id: 'a', emoji: '🌱', name: 'A', amount: 0, baseRate: 10 },
        { id: 'b', emoji: '⚡', name: 'B', amount: 0, baseRate: 0 },
      ],
      factories: [
        {
          id: 'fa',
          label: '工厂A',
          price: 100,
          unit: 10,
          growth: 2,
          owned: 1,
          outputResourceId: 'b',
          costResourceId: 'a',
        },
      ],
      upgrades: [
        {
          id: 'u',
          label: '升级1',
          cost: 1000,
          costResourceId: 'b',
          targetFactoryId: 'fa',
          multiplier: 2,
          purchased: false,
        },
      ],
    };
    const result = planExploration(state);
    expect(result.complete).toBe(true);
    expect(result.steps[0]).toMatchObject({ type: 'buy', resourceName: '🌱' });
    expect(result.steps.at(-1)).toMatchObject({ type: 'upgrade', resourceName: '⚡' });
  });

  it('looks ahead across multiple upgrades instead of only the next one', () => {
    const state = {
      resources: [{ id: 'r', emoji: '🌱', name: 'r', amount: 405, baseRate: 0 }],
      factories: [
        {
          id: 'f',
          label: '工厂1',
          price: 290,
          unit: 10,
          growth: 1.2416585807858997,
          owned: 1,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
      ],
      upgrades: [
        {
          id: 'u1',
          label: '升级1',
          cost: 1077,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 2.0387236682876098,
          purchased: false,
        },
        {
          id: 'u2',
          label: '升级2',
          cost: 1313,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 4.273037180583431,
          purchased: false,
        },
      ],
    };
    const result = planExploration(state);
    expect(result.complete).toBe(true);
    expect(result.steps.map((step) => step.type)).toEqual([
      'buy',
      'buy',
      'upgrade',
      'upgrade',
    ]);
    expect(result.total).toBeCloseTo(64.422234, 3);
  });

  it('respects upgrade prerequisites in the planned order', () => {
    const result = planExploration({
      resources: [{ id: 'r', name: 'r', amount: 5000, baseRate: 0 }],
      factories: [
        {
          id: 'f',
          label: '工厂1',
          price: 100,
          unit: 10,
          growth: 2,
          owned: 1,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
      ],
      upgrades: [
        {
          id: 'u1',
          label: '前置升级',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 2,
          purchased: false,
        },
        {
          id: 'u2',
          label: '依赖升级',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 2,
          purchased: false,
          requires: { type: 'upgrade', id: 'u1' },
        },
      ],
      completedUpgrades: new Set(),
    });
    const upgrades = result.steps.filter((step) => step.type === 'upgrade');
    expect(upgrades.map((step) => step.upgradeId)).toEqual(['u1', 'u2']);
  });

  it('uses online wait when an offline session would be under one minute', () => {
    const state = {
      resources: [{ id: 'r', name: 'r', amount: 0, baseRate: 10 }],
      factories: [
        {
          id: 'f',
          label: '工厂1',
          price: 1e15,
          unit: 1,
          growth: 2,
          owned: 1,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
      ],
      upgrades: [
        {
          id: 'u',
          label: '升级1',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 2,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    };
    const offline = planOfflineExploration(state, 2.1);
    expect(offline.steps).toHaveLength(1);
    expect(offline.steps[0].offline).toBe(false);
    expect(offline.offlineBlocks).toBe(0);
    expect(offline.total).toBeCloseTo(100 / 11, 6);
  });

  it('does not use offline for a wait shorter than one 3-minute chunk', () => {
    const state = {
      resources: [{ id: 'r', name: 'r', amount: 0, baseRate: 10 }],
      factories: [
        {
          id: 'f',
          label: '工厂1',
          price: 1e15,
          unit: 10,
          growth: 2,
          owned: 1,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
      ],
      upgrades: [
        {
          id: 'u1',
          label: '升级1',
          cost: 1000,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 1,
          purchased: false,
        },
        {
          id: 'u2',
          label: '升级2',
          cost: 1000,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 1,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    };
    const online = planExploration(state);
    const offline = planOfflineExploration(state, 2.1);
    expect(offline.steps).toHaveLength(2);
    expect(offline.offlineBlocks).toBe(0);
    expect(offline.steps[0].offline).toBe(false);
    expect(offline.steps[1].offline).toBe(false);
    expect(offline.total).toBeCloseTo(100, 6);
    expect(offline.total).toBeCloseTo(online.total, 6);
  });

  it('merges equal-time multi-resource batches without pretending they are offline', () => {
    const state = {
      resources: [
        { id: 'a', name: 'A', amount: 0, baseRate: 0 },
        { id: 'b', name: 'B', amount: 0, baseRate: 0 },
      ],
      factories: [
        {
          id: 'fa',
          label: 'A工厂',
          price: 1e15,
          unit: 10,
          growth: 2,
          owned: 1,
          outputResourceId: 'a',
          costResourceId: 'a',
        },
        {
          id: 'fb',
          label: 'B工厂',
          price: 1e15,
          unit: 10,
          growth: 2,
          owned: 1,
          outputResourceId: 'b',
          costResourceId: 'b',
        },
      ],
      upgrades: [
        {
          id: 'ua',
          label: 'A升级',
          cost: 100,
          costResourceId: 'a',
          targetFactoryId: 'fa',
          multiplier: 1,
          purchased: false,
        },
        {
          id: 'ub',
          label: 'B升级',
          cost: 1000,
          costResourceId: 'b',
          targetFactoryId: 'fb',
          multiplier: 1,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    };
    const offline = planOfflineExploration(state, 2.1);
    expect(offline.steps).toHaveLength(2);
    expect(offline.offlineBlocks).toBe(0);
    expect(offline.steps[0].offline).toBe(false);
    expect(offline.steps[1].offline).toBe(false);
    expect(offline.total).toBeCloseTo(100, 6);
  });

  it('splits multi-resource offline waits when an early upgrade boosts the other resource', () => {
    const state = {
      resources: [
        { id: 'a', name: 'A', amount: 0, baseRate: 0 },
        { id: 'b', name: 'B', amount: 0, baseRate: 0 },
      ],
      factories: [
        {
          id: 'fa',
          label: 'A工厂',
          price: 1e15,
          unit: 10,
          growth: 2,
          owned: 1,
          outputResourceId: 'a',
          costResourceId: 'a',
        },
        {
          id: 'fb',
          label: 'B工厂',
          price: 1e15,
          unit: 10,
          growth: 2,
          owned: 1,
          outputResourceId: 'b',
          costResourceId: 'b',
        },
      ],
      upgrades: [
        {
          id: 'ua',
          label: 'A升级',
          cost: 1000,
          costResourceId: 'a',
          targetFactoryId: 'fb',
          multiplier: 2,
          purchased: false,
        },
        {
          id: 'ub',
          label: 'B升级',
          cost: 20000,
          costResourceId: 'b',
          targetFactoryId: 'fa',
          multiplier: 1,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    };
    const offline = planOfflineExploration(state, 2.1);
    expect(offline.steps).toHaveLength(2);
    expect(offline.offlineBlocks).toBe(1);
    expect(offline.steps[0].offline).toBe(false);
    expect(offline.steps[0].t).toBeCloseTo(100, 6);
    expect(offline.steps[1].offline).toBe(true);
    expect(offline.steps[1].offlineWait).toBeCloseTo(540, 6);
    expect(offline.total).toBeCloseTo(640, 6);
    expect(offline.total).toBeLessThan(20000 / 20);
  });

  it('falls back to the nearest actionable prerequisite when the full goal is blocked', () => {
    const state = {
      resources: [{ id: 'r', name: 'r', amount: 0, baseRate: 10 }],
      factories: [
        {
          id: 'a',
          label: '基础工厂',
          price: 1e15,
          unit: 1,
          growth: 2,
          owned: 1,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
        {
          id: 'b',
          label: '可解锁工厂',
          price: 1000,
          unit: 1,
          growth: 2,
          owned: 0,
          outputResourceId: 'r',
          costResourceId: 'r',
          requires: { type: 'upgrade', id: 'u1' },
        },
        {
          id: 'c',
          label: '死锁工厂',
          price: 1000,
          unit: 1,
          growth: 2,
          owned: 0,
          outputResourceId: 'r',
          costResourceId: 'r',
          requires: { type: 'upgrade', id: 'u2' },
        },
      ],
      upgrades: [
        {
          id: 'u1',
          label: '前置升级',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'a',
          multiplier: 1,
          purchased: false,
        },
        {
          id: 'u2',
          label: '死锁升级',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'c',
          multiplier: 1,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    };
    const result = planExploration(state);
    expect(result.goal).toBe('unlock');
    expect(result.complete).toBe(false);
    expect(result.steps[0]).toMatchObject({ type: 'upgrade', upgradeId: 'u1' });
  });

  it('buys an affordable next factory immediately instead of delaying it into a batch', () => {
    const state = {
      resources: [{ id: 'r', name: 'r', amount: 4.94e13, baseRate: 0 }],
      factories: [
        {
          id: 'lung',
          label: '肺',
          price: 2.66e13,
          unit: 1e12,
          growth: 1.15,
          owned: 7,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
      ],
      upgrades: [
        {
          id: 'u',
          label: '目标升级',
          cost: 1e16,
          costResourceId: 'r',
          targetFactoryId: 'lung',
          multiplier: 2,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    };
    const result = planOfflineExploration(state, 2, { adDoubling: true });
    expect(result.steps[0]).toMatchObject({ label: '肺', t: 0, offline: false });
    expect(result.steps[1].t).toBeGreaterThan(0);
  });

  it('inserts a factory purchase at a 3-minute checkpoint before a long upgrade wait', () => {
    const state = {
      resources: [{ id: 'r', name: 'r', amount: 2e8, baseRate: 0 }],
      factories: [
        {
          id: 'deep',
          label: '深不可测',
          price: 7.23e16,
          unit: 1.67e13,
          growth: 1.15,
          owned: 131,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
        {
          id: 'weird',
          label: '诡异生物',
          price: 9.67e15,
          unit: 3.53e11,
          growth: 1.15,
          owned: 171,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
        {
          id: 'sly',
          label: '阴险者',
          price: 6.65e13,
          unit: 4.59e9,
          growth: 1.15,
          owned: 175,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
      ],
      upgrades: [
        {
          id: 'big',
          label: '大脚怪',
          cost: 1.6e19,
          costResourceId: 'r',
          targetFactoryId: 'weird',
          multiplier: 2,
          purchased: false,
        },
        {
          id: 'jim',
          label: 'Jimothy',
          cost: 1.6e19,
          costResourceId: 'r',
          targetFactoryId: 'deep',
          multiplier: 2,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    };
    const result = planOfflineExploration(state, 2, { adDoubling: true });
    const bigIndex = result.steps.findIndex((step) => step.upgradeId === 'big');
    expect(bigIndex).toBeGreaterThan(0);
    expect(
      result.steps.slice(0, bigIndex).some((step) => step.type === 'buy' && step.offline),
    ).toBe(true);
    expect(result.steps[0].t).toBeGreaterThanOrEqual(180);
  });

  it('does not create an offline segment for a sub-second wait', () => {
    const state = {
      resources: [{ id: 'r', name: 'r', amount: 0, baseRate: 1000 }],
      factories: [
        {
          id: 'f',
          label: '工厂1',
          price: 1e15,
          unit: 1,
          growth: 2,
          owned: 1,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
      ],
      upgrades: [
        {
          id: 'u',
          label: '升级1',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'f',
          multiplier: 2,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    };
    const offline = planOfflineExploration(state, 1);
    expect(offline.steps).toHaveLength(1);
    expect(offline.steps[0].offline).toBe(false);
    expect(offline.offlineBlocks).toBe(0);
    expect(offline.total).toBeLessThan(1);
  });

  it('falls back to upgrades when the only zero-owned factories are locked', () => {
    const result = planExploration({
      resources: [{ id: 'r', name: 'r', amount: 1000, baseRate: 10 }],
      factories: [
        {
          id: 'f1',
          label: '工厂1',
          price: 1e15,
          unit: 10,
          growth: 2,
          owned: 1,
          outputResourceId: 'r',
          costResourceId: 'r',
        },
        {
          id: 'f2',
          label: '工厂2',
          price: 100,
          unit: 10,
          growth: 2,
          owned: 0,
          outputResourceId: 'r',
          costResourceId: 'r',
          requires: { type: 'upgrade', id: 'u1' },
        },
      ],
      upgrades: [
        {
          id: 'u1',
          label: '前置升级',
          cost: 100,
          costResourceId: 'r',
          targetFactoryId: 'f1',
          multiplier: 2,
          purchased: false,
        },
      ],
      completedUpgrades: new Set(),
    });
    expect(result.goal).toBe('upgrades');
    expect(result.complete).toBe(true);
    expect(result.steps.some((step) => step.upgradeId === 'u1')).toBe(true);
  });

  it('reports completion with no upgrades', () => {
    const result = planExploration(baseState({ upgrades: [] }));
    expect(result.complete).toBe(true);
    expect(result.steps).toEqual([]);
    expect(result.goalLabel).toBe('没有配置升级');
  });

  it('does not mutate the input state', () => {
    const state = baseState();
    planExploration(state);
    expect(state.resources[0].amount).toBe(0);
    expect(state.factories[0].owned).toBe(1);
    expect(state.factories[0].price).toBe(100);
    expect(state.upgrades[0].purchased).toBe(false);
  });
});
