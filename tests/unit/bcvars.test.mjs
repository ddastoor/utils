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
};
