#!/usr/bin/env python3
"""Writes tests/fixtures/python/reference.json: what NATIVE CPython prints for the programs in
tests/fixtures/python/cases/*.py — stdout, stderr and the exit status of each. tests/unit/python.test.mjs runs the
same programs in our WebAssembly build (python.wasm + python314.zip through our WASI host) and expects the same,
byte for byte.

Must be run with the same CPython version as the build (3.14.8) — the native interpreter that wasm/python/build.sh
builds first is one:      $WORK/native/python scripts/make-python-reference.py

A case file is a list of programs; a line "# ==== name | key=value | …" starts one. Keys: tz (IANA zones, comma
separated: one run per zone, TZ in the environment), stdin (JSON string), files (JSON object name → text),
err=skip (stderr is not compared: it holds something that differs by platform).
Each program runs as main.py in an empty folder; that folder's path is replaced by /home/user in what is recorded.
"""
import glob, json, os, subprocess, sys, tempfile, shutil

assert sys.version_info[:3] == (3, 14, 8), f"run this with CPython 3.14.8 (this is {sys.version.split()[0]})"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
cases = []
for path in sorted(glob.glob(os.path.join(ROOT, 'tests', 'fixtures', 'python', 'cases', '*.py'))):
    cur = None
    for line in open(path, encoding='utf-8').read().split('\n'):
        if line.startswith('# ==== '):
            parts = [p.strip() for p in line[7:].split(' | ')]
            cur = {'name': parts[0], 'file': os.path.basename(path), 'code': []}
            for kv in parts[1:]:
                k, v = kv.split('=', 1)
                cur[k] = v if k in ('tz', 'err') else json.loads(v)
            cases.append(cur)
        elif cur is not None:
            cur['code'].append(line)
out = []
for c in cases:
    code = '\n'.join(c['code']).strip('\n') + '\n'
    for tz in (c.get('tz') or 'UTC').split(','):
        d = tempfile.mkdtemp(prefix='pyref-')
        try:
            with open(os.path.join(d, 'main.py'), 'w', encoding='utf-8') as f:
                f.write(code)
            for name, text in (c.get('files') or {}).items():
                with open(os.path.join(d, name), 'w', encoding='utf-8', newline='') as f:
                    f.write(text)
            env = {'PYTHONUTF8': '1', 'PYTHONDONTWRITEBYTECODE': '1', 'HOME': d, 'PWD': d, 'LANG': 'C.UTF-8', 'TZ': tz, 'COLUMNS': '80', 'PATH': '/nonexistent'}
            r = subprocess.run([sys.executable, '-u', 'main.py'], cwd=d, env=env, input=(c.get('stdin') or '').encode(), capture_output=True, timeout=120)
            fix = lambda b: b.decode('utf-8').replace(os.path.realpath(d), '/home/user').replace(d, '/home/user')
            e = {'name': c['name'] + (f' [{tz}]' if 'tz' in c else ''), 'file': c['file'], 'code': code, 'out': fix(r.stdout), 'err': None if c.get('err') == 'skip' else fix(r.stderr), 'rc': r.returncode}
            for k in ('stdin', 'files'):
                if k in c:
                    e[k] = c[k]
            if 'tz' in c:
                e['tz'] = tz
            out.append(e)
        finally:
            shutil.rmtree(d, ignore_errors=True)
dest = os.path.join(ROOT, 'tests', 'fixtures', 'python', 'reference.json')
with open(dest, 'w', encoding='utf-8') as f:
    json.dump({'python': sys.version.split()[0], 'cases': out}, f, ensure_ascii=False, indent=0)
    f.write('\n')
print(len(out), 'programs →', os.path.normpath(dest), os.path.getsize(dest), 'bytes')
for e in out:
    if e['rc'] and not e['name'].startswith(('uncaught', 'sys-exit', 'assert', 'int-str')):
        print('  exit', e['rc'], e['name'], '|', (e['err'] or e['out']).strip().split('\n')[-1][:200])
