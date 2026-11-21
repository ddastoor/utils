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
import posixUrl from '../wasm/bin/posix-re.wasm?url';

export interface RegexReq extends EngineReq { id: number; flavour: FlavourId; /** The site's address (the page's document.baseURI): where Perl's module is. */ base?: string }
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
let base = '';
/** zeroperl (the EXIF tab's Perl) decides it runs in a browser by `window` and `document` — a worker has neither — and
 *  would otherwise reach for Node's file system; the two names are set for it (as src/workers/exiftool.worker.ts does). */
async function makePerl(): Promise<Run> {
  (self as any).window ??= self; (self as any).document ??= {};
  const [{ ZeroPerl }, m] = await Promise.all([import('@6over3/zeroperl-ts'), import('../lib/regex/perl')]);
  const out = { text: '' }, dec = new TextDecoder();
  const perl = await ZeroPerl.create({
    stdout: (d: string | Uint8Array) => { out.text += typeof d === 'string' ? d : dec.decode(d, { stream: true }); },
    stderr: () => {},
    fetch: (() => fetch(new URL('vendor/exiftool/zeroperl.wasm', base))) as any,
  });
  return (q) => m.runPerl(perl, out, q);
}
/** The two Python flavours run the same interpreter: it is fetched and compiled once. */
let py: Promise<[typeof import('../lib/regex/python'), WebAssembly.Module, Uint8Array]> | null = null;
const python = () => {
  if (!py) { py = Promise.all([import('../lib/regex/python'), compile(pyUrl), bytes(zipUrl)]); py.catch(() => { py = null; }); }
  return py;
};
const loaders: Record<FlavourId, () => Promise<Run>> = {
  perl: makePerl,
  js: async () => (await import('../lib/regex/js')).runJs,
  pcre2: async () => { const m = await import('../lib/regex/pcre2'); await m.loadPcre2(); return m.runPcre2; },
  python: async () => { const [m, mod, zip] = await python(); return (q) => m.runPython(mod, zip, q, 're'); },
  pyregex: async () => { const [m, mod, zip] = await python(); return (q) => m.runPython(mod, zip, q, 'regex'); },
  go: async () => { const [m, mod] = await Promise.all([import('../lib/regex/go'), compile(goUrl)]); return (q) => m.runGo(mod, q); },
  ruby: async () => { const [m, wasm] = await Promise.all([import('../lib/regex/ruby'), bytes(onigUrl)]); await m.loadOnig(wasm); return m.runRuby; },
  posix: async () => { const [m, w] = await Promise.all([import('../lib/regex/posix'), import('../wasm/wasi')]); const x = await w.instantiateWasi(posixUrl); return (q) => m.runPosix(x.exports, q); },
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
self.onmessage = (ev: MessageEvent<RegexReq>) => { next = ev.data; if (ev.data.base) base = ev.data.base; if (!busy) void work(); };
