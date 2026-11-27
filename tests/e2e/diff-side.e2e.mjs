// Text Diff (#/diff), side by side (to-do #35; owner, 27 Nov 2026: "an interactive side-by-side diff with next and previous.
// as in to cycle through next and previous diff hunks"): the original on the left and the changed text on the right, read
// from the page — both texts given back by the columns, GNU diff's counts (tests/fixtures/diff/reference.json) in the line
// above; the lines of a change paired as the engine pairs them (the unit suite holds the pairing to an exhaustive search);
// Previous / Next — the buttons, N / P in the list, Alt+↓ / Alt+↑ in the tab — go through the changes and round again, each
// one outlined and brought into view inside the list, with the buttons in view; a click picks a change; long texts folded;
// two files and a file on GitHub name the columns; the patch is the line view's; a phone; WCAG 2.2 A / AA (axe-core).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setValue, until, hookClipboard, copied } from './_devdata.mjs';

const REF = JSON.parse(readFileSync(new URL('../fixtures/diff/reference.json', import.meta.url), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const linesOf = (s) => { const l = s.split(/\r\n|\n|\r/); if (l[l.length - 1] === '') l.pop(); return l; };
const A_SHA = '1f0e3d2c4b5a69788796a5b4c3d2e1f00f1e2d3c', B_SHA = '9a8b7c6d5e4f30211203f4e5d6c7b8a99a8b7c6d';
const OLD = 'alpha\nbeta\ngamma\ndelta\n', NEW = 'alpha\nbeta\nGAMMA\ndelta\nepsilon\n';

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = []; page.on('request', (r) => fetched.push(r.url().split('/').pop()));
  await page.goto(`${base}#/diff`);
  const A = page.getByLabel('Original', { exact: true }), B = page.getByLabel('Changed', { exact: true });
  await A.waitFor();
  const info = page.locator('.card').filter({ hasText: 'Differences' }).locator('.muted.small').first(), counter = page.locator('#diff-hunk');
  const next = page.getByRole('button', { name: 'Next change' }), prev = page.getByRole('button', { name: 'Previous change' });
  /** the rows as "=same", "left|right" (an empty side: nothing after or before the bar) */
  const lay = (p = page) => p.evaluate(() => [...document.querySelectorAll('.ds-wrap .ds-row:not(.ds-more)')].map((r) => {
    const [L, R] = r.children, t = (c) => (c.classList.contains('ds-none') ? '' : c.children[2].textContent);
    return L.classList.contains('ds-eq') ? `=${t(L)}` : `${t(L)}|${t(R)}`;
  }));
  /** every cell: its side's kind, number, sign, text and marked parts */
  const cells = () => page.evaluate(() => [...document.querySelectorAll('.ds-wrap .ds-row:not(.ds-more)')].map((r) => [...r.children].map((c) => ({
    k: ['eq', 'del', 'ins', 'none'].find((k) => c.classList.contains(`ds-${k}`)), no: c.children[0].textContent, sign: c.children[1].textContent, t: c.children[2].textContent, marks: [...c.querySelectorAll('mark')].map((m) => m.textContent) }))));
  const current = () => page.evaluate(() => { const els = [...document.querySelectorAll('.ds-hunk')]; return { i: els.findIndex((e) => e.classList.contains('ds-current')), aria: els.filter((e) => e.getAttribute('aria-current') === 'true').length }; });
  /** the current change inside the list's view (below the names), the list and both buttons in the window, nothing over them */
  const shown = (p = page) => p.evaluate(() => {
    const pane = document.querySelector('.ds-wrap'), el = document.querySelector('.ds-hunk.ds-current'), head = pane.querySelector('.ds-head');
    if (!el) return 'no current change';
    const pr = pane.getBoundingClientRect(), er = el.getBoundingClientRect(), top = pr.top + head.getBoundingClientRect().height;
    const visible = (e) => { const b = e.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + Math.min(b.height / 2, 10); return b.top >= 0 && b.bottom <= innerHeight && e.contains(document.elementFromPoint(x, y)); };
    if (er.top < top - 1 || er.top > pr.bottom - 10) return `the change at ${Math.round(er.top)} is outside the list's view ${Math.round(top)}–${Math.round(pr.bottom)}`;
    if (!visible(el)) return 'the change is covered';
    const bad = [...document.querySelectorAll('.ds-nav button')].filter((b) => !visible(b));
    return bad.length ? `${bad.length} button(s) out of view` : '';
  });
  const side = () => page.getByRole('radio', { name: 'Side by side', exact: true }).click();
  const set = async (a, b) => {
    await setValue(A, a); await setValue(B, b);
    return until(page, ([la, lb]) => {
      const rows = [...document.querySelectorAll('.ds-wrap .ds-row:not(.ds-more)')];
      if (document.querySelector('.ds-wrap .dl-fold')) return true; // folded: the caller unfolds or reads the summary
      const L = rows.map((r) => r.children[0]).filter((c) => !c.classList.contains('ds-none')).map((c) => c.children[2].textContent), R = rows.map((r) => r.children[1]).filter((c) => !c.classList.contains('ds-none')).map((c) => c.children[2].textContent);
      return JSON.stringify(L) === JSON.stringify(la) && JSON.stringify(R) === JSON.stringify(lb);
    }, [linesOf(a), linesOf(b)]);
  };

  // ---- the sample, side by side
  await page.waitForSelector('.dl'); await side(); await page.waitForSelector('.ds-row');
  ok(JSON.stringify(await lay()) === JSON.stringify(['=apple', 'banana|blueberry', '=cherry', '=date', '|elderberry']), `the sample side by side: banana beside blueberry, elderberry alone on the right (${(await lay()).join(' · ')})`);
  let c = await cells();
  ok(c.map((r) => r.map((x) => `${x.k}${x.no}${x.sign.trim()}`).join(' ')).join(' / ') === 'eq1 eq1 / del2− ins2+ / eq3 eq3 / eq4 eq4 / none ins5+', `every line with its number and its sign, on its side (${c.map((r) => r.map((x) => `${x.k}${x.no}${x.sign.trim()}`).join(' ')).join(' / ')})`);
  ok(JSON.stringify(await page.locator('.ds-name').allTextContents()) === '["Original","Changed"]' && (await info.textContent()) === '2 lines added, 1 removed, 3 unchanged', 'the columns are named Original and Changed; the line above counts as the line view does');
  ok((await counter.textContent()) === '2 changes — Next goes to the first.' && (await current()).i === -1, `before Next, no change is picked: "${await counter.textContent()}"`);
  const wasm = fetched.filter((f) => /\.wasm/.test(f));
  ok(wasm.length === 1 && /^textkit-diff-/.test(wasm[0]), `nothing more is fetched for it: the diff module only (${wasm.join(', ')})`);

  // ---- Previous / Next, round and round
  await next.click();
  ok((await counter.textContent()) === 'Change 1 of 2 — original line 2, changed line 2' && JSON.stringify(await current()) === '{"i":0,"aria":1}', `Next: the first change, outlined and aria-current — "${await counter.textContent()}"`);
  await next.click();
  ok((await counter.textContent()) === 'Change 2 of 2 — 1 line added: changed line 5' && (await current()).i === 1 && (await current()).aria === 1, `Next: the second — "${await counter.textContent()}"`);
  await next.click(); ok((await current()).i === 0 && /^Change 1 of 2/.test(await counter.textContent()), 'Next on the last change goes round to the first');
  await prev.click(); ok((await current()).i === 1 && /^Change 2 of 2/.test(await counter.textContent()), 'Previous on the first goes round to the last');
  await prev.click(); ok((await current()).i === 0, 'Previous: back to the first');
  ok(await page.locator('.ds-hunk.ds-current').evaluate((e) => getComputedStyle(e).outlineStyle === 'solid' && parseFloat(getComputedStyle(e).outlineWidth) >= 2), 'the current change is outlined');
  // the keys
  await page.locator('.ds-wrap').focus(); await page.keyboard.press('n');
  ok((await current()).i === 1, 'N in the list: the next change');
  await page.keyboard.press('p'); ok((await current()).i === 0, 'P in the list: the previous one');
  await page.keyboard.press('Shift+N'); ok((await current()).i === 1, '… N with Shift too');
  await next.focus(); await page.keyboard.press('Alt+ArrowDown'); ok((await current()).i === 0, 'Alt+↓ in the tab: the next change (round to the first)');
  await page.keyboard.press('Alt+ArrowUp'); ok((await current()).i === 1, 'Alt+↑: the previous one');
  await A.focus(); await page.keyboard.press('Alt+ArrowDown'); ok((await current()).i === 1 && (await A.inputValue()).startsWith('apple'), 'Alt+↓ in a text box is left to the text box');
  // a click picks a change
  await page.locator('.ds-hunk').first().click();
  ok((await current()).i === 0 && /^Change 1 of 2/.test(await counter.textContent()), 'a click on a change makes it the current one');
  await next.click(); ok((await current()).i === 1, '… and Next goes on from there');

  // ---- the lines of a change paired, the parts that differ marked
  ok(await set('a\nb\nc', 'a\nNEW\nb2\nc') && JSON.stringify(await lay()) === JSON.stringify(['=a', '|NEW', 'b|b2', '=c']), `a line put in above a changed one stands alone; the changed line beside what it became (${(await lay()).join(' · ')})`);
  ok(await set('function foo(a) {\n  return a + 1;\n}', 'function foo(a, b) {\n  // add b\n  return a + b;\n}'), 'a function changed');
  c = await cells();
  ok(JSON.stringify(c.map((r) => r.map((x) => x.marks))) === JSON.stringify([[[], [', b']], [[], []], [['1'], ['b']], [[], []]]) && c[1][0].k === 'none' && c[1][1].t === '  // add b',
    `… its first line beside its first line with ", b" marked, the comment alone, "1" and "b" marked in the return (${JSON.stringify(c.map((r) => r.map((x) => x.marks)))})`);
  ok((await counter.textContent()) === '1 change — Next goes to the first.', `one run of changes is one change: "${await counter.textContent()}"`);
  ok(await set('same\ntext', 'same\ntext') && (await counter.textContent()) === 'No changes to go through.' && await next.isDisabled() && await prev.isDisabled(), 'identical texts: nothing to go through, the buttons off');

  // ---- texts of GNU diff's reference pairs: the columns give both texts back, the counts are GNU diff's
  const some = REF.filter((x, i) => i % 5 === 0 && linesOf(x.a).length < 60), bad = [];
  for (const x of some) {
    await set(x.a, x.b);
    for (let k = 0; k < 20 && await page.locator('.ds-wrap .dl-fold').count(); k++) await page.locator('.ds-wrap .dl-fold').first().click();
    // the columns read cell by cell (an empty line is a cell with "", a missing one a hatched cell)
    const byCell = await page.evaluate(() => { const rows = [...document.querySelectorAll('.ds-wrap .ds-row:not(.ds-more)')]; const col = (i) => rows.map((r) => r.children[i]).filter((c) => !c.classList.contains('ds-none')).map((c) => c.children[2].textContent); return [col(0), col(1)]; });
    if (JSON.stringify(byCell) !== JSON.stringify([linesOf(x.a), linesOf(x.b)])) bad.push(`${JSON.stringify(x.a.slice(0, 30))}: the columns are not the two texts`);
    const want = x.added || x.removed ? new RegExp(`^${x.added} lines? added, ${x.removed} removed,`) : /identical|empty/;
    if (!want.test(await info.textContent())) bad.push(`${JSON.stringify(x.a.slice(0, 30))}: "${await info.textContent()}", GNU diff −${x.removed} +${x.added}`);
    const groups = await page.locator('.ds-hunk').count(), said = await counter.textContent();
    if (groups !== (Number(/^(\d+) changes?/.exec(said)?.[1] ?? (said.startsWith('No') ? 0 : -1)))) bad.push(`${groups} changes drawn, the counter says "${said}"`);
  }
  ok(some.length >= 25 && !bad.length, `${some.length} reference pairs: the left column is the original and the right one the changed text, the counts GNU diff's, the counter as many changes as are drawn ${bad.slice(0, 3).join(' | ')}`);

  // ---- the patch is the line view's
  await hookClipboard(page);
  const pa = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten', pb = 'one\n2\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\n';
  await set(pa, pb); await page.getByRole('button', { name: 'Copy as patch' }).click();
  await page.getByRole('radio', { name: 'Lines', exact: true }).click(); await page.waitForSelector('.dl'); await page.getByRole('button', { name: 'Copy as patch' }).click();
  const [p1, p2] = (await copied(page)).slice(-2);
  ok(p1 === p2 && p1.startsWith('--- original\n+++ changed\n@@ -1,5 +1,5 @@'), 'Copy as patch gives the same unified diff side by side as in the line view');
  ok(!(await page.locator('.ds-wrap, #diff-hunk').count()), 'the line view has no columns and no Previous / Next');
  await page.getByRole('radio', { name: 'Words', exact: true }).click(); await page.waitForSelector('.dw');
  ok(!(await page.locator('.ds-wrap, #diff-hunk').count()), '… nor the word view');
  await side(); await page.waitForSelector('.ds-row');
  ok((await counter.textContent()) === '2 changes — Next goes to the first.' && (await A.inputValue()) === pa, 'back side by side: the same texts, no change picked yet');
  const saved = await download(page, () => page.getByRole('button', { name: 'Download .patch' }).click());
  ok(readFileSync(saved, 'utf8') === p1, 'Download .patch side by side: the same patch');

  // ---- long texts: folded, and Next brings each change into the list's view
  const big = Array.from({ length: 8000 }, (_, i) => `row ${i}`), at = [5, 3000, 5000, 7994], big2 = big.map((l, i) => (at.includes(i) ? `${l} changed` : l));
  await setValue(A, big.join('\n')); await setValue(B, big2.join('\n'));
  ok(await until(page, () => document.querySelector('#diff-hunk')?.textContent === '4 changes — Next goes to the first.', null, 20000), `8,000 lines with four changes: "${await counter.textContent()}"`);
  // three lines beside each change; the five lines before the first and after the last are too few to fold
  ok(await page.locator('.ds-wrap .dl-fold').count() === 3 && await page.locator('.ds-wrap .ds-row').count() === 4 * 7 + 2 + 2, `the unchanged runs between them are folded, three lines beside each change (${await page.locator('.ds-wrap .ds-row').count()} rows)`);
  const seen = [];
  for (let k = 0; k < 5; k++) {
    await next.click();
    const where = await shown(), say = await counter.textContent();
    seen.push(`${(await current()).i}:${where || 'ok'}`);
    if (k === 1) ok(say === 'Change 2 of 4 — original line 3,001, changed line 3,001', `the words for the second change: "${say}"`);
  }
  ok(seen.join(' ') === '0:ok 1:ok 2:ok 3:ok 0:ok', `Next goes to each change in turn and round to the first, each one in the list's view below its names with the buttons in the window (${seen.join(' ')})`);
  await prev.click(); ok((await current()).i === 3 && !(await shown()), 'Previous from the first: the last one, in view');
  const folded = Number((/([\d,]+) unchanged lines/.exec(await page.locator('.ds-wrap .dl-fold').nth(1).textContent()) ?? [0, 'NaN'])[1].replace(/,/g, ''));
  await page.locator('.ds-wrap .dl-fold').nth(1).click();
  ok(folded === 1993 && await page.locator('.ds-wrap .ds-row').count() === 32 + 1993 && await page.locator('.ds-wrap .dl-fold').count() === 2, `a fold opens in place (${folded.toLocaleString('en-IN')} lines)`);
  await next.click(); ok((await current()).i === 0 && !(await shown()), '… and Previous / Next go on as before');
  // more lines than are drawn
  const all = Array.from({ length: 6000 }, (_, i) => `left ${i}`), allB = all.map((l, i) => `right ${i}`);
  await setValue(A, all.join('\n')); await setValue(B, allB.join('\n'));
  ok(await until(page, () => /first 5,000 lines/.test(document.querySelector('.diff-out')?.textContent || ''), null, 20000) && (await counter.textContent()) === '1 change — Next goes to the first.', `6,000 lines all changed: the first 5,000 drawn, said; one change (${await counter.textContent()})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- two files and a file on GitHub name the columns
  const work = mkdtempSync(join(tmpdir(), 'diffside-')), fa = join(work, 'old notes.txt'), fb = join(work, 'new notes.txt');
  writeFileSync(fa, OLD); writeFileSync(fb, NEW);
  await page.getByRole('radio', { name: 'Two files' }).click();
  await page.locator('.drop', { hasText: 'Original file' }).locator('input[type=file]').setInputFiles(fa);
  await page.locator('.drop', { hasText: 'Changed file' }).locator('input[type=file]').setInputFiles(fb);
  ok(await until(page, () => document.querySelectorAll('.ds-name')[1]?.textContent === 'new notes.txt', null, 15000) && JSON.stringify(await page.locator('.ds-name').allTextContents()) === '["old notes.txt","new notes.txt"]', 'two files: the columns carry their names');
  ok(JSON.stringify(await lay()) === JSON.stringify(['=alpha', '=beta', 'gamma|GAMMA', '=delta', '|epsilon']), `… and their lines (${(await lay()).join(' · ')})`);
  await page.route('https://raw.githubusercontent.com/**', (route) => {
    const [, owner, repo, ref, ...p] = new URL(route.request().url()).pathname.split('/'), body = owner === 'octo' && repo === 'demo' && p.join('/') === 'notes.txt' ? { [A_SHA]: OLD, [B_SHA]: NEW }[ref] : undefined;
    return route.fulfill(body === undefined ? { status: 404, body: '404: Not Found', headers: { 'access-control-allow-origin': '*' } } : { status: 200, body, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' } });
  });
  await page.route('https://api.github.com/**', (route) => {
    const m = /\/commits\/(.+)$/.exec(new URL(route.request().url()).pathname), sha = m && { main: B_SHA, 'v1.0': A_SHA, '1f0e3d2': A_SHA }[decodeURIComponent(m[1])];
    return route.fulfill({ status: sha ? 200 : 404, body: JSON.stringify(sha ? { sha } : { message: 'Not Found' }), headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } });
  });
  await page.getByRole('radio', { name: 'A file on GitHub' }).click();
  await page.getByLabel('Repository').fill('octo/demo'); await page.getByLabel('File').fill('notes.txt');
  await page.getByLabel('From commit').fill('v1.0'); await page.getByLabel('To commit').fill('main');
  await page.getByRole('button', { name: 'Compare' }).click();
  ok(await until(page, () => /^main/.test(document.querySelectorAll('.ds-name')[1]?.textContent || ''), null, 15000) && JSON.stringify(await page.locator('.ds-name').allTextContents()) === `["v1.0 (1f0e3d2)","main (9a8b7c6)"]`, `a file on GitHub: the columns carry the commits — a branch or a tag with its commit (${(await page.locator('.ds-name').allTextContents()).join(' | ')})`);
  await page.getByLabel('From commit').fill('1f0e3d2'); await page.getByRole('button', { name: 'Compare' }).click();
  ok(await until(page, () => document.querySelectorAll('.ds-name')[0]?.textContent === '1f0e3d2', null, 15000), '… a short hash as it is');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- WCAG 2.2 A / AA with a change picked: light and dark
  const code = 'function total(items) {\n  let sum = 0;\n  for (const item of items) {\n    sum += item.price;\n  }\n  return sum;\n}\n', code2 = 'function total(items, tax = 0) {\n  let sum = 0;\n  for (const item of items) {\n    // skip free items\n    if (!item.price) continue;\n    sum += item.price * item.count;\n  }\n  return sum * (1 + tax);\n}\n';
  const axe = async (p, what) => {
    await p.addScriptTag({ content: AXE });
    const v = await p.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${what}: no WCAG 2.2 A / AA violation side by side ${v.join(' | ')}`);
  };
  for (const scheme of ['light', 'dark']) {
    const p = await newPage({ viewport: { width: 1366, height: 900 }, bypassCSP: true, colorScheme: scheme }); // the CSP forbids the injected checker
    await p.goto(`${base}#/diff`); await p.getByLabel('Original', { exact: true }).waitFor();
    await setValue(p.getByLabel('Original', { exact: true }), code); await setValue(p.getByLabel('Changed', { exact: true }), code2);
    await p.getByRole('radio', { name: 'Side by side', exact: true }).click(); await p.waitForSelector('.ds-row');
    await p.getByRole('button', { name: 'Next change' }).click(); await p.getByRole('button', { name: 'Next change' }).click();
    ok(JSON.stringify(await lay(p)) === JSON.stringify(['function total(items) {|function total(items, tax = 0) {', '=  let sum = 0;', '=  for (const item of items) {', '|    // skip free items', '|    if (!item.price) continue;', '    sum += item.price;|    sum += item.price * item.count;', '=  }', '  return sum;|  return sum * (1 + tax);', '=}']), `${scheme}: the lines put in above the changed one stand alone (${(await lay(p)).length} rows)`);
    await axe(p, `PC, ${scheme} theme`);
  }

  // ---- a phone
  const ph = await newPage({ ...devices['iPhone 13'], bypassCSP: true, colorScheme: 'dark' });
  await ph.goto(`${base}#/diff`); await ph.getByLabel('Original', { exact: true }).waitFor();
  const long = Array.from({ length: 40 }, (_, i) => `a fairly long line of text number ${i} that has to wrap on a narrow screen`), long2 = long.map((l, i) => (i % 13 === 4 ? `${l}, and then some more words` : l));
  await setValue(ph.getByLabel('Original', { exact: true }), long.join('\n')); await setValue(ph.getByLabel('Changed', { exact: true }), long2.join('\n'));
  const seg = ph.getByRole('radio', { name: 'Side by side', exact: true }), segBox = await seg.boundingBox();
  await seg.tap(); await ph.waitForSelector('.ds-row');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && (() => { const p = document.querySelector('.ds-wrap'); return p.scrollWidth <= p.clientWidth + 1; })()), 'phone: no sideways scroll, in the page or in the list');
  const halves = await ph.evaluate(() => { const r = document.querySelector('.ds-row'), w = r.getBoundingClientRect().width; return [...r.children].map((c) => c.getBoundingClientRect().width / w); });
  ok(halves.length === 2 && halves.every((x) => x > 0.45 && x < 0.55), `phone: the two columns share the width (${halves.map((x) => x.toFixed(2)).join(', ')})`);
  ok(await ph.locator('.ds-row').first().evaluate((r) => r.getBoundingClientRect().height > 2.5 * parseFloat(getComputedStyle(r.children[0]).lineHeight || '16')), 'phone: a long line wraps inside its column');
  const nb = await ph.getByRole('button', { name: 'Next change' }).boundingBox(), pb2 = await ph.getByRole('button', { name: 'Previous change' }).boundingBox(), fold = await ph.locator('.ds-wrap .dl-fold').first().boundingBox();
  ok(segBox.height >= 44 && nb.height >= 44 && pb2.height >= 44 && fold.height >= 44, `phone: the choice, the buttons and the folds take a finger (${[segBox, nb, pb2, fold].map((b) => Math.round(b.height)).join(', ')} px)`);
  for (let k = 0; k < 3; k++) await ph.getByRole('button', { name: 'Next change' }).tap();
  ok((await ph.locator('#diff-hunk').textContent()).startsWith('Change 3 of 3') && !(await shown(ph)), `phone: Next by touch, the change in view with the buttons (${await ph.locator('#diff-hunk').textContent()}; ${await shown(ph) || 'in view'})`);
  await axe(ph, 'iPhone 13, dark theme');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
