/**
 * 提醒的纯函数模型。
 *
 * 提醒本身只记录绝对结束时间 endTime；暂停时冻结剩余毫秒，
 * 恢复/重新计时都基于它计算新的 endTime。这样刷新页面、切换数据组
 * 都不会影响正在走的倒计时。
 */

export const HALF_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * @typedef {{
 *   kind: 'full' | 'half',
 *   title: string,
 *   body: string,
 *   endTime: number,
 *   durMs: number,
 *   fired: boolean,
 *   paused: boolean,
 *   remainMs?: number,
 * }} Reminder
 */

/**
 * @param {{ kind?: 'full' | 'half', title: string, body: string, endTime: number, now: number }} input
 * @returns {Reminder}
 */
export function makeReminder({ kind = 'full', title, body, endTime, now }) {
  return {
    kind,
    title,
    body,
    endTime,
    durMs: Math.max(0, endTime - now),
    fired: false,
    paused: false,
  };
}

/** @param {Reminder | null | undefined} reminder */
export function isRunning(reminder) {
  return Boolean(reminder) && !reminder.fired && !reminder.paused;
}

/**
 * @param {Reminder | null | undefined} reminder
 * @param {number} now
 */
export function isDue(reminder, now) {
  return isRunning(reminder) && now >= reminder.endTime;
}

/**
 * @param {Reminder} reminder
 * @param {number} now
 * @returns {Reminder}
 */
export function pauseReminder(reminder, now) {
  if (!isRunning(reminder)) return reminder;
  return {
    ...reminder,
    paused: true,
    remainMs: Math.max(0, reminder.endTime - now),
  };
}

/**
 * @param {Reminder} reminder
 * @param {number} now
 * @returns {Reminder}
 */
export function resumeReminder(reminder, now) {
  if (!reminder || !reminder.paused) return reminder;
  const next = { ...reminder, paused: false, endTime: now + Math.max(0, reminder.remainMs ?? 0) };
  delete next.remainMs;
  return next;
}

/**
 * 从“现在”起重新走完整时长。
 *
 * @param {Reminder} reminder
 * @param {number} now
 * @returns {Reminder}
 */
export function retimeReminder(reminder, now) {
  if (!reminder) return reminder;
  const next = {
    ...reminder,
    fired: false,
    paused: false,
    endTime: now + Math.max(0, reminder.durMs),
  };
  delete next.remainMs;
  return next;
}

/**
 * @param {Reminder} reminder
 * @returns {Reminder}
 */
export function markFired(reminder) {
  const next = { ...reminder, fired: true, paused: false };
  delete next.remainMs;
  return next;
}

/**
 * 计算某一步的提醒时间。
 *
 * 计划时间本身按在线产出计算；但提醒默认“点了提醒就离开游戏”，
 * 所以只把提醒的等待时长按离线收益倍率缩短。勾选半程且缩短后的
 * 有效等待 ≥ 5 分钟时，设在有效等待的中点。
 *
 * @param {{ anchor: number, stepSeconds: number, halfEnabled: boolean, now: number, offlineRate?: number, halfAtSeconds?: number | null }} input
 * @returns {{ endTime: number, half: boolean }}
 */
export function reminderEndTime({
  anchor,
  stepSeconds,
  halfEnabled,
  now,
  offlineRate = 1,
  halfAtSeconds = null,
}) {
  const rate = Number.isFinite(offlineRate) && offlineRate > 0 ? offlineRate : 1;
  const remainingMs = Math.max(0, anchor + stepSeconds * 1000 - now);
  // 离线攒钱段已经知道广告应该点在哪一刻，直接按该段的中点提醒。
  if (halfEnabled && Number.isFinite(halfAtSeconds)) {
    return {
      endTime: anchor + halfAtSeconds * 1000,
      half: true,
    };
  }
  const effectiveMs = remainingMs / rate;
  const useHalf = halfEnabled && effectiveMs >= HALF_THRESHOLD_MS;
  return {
    endTime: now + effectiveMs * (useHalf ? 0.5 : 1),
    half: useHalf,
  };
}
