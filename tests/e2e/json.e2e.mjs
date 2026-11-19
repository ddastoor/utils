// JSON Formatter (#/json, PC only): our lossless Rust formatter (devcore-json) — indent 2 / 4 / tab, minify (and it
// stays minified while typing), recursive key sort, member order / duplicate keys / number spelling kept exactly,
// duplicate-key warning, a message with line and column for every kind of mistake and "Show it" selecting the spot,
// no stale output under an error, BOM, deep nesting, a 5 MB document, download, engine released on leave.
import { readFileSync } from 'node:fs';
import { pcOnlyOnPhone } from './_pconly.mjs';
import { setValue, until, rng } from './_devdata.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok, download } = ctx;
  const page = await newPage(); await page.goto(`${base}#/json`);
  const inp = page.getByLabel('JSON'), out = page.locator('.card').filter({ hasText: 'Output' }).locator('textarea');
  const status = async () => (await page.locator('.note').allTextContents()).map((x) => x.trim()).join(' | ');
  const set = (s) => setValue(inp, s);
  await inp.waitFor();
  const D = '{"name":"SuperTools","tools":173,"tags":["private","wasm"],"nested":{"b":2,"a":1}}';
  ok(await until(page, (w) => document.querySelectorAll('textarea')[1]?.value === w, JSON.stringify(JSON.parse(D), null, 2)), 'default formatted with 2 spaces');
  ok(/^Valid JSON · 127 characters · 6 keys in 2 objects, 1 array, 2 levels deep$/.test(await status()), `status counts characters, keys, objects, arrays, depth (${await status()})`);
  ok(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /devcore-json-[\w-]+\.wasm/.test(r.name))), 'the formatter engine is devcore-json.wasm');
  await page.getByRole('radio', { name: '4 spaces', exact: true }).click(); ok(await out.inputValue() === JSON.stringify(JSON.parse(D), null, 4), '4 spaces');
  await page.getByRole('radio', { name: 'Tabs', exact: true }).click(); ok(await out.inputValue() === JSON.stringify(JSON.parse(D), null, '\t'), 'tabs');
  await page.getByRole('radio', { name: '2 spaces', exact: true }).click();
  await page.locator('label.switch').filter({ hasText: 'Sort keys' }).click();
  ok(await out.inputValue() === JSON.stringify({ name: 'SuperTools', nested: { a: 1, b: 2 }, tags: ['private', 'wasm'], tools: 173 }, ['name', 'nested', 'a', 'b', 'tags', 'tools'], 2), 'keys sorted recursively, arrays keep their order');
  await page.locator('label.switch').filter({ hasText: 'Sort keys' }).click();
  await page.getByRole('button', { name: 'Minify' }).click(); ok(await out.inputValue() === JSON.stringify(JSON.parse(D)), 'minify');
  await set('{ "a" : [ 1 , 2 ] }'); ok(await out.inputValue() === '{"a":[1,2]}', 'typing after Minify keeps the output minified');
  await page.getByRole('button', { name: 'Format' }).click(); ok(await out.inputValue() === '{\n  "a": [\n    1,\n    2\n  ]\n}', 'Format goes back to the chosen indent');
  // nothing but white space changes
  const odd = '{"b":1.0,"a":1e5,"big":12345678901234567890,"10":1,"2":2,"a":3,"neg":-0,"exp":1E+2,"long":0.1000000000000000055511151231257827,"s":"\\u0041\\/"}';
  await set(odd);
  ok((await out.inputValue()).split('\n').map((l) => l.trim()).join('') === odd.replace(/":/g, '": '), 'member order ("10" and "2" stay where they are), both "a" members, and the spelling of 1.0, 1e5, -0, 1E+2, a 20-digit integer, a 34-digit decimal and \\u0041 are kept');
  ok(/1 duplicate key: "a" \(line 1\)\. They are kept as written, but most programs read only the last one/.test(await status()), `duplicate keys are pointed out (${(await status()).slice(-120)})`);
  await page.locator('label.switch').filter({ hasText: 'Sort keys' }).click();
  ok((await out.inputValue()).split('\n').map((l) => l.trim().split(':')[0]).slice(1, -1).join() === '"10","2","a","a","b","big","exp","long","neg","s"' && (await out.inputValue()).includes('12345678901234567890'), 'sorting keeps exact numbers and both duplicates');
  await page.locator('label.switch').filter({ hasText: 'Sort keys' }).click();
  await set('{"text":"नमस्ते \\u00e9 😀","esc":"line\\nbreak \\"quoted\\""}');
  ok(JSON.parse(await out.inputValue()).text === 'नमस्ते é 😀' && (await out.inputValue()).includes('\\u00e9') && JSON.parse(await out.inputValue()).esc === 'line\nbreak "quoted"', 'Unicode and escapes preserved as typed');
  // mistakes: what, where, and the spot can be selected
  const E = [['{"a": 1,\n "b": }', /A value is missing after the colon/, 2, 7], ['{"a":1,}', /Trailing comma before }/, 1, 8], ['[1, 2', /ends inside an array — a ] is missing/, 1, 6], ["{'a':1}", /double quotes \("\), not single quotes/, 1, 2], ['{"a":1} x', /Unexpected “x” after the end/, 1, 9],
    ['{a:1}', /Object keys must be in double quotes/, 1, 2], ['[1 2]', /is a comma missing/, 1, 4], ['{"a":tru}', /“tru” is not a JSON value/, 1, 6], ['[undefined]', /JSON has no undefined/, 1, 2], ['[01]', /leading zeros/, 1, 2], ['["a\nb"]', /line break inside a string/, 1, 4],
    ['// note\n[1]', /Comments are not allowed/, 1, 1], ['{"a":1}{"b":2}', /several values need to be inside one array, or use JSON Lines/, 1, 8], ['', /Nothing to format/, 1, 1], ['{"नाम": "😀", "b": ]', /Unexpected “]”/, 1, 19], ['[1,\n\n\n  2,,3]', /Two commas in a row/, 4, 5]];
  for (const [src, what, line, col] of E) {
    await set(src); const s = await status();
    ok(what.test(s) && s.includes(`— line ${line}, column ${col}`) && await out.inputValue() === '' && await page.locator('.note-err').count() === 1, `${JSON.stringify(src)} → ${s}`);
  }
  await set('{"a":1,\n"b":[1,2,}'); await page.getByRole('button', { name: 'Show it' }).click();
  ok(JSON.stringify(await inp.evaluate((e) => [e.selectionStart, e.selectionEnd, document.activeElement === e])) === '[17,18,true]', '"Show it" selects the character where the problem is');
  await set('{"emoji":"😀😀", x}'); await page.getByRole('button', { name: 'Show it' }).click();
  ok(await inp.evaluate((e) => e.value.slice(e.selectionStart, e.selectionEnd)) === 'x', 'the selection is right after characters outside the Basic Multilingual Plane');
  await set('\ufeff{"a":1}'); ok(await out.inputValue() === '{\n  "a": 1\n}' && /^Valid JSON/.test(await status()), 'a byte-order mark in front is ignored');
  await set('['.repeat(600) + ']'.repeat(600)); ok(/Nested deeper than 512 levels/.test(await status()), 'very deep nesting: a message, no crash');
  await set('['.repeat(300) + ']'.repeat(300)); ok(/^Valid JSON · .* 300 arrays, 299 levels deep/.test(await status()), '300 levels are formatted');
  await set('{"a":"\ud800"}'); ok(/^Valid JSON/.test(await status()) && !page.errors.length, 'half a surrogate pair in a string does not break the tab');
  // agreement with the browser's own parser on random documents
  const r = rng(77), pick = (a) => a[Math.floor(r() * a.length)];
  const doc = (d = 0) => (d > 3 || r() < 0.3 ? pick([null, true, 12, -3.5, 'x', 'नमस्ते', '', 'q"t']) : r() < 0.5 ? Array.from({ length: Math.floor(r() * 4) }, () => doc(d + 1)) : Object.fromEntries(Array.from({ length: Math.floor(r() * 4) }, () => [pick(['name', 'id', 'z', 'k e y', 'é']), doc(d + 1)])));
  let same = 0; for (let i = 0; i < 25; i++) { const v = doc(); await set(JSON.stringify(v)); if (await out.inputValue() === JSON.stringify(v, null, 2)) same++; }
  ok(same === 25, `25 random documents format exactly like JSON.stringify(…, 2) (${same})`);
  const big = JSON.stringify({ rows: Array.from({ length: 60000 }, (_, i) => ({ id: i, name: `item ${i}`, ok: i % 2 === 0, v: i / 7 })) });
  const t0 = Date.now(); await set(big);
  ok(/^Valid JSON/.test(await status()) && await out.evaluate((e, w) => e.value === w, JSON.stringify(JSON.parse(big), null, 2)), `${(big.length / 1e6).toFixed(1)} MB formatted in ${Date.now() - t0} ms, equal to JSON.stringify`);
  await set('[1,2]');
  const f = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(/data\.json$/.test(f) && readFileSync(f, 'utf8') === '[\n  1,\n  2\n]', 'download data.json holds the formatted text');
  await set('[1,'); await page.getByRole('button', { name: 'Download' }).click();
  ok(await until(page, () => /Nothing to save/.test(document.querySelector('.toasts')?.textContent || '')), 'Download with broken JSON: a message instead of an empty file');
  ok(!page.errors.filter((e) => !/Nothing to save/.test(e)).length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__supertoolsLive().resources.length === 0), 'the engine is released when the tab is left');
  await pcOnlyOnPhone(ctx, 'json');
};
