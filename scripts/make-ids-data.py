#!/usr/bin/env python3
"""The Number Detective's tables (potentials #84): what devcore-ids.wasm knows besides its check-digit rules.

    python3 scripts/make-ids-data.py        (needs: pip install python-stdnum==2.2 phonenumbers==9.0.44 vininfo==2.0.0;
                                            npm ci for @devzoy/indian-pincode, gs1-prefix, credit-card-type; npm on the PATH)

Writes wasm/devcore/data/ids/*.bin (the bulk: PIN codes, IFSC codes, the places of Indian phone numbers, ISBN ranges, VIN
makers) and wasm/devcore/src/ids_tables.rs (the small tables and the sources' versions). Both are committed; the engine
takes them with include_bytes! / mod. Sources:
  - PIN codes: India Post's "All India Pincode Directory" (data.gov.in, Government Open Data License – India: attribution),
    as cleaned by @devzoy/indian-pincode 2.1.0 (MIT; data snapshot 2025.10.03) — 19,586 PIN codes with their districts.
  - IFSC: RBI's lists as Razorpay's IFSC release carries them (npm `ifsc` 2.0.50, 14 Nov 2025; MIT, the data public domain):
    bank codes and names, every branch code, sub-member banks. Fetched with `npm pack` into node_modules/.cache (its
    package pulls in the old `request` library, so it is not a devDependency) and checked against the registry's SHA-512.
  - Indian phone numbers: Google's libphonenumber (Apache-2.0) as the `phonenumbers` 9.0.44 package carries it — the number
    patterns for India (mobile, fixed line, toll free …), its emergency numbers, the places of landline prefixes, every
    country calling code with its regions and the regions' English names.
  - ISBN: the International ISBN Agency's ranges (RangeMessage.xml) as python-stdnum 2.2 carries them (isbn.dat).
  - IBAN: SWIFT's IBAN registry as python-stdnum carries it (iban.dat).
  - Card networks: Braintree's credit-card-type 10.3.1 (MIT), and RuPay's ranges (NPCI's, as published on Wikipedia's
    "Payment card number"), which it does not have.
  - GS1 prefixes: gs1-prefix 1.0.0 (MIT; GS1's list read against Wikipedia's).
  - VIN makers: vininfo 2.0.0 (BSD-3-Clause): world manufacturer identifiers and the countries of the first two letters.
"""
import base64, hashlib, json, os, re, struct, subprocess, sys, tempfile, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'wasm/devcore/data/ids'
TABLES = ROOT / 'wasm/devcore/src/ids_tables.rs'
CACHE = ROOT / 'node_modules/.cache/superutils-ids'
IFSC_VERSION = '2.0.50'
IFSC_INTEGRITY = 'sha512-ge4uCv7wCi1JKhhfAnvIz4CzB/JmNwcdkGN/79yMyGlxejsF9TREirpVxvCpn8OxZIzNFwxeo+BSx5/IN0YxwQ=='
IFSC_DATE = '14 Nov 2025'
WANT = {'stdnum': '2.2', 'phonenumbers': '9.0.44', 'vininfo': '2.0.0'}

def varint(n):
    assert n >= 0
    b = bytearray()
    while True:
        x = n & 0x7f; n >>= 7
        if n: b.append(x | 0x80)
        else: b.append(x); return bytes(b)

def sbytes(s, w=1):
    e = s.encode('utf-8'); assert len(e) < (1 << (8 * w)), s
    return (len(e).to_bytes(w, 'little')) + e

def node_json(code):
    return json.loads(subprocess.check_output(['node', '-e', code], cwd=ROOT, text=True))

SMALL = {'and', 'of', 'the', 'at', 'in', 'on'}
def title(s):
    """India Post writes names in capitals: 'KAIMUR (BHABUA)' → 'Kaimur (Bhabua)', 'S.A.S NAGAR' → 'S.A.S Nagar'."""
    s = re.sub(r'^THE\s+', '', s.strip())
    out = []
    for i, w in enumerate(s.split()):
        def cap(t):
            if '.' in t: return t  # initials stay as written
            return t[:1].upper() + t[1:].lower()
        lw = w.lower()
        if i and lw in SMALL: out.append(lw); continue
        out.append(re.sub(r"[A-Za-z][A-Za-z.']*", lambda m: cap(m.group(0)), w))
    return ' '.join(out)

def rust_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def check_versions():
    import stdnum, phonenumbers, vininfo
    got = {'stdnum': stdnum.__version__, 'phonenumbers': phonenumbers.__version__, 'vininfo': vininfo.VERSION if isinstance(vininfo.VERSION, str) else '.'.join(map(str, vininfo.VERSION))}
    for k, v in WANT.items():
        if got[k] != v: sys.exit(f'{k} {got[k]} is installed; this script is pinned to {v} (pip install {k if k != "stdnum" else "python-stdnum"}=={v})')
    return got

# ---------------------------------------------------------------- PIN codes
def pins():
    d = node_json("process.stdout.write(JSON.stringify(require('./node_modules/@devzoy/indian-pincode/dist/core-data.cjs')))")
    pkg = json.loads((ROOT / 'node_modules/@devzoy/indian-pincode/package.json').read_text())
    states = [title(s) for s in d['states']]
    pairs = [(title(d['districts'][di]), si) for di, si in d['districtPairs']]
    pin, acc = [], 0
    for x in d['pincodes']: acc += x; pin.append(acc)
    assert pin == sorted(pin) and len(set(pin)) == len(pin)
    sparse_all = {int(k): v for k, v in d['statesAllSparse'].items()}
    b = bytearray()
    b += struct.pack('<H', len(states))
    for s in states: b += sbytes(s)
    b += struct.pack('<H', len(pairs))
    for name, si in pairs: b += bytes([si]) + sbytes(name)
    b += struct.pack('<I', len(pin))
    prev = 0
    for i, p in enumerate(pin):
        g = d['pairGroups'][i]; g = g if isinstance(g, list) else [g]
        st = d['stateIdx'][i]
        others = [s for s in sparse_all.get(i, []) if s != st]
        b += varint(p - prev) + varint(st + 1) + varint(len(g)) + b''.join(varint(x) for x in g)
        b += varint(len(others)) + b''.join(varint(x) for x in others)
        prev = p
    (OUT / 'pins.bin').write_bytes(bytes(b))
    return {'pins': len(pin), 'districts': len(pairs), 'states': len(states), 'version': d['version'], 'package': f"@devzoy/indian-pincode {pkg['version']}"}

# ---------------------------------------------------------------- IFSC
def ifsc_package():
    CACHE.mkdir(parents=True, exist_ok=True)
    tgz = CACHE / f'ifsc-{IFSC_VERSION}.tgz'
    if not tgz.exists():
        with tempfile.TemporaryDirectory() as t:
            subprocess.check_call(['npm', 'pack', f'ifsc@{IFSC_VERSION}', '--pack-destination', t, '--silent'], cwd=t)
            os.replace(Path(t) / f'ifsc-{IFSC_VERSION}.tgz', tgz)
    algo, want = IFSC_INTEGRITY.split('-', 1)
    if base64.b64encode(hashlib.new(algo, tgz.read_bytes()).digest()).decode() != want:
        tgz.unlink(); sys.exit('the ifsc package does not match its pinned SHA-512 — fetched again next time')
    out = CACHE / f'ifsc-{IFSC_VERSION}'
    if not (out / 'package/src/IFSC.json').exists():
        with tarfile.open(tgz) as t: t.extractall(out, filter='data')
    return out / 'package/src'

def ifsc():
    src = ifsc_package()
    branches = json.loads((src / 'IFSC.json').read_text())
    names = json.loads((src / 'banknames.json').read_text())
    sublet = json.loads((src / 'sublet.json').read_text())
    custom = json.loads((src / 'custom-sublets.json').read_text())
    b = bytearray()
    codes = sorted(branches)
    b += struct.pack('<H', len(codes))
    total = 0
    for c in codes:
        assert re.fullmatch(r'[A-Z]{4}', c), c
        nums = sorted({x for x in branches[c] if isinstance(x, int)})
        strs = sorted({x for x in branches[c] if isinstance(x, str)})
        for s in strs: assert re.fullmatch(r'[A-Z0-9]{6}', s) and not s.isdigit(), (c, s)
        for n in nums: assert 0 <= n <= 999999
        total += len(nums) + len(strs)
        b += c.encode() + varint(len(nums))
        prev = -1
        for n in nums: b += varint(n - prev - 1); prev = n
        b += varint(len(strs)) + b''.join(s.encode() for s in strs)
    sub = sorted(sublet.items())
    b += struct.pack('<H', len(sub))
    for k, v in sub: assert len(k) == 11 and v, (k, v); b += k.encode() + sbytes(v)  # a bank code, or a bank's name
    cus = sorted(custom.items(), key=lambda kv: (-len(kv[0]), kv[0]))  # longest prefix first
    b += struct.pack('<H', len(cus))
    for k, v in cus: assert 4 <= len(k) <= 11 and v, (k, v); b += sbytes(k) + sbytes(v)  # a bank code, or a bank's name
    (OUT / 'ifsc.bin').write_bytes(bytes(b))
    return {'banks': sorted(names.items()), 'codes': total, 'banks_listed': len(codes)}

# ---------------------------------------------------------------- phones
def phones():
    import phonenumbers as P
    from phonenumbers import PhoneMetadata
    from phonenumbers.geodata import GEOCODE_DATA
    from phonenumbers.geodata.locale import LOCALE_DATA
    m = PhoneMetadata.metadata_for_region('IN')
    pats = {}
    for k in ('general_desc', 'fixed_line', 'mobile', 'toll_free', 'premium_rate', 'shared_cost', 'uan', 'voip', 'personal_number', 'pager', 'voicemail'):
        dsc = getattr(m, k, None)
        if dsc and dsc.national_number_pattern: pats[k] = (dsc.national_number_pattern, list(dsc.possible_length))
    s = PhoneMetadata.short_metadata_for_region('IN')
    pats['emergency'] = (s.emergency.national_number_pattern, list(s.emergency.possible_length))
    pats['short_code'] = (s.short_code.national_number_pattern, list(s.short_code.possible_length))
    # the places of landline prefixes (+91 …): longest prefix first wins
    geo = sorted((k[2:], v['en']) for k, v in GEOCODE_DATA.items() if k.startswith('91') and 'en' in v)
    descs = sorted({v for _, v in geo})
    di = {v: i for i, v in enumerate(descs)}
    b = bytearray(struct.pack('<H', len(descs)))
    for v in descs: b += sbytes(v)
    b += struct.pack('<I', len(geo))
    for k, v in geo:
        assert k.isdigit() and 1 <= len(k) <= 9, k
        b += bytes([len(k)]) + struct.pack('<I', int(k)) + struct.pack('<H', di[v])
    (OUT / 'geo91.bin').write_bytes(bytes(b))
    codes = sorted(P.COUNTRY_CODE_TO_REGION_CODE.items())
    regions = {}
    for r, names in LOCALE_DATA.items():
        if 'en' not in names or not re.fullmatch(r'[A-Z]{2}', r): continue
        v, seen = names['en'], set()
        while v.startswith('*') and v not in seen: seen.add(v); v = names[v[1:]]  # '*aa': the same as the name for 'aa'
        regions[r] = re.sub(r'(?<=\w )(Of|And|The|Da|De)(?= )', lambda m: m.group(1).lower(), v)  # 'Isle Of Man' → 'Isle of Man'
    # how libphonenumber writes an Indian number: (pattern, format, the last leading-digits pattern, national prefix rule)
    def fmts(lst):
        out = []
        for nf in lst:
            ldp = nf.leading_digits_pattern[-1] if nf.leading_digits_pattern else ''
            out.append((nf.pattern, nf.format.replace('\\', '$'), ldp, (nf.national_prefix_formatting_rule or '').replace('\\', '$')))
        return out
    return {'patterns': pats, 'geo': len(geo), 'calling': codes, 'regions': regions, 'version': P.__version__,
            'national': fmts(m.number_format), 'intl': fmts(m.intl_number_format)}

# ---------------------------------------------------------------- ISBN ranges (numdb tree)
def isbn():
    import stdnum, stdnum.numdb as N
    text = (Path(stdnum.__file__).parent / 'isbn.dat').read_text()
    date = re.search(r'# file date (.+)', text).group(1).strip()
    db = N.get('isbn')
    agencies = []
    def ag(a):
        if a not in agencies: agencies.append(a)
        return agencies.index(a)
    # stdnum's numdb: db.prefixes = [(length, low, high, props, children)] at each level
    def node(level):
        out = bytearray(varint(len(level)))
        for length, low, high, props, children in level:
            assert length == len(low), (length, low)
            assert len(low) == len(high) and low.isdigit() and high.isdigit() and len(low) <= 9, (low, high)
            a = props.get('agency')
            out += bytes([len(low)]) + struct.pack('<II', int(low), int(high)) + varint(ag(a) + 1 if a else 0)
            out += node(children)
        return out
    tree = node(db.prefixes)
    b = bytearray(struct.pack('<H', len(agencies)))
    for a in agencies: b += sbytes(a)
    b += tree
    (OUT / 'isbn.bin').write_bytes(bytes(b))
    return {'date': date, 'agencies': len(agencies)}

def iban():
    import stdnum
    rows = []
    for line in (Path(stdnum.__file__).parent / 'iban.dat').read_text().splitlines():
        m = re.match(r'([A-Z]{2}) country="([^"]+)" bban="([^"]+)"', line)
        if m: rows.append(m.groups())
    return rows

# ---------------------------------------------------------------- cards, GS1, VIN
RUPAY = [[508500, 508999], [606985, 607984], [608001, 608500], [652150, 653149], 81, 82]

# credit-card-type's ORIGINAL_TEST_ORDER: of two patterns as long, the network tried first wins. RuPay goes first: its
# ranges are NPCI's own (Maestro's 506779 – 508999 holds RuPay's 508500 – 508999).
ORDER = ['visa', 'mastercard', 'american-express', 'diners-club', 'discover', 'troy', 'jcb', 'unionpay', 'naranja', 'verve',
         'maestro', 'elo', 'mir', 'hiper', 'hipercard']
def cards():
    types = node_json("process.stdout.write(JSON.stringify(require('credit-card-type/dist/lib/card-types.js')))")
    assert sorted(types) == sorted(ORDER), sorted(types)
    rows = [('RuPay', [p if isinstance(p, list) else [p, p] for p in RUPAY], [16], [4, 8, 12], 'CVV', 3)]
    for k in ORDER:
        t = types[k]
        pats = [p if isinstance(p, list) else [p, p] for p in t['patterns']]
        rows.append((t['niceType'], pats, t['lengths'], t['gaps'], t['code']['name'], t['code']['size']))
    return rows

def gs1():
    rows = node_json("import('gs1-prefix').then(m => process.stdout.write(JSON.stringify(m.GS1_RANGES)))")
    return [(r['prefixFrom'], r['prefixTo'], r['issuingOrganisation'] or '', r['organisationCountry'] or '', r['note'] or '') for r in rows]

def vin():
    import vininfo.dicts.wmi as W, vininfo.dicts.countries as C
    wmi = sorted((k, v if isinstance(v, str) else v.manufacturer) for k, v in W.WMI.items())  # a brand object: its maker, as Vin.manufacturer says
    b = bytearray(struct.pack('<H', len(wmi)))
    for k, v in wmi:
        assert 2 <= len(k) <= 3, k
        b += sbytes(k) + sbytes(v)
    (OUT / 'wmi.bin').write_bytes(bytes(b))
    return sorted(C.COUNTRIES.items())

def main():
    vers = check_versions()
    OUT.mkdir(parents=True, exist_ok=True)
    p, f, ph, ib, rows_iban, cr, g, vc = pins(), ifsc(), phones(), isbn(), iban(), cards(), gs1(), vin()
    R = []
    R.append('// GENERATED by scripts/make-ids-data.py — do not edit. The Number Detective\'s small tables (CLAUDE.md §3 "Number Detective").')
    R.append('#![allow(dead_code)]')
    R.append(f'pub const PIN_SOURCE: &str = {rust_str("India Post’s All India Pincode Directory (data.gov.in, GODL-India) as cleaned by " + p["package"] + ", snapshot " + p["version"])};')
    R.append(f'pub const PIN_VERSION: &str = {rust_str(p["version"])};')
    R.append(f'pub const IFSC_SOURCE: &str = {rust_str("RBI’s lists of IFSC codes as Razorpay’s IFSC " + IFSC_VERSION + " carries them (" + IFSC_DATE + ")")};')
    R.append(f'pub const PHONE_SOURCE: &str = {rust_str("Google’s libphonenumber (phonenumbers " + ph["version"] + ")")};')
    R.append(f'pub const ISBN_SOURCE: &str = {rust_str("the International ISBN Agency’s ranges of " + ib["date"] + " (python-stdnum " + vers["stdnum"] + ")")};')
    R.append('/// RBI\'s bank codes (the first four letters of an IFSC) and the banks\' names, sorted by code.')
    R.append('pub static BANKS: &[(&str, &str)] = &[')
    for k, v in f['banks']: R.append(f'    ({rust_str(k)}, {rust_str(v)}),')
    R.append('];')
    R.append('/// libphonenumber\'s patterns for India: (kind, national number pattern, possible lengths).')
    R.append('pub static IN_PATTERNS: &[(&str, &str, &[u8])] = &[')
    for k, (pat, lens) in ph['patterns'].items(): R.append(f'    ({rust_str(k)}, {rust_str(pat)}, &{lens}),')
    R.append('];')
    R.append('/// How libphonenumber writes an Indian number: (pattern, format with $1 …, last leading-digits pattern, national prefix rule).')
    for name in ('national', 'intl'):
        R.append(f'pub static IN_FORMAT_{name.upper()}: &[(&str, &str, &str, &str)] = &[')
        for row in ph[name]: R.append('    (' + ', '.join(rust_str(x) for x in row) + '),')
        R.append('];')
    R.append('/// Country calling codes and the regions that use them (libphonenumber).')
    R.append('pub static CALLING: &[(u16, &[&str])] = &[')
    for cc, regs in ph['calling']: R.append(f'    ({cc}, &[{", ".join(rust_str(r) for r in regs)}]),')
    R.append('];')
    R.append('/// ISO 3166 region codes and their English names (libphonenumber\'s locale data).')
    R.append('pub static REGIONS: &[(&str, &str)] = &[')
    for r in sorted(ph['regions']): R.append(f'    ({rust_str(r)}, {rust_str(ph["regions"][r])}),')
    R.append('];')
    R.append('/// SWIFT\'s IBAN registry (python-stdnum\'s iban.dat): country, its name in the registry, the BBAN\'s structure.')
    R.append('pub static IBAN: &[(&str, &str, &str)] = &[')
    for cc, name, bban in rows_iban: R.append(f'    ({rust_str(cc)}, {rust_str(name)}, {rust_str(bban)}),')
    R.append('];')
    import stdnum.isin as SI, stdnum.bic as SB
    R.append('/// The country codes python-stdnum accepts in an ISIN and in a BIC (ISO 3166 and the special ones), sorted.')
    R.append('pub static ISIN_COUNTRIES: &[&str] = &[' + ', '.join(rust_str(c) for c in sorted(set(SI._country_codes))) + '];')
    R.append('pub static BIC_COUNTRIES: &[&str] = &[' + ', '.join(rust_str(c) for c in sorted(set(SB._country_codes))) + '];')
    R.append('/// Card networks: (name, IIN ranges [low, high] of any number of digits, lengths, gaps, code name, code size).')
    R.append('pub static CARDS: &[(&str, &[(u32, u32)], &[u8], &[u8], &str, u8)] = &[')
    for name, pats, lens, gaps, cn, cs in cr:
        R.append(f'    ({rust_str(name)}, &[{", ".join(f"({a}, {b})" for a, b in pats)}], &{lens}, &{gaps}, {rust_str(cn)}, {cs}),')
    R.append('];')
    R.append('/// GS1 prefixes (gs1-prefix): from, to, issuing organisation, its country, note.')
    R.append('pub static GS1: &[(&str, &str, &str, &str, &str)] = &[')
    for row in g: R.append('    (' + ', '.join(rust_str(x) for x in row) + '),')
    R.append('];')
    R.append('/// The countries of a VIN\'s first two characters (vininfo).')
    R.append('pub static VIN_COUNTRIES: &[(&str, &str)] = &[')
    for k, v in vc: R.append(f'    ({rust_str(k)}, {rust_str(v)}),')
    R.append('];')
    TABLES.write_text('\n'.join(R) + '\n')
    meta = {'pins': p, 'ifsc': {'codes': f['codes'], 'banks': len(f['banks']), 'banks_listed': f['banks_listed'], 'version': IFSC_VERSION, 'date': IFSC_DATE},
            'phone': {'geo': ph['geo'], 'version': ph['version']}, 'isbn': ib, 'versions': vers}
    (OUT / 'meta.json').write_text(json.dumps(meta, indent=1) + '\n')
    for x in sorted(OUT.iterdir()): print(f'{x.name:12} {x.stat().st_size:>9,} bytes')
    print(f'{TABLES.name:12} {TABLES.stat().st_size:>9,} bytes')

if __name__ == '__main__':
    main()
