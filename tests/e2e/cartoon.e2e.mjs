// Cartoonizer (#/cartoon): real portrait (NASA astronaut photo, public domain).
// Filters (imgproc.wasm): each filter's known signature on the preview canvas (k-means colours, grey sketch, smoother oil,
// brighter watercolour, halftone dots), full-size save matches the preview at 2400 px (size-scaled filter parameters).
// AI styles (Magenta on TF.js): identity at strength 0, colour direction of the Flames / Night swirls styles, own painting
// as the style, compare button, JPEG save, and WebGL vs WebAssembly giving the same picture.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { imageInfo, decodeInPage } from '../lib/imgcheck.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const STATUS = '[aria-live="polite"].muted';

// pixel statistics of the result canvas (optionally against window.__orig, the photo at the same size)
const stats = (page) => page.evaluate(() => {
  const c = document.querySelector('canvas.ed-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, n = d.length / 4;
  const counts = new Map(); let grey = 0, lum = 0, grad = 0, r = 0, b = 0, mad = 0;
  const o = window.__orig && window.__orig.length === d.length ? window.__orig : null;
  for (let i = 0; i < d.length; i += 4) {
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; counts.set(k, (counts.get(k) || 0) + 1);
    if (Math.abs(d[i] - d[i + 1]) <= 2 && Math.abs(d[i + 1] - d[i + 2]) <= 2) grey++;
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; lum += l; r += d[i]; b += d[i + 2];
    if ((i / 4) % c.width) grad += Math.abs(l - (0.299 * d[i - 4] + 0.587 * d[i - 3] + 0.114 * d[i - 2]));
    if (o) mad += (Math.abs(d[i] - o[i]) + Math.abs(d[i + 1] - o[i + 1]) + Math.abs(d[i + 2] - o[i + 2])) / 3;
  }
  const top = [...counts.values()].sort((a, b) => b - a);
  const cover = (k) => top.slice(0, k).reduce((a, v) => a + v, 0) / n;
  let sig = 0; for (let i = 0; i < d.length; i += 4) sig = (sig * 31 + d[i] + 7 * d[i + 1] + 13 * d[i + 2]) >>> 0;
  return { sig, w: c.width, h: c.height, colours: counts.size, top10: cover(10), top4: cover(4), grey: grey / n, lum: lum / n, grad: grad / n, rb: (r - b) / n, mad: o ? mad / n : null };
});
// keep the photo's own pixels at canvas size for comparisons
const keepOriginal = (page, path, w, h) => page.evaluate(async ({ b64, w, h }) => {
  const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
  window.__orig = g.getImageData(0, 0, w, h).data;
}, { b64: readFileSync(path).toString('base64'), w, h });
const waitStatus = (page, re, timeout = 60000) => page.waitForFunction(([sel, src]) => new RegExp(src).test(document.querySelector(sel)?.textContent || ''), [STATUS, re.source], { timeout });
const renders = (page) => page.evaluate(() => +(document.querySelector('canvas.ed-canvas')?.dataset.n || 0));
// move a slider and wait for the new result
const setSlider = async (page, label, v) => {
  const n = await renders(page);
  await page.evaluate(({ label, v }) => {
    const r = [...document.querySelectorAll('.slider')].find((s) => s.querySelector('.slider-head span')?.textContent === label)?.querySelector('input');
    r.value = v; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change'));
  }, { label, v });
  return n;
};
const waitRender = (page, n, timeout = 180000) => page.waitForFunction((n) => +(document.querySelector('canvas.ed-canvas')?.dataset.n || 0) > n, n, { timeout });
// a fresh AI result: wait until the status shows a finished run different from `before`
const nextAi = async (page, before, timeout = 180000) => {
  await page.waitForFunction(([sel, b]) => { const t = document.querySelector(sel)?.textContent || ''; return t !== b && /s on |Could not/.test(t); }, [STATUS, before], { timeout });
  return page.locator(STATUS).first().textContent();
};

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/cartoon');
  await page.locator('input[type=file]').first().setInputFiles(F('astronaut.png'));
  await waitStatus(page, /^Cartoon · \d+ ms$/);
  await keepOriginal(page, F('astronaut.png'), 512, 512);
  const photo = await page.evaluate(() => { const o = window.__orig; let g = 0, n = 0; for (let i = 4; i < o.length; i += 4) { if ((i / 4) % 512) { g += Math.abs((0.299 * o[i] + 0.587 * o[i + 1] + 0.114 * o[i + 2]) - (0.299 * o[i - 4] + 0.587 * o[i - 3] + 0.114 * o[i - 2])); } n++; } return { grad: g / n }; });

  // ---- filter tiles: six, each with a painted thumbnail
  const tiles = page.locator('.fx-tile[data-fx]');
  ok(await tiles.count() === 6, 'six filter tiles');
  await page.waitForTimeout(1500);
  const painted = await page.evaluate(() => [...document.querySelectorAll('.fx-tile[data-fx] canvas')].filter((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]; return s > 0; }).length);
  ok(painted === 6, `filter thumbnails show the photo (${painted}/6)`);

  // ---- Cartoon: flat colours (k-means) + ink lines
  const cart = await stats(page);
  info(`cartoon: top-10 colours cover ${(cart.top10 * 100).toFixed(0)} %, ${cart.colours} colours, mad ${cart.mad.toFixed(1)}`);
  ok(cart.top10 > 0.5, `cartoon: 10 flat colours cover most of the picture (${(cart.top10 * 100).toFixed(0)} %)`);
  ok(cart.mad > 3 && cart.mad < 45, `cartoon: still the same photo (mean difference ${cart.mad.toFixed(1)})`);
  await waitRender(page, await setSlider(page, 'Colours', 4));
  const cart4 = await stats(page);
  ok(cart4.top4 > 0.5 && cart4.top4 > cart.top4, `cartoon with 4 colours: top-4 cover ${(cart4.top4 * 100).toFixed(0)} %`);

  const pickFx = async (name) => { const before = await page.locator(STATUS).first().textContent(); await page.getByRole('radio', { name }).click(); await page.waitForFunction(([sel, b, n]) => { const t = document.querySelector(sel)?.textContent || ''; return t !== b && t.startsWith(n + ' · '); }, [STATUS, before, name]); await page.waitForTimeout(200); return stats(page); };
  // ---- Pencil sketch: pure grey, mostly white paper
  const sk = await pickFx('Pencil sketch');
  ok(sk.grey > 0.99, `pencil sketch is greyscale (${(sk.grey * 100).toFixed(1)} % grey pixels)`);
  ok(sk.lum > 150, `pencil sketch is mostly white paper (mean luminance ${sk.lum.toFixed(0)})`);
  ok(await page.getByText('Stroke softness').isVisible(), 'sketch shows its own setting (stroke softness)');
  const csk = await pickFx('Colour pencil');
  ok(csk.grey < 0.9, `colour pencil keeps colour (${(csk.grey * 100).toFixed(0)} % grey)`);
  // ---- Oil paint: Kuwahara smooths texture
  const oil = await pickFx('Oil paint');
  ok(oil.grad < photo.grad * 0.85, `oil paint is smoother than the photo (edge energy ${oil.grad.toFixed(1)} vs ${photo.grad.toFixed(1)})`);
  // ---- Watercolour: lifted, paper-like tones
  const wc = await pickFx('Watercolour');
  const photoLum = await page.evaluate(() => { const o = window.__orig; let s = 0; for (let i = 0; i < o.length; i += 4) s += 0.299 * o[i] + 0.587 * o[i + 1] + 0.114 * o[i + 2]; return s / (o.length / 4); });
  ok(wc.lum > photoLum + 5, `watercolour is lighter, like paper (${wc.lum.toFixed(0)} vs ${photoLum.toFixed(0)})`);
  ok(await page.getByText('Watercolour has no settings').isVisible(), 'watercolour explains it has no settings');
  // ---- Comic: halftone dots + posterised
  const cm = await pickFx('Comic');
  ok(cm.top10 > 0.3 && Math.abs(cm.mad - cart.mad) > 0.5, `comic: posterised halftone (top-10 ${(cm.top10 * 100).toFixed(0)} %)`);
  await waitRender(page, await setSlider(page, 'Dot size', 14));
  const cm14 = await stats(page);
  ok(cm14.sig !== cm.sig, 'comic: dot size changes the picture');

  // ---- Save (filters) at full size
  await page.getByRole('radio', { name: 'Cartoon' }).click();
  await waitStatus(page, /^Cartoon · \d+ ms$/);
  const p1 = await download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  const i1 = imageInfo(p1);
  ok(i1.type === 'jpeg' && i1.width === 512 && i1.height === 512, `cartoon saves a full-size JPEG (${i1.width}×${i1.height})`);

  // ---- big photo: the 2400 px save looks like the 1200 px preview (filter sizes scale with the image)
  const big = Buffer.from(await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(2400, 2400), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, 2400, 2400);
    const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    return [...new Uint8Array(await b.arrayBuffer())];
  }, readFileSync(F('astronaut.png')).toString('base64')));
  await page.locator('input[type=file]').first().setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: big });
  await page.waitForFunction(() => document.querySelector('canvas.ed-canvas')?.width === 1200);
  await waitStatus(page, /^Cartoon · \d+ ms$/, 120000); await page.waitForTimeout(300);
  const p2 = await download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  const i2 = imageInfo(p2);
  ok(i2.width === 2400 && i2.height === 2400, `big photo saved at full size (${i2.width}×${i2.height})`);
  const same = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(1200, 1200), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, 1200, 1200);
    const a = g.getImageData(0, 0, 1200, 1200).data, pv = document.querySelector('canvas.ed-canvas'), b = pv.getContext('2d').getImageData(0, 0, 1200, 1200).data;
    let s = 0; for (let i = 0; i < a.length; i += 4) s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    return s / (a.length / 4);
  }, readFileSync(p2).toString('base64'));
  info(`2400 px save vs 1200 px preview: mean difference ${same.toFixed(1)}`);
  ok(same < 20, `full-size save matches the preview (mean difference ${same.toFixed(1)})`);

  // ---- AI art styles (back to the 512 px photo)
  await page.locator('input[type=file]').first().setInputFiles(F('astronaut.png'));
  await waitStatus(page, /^Cartoon · \d+ ms$/);
  let before = await page.locator(STATUS).first().textContent();
  await page.getByRole('radio', { name: 'AI art styles' }).click();
  let st = await nextAi(page, before, 240000);
  info(`AI (auto): ${st}`);
  ok(/^Night swirls · 512×512 · [\d.]+ s on (the GPU \(WebGL\)|WebAssembly)$/.test(st), `AI style ran on the GPU or WebAssembly: "${st}"`);
  ok(await page.locator('.fx-tile[data-style]').count() === 8, 'eight built-in styles');
  const swirl = await stats(page);
  ok(swirl.mad > 15 && swirl.mad < 90, `default 70 % strength: styled but recognisable (mean difference ${swirl.mad.toFixed(1)})`);
  ok(swirl.rb < 0, `Night swirls makes the photo bluer (R−B ${swirl.rb.toFixed(0)})`);
  before = st; await page.getByRole('radio', { name: 'Flames' }).click(); st = await nextAi(page, before);
  const fl = await stats(page);
  ok(/^Flames · /.test(st) && fl.rb > swirl.rb + 40, `Flames makes it red/orange (R−B ${fl.rb.toFixed(0)} vs ${swirl.rb.toFixed(0)})`);
  await waitRender(page, await setSlider(page, 'Strength', 0)); st = await page.locator(STATUS).first().textContent();
  const s0 = await stats(page);
  ok(s0.mad < 45 && s0.mad < fl.mad - 10, `strength 0 gives back the photo (mean difference ${s0.mad.toFixed(1)} vs ${fl.mad.toFixed(1)} at 70 %)`);
  await waitRender(page, await setSlider(page, 'Strength', 100)); st = await page.locator(STATUS).first().textContent();
  const s100 = await stats(page);
  ok(s100.mad > fl.mad, `strength 100 is stronger than 70 % (${s100.mad.toFixed(1)} > ${fl.mad.toFixed(1)})`);
  // compare: hold shows the original
  const cmp = page.getByRole('button', { name: 'Hold to compare' });
  await cmp.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const bb = await cmp.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(150);
  const held = await stats(page);
  await page.mouse.up(); await page.waitForTimeout(150);
  const released = await stats(page);
  ok(held.mad < 3, `hold to compare shows the original (mean difference ${held.mad.toFixed(1)})`);
  ok(Math.abs(released.mad - s100.mad) < 0.5, 'releasing shows the result again');
  // the keyboard: Space held on the focused button
  await cmp.focus(); await page.keyboard.down('Space'); await page.waitForTimeout(150);
  const kheld = await stats(page);
  await page.keyboard.up('Space'); await page.waitForTimeout(150);
  const kback = await stats(page);
  ok(kheld.mad < 3 && Math.abs(kback.mad - s100.mad) < 0.5, `Space held on the focused button compares too (${kheld.mad.toFixed(1)} → ${kback.mad.toFixed(1)})`);
  // own painting as the style
  before = st;
  await page.locator('input[type=file]').nth(1).setInputFiles(F('flower.jpg'));
  st = await nextAi(page, before);
  ok(/^Your painting · /.test(st), `own painting used as the style: "${st}"`);
  ok(await page.locator('.fx-tile.on[data-style^="own"]').count() === 1, 'own painting tile added and selected');

  // one painting at a time: a burst of strength changes paints at most twice (the one under way and the newest),
  // and Save meanwhile does not give the older picture under the new settings
  const n0 = await renders(page);
  for (const v of [10, 20, 30, 40, 50]) await setSlider(page, 'Strength', v);
  ok(/your new choice follows/.test(await page.locator(STATUS).first().textContent()), `a change while painting waits for it ("${await page.locator(STATUS).first().textContent()}")`);
  let got = null; page.once('download', (dl) => { got = dl; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  ok(await page.locator('.toast', { hasText: 'The painting is still being made' }).first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'Save while the new painting is being made: "still being made"');
  await page.waitForTimeout(300);
  ok(got === null, '… and nothing is downloaded');
  await page.waitForFunction(([sel]) => / s on /.test(document.querySelector(sel)?.textContent || ''), [STATUS], { timeout: 240000 });
  await page.waitForTimeout(4000);
  const nb = (await renders(page)) - n0;
  ok(nb >= 1 && nb <= 2 && / s on /.test(await page.locator(STATUS).first().textContent()), `five changes → ${nb} painting(s), not five`);
  const p3 = await download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  const i3 = imageInfo(p3), d3 = await decodeInPage(page, p3);
  ok(i3.type === 'jpeg' && i3.width === 512 && i3.height === 512 && /your-painting/.test(p3), `AI result saved as JPEG (${i3.width}×${i3.height}, ${p3.split('/').pop()})`);
  ok(d3.mean[0] + d3.mean[1] + d3.mean[2] > 60, 'saved picture is not blank');
  const errs = page.errors.filter((e) => !/^Error: The painting is still being made/.test(e)); // the refusal above, logged by the button
  ok(errs.length === 0, `no page errors: ${errs.join(' | ')}`);

  // ---- a see-through photo (a cut-out from the Background Remover) is painted as if on white, in both engines
  const pair = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const mk = async (white) => {
      const c = new OffscreenCanvas(192, 192), g = c.getContext('2d'); g.drawImage(bmp, 0, 0, 192, 192);
      if (white) { g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 192); } else g.clearRect(0, 0, 96, 192);
      return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())];
    };
    return [await mk(false), await mk(true)];
  }, readFileSync(F('astronaut.png')).toString('base64'));
  const tp = await newPage();
  await tp.goto(base + '#/cartoon?backend=wasm');
  const pixels = () => tp.evaluate(() => { const c = document.querySelector('canvas.ed-canvas'); return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]; });
  const diffOf = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; return d / (a.length / 4); };
  const leftLum = (px) => { let l = 0, n = 0; for (let y = 0; y < 192; y++) for (let x = 0; x < 80; x++) { const i = (y * 192 + x) * 4; l += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; n++; } return l / n; };
  const fxOf = async (buf, name) => { const b = await renders(tp); await tp.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(buf) }); await waitRender(tp, b); await waitStatus(tp, /^Cartoon · \d+ ms$/); return pixels(); };
  const fxT = await fxOf(pair[0], 'cutout.png'), fxW = await fxOf(pair[1], 'white.png');
  ok(leftLum(fxT) > 200 && diffOf(fxT, fxW) < 1, `filters: the see-through half is white paper, as for the same photo on white (lum ${leftLum(fxT).toFixed(0)}, diff ${diffOf(fxT, fxW).toFixed(2)})`);
  const aiOf = async (buf, name) => {
    const b0 = await tp.locator(STATUS).first().textContent();
    await tp.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(buf) });
    await tp.waitForFunction(([sel, b]) => { const t = document.querySelector(sel)?.textContent || ''; return t !== b && /Painting|Reading|Loading/.test(t); }, [STATUS, b0], { timeout: 60000 }).catch(() => {});
    await tp.waitForFunction(([sel]) => / s on |Could not/.test(document.querySelector(sel)?.textContent || ''), [STATUS], { timeout: 240000 });
    return pixels();
  };
  const tb = await tp.locator(STATUS).first().textContent();
  await tp.getByRole('radio', { name: 'AI art styles' }).click();
  await nextAi(tp, tb, 240000);
  const aiW = await aiOf(pair[1], 'white.png'), aiT = await aiOf(pair[0], 'cutout.png');
  ok(aiT.length === aiW.length && diffOf(aiT, aiW) < 1, `AI style: the see-through photo is painted as the same photo on white (diff ${diffOf(aiT, aiW).toFixed(2)}, left lum ${leftLum(aiT).toFixed(0)})`);
  ok(tp.errors.length === 0, `no page errors (see-through photo): ${tp.errors.join(' | ')}`);

  // ---- WebGL and WebAssembly backends paint the same picture (small photo keeps software WebGL quick)
  const small = Buffer.from(await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(128, 128), g = c.getContext('2d'); g.drawImage(bmp, 0, 0, 128, 128);
    return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())];
  }, readFileSync(F('astronaut.png')).toString('base64')));
  const run = async (backend) => {
    const p = await newPage();
    await p.goto(base + `#/cartoon?backend=${backend}`);
    await p.locator('input[type=file]').first().setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: small });
    await waitStatus(p, /^Cartoon · \d+ ms$/);
    const b0 = await p.locator(STATUS).first().textContent();
    await p.getByRole('radio', { name: 'AI art styles' }).click();
    const s = await nextAi(p, b0, 300000);
    const px = await p.evaluate(() => { const c = document.querySelector('canvas.ed-canvas'); return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]; });
    return { s, px, errors: p.errors };
  };
  const [gl, wa] = await Promise.all([run('webgl'), run('wasm')]);
  info(`webgl: ${gl.s} | wasm: ${wa.s}`);
  ok(/WebGL/.test(gl.s) && /WebAssembly/.test(wa.s), 'forced backends ran (WebGL, WebAssembly)');
  let diff = 0; for (let i = 0; i < gl.px.length; i += 4) diff += (Math.abs(gl.px[i] - wa.px[i]) + Math.abs(gl.px[i + 1] - wa.px[i + 1]) + Math.abs(gl.px[i + 2] - wa.px[i + 2])) / 3;
  diff /= gl.px.length / 4;
  ok(gl.px.length === wa.px.length && diff < 4, `WebGL and WebAssembly agree (mean difference ${diff.toFixed(2)})`);
  ok(gl.errors.length + wa.errors.length === 0, `no page errors on either backend: ${[...gl.errors, ...wa.errors].join(' | ')}`);

  // ---- phone
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/cartoon');
  await phone.locator('input[type=file]').first().setInputFiles(F('chelsea.png'));
  await waitStatus(phone, /^Cartoon · \d+ ms$/);
  await phone.getByRole('radio', { name: 'AI art styles' }).click();
  ok(await phone.getByRole('radio', { name: 'Fine', exact: true }).count() === 1 && await phone.getByRole('radio', { name: 'Finest' }).count() === 0, 'phone: brush strokes Fine (1536 px) / Medium / Bold — no Finest (4096 px)');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  const tileW = await phone.locator('.fx-tile[data-style]').first().evaluate((e) => e.getBoundingClientRect().height);
  ok(tileW >= 44, `phone: style tiles are big enough to tap (${Math.round(tileW)} px)`);
};
