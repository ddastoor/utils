// Bill Splitter by Photo (potentials #78): mathcore's m_bill_split held to an exact reckoning in BigInt fractions written here — each
// person's exact share of the items (an item shared by three is a third each), each extra in proportion to those or equally among the
// people who had anything, the cumulative columns (the items, the items and the first extra, … the whole bill) each rounded by the
// largest remainder (ties to the earlier person), a cell the difference of two — over 3,000 random bills: every items figure and total
// within a paisa of the exact share, every cell within two, every row and column adding up; known answers; a bill of 60 people beyond
// __int128 (worked out in double precision); src/lib/billsplit.ts reading bills as receipts print them (columns, "2 x", discounts, IGST,
// round-off written four ways) and finding what does not add up; and the test bill of tests/fixtures/snaps
// (scripts/make-snap-photos.py) through the tab's own reading path in Node.
import { readFileSync } from 'node:fs';
import { snapReader } from '../lib/snapread.mjs';

// exact fractions [n, d], d > 0, in lowest terms
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const fr = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; };
const add = (x, y) => fr(x[0] * y[1] + y[0] * x[1], x[1] * y[1]);
const mul = (x, y) => fr(x[0] * y[0], x[1] * y[1]);
const floorF = ([n, d]) => { let q = n / d; if (n % d !== 0n && n < 0n) q -= 1n; return q; };
const less = (x, y) => x[0] * y[1] < y[0] * x[1];
const away = (x, v) => { const d = add(x, [-BigInt(v), 1n]); return Math.abs(Number(d[0]) / Number(d[1])); };
/** The largest remainder on exact fractions: each rounded down, the units left over one each to the largest remainders (ties: earlier). */
function lrRound(xs, target) {
  const q = xs.map(floorF), r = xs.map((x, i) => add(x, [-q[i], 1n])), got = xs.map(() => false);
  for (let left = target - q.reduce((s, v) => s + v, 0n); left > 0n; left--) {
    let b = -1;
    r.forEach((v, i) => { if (!got[i] && (b < 0 || less(r[b], v))) b = i; });
    q[b] += 1n; got[b] = true;
  }
  return q;
}
/** The split worked out here, apart from the engine. */
function reference(items, parts, extras, np) {
  const took = Array.from({ length: np }, (_, p) => parts.some((r) => r[p] > 0));
  const nt = BigInt(took.filter(Boolean).length), It = items.reduce((s, x) => s + BigInt(x), 0n);
  const I = Array.from({ length: np }, () => fr(0n));
  items.forEach((it, i) => { const S = BigInt(parts[i].reduce((s, x) => s + Math.max(0, x), 0)); parts[i].forEach((x, p) => { if (x > 0) I[p] = add(I[p], fr(BigInt(it) * BigInt(x), S)); }); });
  const cols = [I], targets = [It];
  for (const x of extras) {
    const prop = !x.equal && It > 0n, prev = cols[cols.length - 1];
    cols.push(prev.map((k, p) => add(k, prop ? mul(fr(BigInt(x.paise)), fr(I[p][0], I[p][1] * It)) : took[p] ? fr(BigInt(x.paise), nt) : fr(0n))));
    targets.push(targets[targets.length - 1] + BigInt(x.paise));
  }
  const R = cols.map((c, j) => lrRound(c, targets[j])), ne = extras.length;
  return {
    shares: Array.from({ length: np }, (_, p) => ({ items: Number(R[0][p]), extras: extras.map((_, j) => Number(R[j + 1][p] - R[j][p])), total: Number(R[ne][p]) })),
    exact: cols,
  };
}

export default async (t, ctx) => {
  const { bindMathcore } = await ctx.load('/src/wasm/mathcore.ts');
  const m = bindMathcore(await ctx.wasm('mathcore'));
  const B = await ctx.load('/src/lib/billsplit.ts');
  const { linesOf, SNAP_READ } = await ctx.load('/src/lib/snaptext.ts');

  // ---- known answers
  const raw = await ctx.wasm('mathcore');
  /** m_bill_split called directly, for its return code (0 exact, 1 in double precision) */
  const rawSplit = (items, parts, extras, np) => {
    const ni = items.length, ne = extras.length, W = 2 + ne, m8 = (n) => raw.m_malloc(Math.max(1, n) * 8), m4 = (n) => raw.m_malloc(Math.max(1, n) * 4);
    const ip = m8(ni), pp = m4(ni * np), xp = m8(ne), qp = m4(ne), op = m8(np * W);
    new BigInt64Array(raw.memory.buffer, ip, ni).set(items.map(BigInt));
    new Int32Array(raw.memory.buffer, pp, ni * np).set(parts.flat());
    new BigInt64Array(raw.memory.buffer, xp, ne).set(extras.map((x) => BigInt(x.paise)));
    new Int32Array(raw.memory.buffer, qp, ne).set(extras.map((x) => (x.equal ? 1 : 0)));
    const rc = raw.m_bill_split(ni, np, ip, pp, ne, xp, qp, op), o = Array.from(new BigInt64Array(raw.memory.buffer, op, np * W), Number);
    [ip, pp, xp, qp, op].forEach((x) => raw.m_free(x));
    return { rc, shares: Array.from({ length: np }, (_, p) => ({ items: o[p * W], extras: o.slice(p * W + 1, p * W + 1 + ne), total: o[p * W + 1 + ne] })) };
  };
  {
    const items = [32000, 24000, 28000, 50000, 21000, 18000], parts = [[1, 1, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1], [0, 0, 1]];
    const extras = [{ paise: 8650 }, { paise: 4541 }, { paise: 4541 }, { paise: -32 }];
    const r = m.billSplit(items, parts, extras, 3), ref = reference(items, parts, extras, 3);
    t.eq(r.reduce((s, x) => s + x.total, 0), 190700, 'the restaurant bill split three ways: the shares make ₹1,907.00 to the paisa');
    t.eq(r.map((x) => x.items), [54667, 43667, 74666], 'items: the exact shares ₹546.66⅔, ₹436.66⅔, ₹746.66⅔ rounded — the two paise left over to the first two');
    t.eq(r, ref.shares, 'the same as the exact reckoning');
    t.ok(r.every((x, p) => away(ref.exact[4][p], x.total) < 1), `every total within a paisa of the exact share ${r.map((x) => x.total).join(', ')}`);
    t.eq(rawSplit(items, parts, extras, 3).rc, 0, 'worked out exactly (in __int128)');
  }
  {
    const items = [32000, 24000, 28000, 50000, 21000, 18000], extras = [{ paise: 8650 }, { paise: 4541 }, { paise: 4541 }, { paise: -32 }];
    const all = m.billSplit(items, items.map(() => [1, 1, 1]), extras, 3);
    t.eq(all.map((x) => x.total), [63567, 63567, 63566], 'everyone had everything: ₹1,907.00 three ways is 635.67 + 635.67 + 635.66 — a paisa apart at most (rounding each item on its own put five paise between the first and the last)');
    t.eq(all.map((x) => x.items), [57667, 57667, 57666], '… and the items too');
    const ravi = m.billSplit(items, [[1, 1, 0], ...items.slice(1).map(() => [1, 1, 1])], extras, 3);
    t.eq(ravi.map((x) => x.items), [63000, 63000, 47000], 'shares that are whole paise stay whole: ₹630, ₹630, ₹470 of items (rounding each item gave 630.01, 630.00, 469.99)');
    t.eq(ravi.map((x) => x.total), [69446, 69445, 51809], '… and the totals within a paisa of 694.4566…, 694.4566…, 518.0867…');
  }
  t.eq(m.billSplit([100], [[1, 1, 1]], [], 3).map((x) => x.total), [34, 33, 33], '₹1.00 three ways: 34 + 33 + 33 paise — the paisa left over to the first');
  t.eq(m.billSplit([1000, 0], [[1, 0], [0, 1]], [{ paise: 300, equal: true }], 2).map((x) => x.total), [1150, 150], 'a tip shared equally among everyone who had something');
  t.eq(m.billSplit([1000], [[2, 1]], [{ paise: -31 }], 2).map((x) => [x.items, x.extras[0]]), [[667, -21], [333, -10]], 'parts by units (2 of 3), a negative round-off split as it is');
  t.eq(m.billSplit([0, 0], [[1, 0], [0, 1]], [{ paise: 101 }], 2).map((x) => x.total), [51, 50], 'items worth nothing: a charge shared equally');
  t.throws(() => m.billSplit([500, 300], [[1, 1], [0, 0]], [], 2), 'an item no one had is refused');
  t.throws(() => m.billSplit([500, -300], [[1, 1], [1, 1]], [], 2), 'an item below zero is refused (a discount is a charge)');
  {
    // 60 people; 17 items, each shared by a group of a prime size (2 … 59) — the shares' common denominator beyond __int128
    const PR = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59], np = 60;
    const items = PR.map((q, i) => 987654321 + 1234567 * i), parts = PR.map((q, i) => Array.from({ length: np }, (_, p) => ((p + 7 * i) % np) < q ? 1 : 0));
    const extras = [{ paise: 98765432 }, { paise: -4321 }, { paise: 123457, equal: true }];
    const got = rawSplit(items, parts, extras, np), ref = reference(items, parts, extras, np);
    const bill = items.reduce((s, x) => s + x, 0) + extras.reduce((s, x) => s + x.paise, 0);
    t.eq(got.rc, 1, 'a bill of 60 people beyond __int128: worked out in double precision');
    t.ok(got.shares.reduce((s, x) => s + x.total, 0) === bill && got.shares.every((x, p) => away(ref.exact[3][p], x.total) < 1 && away(ref.exact[0][p], x.items) < 1),
      `… every share adding up to the bill, each items figure and total within a paisa of the exact share (${got.shares.filter((x, p) => JSON.stringify(x) !== JSON.stringify(ref.shares[p])).length} of 60 differ from the exact reckoning's by its last paisa)`);
  }

  // ---- 3,000 random bills against the exact reckoning
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const bad = [];
  let exactAll = true;
  for (let k = 0; k < 3000 && bad.length < 5; k++) {
    const np = 1 + rnd(8), ni = 1 + rnd(12);
    const items = Array.from({ length: ni }, () => rnd(5) === 0 ? rnd(100) : rnd(10000000));
    const parts = items.map(() => { const r = Array.from({ length: np }, () => (rnd(3) ? rnd(4) : 0)); if (!r.some((x) => x > 0)) r[rnd(np)] = 1 + rnd(3); return r; });
    const extras = Array.from({ length: rnd(5) }, () => ({ paise: rnd(3) ? rnd(500000) : -rnd(1000), equal: rnd(4) === 0 }));
    let got, ref;
    try { const g = rawSplit(items, parts, extras, np); got = g.shares; exactAll &&= g.rc === 0; ref = reference(items, parts, extras, np); } catch (e) { bad.push(`case ${k}: ${e.message}`); continue; }
    const ne = extras.length, sum = got.reduce((s, x) => s + x.total, 0), all = items.reduce((s, x) => s + x, 0) + extras.reduce((s, x) => s + x.paise, 0);
    const cols = extras.every((x, j) => got.reduce((s, g) => s + g.extras[j], 0) === x.paise) && got.reduce((s, g) => s + g.items, 0) === items.reduce((s, x) => s + x, 0);
    const rows = got.every((g) => g.items + g.extras.reduce((s, x) => s + x, 0) === g.total);
    const near = got.every((g, p) => away(ref.exact[0][p], g.items) < 1 && away(ref.exact[ne][p], g.total) < 1);
    if (JSON.stringify(got) !== JSON.stringify(ref.shares) || sum !== all || !cols || !rows || !near) bad.push(`case ${k}: ${JSON.stringify({ items, parts, extras })}`);
  }
  t.ok(!bad.length, `3,000 random bills (1 – 8 people, 1 – 12 items, units, negative extras, tips shared equally): every share the exact reckoning's — each items figure and total within a paisa of the exact share, rows and columns adding up to the paisa ${bad.join(' | ')}`);
  t.ok(exactAll, 'every one of them worked out exactly (in __int128)');

  // ---- amounts
  t.eq(['1,907.00', '1907', '-0.32', '(0.32)', '0.32-', 'Rs. 45.41', '₹ 2,032.71', '1,20,000.5', '12.3.4'].map(B.paiseOf), [190700, 190700, -32, -32, -32, 4541, 203271, 12000050, null], 'amounts as bills print them');
  t.eq([190700, 12345678, -32, 5].map(B.rupees), ['1,907.00', '1,23,456.78', '−0.32', '0.05'], 'paise in Indian grouping');

  // ---- bills as text
  const bill = B.readBill(['SPICE GARDEN RESTAURANT', '12 MG Road, Pune 411001', 'GSTIN: 27ABCDE1234F1Z5', 'Date: 27/11/2026\tTable: 7', 'Item\tQty\tRate\tAmount',
    'Paneer Tikka\t1\t320.00\t320.00', 'Butter Naan\t4\t60.00\t240.00', 'Sub Total\t320.00', 'Service Charge 5%\t16.00', 'CGST 2.5%\t8.40', 'SGST 2.5%\t8.40', 'Round Off\t0.20', 'TOTAL\t353.00']);
  t.eq(bill.items.map((x) => [x.name, x.qty, x.rate, x.paise, x.check]), [['Paneer Tikka', 1, 32000, 32000, 'ok'], ['Butter Naan', 4, 6000, 24000, 'ok']], 'items: name, quantity, rate, amount, checked');
  t.eq([bill.name, bill.date, bill.subtotal, bill.total, bill.charges.map((c) => [c.kind, c.rate, c.paise])], ['SPICE GARDEN RESTAURANT', '27/11/2026', 32000, 35300,
    [['subtotal', null, 32000], ['service', 5, 1600], ['tax', 2.5, 840], ['tax', 2.5, 840], ['roundoff', null, 20]]], 'the name, the date, the charges with their rates, the total');
  t.ok(bill.problems.length === 1 && /The items add up to ₹560\.00, the sub total says ₹320\.00/.test(bill.problems[0]), `what does not add up is said: ${bill.problems.join(' | ')}`);
  const b2 = B.readBill(['Cafe Mocha', '2 x Cappuccino 360.00', 'Croissant x3 450.00', 'Brownie 180.00', 'Discount 10% -99.00', 'Packing Charges 20.00', 'IGST 5% 45.55', 'Rounded Off (0.55)', 'Net Payable Rs. 956.00']);
  t.eq(b2.items.map((x) => [x.name, x.qty, x.paise]), [['Cappuccino', 2, 36000], ['Croissant', 3, 45000], ['Brownie', 1, 18000]], 'quantities written "2 x …" and "… x3"; an item without one');
  t.eq(B.readBill(['Naan x 2 120.00']).items.map((x) => [x.name, x.qty, x.rate]), [['Naan', 2, 6000]], '"Naan x 2 120.00": the quantity after the name, the rate worked out');
  t.eq(b2.charges.map((c) => [c.kind, c.paise]), [['discount', -9900], ['charge', 2000], ['tax', 4555], ['roundoff', -55]], 'a discount, packing, IGST, a round-off in brackets');
  t.eq([b2.total, B.problemsOf(b2).filter((p) => /total says/.test(p)).length], [95600, 0], 'Net Payable read as the total; the bill adds up');
  const tipped = B.readBill(['Pasta Arrabbiata 450.00', 'Tiramisu 250.00', 'Sub Total 700.00', 'Gratuity 10% 70.00', 'VAT 5% 35.00', 'Total 805.00']);
  t.eq([tipped.charges.map((c) => [c.kind, c.rate, c.paise]), tipped.problems, tipped.name], [[['subtotal', null, 70000], ['tip', 10, 7000], ['tax', 5, 3500]], [], ''], 'a gratuity printed on the bill is one of its charges: the bill adds up with it (and a line with an amount is no restaurant\'s name)');
  const misread = B.readBill(['Paneer Tikka\t1\t320.00\t320.00', 'Butter Naan\t4\t60.00\t290.00', 'Sub Total\t560.00', 'TOTAL\t560.00']);
  t.ok(misread.problems.some((p) => /Butter Naan: 4 × ₹60\.00 is ₹240\.00, not ₹290\.00/.test(p)), 'a digit misread: the item\'s rate × quantity said');
  t.eq(B.shareText({ name: 'Spice Garden', date: '27/11/2026', people: [{ name: 'Me', total: 70000 }, { name: 'Asha', total: 60000 }], payer: 0, upi: 'me@ybl' }),
    'Spice Garden, 27/11/2026 — ₹1,300.00 in all\nMe: ₹700.00 (paid)\nAsha: ₹600.00\nPay Me — UPI me@ybl', 'the split as text to send');

  // ---- the test bill, read as the tab reads it
  const dir = new URL('../fixtures/snaps/', import.meta.url).pathname, w = JSON.parse(readFileSync(dir + 'truth.json', 'utf8')).restaurant;
  const S = await snapReader(ctx);
  try {
    const r = await S.read(S.decode(dir + 'restaurant.jpg'), SNAP_READ), b = B.readBill(linesOf(r.r).map((l) => l.text));
    t.eq(b.items.map((x) => [x.name, x.qty, x.paise / 100]), w.items, 'the photo: every item with its quantity and amount');
    const by = (k) => b.charges.filter((c) => c.kind === k).map((c) => c.paise / 100);
    t.eq([b.subtotal / 100, by('service'), by('tax'), by('roundoff'), b.total / 100], [w.subtotal, [w.service], [w.cgst, w.sgst], [w.roundoff], w.total], 'the photo: the sub total, the service charge, CGST and SGST, the round-off, the total');
    t.eq(b.problems, [], 'the photo: the bill adds up');
  } finally { await S.close(); }
};
