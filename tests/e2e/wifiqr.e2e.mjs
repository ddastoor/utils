// Router Sticker → Wi-Fi QR (#/wifiqr, PC + phones; potentials #88) end to end on the router photos of tests/fixtures/snaps
// (scripts/make-snap-photos.py): each label read by the tab — its networks and password as printed, what is not the Wi-Fi password
// set aside, a QR code on the label read exactly, a photo taken with the phone held sideways — and the code it makes read back by
// zbar (zbarimg), the independent reader: the QR's PNG and the guests' card. Then: editing the boxes changes the code, a photo
// without a label, a network typed by hand, leaving mid-reading, WCAG 2.2 A / AA in both themes, the phone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/snaps/${n}`, import.meta.url));
const IMG = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

export default async ({ base, page: newPage, ok, tmp, devices }) => {
  const zbar = (path) => { const r = spawnSync('zbarimg', ['-q', '--raw', path], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : r.error ? null : ''; };
  const saved = async (page, click) => { const d = page.waitForEvent('download', { timeout: 60000 }); await click(); const dl = await d; const p = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(p); return [p, dl.suggestedFilename()]; };
  /** the photo given to the tab, and its reading waited for (the tab counts its readings in data-reads) */
  const reads = (page) => page.evaluate(() => +(document.querySelector('.tool-body [data-reads], [data-reads]')?.getAttribute('data-reads') || 0));
  const read = async (page, name, file = F(name)) => {
    const n = await reads(page);
    await page.locator('input[type=file]').first().setInputFiles(file);
    await page.waitForFunction((k) => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0) > k, n, { timeout: 180000 });
    return page.locator('.wq-net').evaluateAll((els) => els.map((e) => ({ title: e.querySelector('.wq-title')?.textContent, ssid: e.querySelectorAll('input')[0]?.value, pass: e.querySelectorAll('input')[1]?.value })));
  };
  const pairs = (nets) => nets.map((n) => `${n.ssid} / ${n.pass}`).sort();
  const want = (k) => TRUTH[k].networks.map((n) => `${n.ssid} / ${n.password}`).sort();

  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/wifiqr');
  await page.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  const early = asked.filter((u) => /\.wasm(\?|$)|\/vendor\/|\/models\/|\/data\//.test(u));
  ok(!early.length, `nothing heavy fetched as the tab opens — the OCR and zxing-cpp come with the first photo ${early.join(' ')}`);

  // ---- a label with two bands and an admin login under the Wi-Fi password
  const b = await read(page, 'router-b.jpg');
  ok(JSON.stringify(pairs(b)) === JSON.stringify(want('router-b')), `router-b: both networks with the Wi-Fi password (${pairs(b).join(', ')})`);
  ok(/5 GHz/.test(b.map((n) => n.title).join(' ')) && /read from the label/.test(b[0].title), 'the 5 GHz network named; read from the label, to check');
  const aside = await page.locator('.wq-skip').innerText();
  ok(/Fiber@2026/.test(aside) && /login password/.test(aside) && !b.some((n) => n.pass === 'Fiber@2026'), 'the admin password set aside as the router’s own login, never taken for the Wi-Fi password');
  const [png, pngName] = await saved(page, () => page.locator('.wq-net').first().getByRole('button', { name: 'Save QR (PNG)' }).click());
  const code = zbar(png);
  if (code === null) ok(true, 'zbarimg is not installed — skipped');
  else ok(code === 'WIFI:T:WPA;S:HomeFiber-qx29;P:kT7mq2Vr9w;;' && pngName === 'HomeFiber-qx29-wifi-qr.png', `zbar reads the QR: ${code} (${pngName})`);
  const [cardPng] = await saved(page, () => page.locator('.wq-net').first().getByRole('button', { name: 'Card for guests' }).click());
  if (code !== null) ok(zbar(cardPng) === 'WIFI:T:WPA;S:HomeFiber-qx29;P:kT7mq2Vr9w;;', 'zbar reads the guests’ card too');
  // the boxes change the code
  await page.locator('.wq-net').first().locator('input').nth(1).fill('new-pass-2026');
  await page.waitForTimeout(400);
  const [png2] = await saved(page, () => page.locator('.wq-net').first().getByRole('button', { name: 'Save QR (PNG)' }).click());
  if (code !== null) ok(zbar(png2) === 'WIFI:T:WPA;S:HomeFiber-qx29;P:new-pass-2026;;', 'a password typed over the reading: the code follows it');
  await page.locator('.wq-net').first().getByRole('radio', { name: 'No password' }).click();
  await page.waitForTimeout(400);
  const [png3] = await saved(page, () => page.locator('.wq-net').first().getByRole('button', { name: 'Save QR (PNG)' }).click());
  if (code !== null) ok(zbar(png3) === 'WIFI:T:nopass;S:HomeFiber-qx29;;', 'No password: an open network’s code');

  // ---- labels as other routers print them
  const c = await read(page, 'router-c.jpg');
  const asideC = await page.locator('.wq-skip').innerText();
  ok(JSON.stringify(pairs(c)) === JSON.stringify(want('router-c')) && /31948627/.test(asideC) && /WPS PIN/.test(asideC) && /routerlogin\.net/.test(asideC), `router-c: Network Name (SSID) / Network Key (Password); the WPS PIN and the login set aside (${pairs(c).join(', ')})`);
  const d = await read(page, 'router-d.jpg');
  ok(JSON.stringify(pairs(d)) === JSON.stringify(want('router-d')) && /from the label’s QR code/.test(d[0].title), `router-d: the label's QR code read exactly, the 5 GHz network from its text (${pairs(d).join(', ')})`);
  ok(/QR code \(exact\)/.test(await page.locator('.tool-body').innerText()), 'the line says the QR code was read exactly');
  const s = await read(page, 'router-a-sideways.jpg');
  ok(JSON.stringify(pairs(s)) === JSON.stringify(want('router-a-sideways')), `the phone held sideways: the label set upright and read (${pairs(s).join(', ')})`);
  ok(/192\.168\.0\.1/.test(await page.locator('.wq-skip').innerText()), 'the settings page’s address set aside');

  // ---- a photo without a label; a network typed by hand
  await read(page, 'coffee.jpg', IMG('coffee.jpg'));
  ok(/No Wi-Fi network name or password was found/.test(await page.locator('.tool-body').innerText()), 'a photo without a label: said, with what to do');
  await page.getByRole('button', { name: 'Add a network by hand' }).click();
  await page.locator('.wq-net').first().locator('input').nth(0).fill('Guest Room');
  await page.locator('.wq-net').first().locator('input').nth(1).fill('welcome2026');
  await page.waitForTimeout(400);
  const [png4] = await saved(page, () => page.locator('.wq-net').first().getByRole('button', { name: 'Save QR (PNG)' }).click());
  if (code !== null) ok(zbar(png4) === 'WIFI:T:WPA;S:Guest Room;P:welcome2026;;', 'a network typed by hand: its code');
  await page.locator('.wq-net').first().locator('input').nth(1).fill('short');
  await page.waitForTimeout(300);
  ok(/has 5 characters; a Wi-Fi \(WPA\) password has at least 8/.test(await page.locator('.wq-net').first().innerText()), 'a WPA password under 8 characters is pointed out');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- leaving mid-reading
  const lv = await newPage();
  await lv.goto(base + '#/wifiqr'); await lv.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await lv.locator('input[type=file]').first().setInputFiles(F('router-a.jpg'));
  await lv.waitForTimeout(1500);
  await lv.goto(base + '#/qr'); await lv.waitForTimeout(1500);
  ok(!lv.errors.length, `leaving the tab while it reads: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with a result, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/wifiqr');
    await ax.locator('input[type=file]').first().waitFor({ state: 'attached' });
    await read(ax, 'router-c.jpg');
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, with a result: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone
  await phoneLayout({ base, page: newPage, devices, ok }, 'wifiqr', { ready: '.drop', buttons: ['Save QR (PNG)', 'Card for guests'], before: async (p) => { await read(p, 'router-a.jpg'); } });
};
