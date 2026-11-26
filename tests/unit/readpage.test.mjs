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

  // an unsure reading (below 85 %) read again laid out the other way; the one that reads more words surely is kept — on a
  // soft photo Tesseract laid out as one block can lose a whole line (a form's title, a table's row)
  f = reader((c) => (c.main ? (c.layout === 'block' ? { n: 80, conf: 76 } : { n: 100, conf: 83 }) : null));
  r = await RP.readPage(book, { lang: 'eng', clean: true, auto: false, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 2 && mains(f)[1].layout === 'page' && r.layout === 'page' && r.r.words.length === 100, `an unsure reading (76 %): read again as a page, which read more words surely, kept (${mains(f).map((c) => c.layout).join(' → ')})`);
  f = reader((c) => (c.main ? (c.layout === 'block' ? { n: 100, conf: 80 } : { n: 101, conf: 80 }) : null));
  r = await RP.readPage(book, { lang: 'eng', clean: true, auto: false, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 2 && r.layout === 'block' && r.r.words.length === 100, '… one that reads barely more (within 3 %): the first kept');
  f = reader((c) => (c.main ? { n: 100, conf: 90 } : null));
  r = await RP.readPage(book, { lang: 'eng', clean: true, auto: false, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 1 && r.layout === 'block', 'a sure reading (90 %): read once');
  f = reader((c) => (c.main ? (c.layout === 'block' ? { n: 80, conf: 76 } : { n: 100, conf: 83 }) : null));
  r = await RP.readPage(book, { lang: 'eng', clean: true, auto: false, again: false, onProgress: progress }, { ops, read: f.read });
  t.ok(mains(f).length === 1 && r.layout === 'block', 'again: false — read once');
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
};
