// Готовые задачи. Вершины нумеруются по порядку: основание A, B, C…, затем верхнее основание или вершина S.
import { defaultSpec } from '../geom/solids.js';

const spec = (kind, extra = {}, p = {}) => ({ ...defaultSpec(kind), ...extra, p: { ...defaultSpec(kind).p, ...p } });
const ratio = (id, name, a, b, m = '1', n = '1') => ({ id, kind: 'point', name, color: 0, def: { t: 'ratio', a: 'v' + a, b: 'v' + b, m, n } });
const v = (...ids) => ids.map((i) => 'v' + i);
const onRim = (id, name, ang, base = 0) => ({ id, kind: 'point', name, color: 0, def: { t: 'circ', base, ang } });

export const EXAMPLES = [
  {
    title: 'Куб: сечение через середины трёх рёбер',
    state: {
      spec: spec('cube'), seq: 10,
      items: [ratio('i1', 'K', 0, 1), ratio('i2', 'L', 1, 2), ratio('i3', 'M', 2, 6), { id: 'i4', kind: 'section', color: 0, refs: ['i1', 'i2', 'i3'] }],
    },
  },
  {
    title: 'Куб с ребром a: сечение, расстояние и угол в общем виде',
    state: {
      spec: spec('cube', {}, { a: 'a' }), seq: 10,
      items: [ratio('i1', 'K', 0, 1), ratio('i2', 'L', 1, 2), ratio('i3', 'M', 2, 6), { id: 'i4', kind: 'section', color: 0, refs: ['i1', 'i2', 'i3'] },
        { id: 'i5', kind: 'commonPerp', color: 1, refs: v(0, 5, 1, 6) }, { id: 'i6', kind: 'angleLL', color: 2, refs: v(0, 5, 1, 6) }],
    },
  },
  {
    title: 'Пирамида: сечение методом следов (по шагам)',
    steps: 'i4',
    state: {
      spec: spec('pyramid', { base: 'sq' }, { a: '4', h: '6' }), seq: 10,
      items: [ratio('i1', 'K', 4, 0, '1', '2'), ratio('i2', 'L', 4, 1), ratio('i3', 'M', 4, 2, '2', '1'), { id: 'i4', kind: 'section', color: 0, refs: ['i1', 'i2', 'i3'] }],
    },
  },
  {
    title: 'Куб: расстояние и угол между скрещивающимися диагоналями граней',
    state: {
      spec: spec('cube', {}, { a: '1' }), seq: 10,
      items: [{ id: 'i1', kind: 'commonPerp', color: 1, refs: v(0, 5, 1, 6) }, { id: 'i2', kind: 'angleLL', color: 2, refs: v(0, 5, 1, 6) }],
    },
  },
  {
    title: 'Правильный тетраэдр: вписанная и описанная сферы',
    state: {
      spec: spec('tetra', {}, { a: '2' }), seq: 10,
      items: [{ id: 'i1', kind: 'sphereIn', color: 0 }, { id: 'i2', kind: 'sphereOut', color: 1 }],
    },
  },
  {
    title: 'Призма с ромбом в основании: почему нет сфер',
    state: {
      spec: spec('prism', { base: 'rhomb' }, { d1: '8', d2: '6', h: '3' }), seq: 10,
      items: [{ id: 'i1', kind: 'sphereIn', color: 0 }, { id: 'i2', kind: 'sphereOut', color: 1 }],
    },
  },
  {
    title: 'Произвольная пирамида: высота и угол бокового ребра с основанием',
    state: {
      spec: spec('pyramid', { base: 'poly', apex: 'custom' }, { pts: '0 0; 4 0; 5 3; 1 4', h: '3', sx: '2', sy: '1' }), seq: 10,
      items: [{ id: 'i1', kind: 'perpPlane', color: 1, refs: v(4, 0, 1, 2) }, { id: 'i2', kind: 'angleLP', color: 2, refs: v(4, 2, 0, 1, 2) }],
    },
  },
  {
    title: 'Конус 3–4–5: осевое сечение, вписанный и описанный шары',
    state: {
      spec: spec('cone', {}, { r: '3', h: '4' }), seq: 10,
      items: [{ id: 'i1', kind: 'axial', color: 0 }, { id: 'i2', kind: 'rSphereIn', color: 1 }, { id: 'i3', kind: 'rSphereOut', color: 2 }],
    },
  },
  {
    title: 'Цилиндр: сечение, параллельное оси',
    state: {
      spec: spec('cylinder', {}, { r: '2', h: '3' }), seq: 10,
      items: [onRim('i1', 'K', '0'), onRim('i2', 'L', '90'), { id: 'i3', kind: 'chord', color: 0, refs: ['i1', 'i2'] }],
    },
  },
  {
    title: 'Усечённый конус: шар вписывается, когда l = r + r₁',
    state: {
      spec: spec('conefrustum', {}, { r: '4', r2: '1', h: '4' }), seq: 10,
      items: [{ id: 'i1', kind: 'axial', color: 0 }, { id: 'i2', kind: 'rSphereIn', color: 1 }],
    },
  },
  {
    title: 'Шар радиуса 5: сечение на расстоянии 3 от центра',
    state: {
      spec: spec('ball', {}, { r: '5' }), seq: 10,
      items: [ratio('i1', 'K', 0, 2, '3', '2'), { id: 'i2', kind: 'level', color: 1, refs: ['i1'] }],
    },
  },
  {
    title: 'Пирамида SABCD: BH ⟂ (SAD), HA = √2, HC = 4 — объём',
    state: {
      spec: spec('pyramid', { base: 'sq' }, { a: '3', h: '3√14/4' }), seq: 20,
      items: [
        { id: 'i1', kind: 'perpPlane', color: 0, refs: v(1, 4, 0, 3) },
        { id: 'i2', kind: 'dist', color: 1, refs: ['i1:H', 'v0'] },
        { id: 'i3', kind: 'dist', color: 2, refs: ['i1:H', 'v2'] },
        { id: 'i4', kind: 'angleLL', color: 3, refs: ['i1:H', 'v0', 'i1:H', 'v2'] },
      ],
      conds: [
        { id: 'c1', key: 'i2|0', deg: 1, text: '√2', unknown: 'h', target: { src: 'item', id: 'i2', idx: 0, word: 'Длина' } },
        { id: 'c2', key: 'i3|0', deg: 1, text: '4', unknown: 'a', target: { src: 'item', id: 'i3', idx: 0, word: 'Длина' } },
      ],
    },
  },
  {
    title: 'Пирамида SABC: AB = 30, SA = 28; плоскость через MN ⟂ основанию',
    state: {
      spec: spec('pyramid', { base: 'tri', hmode: 'edge' }, { a: '30', l: '28' }), seq: 20,
      items: [
        ratio('i1', 'M', 3, 0), ratio('i2', 'N', 3, 1), ratio('i3', 'E', 0, 1),
        // α ⟂ (ABC) и содержит MN: третья точка — проекция M на основание
        { id: 'i4', kind: 'perpPlane', color: 0, refs: ['i1', ...v(0, 1, 2)] },
        { id: 'i5', kind: 'section', color: 1, refs: ['i1', 'i2', 'i4:H'] },
        { id: 'i6', kind: 'linePlane', color: 2, refs: ['v2', 'i3', 'i5:k0', 'i5:k1', 'i5:k2'] },
        { id: 'i7', kind: 'pyrVol', color: 3, refs: ['v2', 'i5:k0', 'i5:k1', 'i5:k2'] },
      ],
    },
  },
  {
    // O и O₁ — центры описанных окружностей; у правильного треугольника это центр грани
    title: 'Призма ABCA₁B₁C₁: AB = 6, AA₁ = 4, AM = BN = 3 — медианы CMN и расстояние от C₁ до (CMN)',
    state: {
      spec: spec('prism', { base: 'tri' }, { a: '6', h: '4' }), seq: 20,
      items: [
        ratio('i1', 'M', 0, 3, '3', '1'), ratio('i2', 'N', 1, 4, '3', '1'),
        { id: 'i3', kind: 'point', name: 'O', color: 0, def: { t: 'center', f: 0 } },
        { id: 'i4', kind: 'point', name: 'O₁', color: 0, def: { t: 'center', f: 1 } },
        { id: 'i5', kind: 'centroid', color: 0, refs: ['v2', 'i1', 'i2'] },
        // а) прямая OO₁ пересекает плоскость CMN как раз в точке пересечения медиан
        { id: 'i6', kind: 'linePlane', color: 1, refs: ['i3', 'i4', 'v2', 'i1', 'i2'] },
        // б) расстояние от C₁ до плоскости CMN
        { id: 'i7', kind: 'perpPlane', color: 2, refs: ['v5', 'v2', 'i1', 'i2'] },
      ],
    },
  },
  {
    title: 'Куб: сечение, параллельное диагональной плоскости',
    state: {
      spec: spec('cube'), seq: 10,
      items: [ratio('i1', 'K', 0, 1, '1', '3'), { id: 'i2', kind: 'secPar', color: 3, refs: ['i1', ...v(1, 3, 7)] }],
    },
  },
];
