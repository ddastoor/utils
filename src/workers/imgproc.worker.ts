// Runs imgproc.wasm operations off the main thread.
import { instantiateWasi } from '../wasm/wasi';
import { bindImgproc, type Imgproc } from '../wasm/imgproc';
import wasmUrl from '../wasm/bin/imgproc.wasm?url';

let ip: Promise<Imgproc> | null = null;
self.onmessage = async (ev: MessageEvent<{ id: number; op: keyof Imgproc; args: any[] }>) => {
  const { id, op, args } = ev.data;
  try {
    ip ||= instantiateWasi(wasmUrl).then((x) => bindImgproc(x.exports));
    const m = await ip;
    const result = (m[op] as (...a: any[]) => any)(...args);
    const transfer: Transferable[] = [];
    if (result?.data?.buffer) transfer.push(result.data.buffer);
    else if (result?.buffer instanceof ArrayBuffer) transfer.push(result.buffer);
    (self as any).postMessage({ id, result }, transfer);
  } catch (e: any) {
    (self as any).postMessage({ id, error: e?.message || String(e) });
  }
};
