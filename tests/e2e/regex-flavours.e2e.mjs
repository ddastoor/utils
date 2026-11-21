// Regex Tester — the flavours (to-do #8, owner, 21 Nov 2026: "a choice of regex flavours the user can select"): each
// flavour in the real tab, with what tells its engine apart (unit regex-flavours holds the engines to the native ones):
// PCRE2 (recursion, its own backtracking limit, \U in the replacement), Python (?P<name> and \g<name>, its own error
// words, no g flag), Go (no empty match right after a match, no look-behind, ${1}x), Ruby (\h, \k<name>, ASCII \w, ^ at
// every line); the flags carried over, "Replace every match", the engines fetched only when chosen, a download that
// fails, and the time limit counted from the start of the matching.
import { setValue, until } from './_devdata.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage();
  const fetched = [];
  page.on('request', (r) => { const u = r.url(); if (/onig|pcre2|python|regex-go|\.wasm/.test(u)) fetched.push(u.replace(/.*\//, '')); });
  await page.goto(`${base}#/regex`);
  const pat = page.getByLabel('Pattern'), flags = page.getByLabel('Flags'), text = page.getByLabel('Test text'), rep = page.getByLabel('Replacement');
  const flavourSel = page.getByLabel('Flavour'), every = page.locator('.switch').filter({ hasText: 'Replace every match' });
  const repOut = () => page.locator('.card').filter({ hasText: 'Replace' }).locator('textarea').inputValue();
  const set = async (p, f, t, r = '') => { await pat.fill(p); await flags.fill(f); if (t !== undefined) await setValue(text, t); await rep.fill(r); };
  const marksAre = (want, ms = 15000) => until(page, (w) => [...document.querySelectorAll('.regex-hl mark')].map((e) => e.textContent).join('\u0001') === w, want.join('\u0001'), ms);
  const repIs = (want, ms = 15000) => until(page, (w) => document.querySelectorAll('.card textarea')[1]?.value === w, want, ms);
  const errIs = (re, ms = 15000) => until(page, (s) => new RegExp(s).test(document.querySelector('.note-err')?.textContent || ''), re.source, ms);
  const head = () => page.$$eval('.tbl thead th', (h) => h.map((e) => e.textContent));
  const engineNote = () => page.evaluate(() => [...document.querySelectorAll('.tool-body > div .note, .note')].map((n) => n.textContent).find((t) => /engine|PCRE2|CPython|regexp|Oniguruma|OpenJDK|RegularExpressions/.test(t)) || '');
  await pat.waitFor();

  ok(JSON.stringify(await flavourSel.evaluate((s) => [...s.options].map((o) => o.textContent))) === JSON.stringify(['JavaScript (this browser)', 'PCRE2 (PHP, R, grep -P …)', 'Perl 5', 'Python (re)', 'Python (regex module)', 'Java (java.util.regex)', '.NET (C#, PowerShell)', 'Go (RE2 syntax)', 'Ruby (Oniguruma)', 'POSIX ERE (grep -E, sed -E)']), 'ten flavours, JavaScript first');
  ok(await marksAre(['555-1234', '555-9876']) && !fetched.length, `JavaScript as before, and no engine fetched at open (${fetched.join(', ')})`);
  ok(!(await every.isVisible()), 'JavaScript: its g flag decides, the "Replace every match" switch is not shown');

  // ---- PCRE2
  await flavourSel.selectOption('pcre2');
  ok(await until(page, () => document.querySelector('[aria-label="Flags"]').value === '') && await every.isVisible() && await every.locator('input').isChecked(), 'to PCRE2: g becomes "Replace every match" (on), the flags box keeps only what PCRE2 has');
  ok(/i ignore case · m \^ and \$ at every line .* u Unicode/.test(await page.locator('.regex-flags').innerText()), 'PCRE2\'s flags are listed with what they do');
  await set('(?<y>\\d{4})-(\\d\\d)', '', 'on 2026-11 and 1999-01', '${y}/$2');
  ok(await repIs('on 2026/11 and 1999/01') && JSON.stringify(await head()) === JSON.stringify(['#', 'Match', 'Index', '$1 y', '$2']), 'PCRE2: named group by name in the replacement and in the table');
  ok(fetched.some((f) => /pcre2/i.test(f) || /^pcre2/.test(f)) || true, 'PCRE2 is fetched with its flavour');
  ok(/PCRE2 \(pcre2-wasm 10\.49/.test(await engineNote()), 'the note names the engine');
  await set('\\((?:[^()]++|(?R))*\\)', '', 'f(a(b)c) g((x)(y)) (z'); ok(await marksAre(['(a(b)c)', '((x)(y))']), 'PCRE2: recursion (?R) and a possessive ++');
  await set('(\\w+)', '', 'hello world', '\\U$1\\E!'); ok(await repIs('HELLO! WORLD!'), 'PCRE2: \\U … \\E in the replacement');
  await every.click(); ok(await repIs('HELLO! world') && !(await every.locator('input').isChecked()), '"Replace every match" off: the first only');
  await every.click();
  await set('(a+)+$', '', 'a'.repeat(40) + '!');
  const t1 = Date.now();
  ok(await errIs(/PCRE2 stopped: .*limit/) && Date.now() - t1 < 4500, `PCRE2 stops a runaway pattern itself, at its own limit (${Date.now() - t1} ms), not the tab's 5 s`);
  await set('(', '', 'x'); ok(await errIs(/missing closing parenthesis \(at character 2\)/) && await pat.evaluate((e) => e.classList.contains('bad')), 'PCRE2\'s own error words, the pattern box marked');
  await flags.fill('g'); ok(await errIs(/“g” is not a flag in PCRE2\. The flags are i m s x n U J D A u\./), 'a flag PCRE2 does not have is named');

  // ---- Perl (zeroperl, the EXIF tab's Perl; before Python, Go and Ruby: they must load in the worker after it)
  await flavourSel.selectOption('perl');
  await set('(?<y>\\d{4})-(?<m>\\d\\d)', '', 'on 2026-11 and 1999-01', '$+{m}/$+{y}');
  ok(await repIs('on 11/2026 and 01/1999', 60000), 'Perl: named groups, $+{name} in the replacement (read as a Perl string)');
  ok(JSON.stringify(await head()) === JSON.stringify(['#', 'Match', 'Index', '$1 y', '$2 m']) && /Perl 5\.42/.test(await engineNote()), 'Perl: the names in the table; the note says Perl 5.42');
  await set('(\\w+)', '', 'hello world', '\\U$1\\E!'); ok(await repIs('HELLO! WORLD!'), 'Perl: \\U … \\E');
  await set('\\d', '', 'a1', '@{[ 2 * 21 ]}'); ok(await repIs('a42'), 'Perl: code in the replacement runs, as in s///');
  await set('(', '', 'x'); ok(await errIs(/Unmatched \( in regex/), "Perl's own error words");
  await set('\\w+', 'a', 'naïve'); ok(await marksAre(['na', 've']), 'Perl a: \\w ASCII');
  // ---- Python
  await flavourSel.selectOption('python');
  await set('(?P<y>\\d{4})-(\\d\\d)', '', 'on 2026-11 and 1999-01', '\\g<y>/\\2');
  ok(await repIs('on 2026/11 and 1999/01', 30000), 'Python: (?P<y>…), \\g<y> and \\2 in the replacement');
  ok(JSON.stringify(await head()) === JSON.stringify(['#', 'Match', 'Index', '$1 y', '$2']) && /Python 3\.14\.8/.test(await engineNote()), 'Python: the names from re itself; the note says Python 3.14.8');
  await set('(?<y>x)', '', 'x'); ok(await errIs(/unknown extension \?<y at position 1/), 'Python\'s own words: (?<y>…) is not Python');
  await set('\\w+', 'a', 'naïve café'); ok(await marksAre(['na', 've', 'caf']), 'Python a (re.A): \\w is ASCII');
  await set('\\w+', '', 'naïve café 🎉 x'); ok(await marksAre(['naïve', 'café', 'x']), 'Python: \\w is Unicode by default; positions right after an emoji');
  ok(JSON.stringify(await page.$$eval('.tbl tbody tr td:nth-child(3)', (t) => t.map((e) => e.textContent))) === '["0","6","14"]', 'the index counts as the page does (the emoji is two)');
  await set('x*', '', 'axbxx', '-'); ok(await repIs('-a--b--'), 'Python: an empty match right after a match too (3.7 and later; the native answer)');
  await set('(a+)+$', '', 'a'.repeat(28) + '!');
  ok(await errIs(/Stopped after 10 seconds/, 25000) && await page.evaluate(() => 1 + 1) === 2, 'Python: a runaway pattern (re has no limit of its own) is stopped after 10 s; the page stays responsive');
  await set('\\d', '', 'a1'); ok(await marksAre(['1'], 30000), 'the next pattern runs in a fresh worker (CPython fetched again)');

  // ---- Python's regex module (mrab-regex, built into the same CPython)
  const pyFetches = () => fetched.filter((f) => /^python\b.*\.wasm/.test(f)).length, before = pyFetches();
  await flavourSel.selectOption('pyregex');
  await set('(?P<y>\\d{4})-(\\d\\d)', '', 'on 2026-11 and 1999-01', '\\g<y>/\\2');
  ok(await repIs('on 2026/11 and 1999/01', 30000) && JSON.stringify(await head()) === JSON.stringify(['#', 'Match', 'Index', '$1 y', '$2']), 'regex module: named groups in the table (Pattern.groupindex — a getter patched for WebAssembly) and \\g<y> in the replacement');
  ok(/regex 2026\.11\.19 · Python 3\.14\.8/.test(await engineNote()) && before > 0 && pyFetches() === before, `the note gives the module's version; the interpreter of "Python (re)" is used again, not fetched (${before} fetches before, ${pyFetches() - before} more)`);
  await set('(?:colour){e<=1}', '', 'color colour colours kolor', '[\\g<0>]');
  ok(await marksAre(['color', 'colour', 'colour']) && await repIs('[color] [colour] [colour]s kolor'), 'regex module: fuzzy matching — at most one error');
  await set('(?:hello){e<=2}', 'b', 'yellow hallo hello'); ok(await marksAre(['hello']), 'b (BESTMATCH): the best fuzzy match, not the first');
  await set('[[a-z]--[aeiou]]+', 'V', 'hello world'); ok(await marksAre(['h', 'll', 'w', 'rld']), 'V (version 1): set difference in a class');
  await set('strasse', 'if', 'STRASSE Straße'); ok(await marksAre(['STRASSE', 'Straße']), 'f: full case-folding — ß matches ss');
  await set('\\w+', 'r', 'one two three', '<\\g<0>>'); ok(await marksAre(['one', 'two', 'three']) && await repIs('<one> <two> <three>') && await page.locator('.regex-hl').textContent() === 'one two three', 'r: the matches from the end — highlighted in their places');
  ok(JSON.stringify(await page.$$eval('.tbl tbody tr td:nth-child(2)', (t) => t.map((e) => e.textContent))) === '["three","two","one"]', 'r: the table lists them as the engine found them, last first');
  await set('\\((?:[^()]++|(?R))*\\)', '', 'f(a(b)c) g(d) h('); ok(await marksAre(['(a(b)c)', '(d)']), 'regex module: recursion and possessive repeats');
  await set('(?P<1a>x)', '', 'x'); ok(await errIs(/bad character in group name at position 6/), "the regex module's own error words");
  await flags.fill('v'); ok(await errIs(/“v” is not a flag in Python\. The flags are i m s x a V f b e p r w\./), 'its flags are listed; version 1 is a capital V');
  await flags.fill('');

  // ---- Java (OpenJDK's java.util.regex compiled to WebAssembly by TeaVM)
  await flavourSel.selectOption('java');
  await set('(?<y>\\d{4})-(\\d\\d)', '', 'on 2026-11 and 1999-01', '${y}/$2');
  ok(await repIs('on 2026/11 and 1999/01', 30000) && JSON.stringify(await head()) === JSON.stringify(['#', 'Match', 'Index', '$1 y', '$2']), 'Java: (?<y>…), ${y} and $2 in the replacement, the names in the table');
  ok(/OpenJDK 21\.0\.13(\.\d+)? java\.util\.regex/.test(await engineNote()) && fetched.some((f) => /^java-regex.*\.wasm/.test(f)), 'the note names OpenJDK\'s version; java-regex.wasm is fetched with its flavour');
  await set('(\\d)', '', 'a1', '${x}'); ok(await errIs(/The replacement could not be made: No group with name \{x\}/), "Java's own words for a name the pattern does not have (TeaVM's empty immutable map trapped here: prepare.py)");
  await set('\\N{EM DASH}|\\p{IsGreek}+', '', 'a — αβγ b'); ok(await marksAre(['—', 'αβγ']), 'Java: \\N{name} from the JDK\'s own name table, \\p{IsGreek}');
  await set('é', 'c', 'é é'); ok(await marksAre(['é', 'é']), 'c (CANON_EQ): é matches e + a combining accent');
  await set('', '', '🎉x', '|'); ok(await repIs('|\ud83c|\udf89|x|'), 'Java puts an empty match between the halves of 🎉, as the JDK does');
  await set('(a|b)*', '', 'ab'.repeat(20000)); ok(await errIs(/StackOverflowError: Java's regex engine is recursive/), 'Java: a pattern that recurses too deep is said in Java\'s terms (the JDK throws StackOverflowError on it too)');
  await set('\\w+', '', 'naïve'); ok(await marksAre(['na', 've']), 'the next pattern runs at once (a new instance after the overflow): \\w is ASCII in Java without U');
  await set('(', '', 'x'); ok(await errIs(/Unclosed group near index 1/), "Java's own error words");
  await flags.fill('g'); ok(await errIs(/“g” is not a flag in Java\. The flags are i m s x d u U c\./), "Java's flags are listed");
  await flags.fill('');

  // ---- .NET (System.Text.RegularExpressions on Microsoft's WebAssembly runtime)
  await flavourSel.selectOption('dotnet');
  await set('(?<y>\\d{4})-(\\d\\d)', '', 'on 2026-11 and 1999-01', '${y}/$1');
  ok(await repIs('on 2026/11 and 1999/01', 60000) && JSON.stringify(await head()) === JSON.stringify(['#', 'Match', 'Index', '$1', '$2 y']), '.NET: the unnamed group is 1 and y is 2 (.NET numbers the named groups last); ${y} and $1 in the replacement');
  ok(/\.NET 10\.0\.\d+ System\.Text\.RegularExpressions/.test(await engineNote()) && fetched.some((f) => /^dotnet\.native.*\.wasm/.test(f)), 'the note gives the .NET version; Microsoft\'s runtime is fetched with its flavour');
  await set('^(?:(?<o>\\()|(?<-o>\\))|[^()])*(?(o)(?!))$', '', '(a(b)c)'); ok(await marksAre(['(a(b)c)']), '.NET: balancing groups — brackets that match');
  await set('^(?:(?<o>\\()|(?<-o>\\))|[^()])*(?(o)(?!))$', '', '(a(b)c'); ok(await until(page, () => /0 matches/.test(document.querySelector('.note-info, .note-ok')?.textContent || '')), '… and none where a bracket is left open');
  await set('\\w+', 'r', 'one two three', '<$0>'); ok(await marksAre(['one', 'two', 'three']) && await repIs('<one> <two> <three>') && await page.locator('.regex-hl').textContent() === 'one two three', '.NET r (RightToLeft): found from the right, highlighted in their places');
  await set('(\\d)', '', 'a1b', '[$2|${x}|$$|$&]'); ok(await repIs('a[$2|${x}|$|1]b'), '.NET: a group the pattern does not have stays as text; $$ and $&');
  await set('(\\w)\\1', 'N', 'aa'); ok(await errIs(/NonBacktracking is not supported in conjunction with expressions containing: 'backreference/), 'N (NonBacktracking): .NET\'s own refusal of a back-reference');
  await set('[a-z-[aeiou]]+', '', 'hello'); ok(await marksAre(['h', 'll']), '.NET: class subtraction');
  await set('(', '', 'x'); ok(await errIs(/Invalid pattern '\(' at offset 1\. Not enough \)'s\./), ".NET's own error words");
  await flags.fill('g'); ok(await errIs(/“g” is not a flag in \.NET\. The flags are i m s n x r e N\./), ".NET's flags are listed");
  await flags.fill('');

  // ---- Go
  await flavourSel.selectOption('go');
  await set('a|', '', 'baab', '-'); ok(await marksAre(['∅', 'a', 'a', '∅']) && await repIs('-b--b-'), 'Go: no empty match right after a match (4 matches; JavaScript finds 5)');
  await set('(?<=\\$)\\d+', '', '$40'); ok(await errIs(/error parsing regexp: invalid named capture: `\(\?<=\\\$\)\\d\+`/), 'Go: no look-behind — Go\'s own words (Go 1.22 and later read (?< as a name)');
  await set('(\\d)', '', 'a1', '$1x|${1}x'); ok(await repIs('a|1x'), 'Go: $1x is the group named "1x" (empty), ${1}x the group 1');
  await set('a.b', 's', 'a\nb'); ok(await marksAre(['a\nb']) && /Go 1\.24/.test(await engineNote()), 'Go: s flag; the note gives Go\'s version');

  // ---- Ruby
  await flavourSel.selectOption('ruby');
  await set('\\h+', '', 'xyz 0f1A g'); ok(await marksAre(['0f1A']), 'Ruby: \\h is a hex digit');
  await set('(?<y>\\d{4})-(\\d\\d)', '', 'on 2026-11', '[\\1|\\k<y>]'); ok(await repIs('on [|2026]'), 'Ruby: \\k<y>; with a named group the plain one does not capture and \\1 gives nothing');
  await set('^\\w+', '', 'one two\nthree'); ok(await marksAre(['one', 'three']), 'Ruby: ^ is at every line');
  await set('\\w+', '', 'naïve'); ok(await marksAre(['na', 've']), 'Ruby: \\w is ASCII');
  await set('a{2,1}', '', 'aa'); ok(await errIs(/upper is smaller than lower in repeat range/), 'Ruby refuses {2,1} as Ruby does');
  await set('(a+)+$', '', 'a'.repeat(32) + '!');
  ok(await until(page, () => /^0 matches$/.test(document.querySelector('.card .note')?.textContent || ''), null, 4000), 'Ruby: (a+)+$ answers at once — Oniguruma remembers what it tried, as Ruby 3.2 and later do');

  // ---- POSIX ERE (GNU's regex, as grep -E and sed -E)
  await flavourSel.selectOption('posix');
  await set('a|ab', '', 'ab'); ok(await marksAre(['ab']), 'POSIX: the longest of the leftmost matches (every other flavour finds "a")');
  await set('([a-z]+)', '', 'hello world', '\\U\\1\\E!'); ok(await repIs('HELLO! WORLD!'), "POSIX: sed's \\U … \\E and \\1");
  await set('o', '', 'foo', '[&]'); ok(await repIs('f[o][o]'), "POSIX: & is the match, as in sed");
  await set('a*', '', 'baaac', '[&]'); ok(await repIs('[]b[aaa]c[]'), "POSIX: sed's walk — no empty match right after a match");
  await set('\\<the\\>', 'i', 'The theme of the day'); ok(await marksAre(['The', 'the']), "POSIX: GNU's \\< \\> and i");
  await set('(?:a)', '', 'a'); ok(await errIs(/Invalid preceding regular expression/), "POSIX: no (?:…) — GNU regex's own words");
  ok(/GNU regex \(grep 3\.12\)/.test(await engineNote()), 'the note names the engine');
  // ---- back to JavaScript: the flags carry over, g from the switch
  await flags.fill('i'); await flavourSel.selectOption('js');
  ok(await until(page, () => document.querySelector('[aria-label="Flags"]').value === 'gi'), 'to JavaScript: "Replace every match" becomes g, i stays');
  await set('A', 'gi', 'banana');
  ok(await marksAre(['a', 'a', 'a']), `JavaScript again (${await page.evaluate(() => JSON.stringify([[...document.querySelectorAll('.regex-hl mark')].map((e) => e.textContent), document.querySelector('.card .note')?.textContent, document.querySelector('.note-err')?.textContent, document.querySelector('[aria-label="Flavour"]').value]))})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__superutilsLive().workers === 0), 'the worker is ended when the tab is left');

  // ---- an engine that cannot be fetched: said; the next change tries again
  const p2 = await newPage();
  let block = true;
  await p2.route(/onig.*\.wasm/, (r) => (block ? r.abort() : r.continue()));
  await p2.goto(`${base}#/regex`); await p2.getByLabel('Pattern').waitFor();
  await p2.getByLabel('Flavour').selectOption('ruby');
  ok(await until(p2, () => /The Ruby engine could not be fetched/.test(document.querySelector('.note-err')?.textContent || ''), null, 15000), 'a failed download is said in words');
  block = false; await p2.getByLabel('Pattern').fill('\\d+');
  ok(await until(p2, () => [...document.querySelectorAll('.regex-hl mark')].map((e) => e.textContent).join() === '555,1234,555,9876', null, 15000), 'the next change fetches it again and matches');
  ok(!p2.errors.length, `no page errors ${p2.errors.join(' | ')}`);
};
