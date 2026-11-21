#!/usr/bin/env python3
# SuperTools — offline speech (written by the Text-to-Speech tab of https://ddastoor.github.io/utils/).
# Runs on your own computer: reads job.json, makes one WAV and one MP3 per chosen voice in the output folder.
# Every model comes from where its makers publish it (Hugging Face), pinned to one revision, into ./models.
# Usage (the .cmd / .sh script does this for you):  uv run --with <engine's packages> python driver.py job.json <engine> <out>
import json
import os
import re
import sys
import time
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, 'models')


def log(*a):
    print(*a, flush=True)


def write_audio(base, samples, sr, mp3=True):
    """float samples (-1 … 1) → base.wav (16-bit mono) and base.mp3 (128 kbps, LAME via lameenc)."""
    import numpy as np
    x = np.clip(np.asarray(samples, dtype=np.float32).reshape(-1), -1.0, 1.0)
    pcm = (x * 32767.0).round().astype('<i2').tobytes()
    with wave.open(base + '.wav', 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm)
    if mp3:
        import lameenc
        e = lameenc.Encoder()
        e.set_bit_rate(128)
        e.set_in_sample_rate(int(sr))
        e.set_channels(1)
        e.set_quality(2)
        with open(base + '.mp3', 'wb') as f:
            f.write(e.encode(pcm) + e.flush())
    return len(x) / float(sr)


def chunks(text, limit):
    """The text in pieces of at most `limit` characters, cut after sentences (then after commas, then at spaces)."""
    out, cur = [], ''
    for para in re.split(r'\n\s*\n', text.strip()):
        for s in re.split(r'(?<=[.!?…])\s+', ' '.join(para.split())):
            while len(s) > limit:
                cut = max(s.rfind(', ', 0, limit), s.rfind(' ', 0, limit))
                cut = cut + 1 if cut > limit // 3 else limit
                piece, s = s[:cut].strip(), s[cut:].strip()
                if cur:
                    out.append(cur)
                    cur = ''
                out.append(piece)
            if cur and len(cur) + 1 + len(s) > limit:
                out.append(cur)
                cur = s
            else:
                cur = (cur + ' ' + s).strip()
        if cur:
            out.append(cur)
            cur = ''
    return [c for c in out if c.strip()]


def silence(sr, seconds):
    import numpy as np
    return np.zeros(int(sr * seconds), dtype=np.float32)


def fetch(repo, revision, files=None):
    """The model's files from Hugging Face at a fixed revision, into ./models/<repo> (kept for the next run)."""
    from huggingface_hub import snapshot_download
    return snapshot_download(repo, revision=revision, allow_patterns=files, local_dir=os.path.join(MODELS, repo.replace('/', '--')))


ENGINES = {}


def engine(name):
    def put(f):
        ENGINES[name] = f
        return f
    return put


@engine('piper')
def piper(job, voices):
    """Piper (rhasspy/piper-voices): one ONNX model per voice; multi-speaker models take a speaker number."""
    import numpy as np
    from piper import PiperVoice, SynthesisConfig
    loaded = {}
    for i, v in enumerate(voices):
        d = fetch(v['repo'], v['rev'], [v['file'], v['file'] + '.json'])
        model = loaded.get(v['file']) or PiperVoice.load(os.path.join(d, v['file']))
        loaded[v['file']] = model
        cfg = SynthesisConfig(speaker_id=v.get('speaker'), length_scale=1.0 / float(job['speed']))
        t0 = time.time()
        parts = []
        for c in model.synthesize(job['text'], syn_config=cfg):
            parts.append(c.audio_float_array)
            parts.append(silence(c.sample_rate, 0.2))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(22050, 0.1), model.config.sample_rate, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


@engine('kokoro')
def kokoro(job, voices):
    """Kokoro-82M v1.0 (53 voices: American, British, Hindi …) through sherpa-onnx, CPU."""
    import numpy as np
    import sherpa_onnx
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'])
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=os.path.join(d, 'model.onnx'), voices=os.path.join(d, 'voices.bin'), tokens=os.path.join(d, 'tokens.txt'),
                data_dir=os.path.join(d, 'espeak-ng-data'), dict_dir=os.path.join(d, 'dict'),
                lexicon=os.path.join(d, 'lexicon-us-en.txt') + ',' + os.path.join(d, 'lexicon-zh.txt')),
            num_threads=max(1, min(8, os.cpu_count() or 2)), provider='cpu'),
        max_num_sentences=1)
    tts = sherpa_onnx.OfflineTts(cfg)
    for v in voices:
        t0 = time.time()
        parts = []
        for c in chunks(job['text'], 400):
            a = tts.generate(c, sid=int(v['speaker']), speed=float(job['speed']))
            parts.append(np.asarray(a.samples, dtype=np.float32))
            parts.append(silence(a.sample_rate, 0.25))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts), tts.sample_rate, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


def main():
    job = json.load(open(sys.argv[1], encoding='utf-8'))
    name = sys.argv[2]
    if len(sys.argv) > 3:
        job['out'] = sys.argv[3]
    voices = [v for v in job['voices'] if v['engine'] == name]
    if not voices:
        return
    os.makedirs(job['out'], exist_ok=True)
    log(f'{name}: {len(voices)} voice{"s" if len(voices) > 1 else ""}')
    ENGINES[name](job, voices)


if __name__ == '__main__':
    main()
