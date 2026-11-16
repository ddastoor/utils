// Software › data tabs.
import { h, card, field, textarea, segmented, toggle, clear, note, copy, button, outputBox, filePicker, downloadBlob, type Mount } from '../../ui';
import { devcore, type Devcore } from '../../wasm/devcore';
import { debounce } from './devui';
export { xml, json2types, jsondiff, mdtable, mockdata } from './data2';
export { yaml, jsonschema } from './data3';
const stub = () => note('This tool is being built.', 'info');
export const sqlite: Mount = (root) => { root.append(stub()); };
export const jq: Mount = (root) => { root.append(stub()); };
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
