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
/** The sample rate the file's audio is stored at (mediabunny reads it from the headers), or 0. */
export async function sourceRate(data: Blob): Promise<number> {
  try {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(data), formats: mb.ALL_FORMATS });
    const t = await input.getPrimaryAudioTrack();
    return t ? await t.getSampleRate() : 0;
  } catch { return 0; }
}
/** Decode any file the browser can play (MP3, AAC/M4A, Opus/WebM, OGG, WAV, FLAC; and video files' audio) at the
 *  file's own sample rate — a plain AudioContext decodes at the device's rate (a 44.1 kHz file came out at 48 kHz,
 *  and was saved so). */
export async function decodeAudio(data: ArrayBuffer | Blob): Promise<AudioBuffer> {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const buf = await blob.arrayBuffer(), rate = await sourceRate(blob);
  if (rate >= 8000 && rate <= 384000) {
    try { return await new OfflineAudioContext(1, 1, rate).decodeAudioData(buf.slice(0)); } catch { /* a rate this browser cannot hold: below */ }
  }
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try { return await ctx.decodeAudioData(buf); } finally { ctx.close?.(); }
}
