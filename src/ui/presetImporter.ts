import { PRESETS, PRESET_DOC_LEVEL } from '../data/presets.ts';
import { byId, enableBackdropClose } from './dom.ts';

/**
 * 预设导入弹窗：声望等级 + 徽章加成（5% 档位）。
 * 导入由 App 完成（会重置当前资源/工厂/产出/计划）。
 */
export function createPresetImporter({ document, onImport, getPreset }) {
  const dialog = byId(document, 'preset-dialog');
  const openButton = byId(document, 'preset-open');
  const closeButton = byId(document, 'preset-close');
  const cancelButton = byId(document, 'preset-cancel');
  const importButton = byId(document, 'preset-import');
  const presetSelect = byId(document, 'preset-select');
  const levelInput = byId(document, 'preset-level');
  const badgeInput = byId(document, 'preset-badge');
  const preview = byId(document, 'preset-preview');
  const error = byId(document, 'preset-error');
  const note = byId(document, 'preset-note');

  for (const item of PRESETS) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.title;
    presetSelect.append(option);
  }

  function selectedPreset() {
    return PRESETS.find((item) => item.id === presetSelect.value) ?? PRESETS[0];
  }

  function presetDocLevel(preset = selectedPreset()) {
    return preset.docLevel ?? PRESET_DOC_LEVEL;
  }

  function syncPresetDetails() {
    const preset = selectedPreset();
    byId(document, 'preset-title').textContent = `📥 引入预设：${preset.title}`;
    byId(document, 'preset-source').textContent = `来源：${preset.source}`;
    byId(document, 'preset-notes').textContent = preset.notes.join(' ');
  }

  function isOpen() {
    return dialog.hasAttribute('open');
  }

  function closeDialog() {
    if (!isOpen()) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function formatFactor(value) {
    return String(Number(value.toFixed(4)));
  }

  function readValues() {
    const level = Number(levelInput.value);
    const badge = Number(badgeInput.value);
    const levelOk = Number.isInteger(level) && level >= 1;
    const badgeOk = Number.isFinite(badge) && badge >= 0 && badge % 5 === 0;
    return { level, badge, levelOk, badgeOk };
  }

  function updatePreview() {
    const { level, badge, levelOk, badgeOk } = readValues();
    if (!levelOk || !badgeOk) {
      preview.textContent = '声望需为 ≥1 的整数；徽章加成需为 5% 的整数倍。';
      preview.classList.add('err');
      return;
    }
    const costFactor = 4 ** (level - presetDocLevel());
    const incomeFactor = 2 ** (level - presetDocLevel()) * (1 + badge / 100);
    preview.classList.remove('err');
    preview.textContent =
      `相对文档基准：收入 ×${formatFactor(incomeFactor)}，成本 ×${formatFactor(costFactor)}` +
      `（声望 ${level}，徽章 +${badge}%）`;
  }

  function openDialog() {
    if (isOpen()) return;
    const current = getPreset?.();
    if (current?.id && PRESETS.some((item) => item.id === current.id)) {
      presetSelect.value = current.id;
    } else {
      presetSelect.value = PRESETS[0].id;
    }
    syncPresetDetails();
    levelInput.value = String(current?.level ?? presetDocLevel());
    badgeInput.value = String(current?.badgePercent ?? 0);
    error.textContent = '';
    error.classList.add('hidden');
    updatePreview();
    try {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch {
      dialog.setAttribute('open', '');
    }
    levelInput.focus();
  }

  function showError(message) {
    error.textContent = message;
    error.classList.remove('hidden');
  }

  function doImport() {
    const { level, badge, levelOk, badgeOk } = readValues();
    const preset = selectedPreset();
    if (!levelOk) {
      showError('声望等级必须是 ≥1 的整数。');
      levelInput.focus();
      return;
    }
    if (!badgeOk) {
      showError('徽章加成必须是 5% 的整数倍，例如 0、5、10、15。');
      badgeInput.focus();
      return;
    }
    try {
      onImport(preset, level, badge);
      closeDialog();
      note.textContent = `已引入「${preset.title}」：声望 ${level}，徽章 +${badge}%。`;
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  presetSelect.value = PRESETS[0].id;
  syncPresetDetails();
  presetSelect.addEventListener('change', () => {
    syncPresetDetails();
    levelInput.value = String(presetDocLevel());
    updatePreview();
  });

  openButton.addEventListener('click', openDialog);
  closeButton.addEventListener('click', closeDialog);
  cancelButton.addEventListener('click', closeDialog);
  importButton.addEventListener('click', doImport);
  levelInput.addEventListener('input', updatePreview);
  badgeInput.addEventListener('input', updatePreview);
  badgeInput.addEventListener('change', () => {
    const value = Number(badgeInput.value);
    if (Number.isFinite(value)) badgeInput.value = String(Math.max(0, Math.round(value / 5) * 5));
    updatePreview();
  });
  enableBackdropClose(dialog, closeDialog);

  return { open: openDialog, close: closeDialog };
}
