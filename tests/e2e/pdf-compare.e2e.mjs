// PDF Compare (#/pdf-compare, PC + phones; potentials #15) end to end on tests/fixtures/compare (scripts/make-compare-pdfs.py):
// two versions of a supply agreement set differently (other size, width, line and page breaks; words broken with hyphens;
// curly against straight quotes; other running heads and page numbers) with ten edits. The tab must list exactly those ten,
// mark them on both versions' pages where MuPDF finds their words, go through them with Previous / Next (round and round, Alt+↑ /
// Alt+↓, N / P), scroll the two versions together, and save both PDFs with the changes as comments (read back by MuPDF) and the
// list as text. Then: capitals ignored, the two swapped, the second version scanned (read by the OCR), the first behind a
// password, leaving mid-comparison, WCAG 2.2 A / AA with the result in both themes, the phone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { phoneLayout } from './_phone.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/compare/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const norm = (s) => s.replace(/\s+/g, ' ').trim();

export default async ({ base, page: newPage, ok, tmp, devices }) => {
  const mupdf = await import('mupdf');
  const saved = async (page, click) => { const d = page.waitForEvent('download', { timeout: 120000 }); await click(); const dl = await d; const p = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(p); return [p, dl.suggestedFilename()]; };
  const choose = async (page, a, b) => {
    const inputs = page.locator('input[type=file]');
    if (a) { await inputs.nth(0).setInputFiles(F(a)); await page.waitForFunction((n) => document.querySelectorAll('.pc-info')[0]?.textContent?.startsWith(n), a, { timeout: 60000 }); }
    if (b) { await inputs.nth(1).setInputFiles(F(b)); await page.waitForFunction((n) => document.querySelectorAll('.pc-info')[1]?.textContent?.startsWith(n), b, { timeout: 60000 }); }
  };
  const compare = async (page, timeout = 120000) => {
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await page.waitForFunction(() => { const s = document.querySelector('.pc-summary')?.textContent || ''; return /change|same words/.test(s) && !document.querySelector('.pc-summary')?.closest('.card')?.hidden; }, null, { timeout });
    return norm(await page.locator('.pc-summary').innerText());
  };
  const items = (page) => page.locator('.pc-item').evaluateAll((els) => els.map((e) => ({ kind: e.querySelector('.pc-kind').textContent, was: e.querySelector('del')?.textContent ?? '', now: (e.querySelector('ins') || e.querySelector('.pc-moved'))?.textContent ?? '' })));

  // ---- the two versions compared on a PC
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/pdf-compare');
  await page.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  ok(!asked.some((u) => /mupdf|textkit-tokens|tesseract/.test(u)), 'nothing of MuPDF, the comparing engine or the OCR fetched as the tab opens');
  ok(await page.getByRole('button', { name: 'Compare', exact: true }).isDisabled(), 'Compare waits for both PDFs');
  await choose(page, 'v1.pdf', 'v2.pdf');
  ok(/^v1\.pdf: 3 pages$/.test(await page.locator('.pc-info').nth(0).innerText()) && /^v2\.pdf: 2 pages$/.test(await page.locator('.pc-info').nth(1).innerText()), 'each PDF named with its pages');
  ok(!asked.some((u) => /textkit-tokens/.test(u)), 'the comparing engine waits for Compare');
  const sum = await compare(page);
  ok(/^10 changes: 5 changed, 3 added, 1 removed, 1 moved · \d+ words added, \d+ removed$/.test(sum), `the summary (${sum})`);
  const got = await items(page);
  const want = TRUTH.edits.map((e) => ({ kind: e.kind[0].toUpperCase() + e.kind.slice(1), was: e.kind === 'moved' ? '' : e.was, now: e.now }));
  const missing = want.filter((w) => !got.some((g) => g.kind === w.kind && norm(g.was) === norm(w.was) && norm(g.now) === norm(w.now)));
  ok(got.length === 10 && !missing.length, `the list: the ten edits and nothing else${missing.length ? ` — missing ${JSON.stringify(missing)}` : ''}`);
  ok(/Only the words are compared/.test(await page.locator('.card', { hasText: 'Changes' }).first().innerText()), 'what is compared is said');

  // marks on the pages where MuPDF finds the words (the original's "thirty", the changed version's "sixty")
  const v1 = mupdf.Document.openDocument(readFileSync(F('v1.pdf')), 'application/pdf'), v2 = mupdf.Document.openDocument(readFileSync(F('v2.pdf')), 'application/pdf');
  const at = (doc, word) => { for (let i = 0; i < doc.countPages(); i++) { const h = doc.loadPage(i).search(word); if (h.length) { const q = h[0][0], b = doc.loadPage(i).getBounds(); return { page: i, x: (Math.min(q[0], q[4]) - b[0]) / (b[2] - b[0]) * 100, y: (Math.min(q[1], q[3]) - b[1]) / (b[3] - b[1]) * 100 }; } } return null; };
  const markAt = (side, i) => page.evaluate(([s, k]) => { const m = [...document.querySelectorAll(`.pc-side-${s}[data-c="${k}"]`)][0]; return m && { page: +m.closest('.pc-page').dataset.page, x: parseFloat(m.style.left), y: parseFloat(m.style.top) }; }, [side, i]);
  const thirtyIdx = got.findIndex((g) => g.was === 'thirty (30');
  const ma = await markAt('a', thirtyIdx), mb = await markAt('b', thirtyIdx), ta = at(v1, 'thirty'), tb = at(v2, 'sixty');
  ok(ma && ta && ma.page === ta.page && Math.abs(ma.x - ta.x) < 1 && Math.abs(ma.y - ta.y) < 1, `the original: “thirty (30” marked where MuPDF finds it (${JSON.stringify(ma)} / ${JSON.stringify(ta)})`);
  ok(mb && tb && mb.page === tb.page && Math.abs(mb.x - tb.x) < 1 && Math.abs(mb.y - tb.y) < 1, `the changed version: “sixty (60” marked where MuPDF finds it`);
  await page.waitForFunction(() => document.querySelectorAll('.pc-page canvas').length >= 2, null, { timeout: 60000 });
  ok(await page.evaluate(() => [...document.querySelectorAll('.pc-page')].filter((p) => p.querySelector('canvas')).length >= 2), 'the pages drawn as they come into view');

  // ---- going through the changes
  const counter = () => page.locator('.pc-count').innerText();
  ok(/^10 changes — Next goes to the first\.$/.test(await counter()), 'before the first: “10 changes — Next goes to the first.”');
  await page.getByRole('button', { name: 'Next change', exact: true }).click();
  ok(/^Change 1 of 10 — /.test(await counter()) && await page.locator('.pc-item[aria-current]').getAttribute('data-i') === '0', `Next: change 1, its item current (${await counter()})`);
  const inView = (side) => page.evaluate((s) => { const m = document.querySelector(`.pc-mark.cur.pc-side-${s}`), col = m?.closest('.pc-col'); if (!m || !col) return false; const r = m.getBoundingClientRect(), c = col.getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom; }, side);
  for (let k = 0; k < 4; k++) await page.getByRole('button', { name: 'Next change', exact: true }).click();
  ok(/^Change 5 of 10/.test(await counter()) && await inView('a') && await inView('b'), 'change 5: its marks in view in both columns');
  const fifth = await page.evaluate(() => document.querySelectorAll('.pc-mark.cur').length);
  ok(fifth >= 2, `the current change’s marks outlined on both sides (${fifth})`);
  for (let k = 0; k < 6; k++) await page.getByRole('button', { name: 'Next change', exact: true }).click();
  ok(/^Change 1 of 10/.test(await counter()), 'round and round: Next on the last goes to the first');
  await page.keyboard.press('Alt+ArrowUp');
  ok(/^Change 10 of 10/.test(await counter()), 'Alt+↑: Previous on the first goes to the last');
  await page.locator('.pc-list').focus(); await page.keyboard.press('n');
  ok(/^Change 1 of 10/.test(await counter()), 'N in the list: the next change');
  await page.keyboard.press('p');
  ok(/^Change 10 of 10/.test(await counter()), 'P in the list: the previous change');
  await page.locator('.pc-item').nth(3).click();
  ok(/^Change 4 of 10/.test(await counter()), 'a click on an item makes it the current change');

  // ---- the two scrolled together: the original's last page brought to the top of its column; the words at its top stand at
  // the same height in the changed version's column
  await page.evaluate(() => { const col = document.querySelectorAll('.pc-col')[0], pages = col.querySelectorAll('.pc-page'); col.scrollTop = pages[pages.length - 1].offsetTop + 40; });
  await page.waitForTimeout(600);
  const cols = await page.evaluate(() => [...document.querySelectorAll('.pc-col')].map((c) => ({ top: c.scrollTop, pages: [...c.querySelectorAll('.pc-page')].map((p) => [p.offsetTop, p.clientHeight]) })));
  const lineAt = (doc, col) => { // the first line whose top is in view, its words and where it stands in the column
    const p = col.pages.findIndex(([t, hh]) => t + hh > col.top), pg = doc.loadPage(p), b = pg.getBounds(), [t, hh] = col.pages[p];
    const y = b[1] + ((col.top - t) / hh) * (b[3] - b[1]);
    const lines = []; let cur = null;
    pg.toStructuredText().walk({ beginLine: () => { cur = { text: '', y: Infinity }; lines.push(cur); }, onChar: (c, _o, _f, _s, q) => { cur.text += c; cur.y = Math.min(cur.y, q[1]); } });
    const l = lines.filter((x) => x.y >= y && /\p{L}{3}/u.test(x.text)).sort((m, n) => m.y - n.y)[0];
    return { page: p, text: l.text, y: t + ((l.y - b[1]) / (b[3] - b[1])) * hh - col.top };
  };
  const top1 = lineAt(v1, cols[0]);
  const phrase = top1.text.replace(/-$/, '').split(/\s+/).filter((w) => /^\p{L}+$/u.test(w)).slice(0, 3).join(' ');
  let off2 = null;
  for (let i = 0; i < v2.countPages() && off2 === null; i++) {
    const hit = v2.loadPage(i).search(phrase)[0]; if (!hit) continue;
    const b = v2.loadPage(i).getBounds(), [t, hh] = cols[1].pages[i];
    off2 = t + ((Math.min(hit[0][1], hit[0][3]) - b[1]) / (b[3] - b[1])) * hh - cols[1].top;
  }
  ok(cols[0].top > 0 && cols[1].top > 0 && off2 !== null && Math.abs(off2 - top1.y) < 14, `scrolling the original scrolls the changed version with it: “${phrase}” ${Math.round(top1.y)} px below the top of one, ${off2 === null ? '—' : Math.round(off2)} px below the top of the other`);

  // ---- the downloads: both PDFs with the changes as comments, the list
  const [pb, nb] = await saved(page, () => page.getByRole('button', { name: 'Changed PDF, marked', exact: true }).click());
  const db = mupdf.Document.openDocument(readFileSync(pb), 'application/pdf').asPDF();
  const ann = (d) => { const out = []; for (let i = 0; i < d.countPages(); i++) for (const a of d.loadPage(i).getAnnotations()) out.push([a.getType(), a.getContents()]); return out; };
  const ab = ann(db);
  ok(nb === 'v2-compared.pdf' && ab.length >= 10 && ab.some(([t, c]) => t === 'Highlight' && c === 'Was: “thirty (30”') && ab.some(([t, c]) => t === 'Caret' && /^Removed: “, including weekends/.test(c)) && ab.some(([t, c]) => t === 'Highlight' && /^Moved from page 2/.test(c)), `the changed PDF, marked: ${ab.length} comments — highlights with what was there, a caret where words were taken out, the move`);
  ok(db.loadPage(0).toStructuredText().asText() === v2.loadPage(0).toStructuredText().asText(), 'its text as it was');
  const [pa, na] = await saved(page, () => page.getByRole('button', { name: 'Original PDF, marked', exact: true }).click());
  const aa = ann(mupdf.Document.openDocument(readFileSync(pa), 'application/pdf').asPDF());
  ok(na === 'v1-compared.pdf' && aa.some(([t, c]) => t === 'StrikeOut' && c === 'Now: “sixty (60”') && aa.some(([t, c]) => t === 'Caret' && /^Added: “The Supplier shall keep/.test(c)), `the original, marked: ${aa.length} comments — struck through with what is there now, carets where words were added`);
  const [pt, nt] = await saved(page, () => page.getByRole('button', { name: 'Save the list (.txt)', exact: true }).click());
  const txt = readFileSync(pt, 'utf8');
  ok(nt === 'v2-changes.txt' && /^PDF Compare — v1\.pdf → v2\.pdf\r\n10 changes/.test(txt) && /Changed: “thirty \(30” → “sixty \(60”/.test(txt), 'the list saved as text');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- capitals ignored; the two swapped
  await page.getByText('Capitals and small letters are the same').click();
  const sum2 = await compare(page);
  ok(/^9 changes/.test(sum2) && !(await items(page)).some((g) => g.was === 'agreement'), `capitals ignored: 9 changes, “agreement” → “Agreement” gone (${sum2})`);
  await page.getByText('Capitals and small letters are the same').click();
  await page.getByRole('button', { name: 'Swap', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.pc-info')[0]?.textContent?.startsWith('v2.pdf'), null, { timeout: 30000 });
  const sum3 = await compare(page);
  ok(/^10 changes: 5 changed, 1 added, 3 removed, 1 moved/.test(sum3), `swapped: what was added is removed (${sum3})`);
  await page.getByRole('button', { name: 'Swap', exact: true }).click();

  // ---- the second version scanned: read by the OCR
  await choose(page, null, 'v2-scan.pdf');
  ok(/2 pages are pictures without text \(scanned\): read by the OCR/.test(await page.locator('.pc-info').nth(1).innerText()), 'a scanned PDF said: read by the OCR');
  const sum4 = await compare(page, 400000);
  // the OCR may read a word or a space otherwise (a moved paragraph then moved "with small changes"): the moved one by its words
  const alike = (x, y) => { const a = x.split(/\W+/), b = new Set(y.split(/\W+/)); return a.filter((w) => b.has(w)).length >= 0.9 * a.length; };
  const got4 = await items(page), missing4 = want.filter((w) => !got4.some((g) => g.kind === w.kind && (w.kind === 'Moved' ? alike(g.now, w.now) : norm(g.was) === norm(w.was) && norm(g.now) === norm(w.now))));
  ok(!missing4.length && got4.length <= 13, `the scanned changed version: the ten edits found (${sum4}${missing4.length ? ` — missing ${JSON.stringify(missing4)} — got ${JSON.stringify(got4)}` : ''})`);
  ok(/page’?s? 1, 2 are scans and were read by the OCR/.test(await page.locator('.card', { hasText: 'Changes' }).first().innerText()), 'the OCR’s pages named in the notes');

  // ---- the first behind a password
  await page.locator('input[type=file]').nth(0).setInputFiles(F('v1-locked.pdf'));
  await page.getByPlaceholder('Password').fill('compare1');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.pc-info')[0]?.textContent?.startsWith('v1-locked.pdf'), null, { timeout: 60000 });
  await choose(page, null, 'v2.pdf');
  const sum5 = await compare(page);
  ok(/^10 changes/.test(sum5), `a PDF behind a password: asked for, then compared (${sum5})`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- leaving mid-comparison (the OCR at work)
  const lv = await newPage();
  await lv.goto(base + '#/pdf-compare'); await lv.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await choose(lv, 'v1.pdf', 'v2-scan.pdf');
  await lv.getByRole('button', { name: 'Compare', exact: true }).click();
  await lv.waitForTimeout(2500);
  await lv.goto(base + '#/qr'); await lv.waitForTimeout(1500);
  ok(!lv.errors.length, `leaving the tab while it reads: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with the result, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/pdf-compare');
    await ax.locator('input[type=file]').first().waitFor({ state: 'attached' });
    await choose(ax, 'v1.pdf', 'v2.pdf');
    await compare(ax);
    await ax.getByRole('button', { name: 'Next change', exact: true }).click();
    await ax.waitForFunction(() => !document.getAnimations().length);
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, with the result: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone: one version at a time
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'pdf-compare', { ready: '.card', buttons: ['Compare'], before: async (p) => { await choose(p, 'v1.pdf', 'v2.pdf'); } });
  ok(await ph.evaluate(() => getComputedStyle(document.querySelector('.actions')).position === 'fixed'), 'phone: Compare in the bar at the bottom');
  await compare(ph);
  const sides = () => ph.evaluate(() => [...document.querySelectorAll('.pc-side')].map((s) => !s.hidden));
  ok(JSON.stringify(await sides()) === '[false,true]', 'phone: the changed version shown');
  await ph.getByRole('radio', { name: 'Original', exact: true }).click();
  ok(JSON.stringify(await sides()) === '[true,false]', 'phone: “Original” shows the original instead');
  await ph.getByRole('button', { name: 'Next change', exact: true }).click();
  ok(/^Change 1 of 10/.test(await ph.locator('.pc-count').innerText()) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: Next works, nothing runs off the side');
  const tall = await ph.locator('.pc-item').first().boundingBox();
  ok(tall && tall.height >= 44, `phone: a change in the list is a 44 px target (${tall && Math.round(tall.height)})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.slice(0, 2).join(' | ')}`);
};
