import { describe, expect, it } from 'vitest';
import { planStateSpace } from '../src/core/statePlanner.ts';

function boneState() {
  return {
    resources: [
      { id: 'blue', name: '蓝', emoji: '🔵', amount: 3.3e9, baseRate: 0 },
      { id: 'red', name: '红', emoji: '🔴', amount: 1.22e10, baseRate: 0 },
    ],
    factories: [
      {
        id: 'heart',
        label: '心脏',
        price: 1.66e9,
        unit: 199000,
        growth: 1.15,
        owned: 109,
        outputResourceId: 'red',
        costResourceId: 'blue',
      },
      {
        id: 'brain',
        label: '大脑',
        price: 1.22e6,
        unit: 81.9,
        growth: 1.15,
        owned: 38,
        outputResourceId: 'blue',
        costResourceId: 'red',
      },
      {
        id: 'endocrine',
        label: '内分泌系统',
        price: 1.31e9,
        unit: 15600,
        growth: 1.15,
        owned: 27,
        outputResourceId: 'blue',
        costResourceId: 'red',
      },
      {
        id: 'bone',
        label: '骨骼',
        price: 4.86e10,
        unit: 650000,
        growth: 1.15,
        owned: 3,
        outputResourceId: 'blue',
        costResourceId: 'red',
      },
    ],
    upgrades: [
      {
        id: 'bone-up',
        label: '骨头',
        cost: 6e10,
        costResourceId: 'blue',
        targetFactoryId: 'bone',
        multiplier: 6,
        purchased: false,
        requires: { type: 'factory', id: 'bone' },
      },
    ],
    completedUpgrades: new Set(),
    globalAdMultiplier: 4,
  };
}

describe('state-space segment planner', () => {
  it('buys bone factories before the bone upgrade when they reduce total time', () => {
    const plan = planStateSpace(boneState(), 2, { adDoubling: true });
    const upgradeIndex = plan.steps.findIndex((step) => step.type === 'upgrade');
    const boneBuys = plan.steps.filter(
      (step) => step.type === 'buy' && step.label === '骨骼',
    );
    expect(plan.goal).toBe('unlock');
    expect(plan.strategy).toBe('search');
    expect(boneBuys.length).toBeGreaterThan(0);
    expect(plan.steps.indexOf(boneBuys[0])).toBeLessThan(upgradeIndex);
    expect(plan.total).toBeLessThan(1620);
  });

  it('uses 3-minute offline blocks when they beat the exact online wait', () => {
    const plan = planStateSpace(
      {
        resources: [{ id: 'r', name: '资源', amount: 0, baseRate: 10 }],
        factories: [
          {
            id: 'f',
            label: '工厂',
            price: 1000,
            unit: 0,
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
            cost: 10000,
            costResourceId: 'r',
            targetFactoryId: 'f',
            multiplier: 2,
            purchased: false,
          },
        ],
        completedUpgrades: new Set(),
      },
      2,
    );
    expect(plan.steps[0].offline).toBe(true);
    expect(plan.steps[0].t).toBe(540);
    expect(plan.offlineBlocks).toBe(1);
  });

  it('keeps a target factory whose cost and output use different resources', () => {
    const plan = planStateSpace(
      {
        resources: [
          { id: 'blue', name: '蓝', amount: 1e6, baseRate: 0 },
          { id: 'red', name: '红', amount: 1e6, baseRate: 0 },
        ],
        factories: [
          {
            id: 'heart',
            label: '心脏',
            price: 100,
            unit: 10,
            growth: 2,
            owned: 1,
            outputResourceId: 'red',
            costResourceId: 'blue',
          },
          {
            id: 'muscle',
            label: '肌肉',
            price: 100,
            unit: 20,
            growth: 2,
            owned: 0,
            outputResourceId: 'blue',
            costResourceId: 'red',
          },
        ],
        upgrades: [],
        completedUpgrades: new Set(),
      },
      2,
    );
    expect(plan.steps[0]).toMatchObject({ type: 'buy', factoryId: 'muscle' });
  });

  it('includes a relevant upgrade that boosts the target factory', () => {
    const plan = planStateSpace(
      {
        resources: [
          { id: 'blue', name: '蓝', amount: 1e6, baseRate: 0 },
          { id: 'red', name: '红', amount: 1e6, baseRate: 0 },
        ],
        factories: [
          {
            id: 'bone',
            label: '骨骼',
            price: 100,
            unit: 10,
            growth: 2,
            owned: 1,
            outputResourceId: 'blue',
            costResourceId: 'red',
          },
          {
            id: 'locked',
            label: '被锁工厂',
            price: 100,
            unit: 1,
            growth: 2,
            owned: 0,
            outputResourceId: 'blue',
            costResourceId: 'red',
            requires: { type: 'upgrade', id: 'bone-up' },
          },
        ],
        upgrades: [
          {
            id: 'bone-up',
            label: '骨头',
            cost: 100,
            costResourceId: 'blue',
            targetFactoryId: 'bone',
            multiplier: 2,
            purchased: false,
            requires: { type: 'factory', id: 'bone' },
          },
          {
            id: 'marrow',
            label: '骨髓',
            cost: 1,
            costResourceId: 'red',
            targetFactoryId: 'bone',
            multiplier: 10,
            purchased: false,
          },
        ],
        completedUpgrades: new Set(),
      },
      2,
    );
    expect(plan.steps[0]).toMatchObject({ type: 'upgrade', upgradeId: 'marrow' });
  });

  it('does not mutate the input state', () => {
    const state = boneState();
    const before = JSON.stringify({
      resources: state.resources,
      factories: state.factories,
      upgrades: state.upgrades,
    });
    planStateSpace(state, 2, { adDoubling: true });
    expect(
      JSON.stringify({
        resources: state.resources,
        factories: state.factories,
        upgrades: state.upgrades,
      }),
    ).toBe(before);
  });
});
