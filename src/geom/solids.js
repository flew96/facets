// Фигуры: точные координаты вершин, грани (с внешней ориентацией), рёбра.
import { N, ZERO, TWO, parseNum, rootOf, sumVals } from '../math/num.js';
import { add, sub, scale, dot, cross, det, len2 } from '../math/vec.js';

const SQ3 = parseNum('√3'), SQ6 = parseNum('√6');

export const BASES = {
  tri: { title: 'правильный треугольник', params: [['a', 'Сторона основания']] },
  rtri: { title: 'прямоугольный треугольник (∠C = 90°)', params: [['a', 'Катет AC'], ['b', 'Катет BC']] },
  sq: { title: 'квадрат', params: [['a', 'Сторона основания']] },
  rect: { title: 'прямоугольник', params: [['a', 'Сторона AB'], ['b', 'Сторона BC']] },
  rhomb: { title: 'ромб', params: [['d1', 'Диагональ AC'], ['d2', 'Диагональ BD']] },
  hex: { title: 'правильный шестиугольник', params: [['a', 'Сторона основания']] },
};

export const KINDS = {
  cube: { title: 'Куб', params: () => [['a', 'Ребро']] },
  box: { title: 'Прямоугольный параллелепипед', params: () => [['a', 'Ребро AB'], ['b', 'Ребро BC'], ['c', 'Ребро AA₁']] },
  prism: { title: 'Прямая призма', bases: Object.keys(BASES), params: (s) => [...BASES[s.base].params, ['h', 'Высота']] },
  pyramid: { title: 'Пирамида', bases: Object.keys(BASES), apex: true, params: (s) => [...BASES[s.base].params, ['h', 'Высота']] },
  tetra: { title: 'Правильный тетраэдр', params: () => [['a', 'Ребро']] },
  frustum: {
    title: 'Усечённая пирамида', bases: ['tri', 'sq', 'hex'],
    params: () => [['a', 'Сторона нижнего основания'], ['t', 'Сторона верхнего основания'], ['h', 'Высота']],
  },
};

export const DEFAULT_PARAMS = { a: '2', b: '3', c: '4', h: '3', d1: '8', d2: '6', t: '1' };

export function defaultSpec(kind) {
  const k = KINDS[kind];
  return { kind, base: k.bases ? (kind === 'prism' ? 'tri' : 'sq') : null, apex: 'center', p: { ...DEFAULT_PARAMS } };
}

const LETTERS = 'ABCDEF';

/** Основание в плоскости z = 0, обход против часовой стрелки (если смотреть сверху) */
function basePolygon(base, p) {
  const h = (x) => x.div(TWO);
  const { a, b, d1, d2 } = p;
  switch (base) {
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
  for (const [key, label] of kind.params(spec)) {
    let v;
    try { v = parseNum(spec.p[key]); } catch (e) { throw new Error(`${label}: ${e.message}`); }
    if (v.sign() <= 0) throw new Error(`${label}: размер должен быть положительным`);
    p[key] = v;
  }

  let names = [], verts = [], faces = [];
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
    case 'prism': { const b = basePolygon(spec.base, p).pts; prismLike(b, b, p.h); break; }
    case 'frustum': {
      const { pts, center } = basePolygon(spec.base, p);
      const k = p.t.div(p.a);
      const top = pts.map(([x, y]) => [center[0].add(x.sub(center[0]).mul(k)), center[1].add(y.sub(center[1]).mul(k))]);
      prismLike(pts, top, p.h);
      break;
    }
    case 'pyramid': {
      const { pts, center } = basePolygon(spec.base, p);
      const n = pts.length;
      const foot = spec.apex === 'center' || !(+spec.apex < n) ? center : pts[+spec.apex];
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
    spec, names, verts, faces, edges, planes, centroid, params: p,
    faceNames,
    volume: facesVolume(facePts, verts[0]),
    surface: sumVals(facePts.map(polygonArea)),
  };
}
