// Mock Data Generator (#/mockdata, PC only): every field type's format (email, +91 mobile 6–9xxxx, PIN matching the city,
// PAN AAAPA9999A, GSTIN with a checksum verified by the official mod-36 algorithm written here, IFSC, UUID v4, dates and
// numbers inside the ranges, list picks), 1,000 rows, JSON / NDJSON / CSV (read by Python csv) / SQL (run by SQLite),
// adding/removing fields; number ranges beyond 32 bits, swapped / unreadable ranges, dates typed day first, id start,
// duplicate / empty / __proto__ field names, quoted SQL names, same rows in every format, downloads, word-count limit.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chiUniform } from './_stats.mjs';
const GST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstOk = (g) => { if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false; let s = 0; for (let i = 0; i < 14; i++) { const v = GST.indexOf(g[i]) * (i % 2 ? 2 : 1); s += Math.floor(v / 36) + (v % 36); } return GST[(36 - (s % 36)) % 36] === g[14]; };
const PIN = { Mumbai: '400', Pune: '411', Delhi: '110', Bengaluru: '560', Chennai: '600', Hyderabad: '500', Kolkata: '700', Ahmedabad: '380', Jaipur: '302', Lucknow: '226', Kochi: '682', Chandigarh: '160', Bhopal: '462', Indore: '452', Patna: '800', Nagpur: '440', Surat: '395', Coimbatore: '641', Guwahati: '781', Bhubaneswar: '751' };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/mockdata`);
  const out = page.locator('textarea'); await page.waitForFunction(() => document.querySelector('textarea')?.value.length > 10);
  let rows = JSON.parse(await out.inputValue());
  ok(rows.length === 10 && rows.map((r) => r.id).join() === '1,2,3,4,5,6,7,8,9,10', '10 rows, ids 1–10');
  ok(rows.every((r) => /^[a-z0-9.]+@(example\.com|example\.in|mail\.test)$/.test(r.email) && /^\+91 [6-9]\d{4} \d{5}$/.test(r.phone) && r.age >= 18 && r.age <= 65 && ['free', 'pro', 'team'].includes(r.plan) && r.joined >= '2020-01-01' && r.joined <= '2026-11-16'), 'default fields: email, +91 mobile, age 18–65, plan from list, date in range');
  // add every type
  const addField = async (type, a = '', b = '') => {
    await page.getByRole('button', { name: 'Add field' }).click(); const i = await page.locator('.mock-row').count();
    await page.locator('.mock-row').nth(i - 1).locator('select').selectOption(type); await page.locator(`input[aria-label="Field ${i} name"]`).fill(type);
    if (a) await page.locator(`input[aria-label="Field ${i} from"]`).fill(a); if (b) await page.locator(`input[aria-label="Field ${i} to"]`).fill(b);
  };
  for (const t of ['uuid', 'state', 'pincode', 'address', 'company', 'bool', 'datetime', 'pan', 'gstin', 'ifsc', 'first', 'last']) await addField(t);
  await addField('float', '10.5', '20'); await addField('words', '4');
  await page.locator('input[type=range]').fill('1000'); await page.locator('input[type=range]').dispatchEvent('input');
  rows = JSON.parse(await out.inputValue());
  ok(rows.length === 1000, '1,000 rows');
  const bad = (f) => rows.filter((r) => !f(r)).length;
  ok(bad((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.uuid)) === 0 && new Set(rows.map((r) => r.uuid)).size === 1000, 'UUID v4, all different');
  ok(bad((r) => r.pincode.startsWith(PIN[r.city]) && /^\d{6}$/.test(r.pincode) && r.address.includes(r.city)) === 0, 'PIN code and address match the row’s city');
  ok(bad((r) => /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/.test(r.pan) && r.pan[4] === r.last[0].toUpperCase()) === 0, 'PAN format (4th letter P for a person, 5th = surname initial)');
  ok(bad((r) => gstOk(r.gstin)) === 0, `GSTIN checksum valid for all 1,000 (official mod-36 algorithm) e.g. ${rows[0].gstin}`);
  ok(bad((r) => /^[A-Z]{4}0\d{6}$/.test(r.ifsc)) === 0 && bad((r) => typeof r.bool === 'boolean') === 0 && bad((r) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(r.datetime)) === 0, 'IFSC format, booleans, ISO date-times');
  ok(bad((r) => r.float >= 10.5 && r.float <= 20 && Math.abs(Math.round(r.float * 100) - r.float * 100) < 1e-6) === 0 && bad((r) => r.words.split(' ').length === 4) === 0, 'decimals in 10.5–20 (2 places), 4 words');
  const trues = rows.filter((r) => r.bool).length; ok(trues > 420 && trues < 580, `booleans balanced (${trues} true of 1,000)`);
  await page.getByRole('radio', { name: 'CSV' }).click(); const csv = await out.inputValue();
  const pyRows = JSON.parse(execFileSync('python3', ['-c', 'import csv,sys,json; print(json.dumps(list(csv.DictReader(sys.stdin))))'], { input: csv }).toString());
  ok(pyRows.length === 1000 && pyRows[5].address === rows[5].address && pyRows[9].company === rows[9].company, 'CSV read back by Python csv (quoted commas in addresses) — same rows as the JSON (switching format keeps the data)');
  await page.getByRole('radio', { name: 'SQL INSERT' }).click(); await page.locator('input[aria-label="SQL table name"]').fill('people'); const sql = await out.inputValue();
  const cols = Object.keys(rows[0]).join(', ');
  const n = execFileSync('python3', ['-c', `import sqlite3,sys; c=sqlite3.connect(":memory:"); c.execute("create table people (${cols})"); c.executescript(sys.stdin.read()); print(c.execute("select count(*), count(distinct uuid) from people").fetchone())`], { input: sql }).toString().trim();
  ok(n === '(1000, 1000)', `SQL INSERTs run in SQLite: ${n}`);
  await page.getByRole('radio', { name: 'NDJSON' }).click(); const nd = (await out.inputValue()).split('\n'); ok(nd.length === 1000 && nd.every((l) => JSON.parse(l).uuid), 'NDJSON: one object per line');
  await page.getByRole('button', { name: 'Remove field 1', exact: true }).click(); await page.getByRole('radio', { name: 'JSON', exact: true }).click(); ok(!('id' in JSON.parse(await out.inputValue())[0]), 'remove a field');
  // ---- ranges, names and formats that used to go wrong (a second page, default fields: id, name, email, phone, city, age, joined, plan)
  const p2 = await newPage(); await p2.goto(`${base}#/mockdata`);
  const data = p2.getByLabel('Data'); await p2.waitForFunction(() => document.querySelector('textarea[aria-label="Data"]')?.value.length > 10);
  const get = async () => JSON.parse(await data.inputValue());
  const warn = async () => (await p2.locator('.card').first().locator('.note-warn').allTextContents()).join(' | ');
  const setF = (i, which, v) => p2.getByLabel(`Field ${i} ${which}`).fill(v);
  await p2.locator('input[type=range]').fill('1000');
  let r = await get(); ok(r.length === 1000 && r.every((x) => x.age >= 18 && x.age <= 65 && Number.isInteger(x.age)) && r.some((x) => x.age === 18) && r.some((x) => x.age === 65), 'whole numbers 18–65: both ends are reached');
  const counts = Array(48).fill(0); r.forEach((x) => counts[x.age - 18]++); const chi = chiUniform(counts); ok(chi.pass, `ages are spread evenly: ${chi.text}`);
  ok(r.every((x) => x.joined >= '2020-01-01' && x.joined <= '2026-11-16' && /^\d{4}-\d\d-\d\d$/.test(x.joined)) && new Set(r.map((x) => x.joined)).size > 700, 'dates inside the range');
  await setF(6, 'from', '4294967296'); await setF(6, 'to', '9007199254740991'); r = await get();
  ok(r.every((x) => Number.isInteger(x.age) && x.age >= 4294967296 && x.age <= 9007199254740991) && new Set(r.map((x) => x.age)).size === 1000 && r.filter((x) => x.age > 4503599627370496).length > 400 && r.filter((x) => x.age % 2).length > 400 && await warn() === '', `a range wider than 32 bits: every value inside it, all different, upper half and odd numbers present (it used to give one value or stay below 2^32) e.g. ${r[0].age}`);
  await setF(6, 'from', '-5'); await setF(6, 'to', '5'); r = await get(); ok(r.every((x) => x.age >= -5 && x.age <= 5) && new Set(r.map((x) => x.age)).size === 11, 'negative to positive: all 11 values appear');
  await setF(6, 'from', '10'); await setF(6, 'to', '1'); r = await get(); ok(r.every((x) => x.age >= 1 && x.age <= 10) && /Field 6 \(age\): “from” is above “to” — they are swapped\./.test(await warn()), 'from above to: swapped, and said so');
  await setF(6, 'from', 'abc'); r = await get(); ok(r.every((x) => x.age === 0 || x.age === 1) && /“abc” is not a number — 0 is used/.test(await warn()), 'a "from" that is not a number: 0 is used, and said so (it used to give NaN → null)');
  await setF(6, 'from', '7'); await setF(6, 'to', ''); r = await get(); ok(r.every((x) => x.age >= 7 && x.age <= 1007) && r.some((x) => x.age > 500), '"from" alone: a thousand above it');
  await setF(7, 'from', '16/11/2026'); await setF(7, 'to', '20-11-2026'); r = await get();
  ok([...new Set(r.map((x) => x.joined))].sort().join() === '2026-11-16,2026-11-17,2026-11-18,2026-11-19,2026-11-20' && await warn() === '', 'dates typed day first (16/11/2026 … 20-11-2026): the five days, both ends included');
  await setF(7, 'from', 'garbage'); r = await get(); ok(r.every((x) => /^\d{4}-\d\d-\d\d$/.test(x.joined)) && /“garbage” is not a date \(write 2026-11-16 or 16\/11\/2026\) — 2020-01-01 is used/.test(await warn()) && !p2.errors.length, 'a date that cannot be read: a message and the default (it used to throw "Invalid time value")');
  await setF(7, 'from', '2026-12-31'); await setF(7, 'to', '2026-01-01'); r = await get(); ok(r.every((x) => x.joined >= '2026-01-01' && x.joined <= '2026-12-31') && /“from” is after “to” — they are swapped/.test(await warn()), 'dates the wrong way round are swapped');
  await setF(7, 'from', '2026-01-01'); await setF(7, 'to', '2026-01-01'); r = await get(); ok(r.every((x) => x.joined === '2026-01-01'), 'a one-day range');
  await setF(1, 'from', '1000'); r = await get(); ok(r[0].id === 1000 && r[999].id === 1999, 'id start 1000');
  await setF(1, 'from', '1.5'); r = await get(); ok(r[0].id === 1 && r[1].id === 2 && /the start “1\.5” is not a whole number — 1 is used/.test(await warn()), 'an id start that is not a whole number: 1, and said so (it used to count 1.5, 2.5, …)');
  await setF(1, 'from', '1');
  await p2.locator('input[type=range]').fill('5');
  const before = await data.inputValue();
  await p2.getByLabel('Field 2 name').fill('id');
  ok(Object.keys((await get())[0]).join() === 'id,id_2,email,phone,city,age,joined,plan' && /Every column needs its own name: id → id_2\./.test(await warn()) && JSON.stringify((await get()).map((x) => x.id_2)) === JSON.stringify(JSON.parse(before).map((x) => x.name)), 'two fields with one name: the second is renamed and said so — and renaming does not make new data');
  await p2.getByLabel('Field 2 name').fill('__proto__'); ok(/"__proto__": "[A-Z]/.test(await data.inputValue()) && (await data.inputValue()).split('"__proto__"').length === 6, 'a field called __proto__ is kept in every row (it used to vanish)');
  await p2.getByLabel('Field 2 name').fill(''); ok(Object.keys((await get())[0])[1] === 'field2' && /\(empty\) → field2/.test(await warn()), 'an empty name becomes field2');
  await p2.getByLabel('Field 2 name').fill('order'); await p2.getByLabel('Field 3 name').fill('e-mail'); await p2.getByLabel('SQL table name').fill('my table');
  await p2.getByRole('radio', { name: 'SQL INSERT' }).click(); let sql2 = await data.inputValue();
  ok(sql2.split('\n')[0].startsWith('INSERT INTO "my table" (id, "order", "e-mail", phone, city, age, joined, plan) VALUES (1, \''), `SQL: a reserved word, a name with a hyphen and a table name with a space are quoted (${sql2.split('\n')[0].slice(0, 90)})`);
  let n2 = execFileSync('python3', ['-c', 'import sqlite3,sys; c=sqlite3.connect(":memory:"); c.execute(\'create table "my table" (id, "order", "e-mail", phone, city, age, joined, plan)\'); c.executescript(sys.stdin.read()); print(c.execute(\'select count(*), min(id), max(id), count("order") from "my table"\').fetchone())'], { input: sql2 }).toString().trim();
  ok(n2 === '(5, 1, 5, 5)', `those INSERTs run in SQLite: ${n2}`);
  await p2.getByLabel('SQL table name').fill('public.customers'); ok((await data.inputValue()).startsWith('INSERT INTO public.customers ('), 'schema.table stays unquoted');
  await p2.getByLabel('SQL table name').fill(''); ok((await data.inputValue()).startsWith('INSERT INTO data ('), 'no table name: "data"');
  await p2.getByLabel('Field 8 from').fill("it's, O'Neil"); sql2 = await data.inputValue(); ok(/'it''s'|'O''Neil'/.test(sql2) && !/[^']'s'/.test(sql2.replace(/''/g, '')), 'apostrophes in values are doubled');
  await p2.getByRole('radio', { name: 'CSV' }).click(); let csv2 = await data.inputValue();
  ok(csv2.split('\n')[0] === 'id,order,e-mail,phone,city,age,joined,plan' && csv2.split('\n').length === 6, 'CSV header + 5 rows');
  await p2.getByRole('radio', { name: 'JSON', exact: true }).click(); const same = await get();
  await p2.getByRole('radio', { name: 'NDJSON' }).click(); ok(JSON.stringify((await data.inputValue()).split('\n').map((l) => JSON.parse(l))) === JSON.stringify(same), 'switching the format shows the same rows');
  for (const [fmt, ext] of [['JSON', 'json'], ['NDJSON', 'ndjson'], ['CSV', 'csv'], ['SQL INSERT', 'sql']]) { await p2.getByRole('radio', { name: fmt, exact: true }).click(); const f = await ctx.download(p2, () => p2.getByRole('button', { name: 'Download' }).click()); ok(f.endsWith(`mock.${ext}`) && readFileSync(f, 'utf8') === await data.inputValue(), `Download saves mock.${ext} with what is shown`); }
  await p2.getByRole('radio', { name: 'JSON', exact: true }).click();
  await p2.getByRole('button', { name: 'Generate again' }).click(); ok(JSON.stringify(await get()) !== JSON.stringify(same) && (await get()).length === 5, 'Generate again makes new rows');
  await p2.getByRole('button', { name: 'Add field' }).click(); await setF(9, 'from', '3000000'); const t0 = Date.now(); r = await get();
  ok(r[0].field9.split(' ').length === 100 && /the number of words is 1–100/.test(await warn()) && Date.now() - t0 < 2000, 'a word count of 3,000,000 is cut to 100 (it used to freeze the tab)');
  await p2.locator('.mock-row select').nth(8).selectOption('float'); ok(await p2.getByLabel('Field 9 from').inputValue() === '' && await warn() === '', 'changing a field\'s type clears the settings of the old type');
  await setF(9, 'from', '0'); await setF(9, 'to', '1000000000'); await p2.locator('input[type=range]').fill('1000'); r = await get();
  ok(r.every((x) => x.field9 >= 0 && x.field9 <= 1e9) && new Set(r.map((x) => x.field9)).size > 990 && r.filter((x) => Math.round(x.field9 * 100) % 100 !== 0).length > 900, 'decimals over a wide range are fine-grained (they used to be multiples of 1,000)');
  await p2.locator('.mock-row select').nth(8).selectOption('pick'); await setF(9, 'from', 'red, green ,blue,,'); r = await get();
  const picks = ['red', 'green', 'blue'].map((c) => r.filter((x) => x.field9 === c).length); ok(picks.reduce((a, b) => a + b) === 1000 && chiUniform(picks).pass, `one of a list: only the three values, evenly (${picks})`);
  await setF(9, 'from', ''); ok((await get()).every((x) => x.field9 === null), 'an empty list gives null');
  await p2.locator('input[type=range]').fill('3');
  for (let i = 9; i >= 1; i--) await p2.getByRole('button', { name: `Remove field ${i}`, exact: true }).click();
  ok(await data.inputValue() === '' && /No fields — add one to make data/.test(await p2.locator('.card').first().textContent()), 'no fields: no output, and a hint');
  await p2.getByRole('button', { name: 'Download' }).click(); ok(await p2.waitForFunction(() => /Nothing to save — add a field first/.test(document.querySelector('.toasts')?.textContent || ''), null, { timeout: 5000 }).then(() => true, () => false), 'Download without fields: a message');
  await p2.getByRole('button', { name: 'Add field' }).click(); ok((await get()).length === 3 && (await get())[0].field1.split(' ').length === 3, 'a field can be added again');
  ok(!p2.errors.filter((e) => !/Nothing to save/.test(e)).length, `no page errors on the second page ${p2.errors.join(' | ')}`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'mockdata');
};
