// Base64 (#/base64): UTF-8 text both ways (Hindi, emoji), URL-safe alphabet without padding, decoding URL-safe and
// unpadded input, invalid and binary input, a file → data URL that decodes to the same bytes, Base64 → file.
import { readFileSync } from 'node:fs';
import { pcOnlyOnPhone } from './_pconly.mjs';
const IMG = new URL('../fixtures/images/exif_gps.jpg', import.meta.url).pathname;
export default async (ctx) => {
  const { base, page: newPage, ok, download } = ctx;
  const page = await newPage(); await page.goto(`${base}#/base64`);
  const inp = page.getByLabel('Input'), out = page.locator('.card').filter({ hasText: 'Output' }).locator('textarea');
  const warn = async () => ((await page.locator('.note-warn').count()) ? (await page.locator('.note-warn').first().textContent()).trim() : '');
  await inp.waitFor();
  const T = 'Hello, नमस्ते 👋';
  ok(await out.inputValue() === Buffer.from(T).toString('base64'), 'default text → Base64 (UTF-8)');
  await page.locator('label.switch').filter({ hasText: 'URL-safe' }).click();
  const T2 = 'subjects?_d=1&x=>>>~~~';
  await inp.fill(T2); ok(await out.inputValue() === Buffer.from(T2).toString('base64url'), `URL-safe alphabet, no padding (${await out.inputValue()})`);
  await page.locator('label.switch').filter({ hasText: 'URL-safe' }).click();
  await page.getByRole('radio', { name: 'Decode', exact: true }).click();
  for (const [b64, txt] of [[Buffer.from(T).toString('base64'), T], [Buffer.from(T2).toString('base64url'), T2], ['SGk', 'Hi'], ['  SGVs\nbG8=  ', 'Hello']]) {
    await inp.fill(b64); ok(await out.inputValue() === txt, `decode ${JSON.stringify(b64.slice(0, 16))} → ${JSON.stringify(txt)}`);
  }
  await inp.fill('not base64!!'); ok(/Not valid Base64/.test(await warn()) && await out.inputValue() === '', 'invalid Base64 reported');
  await inp.fill(Buffer.from([0xff, 0xfe, 0x00, 0x80]).toString('base64')); ok(/binary/.test(await warn()), 'binary (non-UTF-8) result explained');
  await page.locator('input[type=file]').setInputFiles(IMG);
  await page.waitForFunction(() => document.querySelectorAll('textarea')[1]?.value.startsWith('data:'));
  const du = await out.inputValue(), bytes = readFileSync(IMG);
  ok(du === `data:image/jpeg;base64,${bytes.toString('base64')}`, `file → data URL (${du.slice(0, 30)}…, ${bytes.length} bytes)`);
  await inp.fill(du);
  const f = await download(page, () => page.getByRole('button', { name: 'Base64 → download file' }).click());
  ok(readFileSync(f).equals(bytes), 'Base64 / data URL → download gives the same bytes');
  await inp.fill('***'); await page.getByRole('button', { name: 'Base64 → download file' }).click();
  ok(/nothing to download/.test(await warn()) && !page.errors.length, 'bad Base64 → message, no page error');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'base64');
};
