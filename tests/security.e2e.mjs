// End-to-end checks for Security tools in real Chromium against the production build.
import { preview } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await preview({ preview: { port: 4318 }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && !/Wrong password/.test(m.text()) && errs.push(m.text()));
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };

// Sodium text round trip
await page.goto(base + '#/sodium');
await page.getByRole('radio', { name: 'Text' }).click();
await page.locator('textarea').first().fill('hello sodium ✓ नमस्ते');
const pws = page.locator('input[type=password]');
await pws.nth(0).fill('correct horse battery'); await pws.nth(1).fill('correct horse battery');
await page.getByRole('radio', { name: 'Fast (64 MiB)' }).click();
await page.getByRole('button', { name: 'Encrypt' }).click();
await page.waitForSelector('.outbox textarea', { timeout: 30000 });
const ct = await page.locator('.outbox textarea').inputValue();
ok(ct.length > 80, 'sodium: encrypted text produced');
await page.getByRole('radio', { name: 'Decrypt' }).click();
await page.locator('textarea').first().fill(ct);
await pws.nth(0).fill('correct horse battery');
await page.getByRole('button', { name: 'Decrypt' }).click();
await page.waitForFunction(() => document.querySelectorAll('.outbox textarea').length && document.querySelector('.outbox textarea').value.includes('hello'), null, { timeout: 30000 });
ok((await page.locator('.outbox textarea').inputValue()) === 'hello sodium ✓ नमस्ते', 'sodium: decrypts back to original');
await pws.nth(0).fill('wrong');
await page.getByRole('button', { name: 'Decrypt' }).click();
await page.waitForSelector('.toast-err', { timeout: 30000 });
ok(/Wrong password/.test(await page.locator('.toast-err').first().textContent()), 'sodium: wrong password rejected');

// Hash text
await page.goto(base + '#/hash');
await page.getByRole('radio', { name: 'Text' }).click();
await page.locator('textarea').fill('abc');
await page.getByRole('button', { name: 'Compute' }).click();
await page.waitForSelector('.hashval', { timeout: 20000 });
const vals = await page.locator('.hashval').allTextContents();
ok(vals.includes('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'), 'hash: SHA-256("abc") correct');
ok(vals.includes('900150983cd24fb0d6963f7d28e17f72'), 'hash: MD5("abc") correct');

// Password + passphrase
await page.goto(base + '#/password');
await page.waitForSelector('.pw');
ok((await page.locator('.pw').first().textContent()).length === 20, 'password: 20 chars generated');
await page.goto(base + '#/passphrase');
await page.waitForSelector('.pw');
ok((await page.locator('.pw').first().textContent()).split('-').length === 6, 'passphrase: 6 words generated');

// Share link round trip
await page.goto(base + '#/sharelink');
await page.locator('textarea').first().fill('meet at 5');
await page.locator('input[type=password]').fill('secret123');
await page.getByRole('button', { name: 'Create link' }).click();
await page.waitForFunction(() => [...document.querySelectorAll('.outbox textarea')].some((t) => t.value.includes('#/sharelink?d=')), null, { timeout: 30000 });
const link = await page.locator('.outbox textarea').inputValue();
await page.goto(link); await page.reload();
await page.locator('input[type=password]').fill('secret123');
await page.getByRole('button', { name: 'Decrypt' }).click();
await page.waitForFunction(() => document.querySelector('.outbox textarea')?.value === 'meet at 5', null, { timeout: 30000 });
ok(true, 'sharelink: round trip');

ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close(); server.httpServer.close();
process.exit(fail ? 1 : 0);
