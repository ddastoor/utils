// formats-yaml.wasm / formats-schema.wasm (Rust, built by us): YAML 1.2 features (anchors, merge keys, block scalars,
// multi-document), TOML ⇄ JSON (dates, arrays of tables), error positions, JSON Schema validation (draft 2020-12 and 7
// keywords, formats, $ref) and schema inference.
export default async (t, { load, wasm }) => {
  const { bindFormats } = await load('/src/wasm/formats.ts');
  const y = bindFormats(await wasm('formats-yaml')), sc = bindFormats(await wasm('formats-schema'));
  const cv = (text, from, to, indent = 2) => y.call('convert', { text, from, to, indent }).out;
  const err = (f) => { try { f(); return null; } catch (e) { return e; } };
  t.eq(JSON.parse(cv('name: Asha\nage: 30\ntags: [a, b]\nok: true\nnone: ~\n', 'yaml', 'json')), { name: 'Asha', age: 30, tags: ['a', 'b'], ok: true, none: null }, 'YAML → JSON basics');
  const m = JSON.parse(cv('base: &b {x: 1, y: 2}\nchild:\n  <<: *b\n  y: 3\nref: *b\n', 'yaml', 'json'));
  t.eq([m.child.x, m.child.y, m.ref, m.base], [1, 3, { x: 1, y: 2 }, { x: 1, y: 2 }], 'anchors, aliases and << merge keys (own keys win)');
  t.eq(JSON.parse(cv('lit: |\n  line1\n  line2\nfold: >\n  a\n  b\n', 'yaml', 'json')), { lit: 'line1\nline2\n', fold: 'a b\n' }, 'block scalars | and >');
  t.eq(JSON.parse(cv('a: 1\n---\nb: 2\n', 'yaml', 'json')), [{ a: 1 }, { b: 2 }], 'two YAML documents → a JSON array');
  t.eq(JSON.parse(cv('v: 1.0\nn: 0x1F\no: 0o17\ns: "yes"\nb: yes\n', 'yaml', 'json')), { v: 1, n: 31, o: 15, s: 'yes', b: 'yes' }, 'YAML 1.2 core schema: hex/octal ints, "yes" stays a string');
  const e1 = err(() => cv('a: 1\n b: 2\nc: [1, 2\n', 'yaml', 'json')); t.ok(e1 && e1.line === 2, `YAML error with a line number (${e1?.message} @ ${e1?.line}:${e1?.column})`);
  t.eq(cv('{"name":"Asha","items":[{"sku":"A","qty":2},{"sku":"B","qty":1}],"meta":{"v":1}}', 'json', 'yaml'), 'name: Asha\nitems:\n- sku: A\n  qty: 2\n- sku: B\n  qty: 1\nmeta:\n  v: 1\n', 'JSON → YAML');
  const toml = cv('{"title":"Shop","owner":{"name":"Asha","dob":"1990-05-27"},"products":[{"name":"Tea","price":120.5},{"name":"Coffee","price":250}]}', 'json', 'toml');
  t.ok(toml.includes('title = "Shop"') && toml.includes('[owner]') && toml.includes('[[products]]') && toml.includes('price = 120.5'), `JSON → TOML with a table and an array of tables:\n${toml}`);
  t.eq(JSON.parse(cv(toml, 'toml', 'json')), { title: 'Shop', owner: { name: 'Asha', dob: '1990-05-27' }, products: [{ name: 'Tea', price: 120.5 }, { name: 'Coffee', price: 250 }] }, 'TOML → JSON round trip, key order kept');
  t.eq(JSON.parse(cv('d = 1979-05-27T07:32:00Z\nl = 1979-05-27\n', 'toml', 'json')), { d: '1979-05-27T07:32:00Z', l: '1979-05-27' }, 'TOML dates become strings');
  t.ok(/TOML has no null/.test(err(() => cv('{"a":{"b":null}}', 'json', 'toml'))?.message), 'null cannot go to TOML (path named)');
  t.ok(/table .* at the top/.test(err(() => cv('[1,2]', 'json', 'toml'))?.message), 'a top-level list cannot be TOML');
  const e2 = err(() => cv('a = 1\nb = \n', 'toml', 'json')); t.ok(e2 && e2.line === 2, `TOML error position (${e2?.message} @ ${e2?.line}:${e2?.column})`);
  const e3 = err(() => cv('{"a": 1,\n "b": }', 'json', 'yaml')); t.ok(e3 && e3.line === 2, `JSON error position (${e3?.message} @ ${e3?.line}:${e3?.column})`);
  t.eq(cv('{"a":[1,{"b":2}]}', 'json', 'json', 4), '{\n    "a": [\n        1,\n        {\n            "b": 2\n        }\n    ]\n}', 'JSON pretty with 4 spaces');
  t.eq(cv('{"a":[1,2]}', 'json', 'json', 0), '{"a":[1,2]}', 'JSON minified');
  // ---- JSON Schema
  const S = JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['name', 'email', 'age'], properties: { name: { type: 'string', minLength: 2 }, email: { type: 'string', format: 'email' }, age: { type: 'integer', minimum: 18 }, tags: { type: 'array', items: { type: 'string' }, uniqueItems: true }, address: { $ref: '#/$defs/addr' } }, additionalProperties: false, $defs: { addr: { type: 'object', required: ['pin'], properties: { pin: { type: 'string', pattern: '^[1-9][0-9]{5}$' } } } } });
  const val = (data, schema = S) => sc.call('validate', { schema, data: JSON.stringify(data) });
  t.eq(val({ name: 'Asha', email: 'asha@example.in', age: 30, tags: ['a', 'b'], address: { pin: '411001' } }).valid, true, 'valid document');
  const r = val({ name: 'A', email: 'not-an-email', age: 17.5, tags: ['a', 'a'], address: { pin: '011001' }, extra: 1 });
  const paths = r.errors.map((x) => x.path).sort();
  t.ok(!r.valid && ['/address/pin', '/age', '/email', '/name', '/tags'].every((p) => paths.includes(p)) && r.errors.some((x) => /extra/.test(x.message)), `every problem reported with its path (${paths.join(' ')})`);
  t.ok(r.errors.some((x) => /is not a "email"/.test(x.message) || /email/.test(x.message)), 'format "email" is checked');
  t.eq(val({ name: 'Asha', email: 'a@b.in' }).errors.map((x) => x.message).some((m) => /"age" is a required property/.test(m)), true, 'missing required property');
  t.eq(val({ a: 1 }, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', properties: { a: { exclusiveMinimum: 1 } } })).valid, false, 'draft-07 exclusiveMinimum as a number');
  t.ok(/schema itself is invalid/.test(err(() => val({}, JSON.stringify({ type: 'nope' })))?.message), 'invalid schema reported');
  const inf = sc.call('infer', { data: JSON.stringify({ id: 1, name: 'Asha', email: 'asha@example.in', price: 12.5, when: '2026-11-16T10:00:00Z', items: [{ sku: 'A', qty: 1 }, { sku: 'B' }], tags: [] }) }).schema;
  t.eq([inf.type, inf.properties.id.type, inf.properties.price.type, inf.properties.email.format, inf.properties.when.format, inf.properties.items.items.required], ['object', 'integer', 'number', 'email', 'date-time', ['sku']], 'inferred schema: types, formats, required only where always present');
  t.eq(val(JSON.parse('{"id":1,"name":"Asha","email":"asha@example.in","price":12.5,"when":"2026-11-16T10:00:00Z","items":[{"sku":"A","qty":1},{"sku":"B"}],"tags":[]}'), JSON.stringify(inf)).valid, true, 'the sample validates against its inferred schema');
};
