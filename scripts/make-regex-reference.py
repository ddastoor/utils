#!/usr/bin/env python3
# make-regex-reference.py — tests/fixtures/regex/reference.json: what the native engines answer for the Regex Tester's
# cases (to-do #8; tests/unit/regex-flavours.test.mjs holds each flavour of the tab to it):
#   python — CPython 3.14 (`uv python install 3.14`), running the very script the tab runs (src/lib/regex/python.ts);
#   go     — wasm/regexgo built natively with the Go toolchain (the same program the tab runs as WebAssembly);
#   pcre2  — the system's libpcre2-8 through scripts/regex-ref/pcre2ref.c (cc … -lpcre2-8; apt install libpcre2-dev);
#   ruby   — Ruby (3.3 here: its Onigmo) — the tab runs Oniguruma, so this is where the two may part;
#   perl   — the system's perl (5.38 here) running the very script the tab runs (src/lib/regex/perl.ts) in Perl 5.42.
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
            out['engines']['python'] = f"Python {a['version']}"
        out['cases'].setdefault('python', []).append({**c, 'out': shape(c, a, 'cp')})
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
