#!/usr/bin/env python3
"""The Spell Checker's reference (tests/fixtures/spell/reference.json): what Hunspell 1.7.6 suggests natively for misspelt words, and
the order the tab gives them (wasm/hunspell/rank.hxx) — worked out here a second time, in Python, and held to the native build's
(the frequencies, the distance, the dictionary's table of misspellings).

    ZIG=/path/to/zig bash wasm/hunspell/build.sh          # leaves the native reference at /tmp/hunspell-build/native/hsref
    python3 scripts/make-spell-reference.py [HSREF]

The misspellings: codespell 2.4.1's list of common misspellings (dictionary.txt, GPL-2.0; the wheel from PyPI, SHA-256 pinned, kept
in node_modules/.cache/superutils-spell) — those whose correction the dictionary accepts and whose misspelling it refuses, as typed
and with a capital first letter (at a sentence's start), and the words written together ("alot" → "a lot"); and a list of classic
misspellings of people (CLASSIC below). The order was fitted on the even-numbered half of codespell's words and is tested on the
odd-numbered half: the script prints how often the right word comes first, in Hunspell's order and in the tab's, for every set.
Also: words of the dictionaries (American, British, India's list) that must be accepted or refused.
"""
import hashlib
import json
import random
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HSREF = sys.argv[1] if len(sys.argv) > 1 else '/tmp/hunspell-build/native/hsref'
FREQ = ROOT / 'public/data/dict/freq.txt'
OUT = ROOT / 'tests/fixtures/spell/reference.json'
CACHE = ROOT / 'node_modules/.cache/superutils-spell'
WHEEL = 'codespell-2.4.1-py3-none-any.whl'
WHEEL_SHA = '3dadafa67df7e4a3dbf51e0d7315061b80d265f9552ebd699b3dd6834b47e425'
DICTS = {
    'en-US': [ROOT / 'node_modules/dictionary-en/index.aff', ROOT / 'node_modules/dictionary-en/index.dic'],
    'en-GB': [ROOT / 'node_modules/dictionary-en-gb/index.aff', ROOT / 'node_modules/dictionary-en-gb/index.dic'],
    'en-IN': [ROOT / 'node_modules/dictionary-en-gb/index.aff', ROOT / 'node_modules/dictionary-en-gb/index.dic', ROOT / 'public/data/spell/en-IN.dic'],
}
CLASSIC = """accomodate accommodate|acheive achieve|adress address|alot a lot|aquire acquire|arguement argument|athiest atheist|
begining beginning|beleive believe|buisness business|calender calendar|cemetary cemetery|collegue colleague|comming coming|
commited committed|concious conscious|curiousity curiosity|definately definitely|dilemna dilemma|dissapear disappear|
embarass embarrass|enviroment environment|existance existence|familar familiar|finaly finally|foriegn foreign|fourty forty|
freind friend|goverment government|grammer grammar|gaurd guard|happend happened|harrass harass|hieght height|humerous humorous|
immediatly immediately|independant independent|interupt interrupt|irresistable irresistible|knowlege knowledge|liason liaison|
libary library|lisence license|maintainance maintenance|millenium millennium|neccessary necessary|noticable noticeable|
occassion occasion|occured occurred|occurence occurrence|paralel parallel|parliment parliament|persistant persistent|
posession possession|prefered preferred|propoganda propaganda|publically publicly|recieve receive|reccomend recommend|
refered referred|relevent relevant|religous religious|remeber remember|repitition repetition|rythm rhythm|seperate separate|
sieze seize|speach speech|succesful successful|suprise surprise|tatoo tattoo|tendancy tendency|tommorow tomorrow|tounge tongue|
truely truly|unforseen unforeseen|untill until|wierd weird|wich which|writting writing|teh the|thier their|becuase because|
recieved received|youre you're|dont don't|doesnt doesn't|wouldnt wouldn't|eachother each other|infact in fact|aswell as well|
atleast at least|incase in case|noone no one|jumpd jumped|wnat want|taht that|adn and|hte the|waht what|whcih which|woudl would|
coudl could|shoudl should|peopel people|becasue because|realy really|beleif belief|excercise exercise|explaination explanation|
garantee guarantee|hygene hygiene|mischevous mischievous|neice niece|ocurred occurred|persue pursue|posible possible|
priviledge privilege|questionaire questionnaire|reciept receipt|recomend recommend|restaraunt restaurant|sentance sentence|
similiar similar|sincerly sincerely|strenght strength|threshhold threshold|tomatos tomatoes|unneccessary unnecessary|
vaccum vacuum|vegtable vegetable"""
# words each dictionary must accept (+) or refuse (−)
WORDS = {
    'en-US': ['+color', '+organize', '+center', '+traveled', '+the', "+don't", '+Bengal', '-colour', '-organise', '-centre', '-lakh',
              '-Bengaluru', '-recieve'],
    'en-GB': ['+colour', '+organise', '+centre', '+travelled', '+the', '-color', '-organize', '-lakh', '-crore', '-Bengaluru'],
    'en-IN': ['+colour', '+organise', '+lakh', '+lakhs', '+crore', '+crores', '+Bengaluru', "+Bengaluru's", '+prepone', '+preponed',
              '+preponing', '+Aadhaar', '+biryani', '+Kolkata', '+Telangana', '+Diwali', '-color', '-organize', '-recieve'],
}

# ---------------------------------------------------------------- the tab's order, a second time (wasm/hunspell/rank.hxx)
L1 = 'aaaaaa\0ceeeeiiii\0nooooo\0\0uuuuy\0y'
XA = 'aaaaaaccccccccdd..eeeeeeeeeegggggggghh..iiiiiiiii...jjkk.llllll....nnnnnn...oooooo..rrrrrrsssssssstttt..uuuuuuuuuuuuwwyyyzzzzzz.'
ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
OFF = [0, 0.25, 0.75]
POS = {c: (r, i + OFF[r]) for r, row in enumerate(ROWS) for i, c in enumerate(row)}


def is_upper(c):
    o = ord(c)
    if 'A' <= c <= 'Z':
        return True
    if 0xC0 <= o <= 0xDE:
        return o != 0xD7
    if 0x100 <= o <= 0x137:
        return o % 2 == 0
    if 0x139 <= o <= 0x148:
        return o % 2 == 1
    if 0x14A <= o <= 0x177:
        return o % 2 == 0
    if o == 0x178:
        return True
    if 0x179 <= o <= 0x17E:
        return o % 2 == 1
    return False


def lower(c):
    if not is_upper(c):
        return c
    o = ord(c)
    return chr(o + 32) if o < 0x100 else '\xff' if o == 0x178 else chr(o + 1)


def base(c):
    o = ord(c)
    if 0xE0 <= o <= 0xFF and L1[o - 0xE0] != '\0':
        return L1[o - 0xE0]
    if 0x100 <= o <= 0x17F and XA[o - 0x100] != '.':
        return XA[o - 0x100]
    return c


def vowel(c):
    return c in 'aeiouy'


def next_key(a, b):
    if a == b or a not in POS or b not in POS:
        return False
    (r1, x1), (r2, x2) = POS[a], POS[b]
    return abs(r1 - r2) <= 1 and abs(x1 - x2) <= 1


def sub(a, b):
    if a == b:
        return 0
    if base(a) == base(b):
        return 0.3
    if vowel(a) and vowel(b):
        return 0.75
    if next_key(a, b):
        return 0.8
    return 1.0


def indel(s, k):
    c = s[k]
    if c in " -'":
        return 0.4
    if (k > 0 and s[k - 1] == c) or (k + 1 < len(s) and s[k + 1] == c):
        return 0.5
    if vowel(c):
        return 0.8
    return 1.0


def distance(a, b):
    n, m = len(a), len(b)
    d = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        d[i][0] = d[i - 1][0] + indel(a, i - 1)
    for j in range(1, m + 1):
        d[0][j] = d[0][j - 1] + indel(b, j - 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            v = min(min(d[i - 1][j] + indel(a, i - 1), d[i][j - 1] + indel(b, j - 1)), d[i - 1][j - 1] + sub(a[i - 1], b[j - 1]))
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1] and a[i - 1] != a[i - 2]:
                v = min(v, d[i - 2][j - 2] + 0.9)
            d[i][j] = v
    return d[n][m]


def load_freq():
    f = {}
    for line in FREQ.read_text(encoding='utf-8').split('\n'):
        if not line:
            continue
        z, *ws = line.split(' ')
        for w in ws:
            if w:
                f.setdefault(w, int(z))
    return f


def zipf(f, c):
    zs = []
    for part in [p for p in re.split('[ -]', c) if p]:
        w = ''.join("'" if ch == '’' else lower(ch) for ch in part)
        if len(part) == 1 and w not in ('a', 'i'):
            zs.append(0.5)
        else:
            v = f.get(w, -1)
            zs.append(0.5 if v < 0 else v / 10.0)
    if not zs:
        return 0.5
    if len(zs) == 1:
        return zs[0]
    s = 0
    for v in zs:
        s += v
    return s - 9.0 * (len(zs) - 1)


def reps(aff):
    out = []
    for line in Path(aff).read_text(encoding='utf-8').split('\n'):
        if not line.startswith('REP '):
            continue
        f = line.split()
        if len(f) != 3:
            continue
        frm, to = f[1], f[2].replace('_', ' ')
        start, end = frm.startswith('^'), frm.endswith('$')
        frm = frm[1:] if start else frm
        frm = frm[:-1] if end else frm
        if frm:
            out.append((frm, to, start, end))
    return out


def rep_forms(w, table):
    out = set()
    for frm, to, start, end in table:
        i = w.find(frm)
        while i >= 0:
            if not ((start and i != 0) or (end and i + len(frm) != len(w))):
                out.add(w[:i] + to + w[i + len(frm):])
            i = w.find(frm, i + 1)
    return out


def rank(f, typed, sugg, table):
    if len(sugg) < 2:
        return list(sugg)
    tl = ''.join(lower(c) for c in typed)
    tcap = bool(typed) and is_upper(typed[0])
    known = rep_forms(tl, table)
    rows = []
    for k, c in enumerate(sugg):
        cl = ''.join(lower(ch) for ch in c)
        parts = len([p for p in re.split('[ -]', c) if p])
        cap = 1.0 if (c and is_upper(c[0]) and not tcap) else 0.0
        rep = 1.0 if cl in known else 0.0
        score = zipf(f, c) - 3.0 * distance(tl, cl) - 0.1 * k - 1.0 * (1.0 if parts > 1 else 0.0) - 0.5 * cap + 2.0 * rep
        rows.append((score, k))
    rows.sort(key=lambda r: (-r[0], r[1]))
    return [sugg[k] for _, k in rows]


# ---------------------------------------------------------------- the misspellings
def codespell():
    CACHE.mkdir(parents=True, exist_ok=True)
    w = CACHE / WHEEL
    if not w.exists():
        subprocess.run([sys.executable, '-m', 'pip', 'download', '-q', '--no-deps', '-d', str(CACHE), 'codespell==2.4.1'], check=True)
    if hashlib.sha256(w.read_bytes()).hexdigest() != WHEEL_SHA:
        sys.exit(f'{WHEEL}: SHA-256 differs')
    with zipfile.ZipFile(w) as z:
        text = z.read('codespell_lib/data/dictionary.txt').decode('utf-8')
    one, two = [], []
    for line in text.split('\n'):
        if '->' not in line:
            continue
        typo, corr = line.strip().split('->', 1)
        corr = corr.strip().rstrip(',')
        if ',' in corr or not re.fullmatch(r'[a-z]{3,}', typo):
            continue
        if re.fullmatch(r"[a-z']{2,}", corr):
            one.append((typo, corr))
        elif re.fullmatch(r"[a-z']+ [a-z']+", corr) and typo == corr.replace(' ', ''):
            two.append((typo, corr))
    random.seed(10)
    random.shuffle(one)
    return one, two


def run(lang, words, freq=True):
    args = [HSREF] + (['--freq', str(FREQ)] if freq else []) + [str(p) for p in DICTS[lang]]
    r = subprocess.run(args, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True)
    out = [json.loads(x) for x in r.stdout.strip().split('\n')]
    assert len(out) == len(words)
    return out


def top1(rows, key):
    return round(100 * sum(1 for d in rows if d[key] and d[key][0].lower() == d['right']) / len(rows), 1) if rows else 0


def main():
    f = load_freq()
    one, two = codespell()
    ref = {'hunspell': '1.7.6', 'codespell': '2.4.1', 'sets': {}, 'measured': {}, 'words': {}}
    for lang, take in (('en-US', 9000), ('en-GB', 3000)):
        pairs = one[:take]
        res = run(lang, [p[0] for p in pairs] + [p[1] for p in pairs])
        n = len(pairs)
        rows = [{'typo': t, 'right': c, 's': a['s'], 'r': a['r']} for (t, c), a, b in zip(pairs, res[:n], res[n:]) if a['ok'] == 0 and b['ok'] == 1]
        caps = [d['typo'][0].upper() + d['typo'][1:] for d in rows[:3000]]
        cres = run(lang, caps)
        crows = [{'typo': w, 'right': d['right'], 's': a['s'], 'r': a['r']} for w, d, a in zip(caps, rows, cres) if a['ok'] == 0]
        tw = run(lang, [p[0] for p in two] + [w for p in two for w in p[1].split(' ')])
        m = len(two)
        trows = [{'typo': t, 'right': c, 's': a['s'], 'r': a['r']} for i, ((t, c), a) in enumerate(zip(two, tw[:m]))
                 if a['ok'] == 0 and tw[m + 2 * i]['ok'] == 1 and tw[m + 2 * i + 1]['ok'] == 1]
        cl = [x.strip().split(' ', 1) for x in CLASSIC.replace('\n', '').split('|')]
        clres = run(lang, [t for t, _ in cl] + [t[0].upper() + t[1:] for t, _ in cl])
        k = len(cl)
        clrows = [{'typo': t, 'right': c, 's': a['s'], 'r': a['r']} for (t, c), a in zip(cl, clres[:k]) if a['ok'] == 0]
        ccrows = [{'typo': t[0].upper() + t[1:], 'right': c, 's': a['s'], 'r': a['r']} for (t, c), a in zip(cl, clres[k:]) if a['ok'] == 0]
        # the native build's order is the order worked out here
        bad = 0
        table = reps(DICTS[lang][0])
        for d in rows + crows + trows + clrows + ccrows:
            mine = rank(f, d['typo'], d['s'], table)
            if mine != d['r']:
                bad += 1
                if bad < 6:
                    print('differs', lang, d['typo'], d['r'][:5], mine[:5])
        if bad:
            sys.exit(f'{lang}: {bad} lists in another order than rank.hxx gives')
        sets = {'codespell': rows, 'capitalised': crows, 'together': trows, 'classic': clrows, 'classicCapitalised': ccrows}
        meas = {}
        for name, s in sets.items():
            meas[name] = {'words': len(s), 'hunspell': top1(s, 's'), 'tab': top1(s, 'r')}
            if name in ('codespell', 'capitalised'):
                for half in (0, 1):
                    h = s[half::2]
                    meas[name]['fit' if half == 0 else 'test'] = {'hunspell': top1(h, 's'), 'tab': top1(h, 'r')}
        ref['measured'][lang] = meas
        print(lang, json.dumps(meas))
        # kept in the fixture: a part of each set (the unit suite runs the module on every word)
        keep = {'codespell': 300 if lang == 'en-US' else 120, 'capitalised': 150 if lang == 'en-US' else 60}
        ref['sets'][lang] = {name: [{'typo': d['typo'], 'right': d['right'], 's': d['s'], 'r': d['r']} for d in s[:keep.get(name, len(s))]]
                             for name, s in sets.items()}
    for lang, ws in WORDS.items():
        res = run(lang, [w[1:] for w in ws], freq=False)
        got = {w[1:]: bool(a['ok']) for w, a in zip(ws, res)}
        for w in ws:
            if got[w[1:]] != (w[0] == '+'):
                sys.exit(f'{lang}: {w[1:]} should be {"accepted" if w[0] == "+" else "refused"}')
        ref['words'][lang] = got
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(ref, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)}: {OUT.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
