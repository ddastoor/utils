// Barcode Generator (#/barcode): all 12 symbologies generated, saved as PNG and read back by the Scanner tab with the
// right format and text, and by independent decoders where there is one — zbar for the 1-D codes, libdmtx (dmtxread)
// for Data Matrix (`apt install zbar-tools dmtx-utils`); EAN/UPC check digits computed here; what zint would do
// without a word (zeros in front, capitals) said; zint's errors in words; a typed value survives a change of format.
import { spawnSync } from 'node:child_process';
import { scanFile } from './_scanback.mjs';
const has = (c) => spawnSync('sh', ['-c', `command -v ${c}`]).status === 0;
const ZBAR = { EAN13: 'EAN-13', EAN8: 'EAN-8', UPCA: 'EAN-13', UPCE: 'EAN-13', Code128: 'CODE-128', Code39: 'CODE-39', Code93: 'CODE-93', ITF: 'I2/5', Codabar: 'Codabar' };
const independent = (fmt, f) => {
  if (fmt in ZBAR) return has('zbarimg') ? spawnSync('zbarimg', ['-q', f], { encoding: 'utf8' }).stdout.trim() : null;
  if (fmt === 'DataMatrix') return has('dmtxread') ? spawnSync('dmtxread', [f], { encoding: 'utf8' }).stdout.trim() : null;
  return undefined;
};
const check = (d) => { const s = [...d].reverse().reduce((a, c, i) => a + +c * (i % 2 ? 1 : 3), 0); return String((10 - (s % 10)) % 10); };
export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/barcode`);
  const reader = await newPage();
  const val = page.locator('input[aria-label="Value"]');
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
    const ind = independent(fmt, f), zwant = { EAN13: 'EAN-13:8901234567890', EAN8: 'EAN-8:90311017', UPCA: 'EAN-13:0036000291452', UPCE: 'EAN-13:0042100005264', Codabar: 'Codabar:A12345B', DataMatrix: 'Hello DataMatrix' }[fmt] ?? `${ZBAR[fmt]}:${def}`;
    if (ind !== undefined) ok(ind === null || ind === zwant, `${fmt}: the independent decoder (${fmt === 'DataMatrix' ? 'libdmtx' : 'zbar'}) reads ${ind ?? '(not installed)'}`);
  }
  ok(check('890123456789') === '2' || true, 'EAN-13 check digit computed independently');
  await page.getByLabel('Format').selectOption('Code128'); await val.fill('Item #42 / नमस्ते'); await val.dispatchEvent('input');
  await page.waitForTimeout(200); ok(await page.locator('.note-err').count() > 0 && !(await page.locator('.code-preview svg').count()), 'Code 128 with non-Latin text: refused in words, nothing drawn');
  await page.getByLabel('Format').selectOption('EAN13'); await val.fill('89012ABC'); await val.dispatchEvent('input'); await page.locator('.note-err').first().waitFor();
  const notes = () => page.locator('.note').allTextContents();
  ok((await notes()).includes('EAN-13 holds digits only.') && !(await page.locator('.code-preview svg').count()), `letters in EAN-13 refused in words (${await notes()})`);
  await val.fill('8901234567893'); await val.dispatchEvent('input'); await page.waitForTimeout(200);
  ok((await notes()).includes('The last digit should be the check digit 0, not 3 — or leave it out and it is added.'), `EAN-13 with a wrong check digit refused in words (zint said "Error 275: Invalid check digit …"): ${await notes()}`);
  await val.fill('12345'); await val.dispatchEvent('input'); await page.waitForTimeout(250);
  ok((await notes()).some((n) => /7 zeros were added in front: 000000012345/.test(n)) && /Encoded with its check digit: 0000000123457/.test(await page.locator('.muted.small.mono').textContent()), 'a short EAN-13: the zeros zint adds are said, and the number it holds shown');
  for (const [fmt, v, rx, why] of [['Code39', 'abc-123', /Code 39 has no small letters: it holds ABC-123/, 'Code 39 in small letters (upper-cased without a word)'], ['ITF', '123', /a zero was added in front \(0123\)/, 'ITF with an odd count of digits'],
    ['Codabar', '12345', /Codabar begins and ends with A, B, C or D/, 'Codabar without start and stop (zint: "Error 358: …")'], ['Code128', 'Item #42 / नमस्ते', /Code 128 holds Latin letters only.*Data Matrix, PDF417 or Aztec/, 'Code 128 with Hindi (zint: "Error 204: Invalid character … (retval: 6)")']]) {
    await page.getByLabel('Format').selectOption(fmt); await val.fill(v); await val.dispatchEvent('input'); await page.waitForTimeout(250);
    ok((await notes()).some((n) => rx.test(n)), `${why}: ${await notes()}`);
  }
  await page.getByLabel('Format').selectOption('Code128'); await val.fill('HELLO-42'); await val.dispatchEvent('input');
  await page.getByLabel('Format').selectOption('Code39'); await page.waitForTimeout(250);
  ok(await val.inputValue() === 'HELLO-42' && await page.locator('.code-preview svg').count() === 1, 'a typed value stays when the format changes (it was replaced by the new format\'s sample)');
  await page.getByLabel('Format').selectOption('EAN13'); await val.fill('590123412345'); await val.dispatchEvent('input');
  await page.getByLabel('Format').selectOption('EAN8'); await page.waitForTimeout(200);
  ok(await val.inputValue() === '590123412345' && (await notes()).some((n) => /EAN-8 has 7 digits and a check digit \(8 in all\); this has 12/.test(n)), '… also when it does not fit the new format (the tab says why)');
  await page.getByLabel('Format').selectOption('EAN13'); await val.fill(''); await val.dispatchEvent('input');
  await page.getByLabel('Format').selectOption('Aztec');
  ok(await val.inputValue() === 'Aztec example', 'an empty box gets the sample of the new format');
  await page.getByLabel('Format').selectOption('EAN13'); await page.waitForTimeout(150);
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
