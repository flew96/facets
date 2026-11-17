// Тела вращения: известные ответы из школьного курса.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtVal, parseNum, piVal } from '../src/math/num.js';
import { buildSolid, defaultSpec } from '../src/geom/solids.js';
import { evaluateRound } from '../src/geom/round.js';

const solid = (kind, p = {}) => buildSolid({ ...defaultSpec(kind), p: { ...defaultSpec(kind).p, ...p } });
const run = (S, items) => { const ctx = evaluateRound(S, items); return (id) => ctx.results.get(id); };
const rows = (r) => Object.fromEntries(r.rows.map((x) => [x.k, x.v]));
const onRim = (id, name, ang, base = 0) => ({ id, kind: 'point', name, def: { t: 'circ', base, ang } });

test('π как символ: запись результатов', () => {
  assert.equal(fmtVal(piVal(parseNum('12'))), '12π');
  assert.equal(fmtVal(piVal(parseNum('1'))), 'π');
  assert.equal(fmtVal(piVal(parseNum('4/3'))), '4π/3');
  assert.equal(fmtVal(piVal(parseNum('2√3'))), '2π√3');
  assert.equal(fmtVal(piVal(parseNum('(1+√5)/2'))), 'π(1 + √5)/2');
});

test('объёмы и площади поверхности', () => {
  const cone = solid('cone', { r: '3', h: '4' });
  assert.equal(fmtVal(cone.volume), '12π');
  assert.equal(fmtVal(cone.surface), '24π'); // π·3·5 + π·9
  const cyl = solid('cylinder', { r: '2', h: '3' });
  assert.equal(fmtVal(cyl.volume), '12π');
  assert.equal(fmtVal(cyl.surface), '20π');
  const fr = solid('conefrustum', { r: '4', r2: '1', h: '4' });
  assert.equal(fmtVal(fr.volume), '28π');
  assert.equal(fmtVal(fr.surface), '42π'); // 16π + π + 5·5π
  const ball = solid('ball', { r: '3' });
  assert.equal(fmtVal(ball.volume), '36π');
  assert.equal(fmtVal(ball.surface), '36π');
  assert.equal(fmtVal(solid('ball', { r: '1' }).volume), '4π/3');
  // образующая не извлекается: площадь остаётся с корнем, а не округляется
  assert.equal(fmtVal(solid('cone', { r: '1', h: '1' }).surface), 'π(1 + √2)');
  assert.throws(() => solid('conefrustum', { r: '2', r2: '2', h: '1' }), /цилиндр/);
});

test('конус с осевым сечением — правильным треугольником: шары', () => {
  const get = run(solid('cone', { r: '1', h: '√3' }), [{ id: 'a', kind: 'axial' }, { id: 'i', kind: 'rSphereIn' }, { id: 'o', kind: 'rSphereOut' }]);
  assert.match(rows(get('a'))['Форма'], /^равносторонний треугольник/);
  assert.equal(rows(get('a'))['Площадь'], '√3');
  assert.equal(rows(get('i'))['Радиус r'], '√3/3'); // треть высоты
  assert.equal(rows(get('o'))['Радиус R'], '2√3/3'); // две трети высоты
});

test('конус 3–4–5: сечение, параллельное основанию, и шары', () => {
  const cone = solid('cone', { r: '3', h: '4' });
  const get = run(cone, [
    { id: 'p', kind: 'point', name: 'K', def: { t: 'gen', ang: '30', m: '1', n: '1' } },
    { id: 'l', kind: 'level', refs: ['p'] }, { id: 'i', kind: 'rSphereIn' }, { id: 'o', kind: 'rSphereOut' },
    { id: 'top', kind: 'level', refs: ['v1'] },
  ]);
  assert.equal(rows(get('l'))['Радиус'], '3/2');
  assert.equal(rows(get('l'))['Площадь'], '9π/4');
  assert.equal(rows(get('l'))['V₁ : V₂'], '7 : 1');
  assert.equal(rows(get('i'))['Радиус r'], '3/2');
  assert.equal(rows(get('o'))['Радиус R'], '25/8');
  assert.match(get('top').error, /единственную общую точку/);
});

test('цилиндр: сечение ∥ оси — прямоугольник; шары', () => {
  const cyl = solid('cylinder', { r: '2', h: '3' });
  const get = run(cyl, [
    onRim('k', 'K', '0'), onRim('l', 'L', '90'), { id: 'c', kind: 'chord', refs: ['k', 'l'] },
    { id: 'a', kind: 'axial' }, { id: 'i', kind: 'rSphereIn' }, { id: 'o', kind: 'rSphereOut' },
  ]);
  assert.match(rows(get('c'))['Форма'], /^прямоугольник/);
  assert.equal(rows(get('c'))['Площадь'], '6√2'); // хорда 2√2, высота 3
  assert.equal(rows(get('a'))['Площадь'], '12');
  assert.ok(get('i').absent); // h ≠ 2r
  assert.match(get('i').notes.join(' '), /высота равна диаметру/);
  assert.equal(rows(get('o'))['Радиус R'], '5/2');
  const sq = run(solid('cylinder', { r: '1', h: '2' }), [{ id: 'a', kind: 'axial' }, { id: 'i', kind: 'rSphereIn' }]);
  assert.match(rows(sq('a'))['Форма'], /^квадрат/);
  assert.equal(rows(sq('i'))['Радиус r'], '1');
});

test('усечённый конус: шар вписывается только при l = r + r₁', () => {
  const ok = run(solid('conefrustum', { r: '4', r2: '1', h: '4' }), [{ id: 'a', kind: 'axial' }, { id: 'i', kind: 'rSphereIn' }]);
  assert.match(rows(ok('a'))['Форма'], /^равнобедренная трапеция/);
  assert.equal(rows(ok('a'))['Площадь'], '20');
  assert.equal(rows(ok('i'))['Радиус r'], '2');
  const no = run(solid('conefrustum', { r: '3', r2: '1', h: '4' }), [{ id: 'i', kind: 'rSphereIn' }])('i');
  assert.ok(no.absent);
  assert.match(no.notes[0], /l = r \+ r₁/);
});

test('шар радиуса 5: плоскость на расстоянии 3 от центра', () => {
  const ball = solid('ball', { r: '5' });
  const get = run(ball, [
    { id: 'k', kind: 'point', name: 'K', def: { t: 'ratio', a: 'v0', b: 'v2', m: '3', n: '2' } },
    { id: 'l', kind: 'level', refs: ['k'] },
    onRim('p', 'P', '0'), onRim('q', 'Q', '90'), { id: 's', kind: 'plane3', refs: ['p', 'q', 'v2'] },
    { id: 't', kind: 'level', refs: ['v2'] },
  ]);
  assert.equal(rows(get('l'))['Радиус'], '4');
  assert.equal(rows(get('l'))['Площадь'], '16π');
  assert.equal(rows(get('l'))['Длина окружности'], '8π');
  // наклонная плоскость через три точки сферы — тоже круг: x + y + z = 5, d = 5/√3
  assert.equal(rows(get('s'))['Расстояние от центра шара'], '5√3/3');
  assert.equal(rows(get('s'))['Площадь'], '50π/3');
  assert.match(get('t').error, /касается шара/);
});

test('наклонные сечения честно не строятся', () => {
  const cyl = solid('cylinder', { r: '2', h: '3' });
  let r = run(cyl, [onRim('k', 'K', '0'), onRim('l', 'L', '90'), onRim('m', 'M', '180', 1), { id: 's', kind: 'plane3', refs: ['k', 'l', 'm'] }])('s');
  assert.equal(r.badge, 'не поддерживается');
  assert.match(r.notes[0], /эллипс/);
  assert.equal(r.rows.length, 0);
  // конус r = h: образующая наклонена к оси под 45°
  const cone = solid('cone', { r: '2', h: '2' });
  const gen = (id, name, ang, m, n) => ({ id, kind: 'point', name, def: { t: 'gen', ang, m, n } });
  // плоскость ∥ оси, не через неё — гипербола
  r = run(cone, [onRim('k', 'K', '0'), onRim('l', 'L', '90'), gen('m', 'M', '45', '1', '1'), { id: 's', kind: 'plane3', refs: ['k', 'l', 'm'] }])('s');
  assert.match(r.notes[0], /гипербола/);
  // плоскость x = z параллельна образующей под 180° и не проходит через вершину — парабола
  r = run(cone, [onRim('a', 'K', '90'), onRim('b', 'L', '270'), gen('c', 'M', '0', '1', '1'), { id: 's', kind: 'plane3', refs: ['a', 'b', 'c'] }])('s');
  assert.equal(r.badge, 'не поддерживается');
  assert.match(r.notes[0], /парабола/);
  // чуть положе — эллипс (срезанный основанием)
  r = run(cone, [onRim('a', 'K', '90'), onRim('b', 'L', '270'), gen('c', 'M', '0', '1', '3'), { id: 's', kind: 'plane3', refs: ['a', 'b', 'c'] }])('s');
  assert.match(r.notes[0], /эллипс/);
  // сечение через вершину и хорду основания — треугольник, оно строится
  r = run(cone, [onRim('k', 'K', '0'), onRim('l', 'L', '90'), { id: 's', kind: 'apexSec', refs: ['k', 'l'] }])('s');
  assert.match(rows(r)['Форма'], /треугольник/);
  assert.equal(rows(r)['Площадь'], '2√3'); // стороны 2√2, 2√2, 2√2
});
