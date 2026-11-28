// To-do #38 (owner, 27 Nov 2026: "Both the ocr and the photo dictionary app should copy the ocr text to the clipboard immediately
// after conversion"): the text read goes to the clipboard by itself — the OCR tab's text as its box shows it, the Photo Dictionary's
// whole text — and the tab says "Copied to the clipboard.". The copy is begun in the tap that starts the reading (Extract text in
// the OCR; Snap, Paste image and Ctrl+V in the Photo Dictionary, whose reading starts as the photo arrives): every write a page
// makes is recorded here with whether it was made within a tap (Chromium's user activation), what it handed over and how it
// ended (`during`: the event being handled when it was made — "click" for a tap, "paste" for Ctrl+V, none after an await;
// Chromium counts a page just opened as tapped for five seconds, so `active` alone says little). Chromium's real clipboard (leave
// given); a stand-in with Safari's rule — no write outside a tap — for the iPhone's photo
// chosen from the gallery: not copied by itself, said, and the tab's button copies it in one tap; Paste image there still copies.
// Nothing read → the clipboard as it was; a newer picture or leaving the tab → the older reading's copy dropped.
// The suites share the browser's clipboard: a check of what it holds that another suite's copy got in between is tried again.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fakeTextCamera, live, camButton, snap } from './_camera.mjs';

const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const PAGE = readFileSync(F('page.png')).toString('base64');
/** a white picture without a letter on it */
function whitePng(w, h) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 255)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const BLANK = { name: 'blank.png', mimeType: 'image/png', buffer: whitePng(480, 240) };

/** every clipboard write of the page recorded: item or text, made within a tap or not, the text an item handed over, how it
 *  ended. `safari`: a write made outside the handling of a tap, a key or a paste is refused, as Safari (and Firefox) refuse it —
 *  by the event being handled: Chromium's user activation lasts five seconds and Playwright's file choosing sets it, so it
 *  cannot stand for Safari's rule. */
/** rule: false — the browser's own answer; true — Safari's (refused outside a tap); 'refuse' — every write refused */
function watch(safari) {
  window.__writes = [];
  const c = navigator.clipboard;
  const record = (kind, real) => (arg) => {
    const rec = { kind, active: navigator.userActivation.isActive, during: window.event?.type || '', state: 'pending', text: undefined };
    window.__writes.push(rec);
    if (kind === 'item') { try { arg[0].getType('text/plain').then((b) => b.text()).then((t) => { rec.text = t; }, () => {}); } catch { /* an image */ } }
    else rec.text = arg;
    const tap = !!window.event?.isTrusted && ['click', 'paste', 'keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchend'].includes(window.event.type);
    const p = safari === 'refuse' || (safari && !tap)
      ? Promise.reject(new DOMException('The request is not allowed by the user agent or the platform in the current context.', 'NotAllowedError'))
      : real(arg);
    p.then(() => { rec.state = 'done'; }, (e) => { rec.state = `refused: ${e?.name}`; });
    return p;
  };
  c.write = record('item', c.write.bind(c));
  c.writeText = record('text', c.writeText.bind(c));
}
const writes = (p) => p.evaluate(() => window.__writes.map((w) => ({ ...w })));
const forget = (p) => p.evaluate(() => { window.__writes.length = 0; });
/** what the real clipboard holds (Windows keeps a line break as \r\n) */
const clip = (p) => p.evaluate(() => navigator.clipboard.readText()).then((s) => s.replace(/\r\n/g, '\n'), (e) => `(clipboard: ${e.message})`);
/** put text / a PNG on the real clipboard from a page that is not watched */
const putText = (p, s) => p.evaluate((x) => navigator.clipboard.writeText(x), s);
const putPng = (p, b64) => p.evaluate(async (b) => { const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]); }, b64);
const settle = (p) => p.waitForFunction(() => window.__writes.every((w) => w.state !== 'pending' && (w.kind !== 'item' || w.state !== 'done' || w.text !== undefined)), null, { timeout: 15000 }).catch(() => {});

export default async ({ base, page: newPage, ok, devices }) => {
  // (the Photo Dictionary's dictionaries and Wikipedia are its approved data hosts, answered here by a route)
  const away = [], watchAway = (p) => p.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:') && !/^https:\/\/(en\.wiktionary\.org|api\.dictionaryapi\.dev|en\.wikipedia\.org)\//.test(u)) away.push(u); });
  /** a check of the real clipboard, tried again (up to three times) when another suite's copy came in between */
  const tried = async (label, step) => {
    let r;
    for (let k = 1; k <= 3; k++) { r = await step(k); if (r.ok) { ok(true, `${label}${k > 1 ? ` (tried ${k} times — another suite's copy came in between)` : ''}`); return r; } }
    ok(false, `${label}: ${r.why}`); return r;
  };
  // an unwatched page for putting things on the clipboard (the suites' clipboard is the browser's, shared by every page)
  const helper = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  await helper.goto(`${base}#/wordcount`);

  // ================================================================ the OCR tab on a PC (Chromium's clipboard, leave given)
  const o = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  watchAway(o); await o.addInitScript(watch, false);
  await o.goto(`${base}#/ocr`);
  const said = () => o.locator('.ocr-copied').textContent();
  const open = async (file) => {
    await o.locator('input[type=file]').setInputFiles(file);
    await o.waitForSelector('.ed-canvas', { state: 'visible' });
    await o.waitForFunction(() => !/confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''));
  };
  const extract = async () => {
    await o.getByRole('button', { name: 'Extract text' }).click();
    await o.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
    await o.waitForFunction(() => !document.querySelector('.ocr-text').value.trim() || document.querySelector('.ocr-copied').textContent !== '', null, { timeout: 15000 }).catch(() => {});
    await settle(o);
    return o.locator('.ocr-text').inputValue();
  };
  await open(F('page.png'));
  await o.getByRole('radio', { name: 'English' }).click();
  const clean = o.locator('label.switch', { hasText: 'Clean up' });
  if (await clean.locator('input').isChecked()) await clean.click(); // a scan: read as it is
  let text = '';
  await tried('OCR: Extract text puts the text read on the clipboard by itself, exactly as the box shows it, and says so', async (k) => {
    await putText(helper, `before ${k}`); await forget(o);
    text = await extract();
    const w = await writes(o), c = await clip(o), s = await said();
    if (!/segmentation/i.test(text)) return { ok: false, why: `the page did not read (${text.slice(0, 60)})` };
    if (s !== 'Copied to the clipboard.') return { ok: false, why: `the line says "${s}"` };
    if (w.length !== 1 || w[0].kind !== 'item' || w[0].state !== 'done' || w[0].text !== text) return { ok: false, why: `the writes: ${JSON.stringify(w).slice(0, 200)}` };
    return c === text ? { ok: true } : { ok: false, why: `the clipboard holds ${JSON.stringify(c.slice(0, 60))}` };
  });
  { const w = await writes(o); ok(w[0]?.during === 'click', `… the copy was begun within the tap on Extract text (a promised item, handed over in the tap: Safari and Firefox write only there) — ${JSON.stringify(w)}`); }
  // the Copy button as before
  await putText(helper, 'something else');
  await o.getByRole('button', { name: 'Copy', exact: true }).click();
  await o.waitForTimeout(300);
  ok(await clip(o) === text && (await said()) === '', 'Copy still copies the text in one tap (the line about the copy cleared)');
  // nothing read: the clipboard as it was
  await putText(helper, 'kept as it was'); await open(BLANK); await forget(o);
  await extract();
  { const w = await writes(o); await o.waitForTimeout(300);
    ok(/No text found/.test(await o.locator('.ocr-text').evaluate((e) => e.parentElement.textContent)) && await clip(o) === 'kept as it was' && (await said()) === '' && w.length === 1 && /^refused/.test(w[0].state),
      `a picture without text: the clipboard is left as it was, nothing said about a copy, the copy begun in the tap dropped (${JSON.stringify(w)})`); }
  // a newer picture while the reading runs: the older reading's copy dropped, the newer one's text copied
  await open(F('page.png')); await putText(helper, 'not this'); await forget(o);
  await o.getByRole('button', { name: 'Extract text' }).click();
  await o.waitForTimeout(400);
  await open(F('text.png'));
  await settle(o);
  { const w = await writes(o); await o.waitForTimeout(500);
    ok(w.length === 1 && /^refused/.test(w[0].state) && await clip(o) === 'not this', `a newer picture during the reading: its copy dropped, the clipboard as it was (${JSON.stringify(w)})`); }
  await tried('… and the newer picture\'s text copied when it is read', async (k) => {
    await putText(helper, `older ${k}`); await forget(o);
    const t2 = await extract(), c = await clip(o);
    return t2.trim() && c === t2 && !/segmentation/i.test(c) ? { ok: true } : { ok: false, why: `read ${JSON.stringify(t2.slice(0, 40))}, the clipboard ${JSON.stringify(c.slice(0, 40))}` };
  });
  // leaving the tab during a reading: dropped (the whole scenario again when another suite's copy came in between — on Windows
  // the clipboard is the system's, shared with the suites running beside this one)
  await tried('the tab left during a reading: its copy dropped, nothing written later, the clipboard as it was', async (k) => {
    if (k > 1) { await o.evaluate(() => { location.hash = '#/ocr'; }); await o.waitForSelector('input[type=file]', { state: 'attached' }); }
    await open(F('page.png')); await putText(helper, `left alone ${k}`); await forget(o);
    await o.getByRole('button', { name: 'Extract text' }).click();
    await o.waitForTimeout(300);
    await o.evaluate(() => { location.hash = '#/wordcount'; });
    await o.waitForTimeout(1500);
    const w = await writes(o), c = await clip(o);
    return w.length === 1 && /^refused/.test(w[0].state) && c === `left alone ${k}` ? { ok: true } : { ok: false, why: `writes ${JSON.stringify(w)}, the clipboard ${JSON.stringify(c.slice(0, 60))}` };
  });

  // ---------------------------------------------------------------- OCR where writing is refused: said, and Copy does it
  // (a stand-in that refuses every write: Chromium's own answer without the leave depends on the build — Playwright's headless
  // shell on Linux refuses, Google Chrome on Windows writes while the page has the focus, as the Windows check found)
  const r = await newPage({ viewport: { width: 1366, height: 900 } });
  watchAway(r); await r.addInitScript(watch, 'refuse');
  await r.goto(`${base}#/ocr`);
  await r.locator('input[type=file]').setInputFiles(F('text.png'));
  await r.waitForSelector('.ed-canvas', { state: 'visible' });
  await r.getByRole('button', { name: 'Extract text' }).click();
  await r.waitForFunction(() => document.querySelector('.ocr-copied')?.textContent !== '', null, { timeout: 120000 });
  const rText = await r.locator('.ocr-text').inputValue();
  ok(await r.locator('.ocr-copied').textContent() === 'Not copied by itself: this browser lets a page copy only when you tap — press “Copy”.', `a browser that refuses the write: said, with the button to press ("${await r.locator('.ocr-copied').textContent()}")`);
  await tried('… and Copy copies it in one tap', async (k) => {
    await putText(helper, `refused ${k}`);
    await r.getByRole('button', { name: 'Copy', exact: true }).click(); await r.waitForTimeout(300);
    const c = await clip(helper);
    return c === rText ? { ok: true } : { ok: false, why: `the clipboard holds ${JSON.stringify(c.slice(0, 40))} for ${JSON.stringify(rText.slice(0, 40))}` };
  });

  // ================================================================ the Photo Dictionary (its reading starts as the photo arrives)
  const quiet = async (p) => { for (const host of ['https://en.wiktionary.org/**', 'https://api.dictionaryapi.dev/**', 'https://en.wikipedia.org/**']) await p.route(host, (q) => q.fulfill({ status: 404, contentType: 'application/json', body: '{"title":"Not found."}', headers: { 'access-control-allow-origin': '*' } })); };
  const STATUS = '.pd-top [aria-live="polite"]';
  const done = (p) => p.waitForFunction((sel) => /uncommon word|No uncommon words|No text found|went wrong/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 180000 });
  const pdText = (p) => p.locator('.pd-textbody').evaluate((e) => e.textContent);
  const copied = (p) => p.waitForFunction(() => (document.querySelector('.pd-copied')?.textContent || '') !== '', null, { timeout: 180000 }).then(() => p.locator('.pd-copied').textContent());
  const fresh = async (p) => { await p.evaluate((sel) => { const s = document.querySelector(sel); if (s) s.textContent = ''; const c = document.querySelector('.pd-copied'); if (c) c.textContent = ''; }, STATUS); };
  const d = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  watchAway(d); await quiet(d); await d.addInitScript(fakeTextCamera); await d.addInitScript(watch, false);
  await d.goto(`${base}#/photodict`);
  await d.getByRole('button', { name: 'Paste image' }).waitFor();
  let book = '';
  await tried('Photo Dictionary: a photo chosen as a file — no tap — the page\'s whole text on the clipboard (Chrome writes while the page has the focus), "Copied to the clipboard." beside "Copy the text"', async (k) => {
    await putText(helper, `pd before ${k}`); await forget(d); await fresh(d);
    await d.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
    const s = await copied(d); await settle(d);
    book = await pdText(d);
    const w = await writes(d), c = await clip(d);
    if (s !== 'Copied to the clipboard.') return { ok: false, why: `the line says "${s}"` };
    if (w.length !== 1 || w[0].state !== 'done' || w[0].text !== book || w[0].during !== '') return { ok: false, why: `the writes: ${JSON.stringify(w).slice(0, 200)}` };
    return c === book && book.length > 400 ? { ok: true } : { ok: false, why: `the clipboard holds ${JSON.stringify(c.slice(0, 60))}` };
  });
  await done(d);
  ok(await d.locator('.pd-copyrow').getByRole('button', { name: 'Copy the text' }).isVisible(), 'the text box has its own "Copy the text" button');
  // Paste image: the copy begun in the tap (the photo arrives later, from the clipboard)
  await tried('Paste image: the copy begun within the tap, the text read on the clipboard (the picture that was there replaced by its text)', async (k) => {
    await putPng(helper, PAGE); await forget(d); await fresh(d);
    await d.getByRole('button', { name: 'Paste image' }).click();
    const s = await copied(d).catch(() => '(no line)'); await settle(d);
    const w = await writes(d), c = await clip(d), t = await pdText(d).catch(() => '');
    if (!/segmentation/i.test(t)) return { ok: false, why: `the pasted page did not read (${JSON.stringify(t.slice(0, 40))}; the paste line: ${await d.locator('#paste-say').textContent()})` };
    if (s !== 'Copied to the clipboard.' || w.length !== 1 || w[0].during !== 'click' || w[0].state !== 'done') return { ok: false, why: `line "${s}", writes ${JSON.stringify(w).slice(0, 200)}` };
    return c === t ? { ok: true } : { ok: false, why: `the clipboard holds ${JSON.stringify(c.slice(0, 60))}` };
  });
  await done(d);
  // Ctrl+V
  await tried('Ctrl+V: the copy begun in the paste itself, the text on the clipboard', async (k) => {
    await putPng(helper, PAGE); await forget(d); await fresh(d);
    await d.locator('.pd-intro').click(); await d.keyboard.press('Control+V');
    const s = await copied(d).catch(() => '(no line)'); await settle(d);
    const w = await writes(d), c = await clip(d), t = await pdText(d).catch(() => '');
    if (s !== 'Copied to the clipboard.' || w.length !== 1 || w[0].during !== 'paste' || w[0].state !== 'done') return { ok: false, why: `line "${s}", writes ${JSON.stringify(w).slice(0, 200)}` };
    return c === t && /segmentation/i.test(t) ? { ok: true } : { ok: false, why: `the clipboard holds ${JSON.stringify(c.slice(0, 60))}` };
  });
  await done(d);
  // Snap: the camera's picture (the stand-in camera shows a sentence)
  await tried('Snap: the copy begun within the tap on Snap, the sentence the camera showed on the clipboard', async (k) => {
    await putText(helper, `snap ${k}`); await fresh(d);
    await camButton(d).first().click(); await live(d); await forget(d);
    await snap(d);
    const s = await copied(d).catch(() => '(no line)'); await settle(d);
    const w = await writes(d), c = await clip(d), t = await pdText(d).catch(() => '');
    if (s !== 'Copied to the clipboard.' || w.length !== 1 || w[0].during !== 'click' || w[0].state !== 'done') return { ok: false, why: `line "${s}", writes ${JSON.stringify(w).slice(0, 200)}` };
    return c === t && t.trim().length > 10 ? { ok: true } : { ok: false, why: `read ${JSON.stringify(t.slice(0, 40))}, the clipboard ${JSON.stringify(c.slice(0, 40))}` };
  });
  await done(d);
  // two photos one after the other: the first one's reading is not shown, nor copied
  await tried('a photo chosen while another is read: the first one\'s copy dropped, the newer one\'s text copied', async (k) => {
    await putText(helper, `two ${k}`); await forget(d); await fresh(d);
    await d.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
    await d.waitForTimeout(600);
    await d.locator('input[type=file]').first().setInputFiles(F('page.png'));
    const s = await copied(d).catch(() => '(no line)'); await settle(d);
    const w = await writes(d), c = await clip(d), t = await pdText(d).catch(() => '');
    if (w.length !== 2 || !/^refused/.test(w[0].state) || w[1].state !== 'done') return { ok: false, why: `writes ${JSON.stringify(w).slice(0, 240)}` };
    return s === 'Copied to the clipboard.' && c === t && /segmentation/i.test(t) && !/Thaddeus|snollygoster/i.test(c) ? { ok: true } : { ok: false, why: `line "${s}", the clipboard ${JSON.stringify(c.slice(0, 60))}` };
  });
  await done(d);
  // nothing read
  await putText(helper, 'no text here'); await forget(d); await fresh(d);
  await d.locator('input[type=file]').first().setInputFiles(BLANK);
  await done(d); await settle(d); await d.waitForTimeout(300);
  { const w = await writes(d); ok(/No text found/.test(await d.locator(STATUS).textContent()) && await clip(d) === 'no text here' && w.length === 1 && /^refused/.test(w[0].state), `a photo without text: the clipboard as it was, the copy dropped (${JSON.stringify(w)})`); }
  // leaving the tab during a reading
  await putText(helper, 'still here'); await forget(d); await fresh(d);
  await d.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
  await d.waitForTimeout(800);
  await d.evaluate(() => { location.hash = '#/wordcount'; });
  await d.waitForTimeout(1500);
  { const w = await writes(d); ok(w.length === 1 && /^refused/.test(w[0].state) && await clip(d) === 'still here', `the tab left during a reading: its copy dropped (${JSON.stringify(w)})`); }

  // ================================================================ Safari's rule (no write outside a tap): an iPhone's gallery photo
  const sf = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  watchAway(sf); await quiet(sf); await sf.addInitScript(watch, true);
  await sf.goto(`${base}#/photodict`);
  await sf.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
  const sfSaid = await copied(sf);
  const sfText = await pdText(sf);
  ok(sfSaid === 'Not copied by itself: this browser lets a page copy only when you tap — press “Copy the text”.', `a photo chosen from the gallery where the browser writes only within a tap: said, with the button to press ("${sfSaid}")`);
  await done(sf);
  await tried('… and "Copy the text" copies it in one tap', async (k) => {
    await putText(helper, `gallery ${k}`);
    await sf.getByRole('button', { name: 'Copy the text' }).click(); await sf.waitForTimeout(300);
    const c = await clip(sf);
    return c === sfText && (await sf.locator('.pd-copied').textContent()) === '' ? { ok: true } : { ok: false, why: `the clipboard holds ${JSON.stringify(c.slice(0, 40))}` };
  });
  await tried('… while Paste image there copies by itself: the item was handed over within the tap', async (k) => {
    await putPng(helper, PAGE); await forget(sf); await fresh(sf);
    await sf.getByRole('button', { name: 'Paste image' }).click();
    const s = await copied(sf).catch(() => '(no line)'); await settle(sf);
    const w = await writes(sf), c = await clip(sf), t = await pdText(sf).catch(() => '');
    if (s !== 'Copied to the clipboard.' || !w.length || w[0].state !== 'done') return { ok: false, why: `line "${s}", writes ${JSON.stringify(w).slice(0, 200)}` };
    return c === t && /segmentation/i.test(t) ? { ok: true } : { ok: false, why: `the clipboard holds ${JSON.stringify(c.slice(0, 60))}` };
  });
  await done(sf);
  // the OCR under Safari's rule: Extract text is the tap
  const so = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  watchAway(so); await so.addInitScript(watch, true);
  await so.goto(`${base}#/ocr`);
  await so.locator('input[type=file]').setInputFiles(F('text.png'));
  await so.waitForSelector('.ed-canvas', { state: 'visible' });
  await tried('OCR where the browser writes only within a tap: Extract text\'s copy still lands', async (k) => {
    await putText(helper, `so ${k}`); await so.evaluate(() => { window.__writes.length = 0; });
    await so.getByRole('button', { name: 'Extract text' }).click();
    await so.waitForFunction(() => document.querySelector('.ocr-copied')?.textContent !== '', null, { timeout: 120000 });
    const t = await so.locator('.ocr-text').inputValue(), c = await clip(so), s = await so.locator('.ocr-copied').textContent();
    return s === 'Copied to the clipboard.' && c === t && t.trim() ? { ok: true } : { ok: false, why: `line "${s}", the clipboard ${JSON.stringify(c.slice(0, 40))}` };
  });

  // ================================================================ a phone
  const ph = await newPage({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
  watchAway(ph); await quiet(ph); await ph.addInitScript(watch, false);
  await ph.goto(`${base}#/photodict`);
  await ph.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
  const phSaid = await copied(ph); await done(ph);
  const btn = await ph.getByRole('button', { name: 'Copy the text' }).boundingBox();
  ok(phSaid === 'Copied to the clipboard.' && btn && btn.height >= 44 && btn.width >= 44, `phone: copied, and "Copy the text" takes a finger (${btn && `${Math.round(btn.width)} × ${Math.round(btn.height)} px`})`);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no sideways scroll with the copy row');

  ok(!away.length, `nothing was sent anywhere (${away.slice(0, 2).join(', ')})`);
  const errs = [o, r, d, sf, so, ph, helper].flatMap((p) => p.errors).filter((e) => !/Failed to load resource: the server responded with a status of 404/.test(e));
  ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
};
