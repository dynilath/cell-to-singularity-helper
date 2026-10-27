import { fmtDur, fmtNum, setNotationMode, parseNum } from './core/numbers.ts';
import { buildState, factoryQuote } from './core/exploration.ts';
import { cleanResourceText, PLAN_VERSION, resourceLabel } from './data/schema.ts';
import { factoryLockReason, upgradeLockReason } from './data/requirements.ts';
import { buildPresetStore } from './data/presets.ts';
import {
  loadSettings,
  loadStore,
  saveHalf,
  saveHideLockedUpgrades,
  saveGlobalAdMultiplier,
  saveNotation,
  saveOfflineRate,
  saveStore,
  saveVolume,
} from './data/store.ts';
import {
  isDue,
  isRunning,
  makeReminder,
  markFired,
  pauseReminder,
  resumeReminder,
  retimeReminder,
  reminderEndTime,
} from './services/reminders.ts';
import { createPlannerClient } from './services/plannerClient.ts';
import { createAlarm } from './ui/alarm.ts';
import { createDrawer } from './ui/drawer.ts';
import { createEditor } from './ui/editor.ts';
import { createFabMenu } from './ui/fabMenu.ts';
import { createMultiplierHelper } from './ui/multiplierHelper.ts';
import { createPlanView } from './ui/planView.ts';
import { createPresetImporter } from './ui/presetImporter.ts';
import { createStepView } from './ui/stepView.ts';
import { byId } from './ui/dom.ts';

const RECOMPUTE_DELAY_MS = 300;
const TYPING_RECOMPUTE_DELAY_MS = 900;
const TICK_MS = 500;

export function createApp({ document, window }) {
  const storage = window.localStorage;
  const store = loadStore(storage);
  const settings = loadSettings(storage);
  setNotationMode(settings.notation);

  let plan = store.plan;
  let stepMode = Boolean(plan && plan.stepIndex < plan.steps.length);
  let offlineRate = settings.offlineRate;
  let adDoubling = settings.half;
  let globalAdMultiplier = settings.globalAdMultiplier;
  let recomputeTimer = null;
  let pendingRecomputeAt = null;
  let planGeneration = 0;
  let tickTimer = null;
  let disposed = false;
  let notationSelect = null;
  let halfCheckbox = null;
  let armButton = null;
  let globalGrowth = null;

  const alarm = createAlarm({ document, window });
  alarm.setVolume(settings.volume);
  const planner = createPlannerClient();

  const planView = createPlanView({ document });
  const stepView = createStepView({ document });

  const editor = createEditor({
    document,
    getGroup: () => store,
    onChange: handleDataChange,
    onQuickBuy: quickBuyFactory,
    onUpgradeBuy: buyUpgrade,
    hideLockedUpgrades: settings.hideLockedUpgrades,
    onHideLockedChange: (hide) => saveHideLockedUpgrades(storage, hide),
  });

  const drawer = createDrawer({
    document,
    onPause: () => updateReminder((reminder) => pauseReminder(reminder, Date.now())),
    onResume: () => updateReminder((reminder) => resumeReminder(reminder, Date.now())),
    onRetime: () => updateReminder((reminder) => retimeReminder(reminder, Date.now())),
    onCancel: () => setReminder(null),
  });

  createFabMenu({ document });

  createMultiplierHelper({
    document,
    onApply: (growth) => {
      store.globalGrowth = String(Number(growth.toFixed(4)));
      byId(document, 'global-growth').value = store.globalGrowth;
      editor.render();
      handleDataChange();
    },
  });

  createPresetImporter({
    document,
    getPreset: () => store.preset,
    onImport: importPreset,
  });

  function persistStore() {
    saveStore(storage, store);
  }

  function updatePresetNote() {
    const note = byId(document, 'preset-note');
    const preset = store.preset;
    note.textContent = preset
      ? `当前预设：${preset.title} · 声望 ${preset.level} · 徽章 +${preset.badgePercent}%`
      : '尚未引入预设。';
  }

  function importPreset(preset, level, badgePercent) {
    if (recomputeTimer) {
      clearTimeout(recomputeTimer);
      recomputeTimer = null;
    }
    const next = buildPresetStore(preset, { level, badgePercent, now: Date.now() });
    store.globalGrowth = next.globalGrowth;
    store.asOf = next.asOf;
    store.resources = next.resources;
    store.factories = next.factories;
    store.upgrades = next.upgrades;
    store.completedUpgrades = next.completedUpgrades;
    store.plan = null;
    store.reminder = null;
    store.preset = next.preset;
    plan = null;
    stepMode = false;
    stepView.hide();
    planView.reset();
    alarm.dismiss();
    saveStore(storage, store);
    renderAll();
    refreshDrawer();
    updatePresetNote();
    editor.setStatus(
      `已引入预设「${preset.title}」：声望 ${level}，徽章 +${badgePercent}%。`,
      'factory',
    );
  }

  function refreshDrawer() {
    drawer.render({ store, now: Date.now() });
  }

  function syncArmButton() {
    if (!armButton) return;
    if (isRunning(store.reminder)) {
      armButton.textContent = '⏸ 取消提醒';
      armButton.disabled = false;
      return;
    }
    const hasNext = Boolean(plan && plan.stepIndex < plan.steps.length);
    armButton.textContent = '🔔 提醒我（下次行动）';
    armButton.disabled = !hasNext;
  }

  function updateCurEstimate(built) {
    const node = byId(document, 'cur-est');
    if (!built || !built.ok || built.awaySec < 30) {
      node.textContent = '';
      return;
    }

    const parts = built.state.resources
      .filter((resource) => resource.rate > 0)
      .map(
        (resource) =>
          `${resource.emoji} ${fmtNum(resource.snapshotAmount ?? 0)} → ${fmtNum(resource.amount)}`,
      );
    if (parts.length === 0) {
      node.textContent = '';
      return;
    }

    node.textContent = `离开 ${fmtDur(built.awaySec)}：${parts.join('；')}（直接改当前数量即以游戏为准）`;
  }

  function refreshSummary() {
    const built = buildState(store, { now: Date.now(), offlineRate, globalAdMultiplier });
    editor.updateRates(built.state);
    updateCurEstimate(built);
    return built;
  }

  function clearPlanState() {
    plan = null;
    stepMode = false;
    store.plan = null;
    store.reminder = null;
    stepView.hide();
    planView.reset();
  }

  function isEditingData() {
    const active = document.activeElement;
    if (!active) return false;
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)) return false;
    return Boolean(
      active.closest('#resource-section, #upgrade-section, #factory-section'),
    );
  }

  function handleDataChange() {
    if (disposed) return;
    planGeneration += 1;
    const snapshotAt = Date.now();
    store.asOf = snapshotAt;
    pendingRecomputeAt = snapshotAt;
    clearPlanState();
    persistStore();
    refreshSummary();
    syncArmButton();
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => {
      recomputeTimer = null;
      const at = pendingRecomputeAt;
      pendingRecomputeAt = null;
      recompute({ userEdit: false, snapshotAt: at });
    }, isEditingData() ? TYPING_RECOMPUTE_DELAY_MS : RECOMPUTE_DELAY_MS);
  }

  function cancelPendingRecompute() {
    planGeneration += 1;
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = null;
    pendingRecomputeAt = null;
  }

  function flushPendingRecompute() {
    if (!recomputeTimer) return false;
    const snapshotAt = pendingRecomputeAt;
    pendingRecomputeAt = null;
    clearTimeout(recomputeTimer);
    recomputeTimer = null;
    recompute({ userEdit: false, snapshotAt, synchronous: true });
    return true;
  }

  function recompute({ userEdit = true, snapshotAt = null, synchronous = false } = {}) {
    if (disposed) return;
    if (snapshotAt === null && pendingRecomputeAt !== null) {
      snapshotAt = pendingRecomputeAt;
    }
    pendingRecomputeAt = null;
    if (recomputeTimer) {
      clearTimeout(recomputeTimer);
      recomputeTimer = null;
    }
    if (!store.asOf) store.asOf = Date.now();
    if (userEdit) {
      store.plan = null;
      store.reminder = null;
      plan = null;
      stepMode = false;
      stepView.hide();
    }

    const built = buildState(store, {
      now: snapshotAt ?? Date.now(),
      offlineRate,
      globalAdMultiplier,
    });
    if (!built.hasInput) {
      store.plan = null;
      store.reminder = null;
      plan = null;
      stepMode = false;
      stepView.hide();
      editor.updateRates(built.state);
      updateCurEstimate(built);
      planView.reset();
      syncArmButton();
      persistStore();
      return;
    }
    if (!built.ok) {
      store.plan = null;
      store.reminder = null;
      plan = null;
      stepMode = false;
      stepView.hide();
      editor.updateRates(built.state);
      updateCurEstimate(built);
      planView.showError(built.errors[0] ?? '数据不完整或格式不对');
      syncArmButton();
      persistStore();
      return;
    }

    editor.updateRates(built.state);
    updateCurEstimate(built);

    const generation = ++planGeneration;
    const applyResult = (result) => {
      if (disposed || generation !== planGeneration) return;
      const nextPlan = {
        steps: result.steps,
        anchor: Date.now(),
        stepIndex: 0,
        goal: result.goal,
        goalLabel: result.goalLabel,
        complete: result.complete,
        total: result.total,
        generatedAt: Date.now(),
        strategy: result.strategy ?? 'online',
        offlineBlocks: result.offlineBlocks ?? 0,
        onlineTime: result.onlineTime ?? result.total,
        offlineTime: result.offlineTime ?? 0,
        baselineTotal: result.baselineTotal ?? result.total,
        adDoubled: result.adDoubled === true,
        version: PLAN_VERSION,
      };

      plan = nextPlan;
      stepMode = false;
      store.plan = nextPlan;
      stepView.hide();
      persistStore();
      if (result.steps.length === 0 && !result.complete) {
        planView.showError('还没有可执行的路径：检查工厂价格/产出、资源数量和升级价格。');
      } else {
        planView.render({ plan, now: Date.now() });
      }
      syncArmButton();
      refreshDrawer();
    };

    const showPlanError = (cause) => {
      if (disposed || generation !== planGeneration) return;
      plan = null;
      store.plan = null;
      planView.showError(`规划失败：${cause instanceof Error ? cause.message : String(cause)}`);
      syncArmButton();
      persistStore();
    };

    const computation = synchronous
      ? planner.computeSync(built.state, offlineRate, adDoubling)
      : planner.compute(built.state, offlineRate, adDoubling);
    if (computation instanceof Promise) {
      computation.then(applyResult).catch(showPlanError);
    } else {
      applyResult(computation);
    }
  }

  function materialize(built) {
    const now = Date.now();
    store.resources.forEach((resource, index) => {
      const state = built.state.resources[index];
      if (state) resource.amount = fmtNum(state.amount);
    });
    store.asOf = now;
    return built.state;
  }

  function setFactoryStatus(message, isError = false) {
    editor.setStatus(message, 'factory', isError);
  }

  function markUpgradeCompleted(upgradeId) {
    if (!Array.isArray(store.completedUpgrades)) store.completedUpgrades = [];
    if (!store.completedUpgrades.includes(upgradeId)) {
      store.completedUpgrades.push(upgradeId);
    }
  }

  function quickBuyFactory(factoryId, count, force = false) {
    cancelPendingRecompute();
    const built = buildState(store, { now: Date.now(), offlineRate, globalAdMultiplier });
    if (!built.ok) {
      setFactoryStatus(built.errors[0] ?? '工厂数据还不完整', true);
      return;
    }

    const factory = built.state.factories.find((item) => item.id === factoryId);
    const rawFactory = store.factories.find((item) => item.id === factoryId);
    if (!factory || !rawFactory) return;

    const factoryLock = factoryLockReason(store, rawFactory);
    if (factoryLock && !force) {
      setFactoryStatus(factoryLock, true);
      return;
    }
    const forcedUnlock = Boolean(factoryLock);

    const quote = factoryQuote(factory, count);
    if (!quote) {
      setFactoryStatus('工厂数据无效，无法结算', true);
      return;
    }

    const resource = built.state.resources.find((item) => item.id === factory.costResourceId);
    if (!resource) {
      setFactoryStatus('工厂的价格资源不存在，无法结算', true);
      return;
    }

    const short = resource.amount + 1e-9 < quote.totalCost;
    if (short && !force) {
      setFactoryStatus(
        `资源不足：买 ${count} 台需要 ${fmtNum(quote.totalCost)} ${resourceLabel(resource)}，` +
          `当前约 ${fmtNum(resource.amount)}。`,
        true,
      );
      return;
    }
    const continuesPlan =
      !short &&
      count === 1 &&
      plan &&
      plan.goal !== 'new-factory' &&
      plan.stepIndex < plan.steps.length &&
      plan.steps[plan.stepIndex].type === 'buy' &&
      plan.steps[plan.stepIndex].factoryId === factoryId;

    const now = Date.now();
    materialize(built);
    const rawResource = store.resources.find((item) => item.id === factory.costResourceId);
    if (!rawResource) {
      setFactoryStatus('工厂的价格资源不存在，无法结算', true);
      return;
    }
    rawResource.amount = fmtNum(short ? 0 : resource.amount - quote.totalCost);
    rawFactory.owned = String(factory.owned + count);
    rawFactory.price = fmtNum(quote.nextPrice);
    store.asOf = now;

    editor.syncPurchase(factoryId, rawFactory.costResourceId);
    if (continuesPlan) {
      plan.steps.splice(plan.stepIndex, 1);
      if (plan.stepIndex >= plan.steps.length) {
        plan.complete = true;
        stepMode = false;
        stepView.hide();
      } else if (stepMode) {
        stepView.render({ plan, now: Date.now() });
      } else {
        stepView.hide();
      }
      store.plan = plan;
      persistStore();
      planView.render({ plan, now: Date.now() });
      refreshSummary();
      if (plan.stepIndex < plan.steps.length && (stepMode || isRunning(store.reminder))) {
        armNextStep();
      }
      syncArmButton();
      refreshDrawer();
      if (plan.complete) handleDataChange();
    } else {
      handleDataChange();
    }
    const factoryName = rawFactory.name?.trim() || `工厂${store.factories.indexOf(rawFactory) + 1}`;
    setFactoryStatus(
      short
        ? `已强制结算：${factoryName} 买 ${count} 台，` +
            `资源不足，已将 ${resourceLabel(resource)} 清零；下一台 ${fmtNum(quote.nextPrice)}。`
        : forcedUnlock
          ? `已强制解锁并结算：${factoryName} 买 ${count} 台，` +
              `花费 ${fmtNum(quote.totalCost)} ${resourceLabel(resource)}，下一台 ${fmtNum(quote.nextPrice)}。`
          : `已结算：${factoryName} 买 ${count} 台，` +
              `花费 ${fmtNum(quote.totalCost)} ${resourceLabel(resource)}，下一台 ${fmtNum(quote.nextPrice)}。`,
    );
    persistStore();
  }

  function buyUpgrade(upgradeId, force = false) {
    flushPendingRecompute();
    const built = buildState(store, { now: Date.now(), offlineRate, globalAdMultiplier });
    if (!built.ok) {
      editor.setStatus(built.errors[0] ?? '升级数据还不完整', 'upgrade', true);
      return;
    }

    const upgrade = built.state.upgrades.find((item) => item.id === upgradeId);
    const rawUpgrade = store.upgrades.find((item) => item.id === upgradeId);
    if (!upgrade || !rawUpgrade || upgrade.purchased) return;

    const target = built.state.factories.find((item) => item.id === upgrade.targetFactoryId);
    const upgradeLock = upgradeLockReason(store, rawUpgrade);
    if (upgradeLock) {
      editor.setStatus(upgradeLock, 'upgrade', true);
      return;
    }

    const resource = built.state.resources.find((item) => item.id === upgrade.costResourceId);
    if (!resource) {
      editor.setStatus('升级的价格资源不存在，无法购买。', 'upgrade', true);
      return;
    }
    const short = resource.amount + 1e-9 < upgrade.cost;
    if (short && !force) {
      editor.setStatus(
        `资源不足：升级需要 ${fmtNum(upgrade.cost)} ${resourceLabel(resource)}，当前约 ${fmtNum(resource.amount)}。`,
        'upgrade',
        true,
      );
      return;
    }

    const now = Date.now();
    const nextStep =
      plan && plan.stepIndex < plan.steps.length ? plan.steps[plan.stepIndex] : null;
    const activeBlock = nextStep?.offlineBlock ?? 0;
    let plannedIndex = -1;
    if (plan) {
      plannedIndex = plan.steps.findIndex(
        (step, index) =>
          index >= plan.stepIndex &&
          step.type === 'upgrade' &&
          step.upgradeId === upgradeId &&
          (index === plan.stepIndex ||
            (activeBlock && step.offlineBlock === activeBlock)),
      );
    }
    const continuesPlan = !short && plannedIndex >= 0;
    const hadReminder = isRunning(store.reminder);

    const rawFactory = store.factories.find(
      (factory) => factory.id === upgrade.targetFactoryId,
    );
    const rawResource = store.resources.find((item) => item.id === upgrade.costResourceId);
    if (!rawFactory || !target || !rawResource) return;

    materialize(built);
    rawResource.amount = fmtNum(short ? 0 : resource.amount - upgrade.cost);
    const nextUnit = target.unit * upgrade.multiplier;
    rawFactory.unit = fmtNum(nextUnit);
    store.upgrades = store.upgrades.filter((item) => item.id !== upgradeId);
    markUpgradeCompleted(upgradeId);
    store.asOf = now;

    const purchaseText = short
      ? `已强制购买 ${upgrade.label}：${target.label} 单台产出 → ${fmtNum(nextUnit)}；资源不足，已将 ${resourceLabel(resource)} 清零。`
      : `已购买 ${upgrade.label}：${target.label} 单台产出 → ${fmtNum(nextUnit)}。`;

    editor.render();

    if (continuesPlan) {
      plan.steps.splice(plannedIndex, 1);
      store.plan = plan;
      persistStore();
      planView.render({ plan, now: Date.now() });
      if (stepMode) stepView.render({ plan, now: Date.now() });
      refreshSummary();

      if (plan.stepIndex >= plan.steps.length) {
        plan.complete = true;
        stepMode = false;
        stepView.hide();
        store.plan = plan;
        if (hadReminder) {
          persistStore();
          planView.render({ plan, now: Date.now() });
        } else {
          // 没有布防提醒时只完成计划，不再制造额外播报。
          store.reminder = null;
          persistStore();
          planView.render({ plan, now: Date.now() });
          syncArmButton();
          refreshDrawer();
        }
        // 当前分段完成，立即为下一段重新做目标选择。
        handleDataChange();
      } else {
        if (stepMode || isRunning(store.reminder)) armNextStep();
        syncArmButton();
      }

      editor.setStatus(purchaseText, 'upgrade');
      return;
    }

    handleDataChange();
    editor.setStatus(purchaseText, 'upgrade');
    persistStore();
  }

  function applyPlannedStep(step) {
    const built = buildState(store, { now: Date.now(), offlineRate, globalAdMultiplier });
    if (!built.ok) {
      setFactoryStatus(built.errors[0] ?? '当前数据不完整，无法应用这一步', true);
      return false;
    }

    if (step.type === 'buy') {
      const factory = built.state.factories.find((item) => item.id === step.factoryId);
      const rawFactory = store.factories.find((item) => item.id === step.factoryId);
      if (!factory || !rawFactory) return false;
      const quote = factoryQuote(factory, 1);
      const resource = built.state.resources.find((item) => item.id === factory.costResourceId);
      if (!quote || !resource || resource.amount + 1e-9 < quote.totalCost) {
        setFactoryStatus('资源不够应用这一步，先更新当前数量。', true);
        return false;
      }
      const now = Date.now();
      materialize(built);
      const rawResource = store.resources.find((item) => item.id === factory.costResourceId);
      rawResource.amount = fmtNum(resource.amount - quote.totalCost);
      rawFactory.owned = String(factory.owned + 1);
      rawFactory.price = fmtNum(quote.nextPrice);
      store.asOf = now;
    } else {
      const upgrade = built.state.upgrades.find((item) => item.id === step.upgradeId);
      const rawUpgrade = store.upgrades.find((item) => item.id === step.upgradeId);
      if (!upgrade || !rawUpgrade) return false;
      const lock = upgradeLockReason(store, rawUpgrade);
      if (lock) {
        setFactoryStatus(lock, true);
        return false;
      }
      const resource = built.state.resources.find((item) => item.id === upgrade.costResourceId);
      if (!resource || resource.amount + 1e-9 < upgrade.cost) {
        setFactoryStatus('资源不够应用这一步，先更新当前数量。', true);
        return false;
      }
      const rawFactory = store.factories.find(
        (item) => item.id === upgrade.targetFactoryId,
      );
      const target = built.state.factories.find(
        (item) => item.id === upgrade.targetFactoryId,
      );
      if (!rawFactory || !target) return false;
      const now = Date.now();
      materialize(built);
      const rawResource = store.resources.find((item) => item.id === upgrade.costResourceId);
      rawResource.amount = fmtNum(resource.amount - upgrade.cost);
      rawFactory.unit = fmtNum(target.unit * upgrade.multiplier);
      store.upgrades = store.upgrades.filter((item) => item.id !== step.upgradeId);
      markUpgradeCompleted(step.upgradeId);
      store.asOf = now;
    }

    editor.render();
    refreshSummary();
    return true;
  }

  function startStepMode() {
    flushPendingRecompute();
    if (!plan || plan.stepIndex >= plan.steps.length) return;
    plan.stepIndex = 0;
    stepMode = true;
    store.plan = plan;
    persistStore();
    planView.render({ plan, now: Date.now() });
    stepView.show();
    stepView.render({ plan, now: Date.now() });
    syncArmButton();
    armNextStep();
  }

  function completeStep() {
    flushPendingRecompute();
    if (!plan || plan.stepIndex >= plan.steps.length) return;
    const step = plan.steps[plan.stepIndex];
    if (!applyPlannedStep(step)) return;

    plan.stepIndex += 1;
    store.plan = plan;
    persistStore();
    planView.render({ plan, now: Date.now() });
    stepView.render({ plan, now: Date.now() });
    refreshSummary();

    if (plan.stepIndex >= plan.steps.length) {
      plan.complete = true;
      stepMode = false;
      stepView.hide();
      store.plan = plan;
      persistStore();
      planView.render({ plan, now: Date.now() });
      // 当前分段完成，重新选择下一段目标；不要停在“全部完成”。
      handleDataChange();
      return;
    }
    armNextStep();
  }

  function abandonPlan() {
    if (recomputeTimer) {
      clearTimeout(recomputeTimer);
      recomputeTimer = null;
    }
    plan = null;
    stepMode = false;
    store.plan = null;
    store.reminder = null;
    stepView.hide();
    persistStore();
    recompute({ userEdit: false });
  }

  function reminderCopy(step, { half = false, lastStep = false } = {}) {
    const action =
      step.type === 'buy' ? `买 ${step.label}·第${step.nth}台` : `买 ${step.label}`;
    if (half) {
      return {
        title: `半程到！可以看广告翻倍了（${action} 时点过半）`,
        body: `${action} 的时刻已过半：现在看广告让产出翻倍，相当于剩余时间减半`,
      };
    }
    const cost = step.type === 'buy' ? step.price : step.cost;
    return {
      title: `该${action} 了！`,
      body: `花费 ${fmtNum(cost)} ${cleanResourceText(step.resourceName) || '资源'} · 买完回来点「完成此步」${lastStep ? ' · 这是最后一步' : ''}`,
    };
  }

  function armReminder(step, { lastStep = false } = {}) {
    const now = Date.now();
    const timing = reminderEndTime({
      anchor: plan.anchor,
      stepSeconds: step.t,
      halfEnabled: false,
      now,
      // 离线段的时间已经乘过倍率，提醒时不能再除一次；
      // 在线段仍按“离开游戏后的离线收益”提前提醒。
      offlineRate:
        step.offline === true
          ? 1
          : offlineRate * (adDoubling ? 2 : 1),
    });
    const copy = reminderCopy(step, { half: timing.half, lastStep });
    store.reminder = makeReminder({
      kind: timing.half ? 'half' : 'full',
      title: copy.title,
      body: copy.body,
      endTime: timing.endTime,
      now,
    });
    persistStore();
    refreshDrawer();
    syncArmButton();
    if (Date.now() >= timing.endTime) fireReminder(false);
  }

  function armNextStep() {
    if (!plan || plan.stepIndex >= plan.steps.length) return;
    armReminder(plan.steps[plan.stepIndex], {
      lastStep: plan.stepIndex === plan.steps.length - 1,
    });
  }

  function toggleArm() {
    alarm.unlock();
    flushPendingRecompute();
    if (isRunning(store.reminder)) {
      setReminder(null);
      return;
    }
    if (!plan || plan.stepIndex >= plan.steps.length) {
      if (store.reminder) setReminder(null);
      return;
    }
    store.asOf = Date.now();
    persistStore();
    alarm.maybeAskPermission();
    armReminder(plan.steps[plan.stepIndex]);
  }

  function fireReminder(missed) {
    const reminder = store.reminder;
    if (!reminder || reminder.fired) return;

    store.reminder = markFired(reminder);
    persistStore();
    const label = reminder.kind === 'half' ? '探索规划·半程' : '探索规划';
    alarm.show(`${missed ? '⏰ 离开时到点了：' : ''}[${label}] ${reminder.title}`, reminder.body);
    refreshDrawer();
    syncArmButton();
  }

  function checkDueReminders(missed) {
    if (isDue(store.reminder, Date.now())) fireReminder(missed);
  }

  function setReminder(reminder) {
    store.reminder = reminder;
    persistStore();
    refreshDrawer();
    syncArmButton();
  }

  function updateReminder(updater) {
    if (!store.reminder) return;
    store.reminder = updater(store.reminder);
    persistStore();
    refreshDrawer();
    syncArmButton();
  }

  function restoreSavedPlan() {
    if (!store.plan) return false;
    if (store.plan.version !== PLAN_VERSION) {
      // 旧算法算出的时间/离线段可能已经错误，提醒也一并作废。
      store.reminder = null;
      return false;
    }
    const built = buildState(store, { now: Date.now(), offlineRate, globalAdMultiplier });
    if (!built.ok) return false;

    const validFactories = new Set(built.state.factories.map((factory) => factory.id));
    const validUpgrades = new Set(built.state.upgrades.map((upgrade) => upgrade.id));
    const referencesIgnored = store.plan.steps.some((step) =>
      step.type === 'buy'
        ? !validFactories.has(step.factoryId)
        : !validUpgrades.has(step.upgradeId),
    );
    if (referencesIgnored) return false;

    plan = store.plan;
    stepMode = plan.stepIndex < plan.steps.length;
    editor.updateRates(built.state);
    updateCurEstimate(built);
    planView.render({ plan, now: Date.now() });
    if (stepMode) {
      stepView.show();
      stepView.render({ plan, now: Date.now() });
    } else {
      stepView.hide();
    }
    syncArmButton();
    return true;
  }

  function renderAll() {
    editor.clearStatus();
    editor.render();
    globalGrowth.value = store.globalGrowth;
    plan = store.plan;
    stepMode = Boolean(plan && plan.stepIndex < plan.steps.length);
    if (!restoreSavedPlan()) recompute({ userEdit: false });
    refreshDrawer();
    syncArmButton();
    updatePresetNote();
  }

  function convertValues() {
    const convert = (raw) => {
      if (!raw || !raw.trim()) return raw;
      const value = parseNum(raw);
      return Number.isFinite(value) ? fmtNum(value) : raw;
    };
    for (const resource of store.resources) {
      resource.amount = convert(resource.amount);
      resource.baseRate = convert(resource.baseRate);
    }
    for (const factory of store.factories) {
      factory.price = convert(factory.price);
      factory.unit = convert(factory.unit);
    }
    for (const upgrade of store.upgrades) {
      upgrade.cost = convert(upgrade.cost);
    }
  }

  function convertReminderText(text) {
    return text.replace(/((?:价格|花费) )([^·]+?)( · )/g, (match, prefix, value, suffix) => {
      const number = parseNum(value);
      return Number.isFinite(number) ? `${prefix}${fmtNum(number)}${suffix}` : match;
    });
  }

  function applyNotationMode(mode) {
    flushPendingRecompute();
    setNotationMode(mode);
    saveNotation(storage, mode);
    convertValues();
    if (store.reminder) store.reminder.body = convertReminderText(store.reminder.body);
    if (alarm.isBannerVisible()) {
      const current = alarm.getBannerText();
      const next = convertReminderText(current);
      if (next !== current) alarm.setBannerText(next);
    }
    editor.render();
    refreshSummary();
    if (plan) {
      planView.render({ plan, now: Date.now() });
      if (stepMode) stepView.render({ plan, now: Date.now() });
    }
    persistStore();
  }

  function setupPreferences() {
    notationSelect = byId(document, 'notation');
    notationSelect.value = settings.notation;
    notationSelect.addEventListener('change', () => applyNotationMode(notationSelect.value));

    const globalAdSelect = byId(document, 'global-ad');
    globalAdSelect.value = String(globalAdMultiplier);
    globalAdSelect.addEventListener('change', () => {
      const parsed = Number.parseFloat(globalAdSelect.value);
      globalAdMultiplier = parsed === 2 || parsed === 4 ? parsed : 1;
      globalAdSelect.value = String(globalAdMultiplier);
      saveGlobalAdMultiplier(storage, globalAdMultiplier);
      recompute({ userEdit: true });
    });

    halfCheckbox = byId(document, 'half-cb');
    halfCheckbox.checked = settings.half;
    halfCheckbox.addEventListener('change', () => {
      adDoubling = halfCheckbox.checked;
      saveHalf(storage, adDoubling);
      recompute({ userEdit: true });
    });

    const planStrategySelect = byId(document, 'plan-strategy');
    planStrategySelect.value = 'search';

    const offlineInput = byId(document, 'offline-rate');
    offlineInput.value = String(offlineRate);
    offlineInput.addEventListener('input', () => offlineInput.classList.remove('bad'));
    offlineInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        offlineInput.blur();
      }
    });
    offlineInput.addEventListener('change', () => {
      const raw = Number(offlineInput.value.trim());
      if (!Number.isFinite(raw) || raw <= 0) {
        offlineInput.value = String(offlineRate);
        offlineInput.classList.add('bad');
        return;
      }
      const value = Number(raw.toFixed(4));
      offlineInput.value = String(value);
      offlineInput.classList.remove('bad');
      if (value === offlineRate) return;
      offlineRate = value;
      saveOfflineRate(storage, value);
      // 规划会同时尝试在线等待和离线段，倍率变化必须重算。
      recompute({ userEdit: true });
    });

    const slider = byId(document, 'volume');
    const label = byId(document, 'volume-val');
    const percent = Math.round(settings.volume * 100);
    slider.value = String(percent);
    label.textContent = `${percent}%`;
    slider.addEventListener('input', () => {
      const value = (Number.parseFloat(slider.value) || 0) / 100;
      alarm.setVolume(value);
      saveVolume(storage, value);
      label.textContent = `${slider.value}%`;
      alarm.unlock();
      if (value > 0) alarm.beep(1);
    });
    alarm.updateHint();

    globalGrowth = byId(document, 'global-growth');
    globalGrowth.addEventListener('input', () => {
      store.globalGrowth = globalGrowth.value;
      handleDataChange();
    });

    armButton = byId(document, 'arm-btn');
    armButton.addEventListener('click', toggleArm);
    byId(document, 'start-steps').addEventListener('click', startStepMode);
    byId(document, 'complete-step').addEventListener('click', completeStep);
    byId(document, 'abandon-plan').addEventListener('click', abandonPlan);
    byId(document, 'banner-dismiss').addEventListener('click', () => alarm.dismiss());
  }

  function sanitizeLoadedText() {
    if (store.plan) {
      for (const step of store.plan.steps) {
        step.resourceName = cleanResourceText(step.resourceName) || '资源';
      }
    }
    if (store.reminder) {
      store.reminder.title = cleanResourceText(store.reminder.title);
      store.reminder.body = cleanResourceText(store.reminder.body);
    }
  }

  function start() {
    sanitizeLoadedText();
    saveStore(storage, store);
    setupPreferences();
    renderAll();
    checkDueReminders(true);
    refreshDrawer();
    tickTimer = window.setInterval(tick, TICK_MS);
  }

  function tick() {
    if (disposed) return;
    const now = Date.now();
    checkDueReminders(false);
    refreshDrawer();
    if (plan) {
      planView.tick({ plan, now });
      if (stepMode) stepView.render({ plan, now });
    }
  }

  function dispose() {
    disposed = true;
    planGeneration += 1;
    if (recomputeTimer) clearTimeout(recomputeTimer);
    if (tickTimer) window.clearInterval(tickTimer);
    planner.dispose();
    alarm.dispose();
  }

  return { start, dispose };
}

