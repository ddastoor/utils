// Protect PDF (#/pdf-protect): AES-256 (V5 R6) with a user password; restrictions via the permissions value;
// read back with MuPDF in Node: needs the password, wrong one fails, right one opens with the text and permissions.
import { readFileSync } from 'node:fs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
import { makeSigned } from '../lib/pdfannot.mjs';
export default async ({ base, page: newPage, ok, download, devices, tmp }) => {
  const m = await import('mupdf');
  const open = (f) => m.Document.openDocument(readFileSync(f), 'application/pdf');
  const page = await newPage();
  await page.goto(base + '#/pdf-protect');
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.getByText('crazyones.pdf').first().waitFor();
  const go = () => download(page, () => page.getByRole('button', { name: 'Protect PDF' }).click());
  await page.getByPlaceholder('Password', { exact: true }).fill('Secret-123');
  await page.getByPlaceholder('Repeat the password').fill('Secret-124');
  await page.getByRole('button', { name: 'Protect PDF' }).click();
  ok(await page.getByText('The passwords do not match.').count() >= 1, 'mismatched passwords refused');
  await page.getByPlaceholder('Repeat the password').fill('Secret-123');
  const f1 = await go(), d1 = open(f1);
  ok(d1.needsPassword(), 'protected PDF needs a password');
  ok(!d1.authenticatePassword('wrong'), 'a wrong password does not open it');
  ok(d1.authenticatePassword('Secret-123'), 'the password opens it');
  ok(/V5 R6 256-bit AES/.test(d1.getMetaData('encryption') || ''), `AES-256 encryption (${d1.getMetaData('encryption')})`);
  ok(/Crazy Ones/.test(d1.loadPage(0).toStructuredText('').asText()), 'content intact');
  ok(d1.hasPermission('print') && d1.hasPermission('copy') && d1.hasPermission('edit'), 'no restrictions by default');
  // restrictions: no copying, no changes; with a permissions password
  await page.getByText('Allow copying text').click();
  await page.getByText('Allow changes (edit, comment, fill forms)').click();
  await page.getByPlaceholder('Optional — a random one is used if empty').fill('Owner-456');
  const d2 = open(await go());
  d2.authenticatePassword('Secret-123');
  ok(d2.hasPermission('print') && !d2.hasPermission('copy') && !d2.hasPermission('edit'), 'user password: may print, may not copy or edit');
  const d3 = open(await go());
  ok(d3.authenticatePassword('Owner-456') >= 2, 'the permissions password unlocks everything');
  await page.getByPlaceholder('Password', { exact: true }).fill('a,b'); await page.getByPlaceholder('Repeat the password').fill('a,b');
  await page.getByRole('button', { name: 'Protect PDF' }).click();
  ok(await page.getByText('cannot contain commas').count() >= 1, 'commas refused with an explanation');
  // re-protecting an already protected PDF
  await page.locator('input[type=file]').first().setInputFiles(P('rc4-128-asdfzxcv.pdf'));
  await page.getByPlaceholder('Password', { exact: true }).nth(0).waitFor();
  await page.locator('.pdf-pw input').fill('asdfzxcv'); await page.locator('.pdf-pw input').press('Enter');
  await page.getByText('it will be replaced').waitFor();
  await page.getByPlaceholder('Password', { exact: true }).fill('New-pass'); await page.getByPlaceholder('Repeat the password').fill('New-pass');
  const d4 = open(await go());
  ok(!d4.authenticatePassword('asdfzxcv') && d4.authenticatePassword('New-pass') && /AES/.test(d4.getMetaData('encryption')), 'old RC4 password replaced by AES-256 with the new one');
  // a password with ₹ or an emoji: warned (the PDF password rules of 2003 do not know them); plain ASCII: no warning
  const warnPw = () => page.getByText('This password has characters other than A–Z').isVisible();
  await page.getByPlaceholder('Password', { exact: true }).fill('rent₹99');
  ok(await warnPw(), 'a password with ₹: a warning that some readers may not open the file');
  await page.getByPlaceholder('Password', { exact: true }).fill('Rent-99!');
  ok(!(await warnPw()), 'a plain password: no warning');
  const pw5 = 'pässwörd ₹=1';
  await page.getByPlaceholder('Password', { exact: true }).fill(pw5); await page.getByPlaceholder('Repeat the password').fill(pw5);
  const d5 = open(await go());
  ok(d5.authenticatePassword(pw5) && !d5.authenticatePassword('passwörd'), 'a password with accents, ₹, a space and "=" protects and opens the file');
  // a signed PDF: re-protecting rewrites it, the signature no longer proves anything — said
  await page.locator('input[type=file]').first().setInputFiles(await makeSigned(tmp));
  ok(await page.getByText('is digitally signed (1 signature). The protected copy no longer proves the signature').count() === 1, 'a signed PDF: the tab says the protected copy no longer proves the signature');
  const real = page.errors.filter((e) => !/do not match|cannot contain commas/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-protect');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
