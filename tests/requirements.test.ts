import { describe, expect, it } from 'vitest';
import { PRESETS, buildPresetStore } from '../src/data/presets.ts';
import {
  factoryLockReason,
  upgradeLockReason,
} from '../src/data/requirements.ts';

function presetGroup() {
  return buildPresetStore(PRESETS[0], { level: 2, badgePercent: 0 });
}

describe('prerequisites', () => {
  it('requires at least one factory for a factory prerequisite (雅库玛玛)', () => {
    const group = presetGroup();
    const upgrade = group.upgrades.find((item) => item.name === '雅库玛玛');
    const deep = group.factories.find((item) => item.name === '深不可测的存在');
    expect(upgradeLockReason(group, upgrade)).toContain('至少 1 台');
    expect(upgradeLockReason(group, upgrade)).toContain('深不可测的存在');

    deep.owned = '1';
    expect(upgradeLockReason(group, upgrade)).toBeNull();
  });

  it('unlocks a factory after its prerequisite upgrade is completed', () => {
    const group = presetGroup();
    const weird = group.factories.find((item) => item.name === '诡异生物');
    const kappa = group.upgrades.find((item) => item.name === '河童');
    expect(factoryLockReason(group, weird)).toContain('河童');

    group.completedUpgrades.push(kappa.id);
    expect(factoryLockReason(group, weird)).toBeNull();
  });

  it('keeps upgrade chains locked until the previous upgrade is completed', () => {
    const group = presetGroup();
    group.factories.find((item) => item.name === '阴险者').owned = '1';
    const dog = group.upgrades.find((item) => item.name === '狗头人');
    const banik = group.upgrades.find((item) => item.name === '班尼克');
    expect(upgradeLockReason(group, banik)).toContain('狗头人');

    group.completedUpgrades.push(dog.id);
    expect(upgradeLockReason(group, banik)).toBeNull();
  });
});
