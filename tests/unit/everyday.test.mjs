export default async (t, { load }) => {
  const e = await load('/src/tools/everyday.ts');
  t.eq(e.clock(0), '00:00', 'clock zero'); t.eq(e.clock(61500, true), '01:01.50', 'clock hundredths'); t.eq(e.clock(3723000), '1:02:03', 'clock hours');
  // shuffle is a permutation and uses the full range of the uniform source
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const arr = Array.from({ length: 50 }, (_, i) => i), s = e.shuffleWith(arr, rnd);
  t.eq([...s].sort((a, b) => a - b), arr, 'shuffle is a permutation'); t.ok(s.some((x, i) => x !== i), 'shuffle changes order');
  // fairness: each of 3 items lands first ~1/3 of the time
  const counts = [0, 0, 0]; for (let i = 0; i < 30000; i++) counts[e.shuffleWith([0, 1, 2], (n) => Math.floor(Math.random() * n))[0]]++;
  t.ok(counts.every((c) => Math.abs(c - 10000) < 600), `shuffle fairness ${counts}`);
};
