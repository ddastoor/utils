// Encrypted Share Link (#/sharelink): the message lives only in the #fragment (never sent to a server), opens on
// another page with the password, wrong password, Unicode, input checks; links that were cut, changed or are not share
// links are said in words; the password is typed twice; a long link is pointed out.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/sharelink`);
  const toastText = async () => (await page.locator('.toast').last().textContent({ timeout: 30000 })).trim();
  const fv = (pg, l) => pg.locator('.field').filter({ has: pg.locator('.field-label', { hasText: new RegExp(`^${l.replace(/[()]/g, '\\$&')}$`) }) }).locator('textarea').first();
  await fv(page, 'Message').waitFor();
  const MSG = 'Wi-Fi: SuperHome / पासवर्ड: chai@123 ☕';
  const pwBox = page.locator('input[aria-label^="Password"]'), pwAgain = page.locator('input[aria-label="Repeat password"]');
  await fv(page, 'Message').fill(MSG); await pwBox.fill('tiger lily 42'); await pwAgain.fill('tiger lily 4');
  await page.getByRole('button', { name: 'Create link' }).click();
  ok(/passwords do not match/.test(await toastText()), 'the password is typed twice: a slip is caught before the link is made (the recipient could never open it)');
  ok(await pwBox.getAttribute('autocomplete') === 'new-password', 'composer: a new password (the browser may suggest one)');
  await pwAgain.fill('tiger lily 42');
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
  ok(await r.locator('input[aria-label="Password"]').getAttribute('autocomplete') === 'off', 'recipient: the password field is not one the browser offers to make up (it was "new-password")');
  await r.getByRole('button', { name: 'Decrypt' }).click();
  ok(/Enter the password you were given/.test((await r.locator('.toast').last().textContent({ timeout: 30000 })).trim()), 'no password: asked for (it said "Wrong password")');
  await r.locator('input[aria-label="Password"]').fill('wrong one'); await r.getByRole('button', { name: 'Decrypt' }).click();
  ok(await r.locator('.toast', { hasText: 'password is wrong, or the link was cut or changed' }).waitFor({ timeout: 60000 }).then(() => true, () => false), 'wrong password refused, in words for a link');
  await r.getByRole('button', { name: 'Decrypt' }).and(r.locator(':not([disabled])')).waitFor();
  await r.locator('input[aria-label="Password"]').fill('tiger lily 42'); await r.locator('input[aria-label="Password"]').press('Enter');
  ok(await fv(r, 'Message').inputValue({ timeout: 60000 }) === MSG, 'recipient decrypts the exact message (Enter in the password box)');
  // links as they arrive after a trip through other apps
  const tryLink = async (hash) => {
    const q = await newPage(); await q.goto(`${base}${hash}`);
    await q.getByRole('button', { name: 'New message' }).waitFor();
    const err = await q.locator('.note-err').first().textContent({ timeout: 2000 }).catch(() => null);
    let msg = null;
    if (!err) { await q.locator('input[aria-label="Password"]').fill('tiger lily 42'); await q.getByRole('button', { name: 'Decrypt' }).click();
      msg = await Promise.race([fv(q, 'Message').inputValue({ timeout: 60000 }).then((v) => `message: ${v}`), q.locator('.toast').last().textContent({ timeout: 60000 }).then((v) => `toast: ${v.trim()}`)]); }
    const errors = q.errors; await q.close();
    return { err: err?.trim() ?? null, msg, errors };
  };
  { const x = await tryLink(`#/sharelink?d=${d}.`); ok(x.msg === `message: ${MSG}`, 'a link copied with the full stop of its sentence still opens'); }
  { const x = await tryLink(`#/sharelink?d=${d}&utm_source=chat`); ok(x.msg === `message: ${MSG}`, 'a parameter an app added behind it is left aside'); }
  { const x = await tryLink(`#/sharelink?d=${d.slice(0, 50)}!${d.slice(50)}`); ok(/^This link cannot be opened: the link was changed on the way — it holds characters a share link never has \(!\)/.test(x.err) && !x.errors.length, `a damaged link is said in words, no Decrypt button (it was the browser's "Failed to execute 'atob'"): ${x.err}`); }
  { const x = await tryLink(`#/sharelink?d=${d.slice(0, 50)}%E0${d.slice(50)}`); ok(/changed on the way.*\(%\)/.test(x.err) && !x.errors.length, `a broken percent-escape does not stop the tab (decodeURIComponent threw): ${x.err} ${x.errors.join(' | ')}`); }
  { const x = await tryLink(`#/sharelink?d=${d.slice(0, 61)}`); ok(/the link is cut short \(some apps cut long links\)/.test(x.err), `a link cut at a length Base64 cannot have: ${x.err}`); }
  { const x = await tryLink(`#/sharelink?d=${d.slice(0, 60)}`); ok(/the link is cut short/.test(x.err), `a link cut inside the header (it was "Not a Sodium Encrypt file"): ${x.err}`); }
  { const x = await tryLink(`#/sharelink?d=${d.slice(0, -8)}`); ok(/^toast: Could not open the message: the password is wrong, or the link was cut or changed on the way/.test(x.msg), `a link cut inside the message: the right password cannot open it, and the tab says the link may be cut (it said "Wrong password"): ${x.msg}`); }
  { const x = await tryLink('#/sharelink?d=SGVsbG8gd29ybGQ'); ok(/not made by Encrypted Share Link/.test(x.err), `another site's d= parameter: ${x.err}`); }
  { const x = await tryLink('#/sharelink?d='); ok(/the link holds no message/.test(x.err), `an empty d=: ${x.err}`); }
  await r.getByRole('button', { name: 'New message' }).click();
  await r.getByRole('button', { name: 'Create link' }).waitFor();
  ok(true, '"New message" returns to the composer');
  await page.goto(`${base}#/`); await page.goto(`${base}#/sharelink`);
  await fv(page, 'Message').fill(''); await pwBox.fill('tiger lily 42'); await pwAgain.fill('tiger lily 42'); await page.getByRole('button', { name: 'Create link' }).click();
  ok(/Write a message/.test(await toastText()), 'empty message refused');
  await fv(page, 'Message').fill('hi'); await pwBox.fill('12345'); await pwAgain.fill('12345'); await page.getByRole('button', { name: 'Create link' }).click();
  ok(/at least 6/.test(await toastText()), 'short password refused');
  await pwBox.fill('tiger lily 42'); await pwAgain.fill('tiger lily 42'); await page.getByRole('button', { name: 'Create link' }).click();
  await page.waitForFunction(() => /d=/.test([...document.querySelectorAll('textarea')].pop()?.value ?? ''), null, { timeout: 60000 });
  ok(!(await page.locator('.note-warn').count()), 'a short link: no warning');
  await fv(page, 'Message').fill('Long message. '.repeat(120)); await page.getByRole('button', { name: 'Create link' }).click();
  const warn = await page.locator('.note-warn').first().textContent({ timeout: 60000 });
  const long = await fv(page, 'Share this link').inputValue();
  ok(long.length > 2000 && warn.includes(`This link is ${long.length.toLocaleString('en-IN')} characters long`) && /Some apps cut links beyond about 2,000 characters/.test(warn), `a long link is pointed out with its length (a 5,000-character message gave a 6,808-character link and no word): ${warn}`);
  const unexpected = [...page.errors, ...r.errors].filter((e) => !/password|corrupt|tamper|Write a message|at least 6|do not match/i.test(e));
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/sharelink`); await ph.locator('textarea').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
