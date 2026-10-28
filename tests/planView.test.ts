import { describe, expect, it } from 'vitest';
import {
  groupActionText,
  groupPlanSteps,
  planGoalText,
  planSummary,
} from '../src/ui/planView.ts';

function step(type, label, extra = {}) {
  return { type, label, ...extra };
}

describe('planSummary', () => {
  it('follows the real interleaved order instead of grouping factories first', () => {
    const summary = planSummary({
      goal: 'upgrades',
      goalLabel: '完成全部 2 个升级',
      steps: [
        step('upgrade', '升级1', { upgradeId: 'u1' }),
        step('buy', '工厂1', { factoryId: 'f1', nth: 4 }),
        step('buy', '工厂1', { factoryId: 'f1', nth: 5 }),
        step('buy', '工厂1', { factoryId: 'f1', nth: 6 }),
        step('upgrade', '升级2', { upgradeId: 'u2' }),
      ],
    });
    expect(summary).toBe(
      '🚀 共买 3 台工厂、2 个升级，顺序：升级1 → 工厂1×3 → 升级2',
    );
  });

  it('lists all upgrades in order when there are no factory buys', () => {
    const summary = planSummary({
      goal: 'upgrades',
      goalLabel: '完成全部 3 个升级',
      steps: [
        step('upgrade', '升级1'),
        step('upgrade', '升级2'),
        step('upgrade', '升级3'),
      ],
    });
    expect(summary).toContain('升级1 → 升级2 → 升级3');
  });

  it('keeps the new-factory goal and its operation order', () => {
    const summary = planSummary({
      goal: 'new-factory',
      goalLabel: '点出第一个新工厂：工厂2',
      steps: [step('buy', '工厂1', { nth: 2 }), step('buy', '工厂2', { nth: 1 })],
    });
    expect(summary).toContain('点出第一个新工厂：工厂2');
    expect(summary).toContain('工厂1×1 → 工厂2×1');
  });

  it('marks offline-saving plans and merged blocks in the summary', () => {
    const summary = planSummary({
      goal: 'upgrades',
      goalLabel: '完成全部 2 个升级',
      strategy: 'search',
      offlineBlocks: 1,
      steps: [
        step('upgrade', '升级1', { offline: true }),
        step('buy', '工厂1', { nth: 2, offline: true }),
        step('upgrade', '升级2', { offline: true }),
      ],
    });
    expect(summary).toContain('离线攒钱（1 段）');
    expect(summary).toContain('升级1 → 工厂1×1 → 升级2');
  });

  it('compacts long preset plans to totals and first/last actions', () => {
    const steps = [];
    for (let index = 0; index < 20; index += 1) {
      steps.push(step('upgrade', `升级${index + 1}`));
      if (index % 2 === 0) steps.push(step('buy', '阴险者', { nth: index + 2 }));
    }
    const summary = planSummary({
      goal: 'upgrades',
      goalLabel: '完成全部 20 个升级',
      steps,
    });
    expect(summary).toContain('共买 10 台工厂');
    expect(summary).toContain('20 个升级');
    expect(summary).toContain('共 30 步');
    expect(summary).toContain('首步：升级1');
    expect(summary).toContain('末步：升级20');
    expect(summary.length).toBeLessThan(150);
  });
});

describe('groupPlanSteps', () => {
  it('merges consecutive purchases at the same timestamp for display', () => {
    const groups = groupPlanSteps([
      { type: 'buy', label: '心脏', nth: 110, t: 0 },
      { type: 'buy', label: '心脏', nth: 111, t: 0 },
      { type: 'buy', label: '心脏', nth: 112, t: 0 },
      { type: 'upgrade', label: '骨头', t: 0 },
      { type: 'upgrade', label: '骨头', t: 0 },
      { type: 'buy', label: '骨骼', nth: 8, t: 180, offlineBlock: 1 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].steps).toHaveLength(5);
    expect(groups[0].indices).toEqual([0, 1, 2, 3, 4]);
    expect(groups[1].steps).toHaveLength(1);
    expect(groups[1].t).toBe(180);
  });

  it('shows every merged factory range instead of truncating with 等N项', () => {
    expect(
      groupActionText([
        { type: 'buy', label: '骨骼', nth: 8, t: 0 },
        { type: 'buy', label: '骨骼', nth: 9, t: 0 },
        { type: 'buy', label: '骨骼', nth: 10, t: 0 },
        { type: 'buy', label: '大脑', nth: 39, t: 0 },
        { type: 'buy', label: '大脑', nth: 40, t: 0 },
        { type: 'buy', label: '肌肉', nth: 4, t: 0 },
        { type: 'upgrade', label: '骨头', t: 0 },
      ]),
    ).toBe(
      '购买 骨骼 第 8 ~ 10 台\n' +
        '购买 大脑 第 39 ~ 40 台\n' +
        '购买 肌肉 第 4 台\n' +
        '购买 骨头',
    );
  });

  it('merges interleaved buys of the same factory into one range', () => {
    expect(
      groupActionText([
        { type: 'buy', label: '骨骼', nth: 10, t: 0 },
        { type: 'buy', label: '大脑', nth: 39, t: 0 },
        { type: 'buy', label: '内分泌系统', nth: 28, t: 0 },
        { type: 'buy', label: '肌肉', nth: 6, t: 0 },
        { type: 'buy', label: '骨骼', nth: 11, t: 0 },
        { type: 'buy', label: '大脑', nth: 40, t: 0 },
        { type: 'buy', label: '内分泌系统', nth: 29, t: 0 },
      ]),
    ).toBe(
      '购买 骨骼 第 10 ~ 11 台\n' +
        '购买 大脑 第 39 ~ 40 台\n' +
        '购买 内分泌系统 第 28 ~ 29 台\n' +
        '购买 肌肉 第 6 台',
    );
  });

  it('does not merge across different timestamps or offline blocks', () => {
    const groups = groupPlanSteps([
      { type: 'buy', label: '心脏', t: 0 },
      { type: 'buy', label: '心脏', t: 1 },
      { type: 'buy', label: '心脏', t: 1, offlineBlock: 2 },
    ]);
    expect(groups).toHaveLength(3);
  });
});

describe('planGoalText', () => {
  it('describes an incomplete plan as the next gate instead of the full goal', () => {
    expect(
      planGoalText({
        complete: false,
        goalLabel: '完成全部 37 个升级',
        steps: [step('upgrade', '枕叶')],
      }),
    ).toBe('先买「枕叶」');
    expect(
      planGoalText({
        complete: false,
        goalLabel: '完成全部 37 个升级',
        steps: [step('buy', '内分泌系统', { nth: 1 })],
      }),
    ).toBe('先买出「内分泌系统」首台');
  });

  it('keeps the declared goal for complete plans', () => {
    expect(
      planGoalText({
        complete: true,
        goalLabel: '完成全部 2 个升级',
        steps: [],
      }),
    ).toBe('完成全部 2 个升级');
  });
});
