import { parseNum } from './numbers.js';

/**
 * 把界面里的字符串状态转成纯数字状态，并做基本校验。
 * 资源数量会按离线收益倍率推算到“现在”，供规划和快速结算使用。
 *
 * @param {any} group
 * @param {{ now?: number, offlineRate?: number, globalAdMultiplier?: number }} [options]
 */
export function buildState(group, options = {}) {
  const now = options.now ?? Date.now();
  const offlineRate = options.offlineRate ?? 1;
  const globalAdMultiplier =
    Number.isFinite(options.globalAdMultiplier) && options.globalAdMultiplier > 0
      ? options.globalAdMultiplier
      : 1;
  const errors = [];

  const resources = group.resources.map((resource, index) => {
    const amount = resource.amount.trim() === '' ? 0 : parseNum(resource.amount);
    const baseRate = resource.baseRate.trim() === '' ? 0 : parseNum(resource.baseRate);
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push(`资源${index + 1} 的当前数量无效`);
    }
    if (!Number.isFinite(baseRate) || baseRate < 0) {
      errors.push(`资源${index + 1} 的基础产出无效`);
    }
    return {
      id: resource.id,
      emoji: resource.emoji,
      amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
      baseRate: Number.isFinite(baseRate) && baseRate >= 0 ? baseRate : 0,
    };
  });

  const resourceIds = new Set(resources.map((resource) => resource.id));
  const globalGrowth = parseNum(group.globalGrowth);
  const invalidFactoryIds = new Set();

  const factories = group.factories
    .map((factory, index) => {
      const price = parseNum(factory.price);
      const unit = parseNum(factory.unit);
      const growth = factory.growth.trim() === '' ? globalGrowth : parseNum(factory.growth);
      const owned = factory.owned.trim() === '' ? 0 : parseNum(factory.owned);
      const valid =
        Number.isFinite(price) &&
        price > 0 &&
        Number.isFinite(unit) &&
        unit > 0 &&
        Number.isFinite(growth) &&
        growth > 0 &&
        Number.isInteger(owned) &&
        owned >= 0 &&
        resourceIds.has(factory.outputResourceId) &&
        resourceIds.has(factory.costResourceId);

      if (!valid) {
        invalidFactoryIds.add(factory.id);
        return null;
      }

      return {
        id: factory.id,
        label: factory.name?.trim() || `工厂${index + 1}`,
        price,
        unit,
        growth,
        owned,
        outputResourceId: factory.outputResourceId,
        costResourceId: factory.costResourceId,
        requires: factory.requires ?? null,
      };
    })
    .filter(Boolean);

  const factoryIds = new Set(factories.map((factory) => factory.id));
  const ignoredUpgradeIds = new Set();
  const upgrades = group.upgrades
    .map((upgrade, index) => {
      if (!factoryIds.has(upgrade.targetFactoryId)) {
        ignoredUpgradeIds.add(upgrade.id);
        return null;
      }

      const cost = parseNum(upgrade.cost);
      const multiplier = parseNum(upgrade.multiplier);
      if (!Number.isFinite(cost) || cost <= 0) errors.push(`升级${index + 1} 的价格无效`);
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        errors.push(`升级${index + 1} 的倍率无效`);
      }
      if (!resourceIds.has(upgrade.costResourceId)) errors.push(`升级${index + 1} 的资源无效`);

      if (
        !Number.isFinite(cost) ||
        cost <= 0 ||
        !Number.isFinite(multiplier) ||
        multiplier <= 0 ||
        !resourceIds.has(upgrade.costResourceId)
      ) {
        return null;
      }

      return {
        id: upgrade.id,
        label: upgrade.name?.trim() || `升级${index + 1}`,
        cost,
        costResourceId: upgrade.costResourceId,
        targetFactoryId: upgrade.targetFactoryId,
        multiplier,
        purchased: upgrade.purchased === true,
        requires: upgrade.requires ?? null,
      };
    })
    .filter(Boolean);

  const state = { resources, factories, upgrades, globalAdMultiplier };
  state.completedUpgrades = new Set(
    Array.isArray(group.completedUpgrades) ? group.completedUpgrades : [],
  );
  state.invalidFactoryIds = [...invalidFactoryIds];
  state.ignoredUpgradeIds = [...ignoredUpgradeIds];
  const rates = computeRates(state);
  const multipliers = multipliersFor(state);
  for (const factory of state.factories) {
    factory.contributionMultiplier =
      (multipliers.get(factory.id) ?? 1) * globalAdMultiplier;
  }
  const awaySec = Math.max(0, (now - (group.asOf ?? now)) / 1000);
  for (const resource of state.resources) {
    const rate = rates.get(resource.id) ?? 0;
    resource.rate = rate;
    resource.snapshotAmount = resource.amount;
    // 运行期间只按普通产出累计；离线倍率在重新打开页面时单独结算。
    resource.amount += rate * awaySec;
  }

  const hasInput =
    group.resources.some(
      (resource) => resource.amount.trim() !== '' || resource.baseRate.trim() !== '',
    ) ||
    group.factories.some(
      (factory) =>
        factory.price.trim() !== '' ||
        factory.unit.trim() !== '' ||
        (factory.owned.trim() !== '' && factory.owned.trim() !== '0'),
    ) ||
    group.upgrades.some((upgrade) => upgrade.cost.trim() !== '');

  return {
    ok: errors.length === 0 && hasInput,
    hasInput,
    errors,
    state,
    awaySec,
    offlineRate,
  };
}

export function multipliersFor(state) {
  const multipliers = new Map(state.factories.map((factory) => [factory.id, 1]));
  for (const upgrade of state.upgrades) {
    if (!upgrade.purchased || upgrade.multiplier <= 0) continue;
    if (!multipliers.has(upgrade.targetFactoryId)) continue;
    multipliers.set(
      upgrade.targetFactoryId,
      multipliers.get(upgrade.targetFactoryId) * upgrade.multiplier,
    );
  }
  return multipliers;
}

export function computeRates(state, multipliers = multipliersFor(state)) {
  const rates = new Map(state.resources.map((resource) => [resource.id, resource.baseRate]));
  const globalMultiplier = state.globalAdMultiplier ?? 1;
  for (const factory of state.factories) {
    if (factory.owned <= 0 || factory.unit <= 0) continue;
    const contribution =
      factory.owned *
      factory.unit *
      (multipliers.get(factory.id) ?? 1) *
      globalMultiplier;
    rates.set(
      factory.outputResourceId,
      (rates.get(factory.outputResourceId) ?? 0) + contribution,
    );
  }
  return rates;
}

export function factoryContribution(state, factoryId, multipliers = multipliersFor(state)) {
  const factory = state.factories.find((item) => item.id === factoryId);
  if (!factory || factory.owned <= 0 || factory.unit <= 0) return 0;
  return (
    factory.owned *
    factory.unit *
    (multipliers.get(factory.id) ?? 1) *
    (state.globalAdMultiplier ?? 1)
  );
}

/**
 * 连续买 count 台的总价与买完后的下一台价格。
 * @param {{ price: number, growth: number }} factory
 * @param {number} count
 */
export function factoryQuote(factory, count) {
  if (
    !factory ||
    !Number.isFinite(factory.price) ||
    factory.price <= 0 ||
    !Number.isFinite(factory.growth) ||
    factory.growth <= 0 ||
    !Number.isInteger(count) ||
    count < 1
  ) {
    return null;
  }

  const totalCost =
    factory.growth === 1
      ? factory.price * count
      : (factory.price * (factory.growth ** count - 1)) / (factory.growth - 1);
  return {
    count,
    totalCost,
    nextPrice: factory.price * factory.growth ** count,
  };
}

export function resourceAmount(state, resourceId) {
  return state.resources.find((resource) => resource.id === resourceId)?.amount ?? 0;
}

export function upgradeMultiplierFor(state, factoryId, additionalUpgradeId = null) {
  const multipliers = multipliersFor(state);
  if (additionalUpgradeId) {
    const upgrade = state.upgrades.find((item) => item.id === additionalUpgradeId);
    if (upgrade && !upgrade.purchased && multipliers.has(factoryId)) {
      multipliers.set(factoryId, multipliers.get(factoryId) * upgrade.multiplier);
    }
  }
  return multipliers.get(factoryId) ?? 1;
}
