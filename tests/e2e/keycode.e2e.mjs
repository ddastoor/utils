// Key Codes (#/keycode, PC only): for real key presses the table shows key / code / legacy keyCode & which / location /
// modifiers / repeat exactly (known values from the UI Events spec), shortcut keys (/ and Ctrl+K) do not jump to the
// search box, recent-keys history (newest first, at most 20), typing in the search box is not captured, copy, clear,
// Tab still moves the focus and Enter / Space still press a focused button (no keyboard trap), the browser's own keys
// (F5, Ctrl+R, Ctrl+L, Alt+←) are not blocked while page keys (Space, arrows, Backspace, /) are held back, AltGr,
// listener removed on leave, phone note. Key combinations as one (to-do #26: "When I press alt+W, I'm not getting the
// alt+W code"): Alt + W, Ctrl + Shift + K as one row of the recent keys, a modifier alone, AltGr as Windows sends it, the
// forms people paste (Alt+W, alt+w, the JavaScript test, what a terminal receives), Windows' lone Alt, on Linux, Windows
// and the Mac.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { asOS } from './_os.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await asOS(page, 'linux'); await page.goto(`${base}#/keycode`);
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
  for (const k of ['KeyB', 'KeyC', 'KeyD', 'KeyE']) await page.keyboard.press(k); // enough keys for the list's cap below (a combination is one row now)
  ok(await page.locator('.keycode-big').textContent() === 'E' || await page.locator('.keycode-big').textContent() === 'e', 'big display shows the last key');
  await page.keyboard.press('Tab');
  ok(await page.locator('.keycode-big').textContent() === 'Tab' && await page.locator('.center.muted').first().textContent() === 'code Tab · keyCode 9', 'big display shows the last key (Tab)');
  await page.keyboard.press('Control+Shift+KeyM'); let p = await props(); ok(p.Modifiers === 'Ctrl + Shift' && p['event.key'] === '"M"', `Ctrl+Shift+M: modifiers + key "M" (${p.Modifiers} ${p['event.key']})`);
  await page.keyboard.press('Slash'); await page.keyboard.press('Control+KeyK');
  ok(!/search/.test(await page.evaluate(() => document.activeElement.className)) && (await props())['event.code'] === 'KeyK', '/ and Ctrl+K are shown, not swallowed by the search shortcut');
  await page.keyboard.down('KeyR'); await page.keyboard.down('KeyR'); ok((await props())['event.repeat'] === 'true', 'auto-repeat flagged'); await page.keyboard.up('KeyR');
  let h = await hist(); ok(h[0][2] === 'KeyR' && h[1][2] === 'KeyR' && h[2][2] === 'KeyK' && h[2][0] === 'Ctrl + K' && h.length === 20, `recent keys newest first, capped at 20, Ctrl + K one row (${h.length}: ${h.slice(0, 3).map((r) => r[0]).join(', ')})`);
  const before = (await hist())[0];
  await page.locator('.search-input').focus(); await page.keyboard.type('qr');
  ok(await page.locator('.search-input').inputValue() === 'qr' && JSON.stringify((await hist())[0]) === JSON.stringify(before), 'typing in the search box is not captured');
  await page.locator('.search-input').fill(''); await page.keyboard.press('Escape'); await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('KeyZ'); await page.locator('tr', { hasText: 'event.code' }).getByRole('button', { name: 'Copy' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'KeyZ', 'Copy copies a value');
  await page.getByRole('button', { name: 'Clear', exact: true }).click(); ok((await hist()).length === 0, 'Clear empties the history');
  // which keys the tab holds back (so the page does not scroll or go back) and which it leaves to the browser
  const held = (init) => page.evaluate((i) => { const e = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...i }); document.body.dispatchEvent(e); return e.defaultPrevented; }, init);
  const HELD = [[{ key: 'a', code: 'KeyA' }, true], [{ key: ' ', code: 'Space' }, true], [{ key: 'ArrowDown', code: 'ArrowDown' }, true], [{ key: 'Backspace', code: 'Backspace' }, true], [{ key: '/', code: 'Slash' }, true], [{ key: 'PageDown', code: 'PageDown' }, true],
    [{ key: 'k', code: 'KeyK', ctrlKey: true }, true], [{ key: 's', code: 'KeyS', ctrlKey: true }, true], [{ key: 'Tab', code: 'Tab' }, false], [{ key: 'Tab', code: 'Tab', shiftKey: true }, false], [{ key: 'F5', code: 'F5' }, false], [{ key: 'F12', code: 'F12' }, false],
    [{ key: 'r', code: 'KeyR', ctrlKey: true }, false], [{ key: 'l', code: 'KeyL', ctrlKey: true }, false], [{ key: 't', code: 'KeyT', ctrlKey: true }, false], [{ key: 'w', code: 'KeyW', metaKey: true }, false], [{ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }, false], [{ key: 'Home', code: 'Home', altKey: true }, false]];
  const wrong = []; for (const [init, want] of HELD) if (await held(init) !== want) wrong.push(`${init.ctrlKey ? 'Ctrl+' : ''}${init.metaKey ? 'Meta+' : ''}${init.altKey ? 'Alt+' : ''}${init.key}`);
  ok(!wrong.length, `${HELD.length} keys: letters, Space, arrows, Backspace, "/" and the app's shortcuts are held back; Tab, F-keys, Ctrl+R / L / T, Meta+W and Alt+← are left to the browser ${wrong.join(', ')}`);
  ok((await props())['event.key'] === '"Home"' && (await props()).Modifiers === 'Alt', 'keys left to the browser are still shown');
  // no keyboard trap: Tab walks through the page, Enter and Space press the focused button
  const seen = new Set(); for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); seen.add(await page.evaluate(() => `${document.activeElement.tagName}:${(document.activeElement.textContent || document.activeElement.getAttribute('aria-label') || '').slice(0, 24)}`)); }
  ok(seen.size >= 5 && (await props())['event.key'] === '"Tab"', `Tab moves the focus through the page (${seen.size} different elements) and is still shown — it used to be swallowed`);
  await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyW'); ok((await hist()).length >= 2, 'keys recorded');
  await page.getByRole('button', { name: 'Clear', exact: true }).focus(); await page.keyboard.press('Enter');
  ok((await hist()).length === 0, 'Enter on the focused Clear button clears the list (it used to be recorded instead)');
  await page.keyboard.press('KeyZ'); await page.locator('tr', { hasText: 'event.code' }).getByRole('button', { name: 'Copy' }).focus(); await page.keyboard.press('Space');
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'Space' || (await page.evaluate(() => navigator.clipboard.readText())) === 'KeyZ', 'Space on the focused Copy button copies');
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: '@', code: 'KeyQ', ctrlKey: true, altKey: true, modifierAltGraph: true, cancelable: true, bubbles: true }); document.body.dispatchEvent(e); });
  ok((await props()).Modifiers === 'AltGr' && (await props())['event.key'] === '"@"', 'AltGr+Q is shown as AltGr (not Ctrl + Alt)');
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Dead', code: 'BracketLeft', bubbles: true, cancelable: true })));
  ok(await page.locator('.keycode-big').textContent() === 'Dead' && (await props())['event.code'] === 'BracketLeft', 'a dead key (accent) is named');
  await page.keyboard.press('Space'); ok(await page.locator('.keycode-big').textContent() === 'Space' && (await props())['event.key'] === '" "', 'Space is spelled out in the big display');

  // ---- combinations as one, and the forms people paste (to-do #26)
  const open = async (os) => { const p = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await asOS(p, os); await p.goto(`${base}#/keycode`); await p.locator('.keycode-big').waitFor(); await p.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => {}); return p; };
  const read = (p) => p.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')], title = (c) => c.querySelector('.card-title')?.textContent || '';
    const f = cards.find((c) => title(c) === 'As a shortcut'), r = cards.find((c) => /Recent keys/.test(c.textContent));
    return { big: document.querySelector('.keycode-big').textContent, sub: document.querySelector('.center.muted').textContent,
      forms: f && !f.hidden ? Object.fromEntries([...f.querySelectorAll('tr')].map((tr) => [tr.children[0].firstChild.textContent, tr.children[1].firstChild.textContent])) : null,
      rows: [...r.querySelectorAll('tbody tr')].map((tr) => tr.children[0].textContent) };
  });
  const L = await open('linux');
  ok((await read(L)).forms === null, 'the shortcut forms appear with the first key');
  await L.keyboard.press('Alt+KeyW');
  let r = await read(L);
  ok(r.big === 'Alt + W' && r.sub === 'code KeyW · keyCode 87', `Alt+W is shown as one combination: "${r.big}" (${r.sub}) — it showed "Alt", then "w"`);
  ok(r.forms?.Shortcut === 'Alt+W' && r.forms['VS Code, hotkeys'] === 'alt+w' && r.forms.JavaScript === "e.altKey && e.code === 'KeyW'" && r.forms['A terminal receives'] === 'Esc w (1b 77)', `the forms people paste: ${JSON.stringify(r.forms)}`);
  ok(JSON.stringify(r.rows) === JSON.stringify(['Alt + W']), `recent keys: one row — the Alt row is taken over by the combination it started (${r.rows.join(' | ')})`);
  await L.keyboard.press('Control+Shift+KeyK'); r = await read(L);
  ok(r.big === 'Ctrl + Shift + K' && JSON.stringify(r.rows) === JSON.stringify(['Ctrl + Shift + K', 'Alt + W']) && /^nothing — /.test(r.forms['A terminal receives'] ?? ''), `Ctrl + Shift + K: one row; a terminal gets nothing for it (${r.rows.join(' | ')}; ${r.forms['A terminal receives']})`);
  await L.keyboard.press('ShiftLeft'); r = await read(L);
  ok(r.big === 'Shift' && r.forms.JavaScript === "e.key === 'Shift'" && /a modifier alone sends nothing/.test(r.forms['A terminal receives'] ?? ''), `a modifier alone: "${r.big}", ${r.forms.JavaScript}`);
  await L.keyboard.press('ShiftLeft'); r = await read(L);
  ok(r.rows.length === 4 && r.rows[0] === 'Shift' && r.rows[1] === 'Shift', `pressed again after it was let go: a row of its own (${r.rows.join(' | ')})`);
  await L.keyboard.press('Control+ArrowUp'); r = await read(L);
  ok(r.big === 'Ctrl + Up' && r.forms['VS Code, hotkeys'] === 'ctrl+up' && r.forms['A terminal receives'] === 'Esc [1;5A (1b 5b 31 3b 35 41)', `Ctrl + Up: ${r.forms['VS Code, hotkeys']}, ${r.forms['A terminal receives']}`);
  await L.keyboard.press('Shift+Slash'); r = await read(L);
  ok(r.big === 'Shift + /' && /types "\?"/.test(r.sub), `Shift + / and the "?" it types (${r.sub})`);
  await L.keyboard.press('Meta+KeyE'); r = await read(L);
  ok(r.big === 'Super + E' && r.forms['VS Code, hotkeys'] === 'meta+e', `Linux: the logo key is Super (${r.big}, ${r.forms['VS Code, hotkeys']})`);
  ok(await L.evaluate(() => { const e = new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; }), "Windows' lone Alt: its release is taken by the page (else Chrome's menu takes the focus and the next key never arrives)");
  ok(!(await L.evaluate(() => { const e = new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })), '… other releases are left alone');
  ok(/the desktop keeps Alt \+ Tab, Alt \+ F2/.test(await L.locator('body').textContent()), 'Linux: the combinations the desktop keeps are named');
  ok(!L.errors.length, `no page errors ${L.errors.join(' | ')}`);
  const Wn = await open('windows');
  await Wn.evaluate(() => { // AltGr + Q as Windows sends it: a Ctrl of its own, then AltGr as Ctrl + Alt, then the Q that types "@"
    const d = (o) => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));
    d({ key: 'Control', code: 'ControlLeft', ctrlKey: true }); d({ key: 'AltGraph', code: 'AltRight', ctrlKey: true, altKey: true, modifierAltGraph: true }); d({ key: '@', code: 'KeyQ', ctrlKey: true, altKey: true, modifierAltGraph: true });
  });
  r = await read(Wn);
  ok(r.big === 'AltGr + Q' && /types "@"/.test(r.sub) && JSON.stringify(r.rows) === JSON.stringify(['AltGr + Q']) && /^@ \(40\)/.test(r.forms['A terminal receives'] ?? ''), `Windows' AltGr + Q: "${r.big}", ${r.sub}, one row (${r.rows.join(' | ')}), a terminal receives ${r.forms['A terminal receives']}`);
  await Wn.keyboard.press('Meta+KeyE'); r = await read(Wn);
  ok(r.big === 'Win + E' && r.forms['VS Code, hotkeys'] === 'win+e', `Windows: the logo key is Win (${r.big})`);
  ok(/Windows keeps Alt \+ Tab, Alt \+ Esc, Alt \+ F4, Alt \+ Space/.test(await Wn.locator('body').textContent()), 'Windows: the combinations Windows keeps are named');
  const Mc = await open('mac');
  await Mc.keyboard.press('Alt+KeyW'); r = await read(Mc);
  ok(r.big === 'Option + W', `a Mac: Option + W (${r.big})`);
  await Mc.keyboard.press('Meta+KeyE'); r = await read(Mc);
  ok(r.big === 'Command + E' && r.forms['VS Code, hotkeys'] === 'cmd+e', `a Mac: Command + E, cmd+e (${r.big})`);
  await page.goto(`${base}#/ascii`); await page.locator('input[aria-label=Filter]').waitFor(); await page.locator('body').click({ position: { x: 5, y: 600 } }); await page.keyboard.press('Slash');
  ok(/search/.test(await page.evaluate(() => document.activeElement.className)), 'after leaving the tab "/" focuses the search again (listener removed)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'keycode');
};
