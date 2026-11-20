// Background Remover (#/bgremove): real portrait (NASA astronaut photo) → transparent PNG, colour, blur, photo backgrounds.
import { imageInfo, decodeInPage, regionMeans, lum } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/bgremove');
  // every status line the tab shows, in order (some last only a moment)
  await page.waitForSelector('[aria-live="polite"].muted', { state: 'attached' });
  await page.evaluate(() => { const el = document.querySelector('[aria-live="polite"].muted'); window.__st = []; new MutationObserver(() => window.__st.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); });
  const statusLine = () => page.locator('[aria-live="polite"].muted').first().textContent();
  const waitStatus = async (re) => { await page.waitForFunction((src) => (window.__st || []).some((t) => new RegExp(src).test(t)), re.source, { timeout: 120000 }); };
  const choose = async (f, re = /Done in|No person|could not be found/) => {
    await page.evaluate(() => { window.__st = []; });
    await page.locator('input[type=file]').first().setInputFiles(F(f));
    await waitStatus(re);
    await page.waitForTimeout(400);
  };
  const toast = async (re) => { try { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 8000 }); return true; } catch { return false; } };
  await choose('astronaut.png');
  info(await statusLine());
  ok(await page.evaluate(() => window.__st.some((t) => /Finding the person… \(the first photo loads a 16 MB model\)/.test(t))), 'first photo: the status says the model is being loaded');
  ok(/Done in [\d.]+ s · 512×512 · the person fills (3\d|4\d|5\d) % of it/.test(await statusLine()), `status: time, size and how much of the photo the person fills (${await statusLine()})`);
  const save = () => download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  // astronaut.png: face around (0.45, 0.3); flag top-left (0.1, 0.1) and shuttle right (0.85, 0.3) are background
  const pts = [[0.45, 0.3], [0.08, 0.08], [0.88, 0.25], [0.5, 0.75]];
  const p1 = await save(), i1 = imageInfo(p1);
  ok(i1.type === 'png' && i1.width === 512 && i1.height === 512, `transparent PNG at full size (${i1.width}×${i1.height})`);
  const d1 = await decodeInPage(page, p1, pts);
  info(`alpha: face ${d1.px[0][3]}, flag ${d1.px[1][3]}, shuttle ${d1.px[2][3]}, suit ${d1.px[3][3]}`);
  ok(d1.px[0][3] > 230 && d1.px[3][3] > 200, 'person kept (face and suit opaque)');
  ok(d1.px[1][3] < 30 && d1.px[2][3] < 30, 'background removed (flag and shuttle transparent)');

  await page.getByRole('radio', { name: 'Colour' }).click();
  ok(await page.getByRole('button', { name: 'White' }).getAttribute('aria-pressed') === 'true', 'white is the chosen colour at first (pressed)');
  await page.getByRole('button', { name: 'Blue' }).click();
  ok(await page.getByRole('button', { name: 'Blue' }).getAttribute('aria-pressed') === 'true' && await page.getByRole('button', { name: 'White' }).getAttribute('aria-pressed') === 'false', 'the chosen swatch is marked pressed, the others not');
  const sw = await page.getByRole('button', { name: 'Blue' }).boundingBox();
  ok(sw.width >= 44 && sw.height >= 44, `colour swatches are touch targets (${sw.width}×${sw.height})`);
  const p2 = await save(), d2 = await decodeInPage(page, p2, pts);
  ok(imageInfo(p2).type === 'jpeg', 'colour background saves a JPEG');
  ok(d2.px[1][2] > 180 && d2.px[1][0] < 80, `background replaced with blue (${d2.px[1].slice(0, 3)})`);
  ok(Math.abs(d2.px[0][0] - d1.px[0][0]) < 25, 'face unchanged');
  await page.getByLabel('Custom colour').fill('#20c040');
  await page.waitForTimeout(300);
  ok(await page.getByRole('button', { name: 'Blue' }).getAttribute('aria-pressed') === 'false', 'a custom colour un-marks the swatches');
  const p2b = await save(), d2b = await decodeInPage(page, p2b, pts);
  ok(Math.abs(d2b.px[1][0] - 0x20) < 12 && Math.abs(d2b.px[1][1] - 0xc0) < 12 && Math.abs(d2b.px[1][2] - 0x40) < 12, `custom colour #20c040 behind the person (${d2b.px[1].slice(0, 3)})`);

  await page.getByRole('radio', { name: 'Blur' }).click();
  const p3 = await save();
  const [bgO, bgB] = [await regionMeans(page, F('astronaut.png'), [[0.02, 0.02, 0.06, 0.4]]), await regionMeans(page, p3, [[0.02, 0.02, 0.06, 0.4]])];
  ok(Math.abs(lum(bgO[0]) - lum(bgB[0])) < 60, 'blurred background keeps its colours');
  const det = await decodeInPage(page, p3, [[0.05, 0.1], [0.05, 0.12]]);
  ok(Math.abs(det.px[0][0] - det.px[1][0]) < 40, 'background is smooth (blurred)');

  await page.getByRole('radio', { name: 'Photo' }).click();
  await page.waitForTimeout(300);
  ok(/Choose a background photo/.test(await statusLine()), 'Photo without a background photo: the status says to choose one');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  ok(await toast(/Choose a background photo/), '… and Save says so');
  await page.locator('input[type=file]').nth(1).setInputFiles(F('coffee.jpg'));
  await page.waitForTimeout(800);
  const p4 = await save(), d4 = await decodeInPage(page, p4, [[0.08, 0.08]]);
  ok(d4.px[0][0] > d4.px[0][2], `coffee photo behind the person (warm tones ${d4.px[0].slice(0, 3)})`);
  ok(/Done in/.test(await statusLine()), 'with the background photo the status line is back');

  // a photo without a person (a scanned page): said, and Save refuses with the reason — no empty PNG
  await choose('text.png');
  ok(/No person was found in this photo — there is nothing to keep/.test(await statusLine()), `no person: said (${await statusLine()})`);
  ok(!(await page.evaluate(() => window.__st.some((t) => /16 MB model/.test(t)))), 'second photo: no "loads a 16 MB model" note');
  let got = null; page.once('download', (dl) => { got = dl; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  ok(await toast(/No person was found/), 'Save gives the reason');
  await page.waitForTimeout(500);
  ok(got === null, '… and downloads nothing');

  // the newest photo wins: the portrait, then at once the page — the page's verdict stays, not the portrait's cut-out
  await page.evaluate(() => { window.__st = []; });
  await page.locator('input[type=file]').first().setInputFiles(F('astronaut.png'));
  await page.locator('input[type=file]').first().setInputFiles(F('text.png'));
  await page.waitForTimeout(12000);
  ok(/No person was found/.test(await statusLine()), `newest photo wins (${await statusLine()})`);
  const cw = await page.locator('canvas.ed-canvas').evaluate((c) => c.width / c.height);
  ok(Math.abs(cw - 448 / 172) < 0.02, `the canvas shows the newer photo (ratio ${cw.toFixed(3)})`);

  // and the portrait once more: the cut-out is back
  await page.getByRole('radio', { name: 'Transparent' }).click();
  await choose('astronaut.png', /Done in/);
  const p5 = await save(), d5 = await decodeInPage(page, p5, pts);
  ok(imageInfo(p5).type === 'png' && d5.px[0][3] > 230 && d5.px[1][3] < 30, 'a portrait after a page: cut out again');
  const errs = page.errors.filter((e) => !/^Error: (Choose a background photo|No person was found)/.test(e)); // refusals, logged by the button
  ok(errs.length === 0, `no page errors: ${errs.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/bgremove');
  await phone.waitForSelector('input[type=file]', { state: 'attached' });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  await phone.locator('input[type=file]').first().setInputFiles(F('astronaut.png'));
  await phone.waitForFunction(() => /Done in/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 120000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll with a photo');
  for (const n of ['Save', 'Share']) {
    const b = await phone.getByRole('button', { name: n, exact: true }).boundingBox();
    ok(b && b.height >= 44, `phone: ${n} is a touch target (${b && Math.round(b.height)} px)`);
  }
};
