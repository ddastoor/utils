// Cartoonizer (#/cartoon) — the anime looks (the owner's "finish off the small choices", 28 Nov 2026): AnimeGAN v2's Hayao, Shinkai
// and Paprika and the face portrait v2 on ONNX Runtime Web in a worker. Nothing of them is fetched until the mode is chosen; then the
// four tiles and the chosen look's graph only, with its progress, once a visit (the two used last kept). The drawing on whole photos the
// tab draws at their own size — the coffee photo for Hayao, the astronaut for the face portrait — held to native ONNX Runtime's
// (tests/fixtures/anime/blocks.json: the mean colour of every 20 × 20 block). Strength mixes the drawing with the photo without drawing
// again; the size; Save (a JPEG of the drawing's size, named after the look) and Save refused while a drawing is under way; Hold to
// compare; a look whose graph cannot be fetched said, and fetched at the next try; leaving mid-drawing; WCAG 2.2 A / AA; the phone.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { imageInfo } from '../lib/imgcheck.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const BLOCKS = JSON.parse(readFileSync(new URL('../fixtures/anime/blocks.json', import.meta.url), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const STATUS = '[aria-live="polite"].muted';

export default async ({ base, page: newPage, ok, info, download, released, devices }) => {
  const page = await newPage({ viewport: { width: 1280, height: 900 } });
  const fetched = [];
  page.on('request', (r) => { const u = r.url(); if (/models\/animegan\/|data\/anime\//.test(u)) fetched.push(u.replace(/^.*\/(models|data)\//, '$1/')); });
  // every status line shown, in order (a MutationObserver: the fetch can be quick)
  await page.addInitScript(() => {
    window.__said = [];
    new MutationObserver(() => { const t = document.querySelector('[aria-live="polite"].muted')?.textContent; if (t && window.__said.at(-1) !== t) window.__said.push(t); })
      .observe(document, { subtree: true, childList: true, characterData: true });
  });
  const said = () => page.evaluate(() => window.__said.slice());
  const status = () => page.locator(STATUS).first().textContent();
  const waitDrawn = (re, timeout = 240000) => page.waitForFunction(([sel, src]) => new RegExp(src).test(document.querySelector(sel)?.textContent || ''), [STATUS, re.source], { timeout });
  const canvasBlocks = () => page.evaluate(() => {
    const c = document.querySelector('canvas.ed-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const W = Math.floor(c.width / 20), H = Math.floor(c.height / 20), m = [];
    for (let by = 0; by < H; by++) for (let bx = 0; bx < W; bx++) {
      const s = [0, 0, 0];
      for (let y = by * 20; y < by * 20 + 20; y++) for (let x = bx * 20; x < bx * 20 + 20; x++) { const i = (y * c.width + x) * 4; s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
      m.push(s[0] / 400, s[1] / 400, s[2] / 400);
    }
    return { w: c.width, h: c.height, m };
  });
  const against = (got, ref) => { let max = 0, sum = 0; for (let i = 0; i < ref.length; i++) { const d = Math.abs(got[i] - ref[i]); max = Math.max(max, d); sum += d; } return { max, mean: sum / ref.length }; };
  const mode = (name) => page.getByRole('radio', { name, exact: true });
  const look = (name) => page.getByRole('radio', { name, exact: true });

  await page.goto(base + '#/cartoon');
  await page.locator('input[type=file]').first().setInputFiles(F('coffee.png'));
  await waitDrawn(/^Cartoon · \d+ ms$/, 60000);
  ok(!fetched.length, `nothing of the anime looks is fetched before the mode is chosen (${fetched.join(', ') || 'none'})`);

  // ---- the mode: four tiles, the first look drawn; its graph fetched once, with its progress
  await mode('Anime looks').click();
  ok(await page.locator('[aria-label="Anime look"] [role=radio]').count() === 4, 'four looks to choose from');
  ok(JSON.stringify(await page.locator('[aria-label="Anime look"] [role=radio]').allInnerTexts()) === JSON.stringify(['Hayao', 'Shinkai', 'Paprika', 'Face portrait']), 'Hayao, Shinkai, Paprika and Face portrait');
  await waitDrawn(/^Hayao · 600×400 · [\d.]+ s$/);
  const s1 = await said();
  ok(s1.some((t) => /^Fetching the Hayao look \([\d.]+ of 8\.6 MB, once a visit\)…$/.test(t)) && s1.some((t) => /^Drawing your photo in the Hayao look at 600 px…$/.test(t)), `the progress is said: the look fetched, then the drawing (${s1.filter((t) => /Hayao/.test(t)).slice(0, 3).join(' | ')})`);
  ok(fetched.filter((u) => u.startsWith('models/')).join() === 'models/animegan/AnimeGANv2_Hayao.onnx' && fetched.filter((u) => u.startsWith('data/')).length === 4, `only the chosen look's graph and the four tiles fetched (${fetched.join(', ')})`);
  ok(await page.evaluate(() => [...document.querySelectorAll('[aria-label="Anime look"] img')].every((i) => i.complete && i.naturalWidth === 160)), 'the tiles show what each look makes of a sample photo');
  {
    const b = await canvasBlocks(), r = BLOCKS.hayao, d = against(b.m, r.means);
    ok(b.w === r.width && b.h === r.height && d.mean < 1 && d.max < 6, `Hayao on the coffee photo, drawn at its own 600 × 400: native ONNX Runtime's picture (20 px blocks: mean difference ${d.mean.toFixed(2)}, largest ${d.max.toFixed(1)} of 255)`);
  }
  const drawnSig = await page.evaluate(() => { const c = document.querySelector('canvas.ed-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 97) s = (s * 31 + d[i]) >>> 0; return s; });

  // ---- Strength: the drawing mixed with the photo, not drawn again
  const before = fetched.length;
  const mix = async (v) => {
    await page.evaluate((v) => { const r = [...document.querySelectorAll('.slider')].filter((s) => s.offsetParent && s.querySelector('.slider-head span')?.textContent === 'Strength')[0].querySelector('input'); r.value = v; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); }, v);
  };
  await mix(0);
  await waitDrawn(/^Hayao · 600×400 · [\d.]+ s · 0 %$/, 30000);
  const zero = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const o = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d'); o.drawImage(bmp, 0, 0);
    const a = o.getImageData(0, 0, bmp.width, bmp.height).data, c = document.querySelector('canvas.ed-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let diff = 0; for (let i = 0; i < d.length; i++) diff = Math.max(diff, Math.abs(d[i] - a[i])); return diff;
  }, readFileSync(F('coffee.png')).toString('base64'));
  ok(zero <= 1, `Strength 0 %: the photo itself (largest difference ${zero})`);
  await mix(100);
  await waitDrawn(/^Hayao · 600×400 · [\d.]+ s$/, 30000);
  const back = await page.evaluate(() => { const c = document.querySelector('canvas.ed-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 97) s = (s * 31 + d[i]) >>> 0; return s; });
  ok(back === drawnSig && fetched.length === before, 'Strength 100 % again: the same drawing, nothing fetched or drawn again');

  // ---- Save, and Hold to compare
  const p1 = await download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  const i1 = imageInfo(readFileSync(p1));
  ok(/coffee-anime-hayao\.jpg$/.test(p1) && i1.type === 'jpeg' && i1.width === 600 && i1.height === 400, `Save: a JPEG of the drawing, named after the look (${p1.split(/[\\/]/).pop()}, ${i1.width}×${i1.height})`);
  const cmp = page.getByRole('button', { name: 'Hold to compare' });
  await cmp.hover(); await page.mouse.down();
  const comparing = await page.evaluate(() => document.querySelector('canvas.ed-canvas').getContext('2d').getImageData(300, 200, 1, 1).data.join());
  await page.mouse.up();
  const drawing = await page.evaluate(() => document.querySelector('canvas.ed-canvas').getContext('2d').getImageData(300, 200, 1, 1).data.join());
  ok(comparing !== drawing, `Hold to compare shows the photo, letting go the drawing (${comparing} / ${drawing})`);

  // ---- another look: fetched once; the one before kept (two kept for the visit); Save refused while it is being drawn
  await look('Shinkai').click();
  await page.waitForFunction((sel) => /Shinkai look/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 60000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => /The drawing is still being made — Save again when it is shown\./.test(document.body.innerText), null, { timeout: 10000 }).then(() => ok(true, 'Save while a drawing is under way: refused, with what to do'), () => ok(false, 'Save while a drawing is under way: refused, with what to do'));
  await waitDrawn(/^Shinkai · 600×400 · [\d.]+ s$/);
  await look('Hayao').click();
  await waitDrawn(/^Hayao · 600×400 · [\d.]+ s$/);
  const models = fetched.filter((u) => u.startsWith('models/'));
  ok(JSON.stringify(models) === JSON.stringify(['models/animegan/AnimeGANv2_Hayao.onnx', 'models/animegan/AnimeGANv2_Shinkai.onnx']), `each look's graph fetched once a visit: back to Hayao, nothing fetched again (${models.join(', ')})`);

  // ---- the size: 512 px
  await page.getByRole('radio', { name: '512 px', exact: true }).click();
  await waitDrawn(/^Hayao · 512×341 · [\d.]+ s$/);
  ok(true, 'Size 512 px: the coffee photo drawn at 512 × 341');
  await page.getByRole('radio', { name: '1024 px', exact: true }).click();
  await waitDrawn(/^Hayao · 600×400 · [\d.]+ s$/);

  // ---- a look whose graph cannot be fetched: said; fetched at the next try
  await page.route('**/models/animegan/AnimeGANv2_Paprika.onnx', (r) => r.fulfill({ status: 404, body: 'not here' }));
  await look('Paprika').click();
  await page.waitForFunction((sel) => /^Could not apply the style: /.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 60000 });
  ok(/the Paprika look could not be fetched \(HTTP 404\)/.test(await status()), `a look that cannot be fetched is said (${await status()})`);
  await page.unroute('**/models/animegan/AnimeGANv2_Paprika.onnx');
  await look('Hayao').click(); await waitDrawn(/^Hayao · 600×400 · [\d.]+ s$/);
  await look('Paprika').click();
  await waitDrawn(/^Paprika · 600×400 · [\d.]+ s$/);
  ok(true, 'the next try fetches it and draws');

  // ---- the face portrait on the astronaut (512 × 512, its own size): native ONNX Runtime's picture
  await page.locator('input[type=file]').first().setInputFiles(F('astronaut.png'));
  await look('Face portrait').click();
  await waitDrawn(/^Face portrait · 512×512 · [\d.]+ s$/);
  {
    const b = await canvasBlocks(), r = BLOCKS.face, d = against(b.m, r.means);
    // (ONNX Runtime Web's normalisation of this export's large layers adds up less exactly than native: tests/unit/anime.test.mjs)
    ok(b.w === 512 && b.h === 512 && d.mean < 1.5 && d.max < 8, `the face portrait on the astronaut: native ONNX Runtime's picture (20 px blocks: mean difference ${d.mean.toFixed(2)}, largest ${d.max.toFixed(1)} of 255)`);
  }
  await page.locator('input[type=file]').first().setInputFiles(F('coffee.png'));
  await waitDrawn(/^Face portrait · 512×341 · [\d.]+ s$/);
  ok(true, 'the face portrait draws any photo at 512 px at most (the coffee photo: 512 × 341)');

  // ---- leaving mid-drawing: the worker and its graphs let go, no error
  await look('Shinkai').click();
  await page.waitForTimeout(300);
  const kept = await released(page, 'cartoon');
  ok(!kept.length, `leaving the tab lets the drawings go (${kept.length} kept)`);
  ok(await page.evaluate(() => globalThis.__superutilsLive?.().workers ?? 0) === 0, 'and the anime worker with them');
  const errs = page.errors.filter((e) => !/^Error: The drawing is still being made/.test(e)); // the refusal above, logged by the button
  ok(!errs.length, `no page errors ${errs.join(' | ')}`);
  await page.close();

  // ---- WCAG 2.2 A / AA in the mode, light and dark
  for (const scheme of ['light', 'dark']) {
    const p = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true, colorScheme: scheme }); // the CSP forbids the injected checker
    await p.goto(base + '#/cartoon');
    await p.locator('input[type=file]').first().setInputFiles(F('coffee.png'));
    await p.getByRole('radio', { name: 'Anime looks', exact: true }).click();
    await p.waitForFunction((sel) => /^Hayao · /.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 240000 });
    await p.addScriptTag({ content: AXE });
    const v = await p.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `the anime looks, ${scheme} theme: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
    await p.close();
  }

  // ---- the phone: the three modes fit, the tiles take a finger
  const ph = await newPage({ ...devices['iPhone 13'] });
  await ph.goto(base + '#/cartoon');
  await ph.locator('input[type=file]').first().setInputFiles(F('coffee.png'));
  await ph.getByRole('radio', { name: 'Anime looks', exact: true }).click();
  await ph.waitForFunction((sel) => /^Hayao · 600×400 · /.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 240000 });
  const lay = await ph.evaluate(() => ({
    wide: document.documentElement.scrollWidth - innerWidth,
    tiles: [...document.querySelectorAll('[aria-label="Anime look"] [role=radio]')].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }),
    sizes: [...document.querySelectorAll('[role=radio]')].filter((b) => /^\d+ px$/.test(b.textContent)).map((b) => b.textContent),
  }));
  ok(lay.wide <= 0 && lay.tiles.every((x) => x >= 44), `phone: no sideways scroll, the tiles at least 44 px (${lay.tiles.map(Math.round).join(', ')})`);
  ok(JSON.stringify(lay.sizes) === JSON.stringify(['1024 px', '768 px', '512 px']), `phone: sizes up to 1024 px (${lay.sizes.join(', ')})`);
  info(`Hayao at 600 px: ${await ph.locator(STATUS).first().textContent()} (phone emulation)`);
  await ph.close();
};
