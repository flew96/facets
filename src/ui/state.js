// Состояние задачи: проверка того, что пришло из ссылки, файла или localStorage, и упаковка в ссылку.
// Здесь нет обращений к DOM — модуль проверяется тестами в Node.
import { KINDS } from '../geom/solids.js';
import { ownerOf } from '../geom/construct.js';

export const VERSION = 1;
export const DEFAULT_OPTS = { alpha: 0.1, hidden: true, labels: true };

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string' && x.length > 0;

/** Приводит старые форматы к текущему. Сейчас версия одна — точка расширения на будущее. */
export function migrate(s) {
  return { ...s, version: VERSION };
}

/**
 * Построения, которые можно безопасно показать: правильная форма, уникальный id,
 * ссылки только на вершины и на построения, стоящие раньше (иначе — вместе с зависимыми выбрасываем).
 */
function cleanItems(items) {
  const kept = [], ids = new Set();
  let dropped = 0;
  for (const it of items) {
    const ok = isObj(it) && isStr(it.id) && !ids.has(it.id) && isStr(it.kind)
      && (it.refs === undefined || (Array.isArray(it.refs) && it.refs.every(isStr)))
      && (it.def === undefined || isObj(it.def))
      && (it.kind !== 'point' || (isStr(it.name) && isObj(it.def)))
      && (it.refs || []).every((r) => { const o = ownerOf(r); return o === null || ids.has(o); });
    if (ok) { kept.push(it); ids.add(it.id); } else dropped++;
  }
  return { items: kept, ids, dropped };
}

function cleanConds(conds, ids) {
  if (!Array.isArray(conds)) return [];
  return conds.filter((c) => isObj(c) && isStr(c.unknown) && typeof c.text === 'string' && isObj(c.target)
    && (c.target.src === 'figure' ? isStr(c.target.key) : c.target.src === 'item' && ids.has(c.target.id)));
}

/**
 * Проверяет и дополняет состояние задачи. Возвращает null, если это не задача вовсе;
 * испорченные построения и условия отбрасываются, их число — в поле dropped (в состояние не сохраняется).
 */
export function validState(s) {
  if (!isObj(s) || !isObj(s.spec) || !KINDS[s.spec.kind] || !isObj(s.spec.p) || !Array.isArray(s.items)) return null;
  const m = migrate(s);
  const { items, ids, dropped } = cleanItems(m.items);
  const conds = cleanConds(m.conds, ids);
  const lostConds = (Array.isArray(m.conds) ? m.conds.length : 0) - conds.length;
  const seq = Number.isInteger(m.seq) && m.seq > 0 ? m.seq : 1000;
  const opts = isObj(m.opts) ? { ...DEFAULT_OPTS, ...m.opts } : { ...DEFAULT_OPTS };
  const out = { ...m, opts, seq, items, conds };
  return { state: out, dropped: dropped + lostConds };
}

/** То, что попадает в ссылку и в файл задачи */
export const packState = (s) => ({ version: VERSION, spec: s.spec, items: s.items, seq: s.seq, conds: s.conds });

export function encodeState(s) {
  const bytes = new TextEncoder().encode(JSON.stringify(packState(s)));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Раскодирует строку из ссылки (без «#s=»); null — если это не задача */
export function decodeState(code) {
  if (!/^[\w-]+$/.test(code)) return null;
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    return validState(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))));
  } catch { return null; }
}
