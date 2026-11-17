// Code Formatter: Prettier 3 standalone (JavaScript only — no compiled formatter covers these languages; §3a), bundled
// from npm and loaded with the first Format (each language's parser plugin loads only when that language is used).
import { h, card, field, select, segmented, toggle, slider, clear, note, copy, button, outputBox, filePicker, downloadBlob, textarea, type Mount } from '../../ui';
import { debounce } from './devui';

const LANGS: Record<string, { parser: string; plugins: () => Promise<any[]>; ext: string; sample: string }> = {
  js: { parser: 'babel', ext: 'js', plugins: () => Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]), sample: "const order={id:42,items:[{sku:'TEA',qty:2}],total:function(){return this.items.reduce((s,i)=>s+i.qty,0)}}\nexport default async function load(url){const res=await fetch(url,{headers:{'Accept':'application/json'}});if(!res.ok)throw new Error(`HTTP ${res.status}`);return res.json()}" },
  ts: { parser: 'typescript', ext: 'ts', plugins: () => Promise.all([import('prettier/plugins/typescript'), import('prettier/plugins/estree')]), sample: "interface Item{sku:string;qty:number;price?:number}\nexport const total=(items:Item[]):number=>items.reduce((s,{qty,price=0})=>s+qty*price,0)\nenum Size{S='s',M='m'}" },
  css: { parser: 'css', ext: 'css', plugins: () => Promise.all([import('prettier/plugins/postcss')]), sample: '.card{display:flex;gap:8px;color:#333}.card:hover{box-shadow:0 1px 2px rgba(0,0,0,.2)}@media (max-width:600px){.card{flex-direction:column}}' },
  scss: { parser: 'scss', ext: 'scss', plugins: () => Promise.all([import('prettier/plugins/postcss')]), sample: '$accent:#4f46e5;.btn{color:$accent;&:hover{color:darken($accent,10%)}}' },
  html: { parser: 'html', ext: 'html', plugins: () => Promise.all([import('prettier/plugins/html'), import('prettier/plugins/postcss'), import('prettier/plugins/babel'), import('prettier/plugins/estree')]), sample: '<!doctype html><html><head><title>Shop</title><style>body{margin:0}</style></head><body><nav><a href="/">Home</a><a href="/menu">Menu</a></nav><main><h1>Chai Point</h1><p>Open <b>7 am</b> to <i>10 pm</i>.</p></main><script>document.title="Chai"</script></body></html>' },
  json: { parser: 'json', ext: 'json', plugins: () => Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]), sample: '{"name":"chai-shop","version":"1.4.2","scripts":{"dev":"vite","build":"vite build"},"dependencies":{"vite":"^8.0.0"}}' },
  yaml: { parser: 'yaml', ext: 'yaml', plugins: () => Promise.all([import('prettier/plugins/yaml')]), sample: 'name:   build\non: [push,  pull_request]\njobs:\n  test:\n      runs-on: ubuntu-latest\n      steps:\n        - uses: actions/checkout@v4\n        - run:   npm ci && npm test' },
  markdown: { parser: 'markdown', ext: 'md', plugins: () => Promise.all([import('prettier/plugins/markdown')]), sample: '# Menu\n* Masala chai\n* Samosa\n\n|Item|Price|\n|-|-:|\n|Chai|20|\n|Samosa|15|\n\nSome   *emphasis*   here.' },
  graphql: { parser: 'graphql', ext: 'graphql', plugins: () => Promise.all([import('prettier/plugins/graphql')]), sample: 'query Orders($city:String!){orders(city:$city,first:10){edges{node{id total customer{name}}}}}' },
  vue: { parser: 'vue', ext: 'vue', plugins: () => Promise.all([import('prettier/plugins/html'), import('prettier/plugins/postcss'), import('prettier/plugins/babel'), import('prettier/plugins/estree')]), sample: '<template><div class="card"><h2>{{title}}</h2><button @click="add">Add</button></div></template>\n<script>export default{data(){return{title:"Chai"}},methods:{add(){this.n++}}}</script>' },
};
const BY_EXT: Record<string, string> = { js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', mts: 'ts', css: 'css', scss: 'scss', html: 'html', htm: 'html', json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown', markdown: 'markdown', graphql: 'graphql', gql: 'graphql', vue: 'vue' };
export const prettier: Mount = (root) => {
  let lang = 'js', width = 80, tab = 2, useTabs = false, semi = true, single = false, trailing = 'all', live = false, name = '';
  const src = textarea({ rows: 14, mono: true, value: LANGS.js.sample }), out = outputBox({ rows: 18, mono: true, label: 'Formatted code' }), status = h('div');
  src.setAttribute('aria-label', 'Code');
  let core: Promise<any> | null = null;
  const run = async () => {
    clear(status);
    const pr = await (core ||= import('prettier/standalone'));
    const L = LANGS[lang];
    try {
      const plugins = (await L.plugins()).map((m: any) => m.default ?? m);
      out.value = await pr.format(src.value, { parser: L.parser, plugins, printWidth: width, tabWidth: tab, useTabs, semi, singleQuote: single, trailingComma: trailing });
      status.append(note(out.value === src.value ? 'Already formatted.' : 'Formatted.', 'ok'));
    } catch (e: any) { out.value = ''; status.append(note(String(e.message || e).split('\n').slice(0, 6).join('\n'), 'warn')); }
  };
  const runD = debounce(() => { if (live) run(); }, 300);
  const langSel = select(Object.keys(LANGS).map((k) => [k, { js: 'JavaScript / JSX', ts: 'TypeScript', css: 'CSS', scss: 'SCSS', html: 'HTML', json: 'JSON', yaml: 'YAML', markdown: 'Markdown', graphql: 'GraphQL', vue: 'Vue' }[k]!] as [string, string]), lang, (v) => { lang = v; src.value = LANGS[v].sample; out.value = ''; clear(status); runD(); });
  src.addEventListener('input', runD);
  const opt = () => { runD(); };
  root.append(card(null, field('Language', langSel), filePicker({ label: 'Open a file', onFiles: async ([f]) => { const ext = f.name.split('.').pop()!.toLowerCase(); if (!BY_EXT[ext]) throw new Error(`.${ext} files are not supported`); lang = BY_EXT[ext]; langSel.value = lang; src.value = await f.text(); name = f.name; await run(); } }), src,
    h('div', { class: 'row' }, button('Format', run, { variant: 'primary', icon: 'Wand' }), toggle('Format as you type', false, (v) => { live = v; if (v) run(); }))),
  card('Options', slider({ label: 'Print width', min: 40, max: 160, value: width, onInput: (v) => { width = v; opt(); } }), field('Indent', segmented([['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tabs']], '2', (v) => { useTabs = v === 'tab'; tab = v === 'tab' ? 2 : +v; opt(); })),
    h('div', { class: 'row' }, toggle('Semicolons', true, (v) => { semi = v; opt(); }), toggle('Single quotes', false, (v) => { single = v; opt(); })), field('Trailing commas', segmented([['all', 'All'], ['es5', 'ES5'], ['none', 'None']], 'all', (v) => { trailing = v; opt(); }))),
  card('Result', status, out, h('div', { class: 'row' }, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' }), button('Download', () => { if (!out.value) throw new Error('Format something first'); downloadBlob(new Blob([out.value], { type: 'text/plain' }), name || `formatted.${LANGS[lang].ext}`); }, { small: true, icon: 'Download' }))),
  note('Prettier 3 runs entirely in this browser tab; your code is not uploaded.', 'info'));
};
