// Password Generator (src/lib/passwords.ts on libsodium.js's randombytes_uniform): the alphabets, the symbols box,
// one of each set, the exact count of passwords (held to counting every string by brute force), log2 of big numbers,
// and the distribution: every password the settings allow is equally likely (χ² over the pattern of sets, whose
// probabilities follow from the set sizes alone).
const chi2 = (obs, exp) => { const df = obs.length - 1, chi = obs.reduce((s, o, i) => s + (o - exp[i]) ** 2 / exp[i], 0), z = 3.719; return { chi, crit: df * (1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))) ** 3, df }; };

export default async (t, { load }) => {
  const P = await load('/src/lib/passwords.ts');
  const { bindLibsodium } = await load('/src/wasm/libsodium.ts');
  const m = await import('libsodium-wrappers-sumo'); const s = m.default ?? m; await s.ready;
  const na = bindLibsodium(s);
  const O = (x = {}) => ({ len: 20, upper: true, lower: true, digits: true, symbols: true, symbolSet: P.SETS.symbols, avoidLookalikes: false, ...x });

  // ---- the alphabets
  t.eq(Object.values(P.SETS).map((x) => x.length), [26, 26, 10, 27], 'set sizes');
  t.eq(P.alphabets(O()).join('').length, 89, '89 characters by default');
  t.eq(P.alphabets(O({ avoidLookalikes: true })).map((x) => x.length), [24, 24, 8, 27], 'look-alikes out: I O / l o / 0 1 (the default symbols hold none of them)');
  t.eq(P.alphabets(O({ avoidLookalikes: true, symbolSet: '!|`\'"#' })).at(-1), '!#', '… and | ` \' " when they are typed into the symbols box');
  t.ok(!P.alphabets(O({ avoidLookalikes: true })).join('').match(/[Il1|O0o`'"]/), '… none of them left');
  t.eq(P.cleanSymbols('!!@ #a1é$'), { set: '!@#$', dropped: ' a1é' }, 'the symbols box: each symbol once, in the order typed; letters, digits, spaces and non-ASCII left out (and said)');
  t.eq(P.cleanSymbols('\\"\'`~'), { set: '\\"\'`~', dropped: '' }, 'quotes, backslash and backtick are symbols');
  t.eq(P.alphabets(O({ upper: false, lower: false, digits: false, symbolSet: 'abc' })), [], 'a symbols box without symbols: no set (was an endless loop when that set was required)');
  t.eq(P.alphabets(O({ upper: false, lower: false, symbols: false })), ['0123456789'], 'digits only (a PIN)');

  // ---- one of each set, and when not
  t.ok(P.requiresEach(O()), 'one of each set at length 20');
  t.ok(!P.requiresEach(O({ len: 3 })), '… not when the password is shorter than the number of sets');
  t.ok(!P.requiresEach(O({ upper: false, lower: false, symbols: false })), '… not with one set');
  const rnd = na.uniform;
  { let all = true, chars = true;
    const alpha = P.alphabets(O()).join('');
    for (let k = 0; k < 2000; k++) { const pw = P.makePassword(O({ len: 4 }), rnd); if (pw.length !== 4) all = false; if (![...pw].every((c) => alpha.includes(c))) chars = false;
      if (!(/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw))) all = false; }
    t.ok(all && chars, '2,000 passwords of 4 characters: each holds all four sets, only characters of the alphabet'); }
  t.eq(P.makePassword(O({ len: 2 }), rnd).length, 2, 'shorter than the number of sets: made without the rule (no endless loop)');
  t.eq(await Promise.resolve().then(() => { try { P.makePassword(O({ upper: false, lower: false, digits: false, symbols: false }), rnd); return 'made'; } catch (e) { return e.message; } }), 'Pick at least one character set.', 'no set: refused');

  // ---- the exact count, held to brute force
  const brute = (o) => {
    const sets = P.alphabets(o), all = sets.join(''), each = P.requiresEach(o, sets);
    let n = 0; const idx = Array(o.len).fill(0);
    for (;;) {
      const pw = idx.map((i) => all[i]).join('');
      if (!each || sets.every((x) => [...pw].some((c) => x.includes(c)))) n++;
      let k = 0; while (k < o.len && ++idx[k] === all.length) idx[k++] = 0;
      if (k === o.len) return BigInt(n);
    }
  };
  const small = [
    O({ len: 4, upper: false, lower: false, symbolSet: '!@' }),
    O({ len: 5, upper: false, lower: false, symbolSet: '#' }),
    O({ len: 3, upper: false, lower: false, symbolSet: '!@#' , avoidLookalikes: true }),
    O({ len: 2, upper: false, lower: false, symbolSet: '!@' }),
    O({ len: 4, upper: false, digits: false, lower: false, symbolSet: '!@#$' }),
    O({ len: 3, lower: false, digits: false, symbolSet: '-' }),
  ];
  t.eq(small.map((o) => P.countPasswords(o).toString()), small.map((o) => brute(o).toString()), 'the count by inclusion–exclusion = every string counted one by one (six small settings, with and without one-of-each)');
  t.eq(P.countPasswords(O({ len: 20, upper: false, lower: false, symbols: false })), 10n ** 20n, 'digits only: 10^20');
  { const bits = P.entropyBits(O()), naive = 20 * Math.log2(89);
    t.ok(naive - bits > 0.1 && naive - bits < 0.2, `the default (20, four sets): ${bits.toFixed(3)} bits, a little under 20 × log2(89) = ${naive.toFixed(3)} (passwords missing a set — 9.5 % of all, mostly without a digit — are not made)`); }
  { const bits = P.entropyBits(O({ len: 6 })), naive = 6 * Math.log2(89);
    t.ok(naive - bits > 0.6, `at 6 characters the rule costs ${(naive - bits).toFixed(2)} bits — the tab said ${Math.round(naive)}, it is ${Math.round(bits)}`); }
  t.near(P.log2big(2n ** 200n), 200, 1e-12, 'log2 of 2^200');
  t.near(P.log2big(3n ** 100n), 100 * Math.log2(3), 1e-9, 'log2 of 3^100');
  t.near(P.log2big(12345n), Math.log2(12345), 1e-12, 'log2 of a small number');
  t.eq(P.strengthLabel(39.9)[0] + P.strengthLabel(40)[0] + P.strengthLabel(64)[0] + P.strengthLabel(90)[0], 'WeakFairStrongVery strong', 'labels at 40 / 64 / 90 bits');

  // ---- every allowed password equally likely: the pattern of sets of a 4-character password
  { const o = O({ len: 4, symbolSet: '!@#$%^&*()' }), sets = P.alphabets(o), size = sets.map((x) => x.length), N = Number(P.countPasswords(o));
    const perms = []; const permute = (a, k = 0) => { if (k === a.length) perms.push([...a]); for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; permute(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } }; permute([0, 1, 2, 3]);
    const key = (pw) => [...pw].map((c) => sets.findIndex((x) => x.includes(c))).join('');
    const count = new Map(perms.map((p) => [p.join(''), 0])), n = 24000;
    for (let k = 0; k < n; k++) { const kk = key(P.makePassword(o, rnd)); count.set(kk, (count.get(kk) ?? 0) + 1); }
    const exp = perms.map((p) => n * p.reduce((m, i) => m * size[i], 1) / N), r = chi2(perms.map((p) => count.get(p.join(''))), exp);
    t.ok(count.size === 24 && r.chi < r.crit, `24 orders of the four sets, each as often as its share of the passwords: χ² = ${r.chi.toFixed(1)} (df ${r.df}, limit ${r.crit.toFixed(1)})`);
    // a character's share: the passwords with it in the first place = strings of 19 holding every other set
    const o20 = O({ len: 20 }), sets20 = P.alphabets(o20), T = sets20.reduce((a, x) => a + x.length, 0), N20 = P.countPasswords(o20);
    const withFirst = (si) => { let sum = 0n; const others = sets20.map((x, i) => i).filter((i) => i !== si);
      for (let mask = 0; mask < 1 << others.length; mask++) { let size = T, k = 0; others.forEach((i, b) => { if (mask & (1 << b)) { size -= sets20[i].length; k++; } }); sum += (k % 2 ? -1n : 1n) * BigInt(size) ** 19n; }
      return Number(sum * 10n ** 12n / N20) / 1e12; };
    const share = sets20.map((_, i) => withFirst(i));
    const charCount = new Map(), pwN = 20000; for (let k = 0; k < pwN; k++) for (const c of P.makePassword(o20, rnd)) charCount.set(c, (charCount.get(c) ?? 0) + 1);
    const chars = sets20.flatMap((x, i) => [...x].map((c) => [c, share[i]]));
    const r2 = chi2(chars.map(([c]) => charCount.get(c) ?? 0), chars.map(([, p]) => pwN * 20 * p));
    t.ok(Math.abs(chars.reduce((a, [, p]) => a + p, 0) - 1) < 1e-9 && r2.chi < r2.crit, `characters of 20,000 passwords of 20: each as often as the exact share (a digit ${(share[2] * 100).toFixed(3)} %, a letter ${(share[0] * 100).toFixed(3)} %): χ² = ${r2.chi.toFixed(1)} (df ${r2.df}, limit ${r2.crit.toFixed(1)})`);
  }
};
