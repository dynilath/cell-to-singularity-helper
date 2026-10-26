/**
 * 连续购买同一工厂的结算。
 *
 * 游戏里同一档每买一台，下一台价格乘以 growth。因此连续买 count 台的总价是
 * 等比数列求和：
 *   growth > 1: price * (growth^count - 1) / (growth - 1)
 *   growth = 1: price * count
 *
 * @typedef {{ price: number, unit: number, growth: number, count: number }} PurchaseInput
 * @typedef {{ count: number, totalCost: number, nextPrice: number, addedRate: number }} PurchaseResult
 */

/**
 * @param {PurchaseInput} input
 * @returns {PurchaseResult | null}
 */
export function calculatePurchase({ price, unit, growth, count }) {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(unit) || unit <= 0) return null;
  if (!Number.isFinite(growth) || growth < 1) return null;
  if (!Number.isInteger(count) || count < 1) return null;

  const totalCost =
    growth === 1 ? price * count : (price * (growth ** count - 1)) / (growth - 1);
  const nextPrice = price * growth ** count;
  const addedRate = unit * count;

  if (![totalCost, nextPrice, addedRate].every(Number.isFinite)) return null;

  return { count, totalCost, nextPrice, addedRate };
}
