// imgproc's p_text_turns — which way up the text of a photo stands (owner, 21 Nov 2026: a Kindle page photographed with
// the phone held sideways, in either hand, "can't understand a thing"). The real photos of the Photo Dictionary's and
// the OCR tab's suites, each turned the four ways round: the whole photo, and the page found and straightened in it,
// must come back with the turns that set the text upright again.
import { readFileSync } from 'node:fs';

export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const { straighten } = await load('/src/lib/pagecrop.ts');
  const U = await load('/src/lib/upright.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  const root = new URL('../../', import.meta.url).pathname;
  const jpeg = await import(root + 'node_modules/@jsquash/jpeg/decode.js');
  await jpeg.init(await WebAssembly.compile(readFileSync(root + 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')));
  const decode = async (p) => { const d = await jpeg.default(readFileSync(root + 'tests/fixtures/images/' + p)); return { data: d.data, width: d.width, height: d.height }; };
  const ROT = [1, 6, 3, 8]; // quarter turns to the right as EXIF orientations
  const how = ['upright', 'turned a quarter to the right', 'upside down', 'turned a quarter to the left'];

  // too little to say: a blank sheet, a photo without letters, a picture too small
  const flat = (w, h, v) => ({ data: new Uint8ClampedArray(w * h * 4).fill(v), width: w, height: h });
  t.eq((await U.textTurns(flat(800, 600, 230), ip)).turns, null, 'a blank sheet: nothing to say');
  t.eq(ip.textTurns(flat(20, 20, 0)).turns, -1, 'a picture too small: nothing to say');
  { const im = flat(900, 700, 220); for (let y = 0; y < 700; y++) for (let x = 0; x < 900; x++) if ((x - 450) ** 2 + (y - 350) ** 2 < 200 ** 2) im.data.fill(40, (y * 900 + x) * 4, (y * 900 + x) * 4 + 3);
    t.eq((await U.textTurns(im, ip)).turns, null, 'a dark disc on a light ground (no letters): nothing to say'); }
  // the picture is never altered: upright() hands back the very picture when it stands upright already
  { const img = await decode('book-page.jpg'), u = await U.upright(img, ip); t.ok(u.img === img && u.turns === 0 && u.sure, 'an upright page is handed back as it is'); }

  for (const f of ['kindle-page.jpg', 'kindle-frame.jpg', 'kindle-soft.jpg', 'book-page.jpg']) {
    const img = await decode(f);
    for (let k = 0; k < 4; k++) {
      const turned = ip.orient(img, ROT[k]), want = (4 - k) % 4; // turned k quarters to the right: (4 − k) more set it up
      const whole = await U.textTurns(turned, ip);
      // the whole photo — the Kindle's body, the desk and the hand around a small page: the right turns, or where the
      // letters are too small or too soft to tell the ends apart, at least the right axis (the tabs then read a small
      // copy both ways round — tests/e2e/photodict and ocr)
      t.ok(whole.turns === want || (whole.turns === null && whole.axis === (want % 2 ? 'down' : 'across')), `${f} ${how[k]}: the whole photo (${JSON.stringify(whole)})`);
      const page = await straighten(turned, ip);
      const pg = await U.textTurns(page.img, ip);
      t.eq(pg.turns, want, `${f} ${how[k]}: the page${page.found ? ' found in it' : ''} (${JSON.stringify(pg)})`);
    }
  }
};
