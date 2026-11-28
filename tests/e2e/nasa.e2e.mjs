// NASA Image Explorer (potentials #114): the tab in Chromium on a stand-in NASA (tests/lib/nasastub.mjs — NASA's API answered from its own
// recorded answers, tests/fixtures/nasa; its bucket and file server with test pictures, a test video and captions; the bucket answers
// CORS, the file server does not — as the real ones). A topic as the tab opens (asked of NASA's API, the thumbnails read at the bucket —
// never at the file server); More; topics, words, years (refused when they are no years or the wrong way round — nothing asked), a NASA
// centre, pictures / videos / both; a picture opened: its date, centre, credit and the parties credited beside NASA, its keywords (a tap
// searches one); a wallpaper of it — the crop on the busiest part, saved at the screen's pixels from the rendition wide enough (the
// original at the bucket), the credit in the file, its pixels the crop's part of the picture; the original downloaded byte for byte; a
// video opened: played from NASA's file server (a <video> needs no CORS) with its poster and its captions made WebVTT; NASA busy (429)
// and nothing found said; the phone; axe-core in both themes; the tab left: its dialog, video and blob URLs gone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NASA_HOSTS, nasaRoute, TALL_ID } from '../lib/nasastub.mjs';

const W = (f) => fileURLToPath(new URL(`../fixtures/wallpapers/${f}`, import.meta.url));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const BUCKET = 'https://s3.amazonaws.com/images-assets.nasa.gov/';
const FILES = 'https://images-assets.nasa.gov/';

function jpegInfo(file) {
  const b = readFileSync(file), out = { jpeg: b[0] === 0xff && b[1] === 0xd8, w: 0, h: 0, comment: '' };
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
  const page = async (opts = {}, over = {}) => { const p = await newPage(opts); await p.route(NASA_HOSTS, nasaRoute(over, seen)); return p; };
  const until = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const idle = (p) => until(p, () => !document.querySelector('.wp-grid[aria-busy]'));
  const open = async (p) => { await p.goto(`${base}#/nasa`); await p.locator('.wp-tile').first().waitFor({ timeout: 20000 }); await idle(p); };
  const asked = (re, from = 0) => seen.slice(from).filter((u) => re.test(u));
  const searches = (from = 0) => asked(/images-api\.nasa\.gov\/search/, from).map((u) => new URL(u).searchParams);
  const tiles = (p) => p.$$eval('.wp-tile', (ts) => ts.map((t) => ({ title: t.querySelector('.wp-tile-title')?.textContent, sub: t.querySelector('.muted')?.textContent, video: !!t.querySelector('.ns-badge') })));
  const state = (p) => p.locator('.wp-grid-state').innerText();
  const frame = (p, pw, ph) => p.locator('.wp-frame').evaluate((e, [pw, ph]) => ({ x: parseFloat(e.style.left) * pw / 100, y: parseFloat(e.style.top) * ph / 100, w: parseFloat(e.style.width) * pw / 100, h: parseFloat(e.style.height) * ph / 100 }), [pw, ph]);
  const openTile = async (p, title) => { await p.locator('.wp-tile').filter({ hasText: title }).first().click(); await p.locator('dialog.wp-dlg[open]').waitFor({ timeout: 10000 }); };
  const diffFrom = (p, saved, src, boxes) => p.evaluate(async ({ a, b, boxes }) => {
    const bmp = (b64) => createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const A = await bmp(a), B = await bmp(b), Wd = 90, H = Math.round(90 * A.height / A.width);
    const luma = (img, sx, sy, sw, sh) => {
      const c = new OffscreenCanvas(Wd, H), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, sx, sy, sw, sh, 0, 0, Wd, H);
      const d = x.getImageData(0, 0, Wd, H).data, out = new Float32Array(Wd * H);
      for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      return out;
    };
    const la = luma(A, 0, 0, A.width, A.height);
    return boxes.map((bx) => { const lb = luma(B, bx.x, bx.y, bx.w, bx.h); let s = 0; for (let i = 0; i < la.length; i++) s += Math.abs(la[i] - lb[i]); return +(s / la.length).toFixed(1); });
  }, { a: readFileSync(saved).toString('base64'), b: readFileSync(src).toString('base64'), boxes });

  // ---------------------------------------------------------------- opening: Earth from space
  const pc = await page({ viewport: { width: 1280, height: 900 }, screen: { width: 1920, height: 1080 } });
  await open(pc);
  const s0 = searches();
  ok(s0.length === 1 && s0[0].get('q') === 'earth from space' && s0[0].get('media_type') === 'image' && s0[0].get('page_size') === '24', `as it opens: "Earth from space", pictures, 24 a page (${s0.map((q) => q.toString()).join(' | ')})`);
  ok((await tiles(pc)).length === 24 && await pc.locator('.wp-chip[aria-pressed="true"]').innerText() === 'Earth from space', '24 pictures; the topic lit');
  ok(/^24 of 19,493 shown — more below\.$/.test(await state(pc)) && await pc.locator('.wp-grid-title').innerText() === 'Pictures: Earth from space', `the line: ${await state(pc)}`);
  ok(await until(pc, () => [...document.querySelectorAll('.wp-tile img')].slice(0, 6).every((i) => i.src.startsWith('blob:'))), 'the thumbnails shown from blob: addresses');
  ok(asked(/^https:\/\/s3\.amazonaws\.com\/images-assets\.nasa\.gov\/image\/.+~thumb\.jpg$/).length >= 6 && !asked(/^https:\/\/images-assets\.nasa\.gov\//).length, 'the thumbnails read at the bucket\'s own address — never at the file server (no CORS there)');
  ok(!(await pc.evaluate(() => performance.getEntriesByType('resource').some((r) => /\.wasm|mediapipe|models\//.test(r.name)))), 'nothing of the wallpaper maker\'s engines fetched before a picture is opened');

  // ---------------------------------------------------------------- More, topics, words, years, centre, kind
  let n0 = seen.length;
  await pc.getByRole('button', { name: 'More', exact: true }).click(); await idle(pc);
  ok(searches(n0)[0]?.get('page') === '2' && (await tiles(pc)).length === 48 && /^48 of 19,493 shown/.test(await state(pc)), `More: the second page (${(await tiles(pc)).length})`);
  n0 = seen.length;
  await pc.locator('.wp-chip', { hasText: 'Nebulae' }).click(); await idle(pc);
  ok(searches(n0)[0]?.get('q') === 'nebula' && (await tiles(pc))[0].title === 'Weighing in on the Dumbbell Nebula', 'a topic: "nebula" asked, its pictures');
  n0 = seen.length;
  await pc.getByLabel('From the year').fill('19x9'); await pc.getByLabel('From the year').press('Enter');
  ok(/^A year is four digits, 1920 to \d{4}\.$/.test(await state(pc)) && searches(n0).length === 0, `a year that is none: said, nothing asked (${await state(pc)})`);
  await pc.getByLabel('From the year').fill('1980'); await pc.getByLabel('To the year').fill('1970'); await pc.getByLabel('To the year').press('Enter');
  ok(await state(pc) === '“From” is after “To” — 1980 is after 1970.' && searches(n0).length === 0, 'years the wrong way round: said, nothing asked');
  await pc.getByLabel('From the year').fill('1969'); await pc.getByLabel('To the year').fill('1969');
  await pc.getByLabel('Search NASA’s library').fill('apollo 11'); await pc.getByLabel('Search NASA’s library').press('Enter'); await idle(pc);
  const sa = searches(n0).pop();
  ok(sa?.get('q') === 'apollo 11' && sa.get('year_start') === '1969' && sa.get('year_end') === '1969', `words and years asked (${sa})`);
  const ta = await tiles(pc);
  ok(ta.length === 12 && ta.every((t) => /^1969/.test(t.sub)) && await pc.locator('.wp-grid-title').innerText() === 'Pictures: “apollo 11” · 1969 – 1969', `Apollo 11 in 1969: ${ta.length} pictures of 1969`);
  n0 = seen.length;
  await pc.getByLabel('NASA centre', { exact: true }).selectOption('JPL'); await idle(pc);
  ok(searches(n0)[0]?.get('center') === 'JPL' && /Jet Propulsion Laboratory$/.test(await pc.locator('.wp-grid-title').innerText()), 'a NASA centre asked');
  await pc.getByLabel('NASA centre', { exact: true }).selectOption('');
  await pc.getByLabel('From the year').fill(''); await pc.getByLabel('To the year').fill('');
  n0 = seen.length;
  await pc.getByLabel('Search NASA’s library').fill('mars rover');
  await pc.getByRole('radio', { name: 'Videos' }).click(); await idle(pc);
  const tv = await tiles(pc);
  ok(searches(n0).pop()?.get('media_type') === 'video' && tv.length === 6 && tv.every((t) => t.video), `videos: ${tv.length}, each marked "Video"`);
  n0 = seen.length;
  await pc.getByLabel('Search NASA’s library').fill('qwzxv nothing'); await pc.getByLabel('Search NASA’s library').press('Enter'); await idle(pc);
  ok(await state(pc) === 'Nothing found — other words, another kind, or other years.' && await pc.getByRole('button', { name: 'More', exact: true }).isHidden(), 'nothing found: said');

  // ---------------------------------------------------------------- a video: played from the file server, its poster, its captions
  await pc.getByLabel('Search NASA’s library').fill('mars rover'); await pc.getByLabel('Search NASA’s library').press('Enter'); await idle(pc);
  // one whose file list NASA does not have: said
  await openTile(pc, 'Descent and Touchdown');
  ok(await until(pc, () => /NASA lists no video file for this item\./.test(document.querySelector('dialog[open] .wp-status')?.textContent || '')), 'a video without a file list: said');
  await pc.getByRole('button', { name: 'Close', exact: true }).click();
  n0 = seen.length;
  await openTile(pc, 'First Front-Row Seat');
  ok(await until(pc, () => { const v = document.querySelector('dialog[open] video'); return v && v.readyState >= 1 && v.poster.startsWith('blob:'); }, null, 20000), 'a video: its metadata loaded, its poster shown');
  const vinfo = await pc.evaluate(() => { const v = document.querySelector('dialog[open] video'); return { src: v.currentSrc, duration: v.duration, tracks: v.textTracks.length, kind: v.textTracks[0]?.kind, mode: v.textTracks[0]?.mode }; });
  ok(vinfo.src.startsWith(FILES) && /~medium\.mp4$/.test(vinfo.src) && /Rover%E2%80%99s%20Landing/.test(vinfo.src) && Math.abs(vinfo.duration - 3) < 0.2, `played from NASA's file server, the medium MP4, its curly apostrophe escaped (${decodeURIComponent(vinfo.src).slice(-40)}, ${vinfo.duration} s)`);
  ok(asked(/images-api\.nasa\.gov\/asset\//, n0).length === 1 && asked(new RegExp(`^${BUCKET.replace(/[.\/]/g, '\\$&')}video/.+\\.(srt|vtt)$`), n0).length === 1, 'its file list asked of the API, its captions read at the bucket');
  const cues = await until(pc, () => (document.querySelector('dialog[open] video')?.textTracks[0]?.cues?.length ?? 0) === 3, null, 10000);
  const cueText = await pc.evaluate(() => [...(document.querySelector('dialog[open] video').textTracks[0].cues || [])].map((c) => `${c.startTime}–${c.endTime} ${c.text}`));
  ok(cues && vinfo.kind === 'captions' && vinfo.mode === 'showing' && cueText[0] === '0.2–1.2 Hello from SuperTools', `its captions made WebVTT and shown (${cueText.join(' | ')})`);
  await pc.evaluate(() => document.querySelector('dialog[open] video').play());
  ok(await until(pc, () => document.querySelector('dialog[open] video').currentTime > 0.3, null, 10000), 'the video plays');
  ok(/~orig\.mp4$/.test(await pc.getByRole('link', { name: 'The original video' }).getAttribute('href')) && await pc.getByRole('button', { name: 'Download the original' }).isHidden(), 'a link to the original video (no download into the page — it may be gigabytes)');
  ok(/Credit: NASA\/JPL-Caltech|NASA’s own/.test(await pc.locator('.wp-info').innerText()), `its credit (${(await pc.locator('.wp-info').innerText()).slice(0, 120).replace(/\n/g, ' / ')})`);
  // a long description folded to six lines, "Read all" opens it
  const folded = await pc.locator('.ns-desc').evaluate((e) => ({ folded: e.classList.contains('folded'), h: e.getBoundingClientRect().height }));
  await pc.getByRole('button', { name: 'Read all' }).click();
  const open1 = await pc.locator('.ns-desc').evaluate((e) => ({ folded: e.classList.contains('folded'), h: e.getBoundingClientRect().height }));
  ok(folded.folded && !open1.folded && open1.h > folded.h * 2 && await pc.getByRole('button', { name: 'Fold' }).getAttribute('aria-expanded') === 'true', `a long description folded, "Read all" opens it (${Math.round(folded.h)} → ${Math.round(open1.h)} px)`);
  await pc.getByRole('button', { name: 'Close', exact: true }).click();
  ok(await until(pc, () => { const v = document.querySelector('dialog.wp-dlg video'); return !v || (v.paused && !v.getAttribute('src') && !v.querySelector('track')); }, null, 5000), 'closed: the video stopped and let go, its captions too');

  // ---------------------------------------------------------------- a picture: details, keywords, a wallpaper, the original
  await pc.getByRole('radio', { name: 'Pictures' }).click(); await idle(pc);
  await pc.locator('.wp-chip', { hasText: 'Nebulae' }).click(); await idle(pc);
  n0 = seen.length;
  await openTile(pc, 'Weighing in on the Dumbbell Nebula');
  ok(await until(pc, () => /crop/.test(document.querySelector('.wp-how')?.textContent || ''), null, 60000), `the picture opened, the crop placed ("${await pc.locator('.wp-how').innerText()}")`);
  const pinfo = await pc.locator('.wp-info').innerText();
  ok(/Aug 10, 2011 · Jet Propulsion Laboratory/.test(pinfo) && /Credit: NASA\/JPL-Caltech\/Harvard-Smithsonian CfA/.test(pinfo) && /Credited beside NASA: Harvard-Smithsonian CfA — their terms may apply/.test(pinfo), `its date, centre, credit, and the party credited beside NASA (${pinfo.slice(0, 200).replace(/\n/g, ' / ')})`);
  ok(asked(new RegExp(`^${BUCKET.replace(/[.\/]/g, '\\$&')}image/PIA14417/PIA14417~medium\\.jpg$`), n0).length === 1, 'the picture shown from its 1,280 px rendition, read at the bucket');
  ok(await pc.getByRole('link', { name: 'At NASA' }).getAttribute('href') === 'https://images.nasa.gov/details/PIA14417', 'its page at NASA');
  let f = await frame(pc, 600, 1200);
  ok(f.y <= 800 + 6 && f.y + f.h >= 1000 - 6 && /busiest part/.test(await pc.locator('.wp-how').innerText()), `this screen's crop on the busiest part (${f.y.toFixed(0)} – ${(f.y + f.h).toFixed(0)}; the block 800 – 1000)`);
  n0 = seen.length;
  const p1 = await download(pc, () => pc.getByRole('button', { name: 'Save wallpaper', exact: true }).click()), j1 = jpegInfo(p1);
  ok(j1.jpeg && j1.w === 1920 && j1.h === 1080, `the wallpaper: ${j1.w} × ${j1.h}`);
  ok(asked(new RegExp(`^${BUCKET.replace(/[.\/]/g, '\\$&')}image/PIA14417/PIA14417~orig\\.jpg$`), n0).length === 1, 'cut from the original (2,800 px — no smaller rendition is wide enough), read at the bucket');
  ok(j1.comment.startsWith('Weighing in on the Dumbbell Nebula — NASA/JPL-Caltech/Harvard-Smithsonian CfA (2011-08-10). NASA/JPL-Caltech/Harvard-Smithsonian CfA, NASA Image and Video Library. Licence: NASA (also credited: Harvard-Smithsonian CfA'), `the credit in the file (${j1.comment.slice(0, 120)}…)`);
  const [d1, d1c] = await diffFrom(pc, p1, W('tall.jpg'), [f, { x: 0, y: 600 - f.h / 2, w: f.w, h: f.h }]);
  ok(d1 < 6 && d1c >= Math.max(3 * d1, d1 + 10), `its pixels: the crop's part of the picture (mean difference ${d1}; a centred crop's ${d1c})`);
  const po = await download(pc, () => pc.getByRole('button', { name: 'Download the original' }).click());
  ok(/PIA14417\.jpg$/.test(po) && readFileSync(po).equals(readFileSync(W('tall.jpg'))) && /Saved PIA14417\.jpg/.test(await pc.locator('.wp-dlg-side .wp-status').last().innerText()), 'the original downloaded byte for byte, named after the item');
  const kw = await pc.locator('.ns-kw').allInnerTexts();
  ok(kw.join('|') === 'Helix Nebula|Spitzer Space Telescope', `its keywords (${kw.join(', ')})`);
  n0 = seen.length;
  await pc.locator('.ns-kw', { hasText: 'Spitzer Space Telescope' }).click(); await idle(pc);
  ok(!(await pc.locator('dialog.wp-dlg[open]').count()) && searches(n0)[0]?.get('q') === 'Spitzer Space Telescope' && await pc.getByLabel('Search NASA’s library').inputValue() === 'Spitzer Space Telescope', 'a keyword tapped: the dialog closes, the keyword searched');

  // ---------------------------------------------------------------- NASA busy
  const busy = await page({ viewport: { width: 1280, height: 900 } }, { search: () => 429 });
  await busy.goto(`${base}#/nasa`); await idle(busy); await busy.waitForTimeout(300);
  ok(await state(busy) === 'NASA is busy — it limits how often it is asked. Try again in a minute.' && !(await busy.locator('.wp-tile').count()), `NASA refused: said (${await state(busy)})`);
  ok(!busy.errors.filter((e) => !/429|Failed to load resource/.test(e)).length, `no page errors ${busy.errors.join(' | ')}`);
  await busy.close();

  // ---------------------------------------------------------------- axe-core, both themes: the tab, a picture, a video
  for (const scheme of ['light', 'dark']) {
    const ax = await page({ viewport: { width: 1280, height: 900 }, colorScheme: scheme, bypassCSP: true });
    await open(ax);
    await until(ax, () => [...document.querySelectorAll('.wp-tile img')].slice(0, 4).every((i) => i.src.startsWith('blob:')));
    await ax.addScriptTag({ content: AXE });
    const run = () => ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    const v1 = await run();
    ok(!v1.length, `axe (${scheme}): the tab — ${v1.join(' | ')}`);
    await openTile(ax, (await tiles(ax))[0].title);
    await until(ax, () => /crop/.test(document.querySelector('.wp-how')?.textContent || ''), null, 60000);
    const v2 = await run();
    ok(!v2.length, `axe (${scheme}): a picture opened — ${v2.join(' | ')}`);
    await ax.getByRole('button', { name: 'Close', exact: true }).click();
    await ax.getByRole('radio', { name: 'Videos' }).click(); await idle(ax);
    await openTile(ax, (await tiles(ax))[0].title);
    await until(ax, () => document.querySelector('dialog[open] video')?.readyState >= 1, null, 20000);
    const v3 = await run();
    ok(!v3.length, `axe (${scheme}): a video opened — ${v3.join(' | ')}`);
    ok(!ax.errors.length, `no page errors (${scheme}) ${ax.errors.join(' | ')}`);
    await ax.close();
  }

  // ---------------------------------------------------------------- the phone
  const ph = await page(devices['iPhone 13']);
  await open(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no sideways scroll');
  const row = await ph.locator('.wp-topics').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, h: e.getBoundingClientRect().height }));
  ok(row.sw > row.cw && row.h < 70, `phone: the topics in one row that scrolls sideways (${row.sw} > ${row.cw}, ${Math.round(row.h)} px tall)`);
  const chips = await ph.locator('.wp-chip').first().boundingBox(), seg = await ph.getByRole('radio', { name: 'Videos' }).boundingBox();
  ok(chips.height >= 44 && seg.height >= 44, `phone: topics and the kinds ≥ 44 px tall (${chips.height}, ${seg.height})`);
  await openTile(ph, (await tiles(ph))[0].title);
  await until(ph, () => /crop/.test(document.querySelector('.wp-how')?.textContent || ''), null, 60000);
  const vp = ph.viewportSize(), sv = await ph.getByRole('button', { name: 'Save wallpaper' }).boundingBox(), dl = await ph.locator('dialog.wp-dlg').boundingBox();
  ok(dl.width >= vp.width - 1 && dl.height >= vp.height - 1 && sv.height >= 44 && sv.y > vp.height * 0.7, `phone: full screen, Save in the bar at the foot (${Math.round(sv.y)})`);
  const p2 = await download(ph, () => ph.getByRole('button', { name: 'Save wallpaper', exact: true }).click()), j2 = jpegInfo(p2);
  ok(j2.w === 1170 && j2.h === 2532, `phone: this screen's wallpaper (${j2.w} × ${j2.h})`);
  const kwb = await ph.locator('.ns-kw').first().boundingBox();
  ok(!kwb || kwb.height >= 44, `phone: the keywords ≥ 44 px tall (${kwb?.height})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);

  // ---------------------------------------------------------------- leaving, and coming back
  await openTile(pc, (await tiles(pc))[0].title);
  await until(pc, () => /crop/.test(document.querySelector('.wp-how')?.textContent || ''), null, 60000);
  const kept = await released(pc, 'nasa');
  ok(!kept.length && !(await pc.locator('dialog.wp-dlg').count()), `the tab left: its dialog removed, no blob URL kept (${JSON.stringify(kept).slice(0, 200)})`);
  const live = await pc.evaluate(() => globalThis.__superutilsLive?.());
  ok(live && live.workers === 0, `… and no worker left (${JSON.stringify(live)})`);
  n0 = seen.length;
  await pc.evaluate(() => { location.hash = '#/nasa'; });
  await pc.locator('.wp-tile').first().waitFor();
  ok(!searches(n0).length && (await tiles(pc)).length > 0, 'back in the tab: what was found shown again without asking');
  // the one error the browser logs is the file list NASA does not have (asked on purpose above: 404)
  ok(!pc.errors.filter((e) => !/Failed to load resource: the server responded with a status of 404/.test(e)).length && pc.errors.length <= 1, `no page errors ${pc.errors.join(' | ')}`);
  info(`searches asked: ${asked(/images-api\.nasa\.gov\/search/).length}; files read at the bucket: ${asked(/s3\.amazonaws\.com/).length}`);
  void TALL_ID;
};
