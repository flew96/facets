import test from 'node:test';
import assert from 'node:assert/strict';
import { validState, encodeState, decodeState, packState, VERSION } from '../src/ui/state.js';
import { issueUrl, publicLink, SITE } from '../src/ui/feedback.js';
import { cutSolid } from '../src/ui/cut.js';
import { EXAMPLES } from '../src/ui/examples.js';

const ex = (i) => structuredClone(EXAMPLES[i].state);

test('ссылка на задачу: кодирование и раскодирование без потерь', () => {
  for (const e of EXAMPLES) {
    const s = validState(structuredClone(e.state)).state;
    const back = decodeState(encodeState(s));
    assert.equal(back.dropped, 0);
    assert.deepEqual(packState(back.state), packState(s));
  }
  // кириллица и спецсимволы в именах переживают base64
  const s = validState({ ...ex(0), spec: { ...ex(0).spec, names: ['А', 'Б₁'] } }).state;
  assert.deepEqual(decodeState(encodeState(s)).state.spec.names, ['А', 'Б₁']);
});

test('не задача — null', () => {
  for (const bad of [null, 1, 'x', [], {}, { spec: { kind: 'nope', p: {} }, items: [] }, { spec: { kind: 'cube' }, items: [] }, { spec: { kind: 'cube', p: {} }, items: {} }]) {
    assert.equal(validState(bad), null);
  }
  assert.equal(decodeState('###'), null);
  assert.equal(decodeState('bm90IGpzb24'), null); // «not json»
});

test('дополняются значения по умолчанию и версия', () => {
  const { state } = validState({ spec: ex(0).spec, items: [] });
  assert.equal(state.version, VERSION);
  assert.equal(state.seq, 1000);
  assert.deepEqual(state.conds, []);
  assert.equal(state.opts.hidden, true);
});

test('испорченные построения выбрасываются вместе с зависимыми', () => {
  const s = ex(0); // K, L, M и сечение KLM
  s.items[1] = { id: 'i2', kind: 'point' }; // у точки нет имени и определения
  s.items.push({ id: 'i9', kind: 'dist', refs: ['nope:K', 'v0'] }, { id: 'i1', kind: 'dist', refs: ['v0', 'v1'] }, 'мусор');
  const r = validState(s);
  assert.deepEqual(r.state.items.map((x) => x.id), ['i1', 'i3']);
  assert.equal(r.dropped, 5); // L, сечение через L, ссылка в никуда, повтор id, строка
});

test('условия на выброшенные построения отбрасываются', () => {
  const s = ex(EXAMPLES.findIndex((e) => e.state.conds?.length));
  const n = s.conds.length;
  s.items = s.items.filter((it) => it.id !== s.conds[0].target.id);
  s.conds.push({ junk: true });
  const r = validState(s);
  assert.equal(r.state.conds.length, n - 1);
  assert.equal(r.dropped, 2);
});

test('сообщение об ошибке в GitHub', () => {
  const u = new URL(issueUrl({ bug: true, summary: 'Сечение пропало', details: '', figure: 'Куб', items: 3, conds: 0, link: 'https://x/#s=abc' }));
  assert.equal(u.searchParams.get('title'), '[Баг] Сечение пропало');
  assert.equal(u.searchParams.get('labels'), 'bug');
  assert.match(u.searchParams.get('body'), /Фигура: Куб; построений: 3; условий: 0\.\n\[Открыть задачу\]\(https:\/\/x\/#s=abc\)/);
  const long = new URL(issueUrl({ bug: false, summary: 'Идея', details: 'текст', figure: 'Куб', items: 0, conds: 0, link: 'x'.repeat(7000) }));
  assert.equal(long.searchParams.get('labels'), 'enhancement');
  assert.match(long.searchParams.get('body'), /слишком длинная/);
  assert.doesNotMatch(new URL(issueUrl({ bug: true, summary: 's', figure: 'f', items: 0, conds: 0 })).searchParams.get('body'), /задачу/);
  assert.equal(publicLink('http://localhost:5173', '/', 'q'), `${SITE}#s=q`);
  assert.equal(publicLink('https://a.github.io', '/facets/', 'q'), 'https://a.github.io/facets/#s=q');
});

test('отсечь часть фигуры: половина единичного куба', () => {
  const V = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const P = F.map(() => ({ n: [0, 0, 1], d: 0 }));
  const part = cutSolid(V, F, P, [1, 0, 0], 0.5, 1); // x ≥ 1/2
  assert.equal(part.verts.length, 8);
  assert.equal(part.faces.length, 6); // 5 граней куба + срез
  assert.equal(part.edges.length, 12);
  assert.ok(part.verts.every((p) => p[0] >= 0.5 - 1e-12));
  assert.ok(part.inside([0.9, 0.5, 0.5]) && !part.inside([0.1, 0.5, 0.5]));
});
