// Photo & Signature Resizer (#/formphoto): exact pixels + KB ranges for Indian portals with real images:
// NASA portrait (face auto-framing), scikit-image "text" scan as a signature on paper (clean-up + padding to minimum).
// KB limits are read the strict way (maximum × 1,000 bytes, minimum × 1,024): the file passes either way of counting.
import { readFileSync } from 'node:fs';
import { imageInfo, decodeInPage, regionMeans } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/formphoto');
  const make = () => download(page, () => page.getByRole('button', { name: 'Make & download' }).click());
  const pick = async (f) => { await page.locator('input[type=file]').setInputFiles(F(f)); await page.waitForSelector('.crop-box:not([hidden])', { timeout: 30000 }); await page.waitForTimeout(1500); };
  const toast = async (re) => { try { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 8000 }); return true; } catch { return false; } };
  const checks = () => page.locator('.checks').innerText();
  const fields = async () => Promise.all(['Width (px)', 'Height (px)', 'Minimum KB', 'Maximum KB'].map((l) => page.getByLabel(l).inputValue()));
  const set = async (w, hh, min, max) => {
    for (const [l, v] of [['Width (px)', w], ['Height (px)', hh], ['Minimum KB', min], ['Maximum KB', max]]) if (v != null) await page.getByLabel(l).fill(String(v));
    await page.waitForTimeout(300);
  };
  const jfifCount = (f) => { const b = readFileSync(f); let n = 0; for (let k = b.indexOf('JFIF\0'); k >= 0; k = b.indexOf('JFIF\0', k + 1)) n++; return n; };
  const boxRatio = async () => { const b = await page.locator('.crop-box').boundingBox(); return b.width / b.height; };

  await page.getByText('200 × 230 px, 20–50 KB').first().waitFor({ timeout: 15000 }).catch(() => {});
  ok(/200 × 230 px, 20–50 KB/.test(await page.locator('body').innerText()), 'IBPS photo spec shown by default');
  ok((await fields()).join() === '200,230,20,50', 'size fields filled from the spec');
  ok(await page.getByRole('button', { name: 'Make & download' }).count() === 0 || await page.getByRole('button', { name: 'Make & download' }).isHidden(), 'nothing to make before a photo is chosen');

  // IBPS photo 200×230, 20–50 KB, framed on the face
  await pick('astronaut.png');
  ok(Math.abs(await boxRatio() - 200 / 230) < 0.03, `crop frame at the photo's shape 200 : 230 (${(await boxRatio()).toFixed(3)})`);
  let p = await make(), i = imageInfo(p);
  ok(i.type === 'jpeg' && i.width === 200 && i.height === 230, `IBPS photo 200×230 (${i.width}×${i.height})`);
  ok(i.size >= 20 * 1024 && i.size <= 50 * 1000, `IBPS photo 20,480 – 50,000 bytes (${i.size})`);
  ok(!i.exif && i.dpi === 300, `no EXIF, 300 dpi (${i.dpi})`);
  ok(/✓ .*bytes \(allowed 20–50 KB: 20,480 – 50,000 bytes/.test(await checks()), 'result checklist all green, with the byte range');
  ok(/as it will be uploaded/.test(await page.locator('img.form-result').getAttribute('alt')), 'result picture has a describing alt text');
  const [mid] = await regionMeans(page, p, [[0.35, 0.3, 0.65, 0.6], [0.0, 0.0, 1.0, 0.05]]);
  ok(mid[0] > mid[2] + 15, `face (skin tones) in the middle of the frame (${mid.slice(0, 3).map(Math.round)})`);

  // the size boxes re-frame the crop at once (no new face search); a square
  await set(300, 300);
  ok(Math.abs(await boxRatio() - 1) < 0.03, `300 × 300 typed → square frame (${(await boxRatio()).toFixed(3)})`);
  p = await make(); i = imageInfo(p);
  ok(i.width === 300 && i.height === 300, `custom square 300×300 (${i.width}×${i.height})`);
  // an invalid size leaves the frame alone and is refused with its reason, field by field
  await set(5);
  ok(Math.abs(await boxRatio() - 1) < 0.03, 'width 5 (too small) → frame unchanged');
  await page.getByRole('button', { name: 'Make & download' }).click();
  ok(await toast(/The width is a whole number of pixels from 10 to 5,000/), 'width 5 → "The width is a whole number of pixels from 10 to 5,000."');
  await set(300, 6000);
  await page.getByRole('button', { name: 'Make & download' }).click();
  ok(await toast(/The height is a whole number of pixels from 10 to 5,000/), 'height 6000 → refused with the reason');
  await set(300, 300, 60, 50);
  await page.getByRole('button', { name: 'Make & download' }).click();
  ok(await toast(/The minimum KB is above the maximum/), 'minimum 60 KB above maximum 50 KB → refused');
  await set(null, null, 20, '');
  await page.getByRole('button', { name: 'Make & download' }).click();
  ok(await toast(/The maximum is a size in KB, at least 1/), 'empty maximum → refused');
  await set(null, null, '', 50);
  await page.getByRole('button', { name: 'Make & download' }).click();
  ok(await toast(/The minimum is a size in KB \(0 for none\)/), 'empty minimum → refused');

  // 50 – 50 KB: only the 1,000-byte reading has room → exactly 50,000 bytes (padded with JPEG comments)
  await set(200, 230, 50, 50);
  p = await make(); i = imageInfo(p);
  ok(i.size === 50000 && i.width === 200, `50 – 50 KB → exactly 50,000 bytes (${i.size})`);
  ok(/padded to the minimum/.test(await checks()) && /✓ 50,000 bytes/.test(await checks()), '… padded, said so, and marked ✓');
  ok(i.dpi === 300 && jfifCount(p) === 1, `the 300 dpi is in the one JFIF header, set before padding (dpi ${i.dpi}, ${jfifCount(p)} JFIF)`);
  const d0 = await decodeInPage(page, p, [[0.5, 0.5]]);
  ok(d0.width === 200 && d0.height === 230, 'the padded JPEG decodes in the browser');

  // a maximum the picture cannot get under: not downloaded on its own; a red line and "Download anyway"
  await set(2000, 2000, 0, 1);
  let got = null;
  page.once('download', (dl) => { got = dl; });
  await page.getByRole('button', { name: 'Make & download' }).click();
  await page.getByRole('button', { name: 'Download anyway' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  ok(got === null, 'a file above the maximum is not downloaded without asking');
  ok(/✗ .*allowed 0–1 KB/.test(await checks()), 'the size line is marked ✗');
  ok(/does not fit under 1 KB even at the lowest quality/.test(await page.locator('.note-err').last().innerText()), 'the reason and the way out are said');
  p = await download(page, () => page.getByRole('button', { name: 'Download anyway' }).click());
  i = imageInfo(p);
  ok(i.width === 2000 && i.size > 1000, `"Download anyway" gives the file (${i.size} bytes)`);

  // switching the kind resets the boxes to its spec
  await page.getByRole('radio', { name: 'Signature' }).click();
  ok(/140 × 60 px, 10–20 KB/.test(await page.locator('body').innerText()), 'signature spec shown');
  ok((await fields()).join() === '140,60,10,20', `kind switch resets the boxes (${(await fields()).join()})`);

  // IBPS signature: 140×60, 10–20 KB (tiny JPEG → padded to the minimum), paper cleaned to white
  await pick('text.png');
  ok(Math.abs(await boxRatio() - 140 / 60) < 0.05, `signature frame at 140 : 60 (${(await boxRatio()).toFixed(3)})`);
  p = await make(); i = imageInfo(p);
  ok(i.width === 140 && i.height === 60 && i.size >= 10 * 1024 && i.size <= 20 * 1000, `signature 140×60, ${i.size} bytes`);
  ok(i.size >= 10240 && i.size <= 10240 + 64, `padded to just over 10 KB (${i.size})`);
  ok(/padded to the minimum/.test(await checks()), 'padding reported');
  const d = await decodeInPage(page, p, [[0.02, 0.05]]);
  ok(d.width === 140 && d.mean[0] > 150, 'padded JPEG decodes; mostly white paper');
  ok(i.dpi !== 300, `a signature without a spec dpi gets none (${i.dpi})`);

  // Thumb impression and declaration of the IBPS spec
  await page.getByRole('radio', { name: 'Declaration' }).click();
  ok((await fields()).join() === '800,400,50,100', 'declaration 800 × 400, 50–100 KB');
  await page.waitForTimeout(1500);
  p = await make(); i = imageInfo(p);
  ok(i.width === 800 && i.height === 400 && i.size >= 50 * 1024 && i.size <= 100 * 1000, `declaration 800×400, ${i.size} bytes`);
  await page.getByRole('radio', { name: 'Thumb impression' }).click();
  await page.waitForTimeout(1500);
  p = await make(); i = imageInfo(p);
  ok(i.width === 240 && i.height === 240 && i.size >= 20 * 1024 && i.size <= 50 * 1000, `thumb 240×240, ${i.size} bytes`);

  // SSC photo with DPI, then a custom edit of the size fields
  await page.locator('select').selectOption('ssc');
  ok((await fields()).join() === '413,531,20,50', 'portal switch → its first item (photo 413 × 531)');
  await pick('astronaut.png');
  p = await make(); i = imageInfo(p);
  ok(i.width === 413 && i.height === 531 && i.dpi === 300 && i.size <= 50 * 1000 && i.size >= 20 * 1024, `SSC photo 413×531 @300 dpi, ${i.size} bytes`);
  await set(300, 400, 5, 15);
  await page.waitForTimeout(500);
  p = await make(); i = imageInfo(p);
  ok(i.width === 300 && i.height === 400 && i.size <= 15 * 1000 && i.size >= 5 * 1024, `custom 300×400, 5–15 KB (${i.size} bytes)`);

  // PAN signature: 600 dpi in the file
  await page.locator('select').selectOption('pan');
  await page.getByRole('radio', { name: 'Signature' }).click();
  await page.waitForTimeout(1500);
  p = await make(); i = imageInfo(p);
  ok(i.width === 1063 && i.height === 472 && i.dpi === 600, `PAN signature 1063×472 at 600 dpi (${i.width}×${i.height}, ${i.dpi})`);

  // the newest photo wins: a second photo chosen while the first is still being prepared
  await page.locator('select').selectOption('ibps');
  await page.locator('input[type=file]').setInputFiles(F('astronaut.png'));
  await page.locator('input[type=file]').setInputFiles(F('text.png'));
  await page.waitForTimeout(4000);
  const cv = await page.locator('canvas.ed-canvas').evaluate((c) => c.width / c.height);
  ok(Math.abs(cv - 448 / 172) < 0.02, `the canvas shows the newer photo (ratio ${cv.toFixed(3)}, text.png 2.605)`);
  p = await make(); i = imageInfo(p);
  ok(i.width === 200 && i.height === 230, 'and the photo made from it has the photo size');
  const errs = page.errors.filter((e) => !/^Error: The (width|height) is a whole number|^Error: The minimum KB is above|^Error: The maximum is a size|^Error: The minimum is a size/.test(e)); // the refusals above, logged by the button
  ok(errs.length === 0, `no page errors: ${errs.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/formphoto');
  await phone.locator('input[type=file]').setInputFiles(F('astronaut.png'));
  await phone.waitForSelector('.crop-box:not([hidden])', { timeout: 30000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  ok(await phone.getByRole('button', { name: 'Make JPG' }).isVisible() && await phone.getByRole('button', { name: 'Share' }).isVisible(), 'phone: Make JPG and Share');
  const bh = await phone.getByRole('button', { name: 'Make JPG' }).boundingBox();
  ok(bh.height >= 44, `phone: touch target ≥ 44 px (${Math.round(bh.height)})`);
};
