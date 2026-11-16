// YAML ⇄ JSON ⇄ TOML (#/yaml, PC only): conversions checked against Python — PyYAML-free: YAML output is re-read by our
// own converter and the JSON compared; JSON is compared with Python's json; TOML output is parsed by Python's tomllib;
// anchors/merge keys, multi-document YAML, errors with line numbers, file type detection, swap, download, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download } = ctx;
  const page = await newPage(); await page.goto(`${base}#/yaml`);
  const src = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1); await page.waitForFunction(() => document.querySelectorAll('textarea')[1]?.value.length > 0);
  const radio = (grp, name) => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${grp}$`) }) }).getByRole('radio', { name, exact: true }).click();
  let j = JSON.parse(await out.inputValue());
  ok(j.kind === 'Deployment' && j.spec.replicas === 3 && canon(j.spec.selector.matchLabels) === canon({ app: 'chai', tier: 'web' }) && j.spec.template.spec.containers[0].env[0].value === 'Pune', 'sample Kubernetes YAML → JSON (alias *labels expanded)');
  const conv = async (text, from, to) => { await radio('From', from); await radio('To', to); await src.fill(text); await page.waitForTimeout(250); return out.inputValue(); };
  const data = { shop: 'Chai Point', open: true, rating: 4.5, since: 2019, owner: { name: 'Asha Rao', city: 'Pune' }, menu: [{ item: 'Masala chai', price: 20 }, { item: 'Samosa', price: 15, veg: true }], tags: ['tea', 'snacks'] };
  const t = await conv(JSON.stringify(data), 'JSON', 'TOML');
  const py = JSON.parse(execFileSync('python3', ['-c', 'import tomllib,sys,json; print(json.dumps(tomllib.loads(sys.stdin.read())))'], { input: t }).toString());
  ok(canon(py) === canon(data), 'JSON → TOML read back by Python tomllib = the same data');
  const y = await conv(JSON.stringify(data), 'JSON', 'YAML'); ok(/^shop: Chai Point\nopen: true\n/.test(y) && y.includes('- item: Masala chai'), 'JSON → YAML');
  j = JSON.parse(await conv(y, 'YAML', 'JSON')); ok(canon(j) === canon(data), 'YAML → JSON round trip');
  j = JSON.parse(await conv(t, 'TOML', 'JSON')); ok(canon(j) === canon(data), 'TOML → JSON round trip');
  ok(JSON.parse(execFileSync('python3', ['-c', 'import json,sys; print(json.dumps(json.loads(sys.stdin.read())))'], { input: await out.inputValue() }).toString()).shop === 'Chai Point', 'JSON output read by Python json');
  j = JSON.parse(await conv('defaults: &d\n  retries: 3\n  timeout: 30\nprod:\n  <<: *d\n  timeout: 60\n', 'YAML', 'JSON')); ok(j.prod.retries === 3 && j.prod.timeout === 60, 'merge key << with override');
  await conv('a: 1\n---\na: 2\n', 'YAML', 'JSON'); ok(/2 documents/.test(await page.locator('.note-ok').textContent()) && JSON.parse(await out.inputValue()).length === 2, 'two YAML documents → list, noted');
  await conv('key: [1, 2\nnext: 3\n', 'YAML', 'JSON'); ok(/line \d+/.test(await page.locator('.note-warn').textContent()) && await out.inputValue() === '', `YAML error with its line (${await page.locator('.note-warn').textContent()})`);
  await conv('{"a": null}', 'JSON', 'TOML'); ok(/TOML has no null/.test(await page.locator('.note-warn').textContent()), 'null → TOML explained');
  await conv('{"a": [1, 2]}', 'JSON', 'JSON'); await page.getByRole('radio', { name: 'Minify', exact: true }).click(); ok(await out.inputValue() === '{"a":[1,2]}', 'JSON minify');
  await page.getByRole('radio', { name: '4', exact: true }).click(); ok((await out.inputValue()).includes('\n    "a"'), 'JSON 4-space indent');
  const f = join(tmp, 'config.toml'); writeFileSync(f, '[server]\nport = 8080\nhost = "0.0.0.0"\n');
  await radio('To', 'YAML'); await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForTimeout(300);
  ok(await out.inputValue() === 'server:\n  port: 8080\n  host: 0.0.0.0\n' && await page.locator('.field', { hasText: 'From' }).getByRole('radio', { name: 'TOML' }).getAttribute('aria-checked') === 'true', '.toml file detected and converted to YAML');
  await page.getByRole('button', { name: 'Swap' }).click(); await page.waitForTimeout(250); ok(/^\[server\]\nport = 8080/.test(await out.inputValue()), 'Swap: YAML back to TOML');
  const d = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(/converted\.toml$/.test(d) && readFileSync(d, 'utf8').includes('port = 8080'), 'download .toml');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'yaml');
};
