// Cartoonizer (#/cartoon), to-do #16 ("too coarse-grained. Make it more fine-grained with more detail, more like the Prisma
// app"): the AI styles painted larger — in tiles above 1024 px, each tile normalised by the statistics of the whole
// picture — and the filters' Detail setting. Measured, not guessed: "detail kept" = the correlation between the edges
// (Sobel magnitudes) of the result and of the photo, at the photo's size; the tiles checked against the one-pass painting.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { imageInfo } from '../lib/imgcheck.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const STATUS = '[aria-live="polite"].muted';

/** In the page: the correlation of the edges of `a` (RGBA, W × H) with those of `b` (the same size) */
const EDGES = `(a, b, W, H) => {
  const sob = (d) => { const l = new Float32Array(W * H); for (let i = 0; i < W * H; i++) l[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const g = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x;
      const gx = l[i - W + 1] + 2 * l[i + 1] + l[i + W + 1] - l[i - W - 1] - 2 * l[i - 1] - l[i + W - 1];
      const gy = l[i + W - 1] + 2 * l[i + W] + l[i + W + 1] - l[i - W - 1] - 2 * l[i - W] - l[i - W + 1];
      g[i] = Math.hypot(gx, gy); }
    return g; };
  const p = sob(a), q = sob(b); let mp = 0, mq = 0; for (let i = 0; i < p.length; i++) { mp += p[i]; mq += q[i]; } mp /= p.length; mq /= q.length;
  let c = 0, vp = 0, vq = 0; for (let i = 0; i < p.length; i++) { const u = p[i] - mp, v = q[i] - mq; c += u * v; vp += u * u; vq += v * v; }
  return c / Math.sqrt(vp * vq); }`;
/** the canvas result now, as RGBA */
const canvasPixels = (page) => page.evaluate(() => { const c = document.querySelector('canvas.ed-canvas'); return { w: c.width, h: c.height, d: [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data] }; });
const nextAi = async (page, before, timeout = 400000) => {
  await page.waitForFunction(([sel, b]) => { const t = document.querySelector(sel)?.textContent || ''; return t !== b && /s on |Could not/.test(t); }, [STATUS, before], { timeout });
  return page.locator(STATUS).first().textContent();
};
/** every status line the tab shows, kept in the page */
const watchStatus = (page) => page.evaluate((sel) => { window.__said = []; const el = document.querySelector(sel); new MutationObserver(() => window.__said.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); }, STATUS);

export default async ({ base, page: newPage, ok, info, download }) => {
  // a 900 × 600 photo: the coffee cup drawn larger by the browser
  const scaled = async (page, path, w, h) => Buffer.from(await page.evaluate(async ({ b64, w, h }) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
    return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())];
  }, { b64: readFileSync(path).toString('base64'), w, h }));

  // ---- tiles give the one-pass painting back when they are normalised by the whole picture's statistics at their scale
  const paintAt = async (route, photo) => {
    const p = await newPage();
    await p.goto(base + route);
    await p.locator('input[type=file]').first().setInputFiles({ name: 'cup.png', mimeType: 'image/png', buffer: photo });
    await p.waitForFunction((sel) => /^Cartoon · \d+ ms$/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 60000 });
    await watchStatus(p);
    await p.getByRole('radio', { name: 'AI art styles' }).click();
    const st = await nextAi(p, '');
    return { p, st, px: await canvasPixels(p), said: await p.evaluate(() => window.__said) };
  };
  const probe = await newPage();
  const cup = await scaled(probe, F('coffee.jpg'), 900, 600);
  const one = await paintAt('#/cartoon?backend=wasm', cup), tl = await paintAt('#/cartoon?backend=wasm&tiles=same', cup);
  ok(/^Night swirls · 900×600 · [\d.]+ s on WebAssembly$/.test(one.st) && /^Night swirls · 900×600 · /.test(tl.st), `Medium paints the 900 px photo at its own size, in one pass and in tiles ("${one.st}" / "${tl.st}")`);
  const progress = tl.said.filter((t) => /Painting your photo at 900 px… \d+ %/.test(t));
  ok(progress.length >= 3 && !one.said.some((t) => / %/.test(t)), `tiles report their progress (${progress.slice(0, 4).join(' · ')}…); one pass does not`);
  { let s = 0, mx = 0; for (let i = 0; i < one.px.d.length; i += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(one.px.d[i + c] - tl.px.d[i + c]); s += d; if (d > mx) mx = d; }
    const mean = s / (one.px.d.length / 4 * 3);
    ok(mean < 1.5, `six tiles of 512 px (96 px overlap) fed the whole picture's statistics give the one-pass painting back: mean difference ${mean.toFixed(2)} of 255 (largest ${mx})`); }
  await one.p.close(); await tl.p.close();

  // ---- Fine against Bold on a real photo of 1800 × 1300 (a book page): the painting at the photo's size keeps its detail
  const page = await newPage();
  await page.goto(base + '#/cartoon?backend=wasm');
  await page.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
  await page.waitForFunction((sel) => /^Cartoon · \d+ ms$/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 60000 });
  // the photo at its size, for the measures (the result is drawn up to it)
  await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    window.__photo = { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data };
  }, readFileSync(F('book-page.jpg')).toString('base64'));
  const kept = (path) => page.evaluate(async ({ b64, edges }) => {
    const f = eval(edges), P = window.__photo;
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(P.w, P.h), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, P.w, P.h);
    return f(g.getImageData(0, 0, P.w, P.h).data, P.d, P.w, P.h);
  }, { b64: readFileSync(path).toString('base64'), edges: EDGES });
  // filters first: Detail Fine (the default) against Bold, on the 1200 px preview
  ok(await page.getByRole('radio', { name: 'Fine', exact: true }).first().getAttribute('aria-checked') === 'true', 'filters: Detail starts at Fine');
  const fxKept = () => page.evaluate((edges) => {
    const f = eval(edges), c = document.querySelector('canvas.ed-canvas'), P = window.__photo;
    const o = new OffscreenCanvas(c.width, c.height), g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
    const t = new OffscreenCanvas(P.w, P.h); t.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(P.d), P.w, P.h), 0, 0); g.drawImage(t, 0, 0, c.width, c.height);
    return f(c.getContext('2d').getImageData(0, 0, c.width, c.height).data, g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  }, EDGES);
  const fineFx = await fxKept();
  const n0 = await page.evaluate(() => +(document.querySelector('canvas.ed-canvas')?.dataset.n || 0));
  await page.getByRole('radio', { name: 'Bold', exact: true }).first().click();
  await page.waitForFunction((n) => +(document.querySelector('canvas.ed-canvas')?.dataset.n || 0) > n, n0, { timeout: 60000 });
  const boldFx = await fxKept();
  ok(fineFx > boldFx + 0.03 && fineFx > 0.92, `Cartoon filter: Detail Fine keeps more of the photo's edges than Bold (correlation ${fineFx.toFixed(3)} against ${boldFx.toFixed(3)})`);
  info(`Cartoon filter, detail kept: Fine ${fineFx.toFixed(3)}, Bold ${boldFx.toFixed(3)}`);
  // AI styles: Bold (512 px), then Fine (the photo's 1800 px, in tiles)
  await page.getByRole('radio', { name: 'AI art styles' }).click();
  let st = await nextAi(page, '');
  ok(/^Night swirls · 1024×740 · /.test(st), `AI styles start at Medium on WebAssembly: ${st}`);
  info(`Medium: ${st}`);
  await page.getByRole('radio', { name: 'Bold', exact: true }).last().click();
  st = await nextAi(page, st);
  const bold = await download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  await watchStatus(page);
  await page.getByRole('radio', { name: 'Fine', exact: true }).last().click();
  st = await nextAi(page, st);
  const said = await page.evaluate(() => window.__said);
  ok(/^Night swirls · 1800×1300 · /.test(st) && said.some((t) => /Painting your photo at 1800 px… \d+ %/.test(t)), `Fine paints the 1800 px photo at its own size, in tiles with their progress: ${st}`);
  info(`Fine: ${st}`);
  const fine = await download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  const bi = imageInfo(bold), fi = imageInfo(fine);
  ok(bi.width === 512 && fi.width === 1800 && fi.height === 1300, `saved at the painting's size: Bold ${bi.width} × ${bi.height}, Fine ${fi.width} × ${fi.height}`);
  const kb = await kept(bold), kf = await kept(fine);
  info(`AI style, detail kept at the photo's size: Fine ${kf.toFixed(3)}, Bold ${kb.toFixed(3)}`);
  // the style's own strokes carry most of the edges of any painting, so the correlation stays low; what it measures is how
  // much of the photo shows through them (26 Nov 2026: Fine 0.147, Bold 0.045)
  ok(kf > 2.5 * kb && kf > 0.1, `AI style: Fine keeps far more of the photo's edges than Bold (correlation ${kf.toFixed(3)} against ${kb.toFixed(3)})`);
  ok(page.errors.length === 0 && probe.errors.length === 0, `no page errors: ${[...page.errors, ...probe.errors].join(' | ')}`);
};
