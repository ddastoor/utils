export default async (t, { load, wasm }) => {
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const tc = bindTextcore(await wasm('textcore'));
  const apply = (A, B, ops) => ops.filter((o) => o.kind !== 'del').map((o) => (o.kind === 'eq' ? A[o.a] : B[o.b]));
  const check = (A, B, label, maxEdits) => {
    const ops = tc.diff(A, B);
    t.eq(apply(A, B, ops), B, `${label}: edit script reproduces B`);
    t.eq(ops.filter((o) => o.kind !== 'ins').map((o) => A[o.a]), A, `${label}: edit script covers A`);
    if (maxEdits !== undefined) t.eq(ops.filter((o) => o.kind !== 'eq').length, maxEdits, `${label}: minimal edits`);
  };
  check('abcabba'.split(''), 'cbabac'.split(''), 'Myers paper example', 5);
  check([], [], 'empty'); check(['a'], [], 'all deleted', 1); check([], ['a', 'b'], 'all inserted', 2);
  check('the quick brown fox'.split(' '), 'the slow brown dog'.split(' '), 'words', 4);
  check(['same', 'same'], ['same', 'same'], 'identical', 0);
  const big = Array.from({ length: 5000 }, (_, i) => `line ${i}`), big2 = big.slice(); big2.splice(2500, 1, 'changed'); big2.push('tail');
  check(big, big2, '5000 lines', 3);
  for (let r = 0; r < 30; r++) { const A = Array.from({ length: 40 }, () => 'abcde'[Math.floor(Math.random() * 5)]), B = Array.from({ length: 35 }, () => 'abcde'[Math.floor(Math.random() * 5)]); check(A, B, `random ${r}`); }
  t.eq(tc.diff(Array.from({ length: 300 }, (_, i) => 'a' + i), Array.from({ length: 300 }, (_, i) => 'b' + i), 10), null, 'max distance cap');
};
