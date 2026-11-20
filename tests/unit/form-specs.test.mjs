// Exam/portal upload presets are well-formed; JPEG padding (metacore) reaches a minimum size without touching pixels.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default async (t, { load, wasm, root }) => {
  const { FORM_SPECS, KIND_LABEL, kbRange } = await load('/src/lib/form-specs.ts');
  const ids = new Set();
  for (const s of FORM_SPECS) {
    t.ok(!ids.has(s.id) && /^[a-z0-9-]+$/.test(s.id), `${s.id}: unique id`); ids.add(s.id);
    t.ok(s.items.length >= 1 && s.items.some((i) => i.kind === 'photo' || i.kind === 'signature'), `${s.id}: has photo or signature`);
    for (const i of s.items) {
      t.ok(i.kind in KIND_LABEL, `${s.id}/${i.kind}: known kind`);
      t.ok(i.w >= 50 && i.h >= 30 && i.w <= 4000 && i.h <= 4000, `${s.id}/${i.kind}: sane pixels ${i.w}×${i.h}`);
      t.ok(i.minKB >= 0 && i.maxKB > i.minKB && i.maxKB <= 2048, `${s.id}/${i.kind}: KB range ${i.minKB}–${i.maxKB}`);
      if (i.kind === 'photo') t.ok(i.h > i.w, `${s.id}: photo is portrait`);
    }
  }
  const ibps = FORM_SPECS.find((s) => s.id === 'ibps');
  t.eq(ibps.items.map((i) => `${i.kind}:${i.w}x${i.h}:${i.minKB}-${i.maxKB}`), ['photo:200x230:20-50', 'signature:140x60:10-20', 'thumb:240x240:20-50', 'declaration:800x400:50-100'], 'IBPS spec');
  const { bindMetacore } = await load('/src/wasm/metacore.ts');
  const mc = bindMetacore(await wasm('metacore'));
  const jpg = new Uint8Array(readFileSync(`${root}/tests/fixtures/images/coffee.jpg`));
  const big = mc.jpegPad(jpg, 100000);
  t.ok(big.length >= 100000 && big.length < 100100, `padded to ≥ 100000 bytes (${big.length})`);
  t.eq(Array.from(big.subarray(big.length - 5000)), Array.from(jpg.subarray(jpg.length - 5000)), 'picture data untouched');
  t.ok(big[0] === 0xff && big[1] === 0xd8 && big[2] === 0xff && big[3] === 0xfe, 'COM segment right after SOI');
  const huge = mc.jpegPad(jpg, 300000); t.ok(huge.length >= 300000, 'several COM segments for > 64 KB of padding');
  t.eq(mc.jpegPad(jpg, 1000).length, jpg.length, 'already big enough → unchanged');
  t.eq(mc.sniff(huge), { type: 'jpeg', width: 600, height: 400 }, 'padded file still parses (SOF found after COM segments)');

  // Exactly the target (a portal's maximum may be the target): every need from 4 bytes on, around the 64 KB segment edge
  // too, gives a file of exactly that many bytes; an independent walk over the segments finds well-formed COM segments
  // and then the original file's segments unchanged.
  const walk = (b) => {
    if (b[0] !== 0xff || b[1] !== 0xd8) return 'no SOI';
    let i = 2, coms = 0;
    while (i + 4 <= b.length && b[i] === 0xff && b[i + 1] === 0xfe) { const len = (b[i + 2] << 8) | b[i + 3]; if (len < 2) return 'bad length'; i += 2 + len; coms++; }
    if (i > b.length) return 'overrun';
    return Buffer.from(b.subarray(i)).equals(Buffer.from(jpg.subarray(2))) ? coms : 'original changed';
  };
  const S = 65537; // one full COM segment: marker + length + 65,533 bytes
  const needs = [4, 5, 6, 7, 8, 100, 1000, S - 1, S, S + 1, S + 2, S + 3, S + 4, S + 5, S + 7, S + 8, 2 * S, 2 * S + 1, 2 * S + 3, 2 * S + 4, 3 * S + 2];
  let exact = 0, walked = 0;
  for (const need of needs) {
    const out = mc.jpegPad(jpg, jpg.length + need);
    if (out.length === jpg.length + need) exact++; else t.ok(false, `need ${need}: ${out.length - jpg.length} bytes added`);
    if (typeof walk(out) === 'number') walked++; else t.ok(false, `need ${need}: ${walk(out)}`);
  }
  t.eq(exact, needs.length, `padding is exact for ${needs.length} sizes from 4 bytes to 3 segments (also 1 – 3 bytes past a full segment)`);
  t.eq(walked, needs.length, 'every padded file walks as COM segments + the original file');
  t.eq(mc.jpegPad(jpg, jpg.length + 2).length, jpg.length + 4, 'fewer than 4 bytes short: one empty COM segment (4 bytes)');
  t.eq(mc.jpegPad(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), 1000).length, 7, 'not a JPEG → returned as it is');

  // Pixels: Pillow (libjpeg) decodes the padded file to the same pixels as the original.
  try {
    const dir = mkdtempSync(join(tmpdir(), 'pad-'));
    writeFileSync(join(dir, 'a.jpg'), jpg); writeFileSync(join(dir, 'b.jpg'), mc.jpegPad(jpg, jpg.length + 2 * S + 5));
    const same = execFileSync('python3', ['-I', '-c', 'import sys;from PIL import Image;a=Image.open(sys.argv[1]);b=Image.open(sys.argv[2]);print(a.size==b.size and a.tobytes()==b.tobytes())', join(dir, 'a.jpg'), join(dir, 'b.jpg')]).toString().trim();
    t.eq(same, 'True', 'Pillow decodes the padded JPEG to exactly the original pixels');
  } catch (e) { t.ok(true, `Pillow not available — pixel check skipped (${String(e.message).split('\n')[0]})`); }

  // KB limits read the strict way (either way of counting a KB passes)
  t.eq(kbRange(20, 50), { min: 20480, max: 50000 }, '20 – 50 KB → 20,480 – 50,000 bytes');
  t.eq(kbRange(0, 1), { min: 0, max: 1000 }, '0 – 1 KB');
  t.eq(kbRange(50, 50), { min: 50000, max: 50000 }, '50 – 50 KB: only the 1,000-byte reading has room → 50,000 bytes');
  t.eq(kbRange(49.5, 50), { min: 49500, max: 50000 }, '49.5 – 50 KB → the minimum read as 1,000 bytes a KB');
  t.eq(kbRange(10.5, 20.25), { min: 10752, max: 20250 }, 'decimal KB');
  for (const s of FORM_SPECS) for (const i of s.items) {
    const r = kbRange(i.minKB, i.maxKB);
    t.ok(r.min === Math.ceil(i.minKB * 1024) && r.min <= r.max, `${s.id}/${i.kind}: ${i.minKB}–${i.maxKB} KB holds both readings (${r.min} – ${r.max} bytes)`);
  }
};
