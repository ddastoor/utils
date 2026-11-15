// Everyday helpers + fair randomness in crypto.wasm (libsodium CSPRNG): shuffle, sampling, UUIDs.
export default async (t, { load, wasm }) => {
  const e = await load('/src/tools/everyday.ts');
  t.eq(e.clock(0), '00:00', 'clock zero'); t.eq(e.clock(61500, true), '01:01.50', 'clock hundredths'); t.eq(e.clock(3723000), '1:02:03', 'clock hours');
  const { bindSodium } = await load('/src/wasm/crypto.ts');
  const exports = await wasm('crypto'); exports.u_init();
  const na = bindSodium({ exports, memory: exports.memory });
  const arr = Array.from({ length: 50 }, (_, i) => i), s = na.shuffle(arr);
  t.eq([...s].sort((a, b) => a - b), arr, 'shuffle is a permutation'); t.ok(s.some((x, i) => x !== i), 'shuffle changes order');
  t.eq(na.shuffle([]), [], 'shuffle of empty list'); t.eq(na.shuffle(['x']), ['x'], 'shuffle of one');
  // fairness: each of 3 items lands first ~1/3 of the time; each of 6 permutations ~1/6
  const counts = [0, 0, 0], perms = new Map();
  for (let i = 0; i < 30000; i++) { const p = na.permutation(3); counts[p[0]]++; const k = p.join(''); perms.set(k, (perms.get(k) || 0) + 1); }
  t.ok(counts.every((c) => Math.abs(c - 10000) < 600), `first-place fairness ${counts}`);
  t.ok(perms.size === 6 && [...perms.values()].every((c) => Math.abs(c - 5000) < 450), `all 6 permutations equally likely ${[...perms.values()]}`);
  // sampling
  const u = na.sample(10, 10, true); t.eq([...u].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'unique sample of the whole range');
  const big = na.sample(1000000, 1000, true); t.eq(new Set(big).size, 1000, 'unique sparse sample'); t.ok(big.every((v) => v >= 0 && v < 1000000), 'in range');
  t.throws(() => na.sample(5, 6, true), 'too many unique values rejected');
  const dice = new Array(6).fill(0); for (const v of na.sample(6, 60000)) dice[v]++;
  t.ok(dice.every((c) => Math.abs(c - 10000) < 500), `uniform die ${dice}`);
  t.ok(na.sample(0, 5).every((v) => v >= 0 && v <= 0xffffffff), 'span 0 = full 32-bit range');
  // UUIDs (RFC 9562)
  const v4 = na.uuid(4), v7 = na.uuid(7, 1700000000000);
  t.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v4), `v4 format ${v4}`);
  t.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v7), `v7 format ${v7}`);
  t.eq(parseInt(v7.replace(/-/g, '').slice(0, 12), 16), 1700000000000, 'v7 embeds the millisecond timestamp');
  t.ok(na.uuid(7, 1) < na.uuid(7, 2), 'v7 sorts by time'); t.ok(na.uuid(4) !== na.uuid(4), 'v4 unique');
};
