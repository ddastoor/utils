// Bill Splitter by Photo (potentials #78; group 4 of the suggested order): a restaurant bill's reading → its items (name, quantity,
// rate, amount), its charges (sub total, service charge, CGST / SGST / IGST / VAT, a discount, packing, the round-off) and its total;
// whether it adds up; and the text a split is shared as. The split itself is mathcore's (m_bill_split: whole paise by the largest
// remainder). String glue around the readers' output (CLAUDE.md §3a). No DOM: the unit suite runs it in Node.

export interface Item { name: string; qty: number; rate: number | null; paise: number; line: number; check: 'ok' | 'off' | null }
export interface Charge { label: string; kind: 'subtotal' | 'service' | 'tax' | 'discount' | 'charge' | 'roundoff' | 'tip'; rate: number | null; paise: number; line: number }
export interface Bill {
  name: string; date: string | null;
  items: Item[]; charges: Charge[];
  subtotal: number | null; total: number | null;
  /** what does not add up, in words (empty: the bill adds up) */
  problems: string[];
}

/** An amount as a bill prints it → paise: 1,907.00 · 1907 · -0.32 · (0.32) · 0.32- · Rs. 45.41. */
export function paiseOf(s: string): number | null {
  const t = s.replace(/[₹¥]|\bRs\.?|\bINR/gi, '').trim();
  const m = t.match(/^(\(?)(-|−)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?\)?(-)?$/);
  if (!m) return null;
  const neg = !!(m[1] || m[2] || m[5]);
  const v = +m[3].replace(/,/g, '') * 100 + (m[4] ? +(m[4].padEnd(2, '0')) : 0);
  return neg ? -v : v;
}
/** Paise → "1,907.00" in Indian grouping (12,34,567.89). */
export function rupees(p: number): string {
  const neg = p < 0, a = Math.abs(Math.round(p)), r = String(Math.floor(a / 100)), d = String(a % 100).padStart(2, '0');
  const head = r.length > 3 ? r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + r.slice(-3) : r;
  return `${neg ? '−' : ''}${head}.${d}`;
}
export const inr = (p: number) => `₹${rupees(p)}`;

const MONEY = /(?:^|\s)((?:(?:₹|¥|Rs\.?)\s?)?[(−-]?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?\)?-?|(?:(?:₹|¥|Rs\.?)\s?)?[(−-]?\d+\.\d{1,2}\)?-?)(?=\s|$)/g;
const KINDS: Array<[RegExp, Charge['kind']]> = [
  [/\bsub\s*-?\s*total\b|\bitems?\s+total\b|\bfood\s+total\b|\bgross\s+(?:amount|total)\b|\btotal\s+(?:before|excl)/i, 'subtotal'],
  [/\bservice\s*(?:charge|chg|tax)?\b|\bs\.?\s?c\.?\b|\bsvc\b/i, 'service'],
  [/\b(?:c|s|i|ut)\s?gst\b|\bgst\b|\bvat\b|\bcess\b|\btax\b/i, 'tax'],
  [/\bdiscount\b|\bdisc\.?\b|\boffer\b|\bcoupon\b|\bless\b/i, 'discount'],
  [/\bround(?:ed|ing)?\s*-?\s*off\b|\brounding\b|\br\/off\b/i, 'roundoff'],
  [/\btip\b|\bgratuity\b/i, 'tip'],
  [/\bpacking\b|\bpackaging\b|\bdelivery\b|\bcontainer\b|\bcarry\s*bag\b|\bconvenience\b|\bcover\s+charge\b/i, 'charge'],
];
const TOTAL = /\b(?:grand\s+total|net\s+(?:amount|payable|total)|amount\s+(?:payable|due)|bill\s+amount|total\s+(?:amount|payable|due)|to\s+pay|total)\b/i;
const NOT_ITEM = /\b(?:gstin|gst\s*no|fssai|cin|pan|invoice|bill\s*no|receipt|table|cover|covers|pax|kot|cashier|steward|waiter|server|date|time|order|token|phone|tel|mob|thank|visit|www\.|@)\b/i;
const HEADER = /\bitem|\bparticulars|\bdescription/i;

/** The bill's lines (parts set apart by a tab, as src/lib/snaptext.ts gives them) → its items, charges and total, and whether it adds up. */
export function readBill(lines: string[]): Bill {
  const bill: Bill = { name: '', date: null, items: [], charges: [], subtotal: null, total: null, problems: [] };
  let inItems = false, after = false;
  const named = (t: string) => /\p{L}{2}/u.test(t);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\s+$/, '');
    const t = raw.replace(/\t/g, '  ').replace(/\s{2,}/g, '  ').trim();
    if (!t) continue;
    // the restaurant's name: the first line with letters, before the items, without an amount, a bill number or a GSTIN
    if (!bill.name && !bill.items.length && !after && named(t) && !NOT_ITEM.test(t) && !/\d{3,}/.test(t) && !/\d\.\d{2}\b/.test(t)) { bill.name = t.replace(/\s{2,}/g, ' '); continue; }
    const dm = t.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
    if (!bill.date && dm && /date|dt/i.test(t)) bill.date = dm[0];
    if (HEADER.test(t) && /\b(?:qty|quantity|rate|price|amount|amt)\b/i.test(t)) { inItems = true; continue; }
    // the amounts on the line, and the words before the first
    // the amounts: the numbers after the line's last letter (the currency's letters not counted) — "2 x Cappuccino 360.00"
    const plain = t.replace(/\bRs\.?|\bINR\b/gi, (x) => ' '.repeat(x.length));
    let lastLetter = -1;
    for (let k = plain.length - 1; k >= 0; k--) if (/\p{L}/u.test(plain[k]) && !(plain[k] === 'x' || plain[k] === 'X' || plain[k] === '×') || (/[xX×]/.test(plain[k]) && /\p{L}/u.test(plain[k - 1] ?? ''))) { lastLetter = k; break; }
    const money: Array<{ text: string; p: number; at: number }> = [];
    MONEY.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MONEY.exec(t))) { const at = m.index + m[0].indexOf(m[1]); const p = paiseOf(m[1]); if (p !== null && at > lastLetter) money.push({ text: m[1], p, at }); }
    if (!money.length) continue;
    const label = t.slice(0, money[0].at).replace(/[:@\s]+$/, '').trim();
    const pct = (label.match(/(\d+(?:\.\d+)?)\s*%/) || t.match(/(\d+(?:\.\d+)?)\s*%/))?.[1];
    const last = money[money.length - 1].p;
    // a charge, the total, or an item
    const kind = KINDS.find(([re]) => re.test(label))?.[1];
    if (kind === 'subtotal') { bill.subtotal = last; after = true; bill.charges.push({ label, kind, rate: null, paise: last, line: i }); continue; }
    if (kind && (after || bill.items.length) && named(label)) {
      const sign = kind === 'discount' ? -Math.abs(last) : last;
      bill.charges.push({ label: label.replace(/\s{2,}/g, ' '), kind, rate: pct ? +pct : null, paise: sign, line: i });
      after = true; continue;
    }
    if (TOTAL.test(label) && !/sub/i.test(label)) { bill.total = last; after = true; continue; }
    if (after || NOT_ITEM.test(label) || !named(label)) continue;
    // an item: name [qty] [rate] amount — the quantity a whole number, the rate × the quantity the amount
    let name = label.replace(/\s{2,}/g, ' ').replace(/\s+[x×]$/i, ''), qty = 1, rate: number | null = null;
    const nums = money.map((x) => x);
    // a quantity written in the name: "2 x Veg Biryani", "Veg Biryani x2", or a whole number at the name's end ("Masala Chaas 3")
    const qn = name.match(/^(\d{1,2})\s*[x×]\s+(.+)$/i) || name.match(/^(.+?)\s+[x×]\s*(\d{1,2})$/i);
    if (qn) { const [a, b] = /^\d/.test(qn[1]) ? [qn[1], qn[2]] : [qn[2], qn[1]]; qty = +a; name = b; }
    const amount = nums[nums.length - 1].p;
    if (nums.length >= 3 && Number.isInteger(nums[0].p / 100) && !/\./.test(nums[0].text)) { qty = nums[0].p / 100; rate = nums[1].p; }
    else if (nums.length === 2 && Number.isInteger(nums[0].p / 100) && !/\./.test(nums[0].text) && nums[0].p / 100 <= 99) { qty = nums[0].p / 100; rate = qty ? Math.round(amount / qty) : null; }
    else if (nums.length === 2) { rate = nums[0].p; qty = rate ? Math.round(amount / rate) : 1; }
    const check: Item['check'] = rate !== null && qty > 0 ? (Math.abs(rate * qty - amount) <= 1 ? 'ok' : 'off') : null;
    bill.items.push({ name: name.trim(), qty, rate, paise: amount, line: i, check });
    inItems = true;
  }
  void inItems;
  bill.problems = problemsOf(bill);
  return bill;
}

/** What does not add up, in words: an item whose rate × quantity is not its amount, items that do not make the sub total, a charge
 *  that is not its rate of what it is charged on, charges that do not make the total. */
export function problemsOf(b: Bill): string[] {
  const out: string[] = [];
  for (const it of b.items) if (it.check === 'off' && it.rate !== null) out.push(`${it.name}: ${it.qty} × ${inr(it.rate)} is ${inr(it.qty * it.rate)}, not ${inr(it.paise)}`);
  const items = b.items.reduce((s, x) => s + x.paise, 0);
  if (b.subtotal !== null && items !== b.subtotal) out.push(`The items add up to ${inr(items)}, the sub total says ${inr(b.subtotal)}`);
  const sub = b.subtotal ?? items;
  const service = b.charges.filter((c) => c.kind === 'service').reduce((s, c) => s + c.paise, 0);
  const before = b.charges.filter((c) => c.kind === 'discount' || c.kind === 'charge').reduce((s, c) => s + c.paise, 0);
  for (const c of b.charges) {
    if (c.rate === null || c.kind === 'subtotal' || c.kind === 'roundoff') continue;
    // what it is charged on: GST on the items with the service charge, packing and a discount — or on fewer of them, as bills differ
    const bases = c.kind === 'tax' ? [sub + service + before, sub + service, sub + before, sub] : c.kind === 'discount' ? [sub] : [sub];
    const ok = bases.some((x) => Math.abs(Math.abs(c.paise) - Math.round((x * c.rate!) / 100)) <= 1);
    if (!ok) out.push(`${c.label}: ${c.rate} % of ${inr(bases[0])} is ${inr(Math.round((bases[0] * c.rate) / 100))}, not ${inr(Math.abs(c.paise))}`);
  }
  if (b.total !== null) {
    const sum = sub + b.charges.filter((c) => c.kind !== 'subtotal').reduce((s, c) => s + c.paise, 0);
    if (sum !== b.total) out.push(`The items and charges add up to ${inr(sum)}, the total says ${inr(b.total)}`);
  }
  return out;
}

/** The split as text to send (WhatsApp, a message): each person's share, and whom to pay. */
export function shareText(o: { name: string; date: string | null; people: Array<{ name: string; total: number }>; payer: number; upi?: string }): string {
  const head = [o.name || 'The bill', o.date].filter(Boolean).join(', ');
  const total = o.people.reduce((s, p) => s + p.total, 0);
  const lines = o.people.map((p, i) => `${p.name}: ${inr(p.total)}${i === o.payer ? ' (paid)' : ''}`);
  const pay = o.people[o.payer] ? `Pay ${o.people[o.payer].name}${o.upi ? ` — UPI ${o.upi}` : ''}` : '';
  return [`${head} — ${inr(total)} in all`, ...lines, pay].filter(Boolean).join('\n');
}
