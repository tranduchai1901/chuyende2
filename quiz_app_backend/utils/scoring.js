/**
 * Tinh diem phan tram (lam tron so nguyen).
 * @param {number} correct
 * @param {number} total
 * @returns {number}
 */
export function computeScorePercent(correct, total) {
  if (!total || total < 1) return 0;
  return Math.round((correct / total) * 100);
}
