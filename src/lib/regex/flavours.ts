// The flavours of the Regex Tester (to-do #8): which engine each one is, its flag letters, its replacement syntax and
// the note under the result. No DOM: the tab, the worker and the unit suite share it.

export type FlavourId = 'js' | 'pcre2' | 'perl' | 'python' | 'go' | 'ruby' | 'posix';
export interface Flavour {
  id: FlavourId;
  /** In the flavour list. */
  label: string;
  /** Flag letters and what each does, in the order shown. */
  flags: Array<[string, string]>;
  /** The flags the flavour starts with. */
  start: string;
  /** How a replacement names a group, for the Replace box's hint. */
  replace: string;
  /** The engine and what to know about it, under the result. */
  note: string;
}

export const FLAVOURS: Flavour[] = [
  {
    id: 'js', label: 'JavaScript (this browser)', start: 'g',
    flags: [['g', 'replace every match'], ['i', 'ignore case'], ['m', '^ and $ at every line'], ['s', '. matches a new line'],
      ['u', 'Unicode: \\p{…}, code points'], ['v', 'Unicode sets: [A--B], [A&&B]'], ['y', 'sticky: only from the start'], ['d', 'group indices']],
    replace: '$1 … $99, $<name>, $& (the match), $` and $\' (before / after it), $$',
    note: 'The browser\'s own JavaScript (ECMAScript) engine, run off the page so a runaway pattern cannot freeze it. Without g, Replace changes only the first match.',
  },
  {
    id: 'pcre2', label: 'PCRE2 (PHP, R, grep -P …)', start: '',
    flags: [['i', 'ignore case'], ['m', '^ and $ at every line'], ['s', '. matches a new line'], ['x', 'spaces and # comments ignored'],
      ['n', 'plain ( ) do not capture'], ['U', 'lazy by default, ? makes greedy'], ['J', 'a group name may repeat'],
      ['D', '$ only at the very end'], ['A', 'anchored at the start'], ['u', 'Unicode \\w \\d \\s \\b and [:classes:]']],
    replace: '$1 or ${1}, ${name}, $0 or $& (the match), $$; \\U … \\E and \\L … \\E change case',
    note: 'PCRE2 (pcre2-wasm 10.49, WebAssembly) — the library behind PHP\'s preg_ functions, R, grep -P and many more. The text is read as Unicode; without u, \\w \\d \\s and \\b see ASCII only, as in PCRE2 itself.',
  },
  {
    id: 'perl', label: 'Perl 5', start: '',
    flags: [['i', 'ignore case'], ['m', '^ and $ at every line'], ['s', '. matches a new line'], ['x', 'spaces and # comments ignored'],
      ['n', 'plain ( ) do not capture'], ['a', '\\d \\s \\w and [[:classes:]] ASCII only']],
    replace: '$1, ${1}, $+{name}, $& (the match), \\U … \\E, \\n — read as a Perl double-quoted string, as s/// reads it',
    note: 'Perl\'s own regex engine: Perl 5.42 compiled to WebAssembly (zeroperl — the Perl the EXIF tab runs ExifTool on, 25 MB, fetched once). The text is read as characters (Unicode).',
  },
  {
    id: 'python', label: 'Python (re)', start: '',
    flags: [['i', 'ignore case (re.I)'], ['m', '^ and $ at every line (re.M)'], ['s', '. matches a new line (re.S)'],
      ['x', 'verbose: spaces and # comments ignored (re.X)'], ['a', '\\w \\d \\s \\b ASCII only (re.A)']],
    replace: '\\1 … \\99, \\g<1>, \\g<name>, \\g<0> (the match); \\n \\t and the other escapes',
    note: 'Python\'s re module, run in the CPython of the Python tab (WebAssembly). Type the pattern as you would inside r\'…\'.',
  },
  {
    id: 'go', label: 'Go (RE2 syntax)', start: '',
    flags: [['i', 'ignore case'], ['m', '^ and $ at every line'], ['s', '. matches a new line'], ['U', 'lazy by default, ? makes greedy']],
    replace: '$1 or ${1}, $name or ${name}, $$ — a name runs as far as letters, digits and _ go: write ${1}x, not $1x',
    note: 'Go\'s own regexp package, compiled to WebAssembly: RE2 syntax — no look-arounds or back-references — and every match in time proportional to the text.',
  },
  {
    id: 'ruby', label: 'Ruby (Oniguruma)', start: '',
    flags: [['i', 'ignore case'], ['m', '. matches a new line (Ruby\'s m)'], ['x', 'spaces and # comments ignored']],
    replace: '\\1 … \\9, \\k<name>, \\0 or \\& (the match), \\` and \\\' (before / after it), \\\\',
    note: 'Oniguruma (vscode-oniguruma, WebAssembly) with Ruby\'s syntax; Ruby itself runs Onigmo, a fork of it, and nearly every pattern behaves the same. In Ruby ^ and $ always match at every line: use \\A and \\z for the whole text.',
  },
  {
    id: 'posix', label: 'POSIX ERE (grep -E, sed -E)', start: '',
    flags: [['i', 'ignore case'], ['m', '^ and $ at every line; . and [^…] stop at a new line']],
    replace: '& (the match), \\1 … \\9, \\& and \\\\ for themselves, \\n \\t, \\U … \\E and \\L … \\E change case — as sed\'s s/// reads it',
    note: 'GNU\'s regex — the engine grep -E and sed -E run on Linux (glibc\'s is the same code) — compiled to WebAssembly from GNU grep 3.12\'s source: the longest of the leftmost matches, [[:alpha:]] classes, back-references, GNU\'s \\w \\s \\b \\< \\>. No look-arounds and no lazy repeats in POSIX.',
  },
];
export const flavour = (id: string): Flavour => FLAVOURS.find((f) => f.id === id) ?? FLAVOURS[0];

/** Why a flags text is not usable in the flavour, or null. */
export function flagsError(fl: Flavour, f: string): string | null {
  const letters = fl.flags.map(([c]) => c);
  const list = letters.join(' ');
  const bad = [...f].find((c) => !letters.includes(c));
  if (bad) return fl.id === 'js' ? `“${bad}” is not a flag. The flags are ${list}.` : `“${bad}” is not a flag in ${fl.label.replace(/ \(.*/, '')}. The flags are ${list}.`;
  const twice = [...f].find((c, i) => f.indexOf(c) !== i);
  if (twice) return `Flag ${twice} is given twice.`;
  if (fl.id === 'js' && f.includes('u') && f.includes('v')) return 'Flags u and v cannot be used together (v includes u).';
  return null;
}

/** The names of the capture groups of a JavaScript pattern, by group number (index 0 = group 1); '' for an unnamed group. */
export function groupNames(pattern: string): string[] {
  const out: string[] = []; let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c !== '(') continue;
    if (pattern[i + 1] !== '?') { out.push(''); continue; }
    const m = /^\(\?<([^>=!][^>]*)>/.exec(pattern.slice(i));
    if (m) out.push(m[1]);
  }
  return out;
}

/** Skips a bracket expression starting at p[i] === '['; returns the index of its closing ']' (nested classes counted
 *  when `nested`, as Ruby has them). */
function skipClass(p: string, i: number, nested: boolean): number {
  let j = i + 1, depth = 1;
  if (p[j] === '^') j++;
  if (p[j] === ']') j++; // a ] first is a literal
  for (; j < p.length; j++) {
    const c = p[j];
    if (c === '\\') { j++; continue; }
    if (c === '[' && p[j + 1] === ':') { const e = p.indexOf(':]', j + 2); if (e > 0) { j = e + 1; continue; } }
    if (c === '[' && nested) { depth++; continue; }
    if (c === ']' && --depth === 0) return j;
  }
  return p.length;
}

/** The names of the capture groups of a PCRE2 or Ruby pattern, by number ('' for an unnamed one), or null where the
 *  numbering is not plain (PCRE2's branch reset (?| … )). `ruby`: Ruby's rules — once a group has a name, plain
 *  ( ) do not capture; classes nest. `noCapture`: PCRE2's n flag. `extended`: x — # starts a comment. Labels for the
 *  table only: the engines number the groups themselves. */
export function namedGroups(p: string, { ruby = false, noCapture = false, extended = false } = {}): string[] | null {
  const groups: Array<[string, boolean]> = []; // name, named
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') {
      if (!ruby && p[i + 1] === 'Q') { const e = p.indexOf('\\E', i + 2); i = e < 0 ? p.length : e + 1; continue; }
      i++; continue;
    }
    if (c === '[') { i = skipClass(p, i, ruby); continue; }
    if (extended && c === '#') { const e = p.indexOf('\n', i); i = e < 0 ? p.length : e; continue; }
    if (c !== '(') continue;
    const rest = p.slice(i + 1, i + 40);
    if (rest[0] === '*') continue; // (*VERB)
    if (rest[0] !== '?') { if (!noCapture) groups.push(['', false]); continue; }
    if (rest.startsWith('?#')) { const e = p.indexOf(')', i); i = e < 0 ? p.length : e; continue; }
    if (rest.startsWith('?|')) return null;
    if (rest.startsWith('?(')) { // a condition: its own parentheses are no group
      let d = 0, j = i + 2;
      for (; j < p.length; j++) { if (p[j] === '(') d++; else if (p[j] === ')' && --d === 0) break; }
      i = j; continue;
    }
    const m = /^\?(?:P?<([\p{L}_][\p{L}\p{N}_]*)>|'([\p{L}_][\p{L}\p{N}_]*)')/u.exec(rest);
    if (m) groups.push([m[1] ?? m[2], true]);
  }
  const named = groups.some(([, n]) => n);
  return (ruby && named ? groups.filter(([, n]) => n) : groups).map(([n]) => n);
}
