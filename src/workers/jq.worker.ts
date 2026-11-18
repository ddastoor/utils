// jq in a worker: a filter that never ends (repeat, recurse, a range of a billion) or that runs out of memory cannot
// freeze the page or leave a broken engine behind — the page ends this worker and starts a fresh one.
// Local time (`localtime`, `strflocaltime`) is the browser's zone: jq asks the host (supertools.tz_info, wasm/jq/hosttz.c);
// the zone's own abbreviations ("IST", "+04" as the jq command line prints them) come from tzabbr.json, fetched the
// first time a filter mentions local time.
import { instantiateWasi } from '../wasm/wasi';
import wasmUrl from '../wasm/bin/jq.wasm?url';
import zonesUrl from '../lib/tzabbr.json?url';
import { bindJq, type JqOpts, type JqResult } from '../wasm/jq';
import { tzInfoImport } from '../lib/tzinfo';
export interface JqReq { id: number; filter: string; input: string; opts: JqOpts }
export interface JqRes { id: number; result?: JqResult; error?: string }
let eng: Promise<ReturnType<typeof bindJq>> | null = null;
const KEEP_BYTES = 256 << 20;
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let abbr = '', names: Promise<void> | null = null, run = 0;   // run: every filter starts like a new jq process
const loadNames = () => (names ||= fetch(zonesUrl).then((r) => (r.ok ? r.json() : {})).then((j: Record<string, string>) => { abbr = j[zone] || ''; }).catch(() => { names = null; }));   // without the table the names are Intl's
const start = () => { let mem: WebAssembly.Memory; return instantiateWasi(wasmUrl, { supertools: { tz_info: tzInfoImport(() => mem.buffer, () => ({ zone, abbr, run })) } }).then((x) => { mem = x.memory; return bindJq(x.exports); }); };
self.onmessage = async (ev: MessageEvent<JqReq>) => {
  const { id, filter, input, opts } = ev.data;
  try {
    eng ||= start();
    if (/local/.test(filter)) await loadNames();
    run++;
    const jq = await eng, result = jq.run(filter, input, opts);
    if (jq.memoryBytes() > KEEP_BYTES) eng = null;   // a run that needed a lot: give the memory back, the next run starts a new engine
    (self as any).postMessage({ id, result } satisfies JqRes);
  } catch (e: any) {
    eng = null; // after a trap (out of memory, stack overflow) the instance is unusable
    (self as any).postMessage({ id, error: String(e?.message || e) } satisfies JqRes);
  }
};
