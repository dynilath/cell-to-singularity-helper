import { fmtClock, fmtDur, fmtNum } from '../core/numbers.ts';
import { cleanResourceText } from '../data/schema.ts';
import { byId } from './dom.ts';

function actionText(step) {
  return step.type === 'upgrade' ? `买 ${step.label}` : `买 ${step.label} · 第${step.nth}台`;
}

function resourceText(step) {
  return cleanResourceText(step.resourceName) || '资源';
}

function stepCost(step) {
  return step.type === 'upgrade' ? step.cost : step.price;
}

/**
 * 同一时刻连续完成的购买合并成一组用于时间表展示。
 * 只改展示，不改计划步骤或执行顺序。
 */
export function groupPlanSteps(steps) {
  const groups = [];
  steps.forEach((step, index) => {
    const last = groups[groups.length - 1];
    const sameTime = last && Math.abs((last.t ?? 0) - (step.t ?? 0)) < 1e-6;
    const sameBlock =
      last && (last.offlineBlock ?? 0) === (step.offlineBlock ?? 0);
    if (last && sameTime && sameBlock) {
      last.steps.push(step);
      last.indices.push(index);
      return;
    }
    groups.push({
      t: step.t ?? 0,
      offlineBlock: step.offlineBlock ?? 0,
      steps: [step],
      indices: [index],
    });
  });
  return groups;
}

export function groupActionText(steps) {
  if (steps.length === 1) return actionText(steps[0]);
  const entries = new Map<
    string,
    { type: 'buy' | 'upgrade'; label: string; nths: number[] }
  >();
  for (const step of steps) {
    const key = `${step.type}:${step.label}`;
    let entry = entries.get(key);
    if (!entry) {
      entry =
        step.type === 'upgrade'
          ? { type: 'upgrade', label: step.label, nths: [] }
          : { type: 'buy', label: step.label, nths: [] };
      entries.set(key, entry);
    }
    if (step.type === 'buy') entry.nths.push(Number(step.nth));
  }

  const lines = [];
  for (const entry of entries.values()) {
    if (entry.type === 'upgrade') {
      lines.push(`购买 ${entry.label}`);
      continue;
    }
    const nths = [...new Set(entry.nths)].sort((left, right) => left - right);
    const ranges: { start: number; end: number }[] = [];
    for (const nth of nths) {
      const last = ranges[ranges.length - 1];
      if (last && nth === last.end + 1) last.end = nth;
      else ranges.push({ start: nth, end: nth });
    }
    const rangeText = ranges
      .map((range) =>
        range.start === range.end
          ? `${range.start}`
          : `${range.start} ~ ${range.end}`,
      )
      .join('、');
    lines.push(`购买 ${entry.label} 第 ${rangeText} 台`);
  }
  return lines.join('\n');
}

function groupCostText(steps) {
  const totals = new Map();
  for (const step of steps) {
    const name = resourceText(step);
    totals.set(name, (totals.get(name) ?? 0) + stepCost(step));
  }
  return [...totals.entries()]
    .map(([name, amount]) => `${fmtNum(amount)} ${name}`)
    .join(' + ');
}

export function planSummary(plan) {
  if (!plan.steps.length) return '✅ 没有待完成的升级';
  const lead =
    (plan.offlineBlocks ?? 0) > 0
      ? `🏕️ 离线攒钱（${plan.offlineBlocks} 段）：`
      : '';

  // 按真实步骤顺序压缩：连续买同一工厂合并为 ×N，连续升级用 → 连接。
  const sequence = [];
  let buyCount = 0;
  let upgradeCount = 0;
  const buyCounts = new Map();
  for (const step of plan.steps) {
    if (step.type === 'buy') {
      buyCount += 1;
      buyCounts.set(step.label, (buyCounts.get(step.label) ?? 0) + 1);
      const last = sequence.at(-1);
      if (last?.kind === 'factory' && last.label === step.label) {
        last.count += 1;
      } else {
        sequence.push({ kind: 'factory', label: step.label, count: 1 });
      }
    } else {
      upgradeCount += 1;
      const last = sequence.at(-1);
      if (last?.kind === 'upgrade') {
        last.labels.push(step.label);
      } else {
        sequence.push({ kind: 'upgrade', labels: [step.label] });
      }
    }
  }
  const orderText = sequence
    .map((part) =>
      part.kind === 'factory'
        ? `${part.label}×${part.count}`
        : part.labels.join(' → '),
    )
    .join(' → ');

  if (plan.goal === 'new-factory') {
    const target = plan.goalLabel.includes('：')
      ? plan.goalLabel.slice(plan.goalLabel.lastIndexOf('：') + 1)
      : '新工厂';
    return `${lead}🎯 先点出第一个新工厂：${target}${orderText ? `（按顺序：${orderText}）` : ''}`;
  }

  // 预设会生成几十步；完整顺序太长时改为总数 + 首尾动作，避免摘要淹没界面。
  if (sequence.length > 8) {
    const breakdown = [...buyCounts.entries()]
      .map(([label, count]) => `${label}×${count}`)
      .join(' · ');
    const first = plan.steps[0]?.label ?? '';
    const last = plan.steps.at(-1)?.label ?? '';
    if (upgradeCount === 0) {
      return `${lead}🚀 共买 ${buyCount} 台工厂（${breakdown}），共 ${plan.steps.length} 步；首步：${first}，末步：${last}`;
    }
    if (buyCount === 0) {
      return `${lead}💰 共买 ${upgradeCount} 个升级，共 ${plan.steps.length} 步；首步：${first}，末步：${last}`;
    }
    return `${lead}🚀 共买 ${buyCount} 台工厂（${breakdown}）、${upgradeCount} 个升级，按时间表交错执行，共 ${plan.steps.length} 步；首步：${first}，末步：${last}`;
  }

  if (upgradeCount === 0) {
    return `${lead}🚀 按时间表买 ${buyCount} 台工厂：${orderText}`;
  }
  if (buyCount === 0) {
    return `${lead}💰 按时间表买 ${upgradeCount} 个升级：${orderText}`;
  }
  return `${lead}🚀 共买 ${buyCount} 台工厂、${upgradeCount} 个升级，顺序：${orderText}`;
}

export function planGoalText(plan) {
  if (plan.complete !== false) return plan.goalLabel;
  if (plan.goal === 'unlock') return plan.goalLabel;
  const next = plan.steps?.[plan.stepIndex ?? 0] ?? plan.steps?.[0];
  if (!next) return '完成当前段后重新规划';
  return next.type === 'buy'
    ? `先买出「${next.label}」首台`
    : `先买「${next.label}」`;
}

/**
 * v5 结果面板：目标、下次行动、总时长、时间表。
 */
export function createPlanView({ document }) {
  const empty = byId(document, 'result-empty');
  const error = byId(document, 'result-err');
  const body = byId(document, 'result-body');
  const timelineSection = byId(document, 'timeline-section');
  const strategy = byId(document, 'strategy');
  const nextLabel = byId(document, 'next-lbl');
  const nextCount = byId(document, 'next-cnt');
  const nextClock = byId(document, 'next-clk');
  const totalLine = byId(document, 'total-line');
  const timeline = byId(document, 'timeline');

  let currentPlan = null;

  function reset() {
    currentPlan = null;
    strategy.classList.remove('err');
    empty.classList.remove('hidden');
    body.classList.add('hidden');
    error.classList.add('hidden');
    timelineSection.classList.add('hidden');
    timeline.replaceChildren();
  }

  function showError(message) {
    currentPlan = null;
    empty.classList.add('hidden');
    body.classList.add('hidden');
    timelineSection.classList.add('hidden');
    error.textContent = message;
    error.classList.remove('hidden');
  }

  function nextStep() {
    if (!currentPlan) return null;
    if (currentPlan.stepIndex >= currentPlan.steps.length) return null;
    return currentPlan.steps[currentPlan.stepIndex];
  }

  function renderTimeline() {
    timeline.replaceChildren();
    if (!currentPlan) return;
    const groups = groupPlanSteps(currentPlan.steps);
    let lastOfflineBlock = 0;
    groups.forEach((group, rowIndex) => {
      const first = group.steps[0];
      if (
        first.offlineBlock &&
        first.offlineBlock !== lastOfflineBlock &&
        (first.offlineWait ?? 0) >= 60
      ) {
        const blockSteps = currentPlan.steps.filter(
          (step) => step.offlineBlock === first.offlineBlock,
        );
        const names = blockSteps.map((item) => item.label);
        const nameText = names.join('、');
        const breakRow = document.createElement('tr');
        breakRow.classList.add('offline-break');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent =
          `🏕️ 离线 ${fmtDur(first.offlineWait ?? 0)}` +
          `${currentPlan.adDoubled ? '（离线收入广告 ×2）' : ''}` +
          ` · 回来后买：${nameText}`;
        breakRow.append(cell);
        timeline.append(breakRow);
      }
      lastOfflineBlock = first.offlineBlock || 0;

      const row = document.createElement('tr');
      if (group.steps.every((step) => step.type === 'upgrade')) row.classList.add('upg');
      if (group.steps.some((step) => step.offline)) row.classList.add('offline');
      if (group.indices.every((index) => index < currentPlan.stepIndex)) {
        row.classList.add('done');
      }
      if (group.indices.includes(currentPlan.stepIndex)) row.classList.add('cur');

      const cells = [
        String(rowIndex + 1),
        groupActionText(group.steps),
        groupCostText(group.steps),
        fmtDur(first.t),
        fmtClock(currentPlan.anchor + first.t * 1000),
      ];
      for (const [cellIndex, value] of cells.entries()) {
        const cell = document.createElement('td');
        if (cellIndex === 1) {
          cell.classList.add('act', 'timeline-action');
        }
        cell.textContent = value;
        row.append(cell);
      }
      timeline.append(row);
    });
  }

  function updateCountdown(now = Date.now()) {
    if (!currentPlan) return;
    const step = nextStep();
    if (!step) {
      nextLabel.textContent = '计划已完成';
      nextCount.textContent = '';
      nextClock.textContent = '所有目标都完成了，回游戏刷新数据吧';
      return;
    }
    const due = currentPlan.anchor + step.t * 1000;
    const remaining = due - now;
    const index = currentPlan.steps.indexOf(step);
    const previousBlock = currentPlan.steps[index - 1]?.offlineBlock ?? 0;
    const firstOfOfflineBlock =
      step.offlineBlock &&
      step.offlineBlock !== previousBlock &&
      (step.offlineWait ?? 0) >= 60;
    const offlinePrefix =
      firstOfOfflineBlock && step.offlineWait
        ? `先离线攒 ${fmtDur(step.offlineWait)} 再`
        : '';
    nextLabel.textContent = `下次行动：${offlinePrefix}${actionText(step)}（${fmtNum(stepCost(step))} ${resourceText(step)}）`;
    nextCount.textContent = remaining <= 0 ? '已到时' : `${fmtDur(remaining / 1000)} 后`;
    nextClock.textContent = `${fmtClock(due)}${remaining <= 0 ? ' · 现在就可以买' : ''}`;
  }

  function render({ plan, now = Date.now() }) {
    if (!plan || plan.steps.length === 0 && plan.complete === false) {
      reset();
      return;
    }
    currentPlan = plan;
    empty.classList.add('hidden');
    error.classList.add('hidden');
    body.classList.remove('hidden');
    timelineSection.classList.remove('hidden');

    strategy.textContent = planSummary(plan);
    if (plan.complete === false) {
      strategy.textContent += '（先执行当前段，完成后重新规划）';
      strategy.classList.remove('err');
      strategy.classList.add('warn-hint');
    } else {
      strategy.classList.remove('err', 'warn-hint');
    }

    if (plan.complete && plan.steps.length === 0) {
      nextLabel.textContent = '计划已完成';
      nextCount.textContent = '';
      nextClock.textContent = '没有需要购买的目标了';
      totalLine.textContent = '当前配置下已经没有待完成升级。';
      timelineSection.classList.add('hidden');
      timeline.replaceChildren();
      return;
    }

    const total = plan.complete
      ? `全程预计 ${fmtDur(plan.total)}（${fmtClock(plan.anchor + plan.total * 1000)} 完成）`
      : plan.total > 0
        ? `当前段预计 ${fmtDur(plan.total)}，完成后重新规划`
        : '当前段可立即执行，完成后重新规划';
    const mode =
      (plan.offlineBlocks ?? 0) > 0
        ? ` · 🏕️ ${plan.offlineBlocks} 段离线攒钱（在线等待 ${fmtDur(plan.onlineTime ?? 0)}，段内回到游戏后连续购买）` +
          (plan.adDoubled ? '，含离线收入广告 ×2' : '') +
          (plan.baselineTotal > plan.total + 0.5
            ? `，比在线方案快 ${fmtDur(plan.baselineTotal - plan.total)}`
            : '')
        : '';
    totalLine.textContent = `目标：${planGoalText(plan)} · ${total}${mode}`;
    updateCountdown(now);
    renderTimeline();
  }

  function tick({ plan, now = Date.now() }) {
    if (plan !== currentPlan) return;
    updateCountdown(now);
  }

  return { render, reset, showError, tick };
}
