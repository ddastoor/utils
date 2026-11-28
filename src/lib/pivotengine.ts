// SliceDiceGrapher's engine (potentials #75): Perspective 5.10 (FINOS; @perspective-dev/client and /server, Apache-2.0) — its engine is C++ →
// WebAssembly (perspective-server.wasm, 2.6 MB) run in a worker (the package's worker script), its client Rust → WebAssembly (perspective-js.wasm,
// 0.6 MB, with its JavaScript, 65 KB) on the page. All fetched from this site with the first data; the worker ends when the tab is left. A table
// is made of typed columns; a view is a pivot (group_by, split_by, aggregates, filter, expressions for date buckets) read back as columns.
import serverUrl from '@perspective-dev/server/dist/wasm/perspective-server.wasm?url';
import clientUrl from '@perspective-dev/client/dist/wasm/perspective-js.wasm?url';
import { lazyEngine, trackWorker } from '../lifecycle';

type Perspective = typeof import('@perspective-dev/client').default;
export type PivotClient = Awaited<ReturnType<Perspective['worker']>>;

let ready: Promise<void> | null = null;
/** The two WebAssembly files, fetched by us first and then handed to Perspective — once a page: Perspective keeps the first source of each
 *  for the page's life and refuses a second ("server32 wasm is already initialized"), so a download that failed must not reach it (the next
 *  try fetches again). */
function setUp(perspective: Perspective): Promise<void> {
  return (ready ??= (async () => {
    const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`The pivot engine could not be fetched (HTTP ${r.status}).`); return r.arrayBuffer(); };
    const [server0, client] = await Promise.all([get(serverUrl), get(clientUrl)]);
    let server: ArrayBuffer | null = server0;
    const wasm = (b: ArrayBuffer) => new Response(b, { headers: { 'Content-Type': 'application/wasm' } });
    // the engine's file for a worker: the bytes already here the first time, from the browser's cache after that
    perspective.init_server({ wasm32: () => { const b = server; server = null; return b ? Promise.resolve(wasm(b)) : fetch(serverUrl); } });
    perspective.init_client(Promise.resolve(wasm(client)));
  })().catch((e) => { ready = null; throw e; }));
}

export const pivotEngine = lazyEngine<PivotClient>('slicedice-engine', async () => {
  const { default: perspective } = await import('@perspective-dev/client');   // its JavaScript with the first data too, not with the tab
  await setUp(perspective);
  // the package's own worker script, as a worker of ours (leaving the tab ends it — src/lifecycle.ts; its key is not the engine's, which
  // trackWorker would release); Perspective would make one from a blob
  const w = trackWorker(new Worker(new URL('../../node_modules/@perspective-dev/client/dist/cdn/perspective-server.worker.js', import.meta.url), { type: 'module' }), 'slicedice-worker', () => pivotEngine.reset());
  return perspective.worker(Promise.resolve(w));
});
