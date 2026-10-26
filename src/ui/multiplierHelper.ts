import { estimateGrowth } from '../core/growth.ts';
import { fmtNum, parseNum } from '../core/numbers.ts';
import { applyNumberInputHints, byId, enableBackdropClose, hide, show } from './dom.ts';

/**
 * 倍率助手（弹窗）：填等级和价格，算每级增长倍率并一键应用到全局。
 *
 * @param {{ document: Document, onApply: (growth: number) => void }} options
 */
export function createMultiplierHelper({ document, onApply }) {
  const dialog = byId(document, 'mh-dialog');
  const openButton = byId(document, 'mh-open');
  const closeButton = byId(document, 'mh-close');
  const rowsHost = byId(document, 'mh-rows');
  const result = byId(document, 'mh-result');
  const applyButton = byId(document, 'mh-apply');
  let lastAverage = null;

  function isOpen() {
    return dialog.hasAttribute('open');
  }

  function openDialog() {
    if (isOpen()) return;
    try {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch {
      dialog.setAttribute('open', '');
    }
    rowsHost.querySelector('input')?.focus();
  }

  function closeDialog() {
    if (!isOpen()) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function addRow(level = '', price = '') {
    const row = document.createElement('div');
    row.className = 'mh-row';

    const levelInput = document.createElement('input');
    levelInput.className = 'mh-lv';
    levelInput.placeholder = '等级，如 15';
    applyNumberInputHints(levelInput, { integer: true });
    levelInput.value = level;

    const priceInput = document.createElement('input');
    priceInput.className = 'mh-price';
    priceInput.placeholder = `该等级价格，如 ${fmtNum(3.6e6)}`;
    applyNumberInputHints(priceInput);
    priceInput.value = price;

    row.append(levelInput, priceInput);
    rowsHost.append(row);
  }

  function readPoints() {
    const points = [];
    let invalid = false;

    for (const row of rowsHost.children) {
      const levelRaw = row.querySelector('.mh-lv').value.trim();
      const priceRaw = row.querySelector('.mh-price').value.trim();
      if (levelRaw === '' && priceRaw === '') continue; // 整行空 → 忽略

      const level = parseNum(levelRaw);
      const price = parseNum(priceRaw);
      if (Number.isNaN(level) || Number.isNaN(price) || price <= 0) {
        invalid = true;
        continue;
      }
      points.push({ level, price });
    }

    return { invalid, points };
  }

  function compute() {
    hide(applyButton);
    lastAverage = null;

    const { invalid, points } = readPoints();
    if (invalid) {
      result.textContent = '有没填对的地方（等级和价格都要填，价格 > 0）';
      return;
    }
    if (points.length < 2) {
      result.textContent = '至少填两行才能算倍率';
      return;
    }

    const estimate = estimateGrowth(points);
    if (!estimate.ok) {
      result.textContent =
        estimate.error === 'duplicate-level'
          ? '等级有重复，检查一下'
          : '有没填对的地方（等级和价格都要填，价格 > 0）';
      return;
    }

    const lines = estimate.pairs.map(
      ({ from, to, growth }) =>
        `${from.level}→${to.level}级（${fmtNum(from.price)}→${fmtNum(to.price)}）：每级 ×${growth.toFixed(4)}`,
    );
    lines.push(`—— 建议增长倍率：×${estimate.average.toFixed(4)}`);
    result.textContent = lines.join('\n');

    lastAverage = Math.round(estimate.average * 10000) / 10000;
    show(applyButton);
  }

  function apply() {
    if (lastAverage === null) return;
    onApply(lastAverage);
    result.textContent += '\n已应用到全局倍率 ✓';
  }

  /** 按当前全局数字格式重写价格输入；等级不是数量，保持原样。 */
  function applyNotation() {
    rowsHost.querySelectorAll('.mh-price').forEach((input) => {
      const value = parseNum(input.value);
      if (!Number.isNaN(value)) input.value = fmtNum(value);
      input.placeholder = `该等级价格，如 ${fmtNum(3.6e6)}`;
    });
    result.textContent = '';
    hide(applyButton);
    lastAverage = null;
  }

  openButton.addEventListener('click', openDialog);
  closeButton.addEventListener('click', closeDialog);
  enableBackdropClose(dialog, closeDialog);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) closeDialog();
  });

  byId(document, 'mh-add').addEventListener('click', () => addRow());
  byId(document, 'mh-compute').addEventListener('click', compute);
  applyButton.addEventListener('click', apply);

  addRow();
  addRow();
  addRow();

  return { open: openDialog, close: closeDialog, addRow, compute, applyNotation };
}
