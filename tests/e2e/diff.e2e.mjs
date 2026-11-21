// Text Diff (#/diff) in the browser: lines with their numbers and the changed part of a changed line marked, words,
// characters; the counts of GNU diff's minimal diff (tests/fixtures/diff/reference.json —
// python3 scripts/make-diff-reference.py) read from the page; the patch the tab hands out applied with GNU patch;
// long texts (the engine before gave up at 8,000 lines), folded unchanged runs, phone layout.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setValue, until, hookClipboard, copied, notes } from './_devdata.mjs';

const REF = JSON.parse(readFileSync(new URL('../fixtures/diff/reference.json', import.meta.url), 'utf8'));

export default async ({ base, page: newPage, ok, tmp, download, devices }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = []; page.on('request', (r) => fetched.push(r.url().split('/').pop()));
  await page.goto(`${base}#/diff`);
  const A = page.getByLabel('Original'), B = page.getByLabel('Changed'), card = page.locator('.card').filter({ hasText: 'Differences' }), info = card.locator('.muted.small').first();
  const mode = (m) => page.getByRole('radio', { name: m, exact: true }).click();
  /** set both texts and wait for the answer to this very pair (first a marker pair whose summary is known) */
  let n = 0;
  const set = async (a, b) => { const m = `marker ${++n}`; await setValue(A, m); await setValue(B, `${m}\nx`); await until(page, (mm) => document.querySelector('.dl-wrap .dl-text, .dw')?.textContent.startsWith(mm) || document.querySelector('.dw-wrap')?.textContent.startsWith(mm), m); await setValue(A, a); await setValue(B, b); await until(page, (mm) => !(document.querySelector('.dl-wrap, .dw-wrap')?.textContent || '').includes(mm), m); await page.waitForTimeout(40); };
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.dl')].map((e) => ({ k: e.classList.contains('dl-ins') ? 'ins' : e.classList.contains('dl-del') ? 'del' : 'eq', a: e.children[0].textContent, b: e.children[1].textContent, sign: e.children[2].textContent, t: e.querySelector('.dl-text').textContent, marks: [...e.querySelectorAll('mark')].map((m) => m.textContent) })));
  const spans = () => page.evaluate(() => [...document.querySelectorAll('.dw')].map((e) => ({ k: e.classList.contains('dw-ins') ? 'ins' : e.classList.contains('dw-del') ? 'del' : 'eq', t: e.textContent })));
  const hasPatch = spawnSync('patch', ['--version']).status === 0;
  const patched = (a, unified) => { writeFileSync(join(tmp, 'diff-a.txt'), a); writeFileSync(join(tmp, 'diff-p.diff'), unified); const r = spawnSync('patch', ['-s', '-o', join(tmp, 'diff-out.txt'), join(tmp, 'diff-a.txt'), join(tmp, 'diff-p.diff')], { encoding: 'utf8' }); return r.status === 0 ? readFileSync(join(tmp, 'diff-out.txt'), 'utf8') : `patch failed: ${r.stdout}${r.stderr}`; };
  await A.waitFor();

  // ---- the sample, compared as the tab opens
  ok(await until(page, () => document.querySelectorAll('.dl').length === 6), 'the sample pair is compared at once');
  let r = await rows();
  ok(r.map((x) => `${x.k}:${x.t}`).join('|') === 'eq:apple|del:banana|ins:blueberry|eq:cherry|eq:date|ins:elderberry' && (await info.textContent()) === '2 lines added, 1 removed, 3 unchanged', `banana → blueberry, elderberry added; "date" is unchanged though only one text has a line after it (${await info.textContent()})`);
  ok(r.map((x) => `${x.a || '·'}/${x.b || '·'}`).join(' ') === '1/1 2/· ·/2 3/3 4/4 ·/5' && r.map((x) => x.sign).join('') === ' −+  +', `every line has its number in the original and in the changed text, and its sign (${r.map((x) => `${x.a || '·'}/${x.b || '·'}`).join(' ')})`);
  const wasm = fetched.filter((f) => /\.wasm/.test(f));
  ok(wasm.length === 1 && /^textkit-diff-/.test(wasm[0]), `one engine is fetched: the diff module (${wasm.join(', ')})`);

  // ---- the changed part of a changed line
  await set('The quick brown fox jumps\nover the lazy dog', 'The quick red fox jumped\nover the lazy dog'); r = await rows();
  ok(r.length === 3 && r[0].marks.join() === 'brown,jumps' && r[1].marks.join() === 'red,jumped' && r[2].k === 'eq' && r[0].t === 'The quick brown fox jumps', `in a changed line the words that changed are marked on both sides (${r[0].marks.join()} / ${r[1].marks.join()})`);
  await set('alpha\nsame', 'omega\nsame'); r = await rows(); ok(r[0].marks.length === 0 && r[1].marks.length === 0, 'a line replaced by quite another one is not cut into pieces');

  // ---- GNU diff's counts, read from the page; every pair rebuilt from the rows
  const some = REF.filter((c, i) => i % 6 === 0 && c.a.split('\n').length < 40), bad = [];
  for (const c of some) {
    await set(c.a, c.b); const got = await rows(), line = await info.textContent();
    const want = c.added || c.removed ? new RegExp(`^${c.added.toLocaleString('en-IN')} lines? added, ${c.removed.toLocaleString('en-IN')} removed,`) : /identical|empty/;
    if (!want.test(line)) bad.push(`${JSON.stringify(c.a.slice(0, 30))}: "${line}", GNU diff −${c.removed} +${c.added}`);
    const folded = await page.locator('.dl-fold').count();
    if (!folded && (got.filter((x) => x.k !== 'ins').map((x) => x.t).join('\n') !== c.a.replace(/\n$/, '') || got.filter((x) => x.k !== 'del').map((x) => x.t).join('\n') !== c.b.replace(/\n$/, ''))) bad.push(`${JSON.stringify(c.a.slice(0, 30))}: the rows do not rebuild the texts`);
  }
  ok(some.length >= 20 && !bad.length, `${some.length} pairs: as many lines added and removed as GNU diff's minimal diff counts, and the rows rebuild both texts ${bad.slice(0, 3).join(' | ')}`);

  // ---- the patch the tab hands out, applied by GNU patch
  await hookClipboard(page);
  const pa = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten', pb = 'one\n2\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\n';
  await set(pa, pb); await page.getByRole('button', { name: 'Copy as patch' }).click();
  const unified = (await copied(page)).at(-1);
  ok(unified.startsWith('--- original\n+++ changed\n@@ -1,5 +1,5 @@\n one\n-two\n+2\n three\n') && /No newline at end of file/.test(unified), 'Copy as patch gives a unified diff (three lines of context, "No newline at end of file" where it applies)');
  ok(!hasPatch || patched(pa, unified) === pb, hasPatch ? 'GNU patch turns the original into the changed text with it — the final line break included' : '(GNU patch is not installed here)');
  const file = await download(page, () => page.getByRole('button', { name: 'Download .diff' }).click());
  ok(readFileSync(file, 'utf8') === unified && /changes\.diff$/.test(file), 'Download .diff saves the same patch as changes.diff');

  // ---- identical, empty, only the final line break
  await set('same\ntext', 'same\ntext'); ok((await info.textContent()) === 'The texts are identical.' && await page.getByRole('button', { name: 'Copy as patch' }).isHidden(), 'identical texts: said, and no patch offered');
  await set('', ''); ok((await info.textContent()) === 'Both boxes are empty.', 'empty boxes');
  await set('a\nb\n', 'a\nb'); ok(/differ only in the line break at the end: only the original ends with one/.test(await info.textContent()) && await page.getByRole('button', { name: 'Copy as patch' }).isVisible(), `texts that differ only in the final line break: said, and the patch is there (${await info.textContent()})`);

  // ---- words and characters: fewest changes, texts rebuilt
  const lcs = (a, b) => { const d = Array(b.length + 1).fill(0); for (const x of a) { let prev = 0; for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = x === b[j - 1] ? prev + 1 : Math.max(d[j], d[j - 1]); prev = tmp; } } return d[b.length]; };
  await mode('Characters');
  for (const [a, b] of [['abcabba', 'cbabac'], ['the cat sat on the mat', 'the dog sat on a mat'], ['नमस्ते दुनिया', 'नमस्ते भारत']]) {
    await set(a, b); const s = await spans(), ga = await page.evaluate((x) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(x)].map((y) => y.segment), a), gb = await page.evaluate((x) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(x)].map((y) => y.segment), b), L = lcs(ga, gb);
    ok(s.filter((x) => x.k !== 'ins').map((x) => x.t).join('') === a && s.filter((x) => x.k !== 'del').map((x) => x.t).join('') === b && (await info.textContent()) === `${gb.length - L} character${gb.length - L === 1 ? '' : 's'} added, ${ga.length - L} removed, ${L} unchanged`, `characters "${a.slice(0, 14)}…": rebuilt, and the fewest changes possible (${await info.textContent()})`);
  }
  await set('👍🏽 ok', '👍🏿 ok'); let s = await spans(); ok(s[0].t === '👍🏽' && s[1].t === '👍🏿' && (await info.textContent()) === '1 character added, 1 removed, 3 unchanged', `an emoji with a skin tone is one character (${s.map((x) => x.t).join('|')})`);
  await mode('Words');
  await set('the cat sat on the mat.', 'the dog sat on a mat'); s = await spans();
  ok(s.map((x) => `${x.k}:${x.t}`).join('|') === 'eq:the |del:cat|ins:dog|eq: sat on |del:the|ins:a|eq: mat|del:.' && (await info.textContent()) === '2 words added, 2 removed, 4 unchanged', `words: "mat" is unchanged, the full stop removed, and it is not counted as a word (${await info.textContent()})`);
  await set('a  b', 'a b'); ok((await info.textContent()) === 'The same words; only spaces or signs between them differ.', 'words: only the spacing differs');

  // ---- long texts
  await mode('Lines');
  const big = Array.from({ length: 8000 }, (_, i) => `row ${i}`), big2 = big.map((l, i) => (i === 5 || i === 7994 ? `${l} changed` : l));
  const took = await A.evaluate((e, v) => { e.value = v; const t = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - t; }, big.join('\n'));
  await setValue(B, big2.join('\n'));
  ok(await until(page, () => document.querySelector('.card:last-of-type .muted.small')?.textContent === '2 lines added, 2 removed, 7,998 unchanged', null, 20000), `8,000 lines with a change near each end: found (the tab said "Texts are too different to diff") — ${await info.textContent()}`);
  ok(took < 60, `… and a keystroke in such a text returns in ${took.toFixed(1)} ms`);
  const folds = await page.locator('.dl-fold').allTextContents(), shown = await page.locator('.dl').count();
  ok(folds.length === 1 && /7,982 unchanged lines/.test(folds[0]) && shown === 20, `the unchanged run between them is folded, three lines stay beside each change (${folds.join(' | ')}; ${shown} lines shown)`);
  await page.locator('.dl-fold').first().click();
  ok(await page.locator('.dl').count() === 5021 && /and 2,982 more unchanged lines/.test(await page.locator('.dl-wrap').textContent()), 'a click unfolds it (5,000 lines at most are put on screen)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__superutilsLive().resources.length === 0), 'the engine is released when the tab is left');

  // ---- the engine cannot be fetched: said, and typing again retries
  const off = await newPage({ viewport: { width: 1366, height: 900 } }); let fail = true;
  await off.route(/textkit-diff-.*\.wasm/, (rt) => (fail ? rt.abort() : rt.continue()));
  await off.goto(`${base}#/diff`); await off.getByLabel('Original').waitFor();
  ok(await until(off, () => /could not be loaded/.test(document.querySelector('.note-err')?.textContent || '')), `no engine: the tab says so (${await notes(off)})`);
  fail = false; await setValue(off.getByLabel('Original'), 'x');
  ok(await until(off, () => document.querySelectorAll('.dl').length > 0 && !document.querySelector('.note-err')), 'typing again fetches it and the note goes');

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/diff`); await ph.getByLabel('Original').waitFor();
  await setValue(ph.getByLabel('Original'), Array.from({ length: 60 }, (_, i) => `a fairly long line of text number ${i} that has to wrap on a narrow screen`).join('\n')); await setValue(ph.getByLabel('Changed'), Array.from({ length: 60 }, (_, i) => `a fairly long line of text number ${i === 30 ? 'thirty' : i} that has to wrap on a narrow screen`).join('\n'));
  await until(ph, () => document.querySelectorAll('.dl-fold').length === 2);
  const fold = await ph.locator('.dl-fold').first().boundingBox(), seg = await ph.getByRole('radio', { name: 'Words', exact: true }).boundingBox();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll with long lines');
  ok(fold.height >= 44 && seg.height >= 44, `phone: the fold-out rows and the choices are at least 44 px tall (${Math.round(fold.height)}, ${Math.round(seg.height)})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
