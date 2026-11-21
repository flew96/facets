// «Отсечь часть фигуры»: выпуклый многогранник, разрезанный плоскостью (в числах с плавающей точкой — только для рисования)
import { dot } from './util.js';

/** Часть фигуры по одну сторону от плоскости g(p) = keep·(n·p − d) ≥ 0 — тоже выпуклый многогранник */
export function cutSolid(verts, faces, planes, n, d, keep) {
  const g = (p) => keep * (dot(n, p) - d);
  const eps = 1e-9 * Math.max(...verts.map((v) => Math.hypot(...v)));
  const outV = [], index = new Map();
  const id = (p) => {
    const key = p.map((x) => x.toFixed(7)).join(',');
    if (!index.has(key)) { index.set(key, outV.length); outV.push(p); }
    return index.get(key);
  };
  const outF = [], outP = [], cap = new Set();
  faces.forEach((f, fi) => {
    const poly = [];
    f.forEach((vi, i) => {
      const a = verts[vi], b = verts[f[(i + 1) % f.length]], ga = g(a), gb = g(b);
      if (ga >= -eps) poly.push(a);
      if ((ga > eps && gb < -eps) || (ga < -eps && gb > eps)) poly.push(a.map((x, k) => x + ((b[k] - x) * ga) / (ga - gb)));
    });
    const ids = [...new Set(poly.map(id))];
    if (ids.length < 3) return;
    outF.push(ids); outP.push(planes[fi]);
    for (const p of poly) if (Math.abs(g(p)) <= eps * 10) cap.add(id(p));
  });
  if (cap.size >= 3) {
    const ids = [...cap], c = [0, 1, 2].map((k) => ids.reduce((s, i) => s + outV[i][k], 0) / ids.length);
    const e1 = outV[ids[0]].map((x, k) => x - c[k]);
    const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    ids.sort((i, j) => {
      const a = outV[i].map((x, k) => x - c[k]), b = outV[j].map((x, k) => x - c[k]);
      return Math.atan2(dot(a, e2), dot(a, e1) * Math.hypot(...n)) - Math.atan2(dot(b, e2), dot(b, e1) * Math.hypot(...n));
    });
    const l = Math.hypot(...n), u = n.map((x) => (-keep * x) / l);
    outF.push(ids); outP.push({ n: u, d: dot(u, outV[ids[0]]) });
  }
  const seen = new Set(), edges = [];
  for (const f of outF) f.forEach((a, i) => {
    const b = f[(i + 1) % f.length], key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
  });
  return { verts: outV, faces: outF, planes: outP, edges, inside: (p) => g(p) >= -eps * 10 };
}
