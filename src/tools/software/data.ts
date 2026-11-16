// Software › data tabs.
import { h, card, field, textarea, segmented, toggle, clear, note, copy, button, outputBox, filePicker, downloadBlob, type Mount } from '../../ui';
import { devcore, type Devcore } from '../../wasm/devcore';
import { debounce } from './devui';
import { jq as loadJq } from '../../wasm/jq';
export { xml, json2types, jsondiff, mdtable, mockdata } from './data2';
export { yaml, jsonschema } from './data3';
export { sqlite } from './sqlite';
export const jq: Mount = (root) => {
  const SAMPLE = JSON.stringify({ store: 'Pune', orders: [
    { id: 101, customer: 'Asha', items: [{ sku: 'TEA', qty: 2, price: 120 }, { sku: 'MUG', qty: 1, price: 250 }], paid: true },
    { id: 102, customer: 'Ravi', items: [{ sku: 'TEA', qty: 5, price: 120 }], paid: false },
    { id: 103, customer: 'Meera', items: [{ sku: 'JAM', qty: 3, price: 90 }, { sku: 'TEA', qty: 1, price: 120 }], paid: true }] }, null, 2);
  const EXAMPLES: Array<[string, string]> = [
    ['.orders[] | {id, customer}', 'Pick fields'],
    ['[.orders[] | select(.paid) | .customer]', 'Filter (select)'],
    ['.orders | map({id, total: (.items | map(.qty * .price) | add)})', 'Compute totals'],
    ['[.orders[].items[]] | group_by(.sku) | map({sku: .[0].sku, qty: (map(.qty) | add)})', 'Group and sum'],
    ['.orders | sort_by(-(.items | length)) | .[0].customer', 'Sort'],
    ['[paths(scalars) | map(tostring) | join(".")]', 'All paths'],
    ['.orders[] | [.id, .customer, .paid] | @csv', 'CSV rows (use Raw output)'],
    ['.orders[] | select(.customer == $name)', '--arg $name'],
    ['to_entries | map("\\(.key): \\(.value | type)") | .[]', 'Keys and types'],
  ];
  const flags: Record<string, boolean> = { raw: false, compact: false, slurp: false, nullInput: false, sortKeys: false, rawInput: false, tab: false, ascii: false, join: false };
  const filter = h('input', { class: 'input mono', value: '.orders | map({id, total: (.items | map(.qty * .price) | add)})', spellcheck: 'false', 'aria-label': 'Filter' }) as HTMLInputElement;
  const src = textarea({ rows: 14, mono: true, value: SAMPLE });
  const args = textarea({ rows: 3, mono: true, value: 'name=Ravi', placeholder: 'name=value (one per line; a JSON value with name:=value)' });
  const out = outputBox({ rows: 16, mono: true }), status = h('div'), cmd = h('div', { class: 'mono small' });
  const parseArgs = () => {
    const o: Record<string, unknown> = {}, cli: string[] = [];
    for (const line of args.value.split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(:?=)(.*)$/.exec(line); if (!m) { if (line.trim()) throw new Error(`Argument line not understood: "${line.trim()}" — write name=value or name:=JSON`); continue; }
      if (m[2] === ':=') { try { o[m[1]] = JSON.parse(m[3]); } catch { throw new Error(`--argjson ${m[1]}: not valid JSON`); } cli.push(`--argjson ${m[1]} ${q(m[3])}`); }
      else { o[m[1]] = m[3]; cli.push(`--arg ${m[1]} ${q(m[3])}`); }
    }
    return { o, cli };
  };
  const q = (x: string) => /^[A-Za-z0-9_.,:/@%+=-]+$/.test(x) ? x : `'${x.replace(/'/g, `'\\''`)}'`;
  let eng: Awaited<ReturnType<typeof loadJq>> | null = null;
  const run = async () => {
    eng ||= await loadJq();
    clear(status); clear(cmd);
    let a; try { a = parseArgs(); } catch (e: any) { out.value = ''; status.append(note(e.message, 'warn')); return; }
    const sw = [['raw', '-r'], ['compact', '-c'], ['slurp', '-s'], ['nullInput', '-n'], ['sortKeys', '-S'], ['rawInput', '-R'], ['tab', '--tab'], ['ascii', '-a'], ['join', '-j']].filter(([k]) => flags[k]).map(([, f]) => f);
    cmd.append('Command line: ', h('code', null, ['jq', ...sw, ...a.cli, q(filter.value), 'input.json'].join(' ')));
    const r = eng.run(filter.value, src.value, { ...flags, args: a.o });
    out.value = r.output;
    const msg = { 0: '', 2: 'The input is not valid JSON (turn on "Raw input" to read plain text lines).', 3: 'The filter has a syntax error.', 5: 'The filter stopped with an error.' }[r.code as 0] ?? `Exit status ${r.code}.`;
    if (r.error || r.code) status.append(note([msg, r.error].filter(Boolean).join(' ').trim() || `Exit status ${r.code}`, r.code ? 'warn' : 'info'));
    else status.append(note(`${r.output ? r.output.split('\n').filter(Boolean).length : 0} result line(s).`, 'info'));
  };
  const rerun = debounce(run, 200);
  filter.addEventListener('input', rerun); src.addEventListener('input', rerun); args.addEventListener('input', rerun);
  filter.addEventListener('keydown', (e) => { if (e.key === 'Enter') { rerun.cancel(); run(); } });
  const ex = h('div', { class: 'chips' }, EXAMPLES.map(([f, l]) => button(l, () => { filter.value = f; if (f.includes('@csv')) setFlag('raw', true); run(); }, { small: true })));
  const toggles: Record<string, HTMLElement> = {};
  const setFlag = (k: string, v: boolean) => { flags[k] = v; const cb = toggles[k]?.querySelector('input'); if (cb) (cb as HTMLInputElement).checked = v; };
  const tg = (k: string, label: string) => (toggles[k] = toggle(label, flags[k], (v) => { flags[k] = v; run(); }));
  root.append(
    card('Filter', filter, ex, cmd),
    card('Options', h('div', { class: 'row wrap' }, tg('raw', 'Raw output (-r)'), tg('compact', 'Compact (-c)'), tg('slurp', 'Slurp (-s)'), tg('nullInput', 'Null input (-n)'), tg('sortKeys', 'Sort keys (-S)'), tg('rawInput', 'Raw input (-R)'), tg('tab', 'Tab indent'), tg('ascii', 'ASCII output (-a)'), tg('join', 'Join output (-j)')),
      field('Arguments ($name in the filter)', args, 'name=value is --arg (text); name:=value is --argjson (any JSON).')),
    card('Input JSON', src, filePicker({ accept: '.json,.jsonl,.ndjson,.txt,.log,.csv,application/json', label: 'Open a file', onFiles: async ([f]) => { src.value = await f.text(); run(); } })),
    card('Output', out, status, h('div', { class: 'row' }, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' }), button('Download', () => downloadBlob(new Blob([out.value], { type: 'application/json' }), flags.raw ? 'output.txt' : 'output.json'), { small: true, icon: 'Download' }))),
    note('jq 1.8.2 compiled from the official C source to WebAssembly — the same filter language and output as the jq command line. Your data stays in this browser.', 'info'));
  run();
  return () => rerun.cancel();
};
export const sqlfmt: Mount = (root) => {
  let indent = 2, upper = true, lines = 1, inline = false, fmt: Devcore | null = null;
  const src = textarea({ rows: 10, mono: true, value: "select o.id, c.name, sum(i.qty * i.price) as total from orders o join customers c on c.id = o.customer_id left join items i on i.order_id = o.id where o.created_at >= '2026-01-01' and c.city in ('Pune', 'Mumbai') group by o.id, c.name having sum(i.qty) > 2 order by total desc limit 10; update stock set qty = qty - 1 where sku = 'A-1';" });
  const out = outputBox({ rows: 18, mono: true }), info = h('div');
  const run = async () => {
    fmt ||= await devcore('sqlfmt'); clear(info);
    out.value = fmt.text('sqlfmt', { sql: src.value, indent, uppercase: upper, lines, inline });
    if (!src.value.trim()) info.append(note('Paste SQL to format.', 'info'));
  };
  src.addEventListener('input', debounce(run, 150));
  root.append(card('SQL', src, filePicker({ accept: '.sql,.txt', label: 'Open a .sql file', onFiles: async ([f]) => { src.value = await f.text(); run(); } })),
    card(null, h('div', { class: 'row' }, field('Indent', segmented([['2', '2 spaces'], ['4', '4 spaces'], ['0', 'Tab']], '2', (v) => { indent = +v; run(); })), field('Blank lines between statements', segmented([['1', '0'], ['2', '1'], ['3', '2']], '1', (v) => { lines = +v; run(); }))),
      h('div', { class: 'row' }, toggle('UPPER-CASE keywords', true, (v) => { upper = v; run(); }), toggle('One line', false, (v) => { inline = v; run(); }))),
    card('Formatted', out, info, h('div', { class: 'row' }, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' }), button('Download .sql', () => downloadBlob(new Blob([out.value], { type: 'application/sql' }), 'formatted.sql'), { small: true, icon: 'Download' }))),
    note('Formats standard SQL (works for PostgreSQL, MySQL, SQLite, SQL Server and Oracle queries); comments and strings are kept as written.', 'info'));
  run();
};
export { prettier } from './prettier';
