// String Escape (#/escape, PC only): every format escapes known strings to the expected form (JSON = JSON.stringify,
// shell output run through a real POSIX shell, Python unescape via Python's own literal parser, CSV read back by
// Python's csv module), and unescape(escape(x)) = x for tricky strings; invalid input messages; swap; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
const TRICKY = ['He said "hi"\n\tit\'s 5\\6', 'नमस्ते ₹500 😀', 'a\u0000b\u001fc', '<script>alert("x & y")</script>', "O'Reilly; DROP TABLE x;--", 'a,b\n"c"', '$HOME `ls` \\ !!', '.*+?^${}()|[]\\/'];
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/escape`);
  const src = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1), fmt = page.locator('select'); await src.waitFor();
  const esc = async (kind, s, dir = 'Escape') => { await fmt.selectOption(kind); await page.getByRole('radio', { name: dir, exact: true }).click(); await src.fill(s); return out.inputValue(); };
  ok(await esc('json', 'He said "hi"\n') === 'He said \\"hi\\"\\n', 'JSON escape');
  let bad = [];
  for (const s of TRICKY) if (await esc('json', s) !== JSON.stringify(s).slice(1, -1)) bad.push(s);
  ok(!bad.length, `JSON escape = JSON.stringify for ${TRICKY.length} strings ${bad}`);
  ok(await esc('js', 'é😀\n') === '\\u00e9\\ud83d\\ude00\\n', 'JavaScript/Java: non-ASCII as \\uXXXX (surrogate pairs)');
  const py = (lit) => execFileSync('python3', ['-c', 'import ast,sys; sys.stdout.write(ast.literal_eval(sys.stdin.read()))'], { input: lit }).toString();
  bad = []; for (const s of TRICKY.filter((x) => !x.includes('\u0000'))) { const e = await esc('c', s); if (py(`"${e}"`) !== s) bad.push(s); }
  ok(!bad.length, `C/Python escape read back by Python's own parser ${bad}`);
  bad = []; for (const s of TRICKY.filter((x) => !x.includes('\u0000'))) { const e = await esc('shell', s); if (execFileSync('sh', ['-c', `printf %s ${e}`]).toString() !== s) bad.push(s); }
  ok(!bad.length, `shell quoting survives a real /bin/sh (printf %s 'quoted') ${bad}`);
  ok(await esc('sql', "O'Reilly") === "'O''Reilly'", 'SQL doubles single quotes');
  ok(await esc('html', '<a href="x">Tom & Jerry\'s</a>') === '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;', 'HTML entities');
  ok(await esc('html', '&lt;b&gt; &amp;amp; &#8377; &#x20B9; &rupee; &copy; &unknown;', 'Unescape') === '<b> &amp; ₹ ₹ &rupee; © &unknown;', 'HTML unescape: named, decimal, hex; unknown names kept ("&rupee;" is not an HTML entity — it used to be invented)');
  ok(await esc('html', '&eacute;&ntilde;&hearts;&frac12;&rarr;&alpha;&Omega;&nbsp;&shy;&zwj;&NotEqualTilde;&apos;', 'Unescape') === 'éñ♥½→αΩ\u00a0\u00ad\u200d≂̸\'', 'HTML unescape knows every named entity (&eacute; &hearts; &frac12; &rarr; … were left undecoded: the table had 24 names)');
  ok(new RegExp(await esc('regex', '1+1=2? (yes) [a]')).test('1+1=2? (yes) [a]') && !new RegExp(await esc('regex', 'a.c')).test('abc'), 'regex escape matches literally');
  const csvOut = await esc('csv', 'a,b\n"c"'); ok(csvOut === '"a,b\n""c"""' && execFileSync('python3', ['-c', 'import csv,sys; sys.stdout.write(next(csv.reader(sys.stdin, strict=True))[0])'], { input: csvOut + '\n' }).toString() === 'a,b\n"c"', 'CSV field read back by Python csv');
  ok(await esc('csv', 'plain') === 'plain', 'CSV: plain fields not quoted');
  ok(await esc('url', 'a b&c=d/é') === 'a%20b%26c%3Dd%2F%C3%A9', 'URL component');
  bad = [];
  for (const k of ['json', 'js', 'c', 'sql', 'shell', 'html', 'regex', 'csv', 'url']) for (const s of TRICKY) { const e = await esc(k, s); const u = await esc(k, e, 'Unescape'); if (u !== s) bad.push(`${k}: ${JSON.stringify(s)} → ${JSON.stringify(u)}`); }
  ok(!bad.length, `round trip unescape(escape(x)) = x for 9 formats × ${TRICKY.length} strings ${bad.slice(0, 3).join('; ')}`);
  ok(await esc('c', '\\x41\\101\\u00e9\\U', 'Unescape') === 'AAéU' && await esc('js', '\\u{1F600}', 'Unescape') === '😀', 'unescape \\x, octal, \\u, \\u{…}');
  await esc('json', '\\uZZZZ', 'Unescape'); ok(/Cannot unescape/.test(await page.locator('.note-warn').textContent()), 'invalid JSON escape → message');
  await esc('shell', "'unclosed", 'Unescape'); ok(/Unclosed single quote/.test(await page.locator('.note-warn').textContent()), 'unclosed shell quote → message');
  await esc('html', 'x < y'); await page.getByRole('button', { name: 'Swap' }).click(); await page.waitForTimeout(100);
  ok(await src.inputValue() === 'x &lt; y' && await out.inputValue() === 'x < y', 'Swap moves the output in and flips the direction');
  // ---- bug hunt, Nov 2026
  const un = (kind, s2) => esc(kind, s2, 'Unescape'), warnNow = async () => (await page.locator('.tool-body .note-warn').allTextContents()).join(' | ');
  ok(await un('json', 'say ""hi"" \\u0041\\n') === 'say ""hi"" A\n' && await un('json', 'C:\\\\dir\\\\"x"') === 'C:\\dir\\"x"' && await un('json', 'real\ttab') === 'real\ttab', 'JSON unescape accepts bare quotes, an escaped backslash before a quote, real tabs (each used to fail with "Unexpected token" / "Bad control character")');
  ok(await un('json', '"whole\\nstring"') === 'whole\nstring', 'a whole quoted JSON string loses its quotes');
  await un('json', 'bad \\x41'); ok(/is not a JSON escape/.test(await warnNow()) && await out.inputValue() === '', 'an escape JSON does not have (\\x41) is named');
  ok(await esc('c', 'bell\x07 esc\x1b') === 'bell\\007 esc\\033' && await esc('js', 'bell\x07') === 'bell\\u0007', 'C / Python escape writes control characters as octal (\\u0007 is not valid C); JavaScript keeps \\uXXXX');
  ok(await esc('c', 'a\x001') === 'a\\0001' && await un('c', 'a\\0001') === 'a\x001', 'a NUL before a digit is written \\000 so that it reads back as NUL + digit');
  ok(await un('c', '\\U0001F44D \\x41\\101 ab\\\ncd') === '👍 AA abcd', 'C unescape: \\U with eight digits, \\x, octal, backslash-newline joins lines');
  await un('js', '\\u{110000}'); ok(/beyond the last Unicode character/.test(await warnNow()), '\\u{110000} → a clear message');
  ok(await un('shell', "$'a\\nb\\tc' \"d \\\"e\\\"\" f\\ g") === 'a\nb\tc d "e" f g', "shell unescape: $'…', \\\" inside double quotes (it used to say \"Unclosed double quote\"), backslash-space");
  ok(await un('html', 'caf&eacute; &rarr; &hearts; &frac12; &#65 &lt &#150; &#x110000;') === 'café → ♥ ½ A < – \ufffd', 'HTML unescape as a browser does it: every named entity, references without the semicolon, &#150; = –, impossible numbers = U+FFFD');
  ok(await un('html', '<b>&amp;</b> stays text: &lt;script&gt;') === '<b>&</b> stays text: <script>' && !page.errors.length, 'tags in the input are text, nothing is run');
  ok(await un('sql', "'it''s'\n") === "it's\n" && await esc('sql', "O'Reilly") === "'O''Reilly'", 'SQL: quotes doubled / undoubled, also when a newline follows the closing quote');
  ok(await esc('regex', '1+1=2 (really?) [yes] $5.00') === '1\\+1=2 \\(really\\?\\) \\[yes\\] \\$5\\.00' && await esc('csv', 'say "hi", ok') === '"say ""hi"", ok"' && await esc('url', 'a b&c/₹') === 'a%20b%26c%2F%E2%82%B9', 'regex, CSV and URL escapes');
  await un('url', '%E0%A4%A'); ok(/Cannot unescape/.test(await warnNow()) && await out.inputValue() === '', 'a cut-off %-sequence → message, empty output');
  // every format: escape then unescape gives the text back (awkward texts)
  const texts = ['He said "Namaste" — it\'s 5\\6\n\tnext', '<a href="x?a=1&b=2">O\'Reilly</a>', '100% $HOME `ls` !x', 'नमस्ते 👍🏽 café', 'a,b;"c"\nd', '\\\\server\\share\\', '{"k":"v"}', 'tab\there', ''];
  const rt = []; for (const k of ['json', 'js', 'c', 'sql', 'shell', 'html', 'regex', 'csv', 'url']) for (const t2 of texts) { const e2 = await esc(k, t2); const back = await un(k, e2); if (back !== t2) rt.push(`${k}: ${JSON.stringify(t2).slice(0, 24)}`); }
  ok(!rt.length, `9 formats × ${texts.length} awkward texts: escape → unescape gives the text back ${rt.slice(0, 5).join(' | ')}`);
  const kinds = await fmt.locator('option').allTextContents(); ok(kinds.length === 9, `nine formats offered (${kinds.length})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'escape');
};
