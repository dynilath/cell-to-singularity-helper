import { describe, expect, it } from 'vitest';
import { estimateGrowth } from '../src/core/growth.ts';

describe('estimateGrowth', () => {
  it('computes the growth rate between two samples', () => {
    const result = estimateGrowth([
      { level: 15, price: 3.6e6 },
      { level: 20, price: 13.4e6 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = (13.4 / 3.6) ** (1 / 5);
    expect(result.average).toBeCloseTo(expected, 10);
    expect(result.pairs).toHaveLength(1);
  });

  it('takes the geometric mean over multiple pairs', () => {
    const result = estimateGrowth([
      { level: 1, price: 100 },
      { level: 3, price: 225 },
      { level: 5, price: 506.25 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.average).toBeCloseTo(1.5, 10);
    expect(result.pairs).toHaveLength(2);
  });

  it('sorts unordered samples', () => {
    const result = estimateGrowth([
      { level: 20, price: 13.4e6 },
      { level: 15, price: 3.6e6 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairs[0].from.level).toBe(15);
    expect(result.pairs[0].to.level).toBe(20);
  });

  it('rejects duplicate levels', () => {
    const result = estimateGrowth([
      { level: 15, price: 3.6e6 },
      { level: 15, price: 4e6 },
    ]);
    expect(result).toEqual({ ok: false, error: 'duplicate-level' });
  });

  it('requires at least two samples', () => {
    expect(estimateGrowth([])).toEqual({ ok: false, error: 'need-two' });
    expect(estimateGrowth([{ level: 15, price: 3.6e6 }])).toEqual({
      ok: false,
      error: 'need-two',
    });
  });

  it('rejects non-positive prices', () => {
    const result = estimateGrowth([
      { level: 1, price: 0 },
      { level: 2, price: 100 },
    ]);
    expect(result).toEqual({ ok: false, error: 'invalid' });
  });
});
