#!/usr/bin/env python3
"""Reference for the symbols of the Emoji & Symbols tab → tests/fixtures/emoji/reference.json.

The names in src/lib/emoji-data.json come from Python's unicodedata; here every symbol is named a second time by
another program with its own copy of the Unicode Character Database: Perl's charnames module.

    python3 scripts/make-emoji-reference.py        (needs perl)
"""
import json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(open(os.path.join(ROOT, 'src', 'lib', 'emoji-data.json'), encoding='utf8'))
chars = [row[0] for _, rows in data['symbols'] for row in rows]
script = 'use charnames (); require Unicode::UCD; print Unicode::UCD::UnicodeVersion(), "\\n"; print charnames::viacode(hex($_)), "\\n" for @ARGV;'
out = subprocess.run(['perl', '-e', script] + ['%X' % ord(c) for c in chars], capture_output=True, text=True, check=True).stdout.split('\n')
version, names = out[0], out[1:1 + len(chars)]
assert len(names) == len(chars) and all(names), 'perl could not name every symbol'
perl = subprocess.run(['perl', '-e', 'print $^V'], capture_output=True, text=True, check=True).stdout
ref = {'_source': f'Perl {perl} charnames, Unicode {version}', 'names': dict(zip(chars, names))}
path = os.path.join(ROOT, 'tests', 'fixtures', 'emoji', 'reference.json')
with open(path, 'w', encoding='utf8') as f: json.dump(ref, f, ensure_ascii=False, indent=0); f.write('\n')
print(f"{len(names)} symbols named by {ref['_source']}")
