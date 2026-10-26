import { fmtNum, parseNum } from '../core/numbers.js';
import {
  RESOURCE_EMOJIS,
  createEmptyFactory,
  createEmptyResource,
  createEmptyUpgrade,
} from '../data/schema.js';
import { factoryLockReason, upgradeLockReason } from '../data/requirements.js';

const NUMBER_ATTRS = {
  lang: 'en',
  inputmode: 'decimal',
  dir: 'ltr',
  autocomplete: 'off',
  autocorrect: 'off',
  autocapitalize: 'off',
  spellcheck: 'false',
  enterkeyhint: 'done',
};

function element(document, tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function numberInput(document, value, placeholder = '') {
  const input = element(document, 'input');
  for (const [name, attribute] of Object.entries(NUMBER_ATTRS)) {
    input.setAttribute(name, attribute);
  }
  input.value = value ?? '';
  input.placeholder = placeholder;
  return input;
}

function selectInput(document, options, value) {
  const select = element(document, 'select');
  for (const option of options) {
    const node = element(document, 'option', '', option.name);
    node.value = option.id;
    select.append(node);
  }
  select.value = value;
  return select;
}

function field(document, labelText, control, className = '') {
  const wrapper = element(document, 'div', className);
  const label = element(document, 'label', '', labelText);
  wrapper.append(label, control);
  return wrapper;
}

function withResource(document, labelText, input, picker) {
  const wrapper = element(document, 'div');
  const label = element(document, 'label', '', labelText);
  const row = element(document, 'div', 'input-with-resource');
  row.append(input, picker);
  wrapper.append(label, row);
  return wrapper;
}

/**
 * 资源 / 工厂 / 升级编辑器。所有字符串都直接写回 group，App 负责校验和重算。
 */
export function createEditor({
  document,
  getGroup,
  onChange,
  onQuickBuy,
  onUpgradeBuy,
  hideLockedUpgrades = false,
  onHideLockedChange = () => {},
}) {
  const resourceHost = document.getElementById('resource-rows');
  const factoryHost = document.getElementById('factory-rows');
  const upgradeHost = document.getElementById('upgrade-rows');
  const upgradeStatus = document.getElementById('upgrade-status');
  const factoryStatus = document.getElementById('factory-status');
  const hideLockedInput = document.getElementById('hide-locked-upgrades');

  let dragState = null;
  let lastState = null;
  let hideLocked = Boolean(hideLockedUpgrades);
  if (hideLockedInput) hideLockedInput.checked = hideLocked;

  // 按住 Ctrl 时给快速购买按钮换色；点击时把 force 传给 App。
  const setForceBuy = (active) => {
    document.body.classList.toggle('ctrl-force', active);
  };
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Control' || event.key === 'Meta' || event.ctrlKey || event.metaKey) {
      setForceBuy(true);
    }
  });
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Control' || event.key === 'Meta') setForceBuy(false);
  });
  document.defaultView?.addEventListener('blur', () => setForceBuy(false));

  hideLockedInput?.addEventListener('change', () => {
    hideLocked = hideLockedInput.checked;
    onHideLockedChange(hideLocked);
    renderUpgrades();
  });

  function contributionFor(resourceId) {
    const resource = lastState?.resources.find((item) => item.id === resourceId);
    return resource ? Math.max(0, resource.rate - resource.baseRate) : 0;
  }

  function setStatus(message, target = 'factory', isError = false) {
    const node = target === 'upgrade' ? upgradeStatus : factoryStatus;
    node.textContent = message;
    node.classList.toggle('err', isError);
  }

  function signalChange() {
    onChange();
  }

  function resourcePicker(document, group, value, labelText) {
    const select = element(document, 'select', 'res-picker');
    select.tabIndex = -1; // 图标选择只做鼠标操作，不进入 Tab 顺序
    select.setAttribute('aria-label', labelText);
    for (const resource of group.resources) {
      const option = element(document, 'option', '', resource.emoji);
      option.value = resource.id;
      option.title = resource.emoji;
      select.append(option);
    }
    select.value = value;
    const selected = group.resources.find((resource) => resource.id === value);
    select.title = selected ? `${labelText}：${selected.emoji}` : labelText;
    return select;
  }

  function renderResources() {
    const group = getGroup();
    resourceHost.replaceChildren();

    group.resources.forEach((resource) => {
      const row = element(document, 'div', 'res-row');
      const emoji = selectInput(
        document,
        RESOURCE_EMOJIS.map((value) => ({ id: value, name: value })),
        resource.emoji,
      );
      emoji.className = 'res-emoji';
      emoji.tabIndex = -1; // 图标下拉不进入 Tab 顺序
      emoji.addEventListener('change', () => {
        resource.emoji = emoji.value;
        renderAll();
        signalChange();
      });

      const amount = numberInput(document, resource.amount, '当前数量');
      amount.addEventListener('input', () => {
        resource.amount = amount.value;
        signalChange();
      });

      const baseRate = numberInput(document, resource.baseRate, '0');
      const total = numberInput(document, '', '总计产出');
      total.dataset.totalRateFor = resource.id;
      total.title = '总计产出 = 基础产出 + 工厂贡献；直接修改会反推基础产出';
      total.addEventListener('input', () => total.classList.remove('bad'));
      total.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          total.blur();
        }
      });
      total.addEventListener('change', () => {
        const totalValue = parseNum(total.value);
        const contribution = contributionFor(resource.id);
        if (!Number.isFinite(totalValue) || totalValue < 0) {
          const base = parseNum(resource.baseRate);
          total.value = fmtNum((Number.isFinite(base) ? base : 0) + contribution);
          total.classList.add('bad');
          return;
        }

        const nextBase = Math.max(0, totalValue - contribution);
        resource.baseRate = fmtNum(nextBase);
        baseRate.value = resource.baseRate;
        total.value = fmtNum(nextBase + contribution);
        total.classList.remove('bad');
        signalChange();
      });

      baseRate.addEventListener('input', () => {
        resource.baseRate = baseRate.value;
        const base = parseNum(baseRate.value);
        if (Number.isFinite(base)) {
          total.value = fmtNum(base + contributionFor(resource.id));
        }
        signalChange();
      });

      const remove = element(document, 'button', 'small fac-del', '🗑');
      remove.type = 'button';
      remove.tabIndex = -1;
      remove.title = '删除这个资源';
      remove.disabled = group.resources.length <= 1;
      if (group.resources.some((item) => item.id === resource.id) && group.resources.length > 1) {
        // 引用检查按工厂/升级动态判断，避免删除后悬空。
        const used =
          group.factories.some(
            (factory) =>
              factory.outputResourceId === resource.id || factory.costResourceId === resource.id,
          ) ||
          group.upgrades.some((upgrade) => upgrade.costResourceId === resource.id);
        remove.disabled = used;
        remove.title = used ? '被工厂或升级使用，不能删除' : '删除这个资源';
      }
      remove.addEventListener('click', () => {
        group.resources = group.resources.filter((item) => item.id !== resource.id);
        renderAll();
        signalChange();
      });

      row.append(
        field(document, '图标', emoji, 'res-emoji-field'),
        field(document, '当前数量', amount),
        field(document, '基础产出/秒', baseRate),
        field(document, '总计产出/秒', total, 'res-total-field'),
        remove,
      );
      resourceHost.append(row);
    });

    if (group.resources.length === 0) {
      setStatus('至少需要一个资源', 'factory', true);
    }
  }

  function renderFactories() {
    const group = getGroup();
    factoryHost.replaceChildren();

    group.factories.forEach((factory, index) => {
      const row = element(document, 'div', 'fac-row');
      row.dataset.index = String(index);
      row.dataset.factoryId = factory.id;
      const lockReason = factoryLockReason(group, factory);
      row.classList.toggle('locked', Boolean(lockReason));

      const drag = element(document, 'button', 'fac-drag');
      drag.type = 'button';
      drag.tabIndex = -1;
      drag.title = '拖动调整工厂顺序';
      drag.setAttribute('aria-label', '拖动调整工厂顺序');
      const dragSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      dragSvg.setAttribute('viewBox', '0 0 16 24');
      dragSvg.setAttribute('aria-hidden', 'true');
      dragSvg.setAttribute('focusable', 'false');
      for (const cy of [6, 12, 18]) {
        for (const cx of [5, 11]) {
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', String(cx));
          dot.setAttribute('cy', String(cy));
          dot.setAttribute('r', '1.6');
          dragSvg.append(dot);
        }
      }
      drag.append(dragSvg);
      drag.addEventListener('pointerdown', (event) => startDrag(event, row, index));

      const head = element(document, 'div', 'fac-head');
      const contribution = element(document, 'span', 'contribution');
      contribution.dataset.contributionFor = factory.id;
      const name = element(document, 'div', 'fac-name');
      name.append(
        element(document, 'b', '', factory.name?.trim() || `工厂${index + 1}`),
      );
      const lockChip = element(
        document,
        'span',
        'chip lock-chip',
        lockReason ? `🔒 ${lockReason}` : '',
      );
      lockChip.dataset.factoryLockFor = factory.id;
      lockChip.classList.toggle('hidden', !lockReason);
      name.append(lockChip);

      const actions = element(document, 'div', 'fac-buy-actions');
      actions.setAttribute('role', 'group');
      actions.setAttribute(
        'aria-label',
        `${factory.name?.trim() || `工厂${index + 1}`} 快速结算`,
      );
      for (const count of [1, 5, 10]) {
        const buy = element(document, 'button', 'small fac-buy', `买${count}个`);
        buy.type = 'button';
        buy.tabIndex = -1;
        buy.dataset.count = String(count);
        buy.disabled = false;
        buy.setAttribute('aria-disabled', lockReason ? 'true' : 'false');
        buy.classList.toggle('locked-action', Boolean(lockReason));
        buy.title = lockReason
          ? `${lockReason}；按住 Ctrl 点买X个可强制购买并解锁`
          : `按当前估算资源结算，买 ${count} 台；按住 Ctrl 强制购买（资源不足时清零）`;
        buy.addEventListener('click', (event) => {
          onQuickBuy(factory.id, count, event.ctrlKey || event.metaKey);
        });
        actions.append(buy);
      }

      const remove = element(document, 'button', 'small fac-del', '🗑');
      remove.type = 'button';
      remove.tabIndex = -1;
      remove.title = '删除这个工厂';
      remove.disabled = group.factories.length <= 1;
      remove.addEventListener('click', () => {
        group.factories = group.factories.filter((item) => item.id !== factory.id);
        group.upgrades = group.upgrades.filter((item) => item.targetFactoryId !== factory.id);
        renderAll();
        signalChange();
      });

      head.append(name, actions, contribution, remove);

      const main = element(document, 'div', 'fac-main');
      const fields = element(document, 'div', 'factory-inline');

      const owned = numberInput(document, factory.owned, '0');
      owned.dataset.factoryOwnedFor = factory.id;
      owned.disabled = Boolean(lockReason);
      owned.title = lockReason
        ? `${lockReason}；未解锁时不能直接改数量（Ctrl+买X可强制解锁）`
        : '已拥有数量';
      owned.addEventListener('input', () => {
        factory.owned = owned.value;
        signalChange();
      });

      const price = numberInput(document, factory.price, '下一台价格');
      price.addEventListener('input', () => {
        factory.price = price.value;
        signalChange();
      });

      const unit = numberInput(document, factory.unit, '每台产出');
      unit.addEventListener('input', () => {
        factory.unit = unit.value;
        signalChange();
      });

      const growth = numberInput(document, factory.growth, '留空 = 全局');
      growth.tabIndex = -1; // 倍率不进入 Tab 顺序
      growth.addEventListener('input', () => {
        factory.growth = growth.value;
        signalChange();
      });

      const cost = resourcePicker(document, group, factory.costResourceId, '价格资源');
      cost.addEventListener('change', () => {
        factory.costResourceId = cost.value;
        const selected = group.resources.find((resource) => resource.id === cost.value);
        cost.title = selected ? `价格资源：${selected.emoji}` : '价格资源';
        signalChange();
      });

      const output = resourcePicker(document, group, factory.outputResourceId, '产出资源');
      output.addEventListener('change', () => {
        factory.outputResourceId = output.value;
        const selected = group.resources.find((resource) => resource.id === output.value);
        output.title = selected ? `产出资源：${selected.emoji}` : '产出资源';
        signalChange();
      });

      fields.append(
        field(document, '已拥有数量', owned),
        withResource(document, '下一台价格', price, cost),
        withResource(document, '单台产出 /秒', unit, output),
        field(document, '价格增长倍率', growth),
      );
      main.append(fields);
      row.append(drag, head, main);
      factoryHost.append(row);
    });
  }

  function renderUpgrades() {
    const group = getGroup();
    upgradeHost.replaceChildren();
    const factories = group.factories.map((factory, index) => ({
      id: factory.id,
      name: factory.name?.trim() || `工厂${index + 1}`,
    }));

    group.upgrades.forEach((upgrade, index) => {
      if (upgrade.purchased) return;
      const lockReason = upgradeLockReason(group, upgrade);
      const row = element(document, 'div', 'upg-row');
      row.dataset.targetFactoryId = upgrade.targetFactoryId;
      row.dataset.upgradeId = upgrade.id;
      row.classList.toggle('locked', Boolean(lockReason));
      row.classList.toggle('hidden', hideLocked && Boolean(lockReason));
      const head = element(document, 'div', 'upg-head');
      head.append(
        element(document, 'b', '', upgrade.name?.trim() || `升级${index + 1}`),
      );

      const status = element(
        document,
        'span',
        upgrade.purchased ? 'ok' : 'hint',
        upgrade.purchased ? '已购买' : lockReason || '未购买',
      );
      status.dataset.upgradeStatusFor = upgrade.id;
      head.append(status);

      const actions = element(document, 'div', 'fac-controls');
      const buy = element(
        document,
        'button',
        `small ${upgrade.purchased ? '' : 'primary'}`,
        upgrade.purchased ? '已购买' : '购买',
      );
      buy.type = 'button';
      buy.disabled = upgrade.purchased || Boolean(lockReason);
      buy.title = lockReason
        ? lockReason
        : '扣除资源，把目标工厂的产出乘以这个倍率；按住 Ctrl 强制购买（资源不足时清零）';
      buy.addEventListener('click', (event) => {
        onUpgradeBuy(upgrade.id, event.ctrlKey || event.metaKey);
      });
      actions.append(buy);

      const remove = element(document, 'button', 'small fac-del', '🗑');
      remove.type = 'button';
      remove.tabIndex = -1;
      remove.title = '删除这个升级';
      remove.addEventListener('click', () => {
        group.upgrades = group.upgrades.filter((item) => item.id !== upgrade.id);
        renderAll();
        signalChange();
      });
      actions.append(remove);
      head.append(actions);

      const fields = element(document, 'div', 'edit-grid');
      const target = selectInput(document, factories, upgrade.targetFactoryId);
      target.disabled = upgrade.purchased;
      target.addEventListener('change', () => {
        upgrade.targetFactoryId = target.value;
        row.dataset.targetFactoryId = target.value;
        signalChange();
      });

      const multiplier = numberInput(document, upgrade.multiplier, '2');
      multiplier.tabIndex = -1; // 倍率不进入 Tab 顺序
      multiplier.disabled = upgrade.purchased;
      multiplier.addEventListener('input', () => {
        upgrade.multiplier = multiplier.value;
        signalChange();
      });

      const cost = numberInput(document, upgrade.cost, '升级价格');
      cost.disabled = upgrade.purchased;
      cost.addEventListener('input', () => {
        upgrade.cost = cost.value;
        signalChange();
      });

      const resource = resourcePicker(document, group, upgrade.costResourceId, '花费资源');
      resource.disabled = upgrade.purchased;
      resource.addEventListener('change', () => {
        upgrade.costResourceId = resource.value;
        const selected = group.resources.find((item) => item.id === resource.value);
        resource.title = selected ? `花费资源：${selected.emoji}` : '花费资源';
        signalChange();
      });

      fields.append(
        field(document, '目标工厂', target),
        field(document, '产出倍率', multiplier),
        withResource(document, '升级价格', cost, resource),
      );
      row.append(head, fields);
      upgradeHost.append(row);
    });

    if (group.upgrades.length === 0) {
      upgradeHost.append(
        element(
          document,
          'div',
          'hint',
          '没有未购买的升级。购买后的倍率会直接计入目标工厂的单台产出。',
        ),
      );
    }
    const hiddenNote = element(document, 'div', 'hint hidden');
    hiddenNote.dataset.hiddenLockedNote = '1';
    upgradeHost.append(hiddenNote);
    updateHiddenLockedNote(group);
  }

  function updateHiddenLockedNote(group) {
    const note = upgradeHost.querySelector('[data-hidden-locked-note]');
    if (!note) return;
    const hiddenCount = hideLocked
      ? group.upgrades.filter(
          (upgrade) => !upgrade.purchased && upgradeLockReason(group, upgrade),
        ).length
      : 0;
    note.textContent = hiddenCount > 0 ? `已隐藏 ${hiddenCount} 个未解锁升级` : '';
    note.classList.toggle('hidden', hiddenCount === 0);
  }

  function renderAll() {
    renderResources();
    renderFactories();
    renderUpgrades();
  }

  function updateRates(state) {
    lastState = state;

    for (const input of resourceHost.querySelectorAll('[data-total-rate-for]')) {
      const resource = state.resources.find((item) => item.id === input.dataset.totalRateFor);
      if (!resource) continue;
      // 用户正在直接编辑总计时不要覆盖输入，失焦提交后再同步。
      if (document.activeElement === input) continue;
      input.value = fmtNum(resource.rate);
    }

    const invalidFactories = new Set(state.invalidFactoryIds ?? []);
    const group = getGroup();
    for (const row of factoryHost.querySelectorAll('.fac-row')) {
      const invalid = invalidFactories.has(row.dataset.factoryId);
      const rawFactory = group.factories.find((factory) => factory.id === row.dataset.factoryId);
      const lockReason = rawFactory ? factoryLockReason(group, rawFactory) : null;
      row.classList.toggle('ignored', invalid);
      row.classList.toggle('locked', Boolean(lockReason));
      row.title = invalid
        ? '工厂数据不完整，已忽略'
        : lockReason
          ? lockReason
          : '';
      const lockChip = row.querySelector(`[data-factory-lock-for="${row.dataset.factoryId}"]`);
      if (lockChip) {
        lockChip.textContent = lockReason ? `🔒 ${lockReason}` : '';
        lockChip.classList.toggle('hidden', !lockReason);
      }
      const ownedInput = row.querySelector(
        `[data-factory-owned-for="${row.dataset.factoryId}"]`,
      );
      if (ownedInput) {
        const locked = !invalid && Boolean(lockReason);
        ownedInput.disabled = locked;
        ownedInput.title = locked
          ? `${lockReason}；未解锁时不能直接改数量（Ctrl+买X可强制解锁）`
          : '已拥有数量';
      }
      for (const buy of row.querySelectorAll('.fac-buy')) {
        const locked = !invalid && Boolean(lockReason);
        buy.disabled = invalid;
        buy.setAttribute('aria-disabled', locked ? 'true' : 'false');
        buy.classList.toggle('locked-action', locked);
        buy.title = locked
          ? `${lockReason}；按住 Ctrl 点买X个可强制购买并解锁`
          : `按当前估算资源结算；按住 Ctrl 强制购买（资源不足时清零）`;
      }
    }

    for (const row of upgradeHost.querySelectorAll('.upg-row')) {
      const buy = row.querySelector('button.primary');
      if (!buy) continue;
      const targetInvalid = invalidFactories.has(row.dataset.targetFactoryId);
      const rawUpgrade = group.upgrades.find((upgrade) => upgrade.id === row.dataset.upgradeId);
      const lockReason = rawUpgrade ? upgradeLockReason(group, rawUpgrade) : null;
      row.classList.toggle('locked', Boolean(lockReason));
      row.classList.toggle('hidden', hideLocked && Boolean(lockReason));
      const status = row.querySelector(`[data-upgrade-status-for="${row.dataset.upgradeId}"]`);
      if (status) status.textContent = lockReason || '未购买';
      buy.disabled = targetInvalid || Boolean(lockReason);
      buy.title = targetInvalid
        ? '目标工厂数据无效，升级已忽略'
        : lockReason
          ? lockReason
          : '扣除资源，把目标工厂的产出乘以这个倍率；按住 Ctrl 强制购买（资源不足时清零）';
    }
    updateHiddenLockedNote(group);

    for (const node of factoryHost.querySelectorAll('[data-contribution-for]')) {
      if (invalidFactories.has(node.dataset.contributionFor)) {
        node.textContent = '已忽略';
        continue;
      }
      const factory = state.factories.find((item) => item.id === node.dataset.contributionFor);
      const resource = state.resources.find((item) => item.id === factory?.outputResourceId);
      if (!factory || !resource) {
        node.textContent = '';
        continue;
      }
      const multiplier = factory.contributionMultiplier ?? 1;
      const contribution = factory.owned * factory.unit * multiplier;
      node.textContent = `当前贡献 ${fmtNum(contribution)} ${resource.emoji}/秒`;
    }
  }

  function applyNotation() {
    const group = getGroup();
    const convert = (input) => {
      if (!input.value.trim()) return;
      const value = parseNum(input.value);
      if (Number.isFinite(value)) input.value = fmtNum(value);
    };
    for (const input of resourceHost.querySelectorAll('.res-row input')) {
      if (input.classList.contains('res-name')) continue;
      convert(input);
    }
    for (const input of factoryHost.querySelectorAll('.fac-row input')) {
      if (input.type === 'checkbox') continue;
      const label = input.closest('div')?.querySelector('label')?.textContent ?? '';
      if (label.includes('已拥有') || label.includes('增长倍率')) continue;
      convert(input);
    }
    for (const input of upgradeHost.querySelectorAll('.upg-row input')) {
      const label = input.closest('div')?.querySelector('label')?.textContent ?? '';
      if (label.includes('倍率')) continue;
      convert(input);
    }

    // 把格式化后的字符串同步回数据，避免下次重渲染又变回旧值。
    const inputs = resourceHost.querySelectorAll('.res-row');
    inputs.forEach((row, index) => {
      const resource = group.resources[index];
      if (!resource) return;
      const [amount, baseRate] = row.querySelectorAll('input');
      if (amount) resource.amount = amount.value;
      if (baseRate) resource.baseRate = baseRate.value;
    });
    factoryHost.querySelectorAll('.fac-row').forEach((row, index) => {
      const factory = group.factories[index];
      if (!factory) return;
      const owned = row.querySelector('.factory-inline input');
      const values = row.querySelectorAll('.factory-inline input');
      if (owned) factory.owned = owned.value;
      if (values[1]) factory.price = values[1].value;
      if (values[2]) factory.unit = values[2].value;
      if (values[3]) factory.growth = values[3].value;
    });
    upgradeHost.querySelectorAll('.upg-row').forEach((row, index) => {
      const upgrade = group.upgrades[index];
      if (!upgrade) return;
      const values = row.querySelectorAll('.edit-grid input');
      if (values[0]) upgrade.multiplier = values[0].value;
      if (values[1]) upgrade.cost = values[1].value;
    });
  }

  function startDrag(event, row, index) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.isPrimary === false) return;
    event.preventDefault();
    const rect = row.getBoundingClientRect();
    const placeholder = element(document, 'div', 'fac-row drag-placeholder');
    placeholder.style.height = `${rect.height}px`;
    row.before(placeholder);
    row.classList.add('dragging');

    const ghost = row.cloneNode(true);
    ghost.classList.add('fac-drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.append(ghost);
    document.body.classList.add('drag-reorder');

    dragState = { row, index, placeholder, ghost, startY: event.clientY, pointerId: event.pointerId };
    row.setPointerCapture?.(event.pointerId);
    document.addEventListener('pointermove', onDragMove, { passive: false });
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);
  }

  function onDragMove(event) {
    if (!dragState) return;
    event.preventDefault();
    const delta = event.clientY - dragState.startY;
    dragState.ghost.style.transform = `translateY(${delta}px)`;
    const rows = [...factoryHost.querySelectorAll('.fac-row:not(.dragging):not(.drag-placeholder)')];
    const next = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    if (next) factoryHost.insertBefore(dragState.placeholder, next);
    else factoryHost.append(dragState.placeholder);
  }

  function onDragEnd() {
    if (!dragState) return;
    const { row, placeholder, ghost } = dragState;
    let targetIndex = 0;
    for (const child of factoryHost.children) {
      if (child === placeholder) break;
      if (child !== row && child.classList.contains('fac-row')) targetIndex += 1;
    }

    const group = getGroup();
    const [moved] = group.factories.splice(dragState.index, 1);
    group.factories.splice(Math.min(targetIndex, group.factories.length), 0, moved);

    ghost.remove();
    placeholder.remove();
    row.classList.remove('dragging');
    document.body.classList.remove('drag-reorder');
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);
    dragState = null;
    renderAll();
    signalChange();
  }

  // 静态按钮：增删资源/工厂/升级。
  document.getElementById('add-resource').addEventListener('click', () => {
    const group = getGroup();
    const resource = createEmptyResource(
      RESOURCE_EMOJIS[group.resources.length % RESOURCE_EMOJIS.length],
    );
    group.resources.push(resource);
    renderAll();
    signalChange();
  });

  document.getElementById('add-factory').addEventListener('click', () => {
    const group = getGroup();
    const resourceId = group.resources[0]?.id ?? '';
    group.factories.push(createEmptyFactory(resourceId));
    renderAll();
    signalChange();
  });

  document.getElementById('add-upgrade').addEventListener('click', () => {
    const group = getGroup();
    const resourceId = group.resources[0]?.id ?? '';
    const factoryId = group.factories[0]?.id ?? '';
    group.upgrades.push(createEmptyUpgrade(resourceId, factoryId));
    renderAll();
    signalChange();
  });

  return {
    render: renderAll,
    sync: renderAll,
    updateRates,
    applyNotation,
    setStatus,
    clearStatus() {
      factoryStatus.textContent = '';
      upgradeStatus.textContent = '';
      factoryStatus.classList.remove('err');
      upgradeStatus.classList.remove('err');
    },
  };
}
