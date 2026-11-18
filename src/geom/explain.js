// Пошаговые решения методом координат: те же точные числа, что и в ответе,
// но с промежуточными векторами и формулами.
import { N, fmtNum, fmtVal, rootOf, unitStr } from '../math/num.js';
import { sub, dot, cross, det, len2, isZeroVec, scale, add } from '../math/vec.js';

// Если размеры фигуры заданы буквой, все числа здесь — коэффициенты при её степенях.
// Степень (deg) каждой величины известна из её смысла: координата и длина — 1,
// векторное произведение двух таких векторов — 2, смешанное произведение — 3 и т. д.
let SYM = null; // буква текущей фигуры (выставляется в explain)
const num = (x, deg = 0) => fmtNum(x, unitStr(SYM, deg));
const pt = (p) => `${p.name}(${p.pos.map((c) => num(c, 1)).join('; ')})`;
const vv = (v, deg = 1) => `(${v.map((c) => num(c, deg)).join('; ')})`;
/** √x, где x — величина степени 2·deg */
const root = (x, deg = 1) => fmtVal(rootOf(x), unitStr(SYM, deg));
const absStr = (x, deg) => num(x.sign() < 0 ? x.neg() : x, deg);

function coords(...ps) {
  const uniq = ps.filter((p, i) => ps.indexOf(p) === i);
  return `Введём систему координат, связанную с фигурой. Координаты точек: ${uniq.map(pt).join(', ')}.`;
}

function planeLines(a, b, c) {
  const ab = sub(b.pos, a.pos), ac = sub(c.pos, a.pos), n = cross(ab, ac);
  return { n, name: `(${a.name}${b.name}${c.name})`, line: `Нормаль к плоскости (${a.name}${b.name}${c.name}): n = ${a.name}${b.name} × ${a.name}${c.name} = ${vv(ab)} × ${vv(ac)} = ${vv(n, 2)}.` };
}

const EXPLAIN = {
  dist(it, ctx) {
    const [a, b] = it.refs.map((r) => ctx.get(r));
    const d = sub(b.pos, a.pos);
    return [coords(a, b), `Вектор ${a.name}${b.name} = ${vv(d)}.`, `Длина: |${a.name}${b.name}| = √(x² + y² + z²) = √(${num(len2(d), 2)}) = ${root(len2(d))}.`];
  },

  perpPlane(it, ctx) {
    const [p, a, b, c] = it.refs.map((r) => ctx.get(r));
    const pl = planeLines(a, b, c), ap = sub(p.pos, a.pos), k = dot(pl.n, ap), nn = len2(pl.n);
    const out = [coords(p, a, b, c), pl.line, `Вектор ${a.name}${p.name} = ${vv(ap)}; скалярное произведение n · ${a.name}${p.name} = ${num(k, 3)}; |n| = ${root(nn, 2)}.`,
      `Расстояние от точки до плоскости: ρ = |n · ${a.name}${p.name}| / |n| = ${absStr(k, 3)} / ${root(nn, 2)} = ${root(k.sq().div(nn))}.`];
    if (!k.isZero()) out.push(`Основание перпендикуляра: H = ${p.name} − (n · ${a.name}${p.name} / |n|²) · n = ${vv(sub(p.pos, scale(pl.n, k.div(nn))))}.`);
    return out;
  },

  perpLine(it, ctx) {
    const [p, a, b] = it.refs.map((r) => ctx.get(r));
    const u = sub(b.pos, a.pos), ap = sub(p.pos, a.pos), t = dot(ap, u).div(len2(u));
    const h = add(a.pos, scale(u, t));
    return [coords(p, a, b), `Направляющий вектор прямой: u = ${a.name}${b.name} = ${vv(u)}; вектор ${a.name}${p.name} = ${vv(ap)}.`,
      `Основание H перпендикуляра — проекция точки на прямую: H = ${a.name} + t·u, где t = (${a.name}${p.name} · u) / (u · u) = ${num(dot(ap, u), 2)} / ${num(len2(u), 2)} = ${num(t)}.`,
      `H = ${vv(h)}; вектор ${p.name}H = ${vv(sub(h, p.pos))}.`, `Расстояние: |${p.name}H| = ${root(len2(sub(h, p.pos)))}.`];
  },

  commonPerp(it, ctx) {
    const [a, b, c, d] = it.refs.map((r) => ctx.get(r));
    const u = sub(b.pos, a.pos), v = sub(d.pos, c.pos), w = cross(u, v), ac = sub(c.pos, a.pos);
    const head = [coords(a, b, c, d), `Направляющие векторы: u = ${a.name}${b.name} = ${vv(u)}, v = ${c.name}${d.name} = ${vv(v)}.`];
    if (isZeroVec(w)) return [...head, 'u × v = 0, то есть прямые параллельны. Расстояние между ними равно расстоянию от любой точки одной прямой до другой прямой.'];
    const k = dot(ac, w), ww = len2(w);
    const out = [...head, `Общий перпендикуляр параллелен вектору w = u × v = ${vv(w, 2)}, |w| = ${root(ww, 2)}.`,
      `Вектор ${a.name}${c.name} = ${vv(ac)} соединяет точки двух прямых; его проекция на w и есть расстояние: ρ = |${a.name}${c.name} · w| / |w| = ${absStr(k, 3)} / ${root(ww, 2)} = ${root(k.sq().div(ww))}.`];
    if (k.isZero()) out.push('Расстояние равно нулю — прямые лежат в одной плоскости и пересекаются.');
    else {
      const s = det(ac, v, w).div(ww), t = det(ac, u, w).div(ww);
      out.push(`Основания перпендикуляра: H₁ = ${a.name} + s·u, H₂ = ${c.name} + t·v, где s = ${num(s)}, t = ${num(t)} (из условия H₁H₂ ⟂ u и H₁H₂ ⟂ v). H₁ = ${vv(add(a.pos, scale(u, s)))}, H₂ = ${vv(add(c.pos, scale(v, t)))}.`);
    }
    return out;
  },

  angleLL(it, ctx) {
    const [a, b, c, d] = it.refs.map((r) => ctx.get(r));
    const u = sub(b.pos, a.pos), v = sub(d.pos, c.pos), k = dot(u, v);
    return [coords(a, b, c, d), `Направляющие векторы: u = ${a.name}${b.name} = ${vv(u)}, v = ${c.name}${d.name} = ${vv(v)}.`,
      `u · v = ${num(k, 2)}, |u| = ${root(len2(u))}, |v| = ${root(len2(v))}.`,
      `Угол между прямыми: cos φ = |u · v| / (|u|·|v|) = ${root(k.sq().div(len2(u).mul(len2(v))), 0)}.`];
  },

  angleLP(it, ctx) {
    const [a, b, p, q, r] = it.refs.map((x) => ctx.get(x));
    const u = sub(b.pos, a.pos), pl = planeLines(p, q, r), k = dot(u, pl.n);
    return [coords(a, b, p, q, r), `Направляющий вектор прямой: u = ${a.name}${b.name} = ${vv(u)}.`, pl.line,
      `u · n = ${num(k, 3)}, |u| = ${root(len2(u))}, |n| = ${root(len2(pl.n), 2)}.`,
      `Угол между прямой и плоскостью дополняет до 90° угол между прямой и нормалью: sin φ = |u · n| / (|u|·|n|) = ${root(k.sq().div(len2(u).mul(len2(pl.n))), 0)}.`];
  },

  anglePP(it, ctx) {
    const ps = it.refs.map((x) => ctx.get(x));
    const p1 = planeLines(ps[0], ps[1], ps[2]), p2 = planeLines(ps[3], ps[4], ps[5]), k = dot(p1.n, p2.n);
    return [coords(...ps), p1.line.replace('n =', 'n₁ ='), p2.line.replace('n =', 'n₂ ='),
      `n₁ · n₂ = ${num(k, 4)}, |n₁| = ${root(len2(p1.n), 2)}, |n₂| = ${root(len2(p2.n), 2)}.`,
      `Угол между плоскостями равен углу между их нормалями (берём острый): cos φ = |n₁ · n₂| / (|n₁|·|n₂|) = ${root(k.sq().div(len2(p1.n).mul(len2(p2.n))), 0)}.`];
  },

  section(it, ctx) {
    const sec = ctx.results.get(it.id).section;
    if (!sec) return null;
    const named = sec.pts.map((pos, i) => ({ name: sec.names[i], pos }));
    return [`Нормаль к секущей плоскости: n = ${vv(sec.n, 2)}; вершины сечения — точки, где плоскость пересекает рёбра: ${named.map(pt).join(', ')}.`,
      `Площадь: разбиваем многоугольник на треугольники с общей вершиной ${sec.names[0]} и складываем векторные произведения: S = ½·|Σ ${sec.names[0]}Pᵢ × ${sec.names[0]}Pᵢ₊₁|.`,
      'Объём части: каждую грань фигуры обрезаем плоскостью и складываем объёмы пирамид с вершиной в точке сечения и основаниями — оставшимися кусками граней (V = ⅙·|a · (b × c)| для каждого треугольника).'];
  },

  secPar2(it, ctx) {
    const [, a, b, c, d] = it.refs.map((r) => ctx.get(r));
    const u = sub(b.pos, a.pos), v = sub(d.pos, c.pos);
    return [`Направляющие векторы: u = ${a.name}${b.name} = ${vv(u)}, v = ${c.name}${d.name} = ${vv(v)}. Плоскость параллельна обеим прямым, значит её нормаль перпендикулярна u и v: n = u × v.`,
      ...EXPLAIN.section(it, ctx)];
  },

  sphereOut(it, ctx) {
    const o = ctx.points.get(`${it.id}:O`), S = ctx.solid;
    const out = ['Центр описанной сферы равноудалён от всех вершин. Из равенств |OA|² = |OB|² = |OC|² = … после вычитания получаются линейные уравнения относительно координат центра.'];
    if (o) out.push(`Решение системы: ${pt(o)}; радиус R = |O${S.names[0]}| = ${root(len2(sub(o.pos, S.verts[0])))}. Проверка: остальные вершины удалены от O на то же расстояние.`);
    else out.push('Система несовместна: точки, равноудалённой от всех вершин, нет.');
    return out;
  },

  sphereIn(it, ctx) {
    const o = ctx.points.get(`${it.id}:O`), S = ctx.solid;
    const out = ['Центр вписанной сферы удалён от плоскостей всех граней на одно и то же расстояние r. Записываем расстояние от точки (x; y; z) до каждой грани через единичную нормаль — получается линейная система относительно x, y, z и r.'];
    if (!o) return [...out, 'Система несовместна: точки, равноудалённой от всех граней, нет.'];
    const pl = S.planes[0], r2 = dot(pl.n, o.pos).sub(pl.d).sq().div(len2(pl.n));
    out.push(`Решение системы: ${pt(o)}, r = ${root(r2)}.`);
    if (S.surface.t) out.push(`Проверка формулой r = 3V / S: 3 · ${num(S.volume, 3)} / ${num(S.surface, 2)} = ${num(S.volume.mul(N(3)).div(S.surface), 1)}.`);
    return out;
  },
};

/** Строки решения для построения или null, если объяснять нечего */
export function explain(item, ctx) {
  const res = ctx.results.get(item.id);
  if (!EXPLAIN[item.kind] || res.error) return null;
  SYM = ctx.solid.unit;
  try {
    const out = EXPLAIN[item.kind](item, ctx);
    if (out && SYM) out.unshift(`Все размеры фигуры пропорциональны ${SYM} (${SYM} > 0), поэтому координаты и длины содержат множитель ${SYM}, площади — ${SYM}², объёмы — ${SYM}³; углы и отношения от ${SYM} не зависят.`);
    return out;
  } catch { return null; }
}
