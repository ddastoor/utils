// Clipart Maker (#/clipart, PC + phones; potentials #117) end to end: nothing of the engines or the cut-out model fetched before
// a photo; a photo of a cat (tests/fixtures/images/chelsea.png) → the model fetched once a visit, with its progress → the cat cut
// out — the SVG downloaded and drawn by librsvg (rsvg-convert): see-through where the photo's background was (its corners), the cat
// in at most the colours asked for, a black outline round it in the Cartoon style; each style composed at once from the same
// tracing (no second run) — the sticker's white border and shadow, line art's white shapes, the silhouette's one colour; fewer
// colours and the detail re-made; without the cut the whole photo; "Save PNG" at a size with its see-through corners; "Hold to
// compare"; a newer photo wins over one still being made; leaving the tab lets the clip art go; WCAG 2.2 A / AA in both themes;
// the phone.
import { readFileSync, existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from '../lib/child.mjs';
import { readPng } from '../lib/png.mjs';
import { phoneLayout } from './_phone.mjs';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const IMG = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const rsvg = (() => { for (const d of (process.env.PATH || '').split(delimiter)) { const p = join(d, 'rsvg-convert'); if (d && existsSync(p)) return p; } return null; })();

export default async (ctx) => {
  const { base, page: newPage, ok, download, tmp, released } = ctx;
  /** an SVG file drawn by librsvg at a width (its own shape), see-through */
  const render = (file, w) => { const o = join(tmp, `clip-${Date.now()}-${Math.random().toString(36).slice(2)}.png`); execFileSync(rsvg, ['-w', String(w), '-o', o, file]); return readPng(readFileSync(o)); };
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const asked = [];
  page.on('request', (r) => { const u = r.url(); if (/vtracer|vector\.worker|u2netp|imgproc[^/]*\.wasm|ort-wasm/.test(u)) asked.push(u.replace(/^.*\//, '')); });
  await page.goto(`${base}#/clipart`);
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  await page.waitForTimeout(500);
  ok(!asked.length, `nothing of the engines or the cut-out model is fetched before a photo is chosen (${asked.join(', ')})`);
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const radio = (name) => page.getByRole('radio', { name, exact: true });
  const status = () => page.locator('.ca-status').textContent();
  const info = () => page.locator('.card', { hasText: 'The clip art' }).locator('.muted.small').filter({ hasText: 'colours ·' }).textContent();
  /** wait for a clip art newer than `prev` (the picture's address changes with every composition) */
  const shown = async (prev = '') => {
    await page.waitForFunction((p) => { const im = document.querySelector('.ca-svg'); return im && im.src !== p && im.complete; }, prev, { timeout: 120000 });
    return page.evaluate(() => document.querySelector('.ca-svg').src);
  };
  const svgNow = async () => readFileSync(await download(page, () => btn('Download SVG').click()), 'utf8');

  // ---------------------------------------------------------------- a cat, cut out
  const progress = [];
  page.on('console', () => {});
  const watch = setInterval(() => { page.evaluate(() => document.querySelector('.ca-status')?.textContent + ' | ' + (document.querySelector('.card .progress')?.textContent || '')).then((s) => progress.push(s)).catch(() => {}); }, 100);
  await page.locator('input[type=file]').first().setInputFiles(IMG('chelsea.png'));
  let src = await shown();
  clearInterval(watch);
  ok(asked.filter((u) => /u2netp/.test(u)).length === 1, `the cut-out model is fetched from this site (${asked.filter((u) => /u2netp/.test(u)).join(', ')})`);
  ok(progress.some((s) => /Cutting the subject out|Fetching the cut-out model/.test(s)), `the progress is said while it works (${[...new Set(progress)].slice(0, 4).join(' / ')})`);
  ok(/^The subject was cut out \(\d+ % of the photo\)\.$/.test(await status()), `the line says the subject was cut out (${await status()})`);
  ok(/^(\d+) colours · \d+ shapes · 800 × \d+ · SVG \d+ KB · made in [\d.]+ s$/.test(await info()), `the clip art's colours, shapes, size and time (${await info()})`);
  const cartoon = await svgNow();
  ok(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(cartoon), 'an SVG document');
  const fills = new Set([...cartoon.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase()));
  fills.delete('#1b1b1b');
  ok(fills.size <= 12, `the cat in at most the 12 colours asked for (${fills.size})`);
  if (!rsvg) ok(true, 'NOTE: rsvg-convert was not found (apt install librsvg2-bin) — the clip art was not drawn here');
  else {
    const f = join(tmp, 'cartoon.svg'); (await import('node:fs')).writeFileSync(f, cartoon);
    const r = render(f, 400), a = (x, y) => r.data[(y * r.width + x) * 4 + 3];
    let clear = 0; for (let i = 0; i < r.width * r.height; i++) clear += r.data[i * 4 + 3] === 0;
    ok(a(r.width - 3, r.height - 3) === 0 && clear / (r.width * r.height) > 0.1, `drawn by librsvg: see-through where the background was — the bottom right (the paw fills the bottom left, the head the top), ${(100 * clear / (r.width * r.height)).toFixed(0)} % of the picture (corners' alpha ${[a(2, 2), a(r.width - 3, 2), a(2, r.height - 3), a(r.width - 3, r.height - 3)]})`);
    let opaque = 0, dark = 0;
    for (let i = 0; i < r.width * r.height; i++) if (r.data[i * 4 + 3] > 200) { opaque++; if (r.data[i * 4] < 40 && r.data[i * 4 + 1] < 40 && r.data[i * 4 + 2] < 40) dark++; }
    ok(opaque / (r.width * r.height) > 0.4 && dark / opaque > 0.02, `the cat opaque (${(100 * opaque / (r.width * r.height)).toFixed(0)} % of the picture) with its black outline and ink lines (${(100 * dark / opaque).toFixed(1)} % of it)`);
  }

  // ---------------------------------------------------------------- the styles, composed at once from the same tracing
  const before = asked.length, made = (await info()).replace(/^.* · made in /, '');
  await radio('Sticker').click(); src = await shown(src);
  const sticker = await svgNow();
  ok(/feDropShadow/.test(sticker) && /fill="#ffffff" stroke="#ffffff"/.test(sticker), 'Sticker: a white border and a soft shadow');
  ok(await page.locator('label.switch', { hasText: 'A white border' }).locator('input').isChecked(), '… its switches set (the white border on)');
  await radio('Line art').click(); src = await shown(src);
  const line = await svgNow();
  ok(/fill="#ffffff" stroke="#1b1b1b"/.test(line), 'Line art: white shapes with lines round them — a colouring page');
  await radio('Silhouette').click(); src = await shown(src);
  const sil = await svgNow();
  const silFills = new Set([...sil.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase()));
  ok(silFills.size === 1 && silFills.has('#1b1b1b'), `Silhouette: one colour (${[...silFills].join(', ')})`);
  await radio('Flat').click(); src = await shown(src);
  const flat = await svgNow();
  ok(!/stroke=/.test(flat), 'Flat: colours only, no lines');
  ok(asked.length === before && (await info()).endsWith(`made in ${made}`), `a style is composed from the tracing already made — nothing fetched or traced again (${asked.slice(before).join(', ')}; ${await info()})`);
  await radio('Cartoon').click(); src = await shown(src);
  await page.locator('label.switch', { hasText: 'Ink lines for the details' }).click(); src = await shown(src);
  const noLines = await svgNow();
  ok(noLines.length < cartoon.length, `the ink lines switched off: a smaller SVG (${noLines.length} against ${cartoon.length} characters)`);
  await page.locator('label.switch', { hasText: 'Ink lines for the details' }).click(); src = await shown(src);

  // ---------------------------------------------------------------- fewer colours, bolder detail: made again
  const colours = page.getByRole('slider', { name: 'Colours' });
  await colours.focus(); for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft');
  src = await shown(src);
  await page.waitForFunction(() => /^5 colours ·|^4 colours ·|^3 colours ·/.test([...document.querySelectorAll('.card .muted.small')].map((e) => e.textContent).find((t) => / colours · /.test(t)) || ''), null, { timeout: 120000 });
  ok(/^[3-5] colours ·/.test(await info()), `fewer colours made again: ${await info()}`);
  await radio('Bold').click();
  await page.waitForFunction(() => / · 640 × \d+ · /.test([...document.querySelectorAll('.card .muted.small')].map((e) => e.textContent).find((t) => / colours · /.test(t)) || ''), null, { timeout: 120000 });
  ok(/ 640 × \d+ /.test(await info()), `the Bold detail made at 640 px (${await info()})`);
  ok(asked.filter((u) => /u2netp/.test(u)).length === 1, 'the cut-out model is fetched once a visit');

  // ---------------------------------------------------------------- without the cut
  await page.locator('label.switch', { hasText: 'Cut the subject out' }).click();
  await page.waitForFunction(() => document.querySelector('.ca-status')?.textContent === 'The whole photo, background and all.', null, { timeout: 120000 });
  src = await shown(src);
  if (rsvg) {
    const f = join(tmp, 'whole.svg'); (await import('node:fs')).writeFileSync(f, await svgNow());
    const r = render(f, 300), a = (x, y) => r.data[(y * r.width + x) * 4 + 3];
    ok(a(3, 3) === 255 && a(r.width - 4, r.height - 4) === 255, 'without the cut the whole photo is drawn (its corners opaque)');
  }
  await page.locator('label.switch', { hasText: 'Cut the subject out' }).click();
  await page.waitForFunction(() => /^The subject was cut out/.test(document.querySelector('.ca-status')?.textContent || ''), null, { timeout: 120000 });
  src = await shown(src);

  // ---------------------------------------------------------------- PNG, compare
  await page.getByRole('combobox', { name: 'PNG size (the long side)' }).selectOption('512');
  const png = readPng(readFileSync(await download(page, () => btn('Save PNG').click())));
  ok(Math.max(png.width, png.height) === 512 && png.data[3] === 0, `"Save PNG" at 512 px, see-through round the cat (${png.width} × ${png.height})`);
  const cmp = btn('Hold to compare'); const box = await cmp.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  const during = await page.evaluate(() => [!document.querySelector('.ca-orig').hidden, document.querySelector('.ca-svg').hidden]);
  await page.mouse.up();
  const after = await page.evaluate(() => [!document.querySelector('.ca-orig').hidden, document.querySelector('.ca-svg').hidden]);
  ok(during.join() === 'true,true' && after.join() === 'false,false', `"Hold to compare" shows the photo while it is pressed (${during} → ${after})`);

  // ---------------------------------------------------------------- the newest photo wins
  await page.locator('input[type=file]').first().setInputFiles(IMG('astronaut.png'));
  await page.waitForTimeout(300);
  await page.locator('input[type=file]').first().setInputFiles(IMG('coffee.png'));
  await page.waitForFunction(() => document.querySelector('.ca-svg')?.alt === 'The clip art of coffee.png' && /^The subject was cut out/.test(document.querySelector('.ca-status')?.textContent || ''), null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const dl = await download(page, () => btn('Download SVG').click());
  ok(await page.evaluate(() => document.querySelector('.ca-svg').alt) === 'The clip art of coffee.png' && /coffee-clipart\.svg$/.test(dl), `a photo chosen while another is being made: the newest wins, and stays (${dl.replace(/^.*\//, '').replace(/^\d+-/, '')})`);

  const kept = await released(page, 'clipart');
  ok(!kept.length, `leaving the tab lets the clip art go (${kept.length} kept)`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.close();

  // ---------------------------------------------------------------- WCAG 2.2 A / AA, both themes
  for (const scheme of ['light', 'dark']) {
    const ax = await newPage({ viewport: { width: 1366, height: 900 }, colorScheme: scheme, bypassCSP: true });
    await ax.goto(`${base}#/clipart`);
    await ax.waitForSelector('input[type=file]', { state: 'attached' });
    await ax.locator('input[type=file]').first().setInputFiles(IMG('chelsea.png'));
    await ax.waitForSelector('.ca-svg', { timeout: 120000 });
    await ax.addScriptTag({ content: AXE });
    const vv = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!vv.length, `${scheme}: no WCAG 2.2 A / AA violations with a clip art shown ${vv.join(' | ')}`);
    await ax.close();
  }

  // ---------------------------------------------------------------- the phone
  const ph = await phoneLayout(ctx, 'clipart', { ready: '.drop', before: async (p) => {
    await p.locator('input[type=file]').first().setInputFiles(IMG('chelsea.png'));
    await p.waitForSelector('.ca-svg', { timeout: 120000 });
  } });
  const bar = await ph.locator('.actions').getByRole('button', { name: 'Download SVG' }).boundingBox();
  ok(bar && bar.height >= 44, `phone: "Download SVG" in the fixed bar, ${bar && Math.round(bar.height)} px tall`);
  const small = await ph.$$eval('.seg-btn, .switch, .ca-acts .btn', (bs) => bs.filter((b) => b.getBoundingClientRect().width).map((b) => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, hh]) => hh < 44));
  ok(!small.length, `phone: the styles, switches and buttons are 44 px tall and more (${JSON.stringify(small)})`);
  await ph.close();
};
