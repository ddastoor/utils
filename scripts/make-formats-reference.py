#!/usr/bin/env python3
"""Writes tests/fixtures/formats/reference.json — texts that OTHER programs wrote, with the data they stand for, for
the reader side of the YAML ⇄ JSON ⇄ TOML tab (tests/unit/formats.test.mjs converts each text to JSON with our
formats-yaml.wasm and expects exactly that data):
  yaml:  seeded random documents written by PyYAML (block style, flow style, mixed, escaped non-ASCII, long lines
         folded at 80 columns, explicit "? key" entries) and by ruamel.yaml (YAML 1.2), plus hand-written real-world
         files (Kubernetes with anchors and merge keys, docker-compose, a GitHub Actions workflow, block scalars,
         several documents) whose data is what ruamel.yaml (YAML 1.2, pure Python) reads;
  toml:  seeded random tables written by tomli_w and by the older `toml` package, plus Cargo.toml / pyproject.toml
         style files whose data is what Python's tomllib reads.
Data is stored "typed" (see tests/lib/formats_check.py): 1, 1.0 and "1" are different things.
    python3 scripts/make-formats-reference.py        (needs PyYAML, ruamel.yaml, tomli_w, toml; Python 3.11+)
"""
import io, json, math, os, random, re, sys, datetime
import yaml as pyyaml
from ruamel.yaml import YAML as Ruamel
import tomllib, tomli_w, toml as oldtoml

rnd = random.Random(20261117)
WORDS = ['name', 'id', 'tags', 'items', 'port', 'host', 'enabled', 'spec', 'meta', 'env', 'value', 'list', 'image', 'replicas', 'labels', 'app', 'tier',
         'a b', 'k-1', 'k_2', 'x', 'title', 'owner', 'path', 'url']
PLAIN = ['Pune', 'chai', 'hello world', 'v2', 'dev', 'https://example.com/a?b=c', 'x: y', 'नमस्ते', 'café', '日本語', 'a, b', '/usr/local/bin', 'C:\\dir', '50%', 'it\'s', '"quoted"',
         'line one\nline two\n', 'two\nlines', 'tab\there', ' padded ', '', '#hash', 'a #b', '- dash', '[x]', '{y}', '@at', '!bang', '*star', '&and', '|', '>', '%', '`',
         'word ' * 40, 'emoji 😀', 'trailing:', 'key: value', '...', '---', 'a\\b', "'", '"', 'null', 'true', 'false', '~', '1', '1.5', '-3', '1e3', '0x1F', '0o17', '.5', '.inf', '.nan',
         'yes', 'no', 'on', 'off', 'y', 'n', 'Yes', 'NO', 'Null', 'TRUE', '010', '1_000', '1:30', '+1', '2026-01-01']
# strings on which YAML 1.1 and YAML 1.2 disagree when they are written without quotes: only ruamel (1.2) may write them
V11 = {'yes', 'no', 'on', 'off', 'y', 'n', 'Yes', 'NO', '010', '1_000', '1:30', '0o17', '2026-01-01', '+1', '0x1F', '.5', '1e3'}


def value(depth, strings, toml=False):
    k = rnd.random()
    if depth > 3 or k < 0.45:
        s = rnd.random()
        if s < 0.5:
            return rnd.choice(strings)
        if s < 0.7:
            return rnd.choice([0, 1, -1, 42, 8080, 2 ** 31, -2 ** 63, 2 ** 63 - 1, 9007199254740993] + ([] if toml else [2 ** 64, 12345678901234567890123]))
        if s < 0.85:
            return rnd.choice([0.0, 1.0, 1.5, -2.5, 0.1, 1e21, 1e-7, 1.5e300, 3.141592653589793, 100.0, 123456789.12345679])
        if s < 0.95 or toml:
            return rnd.random() < 0.5
        return None
    if k < 0.75:
        d = {}
        for _ in range(rnd.randrange(5)):
            d[rnd.choice(WORDS) if rnd.random() < 0.7 else rnd.choice(strings)] = value(depth + 1, strings, toml)
        return d
    return [value(depth + 1, strings, toml) for _ in range(rnd.randrange(5))]


def tag(x):
    if x is None or isinstance(x, (bool, str)):
        return x
    if isinstance(x, int):
        return x if abs(x) <= 2 ** 53 else {'$int': str(x)}
    if isinstance(x, float):
        return {'$float': 'nan'} if math.isnan(x) else {'$float': 'inf' if x > 0 else '-inf'} if math.isinf(x) else {'$f': x}
    if isinstance(x, (datetime.datetime, datetime.date, datetime.time)):
        return {'$date': x.isoformat()}
    if isinstance(x, list):
        return [tag(v) for v in x]
    return {'$map': [[tag(k), tag(v)] for k, v in x.items()]}


def ruamel_dump(data, flow):
    y = Ruamel(typ='safe', pure=True)
    y.default_flow_style = flow
    b = io.StringIO()
    y.dump(data, b)
    return b.getvalue()


out = {'yaml': [], 'toml': []}
safe11 = [s for s in PLAIN if s not in V11]
for i in range(120):
    data = value(0, safe11)
    style = [dict(default_flow_style=False), dict(default_flow_style=True), dict(default_flow_style=None), dict(default_flow_style=False, allow_unicode=True),
             dict(default_flow_style=False, indent=4, width=40), dict(default_flow_style=False, explicit_start=True, explicit_end=True)][i % 6]
    out['yaml'].append({'by': 'PyYAML ' + ' '.join(f'{k}={v}' for k, v in style.items()), 'text': pyyaml.safe_dump(data, **{'sort_keys': False, **style}), 'typed': tag(data)})
for i in range(120):
    data = value(0, PLAIN)
    # ruamel's safe dumper sorts the keys of every mapping: "unordered" = compare without regard to key order
    out['yaml'].append({'by': f'ruamel.yaml flow={i % 3 == 2}', 'text': ruamel_dump(data, i % 3 == 2), 'typed': tag(data), 'unordered': True})
for i in range(100):
    data = {rnd.choice(WORDS): value(1, PLAIN, toml=True) for _ in range(1 + rnd.randrange(6))}
    try:
        text = tomli_w.dumps(data, multiline_strings=(i % 2 == 0))
    except Exception:
        continue
    assert tomllib.loads(text) == data
    out['toml'].append({'by': 'tomli_w', 'text': text, 'typed': tag(data)})
for i in range(60):
    data = {rnd.choice(WORDS): value(1, [s for s in PLAIN if '\n' not in s and '\t' not in s and '\\' not in s], toml=True) for _ in range(1 + rnd.randrange(6))}
    try:
        text = oldtoml.dumps(data)
        back = tomllib.loads(text)
    except Exception:
        continue                    # the old package cannot write some data, and writes a few things modern TOML refuses
    if back == data:
        out['toml'].append({'by': 'toml 0.10', 'text': text, 'typed': tag(data)})

# ---- hand-written files; their data = what the reference parser reads
YAML_FILES = {
    'kubernetes deployment (anchors, merge keys)': '''# Deployment and its service
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chai-shop
  labels: &labels
    app: chai
    tier: web
spec:
  replicas: 3
  selector:
    matchLabels: *labels
  template:
    metadata:
      labels:
        <<: *labels
        version: "1.10"
    spec:
      containers:
        - name: web
          image: "registry.example.in/chai:1.4.2"
          ports:
            - containerPort: 8080
          env:
            - {name: TZ, value: Asia/Kolkata}
            - name: DEBUG
              value: "false"
          resources:
            limits: {cpu: 500m, memory: 256Mi}
''',
    'docker-compose (port strings, lists of strings)': '''services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
      - "443:443"
    environment:
      - KEY=value
      - EMPTY=
    depends_on: [db]
    command: ["nginx", "-g", "daemon off;"]
  db:
    image: postgres:17
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data: {}
''',
    'github actions workflow (the key "on", a multi-line script)': '''name: build
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run
        run: |
          npm ci
          npm test -- --watch=false
      - name: Folded
        run: >-
          echo one
          two
''',
    'block scalars and chomping': 'lit: |\n  line1\n  line2\nfold: >\n  a\n  b\n\n  c\nstrip: |-\n  x\nkeep: |+\n  y\n\nind: |2\n    deep\nempty: ""\nplain: multi\n  line plain\n',
    'three documents': 'a: 1\n---\n- x\n- y\n---\njust text\n',
    'flow collections, quoting and escapes': '{a: [1, 2, {b: c}], "q": \'s\', "esc": "\\u00e9\\x41\\n\\t", \'it\'\'s\': "say \\"hi\\""}\n',
    'numbers and nulls': 'int: 42\nneg: -7\nhex: 0x1F\noct: 0o17\nfloat: 1.5\nexp: 1.5e3\nbig: 12345678901234567890\nbigger: 123456789012345678901234567890\nnull1: ~\nnull2: null\nnull3:\ntrue1: true\ntrue2: True\nstr1: "42"\nstr2: \'1.5\'\n',
    'comments, document markers, a directive': '%YAML 1.2\n---\n# comment\na: 1 # trailing\nb: "x # not a comment"\nc: [1, 2] # more\n...\n',
    'windows line ends and a byte-order mark': '\ufeffa: 1\r\nb:\r\n  - x\r\n  - y\r\n',
    'nested sequences and empty values': '- - 1\n  - 2\n- - a: 1\n    b: 2\n  - []\n- {}\n- ""\n-\n',
}
y12 = Ruamel(typ='safe', pure=True)
for name, text in YAML_FILES.items():
    docs = list(y12.load_all(text))
    out['yaml'].append({'by': f'file: {name}', 'text': text, 'typed': tag(docs[0]) if len(docs) == 1 else [tag(d) for d in docs]})
TOML_FILES = {
    'Cargo.toml': '''[package]
name = "formats"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib"]

[dependencies]
serde = "1.0"
serde_json = { version = "1", features = ["preserve_order"] }
toml = { version = "1.2", optional = true }

[features]
yaml = ["dep:toml"]

[profile.release]
opt-level = "s"
lto = true
''',
    'pyproject.toml (dotted keys, arrays of tables, multi-line strings)': '''[project]
name = "demo"
dynamic = ["version"]
requires-python = ">=3.11"
dependencies = [
  "requests>=2",
  'tomli; python_version < "3.11"',
]
description = """
Two lines
of text"""
raw = \'\'\'C:\\dir\\no\\escapes\'\'\'

[project.urls]
Home = "https://example.in"

[tool.ruff.lint]
select = ["E", "F"]
"per-file-ignores" = { "tests/*" = ["S101"] }

[[tool.mypy.overrides]]
module = "a.*"
ignore_errors = true

[[tool.mypy.overrides]]
module = "b"
''',
    'numbers, keys and inline tables': 'hex = 0xDEADBEEF\noct = 0o755\nbin = 0b11\nbig = 9_223_372_036_854_775_807\nneg = -9223372036854775808\nflt = 1.5\nexp = 5e+22\nunder = 1_000.5\n"quoted key" = 1\n"" = 2\n1234 = "bare digits"\na.b.c = 3\npoint = { x = 1, y = { z = [1, "two", 3.0, true] } }\nempty = []\nnested = [[1, 2], ["a"]]\n',
}
for name, text in TOML_FILES.items():
    out['toml'].append({'by': f'file: {name}', 'text': text, 'typed': tag(tomllib.loads(text))})

dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures', 'formats', 'reference.json')
os.makedirs(os.path.dirname(dest), exist_ok=True)
with open(dest, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=True, separators=(',', ':'))
    f.write('\n')
print(len(out['yaml']), 'YAML texts,', len(out['toml']), 'TOML texts →', os.path.normpath(dest), os.path.getsize(dest), 'bytes')
