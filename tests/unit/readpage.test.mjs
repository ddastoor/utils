// src/lib/readpage.ts — the one reading path of the OCR tab and the Photo Dictionary (to-do #18; owner, 26 Nov 2026: "One
// shared reading path is fine.. but make sure no functionality is compramised.. the high quality of the ocr is paramount").
// The real imgproc.wasm does the pictures; a stand-in reader records every reading (its size, its layout) and answers as
// told, so each step of both tabs is held: the clean-up switch, the page found and straightened, the whole photo read
// when the page gave little, the poor reading tried the other ways round (the OCR tab), a newer photo stopping it, the
// quick readings that decide which way up laid out as one block, a page of columns read as a page.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const RP = await load('/src/lib/readpage.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const jpeg = await import(root + 'node_modules/@jsquash/jpeg/decode.js');
  await jpeg.init(await WebAssembly.compile(readFileSync(root + 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')));
  const decode = async (p) => { const d = await jpeg.default(readFileSync(root + p)); return { data: d.data, width: d.width, height: d.height }; };
  const words = (n, conf = 90) => Array.from({ length: n }, (_, i) => ({ text: `word${i}`, conf, x0: 0, y0: 0, x1: 1, y1: 1 }));
  /** a reader: `answer(call)` gives { n, conf } for each reading (call: { n: the reading's number, w, h, layout, main }) */
  const reader = (answer) => {
    const calls = [];
    return { calls, read: async (img, _lang, onProgress, layout) => {
      const c = { n: calls.length, w: img.width, h: img.height, layout, main: !!onProgress }; calls.push(c);
      const a = answer(c) ?? { n: 40, conf: 90 };
      return { text: `${a.n} words`, confidence: a.conf, words: words(a.n, a.conf) };
    } };
  };
  const ops = { ...ip }; // no network in the unit suite (src/lib/pagecrop.ts asks it only when it is there)
  let cols0;
  const progress = () => {};
  const kindle = await decode('tests/fixtures/images/kindle-page.jpg');

  // the clean-up off: the picture read as it is — nothing found, straightened, cleaned or cleared, one block
  let f = reader(() => ({ n: 50, conf: 92 }));
  let r = await RP.readPage(kindle, { lang: 'eng', clean: false, auto: false, onProgress: progress }, { ops, read: f.read });
  const mains = (fr) => fr.calls.filter((c) => c.main);
  t.ok(r && !r.page && r.shown === null && r.cleared.marks === 0 && r.cleared.lines === 0 && r.columns === 1, 'clean-up off: no page looked for, nothing cleared');
  t.ok(mains(f).length === 1 && mains(f)[0].w === kindle.width && mains(f)[0].h === kindle.height && mains(f)[0].layout === 'block', `… one reading of the picture as it is, as one block (${JSON.stringify(mains(f))})`);

  // the clean-up on: the Kindle's screen found and straightened; read as one block (one column)
  f = reader(() => ({ n: 60, conf: 91 }));
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, onProgress: progress }, { ops, read: f.read });
  t.ok(r.page && r.by === 'outline' && r.shown && r.img.width < kindle.width, `the page found and straightened (by ${r.by}: ${r.img.width} × ${r.img.height} of ${kindle.width} × ${kindle.height}), shown in place of the photo`);
  t.ok(mains(f).length === 1 && mains(f)[0].layout === 'block' && r.columns === 1, `… read once, as one block (one column: ${r.columns})`);
  t.ok(f.calls.filter((c) => !c.main).every((c) => c.layout === 'block' && Math.max(c.w, c.h) <= 1000), `the quick readings that decide which way up: one block, at most 1000 px (${f.calls.filter((c) => !c.main).length})`);

  // a page found that gave little: the whole photo read too, the better reading kept
  let first = true;
  f = reader((c) => (c.main ? (first ? ((first = false), { n: 8, conf: 70 }) : { n: 45, conf: 88 }) : null));
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 2 && r.r.words.length === 45 && !r.page && mains(f)[1].w === kindle.width, `the page gave ${RP.FEW - 17} words: the whole photo read too, and kept (${r.r.words.length} words)`);
  first = true;
  f = reader((c) => (c.main ? (first ? ((first = false), { n: 8, conf: 70 }) : { n: 3, conf: 60 }) : null));
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, again: false, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 2 && r.r.words.length === 8 && r.page, '… and the page kept when the whole photo reads less');

  // the OCR tab: a poor reading tried the three other ways round; one that reads clearly better is taken
  const book = await decode('tests/fixtures/images/book-page.jpg');
  let retried = 0;
  f = reader((c) => (c.main ? (c.n === f.calls.findIndex((x) => x.main) ? { n: 40, conf: 30 } : { n: 120, conf: 88 }) : (c.w === c.h ? null : { n: 50, conf: c.n % 3 === 2 ? 85 : 20 })));
  r = await RP.readPage(book, { lang: 'eng', clean: true, auto: false, retryTurns: true, again: false, onProgress: progress, onRetry: () => retried++ }, { ops, read: f.read });
  t.ok(retried === 1 && r.turned !== null && r.r.confidence === 88, `a poor reading (30 %): tried the other ways round, the one that reads clearly better taken (turned ${r.turned}, ${mains(f).length} readings in full)`);
  f = reader((c) => (c.main ? { n: 40, conf: 30 } : { n: 30, conf: 45 }));
  r = await RP.readPage(book, { lang: 'eng', clean: true, auto: false, retryTurns: true, again: false, onProgress: progress }, { ops, read: f.read });
  t.ok(r.turned === null && mains(f).length === 1, '… none reads clearly better (45 %, under 60): left as it was');
  f = reader((c) => (c.main ? { n: 40, conf: 30 } : null));
  r = await RP.readPage(book, { lang: 'eng', clean: true, auto: true, onProgress: progress }, { ops, read: f.read });
  t.ok(r.turned === null && f.calls.filter((c) => !c.main && c.w !== c.h).length <= 4, 'the Photo Dictionary: no retry the other ways round (its own choice: retryTurns off)');
  // turned by hand: read that way round, never turned on its own
  f = reader(() => ({ n: 60, conf: 91 }));
  r = await RP.readPage(book, { lang: 'eng', clean: false, auto: false, turns: 1, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f)[0].w === book.height && mains(f)[0].h === book.width && f.calls.length === 1 && r.up.turns === 0, 'turned a quarter by hand: read that way round, nothing decided on its own');

  // a page with rules, list marks or columns read unsurely (below 85 %) is read again laid out the other way; the one that
  // reads more words surely is kept — on a soft photo Tesseract laid out as one block can lose a whole line (a form's
  // title, a table's row). A page of plain text (a Kindle's, a book's) is read once: it never gained, and a second
  // reading costs a phone seconds
  const lists = await decode('tests/fixtures/ocr/marks.jpg');
  f = reader((c) => (c.main ? (c.layout === 'block' ? { n: 80, conf: 76 } : { n: 100, conf: 83 }) : null));
  r = await RP.readPage(lists, { lang: 'eng', clean: true, auto: false, onProgress: progress }, { ops, read: f.read });
  t.ok(r.cleared.marks > 0 && r.cleared.inner > 0 && mains(f).length === 2 && mains(f)[1].layout === 'page' && r.layout === 'page' && r.r.words.length === 100, `lists and a table read unsurely (76 %): read again as a page, which read more words surely, kept (${mains(f).map((c) => c.layout).join(' → ')}; ${r.cleared.marks} marks, ${r.cleared.inner} px of rules inside)`);
  f = reader((c) => (c.main ? (c.layout === 'block' ? { n: 100, conf: 80 } : { n: 101, conf: 80 }) : null));
  r = await RP.readPage(lists, { lang: 'eng', clean: true, auto: false, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 2 && r.layout === 'block' && r.r.words.length === 100, '… one that reads barely more (within 3 %): the first kept');
  f = reader((c) => (c.main ? { n: 100, conf: 90 } : null));
  r = await RP.readPage(lists, { lang: 'eng', clean: true, auto: false, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 1 && r.layout === 'block', 'a sure reading (90 %): read once');
  f = reader((c) => (c.main ? (c.layout === 'block' ? { n: 80, conf: 76 } : { n: 100, conf: 83 }) : null));
  r = await RP.readPage(lists, { lang: 'eng', clean: true, auto: false, again: false, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 1 && r.layout === 'block', 'again: false — read once');
  f = reader((c) => (c.main ? (c.layout === 'block' ? { n: 80, conf: 76 } : { n: 100, conf: 83 }) : null));
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: false, onProgress: progress }, { ops, read: f.read });
  t.ok(r.cleared.marks === 0 && r.cleared.inner === 0 && r.columns === 1 && mains(f).length === 1, `a Kindle page read unsurely (76 %): plain text — no rules inside, no marks, one column — read once (${r.cleared.lines} px of its edges cleared; ${r.cleared.marks} marks, ${r.cleared.inner} inner, ${r.columns} columns, ${mains(f).length} readings)`);
  f = reader((c) => (c.main ? (c.layout === 'page' ? { n: 60, conf: 70 } : { n: 120, conf: 82 }) : null));
  r = await RP.readPage(cols0 ??= await decode('tests/fixtures/ocr/columns.jpg'), { lang: 'eng', clean: true, auto: false, onProgress: progress }, { ops, read: f.read });
  t.ok(r.columns === 2 && mains(f)[0].layout === 'page' && mains(f)[1].layout === 'block' && r.layout === 'block', `columns read as a page, unsure: read again as one block, kept when it reads more (${mains(f).map((c) => c.layout).join(' → ')})`);

  // a newer photo (or the tab left): the reading stops, nothing is returned
  let stop = false;
  f = reader((c) => { if (c.main) stop = true; return { n: 8, conf: 50 }; });
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, retryTurns: true, onProgress: progress, stale: () => stop }, { ops, read: f.read });
  t.ok(r === null && mains(f).length === 1, 'a newer photo after the first reading: stopped, no result');

  // a page of two columns is read as a page (Tesseract's layout analysis reads each column on its own)
  const cols = cols0;
  f = reader(() => ({ n: 120, conf: 92 }));
  r = await RP.readPage(cols, { lang: 'eng', clean: true, auto: true, onProgress: progress }, { ops, read: f.read });
  t.ok(r.columns === 2 && mains(f)[0].layout === 'page', `two columns: read as a page (${r.columns} columns, layout ${mains(f)[0].layout})`);
  t.ok(RP.layoutFor(1) === 'block' && RP.layoutFor(2) === 'page' && RP.layoutFor(3) === 'page' && RP.GLANCE_LAYOUT === 'block', 'one column: one block; columns: a page; the quick readings: one block');

  // dark mode (light text on dark): the OCR tab turns it dark on light before the clean-up; the Photo Dictionary does not
  // (a whole Kindle photo — black body, dark desk — is as dark: turned over, its screen would not read)
  const scr = (await (await load('/src/lib/pagecrop.ts')).straighten(kindle, ip)).img;
  const dark = { width: scr.width, height: scr.height, data: new Uint8ClampedArray(scr.data) };
  for (let i = 0; i < dark.data.length; i += 4) { dark.data[i] = 255 - dark.data[i]; dark.data[i + 1] = 255 - dark.data[i + 1]; dark.data[i + 2] = 255 - dark.data[i + 2]; }
  const lum = (im) => { const h = ip.histogram(im); let n = 0, m = 0; for (let v = 0; v < 256; v++) { n += h[768 + v]; m += v * h[768 + v]; } return m / n; };
  t.ok(RP.isDark(ip.histogram(dark).subarray(768, 1024)) && !RP.isDark(ip.histogram(scr).subarray(768, 1024)), `dark: the screen in dark mode (mean ${lum(dark).toFixed(0)}); light: the Kindle's screen (${lum(scr).toFixed(0)}) — and the whole photo in its black body is dark too (${lum(kindle).toFixed(0)}: ${RP.isDark(ip.histogram(kindle).subarray(768, 1024))})`);
  const meanRead = async (img, opts) => { let mean = -1; const rd = async (im, _l, p) => { if (p) mean = lum(im); return { text: 'x', confidence: 90, words: words(40) }; }; await RP.readPage(img, { lang: 'eng', clean: true, auto: false, onProgress: progress, ...opts }, { ops, read: rd }); return mean; };
  const light = await meanRead(scr, {}), inv = await meanRead(dark, { invertDark: true }), asIs = await meanRead(dark, {});
  t.ok(Math.abs(inv - light) < 8 && Math.abs(asIs - light) > 15, `the OCR tab reads the dark screen as it reads the light one (mean ${inv.toFixed(0)} against ${light.toFixed(0)}); the Photo Dictionary as it is (${asIs.toFixed(0)})`);

  // ---- the second reader for soft photos (owner, 26 Nov 2026: "Ok use PaddleOCR fallback for soft photos")
  const line = (text, y, p = 0.99) => ({ text, score: p, box: [10, y, 400, y, 400, y + 20, 10, y + 20], tall: false, chars: [...text].map((c, i, a) => ({ c, p, x0: i / a.length, x1: (i + 1) / a.length })) });
  const second = (lines, fail) => { const calls = []; return { calls, paddle: async (img, progress, stale) => { calls.push({ w: img.width, h: img.height, img }); progress?.({ phase: 'fetch', done: 1, total: 2 }); progress?.({ phase: 'read', done: 0, total: lines.length }); if (fail) throw new Error(fail); return stale?.() ? null : lines; } }; };
  const many = Array.from({ length: 30 }, (_, i) => line(`Sentence number ${i} reads clearly here`, 30 * i));
  // a soft reading: PaddleOCR reads the page as Tesseract read it, cleaned up; its reading, with more words read right as
  // each reader's confidences say, is kept
  f = reader((c) => (c.main ? { n: 40, conf: 62 } : null));
  let sc = second(many), seen = [];
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, onProgress: progress, onSecond: (q) => seen.push(q) }, { ops, read: f.read, paddle: sc.paddle });
  t.ok(sc.calls.length === 1 && sc.calls[0].img === r.pre && r.pre !== r.img && r.cleared.marks < RP.SECOND_MARKS && sc.calls[0].w === r.img.width && sc.calls[0].h === r.img.height, `a soft reading (Tesseract's confidence 62 < ${RP.SOFT}): PaddleOCR reads the page Tesseract read as it stands — found, straightened, before the clean-up (a Kindle page: no list marks) — the same size (${sc.calls.map((c) => `${c.w}×${c.h}`)})`);
  t.ok(r.second && r.engine === 'paddle' && r.r.text.startsWith('Sentence number 0 reads clearly here') && r.r.words.length === 180, `… and its reading kept (${r.engine}, ${r.r.words.length} words)`);
  t.ok(seen[0] === null && seen.some((q) => q?.phase === 'fetch') && seen.some((q) => q?.phase === 'read'), '… the tab told when it starts and how far it has come');
  t.ok(RP.readsPoorly(r) === false && RP.readsPoorly({ ...r, r: { ...r.r, confidence: 80 } }) === true && RP.readsPoorly({ r: { confidence: 70 }, engine: 'tesseract' }) === false, `… "reads poorly" by its reader's own scale (PaddleOCR below ${RP.PADDLE_POOR}, Tesseract below 60)`);
  t.ok(RP.unsureWord(80, 'paddle') && !RP.unsureWord(90, 'paddle') && RP.unsureWord(55, 'tesseract') && !RP.unsureWord(70, 'tesseract'), 'an unsure word by its reader\'s own scale');
  // a page whose clean-up cleared list marks: PaddleOCR reads it cleaned (the marks and rules are what it misread)
  f = reader((c) => (c.main ? { n: 40, conf: 62 } : null)); sc = second(many);
  r = await RP.readPage(lists, { lang: 'eng', clean: true, auto: false, again: false, onProgress: progress }, { ops, read: f.read, paddle: sc.paddle });
  t.ok(sc.calls.length === 1 && r.cleared.marks >= RP.SECOND_MARKS && sc.calls[0].img === r.img, `lists and a table (${r.cleared.marks} marks cleared): PaddleOCR reads the cleaned page`);
  t.ok(RP.secondPicture({ cleared: { marks: 1 } }) === 'pre' && RP.secondPicture({ cleared: { marks: RP.SECOND_MARKS } }) === 'img' && RP.secondPicture({ cleared: { marks: 0 }, inverted: true }) === 'img', 'secondPicture: the page as it stands, cleaned when marks were cleared or a dark page turned over');
  // to-do #31: a list's label kept where a mark would have been cleared (a soft "ii." — before, cleared and counted) still
  // tells of a list: a soft report with one ➢ cleared and its "ii." kept went to PaddleOCR as it stood and read 70 % of its
  // words instead of 74 %
  t.ok(RP.secondPicture({ cleared: { marks: 1, labels: 1 } }) === 'img' && RP.listSigns({ marks: 1, labels: 1 }) === 2 && RP.listSigns({ marks: 3 }) === 3, 'secondPicture: the labels a list keeps count with its marks');
  // a sure reading: PaddleOCR is not asked
  f = reader((c) => (c.main ? { n: 40, conf: 93 } : null)); sc = second(many);
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, onProgress: progress }, { ops, read: f.read, paddle: sc.paddle });
  t.ok(sc.calls.length === 0 && !r.second && r.engine === 'tesseract', 'a sure reading (93): PaddleOCR not asked');
  // PaddleOCR reads fewer words right than Tesseract's reading promises: Tesseract's stays
  f = reader((c) => (c.main ? { n: 120, conf: 80 } : null)); sc = second(many.slice(0, 5));
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, onProgress: progress }, { ops, read: f.read, paddle: sc.paddle });
  t.ok(sc.calls.length === 1 && r.second && r.engine === 'tesseract' && r.r.words.length === 120, 'PaddleOCR read, but its reading promises fewer right words: Tesseract\'s kept');
  // it fails (its models cannot be fetched): Tesseract's reading stands, the reason given
  f = reader((c) => (c.main ? { n: 40, conf: 50 } : null)); sc = second(many, 'the second reader\'s model PP-OCRv6_det_small.onnx could not be fetched (HTTP 404)');
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, onProgress: progress }, { ops, read: f.read, paddle: sc.paddle });
  t.ok(r && r.engine === 'tesseract' && /HTTP 404/.test(r.secondError || '') && r.r.words.length === 40, `PaddleOCR failing: Tesseract's reading stands, the reason said (${r.secondError})`);
  // off, or a newer photo while it reads
  f = reader((c) => (c.main ? { n: 40, conf: 50 } : null)); sc = second(many);
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, second: false, onProgress: progress }, { ops, read: f.read, paddle: sc.paddle });
  t.ok(sc.calls.length === 0 && !r.second, 'second: false — not asked');
  let gone = false;
  f = reader((c) => (c.main ? { n: 40, conf: 50 } : null));
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, onProgress: progress, stale: () => gone, onSecond: () => { gone = true; } }, { ops, read: f.read, paddle: second(many).paddle });
  t.eq(r, null, 'a newer photo while PaddleOCR reads: nothing (null)');
  // a page of columns: its lines ordered by the XY-cut
  const sides = [line('Left column first line', 10), line('Left column second line', 40), { ...line('Right column first line', 10), box: [500, 10, 900, 10, 900, 30, 500, 30] }, { ...line('Right column second line', 40), box: [500, 40, 900, 40, 900, 60, 500, 60] }];
  const cuts = [], { bindTextcore } = await load('/src/wasm/textcore.ts'), tc = bindTextcore(await wasm('textcore'));
  const xy = (boxes, gx, gy) => { cuts.push({ n: boxes.length, gx, gy }); return tc.xycut(boxes, gx, gy).order; }; // textcore's own
  const cpage = await decode('tests/fixtures/ocr/columns.jpg');
  f = reader((c) => (c.main ? { n: 30, conf: 30 } : null)); // a soft reading that promises little (30 × 0.136)
  r = await RP.readPage(cpage, { lang: 'eng', clean: true, auto: true, onProgress: progress }, { ops, read: f.read, paddle: second([sides[0], sides[2], sides[1], sides[3]]).paddle, xycut: xy });
  t.ok(r.columns >= 2 && cuts.length === 1 && cuts[0].n === 4 && r.engine === 'paddle' && r.r.text === 'Left column first line\nLeft column second line\nRight column first line\nRight column second line', `a page of ${r.columns} columns: PaddleOCR's lines in the XY-cut's order, column by column (${JSON.stringify(cuts)}; ${JSON.stringify(r.r.text.split('\n').slice(0, 2))})`);
  // what counts: words of three letters and more, each at its reader's share right
  t.near(RP.expectedRight({ words: [{ text: 'word', conf: 96 }, { text: 'ab', conf: 96 }, { text: "it's", conf: 96 }] }, RP.RIGHT.tesseract), 0.972 * 2, 1e-9, 'expectedRight: words of 3 letters and more (not "ab"), at Tesseract\'s share for 95 – 97');
  t.near(RP.expectedRight({ words: [{ text: 'three-words-here', conf: 99.95 }, { text: 'élève', conf: 84.9 }] }, RP.RIGHT.paddle), 0.907 * 3 + 0.477, 1e-9, '… a hyphenated word counts its parts; the bins by the edges (99.9 →, 80 – 85)');
  t.ok(RP.RIGHT.tesseract.every((v, i, a) => !i || v >= a[i - 1]) && RP.RIGHT.paddle.every((v, i, a) => !i || v >= a[i - 1]) && RP.RIGHT.tesseract.length === RP.CONF_EDGES.length && RP.RIGHT.paddle.length === RP.CONF_EDGES.length, 'the tables rise with the confidence, one value a bin');

  // ---- a photo of an open book: its pages drawn flat before they are read (potentials #96, the Book Page Flattener, as a
  // step of both tabs: "the OCR tab and the Photo Dictionary then read printed books as well as a Kindle page")
  const rec = (a, b, X0, X1) => { const v = new Array(26).fill(0); v[6] = a; v[7] = b; v[24] = X0; v[25] = X1; return v; };
  t.near(RP.bendOf(rec(0, 0, 0.1, 0.9)), 0, 1e-12, 'bendOf: a flat sheet does not bend');
  t.near(RP.bendOf(rec(0.5, -0.5, 0, 1)), 0.125, 2e-4, 'bendOf: end slopes +0.5 and −0.5 over the whole cubic — z = X(1 − X) / 2 — an eighth of the width (the gap at the middle)');
  t.near(RP.bendOf(rec(2, -2, 0, 1)), 0.125, 2e-4, '… the slopes held within ±0.5, as flatten.c holds them');
  t.near(RP.bendOf(rec(0.5, -0.5, 0, 0.5)), 0.0625, 2e-4, '… over a part of the cubic, the gap to that part\'s chord in that part\'s width: z − z/chord = X/4 − X²/2 is 1/32 at X = 1/4, over a width of 1/2');
  t.ok(RP.bendOf(rec(0.3, -0.5, 0.2, 0.2)) === 0, '… a page without width: 0');
  const pg = (o) => ({ rec: rec(0, 0, 0, 1), rect: [0, 0, 1, 1], scale: 1, rms: 0.8, rms0: 2, spans: 30, samples: 420, iterations: 9, side: 'whole', pitch: 0.03, ...o });
  const bent = rec(-0.2, 0.5, 0.05, 0.95), flatRec = rec(0.01, -0.02, 0.05, 0.95);
  t.ok(RP.isBook({ pages: [pg({ side: 'left', rec: flatRec }), pg({ side: 'right', rec: flatRec })], spans: 60 }, 'auto'), 'isBook: two pages either side of a gutter — a book, however little they bend');
  t.ok(RP.isBook({ pages: [pg({ rec: bent })], spans: 30 }, 'auto') && RP.bendOf(bent) >= RP.BOOK.bend, `… one page bent by ${(100 * RP.bendOf(bent)).toFixed(1)} % of its width: a book`);
  t.ok(!RP.isBook({ pages: [pg({ rec: flatRec })], spans: 30 }, 'auto') && RP.isBook({ pages: [pg({ rec: flatRec })], spans: 30 }, 'always'), `… one flat page (${(100 * RP.bendOf(flatRec)).toFixed(2)} %): not a book — but flattened when asked always (measuring)`);
  t.ok(!RP.isBook({ pages: [pg({ rec: bent, spans: 9 })], spans: 9 }, 'auto') && !RP.isBook({ pages: [pg({ rec: bent, rms: 2.1 })], spans: 30 }, 'auto'), `… a bent page of few lines (fewer than ${RP.BOOK.spans}), or fitted loosely (above ${RP.BOOK.rms} px): not a book — a strong watermark's diagonal letters bend a fit so`);
  t.ok(!RP.isBook({ pages: [pg({ rec: bent, samples: 120 })], spans: 30 }, 'always') && !RP.isBook({ pages: [], spans: 0 }, 'always'), '… pieces that are no lines of print (4 samples a line), or nothing: never');
  // the pages one above the other, the left one first, left-aligned on white
  const solid = (w, h, c) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) d.set(c, i); return { width: w, height: h, data: d }; };
  const st = RP.stackPages([solid(4, 2, [255, 0, 0, 255]), solid(6, 3, [0, 0, 255, 255])], 2);
  const px = (im, x, y) => Array.from(im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4)).join(',');
  t.ok(st.width === 6 && st.height === 7 && px(st, 0, 0) === '255,0,0,255' && px(st, 5, 0) === '255,255,255,255' && px(st, 3, 2) === '255,255,255,255' && px(st, 0, 4) === '0,0,255,255' && px(st, 5, 6) === '0,0,255,255', `stackPages: 6 × 7 — the first on top, a white gap, the second under it (${st.width} × ${st.height})`);
  t.ok(RP.stackPages([solid(3, 3, [1, 2, 3, 255])], 9).height === 3, '… one page: itself');
  // the real flattener on a photo of a spread (tests/fixtures/books: two pages bent near the spine)
  const spread = await decode('tests/fixtures/books/spread.jpg'), thick = await decode('tests/fixtures/books/thick.jpg');
  f = reader(() => ({ n: 300, conf: 93 }));
  r = await RP.readPage(spread, { lang: 'eng', clean: true, auto: true, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(r.book === 2 && r.page && r.shown && mains(f).length === 1 && mains(f)[0].h > 1.5 * mains(f)[0].w && mains(f)[0].w < 0.75 * spread.width, `a spread: its two pages drawn flat and read once, one above the other (${mains(f)[0].w} × ${mains(f)[0].h} from a photo of ${spread.width} × ${spread.height})`);
  t.ok(r.up.turns === 0 && Math.abs(r.up.slant) < 5 && r.columns === 1 && r.layout === 'block', `… upright and level as drawn, one column: read as one block (${r.columns} columns, ${r.layout})`);
  f = reader(() => ({ n: 300, conf: 93 }));
  r = await RP.readPage(thick, { lang: 'eng', clean: true, auto: true, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(r.book === 2, `a thick book's spread: flattened too (${r.book} pages)`);
  f = reader(() => ({ n: 300, conf: 93 }));
  r = await RP.readPage(spread, { lang: 'eng', clean: true, auto: true, flatten: 'never', onProgress: progress }, { ops, read: f.read });
  t.ok(r.book === 0 && mains(f)[0].h < mains(f)[0].w, `flatten: 'never' (measuring) — the photo read the old way (${mains(f)[0].w} × ${mains(f)[0].h})`);
  f = reader(() => ({ n: 300, conf: 93 }));
  r = await RP.readPage(spread, { lang: 'eng', clean: false, auto: true, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(r.book === 0 && !r.page, 'the clean-up off (the OCR tab\'s switch): no book looked for');
  // a Kindle page, a document, a newspaper: flat — never flattened (the existing photos read as before)
  for (const [name, im] of [['kindle-page.jpg', kindle], ['marks.jpg', lists], ['columns.jpg', cols]]) {
    f = reader(() => ({ n: 60, conf: 91 }));
    r = await RP.readPage(im, { lang: 'eng', clean: true, auto: true, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
    t.ok(r.book === 0, `${name}: a flat page — not flattened`);
  }
  f = reader(() => ({ n: 60, conf: 91 }));
  r = await RP.readPage(kindle, { lang: 'eng', clean: true, auto: true, flatten: 'always', onProgress: progress }, { ops, read: f.read });
  t.ok(r.book === 1, 'kindle-page.jpg with flatten: \'always\' (measuring): its lines of print found and flattened');
  // flattened pages that give little (it was no book): the page found the usual way is read too, the better kept
  first = true;
  f = reader((c) => (c.main ? (first ? ((first = false), { n: 8, conf: 70 }) : { n: 290, conf: 92 }) : null));
  r = await RP.readPage(spread, { lang: 'eng', clean: true, auto: true, again: false, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 2 && r.book === 0 && r.r.words.length === 290 && mains(f)[1].w > mains(f)[1].h, `the flat pages read unsurely (8 words at 70 %): the photo read the usual way too, and that reading — more words read right — kept (${r.r.words.length} words)`);
  // an unsure spread whose flat pages read more words right than the usual path: the flat pages kept
  first = true;
  f = reader((c) => (c.main ? (first ? ((first = false), { n: 400, conf: 80 }) : { n: 200, conf: 78 }) : null));
  r = await RP.readPage(spread, { lang: 'eng', clean: true, auto: true, again: false, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 2 && r.book === 2 && r.r.words.length === 400, `an unsure spread (80 %): read both ways, the flat pages — more words read right — kept (${r.book} pages)`);
  // … and the second reader reads both pictures: the better of the four readings kept
  first = true;
  f = reader((c) => (c.main ? (first ? ((first = false), { n: 100, conf: 40 }) : { n: 100, conf: 45 }) : null));
  const both = second(many);
  r = await RP.readPage(spread, { lang: 'eng', clean: true, auto: true, again: false, flatten: 'auto', onProgress: progress }, { ops, read: f.read, paddle: both.paddle });
  t.ok(both.calls.length === 2 && both.calls[0].h > both.calls[0].w && both.calls[1].w > both.calls[1].h && r.engine === 'paddle' && r.r.words.length === 180, `a soft spread: PaddleOCR reads the flat pages and the usual page (${both.calls.map((c) => `${c.w}×${c.h}`).join(', ')}); the reading with more words read right kept (${r.engine}, ${r.book} pages flattened)`);
  first = true;
  f = reader((c) => (c.main ? (first ? ((first = false), { n: 8, conf: 70 }) : { n: 5, conf: 60 }) : null));
  r = await RP.readPage(spread, { lang: 'eng', clean: true, auto: true, again: false, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(r.book === 2 && r.r.words.length === 8, '… and the flat pages kept when that reads less');
  // one page drawn flat is kept only when it reads clearly better than the page found the usual way (a strong watermark's
  // diagonal letters bend a flat page's fit as a curl does; flattened, such a page read 5 % of its words instead of 100 %)
  const onePage = await decode('tests/fixtures/books/page.jpg');
  first = true;
  f = reader((c) => (c.main ? (first ? ((first = false), { n: 300, conf: 94 }) : { n: 260, conf: 82 }) : null));
  r = await RP.readPage(onePage, { lang: 'eng', clean: true, auto: true, again: false, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 2 && r.book === 1 && r.r.words.length === 300, `one page of a book, flat reading clearly better: both read, the flat page kept (${mains(f).length} readings, ${r.book} page flattened)`);
  first = true;
  f = reader((c) => (c.main ? (first ? ((first = false), { n: 300, conf: 90 }) : { n: 300, conf: 90 }) : null));
  r = await RP.readPage(onePage, { lang: 'eng', clean: true, auto: true, again: false, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 2 && r.book === 0 && r.page, `… as good as the page found the usual way (within ${Math.round((RP.BOOK_BY - 1) * 100)} %): the usual reading kept`);
  first = true;
  f = reader((c) => (c.main ? (first ? ((first = false), { n: 40, conf: 40 }) : { n: 300, conf: 92 }) : null));
  r = await RP.readPage(onePage, { lang: 'eng', clean: true, auto: true, again: false, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(r.book === 0 && r.r.words.length === 300, '… worse (a watermarked flat page bent by its fit): the usual reading kept');
  f = reader(() => ({ n: 300, conf: 93 }));
  r = await RP.readPage(spread, { lang: 'eng', clean: true, auto: true, again: false, flatten: 'auto', onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 1 && r.book === 2, 'a spread: read once, its two flat pages kept (no flat photo gave the flattener two pages)');

  // the flattener's ops absent (an older worker): the step left out
  f = reader(() => ({ n: 300, conf: 93 }));
  const { bookFit: _bf, bookRender: _br, ...noBook } = ops;
  r = await RP.readPage(spread, { lang: 'eng', clean: true, auto: true, flatten: 'auto', onProgress: progress }, { ops: noBook, read: f.read });
  t.ok(r.book === 0, 'without the flattener\'s operations: the step left out');
  f = reader(() => ({ n: 300, conf: 93 }));
  r = await RP.readPage(spread, { lang: 'eng', clean: true, auto: true, onProgress: progress }, { ops, read: f.read });
  t.ok(r.book === (RP.BOOK_DEFAULT === 'auto' ? 2 : 0), `the tabs' setting when they give none: ${RP.BOOK_DEFAULT}`);
};
