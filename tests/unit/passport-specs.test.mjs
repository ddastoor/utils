export default async (t, { load }) => {
  const { SPECS, pxAt, BG } = await load('/src/lib/passport-specs.ts');
  const ids = new Set();
  for (const s of SPECS) {
    t.ok(!ids.has(s.id), `unique ${s.id}`); ids.add(s.id);
    t.ok(s.w > 15 && s.w < 80 && s.h > 20 && s.h < 90, `sane size ${s.id}`);
    t.ok(/^#[0-9a-f]{6}$/.test(s.bg.hex) && s.bg.rule, `background spec ${s.id}`);
    if (s.head) t.ok(s.head[0] < s.head[1] && s.head[1] < s.h, `head range inside photo ${s.id}`);
    if (s.digital?.maxKB && s.digital.minKB) t.ok(s.digital.minKB < s.digital.maxKB, `KB range ${s.id}`);
  }
  t.ok(SPECS.length >= 30, `${SPECS.length} presets`);
  t.ok(SPECS.slice(0, 4).every((s) => s.country === 'India'), 'India presets first');
  t.eq(SPECS.find((s) => s.id === 'fr-passport').bg.hex !== BG.white.hex, true, 'France not white');
  t.eq(pxAt(35), 413, '35 mm at 300 dpi'); t.eq(pxAt(51), 602, '2 in at 300 dpi');
};
