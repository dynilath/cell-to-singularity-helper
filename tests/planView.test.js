import { describe, expect, it } from 'vitest';
import { planSummary } from '../src/ui/planView.js';

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
      strategy: 'offline',
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
