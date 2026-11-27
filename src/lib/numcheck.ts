// The Number Detective's glue (no DOM): what the box holds made into entries, and the shape of the engine's answer. The
// checks are devcore-ids.wasm's (wasm/devcore/src/ids.rs; CLAUDE.md §3 "Number Detective").

export interface Reading {
  kind: string; title: string; verdict: 'valid' | 'invalid' | 'format' | 'unlisted';
  summary: string; value: string; fields: Array<[string, string]>; notes: string[]; score: number; fix: string | null;
}
export interface Answer { readings: Reading[]; shape: string; label: boolean }

/** One entry a line, at most this many (a pasted list); a line longer than this is no number or code. */
export const MAX_LINES = 50, MAX_LINE = 120;

/** The entries of the box: its non-empty lines, trimmed (a bullet or a list number in front left off), the first 50. */
export function entries(text: string): { list: string[]; more: number; long: number } {
  const lines = text.split(/\r\n?|\n/).map((l) => l.replace(/^\s*(?:[-*•·▪]|\d{1,2}[.)])\s+/, '').trim()).filter(Boolean);
  const long = lines.filter((l) => l.length > MAX_LINE).length;
  const ok = lines.filter((l) => l.length <= MAX_LINE);
  return { list: ok.slice(0, MAX_LINES), more: Math.max(0, ok.length - MAX_LINES), long };
}

/** What a verdict is called on the page, and its colour. */
export const VERDICT: Record<Reading['verdict'], [string, 'ok' | 'warn' | 'err' | '']> = {
  valid: ['Valid', 'ok'], invalid: ['Check failed', 'err'], format: ['Right shape', ''], unlisted: ['Not in the list', 'warn'],
};

/** Examples to try: made-up numbers that pass their checks, the networks' and registries' own test numbers. */
export const EXAMPLES: Array<[string, string]> = [
  ['Aadhaar', '2341 2341 2346'], ['PAN', 'AAAPL1234C'], ['GSTIN', '27AAPFU0939F1ZV'], ['IFSC', 'SBIN0000691'], ['UPI ID', 'shop@okicici'],
  ['PIN code', '560001'], ['Phone', '+91 80 2233 4455'], ['Vehicle', 'MH 12 AB 1234'], ['IMEI', '35 209900 176148 1'],
  ['Card', '4111 1111 1111 1111'], ['ISBN', '978-0-306-40615-7'], ['IBAN', 'GB82 WEST 1234 5698 7654 32'], ['VIN', '1HGCM82633A004352'],
];
