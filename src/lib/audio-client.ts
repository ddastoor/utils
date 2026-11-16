// Main-thread side of the audio engine (src/workers/audio.worker.ts): audio('mp3', channels, sampleRate, opts).
// The worker starts on first use and ends when the tab is left (src/lifecycle.ts).
import type { AudioEngine } from '../wasm/audio';
import { trackWorker } from '../lifecycle';

let worker: Worker | null = null, seq = 0;
const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
export function audio<K extends keyof AudioEngine>(op: K, ...args: Parameters<AudioEngine[K]>): Promise<ReturnType<AudioEngine[K]>> {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/audio.worker.ts', import.meta.url), { type: 'module' }), 'audio-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.result); };
    worker.onerror = (e) => { for (const p of pending.values()) p.rej(new Error(e.message || 'Audio engine failed')); pending.clear(); worker = null; };
  }
  const id = ++seq;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); worker!.postMessage({ id, op, args }); });
}

/** AudioBuffer → planar Float32Array copies. */
export const channelsOf = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i).slice());
/** Decode any file the browser can play (MP3, AAC/M4A, Opus/WebM, OGG, WAV, FLAC; and video files' audio). */
export async function decodeAudio(data: ArrayBuffer | Blob): Promise<AudioBuffer> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try { return await ctx.decodeAudioData(buf); } finally { ctx.close?.(); }
}
