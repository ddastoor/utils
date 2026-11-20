// HEIC colours (src/lib/heic-color.ts): libheif-js decodes, the ICC profile is read from the image handle, Little CMS
// (lcms-wasm) converts Display P3 to sRGB — held to pillow-heif + Pillow's ImageCms (tests/fixtures/heic/reference.json,
// scripts/make-heic-reference.py) on a patch chart of saturated P3 colours and on a real iPhone photo.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (t, { load, root }) => {
  const { heicProfile, toSrgb } = await load('/src/lib/heic-color.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/heic/reference.json'), 'utf8')).files;
  const heifMod = (await import('libheif-js/libheif-wasm/libheif-bundle.mjs')).default;
  const lib = typeof heifMod === 'function' ? await heifMod() : heifMod;
  const C = await import('lcms-wasm');
  const lcms = await C.instantiate({ locateFile: () => join(root, 'node_modules/lcms-wasm/dist/lcms.wasm') });
  const decode = async (name) => {
    const dec = new lib.HeifDecoder(), images = dec.decode(new Uint8Array(readFileSync(join(root, 'tests/fixtures/images', name))));
    const im = images.find((i) => i.is_primary()) ?? images[0], width = im.get_width(), height = im.get_height(), data = new Uint8ClampedArray(width * height * 4);
    await new Promise((res, rej) => im.display({ data, width, height }, (d) => (d ? res() : rej(new Error('decode')))));
    return { im, data, width, height };
  };
  const at = (d, w, [x, y]) => [d[(y * w + x) * 4], d[(y * w + x) * 4 + 1], d[(y * w + x) * 4 + 2]];
  const close = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  for (const name of ['p3-colours.heic', 'pug.heic']) {
    const r = ref[name], { im, data, width } = await decode(name);
    const icc = heicProfile(lib, im.handle);
    t.ok(icc && icc.length === 536 && String.fromCharCode(...icc.subarray(36, 40)) === 'acsp', `${name}: the ICC profile is read from the image (536 bytes, "acsp")`);
    t.ok(r.points.every((p, i) => close(at(data, width, p), r.decoded[i], 1)), `${name}: libheif's pixels = pillow-heif's (${r.points.map((p) => at(data, width, p)).join(' | ')})`);
    const s = toSrgb(lcms, C, data, icc);
    t.eq(s?.profile, 'Display P3', `${name}: the profile is Display P3`);
    const got = r.points.map((p) => at(s.data, width, p));
    t.ok(r.points.every((p, i) => close(got[i], r.srgb[i], 2)), `${name}: in sRGB = Pillow's ImageCms within 2 levels (${got.join(' | ')} vs ${r.srgb.join(' | ')})`);
    t.ok(s.data[3] === 255 && s.data[s.data.length - 1] === 255, `${name}: alpha kept`);
  }
  const { data: d0, width: w0 } = await decode('p3-colours.heic');
  t.ok(Math.abs(at(d0, w0, [16, 16])[0] - 240) > 15, 'without the conversion the saturated red is 220 where it should be 240 — the shift the tab had');
  t.eq(toSrgb(lcms, C, new Uint8ClampedArray(8), lcms.cmsCreate_sRGBProfile ? new Uint8Array(0) : new Uint8Array(0)), null, 'a profile that cannot be read: the pixels are left as they are');
  const xiaomi = await decode('xiaomi.heic');
  t.eq(heicProfile(lib, xiaomi.im.handle), null, 'a HEIC without an ICC profile (Xiaomi): nothing to convert');
};
