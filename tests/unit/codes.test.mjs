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
};
