// Пошаговое построение сечения методом следов — так, как его строят в тетради:
// две точки в одной грани → прямая в этой грани; её пересечения с рёбрами и
// продолжениями рёбер дают новые точки в соседних гранях, и так далее.
import { ONE } from '../math/num.js';
import { add, sub, scale, dot, cross, lerp, eqVec, isZeroVec } from '../math/vec.js';

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const subscript = (k) => String(k).replace(/\d/g, (d) => SUB[d]);
const RANK = { given: 0, vertex: 1, aux: 2 };

/**
 * @param S    фигура
 * @param sec  { n, d, pts, names, given: [{name, pos}] } — плоскость, вершины сечения и заданные точки
 * @param used занятые имена точек
 * @returns [{ text, segs: [{a, b, cls}], labels: [{name, pos}], found: string[] }] | null
 */
export function buildTrace(S, sec, used) {
  const f = S.verts.map((v) => dot(sec.n, v).sub(sec.d));
  const inFace = (fi, p) => dot(S.planes[fi].n, p).eq(S.planes[fi].d);
  const faceSecPts = S.faces.map((_, fi) => sec.pts.filter((p) => inFace(fi, p)));
  if (faceSecPts.some((q) => q.length > 2)) return null; // плоскость содержит грань — строить нечего
  const crossed = faceSecPts.map((q) => q.length === 2);

  const known = [];
  const find = (pos) => known.find((k) => eqVec(k.pos, pos));
  const learn = (name, pos, kind) => { const k = { name, pos, kind }; known.push(k); return k; };
  for (const g of sec.given) if (!find(g.pos)) learn(g.name, g.pos, 'given');
  let auxN = 0;
  const auxName = () => { let nm; do nm = 'T' + subscript(++auxN); while (used.has(nm)); return nm; };
  const secName = (pos) => { const i = sec.pts.findIndex((p) => eqVec(p, pos)); return i < 0 ? null : sec.names[i]; };
  const knownIn = (fi) => known.filter((k) => inFace(fi, k.pos)).sort((a, b) => RANK[a.kind] - RANK[b.kind]);
  const edgeName = (a, b) => S.names[a] + S.names[b];
  const otherFace = (fi, a, b) => S.faces.findIndex((g, gi) => gi !== fi && g.includes(a) && g.includes(b));

  const steps = [];
  const done = new Map(); // грань → шаг, в котором найден её след

  /** След в грани fi известен: находим его точки на рёбрах и на продолжениях рёбер */
  const traceFace = (step) => {
    const face = S.faces[step.face];
    step.outs = [];
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length];
      if (f[a].eq(f[b])) return; // ребро параллельно секущей плоскости
      const t = f[a].div(f[a].sub(f[b]));
      const pos = lerp(S.verts[a], S.verts[b], t);
      const inside = t.sign() >= 0 && t.cmp(ONE) <= 0;
      let k = find(pos);
      const isNew = !k;
      if (!k) k = learn(inside ? secName(pos) : auxName(), pos, inside ? 'vertex' : 'aux');
      if (step.outs.some((o) => o.k === k)) return;
      step.outs.push({ k, isNew, inside, edge: [a, b], atVertex: inside && (t.isZero() || t.eq(ONE)) ? (t.isZero() ? a : b) : -1 });
    });
    step.side = crossed[step.face] ? faceSecPts[step.face].map((p) => find(p)) : null;
    done.set(step.face, step);
    steps.push(step);
  };

  for (let guard = 0; guard < 4 * S.faces.length; guard++) {
    const todo = S.faces.map((_, i) => i).filter((i) => !done.has(i));
    if (!todo.some((i) => crossed[i])) break;

    // 1. в грани, которую пересекает плоскость, уже есть две точки
    let fi = todo.find((i) => crossed[i] && knownIn(i).length >= 2);
    if (fi !== undefined) { traceFace({ type: 'two', face: fi, uses: knownIn(fi).slice(0, 2) }); continue; }

    // 2. одна точка и параллельная грань с уже найденным следом
    let par;
    fi = todo.find((i) => crossed[i] && knownIn(i).length === 1
      && (par = [...done.values()].find((s) => s.side && isZeroVec(cross(S.planes[i].n, S.planes[s.face].n)))));
    if (fi !== undefined) { traceFace({ type: 'par', face: fi, uses: [knownIn(fi)[0], ...par.side], parFace: par.face }); continue; }

    // 3. вспомогательная грань (плоскость её не пересекает), в которой известны две точки
    fi = todo.find((i) => !crossed[i] && knownIn(i).length >= 2 && !isZeroVec(cross(S.planes[i].n, sec.n)));
    if (fi !== undefined) { traceFace({ type: 'two', face: fi, uses: knownIn(fi).slice(0, 2) }); continue; }

    // 4. иначе ищем точки следа: прямая через две известные точки пересекает плоскость грани
    fi = todo.find((i) => crossed[i]);
    const pl = S.planes[fi];
    const have = knownIn(fi).slice(0, 1);
    const hits = [];
    let parallel = null;
    const pool = [...known].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
    for (let i = 0; i < pool.length && have.length < 2; i++) {
      for (let j = i + 1; j < pool.length && have.length < 2; j++) {
        const dir = sub(pool[j].pos, pool[i].pos), den = dot(pl.n, dir);
        if (den.isZero()) { if (!inFace(fi, pool[i].pos)) parallel = parallel || [pool[i], pool[j]]; continue; }
        const pos = add(pool[i].pos, scale(dir, pl.d.sub(dot(pl.n, pool[i].pos)).div(den)));
        if (have.some((k) => eqVec(k.pos, pos))) continue;
        const k = find(pos) || learn(auxName(), pos, 'aux');
        hits.push({ x: pool[i], y: pool[j], k });
        have.push(k);
      }
    }
    if (have.length === 2) traceFace({ type: 'hit', face: fi, uses: [...have, ...hits.flatMap((h) => [h.x, h.y])], hits, line: have });
    else if (have.length === 1 && parallel) traceFace({ type: 'hitPar', face: fi, uses: [have[0], ...parallel, ...hits.flatMap((h) => [h.x, h.y])], hits, parallel, line: have });
    else return null;
  }

  // Оставляем только шаги, которые нужны для сторон сечения
  const needed = new Set();
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    s.keep = !!s.side || s.outs.some((o) => needed.has(o.k));
    if (s.keep) for (const k of s.uses) needed.add(k);
  }

  // Вспомогательные точки нумеруем подряд — только те, что остались в построении
  auxN = 0;
  for (const s of steps.filter((x) => x.keep)) {
    for (const h of s.hits || []) if (h.k.kind === 'aux' && !h.k.named) { h.k.name = auxName(); h.k.named = true; }
    for (const o of s.outs) if (!o.inside && o.isNew && needed.has(o.k) && !o.k.named) { o.k.name = auxName(); o.k.named = true; }
  }

  const out = [{
    text: `Секущая плоскость задана точками ${sec.given.map((g) => g.name).join(', ')}. Сечение строим методом следов: ищем прямые, по которым плоскость пересекает грани.`,
    segs: [], labels: [], found: sec.given.map((g) => g.name),
  }];
  const found = new Set(out[0].found);

  for (const s of steps.filter((x) => x.keep)) {
    const face = S.faceNames[s.face];
    const segs = [], labels = [];
    let text;
    const pts = [...(s.line || s.uses.slice(0, s.type === 'par' ? 1 : 2))];
    if (s.type === 'two') {
      const [x, y] = s.uses;
      text = `Точки ${x.name} и ${y.name} лежат в плоскости грани ${face}. Проводим прямую ${x.name}${y.name} — по ней секущая плоскость пересекает эту плоскость.`;
    } else if (s.type === 'par') {
      const [x, p, q] = s.uses;
      text = `Грани ${face} и ${S.faceNames[s.parFace]} параллельны, поэтому секущая плоскость пересекает их по параллельным прямым. Через точку ${x.name} в грани ${face} проводим прямую, параллельную ${p.name}${q.name}.`;
    } else {
      text = `В плоскости грани ${face} пока известно меньше двух точек секущей плоскости. `;
      for (const h of s.hits) {
        text += `Прямая ${h.x.name}${h.y.name} лежит в секущей плоскости; находим точку ${h.k.name}, в которой она пересекает плоскость грани ${face} (на чертеже — пересечение ${h.x.name}${h.y.name} с её проекцией на эту плоскость). `;
        segs.push(...spanSegs([h.x.pos, h.y.pos, h.k.pos], 'ext'));
        labels.push(h.k);
      }
      text += s.type === 'hit'
        ? `Прямая ${s.line[0].name}${s.line[1].name} — след секущей плоскости в плоскости грани ${face}.`
        : `Прямая ${s.parallel[0].name}${s.parallel[1].name} параллельна плоскости грани ${face}, значит след проходит через ${s.line[0].name} параллельно ${s.parallel[0].name}${s.parallel[1].name}.`;
    }
    const useful = s.outs.filter((o) => o.isNew && (o.inside || needed.has(o.k)));
    if (s.type === 'two' && !useful.length && s.side) {
      const [x, y] = s.side;
      text = `Точки ${x.name} и ${y.name} лежат в одной грани ${face} — соединяем их.`;
    }
    for (const o of useful) {
      const e = edgeName(...o.edge);
      if (o.inside) {
        text += o.atVertex >= 0 ? ` Она проходит через вершину ${S.names[o.atVertex]}.` : ` Она пересекает ребро ${e} в точке ${o.k.name}.`;
      } else {
        const g = otherFace(s.face, ...o.edge);
        text += ` Она пересекает продолжение ребра ${e} в точке ${o.k.name}${g >= 0 ? ` — эта точка лежит и в плоскости грани ${S.faceNames[g]}` : ''}.`;
        labels.push(o.k);
      }
      pts.push(o.k);
    }
    if (s.side) {
      pts.push(...s.side);
      text += ` Отрезок ${s.side[0].name}${s.side[1].name} — сторона сечения.`;
      s.side.forEach((k) => found.add(k.name));
    }
    segs.push(...spanSegs(pts.map((k) => k.pos), 'ext'));
    if (s.side) segs.push({ a: s.side[0].pos, b: s.side[1].pos, cls: 'main' });
    out.push({ text, segs, labels: labels.map((k) => ({ name: k.name, pos: k.pos })), found: [...found] });
  }
  out.push({
    text: `Все стороны найдены: ${sec.names.join('')} — искомое сечение.`,
    segs: [], labels: [], found: sec.names, final: true,
  });
  return out;
}

/** Отрезок прямой, покрывающий все данные точки (они лежат на одной прямой) */
function spanSegs(pts, cls) {
  const uniq = pts.filter((p, i) => pts.findIndex((q) => eqVec(p, q)) === i);
  if (uniq.length < 2) return [];
  const dir = sub(uniq[1], uniq[0]);
  let lo = uniq[0], hi = uniq[0];
  for (const p of uniq) {
    if (dot(sub(p, lo), dir).sign() < 0) lo = p;
    if (dot(sub(p, hi), dir).sign() > 0) hi = p;
  }
  return [{ a: lo, b: hi, cls }];
}
