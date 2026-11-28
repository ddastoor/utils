// src/lib/deadlines.ts — Paper Deadlines → Calendar (potentials #77): dates as papers write them held to Python's dateutil
// (tests/fixtures/deadlines/reference.json from scripts/make-deadlines-reference.py — the independent reader), day first and month
// first; dates counted on (relativedelta, timedelta); the words of papers made into sentences (Tesseract's blank lines inside a
// sentence, "Rs." and "Mr." no sentence's end, a label and its value alone); what each date is (a deadline, an event with its time,
// the paper's own date), amounts (₹ read as ¥), deadlines counted from another date of the paper, a year not written; the calendar
// file read by Python's vobject (pip install vobject — skipped with a note where missing); and the three test papers of
// tests/fixtures/snaps (scripts/make-snap-photos.py) through the tab's own reading path in Node.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { snapReader } from '../lib/snapread.mjs';

const REF = JSON.parse(readFileSync(new URL('../fixtures/deadlines/reference.json', import.meta.url), 'utf8'));
const VOBJECT = `
import sys, json, vobject
cal = vobject.readOne(open(sys.argv[1], encoding='utf-8').read())
out = []
for e in cal.vevent_list:
    s = e.dtstart.value
    a = e.contents.get('valarm', [])
    out.append({'summary': e.summary.value, 'start': s.isoformat(), 'allday': not hasattr(s, 'hour'), 'end': e.dtend.value.isoformat(),
      'desc': e.description.value if 'description' in e.contents else '', 'uid': e.uid.value,
      'trigger': a[0].trigger.value.total_seconds() if a else None})
print(json.dumps({'version': cal.version.value, 'events': out}))
`;

export default async (t, ctx) => {
  const D = await ctx.load('/src/lib/deadlines.ts');
  const { linesOf, SNAP_READ } = await ctx.load('/src/lib/snaptext.ts');

  // ---- dates as written, against dateutil
  const bad = [];
  for (const r of REF.dates) { const got = D.parseDate(r.text, { monthFirst: r.monthFirst, year: 2026 }); if (got !== r.date) bad.push(`${r.text}${r.monthFirst ? ' (month first)' : ''}: ${got} — dateutil ${r.date}`); }
  t.ok(!bad.length, `${REF.dates.length} dates as dateutil reads them, day first and month first${bad.length ? ` — ${bad.join(' | ')}` : ''}`);
  for (const r of REF.counted) t.eq(D.addTo(r.from, r.n, r.unit), r.date, `${r.n} ${r.unit}s after ${r.from} (dateutil: ${r.date})`);
  t.eq(D.parseDate('31/02/2026'), null, 'no 31 February');
  t.eq(D.parseDate('29/02/2027'), null, 'no 29 February in 2027');
  // what is no date
  const none = (s) => D.datesIn(s).map((h) => h.text);
  t.eq(none('Circular No. 42/2026-27'), [], 'a circular\'s number 42/2026-27 is no date');
  t.eq(none('late payment charge of 1.25 % a month'), [], '1.25 % is no date');
  t.eq(none('Policy number: SGI/MTR/2026/0047713'), [], 'a policy number is no date');
  t.eq(none('Plot 2 Market Road, Sector 15'), [], '"2 Mar…" of "2 Market" is no date');
  t.eq(none('Electricity bill for November 2026'), [], 'a month and a year without a day is no date');
  t.eq(none('IP 192.168.10.12 and v1.2.3'), [], 'an address of a network, a version');
  t.eq(none('Pay by 15/12/2026, or by Dec 20, 2026.'), ['15/12/2026', 'Dec 20, 2026'], 'two dates in one sentence');

  // ---- sentences out of a page's lines
  t.eq(D.sentencesOf(['Your motor insurance policy expires on', '', '31 January 2027. Please renew it by 25-01-2027', 'to keep your no-claim bonus.']),
    ['Your motor insurance policy expires on 31 January 2027.', 'Please renew it by 25-01-2027 to keep your no-claim bonus.'], 'a sentence over a blank line Tesseract put in it (it ended with "on")');
  t.eq(D.sentencesOf(['Fees for the third term (Rs. 18,500) are due by', '10 December 2026.', 'Dear Mr. Kulkarni,']),
    ['Fees for the third term (Rs. 18,500) are due by 10 December 2026.', 'Dear Mr. Kulkarni,'], '"Rs." and "Mr." end no sentence; a greeting stands alone');
  t.eq(D.sentencesOf(['Electricity bill for November 2026', 'Bill date: 28/11/2026', 'Due date: 15/12/2026']), ['Electricity bill for November 2026', 'Bill date: 28/11/2026', 'Due date: 15/12/2026'], 'a label and its value alone; a heading alone');
  t.eq(D.sentencesOf(['Circular No. 42/2026-27\tDate: 1 December 2026']), ['Circular No. 42/2026-27', 'Date: 1 December 2026'], 'the parts of a line apart');
  t.eq(D.sentencesOf(['Saturday, 6th December 2026 at 10:00 am.']).length, 1, '"10:00" is no label\'s colon');

  // ---- papers as text
  const rd = (lines, o = {}) => D.readPaper(lines, { today: '2026-11-28', ...o });
  const line = (f) => `${f.date}${f.time ? ` ${f.time}` : ''} ${f.kind}`;
  {
    const p = rd(['Godavari Power Distribution Co. Ltd.', 'Electricity bill for November 2026', 'Bill date: 28/11/2026', 'Due date: 15/12/2026', 'Amount payable: ¥ 2,032.71',
      'Please pay by the due date to avoid a late payment', 'charge of 1.25 % a month. If the bill is not paid,', 'supply may be disconnected after 30/12/2026.',
      'Pay online within 7 days of the bill date for a', 'prompt payment discount of 1 %.']);
    t.eq(p.found.map(line), ['2026-11-28 issued', '2026-12-15 deadline', '2026-12-30 deadline', '2026-12-05 deadline'], 'a bill: its date, the due date, a disconnection, a discount counted from the bill date');
    t.eq([p.heading, p.issued, p.found[1].label, p.found[1].amount, p.amounts.map((a) => a.text)], ['Godavari Power Distribution Co. Ltd.', '2026-11-28', 'Due date', '₹2,032.71', ['₹2,032.71']], 'the heading; the amount (₹ read as ¥) beside the due date');
    t.eq(p.found[3].counted, { n: 7, unit: 'day', from: '2026-11-28', of: 'bill date' }, 'counted: 7 days after the bill date');
    t.eq(D.titleOf(p.found[1], p.heading), 'Due date — Godavari Power Distribution Co. Ltd. (₹2,032.71)', 'a title: what, whose, how much');
  }
  {
    const p = rd(['Green Valley Public School', 'Circular No. 42/2026-27\tDate: 1 December 2026', 'Dear Parents,', '', 'The parent-teacher meeting will be held on', '',
      'Saturday, 6th December 2026 at 10:00 am.', '', 'Fees for the third term (Rs. 18,500) are due by', '', '10 December 2026. Consent forms for the science',
      'trip must be returned within 15 days of the', '', 'date of this circular', '', 'Principal']);
    t.eq(p.found.map(line), ['2026-12-01 issued', '2026-12-06 10:00 event', '2026-12-10 deadline', '2026-12-16 deadline'], 'a circular: its date, a meeting at 10:00, fees due, forms within 15 days of the circular');
    t.ok(/meeting will be held on/.test(p.found[1].label) && p.found[2].amount === '₹18,500' && /returned/.test(p.found[3].label), 'what each is; the fees\' amount');
  }
  {
    const p = rd(['Your policy expires on 31 January 2027.', 'A grace period of 30 days after expiry applies.', 'Date: 01/12/2026', 'Renewal premium: Rs. 14,250.00']);
    t.eq(p.found.map(line), ['2027-01-31 deadline', '2026-12-01 issued', '2027-03-02 deadline'], 'counted: 30 days after expiry');
  }
  t.eq(rd(['Exam starts 3 Mar.', 'Date: 20/11/2026']).found.map(line), ['2027-03-03 event', '2026-11-20 issued'], 'no year written: the next 3 March after the paper\'s date');
  t.ok(rd(['Exam starts 3 Mar.', 'Date: 20/11/2026']).found[0].guessedYear, '… and said so');
  t.eq(rd(['Library books due back by 5 Jan']).found.map(line), ['2027-01-05 deadline'], 'no year and no date on the paper: the next 5 January after today');
  t.eq(rd(['The interview is on 12/06/2026 at 4 p.m.'], { monthFirst: true }).found.map(line), ['2026-12-06 16:00 event'], 'month first; 4 p.m.');
  t.eq(rd(['Workshop on 9 Jan 2027 from 14:30 hrs']).found.map(line), ['2027-01-09 14:30 event'], '14:30 hrs');
  t.eq(rd(['Last date for submission: 20-12-2026', 'Payment of INR 1,20,000/- must reach us by Dec 18, 2026.']).found.map((f) => `${f.date} ${f.kind} ${f.amount}`),
    ['2026-12-20 deadline null', '2026-12-18 deadline ₹1,20,000'], 'a last date; INR in Indian grouping with "/-"');

  // ---- the calendar file: read by vobject
  const evs = [
    { title: 'Due date — Godavari Power; a, b', date: '2026-12-15', time: null, remind: '3d', note: 'Please pay by the due date ₹2,032.71\nSecond line, with a comma; and a semicolon. ' + 'Long text with ₹ and वेदना '.repeat(4).trim() },
    { title: 'Parent-teacher meeting', date: '2026-12-06', time: '10:00', remind: '1d', note: '' },
    { title: 'Late night', date: '2026-12-31', time: '23:30', remind: 'day', note: '' },
    { title: 'No reminder', date: '2027-01-05', time: null, remind: 'none', note: '' },
  ];
  const ics = D.icsOf(evs, { now: new Date(Date.UTC(2026, 10, 28, 9, 30)), uid: (i) => `u${i}@test` });
  t.ok(ics.split('\r\n').slice(0, -1).every((l) => new TextEncoder().encode(l).length <= 75) && !/[^\r]\n/.test(ics) && ics.endsWith('END:VCALENDAR\r\n'), 'iCalendar: CRLF, lines at most 75 octets (folded)');
  t.ok(ics.includes('DTSTART;VALUE=DATE:20261215') && ics.includes('DTEND;VALUE=DATE:20261216') && ics.includes('DTSTART:20261206T100000') && ics.includes('DTEND:20270101T003000') && ics.includes('TRIGGER:-P2DT15H'),
    'all-day events; timed events in local time; one that ends after midnight; "3 days before" at 9 am');
  const tmp = mkdtempSync(join(tmpdir(), 'ics-'));
  const f = join(tmp, 'x.ics'); writeFileSync(f, ics);
  const r = spawnSync('python3', ['-c', VOBJECT, f], { encoding: 'utf8' });
  if (r.status !== 0 && /No module named/.test(r.stderr)) t.ok(true, 'vobject is not installed (pip install vobject) — the independent reading skipped');
  else {
    const v = r.status === 0 ? JSON.parse(r.stdout) : { error: r.stderr.slice(-300) };
    t.ok(!v.error && v.version === '2.0' && v.events.length === 4, `vobject reads the calendar ${v.error ?? ''}`);
    const [a, b, c, d] = v.events;
    t.eq([a.summary, a.start, a.allday, a.end, a.desc, a.trigger], [evs[0].title, '2026-12-15', true, '2026-12-16', evs[0].note, -(2 * 86400 + 15 * 3600)], 'vobject: an all-day deadline, its title and note with escapes, ₹ and Devanagari over folded lines, its reminder');
    t.eq([b.start, b.allday, b.end, b.trigger], ['2026-12-06T10:00:00', false, '2026-12-06T11:00:00', -86400], 'vobject: a meeting at 10:00 for an hour, a day before');
    t.eq([c.end, c.trigger], ['2027-01-01T00:30:00', -7200], 'vobject: an event that ends after midnight; "on the day" two hours before a timed event');
    t.eq([d.trigger, new Set(v.events.map((e) => e.uid)).size], [null, 4], 'vobject: no reminder; every event its own UID');
  }

  // ---- the test papers, read as the tab reads them
  const dir = new URL('../fixtures/snaps/', import.meta.url).pathname, truth = JSON.parse(readFileSync(dir + 'truth.json', 'utf8'));
  const S = await snapReader(ctx);
  try {
    for (const name of ['notice-bill', 'notice-renewal', 'notice-school']) {
      const img = S.decode(dir + name + '.jpg');
      const rr = await S.read(img, SNAP_READ), p = D.readPaper(linesOf(rr.r).map((l) => l.text), { today: '2026-11-28' }), w = truth[name];
      const plain = p.found.filter((x) => !x.counted), counted = p.found.filter((x) => x.counted);
      t.eq(plain.map((x) => x.date).sort(), w.dates.map((x) => x[0]).sort(), `${name}: every date as printed`);
      t.ok(w.dates.every(([dd, lab]) => plain.some((x) => x.date === dd && (x.label.toLowerCase().includes(lab.toLowerCase()) || x.sentence.toLowerCase().includes(lab.toLowerCase())))), `${name}: each with what it is for (${plain.map((x) => x.label).join(' | ')})`);
      t.eq(counted.map((x) => x.date), w.relative.map((x) => x[0]), `${name}: the deadline counted from another date (${counted.map((x) => x.printed).join(', ')})`);
      t.eq(p.amounts.map((a) => a.value), w.amounts.map((a) => +a[0]), `${name}: the amounts`);
      if (w.times) t.eq(p.found.filter((x) => x.time).map((x) => [x.date, x.time]), w.times, `${name}: the time`);
    }
  } finally { await S.close(); }
};
