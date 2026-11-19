#!/usr/bin/env python3
"""Reference for Line Tools (tests/unit/linetools.test.mjs): what the GNU tools make of the same lines.

Seeded lists of lines, each with the answer of a program that is not ours:
  trim            sed 's/^[ \\t]*//; s/[ \\t]*$//'
  empty           grep -v '^[[:space:]]*$'
  dedupe          awk '!seen[$0]++'            (the first of each kept)
  dedupe-ci       awk '!seen[tolower($0)]++'
  az              LC_ALL=C sort                (words of small ASCII letters: every collation agrees with byte order)
  natural         sort -V                      (a word and a number: "item 2" before "item 10")
  num             sort -g -s                   (by the number a line begins with; equal numbers keep their order)
  reverse         tac
  number          awk '{ print NR ". " $0 }'
  count           wc -l                        (texts that end with a line break)
Writes tests/fixtures/lines/reference.json: [{ what, text, lines }].

  python3 scripts/make-lines-reference.py        (GNU coreutils, sed, grep, awk)
"""
import json, os, random, subprocess

rnd = random.Random(20261119)
WORDS = 'apple banana cherry mango guava papaya orange lemon grape melon kiwi plum pear fig date lime peach berry olive'.split()

def run(cmd, text, env=None):
    e = dict(os.environ, LC_ALL='C'); e.update(env or {})
    return subprocess.run(cmd, input=text.encode(), stdout=subprocess.PIPE, check=False, shell=isinstance(cmd, str), env=e).stdout.decode()
def lines_of(out):
    ls = out.split('\n')
    if ls and ls[-1] == '': ls.pop()
    return ls
def text_of(ls): return ''.join(l + '\n' for l in ls)

cases = []
def add(what, ls, cmd, env=None):
    text = text_of(ls)
    cases.append({'what': what, 'text': text, 'lines': lines_of(run(cmd, text, env))})

for i in range(40):
    n = rnd.randint(1, 40)
    padded = [rnd.choice(['', ' ', '  ', '\t', ' \t ']) + rnd.choice(WORDS + ['two words', 'a  b', '']) + rnd.choice(['', ' ', '   ', '\t']) for _ in range(n)]
    add('trim', padded, ['sed', 's/^[ \\t]*//; s/[ \\t]*$//'])
    add('empty', padded, "grep -v '^[[:space:]]*$'")
    pool = rnd.sample(WORDS, rnd.randint(2, 8))
    mixed = [rnd.choice([w, w, w.upper(), w.capitalize()]) for w in (rnd.choice(pool) for _ in range(n))]
    add('dedupe', mixed, ['awk', '!seen[$0]++'])
    add('dedupe-ci', mixed, ['awk', '!seen[tolower($0)]++'])
    words = [''.join(rnd.choice('abcdefghijklmnopqrstuvwxyz') for _ in range(rnd.randint(1, 7))) for _ in range(n)]
    add('az', words, ['sort'])
    stem = rnd.choice(['item', 'file', 'page', 'chapter'])
    numbered = [f"{stem}{rnd.choice(['', ' '])}{rnd.randint(0, 2500)}" for _ in range(n)]
    sep = ' ' if rnd.random() < 0.5 else ''
    numbered = list(dict.fromkeys(f"{stem}{sep}{rnd.randint(0, 2500)}" for _ in range(n)))
    add('natural', numbered, ['sort', '-V'])
    nums = [rnd.choice([str(rnd.randint(-500, 500)), f"{rnd.uniform(-100, 100):.{rnd.randint(1, 4)}f}", f"{rnd.randint(1, 9)}e{rnd.randint(-3, 6)}", f".{rnd.randint(1, 99)}", f"+{rnd.randint(0, 50)}", f"{rnd.randint(0, 9999)} {rnd.choice(WORDS)}", f"-{rnd.randint(0, 99)}.{rnd.randint(0, 99)}kg", '0', '-0', '0.0']) for _ in range(n)]
    add('num', nums, ['sort', '-g', '-s'])
    add('reverse', mixed, ['tac'])
    add('number', mixed, ['awk', '{ print NR ". " $0 }'])
    cases.append({'what': 'count', 'text': text_of(mixed), 'lines': [run(['wc', '-l'], text_of(mixed)).strip()]})

here = os.path.dirname(os.path.abspath(__file__))
json.dump(cases, open(os.path.join(here, '..', 'tests', 'fixtures', 'lines', 'reference.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(len(cases), 'cases')
