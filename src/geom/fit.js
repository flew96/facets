// Условия задачи: «площадь сечения равна 12», «угол между гранью и основанием 60°», «объём 9√3».
// Каждое условие связано с одним искомым размером фигуры (h, a, … или буквой-масштабом),
// остальные размеры считаются данными и не меняются. Все условия решаются вместе:
//  • одно неизвестное — сетка + бисекция, несколько — метод Ньютона;
//  • затем «угадываем» точное значение каждого неизвестного (p/q или √(p/q))
//    и проверяем все условия точной арифметикой. Если точного решения нет, фигура не меняется:
//    программа обещает точные ответы.
import { Num, N, ONE, approxMode, parseNum, parseDim, parseQty, sqrtNum, valToNumber, fmtNum, fmtVal, fmtApprox, unitStr } from '../math/num.js';
import { KINDS, SCALARS, DEFAULT_PARAMS, buildSolid, specUnit } from './solids.js';
import { evaluate, refsOf, ownerOf } from './construct.js';

/** Неизвестное «значение буквы-масштаба» (для фигур, заданных буквой) */
export const UNIT = '@unit';

// ─────────────────────────────── величины ───────────────────────────────

const firstWord = (k) => String(k).split(/\s/)[0];

/**
 * Значение величины: { val, deg } (deg: 1 — длина, 2 — площадь, 3 — объём, 0 — отношение,
 * 'angle' — угол, тогда val = cos²φ) или null.
 * target: { src: 'item', id, idx, word } — строка результата построения; { src: 'figure', key } — 'volume', 'surface', 'info:i'.
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
  // строки V₁/V₂ появляются не всегда, поэтому сверяем и номер, и первое слово подписи
  let r = res.rows[target.idx];
  if (!r || r.val === undefined || (target.word && firstWord(r.k) !== target.word)) r = res.rows.find((x) => x.val !== undefined && firstWord(x.k) === target.word);
  return r && r.val !== undefined ? { val: r.val, deg: r.deg } : null;
}

/** Можно ли сделать эту строку условием задачи */
export const fittable = (row) => row && row.val !== undefined && (row.deg === 'angle' || square(row.val) !== null);

/** Квадрат значения как точное число (для √x — x); null для сумм несократимых корней */
function square(v) {
  if (v instanceof Num) return v.sq();
  if (v && v.root) return v.root;
  return null;
}

const SPECIAL_DEG = { 0: N(1), 30: N('3/4'), 45: N('1/2'), 60: N('1/4'), 90: N(0) };
const toDeg = (c2) => (Math.acos(Math.sqrt(Math.min(1, Math.max(0, c2.toNumber())))) * 180) / Math.PI;

/**
 * Разбор значения из условия.
 * Угол: «60», «60°», «tg = 2», «cos φ = 1/3» → { c2 = cos²φ }.
 * Остальное: число; если letter задана (фигура с буквой, сама буква не ищется) — выражение с этой буквой в нужной степени.
 */
export function parseTarget(text, deg, letter = null) {
  const src = String(text ?? '').trim();
  if (!src) throw new Error('Введите значение.');
  if (deg === 'angle') {
    const s = src.replace(/°/g, '').trim();
    const m = /^(cos|sin|tg|tan|ctg|cot)\s*(?:φ|phi|α)?\s*=?\s*(.+)$/i.exec(s);
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
  let v;
  const q = parseQty(src);
  const need = deg === 0 ? 0 : +deg;
  if (letter && need > 0) {
    if (q.deg !== need || (q.sym && q.sym !== letter)) {
      const u = unitStr(letter, need);
      throw new Error(`Размеры фигуры заданы буквой ${letter}, поэтому эта величина пропорциональна ${u}: запишите её через ${letter} (например, 3${u}) — или выберите искомым саму букву ${letter}, тогда можно ввести число.`);
    }
    v = q.v;
  } else {
    if (q.sym) throw new Error(letter ? 'Эта величина не зависит от буквы — введите число.' : `В «${src}» есть буква, а размеры фигуры заданы числами — введите число.`);
    v = q.v;
  }
  if (v.sign() <= 0) throw new Error('Значение должно быть положительным.');
  return { v, show: src };
}

/** Точно ли величина равна заданному значению */
function matches(m, T) {
  if (!m) return false;
  if (m.deg === 'angle') return m.val.eq(T.c2);
  const q = square(m.val);
  return q !== null && valToNumber(m.val) > 0 && q.eq(T.v.sq());
}

/** Невязка, одинаково масштабированная для площадей, длин и углов */
function residual(m, T) {
  if (m.deg === 'angle') return m.x - T.c2.toNumber();
  return m.x > 0 ? Math.log(m.x / T.v.toNumber()) : null;
}

// ─────────────────────────────── масштаб ───────────────────────────────

const compact = (x, unit = '') => fmtNum(x, unit).replace(/\s+/g, '');

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

/** Спецификация для построения: в буквенной фигуре, где буква найдена из условия, — уже числа */
export function buildSpec(spec, conds) {
  return conds?.some((c) => c.unknown === UNIT) && spec.unitVal ? scaleSpec(spec, parseNum(spec.unitVal)) : spec;
}

function icbrt(n) {
  const r = BigInt(Math.round(Math.cbrt(Number(n))));
  for (const c of [r - 1n, r, r + 1n]) if (c * c * c === n) return c;
  return null;
}

/** Точный кубический корень (рациональный или вида √(p/q)) либо null */
function cbrt(x) {
  if (x.isRational()) {
    const [p, q] = x.rational(), a = icbrt(p), b = icbrt(q);
    if (a !== null && b !== null) return Num.frac(a, b);
  }
  const f = Math.cbrt(x.toNumber());
  for (const c of snapCands(f, 1e-9)) { if (c.x.mul(c.x).mul(c.x).eq(x)) return c.x; }
  return null;
}

// ─────────────────────────────── решение ───────────────────────────────

/** Размеры, которые можно искать: [key, label]; UNIT — буква-масштаб */
export function unknownChoices(spec) {
  const out = KINDS[spec.kind].params(spec).filter(([, , mode]) => !mode).map(([key, label]) => [key, label]);
  const u = specUnit(spec);
  if (u) out.unshift([UNIT, `буква ${u} (все размеры пропорционально)`]);
  return out;
}


/** Построения, от которых зависят условия (с их зависимостями), в исходном порядке */
export function relevantItems(items, conds) {
  const need = new Set(conds.filter((c) => c.target.src === 'item').map((c) => c.target.id));
  for (let i = items.length - 1; i >= 0; i--) {
    if (!need.has(items[i].id)) continue;
    for (const r of refsOf(items[i])) { const o = ownerOf(r); if (o) need.add(o); }
  }
  return items.filter((it) => need.has(it.id));
}

/** Короткая десятичная дробь, близкая к x (длинные знаменатели слишком дороги для точной арифметики) */
function dec(x, digits) {
  if (!(x > 0) || !Number.isFinite(x)) return null;
  const s = String(Number(x.toPrecision(digits)));
  return /e/i.test(s) ? null : parseNum(s);
}

/** Кандидаты в точные значения рядом с x: p/q и √(p/q), q ≤ 48 */
function snapCands(x, tol = 3e-4) {
  const out = [], seen = new Set();
  const add = (v, f) => { const k = f.toPrecision(12); if (Math.abs(f - x) <= tol * x && !seen.has(k)) { seen.add(k); out.push({ x: v, f }); } };
  for (let q = 1; q <= 48; q++) {
    const p = Math.round(x * q);
    if (p > 0) add(Num.frac(p, q), p / q);
    const p2 = Math.round(x * x * q);
    if (p2 > 0) { const r = sqrtNum(Num.frac(p2, q)); if (r) add(r, Math.sqrt(p2 / q)); }
  }
  return out.sort((a, b) => Math.abs(a.f - x) - Math.abs(b.f - x));
}

/** Решение линейной системы (Гаусс); null, если она вырождена */
function linsolve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/**
 * Решить условия: найти искомые размеры так, чтобы все величины стали равны заданным.
 * conds: [{ target, text, unknown, deg }]. Возвращает { spec } (с найденными значениями) или { error }.
 */
export function solveConds(spec, items, conds) {
  try {
    return { spec: solve(spec, items, conds) };
  } catch (e) {
    return { error: e.message };
  }
}

function solve(spec, items, conds) {
  const letter = specUnit(spec);
  const unknowns = conds.map((c) => c.unknown);
  const choices = new Map(unknownChoices(spec));
  conds.forEach((c) => {
    if (!choices.has(c.unknown)) throw new Error(`Искомый размер «${c.unknown}» у этой фигуры больше не задаётся — удалите это условие.`);
  });
  if (new Set(unknowns).size !== unknowns.length) throw new Error('Два условия ищут один и тот же размер — у каждого условия должно быть своё неизвестное.');
  if (unknowns.length > 3) throw new Error('Одновременно можно искать не больше трёх размеров.');
  const coefMode = letter && !unknowns.includes(UNIT);
  const T = conds.map((c) => parseTarget(c.text, c.deg, coefMode ? letter : null));
  const its = relevantItems(items, conds);

  // значения неизвестных → спецификация фигуры
  const withVals = (vals) => {
    const p = { ...spec.p };
    let unitVal = spec.unitVal;
    unknowns.forEach((u, j) => {
      if (u === UNIT) unitVal = compact(vals[j]);
      else p[u] = compact(vals[j], letter || '');
    });
    return { ...spec, p, unitVal };
  };
  const measures = (sp) => {
    const S = buildSolid(buildSpec(sp, conds));
    const ctx = its.length ? evaluate(S, its) : null;
    return conds.map((c) => measure(S, ctx, c.target));
  };
  const allMatch = (sp) => { try { const ms = measures(sp); return ms.every((m, i) => matches(m, T[i])); } catch { return false; } };
  const F = (xs) => {
    const nums = xs.map((x) => dec(x, 7));
    if (nums.some((x) => !x)) return null;
    try {
      // численный поиск: точная запись не нужна, только величина — считаем в приближённом режиме
      const ms = approxMode(() => measures(withVals(nums)).map((m) => m && { deg: m.deg, x: m.deg === 'angle' ? m.val.toNumber() : valToNumber(m.val) }));
      const r = ms.map((m, i) => (m && m.deg === conds[i].deg ? residual(m, T[i]) : null));
      return r.some((x) => x === null || !Number.isFinite(x)) ? null : r;
    } catch { return null; }
  };
  const current = unknowns.map((u) => {
    const raw = u === UNIT ? spec.unitVal || '1' : spec.p[u] ?? DEFAULT_PARAMS[u];
    try { return parseDim(raw).v.toNumber(); } catch { return 1; }
  });

  // уже выполнено (например, после перезагрузки страницы)
  if (allMatch(spec) && (!unknowns.includes(UNIT) || spec.unitVal)) return spec;

  // одно условие на букву-масштаб — точный коэффициент подобия
  if (unknowns.length === 1 && unknowns[0] === UNIT && conds[0].deg !== 'angle' && +conds[0].deg > 0) {
    const m = measures({ ...spec, unitVal: '1' })[0];
    const q = m && square(m.val);
    if (q) {
      const r = T[0].v.sq().div(q), s = sqrtNum(r), d = +conds[0].deg;
      const k = !s ? null : d === 1 ? s : d === 2 ? sqrtNum(s) : cbrt(s);
      if (k) { const sp = withVals([k]); if (allMatch(sp)) return sp; }
    }
  }

  // численное решение
  let roots;
  if (unknowns.length === 1) roots = roots1(F, current[0]).map((x) => [x]);
  else roots = rootsN(F, current);
  if (!roots.length) {
    throw new Error(unknowns.length === 1
      ? 'Не нашлось значения искомого размера, при котором условие выполняется. Проверьте значение или выберите другой искомый размер.'
      : 'Не удалось найти размеры, при которых выполняются все условия одновременно. Проверьте значения или выберите другие искомые размеры.');
  }

  // точные значения рядом с найденным корнем
  for (const xr of roots) {
    const cands = xr.map((x) => snapCands(x).slice(0, unknowns.length === 1 ? 12 : 6));
    if (cands.some((c) => !c.length)) continue;
    let combos = [[]];
    for (const cs of cands) combos = combos.flatMap((cmb) => cs.map((c) => [...cmb, c]));
    combos.sort((a, b) => a.reduce((s, c, j) => s + Math.abs(c.f / xr[j] - 1), 0) - b.reduce((s, c, j) => s + Math.abs(c.f / xr[j] - 1), 0));
    for (const cmb of combos.slice(0, 250)) {
      const sp = withVals(cmb.map((c) => c.x));
      if (allMatch(sp)) return sp;
    }
  }
  const names = unknowns.map((u) => (u === UNIT ? letter : u));
  const approx = roots.map((xr) => xr.map((x, j) => `${names[j]} ≈ ${fmtApprox(x, 4)}`).join(', ')).join(' или ');
  throw new Error(`Условия выполняются при ${approx}, но точно (дробью или корнем из дроби) это не записывается, поэтому фигура не изменена.`);
}

/** Выполнено ли каждое условие при текущих размерах (точно) */
export function condsStatus(spec, items, conds) {
  try {
    const letter = specUnit(spec), coef = letter && !conds.some((c) => c.unknown === UNIT);
    const S = buildSolid(buildSpec(spec, conds));
    const its = relevantItems(items, conds);
    const ctx = its.length ? evaluate(S, its) : null;
    return conds.map((c) => { try { return matches(measure(S, ctx, c.target), parseTarget(c.text, c.deg, coef ? letter : null)); } catch { return false; } });
  } catch { return conds.map(() => false); }
}

/**
 * Какие ответы зависят от незаданных («?») размеров keys: меняем их в 11/8 раза, заново решаем условия
 * и сравниваем ответы. Возвращает множество ключей 'id|номер строки' и 'figure|volume' и т. п.; null — проверить не удалось.
 */
export function freeDeps(spec, items, conds, keys) {
  if (!keys.length) return null;
  const letter = specUnit(spec);
  const alt = { ...spec, p: { ...spec.p } };
  for (const k of keys) alt.p[k] = compact(parseDim(spec.p[k] ?? DEFAULT_PARAMS[k]).v.mul(N('11/8')), letter || '');
  let sp = alt;
  if (conds.length) { const r = solveConds(alt, items, conds); if (!r.spec) return null; sp = r.spec; }
  const S1 = buildSolid(buildSpec(spec, conds)), S2 = buildSolid(buildSpec(sp, conds));
  const c1 = evaluate(S1, items), c2 = evaluate(S2, items);
  const out = new Set(), f = (v) => (v === undefined ? '' : fmtVal(v));
  if (f(S1.volume) !== f(S2.volume)) out.add('figure|volume');
  if (f(S1.surface) !== f(S2.surface)) out.add('figure|surface');
  (S1.info || []).forEach((r, i) => { if (f(r[1]) !== f(S2.info?.[i]?.[1])) out.add(`figure|info:${i}`); });
  for (const it of items) {
    const r1 = c1.results.get(it.id), r2 = c2.results.get(it.id);
    r1.rows.forEach((x, i) => { const y = r2.rows[i]; if (!y || y.k !== x.k || y.v !== x.v) out.add(`${it.id}|${i}`); });
  }
  return out;
}

/** Одно неизвестное: корни по сетке вокруг текущего значения, ближайшие — первыми */
function roots1(F, x0) {
  const g = (x) => { const r = F([x]); return r ? r[0] : null; };
  const STEPS = 120, lo = x0 / 40, hi = x0 * 40, grid = [];
  for (let i = 0; i <= STEPS; i++) {
    const x = Number(dec(lo * Math.pow(hi / lo, i / STEPS), 3)?.toNumber());
    const v = Number.isFinite(x) ? g(x) : null;
    if (v !== null) grid.push({ x, g: v });
  }
  const out = [];
  for (let i = 0; i + 1 < grid.length; i++) {
    let a = grid[i], b = grid[i + 1];
    if (a.g === 0) { out.push(a.x); continue; }
    if (a.g * b.g >= 0) continue;
    for (let it = 0; it < 40 && (b.x - a.x) / a.x > 2e-7; it++) {
      const x = Number(dec((a.x + b.x) / 2, 8)?.toNumber());
      if (!Number.isFinite(x) || x === a.x || x === b.x) break;
      const v = g(x);
      if (v === null) break;
      if (v === 0) { a = b = { x, g: 0 }; break; }
      if (v * a.g < 0) b = { x, g: v }; else a = { x, g: v };
    }
    out.push(a === b ? a.x : a.x - (a.g * (b.x - a.x)) / (b.g - a.g));
  }
  return out.sort((r1, r2) => Math.abs(Math.log(r1 / x0)) - Math.abs(Math.log(r2 / x0)));
}

/** Несколько неизвестных: метод Ньютона в логарифмах размеров из нескольких начальных точек */
function rootsN(F, x0) {
  const out = [];
  const norm = (r) => Math.max(...r.map(Math.abs));
  for (const k of [1, 0.5, 2, 0.25, 4]) {
    let x = x0.map((v) => v * k), f = F(x);
    if (!f) continue;
    for (let it = 0; it < 60 && norm(f) > 1e-10; it++) {
      const h = 1e-4;
      const J = f.map(() => []);
      let bad = false;
      x.forEach((_, j) => {
        const xh = x.slice(); xh[j] *= Math.exp(h);
        const fh = F(xh);
        if (!fh) { bad = true; return; }
        fh.forEach((v, i) => { J[i][j] = (v - f[i]) / h; });
      });
      if (bad) break;
      let d = linsolve(J, f.map((v) => -v));
      if (!d) break;
      const big = Math.max(...d.map(Math.abs));
      if (big > 1) d = d.map((v) => v / big);
      let t = 1, moved = false;
      while (t > 1e-3) {
        const xn = x.map((v, j) => v * Math.exp(t * d[j])), fn = F(xn);
        if (fn && norm(fn) < norm(f)) { x = xn; f = fn; moved = true; break; }
        t /= 2;
      }
      if (!moved) break;
    }
    if (f && norm(f) < 1e-6 && !out.some((r) => r.every((v, j) => Math.abs(v / x[j] - 1) < 1e-4))) out.push(x);
    if (out.length) break;
  }
  return out;
}
