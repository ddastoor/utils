// Sodium Encrypt, Hash, Password, Passphrase, Share link.
export default async ({ base, page: newPage, ok }) => {
  const page = await newPage();
  await page.goto(base + '#/sodium');
  await page.getByRole('radio', { name: 'Text' }).click();
  await page.locator('textarea').first().fill('hello sodium ✓ नमस्ते');
  const pws = page.locator('input[type=password]');
  await pws.nth(0).fill('correct horse battery'); await pws.nth(1).fill('correct horse battery');
  await page.getByRole('radio', { name: 'Fast (64 MiB)' }).click();
  await page.getByRole('button', { name: 'Encrypt' }).click();
  await page.waitForFunction(() => (document.querySelector('.outbox textarea')?.value || '').length > 80, null, { timeout: 30000 });
  const ct = await page.locator('.outbox textarea').inputValue();
  ok(ct.length > 80, 'sodium: ciphertext produced');
  await page.getByRole('radio', { name: 'Decrypt' }).click();
  await page.locator('textarea').first().fill(ct);
  await pws.nth(0).fill('correct horse battery');
  await page.getByRole('button', { name: 'Decrypt' }).click();
  await page.waitForFunction(() => (document.querySelector('.outbox textarea')?.value || '').includes('hello'), null, { timeout: 30000 });
  ok((await page.locator('.outbox textarea').inputValue()) === 'hello sodium ✓ नमस्ते', 'sodium: round trip');
  await pws.nth(0).fill('wrong');
  await page.getByRole('button', { name: 'Decrypt' }).click();
  await page.waitForSelector('.toast-err', { timeout: 30000 });
  ok(/Wrong password/.test(await page.locator('.toast-err').first().textContent()), 'sodium: wrong password rejected');

  await page.goto(base + '#/hash');
  await page.getByRole('radio', { name: 'Text' }).click();
  await page.locator('textarea[aria-label="Text to hash"]').fill('abc');
  await page.getByRole('button', { name: 'Compute' }).click();
  await page.waitForSelector('.hashval', { timeout: 20000 });
  const vals = await page.locator('.hashval').allTextContents();
  ok(vals.includes('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'), 'hash: SHA-256(abc)');
  ok(vals.includes('900150983cd24fb0d6963f7d28e17f72'), 'hash: MD5(abc)');

  await page.goto(base + '#/password'); await page.waitForSelector('.pw');
  ok((await page.locator('.pw').first().textContent()).length === 20, 'password: default length 20');
  await page.goto(base + '#/passphrase'); await page.waitForSelector('.pw');
  ok((await page.locator('.pw').first().textContent()).split('-').length === 6, 'passphrase: 6 words');

  await page.goto(base + '#/sharelink');
  await page.locator('textarea').first().fill('meet at 5');
  await page.locator('input[type=password]').nth(0).fill('secret123'); await page.locator('input[type=password]').nth(1).fill('secret123');
  await page.getByRole('button', { name: 'Create link' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.outbox textarea')].some((t) => t.value.includes('#/sharelink?d=')), null, { timeout: 30000 });
  const link = await page.locator('.outbox textarea').inputValue();
  const p2 = await newPage();
  await p2.goto(link);
  await p2.locator('input[type=password]').fill('secret123');
  await p2.getByRole('button', { name: 'Decrypt' }).click();
  await p2.waitForFunction(() => document.querySelector('.outbox textarea')?.value === 'meet at 5', null, { timeout: 30000 });
  ok(true, 'sharelink: round trip in a fresh browser context');
  ok(!page.errors.length && !p2.errors.length, 'no console errors ' + [...page.errors, ...p2.errors].join(' | '));
};
