// PDF for Kindle (#/kindlepdf, PC + phones; potentials #109): the tab end to end on the fixtures of
// scripts/make-kindle-pdfs.mjs (a two-column paper with a plot, a formula, a table and bookmarks; a scanned page) and real
// PDFs (an encrypted one; three pages of the Federal Register). The PDF it makes is read back by MuPDF in Node: pages of the
// Kindle's shape, every line once in reading order, the labels, the options; the preview, a newer PDF and leaving the tab
// during a conversion, the phone.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { phoneLayout } from './_phone.mjs';

const K = (n) => fileURLToPath(new URL(`../fixtures/kindle/${n}`, import.meta.url));
const P = (n) => fileURLToPath(new URL(`../fixtures/pdf/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(new URL('../fixtures/kindle/index.json', import.meta.url), 'utf8'));
const LABEL = /^p\. \d+ · \d+ of \d+$/;

export default async ({ base, page: newPage, ok, download, devices, released }) => {
  const m = await import('mupdf');
  const read = (f) => {
    const d = new m.PDFDocument(readFileSync(f)), screens = [];
    for (let i = 0; i < d.countPages(); i++) {
      const pg = d.loadPage(i), [x0, y0, x1, y1] = pg.getBounds();
      const lines = JSON.parse(pg.toStructuredText('preserve-whitespace').asJSON()).blocks.flatMap((b) => (b.lines || []).map((l) => l.text.replace(/\s+/g, ' ').trim())).filter(Boolean);
      screens.push({ aspect: (y1 - y0) / (x1 - x0), lines });
    }
    return { d, screens, text: screens.flatMap((s) => s.lines.filter((x) => !LABEL.test(x))), labels: screens.map((s) => s.lines.find((x) => LABEL.test(x))) };
  };
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = [];
  page.on('request', (r) => fetched.push(r.url()));
  await page.goto(base + '#/kindlepdf');
  await page.getByRole('button', { name: 'Make PDF for Kindle' }).waitFor();
  await page.waitForTimeout(400);
  ok(!fetched.some((u) => /mupdf|\.wasm$/.test(u)), 'nothing heavy fetched before a PDF is chosen (MuPDF comes with the PDF)');
  const choose = async (f) => {
    await page.locator('input[type=file]').first().setInputFiles(f);
    await page.waitForFunction((n) => (document.querySelector('.kpdf-info')?.textContent || '').startsWith(n) && / pages?$/.test(document.querySelector('.kpdf-info').textContent), f.split(/[\\/]/).pop(), { timeout: 60000 });
  };
  const make = async () => {
    await page.getByRole('button', { name: 'Make PDF for Kindle' }).click();
    await page.getByRole('button', { name: 'Download PDF' }).waitFor({ timeout: 180000 });
    const f = await download(page, () => page.getByRole('button', { name: 'Download PDF' }).click());
    return { f, ...read(f), said: await page.locator('.tool-body .note').filter({ hasText: /screens? from/ }).first().innerText() };
  };

  // ---- the paper with the default Kindle (Paperwhite 7″, 1264 × 1680)
  await choose(K('paper.pdf'));
  ok(await page.locator('.kpdf-info').innerText() === 'paper.pdf: 2 pages', 'the PDF named with its pages');
  let r = await make();
  ok(r.f.endsWith('paper-kindle.pdf'), `saved as <name>-kindle.pdf (${r.f.split(/[\\/]/).pop()})`);
  ok(r.screens.length > 4 && new RegExp(`${r.screens.length} screens from 2 pages`).test(r.said), `the result names the screens and pages (${r.said})`);
  ok(r.screens.every((s) => Math.abs(s.aspect - 1680 / 1264) < 1e-3), 'every page of the PDF has the Paperwhite 7″\'s shape');
  const truth = TRUTH['paper.pdf'], order = truth.pages.flatMap((p) => p.order);
  ok(JSON.stringify(r.text.filter((x) => order.includes(x))) === JSON.stringify(order), 'every line of the paper in reading order: title, abstract, the left column to its end, then the right one');
  const heads = truth.pages.flatMap((p) => p.lines.filter((l) => l.head).map((l) => l.text));
  ok(!r.text.some((x) => heads.includes(x)), 'the running heads and page numbers left out');
  const counts = new Map(); for (const x of r.text) counts.set(x, (counts.get(x) || 0) + 1);
  ok([...counts.values()].every((n) => n === 1), 'no line twice (the text outside each piece is not in it)');
  ok(r.labels.every((x, i) => x && x.startsWith('p. ')) && r.labels[0] === `p. 1 · 1 of ${r.labels.filter((x) => x.startsWith('p. 1 ')).length}`, `"p. 1 · 1 of n" on every screen (${r.labels[0]})`);
  const ol = r.d.loadOutline() || [];
  ok(ol.length === 2 && ol[0].title === 'Introduction' && ol[0].page === 0 && ol[1].page === r.labels.findIndex((x) => x.startsWith('p. 2 ')), 'the bookmarks at the first screen of their pages');

  // the preview: a screen at a time
  await page.locator('.kpdf-screen canvas').waitFor();
  const where = page.locator('.kpdf-nav [role=status]');
  ok(await where.innerText() === `Screen 1 of ${r.screens.length}` && await page.getByRole('button', { name: 'Previous screen' }).isDisabled(), 'preview: screen 1, Previous off');
  await page.getByRole('button', { name: 'Next screen' }).click();
  await page.waitForFunction((n) => document.querySelector('.kpdf-nav [role=status]').textContent === `Screen 2 of ${n}`, r.screens.length);
  const shape = await page.locator('.kpdf-screen canvas').evaluate((c) => c.height / c.width);
  ok(Math.abs(shape - 1680 / 1264) < 0.01, `preview: screen 2, drawn in the Kindle's shape (${shape.toFixed(3)})`);
  const inked = await page.locator('.kpdf-screen canvas').evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n / (d.length / 4); });
  ok(inked > 0.01, `preview: the screen drawn (${(100 * inked).toFixed(1)} % ink)`);
  await page.locator('details summary', { hasText: 'Page report' }).click();
  ok(/two columns|2 columns/.test(await page.locator('.epub-report').innerText()), 'the page report names the columns');

  // ---- options: another Kindle, another size, labels off, page 2 only, running heads kept
  await page.getByLabel('Kindle', { exact: true }).selectOption('scribe');
  r = await make();
  ok(r.screens.every((s) => Math.abs(s.aspect - 2480 / 1860) < 1e-3), 'Scribe: its screen\'s shape');
  await page.getByLabel('Kindle', { exact: true }).selectOption('custom');
  await page.getByLabel('Screen width in pixels').fill('1000');
  await page.getByLabel('Screen height in pixels').fill('100');
  ok(/whole numbers of pixels, from 300 to 4,000/.test(await page.locator('.err-text').innerText()), 'another size: a height of 100 px refused in words as it is typed');
  const before = await page.locator('.tool-body .note').filter({ hasText: /screens? from/ }).first().innerText();
  await page.getByRole('button', { name: 'Make PDF for Kindle' }).click();
  await page.locator('.toast').last().waitFor();
  ok(/whole numbers of pixels/.test(await page.locator('.toast').last().textContent()) && await page.locator('.tool-body .note').filter({ hasText: /screens? from/ }).first().innerText() === before, '… and Make says so and makes nothing (the last PDF stays)');
  await page.getByLabel('Screen height in pixels').fill('1500');
  r = await make();
  ok(r.screens.every((s) => Math.abs(s.aspect - 1.5) < 1e-3), 'another size, 1000 × 1500: pages of that shape');
  await page.getByLabel('Kindle', { exact: true }).selectOption('pw7');
  const sw = (t) => page.locator('label.switch').filter({ hasText: t });
  await sw('Number the screens').click();
  await page.getByLabel('Pages').fill('2');
  r = await make();
  ok(r.labels.every((x) => !x) && r.text.every((x) => !/^L1\./.test(x)) && r.text.some((x) => /^L2\./.test(x)), 'labels off, page 2 only: no label, only page 2\'s lines');
  await sw('Number the screens').click();
  await sw('Leave out running heads').click();
  r = await make();
  ok(r.text.includes('Journal of Kindle Tests - Volume 1 - 2026') && r.text.includes('2'), 'running heads kept when asked: the head and the page number on the screens');
  await sw('Leave out running heads').click();
  await page.getByLabel('Pages').fill('');

  // ---- a scanned page: pictures
  await choose(K('scan.pdf'));
  r = await make();
  ok(r.text.length === 0 && /scanned, as pictures/.test(r.said), `a scanned page: its pieces are pictures, said (${r.said})`);

  // ---- an encrypted PDF: the password is asked for
  await page.locator('input[type=file]').first().setInputFiles(P('aes256-asdfzxcv.pdf'));
  await page.getByPlaceholder('Password').fill('asdfzxcv'); await page.getByPlaceholder('Password').press('Enter');
  await page.waitForFunction(() => (document.querySelector('.kpdf-info')?.textContent || '').startsWith('aes256-asdfzxcv.pdf'), null, { timeout: 30000 });
  r = await make();
  ok(r.screens.length >= 1 && r.text.length > 0, `an AES-256 PDF opened with its password and converted (${r.screens.length} screens)`);

  // ---- the Federal Register: three columns a page
  await choose(P('federal-register-3p.pdf'));
  r = await make();
  ok(r.screens.length > 20 && r.text.some((x) => /^SUMMARY: The FAA proposes to$/.test(x)), `the Federal Register: ${r.screens.length} screens, its text`);

  // ---- a newer PDF during a conversion ends it; leaving the tab during one is quiet
  await page.getByRole('button', { name: 'Make PDF for Kindle' }).click();
  await choose(K('paper.pdf'));
  await page.waitForTimeout(1500);
  ok(!(await page.getByRole('button', { name: 'Download PDF' }).count()), 'a PDF chosen during a conversion ends it: nothing of the old one is shown');
  r = await make();
  ok(r.f.endsWith('paper-kindle.pdf'), '… and the new one converts');
  await page.getByRole('button', { name: 'Make PDF for Kindle' }).click();
  await page.goto(base + '#/');
  await page.waitForTimeout(800);
  // (the refusal of the 1000 × 100 screen above is logged by the shared button: the one error the suite asked for)
  const errs = page.errors.filter((e) => !/whole numbers of pixels/.test(e));
  ok(!errs.length, `leaving during a conversion: no errors ${errs.slice(0, 3).join(' | ')}`);
  { const kept = await released(page, 'kindlepdf');
    ok(kept.length === 0, `leaving the tab: the blob URLs it made are let go (${kept.length} kept)`); }

  // ---- the phone: Share beside Download, no sideways scroll, the preview fits
  const phone = await phoneLayout({ base, page: newPage, devices, ok }, 'kindlepdf', { buttons: ['Make PDF for Kindle'] });
  await phone.locator('input[type=file]').first().setInputFiles(K('paper.pdf'));
  await phone.waitForFunction(() => / pages?$/.test(document.querySelector('.kpdf-info')?.textContent || ''), null, { timeout: 60000 });
  await phone.getByRole('button', { name: 'Make PDF for Kindle' }).click();
  await phone.getByRole('button', { name: 'Download PDF' }).waitFor({ timeout: 180000 });
  await phone.locator('.kpdf-screen canvas').waitFor();
  for (const name of ['Download PDF', 'Share', 'Next screen']) { const b = await phone.getByRole('button', { name, exact: true }).boundingBox(); ok(b && b.height >= 44 && b.x >= 0 && b.x + b.width <= 391, `phone: "${name}" on the screen, ≥ 44 px (${b && Math.round(b.height)})`); }
  const pv = await phone.locator('.kpdf-screen canvas').boundingBox();
  ok(pv && pv.x >= 0 && pv.x + pv.width <= 391, 'phone: the preview within the screen');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no sideways scroll with the result');
  ok(!phone.errors.length, `phone: no errors ${phone.errors.join(' | ')}`);
};
