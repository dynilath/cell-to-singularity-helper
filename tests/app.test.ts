// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createApp } from '../src/app.ts';
import { PLAN_VERSION, RESOURCE_EMOJIS, SETTING_KEYS, STORAGE_KEY } from '../src/data/schema.ts';

const HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const OPEN_TIME = new Date('2026-10-20T12:00:00+08:00').getTime();

let contexts = [];

function sampleStore(overrides = {}) {
  return {
    globalGrowth: '2',
    asOf: OPEN_TIME,
    resources: [
      { id: 'r1', emoji: '🌱', name: '资源1', amount: '0', baseRate: '0' },
    ],
    factories: [
      {
        id: 'f1',
        price: '100',
        unit: '10',
        growth: '2',
        owned: '1',
        outputResourceId: 'r1',
        costResourceId: 'r1',
      },
    ],
    upgrades: [
      {
        id: 'u1',
        cost: '1000',
        costResourceId: 'r1',
        targetFactoryId: 'f1',
        multiplier: '2',
        purchased: false,
      },
    ],
    plan: null,
    reminder: null,
    ...overrides,
  };
}

function boot(store = sampleStore(), extraSeed = {}) {
  const dom = new JSDOM(HTML, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  document.querySelector('script[type="module"]')?.remove();
  window.confirm = () => true;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  for (const [key, value] of Object.entries(extraSeed)) window.localStorage.setItem(key, value);

  const app = createApp({ document, window });
  app.start();

  const context = { dom, window, document, app };
  contexts.push(context);
  return context;
}

function savedStore(context) {
  return JSON.parse(context.window.localStorage.getItem(STORAGE_KEY));
}

function resourceInputs(context) {
  return [...context.document.querySelectorAll('#resource-rows .res-row input')];
}

function factoryInputs(context, index = 0) {
  return [
    ...context.document.querySelectorAll('#factory-rows .fac-row')[index].querySelectorAll(
      '.factory-inline input',
    ),
  ];
}

function upgradeInputs(context, index = 0) {
  return [
    ...context.document.querySelectorAll('#upgrade-rows .upg-row')[index].querySelectorAll(
      '.edit-grid input',
    ),
  ];
}

function click(context, selector) {
  context.document.querySelector(selector).click();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(OPEN_TIME);
});

afterEach(() => {
  for (const context of contexts) context.app.dispose();
  contexts = [];
  vi.useRealTimers();
});

describe('v6 boot', () => {
  it('waits longer before planning while a data input is focused', () => {
    const context = boot();
    const amount = resourceInputs(context)[0];
    amount.focus();
    amount.value = '1000';
    amount.dispatchEvent(new context.window.Event('input', { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(savedStore(context).plan).toBeNull();
    vi.advanceTimersByTime(600);
    expect(savedStore(context).plan).not.toBeNull();
  });

  it('applies the global ad multiplier from the top selector', () => {
    const context = boot();
    const before = savedStore(context).plan.total;
    const select = context.document.getElementById('global-ad');
    expect(select.value).toBe('1');

    select.value = '4';
    select.dispatchEvent(new context.window.Event('change', { bubbles: true }));

    expect(select.value).toBe('4');
    expect(context.window.localStorage.getItem(SETTING_KEYS.globalAdMultiplier)).toBe('4');
    expect(savedStore(context).plan.total).toBeCloseTo(before / 4, 6);
  });

  it('renders one dataset with resources and no data-group tabs', () => {
    const context = boot();
    expect(context.document.querySelectorAll('#resource-rows .res-row')).toHaveLength(1);
    expect(context.document.querySelectorAll('#factory-rows .fac-row')).toHaveLength(1);
    expect(context.document.getElementById('group-tabs')).toBeNull();
    expect(context.document.querySelector('#resource-rows .res-emoji').value).toBe('🌱');

    const head = context.document.querySelector('#factory-rows .fac-head');
    expect(head.querySelector('[data-contribution-for]')).not.toBeNull();
    expect(head.querySelector('[data-contribution-for]').textContent).toContain('当前贡献');
    expect(head.querySelector('.new-factory-label')).toBeNull();
    const headChildren = [...head.children];
    expect(headChildren[0].classList.contains('fac-name')).toBe(true);
    expect(headChildren[1].classList.contains('fac-buy-actions')).toBe(true);
    expect(headChildren[2].classList.contains('contribution')).toBe(true);
    expect(headChildren[3].classList.contains('fac-del')).toBe(true);
    expect(
      context.document.querySelector('#factory-rows .factory-inline [data-contribution-for]'),
    ).toBeNull();

    const upgradeCostGroup = context.document.querySelector(
      '#upgrade-rows .upg-row .edit-grid .input-with-resource',
    );
    expect(upgradeCostGroup).not.toBeNull();
    expect(upgradeCostGroup.querySelector('.res-picker')).not.toBeNull();
    expect(upgradeCostGroup.querySelectorAll('input')).toHaveLength(1);
  });

  it('puts notation, preset import, and save tools in the floating settings menu', () => {
    const context = boot();
    const menu = context.document.getElementById('fab-menu');
    expect(menu.classList.contains('hidden')).toBe(true);
    expect(context.document.getElementById('notation').closest('#fab-menu')).toBe(menu);
    expect(context.document.getElementById('preset-open').closest('#fab-menu')).toBe(menu);
    expect(context.document.getElementById('mh-open').closest('#fab-menu')).toBe(menu);
    expect(context.document.getElementById('save-export').closest('#fab-menu')).toBe(menu);
    expect(context.document.getElementById('save-import').closest('#fab-menu')).toBe(menu);

    click(context, '#fab-btn');
    expect(menu.classList.contains('hidden')).toBe(false);
    expect(context.document.getElementById('fab-btn').getAttribute('aria-expanded')).toBe('true');

    context.document.body.dispatchEvent(
      new context.window.MouseEvent('pointerdown', { bubbles: true }),
    );
    expect(menu.classList.contains('hidden')).toBe(true);
    expect(context.document.getElementById('fab-btn').getAttribute('aria-expanded')).toBe('false');
  });

  it('exports the current store as a downloadable JSON archive', () => {
    const context = boot();
    click(context, '#fab-btn');

    const captured = [];
    const OriginalBlob = context.window.Blob;
    context.window.Blob = class extends OriginalBlob {
      constructor(parts, options) {
        super(parts, options);
        captured.push(parts.join(''));
      }
    };
    context.window.URL.createObjectURL = vi.fn(() => 'blob:save');
    context.window.URL.revokeObjectURL = vi.fn();
    const anchors = [];
    const clickSpy = vi
      .spyOn(context.window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function () {
        anchors.push(this);
      });

    click(context, '#save-export');

    expect(captured).toHaveLength(1);
    const payload = JSON.parse(captured[0]);
    expect(payload.format).toBe('cell-to-singularity-helper-save');
    expect(payload.version).toBe(1);
    expect(payload.data.factories).toHaveLength(1);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toMatch(/^探索助手存档-\d{8}-\d{4}\.json$/);
    expect(anchors[0].href).toBe('blob:save');
    expect(context.document.getElementById('save-status').textContent).toContain('已导出');
    clickSpy.mockRestore();
  });

  it('imports a JSON archive and replaces the current data', async () => {
    const context = boot();
    click(context, '#fab-btn');
    const archive = {
      globalGrowth: '1.2',
      resources: [{ id: 'rx', emoji: '💎', amount: '42', baseRate: '7' }],
      factories: [
        {
          id: 'fx',
          name: '新工厂',
          price: '10',
          unit: '2',
          growth: '1.2',
          owned: '3',
          outputResourceId: 'rx',
          costResourceId: 'rx',
        },
      ],
      upgrades: [],
      completedUpgrades: [],
      plan: null,
      reminder: null,
      preset: null,
    };
    const file = {
      name: 'my-save.json',
      size: 100,
      text: async () => JSON.stringify(archive),
    };
    const input = context.document.getElementById('save-file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new context.window.Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const saved = savedStore(context);
    expect(saved.resources[0]).toMatchObject({ emoji: '💎', amount: '42' });
    expect(saved.factories[0].name).toBe('新工厂');
    expect(saved.factories[0].owned).toBe('3');
    expect(context.document.querySelectorAll('#factory-rows .fac-row')).toHaveLength(1);
    expect(context.document.querySelector('#factory-rows .fac-name b').textContent).toBe('新工厂');
    expect(context.document.getElementById('save-status').textContent).toContain('已导入');
  });

  it('shows a clear error when the archive is invalid', async () => {
    const context = boot();
    click(context, '#fab-btn');
    const file = {
      name: 'broken.json',
      size: 10,
      text: async () => 'not json',
    };
    const input = context.document.getElementById('save-file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new context.window.Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(context.document.getElementById('save-status').classList.contains('err')).toBe(true);
    expect(context.document.getElementById('save-status').textContent).toContain('导入失败');
    expect(savedStore(context).factories[0].id).toBe('f1');
  });

  it('does not close a dialog when a text selection is released on the backdrop', () => {
    const context = boot();
    click(context, '#fab-btn');
    click(context, '#preset-open');
    const dialog = context.document.getElementById('preset-dialog');
    dialog.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      right: 500,
      bottom: 500,
      width: 400,
      height: 400,
    });
    const fire = (target, type, x, y) =>
      target.dispatchEvent(
        new context.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
      );

    fire(context.document.getElementById('preset-level'), 'mousedown', 150, 150);
    fire(dialog, 'mouseup', 50, 50);
    expect(dialog.hasAttribute('open')).toBe(true);

    fire(dialog, 'mousedown', 50, 50);
    fire(dialog, 'mouseup', 50, 50);
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('plans factories and upgrades across resources', () => {
    const context = boot();
    expect(context.document.getElementById('result-body').classList.contains('hidden')).toBe(false);
    expect(context.document.getElementById('strategy').textContent).toContain('共买');
    expect(context.document.getElementById('strategy').textContent).toContain('升级1');
    expect(context.document.getElementById('total-line').textContent).toContain('先买「升级1」');
    expect(context.document.getElementById('next-lbl').textContent).toContain('工厂1');
    const rows = context.document.querySelectorAll('#timeline tr');
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[rows.length - 1].textContent).toContain('升级1');
  });

  it('keeps resource icons and multipliers out of the tab order', () => {
    const context = boot();
    const { document } = context;
    expect(document.getElementById('global-growth').tabIndex).toBe(-1);
    expect(document.getElementById('offline-rate').tabIndex).toBe(-1);
    expect(document.querySelector('.res-emoji').tabIndex).toBe(-1);
    for (const picker of document.querySelectorAll('#factory-rows .res-picker')) {
      expect(picker.tabIndex).toBe(-1);
    }
    expect(factoryInputs(context)[3].tabIndex).toBe(-1); // 工厂增长倍率
    expect(upgradeInputs(context)[0].tabIndex).toBe(-1); // 升级倍率
    const upgradeResourcePicker = document.querySelector(
      '#upgrade-rows .upg-row .edit-grid .res-picker',
    );
    expect(upgradeResourcePicker.tabIndex).toBe(-1); // 升级花费资源图标
  });

  it('shows an overall operation preview when there are multiple upgrades', () => {
    const store = sampleStore({
      resources: [{ id: 'r1', emoji: '🌱', amount: '10000', baseRate: '0' }],
      upgrades: [
        {
          id: 'u1',
          cost: '1000',
          costResourceId: 'r1',
          targetFactoryId: 'f1',
          multiplier: '2',
          purchased: false,
        },
        {
          id: 'u2',
          cost: '1000',
          costResourceId: 'r1',
          targetFactoryId: 'f1',
          multiplier: '2',
          purchased: false,
        },
        {
          id: 'u3',
          cost: '1000',
          costResourceId: 'r1',
          targetFactoryId: 'f1',
          multiplier: '2',
          purchased: false,
        },
      ],
    });
    const context = boot(store);
    const strategy = context.document.getElementById('strategy').textContent;
    expect(strategy).toContain('升级1');
    expect(context.document.getElementById('total-line').textContent).toContain('先买');
  });

  it('recomputes a saved plan created by an older planner version', () => {
    const store = sampleStore();
    store.plan = {
      steps: [
        {
          type: 'upgrade',
          upgradeId: 'u1',
          label: '升级1',
          cost: 1000,
          resourceId: 'r1',
          resourceName: '资源1',
          t: 10,
        },
      ],
      anchor: OPEN_TIME,
      stepIndex: 0,
      goal: 'upgrades',
      goalLabel: '旧计划',
      complete: false,
      total: 999,
      generatedAt: OPEN_TIME,
      strategy: 'search',
      version: 1,
    };
    store.reminder = {
      kind: 'full',
      title: '旧提醒',
      body: '',
      endTime: OPEN_TIME + 999_000,
      durMs: 999_000,
      fired: false,
      paused: false,
    };
    const context = boot(store);
    const saved = savedStore(context);
    expect(saved.plan.version).toBe(PLAN_VERSION);
    expect(saved.plan.goalLabel).not.toBe('旧计划');
    expect(saved.reminder).toBeNull();
  });

  it('reproduces the same plan when a resource value is changed back', () => {
    const context = boot(
      sampleStore({
        resources: [
          {
            id: 'r1',
            emoji: '🌱',
            name: '资源1',
            amount: '3.21e7',
            baseRate: '2.23e15',
          },
        ],
      }),
    );
    const amount = resourceInputs(context)[0];
    const first = savedStore(context).plan;
    expect(first).not.toBeNull();

    amount.value = '3.21e8';
    amount.dispatchEvent(new context.window.Event('input', { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(savedStore(context).plan).not.toBeNull();

    amount.value = '3.21e7';
    amount.dispatchEvent(new context.window.Event('input', { bubbles: true }));
    vi.advanceTimersByTime(400);
    const restored = savedStore(context).plan;
    expect(restored.steps).toEqual(first.steps);
    expect(restored.total).toBe(first.total);
  });

  it('uses the state-space search strategy without an online/offline switch', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '0', baseRate: '1000' }],
        factories: [
          {
            id: 'f1',
            name: '工厂1',
            price: '1e15',
            unit: '10',
            growth: '2',
            owned: '1',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
        ],
        upgrades: [
          {
            id: 'u1',
            name: '升级1',
            cost: '1000000',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
          },
        ],
      }),
      { [SETTING_KEYS.offlineRate]: '2.1' },
    );
    const select = context.document.getElementById('plan-strategy');
    expect(select.value).toBe('search');
    const plan = savedStore(context);
    expect(plan.plan.strategy).toBe('search');
    expect(context.document.getElementById('strategy').textContent).toContain('按时间表');
  });

  it('ignores invalid factory rows and disables their quick-buy buttons', () => {
    const store = sampleStore();
    store.factories.push({
      id: 'f2',
      price: '',
      unit: '',
      growth: '',
      owned: '0',
      outputResourceId: 'r1',
      costResourceId: 'r1',
    });
    const context = boot(store);
    const row = context.document.querySelectorAll('#factory-rows .fac-row')[1];
    expect(row.classList.contains('ignored')).toBe(true);
    expect(row.querySelector('.contribution').textContent).toBe('已忽略');
    expect([...row.querySelectorAll('.fac-buy')].every((button) => button.disabled)).toBe(true);
    expect([...context.document.querySelectorAll('#timeline tr')].some((tr) => tr.textContent.includes('工厂2'))).toBe(false);
    expect(savedStore(context).plan.steps.some((step) => step.factoryId === 'f2')).toBe(false);
  });
});

describe('factory and upgrade names', () => {
  function namedStore() {
    return sampleStore({
      factories: [
        {
          id: 'f1',
          name: '深不可测的存在',
          price: '100',
          unit: '10',
          growth: '2',
          owned: '1',
          outputResourceId: 'r1',
          costResourceId: 'r1',
        },
      ],
      upgrades: [
        {
          id: 'u1',
          name: '狗头人',
          cost: '1000',
          costResourceId: 'r1',
          targetFactoryId: 'f1',
          multiplier: '2',
          purchased: false,
        },
      ],
    });
  }

  it('shows names as read-only text until the edit button is clicked', () => {
    const context = boot(namedStore());
    const factoryName = context.document.querySelector('#factory-rows .fac-name');
    expect(factoryName.querySelector('input.name-input')).toBeNull();
    expect(factoryName.querySelector('b').textContent).toBe('深不可测的存在');
    expect(factoryName.querySelector('.name-edit')).not.toBeNull();

    const upgradeName = context.document.querySelector('#upgrade-rows .upg-name');
    expect(upgradeName.querySelector('input')).toBeNull();
    expect(upgradeName.querySelector('b').textContent).toBe('狗头人');
    expect(upgradeName.querySelector('.name-edit')).not.toBeNull();
  });

  it('edits a factory name and saves it on Enter', () => {
    const context = boot(namedStore());
    click(context, '#factory-rows .name-edit');
    const input = context.document.querySelector('#factory-rows .fac-name input.name-input');
    expect(input).not.toBeNull();
    expect(input.value).toBe('深不可测的存在');

    input.value = '深不可测之核';
    input.dispatchEvent(
      new context.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(savedStore(context).factories[0].name).toBe('深不可测之核');
    expect(context.document.querySelector('#factory-rows .fac-name b').textContent).toBe(
      '深不可测之核',
    );
    expect(context.document.querySelector('#factory-rows .fac-name input.name-input')).toBeNull();
  });

  it('edits an upgrade name on blur and reverts it on Escape', () => {
    const context = boot(namedStore());
    click(context, '#upgrade-rows .name-edit');
    let input = context.document.querySelector('#upgrade-rows .upg-name input.name-input');
    input.value = '河童';
    input.dispatchEvent(new context.window.Event('blur'));

    expect(savedStore(context).upgrades[0].name).toBe('河童');
    expect(context.document.querySelector('#upgrade-rows .upg-name b').textContent).toBe('河童');

    click(context, '#upgrade-rows .name-edit');
    input = context.document.querySelector('#upgrade-rows .upg-name input.name-input');
    input.value = '不该保存';
    input.dispatchEvent(
      new context.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(savedStore(context).upgrades[0].name).toBe('河童');
    expect(context.document.querySelector('#upgrade-rows .upg-name b').textContent).toBe('河童');
    expect(context.document.querySelector('#upgrade-rows .upg-name input')).toBeNull();
  });

  it('clears a name back to the automatic label', () => {
    const context = boot(namedStore());
    click(context, '#factory-rows .name-edit');
    const input = context.document.querySelector('#factory-rows .fac-name input.name-input');
    input.value = '   ';
    input.dispatchEvent(
      new context.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(savedStore(context).factories[0].name).toBe('');
    expect(context.document.querySelector('#factory-rows .fac-name b').textContent).toBe('工厂1');
  });
});

describe('factory auto-production', () => {
  function inactiveStore() {
    return sampleStore({
      resources: [
        { id: 'r1', emoji: '🔥', name: '基因', amount: '1000', baseRate: '0' },
      ],
      factories: [
        {
          id: 'f1',
          name: '粮库',
          price: '500',
          unit: '100',
          growth: '2',
          owned: '1',
          outputResourceId: 'r1',
          costResourceId: 'r1',
          active: false,
        },
      ],
      upgrades: [
        {
          id: 'u1',
          name: '自动产出',
          cost: '100',
          costResourceId: 'r1',
          targetFactoryId: 'f1',
          multiplier: '1',
          effect: 'activate',
          purchased: false,
        },
      ],
    });
  }

  it('shows an inactive factory with zero contribution', () => {
    const context = boot(inactiveStore());
    const row = context.document.querySelector('#factory-rows .fac-row');
    const toggle = row.querySelector('.auto-toggle input');
    expect(toggle.checked).toBe(false);
    expect(toggle.closest('.auto-toggle').textContent).toContain('未自动产出');
    expect(row.querySelector('[data-contribution-for]').textContent).toBe('未自动产出');
    expect(resourceInputs(context)[2].value).toBe('0');

    const status = context.document.querySelector(
      '#upgrade-rows .upg-row [data-upgrade-status-for]',
    );
    expect(status.textContent).toBe('解锁自动产出');
    expect(context.document.querySelector('#upgrade-rows .upg-effect').value).toBe('activate');
  });

  it('stops counting a factory when auto production is unchecked', () => {
    const context = boot();
    const checkbox = context.document.querySelector('#factory-rows .auto-toggle input');
    expect(checkbox.checked).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new context.window.Event('change', { bubbles: true }));

    expect(savedStore(context).factories[0].active).toBe(false);
    expect(
      context.document.querySelector('#factory-rows [data-contribution-for]').textContent,
    ).toBe('未自动产出');
  });

  it('buys an auto-production upgrade and starts the factory', () => {
    const context = boot(inactiveStore());
    click(context, '#upgrade-rows .upg-row button.primary');

    const saved = savedStore(context);
    expect(saved.upgrades).toHaveLength(0);
    expect(saved.factories[0].active).toBe(true);
    expect(saved.resources[0].amount).toBe('900');
    expect(context.document.querySelector('#factory-rows .auto-toggle input').checked).toBe(true);
    expect(
      context.document.querySelector('#factory-rows [data-contribution-for]').textContent,
    ).toContain('当前贡献 100');
    expect(context.document.getElementById('upgrade-status').textContent).toContain(
      '开始自动产出',
    );
  });

  it('applies an auto-production step in step mode', () => {
    const context = boot(inactiveStore());
    click(context, '#start-steps');
    click(context, '#complete-step');

    expect(savedStore(context).factories[0].active).toBe(true);
  });

  it('switches an upgrade between multiplier and auto-production effects', () => {
    const context = boot(sampleStore());
    const select = context.document.querySelector('#upgrade-rows .upg-effect');
    expect(select.value).toBe('multiply');

    select.value = 'activate';
    select.dispatchEvent(new context.window.Event('change', { bubbles: true }));

    const saved = savedStore(context);
    expect(saved.upgrades[0]).toMatchObject({ effect: 'activate', multiplier: '1' });
    const multiplier = context.document.querySelector('#upgrade-rows .edit-grid input');
    expect(multiplier.disabled).toBe(true);
    expect(context.document.querySelector('#upgrade-rows .upg-row button.primary').disabled).toBe(
      true,
    );
  });
});

describe('manual purchases', () => {
  it('force buys factories with Ctrl and clears the cost resource', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '50', baseRate: '0' }],
        factories: [
          {
            id: 'f1',
            price: '100',
            unit: '10',
            growth: '2',
            owned: '1',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
        ],
        upgrades: [],
      }),
    );
    const button = context.document.querySelector('#factory-rows .fac-buy[data-count="1"]');
    button.dispatchEvent(
      new context.window.MouseEvent('click', { bubbles: true, ctrlKey: true }),
    );

    const store = savedStore(context);
    expect(store.factories[0].owned).toBe('2');
    expect(store.factories[0].price).toBe('200');
    expect(store.resources[0].amount).toBe('0');
    expect(context.document.getElementById('factory-status').textContent).toContain('强制结算');
    expect(context.document.getElementById('factory-status').textContent).toContain('清零');
  });

  it('highlights quick-buy buttons while Ctrl is held', () => {
    const context = boot();
    context.document.dispatchEvent(
      new context.window.KeyboardEvent('keydown', {
        key: 'Control',
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(context.document.body.classList.contains('ctrl-force')).toBe(true);

    context.document.dispatchEvent(
      new context.window.KeyboardEvent('keyup', {
        key: 'Control',
        ctrlKey: false,
        bubbles: true,
      }),
    );
    expect(context.document.body.classList.contains('ctrl-force')).toBe(false);
  });

  it('does not force buy without Ctrl when resources are insufficient', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '50', baseRate: '0' }],
        factories: [
          {
            id: 'f1',
            price: '100',
            unit: '10',
            growth: '2',
            owned: '1',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
        ],
        upgrades: [],
      }),
    );
    click(context, '#factory-rows .fac-buy[data-count="1"]');
    const store = savedStore(context);
    expect(store.factories[0].owned).toBe('1');
    expect(store.resources[0].amount).toBe('50');
    expect(context.document.getElementById('factory-status').textContent).toContain('资源不足');
  });

  it('locks owned editing and normal buys for an unlocked factory, but Ctrl can force buy', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '2000', baseRate: '0' }],
        factories: [
          {
            id: 'f1',
            name: '工厂1',
            price: '100',
            unit: '10',
            growth: '2',
            owned: '1',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
          {
            id: 'f2',
            name: '工厂2',
            price: '100',
            unit: '10',
            growth: '2',
            owned: '0',
            outputResourceId: 'r1',
            costResourceId: 'r1',
            requires: { type: 'upgrade', id: 'u1' },
          },
        ],
        upgrades: [
          {
            id: 'u1',
            name: '前置升级',
            cost: '1000',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
          },
        ],
      }),
    );
    const row = context.document.querySelectorAll('#factory-rows .fac-row')[1];
    const owned = row.querySelectorAll('.factory-inline input')[0];
    const buy = row.querySelector('.fac-buy[data-count="1"]');
    expect(owned.disabled).toBe(true);
    expect(buy.disabled).toBe(false);
    expect(buy.getAttribute('aria-disabled')).toBe('true');

    click(context, '#factory-rows .fac-row:nth-child(2) .fac-buy[data-count="1"]');
    expect(savedStore(context).factories[1].owned).toBe('0');
    expect(context.document.getElementById('factory-status').textContent).toContain('需先购买');

    buy.dispatchEvent(
      new context.window.MouseEvent('click', { bubbles: true, ctrlKey: true }),
    );
    const saved = savedStore(context);
    expect(saved.factories[1].owned).toBe('1');
    expect(saved.resources[0].amount).not.toBe('2000');
    const refreshedOwned = context.document
      .querySelectorAll('#factory-rows .fac-row')[1]
      .querySelectorAll('.factory-inline input')[0];
    expect(refreshedOwned.disabled).toBe(false);
  });

  it('quick buys a factory: deducts the resource and advances owned/price', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '1000', baseRate: '0' }],
        factories: [
          {
            id: 'f1',
            price: '100',
            unit: '10',
            growth: '2',
            owned: '0',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
        ],
        upgrades: [],
      }),
    );
    const row = context.document.querySelector('#factory-rows .fac-row');
    click(context, '#factory-rows .fac-buy[data-count="1"]');
    const store = savedStore(context);
    expect(store.resources[0].amount).toBe('900');
    expect(store.factories[0].owned).toBe('1');
    expect(store.factories[0].price).toBe('200');
    expect(context.document.querySelector('#factory-rows .fac-row')).toBe(row);
    expect(context.document.querySelector('[data-factory-owned-for="f1"]').value).toBe('1');
    expect(context.document.querySelector('[data-factory-price-for="f1"]').value).toBe('200');
    expect(context.document.querySelector('[data-resource-amount-for="r1"]').value).toBe('900');
    expect(context.document.getElementById('factory-status').textContent).toContain('已结算');
  });

  it('buys an upgrade: deducts its resource and applies the multiplier', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '2000', baseRate: '0' }],
      }),
    );
    click(context, '#upgrade-rows .upg-row button.primary');
    vi.advanceTimersByTime(400);
    const store = savedStore(context);
    expect(store.upgrades).toHaveLength(0);
    expect(store.factories[0].unit).toBe('20');
    expect(store.resources[0].amount).toBe('1.00K');
    expect(
      context.document.querySelector('#resource-rows [data-total-rate-for]').value,
    ).toBe('20');
    expect(context.document.querySelectorAll('#upgrade-rows .upg-row')).toHaveLength(0);
    expect(context.document.getElementById('upgrade-rows').textContent).toContain(
      '没有未购买的升级',
    );
    expect(context.document.querySelector('#factory-rows .contribution').textContent).toBe(
      '当前贡献 20 🌱/秒',
    );
    expect(context.document.getElementById('upgrade-status').textContent).toContain(
      '单台产出 → 20',
    );
    expect(store.plan.complete).toBe(true);
    expect(store.reminder).toBeNull();
  });

  it('force buys an upgrade with Ctrl and clears the cost resource', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '50', baseRate: '0' }],
      }),
    );
    const button = context.document.querySelector('#upgrade-rows .upg-row button.primary');
    button.dispatchEvent(
      new context.window.MouseEvent('click', { bubbles: true, ctrlKey: true }),
    );

    const store = savedStore(context);
    expect(store.upgrades).toHaveLength(0);
    expect(store.factories[0].unit).toBe('20');
    expect(store.resources[0].amount).toBe('0');
    expect(context.document.getElementById('upgrade-status').textContent).toContain('强制购买');
    expect(context.document.getElementById('upgrade-status').textContent).toContain('清零');
  });

  it('locks an upgrade until its prerequisite is purchased', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '2000', baseRate: '0' }],
        upgrades: [
          {
            id: 'u1',
            name: '前置升级',
            cost: '100',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
            requires: null,
          },
          {
            id: 'u2',
            name: '依赖升级',
            cost: '100',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
            requires: { type: 'upgrade', id: 'u1' },
          },
        ],
      }),
    );
    let rows = context.document.querySelectorAll('#upgrade-rows .upg-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('button.primary').disabled).toBe(false);
    expect(rows[1].querySelector('button.primary').disabled).toBe(true);
    expect(rows[1].querySelector('.upg-head .hint').textContent).toContain('需先购买「前置升级」');

    const hide = context.document.getElementById('hide-locked-upgrades');
    hide.checked = true;
    hide.dispatchEvent(new context.window.Event('change', { bubbles: true }));
    rows = context.document.querySelectorAll('#upgrade-rows .upg-row');
    expect(rows[0].classList.contains('hidden')).toBe(false);
    expect(rows[1].classList.contains('hidden')).toBe(true);
    expect(context.document.getElementById('upgrade-rows').textContent).toContain('已隐藏 1 个未解锁升级');
    expect(context.window.localStorage.getItem(SETTING_KEYS.hideLockedUpgrades)).toBe('1');

    click(context, '#upgrade-rows .upg-row button.primary');
    expect(savedStore(context).completedUpgrades).toContain('u1');
    rows = context.document.querySelectorAll('#upgrade-rows .upg-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].classList.contains('hidden')).toBe(false);
    expect(rows[0].querySelector('button.primary').disabled).toBe(false);
    click(context, '#upgrade-rows .upg-row button.primary');
    expect(savedStore(context).completedUpgrades).toEqual(['u1', 'u2']);
  });

  it('refreshes the lock status when target factory ownership is edited directly', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '0', baseRate: '0' }],
        factories: [
          {
            id: 'f1',
            price: '100',
            unit: '10',
            growth: '2',
            owned: '0',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
        ],
        upgrades: [
          {
            id: 'u1',
            name: '狗头人',
            cost: '100',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
            requires: { type: 'factory', id: 'f1' },
          },
        ],
      }),
    );
    const row = context.document.querySelector('#upgrade-rows .upg-row');
    expect(row.querySelector('button.primary').disabled).toBe(true);
    expect(row.querySelector('.upg-head .hint').textContent).toContain('至少 1 台');

    const owned = factoryInputs(context, 0)[0];
    owned.value = '10';
    owned.dispatchEvent(new context.window.Event('input', { bubbles: true }));
    vi.advanceTimersByTime(400);

    expect(row.querySelector('button.primary').disabled).toBe(false);
    expect(row.querySelector('.upg-head .hint').textContent).toBe('未购买');
  });

  it('multiplies the unit output for every purchased upgrade without hidden multipliers', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', amount: '5000', baseRate: '0' }],
        upgrades: [
          {
            id: 'u1',
            cost: '1000',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
          },
          {
            id: 'u2',
            cost: '1000',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
          },
        ],
      }),
    );
    click(context, '#upgrade-rows .upg-row button.primary');
    expect(savedStore(context).factories[0].unit).toBe('20');
    click(context, '#upgrade-rows .upg-row button.primary');
    const store = savedStore(context);
    expect(store.factories[0].unit).toBe('40');
    expect(store.upgrades).toHaveLength(0);
    expect(context.document.querySelector('#factory-rows .contribution').textContent).toBe(
      '当前贡献 40 🌱/秒',
    );
  });

  it('deletes an unbought upgrade without spending or applying its multiplier', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', amount: '2000', baseRate: '0' }],
      }),
    );
    click(context, '#upgrade-rows .upg-row .fac-del');
    const store = savedStore(context);
    expect(store.upgrades).toHaveLength(0);
    expect(store.resources[0].amount).toBe('2000');
    expect(
      context.document.querySelector('#resource-rows [data-total-rate-for]').value,
    ).toBe('10');
    expect(context.document.getElementById('upgrade-rows').textContent).toContain(
      '没有未购买的升级',
    );
  });

  it('computes total production from base + factories and backfills base when total is edited', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', amount: '0', baseRate: '5' }],
        upgrades: [],
      }),
    );
    const inputs = resourceInputs(context);
    expect(inputs[2].value).toBe('15'); // 基础 5 + 工厂 10

    inputs[1].value = '20';
    inputs[1].dispatchEvent(new context.window.Event('input', { bubbles: true }));
    expect(inputs[2].value).toBe('30');

    inputs[2].value = '100';
    inputs[2].dispatchEvent(new context.window.Event('change', { bubbles: true }));
    expect(inputs[1].value).toBe('90');
    expect(inputs[2].value).toBe('100');
    expect(savedStore(context).resources[0].baseRate).toBe('90');
  });

  it('automatically opens the next segment after completing the current one', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', amount: '5000', baseRate: '0' }],
        upgrades: [
          {
            id: 'u1',
            cost: '1000',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
          },
          {
            id: 'u2',
            cost: '1000',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
          },
        ],
      }),
    );
    expect(savedStore(context).plan.steps.length).toBeGreaterThan(0);

    click(context, '#upgrade-rows .upg-row button.primary');
    vi.advanceTimersByTime(400);
    const plan = savedStore(context).plan;
    expect(plan).not.toBeNull();
    expect(plan.complete).toBe(false);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(savedStore(context).factories[0].unit).toBe('20');
    expect(context.document.querySelectorAll('#upgrade-rows .upg-row')).toHaveLength(1);
  });

  it('uses the offline rate only for the reminder wait, not the next-action time', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '0', baseRate: '0' }],
      }),
    );
    const half = context.document.getElementById('half-cb');
    if (half.checked) {
      half.checked = false;
      half.dispatchEvent(new context.window.Event('change', { bubbles: true }));
    }

    const nextActionSeconds = savedStore(context).plan.steps[0].t;
    const offline = context.document.getElementById('offline-rate');
    offline.value = '2.1';
    offline.dispatchEvent(new context.window.Event('change', { bubbles: true }));

    click(context, '#arm-btn');
    const saved = savedStore(context);
    expect(saved.plan.steps[0].t).toBeCloseTo(nextActionSeconds, 6);
    expect(saved.reminder.kind).toBe('full');
    expect(saved.reminder.durMs).toBeCloseTo((nextActionSeconds * 1000) / 2.1, 0);
  });

  it('does not divide the offline plan reminder time twice', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '0', baseRate: '10' }],
        factories: [
          {
            id: 'f1',
            name: '工厂1',
            price: '100',
            unit: '10',
            growth: '2',
            owned: '1',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
        ],
        upgrades: [
          {
            id: 'u1',
            name: '升级1',
            cost: '500',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
          },
        ],
      }),
      { [SETTING_KEYS.offlineRate]: '2.1' },
    );
    const half = context.document.getElementById('half-cb');
    if (half.checked) {
      half.checked = false;
      half.dispatchEvent(new context.window.Event('change', { bubbles: true }));
    }
    const plan = savedStore(context).plan;
    expect(plan.strategy).toBe('search');
    const seconds = plan.steps[0].t;
    click(context, '#arm-btn');
    expect(savedStore(context).reminder.durMs).toBeCloseTo((seconds * 1000) / 2.1, 0);
  });

  it('sets the ad-boosted offline reminder at the full offline wait', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '0', baseRate: '1000' }],
        factories: [
          {
            id: 'f1',
            name: '工厂1',
            price: '1e15',
            unit: '10',
            growth: '2',
            owned: '1',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
        ],
        upgrades: [
          {
            id: 'u1',
            name: '升级1',
            cost: '100000',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
          },
        ],
      }),
      { [SETTING_KEYS.offlineRate]: '2.1' },
    );
    const half = context.document.getElementById('half-cb');
    half.checked = true;
    half.dispatchEvent(new context.window.Event('change', { bubbles: true }));

    const plan = savedStore(context).plan;
    expect(plan.adDoubled).toBe(true);
    const wait = plan.steps[0].t;
    click(context, '#arm-btn');
    const reminder = savedStore(context).reminder;
    expect(reminder.kind).toBe('full');
    expect(reminder.durMs).toBeCloseTo(
      plan.steps[0].offline ? wait * 1000 : (wait * 1000) / (2.1 * 2),
      0,
    );
  });

  it('does not shorten or reset the current plan when the offline rate is changed', () => {
    const context = boot();
    const before = JSON.stringify(savedStore(context).plan);
    expect(before).not.toBe('null');

    const offline = context.document.getElementById('offline-rate');
    offline.value = '2.1';
    offline.dispatchEvent(new context.window.Event('change', { bubbles: true }));
    expect(JSON.stringify(savedStore(context).plan)).toBe(before);
  });
});

describe('new factory goal', () => {
  it('targets the first checked new factory and clears the flag after buying it', () => {
    const store = sampleStore({
      resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '5000', baseRate: '0' }],
    });
    store.factories.push({
      id: 'f2',
      price: '500',
      unit: '20',
      growth: '2',
      owned: '0',
      outputResourceId: 'r1',
      costResourceId: 'r1',
    });
    const context = boot(store);

    expect(context.document.getElementById('strategy').textContent).toContain('工厂2');
    expect(context.document.getElementById('strategy').textContent).not.toContain('未找到');
    click(context, '#factory-rows .fac-row:nth-child(2) .fac-buy[data-count="1"]');
    vi.advanceTimersByTime(400);
    const saved = savedStore(context);
    expect(saved.factories[1].owned).toBe('1');
  });

  it('locks the new factory upgrade until its first unit is bought', () => {
    const store = sampleStore({
      resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '1000', baseRate: '0' }],
      factories: [
        {
          id: 'f1',
          price: '100',
          unit: '10',
          growth: '2',
          owned: '0',
          outputResourceId: 'r1',
          costResourceId: 'r1',
        },
      ],
    });
    const context = boot(store);
    const button = context.document.querySelector('#upgrade-rows .upg-row button.primary');
    expect(button.disabled).toBe(true);
    click(context, '#factory-rows .fac-buy[data-count="1"]');
    expect(
      context.document.querySelector('#upgrade-rows .upg-row button.primary').disabled,
    ).toBe(false);
  });
});

describe('resources and notation', () => {
  it('supports multiple resources with separate output and cost resources', () => {
    const store = sampleStore({
      resources: [
        { id: 'r1', emoji: '🌱', name: '资源1', amount: '0', baseRate: '10' },
        { id: 'r2', emoji: '⚡', name: '资源2', amount: '0', baseRate: '0' },
      ],
      factories: [
        {
          id: 'f1',
          price: '100',
          unit: '10',
          growth: '2',
          owned: '1',
          outputResourceId: 'r2',
          costResourceId: 'r1',
        },
      ],
      upgrades: [
        {
          id: 'u1',
          cost: '1000',
          costResourceId: 'r2',
          targetFactoryId: 'f1',
          multiplier: '2',
          purchased: false,
        },
      ],
    });
    const context = boot(store);
    const rows = [...context.document.querySelectorAll('#timeline tr')].map((row) => row.textContent);
    expect(rows.some((text) => text.includes('🌱'))).toBe(true);
    expect(rows.at(-1)).toContain('⚡');
  });

  it('adds a resource with a preset emoji and exposes it to factory selects', () => {
    const context = boot(sampleStore({ upgrades: [] }));
    click(context, '#add-resource');
    expect(context.document.querySelectorAll('#resource-rows .res-row')).toHaveLength(2);

    const emoji = context.document.querySelectorAll('#resource-rows .res-emoji')[1];
    expect(emoji.value).toBe(RESOURCE_EMOJIS[1]);
    emoji.value = '💎';
    emoji.dispatchEvent(new context.window.Event('change', { bubbles: true }));
    expect(savedStore(context).resources[1].emoji).toBe('💎');

    const optionText = [
      ...context.document.querySelectorAll('#factory-rows .fac-row .res-picker')[0].options,
    ].map((option) => option.textContent);
    expect(optionText.some((text) => text.includes('💎'))).toBe(true);
  });

  it('imports the fear preset and resets old data with reputation and badge scaling', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '旧资源', amount: '999', baseRate: '9' }],
        factories: [
          {
            id: 'f1',
            name: '旧工厂',
            price: '1',
            unit: '1',
            growth: '2',
            owned: '7',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
        ],
        upgrades: [],
        preset: null,
      }),
    );
    click(context, '#fab-btn');
    click(context, '#preset-open');
    const level = context.document.getElementById('preset-level');
    const badge = context.document.getElementById('preset-badge');
    expect(context.document.getElementById('preset-select').value).toBe('fear');
    level.value = '1';
    badge.value = '10';
    level.dispatchEvent(new context.window.Event('input', { bubbles: true }));
    badge.dispatchEvent(new context.window.Event('input', { bubbles: true }));
    click(context, '#preset-import');

    const store = savedStore(context);
    expect(store.resources).toHaveLength(1);
    expect(store.resources[0]).toMatchObject({ emoji: '🔥', amount: '0' });
    expect(store.factories).toHaveLength(3);
    expect(store.factories.map((factory) => factory.name)).toEqual([
      '深不可测的存在',
      '诡异生物',
      '阴险者',
    ]);
    expect(store.factories[0]).toMatchObject({
      name: '深不可测的存在',
      price: '50.0M',
      unit: '2.75K',
      growth: '1.15',
      owned: '0',
    });
    expect(store.upgrades).toHaveLength(24);
    expect(store.upgrades[0].name).toBe('狗头人');
    expect(store.preset).toMatchObject({ level: 1, badgePercent: 10 });
    expect(context.document.getElementById('preset-note').textContent).toContain('声望 1');
    expect(context.document.getElementById('preset-note').textContent).toContain('徽章 +10%');
  });

  it('imports the life anatomy preset with two cross-resource resources', () => {
    const context = boot();
    click(context, '#fab-btn');
    click(context, '#preset-open');
    const select = context.document.getElementById('preset-select');
    select.value = 'anatomy';
    select.dispatchEvent(new context.window.Event('change', { bubbles: true }));
    click(context, '#preset-import');

    const store = savedStore(context);
    expect(store.resources.map((resource) => resource.emoji)).toEqual(['🔵', '🔴']);
    expect(store.factories).toHaveLength(10);
    expect(store.factories.map((factory) => factory.name)).toContain('心脏');
    expect(store.factories.map((factory) => factory.name)).toContain('皮肤');
    expect(store.factories.map((factory) => factory.name)).toContain('胃');
    expect(store.preset).toMatchObject({ id: 'anatomy', level: 1, badgePercent: 0 });
    expect(context.document.querySelectorAll('#resource-rows .res-row')).toHaveLength(2);
    expect(
      [...context.document.querySelectorAll('#resource-rows .res-emoji')].map(
        (select) => select.value,
      ),
    ).toEqual(['🔵', '🔴']);
  });

  it('converts resource/factory/upgrade values when notation changes', () => {
    const context = boot(
      sampleStore({
        resources: [{ id: 'r1', emoji: '🌱', name: '资源1', amount: '1000000', baseRate: '0' }],
        factories: [
          {
            id: 'f1',
            price: '1000000',
            unit: '1000',
            growth: '2',
            owned: '1',
            outputResourceId: 'r1',
            costResourceId: 'r1',
          },
        ],
        upgrades: [
          {
            id: 'u1',
            cost: '1000000',
            costResourceId: 'r1',
            targetFactoryId: 'f1',
            multiplier: '2',
            purchased: false,
          },
        ],
      }),
    );
    const select = context.document.getElementById('notation');
    select.value = 'chinese';
    select.dispatchEvent(new context.window.Event('change', { bubbles: true }));

    expect(resourceInputs(context)[0].value).toBe('100万');
    expect(factoryInputs(context)[1].value).toBe('100万');
    expect(upgradeInputs(context)[1].value).toBe('100万');
    expect(context.window.localStorage.getItem(SETTING_KEYS.notation)).toBe('chinese');
  });
});

describe('reminders', () => {
  it('arms the next action and fires it', () => {
    const context = boot();
    click(context, '#arm-btn');
    expect(savedStore(context).reminder).not.toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(context.document.getElementById('banner').classList.contains('hidden')).toBe(false);
    expect(context.document.getElementById('banner-text').textContent).toContain('工厂1');
  });

  it('persists and restores the plan after reopening', () => {
    const first = boot();
    const saved = savedStore(first);
    expect(saved.plan?.steps?.length).toBeGreaterThan(0);

    const second = boot(saved);
    expect(second.document.getElementById('result-body').classList.contains('hidden')).toBe(false);
    expect(second.document.getElementById('total-line').textContent).toContain('先买「升级1」');
    expect(second.document.getElementById('timeline').children.length).toBeLessThanOrEqual(
      saved.plan.steps.length,
    );
  });

  it('applies the planned purchase when completing a step', () => {
    const context = boot();
    click(context, '#start-steps');
    vi.advanceTimersByTime(10_000);
    click(context, '#complete-step');

    const store = savedStore(context);
    expect(store.factories[0].owned).toBe('2');
    expect(store.plan.stepIndex).toBe(1);
    expect(store.resources[0].amount).toBe('0');
  });
});
