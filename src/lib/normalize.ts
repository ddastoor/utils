// "Bring the sound to a normal loudness" (Screencast; to-do #21 — owner, 26 Nov 2026: "Yes"): a recording's sound brought to
// −16 LUFS (EBU R128; the level of podcasts and of the FFmpeg tab's "Normalise loudness"), true peak at most −1.5 dBTP.
// Engine: FFmpeg's loudnorm on the FFmpeg tab's ffmpeg.wasm (STANDING RULE #1: the existing module that does it — EBU R128
// measurement, linear gain, its own true-peak limiter), fetched on the first press (31 MB, the HTTP cache keeps it) and
// let go when the tab is left. Two passes on the sound alone: the first measures; the second applies one gain to the whole
// sound ("linear") — where that would push a peak above −1.5 dBTP, the range is wider than 20 LU, or the sound has no range
// at all (a steady tone: loudnorm wants a measured range above 0), loudnorm itself adjusts the gain along the sound
// ("dynamic", with its true-peak limiter). The picture is never re-encoded: the new sound file (small) is joined with the
// recording's own video packets by mediabunny.
import { onLeave } from '../lifecycle';
import { parseProbe, aacArgs, opusArgs } from './ffjobs';

/** What loudnorm measured: integrated loudness (LUFS), true peak (dBTP), loudness range (LU), threshold, the offset. */
export interface Loudness { i: number; tp: number; lra: number; thresh: number; offset: number }
export type Normalized = { before: Loudness; after: Loudness; linear: boolean; blob: Blob } | { before: Loudness | null; unchanged: string };

export const TARGET = -16, TRUE_PEAK = -1.5, RANGE = 20;
const num = (v: string | undefined) => (v === undefined ? NaN : /^-?inf$/i.test(v.trim()) ? (v.trim().startsWith('-') ? -Infinity : Infinity) : parseFloat(v));
/** The JSON loudnorm prints at the end of a run (its lines in FFmpeg's log). */
export function loudnormReport(lines: string[]): Record<string, string> {
  const k = lines.map((l) => /Parsed_loudnorm/.test(l)).lastIndexOf(true);
  const o: Record<string, string> = {};
  if (k < 0) return o;
  for (const m of lines.slice(k).join('\n').matchAll(/"(\w+)"\s*:\s*"([^"]*)"/g)) o[m[1]] = m[2];
  return o;
}
export const asLoudness = (r: Record<string, string>, pre: 'input' | 'output'): Loudness =>
  ({ i: num(r[`${pre}_i`]), tp: num(r[`${pre}_tp`]), lra: num(r[`${pre}_lra`]), thresh: num(r[`${pre}_thresh`]), offset: num(r.target_offset) });
/** The loudnorm filter of each pass. */
export const pass1 = () => `loudnorm=I=${TARGET}:TP=${TRUE_PEAK}:LRA=${RANGE}:print_format=json`;
export const pass2 = (m: Loudness) => `loudnorm=I=${TARGET}:TP=${TRUE_PEAK}:LRA=${RANGE}:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true:print_format=json`;
/** Nothing to do: no sound, silence, or already within half a LU of the target — else null. */
export function needless(m: Loudness): string | null {
  if (!Number.isFinite(m.i) || m.i <= -70) return 'The recording is silent: there is no sound to bring up.';
  if (Math.abs(m.i - TARGET) <= 0.5) return `The sound is already at a normal loudness (${m.i.toFixed(1)} LUFS): nothing was changed.`;
  return null;
}

let engine: Promise<any> | null = null;
let logLines: string[] = [];
let onProg: ((p: number) => void) | null = null;
function ffmpeg(): Promise<any> {
  return (engine ||= (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const f = new FFmpeg(), at = (p: string) => new URL(p, document.baseURI).href;
    f.on('log', ({ message }: any) => { logLines.push(message); if (logLines.length > 2000) logLines.splice(0, 500); });
    f.on('progress', ({ progress: p }: any) => onProg?.(Math.max(0, Math.min(1, p))));
    await f.load({ coreURL: at('vendor/ffmpeg/ffmpeg-core.js'), wasmURL: at('vendor/ffmpeg/ffmpeg-core.wasm') });
    onLeave('screencast-loudness', () => { try { f.terminate(); } catch { /* gone */ } engine = null; });
    return f;
  })().catch((e) => { engine = null; throw e; }));
}

/** The recording `rec` (MP4 or WebM, as the Screencast made it) with its sound at a normal loudness. `say` hears what is
 *  happening ("Measuring…", a share done). */
export async function normalizeRecording(rec: Blob, ext: 'mp4' | 'webm', say: (what: string, share?: number) => void): Promise<Normalized> {
  say('Loading FFmpeg (≈ 31 MB, once a visit)…');
  const f = await ffmpeg();
  try { await f.unmount('/rec'); } catch { /* not mounted */ }
  try { await f.createDir('/rec'); } catch { /* exists */ }
  const name = `recording.${ext}`;
  await f.mount('WORKERFS', { files: [new File([rec], name, { type: rec.type })] }, '/rec');
  try {
    // pass 1: what the sound measures
    logLines = []; onProg = (p) => say('Measuring the loudness…', p); say('Measuring the loudness…', 0);
    await f.exec(['-hide_banner', '-nostats', '-i', `/rec/${name}`, '-vn', '-af', pass1(), '-f', 'null', '-']);
    const probe = parseProbe(logLines.join('\n'));
    if (!probe.audio) return { before: null, unchanged: 'This recording has no sound.' };
    const before = asLoudness(loudnormReport(logLines), 'input');
    const why = needless(before);
    if (why) return { before, unchanged: why };
    // pass 2: one gain for the whole sound (or loudnorm's limiter where that cannot be), re-encoded as the recording's own
    // kind of sound — AAC in an MP4, Opus in a WebM (this build's stereo Opus at complexity 4: src/lib/ffjobs.ts)
    const out = ext === 'mp4' ? 'sound.m4a' : 'sound.webm';
    const enc = ext === 'mp4' ? aacArgs(160, probe.channels || 2, probe.layout) : opusArgs(128, probe.channels || 2, probe.layout);
    logLines = []; onProg = (p) => say('Bringing the sound up…', p); say('Bringing the sound up…', 0);
    const code = await f.exec(['-hide_banner', '-nostats', '-y', '-i', `/rec/${name}`, '-vn', '-af', pass2(before), '-ar', '48000', ...enc, out]);
    const report = loudnormReport(logLines);
    if (code) throw new Error(`FFmpeg failed (exit ${code}): ${logLines.filter((l) => /error|invalid|failed/i.test(l)).slice(0, 2).join(' · ') || 'see its log'}`);
    const sound = await f.readFile(out) as Uint8Array;
    try { await f.deleteFile(out); } catch { /* */ }
    say('Joining the sound to the picture…');
    const blob = await joinSound(rec, sound, ext);
    return { before, after: asLoudness(report, 'output'), linear: report.normalization_type !== 'dynamic', blob };
  } finally {
    onProg = null;
    try { await f.unmount('/rec'); } catch { /* */ }
  }
}

/** The recording's video packets and the new sound's packets, copied into one file in time order (nothing re-encoded). */
export async function joinSound(video: Blob, sound: Uint8Array, ext: 'mp4' | 'webm'): Promise<Blob> {
  const mb = await import('mediabunny');
  const vin = new mb.Input({ source: new mb.BlobSource(video), formats: mb.ALL_FORMATS });
  const ain = new mb.Input({ source: new mb.BufferSource(sound), formats: mb.ALL_FORMATS });
  const vt = await vin.getPrimaryVideoTrack(), at = await ain.getPrimaryAudioTrack();
  if (!vt || !at || !vt.codec || !at.codec) throw new Error('the recording or its new sound could not be read again');
  const output = new mb.Output({ format: ext === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  const vs = new mb.EncodedVideoPacketSource(vt.codec), as = new mb.EncodedAudioPacketSource(at.codec);
  output.addVideoTrack(vs, { rotation: vt.rotation });
  output.addAudioTrack(as);
  await output.start();
  const vcfg = await vt.getDecoderConfig(), acfg = await at.getDecoderConfig();
  const vit = new mb.EncodedPacketSink(vt).packets(), ait = new mb.EncodedPacketSink(at).packets();
  let v = await vit.next(), a = await ait.next(), vFirst = true, aFirst = true;
  // in time order across the two tracks (each in its own decode order), so the muxer never waits for the other
  while (!v.done || !a.done) {
    if (!v.done && (a.done || v.value.timestamp <= a.value.timestamp)) {
      await vs.add(v.value, vFirst && vcfg ? { decoderConfig: vcfg } : undefined); vFirst = false; v = await vit.next();
    } else if (!a.done) {
      await as.add(a.value, aFirst && acfg ? { decoderConfig: acfg } : undefined); aFirst = false; a = await ait.next();
    }
  }
  vs.close(); as.close();
  await output.finalize();
  return new Blob([output.target.buffer!], { type: video.type || (ext === 'mp4' ? 'video/mp4' : 'video/webm') });
}
