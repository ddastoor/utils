// YAML ⇄ JSON ⇄ TOML (#/yaml, PC only), through the page:
//   - texts that OTHER programs wrote (PyYAML, ruamel.yaml, tomli_w, real-world files — tests/fixtures/formats/
//     reference.json) are typed in and must come out as the data they stand for, type for type;
//   - awkward strings and number spellings (tests/lib/formats-corpus.mjs) go JSON → YAML / TOML and back with Swap;
//   - what the page wrote is read by independent parsers when python3 has them (PyYAML = YAML 1.1, ruamel.yaml =
//     YAML 1.2, tomllib);
//   - notes (a key twice, a lone surrogate, keys that become the same), messages with line and column, several
//     documents, numbers that keep their digits, .inf / .nan, dates;
//   - the page itself: empty input, the JSON indent control, Copy / Download / Swap (and their guards), file type
//     detection, download names, the phone note.
import { fileURLToPath } from 'node:url';
import { pcOnlyOnPhone } from './_pconly.mjs';
import { setValue, until, hookClipboard, copied } from './_devdata.mjs';
import { STRINGS, NUMBERS, rng, typedNum, same, makeDoc, typedFromJson } from '../lib/formats-corpus.mjs';
import { spawnSync } from '../lib/child.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const REF = JSON.parse(readFileSync(new URL('../fixtures/formats/reference.json', import.meta.url), 'utf8'));
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/yaml`);
  const src = page.getByRole('textbox', { name: 'Input', exact: true }), out = page.getByRole('textbox', { name: 'Output', exact: true });
  await until(page, () => document.querySelector('textarea[aria-label="Output"]')?.value.length > 0);
  const seg = (grp) => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${grp}$`) }) });
  const radio = (grp, name) => seg(grp).getByRole('radio', { name, exact: true });
  const NAME = { yaml: 'YAML', json: 'JSON', toml: 'TOML' };
  const notes = async (sel = '.card .note') => (await page.locator(sel).allTextContents()).map((x) => x.trim()).join(' | ');
  /** Put a text in, choose the formats, read the output. Choosing a format converts at once (typing waits 150 ms). */
  const conv = async (text, from, to) => {
    await setValue(src, text);
    await radio('To', NAME[to]).click();
    const other = from === 'json' ? 'YAML' : 'JSON'; await radio('From', other).click(); await radio('From', NAME[from]).click();
    return out.inputValue();
  };
  const cut = (x) => JSON.stringify(x).slice(0, 110);

  // ---- the sample
  ok(await out.inputValue() === '{\n  "apiVersion": "apps/v1",\n  "kind": "Deployment",\n  "metadata": {\n    "name": "chai-shop",\n    "labels": {\n      "app": "chai",\n      "tier": "web"\n    }\n  },\n  "spec": {\n    "replicas": 3,\n    "selector": {\n      "matchLabels": {\n        "app": "chai",\n        "tier": "web"\n      }\n    },\n    "template": {\n      "spec": {\n        "containers": [\n          {\n            "name": "web",\n            "image": "chai-shop:1.4.2",\n            "ports": [\n              {\n                "containerPort": 8080\n              }\n            ],\n            "env": [\n              {\n                "name": "CITY",\n                "value": "Pune"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}', 'the sample Kubernetes YAML → JSON (alias *labels expanded, key order kept)');
  ok(await notes() === 'Valid YAML', `status "Valid YAML" (${await notes()})`);

  // ---- texts other programs wrote
  for (const kind of ['yaml', 'toml']) {
    const list = REF[kind].filter((c, i) => i % 5 === 0 || c.by.startsWith('file:')); let pass = 0;
    for (const c of list) {
      const got = await conv(c.text, kind, 'json');
      let typed; try { typed = typedFromJson(got); } catch { typed = undefined; }
      if (got && same(typed, c.typed, kind === 'toml' || !!c.unordered)) pass++; else info(`${kind} by ${c.by}: ${cut(c.text)} → ${cut(got)} (${await notes()})`);
    }
    ok(pass === list.length && list.length >= (kind === 'yaml' ? 55 : 30), `${pass}/${list.length} ${NAME[kind]} texts written by other programs (PyYAML, ruamel.yaml, tomli_w, real files) are read as the data they stand for`);
  }

  // ---- awkward strings, numbers and random documents: out, and back with Swap
  const written = [];   // what the page wrote, for the independent parsers
  const swapBack = async () => { await page.getByRole('button', { name: 'Swap' }).click(); return out.inputValue(); };
  for (const to of ['yaml', 'toml']) {
    const strings = STRINGS.filter((_, i) => i % 5 === (to === 'yaml' ? 0 : 2)); let pass = 0;
    for (const s of strings) {
      const q = JSON.stringify(s), doc = `{"v":${q},${s === 'v' || s === 'l' ? '' : `${q}:1,`}"l":[${q},${q}]}`, typed = { $map: [['v', s], ...(s === 'v' || s === 'l' ? [] : [[s, 1]]), ['l', [s, s]]] };
      const text = await conv(doc, 'json', to), back = text ? await swapBack() : '';
      let got; try { got = typedFromJson(back); } catch { got = undefined; }
      if (text && same(got, typed, to === 'toml')) { pass++; written.push({ id: `${to}s${written.length}`, kind: to, text, typed }); } else info(`string ${cut(s)} → ${NAME[to]} ${cut(text)} → back ${cut(back)} (${await notes()})`);
    }
    ok(pass === strings.length && strings.length >= 55, `${pass}/${strings.length} awkward strings: JSON → ${NAME[to]}, Swap, and the same strings come back (as value, key and list item)`);
  }
  let pass = 0;
  for (const [lit, kind] of NUMBERS) {
    const doc = `{"n":${lit},"l":[${lit}]}`, typed = { $map: [['n', typedNum(lit, kind)], ['l', [typedNum(lit, kind)]]] };
    const same1 = await conv(doc, 'json', 'json') === `{\n  "n": ${lit},\n  "l": [\n    ${lit}\n  ]\n}`;
    const text = await conv(doc, 'json', 'yaml'), back = await swapBack();
    if (same1 && same(typedFromJson(back), typed)) { pass++; written.push({ id: `n${written.length}`, kind: 'yaml', text, typed }); } else info(`number ${lit}: ${cut(text)} → ${cut(back)}`);
  }
  ok(pass === NUMBERS.length, `${pass}/${NUMBERS.length} number spellings: JSON → JSON unchanged (12345678901234567890, 1.10, 1e400, -0), JSON → YAML → JSON the same number`);
  const r = rng(77); pass = 0;
  for (let i = 0; i < 40; i++) {
    const toml = i % 2 === 1, d = makeDoc(r, { toml }), to = toml ? 'toml' : 'yaml';
    const text = await conv(d.json, 'json', to), back = text ? await swapBack() : '';
    let got; try { got = typedFromJson(back); } catch { got = undefined; }
    if (text && same(got, d.typed, toml)) { pass++; written.push({ id: `d${i}`, kind: to, text, typed: d.typed }); } else info(`document ${i} ${cut(d.json)} → ${cut(text)} → ${cut(back)} (${await notes()})`);
  }
  ok(pass === 40, `${pass}/40 random documents: JSON → YAML / TOML, Swap, the same data back`);
  const py = spawnSync('python3', [fileURLToPath(new URL('../lib/formats_check.py', import.meta.url))], { input: JSON.stringify({ cases: written.map(({ id, kind, text }) => ({ id, kind, text })) }), encoding: 'utf8', maxBuffer: 1 << 28 });
  let res = null; try { res = py.status === 0 ? JSON.parse(py.stdout) : null; } catch { /* no python3 */ }
  for (const [lib, name] of [['pyyaml', 'PyYAML (YAML 1.1)'], ['ruamel', 'ruamel.yaml (YAML 1.2)'], ['tomllib', "Python's tomllib"]]) {
    if (!res?.have[lib]) { info(`${name} is not installed here — its check of the page's output is skipped`); continue; }
    let n = 0; const bad = [];
    for (const c of written) { const got = res.results[c.id][lib]; if (got === undefined) continue; n++; if (!same(got, c.typed, lib === 'tomllib')) bad.push(`${cut(c.text)} → ${cut(got)}`); }
    ok(n >= 60 && !bad.length, `${name} reads all ${n} ${lib === 'tomllib' ? 'TOML' : 'YAML'} texts the page wrote as exactly the data that went in${bad.length ? ` — ${bad.length} differ: ${bad.slice(0, 2).join(' ; ')}` : ''}`);
  }

  // ---- what the output looks like
  ok(await conv('{"a":"no","b":"yes","c":"1_000","d":"1:30","e":"2026-01-01","f":"plain text","y":true,"g":1e21,"h":12345678901234567890}', 'json', 'yaml') === "a: 'no'\nb: 'yes'\nc: '1_000'\nd: '1:30'\ne: '2026-01-01'\nf: plain text\n'y': true\ng: 1.0e+21\nh: 12345678901234567890\n", 'JSON → YAML: no / yes / 1_000 / 1:30 / dates quoted, plain text not, numbers exact');
  ok(await conv('{"title":"Shop","tags":["tea","snacks"],"owner":{"name":"Asha Rao","city":"Pune"},"menu":[{"item":"Masala chai","price":20},{"item":"Samosa","price":15.5}]}', 'json', 'toml') === 'title = "Shop"\ntags = ["tea", "snacks"]\n\n[owner]\nname = "Asha Rao"\ncity = "Pune"\n\n[[menu]]\nitem = "Masala chai"\nprice = 20\n\n[[menu]]\nitem = "Samosa"\nprice = 15.5\n', 'JSON → TOML: sections, arrays of tables, short arrays on one line');
  ok(await conv('defaults: &d\n  retries: 3\n  timeout: 30\nprod:\n  <<: *d\n  timeout: 60\n', 'yaml', 'json') === '{\n  "defaults": {\n    "retries": 3,\n    "timeout": 30\n  },\n  "prod": {\n    "retries": 3,\n    "timeout": 60\n  }\n}', 'merge key << with an override');
  ok(await conv('d = 1979-05-27\nt = 17:32:00\nx = inf\n', 'toml', 'yaml') === "d: 1979-05-27\nt: '17:32:00'\nx: .inf\n" && await conv('d = 1979-05-27\nx = nan\n', 'toml', 'toml') === 'd = 1979-05-27\nx = nan\n', 'TOML dates, times, inf and nan go to YAML and back to TOML as what they are');

  // ---- status line, notes and messages
  await conv('a: 1\n---\na: 2\n', 'yaml', 'json'); ok(await notes() === 'Valid YAML · 2 documents (combined into a list)' && await out.inputValue() === '[\n  {\n    "a": 1\n  },\n  {\n    "a": 2\n  }\n]', `two YAML documents → a JSON list, said so (${await notes()})`);
  await conv('a: 1\n---\na: 2\n', 'yaml', 'yaml'); ok(await notes() === 'Valid YAML · 2 documents (separated by ---)' && await out.inputValue() === 'a: 1\n---\na: 2\n', 'two documents → YAML: separated by ---');
  await conv('a: 1\n---\na: 2\n', 'yaml', 'toml'); ok(/^TOML holds one document — this YAML has 2/.test(await notes()) && await out.inputValue() === '', `two documents cannot be one TOML file (${await notes()})`);
  await conv('{"a":1,"b":2,"a":3}', 'json', 'yaml'); ok(await out.inputValue() === 'a: 3\nb: 2\n' && /^Valid JSON \| The key "a" is there twice \(line 1\): the last value is used\.$/.test(await notes()), `a key written twice: a note (${await notes()})`);
  await conv('{"e":"\\ud83d\\ude00","lone":"\\ud800"}', 'json', 'yaml'); ok(await out.inputValue() === 'e: \ud83d\ude00\nlone: \ufffd\n' && /lone surrogate/.test(await notes()), 'a lone surrogate escape: replaced, with a note');
  await conv('1: a\n"1": b\n', 'yaml', 'json'); ok(/Two keys become the same text key "1"/.test(await notes()), `keys 1 and "1" in JSON: a note (${await notes()})`);
  await conv('key: [1, 2\nnext: 3\n', 'yaml', 'json'); ok(await notes() === "YAML: did not find expected ',' or ']' (line 2, column 5)" && await out.inputValue() === '', `YAML error with line and column, output cleared (${await notes()})`);
  await conv('{"a": 1,\n "b": }', 'json', 'yaml'); ok(/^JSON: .* \(line 2, column 7\)$/.test(await notes()), `JSON error with line and column (${await notes()})`);
  await conv('a = 1\nb = \n', 'toml', 'json'); ok(/^TOML: .* \(line 2, column 5\)$/.test(await notes()), `TOML error with line and column (${await notes()})`);
  await conv('{"a": null}', 'json', 'toml'); ok(await notes() === 'TOML has no null — the value at a is null', 'null → TOML explained');
  await conv('{"n": 12345678901234567890}', 'json', 'toml'); ok(/^TOML integers are 64-bit — 12345678901234567890 at n does not fit/.test(await notes()), 'a number TOML cannot hold is refused, not rounded');
  await conv('a: .inf\n', 'yaml', 'json'); ok(await notes() === 'JSON has no Infinity or NaN — the value at a is .inf in the YAML', '.inf → JSON explained');
  await conv('', 'yaml', 'json'); ok(await out.inputValue() === '' && await notes() === 'Nothing to convert yet — type or paste YAML, or open a file.', `empty input: an invitation, not "null" (${await notes()})`);
  await conv('  \n', 'json', 'toml'); ok(await notes() === 'Nothing to convert yet — type or paste JSON, or open a file.', 'white space only: the same');
  // guards: nothing to copy, save or swap
  for (const [name, word] of [['Copy', 'copy'], ['Download', 'save'], ['Swap', 'swap']]) {
    await page.getByRole('button', { name, exact: true }).click();
    ok(await until(page, (w) => [...document.querySelectorAll('.toast')].some((x) => x.textContent === `Nothing to ${w} yet`), word, 3000) && await src.inputValue() === '  \n', `${name} with no output says "Nothing to ${word} yet"${name === 'Swap' ? ' and leaves the input alone' : ''}`);
  }

  // ---- typing converts by itself; the JSON indent control
  await radio('From', 'JSON').click(); await radio('To', 'JSON').click(); await src.fill('{"a": [1, 2]}');
  ok(await until(page, () => document.querySelector('textarea[aria-label="Output"]').value === '{\n  "a": [\n    1,\n    2\n  ]\n}'), 'typing converts after a moment (no button)');
  await page.getByRole('radio', { name: 'Minify', exact: true }).click(); ok(await out.inputValue() === '{"a":[1,2]}', 'JSON minify');
  await page.getByRole('radio', { name: '4', exact: true }).click(); ok(await out.inputValue() === '{\n    "a": [\n        1,\n        2\n    ]\n}', 'JSON 4-space indent');
  ok(await seg('JSON indent').isVisible(), 'the JSON indent control shows for JSON output');
  await radio('To', 'YAML').click(); ok(await seg('JSON indent').isHidden() && await out.inputValue() === 'a:\n- 1\n- 2\n', '… and hides for YAML output');
  await hookClipboard(page); await page.getByRole('button', { name: 'Copy', exact: true }).click(); await until(page, () => window.__copied.length === 1);
  ok((await copied(page))[0] === 'a:\n- 1\n- 2\n' && await page.getByRole('button', { name: 'Copy' }).count() === 1, 'Copy copies the output (one Copy button)');

  // ---- files: the format is taken from the name, or from the text
  const open = async (name, text) => { const f = join(tmp, name); writeFileSync(f, text); await page.locator('.drop input[type=file]').setInputFiles(f); await until(page, (t) => document.querySelector('textarea[aria-label="Input"]').value === t, text); return [await seg('From').getByRole('radio', { checked: true }).textContent(), await out.inputValue()]; };
  let got = await open('config.toml', '[server]\nport = 8080\nhost = "0.0.0.0"\n');
  ok(got[0] === 'TOML' && got[1] === "server:\n  port: 8080\n  host: '0.0.0.0'\n", `.toml file detected and converted to YAML (${cut(got)})`);
  await page.getByRole('button', { name: 'Swap' }).click();
  ok(await out.inputValue() === '[server]\nport = 8080\nhost = "0.0.0.0"\n' && await seg('From').getByRole('radio', { checked: true }).textContent() === 'YAML' && await seg('To').getByRole('radio', { checked: true }).textContent() === 'TOML', 'Swap: the YAML goes back to TOML, From and To change places');
  let d = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(/converted\.toml$/.test(d) && readFileSync(d, 'utf8') === '[server]\nport = 8080\nhost = "0.0.0.0"\n', 'download converted.toml');
  got = await open('compose.yml', 'services:\n  web:\n    ports:\n      - "8080:80"\n'); ok(got[0] === 'YAML' && got[1] === '[services.web]\nports = ["8080:80"]\n', `.yml file → TOML (${cut(got)})`);
  await radio('To', 'YAML').click();
  got = await open('package.json', '{"name":"x","scripts":{"test":"node t.mjs"}}'); ok(got[0] === 'JSON' && got[1] === 'name: x\nscripts:\n  test: node t.mjs\n', '.json file → YAML');
  d = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(/converted\.yaml$/.test(d), 'download converted.yaml');
  await radio('To', 'JSON').click();
  got = await open('noext1', '  [1, 2, {"a": null}]\n'); ok(got[0] === 'JSON', 'no extension, starts with [ → JSON');
  got = await open('noext2', '# settings\ntitle = "x"\n\n[tool.ruff]\nline-length = 100\n'); ok(got[0] === 'TOML' && got[1].includes('"line-length": 100'), 'no extension, key = value and [section] lines → TOML');
  got = await open('noext3', 'name: build\non:\n  push:\n    branches: [main]\n'); ok(got[0] === 'YAML' && got[1].includes('"on": {'), 'no extension, anything else → YAML (the key "on" stays "on")');
  d = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(/converted\.json$/.test(d) && JSON.parse(readFileSync(d, 'utf8')).name === 'build', 'download converted.json');
  const errs = page.errors.filter((e) => !/Nothing to (copy|save|swap) yet/.test(e));   // the three guards above: toasts, also logged
  ok(!errs.length, `no page errors ${errs.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'yaml');
};
