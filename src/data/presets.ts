/**
 * 内置活动预设。
 *
 * 文档数值默认是「声望 2」：相对声望 1，收入 ×2、成本 ×4。
 * 导入时按当前声望等级和徽章加成重新换算：
 *   收入倍率 = 2^(level-2) × (1 + badgePercent/100)
 *   成本倍率 = 4^(level-2)
 *
 * 产出文档还包含全局广告 ×4；存档保存不含广告倍率的基准产出，
 * 页面顶部的「全局广告倍率」再决定实际产出。
 */

import { fmtNum } from '../core/numbers.ts';
import type { Requirement } from '../types.ts';

export const PRESET_DOC_LEVEL = 2;
/** 文档产出按全局广告 ×4 记录；存档保存不含广告倍率的基准产出。 */
export const PRESET_DOC_GLOBAL_AD = 4;

interface PresetResource {
  key: string;
  name: string;
  emoji: string;
}

interface PresetFactory {
  name: string;
  cost: number;
  output: number;
  costResource?: string;
  outputResource?: string;
  unlock?: string;
}

interface PresetUpgradeEffect {
  kind: 'factory' | 'click';
  target?: string;
  multiplier?: number;
  add?: number;
}

interface PresetUpgrade {
  name: string;
  cost: number;
  costResource?: string;
  unlock?: string;
  effect: PresetUpgradeEffect;
}

interface Preset {
  id: string;
  title: string;
  source: string;
  emoji?: string;
  resources?: PresetResource[];
  factoryGrowth?: number;
  notes: string[];
  factories: PresetFactory[];
  upgrades: PresetUpgrade[];
}

export const PRESETS: Preset[] = [
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
  {
    id: 'anatomy',
    title: '生命解剖学',
    source: 'docs/生命解剖学.md',
    resources: [
      { key: 'blue', name: '脱氧血液', emoji: '🔵' },
      { key: 'red', name: '带氧血液', emoji: '🔴' },
    ],
    factoryGrowth: 1.15,
    notes: [
      '文档数值包含全局广告 ×4；导入时先除以 4 存成基准产出，请在页面顶部选择实际广告倍率。',
      '当前文档未标注声望基准，导入界面默认按声望 2 的倍率换算；请按游戏实际声望调整。',
      '文档数据尚未填写完整，后续可能继续补充。',
      '点击收益升级「血液」「静脉」未纳入工厂产出规划；因此「心脏」的解锁条件暂未建模，其余工厂/升级前置已转成锁定条件。',
      '「内分泌系统」需要至少 5 台才能解锁「骨骼」，该数量条件已保留。',
      '文档中「软骨」出现了两次，分别对应「骨头」和「肌肉」前置，这里暂命名为「软骨（骨骼）」「软骨（肌肉）」。',
      '工厂价格增长倍率未在文档中给出，暂用 1.15。',
    ],
    factories: [
      { name: '心脏', cost: 100, output: 4, costResource: 'blue', outputResource: 'red', unlock: '静脉' },
      { name: '大脑', cost: 1500, output: 4, costResource: 'red', outputResource: 'blue', unlock: '脑干' },
      { name: '内分泌系统', cost: 7.5e6, output: 480, costResource: 'red', outputResource: 'blue', unlock: '顶叶' },
      { name: '骨骼', cost: 8e9, output: 1e6, costResource: 'red', outputResource: 'blue', unlock: '内分泌系统x5' },
      { name: '肌肉', cost: 1e11, output: 1.2e8, costResource: 'red', outputResource: 'blue', unlock: '骨头' },
      { name: '肺', cost: 1e13, output: 2.02e9, costResource: 'blue', outputResource: 'red', unlock: '骨骼肌肉' },
      { name: '皮肤', cost: 1e16, output: 1.2e13, costResource: 'red', outputResource: 'blue', unlock: '肺' },
    ],
    upgrades: [
      { name: '血液', cost: 25, costResource: 'blue', unlock: '无', effect: { kind: 'click', add: 1 } },
      { name: '静脉', cost: 75, costResource: 'blue', unlock: '血液', effect: { kind: 'click', add: 2 } },
      { name: '脊髓', cost: 300, costResource: 'red', unlock: '心脏', effect: { kind: 'factory', target: '心脏', multiplier: 2 } },
      { name: '脑干', cost: 1000, costResource: 'red', unlock: '脊髓', effect: { kind: 'factory', target: '心脏', multiplier: 2 } },
      { name: '神经', cost: 500, costResource: 'red', unlock: '脊髓', effect: { kind: 'factory', target: '心脏', multiplier: 2 } },
      { name: '顶叶', cost: 750000, costResource: 'blue', unlock: '大脑', effect: { kind: 'factory', target: '大脑', multiplier: 2.25 } },
      { name: '颞叶', cost: 90000, costResource: 'blue', unlock: '大脑', effect: { kind: 'factory', target: '大脑', multiplier: 2 } },
      { name: '枕叶', cost: 5000, costResource: 'blue', unlock: '大脑', effect: { kind: 'factory', target: '大脑', multiplier: 2 } },
      { name: '前额叶', cost: 2000, costResource: 'blue', unlock: '大脑', effect: { kind: 'factory', target: '大脑', multiplier: 2 } },
      { name: '眼睛', cost: 25000, costResource: 'blue', unlock: '枕叶', effect: { kind: 'factory', target: '大脑', multiplier: 1.75 } },
      { name: '右心房', cost: 4e6, costResource: 'blue', unlock: '颞叶', effect: { kind: 'factory', target: '心脏', multiplier: 126 } },
      { name: '右心室', cost: 1e9, costResource: 'blue', unlock: '右心房', effect: { kind: 'factory', target: '心脏', multiplier: 76 } },
      { name: '肾上腺', cost: 6e7, costResource: 'blue', unlock: '内分泌系统', effect: { kind: 'factory', target: '内分泌系统', multiplier: 2.5 } },
      { name: '下丘脑', cost: 1.2e7, costResource: 'blue', unlock: '内分泌系统', effect: { kind: 'factory', target: '内分泌系统', multiplier: 2 } },
      { name: '脑垂体', cost: 3.6e7, costResource: 'blue', unlock: '下丘脑', effect: { kind: 'factory', target: '内分泌系统', multiplier: 2.5 } },
      { name: '性腺', cost: 2e8, costResource: 'blue', unlock: '肾上腺', effect: { kind: 'factory', target: '内分泌系统', multiplier: 4 } },
      { name: '骨头', cost: 1.5e10, costResource: 'blue', unlock: '骨骼', effect: { kind: 'factory', target: '骨骼', multiplier: 6 } },
      { name: '软骨（骨骼）', cost: 2e14, costResource: 'blue', unlock: '骨头', effect: { kind: 'factory', target: '骨骼', multiplier: 41 } },
      { name: '骨髓', cost: 3e11, costResource: 'blue', unlock: '骨头', effect: { kind: 'factory', target: '骨骼', multiplier: 11 } },
      { name: '软骨（肌肉）', cost: 2e14, costResource: 'blue', unlock: '肌肉', effect: { kind: 'factory', target: '骨骼', multiplier: 41 } },
      { name: '骨骼肌肉', cost: 2e12, costResource: 'blue', unlock: '肌肉', effect: { kind: 'factory', target: '肌肉', multiplier: 26 } },
      { name: '支气管', cost: 8e12, costResource: 'blue', unlock: '肺', effect: { kind: 'factory', target: '肺', multiplier: 3 } },
      { name: '耳朵', cost: 7.5e13, costResource: 'blue', unlock: '支气管', effect: { kind: 'factory', target: '大脑', multiplier: 3.5 } },
      { name: '鼻子', cost: 1e13, costResource: 'blue', unlock: '支气管', effect: { kind: 'factory', target: '大脑', multiplier: 1500001 } },
      { name: '肺泡', cost: 4e15, costResource: 'blue', unlock: '支气管', effect: { kind: 'factory', target: '肺', multiplier: 51 } },
    ],
  },
];

function presetNumber(value: number) {
  return fmtNum(Number(value));
}

function parseUnlock(
  unlock: string | undefined,
  factoryIdByName: Map<string, string>,
  upgradeIdByName: Map<string, string>,
): Requirement | null {
  if (!unlock || unlock === '无') return null;
  const match = /^(.*?)(?:x(\d+))?$/.exec(unlock);
  const name = match?.[1] ?? unlock;
  const count = match?.[2] ? Number(match[2]) : 1;
  const factoryId = factoryIdByName.get(name);
  if (factoryId) {
    return { type: 'factory', id: factoryId, ...(count > 1 ? { owned: count } : {}) };
  }
  const upgradeId = upgradeIdByName.get(name);
  if (upgradeId) return { type: 'upgrade', id: upgradeId };
  return null;
}

/** 生成可直接写入存档的预设状态。 */
export function buildPresetStore(preset: Preset, { level = PRESET_DOC_LEVEL, badgePercent = 0, now = Date.now() } = {}) {
  const safeLevel = Number.isInteger(level) && level >= 1 ? level : PRESET_DOC_LEVEL;
  const safeBadge = Number.isFinite(badgePercent) && badgePercent >= 0 ? badgePercent : 0;
  const costScale = 4 ** (safeLevel - PRESET_DOC_LEVEL);
  const incomeScale = 2 ** (safeLevel - PRESET_DOC_LEVEL) * (1 + safeBadge / 100);

  const resourceDefs: PresetResource[] =
    preset.resources && preset.resources.length > 0
      ? preset.resources
      : [{ key: 'main', name: '', emoji: preset.emoji ?? '🔥' }];
  const resources = resourceDefs.map((resource) => ({
    id:
      resourceDefs.length === 1
        ? `preset_${preset.id}_res`
        : `preset_${preset.id}_res_${resource.key}`,
    emoji: resource.emoji,
    amount: '0',
    baseRate: '0',
  }));
  const resourceIdByKey = new Map(
    resourceDefs.map((resource, index) => [resource.key, resources[index].id]),
  );
  const fallbackResourceId = resources[0].id;
  const resolveResource = (key?: string) =>
    (key ? resourceIdByKey.get(key) : undefined) ?? fallbackResourceId;

  const importedUpgrades = preset.upgrades.filter(
    (upgrade) =>
      upgrade.effect.kind === 'factory' &&
      upgrade.effect.target &&
      preset.factories.some((factory) => factory.name === upgrade.effect.target),
  );
  const upgradeIdByName = new Map(
    importedUpgrades.map((upgrade, index) => [
      upgrade.name,
      `preset_${preset.id}_upg_${index}`,
    ]),
  );
  const factoryIdByName = new Map(
    preset.factories.map((factory, index) => [
      factory.name,
      `preset_${preset.id}_fac_${index}`,
    ]),
  );

  const factories = preset.factories.map((factory) => ({
    id: factoryIdByName.get(factory.name),
    name: factory.name,
    price: presetNumber(factory.cost * costScale),
    unit: presetNumber((factory.output / PRESET_DOC_GLOBAL_AD) * incomeScale),
    growth: preset.factoryGrowth ? presetNumber(preset.factoryGrowth) : '',
    owned: '0',
    outputResourceId: resolveResource(factory.outputResource),
    costResourceId: resolveResource(factory.costResource),
    requires: parseUnlock(factory.unlock, factoryIdByName, upgradeIdByName),
  }));

  const upgrades = importedUpgrades.map((upgrade, index) => ({
    id: `preset_${preset.id}_upg_${index}`,
    name: upgrade.name,
    cost: presetNumber(upgrade.cost * costScale),
    costResourceId: resolveResource(upgrade.costResource),
    targetFactoryId: factoryIdByName.get(upgrade.effect.target as string),
    multiplier: presetNumber(upgrade.effect.multiplier ?? 1),
    purchased: false,
    requires: parseUnlock(upgrade.unlock, factoryIdByName, upgradeIdByName),
  }));

  return {
    globalGrowth: '1.5',
    asOf: now,
    resources,
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
