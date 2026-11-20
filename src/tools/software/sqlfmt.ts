// SQL Formatter (#/sqlfmt, PC only). Engine: our own formatter in devcore-sqlfmt.wasm (wasm/devcore/src/sqlfmt.rs) —
// it changes white space and the case of keywords, nothing else, and checks its own result against the input.
import { h, card, field, textarea, segmented, select, toggle, clear, note, copy, button, outputBox, filePicker, downloadBlob, type Mount } from '../../ui';
import { devcore, type Devcore } from '../../wasm/devcore';
import { debounce } from './devui';
import { readTextFile } from '../../lib/textfile';

type Dialect = 'auto' | 'standard' | 'postgres' | 'mysql' | 'sqlite' | 'tsql' | 'oracle';
type Result = { text: string; dialect: Exclude<Dialect, 'auto'>; kept: boolean; warn: string[] };
const DIALECTS: Array<[Dialect, string]> = [['auto', 'Auto-detect'], ['standard', 'Standard SQL'], ['postgres', 'PostgreSQL'], ['mysql', 'MySQL / MariaDB'], ['sqlite', 'SQLite'], ['tsql', 'SQL Server'], ['oracle', 'Oracle']];
const NAME = Object.fromEntries(DIALECTS) as Record<Dialect, string>;
/** The Formatted box shows this many characters; Copy and Download give everything. */
const SHOW = 1_000_000;
const SAMPLE = "select o.id, c.name, sum(i.qty * i.price) as total from orders o join customers c on c.id = o.customer_id left join items i on i.order_id = o.id where o.created_at >= '2026-01-01' and c.city in ('Pune', 'Mumbai') group by o.id, c.name having sum(i.qty) > 2 order by total desc limit 10; update stock set qty = qty - 1 where sku = 'A-1';";

export const sqlfmt: Mount = (root) => {
  let indent = 2, keywords = 'upper', lines = 1, inline = false, dialect: Dialect = 'auto', engine: Devcore | null = null, full = '', file = '';
  const src = textarea({ rows: 10, mono: true, value: SAMPLE });
  src.setAttribute('aria-label', 'SQL');
  const out = outputBox({ rows: 18, mono: true, label: 'Formatted SQL', text: () => full }), info = h('div');
  const run = async () => {
    engine ||= await devcore('sqlfmt');
    clear(info);
    if (!src.value.trim()) { full = out.value = ''; info.append(note('Paste SQL to format.', 'info')); return; }
    let r: Result;
    try { r = engine.json<Result>('sqlfmt', { sql: src.value, dialect, indent, keywords, lines, inline }); } catch (e) {
      full = out.value = '';
      info.append(note(`This text could not be formatted (${e instanceof Error ? e.message : e}).`, 'err'));
      return;
    }
    full = r.text;
    out.value = full.length > SHOW ? full.slice(0, SHOW) : full;
    if (r.kept) info.append(note('Left as it is: laid out anew, this text would no longer read the same. Choose the dialect it is written in.', 'warn'));
    for (const w of r.warn) info.append(note(w, 'warn'));
    const read = dialect === 'auto' ? `Read as ${NAME[r.dialect]} (detected — choose the dialect above if that is wrong).` : `Read as ${NAME[r.dialect]}.`;
    info.append(note(full.length > SHOW ? `${read} The first ${SHOW.toLocaleString('en-IN')} characters are shown; Copy and Download give all ${full.length.toLocaleString('en-IN')}.` : read, 'info'));
  };
  src.addEventListener('input', debounce(run, 150));
  const need = () => { if (!full) throw new Error('Nothing to copy yet'); };
  root.append(
    card('SQL', src, filePicker({ accept: '.sql,.txt,.ddl,.dml,.psql,.pgsql,.tsql', label: 'Open a .sql file', onFiles: async ([f]) => { src.value = await readTextFile(f, 'SQL is plain text'); file = f.name; run(); } })),
    card(null,
      h('div', { class: 'row wrap' },
        field('Dialect', select(DIALECTS, 'auto', (v) => { dialect = v; run(); })),
        field('Keywords', segmented([['upper', 'UPPER'], ['lower', 'lower'], ['keep', 'As typed']], 'upper', (v) => { keywords = v; run(); })),
        field('Indent', segmented([['2', '2 spaces'], ['4', '4 spaces'], ['0', 'Tab']], '2', (v) => { indent = +v; run(); })),
        field('Blank lines between statements', segmented([['1', '0'], ['2', '1'], ['3', '2']], '1', (v) => { lines = +v; run(); }))),
      h('div', { class: 'row' }, toggle('One line per statement', false, (v) => { inline = v; run(); }))),
    card('Formatted', out, info, h('div', { class: 'row' },
      button('Copy', () => { need(); return copy(full); }, { small: true, icon: 'Copy' }),
      button('Download .sql', () => { need(); downloadBlob(new Blob([full], { type: 'application/sql' }), file ? file.replace(/(\.[A-Za-z0-9]+)?$/, '.formatted.sql') : 'formatted.sql'); }, { small: true, icon: 'Download' }))),
    note('Only white space and the case of keywords change: strings, names, numbers and comments stay exactly as typed, and a word is upper-cased only where it is used as a keyword (a column called “status” or “type” keeps its case). The result is checked against what you pasted before it is shown. Your SQL stays in this browser.', 'info'));
  void run();
};
