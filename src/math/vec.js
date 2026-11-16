// Точные векторы (массивы из трёх Num) и решение линейных систем.
import { N, ZERO } from './num.js';

export const vec = (x, y, z) => [N(x), N(y), N(z)];
export const add = (a, b) => [a[0].add(b[0]), a[1].add(b[1]), a[2].add(b[2])];
export const sub = (a, b) => [a[0].sub(b[0]), a[1].sub(b[1]), a[2].sub(b[2])];
export const scale = (a, k) => [a[0].mul(k), a[1].mul(k), a[2].mul(k)];
export const dot = (a, b) => a[0].mul(b[0]).add(a[1].mul(b[1])).add(a[2].mul(b[2]));
export const cross = (a, b) => [
  a[1].mul(b[2]).sub(a[2].mul(b[1])),
  a[2].mul(b[0]).sub(a[0].mul(b[2])),
  a[0].mul(b[1]).sub(a[1].mul(b[0])),
];
export const det = (a, b, c) => dot(a, cross(b, c));
export const len2 = (a) => dot(a, a);
export const isZeroVec = (a) => a[0].isZero() && a[1].isZero() && a[2].isZero();
export const eqVec = (a, b) => a[0].eq(b[0]) && a[1].eq(b[1]) && a[2].eq(b[2]);
/** a + t·(b − a) */
export const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
export const toFloat = (a) => [a[0].toNumber(), a[1].toNumber(), a[2].toNumber()];

/**
 * Решение системы rows·x = rhs методом Гаусса (точно).
 * rows: Num[][] (m×n), rhs: Num[] (m).
 * → { type: 'unique', x } | { type: 'none' } | { type: 'many' }
 */
export function solve(rows, rhs) {
  const n = rows[0].length;
  const m = rows.map((r, i) => [...r, rhs[i]]);
  let rank = 0;
  const pivots = [];
  for (let col = 0; col < n && rank < m.length; col++) {
    const piv = m.findIndex((r, i) => i >= rank && !r[col].isZero());
    if (piv < 0) continue;
    [m[rank], m[piv]] = [m[piv], m[rank]];
    const inv = m[rank][col].inv();
    m[rank] = m[rank].map((v) => v.mul(inv));
    for (let i = 0; i < m.length; i++) {
      if (i === rank || m[i][col].isZero()) continue;
      const k = m[i][col];
      m[i] = m[i].map((v, j) => v.sub(k.mul(m[rank][j])));
    }
    pivots.push(col);
    rank++;
  }
  for (let i = rank; i < m.length; i++) if (!m[i][n].isZero()) return { type: 'none' };
  if (rank < n) return { type: 'many' };
  const x = new Array(n).fill(ZERO);
  pivots.forEach((col, i) => { x[col] = m[i][n]; });
  return { type: 'unique', x };
}

/** Ранг матрицы */
export function rank(rows) {
  const m = rows.map((r) => [...r]);
  let rk = 0;
  for (let col = 0; col < m[0].length && rk < m.length; col++) {
    const piv = m.findIndex((r, i) => i >= rk && !r[col].isZero());
    if (piv < 0) continue;
    [m[rk], m[piv]] = [m[piv], m[rk]];
    for (let i = rk + 1; i < m.length; i++) {
      if (m[i][col].isZero()) continue;
      const k = m[i][col].div(m[rk][col]);
      m[i] = m[i].map((v, j) => v.sub(k.mul(m[rk][j])));
    }
    rk++;
  }
  return rk;
}
