// The Screenshot Finder's search (wasm/textcore/find.c, bound in src/wasm/textcore.ts): pictures' words as the OCR gives
// them, normalised by findNorm, and queries as people type them — exact words, words with their signs ("wi-fi"), numbers
// read with spaces or typed without, the OCR's slips (9O3, passvvord), the beginning or the inside of a word, one slip of
// the keyboard; small words left out; ranking (all the words before some, words next to each other before words apart);
// the indices of the words that matched (the page marks them on the picture).
const engine = async (t, { load, wasm }) => {
  const { bindTextcore, findNorm } = await load('src/wasm/textcore.ts');
  const tc = bindTextcore(await wasm('textcore'));
  const words = (s) => s.split(/\s+/).map(findNorm).filter(Boolean);
  const DOCS = {
    1: 'Asha Iyer online Booked. PNR 4521 678 903, coach B2, seats 41 and 42. Train leaves Lonavala at 17:35 on Sunday.',
    2: 'Home Wi-Fi: the Wi-Fi password is kT7mq2Vr9w (5 GHz network SuperHome_5G)',
    3: 'Send the invoice to ravi@gmail.com before Friday. Thanks!',
    4: 'Your PNR 4521 678 9O3 is confirmed. Wi-Fi passvvord at the hotel: guest1234',
    5: 'Electricity bill due 15/12/2026 amount Rs. 2,032.71 consumer no 1102 3345',
    6: 'Café crème — Zürich',
  };
  const h = tc.findNew();
  for (const [p, s] of Object.entries(DOCS)) tc.findAdd(h, +p, words(s));
  const q = (s) => tc.findQuery(h, findNorm(s) ? s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase() : s);
  const pics = (s) => q(s).map((x) => x.p);

  t.eq(findNorm('Booked.'), 'booked', 'findNorm: signs at the ends left out');
  t.eq(findNorm('ravi@gmail.com,'), 'ravi@gmail.com', 'findNorm: signs inside kept');
  t.eq(findNorm('Zürich'), 'zurich', 'findNorm: accents off, lower case');

  t.eq(pics('PNR')[0], 1, 'a word: the picture that has it (the PNR in the chat first — exact)');
  t.eq(pics('PNR').sort(), [1, 4], 'both pictures with a PNR');
  const num = q('4521 678 903');
  t.eq(num.map((x) => x.p), [1, 4], 'a number read with its spaces: the exact one first, the one the OCR read "9O3" after');
  t.eq([num[0].m, num[0].n, num[1].m], [3, 3, 3], 'all three parts matched in both');
  const w1 = words(DOCS[1]);
  t.eq(num[0].w.map((i) => w1[i]), ['4521', '678', '903'], 'the words that matched, for the marks on the picture');
  t.eq(pics('4521678903'), [1, 4], 'typed without spaces: the words read in a row make it');
  t.eq(pics('wifi password')[0], 2, '"wifi password": the Wi-Fi message first (the words next to each other)');
  t.ok(pics('wifi password').includes(4), '… and the hotel note whose "password" the OCR read "passvvord"');
  t.eq(pics('wi fi')[0], 2, '"wi fi" written apart: the words together make "wifi"');
  t.eq(pics('gmail'), [3], 'inside a word: "gmail" in an e-mail address');
  t.eq(pics('pasword')[0], 2, 'one slip of the keyboard');
  t.eq(pics('passw')[0], 2, 'the beginning of a word');
  t.eq(pics('the password')[0], 2, 'small words left out ("the")');
  t.eq(pics('the').sort(), [2, 3, 4], 'a query of small words only: kept');
  t.eq(pics('xyzzy'), [], 'nothing matches: nothing');
  t.eq(pics('cafe creme'), [6], 'accents off on both sides');
  t.eq(pics('2,032.71')[0], 5, 'an amount with its signs');
  t.eq(pics('2032'), [5], 'an amount by its digits (inside the word)');
  const some = q('pnr coach seats lonavala goa');
  t.eq([some[0].p, some[0].m, some[0].n], [1, 4, 5], 'some of the words: the picture with most of them, said as 4 of 5');
  t.eq(q('pnr lonavala').map((x) => [x.p, x.m]), [[1, 2], [4, 1]], 'all the words before some of them');
  t.eq(pics('17:35'), [1], 'a time');
  t.eq(pics('guest1234'), [4], 'a password typed as read');
  t.eq(pics('guestl234'), [4], 'a password with the OCR\'s slip (l for 1) typed back');
  t.eq(pics('kT7mq2Vr9w'), [2], 'a password as it was sent, found where the OCR read it exactly');
  tc.findAdd(h, 7, words('Network SuperHome_5G and the password is KT7mq2Vrow'));
  t.eq(pics('kT7mq2Vr9w').sort(), [2, 7], '… and where the OCR read "9" as "o" (one slip in a long code of letters and digits)');
  t.ok(q('4521 678 904').every((x) => x.m === 2 && x.n === 3), 'a number one digit apart is another number: "904" matched nowhere (only some of the words)');
  t.eq(pics('4521678904'), [], '… nor the whole number typed together');

  // replacing a picture's words
  t.eq(pics('ravi'), [3], 'the beginning of an e-mail address');
  tc.findAdd(h, 3, words('Nothing about the invoice here'));
  t.eq(pics('ravi'), [], 'a picture read again: its old words gone');
  t.eq(pics('invoice'), [3], '… its new ones there');
  t.eq(pics('gmail'), [], 'and "gmail" no more (no word within one slip of it)');
  tc.findFree(h);

  // many pictures: a query stays quick
  const h2 = tc.findNew(), vocab = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu'.split(' ');
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let p = 0; p < 600; p++) tc.findAdd(h2, p, Array.from({ length: 300 }, () => vocab[Math.floor(rnd() * vocab.length)] + (rnd() < 0.2 ? Math.floor(rnd() * 100) : '')));
  tc.findAdd(h2, 9999, ['the', 'needle', 'pnr', '8812', '334', '901']);
  const t0 = performance.now(), r = tc.findQuery(h2, 'pnr 8812 334 901'), dt = performance.now() - t0;
  t.ok(r[0]?.p === 9999 && dt < 400, `600 pictures of 300 words: the one found first in ${dt.toFixed(0)} ms`);
  tc.findFree(h2);
};

// ------------------------------------------------------------------ the tab's steps (src/lib/finder.ts), in Node
const reading = async (t, { load, wasm }) => {
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const F = await load('src/lib/finder.ts');
  const { bindTextcore } = await load('src/wasm/textcore.ts');
  const { bindImgproc } = await load('src/wasm/imgproc.ts');
  const { readingOf } = await load('src/lib/ocr.ts');

  // when a picture was taken, from its name
  const at = (n) => { const r = F.takenAt(n); return r && [new Date(r.t).toISOString().slice(0, 19), r.timed]; };
  const iso = (y, mo, d, hh = 0, mi = 0, ss = 0) => new Date(y, mo - 1, d, hh, mi, ss).toISOString().slice(0, 19);
  t.eq(at('Screenshot_20261102-190712_WhatsApp.png'), [iso(2026, 11, 2, 19, 7, 12), true], 'takenAt: an Android screenshot');
  t.eq(at('Screenshot 2026-11-03 at 10.12.44.png'), [iso(2026, 11, 3, 10, 12, 44), true], 'takenAt: a Mac screenshot');
  t.eq(at('Screenshot from 2026-11-03 10-12-44.png'), [iso(2026, 11, 3, 10, 12, 44), true], 'takenAt: GNOME');
  t.eq(at('Screenshot 2026-11-03 101244.png'), [iso(2026, 11, 3, 10, 12, 44), true], 'takenAt: Windows 11\'s Snipping Tool');
  t.eq(at('WhatsApp Image 2026-11-02 at 19.07.12.jpeg'), [iso(2026, 11, 2, 19, 7, 12), true], 'takenAt: a WhatsApp image');
  t.eq(at('IMG_20261201_081530.jpg'), [iso(2026, 12, 1, 8, 15, 30), true], 'takenAt: a camera photo');
  t.eq(at('IMG-20261102-WA0012.jpg'), [iso(2026, 11, 2), false], 'takenAt: WhatsApp\'s received photo — the date alone');
  t.eq(at('Screenshot_2026-11-02-19-07-12-123_com.whatsapp.png'), [iso(2026, 11, 2, 19, 7, 12), true], 'takenAt: an older Android name');
  t.eq([at('Screenshot (12).png'), at('IMG_1234.PNG'), at('scan 1234567890123.png'), at('IMG_20261131_101010.jpg')], [null, null, null, null], 'takenAt: no date in the name, a long number, 31 November');

  // the size a picture is read at
  t.eq(F.readSize(720, 1600), { width: 720, height: 1600 }, 'readSize: a phone\'s screenshot at its own size');
  t.eq(F.readSize(4000, 3000), { width: 2828, height: 2121 }, 'readSize: a 12-megapixel photo at half its pixels');
  t.eq(F.readSize(1080, 20000), { width: 648, height: 12000 }, 'readSize: a long scrolling screenshot at most 12,000 long');

  // the test pictures read as the tab reads them: prepared by imgproc.wasm, Tesseract's sparse text (Sauvola for screenshots)
  const mupdf = await import('mupdf');
  const { createWorker, OEM } = require('tesseract.js');
  const root = new URL('../../', import.meta.url).pathname, fix = root + 'tests/fixtures/finder/';
  const truth = JSON.parse(readFileSync(fix + 'truth.json', 'utf8'));
  const ip = bindImgproc(await wasm('imgproc')), tc = bindTextcore(await wasm('textcore'));
  const w = await createWorker('eng', OEM.LSTM_ONLY, { langPath: root + 'node_modules/@tesseract.js-data/eng/4.0.0_best_int', gzip: true, cacheMethod: 'none' });
  const decode = (path) => { const pm = new mupdf.Image(readFileSync(path)).toPixmap(), W = pm.getWidth(), H = pm.getHeight(), n = pm.getNumberOfComponents(), px = pm.getPixels(); const data = new Uint8ClampedArray(W * H * 4); for (let i = 0, j = 0; j < data.length; i += n, j += 4) { data[j] = px[i]; data[j + 1] = px[n >= 3 ? i + 1 : i]; data[j + 2] = px[n >= 3 ? i + 2 : i]; data[j + 3] = 255; } return { data, width: W, height: H }; };
  const ppm = (im) => { const hd = Buffer.from(`P6\n${im.width} ${im.height}\n255\n`), b = Buffer.alloc(im.width * im.height * 3); for (let i = 0, j = 0; i < im.data.length; i += 4, j += 3) { b[j] = im.data[i]; b[j + 1] = im.data[i + 1]; b[j + 2] = im.data[i + 2]; } return Buffer.concat([hd, b]); };
  const files = [...new Set([...Object.keys(truth.words), ...truth.queries.flatMap((q) => q[1]), ...truth.none, ...Object.keys(truth.texts)])];
  const h = tc.findNew(), pics = {}, ids = [];
  try {
    for (const f of files) {
      const im = decode(fix + f), size = F.readSize(im.width, im.height);
      const ready = await F.prepare(size.width === im.width ? im : ip.resize(im, size.width, size.height), ip);
      const r = readingOf((await w.recognize(ppm(ready.img), { tessedit_pageseg_mode: '11', thresholding_method: ready.screenshot ? '2' : '0' }, { text: true, blocks: true })).data);
      pics[f] = { r, ready, when: F.takenAt(f)?.t ?? 0 };
      ids.push(f);
      tc.findAdd(h, ids.length - 1, F.indexWords(r.words));
    }
    t.eq(files.filter((f) => pics[f].ready.dark && pics[f].ready.screenshot), ['Screenshot_20261020-213344_WhatsApp.png'], 'prepare: the dark chat turned light (of the screenshots; the dark photo of coffee too — harmless)');
    t.eq(files.filter((f) => pics[f].ready.screenshot).sort(), Object.keys(truth.texts).sort(), 'prepare: the screenshots told from the photos (read with Sauvola\'s thresholds)');
    // every text drawn on each screenshot: how much of it the reading found
    let got = 0, all = 0;
    for (const [f, text] of Object.entries(truth.texts)) {
      const read = new Set(F.indexWords(pics[f].r.words)), want = [...new Set(text.split(/\s+/).map((x) => x.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter((x) => x.length >= 2))];
      got += want.filter((x) => read.has(x)).length; all += want.length;
    }
    t.ok(got / all >= 0.97, `the screenshots' words read: ${got} of ${all} (${(100 * got / all).toFixed(1)} %)`);
    // the words that must be found, each in its picture
    const query = (s) => F.rank(tc.findQuery(h, s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()).map((x) => ({ f: ids[x.p], hit: x, when: pics[ids[x.p]].when })));
    for (const [f, words] of Object.entries(truth.words)) {
      const missed = words.filter((x) => !query(x).some((r) => r.f === f && r.hit.m === r.hit.n));
      t.eq(missed, [], `${f}: ${words.join(', ')} found in it`);
    }
    for (const [q, want] of truth.queries) {
      const got = query(q).filter((r) => r.hit.m === r.hit.n).map((r) => r.f);
      t.eq(got, want, `"${q}" → ${want.join(', ')} (all the words, in the tab's order)`);
    }
    t.eq(truth.none.filter((f) => F.hasText(pics[f].r.words)), [], 'a photo without text: no text found (a few signs and letters read unsurely are none)');
    t.eq(truth.none.flatMap((f) => F.indexWords(pics[f].r.words).filter((x) => x.length >= 2)), [], '… and no word of two characters in the index (a guess under 15 % sure is left out; a lone "7" or "a" stays — "Table 7")');
  } finally { tc.findFree(h); await w.terminate(); }
};

export default async (t, ctx) => { await engine(t, ctx); await reading(t, ctx); };
