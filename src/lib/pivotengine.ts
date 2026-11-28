// SliceDiceGrapher's engine (potentials #75): Perspective 5.10 (FINOS; @perspective-dev/client and /server, Apache-2.0) — its engine is C++ →
// WebAssembly (perspective-server.wasm, 2.6 MB) run in a worker (the package's worker script), its client Rust → WebAssembly (perspective-js.wasm,
// 0.6 MB) on the page. Both fetched from this site with the first data; the worker ends when the tab is left. A table is made of typed
// columns; a view is a pivot (group_by, split_by, aggregates, filter, sort, expressions for date buckets) read back as columns.
import perspective from '@perspective-dev/client';
import serverUrl from '@perspective-dev/server/dist/wasm/perspective-server.wasm?url';
import clientUrl from '@perspective-dev/client/dist/wasm/perspective-js.wasm?url';
import { lazyEngine, trackWorker } from '../lifecycle';

export type PivotClient = Awaited<ReturnType<typeof perspective.worker>>;

export const pivotEngine = lazyEngine<PivotClient>('slicedice-engine', async () => {
  perspective.init_server({ wasm32: () => fetch(serverUrl) });
  perspective.init_client(fetch(clientUrl));
  // the package's own worker script, as a worker of ours (leaving the tab ends it — src/lifecycle.ts); Perspective would make one from a blob
  const w = trackWorker(new Worker(new URL('../../node_modules/@perspective-dev/client/dist/cdn/perspective-server.worker.js', import.meta.url), { type: 'module' }), 'slicedice-engine', () => pivotEngine.reset());
  return perspective.worker(Promise.resolve(w));
});
