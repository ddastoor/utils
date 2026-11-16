// Ruler (#/ruler): CSS standard 96 px per inch = 3.7795 px/mm by default; millimetre ticks with majors (labelled cm) every
// 10 and mids every 5; inches in 1/16 with labelled inches every 96 px and halves at 48; tick count fills the width; the
// ID-1 card outline is 85.6 × 53.98 mm at the current calibration; calibration slider moves ticks and card; resize
// redraws; phone: the card is drawn upright (54 × 85.6 mm) instead of being squeezed, no horizontal scroll.
import { phoneLayout } from './_phone.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ viewport: { width: 1280, height: 800 } }); await page.goto(`${base}#/ruler`);
  await page.locator('.tick.major').first().waitFor();
  const ticks = () => page.$$eval('.ruler .tick', (t) => t.map((e) => ({ x: parseFloat(e.style.left), major: e.classList.contains('major'), mid: e.classList.contains('mid'), label: e.textContent })));
  const rw = () => page.locator('.ruler').evaluate((e) => e.clientWidth);
  const cardSize = () => page.locator('.card-outline').evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height, e.textContent]; });
  const setCal = async (v) => { const s = page.locator('input[type=range]'); await s.fill(String(v)); await s.dispatchEvent('input'); };
  const check = async (pxmm, what) => {
    const t = await ticks(), w = await rw(), n = Math.floor(w / pxmm) + 1, bad = [];
    if (t.length !== n) bad.push(`${t.length} ticks, want ${n}`);
    t.forEach((k, i) => {
      if (Math.abs(k.x - i * pxmm) > 1e-3 + 1e-5 * k.x) bad.push(`tick ${i} at ${k.x}`);
      if (k.major !== (i % 10 === 0) || k.mid !== (i % 10 !== 0 && i % 5 === 0)) bad.push(`tick ${i} kind`);
      if (k.label !== (i % 10 === 0 ? String(i / 10) : '')) bad.push(`tick ${i} label "${k.label}"`);
    });
    ok(!bad.length, `${what}: ${n} mm ticks every ${pxmm.toFixed(4)} px, cm labels 0…${Math.floor((n - 1) / 10)} ${bad.slice(0, 4).join('; ')}`);
    const [cw, ch, txt] = await cardSize();
    ok(Math.abs(cw - 85.6 * pxmm) < 0.6 && Math.abs(ch - 53.98 * pxmm) < 0.6 && txt === 'Card', `${what}: card outline 85.6 × 53.98 mm = ${(85.6 * pxmm).toFixed(1)} × ${(53.98 * pxmm).toFixed(1)} px (${cw.toFixed(1)} × ${ch.toFixed(1)})`);
  };
  const std = 96 / 25.4;
  await check(std, 'default 96 dpi');
  const t = await ticks(); ok(Math.abs(t.find((k) => k.label === '5').x - 5 * 96 / 2.54) < 1e-3, '5 cm label at 5 × 96 / 2.54 = 188.98 px');
  await page.getByRole('radio', { name: 'Inches', exact: true }).click();
  const ti = await ticks(), wi = await rw(), badI = [];
  ti.forEach((k, i) => { if (Math.abs(k.x - i * 6) > 1e-3 || k.major !== (i % 16 === 0) || k.mid !== (i % 16 !== 0 && i % 8 === 0) || k.label !== (i % 16 === 0 ? String(i / 16) : '')) badI.push(i); });
  ok(ti.length === Math.floor(wi / 6) + 1 && !badI.length && ti.find((k) => k.label === '1').x === 96 && ti[8].mid, `inches: 1/16″ ticks every 6 px, inch labels every 96 px, halves at 48 px (${badI.slice(0, 5)})`);
  await page.getByRole('radio', { name: 'Centimetres', exact: true }).click();
  await setCal(5); ok(await page.locator('.slider-val').textContent() === '5.000 px/mm', 'slider shows "5.000 px/mm"');
  await check(5, 'calibrated to 5 px/mm');
  await setCal(2.5); await check(2.5, 'calibrated to 2.5 px/mm');
  await page.setViewportSize({ width: 900, height: 800 }); await page.waitForTimeout(150); await check(2.5, 'after resizing the window');
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor(); await page.setViewportSize({ width: 1100, height: 800 }); await page.waitForTimeout(150);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await phoneLayout(ctx, 'ruler', { ready: '.tick.major' });
  for (const cal of [3.78, 6.1, 8]) {
    const sl = ph.locator('input[type=range]'); await sl.fill(String(cal)); await sl.dispatchEvent('input');
    const [w, hh, txt, avail] = await ph.locator('.card-outline').evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height, e.textContent, e.parentElement.clientWidth]; });
    const upright = 85.6 * cal > avail, W = (upright ? 53.98 : 85.6) * cal, H = (upright ? 85.6 : 53.98) * cal;
    ok(txt === (upright ? 'Card (upright)' : 'Card') && Math.abs(hh - H) < 0.6 && (Math.abs(w - W) < 0.6 || (upright && w === avail)) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `phone at ${cal} px/mm (${avail} px free): card ${upright ? 'upright' : 'sideways'} ${W.toFixed(1)} × ${H.toFixed(1)} px, never squeezed (${w.toFixed(1)} × ${hh.toFixed(1)}), no horizontal scroll`);
  }
};
