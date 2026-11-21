// The Regex Tester's flavours (to-do #8): every engine of the tab, run here under Node exactly as the regex worker runs
// it, held to the native engine — tests/fixtures/regex/reference.json, from scripts/make-regex-reference.py (CPython 3.14,
// Go's regexp built natively, the system's libpcre2-8 through scripts/regex-ref/pcre2ref.c, Ruby 3.3).
import { readFileSync } from 'node:fs';

export default async (t, { load, wasm }) => {
  const C = await load('src/lib/regex/common.ts');
  const F = await load('src/lib/regex/flavours.ts');
  const { runJs } = await load('src/lib/regex/js.ts');
  const { runPcre2 } = await load('src/lib/regex/pcre2.ts');
  const { runPython } = await load('src/lib/regex/python.ts');
  const { runGo, goRequest } = await load('src/lib/regex/go.ts');
  const R = await load('src/lib/regex/ruby.ts');
  const REF = JSON.parse(readFileSync('tests/fixtures/regex/reference.json', 'utf8'));
  const py = await WebAssembly.compile(readFileSync('src/wasm/bin/python.wasm')), zip = new Uint8Array(readFileSync('src/wasm/bin/python314.zip'));
  const go = await WebAssembly.compile(readFileSync('src/wasm/bin/regex-go.wasm'));
  await R.loadOnig(readFileSync('node_modules/vscode-oniguruma/release/onig.wasm'));
  const P = await load('src/lib/regex/perl.ts');
  const { ZeroPerl } = await import(new URL('../../node_modules/@6over3/zeroperl-ts/dist/esm/index.js', import.meta.url).href);
  const zpWasm = readFileSync('node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm'), zpOut = { text: '' };
  const perl = await ZeroPerl.create({ stdout: (d) => { zpOut.text += typeof d === 'string' ? d : new TextDecoder().decode(d); }, stderr: () => {}, fetch: async () => new Response(zpWasm, { headers: { 'content-type': 'application/wasm' } }) });
  const { runPosix, sedSub } = await load('src/lib/regex/posix.ts');
  const px = await wasm('posix-re');
  const engines = { posix: (q) => runPosix(px, q), python: (q) => runPython(py, zip, q), pyregex: (q) => runPython(py, zip, q, 'regex'), go: (q) => runGo(go, q), pcre2: (q) => runPcre2(q), ruby: (q) => R.runRuby(q), perl: (q) => P.runPerl(perl, zpOut, q) };

  // where Oniguruma (the tab's Ruby engine) is not Onigmo (Ruby's own): each one named, with what Ruby does
  const RUBY_DIFFERS = {};
  // the tab's PCRE2 (pcre2-wasm 10.49) is newer than the reference here (the system's 10.42): with u (UCP) \w also
  // takes a combining mark, and \p{Greek} goes by Unicode's Script Extensions (U+0301 is used by Greek too) — as Perl does
  // the tab's Perl (zeroperl, 5.42: Unicode 16) is newer than the reference here (5.38: Unicode 15): U+0301's Script
  // Extensions include Greek since Unicode 16
  const PERL_NEWER = { '\\p{Greek}+|': 'Unicode 16: U+0301 belongs to Greek by its Script Extensions' };
  const PCRE2_NEWER = { '\\w+|u': 'UCP \\w takes combining marks (e + U+0301 is one word)', '\\p{Greek}+|': '\\p{Greek} by Script Extensions (U+0301)' };

  const shape = (r) => ({ names: r.names, total: r.total, matches: r.matches.map((m) => [m.index, m.text, ...m.groups]) });
  t.ok(Object.keys(REF.cases).sort().join() === 'go,pcre2,perl,posix,pyregex,python,ruby', `reference of ${Object.entries(REF.engines).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  for (const [fl, cases] of Object.entries(REF.cases)) {
    for (const c of cases) {
      const q = { pattern: c.pattern, flags: c.flags, text: c.text, replacement: c.rep, all: c.all };
      const what = `${fl} /${c.pattern.length > 40 ? c.pattern.slice(0, 40) + '…' : c.pattern}/${c.flags} on ${JSON.stringify(c.text.length > 30 ? c.text.slice(0, 30) + '…' : c.text)}${c.rep !== null ? ` → ${JSON.stringify(c.rep)}${c.all ? '' : ' (first)'}` : ''}`;
      let r, err = null;
      try { r = await engines[fl](q); } catch (e) { err = e; }
      const want = c.out, known = (fl === 'ruby' && RUBY_DIFFERS[c.pattern]) || (fl === 'pcre2' && PCRE2_NEWER[`${c.pattern}|${c.flags}`])
        || (fl === 'perl' && PERL_NEWER[`${c.pattern}|${c.flags}`]);
      if (want.error !== undefined) {
        // the same engine gives the same words (Python, Go); PCRE2 10.42 here and 10.49 in the tab, Onigmo and Oniguruma,
        // word some errors differently — that it is refused is what must agree
        const same = fl === 'python' || fl === 'pyregex' || fl === 'go' || fl === 'posix' ? err?.message === want.error : fl === 'perl' ? err?.message.split(' in regex')[0] === want.error.split(' in regex')[0] : !!err;
        t.ok(err instanceof C.PatternError && same, `${what}: refused as the native engine refuses it — ${JSON.stringify(want.error)}${err ? ` (ours: ${JSON.stringify(err.message)})` : ' (ours compiled it)'}`);
        continue;
      }
      if (err) { t.ok(!!known, `${what}: ${err.message}${known ? ` — known: ${known}` : ''}`); continue; }
      const got = shape(r), exp = { names: want.names ?? got.names, total: want.total, matches: want.matches }; // Perl: no names by number to compare
      const eq = JSON.stringify(got) === JSON.stringify(exp);
      t.ok(eq || !!known, `${what}: the matches, groups and names of the native engine${eq ? '' : ` — ours ${JSON.stringify(got).slice(0, 300)}, native ${JSON.stringify(exp).slice(0, 300)}${known ? ` (known: ${known})` : ''}`}`);
      if (c.rep !== null) {
        const ok = want.repError ? !!r.repError && (!fl.startsWith('py') || r.repError === want.repError) : r.replaced === want.replaced && !r.repError;
        t.ok(ok || !!known, `${what}: the replacement — ${want.repError ? `refused (${JSON.stringify(want.repError)}; ours ${JSON.stringify(r.repError)})` : JSON.stringify(want.replaced?.slice(0, 80))}${ok ? '' : ` — ours ${JSON.stringify(r.repError || r.replaced?.slice(0, 80))}`}`);
      }
    }
  }

  // the JavaScript flavour: the browser's engine (here V8, the same as Chromium's)
  const js = (pattern, flags, text, replacement = null) => runJs({ pattern, flags, text, replacement, all: true });
  let r = js('(\\d)(x)?', 'g', 'a1b2x', '[$1$2]');
  t.eq([r.total, r.matches.map((m) => [m.index, m.text, ...m.groups]), r.replaced], [2, [[1, '1', '1', null], [3, '2x', '2', 'x']], 'a[1]b[2x]'], 'JavaScript: matches, a group that took no part (null), the replacement');
  t.eq(js('a', '', 'aaa', '-').replaced, '-aa', 'JavaScript without g: the first match only (String.replace)');
  t.throws(() => js('(', 'g', 'x'), 'JavaScript: a pattern that does not compile is a PatternError');
  t.eq(js('.', 'g', 'x'.repeat(1500)).matches.length, C.SHOWN, `at most ${C.SHOWN} matches listed`);

  // the helpers
  t.eq(sedSub('<&|\\1|\\&|\\\\|\\n|\\U\\1x\\E|\\u\\2|\\Lab\\uc>', ['ab', 'a', 'b']), '<ab|a|&|\\|\n|AX|B|abC>', "sed's replacement: & \\1 \\& \\\\ \\n \\U…\\E \\u \\L");
  t.eq(Array.from(C.utf8Index('aé🎉\ud800b')), [0, 1, -1, 2, -1, -1, -1, 4, -1, -1, 5, 6], 'UTF-8 offsets → UTF-16 (é two bytes, 🎉 four, a lone surrogate three — as TextEncoder writes it)');
  t.eq(Array.from(C.codePointIndex('aé🎉\ud800b')), [0, 1, 2, 4, 5, 6], 'code points → UTF-16 (a pair is one code point, a lone surrogate one)');
  t.eq(C.fromOffsets('ab🎉c', [2, 4, 2, 4, -1, -1]), { index: 2, text: '🎉', groups: ['🎉', null] }, 'a match from offsets, a group that took no part');
  t.eq(F.namedGroups('(a)(?<x>b)(?:c)(?=d)(?<!e)(?P<y>f)[(](\\()(?#(no))'), ['', 'x', 'y', ''], 'PCRE2 names: (?<x>), (?P<y>), plain groups; look-arounds, classes, escapes and comments skipped');
  t.eq(F.namedGroups('(a)(?<x>b)(c)', { ruby: true }), ['x'], 'Ruby: once a group has a name, plain groups do not capture');
  t.eq(F.namedGroups('[a-z&&[^aeiou]](x)', { ruby: true }), [''], 'Ruby: a class inside a class');
  t.eq(F.namedGroups('(a)(?|(b)|(c))'), null, "PCRE2's branch reset: the numbering is not plain (no names guessed)");
  t.eq(F.namedGroups('(?(1)a|b)(x)', {}), [''], 'a condition\'s parentheses are no group');
  t.eq(F.namedGroups('(a)(b)', { noCapture: true }), [], "PCRE2's n: plain groups do not capture");
  t.eq(F.namedGroups('(a) # (b)\n(c)', { extended: true }), ['', ''], 'x: a # comment is skipped');
  const fl = (id, f) => F.flagsError(F.flavour(id), f);
  t.eq([fl('js', 'gi'), fl('python', 'imsxa'), fl('pyregex', 'imsxaVfbepwr'), fl('go', 'imsU'), fl('ruby', 'imx'), fl('pcre2', 'imsxnUJDAu'), fl('perl', 'imsxna'), fl('posix', 'im')], [null, null, null, null, null, null, null, null], 'every flavour\'s own flags are accepted');
  t.eq(fl('pyregex', 'v'), '“v” is not a flag in Python. The flags are i m s x a V f b e p r w.', 'the regex module: V (version 1) is a capital');
  t.eq(fl('python', 'g'), '“g” is not a flag in Python. The flags are i m s x a.', 'Python has no g (Replace every match does it)');
  t.eq(fl('go', 'ii'), 'Flag i is given twice.', 'a repeated flag');
  t.eq(fl('js', 'x'), '“x” is not a flag. The flags are g i m s u v y d.', 'JavaScript\'s message as before');
  t.eq(R.rubySub('[\\0|\\&|\\1|\\`|\\\'|\\\\|\\q|\\k<y>]', 'xab', [[1, 2], [1, 2]], ['y'], false), '[a|a|a|x|b|\\|\\q|a]', 'Ruby\'s replacement: \\0 \\& \\1 \\` \\\' \\\\, other escapes kept, \\k<name>');
  t.eq(R.rubySub('\\1', 'ab', [[0, 1], [0, 1]], ['y'], true), '', 'Ruby: with named groups \\1 gives nothing');
  t.throws(() => R.rubySub('\\k<z>', 'a', [[0, 1]], [], false), 'Ruby: an unknown name in the replacement is an error (as Ruby\'s IndexError)');
  t.eq(new TextDecoder().decode(goRequest({ pattern: 'é', flags: 'i', text: 'ab', replacement: null, all: true })), `2:é1:i2:ab1:00:1:1${String(C.SHOWN).length}:${C.SHOWN}${String(C.COUNTED).length}:${C.COUNTED}`, "the Go module's request: byte lengths");
};
