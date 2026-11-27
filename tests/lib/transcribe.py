#!/usr/bin/env python3
"""What sound files say, by Whisper (faster-whisper, model base.en, int8 on the processor): an independent ear for the
Audiobook suite. Prints JSON {path: text}; {"_skip": reason} when faster-whisper or FFmpeg is not there.
  python3 tests/lib/transcribe.py a.mp3 b.mp3 …        (pip install faster-whisper; the model comes from Hugging Face)
The files are decoded by FFmpeg (16 kHz mono float), not by faster-whisper's own PyAV decoder (PyAV 19 refuses its call)."""
import json, os, shutil, subprocess, sys
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")   # Hugging Face's Xet transfer is not reachable everywhere; plain HTTPS is
try:
    import numpy as np
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({'_skip': 'faster-whisper is not installed (pip install faster-whisper)'})); sys.exit(0)
if not shutil.which('ffmpeg'):
    print(json.dumps({'_skip': 'ffmpeg is not installed'})); sys.exit(0)
model = WhisperModel('base.en', device='cpu', compute_type='int8')
out = {}
for p in sys.argv[1:]:
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
    segments, _ = model.transcribe(np.frombuffer(pcm, dtype=np.float32), language='en', beam_size=5, vad_filter=False)
    out[p] = ' '.join(s.text.strip() for s in segments)
print(json.dumps(out))
