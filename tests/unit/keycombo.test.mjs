// Key Codes combinations (src/lib/keycombo.ts, to-do #26; owner: "When I press alt+W, I'm not getting the alt+W code").
// The combination and the forms people paste, by known answers; what a terminal receives is held to **xterm.js** — the
// terminal of VS Code — itself: its evaluateKeyboardEvent (src/common/input/Keyboard.ts of the npm package @xterm/xterm,
// transpiled here) with the rule of its keydown and keypress handlers for AltGr and the Mac's Option (third-level
// shift: the character typed), over every key of a US keyboard × the 16 combinations of Ctrl, Alt, Shift and Meta, on
// Windows, Linux and the Mac, AltGr and dead keys too.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export default async (t, { load }) => {
  const K = await load('/src/lib/keycombo.ts');
  const ev = (o) => ({ key: '', code: '', keyCode: 0, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, altGraph: false, ...o });
  const W = ev({ key: 'w', code: 'KeyW', keyCode: 87, altKey: true });

  // ---- the owner's Alt+W, as one combination and the forms people paste
  let c = K.describe(W, 'windows');
  t.eq([c.text, c.short, c.vscode, c.js, c.types, c.modOnly], ['Alt + W', 'Alt+W', 'alt+w', "e.altKey && e.code === 'KeyW'", undefined, false], 'Alt+W: "Alt + W", Alt+W, alt+w, the JavaScript test');
  t.eq(K.showBytes(K.terminal(W, 'windows').bytes), { text: 'Esc w', hex: '1b 77' }, 'a terminal receives Esc w');
  c = K.describe(ev({ key: 'K', code: 'KeyK', keyCode: 75, ctrlKey: true, shiftKey: true }), 'linux');
  t.eq([c.text, c.vscode, c.js], ['Ctrl + Shift + K', 'ctrl+shift+k', "e.ctrlKey && e.shiftKey && e.code === 'KeyK'"], 'Ctrl+Shift+K: the order Ctrl, Alt, Shift');
  t.eq(K.terminal(ev({ key: 'K', code: 'KeyK', keyCode: 75, ctrlKey: true, shiftKey: true }), 'linux').bytes, undefined, '… xterm.js sends nothing for it');
  c = K.describe(ev({ key: '@', code: 'KeyQ', keyCode: 81, ctrlKey: true, altKey: true, altGraph: true }), 'windows');
  t.eq([c.text, c.types, c.js], ['AltGr + Q', '@', "e.getModifierState('AltGraph') && e.code === 'KeyQ'"], 'AltGr + Q (Windows reports it as Ctrl + Alt): named AltGr, types "@"');
  t.eq(K.terminal(ev({ key: '@', code: 'KeyQ', keyCode: 81, ctrlKey: true, altKey: true, altGraph: true }), 'windows').bytes, '@', '… and a terminal receives the "@" it types');
  c = K.describe(ev({ key: 'Alt', code: 'AltLeft', keyCode: 18, altKey: true }), 'windows');
  t.eq([c.text, c.modOnly, c.js], ['Alt', true, "e.key === 'Alt'"], 'a modifier alone: "Alt"');
  t.ok(/sends nothing/.test(K.terminal(ev({ key: 'Alt', code: 'AltLeft', keyCode: 18, altKey: true }), 'windows').why), '… which sends nothing to a terminal');
  c = K.describe(ev({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, ctrlKey: true, shiftKey: true }), 'windows');
  t.eq([c.text, c.modOnly, c.js], ['Ctrl + Shift', true, "e.ctrlKey && e.key === 'Shift'"], 'Shift pressed while Ctrl is held: "Ctrl + Shift"');
  c = K.describe(ev({ key: '∑', code: 'KeyW', keyCode: 87, altKey: true }), 'mac');
  t.eq([c.text, c.types, c.vscode], ['Option + W', '∑', 'alt+w'], 'a Mac\'s Option + W types "∑" and is still Option + W');
  t.eq(K.terminal(ev({ key: '∑', code: 'KeyW', keyCode: 87, altKey: true }), 'mac').bytes, '∑', '… a terminal receives "∑" (Option is not Meta by default)');
  const E = ev({ key: 'e', code: 'KeyE', keyCode: 69, metaKey: true });
  t.eq(['windows', 'linux', 'mac'].map((os) => [K.describe(E, os).text, K.describe(E, os).vscode]), [['Win + E', 'win+e'], ['Super + E', 'meta+e'], ['Command + E', 'cmd+e']], 'the logo key: Win, Super, Command');
  c = K.describe(ev({ key: '?', code: 'Slash', keyCode: 191, shiftKey: true }), 'linux');
  t.eq([c.text, c.types, c.vscode], ['Shift + /', '?', 'shift+/'], 'Shift + / types "?"');
  const up = ev({ key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, ctrlKey: true });
  t.eq([K.describe(up, 'linux').text, K.describe(up, 'linux').vscode, K.showBytes(K.terminal(up, 'linux').bytes)], ['Ctrl + Up', 'ctrl+up', { text: 'Esc [1;5A', hex: '1b 5b 31 3b 35 41' }], 'Ctrl + Up: ctrl+up, Esc [1;5A');
  t.eq(K.showBytes(K.terminal(ev({ key: ' ', code: 'Space', keyCode: 32, ctrlKey: true }), 'linux').bytes), { text: '^@', hex: '00' }, 'Ctrl + Space: ^@');
  t.eq(K.showBytes(K.terminal(ev({ key: 'Enter', code: 'Enter', keyCode: 13 }), 'linux').bytes), { text: '^M', hex: '0d' }, 'Enter: ^M');
  t.eq(K.showBytes(K.terminal(ev({ key: 'w', code: 'KeyW', keyCode: 87, ctrlKey: true }), 'linux').bytes), { text: '^W', hex: '17' }, 'Ctrl + W: ^W');
  t.eq(K.showBytes(K.terminal(ev({ key: 'F5', code: 'F5', keyCode: 116, shiftKey: true }), 'linux').bytes), { text: 'Esc [15;2~', hex: '1b 5b 31 35 3b 32 7e' }, 'Shift + F5: Esc [15;2~');
  t.eq(K.showBytes(K.terminal(ev({ key: ' ', code: 'Space', keyCode: 32, altKey: true }), 'linux').bytes), { text: 'Esc Space', hex: '1b 20' }, 'Alt + Space: Esc Space');
  t.eq([K.keyLabel(ev({ key: 'Home', code: 'Numpad7', keyCode: 36 })), K.keyLabel(ev({ key: '+', code: 'NumpadAdd', keyCode: 107 })), K.keyLabel(ev({ key: 'Escape', code: 'Escape', keyCode: 27 })), K.keyLabel(ev({ key: 'Dead', code: 'BracketLeft', keyCode: 219 })), K.keyLabel(ev({ key: 'F12', code: 'F12', keyCode: 123 }))],
    ['Num 7', 'Num +', 'Esc', '[', 'F12'], 'key names: the number pad by its place, Esc, a dead key by its place, F12');
  t.eq(K.describe(ev({ key: 'z', code: 'KeyY', keyCode: 90, ctrlKey: true }), 'windows', new Map([['KeyY', 'z']])).text, 'Ctrl + Z', 'a German keyboard: the key at KeyY is Z (the keyboard\'s own map)');
  t.eq(K.describe(ev({ key: 'ц', code: 'KeyW', keyCode: 87, altKey: true }), 'windows', new Map([['KeyW', 'ц']])).text, 'Alt + W', 'a Russian keyboard: shortcuts go by the Latin letter of the place');
  t.eq(K.describe(ev({ key: 'AltGraph', code: 'AltRight', keyCode: 225, altGraph: true }), 'linux').text, 'AltGr', 'AltGr alone (Linux)');
  t.eq(K.describe(ev({ key: 'a', code: 'KeyA', keyCode: 65 }), 'linux').text, 'A', 'a plain key: its name');
  // which row a key joins: Windows' AltGr starts with a Ctrl of its own, and the AltGr that follows takes its row
  t.ok(K.within(K.heldFlags(ev({ key: 'Control', code: 'ControlLeft', keyCode: 17, ctrlKey: true })), K.heldFlags(ev({ key: 'AltGraph', code: 'AltRight', keyCode: 18, ctrlKey: true, altKey: true, altGraph: true }))), 'Windows\' AltGr comes after a Ctrl: one row');
  t.ok(!K.within(K.heldFlags(ev({ key: 'Alt', code: 'AltLeft', keyCode: 18, altKey: true })), K.heldFlags(ev({ key: 'w', code: 'KeyW', keyCode: 87 }))), 'W after Alt was let go: a row of its own');

  // ---- what a terminal receives, against xterm.js itself
  const pkg = fileURLToPath(new URL('../../node_modules/@xterm/xterm/', import.meta.url));
  const ts = (await import('typescript-classic')).default;
  const js = (f) => ts.transpileModule(readFileSync(join(pkg, 'src', f), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
  const dir = mkdtempSync(join(tmpdir(), 'xterm-ref-'));
  writeFileSync(join(dir, 'keyboard.mjs'), `${js('common/data/EscapeSequences.ts')}\nconst KeyboardResultType = { SEND_KEY: 0, SELECT_ALL: 1, PAGE_UP: 2, PAGE_DOWN: 3 };\n${js('common/input/Keyboard.ts').replace(/^import .*$/gm, '')}`);
  const X = await import(pathToFileURL(join(dir, 'keyboard.mjs')).href);
  // xterm.js's CoreBrowserTerminal: keydown → evaluateKeyboardEvent (applicationCursorKeys off; macOptionIsMeta false, its
  // default); a third-level shift (AltGr; Option on a Mac) is left to keypress; keypress sends the character typed
  // unless Alt, Ctrl or Meta is held (and it is not a third-level shift); Shift + PageUp / PageDown scroll
  const xterm = (e, os) => {
    const isMac = os === 'mac', isWin = os === 'windows';
    const third = ((isMac && e.altKey && !e.ctrlKey && !e.metaKey) || (isWin && e.altKey && e.ctrlKey && !e.metaKey) || (isWin && e.altGraph)) && (!e.keyCode || e.keyCode > 47);
    const r = X.evaluateKeyboardEvent(e, false, isMac, false);
    if (r.type === 2 || r.type === 3) return undefined;
    const press = () => (e.key.length === 1 && (!(e.altKey || e.ctrlKey || e.metaKey) || third) ? e.key : undefined);
    if (third) return press();
    return r.key || press();
  };
  const KEYS = [];
  for (let k = 65; k <= 90; k++) { const l = String.fromCharCode(k + 32); KEYS.push({ code: `Key${l.toUpperCase()}`, keyCode: k, key: l, shifted: l.toUpperCase() }); }
  const SH = { 48: ')', 49: '!', 50: '@', 51: '#', 52: '$', 53: '%', 54: '^', 55: '&', 56: '*', 57: '(' };
  for (let k = 48; k <= 57; k++) KEYS.push({ code: `Digit${k - 48}`, keyCode: k, key: String(k - 48), shifted: SH[k] });
  for (const [code, keyCode, key, shifted] of [['Semicolon', 186, ';', ':'], ['Equal', 187, '=', '+'], ['Comma', 188, ',', '<'], ['Minus', 189, '-', '_'], ['Period', 190, '.', '>'], ['Slash', 191, '/', '?'], ['Backquote', 192, '`', '~'], ['BracketLeft', 219, '[', '{'], ['Backslash', 220, '\\', '|'], ['BracketRight', 221, ']', '}'], ['Quote', 222, "'", '"'],
    ['Backspace', 8, 'Backspace'], ['Tab', 9, 'Tab'], ['Enter', 13, 'Enter'], ['Escape', 27, 'Escape'], ['Space', 32, ' '], ['PageUp', 33, 'PageUp'], ['PageDown', 34, 'PageDown'], ['End', 35, 'End'], ['Home', 36, 'Home'],
    ['ArrowLeft', 37, 'ArrowLeft'], ['ArrowUp', 38, 'ArrowUp'], ['ArrowRight', 39, 'ArrowRight'], ['ArrowDown', 40, 'ArrowDown'], ['Insert', 45, 'Insert'], ['Delete', 46, 'Delete'],
    ['NumpadMultiply', 106, '*'], ['NumpadAdd', 107, '+'], ['NumpadSubtract', 109, '-'], ['NumpadDecimal', 110, '.'], ['NumpadDivide', 111, '/'], ['ShiftLeft', 16, 'Shift'], ['ControlLeft', 17, 'Control'], ['AltLeft', 18, 'Alt'], ['MetaLeft', 91, 'Meta'], ['ContextMenu', 93, 'ContextMenu']]) KEYS.push({ code, keyCode, key, shifted: shifted ?? key });
  for (let k = 96; k <= 105; k++) KEYS.push({ code: `Numpad${k - 96}`, keyCode: k, key: String(k - 96), shifted: String(k - 96) });
  for (let k = 112; k <= 123; k++) KEYS.push({ code: `F${k - 111}`, keyCode: k, key: `F${k - 111}`, shifted: `F${k - 111}` });
  const events = [];
  for (const os of ['windows', 'linux', 'mac']) for (const k of KEYS) for (let m = 0; m < 16; m++) {
    const shiftKey = !!(m & 1), altKey = !!(m & 2), ctrlKey = !!(m & 4), metaKey = !!(m & 8);
    let key = shiftKey ? k.shifted : k.key;
    if (os === 'mac' && altKey && !ctrlKey && !metaKey && k.key.length === 1 && k.keyCode >= 48) key = 'å'; // Option types another character
    events.push([os, ev({ key, code: k.code, keyCode: k.keyCode, shiftKey, altKey, ctrlKey, metaKey })]);
  }
  for (const k of KEYS.filter((x) => x.keyCode >= 65 && x.keyCode <= 90)) { // AltGr: Windows says Ctrl + Alt, Linux neither
    events.push(['windows', ev({ key: '€', code: k.code, keyCode: k.keyCode, ctrlKey: true, altKey: true, altGraph: true })]);
    events.push(['windows', ev({ key: k.key, code: k.code, keyCode: k.keyCode, ctrlKey: true, altKey: true, altGraph: true })]);
    events.push(['linux', ev({ key: '€', code: k.code, keyCode: k.keyCode, altGraph: true })]);
    events.push(['linux', ev({ key: 'Dead', code: k.code, keyCode: k.keyCode, altKey: true })]); // a dead key with Alt
    events.push(['linux', ev({ key: 'Dead', code: k.code, keyCode: k.keyCode, altKey: true, shiftKey: true })]);
  }
  const wrong = [];
  for (const [os, e] of events) {
    const want = xterm(e, os), got = K.terminal(e, os).bytes;
    if (want !== got && wrong.length < 8) wrong.push(`${os} ${[e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.altGraph && 'AltGr'].filter(Boolean).join('+')}+${e.code} ${JSON.stringify(e.key)}: xterm.js ${JSON.stringify(want)}, ours ${JSON.stringify(got)}`);
  }
  t.eq(wrong, [], `${events.length} key events on Windows, Linux and the Mac: a terminal receives what xterm.js ${version} sends`);
  const sent = events.filter(([os, e]) => xterm(e, os) !== undefined).length;
  t.ok(sent > 1000 && events.length - sent > 1000, `the comparison covers both: xterm.js sends bytes for ${sent} of them and nothing for the other ${events.length - sent}`);
};
