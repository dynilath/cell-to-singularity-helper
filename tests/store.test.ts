import { describe, expect, it } from 'vitest';
import {
  LEGACY_STORAGE,
  RESOURCE_EMOJIS,
  SETTING_KEYS,
  STORAGE_KEY,
  cleanResourceText,
  createEmptyStore,
  normalizeStore,
} from '../src/data/schema.ts';
import {
  loadSettings,
  loadStore,
  saveHalf,
  saveHideLockedUpgrades,
  saveGlobalAdMultiplier,
  saveNotation,
  saveOfflineRate,
  savePlanStrategy,
  saveStore,
  saveVolume,
} from '../src/data/store.ts';

function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const NOW = 1_800_000_000_000;

function sampleStore(overrides = {}) {
  return {
    globalGrowth: '1.5',
    asOf: NOW,
    resources: [
      { id: 'r1', emoji: '🌱', name: '资源1', amount: '100', baseRate: '5' },
      { id: 'r2', emoji: '⚡', name: '资源2', amount: '0', baseRate: '' },
    ],
    factories: [
      {
        id: 'f1',
        price: '100',
        unit: '10',
        growth: '2',
        owned: '1',
        outputResourceId: 'r1',
        costResourceId: 'r2',
        isNew: true,
      },
    ],
    upgrades: [
      {
        id: 'u1',
        cost: '1000',
        costResourceId: 'r2',
        targetFactoryId: 'f1',
        multiplier: '2',
        purchased: false,
      },
    ],
    plan: null,
    reminder: null,
    ...overrides,
  };
}

describe('normalizeStore', () => {
  it('creates one editable dataset by default', () => {
    const store = normalizeStore(null, NOW);
    expect(store.resources).toHaveLength(1);
    expect(store.factories).toHaveLength(1);
    expect(store.upgrades).toEqual([]);
    expect(RESOURCE_EMOJIS).toContain(store.resources[0].emoji);
  });

  it('normalizes resource icons and factory/upgrade references', () => {
    const store = normalizeStore(sampleStore(), NOW);
    expect(store.resources.map((resource) => resource.emoji)).toEqual(['🌱', '⚡']);
    expect(store.factories[0]).toMatchObject({
      owned: '1',
      outputResourceId: 'r1',
      costResourceId: 'r2',
    });
    expect(store.upgrades[0]).toMatchObject({
      costResourceId: 'r2',
      targetFactoryId: 'f1',
      multiplier: '2',
    });
  });

  it('falls back invalid references and icons', () => {
    const raw = sampleStore();
    raw.resources[0].emoji = 'not-an-emoji';
    raw.factories[0].outputResourceId = 'gone';
    raw.factories[0].costResourceId = 'gone';
    raw.upgrades[0].costResourceId = 'gone';
    raw.upgrades[0].targetFactoryId = 'gone';
    const store = normalizeStore(raw, NOW);
    expect(store.resources[0].emoji).toBe(RESOURCE_EMOJIS[0]);
    expect(store.factories[0].outputResourceId).toBe('r1');
    expect(store.factories[0].costResourceId).toBe('r1');
    expect(store.upgrades[0].costResourceId).toBe('r1');
    expect(store.upgrades[0].targetFactoryId).toBe('f1');
  });

  it('cleans legacy resource text containing undefined', () => {
    expect(cleanResourceText('🌱 undefined')).toBe('🌱');
    const raw = sampleStore({
      reminder: {
        title: '该买升级1 了！',
        body: '花费 1.00K 🌱 undefined · 买完回来',
        endTime: NOW + 1000,
        durMs: 1000,
        fired: false,
        paused: false,
      },
    });
    expect(normalizeStore(raw, NOW).reminder.body).toBe('花费 1.00K 🌱 · 买完回来');
  });

  it('folds legacy purchased upgrades into factory unit output and removes them', () => {
    const raw = sampleStore();
    raw.factories[0].unit = '10';
    raw.upgrades[0].multiplier = '3';
    raw.upgrades[0].purchased = true;
    const store = normalizeStore(raw, NOW);
    expect(store.factories[0].unit).toBe('30');
    expect(store.upgrades).toHaveLength(0);
  });

  it('normalizes a saved plan and clamps its step index', () => {
    const raw = sampleStore({
      plan: {
        steps: [
          {
            type: 'buy',
            factoryId: 'f1',
            label: '工厂1',
            nth: 2,
            price: 100,
            resourceId: 'r1',
            resourceName: '资源1',
            t: 10,
          },
          {
            type: 'upgrade',
            upgradeId: 'u1',
            label: '升级1',
            cost: 1000,
            resourceId: 'r2',
            resourceName: '资源2',
            t: 20,
          },
        ],
        anchor: NOW,
        stepIndex: 9,
        goal: 'upgrades',
        goalLabel: '完成全部 1 个升级',
        complete: true,
        total: 20,
      },
    });
    const plan = normalizeStore(raw, NOW).plan;
    expect(plan.stepIndex).toBe(2);
    expect(plan.steps).toHaveLength(2);
    expect(plan.goalLabel).toBe('完成全部 1 个升级');
    expect(plan.total).toBe(20);
  });
});

describe('legacy migration', () => {
  it('merges v5 groups into one dataset with resource icons', () => {
    const legacy = {
      active: 0,
      groups: [
        {
          id: 'g1',
          emoji: '🧬',
          globalGrowth: '2',
          asOf: NOW,
          resources: [{ id: 'old-r1', name: '基因', amount: '12.5M', baseRate: '85K' }],
          factories: [
            {
              id: 'old-f1',
              price: '100',
              unit: '5',
              growth: '1.8',
              owned: '2',
              outputResourceId: 'old-r1',
              costResourceId: 'old-r1',
              isNew: false,
            },
          ],
          upgrades: [
            {
              id: 'old-u1',
              cost: '1000',
              costResourceId: 'old-r1',
              targetFactoryId: 'old-f1',
              multiplier: '2',
              purchased: false,
            },
          ],
          plan: null,
          reminder: null,
        },
        {
          id: 'g2',
          emoji: '⚡',
          resources: [{ id: 'old-r2', name: '能量', amount: '5', baseRate: '1' }],
          factories: [],
          upgrades: [],
          plan: null,
          reminder: null,
        },
      ],
    };
    const storage = createStorage({ [LEGACY_STORAGE.v5]: JSON.stringify(legacy) });
    const store = loadStore(storage, NOW);

    expect(store.resources).toHaveLength(2);
    expect(store.resources.map((resource) => resource.emoji)).toEqual(['🧬', '⚡']);
    expect(store.resources[0]).toMatchObject({ amount: '12.5M', baseRate: '85K' });
    expect(store.factories[0]).toMatchObject({ price: '100', unit: '5', owned: '2' });
    expect(store.factories[0].outputResourceId).toBe(store.resources[0].id);
    expect(store.upgrades[0].targetFactoryId).toBe(store.factories[0].id);
    expect(store.upgrades[0].costResourceId).toBe(store.resources[0].id);
    expect(store.globalGrowth).toBe('2');
  });

  it('turns each non-empty v4 slot into a resource', () => {
    const legacy = {
      active: 1,
      slots: [
        {
          inputs: {
            cur: '12.5M',
            rate: '85K',
            up: '350M',
            gg: '2',
            asOf: NOW - 1000,
            facs: [{ p: '100', u: '5', g: '1.8' }],
          },
          armedHalf: {
            title: '半程',
            body: '看广告',
            endTime: NOW + 1000,
            durMs: 2000,
            fired: false,
            paused: false,
          },
        },
        { inputs: { cur: '0', rate: '10', up: '', gg: '1.5', facs: [] } },
        { inputs: {} },
      ],
    };
    const storage = createStorage({ [LEGACY_STORAGE.v4]: JSON.stringify(legacy) });
    const store = loadStore(storage, NOW);

    expect(store.resources).toHaveLength(2);
    expect(store.resources[0]).toMatchObject({ amount: '12.5M', baseRate: '85K' });
    expect(store.factories).toHaveLength(2);
    expect(store.factories[0]).toMatchObject({ price: '100', unit: '5', growth: '1.8' });
    expect(store.factories[0].outputResourceId).toBe(store.resources[0].id);
    expect(store.upgrades[0].cost).toBe('350M');
    expect(store.upgrades[0].targetFactoryId).toBe(store.factories[0].id);
    expect(store.reminder.kind).toBe('half');
    expect(store.globalGrowth).toBe('2');
  });

  it('migrates v2 single-slot data into one resource', () => {
    const storage = createStorage({
      [LEGACY_STORAGE.v2Inputs]: JSON.stringify({
        cur: '1M',
        rate: '1K',
        up: '2M',
        gg: '1.5',
        facs: [{ p: '10', u: '2', g: '1.5' }],
      }),
    });
    const store = loadStore(storage, NOW);
    expect(store.resources).toHaveLength(1);
    expect(store.resources[0].amount).toBe('1M');
    expect(store.upgrades[0].cost).toBe('2M');
  });

  it('prefers v6 data and saves it back', () => {
    const storage = createStorage({
      [STORAGE_KEY]: JSON.stringify(sampleStore()),
    });
    const store = loadStore(storage, NOW);
    expect(store.resources[0].emoji).toBe('🌱');
    saveStore(storage, store);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).resources[0].amount).toBe('100');
  });

  it('falls back for corrupt legacy JSON', () => {
    const storage = createStorage({ [LEGACY_STORAGE.v5]: '{not json' });
    const store = loadStore(storage, NOW);
    expect(store.resources).toHaveLength(1);
    expect(store.factories).toHaveLength(1);
  });
});

describe('settings', () => {
  it('uses defaults when nothing is saved', () => {
    expect(loadSettings(createStorage())).toEqual({
      volume: 1,
      half: true,
      notation: 'short',
      offlineRate: 1,
      hideLockedUpgrades: false,
      planStrategy: 'online',
      globalAdMultiplier: 1,
    });
  });

  it('persists mute, half-disable, notation, offline rate and upgrade filter', () => {
    const storage = createStorage();
    saveVolume(storage, 0);
    saveHalf(storage, false);
    saveNotation(storage, 'chinese');
    saveOfflineRate(storage, 2.1);
    saveHideLockedUpgrades(storage, true);
    savePlanStrategy(storage, 'offline');
    saveGlobalAdMultiplier(storage, 4);

    expect(loadSettings(storage)).toEqual({
      volume: 0,
      half: false,
      notation: 'chinese',
      offlineRate: 2.1,
      hideLockedUpgrades: true,
      planStrategy: 'offline',
      globalAdMultiplier: 4,
    });
  });

  it('falls back for invalid values', () => {
    const storage = createStorage({
      [SETTING_KEYS.volume]: 'loud',
      [SETTING_KEYS.notation]: 'roman',
      [SETTING_KEYS.offlineRate]: '-2',
    });
    const settings = loadSettings(storage);
    expect(settings.volume).toBe(1);
    expect(settings.notation).toBe('short');
    expect(settings.offlineRate).toBe(1);
  });
});

describe('empty store', () => {
  it('creates a resource with an icon and a matching factory', () => {
    const store = createEmptyStore();
    expect(store.resources).toHaveLength(1);
    expect(store.factories[0].costResourceId).toBe(store.resources[0].id);
    expect(RESOURCE_EMOJIS).toContain(store.resources[0].emoji);
  });
});
