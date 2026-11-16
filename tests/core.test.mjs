import test from 'node:test';
import assert from 'node:assert/strict';
import { N, parseNum, sqrtNum, fmtNum, fmtVal, rootOf, sumVals } from '../src/math/num.js';
import { buildSolid, defaultSpec } from '../src/geom/solids.js';
import { evaluate } from '../src/geom/construct.js';

const P = parseNum;
const solid = (kind, p = {}, extra = {}) => buildSolid({ ...defaultSpec(kind), ...extra, p: { ...defaultSpec(kind).p, ...p } });
const v = (S, name) => 'v' + S.names.indexOf(name);
const mid = (S, id, name, a, b, m = '1', n = '1') => ({ id, kind: 'point', name, def: { t: 'ratio', a: v(S, a), b: v(S, b), m, n } });
const run = (S, items) => { const ctx = evaluate(S, items); return (id) => ctx.results.get(id); };
const rows = (r) => Object.fromEntries(r.rows.map((x) => [x.k, x.v]));

test('арифметика с корнями', () => {
  assert.equal(fmtNum(P('(1+√5)/2')), '(1 + √5)/2');
  assert.equal(fmtNum(P('√12')), '2√3');
  assert.equal(fmtNum(P('1/√2')), '√2/2');
  assert.equal(fmtNum(P('√2*√3')), '√6');
  assert.equal(fmtNum(P('1/(√2+√3)')), '−√2 + √3');
  assert.equal(fmtNum(P('1/(1+√2+√3)')), '(2 + √2 − √6)/4');
  assert.equal(fmtNum(P('1,5')), '3/2');
  assert.ok(P('1/(1+√2+√3)').mul(P('1+√2+√3')).eq(N(1)));
});

test('точный знак', () => {
  assert.equal(P('√2+√3-√10').sign(), -1); // 3.146 − 3.162
  assert.equal(P('√2+√3-√5-√(5+2√6)+√5').sign(), 0);
  assert.equal(P('99-70√2').sign(), 1); // ≈ 0.005
  assert.equal(P('1351-780√3').sign(), 1); // ≈ 0.00037
});

test('распутывание вложенных радикалов', () => {
  assert.equal(fmtNum(sqrtNum(P('3+2√2'))), '1 + √2');
  assert.equal(fmtNum(sqrtNum(P('2+√3'))), '(√2 + √6)/2');
  assert.equal(fmtNum(sqrtNum(P('6+2√2+2√3+2√6'))), '1 + √2 + √3');
  assert.equal(sqrtNum(P('1+√2')), null);
  assert.equal(fmtVal(rootOf(P('1+√2'))), '√(1 + √2)');
  assert.equal(fmtVal(rootOf(P('(5+√3)/4'))), '√(5 + √3)/2');
  assert.equal(fmtVal(sumVals([N(1), rootOf(N(2)), rootOf(N(8))])), '1 + 3√2');
});

test('объёмы и площади поверхности', () => {
  assert.equal(fmtNum(solid('tetra', { a: '1' }).volume), '√2/12');
  assert.equal(fmtVal(solid('tetra', { a: '1' }).surface), '√3');
  assert.equal(fmtNum(solid('frustum', { a: '2', t: '1', h: '3' }, { base: 'sq' }).volume), '7');
  assert.equal(fmtNum(solid('prism', { a: '2', h: '3' }, { base: 'hex' }).volume), '18√3');
  assert.equal(fmtNum(solid('pyramid', { a: '6', h: '4' }, { base: 'sq' }).volume), '48');
  assert.equal(fmtVal(solid('pyramid', { a: '6', h: '4' }, { base: 'sq' }).surface), '96');
});

test('куб: сечение — правильный шестиугольник', () => {
  const S = solid('cube', { a: '1' });
  const get = run(S, [mid(S, 'i1', 'K', 'A', 'B'), mid(S, 'i2', 'L', 'B', 'C'), mid(S, 'i3', 'M', 'C', 'C₁'), { id: 'i4', kind: 'section', refs: ['i1', 'i2', 'i3'] }]);
  const r = rows(get('i4'));
  assert.match(r['Форма'], /^правильный шестиугольник/);
  assert.equal(r['Площадь'], '3√3/4');
  assert.equal(r['Периметр'], '3√2');
  assert.equal(r['V₁ : V₂'], '1 : 1');
});

test('куб: сечение AB₁C — равносторонний треугольник, объёмы 1/6 и 5/6', () => {
  const S = solid('cube', { a: '1' });
  const r = rows(run(S, [{ id: 'i1', kind: 'section', refs: [v(S, 'A'), v(S, 'B₁'), v(S, 'C')] }])('i1'));
  assert.match(r['Форма'], /^равносторонний треугольник/);
  assert.equal(r['Площадь'], '√3/2');
  const vols = Object.entries(r).filter(([k]) => k.startsWith('V₁ (') || k.startsWith('V₂ (')).map(([, x]) => x).sort();
  assert.deepEqual(vols, ['1/6', '5/6']);
});

test('куб: скрещивающиеся диагонали граней, угол диагонали с гранью', () => {
  const S = solid('cube', { a: '1' });
  const get = run(S, [
    { id: 'i1', kind: 'commonPerp', refs: [v(S, 'A'), v(S, 'B₁'), v(S, 'B'), v(S, 'C₁')] },
    { id: 'i2', kind: 'angleLL', refs: [v(S, 'A'), v(S, 'B₁'), v(S, 'B'), v(S, 'C₁')] },
    { id: 'i3', kind: 'angleLP', refs: [v(S, 'A'), v(S, 'C₁'), v(S, 'A'), v(S, 'B'), v(S, 'C')] },
    { id: 'i4', kind: 'perpPlane', refs: [v(S, 'A'), v(S, 'B'), v(S, 'D'), v(S, 'A₁')] },
    { id: 'i5', kind: 'perpLine', refs: [v(S, 'A'), v(S, 'B'), v(S, 'D₁')] },
    { id: 'i6', kind: 'anglePP', refs: [v(S, 'A'), v(S, 'B'), v(S, 'C'), v(S, 'A'), v(S, 'B₁'), v(S, 'C')] },
  ]);
  assert.equal(get('i1').rows[0].v, '√3/3');
  assert.equal(rows(get('i2'))['Угол φ'], '60°');
  assert.equal(rows(get('i3'))['sin φ'], '√3/3');
  assert.equal(get('i4').rows[0].v, '√3/3');
  assert.equal(get('i5').rows[0].v, '√6/3');
  assert.equal(rows(get('i6'))['cos φ'], '√3/3');
});

test('сферы', () => {
  const sph = (S) => { const get = run(S, [{ id: 'a', kind: 'sphereIn' }, { id: 'b', kind: 'sphereOut' }]); return [get('a'), get('b')]; };
  let [i, o] = sph(solid('tetra', { a: '1' }));
  assert.equal(i.rows[0].v, '√6/12');
  assert.equal(o.rows[0].v, '√6/4');
  [i, o] = sph(solid('pyramid', { a: '6', h: '4' }, { base: 'sq' }));
  assert.equal(i.rows[0].v, '3/2');
  assert.equal(o.rows[0].v, '17/4');
  [i, o] = sph(solid('box', { a: '1', b: '2', c: '3' }));
  assert.ok(i.absent && /не существует/.test(i.notes[0]));
  assert.equal(o.rows[0].v, '√14/2');
  [i, o] = sph(solid('prism', { d1: '8', d2: '6', h: '3' }, { base: 'rhomb' }));
  assert.ok(o.absent && /окружност/.test(o.notes[0]));
  [i] = sph(solid('prism', { d1: '8', d2: '6', h: '24/5' }, { base: 'rhomb' }));
  assert.equal(i.rows[0].v, '12/5');
  [i, o] = sph(solid('cube', { a: '2' }));
  assert.equal(i.rows[0].v, '1');
  assert.equal(o.rows[0].v, '√3');
  [i] = sph(solid('pyramid', { a: '2', h: '3' }, { base: 'hex' }));
  assert.ok(i.rows[0].v.length > 0 && !i.absent);
});

test('крайние случаи', () => {
  const S = solid('cube', { a: '1' });
  const get = run(S, [
    mid(S, 'i1', 'K', 'A', 'B'),
    { id: 'i2', kind: 'section', refs: [v(S, 'A'), 'i1', v(S, 'B')] },
    { id: 'i3', kind: 'section', refs: [v(S, 'A'), v(S, 'A'), v(S, 'B')] },
    { id: 'i4', kind: 'section', refs: [v(S, 'A'), v(S, 'B'), v(S, 'C')] },
    { id: 'i5', kind: 'perpLine', refs: [v(S, 'C₁'), v(S, 'A'), 'i1'] },
    { id: 'i6', kind: 'section', refs: ['i5:H', v(S, 'A'), v(S, 'D')] },
    { id: 'i7', kind: 'commonPerp', refs: [v(S, 'A'), v(S, 'B'), v(S, 'D₁'), v(S, 'C₁')] },
    { id: 'i8', kind: 'commonPerp', refs: [v(S, 'A'), v(S, 'C'), v(S, 'B'), v(S, 'D')] },
    { id: 'i9', kind: 'section', refs: ['zz', v(S, 'A'), v(S, 'D')] },
  ]);
  assert.match(get('i2').error, /на одной прямой/);
  assert.match(get('i3').error, /совпадают/);
  assert.match(get('i4').notes[0], /содержит грань/);
  assert.match(get('i5').notes[0], /на продолжении/);
  assert.equal(get('i5').rows[0].v, '√2');
  assert.ok(!get('i6').error);
  assert.match(get('i7').notes[0], /параллельны/);
  assert.equal(get('i7').rows[0].v, '√2');
  assert.match(get('i8').notes[0], /пересекаются/);
  assert.match(get('i9').error, /недоступна/);
});

test('плоскость мимо фигуры и касание', () => {
  const S = solid('cube', { a: '1' });
  // точки на продолжениях рёбер: вне куба
  const ext = (id, name, a, b) => ({ id, kind: 'perpLine', refs: [a, b, b] });
  void ext;
  const get = run(S, [
    { id: 'p1', kind: 'perpLine', refs: [v(S, 'C₁'), v(S, 'A'), v(S, 'B')] }, // H = B
    { id: 'q1', kind: 'section', refs: [v(S, 'A'), v(S, 'A₁'), v(S, 'B')] },
  ]);
  assert.match(get('q1').notes[0], /содержит грань/);
  // тетраэдр: плоскость через ребро и внешнюю точку
  const T = solid('pyramid', { a: '2', h: '2' }, { base: 'sq' });
  const g2 = run(T, [
    { id: 'h', kind: 'perpPlane', refs: [v(T, 'S'), v(T, 'A'), v(T, 'B'), v(T, 'C')] },
    { id: 'l', kind: 'perpLine', refs: [v(T, 'A'), v(T, 'S'), 'h:H'] },
  ]);
  assert.equal(g2('h').rows[0].v, '2');
  assert.equal(g2('l').rows[0].v, '√2');
});

test('плоскость проходит мимо фигуры', () => {
  const S = solid('cube', { a: '1' });
  const get = run(S, [
    mid(S, 'a1', 'K', 'A', 'B'), mid(S, 'a2', 'L', 'A', 'A₁'),
    mid(S, 'b1', 'M', 'B', 'C'), mid(S, 'b2', 'N', 'B', 'B₁'),
    mid(S, 'c1', 'P', 'C', 'D'), mid(S, 'c2', 'Q', 'C', 'C₁'),
    { id: 'h1', kind: 'perpLine', refs: [v(S, 'C'), 'a1', 'a2'] },
    { id: 'h2', kind: 'perpLine', refs: [v(S, 'D'), 'b1', 'b2'] },
    { id: 'h3', kind: 'perpLine', refs: [v(S, 'A'), 'c1', 'c2'] },
    { id: 's', kind: 'section', refs: ['h1:H', 'h2:H', 'h3:H'] },
  ]);
  assert.match(get('s').error, /мимо фигуры/);
});
