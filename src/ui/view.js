// Чертёж: параллельная проекция в SVG, как в учебнике.
// Видимость каждой линии определяется честно — лучом от точки к наблюдателю
// сквозь выпуклую фигуру; невидимые участки рисуются пунктиром.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const crossF = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const f1 = (x) => x.toFixed(1);
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
