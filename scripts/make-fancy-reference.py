#!/usr/bin/env python3
"""Reference for Fancy Text (tests/unit/fancy.test.mjs): the styled alphabets as the Unicode Character Database
names them. For each style the characters are looked up BY NAME ("MATHEMATICAL BOLD CAPITAL A", "DOUBLE-STRUCK
CAPITAL C", "CIRCLED DIGIT ONE" …) — the holes of the Mathematical Alphanumeric Symbols block are found the same way
under their older names in the Letterlike Symbols block. Writes tests/fixtures/fancy/reference.json:
{ style: [capitals, small letters, digits or null] }.

  python3 scripts/make-fancy-reference.py
"""
import json, os, string, unicodedata as U

UP, LOW, DIG = string.ascii_uppercase, string.ascii_lowercase, 'ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE'.split()
def find(*names):
    for n in names:
        try: return U.lookup(n)
        except KeyError: pass
    raise KeyError(names)
# the Letterlike Symbols that fill the holes
OLD = {'SCRIPT': 'SCRIPT', 'FRAKTUR': 'BLACK-LETTER', 'DOUBLE-STRUCK': 'DOUBLE-STRUCK'}
def math(style, digits=None):
    def letter(case, l):
        names = [f'MATHEMATICAL {style} {case} {l}']
        if style in OLD: names.append(f'{OLD[style]} {case} {l}')
        if style == 'ITALIC' and case == 'SMALL' and l == 'H': names.append('PLANCK CONSTANT')
        return find(*names)
    return [''.join(letter('CAPITAL', l) for l in UP), ''.join(letter('SMALL', l) for l in UP), ''.join(find(f'MATHEMATICAL {digits} DIGIT {d}') for d in DIG) if digits else None]
ref = {
    'Bold': math('BOLD', 'BOLD'), 'Italic': math('ITALIC'), 'Bold italic': math('BOLD ITALIC'), 'Script': math('SCRIPT'), 'Bold script': math('BOLD SCRIPT'),
    'Fraktur': math('FRAKTUR'), 'Double-struck': math('DOUBLE-STRUCK', 'DOUBLE-STRUCK'), 'Sans-serif': math('SANS-SERIF', 'SANS-SERIF'), 'Sans bold': math('SANS-SERIF BOLD', 'SANS-SERIF BOLD'),
    'Sans italic': math('SANS-SERIF ITALIC'), 'Monospace': math('MONOSPACE', 'MONOSPACE'),
    'Circled': [''.join(find(f'CIRCLED LATIN CAPITAL LETTER {l}') for l in UP), ''.join(find(f'CIRCLED LATIN SMALL LETTER {l}') for l in UP), ''.join(find(f'CIRCLED DIGIT {d}') for d in DIG)],
    'Fullwidth': [''.join(find(f'FULLWIDTH LATIN CAPITAL LETTER {l}') for l in UP), ''.join(find(f'FULLWIDTH LATIN SMALL LETTER {l}') for l in UP), ''.join(find(f'FULLWIDTH DIGIT {d}') for d in DIG)],
    'Squared': [''.join(find(f'SQUARED LATIN CAPITAL LETTER {l}') for l in UP)] * 2 + [None],
}
# small capitals: the letters Unicode has as "LATIN LETTER SMALL CAPITAL x" (not all 26 exist)
ref['_smallcaps'] = {}
for l in UP:
    try: ref['_smallcaps'][l.lower()] = U.lookup(f'LATIN LETTER SMALL CAPITAL {l}')
    except KeyError: pass
ref['_unicode'] = U.unidata_version
here = os.path.dirname(os.path.abspath(__file__))
json.dump(ref, open(os.path.join(here, '..', 'tests', 'fixtures', 'fancy', 'reference.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(len(ref) - 2, 'styles; small capitals in Unicode', U.unidata_version + ':', ''.join(sorted(ref['_smallcaps'])))
