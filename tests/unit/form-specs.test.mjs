// Exam/portal upload presets are well-formed; JPEG padding (metacore) reaches a minimum size without touching pixels.
import { readFileSync } from 'node:fs';
export default async (t, { load, wasm, root }) => {
  const { FORM_SPECS, KIND_LABEL } = await load('/src/lib/form-specs.ts');
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
};
