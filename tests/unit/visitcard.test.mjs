// src/lib/visitcard.ts — Visiting Card → Contact (potentials #89): a business card's reading made into a contact, and the
// contact file (vCard 3.0). Known answers on cards' wording (names with titles and degrees, phone labels as cards print them,
// the (0) of an office number and of a UK number, a second number after a slash, numbers of a card from abroad, addresses of
// India, the UK and the US); the vCard read back by Python's vobject (pip install vobject — skipped with a note where it is
// missing), the independent reader, and by our own; vCards as phones write them (iPhone 3.0, Android 2.1 with
// quoted-printable, 4.0) and MECARD; and the eight test photos of tests/fixtures/snaps (scripts/make-snap-photos.py) through the
// tab's own reading path in Node (tests/lib/snapread.mjs) — every field as printed, a card's two sides as one contact, the
// contact of a card's QR code.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { snapReader } from '../lib/snapread.mjs';

const VOBJECT = `
import sys, json, vobject
out = []
for v in vobject.readComponents(open(sys.argv[1], encoding='utf-8').read()):
    g = lambda k: [x for x in v.contents.get(k, [])]
    n = v.n.value if 'n' in v.contents else None
    a = g('adr')[0].value if g('adr') else None
    out.append({'n': [n.family, n.given, n.additional, n.prefix, n.suffix] if n else None, 'fn': v.fn.value,
      'org': g('org')[0].value if g('org') else None, 'title': g('title')[0].value if g('title') else None,
      'tel': [[t.value, sorted(x.upper() for x in t.params.get('TYPE', []))] for t in g('tel')], 'email': [e.value for e in g('email')],
      'url': [u.value for u in g('url')], 'adr': [a.street, a.city, a.region, a.code, a.country] if a else None,
      'note': g('note')[0].value if g('note') else None})
print(json.dumps(out))
`;

export default async (t, ctx) => {
  const V = await ctx.load('/src/lib/visitcard.ts');
  const { linesOf, SNAP_READ } = await ctx.load('/src/lib/snaptext.ts');
  const { bindDevcore } = await ctx.load('/src/wasm/devcore.ts');
  const d = bindDevcore(await ctx.wasm('devcore-ids'));
  const tel = (text) => d.json('ids:tel', { text });

  // ---- the engine's numbers (devcore-ids `ids:tel`)
  const T = (s) => { const r = tel(s); return [r.e164, r.kind, r.valid]; };
  t.eq(T('+91 98450 12345'), ['+919845012345', 'mobile', true], 'ids:tel: an Indian mobile number with +91');
  t.eq(T('080 4112 3456'), ['+918041123456', 'fixed_line', true], 'ids:tel: a Bengaluru landline with its STD code');
  t.eq(tel('080 4112 3456').place, 'Bangalore, Karnataka', 'ids:tel: the landline\'s place (libphonenumber\'s)');
  t.eq(T('1800 425 1234'), ['+9118004251234', 'toll_free', true], 'ids:tel: a toll-free number');
  t.eq(T('0044 20 7946 0958'), ['+442079460958', 'unknown', null], 'ids:tel: 00 and a calling code — the United Kingdom, its rules not checked');
  t.eq(tel('+1 (408) 555-0199').country, 'the United States or Canada', 'ids:tel: +1 named');
  t.eq(T('(408) 555-0199'), [null, 'unknown', false], 'ids:tel: no calling code and no Indian number — none');
  t.eq(T('2656 7788'), [null, 'unknown', false], 'ids:tel: eight digits without an STD code — none');

  // ---- names
  const nm = (s, fam) => { const x = V.splitName(s, fam); return [x.prefix, x.first, x.middle, x.last, x.suffix].join('|'); };
  t.eq(nm('Dr. Meera Krishnan'), 'Dr.|Meera||Krishnan|', 'name: a title before it');
  t.eq(nm('ANANYA IYER'), '|Ananya||Iyer|', 'name: in capitals → capitals at the start of each part');
  t.eq(nm('A. P. J. Abdul Kalam'), '|A.|P. J. Abdul|Kalam|', 'name: initials');
  t.eq(nm('Meera Krishnan, MD'), '|Meera||Krishnan|MD', 'name: a degree after a comma');
  t.eq(nm('Dr. Anil Mehta MBBS MD'), 'Dr.|Anil||Mehta|MBBS MD', 'name: degrees after the name');
  t.eq(nm("SEAN O'BRIEN"), "|Sean||O'Brien|", "name: O'Brien");
  t.eq(nm('CA Priya Nair'), 'CA|Priya||Nair|', 'name: CA (a chartered accountant) before it');
  t.eq(nm('Tanaka Hiroshi', true), '|Hiroshi||Tanaka|', 'name: the family name first');
  t.eq(V.fullName(V.splitName('Dr. Meera Krishnan, MD')), 'Dr. Meera Krishnan, MD', 'the name put back together');

  // ---- addresses
  const ad = (s) => { const a = V.parseAddress(s); return [a.street, a.city, a.region, a.postcode, a.country].join(' | '); };
  const addrs = [
    ['4th Floor, Prestige Tower, MG Road, Bengaluru 560001', '4th Floor, Prestige Tower, MG Road | Bengaluru |  | 560001 | '],
    ['Plot 12, GIDC Estate, Vatva, Ahmedabad, Gujarat 382445', 'Plot 12, GIDC Estate, Vatva | Ahmedabad | Gujarat | 382445 | '],
    ['12 Harley Street, London W1G 9PF, United Kingdom', '12 Harley Street | London |  | W1G 9PF | United Kingdom'],
    ['2550 Zanker Road, Suite 300, San Jose, CA95134', '2550 Zanker Road, Suite 300 | San Jose | CA | 95134 | '],
    ['1600 Amphitheatre Parkway, Mountain View, CA 94043, USA', '1600 Amphitheatre Parkway | Mountain View | CA | 94043 | USA'],
    ['Flat 3B, Sea View Apartments, Bandra West, Mumbai - 400050', 'Flat 3B, Sea View Apartments, Bandra West | Mumbai |  | 400050 | '],
    ['Koramangala, Bengaluru - 560 034, Karnataka', 'Koramangala | Bengaluru | Karnataka | 560034 | '],
    ['Sector 62, Noida, Uttar Pradesh 201309, India', 'Sector 62 | Noida | Uttar Pradesh | 201309 | India'],
    ['221B Baker Street, London NW1 6XE, UK', '221B Baker Street | London |  | NW1 6XE | UK'],
  ];
  for (const [s, want] of addrs) t.eq(ad(s), want, `address: ${s}`);
  t.eq(V.addressText(V.parseAddress('Plot 12, GIDC Estate, Vatva, Ahmedabad, Gujarat 382445')), 'Plot 12, GIDC Estate, Vatva, Ahmedabad, Gujarat 382445', 'the address put back as printed (city, state PIN)');
  t.eq(V.addressText(V.parseAddress('2550 Zanker Road, Suite 300, San Jose, CA95134')), '2550 Zanker Road, Suite 300, San Jose, CA 95134', 'the address put back (city, ST ZIP)');

  // ---- cards as text: one line a string, parts apart by a tab; { parts, h } where the size of the letters matters
  const L = (text, h) => ({ parts: text.split('\t').map((x, k) => ({ text: x, x0: k * 600 })), h });
  const card = (lines, codes = []) => V.readCard(lines, codes, tel);
  const phones = (c) => c.phones.map((p) => `${p.e164 ?? p.number} ${p.kind}`);
  {
    const r = card([L('ANANYA IYER', 38), L('Senior Product Manager', 24), L('Kaveri Software Solutions Pvt. Ltd.', 24), L('+91 98450 12345 (M)', 21), L('080 4112 3456 (0)', 21),
      L('ananya.iyer@kaverisoft.in', 22), L('www.kaverisoft.in', 22), L('4th Floor, Prestige Tower, MG Road, Bengaluru 560001', 22)]).contact;
    t.eq([V.fullName(r), r.title, r.org], ['Ananya Iyer', 'Senior Product Manager', 'Kaveri Software Solutions Pvt. Ltd.'], 'card: the name, the title, the company');
    t.eq(phones(r), ['+919845012345 cell', '+918041123456 work'], 'card: (M) a mobile; (0) after a number is the (O) of an office number, read as a zero');
    t.eq(r.phones.map((p) => p.number), ['+91 98450 12345', '+91 80 4112 3456'], 'card: the numbers in libphonenumber\'s international form');
  }
  const ph = (line) => phones(card([line]).contact);
  t.eq(ph('Mob: 98250 67890 | Tel: +9179 2656 7788'), ['+919825067890 cell', '+917926567788 work'], 'phones: Mob and Tel on one line, the bar between them');
  t.eq(ph('M: +91 99001 23456 / 99001 65432'), ['+919900123456 cell', '+919900165432 cell'], 'phones: a second number after a slash takes the first\'s label');
  t.eq(ph('Fax: 022 2345 6789'), ['+912223456789 fax'], 'phones: a fax');
  t.eq(ph('Res.: 011 4567 8901'), ['+911145678901 home'], 'phones: a residence number');
  t.eq(ph('Tel. 022-2345 6789, 98200 11223'), ['+912223456789 work', '+919820011223 cell'], 'phones: "Tel." and a second number after a comma (its kind by what it is)');
  t.eq(ph('WhatsApp +91 90000 12345'), ['+919000012345 cell'], 'phones: WhatsApp is a mobile');
  t.eq(ph('Toll free: 1800 425 1234'), ['+9118004251234 work'], 'phones: a toll-free number');
  t.eq(ph('+44 (0)20 7946 0958'), ['+442079460958 work'], 'phones: the trunk (0) of a UK number left out');
  t.eq(card(['+44 (0)20 7946 0958']).contact.phones[0].number, '+44 20 7946 0958', 'phones: the UK number as the card groups it, without the (0)');
  t.eq(ph('Ph: 2656 7788'), ['2656 7788 work'], 'phones: eight digits without an STD code kept as printed');
  t.eq(ph('GSTIN: 24AABCN1234F1Z5'), [], 'phones: a GSTIN is no number');
  t.eq(ph('Plot 12, GIDC Estate, Vatva, Ahmedabad 382445'), [], 'phones: a PIN code is no number');
  {
    const r = card([L('JORDAN ELLIS', 44), L('Senior Solutions Architect', 22), L('Northwind Cloud Systems, Inc.', 23), L('Ph (408) 555-0199\tCell (408) 555-0142', 22),
      L('jordan.ellis@northwindcloud.com', 29), L('https://northwindcloud.com', 30), L('2550 Zanker Road, Suite 300', 20), L('San Jose, CA 95134', 19)]);
    t.eq(phones(r.contact), ['+14085550199 work', '+14085550142 cell'], 'a card from the United States: its numbers without a calling code given +1 by its address');
    t.eq(r.contact.phones.map((p) => p.number), ['+1 (408) 555-0199', '+1 (408) 555-0142'], '… and written with it');
    t.eq(r.cc, 1, '… the card\'s calling code');
    t.eq([V.fullName(r.contact), r.contact.title, r.contact.org], ['Jordan Ellis', 'Senior Solutions Architect', 'Northwind Cloud Systems, Inc.'], '"Solutions" in a job title does not make it the company');
  }
  {
    const r = card([L('Dr. Meera Krishnan', 33), L('Consultant Cardiologist', 28), L("St Mary's Heart Clinic", 22), L('12 Harley Street\t+44 20 7946 0958', 21),
      L('London W1G 9PF\tmeera.k@stmaryheart.co.uk', 20), L('United Kingdom', 25), L('020 7946 0959 (Fax)', 20)]).contact;
    t.eq([r.prefix, r.first, r.last, r.title, r.org], ['Dr.', 'Meera', 'Krishnan', 'Consultant Cardiologist', "St Mary's Heart Clinic"], "a doctor's card: Dr. is no street, St Mary's no street");
    t.eq(V.addressText(r.address), '12 Harley Street, London W1G 9PF, United Kingdom', '… the address of the left column only');
    t.eq(phones(r), ['+442079460958 work', '+442079460959 fax'], '… a number without its code on a UK card: +44, the trunk 0 left out');
  }
  {
    const r = card(['Email: rajesh@narmadapack.com', 'E-mail : a.b @ x.co.in', 'meera©clinic.in', 'W: brightline.co.in', 'Web: http://example.org/team', 'linkedin.com/in/ananya-iyer', 'B.Tech, M.Tech', 'Kaveri Software Solutions Pvt. Ltd.']).contact;
    t.eq(r.emails, ['rajesh@narmadapack.com', 'a.b@x.co.in', 'meera@clinic.in'], 'e-mail: a label, spaces around the @, © read for @');
    t.eq(r.urls, ['brightline.co.in', 'http://example.org/team', 'linkedin.com/in/ananya-iyer'], 'websites: bare, with http://, a LinkedIn page — not B.Tech or Pvt. Ltd.');
  }
  {
    const r = card([L('ZENITH FOODS', 30), L('Kavya Reddy', 52), L('Head of Marketing', 25), L('Zenith Foods Ltd.', 22), L('GSTIN: 36AABCZ1234F1Z5', 20)]);
    t.eq([V.fullName(r.contact), r.contact.title, r.contact.org], ['Kavya Reddy', 'Head of Marketing', 'Zenith Foods Ltd.'], 'a card with a logo in words above the name');
    t.eq(r.others, ['ZENITH FOODS', 'GSTIN: 36AABCZ1234F1Z5'], '… the other lines kept for the note');
  }
  t.eq(card(['Model: X200', 'Made in India']).contact.phones.length + card(['Model: X200']).contact.emails.length, 0, 'nothing of a contact on a label');

  // ---- vCard 3.0: written, read back by vobject (independent) and by our reader
  const full = V.emptyContact();
  Object.assign(full, V.splitName('Dr. Meera Krishnan, MD'), { title: 'Consultant; Cardiologist', org: "St Mary's Heart Clinic, London", note: 'Met at the conference — ₹ talk on वेदना\nSecond line, with a comma; and a semicolon. ' + 'Long text '.repeat(12).trim() });
  full.phones = [V.phoneOf('+44 20 7946 0958', 'work', tel, null), V.phoneOf('+91 98450 12345', 'cell', tel, null), V.phoneOf('020 7946 0959', 'fax', tel, 44), V.phoneOf('+91 80 4112 3456', 'home', tel, null)];
  full.emails = ['meera.k@stmaryheart.co.uk']; full.urls = ['www.stmaryheart.co.uk', 'https://example.org/x'];
  full.address = V.parseAddress('12 Harley Street, London W1G 9PF, United Kingdom');
  const vcf = V.vcardOne(full);
  t.ok(vcf.split('\r\n').slice(0, -1).every((l) => new TextEncoder().encode(l).length <= 75) && !/[^\r]\n/.test(vcf), 'vCard: CRLF line ends, every line at most 75 octets (folded)');
  t.ok(vcf.includes('TEL;TYPE=CELL:+91 98450 12345') && vcf.includes('TEL;TYPE=WORK,FAX:+44 20 7946 0959') && vcf.includes('URL:https://www.stmaryheart.co.uk'), 'vCard: TEL types; a website without its scheme given https://');
  const back = V.parseVcards(vcf, tel)[0];
  t.eq([V.fullName(back), back.title, back.org, back.note, back.emails, back.urls, V.addressText(back.address), back.phones.map((p) => `${p.e164} ${p.kind}`)],
    [V.fullName(full), full.title, full.org, full.note, full.emails, ['https://www.stmaryheart.co.uk', 'https://example.org/x'], V.addressText(full.address), full.phones.map((p) => `${p.e164} ${p.kind}`)], 'vCard: our own reader gives every field back (escapes, folding)');
  const tmp = mkdtempSync(join(tmpdir(), 'vcf-'));
  const vo = (text) => { const f = join(tmp, `${Math.random().toString(36).slice(2)}.vcf`); writeFileSync(f, text); const r = spawnSync('python3', ['-c', VOBJECT, f], { encoding: 'utf8' }); return r.status === 0 ? JSON.parse(r.stdout) : r.stderr.includes('No module named') ? null : { error: r.stderr.slice(-400) }; };
  const py = vo(vcf + V.vcardOf([V.readCard(['Kavya Reddy', 'kavya@x.in'], [], tel).contact]));
  if (py === null) t.ok(true, 'vobject is not installed (pip install vobject) — the independent reading skipped');
  else {
    const [a, b] = py;
    t.ok(a && !a.error, `vobject reads the file ${a?.error ?? ''}`);
    t.eq(a.n, ['Krishnan', 'Meera', '', 'Dr.', 'MD'], 'vobject: N — family, given, additional, prefix, suffix');
    t.eq([a.fn, a.title, a.org, a.note], ['Dr. Meera Krishnan, MD', 'Consultant; Cardiologist', ["St Mary's Heart Clinic, London"], full.note], 'vobject: FN, TITLE, ORG (a comma and a semicolon kept), NOTE (folded, ₹ and Devanagari, a line break)');
    t.eq(a.tel, [['+44 20 7946 0958', ['VOICE', 'WORK']], ['+91 98450 12345', ['CELL']], ['+44 20 7946 0959', ['FAX', 'WORK']], ['+91 80 4112 3456', ['HOME', 'VOICE']]], 'vobject: the numbers and their kinds');
    t.eq([a.email, a.url, a.adr], [['meera.k@stmaryheart.co.uk'], ['https://www.stmaryheart.co.uk', 'https://example.org/x'], ['12 Harley Street', 'London', '', 'W1G 9PF', 'United Kingdom']], 'vobject: EMAIL, URL, ADR by its parts');
    t.eq([b?.fn, b?.email], ['Kavya Reddy', ['kavya@x.in']], 'vobject: a file of two contacts — the second');
  }

  // ---- vCards and MECARDs as phones and other apps write them (a code on a card holds one)
  const ios = 'BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//Apple Inc.//iPhone OS 18.0//EN\r\nN:Shah;Neha;;;\r\nFN:Neha Shah\r\nORG:Acme Labs;R&D\r\nTITLE:Lead Engineer\r\nEMAIL;type=INTERNET;type=WORK;type=pref:neha@acme.io\r\nTEL;type=CELL;type=VOICE;type=pref:+91 99887 76655\r\nTEL;type=WORK;type=VOICE:+91 22 6600 1122\r\nitem1.URL;type=pref:https://acme.io\r\nitem1.X-ABLabel:_$!<HomePage>!$_\r\nitem2.ADR;type=WORK;type=pref:;;12 Link Road;Mumbai;Maharashtra;400064;India\r\nitem2.X-ABADR:in\r\nEND:VCARD\r\n';
  const i = V.parseVcards(ios, tel)[0];
  t.eq([V.fullName(i), i.org, i.title, i.emails, i.urls, phones(i), V.addressText(i.address)], ['Neha Shah', 'Acme Labs, R&D', 'Lead Engineer', ['neha@acme.io'], ['https://acme.io'], ['+919988776655 cell', '+912266001122 work'], '12 Link Road, Mumbai, Maharashtra 400064, India'], "an iPhone's vCard: grouped properties, several TYPE parameters, ORG with a unit");
  const android = 'BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E0=A4=B6=E0=A4=B0=E0=A5=8D=E0=A4=AE=E0=A4=BE;Ravi;;;\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ravi =E0=A4=B6=E0=A4=B0=E0=A5=8D=\r\n=E0=A4=AE=E0=A4=BE\r\nTEL;CELL:+919812345678\r\nTEL;WORK:01123456789\r\nEND:VCARD\r\n';
  const an = V.parseVcards(android, tel)[0];
  t.eq([an.first, an.last, phones(an)], ['Ravi', 'शर्मा', ['+919812345678 cell', '+911123456789 work']], "an Android vCard 2.1: quoted-printable UTF-8 over a soft line break, bare types");
  const v4 = V.parseVcards('BEGIN:VCARD\nVERSION:4.0\nFN:Ana Lima\nTEL;VALUE=uri;TYPE="cell,voice":tel:+55-11-91234-5678\nEMAIL:ana@ex.com.br\nEND:VCARD\n', tel)[0];
  t.eq([V.fullName(v4), phones(v4)], ['Ana Lima', ['+5511912345678 cell']], 'a vCard 4.0: no N (the name from FN), a tel: URI, quoted types');
  const me = V.parseMecard('MECARD:N:Desai,Vikram;TEL:+919900123456;EMAIL:vikram@brightline.co.in;URL:https\\://brightline.co.in;ORG:Brightline Analytics Pvt. Ltd.;;', tel);
  t.eq([V.fullName(me), phones(me), me.emails, me.urls, me.org], ['Vikram Desai', ['+919900123456 cell'], ['vikram@brightline.co.in'], ['https://brightline.co.in'], 'Brightline Analytics Pvt. Ltd.'], 'a MECARD: its fields and escapes');
  const merged = V.mergeContacts(me, card(['Vikram Desai', 'Founder & CEO', 'T: +91 20 6789 0123', 'vikram@brightline.co.in', 'W: brightline.co.in']).contact);
  t.eq([merged.title, phones(merged), merged.emails.length, merged.urls.length], ['Founder & CEO', ['+919900123456 cell', '+912067890123 work'], 1, 1], 'merged: the QR code\'s fields first, the printed card filling the rest, nothing twice (a website with or without https://)');

  // ---- the test photos, read as the tab reads them
  const dir = new URL('../fixtures/snaps/', import.meta.url).pathname, truth = JSON.parse(readFileSync(dir + 'truth.json', 'utf8'));
  const S = await snapReader(ctx);
  const got = {};
  try {
    for (const name of ['card-a', 'card-b', 'card-c', 'card-d', 'card-e', 'card-f', 'card-g-front', 'card-g-back']) {
      const img = S.decode(dir + name + '.jpg');
      const r = await S.read(img, SNAP_READ), c = (got[name] = V.readCard(linesOf(r.r), await S.codes(img), tel)).contact, w = truth[name];
      const bare = (u) => u.replace(/^https?:\/\//, '');
      t.eq({ name: V.fullName(c), title: c.title, org: c.org, emails: c.emails, urls: c.urls.map(bare), address: V.addressText(c.address), phones: c.phones.map((p) => [p.e164, p.kind]).sort() },
        { name: [w.prefix, w.name].filter(Boolean).join(' '), title: w.title, org: w.org, emails: w.email ? [w.email] : [], urls: w.url ? [w.url] : [], address: w.address, phones: [...w.phones].sort() }, `${name}: every field as printed`);
      if (w.qr) t.ok(c.from === 'both' && V.parseVcards(w.qr)[0].first === c.first, `${name}: the card's QR code read, the printed text adding its other numbers and address`);
    }
    const two = V.mergeContacts(got['card-g-front'].contact, got['card-g-back'].contact);
    t.eq([V.fullName(two), two.org, two.phones.length, two.emails[0], V.addressText(two.address)], ['Kavya Reddy', 'Zenith Foods Ltd.', 2, 'kavya.reddy@zenithfoods.in', truth['card-g-back'].address], "a card's two sides: one contact");
    t.ok(true, 'the reading path closed');
  } finally { await S.close(); }
};
