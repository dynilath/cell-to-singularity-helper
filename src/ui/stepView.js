import { fmtClock, fmtDur, fmtNum } from '../core/numbers.js';
import { cleanResourceText } from '../data/schema.js';
import { byId, hide, show } from './dom.js';

function actionText(step) {
  return step.type === 'upgrade' ? `买 ${step.label}` : `买 ${step.label} · 第${step.nth}台`;
}

/**
 * 「逐步执行」面板。
 */
export function createStepView({ document }) {
  const section = byId(document, 'step-section');
  const title = byId(document, 'step-title');
  const count = byId(document, 'step-cnt');
  const clock = byId(document, 'step-clk');

  function showView() {
    show(section);
  }

  function hideView() {
    hide(section);
  }

  function render({ plan, now = Date.now() }) {
    if (!plan || plan.stepIndex >= plan.steps.length) {
      title.textContent = '计划已完成';
      count.textContent = '';
      clock.textContent = '没有下一步了';
      return;
    }
    const step = plan.steps[plan.stepIndex];
    const cost = step.type === 'upgrade' ? step.cost : step.price;
    const due = plan.anchor + step.t * 1000;
    const remaining = due - now;
    title.textContent = actionText(step);
    count.textContent = `第 ${plan.stepIndex + 1} / ${plan.steps.length} 步 · ${fmtNum(cost)} ${cleanResourceText(step.resourceName) || '资源'}`;
    clock.textContent = `${remaining <= 0 ? '已到时' : `${fmtDur(remaining / 1000)} 后`} · ${fmtClock(due)}`;
  }

  return { show: showView, hide: hideView, render };
}
