// Чертёж: параллельная проекция в SVG, как в учебнике.
// Видимость каждой линии определяется честно — лучом от точки к наблюдателю
// сквозь выпуклую фигуру; невидимые участки рисуются пунктиром.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const crossF = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const f1 = (x) => x.toFixed(1);
const f2 = (x) => x.toFixed(2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const HOME = { yaw: -1.12, pitch: 0.36 };

export class View {
  constructor(svg) {
    this.svg = svg;
    this.yaw = HOME.yaw; this.pitch = HOME.pitch; this.zoom = 1;
    this.scene = null;
    this.opts = { alpha: 0.1, hidden: true, labels: true };
    this.preview = null;
    this.onPick = null; this.onHover = null;
    this._bind();
    new ResizeObserver(() => this.invalidate()).observe(svg);
  }

  setScene(scene) { this.scene = scene; this.invalidate(); }

  invalidate() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
  }

  basis() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return { d: [cp * cy, cp * sy, sp], r: [-sy, cy, 0], u: [-sp * cy, -sp * sy, cp] };
  }

  frame() {
    const box = this.svg.getBoundingClientRect();
    const w = box.width || 800, h = box.height || 600;
    const sc = (Math.min(w, h) * 0.34 * this.zoom) / (this.scene?.radius || 1);
    return { w, h, cx: w / 2, cy: h / 2, sc, ...this.basis() };
  }

  /** Точка закрыта фигурой, если луч к наблюдателю проходит через её внутренность */
  hiddenAt(p, d) {
    if (this.scene.round) return this.hiddenRound(p, d);
    const tol = 1e-6 * this.scene.radius;
    let lo = tol, hi = Infinity;
    for (const pl of this.scene.planes) {
      const a = dot(pl.n, d), b = dot(pl.n, p) - pl.d;
      if (a > 1e-12) hi = Math.min(hi, -b / a);
      else if (a < -1e-12) lo = Math.max(lo, -b / a);
      else if (b > tol) return false;
    }
    return hi - lo > tol * 10;
  }

  /**
   * То же для тела вращения. Тело — выпуклое: слой z0 ≤ z ≤ z1, внутри которого
   * x² + y² ≤ ρ(z)², ρ линейно по z (у шара — x² + y² + z² ≤ R²). Луч p + s·d лежит
   * внутри при тех s, где квадратный трёхчлен неположителен, — решаем его аналитически.
   */
  hiddenRound(p, d) {
    const R = this.scene.round, tol = 1e-6 * this.scene.radius;
    let lo = tol, hi = Infinity, A, B, C;
    if (R.ball) {
      A = 1; B = 2 * dot(p, d); C = dot(p, p) - R.R * R.R;
    } else {
      if (Math.abs(d[2]) > 1e-12) {
        const s0 = (R.z0 - p[2]) / d[2], s1 = (R.z1 - p[2]) / d[2];
        lo = Math.max(lo, Math.min(s0, s1)); hi = Math.min(hi, Math.max(s0, s1));
      } else if (p[2] < R.z0 - tol || p[2] > R.z1 + tol) return false;
      const k = (R.r1 - R.r0) / (R.z1 - R.z0), rho = R.r0 + k * (p[2] - R.z0);
      A = d[0] * d[0] + d[1] * d[1] - k * k * d[2] * d[2];
      B = 2 * (p[0] * d[0] + p[1] * d[1] - rho * k * d[2]);
      C = p[0] * p[0] + p[1] * p[1] - rho * rho;
    }
    // промежутки, где A·s² + B·s + C ≤ 0
    let ivs;
    if (Math.abs(A) < 1e-12) {
      ivs = Math.abs(B) < 1e-12 ? (C <= 0 ? [[-Infinity, Infinity]] : []) : B > 0 ? [[-Infinity, -C / B]] : [[-C / B, Infinity]];
    } else {
      const D = B * B - 4 * A * C;
      if (D <= 0) ivs = A > 0 ? [] : [[-Infinity, Infinity]];
      else {
        const q = Math.sqrt(D), s1 = (-B - q) / (2 * A), s2 = (-B + q) / (2 * A), a = Math.min(s1, s2), b = Math.max(s1, s2);
        ivs = A > 0 ? [[a, b]] : [[-Infinity, a], [b, Infinity]];
      }
    }
    return ivs.some(([a, b]) => Math.min(b, hi) - Math.max(a, lo) > tol * 10);
  }

  /** Разбивает отрезок на видимые и невидимые участки */
  runs(a, b, d) {
    const n = 24;
    const hid = (t) => this.hiddenAt(mix(a, b, t), d);
    const out = [];
    let start = 0, cur = hid(0.5 / n);
    for (let i = 1; i < n; i++) {
      const h = hid((i + 0.5) / n);
      if (h === cur) continue;
      let lo = (i - 0.5) / n, hi = (i + 0.5) / n;
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (hid(m) === cur) lo = m; else hi = m; }
      out.push([start, lo, cur]);
      start = lo; cur = h;
    }
    out.push([start, 1, cur]);
    return out;
  }

  render() {
    const S = this.scene;
    if (!S) return;
    const F = (this._frame = this.frame());
    const { cx, cy, sc, d, r, u } = F;
    const P = (p) => [cx + dot(p, r) * sc, cy - dot(p, u) * sc];
    const pstr = (pts) => pts.map((p) => { const q = P(p); return `${f1(q[0])},${f1(q[1])}`; }).join(' ');
    const o = this.opts;
    const back = [], sph = [], hid = [], polys = [], front = [], vis = [], top = [];

    S.faces.forEach((f, i) => {
      const isFront = dot(S.planes[i].n, d) > 1e-9;
      const pts = pstr(f.map((k) => S.verts[k]));
      if (isFront) front.push(`<polygon class="face front" points="${pts}" fill-opacity="${o.alpha}"/>`);
      else back.push(`<polygon class="face back" points="${pts}"/>`);
    });

    // Окружность в пространстве: c + ρ·(e1·cos t + e2·sin t). Её параллельная проекция — эллипс;
    // он задаётся дугами SVG (полуоси и поворот считаются из проекций e1 и e2), а не ломаной.
    const circle = (c, n, rho) => {
      const k = unit(n), e1 = Math.abs(k[2]) > 0.9999999 ? [1, 0, 0] : unit(crossF(k, [0, 0, 1])), e2 = crossF(k, e1);
      const o = P(c);
      const a = [dot(e1, r) * rho * sc, -dot(e1, u) * rho * sc], b = [dot(e2, r) * rho * sc, -dot(e2, u) * rho * sc];
      const sxx = a[0] * a[0] + b[0] * b[0], syy = a[1] * a[1] + b[1] * b[1], sxy = a[0] * a[1] + b[0] * b[1];
      const m = (sxx + syy) / 2, q = Math.hypot((sxx - syy) / 2, sxy);
      const rx = Math.sqrt(m + q), ry = Math.max(Math.sqrt(Math.max(0, m - q)), 0.02);
      const rot = (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI);
      const sweep = a[0] * b[1] - a[1] * b[0] > 0 ? 1 : 0;
      const at = (t) => [o[0] + a[0] * Math.cos(t) + b[0] * Math.sin(t), o[1] + a[1] * Math.cos(t) + b[1] * Math.sin(t)];
      const to = (t0, t1) => {
        // дуги короче полуоборота задаются однозначно, длинные делим пополам
        if (t1 - t0 > Math.PI - 1e-9) { const tm = (t0 + t1) / 2; return to(t0, tm) + to(tm, t1); }
        const q1 = at(t1);
        return `A${f2(rx)} ${f2(ry)} ${f2(rot)} 0 ${sweep} ${f2(q1[0])} ${f2(q1[1])}`;
      };
      const arc = (t0, t1) => { const p0 = at(t0); return `M${f2(p0[0])} ${f2(p0[1])}${to(t0, t1)}`; };
      return { c, rho, e1, e2, sweep, arc, full: () => `${arc(0, 2 * Math.PI)}Z` };
    };
    // Видимая часть окружности, лежащей на поверхности тела вращения: точка видна, когда внешняя
    // нормаль к поверхности в ней обращена к наблюдателю, то есть A·cos t + B·sin t + K > 0.
    // rim: 0 или 1 — окружность основания (видна целиком, если основание обращено к наблюдателю).
    const windowOf = (C, rim) => {
      const R = S.round;
      let A, B, K;
      if (R.ball) { A = dot(C.e1, d) * C.rho; B = dot(C.e2, d) * C.rho; K = dot(C.c, d); }
      else {
        if ((rim === 0 && d[2] < -1e-9) || (rim === 1 && d[2] > 1e-9)) return { mid: 0, w: Math.PI };
        const hh = R.z1 - R.z0;
        A = hh * dot(C.e1, d); B = hh * dot(C.e2, d); K = (R.r0 - R.r1) * d[2];
      }
      const m = Math.hypot(A, B), x = m < 1e-12 ? (K > 0 ? -1 : 1) : -K / m;
      return { mid: Math.atan2(B, A), w: x <= -1 ? Math.PI : x >= 1 ? 0 : Math.acos(x) };
    };
    const circ = (C, cls, style, rim) => {
      const { mid, w } = S.round ? windowOf(C, rim) : { mid: 0, w: Math.PI };
      if (w > 1e-6) vis.push(`<path class="${cls}"${style} d="${C.arc(mid - w, mid + w)}"/>`);
      if (w < Math.PI - 1e-6 && o.hidden) hid.push(`<path class="${cls} hid"${style} d="${C.arc(mid + w, mid - w + 2 * Math.PI)}"/>`);
      return { mid, w };
    };

    if (S.round) {
      const R = S.round;
      if (R.ball) {
        // очерк шара в параллельной проекции — окружность того же радиуса
        const q = P([0, 0, 0]), at = `cx="${f1(q[0])}" cy="${f1(q[1])}" r="${f1(R.R * sc)}"`;
        front.push(`<circle class="face front" ${at} fill-opacity="${o.alpha}"/>`);
        vis.push(`<circle class="edge outline" ${at}/>`);
        circ(circle([0, 0, 0], [0, 0, 1], R.R), 'edge', '');
      } else {
        const rims = [[R.z0, R.r0, 0], [R.z1, R.r1, 1]].filter((q) => q[1] > 0).map(([z, rho, i]) => [circle([0, 0, z], [0, 0, 1], rho), i]);
        let shape = '';
        for (const [C, i] of rims) { circ(C, 'edge', '', i); shape += C.full(); }
        // очерковые образующие: вдоль них касательная плоскость проходит через луч зрения
        const { mid, w } = windowOf(rims[0][0]);
        if (w > 1e-6 && w < Math.PI - 1e-6) {
          const gen = (t) => [[R.r0 * Math.cos(t), R.r0 * Math.sin(t), R.z0], [R.r1 * Math.cos(t), R.r1 * Math.sin(t), R.z1]].map(P);
          const g1 = gen(mid - w), g2 = gen(mid + w);
          for (const [p, q] of [g1, g2]) vis.push(`<line class="edge" x1="${f1(p[0])}" y1="${f1(p[1])}" x2="${f1(q[0])}" y2="${f1(q[1])}"/>`);
          // заливка — объединение оснований и четырёхугольника между очерковыми образующими (одним контуром, одинаковый обход)
          let quad = [g1[0], g1[1], g2[1], g2[0]];
          const area = quad.reduce((s, p, i) => { const q = quad[(i + 1) % 4]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
          if ((area > 0) !== (rims[0][0].sweep === 1)) quad = quad.reverse();
          shape += `M${quad.map((p) => `${f2(p[0])} ${f2(p[1])}`).join('L')}Z`;
        }
        front.push(`<path class="face front" fill-rule="nonzero" d="${shape}" fill-opacity="${o.alpha}"/>`);
      }
    }

    const seg = (a, b, cls, style) => {
      for (const [t0, t1, h] of this.runs(a, b, d)) {
        if (h && !o.hidden) continue;
        const p = P(mix(a, b, t0)), q = P(mix(a, b, t1));
        (h ? hid : vis).push(`<line class="${cls}${h ? ' hid' : ''}"${style} x1="${f1(p[0])}" y1="${f1(p[1])}" x2="${f1(q[0])}" y2="${f1(q[1])}"/>`);
      }
    };
    for (const [i, j] of S.edges) seg(S.verts[i], S.verts[j], 'edge', '');
    // отсечённая часть фигуры — бледным контуром
    for (const [a, b] of S.ghostEdges || []) {
      const p = P(a), q = P(b);
      back.push(`<line class="ghostedge" x1="${f1(p[0])}" y1="${f1(p[1])}" x2="${f1(q[0])}" y2="${f1(q[1])}"/>`);
    }

    for (const L of S.layers) {
      const st = ` style="--c:${L.color}"`;
      for (const pg of L.polys || []) polys.push(`<polygon class="poly ${pg.cls}"${st} points="${pstr(pg.pts)}"/>`);
      for (const s of L.segs || []) seg(s.a, s.b, `seg ${s.cls}`, st);
      for (const s of L.circs || []) {
        const C = circle(s.c, s.n, s.rho);
        if (s.fill) polys.push(`<path class="poly section"${st} d="${C.full()}"/>`);
        circ(C, `seg ${s.cls}`, st);
      }
      for (const m of L.marks || []) {
        const k = 9 / sc, a = unit(m.u), b = unit(m.v);
        const p1 = [0, 1, 2].map((i) => m.at[i] + a[i] * k), p2 = [0, 1, 2].map((i) => p1[i] + b[i] * k), p3 = [0, 1, 2].map((i) => m.at[i] + b[i] * k);
        top.push(`<polyline class="mark"${st} points="${pstr([p1, p2, p3])}"/>`);
      }
      for (const s of L.spheres || []) {
        const c = P(s.c);
        sph.push(`<circle class="sphere"${st} cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(s.r * sc)}"/>`);
        const fr = [], bk = [];
        for (let i = 0; i <= 72; i++) {
          const t = (i / 72) * 2 * Math.PI;
          const p = [s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t), s.c[2]];
          (dot(sub(p, s.c), d) >= 0 ? fr : bk).push(p);
        }
        // дуги начинаются на стыке «перед/зад»: сортируем по направлению вдоль экрана
        const order = (arr) => arr.sort((p, q) => dot(p, r) - dot(q, r));
        if (fr.length > 1) sph.push(`<polyline class="equator"${st} points="${pstr(order(fr))}"/>`);
        if (bk.length > 1 && o.hidden) sph.push(`<polyline class="equator hid"${st} points="${pstr(order(bk))}"/>`);
      }
      for (const lb of L.labels || []) {
        const q = P(lb.p);
        top.push(`<circle class="auxpt"${st} cx="${f1(q[0])}" cy="${f1(q[1])}" r="3.2"/>`);
        top.push(`<text class="label derived"${st} x="${f1(q[0] + 11)}" y="${f1(q[1] - 12)}">${esc(lb.name)}</text>`);
      }
      for (const p of L.dots || []) { const q = P(p); top.push(`<circle class="touch"${st} cx="${f1(q[0])}" cy="${f1(q[1])}" r="2.6"/>`); }
    }

    this._pts = [];
    for (const pt of S.points) {
      const q = P(pt.p);
      this._pts.push({ ref: pt.ref, x: q[0], y: q[1] });
      const st = pt.color ? ` style="--c:${pt.color}"` : '';
      if (pt.sel) top.push(`<circle class="ring" cx="${f1(q[0])}" cy="${f1(q[1])}" r="8"/>`);
      top.push(`<circle class="pt ${pt.role}"${st} cx="${f1(q[0])}" cy="${f1(q[1])}" r="${pt.role === 'vertex' ? 2.4 : 3.6}"/>`);
      if (o.labels) {
        let dx = q[0] - cx, dy = q[1] - cy;
        const l = Math.hypot(dx, dy);
        if (l < 6) { dx = 0.7; dy = -0.7; } else { dx /= l; dy /= l; }
        top.push(`<text class="label ${pt.role}"${st} x="${f1(q[0] + dx * 15)}" y="${f1(q[1] + dy * 15)}">${esc(pt.name)}</text>`);
      }
    }

    if (this.preview) {
      const q = P(this.preview.p);
      top.push(`<circle class="preview" cx="${f1(q[0])}" cy="${f1(q[1])}" r="7"/>`);
      if (this.preview.label) top.push(`<text class="tip" x="${f1(q[0] + 12)}" y="${f1(q[1] - 12)}">${esc(this.preview.label)}</text>`);
    }

    this.svg.setAttribute('viewBox', `0 0 ${F.w} ${F.h}`);
    this.svg.innerHTML = back.join('') + sph.join('') + polys.join('') + front.join('') + hid.join('') + vis.join('') + top.join('');
  }

  /** Что находится под курсором: точка, ребро или грань */
  pick(x, y, mode = 'pt') {
    const S = this.scene, F = this._frame;
    if (!S || !F) return null;
    const { cx, cy, sc, d, r, u } = F;
    const P = (p) => [cx + dot(p, r) * sc, cy - dot(p, u) * sc];
    if (S.round) return this.pickRound(x, y, P, d);
    if (mode === 'pt' || mode === 'plane') {
      let best = null;
      for (const p of this._pts) {
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist < 13 && (!best || dist < best.dist)) best = { type: 'point', ref: p.ref, dist };
      }
      if (best) return best;
      for (const [i, j] of S.locked ? [] : S.edges) {
        const a = P(S.verts[i]), b = P(S.verts[j]);
        const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey;
        if (l2 < 1) continue;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
        const dist = Math.hypot(a[0] + ex * t - x, a[1] + ey * t - y);
        if (dist > 10) continue;
        const score = dist + (this.hiddenAt(mix(S.verts[i], S.verts[j], t), d) ? 7 : 0);
        if (!best || score < best.score) best = { type: 'edge', i, j, t, score };
      }
      if (best) return best;
    }
    if (mode === 'plane') {
      // клик внутри уже построенного сечения выбирает его плоскость
      for (const L of S.layers) {
        for (const pg of L.polys || []) {
          if (pg.cls !== 'section' || !L.id) continue;
          const q2 = pg.pts.map(P);
          let inside = false;
          for (let i = 0, j = q2.length - 1; i < q2.length; j = i++) {
            if ((q2[i][1] > y) !== (q2[j][1] > y) && x < ((q2[j][0] - q2[i][0]) * (y - q2[i][1])) / (q2[j][1] - q2[i][1]) + q2[i][0]) inside = !inside;
          }
          if (inside) return { type: 'section', id: L.id, p: [0, 1, 2].map((k) => pg.pts.reduce((s, v) => s + v[k], 0) / pg.pts.length) };
        }
      }
    }
    if (S.locked) return null;
    const q = [0, 1, 2].map((k) => (r[k] * (x - cx)) / sc + (u[k] * (cy - y)) / sc);
    for (let fi = 0; fi < S.faces.length; fi++) {
      const pl = S.planes[fi], nd = dot(pl.n, d);
      if (nd <= 1e-9) continue;
      const s = (pl.d - dot(pl.n, q)) / nd;
      const p = [0, 1, 2].map((k) => q[k] + d[k] * s);
      const f = S.faces[fi];
      const inside = f.every((vi, k) => {
        const a = S.verts[vi], b = S.verts[f[(k + 1) % f.length]];
        return dot(crossF(sub(b, a), sub(p, a)), pl.n) >= -1e-9;
      });
      if (inside) return { type: 'face', f: fi, p };
    }
    return null;
  }

  /**
   * Тело вращения: отмеченная точка, точка окружности основания (углы через 15°)
   * или точка на образующей (образующие — тоже через 15°).
   */
  pickRound(x, y, P, d) {
    const R = this.scene.round;
    let best = null;
    for (const p of this._pts) {
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < 13 && (!best || dist < best.dist)) best = { type: 'point', ref: p.ref, dist };
    }
    if (best) return best;
    const at = (rho, z, k) => [rho * Math.cos((k * Math.PI) / 12), rho * Math.sin((k * Math.PI) / 12), z];
    const rims = R.ball ? [[0, R.R, 0]] : [[R.z0, R.r0, 0], [R.z1, R.r1, 1]].filter((q) => q[1] > 0);
    for (const [z, rho, base] of rims) {
      for (let k = 0; k < 24; k++) {
        const p = at(rho, z, k), q = P(p), dist = Math.hypot(q[0] - x, q[1] - y);
        if (dist > 12) continue;
        const score = dist + (this.hiddenAt(p, d) ? 7 : 0);
        if (!best || score < best.score) best = { type: 'circ', base, k, p, score };
      }
    }
    if (best || R.ball) return best;
    for (let k = 0; k < 24; k++) {
      const a3 = at(R.r0, R.z0, k), b3 = at(R.r1, R.z1, k), a = P(a3), b = P(b3);
      const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey;
      if (l2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
      const dist = Math.hypot(a[0] + ex * t - x, a[1] + ey * t - y);
      if (dist > 9) continue;
      const score = dist + (this.hiddenAt(mix(a3, b3, t), d) ? 7 : 0);
      if (!best || score < best.score) best = { type: 'gen', k, t, a: a3, b: b3, score };
    }
    return best;
  }

  animateTo(yaw, pitch) {
    const y0 = this.yaw, p0 = this.pitch;
    let dy = (yaw - y0) % (2 * Math.PI);
    if (dy > Math.PI) dy -= 2 * Math.PI;
    if (dy < -Math.PI) dy += 2 * Math.PI;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 420), e = t * t * (3 - 2 * t);
      this.yaw = y0 + dy * e; this.pitch = p0 + (pitch - p0) * e;
      this.render();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Повернуть чертёж так, чтобы смотреть вдоль нормали n (плоскость — «в лоб») */
  lookAlong(n) {
    n = unit(n);
    if (dot(n, this.basis().d) < 0) n = n.map((v) => -v);
    const flat = Math.hypot(n[0], n[1]);
    this.animateTo(flat < 1e-9 ? this.yaw : Math.atan2(n[1], n[0]), Math.asin(Math.max(-1, Math.min(1, n[2]))));
  }

  _bind() {
    const svg = this.svg;
    const ptrs = new Map();
    let moved = 0, pinch = 0;
    const local = (e) => { const b = svg.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    svg.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') ptrs.clear(); // на случай потерянного pointerup
      try { svg.setPointerCapture(e.pointerId); } catch { /* указатель уже отпущен */ }
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) moved = 0;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); moved = 99; }
    });
    svg.addEventListener('pointermove', (e) => {
      const prev = ptrs.get(e.pointerId);
      if (!prev) { this.onHover?.(...local(e)); return; }
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.zoom = Math.max(0.3, Math.min(6, (this.zoom * dist) / pinch));
        pinch = dist;
      } else {
        const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved < 4) return;
        this.yaw -= dx * 0.008;
        this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch + dy * 0.008));
        this.preview = null;
      }
      this.invalidate();
    });
    const up = (e) => {
      if (!ptrs.delete(e.pointerId)) return;
      if (ptrs.size === 0 && moved < 4 && e.type === 'pointerup') this.onPick?.(...local(e));
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('lostpointercapture', (e) => ptrs.delete(e.pointerId));
    svg.addEventListener('pointerleave', () => { if (this.preview) { this.preview = null; this.invalidate(); } });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.3, Math.min(6, this.zoom * Math.exp(-e.deltaY * 0.0012)));
      this.invalidate();
    }, { passive: false });
  }
}
