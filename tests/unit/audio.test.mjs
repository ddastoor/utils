// audio.wasm (LAME 4.0 + own C): WAV bytes, peaks/levels, resampler, WSOLA tempo/pitch, MP3 frame structure.
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
  t.eq(Array.from({ length: 6 }, (_, i) => dv.getInt16(44 + i * 2, true)), [0, 16384, -16384, 32767, -32767, 32767], 'samples rounded and clipped');
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

  // ---- WSOLA tempo + pitch
  const tone = sine(440, 44100, 2);
  const [fast] = a.stretch([tone], 44100, 2);
  t.eq(fast.length, 44100, 'tempo 2×: half the length');
  t.near(freq(fast, 44100), 440, 1, 'tempo 2×: pitch unchanged (440 Hz)');
  t.near(rms(fast, 4410, 39690), 0.8 * Math.SQRT1_2, 0.03, 'tempo 2×: level steady (no gaps or doubling)');
  const [slow] = a.stretch([tone], 44100, 0.5);
  t.ok(slow.length === 176400 && Math.abs(freq(slow, 44100) - 440) < 1, 'tempo 0.5×: double length, 440 Hz');
  t.near(rms(slow, 17640, 158760), 0.8 * Math.SQRT1_2, 0.03, 'tempo 0.5×: level steady');
  const [hi] = a.tempoPitch([tone], 44100, 1, 12);
  t.ok(Math.abs(hi.length - tone.length) <= 2 && Math.abs(freq(hi, 44100) - 880) < 2, `+12 semitones: 880 Hz, same length (${freq(hi, 44100).toFixed(1)} Hz)`);
  const [lo] = a.tempoPitch([tone], 44100, 1.25, -5);
  t.ok(Math.abs(lo.length - tone.length / 1.25) <= 2 && Math.abs(freq(lo, 44100) - 440 * 2 ** (-5 / 12)) < 2, `−5 semitones at 1.25×: ${freq(lo, 44100).toFixed(1)} Hz, ${lo.length} samples`);
  const st = a.stretch([tone, tone.map((v) => -v)], 44100, 1.5);
  t.ok(st.length === 2 && st[0].every((v, i) => Math.abs(v + st[1][i]) < 1e-6), 'stereo: both channels cut at the same places');
  t.throws(() => a.stretch([tone], 44100, 10), 'tempo outside 0.25–4 refused');

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
};
