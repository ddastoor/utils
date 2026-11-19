#!/usr/bin/env python3
"""Reference conversions for the Unit Converter (src/lib/units.ts), by GNU Units (apt-get install units) — a program
with its own table of definitions. For every category: every ordered pair of units for a few values.

    python3 scripts/make-units-reference.py        → tests/fixtures/units/reference.json
Each case: [category, from, to, value, what GNU Units answers (17 digits)].
"""
import json, subprocess, itertools
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / 'tests/fixtures/units/reference.json'

# our unit names → GNU Units expressions
G = {
 'length': {'mm': 'mm', 'cm': 'cm', 'm': 'm', 'km': 'km', 'inch': 'inch', 'foot': 'ft', 'yard': 'yard', 'mile': 'mile', 'nautical mile': 'nauticalmile'},
 'mass': {'mg': 'mg', 'g': 'g', 'kg': 'kg', 'quintal (100 kg)': 'quintal', 'tonne': 'tonne', 'ounce': 'ounce', 'pound': 'pound', 'stone': 'stone', 'carat': 'carat', 'tola': 'tola'},
 'area': {'m²': 'm^2', 'cm²': 'cm^2', 'km²': 'km^2', 'ft²': 'ft^2', 'in²': 'inch^2', 'yd²': 'yard^2', 'acre': 'acre', 'hectare': 'hectare', 'mile²': 'mile^2', 'gaj (sq yd)': 'yard^2',
          'cent (435.6 ft²)': '(435.6 ft^2)', 'guntha (1,089 ft²)': '(1089 ft^2)', 'ground (2,400 ft²)': '(2400 ft^2)', 'bigha (UP, 27,000 ft²)': '(27000 ft^2)'},
 'volume': {'ml': 'ml', 'litre': 'liter', 'm³': 'm^3', 'tsp (5 ml)': '(5 ml)', 'tbsp (15 ml)': '(15 ml)', 'cup (250 ml)': '(250 ml)', 'tsp (US)': 'teaspoon', 'tbsp (US)': 'tablespoon', 'fl oz (US)': 'usfloz', 'cup (US)': 'uscup',
            'pint (US)': 'uspint', 'gallon (US)': 'usgallon', 'fl oz (UK)': 'brfloz', 'pint (UK)': 'brpint', 'gallon (UK)': 'brgallon', 'in³': 'inch^3', 'ft³': 'ft^3'},
 'speed': {'m/s': 'm/s', 'km/h': 'km/hour', 'mph': 'mph', 'knot': 'knot', 'ft/s': 'ft/s'},
 'data': {'bit': 'bit', 'byte': 'byte', 'KB (1000)': 'kB', 'MB (1000²)': 'MB', 'GB (1000³)': 'GB', 'TB (1000⁴)': 'TB', 'KiB (1024)': 'KiB', 'MiB (1024²)': 'MiB', 'GiB (1024³)': 'GiB', 'TiB (1024⁴)': 'TiB'},
 'time': {'ms': 'ms', 'second': 's', 'minute': 'min', 'hour': 'hour', 'day': 'day', 'week': 'week', 'month (avg)': '(30.436875 day)', 'year (365.2425 d)': '(365.2425 day)'},
 'pressure': {'Pa': 'Pa', 'kPa': 'kPa', 'bar': 'bar', 'atm': 'atm', 'psi': 'psi', 'kgf/cm²': '(kgf/cm^2)', 'mmHg': 'mmHg', 'torr': 'torr'},
 'energy': {'J': 'J', 'kJ': 'kJ', 'cal': 'cal', 'kcal': 'kcal', 'Wh': '(W hour)', 'kWh (unit)': '(kW hour)', 'BTU': 'btu', 'eV': 'eV'},
 'power': {'W': 'W', 'kW': 'kW', 'hp (metric)': 'metrichorsepower', 'hp (mech)': 'hp'},
 'angle': {'degree': 'degree', 'radian': 'radian', 'gradian': 'gon', 'turn': 'turn', 'arcminute': 'arcmin', 'arcsecond': 'arcsec'},
}
TEMP = {'°C': 'tempC', '°F': 'tempF', 'K': 'tempK'}
FUEL = {'km/l': 'km/liter', 'mpg (US)': 'mile/usgallon', 'mpg (UK)': 'mile/brgallon'}

def gnu(have, want):
    r = subprocess.run(['units', '-t', '-o', '%.17g', have, want], capture_output=True, text=True)
    out = r.stdout.strip().splitlines()
    if r.returncode or not out or not out[0].replace('.', '').replace('-', '').replace('e', '').replace('+', '').isdigit():
        raise SystemExit(f'units "{have}" "{want}": {r.stdout} {r.stderr}')
    return out[0]

cases = []
for cat, names in G.items():
    for a, b in itertools.product(names, repeat=2):
        for x in (1, 123.456, 0.00789):
            cases.append([cat, a, b, x, gnu(f'{x!r} {names[a]}', names[b])])
for a, b in itertools.product(TEMP, repeat=2):
    for x in (-40, 0, 25, 36.6, 98.6, 100, 300, 5778):
        if (a == 'K' and x < 0) or (a == '°F' and x < -459.67) or (a == '°C' and x < -273.15): continue      # below absolute zero: GNU Units refuses, the tab warns
        cases.append(['temperature', a, b, x, gnu(f'{TEMP[a]}({x!r})', TEMP[b])])
names = list(FUEL) + ['l/100km']
for a, b in itertools.product(names, repeat=2):
    for x in (4.5, 15, 62.3):
        have = f'100 km / ({x!r} liter)' if a == 'l/100km' else f'{x!r} {FUEL[a]}'
        if b == 'l/100km':
            kml = float(gnu(have, 'km/liter')); val = repr(100 / kml)       # litres per 100 km = 100 ÷ (km per litre)
        else:
            val = gnu(have, FUEL[b])
        cases.append(['fuel', a, b, x, val])
version = subprocess.run(['units', '--version'], capture_output=True, text=True).stdout.split()[3]
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text('{\n "gnu_units": ' + json.dumps(version) + ',\n "cases": [\n' + ',\n'.join('  ' + json.dumps(c, ensure_ascii=False) for c in cases) + '\n ]\n}\n', encoding='utf-8')
print(len(cases), 'conversions by GNU Units', version, '→', OUT.name)
