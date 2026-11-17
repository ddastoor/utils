// Keyboard Test (#/keyboard, PC only): 78-key layout with the right labels, keys light up (hit) and show held (down)
// until released, "n of 78 keys tested", the last-event table (key / code / keyCode / location left-right / modifiers /
// repeat), browser shortcuts are swallowed while the keyboard has focus (F5 does not reload, Tab does not leave), keys
// typed elsewhere are ignored, unknown keys still reported, Reset, listeners removed on leave, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
const ROWS = [
  ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
  ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
  ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
  ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'],
];
const N = ROWS.flat().length; // 78
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/keyboard`);
  await page.locator('.kb').waitFor();
  const last = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv > *')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  const hits = () => page.$$eval('.kb-key.hit', (k) => k.map((e) => [...e.classList].find((c) => /^kb-[A-Z]/.test(c)).slice(3)));
  const tested = () => page.locator('.tool-body .card .muted').first().textContent();
  const labels = await page.$$eval('.kb-row', (rs) => rs.map((r) => [...r.children].map((k) => k.textContent)));
  ok(labels.map((r) => r.length).join() === ROWS.map((r) => r.length).join() && labels.flat().length === N, `${N} keys in 6 rows`);
  const want = { Escape: 'Esc', Backquote: '`', Digit1: '1', Minus: '-', Equal: '=', KeyQ: 'Q', BracketLeft: '[', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Slash: '/', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', MetaLeft: 'Win', ContextMenu: 'Menu', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', ArrowRight: '→', Space: 'Space', F12: 'F12' };
  const flat = ROWS.flat(), lab = labels.flat();
  const bad = Object.entries(want).filter(([c, l]) => lab[flat.indexOf(c)] !== l);
  ok(!bad.length, `key labels (${bad.map(([c, l]) => `${c}: "${lab[flat.indexOf(c)]}" ≠ "${l}"`).join(', ') || 'all right'})`);
  await page.waitForFunction(() => document.activeElement?.classList.contains('kb'), null, { timeout: 5000 }).catch(() => {}); // the tab focuses the keyboard a moment after it is drawn
  ok(await page.evaluate(() => document.activeElement.classList.contains('kb')), 'the keyboard has focus on open');
  await page.keyboard.press('KeyA');
  let e = await last(); ok(e.key === '"a"' && e.code === 'KeyA' && e.keyCode === '65' && e.location === '0' && e.modifiers === 'none' && e.repeat === 'false', `A: key "a", code KeyA, keyCode 65 (${JSON.stringify(e)})`);
  ok(JSON.stringify(await hits()) === '["KeyA"]' && await tested() === `1 of ${N} keys tested`, `A lights up, "1 of ${N} keys tested"`);
  await page.keyboard.down('ShiftRight'); e = await last();
  ok(e.code === 'ShiftRight' && e.location === '2' && e.key === '"Shift"' && e.keyCode === '16', `right Shift: location 2 (${e.location})`);
  ok(await page.locator('.kb-ShiftRight').evaluate((k) => k.classList.contains('down')), 'a held key shows as pressed');
  await page.keyboard.press('KeyB'); e = await last(); ok(e.key === '"B"' && e.modifiers === 'Shift', `Shift+B → "B", modifiers Shift (${e.key} ${e.modifiers})`);
  await page.keyboard.up('ShiftRight'); ok(!await page.locator('.kb-ShiftRight').evaluate((k) => k.classList.contains('down')) && await page.locator('.kb-ShiftRight').evaluate((k) => k.classList.contains('hit')), 'released: no longer pressed, stays tested');
  await page.keyboard.press('ShiftLeft'); ok((await last()).location === '1', 'left Shift: location 1');
  await page.keyboard.down('ControlLeft'); await page.keyboard.down('AltLeft'); await page.keyboard.press('KeyK');
  e = await last(); ok(e.modifiers === 'Ctrl + Alt' && e.code === 'KeyK', `Ctrl+Alt+K modifiers (${e.modifiers})`);
  await page.keyboard.up('AltLeft'); await page.keyboard.up('ControlLeft');
  await page.keyboard.press('Control+KeyK'); await page.keyboard.press('Slash');
  ok(await page.evaluate(() => document.activeElement.classList.contains('kb')) && (await last()).code === 'Slash', 'Ctrl+K and / are tested keys here — they do not jump to the search box (they did)');
  await page.keyboard.down('KeyR'); await page.keyboard.down('KeyR'); e = await last(); ok(e.repeat === 'true', `held key repeats: repeat true (${e.repeat})`); await page.keyboard.up('KeyR');
  const url = page.url(), marker = await page.evaluate(() => (window.__marker = Math.random()));
  await page.keyboard.press('F5'); await page.waitForTimeout(300);
  ok(page.url() === url && await page.evaluate(() => window.__marker) === marker && (await last()).code === 'F5', 'F5 is captured, the page does not reload');
  await page.keyboard.press('Tab'); ok(await page.evaluate(() => document.activeElement.classList.contains('kb')) && (await last()).code === 'Tab', 'Tab is captured, focus stays on the keyboard');
  await page.keyboard.press('Numpad5'); e = await last(); ok(e.code === 'Numpad5' && e.location === '3', 'keys not drawn (Numpad 5) still reported, location 3');
  const all = ROWS.flat();
  for (const k of all) await page.keyboard.press(k === 'Space' ? ' ' : k).catch(() => {});
  const h = await hits(); const missing = all.filter((k) => !h.includes(k));
  ok(await tested() === `${N - missing.length} of ${N} keys tested` && missing.length <= 2, `every key registers (${await tested()}; not delivered by the test driver: ${missing.join(', ') || 'none'})`);
  ok(await page.locator('.kb-key.down').count() === 0, 'no key left stuck after release');
  // typing somewhere else is ignored (and not swallowed)
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  ok(await page.locator('.kb-key.hit').count() === 0 && await tested() === '' && await page.evaluate(() => document.activeElement.classList.contains('kb')), 'Reset clears every key and refocuses the keyboard');
  const search = page.locator('.search-input').first();
  if (await search.count()) {
    await search.focus(); await page.keyboard.type('qr');
    ok(await search.inputValue() === 'qr' && await page.locator('.kb-key.hit').count() === 0, 'typing in the search box is not captured');
    await search.fill(''); await page.keyboard.press('Escape');
  }
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor();
  await page.keyboard.press('KeyA'); await page.keyboard.press('F5').catch(() => {}); await page.waitForTimeout(300);
  ok(!page.errors.length, `no page errors (listeners removed on leave) ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'keyboard');
};
