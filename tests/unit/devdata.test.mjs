// The small developer tabs (JSON formatter, JSON diff, XML formatter, JSON → types, Base64, URL encoder, Epoch
// converter, UUID, Color converter, JWT decoder, Markdown table, Mock data): our Rust engines devcore-json / -jsondiff /
// -xml / -j2t and the string glue in src/tools/software/dev1.ts, data2.ts and src/lib/color.ts.
// References: tests/fixtures/devdata/reference.json (Python: base64, urllib, datetime + zoneinfo, uuid, colorsys, PyJWT
// — scripts/make-devdata-reference.py), JSON.parse / JSON.stringify, Node's WHATWG URL, a second JSON Patch applier
// (the json-patch crate) and cmark-gfm (markdown.wasm) for Markdown tables.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (t, { load, wasm, root }) => {
  const REF = JSON.parse(readFileSync(join(root, 'tests/fixtures/devdata/reference.json'), 'utf8'));
  const { bindDevcore } = await load('/src/wasm/devcore.ts');
  const dc = {}; for (const g of ['json', 'jsondiff', 'xml', 'j2t', 'enc']) dc[g] = bindDevcore(await wasm(`devcore-${g}`));
  const enc = new TextEncoder(), dec = new TextDecoder();
  const err = (f) => { try { f(); return ''; } catch (e) { return String(e.message); } };
  // seeded random numbers (mulberry32)
  let seed = 0x5eed1234; const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const ri = (n) => Math.floor(rnd() * n), pick = (a) => a[ri(a.length)];
  const KEYS = ['name', 'id', 'tags', 'नाम', 'a b', 'x/y', 'k~1', 'é', 'emoji😀', 'zeta', 'Alpha', '_p', 'q"uote', 'back\\slash'];
  const STR = ['', 'a', 'Pune', 'नमस्ते', 'line\nbreak', 'tab\there', 'q"uote', '😀', '\u00e9', 'x'.repeat(40), '</script>', '\u2028'];
  const rdoc = (depth = 0, floats = true) => {
    const k = rnd();
    if (depth > 3 || k < 0.35) return pick([null, true, false, ri(1000), -ri(50), floats ? Math.round(rnd() * 1e6) / 1000 : ri(9), pick(STR), pick(STR)]);
    if (k < 0.65) return Array.from({ length: ri(5) }, () => rdoc(depth + 1, floats));
    const o = {}; for (let i = ri(5); i > 0; i--) o[pick(KEYS)] = rdoc(depth + 1, floats); return o;
  };
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

  // ================================================================ JSON formatter (devcore-json)
  {
    const fmt = (text, indent = 2, sort = 0) => dc.json.bytesJson(`jsonfmt:${indent}:${sort}`, enc.encode(text));
    const prob = (text) => { try { fmt(text); return null; } catch (e) { return JSON.parse(e.message); } };
    let same = 0, mini = 0; const N = 300;
    for (let i = 0; i < N; i++) {
      const v = rdoc(), text = JSON.stringify(v);
      if (fmt(text, 2).out === JSON.stringify(v, null, 2) && fmt(text, 4).out === JSON.stringify(v, null, 4) && fmt(JSON.stringify(v, null, 3), -1).out === JSON.stringify(v, null, '\t')) same++;
      if (fmt(JSON.stringify(v, null, 2), 0).out === text) mini++;
    }
    t.eq([same, mini], [N, N], `${N} random documents: 2 spaces / 4 spaces / tab equal JSON.stringify, minify gives the compact text back`);
    // nothing but white space changes
    const odd = '{"b":1.0,"a":1e5,"big":12345678901234567890,"10":1,"2":2,"a":3,"neg":-0,"exp":1E+2,"s":"\\u0041\\/"}';
    t.eq(fmt(odd, 0).out, odd, 'minify keeps key order, duplicate keys and the spelling of every number and string');
    t.eq(fmt(odd, 2).out.split('\n').map((l) => l.trim()), ['{', '"b": 1.0,', '"a": 1e5,', '"big": 12345678901234567890,', '"10": 1,', '"2": 2,', '"a": 3,', '"neg": -0,', '"exp": 1E+2,', '"s": "\\u0041\\/"', '}'], 'formatted: one member per line, in the order written (JSON.stringify would move "10" and "2" first and drop the first "a")');
    t.eq(fmt('{"b":1,"a":{"z":1,"y":[{"q":1,"p":2}]},"B":2,"a":3,"10":4,"9":5}', 0, 1).out, '{"10":4,"9":5,"B":2,"a":{"y":[{"p":2,"q":1}],"z":1},"a":3,"b":1}', 'Sort keys: UTF-16 order at every level, duplicate keys keep their order');
    const st = fmt('{"a":[1,{"b":null},[]],"c":{"d":{"e":true}},"a":2}');
    t.eq([st.values, st.objects, st.arrays, st.keys, st.depth, st.duplicates], [10, 4, 2, 6, 3, [{ key: 'a', line: 1 }]], 'counts: values, objects, arrays, keys, depth, duplicate keys');
    t.eq(fmt('{\n"k":1,\n"x":{"k":2},\n"k":3,\n"\\u006b":4}').duplicates, [{ key: 'k', line: 4 }, { key: 'k', line: 5 }], 'duplicates are per object, compared after unescaping, with their line');
    t.eq([fmt('[]').out, fmt('{}').out, fmt(' [ ] ', 2).out, fmt('{"a":[],"b":{}}', 2).out, fmt('"x"').out, fmt('-1.5e-3').out, fmt('null').out], ['[]', '{}', '[]', '{\n  "a": [],\n  "b": {}\n}', '"x"', '-1.5e-3', 'null'], 'empty containers stay on one line; a lone value is a document');
    t.eq(fmt('\ufeff{"a":1}', 0).out, '{"a":1}', 'a byte-order mark in front is skipped');
    // errors: message, line, column and the position to select
    const E = [
      ['', /empty/, 1, 1, 0], ['   ', /empty/, 1, 4, 3], ['{"a":', /ends where a value should be/, 1, 6, 5], ['{"a": }', /^A value is missing after the colon$/, 1, 7, 6], ['{"a": 1,\n "b": }', /^A value is missing after the colon$/, 2, 7, 15], ['{"a":1,}', /Trailing comma before }/, 1, 8, 7], ['[1,2,]', /Trailing comma before ]/, 1, 6, 5],
      ["{'a':1}", /double quotes/, 1, 2, 1], ['{a:1}', /keys must be in double quotes/, 1, 2, 1], ['{"a" 1}', /Expected : after the key/, 1, 6, 5], ['{"a":1 "b":2}', /comma is missing/, 1, 8, 7],
      ['[1 2]', /Expected , or ]/, 1, 4, 3], ['[1,,2]', /Two commas in a row/, 1, 4, 3], ['{"a":tru}', /“tru” is not a JSON value/, 1, 6, 5], ['[True]', /lower case/, 1, 2, 1], ['[None]', /null/, 1, 2, 1],
      ['[undefined]', /no undefined/, 1, 2, 1], ['[NaN]', /NaN or Infinity/, 1, 2, 1], ['[01]', /leading zeros/, 1, 2, 1], ['[1.]', /decimal point must be followed/, 1, 3, 2], ['[.5]', /digit before the decimal point/, 1, 2, 1],
      ['[+1]', /cannot start with \+/, 1, 2, 1], ['[1e]', /exponent/, 1, 3, 2], ['[0x10]', /Hexadecimal/, 1, 3, 2], ['[1_000]', /underscores/, 1, 3, 2], ['[-]', /minus sign/, 1, 2, 1], ['["a\nb"]', /line break inside a string/, 1, 4, 3],
      ['["a\tb"]', /tab character/, 1, 4, 3], ['["\\x41"]', /\\x is not an escape/, 1, 3, 2], ['["\\u12"]', /four hex digits/, 1, 3, 2], ['["abc]', /never closed/, 1, 2, 1], ['{"a":1} {"b":2}', /several values/, 1, 9, 8],
      ['[1] x', /after the end of the JSON value/, 1, 5, 4], ['// c\n[1]', /Comments are not allowed/, 1, 1, 0], ['[1,\n 2,\n  }', /Unexpected “}”/, 3, 3, 10], ['{"नाम": "😀", "b": ]', /Unexpected “]”/, 1, 19, 19], ['[,1]', /value is missing before this comma/, 1, 2, 1], ['\ufeff[1,]', /Trailing comma/, 1, 4, 4],
    ];
    for (const [text, re, line, column, pos] of E) { const p = prob(text); t.ok(p && re.test(p.message) && p.line === line && p.column === column && p.pos === pos, `error for ${JSON.stringify(text)}: ${JSON.stringify(p)} (want ${re}, ${line}:${column}, pos ${pos})`); }
    // the engine accepts exactly the texts JSON.parse accepts
    let agree = 0, tried = 0; const CH = ['{', '}', '[', ']', ',', ':', '"', '\\', '0', '1', 'e', '.', '-', ' ', 'a', 'n', 't', '\n'];
    for (let i = 0; i < 1200; i++) {
      let s = JSON.stringify(rdoc()); const at = ri(s.length + 1), how = ri(3);
      s = how === 0 ? s.slice(0, at) + s.slice(at + 1) : how === 1 ? s.slice(0, at) + pick(CH) + s.slice(at) : s.slice(0, at) + pick(CH) + s.slice(at + 1);
      let native = true; try { JSON.parse(s); } catch { native = false; }
      tried++; if ((prob(s) === null) === native) agree++; else if (agree === tried - 1) t.ok(false, `validity differs from JSON.parse for ${JSON.stringify(s)}`);
    }
    t.eq(agree, tried, `${tried} mutated documents: valid exactly when JSON.parse accepts them`);
    t.eq([prob('['.repeat(512) + ']'.repeat(512)), /Nested deeper than 512/.test(prob('['.repeat(600) + ']'.repeat(600))?.message || '')], [null, true], '512 levels are formatted; deeper nesting is refused with a message (no crash)');
    const bigDoc = JSON.stringify(Array.from({ length: 20000 }, (_, i) => ({ id: i, name: `row ${i}`, tags: ['a', 'b'], v: i / 7 })));
    t.eq(fmt(bigDoc, 2).out, JSON.stringify(JSON.parse(bigDoc), null, 2), `a ${(bigDoc.length / 1e6).toFixed(1)} MB document formats like JSON.stringify`);
  }

  // ================================================================ JSON diff (devcore-jsondiff)
  {
    const diff = (a, b) => dc.jsondiff.json('jsondiff', { a, b });
    const dS = (a, b) => diff(JSON.stringify(a), JSON.stringify(b));
    /** A second, plain implementation of RFC 6902 add / remove / replace. */
    const apply = (doc, patch) => {
      let root = structuredClone(doc);
      for (const op of patch) {
        const segs = op.path === '' ? [] : op.path.slice(1).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
        if (!segs.length) { root = op.value; continue; }
        let cur = root; for (const s of segs.slice(0, -1)) cur = cur[s];
        const last = segs[segs.length - 1];
        if (Array.isArray(cur)) { const i = +last; if (op.op === 'add') cur.splice(i, 0, op.value); else if (op.op === 'remove') cur.splice(i, 1); else cur[i] = op.value; }
        else if (op.op === 'remove') delete cur[last]; else cur[last] = op.value;
      }
      return root;
    };
    const mutate = (v, depth = 0) => {
      const k = rnd();
      if (Array.isArray(v) && depth < 4) { const a = v.map((x) => (rnd() < 0.3 ? mutate(x, depth + 1) : x)); if (k < 0.3 && a.length) a.splice(ri(a.length), 1); else if (k < 0.6) a.splice(ri(a.length + 1), 0, rdoc(3, false)); return a; }
      if (v && typeof v === 'object' && depth < 4) { const o = {}; for (const [key, x] of Object.entries(v)) { if (rnd() < 0.15) continue; o[key] = rnd() < 0.35 ? mutate(x, depth + 1) : x; } if (k < 0.3) o[pick(KEYS)] = rdoc(3, false); return o; }
      return k < 0.5 ? v : rdoc(3, false);
    };
    let ok1 = 0, ok2 = 0, rowsOk = 0, eqOk = 0; const N = 400;
    for (let i = 0; i < N; i++) {
      const a = rdoc(0, false), b = rnd() < 0.1 ? a : mutate(a), r = dS(a, b), patch = JSON.parse(r.patch);
      if (JSON.stringify(canon(apply(a, patch))) === JSON.stringify(canon(b))) ok1++; else if (ok1 === i) t.ok(false, `own applier: ${JSON.stringify(a)} → ${JSON.stringify(b)} with ${r.patch}`);
      const second = dc.jsondiff.json('jsonpatch', { doc: JSON.stringify(a), patch: r.patch }).result;
      if (JSON.stringify(canon(second)) === JSON.stringify(canon(b))) ok2++;
      if (r.rows.length === patch.length && r.count === patch.length && r.rows.every((x, j) => x.op === patch[j].op)) rowsOk++;
      if (r.equal === (JSON.stringify(canon(a)) === JSON.stringify(canon(b))) && r.equal === (patch.length === 0)) eqOk++;
    }
    t.eq([ok1, ok2, rowsOk, eqOk], [N, N, N, N], `${N} random pairs: applying the patch to the left gives the right (two appliers), one table row per operation, "equal" exactly when nothing differs`);
    const ops = (a, b) => JSON.parse(diff(a, b).patch).map((o) => `${o.op} ${o.path}${'value' in o ? ` ${JSON.stringify(o.value)}` : ''}`);
    t.eq(ops('[1,2,3,4]', '[2,3,4]'), ['remove /0'], 'removing the first element of a list is one operation (not a change of every element)');
    t.eq(ops('[1,2,4]', '[1,2,3,4]'), ['add /2 3'], 'an element inserted in the middle is one "add"');
    t.eq(ops('["a","b","c","d"]', '["a","x","c","y","d"]'), ['replace /1 "x"', 'add /3 "y"'], 'a change and an insertion in one list (paths follow the list as it is patched)');
    t.eq(ops('{"a":[{"id":1,"v":1},{"id":2,"v":2}]}', '{"a":[{"id":2,"v":2}]}'), ['remove /a/0'], 'lists of objects are aligned by equal elements');
    t.eq(ops('{"a":[{"id":1,"v":1}]}', '{"a":[{"id":1,"v":9}]}'), ['replace /a/0/v 9'], 'a changed object in a list is compared member by member');
    t.eq(ops('{"a":1}', '{"a":1,"b":{"c":[1]}}'), ['add /b {"c":[1]}'], 'a whole new subtree is one "add"');
    // records with an "id" are matched by it
    t.eq(ops('[{"id":1,"v":"x"},{"id":2,"v":"y"},{"id":3,"v":"z"}]', '[{"id":1,"v":"x"},{"id":3,"v":"Z"},{"id":4,"v":"w"}]'), ['remove /1', 'replace /1/v "Z"', 'add /2 {"id":4,"v":"w"}'], 'a record that changed is compared with its own earlier version (same id), not with the record that now has its place');
    t.eq(diff('[{"id":1,"v":"x"},{"id":2,"v":"y"},{"id":3,"v":"z"}]', '[{"id":1,"v":"x"},{"id":3,"v":"Z"},{"id":4,"v":"w"}]').rows.map((x) => `${x.op} ${x.path}`), ['remove /1', 'replace /2/v', 'add /2'], 'the rows point at the record in the document it is in (left for removed / changed, right for added)');
    t.eq(ops('[{"id":"a","n":1},{"id":"b","n":2}]', '[{"id":"b","n":3},{"id":"a","n":1}]'), ['add /0 {"id":"b","n":3}', 'remove /2'], 'reordered records: the unchanged one stays, the other is added in front and removed behind');
    t.eq(ops('[{"id":1,"n":1},{"id":2,"n":2}]', '[{"id":7,"n":1},{"id":8,"n":2}]'), ['replace /0/id 7', 'replace /1/id 8'], 'no id in common: compared in order');
    t.eq(ops('[{"id":1,"n":1},{"x":2}]', '[{"id":1,"n":9},{"x":3}]'), ['replace /0/n 9', 'replace /1/x 3'], 'a list where not every element has an id is compared in order');
    t.eq(ops('[{"id":{"a":1},"n":1}]', '[{"id":{"a":1},"n":2}]'), ['replace /0/n 2'], 'an id that is not a plain value is not used as one');
    t.eq(ops('1', '"x"'), ['replace  "x"'], 'different root values: replace at the empty path');
    t.eq(ops('{"a/b":1,"c~d":2,"":3,"e f":4}', '{"a/b":2,"c~d":3,"":4,"e f":5}'), ['replace /a~1b 2', 'replace /c~0d 3', 'replace / 4', 'replace /e f 5'], 'JSON Pointer escapes ~1 and ~0; the empty key is "/"');
    // numbers and strings are compared by value, written forms are kept
    for (const [a, b] of [['1', '1.0'], ['1', '1e0'], ['100', '1e2'], ['0.1', '0.10'], ['0', '-0'], ['1.5e3', '1500'], ['1e400', '10e399'], ['12345678901234567890', '12345678901234567890.0'], ['"\\u0041"', '"A"'], ['"\\/"', '"/"'], ['{"\\u0061":1}', '{"a":1}']]) t.eq(diff(a, b).equal, true, `${a} equals ${b}`);
    for (const [a, b] of [['12345678901234567890', '12345678901234567891'], ['1e400', '1e401'], ['0.1', '0.1000000000000000001'], ['"a"', '"A"'], ['1', '"1"'], ['null', 'false'], ['[]', '{}'], ['0', 'null'], ['[1,2]', '[2,1]']]) t.eq(diff(a, b).equal, false, `${a} differs from ${b}`);
    t.eq(JSON.parse(diff('{"id":12345678901234567890}', '{"id":12345678901234567891}').patch.replace(/\d{20}/, '"$&"')), [{ op: 'replace', path: '/id', value: '12345678901234567891' }], 'a 20-digit number is not rounded in the patch');
    const r1 = diff('{"name":"Asha","age":30}', '{"name":"Asha Rao"}');
    t.eq(r1.rows, [{ op: 'replace', path: '/name', left: '"Asha"', right: '"Asha Rao"' }, { op: 'remove', path: '/age', left: '30', right: null }], 'rows carry the left and right values as JSON text');
    t.eq(diff('[1,2,3]', '[1,3]').rows[0], { op: 'remove', path: '/1', left: '2', right: null }, 'a removed row points at the element in the left document');
    t.eq(diff('[1,3]', '[0,1,2,3]').rows.map((x) => x.path), ['/0', '/2'], 'added rows point at the element in the right document');
    t.eq(diff('{"a":1,"a":2}', '{"a":2}').equal, true, 'of a duplicate key the last value counts');
    t.ok(/Left has 1 duplicate key \("a" on line 1\)/.test(diff('{"a":1,"a":2}', '{"a":2}').notes[0]) && /Right has 2 duplicate keys/.test(diff('{}', '{"a":1,"a":2,\n"b":1,"b":2}').notes[0]), 'duplicate keys are reported for each side');
    t.ok(/^Left: .*line 2, column 7/.test(err(() => diff('{\n "a": }', '{}'))) && /^Right: .*line 1, column 2/.test(err(() => diff('{}', '[,]'))), 'a parse error names the side, the line and the column');
    t.ok(/^Left is empty/.test(err(() => diff('', '{}'))) && /^Right is empty/.test(err(() => diff('{}', '  \n'))), 'an empty side is named');
    // a list too long for the alignment table is compared index by index, and the patch is still right
    const A = Array.from({ length: 2100 }, (_, i) => i), B = A.filter((x) => x % 97 !== 0).concat([-1, -2]);
    t.eq(apply(A, JSON.parse(dS(A, B).patch)), B, 'two lists of 2,100 and 2,080 elements (beyond the alignment limit): the patch still gives the right document');
    const A2 = Array.from({ length: 1500 }, (_, i) => ({ id: i })), B2 = A2.slice(1);
    t.eq(JSON.parse(dS(A2, B2).patch), [{ op: 'remove', path: '/0' }], '1,500 objects with the first removed: one operation');
  }

  // ================================================================ XML formatter (devcore-xml)
  {
    const fmt = (src, ind = 2, comments = 1) => dec.decode(dc.xml.raw(`xmlfmt:${ind}:${comments}`, enc.encode(src)));
    const TOK = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>|<[^>"']*(?:"[^"]*"[^>"']*|'[^']*'[^>"']*)*>|[^<]+/g;
    const toks = (s) => (s.match(TOK) || []).filter((x) => x.trim() !== '');
    let kept = 0, idem = 0, mini = 0, noBlank = 0;
    for (const d of REF.xml) {
      const f2 = fmt(d.src), f4 = fmt(d.src, 4), ft = fmt(d.src, -1), f0 = fmt(d.src, 0);
      if ([f2, f4, ft, f0].every((x) => JSON.stringify(toks(x)) === JSON.stringify(toks(d.src)))) kept++; else t.ok(false, `${d.name}: a token changed\n${d.src}\n${f2}`);
      if (fmt(f2) === f2 && fmt(f4, 4) === f4 && fmt(ft, -1) === ft && fmt(f0, 0) === f0 && fmt(f4, 2) === f2 && fmt(f2, -1) === ft) idem++; else t.ok(false, `${d.name}: formatting twice changes the result`);
      if (fmt(f2, 0) === f0 && fmt(ft, 0) === f0) mini++;
      if (!/\n[ \t]*\n/.test(f2) || /\n\s*\n/.test(d.src)) noBlank++; // (a blank line inside text that is kept as written may stay)
    }
    t.eq([kept, idem, mini, noBlank], Array(4).fill(REF.xml.length), `${REF.xml.length} documents: every tag, comment, CDATA section and text is byte-for-byte the same at 2 spaces / 4 spaces / tab / minified; formatting again changes nothing; minify(formatted) = minify(source); no blank lines`);
    const decl = '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?><!DOCTYPE note SYSTEM "note.dtd" [<!ENTITY w "World">]><note><to>&w; &amp; &#169;</to><e a="1&#10;2"/><x></x></note>';
    t.eq(fmt(decl), '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>\n<!DOCTYPE note SYSTEM "note.dtd" [<!ENTITY w "World">]>\n<note>\n  <to>&w; &amp; &#169;</to>\n  <e a="1&#10;2"/>\n  <x></x>\n</note>',
      'the declaration (encoding, standalone), the DOCTYPE with its internal subset, entity and character references and <x></x> are kept as typed');
    t.eq(fmt('<a><b> </b><c>  padded  </c><d>\u00a0</d><e>\n</e></a>'), '<a>\n  <b> </b>\n  <c>  padded  </c>\n  <d>\u00a0</d>\n  <e>\n</e>\n</a>', 'text is never trimmed: a lone space, padding, a no-break space and a line break stay');
    t.eq(fmt('<p>Hello <b>bold</b>\n and <i>it</i>.</p>'), '<p>Hello <b>bold</b>\n and <i>it</i>.</p>', 'an element with text among its children (mixed content) is left exactly as written');
    t.eq(fmt('<r>\n\n  <a/>\n\n\n  <b>\n    <c/>\n  </b>\n</r>', 4), '<r>\n    <a/>\n    <b>\n        <c/>\n    </b>\n</r>', 'old layout is replaced: blank lines go, the indent is the chosen one');
    t.eq(fmt('<a xml:space="preserve"> <b> x </b> </a>'), '<a xml:space="preserve"> <b> x </b> </a>', 'xml:space="preserve" is honoured');
    t.eq(fmt("<r><a xml:space='preserve'> <b/> </a><c> <d/> </c></r>"), "<r>\n  <a xml:space='preserve'> <b/> </a>\n  <c>\n    <d/>\n  </c>\n</r>", 'preserve applies to its own element only (single quotes too)');
    t.eq(fmt('<a><![CDATA[<raw> & stuff]]></a><!-- tail -->'), '<a><![CDATA[<raw> & stuff]]></a>\n<!-- tail -->', 'CDATA is text: kept, and its element is not re-laid out; a comment after the root gets its own line');
    t.eq(fmt('<?xml version="1.0"?><?xml-stylesheet href="s.xsl"?><!-- c --><r><?php echo 1; ?><a/></r>'), '<?xml version="1.0"?>\n<?xml-stylesheet href="s.xsl"?>\n<!-- c -->\n<r>\n  <?php echo 1; ?>\n  <a/>\n</r>', 'processing instructions and comments, outside and inside the root');
    t.eq([fmt('<a><!-- c --><b>1</b></a>', 2, 0), fmt('<a><!-- only --></a>', 2, 0), fmt('<a><!-- c --><b>1</b></a>', 0, 1)], ['<a>\n  <b>1</b>\n</a>', '<a></a>', '<a><!-- c --><b>1</b></a>'], 'comments can be dropped; minify keeps them unless asked');
    t.eq(fmt('<a title="1 > 0" data-x=\'<not a tag>\'><b note="/>"/></a>'), '<a title="1 > 0" data-x=\'<not a tag>\'>\n  <b note="/>"/>\n</a>', '> and < inside attribute values do not end a tag');
    t.eq(fmt('\ufeff<a><b/></a>'), '<a>\n  <b/>\n</a>', 'a byte-order mark is dropped');
    t.eq([fmt(''), fmt('<a/>'), fmt('  <a/>  ')], ['', '<a/>', '<a/>'], 'empty input and a single tag');
    t.ok(/never closed/.test(err(() => fmt('<a><b>'))) && /does not match/.test(err(() => fmt('<a><b></a>'))) && /closes nothing/.test(err(() => fmt('</a>'))), 'unbalanced tags are reported, not laid out');
    const deep = '<a>'.repeat(3000) + '</a>'.repeat(3000); t.eq(fmt(deep, 0), deep, '3,000 nested elements: no stack overflow');
    const many = `<r>${'<i k="v">t</i>'.repeat(50000)}</r>`; t.eq(fmt(many).split('\n').length, 50002, '50,000 elements are laid out one per line');
  }

  // ================================================================ JSON → types (devcore-j2t); the outputs are compiled by the e2e suite
  {
    const gen = (lang, text, rootName = 'Order') => dc.j2t.bytesJson(`j2t:${lang}:${rootName}`, enc.encode(text));
    const out = (lang, text, rootName) => gen(lang, text, rootName).out;
    const sample = '{"id":101,"customer":{"name":"Asha","vip":true},"items":[{"sku":"TEA-1","qty":2,"price":120.5},{"sku":"SPC-9","qty":1,"price":950,"note":"gift"}],"deliveredAt":null,"tags":["a"]}';
    t.eq(out('ts', sample), 'export interface Order {\n  id: number;\n  customer: Customer;\n  items: Item[];\n  deliveredAt: null;\n  tags: string[];\n}\n\nexport interface Customer {\n  name: string;\n  vip: boolean;\n}\n\nexport interface Item {\n  sku: string;\n  qty: number;\n  price: number;\n  note?: string;\n}\n', 'TypeScript for the sample');
    t.eq(out('go', sample), '// Generated by SuperTools JSON → Types\n\ntype Order struct {\n\tId int64 `json:"id"`\n\tCustomer Customer `json:"customer"`\n\tItems []Item `json:"items"`\n\tDeliveredAt any `json:"deliveredAt"`\n\tTags []string `json:"tags"`\n}\n\ntype Customer struct {\n\tName string `json:"name"`\n\tVip bool `json:"vip"`\n}\n\ntype Item struct {\n\tSku string `json:"sku"`\n\tQty int64 `json:"qty"`\n\tPrice float64 `json:"price"`\n\tNote *string `json:"note,omitempty"`\n}\n', 'Go for the sample');
    t.ok(/pub struct Order \{\n    pub id: i64,\n    pub customer: Customer,\n    pub items: Vec<Item>,\n    #\[serde\(rename = "deliveredAt"\)\]\n    pub delivered_at: Option<serde_json::Value>,\n    pub tags: Vec<String>,\n\}/.test(out('rust', sample)) && /#\[serde\(default, skip_serializing_if = "Option::is_none"\)\]\n    pub note: Option<String>,/.test(out('rust', sample)), 'Rust for the sample');
    t.eq(out('java', sample), 'import java.util.List;\n\npublic record Order(\n    Long id,\n    Customer customer,\n    List<Item> items,\n    Object deliveredAt,\n    List<String> tags\n) {\n    public record Customer(\n        String name,\n        Boolean vip\n    ) {}\n\n    public record Item(\n        String sku,\n        Long qty,\n        Double price,\n        String note\n    ) {}\n}\n', 'Java: one public record with the others nested in it (one file compiles)');
    t.eq(out('py', sample), 'from __future__ import annotations\n\nfrom dataclasses import dataclass\nfrom typing import Any\n\n\n@dataclass\nclass Item:\n    sku: str\n    qty: int\n    price: float\n    note: str | None = None\n\n\n@dataclass\nclass Customer:\n    name: str\n    vip: bool\n\n\n@dataclass\nclass Order:\n    id: int\n    customer: Customer\n    items: list[Item]\n    deliveredAt: Any | None\n    tags: list[str]\n', 'Python: keys kept as field names, classes defined before use');
    // the root is the sample's own shape
    t.eq([out('ts', '[{"id":1},{"id":2,"n":"x"}]').split('\n')[0], out('go', '[{"id":1}]').split('\n')[2], out('rust', '[{"id":1}]').split('\n')[2], out('py', '[{"id":1}]').trim().split('\n').pop(), out('ts', '42'), out('ts', '[1,2.5]'), out('ts', '"x"'), out('ts', 'null'), out('ts', '{}'), out('go', '{}').split('\n')[2], out('rust', '42'), out('py', '[1,"a"]').trim().split('\n').pop()],
      ['export type Order = OrderItem[];', 'type Order []OrderItem', 'pub type Order = Vec<OrderItem>;', 'Order = list[OrderItem]', 'export type Order = number;\n', 'export type Order = number[];\n', 'export type Order = string;\n', 'export type Order = null;\n', 'export type Order = Record<string, unknown>;\n', 'type Order map[string]any', 'pub type Order = i64;\n', 'Order = list[int | str]'],
      'a top-level list, number, string, null or empty object is a type alias — no invented wrapper');
    t.ok(/^\/\/ The JSON is not an object.*List<OrderItem>/m.test(out('java', '[{"id":1}]')) && /^record OrderItem\(/m.test(out('java', '[{"id":1}]')) && !/public record/.test(out('java', '[{"id":1}]')), 'Java has no alias: a comment names the type, and the record is not public (the file is not named after it)');
    t.eq(out('ts', '[{"id":1}]', 'Orders').split('\n')[0], 'export type Orders = Order[];', 'the elements of a root list called Orders are Order');
    // names of list elements
    const el = (key) => /: (\w+)\[\];/.exec(out('ts', JSON.stringify({ [key]: [{ a: 1 }] })))[1];
    const want = { items: 'Item', categories: 'Category', companies: 'Company', entries: 'Entry', statuses: 'Status', people: 'Person', children: 'Child', data: 'DataItem', status: 'StatusItem', series: 'SeriesItem', news: 'NewsItem', addresses: 'Address', movies: 'Movie', cookies: 'Cookie',
      lineItems: 'LineItem', order_lines: 'OrderLine', caches: 'Cache', matches: 'Match', boxes: 'BoxData', taxes: 'Tax', dishes: 'Dish', heroes: 'Hero', shoes: 'Shoe', photos: 'Photo', buses: 'Bus', aliases: 'Alias', lenses: 'Lens', analyses: 'Analysis', indices: 'Index', matrices: 'Matrix',
      quizzes: 'Quiz', leaves: 'Leaf', knives: 'Knife', menus: 'Menu', criteria: 'Criterion', houses: 'House', archives: 'Archive', IDs: 'ID', list: 'ListItem', classes: 'ClassData', values: 'ValueData', users: 'User', 'नाम': 'Item', '2fa': 'N2faItem', sizes: 'Size', keys: 'Key' };
    for (const [k, v] of Object.entries(want)) t.eq(el(k), v, `the elements of "${k}" are ${v}`);
    // names that would not compile
    const collide = '{"user_id":1,"userId":2,"UserID":3}';
    t.ok(/\tUserId int64 `json:"user_id"`\n\tUserId2 int64 `json:"userId"`\n\tUserID int64 `json:"UserID"`/.test(out('go', collide)), `Go: colliding field names are numbered ${out('go', collide)}`);
    t.ok(/pub user_id: i64,\n    #\[serde\(rename = "userId"\)\]\n    pub user_id_2: i64,\n    #\[serde\(rename = "UserID"\)\]\n    pub user_id_3: i64,/.test(out('rust', collide)), 'Rust: the key that already is the snake_case name keeps it; the others are numbered and renamed');
    const kw = '{"class":"a","type":"t","self":1,"fn":2,"None":3,"import":4,"yield":5,"hashCode":6,"_":7,"async":8}';
    t.ok(['type_', 'self_', 'fn_', 'yield_', 'async_'].every((n) => new RegExp(`pub ${n}:`).test(out('rust', kw))) && /pub class: String,\n/.test(out('rust', kw)) && /pub none: i64/.test(out('rust', kw)) && /#\[serde\(rename = "_"\)\]\n    pub field_9: i64/.test(out('rust', kw)), 'Rust keywords get an underscore and a serde rename');
    t.ok(/String class_, \/\/ JSON key "class"/.test(out('java', kw)) && /Long hashCode_, \/\/ JSON key "hashCode"/.test(out('java', kw)) && /Long field9, \/\/ JSON key "_"/.test(out('java', kw)) && /String type,/.test(out('java', kw)) && /Long yield,/.test(out('java', kw)), 'Java: reserved words and forbidden record components are renamed with a comment; other keys are kept');
    t.ok(/    class_: str  # JSON key "class"/.test(out('py', kw)) && /    none: int  # JSON key "None"/.test(out('py', kw)) && /    import_: int  # JSON key "import"/.test(out('py', kw)) && /\n    type: str\n/.test(out('py', kw)) && /\n    _: int\n/.test(out('py', kw)), 'Python: keywords are renamed with a comment; type and _ are fine');
    t.ok(gen('java', kw).notes.some((n) => /Java: keys that are not valid Java names were renamed/.test(n)) && gen('py', kw).notes.some((n) => /Python: keys that are not valid Python names/.test(n)) && gen('ts', kw).notes.length === 0, 'renames are explained in a note');
    const shadow = '{"list":[{"a":1}],"string":{"a":"x"},"option":{"b":1},"vec":{"c":1},"map":{"d":1},"any":{"e":1},"object":{"f":1},"date":{"g":1}}';
    t.ok(['ListItem', 'StringData', 'OptionData', 'VecData', 'MapData', 'AnyData', 'ObjectData', 'DateData'].every((n) => new RegExp(`interface ${n} `).test(out('ts', shadow))) && !/(struct|record|class|interface) (String|Option|Vec|Map|Any|Object|List|Date)\b/.test(['ts', 'go', 'rust', 'java', 'py'].map((l) => out(l, shadow)).join('\n')), 'type names that would shadow String, Option, Vec, Map, Any, Object, List or Date get a suffix');
    t.eq(out('ts', '{"a":1}', 'String').split('\n')[0], 'export interface StringData {', 'a root name that is a built-in type gets the suffix too');
    t.eq(['order item', '123', 'my-type: v2', '!!!', 'नाम', '', 'camelCase'].map((n) => /interface (\w+)/.exec(out('ts', '{"a":1}', n))[1]), ['OrderItem', 'N123', 'MyTypeV2', 'Root', 'Root', 'Root', 'CamelCase'], 'the root type name is made a valid identifier');
    // same name: one type when the members are the same, numbered when they differ
    const shape = out('ts', '{"billing":{"address":{"pin":"1"}},"shipping":{"address":{"pin":"2"}},"other":{"address":{"zip":3}}}');
    t.ok((shape.match(/interface Address /g) || []).length === 1 && /interface Address2 \{\n  zip: number;/.test(shape) && /interface Shipping \{\n  address: Address;/.test(shape), 'two "address" objects with the same members share one type; a different one is Address2');
    t.ok(/order: Order2;/.test(out('ts', '{"order":{"x":1}}')) && /interface Order2 \{\n  x: number;/.test(out('ts', '{"order":{"x":1}}')), 'a member type named like the root is numbered');
    // keys
    const oddKeys = '{"first-name":"a","2fa":true,"a.b":1," ":2,"":3,"$ref":"x","@type":"t","größe":1.5}';
    t.eq(out('ts', oddKeys), 'export interface Order {\n  "first-name": string;\n  "2fa": boolean;\n  "a.b": number;\n  " ": number;\n  "": number;\n  $ref: string;\n  "@type": string;\n  "größe": number;\n}\n', 'TypeScript quotes keys that are not identifiers');
    t.ok(/\tFirstName string `json:"first-name"`\n\tF2fa bool `json:"2fa"`\n\tAB int64 `json:"a.b"`\n\tField4 int64 `json:" "`\n\tField5 int64 `json:"-"` \/\/ the key "" cannot be written in a struct tag\n\tRef string `json:"\$ref"`\n\tType string `json:"@type"`\n\tGre float64 `json:"größe"`/.test(out('go', oddKeys)), `Go field names and tags for odd keys ${out('go', oddKeys)}`);
    const goBad = gen('go', '{"a,b":1,"q\\"uote":2,"back`tick":3,"it\'s":4,"sl\\\\ash":5,"-":6,"हिन्दी":7,"名前":8,"ok!#$%&()*+./:;<=>?@[]^_{|}~ x":9}');
    t.eq((goBad.out.match(/`json:"-"` \/\/ the key/g) || []).length, 6, 'Go: keys with a comma, a quote, a backtick, an apostrophe, a backslash or combining marks cannot be written in a tag — each is marked');
    t.ok(/`json:"-,"`/.test(goBad.out) && /`json:"名前"`/.test(goBad.out) && /`json:"ok!#\$%&\(\)\*\+\.\/:;<=>\?@\[\]\^_\{\|\}~ x"`/.test(goBad.out) && goBad.notes.length === 6, 'Go: the key "-" is written "-,"; CJK letters and the allowed punctuation are fine; one note per unmappable key');
    t.ok(/    हिन्दी: int\n    name: int\n    名前: str\n    größe: float/.test(out('py', '{"हिन्दी":1,"name":2,"名前":"n","größe":1.5}')) && /    first_name: str  # JSON key "first-name"/.test(out('py', oddKeys)) && /    field_5: int  # JSON key ""/.test(out('py', oddKeys)), 'Python keeps every key that is an identifier (any script) and renames the others');
    t.ok(/    x: int  # JSON key "__x"/.test(out('py', '{"__x":1,"_y":2}')) && /\n    _y: int\n/.test(out('py', '{"__x":1,"_y":2}')), 'Python: a __private name would be mangled in a class, so it is renamed');
    t.ok(/#\[serde\(rename = "line\\nbreak"\)\]/.test(out('rust', '{"line\\nbreak":1}')) && /#\[serde\(rename = "bidi\\u\{202e\}x"\)\]/.test(out('rust', '{"bidi\\u202ex":1}')) && /# JSON key "bidi\\u202ex"/.test(out('py', '{"bidi\\u202ex":1}')) && !/[\u202e\u2028]/.test(out('java', '{"bidi\\u202ex":1,"ls\\u2028":2}') + out('go', '{"bidi\\u202ex":1}')), 'control, line-separator and bidi characters in keys are escaped in the generated source');
    // types
    const mix = '{"m":[[1,2],[3]],"e":[],"o":{},"n":[null],"mixed":[{"a":1},[1],"s"],"u":[1,"a",1.5],"w":[1,null]}';
    t.eq(out('ts', mix), 'export interface Order {\n  m: number[][];\n  e: unknown[];\n  o: Record<string, unknown>;\n  n: null[];\n  mixed: (MixedItem | number[] | string)[];\n  u: (number | string)[];\n  w: (number | null)[];\n}\n\nexport interface MixedItem {\n  a: number;\n}\n', 'TypeScript: nested lists, empty list, empty object, unions');
    t.ok(/\tM \[\]\[\]int64 `json:"m"`\n\tE \[\]any `json:"e"`\n\tO map\[string\]any `json:"o"`\n\tN \[\]any `json:"n"`\n\tMixed \[\]any `json:"mixed"`\n\tU \[\]any `json:"u"`\n\tW \[\]\*int64 `json:"w"`/.test(out('go', mix)) && !/type MixedItem/.test(out('go', mix)), 'Go: mixed lists are []any (and no unused struct is emitted); a nullable number is a pointer');
    t.ok(/pub o: serde_json::Map<String, serde_json::Value>,/.test(out('rust', mix)) && /pub w: Vec<Option<i64>>,/.test(out('rust', mix)) && /pub mixed: Vec<serde_json::Value>,/.test(out('rust', mix)), 'Rust: Map, Option inside Vec, Value for mixed');
    t.ok(/Map<String, Object> o,/.test(out('java', mix)) && /^import java\.util\.List;\nimport java\.util\.Map;\n/.test(out('java', mix)) && !/import/.test(out('java', '{"a":1}')), 'Java imports List and Map only when they are used');
    t.ok(/    mixed: list\[MixedItem \| list\[int\] \| str\]/.test(out('py', mix)) && /    o: dict\[str, Any\]/.test(out('py', mix)) && !/from typing import Any/.test(out('py', '{"a":1}')), 'Python: unions with |, dict[str, Any]; Any is imported only when used');
    const nums = '{"id":18446744073709551615,"n":1e20,"small":3,"huge":123456789012345678901234567890,"neg":-9223372036854775808,"v":[-1,18446744073709551615],"u":[1,18446744073709551615],"f":[1,2.5]}';
    t.ok(/\tId uint64 /.test(out('go', nums)) && /\tN float64 /.test(out('go', nums)) && /\tHuge float64 /.test(out('go', nums)) && /\tNeg int64 /.test(out('go', nums)) && /\tV \[\]float64 /.test(out('go', nums)) && /\tU \[\]uint64 /.test(out('go', nums)) && /\tF \[\]float64 /.test(out('go', nums)), `Go: uint64 above the int64 range, float64 beyond 64 bits, and for a list that mixes negative and huge numbers ${out('go', nums)}`);
    t.ok(/pub id: u64,/.test(out('rust', nums)) && /pub neg: i64,/.test(out('rust', nums)) && /pub huge: f64,/.test(out('rust', nums)) && /java\.math\.BigInteger id,/.test(out('java', nums)) && /Long neg,/.test(out('java', nums)) && /    huge: int\n/.test(out('py', nums)), 'Rust u64 / f64, Java BigInteger, Python int');
    t.ok(/above the int64 range|does not fit 64 bits/.test(gen('go', nums).notes.join()) && /too big for JavaScript/.test(gen('ts', nums).notes.join()) && gen('py', nums).notes.length === 0 && gen('go', '{"a":9007199254740993}').notes.length === 0, 'a note says when a number in the sample needs a wider type');
    const opt = '[{"x":null,"y":1,"z":"a"},{"y":2},{"x":3,"y":null,"z":"b","w":{}}]';
    t.eq(out('ts', opt), 'export type Order = OrderItem[];\n\nexport interface OrderItem {\n  x?: number | null;\n  y: number | null;\n  z?: string;\n  w?: Record<string, unknown>;\n}\n', 'optional (missing in some items) and nullable (null in some items) are different things');
    t.ok(/\tX \*int64 `json:"x,omitempty"`\n\tY \*int64 `json:"y"`\n\tZ \*string `json:"z,omitempty"`\n\tW map\[string\]any `json:"w,omitempty"`/.test(out('go', opt)) && /pub x: Option<i64>,/.test(out('rust', opt)) && !/Option<Option/.test(out('rust', opt)), 'Go pointers + omitempty; Rust never nests Option');
    t.ok(/@dataclass\(kw_only=True\)\nclass OrderItem:\n    x: int \| None = None\n    y: int \| None\n    z: str \| None = None\n    w: dict\[str, Any\] \| None = None/.test(out('py', opt)), `Python: a required field after an optional one needs kw_only ${out('py', opt)}`);
    t.ok(/^@dataclass\nclass/m.test(out('py', '[{"a":1,"b":2},{"a":1}]')) && !/kw_only/.test(out('py', '[{"a":1,"b":2},{"a":1}]')), 'Python: plain @dataclass when the optional fields come last');
    t.ok(/a\?: number;/.test(out('ts', '[{"a":1},{}]')) && /interface OrderItem/.test(out('ts', '[{"a":1},{}]')), 'an empty object next to objects with members makes every member optional');
    t.ok(/a: number \| string;/.test(out('ts', '{"a":1,"a":"x"}')) && /key appears more than once/.test(gen('ts', '{"a":1,"a":"x"}').notes.join()), 'a duplicate key: the values are merged, with a note');
    // errors
    const bad = err(() => gen('ts', '{"a": '));
    t.eq(JSON.parse(bad), { message: 'The text ends where a value should be', line: 1, column: 7, pos: 6 }, 'invalid JSON: the same message, line and column as the formatter');
    t.ok(/unknown language/.test(err(() => gen('cobol', '{}'))), 'an unknown language is refused');
    const deepJson = '{"a":'.repeat(200) + '1' + '}'.repeat(200);
    t.eq((out('ts', deepJson).match(/interface /g) || []).length, 200, '200 levels of nesting give 200 types (no crash)');
    t.ok(out('ts', JSON.stringify(Array.from({ length: 20000 }, (_, i) => ({ id: i, v: i % 3 ? 'x' : null, w: i % 2 ? 1.5 : 2 })))).includes('v: string | null;'), '20,000 list items are merged into one type');
  }

  // ================================================================ dev1.ts: Base64, URL, Epoch, UUID, JWT glue
  const d1 = await load('/src/tools/software/dev1.ts');
  {
    const hex = (b) => Buffer.from(b).toString('hex');
    let encOk = 0, decOk = 0, messy = 0, total = 0;
    for (const r of REF.b64) {
      const bytes = Uint8Array.from(Buffer.from(r.hex, 'hex'));
      if (dc.enc.encode('base64', bytes) === r.std && dc.enc.encode('base64url', bytes) === r.url) encOk++;
      if (hex(dc.enc.decode('base64', r.std)) === r.hex && hex(dc.enc.decode('base64', r.url)) === r.hex) decOk++;
      for (const m of r.messy) { total++; if (hex(dc.enc.decode('base64', d1.cleanB64(m))) === r.hex) messy++; else if (messy === total - 1) t.ok(false, `messy Base64 ${JSON.stringify(m)} ≠ ${r.hex}`); }
    }
    t.eq([encOk, decOk, messy], [REF.b64.length, REF.b64.length, total], `Base64 of ${REF.b64.length} byte strings equals Python's (standard and URL-safe); ${total} messy forms (MIME line breaks, URL-safe with padding, percent-encoded, no padding, data: URL, spaced) decode to the same bytes`);
    t.eq([d1.cleanB64('SGk=\u200b'), d1.cleanB64('\ufeffSGk%3D'), d1.cleanB64('a%2Bb%2Fc%3d'), d1.cleanB64('a%41')], ['SGk=', 'SGk=', 'a+b/c=', 'a%41'], 'zero-width characters and a BOM are removed; %3D %2B %2F become = + / (other escapes are left for the engine to reject)');
    const sig = (...b) => d1.sniffBytes(Uint8Array.from(b.flat()))?.ext, s = (x) => [...x].map((c) => c.charCodeAt(0));
    t.eq([sig(0x89, s('PNG\r\n\x1a\n')), sig(0xff, 0xd8, 0xff, 0xe0), sig(s('GIF89a')), sig(s('%PDF-1.7')), sig(s('PK\x03\x04')), sig(0x1f, 0x8b, 8), sig(s('RIFF'), 0, 0, 0, 0, s('WEBP')), sig(s('RIFF'), 0, 0, 0, 0, s('WAVE')), sig(0, 0, 0, 0x18, s('ftypmp42')), sig(s('ID3'), 3), sig(0xff, 0xfb, 0x90, 0x64), sig(0xff, 0xfe, 0x00, 0x80), sig(0, s('asm')), sig(s('SQLite format 3'), 0), sig(0x7f, s('ELF')), sig(s('hello')), sig()],
      ['png', 'jpg', 'gif', 'pdf', 'zip', 'gz', 'webp', 'wav', 'mp4', 'mp3', 'mp3', undefined, 'wasm', 'sqlite', 'elf', undefined, undefined], 'file types are recognised from their first bytes (an MP3 frame header is; FF FE — the UTF-16 byte-order mark — is not)');
    t.eq([d1.isText(enc.encode('नमस्ते\n\tok')), d1.isText(Uint8Array.from([0xff, 0xfe])), d1.isText(Uint8Array.from([65, 0, 66])), d1.isText(new Uint8Array(0))], [true, false, false, true], 'text = valid UTF-8 without control characters');
  }
  {
    let comp = 0, back = 0, form = 0;
    for (const r of REF.url.random) {
      const wf = r.text;
      if (encodeURIComponent(wf) === r.component) comp++;
      const d = d1.decodeLenient(r.component); if (d.text === r.text && d.legacy === 0 && d.stray === 0) back++; else if (back === comp - 1) t.ok(false, `decode ${r.component} → ${JSON.stringify(d)} ≠ ${JSON.stringify(r.text)}`);
      if (d1.decodeLenient(d1.plusToSpace(`q=${r.form}`)).text === `q=${r.text}`) form++;
    }
    t.eq([comp, back, form], Array(3).fill(REF.url.random.length), `${REF.url.random.length} texts: the component encoding equals Python's quote(); decoding gives the text back; the form style (+ for spaces) decodes as a query`);
    for (const r of REF.url.legacy) { const a = d1.decodeLenient(r.cp1252), b = d1.decodeLenient(r.utf8); t.ok(a.text === r.text && a.legacy > 0 && b.text === r.text && b.legacy === 0, `${r.cp1252} (Windows-1252) and ${r.utf8} (UTF-8) both read as ${r.text}: ${JSON.stringify(a)}`); }
    t.eq(d1.decodeLenient('caf%E9 %E2%9C%93 %F0%9F%98%80%FF%41'), { text: 'café ✓ 😀ÿA', legacy: 2, stray: 0 }, 'UTF-8 and Latin-1 escapes in one text: each run is read for what it is');
    t.eq(d1.decodeLenient('100% sure %zz %4 50%25 %'), { text: '100% sure %zz %4 50% %', legacy: 0, stray: 4 }, 'a % that is not an escape stays, and is counted');
    t.eq([d1.decodeLenient('%EF%BB%BFx').text, d1.decodeLenient('a%00b').text, d1.decodeLenient('%2520').text, d1.decodeLenient('').text, d1.decodeLenient('%e0%a4%ae').text], ['\ufeffx', 'a\u0000b', '%20', '', 'म'], 'BOM kept, NUL decoded, one level only, lower-case hex');
    t.eq(['https://example.com/c++/x?q=a+b%26c&d=1%2B1#a+b', 'mailto:user+tag@example.com', 'tel:+91-98765-43210', 'q=chai+%26+samosa&city=New+Delhi', 'a+b', 'x=1+2', 'https://e.com/?a+b', '1+1=2 ok', 'key=a+b#c+d?e+f'].map(d1.plusToSpace),
      ['https://example.com/c++/x?q=a b%26c&d=1%2B1#a+b', 'mailto:user+tag@example.com', 'tel:+91-98765-43210', 'q=chai %26 samosa&city=New Delhi', 'a+b', 'x=1 2', 'https://e.com/?a b', '1+1=2 ok', 'key=a+b#c+d?e f'], '+ is a space only in a query (between ? and #) or in text that is itself key=value; never in a path, a mailto: or a tel: link');
    // whole URLs: the browser's parser, checked against Node's implementation of the same standard
    for (const u of ['https://example.com/search?q=chai & samosa&city=मुंबई#top', 'https://example.com/a%20b?x=%26', 'http://[::1]:8080/p', 'https://मुंबई.example/पथ', 'HTTP://EXAMPLE.com', 'mailto:user+tag@example.com?subject=hi there', 'https://user:p@ss@example.com:8443/x', 'https://example.com/%zz?a=%', 'ftp://ex.com/a b', 'https://example.com/a|b{c}', 'file:///C:/My Docs/x y.txt', 'https://bücher.example/straße?ß=ü#ö'])
      t.eq(d1.encodeUrl(u), { out: new URL(u).href, how: 'url' }, `Encode full URL: ${u}`);
    t.eq([d1.encodeUrl('https://example.com/a%20b?x=%26').out, d1.encodeUrl('http://[::1]:8080/p').out, d1.encodeUrl('https://मुंबई.example/').out], ['https://example.com/a%20b?x=%26', 'http://[::1]:8080/p', 'https://xn--i1bm1ig9g.example/'], '%20 is not encoded twice, IPv6 brackets stay, a Devanagari host becomes Punycode');
    t.eq([d1.encodeUrl('/path with space/ü?q=1 2&r=%20'), d1.encodeUrl('not a url % 50%'), d1.encodeUrl('  a b  '), d1.encodeUrl('a\ud800b'), d1.encodeUrl('')],
      [{ out: '/path%20with%20space/%C3%BC?q=1%202&r=%20', how: 'text' }, { out: 'not%20a%20url%20%25%2050%25', how: 'text' }, { out: 'a%20b', how: 'text' }, { out: 'a%EF%BF%BDb', how: 'text' }, { out: '', how: 'text' }], 'text that is not an absolute URL: unsafe characters escaped, existing escapes kept, a stray % escaped, half a surrogate pair → U+FFFD');
  }
  {
    const P = d1.parseStamp; let n = 0, auto = 0, rest = 0, loc = 0;
    for (const [i, r] of REF.epoch.instants.entries()) {
      const s = P(r.s, 's'), ms = P(r.ms, 'ms'), us = P(r.us, 'us'), ns = P(r.ns, 'ns');
      if (new Date(s.ms).toISOString() === r.isoSeconds && [ms, us, ns].every((x) => new Date(x.ms).toISOString() === r.iso) && String(ms.ms) === r.ms) n++; else t.ok(false, `instant ${r.ns}: ${JSON.stringify([s, ms, us, ns])}`);
      if ((us.rest || '') === r.restUs && (ns.rest || '') === r.restNs && ms.rest === undefined) rest++;
      if (i % 4 && P(r.s).unit === 's' && P(r.ms).unit === 'ms' && P(r.us).unit === 'us' && P(r.ns).unit === 'ns') auto++;
      if (Date.parse(d1.isoLocal(+r.ms)) === +r.ms && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{3})?[+-]\d\d:\d\d$/.test(d1.isoLocal(+r.ms))) loc++;
    }
    t.eq([n, rest, auto, loc], [120, 120, 90, 120], '120 instants as seconds / milliseconds / microseconds / nanoseconds give Python\'s UTC time; digits beyond the millisecond are kept exactly; the unit is found from the size; the local ISO text parses back to the same instant');
    t.eq([P('1700000000'), P('1700000000000'), P('1700000000000000'), P('1700000000000000000')].map((x) => [x.ms, x.unit]), [[1700000000000, 's'], [1700000000000, 'ms'], [1700000000000, 'us'], [1700000000000, 'ns']], 'the same instant in four units');
    t.eq([P('1,700,000,000').ms, P('1 700 000 000').ms, P('1_700_000_000').ms, P('  1700000000  ').ms, P('+1700000000').ms, P('1.7e9').ms, P('17E8').ms, P('0001700000000').ms], Array(8).fill(1700000000000), 'group separators (comma, space, underscore), spaces around, a plus sign, 1.7e9 and leading zeros are read');
    t.eq([P('1700000000.5').ms, P('1700000000.123456').rest, P('-1').ms, P('-1.5').ms, P('0').ms, P('99999999999').unit, P('100000000000').unit, P('99999999999999').unit, P('100000000000000').unit, P('99999999999999999').unit, P('100000000000000000').unit],
      [1700000000500, '456', -1000, -1500, 0, 's', 'ms', 'ms', 'us', 'us', 'ns'], 'fractions of a second, negative times, and the exact borders between the units');
    t.eq([P('5', 'ms').ms, P('5', 'us'), P('1700000000', 'ms').ms, P('1700000000123456789').rest, P('1700000000123456789').ms], [5, { ms: 0, unit: 'us', rest: '005' }, 1700000000, '456789', 1700000000123], 'a chosen unit overrides the guess; 19 digits of nanoseconds lose nothing');
    t.ok([P('99999999999999999999999'), P('8640000000000001', 'ms'), P('8640000000001', 's')].every((x) => /outside the range/.test(x.error)) && P('8640000000000000', 'ms').ms === 8.64e15 && P('-8640000000000000', 'ms').ms === -8.64e15, 'the last representable millisecond is accepted, one more is refused');
    t.ok(/Not a timestamp or a date/.test(P('abc').error) && /Not a number/.test(P('1,,2').error) && /Not a number/.test(P('1.2.3').error) && P('').error === '' && P('   ').error === '' && /Not a timestamp/.test(P('0x10').error), 'what cannot be read is said (and an empty box is not an error)');
    t.eq([P('2023-11-14T22:13:20Z'), P('2023-11-14T22:13:20+05:30'), P('2023-11-14T22:13:20.123-08:00'), P('2023-11-14'), P('Tue, 14 Nov 2023 22:13:20 GMT'), P('14 Nov 2023 22:13 UTC')].map((x) => [x.ms, x.how]),
      [[1700000000000, 'with the time zone it names'], [1699980200000, 'with the time zone it names'], [1700028800123, 'with the time zone it names'], [1699920000000, 'a date alone is midnight UTC'], [1700000000000, 'with the time zone it names'], [1699999980000, 'with the time zone it names']], 'ISO 8601 with Z or an offset, a date alone, RFC 2822, "14 Nov 2023 22:13 UTC"');
    const L = (y, mo, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms).getTime();
    t.eq([P('14/11/2023').ms, P('14/11/2023 22:13').ms, P('14/11/2023 22:13:20').ms, P('14-11-2023 22:13:20.5').ms, P('14.11.2023, 10:15 pm').ms, P('1/2/2024').ms, P('14/11/2023 12:00 am').ms, P('14/11/2023 12:30 PM').ms, P('2023-11-14 22:13').ms, P('2023-11-14T22:13:20').ms],
      [L(2023, 11, 14), L(2023, 11, 14, 22, 13), L(2023, 11, 14, 22, 13, 20), L(2023, 11, 14, 22, 13, 20, 500), L(2023, 11, 14, 22, 15), L(2024, 2, 1), L(2023, 11, 14, 0, 0), L(2023, 11, 14, 12, 30), L(2023, 11, 14, 22, 13), L(2023, 11, 14, 22, 13, 20)], 'day/month/year (the Indian order) with / - or . and an optional time, am / pm; an ISO date-time without a zone is local time');
    t.eq(P('14/11/2023').how, 'day/month/year, your local time', 'it says how a date was read');
    t.ok([P('31/02/2023'), P('29/02/2023'), P('32/01/2023'), P('01/13/2023'), P('14/11/2023 24:00'), P('14/11/2023 10:60'), P('14/11/2023 13:00 pm')].every((x) => 'error' in x && x.error) && P('29/02/2024').ms === L(2024, 2, 29), 'dates that do not exist are refused (31 February, month 13, 24:00, 13 pm); 29 February of a leap year is fine');
    const now = Date.UTC(2026, 10, 17, 12, 0, 0);
    t.eq([0, 1000, -1000, 59000, 60000, 3599500, 3600000, 86400000 * 1.6, 86400000 * 45, 86400000 * 400, -86400000 * 365.3 * 3, 86399999].map((x) => d1.relTime(now + x, now)),
      ['now', 'in 1 second', '1 second ago', 'in 59 seconds', 'in 1 minute', 'in 1 hour', 'in 1 hour', 'in 2 days', 'next month', 'next year', '3 years ago', 'tomorrow'], 'relative time picks the natural unit (59.99 minutes is "in 1 hour", not "in 60 minutes")');
  }
  {
    const I = d1.inspectUuid; let ok = 0;
    const variantName = { RFC: /^RFC 9562/, NCS: /^NCS/, Microsoft: /^Microsoft/, reserved: /^reserved/ };
    for (const r of REF.uuid) {
      const u = I(r.text);
      const good = u && u.canonical === r.text && variantName[r.variant].test(u.variant) && u.version === r.version && (r.time === undefined || r.time === null || u.time === r.time) && (r.clockSeq === undefined || u.clockSeq === r.clockSeq) && (r.node === undefined || u.node.startsWith(r.node));
      if (good) ok++; else t.ok(false, `UUID ${r.text}: ${JSON.stringify(u)} vs ${JSON.stringify(r)}`);
    }
    t.eq(ok, REF.uuid.length, `${REF.uuid.length} UUIDs (v1, v3, v4, v5, v6, v7 and other variants): version, variant, time, clock sequence and node as Python's uuid module reads them`);
    t.eq([I('C232AB00-9414-11EC-B3C8-9F6BDECED846').time, I('1EC9414C-232A-6B00-B3C8-9F6BDECED846').time, I('017F22E2-79B0-7CC3-98C4-DC0C0C07398F').time], Array(3).fill('2022-02-22T19:22:22.000Z'), 'the RFC 9562 test vectors for versions 1, 6 and 7 all say 22 Feb 2022 19:22:22 UTC');
    t.eq(['{550E8400-E29B-41D4-A716-446655440000}', 'urn:uuid:550e8400-e29b-41d4-a716-446655440000', 'URN:UUID:550e8400e29b41d4a716446655440000', '550e8400e29b41d4a716446655440000', '  550e8400-e29b-41d4-a716-446655440000\n', '"550e8400-e29b-41d4-a716-446655440000"'].map((x) => I(x)?.canonical), Array(6).fill('550e8400-e29b-41d4-a716-446655440000'), 'braces, urn:uuid:, no hyphens, upper case, quotes and spaces are accepted');
    t.eq([I('00000000-0000-0000-0000-000000000000'), I('ffffffff-ffff-ffff-ffff-ffffffffffff')].map((x) => [x.kind, x.version, x.versionName]), [['nil', null, 'Nil UUID (all zeros)'], ['max', null, 'Max UUID (all ones)']], 'the nil and max UUIDs are named (not "version 0" / "version 15")');
    t.eq([I('6ba7b810-9dad-11d1-80b4-00c04fd430c8').node, I('c232ab00-9414-11ec-b3c8-9f6bdeced846').node, I('00000000-0000-0000-c000-000000000046').version], ['00:c0:4f:d4:30:c8', '9f:6b:de:ce:d8:46 (random — not a network card address)', null], 'a v1 node with the multicast bit is a random node; a Microsoft-variant UUID has no version');
    t.eq(['not-a-uuid', '550e8400-e29b-41d4-a716-44665544000', '550e8400-e29b-41d4-a716-4466554400000', 'g50e8400-e29b-41d4-a716-446655440000', '', '{550e8400-e29b-41d4-a716-446655440000'].map((x) => I(x)), Array(6).fill(null), 'what is not 32 hex digits is not a UUID');
  }
  {
    let ok = 0;
    for (const [i, r] of REF.jwt.entries()) {
      const j = d1.parseJwt(r.token), big = 'big' in r.payload; // the generator's 20-digit number is 12345678901234567890 + i (the fixture's own copy is rounded by JSON.parse)
      const good = j.kind === 'jws' && JSON.stringify(j.header.json) === JSON.stringify(r.header) && j.signatureBytes === r.sigBytes && j.payload.isJson && j.payload.utf8
        && (big ? j.payload.text.includes(`"big":${12345678901234567890n + BigInt(i)}`) : JSON.stringify(j.payload.json) === JSON.stringify(r.payload)) && (r.alg === 'none') === j.notes.some((n) => /NOT signed/.test(n));
      if (good) ok++; else t.ok(false, `JWT ${r.token.slice(0, 40)}…: ${JSON.stringify(j)}`);
    }
    t.eq(ok, REF.jwt.length, `${REF.jwt.length} tokens made by PyJWT (HS256 / HS384 / HS512 / none; Unicode names, lists, 20-digit numbers): header, payload and signature length are read back`);
    const b = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url'), tok = (h, p, s = 'c2ln') => `${b(h)}.${b(p)}.${s}`, T = tok({ alg: 'HS256' }, { sub: 'a' });
    t.eq([`Bearer ${T}`, `Authorization: Bearer ${T}`, `authorization:bearer   ${T}`, `"${T}",`, `'${T}'`, T.replace(/(.{10})/g, '$1\n  '), ` ${T}\n`].map(d1.cleanJwt), Array(7).fill(T), '"Bearer ", "Authorization:", quotes, a trailing comma and line breaks inside the token are removed');
    const jwe = d1.parseJwt(`${b({ alg: 'RSA-OAEP', enc: 'A256GCM' })}.a2V5.aXY.Y2lwaGVy.dGFn`);
    t.ok(jwe.kind === 'jwe' && jwe.payload === null && /encrypted token \(JWE, key management RSA-OAEP, content encryption A256GCM\)/.test(jwe.notes[0]), 'five parts = an encrypted token (JWE): the header is shown and the rest explained');
    t.eq([d1.parseJwt(tok({ alg: 'HS256' }, 'null')).payload.json, d1.parseJwt(tok({ alg: 'HS256' }, '[1,2]')).payload.json, d1.parseJwt(tok({ alg: 'HS256' }, 'hello')).payload.isJson, d1.parseJwt(tok({ alg: 'HS256' }, 'hello')).payload.text], [null, [1, 2], false, 'hello'], 'a payload that is null, a list or plain text is shown (no crash)');
    t.ok(/not valid UTF-8/.test(d1.parseJwt(`${b({ alg: 'HS256' })}.${Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]).toString('base64url')}.c2ln`).notes.join()), 'a payload that is not UTF-8 is said to be so');
    t.ok(/signature part is empty/.test(d1.parseJwt(`${b({ alg: 'HS256' })}.${b({})}.`).notes.join()) && /not valid Base64URL/.test(d1.parseJwt(`${b({ alg: 'HS256' })}.${b({})}.signature`).notes.join()) && d1.parseJwt(`${b({ alg: 'HS256' })}.${b({})}.signature`).payload.isJson, 'an empty or damaged signature is a note — the claims are still shown');
    t.eq(d1.parseJwt(`${Buffer.from('{"alg":"HS256"}').toString('base64')}.${Buffer.from('{"a":"??>>"}').toString('base64')}.c2ln`).payload.json, { a: '??>>' }, 'standard Base64 with padding (+ / =) is accepted as well');
    const why = (s) => err(() => d1.parseJwt(s));
    t.ok(/Paste a token/.test(why('  ')) && /two parts/.test(why('a.b')) && /this has 4/.test(why('a.b.c.d')) && /this has 1/.test(why('abc')) && /header\) is not Base64URL/.test(why('!!!.e30.sig')) && /header does not decode to a JSON object/.test(why(`${b('[1]')}.e30.sig`)) && /header does not decode/.test(why(`${b('hello')}.e30.sig`)) && /payload\) is not Base64URL/.test(why(`${b({ alg: 'x' })}.@@.sig`)), 'what is wrong with a token is said: the number of parts, which part is not Base64URL, a header that is not an object');
    t.eq([d1.jwtTime(1700000000), d1.jwtTime('1700000000'), d1.jwtTime(1700000000000), d1.jwtTime(1700000000.5), d1.jwtTime('tomorrow'), d1.jwtTime(1e300), d1.jwtTime(null), d1.jwtTime(true), d1.jwtTime(0), d1.jwtTime(-1)],
      [{ ms: 1700000000000 }, { ms: 1700000000000, odd: 'is written as a string (the standard asks for a number)' }, { ms: 1700000000000, odd: 'looks like milliseconds (JWT times are in seconds)' }, { ms: 1700000000500 }, null, null, null, null, { ms: 0 }, { ms: -1000 }], 'time claims: seconds, a numeric string, milliseconds by mistake, fractions; nonsense is not a time');
  }

  // ================================================================ colour (src/lib/color.ts + mathcore)
  {
    const C = await load('/src/lib/color.ts');
    const { bindMathcore } = await load('/src/wasm/mathcore.ts');
    const mc = bindMathcore(await wasm('mathcore'));
    const P = (s, hint) => C.parseColor(s, mc, hint), hexOf = (s, hint) => { const c = P(s, hint); return c ? C.hexA([...c.rgb, c.alpha]) : null; };
    let fmtOk = 0, back = 0;
    for (const r of REF.color) {
      const f = C.formatColor(r.rgb, 1, mc);
      const h = /^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/.exec(f.hsl).slice(1).map(Number), o = /^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/.exec(f.oklch).slice(1).map(Number);
      const grey = r.hsl[1] < 0.05, hueOk = grey || Math.abs(h[0] - r.hsl[0]) <= 0.051 || Math.abs(h[0] - r.hsl[0]) > 359.9;
      const okHue = r.oklch[1] < 1e-5 || Math.abs(o[2] - r.oklch[2]) <= 0.0051 || Math.abs(o[2] - r.oklch[2]) > 359.99;
      if (f.hex === r.hex && f.rgb === `rgb(${r.rgb.join(', ')})` && hueOk && Math.abs(h[1] - r.hsl[1]) <= 0.051 && Math.abs(h[2] - r.hsl[2]) <= 0.051 && Math.abs(o[0] - r.oklch[0]) <= 0.0051 && Math.abs(o[1] - r.oklch[1]) <= 0.00001 && okHue) fmtOk++;
      else t.ok(false, `colour ${r.hex}: ${JSON.stringify(f)} vs Python hsl ${r.hsl} oklch ${r.oklch}`);
      if (hexOf(f.hsl) === r.hex && hexOf(f.oklch) === r.hex && hexOf(f.rgb) === r.hex && hexOf(f.hex) === r.hex) back++;
    }
    t.eq([fmtOk, back], [REF.color.length, REF.color.length], `${REF.color.length} colours: HSL equals Python's colorsys and OKLCH an independent implementation of Ottosson's formulas (to the printed digits); every notation reads back to the same hex`);
    let exact = 0, n = 0;
    for (let r = 0; r < 256; r += 5) for (let g = 0; g < 256; g += 5) for (let b = 0; b < 256; b += 5) { n++; const f = C.formatColor([r, g, b], 1, mc), hx = C.rgbToHex(r, g, b); if (hexOf(f.hsl) === hx && hexOf(f.oklch) === hx) exact++; }
    t.eq(exact, n, `${n} colours across the RGB cube: the HSL and OKLCH texts are precise enough to give the same 8-bit colour back`);
    t.eq(C.formatColor([79, 70, 229], 1, mc), { hex: '#4f46e5', rgb: 'rgb(79, 70, 229)', hsl: 'hsl(243.4 75.4% 58.6%)', oklch: 'oklch(51.06% 0.23005 276.97)' }, 'the default colour in four notations');
    t.eq(C.formatColor([255, 0, 0], 0.5, mc), { hex: '#ff000080', rgb: 'rgba(255, 0, 0, 0.5)', hsl: 'hsl(0 100% 50% / 0.5)', oklch: 'oklch(62.8% 0.25768 29.23 / 0.5)' }, 'a see-through colour: 8-digit hex, rgba(), "/ alpha"');
    t.eq([C.formatColor([128, 128, 128], 1, mc).hsl, C.formatColor([128, 128, 128], 1, mc).oklch, C.formatColor([0, 0, 0], 1, mc).oklch, C.formatColor([255, 255, 255], 1, mc).oklch], ['hsl(0 0% 50.2%)', 'oklch(59.99% 0 0)', 'oklch(0% 0 0)', 'oklch(100% 0 0)'], 'greys have hue 0 and chroma 0 (not the noise of the arithmetic)');
    // reading
    const same = (list, want) => t.eq(list.map((x) => (Array.isArray(x) ? hexOf(x[0], x[1]) : hexOf(x))), Array(list.length).fill(want), `${list.map((x) => (Array.isArray(x) ? x[0] : x)).join('  ·  ')} = ${want}`);
    same(['#f00', '#ff0000', '#F00', 'ff0000', 'FF0000', ['f00', 'hex'], 'rgb(255, 0, 0)', 'rgb(255 0 0)', 'rgb(100% 0% 0%)', 'rgb(100%, 0%, 0%)', 'rgba(255,0,0,1)', 'rgb(255 0 0 / 100%)', 'rgb(300, -20, 0)', 'rgb(2.55e2, 0, 0)', 'RGB(255,0,0);', 'hsl(0 100% 50%)', 'hsl(0, 100%, 50%)', 'hsl(360 100% 50%)', 'hsl(-360deg 100% 50%)', 'hsl(1turn 100% 50%)', 'hsl(0 150% 50%)', 'hsl(0 100 50)', 'hwb(0 0% 0%)', '255, 0, 0', '255 0 0', ['0 100% 50%', 'hsl']], '#ff0000');
    same(['hsl(0.5turn 100% 50%)', 'hsl(180deg 100% 50%)', 'hsl(3.14159265rad 100% 50%)', 'hsl(200grad 100% 50%)', 'hsl(540 100% 50%)', 'hsl(-180 100% 50%)', 'rgb(0 255 255)', 'hwb(180 0% 0%)', '#0ff'], '#00ffff');
    same(['#ff000080', 'rgba(255, 0, 0, 0.5)', 'rgb(255 0 0 / 50%)', 'rgb(255 0 0 / 0.502)', 'hsl(0 100% 50% / 0.5)', 'hsla(0, 100%, 50%, 0.5)'], '#ff000080');
    t.eq([hexOf('rgb(1e2, 0, 0)'), hexOf('rgb(0 128 255 / 0)'), hexOf('hwb(0 50% 50%)'), hexOf('hwb(120 20% 30%)'), hexOf('hwb(0 80% 80%)'), hexOf('hsl(120 100% 25%)'), hexOf('hsl(243 75% 59%)'), hexOf('rgb(127.5 0 0)'), hexOf('#1234'), hexOf('#f008')], ['#640000', '#0080ff00', '#808080', '#33b333', '#808080', '#008000', '#5048e5', '#800000', '#11223344', '#ff000088'], 'scientific notation, alpha 0, hwb(), fractions, 4-digit hex');
    t.eq([hexOf('oklch(62.796% 0.25768 29.234)'), hexOf('oklch(0.62796 0.25768 29.234)'), hexOf('oklch(62.796% 64.42% 29.234deg)'), hexOf('oklch(50% 0 0)'), hexOf('oklch(1 0 0)'), hexOf('oklch(0 0 0)'), hexOf('oklch(none 0 0)'), hexOf('oklab(62.796% 0.22486 0.12585)'), hexOf('oklch(60% 0.15 50 / 0.4)'), hexOf('51.057% 0.23005 276.966', 'oklch')],
      ['#ff0000', '#ff0000', '#ff0000', '#636363', '#ffffff', '#000000', '#000000', '#ff0000', '#c4601666', '#4f46e5'], 'oklch(): lightness as a percentage or as 0–1, chroma as a number or a percentage (100% = 0.4), oklab(), alpha');
    const wide = P('oklch(90% 0.4 150)'), back2 = mc.rgbToOklch(...wide.rgb);
    t.ok(/outside sRGB/.test(wide.note) && /chroma reduced \(0\.4 → 0\.2199\)/.test(wide.note) && wide.rgb.every((x) => x >= 0 && x <= 255) && Math.abs(back2[0] - 90) < 2 && Math.abs(back2[2] - 150) < 1 && Math.abs(back2[1] - 0.22) < 0.001 && C.rgbToHex(...wide.rgb) === '#41ff87', `a colour outside sRGB is mapped into it as CSS Color 4 says (lightness and hue nearly kept, chroma reduced), with a note: ${JSON.stringify(wide)} → ${back2}`);
    t.ok(!P('oklch(62.8% 0.258 29.2)').note && hexOf('oklch(62.8% 0.258 29.2)') === '#ff0000' && hexOf('oklab(62.8% 0.2249 0.1264)') === '#ff0000' && /outside sRGB/.test(P('oklch(100% 0.3 20)').note) && hexOf('oklch(100% 0.3 20)') === '#ffffff' && hexOf('oklch(0% 0.3 20)') === '#000000', 'a colour that is outside only by the rounding of its text is simply clipped, without a note (red stays #ff0000); lightness 100 % is white and 0 % black whatever the chroma');
    const fit = mc.oklchToRgbFit(51.057, 0.23005, 276.966);
    const f2 = mc.oklchToRgbFit(70, 0.2, 180), f3 = mc.oklchToRgbFit(50, 0.37, 264), f4 = mc.oklchToRgbFit(95, 0.3, 100);
    t.ok(!fit.fitted && fit.rgb.map(Math.round).join() === '79,70,229' && f2.fitted && f2.rgb.map(Math.round).join() === '0,187,162' && Math.abs(f2.chroma - 0.1301) < 0.0005 && f3.rgb.map(Math.round).join() === '0,51,255' && f4.rgb.map(Math.round).join() === '255,240,40', `mathcore: a colour inside sRGB is not touched; outside, the CSS Color 4 mapping (${JSON.stringify([f2, f3, f4])})`);
    let inside = 0; for (let i = 0; i < 2000; i++) { const x = mc.oklchToRgbFit(rnd() * 100, rnd() * 0.45, rnd() * 360); if (x.rgb.every((v) => v >= 0 && v <= 255) && x.chroma >= 0 && Number.isFinite(x.chroma)) inside++; }
    t.eq(inside, 2000, '2,000 random OKLCH colours all come out inside 0–255');
    t.eq(['', '   ', '#12', '#12345', '#ggg', 'rgb(1,2)', 'rgb(1,2,3,4,5)', 'rgb(a,b,c)', 'hsl(1 2)', 'rgb(1 2 3 / x)', '255', '255, 0', 'oklch(50%)', 'rgb 1 2 3', '12', 'blah(1 2 3)', 'rgb(1/2/3)'].map((x) => P(x)), Array(17).fill(null), 'what is not a colour is not read as one');
    t.eq([hexOf('123'), hexOf('123', 'hex'), hexOf('1234', 'rgb'), hexOf('123456'), hexOf('123456', 'rgb'), hexOf('abc', 'rgb'), hexOf('255', 'rgb'), hexOf('12345678')], [null, '#112233', null, '#123456', null, '#aabbcc', null, '#12345678'], 'digits alone are hex only in the HEX box (or with 6 / 8 digits where no box is known): "255" on the way to "255, 0, 0" is not a colour');
    t.eq([C.hexToRgb('#4f46e5'), C.hexToRgb('fff'), C.hexToRgb('#4f46e580'), C.hexToRgb('#12'), C.rgbToHex(79.4, 70.5, 300), C.hexA([255, 0, 0, 1]), C.hexA([255, 0, 0, 0]), C.over([255, 0, 0, 0.5], [255, 255, 255]), C.over([0, 0, 0, 0.25], [0, 0, 0])], [[79, 70, 229], [255, 255, 255], [79, 70, 229], null, '#4f47ff', '#ff0000', '#ff000000', [255, 128, 128], [0, 0, 0]], 'hex helpers and compositing over a background');
  }

  // ================================================================ data2.ts: XML files, Markdown tables, mock data
  const d2 = await load('/src/tools/software/data2.ts');
  {
    const L1 = Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a>caf\xe9 \xa3</a>', 'latin1');
    t.eq([d2.decodeXml(L1), d2.decodeXml(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<a>नमस्ते</a>', 'utf16le')])), d2.decodeXml(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('<a>é</a>', 'utf16le').swap16()])), d2.decodeXml(Buffer.from('<?xml version="1.0"?><a>é</a>', 'utf16le')),
      d2.decodeXml(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<a>é</a>')])), d2.decodeXml(Buffer.from('<?xml version="1.0" encoding="made-up-9"?><a>é</a>')), d2.decodeXml(Buffer.from("<?xml version='1.0' encoding='windows-1251'?><a>\xcf\xf0\xe8</a>", 'latin1')), d2.decodeXml(Buffer.from('<a>é</a>')), d2.decodeXml(new Uint8Array(0))],
    [{ text: '<?xml version="1.0" encoding="ISO-8859-1"?><a>café £</a>', encoding: 'iso-8859-1' }, { text: '<a>नमस्ते</a>', encoding: 'utf-16le' }, { text: '<a>é</a>', encoding: 'utf-16be' }, { text: '<?xml version="1.0"?><a>é</a>', encoding: 'utf-16le' },
      { text: '<a>é</a>', encoding: 'utf-8' }, { text: '<?xml version="1.0" encoding="made-up-9"?><a>é</a>', encoding: 'utf-8' }, { text: "<?xml version='1.0' encoding='windows-1251'?><a>При</a>", encoding: 'windows-1251' }, { text: '<a>é</a>', encoding: 'utf-8' }, { text: '', encoding: 'utf-8' }],
    'an XML file is read in the encoding it declares: ISO-8859-1, UTF-16 with either byte-order mark or without one, a UTF-8 BOM, Windows-1251; an unknown name falls back to UTF-8');
    t.eq(['<?xml version="1.0" encoding="ISO-8859-1"?><a/>', "<?xml version='1.0' encoding='UTF-16' standalone='yes'?><a/>", '<?xml version="1.0" encoding="utf-8"?><a/>', '<?xml version="1.0"?><a/>', '<a encoding="x"/>', '<a/><?xml version="1.0" encoding="latin1"?>'].map(d2.utf8Declaration),
      ['<?xml version="1.0" encoding="UTF-8"?><a/>', "<?xml version='1.0' encoding='UTF-8' standalone='yes'?><a/>", '<?xml version="1.0" encoding="utf-8"?><a/>', '<?xml version="1.0"?><a/>', '<a encoding="x"/>', '<a/><?xml version="1.0" encoding="latin1"?>'], 'a saved file is UTF-8, so a declaration that names another encoding is corrected (and nothing else is touched)');
  }
  {
    const { bindMarkdown } = await load('/src/wasm/markdown.ts');
    const md = bindMarkdown(await wasm('markdown'));
    /** The cells of the first table in cmark-gfm's HTML (the real GFM parser). */
    const cells = (html) => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<br \/>|<br>/g, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')));
    const aligns = (html) => [...(html.match(/<tr>[\s\S]*?<\/tr>/) || [''])[0].matchAll(/<th(?: style="text-align: (\w+)")?>/g)].map((m) => m[1] || 'none');
    const CELL = ['Chai', '2', '', 'a|b', 'x | y', 'पुणे', '東京', '😀 ok', 'a\\b', 'trailing\\', 'two words', '₹40', '1.50', 'C:\\dir\\', '(x)', 'q?', 'semi;', 'a,b', 'x\ty'];
    let rt = 0, gfm = 0, al = 0; const N = 150;
    for (let i = 0; i < N; i++) {
      const cols = 1 + ri(5), rows = Array.from({ length: 1 + ri(5) }, (_, r) => Array.from({ length: cols }, () => (r === 0 ? pick(CELL.filter(Boolean)) : pick(CELL)))), align = Array.from({ length: cols }, () => pick(['none', 'left', 'center', 'right']));
      const text = d2.mdTable(rows, align), back = d2.parseMdTable(text);
      if (back && JSON.stringify(back.rows) === JSON.stringify(rows.map((r) => r.map((c) => c.trim()))) && JSON.stringify(back.align) === JSON.stringify(align)) rt++; else if (rt === i) t.ok(false, `round trip of ${JSON.stringify(rows)}:\n${text}\n${JSON.stringify(back)}`);
      const html = md.html(text), got = cells(html);
      // cmark-gfm renders the cell as Markdown: compare with what the cell's own Markdown gives (a backslash before punctuation is an escape there)
      const plain = (c) => c.trim().replace(/\\([|\\])/g, '$1').replace(/\\$/, '\\');
      if (JSON.stringify(got) === JSON.stringify(rows.map((r) => r.map(plain)))) gfm++; else if (gfm === i) t.ok(false, `cmark-gfm reads ${JSON.stringify(got)} from\n${text}\nwanted ${JSON.stringify(rows.map((r) => r.map(plain)))}`);
      if (JSON.stringify(aligns(html)) === JSON.stringify(align)) al++;
    }
    t.eq([rt, gfm, al], [N, N, N], `${N} random tables (pipes, backslashes, empty cells, Devanagari, CJK, emoji, tabs): our reader gives the cells back, cmark-gfm (the GFM parser) sees the same cells and alignments`);
    t.eq(d2.mdTable([['Item', 'Qty'], ['Chai', '2'], ['Samosa', '13']], ['left', 'right']), '| Item   | Qty |\n| :----- | --: |\n| Chai   |   2 |\n| Samosa |  13 |', 'the default layout: padded columns, alignment row');
    t.eq(d2.mdTable([['a'], ['line1\nline2'], ['x\r\ny\rz'], ['p|q']], ['center']), '|       a        |\n| :------------: |\n| line1<br>line2 |\n|  x<br>y<br>z   |\n|      p\\|q      |', 'line breaks in a cell (LF, CRLF, CR) become <br>; pipes are escaped; centred cells');
    t.eq(cells(md.html(d2.mdTable([['a', 'b'], ['line1\nline2', 'x']], ['none', 'none']))).map((r) => r.length), [2, 2], 'a cell with a line break is still one cell of one row for cmark-gfm');
    t.eq(d2.mdTable([['名前', '都市'], ['山田太郎', '東京'], ['Asha 😀', 'Pune']], ['none', 'none']), '| 名前     | 都市 |\n| -------- | ---- |\n| 山田太郎 | 東京 |\n| Asha 😀  | Pune |', 'CJK characters and emoji count as two columns, so the pipes line up in a fixed-width font');
    t.eq([d2.textWidth('abc'), d2.textWidth('東京'), d2.textWidth('😀'), d2.textWidth('é'), d2.textWidth('e\u0301'), d2.textWidth('👨‍👩‍👧'), d2.textWidth('ｆｕｌｌ'), d2.textWidth('한글'), d2.textWidth(''), d2.textWidth('🇮🇳')], [3, 4, 2, 1, 1, 2, 8, 4, 0, 2], 'display width: wide characters 2, a letter with a combining accent 1, an emoji family or a flag 2');
    t.eq(d2.parseMdTable('Intro line\n\n| h1 | h2 |\n|----|:--:|\n| 1 | 2 |\n\nfooter | with pipe'), { rows: [['h1', 'h2'], ['1', '2']], align: ['none', 'center'] }, 'the table is found inside other text and ends at the first blank line');
    t.eq(d2.parseMdTable('a | b\n--- | ---:\n1 | 2\n3 | 4'), { rows: [['a', 'b'], ['1', '2'], ['3', '4']], align: ['none', 'right'] }, 'a table without outer pipes');
    t.eq(d2.parseMdTable('| expr | note |\n|---|---|\n| a \\| b | `x \\| y` |\n| <br> start | end<BR/> |\n|  |  |').rows.slice(1), [['a | b', '`x | y`'], ['\n start', 'end\n'], ['', '']], 'escaped pipes, <br> in any spelling, empty cells');
    t.eq(['a,b\n1,2', 'just text', '| a |\n| b |', '---', '', 'a|b\n1|2', 'title\n-----\ntext'].map(d2.parseMdTable), Array(7).fill(null), 'text without a header + |---| line is not a Markdown table (CSV, a heading underline, a horizontal rule)');
  }
  {
    const D = (s) => { const v = d2.mockDate(s); return v === null ? null : new Date(v).toISOString(); };
    t.eq(['2026-11-16', '16/11/2026', '16-11-2026', '16.11.2026', '1/2/2024', '2024-2-1', '2026-11-16T10:30', '2026-11-16 10:30:45', '16/11/2026 10:30', '2026-11-16T10:30:45Z', '29/02/2024', ' 2026-11-16 '].map(D),
      ['2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z', '2024-02-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z', '2026-11-16T10:30:00.000Z', '2026-11-16T10:30:45.000Z', '2026-11-16T10:30:00.000Z', '2026-11-16T10:30:45.000Z', '2024-02-29T00:00:00.000Z', '2026-11-16T00:00:00.000Z'], 'dates as typed: ISO, or day/month/year with / - or . (day first), with an optional time');
    t.eq(['garbage', '', '31/02/2026', '29/02/2023', '2026-13-01', '11/16/2026', '16/11/26', '2026-11-16T25:00', '0000-01-01', '2026/11/16'].map(D), Array(10).fill(null), 'what is not a real date is refused (31 February, month 13, the American order 11/16, a two-digit year)');
    const R = (type, a, b = '') => d2.mockRange({ name: 'f', type, a, b });
    t.eq([R('int', '18', '65'), R('int', '', ''), R('int', '5', ''), R('int', '1.2', '3.8'), R('int', '-5', '5'), R('int', '1,000', '2,000'), R('float', '0.5', '1.5'), R('float', '', '')].map((x) => [x.lo, x.hi, x.problem]),
      [[18, 65, undefined], [0, 1000, undefined], [5, 1005, undefined], [2, 3, undefined], [-5, 5, undefined], [1000, 2000, undefined], [0.5, 1.5, undefined], [0, 1000, undefined]], 'number ranges: defaults, "from" alone, fractions rounded inwards, negative, thousands separators');
    t.ok(/swapped/.test(R('int', '10', '1').problem) && R('int', '10', '1').lo === 1 && R('int', '10', '1').hi === 10 && /“abc” is not a number — 0 is used/.test(R('int', 'abc', '5').problem) && /“x” is not a number/.test(R('float', '1', 'x').problem) && R('float', '1', 'x').hi === 1001
      && /cannot be exact/.test(R('int', '0', '1e300').problem) && R('int', '0', '1e300').hi === Number.MAX_SAFE_INTEGER && R('int', '4294967296', '9007199254740991').problem === undefined, 'wrong number ranges are explained and repaired: swapped, not a number, beyond 2^53');
    t.eq([R('date', '2020-01-01', '16/11/2026'), R('date', '', ''), R('datetime', '16/11/2026 10:00', '16/11/2026 12:00')].map((x) => [new Date(x.lo).toISOString().slice(0, 16), new Date(x.hi).toISOString().slice(0, 16), x.problem]),
      [['2020-01-01T00:00', '2026-11-16T00:00', undefined], ['2020-01-01T00:00', '2026-12-31T00:00', undefined], ['2026-11-16T10:00', '2026-11-16T12:00', undefined]], 'date ranges in either notation; defaults');
    t.ok(/“garbage” is not a date/.test(R('date', 'garbage', '').problem) && /“32\/01\/2026” is not a date/.test(R('date', '', '32/01/2026').problem) && /swapped/.test(R('date', '2026-01-01', '2020-01-01').problem) && R('date', '2026-01-01', '2020-01-01').lo < R('date', '2026-01-01', '2020-01-01').hi, 'wrong date ranges are explained and repaired (they used to throw "Invalid time value")');
    t.eq([R('id', '1'), R('id', ''), R('id', '1000'), R('id', '-5'), R('id', '1.5'), R('id', 'abc'), R('words', '3'), R('words', ''), R('words', '3000000'), R('words', '0'), R('words', 'x'), R('words', '2.5')].map((x) => [x.lo, !!x.problem]),
      [[1, false], [1, false], [1000, false], [-5, false], [1, true], [1, true], [3, false], [5, false], [100, true], [1, true], [5, true], [3, true]], 'the id start must be a whole number; the number of words is 1–100 (3,000,000 used to freeze the tab)');
    t.eq(['customers', 'my table', 'order', 'Select', 'a"b', 'public.customers', 'my schema.t', '1st', '', '_x', 'naïve', 'user'].map(d2.sqlName), ['customers', '"my table"', '"order"', '"Select"', '"a""b"', 'public.customers', '"my schema".t', '"1st"', '""', '_x', '"naïve"', '"user"'], 'SQL names: plain ones bare, reserved words and anything else in double quotes (a quote doubled), schema.table part by part');
    t.eq([d2.mockNames(['id', 'name', 'id', 'id', '', ' ', 'name_2', 'name']), d2.mockNames(['a', 'b']), d2.mockNames(['__proto__', 'constructor'])],
      [{ names: ['id', 'name', 'id_2', 'id_3', 'field5', 'field6', 'name_2', 'name_3'], renamed: ['id → id_2', 'id → id_3', '(empty) → field5', '(empty) → field6', 'name → name_3'] }, { names: ['a', 'b'], renamed: [] }, { names: ['__proto__', 'constructor'], renamed: [] }], 'column names are made unique and non-empty, and the changes are listed');
    t.ok(d2.MOCK_TYPES.length === 22 && new Set(d2.MOCK_TYPES.map((x) => x[0])).size === 22, '22 field types');
  }

  // ================================================================ regex tester helpers (text.ts)
  {
    const x = await load('/src/tools/text.ts');
    t.eq(['g', 'gimsuyd', 'gv', '', 'x', 'gg', 'uv', 'G', 'g i'].map(x.flagsError), [null, null, null, null, '“x” is not a flag. The flags are g i m s u v y d.', 'Flag g is given twice.', 'Flags u and v cannot be used together (v includes u).', '“G” is not a flag. The flags are g i m s u v y d.', '“ ” is not a flag. The flags are g i m s u v y d.'], 'regex flags: unknown, repeated and clashing flags are named');
    t.eq(['(\\d{3})-(\\d{4})', '(?<year>\\d{4})-(?<m>\\d\\d)(x)', '(?:a)(?=b)(?!c)(?<=d)(?<!e)(f)', '\\((a)\\)[(](b)', '[\\]()](c)', '(?<a>(?<b>x)(y))', ''].map(x.groupNames), [['', ''], ['year', 'm', ''], [''], ['', ''], [''], ['a', 'b', ''], []], 'capture groups are numbered like the engine numbers them: named groups by name; non-capturing groups, look-arounds, escaped and bracketed parentheses skipped');
    t.eq(x.jsonProblem(new Error('{"message":"Trailing comma","line":2,"column":3,"pos":7}')), { text: 'Trailing comma — line 2, column 3', pos: 7 }, 'an engine problem becomes a sentence with the position to select');
    t.eq(x.jsonProblem(new Error('boom')), { text: 'boom', pos: null }, 'any other error is shown as it is');
  }

  // ================================================================ UUID v7 from crypto.wasm: always increasing
  {
    const { bindSodium } = await load('/src/wasm/crypto.ts');
    const exports = await wasm('crypto'); exports.u_init();
    const na = bindSodium({ exports, memory: exports.memory });
    const T = 1794900000000, a = Array.from({ length: 20000 }, () => na.uuid(7, T));
    t.ok(a.every((u, i) => i === 0 || a[i - 1] < u), '20,000 version-7 UUIDs made in the same millisecond are strictly increasing (a batch sorts in the order it was made)');
    t.ok(a.every((u) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u)) && new Set(a).size === a.length && a.every((u) => parseInt(u.replace(/-/g, '').slice(0, 12), 16) === T), 'all are version 7, RFC variant, unique, and carry the millisecond they were made in');
    const steps = a.slice(1, 2000).map((u, i) => BigInt(`0x${u.replace(/-/g, '').slice(16)}`) - BigInt(`0x${a[i].replace(/-/g, '').slice(16)}`));
    t.ok(new Set(steps.map(String)).size > 1900, 'the step between neighbours is random (the next value cannot be guessed by adding 1)');
    const later = na.uuid(7, T + 1), back = na.uuid(7, T - 5000), back2 = na.uuid(7, T - 5000);
    t.ok(later > a[a.length - 1] && parseInt(later.replace(/-/g, '').slice(0, 12), 16) === T + 1, 'the next millisecond starts from fresh random bits and sorts after');
    t.ok(back > later && back2 > back && parseInt(back.replace(/-/g, '').slice(0, 12), 16) === T + 1, 'a clock that steps back a few seconds does not break the order: the last timestamp is kept');
    const reset = na.uuid(7, T - 60000);
    t.eq(parseInt(reset.replace(/-/g, '').slice(0, 12), 16), T - 60000, 'a clock set back by more than 10 s starts afresh from the new time');
    const first = Array.from({ length: 3000 }, (_, i) => na.uuid(7, T + 100000 + i)).map((u) => parseInt(u[15], 16));
    t.ok(new Set(first).size === 16, 'the random bits after the version are all in use');
    const v4 = Array.from({ length: 2000 }, () => na.uuid(4));
    t.ok(v4.every((u) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u)) && new Set(v4).size === 2000, 'version 4 is unchanged: random, version and variant bits set');
    const now = na.uuid(7); t.ok(Math.abs(parseInt(now.replace(/-/g, '').slice(0, 12), 16) - Date.now()) < 2000, 'without a time, the clock is used');
  }
};
