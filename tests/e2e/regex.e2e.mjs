// Regex Tester (#/regex, PC only): matching runs in a worker with a time limit — matches + groups table, flags
// (i, m, s, y, u, v, d), named groups in the table header and the replacement, lookbehind, Unicode properties, empty
// matches, replacement with $1 / $<name> / $&, wrong flags and patterns explained, a pattern that backtracks without
// end is stopped after 2 s and the tab keeps working, a million matches counted, worker released on leave.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { setValue, until } from './_devdata.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/regex`);
  const pat = page.getByLabel('Pattern'), flags = page.getByLabel('Flags'), text = page.getByLabel('Test text'), rep = page.getByLabel('Replacement');
  const repOut = page.locator('.card').filter({ hasText: 'Replace' }).locator('textarea');
  const set = async (p, f, t) => { await pat.fill(p); await flags.fill(f); if (t !== undefined) await setValue(text, t); };
  const marksAre = (want) => until(page, (w) => [...document.querySelectorAll('.regex-hl mark')].map((e) => e.textContent).join('\u0001') === w, want.join('\u0001'));
  const noteIs = (re) => until(page, (s) => new RegExp(s).test(document.querySelector('.tool-body .card .note, .card .note')?.textContent || ''), re.source);
  const rows = () => page.$$eval('.tbl tbody tr', (r) => r.map((tr) => [...tr.children].map((td) => td.textContent)));
  const head = () => page.$$eval('.tbl thead th', (h) => h.map((e) => e.textContent));
  await pat.waitFor();
  ok(await marksAre(['555-1234', '555-9876']) && await noteIs(/^2 matches$/), 'default: 2 phone numbers');
  ok(JSON.stringify(await rows()) === JSON.stringify([['1', '555-1234', '5', '555', '1234'], ['2', '555-9876', '17', '555', '9876']]) && (await head()).join() === '#,Match,Index,$1,$2', 'groups table: match, index, $1, $2');
  await rep.fill('($1) $2'); ok(await until(page, () => document.querySelectorAll('textarea')[1].value === 'Call (555) 1234 or (555) 9876 today.'), 'replacement with $1 $2');
  await set('(?<y>\\d{4})-(?<m>\\d{2})|(x)', 'g', 'on 2026-11 and 1999-01'); await rep.fill('$<m>/$<y>');
  ok(await until(page, () => document.querySelectorAll('textarea')[1].value === 'on 11/2026 and 01/1999'), 'named groups in the replacement');
  ok((await head()).join() === '#,Match,Index,$1 y,$2 m,$3' && (await rows())[0].join() === '1,2026-11,3,2026,11,—', `named groups are named in the table header; a group that did not take part shows — (${await head()})`);
  await rep.fill('[$&]'); ok(await until(page, () => document.querySelectorAll('textarea')[1].value === 'on [2026-11] and [1999-01]'), '$& = the whole match');
  await rep.fill('');
  await set('cat', 'gi', 'Cat cAt dog CAT'); ok(await marksAre(['Cat', 'cAt', 'CAT']), 'i flag');
  await set('^\\w+', 'gm', 'one two\nthree four\nfive'); ok(await marksAre(['one', 'three', 'five']), 'm flag: ^ at each line');
  await set('a.b', 'g', 'a\nb'); ok(await noteIs(/^0 matches$/) && await marksAre([]), 'dot does not match a new line without s');
  await set('a.b', 'gs', 'a\nb'); ok(await marksAre(['a\nb']), 's flag');
  await set('(?<=₹)\\d+', 'g', 'Rs 10, ₹250 and ₹99'); ok(await marksAre(['250', '99']), 'lookbehind');
  await set('\\p{Script=Devanagari}+', 'gu', 'Hello नमस्ते world दुनिया'); ok(await marksAre(['नमस्ते', 'दुनिया']), 'Unicode property escapes (u flag)');
  await set('[\\p{L}--[a-z]]+', 'gv', 'abc DEF ghi Ünï'); ok(await marksAre(['DEF', 'Ü', 'ï']), 'v flag: set subtraction (letters that are not a–z)');
  await set('\\d+', 'y', '12 34'); ok(await marksAre(['12']), 'y flag: matches only from the start');
  await set('x*', 'g', 'abc');
  ok(await marksAre(['∅', '∅', '∅', '∅']) && (await page.locator('.regex-hl').textContent()).replace(/∅/g, '') === 'abc', 'empty matches: every character kept in the highlight');
  await set('', 'g', 'ab'); ok(await marksAre(['∅', '∅', '∅']), 'an empty pattern matches between every character');
  // mistakes
  await set('(', 'g', 'abc'); ok(await until(page, () => /Unterminated group/.test(document.querySelector('.note-err')?.textContent || '')) && !/Invalid regular expression/.test(await page.locator('.note-err').textContent()) && await pat.evaluate((e) => e.classList.contains('bad')), 'a broken pattern: the reason, without the engine\'s prefix');
  await set('a', 'gq', 'abc'); ok(await until(page, () => /“q” is not a flag\. The flags are g i m s u v y d\./.test(document.querySelector('.note-err')?.textContent || '')) && await flags.evaluate((e) => e.classList.contains('bad')), 'an unknown flag is named');
  await set('a', 'gg', 'abc'); ok(await until(page, () => /Flag g is given twice/.test(document.querySelector('.note-err')?.textContent || '')), 'a repeated flag is named');
  await set('a', 'uv', 'abc'); ok(await until(page, () => /u and v cannot be used together/.test(document.querySelector('.note-err')?.textContent || '')), 'u with v is explained');
  await set('a', 'g', 'abc'); ok(await marksAre(['a']) && !await flags.evaluate((e) => e.classList.contains('bad')) && await page.locator('.note-err').count() === 0, 'fixing the flags clears the error');
  // many matches
  await set('\\d', 'g', '1'.repeat(5000)); ok(await noteIs(/^5,000 matches \(first 1,000 highlighted, 200 in the table\)$/) && (await rows()).length === 200 && (await page.locator('.regex-hl mark').count()) === 1000, 'many matches: all 5,000 counted, 1,000 highlighted, 200 in the table');
  await set('.', 'g', 'x'.repeat(1200000)); ok(await until(page, () => /^1,000,000\+ matches/.test(document.querySelector('.card .note')?.textContent || ''), null, 20000), 'counting stops at a million matches');
  await set('o', '', 'foo boo'); await rep.fill('0');
  ok(await until(page, () => document.querySelectorAll('textarea')[1].value === 'f0o boo') && await marksAre(['o', 'o', 'o', 'o']), 'without g: replace only the first; the highlight still shows all');
  // a pattern that never finishes is stopped, and the tab keeps working
  await rep.fill(''); await set('(a+)+$', 'g', 'a'.repeat(40) + '!');
  const t0 = Date.now();
  ok(await until(page, () => /Stopped after 2 seconds: this pattern takes too long/.test(document.querySelector('.note-err')?.textContent || ''), null, 9000), `a runaway pattern is stopped (${Date.now() - t0} ms) with an explanation`);
  ok(await page.evaluate(() => 1 + 1) === 2 && await page.locator('.regex-hl').textContent() === 'a'.repeat(40) + '!', 'the page stayed responsive and the text is still shown');
  await set('a{3}', 'g', 'aaaaaa'); ok(await marksAre(['aaa', 'aaa']), 'the next pattern runs in a fresh worker');
  ok((await page.evaluate(() => globalThis.__supertoolsLive())).workers === 1, 'one worker is alive');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__supertoolsLive().workers === 0), 'the worker is ended when the tab is left');
  await pcOnlyOnPhone(ctx, 'regex');
};
