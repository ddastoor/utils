// Tempo and pitch, independently: Signalsmith Stretch 1.3.2 (C++, MIT — the authors' official WebAssembly / AudioWorklet
// release, `signalsmith-stretch`) rendered offline. Our glue: an OfflineAudioContext of the file's rate, the node fed
// the whole recording and started a little ahead (its latency: from output 0 it would fade in over ~50 ms), the lead
// cut off, the length = input ÷ tempo. The worklet loads the package's own file (same origin: the CSP allows no blob:
// script); that file is also what the page imports, so it is fetched once.
import stretchUrl from 'signalsmith-stretch?url';

type StretchNode = AudioWorkletNode & {
  addBuffers(chs: Float32Array[]): Promise<number>;
  schedule(o: { active?: boolean; input?: number; output?: number; rate?: number; semitones?: number }): Promise<void>;
};
type Factory = ((ctx: BaseAudioContext, o?: AudioWorkletNodeOptions) => Promise<StretchNode>) & { moduleUrl?: string };
let factory: Promise<Factory> | null = null;
/** The output starts this far ahead and is cut off: more than the node's latency (0.12 s with its default 120 ms blocks;
 *  the suite checks that the first 10 ms are at full level). */
export const LEAD = 0.25;
const load = () => (factory ||= import(/* @vite-ignore */ stretchUrl).then((m) => { const f = m.default as Factory; f.moduleUrl = stretchUrl; return f; })
  .catch((e) => { factory = null; throw e; }));

/** Planar channels at `sr` → the same sound `tempo` times as fast (0.25 – 4; the pitch kept) and `semitones` higher
 *  (−24 … 24; the length kept). Rendered off the main thread by the browser's audio engine. */
export async function stretchAudio(chs: Float32Array[], sr: number, tempo: number, semitones: number): Promise<Float32Array[]> {
  if (!(tempo >= 0.25 && tempo <= 4) || !(Math.abs(semitones) <= 24)) throw new Error('Speed must be 0.25 – 4× and pitch −24 … +24 semitones.');
  const n = chs[0]?.length || 0, out = Math.max(1, Math.round(n / tempo));
  if (!n) return chs.map(() => new Float32Array(0));
  const Stretch = await load(), lead = Math.round(LEAD * sr);
  const ctx = new OfflineAudioContext(chs.length, out + lead, sr);
  const node = await Stretch(ctx, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [chs.length] });
  await node.addBuffers(chs.map((c) => c.slice()));
  await node.schedule({ active: true, input: 0, output: lead / sr, rate: tempo, semitones });
  node.connect(ctx.destination);
  const b = await ctx.startRendering();
  return Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i).slice(lead));
}
