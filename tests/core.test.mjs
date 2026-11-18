import test from 'node:test';
import assert from 'node:assert/strict';
import { N, parseNum, parseDim, unitStr, sqrtNum, fmtNum, fmtVal, rootOf, sumVals } from '../src/math/num.js';
import { buildSolid, defaultSpec, specUnit } from '../src/geom/solids.js';
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

test('произвольные фигуры', () => {
  // пирамида на треугольнике 3-4-5 (по трём сторонам), вершина над произвольной точкой
  const py = buildSolid({ kind: 'pyramid', base: 'tri3', apex: 'custom', p: { a: '3', b: '4', c: '5', h: '6', sx: '10', sy: '-7' } });
  assert.equal(fmtNum(py.volume), '12');
  // наклонная призма: объём не зависит от сдвига
  const pr = buildSolid({ kind: 'prism', base: 'sq', tilt: 'oblique', p: { a: '2', h: '3', dx: '1', dy: '5' } });
  assert.equal(fmtNum(pr.volume), '12');
  assert.ok(run(pr, [{ id: 's', kind: 'sphereIn' }])('s').absent);
  // усечённая пирамида на прямоугольнике 4×2 по координатам, k = 1/2: V = h/3·(S₁ + S₂ + √(S₁S₂))
  const fr = buildSolid({ kind: 'frustum', base: 'poly', apex: '0', p: { pts: '0 0; 4 0; 4 2; 0 2', k: '1/2', h: '3' } });
  assert.equal(fmtNum(fr.volume), '14');
  // обход по часовой стрелке тоже годится
  const cw = buildSolid({ kind: 'pyramid', base: 'poly', apex: 'center', p: { pts: '0 0; 0 2; 4 2; 4 0', h: '3' } });
  assert.equal(fmtNum(cw.volume), '8');
  // трапеция с основаниями 6 и 2, высотой 3
  const tr = buildSolid({ kind: 'prism', base: 'trap', p: { a: '6', b: '2', m: '3', h: '5' } });
  assert.equal(fmtNum(tr.volume), '60');
  assert.equal(run(tr, [{ id: 's', kind: 'sphereOut' }])('s').absent, undefined);
  // произвольный тетраэдр: сечение и расстояния считаются как обычно
  const get = run(py, [{ id: 'h', kind: 'perpPlane', refs: ['v3', 'v0', 'v1', 'v2'] }, { id: 'o', kind: 'sphereOut' }]);
  assert.equal(get('h').rows[0].v, '6');
  assert.ok(!get('o').error && !get('o').absent);
});

test('некорректные произвольные основания', () => {
  const bad = (p, base = 'poly') => () => buildSolid({ kind: 'pyramid', base, apex: 'center', p: { h: '1', ...p } });
  assert.throws(bad({ pts: '0 0; 4 0; 1 1; 0 4' }), /выпуклым/);
  assert.throws(bad({ pts: '0 0; 2 2; 2 0; 0 2' }), /выпуклым/);
  assert.throws(bad({ pts: '0 0; 1 0; 2 0' }), /на одной прямой/);
  assert.throws(bad({ pts: '0 0; 1 0' }), /трёх вершин/);
  assert.throws(bad({ pts: '0 0; 1; 2 2' }), /две координаты/);
  assert.throws(bad({ a: '1', b: '2', c: '5' }, 'tri3'), /не существует/);
});

import { buildTrace } from '../src/geom/trace.js';
import { explain } from '../src/geom/explain.js';

test('сечения, параллельные плоскости и перпендикулярные прямой', () => {
  const S = solid('cube', { a: '2' });
  const get = run(S, [
    mid(S, 'k', 'K', 'A', 'A₁'),
    { id: 'p', kind: 'secPar', refs: ['k', v(S, 'A'), v(S, 'B'), v(S, 'C')] },
    { id: 'q', kind: 'secPerp', refs: ['k', v(S, 'A'), v(S, 'C₁')] },
  ]);
  assert.match(rows(get('p'))['Форма'], /^квадрат/);
  assert.equal(rows(get('p'))['Площадь'], '4');
  assert.equal(rows(get('p'))['V₁ : V₂'], '1 : 1');
  assert.ok(!get('q').error);
});

test('метод следов: пирамида, точки на трёх боковых рёбрах', () => {
  const S = solid('pyramid', { a: '4', h: '6' }, { base: 'sq' });
  const items = [mid(S, 'k', 'K', 'S', 'A', '1', '2'), mid(S, 'l', 'L', 'S', 'B'), mid(S, 'm', 'M', 'S', 'C', '2', '1'), { id: 's', kind: 'section', refs: ['k', 'l', 'm'] }];
  const ctx = evaluate(S, items);
  const sec = ctx.results.get('s').section;
  const steps = buildTrace(S, sec, ctx.used);
  assert.ok(steps && steps.length >= 4);
  const text = steps.map((x) => x.text).join('\n');
  assert.match(text, /продолжение ребра/);
  assert.match(text, /искомое сечение/);
  // каждая вершина сечения в итоге найдена
  assert.deepEqual([...steps.at(-1).found].sort(), [...sec.names].sort());
  for (const name of sec.names) assert.ok(steps.some((x) => x.found.includes(name)));
});

test('метод следов: куб, шестиугольник через параллельные грани', () => {
  const S = solid('cube', { a: '2' });
  const items = [mid(S, 'k', 'K', 'A', 'B'), mid(S, 'l', 'L', 'B', 'C'), mid(S, 'm', 'M', 'C', 'C₁'), { id: 's', kind: 'section', refs: ['k', 'l', 'm'] }];
  const ctx = evaluate(S, items);
  const steps = buildTrace(S, ctx.results.get('s').section, ctx.used);
  const text = steps.map((x) => x.text).join('\n');
  assert.match(text, /T₁/);
  assert.doesNotMatch(text, /T₄/);
  assert.equal(steps.filter((x) => /сторона сечения/.test(x.text)).length, 6);
});

test('метод следов: точки внутри граней (нет двух точек в одной грани)', () => {
  const S = solid('cube', { a: '2' });
  const fp = (id, name, f, u, w) => ({ id, kind: 'point', name, def: { t: 'face', f, u, v: w } });
  const items = [fp('k', 'K', 2, '1/3', '1/4'), fp('l', 'L', 3, '1/2', '2/3'), fp('m', 'M', 1, '1/4', '1/2'), { id: 's', kind: 'section', refs: ['k', 'l', 'm'] }];
  const ctx = evaluate(S, items);
  const sec = ctx.results.get('s').section;
  const steps = buildTrace(S, sec, ctx.used);
  assert.ok(steps);
  assert.deepEqual([...steps.at(-1).found].sort(), [...sec.names].sort());
});

test('решения методом координат', () => {
  const S = solid('cube', { a: '1' });
  const items = [
    { id: 'a', kind: 'commonPerp', refs: [v(S, 'A'), v(S, 'B₁'), v(S, 'B'), v(S, 'C₁')] },
    { id: 'b', kind: 'perpPlane', refs: [v(S, 'A'), v(S, 'B'), v(S, 'D'), v(S, 'A₁')] },
    { id: 'c', kind: 'sphereIn' }, { id: 'd', kind: 'angleLP', refs: [v(S, 'A'), v(S, 'C₁'), v(S, 'A'), v(S, 'B'), v(S, 'C')] },
  ];
  const ctx = evaluate(S, items);
  assert.match(explain(items[0], ctx).join(' '), /√3\/3/);
  assert.match(explain(items[1], ctx).join(' '), /√3\/3/);
  assert.match(explain(items[2], ctx).join(' '), /r = 1\/2/);
  assert.match(explain(items[3], ctx).join(' '), /sin φ/);
});

// ───────────────────────── буквенные размеры ─────────────────────────

test('буквенные размеры: разбор и запись', () => {
  const dim = (s) => { const d = parseDim(s); return fmtNum(d.v, unitStr(d.sym, 1)); };
  assert.equal(dim('a'), 'a');
  assert.equal(dim('2a'), '2a');
  assert.equal(dim('a/2'), 'a/2');
  assert.equal(dim('a√3'), 'a√3');
  assert.equal(dim('√3a/2'), 'a√3/2');
  assert.equal(dim('1,5 a'), '3a/2');
  assert.equal(dim('(a + 2a)/3'), 'a');
  assert.equal(dim('√(a^2)'), 'a');
  assert.equal(dim('3/2'), '3/2');
  assert.equal(parseDim('5').sym, null);
  assert.equal(fmtNum(P('(1+√2)/2'), 'a²'), 'a²(1 + √2)/2');
  assert.equal(fmtNum(P('-1/2'), 'a'), '−a/2');
  assert.equal(fmtVal(rootOf(P('(5+√3)/4')), 'a'), 'a√(5 + √3)/2');
  assert.equal(unitStr('a', 3), 'a³');
  assert.equal(unitStr(null, 3), '');
  // не пропорционально букве — не размер
  assert.throws(() => parseDim('a+1'), /разной размерности/);
  assert.throws(() => parseDim('√a'), /корень из буквы/);
  assert.throws(() => parseDim('a^2'), /в первой степени/);
  assert.throws(() => parseDim('1/a'), /в первой степени/);
  assert.throws(() => parseDim('ab'), /две буквы/);
  assert.throws(() => parseNum('2a'), /нужно число/);
});

test('буквенные размеры: куб с ребром a', () => {
  const S = solid('cube', { a: 'a' });
  assert.equal(S.unit, 'a');
  assert.equal(fmtVal(S.volume, unitStr(S.unit, 3)), 'a³');
  assert.equal(fmtVal(S.surface, unitStr(S.unit, 2)), '6a²');
  const items = [
    mid(S, 'k', 'K', 'A', 'B'), mid(S, 'l', 'L', 'B', 'C'), mid(S, 'm', 'M', 'C', 'C₁'),
    { id: 's', kind: 'section', refs: ['k', 'l', 'm'] },
    { id: 'p', kind: 'commonPerp', refs: [v(S, 'A'), v(S, 'B₁'), v(S, 'B'), v(S, 'C₁')] },
    { id: 'g', kind: 'angleLL', refs: [v(S, 'A'), v(S, 'B₁'), v(S, 'B'), v(S, 'C₁')] },
    { id: 'd', kind: 'dist', refs: [v(S, 'A'), v(S, 'C₁')] },
  ];
  const ctx = evaluate(S, items), get = (id) => ctx.results.get(id);
  const sec = rows(get('s'));
  assert.equal(sec['Площадь'], '3a²√3/4');
  assert.equal(sec['Периметр'], '3a√2');
  assert.equal(sec['V₁ : V₂'], '1 : 1');
  assert.match(get('s').rows.find((x) => x.k === 'Площадь').a, /^1,299·a²$/);
  assert.equal(get('p').rows[0].v, 'a√3/3');
  assert.equal(rows(get('g'))['Угол φ'], '60°'); // угол от a не зависит
  assert.equal(rows(get('d'))['Длина'], 'a√3');
  const sol = explain(items[4], ctx).join(' ');
  assert.match(sol, /a > 0/);
  assert.match(sol, /B₁\(a; 0; a\)/);
  assert.match(sol, /\|w\| = a²√3/);
  assert.match(sol, /= a√3\/3/);
});

test('буквенные размеры: правильный тетраэдр с ребром a', () => {
  const S = solid('tetra', { a: 'a' });
  const r = run(S, [{ id: 'i', kind: 'sphereIn' }, { id: 'o', kind: 'sphereOut' }]);
  assert.equal(rows(r('i'))['Радиус r'], 'a√6/12');
  assert.equal(rows(r('o'))['Радиус R'], 'a√6/4');
  assert.equal(fmtVal(S.volume, unitStr(S.unit, 3)), 'a³√2/12');
});

test('буквенные размеры согласованы с числовыми', () => {
  // параллелепипед a × 2a × a√3 при a = 5 — то же, что 5 × 10 × 5√3
  const A = solid('box', { a: 'a', b: '2a', c: 'a√3' }), B = solid('box', { a: '5', b: '10', c: '5√3' });
  assert.ok(A.volume.mul(N(125)).eq(B.volume));
  const sec = (S) => rows(run(S, [{ id: 's', kind: 'section', refs: [v(S, 'A'), v(S, 'C'), v(S, 'B₁')] }])('s'));
  const sa = sec(A), sb = sec(B);
  assert.equal(sa['Площадь'], fmtVal(rootOf(P('19/4')), 'a²'));
  assert.equal(sb['Площадь'], fmtVal(rootOf(P('19/4').mul(N(625)))));
  assert.equal(sa['V₁ : V₂'], sb['V₁ : V₂']);
});

test('буквенные размеры: нельзя смешивать с числами и другими буквами', () => {
  assert.throws(() => solid('box', { a: 'a', b: '3', c: '4' }), /Ребро BC: число без буквы нельзя смешивать/);
  assert.throws(() => solid('box', { a: 'a', b: 'b', c: 'a' }), /две буквы, a и b/);
  assert.throws(() => solid('pyramid', { a: 'a', h: 'a', k: 'a' }, { base: 'rect', kind: 'frustum' }), /число/);
  assert.throws(() => solid('pyramid', { pts: '0 0; a 0; a a; 0 2', h: 'a' }, { base: 'poly' }), /Основание: число без буквы/);
  assert.throws(() => solid('cube', { a: '-a' }), /положительным/);
  // ноль совместим с буквой: 0 = 0·a
  const S = solid('pyramid', { pts: '0 0; 2a 0; a a; 0 a', h: '3a', sx: '0', sy: 'a/2' }, { base: 'poly', apex: 'custom' });
  assert.equal(S.unit, 'a');
  assert.equal(S.baseCoords, 'A(0; 0), B(2a; 0), C(a; a), D(0; a)');
  // усечённая пирамида: коэффициент подобия остаётся числом
  assert.equal(fmtVal(solid('frustum', { a: '2a', t: 'a', h: 'a' }).volume, 'a³'), '7a³/3');
  assert.equal(specUnit(S.spec), 'a');
  assert.equal(specUnit(solid('cube').spec), null);
});

test('пирамида по боковому ребру', () => {
  const S = solid('pyramid', { a: '6', l: '5' }, { base: 'tri', hmode: 'edge' });
  assert.equal(fmtNum(S.verts.at(-1)[2]), '√13'); // h² = 25 − (2√3)²
  assert.equal(S.info[0][0], 'Высота');
  // вершина проецируется в A — ребро берётся SB
  const T = solid('pyramid', { a: '2', l: '√13' }, { base: 'sq', apex: '0', hmode: 'edge' });
  assert.equal(fmtNum(T.verts.at(-1)[2]), '3');
  // в режиме высоты показываем длину бокового ребра
  const U = solid('pyramid', { a: '6', h: '5' }, { base: 'tri' });
  assert.deepEqual([U.info[0][0], fmtVal(U.info[0][1])], ['Боковое ребро', '√37']);
  assert.throws(() => solid('pyramid', { a: '6', l: '2' }, { base: 'tri', hmode: 'edge' }), /больше 2√3/);
  const L = solid('pyramid', { a: '2a', l: '3a' }, { base: 'sq', hmode: 'edge' });
  assert.equal(L.unit, 'a');
  assert.equal(fmtNum(L.verts.at(-1)[2]), '√7');
});

test('прямые через точку и сечение ∥ двум прямым', () => {
  const S = solid('cube');
  const M = mid(S, 'm', 'M', 'A', 'A₁');
  const r = run(S, [M,
    { id: 'p', kind: 'parLine', refs: ['m', v(S, 'B'), v(S, 'C')] },
    { id: 'q', kind: 'perpLineThru', refs: [v(S, 'A₁'), v(S, 'B'), v(S, 'C')] },
    { id: 'n', kind: 'normLine', refs: [v(S, 'A₁'), v(S, 'A'), v(S, 'B'), v(S, 'C')] },
    { id: 'z', kind: 'parLine', refs: ['m', v(S, 'A'), v(S, 'A₁')] },
    { id: 's', kind: 'secPar2', refs: ['m', v(S, 'A'), v(S, 'B'), v(S, 'A'), v(S, 'D')] },
    { id: 'e', kind: 'secPar2', refs: ['m', v(S, 'A'), v(S, 'B'), v(S, 'D'), v(S, 'C')] },
  ]);
  assert.equal(rows(r('p'))['Длина MK'], '2');
  assert.match(rows(r('p'))['Пересекает поверхность'], /ребро DD₁/);
  assert.equal(rows(r('q'))['Расстояние A₁B'], '2√2');
  assert.equal(rows(r('n'))['Расстояние A₁A'], '2');
  assert.match(r('z').error, /совпадает/);
  assert.equal(rows(r('s'))['Площадь'], '4');
  assert.equal(rows(r('s'))['V₁ : V₂'], '1 : 1');
  assert.match(r('e').error, /параллельны/);
});

test('перпендикуляр к плоскости мимо фигуры — вспомогательная точка рядом', () => {
  const S = solid('cube');
  // плоскость (ACC₁) проходит через A, перпендикуляр к ней в точке A лишь касается куба
  const ctx = evaluate(S, [{ id: 'n', kind: 'normLine', refs: [v(S, 'A'), v(S, 'A'), v(S, 'C'), v(S, 'C₁')] }]);
  const q = ctx.points.get('n:Q');
  assert.ok(q, 'нет точки Q');
  const d = q.pos.map((x, i) => x.sub(S.verts[0][i]).toNumber());
  assert.ok(Math.hypot(...d) <= 2, `Q слишком далеко: ${d}`);
});

test('свои обозначения вершин', async () => {
  const { parseNames } = await import('../src/geom/solids.js');
  assert.deepEqual(parseNames('A B C A1 B1 C1'), ['A', 'B', 'C', 'A₁', 'B₁', 'C₁']);
  assert.deepEqual(parseNames('ABCD'), ['A', 'B', 'C', 'D']);
  assert.equal(parseNames('  '), null);
  assert.throws(() => parseNames('AB-C'), /разобрать/);
  const S = solid('pyramid', { a: '6', l: '5' }, { base: 'tri', hmode: 'edge', names: ['A', 'B', 'C', 'D'] });
  assert.deepEqual(S.names, ['A', 'B', 'C', 'D']);
  assert.ok(S.faceNames.includes('ABD') || S.faceNames.includes('BAD'));
  assert.throws(() => solid('pyramid', { a: '6', l: '2' }, { base: 'tri', hmode: 'edge', names: ['K', 'L', 'M', 'P'] }), /вершины P до вершины K/);
  // имена не к той фигуре (другое число вершин) — остаются стандартные
  assert.deepEqual(solid('pyramid', {}, { base: 'sq', names: ['A', 'B', 'C', 'D'] }).names, ['A', 'B', 'C', 'D', 'S']);
  const r = run(S, [{ id: 's', kind: 'dist', refs: ['v3', 'v0'] }]);
  assert.equal(r('s').title, 'Отрезок DA');
});
