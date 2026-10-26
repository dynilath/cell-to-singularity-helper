import { fmtClock, fmtDur } from '../core/numbers.ts';
import { byId, clear } from './dom.ts';

/**
 * 「⏰ 提醒」抽屉：单一规划提醒的暂停、恢复、重新计时、取消。
 *
 * @param {{
 *   document: Document,
 *   onPause: () => void,
 *   onResume: () => void,
 *   onRetime: () => void,
 *   onCancel: () => void,
 * }} options
 */
export function createDrawer({ document, onPause, onResume, onRetime, onCancel }) {
  const panel = byId(document, 'drawer');
  const list = byId(document, 'drawer-list');
  const countElement = byId(document, 'drawer-count');
  const openButton = byId(document, 'drawer-btn');
  const closeButton = byId(document, 'drawer-close');

  let lastState = { store: null, now: Date.now() };

  function isOpen() {
    return !panel.classList.contains('hidden');
  }

  function updateCount(store) {
    countElement.textContent = store.reminder ? '1' : '0';
  }

  function remainText(reminder, now) {
    if (reminder.fired) return '—';
    if (reminder.paused) return `${fmtDur((reminder.remainMs ?? 0) / 1000)}（冻结）`;
    const left = reminder.endTime - now;
    return left <= 0 ? '已到时' : `${fmtDur(left / 1000)}（约 ${fmtClock(left, now)}）`;
  }

  function statusText(reminder) {
    if (reminder.fired) return '已响';
    if (reminder.paused) return '已暂停';
    return '计时中';
  }

  function actionButton(label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small';
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function buildItem(reminder, now) {
    const item = document.createElement('div');
    item.className = 'rem-item';
    if (reminder.fired) item.classList.add('fired');

    const title = document.createElement('div');
    title.className = 'rem-title';
    title.textContent = `[${reminder.kind === 'half' ? '探索规划·半程' : '探索规划'}] ${reminder.title}`;

    const status = document.createElement('div');
    status.className = 'rem-status';
    status.append(`${statusText(reminder)} · 剩余 `);
    const remain = document.createElement('b');
    remain.textContent = remainText(reminder, now);
    status.append(remain);

    const buttons = document.createElement('div');
    buttons.className = 'rem-btns';

    if (!reminder.fired) {
      buttons.append(
        reminder.paused
          ? actionButton('▶ 恢复', onResume)
          : actionButton('⏸ 暂停', onPause),
      );
    }
    buttons.append(
      actionButton('↻ 重新计时', onRetime),
      actionButton('✕ 取消', onCancel),
    );

    item.append(title, status, buttons);
    return item;
  }

  function render(state) {
    lastState = state;
    updateCount(state.store);
    if (!isOpen()) return;

    clear(list);
    if (state.store.reminder) {
      list.append(buildItem(state.store.reminder, state.now));
    } else {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent =
        '暂无提醒。点「🔔 提醒我」即可创建；启用「离线收入广告翻倍」会按整段离线收入 ×2 缩短等待。';
      list.append(hint);
    }
  }

  openButton.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    if (isOpen()) render({ ...lastState, now: Date.now() });
  });

  closeButton.addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  return { render, isOpen };
}
