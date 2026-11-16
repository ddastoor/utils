// Mock Data Generator (#/mockdata, PC only): every field type's format (email, +91 mobile 6–9xxxx, PIN matching the city,
// PAN AAAPA9999A, GSTIN with a checksum verified by the official mod-36 algorithm written here, IFSC, UUID v4, dates and
// numbers inside the ranges, list picks), 1,000 rows, JSON / NDJSON / CSV (read by Python csv) / SQL (run by SQLite),
// adding/removing fields, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
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
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'mockdata');
};
