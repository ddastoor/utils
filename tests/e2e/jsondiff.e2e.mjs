// JSON Diff (#/jsondiff, PC only): the RFC 6902 patch shown is applied to the left document by an independent applier
// written here and must give the right document, for random nested documents; the change table (path, kind, left,
// right values); equal documents (key order, whitespace); parse errors with line/column; lists aligned by equal
// elements (one removed element = one row), numbers by value (1 = 1.0) and never rounded, duplicate keys, JSON Pointer
// escapes, long values, empty sides, Swap, 3,000 objects, download, files; phone note.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pcOnlyOnPhone } from './_pconly.mjs';
import { setValue } from './_devdata.mjs';
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
  // ---- the engine compares the texts themselves (devcore-jsondiff on the lossless JSON reader)
  const both = async (x, y) => { await setValue(A, x); await setValue(B, y); await page.waitForTimeout(280); return { rows: await page.$$eval('.jd-tbl tbody tr', (r) => r.map((e) => [...e.children].map((c) => c.textContent).join('|'))), cls: await page.$$eval('.jd-tbl tbody tr', (r) => r.map((e) => e.className)), notes: (await page.locator('.card').filter({ hasText: 'Differences' }).first().locator('.note').allTextContents()).join(' | '), patch: await P.inputValue() }; };
  let d = await both('[1,2,3,4]', '[2,3,4]');
  ok(d.rows.join() === '/0|removed|1|' && d.patch.replace(/\s+/g, '') === '[{"op":"remove","path":"/0"}]' && /^1 difference$/.test(d.notes), `removing the first element of a list is one row (it used to be a change of every element): ${d.rows}`);
  d = await both('{"a":[{"id":1,"v":"x"},{"id":2,"v":"y"},{"id":3,"v":"z"}]}', '{"a":[{"id":1,"v":"x"},{"id":3,"v":"Z"},{"id":4,"v":"w"}]}');
  ok(d.rows.join(';') === '/a/1|removed|{"id":2,"v":"y"}|;/a/2/v|changed|"z"|"Z";/a/2|added||{"id":4,"v":"w"}' && d.cls.join() === 'jd-del,jd-chg,jd-add', `a list of objects: removed, changed and added rows, each in its colour (${d.rows.join(';')})`);
  for (const [x, y] of [['{"n":1}', '{"n":1.0}'], ['[100]', '[1e2]'], ['0.1', '0.10'], ['{"s":"\\u0041"}', '{"s":"A"}'], ['12345678901234567890', '12345678901234567890.0'], ['{"a":1,"a":2}', '{"a":2}']]) { d = await both(x, y); ok(/The two documents are equal \(key order and white space are ignored; numbers are compared by value, so 1 = 1\.0\)/.test(d.notes) && d.patch === '[]', `${x} equals ${y}`); }
  ok(/Left has 1 duplicate key \("a" on line 1\): the last value of each is compared/.test(d.notes), 'duplicate keys are pointed out');
  d = await both('{"id":12345678901234567890}', '{"id":12345678901234567891}');
  ok(d.rows.join() === '/id|changed|12345678901234567890|12345678901234567891' && d.patch.includes('"value": 12345678901234567891'), '20-digit numbers that differ in the last digit are seen as different, and not rounded in the table or the patch');
  d = await both('{"a/b":1,"c~d":2,"":3}', '{"a/b":2,"c~d":3,"":4}'); ok(d.rows.map((r) => r.split('|')[0]).join() === '/a~1b,/c~0d,/', 'JSON Pointer escapes in the paths (~1 for /, ~0 for ~)');
  d = await both('1', '"x"'); ok(d.rows.join() === '(whole document)|changed|1|"x"' && JSON.parse(d.patch)[0].path === '', 'different root values: one row for the whole document');
  d = await both(JSON.stringify({ s: 'x'.repeat(1000) }), JSON.stringify({ s: 'y'.repeat(1000) })); ok(/^\/s\|changed\|"x{399}… \(1,002 characters\)\|"y{399}… \(1,002 characters\)$/.test(d.rows[0]) && JSON.parse(d.patch)[0].value.length === 1000, 'a long value is cut in the table (with its length) and whole in the patch');
  d = await both('{"a":1}', ''); ok(/Right is empty — paste JSON on both sides/.test(d.notes) && d.patch === '', 'an empty side is named; no stale patch');
  d = await both('', '{}'); ok(/Left is empty/.test(d.notes), 'the left side too');
  d = await both('{"a":1}', '[1,]'); ok(/Right: Trailing comma before ] — remove the last comma \(line 1, column 4\)/.test(d.notes), 'a mistake on the right: what and where');
  await both('{"x":1,"keep":true}', '{"x":2,"keep":true}'); await page.getByRole('button', { name: 'Swap left and right' }).click(); await page.waitForTimeout(100);
  ok(await A.inputValue() === '{"x":2,"keep":true}' && await B.inputValue() === '{"x":1,"keep":true}' && (await page.$$eval('.jd-tbl tbody tr', (r) => r.map((e) => [...e.children].map((c) => c.textContent).join('|')))).join() === '/x|changed|2|1', 'Swap exchanges the two sides and compares again');
  const big = (m) => JSON.stringify(Array.from({ length: 3000 }, (_, i) => ({ id: i, v: i % m })));
  const t0 = Date.now(); await A.evaluate((e, v) => { e.value = v; }, big(7)); await setValue(B, big(5));
  ok(await page.waitForFunction(() => /2,570 differences — the first 2,000 are listed; the patch below has all of them/.test(document.body.textContent), null, { timeout: 20000 }).then(() => true, () => false) && await page.locator('.jd-tbl tbody tr').count() === 2000, `two lists of 3,000 objects compared in ${Date.now() - t0} ms: 2,570 differences, 2,000 listed`);
  ok(canon(apply(JSON.parse(big(7)), JSON.parse(await P.inputValue()))) === canon(JSON.parse(big(5))), 'and the full patch still turns left into right');
  const f = await ctx.download(page, () => page.getByRole('button', { name: 'Download patch' }).click()); ok(f.endsWith('changes.patch.json') && JSON.parse(readFileSync(f, 'utf8')).length === 2570, 'Download patch saves all 2,570 operations');
  const fa = join(ctx.tmp, 'jd-left.json'), fb = join(ctx.tmp, 'jd-right.json'); writeFileSync(fa, '{"from":"file","n":1}'); writeFileSync(fb, '{"from":"file","n":2,"new":[]}');
  await page.locator('input[type=file]').nth(0).setInputFiles(fa); await page.locator('input[type=file]').nth(1).setInputFiles(fb);
  ok(await page.waitForFunction(() => document.querySelectorAll('.jd-tbl tbody tr').length === 2, null, { timeout: 8000 }).then(() => true, () => false) && await A.inputValue() === '{"from":"file","n":1}', 'two files opened and compared');
  ok((await page.evaluate(() => globalThis.__superutilsLive())).resources.includes('devcore-jsondiff'), 'the engine is devcore-jsondiff.wasm');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await page.waitForFunction(() => globalThis.__superutilsLive().resources.length === 0, null, { timeout: 8000 }).then(() => true, () => false), 'released when the tab is left');
  await pcOnlyOnPhone(ctx, 'jsondiff');
};
