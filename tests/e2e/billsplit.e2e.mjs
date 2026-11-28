// Bill Splitter by Photo (#/billsplit, PC + phones; potentials #78) end to end on the restaurant bill of tests/fixtures/snaps
// (scripts/make-snap-photos.py): the bill read — every item, the sub total, service charge, CGST, SGST, the round-off and the total, "the
// bill adds up" —; three people, everyone had everything, then a tap on who did not have an item; the shares in whole paise adding up to
// the bill to the paisa, each within a paisa of the exact share worked out here; a tip; the UPI codes for the others to pay the one who paid read back by zbar
// (zbarimg) — the payee, the amount; an amount changed by hand said not to add up; the split copied as text; a person added and removed;
// a bill typed by hand; leaving mid-reading; WCAG 2.2 A / AA in both themes; the phone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/snaps/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8')).restaurant;
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const paise = (s) => Math.round(+s.replace(/[₹,\s]/g, '').replace('−', '-') * 100);

export default async ({ base, page: newPage, ok, tmp, devices }) => {
  const zbar = (path) => { const r = spawnSync('zbarimg', ['-q', '--raw', path], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : r.error ? null : ''; };
  const saved = async (page, click) => { const d = page.waitForEvent('download', { timeout: 60000 }); await click(); const dl = await d; const p = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(p); return [p, dl.suggestedFilename()]; };
  const reads = (page) => page.evaluate(() => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0));
  const read = async (page, name) => {
    const n = await reads(page);
    await page.locator('input[type=file]').first().setInputFiles(F(name));
    await page.waitForFunction((k) => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0) > k, n, { timeout: 180000 });
    await page.waitForTimeout(400);
  };
  const shares = async (page) => { await page.waitForTimeout(400); return page.locator('.bs-share').evaluateAll((els) => els.map((e) => ({ name: e.querySelector('.bs-head strong').textContent, total: e.querySelector('.bs-total-p').textContent }))); };
  const sum = (s) => s.reduce((t, x) => t + paise(x.total), 0);

  const page = await newPage({ viewport: { width: 1280, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/billsplit');
  await page.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  const early = asked.filter((u) => /\.wasm(\?|$)|\/vendor\/|\/models\/|\/data\//.test(u));
  ok(!early.length, `nothing heavy fetched as the tab opens — the OCR and mathcore come with the first photo ${early.join(' ')}`);

  // ---- the bill read
  await read(page, 'restaurant.jpg');
  const items = await page.locator('.bs-item').evaluateAll((els) => els.map((e) => [e.querySelector('input[aria-label="Item"]').value, e.querySelector('.bs-amt').value]));
  ok(JSON.stringify(items) === JSON.stringify(TRUTH.items.map(([n, , a]) => [n, a.toFixed(2)])), `every item and its amount ${JSON.stringify(items)}`);
  const body = await page.locator('.tool-body').innerText();
  ok(/The bill adds up: the items and the charges make ₹1,907\.00/.test(body) && /6 items read, the total ₹1,907\.00/.test(body), 'the charges and the total read; the bill adds up — said');
  // ---- everyone had everything: three equal shares, adding up to the paisa
  let s = await shares(page);
  ok(s.length === 3 && sum(s) === 190700 && Math.max(...s.map((x) => paise(x.total))) - Math.min(...s.map((x) => paise(x.total))) <= 1, `three shares of ₹1,907.00, a paisa apart at most ${JSON.stringify(s)}`);
  // ---- names; Friend 2 had no Paneer Tikka; the share follows
  const ppl = page.locator('.bs-people input');
  await ppl.nth(1).fill('Asha'); await ppl.nth(2).fill('Ravi');
  await page.locator('.bs-item').first().getByRole('button', { name: 'Ravi', exact: true }).click();
  s = await shares(page);
  // Paneer Tikka ₹320 between Me and Asha; the rest three ways; the charges in proportion — worked out here in exact fractions
  const itemsOf = (who) => TRUTH.items.reduce((t, [, , a], i) => t + (i === 0 ? (who === 2 ? 0 : a * 100 / 2) : a * 100 / 3), 0);
  const charges = 190700 - 173000;
  const exact = [0, 1, 2].map((k) => itemsOf(k) + charges * itemsOf(k) / 173000);
  ok(sum(s) === 190700 && s.every((x, k) => Math.abs(paise(x.total) - exact[k]) < 1) && s[2].name === 'Ravi' && paise(s[2].total) < paise(s[0].total),
    `Ravi without the Paneer Tikka: each share within a paisa of the exact one (${exact.map((x) => (x / 100).toFixed(4)).join(', ')}), adding up to ₹1,907.00 ${JSON.stringify(s)}`);
  // ---- the payer's UPI ID: codes for the others
  await page.getByLabel('UPI ID of the one who paid').fill('me@ybl');
  await page.waitForTimeout(800);
  const asha = page.locator('.bs-share', { hasText: 'Asha' });
  const [png] = await saved(page, () => asha.getByRole('button', { name: 'Save QR (PNG)' }).click());
  const code = zbar(png);
  if (code === null) ok(true, 'zbarimg is not installed — skipped');
  else {
    const u = new URL(code.replace('upi://', 'http://x/'));
    ok(u.searchParams.get('pa') === 'me@ybl' && u.searchParams.get('pn') === 'Me' && Math.round(+u.searchParams.get('am') * 100) === paise(s[1].total) && u.searchParams.get('cu') === 'INR',
      `zbar reads Asha's code: pay me@ybl (Me) exactly her share ${code}`);
  }
  ok((await page.locator('.bs-share', { hasText: 'Me' }).first().locator('.bs-code').count()) === 0, 'no code for the one who paid');
  // ---- a tip of 10 %
  await page.getByRole('radio', { name: '10 %' }).click();
  s = await shares(page);
  ok(sum(s) === 190700 + 19070, `a tip of 10 %: the shares make ₹2,097.70 ${sum(s)}`);
  await page.getByRole('radio', { name: 'None' }).click();
  // ---- the split as text
  await page.getByRole('button', { name: 'Copy the split' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  ok(/^SPICE GARDEN RESTAURANT, 27\/11\/2026 — ₹1,907\.00 in all\nMe: ₹[\d,.]+ \(paid\)\nAsha: ₹[\d,.]+\nRavi: ₹[\d,.]+\nPay Me — UPI me@ybl$/.test(text), `the split copied as text ${JSON.stringify(text)}`);
  // ---- an amount changed: the bill no longer adds up, said
  await page.locator('.bs-item').nth(1).locator('.bs-amt').fill('290.00');
  await page.waitForTimeout(400);
  ok(/Butter Naan: 4 × ₹60\.00 is ₹240\.00/.test(await page.locator('.tool-body').innerText()) || /The items add up to ₹1,780\.00, the sub total says ₹1,730\.00/.test(await page.locator('.tool-body').innerText()), 'an amount that no longer adds up: said');
  // ---- a person added, removed
  await page.getByRole('button', { name: 'Add a person' }).click();
  s = await shares(page);
  ok(s.length === 4, 'a fourth person');
  await page.getByRole('button', { name: /^Remove Friend 3$/ }).click();
  ok((await shares(page)).length === 3, 'removed again');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- a bill typed by hand
  const hand = await newPage({ viewport: { width: 1280, height: 900 } });
  await hand.goto(base + '#/billsplit'); await hand.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await hand.getByRole('button', { name: 'Type the bill by hand' }).click();
  await hand.locator('.bs-item input[aria-label="Item"]').fill('Pizza');
  await hand.locator('.bs-item .bs-amt').fill('1000');
  ok(sum(await shares(hand)) === 100000 && (await shares(hand)).length === 3, 'a bill typed by hand: ₹1,000 three ways');

  // ---- leaving mid-reading
  const lv = await newPage();
  await lv.goto(base + '#/billsplit'); await lv.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await lv.locator('input[type=file]').first().setInputFiles(F('restaurant.jpg'));
  await lv.waitForTimeout(1500);
  await lv.goto(base + '#/tip'); await lv.waitForTimeout(1500);
  ok(!lv.errors.length, `leaving the tab while it reads: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with a split, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/billsplit');
    await ax.locator('input[type=file]').first().waitFor({ state: 'attached' });
    await read(ax, 'restaurant.jpg');
    await ax.getByLabel('UPI ID of the one who paid').fill('me@ybl'); await ax.waitForTimeout(600);
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, with a split: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone
  await phoneLayout({ base, page: newPage, devices, ok }, 'billsplit', { ready: '.drop', buttons: ['Copy the split'], before: async (p) => { await read(p, 'restaurant.jpg'); } });
};
