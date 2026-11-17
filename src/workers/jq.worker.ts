// jq in a worker: a filter that never ends (repeat, recurse, a range of a billion) or that runs out of memory cannot
// freeze the page or leave a broken engine behind — the page ends this worker and starts a fresh one.
import { instantiateWasi } from '../wasm/wasi';
import wasmUrl from '../wasm/bin/jq.wasm?url';
import { bindJq, type JqOpts, type JqResult } from '../wasm/jq';
export interface JqReq { id: number; filter: string; input: string; opts: JqOpts }
export interface JqRes { id: number; result?: JqResult; error?: string }
let eng: Promise<ReturnType<typeof bindJq>> | null = null;
const KEEP_BYTES = 256 << 20;
self.onmessage = async (ev: MessageEvent<JqReq>) => {
  const { id, filter, input, opts } = ev.data;
  try {
    eng ||= instantiateWasi(wasmUrl).then((x) => bindJq(x.exports));
    const jq = await eng, result = jq.run(filter, input, opts);
    if (jq.memoryBytes() > KEEP_BYTES) eng = null;   // a run that needed a lot: give the memory back, the next run starts a new engine
    (self as any).postMessage({ id, result } satisfies JqRes);
  } catch (e: any) {
    eng = null; // after a trap (out of memory, stack overflow) the instance is unusable
    (self as any).postMessage({ id, error: String(e?.message || e) } satisfies JqRes);
  }
};
