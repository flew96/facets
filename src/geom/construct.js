// Построения на фигуре: точки, сечения, перпендикуляры, сферы, расстояния и углы.
// Всё считается точно (см. math/num.js); числа с плавающей точкой используются
// только для упорядочивания вершин сечения и для рисования.
import { N, ZERO, ONE, parseNum, rootOf, sqrtNum, sumVals, fmtVal, fmtNum, fmtApprox, valToNumber, isPlain, unitStr } from '../math/num.js';
import { add, sub, scale, dot, cross, det, len2, lerp, isZeroVec, eqVec, toFloat, solve, rank } from '../math/vec.js';
import { polygonArea, facesVolume } from './solids.js';

/** Инструменты: сколько точек нужно выбрать и что каждая означает */
export const TOOLS = {
  point: { title: 'Точка на фигуре', hint: 'Кликните по вершине, ребру или грани', free: true },
  ratio: { title: 'Точка на отрезке', slots: ['начало отрезка', 'конец отрезка'] },
  center: { title: 'Центр грани', face: true, hint: 'Кликните по грани' },
  section: { title: 'Сечение', slots: ['1-я точка плоскости', '2-я точка плоскости', '3-я точка плоскости'] },
  perpPlane: { title: 'Перпендикуляр к плоскости', slots: ['точка, из которой опускаем', '1-я точка плоскости', '2-я точка плоскости', '3-я точка плоскости'] },
  perpLine: { title: 'Перпендикуляр к прямой', slots: ['точка, из которой опускаем', '1-я точка прямой', '2-я точка прямой'] },
  commonPerp: { title: 'Общий перпендикуляр', slots: ['1-я прямая: первая точка', '1-я прямая: вторая точка', '2-я прямая: первая точка', '2-я прямая: вторая точка'] },
  sphereIn: { title: 'Вписанная сфера', slots: [] },
  sphereOut: { title: 'Описанная сфера', slots: [] },
  dist: { title: 'Расстояние', slots: ['первая точка', 'вторая точка'] },
  angleLL: { title: 'Угол между прямыми', slots: ['1-я прямая: первая точка', '1-я прямая: вторая точка', '2-я прямая: первая точка', '2-я прямая: вторая точка'] },
  angleLP: { title: 'Угол между прямой и плоскостью', slots: ['прямая: первая точка', 'прямая: вторая точка', '1-я точка плоскости', '2-я точка плоскости', '3-я точка плоскости'] },
  anglePP: { title: 'Угол между плоскостями', slots: ['1-я плоскость: точка 1', '1-я плоскость: точка 2', '1-я плоскость: точка 3', '2-я плоскость: точка 1', '2-я плоскость: точка 2', '2-я плоскость: точка 3'] },
  secPar: { title: 'Сечение ∥ плоскости', slots: ['точка, через которую пройдёт сечение', '1-я точка плоскости', '2-я точка плоскости', '3-я точка плоскости'] },
  secPerp: { title: 'Сечение ⟂ прямой', slots: ['точка, через которую пройдёт сечение', '1-я точка прямой', '2-я точка прямой'] },
  secPar2: { title: 'Сечение ∥ двум прямым', slots: ['точка, через которую пройдёт сечение', '1-я прямая: первая точка', '1-я прямая: вторая точка', '2-я прямая: первая точка', '2-я прямая: вторая точка'] },
  parLine: { title: 'Прямая ∥ прямой', slots: ['точка, через которую проводим прямую', '1-я точка данной прямой', '2-я точка данной прямой'] },
  perpLineThru: { title: 'Прямая ⟂ прямой', slots: ['точка, через которую проводим прямую', '1-я точка данной прямой', '2-я точка данной прямой'] },
  linePlane: { title: 'Пересечение прямой и плоскости', slots: ['1-я точка прямой', '2-я точка прямой', '1-я точка плоскости', '2-я точка плоскости', '3-я точка плоскости'] },
  pyrVol: { title: 'Объём пирамиды', slots: ['вершина пирамиды', '1-я точка основания', '2-я точка основания', '3-я точка основания'] },
  normLine: { title: 'Прямая ⟂ плоскости', slots: ['точка, через которую проводим прямую', '1-я точка плоскости', '2-я точка плоскости', '3-я точка плоскости'] },
};

// С какого слота начинается тройка точек плоскости: вместо трёх точек
// можно одним кликом выбрать грань или уже построенное сечение.
const PLANE_AT = { perpPlane: [1], angleLP: [2], anglePP: [0, 3], secPar: [1], normLine: [1], linePlane: [2], pyrVol: [1] };
for (const [k, v] of Object.entries(PLANE_AT)) TOOLS[k].planeAt = v;

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const subscript = (k) => (k ? String(k).replace(/\d/g, (d) => SUB[d]) : '');
export const POINT_POOL = 'KLMNPQRTEFGUVWXYZ';

export function refsOf(item) {
  if (item.kind === 'point') return item.def.t === 'ratio' ? [item.def.a, item.def.b] : [];
  return item.refs || [];
}
const ownerOf = (ref) => (ref[0] === 'v' ? null : ref.split(':')[0]);

/** id построения и всех построений, которые от него зависят */
export function withDependents(items, id) {
  const dead = new Set([id]);
  for (const it of items) if (refsOf(it).some((r) => dead.has(ownerOf(r)))) dead.add(it.id);
  return dead;
}

// deg — размерность: 1 — длина, 2 — площадь, 3 — объём, 0 — безразмерная величина.
// Если размеры фигуры заданы буквой, значение — коэффициент при этой степени буквы.
const row = (S, k, val, deg = 0) => {
  const u = unitStr(S.unit, deg);
  // val и deg нужны, чтобы величину можно было задать и подогнать под неё фигуру (см. fit.js)
  return { k, v: fmtVal(val, u), a: isPlain(val) ? '' : fmtApprox(valToNumber(val)) + (u ? '·' + u : ''), val, deg };
};
const lenStr = (S, val) => fmtVal(val, unitStr(S.unit, 1));
const text = (k, v) => ({ k, v, a: '' });

export function evaluate(solid, items, handlers = EVAL) {
  const points = new Map();
  const used = new Set(solid.names);
  solid.verts.forEach((pos, i) => points.set('v' + i, { ref: 'v' + i, name: solid.names[i], pos, role: 'vertex' }));
  for (const it of items) if (it.kind === 'point') used.add(it.name);

  const ctx = {
    solid, points, used, results: new Map(),
    get(ref) {
      const p = points.get(ref);
      if (!p) throw new Error('Исходная точка недоступна: построение, от которого она зависит, не получилось.');
      return p;
    },
    alloc(pool) {
      for (let k = 0; ; k++) for (const c of pool) {
        const name = c + subscript(k);
        if (!used.has(name)) { used.add(name); return name; }
      }
    },
    /** Регистрирует точку-результат; если она совпала с уже известной — возвращает её */
    reg(item, key, pos, pool) {
      const ref = `${item.id}:${key}`;
      let p = [...new Set(points.values())].find((q) => eqVec(q.pos, pos));
      if (!p) p = { ref, name: ctx.alloc(pool), pos, role: 'derived', item: item.id };
      points.set(ref, p);
      return p;
    },
  };

  for (const it of items) {
    let res;
    try {
      if (!handlers[it.kind]) throw new Error('Это построение неприменимо к выбранной фигуре.');
      res = handlers[it.kind](it, ctx);
    } catch (e) { res = { error: e.message }; }
    ctx.results.set(it.id, { rows: [], notes: [], draw: {}, ...res });
  }
  return ctx;
}

// ───────────────────────── вспомогательная геометрия ─────────────────────────

function planeOf(ctx, refs) {
  const [a, b, c] = refs.map((r) => ctx.get(r));
  const n = cross(sub(b.pos, a.pos), sub(c.pos, a.pos));
  if (isZeroVec(n)) {
    for (const [p, q] of [[a, b], [a, c], [b, c]]) {
      if (eqVec(p.pos, q.pos)) throw new Error(`Точки ${p.name} и ${q.name} совпадают — тремя такими точками плоскость не задаётся.`);
    }
    throw new Error(`Точки ${a.name}, ${b.name} и ${c.name} лежат на одной прямой — через них проходит бесконечно много плоскостей.`);
  }
  const name = `(${a.name}${b.name}${c.name})`;
  return { n, d: dot(n, a.pos), name, pts: [a, b, c], label: `Плоскость ${name}`, title: `Сечение ${name}` };
}

function lineOf(ctx, refs) {
  const [a, b] = refs.map((r) => ctx.get(r));
  const u = sub(b.pos, a.pos);
  if (isZeroVec(u)) throw new Error(`Точки ${a.name} и ${b.name} совпадают — прямая через них не определена.`);
  return { a, b, u, name: `${a.name}${b.name}` };
}

/** Отрезки для прямой AB и её продолжения до точки с параметром t */
function lineSegs(l, t, foot) {
  const segs = [{ a: l.a.pos, b: l.b.pos, cls: 'aux' }];
  if (t.sign() < 0) segs.push({ a: foot, b: l.a.pos, cls: 'ext' });
  if (t.cmp(ONE) > 0) segs.push({ a: l.b.pos, b: foot, cls: 'ext' });
  return segs;
}
const outside = (t) => t.sign() < 0 || t.cmp(ONE) > 0;

/** Пересечение прямой P + t·u с фигурой: отрезок [t₀; t₁] или null, если прямая проходит мимо или только касается */
function chord(S, P, u) {
  let lo = null, hi = null;
  for (const pl of S.planes) {
    // внутренность фигуры: n·x ≤ d  ⇒  t·(n·u) ≤ d − n·P
    const a = dot(pl.n, u), b = pl.d.sub(dot(pl.n, P));
    if (a.isZero()) { if (b.sign() < 0) return null; continue; }
    const t = b.div(a);
    if (a.sign() > 0) { if (!hi || t.cmp(hi) < 0) hi = t; } else if (!lo || t.cmp(lo) > 0) lo = t;
  }
  return lo && hi && lo.cmp(hi) < 0 ? [lo, hi] : null;
}

/** Где на поверхности фигуры лежит точка: «вершина A», «ребро AB», «грань ABC» */
function whereOnSurface(S, pos) {
  const on = S.planes.map((pl, i) => (dot(pl.n, pos).eq(pl.d) ? i : -1)).filter((i) => i >= 0);
  const vi = S.verts.findIndex((v) => eqVec(v, pos));
  if (vi >= 0) return `вершина ${S.names[vi]}`;
  if (on.length >= 2) {
    const common = S.faces[on[0]].filter((i) => S.faces[on[1]].includes(i)).sort((x, y) => x - y);
    if (common.length === 2) return `ребро ${S.names[common[0]]}${S.names[common[1]]}`;
  }
  return on.length ? `грань ${S.faceNames[on[0]]}` : '';
}

/**
 * Прямая через P с направлением u: отмечаем точки, где она входит в фигуру и выходит из неё,
 * чтобы прямую можно было использовать в следующих построениях (две точки задают прямую).
 */
function lineThrough(it, ctx, P, u, title) {
  const S = ctx.solid;
  const ch = chord(S, P.pos, u);
  const rows = [], notes = [], segs = [];
  if (ch) {
    const X = ctx.reg(it, 'X', add(P.pos, scale(u, ch[0])), POINT_POOL);
    const Y = ctx.reg(it, 'Y', add(P.pos, scale(u, ch[1])), POINT_POOL);
    segs.push({ a: X.pos, b: Y.pos, cls: 'main' });
    if (ch[0].sign() > 0) segs.push({ a: P.pos, b: X.pos, cls: 'ext' });
    if (ch[1].sign() < 0) segs.push({ a: Y.pos, b: P.pos, cls: 'ext' });
    const at = (Q) => { const w = whereOnSurface(S, Q.pos); return !w ? Q.name : w === `вершина ${Q.name}` ? w : `${Q.name} (${w})`; };
    rows.push(text('Пересекает поверхность', `${at(X)} и ${at(Y)}`), row(S, `Длина ${X.name}${Y.name}`, rootOf(len2(sub(Y.pos, X.pos))), 1));
    notes.push(`Прямую ${X.name}${Y.name} можно выбирать в других построениях — кликните по точкам ${X.name} и ${Y.name}.`);
    if (ch[0].sign() > 0 || ch[1].sign() < 0) notes.push(`Точка ${P.name} лежит вне фигуры, пунктиром показано продолжение прямой до неё.`);
  } else {
    const Q = ctx.reg(it, 'Q', add(P.pos, u), POINT_POOL);
    segs.push({ a: P.pos, b: Q.pos, cls: 'main' });
    notes.push(`Прямая не проходит внутри фигуры (самое большее касается её поверхности). Для дальнейших построений на ней отмечена точка ${Q.name}: прямая — ${P.name}${Q.name}.`);
  }
  return { title, rows, notes, draw: { segs } };
}

const NGON = { 3: 'треугольник', 4: 'четырёхугольник', 5: 'пятиугольник', 6: 'шестиугольник', 7: 'семиугольник', 8: 'восьмиугольник' };

export function classifyPolygon(pts) {
  const n = pts.length;
  const e = pts.map((p, i) => sub(pts[(i + 1) % n], p));
  const L = e.map(len2);
  const perp = (i, j) => dot(e[i], e[j]).isZero();
  const par = (i, j) => isZeroVec(cross(e[i], e[j]));
  if (n === 3) {
    if (L[0].eq(L[1]) && L[1].eq(L[2])) return 'равносторонний треугольник';
    const iso = L[0].eq(L[1]) || L[1].eq(L[2]) || L[0].eq(L[2]);
    const right = perp(0, 1) || perp(1, 2) || perp(2, 0);
    return `${iso ? 'равнобедренный ' : ''}${right ? 'прямоугольный ' : ''}треугольник`;
  }
  if (n === 4) {
    const p1 = par(0, 2), p2 = par(1, 3);
    if (p1 && p2) {
      const right = perp(0, 1), rh = L[0].eq(L[1]);
      return right && rh ? 'квадрат' : right ? 'прямоугольник' : rh ? 'ромб' : 'параллелограмм';
    }
    if (p1 || p2) {
      const [l1, l2, b] = p1 ? [1, 3, 0] : [0, 2, 1];
      if (L[l1].eq(L[l2])) return 'равнобедренная трапеция';
      if (perp(l1, b) || perp(l2, b)) return 'прямоугольная трапеция';
      return 'трапеция';
    }
    return 'четырёхугольник';
  }
  const c = scale(pts.reduce(add), N(n).inv());
  const r = pts.map((p) => len2(sub(p, c)));
  const regular = L.every((x) => x.eq(L[0])) && r.every((x) => x.eq(r[0]));
  return (regular ? 'правильный ' : '') + (NGON[n] || `${n}-угольник`);
}

/** Отсечение выпуклого многоугольника полуплоскостью f ≥ 0 (f — значения в вершинах) */
function clip(poly, f) {
  const out = [];
  poly.forEach((p, i) => {
    const j = (i + 1) % poly.length;
    const si = f[i].sign(), sj = f[j].sign();
    if (si >= 0) out.push(p);
    if (si * sj < 0) out.push(lerp(p, poly[j], f[i].div(f[i].sub(f[j]))));
  });
  return out;
}

const SPECIAL = [[N(0), 90], [N('1/4'), 60], [N('1/2'), 45], [N('3/4'), 30], [N(1), 0]];

/** Строки результата для угла по cos² (или sin²) */
function angleRows(x2, fn) {
  // для подгонки угол хранится как cos² φ
  const fit = { val: fn === 'cos' ? x2 : ONE.sub(x2), deg: 'angle' };
  const hit = SPECIAL.find(([v]) => v.eq(x2));
  const val = rootOf(x2);
  const s = fmtVal(val);
  if (hit) {
    const deg = fn === 'cos' ? hit[1] : 90 - hit[1];
    return [{ ...text('Угол φ', `${deg}°`), ...fit }, text(`${fn} φ`, s)];
  }
  const x = Math.sqrt(x2.toNumber());
  const deg = ((fn === 'cos' ? Math.acos(x) : Math.asin(x)) * 180) / Math.PI;
  const arg = /[ /]/.test(s) ? `(${s})` : ` ${s}`;
  return [{ k: 'Угол φ', v: `arc${fn}${arg}`, a: fmtApprox(deg, 2) + '°', ...fit }, { k: `${fn} φ`, v: s, a: fmtApprox(x) }];
}

// ─────────────────────────────── построения ───────────────────────────────

export const EVAL = {
  point(it, ctx) {
    const S = ctx.solid, d = it.def;
    let pos, desc, draw = {};
    if (d.t === 'ratio') {
      const a = ctx.get(d.a), b = ctx.get(d.b);
      const m = parseNum(d.m), n = parseNum(d.n);
      if (m.sign() < 0 || n.sign() < 0 || m.add(n).isZero()) throw new Error('Отношение должно состоять из неотрицательных чисел, не равных нулю одновременно.');
      pos = lerp(a.pos, b.pos, m.div(m.add(n)));
      desc = m.eq(n) ? `середина ${a.name}${b.name}` : `${a.name}${it.name} : ${it.name}${b.name} = ${fmtNum(m)} : ${fmtNum(n)}`;
      // отрезок рисуем, только если он не ребро фигуры (ребро уже начерчено)
      const onEdge = a.role === 'vertex' && b.role === 'vertex' && S.edges.some(([i, j]) => [`v${i}v${j}`, `v${j}v${i}`].includes(a.ref + b.ref));
      if (!onEdge) draw = { segs: [{ a: a.pos, b: b.pos, cls: 'aux' }] };
    } else {
      const f = S.faces[d.f].map((i) => S.verts[i]);
      if (d.t === 'center') {
        pos = scale(f.reduce(add), N(f.length).inv());
        desc = `центр грани ${S.faceNames[d.f]}`;
      } else {
        pos = add(f[0], add(scale(sub(f[1], f[0]), N(d.u)), scale(sub(f[f.length - 1], f[0]), N(d.v))));
        desc = `на грани ${S.faceNames[d.f]}`;
      }
    }
    ctx.points.set(it.id, { ref: it.id, name: it.name, pos, role: 'user', item: it.id });
    return { title: `Точка ${it.name}`, rows: [text('Положение', desc)], draw };
  },

  section: (it, ctx) => sectionOf(it, ctx, planeOf(ctx, it.refs)),

  secPar(it, ctx) {
    const P = ctx.get(it.refs[0]), base = planeOf(ctx, it.refs.slice(1));
    return sectionOf(it, ctx, { n: base.n, d: dot(base.n, P.pos), pts: [P], label: 'Плоскость сечения', title: `Сечение через ${P.name} ∥ ${base.name}` });
  },

  secPerp(it, ctx) {
    const P = ctx.get(it.refs[0]), l = lineOf(ctx, it.refs.slice(1));
    return sectionOf(it, ctx, { n: l.u, d: dot(l.u, P.pos), pts: [P], label: 'Плоскость сечения', title: `Сечение через ${P.name} ⟂ ${l.name}` });
  },

  secPar2(it, ctx) {
    const P = ctx.get(it.refs[0]), l1 = lineOf(ctx, it.refs.slice(1, 3)), l2 = lineOf(ctx, it.refs.slice(3));
    const title = `Сечение через ${P.name} ∥ ${l1.name} и ${l2.name}`;
    const n = cross(l1.u, l2.u);
    if (isZeroVec(n)) {
      return { title, error: `Прямые ${l1.name} и ${l2.name} параллельны${isZeroVec(cross(sub(l2.a.pos, l1.a.pos), l1.u)) ? ' (совпадают)' : ''}: плоскостей через ${P.name}, параллельных обеим, бесконечно много — годится любая плоскость, содержащая прямую через ${P.name} параллельно ${l1.name}. Чтобы сечение было единственным, прямые должны пересекаться или скрещиваться.` };
    }
    const res = sectionOf(it, ctx, { n, d: dot(n, P.pos), pts: [P], label: 'Плоскость сечения', title });
    const onLine = (l) => isZeroVec(cross(sub(P.pos, l.a.pos), l.u));
    const extra = [];
    const on1 = onLine(l1), on2 = onLine(l2);
    if (on1 && on2) extra.push(`Точка ${P.name} лежит на обеих прямых: сечение — это плоскость, проходящая через ${l1.name} и ${l2.name}.`);
    else if (on1 || on2) {
      const [a, b] = on1 ? [l1, l2] : [l2, l1];
      extra.push(`Точка ${P.name} лежит на прямой ${a.name}, поэтому плоскость содержит ${a.name}: это сечение через ${a.name} параллельно ${b.name}.`);
    } else if (!det(sub(l2.a.pos, l1.a.pos), l1.u, l2.u).isZero()) extra.push(`Прямые ${l1.name} и ${l2.name} скрещиваются; плоскость сечения параллельна обеим.`);
    else extra.push(`Прямые ${l1.name} и ${l2.name} пересекаются; плоскость сечения параллельна их плоскости.`);
    res.notes = [...extra, ...(res.notes || [])];
    return res;
  },

  parLine(it, ctx) {
    const P = ctx.get(it.refs[0]), l = lineOf(ctx, it.refs.slice(1));
    const title = `Прямая через ${P.name} ∥ ${l.name}`;
    if (isZeroVec(cross(sub(P.pos, l.a.pos), l.u))) return { title, error: `Точка ${P.name} лежит на прямой ${l.name}: параллельная прямая через неё совпадает с ${l.name}.` };
    return lineThrough(it, ctx, P, l.u, title);
  },

  perpLineThru(it, ctx) {
    const P = ctx.get(it.refs[0]), l = lineOf(ctx, it.refs.slice(1));
    const title = `Прямая через ${P.name} ⟂ ${l.name}`;
    const t = dot(sub(P.pos, l.a.pos), l.u).div(len2(l.u));
    const foot = add(l.a.pos, scale(l.u, t));
    if (eqVec(foot, P.pos)) {
      return { title, error: `Точка ${P.name} лежит на прямой ${l.name}: перпендикуляров к ${l.name} через неё бесконечно много (они заполняют плоскость). Выберите точку вне прямой или задайте плоскость перпендикуляра инструментом «Сечение ⟂ прямой».` };
    }
    const H = ctx.reg(it, 'H', foot, 'H');
    const res = lineThrough(it, ctx, P, sub(foot, P.pos), title);
    const other = eqVec(l.a.pos, foot) ? l.b.pos : l.a.pos;
    res.draw.segs.push(...lineSegs(l, t, foot));
    res.draw.marks = [{ at: foot, u: sub(P.pos, foot), v: sub(other, foot) }];
    res.rows.unshift(text('Пересекает прямую ' + l.name, `в точке ${H.name}`), row(ctx.solid, `Расстояние ${P.name}${H.name}`, rootOf(len2(sub(P.pos, foot))), 1));
    if (outside(t)) res.notes.unshift(`Точка ${H.name} лежит на продолжении отрезка ${l.name}.`);
    return res;
  },

  normLine(it, ctx) {
    const P = ctx.get(it.refs[0]), pl = planeOf(ctx, it.refs.slice(1));
    const title = `Прямая через ${P.name} ⟂ ${pl.name}`;
    const k = dot(pl.n, P.pos).sub(pl.d), nn = len2(pl.n);
    const foot = sub(P.pos, scale(pl.n, k.div(nn)));
    if (!k.isZero()) ctx.reg(it, 'H', foot, 'H');
    // направление — PH, а если P в плоскости — нормаль, делённая на наибольшую по модулю координату (чтобы длина была порядка 1)
    const abs = (x) => (x.sign() < 0 ? x.neg() : x);
    const big = pl.n.reduce((m, x) => (abs(x).cmp(m) > 0 ? abs(x) : m), ZERO);
    const res = lineThrough(it, ctx, P, k.isZero() ? scale(pl.n, big.inv()) : sub(foot, P.pos), title);
    res.draw.polys = [{ pts: pl.pts.map((p) => p.pos), cls: 'ghost' }];
    const anchor = pl.pts.find((p) => !eqVec(p.pos, foot)).pos;
    res.draw.marks = [{ at: foot, u: pl.n, v: sub(anchor, foot) }];
    if (k.isZero()) res.rows.unshift(text('Пересекает плоскость', `в точке ${P.name}`));
    else {
      const H = ctx.points.get(`${it.id}:H`);
      res.rows.unshift(text('Пересекает плоскость', `в точке ${H.name}`), row(ctx.solid, `Расстояние ${P.name}${H.name}`, rootOf(k.sq().div(nn)), 1));
    }
    return res;
  },

  sectionBody(it, ctx, pl) {
    const S = ctx.solid;
    const f = S.verts.map((v) => dot(pl.n, v).sub(pl.d));
    const sg = f.map((x) => x.sign());
    const title = pl.title;
    const ghost = pl.pts.length >= 3 ? { polys: [{ pts: pl.pts.map((p) => p.pos), cls: 'ghost' }] } : {};

    let pts = [];
    const push = (p) => { if (!pts.some((q) => eqVec(q, p))) pts.push(p); };
    sg.forEach((s, i) => { if (s === 0) push(S.verts[i]); });
    for (const [i, j] of S.edges) if (sg[i] * sg[j] < 0) push(lerp(S.verts[i], S.verts[j], f[i].div(f[i].sub(f[j]))));

    if (pts.length < 3) {
      const on = sg.map((s, i) => (s === 0 ? S.names[i] : null)).filter(Boolean);
      const error = pts.length === 0
        ? `${pl.label} проходит мимо фигуры: все вершины лежат по одну сторону от неё, сечения нет.`
        : pts.length === 1
          ? `${pl.label} имеет с фигурой единственную общую точку — вершину ${on[0]}. Сечения нет.`
          : `${pl.label} касается фигуры по ребру ${on.join('')}: сечение вырождается в отрезок.`;
      return { title, error, draw: ghost };
    }

    // упорядочиваем вершины по углу вокруг центра (порядок — не метрика, тут можно float)
    const fp = pts.map(toFloat), nf = toFloat(pl.n);
    const c = [0, 1, 2].map((k) => fp.reduce((s, p) => s + p[k], 0) / fp.length);
    const rel = fp.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
    const e1 = rel[0];
    const e2 = [nf[1] * e1[2] - nf[2] * e1[1], nf[2] * e1[0] - nf[0] * e1[2], nf[0] * e1[1] - nf[1] * e1[0]];
    const k2 = Math.hypot(...e1) / Math.hypot(...e2);
    const ang = rel.map((r) => Math.atan2((r[0] * e2[0] + r[1] * e2[1] + r[2] * e2[2]) * k2, r[0] * e1[0] + r[1] * e1[1] + r[2] * e1[2]));
    pts = pts.map((p, i) => [p, ang[i]]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    // обход начинаем с первой из заданных точек, если она — вершина сечения
    const first = pts.findIndex((p) => pl.pts.some((q) => eqVec(q.pos, p)));
    if (first > 0) pts = [...pts.slice(first), ...pts.slice(0, first)];

    const named = pts.map((p, i) => ctx.reg(it, 'k' + i, p, POINT_POOL));
    const names = named.map((p) => p.name);
    const sides = pts.map((p, i) => rootOf(len2(sub(pts[(i + 1) % pts.length], p))));
    const rows = [
      text('Форма', `${classifyPolygon(pts)} ${names.join('')}`),
      row(S, 'Площадь', polygonArea(pts), 2),
      row(S, 'Периметр', sumVals(sides), 1),
    ];
    const notes = [];

    const pos = sg.findIndex((s) => s > 0), neg = sg.findIndex((s) => s < 0);
    if (pos < 0 || neg < 0) {
      notes.push('Плоскость содержит грань фигуры: сечение совпадает с этой гранью и не делит фигуру на части.');
    } else {
      const part = S.faces.map((face) => clip(face.map((i) => S.verts[i]), face.map((i) => f[i]))).filter((q) => q.length >= 3);
      const v1 = facesVolume(part, pl.pts[0].pos), v2 = S.volume.sub(v1);
      rows.push(row(S, `V₁ (часть с вершиной ${S.names[pos]})`, v1, 3), row(S, `V₂ (часть с вершиной ${S.names[neg]})`, v2, 3));
      const r = v1.div(v2);
      const [p, q] = r.rational();
      rows.push(r.isRational() ? text('V₁ : V₂', `${p} : ${q}`) : row(S, 'V₁ / V₂', r));
    }
    return {
      title, rows, notes,
      draw: {
        polys: [{ pts, cls: 'section' }],
        segs: pts.map((p, i) => ({ a: p, b: pts[(i + 1) % pts.length], cls: 'main' })),
      },
      section: { pts, names, sides, n: pl.n, d: pl.d, onFace: pos < 0 || neg < 0, given: pl.pts.map((p) => ({ name: p.name, pos: p.pos })) },
    };
  },

  perpPlane(it, ctx) {
    const P = ctx.get(it.refs[0]);
    const pl = planeOf(ctx, it.refs.slice(1));
    const title = `Перпендикуляр из ${P.name} к ${pl.name}`;
    const draw = { polys: [{ pts: pl.pts.map((p) => p.pos), cls: 'ghost' }] };
    const k = dot(pl.n, P.pos).sub(pl.d), nn = len2(pl.n);
    if (k.isZero()) return { title, rows: [text('Расстояние', '0')], notes: [`Точка ${P.name} лежит в плоскости ${pl.name}.`], draw };
    const H = ctx.reg(it, 'H', sub(P.pos, scale(pl.n, k.div(nn))), 'H');
    const anchor = pl.pts.find((p) => !eqVec(p.pos, H.pos));
    draw.segs = [{ a: P.pos, b: H.pos, cls: 'main' }, { a: H.pos, b: anchor.pos, cls: 'ext' }];
    draw.marks = [{ at: H.pos, u: sub(P.pos, H.pos), v: sub(anchor.pos, H.pos) }];
    return {
      title, draw,
      rows: [row(ctx.solid, `Расстояние ${P.name}${H.name}`, rootOf(k.sq().div(nn)), 1), text('Основание', `точка ${H.name}`)],
    };
  },

  perpLine(it, ctx) {
    const P = ctx.get(it.refs[0]);
    const l = lineOf(ctx, it.refs.slice(1));
    const title = `Перпендикуляр из ${P.name} к прямой ${l.name}`;
    const t = dot(sub(P.pos, l.a.pos), l.u).div(len2(l.u));
    const foot = add(l.a.pos, scale(l.u, t));
    const draw = { segs: lineSegs(l, t, foot) };
    if (eqVec(foot, P.pos)) return { title, rows: [text('Расстояние', '0')], notes: [`Точка ${P.name} лежит на прямой ${l.name}.`], draw };
    const H = ctx.reg(it, 'H', foot, 'H');
    draw.segs.push({ a: P.pos, b: foot, cls: 'main' });
    const other = eqVec(l.a.pos, foot) ? l.b.pos : l.a.pos;
    draw.marks = [{ at: foot, u: sub(P.pos, foot), v: sub(other, foot) }];
    return {
      title, draw,
      rows: [row(ctx.solid, `Расстояние ${P.name}${H.name}`, rootOf(len2(sub(P.pos, foot))), 1), text('Основание', `точка ${H.name}`)],
      notes: outside(t) ? [`Основание ${H.name} лежит на продолжении отрезка ${l.name}.`] : [],
    };
  },

  linePlane(it, ctx) {
    const l = lineOf(ctx, it.refs.slice(0, 2)), pl = planeOf(ctx, it.refs.slice(2));
    const title = `Пересечение ${l.name} и ${pl.name}`;
    const draw = { polys: [{ pts: pl.pts.map((p) => p.pos), cls: 'ghost' }], segs: [{ a: l.a.pos, b: l.b.pos, cls: 'aux' }] };
    const nu = dot(pl.n, l.u), k = pl.d.sub(dot(pl.n, l.a.pos));
    if (nu.isZero()) return { title, draw, error: k.isZero() ? `Прямая ${l.name} лежит в плоскости ${pl.name}: общих точек бесконечно много.` : `Прямая ${l.name} параллельна плоскости ${pl.name} и не пересекает её.` };
    const t = k.div(nu), pos = add(l.a.pos, scale(l.u, t));
    const X = ctx.reg(it, 'X', pos, POINT_POOL);
    draw.segs = lineSegs(l, t, pos);
    const rows = [text('Точка пересечения', X.name)];
    const notes = [];
    if (t.sign() > 0 && t.cmp(ONE) < 0) {
      // делит отрезок AB в отношении AX : XB = t : (1 − t)
      const r = t.div(ONE.sub(t));
      const v = r.isRational() ? `${r.rational()[0]} : ${r.rational()[1]}` : fmtNum(r);
      rows.push(text(`${l.a.name}${X.name} : ${X.name}${l.b.name}`, v));
    } else if (outside(t)) notes.push(`Точка ${X.name} лежит на продолжении отрезка ${l.name}.`);
    rows.push(row(ctx.solid, `${l.a.name}${X.name}`, rootOf(len2(sub(pos, l.a.pos))), 1));
    return { title, rows, notes, draw };
  },

  pyrVol(it, ctx) {
    const P = ctx.get(it.refs[0]), base = it.refs.slice(1).map((r) => ctx.get(r));
    // основание — готовое сечение или грань, если плоскость выбрана кликом по ним, иначе треугольник из трёх точек
    const owner = ownerOf(it.refs[1]);
    const sec = owner ? ctx.results.get(owner)?.section : null;
    const S = ctx.solid;
    let pts = base.map((p) => p.pos), names = base.map((p) => p.name);
    if (sec && it.refs.slice(1).every((r) => ownerOf(r) === owner)) { pts = sec.pts; names = sec.names; }
    else {
      const fi = S.faces.findIndex((f) => it.refs.slice(1).every((r) => r[0] === 'v' && f.includes(+r.slice(1))));
      if (fi >= 0) { pts = S.faces[fi].map((i) => S.verts[i]); names = S.faces[fi].map((i) => S.names[i]); }
    }
    let nrm = [ZERO, ZERO, ZERO];
    for (let i = 1; i + 1 < pts.length; i++) nrm = add(nrm, cross(sub(pts[i], pts[0]), sub(pts[i + 1], pts[0])));
    const title = `Пирамида ${P.name}${names.join('')}`;
    if (isZeroVec(nrm)) return { title, error: 'Точки основания лежат на одной прямой — основания нет.' };
    const k = dot(nrm, sub(P.pos, pts[0])), kk = k.sign() < 0 ? k.neg() : k;
    if (k.isZero()) return { title, error: `Точка ${P.name} лежит в плоскости основания — пирамида вырождается.` };
    const nn = len2(nrm);
    return {
      title,
      rows: [
        row(S, 'Объём', kk.div(N(6)), 3),
        row(S, 'Площадь основания', rootOf(nn.div(N(4))), 2),
        row(S, 'Высота', rootOf(k.sq().div(nn)), 1),
      ],
      notes: ['V = ⅓·S·h, где h — расстояние от вершины до плоскости основания.'],
      draw: { polys: [{ pts, cls: 'ghost' }], segs: pts.map((q) => ({ a: P.pos, b: q, cls: 'main' })) },
    };
  },

  commonPerp(it, ctx) {
    const l1 = lineOf(ctx, it.refs.slice(0, 2)), l2 = lineOf(ctx, it.refs.slice(2));
    const title = `Общий перпендикуляр к ${l1.name} и ${l2.name}`;
    const w = cross(l1.u, l2.u), ca = sub(l2.a.pos, l1.a.pos);
    if (isZeroVec(w)) {
      if (isZeroVec(cross(ca, l1.u))) return { title, error: `Прямые ${l1.name} и ${l2.name} совпадают.` };
      const t = dot(sub(l1.a.pos, l2.a.pos), l2.u).div(len2(l2.u));
      const foot = add(l2.a.pos, scale(l2.u, t));
      const H = ctx.reg(it, 'H', foot, 'H');
      return {
        title,
        rows: [row(ctx.solid, 'Расстояние между прямыми', rootOf(len2(sub(l1.a.pos, foot))), 1)],
        notes: [`Прямые ${l1.name} и ${l2.name} параллельны: общих перпендикуляров бесконечно много, показан один из них — ${l1.a.name}${H.name}.`],
        draw: {
          segs: [{ a: l1.a.pos, b: l1.b.pos, cls: 'aux' }, ...lineSegs(l2, t, foot), { a: l1.a.pos, b: foot, cls: 'main' }],
          marks: [{ at: foot, u: sub(l1.a.pos, foot), v: l2.u }],
        },
      };
    }
    const ww = len2(w), k = dot(ca, w);
    const s = det(ca, l2.u, w).div(ww), t = det(ca, l1.u, w).div(ww);
    const p1 = add(l1.a.pos, scale(l1.u, s)), p2 = add(l2.a.pos, scale(l2.u, t));
    const segs = [...lineSegs(l1, s, p1), ...lineSegs(l2, t, p2)];
    if (k.isZero()) {
      const X = ctx.reg(it, 'X', p1, POINT_POOL);
      return {
        title, draw: { segs },
        rows: [text('Расстояние', '0')],
        notes: [`Прямые ${l1.name} и ${l2.name} не скрещиваются, а пересекаются в точке ${X.name}.`],
      };
    }
    const H1 = ctx.reg(it, 'H1', p1, 'H'), H2 = ctx.reg(it, 'H2', p2, 'H');
    segs.push({ a: p1, b: p2, cls: 'main' });
    const notes = [];
    if (outside(s)) notes.push(`Точка ${H1.name} лежит на продолжении отрезка ${l1.name}.`);
    if (outside(t)) notes.push(`Точка ${H2.name} лежит на продолжении отрезка ${l2.name}.`);
    return {
      title, notes,
      rows: [row(ctx.solid, `Расстояние ${H1.name}${H2.name}`, rootOf(k.sq().div(ww)), 1), text('Общий перпендикуляр', `${H1.name}${H2.name}`)],
      draw: { segs, marks: [{ at: p1, u: sub(p2, p1), v: l1.u }, { at: p2, u: sub(p1, p2), v: l2.u }] },
    };
  },

  dist(it, ctx) {
    const [a, b] = it.refs.map((r) => ctx.get(r));
    return {
      title: `Отрезок ${a.name}${b.name}`,
      rows: [row(ctx.solid, 'Длина', rootOf(len2(sub(b.pos, a.pos))), 1)],
      draw: { segs: [{ a: a.pos, b: b.pos, cls: 'main' }] },
    };
  },

  angleLL(it, ctx) {
    const l1 = lineOf(ctx, it.refs.slice(0, 2)), l2 = lineOf(ctx, it.refs.slice(2));
    const d = dot(l1.u, l2.u);
    const notes = [];
    const ca = sub(l2.a.pos, l1.a.pos);
    if (isZeroVec(cross(l1.u, l2.u))) notes.push(isZeroVec(cross(ca, l1.u)) ? 'Прямые совпадают.' : 'Прямые параллельны.');
    else notes.push(det(ca, l1.u, l2.u).isZero() ? 'Прямые пересекаются.' : 'Прямые скрещиваются: угол между ними — это угол между параллельными им пересекающимися прямыми.');
    return {
      title: `Угол между ${l1.name} и ${l2.name}`,
      rows: angleRows(d.sq().div(len2(l1.u).mul(len2(l2.u))), 'cos'), notes,
      draw: { segs: [{ a: l1.a.pos, b: l1.b.pos, cls: 'main' }, { a: l2.a.pos, b: l2.b.pos, cls: 'main' }] },
    };
  },

  angleLP(it, ctx) {
    const l = lineOf(ctx, it.refs.slice(0, 2)), pl = planeOf(ctx, it.refs.slice(2));
    const d = dot(l.u, pl.n);
    const notes = [];
    if (d.isZero()) notes.push(dot(pl.n, l.a.pos).eq(pl.d) ? `Прямая ${l.name} лежит в плоскости ${pl.name}.` : `Прямая ${l.name} параллельна плоскости ${pl.name}.`);
    return {
      title: `Угол между ${l.name} и ${pl.name}`,
      rows: angleRows(d.sq().div(len2(l.u).mul(len2(pl.n))), 'sin'), notes,
      draw: { segs: [{ a: l.a.pos, b: l.b.pos, cls: 'main' }], polys: [{ pts: pl.pts.map((p) => p.pos), cls: 'ghost' }] },
    };
  },

  anglePP(it, ctx) {
    const p1 = planeOf(ctx, it.refs.slice(0, 3)), p2 = planeOf(ctx, it.refs.slice(3));
    const notes = [];
    if (isZeroVec(cross(p1.n, p2.n))) notes.push(dot(p1.n, p2.pts[0].pos).eq(p1.d) ? 'Плоскости совпадают.' : 'Плоскости параллельны.');
    return {
      title: `Угол между ${p1.name} и ${p2.name}`,
      rows: angleRows(dot(p1.n, p2.n).sq().div(len2(p1.n).mul(len2(p2.n))), 'cos'), notes,
      draw: { polys: [{ pts: p1.pts.map((p) => p.pos), cls: 'ghost' }, { pts: p2.pts.map((p) => p.pos), cls: 'ghost' }] },
    };
  },

  sphereOut(it, ctx) {
    const S = ctx.solid, V = S.verts;
    const title = 'Описанная сфера';
    // четыре вершины, не лежащие в одной плоскости
    const i1 = 1;
    const i2 = V.findIndex((v, i) => i > 1 && !isZeroVec(cross(sub(V[1], V[0]), sub(v, V[0]))));
    const nrm = cross(sub(V[i1], V[0]), sub(V[i2], V[0]));
    const i3 = V.findIndex((v) => !dot(nrm, sub(v, V[0])).isZero());
    const pick = [0, i1, i2, i3];
    const eqn = (v, o) => [scale(sub(v, o), N(2)), len2(v).sub(len2(o))];
    const sys = pick.slice(1).map((i) => eqn(V[i], V[0]));
    const c = solve(sys.map((e) => e[0]), sys.map((e) => e[1])).x;
    const r2 = len2(sub(c, V[0]));
    const bad = V.findIndex((v) => !len2(sub(c, v)).eq(r2));
    if (bad < 0) {
      const O = ctx.reg(it, 'O', c, 'O');
      const side = S.planes.map((p) => dot(p.n, c).sub(p.d).sign());
      const where = side.some((s) => s > 0) ? 'вне фигуры' : side.some((s) => s === 0) ? `на грани ${S.faceNames[side.indexOf(0)]}` : 'внутри фигуры';
      return {
        title,
        rows: [row(S, 'Радиус R', rootOf(r2), 1), text('Центр', `точка ${O.name} (${where})`)],
        draw: { spheres: [{ c, r: Math.sqrt(r2.toNumber()) }] },
      };
    }
    // Почему нет: ищем грань, вокруг которой нельзя описать окружность
    for (let fi = 0; fi < S.faces.length; fi++) {
      const f = S.faces[fi];
      if (f.length < 4) continue;
      const [a, b, d] = [V[f[0]], V[f[1]], V[f[2]]];
      const pl = S.planes[fi];
      const cc = solve([eqn(b, a)[0], eqn(d, a)[0], pl.n], [eqn(b, a)[1], eqn(d, a)[1], pl.d]).x;
      const rr = len2(sub(cc, a));
      const off = f.find((i) => !len2(sub(cc, V[i])).eq(rr));
      if (off === undefined) continue;
      return {
        title, absent: true,
        notes: [
          `Описанной сферы не существует. Любая плоскость пересекает сферу по окружности, поэтому вершины каждой грани должны лежать на одной окружности. Для грани ${S.faceNames[fi]} это не так: окружность через ${S.names[f[0]]}, ${S.names[f[1]]}, ${S.names[f[2]]} имеет радиус ${lenStr(S, rootOf(rr))}, а вершина ${S.names[off]} удалена от её центра на ${lenStr(S, rootOf(len2(sub(cc, V[off]))))}.`,
        ],
      };
    }
    return {
      title, absent: true,
      notes: [`Описанной сферы не существует: сфера через вершины ${pick.map((i) => S.names[i]).join(', ')} имеет радиус ${lenStr(S, rootOf(r2))}, но вершина ${S.names[bad]} удалена от её центра на ${lenStr(S, rootOf(len2(sub(c, V[bad]))))}. Точки, равноудалённой от всех вершин, нет.`],
    };
  },

  sphereIn(it, ctx) {
    const S = ctx.solid;
    const title = 'Вписанная сфера';
    // единичные внешние нормали граней: u·x + r = δ для центра x и радиуса r
    const rows = [], rhs = [];
    for (const pl of S.planes) {
      const len = sqrtNum(len2(pl.n));
      if (!len) throw new Error('При таких размерах длины нормалей к граням выражаются вложенными радикалами — точно найти вписанную сферу программа не может.');
      rows.push([...scale(pl.n, len.inv()), ONE]);
      rhs.push(pl.d.div(len));
    }
    const sol = solve(rows, rhs);
    if (sol.type === 'unique' && sol.x[3].sign() > 0) {
      const c = sol.x.slice(0, 3), r = sol.x[3];
      const O = ctx.reg(it, 'O', c, 'O');
      return {
        title,
        rows: [row(S, 'Радиус r', r, 1), text('Центр', `точка ${O.name}`)],
        notes: ['Отмечены точки касания сферы с гранями.'],
        draw: { spheres: [{ c, r: r.toNumber() }], dots: rows.map((u) => add(c, scale(u.slice(0, 3), r))) },
      };
    }
    // Почему нет: сфера, касающаяся четырёх граней, не касается пятой
    const sel = [];
    for (let i = 0; i < rows.length && sel.length < 4; i++) if (rank([...sel.map((j) => rows[j]), rows[i]]) > sel.length) sel.push(i);
    let why = 'внутри фигуры нет точки, равноудалённой от всех граней.';
    const cand = sel.length === 4 ? solve(sel.map((j) => rows[j]), sel.map((j) => rhs[j])) : null;
    if (cand && cand.type === 'unique' && cand.x[3].sign() > 0) {
      const c = cand.x.slice(0, 3), r = cand.x[3];
      for (let j = 0; j < rows.length; j++) {
        const dj = rhs[j].sub(dot(rows[j].slice(0, 3), c));
        if (dj.eq(r)) continue;
        const names = sel.map((i) => S.faceNames[i]);
        why = `сфера, касающаяся граней ${names.slice(0, 3).join(', ')} и ${names[3]}, имеет радиус ${lenStr(S, r)}, а расстояние от её центра до грани ${S.faceNames[j]} равно ${lenStr(S, dj.sign() < 0 ? dj.neg() : dj)}${dj.sign() < 0 ? ' (центр оказывается по внешнюю сторону этой грани)' : ''}. Точки, равноудалённой от всех граней, нет.`;
        break;
      }
    }
    const notes = [`Вписанной сферы не существует: ${why}`];
    if (['cube', 'box', 'prism'].includes(S.spec.kind) && S.spec.tilt !== 'oblique') notes.push('В прямую призму сфера вписывается, только если в основание можно вписать окружность, а высота призмы равна диаметру этой окружности.');
    return { title, absent: true, notes };
  },
};

function sectionOf(it, ctx, pl) { return EVAL.sectionBody(it, ctx, pl); }
