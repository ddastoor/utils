#!/usr/bin/env python3
# Moves the rules of src/styles.css that only one tool module uses into a stylesheet beside that module
# (src/tools/x.ts -> src/tools/x.css, imported by it): Vite then loads them with the tab, not with the start page, whose
# budget (tests/e2e/lazy.e2e.mjs, SHELL_BUDGET) the stylesheet had nearly used up (27 Nov 2026). A rule moves when every
# class in its selector appears in that one module's source and in no other source file (lib, ui, main …); rules inside
# @media / @supports go into the same block in the tab's file. Kept rules stay byte for byte. Run it again after new tabs
# add rules to styles.css: it moves what has become movable and leaves the rest.   python3 scripts/split-tab-css.py
import os, re
from collections import defaultdict
CSS = 'src/styles.css'
css = open(CSS).read()
files = {}
for root, _, fs in os.walk('src'):
    for f in fs:
        if f.endswith('.ts') and not f.endswith('.gen.ts'):
            p = os.path.join(root, f); files[p] = open(p).read()
# class names a file builds (`btn-${variant}`, `note note-${kind}`, 'md-' + x): every class with that beginning counts as used
# by that file — the shared helpers build btn-ghost, note-ok …, and a tool that names "btn-ghost" or "note-ok" once would have
# taken the rule along (the first tries did: ghost buttons drawn with borders, green notes blue, the keyboard's wide keys
# narrow — caught by comparing screenshots of every tab)
DYN = []
for p, t in files.items():
    # `note note-${kind}`, `kb-key kb-${code}`, 'btn-' + v: a beginning before an expression, wherever it stands in the string
    for m in re.finditer(r"(?<![\w-])([A-Za-z][\w-]*-)\$\{", t): DYN.append((m.group(1), p))
    for m in re.finditer(r"(?<![\w-])([A-Za-z][\w-]*-)['\"]\s*\+", t): DYN.append((m.group(1), p))
# the words inside a file's strings ('…', "…", `…`): a class is named there — not by a variable that has its name (el, kv …)
STR = re.compile(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", re.S)
words = {p: set(re.findall(r'[A-Za-z][\w-]*', ' '.join(m.group(0)[1:-1] for m in STR.finditer(t)))) for p, t in files.items()}
cache = {}
def users(c):
    if c not in cache:
        cache[c] = {p for p in files if c in words[p]} | {p for pre, p in DYN if c.startswith(pre)}
    return cache[c]
def owner(sel):
    sel = re.sub(r'/\*.*?\*/', '', sel, flags=re.S)
    classes = set(re.findall(r'\.([a-zA-Z][\w-]*)', sel))
    if not classes: return None
    own = set()
    for c in classes:
        u = users(c)
        if not u or any(not p.startswith('src/tools/') for p in u): return None
        own |= u
    return next(iter(own)) if len(own) == 1 else None
def parse(s, base=0):
    out, i, n = [], 0, len(s)
    while i < n:
        j = s.find('{', i)
        if j < 0: break
        sel = s[i:j]
        if sel.strip().startswith('@') or re.search(r'@(media|supports|container)\b', re.sub(r'/\*.*?\*/', '', sel, flags=re.S)):
            depth, k = 1, j + 1
            while depth and k < n:
                if s[k] == '{': depth += 1
                elif s[k] == '}': depth -= 1
                k += 1
            out.append({'kind': 'block', 'sel': sel, 'start': base + i, 'end': base + k, 'istart': base + j + 1, 'iend': base + k - 1, 'inner': s[j + 1:k - 1]})
            i = k
        else:
            k = s.find('}', j)
            out.append({'kind': 'rule', 'sel': sel, 'start': base + i, 'end': base + k + 1})
            i = k + 1
    return out
# Every rule in the order the sheet has it (rules inside @media / @supports / @container too), with its owner.
flat = []
for it in parse(css):
    if it['kind'] == 'rule': flat.append({'r': it, 'block': None, 'own': owner(it['sel'])})
    else:
        head = re.sub(r'/\*.*?\*/', '', it['sel'], flags=re.S).strip()
        if not re.match(r'@(media|supports|container)\b', head):
            flat.append({'r': it, 'block': None, 'own': None}); continue
        for r in parse(it['inner'], it['istart']):
            flat.append({'r': r, 'block': it, 'own': owner(r['sel']) if r['kind'] == 'rule' else None})
# A tab's sheet loads after this one, so a moved rule comes after every rule that stays here: where a rule that stood after
# it here could style the same element and sets a property it sets, the moved rule would now win where it used to lose
# (the keyboard's .kb-key { flex: 1 1 0 } over .kb-Space { flex-grow: 6 } made the wide keys narrow). Such a rule stays.
# Only a later rule of the same specificity matters (a higher one wins either way, a lower one loses either way), and only
# one that could style the same element: every class of its last compound is named by the tab's own file (literally, or
# built from a beginning it names), or it has no class at all (button, input[type=range]). A shared helper's own classes
# on the tab's elements (.btn on a button the tab made) are not followed: the screenshots and computed styles of every
# tab, before and after, are the check for those (scripts/split-tab-css.py's commit).
ALIAS = {'inset': {'top', 'right', 'bottom', 'left'}, 'gap': {'row-gap', 'column-gap'}, 'place-items': {'align-items', 'justify-items'},
         'place-content': {'align-content', 'justify-content'}, 'place-self': {'align-self', 'justify-self'}}
def props(body):
    return {m.group(1).lower() for m in re.finditer(r'(?:^|;|\{)\s*(-?[A-Za-z][\w-]*)\s*:', re.sub(r'/\*.*?\*/', '', body, flags=re.S))}
def overlap(a, b):
    for x in a:
        for y in b:
            if x == y or x.startswith(y + '-') or y.startswith(x + '-') or y in ALIAS.get(x, ()) or x in ALIAS.get(y, ()): return True
    return False
def body(r): t = css[r['start']:r['end']]; return t[t.find('{') + 1:t.rfind('}')]
def subjects(sel):
    sel = re.sub(r'/\*.*?\*/', '', sel, flags=re.S)
    out = []
    for one in sel.split(','):
        last = re.split(r'\s*[>+~]\s*|\s+', one.strip())[-1]
        out.append(set(re.findall(r'\.([a-zA-Z][\w-]*)', re.sub(r'::?[\w-]+\([^)]*\)', '', last))))
    return out
def reaches(mod, classes):
    return all(mod in users(c) for c in classes)
def spec(one):
    """a selector's specificity (ids, classes / attributes / pseudo-classes, elements / pseudo-elements)"""
    t = re.sub(r':where\([^)]*\)', '', one)
    t = re.sub(r':(?:not|is|has|matches)\(([^)]*)\)', lambda m: ' ' + m.group(1).split(',')[0], t)
    a = len(re.findall(r'#[\w-]+', t))
    b = len(re.findall(r'\.[\w-]+|\[[^\]]*\]|(?<!:):(?!:)[\w-]+', t))
    pe = len(re.findall(r'::[\w-]+', t))
    t2 = re.sub(r'\[[^\]]*\]|::?[\w-]+(\([^)]*\))?|[.#][\w-]+', ' ', t)
    c = len(re.findall(r'(?:^|[\s>+~(])([a-zA-Z][\w-]*|\*)', t2)) - len(re.findall(r'(?:^|[\s>+~(])\*', t2)) + pe
    return (a, b, c)
def selectors(sel): return [x.strip() for x in re.sub(r'/\*.*?\*/', '', sel, flags=re.S).split(',') if x.strip()]
for f in flat:
    if f['r']['kind'] == 'rule': f['props'] = props(body(f['r']))
changed = True
while changed:
    changed = False
    for i, f in enumerate(flat):
        if not f['own']: continue
        for k in flat[i + 1:]:
            if k['r']['kind'] != 'rule' or k['own'] == f['own'] or (k['own'] and k['own'] != f['own']): continue
            if not overlap(f['props'], k['props']): continue
            # only a later rule of the same specificity changes its mind with the order (a higher one wins anyway, a lower
            # one loses anyway); and only one that can reach the same element
            mine = {spec(x) for x in selectors(f['r']['sel'])}
            if any(spec(x) in mine and reaches(f['own'], subjects(x)[0]) for x in selectors(k['r']['sel'])):
                if os.environ.get('SPLIT_DEBUG'): print('kept', ' '.join(f['r']['sel'].split())[:60], '| because of', ' '.join(k['r']['sel'].split())[:60])
                f['own'] = None; changed = True; break
final = {f['r']['start']: f['own'] for f in flat}
moves = defaultdict(list)   # module -> [css text], in the order of this sheet
cut = []                    # ranges removed from styles.css
for it in parse(css):
    if it['kind'] == 'rule':
        o = final.get(it['start'])
        if o: moves[o].append(css[it['start']:it['end']].strip()); cut.append((it['start'], it['end']))
        continue
    head = re.sub(r'/\*.*?\*/', '', it['sel'], flags=re.S).strip()
    if not re.match(r'@(media|supports|container)\b', head): continue
    took = defaultdict(list); gone = []
    for r in parse(it['inner'], it['istart']):
        o = final.get(r['start']) if r['kind'] == 'rule' else None
        if o: took[o].append(css[r['start']:r['end']].strip()); gone.append((r['start'], r['end']))
    if not took: continue
    left = ''.join(css[a:b] for a, b in [(it['istart'], gone[0][0])] + [(gone[k][1], gone[k + 1][0]) for k in range(len(gone) - 1)] + [(gone[-1][1], it['iend'])])
    if '{' not in re.sub(r'/\*.*?\*/', '', left, flags=re.S): cut.append((it['start'], it['end']))   # nothing left in the block
    else: cut.extend(gone)
    for o, rules in took.items(): moves[o].append(head + ' {\n  ' + '\n  '.join(rules) + '\n}')
cut.sort()
out, pos = [], 0
for a, b in cut: out.append(css[pos:a]); pos = b
out.append(css[pos:])
open(CSS, 'w').write(''.join(out))
for mod, rules in sorted(moves.items()):
    path = mod[:-3] + '.css'
    old = open(path).read().rstrip() + '\n' if os.path.exists(path) else f'/* {os.path.basename(mod)}\'s own styles, loaded with its tab (moved from src/styles.css by scripts/split-tab-css.py) */\n'
    open(path, 'w').write(old + '\n'.join(rules) + '\n')
    src = open(mod).read(); imp = f"import './{os.path.basename(path)}';"
    if imp not in src:
        lines = src.split('\n'); last = max((k for k, l in enumerate(lines[:80]) if l.startswith('import ')), default=-1)
        # the end of the last import statement (it may run over lines)
        k = last
        while k >= 0 and not lines[k].rstrip().endswith(';'): k += 1
        lines.insert(k + 1, imp); open(mod, 'w').write('\n'.join(lines))
    print(f'{len(rules):4} rules -> {path}')
print('styles.css', len(css), '->', len(''.join(out)))
