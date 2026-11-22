import { parseNum } from '../core/numbers.ts';

/** 前置条件：{ type: 'factory' | 'upgrade', id }。 */

export function isUpgradeCompleted(group, upgradeId) {
  return Array.isArray(group.completedUpgrades) && group.completedUpgrades.includes(upgradeId);
}

export function completedUpgradeSet(group) {
  return new Set(Array.isArray(group.completedUpgrades) ? group.completedUpgrades : []);
}

function factoryName(group, factoryId) {
  const index = group.factories.findIndex((factory) => factory.id === factoryId);
  const factory = index >= 0 ? group.factories[index] : null;
  return factory?.name?.trim() || (index >= 0 ? `工厂${index + 1}` : '工厂');
}

function upgradeName(group, upgradeId) {
  const index = group.upgrades.findIndex((upgrade) => upgrade.id === upgradeId);
  const upgrade = index >= 0 ? group.upgrades[index] : null;
  return upgrade?.name?.trim() || (index >= 0 ? `升级${index + 1}` : '升级');
}

export function requirementReason(group, requires) {
  if (!requires || typeof requires !== 'object') return null;
  if (requires.type === 'upgrade') {
    if (isUpgradeCompleted(group, requires.id)) return null;
    return `需先购买「${upgradeName(group, requires.id)}」`;
  }
  if (requires.type === 'factory') {
    const factory = group.factories.find((item) => item.id === requires.id);
    const need = Math.max(1, Number(requires.owned) || 1);
    if (factory && (parseNum(factory.owned) || 0) >= need) return null;
    return `需先拥有「${factoryName(group, requires.id)}」至少 ${need} 台`;
  }
  return null;
}

export function requirementsReason(group, requires, requiresAll = []) {
  for (const requirement of [requires, ...(requiresAll ?? [])]) {
    const reason = requirementReason(group, requirement);
    if (reason) return reason;
  }
  return null;
}

/** 工厂锁定原因；已拥有 >0 的工厂视为已经解锁，可继续购买。 */
export function factoryLockReason(group, factory) {
  if ((parseNum(factory.owned) || 0) >= 1) return null;
  return requirementsReason(group, factory.requires, factory.requiresAll);
}

/** 升级锁定原因：前置条件 + 目标工厂首台 + 自动产出升级是否仍有意义。 */
export function upgradeLockReason(group, upgrade) {
  const requirement = requirementsReason(
    group,
    upgrade.requires,
    upgrade.requiresAll,
  );
  if (requirement) return requirement;
  const target = group.factories.find((factory) => factory.id === upgrade.targetFactoryId);
  if (!target || (parseNum(target.owned) || 0) < 1) {
    return `需先买「${factoryName(group, upgrade.targetFactoryId)}」首台`;
  }
  if (upgrade.effect === 'activate' && target.active !== false) {
    return `「${factoryName(group, upgrade.targetFactoryId)}」已自动产出，无需再解锁`;
  }
  return null;
}
