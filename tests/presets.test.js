import { describe, expect, it } from 'vitest';
import { PRESETS, PRESET_DOC_LEVEL, buildPresetStore } from '../src/data/presets.js';
import { buildState } from '../src/core/exploration.js';
import { planExploration } from '../src/core/planner.js';

const preset = PRESETS[0];

function findFactory(store, name) {
  return store.factories.find((factory) => factory.name === name);
}

describe('fear preset', () => {
  it('imports the documented level-2 factories and multiplier upgrades with names', () => {
    const store = buildPresetStore(preset, { level: 2, badgePercent: 0 });
    expect(PRESET_DOC_LEVEL).toBe(2);
    expect(store.resources[0]).toMatchObject({ emoji: '🔥', amount: '0', baseRate: '0' });
    expect(store.factories.map((factory) => factory.name)).toEqual([
      '深不可测的存在',
      '诡异生物',
      '阴险者',
    ]);
    expect(findFactory(store, '阴险者')).toMatchObject({ price: '400', unit: '2' });
    expect(findFactory(store, '诡异生物')).toMatchObject({ price: '100K', unit: '100' });
    expect(findFactory(store, '深不可测的存在')).toMatchObject({ price: '200M', unit: '5.00K' });
    expect(store.factories.every((factory) => factory.owned === '0')).toBe(true);
    expect(store.factories.every((factory) => factory.growth === '1.15')).toBe(true);
    expect(store.upgrades).toHaveLength(24);
    const dog = store.upgrades.find((upgrade) => upgrade.name === '狗头人');
    expect(dog).toMatchObject({ cost: '1.60K', multiplier: '2' });
    expect(dog.targetFactoryId).toBe(findFactory(store, '阴险者').id);
    expect(dog.requires).toEqual({
      type: 'factory',
      id: findFactory(store, '阴险者').id,
    });
    const banik = store.upgrades.find((upgrade) => upgrade.name === '班尼克');
    expect(banik.requires).toEqual({ type: 'upgrade', id: dog.id });
    expect(findFactory(store, '诡异生物').requires).toEqual({
      type: 'upgrade',
      id: store.upgrades.find((upgrade) => upgrade.name === '河童').id,
    });
    expect(store.completedUpgrades).toEqual([]);
    expect(store.upgrades.some((upgrade) => upgrade.name === '篝火')).toBe(false);
    expect(store.preset).toMatchObject({ level: 2, badgePercent: 0 });
  });

  it('falls back to the upgrade chain when remaining new factories are locked', () => {
    const store = buildPresetStore(preset, { level: 2, badgePercent: 0 });
    findFactory(store, '阴险者').owned = '1';
    const built = buildState(store, { now: Date.now() });
    const result = planExploration(built.state);
    expect(result.complete).toBe(true);
    expect(result.goal).toBe('upgrades');
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('stores documented output without the global x4 and reapplies it at runtime', () => {
    const store = buildPresetStore(preset, { level: 2, badgePercent: 0 });
    findFactory(store, '阴险者').owned = '1';
    expect(buildState(store, { now: Date.now() }).state.resources[0].rate).toBe(2);
    expect(
      buildState(store, { now: Date.now(), globalAdMultiplier: 4 }).state.resources[0].rate,
    ).toBe(8);
  });

  it('scales income by 2 and cost by 4 for each reputation level', () => {
    const level1 = buildPresetStore(preset, { level: 1, badgePercent: 0 });
    expect(findFactory(level1, '阴险者')).toMatchObject({ price: '100', unit: '1' });

    const level3 = buildPresetStore(preset, { level: 3, badgePercent: 0 });
    expect(findFactory(level3, '阴险者')).toMatchObject({ price: '1.60K', unit: '4' });
    expect(level3.upgrades.find((upgrade) => upgrade.name === '狗头人').cost).toBe('6.40K');
  });

  it('applies badge percentages to income only', () => {
    const store = buildPresetStore(preset, { level: 2, badgePercent: 10 });
    expect(findFactory(store, '阴险者')).toMatchObject({ price: '400', unit: '2.2' });
    expect(store.upgrades.find((upgrade) => upgrade.name === '狗头人').cost).toBe('1.60K');
  });
});
