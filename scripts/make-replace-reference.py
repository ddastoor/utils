#!/usr/bin/env python3
"""Reference for Find & Replace (tests/unit/findreplace.test.mjs): Python's `re` module on the same searches.

Each case: a text, what to find, what to put in its place, the three switches of the tab — and the result and the
number of replacements Python's re.subn gives. Only constructs that mean the same in Python and in JavaScript are
used (classes, repeats, groups, alternation, look-around, anchors per line). The replacement is written as the tab
takes it ($1, $<name>, $&, $0, $$, \\n, \\t) and carried out here by a function of this script, not by Python's own
template syntax.

  python3 scripts/make-replace-reference.py
"""
import json, os, random, re

rnd = random.Random(20261119)

def expand(rep, regex):
    """What the tab's replacement text means, as a function of the match."""
    if not regex: return lambda m: rep
    def f(m):
        out, i = '', 0
        while i < len(rep):
            c, n = rep[i], rep[i + 1] if i + 1 < len(rep) else ''
            if c == '\\' and n in 'ntr\\': out += {'n': '\n', 't': '\t', 'r': '\r', '\\': '\\'}[n]; i += 2
            elif c == '$' and n == '$': out += '$'; i += 2
            elif c == '$' and n == '&': out += m.group(0); i += 2
            elif c == '$' and n == '0' and not rep[i + 2:i + 3].isdigit(): out += m.group(0); i += 2
            elif c == '$' and n.isdigit() and n != '0' and int(n) <= m.re.groups: out += m.group(int(n)) or ''; i += 2
            elif c == '$' and n == '<' and '>' in rep[i:]:
                j = rep.index('>', i); name = rep[i + 2:j]
                if name in m.re.groupindex: out += m.group(name) or ''; i = j + 1
                else: out += c; i += 1
            else: out += c; i += 1
        return out
    return f

def case(text, find, rep, regex=False, cs=False, word=False):
    src = find if regex else re.escape(find)
    if word: src = r'(?<!\w)(?:' + src + r')(?!\w)'
    flags = re.MULTILINE | (0 if cs else re.IGNORECASE)
    result, n = re.subn(src, expand(rep, regex), text, flags=flags)
    # (a named group is (?P<name>…) in Python and (?<name>…) in JavaScript: the case is stored as JavaScript writes it)
    return {'text': text, 'find': find.replace('(?P<', '(?<'), 'rep': rep, 'regex': regex, 'cs': cs, 'word': word, 'result': result, 'count': n}

cases = []
WORDS = ['cat', 'Cat', 'CAT', 'category', 'concat', 'dog', 'the', 'The', 'colour', 'Colour', 'flavour', 'café', 'Café', 'cafés', 'élan', 'мир', 'Мир', 'мирный', 'λόγος', 'Λόγος', 'a.b', 'a+b', '$5.00', '(x)', '[y]', 'c++', 'x*y', '50%', 'tab\there']
SEPS = [' ', ' ', ', ', '. ', '\n', '; ', ' - ', '! ', '? ', '(', ') ']
for _ in range(140):
    text = ''.join(rnd.choice(WORDS) + rnd.choice(SEPS) for _ in range(rnd.randint(3, 25)))
    find = rnd.choice(WORDS + ['a', 'at', 'o', '.', '+', '$', ' ', 'é'])
    rep = rnd.choice(['X', '', 'dog', '$1', '$&', '<$0>', 'a$$b', '\\n', 'ü', '[' + find + ']'])
    cases.append(case(text, find, rep, False, rnd.random() < 0.4, rnd.random() < 0.4))
REGEX = [
    ('2026-11-16 and 1999-01-31', r'(\d{4})-(\d{2})-(\d{2})', '$3/$2/$1'), ('a  b   c', r'\s+', ' '), ('line1\nline2\nline3', '^', '> '), ('line1\nline2\nline3', '$', ';'),
    ('one, two, three', ', ', r'\n'), ('a\tb', r'\t', r'\\t'), ('John Smith\nJane Doe', r'^(\w+) (\w+)$', '$2, $1'), ('price 100 and 2500', r'\d+', '<$&>'),
    ('price 100 and 2500', r'\d+', '[$0]'), ('aaa bbb', 'a*', '-'), ('abxd', 'x*', '-'), ('foo.bar.baz', r'\.', '/'), ('a1b22c333', r'[a-z](\d+)', '$1'),
    ('2026-11-16', r'(?P<y>\d{4})-(?P<m>\d{2})', '$<m>/$<y>'), ('snake_case_name', r'_([a-z])', '-$1'), ('<b>bold</b> and <i>it</i>', r'<(\w+)>(.*?)</\1>', '$2'),
    ('one two  three', r'(?<=\w) (?=\w)', '_'), ('100USD 200EUR', r'(\d+)(?=USD)', '$$$1'), ('Mr Rao; Mrs Iyer', r'Mrs?(?!\.)', '$&.'),
    ('  indented\n\ttabbed\nplain  ', r'^[ \t]+|[ \t]+$', ''), ('a,b;c|d', r'[,;|]', ' '), ('Hello World', r'[aeiou]', ''),
    ('x=1, y=22', r'(\w)=(\d+)', '$2=$1'), ('2+2=4', r'\+', ' plus '), ('tel: 98765 43210', r'\D', ''), ('ab ab ab', r'\bab\b', 'X'), ('line\n\n\nline', r'\n{2,}', r'\n'),
    ('CamelCaseWord', r'(?<=[a-z])(?=[A-Z])', ' '), ('a.b.c', '.', '-'), ('keep $ sign', r'\$', '$$$$'), ('tab', '(t)(a)(b)', '$3$2$1$9'),
]
for text, find, rep in REGEX:
    for cs in (False, True):
        cases.append(case(text, find, rep, True, cs, False))
for text, find, rep in [('cat category concat cat.', 'cat', 'dog'), ('Мир и мирный мир', 'мир', 'X'), ('café cafés Café', 'café', 'tea'), ('a.b a.bc xa.b', 'a.b', 'Q'), ('the then other the', 'the', '_'), ('x1 x x_ x-1', 'x', 'y')]:
    for cs in (False, True):
        cases.append(case(text, find, rep, False, cs, True))
        cases.append(case(text, re.escape(find) + '|zzz', rep, True, cs, True))

here = os.path.dirname(os.path.abspath(__file__))
json.dump(cases, open(os.path.join(here, '..', 'tests', 'fixtures', 'replace', 'reference.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(len(cases), 'cases;', sum(1 for c in cases if c['count']), 'with a match')
