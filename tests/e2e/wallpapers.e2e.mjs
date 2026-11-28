// Wallpapers (potentials #115): the tab in Chromium on stand-in services (tests/lib/wallstub.mjs — Wikipedia's feed and summaries,
// Commons' search, the Met's and the Art Institute's answers as scripts/make-wallpaper-fixtures.py recorded them; the pictures are test
// pictures: busy.jpg, a checkered block at a known place, for Commons and the Art Institute; face.jpg, the astronaut's portrait at the
// right of a wide picture, for the Met). Today's picks (the feed of the reader's date, a Met highlight and an Art Institute one, by the
// day's number) with their credits; topics, words and sources asked of the right services; More pictures until each source has no more
// (a source with nothing more not asked again; the same picture once); Wikimedia's refusal (HTTP 429) said, the museums shown. A picture
// opened: its author, licence (a link), credit, description and its story from Wikipedia; the crop of the screen's shape — this screen
// in its real pixels, turned, a phone upright, a monitor, another size (refused outside 100 – 8,192 px); on the busiest part (the
// checkered block), on the face (where the Blur & Redact tab finds it); dragged, moved with the arrow keys, zoomed; saved: the JPEG
// exactly the screen's pixels, of the right part of the picture (its pixels read), from a rendition large enough (the address asked
// for: Commons' standard thumbnail width, the original past it; the Art Institute's IIIF width; the Met's original), the credit in its
// comment segment; the phone (the dialog full screen, Save in the fixed bar, a download); axe-core in both themes; the tab left: its
// dialog and blob URLs gone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WALL_HOSTS, wallRoute } from '../lib/wallstub.mjs';

const FX = (f) => fileURLToPath(new URL(`../fixtures/wallpapers/${f}`, import.meta.url));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const POTD = 'Lower Manhattan from Jersey City November 2014 panorama 3';
const ORIG = 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Lower_Manhattan_from_Jersey_City_November_2014_panorama_3.jpg';

/** a JPEG's size and comment (its markers walked) */
function jpegInfo(file) {
  const b = readFileSync(file), out = { jpeg: b[0] === 0xff && b[1] === 0xd8, w: 0, h: 0, comment: '', firstAfterSoi: b[3] };
  for (let i = 2; i + 4 <= b.length && b[i] === 0xff;) {
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xd9 || m === 0xda) break;
    if (m >= 0xc0 && m <= 0xc3) { out.h = (b[i + 5] << 8) | b[i + 6]; out.w = (b[i + 7] << 8) | b[i + 8]; }
    if (m === 0xfe) out.comment = b.subarray(i + 4, i + 2 + len).toString('utf8');
    i += 2 + len;
  }
  return out;
}

export default async ({ base, page: newPage, ok, download, released, devices, info }) => {
  const seen = [];
  const page = async (opts = {}, over = {}) => { const p = await newPage(opts); await p.route(WALL_HOSTS, wallRoute(over, seen)); return p; };
  const open = async (p) => {
    await p.goto(`${base}#/wallpapers`);
    await p.locator('.wp-pick').first().waitFor({ timeout: 20000 });
    await p.waitForFunction(() => !document.querySelector('.wp-grid[aria-busy]') && document.querySelectorAll('.wp-tile').length > 0, null, { timeout: 20000 }).catch(() => {});
  };
  const until = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const asked = (re, from = 0) => seen.slice(from).filter((u) => re.test(u));
  const tiles = (p) => p.$$eval('.wp-tile', (ts) => ts.map((t) => ({ title: t.querySelector('.wp-tile-title')?.textContent, by: t.querySelector('.muted')?.textContent })));
  /** the crop in the picture's pixels (the frame's place in % of the stage, the preview's size) */
  const frame = (p, pw, ph) => p.locator('.wp-frame').evaluate((e, [pw, ph]) => ({ x: parseFloat(e.style.left) * pw / 100, y: parseFloat(e.style.top) * ph / 100, w: parseFloat(e.style.width) * pw / 100, h: parseFloat(e.style.height) * ph / 100 }), [pw, ph]);
  const how = (p) => p.locator('.wp-how').innerText();
  const status = (p) => p.locator('.wp-status').innerText();
  const openPic = async (p, sel, title) => {
    await p.locator(sel).filter({ hasText: title }).first().click();
    await p.locator('dialog.wp-dlg[open]').waitFor({ timeout: 10000 });
    return until(p, () => /crop/.test(document.querySelector('.wp-how')?.textContent || ''), null, 60000);
  };
  const screenTo = async (p, v) => { await p.locator('select[aria-label="The screen it is for"]').selectOption(v); await p.waitForTimeout(200); };
  const save = (p) => download(p, () => p.getByRole('button', { name: 'Save wallpaper', exact: true }).click());
  /** how far a saved wallpaper is from boxes of a picture, both drawn 90 px wide: the mean difference of their lumas (0 – 255) */
  const diffFrom = (p, saved, src, boxes) => p.evaluate(async ({ a, b, boxes }) => {
    const bmp = (b64) => createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const A = await bmp(a), B = await bmp(b), W = 90, H = Math.round(90 * A.height / A.width);
    const luma = (img, sx, sy, sw, sh) => {
      const c = new OffscreenCanvas(W, H), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, sx, sy, sw, sh, 0, 0, W, H); // 'high': no aliasing of a fine checkerboard
      const d = x.getImageData(0, 0, W, H).data, out = new Float32Array(W * H);
      for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      return out;
    };
    const la = luma(A, 0, 0, A.width, A.height);
    return boxes.map((bx) => { const lb = luma(B, bx.x, bx.y, bx.w, bx.h); let s = 0; for (let i = 0; i < la.length; i++) s += Math.abs(la[i] - lb[i]); return +(s / la.length).toFixed(1); });
  }, { a: readFileSync(saved).toString('base64'), b: readFileSync(src).toString('base64'), boxes });
  const centred = (f, pw) => ({ x: pw / 2 - f.w / 2, y: f.y, w: f.w, h: f.h });
  /** the control: a wrong crop (centred) is clearly further from the file — 3 times and 10 levels at least */
  const apart = (d, dc) => dc >= Math.max(3 * d, d + 10);
  /** mean and spread of the luma in parts of a saved JPEG ([x0, y0, x1, y1] as fractions) */
  const stats = (p, file, rects) => p.evaluate(async ({ b64, rects }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    return rects.map(([a, b, cc, d]) => {
      const X = Math.round(a * bmp.width), Y = Math.round(b * bmp.height), W = Math.max(1, Math.round((cc - a) * bmp.width)), H = Math.max(1, Math.round((d - b) * bmp.height));
      const px = x.getImageData(X, Y, W, H).data; let s = 0, s2 = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) { const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; s += l; s2 += l * l; n++; }
      const m = s / n; return { mean: Math.round(m), sd: Math.round(Math.sqrt(Math.max(0, s2 / n - m * m))) };
    });
  }, { b64: readFileSync(file).toString('base64'), rects });

  // ---------------------------------------------------------------- the face where the Blur & Redact tab finds it in face.jpg
  const rp = await newPage({ viewport: { width: 1280, height: 900 } });
  await rp.goto(`${base}#/redact`);
  await rp.locator('input[type=file]').setInputFiles(FX('face.jpg'));
  await until(rp, () => document.querySelector('.redact-box.face'), null, 60000);
  const fb = await rp.locator('.redact-box.face').first().evaluate((e) => ({ x: parseFloat(e.style.left) * 16, y: parseFloat(e.style.top) * 6, w: parseFloat(e.style.width) * 16, h: parseFloat(e.style.height) * 6 }));
  ok(fb.x > 1000 && fb.x + fb.w < 1600, `the face of face.jpg (Blur & Redact): ${Math.round(fb.x)} – ${Math.round(fb.x + fb.w)} across, ${Math.round(fb.y)} – ${Math.round(fb.y + fb.h)} down`);
  await rp.close();

  // ---------------------------------------------------------------- opening: today's picks, the landscapes
  const pc = await page({ viewport: { width: 1280, height: 900 }, screen: { width: 1920, height: 1080 } });
  await open(pc);
  await until(pc, () => document.querySelectorAll('.wp-pick').length === 3);
  const picks = await pc.$$eval('.wp-pick', (ps) => ps.map((p) => `${p.querySelector('.wp-pick-src')?.textContent} | ${p.querySelector('.wp-pick-title')?.textContent} | ${p.querySelector('.muted')?.textContent}`));
  ok(picks.length === 3 && picks[0] === `Wikimedia Commons | ${POTD} | King of Hearts` && /^The Met \| Repose \| John White Alexander/.test(picks[1]) && /^Art Institute of Chicago \| The Bedroom \| Vincent van Gogh, 1889/.test(picks[2]),
    `today's picks: Commons' Picture of the Day, the Met's first public-domain highlight, the Art Institute's (${picks.join(' / ')})`);
  const day = await pc.evaluate(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), n: Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2000, 0, 1)) / 86400000) }; });
  const ymd = `${day.y}/${String(day.m).padStart(2, '0')}/${String(day.d).padStart(2, '0')}`;
  ok(asked(new RegExp(`/feed/featured/${ymd}$`)).length && asked(new RegExp(`isHighlight=true.*${day.n % 400 ? `offset=${day.n % 400}` : ''}`)).length && asked(new RegExp(`is_boosted.*page=${(day.n % 120) + 1}`)).length,
    `the picks asked by the reader's date (${ymd}) and the day's number (${day.n})`);
  ok(asked(/collectionapi\.metmuseum\.org\/public\/collection\/v1\/objects\/10127/).length === 0 && asked(/objects\/10065/).length, 'the Met: the first public-domain highlight taken (10065 — the search does not keep to the public domain; 10127 is not asked)');
  ok(await until(pc, () => [...document.querySelectorAll('.wp-pick img')].every((i) => i.src.startsWith('blob:')) && document.querySelectorAll('.wp-pick img').length === 3), 'the picks\' pictures shown, from blob: addresses (the CSP\'s img-src stays the site\'s own)');
  const t0 = await tiles(pc);
  ok(t0.length === 21 && /Wikimedia Commons$/.test(t0[0].by) && /The Met$/.test(t0[1].by) && /Art Institute of Chicago$/.test(t0[2].by), `the landscapes: 1 of Commons, 8 of the Met (its public-domain ones), 12 of the Art Institute's, in turn (${t0.length})`);
  ok(await pc.locator('.wp-chip[aria-pressed="true"]').innerText() === 'Landscapes' && await pc.locator('.wp-grid-title').innerText() === 'Landscapes', 'the topic "Landscapes" lit as the tab opens');
  ok(asked(/commons\.wikimedia\.org\/w\/api\.php/).some((u) => new URL(u).searchParams.get('gsrsearch') === 'incategory:"Featured_pictures_on_Wikimedia_Commons" filetype:bitmap landscape'), 'Commons asked among its featured pictures, for "landscape"');
  ok(!asked(/\.(wasm)(\?|$)/).length && !(await pc.evaluate(() => performance.getEntriesByType('resource').some((r) => /\.wasm|mediapipe|models\//.test(r.name)))), 'nothing of the crop\'s engines fetched before a picture is opened');

  // ---------------------------------------------------------------- More pictures, until each source has no more
  let n0 = seen.length;
  await pc.getByRole('button', { name: 'More pictures' }).click();
  await until(pc, () => !document.querySelector('.wp-grid[aria-busy]'));
  const t1 = await tiles(pc);
  ok(t1.length === 28 && new Set(t1.map((t) => `${t.title}|${t.by}`)).size === 28, `More: 4 of the Met's next page, 3 of the Art Institute's (3 already shown are not again) — ${t1.length}`);
  ok(asked(/commons\.wikimedia\.org.*gsroffset=1/, n0).length === 1 && asked(/v1\.1\/search.*offset=12/, n0).length === 1 && asked(/artworks\/search.*page=2/, n0).length === 1, 'each source asked for its next page');
  n0 = seen.length;
  await pc.getByRole('button', { name: 'More pictures' }).click();
  await until(pc, () => !document.querySelector('.wp-grid[aria-busy]'));
  ok(!asked(/commons\.wikimedia\.org/, n0).length, 'Commons, which said it has no more, is not asked again');
  ok(await pc.getByRole('button', { name: 'More pictures' }).isHidden() && (await tiles(pc)).length === 28, 'no source with more: the button goes');

  // ---------------------------------------------------------------- topics, words, sources
  n0 = seen.length;
  await pc.locator('.wp-chip', { hasText: 'Space' }).click();
  await until(pc, () => !document.querySelector('.wp-grid[aria-busy]') && document.querySelector('.wp-grid-title')?.textContent === 'Space');
  ok(asked(/commons\.wikimedia\.org/, n0).some((u) => /galaxy OR nebula/.test(new URL(u).searchParams.get('gsrsearch'))) && !asked(/metmuseum|artic\.edu\/api/, n0).length, 'Space: only Commons asked (the museums have little of it)');
  ok((await tiles(pc)).length === 1, 'Space: the one picture of the stand-in Commons');
  n0 = seen.length;
  await pc.getByLabel('Search pictures').fill('sunflowers');
  await pc.getByLabel('Search pictures').press('Enter');
  await until(pc, () => !document.querySelector('.wp-grid[aria-busy]') && /sunflowers/.test(document.querySelector('.wp-grid-title')?.textContent || ''));
  ok(asked(/commons\.wikimedia\.org/, n0).some((u) => /sunflowers$/.test(new URL(u).searchParams.get('gsrsearch'))) && asked(/v1\.1\/search\?q=sunflowers/, n0).length && asked(/artworks\/search/, n0).some((u) => /"query":"sunflowers"/.test(new URL(u).searchParams.get('params'))),
    'words: every source asked for them');
  ok(await pc.locator('.wp-grid-title').innerText() === 'Pictures of “sunflowers”' && !(await pc.locator('.wp-chip[aria-pressed="true"]').count()), 'the title says the words; no topic lit');
  n0 = seen.length;
  await pc.getByLabel('Source', { exact: true }).selectOption('met');
  await until(pc, () => !document.querySelector('.wp-grid[aria-busy]') && /The Met$/.test(document.querySelector('.wp-grid-title')?.textContent || ''));
  ok(!asked(/commons\.wikimedia\.org|artic\.edu\/api/, n0).length && asked(/v1\.1\/search\?q=sunflowers.*limit=48/, n0).length, 'the Met alone: only the Met asked, for twice a page (its public-domain ones kept)');
  ok((await tiles(pc)).every((t) => /The Met$/.test(t.by)), 'the Met alone: its pictures only');
  await pc.getByLabel('Source', { exact: true }).selectOption('all');
  await pc.locator('.wp-chip', { hasText: 'Landscapes' }).click();
  await until(pc, () => !document.querySelector('.wp-grid[aria-busy]') && document.querySelectorAll('.wp-tile').length === 21);

  // ---------------------------------------------------------------- the Picture of the Day: credit, licence, story; the crop
  ok(await openPic(pc, '.wp-pick', POTD), 'the Picture of the Day opened; the crop placed');
  const dinfo = await pc.locator('.wp-info').innerText();
  ok(/King of Hearts/.test(dinfo) && /Credit: King of Hearts, CC BY-SA 3\.0, via Wikimedia Commons/.test(dinfo) && /Four-segment panorama of Lower Manhattan/.test(dinfo), `its author, credit and description (${dinfo.slice(0, 160).replace(/\n/g, ' / ')})`);
  ok(await pc.locator('.wp-info a', { hasText: 'CC BY-SA 3.0' }).getAttribute('href') === 'https://creativecommons.org/licenses/by-sa/3.0', 'its licence, a link to it');
  ok(await pc.getByRole('link', { name: 'Full-size original' }).getAttribute('href') === ORIG && await pc.getByRole('link', { name: /At Wikimedia Commons/ }).getAttribute('href') === 'https://commons.wikimedia.org/wiki/File:Lower_Manhattan_from_Jersey_City_November_2014_panorama_3.jpg', 'the original and its page at Commons, linked');
  ok(await until(pc, () => /From Wikipedia: Lower Manhattan/.test(document.querySelector('.wp-story')?.textContent || '')) && /Lower Manhattan is the subject of a test article/.test(await pc.locator('.wp-story').innerText()), 'its story: the Wikipedia article its description links to');
  ok(asked(/\/1280px-Lower_Manhattan/).length > 0 && !asked(/thumb\.wikimedia\.org/).length, 'the picture shown from Commons\' 1,280 px thumbnail (upload.wikimedia.org)');
  const scr = await pc.locator('select[aria-label="The screen it is for"] option').evaluateAll((os) => os.slice(0, 2).map((o) => o.textContent));
  ok(scr[0] === 'This screen, 1920 × 1080' && scr[1] === 'This screen turned, 1080 × 1920', `this screen in its real pixels, and turned (${scr.join(' | ')})`);
  let f = await frame(pc, 1600, 1000);
  const fbox = await pc.locator('.wp-frame').boundingBox();
  ok(Math.abs(fbox.width / fbox.height - 16 / 9) < 0.02 && Math.abs(f.w - 1600) < 2 && f.y <= 300 && f.y + f.h >= 700, `the crop of this screen's shape on the busiest part: ${f.w.toFixed(0)} × ${f.h.toFixed(0)} at ${f.x.toFixed(0)}, ${f.y.toFixed(0)} (on the screen ${fbox.width.toFixed(0)} × ${fbox.height.toFixed(0)})`);
  ok(/busiest part/.test(await how(pc)), `no face: "${await how(pc)}"`);
  await screenTo(pc, 'p1170');
  f = await frame(pc, 1600, 1000);
  ok(Math.abs(f.w / f.h - 1170 / 2532) < 0.01 && Math.abs(f.h - 1000) < 2 && f.x <= 1150 + 12 && f.x + f.w >= 1450 - 12, `a phone upright: the full height, on the checkered block (${f.x.toFixed(0)} – ${(f.x + f.w).toFixed(0)}; the block 1150 – 1450)`);
  // saved: the original asked (no standard thumbnail is wide enough), 1170 × 2532, the block in it, the credit in the file
  n0 = seen.length;
  const p1 = await save(pc), j1 = jpegInfo(p1);
  ok(j1.jpeg && j1.w === 1170 && j1.h === 2532, `saved: a JPEG of exactly the phone's pixels (${j1.w} × ${j1.h})`);
  ok(asked(/upload\.wikimedia\.org/, n0).includes(ORIG), 'from the original (a crop of this panorama for a phone needs more than Commons\' 3,840 px thumbnail)');
  ok(j1.comment.startsWith(`${POTD} — King of Hearts. King of Hearts, CC BY-SA 3.0, via Wikimedia Commons. Licence: CC BY-SA 3.0 https://creativecommons.org/licenses/by-sa/3.0. Source: https://commons.wikimedia.org/wiki/File:`), `the credit in the file (${j1.comment.slice(0, 100)}…)`);
  const fr = (f.x - 0) / 1600; // where the block falls in the saved picture
  const bx0 = (1150 - f.x) / f.w, bx1 = (1450 - f.x) / f.w;
  const [blk, top] = await stats(pc, p1, [[Math.max(0.02, bx0 + 0.05), 0.35, Math.min(0.98, bx1 - 0.05), 0.65], [0.05, 0.03, 0.95, 0.22]]);
  ok(blk.sd > 60 && top.sd < 15, `its pixels: the checkered block where the crop put it (spread ${blk.sd}), the plain gradient above (${top.sd}) — crop from ${fr.toFixed(2)}`);
  const [d1, d1c] = await diffFrom(pc, p1, FX('busy.jpg'), [f, centred(f, 1600)]);
  ok(d1 < 6 && apart(d1, d1c), `… the crop's part of the picture, no other (mean difference ${d1}; a centred crop's ${d1c})`);
  ok(/Saved Lower-Manhattan-from-Jersey-City-November-2014-panorama-3-1170x2532\.jpg — 1,170 × 2,532/.test(await status(pc)) && /enlarged to fit/.test(await status(pc)), `the status line (${await status(pc)})`);
  // a monitor: Commons' 1,920 px thumbnail
  await screenTo(pc, 'm1920');
  n0 = seen.length;
  const p2 = await save(pc), j2 = jpegInfo(p2);
  ok(j2.w === 1920 && j2.h === 1080 && asked(/\/1920px-Lower_Manhattan/, n0).length === 1, `Full HD: 1920 × 1080, from Commons' 1,920 px thumbnail (${j2.w} × ${j2.h})`);
  f = await frame(pc, 1600, 1000);
  const [blk2, plain2] = await stats(pc, p2, [[(1170 - f.x) / f.w, (320 - f.y) / f.h, (1430 - f.x) / f.w, (680 - f.y) / f.h], [0.03, 0.05, 0.4, 0.3]]);
  ok(blk2.sd > 60 && plain2.sd < 15, `its pixels: the block (${blk2.sd}) and the plain gradient (${plain2.sd})`);
  const [d2] = await diffFrom(pc, p2, FX('busy.jpg'), [f]);
  ok(d2 < 6, `… the crop's part of the picture (mean difference ${d2})`);

  // ---------------------------------------------------------------- by hand: drag, keys, zoom; back to the subject
  f = await frame(pc, 1600, 1000);
  const bb = await pc.locator('.wp-frame').boundingBox(), stage = await pc.locator('.wp-stage').boundingBox();
  await screenTo(pc, 'p1170');
  const fp = await frame(pc, 1600, 1000), pb = await pc.locator('.wp-frame').boundingBox();
  await pc.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await pc.mouse.down();
  await pc.mouse.move(pb.x + pb.width / 2 - stage.width * 0.25, pb.y + pb.height / 2, { steps: 6 }); await pc.mouse.up();
  const fd = await frame(pc, 1600, 1000);
  ok(Math.abs((fp.x - fd.x) - 400) < 30 && /where you put it/.test(await how(pc)), `dragged a quarter of the picture to the left: ${fp.x.toFixed(0)} → ${fd.x.toFixed(0)} ("${await how(pc)}")`);
  await pc.locator('.wp-frame').focus(); await pc.keyboard.press('ArrowRight');
  const fk = await frame(pc, 1600, 1000);
  ok(Math.abs(fk.x - fd.x - 32) < 1.5, `the arrow keys: 2 % of the picture a press (${(fk.x - fd.x).toFixed(1)} px)`);
  await pc.keyboard.press('+');
  const fz = await frame(pc, 1600, 1000);
  ok(Math.abs(fz.w - fk.w * 0.8) < 1.5 && await pc.locator('input[aria-label="Zoom"]').inputValue() === '125', `+ zooms in (125 %: ${fk.w.toFixed(0)} → ${fz.w.toFixed(0)} px wide)`);
  await pc.locator('input[aria-label="Zoom"]').fill('200');
  const f200 = await frame(pc, 1600, 1000);
  ok(Math.abs(f200.w - fk.w / 2) < 1.5, `the zoom slider at 200 %: half the size (${f200.w.toFixed(0)})`);
  await pc.locator('input[aria-label="Zoom"]').fill('100');
  await pc.getByRole('button', { name: 'Centre on the subject' }).click();
  await until(pc, () => /busiest part/.test(document.querySelector('.wp-how')?.textContent || ''));
  const fc = await frame(pc, 1600, 1000);
  ok(fc.x <= 1162 && fc.x + fc.w >= 1438, `"Centre on the subject" puts it back on the block (${fc.x.toFixed(0)} – ${(fc.x + fc.w).toFixed(0)})`);
  ok(Math.abs(bb.width / bb.height - 16 / 9) < 0.02, 'the monitor\'s crop kept its shape on the screen');

  // ---------------------------------------------------------------- another size
  await screenTo(pc, 'custom');
  ok(await pc.locator('.wp-custom').isVisible(), '"Another size…": width and height boxes');
  await pc.getByLabel('Width in pixels').fill('50'); await pc.getByLabel('Width in pixels').dispatchEvent('change');
  ok(/A size of 100 to 8,192 pixels, in whole pixels\./.test(await status(pc)) && await pc.getByLabel('Width in pixels').inputValue() === '1920', `a width of 50 refused, the last one kept (${await status(pc)})`);
  await pc.getByLabel('Width in pixels').fill('800'); await pc.getByLabel('Width in pixels').dispatchEvent('change');
  await pc.getByLabel('Height in pixels').fill('800'); await pc.getByLabel('Height in pixels').dispatchEvent('change');
  await pc.waitForTimeout(300);
  const p3 = await save(pc), j3 = jpegInfo(p3);
  f = await frame(pc, 1600, 1000);
  ok(j3.w === 800 && j3.h === 800 && Math.abs(f.w - f.h) < 1 && Math.abs(f.h - 1000) < 2, `800 × 800: a square crop, the file ${j3.w} × ${j3.h}`);
  await screenTo(pc, 'turned');
  f = await frame(pc, 1600, 1000);
  ok(Math.abs(f.w / f.h - 1080 / 1920) < 0.01, 'this screen turned: 1080 × 1920');
  await pc.getByRole('button', { name: 'Close' }).click();
  ok(!(await pc.locator('dialog.wp-dlg[open]').count()), 'Close closes the picture');

  // ---------------------------------------------------------------- a face (the Met's pictures are face.jpg here)
  ok(await openPic(pc, '.wp-pick', 'Repose'), 'a Met highlight opened');
  ok(await until(pc, () => /face found/.test(document.querySelector('.wp-how')?.textContent || ''), null, 60000), `the face found: "${await how(pc)}"`);
  await screenTo(pc, 'p1170');
  const ff = await frame(pc, 1600, 600);
  ok(ff.x <= fb.x + 4 && ff.x + ff.w >= fb.x + fb.w - 4 && Math.abs(ff.h - 600) < 2, `a phone upright: the crop holds the face (${ff.x.toFixed(0)} – ${(ff.x + ff.w).toFixed(0)}; the face ${fb.x.toFixed(0)} – ${(fb.x + fb.w).toFixed(0)}; a centred crop would be ${(800 - ff.w / 2).toFixed(0)} – ${(800 + ff.w / 2).toFixed(0)})`);
  ok(/Repose/.test(await pc.locator('.wp-dlg-title').innerText()) && /Public domain \(CC0\)/.test(await pc.locator('.wp-info').innerText()) && await until(pc, () => /From Wikipedia: John White Alexander/.test(document.querySelector('.wp-story')?.textContent || '')), 'the Met: public domain, the artist\'s story');
  n0 = seen.length;
  const p4 = await save(pc), j4 = jpegInfo(p4);
  ok(j4.w === 1170 && j4.h === 2532 && asked(/images\.metmuseum\.org\/CRDImages\/.*\/original\//, n0).length === 1, `saved from the Met's original (${asked(/images\.metmuseum\.org/, n0).join(', ').slice(0, 120)})`);
  const [d4, d4c] = await diffFrom(pc, p4, FX('face.jpg'), [ff, centred(ff, 1600)]);
  ok(d4 < 6 && apart(d4, d4c), `its pixels: the face's part of the picture (mean difference ${d4}; a centred crop's ${d4c})`);
  await pc.getByRole('button', { name: 'Close' }).click();

  // ---------------------------------------------------------------- the Art Institute: its IIIF width
  ok(await openPic(pc, '.wp-pick', 'The Bedroom'), 'an Art Institute highlight opened');
  await screenTo(pc, 'm3840');
  n0 = seen.length;
  const p5 = await save(pc), j5 = jpegInfo(p5);
  const iiif = asked(/www\.artic\.edu\/iiif\/2\/[0-9a-f-]+\/full\/\d+,\/0\/default\.jpg/, n0).filter((u) => !/\/full\/500,\//.test(u)); // not the grid's thumbnails
  ok(j5.w === 3840 && j5.h === 2160 && iiif.length === 1 && /\/full\/3840,\//.test(iiif[0]), `4K from the Art Institute's IIIF server at the width needed (${iiif[0]})`);
  ok(/Text: Art Institute of Chicago, CC BY 4\.0/.test(await pc.locator('.wp-info').innerText()), 'the Art Institute\'s description with the credit its licence asks');
  await pc.getByRole('button', { name: 'Close' }).click();

  // ---------------------------------------------------------------- a tall painting: the picture and the crop drawn alike
  const tp = await page({ viewport: { width: 1280, height: 900 } });
  await open(tp);
  await tp.getByRole('button', { name: 'More pictures' }).click();
  await tp.locator('.wp-tile').filter({ hasText: 'The Assumption of the Virgin' }).first().waitFor({ timeout: 20000 });
  ok(await openPic(tp, '.wp-tile', 'The Assumption of the Virgin'), 'a tall painting opened (after More: the Art Institute\'s next page)');
  const geo = async (p) => p.evaluate(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }; return { stage: r('.wp-stage'), img: r('.wp-pimg'), frame: r('.wp-frame'), vh: innerHeight }; });
  let g = await geo(tp);
  ok(Math.abs(g.img.w / g.img.h - 0.5) < 0.01 && Math.abs(g.stage.w - g.img.w) < 1 && Math.abs(g.stage.h - g.img.h) < 1 && g.stage.h <= g.vh * 0.7 + 1, `the stage takes the picture's shape, no taller than 70 % of the window (${g.stage.w.toFixed(0)} × ${g.stage.h.toFixed(0)} of ${g.vh})`);
  await screenTo(tp, 'm1920');
  g = await geo(tp);
  const ft = await frame(tp, 600, 1200);
  ok(g.frame.x >= g.img.x - 1 && g.frame.x + g.frame.w <= g.img.x + g.img.w + 1 && g.frame.y >= g.img.y - 1 && g.frame.y + g.frame.h <= g.img.y + g.img.h + 1 && Math.abs(g.frame.w - g.img.w) < 1.5, 'a monitor\'s crop drawn inside the picture, as wide as it');
  ok(ft.y <= 800 + 6 && ft.y + ft.h >= 1000 - 6, `… on the block low down (${ft.y.toFixed(0)} – ${(ft.y + ft.h).toFixed(0)}; the block 800 – 1000)`);
  const p7 = await save(tp), j7 = jpegInfo(p7);
  const [d7, d7c] = await diffFrom(tp, p7, FX('tall.jpg'), [ft, { x: 0, y: 600 - ft.h / 2, w: ft.w, h: ft.h }]);
  ok(j7.w === 1920 && j7.h === 1080 && d7 < 6 && apart(d7, d7c), `saved: 1920 × 1080 of the crop's part (mean difference ${d7}; a centred crop's ${d7c})`);
  ok(!tp.errors.length, `no page errors ${tp.errors.join(' | ')}`);
  await tp.close();

  // ---------------------------------------------------------------- axe-core, both themes, with and without the picture
  for (const scheme of ['light', 'dark']) {
    const ax = await page({ viewport: { width: 1280, height: 900 }, colorScheme: scheme, bypassCSP: true });
    await open(ax);
    await until(ax, () => document.querySelectorAll('.wp-pick img[src^="blob:"]').length === 3);
    await ax.addScriptTag({ content: AXE });
    const run = () => ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    const v1 = await run();
    ok(!v1.length, `axe (${scheme}): the tab — ${v1.join(' | ')}`);
    await openPic(ax, '.wp-pick', 'The Bedroom');
    await until(ax, () => /From Wikipedia/.test(document.querySelector('.wp-story')?.textContent || ''));
    const v2 = await run();
    ok(!v2.length, `axe (${scheme}): a picture opened — ${v2.join(' | ')}`);
    ok(!ax.errors.length, `no page errors (${scheme}) ${ax.errors.join(' | ')}`);
    await ax.close();
  }

  // ---------------------------------------------------------------- Wikimedia busy (HTTP 429): said, the museums shown
  const busy = await page({ viewport: { width: 1280, height: 900 } }, { commons: 429, feed: 429 });
  await busy.goto(`${base}#/wallpapers`);
  await until(busy, () => !document.querySelector('.wp-grid[aria-busy]') && document.querySelectorAll('.wp-tile').length > 0 && document.querySelectorAll('.wp-pick').length > 0);
  const bs = await busy.locator('.wp-grid-state').innerText();
  ok(/Wikimedia is busy — it limits how often it is asked\. Try again in a minute\./.test(bs) && (await tiles(busy)).length === 20, `Commons refused: said, the museums' 20 pictures shown (${bs})`);
  ok(/Wikimedia is busy/.test(await busy.locator('.wp-picks-note').innerText()) && await busy.locator('.wp-pick').count() === 2, 'the feed refused: said, the museums\' two picks shown');
  ok(!busy.errors.filter((e) => !/429|Failed to load resource/.test(e)).length, `no page errors ${busy.errors.join(' | ')}`);
  await busy.close();

  // ---------------------------------------------------------------- the phone
  const ph = await page(devices['iPhone 13']);
  await open(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no sideways scroll');
  const rowScroll = await ph.locator('.wp-picks').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, snap: getComputedStyle(e).scrollSnapType }));
  ok(rowScroll.sw > rowScroll.cw && /x/.test(rowScroll.snap), `phone: today's picks in a row that scrolls sideways (${rowScroll.sw} > ${rowScroll.cw})`);
  const chip = await ph.locator('.wp-chip').first().boundingBox();
  ok(chip.height >= 44, `phone: the topics ≥ 44 px tall (${chip.height})`);
  await ph.locator('.wp-tile').filter({ hasText: 'Stacks of Wheat' }).first().click();
  await ph.locator('dialog.wp-dlg[open]').waitFor();
  await until(ph, () => /crop/.test(document.querySelector('.wp-how')?.textContent || ''), null, 60000);
  const dl = await ph.locator('dialog.wp-dlg').boundingBox(), sv = await ph.getByRole('button', { name: 'Save wallpaper' }).boundingBox();
  const vp = ph.viewportSize();
  ok(dl.width >= vp.width - 1 && dl.height >= vp.height - 1, `phone: the picture opens full screen (${dl.width} × ${dl.height})`);
  ok(sv.height >= 44 && sv.y + sv.height <= vp.height + 1 && sv.y > vp.height * 0.7, `phone: Save in the bar at the foot (${Math.round(sv.y)}, ${sv.height} px tall)`);
  ok(/This screen, 1170 × 2532/.test(await ph.locator('select[aria-label="The screen it is for"] option').first().innerText()), 'phone: this screen in its own pixels (iPhone 13: 1170 × 2532)');
  const p6 = await save(ph), j6 = jpegInfo(p6);
  ok(j6.w === 1170 && j6.h === 2532, `phone: the wallpaper saved (${j6.w} × ${j6.h})`);
  await ph.getByRole('button', { name: 'Close' }).click();
  await ph.getByRole('button', { name: 'More pictures' }).click();
  await ph.locator('.wp-tile').filter({ hasText: 'The Assumption of the Virgin' }).first().waitFor({ timeout: 20000 });
  await openPic(ph, '.wp-tile', 'The Assumption of the Virgin');
  const gp = await geo(ph);
  ok(Math.abs(gp.stage.w - gp.img.w) < 1 && Math.abs(gp.stage.h - gp.img.h) < 1 && gp.stage.h <= gp.vh * 0.52 + 1 && Math.abs(gp.stage.x + gp.stage.w / 2 - vp.width / 2) < 2, `phone: a tall painting no taller than half the screen, centred (${gp.stage.w.toFixed(0)} × ${gp.stage.h.toFixed(0)})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);

  // ---------------------------------------------------------------- leaving: the dialog and the blob URLs go
  const kept = await released(pc, 'wallpapers');
  ok(!kept.length && !(await pc.locator('dialog.wp-dlg').count()), `the tab left: its dialog removed, no blob URL kept (${JSON.stringify(kept).slice(0, 200)})`);
  const live = await pc.evaluate(() => globalThis.__superutilsLive?.());
  ok(live && live.workers === 0, `… and no worker left (${JSON.stringify(live)})`);
  // coming back: the picks and the search as they were, without asking again
  n0 = seen.length;
  await pc.evaluate(() => { location.hash = '#/wallpapers'; });
  await pc.locator('.wp-pick').first().waitFor();
  await until(pc, () => document.querySelectorAll('.wp-tile').length === 21);
  ok(!asked(/feed\/featured|commons\.wikimedia\.org|v1\.1\/search|artworks\/search/, n0).length, 'back in the tab: today\'s picks and the pictures found shown again without asking');
  ok(!pc.errors.length, `no page errors ${pc.errors.join(' | ')}`);
  info(`face (Blur & Redact): ${Math.round(fb.x)}, ${Math.round(fb.y)}, ${Math.round(fb.w)} × ${Math.round(fb.h)}`);
};
