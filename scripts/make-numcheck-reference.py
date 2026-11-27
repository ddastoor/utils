#!/usr/bin/env python3
"""The Number Detective's reference answers (tests/fixtures/numcheck/reference.json), made by independent implementations:

    python3 scripts/make-numcheck-reference.py      (pip install python-stdnum==2.2 phonenumbers==9.0.44 vininfo==2.0.0)

  - python-stdnum 2.2: Aadhaar, VID, PAN, GSTIN, EPIC, ISBN (validity, hyphens, ISBN-10 / -13, the group's agency), ISSN,
    EAN / UPC / GTIN, IMEI, IBAN (without the national checks), BIC, ISIN, the Luhn check of card numbers and ICCIDs;
  - phonenumbers 9.0.44 (Google's libphonenumber): Indian numbers written three ways — valid or not, the type, the national
    and international formats, the place;
  - vininfo 2.0.0: a VIN's country and maker, and its check digit.
Every number is drawn from a seeded random generator (the same file each time); about half are made valid on purpose.
"""
import json, random
from pathlib import Path

import stdnum.in_.aadhaar as AADHAAR, stdnum.in_.vid as VID, stdnum.in_.pan as PAN, stdnum.in_.gstin as GSTIN, stdnum.in_.epic as EPIC
import stdnum.isbn as ISBN, stdnum.issn as ISSN, stdnum.ean as EAN, stdnum.imei as IMEI, stdnum.iban as IBAN, stdnum.bic as BIC, stdnum.isin as ISIN
from stdnum import luhn, verhoeff
import stdnum.numdb as numdb
import phonenumbers as P
from phonenumbers import geocoder
from vininfo import Vin

R = random.Random(84)
OUT = Path(__file__).resolve().parent.parent / 'tests/fixtures/numcheck/reference.json'
D = '0123456789'
U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
A36 = D + U

def digits(n, first=D): return R.choice(first) + ''.join(R.choice(D) for _ in range(n - 1))
def ok(mod, x):
    try: return bool(mod.validate(x))
    except Exception: return False

cases = []
def add(kind, text, **expect): cases.append({'kind': kind, 'text': text, **expect})

# ---- Aadhaar and VID (Verhoeff)
for i in range(400):
    n = digits(11, '0123456789' if i % 10 == 0 else '23456789')
    n += verhoeff.calc_check_digit(n) if i % 2 else R.choice(D)
    add('aadhaar', n if i % 3 else f'{n[:4]} {n[4:8]} {n[8:]}', valid=ok(AADHAAR, n))
for p in ['234567765432', '999999999999', '222222222222']: add('aadhaar', p, valid=ok(AADHAAR, p))
for i in range(250):
    n = digits(15, '0123456789' if i % 10 == 0 else '23456789')
    n += verhoeff.calc_check_digit(n) if i % 2 else R.choice(D)
    add('vid', n, valid=ok(VID, n))

# ---- PAN, GSTIN, EPIC
for i in range(300):
    t = R.choice('ABCFGHJLPTK' if i % 4 else U)
    n = ''.join(R.choice(U) for _ in range(3)) + t + R.choice(U) + ('0000' if i % 25 == 0 else digits(4)) + R.choice(U)
    add('pan', n, valid=ok(PAN, n), holder=(PAN.info(n)['holder_type'] if ok(PAN, n) else None))
states = [f'{i:02d}' for i in range(1, 38)]
for i in range(500):
    st = R.choice(states if i % 6 else ['00', '39', '40', '50', '88'])
    pan = ''.join(R.choice(U) for _ in range(3)) + R.choice('ABCFGHJLPTK') + R.choice(U) + digits(4, '123456789') + R.choice(U)
    body = st + pan + R.choice(A36[1:] if i % 9 else '0') + ('Z' if i % 11 else R.choice(U))
    n = body + (luhn.calc_check_digit(body, A36) if i % 2 else R.choice(A36))
    add('gstin', n, valid=ok(GSTIN, n))
for i in range(250):
    s = ''.join(R.choice(U) for _ in range(3)) + digits(6)
    n = s + (luhn.calc_check_digit(s[3:]) if i % 2 else R.choice(D))
    add('epic', n, valid=ok(EPIC, n))

# ---- ISBN, ISSN, EAN
db = numdb.get('isbn')
def agency(n13):
    return next((p.get('agency') for _, p in db.info(n13) if p.get('agency')), None)
for i in range(500):
    if i % 2:
        n = R.choice(['978', '979']) + digits(9)
        n += ISBN.ean.calc_check_digit(n) if i % 4 != 1 else R.choice(D)
    else:
        n = digits(9)
        n += ISBN._calc_isbn10_check_digit(n) if i % 4 != 2 else R.choice(D + 'X')
    v = ok(ISBN, n)
    e = {'valid': v}
    if v:
        e['isbn13'] = ISBN.format(n, convert=True)
        e['isbn10'] = ISBN.format(ISBN.to_isbn10(n)) if ISBN.compact(ISBN.to_isbn13(n)).startswith('978') else None
        e['agency'] = agency(ISBN.to_isbn13(n))
    add('isbn', 'ISBN ' + n, **e)
for i in range(250):
    n = digits(7)
    n += ISSN.calc_check_digit(n) if i % 2 else R.choice(D + 'X')
    add('issn', f'{n[:4]}-{n[4:]}', valid=ok(ISSN, n))
for i in range(500):
    l = R.choice([8, 12, 13, 14])
    n = digits(l - 1, '123456789' if l == 13 else D)
    if l == 13 and n.startswith(('978', '979')): n = '890' + n[3:]
    n += EAN.calc_check_digit(n) if i % 2 else R.choice(D)
    add('ean', 'EAN ' + n, valid=ok(EAN, n))

# ---- IMEI, cards, ICCID (Luhn)
for i in range(400):
    l = R.choice([14, 15, 15, 15, 16])
    n = R.choice(['35', '86', '01', '91', '99', '35', '35']) + digits(l - 2 if l != 15 else 12)
    if l == 15: n += luhn.calc_check_digit(n) if i % 2 else R.choice(D)
    add('imei', 'IMEI ' + n, valid=ok(IMEI, n), length=len(n))
for i in range(500):
    pre = R.choice(['4', '51', '55', '2221', '2720', '34', '37', '36', '6011', '65', '35', '62', '508500', '607000', '652200', '81', '82', '6', '50'])
    l = R.choice([16, 16, 16, 15, 19, 14])
    n = pre + digits(l - len(pre) - 1)
    n += luhn.calc_check_digit(n) if i % 2 else R.choice(D)
    add('card', 'card ' + n, valid=luhn.is_valid(n))
for i in range(200):
    n = '89' + R.choice(['91', '1', '44', '49', '86', '971']) + digits(R.choice([15, 16, 17]) - 1)
    n = n[:19]
    n += luhn.calc_check_digit(n) if i % 2 else R.choice(D)
    add('iccid', 'ICCID ' + n, valid=luhn.is_valid(n))

# ---- IBAN, BIC, ISIN
import re
rows = [m.groups() for m in (re.match(r'([A-Z]{2}) country="[^"]+" bban="([^"]+)"', l) for l in (Path(IBAN.__file__).parent / 'iban.dat').read_text().splitlines()) if m]
def bban_of(struct):
    out = ''
    for n, k in re.findall(r'(\d+)!?([nac])', struct):
        pool = D if k == 'n' else U if k == 'a' else D + U
        out += ''.join(R.choice(pool) for _ in range(int(n)))
    return out
from stdnum.iso7064 import mod_97_10
for i in range(500):
    cc, struct = R.choice(rows)
    bban = bban_of(struct)
    check = mod_97_10.calc_check_digits(bban + cc)
    n = cc + check + bban
    if i % 3 == 0: k = R.randrange(4, len(n)); n = n[:k] + R.choice(D if n[k].isdigit() else U) + n[k + 1:]
    if i % 17 == 0: n = n[:-1]
    add('iban', 'IBAN ' + n, valid=IBAN.is_valid(n, check_country=False))
for i in range(250):
    cc = R.choice(['IN', 'DE', 'US', 'GB', 'FR', 'SG', 'AE', 'QQ', 'ZZ'])
    n = ''.join(R.choice(U) for _ in range(4)) + cc + ''.join(R.choice(D + U) for _ in range(2)) + (''.join(R.choice(D + U) for _ in range(3)) if i % 2 else '')
    add('bic', 'BIC ' + n, valid=ok(BIC, n))
for i in range(300):
    cc = R.choice(['IN', 'US', 'GB', 'DE', 'XS', 'EU', 'JP', 'QQ'])
    body = cc + ''.join(R.choice(D + U) for _ in range(9))
    n = body + (ISIN.calc_check_digit(body) if i % 2 else R.choice(D))
    add('isin', 'ISIN ' + n, valid=ok(ISIN, n))

# ---- Indian phone numbers (libphonenumber), written three ways
TYPES = {0: 'fixed_line', 1: 'mobile', 2: 'fixed_line_or_mobile', 3: 'toll_free', 4: 'premium_rate', 5: 'shared_cost', 6: 'voip', 7: 'personal_number', 8: 'pager', 9: 'uan', 10: 'voicemail', 99: 'unknown'}
seen = set()
while len(seen) < 3000:
    first = R.choice('1234567899998876')
    l = 10 if first != '1' else R.choice([8, 9, 10, 11, 12, 13])
    nn = first + digits(l - 1)
    if first == '1' and R.random() < 0.6: nn = R.choice(['1800', '1860', '1861', '140']) + digits(l - (4 if not nn.startswith('140') else 3))[:l - 4]
    if nn in seen: continue
    seen.add(nn)
    x = P.parse('+91' + nn)
    valid = P.is_valid_number(x)
    e = {'valid': valid, 'type': TYPES[P.number_type(x)], 'nn': nn}
    if valid:
        e['national'] = P.format_number(x, P.PhoneNumberFormat.NATIONAL)
        e['international'] = P.format_number(x, P.PhoneNumberFormat.INTERNATIONAL)
        e['place'] = geocoder.description_for_number(x, 'en')
    form = R.choice(['+91 ', '0', ''] if len(nn) == 10 and first != '1' else ['+91 ', ''])
    add('phone', 'Tel ' + form + nn, **e)

# ---- VIN (vininfo)
from vininfo.dicts.wmi import WMI
wmis = sorted(k for k in WMI if len(k) == 3)
VCH = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ'
for i in range(400):
    w = R.choice(wmis)
    rest = ''.join(R.choice(VCH) for _ in range(14))
    v = w + rest
    vin = Vin(v)
    uses = getattr(vin.assembler, 'uses_sae_checkdigit', True)
    # put the right check digit in about half of them
    if i % 2:
        for c in '0123456789X':
            t = v[:8] + c + v[9:]
            if Vin(t).verify_checksum(check_year=False): v = t; break
    vin = Vin(v)
    add('vin', 'VIN ' + v, country=vin.country, maker=vin.manufacturer if vin.manufacturer and vin.manufacturer != 'Unsupported' else None,
        check=(vin.verify_checksum(check_year=False) if uses else None))

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({'made_by': 'scripts/make-numcheck-reference.py', 'stdnum': __import__('stdnum').__version__, 'phonenumbers': P.__version__, 'cases': cases}, ensure_ascii=False, indent=0) + '\n')
print(len(cases), 'cases →', OUT)
