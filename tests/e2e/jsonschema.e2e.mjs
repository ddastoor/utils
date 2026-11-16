// JSON Schema (#/jsonschema, PC only): the sample's four problems are all reported with their paths; results agree with
// Python's jsonschema package when it is installed (valid / invalid for a set of documents); fixing the data makes it
// valid; "make a schema from this data" produces a schema the data passes; draft-07 schema; invalid schema / JSON
// messages; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
export default async (ctx) => {
  const { base, page: newPage, ok, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/jsonschema`);
  const [S, D] = [page.locator('textarea').nth(0), page.locator('textarea').nth(1)]; await page.waitForFunction(() => document.querySelector('.note-err, .note-ok'), null, { timeout: 15000 });
  const errs = () => page.$$eval('.schema-errs tbody tr', (r) => r.map((e) => e.children[0].textContent));
  let p = await errs();
  ok(/4 problems/.test(await page.locator('.note-err').textContent()) && ['/email', '/mobile', '/age', '(root)'].every((x) => p.includes(x)), `sample: 4 problems (bad email, mobile pattern, age < 18, extra property) (${p.join(', ')})`);
  const setD = async (d) => { await D.fill(JSON.stringify(d)); await page.waitForTimeout(400); };
  await setD({ name: 'Asha', email: 'asha@example.in', mobile: '9123456789', age: 30, city: 'Pune' }); ok(/Valid ✓/.test(await page.locator('.note-ok').textContent()), 'fixed data is valid');
  let pyOk = true; try { execFileSync('python3', ['-c', 'import jsonschema']); } catch { pyOk = false; }
  if (!pyOk) { try { execFileSync('python3', ['-m', 'pip', 'install', '--user', '-q', 'jsonschema']); pyOk = true; } catch { info('python jsonschema not available — cross-check skipped'); } }
  if (pyOk) {
    const schema = await S.inputValue();
    const docs = [{ name: 'Asha', email: 'a@b.co', mobile: '9876543210' }, { name: 'A', email: 'a@b.co', mobile: '9876543210' }, { name: 'Ravi', mobile: '9876543210' }, { name: 'Ravi', email: 'r@x.in', mobile: '98765' }, { name: 'Ravi', email: 'r@x.in', mobile: '9876543210', city: 'Goa' }, { name: 'Ravi', email: 'r@x.in', mobile: '9876543210', age: 18.0 }, { name: 'Ravi', email: 'r@x.in', mobile: '9876543210', extra: true }, [], 'text'];
    const pyRes = JSON.parse(execFileSync('python3', ['-c', 'import json,sys,jsonschema; s=json.loads(sys.argv[1]); v=jsonschema.Draft202012Validator(s); print(json.dumps([len(list(v.iter_errors(d))) for d in json.loads(sys.argv[2])]))', schema, JSON.stringify(docs)]).toString());
    const mine = []; for (const d of docs) { await setD(d); mine.push((await page.locator('.note-ok').count()) ? 0 : +(/(\d+) problem/.exec(await page.locator('.note-err').textContent())[1])); }
    ok(JSON.stringify(mine.map((x) => x === 0)) === JSON.stringify(pyRes.map((x) => x === 0)) && JSON.stringify(mine) === JSON.stringify(pyRes), `valid/invalid and error counts = Python jsonschema for ${docs.length} documents (${mine} vs ${pyRes})`);
  }
  await setD({ id: 7, name: 'Chai', price: 20.5, sizes: ['S', 'M'], added: '2026-11-16', maker: { email: 'x@y.in' } });
  await page.getByRole('button', { name: 'Make a schema from this data' }).click(); await page.waitForTimeout(500);
  const inf = JSON.parse(await S.inputValue());
  ok(inf.properties.price.type === 'number' && inf.properties.id.type === 'integer' && inf.properties.added.format === 'date' && inf.properties.maker.properties.email.format === 'email' && /Valid ✓/.test(await page.locator('.note-ok').textContent()), 'inferred schema: integer/number, date and email formats; the data passes it');
  await S.fill(JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { n: { type: 'number', exclusiveMaximum: 10 } } })); await setD({ n: 10 });
  ok(/1 problem/.test(await page.locator('.note-err').textContent()) && /draft-07/.test(await page.locator('.muted', { hasText: 'Draft' }).textContent()), 'draft-07 schema: exclusiveMaximum 10 rejects 10');
  await S.fill('{"type": "banana"}'); await page.waitForTimeout(400); ok(/schema itself is invalid/.test(await page.locator('.note-warn').textContent()), 'invalid schema → message');
  await S.fill('{"type": "object"'); await page.waitForTimeout(400); ok(/Schema: .*line 1/.test(await page.locator('.note-warn').textContent()), 'broken schema JSON → line');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'jsonschema');
};
