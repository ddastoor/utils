// Photos taken at an angle (owner, 21 Nov 2026: the OCR tab and the Photo Dictionary "especially on the phone, when I
// click it at different angles"): a photo turned by `deg` degrees (to the right; negative: to the left) on a canvas
// large enough for every corner — the corners the photo's own ground (the median colour of its outermost 12 px: another
// colour would outline the old frame, which the page finder takes for a page) with a camera's noise (a flat colour makes
// a screenshot to the page finder). `crop` = [x, y, w, h]: a close-up of the photo. A JPEG made in the page (the
// browser's own decoder and encoder: no tool outside the browser).
import { readFileSync } from 'node:fs';

/** A close-up of the screen of tests/fixtures/images/kindle-page.jpg: inside the screen everywhere — no edge of the
 *  Kindle to find, words cut at the sides, the lines at the photo's own angle (about 7°). */
export const CLOSE_UP = [395, 326, 1010, 1388];

export const tiltedJpeg = async (pg, file, deg, crop = null) => Buffer.from(await pg.evaluate(async ([b64, deg, crop]) => {
  let bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
  if (crop) bmp = await createImageBitmap(bmp, ...crop);
  let fill = '#6f5d4a';
  {
    const c0 = new OffscreenCanvas(bmp.width, bmp.height), g0 = c0.getContext('2d');
    g0.drawImage(bmp, 0, 0);
    const d = g0.getImageData(0, 0, bmp.width, bmp.height).data, hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    let n = 0;
    for (let y = 0; y < bmp.height; y++) for (let x = 0; x < bmp.width; x++) {
      if (x >= 12 && y >= 12 && x < bmp.width - 12 && y < bmp.height - 12) continue;
      const i = (y * bmp.width + x) * 4; hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; n++;
    }
    const med = (h) => { let s = 0; for (let v = 0; v < 256; v++) if ((s += h[v]) * 2 >= n) return v; return 255; };
    fill = `rgb(${med(hist[0])},${med(hist[1])},${med(hist[2])})`;
  }
  const a = (Math.abs(deg) * Math.PI) / 180, w = Math.round(bmp.width * Math.cos(a) + bmp.height * Math.sin(a)), h = Math.round(bmp.width * Math.sin(a) + bmp.height * Math.cos(a));
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
  // the ground with a camera's noise (a flat colour would make the photo a screenshot to the page finder)
  g.fillStyle = fill; g.fillRect(0, 0, w, h);
  const ground = g.getImageData(0, 0, w, h), gd = ground.data; let seed = 12345;
  for (let i = 0; i < gd.length; i += 4) { seed = (seed * 1103515245 + 12345) >>> 0; const n = ((seed >>> 16) % 25) - 12; gd[i] += n; gd[i + 1] += n; gd[i + 2] += n; }
  g.putImageData(ground, 0, 0);
  g.translate(w / 2, h / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer());
  let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}, [readFileSync(file).toString('base64'), deg, crop]), 'base64');
