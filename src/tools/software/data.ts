// Software › data tabs.
import { h, card, field, textarea, toggle, clear, note, copy, button, outputBox, filePicker, downloadBlob, type Mount } from '../../ui';
import { devcore, type Devcore } from '../../wasm/devcore';
import { debounce } from './devui';
import { runJq, stopJq, JqStopped, JQ_LIMIT_MS } from '../../lib/jq-client';
import SAMPLES from './jq-samples.json';
import { readTextFile } from '../../lib/textfile';

/** The Output box shows this many characters; Copy and Download give everything. */
const JQ_SHOW = 1_000_000;
export { xml, json2types, jsondiff, mdtable, mockdata } from './data2';
export { yaml, jsonschema } from './data3';
export { sqlite } from './sqlite';
export const jq: Mount = (root) => {
  // the sample, its filter and the example chips live in jq-samples.json: scripts/make-jq-reference.mjs runs the same
  // ones through the native jq, and the tab's e2e suite expects exactly those outputs
  const SAMPLE = JSON.stringify(SAMPLES.sample, null, 2);
  const EXAMPLES = SAMPLES.examples as Array<[string, string]>;
  const flags: Record<string, boolean> = { raw: false, compact: false, slurp: false, nullInput: false, sortKeys: false, rawInput: false, tab: false, ascii: false, join: false };
  const filter = h('input', { class: 'input mono', value: SAMPLES.filter, spellcheck: 'false', 'aria-label': 'Filter' }) as HTMLInputElement;
  const src = textarea({ rows: 14, mono: true, value: SAMPLE });
  const args = textarea({ rows: 3, mono: true, value: SAMPLES.args, placeholder: 'name=value (one per line; a JSON value with name:=value)' });
  // a plain read-only box: Copy and Download give the whole output even when the box shows only its beginning
  const out = textarea({ rows: 16, mono: true, readonly: true }); out.setAttribute('aria-label', 'Output');
  const status = h('div'), cmd = h('div', { class: 'mono small' });
  let full = '', seq = 0, slow = 0;
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
  const N = (n: number) => n.toLocaleString('en-IN');
  // data-busy on the output box: "1" from the moment a run is asked for until the outcome of the newest run is on screen
  // (the e2e suite waits for it; a run replaced by a newer one never clears it)
  const done = () => { out.dataset.busy = '0'; };
  // The filter runs in a worker (src/lib/jq-client.ts): repeat(1), recurse without an end or a range of a billion used
  // to freeze the tab for a minute and then leave a broken engine behind.
  const run = async () => {
    const id = ++seq; out.dataset.busy = '1';
    clear(status); clear(cmd); clearTimeout(slow);
    let a; try { a = parseArgs(); } catch (e: any) { out.value = full = ''; status.append(note(e.message, 'warn')); done(); return; }
    // the same flags give the same output on the jq command line: Compact wins over Tab indent, Join output includes Raw output
    const sw = [['raw', '-r'], ['compact', '-c'], ['slurp', '-s'], ['nullInput', '-n'], ['sortKeys', '-S'], ['rawInput', '-R'], ['tab', '--tab'], ['ascii', '-a'], ['join', '-j']]
      .filter(([k]) => flags[k] && !(k === 'tab' && flags.compact) && !(k === 'raw' && flags.join)).map(([, f]) => f);
    cmd.append('Command line: ', h('code', null, ['jq', ...sw, ...a.cli, q(filter.value), 'input.json'].join(' ')));
    slow = window.setTimeout(() => { if (id === seq) clear(status).append(note(h('span', null, 'Running… ', h('button', { type: 'button', class: 'link-btn', onclick: () => stopJq() }, 'Stop')), 'info')); }, 400);
    let r;
    try { r = await runJq(filter.value, src.value, { ...flags, args: a.o }); }
    catch (e: any) {
      if (id !== seq || !(e instanceof JqStopped) || e.why === 'superseded' || e.why === 'left') return;
      clearTimeout(slow); out.value = full = ''; clear(status);
      status.append(note(e.why === 'timeout' ? `Stopped after ${JQ_LIMIT_MS / 1000} seconds: this filter does not finish. Filters such as repeat(…), recurse without a stop condition, or range over a huge number never end — add limit(n; …) or first(…).`
        : e.why === 'stopped' ? 'Stopped.' : (/unreachable|out of bounds|memory/i.test(e.message) ? 'jq ran out of memory: the filter builds something larger than the 2 GB this tab can give it.' : `jq stopped unexpectedly (${e.message}).`) + ' The engine has been restarted — change the filter and it runs again.', 'warn'));
      done(); return;
    }
    if (id !== seq) return;
    clearTimeout(slow); clear(status);
    full = r.output; out.value = full.length > JQ_SHOW ? full.slice(0, JQ_SHOW) : full;
    // exit status and messages are those of the jq command line (wasm/jq/glue.c follows jq's main.c): 3 = the filter does
    // not compile, 5 = an error (also input that is not JSON), any other number = halt_error's own code
    const msg = r.code === 0 ? (r.error ? 'Messages from the filter (debug, stderr or an error on one of the inputs):' : '')
      : /^jq: \d+ compile errors?$/m.test(r.error) ? `The filter does not compile.${/module not found/.test(r.error) ? ' Modules cannot be imported here: a browser tab has no module files (import and include need them).' : ''}`
      : /^jq: parse error/m.test(r.error) ? 'The input is not valid JSON (turn on "Raw input" to read plain text lines).'
      : /^jq: stopped after/m.test(r.error) ? 'Output stopped.'
      : r.code === 5 ? 'The filter stopped with an error.' : `The filter ended with exit status ${r.code}.`;
    const lines = r.output ? r.output.split('\n').filter(Boolean).length : 0;
    if (r.error || r.code) status.append(note(h('div', null, msg, r.error && h('pre', { class: 'out-pre' }, r.error)), r.code ? 'warn' : 'info'));
    if (!r.code) status.append(note(`${N(lines)} result line${lines === 1 ? '' : 's'}.`, 'info'));
    if (full.length > JQ_SHOW) status.append(note(`Showing the first ${N(JQ_SHOW)} of ${N(full.length)} characters — Copy and Download give all of it.`, 'info'));
    done();
  };
  const rerun = debounce(() => { void run(); }, 200);
  filter.addEventListener('input', rerun); src.addEventListener('input', rerun); args.addEventListener('input', rerun);
  filter.addEventListener('keydown', (e) => { if (e.key === 'Enter') { rerun.cancel(); void run(); } });
  const ex = h('div', { class: 'chips' }, EXAMPLES.map(([f, l]) => button(l, () => { filter.value = f; if (f.includes('@csv')) setFlag('raw', true); return run(); }, { small: true })));
  const toggles: Record<string, HTMLElement> = {};
  const setFlag = (k: string, v: boolean) => { flags[k] = v; const cb = toggles[k]?.querySelector('input'); if (cb) (cb as HTMLInputElement).checked = v; };
  const tg = (k: string, label: string) => (toggles[k] = toggle(label, flags[k], (v) => { flags[k] = v; void run(); }));
  root.append(
    card('Filter', filter, ex, cmd),
    card('Options', h('div', { class: 'row wrap' }, tg('raw', 'Raw output (-r)'), tg('compact', 'Compact (-c)'), tg('slurp', 'Slurp (-s)'), tg('nullInput', 'Null input (-n)'), tg('sortKeys', 'Sort keys (-S)'), tg('rawInput', 'Raw input (-R)'), tg('tab', 'Tab indent'), tg('ascii', 'ASCII output (-a)'), tg('join', 'Join output (-j)')),
      field('Arguments ($name in the filter)', args, 'name=value is --arg (text); name:=value is --argjson (any JSON).')),
    card('Input JSON', src, filePicker({ accept: '.json,.jsonl,.ndjson,.txt,.log,.csv,application/json', label: 'Open a file', onFiles: async ([f]) => { src.value = await readTextFile(f, 'JSON is plain text'); await run(); } })),
    card('Output', out, status, h('div', { class: 'row' }, button('Copy', () => { if (!full) throw new Error('Nothing to copy yet'); return copy(full); }, { small: true, icon: 'Copy' }), button('Download', () => { if (!full) throw new Error('Nothing to save yet'); downloadBlob(new Blob([full], { type: 'application/json' }), flags.raw || flags.join ? 'output.txt' : 'output.json'); }, { small: true, icon: 'Download' }))),
    note('jq 1.8.2 compiled from the official C source to WebAssembly — the same filter language and output as the jq command line. Your data stays in this browser.', 'info'));
  void run();
  return () => { rerun.cancel(); clearTimeout(slow); };
};
export { sqlfmt } from './sqlfmt';
export { prettier } from './prettier';
