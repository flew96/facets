import { fmtNum, fmtVal, fmtApprox, valToNumber, isPlain, parseNum, parseDim, unitStr } from '../math/num.js';
import { toFloat } from '../math/vec.js';
import { KINDS, BASES, DEFAULT_PARAMS, SCALARS, buildSolid, defaultSpec, specUnit, parseNames, relabel } from '../geom/solids.js';
import { TOOLS, POINT_POOL, evaluate, withDependents } from '../geom/construct.js';
import { roundTools, roundToolGroups, evaluateRound, ANGLE_STEP } from '../geom/round.js';
import { buildTrace } from '../geom/trace.js';
import { explain } from '../geom/explain.js';
import { fittable, solveConds, buildSpec, unknownChoices, relevantItems, condsStatus, UNIT } from '../geom/fit.js';
import { View, HOME } from './view.js';
import { netSvg } from './net.js';
import { EXAMPLES } from './examples.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLORS = ['#c2410c', '#1d4ed8', '#15803d', '#9333ea', '#be123c', '#0e7490'];
const STORE = 'facets.v1';
const SNAP = 12; // точки на рёбрах и гранях привязываются к двенадцатым долям
const SECTIONS = ['section', 'secPar', 'secPerp', 'secPar2'];

const TOOL_GROUPS = [
  ['Точки', ['point', 'ratio', 'center']],
  ['Прямые через точку', ['parLine', 'perpLineThru', 'normLine']],
  ['Сечения', ['section', 'secPar', 'secPerp', 'secPar2']],
  ['Перпендикуляры', ['perpPlane', 'perpLine', 'commonPerp']],
  ['Сферы', ['sphereIn', 'sphereOut']],
  ['Измерения', ['dist', 'angleLL', 'angleLP', 'anglePP']],
];

// Тела вращения — отдельная ветка: свои инструменты и свой пересчёт построений
const toolsNow = () => (solid?.round ? roundTools(solid.shape) : TOOLS);
const groupsNow = () => (solid.round ? roundToolGroups(solid.shape) : TOOL_GROUPS);
const evalNow = () => (solid.round ? evaluateRound : evaluate)(solid, state.items);

const freshState = (ex) => ({ opts: { alpha: 0.1, hidden: true, labels: true }, conds: [], ...structuredClone(ex.state) });

let state = fromHash() || load() || freshState(EXAMPLES[0]);
let solid = null, specError = null, ctx = null;
const ui = { tool: null, picked: [], unfolded: new Set(), solOpen: new Set(), steps: null, fit: null };
const history = [];
const traces = new Map();
const view = new View($('#view'));

function valid(s) { return s && s.spec && KINDS[s.spec.kind] && Array.isArray(s.items) ? { opts: { alpha: 0.1, hidden: true, labels: true }, seq: 1000, ...s, conds: Array.isArray(s.conds) ? s.conds : [] } : null; }
function load() { try { return valid(JSON.parse(localStorage.getItem(STORE))); } catch { return null; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* хранилище недоступно */ } }
function commit() { history.push(JSON.stringify(state)); if (history.length > 100) history.shift(); }
function resetUi() { ui.tool = null; ui.picked = []; ui.steps = null; ui.fit = null; ui.unfolded.clear(); ui.solOpen.clear(); view.preview = null; }
function undo() {
  if (!history.length) return;
  state = JSON.parse(history.pop());
  resetUi();
  refresh(true);
}
function replaceState(next) { commit(); state = next; resetUi(); syncViewControls(); refresh(true); }

// Ссылка на задачу: всё состояние упаковано в адрес после #
function encodeState() {
  const bytes = new TextEncoder().encode(JSON.stringify({ spec: state.spec, items: state.items, seq: state.seq, conds: state.conds }));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromHash() {
  const m = /^#s=([\w-]+)$/.exec(location.hash);
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const s = valid(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))));
    window.history.replaceState(null, '', location.pathname);
    return s;
  } catch { return null; }
}

// ───────────────────────────── пересчёт и сцена ─────────────────────────────

function refresh(figureChanged = false) {
  if (solveIfNeeded()) figureChanged = true;
  try { solid = buildSolid(buildSpec(state.spec, state.conds)); solid.from = state.spec; specError = null; } catch (e) { specError = e.message; if (!solid) solid = buildSolid(defaultSpec('cube')); }
  ctx = evalNow();
  traces.clear();
  if (ui.steps && !traceOf(ui.steps.id)) ui.steps = null;
  view.opts = state.opts;
  view.setScene(buildScene());
  if (figureChanged) renderFigure();
  renderFigureInfo();
  renderTools();
  renderHint();
  renderResults();
  save();
}

/** Шаги построения сечения методом следов (или null, если они неприменимы) */
function traceOf(id) {
  if (traces.has(id)) return traces.get(id);
  const it = state.items.find((x) => x.id === id), sec = ctx.results.get(id)?.section;
  let tr = null;
  if (it && it.kind === 'section' && sec && !sec.onFace) { try { tr = buildTrace(solid, sec, ctx.used); } catch { tr = null; } }
  traces.set(id, tr);
  return tr;
}

const dotF = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Часть фигуры по одну сторону от плоскости g(p) = keep·(n·p − d) ≥ 0 — тоже выпуклый многогранник */
function cutSolid(verts, faces, planes, n, d, keep) {
  const g = (p) => keep * (dotF(n, p) - d);
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
      return Math.atan2(dotF(a, e2), dotF(a, e1) * Math.hypot(...n)) - Math.atan2(dotF(b, e2), dotF(b, e1) * Math.hypot(...n));
    });
    const l = Math.hypot(...n), u = n.map((x) => (-keep * x) / l);
    outF.push(ids); outP.push({ n: u, d: dotF(u, outV[ids[0]]) });
  }
  const seen = new Set(), edges = [];
  for (const f of outF) f.forEach((a, i) => {
    const b = f[(i + 1) % f.length], key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
  });
  return { verts: outV, faces: outF, planes: outP, edges, inside: (p) => g(p) >= -eps * 10 };
}

function buildScene() {
  const c = toFloat(solid.centroid);
  const F = (pos) => { const p = toFloat(pos); return [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; };
  const D = toFloat; // направления сдвигать не нужно
  const verts = solid.verts.map(F);
  const planes = solid.planes.map((pl, i) => {
    const n = toFloat(pl.n), l = Math.hypot(...n), u = n.map((x) => x / l);
    return { n: u, d: dotF(u, verts[solid.faces[i][0]]) };
  });
  const colorOf = (id) => COLORS[(state.items.find((it) => it.id === id)?.color ?? 0) % COLORS.length];
  const layers = [];
  let hiddenNames = null;
  for (const it of state.items) {
    const res = ctx.results.get(it.id), dr = res.draw;
    if (it.hide || !dr) continue;
    const L = { id: it.id, color: colorOf(it.id) };
    const tr = ui.steps?.id === it.id ? traceOf(it.id) : null;
    if (tr) {
      // показываем построение только до текущего шага
      const upTo = tr.slice(0, ui.steps.k + 1), cur = upTo.at(-1);
      L.segs = upTo.flatMap((s) => s.segs).map((s) => ({ a: F(s.a), b: F(s.b), cls: s.cls }));
      L.labels = upTo.flatMap((s) => s.labels).map((l) => ({ name: l.name, p: F(l.pos) }));
      L.polys = cur.final ? dr.polys.map((p) => ({ pts: p.pts.map(F), cls: p.cls })) : [];
      if (cur.final) L.segs.push(...dr.segs.map((s) => ({ a: F(s.a), b: F(s.b), cls: s.cls })));
      const found = new Set(cur.found);
      hiddenNames = new Set(res.section.names.filter((nm) => !found.has(nm)));
    } else {
      L.segs = (dr.segs || []).map((s) => ({ a: F(s.a), b: F(s.b), cls: s.cls }));
      L.polys = (dr.polys || []).map((p) => ({ pts: p.pts.map(F), cls: p.cls }));
    }
    L.marks = (dr.marks || []).map((m) => ({ at: F(m.at), u: D(m.u), v: D(m.v) }));
    L.circs = (dr.circs || []).map((s) => ({ c: F(s.c), n: D(s.n), rho: s.rho, cls: s.cls, fill: s.fill }));
    L.spheres = (dr.spheres || []).map((s) => ({ c: F(s.c), r: s.r }));
    L.dots = (dr.dots || []).map(F);
    layers.push(L);
  }
  const picked = new Set(ui.picked.map((r) => ctx.points.get(r)));
  let points = [...new Set(ctx.points.values())]
    .filter((p) => !(hiddenNames && p.role === 'derived' && hiddenNames.has(p.name)))
    .map((p) => ({ ref: p.ref, name: p.name, p: F(p.pos), role: p.role, sel: picked.has(p), color: p.item ? colorOf(p.item) : null }));
  const scene = { verts, faces: solid.faces, edges: solid.edges, planes, layers, points, names: solid.names, radius: Math.max(...verts.map((v) => Math.hypot(...v))) };
  if (solid.round) {
    // тело вращения в координатах чертежа: ось z, центр — середина оси
    const r0 = solid.r0.toNumber(), r1 = solid.r1.toNumber(), half = solid.h.toNumber() / 2;
    scene.round = { ball: solid.shape === 'ball', R: r0, r0, r1, z0: -half, z1: half };
    scene.radius = scene.round.ball ? r0 : Math.hypot(Math.max(r0, r1), half);
  }

  // Отсечение: вместо фигуры рисуем её часть по одну сторону от сечения
  const cutIt = state.items.find((it) => it.cut && !it.hide && ctx.results.get(it.id).section && !ctx.results.get(it.id).section.onFace);
  if (cutIt) {
    const sec = ctx.results.get(cutIt.id).section, n = toFloat(sec.n);
    const part = cutSolid(verts, solid.faces, planes, n, sec.d.toNumber() - dotF(n, c), cutIt.cut === 1 ? -1 : 1);
    Object.assign(scene, {
      verts: part.verts, faces: part.faces, edges: part.edges, planes: part.planes, locked: true,
      ghostEdges: solid.edges.map(([i, j]) => [verts[i], verts[j]]),
      points: points.filter((p) => part.inside(p.p)),
    });
  }
  return scene;
}

// ────────────────────────────── создание объектов ──────────────────────────────

function newId() { return 'i' + state.seq++; }
function nextColor() { return state.items.filter((it) => it.kind !== 'point').length % COLORS.length; }

function addPoint(def) {
  const id = newId();
  state.items.push({ id, kind: 'point', name: ctx.alloc(POINT_POOL), color: nextColor(), def });
  ctx = evalNow();
  return id;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Привязка клика: ребро → точка в «хорошем» отношении, грань → точка с рациональными координатами */
function snapPick(pk) {
  const S = view.scene;
  if (pk.type === 'point') return { ref: pk.ref, p: S.points.find((p) => p.ref === pk.ref).p, label: '' };
  if (pk.type === 'circ' || pk.type === 'gen') return snapRound(pk);
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
  const a11 = dotF(e1, e1), a12 = dotF(e1, e2), a22 = dotF(e2, e2), b1 = dotF(w, e1), b2 = dotF(w, e2), det = a11 * a22 - a12 * a12;
  const u = Math.round(((b1 * a22 - b2 * a12) / det) * SNAP), v = Math.round(((b2 * a11 - b1 * a12) / det) * SNAP);
  return {
    def: { t: 'face', f: pk.f, u: `${u}/${SNAP}`, v: `${v}/${SNAP}` },
    p: o.map((x, q) => x + (e1[q] * u + e2[q] * v) / SNAP),
    label: `на грани ${solid.faceNames[pk.f]}`,
  };
}

/** То же для тела вращения: окружность основания — углы через 15°, образующая — двенадцатые доли */
function snapRound(pk) {
  const ang = String(pk.k * ANGLE_STEP);
  const onRim = (base, p) => ({
    def: { t: 'circ', base, ang }, p,
    label: `${solid.shape === 'ball' ? 'экватор' : base ? 'окружность верхнего основания' : 'окружность нижнего основания'}, ${ang}°`,
  });
  if (pk.type === 'circ') return onRim(pk.base, pk.p);
  const k = Math.round(pk.t * SNAP);
  if (k === 0) return onRim(0, pk.a);
  if (k === SNAP) return solid.shape === 'cone' ? { ref: 'v1', p: view.scene.verts[1], label: '' } : onRim(1, pk.b);
  const g = gcd(k, SNAP - k), m = k / g, n = (SNAP - k) / g;
  return {
    def: { t: 'gen', ang, m: String(m), n: String(n) },
    p: pk.a.map((x, q) => x + (pk.b[q] - x) * (k / SNAP)),
    label: `образующая ${ang}°, ${m} : ${n} от нижнего основания`,
  };
}

function startTool(name) {
  const tool = toolsNow()[name];
  ui.picked = [];
  if (tool.slots && tool.slots.length === 0) {
    commit();
    state.items.push({ id: newId(), kind: name, color: nextColor() });
    ui.tool = null;
  } else ui.tool = ui.tool === name ? null : name;
  refresh();
}

/** Режим клика для текущего шага инструмента */
function pickMode(tool) {
  if (tool.face) return 'face';
  return tool.planeAt?.includes(ui.picked.length) ? 'plane' : 'pt';
}

/** Три точки, задающие плоскость грани или готового сечения */
function planeRefs(pk) {
  return pk.type === 'face' ? solid.faces[pk.f].slice(0, 3).map((i) => 'v' + i) : [0, 1, 2].map((k) => `${pk.id}:k${k}`);
}

view.onPick = (x, y) => {
  if (!ui.tool || specError) return;
  const tool = toolsNow()[ui.tool], mode = pickMode(tool);
  const pk = view.pick(x, y, mode);
  if (!pk) return;
  if (tool.face) {
    commit();
    addPoint({ t: 'center', f: pk.f });
    ui.tool = null;
    return refresh();
  }
  let refs, created = false;
  if (mode === 'plane' && (pk.type === 'face' || pk.type === 'section')) refs = planeRefs(pk);
  else {
    const sn = snapPick(pk);
    if (!sn.ref) { commit(); created = true; }
    refs = [sn.ref || addPoint(sn.def)];
  }
  if (!tool.free) {
    ui.picked.push(...refs);
    if (ui.picked.length === tool.slots.length) {
      if (!created) commit();
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
    const tool = toolsNow()[ui.tool], mode = pickMode(tool);
    const pk = view.pick(x, y, mode);
    if (pk && tool.face) pv = { p: pk.p, label: `грань ${solid.faceNames[pk.f]}` };
    else if (pk && mode === 'plane' && pk.type === 'face') pv = { p: pk.p, label: `плоскость грани ${solid.faceNames[pk.f]}` };
    else if (pk && pk.type === 'section') pv = { p: pk.p, label: 'плоскость этого сечения' };
    else if (pk) pv = snapPick(pk);
  }
  if (pv || view.preview) { view.preview = pv; view.invalidate(); }
};

// ─────────────────────────────── левая панель ───────────────────────────────

/** Числовое значение размера для положения ползунка (сам размер остаётся точным); для «3a/2» — множитель 1,5 */
function approxOf(raw) { try { return parseDim(raw).v.toNumber(); } catch { return NaN; } }

/**
 * После смены фигуры или основания появляются поля со значениями по умолчанию — числами.
 * Если остальные размеры буквенные, записываем их через ту же букву: 3 → 3a.
 */
function harmonize(spec) {
  const u = specUnit(spec);
  if (!u) return spec;
  const p = { ...spec.p };
  for (const [key, , mode] of KINDS[spec.kind].params(spec)) {
    if (mode === 'pts' || SCALARS.includes(key)) continue;
    try { const d = parseDim(p[key] ?? DEFAULT_PARAMS[key]); if (!d.sym && !d.v.isZero()) p[key] = fmtNum(d.v, u); } catch { /* оставляем как есть */ }
  }
  return { ...spec, p };
}

/**
 * При переключении «высота ↔ боковое ребро» новое поле заполняем значением,
 * которое было у текущей фигуры, — пирамида на чертеже не меняется.
 */
function keepShape(mode) {
  const p = { ...state.spec.p };
  if (specError || !solid.info?.length) return p;
  const u = solid.unit || '';
  if (mode === 'edge') {
    const [, l] = solid.info[0];
    if (l.t) p.l = fmtNum(l, u); // точное число (не «неупрощаемый корень»)
  } else p.h = fmtNum(solid.params.h, u);
  return p;
}

/** Ползунок шагает по «хорошим» дробям, поэтому значения остаются точными */
function sliderHtml(key, mode, raw, label, unit) {
  const v = approxOf(raw);
  const [min, max, step] = mode === 'any' ? [-10, 10, 0.25] : key === 'k' ? [0.05, 2, 0.05] : [0.25, 12, 0.25];
  const hi = Number.isFinite(v) ? Math.max(max, Math.ceil(v)) : max, lo = Number.isFinite(v) ? Math.min(min, Math.floor(v)) : min;
  return `<input type="range" data-slide="${key}" min="${mode === 'any' ? lo : min}" max="${hi}" step="${step}" value="${Number.isFinite(v) ? v : min}" aria-label="${esc(label)}: ${unit ? `ползунок множителя при ${unit}` : 'ползунок'}"${unit ? ` title="Множитель при ${unit}"` : ''}>`;
}

function renderFigure() {
  const s = state.spec, k = KINDS[s.kind];
  const opt = (v, t, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`;
  const unit = specUnit(s);
  // подписи полей — с именами вершин, которые выбрал пользователь
  const fresh = !specError && solid.from === s && !k.round;
  const rl = (t) => (fresh ? relabel(t, solid.defaultNames, solid.names) : t);
  let html = `<label class="field"><span>Фигура</span><select data-spec="kind">${Object.entries(KINDS).map(([v, x]) => opt(v, x.title, s.kind)).join('')}</select></label>`;
  if (k.bases) html += `<label class="field"><span>Основание</span><select data-spec="base">${k.bases.map((b) => opt(b, BASES[b].title, s.base)).join('')}</select></label>`;
  if (k.tilt) html += `<label class="field"><span>Боковые рёбра</span><select data-spec="tilt">${opt('right', 'перпендикулярны основанию (прямая)', s.tilt || 'right')}${opt('oblique', 'наклонные (наклонная призма)', s.tilt)}</select></label>`;
  if (k.hmode) html += `<label class="field"><span>Высоту задаём</span><select data-spec="hmode">${opt('h', 'высотой', s.hmode || 'h')}${opt('edge', 'боковым ребром', s.hmode)}</select></label>`;
  if (k.apex) {
    const n = !specError && solid.from === s ? solid.baseSize : { tri: 3, rtri: 3, tri3: 3, hex: 6 }[s.base] || 4;
    const centerName = s.base === 'rtri' ? 'в середину гипотенузы' : ['tri3', 'trap', 'poly'].includes(s.base) ? 'в центроид вершин основания' : 'в центр основания';
    const who = s.kind === 'frustum' ? 'Вершина полной пирамиды проецируется' : rl('Вершина S проецируется');
    const vn = fresh ? solid.names : [...'ABCDEFGH'];
    html += `<label class="field"><span>${who}</span><select data-spec="apex">${opt('center', centerName, s.apex)}${vn.slice(0, n).map((c, i) => opt(String(i), `в вершину ${c}`, s.apex)).join('')}${opt('custom', 'в произвольную точку (x; y)', s.apex)}</select></label>`;
  }
  const unknown = new Set((state.conds || []).map((c) => c.unknown));
  html += '<div class="params">' + k.params(s).map(([key, label, mode]) => {
    const raw = s.p[key] ?? DEFAULT_PARAMS[key];
    if (unknown.has(key)) {
      return `<label class="field solved"><span>${esc(rl(label))}</span><input data-param="${key}" value="${esc(raw)}" readonly title="Находится из условия задачи — чтобы задать вручную, удалите условие"><small>ищем из условия</small></label>`;
    }
    return mode === 'pts'
      ? `<label class="field wide"><span>${esc(rl(label))}</span><textarea data-param="${key}" rows="3" spellcheck="false">${esc(raw)}</textarea></label>`
      : `<label class="field"><span>${esc(rl(label))}</span><input data-param="${key}" value="${esc(raw)}" spellcheck="false" autocomplete="off">${sliderHtml(key, mode, raw, label, SCALARS.includes(key) ? null : unit)}</label>`;
  }).join('') + '</div>';
  html += '<p class="fine">Размеры можно вводить точно: <code>3/2</code>, <code>2√3</code>, <code>sqrt(2)</code> — или буквой: <code>a</code>, <code>2a</code>, <code>a/2</code>, <code>a√3</code>. С буквой все размеры должны быть пропорциональны ей, а ответы получатся в виде <code>a√3/2</code>, <code>a²√3/4</code>.</p>';
  if (unit) html += `<p class="fine">Ползунки меняют множитель при ${esc(unit)}.</p>`;
  if (unit && unknown.has(UNIT) && s.unitVal) html += `<p class="fine solvedline">Из условия: <b>${esc(unit)} = ${esc(s.unitVal)}</b> — ответы ниже посчитаны при этом значении.</p>`;
  if (!k.round) {
    const names = fresh ? solid.names : [];
    const shown = names.every((x) => x.length === 1) ? names.join('') : names.join(' ');
    html += `<label class="field"><span>Обозначения вершин</span><input data-names value="${esc(shown)}" spellcheck="false" autocomplete="off" aria-describedby="names-help"></label>`
      + '<p class="fine" id="names-help">По порядку, например <code>ABCD</code> вместо <code>ABCS</code>; с индексами — через пробел: <code>A B C A1 B1 C1</code>. Пустое поле — обозначения по умолчанию.</p>';
  }
  $('#figure').innerHTML = html;
}

function valHtml(v, deg) {
  const u = unitStr(solid.unit, deg);
  return `<b>${esc(fmtVal(v, u))}</b>${isPlain(v) ? '' : ` <span class="approx">≈ ${fmtApprox(valToNumber(v))}${u ? '·' + esc(u) : ''}</span>`}`;
}

function renderFigureInfo() {
  $('#figure-info').innerHTML = specError
    ? `<p class="err">${esc(specError)}</p>`
    : `<dl><dt>Объём</dt><dd>${valHtml(solid.volume, 3)}${fitBtn('figure', 'volume', { val: solid.volume, deg: 3 })}</dd><dt>Площадь поверхности</dt><dd>${valHtml(solid.surface, 2)}${fitBtn('figure', 'surface', { val: solid.surface, deg: 2 })}</dd>${(solid.info || []).map(([k, v, deg], i) => `<dt>${esc(k)}</dt><dd>${valHtml(v, deg)}${deg ? fitBtn('figure', 'info:' + i, { val: v, deg }) : ''}</dd>`).join('')}</dl>`
      + fitForm('figure')
      + condsHtml()
      + (solid.unit ? `<p class="fine">Размеры заданы буквой: считаем, что ${esc(solid.unit)} > 0 — произвольная положительная длина. Ответы точны при любом таком ${esc(solid.unit)}.</p>` : '')
      + (solid.baseCoords && (state.spec.apex === 'custom' || state.spec.tilt === 'oblique' || state.spec.base === 'poly')
        ? `<p class="fine coords">Координаты основания: ${esc(solid.baseCoords)}</p>` : '');
}

function renderTools() {
  const TOOLS = toolsNow();
  $('#tools').innerHTML = groupsNow().map(([title, names]) => `<div class="group"><h4>${title}</h4>${names.map((n) => `<button class="tool${ui.tool === n ? ' on' : ''}" data-tool="${n}">${esc(TOOLS[n].title)}</button>`).join('')}</div>`).join('');
}

function renderHint() {
  const el = $('#hint');
  const tool = ui.tool && toolsNow()[ui.tool];
  if (!tool) { ui.tool = null; el.hidden = true; return; }
  const chips = ui.picked.map((r) => `<span class="chip">${esc(ctx.points.get(r)?.name ?? '?')}</span>`).join('');
  let what = esc(tool.hint || '');
  if (tool.slots) {
    const plane = pickMode(tool) === 'plane';
    const how = view.scene?.locked ? 'существующая точка (пока часть фигуры отсечена, новые точки не ставятся)'
      : solid.round ? (solid.shape === 'ball' ? 'отмеченная точка или точка экватора' : 'отмеченная точка, точка окружности основания или точка на образующей')
        : plane ? 'три точки по очереди — или один клик по грани либо по готовому сечению' : 'вершина, точка на ребре или на грани';
    what = `Выберите: <b>${plane ? 'плоскость' : tool.slots[ui.picked.length]}</b> <span class="fine">(${ui.picked.length + 1} из ${tool.slots.length}) — ${how}</span>`;
  }
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
  let q = P.map((p) => { const w = p.map((x, i) => x - P[0][i]); return [dotF(w, e1), dotF(w, e2)]; });
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
    s += `<text class="s" x="${m[0].toFixed(1)}" y="${m[1].toFixed(1)}">${esc(fmtVal(sec.sides[i], unitStr(solid.unit, 1)))}</text>`;
  });
  return `<figure class="unfold"><svg viewBox="0 0 ${W} ${H}">${s}</svg><figcaption>Сечение в натуральную величину; подписаны длины сторон</figcaption></figure>`;
}

const CUT_LABEL = ['Отсечь часть фигуры', 'Отсечь другую часть', 'Вернуть целую фигуру'];

function sectionExtras(it, r) {
  let body = '<div class="actions">';
  const tr = traceOf(it.id), stepping = ui.steps?.id === it.id;
  if (tr) body += `<button data-act="steps"${stepping ? ' class="on"' : ''}>${stepping ? 'Закрыть построение' : 'Построить по шагам'}</button>`;
  body += `<button data-act="unfold">${ui.unfolded.has(it.id) ? 'Свернуть' : 'Натуральная величина'}</button><button data-act="look">Смотреть перпендикулярно</button>`;
  if (!r.section.onFace && !solid.round) body += `<button data-act="cut"${it.cut ? ' class="on"' : ''}>${CUT_LABEL[it.cut || 0]}</button>`;
  body += '</div>';
  if (stepping) {
    const k = ui.steps.k;
    body = `<div class="steps"><div class="stepbar"><button data-act="prev"${k === 0 ? ' disabled' : ''} aria-label="Предыдущий шаг">◀</button><span>Шаг ${k + 1} из ${tr.length}</span><button data-act="next"${k === tr.length - 1 ? ' disabled' : ''} aria-label="Следующий шаг">▶</button></div><p>${esc(tr[k].text)}</p></div>` + body;
  }
  if (ui.unfolded.has(it.id)) body += unfoldSvg(r.section);
  return body;
}

function renderResults() {
  const el = $('#results');
  if (!state.items.length) {
    el.innerHTML = `<p class="empty">Построений пока нет. Выберите инструмент слева и кликайте по ${solid.round ? 'фигуре: точки на окружности основания ставятся через 15°, точки на образующих — в «хороших» отношениях' : 'вершинам, рёбрам и граням фигуры — точки на рёбрах привязываются к «хорошим» отношениям'} (½, ⅓, ¼…). Или откройте готовый пример из списка выше.</p>`;
    return;
  }
  el.innerHTML = state.items.map((it) => {
    const r = ctx.results.get(it.id);
    const isPoint = it.kind === 'point';
    let body = '';
    if (isPoint && it.def.t === 'ratio') {
      const a = ctx.points.get(it.def.a)?.name ?? '?', b = ctx.points.get(it.def.b)?.name ?? '?';
      body += `<div class="ratio">${esc(a + it.name)} : ${esc(it.name + b)} = <input data-ratio="m" value="${esc(it.def.m)}" aria-label="первая часть отношения"> : <input data-ratio="n" value="${esc(it.def.n)}" aria-label="вторая часть отношения"></div>`;
    }
    if (isPoint && it.def.t === 'gen') body += `<div class="ratio">от нижнего основания <input data-ratio="m" value="${esc(it.def.m)}" aria-label="первая часть отношения"> : <input data-ratio="n" value="${esc(it.def.n)}" aria-label="вторая часть отношения"></div>`;
    if (solid.round && (it.kind === 'axial' || (isPoint && it.def.t !== 'ratio'))) {
      const cur = String(it.def?.ang ?? '0');
      const angles = Array.from({ length: 360 / ANGLE_STEP }, (_, k) => String(k * ANGLE_STEP));
      body += `<label class="ratio">Угол поворота <select data-ang aria-label="Угол поворота">${angles.map((a) => `<option value="${a}"${a === cur ? ' selected' : ''}>${a}°</option>`).join('')}</select></label>`;
    }
    if (r.error) body += `<p class="err">${esc(r.error)}</p>`;
    if (r.absent || r.badge) body += `<p class="badge">${esc(r.badge || 'не существует')}</p>`;
    if (r.section) body += sectionExtras(it, r);
    const rows = isPoint && it.def.t === 'ratio' ? [] : r.rows;
    if (rows.length) body += '<dl>' + rows.map((x, i) => `<dt>${esc(x.k)}</dt><dd><b>${esc(x.v)}</b>${x.a ? ` <span class="approx">≈ ${x.a}</span>` : ''}${fitBtn(it.id, String(i), x)}</dd>`).join('') + '</dl>';
    body += fitForm(it.id);
    body += r.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('');
    const sol = isPoint ? null : explain(it, ctx);
    if (sol) body += `<details class="sol"${ui.solOpen.has(it.id) ? ' open' : ''}><summary>Решение методом координат</summary><ol>${sol.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>`;
    const title = isPoint
      ? `<h3>Точка <input class="rename" data-rename value="${esc(it.name)}" maxlength="4" aria-label="Имя точки" title="Имя можно изменить"></h3>`
      : `<h3>${esc(r.title || toolsNow()[it.kind]?.title || 'Построение')}</h3>`;
    return `<article class="card${it.hide ? ' dim' : ''}${isPoint ? ' small' : ''}" data-id="${it.id}" style="--c:${COLORS[it.color % COLORS.length]}">
      <header>${title}
      ${isPoint ? '' : `<button data-act="hide" title="${it.hide ? 'Показать' : 'Скрыть'} на чертеже">${it.hide ? '○' : '●'}</button>`}
      <button data-act="del" title="Удалить">✕</button></header>${body}</article>`;
  }).join('');
}

// ───────────────────────── условия задачи ─────────────────────────
// Величина из условия («площадь сечения = 12») + искомый размер. Условия хранятся в state.conds
// и решаются вместе при каждом изменении данных размеров; искомые размеры пишутся в state.spec.p.

let solvedKey = null, condError = null;

/** Ключ всего, от чего зависит решение (без самих искомых — иначе решение меняло бы ключ) */
function condKey() {
  const unk = new Set(state.conds.map((c) => c.unknown));
  const { p, unitVal, ...rest } = state.spec;
  const known = Object.fromEntries(Object.entries(p).filter(([k]) => !unk.has(k)));
  return JSON.stringify([rest, known, state.conds.map((c) => [c.target, c.text, c.unknown]), relevantItems(state.items, state.conds).map((it) => [it.id, it.def, it.refs])]);
}

/** Пересчитывает искомые размеры, если изменились данные; true — если фигура изменилась */
function solveIfNeeded() {
  if (!state.conds?.length) { condError = null; solvedKey = null; return false; }
  if (sliding) return false; // пока тянут ползунок, не решаем — решим, когда отпустят
  const key = condKey();
  if (key === solvedKey) return false;
  solvedKey = key;
  const r = solveConds(state.spec, state.items, state.conds);
  if (r.error) { condError = r.error; return false; }
  condError = null;
  const changed = JSON.stringify(r.spec) !== JSON.stringify(state.spec);
  state.spec = r.spec;
  return changed;
}

const fitKey = (owner, key) => `${owner}|${key}`;
const condOf = (key) => state.conds.find((c) => c.key === key);

function fitBtn(owner, key, row) {
  if (solid.round || specError || !fittable(row)) return '';
  const k = fitKey(owner, key), c = condOf(k), on = ui.fit?.key === k;
  const title = c ? `Условие задачи: ${c.text} — изменить` : 'Задать это значение из условия задачи';
  return ` <button class="fitbtn${on ? ' on' : ''}${c ? ' has' : ''}" data-fitopen="${esc(k)}" data-deg="${row.deg}" data-word="${esc(String(row.k ?? '').split(/\s/)[0])}" title="${esc(title)}" aria-label="${esc(title)}">${c ? '★' : '✎'}</button>`;
}

const rlNow = (t) => relabel(t, solid.defaultNames, solid.names);
function unknownLabel(u) {
  if (u === UNIT) return specUnit(state.spec) || 'масштаб';
  const ch = unknownChoices(state.spec).find(([k]) => k === u);
  return ch ? rlNow(ch[1]) : u;
}

/** Подпись величины условия: «Сечение (KLM): Площадь», «Объём фигуры» */
function condLabel(c) {
  const t = c.target;
  if (t.src === 'figure') {
    if (t.key === 'volume') return 'Объём фигуры';
    if (t.key === 'surface') return 'Площадь поверхности';
    return solid.info?.[+t.key.split(':')[1]]?.[0] || 'Величина фигуры';
  }
  const res = ctx.results.get(t.id);
  const row = res?.rows[t.idx];
  return `${res?.title || 'Построение'}: ${(row?.k ?? t.word).replace(/^Угол φ$/, 'угол')}`;
}

function condsHtml() {
  if (solid.round) return '';
  const conds = state.conds || [];
  if (!conds.length) return '<p class="fine">Дано в задаче не размер, а площадь сечения, расстояние, угол или объём? Нажмите ✎ рядом с этой величиной и введите её значение — фигура подстроится, а остальные размеры останутся как есть.</p>';
  const status = condError ? condsStatus(state.spec, state.items, state.conds) : conds.map(() => true);
  const found = conds.map((c) => `${esc(unknownLabel(c.unknown))} = <b>${esc(c.unknown === UNIT ? state.spec.unitVal || '?' : state.spec.p[c.unknown] ?? '?')}</b>`).join(', ');
  return `<div class="conds"><h4>Условия задачи</h4><ul>${conds.map((c, i) => `<li class="${status[i] ? 'ok' : 'bad'}"><span class="mark" aria-hidden="true">${status[i] ? '✓' : '✗'}</span><span>${esc(condLabel(c))} = <b>${esc(c.deg === 'angle' && /^\d+$/.test(c.text.trim()) ? c.text.trim() + '°' : c.text)}</b></span><button data-conddel="${esc(c.id)}" title="Удалить условие" aria-label="Удалить условие">✕</button></li>`).join('')}</ul>`
    + `<p class="fine">Ищем: ${found}${conds.length > 1 ? ' — все условия решаются вместе' : ''}.</p>`
    + (condError ? `<p class="err">${esc(condError)}</p>` : '')
    + '</div>';
}

function fitForm(owner) {
  const f = ui.fit;
  if (!f || f.owner !== owner) return '';
  const angle = f.deg === 'angle';
  const taken = new Set(state.conds.filter((c) => c.key !== f.key).map((c) => c.unknown));
  const choices = unknownChoices(state.spec).filter(([k]) => !taken.has(k) && !(k === UNIT && (angle || f.deg === '0')));
  if (!choices.find(([k]) => k === f.unknown)) f.unknown = (choices.find(([k]) => k === 'h' || k === 'l') || choices.find(([k]) => k === UNIT) || choices[0])?.[0];
  const editing = !!condOf(f.key);
  const ph = angle ? '60 или tg = 2' : 'например, 12 или 6√3';
  return `<form class="fit" data-fitform>
    <label class="field"><span>${angle ? 'Угол по условию (в градусах или значение функции)' : 'Значение по условию задачи'}</span><input data-fitval value="${esc(f.text)}" placeholder="${esc(ph)}" spellcheck="false" autocomplete="off"></label>
    ${choices.length ? `<label class="field"><span>Какой размер неизвестен (его и найдём)</span><select data-fitmode>${choices.map(([k, t]) => `<option value="${esc(k)}"${k === f.unknown ? ' selected' : ''}>${esc(k === UNIT ? t : rlNow(t))}</option>`).join('')}</select></label>`
    : '<p class="err">Все размеры уже ищутся по другим условиям — удалите одно из них или задайте размер вручную.</p>'}
    <div class="row">${choices.length ? `<button type="submit">${editing ? 'Сохранить' : 'Добавить условие'}</button>` : ''}${editing ? '<button type="button" data-fitdel>Удалить</button>' : ''}<button type="button" data-fitcancel>Отмена</button></div>
    ${f.err ? `<p class="err">${esc(f.err)}</p>` : ''}
    <p class="fine">Остальные размеры — данные: они не меняются. Можно добавить несколько условий, у каждого — своё неизвестное.</p>
  </form>`;
}

function renderFit() { renderFigureInfo(); renderResults(); $('[data-fitform] [data-fitval]')?.focus(); }

function applyFit() {
  const f = ui.fit;
  if (!f || !f.unknown) return;
  const [owner, key] = f.key.split('|');
  const old = condOf(f.key);
  const cond = {
    id: old?.id || newId(), key: f.key, deg: f.deg === 'angle' ? 'angle' : +f.deg, text: f.text.trim(), unknown: f.unknown,
    target: owner === 'figure' ? { src: 'figure', key } : { src: 'item', id: owner, idx: +key, word: f.word },
  };
  const conds = old ? state.conds.map((c) => (c === old ? cond : c)) : [...state.conds, cond];
  const r = solveConds(state.spec, state.items, conds);
  if (r.error) { f.err = r.error; renderFit(); return; }
  commit();
  state.spec = r.spec;
  state.conds = conds;
  ui.fit = null;
  refresh(true);
  toast(`${unknownLabel(cond.unknown)} = ${cond.unknown === UNIT ? state.spec.unitVal : state.spec.p[cond.unknown]}`);
}

function removeCond(pred) {
  commit();
  state.conds = state.conds.filter((c) => !pred(c));
  ui.fit = null;
  refresh(true);
}

document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-fitopen]');
  if (open) {
    const key = open.dataset.fitopen, c = condOf(key);
    ui.fit = ui.fit?.key === key ? null : { key, owner: key.split('|')[0], deg: open.dataset.deg, word: open.dataset.word, text: c?.text || '', unknown: c?.unknown || null, err: '' };
    renderFit();
  } else if (e.target.closest('[data-fitcancel]')) { ui.fit = null; renderFit(); }
  else if (e.target.closest('[data-fitdel]')) { const k = ui.fit.key; removeCond((c) => c.key === k); }
  else if (e.target.closest('[data-conddel]')) { const id = e.target.closest('[data-conddel]').dataset.conddel; removeCond((c) => c.id === id); }
});
document.addEventListener('input', (e) => { if (ui.fit && 'fitval' in e.target.dataset) { ui.fit.text = e.target.value; ui.fit.err = ''; } });
document.addEventListener('change', (e) => { if (ui.fit && 'fitmode' in e.target.dataset) { ui.fit.unknown = e.target.value; ui.fit.err = ''; } });
document.addEventListener('submit', (e) => {
  if (!e.target.matches('[data-fitform]')) return;
  e.preventDefault();
  applyFit();
});

// ──────────────────────────── развёртка и файлы ────────────────────────────

function showNet() {
  if (solid.round) return toast('Развёртка пока строится только для многогранников');
  const whole = { verts: solid.verts.map(toFloat), faces: solid.faces, names: solid.names };
  whole.planes = solid.planes.map((pl, i) => { const n = toFloat(pl.n), l = Math.hypot(...n), u = n.map((x) => x / l); return { n: u, d: dotF(u, whole.verts[solid.faces[i][0]]) }; });
  const sections = state.items.filter((it) => SECTIONS.includes(it.kind) && !it.hide && ctx.results.get(it.id).section)
    .map((it) => ({ color: COLORS[it.color % COLORS.length], pts: ctx.results.get(it.id).section.pts.map(toFloat) }));
  $('#net-body').innerHTML = netSvg(whole, sections)
    + `<p class="fine">Все грани — в натуральную величину. ${sections.length ? 'Цветные линии — следы сечений на гранях.' : 'Постройте сечение, и его линия появится на развёртке.'}</p>`;
  $('#net').showModal();
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Чертёж как самостоятельный SVG-файл: стили переносим из таблицы стилей в сами элементы */
function exportSvg() {
  const src = $('#view'), copy = src.cloneNode(true);
  const props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-style', 'font-weight', 'text-anchor', 'dominant-baseline', 'paint-order'];
  const from = src.querySelectorAll('*'), to = copy.querySelectorAll('*');
  from.forEach((el, i) => {
    const cs = getComputedStyle(el);
    to[i].setAttribute('style', props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
    to[i].removeAttribute('class');
  });
  copy.querySelectorAll('.preview, .tip').forEach((el) => el.remove());
  const box = src.viewBox.baseVal;
  const bg = `<rect width="${box.width}" height="${box.height}" fill="${getComputedStyle(document.body).backgroundColor}"/>`;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box.width} ${box.height}" width="${box.width}" height="${box.height}">${bg}${copy.innerHTML}</svg>`;
  download('чертёж.svg', xml, 'image/svg+xml');
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

// ──────────────────────────────── события ────────────────────────────────

// Ползунок: фигура перестраивается на лету, в историю отмены попадает одно движение целиком
let sliding = false;
$('#figure').addEventListener('input', (e) => {
  const key = e.target.dataset.slide;
  if (!key) return;
  if (!sliding) { commit(); sliding = true; }
  const value = fmtNum(parseNum(e.target.value), SCALARS.includes(key) ? '' : specUnit(state.spec) || '');
  state.spec = { ...state.spec, p: { ...state.spec.p, [key]: value } };
  $(`#figure [data-param="${key}"]`).value = value;
  refresh();
});

$('#figure').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.slide) { sliding = false; if (state.conds.length) refresh(true); return; }
  if (t.dataset.param && t.dataset.param !== 'pts') {
    const sl = $(`#figure [data-slide="${t.dataset.param}"]`), v = approxOf(t.value);
    if (sl && Number.isFinite(v)) { sl.max = Math.max(+sl.max, Math.ceil(v)); sl.min = Math.min(+sl.min, Math.floor(v)); sl.value = v; }
  }
  if ('names' in t.dataset) {
    let names;
    try {
      if (specError) throw new Error('сначала исправьте размеры фигуры');
      names = parseNames(t.value);
      if (names) {
        const n = solid.defaultNames.length;
        if (names.length !== n) throw new Error(`нужно ${n} имён — по одному на каждую вершину, а введено ${names.length}`);
        const dup = names.find((x, i) => names.indexOf(x) !== i);
        if (dup) throw new Error(`имя ${dup} повторяется`);
        const taken = state.items.find((it) => it.kind === 'point' && names.includes(it.name));
        if (taken) throw new Error(`имя ${taken.name} уже носит построенная точка — переименуйте её или выберите другое`);
      }
    } catch (err) {
      toast(`Обозначения вершин: ${err.message}`);
      t.value = solid.names.every((x) => x.length === 1) ? solid.names.join('') : solid.names.join(' ');
      return;
    }
    commit();
    state.spec = { ...state.spec, names: names || undefined };
    refresh(true);
    return;
  }
  if (t.dataset.spec) {
    commit();
    const key = t.dataset.spec;
    if (key === 'kind') state.spec = { ...defaultSpec(t.value), p: state.spec.p };
    else if (key === 'hmode') state.spec = { ...state.spec, hmode: t.value, p: keepShape(t.value) };
    else state.spec = { ...state.spec, [key]: t.value };
    if (key === 'kind' || key === 'base') { state.items = []; state.conds = []; resetUi(); }
    if (key === 'base') { state.spec.apex = 'center'; delete state.spec.names; }
    state.spec = harmonize(state.spec);
    ui.tool = null; ui.picked = [];
    refresh(true);
  } else if (t.dataset.param) {
    commit();
    state.spec = { ...state.spec, p: { ...state.spec.p, [t.dataset.param]: t.value.trim() } };
    // если у основания стало другое число вершин, старые построения к новой фигуре не относятся
    const before = solid.verts.length;
    refresh();
    if (!specError && solid.verts.length !== before) { state.items = []; state.conds = []; delete state.spec.names; resetUi(); refresh(true); }
  }
});

$('#tools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) startTool(b.dataset.tool); });
$('#hint').addEventListener('click', (e) => { if (e.target.dataset.act === 'cancel') cancelTool(); });

function cancelTool() { ui.tool = null; ui.picked = []; view.preview = null; refresh(); }

$('#results').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id, it = state.items.find((x) => x.id === id);
  const act = b.dataset.act;
  if (act === 'del') {
    commit();
    const dead = withDependents(state.items, id);
    state.items = state.items.filter((x) => !dead.has(x.id));
    state.conds = state.conds.filter((c) => !(c.target.src === 'item' && dead.has(c.target.id)));
    ui.picked = [];
    refresh();
  } else if (act === 'hide') { it.hide = !it.hide; refresh(); }
  else if (act === 'unfold') { ui.unfolded.has(id) ? ui.unfolded.delete(id) : ui.unfolded.add(id); renderResults(); }
  else if (act === 'look') view.lookAlong(toFloat(ctx.results.get(id).section.n));
  else if (act === 'steps') { ui.steps = ui.steps?.id === id ? null : { id, k: 0 }; refresh(); }
  else if (act === 'prev' || act === 'next') {
    const n = traceOf(id).length;
    ui.steps.k = Math.max(0, Math.min(n - 1, ui.steps.k + (act === 'next' ? 1 : -1)));
    refresh();
    $(`[data-id="${id}"] [data-act="${ui.steps.k === n - 1 ? 'prev' : act}"]`)?.focus();
  } else if (act === 'cut') {
    const next = ((it.cut || 0) + 1) % 3;
    for (const x of state.items) delete x.cut;
    if (next) it.cut = next;
    refresh();
  }
});

$('#results').addEventListener('change', (e) => {
  const t = e.target, card = t.closest('[data-id]');
  if (!card) return;
  const it = state.items.find((x) => x.id === card.dataset.id);
  if (t.dataset.ratio) {
    commit();
    it.def = { ...it.def, [t.dataset.ratio]: t.value.trim() };
    refresh();
  } else if ('ang' in t.dataset) {
    commit();
    it.def = { ...it.def, ang: t.value };
    refresh();
  } else if ('rename' in t.dataset) {
    const name = t.value.trim();
    if (!name || name === it.name) { t.value = it.name; return; }
    if (ctx.used.has(name)) { t.value = it.name; toast(`Имя «${name}» уже занято`); return; }
    commit();
    it.name = name;
    refresh();
  }
});

// <details> не всплывает, поэтому слушаем на фазе перехвата
$('#results').addEventListener('toggle', (e) => {
  const d = e.target, id = d.closest?.('[data-id]')?.dataset.id;
  if (!id || !d.classList.contains('sol')) return;
  d.open ? ui.solOpen.add(id) : ui.solOpen.delete(id);
}, true);

const alpha = $('#alpha'), hidden = $('#hidden'), labels = $('#labels');
function syncViewControls() { alpha.value = state.opts.alpha; hidden.checked = state.opts.hidden; labels.checked = state.opts.labels; }
alpha.addEventListener('input', () => { state.opts.alpha = +alpha.value; view.opts = state.opts; view.invalidate(); save(); });
hidden.addEventListener('change', () => { state.opts.hidden = hidden.checked; view.invalidate(); save(); });
labels.addEventListener('change', () => { state.opts.labels = labels.checked; view.invalidate(); save(); });
$('#home').addEventListener('click', () => { view.zoom = 1; view.animateTo(HOME.yaw, HOME.pitch); });
$('#undo').addEventListener('click', undo);
$('#clear').addEventListener('click', () => { if (!state.items.length) return; commit(); state.items = []; state.conds = state.conds.filter((c) => c.target.src !== 'item'); resetUi(); refresh(true); });
$('#show-net').addEventListener('click', showNet);
$('#net-close').addEventListener('click', () => $('#net').close());
$('#export-svg').addEventListener('click', exportSvg);

const exSel = $('#examples');
exSel.innerHTML = '<option value="">Примеры задач…</option>' + EXAMPLES.map((ex, i) => `<option value="${i}">${esc(ex.title)}</option>`).join('');
exSel.addEventListener('change', () => {
  const ex = EXAMPLES[+exSel.value];
  exSel.value = '';
  if (!ex) return;
  replaceState({ ...freshState(ex), opts: state.opts });
  if (ex.steps) { ui.steps = { id: ex.steps, k: 0 }; refresh(); }
});

$('#save-file').addEventListener('click', () => download('задача.facets.json', JSON.stringify({ spec: state.spec, items: state.items, seq: state.seq, conds: state.conds }, null, 2), 'application/json'));
$('#open-file').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let next = null;
  try { next = valid(JSON.parse(await file.text())); } catch { /* не JSON */ }
  if (!next) return toast('Не удалось прочитать файл: это не сохранённая задача');
  replaceState({ ...next, opts: state.opts });
});
$('#copy-link').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#s=${encodeState()}`;
  try { await navigator.clipboard.writeText(url); toast('Ссылка на задачу скопирована'); } catch { window.prompt('Скопируйте ссылку на задачу:', url); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.fit) { ui.fit = null; renderFit(); return; }
  if (e.key === 'Escape' && ui.tool) cancelTool();
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); undo(); }
  if (ui.steps && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const n = traceOf(ui.steps.id).length;
    ui.steps.k = Math.max(0, Math.min(n - 1, ui.steps.k + (e.key === 'ArrowRight' ? 1 : -1)));
    refresh();
  }
});

syncViewControls();
refresh(true);
