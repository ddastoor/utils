#!/usr/bin/env python3
"""GS1 check digits for the Barcode Generator's unit suite (tests/unit/barcodes.test.mjs), from python-stdnum's ean
module — an implementation independent of ours.  pip install python-stdnum; python3 scripts/make-barcode-reference.py"""
import json, os, random
from stdnum import ean
rnd = random.Random(20261120)
cases = []
for n in (7, 11, 12, 13):  # EAN-8, UPC-A, EAN-13, ITF-14 / GTIN-14
    for _ in range(250):
        d = ''.join(rnd.choice('0123456789') for _ in range(n))
        cases.append([d, ean.calc_check_digit(d)])
for d in ('400638133393', '978030640615', '03600029145', '9638507', '890123456789'):
    cases.append([d, ean.calc_check_digit(d)])
out = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'barcode', 'reference.json')
with open(out, 'w') as f: json.dump({'made_by': 'scripts/make-barcode-reference.py (python-stdnum ean.calc_check_digit)', 'cases': cases}, f)
print(len(cases), 'cases →', out)
