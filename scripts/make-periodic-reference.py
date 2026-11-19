#!/usr/bin/env python3
"""Reference for the Periodic Table → tests/fixtures/periodic/reference.json

The 118 elements from the `mendeleev` package (its data: IUPAC names and standard atomic weights, NIST electron
configurations): symbol, name, atomic weight, whether the element has no stable isotope, group (null in the f-block
as mendeleev numbers it), period, block and the ground-state electron configuration as {orbital: electrons}.

    pip install mendeleev
    python3 scripts/make-periodic-reference.py
"""
import json, os
from mendeleev import element

OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'periodic', 'reference.json')
rows = []
for z in range(1, 119):
    e = element(z)
    conf = {f'{n}{l}': c for (n, l), c in e.ec.conf.items() if c}
    rows.append({'z': z, 'symbol': e.symbol, 'name': e.name, 'weight': float(e.atomic_weight), 'radioactive': bool(e.is_radioactive), 'group': e.group_id, 'period': e.period, 'block': e.block, 'series': e.series, 'config': conf})
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f: json.dump(rows, f, separators=(',', ':'))
print(len(rows), 'elements;', os.path.getsize(OUT), 'bytes')
