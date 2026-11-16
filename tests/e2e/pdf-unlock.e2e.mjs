// Unlock PDF (#/pdf-unlock): real encrypted PDFs (AES-256, AES-128, RC4-128; password "asdfzxcv") → copies that open
// without a password and keep their text; unprotected input is reported.
import { pdfInfo } from '../lib/pdfcheck.mjs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/pdf-unlock');
  for (const f of ['aes256-asdfzxcv.pdf', 'aes128-asdfzxcv.pdf', 'rc4-128-asdfzxcv.pdf']) {
    ok((await pdfInfo(P(f))).encrypted, `${f}: the input needs a password`);
    await page.locator('input[type=file]').first().setInputFiles(P(f));
    await page.getByPlaceholder('Password').fill('asdfzxcv'); await page.getByPlaceholder('Password').press('Enter');
    await page.getByText('password accepted').waitFor();
    const out = await download(page, () => page.getByRole('button', { name: 'Save without password' }).click()), i = await pdfInfo(out);
    ok(!i.encrypted && i.pages === 1 && /encryption test/.test(i.list[0].text), `${f}: unlocked copy opens without a password, text kept`);
    ok(/-unlocked\.pdf$/.test(out), 'named …-unlocked.pdf');
  }
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.getByText('is not protected').waitFor();
  await page.getByRole('button', { name: 'Save without password' }).click();
  ok(await page.getByText('This PDF is not protected.').count() >= 1, 'unprotected PDF: nothing to remove');
  const real = page.errors.filter((e) => !/not protected/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-unlock');
  await phone.locator('input[type=file]').first().setInputFiles(P('aes256-asdfzxcv.pdf'));
  await phone.getByPlaceholder('Password').waitFor();
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: password box fits, no horizontal scroll');
};
