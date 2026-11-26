// OCR (#/ocr): Tesseract (wasm) on a real scanned page (scikit-image "page") and on French / Spanish / German text
// with accents rendered in the browser; .txt download; low-confidence highlighting; pictures turned (by hand and by
// themselves when they read badly); light text on dark; the newest picture wins; language data that cannot be fetched;
// the camera (owner, 20 Nov 2026): the PC's webcam and the phone's back camera, live in the page with Snap — a stand-in
// camera shows a sentence, and what Snap takes is what is read; Switch, Cancel, a file instead, leaving the tab, a late or
// refused answer, a camera that stops by itself; phone layout with a picker that does not force the camera.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { fakeTextCamera, live, stopped } from './_camera.mjs';
import { tiltedJpeg, CLOSE_UP } from './_tilt.mjs';
import { scoreLists } from '../lib/listscore.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  await page.goto(base + '#/ocr');
  const recognise = async (file, langLabel, clean = true) => {
    await page.locator('input[type=file]').setInputFiles(file);
    await page.waitForSelector('.ed-canvas', { state: 'visible' });
    // the new picture has arrived when the last result is cleared (a large photo takes a moment to open: pressed before,
    // Extract read the picture before it, and that reading was dropped when the new one came — the run waited for ever)
    await page.waitForFunction(() => !/confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''));
    if (langLabel) await page.getByRole('radio', { name: langLabel }).click();
    const sw = page.locator('label.switch', { hasText: 'Clean up' }).locator('input');
    if ((await sw.isChecked()) !== clean) await page.locator('label.switch', { hasText: 'Clean up' }).click();
    await page.getByRole('button', { name: 'Extract text' }).click();
    await page.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
    return page.locator('.ocr-text').inputValue();
  };
  const t1 = await recognise(F('page.png'), 'English', false);
  info(`page.png → ${JSON.stringify(t1.slice(0, 120))}`);
  ok(/segmentation/i.test(t1) && /markers/i.test(t1) && /coins/i.test(t1), 'English: real scanned page read (segmentation, markers, coins)');
  const txt = readFileSync(await download(page, () => page.getByRole('button', { name: 'Download .txt' }).click()), 'utf8');
  ok(txt === t1, '.txt download equals the recognised text');

  // a phone's photo of a Kindle page (owner, 21 Nov 2026: the OCR tab as good on a phone as the Photo Dictionary — to-do #9):
  // the page found and straightened before it is read. The words read right are held to the page's own words
  // (tests/fixtures/images/kindle-*.txt, from scripts/make-kindle-photos.py): a still and a frame of the live video.
  const wordsOf = (x) => (x.normalize('NFC').replace(/[’‘]/g, "'").toLowerCase().match(/[a-z0-9']+/g) || []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
  const lcs = (a, b) => { let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1); for (let i = 1; i <= a.length; i++) { cur[0] = 0; for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); [prev, cur] = [cur, prev]; } return prev[b.length]; };
  const line = () => page.locator('.ocr-text ~ [aria-live="polite"]').innerText();
  const readRight = {};
  // (kindle-blur and kindle-comfortaa: upright photos whose letters run together — the letter-based check took one for
  // upside down and the other for sideways, and the turn spoiled them: 2 % and 0 % of their words; 21 Nov 2026)
  for (const [f, min] of [['kindle-page.jpg', 0.95], ['kindle-frame.jpg', 0.9], ['kindle-blur.jpg', 0.95], ['kindle-comfortaa.jpg', 0.75]]) {
    const got = await recognise(F(f), 'English', true), truth = wordsOf(readFileSync(F(f.replace('.jpg', '.txt')), 'utf8'));
    const right = readRight[f] = lcs(truth, wordsOf(got)) / truth.length;
    ok(right >= min && /the page was found and straightened/.test(await line()) && !/reads poorly/.test(await line()) && !/turned/.test(await line()), `${f}: ${(100 * right).toFixed(1)} % of the page's words read right (at least ${100 * min} %), the page straightened first and not turned (${await line()})`);
    const low = await page.locator('.ocr-low').evaluateAll((els) => els.map((e) => [parseFloat(e.style.left), parseFloat(e.style.top)]));
    ok(low.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100), `${f}: the unsure words are marked on the page that was read (${low.length})`);
  }
  // documents with rich formatting, photographed (to-do #18; owner, 26 Nov 2026: "works very poorly for a document that has
  // formatting, rich text formatting like bullet points, indentation, etc., especially using the phone camera. Also
  // improve the quality when the document has a watermark"): pages of real text laid out as Google Docs, Word and a
  // newsletter (scripts/make-format-docs.mjs, photographed by scripts/make-doc-photos.py) — read the shared way
  // (src/lib/readpage.ts): a checklist with bullets, check boxes, a table and a red DRAFT on a smooth desk (it passed for a
  // screenshot and was never straightened: 15 % before), a two-column newsletter in a video frame (read straight across
  // the columns: 56 % before), a Word memo close up, its page running off the photo (63 %). No list mark is read as a
  // letter ("e", "o", "©", "71") and no table rule as "|" (the owner: "the ocr should not get confused by them"). And the
  // page's lists are kept in the text (to-do #31; owner, 26 Nov 2026: "In the OCR app, the rich formatting should be
  // preserved, the bullet points, etc."): each item with its mark (• ◦ ▪ ☐ ☑, put back where the clean-up cleared it) or
  // its number, four spaces a level, the lines it runs on to under its text — held to the page's own lists
  // (<photo>.lists.json, from scripts/make-format-docs.mjs). A mark put back is no stray: the strays are the marks the
  // reader read as letters.
  const STRAY = /^\s*(?:[eoOcC©®«¢°~=]|71|\(?[eo©]\)?|[eo][.,])\s+\S/;
  for (const [f, min, items, runOn] of [['doc-checklist-draft-still.jpg', 0.85, 8, 1], ['doc-newsletter-frame.jpg', 0.9, 3, 4], ['doc-memo-still.jpg', 0.92, 14, 9]]) {
    const got = await recognise(F(f), 'English', true), truth = wordsOf(readFileSync(F(f.replace('.jpg', '.txt')), 'utf8'));
    const right = lcs(truth, wordsOf(got)) / truth.length;
    ok(right >= min && /the page was found and straightened/.test(await line()), `${f}: ${(100 * right).toFixed(1)} % of the page's words read right, in reading order (at least ${100 * min} %; ${await line()})`);
    const strays = got.split('\n').filter((l) => STRAY.test(l)), bars = (got.match(/(^|\s)\|(?=\s|$)/g) || []).length;
    ok(strays.length <= 1 && bars <= 1, `${f}: no list mark read as a letter, no table rule as | (${strays.length} lines ${JSON.stringify(strays.slice(0, 3))}, ${bars} bars)`);
    const sc = scoreLists(got, JSON.parse(readFileSync(F(f.replace('.jpg', '.lists.json')), 'utf8')));
    ok(sc.right >= items && sc.contRight >= runOn, `${f}: the page's lists kept — ${sc.right} of ${sc.items} items with their mark or number at their level (at least ${items}), ${sc.contRight} of ${sc.conts} lines run on to under their item's text (at least ${runOn})${sc.wrong.length ? ': ' + sc.wrong.slice(0, 4).join(' | ') : ''}`);
    if (f === 'doc-memo-still.jpg') {
      info(`${f} as the tab gives it:\n${got.split('\n').slice(3, 18).map((l) => '      | ' + l).join('\n')}`);
      // Copy and the .txt give the text as the box shows it, marks and spaces and all
      const txtM = readFileSync(await download(page, () => page.getByRole('button', { name: 'Download .txt' }).click()), 'utf8');
      await page.getByRole('button', { name: 'Copy' }).click();
      // (Windows' clipboard keeps a line break as \r\n: Chrome writes and reads it so there — Windows check run 12)
      const clip = (await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `(clipboard: ${e.message})`)).replace(/\r\n/g, '\n');
      const apart = (a) => { let i = 0; while (i < a.length && a[i] === got[i]) i++; return a === got ? 'same' : `apart at ${i} of ${a.length} / ${got.length}: ${JSON.stringify(a.slice(i, i + 24))} for ${JSON.stringify(got.slice(i, i + 24))}`; };
      ok(txtM === got && clip === got && /\n {4}◦ /.test(got) && /\n {8}▪ /.test(got), `${f}: the .txt and Copy give the text with its marks and indentation (.txt ${apart(txtM)}; Copy ${apart(clip)})`);
    }
  }
  // a scan with CONFIDENTIAL across it as strong as printers make it: the white area its letters fence in is no page (it
  // passed for one, and the page was read from half way down — 47 % of its words); the scan is read whole
  { const f = 'doc-memo-watermark-scan.jpg', got = await recognise(F(f), 'English', true), truth = wordsOf(readFileSync(F(f.replace('.jpg', '.txt')), 'utf8'));
    const right = lcs(truth, wordsOf(got)) / truth.length;
    ok(right >= 0.95 && !/the page was found/.test(await line()), `${f}: ${(100 * right).toFixed(1)} % of its words read right, the scan read whole (${await line()})`); }

  // the phone held sideways (owner, 21 Nov 2026 — to-do #11: "either with my left hand or my right hand"): the Kindle
  // photo turned a quarter either way, or upside down, reads as well as upright; the line says how it was turned
  { const truth = wordsOf(readFileSync(F('kindle-page.txt'), 'utf8'));
    const turnedJpeg = async (deg) => Buffer.from(await page.evaluate(async ([b64, deg]) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
      const q = deg % 180 !== 0, c = new OffscreenCanvas(q ? bmp.height : bmp.width, q ? bmp.width : bmp.height), g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer());
      let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
    }, [readFileSync(F('kindle-page.jpg')).toString('base64'), deg]), 'base64');
    for (const [deg, how] of [[90, 'a quarter to the left'], [270, 'a quarter to the right'], [180, 'upside down']]) {
      const got = await recognise({ name: `kindle-${deg}.jpg`, mimeType: 'image/jpeg', buffer: await turnedJpeg(deg) }, 'English', true);
      const right = lcs(truth, wordsOf(got)) / truth.length;
      ok(right >= 0.95 && (await line()).includes(`the picture was turned ${how} to read it`) && /straightened/.test(await line()), `the Kindle photo turned ${deg}°: ${(100 * right).toFixed(1)} % of its words read right, turned ${how} first (${await line()})`);
    }
    // photos taken at an angle (owner, 21 Nov 2026: "especially on the phone, when I click it at different angles"): the
    // whole photo turned 30° and −40° on a desk (its page is found and straightened), and a close-up of the screen — no
    // edge to find, words cut at the sides — turned 20° and −25°: the lines are levelled first, and the close-up reads as
    // it does at the angle the photo has by itself (about 7°)
    for (const deg of [30, -40]) {
      const got = await recognise({ name: `kindle-tilt${deg}.jpg`, mimeType: 'image/jpeg', buffer: await tiltedJpeg(page, F('kindle-page.jpg'), deg) }, 'English', true);
      const right = lcs(truth, wordsOf(got)) / truth.length;
      ok(right >= 0.95 && /straightened|levelled/.test(await line()), `the Kindle photo turned ${deg}°: ${(100 * right).toFixed(1)} % of its words read right (${await line()})`);
    }
    const level = wordsOf(await recognise({ name: 'closeup.jpg', mimeType: 'image/jpeg', buffer: await tiltedJpeg(page, F('kindle-page.jpg'), 0, CLOSE_UP) }, 'English', true));
    ok(level.length >= 120, `the close-up as it is: ${level.length} words (${await line()})`);
    for (const deg of [20, -25]) {
      const got = wordsOf(await recognise({ name: `closeup${deg}.jpg`, mimeType: 'image/jpeg', buffer: await tiltedJpeg(page, F('kindle-page.jpg'), deg, CLOSE_UP) }, 'English', true));
      const same = lcs(level, got) / level.length, said = await line(), by = +(said.match(/levelled \((\d+)°\)/) || [])[1];
      ok(same >= 0.9 && by >= Math.abs(deg) - 10 && by <= Math.abs(deg) + 10, `the close-up turned ${deg}°: ${(100 * same).toFixed(1)} % of the words of the close-up as it is, levelled by ${by}° (${said})`);
    }
  }
  // a photo too soft to read well (a frame of the live video, out of focus, with moiré): the line says so
  await recognise(F('kindle-soft.jpg'), 'English', true);
  ok(/the text reads poorly: a sharper photo, closer and in good light, reads better/.test(await line()), `a blurred photo: the line says it reads poorly (${await line()})`);
  { const got = await recognise(F('kindle-page.jpg'), 'English', false), truth = wordsOf(readFileSync(F('kindle-page.txt'), 'utf8'));
    const raw = lcs(truth, wordsOf(got)) / truth.length;
    // (the page is not looked for without the clean-up; the photo may still be levelled — that is no clean-up)
    ok(!/straightened/.test(await line()), `without the clean-up the page is not cut out and straightened: ${(100 * raw).toFixed(1)} % against ${(100 * readRight['kindle-page.jpg']).toFixed(1)} % with it (${await line()}; the clean-up of before, without the straightening, read 1 %)`); }

  // the second reader for soft photos (owner, 26 Nov 2026: "Ok use PaddleOCR fallback for soft photos"): in a fresh tab a
  // sharp photo is read by Tesseract alone and nothing of PaddleOCR is fetched; a frame of the live video of a checklist,
  // which Tesseract reads unsurely (60 % of its words, confidence 69), is read by PaddleOCR too — its models fetched then,
  // from this site, once a visit — and its reading kept (93 % of the words when measured); its unsure words marked
  const readOn = async (pg, file) => {
    await pg.locator('input[type=file]').setInputFiles(file);
    await pg.waitForSelector('.ed-canvas', { state: 'visible' });
    await pg.waitForFunction(() => !/confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''));
    await pg.getByRole('button', { name: 'Extract text' }).click();
    await pg.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 300000 });
    return { text: await pg.locator('.ocr-text').inputValue(), line: await pg.locator('.ocr-text ~ [aria-live="polite"]').innerText() };
  };
  { const p2 = await newPage(), models = [], said = [];
    p2.on('request', (r) => { if (r.url().includes('/models/paddleocr/')) models.push(r.url().split('/models/paddleocr/')[1]); });
    await p2.goto(base + '#/ocr');
    const sharp = await readOn(p2, F('kindle-page.jpg'));
    ok(models.length === 0 && !/PaddleOCR/.test(sharp.line), `a sharp photo: Tesseract alone, nothing of PaddleOCR fetched (${sharp.line})`);
    // the progress line while it reads (a soft photo takes a few seconds more)
    const watch = setInterval(() => p2.locator('.ocr-text').locator('xpath=..').innerText().then((x) => { if (/PaddleOCR/.test(x)) said.push(x.split('\n').find((l) => /PaddleOCR/.test(l))); }).catch(() => {}), 300);
    const soft = await readOn(p2, F('doc-checklist-frame.jpg')), truth = wordsOf(readFileSync(F('doc-checklist-frame.txt'), 'utf8'));
    clearInterval(watch);
    const right = lcs(truth, wordsOf(soft.text)) / truth.length;
    ok(right >= 0.88 && /the photo was soft: PaddleOCR read it/.test(soft.line) && !/reads poorly/.test(soft.line), `a soft frame of a checklist: ${(100 * right).toFixed(1)} % of its words read right (Tesseract alone: 60 %; ${soft.line})`);
    ok(['PP-OCRv6_det_small.onnx', 'PP-OCRv6_rec_small.onnx', 'PP-OCRv6_rec_small.onnx.character.txt'].every((m) => models.includes(m)) && models.length === 3, `… PaddleOCR's models fetched then, from this site (${models.join(', ')})`);
    ok(said.some((x) => /PaddleOCR/.test(x)), `… the progress line said what it was doing (${[...new Set(said)].slice(0, 3).join(' | ')})`);
    const low = await p2.locator('.ocr-low').evaluateAll((els) => els.map((e) => [parseFloat(e.style.left), parseFloat(e.style.top), parseFloat(e.style.width)]));
    ok(low.every(([x, y, w]) => x >= 0 && x <= 100 && y >= 0 && y <= 100 && w > 0), `… its unsure words marked on the page as read (${low.length})`);
    const again = await readOn(p2, F('doc-checklist-frame.jpg'));
    ok(models.length === 3 && /PaddleOCR read it/.test(again.line), `read again: the models kept for the visit (${models.length} files fetched in all)`);
    // a soft frame of a newsletter of two columns under a heading: PaddleOCR's lines column by column (Tesseract alone:
    // 72.5 %; PaddleOCR with its whole boxes given to the XY-cut read across the columns: 56 %)
    const nl = await readOn(p2, F('doc-newsletter-soft-frame.jpg')), nlTruth = wordsOf(readFileSync(F('doc-newsletter-soft-frame.txt'), 'utf8'));
    const nlRight = lcs(nlTruth, wordsOf(nl.text)) / nlTruth.length;
    ok(nlRight >= 0.88 && /PaddleOCR read it/.test(nl.line), `a soft frame of a two-column newsletter: ${(100 * nlRight).toFixed(1)} % of its words read right, in reading order (${nl.line})`);
    await p2.close(); }
  // its models cannot be fetched: Tesseract's reading stands, and the line says so
  { const p3 = await newPage();
    await p3.route('**/models/paddleocr/**', (r) => r.abort());
    await p3.goto(base + '#/ocr');
    const res = await readOn(p3, F('doc-checklist-frame.jpg'));
    ok(/the second reader could not be loaded/.test(res.line) && wordsOf(res.text).length > 100, `PaddleOCR's models refused: Tesseract's reading shown (${wordsOf(res.text).length} words), the line says why (${res.line})`);
    await p3.close(); }

  // render a sentence as an image in the browser (system serif font, black on white)
  const render = async (s) => Buffer.from(await page.evaluate(async (s) => {
    const c = new OffscreenCanvas(1500, 160), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1500, 160); g.fillStyle = '#111'; g.font = '44px "DejaVu Serif", "Liberation Serif", serif';
    g.fillText(s, 30, 95);
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
  }, s), 'base64');
  { await recognise({ name: 'shot.png', mimeType: 'image/png', buffer: await render('A screenshot is square on already.') }, 'English', true);
    ok(!/straightened/.test(await line()) && /screenshot is square/i.test(await page.locator('.ocr-text').inputValue()), `a screenshot (exactly flat colours) is read as it is, not cut to a "page" (${await line()})`); }
  const cases = [
    ['Français', 'Le cœur a ses raisons que la raison ne connaît point.', ['raisons', 'connaît', 'cœur']],
    ['Español', 'El niño comió una manzana en España mañana.', ['niño', 'España', 'mañana']],
    ['Deutsch', 'Die Größe der Straße über dem Fluss.', ['Größe', 'Straße', 'über']],
  ];
  for (const [label, sentence, words] of cases) {
    const got = await recognise({ name: 'line.png', mimeType: 'image/png', buffer: await render(sentence) }, label);
    const hits = words.filter((w) => got.includes(w));
    info(`${label}: ${JSON.stringify(got)}`);
    ok(hits.length >= words.length - 1, `${label}: accented words recognised (${hits.join(', ')})`);
  }
  const mixed = await recognise({ name: 'mix.png', mimeType: 'image/png', buffer: await render('Größe et raisons in English') }, 'Mixed / not sure');
  ok(/Größe/.test(mixed) && /raisons/.test(mixed), `mixed languages: ${mixed}`);

  // a picture that is sideways or upside down: tried the other ways round and read the best way
  const turnedPng = async (deg) => Buffer.from(await page.evaluate(async ([b64, deg]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const q = deg % 180 !== 0, c = new OffscreenCanvas(q ? bmp.height : bmp.width, q ? bmp.width : bmp.height), g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
  }, [readFileSync(F('page.png')).toString('base64'), deg]), 'base64');
  for (const [deg, how] of [[90, 'a quarter to the left'], [270, 'a quarter to the right'], [180, 'upside down']]) {
    const got = await recognise({ name: `turned-${deg}.png`, mimeType: 'image/png', buffer: await turnedPng(deg) }, 'English', false);
    const said = await page.locator('.ocr-text + div').textContent();
    ok(/segmentation/i.test(got) && /markers/i.test(got) && said.includes(`the picture was turned ${how}`), `page turned ${deg}°: read after turning it ${how} (${said})`);
  }
  // turning by hand: the buttons turn the picture that is read
  await page.locator('input[type=file]').setInputFiles({ name: 'by-hand.png', mimeType: 'image/png', buffer: await turnedPng(90) });
  await page.waitForFunction(() => !/confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''));
  await page.getByRole('button', { name: 'Turn the picture left' }).click();
  await page.waitForTimeout(300);
  const [cw, chh] = await page.locator('.ed-canvas').evaluate((c) => [c.width, c.height]);
  ok(cw > chh, `"Turn the picture left" turns the picture (${cw}×${chh})`);
  await page.getByRole('button', { name: 'Extract text' }).click();
  await page.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
  ok(/segmentation/i.test(await page.locator('.ocr-text').inputValue()) && !/was turned/.test(await page.locator('.ocr-text + div').textContent()), 'turned by hand: read at once, nothing more to turn');

  // a screenshot in dark mode with the clean-up on: no stray characters (the clean-up expects dark text on paper)
  const dark = Buffer.from(await page.evaluate(async () => {
    const c = new OffscreenCanvas(900, 72), g = c.getContext('2d');
    g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, 900, 72); g.fillStyle = '#e8e8e8'; g.font = '24px "DejaVu Sans", sans-serif';
    g.fillText('The quick brown fox jumps over the lazy dog near the river bank.', 10, 44);
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
  }), 'base64');
  const dk = await recognise({ name: 'dark.png', mimeType: 'image/png', buffer: dark }, 'English', true);
  // (on Windows, where "DejaVu Sans" is Arial, the outline of its line was taken for a page and straightened, the
  // descenders cut off: "iumps … lazv doa" — no page is shaped like a line of text: src/lib/pagecrop.ts MAX_ASPECT)
  ok(dk.replace(/\s+/g, ' ') === 'The quick brown fox jumps over the lazy dog near the river bank.' && !/straightened/.test(await line()), `light text on dark, cleaned up: exactly the sentence, read as it is (${JSON.stringify(dk)}; ${await line()})`);

  // Copy and Download with nothing read yet are refused in words
  await page.locator('input[type=file]').setInputFiles(F('coffee.jpg'));
  await page.waitForFunction(() => !/confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''));
  await page.getByRole('button', { name: 'Copy' }).click();
  ok(await page.locator('.toast', { hasText: 'There is no text yet' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'Copy with no text: "There is no text yet …"');
  ok(page.errors.filter((e) => !/There is no text yet/.test(e)).length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const idb = await page.evaluate(async () => (await indexedDB.databases?.())?.length ?? 0);
  ok(idb === 0, 'no IndexedDB databases created (models are not cached — stateless)');

  // the newest picture wins: a reading started for one picture is never shown for the next (the language data held back)
  const slow = await newPage();
  let hold = true;
  await slow.route(/eng\.traineddata/, async (r) => { while (hold) await new Promise((res) => setTimeout(res, 100)); await r.continue(); });
  await slow.goto(base + '#/ocr');
  await slow.locator('input[type=file]').setInputFiles(F('page.png'));
  await slow.getByRole('button', { name: 'Extract text' }).click();
  await slow.waitForTimeout(800);
  await slow.locator('input[type=file]').setInputFiles({ name: 'line.png', mimeType: 'image/png', buffer: await render('Le cœur a ses raisons.') });
  hold = false;
  await slow.waitForTimeout(8000);
  ok(await slow.locator('.ocr-text').inputValue() === '' && !/words/.test(await slow.locator('.ocr-text + div').textContent()), 'a new picture while the old one was being read: the old reading is not shown');
  await slow.getByRole('button', { name: 'Extract text' }).click();
  await slow.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
  ok(/raisons/.test(await slow.locator('.ocr-text').inputValue()), 'the new picture is read when asked');
  ok(slow.errors.length === 0, `no page errors: ${slow.errors.join(' | ')}`);

  // the language data cannot be fetched: said in words, the button is free again, the next try works
  const broken = await newPage();
  await broken.route(/eng\.traineddata/, (r) => r.abort());
  await broken.goto(base + '#/ocr');
  await broken.locator('input[type=file]').setInputFiles(F('page.png'));
  await broken.getByRole('button', { name: 'Extract text' }).click();
  ok(await broken.locator('.toast', { hasText: 'could not be fetched' }).first().waitFor({ timeout: 30000 }).then(() => true, () => false), 'the language data cannot be fetched: "The text engine or its language data could not be fetched …" (it was stuck at "Loading the text engine…" for ever)');
  await broken.unroute(/eng\.traineddata/);
  await broken.getByRole('button', { name: 'Extract text' }).click({ timeout: 5000 });
  await broken.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
  ok(/segmentation/i.test(await broken.locator('.ocr-text').inputValue()), 'the next try loads the engine afresh and reads the page');
  ok(broken.errors.filter((e) => !/could not be fetched/.test(e)).length === 0, `no uncaught errors (Tesseract.js threw "Failed to fetch" from its message handler): ${broken.errors.join(' | ')}`);

  // ------------------------------------------------------------- the camera: the PC's webcam, the phone's back camera
  // the stand-in camera (tests/e2e/_camera.mjs) shows a sentence: what Snap takes is what "Extract text" reads
  const readIt = async (p) => {
    await p.getByRole('button', { name: 'Extract text' }).click();
    await p.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
    return p.locator('.ocr-text').inputValue();
  };
  const cam = await newPage();
  await cam.addInitScript(fakeTextCamera);
  await cam.goto(base + '#/ocr');
  const useCam = cam.getByRole('button', { name: 'Use webcam' });
  await useCam.waitFor();
  ok(await cam.locator('input[type=file]').count() === 1 && await cam.locator('input[type=file][capture]').count() === 0, 'PC: "Use webcam" beside the picker');
  await useCam.click();
  await live(cam);
  const c0 = (await cam.evaluate(() => window.__gumCalls))[0];
  ok(c0.audio === false && c0.video && !('facingMode' in c0.video) && !('deviceId' in c0.video) && c0.video.width?.ideal === 3840 && c0.video.height?.ideal === 2160,
    `PC: the default webcam is asked for, at up to 4K, without sound (${JSON.stringify(c0)})`);
  ok(await cam.getByRole('button', { name: 'Switch camera' }).isVisible(), 'two webcams: "Switch camera" is offered');
  ok(await cam.locator('.live-cam-video').evaluate((v) => getComputedStyle(v).transform === 'none' && getComputedStyle(v).objectFit === 'contain'), 'the live view is the whole picture and not mirrored (text reads the right way)');
  await cam.getByRole('button', { name: 'Snap' }).click();
  await cam.waitForSelector('.ed-canvas', { state: 'visible' });
  ok(await stopped(cam) && await cam.locator('.live-cam').isHidden() && await useCam.isVisible(), 'Snap: the camera is closed (its track stopped) and the photo is in the editor');
  const [ew, eh] = await cam.locator('.ed-canvas').evaluate((c) => [c.width, c.height]);
  ok(ew === 1280 && eh === 720, `the photo is the camera's whole frame (${ew}×${eh})`);
  ok(/Choose another photo/.test(await cam.locator('.drop').first().textContent()), 'the drop zone makes room once a photo is taken ("Choose another photo")');
  const snapped = await readIt(cam);
  ok(/webcam reads this sentence well/.test(snapped), `the photo from the webcam is read: ${JSON.stringify(snapped)}`);
  const camTxt = await download(cam, () => cam.getByRole('button', { name: 'Download .txt' }).click());
  ok(/camera-\d{8}-\d{6}(-\d+)?\.txt$/.test(camTxt) && readFileSync(camTxt, 'utf8') === snapped, `its text downloads under the photo's name, as a phone names photos (${camTxt.split('/').pop()})`);
  // Switch: the other webcam; the photo comes from it
  await useCam.click();
  await live(cam);
  ok(await cam.locator('.ed-canvas').isVisible() && await cam.evaluate(() => document.documentElement.classList.contains('cam-open')), 'while the camera is open the last photo stays below it (html.cam-open: on phones the fixed bar steps aside)');
  await cam.getByRole('button', { name: 'Switch camera' }).click();
  await cam.waitForFunction(() => window.__gumCalls.length === 3, null, { timeout: 15000 });
  await live(cam);
  const c2 = (await cam.evaluate(() => window.__gumCalls))[2];
  ok(c2.video.deviceId?.exact === 'cam-b' && await cam.evaluate(() => window.__tracks[1].readyState === 'ended' && window.__tracks[2].readyState === 'live'),
    `"Switch camera" opens the other webcam (${JSON.stringify(c2.video.deviceId)}) and closes the first`);
  await cam.getByRole('button', { name: 'Snap' }).click();
  await cam.waitForSelector('.ed-canvas', { state: 'visible' });
  const second = await readIt(cam);
  ok(/second camera shows this line/.test(second), `the photo comes from the camera switched to: ${JSON.stringify(second)}`);
  // Cancel: the camera closes, the last photo and its text are still there
  await useCam.click();
  await live(cam);
  ok((await cam.evaluate(() => window.__gumCalls.at(-1))).video.deviceId?.exact === 'cam-b', 'the camera opens again with the webcam switched to');
  await cam.getByRole('button', { name: 'Cancel' }).click();
  ok(await stopped(cam) && await cam.locator('.live-cam').isHidden() && await cam.locator('.ed-canvas').isVisible() && /second camera/.test(await cam.locator('.ocr-text').inputValue()),
    'Cancel: the camera is closed, the last photo and its text are still there');
  // a file chosen while the camera is open: the camera closes and the file is shown
  await useCam.click();
  await live(cam);
  await cam.locator('input[type=file]').setInputFiles(F('page.png'));
  // (the camera closes as the file is chosen, the picture changes once the file is read: wait for the file's 384 × 191)
  await cam.waitForFunction(() => { const c = document.querySelector('.ed-canvas'); return document.querySelector('.live-cam').hidden && c.width === 384 && c.height === 191; }, null, { timeout: 10000 }).catch(() => {});
  ok(await stopped(cam) && await cam.locator('.ocr-text').inputValue() === '' && await cam.locator('.ed-canvas').evaluate((c) => c.width === 384 && c.height === 191),
    'a file chosen while the camera is open: the camera is closed and the file is the picture');
  // the camera stops by itself (unplugged, taken by another app): said, and closed
  await useCam.click();
  await live(cam);
  await cam.evaluate(() => window.__tracks.at(-1).dispatchEvent(new Event('ended')));
  ok(await cam.locator('.toast', { hasText: 'The camera stopped' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false) && await cam.locator('.live-cam').isHidden() && await useCam.isVisible(),
    'a camera that stops by itself: "The camera stopped — it was unplugged, or another app took it." and the view closes');
  // leaving the tab with the camera open closes it
  await useCam.click();
  await live(cam);
  await cam.evaluate(() => { location.hash = '#/'; }); await cam.locator('.tile').first().waitFor();
  ok(await stopped(cam), 'leaving the tab with the camera open: the camera is closed');
  // an answer that comes after the person has moved on (the permission question still open): stopped at once
  await cam.evaluate(() => { location.hash = '#/ocr'; window.__gumDelay = 1500; });
  await useCam.click();
  await cam.waitForTimeout(200);
  ok(/Asking for the camera/.test(await cam.locator('.live-cam-wrap').textContent()), 'while the browser asks the person: "Asking for the camera…"');
  await cam.evaluate(() => { location.hash = '#/'; });
  await cam.waitForTimeout(2500);
  ok(await stopped(cam), 'a camera that answers after the tab was left is stopped at once (it stayed on, unseen)');
  await cam.evaluate(() => { location.hash = '#/ocr'; });
  await useCam.click();
  await cam.waitForTimeout(200);
  await cam.locator('input[type=file]').setInputFiles(F('page.png'));
  await cam.waitForTimeout(2500);
  ok(await stopped(cam) && await cam.locator('.live-cam').isHidden() && await cam.locator('.ed-canvas').isVisible(), 'a file chosen before the camera answered: the camera is stopped when it answers and the file stays');
  // refused or missing: said with what to do instead
  await cam.evaluate(() => { window.__gumDelay = 0; window.__gumError = 'NotAllowedError'; });
  await useCam.click();
  ok(/The camera was not allowed — allow it in the browser's site settings.*choose an image instead/.test(await cam.locator('.toast').last().textContent({ timeout: 10000 })) && await useCam.isEnabled(),
    'a refused camera: said with what to do, and the button works again');
  await cam.evaluate(() => { window.__gumError = 'NotFoundError'; });
  await useCam.click();
  ok(await cam.locator('.toast', { hasText: 'No camera was found — choose an image instead.' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'no camera: "No camera was found — choose an image instead."');
  await cam.evaluate(() => { window.__gumError = undefined; window.__oneCam = true; });
  await useCam.click();
  await live(cam);
  ok(await cam.getByRole('button', { name: 'Switch camera' }).isHidden(), 'one webcam: no "Switch camera"');
  await cam.getByRole('button', { name: 'Cancel' }).click();
  ok(cam.errors.length === 0, `camera: no page errors ${cam.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.addInitScript(fakeTextCamera);
  await phone.goto(base + '#/ocr');
  await phone.waitForSelector('input[type=file]', { state: 'attached' });
  ok(await phone.locator('input[type=file]').count() === 1 && await phone.locator('input[type=file][capture]').count() === 0, 'phone: the picker does not force the camera — screenshots and photos already taken can be chosen');
  await phone.getByRole('button', { name: 'Use camera' }).click();
  await live(phone);
  ok((await phone.evaluate(() => window.__gumCalls))[0].video.facingMode?.ideal === 'environment', 'phone: "Use camera" opens the back camera');
  await phone.waitForTimeout(300);
  const lay = await phone.evaluate(() => {
    const nav = document.querySelector('.navwrap').getBoundingClientRect().bottom, box = document.querySelector('.live-cam').getBoundingClientRect();
    const btns = [...document.querySelectorAll('.live-cam-ctl > button')].map((b) => b.getBoundingClientRect());
    return { nav, boxTop: box.top, vh: innerHeight, tops: btns.map((r) => Math.round(r.top)), bottom: Math.max(...btns.map((r) => r.bottom)), minH: Math.min(...btns.map((r) => r.height)), snapW: btns[0].width };
  });
  ok(lay.boxTop >= lay.nav - 1 && lay.bottom <= lay.vh, `phone: the whole camera view and its buttons are on the screen, below the tab rows (${JSON.stringify(lay)})`);
  ok(new Set(lay.tops).size === 1 && lay.minH >= 44 && lay.snapW > 150, 'phone: Snap, Switch and Cancel on one line, at least 44 px tall, Snap the widest');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll with the camera open');
  await phone.getByRole('button', { name: 'Switch camera' }).click();
  await phone.waitForFunction(() => window.__gumCalls.length === 2, null, { timeout: 15000 });
  await live(phone);
  ok((await phone.evaluate(() => window.__gumCalls))[1].video.facingMode?.ideal === 'user' && await phone.evaluate(() => window.__tracks[0].readyState === 'ended'), 'phone: "Switch camera" turns to the front camera (the back one closed first — an iPhone cannot hold both)');
  await phone.getByRole('button', { name: 'Switch camera' }).click();
  await phone.waitForFunction(() => window.__gumCalls.length === 3, null, { timeout: 15000 });
  await live(phone);
  await phone.getByRole('button', { name: 'Snap' }).click();
  await phone.waitForSelector('.ed-canvas', { state: 'visible' });
  ok((await phone.evaluate(() => window.__gumCalls))[2].video.facingMode?.ideal === 'environment' && await stopped(phone), 'phone: back to the back camera, Snap closes it');
  ok(await phone.evaluate(() => document.querySelector('.ed-canvas').closest('.card').getBoundingClientRect().top >= document.querySelector('.navwrap').getBoundingClientRect().bottom - 1),
    'phone: after Snap the photo is in view, not under the tab rows');
  ok(/webcam reads this sentence well/.test(await readIt(phone)), 'phone: the photo is read');
  // the fixed "Extract text" bar steps aside while the camera is open (it would cover Snap) and comes back after
  await phone.getByRole('button', { name: 'Use camera' }).click();
  await live(phone);
  const barHidden = await phone.evaluate(() => getComputedStyle(document.querySelector('.actions')).display === 'none');
  await phone.locator('.live-cam-ctl').getByRole('button', { name: 'Cancel' }).click();
  const barBack = await phone.evaluate(() => getComputedStyle(document.querySelector('.actions')).display !== 'none' && !document.documentElement.classList.contains('cam-open'));
  ok(barHidden && barBack, `phone: the fixed "Extract text" bar steps aside while the camera is open and comes back after (${barHidden}, ${barBack})`);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  ok(phone.errors.length === 0, `phone: no page errors ${phone.errors.join(' | ')}`);
};
