import { describe, expect, it } from 'vitest';
import {
  emptyCursor,
  replayAction,
  replayPath,
} from '../src/core/plannerSimulation.ts';

function selfFundingState() {
  return {
    resources: [{ id: 'r', name: '资源', emoji: '🔴', amount: 0, baseRate: 10 }],
    factories: [
      {
        id: 'f',
        label: '自产工厂',
        price: 100,
        unit: 5,
        growth: 2,
        owned: 1,
        outputResourceId: 'r',
        costResourceId: 'r',
      },
    ],
    upgrades: [],
    completedUpgrades: new Set<string>(),
    globalAdMultiplier: 1,
  };
}

describe('planner macro simulation', () => {
  it('matches an online buy-k macro with explicit single-factory actions', () => {
    const macro = replayAction(
      selfFundingState(),
      emptyCursor(),
      { kind: 'factory', id: 'f', count: 3, offline: false },
      2,
      true,
    )!;
    const singles = replayPath(
      selfFundingState(),
      [
        { kind: 'factory', id: 'f', count: 1, offline: false },
        { kind: 'factory', id: 'f', count: 1, offline: false },
        { kind: 'factory', id: 'f', count: 1, offline: false },
      ],
      2,
      true,
    )!;

    expect(macro.cursor).toEqual(singles.cursor);
    expect(macro.state.factories[0]).toEqual(singles.state.factories[0]);
    expect(macro.state.resources[0].amount).toBeCloseTo(singles.state.resources[0].amount, 8);
    expect(macro.steps.map((step) => step.t)).toEqual(singles.steps.map((step) => step.t));
    expect(macro.steps.map((step) => step.price)).toEqual([100, 200, 400]);
  });

  it('buys an affordable offline batch in one block without retroactive production', () => {
    const result = replayAction(
      selfFundingState(),
      emptyCursor(),
      { kind: 'factory', id: 'f', count: 3, offline: true },
      2,
      true,
    )!;

    expect(result.cursor).toEqual({ time: 180, offlineBlocks: 1, onlineTime: 0, offlineTime: 180 });
    expect(result.state.factories[0].owned).toBe(4);
    expect(result.state.factories[0].price).toBe(800);
    expect(result.state.resources[0].amount).toBe(4700);
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((step) => step.t === 180)).toBe(true);
    expect(result.steps.every((step) => step.offlineBlock === 1)).toBe(true);
    expect(result.steps.every((step) => step.offlineWait === 180)).toBe(true);
  });

  it('uses the expanded factory output only after the previous offline block ends', () => {
    const result = replayAction(
      selfFundingState(),
      emptyCursor(),
      { kind: 'factory', id: 'f', count: 6, offline: true },
      2,
      true,
    )!;

    expect(result.cursor).toEqual({ time: 360, offlineBlocks: 2, onlineTime: 0, offlineTime: 360 });
    expect(result.state.factories[0].owned).toBe(7);
    expect(result.state.factories[0].price).toBe(6400);
    expect(result.state.resources[0].amount).toBe(13500);
    expect(result.steps.map((step) => step.offlineBlock)).toEqual([1, 1, 1, 1, 1, 2]);
    expect(result.steps.map((step) => step.t)).toEqual([180, 180, 180, 180, 180, 360]);
  });
});
