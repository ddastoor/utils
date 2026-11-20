// Barcode Generator: what a value becomes in each format, said before zint (inside zxing-wasm) draws it — check digits,
// zeros zint would add in front without a word, letters a format does not have — and zint's own errors in words.
// String glue (§3a); the drawing is zxing-wasm's.

export interface BarcodeCheck { value: string; notes: string[]; error?: string; full?: string }

/** The GS1 check digit of the digits before it (EAN-8, EAN-13, UPC-A, ITF-14 …): weights 3 and 1 from the right. */
export function gs1Check(d: string): string {
  let s = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = 4 - w) s += +d[i] * w;
  return String((10 - (s % 10)) % 10);
}

const GS1: Record<string, [number, string]> = { EAN13: [12, 'EAN-13'], EAN8: [7, 'EAN-8'], UPCA: [11, 'UPC-A'] };
const CODE39 = /^[0-9A-Z .$/+%-]*$/;

export function checkBarcode(fmt: string, raw: string): BarcodeCheck {
  const value = raw.trim(), notes: string[] = [];
  if (!value) return { value, notes };
  if (fmt in GS1) {
    const [n, name] = GS1[fmt];
    const digits = value.replace(/[\s-]/g, '');
    if (!/^\d+$/.test(digits)) return { value, notes, error: `${name} holds digits only.` };
    if (digits.length > n + 1) return { value, notes, error: `${name} has ${n} digits and a check digit (${n + 1} in all); this has ${digits.length}.` };
    if (digits.length === n + 1) {
      const want = gs1Check(digits.slice(0, n));
      if (digits[n] !== want) return { value, notes, error: `The last digit should be the check digit ${want}, not ${digits[n]} — or leave it out and it is added.` };
      return { value: digits, notes, full: digits };
    }
    const padded = digits.padStart(n, '0');
    if (digits.length < n) notes.push(`${name} has ${n} digits before the check digit; ${n - digits.length === 1 ? 'a zero was' : `${n - digits.length} zeros were`} added in front: ${padded}.`);
    return { value: digits, notes, full: padded + gs1Check(padded) };
  }
  if (fmt === 'UPCE') {
    if (!/^\d{6,8}$/.test(value)) return { value, notes, error: 'UPC-E has 6 digits (7 with the number system 0 or 1 in front, 8 with the check digit).' };
    if (value.length >= 7 && !/^[01]/.test(value)) return { value, notes, error: 'A UPC-E number with 7 or 8 digits begins with its number system, 0 or 1.' };
    return { value, notes };
  }
  if (fmt === 'ITF') {
    if (!/^\d+$/.test(value)) return { value, notes, error: 'ITF (Interleaved 2 of 5) holds digits only.' };
    if (value.length % 2) notes.push(`ITF holds digits in pairs: a zero was added in front (0${value}).`);
    if (value.length < 6) notes.push('Many scanners do not read ITF codes of fewer than 6 digits.');
    return { value, notes };
  }
  if (fmt === 'Code39') {
    const up = value.toUpperCase();
    if (!CODE39.test(up)) return { value, notes, error: `Code 39 has only A – Z, 0 – 9, space and - . $ / + % — not ${[...new Set(up.replace(/[0-9A-Z .$/+%-]/g, ''))].join(' ')}. Code 128 takes any Latin text.` };
    if (up !== value) notes.push(`Code 39 has no small letters: it holds ${up}.`);
    return { value: up, notes };
  }
  if (fmt === 'Codabar') {
    if (!/^[A-D][0-9$:/.+-]+[A-D]$/i.test(value)) return { value, notes, error: 'Codabar begins and ends with A, B, C or D, with digits and - $ : / . + between them — e.g. A12345B.' };
    return { value: value.toUpperCase(), notes };
  }
  if (fmt === 'Code128' && /[^\x00-\xff]/u.test(value))
    return { value, notes, error: 'Code 128 holds Latin letters only (ISO 8859-1) — for Hindi, other scripts or emoji choose Data Matrix, PDF417 or Aztec (or a QR code).' };
  if (fmt === 'Code93' && /[^\x00-\x7f]/.test(value)) return { value, notes, error: 'Code 93 holds ASCII characters only — choose Code 128 or a 2-D code.' };
  return { value, notes };
}

/** zint's error text without its number and return value ("Error 204: Invalid character in input (retval: 6)"). */
export const zintError = (e: string) => e.replace(/^(Error|Warning) \d+:\s*/i, '').replace(/\s*\(retval: \d+\)\s*$/, '');
