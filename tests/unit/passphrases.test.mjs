// Passphrase Generator (src/lib/passphrases.ts on libsodium.js's randombytes_uniform): the EFF large list as served
// (byte for byte the copy in the xkcdpass package, 1.30.0's static/eff-long — SHA-256 below), refusal of anything else,
// passphrases from the list only, the digit, the entropy, and the spread of the words (χ² over the first letter).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const EFF_SHA256 = '6d557f0693958fb5e650b68b5bee585eb82cf4da32965505c789e924743bc522';

export default async (t, { load, root }) => {
  const P = await load('/src/lib/passphrases.ts');
  const { bindLibsodium } = await load('/src/wasm/libsodium.ts');
  const m = await import('libsodium-wrappers-sumo'); const s = m.default ?? m; await s.ready;
  const na = bindLibsodium(s);
  const raw = readFileSync(join(root, 'public/data/eff_large_wordlist.txt'));
  t.eq(createHash('sha256').update(raw).digest('hex'), EFF_SHA256, 'the served list is the EFF large list (identical to the copy in the xkcdpass package)');
  const list = P.readWordList(raw.toString('utf8'));
  t.eq([list.length, list[0], list.at(-1)], [7776, 'abacus', 'zoom'], '7,776 words, abacus … zoom');
  t.eq(list.filter((w) => w.includes('-')), ['drop-down', 'felt-tip', 't-shirt', 'yo-yo'], 'four words have a hyphen');
  const refuse = (x) => { try { P.readWordList(x); return 'read'; } catch (e) { return e.message; } };
  t.ok(/did not arrive whole \(3 lines instead of 7,776 words\)/.test(refuse('<html>\n<body>Not found</body>\n</html>')), 'an error page is refused (it would have become a list of 3 "words")');
  t.ok(/did not arrive whole/.test(refuse(raw.toString('utf8').slice(0, 30000))), 'a cut download is refused');
  t.ok(/did not arrive whole/.test(refuse(raw.toString('utf8').replace('zoom', 'zoom\nZoom'))), 'a line too many');
  t.eq(P.readWordList(raw.toString('utf8').replace(/\n/g, '\r\n')).length, 7776, 'Windows line ends are fine');
  const ws = new Set(list);
  const O = (x = {}) => ({ words: 6, sep: '-', capitalise: false, digit: false, ...x });
  const parse = (p, sep) => { const memo = new Map(); const go = (i) => { if (i === p.length) return [[]]; if (memo.has(i)) return memo.get(i); const out = []; for (let j = i + 1; j <= p.length; j++) { const w = p.slice(i, j); if (ws.has(w.replace(/\d$/, '').toLowerCase()) && (j === p.length || p.startsWith(sep, j))) for (const rest of go(j === p.length ? j : j + sep.length)) out.push([w, ...rest]); } memo.set(i, out); return out; }; return go(0); };
  let okAll = true;
  for (const sep of ['-', ' ', '.', '_']) for (let k = 0; k < 200; k++) { const p = P.makePassphrase(list, O({ sep, words: 3 + (k % 10) }), na.uniform); if (!parse(p, sep).some((x) => x.length === 3 + (k % 10))) okAll = false; }
  t.ok(okAll, '800 passphrases with each separator: the words of the list only, as many as asked (hyphenated words read too)');
  { const ps = Array.from({ length: 300 }, () => P.makePassphrase(list, O({ capitalise: true, digit: true }), na.uniform));
    t.ok(ps.every((p) => parse(p, '-').some((ws6) => ws6.length === 6 && ws6.filter((w) => /\d$/.test(w)).length === 1 && ws6.every((w) => /^[A-Z][a-z-]*\d?$/.test(w)))), 'with a digit: one word gets one; capitals at every word ("Drop-down" keeps its small d)'); }
  t.near(P.phraseBits(O()), 6 * Math.log2(7776), 1e-12, '6 words: 77.5 bits');
  t.near(P.phraseBits(O({ digit: true })) - P.phraseBits(O()), Math.log2(60), 1e-12, 'a digit after one of 6 words: + log2(60) = 5.9 bits (the tab said + log2(10) = 3.3)');
  t.eq(Math.round(P.phraseBits(O({ words: 3 }))), 39, '3 words: 39 bits');
  { // spread: the first letters of 77,760 drawn words against their share of the list
    const first = new Map(), share = new Map(), n = 77760;
    for (const w of list) share.set(w[0], (share.get(w[0]) ?? 0) + 1);
    for (let k = 0; k < n / 6; k++) for (const w of P.makePassphrase(list, O(), na.uniform).split('-')) first.set(w[0], (first.get(w[0]) ?? 0) + 1);
    const keys = [...share.keys()], obs = keys.map((c) => first.get(c) ?? 0), exp = keys.map((c) => share.get(c) / 7776 * [...first.values()].reduce((a, b) => a + b, 0));
    const df = keys.length - 1, chi = obs.reduce((a, o, i) => a + (o - exp[i]) ** 2 / exp[i], 0), crit = df * (1 - 2 / (9 * df) + 3.719 * Math.sqrt(2 / (9 * df))) ** 3;
    t.ok(chi < crit, `words drawn as often as the list holds them, by first letter: χ² = ${chi.toFixed(1)} (df ${df}, limit ${crit.toFixed(1)})`); }
};
