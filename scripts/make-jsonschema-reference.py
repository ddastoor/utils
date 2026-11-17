#!/usr/bin/env python3
"""Writes tests/fixtures/formats/jsonschema.json — verdicts of an INDEPENDENT validator (python-jsonschema 4.x) for
the JSON Schema tab: tests/unit/formats.test.mjs validates every schema / data pair with our formats-schema.wasm
(the Rust jsonschema crate) and expects the same valid / not valid. Data is stored as JSON text (so that 1 and 1.0 stay apart).
  - hand-written keyword cases across Draft 4, 6, 7, 2019-09 and 2020-12 ($ref and its siblings, $anchor, $id,
    $dynamicRef, $recursiveRef, if / then / else, dependencies, unevaluated*, prefixItems, contains, enum / const);
  - seeded random schemas (types, enum, const, ranges, lengths, simple patterns, properties, required,
    additionalProperties, patternProperties, propertyNames, items, tuples, contains, uniqueItems, allOf / anyOf / oneOf
    / not, if / then / else, $ref into $defs) with random data, for each of the five drafts.
Left out on purpose (python-jsonschema is not the reference there; the unit test has hand-checked answers instead):
"format" (most formats need extra Python packages), regular expressions beyond the simplest (Python's dialect is not
ECMA 262), multipleOf with decimals and huge numbers (Python uses binary floats).
    python3 scripts/make-jsonschema-reference.py        (needs python-jsonschema >= 4.18)
"""
import json, os, random, warnings
from jsonschema import validators
warnings.simplefilter('ignore')
D = {'4': 'http://json-schema.org/draft-04/schema#', '6': 'http://json-schema.org/draft-06/schema#', '7': 'http://json-schema.org/draft-07/schema#',
     '2019': 'https://json-schema.org/draft/2019-09/schema', '2020': 'https://json-schema.org/draft/2020-12/schema'}
HAND = json.loads(r"""[{"name":"d4 exclusiveMinimum bool","schema":{"$schema":"http://json-schema.org/draft-04/schema#","type":"number","minimum":5,"exclusiveMinimum":true},"datas":[5,6,4]},{"name":"d6 exclusiveMinimum number","schema":{"$schema":"http://json-schema.org/draft-06/schema#","exclusiveMinimum":5},"datas":[5,6]},{"name":"d7 exclusiveMinimum number","schema":{"$schema":"http://json-schema.org/draft-07/schema#","exclusiveMinimum":5},"datas":[5,5.0001]},{"name":"d4 no const (ignored)","schema":{"$schema":"http://json-schema.org/draft-04/schema#","const":1},"datas":[2,1]},{"name":"d6 const","schema":{"$schema":"http://json-schema.org/draft-06/schema#","const":1},"datas":[2,1,1.0]},{"name":"d7 if/then/else","schema":{"$schema":"http://json-schema.org/draft-07/schema#","if":{"properties":{"c":{"const":"IN"}}},"then":{"required":["pin"]},"else":{"required":["zip"]}},"datas":[{"c":"IN","pin":"1"},{"c":"IN"},{"c":"US"},{"c":"US","zip":"1"}]},{"name":"d6 if ignored","schema":{"$schema":"http://json-schema.org/draft-06/schema#","if":{"const":1},"then":{"const":2}},"datas":[1]},{"name":"d7 $ref siblings ignored","schema":{"$schema":"http://json-schema.org/draft-07/schema#","definitions":{"s":{"type":"string"}},"properties":{"a":{"$ref":"#/definitions/s","maxLength":1}}},"datas":[{"a":"long"},{"a":5}]},{"name":"2019 $ref siblings apply","schema":{"$schema":"https://json-schema.org/draft/2019-09/schema","$defs":{"s":{"type":"string"}},"properties":{"a":{"$ref":"#/$defs/s","maxLength":1}}},"datas":[{"a":"long"},{"a":"x"}]},{"name":"2019 dependentRequired","schema":{"$schema":"https://json-schema.org/draft/2019-09/schema","dependentRequired":{"card":["cvv"]}},"datas":[{"card":1},{"card":1,"cvv":2},{}]},{"name":"d7 dependencies","schema":{"$schema":"http://json-schema.org/draft-07/schema#","dependencies":{"card":["cvv"],"x":{"required":["y"]}}},"datas":[{"card":1},{"x":1},{"x":1,"y":1,"card":1,"cvv":1}]},{"name":"2019 unevaluatedProperties","schema":{"$schema":"https://json-schema.org/draft/2019-09/schema","allOf":[{"properties":{"a":{}}}],"properties":{"b":{}},"unevaluatedProperties":false},"datas":[{"a":1,"b":2},{"a":1,"c":3}]},{"name":"2020 unevaluatedProperties + patternProperties","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","patternProperties":{"^x-":{}},"unevaluatedProperties":false},"datas":[{"x-a":1},{"y":1}]},{"name":"2020 unevaluatedItems","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","prefixItems":[{"type":"string"}],"unevaluatedItems":false},"datas":[["a"],["a",1],[]]},{"name":"2020 prefixItems + items","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","prefixItems":[{"type":"string"},{"type":"integer"}],"items":{"type":"boolean"}},"datas":[["a",1,true,false],["a","b"],["a",1,2]]},{"name":"2019 items array + additionalItems","schema":{"$schema":"https://json-schema.org/draft/2019-09/schema","items":[{"type":"string"}],"additionalItems":false},"datas":[["a"],["a",1]]},{"name":"2020 items array is invalid schema?","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","items":[{"type":"string"}]},"datas":[["a"]]},{"name":"recursion tree","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"#/$defs/node","$defs":{"node":{"type":"object","required":["v"],"properties":{"v":{"type":"integer"},"kids":{"type":"array","items":{"$ref":"#/$defs/node"}}},"additionalProperties":false}}},"datas":[{"v":1,"kids":[{"v":2,"kids":[{"v":3}]}]},{"v":1,"kids":[{"v":2,"kids":[{"v":"x"}]}]}]},{"name":"$anchor","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","$defs":{"a":{"$anchor":"pos","type":"integer","minimum":1}},"properties":{"n":{"$ref":"#pos"}}},"datas":[{"n":1},{"n":0}]},{"name":"$id relative ref","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.com/root.json","$defs":{"x":{"$id":"x.json","type":"string"}},"properties":{"a":{"$ref":"x.json"}}},"datas":[{"a":"s"},{"a":1}]},{"name":"$dynamicRef","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.com/tree","$dynamicAnchor":"node","type":"object","properties":{"data":true,"children":{"type":"array","items":{"$dynamicRef":"#node"}}}},"datas":[{"children":[{"data":1}]},{"children":[1]}]},{"name":"2019 $recursiveRef","schema":{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"https://example.com/tree","$recursiveAnchor":true,"type":"object","properties":{"children":{"type":"array","items":{"$recursiveRef":"#"}}}},"datas":[{"children":[{}]},{"children":[1]}]},{"name":"ref to root #","schema":{"$schema":"http://json-schema.org/draft-07/schema#","properties":{"next":{"$ref":"#"}},"required":["v"]},"datas":[{"v":1,"next":{"v":2}},{"v":1,"next":{}}]},{"name":"ref escaping ~1 ~0 %25","schema":{"$schema":"http://json-schema.org/draft-07/schema#","definitions":{"a/b":{"type":"integer"},"c~d":{"type":"string"},"e%f":{"type":"boolean"}},"properties":{"x":{"$ref":"#/definitions/a~1b"},"y":{"$ref":"#/definitions/c~0d"},"z":{"$ref":"#/definitions/e%25f"}}},"datas":[{"x":1,"y":"s","z":true},{"x":"1"},{"y":1},{"z":1}]},{"name":"no $schema","schema":{"type":"object","properties":{"a":{"type":"integer"}}},"datas":[{"a":1},{"a":1.5},{"a":1.0}]},{"name":"integer 1.0 d4","schema":{"$schema":"http://json-schema.org/draft-04/schema#","type":"integer"},"datas":[1.0,1]},{"name":"integer 1.0 d7","schema":{"$schema":"http://json-schema.org/draft-07/schema#","type":"integer"},"datas":[1.0,100.0,1.5]},{"name":"enum types","schema":{"enum":[1,"1",null,[1],{"a":1},true]},"datas":[1.0,"1",null,[1.0],{"a":1},true,0,false,[1,2]]},{"name":"const number eq","schema":{"const":1},"datas":[1.0,true]},{"name":"const 0 vs false","schema":{"const":0},"datas":[false,0,0.0,-0.0]},{"name":"uniqueItems","schema":{"uniqueItems":true},"datas":[[1,1.0],[1,true],[0,false],[{"a":1,"b":2},{"b":2,"a":1}],["a","A"],[[1],[1]]]},{"name":"minLength unicode","schema":{"minLength":2,"maxLength":2},"datas":["\ud83d\ude00\ud83d\ude00","\ud83d\ude00","\u00e9\u0301","ab"]},{"name":"propertyNames","schema":{"propertyNames":{"pattern":"^[a-z]+$"}},"datas":[{"ab":1},{"A":1}]},{"name":"contains min/max","schema":{"$schema":"https://json-schema.org/draft/2019-09/schema","contains":{"type":"integer"},"minContains":2,"maxContains":3},"datas":[[1,"a",2],[1],[1,2,3,4],[]]},{"name":"minContains 0","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","contains":{"type":"integer"},"minContains":0},"datas":[[],["a"]]},{"name":"oneOf","schema":{"oneOf":[{"type":"integer"},{"minimum":2}]},"datas":[1,3,2.5,"x"]},{"name":"anyOf/not","schema":{"anyOf":[{"type":"string"},{"not":{"type":"integer"}}]},"datas":["s",1.5,1]},{"name":"required + additionalProperties + pattern","schema":{"type":"object","required":["a"],"properties":{"a":{}},"patternProperties":{"^x_":{}},"additionalProperties":{"type":"integer"}},"datas":[{"a":1,"x_y":"s","z":1},{"a":1,"z":"s"},{"z":1}]},{"name":"nested error path","schema":{"properties":{"a":{"type":"array","items":{"properties":{"b c":{"type":"integer"},"d/e":{"type":"integer"},"f~g":{"type":"integer"}}}}}},"datas":[{"a":[{},{"b c":"x","d/e":"y","f~g":"z"}]}]},{"name":"bool schema true/false","schema":true,"datas":[1]},{"name":"bool schema false","schema":false,"datas":[1]},{"name":"empty schema","schema":{},"datas":[null,1,"x"]},{"name":"type array","schema":{"type":["string","null"]},"datas":[null,"s",1]},{"name":"type number accepts int","schema":{"type":"number"},"datas":[1,1.5,"1"]},{"name":"minProperties etc","schema":{"minProperties":1,"maxProperties":2},"datas":[{},{"a":1},{"a":1,"b":2,"c":3}]},{"name":"default/readOnly/annotations ignored","schema":{"default":5,"readOnly":true,"examples":[1],"title":"t","description":"d","$comment":"c","deprecated":true},"datas":["x"]},{"name":"contentEncoding ignored","schema":{"contentEncoding":"base64","contentMediaType":"application/json"},"datas":["!!!notbase64"]},{"name":"unknown keyword","schema":{"typo":"x","type":"string"},"datas":["s",1]},{"name":"2020 dependentSchemas","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","dependentSchemas":{"a":{"required":["b"]}}},"datas":[{"a":1},{"a":1,"b":1}]},{"name":"2020 $defs unused invalid subschema","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","$defs":{"x":{"type":"strng"}},"type":"integer"},"datas":[1]},{"name":"2020 vocabulary","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","$vocabulary":{"https://json-schema.org/draft/2020-12/vocab/core":true}},"datas":[1]},{"name":"d4 id vs $id","schema":{"$schema":"http://json-schema.org/draft-04/schema#","id":"http://x/y","definitions":{"a":{"id":"#foo","type":"integer"}},"properties":{"p":{"$ref":"#foo"}}},"datas":[{"p":1},{"p":"x"}]},{"name":"http 2020 (not https)","schema":{"$schema":"http://json-schema.org/draft/2020-12/schema","type":"string"},"datas":["s",1]},{"name":"d7 without #","schema":{"$schema":"http://json-schema.org/draft-07/schema","type":"string","if":{"const":"a"},"then":{"minLength":5}},"datas":["a","b"]},{"name":"invalid: type typo","schema":{"type":"strng"},"datas":["s"]},{"name":"invalid: minimum string","schema":{"minimum":"5"},"datas":[6]},{"name":"invalid: required not array","schema":{"required":"a"},"datas":[{}]},{"name":"invalid: bad regex","schema":{"pattern":"(("},"datas":["x"]},{"name":"invalid: properties array","schema":{"properties":[]},"datas":[{}]},{"name":"maxLength float","schema":{"maxLength":2.0},"datas":["abc","ab"]},{"name":"minimum big","schema":{"minimum":1e+308},"datas":[1.7e+308,1]}]""")
rnd = random.Random(20261117)
KEYS = ['a', 'b', 'c', 'd']
STR = ['', 'a', 'ab', 'abc', 'x1', '42', 'Pune', 'b2b']
SCALARS = [None, True, False, 0, 1, 2, 3, -1, 5, 10, 1.5, 2.0] + STR


def scalar():
    return rnd.choice(SCALARS)


def data(depth=0):
    k = rnd.random()
    if depth > 2 or k < 0.45:
        return scalar()
    if k < 0.75:
        return {key: data(depth + 1) for key in rnd.sample(KEYS, rnd.randrange(0, 4))}
    return [data(depth + 1) for _ in range(rnd.randrange(0, 4))]


def leaf(draft):
    k = rnd.randrange(9)
    if k == 0:
        return {'type': rnd.choice(['null', 'boolean', 'integer', 'number', 'string', 'array', 'object'])}
    if k == 1:
        return {'type': rnd.sample(['null', 'boolean', 'integer', 'number', 'string', 'array', 'object'], 2)}
    if k == 2:
        return {'enum': [scalar() for _ in range(rnd.randrange(1, 4))]}
    if k == 3 and draft != '4':
        return {'const': rnd.choice([scalar(), [1], {'a': 1}])}
    if k == 4:
        lo = rnd.randrange(-1, 4)
        s = {'type': rnd.choice(['integer', 'number']), 'minimum': lo}
        if rnd.random() < 0.5:
            s['maximum'] = lo + rnd.randrange(0, 4)
        if rnd.random() < 0.3:
            s['multipleOf'] = rnd.choice([1, 2, 3, 5])
        if rnd.random() < 0.3:
            if draft == '4':
                s['exclusiveMinimum'] = True
            else:
                s['exclusiveMinimum'] = s.pop('minimum')
        return s
    if k == 5:
        s = {'type': 'string', 'minLength': rnd.randrange(0, 3)}
        if rnd.random() < 0.5:
            s['maxLength'] = s['minLength'] + rnd.randrange(0, 3)
        if rnd.random() < 0.4:
            s['pattern'] = rnd.choice(['^a', 'b$', '^[0-9]+$', 'x', '^[a-z]*$'])
        return s
    if k == 6 and draft != '4':
        return rnd.random() < 0.7
    return {}


def schema(depth, draft, defs):
    if depth > 2 or rnd.random() < 0.3:
        return leaf(draft)
    k = rnd.randrange(8)
    sub = lambda: schema(depth + 1, draft, defs)
    if k == 0 or k == 1:
        s = {'type': 'object'} if rnd.random() < 0.6 else {}
        s['properties'] = {key: sub() for key in rnd.sample(KEYS, rnd.randrange(1, 4))}
        if rnd.random() < 0.6:
            s['required'] = rnd.sample(KEYS, rnd.randrange(1, 3))
        r = rnd.random()
        if r < 0.3:
            s['additionalProperties'] = False
        elif r < 0.5:
            s['additionalProperties'] = sub()
        if rnd.random() < 0.2:
            s['patternProperties'] = {rnd.choice(['^a', '^[cd]$']): sub()}
        if rnd.random() < 0.15 and draft != '4':
            s['propertyNames'] = {'pattern': rnd.choice(['^[abc]$', '^[a-z]$'])}
        if rnd.random() < 0.15:
            s[rnd.choice(['minProperties', 'maxProperties'])] = rnd.randrange(0, 3)
        if rnd.random() < 0.15:
            if draft in ('2019', '2020'):
                s['dependentRequired'] = {'a': ['b']}
            else:
                s['dependencies'] = {'a': ['b']}
        return s
    if k == 2:
        s = {'type': 'array'} if rnd.random() < 0.6 else {}
        r = rnd.random()
        if r < 0.5:
            s['items'] = sub()
        elif r < 0.75:
            if draft == '2020':
                s['prefixItems'] = [sub(), sub()]
                if rnd.random() < 0.5:
                    s['items'] = rnd.choice([False, sub()]) 
            else:
                s['items'] = [sub(), sub()]
                if rnd.random() < 0.5:
                    s['additionalItems'] = rnd.choice([False, sub()]) if draft != '4' else sub()
        if rnd.random() < 0.3:
            s['minItems'] = rnd.randrange(0, 3)
        if rnd.random() < 0.3:
            s['maxItems'] = rnd.randrange(1, 4)
        if rnd.random() < 0.3:
            s['uniqueItems'] = True
        if rnd.random() < 0.25 and draft != '4':
            s['contains'] = sub()
            if draft in ('2019', '2020') and rnd.random() < 0.5:
                s[rnd.choice(['minContains', 'maxContains'])] = rnd.randrange(0, 3)
        return s
    if k == 3:
        return {rnd.choice(['allOf', 'anyOf', 'oneOf']): [sub() for _ in range(rnd.randrange(1, 4))]}
    if k == 4:
        return {'not': sub()}
    if k == 5 and draft in ('7', '2019', '2020'):
        s = {'if': sub()}
        if rnd.random() < 0.8:
            s['then'] = sub()
        if rnd.random() < 0.6:
            s['else'] = sub()
        return s
    if k == 6 and defs:
        return {'$ref': ('#/$defs/' if draft in ('2019', '2020') else '#/definitions/') + rnd.choice(list(defs))}
    if k == 7 and draft in ('2019', '2020'):
        return {'allOf': [{'properties': {'a': sub()}}], 'properties': {'b': sub()}, 'unevaluatedProperties': False}
    return leaf(draft)


def verdict(sch, value):
    cls = validators.validator_for(sch, default=validators.Draft202012Validator)
    return cls(sch).is_valid(value)


out = []
for c in HAND:
    cls = validators.validator_for(c['schema'], default=validators.Draft202012Validator)
    try:
        cls.check_schema(c['schema'])
    except Exception:
        out.append({'name': c['name'], 'schema': c['schema'], 'invalid': True, 'cases': []})   # a schema that is itself not valid
        continue
    out.append({'name': c['name'], 'schema': c['schema'], 'cases': [[json.dumps(d), verdict(c['schema'], d)] for d in c['datas']]})
count = {True: 0, False: 0}
for draft in D:
    made = 0
    while made < 130:
        defs = {'p': None, 'q': None}
        for name in defs:
            defs[name] = schema(1, draft, {})
        sch = schema(0, draft, defs)
        if not isinstance(sch, dict):
            continue
        sch = {'$schema': D[draft], **sch, ('$defs' if draft in ('2019', '2020') else 'definitions'): defs}
        try:
            validators.validator_for(sch).check_schema(sch)
        except Exception:
            continue
        cases = []
        for _ in range(8):
            v = data()
            ok = verdict(sch, v)
            count[ok] += 1
            cases.append([json.dumps(v), ok])                 # the data as JSON text: 2 and 2.0 are different things in Draft 4
        if all(ok for _, ok in cases) and rnd.random() < 0.8:
            continue                              # a schema that accepts everything teaches little: keep only a few
        out.append({'name': f'random Draft {draft} #{made}', 'schema': sch, 'cases': cases})
        made += 1
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures', 'formats', 'jsonschema.json')
with open(dest, 'w', encoding='utf-8') as f:
    f.write('[\n' + ',\n'.join(json.dumps(c, ensure_ascii=True, separators=(',', ':')) for c in out) + '\n]\n')
n = sum(len(c['cases']) for c in out)
print(len(out), 'schemas,', n, 'pairs,', sum(ok for c in out for _, ok in c['cases']), 'valid →', os.path.normpath(dest), os.path.getsize(dest), 'bytes')
