import { describe, expect, it } from 'vitest';
import { PRESETS, PRESET_DOC_LEVEL, buildPresetStore } from '../src/data/presets.ts';
import { RESOURCE_EMOJIS } from '../src/data/schema.ts';
import { buildState } from '../src/core/exploration.ts';
import { planStateSpace } from '../src/core/statePlanner.ts';

const preset = PRESETS[0];
const anatomyPreset = PRESETS.find((item) => item.id === 'anatomy');
const trustPreset = PRESETS.find((item) => item.id === 'trust');

function findFactory(store, name) {
  return store.factories.find((factory) => factory.name === name);
}

describe('trust preset', () => {
  it('imports four resources and the documented cross-resource factories', () => {
    const store = buildPresetStore(trustPreset, { level: 1, badgePercent: 0 });
    expect(store.resources.map((resource) => resource.emoji)).toEqual([
      '🐚',
      '🪙',
      '💵',
      '💳',
    ]);
    expect(store.factories.map((factory) => factory.name)).toEqual([
      '商品货币',
      '硬币',
      '纸币',
      '电子货币',
      '未来货币',
    ]);
    const shell = store.resources[0];
    const coin = store.resources[1];
    const cash = store.resources[2];
    const credit = store.resources[3];
    expect(findFactory(store, '商品货币')).toMatchObject({
      price: '25',
      unit: '1',
      costResourceId: shell.id,
      outputResourceId: shell.id,
      requires: null,
    });
    expect(findFactory(store, '硬币')).toMatchObject({
      price: '1.00B',
      unit: '1',
      costResourceId: shell.id,
      outputResourceId: coin.id,
    });
    expect(findFactory(store, '纸币')).toMatchObject({
      costResourceId: coin.id,
      outputResourceId: cash.id,
    });
    expect(findFactory(store, '电子货币')).toMatchObject({
      costResourceId: cash.id,
      outputResourceId: credit.id,
    });
    expect(findFactory(store, '未来货币')).toMatchObject({
      price: '1.00B',
      unit: '100K',
      costResourceId: credit.id,
      outputResourceId: credit.id,
      requires: { type: 'upgrade', id: store.upgrades.find((upgrade) => upgrade.name === '移动支付').id },
    });
    expect(
      store.upgrades.find((upgrade) => upgrade.name === '冶金术').id,
    ).toBe(findFactory(store, '硬币').requires.id);
    expect(
      store.upgrades.find((upgrade) => upgrade.name === '银行业').id,
    ).toBe(findFactory(store, '纸币').requires.id);
    expect(
      store.upgrades.find((upgrade) => upgrade.name === '法定货币').id,
    ).toBe(findFactory(store, '电子货币').requires.id);
  });

  it('keeps factory-effect upgrades and omits click-only upgrades', () => {
    const store = buildPresetStore(trustPreset, { level: 1, badgePercent: 0 });
    expect(store.upgrades).toHaveLength(47);
    for (const name of ['渔猎采集', '赠送礼品', '定居', '专业分工']) {
      expect(store.upgrades.some((upgrade) => upgrade.name === name)).toBe(false);
    }
    const debt = store.upgrades.find((upgrade) => upgrade.name === '债务');
    const tax = store.upgrades.find((upgrade) => upgrade.name === '税收');
    const qipu = store.upgrades.find((upgrade) => upgrade.name === '奇普');
    const real = store.upgrades.find((upgrade) => upgrade.name === '八里亚尔');
    expect(debt).toMatchObject({
      cost: '125',
      multiplier: '2.5',
      targetFactoryId: findFactory(store, '商品货币').id,
      requires: { type: 'factory', id: findFactory(store, '商品货币').id },
    });
    expect(tax).toMatchObject({
      multiplier: '5.00K',
      targetFactoryId: findFactory(store, '硬币').id,
    });
    expect(qipu).toMatchObject({
      multiplier: '1.00K',
      targetFactoryId: findFactory(store, '商品货币').id,
    });
    expect(real).toMatchObject({
      multiplier: '101',
      targetFactoryId: findFactory(store, '硬币').id,
    });
    expect(store.upgrades.find((upgrade) => upgrade.name === '区块链')).toMatchObject({
      multiplier: '3',
      targetFactoryId: findFactory(store, '未来货币').id,
    });
    expect(store.upgrades.find((upgrade) => upgrade.name === '欧元')).toMatchObject({
      multiplier: '1.00K',
      targetFactoryId: findFactory(store, '纸币').id,
    });
  });

  it('uses the document as a reputation-1, no-ad baseline', () => {
    const level1 = buildPresetStore(trustPreset, { level: 1, badgePercent: 0 });
    const level2 = buildPresetStore(trustPreset, { level: 2, badgePercent: 0 });
    expect(findFactory(level1, '商品货币')).toMatchObject({
      price: '25',
      unit: '1',
    });
    expect(findFactory(level2, '商品货币')).toMatchObject({
      price: '100',
      unit: '2',
    });
    expect(findFactory(level2, '硬币').price).toBe('4.00B');
  });
});

describe('life anatomy preset', () => {
  it('imports two resources and cross-resource factories', () => {
    const store = buildPresetStore(anatomyPreset, { level: 1, badgePercent: 0 });
    expect(store.resources.map((resource) => resource.emoji)).toEqual(['🔵', '🔴']);
    expect(store.factories.every((factory) => factory.growth === '1.15')).toBe(true);
    expect(
      store.resources.every((resource) => RESOURCE_EMOJIS.includes(resource.emoji)),
    ).toBe(true);

    const blue = store.resources.find((resource) => resource.emoji === '🔵');
    const red = store.resources.find((resource) => resource.emoji === '🔴');
    const heart = findFactory(store, '心脏');
    const brain = findFactory(store, '大脑');
    const lung = findFactory(store, '肺');

    expect(heart).toMatchObject({
      price: '100',
      unit: '1',
      costResourceId: blue.id,
      outputResourceId: red.id,
    });
    expect(brain).toMatchObject({
      price: '1.50K',
      unit: '1',
      costResourceId: red.id,
      outputResourceId: blue.id,
    });
    expect(lung).toMatchObject({
      price: '10.0T',
      unit: '508M',
      costResourceId: blue.id,
      outputResourceId: red.id,
    });
    expect(store.factories.map((factory) => factory.name)).toEqual(
      expect.arrayContaining(['胃', '肾脏', '肝']),
    );
  });

  it('keeps the five-endocrine requirement and omits click-only upgrades', () => {
    const store = buildPresetStore(anatomyPreset, { level: 1, badgePercent: 0 });
    const endocrine = findFactory(store, '内分泌系统');
    const bone = findFactory(store, '骨骼');
    expect(bone.requires).toEqual({
      type: 'factory',
      id: endocrine.id,
      owned: 5,
    });
    expect(store.upgrades.some((upgrade) => upgrade.name === '血液')).toBe(false);
    expect(store.upgrades.some((upgrade) => upgrade.name === '静脉')).toBe(false);
    expect(store.upgrades.filter((upgrade) => upgrade.name === '软骨')).toHaveLength(1);
    expect(store.upgrades.some((upgrade) => upgrade.name === '软骨（肌肉）')).toBe(false);
    const tendon = store.upgrades.find((upgrade) => upgrade.name === '肌腱');
    const boneMuscle = store.upgrades.find((upgrade) => upgrade.name === '骨骼肌肉');
    expect(tendon).toMatchObject({
      cost: '800T',
      multiplier: '31',
      targetFactoryId: findFactory(store, '肌肉').id,
    });
    expect(tendon.requires).toEqual({ type: 'upgrade', id: boneMuscle.id });
    expect(findFactory(store, '心脏').requires).toBeNull();
    expect(findFactory(store, '肌肉')).toMatchObject({ unit: '10.0M' });
    const skinUpgrades = ['甲状腺', '皮下组织', '表皮层', '真皮层', '松果体'];
    expect(store.upgrades.map((upgrade) => upgrade.name)).toEqual(
      expect.arrayContaining(skinUpgrades),
    );
    expect(store.upgrades.find((upgrade) => upgrade.name === '甲状腺')).toMatchObject({
      targetFactoryId: findFactory(store, '内分泌系统').id,
      multiplier: '5',
      requires: { type: 'factory', id: findFactory(store, '皮肤').id },
    });
    expect(store.upgrades.find((upgrade) => upgrade.name === '松果体')).toMatchObject({
      targetFactoryId: findFactory(store, '内分泌系统').id,
      multiplier: '7.50B',
    });
    const stomach = findFactory(store, '胃');
    const digestion = store.upgrades.find((upgrade) => upgrade.name === '消化');
    const mouth = store.upgrades.find((upgrade) => upgrade.name === '嘴巴');
    expect(stomach.requires).toEqual({ type: 'upgrade', id: digestion.id });
    expect(digestion.requires).toEqual({ type: 'upgrade', id: mouth.id });
    expect(mouth).toMatchObject({
      targetFactoryId: findFactory(store, '大脑').id,
      multiplier: '5.00M',
      requires: {
        type: 'upgrade',
        id: store.upgrades.find((upgrade) => upgrade.name === '表皮层').id,
      },
    });
    expect(
      store.upgrades.map((upgrade) => upgrade.name),
    ).toEqual(
      expect.arrayContaining([
        '关节',
        '嘴巴',
        '消化',
        '平滑肌',
        '小肠',
        '左心房',
        '大肠',
        '左心室',
        '输尿管',
        '膀胱',
        '主动脉',
        '胆囊',
        '胰腺',
      ]),
    );
  });

  it('scales anatomy from its reputation-1 document baseline', () => {
    const level1 = buildPresetStore(anatomyPreset, { level: 1, badgePercent: 0 });
    const level2 = buildPresetStore(anatomyPreset, { level: 2, badgePercent: 0 });
    expect(findFactory(level1, '心脏')).toMatchObject({ price: '100', unit: '1' });
    expect(findFactory(level2, '心脏')).toMatchObject({ price: '400', unit: '2' });
  });
});

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
    const result = planStateSpace(built.state);
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
