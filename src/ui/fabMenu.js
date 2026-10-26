import { byId } from './dom.js';

/**
 * 右下角悬浮球菜单：数字显示格式、引入预设等顶级入口。
 */
export function createFabMenu({ document }) {
  const button = byId(document, 'fab-btn');
  const menu = byId(document, 'fab-menu');
  let open = false;

  function setOpen(next) {
    open = next;
    menu.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function toggle() {
    setOpen(!open);
  }

  button.addEventListener('click', toggle);
  menu.addEventListener('click', (event) => {
    const target = event.target;
    if (target?.closest?.('[data-menu-close]')) setOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!open) return;
    const target = event.target;
    if (target === button || (target && menu.contains(target))) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (open && event.key === 'Escape') setOpen(false);
  });

  return { open: () => setOpen(true), close: () => setOpen(false), toggle };
}
