import { describe, expect, it } from 'vitest';
import { calculatePurchase } from '../src/core/purchase.ts';

describe('calculatePurchase', () => {
  it('settles a single purchase', () => {
    expect(calculatePurchase({ price: 100, unit: 5, growth: 2, count: 1 })).toEqual({
      count: 1,
      totalCost: 100,
      nextPrice: 200,
      addedRate: 5,
    });
  });

  it('sums the geometric price series for five purchases', () => {
    expect(calculatePurchase({ price: 100, unit: 5, growth: 2, count: 5 })).toEqual({
      count: 5,
      totalCost: 3100,
      nextPrice: 3200,
      addedRate: 25,
    });
  });

  it('supports ten purchases', () => {
    const purchase = calculatePurchase({ price: 1, unit: 1, growth: 2, count: 10 });
    expect(purchase).toEqual({
      count: 10,
      totalCost: 1023,
      nextPrice: 1024,
      addedRate: 10,
    });
  });

  it('uses a linear price when growth is exactly 1', () => {
    expect(calculatePurchase({ price: 100, unit: 5, growth: 1, count: 5 })).toEqual({
      count: 5,
      totalCost: 500,
      nextPrice: 100,
      addedRate: 25,
    });
  });

  it('matches the sum of individual prices for fractional growth', () => {
    const price = 2.4e6;
    const growth = 1.5;
    const count = 5;
    const purchase = calculatePurchase({ price, unit: 9.5e3, growth, count });

    expect(purchase).not.toBeNull();
    if (!purchase) return;

    let sum = 0;
    let current = price;
    for (let index = 0; index < count; index += 1) {
      sum += current;
      current *= growth;
    }

    expect(purchase.totalCost).toBeCloseTo(sum, 6);
    expect(purchase.nextPrice).toBeCloseTo(price * growth ** count, 6);
    expect(purchase.addedRate).toBe(9.5e3 * count);
  });

  it('rejects invalid input', () => {
    expect(calculatePurchase({ price: 0, unit: 5, growth: 2, count: 1 })).toBeNull();
    expect(calculatePurchase({ price: 100, unit: 0, growth: 2, count: 1 })).toBeNull();
    expect(calculatePurchase({ price: 100, unit: 5, growth: 0.9, count: 1 })).toBeNull();
    expect(calculatePurchase({ price: 100, unit: 5, growth: 2, count: 0 })).toBeNull();
    expect(calculatePurchase({ price: 100, unit: 5, growth: 2, count: 1.5 })).toBeNull();
    expect(calculatePurchase({ price: Number.NaN, unit: 5, growth: 2, count: 1 })).toBeNull();
  });
});
