// Развёртка поверхности многогранника на плоскость (в натуральную величину).
// Грани раскладываются обходом в ширину от основания: каждая новая грань
// «отгибается» вокруг общего ребра с уже разложенной соседкой.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Для каждой грани — отображение точки грани (3D) в плоскость развёртки */
function unfold(verts, faces, planes) {
  const centroid = (f) => [0, 1, 2].map((k) => f.reduce((s, i) => s + verts[i][k], 0) / f.length);
  const maps = new Array(faces.length).fill(null);
  const frame = (o3, e1, e2, o2, a1, a2) => (p) => {
    const w = sub(p, o3), x = dot(w, e1), y = dot(w, e2);
    return [o2[0] + x * a1[0] + y * a2[0], o2[1] + x * a1[1] + y * a2[1]];
  };
  const f0 = faces[0], e10 = unit(sub(verts[f0[1]], verts[f0[0]]));
  maps[0] = frame(verts[f0[0]], e10, unit(cross(planes[0].n, e10)), [0, 0], [1, 0], [0, 1]);
  const queue = [0];
  while (queue.length) {
    const p = queue.shift();
    faces[p].forEach((a, i) => {
      const b = faces[p][(i + 1) % faces[p].length];
      const c = faces.findIndex((g, gi) => gi !== p && !maps[gi] && g.includes(a) && g.includes(b));
      if (c < 0) return;
      const pa = maps[p](verts[a]), pb = maps[p](verts[b]);
      const e1 = unit(sub(verts[b], verts[a]));
      let e2 = unit(cross(planes[c].n, e1));
      if (dot(sub(centroid(faces[c]), verts[a]), e2) < 0) e2 = e2.map((x) => -x);
      const l = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
      const a1 = [(pb[0] - pa[0]) / l, (pb[1] - pa[1]) / l];
      let a2 = [-a1[1], a1[0]];
      const pc = maps[p](centroid(faces[p]));
      if ((pc[0] - pa[0]) * a2[0] + (pc[1] - pa[1]) * a2[1] > 0) a2 = [-a2[0], -a2[1]]; // от родительской грани
      maps[c] = frame(verts[a], e1, e2, pa, a1, a2);
      queue.push(c);
    });
  }
  return maps;
}

/**
 * @param scene    { verts, faces, planes, names } — координаты с плавающей точкой
 * @param sections [{ color, pts }] — вершины сечений по порядку обхода
 */
export function netSvg(scene, sections) {
  const { verts, faces, planes, names } = scene;
  const maps = unfold(verts, faces, planes);
  const polys = faces.map((f, i) => f.map((v) => maps[i](verts[v])));
  const all = polys.flat();
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const W = 720, H = 520, pad = 34;
  const k = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
  const ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
  const T = ([x, y]) => [ox + (x - minX) * k, H - oy - (y - minY) * k];
  const str = (pts) => pts.map((p) => T(p).map((v) => v.toFixed(1)).join(',')).join(' ');

  let out = polys.map((q) => `<polygon class="nface" points="${str(q)}"/>`).join('');
  const eps = 1e-7 * Math.max(maxX - minX, maxY - minY);
  for (const sec of sections) {
    sec.pts.forEach((a, i) => {
      const b = sec.pts[(i + 1) % sec.pts.length];
      // сторона сечения лежит в той грани, плоскости которой принадлежат оба её конца
      const fi = planes.findIndex((pl) => Math.abs(dot(pl.n, a) - pl.d) < eps && Math.abs(dot(pl.n, b) - pl.d) < eps);
      if (fi < 0) return;
      const p = T(maps[fi](a)), q = T(maps[fi](b));
      out += `<line class="ncut" style="--c:${sec.color}" x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"/>`;
    });
  }
  // подписи вершин: каждая вершина может встретиться на развёртке несколько раз
  const seen = new Set();
  faces.forEach((f, i) => {
    const c = T(polys[i].reduce((s, p) => [s[0] + p[0] / f.length, s[1] + p[1] / f.length], [0, 0]));
    f.forEach((v, j) => {
      const p = T(polys[i][j]);
      const key = `${names[v]}:${Math.round(p[0])}:${Math.round(p[1])}`;
      if (seen.has(key)) return;
      seen.add(key);
      const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1;
      out += `<text class="nlabel" x="${(p[0] - (dx / l) * 13).toFixed(1)}" y="${(p[1] - (dy / l) * 13).toFixed(1)}">${esc(names[v])}</text>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Развёртка поверхности">${out}</svg>`;
}
