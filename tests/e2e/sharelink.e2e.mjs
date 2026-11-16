// Encrypted Share Link (#/sharelink): the message lives only in the #fragment (never sent to a server), opens on
// another page with the password, wrong password, Unicode, input checks.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/sharelink`);
  const toastText = async () => (await page.locator('.toast').last().textContent({ timeout: 30000 })).trim();
  const fv = (pg, l) => pg.locator('.field').filter({ has: pg.locator('.field-label', { hasText: new RegExp(`^${l.replace(/[()]/g, '\\$&')}$`) }) }).locator('textarea').first();
  await fv(page, 'Message').waitFor();
  const MSG = 'Wi-Fi: SuperHome / पासवर्ड: chai@123 ☕';
  await fv(page, 'Message').fill(MSG); await page.locator('input[aria-label^="Password"]').fill('tiger lily 42');
  await page.getByRole('button', { name: 'Create link' }).click();
  const url = await fv(page, 'Share this link').inputValue({ timeout: 60000 });
  const d = new URL(url).hash.split('?d=')[1];
  ok(url.startsWith(base.replace(/\/$/, '')) && /#\/sharelink\?d=[A-Za-z0-9_-]+$/.test(url), 'link = this site + #/sharelink?d=<base64url>');
  ok(!url.includes('chai') && !decodeURIComponent(url).includes('पासवर्ड') && Buffer.from(d, 'base64url').subarray(0, 8).toString() === 'USODIUM1', 'only ciphertext in the link (USODIUM1)');
  await page.getByRole('button', { name: 'Copy link' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === url, 'copy link');
  const r = await newPage(); const sent = [];
  r.on('request', (q) => sent.push(q.url()));
  await r.goto(url);
  ok(sent.every((u) => !u.includes(d.slice(0, 20))), 'the #fragment is never sent in any request');
  await r.locator('input[aria-label="Password"]').fill('wrong one'); await r.getByRole('button', { name: 'Decrypt' }).click();
  ok(/password|corrupt|tamper/i.test((await r.locator('.toast').last().textContent({ timeout: 30000 })).trim()), 'wrong password refused');
  await r.locator('input[aria-label="Password"]').fill('tiger lily 42'); await r.getByRole('button', { name: 'Decrypt' }).click();
  ok(await fv(r, 'Message').inputValue({ timeout: 60000 }) === MSG, 'recipient decrypts the exact message');
  await r.getByRole('button', { name: 'New message' }).click();
  await r.getByRole('button', { name: 'Create link' }).waitFor();
  ok(true, '"New message" returns to the composer');
  await page.goto(`${base}#/`); await page.goto(`${base}#/sharelink`);
  await fv(page, 'Message').fill(''); await page.locator('input[aria-label^="Password"]').fill('tiger lily 42'); await page.getByRole('button', { name: 'Create link' }).click();
  ok(/Write a message/.test(await toastText()), 'empty message refused');
  await fv(page, 'Message').fill('hi'); await page.locator('input[aria-label^="Password"]').fill('12345'); await page.getByRole('button', { name: 'Create link' }).click();
  ok(/at least 6/.test(await toastText()), 'short password refused');
  const unexpected = [...page.errors, ...r.errors].filter((e) => !/password|corrupt|tamper|Write a message|at least 6/i.test(e));
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/sharelink`); await ph.locator('textarea').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
