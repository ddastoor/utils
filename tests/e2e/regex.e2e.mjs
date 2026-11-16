// Regex Tester (#/regex): matches + groups table, flags (i, m, s, y, u, d), named groups, lookbehind, Unicode property
// escapes, empty matches (text kept in the highlight), replacement with $1 / $<name>, invalid patterns and flags.
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/regex`);
  const pat = page.getByLabel('Pattern'), flags = page.getByLabel('Flags'), text = page.getByLabel('Test text'), rep = page.getByPlaceholder(/Replacement/);
  const repOut = page.locator('.card').filter({ hasText: 'Replace' }).locator('textarea');
  const hl = page.locator('.regex-hl');
  const set = async (p, f, t) => { await pat.fill(p); await flags.fill(f); if (t !== undefined) await text.fill(t); };
  const marks = () => page.$$eval('.regex-hl mark', (m) => m.map((e) => e.textContent));
  const rows = () => page.$$eval('.tbl tbody tr', (r) => r.map((tr) => [...tr.children].map((td) => td.textContent)));
  await pat.waitFor();
  ok((await marks()).join() === '555-1234,555-9876' && /2 matches/.test(await page.locator('.note').first().textContent()), 'default: 2 phone numbers');
  ok(JSON.stringify(await rows()) === JSON.stringify([['1', '555-1234', '5', '555', '1234'], ['2', '555-9876', '17', '555', '9876']]), 'groups table: match, index, $1, $2');
  await rep.fill('($1) $2'); ok(await repOut.inputValue() === 'Call (555) 1234 or (555) 9876 today.', 'replacement with $1 $2');
  await set('(?<y>\\d{4})-(?<m>\\d{2})', 'g', 'on 2026-11 and 1999-01'); await rep.fill('$<m>/$<y>');
  ok(await repOut.inputValue() === 'on 11/2026 and 01/1999', 'named groups in the replacement');
  await set('cat', 'gi', 'Cat cAt dog CAT'); ok((await marks()).length === 3, 'i flag');
  await set('^\\w+', 'gm', 'one two\nthree four\nfive'); ok((await marks()).join() === 'one,three,five', 'm flag: ^ at each line');
  await set('a.b', 'g', 'a\nb'); ok((await marks()).length === 0, 'dot does not match a new line without s');
  await set('a.b', 'gs', 'a\nb'); ok((await marks()).length === 1, 's flag');
  await set('(?<=₹)\\d+', 'g', 'Rs 10, ₹250 and ₹99'); ok((await marks()).join() === '250,99', 'lookbehind');
  await set('\\p{Script=Devanagari}+', 'gu', 'Hello नमस्ते world दुनिया'); ok((await marks()).join() === 'नमस्ते,दुनिया', 'Unicode property escapes (u flag)');
  await set('x*', 'g', 'abc');
  ok((await hl.textContent()).replace(/∅/g, '') === 'abc' && (await marks()).length === 4, `empty matches: every character kept in the highlight (${await hl.textContent()})`);
  await set('(', 'g', 'abc'); ok(/Invalid regular expression/.test(await page.locator('.note-err').textContent()) && await pat.evaluate((e) => e.classList.contains('bad')), 'invalid pattern reported');
  await set('a', 'gq', 'abc'); ok(/Invalid flags/.test(await page.locator('.note-err').textContent()), 'invalid flag reported');
  await set('\\d', 'g', '1'.repeat(5000)); ok(/^5,000 matches \(first 1,000 highlighted, 200 in the table\)/.test(await page.locator('.note').first().textContent()) && (await rows()).length === 200 && (await marks()).length === 1000, `many matches: all 5,000 counted (was "1000"), 1,000 highlighted, 200 in the table (${await page.locator('.note').first().textContent()})`);
  await set('o', '', 'foo boo'); await rep.fill('0');
  ok(await repOut.inputValue() === 'f0o boo' && (await marks()).length === 4, 'without g: replace only the first; highlight still shows all');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'regex');
};
