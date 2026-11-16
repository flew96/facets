import { fmtNum, fmtVal, fmtApprox, valToNumber, isPlain } from '../math/num.js';
import { toFloat } from '../math/vec.js';
import { KINDS, BASES, buildSolid, defaultSpec } from '../geom/solids.js';
import { TOOLS, POINT_POOL, evaluate, withDependents } from '../geom/construct.js';
import { View, HOME } from './view.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLORS = ['#c2410c', '#1d4ed8', '#15803d', '#9333ea', '#be123c', '#0e7490'];
const STORE = 'facets.v1';
const SNAP = 12; // точки на рёбрах и гранях привязываются к двенадцатым долям

const TOOL_GROUPS = [
  ['Точки', ['point', 'ratio', 'center']],
  ['Сечение', ['section']],
  ['Перпендикуляры', ['perpPlane', 'perpLine', 'commonPerp']],
  ['Сферы', ['sphereIn', 'sphereOut']],
  ['Измерения', ['dist', 'angleLL', 'angleLP', 'anglePP']],
];

function demoState() {
  const pt = (id, name, a, b) => ({ id, kind: 'point', name, color: 0, def: { t: 'ratio', a: 'v' + a, b: 'v' + b, m: '1', n: '1' } });
  return {
    spec: { ...defaultSpec('cube') },
    items: [pt('i1', 'K', 0, 1), pt('i2', 'L', 1, 2), pt('i3', 'M', 2, 6), { id: 'i4', kind: 'section', color: 0, refs: ['i1', 'i2', 'i3'] }],
    seq: 5,
    opts: { alpha: 0.1, hidden: true, labels: true },
  };
}

let state = load() || demoState();
let solid = null, specError = null, ctx = null;
const ui = { tool: null, picked: [], unfolded: new Set() };
const history = [];
const view = new View($('#view'));

function load() {
  try { const s = JSON.parse(localStorage.getItem(STORE)); return s && s.spec && Array.isArray(s.items) ? s : null; } catch { return null; }
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* хранилище недоступно */ } }
function commit() { history.push(JSON.stringify(state)); if (history.length > 100) history.shift(); }
function undo() {
  if (!history.length) return;
  state = JSON.parse(history.pop());
  ui.tool = null; ui.picked = [];
  refresh(true);
}

// ───────────────────────────── пересчёт и сцена ─────────────────────────────

function refresh(figureChanged = false) {
  try { solid = buildSolid(state.spec); specError = null; } catch (e) { specError = e.message; if (!solid) solid = buildSolid(defaultSpec('cube')); }
  ctx = evaluate(solid, state.items);
  view.opts = state.opts;
  view.setScene(buildScene());
  if (figureChanged) renderFigure();
  renderFigureInfo();
  renderTools();
  renderHint();
  renderResults();
  save();
}

function buildScene() {
  const c = toFloat(solid.centroid);
  const F = (pos) => { const p = toFloat(pos); return [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; };
  const D = toFloat; // направления сдвигать не нужно
  const verts = solid.verts.map(F);
  const planes = solid.planes.map((pl, i) => {
    const n = toFloat(pl.n), l = Math.hypot(...n), u = n.map((x) => x / l);
    const v = verts[solid.faces[i][0]];
    return { n: u, d: u[0] * v[0] + u[1] * v[1] + u[2] * v[2] };
  });
  const colorOf = (id) => COLORS[(state.items.find((it) => it.id === id)?.color ?? 0) % COLORS.length];
  const layers = [];
  for (const it of state.items) {
    const dr = ctx.results.get(it.id).draw;
    if (it.hide || !dr) continue;
    layers.push({
      color: colorOf(it.id),
      segs: (dr.segs || []).map((s) => ({ a: F(s.a), b: F(s.b), cls: s.cls })),
      polys: (dr.polys || []).map((p) => ({ pts: p.pts.map(F), cls: p.cls })),
      marks: (dr.marks || []).map((m) => ({ at: F(m.at), u: D(m.u), v: D(m.v) })),
      spheres: (dr.spheres || []).map((s) => ({ c: F(s.c), r: s.r })),
      dots: (dr.dots || []).map(F),
    });
  }
  const picked = new Set(ui.picked.map((r) => ctx.points.get(r)));
  const points = [...new Set(ctx.points.values())].map((p) => ({
    ref: p.ref, name: p.name, p: F(p.pos), role: p.role, sel: picked.has(p), color: p.item ? colorOf(p.item) : null,
  }));
  return { verts, faces: solid.faces, edges: solid.edges, planes, layers, points, radius: Math.max(...verts.map((v) => Math.hypot(...v))), F };
}

// ────────────────────────────── создание объектов ──────────────────────────────

function newId() { return 'i' + state.seq++; }
function nextColor() { return state.items.filter((it) => it.kind !== 'point').length % COLORS.length; }

function addPoint(def) {
  const id = newId();
  state.items.push({ id, kind: 'point', name: ctx.alloc(POINT_POOL), color: nextColor(), def });
  ctx = evaluate(solid, state.items);
  return id;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Привязка клика: ребро → точка в «хорошем» отношении, грань → точка с рациональными координатами */
function snapPick(pk) {
  const S = view.scene;
  if (pk.type === 'point') return { ref: pk.ref, p: S.points.find((p) => p.ref === pk.ref).p, label: '' };
  if (pk.type === 'edge') {
    const k = Math.round(pk.t * SNAP);
    if (k === 0 || k === SNAP) { const i = k ? pk.j : pk.i; return { ref: 'v' + i, p: S.verts[i], label: '' }; }
    const g = gcd(k, SNAP - k), m = k / g, n = (SNAP - k) / g;
    const a = S.verts[pk.i], b = S.verts[pk.j], t = k / SNAP;
    return {
      def: { t: 'ratio', a: 'v' + pk.i, b: 'v' + pk.j, m: String(m), n: String(n) },
      p: a.map((x, q) => x + (b[q] - x) * t),
      label: m === n ? `середина ${solid.names[pk.i]}${solid.names[pk.j]}` : `${solid.names[pk.i]}${solid.names[pk.j]} в отношении ${m} : ${n}`,
    };
  }
  const f = S.faces[pk.f], o = S.verts[f[0]];
  const e1 = S.verts[f[1]].map((x, q) => x - o[q]), e2 = S.verts[f[f.length - 1]].map((x, q) => x - o[q]);
  const w = pk.p.map((x, q) => x - o[q]);
  const dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const a11 = dt(e1, e1), a12 = dt(e1, e2), a22 = dt(e2, e2), b1 = dt(w, e1), b2 = dt(w, e2), det = a11 * a22 - a12 * a12;
  const u = Math.round(((b1 * a22 - b2 * a12) / det) * SNAP), v = Math.round(((b2 * a11 - b1 * a12) / det) * SNAP);
  return {
    def: { t: 'face', f: pk.f, u: `${u}/${SNAP}`, v: `${v}/${SNAP}` },
    p: o.map((x, q) => x + (e1[q] * u + e2[q] * v) / SNAP),
    label: `на грани ${solid.faceNames[pk.f]}`,
  };
}

function startTool(name) {
  const tool = TOOLS[name];
  ui.picked = [];
  if (tool.slots && tool.slots.length === 0) {
    commit();
    state.items.push({ id: newId(), kind: name, color: nextColor() });
    ui.tool = null;
  } else ui.tool = ui.tool === name ? null : name;
  refresh();
}

view.onPick = (x, y) => {
  if (!ui.tool || specError) return;
  const tool = TOOLS[ui.tool];
  const pk = view.pick(x, y, tool.face ? 'face' : 'pt');
  if (!pk) return;
  if (tool.face) {
    commit();
    addPoint({ t: 'center', f: pk.f });
    ui.tool = null;
    return refresh();
  }
  const sn = snapPick(pk);
  if (!sn.ref) commit();
  const ref = sn.ref || addPoint(sn.def);
  if (!tool.free) {
    ui.picked.push(ref);
    if (ui.picked.length === tool.slots.length) {
      if (sn.ref) commit();
      if (ui.tool === 'ratio') addPoint({ t: 'ratio', a: ui.picked[0], b: ui.picked[1], m: '1', n: '1' });
      else state.items.push({ id: newId(), kind: ui.tool, color: nextColor(), refs: ui.picked });
      ui.tool = null; ui.picked = [];
    }
  }
  view.preview = null;
  refresh();
};

view.onHover = (x, y) => {
  let pv = null;
  if (ui.tool && !specError) {
    const tool = TOOLS[ui.tool];
    const pk = view.pick(x, y, tool.face ? 'face' : 'pt');
    if (pk && tool.face) pv = { p: pk.p, label: `грань ${solid.faceNames[pk.f]}` };
    else if (pk) pv = snapPick(pk);
  }
  if (pv || view.preview) { view.preview = pv; view.invalidate(); }
};

// ─────────────────────────────── левая панель ───────────────────────────────

function renderFigure() {
  const s = state.spec, k = KINDS[s.kind];
  const opt = (v, t, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`;
  let html = `<label class="field"><span>Фигура</span><select data-spec="kind">${Object.entries(KINDS).map(([v, x]) => opt(v, x.title, s.kind)).join('')}</select></label>`;
  if (k.bases) html += `<label class="field"><span>Основание</span><select data-spec="base">${k.bases.map((b) => opt(b, BASES[b].title, s.base)).join('')}</select></label>`;
  if (k.apex) {
    const n = { tri: 3, rtri: 3, hex: 6 }[s.base] || 4;
    html += `<label class="field"><span>Вершина S проецируется</span><select data-spec="apex">${opt('center', s.base === 'rtri' ? 'в середину гипотенузы' : 'в центр основания', s.apex)}${[...'ABCDEF'.slice(0, n)].map((c, i) => opt(String(i), `в вершину ${c}`, s.apex)).join('')}</select></label>`;
  }
  html += '<div class="params">' + k.params(s).map(([key, label]) => `<label class="field"><span>${esc(label)}</span><input data-param="${key}" value="${esc(s.p[key])}" spellcheck="false" autocomplete="off"></label>`).join('') + '</div>';
  html += '<p class="fine">Размеры можно вводить точно: <code>3/2</code>, <code>2√3</code>, <code>sqrt(2)</code>.</p>';
  $('#figure').innerHTML = html;
}

function valHtml(v) {
  return `<b>${esc(fmtVal(v))}</b>${isPlain(v) ? '' : ` <span class="approx">≈ ${fmtApprox(valToNumber(v))}</span>`}`;
}

function renderFigureInfo() {
  $('#figure-info').innerHTML = specError
    ? `<p class="err">${esc(specError)}</p>`
    : `<dl><dt>Объём</dt><dd>${valHtml(solid.volume)}</dd><dt>Площадь поверхности</dt><dd>${valHtml(solid.surface)}</dd></dl>`;
}

function renderTools() {
  $('#tools').innerHTML = TOOL_GROUPS.map(([title, names]) => `<div class="group"><h4>${title}</h4>${names.map((n) => `<button class="tool${ui.tool === n ? ' on' : ''}" data-tool="${n}">${esc(TOOLS[n].title)}</button>`).join('')}</div>`).join('');
}

function renderHint() {
  const el = $('#hint');
  if (!ui.tool) { el.hidden = true; return; }
  const tool = TOOLS[ui.tool];
  const chips = ui.picked.map((r) => `<span class="chip">${esc(ctx.points.get(r)?.name ?? '?')}</span>`).join('');
  const what = tool.slots ? `Выберите: <b>${tool.slots[ui.picked.length]}</b> <span class="fine">(${ui.picked.length + 1} из ${tool.slots.length}) — вершина, точка на ребре или на грани</span>` : esc(tool.hint);
  el.hidden = false;
  el.innerHTML = `<strong>${esc(tool.title)}.</strong> ${what} ${chips}<button data-act="cancel">Готово · Esc</button>`;
}

// ─────────────────────────────── результаты ───────────────────────────────

function unfoldSvg(sec) {
  // натуральная величина: ортонормированный базис в плоскости сечения
  const P = sec.pts.map(toFloat), n = toFloat(sec.n);
  const nl = Math.hypot(...n), un = n.map((x) => x / nl);
  const d0 = P[1].map((x, i) => x - P[0][i]), l0 = Math.hypot(...d0), e1 = d0.map((x) => x / l0);
  const e2 = [un[1] * e1[2] - un[2] * e1[1], un[2] * e1[0] - un[0] * e1[2], un[0] * e1[1] - un[1] * e1[0]];
  let q = P.map((p) => { const w = p.map((x, i) => x - P[0][i]); return [w[0] * e1[0] + w[1] * e1[1] + w[2] * e1[2], w[0] * e2[0] + w[1] * e2[1] + w[2] * e2[2]]; });
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 300, H = 210, pad = 44;
  const k = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
  const ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
  q = q.map(([x, y]) => [ox + (x - minX) * k, H - oy - (y - minY) * k]);
  const cx = q.reduce((s, p) => s + p[0], 0) / q.length, cy = q.reduce((s, p) => s + p[1], 0) / q.length;
  const out = (p, dist) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * dist, p[1] + (dy / l) * dist]; };
  let s = `<polygon points="${q.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}"/>`;
  q.forEach((p, i) => {
    const a = out(p, 13), nx = q[(i + 1) % q.length], m = out([(p[0] + nx[0]) / 2, (p[1] + nx[1]) / 2], 14);
    s += `<text class="v" x="${a[0].toFixed(1)}" y="${a[1].toFixed(1)}">${esc(sec.names[i])}</text>`;
    s += `<text class="s" x="${m[0].toFixed(1)}" y="${m[1].toFixed(1)}">${esc(fmtVal(sec.sides[i]))}</text>`;
  });
  return `<figure class="unfold"><svg viewBox="0 0 ${W} ${H}">${s}</svg><figcaption>Сечение в натуральную величину; подписаны длины сторон</figcaption></figure>`;
}

function renderResults() {
  const el = $('#results');
  if (!state.items.length) {
    el.innerHTML = '<p class="empty">Построений пока нет. Выберите инструмент слева и кликайте по вершинам, рёбрам и граням фигуры — точки на рёбрах привязываются к «хорошим» отношениям (½, ⅓, ¼…).</p>';
    return;
  }
  el.innerHTML = state.items.map((it) => {
    const r = ctx.results.get(it.id);
    const title = r.title || TOOLS[it.kind]?.title || 'Точка';
    let body = '';
    if (it.kind === 'point' && it.def.t === 'ratio') {
      const a = ctx.points.get(it.def.a)?.name ?? '?', b = ctx.points.get(it.def.b)?.name ?? '?';
      body += `<div class="ratio">${esc(a + it.name)} : ${esc(it.name + b)} = <input data-ratio="m" value="${esc(it.def.m)}" aria-label="первая часть отношения"> : <input data-ratio="n" value="${esc(it.def.n)}" aria-label="вторая часть отношения"></div>`;
    }
    if (r.error) body += `<p class="err">${esc(r.error)}</p>`;
    if (r.absent) body += '<p class="badge">не существует</p>';
    const rows = it.kind === 'point' && it.def.t === 'ratio' ? [] : r.rows;
    if (rows.length) body += '<dl>' + rows.map((x) => `<dt>${esc(x.k)}</dt><dd><b>${esc(x.v)}</b>${x.a ? ` <span class="approx">≈ ${x.a}</span>` : ''}</dd>`).join('') + '</dl>';
    body += r.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('');
    if (r.section) {
      body += `<div class="actions"><button data-act="unfold">${ui.unfolded.has(it.id) ? 'Свернуть' : 'Развернуть на плоскость'}</button><button data-act="look">Смотреть перпендикулярно</button></div>`;
      if (ui.unfolded.has(it.id)) body += unfoldSvg(r.section);
    }
    return `<article class="card${it.hide ? ' dim' : ''}${it.kind === 'point' ? ' small' : ''}" data-id="${it.id}" style="--c:${COLORS[it.color % COLORS.length]}">
      <header><i class="sw"></i><h3>${esc(title)}</h3>
      ${it.kind === 'point' ? '' : `<button data-act="hide" title="${it.hide ? 'Показать' : 'Скрыть'} на чертеже">${it.hide ? '○' : '●'}</button>`}
      <button data-act="del" title="Удалить">✕</button></header>${body}</article>`;
  }).join('');
}

// ──────────────────────────────── события ────────────────────────────────

$('#figure').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.spec) {
    commit();
    const key = t.dataset.spec;
    if (key === 'kind') state.spec = { ...defaultSpec(t.value), p: state.spec.p };
    else state.spec = { ...state.spec, [key]: t.value };
    if (key !== 'apex') { state.items = []; ui.unfolded.clear(); }
    if (key === 'base') state.spec.apex = 'center';
    ui.tool = null; ui.picked = [];
    refresh(true);
  } else if (t.dataset.param) {
    commit();
    state.spec = { ...state.spec, p: { ...state.spec.p, [t.dataset.param]: t.value.trim() } };
    refresh();
  }
});

$('#tools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) startTool(b.dataset.tool); });
$('#hint').addEventListener('click', (e) => { if (e.target.dataset.act === 'cancel') cancelTool(); });

function cancelTool() { ui.tool = null; ui.picked = []; view.preview = null; refresh(); }

$('#results').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id, it = state.items.find((x) => x.id === id);
  if (b.dataset.act === 'del') {
    commit();
    const dead = withDependents(state.items, id);
    state.items = state.items.filter((x) => !dead.has(x.id));
    ui.picked = [];
    refresh();
  } else if (b.dataset.act === 'hide') { it.hide = !it.hide; refresh(); }
  else if (b.dataset.act === 'unfold') { ui.unfolded.has(id) ? ui.unfolded.delete(id) : ui.unfolded.add(id); renderResults(); }
  else if (b.dataset.act === 'look') view.lookAlong(toFloat(ctx.results.get(id).section.n));
});

$('#results').addEventListener('change', (e) => {
  const key = e.target.dataset.ratio;
  if (!key) return;
  commit();
  const it = state.items.find((x) => x.id === e.target.closest('[data-id]').dataset.id);
  it.def = { ...it.def, [key]: e.target.value.trim() };
  refresh();
});

const alpha = $('#alpha'), hidden = $('#hidden'), labels = $('#labels');
function syncViewControls() { alpha.value = state.opts.alpha; hidden.checked = state.opts.hidden; labels.checked = state.opts.labels; }
alpha.addEventListener('input', () => { state.opts.alpha = +alpha.value; view.opts = state.opts; view.invalidate(); save(); });
hidden.addEventListener('change', () => { state.opts.hidden = hidden.checked; view.invalidate(); save(); });
labels.addEventListener('change', () => { state.opts.labels = labels.checked; view.invalidate(); save(); });
$('#home').addEventListener('click', () => { view.zoom = 1; view.animateTo(HOME.yaw, HOME.pitch); });
$('#undo').addEventListener('click', undo);
$('#clear').addEventListener('click', () => { if (!state.items.length) return; commit(); state.items = []; ui.tool = null; ui.picked = []; ui.unfolded.clear(); refresh(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.tool) cancelTool();
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !/INPUT|SELECT/.test(e.target.tagName)) { e.preventDefault(); undo(); }
});

syncViewControls();
refresh(true);
void fmtNum;
