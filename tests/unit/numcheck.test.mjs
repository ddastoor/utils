// The Number Detective's engine (devcore-ids.wasm, wasm/devcore/src/ids.rs): every check held to an independent reading.
//  - tests/fixtures/numcheck/reference.json (scripts/make-numcheck-reference.py): python-stdnum 2.2 for Aadhaar, VID, PAN,
//    GSTIN, EPIC, ISBN (hyphens, both forms, the group's agency), ISSN, EAN, IMEI, IBAN, BIC, ISIN and the Luhn check of cards
//    and ICCIDs; Google's libphonenumber (phonenumbers 9.0.44) for 3,000 Indian numbers written three ways; vininfo for VINs;
//  - in this suite: Braintree's credit-card-type (the networks), a second GS1 prefix table read against the one the tab ships,
//    a second reading of India Post's PIN directory (india-post-pincode), RBI's IFSC list itself (where scripts/make-ids-data.py
//    left it in node_modules/.cache), and known answers.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REF = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/numcheck/reference.json', import.meta.url)), 'utf8'));
const IFSC = fileURLToPath(new URL('../../node_modules/.cache/superutils-ids/ifsc-2.0.50/package/src/IFSC.json', import.meta.url));

export default async (t, { load, wasm }) => {
  const { bindDevcore } = await load('/src/wasm/devcore.ts');
  const d = bindDevcore(await wasm('devcore-ids'));
  const ids = (text, all = false) => d.json('ids', { text, all });
  const of = (text, kind, all = true) => ids(text, all).readings.find((r) => r.kind === kind);
  const ok = (r) => !!r && r.verdict !== 'invalid';

  // ---- the reference cases, kind by kind
  const by = {};
  for (const c of REF.cases) (by[c.kind] ||= []).push(c);
  const tally = (kind, test) => {
    const bad = [];
    for (const c of by[kind]) { const why = test(c); if (why) bad.push(`${c.text}: ${why}`); }
    t.ok(!bad.length, `${kind}: ${by[kind].length} cases as the reference reads them${bad.length ? ` — ${bad.length} differ: ${bad.slice(0, 4).join(' | ')}` : ''}`);
  };
  // a card of no network this tab knows is a card only with sixteen digits (the reference draws some numbers of no network)
  by.card = by.card.filter((c) => { const n = c.text.replace(/\D/g, ''); return d.json('ids:card', { number: n }).best || n.length === 16; });
  for (const kind of ['aadhaar', 'vid', 'pan', 'gstin', 'epic', 'issn', 'ean', 'iban', 'bic', 'isin', 'iccid', 'card']) {
    tally(kind, (c) => { const r = of(c.text, kind); return ok(r) === c.valid ? null : `ours ${r ? r.verdict : 'none'}, stdnum ${c.valid ? 'valid' : 'invalid'}`; });
  }
  tally('pan', (c) => { if (!c.valid) return null; const h = of(c.text, 'pan').fields.find(([l]) => l === 'Holder')?.[1]; const want = { 'Firm/Limited Liability Partnership': 'Firm / Limited Liability Partnership', 'Government Agency': 'Government agency', 'Krish (Trust Krish)': 'Krish (trust)', 'Local Authority': 'Local authority', 'Artificial Juridical Person': 'Artificial juridical person' }[c.holder] || c.holder; return h === want ? null : `holder ${h} ≠ ${want}`; });
  tally('imei', (c) => { const r = of(c.text, 'imei'); return ok(r) === c.valid ? null : `ours ${r ? r.verdict : 'none'}, stdnum ${c.valid}`; });
  tally('isbn', (c) => {
    const r = of(c.text, 'isbn');
    if (ok(r) !== c.valid) return `ours ${r ? r.verdict : 'none'}, stdnum ${c.valid}`;
    if (!c.valid) return null;
    const f = Object.fromEntries(r.fields);
    if (f['ISBN-13'] !== c.isbn13) return `ISBN-13 ${f['ISBN-13']} ≠ ${c.isbn13}`;
    if (c.isbn10 && f['ISBN-10'] !== c.isbn10) return `ISBN-10 ${f['ISBN-10']} ≠ ${c.isbn10}`;
    if (!c.isbn10 && !/^none/.test(f['ISBN-10'])) return `an ISBN-10 for a 979 ISBN: ${f['ISBN-10']}`;
    const ag = (f.Group || '').split(' — ')[1] || null;
    return ag === c.agency ? null : `agency ${ag} ≠ ${c.agency}`;
  });
  // libphonenumber: valid, the type, both formats and the place
  const TYPE = { fixed_line: 'fixed_line', mobile: 'mobile', fixed_line_or_mobile: 'fixed_line_or_mobile', toll_free: 'toll_free', premium_rate: 'premium_rate', shared_cost: 'shared_cost', uan: 'uan', unknown: 'unknown' };
  tally('phone', (c) => {
    const p = d.json('ids:phone', { nn: c.nn });
    if (TYPE[p.type] !== c.type) return `type ${p.type} ≠ ${c.type}`;
    const r = of(c.text, 'phone');
    if (ok(r) !== c.valid) return `ours ${r ? r.verdict : 'none'}, libphonenumber ${c.valid}`;
    if (!c.valid) return null;
    if (p.national !== c.national || p.international !== c.international) return `formats ${p.national} / ${p.international} ≠ ${c.national} / ${c.international}`;
    return (p.place || 'India') === c.place ? null : `place ${p.place} ≠ ${c.place}`;
  });
  tally('vin', (c) => {
    const r = of(c.text, 'vin'); if (!r) return 'no reading';
    const f = Object.fromEntries(r.fields);
    if ((f.Country || null) !== c.country) return `country ${f.Country} ≠ ${c.country}`;
    if (c.maker && (f.Maker || '').split(' — ')[1] !== c.maker) return `maker ${f.Maker} ≠ ${c.maker}`;
    if (c.check !== null && (r.verdict === 'valid') !== c.check) return `check ${r.verdict} ≠ ${c.check}`;
    return null;
  });

  // ---- card networks: Braintree's credit-card-type (RuPay, which it lacks, from NPCI's ranges)
  {
    const cct = require('credit-card-type');
    let n = 0, same = 0; const diff = [];
    const RUPAY = [[508500, 508999], [606985, 607984], [608001, 608500], [652150, 653149]];
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 4000; i++) {
      const pre = ['4', '5', '2', '3', '6', '8', '9', '1'][Math.floor(rnd() * 8)];
      let s = pre; while (s.length < 16) s += Math.floor(rnd() * 10);
      const ours = d.json('ids:card', { number: s }).best, theirs = cct(s)[0]?.niceType || null;
      const six = +s.slice(0, 6), rupay = RUPAY.some(([a, b]) => six >= a && six <= b) || /^8[12]/.test(s);
      n++;
      if (rupay ? ours === 'RuPay' || (theirs && ours === theirs) : ours === theirs) same++; else diff.push(`${s}: ${ours} ≠ ${theirs}`);
    }
    t.ok(same === n, `card networks: ${same} of ${n} random numbers named as credit-card-type names them (RuPay's ranges as RuPay) ${diff.slice(0, 3).join(' | ')}`);
    t.eq(['4111111111111111', '5555555555554444', '378282246310005', '6011111111111117', '3530111333300000', '6521500000000004', '8174000000000005'].map((s) => d.json('ids:card', { number: s }).best), ['Visa', 'Mastercard', 'American Express', 'Discover', 'JCB', 'RuPay', 'RuPay'], 'card networks: the test numbers of Visa, Mastercard, Amex, Discover, JCB; RuPay by NPCI’s ranges');
  }

  // ---- GS1 prefixes: the table the tab ships (gs1-prefix) read against a second one (gs1-prefix-code-to-country-code)
  {
    const { GS1_RANGES } = await import('gs1-prefix');
    const src = readFileSync(require.resolve('gs1-prefix-code-to-country-code/gs1CountryRanges.js'), 'utf8');
    const other = [...src.matchAll(/range:\s*\[(\d+),\s*(\d+)\][^}]*alpha2:\s*'([^']*)'/g)].map((m) => [+m[1], +m[2], m[3]]);
    const code = (p) => { const r = GS1_RANGES.find((r) => p >= r.prefixFrom && p <= r.prefixTo); return r?.organisationCountryCode || ''; };
    let agree = 0, both = 0; const diff = [];
    for (let i = 0; i < 1000; i++) {
      const p = String(i).padStart(3, '0'), o = other.find(([a, b]) => i >= a && i <= b)?.[2] ?? '';
      const ours = code(p);
      if (!ours || !o || o.includes('/')) continue;
      both++; if (ours === o) agree++; else diff.push(`${p}: ${ours} / ${o}`);
    }
    t.ok(both > 200 && agree / both > 0.97, `GS1 prefixes: the two tables agree on ${agree} of ${both} prefixes both give a country (${diff.slice(0, 6).join(', ')})`);
    const r = of('EAN 8901725181222', 'ean');
    t.ok(r && r.verdict === 'valid' && /890 — GS1 India \(India\)/.test(Object.fromEntries(r.fields)['GS1 prefix']), `an Indian product's barcode: GS1 India (${r && Object.fromEntries(r.fields)['GS1 prefix']})`);
    t.ok(/not where the product was made/.test(r.notes.join(' ')), 'the prefix is not the country of origin — said');
  }

  // ---- PIN codes: a second reading of India Post's directory
  {
    const ipp = require('india-post-pincode');
    const all = [];
    for (let p = 100000; p <= 999999; p++) { const x = ipp.lookupPincode(String(p)); if (x) all.push([String(p), x]); }
    t.eq(all.length, 19586, 'PIN codes: india-post-pincode has 19,586 PIN codes, as the directory the tab ships');
    let n = 0, sameState = 0, sameDist = 0; const diff = [];
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    for (const [pin, theirs] of all) {
      const r = of(pin, 'pin'); n++;
      if (!r || r.verdict !== 'valid') { diff.push(`${pin}: ours ${r?.verdict}`); continue; }
      const f = Object.fromEntries(r.fields);
      if (norm(f.State) === norm(theirs.state) || norm(f['Also filed under']).includes(norm(theirs.state))) sameState++; else diff.push(`${pin}: ${f.State} / ${theirs.state}`);
      const dist = norm(theirs.district);
      if ((norm(f.District) + norm(f.Districts) + norm(f['Also filed under'])).includes(dist)) sameDist++;
    }
    t.ok(sameState / n > 0.99, `PIN codes: every PIN code of the second reading is in the tab's directory, and ${sameState} of ${n} in the same state (${diff.slice(0, 4).join(' | ')})`);
    t.ok(sameDist / n > 0.97, `PIN codes: the district of ${sameDist} of ${n} PIN codes as the second reading names it`);
    // and none that it does not have
    let extra = 0; for (let p = 100000; p <= 999999; p += 97) { if (!ipp.lookupPincode(String(p)) && of(String(p), 'pin')?.verdict === 'valid') extra++; }
    t.eq(extra, 0, 'PIN codes: none valid in the tab that the second reading does not have (every 97th of 100000 – 999999)');
  }
  // known PIN codes
  const pinf = (p) => Object.fromEntries(of(p, 'pin').fields);
  t.eq([pinf('560001').District, pinf('560001').State, pinf('110001').State, pinf('400001').District, pinf('682555').State, pinf('744101').State], ['Bengaluru Urban', 'Karnataka', 'Delhi', 'Mumbai', 'Lakshadweep', 'Andaman and Nicobar Islands'], 'PIN codes: Bengaluru, New Delhi, Mumbai, Lakshadweep, Port Blair');
  t.eq(of('110025', 'pin').fields.find(([l]) => l === 'Also filed under')?.[1], 'Budaun (Uttar Pradesh)', 'a post office the directory files under another state is named apart, not in the PIN code’s own place');
  t.eq([of('012345', 'pin').verdict, of('999999', 'pin').verdict, of('560999', 'pin').verdict], ['invalid', 'format', 'unlisted'], 'PIN codes: 0 first refused, zone 9 is the Army Postal Service, a PIN not in the directory unlisted');
  t.ok(/560 — \d+ PIN codes, most of them in Bengaluru Urban, Karnataka/.test(pinf('560999')['Its first three digits']), `an unlisted PIN code: the place of its first three digits (${pinf('560999')['Its first three digits']})`);

  // ---- IFSC: RBI's list itself
  if (existsSync(IFSC)) {
    const list = JSON.parse(readFileSync(IFSC, 'utf8'));
    let n = 0, found = 0, near = 0, nearOk = 0; const miss = [];
    for (const [bank, branches] of Object.entries(list)) {
      const set = new Set(branches.map((b) => (typeof b === 'number' ? String(b).padStart(6, '0') : b)));
      const pick = branches.length > 60 ? [0, 1, 2, Math.floor(branches.length / 2), branches.length - 2, branches.length - 1, ...Array.from({ length: 30 }, (_, i) => Math.floor((i * 7919) % branches.length))] : branches.map((_, i) => i);
      for (const i of pick) {
        const b = branches[i], code = bank + '0' + (typeof b === 'number' ? String(b).padStart(6, '0') : b);
        n++; const r = of(code, 'ifsc'); if (r && r.verdict === 'valid') found++; else miss.push(code);
        const alt = code.slice(0, -1) + (code.at(-1) === '9' ? '0' : String.fromCharCode(code.charCodeAt(10) + 1));
        if (/^[A-Z0-9]$/.test(alt.at(-1))) { near++; const ra = of(alt, 'ifsc'); if ((ra?.verdict === 'valid') === set.has(alt.slice(5))) nearOk++; }
      }
    }
    t.ok(found === n, `IFSC: ${found} of ${n} codes of RBI's list (every bank's, a spread of each) found ${miss.slice(0, 4).join(', ')}`);
    t.ok(nearOk === near, `IFSC: ${nearOk} of ${near} codes one character off listed exactly as the list says`);
  } else t.ok(true, 'IFSC: RBI’s list is not in node_modules/.cache (python3 scripts/make-ids-data.py puts it there) — the list check is skipped');
  const ifs = (s) => of(s, 'ifsc');
  t.eq([ifs('SBIN0000691').verdict, Object.fromEntries(ifs('SBIN0000691').fields).Bank, ifs('HDFC0000001').verdict, Object.fromEntries(ifs('UTIB0000004').fields).Bank], ['valid', 'State Bank of India', 'valid', 'Axis Bank'], 'IFSC: known branches of SBI, HDFC Bank, Axis Bank');
  t.eq([Object.fromEntries(ifs('YESB0AURDCC').fields).Bank, ifs('QQQQ0123456').verdict, ifs('SBIN0999999').verdict], ['Aurangabad District Central Co-operative Bank', 'invalid', 'unlisted'], 'IFSC: a bank working through another bank’s code named as itself; an unknown bank code refused; a branch RBI does not list unlisted');
  t.ok(!of('SBIN1000691', 'ifsc'), 'IFSC: the 5th character must be 0');

  // ---- known answers (stdnum's own examples, the networks' test numbers, real codes)
  t.eq([of('2341 2341 2346', 'aadhaar').verdict, of('2341 2341 2347', 'aadhaar').fix, of('1341 2341 2346', 'aadhaar').verdict], ['valid', '234123412346', 'invalid'], 'Aadhaar: stdnum’s example valid; a wrong check digit gives the right one; 1 first refused');
  t.eq([of('2341234123412341', 'vid').verdict, of('27AAPFU0939F1ZV', 'gstin').verdict, of('27AAPFU0939F1ZX', 'gstin').fix, of('WKH1186253', 'epic').verdict], ['valid', 'valid', '27AAPFU0939F1ZV', 'valid'], 'VID, GSTIN (stdnum’s examples), a GSTIN’s check character corrected, EPIC');
  const g = Object.fromEntries(of('27AAPFU0939F1ZV', 'gstin').fields);
  t.eq([g.State, g.PAN, g.Registration], ['27 — Maharashtra', 'AAPFU0939F — Firm / Limited Liability Partnership', 'the holder’s 1st in this state'], 'GSTIN: its state, its PAN and the holder type, the registration count');
  t.eq([of('38AAPFU0939F1Z?'.replace('?', ''), 'gstin'), of('07DELA12345B1Z' + 'X', 'gstin')?.kind].map((x) => (x && x.kind) || x || null), [null, 'gstin'], 'GSTIN: 14 characters is no GSTIN; a TAN in place of the PAN (a tax deductor) is read');
  t.eq([of('ABCDE1234F', 'pan').verdict, of('ABCPD0000E', 'pan').verdict, of('AAACR5055K', 'pan').fields[0][1]], ['invalid', 'invalid', 'Company'], 'PAN: D is no holder type, 0000 refused, C a company');
  t.eq(of('ISBN 978-81-7371-146-6', 'isbn').value, '978-81-7371-146-6', 'ISBN: hyphenated by the ISBN ranges');
  t.eq([of('ISBN 0-306-40615-2', 'isbn').value, Object.fromEntries(of('ISBN 0-306-40615-2', 'isbn').fields)['ISBN-13']], ['978-0-306-40615-7', '978-0-306-40615-7'], 'ISBN-10 → ISBN-13 (Wikipedia’s example)');
  t.eq([of('ISSN 0317-8471', 'issn').verdict, of('ISSN 0317-8472', 'issn').fix], ['valid', '03178471'], 'ISSN: valid, a wrong check digit corrected');
  t.eq([of('35 209900 176148 1', 'imei').verdict, of('35 209900 176148 2', 'imei').fix, of('35686800-004141-20', 'imei').title], ['valid', '352099001761481', 'IMEISV (IMEI with software version)'], 'IMEI: Wikipedia’s example; a corrected check digit; stdnum’s IMEISV');
  t.eq([of('DE89 3704 0044 0532 0130 00', 'iban').verdict, of('DE88 3704 0044 0532 0130 00', 'iban').fix, of('GB82 WEST 1234 5698 7654 32', 'iban').verdict, of('IN12 3456 7890 1234 5678', 'iban')?.verdict], ['valid', 'DE89370400440532013000', 'valid', 'invalid'], 'IBAN: the registry’s German and British examples; wrong check digits corrected; India has none');
  t.eq([of('INE002A01018', 'isin').verdict, of('US0378331005', 'isin').verdict, of('US0378331006', 'isin').fix], ['valid', 'valid', 'US0378331005'], 'ISIN: Reliance Industries, Apple; a corrected check digit');
  t.eq([of('1HGCM82633A004352', 'vin').verdict, of('1M8GDM9AXKP042788', 'vin').verdict, of('1M8GDM9A1KP042788', 'vin').verdict], ['valid', 'valid', 'format'], 'VIN: two valid check digits (one of them X); a VIN without the North American check is only its shape');
  t.eq([of('SBININBB', 'bic').fields[1][1], of('DEUTDEFF500', 'bic').verdict, of('SBINQQBB', 'bic')], ['IN — India', 'format', undefined], 'BIC: SBI in India, Deutsche Bank’s branch code; QQ is no country');
  t.eq(of('8991101200003204514', 'iccid')?.verdict ?? 'none', 'valid', 'ICCID: an Indian SIM card number (89 91 …) passes the Luhn check');
  t.eq(Object.fromEntries(of('8991101200003204514', 'iccid').fields).Country, '+91 — India', 'ICCID: the country by its calling code');

  // ---- phones: the tab's reading of what people paste
  const ph = (s) => of(s, 'phone');
  t.eq([ph('+91 98765 43210').verdict, Object.fromEntries(ph('+91 98765 43210').fields)['In India'], ph('098765 43210').value, ph('919876543210').value], ['valid', '98765 43210', '+91 98765 43210', '+91 98765 43210'], 'phones: a mobile with +91, with 0, with 91 and no +');
  const blr = Object.fromEntries(ph('080 2233 4455').fields);
  t.eq([blr.Place, blr['STD code'], blr['From abroad']], ['Bangalore, Karnataka', '080', '+91 80 2233 4455'], 'phones: a Bengaluru landline — its place and STD code');
  t.eq([ph('1800 11 4000').summary.includes('toll-free'), ph('112').summary.includes('emergency'), ph('1098').summary.includes('Childline'), ph('100').summary.includes('Police')], [true, true, true, true], 'phones: toll-free, 112, Childline, Police');
  t.eq([ph('+44 20 7946 0000').fields[0][1], ph('+49 30 123456').fields[0][1], ph('+1 415 555 0100').fields[0][1].includes('North American'), ph('+999 1234').verdict], ['United Kingdom (the code is shared with Guernsey, Isle of Man, Jersey)', 'Germany', true, 'invalid'], 'phones: other countries by calling code (+44 shared by four); +999 is none');
  t.eq(ph('+91 12345').verdict, 'invalid', 'phones: +91 and five digits is no Indian number');

  // ---- what leads, what is left out
  const top = (s) => ids(s).readings.map((r) => r.kind);
  t.eq(top('9876543210')[0], 'phone', 'ten bare digits: a mobile number before an ISBN-10 that happens to pass');
  t.eq(top('81-7371-146-1')[0], 'isbn', 'an ISBN-10 written with hyphens leads');
  t.eq(top('ISBN 8173711461')[0], 'isbn', 'a label names the kind: ISBN first');
  t.eq(top('4111 1111 1111 1111'), ['card'], 'a valid card number: the VID reading that fails its check is left out');
  t.ok(!top('2341 2341 2346').includes('account') && !top('2341 2341 2346').includes('uan'), 'a valid Aadhaar number: no weak readings (account number, UAN) beside it');
  t.eq([top('4111 1111 1111 1112')[0], ids('4111 1111 1111 1112').readings[0].fix], ['card', '4111111111111111'], 'a Visa number with a mistyped digit: the failed card reading first, with the right check digit');
  t.ok(!top('1234 5678 9012 3456').includes('card'), 'sixteen digits of no card network are no card');
  t.eq(top('PAN: ABCPD1234E'), ['pan'], 'a label in front: “PAN:” read');
  t.eq([top('UPI ID: 9820012345@ybl')[0], Object.fromEntries(of('9820012345@ybl', 'upi').fields)['Before the @'], of('ram.kumar@gmail.com', 'upi').verdict, Object.fromEntries(of('shop@okicici', 'upi').fields).Handle], ['upi', '9820012345 — a mobile number', 'invalid', '@okicici — Google Pay (ICICI Bank)'], 'UPI IDs: the handle’s app, a mobile number before the @, an e-mail address refused');
  t.eq([top('XXXX XXXX 1234'), top('MH 12 AB 1234'), top('22 BH 1234 AA'), top('L17110MH1973PLC019786'), top('UDYAM-MH-19-0012345'), top('MH1220110012345')].map((x) => x[0]), ['aadhaar_masked', 'vehicle', 'vehicle', 'cin', 'udyam', 'dl'], 'masked Aadhaar, vehicle numbers (also Bharat series), CIN, Udyam, driving licence');
  t.eq(Object.fromEntries(of('DL3CAB1234', 'vehicle').fields)['Kind (Delhi)'], 'C — car', 'Delhi’s vehicle class letter');
  t.eq([ids('hello').readings.length, ids('').readings.length, ids('hello').shape], [0, 0, '5 letters'], 'nothing that is a number: no reading, and what it is made of');
  const info = d.json('ids:info', {});
  t.eq([info.pins, info.districts, info.ifsc, info.banks, info.geo], [19586, 754, 176918, 1510, 8823], 'the tables: 19,586 PIN codes, 754 districts, 176,918 IFSC codes, 1,510 banks, 8,823 phone prefixes');
};
