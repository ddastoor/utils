// Code Formatter (#/prettier, PC only). The engines live in a worker (src/workers/codefmt.worker.ts, rules in
// src/lib/codefmt.ts): Biome's official WebAssembly build for JS / TS / CSS / SCSS / YAML / GraphQL, dprint's JSON
// plugin for JSON, markup_fmt for HTML and Vue, Prettier for Markdown and for text those cannot read. Nothing is
// fetched before the first Format, and each engine only when a language needs it.
import { h, card, field, select, segmented, toggle, slider, clear, note, copy, button, outputBox, filePicker, downloadBlob, textarea, type Mount } from '../../ui';
import { debounce } from './devui';
import { ENGINE_LABEL, type Lang, type Formatted } from '../../lib/codefmt';
import { formatCode, onEngineLoading } from '../../lib/codefmt-client';
import { readTextFile } from '../../lib/textfile';
import './prettier.css';

const LANGS: Record<Lang, { label: string; ext: string; sample: string }> = {
  js: { label: 'JavaScript / JSX', ext: 'js', sample: "const order={id:42,items:[{sku:'TEA',qty:2}],total:function(){return this.items.reduce((s,i)=>s+i.qty,0)}}\nexport default async function load(url){const res=await fetch(url,{headers:{'Accept':'application/json'}});if(!res.ok)throw new Error(`HTTP ${res.status}`);return res.json()}" },
  ts: { label: 'TypeScript / TSX', ext: 'ts', sample: "interface Item{sku:string;qty:number;price?:number}\nexport const total=(items:Item[]):number=>items.reduce((s,{qty,price=0})=>s+qty*price,0)\nenum Size{S='s',M='m'}" },
  css: { label: 'CSS', ext: 'css', sample: '.card{display:flex;gap:8px;color:#333}.card:hover{box-shadow:0 1px 2px rgba(0,0,0,.2)}@media (max-width:600px){.card{flex-direction:column}}' },
  scss: { label: 'SCSS', ext: 'scss', sample: '$accent:#4f46e5;.btn{color:$accent;&:hover{color:darken($accent,10%)}}' },
  html: { label: 'HTML', ext: 'html', sample: '<!doctype html><html><head><title>Shop</title><style>body{margin:0}</style></head><body><nav><a href="/">Home</a><a href="/menu">Menu</a></nav><main><h1>Chai Point</h1><p>Open <b>7 am</b> to <i>10 pm</i>.</p></main><script>document.title="Chai"</script></body></html>' },
  json: { label: 'JSON', ext: 'json', sample: '{"name":"chai-shop","version":"1.4.2","scripts":{"dev":"vite","build":"vite build"},"dependencies":{"vite":"^8.0.0"}}' },
  yaml: { label: 'YAML', ext: 'yaml', sample: 'name:   build\non: [push,  pull_request]\njobs:\n  test:\n      runs-on: ubuntu-latest\n      steps:\n        - uses: actions/checkout@v4\n        - run:   npm ci && npm test' },
  markdown: { label: 'Markdown', ext: 'md', sample: '# Menu\n* Masala chai\n* Samosa\n\n|Item|Price|\n|-|-:|\n|Chai|20|\n|Samosa|15|\n\nSome   *emphasis*   here.' },
  graphql: { label: 'GraphQL', ext: 'graphql', sample: 'query Orders($city:String!){orders(city:$city,first:10){edges{node{id total customer{name}}}}}' },
  vue: { label: 'Vue', ext: 'vue', sample: '<template><div class="card"><h2>{{title}}</h2><button @click="add">Add</button></div></template>\n<script>export default{data(){return{title:"Chai"}},methods:{add(){this.n++}}}</script>' },
};
const BY_EXT: Record<string, Lang> = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts', css: 'css', scss: 'scss', html: 'html', htm: 'html', json: 'json', jsonc: 'json', json5: 'json', map: 'json', webmanifest: 'json',
  yaml: 'yaml', yml: 'yaml', md: 'markdown', markdown: 'markdown', graphql: 'graphql', gql: 'graphql', graphqls: 'graphql', vue: 'vue',
};
const ACCEPT = Object.keys(BY_EXT).map((e) => `.${e}`).join(',');
/** What the options mean for each language (said under the options, so a switch that does nothing is no surprise). */
const APPLIES: Record<Lang, string> = {
  js: 'All options apply.', ts: 'All options apply.',
  css: 'Print width, indent and quotes apply.', scss: 'Print width, indent and quotes apply.', yaml: 'Print width, indent (spaces — YAML has no tabs) and quotes apply.',
  json: 'Print width and indent apply. Strings, numbers and their order stay exactly as typed.', graphql: 'Print width and indent apply.',
  markdown: 'Indent applies to nested lists. Lines are not re-wrapped, and the code inside ``` fences is left as it is.',
  html: 'Print width and indent apply; the other options apply to the scripts and styles inside. Attributes such as style="…" and onclick="…" stay as typed.',
  vue: 'All options apply to the script; in the template, expressions are tidied and a handler of several statements stays as typed.',
};

export const prettier: Mount = (root) => {
  let lang: Lang = 'js', width = 80, tab = 2, useTabs = false, semi = true, single = false, trailing: 'all' | 'es5' | 'none' = 'all', live = false;
  let name = '', full = '', run = 0, loading = false;
  const src = textarea({ rows: 14, mono: true, value: LANGS.js.sample });
  src.setAttribute('aria-label', 'Code');
  const out = outputBox({ rows: 18, mono: true, label: 'Formatted code', text: () => full }), status = h('div'), applies = h('div', { class: 'field-hint' }, APPLIES[lang]);
  const isSample = () => !src.value.trim() || Object.values(LANGS).some((l) => l.sample === src.value);
  const say = (...nodes: Node[]) => { clear(status); status.append(...nodes); };
  onEngineLoading((what) => { loading = !!what; if (what) say(note('Fetching Biome, the formatter for this language (18 MB, once per visit) …', 'info')); });

  const format = async () => {
    const mine = ++run, text = src.value, l = lang;
    if (!text.trim()) { full = out.value = ''; say(note('Paste code or open a file to format.', 'info')); return; }
    if (!loading) say(note('Formatting …', 'info'));
    let r: Formatted;
    try { r = await formatCode(l, text, { printWidth: width, tabWidth: tab, useTabs, semi, singleQuote: single, trailingComma: trailing }, name); } catch (e: any) {
      if (mine !== run) return;
      full = out.value = '';
      // the parser's own words, with the place: at most eight lines of them
      say(note(h('pre', { class: 'fmt-err' }, String(e?.message || e).split('\n').slice(0, 8).join('\n')), 'warn'));
      return;
    }
    if (mine !== run) return;                                   // a newer run has taken over (typing, another option)
    full = out.value = r.text;
    const notes: Node[] = [note(r.text === text ? `Already formatted — ${ENGINE_LABEL[r.engine]} changes nothing.` : `Formatted by ${ENGINE_LABEL[r.engine]}.`, 'ok')];
    if (r.instead) notes.push(note(`${ENGINE_LABEL[r.instead.of]}, the formatter for ${LANGS[l].label}, could not read this text — ${r.instead.why} — so Prettier formatted it.`, 'info'));
    for (const n of r.notes) notes.push(note(n, 'info'));
    say(...notes);
  };
  const later = debounce(() => { if (live) void format(); }, 300);
  const changed = () => { later(); };

  const setLang = (v: Lang, keepText = false) => {
    const fresh = !keepText && isSample();                      // only a sample is replaced by the new language's sample
    lang = v; langSel.value = v;
    if (fresh) { src.value = LANGS[v].sample; name = ''; }
    full = out.value = ''; run++; clear(status); applies.textContent = APPLIES[v];
    later();
  };
  const langSel = select((Object.keys(LANGS) as Lang[]).map((k) => [k, LANGS[k].label] as [Lang, string]), lang, (v) => setLang(v));
  src.addEventListener('input', () => { changed(); });
  src.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void format(); } });
  const open = async ([f]: File[]) => {
    const ext = /\.([A-Za-z0-9]+)$/.exec(f.name)?.[1].toLowerCase() ?? '';
    const l = BY_EXT[ext];
    if (!l) throw new Error(ext ? `.${ext} files are not one of the ten languages here (${Object.values(LANGS).map((x) => x.label).join(', ')}).` : 'This file has no extension to tell its language by — paste its text and choose the language.');
    src.value = await readTextFile(f, 'source code is plain text'); setLang(l, true); name = f.name;
    await format();
  };
  const need = () => { if (!full) throw new Error('Nothing formatted yet'); };
  const fileName = () => (name && BY_EXT[/\.([A-Za-z0-9]+)$/.exec(name)?.[1].toLowerCase() ?? ''] === lang ? name : `formatted.${LANGS[lang].ext}`);

  root.append(
    card(null, field('Language', langSel), filePicker({ label: 'Open a file', accept: ACCEPT, onFiles: open }), src,
      h('div', { class: 'row' }, button('Format', format, { variant: 'primary', icon: 'Wand', title: 'Ctrl + Enter' }), toggle('Format as you type', false, (v) => { live = v; if (v) void format(); }))),
    card('Options',
      slider({ label: 'Print width', min: 40, max: 160, value: width, onInput: (v) => { width = v; changed(); } }),
      field('Indent', segmented([['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tabs']], '2', (v) => { useTabs = v === 'tab'; tab = v === 'tab' ? 2 : +v; changed(); })),
      h('div', { class: 'row' }, toggle('Semicolons', true, (v) => { semi = v; changed(); }), toggle('Single quotes', false, (v) => { single = v; changed(); })),
      field('Trailing commas', segmented([['all', 'All'], ['es5', 'ES5'], ['none', 'None']], 'all', (v) => { trailing = v; changed(); })),
      applies),
    card('Result', status, out, h('div', { class: 'row' },
      button('Copy', () => { need(); return copy(full); }, { small: true, icon: 'Copy' }),
      button('Download', () => { need(); downloadBlob(new Blob([full], { type: 'text/plain' }), fileName()); }, { small: true, icon: 'Download' }))),
    note('Formatting changes the layout of code, not what it says. JavaScript, TypeScript, CSS, SCSS, YAML and GraphQL are formatted by Biome, JSON by dprint’s JSON formatter, HTML and Vue by markup_fmt — WebAssembly modules that run in this browser — and Markdown, and any text those cannot read, by Prettier. Your code is not uploaded.', 'info'));
};
