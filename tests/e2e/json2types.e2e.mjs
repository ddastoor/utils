// JSON → Types (#/json2types, PC only): the code this tab generates (our Rust engine devcore-j2t) for 36 awkward
// samples is given to the real tools — TypeScript (tsc --strict, the sample assigned to the type), Go (go run:
// json.Decoder with DisallowUnknownFields, then marshal and compare), Rust (cargo: serde deserialise, serialise and
// compare), Java (javac), Python (classes defined with warnings as errors, annotations resolved, the dataclass built
// from the sample). Samples: top-level lists and plain values, colliding / reserved / non-Latin / odd keys, type names
// that shadow built-ins, optional vs nullable, unions, numbers beyond 64 bits, keys Go cannot tag, control and bidi
// characters in keys, deep nesting, duplicate keys. Plus the tab itself: languages, notes, errors, root name, download.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from '../lib/child.mjs';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setValue, notes, until } from './_devdata.mjs';

const DEF = JSON.stringify({ id: 101, customer: { name: 'Asha Rao', email: 'asha@example.in', vip: true }, items: [{ sku: 'TEA-1', qty: 2, price: 120.5 }, { sku: 'SPC-9', qty: 1, price: 950, note: 'gift wrap' }], deliveredAt: null, tags: ['online', 'repeat'] }, null, 2);
const CASES = {
  toparray: '[{"id":1,"name":"a"},{"id":2}]',
  collide: '{"user_id":1,"userId":2,"UserID":3}',
  nonlatin: '{"नाम":"x","शहर":"y"}',
  reserved: '{"class":"a","default":1,"package":"p","new":true,"abstract":"x","final":true,"yield":1.5,"async":true,"const":1,"static":2,"for":1,"if":2,"return":3,"is":1,"with":2,"lambda":3,"enum":"e","try":1,"await":2,"override":true,"type":"t","self":1,"Self":2,"fn":3,"None":4,"True":5,"import":6,"goto":7,"int":8}',
  shadow: '{"list":[{"dt":1}],"string":{"a":"x"},"option":{"size":"L"},"note":null,"name":"n","tags":["a"],"vec":{"v":1},"map":{"m":1},"any":{"z":1},"object":{"o":1},"date":{"d":1},"value":{"v":2}}',
  pyorder: '{"items":[{"sku":"a","note":"x","qty":1},{"sku":"b","qty":2}]}',
  unions: '{"v":[1,"a",1.5],"w":[1,null,"s"],"x":[[1],["a"]]}',
  bignum: '{"id":18446744073709551615,"n":1e20,"small":3,"huge":123456789012345678901234567890,"neg":-9223372036854775808}',
  gotag: '{"a,b":1,"q\\"uote":2,"back`tick":3,"it\'s":4,"sl\\\\ash":5,"-":6}',
  oddkeys: '{"first-name":"a","2fa":true,"a.b":1," ":2,"":3,"$ref":"x","@type":"t"}',
  nested: '{"m":[[1,2],[3]],"e":[],"o":{},"n":[null],"mixed":[{"a":1},[1],"s"]}',
  arrarrobj: '{"rows":[[{"x":1}],[{"y":2}]]}',
  nullmerge: '{"a":[{"x":null},{"x":1},{"x":"s"},{}]}',
  optnull: '[{"x":null,"y":1},{"y":2}]',
  prim: '42',
  anyname: '{"any":{"a":1},"x":null,"value":{"v":1},"object":{"o":1},"z":[1,"a"]}',
  sample: DEF,
  plurals: '{"categories":[{"a":1}],"statuses":[{"b":1}],"people":[{"c":1}],"data":[{"d":1}],"addresses":[{"e":1}],"movies":[{"f":1}],"lineItems":[{"g":1}],"children":[{"h":1}],"boxes":[{"i":1}],"caches":[{"j":1}],"status":[{"k":1}],"heroes":[{"l":1}],"shoes":[{"m":1}]}',
  dupkeys: '{"a":1,"a":"x","b":{"c":1},"b":{"d":2}}',
  sameshape: '{"billing":{"address":{"pin":"1"}},"shipping":{"address":{"pin":"2"}},"other":{"address":{"zip":3}}}',
  emptyroot: '{}',
  nullroot: 'null',
  arrprim: '[1,2.5]',
  strroot: '"x"',
  neguint: '{"v":[-1,18446744073709551615],"u":[1,18446744073709551615]}',
  hindi: '{"हिन्दी":1,"name":2,"名前":"n","größe":1.5,"naïve":true}',
  dashes: '{"a b":2,"x-y":3,"x_y":4}',
  pyprivate: '{"__init__":1,"__x":2,"_y":3,"match":5,"case":6,"field":7,"dataclass":8}',
  optall: '[{"a":1},{},{"b":null}]',
  javaobj: '{"hashCode":1,"toString":"x","getClass":2,"wait":3,"var":4,"record":5,"_":6,"yield":7,"sealed":8}',
  ctrl: '{"line\\nbreak":1,"tab\\there":2,"bidi\\u202eevil":3,"nul\\u0000":4,"u2028\\u2028x":5}',
  deep: '{"a":{"b":{"c":{"d":{"e":[{"f":[{"g":1}]}]}}}}}',
  ordername: '{"order":{"order":{"x":1}},"Order":{"y":2}}',
  kwonly: '[{"x":null,"y":1,"z":"a"},{"y":2},{"x":3,"y":null,"z":"b","w":{}}]',
  floats: '{"price":950,"prices":[1,2.5],"ratio":0.1,"exp":1e3,"neg":-0.0}',
  records: '{"users":[{"id":1,"emails":["a@x.in"],"address":{"city":"Pune","geo":{"lat":18.52,"lng":73.86}}},{"id":2,"emails":[],"address":null}]}',
};
/** What cannot work, and why (everything else must compile, decode the sample and give it back). */
const GO_UNTAGGABLE = ['nonlatin', 'gotag', 'oddkeys', 'hindi', 'ctrl']; // keys with a comma, quote, backtick, combining mark, control character or no characters: encoding/json has no tag for them
const RUST_REFUSES = ['dupkeys']; // serde's derive rejects a key that appears twice
const GO_MERGES = ['dupkeys']; // encoding/json merges the two "b" objects of that sample (a map keeps the last): no round trip to compare
const PY_RENAMED = ['reserved', 'gotag', 'oddkeys', 'dashes', 'pyprivate', 'javaobj', 'ctrl']; // keys that are not Python names: Order(**sample) cannot be used
const LANGS = { go: 'Go', rust: 'Rust (serde)', java: 'Java records', py: 'Python dataclasses', ts: 'TypeScript' };

export default async (ctx) => {
  const { base, page: newPage, ok, tmp, info, download } = ctx;
  const page = await newPage(); await page.goto(`${base}#/json2types`);
  const src = page.locator('textarea').nth(0), out = page.getByLabel('Types'), name = page.getByLabel('Root type name');
  await src.waitFor(); await until(page, () => document.querySelector('textarea[aria-label="Types"]')?.value.length > 0);
  const pick = (label) => page.getByRole('radio', { name: label, exact: true }).click();
  const run = (cmd, args, opts = {}) => { try { return { ok: true, out: execFileSync(cmd, args, { stdio: 'pipe', timeout: 300000, ...opts }).toString() }; } catch (e) { return { ok: false, out: `${e.stderr || ''}${e.stdout || ''}` || e.message, missing: e.code === 'ENOENT' }; } };

  // ---- the tab
  const ts0 = await out.inputValue();
  ok(ts0 === 'export interface Order {\n  id: number;\n  customer: Customer;\n  items: Item[];\n  deliveredAt: null;\n  tags: string[];\n}\n\nexport interface Customer {\n  name: string;\n  email: string;\n  vip: boolean;\n}\n\nexport interface Item {\n  sku: string;\n  qty: number;\n  price: number;\n  note?: string;\n}\n', `TypeScript for the sample:\n${ts0}`);
  ok((await page.evaluate(() => globalThis.__superutilsLive())).resources.includes('devcore-j2t'), 'the generator is devcore-j2t.wasm');
  await pick('Rust (serde)'); ok(/pub struct Order \{/.test(await out.inputValue()) && /pub qty: i64,/.test(await out.inputValue()) && /pub price: f64,/.test(await out.inputValue()) && /pub note: Option<String>,/.test(await out.inputValue()) && /#\[serde\(rename = "deliveredAt"\)\]/.test(await out.inputValue()), 'Rust: i64 / f64, Option for the optional field, serde rename');
  await pick('Go'); ok(/\tNote \*string `json:"note,omitempty"`/.test(await out.inputValue()) && /\tDeliveredAt any `json:"deliveredAt"`/.test(await out.inputValue()), 'Go: pointer + omitempty for the optional field, any for null');
  await pick('Java records'); ok(/^import java\.util\.List;\n\npublic record Order\(/.test(await out.inputValue()) && /\n    public record Item\(/.test(await out.inputValue()) && (await out.inputValue()).trimEnd().endsWith('}'), 'Java: one public record with the others nested in it');
  let f = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(f.endsWith('Order.java') && readFileSync(f, 'utf8') === await out.inputValue(), 'Download for Java is named after the public record: Order.java');
  await pick('Python dataclasses'); ok(/@dataclass\nclass Order:\n    id: int\n    customer: Customer\n    items: list\[Item\]\n    deliveredAt: Any \| None\n    tags: list\[str\]/.test(await out.inputValue()), 'Python: keys kept as field names');
  f = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(f.endsWith('types.py'), 'Download for Python: types.py');
  await pick('TypeScript');
  await setValue(name, 'my order: v2'); ok(await until(page, () => document.querySelector('textarea[aria-label="Types"]').value.startsWith('export interface MyOrderV2 {')), 'the root name is made a valid type name');
  await setValue(name, ''); ok(await until(page, () => document.querySelector('textarea[aria-label="Types"]').value.startsWith('export interface Root {')), 'no root name: Root');
  await setValue(name, 'Order');
  await setValue(src, '{"a": '); ok(await until(page, () => /Invalid JSON: The text ends where a value should be — line 1, column 7/.test(document.querySelector('.note-warn')?.textContent || '')) && await out.inputValue() === '', 'invalid JSON: what and where, and no stale output');
  await setValue(src, '   '); ok(await until(page, () => [...document.querySelectorAll('.note')].some((n) => /Paste a JSON sample/.test(n.textContent))) && await page.locator('.note-warn').count() === 0, 'an empty box is a hint, not an error');
  await setValue(src, '{"a,b":1,"id":18446744073709551615}'); await pick('Go');
  ok(/encoding\/json cannot map the key "a,b" with a struct tag/.test(await notes(page, '.note-warn')) && /above the int64 range — uint64 is used/.test(await notes(page, '.note-warn')), 'notes say what the reader must know (a key Go cannot tag; a number that needs uint64)');
  await pick('TypeScript'); ok(/too big for JavaScript to keep exactly/.test(await notes(page, '.note-warn')), 'the notes follow the language');
  const jf = join(tmp, 'j2t-sample.json'); writeFileSync(jf, '[{"sku":"A","qty":1},{"sku":"B"}]');
  await page.locator('input[type=file]').setInputFiles(jf); ok(await until(page, () => document.querySelector('textarea[aria-label="Types"]').value === 'export type Order = OrderItem[];\n\nexport interface OrderItem {\n  sku: string;\n  qty?: number;\n}\n'), 'a JSON file can be opened; a top-level list is "type Order = OrderItem[]" (not an invented wrapper)');
  ok(await page.locator('.note-warn').count() === 0, 'no notes for a plain sample');

  // ---- every sample in every language, through the tab
  const got = {};
  for (const [k, sample] of Object.entries(CASES)) {
    await setValue(src, sample); got[k] = {};
    for (const [l, label] of Object.entries(LANGS)) { await pick(label); got[k][l] = await out.inputValue(); }
  }
  ok(Object.values(got).every((g) => Object.values(g).every((code) => code.length > 10)) && !page.errors.length, `${Object.keys(CASES).length} samples × 5 languages generated without an error ${page.errors.join(' | ')}`);
  ok(Object.values(got).every((g) => Object.values(g).every((code) => !/[\u0000-\u0008\u000b-\u001f\u202a-\u202e\u2028\u2029]/.test(code))), 'no control, line-separator or bidi character ever reaches the generated source');
  const dir = mkdtempSync(join(tmp, 'j2t-')), cache = join(tmpdir(), 'superutils-j2t-cache'); mkdirSync(cache, { recursive: true });
  const report = (label, results, expectFail, failRe) => {
    const wrong = Object.entries(results).filter(([k, v]) => (expectFail.includes(k) ? !failRe.test(v) : !/^ok/.test(v)));
    ok(wrong.length === 0 && Object.keys(results).length === Object.keys(CASES).length, `${label} (${Object.keys(results).length} samples${wrong.length ? `; wrong: ${wrong.map(([k, v]) => `${k}: ${v.slice(0, 160)}`).join(' ; ')}` : ''})`);
  };

  // TypeScript: the sample itself must be assignable to the generated root type
  mkdirSync(join(dir, 'ts'));
  for (const [k, g] of Object.entries(got)) writeFileSync(join(dir, 'ts', `${k}.ts`), `${g.ts}\n${k === 'dupkeys' ? '' : `const x: Order = ${CASES[k]};\nexport default x;\n`}`); // (an object literal cannot repeat a key)
  let r = run('node', [join(process.cwd(), 'node_modules/typescript/bin/tsc'), '--strict', '--noEmit', '--target', 'es2022', ...Object.keys(got).map((k) => `${k}.ts`)], { cwd: join(dir, 'ts') }); // (run where there is no tsconfig.json)
  ok(r.ok, `TypeScript: tsc --strict accepts all ${Object.keys(got).length} outputs with their sample assigned to the root type ${r.ok ? '' : r.out.slice(0, 600)}`);

  // Go: decode with DisallowUnknownFields, encode again, compare (a member that is null, {} or [] counts as absent:
  // omitempty cannot tell them apart)
  mkdirSync(join(dir, 'go'));
  writeFileSync(join(dir, 'go/go.mod'), 'module j2t\n\ngo 1.21\n');
  for (const [k, g] of Object.entries(got)) {
    mkdirSync(join(dir, 'go', k));
    writeFileSync(join(dir, 'go', k, 'types.go'), `package ${k}\n\nimport (\n\t"encoding/json"\n\t"reflect"\n\t"strings"\n)\n\n${g.go.replace('// Generated by SuperUtils JSON → Types\n', '')}
func strip(v any) any {
	switch x := v.(type) {
	case map[string]any:
		for k, e := range x {
			if m, isMap := e.(map[string]any); e == nil || (isMap && len(m) == 0) { delete(x, k); continue }
			if l, isList := e.([]any); isList && len(l) == 0 { delete(x, k); continue }
			x[k] = strip(e)
		}
	case []any:
		for i, e := range x { x[i] = strip(e) }
	}
	return v
}
func Check() string {
	sample := ${JSON.stringify(CASES[k])}
	d := json.NewDecoder(strings.NewReader(sample))
	d.DisallowUnknownFields()
	var o Order
	if err := d.Decode(&o); err != nil { return "DECODE " + err.Error() }
	back, err := json.Marshal(o)
	if err != nil { return "MARSHAL " + err.Error() }
	var a, b any
	json.Unmarshal([]byte(sample), &a)
	json.Unmarshal(back, &b)
	if !reflect.DeepEqual(strip(a), strip(b)) { return "DIFF " + string(back) }
	return "ok"
}
`);
  }
  writeFileSync(join(dir, 'go/main.go'), `package main\n\nimport (\n\t"fmt"\n${Object.keys(got).map((k) => `\t"j2t/${k}"`).join('\n')}\n)\n\nfunc main() {\n${Object.keys(got).map((k) => `\tfmt.Println("${k}", ${k}.Check())`).join('\n')}\n}\n`);
  r = run('go', ['run', '.'], { cwd: join(dir, 'go'), env: { ...process.env, GOFLAGS: '-mod=mod', GO111MODULE: 'on', GOPROXY: 'off', GOCACHE: join(cache, 'go'), HOME: dir } });
  if (r.missing) info('Go is not installed — the Go outputs were not compiled');
  else if (!r.ok) ok(false, `Go: the generated code does not build: ${r.out.slice(0, 900)}`);
  else report('Go: every output builds; the sample decodes with DisallowUnknownFields and encodes back to the same JSON — except the samples whose keys encoding/json cannot tag, which fail exactly as the note says', Object.fromEntries(r.out.trim().split('\n').map((l) => [l.split(' ')[0], l.slice(l.indexOf(' ') + 1)])), [...GO_UNTAGGABLE, ...GO_MERGES], /^DECODE json: unknown field|^DIFF \{"a":"x","b":\{"c":1,"d":2\}\}$/);

  // Rust: serde deserialises the sample and serialises it back to the same JSON
  mkdirSync(join(dir, 'rs/src'), { recursive: true });
  writeFileSync(join(dir, 'rs/Cargo.toml'), '[package]\nname = "j2t"\nversion = "0.1.0"\nedition = "2021"\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n');
  writeFileSync(join(dir, 'rs/src/main.rs'), `#![allow(dead_code, unused_imports)]
use serde_json::Value;
fn strip(v: Value) -> Value { match v { Value::Object(m) => Value::Object(m.into_iter().filter(|(_, x)| !x.is_null()).map(|(k, x)| (k, strip(x))).collect()), Value::Array(a) => Value::Array(a.into_iter().map(strip).collect()), x => x } }
fn same(a: &Value, b: &Value) -> bool { match (a, b) { (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(), (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)), (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, p)| y.get(k).map_or(false, |q| same(p, q))), _ => a == b } }
${Object.entries(got).map(([k, g]) => `mod ${k} {\n${g.rust}\npub fn check() -> String {\n    let sample = ${JSON.stringify(CASES[k])};\n    match serde_json::from_str::<Order>(sample) {\n        Err(e) => format!("DECODE {e}"),\n        Ok(o) => { let back = serde_json::to_value(&o).unwrap(); let orig: serde_json::Value = serde_json::from_str(sample).unwrap(); if super::same(&super::strip(orig), &super::strip(back.clone())) { "ok".into() } else { format!("DIFF {back}") } }\n    }\n}\n}`).join('\n')}
fn main() {\n${Object.keys(got).map((k) => `    println!("${k} {}", ${k}::check());`).join('\n')}\n}\n`);
  r = run('cargo', ['run', '-q', '--offline'], { cwd: join(dir, 'rs'), env: { ...process.env, CARGO_TARGET_DIR: join(cache, 'rust') } });
  if (r.missing || (!r.ok && /offline|no matching package|failed to (select|get|load)|can't find crate/.test(r.out) && !/error\[E\d+\]/.test(r.out))) info(`Rust check skipped (cargo or the serde crates are not available offline): ${r.out.split('\n')[0]}`);
  else if (!r.ok) ok(false, `Rust: the generated code does not build: ${r.out.replace(/^\s*(Compiling|Finished|Running).*$/gm, '').trim().slice(0, 900)}`);
  else report('Rust: every output builds (rustc + serde); the sample deserialises and serialises back to the same JSON — except the sample with a repeated key, which serde refuses', Object.fromEntries(r.out.trim().split('\n').map((l) => [l.split(' ')[0], l.slice(l.indexOf(' ') + 1)])), RUST_REFUSES, /^DECODE duplicate field/);

  // Java: javac, each output as its own file in its own package
  const files = [];
  for (const [k, g] of Object.entries(got)) { mkdirSync(join(dir, 'java', k), { recursive: true }); const fn = join(dir, 'java', k, /^public record Order\(/m.test(g.java) ? 'Order.java' : 'Types.java'); writeFileSync(fn, `package ${k};\n\n${g.java}`); files.push(fn); }
  r = run('javac', ['-Xlint:all', '-Werror', '-d', join(dir, 'java/out'), ...files]);
  if (r.missing) info('javac is not installed — the Java outputs were not compiled');
  else ok(r.ok, `Java: javac -Xlint:all -Werror compiles all ${files.length} outputs as generated (a public record in a file of its name) ${r.ok ? '' : r.out.replace(/^Picked up.*$/gm, '').trim().slice(0, 900)}`);

  // Python: define the classes (warnings are errors), resolve every annotation, build the dataclass from the sample
  writeFileSync(join(dir, 'cases.json'), JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, g]) => [k, { code: g.py, sample: CASES[k] }]))));
  writeFileSync(join(dir, 'check.py'), `import dataclasses, json, sys, types, typing, warnings
warnings.simplefilter('error')
for k, c in json.load(open(sys.argv[1], encoding='utf-8')).items():
    mod = types.ModuleType('m_' + k); sys.modules[mod.__name__] = mod; ns = mod.__dict__  # dataclasses looks the module up
    try:
        exec(compile(c['code'], k + '.py', 'exec'), ns)
        for v in list(ns.values()):
            if dataclasses.is_dataclass(v):
                typing.get_type_hints(v, ns, {})
    except Exception as e:
        print(k, 'DEFINE', type(e).__name__, ascii(str(e))); continue
    d = json.loads(c['sample'])
    if isinstance(d, dict) and dataclasses.is_dataclass(ns.get('Order')):
        try:
            ns['Order'](**d); print(k, 'ok built')
        except Exception as e:
            print(k, 'BUILD', type(e).__name__, ascii(str(e)))
    else:
        print(k, 'ok defined')
`);
  r = run('python3', [join(dir, 'check.py'), join(dir, 'cases.json')]);
  if (!r.ok) ok(false, `Python: the check did not run: ${r.out.slice(0, 600)}`);
  else report('Python: every output defines its dataclasses without a warning, every annotation resolves, and Order(**sample) works — except the samples with keys that are not Python names (renamed, with a comment)', Object.fromEntries(r.out.trim().split('\n').map((l) => [l.split(' ')[0], l.slice(l.indexOf(' ') + 1)])), PY_RENAMED, /^BUILD TypeError/);

  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__superutilsLive().resources.length === 0), 'the engine is released when the tab is left');
  await pcOnlyOnPhone(ctx, 'json2types');
};
