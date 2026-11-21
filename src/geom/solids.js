// Фигуры: точные координаты вершин, грани (с внешней ориентацией), рёбра.
import { N, ZERO, TWO, parseNum, parseDim, rootOf, sqrtNum, sumVals, fmtNum, fmtVal } from '../math/num.js';
import { add, sub, scale, dot, cross, det, len2 } from '../math/vec.js';
import { buildRound } from './round.js';

const SQ3 = parseNum('√3'), SQ6 = parseNum('√6');

export const BASES = {
  tri: { title: 'правильный треугольник', params: [['a', 'Сторона основания']] },
  rtri: { title: 'прямоугольный треугольник (∠C = 90°)', params: [['a', 'Катет AC'], ['b', 'Катет BC']] },
  sq: { title: 'квадрат', params: [['a', 'Сторона основания']] },
  rect: { title: 'прямоугольник', params: [['a', 'Сторона AB'], ['b', 'Сторона BC']] },
  rhomb: { title: 'ромб', params: [['d1', 'Диагональ AC'], ['d2', 'Диагональ BD']] },
  hex: { title: 'правильный шестиугольник', params: [['a', 'Сторона основания']] },
  tri3: { title: 'произвольный треугольник (по трём сторонам)', params: [['a', 'Сторона AB'], ['b', 'Сторона BC'], ['c', 'Сторона AC']] },
  trap: { title: 'равнобедренная трапеция', params: [['a', 'Основание AD'], ['b', 'Основание BC'], ['m', 'Высота трапеции']] },
  poly: { title: 'произвольный многоугольник (по координатам)', params: [['pts', 'Вершины основания по порядку обхода: x y; x y; …', 'pts']] },
};

const REGULAR = ['tri', 'sq', 'hex'];
// Безразмерные параметры: буква в них недопустима
export const SCALARS = ['k'];

/** Буква-масштаб, если размеры фигуры заданы буквой, иначе null (ошибки разбора здесь не важны) */
export function specUnit(spec) {
  for (const [key, , mode] of KINDS[spec.kind].params(spec)) {
    const raw = String(spec.p[key] ?? DEFAULT_PARAMS[key]);
    for (const part of mode === 'pts' ? raw.split(/[;\s]+/).filter(Boolean) : [raw]) {
      try { const d = parseDim(part); if (d.sym) return d.sym; } catch { /* нечитаемое значение */ }
    }
  }
  return null;
}
const LETTERS = 'ABCDEFGH';

// Третий элемент описания параметра: 'any' — число любого знака, 'pts' — список координат
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const NAME_RE = /\p{L}[\d₀-₉'′]*/gu;

/** «ABCD», «A B C A1 B1 C1» → ['A', 'B', 'C', 'A₁', …]; пустая строка → null */
export function parseNames(src) {
  const str = String(src ?? '').trim();
  if (!str) return null;
  const rest = str.replace(NAME_RE, '').replace(/[\s,;]+/g, '');
  if (rest) throw new Error(`не удалось разобрать «${rest}»: имя вершины — буква, за которой может идти индекс или штрих (A₁, B2, C')`);
  return str.match(NAME_RE).map((t) => t.replace(/\d/g, (d) => SUBS[d]));
}

/** Свои имена вершин из spec.names, если они подходят к фигуре, иначе стандартные */
function applyNames(spec, defaults) {
  const c = spec.names;
  return Array.isArray(c) && c.length === defaults.length && new Set(c).size === c.length ? [...c] : defaults;
}

/** Подставляет свои имена вершин в подпись вида «Боковое ребро SA», «Ребро AA₁» */
export function relabel(text, defaults, names) {
  if (!defaults || !names || defaults === names) return text;
  const map = new Map(defaults.map((d, i) => [d, names[i]]));
  return text.replace(/[A-HS]₁?/g, (m) => map.get(m) ?? m);
}

// Боковое ребро пирамиды, по которому задаётся её высота: SA, а если S проецируется в A — SB
const lateralIndex = (s) => (s.apex === '0' ? 1 : 0);
// Все боковые рёбра равны, когда вершина проецируется в центр описанной окружности основания
const EQUAL_LATERAL = ['tri', 'sq', 'hex', 'rect', 'rtri'];
function lateralLabel(s) {
  return s.apex === 'center' && EQUAL_LATERAL.includes(s.base) ? 'Боковое ребро' : `Боковое ребро S${LETTERS[lateralIndex(s)]}`;
}
const apexParams = (s) => (s.apex === 'custom' ? [['sx', 'Проекция вершины: x', 'any'], ['sy', 'Проекция вершины: y', 'any']] : []);

export const KINDS = {
  cube: { title: 'Куб', params: () => [['a', 'Ребро']] },
  box: { title: 'Прямоугольный параллелепипед', params: () => [['a', 'Ребро AB'], ['b', 'Ребро BC'], ['c', 'Ребро AA₁']] },
  prism: {
    title: 'Призма', bases: Object.keys(BASES), tilt: true,
    params: (s) => [...BASES[s.base].params, ['h', 'Высота'], ...(s.tilt === 'oblique' ? [['dx', 'Сдвиг верхнего основания: x', 'any'], ['dy', 'Сдвиг верхнего основания: y', 'any']] : [])],
  },
  pyramid: {
    title: 'Пирамида', bases: Object.keys(BASES), apex: true, hmode: true,
    params: (s) => [...BASES[s.base].params, s.hmode === 'edge' ? ['l', lateralLabel(s)] : ['h', 'Высота'], ...apexParams(s)],
  },
  tetra: { title: 'Правильный тетраэдр', params: () => [['a', 'Ребро']] },
  frustum: {
    title: 'Усечённая пирамида', bases: Object.keys(BASES), apex: true,
    params: (s) => [
      ...(REGULAR.includes(s.base)
        ? [['a', 'Сторона нижнего основания'], ['t', 'Сторона верхнего основания']]
        : [...BASES[s.base].params, ['k', 'Коэффициент подобия верхнего основания']]),
      ['h', 'Высота'], ...apexParams(s),
    ],
  },
  // Тела вращения строятся отдельной веткой кода — см. round.js
  cylinder: { title: 'Цилиндр', round: true, params: () => [['r', 'Радиус основания'], ['h', 'Высота']] },
  cone: { title: 'Конус', round: true, params: () => [['r', 'Радиус основания'], ['h', 'Высота']] },
  conefrustum: { title: 'Усечённый конус', round: true, params: () => [['r', 'Радиус нижнего основания'], ['r2', 'Радиус верхнего основания'], ['h', 'Высота']] },
  ball: { title: 'Шар', round: true, params: () => [['r', 'Радиус']] },
};

export const DEFAULT_PARAMS = { a: '2', b: '3', c: '4', h: '3', d1: '8', d2: '6', t: '1', m: '2', k: '1/2', sx: '1', sy: '1', l: '4', r: '3', r2: '1', dx: '1', dy: '1', pts: '0 0; 4 0; 5 3; 1 4' };

export function defaultSpec(kind) {
  const k = KINDS[kind];
  return { kind, base: k.bases ? (kind === 'prism' ? 'tri' : 'sq') : null, apex: 'center', tilt: 'right', hmode: 'h', p: { ...DEFAULT_PARAMS } };
}

/** «0 0; 4 0; 5 3» → точные координаты вершин выпуклого многоугольника */
function parsePolygon(src, dims) {
  const pts = String(src).split(/[;\n]+/).map((t) => t.trim()).filter(Boolean).map((t, i) => {
    const xy = t.split(/\s+/);
    if (xy.length !== 2) throw new Error(`вершина ${LETTERS[i] || i + 1}: нужны две координаты через пробел, например «4 0»`);
    return xy.map((v) => { const d = parseDim(v); dims.push(d); return d.v; });
  });
  if (pts.length < 3) throw new Error('нужно не меньше трёх вершин');
  if (pts.length > LETTERS.length) throw new Error(`не больше ${LETTERS.length} вершин`);
  const n = pts.length;
  const area2 = (p, q, r) => q[0].sub(p[0]).mul(r[1].sub(p[1])).sub(q[1].sub(p[1]).mul(r[0].sub(p[0]))).sign();
  const turn = pts.map((p, i) => area2(p, pts[(i + 1) % n], pts[(i + 2) % n]));
  if (turn.includes(0)) throw new Error('три соседние вершины лежат на одной прямой (или вершины совпадают)');
  // все повороты в одну сторону и «веер» из первой вершины не выворачивается — значит, многоугольник выпуклый
  const fan = pts.slice(1, -1).map((p, i) => area2(pts[0], p, pts[i + 2]));
  if ([...turn, ...fan].some((t) => t !== turn[0])) throw new Error('многоугольник должен быть выпуклым, а вершины — идти по порядку обхода');
  return pts;
}

/** Основание в плоскости z = 0, обход против часовой стрелки (если смотреть сверху) */
function basePolygon(base, p) {
  const h = (x) => x.div(TWO);
  const { a, b, c, m, d1, d2 } = p;
  const centroid = (pts) => [0, 1].map((k) => pts.reduce((s, q) => s.add(q[k]), ZERO).div(N(pts.length)));
  switch (base) {
    case 'tri3': {
      const x = a.sq().add(c.sq()).sub(b.sq()).div(a.mul(TWO));
      const y2 = c.sq().sub(x.sq());
      if (y2.sign() <= 0) throw new Error('Треугольника с такими сторонами не существует: каждая сторона должна быть меньше суммы двух других.');
      const y = sqrtNum(y2);
      if (!y) throw new Error('При таких сторонах координаты вершины C выражаются вложенным радикалом — такой треугольник не поддерживается.');
      const pts = [[ZERO, ZERO], [a, ZERO], [x, y]];
      return { pts, center: centroid(pts) };
    }
    case 'trap': {
      const pts = [[ZERO, ZERO], [h(a.sub(b)), m], [h(a.add(b)), m], [a, ZERO]];
      return { pts, center: centroid(pts) };
    }
    case 'poly': return { pts: p.pts, center: centroid(p.pts) };
    case 'tri': return { pts: [[ZERO, ZERO], [a, ZERO], [h(a), h(a.mul(SQ3))]], center: [h(a), a.mul(SQ3).div(N(6))] };
    case 'rtri': return { pts: [[a, ZERO], [ZERO, b], [ZERO, ZERO]], center: [h(a), h(b)] };
    case 'sq': return { pts: [[ZERO, ZERO], [a, ZERO], [a, a], [ZERO, a]], center: [h(a), h(a)] };
    case 'rect': return { pts: [[ZERO, ZERO], [a, ZERO], [a, b], [ZERO, b]], center: [h(a), h(b)] };
    case 'rhomb': return { pts: [[h(d1).neg(), ZERO], [ZERO, h(d2).neg()], [h(d1), ZERO], [ZERO, h(d2)]], center: [ZERO, ZERO] };
    case 'hex': {
      const s = h(a.mul(SQ3));
      return { pts: [[a, ZERO], [h(a), s], [h(a).neg(), s], [a.neg(), ZERO], [h(a).neg(), s.neg()], [h(a), s.neg()]], center: [ZERO, ZERO] };
    }
  }
  throw new Error('Неизвестное основание');
}

/** Площадь плоского многоугольника (точно) */
export function polygonArea(pts) {
  let s = [ZERO, ZERO, ZERO];
  for (let i = 1; i + 1 < pts.length; i++) s = add(s, cross(sub(pts[i], pts[0]), sub(pts[i + 1], pts[0])));
  return rootOf(len2(s).div(N(4)));
}

/** Объём выпуклого тела, заданного внешне ориентированными гранями */
export function facesVolume(polys, origin) {
  let v = ZERO;
  for (const q of polys) {
    for (let i = 1; i + 1 < q.length; i++) v = v.add(det(sub(q[0], origin), sub(q[i], origin), sub(q[i + 1], origin)));
  }
  return v.div(N(6));
}

export function buildSolid(spec) {
  const kind = KINDS[spec.kind];
  if (!kind) throw new Error('Неизвестная фигура');
  const p = {};
  // Буквенные размеры: все длины фигуры пропорциональны одной букве (a, 2a, a√3), буква — положительная длина.
  // Считаем с коэффициентами (как при a = 1): фигура при любом a > 0 подобна этой, поэтому длины
  // умножаются на a, площади — на a², объёмы — на a³, а углы, отношения и все знаки не меняются.
  const lengths = []; // { label, v, sym } для каждой длины
  for (const [key, label, mode] of kind.params(spec)) {
    const raw = spec.p[key] ?? DEFAULT_PARAMS[key];
    const name = mode === 'pts' ? 'Основание' : label;
    let v;
    try {
      if (mode === 'pts') { const dims = []; v = parsePolygon(raw, dims); lengths.push(...dims.map((d) => ({ label: name, ...d }))); }
      else if (SCALARS.includes(key)) v = parseNum(raw);
      else { const d = parseDim(raw); v = d.v; lengths.push({ label, ...d }); }
    } catch (e) { throw new Error(`${name}: ${e.message}`); }
    if (!mode && v.sign() <= 0) throw new Error(`${label}: размер должен быть положительным`);
    p[key] = v;
  }
  const unit = lengths.find((d) => d.sym)?.sym ?? null;
  if (unit) {
    const other = lengths.find((d) => d.sym && d.sym !== unit);
    if (other) throw new Error(`${other.label}: в размерах встречаются две буквы, ${unit} и ${other.sym}. Поддерживается одна буква-масштаб: все размеры должны быть пропорциональны ей (${unit}, 2${unit}, ${unit}√3).`);
    // ноль (координата или сдвиг) годится и с буквой: 0 = 0·a
    const bare = lengths.find((d) => !d.sym && !d.v.isZero());
    if (bare) throw new Error(`${bare.label}: число без буквы нельзя смешивать с буквенными размерами. Запишите этот размер через ${unit} (например, 2${unit} или ${unit}/2) либо задайте все размеры числами.`);
  }
  if (kind.round) {
    if (unit) throw new Error(`Для тел вращения размеры пока задаются только числами: построения на них ещё не умеют выводить ответ через букву ${unit}.`);
    return buildRound(spec, p);
  }
  let baseInfo = null;
  // Куда проецируется вершина пирамиды (для усечённой — вершина полной пирамиды)
  const apexFoot = ({ pts, center }) => {
    if (spec.apex === 'custom') return [p.sx, p.sy];
    return spec.apex === 'center' || !(+spec.apex < pts.length) ? center : pts[+spec.apex];
  };

  let names = [], verts = [], faces = [], info = [];
  const prismLike = (base, top, h) => {
    const n = base.length;
    names = [...LETTERS.slice(0, n), ...[...LETTERS.slice(0, n)].map((c) => c + '₁')];
    verts = [...base.map(([x, y]) => [x, y, ZERO]), ...top.map(([x, y]) => [x, y, h])];
    const idx = [...Array(n).keys()];
    faces = [idx, idx.map((i) => i + n), ...idx.map((i) => [i, (i + 1) % n, (i + 1) % n + n, i + n])];
  };

  switch (spec.kind) {
    case 'cube': { const b = basePolygon('sq', p).pts; prismLike(b, b, p.a); break; }
    case 'box': { const b = basePolygon('rect', p).pts; prismLike(b, b, p.c); break; }
    case 'prism': {
      baseInfo = basePolygon(spec.base, p);
      const b = baseInfo.pts;
      prismLike(b, spec.tilt === 'oblique' ? b.map(([x, y]) => [x.add(p.dx), y.add(p.dy)]) : b, p.h);
      break;
    }
    case 'frustum': {
      baseInfo = basePolygon(spec.base, p);
      const { pts } = baseInfo;
      const k = REGULAR.includes(spec.base) ? p.t.div(p.a) : p.k;
      const center = apexFoot(baseInfo);
      const top = pts.map(([x, y]) => [center[0].add(x.sub(center[0]).mul(k)), center[1].add(y.sub(center[1]).mul(k))]);
      prismLike(pts, top, p.h);
      break;
    }
    case 'pyramid': {
      baseInfo = basePolygon(spec.base, p);
      const { pts } = baseInfo;
      const n = pts.length;
      const foot = apexFoot(baseInfo);
      const dn = [...LETTERS.slice(0, n), 'S'], nm = applyNames(spec, dn);
      if (spec.hmode === 'edge') {
        // h² = l² − (расстояние от проекции вершины до конца ребра)²
        const i = lateralIndex(spec), A = pts[i], label = relabel(lateralLabel(spec), dn, nm);
        const r2 = A[0].sub(foot[0]).sq().add(A[1].sub(foot[1]).sq());
        const h2 = p.l.sq().sub(r2);
        const ru = fmtVal(rootOf(r2), unit || '');
        if (h2.sign() <= 0) throw new Error(`${label}: должно быть больше ${ru} — расстояния от проекции вершины ${nm[n]} до вершины ${nm[i]}. Иначе высота пирамиды не положительна.`);
        const h = sqrtNum(h2);
        if (!h) throw new Error(`${label}: при таком ребре высота выражается вложенным радикалом — такая пирамида не поддерживается.`);
        p.h = h;
        info = [['Высота', h, 1]];
      } else {
        const i = lateralIndex(spec);
        const A = pts[i];
        const l2 = A[0].sub(foot[0]).sq().add(A[1].sub(foot[1]).sq()).add(p.h.sq());
        info = [[relabel(lateralLabel(spec), dn, nm), rootOf(l2), 1]];
      }
      names = [...LETTERS.slice(0, n), 'S'];
      verts = [...pts.map(([x, y]) => [x, y, ZERO]), [foot[0], foot[1], p.h]];
      const idx = [...Array(n).keys()];
      faces = [idx, ...idx.map((i) => [i, (i + 1) % n, n])];
      break;
    }
    case 'tetra': {
      const a = p.a;
      names = ['A', 'B', 'C', 'D'];
      verts = [
        [ZERO, ZERO, ZERO], [a, ZERO, ZERO], [a.div(TWO), a.mul(SQ3).div(TWO), ZERO],
        [a.div(TWO), a.mul(SQ3).div(N(6)), a.mul(SQ6).div(N(3))],
      ];
      faces = [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]];
      break;
    }
  }

  const defaultNames = names;
  names = applyNames(spec, names);
  const faceNames = faces.map((f) => f.map((i) => names[i]).join(''));

  // Внешняя ориентация граней
  const centroid = scale(verts.reduce(add), N(verts.length).inv());
  const planes = faces.map((f, i) => {
    let nrm = cross(sub(verts[f[1]], verts[f[0]]), sub(verts[f[2]], verts[f[0]]));
    if (dot(nrm, sub(verts[f[0]], centroid)).sign() < 0) { faces[i] = f = [...f].reverse(); nrm = scale(nrm, N(-1)); }
    return { n: nrm, d: dot(nrm, verts[f[0]]) };
  });

  const edgeKeys = new Set(), edges = [];
  for (const f of faces) {
    f.forEach((a, i) => {
      const b = f[(i + 1) % f.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!edgeKeys.has(key)) { edgeKeys.add(key); edges.push(a < b ? [a, b] : [b, a]); }
    });
  }

  const facePts = faces.map((f) => f.map((i) => verts[i]));
  return {
    spec, names, defaultNames, verts, faces, edges, planes, centroid, params: p,
    /** буква-масштаб или null; координаты, длины, площади и объёмы ниже — коэффициенты при её степенях */
    unit,
    baseSize: baseInfo ? baseInfo.pts.length : 0,
    baseCoords: baseInfo ? baseInfo.pts.map(([x, y], i) => `${names[i]}(${fmtNum(x, unit || '')}; ${fmtNum(y, unit || '')})`).join(', ') : '',
    faceNames, info,
    volume: facesVolume(facePts, verts[0]),
    surface: sumVals(facePts.map(polygonArea)),
  };
}

/**
 * После смены фигуры или основания появляются поля со значениями по умолчанию — числами.
 * Если остальные размеры буквенные, записываем их через ту же букву: 3 → 3a.
 */
export function harmonize(spec) {
  const u = specUnit(spec);
  if (!u) return spec;
  const p = { ...spec.p };
  for (const [key, , mode] of KINDS[spec.kind].params(spec)) {
    if (mode === 'pts' || SCALARS.includes(key)) continue;
    try { const d = parseDim(p[key] ?? DEFAULT_PARAMS[key]); if (!d.sym && !d.v.isZero()) p[key] = fmtNum(d.v, u); } catch { /* оставляем как есть */ }
  }
  return { ...spec, p };
}
