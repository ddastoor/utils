// Graphviz in a worker: lays out and renders DOT. A trap (Graphviz aborts on some fatal errors) makes a fresh instance.
import { instantiateWasi } from '../wasm/wasi';
import wasmUrl from '../wasm/bin/graphviz.wasm?url';
import { bindGraphviz } from '../wasm/graphviz';
let gv: Promise<ReturnType<typeof bindGraphviz>> | null = null;
self.onmessage = async (ev: MessageEvent) => {
  const { id, src, engine, format } = ev.data;
  try {
    gv ||= instantiateWasi(wasmUrl).then((x) => bindGraphviz(x.exports));
    const r = (await gv).render(src, engine, format);
    (self as any).postMessage({ id, result: r });
  } catch (e: any) {
    gv = null; // the instance may be broken after a trap
    (self as any).postMessage({ id, error: `Graphviz stopped: ${e?.message || e}` });
  }
};
