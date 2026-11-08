import { normalizeStore } from './schema.ts';

export const SAVE_FORMAT = 'cell-to-singularity-helper-save';
export const SAVE_VERSION = 1;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 生成带版本信息的存档 JSON 文本；data 与 localStorage 里的存档结构一致。 */
export function buildSaveText(store, now = Date.now()) {
  return JSON.stringify(
    {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      exportedAt: new Date(now).toISOString(),
      data: store,
    },
    null,
    2,
  );
}

/** 存档文件名带本地时间，避免连续导出互相覆盖。 */
export function saveFileName(now = Date.now()) {
  const date = new Date(now);
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `探索助手存档-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}.json`
  );
}

/**
 * 解析导出的存档：兼容带 format/data 的外层包装，也兼容直接粘进来的原始存档。
 * 数据会走 normalizeStore，补齐缺省字段并丢弃非法引用。
 */
export function parseSaveText(text, now = Date.now()) {
  let raw;
  try {
    raw = JSON.parse(String(text));
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  if (!isRecord(raw)) throw new Error('存档内容不是 JSON 对象');
  if (
    raw.format === SAVE_FORMAT &&
    Number.isFinite(raw.version) &&
    raw.version > SAVE_VERSION
  ) {
    throw new Error(`存档版本 ${raw.version} 比当前版本 ${SAVE_VERSION} 新，请更新工具`);
  }

  const data = isRecord(raw.data) ? raw.data : raw;
  if (!Array.isArray(data.resources) || !Array.isArray(data.factories)) {
    throw new Error('缺少 resources / factories，可能不是本工具的存档');
  }
  return normalizeStore(data, now);
}
