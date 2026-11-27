// EPUB Reader (#/ebook, PC + phones; potentials #71): the tab end to end on the books of scripts/make-ebooks.py. What the
// tab shows is held to MuPDF in Node laying out the same book at the same size with the same look (the tab's engine,
// src/lib/ebook.ts, loaded through Vite): the pages, their count, the contents, the search's hits, the links. The keys,
// the slider, Go to page, Back, the panels (contents, search, look), the place kept when the look or the window changes,
// reading mode, selecting with the mouse and copying, Read aloud into the Text-to-Speech tab and back, every format
// (MOBI, FictionBook, text, a comic — CBZ, and CB7 through 7-Zip), DRM and other refusals, a script no font draws;
// phones: taps at the sides, a swipe, a long press on a word, the look as a sheet, the layout.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const B = (n) => fileURLToPath(new URL(`../fixtures/ebooks/${n}`, import.meta.url));
const A = (n) => fileURLToPath(new URL(`../fixtures/archives/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(new URL('../fixtures/ebooks/index.json', import.meta.url), 'utf8'));
const NM = (...p) => new Uint8Array(readFileSync(new URL(`../../node_modules/${p.join('/')}`, import.meta.url)));

export default async ({ base, page: newPage, ok, devices, tmp }) => {
  // ---- the engine in Node, as the tab's worker runs it
  const { createServer } = await import('vite');
  const vite = await createServer({ root: fileURLToPath(new URL('../..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const E = await vite.ssrLoadModule('/src/lib/ebook.ts');
  await vite.close();
  const m = await import('mupdf');
  m.setLog({ warning: () => {}, error: () => {} });
  const files = {
    literata: ['400Regular', '400Regular_Italic', '700Bold', '700Bold_Italic'].map((s) => NM('@expo-google-fonts', 'literata', s, `Literata_${s}.ttf`)),
    noto: [['400Regular', 'NotoSans_400Regular'], ['700Bold', 'NotoSans_700Bold'], ['400Regular_Italic', 'NotoSans_400Regular_Italic']].map(([d, f]) => NM('@expo-google-fonts', 'noto-sans', d, `${f}.ttf`)),
  };
  m.installLoadFontFunction(E.fontHook(m, files, new Set()));
  /** the book as the tab has it now: laid out at the stage's size with the tab's look */
  const node = async (page, name, look) => {
    const [w, h] = (await page.locator('.ebr-stage').getAttribute('data-layout')).split('x').map(Number);
    const o = E.openFile(new Uint8Array(readFileSync(B(name))), name), doc = E.openDoc(m, o);
    E.layOut(doc, o.kind, look, w, h);
    return { doc, w, h, contents: E.contents(doc) };
  };
  const PC_LOOK = { font: 'literata', size: 20, line: 1.5, justify: true, theme: 'light', publisher: true };

  // ---- helpers on a page
  const where = (p) => p.locator('.ebr-where').innerText();
  const waitWhere = (p, re, timeout = 30000) => p.waitForFunction((src) => new RegExp(src).test(document.querySelector('.ebr-where')?.textContent || ''), re.source, { timeout });
  const shownPages = async (p) => { const t = await where(p), r = /^Pages? (\d+)(?:–(\d+))? of (\d+)/.exec(t); return r ? { first: +r[1] - 1, last: (+(r[2] || r[1])) - 1, of: +r[3] } : null; };
  const placed = async (p) => JSON.parse((await p.locator('.ebr-stage').getAttribute('data-placed')) || '[]');
  const srText = (p) => p.locator('#ebr-text').textContent();
  const flat = (s) => s.replace(/­/g, '').replace(/\s+/g, ' ').trim();
  /** the pixels of the page canvas (CSS px at device scale 1) */
  const pixels = (p, x, y, w, h) => p.evaluate(([x, y, w, h]) => Array.from(document.querySelector('.ebr-page').getContext('2d').getImageData(x, y, w, h).data), [x, y, w, h]);
  const marksAt = (p, x, y, w, h) => p.evaluate(([x, y, w, h]) => { const d = document.querySelector('.ebr-marks').getContext('2d').getImageData(x, y, w, h).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; }, [x, y, w, h]);
  const hex = (s) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16));
  const open = async (p, file, re = /^Pages? \d+/) => { await p.locator('input[type=file]').first().setInputFiles(file); await waitWhere(p, re); await p.waitForTimeout(250); };
  const tool = (p, name) => p.locator('.ebr-tools').getByRole('button', { name });
  const stageBox = async (p) => p.locator('.ebr-stage').boundingBox();

  // ======================================================================================= PC
  const pc = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const fetched = [];
  pc.on('request', (r) => fetched.push(r.url()));
  await pc.goto(base + '#/ebook');
  await pc.getByText('Choose an e-book').waitFor();
  await pc.waitForTimeout(400);
  ok(!fetched.some((u) => /mupdf|ebook\.worker|\.wasm$|vendor\/fonts/.test(u)), 'nothing heavy is fetched before a book is chosen');

  // ---- the novel: two pages side by side on a wide window
  await open(pc, B('novel.epub'));
  let N = await node(pc, 'novel.epub', PC_LOOK);
  let sp = await shownPages(pc);
  ok(sp && sp.first === 0 && sp.last === 1 && sp.of === N.doc.countPages(), `two pages side by side, as many as MuPDF makes at this size in Node (${await where(pc)} against ${N.doc.countPages()})`);
  ok((await pc.locator('.ebr-title').innerText()).replace(/\s+/g, ' ') === 'The Lighthouse Almanac · Ines Farrow', 'the title and author above the page');
  ok(['Literata_400Regular', 'Literata_400Regular_Italic', 'Literata_700Bold', 'Literata_700Bold_Italic'].every((f) => fetched.some((u) => u.endsWith(`vendor/fonts/${f}.ttf`))) && !fetched.some((u) => /NotoSans_/.test(u)), 'Literata fetched with the first book (and not Noto Sans)');
  await pc.keyboard.press('ArrowRight');
  await waitWhere(pc, /^Pages 3–4 /);
  {
    const pl = await placed(pc), left = pl.find((x) => x.i === 2);
    const img = E.drawPage(m, N.doc, 2, 1, E.THEMES.light.bg);
    const got = await pixels(pc, Math.round(left.x), Math.round(left.y), img.w, img.h);
    let diff = 0; for (let i = 0; i < got.length; i += 4) diff += Math.abs(got[i] - img.rgba[i]) + Math.abs(got[i + 1] - img.rgba[i + 1]) + Math.abs(got[i + 2] - img.rgba[i + 2]);
    diff /= (got.length / 4) * 3;
    ok(diff < 1, `page 3 on the screen is MuPDF's page 3 laid out in Node at the same size (mean difference ${diff.toFixed(2)} of 255)`);
    ok(flat(await srText(pc)).startsWith(flat(E.pageText(N.doc, 2)).slice(0, 60)), 'the page’s text is there for screen readers');
  }
  await pc.keyboard.press('End'); await waitWhere(pc, new RegExp(`–${N.doc.countPages()} of ${N.doc.countPages()} `));
  sp = await shownPages(pc);
  ok(sp.last === N.doc.countPages() - 1, `End: the last pages (${await where(pc)})`);
  await pc.keyboard.press('Home'); await waitWhere(pc, /^Pages 1–2 /);
  await pc.keyboard.press('PageDown'); await waitWhere(pc, /^Pages 3–4 /);
  await pc.keyboard.press('Shift+Space'); await waitWhere(pc, /^Pages 1–2 /);
  ok(true, 'Home, PageDown and Shift+Space turn the pages');
  await pc.locator('.ebr-slider').evaluate((el) => { el.value = '21'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await waitWhere(pc, /^Pages 21–22 /);
  ok(true, 'the slider goes to a page (page 21: the spread of 21 and 22)');

  // ---- contents, Back, Go to page
  await tool(pc, 'Contents and go to a page').click();
  const items = pc.locator('dialog.ebr-panel .ebr-toc-item');
  const titles = await items.evaluateAll((els) => els.map((e) => e.querySelector('.ebr-toc-t').textContent));
  ok(JSON.stringify(titles) === JSON.stringify(TRUTH['novel.epub'].contents.map((e) => e.title)), `the contents, as the book’s nav lists them (${titles.length})`);
  const pagesListed = await items.evaluateAll((els) => els.map((e) => +e.querySelector('.ebr-toc-p').textContent - 1));
  ok(JSON.stringify(pagesListed) === JSON.stringify(N.contents.map((e) => e.page)), `each entry with its page, as MuPDF lays the book out (${pagesListed})`);
  const ch4 = N.contents.find((e) => e.title.startsWith('Chapter 4'));
  await items.filter({ hasText: 'Chapter 4. Zephyrine' }).click();
  await waitWhere(pc, /Chapter 4\. Zephyrine/);
  sp = await shownPages(pc);
  ok(sp.first <= ch4.page && sp.last >= ch4.page, `a chapter of the contents opens on its page (${await where(pc)}; Node: page ${ch4.page + 1})`);
  ok(await pc.getByRole('button', { name: /^Back to page 21$/ }).isVisible(), '“Back to page 21” after a jump');
  await pc.getByRole('button', { name: /^Back to page 21$/ }).click();
  await waitWhere(pc, /^Pages 21–22 /);
  ok(!(await pc.getByRole('button', { name: /^Back to page/ }).isVisible()), 'Back goes back, and goes away');
  await tool(pc, 'Contents and go to a page').click();
  await pc.getByLabel('Page number').fill('10');
  await pc.getByLabel('Page number').press('Enter');
  await waitWhere(pc, /^Pages 9–10 /);
  ok(true, 'Go to page 10 (the spread of 9 and 10)');

  // ---- search
  await tool(pc, 'Search in the book').click();
  await pc.getByRole('searchbox', { name: 'Words to find in the book' }).fill('zephyrine');
  await pc.getByRole('searchbox', { name: 'Words to find in the book' }).press('Enter');
  await pc.locator('dialog.ebr-panel').getByText(/^4 places found/).waitFor({ timeout: 30000 });
  const hitsNode = []; for (let i = 0; i < N.doc.countPages(); i++) hitsNode.push(...E.searchPage(N.doc, i, 'zephyrine'));
  const hitRows = pc.locator('dialog.ebr-panel .ebr-hit');
  ok(await hitRows.count() === 4, '“zephyrine”: 4 places, as in Node');
  const order = (await hitRows.evaluateAll((els) => els.map((e) => +e.querySelector('.ebr-hit-p').textContent.slice(3) - 1)));
  ok(JSON.stringify([...order].sort((a, b) => a - b)) === JSON.stringify(hitsNode.map((x) => x.page)), `…on the pages Node finds them (${order})`);
  ok((await hitRows.nth(0).locator('mark').innerText()).toLowerCase() === 'zephyrine', 'each place with its word marked in the line around it');
  const pick = hitsNode.find((x) => x.page !== ch4.page) || hitsNode[1];
  await hitRows.filter({ hasText: `p. ${pick.page + 1}` }).first().click();
  await waitWhere(pc, new RegExp(`(Page ${pick.page + 1}|Pages ${pick.page + 1}–|–${pick.page + 1} )`));
  {
    const pl = (await placed(pc)).find((x) => x.i === pick.page), q = pick.quads[0];
    const x0 = Math.round(pl.x + Math.min(q[0], q[4])), y0 = Math.round(pl.y + Math.min(q[1], q[3]));
    ok(await marksAt(pc, x0, y0, Math.max(4, Math.round(Math.abs(q[2] - q[0]))), Math.max(4, Math.round(Math.abs(q[5] - q[1])))) > 10, 'the place found is marked on the page');
  }

  // ---- the look: dark, bigger text, the place kept, the font, one page
  {
    const before = flat(await srText(pc)).slice(0, 40);
    await tool(pc, 'Font, size, margins and theme').click();
    const dlg = pc.locator('dialog.ebr-panel');
    await dlg.getByRole('radio', { name: /Dark/ }).click();
    await pc.waitForFunction(() => document.querySelector('.ebr-stage').style.background !== '' && /31, 32, 35/.test(getComputedStyle(document.querySelector('.ebr-stage')).backgroundColor), null, { timeout: 15000 });
    await pc.waitForTimeout(400);
    ok(JSON.stringify((await pixels(pc, 5, 5, 1, 1)).slice(0, 3)) === JSON.stringify(hex(E.THEMES.dark.bg)), 'Dark: the page is the theme’s colour');
    const n0 = (await shownPages(pc)).of;
    for (let k = 0; k < 3; k++) await dlg.getByRole('button', { name: 'Larger text' }).click();
    ok(await dlg.locator('.ebr-size').innerText() === '26 px', 'three steps larger: 26 px');
    await pc.waitForFunction((n) => { const t = document.querySelector('.ebr-where')?.textContent || ''; const r = / of (\d+)/.exec(t); return r && +r[1] > n; }, n0, { timeout: 20000 });
    await pc.waitForTimeout(500);
    const now = flat(await srText(pc));
    const N2 = await node(pc, 'novel.epub', { ...PC_LOOK, theme: 'dark', size: 26 });
    const s2 = await shownPages(pc);
    const near = flat(E.pageText(N2.doc, s2.first) + ' ' + E.pageText(N2.doc, Math.min(s2.first + 2, N2.doc.countPages() - 1)));
    ok(s2.of === N2.doc.countPages() && near.includes(before.slice(0, 30)), `larger text: more pages (${n0} → ${s2.of}), and the words the reader was at are still in view (“${before.slice(0, 30)}…”, ${await where(pc)})`);
    await dlg.getByRole('combobox', { name: 'Font' }).selectOption('sans');
    await pc.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /NotoSans_400Regular\.ttf$/.test(r.name)), null, { timeout: 20000 }).catch(() => {});
    await pc.waitForTimeout(800);
    ok(fetched.some((u) => /vendor\/fonts\/NotoSans_400Regular\.ttf$/.test(u)), 'Sans: Noto Sans fetched when chosen');
    await dlg.getByRole('radio', { name: 'One page' }).click();
    await waitWhere(pc, /^Page \d+ of /);
    ok(/^Page \d+ of \d+/.test(await where(pc)), `one page at a time when chosen (${await where(pc)})`);
    await dlg.getByRole('radio', { name: /Light/ }).click();
    await dlg.getByRole('combobox', { name: 'Font' }).selectOption('literata');
    await dlg.getByRole('radio', { name: 'On a wide window' }).click();
    for (let k = 0; k < 3; k++) await dlg.getByRole('button', { name: 'Smaller text' }).click();
    await pc.keyboard.press('Escape');
    await waitWhere(pc, /^Pages \d+–\d+ of /);
    await pc.waitForTimeout(600);
    N = await node(pc, 'novel.epub', PC_LOOK);
    ok((await shownPages(pc)).of === N.doc.countPages(), 'back to the first look: the same pages as at first');
  }

  // ---- a narrower window: laid out again, the place kept
  {
    const before = flat(await srText(pc)).slice(0, 36);
    await pc.setViewportSize({ width: 820, height: 900 });
    await pc.waitForFunction(() => /^Page \d+ of/.test(document.querySelector('.ebr-where')?.textContent || ''), null, { timeout: 20000 });
    await pc.waitForTimeout(600);
    const s = await shownPages(pc), N3 = await node(pc, 'novel.epub', PC_LOOK);
    const near = flat(E.pageText(N3.doc, s.first) + ' ' + E.pageText(N3.doc, Math.min(s.first + 1, N3.doc.countPages() - 1)));
    ok(s.of === N3.doc.countPages() && near.includes(before.slice(0, 28)), `a narrower window: one page, laid out again, the reader’s words in view (${await where(pc)})`);
    await pc.setViewportSize({ width: 1366, height: 900 });
    await waitWhere(pc, /^Pages \d+–\d+ of /);
    await pc.waitForTimeout(600);
  }

  // ---- links: the footnote's number, back, the web
  {
    let link = null, from = -1;
    for (let i = ch4.page; i < N.doc.countPages() && !link; i++) { const ls = E.linksOf(N.doc, i); const f = ls.find((l) => l.page !== undefined); if (f) { link = f; from = i; } }
    await tool(pc, 'Contents and go to a page').click();
    await pc.getByLabel('Page number').fill(String(from + 1));
    await pc.getByLabel('Page number').press('Enter');
    await pc.waitForTimeout(500);
    const pl = (await placed(pc)).find((x) => x.i === from), box = await stageBox(pc);
    await pc.mouse.click(box.x + pl.x + (link.rect[0] + link.rect[2]) / 2, box.y + pl.y + (link.rect[1] + link.rect[3]) / 2);
    await pc.waitForTimeout(500);
    const s = await shownPages(pc);
    ok(s.first <= link.page && s.last >= link.page, `a link inside the book goes to its page (${await where(pc)}; Node: ${link.page + 1})`);
    ok(await pc.getByRole('button', { name: `Back to page ${from + 1}` }).isVisible() || await pc.getByRole('button', { name: `Back to page ${from}` }).isVisible(), 'Back returns to the page of the link');
    await pc.getByRole('button', { name: /^Back to page/ }).click();
    await pc.waitForTimeout(400);
    let web = null, wf = -1;
    for (let i = ch4.page; i < N.doc.countPages() && !web; i++) { const f = E.linksOf(N.doc, i).find((l) => l.uri); if (f) { web = f; wf = i; } }
    await pc.context().route('https://example.com/**', (r) => r.fulfill({ body: 'ok', contentType: 'text/plain' }));
    const pl2 = (await placed(pc)).find((x) => x.i === wf);
    const pop = pc.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
    if (pl2) await pc.mouse.click(box.x + pl2.x + (web.rect[0] + web.rect[2]) / 2, box.y + pl2.y + (web.rect[1] + web.rect[3]) / 2);
    const popup = await pop;
    ok(popup && popup.url() === TRUTH['novel.epub'].web, `a link to the web opens in a new tab (${popup && popup.url()})`);
    if (popup) await popup.close();
  }

  // ---- selecting with the mouse, and Copy
  {
    const s = await shownPages(pc), i = s.first;
    const lines = JSON.parse(N.doc.loadPage(i).toStructuredText('preserve-whitespace').asJSON()).blocks.flatMap((b) => b.lines || []).filter((l) => l.text.trim().length > 20);
    const a = lines[1], b = lines[3], pl = (await placed(pc)).find((x) => x.i === i), box = await stageBox(pc);
    await pc.mouse.move(box.x + pl.x + a.bbox.x + 2, box.y + pl.y + a.bbox.y + a.bbox.h / 2);
    await pc.mouse.down();
    for (const k of [0.3, 0.6, 1]) await pc.mouse.move(box.x + pl.x + a.bbox.x + 2 + k * (b.bbox.x + b.bbox.w - 2 - a.bbox.x - 2), box.y + pl.y + a.bbox.y + a.bbox.h / 2 + k * (b.bbox.y - a.bbox.y), { steps: 3 });
    await pc.mouse.up();
    await pc.locator('.ebr-selbar').waitFor({ state: 'visible', timeout: 10000 });
    await pc.locator('.ebr-selbar').getByRole('button', { name: 'Copy' }).click();
    await pc.waitForTimeout(300);
    const got = flat(await pc.evaluate(() => navigator.clipboard.readText()));
    const want = E.selectText(N.doc, i, [a.bbox.x + 2, a.bbox.y + a.bbox.h / 2], [b.bbox.x + b.bbox.w - 2, b.bbox.y + b.bbox.h / 2]).text;
    ok(got.length > 40 && got === flat(want), `a drag selects the lines and Copy puts them on the clipboard (“${got.slice(0, 50)}…”)`);
    ok(await marksAt(pc, Math.round(pl.x + a.bbox.x + 4), Math.round(pl.y + a.bbox.y + 2), 40, 8) > 20, 'the selection is marked on the page');
    await pc.keyboard.press('Escape');
    ok(await pc.locator('.ebr-selbar').isHidden(), 'Escape clears the selection');
  }

  // ---- reading mode
  await tool(pc, 'Reading mode (the book fills the screen)').click();
  await pc.waitForTimeout(800);
  {
    const r = await pc.locator('.ebr').boundingBox();
    ok(await pc.locator('.ebr').evaluate((e) => e.classList.contains('ebr-full')) && r.width >= 1360 && r.height >= 890, `reading mode: the reader fills the screen (${Math.round(r.width)}×${Math.round(r.height)})`);
    await pc.keyboard.press('ArrowRight');
    await pc.waitForTimeout(300);
    await pc.keyboard.press('Escape');
    await pc.waitForTimeout(800);
    ok(!(await pc.locator('.ebr').evaluate((e) => e.classList.contains('ebr-full'))), 'Escape leaves reading mode');
  }

  // ---- Read aloud: the Text-to-Speech tab gets the text from this page on; coming back opens the book where it was
  {
    const s = await shownPages(pc), first = flat(E.pageText(N.doc, s.first)).slice(0, 40);
    await tool(pc, 'Read aloud from this page (Text-to-Speech)').click();
    await pc.waitForFunction(() => location.hash === '#/tts', null, { timeout: 10000 });
    await pc.waitForTimeout(800);
    const tts = flat(await pc.locator('textarea').first().inputValue());
    ok(tts.startsWith(first), `Read aloud: the Text-to-Speech tab has the text from this page on (“${tts.slice(0, 40)}…”)`);
    const live = await pc.evaluate(() => globalThis.__superutilsLive());
    ok(!live.resources.includes('ebook-worker'), 'leaving the tab ended the reader’s worker');
    await pc.evaluate(() => { location.hash = '#/ebook'; });
    const again = pc.getByRole('button', { name: /^Go back to “The Lighthouse Almanac” — page \d+ of \d+$/ });
    await again.waitFor({ timeout: 10000 });
    ok((await again.innerText()).includes(`page ${s.first + 1} of`), `back in the tab: “Go back to …” with the page (${await again.innerText()})`);
    await again.click();
    await waitWhere(pc, new RegExp(`^Pages ${s.first + 1}–`));
    ok(true, 'the book reopens at the same page');
  }

  // ---- other kinds of book
  await tool(pc, 'Close the book').click();
  await open(pc, B('book.mobi'));
  ok((await pc.locator('.ebr-title').innerText()).replace(/\s+/g, ' ') === 'The Harbour Log · Ines Farrow', 'MOBI: title and author from the file’s EXTH header');
  await open(pc, B('tale.fb2'));
  ok((await pc.locator('.ebr-title').innerText()).replace(/\s+/g, ' ') === 'The Shore Tale · Lena Holm', 'FictionBook: title and author');
  await open(pc, B('plain.txt'));
  await tool(pc, 'Contents and go to a page').click();
  const txtToc = await pc.locator('dialog.ebr-panel .ebr-toc-t').allInnerTexts();
  ok(JSON.stringify(txtToc) === JSON.stringify(['THE QUIET SHORE', 'CHAPTER I.', 'CHAPTER II.']), `plain text: its chapter lines are the contents (${txtToc})`);
  await pc.keyboard.press('Escape');
  await open(pc, B('comic.cbz'), /^Pages 1–2 of 12/);
  {
    const truth = TRUTH['comic.cbz'];
    let right = true;
    for (let k = 0; k < 6; k++) {
      const pl = await placed(pc);
      for (const at of pl) {
        const c = (await pixels(pc, Math.round(at.x + 12), Math.round(at.y + at.h / 4), 1, 1)).slice(0, 3), want = truth.pages[at.i];
        if (!c.every((v, j) => Math.abs(v - want[j]) <= 14)) right = false;
      }
      if (k < 5) { await pc.keyboard.press('ArrowRight'); await waitWhere(pc, new RegExp(`^Pages ${2 * k + 3}–`)); await pc.waitForTimeout(150); }
    }
    ok(right, 'the comic’s twelve pages in order, each fitted to its half of the window (p1 … p12 though stored out of order)');
    await tool(pc, 'Search in the book').click();
    ok(await pc.getByText('A comic’s pages are pictures: there is no text to search.').isVisible(), 'a comic: no search, said');
  }
  await open(pc, B('comic.cb7'), /^Pages 1–2 of 3/);
  ok(await pc.locator('.ebr-notes').getByText(/CB7 \(7z\) comic, unpacked by 7-Zip/).isVisible(), 'a CB7 comic opens through 7-Zip, and the tab says so');
  {
    const f = join(tmp, 'not-a-comic.cbr');
    writeFileSync(f, readFileSync(A('rar3-subdirs.rar')));
    await pc.locator('.ebr-tools').getByRole('button', { name: 'Close the book' }).click();
    await pc.locator('input[type=file]').first().setInputFiles(f);
    await pc.locator('.note-err').first().waitFor({ timeout: 30000 });
    ok(/without a book or pictures/.test(await pc.locator('.note-err').first().innerText()), 'a RAR without pictures: unpacked by 7-Zip, then refused in words');
  }
  for (const [n, re, what] of [['drm.epub', /Adobe’s DRM/, 'an EPUB locked with Adobe’s DRM'], ['drm.mobi', /Amazon’s DRM/, 'a MOBI locked with Amazon’s DRM']]) {
    await pc.locator('input[type=file]').first().setInputFiles(B(n));
    await pc.locator('.note-err').filter({ hasText: re }).waitFor({ timeout: 30000 });
    ok(await pc.locator('.ebr').isHidden(), `${what}: refused in words, the reader stays closed`);
  }
  {
    const f = join(tmp, 'scripts.html');
    writeFileSync(f, '<!doctype html><html><head><title>Scripts</title></head><body><h1>Greetings</h1><p>Hello, and مرحبا بالعالم, and also שלום עולם.</p></body></html>');
    await open(pc, f);
    const n = await pc.locator('.ebr-notes').innerText();
    ok(/Arabic and Hebrew, which no font here can draw/.test(n), `text no font here can draw is pointed out (${n.slice(0, 120)})`);
  }
  ok(!pc.errors.length, `no page errors ${pc.errors.join(' | ')}`);

  // ======================================================================================= a phone
  const ph = await newPage({ ...devices['iPhone 13'] });
  await ph.goto(base + '#/ebook');
  await open(ph, B('novel.epub'), /^Page 1 of \d+/);
  const cdp = await ph.context().newCDPSession(ph);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, force: 0.5, radiusX: 4, radiusY: 4 })) });
  const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await touch('touchEnd', []); };
  {
    const box = await stageBox(ph), vh = await ph.evaluate(() => innerHeight), bar = await ph.locator('.ebr-bottom').boundingBox();
    ok(box.y >= 0 && bar.y + bar.height <= vh + 1, `phone: the page and its bar fit the window (stage ${Math.round(box.y)} – ${Math.round(box.y + box.height)}, bar to ${Math.round(bar.y + bar.height)} of ${vh})`);
    await tap(box.x + box.width * 0.85, box.y + box.height / 2);
    await waitWhere(ph, /^Page 2 of /);
    await tap(box.x + box.width * 0.15, box.y + box.height / 2);
    await waitWhere(ph, /^Page 1 of /);
    ok(true, 'phone: a tap at the right turns forward, at the left back');
    await touch('touchStart', [[box.x + box.width * 0.8, box.y + box.height / 2]]);
    for (const k of [0.25, 0.5, 0.75, 1]) await touch('touchMove', [[box.x + box.width * (0.8 - 0.6 * k), box.y + box.height / 2 + 4 * k]]);
    await touch('touchEnd', []);
    await waitWhere(ph, /^Page 2 of /);
    ok(true, 'phone: a swipe to the left turns the page');
    // a long press on a word (on a page of running text)
    const Nph = await node(ph, 'novel.epub', { ...PC_LOOK, size: 18, justify: false });   // a phone's look: 18 px, left-aligned
    const longLines = (i) => JSON.parse(Nph.doc.loadPage(i).toStructuredText('preserve-whitespace').asJSON()).blocks.flatMap((b) => b.lines || []).filter((l) => l.text.trim().length > 20);
    let ti = 3; while (longLines(ti).length < 5) ti++;
    await tool(ph, 'Contents and go to a page').click();
    await ph.getByLabel('Page number').fill(String(ti + 1));
    await ph.getByLabel('Page number').press('Enter');
    await waitWhere(ph, new RegExp(`^Page ${ti + 1} of `));
    await ph.waitForTimeout(400);
    const l = longLines(ti)[2], pl = (await placed(ph)).find((x) => x.i === ti);
    const wx = box.x + pl.x + l.bbox.x + 6, wy = box.y + pl.y + l.bbox.y + l.bbox.h / 2;
    await touch('touchStart', [[wx, wy]]);
    await ph.waitForTimeout(800);
    await touch('touchEnd', []);
    await ph.locator('.ebr-selbar').waitFor({ state: 'visible', timeout: 10000 });
    const word = E.wordAt(Nph.doc, ti, [l.bbox.x + 6, l.bbox.y + l.bbox.h / 2]);
    const want = E.selectText(Nph.doc, ti, word.a, word.b).text.trim();
    ok(want.length > 1, `phone: a long press selects the word under the finger (“${want}”) and shows Copy`);
    ok((await ph.locator('.ebr-selbar').getByRole('button', { name: 'Copy' }).boundingBox()).height >= 44, 'phone: the selection’s buttons are 44 px');
    await tap(box.x + box.width / 2, box.y + box.height / 2);
    await ph.waitForTimeout(300);
    ok(await ph.locator('.ebr-selbar').isHidden(), 'phone: a tap clears the selection');
    // the look as a sheet: Sepia
    await tool(ph, 'Font, size, margins and theme').click();
    const sheet = await ph.locator('dialog.ebr-panel').boundingBox();
    ok(sheet.width >= 389 && Math.abs(sheet.y + sheet.height - vh) <= 1, `phone: the panel is a sheet at the foot of the window (${Math.round(sheet.y)} – ${Math.round(sheet.y + sheet.height)} of ${vh})`);
    await ph.locator('dialog.ebr-panel').getByRole('radio', { name: /Sepia/ }).click();
    await ph.waitForFunction(() => /244, 236, 216/.test(getComputedStyle(document.querySelector('.ebr-stage')).backgroundColor), null, { timeout: 15000 });
    await ph.keyboard.press('Escape');
    await ph.waitForTimeout(600);
    const c = await ph.evaluate(() => Array.from(document.querySelector('.ebr-page').getContext('2d').getImageData(3, 3, 1, 1).data).slice(0, 3));
    ok(JSON.stringify(c) === JSON.stringify(hex(E.THEMES.sepia.bg)), `phone: Sepia (${c})`);
    for (const b of await ph.locator('.ebr-tools button, .ebr-bottom button:visible').all()) {
      const r = await b.boundingBox();
      if (r && (r.width < 44 || r.height < 44)) ok(false, `phone: a button of ${Math.round(r.width)}×${Math.round(r.height)} (${await b.getAttribute('aria-label')})`);
    }
    ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no sideways scroll');
  }
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
