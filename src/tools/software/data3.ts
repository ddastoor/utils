// Software › data tabs, part 3: YAML ⇄ JSON ⇄ TOML and JSON Schema — both on our Rust formats-*.wasm (wasm/formats).
import { h, card, field, textarea, segmented, clear, note, copy, button, outputBox, filePicker, downloadBlob, type Mount } from '../../ui';
import { formats, FormatError } from '../../wasm/formats';
import { debounce } from './devui';

const where = (e: any) => (e instanceof FormatError && e.line ? ` (line ${e.line}${e.column ? `, column ${e.column}` : ''})` : '');
const EXT: Record<string, string> = { json: 'json', yaml: 'yaml', toml: 'toml' };
export const yaml: Mount = async (root) => {
  const f = await formats('yaml');
  let from = 'yaml', to = 'json', indent = 2;
  const NAME: Record<string, string> = { yaml: 'YAML', json: 'JSON', toml: 'TOML' };
  const src = textarea({ rows: 14, mono: true, value: `# Kubernetes-style example\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: chai-shop\n  labels: &labels\n    app: chai\n    tier: web\nspec:\n  replicas: 3\n  selector:\n    matchLabels: *labels\n  template:\n    spec:\n      containers:\n        - name: web\n          image: "chai-shop:1.4.2"\n          ports:\n            - containerPort: 8080\n          env:\n            - { name: CITY, value: Pune }\n` });
  src.setAttribute('aria-label', 'Input');
  // a plain read-only box: the Copy button below is the one way to copy (outputBox would add a second one)
  const out = textarea({ rows: 16, mono: true, readonly: true }); out.setAttribute('aria-label', 'Output');
  const status = h('div');
  const run = () => {
    clear(status);
    // a lone surrogate (half an emoji, from a broken paste) cannot be sent to the engine: it becomes U+FFFD
    const text = (src.value as any).toWellFormed ? (src.value as any).toWellFormed() as string : src.value;
    try {
      const r = f.call('convert', { text, from, to, indent });
      out.value = r.out;
      if (r.documents === 0) { status.append(note(`Nothing to convert yet — type or paste ${NAME[from]}, or open a file.`, 'info')); return; }
      const docs = r.documents > 1 ? ` · ${r.documents} documents (${to === 'json' ? 'combined into a list' : 'separated by ---'})` : '';
      status.append(note(`Valid ${NAME[from]}${docs}`, 'ok'));
      for (const n of r.notes as string[]) status.append(note(n, 'info'));
    } catch (e: any) { out.value = ''; status.append(note(`${e.message}${where(e)}`, 'warn')); }
  };
  const detect = (name: string, text: string) => (/\.ya?ml$/i.test(name) ? 'yaml' : /\.toml$/i.test(name) ? 'toml' : /\.(json|jsonc|map|webmanifest)$/i.test(name) ? 'json' : /^\s*[{[]/.test(text) ? 'json' : /^\s*\[\[?[\w."' -]+\]\]?\s*(#.*)?$|^\s*[\w."'-]+\s*=/m.test(text) ? 'toml' : 'yaml');
  const fromSeg = segmented([['yaml', 'YAML'], ['json', 'JSON'], ['toml', 'TOML']], from, (v) => { from = v; run(); });
  const toSeg = segmented([['json', 'JSON'], ['yaml', 'YAML'], ['toml', 'TOML']], to, (v) => { to = v; indentField.hidden = to !== 'json'; run(); });
  const indentField = field('JSON indent', segmented([['2', '2'], ['4', '4'], ['0', 'Minify']], '2', (v) => { indent = +v; run(); }));
  src.addEventListener('input', debounce(run, 150));
  const need = (what: string) => { if (!out.value) throw new Error(`Nothing to ${what} yet`); };
  root.append(card(null, field('From', fromSeg), field('To', toSeg), indentField),
    card('Input', src, filePicker({ accept: '.yaml,.yml,.json,.toml,text/*', label: 'Open a file', onFiles: async ([file]) => { src.value = await file.text(); from = detect(file.name, src.value); fromSeg.value = from; run(); } }), status),
    card('Output', out, h('div', { class: 'row' }, button('Copy', () => { need('copy'); return copy(out.value); }, { small: true, icon: 'Copy' }),
      button('Download', () => { need('save'); downloadBlob(new Blob([out.value], { type: 'text/plain' }), `converted.${EXT[to]}`); }, { small: true, icon: 'Download' }),
      // Swap puts the output in the input box: with no output it would wipe what was typed
      button('Swap', () => { need('swap'); src.value = out.value; [from, to] = [to, from]; fromSeg.value = from; toSeg.value = to; indentField.hidden = to !== 'json'; run(); }, { small: true, icon: 'ArrowUpDown' }))),
    note('Numbers keep every digit (JSON 12345678901234567890 or 1.10 are not rounded). YAML: anchors (&a / *a) and merge keys (<<) are expanded, comments are not kept. YAML output puts quotes around text that some YAML program would read as something else — no, yes, on, y, 1_000, 1:30, 2026-01-01. TOML has no null, holds 64-bit numbers and needs key = value pairs at the top.', 'info'));
  run();
};

export const jsonschema: Mount = (root) => {
  let fp: ReturnType<typeof formats> | null = null;
  const schema = textarea({ rows: 14, mono: true, value: JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Customer', type: 'object', required: ['name', 'email', 'mobile'], properties: { name: { type: 'string', minLength: 2 }, email: { type: 'string', format: 'email' }, mobile: { type: 'string', pattern: '^[6-9][0-9]{9}$' }, age: { type: 'integer', minimum: 18 }, city: { enum: ['Pune', 'Mumbai', 'Delhi'] } }, additionalProperties: false }, null, 2) });
  const data = textarea({ rows: 14, mono: true, value: JSON.stringify({ name: 'Asha', email: 'asha.example.com', mobile: '5123456789', age: 17, city: 'Pune', nickname: 'A' }, null, 2) });
  schema.setAttribute('aria-label', 'Schema'); data.setAttribute('aria-label', 'Data');
  const out = h('div');
  // a lone surrogate (half an emoji, from a broken paste) cannot be sent to the engine: it becomes U+FFFD
  const wf = (x: string) => ((x as any).toWellFormed ? (x as any).toWellFormed() as string : x);
  const N = (n: number) => n.toLocaleString('en-IN');
  let runs = 0, problems = '';
  const run = async () => {
    const f = await (fp ||= formats('schema')); clear(out); problems = '';
    try {
      const r = f.call('validate', { schema: wf(schema.value), data: wf(data.value) });
      const listed = r.errors.length, total = r.total as number;
      out.append(note(r.valid ? 'Valid ✓ — the data matches the schema.' : `${r.more ? 'More than ' : ''}${N(total)} problem${total === 1 ? '' : 's'}${total > listed ? ` — the first ${listed} are listed` : ''}`, r.valid ? 'ok' : 'err'), h('div', { class: 'muted' }, `Checked as ${r.draft}`));
      for (const n of r.notes as string[]) out.append(note(n, 'info'));
      if (!r.valid) {
        problems = r.errors.map((x: any) => `${x.path || '(root)'}\t${x.message}\t${x.schemaPath}`).join('\n');
        out.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tbl schema-errs' }, h('thead', null, h('tr', null, h('th', null, 'Where'), h('th', null, 'Problem'), h('th', null, 'Rule'))), h('tbody', null, r.errors.map((x: any) => h('tr', null, h('td', { class: 'mono' }, x.path || '(root)'), h('td', null, x.message), h('td', { class: 'mono muted' }, x.schemaPath)))))),
          h('div', { class: 'row' }, button('Copy problems', () => copy(problems), { small: true, icon: 'Copy' })));
      }
    } catch (e: any) { out.append(note(`${e.message}${where(e)}`, 'warn')); }
    out.dataset.runs = String(++runs);   // the e2e suite waits for it
  };
  const later = debounce(run, 250);
  const infer = async () => {
    const f = await (fp ||= formats('schema'));
    schema.value = JSON.stringify(f.call('infer', { data: wf(data.value) }).schema, null, 2);   // broken data: the button shows the message
    later.cancel(); await run();
  };
  for (const x of [schema, data]) {
    x.addEventListener('input', later);
    // Ctrl+Enter (⌘ on a Mac): check now, without waiting for the pause after typing
    x.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); later.cancel(); void run(); } });
  }
  root.append(h('div', { class: 'grid2' }, card('Schema', schema, filePicker({ accept: '.json', label: 'Open schema', onFiles: async ([x]) => { schema.value = await x.text(); later.cancel(); await run(); } })), card('Data (JSON)', data, filePicker({ accept: '.json', label: 'Open data', onFiles: async ([x]) => { data.value = await x.text(); later.cancel(); await run(); } }), button('Make a schema from this data', infer, { small: true, icon: 'Wand' }))),
    card('Result', out), note('Draft 4, 6, 7, 2019-09 and 2020-12 (from "$schema"). Formats such as email, date-time, uri and uuid are checked; numbers are compared exactly, however large; "pattern" follows the regular expressions of JavaScript. A $ref to another file or web address is not fetched. The data is checked a moment after you stop typing — Ctrl+Enter checks at once.', 'info'));
  void run();
};
