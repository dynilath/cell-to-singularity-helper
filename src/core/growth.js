/**
 * 倍率助手：根据若干“等级 → 价格”样本推算每级增长倍率。
 *
 * 对相邻样本计算 (价格比)^(1/级差)，再取几何平均。
 */

/**
 * @typedef {{ level: number, price: number }} GrowthPoint
 * @typedef {{ ok: true, average: number, pairs: { from: GrowthPoint, to: GrowthPoint, growth: number }[] }
 *   | { ok: false, error: 'need-two' | 'invalid' | 'duplicate-level' }} GrowthEstimate
 */

/**
 * @param {GrowthPoint[]} points
 * @returns {GrowthEstimate}
 */
export function estimateGrowth(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { ok: false, error: 'need-two' };
  }

  const sorted = [...points].sort((a, b) => a.level - b.level);
  const seen = new Set();

  for (const point of sorted) {
    if (!Number.isFinite(point.level) || !Number.isFinite(point.price) || point.price <= 0) {
      return { ok: false, error: 'invalid' };
    }
    if (seen.has(point.level)) return { ok: false, error: 'duplicate-level' };
    seen.add(point.level);
  }

  const pairs = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const growth = (current.price / previous.price) ** (1 / (current.level - previous.level));
    if (!Number.isFinite(growth) || growth <= 0) return { ok: false, error: 'invalid' };
    pairs.push({ from: previous, to: current, growth });
  }

  const average = Math.exp(
    pairs.reduce((sum, pair) => sum + Math.log(pair.growth), 0) / pairs.length,
  );

  return { ok: true, average, pairs };
}
