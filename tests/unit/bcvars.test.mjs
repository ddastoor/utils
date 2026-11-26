// The bc console's $ names (to-do #10): Excel's column names, case-insensitive look-up, set once, substituted outside
// strings and comments, the user's own names, every change refused.
export default async (t, { load }) => {
  const { columnName, isBcNumber, BcVars } = await load('src/lib/bcvars.ts');

  // Excel's columns, worked out independently: A = 1 … Z = 26, then two letters, then three
  const excel = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[r] + s; n = (n - 1 - r) / 26; } return s; };
  t.eq([1, 2, 26, 27, 28, 52, 53, 702, 703, 704, 728, 18278].map(columnName), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA', 'AAB', 'AAZ', 'ZZZ'], 'A … Z, AA … AZ, BA … ZZ, then AAA, as Excel names its columns');
  let same = true; for (let n = 1; n <= 20000; n++) if (columnName(n) !== excel(n)) { same = false; break; }
  t.ok(same, 'the first 20,000 names equal Excel\'s');

  t.eq(['42', '-5', '3.14', '.5', '-.25', 'FF', '1A.8', '0', '2.'].map(isBcNumber), [true, true, true, true, true, true, true, true, true], 'numbers as bc prints them (also in obase up to 16) get a name');
  t.eq(['hi', '', '-', ' 01 15', '1e5', 'x', 'abc'].map(isBcNumber), [false, false, false, false, false, false, false], 'other rows (text, obase above 16) do not');

  const v = new BcVars();
  t.eq([v.assign('1'), v.assign('2'), v.assign('3')], ['A', 'B', 'C'], 'results are named in turn');
  t.eq(v.prepare('$a + $B * $c').line, '(1) + (2) * (3)', 'a $ name stands for its value in brackets; case does not matter');
  t.eq(v.prepare('2^$A').line, '2^(1)', 'brackets keep a negative value whole wherever it stands');
  t.eq(v.prepare('print "cost $A\\n"; /* $B */ $C # $A').line, 'print "cost $A\\n"; /* $B */ (3) # $A', 'not inside strings and comments');
  t.eq(v.prepare('$A == 1').line, '(1) == 1', 'a comparison is no change');
  t.eq(v.prepare('$A <= 1; $A >= 1; $A != 2').line, '(1) <= 1; (1) >= 1; (1) != 2', '<= >= != are no changes either');
  t.eq(v.prepare('x = 5; x').line, 'x = 5; x', "bc's own variables are left alone");
  t.eq(v.prepare('$').line, '$', 'a lone $ is left to bc');

  const own = v.prepare('$total = 7 * 6');
  t.eq([own.line, own.own, own.error], ['(7 * 6)', 'total', undefined], '$name = expression: the expression in brackets (so that bc prints it), the name kept');
  t.eq(v.assign('42', 'total'), 'total', 'the user\'s name is used as written');
  t.eq(v.prepare('$TOTAL + 1').line, '(42) + 1', 'and found in any case');
  t.ok(/^\$total is set already \(42\)/.test(v.prepare('$Total = 1').error), 'a $ name is set once: = again is refused, with what it holds');
  for (const change of ['$A++', '++$A', '$a--', '--$A', '$A += 1', '$A -= 1', '$A *= 2', '$A /= 2', '$A %= 2', '$A ^= 2', 'x + $A = 3']) {
    t.ok(/cannot be changed: it holds 1/.test(v.prepare(change).error ?? ''), `“${change}” is refused: a $ name cannot be changed`);
  }
  t.ok(/^\$A is set already/.test(v.prepare('$A = 5').error), '$A = 5 when A holds a result: refused');
  t.ok(/^\$nope is not set/.test(v.prepare('$nope + 1').error), 'a name that is not set is said');
  t.ok(/^\$new is not set — set it once with \$new = …/.test(v.prepare('$new += 1').error), 'a change of a name that is not set says how to set one');
  t.ok(/needs an expression/.test(v.prepare('$y =').error), '$y = with nothing on the right');

  const w = new BcVars();
  w.assign('1'); w.assign('2'); w.assign('5', 'c'); // the user took C
  t.eq([w.assign('7'), w.assign('8')], ['D', 'E'], 'the automatic names skip a name the user took (c is C)');
  const z = new BcVars();
  z.assign('9', 'b');
  t.eq([z.assign('1'), z.assign('2'), z.assign('3')], ['A', 'C', 'D'], '… wherever it lies ahead');
  const many = new BcVars();
  let last = ''; for (let i = 0; i < 703; i++) last = many.assign(String(i));
  t.eq([last, many.get('zz')?.value, many.get('aaa')?.value], ['AAA', '701', '702'], 'after ZZ comes AAA (Excel goes on so)');
  many.clear();
  t.eq([many.assign('1'), many.size], ['A', 1], 'a new session starts again at A');

  // ---- bc's own variables as $ names (to-do #25; owner: "> interest=20.78 / > $interest … should also be set")
  const b = new BcVars();
  /** what the console does with a line: prepare it, and learn what it set once bc ran it (here: when it has no error) */
  const line = (src) => { const p = b.prepare(src); if (!p.error) b.learn(p.sets); return p; };
  t.eq(line('interest=20.78').sets, ['interest'], 'interest=20.78 sets bc\'s variable interest');
  t.eq(line('$interest').line, '(interest)', '$interest stands for the variable itself — the value bc holds at that point');
  t.eq(line('$Interest * 2').line, '(interest) * 2', '$Interest is $interest: bc\'s names are lower case');
  t.eq([...b.bcVariables], ['interest'], 'the session\'s bc variables are listed once');
  let p = line('rate = 7.5; years = 10; $rate * $years');
  t.eq([p.line, p.sets], ['rate = 7.5; years = 10; (rate) * (years)', ['rate', 'years']], 'set inside a line with other statements: reached later in the same line');
  t.ok(/^\$later is not set/.test(b.prepare('$later + 1; later = 5').error ?? ''), 'a variable set only further on in the line is not set yet where $ reads it');
  t.eq(line('for (i = 0; i < 3; i++) total += i').sets, ['i', 'total'], 'a loop: its counter and what it adds to');
  t.eq([b.prepare('++count').sets, b.prepare('n--').sets, b.prepare('--m; k++').sets], [['count'], ['n'], ['m', 'k']], '++ and -- before or after a name set it');
  t.eq(b.prepare('if (k == 1) q = 2; if (k <= 1) q2 = 2; k != 1; k >= 1').sets, ['q', 'q2'], 'comparisons set nothing (== <= != >=)');
  t.eq(b.prepare('a[1] = 5; s(1); f(2)').sets, [], 'an array element and function calls are not variables');
  t.eq(b.prepare('print "z = 5\\n"; /* w = 1 */ # q = 2').sets, [], 'nothing inside strings and comments');
  t.eq(line('define f(x, y[]) { auto t, u[]; t = x * 2; g = t; y[0] = 1; return t }').sets, ['g'], 'define: parameters and auto variables are the function\'s own — only g, a global, is the session\'s');
  t.eq(b.prepare('define void h(x) { w = x }').sets, ['w'], 'define void: the same');
  t.eq(b.prepare('x = 1; define e2(x) { return x }; x').sets, ['x'], 'a name set outside a function is the session\'s even when a function takes it as a parameter');
  t.ok(/^\$t is not set/.test(b.prepare('$t').error ?? '') && /^\$x is not set/.test(b.prepare('$x').error ?? ''), 'a function\'s own variables are no $ names');
  t.eq([b.prepare('$scale').line, b.prepare('$ibase + $obase').line], ['(scale)', '(ibase) + (obase)'], 'scale, ibase and obase hold a value from the start');
  // a $ name of a bc variable is for reading
  for (const change of ['$interest += 1', '$interest++', '++$interest', '$interest -= 2', '$rate ^= 2']) {
    t.ok(/is bc's own variable (interest|rate): change it without the \$/.test(b.prepare(change).error ?? ''), `“${change}” is refused: bc's variable is changed without the $`);
  }
  t.ok(/^\$interest is bc's own variable interest: set it without the \$ \(interest = …\), or choose another \$ name/.test(b.prepare('$interest = 5').error ?? ''), '$interest = 5 is refused: it would hide bc\'s variable behind a $ name');
  t.ok(/^\$scale is bc's own variable scale/.test(b.prepare('$scale = 3').error ?? ''), '… and so is $scale = 3');
  // not set: the reason, the way to set it, and the names so far — the results' and the bc variables'
  const ns = b.prepare('$principal').error ?? '';
  t.ok(/^\$principal is not set — set it with principal = … \(a bc variable\) or \$principal = … \(a \$ name, set once\)/.test(ns), `a variable never set: the reason and both ways (${ns})`);
  t.ok(/the names so far: .*\$interest \$rate \$years \$i \$total \$g/.test(ns), 'the names so far include bc\'s variables');
  // a result's name and a bc variable of the same name: the result comes first, and that is said once
  const c = new BcVars();
  c.assign('1'); // A
  t.eq(c.prepare('a = 5').sets, ['a'], 'a = 5 sets bc\'s a');
  c.learn(['a']);
  p = c.prepare('$a + 1');
  t.eq(p.line, '(1) + 1', '$a is the result A where both exist');
  t.ok(/^\$a is the result named A \(1\): a result's name comes first — bc's own variable a is written a, without the \$/.test(p.note ?? ''), 'and the tab says so');
  t.eq(c.prepare('$a * 2').note, undefined, '… once');
  t.eq(c.prepare('$A').line, '(1)', 'in any case');
  c.clear();
  t.ok(/^\$a is not set/.test(c.prepare('$a').error ?? '') && c.bcVariables.length === 0, 'Clear session forgets bc\'s variables too');
  const d = new BcVars();
  d.prepare('nope = 1'); // the console learns only what bc ran: this line failed in bc, say
  t.ok(/^\$nope is not set/.test(d.prepare('$nope').error ?? ''), 'a line bc refused teaches nothing');

  // the substituted session run by the native GNU bc gives the values the owner expects (where /usr/bin/bc is installed)
  const { spawnSync } = await import('node:child_process');
  const e = new BcVars(), session = [];
  for (const src of ['interest=20.78', '$interest', 'interest = 21', '$interest', '$Interest * 2', 'rate = 7.5; years = 10; $rate * $years', 'for (i = 1; i <= 4; i++) total += i', '$total', 'define sq(x) { auto y; y = x * x; z = y; return y }', 'sq(5)', '$z']) {
    const q = e.prepare(src); t.ok(!q.error, `prepared: ${src}`); session.push(q.line); e.learn(q.sets);
  }
  const r = spawnSync('bc', ['-lq'], { input: session.join('\n') + '\n', encoding: 'utf8' });
  if (r.error) t.ok(true, 'native bc not installed: the session was not run (apt install bc)');
  else t.eq(r.stdout.trim().split('\n'), ['20.78', '21', '42', '75.0', '10', '25', '25'], `the native bc runs the session: $interest is 20.78, then 21 after interest = 21; $rate * $years; a loop's total; a global set in define (${JSON.stringify(r.stdout.trim().split('\n'))})`);
};
