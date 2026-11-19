// The Prime / LCM / GCD tab's reading of its box: whole numbers from 1 to 2⁶⁴ − 1, and what is left out — said, not
// passed over. The arithmetic is mathcore's (64-bit Miller–Rabin, Pollard rho, gcd). No DOM.

export const MAX_U64 = 2n ** 64n - 1n;
export interface WholeNumbers { ns: bigint[]; /** pieces that are not whole numbers from 1 up, as typed */ skipped: string[]; /** numbers beyond 2⁶⁴ − 1 */ tooLarge: string[] }
/** Numbers separated by commas, semicolons, spaces or line breaks; digits only (a + in front and _ between digits are
 *  allowed). 0, negative numbers, decimals, words and hexadecimal are left out and named. */
export function readWholeNumbers(text: string): WholeNumbers {
  const ns: bigint[] = [], skipped: string[] = [], tooLarge: string[] = [];
  for (const t of String(text ?? '').replace(/[−–]/g, '-').split(/[\s,;]+/).filter(Boolean)) {
    if (!/^\+?\d[\d_]*$/.test(t) || t.endsWith('_')) { skipped.push(t); continue; }
    const n = BigInt(t.replace(/[+_]/g, ''));
    if (n === 0n) skipped.push(t); else if (n > MAX_U64) tooLarge.push(t); else ns.push(n);
  }
  return { ns, skipped, tooLarge };
}
/** 2^3 × 3^2 × 5 from the list of prime factors (ascending, repeated) */
export function factorText(factors: bigint[]): string {
  const groups: Array<[bigint, number]> = [];
  for (const p of factors) { const last = groups[groups.length - 1]; if (last && last[0] === p) last[1]++; else groups.push([p, 1]); }
  return groups.map(([p, k]) => (k > 1 ? `${p}^${k}` : `${p}`)).join(' × ');
}
