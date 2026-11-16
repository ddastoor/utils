// Screen Info (#/screen): every row checked against what the emulated device really is — 1280×720 at 2× (physical =
// CSS × ratio), dark mode, India time zone + locale, colour depth, refresh rate measured (~60 Hz in headless Chromium),
// CPU threads; viewport and dark-mode rows follow live changes; iPhone 13 (390 × 844 at 3×, touch points, portrait)
// with no horizontal scroll despite the long user agent.
import { phoneLayout } from './_phone.mjs';
const rowsOf = (page) => page.evaluate(() => { const s = [...document.querySelectorAll('.kv > span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, colorScheme: 'dark', timezoneId: 'Asia/Kolkata', locale: 'en-IN' });
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor({ timeout: 10000 });
  let r = await rowsOf(page);
  const real = await page.evaluate(() => ({ sw: screen.width, sh: screen.height, aw: screen.availWidth, ah: screen.availHeight, cd: screen.colorDepth, hc: navigator.hardwareConcurrency, ua: navigator.userAgent, o: screen.orientation.type }));
  ok(r['Screen (CSS px)'] === `${real.sw} × ${real.sh}` && r['Physical pixels'] === `${real.sw * 2} × ${real.sh * 2}`, `screen ${r['Screen (CSS px)']}, physical = × 2 (${r['Physical pixels']})`);
  ok(r['Device pixel ratio'] === '2' && r.Viewport === '1280 × 720' && r['Available area'] === `${real.aw} × ${real.ah}`, `ratio 2, viewport 1280 × 720 (${r.Viewport})`);
  ok(r['Colour depth'] === `${real.cd}-bit` && r['Colour gamut'] === 'sRGB' && r.HDR === 'No', `colour depth ${r['Colour depth']}, sRGB, no HDR`);
  const hz = +/^~(\d+) Hz$/.exec(r['Refresh rate (measured)'])?.[1]; ok(hz >= 30 && hz <= 250, `refresh rate measured from 60 frames (${r['Refresh rate (measured)']})`);
  ok(r['Dark mode'] === 'On' && r['Touch points'] === '0' && r.Orientation === real.o, 'dark mode on, no touch on a desktop, orientation');
  ok(r['Time zone'] === 'Asia/Kolkata' && r.Language === 'en-IN', `India: ${r['Time zone']}, ${r.Language}`);
  ok(r['CPU threads'] === String(real.hc) && r['User agent'] === real.ua && /Chrom/.test(r.Browser), `CPU threads ${r['CPU threads']}, browser ${r.Browser}`);
  ok(/^(Available|No)$/.test(r.WebGPU), `WebGPU row (${r.WebGPU})`);
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.waitForFunction(() => [...document.querySelectorAll('.kv > span')].some((e) => e.textContent === '1000 × 600'), null, { timeout: 5000 }).catch(() => {});
  r = await rowsOf(page); ok(r.Viewport === '1000 × 600', `viewport row follows a window resize (${r.Viewport})`);
  ok(await page.locator('.tool-body .card').count() === 2, 'still exactly two cards after re-rendering');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent === 'Dark mode'); return s[i + 1]?.textContent === 'Off'; }, null, { timeout: 5000 }).catch(() => {});
  r = await rowsOf(page); ok(r['Dark mode'] === 'Off', `dark mode row follows the system setting (${r['Dark mode']})`);
  await page.goto(`${base}#/ruler`); await page.locator('.ruler').waitFor(); await page.setViewportSize({ width: 900, height: 600 }); await page.waitForTimeout(1500);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await phoneLayout(ctx, 'screen', { ready: '.kv' });
  r = await rowsOf(ph);
  ok(r['Screen (CSS px)'] === '390 × 844' && r['Physical pixels'] === '1170 × 2532' && r['Device pixel ratio'] === '3', `iPhone 13: 390 × 844 at 3× = 1170 × 2532 (${r['Physical pixels']})`);
  ok(+r['Touch points'] > 0 && /portrait/.test(r.Orientation), `phone: touch points ${r['Touch points']}, ${r.Orientation}`);
};
