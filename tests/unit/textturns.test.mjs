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
  /** The picture turned by `deg` degrees on a white canvas that holds every corner (a page photographed at an angle). */
  const turnBy = (img, deg) => { const a = (Math.abs(deg % 90) * Math.PI) / 180, q = Math.round(deg / 90) % 2 !== 0;
    const w0 = q ? img.height : img.width, h0 = q ? img.width : img.height, c = Math.cos(a), sn = Math.sin(a);
    return ip.rotate(img, deg, Math.round(w0 * c + h0 * sn), Math.round(w0 * sn + h0 * c), 0xffffffff); };

  // too little to say: a blank sheet, a photo without letters, a picture too small
  const flat = (w, h, v) => ({ data: new Uint8ClampedArray(w * h * 4).fill(v), width: w, height: h });
  t.eq((await U.textTurns(flat(800, 600, 230), ip)).turns, null, 'a blank sheet: nothing to say');
  t.eq(ip.textTurns(flat(20, 20, 0)).turns, -1, 'a picture too small: nothing to say');
  { const im = flat(900, 700, 220); for (let y = 0; y < 700; y++) for (let x = 0; x < 900; x++) if ((x - 450) ** 2 + (y - 350) ** 2 < 200 ** 2) im.data.fill(40, (y * 900 + x) * 4, (y * 900 + x) * 4 + 3);
    t.eq((await U.textTurns(im, ip)).turns, null, 'a dark disc on a light ground (no letters): nothing to say'); }
  // the picture is never altered: upright() hands back the very picture when it stands upright already
  { const img = await decode('book-page.jpg'), u = await U.upright(img, ip); t.ok(u.img === img && u.turns === 0 && u.sure, 'an upright page is handed back as it is'); }

  // what the letters say is only a suggestion — every change is read against the picture as it is (the Kindle photo set,
  // 21 Nov 2026: soft, upright pages judged upside down or sideways by their letters read 2 % and 0 % of their words
  // instead of 98 % and 80 %). A reader that answers with set readings, in the order the pictures are read: the picture
  // as it is first, then each suggestion.
  { const page = (await straighten(await decode('kindle-page.jpg'), ip)).img;
    const fake = (...m) => { const calls = []; return { calls, read: async (im) => { calls.push(im.width + 'x' + im.height); const [c, n] = m[calls.length - 1] ?? [0, 0]; return { confidence: c, words: Array.from({ length: n }, (_, i) => ({ text: i % 5 ? 'word' : '|', conf: c })) }; } }; };
    const good = [92, 120], poor = [35, 6], fair = [70, 40];
    t.ok(U.score({ confidence: 90, words: [{ text: 'page', conf: 90 }, { text: '|', conf: 95 }, { text: 'a', conf: 90 }, { text: 'Größe', conf: 50 }, { text: 'x1', conf: -1 }] }) === 1.4, 'the score of a reading: its words of two letters and more, by their confidence (signs and stray letters left out)');
    let f = fake();
    let r = await U.uprightByReading(page, f.read, ip);
    t.ok(r.img === page && r.turns === 0 && r.how === 'text' && f.calls.length === 0, `an upright, level page: as it is, nothing read (${f.calls.length} readings)`);
    const over = ip.orient(page, ROT[2]); // upside down: the letters suggest a half turn
    f = fake(poor, good); r = await U.uprightByReading(over, f.read, ip);
    t.ok(r.turns === 2 && r.how === 'reading' && f.calls.length === 2 && Math.max(...f.calls[0].split('x').map(Number)) <= 1000, `upside down, the half turn reads clearly better: turned (${f.calls.join(', ')})`);
    f = fake(good, poor); r = await U.uprightByReading(over, f.read, ip);
    t.ok(r.img === over && r.turns === 0 && r.slant === 0 && r.how === 'reading' && f.calls.length === 2, 'the letters suggest a half turn, but the picture as it is reads better: left as it is');
    f = fake(fair, [76, 40]); r = await U.uprightByReading(over, f.read, ip);
    t.ok(r.img === over && r.turns === 0, 'a suggestion that reads only a little better (9 %): left as it is');
    f = fake([91, 107], [92, 223]); r = await U.uprightByReading(over, f.read, ip);
    t.ok(r.turns === 2, 'as confident either way round, but twice the words the other way (a page the OCR reads in a few places sideways): turned');
    const side = ip.orient(page, ROT[1]); // a quarter to the right: the letters suggest a quarter to the left
    f = fake(poor, good); r = await U.uprightByReading(side, f.read, ip);
    t.ok(r.turns === 3 && r.img.width === page.width && r.img.height === page.height, `sideways, the suggestion reads clearly better: turned a quarter to the left (${r.img.width}×${r.img.height})`);
    const tilted = turnBy(page, 15); // tilted 15°: levelled — if that reads better
    f = fake(fair, good); r = await U.uprightByReading(tilted, f.read, ip);
    t.ok(r.turns === 0 && Math.abs(r.slant - 15) <= 1 && r.img !== tilted, `tilted 15°, levelling reads clearly better: levelled by ${r.slant.toFixed(1)}°`);
    f = fake(good, good); r = await U.uprightByReading(tilted, f.read, ip);
    t.ok(r.img === tilted && r.slant === 0, 'tilted 15°, but it reads as well as it is: left as it is (the reading decides)');
    t.ok(U.uprightWords({ turns: 0, slant: 4.4 }) === '' && U.uprightWords({ turns: 1, slant: -12.4 }) === 'levelled (12°) and turned a quarter to the right', 'the words for the line: a slant under 5° is not levelled');
  }

  // photos taken "at different angles" (owner, 21 Nov 2026): the page of each photo, as a close-up with no outline to
  // straighten it would give, turned by any angle — set level and upright (what is left of the slant under a degree)
  for (const f of ['kindle-page.jpg', 'kindle-frame.jpg', 'book-page.jpg']) {
    const page = (await straighten(await decode(f), ip)).img;
    for (const deg of [8, -12, 15, 25, -30, 35, 100, 200, -75]) {
      const u = await U.upright(turnBy(page, deg), ip), after = await U.textTurns(u.img, ip);
      const want = ((deg % 90) + 135) % 90 - 45; // the slant from the nearer axis
      // (a frame of the live video, 1080p, its page small and soft: within a degree and a half, and the right axis — the
      // tabs then read a small copy both ways round, tests/e2e)
      const soft = f === 'kindle-frame.jpg';
      const axis = Math.abs(Math.round(deg / 90)) % 2 ? 'down' : 'across'; // the lines' direction once levelled
      t.ok(soft ? Math.abs(u.slant - want) <= 2 && (after.turns === 0 || (after.turns === null && after.axis === axis)) && Math.abs(after.slant) < 1.5
        : Math.abs(u.slant - want) <= 1 && after.turns === 0 && Math.abs(after.slant) < 1, `${f}, its page turned ${deg}°: levelled by ${u.slant.toFixed(1)}° and set upright (then ${JSON.stringify(after)})`);
    }
  }

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
