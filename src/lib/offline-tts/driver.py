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
    """The model's files from Hugging Face at a fixed revision, into ./models/<repo> (kept for the next run).
    Files named exactly are fetched one by one: listing a large repository (Piper's voices, Kyutai's clips — thousands
    of files, many pages) to find two files made Hugging Face answer "429 Too Many Requests"."""
    from huggingface_hub import hf_hub_download, snapshot_download
    local = os.path.join(MODELS, repo.replace('/', '--'))
    try:
        if files and not any(c in f for f in files for c in '*?['):
            for f in files:
                hf_hub_download(repo, f, revision=revision, local_dir=local)
            return local
        return snapshot_download(repo, revision=revision, allow_patterns=files, local_dir=local)
    except Exception as e:
        if 'Gated' in type(e).__name__ or re.search(r'\b(401|403)\b', str(e)):
            token = os.path.join(os.environ.get('HF_HOME', ''), 'token')
            sys.exit(f'Hugging Face did not let this computer download {repo}: it needs a free account that has accepted '
                     f'the conditions at https://huggingface.co/{repo}, and a token of that account. To be asked for '
                     f'the token again, delete {token} and run the script again.')
        raise


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
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log(f'  (on the {"graphics card" if device == "cuda" else "processor"})')
    # one model at a time: Kokoro-82M itself, or a model trained from it (goonj-1-82M) — same architecture, its own
    # weights file and voice packs
    groups = {}
    for v in voices:
        groups.setdefault((v['repo'], v['rev'], v.get('file') or 'kokoro-v1_0.pth'), []).append(v)
    for (repo, rev, weights), group in groups.items():
        d = fetch(repo, rev, ['config.json', weights] + sorted({f'voices/{v["voice"]}.pt' for v in group}))
        model = KModel(repo_id='hexgrad/Kokoro-82M', config=os.path.join(d, 'config.json'), model=os.path.join(d, weights)).to(device).eval()
        pipes = {}
        for v in group:
            lang = v.get('lang') or ('a' if v['voice'][0] not in 'abh' else v['voice'][0])
            if lang not in pipes:
                pipes[lang] = KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M', model=model, device=device)
            t0 = time.time()
            parts = []
            for _, _, audio in pipes[lang](job['text'], voice=os.path.join(d, 'voices', v['voice'] + '.pt'), speed=float(job['speed'])):
                if audio is not None:
                    parts.append(audio.detach().cpu().numpy())
                    parts.append(silence(24000, 0.15))
            secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(24000, 0.1), 24000, job.get('mp3', True))
            log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')
        del model


def pace(speed):
    """Parler and Indic Parler take the pace in words."""
    s = float(speed)
    return 'very slowly' if s < 0.7 else 'slowly' if s < 0.9 else 'at a moderate pace' if s <= 1.1 else 'slightly fast' if s <= 1.4 else 'fast'


@engine('parler')
def parler(job, voices):
    """Parler-TTS (Hugging Face, Apache-2.0) and AI4Bharat's Indic Parler-TTS: a named speaker described in words
    ("Thoma speaks … with very clear audio"). A text is spoken a few sentences at a time (the models are trained on
    short utterances), each piece with the same description and seed, so the voice stays the same."""
    import numpy as np
    import torch
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    dtype = torch.bfloat16 if device != 'cpu' else torch.float32
    log(f'  (on the {"graphics card" if device != "cpu" else "processor"} — on a processor this takes a while)')
    by_model = {}
    for v in voices:
        by_model.setdefault((v['repo'], v['rev']), []).append(v)
    for (repo, rev), group in by_model.items():
        d = fetch(repo, rev, ['config.json', 'generation_config.json', 'preprocessor_config.json', '*.safetensors',
                              '*.safetensors.index.json', 'tokenizer*', 'spiece.model', 'special_tokens_map.json'])
        model = ParlerTTSForConditionalGeneration.from_pretrained(d, torch_dtype=dtype).to(device).eval()
        prompt_tok = AutoTokenizer.from_pretrained(d)
        dt = group[0].get('descTokenizer')  # [repo, revision] when the descriptions have a tokenizer of their own
        desc_tok = AutoTokenizer.from_pretrained(fetch(dt[0], dt[1], ['tokenizer*', 'spiece.model', 'special_tokens_map.json', 'config.json'])) if dt else prompt_tok
        sr = model.config.sampling_rate
        for v in group:
            description = v['describe'].replace('{pace}', pace(job['speed']))
            desc = desc_tok(description, return_tensors='pt').to(device)
            t0 = time.time()
            parts = []
            for c in chunks(job['text'], 240):
                torch.manual_seed(v.get('seed', 0))
                p = prompt_tok(c, return_tensors='pt').to(device)
                with torch.inference_mode():
                    g = model.generate(input_ids=desc.input_ids, attention_mask=desc.attention_mask,
                                       prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
                parts.append(g.to(torch.float32).cpu().numpy().reshape(-1))
                parts.append(silence(sr, 0.25))
            secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
            log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')
        del model
        if device != 'cpu':
            torch.cuda.empty_cache()


def clip(v):
    """A voice taken from a short recording (a reference clip on Hugging Face, fixed revision): its local path."""
    c = v['clip']
    return os.path.join(fetch(c['repo'], c['rev'], [c['file']]), c['file'])


@engine('xtts')
def xtts(job, voices):
    """Coqui XTTS-v2 (the Coqui Public Model License: non-commercial use) through the coqui-tts package: its 58 studio
    voices, or a voice taken from a reference clip."""
    import numpy as np
    import torch
    import TTS.tts.models.xtts as xtts_model
    from TTS.tts.configs.xtts_config import XttsConfig
    from TTS.tts.models.xtts import Xtts

    # coqui-tts reads a clip with torchaudio, which since PyTorch 2.9 hands the work to torchcodec — and that needs the
    # FFmpeg libraries installed on the system. librosa (one of coqui-tts' own packages) reads a WAV without them.
    def load_audio(path, sr):
        import librosa
        a, _ = librosa.load(path, sr=sr, mono=True)
        return torch.from_numpy(a).unsqueeze(0)
    xtts_model.load_audio = load_audio
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['config.json', 'model.pth', 'vocab.json', 'speakers_xtts.pth', 'mel_stats.pth', 'LICENSE.txt'])
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log(f'  (on the {"graphics card" if device == "cuda" else "processor"})')
    config = XttsConfig()
    config.load_json(os.path.join(d, 'config.json'))
    model = Xtts.init_from_config(config)
    model.load_checkpoint(config, checkpoint_dir=d, eval=True)
    model.to(device)
    sr = config.audio.output_sample_rate
    for v in voices:
        if v.get('clip'):
            latent, embedding = model.get_conditioning_latents(audio_path=[clip(v)])
        else:
            s = model.speaker_manager.speakers[v['speaker']]
            latent, embedding = s['gpt_cond_latent'], s['speaker_embedding']
        t0 = time.time()
        parts = []
        for c in chunks(job['text'], 230):
            torch.manual_seed(0)
            with torch.inference_mode():
                out = model.inference(c, 'en', latent.to(device), embedding.to(device), temperature=0.7, speed=float(job['speed']))
            parts.append(np.asarray(out['wav'], dtype=np.float32).reshape(-1))
            parts.append(silence(sr, 0.2))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


@engine('pocket')
def pocket(job, voices):
    """Kyutai's Pocket TTS (CC BY 4.0): a small model that runs fast on a processor; its catalogue of voices (the
    package fetches the model and each voice from Hugging Face at the revisions written into it)."""
    import numpy as np
    from pocket_tts import TTSModel
    model = TTSModel.load_model()
    sr = model.sample_rate
    for v in voices:
        state = model.get_state_for_audio_prompt(v['voice'])
        t0 = time.time()
        parts = []
        for c in chunks(job['text'], 600):
            parts.append(model.generate_audio(state, c).detach().cpu().numpy().reshape(-1))
            parts.append(silence(sr, 0.2))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
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
