/** 极小的 DOM 辅助函数，统一空值处理与显隐语义。 */

/**
 * @param {Document} document
 * @param {string} id
 */
export function byId(document, id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`界面缺少 #${id} 元素`);
  return element;
}

/** @param {Element | null | undefined} element */
export function show(element) {
  element?.classList.remove('hidden');
}

/** @param {Element | null | undefined} element */
export function hide(element) {
  element?.classList.add('hidden');
}

/**
 * @param {Element | null | undefined} element
 * @param {boolean} hidden
 */
export function setHidden(element, hidden) {
  element?.classList.toggle('hidden', hidden);
}

/** @param {Element | null | undefined} element */
export function isHidden(element) {
  return !element || element.classList.contains('hidden');
}

/**
 * 只在“按下和松开都发生在弹窗面板外”时关闭遮罩。
 * 从输入框拖选文字到遮罩上松开时，不会触发关闭。
 *
 * @param {HTMLDialogElement} dialog
 * @param {() => void} close
 */
export function enableBackdropClose(dialog, close) {
  const document = dialog.ownerDocument;
  let downOutside = false;

  const isOutside = (event) => {
    const rect = dialog.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return event.target === dialog;
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };

  document.addEventListener(
    'mousedown',
    (event) => {
      if (!dialog.hasAttribute('open')) {
        downOutside = false;
        return;
      }
      downOutside = isOutside(event);
    },
    true,
  );
  document.addEventListener(
    'mouseup',
    (event) => {
      const shouldClose =
        downOutside && dialog.hasAttribute('open') && isOutside(event);
      downOutside = false;
      if (shouldClose) close();
    },
    true,
  );
}

/** @param {Element | null | undefined} element */
export function clear(element) {
  if (!element) return;
  while (element.firstChild) element.removeChild(element.firstChild);
}

/**
 * 给数值输入框加上“英文 + 小数键盘”的语义，方便系统输入法在聚焦时
 * 自动切到英文/数字模式。浏览器和输入法是否响应由各自实现决定。
 *
 * @param {HTMLInputElement} input
 * @param {{ integer?: boolean }} [options]
 */
export function applyNumberInputHints(input, { integer = false } = {}) {
  input.setAttribute('lang', 'en');
  input.setAttribute('inputmode', integer ? 'numeric' : 'decimal');
  input.setAttribute('dir', 'ltr');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('enterkeyhint', 'done');
  return input;
}
