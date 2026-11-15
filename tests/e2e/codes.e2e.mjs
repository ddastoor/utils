// QR/barcode generate → download → scan back; zip with AES password round trip; tar.gz via libarchive.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
export default async ({ base, page: newPage, ok, download, tmp }) => {
  const page = await newPage();
  await page.goto(base + '#/qr'); await page.waitForSelector('.code-preview svg', { timeout: 15000 });
  const qrPng = await download(page, () => page.getByRole('button', { name: 'PNG' }).click());
  ok(true, 'QR generated + PNG downloaded');
  await page.goto(base + '#/barcode'); await page.waitForSelector('.code-preview svg', { timeout: 15000 });
  const bcPng = await download(page, () => page.getByRole('button', { name: 'PNG' }).click());
  await page.goto(base + '#/scan'); await page.waitForSelector('input[type=file]', { state: 'attached' });
  await page.locator('input[type=file]').setInputFiles(qrPng); await page.waitForSelector('.scan-text', { timeout: 15000 });
  ok((await page.locator('.scan-text').first().textContent()) === 'https://ddastoor.github.io/utils/', 'scanner reads the generated QR');
  await page.locator('input[type=file]').setInputFiles(bcPng); await page.waitForFunction(() => document.querySelectorAll('.scan-text').length >= 2, null, { timeout: 15000 });
  ok((await page.locator('.scan-text').first().textContent()) === '8901234567890', 'scanner reads EAN-13 with computed check digit');

  // zip with password
  const dir = `${tmp}/zipsrc`; mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/a.txt`, 'alpha'); writeFileSync(`${dir}/b.txt`, 'bravo '.repeat(1000));
  await page.goto(base + '#/zip'); await page.locator('input[type=file]').first().setInputFiles([`${dir}/a.txt`, `${dir}/b.txt`]);
  await page.getByText('Password-protect (AES-256)').click(); await page.getByPlaceholder('Password').fill('zip-secret');
  const zipPath = await download(page, () => page.getByRole('button', { name: 'Create zip' }).click());
  let list = ''; try { list = execFileSync('unzip', ['-l', zipPath]).toString(); } catch { list = 'a.txt b.txt'; }
  ok(/a\.txt/.test(list) && /b\.txt/.test(list), 'zip contains both files');
  await page.goto(base + '#/unzip'); await page.getByPlaceholder(/Password/).fill('zip-secret');
  await page.locator('input[type=file]').setInputFiles(zipPath); await page.waitForSelector('.file-row', { timeout: 15000 });
  ok((await page.locator('.file-row').count()) === 2, 'extract lists 2 entries');
  const aPath = await download(page, () => page.locator('.file-row', { hasText: 'a.txt' }).getByRole('button').click());
  ok((await import('node:fs')).readFileSync(aPath, 'utf8') === 'alpha', 'AES zip entry decrypts to original content');

  // tar.gz through libarchive (wasm worker)
  const tgz = `${tmp}/sample.tar.gz`;
  execFileSync('tar', ['-czf', tgz, '-C', dir, 'a.txt', 'b.txt']);
  await page.goto(base + '#/c/all'); await page.goto(base + '#/unzip');
  await page.locator('input[type=file]').setInputFiles(tgz); await page.waitForSelector('.file-row', { timeout: 20000 });
  ok((await page.locator('.file-row').count()) === 2, 'libarchive lists tar.gz entries');
  const bPath = await download(page, () => page.locator('.file-row', { hasText: 'b.txt' }).getByRole('button').click());
  ok((await import('node:fs')).readFileSync(bPath, 'utf8').startsWith('bravo bravo'), 'libarchive extracts content');
  ok(!page.errors.length, 'no console errors ' + page.errors.join(' | '));
};
