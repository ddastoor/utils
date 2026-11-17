// JSON Schema (#/jsonschema, PC only), through the page:
//   - the sample's four problems with where / what / which rule; fixing the data makes it valid;
//   - an independent validator as the reference: python-jsonschema's verdicts for schema / data pairs across Draft 4,
//     6, 7, 2019-09 and 2020-12 (tests/fixtures/formats/jsonschema.json) — a spread of them is typed into the page;
//   - formats (checked by hand against the RFCs), exact numbers, ECMA 262 patterns;
//   - "Make a schema from this data": the made schema always accepts the data it was made from;
//   - messages: empty boxes, broken JSON with line and column, a schema that is not valid, unknown "$schema", $ref to
//     another file, more than 200 problems, notes (a key twice, a format that is not checked);
//   - the page: checks a moment after typing and at once with Ctrl+Enter, Copy problems, opening files, the phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { setValue, until, hookClipboard, copied } from './_devdata.mjs';
import { rng, makeDoc } from '../lib/formats-corpus.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const REF = JSON.parse(readFileSync(new URL('../fixtures/formats/jsonschema.json', import.meta.url), 'utf8'));
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/jsonschema`);
  const S = page.getByRole('textbox', { name: 'Schema', exact: true }), D = page.getByRole('textbox', { name: 'Data', exact: true });
  const result = page.locator('.card', { hasText: 'Result' }).last();
  const runs = () => page.evaluate(() => +(document.querySelector('div[data-runs]')?.dataset.runs || 0));
  // everything the Result card shows, read in one go (locators would wait for parts that are not there after an error)
  const read = () => result.evaluate((card) => ({ head: (card.querySelector('.note')?.textContent || '').trim(), rows: [...card.querySelectorAll('.schema-errs tbody tr')].map((e) => [...e.children].map((c) => c.textContent)), draft: [...card.querySelectorAll('.muted')].map((e) => e.textContent).find((x) => x.startsWith('Checked as')) || '', notes: [...card.querySelectorAll('.note-info')].map((e) => e.textContent.trim()) }));
  await until(page, () => +(document.querySelector('div[data-runs]')?.dataset.runs || 0) >= 1, null, 20000);
  /** Put texts in the boxes (undefined = leave), check at once with Ctrl+Enter, give back what the Result card says. */
  const check = async (schema, data) => {
    const before = await runs();
    if (schema !== undefined) await setValue(S, typeof schema === 'string' ? schema : JSON.stringify(schema));
    if (data !== undefined) await setValue(D, typeof data === 'string' ? data : JSON.stringify(data));
    await D.press('Control+Enter');
    await until(page, (n) => +(document.querySelector('div[data-runs]')?.dataset.runs || 0) > n, before);
    const got = await read();
    return { ...got, valid: /^Valid ✓/.test(got.head) };
  };
  const cut = (x) => JSON.stringify(x).slice(0, 110);
  const D7 = 'http://json-schema.org/draft-07/schema#', D4 = 'http://json-schema.org/draft-04/schema#', D2020 = 'https://json-schema.org/draft/2020-12/schema';

  // ---- the sample
  let r = await check();
  ok(r.head === '4 problems' && JSON.stringify(r.rows.map((x) => x[0]).sort()) === JSON.stringify(['(root)', '/age', '/email', '/mobile']), `the sample: 4 problems — bad email, mobile pattern, age under 18, an extra property (${r.head}: ${r.rows.map((x) => x[0]).join(', ')})`);
  ok(r.rows.some((x) => x[0] === '/email' && x[1] === '"asha.example.com" does not have the format "email"' && x[2] === '/properties/email/format') && r.rows.some((x) => x[0] === '(root)' && x[1] === "Additional properties are not allowed ('nickname' was unexpected)") && r.rows.some((x) => x[0] === '/age' && x[1] === '17 is less than the minimum of 18'), 'each row: where (JSON pointer), what is wrong, which rule of the schema');
  ok(r.draft === 'Checked as Draft 2020-12', `the draft used is named (${r.draft})`);
  const sampleSchema = await S.inputValue();
  r = await check(undefined, { name: 'Asha', email: 'asha@example.in', mobile: '9123456789', age: 30, city: 'Pune' });
  ok(r.valid && r.head === 'Valid ✓ — the data matches the schema.' && r.rows.length === 0, 'the corrected data is valid');

  // ---- python-jsonschema's verdicts, through the page
  const spread = REF.filter((c) => !c.invalid).filter((_, i) => i % 9 === 0); let n = 0, pass = 0;
  for (const c of spread) for (const [d, want] of c.cases.slice(0, 3)) {
    n++; const got = await check(c.schema, d);
    if (got.valid === want && (want || got.rows.length > 0)) pass++; else info(`${c.name}: ${d.slice(0, 80)} → page "${got.head}", python-jsonschema says ${want ? 'valid' : 'not valid'} — ${cut(c.schema)}`);
  }
  ok(pass === n && n >= 200, `${pass}/${n} schema / data pairs (Draft 4, 6, 7, 2019-09, 2020-12): the page agrees with python-jsonschema on valid / not valid`);

  // ---- formats, numbers, patterns
  const many = async (schema, datas) => { let s = ''; for (const d of datas) s += (await check(schema, d)).valid ? 'Y' : 'n'; return s; };
  const strs = (schema, values) => many(schema, values.map((v) => JSON.stringify(v)));   // the same for a list of strings (as JSON values)
  ok(await strs({ $schema: D2020, type: 'string', format: 'email' }, ['a@b.co', 'asha.rao+tag@example.in', 'a.b.co', 'a b@c.d', 'ü@b.co']) === 'YYnnn' && await strs({ format: 'idn-email' }, ['आ@उदाहरण.भारत', 'nope']) === 'Yn', 'format email (ASCII) and idn-email (international)');
  ok(await strs({ format: 'date' }, ['2024-02-29', '2026-02-29', '2026-13-01', '2026-1-5']) === 'Ynnn' && await strs({ format: 'date-time' }, ['2026-11-17T10:30:00+05:30', '2026-11-17T23:59:60Z', '2026-11-17 10:30:00Z', '2026-11-17T10:30:00', '2026-11-17T24:00:00Z']) === 'YYnnn', 'formats date and date-time: leap day, leap second, no zone, hour 24');
  ok(await strs({ format: 'uuid' }, ['123e4567-e89b-12d3-a456-426614174000', '123e4567']) === 'Yn' && await strs({ format: 'ipv4' }, ['192.168.1.1', '256.1.1.1', '01.2.3.4']) === 'Ynn' && await strs({ format: 'uri' }, ['https://x.y/z', 'mailto:a@b.co', 'not a uri', '/path']) === 'YYnn', 'formats uuid, ipv4, uri');
  r = await check({ $schema: D7, format: 'uuid' }, '"nope"');
  ok(r.valid && r.notes.includes('Not checked: format "uuid" (part of JSON Schema from Draft 2019-09 on).') && r.draft === 'Checked as Draft 7', `a format the draft does not have is not checked — and the page says so (${r.notes.join(' | ')})`);
  ok(await many('{"multipleOf": 0.01}', ['19.99', '0.07', '1.001', '4.35']) === 'YYnY' && await many('{"multipleOf": 3}', ['9', '1e300', '3e300']) === 'YnY', 'multipleOf is exact: 19.99 is 1999 × 0.01, 1e300 is not a multiple of 3');
  ok(await many('{"type": "integer", "maximum": 9007199254740993}', ['9007199254740993', '9007199254740994']) === 'Yn' && await many('{"const": 12345678901234567890123}', ['12345678901234567890123', '12345678901234567890124']) === 'Yn', 'integers beyond 2^53 are told apart');
  ok(await many({ $schema: D4, type: 'integer' }, ['1', '1.0']) === 'Yn' && await many({ $schema: D7, type: 'integer' }, ['1.0', '1.5']) === 'Yn', '1.0 is an integer from Draft 6 on, not in Draft 4');
  ok(await strs({ pattern: '^\\d+$' }, ['123', '१२३']) === 'Yn' && await strs({ pattern: '^a$' }, ['a', 'a\n']) === 'Yn' && await strs({ pattern: '^(?=.*\\d)(?=.*[a-z]).{6,}$' }, ['abc123', 'abcdef']) === 'Yn' && await strs({ pattern: '^\\p{L}+$' }, ['héllo', 'hello1']) === 'Yn', 'patterns follow JavaScript: \\d is 0-9, $ is the very end, lookahead, \\p{L}');
  r = await check({ $schema: D7, type: 'object', properties: { n: { type: 'number', exclusiveMaximum: 10 } } }, { n: 10 });
  ok(r.head === '1 problem' && r.rows[0][0] === '/n' && r.rows[0][1] === '10 is greater than or equal to the maximum of 10' && r.rows[0][2] === '/properties/n/exclusiveMaximum', `Draft 7 exclusiveMaximum 10 rejects 10 ("1 problem", singular): ${cut(r.rows[0])}`);

  // ---- many problems
  r = await check({ type: 'array', items: { type: 'integer' } }, JSON.stringify(Array(500).fill('x')));
  ok(r.head === '500 problems — the first 200 are listed' && r.rows.length === 200 && r.rows[199][0] === '/199', `500 problems: the first 200 listed, the total given (${r.head})`);
  await hookClipboard(page); await page.getByRole('button', { name: 'Copy problems' }).click(); await until(page, () => window.__copied.length === 1);
  const cp = (await copied(page))[0].split('\n');
  ok(cp.length === 200 && cp[0] === '/0\t"x" is not of type "integer"\t/items/type', `Copy problems: one line per problem, tab separated (${cut(cp[0])})`);
  r = await check(undefined, JSON.stringify(Array(6000).fill('x'))); ok(r.head === 'More than 5,000 problems — the first 200 are listed', `6000 problems (${r.head})`);
  r = await check({ type: 'string' }, { a: 'x'.repeat(5000) }); ok(r.rows[0][1].length < 450 && r.rows[0][1].includes(' … '), 'a message that quotes a huge value is cut in the middle');

  // ---- "Make a schema from this data"
  const make = async (data) => { const before = await runs(); await setValue(D, typeof data === 'string' ? data : JSON.stringify(data)); await page.getByRole('button', { name: 'Make a schema from this data' }).click(); await until(page, (b) => +(document.querySelector('div[data-runs]')?.dataset.runs || 0) > b, before); return { schema: await S.inputValue(), head: (await read()).head }; };
  let m = await make({ id: 7, name: 'Chai', price: 20.5, sizes: ['S', 'M'], added: '2026-11-16', when: '2026-11-16T10:00:00+05:30', maker: { email: 'x@y.in', site: 'https://y.in' } });
  let inf = JSON.parse(m.schema);
  ok(inf.$schema === D2020 && inf.properties.price.type === 'number' && inf.properties.id.type === 'integer' && inf.properties.added.format === 'date' && inf.properties.when.format === 'date-time' && inf.properties.maker.properties.email.format === 'email' && inf.properties.maker.properties.site.format === 'uri' && inf.properties.sizes.items.type === 'string' && /^Valid ✓/.test(m.head), 'made schema: integer / number, date, date-time, email and uri formats, list items; the data passes it');
  m = await make({ badDate: '2026-13-45', notEmail: '@foo.bar', uri: 'http://[bad', note: '2026-11-17T10:30 – meeting', dates: ['2026-01-01', '2026-13-01'] });
  ok(/^Valid ✓/.test(m.head) && !/"format"/.test(m.schema), 'look-alikes (2026-13-45, @foo.bar, a text with a dash where the time zone would be) get no format — the made schema accepts its data');
  const rr = rng(5); pass = 0;
  for (let i = 0; i < 25; i++) { const d = makeDoc(rr); m = await make(d.json); if (/^Valid ✓/.test(m.head)) pass++; else info(`made schema refuses its data: ${d.json.slice(0, 120)} → ${m.head}`); }
  ok(pass === 25, `${pass}/25 random documents are valid against the schema made from them`);
  const kept = await S.inputValue(); await setValue(D, '{"a": '); await page.getByRole('button', { name: 'Make a schema from this data' }).click();
  ok(await until(page, () => [...document.querySelectorAll('.toast')].some((x) => /^Data: The text ends where a value should be/.test(x.textContent))) && await S.inputValue() === kept, 'making a schema from broken JSON says what is wrong and leaves the schema alone');

  // ---- messages
  r = await check('', '1'); ok(r.head === 'Schema: nothing here yet — paste a JSON Schema, or make one from the data', `an empty schema box (${r.head})`);
  r = await check('{}', ' '); ok(r.head === 'Data: nothing here yet — paste the JSON to check', 'an empty data box');
  r = await check('{"type": "object"', '1'); ok(r.head === 'Schema: The text ends inside an object — a } is missing (line 1, column 18)', `broken schema JSON: which box, what, line and column (${r.head})`);
  r = await check('{}', '{"a": 1,\n "b": }'); ok(r.head === 'Data: A value is missing after the colon (line 2, column 7)', `broken data JSON (${r.head})`);
  r = await check('[1]', '1'); ok(r.head === 'Schema: a JSON Schema is an object (or just true / false) — this is a list', 'a schema that is a list');
  r = await check('{"type": "banana"}', '1'); ok(/^The schema itself is not valid at \/type: "banana" is not valid under any of the schemas/.test(r.head), `a schema that breaks the rules: the place is named (${r.head.slice(0, 80)})`);
  r = await check({ $schema: 'http://json-schema.org/draft-03/schema#' }, '1'); ok(/^The "\$schema" of this schema is "http:\/\/json-schema\.org\/draft-03\/schema#" — this tab knows Draft 4, 6, 7, 2019-09 and 2020-12/.test(r.head), 'an unknown "$schema" is explained');
  r = await check({ properties: { a: { $ref: 'https://example.com/address.json' } } }, '{}'); ok(/^A "\$ref" points to another file or web address \(https:\/\/example\.com\/address\.json\)\. This tab fetches nothing/.test(r.head), 'a $ref to another address: nothing is fetched, the message says what to do');
  r = await check({ $ref: '#/$defs/missing' }, '{}'); ok(r.head === 'A "$ref" points to "#/$defs/missing", which does not exist in this schema.', 'a $ref that points to nothing');
  r = await check('{"type":"object","type":"array"}', '{"a":1,"a":2}');
  ok(r.head === '1 problem' && r.notes.length === 2 && /^Schema: the key "type" is there twice/.test(r.notes[0]) && /^Data: the key "a" is there twice/.test(r.notes[1]), `keys written twice are pointed out (${r.notes.join(' | ')})`);
  r = await check('true', '{"anything": 1}'); ok(r.valid, 'the schema true accepts everything');
  r = await check('false', '1'); ok(r.head === '1 problem' && r.rows[0][1] === 'False schema does not allow 1', 'the schema false accepts nothing');
  r = await check({}, '1'); ok(r.draft === 'Checked as Draft 2020-12 (the schema has no "$schema" line, so the newest draft is used)', `no "$schema": the newest draft, said so (${r.draft})`);

  // ---- typing checks by itself; files
  await setValue(S, sampleSchema); await D.fill('{"name": "Asha", "email": "asha@example.in", "mobile": "9123456789"}');
  ok(await until(page, () => /^Valid ✓/.test(document.querySelector('.card .note-ok')?.textContent || '')), 'typing: the data is checked a moment later, without a button');
  const sf = join(tmp, 'schema.json'), df = join(tmp, 'data.json'); writeFileSync(sf, '{"type": "array", "items": {"type": "integer"}, "minItems": 2}'); writeFileSync(df, '[1, "two"]');
  let before = await runs(); await page.locator('.card', { hasText: 'Open schema' }).locator('input[type=file]').setInputFiles(sf); await until(page, (b) => +(document.querySelector('div[data-runs]')?.dataset.runs || 0) > b, before);
  before = await runs(); await page.locator('.card', { hasText: 'Open data' }).locator('input[type=file]').setInputFiles(df); await until(page, (b) => +(document.querySelector('div[data-runs]')?.dataset.runs || 0) > b, before);
  r = await check();
  ok(await S.inputValue() === readFileSync(sf, 'utf8') && await D.inputValue() === '[1, "two"]' && r.head === '1 problem' && r.rows[0][0] === '/1', 'a schema file and a data file are opened and checked');
  const errs = page.errors.filter((e) => !/^console: Error: Data: The text ends where a value should be|FormatError|Data: The text ends/.test(e));   // the broken-data click above: a toast, also logged
  ok(!errs.length, `no page errors ${errs.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'jsonschema');
};
