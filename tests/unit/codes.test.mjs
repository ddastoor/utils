// QR Generator: what goes into the code (src/lib/qrdata.ts) — Wi-Fi as ZXing's "Barcode Contents" describes it, UPI as
// NPCI's linking specification writes it, vCard 3.0 (RFC 2426), mailto, SMSTO, tel, VEVENT (RFC 5545 escaping) — and the
// checks on what was typed (amounts, Wi-Fi passwords, UPI IDs, colours).
export default async (t, { load }) => {
  const Q = await load('/src/lib/qrdata.ts');
  const tx = (r) => r.text;

  // ---- Wi-Fi
  t.eq(tx(Q.wifi({ ssid: 'Home;Net', pass: 'p@ss:word', sec: 'WPA', hidden: false })), 'WIFI:T:WPA;S:Home\\;Net;P:p@ss\\:word;;', 'wifi escaping');
  t.eq(tx(Q.wifi({ ssid: 'Cafe', pass: '', sec: 'none', hidden: true })), 'WIFI:T:nopass;S:Cafe;H:true;;', 'open hidden wifi');
  t.eq(tx(Q.wifi({ ssid: 'a"b\\c,d', pass: 'x'.repeat(8), sec: 'WEP', hidden: false })), 'WIFI:T:WEP;S:a\\"b\\\\c\\,d;P:xxxxxxxx;;', 'quote, backslash, comma escaped');
  t.eq(Q.wifi({ ssid: 'Home', pass: 'short', sec: 'WPA', hidden: false }).warnings, ['A WPA password has 8 – 63 characters; this one has 5, so phones will refuse it.'], 'a WPA password of 5 characters: warned');
  t.eq(Q.wifi({ ssid: 'Home', pass: 'x'.repeat(64), sec: 'WPA', hidden: false }).warnings.length, 1, '64 characters that are not hex: warned');
  t.eq(Q.wifi({ ssid: 'Home', pass: 'ab'.repeat(32), sec: 'WPA', hidden: false }).warnings, [], '… 64 hex digits are a WPA key');
  t.eq(Q.wifi({ ssid: 'Home', pass: '', sec: 'WPA', hidden: false }).warnings, ['WPA networks have a password — without it the phone cannot join.'], 'WPA without a password');
  t.eq(Q.wifi({ ssid: 'Home', pass: 'abcdef', sec: 'WEP', hidden: false }).warnings.length, 1, 'a WEP key of 6 characters');
  t.eq(Q.wifi({ ssid: 'Home', pass: '0123456789', sec: 'WEP', hidden: false }).warnings, [], '… 10 hex digits are one');
  t.eq(Q.wifi({ ssid: 'घर का वाई-फ़ाई नेटवर्क', pass: '12345678', sec: 'WPA', hidden: false }).warnings, [`A network name has at most 32 bytes; this one has ${new TextEncoder().encode('घर का वाई-फ़ाई नेटवर्क').length} — check it.`], 'a name longer than 32 bytes (UTF-8)');
  t.eq(Q.wifi({ ssid: 'मेरा घर', pass: 'चाय@123चाय', sec: 'WPA', hidden: false }).warnings, [], 'Hindi name and password: fine');
  t.eq(tx(Q.wifi({ ssid: '', pass: 'x', sec: 'WPA', hidden: false })), '', 'no network name: no code');

  // ---- amounts and UPI
  const amt = (s) => { const r = Q.readAmount(s); return r === null ? null : 'value' in r ? r.value : r.error; };
  t.eq(['49.5', '₹ 1,00,000', 'Rs. 250', '100,000', '1,000.25', 'INR 7', '12/-', '.5', ''].map(amt), [49.5, 100000, 250, 100000, 1000.25, 7, 12, 0.5, null], 'amounts as people type them');
  t.eq(amt('49,50'), 'The amount "49,50" is not a number of rupees (write 49.50, 1,000 or 1,00,000).', 'a decimal comma is not read as 4,950 (in a payment)');
  t.eq(amt('1.005'), 'An amount has at most two decimals (paise).', 'three decimals');
  t.eq(amt('0'), 'The amount must be more than ₹0 — or leave it empty to let the payer type it.', 'zero');
  t.eq(amt('-5'), 'The amount "-5" is not a number of rupees (write 49.50, 1,000 or 1,00,000).', 'negative');
  t.eq(amt('1,0000'), 'The amount "1,0000" is not a number of rupees (write 49.50, 1,000 or 1,00,000).', 'commas in the wrong places');
  t.eq(tx(Q.upi({ vpa: 'ravi@okicici', name: 'Ravi Kumar', amount: '250', note: 'Lunch' })), 'upi://pay?pa=ravi@okicici&pn=Ravi%20Kumar&am=250.00&cu=INR&tn=Lunch', 'UPI link as NPCI writes it (the @ of the UPI ID as it is)');
  t.eq(tx(Q.upi({ vpa: ' 9820012345@ybl ', name: 'Chai & Co', amount: '1,000', note: 'Bill #7 / table 2' })), 'upi://pay?pa=9820012345@ybl&pn=Chai%20%26%20Co&am=1000.00&cu=INR&tn=Bill%20%237%20%2F%20table%202', '& # / encoded; "1,000" read (an <input type=number> dropped it without a word)');
  t.eq(tx(Q.upi({ vpa: 'x@ybl', name: '', amount: '', note: '' })), 'upi://pay?pa=x@ybl&pn=', 'no amount: the payer types it');
  { const r = Q.upi({ vpa: 'x@ybl', name: 'A', amount: '49,50', note: '' }); t.eq([r.text, r.errors.length], ['', 1], 'an amount that cannot be read: no code (a code without the amount would be wrong)'); }
  t.eq(Q.upi({ vpa: 'ab@ybl', name: 'A', amount: '2,00,000', note: '' }).warnings, ['Most banks refuse a single UPI payment above ₹1,00,000 (some allow more for particular payments).'], 'above ₹1 lakh: warned');
  t.eq(Q.upi({ vpa: 'ravi.okicici', name: 'A', amount: '', note: '' }).warnings, ['That does not look like a UPI ID (name@bank, e.g. 9820012345@ybl) — check it.'], 'not a UPI ID: warned');
  t.eq(Q.upi({ vpa: 'ab@ybl', name: 'A', amount: '', note: 'n'.repeat(51) }).warnings, ['Some UPI apps cut a note after 50 characters.'], 'a long note: warned');

  // ---- contact, e-mail, SMS, phone, event
  t.ok(tx(Q.vcard({ first: 'Asha', last: 'Rao', phone: '+91 98', email: 'a@x.in', org: '', url: '' })).includes('N:Rao;Asha;;;\nFN:Asha Rao'), 'vcard');
  t.eq(tx(Q.vcard({ first: ' ', last: '', phone: '1', email: '', org: '', url: '' })), '', 'a contact without a name: no code');
  t.eq(Q.vcard({ first: 'A', last: '', phone: '', email: 'a@x', org: '', url: '' }).warnings, ['The e-mail address does not look complete.'], 'an incomplete e-mail address');
  t.eq(tx(Q.tel({ phone: '+91 98765-43210' })), 'tel:+919876543210', 'tel: digits and +');
  t.eq(tx(Q.tel({ phone: '(022) 2345 6789' })), 'tel:02223456789', '… brackets and spaces left out');
  t.eq(tx(Q.sms({ phone: '+91 98200 12345', msg: 'Running late' })), 'SMSTO:+919820012345:Running late', 'SMSTO: the number without spaces (they were kept)');
  t.eq(tx(Q.email({ to: 'a@b.co', subject: 'Hi there', body: '' })), 'mailto:a@b.co?subject=Hi%20there', 'mailto');
  t.eq(tx(Q.email({ to: 'a@b.co', subject: 'Refund & order #7', body: 'Line 1\nLine 2' })), 'mailto:a@b.co?subject=Refund%20%26%20order%20%237&body=Line%201%0ALine%202', 'mailto: & # and a line break encoded');
  const utc = (...a) => new Date(...a).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // the local time of the machine, in UTC
  t.eq(tx(Q.event({ title: 'Diwali party, rooftop', start: '2026-11-08T19:30', end: '2026-11-08T23:00', place: 'Bandra; Mumbai' })).split('\n'),
    ['BEGIN:VEVENT', 'SUMMARY:Diwali party\\, rooftop', `DTSTART:${utc(2026, 10, 8, 19, 30)}`, `DTEND:${utc(2026, 10, 8, 23, 0)}`, 'LOCATION:Bandra\\; Mumbai', 'END:VEVENT'], 'an event: , and ; escaped as RFC 5545 asks (they were not), local times in UTC (the e2e suite checks IST)');
  t.eq(Q.event({ title: 'X', start: '2026-11-08T19:30', end: '2026-11-08T18:00', place: '' }), { text: '', errors: ['The event ends before it starts.'], warnings: [] }, 'an end before the start: refused');

  // ---- colours
  t.eq(Q.colourWarning('#000000', '#ffffff'), null, 'black on white');
  t.eq(Q.colourWarning('#1d4ed8', '#fef3c7'), null, 'dark blue on cream');
  t.ok(/light code on a dark background/.test(Q.colourWarning('#ffffff', '#000000')), 'white on black: warned');
  t.ok(/Too little contrast/.test(Q.colourWarning('#9ca3af', '#ffffff')), 'grey on white: warned');

  // ---- reading a scanned code (the Scanner tab)
  const D = Q.describeCode, F = (d) => Object.fromEntries(d.fields.map((f) => [f.label, f.value]));
  { const w = Q.wifi({ ssid: 'My;Home,Net "5G"', pass: 'p@ss:w;rd\\1', sec: 'WPA', hidden: true }).text, d = D(w);
    t.eq([d.kind, F(d)], ['wifi', { Network: 'My;Home,Net "5G"', Password: 'p@ss:w;rd\\1', Security: 'WPA / WPA2 / WPA3', Hidden: 'yes' }], 'Wi-Fi: every escaped character read back (round trip with the generator)');
    t.ok(d.fields.find((f) => f.label === 'Password').secret && !d.open, '… the password marked for its own copy button; no link'); }
  t.eq(F(D('WIFI:S:Cafe;T:nopass;;')), { Network: 'Cafe', Security: 'Open (no password)' }, 'an open network, fields in another order');
  t.eq(F(D('wifi:T:WEP;S:Old;P:abcde;;')), { Network: 'Old', Password: 'abcde', Security: 'WEP' }, 'lower-case prefix, WEP');
  { const d = D(Q.upi({ vpa: 'chai@ybl', name: 'Chai & Co', amount: '1,250.5', note: 'Table 7' }).text);
    t.eq([d.kind, F(d), d.open.href.startsWith('upi://pay?pa=chai@ybl')], ['upi', { 'Pay to': 'Chai & Co', 'UPI ID': 'chai@ybl', Amount: '₹1,250.50', Note: 'Table 7' }, true], 'UPI: payee, ID, amount in rupees, note; a link for a UPI app'); }
  t.eq(F(D('upi://pay?pa=x@ybl&pn=Shop')).Amount, 'typed by the payer', 'UPI without an amount');
  { const d = D(Q.vcard({ first: 'Anaya', last: 'Iyer', phone: '+91 98200 12345', email: 'anaya@example.com', org: 'Tata Sons; Mumbai, India', url: '' }).text);
    t.eq([d.kind, F(d)], ['contact', { Name: 'Anaya Iyer', Company: 'Tata Sons; Mumbai, India', Phone: '+91 98200 12345', 'E-mail': 'anaya@example.com' }], 'a vCard: name, company (escapes undone), phone, e-mail');
    t.eq([d.save.name, d.save.type, d.save.text.includes('\r\nFN:Anaya Iyer\r\n')], ['Anaya Iyer.vcf', 'text/vcard', true], '… saved as "Anaya Iyer.vcf" with CRLF line ends (RFC 2426)'); }
  t.eq(F(D('MECARD:N:Rao,Asha;TEL:+919820012345;EMAIL:a@x.in;;')), { Name: 'Rao Asha', Phone: '+919820012345', 'E-mail': 'a@x.in' }, 'a MECARD contact');
  { const d = D('BEGIN:VEVENT\nSUMMARY:Diwali party\\, rooftop\nDTSTART:20261108T140000Z\nDTEND:20261108T173000Z\nLOCATION:Bandra\; Mumbai\nEND:VEVENT');
    t.eq([d.kind, F(d).Event, F(d).Place], ['event', 'Diwali party, rooftop', 'Bandra; Mumbai'], 'an event: escapes undone');
    t.ok(F(d).Starts === new Date(Date.UTC(2026, 10, 8, 14, 0)).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }), '… a UTC time shown in local time');
    t.ok(/^BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:[^\r]+\r\nBEGIN:VEVENT/.test(d.save.text) && d.save.name === 'Diwali party, rooftop.ics', '… saved as an .ics calendar file (wrapped in VCALENDAR)'); }
  t.eq(F(D('BEGIN:VEVENT\nSUMMARY:Back\\\\slash\\, done\nEND:VEVENT')).Event, 'Back\\slash, done', 'an escaped backslash in an event (it was left doubled)');
  t.eq(F(D('BEGIN:VEVENT\nSUMMARY:All day\nDTSTART;VALUE=DATE:20261225\nEND:VEVENT')).Starts, '25/12/2026', 'an all-day event');
  t.eq([D('mailto:help@example.com?subject=Refund%20%26%20order%20%237&body=Hi').kind, F(D('mailto:help@example.com?subject=Refund%20%26%20order%20%237&body=Hi'))], ['email', { To: 'help@example.com', Subject: 'Refund & order #7', Message: 'Hi' }], 'mailto: decoded');
  t.eq([F(D('SMSTO:+91 98200 12345:Running late')), D('SMSTO:+91 98200 12345:Running late').open.href], [{ To: '+91 98200 12345', Message: 'Running late' }, 'sms:+919820012345?body=Running%20late'], 'SMSTO, with an sms: link');
  t.eq(F(D('sms:+919820012345?body=Hi%20there')), { To: '+919820012345', Message: 'Hi there' }, 'sms: URI');
  t.eq([F(D('tel:+91 22 2345 6789')), D('tel:+91 22 2345 6789').open.href], [{ Number: '+91 22 2345 6789' }, 'tel:+912223456789'], 'tel, with a call link');
  t.eq([D('geo:19.0760,72.8777').kind, D('geo:19.0760,72.8777').open.href], ['geo', 'geo:19.0760,72.8777'], 'a place');
  t.eq([D('https://example.com/menu?x=1').kind, F(D('https://example.com/menu?x=1')).Site, D('https://example.com/menu?x=1').open.href], ['link', 'example.com', 'https://example.com/menu?x=1'], 'a link: its site shown, opened as it is');
  t.eq([D('javascript:alert(1)').kind, D('javascript:alert(1)').open], ['text', undefined], 'javascript: is plain text — never a link');
  t.eq([D('data:text/html,<b>x</b>').open, D('Table 7 · order 1234').kind], [undefined, 'text'], 'data: and plain text: no link');
};
