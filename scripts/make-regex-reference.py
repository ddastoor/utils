#!/usr/bin/env python3
# make-regex-reference.py — tests/fixtures/regex/reference.json: what the native engines answer for the Regex Tester's
# cases (to-do #8; tests/unit/regex-flavours.test.mjs holds each flavour of the tab to it):
#   python — CPython 3.14 (`uv python install 3.14`), running the very script the tab runs (src/lib/regex/python.ts);
#   pyregex — the same script with the regex module (mrab-regex) at the version wasm/python/build.sh builds in, installed
#            from PyPI into a fresh venv of that Python by uv (or $PYREGEX: a python that has it);
#   go     — wasm/regexgo built natively with the Go toolchain (the same program the tab runs as WebAssembly);
#   pcre2  — the system's libpcre2-8 through scripts/regex-ref/pcre2ref.c (cc … -lpcre2-8; apt install libpcre2-dev);
#   ruby   — Ruby (3.3 here: its Onigmo) — the tab runs Oniguruma, so this is where the two may part;
#   perl   — the system's perl (5.38 here) running the very script the tab runs (src/lib/regex/perl.ts) in Perl 5.42;
#   posix  — glibc's regcomp / regexec through ctypes (the same GNU code), the walk checked against GNU sed -z -E
#            marking every match, and GNU sed itself for every replacement.
# Every answer is written in one form: matches as [UTF-16 index, text, group 1, …] (null for a group that took no part),
# the group names, the count, the replacement (or why it failed) — or the compile error.
# Run: python3 scripts/make-regex-reference.py [path to python3.14]
import json, os, re as _re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests/fixtures/regex/reference.json')
SHOWN, COUNTED = 1000, 1_000_000


def C(pattern, flags='', text='', rep=None, all=True, note=''):
    return {'pattern': pattern, 'flags': flags, 'text': text, 'rep': rep, 'all': all, **({'note': note} if note else {})}


UNI = 'naïve café, Straße, ΣΊΣΥΦΟΣ, 東京 🎉 — é'
LINES = 'one two\nthree four\r\nfive\n'
CASES = {
    'python': [
        C(r'\d+', '', 'a1 b22 c333', r'<\g<0>>'),
        C(r'(\w+)@(\w+)\.com', '', 'mail ann@example.com or bob@test.com', r'\2 at \1'),
        C(r'(?P<y>\d{4})-(?P<m>\d\d)', '', 'on 2026-11 and 1999-01', r'\g<m>/\g<y>'),
        C(r'(?P<y>\d{4})', '', '2026', r'\g<nope>', note='unknown group in the replacement'),
        C(r'^\w+', 'm', LINES, '#'), C(r'^\w+$', 'm', LINES), C(r'\w+$', '', 'end\n'), C(r'.+', '', LINES),
        C(r'a.b', '', 'a\nb'), C(r'a.b', 's', 'a\nb'),
        C(r'straße', 'i', 'STRASSE strasse STRASSE Straße'),
        C(r'\w+', '', UNI), C(r'\w+', 'a', UNI), C(r'σίσυφος', 'i', UNI),
        C(r'x*', '', 'axbxx', '-'), C(r'a|', '', 'baab', '-'), C(r'\b', '', 'ab cd', '|'),
        C(r'a|ab', '', 'ab'), C(r'<.+?>', '', '<a><b>'), C(r'<.+>', '', '<a><b>'),
        C(r'(\w)\1', '', 'aabbcd eeff', r'[\1]'), C(r'(?<=\$)\d+', '', 'cost $40 or $5'),
        C(r'(?<!\$)\b\d+', '', 'cost $40 or 5'), C(r'a++b', '', 'aaab'), C(r'(?>a+)b', '', 'aaab'),
        C(r'(a)|b', '', 'ab', r'[\1]', note='a group that took no part'),
        C(r'(', '', 'x'), C(r'[a-', '', 'x'), C(r'a{2,1}', '', 'x'), C(r'*a', '', 'x'), C(r'(?<n>x)', '', 'x'),
        C(r'''(\d+)  # the number
              \s* (cm|mm)  # the unit''', 'x', '10 cm, 5mm'),
        C(r'\d', '', 'a1b2c3', '#', all=False),
        C(r'\D', '', '1🎉2é3', '_'),
        C(r'.', '', 'x' * 1500), C(r'\s', '', 'a\tb c d'),
        C(r'é', '', 'café café'), C(r'\N{EM DASH}', '', 'a — b'),
        C(r'\d', '', 'a1', r'\q', note='a bad escape in the replacement'),
    ],
    'pyregex': [
        C(r'\d+', '', 'a1 b22 c333', r'<\g<0>>'),
        C(r'(?P<y>\d{4})-(?P<m>\d\d)', '', 'on 2026-11 and 1999-01', r'\g<m>/\g<y>'),
        C(r'(?:colour){e<=1}', '', 'color colour colours kolor', r'[\g<0>]', note='fuzzy: at most one error'),
        C(r'(?:cat){s<=1}', '', 'cat bat cut cart ct', note='fuzzy: substitutions only'),
        C(r'(?:Saturday){i<=1,d<=1,s<=1,e<=2}', '', 'Satrday Saturdays Sunday Sarturday'),
        C(r'(?:hello){e<=2}', '', 'yellow hallo hello', note='without b: the first match that fits'),
        C(r'(?:hello){e<=2}', 'b', 'yellow hallo hello', note='b: the best match'),
        C(r'(?:hello){e<=2}', 'e', 'yellow hallo hello', note='e: each match improved'),
        C(r'[[a-z]--[aeiou]]+', 'V', 'hello world', '_', note='V1: set difference'),
        C(r'[\p{L}&&\p{Greek}]+', 'V', UNI, note='V1: set intersection'),
        C(r'[[a-z]--[aeiou]]+', '', 'hello world -]', note='V0: no nested sets'),
        C(r'strasse', 'if', 'STRASSE Straße straße', note='f: full case-folding'),
        C(r'strasse', 'i', 'STRASSE Straße straße', note='simple case-folding'),
        C(r'strasse', 'iV', 'STRASSE Straße', note='V1: full case-folding with i'),
        C(r'\w+', 'r', 'one two three', r'<\g<0>>', note='r: from the end'),
        C(r'\w+', 'r', 'one two three', r'<\g<0>>', all=False),
        C(r'a|ab', 'p', 'ab', note='p: leftmost longest'), C(r'(a|ab)(c|bcd)(d*)', 'p', 'abcd'),
        C(r'a|ab', '', 'ab'),
        C(r'\p{Greek}+', '', UNI), C(r'\p{Lu}', '', UNI), C(r'\p{Script=Han}+', '', UNI),
        C(r'(?>a+)b', '', 'aaab aaa'), C(r'a++b', '', 'aaab'),
        C(r'(?<=\b\w{2,4} )\w+', '', 'to be or not to be', note='look-behind of any length'),
        C(r'\G\d', '', '123a45'), C(r'\((?:[^()]++|(?R))*\)', '', 'f(a(b)c) g(d) h('),
        C(r'(?|(a)|(b))c', '', 'ac bc'), C(r"\b\w+\b", 'w', "can't stop", note="w: Unicode's word boundaries"),
        C(r'\b\w+\b', '', "can't stop"), C(r'\X', '', 'é 🎉👍🏽'),
        C(r'\mcat\M', '', 'cat concat cats cat.'), C(r'^.+$', 'mw', 'a\r\nb c'), C(r'^.+$', 'm', 'a\r\nb c'),
        C(r'x*', '', 'axbxx', '-'), C(r'a|', '', 'baab', '-'),
        C(r'^\w+', 'm', LINES, '#'), C(r'\w+', 'a', UNI), C(r'(x)(y)?', '', 'x xy', r'[\1|\2]'),
        C(r'(?i)σίσυφος', '', UNI), C(r'\N{EM DASH}', '', 'a — b'),
        C(r'.', '', 'x' * 1500), C(r'\d', '', 'a1b2c3', '#', all=False),
        C(r'(', '', 'x'), C(r'[a-', '', 'x'), C(r'a{2,1}', '', 'x'), C(r'(?P<1a>x)', '', 'x'), C(r'(?P=nope)', '', 'x'),
        C(r'(a)', '', 'a', r'\2', note='a group the pattern does not have'),
        C(r'(a)', '', 'a', r'\g<x>', note='a name the pattern does not have'),
    ],
    'go': [
        C(r'\d+', '', 'a1 b22 c333', '<$0>'),
        C(r'(\w+)@(\w+)\.com', '', 'mail ann@example.com or bob@test.com', '$2 at $1'),
        C(r'(?P<y>\d{4})-(?P<m>\d\d)', '', 'on 2026-11 and 1999-01', '${m}/${y}'),
        C(r'(?<y>\d{4})-(?<m>\d\d)', '', 'on 2026-11', '$m/$y'),
        C(r'(\d)', '', 'a1', '$1x|${1}x', note='$1x is the group named "1x"'),
        C(r'^\w+', 'm', LINES, '#'), C(r'^\w+$', 'm', LINES), C(r'\w+$', '', 'end\n'), C(r'.+', '', LINES),
        C(r'a.b', '', 'a\nb'), C(r'a.b', 's', 'a\nb'),
        C(r'straße', 'i', 'STRASSE strasse Straße STRAßE'),
        C(r'\w+', '', UNI), C(r'[\p{L}]+', '', UNI), C(r'σίσυφος', 'i', UNI), C(r'\p{Greek}+', '', UNI),
        C(r'x*', '', 'axbxx', '-'), C(r'a|', '', 'baab', '-'), C(r'\b', '', 'ab cd', '|'),
        C(r'a|ab', '', 'ab'), C(r'<.+?>', '', '<a><b>'), C(r'<.+?>', 'U', '<a><b>'),
        C(r'(\w)\1', '', 'aabb'), C(r'(?<=\$)\d+', '', '$40'), C(r'a++b', '', 'aaab'),
        C(r'(a)|b', '', 'ab', '[$1]'), C(r'(', '', 'x'), C(r'[a-', '', 'x'), C(r'a{2,1}', '', 'x'),
        C(r'\Q.*\E+', '', 'a.*.*b'), C(r'[[:alpha:]]+', '', 'ab12cd'),
        C(r'\d', '', 'a1b2c3', '#', all=False), C(r'.', '', 'x' * 1500), C(r'\D', '', '1🎉2é3', '_'),
        C(r'$$', '', 'ab', '[$$]'),
    ],
    'pcre2': [
        C(r'\d+', '', 'a1 b22 c333', '<$0>'),
        C(r'(\w+)@(\w+)\.com', '', 'mail ann@example.com or bob@test.com', '$2 at $1'),
        C(r'(?<y>\d{4})-(?<m>\d\d)', '', 'on 2026-11 and 1999-01', '${m}/${y}'),
        C(r"(?'y'\d{4})-(?P<m>\d\d)", '', 'on 2026-11', '$m/$y'),
        C(r'(\w+)', '', 'hello world', r'\U$1\E!'),
        C(r'^\w+', 'm', LINES, '#'), C(r'^\w+$', 'm', LINES), C(r'\w+$', '', 'end\n'), C(r'.+', '', LINES),
        C(r'a.b', '', 'a\nb'), C(r'a.b', 's', 'a\nb'),
        C(r'straße', 'i', 'STRASSE strasse Straße STRAßE'),
        C(r'\w+', '', UNI), C(r'\w+', 'u', UNI), C(r'σίσυφος', 'i', UNI), C(r'\p{Greek}+', '', UNI),
        C(r'x*', '', 'axbxx', '-'), C(r'a|', '', 'baab', '-'), C(r'\b', '', 'ab cd', '|'),
        C(r'a|ab', '', 'ab'), C(r'<.+?>', '', '<a><b>'), C(r'<.+?>', 'U', '<a><b>'),
        C(r'(\w)\1', '', 'aabbcd eeff', '[$1]'), C(r'(?<=\$)\d+', '', 'cost $40 or $5'), C(r'a++b', '', 'aaab'),
        C(r'(?>a+)b', '', 'aaab'), C(r'\((?:[^()]++|(?R))*\)', '', 'f(a(b)c) g((x)(y)) (z'),
        C(r'foo\Kbar', '', 'foobar foobaz', '#'), C(r'\d+(*SKIP)(*FAIL)|\w+', '', 'ab 12 cd3'),
        C(r'(a)|b', '', 'ab'), C(r'(', '', 'x'), C(r'[a-', '', 'x'), C(r'a{2,1}', '', 'x'), C(r'*a', '', 'x'),
        C(r'''(\d+)  # the number
              \s* (cm|mm)  # the unit''', 'x', '10 cm, 5mm'),
        C(r'(\d+)(?:x)?', 'n', '12x 34', note='n: plain groups do not capture'),
        C(r'\h+', '', 'a \t b'), C(r'\d', '', 'a1b2c3', '#', all=False), C(r'.', '', 'x' * 1500),
        C(r'\D', '', '1🎉2é3', '_'), C(r'\x{e9}', '', 'café'),
    ],
    'perl': [
        C(r'\d+', '', 'a1 b22 c333', '<$&>'),
        C(r'(\w+)@(\w+)\.com', '', 'mail ann@example.com or bob@test.com', '$2 at $1'),
        C(r'(?<y>\d{4})-(?<m>\d\d)', '', 'on 2026-11 and 1999-01', '$+{m}/$+{y}'),
        C(r"(?'y'\d{4})-(?P<m>\d\d)", '', 'on 2026-11', '$+{m}.$+{y}'),
        C(r'(\w+)', '', 'hello world', r'\U$1\E!'),
        C(r'(\d)', '', 'a1', '${1}x|$1x', note='$1x is the variable $1x (empty)'),
        C(r'^\w+', 'm', LINES, '#'), C(r'^\w+$', 'm', LINES), C(r'\w+$', '', 'end\n'), C(r'.+', '', LINES),
        C(r'a.b', '', 'a\nb'), C(r'a.b', 's', 'a\nb'),
        C(r'straße', 'i', 'STRASSE strasse Straße'),
        C(r'\w+', '', UNI), C(r'\w+', 'a', UNI), C(r'σίσυφος', 'i', UNI), C(r'\p{Greek}+', '', UNI),
        C(r'x*', '', 'axbxx', '-'), C(r'a|', '', 'baab', '-'), C(r'\b', '', 'ab cd', '|'),
        C(r'a|ab', '', 'ab'), C(r'<.+?>', '', '<a><b>'),
        C(r'(\w)\1', '', 'aabbcd eeff', '[$1]'), C(r'(?<=\$)\d+', '', 'cost $40 or $5'), C(r'a++b', '', 'aaab'),
        C(r'(?>a+)b', '', 'aaab'), C(r'\((?:[^()]++|(?R))*\)', '', 'f(a(b)c) g((x)(y)) (z'),
        C(r'foo\Kbar', '', 'foobar foobaz', '#'), C(r'\d+(*SKIP)(*FAIL)|\w+', '', 'ab 12 cd3'),
        C(r'(a)|b', '', 'ab', '[$1]'), C(r'(', '', 'x'), C(r'[a-', '', 'x'), C(r'a{2,1}', '', 'x'), C(r'*a', '', 'x'),
        C(r'''(\d+)  # the number
              \s* (cm|mm)  # the unit''', 'x', '10 cm, 5mm'),
        C(r'(\d+)(x)?', 'n', '12x 34', note='n: plain groups do not capture'),
        C(r'\h+', '', 'a \t b'), C(r'\d', '', 'a1b2c3', '#', all=False), C(r'.', '', 'x' * 1500),
        C(r'\D', '', '1🎉2é3', '_'), C(r'\x{e9}', '', 'café'), C(r'\d', '', 'a1', '@{[ 2 * 21 ]}', note='code inside the replacement, as Perl runs it'),
    ],
    'posix': [
        C(r'[0-9]+', '', 'a1 b22 c333', '<&>'),
        C(r'([a-z]+)@([a-z]+)\.com', '', 'mail ann@example.com or bob@test.com', r'\2 at \1'),
        C(r'^[a-z]+', 'm', LINES, '#'), C(r'^[a-z]+$', 'm', LINES), C(r'[a-z]+$', '', 'end\n'),
        C(r'a.b', '', 'a\nb'), C(r'a.b', 'm', 'a\nb'), C(r'[^a]', 'm', 'a\nb'), C(r'$', 'm', 'ab\ncd', '|'),
        C(r'[[:alpha:]]+', '', UNI), C(r'\w+', '', UNI), C(r'[[:upper:]]+', '', UNI),
        C(r'x*', '', 'axbxx', '-'), C(r'a|', '', 'baab', '-'), C(r'\b', '', 'ab cd', '|'), C(r'a*', '', 'baaac', '[&]'),
        C(r'a|ab', '', 'ab', note='POSIX: the longest of the leftmost matches'),
        C(r'(a|ab)(c|bcd)(d*)', '', 'abcd', note='POSIX: how the groups share the longest match'),
        C(r'(x)(y)?', '', 'x xy', r'[\1|\2]'), C(r'([a-z])\1', '', 'aabbcd eeff', r'[\1]'),
        C(r'\<the\>', 'i', 'The theme of the day'), C(r'colou?r', '', 'color colour'),
        C(r'straße', 'i', 'STRASSE Straße STRAßE'), C(r'([a-z]+)', '', 'hello world', r'\U\1\E!'),
        C(r'([a-z])([a-z]*)', '', 'hello world', r'\u\1\2'), C(r'o', '', 'foo', r'\&\\'),
        C(r'[0-9]', '', 'a1b2c3', '#', all=False), C(r'.', '', 'x' * 1500), C(r'[^0-9]', '', '1🎉2é3', '_'),
        C(r'(', '', 'x'), C(r'[a-', '', 'x'), C(r'a{2,1}', '', 'x'), C(r'a**', '', 'aaa'), C(r'(?:a)', '', 'a'),
        C(r'x{2,3}', '', 'xxxxxxx'), C(r'[[:digit:]]+\.[[:digit:]]{2}', '', 'Rs 10.50 and 3.999'),
    ],
    'ruby': [
        C(r'\d+', '', 'a1 b22 c333', r'<\0>'),
        C(r'(\w+)@(\w+)\.com', '', 'mail ann@example.com or bob@test.com', r'\2 at \1'),
        C(r'(?<y>\d{4})-(?<m>\d\d)', '', 'on 2026-11 and 1999-01', r'\k<m>/\k<y>'),
        C(r'(?<y>\d{4})-(\d\d)', '', 'on 2026-11', r'[\1|\k<y>]', note='named groups: plain ones do not capture, \\1 is dropped'),
        C(r'(\d)', '', 'a1b', r"[\`|\'|\&|\\]"),
        C(r'^\w+', '', LINES, '#', note="Ruby's ^ is at every line"), C(r'\A\w+', '', LINES), C(r'\w+\z', '', 'end\n'),
        C(r'\w+\Z', '', 'end\n'), C(r'.+', '', LINES),
        C(r'a.b', '', 'a\nb'), C(r'a.b', 'm', 'a\nb'),
        C(r'straße', 'i', 'STRASSE strasse Straße'),
        C(r'\w+', '', UNI), C(r'σίσυφος', 'i', UNI), C(r'\p{Greek}+', '', UNI),
        C(r'x*', '', 'axbxx', '-'), C(r'a|', '', 'baab', '-'), C(r'\b', '', 'ab cd', '|'),
        C(r'a|ab', '', 'ab'), C(r'<.+?>', '', '<a><b>'), C(r'(\w)\1', '', 'aabbcd eeff', r'[\1]'),
        C(r'(?<=\$)\d+', '', 'cost $40 or $5'), C(r'a++b', '', 'aaab'), C(r'(?>a+)b', '', 'aaab'),
        C(r'\h+', '', 'xyz 0f1A g'), C(r'[a-z&&[^aeiou]]+', '', 'strength and'),
        C(r'(a)|b', '', 'ab', r'[\1]'), C(r'(', '', 'x'), C(r'[a-', '', 'x'), C(r'a{2,1}', '', 'x'),
        C(r'''(\d+)  # the number
              \s* (cm|mm)  # the unit''', 'x', '10 cm, 5mm'),
        C(r'\d', '', 'a1b2c3', '#', all=False), C(r'.', '', 'x' * 1500), C(r'\D', '', '1🎉2é3', '_'),
        C(r'(?<y>\d)', '', '1', r'\k<nope>'),
    ],
}

# ---------------------------------------------------------------------------------------------------- the engines
PERL_SCRIPT = _re.search(r'String\.raw`(.*?)`;', open(os.path.join(ROOT, 'src/lib/regex/perl.ts'), encoding='utf-8').read(), _re.S).group(1)
PY_SCRIPT = _re.search(r'String\.raw`(.*?)`;', open(os.path.join(ROOT, 'src/lib/regex/python.ts'), encoding='utf-8').read(), _re.S).group(1)
RUBY = r'''
require 'json'
STDIN.each_line do |line|
  q = JSON.parse(line)
  out = {}
  begin
    opts = 0
    q['flags'].each_char { |c| opts |= {'i' => Regexp::IGNORECASE, 'x' => Regexp::EXTENDED, 'm' => Regexp::MULTILINE}[c] }
    re = Regexp.new(q['pattern'], opts)
  rescue RegexpError => e
    puts JSON.generate({'error' => e.message}); next
  end
  text = q['text']; ms = []; total = 0; ngroups = nil
  text.scan(re) do
    m = $~; total += 1; ngroups ||= m.size - 1
    ms << (0...m.size).flat_map { |i| m.begin(i) ? [m.begin(i), m.end(i)] : [-1, -1] } if ms.size < 1000
  end
  ngroups ||= (re.names.empty? ? Regexp.union(re, //).match('').size - 1 : re.names.size)
  out['names'] = re.names.empty? ? [''] * ngroups : re.names
  out['total'] = total; out['matches'] = ms
  if q['rep']
    begin
      out['replaced'] = q['all'] ? text.gsub(re, q['rep']) : text.sub(re, q['rep'])
    rescue => e
      out['repError'] = e.message
    end
  end
  out['version'] = "Ruby #{RUBY_VERSION}"
  puts JSON.generate(out)
end
'''


def fields(c):
    f = [c['pattern'], c['flags'], c['text'], '0' if c['rep'] is None else '1', c['rep'] or '', '1' if c['all'] else '0', str(SHOWN), str(COUNTED)]
    return b''.join(str(len(x.encode())).encode() + b':' + x.encode() for x in f)


def u16(text):
    """UTF-16 index of every code point index of text, and of its end."""
    out, i = [], 0
    for ch in text:
        out.append(i)
        i += 2 if ord(ch) > 0xFFFF else 1
    return out + [i]


def from_bytes(text):
    """Code point index of every UTF-8 byte offset at which a character starts."""
    m, b = {}, 0
    for k, ch in enumerate(text):
        m[b] = k
        b += len(ch.encode('utf-8', 'surrogatepass'))
    m[b] = len(text)
    return m


def shape(c, a, unit):
    """One engine's answer in the common form; `unit`: 'cp' (code points) or 'u8' (UTF-8 bytes)."""
    if 'error' in a:
        return {'error': a['error']}
    t, idx = c['text'], u16(c['text'])
    cp = (lambda x: x) if unit == 'cp' else (lambda x, m=from_bytes(t): m[x])
    ms = []
    for o in a['matches'][:SHOWN]:
        s, e = cp(o[0]), cp(o[1])
        ms.append([idx[s], t[s:e]] + [None if o[i] < 0 else t[cp(o[i]):cp(o[i + 1])] for i in range(2, len(o), 2)])
    r = {'names': a.get('names'), 'total': a['total'], 'matches': ms}  # Perl gives no names by number: None
    if c['rep'] is not None:
        r['replaced'] = a.get('replaced')
        if a.get('repError'):
            r['repError'] = a['repError']
    return r


def posix_native(c):
    """glibc's regcomp / regexec (GNU's regex, the code the module is built from) through ctypes, with the module's walk."""
    import ctypes
    libc = ctypes.CDLL('libc.so.6')
    libc.setlocale(6, b'C.UTF-8')  # LC_ALL
    preg = ctypes.create_string_buffer(256)
    cf = 1 | (2 if 'i' in c['flags'] else 0) | (4 if 'm' in c['flags'] else 0)  # REG_EXTENDED, REG_ICASE, REG_NEWLINE
    rc = libc.regcomp(preg, c['pattern'].encode(), cf)
    if rc:
        buf = ctypes.create_string_buffer(256)
        libc.regerror(rc, preg, buf, 256)
        return {'error': buf.value.decode()}
    nsub = ctypes.c_size_t.from_buffer(preg, 48).value  # re_nsub in glibc's struct re_pattern_buffer (x86-64)

    class RM(ctypes.Structure):
        _fields_ = [('so', ctypes.c_int), ('eo', ctypes.c_int)]
    M = (RM * (nsub + 1))()
    t = c['text'].encode()
    n, pos, prev, ms, total = len(t), 0, -1, [], 0
    clen = lambda i: next((k for k in (4, 3, 2) if t[i] >= (0xf0, 0xe0, 0xc0)[(4, 3, 2).index(k)]), 1)
    while pos <= n:
        M[0].so, M[0].eo = pos, n
        if libc.regexec(preg, t, nsub + 1, M, 4):  # REG_STARTEND
            break
        st, en = M[0].so, M[0].eo
        if not (st == en and st == prev):
            if len(ms) < SHOWN:
                ms.append([x for g in range(nsub + 1) for x in ((M[g].so, M[g].eo) if M[g].so >= 0 else (-1, -1))])
            total += 1
        prev = en
        pos = (en + clen(en) if en < n else en + 1) if st == en else en
    libc.regfree(preg)
    return {'names': [''] * nsub, 'total': total, 'matches': ms}


def sed(c, rep, every=True):
    """GNU sed -E, s with \\x01 as the delimiter: the whole text one record (-z), or — for m (REG_NEWLINE) — line by line,
    which is the same there (sed -z's M makes ^ and $ meet the NUL that ends a record, not a new line)."""
    script = '\x01'.join(['s', c['pattern'], rep, ('g' if every else '') + ('I' if 'i' in c['flags'] else '')])
    return subprocess.run(['sed', '-E', script] if 'm' in c['flags'] else ['sed', '-z', '-E', script], input=c['text'].encode(), capture_output=True, check=True).stdout.decode()


def main():
    py = sys.argv[1] if len(sys.argv) > 1 else subprocess.run([shutil.which('uv') or os.path.expanduser('~/.local/bin/uv'), 'python', 'find', '3.14'], capture_output=True, text=True).stdout.strip()
    tmp = tempfile.mkdtemp()
    gobin, pcre = os.path.join(tmp, 'regex-go'), os.path.join(tmp, 'pcre2ref')
    subprocess.run(['go', 'build', '-o', gobin, '.'], cwd=os.path.join(ROOT, 'wasm/regexgo'), check=True)
    subprocess.run(['cc', '-O2', '-o', pcre, os.path.join(ROOT, 'scripts/regex-ref/pcre2ref.c'), '-lpcre2-8'], check=True)
    out = {'engines': {}, 'cases': {}}
    for c in CASES['python']:
        q = {'pattern': c['pattern'], 'flags': c['flags'], 'text': c['text'], 'rep': c['rep'], 'all': c['all'], 'shown': SHOWN, 'counted': COUNTED}
        a = json.loads(subprocess.run([py, '-I', '-S', '-c', PY_SCRIPT], input=json.dumps(q), capture_output=True, text=True, check=True).stdout)
        if 'version' in a:
            out['engines']['python'] = a['version']
        out['cases'].setdefault('python', []).append({**c, 'out': shape(c, a, 'cp')})
    rxv = _re.search(r'RX=regex-([0-9.]+)\.tar\.gz', open(os.path.join(ROOT, 'wasm/python/build.sh')).read()).group(1)
    pyrx = os.environ.get('PYREGEX')
    if not pyrx:
        uv = shutil.which('uv') or os.path.expanduser('~/.local/bin/uv')
        venv = os.path.join(tmp, 'pyregex')
        subprocess.run([uv, 'venv', '-q', '--python', py, venv], check=True)
        pyrx = os.path.join(venv, 'bin', 'python')
        subprocess.run([uv, 'pip', 'install', '-q', '--python', pyrx, f'regex=={rxv}'], check=True)
    for c in CASES['pyregex']:
        q = {'module': 'regex', 'pattern': c['pattern'], 'flags': c['flags'], 'text': c['text'], 'rep': c['rep'], 'all': c['all'], 'shown': SHOWN, 'counted': COUNTED}
        a = json.loads(subprocess.run([pyrx, '-I', '-c', PY_SCRIPT], input=json.dumps(q), capture_output=True, text=True, check=True).stdout)
        if 'version' in a:
            assert a['version'].startswith(f'regex {rxv} '), f"the reference's regex is {a['version']}, the build's {rxv}"
            out['engines']['pyregex'] = a['version']
        out['cases'].setdefault('pyregex', []).append({**c, 'out': shape(c, a, 'cp')})
    for c in CASES['go']:
        a = json.loads(subprocess.run([gobin], input=fields(c), capture_output=True, check=True).stdout)
        if 'version' in a:
            out['engines']['go'] = a['version']
        out['cases'].setdefault('go', []).append({**c, 'out': shape(c, a, 'u8')})
    for c in CASES['pcre2']:
        a = json.loads(subprocess.run([pcre], input=fields(c), capture_output=True, check=True).stdout)
        if 'version' in a:
            out['engines']['pcre2'] = f"PCRE2 {a['version']} (libpcre2-8)"
        out['cases'].setdefault('pcre2', []).append({**c, 'out': shape(c, a, 'u8')})
    for c in CASES['perl']:
        q = {'pattern': c['pattern'], 'flags': c['flags'], 'text': c['text'], 'rep': c['rep'], 'all': c['all'], 'shown': SHOWN, 'counted': COUNTED}
        a = json.loads(subprocess.run(['perl', '-e', PERL_SCRIPT], input=json.dumps(q).encode(), capture_output=True, check=True).stdout)
        if 'version' in a:
            out['engines']['perl'] = a['version']
        out['cases'].setdefault('perl', []).append({**c, 'out': shape(c, a, 'cp')})
    for c in CASES['posix']:
        a = posix_native(c)
        if 'error' not in a and a['total'] <= SHOWN:
            # the walk is GNU sed's: the matches marked must be what sed marks
            t, b, marked, last = c['text'], c['text'].encode(), b'', 0
            for o in a['matches']:
                marked += b[last:o[0]] + b'\x02' + b[o[0]:o[1]] + b'\x03'
                last = o[1]
            marked += b[last:]
            assert marked.decode() == sed(c, '\x02&\x03'), f"the walk is not sed's for {c['pattern']!r} on {c['text']!r}"
        if c['rep'] is not None and 'error' not in a:
            a['replaced'] = sed(c, c['rep'], c['all'])
        out['engines']['posix'] = 'glibc regex (GNU sed for the replacements)'
        out['cases'].setdefault('posix', []).append({**c, 'out': shape(c, a, 'u8')})
    lines = '\n'.join(json.dumps({k: c[k] for k in ('pattern', 'flags', 'text', 'rep', 'all')}) for c in CASES['ruby']) + '\n'
    answers = subprocess.run(['ruby', '-e', RUBY], input=lines, capture_output=True, text=True, check=True).stdout.splitlines()
    for c, line in zip(CASES['ruby'], answers):
        a = json.loads(line)
        out['engines']['ruby'] = a.get('version', out['engines'].get('ruby'))
        out['cases'].setdefault('ruby', []).append({**c, 'out': shape(c, a, 'cp')})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    shutil.rmtree(tmp)
    print({k: len(v) for k, v in out['cases'].items()}, out['engines'])


if __name__ == '__main__':
    main()
