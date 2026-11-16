// Software › data tabs, part 3: YAML ⇄ JSON ⇄ TOML and JSON Schema — both on our Rust formats-*.wasm (wasm/formats).
import { h, card, field, textarea, segmented, clear, note, copy, button, outputBox, filePicker, downloadBlob, type Mount } from '../../ui';
import { formats, FormatError } from '../../wasm/formats';
import { debounce } from './devui';

const where = (e: any) => (e instanceof FormatError && e.line ? ` (line ${e.line}${e.column ? `, column ${e.column}` : ''})` : '');
const EXT: Record<string, string> = { json: 'json', yaml: 'yaml', toml: 'toml' };
export const yaml: Mount = async (root) => {
  const f = await formats('yaml');
  let from = 'yaml', to = 'json', indent = 2;
  const src = textarea({ rows: 14, mono: true, value: `# Kubernetes-style example\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: chai-shop\n  labels: &labels\n    app: chai\n    tier: web\nspec:\n  replicas: 3\n  selector:\n    matchLabels: *labels\n  template:\n    spec:\n      containers:\n        - name: web\n          image: "chai-shop:1.4.2"\n          ports:\n            - containerPort: 8080\n          env:\n            - { name: CITY, value: Pune }\n` });
  const out = outputBox({ rows: 16, mono: true }), status = h('div');
  const run = () => {
    clear(status);
    try { const r = f.call('convert', { text: src.value, from, to, indent }); out.value = r.out; status.append(note(`Valid ${from.toUpperCase()}${r.documents > 1 ? ` · ${r.documents} documents (combined into a list)` : ''}`, 'ok')); }
    catch (e: any) { out.value = ''; status.append(note(`${e.message}${where(e)}`, 'warn')); }
  };
  const detect = (name: string, text: string) => (/\.ya?ml$/i.test(name) ? 'yaml' : /\.toml$/i.test(name) ? 'toml' : /\.json$/i.test(name) ? 'json' : /^\s*[{[]/.test(text) ? 'json' : /^\s*\[[\w.]+\]\s*$|^\s*\w+\s*=/m.test(text) ? 'toml' : 'yaml');
  const fromSeg = segmented([['yaml', 'YAML'], ['json', 'JSON'], ['toml', 'TOML']], from, (v) => { from = v; run(); });
  const toSeg = segmented([['json', 'JSON'], ['yaml', 'YAML'], ['toml', 'TOML']], to, (v) => { to = v; run(); });
  src.addEventListener('input', debounce(run, 150));
  root.append(card(null, field('From', fromSeg), field('To', toSeg), field('JSON indent', segmented([['2', '2'], ['4', '4'], ['0', 'Minify']], '2', (v) => { indent = +v; run(); }))),
    card('Input', src, filePicker({ accept: '.yaml,.yml,.json,.toml,text/*', label: 'Open a file', onFiles: async ([file]) => { src.value = await file.text(); from = detect(file.name, src.value); fromSeg.value = from; run(); } }), status),
    card('Output', out, h('div', { class: 'row' }, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' }), button('Download', () => downloadBlob(new Blob([out.value], { type: 'text/plain' }), `converted.${EXT[to]}`), { small: true, icon: 'Download' }),
      button('Swap', () => { src.value = out.value; [from, to] = [to, from]; fromSeg.value = from; toSeg.value = to; run(); }, { small: true, icon: 'ArrowUpDown' }))),
    note('YAML 1.2: anchors (&a / *a) and merge keys (<<) are expanded; comments are not kept in other formats. TOML has no null and needs key = value pairs at the top.', 'info'));
  run();
};

export const jsonschema: Mount = (root) => {
  let fp: ReturnType<typeof formats> | null = null;
  const schema = textarea({ rows: 14, mono: true, value: JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Customer', type: 'object', required: ['name', 'email', 'mobile'], properties: { name: { type: 'string', minLength: 2 }, email: { type: 'string', format: 'email' }, mobile: { type: 'string', pattern: '^[6-9][0-9]{9}$' }, age: { type: 'integer', minimum: 18 }, city: { enum: ['Pune', 'Mumbai', 'Delhi'] } }, additionalProperties: false }, null, 2) });
  const data = textarea({ rows: 14, mono: true, value: JSON.stringify({ name: 'Asha', email: 'asha.example.com', mobile: '5123456789', age: 17, city: 'Pune', nickname: 'A' }, null, 2) });
  const out = h('div');
  const run = async () => {
    const f = await (fp ||= formats('schema')); clear(out);
    try {
      const r = f.call('validate', { schema: schema.value, data: data.value });
      out.append(note(r.valid ? 'Valid ✓ — the data matches the schema.' : `${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}`, r.valid ? 'ok' : 'err'), h('div', { class: 'muted' }, `Draft: ${r.draft}`));
      if (!r.valid) out.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tbl schema-errs' }, h('thead', null, h('tr', null, h('th', null, 'Where'), h('th', null, 'Problem'), h('th', null, 'Rule'))), h('tbody', null, r.errors.map((x: any) => h('tr', null, h('td', { class: 'mono' }, x.path || '(root)'), h('td', null, x.message), h('td', { class: 'mono muted' }, x.schemaPath)))))));
    } catch (e: any) { out.append(note(`${e.message}${where(e)}`, 'warn')); }
  };
  const infer = async () => { const f = await (fp ||= formats('schema')); schema.value = JSON.stringify(f.call('infer', { data: data.value }).schema, null, 2); await run(); };
  [schema, data].forEach((x) => x.addEventListener('input', debounce(run, 250)));
  root.append(h('div', { class: 'grid2' }, card('Schema', schema, filePicker({ accept: '.json', label: 'Open schema', onFiles: async ([x]) => { schema.value = await x.text(); run(); } })), card('Data (JSON)', data, filePicker({ accept: '.json', label: 'Open data', onFiles: async ([x]) => { data.value = await x.text(); run(); } }), button('Make a schema from this data', infer, { small: true, icon: 'Wand' }))),
    card('Result', out), note('Drafts 4, 6, 7, 2019-09 and 2020-12 (from "$schema"); formats such as email, date-time, uri and uuid are checked. $ref to other files or URLs is not fetched.', 'info'));
  run();
};
