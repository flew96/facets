// Подгонка фигуры под условие задачи: «площадь сечения равна 12», «расстояние равно 3», «угол 60°».
// Два способа:
//  • все размеры пропорционально — точный масштаб k (величина степени d меняется в kᵈ раз);
//  • подбор одного размера — численный поиск корня, затем «угадывание» точного значения
//    (p/q или √(p/q)) с точной проверкой. Если точного значения не нашлось, фигура не меняется:
//    программа обещает точные ответы.
import { Num, N, ONE, parseNum, parseDim, sqrtNum, valToNumber, fmtNum, fmtApprox } from '../math/num.js';
import { KINDS, SCALARS, DEFAULT_PARAMS, buildSolid, specUnit } from './solids.js';
import { evaluate } from './construct.js';

/**
 * Что подгоняем:
 *   { src: 'item', id, idx }   — строка idx в результате построения id;
 *   { src: 'figure', key }     — 'volume', 'surface' или 'info:<i>' (строка блока под размерами).
 * Возвращает { val, deg } (deg: 1 — длина, 2 — площадь, 3 — объём, 0 — отношение, 'angle' — угол, val = cos²φ) или null.
 */
export function measure(solid, ctx, target) {
  if (target.src === 'figure') {
    if (target.key === 'volume') return { val: solid.volume, deg: 3 };
    if (target.key === 'surface') return { val: solid.surface, deg: 2 };
    const r = solid.info?.[+String(target.key).split(':')[1]];
    return r && r[2] ? { val: r[1], deg: r[2] } : null;
  }
  const res = ctx.results.get(target.id);
  if (!res || res.error) return null;
  const r = res.rows[target.idx];
  return r && r.val !== undefined ? { val: r.val, deg: r.deg } : null;
}

/** Можно ли подогнать фигуру под эту строку */
export const fittable = (row) => row && row.val !== undefined && (row.deg === 'angle' || square(row.val) !== null);

/** Квадрат значения как точное число (для √x — x); null для сумм несократимых корней */
function square(v) {
  if (v instanceof Num) return v.sq();
  if (v && v.root) return v.root;
  return null;
}

const SPECIAL_DEG = { 0: N(1), 30: N('3/4'), 45: N('1/2'), 60: N('1/4'), 90: N(0) };
const toDeg = (c2) => (Math.acos(Math.sqrt(Math.min(1, Math.max(0, c2.toNumber())))) * 180) / Math.PI;

/** Разбор заданного значения. Для угла: «60», «60°», «tg = 2», «cos φ = 1/3» → { c2 = cos²φ } */
export function parseTarget(text, deg) {
  const src = String(text ?? '').trim();
  if (!src) throw new Error('Введите значение.');
  if (deg === 'angle') {
    const s = src.replace(/°/g, '').trim();
    const m = /^(cos|sin|tg|tan|ctg|cot)\s*(?:φ|phi|a|α)?\s*=?\s*(.+)$/i.exec(s);
    if (m) {
      const v = parseNum(m[2]), fn = m[1].toLowerCase();
      if (v.sign() < 0) throw new Error('Угол между прямыми или плоскостями — от 0° до 90°, значения его функций неотрицательны.');
      const v2 = v.sq();
      const c2 = fn === 'cos' ? v2 : fn === 'sin' ? ONE.sub(v2) : fn === 'tg' || fn === 'tan' ? ONE.div(ONE.add(v2)) : v2.div(ONE.add(v2));
      if (c2.sign() < 0 || c2.cmp(ONE) > 0) throw new Error(`${m[1]} угла не может быть равен ${fmtNum(v)}.`);
      return { c2, show: `${m[1]} φ = ${fmtNum(v)}` };
    }
    const d = parseNum(s);
    const c2 = d.isInteger() ? SPECIAL_DEG[String(d.rational()[0])] : null;
    if (!c2) throw new Error('Точно задаются углы 0°, 30°, 45°, 60° и 90°. Для другого угла введите значение функции, например «tg = 2» или «cos = 1/3».');
    return { c2, show: `${fmtNum(d)}°` };
  }
  const v = parseNum(src);
  if (v.sign() <= 0) throw new Error('Значение должно быть положительным.');
  return { v, show: fmtNum(v) };
}

/** Совпадает ли величина с заданным значением — точно */
function matches(m, T) {
  if (m.deg === 'angle') return m.val.eq(T.c2);
  const q = square(m.val);
  return q !== null && valToNumber(m.val) > 0 && q.eq(T.v.sq());
}
const numOf = (m) => (m.deg === 'angle' ? toDeg(m.val) : valToNumber(m.val));
const targetNum = (T) => (T.c2 ? toDeg(T.c2) : T.v.toNumber());

const compact = (x) => fmtNum(x).replace(/\s+/g, '');

function evalAt(spec, items, target) {
  const S = buildSolid(spec);
  return { S, m: measure(S, evaluate(S, items), target) };
}

// ─────────────────────────────── масштаб ───────────────────────────────

/** Все размеры фигуры, умноженные на k (буква-масштаб при этом заменяется числом) */
export function scaleSpec(spec, k) {
  const p = { ...spec.p };
  for (const [key, , mode] of KINDS[spec.kind].params(spec)) {
    if (SCALARS.includes(key)) continue;
    const raw = String(p[key] ?? DEFAULT_PARAMS[key]);
    p[key] = mode === 'pts'
      ? raw.split(/[;\n]+/).map((t) => t.trim()).filter(Boolean).map((t) => t.split(/\s+/).map((c) => compact(parseDim(c).v.mul(k))).join(' ')).join('; ')
      : compact(parseDim(raw).v.mul(k));
  }
  return { ...spec, p };
}

function icbrt(n) {
  const r = BigInt(Math.round(Math.cbrt(Number(n))));
  for (const c of [r - 1n, r, r + 1n]) if (c * c * c === n) return c;
  return null;
}

function snapRational(f, maxQ = 48) {
  for (let q = 1; q <= maxQ; q++) {
    const p = Math.round(f * q);
    if (p > 0 && Math.abs(p / q - f) <= 1e-9 * Math.max(1, Math.abs(f))) return Num.frac(p, q);
  }
  return null;
}

/** Точный кубический корень (рациональный или вида √(p/q)) либо null */
function cbrt(x) {
  if (x.isRational()) {
    const [p, q] = x.rational(), a = icbrt(p), b = icbrt(q);
    if (a !== null && b !== null) return Num.frac(a, b);
  }
  const f = Math.cbrt(x.toNumber());
  const c = snapRational(f * f);
  const k = c && sqrtNum(c);
  return k && k.mul(k).mul(k).eq(x) ? k : null;
}

/** Все размеры пропорционально: k^deg = T / текущее */
export function fitScale(spec, items, target, text) {
  const { S, m } = evalAt(spec, items, target);
  if (!m) throw new Error('Эта величина сейчас не вычисляется — сначала исправьте построение.');
  if (m.deg === 'angle' || m.deg === 0) throw new Error('Эта величина не зависит от размера фигуры: при пропорциональном изменении она не меняется. Выберите, какой размер подобрать.');
  const T = parseTarget(text, m.deg);
  const q = square(m.val);
  if (!q) throw new Error('Текущее значение — сумма несократимых корней, точный масштаб для него не находится.');
  const r = T.v.sq().div(q); // k^(2·deg)
  const s = sqrtNum(r); // k^deg
  const k = !s ? null : m.deg === 1 ? s : m.deg === 2 ? sqrtNum(s) : cbrt(s);
  if (!k) {
    const what = m.deg === 3 ? 'кубический корень' : 'корень';
    throw new Error(`Коэффициент подобия ≈ ${fmtApprox(Math.pow(r.toNumber(), 1 / (2 * m.deg)))} выражается через ${what}, который не записывается точно. Попробуйте задать другую величину или подобрать отдельный размер.`);
  }
  const next = scaleSpec(spec, k);
  const check = evalAt(next, items, target);
  if (!check.m || !matches(check.m, T)) throw new Error('Не удалось точно подогнать фигуру под это значение.');
  return { spec: next, k, unit: S.unit, message: S.unit ? `${S.unit} = ${fmtNum(k)} — размеры записаны числами` : `Все размеры умножены на ${fmtNum(k)}` };
}

// ─────────────────────────────── подбор размера ───────────────────────────────

/** Размеры, которые можно подбирать по одному: [key, label] */
export function fitParams(spec) {
  if (specUnit(spec)) return [];
  return KINDS[spec.kind].params(spec).filter(([, , mode]) => !mode).map(([key, label]) => [key, label]);
}

/** Короткая десятичная дробь, близкая к x (числа с длинными знаменателями слишком дороги для точной арифметики) */
function dec(x, digits) {
  if (!(x > 0) || !Number.isFinite(x)) return null;
  const s = String(Number(x.toPrecision(digits)));
  return /e/i.test(s) ? null : parseNum(s);
}

/** Подобрать один размер key так, чтобы величина стала равна заданной */
export function fitParam(spec, items, target, key, text) {
  if (specUnit(spec)) throw new Error('Подбор отдельного размера работает, когда размеры заданы числами. Для фигуры с буквой выберите «все размеры пропорционально».');
  const base = evalAt(spec, items, target).m;
  if (!base) throw new Error('Эта величина сейчас не вычисляется — сначала исправьте построение.');
  const T = parseTarget(text, base.deg), Tn = targetNum(T);
  const withKey = (x) => ({ ...spec, p: { ...spec.p, [key]: compact(x) } });
  const sample = (x) => {
    if (!x) return null;
    try {
      const { m } = evalAt(withKey(x), items, target);
      return m && m.deg === base.deg ? numOf(m) - Tn : null;
    } catch { return null; }
  };
  const x0 = parseNum(spec.p[key] ?? DEFAULT_PARAMS[key]).toNumber();

  // 1) грубая сетка в логарифмическом масштабе вокруг текущего значения
  const STEPS = 120, lo = x0 / 40, hi = x0 * 40;
  const grid = [];
  for (let i = 0; i <= STEPS; i++) {
    const x = dec(lo * Math.pow(hi / lo, i / STEPS), 3);
    const g = sample(x);
    if (g !== null) grid.push({ x: x.toNumber(), g });
  }
  const brackets = [];
  for (let i = 0; i + 1 < grid.length; i++) {
    const a = grid[i], b = grid[i + 1];
    if (a.g === 0) brackets.push([a, a]);
    else if (a.g * b.g < 0) brackets.push([a, b]);
  }
  if (!brackets.length) throw new Error(`Не нашлось значения, при котором величина равна ${T.show}: меняя этот размер, её не получить. Попробуйте подобрать другой размер.`);

  // 2) уточнение каждого корня бисекцией по коротким десятичным дробям
  const roots = brackets.map(([a, b]) => {
    for (let it = 0; it < 30 && a !== b && (b.x - a.x) / a.x > 2e-6; it++) {
      const x = dec((a.x + b.x) / 2, 7);
      const g = sample(x);
      if (g === null || x.toNumber() === a.x || x.toNumber() === b.x) break;
      if (g === 0) { a = b = { x: x.toNumber(), g }; break; }
      if (g * a.g < 0) b = { x: x.toNumber(), g }; else a = { x: x.toNumber(), g };
    }
    return a === b ? a.x : a.x - (a.g * (b.x - a.x)) / (b.g - a.g);
  }).sort((r1, r2) => Math.abs(Math.log(r1 / x0)) - Math.abs(Math.log(r2 / x0)));

  // 3) точное значение рядом с корнем: p/q или √(p/q), проверяется точной арифметикой
  for (const xr of roots) {
    const cands = [];
    for (let q = 1; q <= 48; q++) {
      const p = Math.round(xr * q);
      if (p > 0) cands.push({ x: Num.frac(p, q), f: p / q });
      const p2 = Math.round(xr * xr * q);
      if (p2 > 0) { const r = sqrtNum(Num.frac(p2, q)); if (r) cands.push({ x: r, f: Math.sqrt(p2 / q) }); }
    }
    const seen = new Set();
    const near = cands.filter((c) => Math.abs(c.f - xr) <= 3e-4 * xr && !seen.has(c.f.toPrecision(12)) && seen.add(c.f.toPrecision(12)))
      .sort((c1, c2) => Math.abs(c1.f - xr) - Math.abs(c2.f - xr)).slice(0, 12);
    for (const c of near) {
      try {
        const next = withKey(c.x);
        const { m } = evalAt(next, items, target);
        if (m && matches(m, T)) {
          const others = roots.filter((r) => r !== xr).map((r) => fmtApprox(r, 3));
          return { spec: next, key, value: c.x, others };
        }
      } catch { /* кандидат не подошёл */ }
    }
  }
  throw new Error(`Подходящее значение ≈ ${roots.map((r) => fmtApprox(r, 4)).join(' или ≈ ')}, но точно (в виде дроби или корня из дроби) оно не записывается, поэтому фигура не изменена.`);
}
