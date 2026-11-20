// The document generators' rules (src/tools/docgen.ts): rent months and what stops them, file names, the links put
// into the PDFs (only mailto:, tel: and http(s) — anything else stays text), the GST state table.
export default async (t, { load }) => {
  const D = await load('/src/lib/docrules.ts');
  const ms = (a, b) => D.rentMonths(a, b).map((m) => `${m.start.getFullYear()}-${m.start.getMonth() + 1}-${m.start.getDate()}…${m.end.getDate()}`);
  t.eq(ms('2026-04', '2026-06'), ['2026-4-1…30', '2026-5-1…31', '2026-6-1…30'], 'three months, each to its last day');
  t.eq(ms('2028-02', '2028-02'), ['2028-2-1…29'], 'February of a leap year');
  t.eq(ms('2027-02', '2027-02'), ['2027-2-1…28'], 'February of another year');
  t.eq(D.rentMonths('2026-04', '2036-03').length, 120, 'ten years: 120 receipts (it stopped at 36)');
  t.eq(D.rentMonths('2026-04', '2026-03').length, 0, 'the last month before the first: none');
  const P = (o) => D.rentProblem({ from: '2026-04', to: '2027-03', rent: 25000, ...o });
  t.eq([P({}), P({ from: '' }), P({ to: '2026-3' }), P({ to: '2026-03' }), P({ to: '2036-04' }), P({ rent: '' }), P({ rent: 0 }), P({ rent: -5 })],
    ['', 'Choose the from and to months.', 'Choose the from and to months.', 'The last month is before the first.', 'At most 120 months (ten years) at a time.', 'Enter the monthly rent.', 'Enter the monthly rent.', 'Enter the monthly rent.'], 'what stops the receipts, in words');
  t.eq([D.safeName('A/B: Rao', 'resume'), D.safeName('  ', 'resume'), D.safeName('..', 'x'), D.safeName('a\u0007b', 'x'), D.safeName('x'.repeat(200), 'x').length, D.safeName('INV/2026-27/001', 'invoice')],
    ['A_B_-Rao', 'resume', 'x', 'a_b', 80, 'INV_2026-27_001'], 'file names: no characters a file system refuses, not empty, not too long');
  t.eq(D.mailLink('you@example.com'), '<a href="mailto:you@example.com">you@example.com</a>', 'an e-mail address: a mailto: link');
  t.eq(D.mailLink('not an address'), 'not an address', 'other text: no link');
  t.eq(D.mailLink('a@b.c"><script>'), 'a@b.c&quot;&gt;&lt;script&gt;', 'nothing breaks out of the attribute');
  t.eq(D.telLink('+91 98765 43210'), '<a href="tel:+919876543210">+91 98765 43210</a>', 'a phone number: a tel: link of its digits');
  t.eq(D.telLink('call me'), 'call me', 'no number: no link');
  t.eq(D.webLinks('linkedin.com/in/you, https://github.com/you'), '<a href="https://linkedin.com/in/you">linkedin.com/in/you</a>, <a href="https://github.com/you">https://github.com/you</a>', 'web addresses with and without https: links');
  t.eq(D.webLinks('javascript:alert(1) data:text/html,x'), 'javascript:alert(1) data:text/html,x', 'javascript: and data: stay text');
  t.eq(D.webLinks('evil.com/"onmouseover=x'), '<a href="https://evil.com/&quot;onmouseover=x">evil.com/&quot;onmouseover=x</a>', 'quotes are escaped inside the link');
  t.eq(D.webLinks('Portfolio: me.dev'), 'Portfolio: <a href="https://me.dev">me.dev</a>', 'words around stay words');
  // the GST state table: codes unique, two digits; the union territories without a legislature take UTGST
  const codes = D.STATES.map((s) => s[0]);
  t.ok(new Set(codes).size === codes.length && codes.every((c) => /^\d\d$/.test(c)), `${codes.length} state codes, unique`);
  t.eq(D.STATES.filter((s) => s[2]).map((s) => s[0]).sort(), ['04', '26', '31', '35', '38'], 'UTGST: Chandigarh, DNH & DD, Lakshadweep, A & N Islands, Ladakh');
  t.ok(D.GST_RATES.includes(18) && D.GST_RATES.includes(40) && D.GST_RATES.includes(0.25), 'GST rates include 0.25 %, 18 %, 40 %');
  // the length limit of the boxes (a pasted document froze the tab): cut at a whole character
  t.eq([D.MAX_LINE, D.MAX_AREA, D.MAX_ROWS], [200, 2000, 100], 'limits: 200 characters a line, 2,000 a text area, 100 rows');
  t.eq(D.cutText('abcdef', 4), 'abcd', 'cut to 4');
  t.eq(D.cutText('abc', 4), 'abc', 'shorter text stays');
  t.eq(D.cutText('abc😀def', 4), 'abc', 'an emoji is not split in two (no lone surrogate)');
  t.eq(D.cutText('ab😀def', 4), 'ab😀', 'an emoji that fits stays whole');
  const cut = D.cutText('x'.repeat(199) + '😀'.repeat(3), 200);
  t.ok(cut.length === 199 && !/[\ud800-\udfff]/.test(cut), 'the cut never leaves half an emoji');
};
