// Shared by the suites of the small developer tabs: the Python-made reference answers
// (tests/fixtures/devdata/reference.json, scripts/make-devdata-reference.py) and a few page helpers.
import { readFileSync } from 'node:fs';
export const REF = JSON.parse(readFileSync(new URL('../fixtures/devdata/reference.json', import.meta.url), 'utf8'));
/** Put `v` in a text box and fire its input event (any characters, any length — typing 1 MB would take minutes). */
export const setValue = (loc, v) => loc.evaluate((e, x) => { e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
/** Every note on the page as one text. */
export const notes = async (page, sel = '.note') => (await page.locator(sel).allTextContents()).map((x) => x.trim()).join(' | ');
/** Wait until `fn(page state)` holds; false on timeout (the caller reports it as a failed check). */
export const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
/** Capture what the page copies to the clipboard (headless Chromium has no readable clipboard without permissions). */
export const hookClipboard = (page) => page.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = async (t) => { window.__copied.push(t); }; });
export const copied = (page) => page.evaluate(() => window.__copied);
/** Seeded random numbers, so a failing case can be reproduced. */
export function rng(seed = 1) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
