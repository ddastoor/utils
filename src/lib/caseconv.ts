// Case Converter: the names of the conversions, in the order textkit.wasm returns them (wasm/textkit/src/case.rs).
export const CASE_NAMES = ['UPPER CASE', 'lower case', 'Title Case', 'Sentence case', 'Capitalized Case', 'camelCase', 'PascalCase', 'snake_case', 'kebab-case', 'CONSTANT_CASE', 'dot.case', 'aLtErNaTiNg', 'iNVERSE'] as const;
export type CaseName = (typeof CASE_NAMES)[number];
/** What a row is, in a few words (shown as the row's tooltip). */
export const CASE_HINTS: Record<CaseName, string> = {
  'UPPER CASE': 'Every letter a capital',
  'lower case': 'Every letter small',
  'Title Case': 'A headline: every word with a capital, except a, an, and, as, at, but, by, for, if, in, of, on, or, the, to, via, vs inside the line. Each line is a title of its own; words with capitals inside (iPhone, NASA) and addresses stay as typed',
  'Sentence case': 'Small letters, with a capital at the start of every sentence and line, and for the word I',
  'Capitalized Case': 'Every word with a capital, the rest small',
  camelCase: 'Words joined, each but the first with a capital — one name per line',
  PascalCase: 'Words joined, each with a capital — one name per line',
  snake_case: 'Small letters joined by underscores — one name per line',
  'kebab-case': 'Small letters joined by hyphens — one name per line',
  CONSTANT_CASE: 'Capitals joined by underscores — one name per line',
  'dot.case': 'Small letters joined by full stops — one name per line',
  aLtErNaTiNg: 'Small and capital letters in turn',
  iNVERSE: 'Capitals become small letters and small letters capitals',
};
/** How much of a long result is put on screen (Copy always gives all of it). */
export const SHOWN = 20000;
/** The part of a result that is shown: the first SHOWN characters, never half a character. */
export function shownPart(v: string): string {
  if (v.length <= SHOWN) return v;
  const cut = v.charCodeAt(SHOWN - 1) >= 0xd800 && v.charCodeAt(SHOWN - 1) <= 0xdbff ? SHOWN - 1 : SHOWN;
  return v.slice(0, cut) + '…';
}
