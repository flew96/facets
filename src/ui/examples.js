// Готовые задачи. Вершины нумеруются по порядку: основание A, B, C…, затем верхнее основание или вершина S.
import { defaultSpec } from '../geom/solids.js';

const spec = (kind, extra = {}, p = {}) => ({ ...defaultSpec(kind), ...extra, p: { ...defaultSpec(kind).p, ...p } });
const ratio = (id, name, a, b, m = '1', n = '1') => ({ id, kind: 'point', name, color: 0, def: { t: 'ratio', a: 'v' + a, b: 'v' + b, m, n } });
const v = (...ids) => ids.map((i) => 'v' + i);

export const EXAMPLES = [
  {
    title: 'Куб: сечение через середины трёх рёбер',
    state: {
      spec: spec('cube'), seq: 10,
      items: [ratio('i1', 'K', 0, 1), ratio('i2', 'L', 1, 2), ratio('i3', 'M', 2, 6), { id: 'i4', kind: 'section', color: 0, refs: ['i1', 'i2', 'i3'] }],
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
    title: 'Куб: сечение, параллельное диагональной плоскости',
    state: {
      spec: spec('cube'), seq: 10,
      items: [ratio('i1', 'K', 0, 1, '1', '3'), { id: 'i2', kind: 'secPar', color: 3, refs: ['i1', ...v(1, 3, 7)] }],
    },
  },
];
