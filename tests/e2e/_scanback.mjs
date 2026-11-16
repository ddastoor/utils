// read every code in an image file with the Scanner tab (#/scan) — used by the QR and barcode suites for round trips
export async function scanFile(page, base, file) {
  await page.goto(`${base}#/`); await page.goto(`${base}#/scan`);
  await page.locator('input[type=file]').setInputFiles(file);
  await page.waitForFunction(() => document.querySelector('.scan-text') || /No code found/.test(document.body.textContent), null, { timeout: 30000 });
  return page.$$eval('.card', (cs) => cs.filter((c) => c.querySelector('.scan-text')).map((c) => ({ format: (c.querySelector('h2, .card-title')?.textContent || '').trim(), text: c.querySelector('.scan-text').textContent })));
}
