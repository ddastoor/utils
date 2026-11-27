// Number Detective (#/numcheck, PC + phones; potentials #84): the tab end to end — nothing fetched until a number is typed,
// every example read as what it is, several lines at once, a mistyped number with its corrected check digit, the copy
// buttons read back from the clipboard, a label in front ("PAN:"), what it does not know, the text kept while the page is
// open, nothing sent anywhere, WCAG 2.2 A / AA with results in both themes, the phone. The engine's answers themselves are
// held to python-stdnum, libphonenumber, vininfo and the datasets in the unit suite (tests/unit/numcheck.test.mjs).
import { readFileSync } from 'node:fs';
import { phoneLayout } from './_phone.mjs';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/** each example chip → the kind and verdict of the reading that leads, and a word of its summary */
const EXPECT = {
  Aadhaar: ['aadhaar', 'valid', /Verhoeff/], PAN: ['pan', 'format', /individual/], GSTIN: ['gstin', 'valid', /Maharashtra/], IFSC: ['ifsc', 'valid', /State Bank of India/],
  'UPI ID': ['upi', 'format', /Google Pay \(ICICI Bank\)/], 'PIN code': ['pin', 'valid', /Bengaluru Urban, Karnataka/], Phone: ['phone', 'valid', /landline/],
  Vehicle: ['vehicle', 'format', /Maharashtra/], IMEI: ['imei', 'valid', /Luhn/], Card: ['card', 'valid', /Visa/], ISBN: ['isbn', 'valid', /ISBN-13/],
  IBAN: ['iban', 'valid', /United Kingdom/], VIN: ['vin', 'valid', /check digit/],
};

export default async ({ base, page: newPage, ok, devices, info }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  const asked = [];
  page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/numcheck');
  const box = page.getByLabel('Numbers or codes, one a line');
  await box.waitFor();
  await page.waitForTimeout(300);
  ok(!asked.some((u) => /devcore-ids/.test(u)), 'nothing of the engine fetched as the tab opens');
  const lead = () => page.locator('.nd-reading').first();
  const type = async (text) => {
    await box.fill(text);
    await page.waitForFunction((t) => { const out = document.querySelector('.nd-out'); return out && out.dataset.for === t; }, text, { timeout: 30000 });
  };

  // every example: what leads, its verdict
  for (const [chip, [kind, verdict, word]] of Object.entries(EXPECT)) {
    await page.getByRole('button', { name: chip, exact: true }).click();
    await page.waitForFunction((k) => document.querySelector('.nd-reading')?.dataset.kind === k, kind, { timeout: 30000 });
    const r = lead();
    const got = [await r.getAttribute('data-kind'), await r.getAttribute('data-verdict')], text = await r.innerText();
    ok(got[0] === kind && got[1] === verdict && word.test(text), `example “${chip}”: ${got.join(' · ')} — ${text.split('\n').slice(0, 3).join(' / ')}`);
  }
  ok(asked.filter((u) => /devcore-ids/.test(u)).length === 1, 'the engine fetched once, with the first number');

  // several at once: one card each, named by what was typed, and a line that counts them
  await type('PAN: AAAPL1234C\nhello\n560001');
  const heads = await page.locator('.nd-entry > h3').allInnerTexts();
  ok(heads.length === 3 && heads[0] === 'PAN: AAAPL1234C', `three lines → three cards, each named by its line (${heads.join(' | ')})`);
  ok(/3 entries · 2 recognised/.test(await page.locator('[aria-live="polite"]').first().innerText()), 'the line under the box: 3 entries, 2 recognised');
  ok(/not a number or code this tab knows \(5 letters\)/.test(await page.locator('.nd-entry').nth(1).innerText()), 'what it does not know: said, with what the line is made of');

  // a mistyped Aadhaar: the check fails, the right check digit offered and copied
  await type('2341 2341 2347');
  ok((await lead().getAttribute('data-verdict')) === 'invalid' && /should be 6, not 7/.test(await lead().innerText()), 'a mistyped Aadhaar number: “the last one should be 6, not 7”');
  await lead().getByRole('button', { name: 'Copy 234123412346' }).click();
  ok((await page.evaluate(() => navigator.clipboard.readText())) === '234123412346', 'the corrected number copied');
  await type('4111111111111111');
  await lead().getByRole('button', { name: 'Copy 4111 1111 1111 1111' }).click();
  ok((await page.evaluate(() => navigator.clipboard.readText())) === '4111 1111 1111 1111', 'Copy gives the number as shown, grouped as the network prints it');

  // ranking: ten bare digits are a mobile number first; the same digits with hyphens an ISBN
  await type('8173711461');
  const kinds = await page.locator('.nd-reading').evaluateAll((els) => els.map((e) => e.dataset.kind));
  ok(kinds[0] === 'phone' && kinds.includes('isbn') && /Most likely/.test(await lead().innerText()) && /Could also be/.test(await page.locator('.nd-reading').nth(1).innerText()), `ten bare digits: a phone number most likely, could also be an ISBN (${kinds.join(', ')})`);
  await type('81-7371-146-1');
  ok((await lead().getAttribute('data-kind')) === 'isbn', 'with its hyphens: an ISBN first');

  // nothing typed leaves the device
  const hosts = new Set(asked.map((u) => new URL(u).host));
  ok([...hosts].every((h) => h === new URL(base).host), `nothing sent anywhere: every request to this site (${[...hosts].join(', ')})`);

  // kept while the page is open: another tab and back
  await type('IFSC: HDFC0000001');
  await page.goto(base + '#/qr'); await page.locator('.tool-body').first().waitFor();
  await page.goto(base + '#/numcheck');
  await page.getByLabel('Numbers or codes, one a line').waitFor();
  await page.waitForFunction(() => document.querySelector('.nd-reading')?.dataset.kind === 'ifsc', null, { timeout: 30000 });
  ok((await page.getByLabel('Numbers or codes, one a line').inputValue()) === 'IFSC: HDFC0000001', 'the text and its answer kept while the page is open (another tab and back)');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with results, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/numcheck'); // a fresh page: no colour still changing over from the other theme
    const b = ax.getByLabel('Numbers or codes, one a line'); await b.waitFor();
    await b.fill('2341 2341 2347\n8173711461\nGB82 WEST 1234 5698 7654 32\nhello');
    await ax.locator('.nd-entry').nth(3).waitFor({ timeout: 30000 });
    await ax.waitForFunction(() => !document.getAnimations().length);
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, results shown: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'numcheck', {
    ready: '.nd-examples', buttons: ['Aadhaar', 'IFSC'],
    before: async (p) => { await p.getByRole('button', { name: 'GSTIN', exact: true }).click(); await p.waitForFunction(() => document.querySelector('.nd-reading')?.dataset.kind === 'gstin', null, { timeout: 30000 }); },
  });
  const small = await ph.locator('.nd-out button').evaluateAll((els) => els.filter((e) => e.getClientRects().length && (e.getBoundingClientRect().height < 44 || e.getBoundingClientRect().width < 44)).length);
  ok(!small, `phone: every button of the results at least 44 × 44 px (${small} smaller)`);
  info('the engine’s answers are held to stdnum, libphonenumber and the datasets in tests/unit/numcheck.test.mjs');
};
