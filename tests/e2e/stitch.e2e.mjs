// Long Screenshot Stitcher (potentials #87): screenshots of a chat and of a news page, given out of order, put in order and
// joined; the saved PNG read back (tests/lib/png.mjs, not the page's decoder) and held row by row to the screenshots at
// the page rows tests/fixtures/stitch/truth.json gives them (scripts/make-stitch-shots.py) — every row of the picture is a
// row of a screenshot that shows that page row, and the picture runs from the first screenshot's top to the last one's
// bottom. Moving, taking out, the bars left out, JPEG, Copy, Ctrl+V, a forwarded copy among full-size ones, the phone,
// WCAG 2.2 in both themes, nothing fetched before a screenshot and nothing kept after the tab.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readPng } from '../lib/png.mjs';
import { phoneLayout } from './_phone.mjs';

const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = (n) => fileURLToPath(new URL(`../fixtures/stitch/${n}`, import.meta.url));
const truth = JSON.parse(readFileSync(F('truth.json'), 'utf8'));

/** the size a JPEG says it is (its SOF segment) */
function jpegSize(b) {
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

export default async (ctx) => {
  const { base, page: newPage, ok, download, released } = ctx;
  const page = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const asked = [];
  page.on('request', (r) => { const u = r.url(); if (/stitch\.worker|imgproc[^/]*\.wasm|codec\.worker/.test(u)) asked.push(u.replace(/^.*\//, '')); });
  await page.goto(`${base}#/stitch`);
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  await page.waitForTimeout(400);
  ok(!asked.length, `nothing of the engine is fetched before a screenshot is chosen (${asked.join(', ')})`);
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const items = () => page.locator('.st-item').evaluateAll((els) => els.map((e) => ({ name: e.querySelector('.st-name').textContent, what: e.querySelector('.st-what').textContent })));
  const settled = async (n, p = page) => {
    await p.waitForFunction((k) => document.querySelectorAll('.st-item').length === k && !document.querySelector('[data-busy]'), n, { timeout: 60000 });
    await p.waitForTimeout(150);
  };
  const saved = async (name) => page.waitForFunction((re) => new RegExp(re).test(document.querySelector('.st-status')?.textContent || ''), name, { timeout: 60000 });
  /** the picture saved, read back and held to the screenshots: every row is a row of a screenshot that shows its page row */
  const check = (png, set, files, { top = 0, bottom = 0 } = {}) => {
    const shots = files.map((f) => ({ ...set.shots.find((s) => s.file === f), px: readPng(readFileSync(F(f))) }));
    const first = shots.reduce((a, b) => (b.offset < a.offset ? b : a)), last = shots.reduce((a, b) => (b.offset > a.offset ? b : a));
    const want = last.offset + set.height - first.offset - top - bottom;
    const W = png.width, bad = [];
    for (let r = 0; r < png.height; r++) {
      const p = r + top + first.offset; // the page row
      const row = png.data.subarray(r * W * 4, (r + 1) * W * 4);
      const hit = shots.some((s) => {
        const y = p - s.offset; if (y < 0 || y >= s.px.height) return false;
        const src = s.px.data, o = y * W * 4;
        for (let k = 0; k < row.length; k++) if (row[k] !== src[o + k]) return false;
        return true;
      });
      if (!hit) { bad.push(r); if (bad.length > 5) break; }
    }
    return { height: png.height, want, width: W, bad };
  };

  // ---------------------------------------------------------------- the chat's five screenshots out of order, a page of something else
  const chat = truth.chat, chatFiles = ['chat-3.png', 'chat-1.png', 'chat-5.png', 'chat-2.png', 'chat-4.png'];
  await page.locator('input[type=file]').first().setInputFiles([...chatFiles, 'web-2.png'].map(F));
  await settled(6);
  let list = await items();
  ok(JSON.stringify(list.map((x) => x.name)) === JSON.stringify(['1. chat-1.png', '2. chat-2.png', '3. chat-3.png', '4. chat-4.png', '5. chat-5.png', '6. web-2.png']),
    `put in order by themselves: ${list.map((x) => x.name).join(', ')}`);
  ok(list[0].what === 'At the top' && list.slice(1, 5).every((x, i) => new RegExp(`^Joined under chat-${i + 1}\\.png — \\d+ rows in common$`).test(x.what)) && /^Nothing in common with chat-5\.png: under a line$/.test(list[5].what),
    `each joined under the one above, the page under a line (${list.map((x) => x.what).join(' | ')})`);
  ok(/^6 screenshots → one picture of 720 × [\d,]+ px · 1 line where screenshots share nothing\.$/.test(await page.locator('.st-side > .small').first().textContent()), 'the picture\'s size said, and the line');
  ok(asked.includes('imgproc.wasm') || asked.some((u) => /imgproc/.test(u)), 'the engine came with the first screenshot');
  // the join marks on the preview
  ok(await page.locator('.st-join').count() === 4, `the four joins marked on the preview (${await page.locator('.st-join').count()})`);
  await page.getByText('Show where they meet').click();
  ok(await page.locator('.st-join').count() === 0, '"Show where they meet" off: no marks');
  await page.getByText('Show where they meet').click();

  // the page of something else taken out: the chat alone, saved as PNG and held to its screenshots
  await btn('Take web-2.png out').click();
  await settled(5);
  const pngPath = await download(page, () => btn('Save picture').click());
  const png = readPng(readFileSync(pngPath));
  let c = check(png, chat, chatFiles);
  ok(c.width === 720 && c.height === c.want && !c.bad.length, `the PNG: ${c.width} × ${c.height} (from the first screenshot's top to the last one's bottom: ${c.want}), every row a screenshot's row at its page row ${c.bad.length ? `— rows ${c.bad.join(', ')} are not` : ''}`);
  await saved('chat-1-long\\.png — ');
  ok(/chat-1-long\.png$/.test(pngPath) && /^chat-1-long\.png — [\d.]+ (KB|MB)$/.test(await page.locator('.st-status').textContent()), `named after the first screenshot, its size said (${await page.locator('.st-status').textContent()})`);

  // the bars left out: the status bar and the contact's line at the top, the typing box at the bottom
  await page.getByText('Leave out the bars at the top', { exact: false }).click();
  await page.getByText('Leave out the bars at the bottom', { exact: false }).click();
  await page.waitForFunction(() => !document.querySelector('[data-busy]'));
  await page.waitForTimeout(300);
  const nb = readPng(readFileSync(await download(page, () => btn('Save picture').click())));
  const top = png.height - nb.height; // what was left out, in all
  let lo = null;
  for (const t of [160, 161, 162, 163, 164, 165, 166, 167, 168, 170, 175, 180, 190, 200]) { const r = check(nb, chat, chatFiles, { top: t, bottom: top - t }); if (r.height === r.want && !r.bad.length) { lo = t; break; } }
  ok(lo !== null && lo >= 160 && top - lo >= 168, `without the bars: ${top} rows fewer — ${lo} at the top (the status bar and the contact's line: 160 drawn), ${top - lo} at the bottom (the typing box and the buttons: 168); every row still a screenshot's`);
  await page.getByText('Leave out the bars at the top', { exact: false }).click();
  await page.getByText('Leave out the bars at the bottom', { exact: false }).click();

  // JPEG
  await page.getByRole('radio', { name: 'JPEG', exact: true }).click();
  const jp = readFileSync(await download(page, () => btn('Save picture').click()));
  const js = jpegSize(jp);
  const pngBytes = readFileSync(pngPath).length;
  ok(jp[0] === 0xff && jp[1] === 0xd8 && js && js.width === 720 && js.height === png.height, `JPEG: ${js && `${js.width} × ${js.height}`}, ${Math.round(jp.length / 1024)} KB (the PNG: ${Math.round(pngBytes / 1024)} KB — a chat's flat colours make the PNG the smaller)`);
  await page.getByRole('radio', { name: 'PNG', exact: true }).click();

  // Copy: the PNG on the clipboard (the clipboard is the browser's, shared by the suites running beside this one: another
  // suite's copy between ours and the read is no fault of the tab — copied and read again, at most four times)
  let clip = null;
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => { document.querySelector('.st-status').textContent = ''; });
    await btn('Copy').click();
    await saved('chat-1-long\\.png — ');
    clip = await page.evaluate(async () => { try { const it = (await navigator.clipboard.read())[0]; const b = await it.getType('image/png'); const bm = await createImageBitmap(b); return [bm.width, bm.height]; } catch (e) { return String(e); } });
    if (Array.isArray(clip) && clip[0] === 720 && clip[1] === png.height) break;
  }
  ok(Array.isArray(clip) && clip[0] === 720 && clip[1] === png.height, `Copy: the picture on the clipboard (${clip})`);

  // moved by hand: chat-2 above chat-1 — under a line both ways; "Find the order again" puts it back
  await btn('Move chat-2.png up').click();
  await settled(5);
  list = await items();
  ok(list[0].name === '1. chat-2.png' && /under a line|with a line/.test(list[1].what) && await btn('Find the order again').isVisible(), `moved by hand: chat-2 first, chat-1 under it with a line (${list[1].what})`);
  await btn('Find the order again').click();
  await settled(5);
  list = await items();
  ok(list[0].name === '1. chat-1.png' && list[1].name === '2. chat-2.png' && !(await btn('Find the order again').isVisible()), '"Find the order again": back in order');
  // the middle one taken out: two pieces of the chat, a line between them
  await btn('Take chat-3.png out').click();
  await settled(4);
  list = await items();
  ok(/^Nothing in common with chat-2\.png: under a line$/.test(list[2].what) && /^Joined under chat-4\.png/.test(list[3].what), `the middle one taken out: chat-4 under a line, chat-5 joined under it (${list.map((x) => x.what).join(' | ')})`);

  // Ctrl+V: a screenshot pasted is added (chat-3 back)
  const b64 = readFileSync(F('chat-3.png')).toString('base64');
  await page.evaluate((b) => { const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0))], 'chat-3.png', { type: 'image/png' })); dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }, b64);
  await settled(5);
  list = await items();
  ok(list.map((x) => x.name).join() === '1. chat-1.png,2. chat-2.png,3. chat-3.png,4. chat-4.png,5. chat-5.png' && list.slice(1).every((x) => x.what.startsWith('Joined')), 'Ctrl+V: the pasted screenshot takes its place, all joined again');
  // the same screenshot twice: left out
  await page.locator('input[type=file]').first().setInputFiles([F('IMG_2042.png')]);
  await settled(6);
  list = await items();
  ok(list[5].name === 'IMG_2042.png' && /^The same as chat-3\.png: left out$/.test(list[5].what), `the same screenshot twice: "${list[5].what}"`);
  const p2 = readPng(readFileSync(await download(page, () => btn('Save picture').click())));
  ok(p2.height === png.height, 'and the picture is as before');
  await btn('Start over').click();
  await settled(0);
  ok(await page.locator('.st-item').count() === 0 && !(await page.locator('.st-result').isVisible()) && /^Choose screenshots$/.test(await page.locator('.drop strong').textContent()), 'Start over: nothing left');

  // ---------------------------------------------------------------- a forwarded copy among full-size ones; a news page in a browser; JPEGs
  await page.locator('input[type=file]').first().setInputFiles(['mix-1.png', 'mix-2.png', 'mix-3.jpg', 'mix-4.png'].map(F));
  await settled(4);
  list = await items();
  const third = await page.locator('.st-item').nth(2).locator('.st-what').allTextContents();
  ok(list.slice(1).every((x) => x.what.startsWith('Joined')) && third.includes('Made 720 px wide like the others (it was 480)'), `a forwarded copy (480 px wide) joined among full-size ones, made 720 px wide (${third.join(' / ')})`);
  await btn('Start over').click();
  await settled(0);
  const web = truth.web, webFiles = ['web-4.png', 'web-2.png', 'web-1.png', 'web-3.png'];
  await page.locator('input[type=file]').first().setInputFiles(webFiles.map(F));
  await settled(4);
  list = await items();
  ok(list.map((x) => x.name).join() === '1. web-1.png,2. web-2.png,3. web-3.png,4. web-4.png', `the news page in order (${list.map((x) => x.name).join(', ')})`);
  c = check(readPng(readFileSync(await download(page, () => btn('Save picture').click()))), web, webFiles);
  ok(c.height === c.want && !c.bad.length, `the news page: ${c.height} rows (${c.want}) — the address bar of the first, the site's header once, every row a screenshot's ${c.bad.join(', ')}`);
  await btn('Start over').click();
  await settled(0);
  await page.locator('input[type=file]').first().setInputFiles(['chatsent-1.jpg', 'chatsent-2.jpg', 'chatsent-3.jpg', 'chatsent-4.jpg'].map(F));
  await settled(4);
  list = await items();
  ok(list.slice(1).every((x) => x.what.startsWith('Joined')), `screenshots sent through a chat app (smaller, JPEG): joined (${list.map((x) => x.what).join(' | ')})`);

  const kept = await released(page, 'stitch');
  ok(!kept.length, `leaving the tab lets the screenshots go (${kept.length} kept)`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.close();

  // ---------------------------------------------------------------- WCAG 2.2 A / AA, both themes, with screenshots joined
  for (const scheme of ['light', 'dark']) {
    const ax = await newPage({ viewport: { width: 1366, height: 900 }, colorScheme: scheme, bypassCSP: true });
    await ax.goto(`${base}#/stitch`);
    await ax.waitForSelector('input[type=file]', { state: 'attached' });
    await ax.locator('input[type=file]').first().setInputFiles(['chat-1.png', 'chat-2.png', 'web-2.png', 'IMG_2038.png'].map(F));
    await ax.waitForFunction(() => document.querySelectorAll('.st-item').length === 4 && !document.querySelector('[data-busy]'), null, { timeout: 60000 });
    await ax.addScriptTag({ content: AXE });
    const vv = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!vv.length, `${scheme}: no WCAG 2.2 A / AA violations with screenshots joined ${vv.join(' | ')}`);
    await ax.close();
  }

  // ---------------------------------------------------------------- the phone
  const ph = await phoneLayout(ctx, 'stitch', { ready: '.drop', before: async (p) => {
    await p.locator('input[type=file]').first().setInputFiles(['chat-2.png', 'chat-1.png', 'chat-3.png'].map(F));
    await p.waitForFunction(() => document.querySelectorAll('.st-item').length === 3 && !document.querySelector('[data-busy]'), null, { timeout: 60000 });
  } });
  const bar = await ph.locator('.actions').getByRole('button', { name: 'Save picture' }).boundingBox();
  ok(bar && bar.height >= 44, `phone: "Save picture" in the fixed bar, ${bar && Math.round(bar.height)} px tall`);
  const small = await ph.$$eval('.st-btns .btn, .seg-btn, .switch', (bs) => bs.filter((b) => b.getBoundingClientRect().width).map((b) => { const r = b.getBoundingClientRect(); return [b.getAttribute('aria-label') || b.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, hh]) => hh < 44 || w < 44));
  ok(!small.length, `phone: the list's buttons, the formats and the switches are 44 px and more (${JSON.stringify(small)})`);
  const order = await ph.locator('.st-name').allTextContents();
  ok(order.join() === '1. chat-1.png,2. chat-2.png,3. chat-3.png', `phone: in order (${order.join(', ')})`);
  await ph.close();
};
