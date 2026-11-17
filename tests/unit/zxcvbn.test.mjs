// zxcvbn.wasm (Rust port 3.1.1 + our two fixes, wasm/zxcvbn): compared with the Python port of zxcvbn for 304 passwords
// (tests/fixtures/zxcvbn/reference.json, made by scripts/make-zxcvbn-reference.py) — scores, guess counts, pattern kinds;
// the four crate bugs our patch fixes —
// plus personal words, crack-time rows, the 64-bit ceiling, odd input (empty, very long, emoji, control characters).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (t, { load, wasm, root }) => {
  const { bindZxcvbn, zxImports } = await load('/src/wasm/zxcvbn.ts');
  // The engine reads the current year from the clock (dates and years close to today are easier to guess); the Python port
  // is frozen at 2017 and does not know the years 2020–2029. So: clock set to 2017 for the comparison, and passwords
  // with a 202x year are checked separately (ours must be the lower estimate, with a "recent_year" part).
  const at = (ms) => ({ zxcvbn: { unix_time_milliseconds_imported: () => BigInt(ms) } });
  const z = bindZxcvbn(await wasm('zxcvbn', at(Date.UTC(2017, 5, 1)))), zNow = bindZxcvbn(await wasm('zxcvbn', zxImports));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/zxcvbn/reference.json'), 'utf8'));
  t.ok(ref.passwords.length >= 300, `reference list: ${ref.passwords.length} passwords from ${ref.source}`);

  const scoreDiff = [], guessDiff = [], far = [];
  const y202 = ref.passwords.filter((x) => /202\d/.test(x.p));
  t.ok(y202.length >= 8 && y202.every((x) => { const r = z.check(x.p); return r.guesses <= Number(x.g) * 1.001 && (r.guesses === Number(x.g) || r.sequence.some((m) => m.detail === 'recent_year' || m.kind === 'date')); }), `${y202.length} passwords with a year 2020–2029: recognised as a year (the 2017 reference does not), never a higher estimate`);
  for (const { p, g, s } of ref.passwords) {
    if (/202\d/.test(p)) continue;
    const r = z.check(p), want = Number(g);
    if (r.score !== s) scoreDiff.push(`${p}: ${r.score} vs ${s}`);
    const cap = want >= 1.8e19; // the Rust port counts in 64 bits
    const ratio = cap ? (r.guesses >= 1.8e19 ? 1 : 0) : r.guesses / want;
    if (!(ratio > 0.999 && ratio < 1.001)) guessDiff.push(`${p}: ${r.guesses} vs ${g}`);
    if (!(ratio > 0.1 && ratio < 10)) far.push(`${p}: ${r.guesses} vs ${g}`);
  }
  if (process.env.ZX_DEBUG) writeFileSync(process.env.ZX_DEBUG, JSON.stringify({ scoreDiff, guessDiff, far }, null, 1));
  t.ok(scoreDiff.length === 0, `score equals the reference for every other password (${ref.passwords.length - y202.length}) ${scoreDiff.slice(0, 8).join(' | ')}`);
  t.ok(guessDiff.length === 0, `guess count equals the reference (±0.1 %) for every other password ${guessDiff.slice(0, 8).join(' | ')}`);
  t.ok(far.length === 0, `no estimate is off by 10× ${far.slice(0, 8).join(' | ')}`);

  // the four bugs fixed in our patch (wasm/zxcvbn/zxcvbn-fixes.patch) — exact reference numbers
  const g = (p) => z.check(p).guesses, refG = Object.fromEntries(ref.passwords.map((x) => [x.p, Number(x.g)]));
  for (const p of ['TRUSTNO1', 'SUNSHINE1', 'AB12CD34', 'MH12AB1234', 'LETMEIN1!', 'MONKEY123', '1QAZ2WSX']) t.eq(g(p), refG[p], `ALL-CAPS word with a digit: ${p} = ${refG[p]} guesses (was 2)`);
  for (const p of ['aaaaaaab', '1111112', 'zzzzzzzy', 'aaaaaa1', 'aaaaaaa2']) t.eq(g(p), refG[p], `a repeat followed by one more character is not a "sequence": ${p} = ${refG[p]}`);
  t.ok(z.check('aaaaaaab').sequence.every((m) => m.kind !== 'sequence') && z.check('abcdefgh').sequence[0].kind === 'sequence', 'aaaaaaab has no sequence part; abcdefgh still is one');
  t.eq(g('trustno1'), refG.trustno1, 'lower case unchanged');
  for (const p of ['1', '!!!!!!!!', 'Zxcvbn1', 'passw0rd!', 'Kolkata1', 'abcabc1']) t.eq(g(p), refG[p], `a single character is not a l33t dictionary word: ${p} = ${refG[p]}`);
  t.ok(z.check('1').sequence[0].kind === 'bruteforce' && z.check('Kolkata1').sequence.at(-1).kind === 'bruteforce', '"1" is shown as random, not as a word from a film list');
  for (const p of ['asdf;lkj', '~!@#$%^&*()_+', ",./;'[]", '!@#$%^', '<>?:"{}', '`1234567890-=', 'zaq12wsx', 'qazwsxedc', 'mnbvcxz', '1qaz2wsx']) t.eq(g(p), refG[p], `keyboard walk (fractional average degree): ${p} = ${refG[p]}`);
  t.ok(g('PASSWORD') === refG.PASSWORD && g('Password') === refG.Password && g('pAsSwOrD') === refG.pAsSwOrD, 'upper-case variations: PASSWORD, Password, pAsSwOrD');

  // pattern kinds
  const kinds = (p) => z.check(p).sequence.map((m) => m.kind).join(',');
  t.eq(kinds('password'), 'dictionary', 'password → dictionary'); t.eq(kinds(",./;'[]"), 'keyboard', ",./;'[] → keyboard walk"); t.eq(kinds('qwertyuiop'), 'dictionary', 'qwertyuiop is in the common-password list');
  t.eq(kinds('abcdefgh'), 'sequence', 'abcdefgh → sequence'); t.eq(kinds('aaaaaaaaaa'), 'repeat', 'aaaaaaaaaa → repeat'); t.eq(kinds('abcabcabc'), 'repeat', 'abcabcabc → repeat');
  t.eq(kinds('19/11/1988'), 'date', '19/11/1988 → date'); t.ok(/bruteforce/.test(kinds('xK9#mQ2$vL7!')), 'random → bruteforce');
  const seq = z.check('correcthorsebatterystaple').sequence; t.eq(seq.map((m) => m.token).join(' '), 'correct horse battery staple', 'four words split correctly');
  t.ok(seq.every((m, i) => m.i === (i ? seq[i - 1].j + 1 : 0)) && seq.at(-1).j === 24, 'token positions cover the password without gaps');
  const l33t = z.check('p@$$w0rd').sequence[0]; t.ok(l33t.kind === 'dictionary' && /l33t|password/i.test(l33t.detail || ''), `l33t substitutions recognised (${l33t.detail})`);
  const d = z.check('19/11/1988').sequence[0]; t.ok(/1988-11-19/.test(d.detail), `date read as 1988-11-19 (${d.detail})`);

  // personal words
  for (const u of ref.userInputs.filter((u) => !/202\d/.test(u.p))) { const r = z.check(u.p, u.inputs); t.ok(r.score === u.s && Math.abs(r.guesses / Number(u.g) - 1) < 0.001, `personal words ${u.inputs.join(' ')}: ${u.p} → ${r.guesses} guesses, score ${r.score} (reference ${u.g}, ${u.s})`); }
  t.ok(z.check('supertools', ['supertools']).guesses < z.check('supertools').guesses, 'a personal word lowers the estimate');
  t.ok(z.check('Acme2026', ['acme']).sequence[0].detail.includes('UserInputs') && z.check('Acme2026', ['acme']).guesses < z.check('Acme2026').guesses, 'Acme2026 with the personal word "acme"');
  t.ok(z.check('Ravindra1987!', ['Ravindra']).sequence.some((m) => /UserInputs|user/i.test(m.detail || '')), 'the match names the personal-words list');
  t.eq(z.check('password', []).guesses, z.check('password').guesses, 'empty personal-word list = none');
  t.ok(z.check('zebra', ['', ' ', 'ab']).score >= 0, 'empty / short personal words do not crash');

  // result shape, crack times, the 64-bit ceiling
  const r = z.check('Tr0ub4dor&3');
  t.ok([0, 1, 2, 3, 4].includes(r.score) && r.guesses > 0 && Math.abs(r.log10 - Math.log10(r.guesses)) < 1e-6, 'score 0–4, guesses > 0, log10 consistent');
  for (const [k, rate] of [['online_throttled', 100 / 3600], ['online', 10], ['offline_slow', 1e4], ['offline_fast', 1e10]]) t.near(r.times[k].seconds, r.guesses / rate, r.guesses / rate * 1e-6 + 1, `crack time ${k} = guesses ÷ ${rate.toPrecision(3)} per second (${r.times[k].text})`);
  t.ok(z.check('password').warning && z.check('password').suggestions.length > 0, 'common password: warning + suggestions');
  t.ok(!z.check('q8T!vR2#nZ5&wL').warning, 'strong password: no warning');
  for (const p of ['q8T!vR2#nZ5&wL9@xK4$', 'correct horse battery staple correct horse', ref.passwords.at(-4).p]) { const x = z.check(p); t.ok(x.score === 4 && x.guesses >= 1.8e19, `beyond 2^64 guesses the engine reports its ceiling (${p.slice(0, 12)}… → ${x.guesses.toExponential(2)}) — the tab shows "more than 10^19"`); }
  // the current year matters: a year near today is easier to guess than one far away
  const y = new Date().getUTCFullYear(), near = zNow.check(`zebra${y}`), away = zNow.check(`zebra${y - 80}`);
  t.ok(near.sequence.at(-1).detail === 'recent_year' && near.guesses < away.guesses, `with the real clock, ${y} is a "recent year" and cheaper than ${y - 80} (${near.guesses} < ${away.guesses})`);
  const dNow = zNow.check(`01/01/${y}`).sequence[0], d17 = z.check(`01/01/${y}`).sequence[0]; t.ok(dNow.kind === 'date' && dNow.guesses <= d17.guesses, 'a date this year is cheapest when the clock says this year');

  // odd input
  t.ok(z.check('').score === 0 && z.check('').guesses <= 1, 'empty password → score 0');
  t.ok(z.check('🙂🙃🙂🙃🙂🙃').score >= 0 && z.check('नमस्ते दुनिया').score >= 0 && z.check('a\u0000b\tc\n').score >= 0, 'emoji, Devanagari and control characters do not crash');
  const long = 'correct horse battery staple '.repeat(40); const t0 = Date.now(); const rl = z.check(long); t.ok(rl.score === 4 && Date.now() - t0 < 5000, `a ${long.length}-character password is handled (${Date.now() - t0} ms)`);
  t.ok(z.check('x'.repeat(5000)).score >= 0, '5,000 repeated characters do not crash or hang');
  const twice = [z.check('Mumbai2026'), z.check('Mumbai2026')]; t.eq(JSON.stringify(twice[0].sequence), JSON.stringify(twice[1].sequence), 'same password → same answer');
};
