// Тела вращения: цилиндр, конус, усечённый конус и шар.
// Отдельная ветка кода — ядро для многогранников (грани, рёбра, отсечение плоскостью)
// здесь не используется. Всё считается точно; π остаётся символом (см. piVal в math/num.js).
//
// Система координат: ось тела — ось z, центр нижнего основания O — начало координат.
// У шара начало координат — центр, диаметр AB лежит на оси z.
import { N, ZERO, ONE, TWO, parseNum, rootOf, sqrtNum, sumVals, piVal, fmtVal, fmtNum, fmtApprox, valToNumber, isPlain } from '../math/num.js';
import { sub, dot, cross, len2, lerp, scale, isZeroVec, eqVec } from '../math/vec.js';
import { polygonArea } from './solids.js';
import { EVAL, evaluate, classifyPolygon, POINT_POOL } from './construct.js';

const NESTED = 'Координаты вершин сечения выражаются вложенными радикалами — точно построить такое сечение программа не может.';
const THREE = N(3), FOUR = N(4);

// ───────────────────────── точные углы, кратные 15° ─────────────────────────

export const ANGLE_STEP = 15;
const COS = ['1', '(√6+√2)/4', '√3/2', '√2/2', '1/2', '(√6-√2)/4', '0'].map(parseNum);
/** cos(k·15°) точно */
function cosK(k) {
  k = ((k % 24) + 24) % 24;
  if (k > 12) k = 24 - k;
  return k > 6 ? COS[12 - k].neg() : COS[k];
}
const sinK = (k) => cosK(k - 6);
function angleK(src) {
  const a = Number(src ?? 0);
  if (!Number.isInteger(a) || a % ANGLE_STEP) throw new Error(`Угол должен быть кратен ${ANGLE_STEP}° — только для таких углов координаты точки выражаются через квадратные корни.`);
  return a / ANGLE_STEP;
}

/** k·v, где v — Num или несократимый корень */
const mulRoot = (k, v) => (v.root ? { root: v.root.mul(k.sq()) } : k.mul(v));

// ──────────────────────────────── фигура ────────────────────────────────

export function buildRound(spec, p) {
  const shape = spec.kind, r = p.r;
  let r0 = r, r1 = r, h, names, verts, volK, surface, info = [];
  if (shape === 'ball') {
    h = r.mul(TWO);
    names = ['O', 'A', 'B'];
    verts = [[ZERO, ZERO, ZERO], [ZERO, ZERO, r.neg()], [ZERO, ZERO, r]];
    volK = r.mul(r).mul(r).mul(FOUR).div(THREE);
    surface = piVal(r.sq().mul(FOUR));
    info = [['Диаметр', h], ['Площадь большого круга', piVal(r.sq())]];
  } else {
    h = p.h;
    if (shape === 'cone') r1 = ZERO;
    if (shape === 'conefrustum') {
      r1 = p.r2;
      if (r1.eq(r0)) throw new Error('Радиусы оснований равны — это уже не усечённый конус, а цилиндр.');
    }
    names = ['O', shape === 'cone' ? 'S' : 'O₁'];
    verts = [[ZERO, ZERO, ZERO], [ZERO, ZERO, h]];
    const l = rootOf(h.sq().add(r0.sub(r1).sq())); // образующая
    volK = h.mul(r0.sq().add(r0.mul(r1)).add(r1.sq())).div(THREE);
    const lateral = mulRoot(r0.add(r1), l);
    surface = piVal(sumVals([r0.sq(), r1.sq(), lateral]));
    info = [['Образующая', l], ['Площадь боковой поверхности', piVal(lateral)]];
  }
  const z0 = verts[shape === 'ball' ? 1 : 0][2], z1 = z0.add(h);
  return {
    spec, round: true, shape, params: p, r0, r1, h, z0, z1, names, verts,
    faces: [], edges: [], planes: [], faceNames: [], baseSize: 0, baseCoords: '',
    centroid: [ZERO, ZERO, z0.add(z1).div(TWO)],
    volK, volume: piVal(volK), surface, info,
  };
}

/** Точка окружности основания (у шара — экватора) под углом k·15° */
export function rimPoint(S, base, k) {
  const rad = S.shape === 'ball' || !base ? S.r0 : S.r1;
  return [rad.mul(cosK(k)), rad.mul(sinK(k)), S.shape === 'ball' || !base ? ZERO : S.h];
}

// ─────────────────────────────── инструменты ───────────────────────────────

const P3 = ['1-я точка плоскости', '2-я точка плоскости', '3-я точка плоскости'];
const P2 = ['1-я точка плоскости', '2-я точка плоскости'];
const TOOLS = {
  point: { title: 'Точка на фигуре', free: true, hint: 'Кликните по окружности основания, по боковой поверхности (точка ляжет на образующую) или по отмеченной точке' },
  ratio: { title: 'Точка на отрезке', slots: ['начало отрезка', 'конец отрезка'] },
  axial: { title: 'Осевое сечение', slots: [] },
  level: { title: 'Сечение ∥ основанию', slots: ['точка, через которую пройдёт сечение'] },
  chord: { title: 'Сечение ∥ оси', slots: P2 },
  apexSec: { title: 'Сечение через вершину', slots: P2 },
  plane3: { title: 'Сечение через три точки', slots: P3 },
  rSphereIn: { title: 'Вписанный шар', slots: [] },
  rSphereOut: { title: 'Описанный шар', slots: [] },
  dist: { title: 'Расстояние', slots: ['первая точка', 'вторая точка'] },
  angleLL: { title: 'Угол между прямыми', slots: ['1-я прямая: первая точка', '1-я прямая: вторая точка', '2-я прямая: первая точка', '2-я прямая: вторая точка'] },
  perpLine: { title: 'Перпендикуляр к прямой', slots: ['точка, из которой опускаем', '1-я точка прямой', '2-я точка прямой'] },
};
const BALL_TOOLS = {
  ...TOOLS,
  point: { ...TOOLS.point, hint: 'Кликните по экватору шара или по отмеченной точке' },
  axial: { ...TOOLS.axial, title: 'Сечение через центр' },
  level: { ...TOOLS.level, title: 'Сечение ⟂ диаметру AB' },
};

export const roundTools = (shape) => (shape === 'ball' ? BALL_TOOLS : TOOLS);

export function roundToolGroups(shape) {
  const sections = ['axial', 'level', ...(shape === 'cylinder' ? ['chord'] : shape === 'cone' ? ['apexSec'] : []), 'plane3'];
  return [
    ['Точки', ['point', 'ratio']],
    ['Сечения', sections],
    ...(shape === 'ball' ? [] : [['Шары', ['rSphereIn', 'rSphereOut']]]),
    ['Измерения', ['dist', 'angleLL', 'perpLine']],
  ];
}

// ─────────────────────────── вспомогательная геометрия ───────────────────────────

const row = (k, val, unit = '') => ({ k, v: fmtVal(val) + unit, a: isPlain(val) ? '' : fmtApprox(valToNumber(val)) });
const text = (k, v) => ({ k, v, a: '' });

/** Знак числа c + s·√q2 (s = ±1, q2 ≥ 0) без извлечения корня */
function signWithRoot(c, q2, s) {
  if (q2.isZero()) return c.sign();
  if (c.sign() * s >= 0) return s;
  const k = c.sq().cmp(q2);
  return k > 0 ? c.sign() : k === 0 ? 0 : s;
}

/** Хорда: пересечение прямой nx·x + ny·y = d (в плоскости высоты z) с окружностью радиуса r вокруг оси */
function chordEnds(nx, ny, d, r, z) {
  const m2 = nx.sq().add(ny.sq());
  const q = r.sq().sub(d.sq().div(m2)).div(m2); // (полухорда / |n|)²
  if (q.sign() <= 0) return { sign: q.sign() };
  const s = sqrtNum(q);
  if (!s) throw new Error(NESTED);
  const fx = nx.mul(d).div(m2), fy = ny.mul(d).div(m2);
  return { sign: 1, a: [fx.sub(ny.mul(s)), fy.add(nx.mul(s)), z], b: [fx.add(ny.mul(s)), fy.sub(nx.mul(s)), z] };
}

/** Отношение объёмов: «p : q», если оно рационально */
function volumeRows(S, v1, names) {
  const v2 = S.volK.sub(v1);
  if (v1.sign() <= 0 || v2.sign() <= 0) return [];
  const k = v1.div(v2), [p, q] = k.rational();
  return [row(`V₁ (${names[0]})`, piVal(v1)), row(`V₂ (${names[1]})`, piVal(v2)), k.isRational() ? text('V₁ : V₂', `${p} : ${q}`) : row('V₁ / V₂', k)];
}

/** Сечение-многоугольник (осевое, параллельное оси, через вершину) */
function polygonSection(it, ctx, pl, pts, notes) {
  const named = pts.map((p, i) => ctx.reg(it, 'k' + i, p, pl.pool || POINT_POOL));
  const names = named.map((p) => p.name);
  const sides = pts.map((p, i) => rootOf(len2(sub(pts[(i + 1) % pts.length], p))));
  return {
    title: pl.title, notes,
    rows: [text('Форма', `${classifyPolygon(pts)} ${names.join('')}`), row('Площадь', polygonArea(pts)), row('Периметр', sumVals(sides))],
    draw: { polys: [{ pts, cls: 'section' }], segs: pts.map((p, i) => ({ a: p, b: pts[(i + 1) % pts.length], cls: 'main' })) },
    section: { pts, names, sides, n: pl.n, d: pl.d, onFace: false, given: [] },
  };
}

/** Сечение плоскостью z = const, перпендикулярной оси: круг */
function levelSection(it, ctx, z, title, via) {
  const S = ctx.solid, ball = S.shape === 'ball';
  if (z.cmp(S.z0) < 0 || z.cmp(S.z1) > 0) return { title, error: 'Плоскость проходит мимо фигуры: сечения нет.' };
  const rad = ball ? null : S.r0.add(S.r1.sub(S.r0).mul(z).div(S.h));
  const rho2 = ball ? S.r0.sq().sub(z.sq()) : rad.sq();
  if (rho2.isZero()) {
    const at = ball ? (z.sign() < 0 ? 'A' : 'B') : 'S';
    return { title, error: ball ? `Плоскость касается шара в точке ${at}: сечения нет.` : 'Плоскость проходит через вершину S и имеет с конусом единственную общую точку: сечения нет.' };
  }
  const c = [ZERO, ZERO, z];
  const O = ctx.reg(it, 'O', c, 'O');
  const rho = rootOf(rho2);
  const rows = [
    text('Форма', ball && z.isZero() ? `большой круг с центром ${O.name}` : `круг с центром ${O.name}`),
    row('Радиус', rho), row('Площадь', piVal(rho2)), row('Длина окружности', piVal(mulRoot(TWO, rho))),
  ];
  const notes = [];
  if (ball) {
    const hh = z.add(S.r0); // высота сегмента со стороны A
    rows.push(...volumeRows(S, hh.sq().mul(S.r0.mul(THREE).sub(hh)).div(THREE), ['сегмент с точкой A', 'сегмент с точкой B']));
    if (!z.isZero()) rows.push(row('Расстояние от центра шара', z.sign() < 0 ? z.neg() : z));
  } else if (z.eq(S.z0) || z.eq(S.z1)) {
    notes.push('Плоскость содержит основание: сечение совпадает с ним и не делит фигуру на части.');
  } else {
    const top = S.shape === 'cone' ? 'часть с вершиной S' : 'часть у верхнего основания';
    rows.push(...volumeRows(S, z.mul(S.r0.sq().add(S.r0.mul(rad)).add(rad.sq())).div(THREE), ['часть у нижнего основания', top]));
    if (S.shape !== 'cylinder') notes.push(`Сечение подобно нижнему основанию с коэффициентом ${fmtNum(rad.div(S.r0))}.`);
  }
  const draw = { circs: [{ c, n: [ZERO, ZERO, ONE], rho: Math.sqrt(rho2.toNumber()), cls: 'main', fill: true }] };
  if (via && len2(sub(via.pos, c)).eq(rho2)) draw.segs = [{ a: c, b: via.pos, cls: 'aux' }];
  return { title, rows, notes, draw };
}

/**
 * Сечение произвольной плоскостью n·x = d. Точно строятся: круг (плоскость ⟂ оси или любая
 * плоскость для шара) и многоугольники (осевое сечение, сечение цилиндра ∥ оси, сечение
 * конуса через вершину). Наклонные сечения — эллипс, парабола, гипербола — только называются.
 */
function planeSection(it, ctx, pl) {
  const S = ctx.solid, [nx, ny, nz] = pl.n, title = pl.title;
  const m2 = nx.sq().add(ny.sq());
  const ghost = pl.given.length >= 3 ? { polys: [{ pts: pl.given.map((p) => p.pos), cls: 'ghost' }] } : {};
  if (m2.isZero()) return levelSection(it, ctx, pl.d.div(nz), title, pl.given[0]);

  if (S.shape === 'ball') {
    const nn = len2(pl.n), dist2 = pl.d.sq().div(nn), rho2 = S.r0.sq().sub(dist2);
    if (rho2.sign() < 0) return { title, error: `Плоскость проходит мимо шара: расстояние от центра до неё ${fmtVal(rootOf(dist2))} больше радиуса.`, draw: ghost };
    if (rho2.isZero()) return { title, error: 'Плоскость касается шара: у них единственная общая точка, сечения нет.', draw: ghost };
    const c = scale(pl.n, pl.d.div(nn));
    const O = ctx.reg(it, 'O', c, 'O');
    const rho = rootOf(rho2);
    const rows = [
      text('Форма', dist2.isZero() ? `большой круг с центром ${O.name}` : `круг с центром ${O.name}`),
      row('Радиус', rho), row('Площадь', piVal(rho2)), row('Длина окружности', piVal(mulRoot(TWO, rho))),
    ];
    if (!dist2.isZero()) rows.push(row('Расстояние от центра шара', rootOf(dist2)));
    return {
      title, rows, notes: ['Любое сечение шара плоскостью — круг; его радиус ρ = √(R² − d²), где d — расстояние от центра шара до плоскости.'],
      draw: { ...ghost, circs: [{ c, n: pl.n, rho: Math.sqrt(rho2.toNumber()), cls: 'main', fill: true }] },
    };
  }

  // Вершина конуса (для усечённого — вершина полного конуса); у цилиндра её нет
  const apexZ = S.r0.eq(S.r1) ? null : S.h.mul(S.r0).div(S.r0.sub(S.r1));
  const throughApex = apexZ !== null && nz.mul(apexZ).eq(pl.d);
  const alongAxis = nz.isZero();
  if (alongAxis ? (S.shape === 'cylinder' || pl.d.isZero()) : throughApex) {
    // Плоскость пересекает боковую поверхность по образующим: сечение — многоугольник
    const bot = chordEnds(nx, ny, pl.d, S.r0, ZERO);
    if (bot.sign < 0) return { title, error: `${pl.label} не пересекает фигуру: сечения нет.`, draw: ghost };
    if (bot.sign === 0) return { title, error: `${pl.label} касается боковой поверхности по образующей: сечение вырождается в отрезок.`, draw: ghost };
    const pts = [bot.a, bot.b];
    if (S.r1.isZero()) pts.push(ctx.get('v1').pos);
    else { const top = chordEnds(nx, ny, pl.d.sub(nz.mul(S.h)), S.r1, S.h); pts.push(top.b, top.a); }
    const notes = [];
    if (alongAxis && pl.d.isZero()) notes.push('Плоскость содержит ось фигуры — это осевое сечение.');
    else if (alongAxis) notes.push(`Плоскость параллельна оси и удалена от неё на ${fmtVal(rootOf(pl.d.sq().div(m2)))}; боковые стороны прямоугольника — образующие цилиндра.`);
    else notes.push(S.shape === 'cone' ? 'Плоскость проходит через вершину конуса: боковые стороны сечения — образующие.' : 'Плоскость проходит через вершину полного конуса: боковые стороны сечения лежат на образующих.');
    return polygonSection(it, ctx, pl, pts, notes);
  }

  // Наклонная плоскость: сечение ограничено кривой второго порядка
  const levels = [[ZERO, S.r0], [S.h, S.r1]].map(([z, rad]) => [nz.mul(z).sub(pl.d), m2.mul(rad.sq())]);
  const hi = Math.max(...levels.map(([c, q]) => signWithRoot(c, q, 1)));
  const lo = Math.min(...levels.map(([c, q]) => signWithRoot(c, q, -1)));
  if (hi <= 0 || lo >= 0) return { title, error: `${pl.label} проходит мимо фигуры или только касается её: сечения нет.`, draw: ghost };
  let curve;
  if (S.shape === 'cylinder') curve = 'эллипс';
  else {
    // сравниваем наклон плоскости к оси с наклоном образующей
    const dr2 = S.r0.sub(S.r1).sq();
    const k = nz.sq().mul(dr2.add(S.h.sq())).cmp(len2(pl.n).mul(dr2));
    curve = k > 0 ? 'эллипс' : k === 0 ? 'парабола' : 'гипербола (одна её ветвь)';
  }
  const cutsBase = levels.some(([c, q]) => !q.isZero() && c.sq().cmp(q) < 0);
  const why = alongAxis ? 'Плоскость параллельна оси конуса, но не содержит её' : 'Плоскость наклонена к оси';
  return {
    title, badge: 'не поддерживается', draw: ghost,
    notes: [
      `${why}: линия пересечения с боковой поверхностью — ${curve}.${cutsBase ? ' Плоскость задевает основание, поэтому в сечении только часть этой кривой, замкнутая хордой.' : ''}`,
      'Такие сечения программа не строит: кривую пришлось бы рисовать и измерять приближённо, а здесь всё считается точно. Поддерживаются осевое сечение, сечение, параллельное основанию, сечение цилиндра, параллельное оси, и сечение конуса через вершину.',
    ],
  };
}

// ─────────────────────────────── построения ───────────────────────────────

const where = (S, z) => (z.cmp(S.z0) < 0 || z.cmp(S.z1) > 0 ? 'вне фигуры' : z.eq(S.z0) || z.eq(S.z1) ? 'в плоскости основания' : 'внутри фигуры');

const ROUND = {
  point(it, ctx) {
    const S = ctx.solid, d = it.def;
    if (d.t === 'ratio') return EVAL.point(it, ctx);
    const k = angleK(d.ang), ball = S.shape === 'ball';
    let pos, desc, draw = {};
    if (d.t === 'circ') {
      if (d.base && (ball || S.r1.isZero())) throw new Error('У этой фигуры нет верхнего основания.');
      pos = rimPoint(S, d.base, k);
      desc = `${ball ? 'на экваторе шара' : `на окружности ${d.base ? 'верхнего' : 'нижнего'} основания`}, угол поворота ${k * ANGLE_STEP}°`;
      draw = { segs: [{ a: [ZERO, ZERO, pos[2]], b: pos, cls: 'aux' }] };
    } else {
      if (ball) throw new Error('У шара нет образующих.');
      const m = parseNum(d.m), n = parseNum(d.n);
      if (m.sign() < 0 || n.sign() < 0 || m.add(n).isZero()) throw new Error('Отношение должно состоять из неотрицательных чисел, не равных нулю одновременно.');
      const a = rimPoint(S, 0, k), b = rimPoint(S, 1, k);
      pos = lerp(a, b, m.div(m.add(n)));
      desc = `на образующей (угол поворота ${k * ANGLE_STEP}°), делит её в отношении ${fmtNum(m)} : ${fmtNum(n)}, считая от нижнего основания`;
      draw = { segs: [{ a, b, cls: 'aux' }] };
    }
    ctx.points.set(it.id, { ref: it.id, name: it.name, pos, role: 'user', item: it.id });
    return { title: `Точка ${it.name}`, rows: [text('Положение', desc)], draw };
  },

  axial(it, ctx) {
    const k = angleK(it.def?.ang);
    const n = [sinK(k).neg(), cosK(k), ZERO];
    return planeSection(it, ctx, { n, d: ZERO, given: [], pool: 'ABCDEFGH', label: 'Плоскость', title: ctx.solid.shape === 'ball' ? 'Сечение через центр шара' : 'Осевое сечение' });
  },

  level(it, ctx) {
    const P = ctx.get(it.refs[0]);
    return levelSection(it, ctx, P.pos[2], `Сечение через ${P.name} ${ctx.solid.shape === 'ball' ? '⟂ диаметру AB' : '∥ основанию'}`, P);
  },

  chord(it, ctx) {
    const [P, Q] = it.refs.map((r) => ctx.get(r));
    const u = sub(Q.pos, P.pos), n = [u[1], u[0].neg(), ZERO];
    if (isZeroVec(n)) throw new Error(eqVec(P.pos, Q.pos) ? `Точки ${P.name} и ${Q.name} совпадают.` : `Прямая ${P.name}${Q.name} параллельна оси — через неё проходит бесконечно много плоскостей, параллельных оси.`);
    return planeSection(it, ctx, { n, d: dot(n, P.pos), given: [P, Q], label: 'Плоскость', title: `Сечение через ${P.name}${Q.name} ∥ оси` });
  },

  apexSec(it, ctx) {
    const [P, Q] = it.refs.map((r) => ctx.get(r)), A = ctx.get('v1');
    const n = cross(sub(P.pos, A.pos), sub(Q.pos, A.pos));
    if (isZeroVec(n)) throw new Error(`Точки ${P.name}, ${Q.name} и вершина ${A.name} лежат на одной прямой — плоскость не определена.`);
    return planeSection(it, ctx, { n, d: dot(n, A.pos), given: [A, P, Q], label: 'Плоскость', title: `Сечение (${A.name}${P.name}${Q.name})` });
  },

  plane3(it, ctx) {
    const [a, b, c] = it.refs.map((r) => ctx.get(r));
    const n = cross(sub(b.pos, a.pos), sub(c.pos, a.pos));
    if (isZeroVec(n)) throw new Error(`Точки ${a.name}, ${b.name} и ${c.name} лежат на одной прямой (или совпадают) — плоскость ими не задаётся.`);
    const name = `(${a.name}${b.name}${c.name})`;
    return planeSection(it, ctx, { n, d: dot(n, a.pos), given: [a, b, c], label: `Плоскость ${name}`, title: `Сечение ${name}` });
  },

  rSphereIn(it, ctx) {
    const S = ctx.solid, { r0, r1, h } = S, title = 'Вписанный шар';
    if (S.shape === 'ball') throw new Error('Фигура сама является шаром.');
    const base = [ZERO, ZERO, ZERO], top = [ZERO, ZERO, h];
    const touch = (c, r, z, rad) => ({ spheres: [{ c, r: r.toNumber() }], circs: [{ c: [ZERO, ZERO, z], n: [ZERO, ZERO, ONE], rho: rad.toNumber(), cls: 'aux' }] });
    if (S.shape === 'cylinder') {
      const k = h.cmp(r0.mul(TWO));
      if (k !== 0) {
        return {
          title, absent: true,
          notes: [
            `Вписанного шара не существует. Шар, касающийся обоих оснований, имеет диаметр h = ${fmtNum(h)}, а шар, касающийся боковой поверхности по окружности, — диаметр 2r = ${fmtNum(r0.mul(TWO))}. ${k < 0 ? 'Шар между основаниями не достаёт до боковой поверхности.' : 'Шар, касающийся боковой поверхности, не достаёт до оснований.'}`,
            'В цилиндр можно вписать шар, только если высота равна диаметру основания (осевое сечение — квадрат).',
          ],
        };
      }
      const c = [ZERO, ZERO, r0], O = ctx.reg(it, 'O', c, 'O');
      return {
        title, rows: [row('Радиус r', r0), text('Центр', `точка ${O.name} — середина оси`)],
        notes: ['Шар касается оснований в их центрах, а боковой поверхности — по окружности (показана).'],
        draw: { ...touch(c, r0, r0, r0), dots: [base, top] },
      };
    }
    const l = sqrtNum(h.sq().add(r0.sub(r1).sq()));
    if (!l) throw new Error('Длина образующей выражается вложенным радикалом — точно найти вписанный шар программа не может.');
    if (S.shape === 'cone') {
      // в осевом сечении — окружность, вписанная в равнобедренный треугольник: r = S/p
      const r = r0.mul(h).div(r0.add(l));
      const c = [ZERO, ZERO, r], O = ctx.reg(it, 'O', c, 'O');
      const t = r0.div(l); // точка касания делит образующую: отрезок касательной от основания равен радиусу основания
      return {
        title, rows: [row('Радиус r', r), text('Центр', `точка ${O.name} на оси конуса`)],
        notes: [
          `В осевом сечении это окружность, вписанная в равнобедренный треугольник с основанием ${fmtNum(r0.mul(TWO))} и боковой стороной ${fmtNum(l)}: r = R·h / (R + l).`,
          'Шар касается основания в его центре, а боковой поверхности — по окружности (показана). В конус шар можно вписать всегда.',
        ],
        draw: { ...touch(c, r, h.mul(t), r0.mul(ONE.sub(t))), dots: [base] },
      };
    }
    // усечённый конус: в осевом сечении — окружность, вписанная в трапецию, нужна l = r + r₁
    const sum = r0.add(r1);
    if (!l.eq(sum)) {
      return {
        title, absent: true,
        notes: [
          `Вписанного шара не существует. В осевом сечении шар даёт окружность, вписанную в равнобедренную трапецию, а это возможно, только если боковая сторона равна сумме половин оснований: l = r + r₁. Здесь l = ${fmtNum(l)}, а r + r₁ = ${fmtNum(sum)}.`,
          'Равносильное условие: h² = 4·r·r₁.',
        ],
      };
    }
    const r = h.div(TWO), c = [ZERO, ZERO, r], O = ctx.reg(it, 'O', c, 'O');
    const t = r0.div(l);
    return {
      title, rows: [row('Радиус r', r), text('Центр', `точка ${O.name} — середина оси`)],
      notes: ['Образующая равна сумме радиусов оснований (l = r + r₁), поэтому шар существует. Он касается оснований в их центрах, а боковой поверхности — по окружности (показана).'],
      draw: { ...touch(c, r, h.mul(t), r0.add(r1.sub(r0).mul(t))), dots: [base, top] },
    };
  },

  rSphereOut(it, ctx) {
    const S = ctx.solid, { r0, r1, h } = S, title = 'Описанный шар';
    if (S.shape === 'ball') throw new Error('Фигура сама является шаром.');
    // центр на оси, равноудалён от окружностей оснований (у конуса — от вершины): z² + r² = (h − z)² + r₁²
    const z = h.sq().add(r1.sq()).sub(r0.sq()).div(h.mul(TWO));
    const R2 = r0.sq().add(z.sq());
    const c = [ZERO, ZERO, z], O = ctx.reg(it, 'O', c, 'O');
    const through = S.shape === 'cone' ? 'через вершину и окружность основания' : 'через окружности обоих оснований';
    return {
      title,
      rows: [row('Радиус R', rootOf(R2)), text('Центр', `точка ${O.name} на оси (${where(S, z)})`)],
      notes: [`Шар проходит ${through}. В осевом сечении это окружность, описанная около ${S.shape === 'cone' ? 'равнобедренного треугольника' : S.shape === 'cylinder' ? 'прямоугольника' : 'равнобедренной трапеции'}; такой шар существует всегда.`],
      draw: { spheres: [{ c, r: Math.sqrt(R2.toNumber()) }] },
    };
  },
};

/** Пересчёт построений на теле вращения. Точки-результаты и общий контекст — те же, что у многогранников. */
export function evaluateRound(solid, items) {
  const { dist, angleLL, perpLine } = EVAL;
  return evaluate(solid, items, { dist, angleLL, perpLine, ...ROUND });
}
