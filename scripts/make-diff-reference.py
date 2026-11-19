#!/usr/bin/env python3
"""Reference for Text Diff (tests/unit/textdiff.test.mjs): GNU diff on the same pairs of texts.

Seeded pairs (a text and an edited copy of it: lines changed, removed, added, moved; some pairs unrelated, some equal),
each with what `diff -d` (the minimal diff) counts as removed and added lines. The unit suite demands the same counts
from the engine and applies the engine's unified diff with GNU patch.

  python3 scripts/make-diff-reference.py        (GNU diffutils)
"""
import json, os, random, subprocess, tempfile

rnd = random.Random(20261119)
WORDS = 'the quick brown fox jumps over lazy dog and runs far away from here to there with some other words'.split()
def line(): return ' '.join(rnd.choice(WORDS) for _ in range(rnd.randint(1, 9)))

def edited(ls):
    out = list(ls)
    for _ in range(rnd.randint(0, max(1, len(ls) // 4))):
        op = rnd.choice(['change', 'remove', 'add', 'move', 'dup', 'word'])
        if not out and op != 'add': continue
        i = rnd.randrange(len(out)) if out else 0
        if op == 'change': out[i] = line()
        elif op == 'remove': del out[i]
        elif op == 'add': out.insert(rnd.randint(0, len(out)), line())
        elif op == 'move': out.insert(rnd.randint(0, len(out) - 1) if len(out) > 1 else 0, out.pop(i))
        elif op == 'dup': out.insert(i, out[i])
        elif op == 'word':
            w = out[i].split(' '); w[rnd.randrange(len(w))] = rnd.choice(WORDS); out[i] = ' '.join(w)
    return out

def gnu(a, b):
    with tempfile.TemporaryDirectory() as d:
        pa, pb = os.path.join(d, 'a'), os.path.join(d, 'b')
        open(pa, 'w').write(a); open(pb, 'w').write(b)
        out = subprocess.run(['diff', '-d', '-U0', pa, pb], capture_output=True, text=True).stdout
    body = [l for l in out.split('\n')[2:] if l]
    return sum(1 for l in body if l[0] == '-'), sum(1 for l in body if l[0] == '+')

cases = []
for i in range(160):
    n = rnd.choice([0, 1, 2, 3, 5, 8, 13, 30, 60, 120])
    a = [line() for _ in range(n)]
    kind = rnd.random()
    b = list(a) if kind < 0.08 else [line() for _ in range(rnd.randint(0, n + 3))] if kind < 0.18 else edited(a)
    ta, tb = ''.join(l + '\n' for l in a), ''.join(l + '\n' for l in b)
    removed, added = gnu(ta, tb)
    cases.append({'a': ta, 'b': tb, 'removed': removed, 'added': added})
here = os.path.dirname(os.path.abspath(__file__))
json.dump(cases, open(os.path.join(here, '..', 'tests', 'fixtures', 'diff', 'reference.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(len(cases), 'pairs;', sum(1 for c in cases if c['added'] or c['removed']), 'that differ')
