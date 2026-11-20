// Password Generator: the alphabets, one password, and the exact entropy. The random numbers come from libsodium's
// randombytes_uniform (libsodium.js, src/wasm/libsodium.ts) — unbiased integers from the browser's cryptographic
// generator; this file only picks characters with them (string glue, §3a).
export const SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~',
} as const;
export type SetName = keyof typeof SETS;
/** Characters that are easy to mistake for one another in many fonts (I l 1 | ; O 0 o; quotes and the backtick). */
export const LOOKALIKE = 'Il1|O0o`\'"';
export const MIN_LEN = 4, MAX_LEN = 128;

export interface PwOptions {
  len: number;
  upper: boolean; lower: boolean; digits: boolean; symbols: boolean;
  /** The symbols to use (sites often allow only some). */
  symbolSet: string;
  avoidLookalikes: boolean;
}

/** The symbols a person typed, as a set: printable ASCII that is not a letter or digit, each once, in the order typed.
 *  `dropped`: what was left out (letters, digits, spaces, characters beyond ASCII). */
export function cleanSymbols(s: string): { set: string; dropped: string } {
  let set = '', dropped = '';
  for (const c of s) {
    if (/^[!-/:-@[-`{-~]$/.test(c)) { if (!set.includes(c)) set += c; } else if (!dropped.includes(c)) dropped += c;
  }
  return { set, dropped };
}

/** The alphabets of the chosen sets, look-alikes removed when asked; empty ones left out. */
export function alphabets(o: PwOptions): string[] {
  const sets = [o.upper && SETS.upper, o.lower && SETS.lower, o.digits && SETS.digits, o.symbols && cleanSymbols(o.symbolSet).set].filter(Boolean) as string[];
  return sets.map((s) => (o.avoidLookalikes ? [...s].filter((c) => !LOOKALIKE.includes(c)).join('') : s)).filter((s) => s.length);
}

/** Every chosen set is used at least once when the password is long enough to hold one of each. */
export const requiresEach = (o: PwOptions, sets = alphabets(o)) => sets.length > 1 && o.len >= sets.length;

/** One password: characters drawn uniformly from all chosen sets; a draw that misses a set is thrown away and drawn
 *  again (so every password that has one of each set is equally likely). `uniform(n)` = an unbiased integer 0 … n − 1. */
export function makePassword(o: PwOptions, uniform: (n: number) => number): string {
  const sets = alphabets(o);
  if (!sets.length) throw new Error('Pick at least one character set.');
  const all = sets.join(''), each = requiresEach(o, sets);
  for (;;) {
    let pw = '';
    for (let i = 0; i < o.len; i++) pw += all[uniform(all.length)];
    if (!each || sets.every((s) => [...pw].some((c) => s.includes(c)))) return pw;
  }
}

/** How many passwords the options allow: |alphabet|^len, or — when one of each set is required — the strings that hold
 *  one of each (inclusion–exclusion over the sets). Exact (BigInt). */
export function countPasswords(o: PwOptions): bigint {
  const sets = alphabets(o), n = BigInt(o.len);
  if (!sets.length) return 0n;
  const total = sets.reduce((s, x) => s + x.length, 0);
  if (!requiresEach(o, sets)) return BigInt(total) ** n;
  let sum = 0n;
  for (let mask = 0; mask < 1 << sets.length; mask++) {
    let size = total, k = 0;
    sets.forEach((s, i) => { if (mask & (1 << i)) { size -= s.length; k++; } });
    sum += (k % 2 ? -1n : 1n) * BigInt(size) ** n;
  }
  return sum;
}

/** log2 of a positive BigInt, to about 15 digits. */
export function log2big(x: bigint): number {
  if (x <= 0n) return -Infinity;
  const bits = x.toString(2).length;
  if (bits <= 53) return Math.log2(Number(x));
  return bits - 53 + Math.log2(Number(x >> BigInt(bits - 53)));
}

/** The entropy of one password in bits (log2 of the number of passwords the options allow; each equally likely). */
export const entropyBits = (o: PwOptions) => log2big(countPasswords(o));

export function strengthLabel(bits: number): [string, 'err' | 'warn' | 'ok'] {
  return bits < 40 ? ['Weak', 'err'] : bits < 64 ? ['Fair', 'warn'] : bits < 90 ? ['Strong', 'ok'] : ['Very strong', 'ok'];
}
