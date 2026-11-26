// Key Codes (to-do #26; owner, 26 Nov 2026: "When I press alt+W, I'm not getting the alt+W code. Is this even possible?
// if so do it."): a key event read as the combination people name — "Alt + W" — and as the forms they paste: "Alt+W",
// VS Code's "alt+w", a JavaScript test, and the bytes a terminal receives. The browser does say it: the W key's event
// carries "Alt held" (altKey); there is no single code for Alt+W — it is the key W (code KeyW, keyCode 87) with Alt held.
// The terminal's bytes follow xterm.js — the terminal of VS Code — key by key (the unit suite holds them to xterm.js's
// own evaluateKeyboardEvent and its rule for AltGr and the Mac's Option). No DOM.
export type OS = 'windows' | 'linux' | 'mac';
/** what is read of a KeyboardEvent (altGraph = getModifierState('AltGraph')) */
export interface KeyEv { key: string; code: string; keyCode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; altGraph?: boolean }
export interface Mods { ctrl: boolean; alt: boolean; altgr: boolean; shift: boolean; meta: boolean }

const MOD_KEY: Record<string, keyof Mods> = { Control: 'ctrl', Alt: 'alt', AltGraph: 'altgr', Shift: 'shift', Meta: 'meta', OS: 'meta', Super: 'meta', Hyper: 'meta' };
export const isModifier = (e: Pick<KeyEv, 'key'>) => Object.prototype.hasOwnProperty.call(MOD_KEY, e.key);
const ORDER: Array<keyof Mods> = ['ctrl', 'alt', 'altgr', 'shift', 'meta']; // Ctrl, Alt, Shift, Win — Apple's ⌃ ⌥ ⇧ ⌘ too
export const MOD_NAMES: Record<OS, Record<keyof Mods, string>> = {
  windows: { ctrl: 'Ctrl', alt: 'Alt', altgr: 'AltGr', shift: 'Shift', meta: 'Win' },
  linux: { ctrl: 'Ctrl', alt: 'Alt', altgr: 'AltGr', shift: 'Shift', meta: 'Super' },
  mac: { ctrl: 'Control', alt: 'Option', altgr: 'AltGr', shift: 'Shift', meta: 'Command' },
};
const VS_MODS: Record<OS, Record<keyof Mods, string>> = {
  windows: { ctrl: 'ctrl', alt: 'alt', altgr: 'ctrl+alt', shift: 'shift', meta: 'win' },
  linux: { ctrl: 'ctrl', alt: 'alt', altgr: 'ctrl+alt', shift: 'shift', meta: 'meta' },
  mac: { ctrl: 'ctrl', alt: 'alt', altgr: 'ctrl+alt', shift: 'shift', meta: 'cmd' },
};
const JS_MODS: Record<keyof Mods, string> = { ctrl: 'e.ctrlKey', alt: 'e.altKey', altgr: "e.getModifierState('AltGraph')", shift: 'e.shiftKey', meta: 'e.metaKey' };

/** The modifiers held, the pressed modifier key itself included. AltGr is one modifier (Windows reports it as Ctrl + Alt). */
export function modsOf(e: KeyEv): Mods {
  const altgr = !!e.altGraph || e.key === 'AltGraph';
  const m: Mods = { ctrl: e.ctrlKey && !altgr, alt: e.altKey && !altgr, altgr, shift: e.shiftKey, meta: e.metaKey };
  const own = MOD_KEY[e.key];
  if (own && own !== 'altgr' && !(altgr && (own === 'ctrl' || own === 'alt'))) m[own] = true;
  return m;
}
/** the modifiers as the event's own flags have them (Windows' AltGr: Ctrl and Alt) — to tell whether a key comes while a
 *  modifier pressed before it is still held */
export function heldFlags(e: KeyEv): Mods {
  const own = MOD_KEY[e.key];
  return { ctrl: e.ctrlKey || own === 'ctrl', alt: e.altKey || own === 'alt', altgr: !!e.altGraph || own === 'altgr', shift: e.shiftKey || own === 'shift', meta: e.metaKey || own === 'meta' };
}
/** every modifier held in `a` is held in `b` */
export const within = (a: Mods, b: Mods) => ORDER.every((k) => !a[k] || b[k]);

// the key's name in a shortcut: by its place on the keyboard (Option + W on a Mac types "∑" and is still Option + W)
const PUNCT: Record<string, string> = { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '\\', IntlRo: '\\', IntlYen: '¥' };
const NUMPAD: Record<string, string> = { NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadDecimal: '.', NumpadComma: ',', NumpadEqual: '=', NumpadEnter: 'Enter' };
const NAMED: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', ' ': 'Space', Spacebar: 'Space', ContextMenu: 'Menu' };

/** The key's name in a shortcut (W, 7, Num 7, Space, Up, F5 …); null for a modifier key. `layout`: the keyboard's own
 *  characters by place (navigator.keyboard.getLayoutMap(): a German keyboard's KeyY is Z). */
export function keyLabel(e: KeyEv, layout?: ReadonlyMap<string, string>): string | null {
  if (isModifier(e)) return null;
  const c = e.code, own = layout?.get(c);
  if (/^Key[A-Z]$/.test(c)) return own && /^[a-z]$/i.test(own) ? own.toUpperCase() : c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^Numpad\d$/.test(c)) return `Num ${c.slice(6)}`;
  if (c in NUMPAD) return `Num ${NUMPAD[c]}`;
  if (c === 'Space') return 'Space';
  if (c in PUNCT) return own && [...own].length === 1 ? own.toUpperCase() : PUNCT[c];
  if (NAMED[e.key]) return NAMED[e.key];
  if (e.key && e.key !== 'Unidentified' && e.key !== 'Dead' && e.key !== 'Process') return [...e.key].length === 1 ? e.key.toUpperCase() : e.key;
  return c || e.key || '?';
}

const VS_KEY: Record<string, string> = { Up: 'up', Down: 'down', Left: 'left', Right: 'right', Esc: 'escape', Space: 'space', Menu: 'contextmenu', Enter: 'enter', 'Num Enter': 'enter', 'Num +': 'numpad_add', 'Num -': 'numpad_subtract', 'Num *': 'numpad_multiply', 'Num /': 'numpad_divide', 'Num .': 'numpad_decimal', 'Num ,': 'numpad_separator' };
const vsKey = (label: string) => VS_KEY[label] ?? (/^Num \d$/.test(label) ? `numpad${label.slice(4)}` : label.toLowerCase());

export interface Combo {
  /** "Alt + W" — the big display */
  text: string;
  /** "Alt+W" */
  short: string;
  /** "alt+w" (VS Code's keybindings, hotkeys libraries) */
  vscode: string;
  /** "e.altKey && e.code === 'KeyW'" */
  js: string;
  /** the character the key typed, where it is not the key's name (Shift + / types "?", AltGr + Q "@") */
  types?: string;
  /** the key is a modifier pressed alone (or with other modifiers) */
  modOnly: boolean;
}

export function describe(e: KeyEv, os: OS, layout?: ReadonlyMap<string, string>): Combo {
  const m = modsOf(e), held = ORDER.filter((k) => m[k]), key = keyLabel(e, layout);
  const parts = [...held.map((k) => MOD_NAMES[os][k]), ...(key ? [key] : [])];
  const vs = [...held.map((k) => VS_MODS[os][k]), ...(key ? [vsKey(key)] : [])].join('+');
  const own = MOD_KEY[e.key];
  const js = key ? [...held.map((k) => JS_MODS[k]), `e.code === '${e.code}'`].join(' && ')
    : [...held.filter((k) => k !== own).map((k) => JS_MODS[k]), `e.key === '${e.key}'`].join(' && ');
  const ch = [...e.key].length === 1 && e.key !== ' ' ? e.key : undefined;
  return { text: parts.join(' + '), short: parts.join('+'), vscode: vs, js, types: ch && key && ch.toUpperCase() !== key ? ch : undefined, modOnly: !key };
}

// ---- what a terminal receives: xterm.js's rules (src/common/input/Keyboard.ts, evaluateKeyboardEvent; with
// applicationCursorKeys off, the Mac's Option not used as Meta — xterm.js's defaults — and its keypress for characters)
const ESC = '\x1b';
const SHIFTED: Record<number, [string, string]> = {
  48: ['0', ')'], 49: ['1', '!'], 50: ['2', '@'], 51: ['3', '#'], 52: ['4', '$'], 53: ['5', '%'], 54: ['6', '^'], 55: ['7', '&'], 56: ['8', '*'], 57: ['9', '('],
  186: [';', ':'], 187: ['=', '+'], 188: [',', '<'], 189: ['-', '_'], 190: ['.', '>'], 191: ['/', '?'], 192: ['`', '~'], 219: ['[', '{'], 220: ['\\', '|'], 221: [']', '}'], 222: ["'", '"'],
};
const CSI_FINAL: Record<number, string> = { 37: 'D', 39: 'C', 38: 'A', 40: 'B', 36: 'H', 35: 'F', 112: 'P', 113: 'Q', 114: 'R', 115: 'S' };
const TILDE: Record<number, number> = { 116: 15, 117: 17, 118: 18, 119: 19, 120: 20, 121: 21, 122: 23, 123: 24 };

/** The bytes a terminal receives for the key (as a string of characters), or why it receives none. */
export function terminal(e: KeyEv, os: OS): { bytes?: string; why?: string } {
  if (isModifier(e)) return { why: 'a modifier alone sends nothing' };
  const mac = os === 'mac', win = os === 'windows';
  // AltGr (Windows reports it as Ctrl + Alt) and the Mac's Option type a character: the terminal receives that character
  const third = ((mac && e.altKey && !e.ctrlKey && !e.metaKey) || (win && e.altKey && e.ctrlKey && !e.metaKey) || (win && !!e.altGraph)) && (!e.keyCode || e.keyCode > 47);
  if (third) return e.key.length === 1 ? { bytes: e.key } : { why: `${mac ? 'Option' : 'AltGr'} types no character with this key` };
  const mods = (e.shiftKey ? 1 : 0) | (e.altKey ? 2 : 0) | (e.ctrlKey ? 4 : 0) | (e.metaKey ? 8 : 0), p = mods + 1;
  const k = e.keyCode;
  const typed = () => (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey ? { bytes: e.key } : { why: 'the terminal sends nothing for it' });
  switch (k) {
    case 8: return { bytes: (e.altKey ? ESC : '') + (e.ctrlKey ? '\b' : '\x7f') };
    case 9: return { bytes: e.shiftKey ? `${ESC}[Z` : '\t' };
    case 13: return { bytes: e.altKey ? ESC + '\r' : '\r' };
    case 27: return { bytes: e.altKey ? ESC + ESC : ESC };
    case 37: case 39: case 38: case 40:
      if (e.metaKey) return { why: `the terminal sends nothing for ${MOD_NAMES[os].meta} with an arrow` };
      return { bytes: mods ? `${ESC}[1;${p}${CSI_FINAL[k]}` : `${ESC}[${CSI_FINAL[k]}` };
    case 45: return !e.shiftKey && !e.ctrlKey ? { bytes: `${ESC}[2~` } : { why: 'Shift or Ctrl with Insert pastes or copies in many terminals: nothing is sent' };
    case 46: return { bytes: mods ? `${ESC}[3;${p}~` : `${ESC}[3~` };
    case 36: case 35: return { bytes: mods ? `${ESC}[1;${p}${CSI_FINAL[k]}` : `${ESC}[${CSI_FINAL[k]}` };
    case 33: case 34: {
      const n = k === 33 ? 5 : 6;
      if (e.shiftKey) return { why: `Shift + ${k === 33 ? 'PageUp' : 'PageDown'} scrolls the terminal: nothing is sent` };
      return { bytes: e.ctrlKey ? `${ESC}[${n};${p}~` : `${ESC}[${n}~` };
    }
    case 112: case 113: case 114: case 115: return { bytes: mods ? `${ESC}[1;${p}${CSI_FINAL[k]}` : `${ESC}O${CSI_FINAL[k]}` };
    case 116: case 117: case 118: case 119: case 120: case 121: case 122: case 123:
      return { bytes: mods ? `${ESC}[${TILDE[k]};${p}~` : `${ESC}[${TILDE[k]}~` };
    default: break;
  }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
    if (k >= 65 && k <= 90) return { bytes: String.fromCharCode(k - 64) };
    if (k === 32) return { bytes: '\x00' };
    if (k >= 51 && k <= 55) return { bytes: String.fromCharCode(k - 51 + 27) };
    if (k === 56) return { bytes: '\x7f' };
    if (k === 219) return { bytes: ESC };
    if (k === 220) return { bytes: '\x1c' };
    if (k === 221) return { bytes: '\x1d' };
    return { why: 'the terminal sends nothing for it' };
  }
  if (!mac && e.altKey && !e.metaKey) {
    const pair = SHIFTED[k];
    if (pair) return { bytes: ESC + pair[e.shiftKey ? 1 : 0] };
    if (k >= 65 && k <= 90) { const c = String.fromCharCode(e.ctrlKey ? k - 64 : k + 32); return { bytes: ESC + (e.shiftKey ? c.toUpperCase() : c) }; }
    if (k === 32) return { bytes: ESC + (e.ctrlKey ? '\x00' : ' ') };
    if (e.key === 'Dead' && e.code.startsWith('Key')) { const c = e.code.slice(3, 4); return { bytes: ESC + (e.shiftKey ? c : c.toLowerCase()) }; }
    return { why: 'the terminal sends nothing for it' };
  }
  if (mac && !e.altKey && !e.ctrlKey && !e.shiftKey && e.metaKey) return { why: k === 65 ? 'Command + A selects all in the terminal: nothing is sent' : 'Command keys are the terminal app\'s own: nothing is sent' };
  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) return { bytes: e.key };
  if (e.ctrlKey && e.key === '_') return { bytes: '\x1f' };
  if (e.ctrlKey && e.key === '@') return { bytes: '\x00' };
  return typed();
}

/** Bytes as people read them: Esc, ^A … ^_, ^?, Space, characters as they are — and the bytes in hex (UTF-8). */
export function showBytes(s: string): { text: string; hex: string } {
  const words: string[] = [];
  let run = ''; // characters after Esc read as one word: "Esc [1;5A", "Esc w"
  for (const c of s) {
    const n = c.codePointAt(0)!;
    const ctl = n === 0x1b ? 'Esc' : n === 0x7f ? '^?' : n < 0x20 ? '^' + String.fromCharCode(n + 0x40) : c === ' ' ? 'Space' : null;
    if (ctl) { if (run) words.push(run); run = ''; words.push(ctl); } else run += c;
  }
  if (run) words.push(run);
  return { text: words.join(' '), hex: [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join(' ') };
}
