// Key Codes (#/keycode, PC only): for real key presses the table shows key / code / legacy keyCode & which / location /
// modifiers / repeat exactly (known values from the UI Events spec), shortcut keys (/ and Ctrl+K) do not jump to the
// search box, recent-keys history (newest first, at most 20), typing in the search box is not captured, copy, clear,
// listener removed on leave, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/keycode`);
  await page.locator('.keycode-big').waitFor(); await page.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => {});
  const props = () => page.$$eval('.card', (cs) => { const t = cs.find((c) => /Event properties/.test(c.textContent)); return Object.fromEntries([...t.querySelectorAll('tr')].map((r) => [r.children[0].textContent, r.children[1].firstChild.textContent])); });
  const hist = () => page.$$eval('.card', (cs) => [...cs.find((c) => /Recent keys/.test(c.textContent)).querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent)));
  const KNOWN = [['KeyA', '"a"', 65, 0], ['Digit7', '"7"', 55, 0], ['Enter', '"Enter"', 13, 0], ['Escape', '"Escape"', 27, 0], ['ArrowUp', '"ArrowUp"', 38, 0], ['F2', '"F2"', 113, 0], ['ShiftLeft', '"Shift"', 16, 1], ['ControlRight', '"Control"', 17, 2], ['NumpadAdd', '"+"', 107, 3], ['Space', '" "', 32, 0], ['Backspace', '"Backspace"', 8, 0], ['Tab', '"Tab"', 9, 0]];
  const bad = [];
  for (const [code, key, kc, loc] of KNOWN) {
    await page.keyboard.press(code); const p = await props();
    if (p['event.code'] !== code || p['event.key'] !== key || p['event.keyCode (legacy)'] !== String(kc) || p['event.which (legacy)'] !== String(kc) || !p['event.location'].startsWith(`${loc} (`)) bad.push(`${code}: ${JSON.stringify(p)}`);
  }
  ok(!bad.length, `${KNOWN.length} keys: key, code, keyCode = which, location ${bad.join('; ')}`);
  ok(await page.locator('.keycode-big').textContent() === 'Tab' && await page.locator('.center.muted').first().textContent() === 'code Tab · keyCode 9', 'big display shows the last key');
  await page.keyboard.press('Control+Shift+KeyM'); let p = await props(); ok(p.Modifiers === 'Ctrl + Shift' && p['event.key'] === '"M"', `Ctrl+Shift+M: modifiers + key "M" (${p.Modifiers} ${p['event.key']})`);
  await page.keyboard.press('Slash'); await page.keyboard.press('Control+KeyK');
  ok(!/search/.test(await page.evaluate(() => document.activeElement.className)) && (await props())['event.code'] === 'KeyK', '/ and Ctrl+K are shown, not swallowed by the search shortcut');
  await page.keyboard.down('KeyR'); await page.keyboard.down('KeyR'); ok((await props())['event.repeat'] === 'true', 'auto-repeat flagged'); await page.keyboard.up('KeyR');
  let h = await hist(); ok(h[0][1] === 'KeyR' && h[1][1] === 'KeyR' && h[2][1] === 'KeyK' && h.length === 20, `recent keys newest first, capped at 20 (${h.length})`);
  const before = (await hist())[0];
  await page.locator('.search-input').focus(); await page.keyboard.type('qr');
  ok(await page.locator('.search-input').inputValue() === 'qr' && JSON.stringify((await hist())[0]) === JSON.stringify(before), 'typing in the search box is not captured');
  await page.locator('.search-input').fill(''); await page.keyboard.press('Escape'); await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('KeyZ'); await page.locator('tr', { hasText: 'event.code' }).getByRole('button', { name: 'Copy' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'KeyZ', 'Copy copies a value');
  await page.getByRole('button', { name: 'Clear', exact: true }).click(); ok((await hist()).length === 0, 'Clear empties the history');
  await page.goto(`${base}#/ascii`); await page.locator('input[aria-label=Filter]').waitFor(); await page.locator('body').click({ position: { x: 5, y: 600 } }); await page.keyboard.press('Slash');
  ok(/search/.test(await page.evaluate(() => document.activeElement.className)), 'after leaving the tab "/" focuses the search again (listener removed)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'keycode');
};
