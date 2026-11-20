// AAC where the browser has no AAC encoder of its own (Chromium on Linux, Firefox): mediabunny's official extension,
// libavcodec's AAC-LC encoder compiled to WebAssembly (@mediabunny/aac-encoder — MPL-2.0, FFmpeg's code LGPL-2.1),
// fetched only when a sound is to be encoded there (1.1 MB). Once registered, mediabunny picks AAC for every MP4 whose
// sound is re-encoded — without it that was Opus inside MP4, which many players and phones do not play.
// docs/WASM-AUDIT.md, tab 147.
let ready: Promise<void> | null = null;
export function ensureAac(): Promise<void> {
  return (ready ||= (async () => {
    const mb = await import('mediabunny');
    if (await mb.canEncodeAudio('aac')) return;
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
  })().catch((e) => { ready = null; throw e; }));
}
/** Sound kept as it is in an MP4 meant to play everywhere. mediabunny would also put Opus, Vorbis, FLAC, AC-3, DTS … into
 *  an MP4, but few players play those there: they are re-encoded to AAC. */
export const MP4_COPY_AUDIO = ['aac', 'mp3'];

/** A MediaRecorder file finished: the duration and seek index it lacks (packet copy), and in an MP4 the sound as AAC —
 *  where the browser's recorder has no AAC encoder (Linux Chromium) it wrote Opus inside the MP4, which many players do
 *  not play; that sound is re-encoded and the picture copied. Whatever cannot be done leaves the recording as it was;
 *  the sound is never dropped. Shared by Screencast and YouTube Clip. */
export async function finishRecording(blob: Blob, ext: 'mp4' | 'webm'): Promise<Blob> {
  try {
    const mb = await import('mediabunny');
    const remux = async (toAac: boolean) => {
      const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
      const output = new mb.Output({ format: ext === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
      const conv = await mb.Conversion.init({ input, output, ...(toAac ? { audio: { codec: 'aac', bitrate: 160000 } } : { copy: { mode: 'forced' } }) } as any);
      if (!conv.isValid || conv.discardedTracks.length) return null;
      await conv.execute();
      return new Blob([output.target.buffer!], { type: blob.type });
    };
    const sound = ext === 'mp4' ? await new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS }).getPrimaryAudioTrack() : null;
    let made: Blob | null = null;
    if (sound && sound.codec !== 'aac') { await ensureAac().catch(() => {}); made = await remux(true).catch(() => null); }
    return made || (await remux(false)) || blob;
  } catch { return blob; } // the raw recording
}
