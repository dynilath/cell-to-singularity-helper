/**
 * 游戏内数值的解析与格式化。
 *
 * 支持三种显示模式：
 *   short      英文后缀：1.23K / 1.23M / 1.23T / 1.23Qa…
 *   chinese    中文单位：1.23万 / 1.23亿 / 1.23兆 / 1.23京…
 *   scientific 直接科学计数法：1.23e12 / 1.23e15
 *
 * 三种模式在缩写成单位时都保留 3 位有效数字；过小的数值保持普通数字，
 * 超出所支持单位范围后用科学计数法。
 * 解析器同时接受三种写法和普通数字，切换模式不会影响可编辑性。
 */

export const SUFFIXES = Object.freeze([
  '',
  'K',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
  'UDc',
  'DDc',
]);

export const CHINESE_UNITS = Object.freeze([
  '',
  '万',
  '亿',
  '兆',
  '京',
  '垓',
  '秭',
  '穰',
  '沟',
  '涧',
  '正',
  '载',
]);

export const NOTATION_MODES = Object.freeze(['short', 'chinese', 'scientific']);

let currentNotation = 'short';

/**
 * @param {string} mode
 * @returns {'short' | 'chinese' | 'scientific'}
 */
export function normalizeNotation(mode) {
  return NOTATION_MODES.includes(mode) ? mode : 'short';
}

/**
 * @param {string} mode
 * @returns {'short' | 'chinese' | 'scientific'}
 */
export function setNotationMode(mode) {
  currentNotation = normalizeNotation(mode);
  return currentNotation;
}

/** @returns {'short' | 'chinese' | 'scientific'} */
export function getNotationMode() {
  return currentNotation;
}

const NUMBER_PATTERN = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*([a-zA-Z\u4e00-\u9fff]*)$/;

/**
 * @param {string | number | null | undefined} input
 * @returns {number} 解析出的数值，失败为 NaN
 */
export function parseNum(input) {
  if (input === null || input === undefined) return NaN;

  const text = String(input).trim().replace(/,/g, '');
  if (text === '') return NaN;

  const match = NUMBER_PATTERN.exec(text);
  if (!match) return NaN;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return NaN;

  const suffix = match[2];
  if (suffix === '') return value;

  const englishTier = SUFFIXES.findIndex((item) => item.toLowerCase() === suffix.toLowerCase());
  if (englishTier > 0) return value * 1000 ** englishTier;

  const chineseTier = CHINESE_UNITS.indexOf(suffix);
  if (chineseTier > 0) return value * 10000 ** chineseTier;

  return NaN;
}

function fmtSmall(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

function fmtShort(value) {
  if (value < 1000) {
    const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
    return rounded >= 1000 ? '1.00K' : fmtSmall(value);
  }

  let tier = Math.floor(Math.log10(value) / 3);
  if (tier >= SUFFIXES.length) return fmtScientific(value);

  let scaled = value / 1000 ** tier;
  let digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  scaled = Number(scaled.toFixed(digits));

  if (scaled >= 1000) {
    tier += 1;
    if (tier >= SUFFIXES.length) return fmtScientific(value);
    scaled = 1;
    digits = 2;
  }

  return `${scaled.toFixed(digits)}${SUFFIXES[tier]}`;
}

function fmtChinese(value) {
  if (value < 10000) {
    const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
    return rounded >= 10000 ? '1.00万' : fmtSmall(value);
  }

  let tier = Math.floor(Math.log10(value) / 4);
  if (tier >= CHINESE_UNITS.length) return fmtScientific(value);

  let scaled = value / 10000 ** tier;
  scaled = Number(scaled.toPrecision(3));

  if (scaled >= 10000) {
    tier += 1;
    if (tier >= CHINESE_UNITS.length) return fmtScientific(value);
    scaled = 1;
  }

  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${scaled.toFixed(digits)}${CHINESE_UNITS[tier]}`;
}

function fmtScientific(value) {
  if (value < 1000) {
    const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
    return rounded >= 1000 ? '1.00e3' : fmtSmall(value);
  }
  return value.toExponential(2).replace('e+', 'e');
}

/**
 * 按指定模式格式化。默认使用当前全局模式。
 *
 * @param {number} value
 * @param {'short' | 'chinese' | 'scientific'} [mode]
 * @returns {string}
 */
export function fmtNum(value, mode = currentNotation) {
  if (!Number.isFinite(value)) return '∞';
  if (value < 0) return `-${fmtNum(-value, mode)}`;
  if (value === 0) return '0';

  const normalized = normalizeNotation(mode);
  if (normalized === 'chinese') return fmtChinese(value);
  if (normalized === 'scientific') return fmtScientific(value);
  return fmtShort(value);
}

/**
 * 时长：73 → 1分13秒。
 *
 * @param {number} seconds
 * @returns {string}
 */
export function fmtDur(seconds) {
  if (!Number.isFinite(seconds)) return '—';

  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);

  if (hours > 0) return `${hours}时${minutes}分${secs}秒`;
  if (minutes > 0) return `${minutes}分${secs}秒`;
  return `${secs}秒`;
}

/**
 * 把“距现在多少毫秒”格式化为本地时钟时间。
 *
 * @param {number} msFromNow
 * @param {number} [now] 便于测试注入的当前时间戳
 * @returns {string}
 */
export function fmtClock(msFromNow, now = Date.now()) {
  return new Date(now + msFromNow).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
