// Code Formatter (src/lib/codefmt.ts): the engines the tab runs — Biome's official WebAssembly build, dprint's JSON
// and markup plugins, Prettier beside them — held to parsers that belong to none of them (tests/lib/codefmt-check.mjs).
//
//  1. 140 hazard sections (tests/fixtures/codefmt/<lang>.txt) × 8 settings of the tab's options: the result means
//     what the input meant, formatting it again changes nothing, the engine is the one the language is assigned to
//     (or Prettier, for exactly the sections listed below).
//  2. The recorded layout (tests/fixtures/codefmt/layout.json; scripts/make-codefmt-layout.mjs).
//  3. Files of this repository (TypeScript, CSS, HTML, YAML, JSON, Markdown): same meaning, also on the second pass.
//  4. What each option does, and where it must do nothing. 5. Which engine is fetched for what (JSON never asks for
//     Biome). 6. The seam between the markup plugin and Biome: slot variables, handlers, quotes, Pug, Less.
//  7. TypeScript with and without JSX, declaration files. 8. JSON to the letter. 9. Markdown and HTML particulars.
// 10. Refusals and errors; engines that fail (stand-ins). 11. 1,400 broken texts: every call ends, the engines go on.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { same, jsonTokens, vueFile, program } from '../lib/codefmt-check.mjs';
import { loaders, hazards, LANGS, nameOf, prettierFormat } from '../lib/codefmt-node.mjs';

const OPTS = [{}, { semi: false }, { singleQuote: true }, { trailingComma: 'none' }, { trailingComma: 'es5' }, { printWidth: 40 }, { printWidth: 140, useTabs: true }, { tabWidth: 4, semi: false, singleQuote: true, trailingComma: 'none', printWidth: 60 }];
// Sections the language's own engine cannot read (docs/WASM-AUDIT.md, tab 54): Prettier formats them …
const PRETTIER_INSTEAD = {
  css: ['custom properties keep their text', 'old browser hacks'],     // --x: [1,2,3], --x: {a:b}; *zoom, filter: progid:…
  yaml: ['flow collections'],                                          // a flow sequence whose "]" stands in column 1
  vue: ['custom blocks and other languages'],                          // a Pug template, a Less block
};
// … and one that nothing reads (tables with omitted end tags): the tab shows the parser's message
const NOBODY = { html: ['optional tags and void elements'] };

export default async (t, { load, wasm, root }) => {
  const { makeFormatter, ENGINE, DEFAULTS } = await load('/src/lib/codefmt.ts');
  const F = makeFormatter(loaders);
  const fmt = (lang, text, o, name) => F.format(lang, text, o, name);
  const readerLang = (lang, title) => (lang === 'ts' && /TSX/.test(title) ? 'tsx' : lang);

  // ── the table of engines
  t.eq(ENGINE, { js: 'biome', ts: 'biome', css: 'biome', scss: 'biome', yaml: 'biome', graphql: 'biome', json: 'dprint-json', html: 'markup', vue: 'markup', markdown: 'prettier' }, 'nine languages on WebAssembly engines, Markdown on Prettier');
  t.eq(DEFAULTS, { printWidth: 80, tabWidth: 2, useTabs: false, semi: true, singleQuote: false, trailingComma: 'all' }, 'default options');

  // ── 1. hazards × options
  const layout = JSON.parse(readFileSync(join(root, 'tests/fixtures/codefmt/layout.json'), 'utf8'));
  let cases = 0, fellBack = 0;
  for (const lang of LANGS) {
    const bad = { meaning: [], stable: [], engine: [], form: [] };
    for (const [title, src] of hazards(lang)) {
      for (const o of OPTS) {
        cases++;
        const tag = `${lang} [${title}] ${JSON.stringify(o)}`;
        let r;
        try { r = await fmt(lang, src, o, nameOf(lang, title)); } catch (e) {
          if (!NOBODY[lang]?.includes(title)) bad.engine.push(`${tag}: no engine reads it (${String(e.message).split('\n')[0].slice(0, 80)})`);
          continue;
        }
        if (NOBODY[lang]?.includes(title)) { bad.engine.push(`${tag}: was expected to be refused by every engine`); continue; }
        const expectPrettier = PRETTIER_INSTEAD[lang]?.includes(title);
        if (expectPrettier) fellBack++;
        if (expectPrettier ? !(r.engine === 'prettier' && r.instead?.of === ENGINE[lang] && r.instead.why) : !(r.engine === ENGINE[lang] && !r.instead)) bad.engine.push(`${tag}: formatted by ${r.engine}${r.instead ? ` instead of ${r.instead.of}` : ''}`);
        const d = same(readerLang(lang, title), src, r.text);
        if (d) bad.meaning.push(`${tag}: ${d.slice(0, 200)}`);
        if (/\r/.test(r.text) || !r.text.endsWith('\n') || /\n\n$/.test(r.text)) bad.form.push(`${tag}: line ends`);
        const again = await fmt(lang, r.text, o, nameOf(lang, title));
        if (again.text !== r.text) bad.stable.push(`${tag} (${r.engine} → ${again.engine})`);
      }
    }
    const n = hazards(lang).length * OPTS.length;
    t.ok(!bad.meaning.length, `${lang}: ${n} hazard cases mean what they meant — ${bad.meaning.slice(0, 3).join(' ‖ ')}`);
    t.ok(!bad.stable.length, `${lang}: formatting a result again changes nothing — ${bad.stable.slice(0, 4).join(' ‖ ')}`);
    t.ok(!bad.engine.length, `${lang}: every case is formatted by the engine it is assigned to — ${bad.engine.slice(0, 4).join(' ‖ ')}`);
    t.ok(!bad.form.length, `${lang}: results end with one line feed and hold no carriage return — ${bad.form.slice(0, 4).join(' ‖ ')}`);
  }
  t.eq(cases, 1120, '140 sections × 8 settings');
  t.eq(fellBack, 4 * 8, 'Prettier steps in for exactly four sections');

  // ── 2. the recorded layout (default options)
  for (const lang of LANGS) {
    const diff = [];
    for (const [title, src] of hazards(lang)) {
      const want = layout.sections[lang]?.[title];
      let got; try { const r = await fmt(lang, src, {}, nameOf(lang, title)); got = { engine: r.instead ? `prettier (${r.instead.of} could not read it)` : r.engine, out: r.text.split('\n') }; } catch (e) { got = { engine: 'none', error: String(e.message).split('\n')[0] }; }
      if (JSON.stringify(got) !== JSON.stringify(want)) diff.push(title);
    }
    t.ok(!diff.length, `${lang}: the layout is the recorded one (node scripts/make-codefmt-layout.mjs, then read the diff) — ${diff.slice(0, 5).join(' ‖ ')}`);
    t.eq(Object.keys(layout.sections[lang]).length, hazards(lang).length, `${lang}: the record holds every section`);
  }

  // ── 3. files of this repository
  const walk = (dir, re, out = []) => { for (const n of readdirSync(dir)) { if (n === 'node_modules' || n === 'dist' || n === 'target' || n === 'vendor' || n.startsWith('.git')) continue; const p = join(dir, n), s = statSync(p); if (s.isDirectory()) walk(p, re, out); else if (re.test(n) && s.size < 250_000) out.push(p); } return out; };
  const sets = {
    ts: [...walk(join(root, 'src'), /\.ts$/), join(root, 'vite.config.ts')],
    js: [...walk(join(root, 'scripts'), /\.mjs$/), ...walk(join(root, 'tests/lib'), /\.mjs$/), ...walk(join(root, 'tests/e2e'), /^[a-f].*\.mjs$/)],
    css: [join(root, 'src/styles.css')],
    html: [join(root, 'index.html')],
    yaml: walk(join(root, '.github'), /\.ya?ml$/),
    json: [join(root, 'package.json'), join(root, 'tsconfig.json'), join(root, 'scripts/assets.json'), join(root, 'tests/fixtures/sqlfmt/corpus.json'), join(root, 'src/lib/tzabbr.json')],
    markdown: [join(root, 'todo.md'), join(root, 'docs/sodium-format.md'), join(root, 'docs/IDEAS.md'), join(root, 'docs/potentials.md'), join(root, 'tests/fixtures/README.md')],
  };
  for (const [lang, files] of Object.entries(sets)) {
    const bad = []; let n = 0, skipped = 0;
    for (const f of files) {
      let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
      if (same(lang, src, src) !== '') { skipped++; continue; }             // the reader itself cannot read it
      n++;
      const name = f.slice(root.length + 1);
      let r; try { r = await fmt(lang, src, {}, name); } catch (e) { bad.push(`${name}: ${String(e.message).split('\n')[0].slice(0, 80)}`); continue; }
      const d = same(lang, src, r.text);
      if (d) { bad.push(`${name} [${r.engine}]: ${d.slice(0, 160)}`); continue; }
      const again = await fmt(lang, r.text, {}, name), d2 = same(lang, src, again.text);
      if (d2) bad.push(`${name}, second pass: ${d2.slice(0, 160)}`);
    }
    t.ok(!bad.length, `${lang}: ${n} files of this repository keep their meaning, also when formatted twice — ${bad.slice(0, 3).join(' ‖ ')}`);
    t.ok(n >= { ts: 150, js: 30, css: 1, html: 1, yaml: 1, json: 4, markdown: 4 }[lang] && skipped <= 2, `${lang}: ${n} files read (${skipped} the reader could not read)`);
  }

  // ── 4. the options
  const JS = "const a = {b: 'c', \"d\": [1, 2, 3], e: function (x) { return x + 'it\\'s' }}\nfoo(reallyLongArgumentNumberOne, reallyLongArgumentNumberTwo, reallyLongArgumentNumberThree, four)\n";
  const js = async (o) => (await fmt('js', JS, o)).text;
  t.ok((await js({})).split('\n').filter((l) => /[^{},(\[]$/.test(l) && l.trim()).every((l) => l.endsWith(';')), 'semicolons: on');
  t.ok(!/;\s*$/m.test(await js({ semi: false })), 'semicolons: off — no line ends with one');
  t.ok((await js({})).includes('b: "c"') && (await js({ singleQuote: true })).includes("b: 'c'"), 'quotes: double, single');
  t.ok((await js({ singleQuote: true })).includes('"it\'s"'), 'single quotes: a string with an apostrophe keeps double quotes');
  t.ok(/four,\n\);/.test(await js({})) && /four,\n\);/.test(await js({ trailingComma: 'all' })) && /four\n\);/.test(await js({ trailingComma: 'es5' })) && /four\n\);/.test(await js({ trailingComma: 'none' })), 'trailing commas in arguments: all — yes; es5, none — no');
  const LIST = 'const list = [alphaAlpha, betaBeta, gammaGamma, deltaDelta]';
  t.ok(/deltaDelta,\n\];/.test((await fmt('js', LIST, { printWidth: 30 })).text) && /deltaDelta,\n\];/.test((await fmt('js', LIST, { printWidth: 30, trailingComma: 'es5' })).text) && /deltaDelta\n\];/.test((await fmt('js', LIST, { printWidth: 30, trailingComma: 'none' })).text), 'trailing commas in a list: all and es5 — yes; none — no');
  for (const w of [40, 60, 100, 160]) t.ok((await js({ printWidth: w })).split('\n').every((l) => l.length <= w), `print width ${w}: no line is longer`);
  t.ok((await js({ printWidth: 160 })).includes('foo(reallyLongArgumentNumberOne, reallyLongArgumentNumberTwo, reallyLongArgumentNumberThree, four);'), 'print width 160: the call fits on its line');
  t.ok(/^\tb: "c"/m.test(await js({ useTabs: true, printWidth: 30 })) && /^ {4}b: "c"/m.test(await js({ tabWidth: 4, printWidth: 30 })) && /^ {2}b: "c"/m.test(await js({ printWidth: 30 })), 'indent: a tab, four spaces, two spaces');
  t.ok((await fmt('css', "a{content:'x';b:\"y\"}", {})).text.includes('content: "x"') && (await fmt('css', "a{content:'x';b:\"y\"}", { singleQuote: true })).text.includes("b: 'y'"), 'CSS: quotes follow the option');
  t.ok((await fmt('scss', "$a:'x';", { singleQuote: true })).text.includes("$a: 'x'") && (await fmt('scss', "$a:'x';", {})).text.includes('$a: "x"'), 'SCSS: quotes follow the option');
  t.eq((await fmt('yaml', 'a: "x"\nb: \'y\'\nc: "tab\\there"\nd: "it\'s"\n', { singleQuote: true })).text, "a: 'x'\nb: 'y'\nc: \"tab\\there\"\nd: \"it's\"\n", 'YAML: single quotes where they mean the same — an escape and an apostrophe keep double quotes');
  t.eq((await fmt('yaml', 'a: "x"\nb: \'y\'\n', {})).text, 'a: "x"\nb: "y"\n', 'YAML: double quotes by default');
  t.eq((await fmt('yaml', 'a:\n    b:\n        - c\n', { tabWidth: 4, useTabs: true })).text.includes('\t'), false, 'YAML: never a tab, whatever the option says');
  t.eq((await fmt('graphql', '{a(b:"c")}', { singleQuote: true })).text, '{\n  a(b: "c")\n}\n', 'GraphQL: strings keep their double quotes (the language has no other)');
  const J = '{"a":[1,2,3],"b":{"c":"d"}}';
  for (const o of OPTS) t.eq(jsonTokens((await fmt('json', J, o)).text).toks, jsonTokens(J).toks, `JSON: the tokens under ${JSON.stringify(o)}`);
  t.eq((await fmt('json', J, { printWidth: 20, useTabs: true })).text, '{\n\t"a": [1, 2, 3],\n\t"b": { "c": "d" }\n}\n', 'JSON: width and tabs');
  t.eq((await fmt('json', J, { semi: false, singleQuote: true, trailingComma: 'none' })).text, (await fmt('json', J, {})).text, 'JSON: semicolons, quotes and trailing commas change nothing');
  t.eq((await fmt('markdown', '* a\n    * b\n', { singleQuote: true, semi: false })).text, '- a\n  - b\n', 'Markdown: list layout');
  t.ok((await fmt('html', '<script>let a="x"</script>', { singleQuote: true, semi: false })).text.includes("let a = 'x'\n"), 'HTML: the options reach the script inside');
  t.ok((await fmt('vue', '<script>let a="x"</script>', { singleQuote: true, semi: false })).text.includes("let a = 'x'\n"), 'Vue: the options reach the script');

  // ── 5. which engine is fetched for what
  const counting = () => {
    const seen = [];
    return { seen, F: makeFormatter({ biome: () => { seen.push('biome'); return loaders.biome(); }, dprint: (p) => { seen.push(p); return loaders.dprint(p); }, prettier: (p) => { seen.push(`prettier:${p}`); return loaders.prettier(p); } }) };
  };
  const fetched = async (steps) => { const c = counting(); for (const [lang, text] of steps) await c.F.format(lang, text).catch(() => {}); return c.seen.join(' '); };
  t.eq(await fetched([['json', '{"a":1}'], ['json', '[1]']]), 'json', 'JSON: the JSON plugin, once — never Biome');
  t.eq(await fetched([['html', '<p>a <b>b</b></p>'], ['html', '<p style="a:b" onclick="c()">d</p>']]), 'markup', 'HTML without script or style: the markup plugin alone');
  t.eq(await fetched([['html', '<p>a</p><script>let a</script>']]), 'markup biome', 'HTML with a script: the markup plugin and Biome');
  t.eq(await fetched([['html', '<style>a{b:c}</style>']]), 'markup biome', 'HTML with a style sheet: the markup plugin and Biome');
  t.eq(await fetched([['html', '<script type="application/ld+json">{"a":1}</script>']]), 'markup biome json', 'HTML with a JSON block: the JSON plugin too');
  t.eq(await fetched([['markdown', '# a'], ['markdown', '*b*']]), 'prettier:markdown', 'Markdown: Prettier, once');
  t.eq(await fetched([['js', 'a'], ['ts', 'let a: 1'], ['css', 'a{}'], ['scss', '$a:1;'], ['yaml', 'a: 1'], ['graphql', '{a}']]), 'biome', 'six languages: Biome, once');
  t.eq(await fetched([['vue', '<template><p>{{ a }}</p></template>']]), 'markup biome', 'Vue: the markup plugin and Biome');
  t.eq(await fetched([['css', 'a{*zoom:1}']]), 'biome prettier:css', 'CSS Biome cannot read: Prettier is fetched then, not before');
  t.eq(await fetched([['js', 'function ( {']]), 'biome prettier:babel', 'broken JavaScript: Prettier is asked too (its message is the one shown)');
  t.eq(await fetched([['vue', '<template lang="pug">\np x\n</template>']]), 'prettier:vue', 'Vue with a Pug template: straight to Prettier');

  // ── 6. the seam between the markup plugin and Biome
  const vue = async (text, o) => fmt('vue', text, o);
  const compiles = (text) => { try { vueFile(text); return true; } catch { return false; } };
  const HANDLER = '<template>\n  <button @click="count+=1;log(count)" v-on:keyup.enter="a();b()">x</button>\n</template>\n';
  for (const o of [{}, { semi: false }]) {
    const r = await vue(HANDLER, o);
    t.ok(r.engine === 'markup' && r.text.includes('@click="count+=1;log(count)"') && r.text.includes('v-on:keyup.enter="a();b()"') && compiles(r.text), `Vue: a handler of several statements stays as typed (${JSON.stringify(o)})`);
  }
  const SLOT = `<template>\n  <VirtualScroller><template v-slot:content="{ styleClass, contentRef, items, getItemOptions, contentStyle, itemSize }"><ul :ref="(el) => listRef(el, contentRef)"></ul></template></VirtualScroller>\n</template>\n`;
  for (const o of [{}, { printWidth: 40 }, { printWidth: 160 }]) {
    const r = await vue(SLOT, o);
    t.ok(r.engine === 'markup' && compiles(r.text) && same('vue', SLOT, r.text) === '' && !/\blet\b/.test(r.text), `Vue: the variables of a slot, however long, come back as they went (${JSON.stringify(o)})`);
  }
  const QUOTES = `<template>\n  <p :title="'it\\'s'" :a="x === 'y' ? 'say &quot;hi&quot;' : \`t\${1}\`" :b='{"k": 1}' v-if="s == &quot;q&quot;">{{ "double" + 'single' }}</p>\n</template>\n`;
  for (const o of [{}, { singleQuote: true }]) {
    const r = await vue(QUOTES, o);
    t.ok(r.engine === 'markup' && compiles(r.text) && same('vue', QUOTES, r.text) === '', `Vue: quotes inside attributes survive (${JSON.stringify(o)}) — ${same('vue', QUOTES, r.text)}`);
  }
  const TIDY = await vue('<template><li v-for="(item,i) in items" :key="item.id" :class="{active:i===cur,\'is-last\':i==n-1}" v-if="a&&b||c">{{i+1}}</li></template>');
  t.ok(['v-for="(item, i) in items"', ':key="item.id"', ":class=\"{ active: i === cur, 'is-last': i == n - 1 }\"", 'v-if="(a && b) || c"', '{{ i + 1 }}'].every((x) => TIDY.text.includes(x)), `Vue: the expressions of a template are tidied — ${TIDY.text}`);
  const PUG = '<template lang="pug">\ndiv.card\n  h2 {{ title }}\n</template>\n<script>\nexport default {name:"x"}\n</script>\n';
  const pug = await vue(PUG);
  t.ok(pug.engine === 'prettier' && pug.instead.of === 'markup' && /another language/.test(pug.instead.why) && pug.text.includes('div.card\n  h2 {{ title }}') && pug.text.includes('name: "x"'), 'Vue: a Pug template is left alone (Prettier formats the rest)');
  const less = await vue('<template><p>x</p></template>\n<style lang="less">\n@c:red;.a{color:@c}\n</style>\n');
  t.ok(less.engine === 'prettier' && /Less/.test(less.instead.why) && less.text.includes('@c: red;'), 'Vue: a file with a Less block goes to Prettier, which formats it');
  const viaPrettier = await vue('<template>\n  <b @click="a=1;b()">x</b>\n</template>\n<script>\nlet a = 1\n</script>\n<style lang="less">\n@c:red;\n</style>\n', { semi: false });
  t.ok(viaPrettier.engine === 'prettier' && viaPrettier.notes.some((n) => /Semicolons were kept/.test(n)) && compiles(viaPrettier.text) && /a = 1;\s+b\(\);/.test(viaPrettier.text), `Vue through Prettier without semicolons: a handler of several statements keeps them, and the result says so — ${viaPrettier.text}`);
  const noHandler = await vue('<template>\n  <b @click="go">x</b>\n</template>\n<script>\nlet a = 1;\n</script>\n<style lang="less">\n@c:red;\n</style>\n', { semi: false });
  t.ok(noHandler.engine === 'prettier' && !noHandler.notes.length && noHandler.text.includes('let a = 1\n'), 'Vue through Prettier without semicolons and without such a handler: the option is obeyed');
  const scssVue = await vue('<template><p>x</p></template>\n<style scoped lang="scss">\n$g:8px;.a{b{c:$g}}\n</style>\n');
  t.ok(scssVue.engine === 'markup' && scssVue.text.includes('$g: 8px;\n.a {\n  b {\n    c: $g;\n  }\n}'), 'Vue: an SCSS block is formatted');
  const tsVue = await vue('<script setup lang="ts">\nconst props=defineProps<{items:Item[];title?:string}>()\n</script>\n');
  t.ok(tsVue.text.includes('const props = defineProps<{ items: Item[]; title?: string }>();'), 'Vue: a TypeScript script is formatted');

  // ── 7. TypeScript: with JSX, without, declaration files
  t.eq((await fmt('ts', 'const a = <T>x')).text, 'const a = <T>x;\n', 'TypeScript: <T>x is a cast');
  t.eq((await fmt('ts', 'const a = <div className="x">y</div>')).text, 'const a = <div className="x">y</div>;\n', 'TypeScript: JSX is read when the text is JSX');
  t.eq((await fmt('ts', 'const a = <T,>(x: T) => x', {}, 'a.tsx')).text, 'const a = <T,>(x: T) => x;\n', '.tsx: a generic arrow keeps its comma');
  t.eq((await fmt('ts', 'declare const VERSION: string; export const x: number;')).text, 'declare const VERSION: string;\nexport const x: number;\n', 'TypeScript: a declaration file is read as one');
  t.eq((await fmt('ts', 'export const x: number;\nexport function f(a: string): void;', {}, 'lib.d.ts')).engine, 'biome', '.d.ts: Biome reads it');
  t.eq((await fmt('js', 'const a = <div>{x}</div>')).text, 'const a = <div>{x}</div>;\n', 'JavaScript: JSX');
  t.ok((await fmt('ts', 'class A { constructor(@Inject(T) private t: T) {} }')).engine === 'biome', 'TypeScript: parameter decorators');

  // ── 8. JSON to the letter
  let seed = 54;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const spell = () => { const i = String(rnd(100000)), f = ['', '.0', '.50', '.000', `.${rnd(1000)}0`][rnd(5)], e = ['', 'e5', 'E+10', 'e-07', 'E0'][rnd(5)]; return `${rnd(4) ? '' : '-'}${i}${f}${e}`; };
  const numbers = Array.from({ length: 300 }, spell);
  const NUM = `{"n":[${numbers.join(',')}]}`;
  const numOut = (await fmt('json', NUM)).text;
  t.eq(jsonTokens(numOut).toks.filter((x) => /^-?\d/.test(x)), numbers, 'JSON: 300 numbers come back exactly as they were typed (1.50, 1E+10, 1e-07, -0.000)');
  t.ok(numbers.includes(numbers.find((x) => /\.\d*0$|E\+|e-0/.test(x))), '… and the list holds spellings a number type would lose');
  const DUP = '{"a":1,"a":2,"b":"\\u00e9\\/\\n","":null,"big":12345678901234567890123,"small":0.1000000000000000055511151231257827}';
  t.eq(jsonTokens((await fmt('json', DUP)).text).toks, jsonTokens(DUP).toks, 'JSON: repeated keys, escapes and long numbers stay');
  t.eq((await fmt('json', '// c\n{"a":1,/* d */"b":[1,2,],}\n')).text, '// c\n{ "a": 1, /* d */ "b": [1, 2] }\n', 'JSON with comments');
  const big = `[${Array.from({ length: 20000 }, (_, i) => `{"id":${i},"name":"item ${i}","tags":["a","b"],"price":${i}.50}`).join(',')}]`;
  const t0 = Date.now(), bigOut = (await fmt('json', big)).text;
  t.ok(bigOut.length > big.length && Date.now() - t0 < 8000 && jsonTokens(bigOut).toks.length === jsonTokens(big).toks.length, `JSON: 1.3 MB in ${Date.now() - t0} ms`);
  // JSON5-like text: the plugin reads it and writes JSON's double quotes; what the text says stays (JavaScript reads both)
  const J5 = `{'a': 'it\\'s', "b": 'say "hi"', c: 'back\\\\slash', 'd"e': 1, f: +1, g: .5, h: 0x1F, i: [Infinity, -Infinity], k: "\\x41\\u00e9",}`;
  const j5 = await fmt('json', J5), value = (s) => JSON.stringify((0, eval)(`(${s})`), (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));
  t.ok(j5.engine === 'dprint-json' && value(j5.text) === value(J5) && j5.text.includes('"a": "it\'s"') && j5.text.includes('0x1F') && j5.text.includes('.5'), `JSON5-like text keeps what it says — ${j5.text.replace(/\n\s*/g, ' ')}`);
  let notJson = ''; try { await fmt('json', '{"a": [1, 2}'); } catch (e) { notJson = e.message; }
  t.ok(/\(1:\d+\)/.test(notJson), 'JSON that is not JSON: the message with the place');

  // ── 9. Markdown and HTML particulars
  const FENCE = '# T\n\n```js\nconst  x   =  {a:1}\n```\n\n```markdown\n*  a\n*  b\n```\n\n```json\n{"a":1.50}\n```\n';
  t.eq((await fmt('markdown', FENCE)).text, FENCE, 'Markdown: the code inside fences is left exactly as it is');
  t.eq((await fmt('markdown', 'a very long line '.repeat(12).trim() + '\nsecond line\n')).text, 'a very long line '.repeat(12).trim() + '\nsecond line\n', 'Markdown: lines are not re-wrapped');
  t.eq((await fmt('markdown', '|a|b|\n|-|-:|\n|1|22|\n')).text, '| a   |   b |\n| --- | --: |\n| 1   |  22 |\n', 'Markdown: a table is aligned');
  t.eq((await fmt('markdown', 'hard  \nbreak\\\nkept\n')).text, 'hard  \nbreak\\\nkept\n', 'Markdown: hard line breaks stay');
  // the GitHub reference implementation (our markdown.wasm) as a second reader: it knows footnotes
  const { bindMarkdown } = await load('/src/wasm/markdown.ts');
  const cmark = bindMarkdown(await wasm('markdown'));
  const page = (s) => cmark.html(s.replace(/\r\n/g, '\n')).replace(/<pre[\s\S]*?<\/pre>/g, (m) => m.replace(/[ \t]+$/gm, '')).replace(/>\s+</g, '><').replace(/\s+/g, ' ');
  const mdBad = [];
  for (const [title, src] of hazards('markdown')) { if (title === 'front matter') continue; const r = await fmt('markdown', src); if (page(src) !== page(r.text)) mdBad.push(title); }
  t.ok(!mdBad.length, `Markdown: cmark-gfm renders every hazard section the same before and after — ${mdBad.join(' ‖ ')}`);
  const html = async (s, o) => (await fmt('html', s, o)).text;
  t.eq(await html('<p style="color:red;background:blue" onclick="a();b({x:1})">x</p>'), '<p style="color:red;background:blue" onclick="a();b({x:1})">x</p>\n', 'HTML: style and handler attributes stay as typed');
  t.ok((await html('<script type="application/ld+json">{"price":1.50,"n":1E+2}</script>')).includes('{ "price": 1.50, "n": 1E+2 }'), 'HTML: numbers in a JSON block stay as typed');
  t.eq(await html('<pre>\n  a   b\n\tc\n</pre>'), '<pre>\n  a   b\n\tc\n</pre>\n', 'HTML: <pre> is left alone');
  t.eq(await html('<p><b>a</b><i>b</i> <u>c</u></p>'), '<p><b>a</b><i>b</i> <u>c</u></p>\n', 'HTML: no white space appears or disappears between inline elements');
  t.ok((await html('<!DOCTYPE html><title>t</title>')).startsWith('<!DOCTYPE html>') && (await html('<!doctype html><title>t</title>')).startsWith('<!doctype html>'), 'HTML: the doctype keeps its case');
  const optional = await fmt('html', '<ul><li>one<li>two</ul>');
  t.ok(optional.engine === 'prettier' && optional.instead.of === 'markup' && /<li>one<\/li>/.test(optional.text), 'HTML with omitted end tags: Prettier formats it');

  // ── 10. refusals and errors
  const hack = await fmt('css', 'a{*zoom:1;color:red}');
  t.ok(hack.engine === 'prettier' && hack.instead.of === 'biome' && /\(line 1, column 4\)$/.test(hack.instead.why) && hack.text === 'a {\n  *zoom: 1;\n  color: red;\n}\n', `CSS with an IE hack: Prettier formats it, and the reason names the place — ${hack.instead.why}`);
  const where = await fmt('yaml', 'ключ: значение\nlist: [\n  1,\n  2\n]\n');
  t.ok(where.engine === 'prettier' && /\(line 5, column 1\)$/.test(where.instead.why), `the place is counted in characters, not bytes — ${where.instead.why}`);
  for (const [lang, text, re] of [['js', 'function ( {', /\(1:\d+\)/], ['ts', 'const a: = 1', /\(1:\d+\)/], ['json', '{"a":}', /\(1:\d+\)/], ['yaml', 'a: [1, 2\nb: 3', /\d+:\d+/], ['graphql', '{ a(', /\(1:\d+\)/], ['scss', '.a { b: ', /\(1:\d+\)/], ['vue', '<template><div></template>', /\d+:\d+/]]) {
    let msg = ''; try { await fmt(lang, text); } catch (e) { msg = String(e.message); }
    t.ok(re.test(msg), `${lang}: text nobody can read gives the parser's message with the place — ${msg.split('\n')[0].slice(0, 90)}`);
  }
  t.eq((await fmt('js', '')).text, '', 'an empty text stays empty');
  // engines that fail, as stand-ins
  const standIn = (over) => makeFormatter({ biome: loaders.biome, dprint: loaders.dprint, prettier: async () => async () => 'PRETTIER\n', ...over });
  const garbled = standIn({ dprint: async () => ({ setConfig() {}, setHostFormatter() {}, formatText: () => '<p>lost</p>\n' }) });
  const g = await garbled.format('html', '<p>kept</p>');
  t.ok(g.engine === 'prettier' && g.text === 'PRETTIER\n' && /same text/.test(g.instead.why), 'a markup result that does not hold the letters of the input is not used');
  const crash = standIn({ biome: async () => ({ Workspace: class { openProject() { return { projectKey: 1 }; } updateSettings() {} openFile() {} closeFile() {} formatFile() { throw new Error('unreachable'); } pullDiagnostics() { throw new Error('unreachable'); } } }) });
  const c = await crash.format('js', 'a');
  t.ok(c.engine === 'prettier' && c.instead.why === 'unreachable', 'an engine that fails outright is treated like one that refuses');
  let loadFail = ''; try { await standIn({ biome: async () => { throw new Error('HTTP 404'); } }).format('js', 'a'); } catch (e) { loadFail = e.message; }
  t.eq(loadFail, 'HTTP 404', 'an engine that cannot be fetched is an error, not a silent switch to another engine');
  let both = ''; try { await standIn({ prettier: async () => async () => { throw new Error('SyntaxError: nope (1:1)'); } }).format('js', 'function ( {'); } catch (e) { both = e.message; }
  t.eq(both, 'SyntaxError: nope (1:1)', 'when Prettier cannot read it either, its message is the error');

  // ── 11. broken texts: every call ends, and the engines go on working
  let done = 0, kept = 0; const wrong = [];
  for (const lang of LANGS) {
    for (const [title, src] of hazards(lang)) {
      for (let k = 0; k < 10; k++) {
        const cut = src.slice(0, 1 + rnd(Math.max(1, src.length - 1)));
        done++;
        let r; try { r = await fmt(lang, cut, OPTS[k % OPTS.length], nameOf(lang, title)); } catch (e) { if (!(e instanceof Error) || !e.message) wrong.push(`${lang} [${title}]: an error without words`); continue; }
        kept++;
        // A strict engine took the text, so the text is sound and the result must mean the same. What only lenient
        // Prettier takes (an at-rule cut off inside its brackets, a code fence that never closes) has no meaning to keep.
        if (r.engine === 'prettier') continue;
        const d = same(readerLang(lang, title), cut, r.text);
        if (d && d !== 'skip') wrong.push(`${lang} [${title}] cut at ${cut.length} [${r.engine}]: ${d.slice(0, 140)}`);
      }
    }
  }
  t.eq(done, 1400, '1,400 cut-off texts: every call ended');
  t.ok(kept > 300, `${kept} of them were still readable and were formatted`);
  t.ok(!wrong.length, `… and those mean what they meant — ${wrong.slice(0, 3).join(' ‖ ')}`);
  for (const lang of LANGS) {
    const [title, src] = hazards(lang)[0];
    const r = await fmt(lang, src, {}, nameOf(lang, title));
    t.eq(r.text.split('\n'), layout.sections[lang][title].out, `${lang}: after all that the engine prints what it printed before`);
  }
  // the embedded-program reader agrees with itself on what the checks above rest on
  t.ok(program('a;[1].map(f)', 'js').shape.join() !== program('a\n[1].map(f)', 'js').shape.join() && program('a;[1].map(f)', 'js').shape.join() === program('a\n;[1].map(f)', 'js').shape.join(), 'the reader tells a[1] from a; [1]');
};
