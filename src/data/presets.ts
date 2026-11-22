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
  growth?: number;
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
  /** 文档对应的声望等级；未填时使用 PRESET_DOC_LEVEL。 */
  docLevel?: number;
  /** 文档产出是否含全局广告；未填时使用 PRESET_DOC_GLOBAL_AD。 */
  docGlobalAd?: number;
  factoryGrowth?: number;
  notes: string[];
  factories: PresetFactory[];
  upgrades: PresetUpgrade[];
}

export const PRESETS: Preset[] = [
  {
    id: 'fear',
    title: '微型探索 · 面对恐惧',
    source: 'docs/presets/微型探索 面对恐惧.md',
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
    id: 'trust',
    title: '信任有价',
    source: 'docs/presets/信任有价.md',
    docLevel: 1,
    docGlobalAd: 1,
    resources: [
      { key: 'shell', name: '货贝', emoji: '🐚' },
      { key: 'coin', name: '货币', emoji: '🪙' },
      { key: 'cash', name: '钞票', emoji: '💵' },
      { key: 'credit', name: '信用', emoji: '💳' },
    ],
    factoryGrowth: 1.15,
    notes: [
      '文档未标注声望和全局广告基准；这里暂按声望 1、产出不含全局广告录入，导入时请按游戏实际声望调整。',
      '文档尚未填写完整，当前只导入已列出的 5 个工厂和 54 个工厂效果升级。',
      '点击收益升级「渔猎采集 / 赠送礼品 / 定居 / 专业分工」暂未建模；因此「商品货币」暂不设置「专业分工」前置。',
      '工厂价格增长倍率按文档逐项录入：商品货币 1.07、硬币 1.09、纸币 1.11、电子货币 1.13、未来货币 1.15。',
      '文档里的解锁条件已转成锁定前置；工厂前置要求该工厂至少 1 台。',
    ],
    factories: [
      { name: '商品货币', cost: 25, output: 1, costResource: 'shell', outputResource: 'shell', growth: 1.07 },
      { name: '硬币', cost: 1e9, output: 1, costResource: 'shell', outputResource: 'coin', unlock: '冶金术', growth: 1.09 },
      { name: '纸币', cost: 1e9, output: 1, costResource: 'coin', outputResource: 'cash', unlock: '银行业', growth: 1.11 },
      { name: '电子货币', cost: 1e9, output: 1, costResource: 'cash', outputResource: 'credit', unlock: '法定货币', growth: 1.13 },
      { name: '未来货币', cost: 1e9, output: 100000, costResource: 'credit', outputResource: 'credit', unlock: '移动支付', growth: 1.15 },
    ],
    upgrades: [
      { name: '债务', cost: 125, costResource: 'shell', unlock: '商品货币', effect: { kind: 'factory', target: '商品货币', multiplier: 2.5 } },
      { name: '符木', cost: 5000, costResource: 'shell', unlock: '债务', effect: { kind: 'factory', target: '商品货币', multiplier: 2 } },
      { name: '记账', cost: 800000, costResource: 'shell', unlock: '符木', effect: { kind: 'factory', target: '商品货币', multiplier: 2.5 } },
      { name: '以物换物', cost: 20000, costResource: 'shell', unlock: '符木', effect: { kind: 'factory', target: '商品货币', multiplier: 2 } },
      { name: '贝壳串珠', cost: 250000, costResource: 'shell', unlock: '以物换物', effect: { kind: 'factory', target: '商品货币', multiplier: 2.5 } },
      { name: '内在价值', cost: 3e6, costResource: 'shell', unlock: '以物换物', effect: { kind: 'factory', target: '商品货币', multiplier: 2 } },
      { name: '货贝', cost: 2.5e8, costResource: 'shell', unlock: '内在价值', effect: { kind: 'factory', target: '商品货币', multiplier: 3 } },
      { name: '贵金属', cost: 9e6, costResource: 'shell', unlock: '内在价值', effect: { kind: 'factory', target: '商品货币', multiplier: 2.5 } },
      { name: '冶金术', cost: 4e7, costResource: 'shell', unlock: '贵金属', effect: { kind: 'factory', target: '商品货币', multiplier: 2.5 } },
      { name: '政府造币厂', cost: 4e10, costResource: 'shell', unlock: '冶金术', effect: { kind: 'factory', target: '商品货币', multiplier: 3 } },
      { name: '铜贝', cost: 7.5e8, costResource: 'shell', unlock: '货贝', effect: { kind: 'factory', target: '商品货币', multiplier: 5 } },
      { name: '利息', cost: 400000, costResource: 'coin', unlock: '硬币', effect: { kind: 'factory', target: '硬币', multiplier: 1.75 } },
      { name: '吕底亚硬币', cost: 5000, costResource: 'coin', unlock: '硬币', effect: { kind: 'factory', target: '硬币', multiplier: 1.75 } },
      { name: '谢克尔', cost: 600, costResource: 'coin', unlock: '硬币', effect: { kind: 'factory', target: '商品货币', multiplier: 4 } },
      { name: '中国钱币', cost: 150000, costResource: 'coin', unlock: '硬币', effect: { kind: 'factory', target: '硬币', multiplier: 2 } },
      { name: '古罗马硬币', cost: 5e6, costResource: 'coin', unlock: '谢克尔', effect: { kind: 'factory', target: '硬币', multiplier: 2 } },
      { name: '高利贷', cost: 2e6, costResource: 'coin', unlock: '谢克尔', effect: { kind: 'factory', target: '硬币', multiplier: 2 } },
      { name: '雅浦岛石币', cost: 1e7, costResource: 'coin', unlock: '谢克尔', effect: { kind: 'factory', target: '商品货币', multiplier: 101 } },
      { name: '加洛林硬币', cost: 1e7, costResource: 'coin', unlock: '古罗马硬币', effect: { kind: 'factory', target: '硬币', multiplier: 2 } },
      { name: '流通票据', cost: 2e7, costResource: 'coin', unlock: '高利贷', effect: { kind: 'factory', target: '硬币', multiplier: 2.5 } },
      { name: '银行业', cost: 8e7, costResource: 'coin', unlock: '高利贷', effect: { kind: 'factory', target: '硬币', multiplier: 3 } },
      { name: '币面图像', cost: 3e8, costResource: 'coin', unlock: '流通票据', effect: { kind: 'factory', target: '硬币', multiplier: 4 } },
      { name: '存款贷款', cost: 1e12, costResource: 'coin', unlock: '银行业', effect: { kind: 'factory', target: '硬币', multiplier: 2.5 } },
      { name: '假币', cost: 5e12, costResource: 'coin', unlock: '币面图像', effect: { kind: 'factory', target: '硬币', multiplier: 8 } },
      { name: '股票市场', cost: 1e8, costResource: 'cash', unlock: '纸币', effect: { kind: 'factory', target: '纸币', multiplier: 3 } },
      { name: '飞钱', cost: 1500, costResource: 'cash', unlock: '纸币', effect: { kind: 'factory', target: '纸币', multiplier: 2 } },
      { name: '八里亚尔', cost: 7e6, costResource: 'cash', unlock: '纸币', effect: { kind: 'factory', target: '硬币', multiplier: 101 } },
      { name: '中央银行', cost: 20000, costResource: 'cash', unlock: '纸币', effect: { kind: 'factory', target: '纸币', multiplier: 3 } },
      { name: '信用', cost: 300000, costResource: 'cash', unlock: '纸币', effect: { kind: 'factory', target: '硬币', multiplier: 11 } },
      { name: '奇普', cost: 750, costResource: 'cash', unlock: '纸币', effect: { kind: 'factory', target: '商品货币', multiplier: 1001 } },
      { name: '金本位制', cost: 750000, costResource: 'cash', unlock: '中央银行', effect: { kind: 'factory', target: '纸币', multiplier: 4 } },
      { name: '法定货币', cost: 3e6, costResource: 'cash', unlock: '金本位制', effect: { kind: 'factory', target: '纸币', multiplier: 4 } },
      { name: '通货膨胀', cost: 3e11, costResource: 'cash', unlock: '存款贷款', effect: { kind: 'factory', target: '纸币', multiplier: 21 } },
      { name: '投机泡沫', cost: 4e8, costResource: 'cash', unlock: '股票市场', effect: { kind: 'factory', target: '纸币', multiplier: 6 } },
      { name: '网上银行', cost: 200000, costResource: 'credit', unlock: '电子货币', effect: { kind: 'factory', target: '电子货币', multiplier: 5 } },
      { name: '支付卡', cost: 50000, costResource: 'credit', unlock: '电子货币', effect: { kind: 'factory', target: '电子货币', multiplier: 2 } },
      { name: '信息安全', cost: 10000, costResource: 'credit', unlock: '电子货币', effect: { kind: 'factory', target: '电子货币', multiplier: 2 } },
      { name: '税收', cost: 900, costResource: 'credit', unlock: '电子货币', effect: { kind: 'factory', target: '硬币', multiplier: 5001 } },
      { name: '电子商务', cost: 6e6, costResource: 'credit', unlock: '网上银行', effect: { kind: 'factory', target: '电子货币', multiplier: 6 } },
      { name: '电汇', cost: 5e7, costResource: 'credit', unlock: '网上银行', effect: { kind: 'factory', target: '电子货币', multiplier: 2.5 } },
      { name: '移动支付', cost: 1.5e8, costResource: 'credit', unlock: '支付卡', effect: { kind: 'factory', target: '电子货币', multiplier: 4 } },
      { name: 'ATM', cost: 500000, costResource: 'credit', unlock: '支付卡', effect: { kind: 'factory', target: '纸币', multiplier: 51 } },
      { name: 'ETF', cost: 4e8, costResource: 'credit', unlock: '电子商务', effect: { kind: 'factory', target: '电子货币', multiplier: 3 } },
      { name: '银行挤兑', cost: 2e10, costResource: 'credit', unlock: '未来货币', effect: { kind: 'factory', target: '电子货币', multiplier: 26 } },
      { name: '算法交易', cost: 3e11, costResource: 'credit', unlock: '未来货币', effect: { kind: 'factory', target: '电子货币', multiplier: 6 } },
      { name: '区块链', cost: 2e9, costResource: 'credit', unlock: '未来货币', effect: { kind: 'factory', target: '未来货币', multiplier: 3 } },
      { name: '欧元', cost: 2.5e9, costResource: 'credit', unlock: '未来货币', effect: { kind: 'factory', target: '纸币', multiplier: 1001 } },
      { name: '加密货币', cost: 1e11, costResource: 'credit', unlock: '区块链', effect: { kind: 'factory', target: '未来货币', multiplier: 3 } },
      { name: '不受监管', cost: 2e12, costResource: 'credit', unlock: '加密货币', effect: { kind: 'factory', target: '未来货币', multiplier: 3.5 } },
      { name: '虚拟货币', cost: 7.5e11, costResource: 'credit', unlock: '算法交易', effect: { kind: 'factory', target: '未来货币', multiplier: 2.5 } },
      { name: '接下来是什么？', cost: 9e11, costResource: 'credit', unlock: '虚拟货币', effect: { kind: 'factory', target: '未来货币', multiplier: 3 } },
      { name: '同一个世界，同一种货币？', cost: 1e13, costResource: 'credit', unlock: '接下来是什么？', effect: { kind: 'factory', target: '未来货币', multiplier: 3 } },
      { name: '去中心化的乌托邦？', cost: 4e13, costResource: 'credit', unlock: '同一个世界，同一种货币？', effect: { kind: 'factory', target: '未来货币', multiplier: 3 } },
      { name: '后稀缺社会？', cost: 1e14, costResource: 'credit', unlock: '去中心化的乌托邦？', effect: { kind: 'factory', target: '未来货币', multiplier: 2 } },
    ],
  },
  {
    id: 'immutable',
    title: '一成不变',
    source: 'docs/presets/一成不变的.md',
    docLevel: 1,
    docGlobalAd: 1,
    resources: [
      { key: 'mineral', name: '矿物质', emoji: '🧊' },
      { key: 'rock', name: '岩石', emoji: '🪨' },
      { key: 'crystal', name: '水晶', emoji: '🟣' },
    ],
    factoryGrowth: 1.15,
    notes: [
      '文档未标注声望和全局广告基准；这里暂按声望 1、产出不含全局广告录入，导入时请按游戏实际声望调整。',
      '点击收益升级「地球起源」暂未建模，因此「矿物」暂不设置前置；其余工厂/升级前置已转换。',
      '工厂价格增长倍率按文档的 1.15。',
      '当前导入文档中的 6 个工厂和 47 个工厂效果升级。',
      '文档工厂表中「沉积岩」解锁条件写作「沙砾」，按升级表中的「沙粒」处理。',
    ],
    factories: [
      { name: '矿物', cost: 150, output: 2, costResource: 'mineral', outputResource: 'mineral' },
      { name: '火成岩', cost: 50000, output: 1, costResource: 'mineral', outputResource: 'rock', unlock: '岩浆' },
      { name: '沉积岩', cost: 1e7, output: 250, costResource: 'mineral', outputResource: 'rock', unlock: '沙粒' },
      { name: '变质岩', cost: 3e8, output: 100000, costResource: 'mineral', outputResource: 'rock', unlock: '闪长岩' },
      { name: '晶体', cost: 4e11, output: 1, costResource: 'mineral', outputResource: 'crystal', unlock: '萤石' },
      { name: '宝石', cost: 3e12, output: 1e8, costResource: 'crystal', outputResource: 'crystal', unlock: '钻石' },
    ],
    upgrades: [
      { name: '橄榄石', cost: 400, costResource: 'mineral', unlock: '矿物', effect: { kind: 'factory', target: '矿物', multiplier: 1.5 } },
      { name: '石英', cost: 2500, costResource: 'mineral', unlock: '矿物', effect: { kind: 'factory', target: '矿物', multiplier: 1.75 } },
      { name: '长石', cost: 7800, costResource: 'mineral', unlock: '石英', effect: { kind: 'factory', target: '矿物', multiplier: 1.5 } },
      { name: '岩浆', cost: 32000, costResource: 'mineral', unlock: '石英', effect: { kind: 'factory', target: '矿物', multiplier: 2 } },
      { name: '纯橄榄岩', cost: 1000, costResource: 'rock', unlock: '火成岩', effect: { kind: 'factory', target: '火成岩', multiplier: 2 } },
      { name: '玄武岩', cost: 5000, costResource: 'rock', unlock: '火成岩', effect: { kind: 'factory', target: '火成岩', multiplier: 2 } },
      { name: '凝灰岩', cost: 18000, costResource: 'rock', unlock: '玄武岩', effect: { kind: 'factory', target: '矿物', multiplier: 2.25 } },
      { name: '粘土', cost: 900000, costResource: 'mineral', unlock: '玄武岩', effect: { kind: 'factory', target: '矿物', multiplier: 1.75 } },
      { name: '岩石循环', cost: 1.7e6, costResource: 'mineral', unlock: '玄武岩', effect: { kind: 'factory', target: '矿物', multiplier: 1.75 } },
      { name: '沙粒', cost: 4.5e6, costResource: 'mineral', unlock: '岩石循环', effect: { kind: 'factory', target: '矿物', multiplier: 2.5 } },
      { name: '石灰岩', cost: 1e6, costResource: 'rock', unlock: '沉积岩', effect: { kind: 'factory', target: '沉积岩', multiplier: 1.75 } },
      { name: '粉砂岩', cost: 6e6, costResource: 'rock', unlock: '沉积岩', effect: { kind: 'factory', target: '沉积岩', multiplier: 2 } },
      { name: '安山岩', cost: 3e7, costResource: 'rock', unlock: '沉积岩', effect: { kind: 'factory', target: '火成岩', multiplier: 31 } },
      { name: '闪长岩', cost: 3e7, costResource: 'rock', unlock: '安山岩', effect: { kind: 'factory', target: '火成岩', multiplier: 31 } },
      { name: '砂岩', cost: 2.5e8, costResource: 'rock', unlock: '安山岩', effect: { kind: 'factory', target: '矿物', multiplier: 2.25 } },
      { name: '方解石', cost: 3e8, costResource: 'mineral', unlock: '安山岩', effect: { kind: 'factory', target: '矿物', multiplier: 3.5 } },
      { name: '大理石', cost: 9e8, costResource: 'rock', unlock: '变质岩', effect: { kind: 'factory', target: '变质岩', multiplier: 1.75 } },
      { name: '板岩', cost: 4e9, costResource: 'rock', unlock: '变质岩', effect: { kind: 'factory', target: '变质岩', multiplier: 2 } },
      { name: '火山渣', cost: 1e10, costResource: 'rock', unlock: '变质岩', effect: { kind: 'factory', target: '火成岩', multiplier: 301 } },
      { name: '花岗岩', cost: 1e11, costResource: 'rock', unlock: '火山渣', effect: { kind: 'factory', target: '矿物', multiplier: 6 } },
      { name: '壳灰岩', cost: 3e11, costResource: 'rock', unlock: '火山渣', effect: { kind: 'factory', target: '沉积岩', multiplier: 101 } },
      { name: '页岩', cost: 9.5e11, costResource: 'rock', unlock: '火山渣', effect: { kind: 'factory', target: '沉积岩', multiplier: 201 } },
      { name: '片岩', cost: 5e12, costResource: 'rock', unlock: '页岩', effect: { kind: 'factory', target: '变质岩', multiplier: 201 } },
      { name: '片麻岩', cost: 9e12, costResource: 'rock', unlock: '页岩', effect: { kind: 'factory', target: '矿物', multiplier: 6 } },
      { name: '萤石', cost: 7e10, costResource: 'mineral', unlock: '页岩', effect: { kind: 'factory', target: '矿物', multiplier: 11 } },
      { name: '紫水晶', cost: 8000, costResource: 'crystal', unlock: '晶体', effect: { kind: 'factory', target: '晶体', multiplier: 2 } },
      { name: '白垩', cost: 1e14, costResource: 'rock', unlock: '紫水晶', effect: { kind: 'factory', target: '沉积岩', multiplier: 41 } },
      { name: '伟晶岩', cost: 5e14, costResource: 'rock', unlock: '紫水晶', effect: { kind: 'factory', target: '矿物', multiplier: 101 } },
      { name: '碧玉', cost: 500000, costResource: 'crystal', unlock: '紫水晶', effect: { kind: 'factory', target: '晶体', multiplier: 6 } },
      { name: '燧石', cost: 2e15, costResource: 'rock', unlock: '碧玉', effect: { kind: 'factory', target: '沉积岩', multiplier: 41 } },
      { name: '闪电岩', cost: 1.2e16, costResource: 'rock', unlock: '碧玉', effect: { kind: 'factory', target: '晶体', multiplier: 11 } },
      { name: '黄玉', cost: 4.5e7, costResource: 'crystal', unlock: '碧玉', effect: { kind: 'factory', target: '晶体', multiplier: 21 } },
      { name: '黑曜石', cost: 6e16, costResource: 'rock', unlock: '黄玉', effect: { kind: 'factory', target: '火成岩', multiplier: 35001 } },
      { name: '煤', cost: 9e16, costResource: 'rock', unlock: '黄玉', effect: { kind: 'factory', target: '矿物', multiplier: 101 } },
      { name: '无烟煤', cost: 1e17, costResource: 'rock', unlock: '煤', effect: { kind: 'factory', target: '变质岩', multiplier: 15001 } },
      { name: '青金石', cost: 9e17, costResource: 'rock', unlock: '煤', effect: { kind: 'factory', target: '晶体', multiplier: 31 } },
      { name: '钻石', cost: 1e11, costResource: 'crystal', unlock: '煤', effect: { kind: 'factory', target: '晶体', multiplier: 41 } },
      { name: '祖母绿', cost: 3.3e12, costResource: 'crystal', unlock: '宝石', effect: { kind: 'factory', target: '宝石', multiplier: 2.5 } },
      { name: '海蓝宝石', cost: 6e12, costResource: 'crystal', unlock: '宝石', effect: { kind: 'factory', target: '宝石', multiplier: 2.5 } },
      { name: '黄铁矿', cost: 2.5e13, costResource: 'crystal', unlock: '宝石', effect: { kind: 'factory', target: '晶体', multiplier: 21 } },
      { name: '蛋白石', cost: 9e13, costResource: 'crystal', unlock: '黄铁矿', effect: { kind: 'factory', target: '宝石', multiplier: 3 } },
      { name: '石榴石', cost: 3e14, costResource: 'crystal', unlock: '黄铁矿', effect: { kind: 'factory', target: '宝石', multiplier: 3 } },
      { name: '实验室培育的宝石', cost: 1.2e15, costResource: 'crystal', unlock: '宝石', effect: { kind: 'factory', target: '晶体', multiplier: 31 } },
      { name: '蓝宝石', cost: 3e15, costResource: 'crystal', unlock: '实验室培育的宝石', effect: { kind: 'factory', target: '宝石', multiplier: 6 } },
      { name: '红宝石', cost: 1.5e16, costResource: 'crystal', unlock: '实验室培育的宝石', effect: { kind: 'factory', target: '宝石', multiplier: 6 } },
      { name: '玉石', cost: 1.2e17, costResource: 'crystal', unlock: '实验室培育的宝石', effect: { kind: 'factory', target: '变质岩', multiplier: 888 } },
      { name: '自然之美', cost: 2.5e21, costResource: 'rock', unlock: '玉石', effect: { kind: 'factory', target: '沉积岩', multiplier: 2 } },
    ],
  },
  {
    id: 'anatomy',
    title: '生命解剖学',
    source: 'docs/presets/生命解剖学.md',
    docLevel: 1,
    resources: [
      { key: 'blue', name: '脱氧血液', emoji: '🔵' },
      { key: 'red', name: '带氧血液', emoji: '🔴' },
    ],
    factoryGrowth: 1.15,
    notes: [
      '文档数值以声望 1 为基准：成本不额外缩放，收入按声望 ×2/级、徽章再乘 (1 + 徽章%/100)。',
      '文档数值包含全局广告 ×4；导入时先除以 4 存成基准产出，请在页面顶部选择实际广告倍率。',
      '文档数据尚未填写完整，后续可能继续补充。',
      '点击收益升级「血液」「静脉」未纳入工厂产出规划；因此「心脏」的解锁条件暂未建模，其余工厂/升级前置已转成锁定条件。',
      '「内分泌系统」需要至少 5 台才能解锁「骨骼」，该数量条件已保留。',
      '工厂价格增长倍率未在文档中给出，暂用 1.15。',
    ],
    factories: [
      { name: '心脏', cost: 100, output: 4, costResource: 'blue', outputResource: 'red', unlock: '静脉' },
      { name: '大脑', cost: 1500, output: 4, costResource: 'red', outputResource: 'blue', unlock: '脑干' },
      { name: '内分泌系统', cost: 7.5e6, output: 480, costResource: 'red', outputResource: 'blue', unlock: '顶叶' },
      { name: '骨骼', cost: 8e9, output: 1e6, costResource: 'red', outputResource: 'blue', unlock: '内分泌系统x5' },
      { name: '肌肉', cost: 1e11, output: 4e7, costResource: 'red', outputResource: 'blue', unlock: '骨头' },
      { name: '肺', cost: 1e13, output: 2.03e9, costResource: 'blue', outputResource: 'red', unlock: '骨骼肌肉' },
      { name: '皮肤', cost: 1e16, output: 1.2e13, costResource: 'red', outputResource: 'blue', unlock: '肺' },
      { name: '胃', cost: 2e18, output: 7.8e17, costResource: 'red', outputResource: 'blue', unlock: '消化' },
      { name: '肾脏', cost: 2.5e20, output: 1.3e20, costResource: 'red', outputResource: 'blue', unlock: '消化' },
      { name: '肝', cost: 6e23, output: 1.3e22, costResource: 'red', outputResource: 'blue', unlock: '消化' },
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
      { name: '软骨', cost: 2e14, costResource: 'blue', unlock: '骨头', effect: { kind: 'factory', target: '骨骼', multiplier: 41 } },
      { name: '骨髓', cost: 3e11, costResource: 'blue', unlock: '骨头', effect: { kind: 'factory', target: '骨骼', multiplier: 11 } },
      { name: '肌腱', cost: 8e14, costResource: 'blue', unlock: '骨骼肌肉', effect: { kind: 'factory', target: '肌肉', multiplier: 31 } },
      { name: '骨骼肌肉', cost: 2e12, costResource: 'blue', unlock: '肌肉', effect: { kind: 'factory', target: '肌肉', multiplier: 26 } },
      { name: '支气管', cost: 8e12, costResource: 'blue', unlock: '肺', effect: { kind: 'factory', target: '肺', multiplier: 3 } },
      { name: '耳朵', cost: 7.5e13, costResource: 'blue', unlock: '支气管', effect: { kind: 'factory', target: '大脑', multiplier: 3.5 } },
      { name: '鼻子', cost: 1e13, costResource: 'blue', unlock: '支气管', effect: { kind: 'factory', target: '大脑', multiplier: 1500001 } },
      { name: '肺泡', cost: 4e15, costResource: 'blue', unlock: '支气管', effect: { kind: 'factory', target: '肺', multiplier: 51 } },
      { name: '甲状腺', cost: 7.5e19, costResource: 'blue', unlock: '皮肤', effect: { kind: 'factory', target: '内分泌系统', multiplier: 5 } },
      { name: '皮下组织', cost: 8e17, costResource: 'blue', unlock: '皮肤', effect: { kind: 'factory', target: '皮肤', multiplier: 4 } },
      { name: '表皮层', cost: 5e16, costResource: 'blue', unlock: '皮肤', effect: { kind: 'factory', target: '皮肤', multiplier: 2 } },
      { name: '真皮层', cost: 3e17, costResource: 'blue', unlock: '皮肤', effect: { kind: 'factory', target: '皮肤', multiplier: 2 } },
      { name: '松果体', cost: 5e18, costResource: 'blue', unlock: '皮肤', effect: { kind: 'factory', target: '内分泌系统', multiplier: 7.5e9 } },
      { name: '关节', cost: 4e14, costResource: 'blue', unlock: '软骨', effect: { kind: 'factory', target: '骨骼', multiplier: 2.5 } },
      { name: '嘴巴', cost: 3e20, costResource: 'blue', unlock: '表皮层', effect: { kind: 'factory', target: '大脑', multiplier: 5000001 } },
      { name: '消化', cost: 1.5e21, costResource: 'blue', unlock: '嘴巴', effect: { kind: 'factory', target: '心脏', multiplier: 2.5e7 } },
      { name: '平滑肌', cost: 4e21, costResource: 'blue', unlock: '胃', effect: { kind: 'factory', target: '肌肉', multiplier: 2500001 } },
      { name: '小肠', cost: 1.5e22, costResource: 'blue', unlock: '胃', effect: { kind: 'factory', target: '胃', multiplier: 7 } },
      { name: '左心房', cost: 4e23, costResource: 'blue', unlock: '平滑肌', effect: { kind: 'factory', target: '心脏', multiplier: 501 } },
      { name: '大肠', cost: 2e22, costResource: 'blue', unlock: '小肠', effect: { kind: 'factory', target: '胃', multiplier: 8 } },
      { name: '左心室', cost: 3e25, costResource: 'blue', unlock: '左心房', effect: { kind: 'factory', target: '心脏', multiplier: 2001 } },
      { name: '输尿管', cost: 7.5e24, costResource: 'blue', unlock: '肾脏', effect: { kind: 'factory', target: '肾脏', multiplier: 3 } },
      { name: '膀胱', cost: 1.5e25, costResource: 'blue', unlock: '输尿管', effect: { kind: 'factory', target: '肾脏', multiplier: 6 } },
      { name: '主动脉', cost: 1e28, costResource: 'blue', unlock: '肝', effect: { kind: 'factory', target: '肝', multiplier: 2 } },
      { name: '胆囊', cost: 5e26, costResource: 'blue', unlock: '肝', effect: { kind: 'factory', target: '肝', multiplier: 7 } },
      { name: '胰腺', cost: 3e27, costResource: 'blue', unlock: '肝', effect: { kind: 'factory', target: '肝', multiplier: 3 } },
    ],
  },
  {
    id: 'universe',
    title: '展开宇宙',
    source: 'docs/presets/展开宇宙.md',
    docLevel: 1,
    docGlobalAd: 1,
    resources: [
      { key: 'honeycomb', name: '蜂巢镜', emoji: '🟨' },
    ],
    factoryGrowth: 1.15,
    notes: [
      '文档未标注声望和全局广告基准；这里暂按声望 1、产出不含全局广告录入，导入时请按游戏实际声望调整。',
      '点击/占位升级「仰望星空」暂未建模，因此「地面望远镜」暂不设置前置；其余工厂/升级前置已转换。',
      '工厂价格增长倍率按文档统一为 1.15。',
      '当前导入文档中的 6 个工厂和 34 个工厂效果升级。',
      '文档中「詹姆斯·E·韦布望远镜」「詹姆斯·E·韦伯」等写法统一映射到工厂「詹姆斯·韦布望远镜」。',
    ],
    factories: [
      { name: '地面望远镜', cost: 15, output: 0.5, costResource: 'honeycomb', outputResource: 'honeycomb' },
      { name: '哈勃望远镜', cost: 2500, output: 4, costResource: 'honeycomb', outputResource: 'honeycomb', unlock: '太空望远镜' },
      { name: '詹姆斯·韦布望远镜', cost: 50000, output: 40, costResource: 'honeycomb', outputResource: 'honeycomb', unlock: '哈勃继任者' },
      { name: '研发', cost: 6e7, output: 4000, costResource: 'honeycomb', outputResource: 'honeycomb', unlock: '任务目标' },
      { name: '建造', cost: 2.5e10, output: 6e5, costResource: 'honeycomb', outputResource: 'honeycomb', unlock: '经费' },
      { name: '发射', cost: 1.2e11, output: 3.25e6, costResource: 'honeycomb', outputResource: 'honeycomb', unlock: '推迟发射' },
    ],
    upgrades: [
      { name: '太空望远镜', cost: 150, costResource: 'honeycomb', unlock: '地面望远镜', effect: { kind: 'factory', target: '地面望远镜', multiplier: 2 } },
      { name: '起源', cost: 700, costResource: 'honeycomb', unlock: '太空望远镜', effect: { kind: 'factory', target: '地面望远镜', multiplier: 2 } },
      { name: '维修任务', cost: 10000, costResource: 'honeycomb', unlock: '哈勃望远镜', effect: { kind: 'factory', target: '哈勃望远镜', multiplier: 2 } },
      { name: '划时代的发现', cost: 20000, costResource: 'honeycomb', unlock: '维修任务', effect: { kind: 'factory', target: '哈勃望远镜', multiplier: 1.5 } },
      { name: '哈勃继任者', cost: 50000, costResource: 'honeycomb', unlock: '划时代的发现', effect: { kind: 'factory', target: '哈勃望远镜', multiplier: 1.5 } },
      { name: '与地球的距离', cost: 500000, costResource: 'honeycomb', unlock: '划时代的发现', effect: { kind: 'factory', target: '哈勃望远镜', multiplier: 3 } },
      { name: '国际合作', cost: 2.5e9, costResource: 'honeycomb', unlock: '詹姆斯·韦布望远镜', effect: { kind: 'factory', target: '詹姆斯·韦布望远镜', multiplier: 3 } },
      { name: '任务目标', cost: 3e7, costResource: 'honeycomb', unlock: '詹姆斯·韦布望远镜', effect: { kind: 'factory', target: '詹姆斯·韦布望远镜', multiplier: 2 } },
      { name: '詹姆斯·E·韦伯', cost: 200000, costResource: 'honeycomb', unlock: '詹姆斯·韦布望远镜', effect: { kind: 'factory', target: '詹姆斯·韦布望远镜', multiplier: 2 } },
      { name: '命名', cost: 3e6, costResource: 'honeycomb', unlock: '詹姆斯·E·韦伯', effect: { kind: 'factory', target: '詹姆斯·韦布望远镜', multiplier: 2 } },
      { name: '尺寸对比', cost: 7e6, costResource: 'honeycomb', unlock: '与地球的距离', effect: { kind: 'factory', target: '哈勃望远镜', multiplier: 3 } },
      { name: '洗清嫌疑', cost: 4e8, costResource: 'honeycomb', unlock: '命名', effect: { kind: 'factory', target: '詹姆斯·韦布望远镜', multiplier: 3.5 } },
      { name: '任务时长', cost: 2.5e9, costResource: 'honeycomb', unlock: '任务目标', effect: { kind: 'factory', target: '詹姆斯·韦布望远镜', multiplier: 2.5 } },
      { name: '预算', cost: 6e9, costResource: 'honeycomb', unlock: '研发', effect: { kind: 'factory', target: '詹姆斯·韦布望远镜', multiplier: 2 } },
      { name: '黑洞', cost: 2e8, costResource: 'honeycomb', unlock: '研发', effect: { kind: 'factory', target: '研发', multiplier: 2 } },
      { name: '星系诞生', cost: 1.2e9, costResource: 'honeycomb', unlock: '黑洞', effect: { kind: 'factory', target: '研发', multiplier: 2 } },
      { name: '寻找系外行星', cost: 2e10, costResource: 'honeycomb', unlock: '星系诞生', effect: { kind: 'factory', target: '研发', multiplier: 2 } },
      { name: '经费', cost: 1.5e10, costResource: 'honeycomb', unlock: '预算', effect: { kind: 'factory', target: '研发', multiplier: 3 } },
      { name: '幸免取消', cost: 5e10, costResource: 'honeycomb', unlock: '经费', effect: { kind: 'factory', target: '研发', multiplier: 2 } },
      { name: '红外观测能力', cost: 3e10, costResource: 'honeycomb', unlock: '建造', effect: { kind: 'factory', target: '建造', multiplier: 1.5 } },
      { name: '微型百叶窗', cost: 9e10, costResource: 'honeycomb', unlock: '建造', effect: { kind: 'factory', target: '建造', multiplier: 2 } },
      { name: '危险热量', cost: 2.5e11, costResource: 'honeycomb', unlock: '红外观测能力', effect: { kind: 'factory', target: '建造', multiplier: 1.5 } },
      { name: '推迟发射', cost: 1.2e11, costResource: 'honeycomb', unlock: '幸免取消', effect: { kind: 'factory', target: '研发', multiplier: 2 } },
      { name: '六角镜', cost: 1.5e12, costResource: 'honeycomb', unlock: '微型百叶窗', effect: { kind: 'factory', target: '建造', multiplier: 2.5 } },
      { name: '遮阳板', cost: 5e11, costResource: 'honeycomb', unlock: '危险热量', effect: { kind: 'factory', target: '建造', multiplier: 1.5 } },
      { name: '地面支持', cost: 4e12, costResource: 'honeycomb', unlock: '发射', effect: { kind: 'factory', target: '詹姆斯·韦布望远镜', multiplier: 1001 } },
      { name: '圣诞发射', cost: 1e12, costResource: 'honeycomb', unlock: '发射', effect: { kind: 'factory', target: '发射', multiplier: 2 } },
      { name: 'L2 飞行之旅', cost: 2.5e12, costResource: 'honeycomb', unlock: '圣诞发射', effect: { kind: 'factory', target: '发射', multiplier: 2 } },
      { name: '遮阳板展开', cost: 1.2e13, costResource: 'honeycomb', unlock: 'L2 飞行之旅', effect: { kind: 'factory', target: '发射', multiplier: 2 } },
      { name: '镜片展开', cost: 2e13, costResource: 'honeycomb', unlock: '遮阳板展开', effect: { kind: 'factory', target: '发射', multiplier: 2 } },
      { name: '副镜', cost: 4e13, costResource: 'honeycomb', unlock: '镜片展开', effect: { kind: 'factory', target: '发射', multiplier: 3 } },
      { name: '主镜', cost: 9e13, costResource: 'honeycomb', unlock: '镜片展开', effect: { kind: 'factory', target: '发射', multiplier: 3 } },
      { name: '热身期', cost: 3e14, costResource: 'honeycomb', unlock: '主镜', effect: { kind: 'factory', target: '发射', multiplier: 4 } },
      { name: '第一批图像', cost: 1e15, costResource: 'honeycomb', unlock: '热身期', effect: { kind: 'factory', target: '发射', multiplier: 2 } },
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
export function buildPresetStore(preset: Preset, { level, badgePercent = 0, now = Date.now() }: { level?: number; badgePercent?: number; now?: number } = {}) {
  const baseLevel = preset.docLevel ?? PRESET_DOC_LEVEL;
  const docGlobalAd = preset.docGlobalAd ?? PRESET_DOC_GLOBAL_AD;
  const safeLevel = Number.isInteger(level) && (level as number) >= 1 ? (level as number) : baseLevel;
  const safeBadge = Number.isFinite(badgePercent) && badgePercent >= 0 ? badgePercent : 0;
  const costScale = 4 ** (safeLevel - baseLevel);
  const incomeScale = 2 ** (safeLevel - baseLevel) * (1 + safeBadge / 100);

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
    unit: presetNumber((factory.output / docGlobalAd) * incomeScale),
    growth: factory.growth ? String(factory.growth) : preset.factoryGrowth ? String(preset.factoryGrowth) : '',
    owned: '0',
    outputResourceId: resolveResource(factory.outputResource),
    costResourceId: resolveResource(factory.costResource),
    active: true,
    requires: parseUnlock(factory.unlock, factoryIdByName, upgradeIdByName),
  }));

  const upgrades = importedUpgrades.map((upgrade, index) => ({
    id: `preset_${preset.id}_upg_${index}`,
    name: upgrade.name,
    cost: presetNumber(upgrade.cost * costScale),
    costResourceId: resolveResource(upgrade.costResource),
    targetFactoryId: factoryIdByName.get(upgrade.effect.target as string),
    multiplier: presetNumber(upgrade.effect.multiplier ?? 1),
    effect: 'multiply',
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
