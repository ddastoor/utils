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


SPACY_SM = ('spacy/en_core_web_sm', '8fb6f8155286360bf5486fe399e2738d1df7ded2')  # spaCy's small English pipeline 3.7.1


@engine('kokoro')
def kokoro(job, voices):
    """Kokoro-82M v1.0 (hexgrad, Apache-2.0) through its own pipeline: misaki reads the text (a pronouncing dictionary,
    spaCy for the part of speech, eSpeak NG for the words the dictionary lacks — every word is spoken)."""
    import numpy as np
    import spacy
    import torch
    # misaki asks spaCy for "en_core_web_sm" and would install it with pip from GitHub: the pipeline is taken from
    # Hugging Face instead (the same files, at a fixed revision) and handed to spacy.load by its folder.
    sm = fetch(SPACY_SM[0], SPACY_SM[1], ['config.cfg', 'meta.json', 'tokenizer', '*/*', '*/*/*'])
    load, is_package = spacy.load, spacy.util.is_package
    spacy.load = lambda name, *a, **k: load(sm if name == 'en_core_web_sm' else name, *a, **k)
    spacy.util.is_package = lambda name: name == 'en_core_web_sm' or is_package(name)
    from kokoro import KModel, KPipeline
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['config.json', 'kokoro-v1_0.pth'] + sorted({f'voices/{v["voice"]}.pt' for v in voices}))
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log(f'  (on the {"graphics card" if device == "cuda" else "processor"})')
    model = KModel(repo_id=v0['repo'], config=os.path.join(d, 'config.json'), model=os.path.join(d, 'kokoro-v1_0.pth')).to(device).eval()
    pipes = {}
    for v in voices:
        lang = v.get('lang') or v['voice'][0]
        if lang not in pipes:
            pipes[lang] = KPipeline(lang_code=lang, repo_id=v0['repo'], model=model, device=device)
        t0 = time.time()
        parts = []
        for _, _, audio in pipes[lang](job['text'], voice=os.path.join(d, 'voices', v['voice'] + '.pt'), speed=float(job['speed'])):
            if audio is not None:
                parts.append(audio.detach().cpu().numpy())
                parts.append(silence(24000, 0.15))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(24000, 0.1), 24000, job.get('mp3', True))
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
