// Regex Tester: matching runs here, not on the page, so a pattern that backtracks without end ((a+)+$ on a long run of
// "a") cannot freeze the tab — the page ends this worker after a time limit and starts a new one. Each flavour's engine
// (to-do #8: src/lib/regex/) is fetched the first time that flavour is chosen and kept while the tab is open; a
// "run" message tells the page that the engine is ready and the matching itself has begun (its time limit starts then).
import { PatternError, type EngineOut, type EngineReq } from '../lib/regex/common';
import { flavour, type FlavourId } from '../lib/regex/flavours';
import pyUrl from '../wasm/bin/python.wasm?url';
import zipUrl from '../wasm/bin/python314.zip?url';
import goUrl from '../wasm/bin/regex-go.wasm?url';
import onigUrl from 'vscode-oniguruma/release/onig.wasm?url';

export interface RegexReq extends EngineReq { id: number; flavour: FlavourId }
export interface RegexRes extends Partial<EngineOut> {
  id: number;
  /** 'run': the engine is ready and this request is being matched. */
  phase?: 'run';
  error?: string;
  /** The error is the pattern's (it does not compile), not the engine's. */
  pattern?: boolean;
}

const bytes = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
const compile = (u: string) => WebAssembly.compileStreaming(fetch(u)).catch(async () => WebAssembly.compile(await bytes(u)));
type Run = (q: EngineReq) => EngineOut | Promise<EngineOut>;
const loaders: Record<FlavourId, () => Promise<Run>> = {
  js: async () => (await import('../lib/regex/js')).runJs,
  pcre2: async () => { const m = await import('../lib/regex/pcre2'); await m.loadPcre2(); return m.runPcre2; },
  python: async () => { const [m, mod, zip] = await Promise.all([import('../lib/regex/python'), compile(pyUrl), bytes(zipUrl)]); return (q) => m.runPython(mod, zip, q); },
  go: async () => { const [m, mod] = await Promise.all([import('../lib/regex/go'), compile(goUrl)]); return (q) => m.runGo(mod, q); },
  ruby: async () => { const [m, wasm] = await Promise.all([import('../lib/regex/ruby'), bytes(onigUrl)]); await m.loadOnig(wasm); return m.runRuby; },
};
const engines = new Map<FlavourId, Promise<Run>>();
const engine = (f: FlavourId) => {
  let p = engines.get(f);
  if (!p) { p = loaders[f](); p.catch(() => engines.delete(f)); engines.set(f, p); } // a failed download is tried again next time
  return p;
};

const post = (r: RegexRes) => (self as any).postMessage(r);
let next: RegexReq | null = null, busy = false;
async function work() {
  busy = true;
  while (next) {
    // let requests that arrived meanwhile replace this one: only the newest is matched
    await new Promise((r) => setTimeout(r, 0));
    const q = next!; next = null;
    let run: Run;
    try { run = await engine(q.flavour); }
    catch (e: any) { post({ id: q.id, error: `The ${flavour(q.flavour).label.replace(/ \(.*/, '')} engine could not be fetched (${e?.message || e}). Check the connection; the next change tries again.` }); continue; }
    if (next) continue;
    post({ id: q.id, phase: 'run' });
    try { post({ id: q.id, ...(await run(q)) }); }
    catch (e: any) { post({ id: q.id, error: String(e?.message || e), pattern: e instanceof PatternError }); }
  }
  busy = false;
}
self.onmessage = (ev: MessageEvent<RegexReq>) => { next = ev.data; if (!busy) void work(); };
