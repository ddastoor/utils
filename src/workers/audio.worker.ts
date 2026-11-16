// Runs audio.wasm (LAME MP3, WAV, resampler, WSOLA) off the main thread.
import { instantiateWasi } from '../wasm/wasi';
import { bindAudio, type AudioEngine } from '../wasm/audio';
import wasmUrl from '../wasm/bin/audio.wasm?url';

let eng: Promise<AudioEngine> | null = null;
self.onmessage = async (ev: MessageEvent<{ id: number; op: keyof AudioEngine; args: any[] }>) => {
  const { id, op, args } = ev.data;
  try {
    eng ||= instantiateWasi(wasmUrl).then((x) => bindAudio(x.exports));
    const m = await eng;
    const result = (m[op] as (...a: any[]) => any).apply(m, args);
    const transfer: Transferable[] = [];
    const add = (v: any) => { if (v?.buffer instanceof ArrayBuffer && !transfer.includes(v.buffer)) transfer.push(v.buffer); };
    Array.isArray(result) ? result.forEach(add) : add(result);
    (self as any).postMessage({ id, result }, transfer);
  } catch (e: any) {
    (self as any).postMessage({ id, error: e?.message || String(e) });
  }
};
