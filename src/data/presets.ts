/**
 * 内置活动预设。
 *
 * 文档数值默认是「声望 2」：相对声望 1，收入 ×2、成本 ×4。
 * 导入时按当前声望等级和徽章加成重新换算：
 *   收入倍率 = 2^(level-2) × (1 + badgePercent/100)
 *   成本倍率 = 4^(level-2)
 */

import { fmtNum } from '../core/numbers.ts';

export const PRESET_DOC_LEVEL = 2;
/** 文档产出按全局广告 ×4 记录；存档保存不含广告倍率的基准产出。 */
export const PRESET_DOC_GLOBAL_AD = 4;

export const PRESETS = [
  {
    id: 'fear',
    title: '微型探索 · 面对恐惧',
    source: 'docs/微型探索 面对恐惧.md',
    emoji: '🔥',
    factoryGrowth: 1.15,
    notes: [
      '文档数值以声望 2 为基准（成本 ×4、产出 ×2），且产出包含全局广告 ×4；导入时先扣除全局广告，再按声望和徽章换算。',
      '三个工厂的成本增长倍率均为 1.15。',
      '工厂默认从已拥有 0 台开始；请按游戏实际数量填写。',
      '文档里的解锁条件已转成前置条件：未满足时升级/工厂会锁定，规划也会跳过；工厂前置要求该工厂至少 1 台。',
      '单台产出保存为不含全局广告的基准值；请在页面顶部选择当前的全局广告倍率（×1/×2/×4）。',
      '篝火的「点击收益 +1」暂未参与规划。',
    ],
    factories: [
      { name: '深不可测的存在', cost: 2e8, output: 20000, unlock: '哈尔' },
      { name: '诡异生物', cost: 100000, output: 400, unlock: '河童' },
      { name: '阴险者', cost: 400, output: 8, unlock: '篝火' },
    ],
    upgrades: [
      { name: '篝火', cost: 200, unlock: '无', effect: { kind: 'click', add: 1 } },
      { name: '狗头人', cost: 1600, unlock: '阴险者', effect: { kind: 'factory', target: '阴险者', multiplier: 2 } },
      { name: '班尼克', cost: 4000, unlock: '狗头人', effect: { kind: 'factory', target: '阴险者', multiplier: 2 } },
      { name: '河童', cost: 20000, unlock: '班尼克', effect: { kind: 'factory', target: '阴险者', multiplier: 2 } },
      { name: '芭芭雅嘎', cost: 800000, unlock: '诡异生物', effect: { kind: 'factory', target: '诡异生物', multiplier: 2 } },
      { name: '人鱼', cost: 6e6, unlock: '诡异生物', effect: { kind: 'factory', target: '诡异生物', multiplier: 2 } },
      { name: '本耶普', cost: 3.6e7, unlock: '人鱼', effect: { kind: 'factory', target: '阴险者', multiplier: 21 } },
      { name: '哈尔', cost: 2e8, unlock: '人鱼', effect: { kind: 'factory', target: '诡异生物', multiplier: 2.5 } },
      { name: '雅库玛玛', cost: 1.6e9, unlock: '深不可测的存在', effect: { kind: 'factory', target: '深不可测的存在', multiplier: 4 } },
      { name: '雷兽', cost: 4e9, unlock: '深不可测的存在', effect: { kind: 'factory', target: '深不可测的存在', multiplier: 2 } },
      { name: '掉包婴儿', cost: 1e10, unlock: '雷兽', effect: { kind: 'factory', target: '诡异生物', multiplier: 26 } },
      { name: '丁戈内克', cost: 4e10, unlock: '雷兽', effect: { kind: 'factory', target: '深不可测的存在', multiplier: 6 } },
      { name: '卓帕卡布拉', cost: 2e11, unlock: '丁戈内克', effect: { kind: 'factory', target: '诡异生物', multiplier: 11 } },
      { name: '塔佐蠕虫', cost: 8e11, unlock: '卓帕卡布拉', effect: { kind: 'factory', target: '深不可测的存在', multiplier: 6 } },
      { name: '食蚁兽人', cost: 3.2e12, unlock: '卓帕卡布拉', effect: { kind: 'factory', target: '诡异生物', multiplier: 11 } },
      { name: '阿兹', cost: 1e13, unlock: '食蚁兽人', effect: { kind: 'factory', target: '阴险者', multiplier: 50001 } },
      { name: '蒙古死亡蠕虫', cost: 8e13, unlock: '食蚁兽人', effect: { kind: 'factory', target: '深不可测的存在', multiplier: 101 } },
      { name: '雪人', cost: 4e14, unlock: '蒙古死亡蠕虫', effect: { kind: 'factory', target: '诡异生物', multiplier: 101 } },
      { name: '克罗科塔', cost: 1.6e15, unlock: '雪人', effect: { kind: 'factory', target: '阴险者', multiplier: 31 } },
      { name: '精灵', cost: 4e15, unlock: '雪人', effect: { kind: 'factory', target: '深不可测的存在', multiplier: 26 } },
      { name: '飞蛾人', cost: 1.6e16, unlock: '精灵', effect: { kind: 'factory', target: '诡异生物', multiplier: 21 } },
      { name: '泽西', cost: 4e16, unlock: '精灵', effect: { kind: 'factory', target: '诡异生物', multiplier: 6 } },
      { name: '尼斯湖水怪', cost: 2e17, unlock: '泽西', effect: { kind: 'factory', target: '深不可测的存在', multiplier: 501 } },
      { name: '大脚怪', cost: 4e18, unlock: '尼斯湖水怪', effect: { kind: 'factory', target: '诡异生物', multiplier: 2 } },
      { name: 'Jimothy', cost: 4e18, unlock: '大脚怪', effect: { kind: 'factory', target: '诡异生物', multiplier: 2 } },
    ],
  },
];

function presetNumber(value) {
  return fmtNum(Number(value));
}

/** 生成可直接写入存档的预设状态。 */
export function buildPresetStore(preset, { level = PRESET_DOC_LEVEL, badgePercent = 0, now = Date.now() } = {}) {
  const safeLevel = Number.isInteger(level) && level >= 1 ? level : PRESET_DOC_LEVEL;
  const safeBadge = Number.isFinite(badgePercent) && badgePercent >= 0 ? badgePercent : 0;
  const costScale = 4 ** (safeLevel - PRESET_DOC_LEVEL);
  const incomeScale = 2 ** (safeLevel - PRESET_DOC_LEVEL) * (1 + safeBadge / 100);

  const resource = {
    id: `preset_${preset.id}_res`,
    emoji: preset.emoji,
    amount: '0',
    baseRate: '0',
  };
  const importedUpgrades = preset.upgrades.filter(
    (upgrade) =>
      upgrade.effect.kind === 'factory' &&
      preset.factories.some((factory) => factory.name === upgrade.effect.target),
  );
  const upgradeIdByName = new Map(
    importedUpgrades.map((upgrade, index) => [
      upgrade.name,
      `preset_${preset.id}_upg_${index}`,
    ]),
  );

  const factories = preset.factories.map((factory, index) => {
    const requiredUpgradeId = upgradeIdByName.get(factory.unlock);
    return {
      id: `preset_${preset.id}_fac_${index}`,
      name: factory.name,
      price: presetNumber(factory.cost * costScale),
      unit: presetNumber((factory.output / PRESET_DOC_GLOBAL_AD) * incomeScale),
      growth: preset.factoryGrowth ? presetNumber(preset.factoryGrowth) : '',
      owned: '0',
      outputResourceId: resource.id,
      costResourceId: resource.id,
      requires: requiredUpgradeId ? { type: 'upgrade', id: requiredUpgradeId } : null,
    };
  });
  const factoryIdByName = new Map(factories.map((factory) => [factory.name, factory.id]));
  const upgrades = importedUpgrades
    .map((upgrade, index) => {
      const targetFactoryId = factoryIdByName.get(upgrade.effect.target);
      if (!targetFactoryId) return null;
      const requiredFactoryId = factoryIdByName.get(upgrade.unlock);
      const requiredUpgradeId = upgradeIdByName.get(upgrade.unlock);
      const requires = requiredFactoryId
        ? { type: 'factory', id: requiredFactoryId }
        : requiredUpgradeId
          ? { type: 'upgrade', id: requiredUpgradeId }
          : null;
      return {
        id: `preset_${preset.id}_upg_${index}`,
        name: upgrade.name,
        cost: presetNumber(upgrade.cost * costScale),
        costResourceId: resource.id,
        targetFactoryId,
        multiplier: presetNumber(upgrade.effect.multiplier),
        purchased: false,
        requires,
      };
    })
    .filter(Boolean);

  return {
    globalGrowth: '1.5',
    asOf: now,
    resources: [resource],
    factories,
    upgrades,
    completedUpgrades: [],
    plan: null,
    reminder: null,
    preset: {
      id: preset.id,
      title: preset.title,
      source: preset.source,
      level: safeLevel,
      badgePercent: safeBadge,
      importedAt: now,
    },
  };
}
