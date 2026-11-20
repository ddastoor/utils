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

let asym: Promise<boolean> | null = null;
/** Does this browser read 16-bit PCM as Chromium does — s / 32767 above zero, s / 32768 below (Firefox and Safari divide
 *  both by 32768)? Found once by decoding a one-sample WAV of 32767; the WAV writer inverts the browser's rule, so a
 *  file opened and saved unchanged keeps every sample. */
export function int16Asymmetric(): Promise<boolean> {
  return (asym ||= (async () => {
    try {
      const b = new ArrayBuffer(46), v = new DataView(b), put = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      put(0, 'RIFF'); v.setUint32(4, 38, true); put(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); put(36, 'data'); v.setUint32(40, 2, true); v.setInt16(44, 32767, true);
      const d = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(b);
      return d.getChannelData(0)[0] === 1;
    } catch { return false; }
  })());
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
 *  file's own sample rate (or at `at`) — a plain AudioContext decodes at the device's rate (a 44.1 kHz file came out at 48 kHz,
 *  and was saved so). */
export async function decodeAudio(data: ArrayBuffer | Blob, at?: number): Promise<AudioBuffer> {
  const blob = data instanceof Blob ? data : new Blob([data]);
  // `at`: decode straight to that rate (Speech to Text needs 16 kHz: an hour of 48 kHz stereo is 1.4 GB as it is)
  const buf = await blob.arrayBuffer(), rate = at || await sourceRate(blob);
  if (rate >= 8000 && rate <= 384000) {
    try { return await new OfflineAudioContext(1, 1, rate).decodeAudioData(buf.slice(0)); } catch { /* a rate this browser cannot hold: below */ }
  }
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try { return await ctx.decodeAudioData(buf); } finally { ctx.close?.(); }
}
