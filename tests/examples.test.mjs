// Каждый готовый пример из выпадающего списка должен строиться без ошибок
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/ui/examples.js';
import { buildSolid } from '../src/geom/solids.js';
import { evaluate } from '../src/geom/construct.js';
import { evaluateRound } from '../src/geom/round.js';
import { solveConds, condsStatus, buildSpec } from '../src/geom/fit.js';

for (const ex of EXAMPLES) {
  test(`пример: ${ex.title}`, () => {
    let spec = ex.state.spec;
    const items = ex.state.items, conds = ex.state.conds || [];
    if (conds.length) {
      const r = solveConds(spec, items, conds);
      assert.equal(r.error, undefined, r.error);
      spec = r.spec;
      assert.ok(condsStatus(spec, items, conds).every(Boolean), 'не все условия выполнены');
    }
    const S = buildSolid(buildSpec(spec, conds));
    const ctx = (S.round ? evaluateRound : evaluate)(S, items);
    for (const it of items) {
      const res = ctx.results.get(it.id);
      assert.ok(res, `нет результата для ${it.id}`);
      assert.equal(res.error, undefined, `${it.id} (${it.kind}): ${res.error}`);
    }
    if (ex.steps) assert.ok(items.some((it) => it.id === ex.steps), 'шаги ссылаются на несуществующее построение');
  });
}
