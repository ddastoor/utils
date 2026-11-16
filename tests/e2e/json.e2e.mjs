// JSON Formatter (#/json): indent 2/4/tab, recursive key sort, minify, error line/column for every V8 error kind
// (incl. "Unexpected token", which carries no position), big integers and long decimals kept exactly, Unicode,
// a 5 MB document, download.
import { readFileSync } from 'node:fs';
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok, download } = ctx;
  const page = await newPage(); await page.goto(`${base}#/json`);
  const inp = page.getByLabel('JSON'), out = page.locator('.card').filter({ hasText: 'Output' }).locator('textarea');
  const status = async () => (await page.locator('.note').first().textContent()).trim();
  const set = async (s) => { await inp.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, s); };
  await inp.waitFor();
  const D = '{"name":"SuperTools","tools":173,"tags":["private","wasm"],"nested":{"b":2,"a":1}}';
  ok(await out.inputValue() === JSON.stringify(JSON.parse(D), null, 2) && /^Valid JSON/.test(await status()), 'default formatted with 2 spaces, "Valid JSON"');
  await page.getByRole('radio', { name: '4 spaces', exact: true }).click(); ok(await out.inputValue() === JSON.stringify(JSON.parse(D), null, 4), '4 spaces');
  await page.getByRole('radio', { name: 'Tabs', exact: true }).click(); ok(await out.inputValue() === JSON.stringify(JSON.parse(D), null, '\t'), 'tabs');
  await page.getByRole('radio', { name: '2 spaces', exact: true }).click();
  await page.locator('label.switch').filter({ hasText: 'Sort keys' }).click();
  ok(await out.inputValue() === JSON.stringify({ name: 'SuperTools', nested: { a: 1, b: 2 }, tags: ['private', 'wasm'], tools: 173 }, ['name', 'nested', 'a', 'b', 'tags', 'tools'], 2), 'keys sorted recursively, arrays keep their order');
  await page.locator('label.switch').filter({ hasText: 'Sort keys' }).click();
  await page.getByRole('button', { name: 'Minify' }).click(); ok(await out.inputValue() === JSON.stringify(JSON.parse(D)), 'minify');
  for (const [src, line, col, what] of [['{"a": 1,\n "b": }', 2, 7, /Unexpected token '}'/], ['{"a":1,}', 1, 8, /Expected double-quoted property name/], ['[1, 2', 1, 6, /Unexpected end|Expected ','/], ["{'a':1}", 1, 2, /property name/], ['{"a":1} x', 1, 9, /non-whitespace/], ['{\n  "list": [1, 2, 3,]\n}', 2, 20, /Unexpected token ']'/], ['{"a": tru}', 1, 10, /Unexpected token '}'/]]) {
    await set(src); const s = await status();
    ok(what.test(s) && s.endsWith(`line ${line}, column ${col}`) && !/is not valid JSON/.test(s), `${JSON.stringify(src)} → ${s}`);
  }
  await set('{"id": 12345678901234567890, "price": 0.1000000000000000055511151231257827, "n": -0, "e": 1.5e300, "list": [9007199254740993]}');
  const o = await out.inputValue();
  ok(o.includes('12345678901234567890') && o.includes('0.1000000000000000055511151231257827') && o.includes('9007199254740993') && o.includes('1.5e300'), 'numbers kept exactly as written (no rounding of big integers or long decimals)');
  await page.locator('label.switch').filter({ hasText: 'Sort keys' }).click();
  ok((await out.inputValue()).indexOf('"e"') < (await out.inputValue()).indexOf('"id"') && (await out.inputValue()).includes('12345678901234567890'), 'sorting keeps exact numbers');
  await page.locator('label.switch').filter({ hasText: 'Sort keys' }).click();
  await set('{"text":"नमस्ते \\u00e9 😀","esc":"line\\nbreak \\"quoted\\""}');
  ok(JSON.parse(await out.inputValue()).text === 'नमस्ते é 😀' && JSON.parse(await out.inputValue()).esc === 'line\nbreak "quoted"', 'Unicode and escapes preserved');
  const big = JSON.stringify({ rows: Array.from({ length: 60000 }, (_, i) => ({ id: i, name: `item ${i}`, ok: i % 2 === 0, v: i / 7 })) });
  const t0 = Date.now(); await set(big);
  ok(/^Valid JSON/.test(await status()) && JSON.parse(await out.inputValue()).rows.length === 60000, `${(big.length / 1e6).toFixed(1)} MB formatted in ${Date.now() - t0} ms`);
  await set('[1,2]');
  const f = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(/data\.json$/.test(f) && JSON.parse(readFileSync(f, 'utf8')).length === 2, 'download data.json');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'json');
};
