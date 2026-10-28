import { describe, expect, it } from 'vitest';
import { planStateSpace } from '../src/core/statePlanner.ts';

function kidneyState() {
  return {
    resources: [
      { id: 'blue', name: '蓝', emoji: '🔵', amount: 5.24e23, baseRate: 1.944e21 },
      { id: 'red', name: '红', emoji: '🔴', amount: 4.2e22, baseRate: 0 },
    ],
    factories: [
      {
        id: 'heart',
        label: '心脏',
        price: 2.25e17,
        unit: 2.49e15,
        growth: 1.15,
        owned: 243,
        outputResourceId: 'red',
        costResourceId: 'blue',
      },
      {
        id: 'kidney',
        label: '肾脏',
        price: 1.15e21,
        unit: 2.54e20,
        growth: 1.15,
        owned: 1,
        outputResourceId: 'blue',
        costResourceId: 'red',
      },
      {
        id: 'liver',
        label: '肝',
        price: 2.4e24,
        unit: 1,
        growth: 1.15,
        owned: 0,
        outputResourceId: 'blue',
        costResourceId: 'red',
      },
      {
        id: 'after-liver',
        label: '后续工厂',
        price: 1,
        unit: 1,
        growth: 1.15,
        owned: 0,
        outputResourceId: 'blue',
        costResourceId: 'red',
        requires: { type: 'factory' as const, id: 'liver', owned: 1 },
      },
    ],
    upgrades: [
      {
        id: 'left-ventricle',
        label: '左心室',
        cost: 1.2e26,
        costResourceId: 'blue',
        targetFactoryId: 'heart',
        multiplier: 2000,
        purchased: false,
      },
    ],
    completedUpgrades: new Set<string>(),
    globalAdMultiplier: 4,
  };
}

describe('planner investment regressions', () => {
  it('finds the delayed kidney to left-ventricle investment chain', () => {
    const plan = planStateSpace(kidneyState(), 2, { adDoubling: true });
    const kidneySteps = plan.steps.filter((step) => step.factoryId === 'kidney');
    const upgradeIndex = plan.steps.findIndex((step) => step.upgradeId === 'left-ventricle');
    const liverIndex = plan.steps.findIndex((step) => step.factoryId === 'liver');

    expect(plan.goalLabel).toContain('肝');
    expect(kidneySteps.length).toBeGreaterThanOrEqual(8);
    expect(plan.steps.indexOf(kidneySteps[0])).toBeLessThan(upgradeIndex);
    expect(upgradeIndex).toBeLessThan(liverIndex);
    expect(plan.total).toBeLessThan(2 * 60 * 60);
    expect(plan.baselineTotal).toBeGreaterThan(plan.total);
  });

  it('returns the direct plan when an investment only has a tiny segment gain', () => {
    const plan = planStateSpace(
      {
        resources: [{ id: 'r', name: '资源', amount: 0, baseRate: 100 }],
        factories: [
          {
            id: 'f',
            label: '工厂',
            price: 100,
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
            label: '升级',
            cost: 1000,
            costResourceId: 'r',
            targetFactoryId: 'f',
            multiplier: 2,
            purchased: false,
          },
        ],
        completedUpgrades: new Set<string>(),
      },
      1,
    );

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ type: 'upgrade', upgradeId: 'u' });
  });

  it('terminates when factory prerequisites contain a cycle', () => {
    const plan = planStateSpace({
      resources: [{ id: 'r', name: '资源', amount: 100, baseRate: 0 }],
      factories: [
        {
          id: 'a',
          label: '工厂 A',
          price: 10,
          unit: 1,
          growth: 2,
          owned: 1,
          outputResourceId: 'r',
          costResourceId: 'r',
          requires: { type: 'factory' as const, id: 'b', owned: 2 },
        },
        {
          id: 'b',
          label: '工厂 B',
          price: 10,
          unit: 1,
          growth: 2,
          owned: 0,
          outputResourceId: 'r',
          costResourceId: 'r',
          requires: { type: 'factory' as const, id: 'a', owned: 2 },
        },
      ],
      upgrades: [
        {
          id: 'u',
          label: '升级',
          cost: 10,
          costResourceId: 'r',
          targetFactoryId: 'a',
          multiplier: 2,
          purchased: false,
        },
      ],
      completedUpgrades: new Set<string>(),
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ type: 'buy', factoryId: 'a' });
  });
});
