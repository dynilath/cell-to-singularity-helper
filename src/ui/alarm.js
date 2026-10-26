import { byId, hide, show } from './dom.js';

const FLASH_INTERVAL_MS = 800;
const REPEAT_BEEP_MS = 8000;

/**
 * 到点提醒的“感官层”：横幅、蜂鸣、标题闪烁、系统通知。
 * 通知权限只在用户点击「提醒我」的手势里询问，整个页面会话最多一次。
 *
 * @param {{ document: Document, window: Window }} options
 */
export function createAlarm({ document, window }) {
  const banner = byId(document, 'banner');
  const bannerText = byId(document, 'banner-text');
  const baseTitle = document.title;

  let audioCtx = null;
  let volume = 1;
  let flashTimer = null;
  let repeatTimer = null;
  let askedPermission = false;

  /** @param {number} value 0~1 */
  function setVolume(value) {
    volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  }

  function unlockAudio() {
    // AudioContext 需要用户手势解锁；在「提醒我」/音量操作时创建或恢复，
    // 保证之后由定时器触发的蜂鸣能出声。
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = audioCtx || new AudioContextClass();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch {
      // 浏览器不支持或用户策略禁止：提醒仍有横幅与标题闪烁。
    }
  }

  /** @param {number} [times] */
  function beep(times = 3) {
    if (volume <= 0) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = audioCtx || new AudioContextClass();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      for (let index = 0; index < times; index += 1) {
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;

        const start = audioCtx.currentTime + index * 0.45;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);

        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.32);
      }
    } catch {
      // 蜂鸣失败不影响横幅提醒。
    }
  }

  /** @param {string} title @param {string} body */
  function notify(title, body) {
    const NotificationApi = window.Notification;
    if (!NotificationApi || NotificationApi.permission !== 'granted') return;
    try {
      new NotificationApi(title, { body, tag: 'cts' });
    } catch {
      // 某些浏览器在非安全上下文会抛错，忽略即可。
    }
  }

  function hintText() {
    const NotificationApi = window.Notification;
    if (!NotificationApi) {
      return '此浏览器不支持系统通知：到点用页面横幅+蜂鸣提醒（保持页面开启）';
    }
    if (NotificationApi.permission === 'granted') return '';
    if (NotificationApi.permission === 'denied') {
      return '系统通知已被拒绝：到点用页面横幅+蜂鸣提醒（保持页面开启）';
    }
    return askedPermission
      ? '通知权限未确认：到点仍会用页面横幅+蜂鸣提醒；想开系统通知就点浏览器地址栏的图标'
      : '到点用页面横幅+蜂鸣+系统通知（首次点击时询问通知权限）';
  }

  function updateHint() {
    const element = document.getElementById('notify-hint');
    if (element) element.textContent = hintText();
  }

  function maybeAskPermission() {
    const NotificationApi = window.Notification;
    if (NotificationApi && NotificationApi.permission === 'default' && !askedPermission) {
      askedPermission = true;
      try {
        const request = NotificationApi.requestPermission();
        if (request && typeof request.catch === 'function') request.catch(() => {});
      } catch {
        // 忽略：提示文字会说明仍可用横幅+蜂鸣。
      }
    }
    updateHint();
  }

  function startFlash(message) {
    stopFlash();
    let on = false;
    flashTimer = setInterval(() => {
      on = !on;
      document.title = on ? `⏰ ${message}` : baseTitle;
    }, FLASH_INTERVAL_MS);
  }

  function stopFlash() {
    if (flashTimer) clearInterval(flashTimer);
    flashTimer = null;
    document.title = baseTitle;
  }

  /** @param {string} title @param {string} body */
  function showAlarm(title, body) {
    beep(3);
    notify(title, body);
    startFlash(title);

    bannerText.textContent = `${title} —— ${body}`;
    show(banner);

    if (repeatTimer) clearInterval(repeatTimer);
    repeatTimer = setInterval(() => beep(3), REPEAT_BEEP_MS);
  }

  function dismiss() {
    hide(banner);
    stopFlash();
    if (repeatTimer) clearInterval(repeatTimer);
    repeatTimer = null;
  }

  function isBannerVisible() {
    return !banner.classList.contains('hidden');
  }

  function getBannerText() {
    return bannerText.textContent;
  }

  /** @param {string} text */
  function setBannerText(text) {
    bannerText.textContent = text;
  }

  function dispose() {
    stopFlash();
    if (repeatTimer) clearInterval(repeatTimer);
    repeatTimer = null;
    try {
      audioCtx?.close();
    } catch {
      // 忽略关闭失败。
    }
    audioCtx = null;
  }

  return {
    setVolume,
    getVolume: () => volume,
    unlock: unlockAudio,
    beep,
    notify,
    maybeAskPermission,
    updateHint,
    show: showAlarm,
    dismiss,
    isBannerVisible,
    getBannerText,
    setBannerText,
    dispose,
  };
}
