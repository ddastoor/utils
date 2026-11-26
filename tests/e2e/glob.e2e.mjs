// Glob Tester (#/glob, PC only): matches compared with Python's own glob rules where they agree (fnmatch for single
// segments, pathlib for **) and with hand-checked .gitignore-style cases: * and ? stay in a segment, ** crosses, braces,
// classes, negation (last match wins), case option, dot files, bad pattern message, counts, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from '../lib/child.mjs';
const PATHS = ['package.json', 'README.md', 'src/main.ts', 'src/ui.ts', 'src/tools/text.ts', 'src/tools/text.test.ts', 'src/a/b/c/deep.ts', 'tests/e2e.mjs', '.env', 'docs/notes.md', 'docs/Guide.MD', 'img/logo.png', 'img/photo.JPG', 'file1.txt', 'file10.txt', 'a.b.c'];
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/glob`);
  const [pats, paths] = [page.locator('textarea').nth(0), page.locator('textarea').nth(1)]; await pats.waitFor();
  const res = async (p) => { await pats.fill(p); await page.waitForTimeout(200); return page.$$eval('.glob-row', (r) => r.filter((e) => e.classList.contains('m')).map((e) => e.querySelector('.mono').textContent)); };
  await paths.fill(PATHS.join('\n'));
  // single-segment patterns: Python fnmatchcase on whole paths where the pattern has a "/" count equal to the path's
  const py = (pat) => JSON.parse(execFileSync('python3', ['-c', `import fnmatch,json,sys; P=json.loads(sys.argv[2]); p=sys.argv[1]; print(json.dumps([x for x in P if x.count('/')==p.count('/') and fnmatch.fnmatchcase(x,p)]))`, pat, JSON.stringify(PATHS)]).toString());
  for (const p of ['*.json', 'src/*.ts', 'file?.txt', '[a-f]*.*', 'img/*.png', '*.*.*', 'src/tools/*.test.ts', '[!R]*.md']) {
    const got = await res(p), want = py(p); ok(JSON.stringify(got) === JSON.stringify(want), `"${p}" = Python fnmatch per segment (${got.join(', ') || 'none'})`);
  }
  const pathlib = (pat) => JSON.parse(execFileSync('python3', ['-c', `import json,sys; from pathlib import PurePosixPath as P; print(json.dumps([x for x in json.loads(sys.argv[2]) if P(x).full_match(sys.argv[1])]))`, pat, JSON.stringify(PATHS)]).toString());
  let pyOk = true; try { pathlib('*'); } catch { pyOk = false; }
  for (const p of ['**/*.ts', 'src/**', 'src/**/*.ts', '**/notes.md']) {
    const got = await res(p), want = pyOk ? pathlib(p) : null;
    ok(want ? JSON.stringify(got) === JSON.stringify(want) : got.length > 0, `"${p}" ${want ? '= Python pathlib full_match' : '(Python ≥ 3.13 not available)'} (${got.join(', ')})`);
  }
  ok(JSON.stringify(await res('*.{png,JPG,md}')) === JSON.stringify(['README.md']), 'braces: only top-level files');
  ok(JSON.stringify(await res('**/*.{png,JPG}')) === JSON.stringify(['img/logo.png', 'img/photo.JPG']), 'braces with **');
  ok(JSON.stringify(await res('src/**/*.ts\n!src/**/*.test.ts')) === JSON.stringify(['src/main.ts', 'src/ui.ts', 'src/tools/text.ts', 'src/a/b/c/deep.ts']), 'negation excludes tests');
  ok(JSON.stringify(await res('**/*.md\n!docs/**\ndocs/notes.md')) === JSON.stringify(['README.md', 'docs/notes.md']), 'the last matching pattern wins (re-include after an exclude)');
  ok(JSON.stringify(await res('!**/*.md')) === JSON.stringify(PATHS.filter((x) => !/\.md$/.test(x))), 'only negative patterns: everything else matches');
  ok(JSON.stringify(await res('# comment\n\n*.txt')) === JSON.stringify(['file1.txt', 'file10.txt']), 'comments and blank lines ignored');
  ok(/1 of|2 of/.test(await page.locator('.card-title', { hasText: 'paths match' }).textContent()) && /2 of 16 paths match/.test(await page.locator('.card-title', { hasText: 'paths match' }).textContent()), 'count heading');
  ok(JSON.stringify(await res('**/*.md')) === JSON.stringify(['README.md', 'docs/notes.md']), 'case-sensitive by default (Guide.MD not matched)');
  await page.locator('label.switch', { hasText: 'Case-insensitive' }).click(); await page.waitForTimeout(200);
  ok((await res('**/*.md')).includes('docs/Guide.MD'), 'case-insensitive option');
  ok((await res('*')).includes('.env'), 'dot files match by default');
  await page.locator('label.switch', { hasText: 'Match dot files' }).click(); await page.waitForTimeout(200);
  ok(!(await res('*')).includes('.env'), 'dot files hidden when switched off');
  await res('[a-'); ok(/Pattern "\[a-"/.test(await page.locator('.note-warn').textContent()), 'invalid pattern reported');
  const by = await page.$$eval('.glob-row.m .muted', (e) => e.map((x) => x.textContent)); await res('*.json\n**/*.json'); ok((await page.locator('.glob-row.m .muted').first().textContent()) === '**/*.json', 'shows which pattern decided');
  void by;
  // ---- bug hunt, Nov 2026: file names that are not English (the old matcher counted bytes), braces, **, errors, cost
  const REF = JSON.parse(readFileSync(new URL('../fixtures/glob/reference.json', import.meta.url), 'utf8'));
  for (const [label, want] of [['Case-insensitive', false], ['Match dot files', true]]) { const sw = page.locator('label.switch', { hasText: label }); if (await sw.locator('input').isChecked() !== want) await sw.click(); } // (earlier checks leave the switches in other positions)
  await paths.fill(REF.paths.join('\n')); const gbad = [];
  for (const [pat, bits] of REF.patterns.filter((_, i) => i % 7 === 0)) { const got = await res(pat); const want = REF.paths.filter((_, i) => bits[i] === '1'); if (JSON.stringify(got) !== JSON.stringify(want)) gbad.push(`${pat}: ${got.length} vs ${want.length}`); }
  ok(!gbad.length, `${Math.ceil(REF.patterns.length / 7)} patterns × ${REF.paths.length} paths on the page (accents, Devanagari, emoji) = Python's glob rules ${gbad.slice(0, 4).join(' | ')}`);
  await paths.fill('a.txt\né.txt\nन.txt\n😀.txt\nab.txt\nनमस्ते.md\nfileé.txt\nfilex.txt\nÉcole.txt\nécole.txt');
  ok(JSON.stringify(await res('?.txt')) === JSON.stringify(['a.txt', 'é.txt', 'न.txt', '😀.txt']), '?.txt matches one-character names in any script (é, न and 😀 used to be missed)');
  ok(JSON.stringify(await res('[éन]*')) === JSON.stringify(['é.txt', 'न.txt', 'नमस्ते.md', 'école.txt']) && JSON.stringify(await res('file[!x].txt')) === JSON.stringify(['fileé.txt']), 'non-ASCII letters in […] and [!…]');
  await pats.fill('É*'); await page.locator('label.switch', { hasText: 'Case-insensitive' }).click(); await page.waitForTimeout(250);
  ok(JSON.stringify(await page.$$eval('.glob-row.m', (e) => e.map((x) => x.querySelector('.mono').textContent))) === JSON.stringify(['é.txt', 'École.txt', 'école.txt']), 'case-insensitive: É* also matches é… (non-ASCII letters were not folded)');
  await page.locator('label.switch', { hasText: 'Case-insensitive' }).click();
  await paths.fill('src/a.ts\nsrc/x/y/b.md\ndocs/n.md\nlib/a.ts\nx.gz\nx.tar.gz\n{a,b}\na*b\naxb\na\na/\na/b\na/b/c');
  ok(JSON.stringify(await res('{src,docs}/**/*.{ts,md}')) === JSON.stringify(['src/a.ts', 'src/x/y/b.md', 'docs/n.md']) && JSON.stringify(await res('x{,.tar}.gz')) === JSON.stringify(['x.gz', 'x.tar.gz']), 'braces: nested with ** and an empty alternative');
  ok(JSON.stringify(await res('\\{a,b\\}\na\\*b')) === JSON.stringify(['{a,b}', 'a*b']), 'backslash makes braces and * literal');
  ok(JSON.stringify(await res('a/**')) === JSON.stringify(['a/', 'a/b', 'a/b/c']) && JSON.stringify(await res('**/b')) === JSON.stringify(['a/b']) && (await res('**')).length === 13, 'a/** = everything inside a; **/b; ** alone = everything');
  const errs = []; for (const [p2, re] of [['[', /unclosed character class/], ['{a,b', /unclosed alternate group/], ['a}', /unopened alternate group/], ['[z-a]', /invalid range/], ['a\\', /dangling/]]) { await res(p2); if (!re.test(await page.locator('.note-warn').first().textContent().catch(() => ''))) errs.push(p2); }
  ok(!errs.length, `five kinds of broken pattern are named ${errs.join(' ')}`);
  await res('[\n*.ts'); ok(await page.locator('.note-warn').count() === 1 && (await page.$$eval('.glob-row.m', (e) => e.length)) === 0, 'a broken pattern is reported and the other patterns still run');
  await paths.fill(`${'a'.repeat(400)}\n${'a'.repeat(399)}b`); const t0 = Date.now(); const heavy = await res(`${'*a'.repeat(30)}*b\n${'[a-z]*'.repeat(40)}`); ok(heavy.length === 2 && Date.now() - t0 < 2500, `patterns that make naive matchers explode finish at once (${Date.now() - t0} ms)`);
  await pats.fill(''); await page.waitForTimeout(250); ok(/2 of 2 paths match/.test(await page.locator('.card-title', { hasText: 'paths match' }).textContent()), 'no patterns: everything matches');
  await paths.fill(''); await page.waitForTimeout(250); ok(/0 of 0 paths match/.test(await page.locator('.card-title', { hasText: 'paths match' }).textContent()), 'no paths: 0 of 0');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'glob');
};
