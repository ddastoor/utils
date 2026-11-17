# Makes tests/fixtures/glob/reference.json: which paths each pattern matches according to Python 3.13's glob.translate()
# (recursive=True, include_hidden=True, "/" as the separator) — the reference for the part of glob syntax every tool
# agrees on: * ? [...] [!...] ranges and ** as a whole path component. Used by tests/unit/devcore.test.mjs.
# Run: python3 scripts/make-glob-reference.py > tests/fixtures/glob/reference.json   (Python ≥ 3.13)
import glob, json, random, re
random.seed(20261117)
paths = ['a', 'b', 'ab', 'abc', 'a.txt', 'b.txt', 'ab.txt', 'é.txt', 'न.txt', '😀.txt', 'नमस्ते.md', 'café.md', 'README.md', 'package.json', '.env', '.gitignore', 'src/main.ts', 'src/ui.ts', 'src/tools/text.ts', 'src/tools/text.test.ts',
         'src/tools/deep/er/x.ts', 'src/é/न.ts', 'src/.hidden/x.ts', 'tests/e2e.mjs', 'docs/notes.md', 'docs/चित्र/फोटो.png', 'a/b', 'a/b/c', 'a/b/c/d.txt', 'x.tar.gz', 'file1.txt', 'file-.txt', 'file[1].txt', 'A.TXT', 'Z', 'z', '0', '9', '-', 'a-b', 'a b.txt', 'foo.', 'src', 'docs', 'a/a/a/a', 'b/a']
pieces = ['a', 'b', 'c', 'é', 'न', '😀', '.', '-', 'txt', 'ts', 'md', 'src', 'docs', 'file', '*', '*', '*', '?', '?', '[ab]', '[!a]', '[a-c]', '[!a-c]', '[é-न]', '[0-9]', '[.]', '[-a]', '[a-]', '[]a]', '[!]a]', '[A-Z]', '/', '/', '**/', '/**/', '*.', '.*']
pats = ['*', '**', '?', '??', '*.txt', '?.txt', '??.txt', '*.t?t', '[abé].txt', '[!a].txt', '[a-z].txt', '[!a-z].txt', '[न].txt', '[😀a].txt', '**/*.ts', 'src/**/*.ts', 'src/*.ts', 'src/*/*.ts', '**/x.ts', '**/*', '*/*', '*/*/*', 'a/**/d.txt', '**/b', '**/a', 'a/**/a', '*a*', '*.*', '.*', '**/.*', '*[!.]*', 'file[0-9].txt', 'file[!0-9].txt',
        'file[[]1].txt', 'docs/*/*.png', 'docs/**/*.png', '**/फोटो.png', '*/चित्र/*', 'src/é/?.ts', '[a-b]/[a-b]', '?/?/?', '*.tar.gz', '*.tar.*', 'x.*.gz', 'foo.', 'foo.*', 'a?b', 'a*b', 'a[- ]b*', '[Z-a]', '**/**/x.ts', 'src/**/**/x.ts', '**/tools/**/x.ts']
while len(pats) < 420:
    p = ''.join(random.choice(pieces) for _ in range(random.randint(1, 6)))
    if p.endswith('/') or '//' in p or p.startswith('/') or p.endswith('/**') or re.search(r'(^|/)\*\*[^/]|[^/]\*\*(/|$)|\*\*\*', p): continue
    if p not in pats: pats.append(p)
out = []
for p in pats:
    # POSIX rule: a bracket expression never matches "/" (Python's translation lets a negated class do so): add it to every [^…]
    rx = re.compile(re.sub(r'\[\^(\]?)', r'[^\1/', glob.translate(p, recursive=True, include_hidden=True, seps='/')))
    out.append([p, ''.join('1' if rx.match(x) else '0' for x in paths)])
print(json.dumps({'source': 'Python %s glob.translate(recursive=True, include_hidden=True)' % __import__('sys').version.split()[0], 'paths': paths, 'patterns': out}, ensure_ascii=False, separators=(',', ':')))
