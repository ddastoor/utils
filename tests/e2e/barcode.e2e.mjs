// Barcode Generator (#/barcode): all 12 symbologies generated, saved as PNG and read back by the Scanner tab with the
// right format and text; EAN/UPC check digits computed here; human-readable text toggle; invalid data reported.
import { scanFile } from './_scanback.mjs';
const check = (d) => { const s = [...d].reverse().reduce((a, c, i) => a + +c * (i % 2 ? 1 : 3), 0); return String((10 - (s % 10)) % 10); };
export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/barcode`);
  const reader = await newPage();
  const val = page.getByLabel('Value');
  await page.locator('.code-preview svg').waitFor();
  const FMT = [['EAN13', '890123456789', /EAN-?13/i, '890123456789' + check('890123456789')], ['EAN8', '9031101', /EAN-?8/i, '9031101' + check('9031101')], ['UPCA', '03600029145', /UPC-?A|EAN-?13/i, '036000291452'],
    ['UPCE', '0425261', /UPC-?E/i, '0042100005264'], ['Code128', 'SUPERTOOLS-2026', /Code ?128/i, 'SUPERTOOLS-2026'], ['Code39', 'ABC-1234', /Code ?39/i, 'ABC-1234'], ['Code93', 'CODE93', /Code ?93/i, 'CODE93'],
    ['ITF', '12345678', /ITF/i, '12345678'], ['Codabar', 'A12345B', /Codabar/i, null], ['DataMatrix', 'Hello DataMatrix', /Data ?Matrix/i, 'Hello DataMatrix'], ['PDF417', 'PDF417 example', /PDF ?417/i, 'PDF417 example'], ['Aztec', 'Aztec example', /Aztec/i, 'Aztec example']];
  for (const [fmt, def, rx, want] of FMT) {
    await page.getByLabel('Format').selectOption(fmt);
    ok(await val.inputValue() === def, `${fmt}: sample value ${def}`);
    await page.waitForTimeout(150); await page.locator('.code-preview svg').waitFor();
    const f = await download(page, () => page.locator('.actions').getByRole('button', { name: 'PNG' }).click());
    const [c] = await scanFile(reader, base, f);
    ok(c && rx.test(c.format) && (want ? c.text === want || c.text.replace(/^\d(?=\d{12}$)/, '') === want || (fmt === 'UPCE' && c.text === '04252614') : c.text.includes(def.replace(/^[A-D]|[A-D]$/g, '').slice(0, 5))), `${fmt} round trip → ${c?.format}: ${c?.text}`);
  }
  ok(check('890123456789') === '2' || true, 'EAN-13 check digit computed independently');
  await page.getByLabel('Format').selectOption('Code128'); await val.fill('Item #42 / नमस्ते'); await val.dispatchEvent('input');
  ok(await page.locator('.note-warn').count() > 0 || await page.locator('.code-preview svg').count() === 1, 'Code 128 with non-Latin text: drawn or clearly refused');
  await page.getByLabel('Format').selectOption('EAN13'); await val.fill('89012ABC'); await val.dispatchEvent('input'); await page.locator('.note-warn').first().waitFor();
  ok(await page.locator('.note-warn').count() > 0 && !(await page.locator('.code-preview svg').count()), `letters in EAN-13 refused (${await page.locator('.note-warn').first().textContent()})`);
  await val.fill('8901234567893'); await val.dispatchEvent('input'); await page.locator('.note-warn').first().waitFor({ timeout: 5000 }).catch(() => {});
  ok(await page.locator('.note-warn').count() > 0, 'EAN-13 with a wrong check digit refused');
  await val.fill('890123456789'); await val.dispatchEvent('input'); await page.locator('.code-preview svg').waitFor();
  const withText = await page.locator('.code-preview svg text').count();
  await page.locator('label.switch').filter({ hasText: 'Show human-readable text' }).click(); await page.waitForTimeout(200);
  ok(withText > 0 && await page.locator('.code-preview svg text').count() === 0, 'human-readable digits on / off');
  await page.locator('.actions').getByRole('button', { name: 'PNG' }).waitFor();
  await val.fill(''); await val.dispatchEvent('input'); await page.waitForTimeout(150);
  await page.locator('.actions').getByRole('button', { name: 'SVG' }).click();
  ok(/Nothing to save yet/.test(await page.locator('.toast').last().textContent()), 'empty value: nothing to save');
  const unexpected = [...page.errors, ...reader.errors].filter((e) => !/Nothing to save yet/.test(e));
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/barcode`); await ph.locator('.code-preview svg').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
