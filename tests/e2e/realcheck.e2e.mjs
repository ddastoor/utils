// Is This Screenshot Real? (potentials #82): every test picture of tests/fixtures/realcheck (python3 scripts/make-realcheck-shots.py
// — a payment receipt of a made-up app as the phone saved it, as WhatsApp passed it on, edited in the ways people edit them; a
// cloned photo, upright and stored on its side; a camera's photo) checked in the browser: the verdict, the signs, and the places
// outlined on the picture where truth.json says the edit is. The toggles, the newest picture winning, a picture pasted, ExifTool
// that cannot be fetched (the other checks still answer), the error levels, the facts, the readers ended and nothing kept when
// the tab is left, the phone, WCAG 2.2 in both themes; nothing fetched at open.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { phoneLayout } from './_phone.mjs';

const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const DIR = fileURLToPath(new URL('../fixtures/realcheck/', import.meta.url));
const F = (n) => join(DIR, n);
const truth = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const overlap = (a, b, pad = 12) => a[0] <= b[2] + pad && a[2] >= b[0] - pad && a[1] <= b[3] + pad && a[3] >= b[1] - pad;

/** Tesseract's workers counted as they are made and ended */
const countWorkers = () => {
  const W = window.Worker; window.__tw = { made: 0, live: 0 };
  window.Worker = class extends W {
    constructor(u, o) {
      super(u, o);
      if (!/tesseract/.test(String(u))) return;
      window.__tw.made++; window.__tw.live++;
      let ended = false; const end = this.terminate.bind(this);
      this.terminate = () => { if (!ended) { ended = true; window.__tw.live--; } end(); };
    }
  };
};

/** the picture chosen, and what the tab says once every check has answered */
async function checkFile(page, name) {
  await page.locator('.drop input[type=file]').setInputFiles([F(name)]);
  return result(page, name);
}
async function result(page, name) {
  await page.waitForFunction((n) => { const v = document.querySelector('.rc-verdict'), c = document.querySelector('.rc-col p'); return v && !v.classList.contains('rc-pending') && c && c.textContent.startsWith(n); }, name, { timeout: 240000 });
  return page.evaluate(() => ({
    tone: document.querySelector('.rc-verdict').dataset.tone,
    headline: document.querySelector('.rc-verdict strong').textContent,
    signs: [...document.querySelectorAll('.rc-sign')].map((e) => ({ id: e.dataset.sign, group: e.closest('.rc-group').className.replace(/.*rc-/, ''), title: e.querySelector('strong').textContent, text: e.querySelector('p').textContent })),
    boxes: [...document.querySelectorAll('.rc-marks rect')].map((r) => ({ cls: r.getAttribute('class'), b: [+r.getAttribute('x'), +r.getAttribute('y'), +r.getAttribute('x') + +r.getAttribute('width'), +r.getAttribute('y') + +r.getAttribute('height')] })),
    steps: [...document.querySelectorAll('.rc-steps li')].map((l) => l.className + ' ' + l.textContent),
  }));
}
const ids = (r, group) => r.signs.filter((s) => !group || s.group === group).map((s) => s.id).sort();
const boxesOf = (r, id) => r.boxes.filter((x) => x.cls.split(' ').includes(`rc-box-${id}`)).map((x) => x.b);

export default async (ctx) => {
  const { base, page: newPage, ok, released } = ctx;
  const page = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await page.addInitScript(countWorkers);
  const asked = [];
  page.on('request', (r) => { const u = r.url(); if (/tesseract|traineddata|\.wasm|zeroperl/.test(u)) asked.push(u.replace(/^.*\//, '')); });
  await page.goto(`${base}#/realcheck`);
  await page.waitForSelector('.tool-body > :not(.loading)');
  await page.waitForTimeout(400);
  ok(!asked.length, `nothing of the engines is fetched before a picture is chosen (${asked.join(', ')})`);
  ok(await page.getByRole('button', { name: 'Paste image' }).isVisible(), 'a Paste image button');
  ok(await page.getByRole('button', { name: /Use (camera|webcam)/ }).count() === 0, 'no camera: a picture taken here has nothing to check');

  // ------------------------------------------------------------------ the receipt as the phone saved it, and as WhatsApp passed it on
  let r = await checkFile(page, 'receipt-genuine.png');
  ok(r.tone === 'none' && /No sign of editing found/.test(r.headline) && !ids(r, 'strong').length && !ids(r, 'weak').length, `receipt-genuine.png: no sign (${ids(r).join(', ')})`);
  ok(r.steps.every((s) => s.startsWith('rc-done')), `every check answered (${r.steps.join(' / ')})`);
  ok(asked.some((a) => /jpegcoef/.test(a)) && asked.some((a) => /imgproc/.test(a)) && asked.some((a) => /zeroperl/.test(a)) && asked.some((a) => /traineddata|tesseract/.test(a)), 'with the first picture: libjpeg-turbo\'s module, imgproc, ExifTool and the OCR');
  r = await checkFile(page, 'IMG-20261106-WA0007.jpg');
  ok(r.tone === 'none' && ids(r, 'info').includes('whatsapp') && ids(r, 'info').includes('jpeg'), `the WhatsApp copy: no sign, named as WhatsApp's (${ids(r).join(', ')})`);
  ok(/quality 78/.test(r.signs.find((s) => s.id === 'jpeg').text), 'its JPEG: quality 78');

  // ------------------------------------------------------------------ edited
  r = await checkFile(page, 'receipt-edited.jpg');
  let e = truth['receipt-edited.jpg'];
  ok(r.tone === 'signs' && ids(r, 'strong').join() === 'amounts,changed', `receipt-edited.jpg: the part not saved like the rest and two amounts (${ids(r).join(', ')})`);
  ok(/about quality 7[789]/.test(r.signs.find((s) => s.id === 'changed').text), `saved before at about 78: "${r.signs.find((s) => s.id === 'changed').text.slice(0, 80)}"`);
  let bx = boxesOf(r, 'changed');
  ok(bx.length === 1 && overlap(bx[0], e.edit), `the part outlined is the amount painted over (${JSON.stringify(bx)} — ${JSON.stringify(e.edit)})`);
  // its toggle
  const tog = page.locator('.rc-sign[data-sign="changed"] button');
  ok((await tog.getAttribute('aria-pressed')) === 'true', 'its places are outlined at first (pressed)');
  await tog.click();
  ok((await page.locator('.rc-marks rect.rc-box-changed').count()) === 0 && (await page.locator('.rc-sign[data-sign="changed"] button').getAttribute('aria-pressed')) === 'false', 'pressed again: its outline hidden');
  await page.locator('.rc-sign[data-sign="changed"] button').click();
  ok((await page.locator('.rc-marks rect.rc-box-changed').count()) === 1, 'and shown again');
  // the facts and the error levels
  await page.locator('summary', { hasText: 'About the file' }).click();
  const facts = await page.locator('.rc-facts').textContent();
  ok(/quality 92, libjpeg’s standard tables, colour 4:2:0/.test(facts) && /Earlier saveabout quality 7[789]/.test(facts) && /a screenshot/.test(facts), `the facts: ${facts.slice(0, 200)}`);
  await page.locator('summary', { hasText: 'Error levels' }).click();
  const ela = await page.locator('.rc-ela-pic').evaluate((c) => [c.width, c.height]);
  ok(ela[0] === 720 && ela[1] === 1600, `the error levels as a picture of its size (${ela})`);
  await page.locator('summary', { hasText: 'The text read' }).click();
  ok(/Payment successful/.test(await page.locator('.rc-text').textContent()), 'the text read in it');

  r = await checkFile(page, 'receipt-photoshop.png');
  ok(r.tone === 'signs' && ['software', 'history'].every((x) => ids(r, 'strong').includes(x)) && ids(r, 'weak').includes('modified'), `receipt-photoshop.png: Photoshop, its history, changed later (${ids(r).join(', ')})`);
  ok(/Adobe Photoshop 26\.1/.test(r.signs.find((s) => s.id === 'software').text), 'the editor named');
  r = await checkFile(page, 'receipt-thumb.jpg');
  e = truth['receipt-thumb.jpg'];
  bx = boxesOf(r, 'preview');
  ok(['preview', 'software'].every((x) => ids(r, 'strong').includes(x)) && ids(r, 'weak').includes('modified'), `receipt-thumb.jpg: the preview inside shows something else, Snapseed, changed later (${ids(r).join(', ')})`);
  ok(bx.length >= 1 && bx.some((b) => overlap(b, e.edit, 0)), `the preview's differing part outlined on the amount (${JSON.stringify(bx)})`);
  r = await checkFile(page, 'receipt-impossible.png');
  ok(ids(r, 'strong').join() === 'amounts,clock,ref,weekday', `receipt-impossible.png: what a payment app never writes (${ids(r).join(', ')})`);
  ok(/Saturday, 6 November 2026 — that date is a Friday/.test(r.signs.find((s) => s.id === 'weekday').text), 'the weekday in words');
  ok(/8:47.*9:01 am — 14 minutes later/.test(r.signs.find((s) => s.id === 'clock').text), 'the clock in words');
  ok(/63100941278 — 11 digits/.test(r.signs.find((s) => s.id === 'ref').text), 'the reference in words');
  r = await checkFile(page, 'receipt-sent.png');
  e = truth['receipt-sent.png'];
  bx = boxesOf(r, 'changed');
  ok(ids(r, 'strong').includes('changed') && bx.length >= 1 && bx.every((b) => overlap(b, e.edit)), `receipt-sent.png: a PNG that was a JPEG, the part painted after it outlined (${JSON.stringify(bx)})`);

  // ------------------------------------------------------------------ photos
  r = await checkFile(page, 'photo-cloned.jpg');
  const cl = truth['photo-cloned.jpg'].clone;
  bx = boxesOf(r, 'copied');
  ok(ids(r, 'strong').join() === 'copied' && bx.length === 2 && bx.some((b) => overlap(b, cl.from)) && bx.some((b) => overlap(b, cl.to)), `photo-cloned.jpg: the copy and where it came from (${JSON.stringify(bx)})`);
  r = await checkFile(page, 'photo-cloned-turned.jpg');
  bx = boxesOf(r, 'copied');
  ok(ids(r, 'strong').join() === 'copied' && bx.length === 2 && bx.some((b) => overlap(b, cl.from)) && bx.some((b) => overlap(b, cl.to)), `photo-cloned-turned.jpg (stored on its side): outlined on the photo as shown (${JSON.stringify(bx)})`);
  r = await checkFile(page, 'photo-camera.jpg');
  ok(r.tone === 'none' && ids(r, 'info').includes('camera') && /Canon PowerShot S40/.test(r.signs.find((s) => s.id === 'camera').text), `photo-camera.jpg: no sign, the camera named (${ids(r).join(', ')})`);

  // ------------------------------------------------------------------ the newest picture wins; a picture pasted
  await page.locator('.drop input[type=file]').setInputFiles([F('receipt-impossible.png')]);
  await page.waitForTimeout(150);
  r = await checkFile(page, 'receipt-genuine.png');
  ok(r.tone === 'none' && !ids(r, 'strong').length, 'a picture chosen while another is checked: the newest wins, nothing of the older one shows');
  const png = readFileSync(F('receipt-impossible.png')).toString('base64');
  await page.evaluate((b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u], 'receipt-impossible.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, png);
  r = await result(page, 'receipt-impossible.png');
  ok(ids(r, 'strong').join() === 'amounts,clock,ref,weekday', 'a picture pasted (Ctrl+V) is checked');

  // ------------------------------------------------------------------ leaving the tab
  const before = await page.evaluate(() => window.__tw.live);
  const kept = await released(page, 'realcheck');
  const after = await page.evaluate(() => window.__tw.live);
  ok(before === 1 && after === 0, `leaving the tab ends the OCR's reader (${before} → ${after})`);
  ok(!kept.length, `leaving the tab keeps nothing (${kept.length})`);
  const live = await page.evaluate(() => window.__superutilsLive?.());
  ok(!live || live.workers === 0, `no worker left (${JSON.stringify(live)})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.close();

  // ------------------------------------------------------------------ ExifTool that cannot be fetched: the other checks answer
  const off = await newPage({ viewport: { width: 1366, height: 900 } });
  await off.route(/zeroperl\.wasm/, (rt) => rt.abort());
  await off.goto(`${base}#/realcheck`);
  await off.waitForSelector('.tool-body > :not(.loading)');
  r = await checkFile(off, 'receipt-edited.jpg');
  ok(r.steps.some((s) => s.startsWith('rc-fail') && /metadata/.test(s)) && ids(r, 'strong').includes('changed'), `ExifTool refused: its step says so, the picture's signs still found (${r.steps.join(' / ')})`);
  await off.close();

  // ------------------------------------------------------------------ WCAG 2.2, both themes, with results
  for (const scheme of ['light', 'dark']) {
    const ax = await newPage({ viewport: { width: 1366, height: 900 }, colorScheme: scheme, bypassCSP: true });
    await ax.goto(`${base}#/realcheck`);
    await ax.waitForSelector('.tool-body > :not(.loading)');
    await checkFile(ax, 'receipt-impossible.png');
    for (const s of ['About the file', 'Error levels', 'The text read', 'What this can']) await ax.locator('summary', { hasText: s }).click();
    await ax.addScriptTag({ content: AXE });
    const vv = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!vv.length, `${scheme}: no WCAG 2.2 A / AA violations with the results open ${vv.join(' | ')}`);
    await ax.close();
  }

  // ------------------------------------------------------------------ the phone
  const ph = await phoneLayout(ctx, 'realcheck', { ready: '.drop', before: async (p) => { await checkFile(p, 'receipt-edited.jpg'); } });
  const lay = await ph.evaluate(() => {
    const v = document.querySelector('.rc-verdict').getBoundingClientRect(), pic = document.querySelector('.rc-pic').getBoundingClientRect(), s = document.querySelector('.rc-list').getBoundingClientRect();
    return { stacked: pic.top >= v.bottom && s.top >= pic.bottom - 1, fits: pic.width <= innerWidth };
  });
  ok(lay.stacked && lay.fits, `phone: the verdict, the picture, the signs one under another (${JSON.stringify(lay)})`);
  ok(await ph.getByRole('button', { name: 'Paste image' }).isVisible(), 'phone: Paste image');
  await ph.close();
};
