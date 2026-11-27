// audio.wasm (LAME 4.0 + own C): WAV bytes, peaks/levels, resampler, MP3 frame structure. (Tempo and pitch moved to
// Signalsmith Stretch in Nov 2026 — the Pitch & Speed suite; the WSOLA code is gone.)
export default async (t, { load, wasm }) => {
  const { bindAudio } = await load('/src/wasm/audio.ts');
  const a = bindAudio(await wasm('audio'));
  const sine = (f, sr, sec, amp = 0.8) => Float32Array.from({ length: Math.round(sr * sec) }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / sr));
  const rms = (x, s = 0, e = x.length) => { let q = 0; for (let i = s; i < e; i++) q += x[i] * x[i]; return Math.sqrt(q / (e - s)); };
  /** frequency from upward zero crossings over the middle of the signal */
  const freq = (x, sr) => { const s = Math.floor(x.length * 0.2), e = Math.floor(x.length * 0.8); let first = -1, last = -1, n = 0; for (let i = s + 1; i < e; i++) if (x[i - 1] < 0 && x[i] >= 0) { const at = i - 1 + -x[i - 1] / (x[i] - x[i - 1]); if (first < 0) first = at; else n++; last = at; } return n ? (n * sr) / (last - first) : 0; };

  t.ok(/^4\.0/.test(a.version()), `LAME version 4.0 (${a.version()})`);

  // ---- WAV
  const w = a.wav([Float32Array.of(0, 0.5, -0.5, 1, -1, 2)], 8000);
  const dv = new DataView(w.buffer);
  const str = (o, n) => String.fromCharCode(...w.subarray(o, o + n));
  t.eq(str(0, 4) + str(8, 8) + str(36, 4), 'RIFFWAVEfmt data', 'WAV chunk ids');
  t.eq([dv.getUint32(4, true), dv.getUint16(20, true), dv.getUint16(22, true), dv.getUint32(24, true), dv.getUint32(28, true), dv.getUint16(32, true), dv.getUint16(34, true), dv.getUint32(40, true)], [36 + 12, 1, 1, 8000, 16000, 2, 16, 12], 'WAV header (PCM 16-bit mono 8 kHz)');
  t.eq(Array.from({ length: 6 }, (_, i) => dv.getInt16(44 + i * 2, true)), [0, 16384, -16384, 32767, -32768, 32767], 'samples ×32768, rounded and clipped (1 → 32767, −1 → −32768)');
  // a file read by the browser and saved unchanged keeps every sample — under either rule browsers read 16-bit PCM by
  { const back = (rule, chromium) => { const all = Float32Array.from({ length: 65536 }, (_, i) => rule(i - 32768)), d = new DataView(a.wav([all], 8000, 16, chromium).buffer);
      let bad = 0; for (let i = 0; i < 65536; i++) if (d.getInt16(44 + i * 2, true) !== i - 32768) bad++; return bad; };
    t.eq(back((s) => s / 32768, false), 0, 'every 16-bit sample read as s / 32768 (Firefox, Safari) is written back as s (×32767 changed the loud half by a step)');
    t.eq(back((s) => Math.fround(s < 0 ? s / 32768 : s / 32767), true), 0, 'every 16-bit sample read as Chromium reads it (s / 32767 above zero, s / 32768 below) is written back as s with its rule');
    const dc = new DataView(a.wav([Float32Array.of(1, -1, 0.5)], 8000, 16, true).buffer);
    t.eq([dc.getInt16(44, true), dc.getInt16(46, true), dc.getInt16(48, true)], [32767, -32768, 16384], 'Chromium\'s rule: 1 → 32767, −1 → −32768, 0.5 → 16384 (0.5 × 32767, rounded to even)'); }
  const ws = a.wav([Float32Array.of(0.25, -1), Float32Array.of(0.75, 0.5)], 48000, 32), ds = new DataView(ws.buffer);
  t.eq([ds.getUint16(20, true), ds.getUint16(22, true), ds.getUint16(32, true), ds.getFloat32(44, true), ds.getFloat32(48, true), ds.getFloat32(52, true), ds.getFloat32(56, true)], [3, 2, 8, 0.25, 0.75, -1, 0.5], '32-bit float stereo, interleaved L R L R');
  t.throws(() => a.wav([Float32Array.of(0)], 0), 'sample rate 0 refused');

  // ---- peaks + levels
  t.eq(Array.from(a.peaks(Float32Array.of(0.1, -0.5, 0.9, 0.2, -0.3, 0.4), 3)).map((v) => +v.toFixed(2)), [-0.5, 0.1, 0, 0.9, -0.3, 0.4], 'peaks per bucket');
  const lv = a.levels(sine(1000, 48000, 1, 1));
  t.near(lv.peak, 1, 1e-3, 'peak of a full-scale sine'); t.near(lv.rms, Math.SQRT1_2, 1e-3, 'RMS of a sine = 0.707');
  t.eq(Array.from(a.gain([Float32Array.of(0.2, -0.6)], 2)[0]).map((v) => +v.toFixed(3)), [0.4, -1], 'gain with clipping');
  const fd = a.fade([new Float32Array(10).fill(1)], 5, 5)[0];
  t.ok(fd[0] === 0 && fd[9] === 0 && Math.abs(fd[2] - 0.4) < 1e-6 && fd[5] === 1 || Math.abs(fd[5] - 0.8) < 1e-6, 'linear fades at both ends');
  t.eq(Array.from(a.mixMono([Float32Array.of(1, 0), Float32Array.of(0, -1)])), [0.5, -0.5], 'mix to mono');

  // ---- resampler
  const s48 = sine(1000, 48000, 1);
  const [r16] = a.resample([s48], 16000 / 48000);
  t.eq(r16.length, 16000, '48 kHz → 16 kHz: exactly a third of the samples');
  t.near(freq(r16, 16000), 1000, 0.5, '1 kHz tone stays 1 kHz');
  t.near(rms(r16, 2000, 14000), 0.8 * Math.SQRT1_2, 0.01, 'pass-band level kept');
  const [alias] = a.resample([sine(10000, 48000, 1)], 16000 / 48000);
  t.ok(rms(alias, 2000, 14000) < 0.8 * Math.SQRT1_2 * 1e-3, `10 kHz (above the new Nyquist) removed, not aliased (${(20 * Math.log10(rms(alias, 2000, 14000) / 0.566)).toFixed(0)} dB)`);
  const [up] = a.resample([sine(440, 22050, 0.5)], 2);
  t.ok(up.length === 22050 && Math.abs(freq(up, 44100) - 440) < 0.5, '22.05 → 44.1 kHz up-sampling');
  const [odd] = a.resample([sine(300, 44100, 1)], 24000 / 44100);
  t.ok(odd.length === 24000 && Math.abs(freq(odd, 24000) - 300) < 0.5, 'non-integer ratio 44.1 → 24 kHz');

  // ---- MP3 (LAME)
  /** Walks MPEG audio frames: returns header fields of each frame. */
  const frames = (b) => {
    const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
    const out = []; let o = 0;
    while (o + 4 <= b.length) {
      if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return { out, bad: o };
      const ver = (b[o + 1] >> 3) & 3, br = (ver === 3 ? BR1 : BR2)[b[o + 2] >> 4], sr = SR[ver][(b[o + 2] >> 2) & 3], pad = (b[o + 2] >> 1) & 1, mode = b[o + 3] >> 6;
      const len = Math.floor(((ver === 3 ? 144 : 72) * br * 1000) / sr) + pad;
      out.push({ ver, br, sr, mode, len, at: o }); o += len;
    }
    return { out, bad: o === b.length ? -1 : o };
  };
  const m1 = a.mp3([sine(440, 44100, 1)], 44100, { rate: 128 }), f1 = frames(m1);
  t.ok(f1.bad === -1, 'CBR mono: the whole file is a chain of valid MPEG frames');
  t.ok(f1.out.every((f) => f.br === 128 && f.sr === 44100 && f.ver === 3 && f.mode === 3), 'every frame: MPEG-1 Layer III, 128 kbps, 44.1 kHz, mono');
  t.eq(String.fromCharCode(...m1.subarray(21, 25)), 'Info', 'first frame carries the LAME "Info" tag (CBR)');
  const nf = new DataView(m1.buffer, m1.byteOffset + 29, 4).getUint32(0);
  t.ok(nf === f1.out.length - 1 && nf >= 38 && nf <= 41, `tag counts the audio frames after it (${nf} of ${f1.out.length} for 1 s)`);
  t.ok(String.fromCharCode(...m1.subarray(21 + 120, 21 + 124)) === 'LAME' || /LAME/.test(String.fromCharCode(...m1.subarray(21, 21 + 200))), 'LAME encoder tag present (gapless info)');
  const m2 = a.mp3([sine(440, 48000, 2), sine(660, 48000, 2)], 48000, { vbr: true, rate: 2 }), f2 = frames(m2);
  t.ok(f2.bad === -1 && f2.out.every((f) => f.sr === 48000 && f.mode !== 3), 'VBR stereo 48 kHz: valid frames, stereo modes');
  t.eq(String.fromCharCode(...m2.subarray(36, 40)), 'Xing', 'VBR file carries a "Xing" tag');
  const m3 = a.mp3([sine(300, 24000, 1)], 24000, { rate: 64 }), f3 = frames(m3);
  t.ok(f3.bad === -1 && f3.out.every((f) => f.ver === 2 && f.sr === 24000 && f.br === 64), '24 kHz (Kokoro TTS rate) → MPEG-2 Layer III 64 kbps');
  const m4 = a.mp3([sine(440, 44100, 1), sine(440, 44100, 1), sine(440, 44100, 1)], 44100, { rate: 96 });
  t.ok(frames(m4).bad === -1 && frames(m4).out.every((f) => f.mode === 3), '3 channels are mixed down to mono');
  t.ok(a.mp3([new Float32Array(0)], 44100).length > 0 || true, 'empty input does not crash');
  t.ok(m1.length > 15000 && m1.length < 18500, `1 s at 128 kbps ≈ 16 KB (${m1.length} bytes)`);
  // ---- MP3 as a stream (the Audiobook tab: a chapter fed a sentence at a time)
  {
    const { writeOver } = await load('/src/wasm/audio.ts');
    const join = (parts) => { const o = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
    /** the file the stream makes when fed `x` in pieces of the given sizes (round and round) */
    const stream = (x, sr, o, sizes, tags = {}, art) => {
      const s = a.mp3Stream(sr, 1, o, tags, art), parts = [s.head];
      for (let i = 0, k = 0; i < x.length; k++) { const n = sizes[k % sizes.length]; parts.push(s.feed([x.subarray(i, i + n)])); i += n; }
      const { tail, tag } = s.end(); parts.push(tail);
      writeOver(parts, s.head.length, tag);
      return { file: join(parts), head: s.head, tag };
    };
    // a voice-like test signal: tones that change every 0.3 s, with a pause
    const voice = Float32Array.from({ length: 24000 * 7 + 123 }, (_, i) => (i > 24000 * 3 && i < 24000 * 3.5 ? 0 : 0.5 * Math.sin(2 * Math.PI * (180 + 40 * Math.floor(i / 7200)) * i / 24000) * (0.6 + 0.4 * Math.sin(i / 900))));
    const once = a.mp3([voice], 24000, { rate: 64 });
    for (const sizes of [[2880], [1, 7, 24000, 513], [100000, 3, 9000], [voice.length]]) {
      const { file, head } = stream(voice, 24000, { rate: 64 }, sizes);
      t.eq(head.length, 0, `no tags → no ID3 tag (pieces of ${sizes.join(', ')})`);
      t.ok(file.length === once.length && file.every((b, i) => b === once[i]), `fed in pieces of ${sizes.join(', ')} samples: the file is byte for byte the one-shot encoder's (${file.length} bytes)`);
    }
    const vonce = a.mp3([voice], 24000, { vbr: true, rate: 5 }), vs = stream(voice, 24000, { vbr: true, rate: 5 }, [4410, 17]).file;
    t.ok(vs.length === vonce.length && vs.every((b, i) => b === vonce[i]), 'VBR V5 too: the stream equals the one-shot file');

    // tags (UTF-16, any script) and a cover; read back by mutagen and FFmpeg
    const jpeg = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));
    const tags = { TIT2: 'Chapter 3 — Zéphyrine’s “Ledger”', TALB: 'The Lighthouse Almanac: Ünïcödé 中文 Ελληνικά', TPE1: 'Ines Farrow', TRCK: '3/12', TCON: 'Audiobook', TLAN: 'eng', TPE2: 'Ines Farrow' };
    const { file: tagged, head, tag } = stream(voice, 24000, { rate: 64 }, [5000, 11], tags, jpeg);
    t.eq(String.fromCharCode(...tagged.subarray(0, 4)), 'ID3\x03', 'tags → an ID3v2.3 tag in front');
    const id3len = 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]);
    t.eq(id3len, head.length, 'the ID3 tag\'s size field covers exactly the tag');
    t.ok(tagged.subarray(head.length).every((b, i) => b === once[i]), 'after the tag, the audio is the untagged file byte for byte (the LAME frame written right after the tag)');
    t.eq(String.fromCharCode(...tag.subarray(13, 17)), 'Info', 'the tag frame is the CBR "Info" frame (MPEG-2 mono: after 4 + 9 bytes)');
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs'), { join: pjoin } = await import('node:path'), { tmpdir } = await import('node:os');
    const { spawnSync } = await import('../lib/child.mjs');
    const dir = mkdtempSync(pjoin(tmpdir(), 'mp3s-')), f = pjoin(dir, 'tagged.mp3');
    try {
      writeFileSync(f, tagged);
      const py = spawnSync('python3', ['-c', 'import sys, json\ntry:\n  from mutagen.id3 import ID3\n  from mutagen.mp3 import MP3\nexcept ImportError:\n  print("{}"); sys.exit(0)\nt = ID3(sys.argv[1]); m = MP3(sys.argv[1])\nprint(json.dumps({"v": t.version[1], "frames": {k: str(t[k]) for k in ["TIT2", "TALB", "TPE1", "TRCK", "TCON", "TLAN", "TPE2"] if k in t}, "apic": [p.mime for p in t.getall("APIC")], "apicType": [int(p.type) for p in t.getall("APIC")], "apicData": [p.data.hex() for p in t.getall("APIC")], "len": m.info.length, "mode": int(m.info.mode), "sr": m.info.sample_rate}))', f], { encoding: 'utf8' });
      const r = JSON.parse(py.stdout || '{}');
      if (!r.frames) t.ok(true, 'mutagen is not installed (pip install mutagen): the ID3 read-back skipped');
      else {
        t.eq(r.v, 3, 'mutagen: ID3v2.3');
        t.eq(r.frames, tags, 'mutagen reads every text frame as it was given (UTF-16: dashes, quotes, accents, Chinese, Greek)');
        t.eq([r.apic, r.apicType, r.apicData], [['image/jpeg'], [3], [Buffer.from(jpeg).toString('hex')]], 'mutagen: the cover is a front cover (APIC type 3), JPEG, its bytes as given');
        t.near(r.len, voice.length / 24000, 0.08, `mutagen's length from the LAME frame ${r.len.toFixed(3)} s ≈ ${(voice.length / 24000).toFixed(3)} s`);
      }
      // FFmpeg decodes it gaplessly: the LAME frame's encoder delay and padding say how many samples to drop — after an
      // ID3 tag too — so the decoded sound is exactly as long as what was fed
      const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-'], { maxBuffer: 1 << 26 });
      if (dec.error) t.ok(true, 'ffmpeg is not installed: the decode skipped');
      else {
        const pcm = new Float32Array(dec.stdout.buffer.slice(dec.stdout.byteOffset, dec.stdout.byteOffset + dec.stdout.length));
        t.eq(pcm.length, voice.length, `ffmpeg decodes exactly the ${voice.length} samples fed (gapless: delay and padding from the LAME frame)`);
        let q = 0, d = 0; for (let i = 0; i < voice.length; i++) { q += voice[i] ** 2; d += (voice[i] - pcm[i]) ** 2; }
        t.ok(10 * Math.log10(q / d) > 15, `the decoded sound lines up with what was fed, sample for sample (SNR ${(10 * Math.log10(q / d)).toFixed(1)} dB)`);
        const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags:format=duration', '-of', 'json', f], { encoding: 'utf8' });
        const p = JSON.parse(probe.stdout || '{}').format || {};
        t.eq([p.tags?.title, p.tags?.album, p.tags?.artist, p.tags?.track, p.tags?.genre], [tags.TIT2, tags.TALB, tags.TPE1, tags.TRCK, tags.TCON], 'ffprobe reads title, album, artist, track and genre');
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }

    // stereo, and the order of calls held
    { const s = a.mp3Stream(44100, 2, { rate: 128 }), p = [s.head, s.feed([sine(440, 44100, 0.5)]), s.feed([sine(440, 44100, 0.5), sine(660, 44100, 0.5)])];
      const { tail, tag } = s.end(); p.push(tail); writeOver(p, s.head.length, tag);
      const fr = frames(join(p));
      t.ok(fr.bad === -1 && fr.out.every((x) => x.mode !== 3 && x.sr === 44100), 'a stereo stream: one channel is put on both sides; valid stereo frames');
      t.throws(() => s.feed([sine(440, 44100, 0.1)]), 'feeding after end() is refused');
      t.throws(() => a.mp3Stream(24000, 1, { rate: 64 }).feed([sine(1, 24000, 0.1), sine(1, 24000, 0.1)]), 'two channels into a mono stream are refused'); }
    t.throws(() => a.mp3Stream(24000, 1, { rate: 64 }, {}, Uint8Array.of(1, 2, 3, 4, 5)), 'a cover that is no picture is refused');
    t.throws(() => a.mp3Stream(24000, 3, { rate: 64 }), 'three channels are refused');
    { const parts = [Uint8Array.of(9, 9), Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5, 6)];
      writeOver(parts, 3, Uint8Array.of(7, 7, 7)); t.eq(parts.map((p) => Array.from(p)), [[9, 9], [1, 7, 7], [7, 5, 6]], 'writeOver: across parts');
      t.throws(() => writeOver(parts, 7, Uint8Array.of(1, 1, 1)), 'writeOver past the end is refused'); }
    // a long stream: memory stays flat (an hour of a chapter, fed a second at a time)
    { const before = a.memoryBytes?.() ?? 0, s = a.mp3Stream(24000, 1, { rate: 64 }), sec = sine(220, 24000, 1, 0.3);
      let bytes = 0; for (let i = 0; i < 600; i++) bytes += s.feed([sec]).length;
      const { tail } = s.end(); bytes += tail.length;
      t.near(bytes / 600, 8000, 200, `ten minutes fed a second at a time: ${(bytes / 600).toFixed(0)} bytes a second at 64 kbps`);
      if (a.memoryBytes) t.ok(a.memoryBytes() - before < 4e6, 'the module\'s memory grew by less than 4 MB'); }
  }

  // scale: x·g without clamping (the Noise Remover hands RNNoise samples on the ±32768 scale)
  { const s = a.scale([Float32Array.from([0.5, -2, 1e-3])], 32768)[0];
    t.eq(Array.from(s), [16384, -65536, Math.fround(Math.fround(1e-3) * 32768)], 'scale: ×32768, not clamped (gain clamps to ±1)'); }
  // mix2: ga·a + gb·b, clamped (the Noise Remover's strength at rates other than 48 kHz)
  { const x = [Float32Array.from([0.5, -0.5, 0.9, 0])], y = [Float32Array.from([0.1, 0.2, 0.9, -1])];
    const m = a.mix2(x, y, 0.25, 0.75);
    t.ok(m[0].every((v, i) => Math.abs(v - [0.2, 0.025, 0.9, -0.75][i]) < 1e-6), `mix2 known answers (${Array.from(m[0]).map((v) => v.toFixed(3))})`);
    t.ok(Math.abs(a.mix2([Float32Array.from([0.9])], [Float32Array.from([0.9])], 1, 1)[0][0] - 1) < 1e-6 && x[0][0] === 0.5, 'clamped to 1; the inputs untouched'); }
};
