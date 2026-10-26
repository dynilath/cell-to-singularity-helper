import {
  LEGACY_STORAGE,
  RESOURCE_EMOJIS,
  SETTING_KEYS,
  STORAGE_KEY,
  createEmptyFactory,
  createEmptyResource,
  createEmptyStore,
  createEmptyUpgrade,
  normalizeReminder,
  normalizeStore,
} from './schema.js';
import { normalizeNotation } from '../core/numbers.js';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value) {
  return value === null || value === undefined ? '' : String(value);
}

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function hasData(value) {
  if (!isRecord(value)) return false;
  if (value.plan || value.reminder) return true;
  if (Array.isArray(value.factories)) {
    if (
      value.factories.some(
        (factory) =>
          isRecord(factory) &&
          (toText(factory.price).trim() ||
            toText(factory.unit).trim() ||
            (toText(factory.owned).trim() && toText(factory.owned) !== '0')),
      )
    ) {
      return true;
    }
  }
  if (Array.isArray(value.resources)) {
    if (
      value.resources.some(
        (resource) =>
          isRecord(resource) &&
          (toText(resource.amount).trim() || toText(resource.baseRate).trim()),
      )
    ) {
      return true;
    }
  }
  if (Array.isArray(value.upgrades)) {
    if (value.upgrades.some((upgrade) => isRecord(upgrade) && toText(upgrade.cost).trim())) {
      return true;
    }
  }
  return false;
}

function slotHasData(slot) {
  if (!isRecord(slot)) return false;
  if (slot.plan || slot.armed || slot.armedHalf) return true;
  const inputs = isRecord(slot.inputs) ? slot.inputs : {};
  if (toText(inputs.cur).trim() || toText(inputs.rate).trim() || toText(inputs.up).trim()) {
    return true;
  }
  return Boolean(
    Array.isArray(inputs.facs) &&
      inputs.facs.some(
        (factory) =>
          isRecord(factory) &&
          (toText(factory.p).trim() || toText(factory.u).trim() || toText(factory.g).trim()),
      ),
  );
}

/**
 * v5 的 groups 合并成一个数据集：每个分类变成一组资源；工厂/升级引用保持。
 * 计划/提醒的旧目标范围不再适用，迁移时丢弃，由新数据重新规划。
 */
function flattenV5(raw) {
  const groups = Array.isArray(raw?.groups) ? raw.groups : [];
  const resources = [];
  const factories = [];
  const upgrades = [];
  let globalGrowth = '1.5';
  let asOf = null;
  let emojiIndex = 0;

  for (const group of groups) {
    if (!hasData(group)) continue;
    if (globalGrowth === '1.5' && toText(group.globalGrowth)) globalGrowth = toText(group.globalGrowth);
    if (asOf === null && Number.isFinite(Number(group.asOf))) asOf = Number(group.asOf);

    const groupResources = Array.isArray(group.resources) ? group.resources : [];
    if (groupResources.length === 0) continue;
    const resourceMap = new Map();
    for (const [resourceIndex, resource] of groupResources.entries()) {
      const emoji =
        resourceIndex === 0 && group.emoji
          ? group.emoji
          : RESOURCE_EMOJIS[emojiIndex % RESOURCE_EMOJIS.length];
      const created = createEmptyResource(emoji);
      emojiIndex += 1;
      created.amount = toText(resource.amount);
      created.baseRate = toText(resource.baseRate);
      resourceMap.set(toText(resource.id), created.id);
      resources.push(created);
    }

    const groupFactories = Array.isArray(group.factories) ? group.factories : [];
    const factoryMap = new Map();
    for (const factory of groupFactories) {
      const created = createEmptyFactory();
      created.price = toText(factory.price);
      created.unit = toText(factory.unit);
      created.growth = toText(factory.growth);
      created.owned = toText(factory.owned ?? '0') || '0';
      created.outputResourceId =
        resourceMap.get(toText(factory.outputResourceId)) ?? resources[0]?.id ?? '';
      created.costResourceId =
        resourceMap.get(toText(factory.costResourceId)) ?? resources[0]?.id ?? '';
      factoryMap.set(toText(factory.id), created.id);
      factories.push(created);
    }

    const groupUpgrades = Array.isArray(group.upgrades) ? group.upgrades : [];
    for (const upgrade of groupUpgrades) {
      const created = createEmptyUpgrade();
      created.cost = toText(upgrade.cost);
      created.costResourceId =
        resourceMap.get(toText(upgrade.costResourceId)) ?? resources[0]?.id ?? '';
      created.targetFactoryId =
        factoryMap.get(toText(upgrade.targetFactoryId)) ?? factories[0]?.id ?? '';
      created.multiplier = toText(upgrade.multiplier) || '2';
      created.purchased = upgrade.purchased === true;
      upgrades.push(created);
    }
  }

  if (resources.length === 0) return createEmptyStore();
  return normalizeStore({ globalGrowth, asOf, resources, factories, upgrades });
}

/**
 * v4/v3 的固定三个槽位是为不同资源准备的；每个非空槽位变成一个资源，
 * 它的工厂/升级跟随该资源合并进同一个数据集。
 */
function flattenLegacySlots(raw) {
  const slots = Array.isArray(raw?.slots) ? raw.slots : [null];
  const active = Number.isInteger(Number(raw?.active)) ? Number(raw.active) : 0;
  const resources = [];
  const factories = [];
  const upgrades = [];
  let globalGrowth = '1.5';
  let asOf = null;
  let reminder = null;

  slots.forEach((slot, index) => {
    if (!slotHasData(slot)) return;
    const inputs = isRecord(slot.inputs) ? slot.inputs : {};
    const resource = createEmptyResource(
      RESOURCE_EMOJIS[index % RESOURCE_EMOJIS.length],
    );
    resource.amount = toText(inputs.cur);
    resource.baseRate = toText(inputs.rate);
    resources.push(resource);
    if (asOf === null && Number.isFinite(Number(inputs.asOf))) asOf = Number(inputs.asOf);
    if (globalGrowth === '1.5' && toText(inputs.gg)) globalGrowth = toText(inputs.gg);

    const slotFactories = [];
    const legacyFactories = Array.isArray(inputs.facs) ? inputs.facs : [];
    for (const factory of legacyFactories) {
      const created = createEmptyFactory(resource.id);
      created.price = toText(factory.p);
      created.unit = toText(factory.u);
      created.growth = toText(factory.g);
      created.owned = '0';
      slotFactories.push(created);
      factories.push(created);
    }
    if (slotFactories.length === 0) {
      const created = createEmptyFactory(resource.id);
      slotFactories.push(created);
      factories.push(created);
    }

    if (toText(inputs.up).trim()) {
      const upgrade = createEmptyUpgrade(resource.id, slotFactories[0].id);
      upgrade.cost = toText(inputs.up);
      upgrade.multiplier = '1';
      upgrades.push(upgrade);
    }

    const legacyReminder = slot.armedHalf ? { ...slot.armedHalf, kind: 'half' } : slot.armed;
    if (!reminder && legacyReminder) {
      reminder = normalizeReminder(legacyReminder);
    }
    if (index === active && legacyReminder) {
      reminder = normalizeReminder(legacyReminder);
    }
  });

  if (resources.length === 0) return createEmptyStore();
  return normalizeStore({ globalGrowth, asOf, resources, factories, upgrades, reminder });
}

function flattenV2(inputs) {
  const source = isRecord(inputs) ? inputs : {};
  return flattenLegacySlots({
    active: 0,
    slots: [{ inputs: source }],
  });
}

export function loadStore(storage, now = Date.now()) {
  const current = readJson(storage, STORAGE_KEY);
  if (current) return normalizeStore(current, now);

  const v5 = readJson(storage, LEGACY_STORAGE.v5);
  if (v5) return normalizeStore(flattenV5(v5), now);

  const v4 = readJson(storage, LEGACY_STORAGE.v4);
  if (v4) return normalizeStore(flattenLegacySlots(v4), now);

  const v3 = readJson(storage, LEGACY_STORAGE.v3);
  if (v3) return normalizeStore(flattenLegacySlots(v3), now);

  const v2Inputs = readJson(storage, LEGACY_STORAGE.v2Inputs);
  if (v2Inputs) return normalizeStore(flattenV2(v2Inputs), now);

  return createEmptyStore();
}

export function saveStore(storage, store) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {{ volume: number, half: boolean, notation: 'short' | 'chinese' | 'scientific', offlineRate: number, hideLockedUpgrades: boolean, planStrategy: 'online' | 'offline', globalAdMultiplier: 1 | 2 | 4 }}
 */
export function loadSettings(storage) {
  let volume = 1;
  try {
    const rawVolume = storage.getItem(SETTING_KEYS.volume);
    const parsed = rawVolume === null ? 1 : Number.parseFloat(rawVolume);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) volume = parsed;
  } catch {
    volume = 1;
  }

  let half = true;
  try {
    const rawHalf = storage.getItem(SETTING_KEYS.half);
    half = rawHalf === null ? true : rawHalf === '1';
  } catch {
    half = true;
  }

  let notation = 'short';
  try {
    notation = normalizeNotation(storage.getItem(SETTING_KEYS.notation) ?? 'short');
  } catch {
    notation = 'short';
  }

  let offlineRate = 1;
  try {
    const rawOfflineRate = storage.getItem(SETTING_KEYS.offlineRate);
    const parsed = rawOfflineRate === null ? 1 : Number.parseFloat(rawOfflineRate);
    if (Number.isFinite(parsed) && parsed > 0) offlineRate = parsed;
  } catch {
    offlineRate = 1;
  }

  let hideLockedUpgrades = false;
  try {
    hideLockedUpgrades = storage.getItem(SETTING_KEYS.hideLockedUpgrades) === '1';
  } catch {
    hideLockedUpgrades = false;
  }

  let planStrategy = 'online';
  try {
    planStrategy = storage.getItem(SETTING_KEYS.planStrategy) === 'offline' ? 'offline' : 'online';
  } catch {
    planStrategy = 'online';
  }

  let globalAdMultiplier = 1;
  try {
    const parsed = Number.parseFloat(
      storage.getItem(SETTING_KEYS.globalAdMultiplier) ?? '1',
    );
    if (parsed === 1 || parsed === 2 || parsed === 4) globalAdMultiplier = parsed;
  } catch {
    globalAdMultiplier = 1;
  }

  return {
    volume,
    half,
    notation,
    offlineRate,
    hideLockedUpgrades,
    planStrategy,
    globalAdMultiplier,
  };
}

export function saveVolume(storage, volume) {
  try {
    storage.setItem(SETTING_KEYS.volume, String(volume));
  } catch {
    // 隐私模式或配额满时静默失败：音量只是偏好，不影响主流程。
  }
}

export function saveHalf(storage, half) {
  try {
    storage.setItem(SETTING_KEYS.half, half ? '1' : '0');
  } catch {
    // 同上。
  }
}

export function saveNotation(storage, notation) {
  try {
    storage.setItem(SETTING_KEYS.notation, normalizeNotation(notation));
  } catch {
    // 同上。
  }
}

export function saveOfflineRate(storage, rate) {
  try {
    storage.setItem(SETTING_KEYS.offlineRate, String(rate));
  } catch {
    // 同上。
  }
}

export function saveHideLockedUpgrades(storage, hide) {
  try {
    storage.setItem(SETTING_KEYS.hideLockedUpgrades, hide ? '1' : '0');
  } catch {
    // 同上。
  }
}

export function savePlanStrategy(storage, strategy) {
  try {
    storage.setItem(
      SETTING_KEYS.planStrategy,
      strategy === 'offline' ? 'offline' : 'online',
    );
  } catch {
    // 同上。
  }
}

export function saveGlobalAdMultiplier(storage, multiplier) {
  try {
    storage.setItem(
      SETTING_KEYS.globalAdMultiplier,
      String(multiplier === 2 || multiplier === 4 ? multiplier : 1),
    );
  } catch {
    // 同上。
  }
}
