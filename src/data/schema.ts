/**
 * v6 存档结构：单一数据集 + 多资源。
 *
 * 资源只有 emoji、当前数量和基础产出，没有名称。
 *
 * {
 *   globalGrowth, asOf,
 *   resources: [{ id, emoji, amount, baseRate }],
 *   factories: [{ id, price, unit, growth, owned,
 *                 outputResourceId, costResourceId }],
 *   upgrades:  [{ id, cost, costResourceId, targetFactoryId,
 *                 multiplier, purchased }],
 *   plan, reminder
 * }
 *
 * v5 的分类（groups）会在加载时合并成一个数据集；v4/v3 的三个槽位
 * 会变成三个资源；v2 的单槽位变成一个资源。
 */

import type { Reminder } from '../types.ts';

export const STORAGE_KEY = 'cts_data_v6';

export const LEGACY_STORAGE = Object.freeze({
  v5: 'cts_data_v5',
  v4: 'cts_data_v4',
  v3: 'cts_data_v3',
  v2Inputs: 'cts_inputs_v2',
  v2Plan: 'cts_plan_v2',
});

export const SETTING_KEYS = Object.freeze({
  volume: 'cts_volume',
  half: 'cts_half',
  notation: 'cts_notation',
  offlineRate: 'cts_offline_rate',
  hideLockedUpgrades: 'cts_hide_locked_upgrades',
  planStrategy: 'cts_plan_strategy',
  globalAdMultiplier: 'cts_global_ad',
});

/** 计划算法版本；旧版本保存的计划在加载时作废并重算。 */
export const PLAN_VERSION = 13;

export const RESOURCE_EMOJIS = Object.freeze([
  '🌱',
  '⚡',
  '🧬',
  '💎',
  '🔬',
  '🧪',
  '🪐',
  '🦠',
  '🧠',
  '⚙️',
  '🚀',
  '🌌',
  '😱',
  '🔥',
]);

let idSequence = 0;

export function createId(prefix) {
  idSequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSequence.toString(36)}`;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value) {
  return value === null || value === undefined ? '' : String(value);
}

function toNumber(value) {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createEmptyResource(emoji = RESOURCE_EMOJIS[0]) {
  return {
    id: createId('res'),
    emoji: RESOURCE_EMOJIS.includes(emoji) ? emoji : RESOURCE_EMOJIS[0],
    amount: '',
    baseRate: '',
  };
}

export function createEmptyFactory(resourceId = '') {
  return {
    id: createId('fac'),
    name: '',
    price: '',
    unit: '',
    growth: '',
    owned: '0',
    outputResourceId: resourceId,
    costResourceId: resourceId,
    requires: null,
  };
}

export function createEmptyUpgrade(resourceId = '', targetFactoryId = '') {
  return {
    id: createId('upg'),
    name: '',
    cost: '',
    costResourceId: resourceId,
    targetFactoryId,
    multiplier: '2',
    purchased: false,
    requires: null,
  };
}

export function createEmptyStore() {
  const resource = createEmptyResource();
  const factory = createEmptyFactory(resource.id);
  return {
    globalGrowth: '1.5',
    asOf: null,
    resources: [resource],
    factories: [factory],
    upgrades: [],
    completedUpgrades: [],
    plan: null,
    reminder: null,
    preset: null,
  };
}

export function normalizeReminder(raw, now = Date.now()) {
  if (!isRecord(raw)) return null;
  const endTime = toNumber(raw.endTime);
  if (endTime === null) return null;

  const duration = toNumber(raw.durMs);
  const fired = raw.fired === true;
  const paused = !fired && raw.paused === true;
  const reminder: Reminder = {
    kind: raw.kind === 'half' ? 'half' : 'full',
    title: cleanResourceText(raw.title),
    body: cleanResourceText(raw.body),
    endTime,
    durMs: duration === null ? Math.max(0, endTime - now) : Math.max(0, duration),
    fired,
    paused,
  };
  if (paused) {
    const remaining = toNumber(raw.remainMs);
    reminder.remainMs = Math.max(0, remaining === null ? endTime - now : remaining);
  }
  return reminder;
}

function normalizePreset(raw) {
  if (!isRecord(raw)) return null;
  const level = toNumber(raw.level);
  const badgePercent = toNumber(raw.badgePercent);
  return {
    id: toText(raw.id),
    title: toText(raw.title),
    source: toText(raw.source),
    level: level !== null && Number.isInteger(level) && level >= 1 ? level : 1,
    badgePercent:
      badgePercent !== null && badgePercent >= 0 ? Math.round(badgePercent * 100) / 100 : 0,
    importedAt: toNumber(raw.importedAt),
  };
}

function normalizeResource(raw, index) {
  const record = isRecord(raw) ? raw : {};
  const emoji = toText(record.emoji);
  return {
    id: record.id ? toText(record.id) : createId('res'),
    emoji: RESOURCE_EMOJIS.includes(emoji)
      ? emoji
      : RESOURCE_EMOJIS[index % RESOURCE_EMOJIS.length],
    amount: toText(record.amount),
    baseRate: toText(record.baseRate),
  };
}

function normalizeRequirement(raw) {
  if (!isRecord(raw)) return null;
  if (raw.type !== 'factory' && raw.type !== 'upgrade') return null;
  const id = toText(raw.id);
  return id ? { type: raw.type, id } : null;
}

function normalizeFactory(raw, index, resourceIds) {
  const record = isRecord(raw) ? raw : {};
  const fallbackResource = resourceIds[0] ?? '';
  const outputResourceId = resourceIds.includes(toText(record.outputResourceId))
    ? toText(record.outputResourceId)
    : fallbackResource;
  const costResourceId = resourceIds.includes(toText(record.costResourceId))
    ? toText(record.costResourceId)
    : fallbackResource;

  return {
    id: record.id ? toText(record.id) : createId('fac'),
    name: toText(record.name),
    price: toText(record.price),
    unit: toText(record.unit),
    growth: toText(record.growth),
    owned: toText(record.owned ?? '0') || '0',
    outputResourceId,
    costResourceId,
    requires: normalizeRequirement(record.requires),
  };
}

function normalizeUpgrade(raw, resourceIds, factoryIds) {
  if (!isRecord(raw)) return null;
  const fallbackResource = resourceIds[0] ?? '';
  const fallbackFactory = factoryIds[0] ?? '';
  const costResourceId = resourceIds.includes(toText(raw.costResourceId))
    ? toText(raw.costResourceId)
    : fallbackResource;
  const targetFactoryId = factoryIds.includes(toText(raw.targetFactoryId))
    ? toText(raw.targetFactoryId)
    : fallbackFactory;

  return {
    id: raw.id ? toText(raw.id) : createId('upg'),
    name: toText(raw.name),
    cost: toText(raw.cost),
    costResourceId,
    targetFactoryId,
    multiplier: toText(raw.multiplier) || '2',
    purchased: raw.purchased === true,
    requires: normalizeRequirement(raw.requires),
  };
}

function normalizePlanStep(raw, dataset) {
  if (!isRecord(raw)) return null;
  const t = toNumber(raw.t);
  if (t === null || t < 0) return null;

  if (raw.type === 'buy') {
    const factory = dataset.factories.find((item) => item.id === raw.factoryId);
    if (!factory) return null;
    const price = toNumber(raw.price);
    const nth = toNumber(raw.nth);
    if (price === null || nth === null || nth < 1) return null;
    const resource = dataset.resources.find((item) => item.id === raw.resourceId);
    const offline = raw.offline === true;
    return {
      type: 'buy',
      factoryId: factory.id,
      label: toText(raw.label) || factoryLabel(dataset, factory.id),
      nth: Math.trunc(nth),
      price,
      resourceId: resource?.id ?? factory.costResourceId,
      resourceName: resource ? resourceLabel(resource) : '资源',
      t,
      offline,
      offlineBlock: offline ? Math.max(1, Math.trunc(toNumber(raw.offlineBlock) ?? 1)) : 0,
      offlineWait: Math.max(0, toNumber(raw.offlineWait) ?? 0),
    };
  }

  if (raw.type === 'upgrade') {
    const upgrade = dataset.upgrades.find((item) => item.id === raw.upgradeId);
    if (!upgrade) return null;
    const cost = toNumber(raw.cost);
    if (cost === null || cost < 0) return null;
    const resource = dataset.resources.find((item) => item.id === raw.resourceId);
    const offline = raw.offline === true;
    return {
      type: 'upgrade',
      upgradeId: upgrade.id,
      label: toText(raw.label) || upgradeLabel(dataset, upgrade.id),
      cost,
      resourceId: resource?.id ?? upgrade.costResourceId,
      resourceName: resource ? resourceLabel(resource) : '资源',
      t,
      offline,
      offlineBlock: offline ? Math.max(1, Math.trunc(toNumber(raw.offlineBlock) ?? 1)) : 0,
      offlineWait: Math.max(0, toNumber(raw.offlineWait) ?? 0),
    };
  }

  return null;
}

function normalizePlan(raw, dataset, now) {
  if (!isRecord(raw) || !Array.isArray(raw.steps) || raw.steps.length === 0) return null;
  const steps = raw.steps.map((step) => normalizePlanStep(step, dataset));
  if (steps.some((step) => step === null)) return null;

  const anchor = toNumber(raw.anchor);
  if (anchor === null || anchor <= 0) return null;

  const rawIndex = toNumber(raw.stepIndex);
  const goal = toText(raw.goal) || 'upgrades';
  const lastT = steps[steps.length - 1].t;
  const total = toNumber(raw.total) ?? lastT;
  const strategy = raw.strategy === 'offline' ? 'offline' : 'online';
  return {
    steps,
    anchor,
    stepIndex: clamp(rawIndex === null ? 0 : Math.trunc(rawIndex), 0, steps.length),
    goal,
    goalLabel:
      toText(raw.goalLabel) ||
      (goal === 'new-factory'
        ? '点出第一个新工厂'
        : `完成全部 ${dataset.upgrades.length} 个升级`),
    complete: raw.complete === true,
    total,
    generatedAt: toNumber(raw.generatedAt) ?? now,
    strategy,
    offlineBlocks: Math.max(0, Math.trunc(toNumber(raw.offlineBlocks) ?? 0)),
    onlineTime:
      strategy === 'offline' ? Math.max(0, toNumber(raw.onlineTime) ?? 0) : total,
    offlineTime:
      strategy === 'offline'
        ? Math.max(0, toNumber(raw.offlineTime) ?? total)
        : 0,
    baselineTotal: Math.max(0, toNumber(raw.baselineTotal) ?? total),
    adDoubled: strategy === 'offline' && raw.adDoubled === true,
    version: Math.max(0, Math.trunc(toNumber(raw.version) ?? 0)),
  };
}

export function normalizeStore(raw, now = Date.now()) {
  if (!isRecord(raw)) return createEmptyStore();

  const resourceSource =
    Array.isArray(raw.resources) && raw.resources.length > 0 ? raw.resources : [null];
  const resources = resourceSource.map((resource, index) => normalizeResource(resource, index));
  const resourceIds = resources.map((resource) => resource.id);

  const factorySource =
    Array.isArray(raw.factories) && raw.factories.length > 0 ? raw.factories : [null];
  const factories = factorySource.map((factory, index) =>
    normalizeFactory(factory, index, resourceIds),
  );
  const factoryIds = factories.map((factory) => factory.id);

  const upgrades = (Array.isArray(raw.upgrades) ? raw.upgrades : [])
    .map((upgrade) => normalizeUpgrade(upgrade, resourceIds, factoryIds))
    .filter(Boolean);

  // 旧存档里已购买的升级：把倍率折算进目标工厂的单台产出，不再保留隐藏乘数。
  const completed = new Set(
    (Array.isArray(raw.completedUpgrades) ? raw.completedUpgrades : [])
      .map((id) => toText(id))
      .filter(Boolean),
  );
  const activeUpgrades = [];
  for (const upgrade of upgrades) {
    if (!upgrade.purchased) {
      activeUpgrades.push(upgrade);
      continue;
    }
    completed.add(upgrade.id);
    const target = factories.find((factory) => factory.id === upgrade.targetFactoryId);
    const unit = toNumber(target?.unit);
    const multiplier = toNumber(upgrade.multiplier);
    if (target && unit !== null && unit > 0 && multiplier !== null && multiplier > 0) {
      target.unit = String(Number((unit * multiplier).toPrecision(12)));
    }
  }

  const store = {
    globalGrowth: toText(raw.globalGrowth) || '1.5',
    asOf: toNumber(raw.asOf),
    resources,
    factories,
    upgrades: activeUpgrades,
    completedUpgrades: [...completed],
    plan: null,
    reminder: null,
    preset: normalizePreset(raw.preset),
  };

  store.plan = normalizePlan(raw.plan, store, now);
  store.reminder = normalizeReminder(raw.reminder, now);
  return store;
}

export function factoryLabel(dataset, factoryId) {
  const index = dataset.factories.findIndex((factory) => factory.id === factoryId);
  const factory = index >= 0 ? dataset.factories[index] : null;
  return factory?.name?.trim() || (index >= 0 ? `工厂${index + 1}` : '工厂');
}

export function upgradeLabel(dataset, upgradeId) {
  const index = dataset.upgrades.findIndex((upgrade) => upgrade.id === upgradeId);
  const upgrade = index >= 0 ? dataset.upgrades[index] : null;
  return upgrade?.name?.trim() || (index >= 0 ? `升级${index + 1}` : '升级');
}

export function resourceLabel(resource) {
  return resource?.emoji || '资源';
}

/** 清理旧版本保存的“🌱 undefined”之类资源文案。 */
export function cleanResourceText(value) {
  return toText(value)
    .replace(/\bundefined\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
