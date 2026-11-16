// JSON Diff (#/jsondiff, PC only): the RFC 6902 patch shown is applied to the left document by an independent applier
// written here and must give the right document, for random nested documents; the change table (path, kind, left,
// right values); equal documents (key order, whitespace); parse errors with line/column; files; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
const unesc = (s) => s.replace(/~1/g, '/').replace(/~0/g, '~');
function apply(doc, ops) {
  let d = structuredClone(doc);
  for (const o of ops) {
    const parts = o.path.split('/').slice(1).map(unesc); const last = parts.pop();
    if (last === undefined) { d = o.value; continue; }
    const parent = parts.reduce((x, k) => x[k], d);
    if (o.op === 'add') Array.isArray(parent) ? (last === '-' ? parent.push(o.value) : parent.splice(+last, 0, o.value)) : (parent[last] = o.value);
    else if (o.op === 'remove') Array.isArray(parent) ? parent.splice(+last, 1) : delete parent[last];
    else if (o.op === 'replace') parent[last] = o.value;
    else throw new Error(`op ${o.op} not expected`);
  }
  return d;
}
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/jsondiff`);
  const [A, B] = [page.locator('textarea').nth(0), page.locator('textarea').nth(1)], P = page.locator('textarea').nth(2); await A.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('textarea')[2].value.length > 2);
  let rows = await page.$$eval('.jd-tbl tbody tr', (r) => r.map((e) => [...e.children].map((c) => c.textContent)));
  ok(rows.some((r) => r.join('|') === '/name|changed|"Asha"|"Asha Rao"') && rows.some((r) => r.join('|') === '/age|removed|30|') && rows.some((r) => r[0] === '/verified' && r[1] === 'added') && rows.some((r) => r.join('|') === '/address/pin|changed|"411001"|"411004"'), `sample change table (${rows.map((r) => r.join(' ')).join('; ')})`);
  let L = JSON.parse(await A.inputValue()), R = JSON.parse(await B.inputValue()); ok(canon(apply(L, JSON.parse(await P.inputValue()))) === canon(R), 'the patch turns left into right (independent RFC 6902 applier)');
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const mk = (d) => { const t = rnd(d > 2 ? 4 : 6); if (t === 0) return rnd(100); if (t === 1) return ['x', 'y', 'नमस्ते', 'a/b~c'][rnd(4)]; if (t === 2) return [true, false, null][rnd(3)]; if (t === 3) return Array.from({ length: rnd(4) }, () => mk(d + 1)); return Object.fromEntries(Array.from({ length: rnd(5) }, (_, i) => [['k', 'a/b', 'm~n', 'z'][i % 4] + i, mk(d + 1)])); };
  const mut = (v, d = 0) => { if (rnd(5) === 0) return mk(d); if (Array.isArray(v)) { const c = v.map((x) => mut(x, d + 1)); if (rnd(3) === 0) c.push(mk(d + 1)); if (c.length && rnd(3) === 0) c.splice(rnd(c.length), 1); return c; } if (v && typeof v === 'object') { const c = {}; for (const [k, x] of Object.entries(v)) if (rnd(6)) c[k] = mut(x, d + 1); if (rnd(3) === 0) c[`new${rnd(9)}`] = mk(d + 1); return c; } return v; };
  let bad = 0;
  for (let i = 0; i < 25; i++) {
    L = { root: mk(0), list: [mk(1), mk(1)] }; R = mut(L);
    await A.fill(JSON.stringify(L, null, 1)); await B.fill(JSON.stringify(R)); await page.waitForTimeout(260);
    const patch = JSON.parse((await P.inputValue()) || '[]'); if (canon(apply(L, patch)) !== canon(R)) bad++;
  }
  ok(bad === 0, `25 random nested documents: applying the patch gives the right side every time (${bad} failures)`);
  await A.fill('{"b": 2, "a": [1, {"c": 3}]}'); await B.fill('{"a":[1,{"c":3}],"b":2}'); await page.waitForTimeout(300);
  ok(/equal/.test(await page.locator('.note-ok').textContent()), 'same data, different key order and spacing → equal');
  await A.fill('{\n  "a": 1,\n  "b": \n}'); await page.waitForTimeout(300); ok(/Left: .*line 4, column 1/.test(await page.locator('.note-warn').textContent()), `parse error names the side, line and column (${await page.locator('.note-warn').textContent()})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'jsondiff');
};
