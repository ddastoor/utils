// Code Formatter (#/prettier, PC only). What the tab shows is held to references that are not the tab:
//  · the independent readers of tests/lib/codefmt-check.mjs (TypeScript's parser, PostCSS, eemeli's yaml, marked,
//    parse5, graphql-js, the Vue compiler; JSON by its tokens): every result means what the input meant;
//  · the engines themselves run in Node from node_modules (tests/lib/codefmt-node.mjs): the browser path — worker,
//    WebAssembly from this site, the markup plugin calling back into Biome — prints the same text;
//  · the Prettier package in Node, where the tab says Prettier formatted the text.
// Covered: nothing fetched before Format, which engine is fetched for which language, the ten samples, all 140
// hazard sections, every option, the fallback and its note, errors, format as you type (a slow result cannot
// overwrite a newer one), Ctrl+Enter, switching the language, files by extension, download and copy, a large file,
// a slow and a failing download of the engine, leaving the tab, the phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { setValue, until, hookClipboard, copied } from './_devdata.mjs';
import { same, vueFile, jsonTokens } from '../lib/codefmt-check.mjs';
import { engine, hazards, LANGS, nameOf, prettierFormat } from '../lib/codefmt-node.mjs';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nm = (p) => fileURLToPath(new URL(`../../node_modules/${p}`, import.meta.url));
const SIZE = { biome: statSync(nm('@biomejs/wasm-web/biome_wasm_bg.wasm')).size, json: statSync(nm('@dprint/json/plugin.wasm')).size, markup: statSync(nm('dprint-plugin-markup/plugin.wasm')).size };
const LABEL = { js: 'JavaScript / JSX', ts: 'TypeScript / TSX', css: 'CSS', scss: 'SCSS', html: 'HTML', json: 'JSON', yaml: 'YAML', markdown: 'Markdown', graphql: 'GraphQL', vue: 'Vue' };
const BY = { js: 'Biome', ts: 'Biome', css: 'Biome', scss: 'Biome', yaml: 'Biome', graphql: 'Biome', json: 'dprint’s JSON formatter', html: 'markup_fmt', vue: 'markup_fmt', markdown: 'Prettier' };

export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const F = await engine();
  const node = async (lang, text, o, name) => { try { return await F.format(lang, text, o, name); } catch (e) { return { error: String(e.message) }; } };

  /** A page on the tab, with what it fetched: the engines by their size, Prettier's chunks by their name. */
  const open = async () => {
    const page = await newPage(); const got = [];
    page.on('response', async (r) => {
      const u = r.url();
      if (/\.wasm(\?|$)/.test(u)) { const n = Number(r.headers()['content-length'] || 0); got.push(n === SIZE.biome ? 'biome' : n === SIZE.json ? 'json' : n === SIZE.markup ? 'markup' : `wasm:${u.split('/').pop()}`); }
      else if (/codefmt\.worker/.test(u)) got.push('worker');
      else if (/assets\/(standalone|babel|estree|typescript|postcss|html|yaml|markdown|graphql)-[\w-]+\.js/.test(u)) got.push(`prettier:${/assets\/(\w+)-/.exec(u)[1]}`);
    });
    await page.goto(`${base}#/prettier`);
    await page.locator('textarea').first().waitFor();
    return Object.assign(page, { got });
  };
  const src = (page) => page.locator('textarea').nth(0), out = (page) => page.locator('textarea').nth(1);
  const status = async (page) => (await page.locator('.card .note-ok, .card .note-warn, .card .note-info').allTextContents()).map((x) => x.trim());
  /** Click Format and wait for its answer: { text, notes }. */
  const settle = async (page) => {
    const done = await until(page, () => !!document.querySelector('.card .note-ok, .card .note-warn') && ![...document.querySelectorAll('.card .note-info')].some((n) => /Formatting …|Fetching Biome/.test(n.textContent)), null, 60000);
    return { done, text: await out(page).inputValue(), notes: await status(page), warn: (await page.locator('.card .note-warn').allTextContents()).join('\n') };
  };
  const format = async (page) => { await page.getByRole('button', { name: 'Format', exact: true }).click(); return settle(page); };
  /** Open a file in the tab and wait for its result (the notes of the result before are taken away first: the tab reads the file before it starts). */
  const openFile = async (page, name, text) => { const f = join(tmp, name); writeFileSync(f, text); await page.evaluate(() => document.querySelectorAll('.card .note-ok, .card .note-warn').forEach((n) => n.remove())); await page.locator('.drop input[type=file]').setInputFiles(f); return settle(page); };
  const pick = (page, lang) => page.locator('select').first().selectOption(lang);
  const put = async (page, lang, text) => { await pick(page, lang); await setValue(src(page), text); };

  // ── nothing before Format; the ten samples
  const page = await open();
  await page.waitForTimeout(400);
  ok(page.got.length === 0, `nothing of the engines is fetched before Format (${page.got.join(', ') || 'nothing'})`);
  ok(await page.locator('select').first().inputValue() === 'js' && (await page.locator('select option').allTextContents()).join('|') === Object.values(LABEL).join('|'), 'ten languages, JavaScript first');
  for (const lang of ['json', 'markdown', 'html', 'js', 'ts', 'css', 'scss', 'yaml', 'graphql', 'vue']) {
    await pick(page, lang);
    const sample = await src(page).inputValue(), before = page.got.length;
    const r = await format(page), want = await node(lang, sample);
    const fetched = page.got.slice(before).join(' ');
    ok(r.done && r.text === want.text && same(lang, sample, r.text) === '' && r.notes[0] === `Formatted by ${BY[lang]}.` && r.text !== sample, `${LABEL[lang]}: the sample is formatted by ${BY[lang]}, means what it meant, and equals the engine run in Node — ${r.notes.join(' / ')}`);
    if (lang === 'json') ok(fetched === 'worker json', `JSON: the worker and the JSON plugin are fetched — not Biome (${fetched})`);
    if (lang === 'markdown') ok(fetched === 'prettier:standalone prettier:markdown' || fetched === 'prettier:markdown prettier:standalone', `Markdown: Prettier and its Markdown plugin only (${fetched})`);
    if (lang === 'html') ok(fetched.split(' ').sort().join(' ') === 'biome markup', `HTML with a script: the markup plugin and Biome (${fetched})`);
    if (lang === 'js') ok(fetched === '', 'JavaScript after that: nothing more to fetch');
  }
  const again = await format(page);
  ok(again.text === (await node('vue', await src(page).inputValue())).text, 'formatting again gives the same result');
  await setValue(src(page), again.text);
  ok((await format(page)).notes[0] === 'Already formatted — markup_fmt changes nothing.', 'a formatted text is called "already formatted"');

  // ── plain HTML never fetches Biome
  {
    const p = await open();
    await put(p, 'html', '<p>Open <b>7 am</b> to <i>10 pm</i>.</p><ul><li>a</li><li>b</li></ul>');
    const r = await format(p);
    ok(r.done && p.got.join(' ') === 'worker markup' && r.text === '<p>Open <b>7 am</b> to <i>10 pm</i>.</p>\n<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>\n', `HTML without script or style: the markup plugin alone, and a fragment on one line is laid out (${p.got.join(' ')}) — ${JSON.stringify(r.text)}`);
    await p.close();
  }

  // ── every hazard section through the tab
  let sections = 0;
  for (const lang of LANGS) {
    const bad = [];
    await pick(page, lang);
    for (const [title, text] of hazards(lang)) {
      sections++;
      // a TypeScript section with JSX is a .tsx file: the tab learns that from a file's name, so those are opened as files
      let r;
      if (nameOf(lang, title)) r = await openFile(page, 'section.tsx', text); else { await setValue(src(page), text); r = await format(page); }
      const want = await node(lang, text, {}, nameOf(lang, title));
      if (!r.done) { bad.push(`${title}: no answer`); continue; }
      if (want.error) { if (!r.warn.includes(want.error.split('\n')[0].slice(0, 40)) || r.text !== '') bad.push(`${title}: the error is not shown`); continue; }
      if (r.text !== want.text) { bad.push(`${title}: differs from the engine in Node`); continue; }
      const d = same(lang === 'ts' && nameOf(lang, title) ? 'tsx' : lang, text, r.text);
      if (d) bad.push(`${title}: ${d.slice(0, 120)}`);
      const by = want.instead ? 'Prettier' : BY[lang];
      if (!r.notes[0].includes(by) || (want.instead && !r.notes.some((n) => n.includes('could not read this text') && n.includes(want.instead.why)))) bad.push(`${title}: ${r.notes.join(' / ')}`);
    }
    ok(!bad.length, `${LABEL[lang]}: ${hazards(lang).length} hazard sections — same meaning, same text as the engine in Node, the engine named (${bad.slice(0, 3).join(' ‖ ') || 'all'})`);
  }
  ok(sections === 140, '140 sections');

  // ── the options
  const JS = hazards('js').find(([t]) => t === 'long lines that must break')[1] + hazards('js').find(([t]) => t === 'strings and their quotes')[1];
  await put(page, 'js', JS);
  ok((await format(page)).text === (await node('js', JS)).text, 'options: the defaults (80, 2 spaces, semicolons, double quotes, trailing commas)');
  await page.locator('input[type=range]').fill('40'); await page.locator('input[type=range]').dispatchEvent('input');
  await page.getByRole('radio', { name: 'Tabs' }).click();
  await page.locator('label.switch', { hasText: 'Semicolons' }).click();
  await page.locator('label.switch', { hasText: 'Single quotes' }).click();
  await page.getByRole('radio', { name: 'None' }).click();
  const all = { printWidth: 40, useTabs: true, semi: false, singleQuote: true, trailingComma: 'none' };
  let r = await format(page);
  ok(r.text === (await node('js', JS, all)).text && same('js', JS, r.text) === '' && /^\t/m.test(r.text) && !/;$/m.test(r.text) && r.text.includes("'part one of a long string '") && !/,\n\s*[)\]]/.test(r.text), 'options: width 40, tabs, no semicolons, single quotes, no trailing commas');
  await page.getByRole('radio', { name: '4 spaces' }).click(); await page.getByRole('radio', { name: 'ES5' }).click();
  r = await format(page);
  ok(r.text === (await node('js', JS, { ...all, useTabs: false, tabWidth: 4, trailingComma: 'es5' })).text && /^ {4}\S/m.test(r.text), 'options: 4 spaces, ES5 commas');
  for (const [lang, title] of [['css', 'strings and urls'], ['yaml', 'quotes and escapes'], ['vue', 'script setup with TypeScript and scoped SCSS'], ['html', 'scripts and styles'], ['json', 'numbers as typed']]) {
    const text = hazards(lang).find(([t]) => t === title)[1];
    await put(page, lang, text);
    r = await format(page);
    const want = await node(lang, text, { ...all, useTabs: false, tabWidth: 4, trailingComma: 'es5' });
    ok(r.text === want.text && same(lang, text, r.text) === '', `options reach ${LABEL[lang]}: same text as the engine in Node, same meaning`);
  }
  ok(/Strings, numbers and their order stay exactly as typed/.test(await page.locator('.field-hint').last().textContent()), 'under the options: what they mean for the chosen language');
  ok(jsonTokens(r.text).toks.join(' ') === jsonTokens(hazards('json').find(([t]) => t === 'numbers as typed')[1]).toks.join(' ') && r.text.includes('1.50') && r.text.includes('1E+10'), 'JSON: 1.50 and 1E+10 stay as typed');
  // back to the defaults
  await page.locator('input[type=range]').fill('80'); await page.locator('input[type=range]').dispatchEvent('input');
  await page.getByRole('radio', { name: '2 spaces' }).click(); await page.locator('label.switch', { hasText: 'Semicolons' }).click(); await page.locator('label.switch', { hasText: 'Single quotes' }).click(); await page.getByRole('radio', { name: 'All', exact: true }).click();

  // ── Prettier steps in, and the tab says why
  const HACK = '.clearfix{*zoom:1;color:red}\n.b{filter:alpha(opacity=50)}';
  await put(page, 'css', HACK);
  r = await format(page);
  ok(r.text === await prettierFormat('css', HACK) && r.notes[0] === 'Formatted by Prettier.' && /^Biome, the formatter for CSS, could not read this text — .*\(line 1, column \d+\) — so Prettier formatted it\.$/.test(r.notes[1]), `CSS with an IE hack: Prettier's own result, and the reason with the place — ${r.notes[1]}`);
  const OPTIONAL = '<ul><li>one<li>two</ul>';
  await put(page, 'html', OPTIONAL);
  r = await format(page);
  ok(r.text === await prettierFormat('html', OPTIONAL) && /markup_fmt, the formatter for HTML, could not read this text/.test(r.notes[1]), `HTML with omitted end tags: Prettier formats it — ${r.notes[1]}`);
  const PUG = '<template lang="pug">\ndiv.card\n  h2 {{ title }}\n</template>\n<script>\nexport default {name:"x"}\n</script>\n';
  await put(page, 'vue', PUG);
  r = await format(page);
  ok(r.text.includes('div.card\n  h2 {{ title }}') && r.text.includes('name: "x"') && /another language/.test(r.notes[1]), 'Vue with a Pug template: the template is left alone, the rest formatted');
  const HANDLER = '<template>\n  <button @click="count+=1;log(count)" :class="{on:a&&b}">x</button>\n</template>\n<script>\nlet a = 1;let b\n</script>\n';
  await put(page, 'vue', HANDLER);
  await page.locator('label.switch', { hasText: 'Semicolons' }).click();
  r = await format(page);
  let compiles = true; try { vueFile(r.text); } catch { compiles = false; }
  ok(compiles && r.text.includes('@click="count+=1;log(count)"') && r.text.includes(':class="{ on: a && b }"') && r.text.includes('let a = 1\nlet b\n') && same('vue', HANDLER, r.text) === '', 'Vue without semicolons: the handler keeps its two statements (Vue can still compile it), the script loses its semicolons');
  await page.locator('label.switch', { hasText: 'Semicolons' }).click();
  const MD = '# T\n\n```js\nconst  x   =  {a:1}\n```\n\n* a\n* b\n';
  await put(page, 'markdown', MD);
  r = await format(page);
  ok(r.text === '# T\n\n```js\nconst  x   =  {a:1}\n```\n\n- a\n- b\n', 'Markdown: the code inside a fence is left as it is');
  await put(page, 'html', '<p style="color:red;background:blue" onclick="a();b({x:1})">x</p><script type="application/ld+json">{"price":1.50}</script>');
  r = await format(page);
  ok(r.text.includes('<p style="color:red;background:blue" onclick="a();b({x:1})">x</p>') && r.text.includes('{ "price": 1.50 }'), 'HTML: style and handler attributes stay as typed, a JSON block keeps its numbers');

  // ── errors
  await hookClipboard(page);
  await put(page, 'js', 'function ( {');
  r = await format(page);
  ok(r.text === '' && /\(1:\d+\)/.test(r.warn) && r.warn.includes('> 1 | function ( {') && await page.locator('pre.fmt-err').count() === 1, `broken JavaScript: the parser's message with the place and the line — ${r.warn.split('\n')[0]}`);
  await page.locator('button', { hasText: 'Copy' }).last().click();
  ok(await until(page, () => /Nothing formatted yet/.test(document.querySelector('.toasts')?.textContent || '')) && (await copied(page)).length === 0, 'nothing to copy after an error: said, and nothing copied');
  for (const [lang, text] of [['json', '{"a":}'], ['yaml', 'a: [1, 2\nb: 3'], ['graphql', '{ a('], ['ts', 'const a: = 1'], ['scss', '.a { b: '], ['vue', '<template><div></template>']]) {
    await put(page, lang, text);
    r = await format(page);
    ok(r.text === '' && /\d+:\d+/.test(r.warn), `${LABEL[lang]} that cannot be read: the message with the place — ${r.warn.split('\n')[0].slice(0, 70)}`);
  }
  await setValue(src(page), '   \n');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  ok(await until(page, () => /Paste code or open a file/.test(document.querySelector('.card .note-info')?.textContent || '')) && await out(page).inputValue() === '', 'an empty box: asked for code, nothing formatted');

  // ── format as you type; Ctrl+Enter
  await put(page, 'js', 'let  a=1');
  await src(page).press('Control+Enter');
  ok((await settle(page)).text === 'let a = 1;\n', 'Ctrl+Enter formats');
  await page.locator('label.switch', { hasText: 'Format as you type' }).click();
  await setValue(src(page), 'let  b  =  2;let c');
  ok(await until(page, () => document.querySelectorAll('textarea')[1].value === 'let b = 2;\nlet c;\n'), 'format as you type: the result follows the text');
  // a slow answer for an older text must not replace the answer for the newer one
  const SLOW = `const big = [${Array.from({ length: 60000 }, (_, i) => `{id:${i},v:'x'}`).join(',')}]`;
  await setValue(src(page), SLOW);
  await page.waitForTimeout(350);                                  // the big text is on its way through the worker
  await setValue(src(page), 'let  last  =  9');
  ok(await until(page, () => document.querySelectorAll('textarea')[1].value === 'let last = 9;\n', null, 60000), 'typing on while a large text is being formatted: the result of the newest text is the one shown');
  await page.waitForTimeout(1500);
  ok(await out(page).inputValue() === 'let last = 9;\n', '… and stays');
  await setValue(src(page), 'let x = ;');
  ok(await until(page, () => !!document.querySelector('pre.fmt-err') && document.querySelectorAll('textarea')[1].value === ''), 'as you type: a text that cannot be read shows the message');
  await page.locator('label.switch', { hasText: 'Format as you type' }).click();

  // ── switching the language
  await put(page, 'js', 'my = own(text)');
  await pick(page, 'css');
  ok(await src(page).inputValue() === 'my = own(text)' && await out(page).inputValue() === '', 'switching the language keeps the text that was typed (and clears the old result)');
  await setValue(src(page), '');
  await pick(page, 'yaml');
  const yamlSample = await src(page).inputValue();
  await pick(page, 'graphql');
  ok(/^name:\s+build/.test(yamlSample) && /^query Orders/.test(await src(page).inputValue()), 'an empty box or an untouched sample is replaced by the new language’s sample');

  // ── files
  const file = (name, text) => openFile(page, name, text);
  r = await file('style.css', 'a{color:red}');
  ok(await page.locator('select').first().inputValue() === 'css' && r.text === 'a {\n  color: red;\n}\n', '.css file: CSS chosen and formatted');
  let saved = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(/-style\.css$/.test(saved) && readFileSync(saved, 'utf8') === 'a {\n  color: red;\n}\n', 'download: under the file’s own name, the formatted text');
  await pick(page, 'scss'); await format(page);
  saved = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(/-formatted\.scss$/.test(saved), 'after another language is chosen the download is formatted.scss');
  for (const [name, text, lang, want] of [
    ['App.tsx', 'const A = <T,>({ items }: { items: T[] }) => <ul>{items.map((x, i) => <li key={i}>{String(x)}</li>)}</ul>', 'ts', null],
    ['lib.d.ts', 'declare const VERSION: string;export const x: number;', 'ts', 'declare const VERSION: string;\nexport const x: number;\n'],
    ['ci.yml', 'on:   [push]\njobs: {}', 'yaml', 'on: [push]\njobs: {}\n'],
    ['tsconfig.jsonc', '// c\n{"a":[1,2,],}', 'json', '// c\n{ "a": [1, 2] }\n'],
    ['App.vue', '<template><p>{{a+1}}</p><p v-if="b&&c">x</p></template><script>let a=1</script>', 'vue', '<template>\n  <p>{{ a + 1 }}</p>\n  <p v-if="b && c">x</p>\n</template>\n<script>\nlet a = 1;\n</script>\n'],
    ['README.md', '* a\n* b', 'markdown', '- a\n- b\n'],
    ['q.gql', '{a,b}', 'graphql', '{\n  a\n  b\n}\n'],
    ['index.htm', '<p>a</p><p>b</p>', 'html', '<p>a</p>\n<p>b</p>\n'],
    ['main.mjs', 'export  default  1', 'js', 'export default 1;\n'],
  ]) {
    r = await file(name, text);
    const expect = want ?? (await node(lang, text, {}, name)).text;
    ok(await page.locator('select').first().inputValue() === lang && r.text === expect && same(lang === 'ts' && /tsx$/.test(name) ? 'tsx' : lang, text, r.text) === '', `${name}: ${LABEL[lang]} chosen and formatted`);
  }
  const keep = await src(page).inputValue();
  for (const [name, re] of [['notes.xyz', /\.xyz files are not one of the ten languages/], ['Makefile', /no extension to tell its language by/]]) {
    const f = join(tmp, name); writeFileSync(f, 'x'); await page.locator('.drop input[type=file]').setInputFiles(f);
    ok(await until(page, (s) => new RegExp(s).test(document.querySelector('.toasts')?.textContent || ''), re.source) && await src(page).inputValue() === keep, `${name}: refused with the reason, the text in the box untouched`);
  }

  // ── copy; a large file
  r = await file('big.js', `${hazards('js').map(([, x]) => x).filter((x) => !/^#!|^import |^export /m.test(x)).join('\n;\n')}\n`.repeat(12));
  const bigSrc = await src(page).inputValue();
  ok(r.done && r.text.length > bigSrc.length && r.text === (await node('js', bigSrc)).text, `a ${Math.round(bigSrc.length / 1024)} KB file is formatted`);
  await page.locator('.outbox button').click(); await page.locator('button', { hasText: 'Copy' }).last().click();
  const clips = await copied(page);
  ok(clips.length === 2 && clips.every((c) => c === r.text), 'both copy buttons give the whole result');

  // ── a slow download of the engine is announced; a failed one is an error, and the next try works
  {
    const p = await open(); let hold = true, fail = true;
    await p.route(/biome_wasm_bg.*\.wasm/, async (route) => { if (fail) { fail = false; return route.abort(); } if (hold) await new Promise((res) => setTimeout(res, 1500)); return route.continue(); });
    await put(p, 'js', 'let  a=1');
    await p.getByRole('button', { name: 'Format', exact: true }).click();
    const failed = await settle(p);
    ok(failed.text === '' && failed.warn.length > 0 && !failed.notes.some((n) => /Formatted by/.test(n)), `the engine cannot be fetched: an error, not a silent switch to another formatter — ${failed.warn.split('\n')[0].slice(0, 80)}`);
    await p.getByRole('button', { name: 'Format', exact: true }).click();
    ok(await until(p, () => [...document.querySelectorAll('.card .note-info')].some((n) => /Fetching Biome, the formatter for this language \(18 MB, once per visit\)/.test(n.textContent))), 'while Biome is on its way the tab says so');
    const then = await settle(p);
    ok(then.text === 'let a = 1;\n' && then.notes[0] === 'Formatted by Biome.', 'the next try works');
    // leaving the tab ends the worker; coming back starts afresh
    await p.goto(`${base}#/`); await p.waitForTimeout(200);
    ok((await p.evaluate(() => globalThis.__superutilsLive())).workers === 0, 'leaving the tab ends the worker');
    await p.goto(`${base}#/prettier`); await p.locator('textarea').first().waitFor();
    ok((await format(p)).notes[0] === 'Formatted by Biome.', 'back on the tab it formats again');
    await p.close();
  }

  const errors = page.errors.filter((e) => !/Nothing formatted yet|not one of the ten languages|no extension to tell/.test(e));
  ok(!errors.length, `no page errors ${errors.join(' | ').slice(0, 300)}`);
  info?.(`engines: Biome ${(SIZE.biome / 1e6).toFixed(1)} MB, JSON plugin ${(SIZE.json / 1e6).toFixed(2)} MB, markup plugin ${(SIZE.markup / 1e6).toFixed(2)} MB`);
  await pcOnlyOnPhone(ctx, 'prettier');
};
