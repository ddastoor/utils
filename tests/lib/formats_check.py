#!/usr/bin/env python3
"""Independent readers for what our YAML ⇄ JSON ⇄ TOML tab writes (used by tests/unit/formats.test.mjs when
python3 has the libraries; each one is optional):
  PyYAML        — a YAML 1.1 parser (yes / no / on / off are booleans, 010 is octal, 1:30 is base 60, dates are dates)
  ruamel.yaml   — a YAML 1.2 parser
  tomllib       — Python's own TOML parser
stdin:  {"cases": [{"id": "...", "kind": "yaml" | "toml", "text": "..."}]}
stdout: {"have": {...}, "results": {id: {"pyyaml": X, "ruamel": X, "tomllib": X}}}
X is the parsed value with its types spelled out, so that the test can tell 1 from 1.0 from "1":
  null, true, "text", small integers as they are, {"$int": "digits"} beyond 2^53, {"$f": 1.5} for floats,
  {"$float": "nan" | "inf" | "-inf"}, {"$date": "ISO text"}, lists, {"$map": [[key, value], …]} (order kept),
  {"$docs": […]} when a YAML text holds several documents, {"$error": "…"} when the parser refuses the text.
"""
import sys, json, math, datetime

have = {}
try:
    import yaml as pyyaml
    have['pyyaml'] = True
except Exception:
    have['pyyaml'] = False
try:
    from ruamel.yaml import YAML as RuamelYAML
    have['ruamel'] = True
except Exception:
    have['ruamel'] = False
try:
    import tomllib
    have['tomllib'] = True
except Exception:
    have['tomllib'] = False


def tag(x):
    if x is None or isinstance(x, (bool, str)):
        return x
    if isinstance(x, int):
        return x if abs(x) <= 2 ** 53 else {'$int': str(x)}
    if isinstance(x, float):
        if math.isnan(x):
            return {'$float': 'nan'}
        if math.isinf(x):
            return {'$float': 'inf' if x > 0 else '-inf'}
        return {'$f': x}
    if isinstance(x, (datetime.datetime, datetime.date, datetime.time)):
        return {'$date': x.isoformat()}
    if isinstance(x, (list, tuple)):
        return [tag(v) for v in x]
    if isinstance(x, dict):
        return {'$map': [[tag(k), tag(v)] for k, v in x.items()]}
    if isinstance(x, (bytes, bytearray)):
        return {'$bytes': bytes(x).hex()}
    if isinstance(x, (set, frozenset)):
        return {'$set': sorted(repr(v) for v in x)}
    return {'$other': repr(x)}


def docs(parsed):
    parsed = list(parsed)
    return tag(parsed[0]) if len(parsed) == 1 else {'$docs': [tag(d) for d in parsed]}


def run(case):
    out = {}
    text = case['text']
    if case['kind'] == 'yaml':
        if have['pyyaml']:
            try:
                out['pyyaml'] = docs(pyyaml.safe_load_all(text))
            except Exception as e:
                out['pyyaml'] = {'$error': str(e)[:200]}
        if have['ruamel']:
            try:
                y = RuamelYAML(typ='safe', pure=True)
                out['ruamel'] = docs(y.load_all(text))
            except Exception as e:
                out['ruamel'] = {'$error': str(e)[:200]}
    elif have['tomllib']:
        try:
            out['tomllib'] = tag(tomllib.loads(text))
        except Exception as e:
            out['tomllib'] = {'$error': str(e)[:200]}
    return out


req = json.load(sys.stdin)
json.dump({'have': have, 'results': {c['id']: run(c) for c in req['cases']}}, sys.stdout)
