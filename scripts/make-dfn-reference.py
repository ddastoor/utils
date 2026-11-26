#!/usr/bin/env python3
"""Fixtures of the Noise Remover's Studio voice (to-do #20).

1. tests/fixtures/speech/traffic-speech.wav — speech/librispeech-1 (LibriSpeech, CC BY 4.0) with real street traffic mixed
   in at 5 dB SNR: DEMAND's STRAFFIC recording (Thiemann, Ito, Vincent 2013; channel 1, 16 kHz; three 4 s segments of the
   SPARCO-project/benchmark_DEMAND_noise dataset on Hugging Face at a pinned revision, SHA-256 checked), 16-bit mono.
2. tests/fixtures/dfn/reference.json — DeepFilterNet 3 as its own Python package runs it, the reference of
   tests/unit/dfn.test.mjs: libDF (DeepFilterNet's Rust DSP, `pip install deepfilterlib==0.5.6`, which builds with Rust
   where there is no wheel) for the STFT and the features, ONNX Runtime (`pip install onnxruntime`) for the network
   (public/models/deepfilternet3/deepfilter.onnx — `node scripts/fetch-assets.mjs` first), the deep filter and the mask
   as DeepFilterNet's DfNet.forward applies them. The input: the mixture's first 2 s at 48 kHz by repeating every sample
   three times (exact in both languages; what it sounds like does not matter here).
Run: python3 scripts/make-dfn-reference.py   (needs numpy, soundfile, deepfilterlib 0.5.6, onnxruntime)
"""
import hashlib, json, os, sys, urllib.request
import numpy as np, soundfile as sf

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REV = '9494656cfa837f881a718db97111c35d331a6e5b'
NOISE = [('STRAFFIC_ch01_000010', 'd7ec29ac8117bfec5ed47bc477c7c1ab88f2151de94a985f7d1126b85370d2ee'),
         ('STRAFFIC_ch01_000030', 'd7c0292eadcd4f8cdb87a62be4e85474de5df85aa48a88cbaf7ee0e7b044241f'),
         ('STRAFFIC_ch01_000050', 'c1eb9ae61464824fe22772a31d7d19b009834e40f6d31a8fe473632dfaf9d04e')]
SNR = 5.0

def fetch(name, sha):
    cache = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'demand-src'); os.makedirs(cache, exist_ok=True)
    p = os.path.join(cache, name + '.wav')
    if not os.path.exists(p):
        url = f'https://huggingface.co/datasets/SPARCO-project/benchmark_DEMAND_noise/resolve/{REV}/data/benchmark_test/STRAFFIC/{name}.wav'
        urllib.request.urlretrieve(url, p)
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    if h != sha: sys.exit(f'{name}: SHA-256 {h} is not the pinned {sha}')
    return p

def mixture():
    clean, sr = sf.read(os.path.join(ROOT, 'tests/fixtures/speech/librispeech-1.flac'), dtype='float64')
    assert sr == 16000
    noise = np.concatenate([sf.read(fetch(n, s), dtype='float64')[0] for n, s in NOISE])[:len(clean)]
    g = np.sqrt((clean ** 2).mean() / (noise ** 2).mean() / 10 ** (SNR / 10))
    mix = clean + g * noise
    out = os.path.join(ROOT, 'tests/fixtures/speech/traffic-speech.wav')
    sf.write(out, mix, 16000, subtype='PCM_16')
    return sf.read(out, dtype='float32')[0]

def reference(x16):
    import onnxruntime as ort
    from libdf import DF, erb, erb_norm, unit_norm
    x = np.repeat(x16[:32000], 3).astype(np.float32)                 # 2 s at 48 kHz
    n = len(x); xp = np.concatenate([x, np.zeros(960, np.float32)])  # enhance(pad=True)
    df = DF(sr=48000, fft_size=960, hop_size=480, nb_bands=32, min_nb_erb_freqs=2)
    spec = df.analysis(xp[None])                                     # [1, T, 481]
    fe = erb_norm(erb(spec, df.erb_widths()), 0.99)[0]               # [T, 32]
    fs = unit_norm(spec[..., :96].copy(), 0.99)[0]                    # [T, 96]
    spec = spec[0]; T = spec.shape[0]
    sess = ort.InferenceSession(os.path.join(ROOT, 'public/models/deepfilternet3/deepfilter.onnx'), providers=['CPUExecutionProvider'])
    m, c = sess.run(None, {'feat_erb': fe[None, None].astype(np.float32), 'feat_spec': np.stack([fs.real, fs.imag])[None].astype(np.float32)})
    mask = m[0, 0]; coefs = c[0, ..., 0] + 1j * c[0, ..., 1]          # [T, 32], [5, T, 96]
    widths = list(map(int, df.erb_widths())); band = np.repeat(np.arange(32), widths)
    y = spec * mask[:, band]
    pad = np.concatenate([np.zeros((2, 96), complex), spec[:, :96], np.zeros((2, 96), complex)])
    y[:, :96] = sum(pad[k:k + T] * coefs[k] for k in range(5))
    out = df.synthesis(y[None].astype(np.complex64))[0][480:n + 480]
    frames = [0, 1, 2, 5, 50, 100, 150, T - 1]
    r6 = lambda a: [float(f'{v:.7g}') for v in np.asarray(a).ravel()]
    return {
        'about': 'DeepFilterNet 3 as libDF 0.5.6 + ONNX Runtime run it, on the first 2 s of speech/traffic-speech.wav with every sample repeated three times (48 kHz) — scripts/make-dfn-reference.py',
        'n': n, 'T': T, 'erbWidths': widths, 'frames': frames,
        'spec': {str(f): r6(np.stack([spec[f].real, spec[f].imag], 1)) for f in (0, 100, T - 1)},
        'ferb': {str(f): r6(fe[f]) for f in frames},
        'fspec': {str(f): r6(np.stack([fs[f].real, fs[f].imag], 1)) for f in frames},
        'mask': {str(f): r6(mask[f]) for f in (10, 100, 190)},
        'coefs': {str(f): r6(c[0][:, f]) for f in (10, 100)},          # [5][96][2]
        'every8': r6(out[::8]),
    }

if __name__ == '__main__':
    x = mixture()
    ref = reference(x)
    p = os.path.join(ROOT, 'tests/fixtures/dfn/reference.json'); os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(ref, open(p, 'w'), separators=(',', ':'))
    print('wrote', p, os.path.getsize(p), 'bytes;', 'tests/fixtures/speech/traffic-speech.wav', len(x), 'samples')
