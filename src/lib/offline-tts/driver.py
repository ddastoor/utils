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


MONEY = {'₹': ('rupee', 'rupees', 'paisa', 'paise'), '$': ('dollar', 'dollars', 'cent', 'cents'),
         '£': ('pound', 'pounds', 'penny', 'pence'), '€': ('euro', 'euros', 'cent', 'cents')}


def spoken(text):
    """Numbers, money, times and percentages in words, typographic marks as plain ones — for an engine that reads
    only words (MeloTTS through sherpa-onnx drops every digit). num2words writes the numbers."""
    from num2words import num2words

    def words(n, **k):
        return num2words(n, lang='en', **k).replace('-', ' ').replace(',', '')
    t = text.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"').replace('…', '...')
    t = re.sub(r'\s*[–—]\s*', ', ', t)
    # titles and the commonest abbreviations (a full stop would end the sentence; "Dr" alone is "drive" to MeloTTS)
    for a, w in (('Dr', 'Doctor'), ('Mr', 'Mister'), ('Mrs', 'Missus'), ('Ms', 'Miz'), ('Prof', 'Professor'),
                 ('Sr', 'Senior'), ('Jr', 'Junior'), ('Smt', 'Shrimati'), ('Shri', 'Shri')):
        t = re.sub(r'\b' + a + r'\.?(?=\s+[A-Z])', w, t)
    t = re.sub(r'\bSt\.?(?=\s+[A-Z])', 'Saint', t)
    for a, w in (('e.g.', 'for example'), ('i.e.', 'that is'), ('etc.', 'et cetera'), ('vs.', 'versus'), ('No.', 'number')):
        t = re.sub(r'(?<![\w.])' + re.escape(a) + (r'(?=\s*\d)' if a == 'No.' else ''), w, t)

    def money(m):
        sign = '₹' if m.group(1).lower().startswith(('rs', 'inr')) else m.group(1)
        one, many, sub1, subs = MONEY[sign]
        whole, frac = m.group(2).replace(',', ''), m.group(3)
        c = int(frac.ljust(2, '0')[:2]) if frac else 0
        out = [f'{words(int(whole))} {one if int(whole) == 1 else many}'] if int(whole) or not c else []
        if c:
            out.append(f'{words(c)} {sub1 if c == 1 else subs}')
        return ' '.join(out)
    num = r'\d+(?:,\d{2,3})*'  # 1,500 and 1,50,000: commas between groups of digits only
    t = re.sub(r'(₹|\bRs\.?|\bINR|\$|£|€)\s?(' + num + r')(?:\.(\d+))?', money, t)
    t = re.sub(r'(' + num + r'(?:\.\d+)?)\s?%', lambda m: m.group(1) + ' percent', t)

    def clock(m):
        h, mi = int(m.group(1)), int(m.group(2))
        return f"{words(h)} o'clock" if mi == 0 else f'{words(h)} oh {words(mi)}' if mi < 10 else f'{words(h)} {words(mi)}'
    t = re.sub(r'\b([01]?\d|2[0-3]):([0-5]\d)\b', clock, t)
    t = re.sub(r'\b(\d+)(st|nd|rd|th)\b', lambda m: words(int(m.group(1)), to='ordinal'), t)
    month = r'(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b'
    t = re.sub(r'\b([12]?\d|3[01])(?=\s+' + month + ')', lambda m: words(int(m.group(1)), to='ordinal'), t)
    t = re.sub(r'\b' + month + r'\s+([12]?\d|3[01])\b(?!,\d|\.\d|\d)', lambda m: m.group(1) + ' ' + words(int(m.group(2)), to='ordinal'), t)
    t = re.sub(r'\b(' + num + r')\.(\d+)\b', lambda m: words(int(m.group(1).replace(',', ''))) + ' point ' + ' '.join(words(int(c)) for c in m.group(2)), t)
    t = re.sub(r'(?<![\d,.])(1[1-9]\d\d|20\d\d)(?!\d|[.,]\d)', lambda m: words(int(m.group(1)), to='year'), t)
    t = re.sub(num, lambda m: words(int(m.group(0).replace(',', ''))), t)
    return t


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
    from pathlib import Path
    from pocket_tts import TTSModel
    model = TTSModel.load_model()  # with voice cloning when this computer may download kyutai/pocket-tts (gated)
    sr = model.sample_rate
    # the catalogue's voices first, then the voices taken from recordings (they need the gated model)
    voices = sorted(voices, key=lambda v: bool(v.get('clip')))
    for v in voices:
        if v.get('clip'):
            if not model.has_voice_cloning:
                token = os.path.join(os.environ.get('HF_HOME', ''), 'token')
                sys.exit('Pocket TTS could not take a voice from a recording: that needs kyutai/pocket-tts, which Hugging Face '
                         'gives only to an account that has accepted its conditions at https://huggingface.co/kyutai/pocket-tts '
                         f'(and this computer its token). To be asked for the token again, delete {token} and run the script again.')
            state = model.get_state_for_audio_prompt(Path(clip(v)))
        else:
            state = model.get_state_for_audio_prompt(v['voice'])
        t0 = time.time()
        parts = []
        for c in chunks(job['text'], 600):
            parts.append(model.generate_audio(state, c).detach().cpu().numpy().reshape(-1))
            parts.append(silence(sr, 0.2))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


class G2pNet:
    """g2p_en's pronunciation network (Kyubyong Park and Jongseok Kim, Apache-2.0: a GRU encoder and decoder trained
    on the CMU dictionary) with the weights of the installed g2p_en package — its predict(), as g2p_en writes it.
    g2p_en itself is not imported: on import it downloads NLTK's data, which NLTK refuses to fetch through a proxy."""
    PH = ['<pad>', '<unk>', '<s>', '</s>', 'AA0', 'AA1', 'AA2', 'AE0', 'AE1', 'AE2', 'AH0', 'AH1', 'AH2', 'AO0', 'AO1', 'AO2',
          'AW0', 'AW1', 'AW2', 'AY0', 'AY1', 'AY2', 'B', 'CH', 'D', 'DH', 'EH0', 'EH1', 'EH2', 'ER0', 'ER1', 'ER2', 'EY0',
          'EY1', 'EY2', 'F', 'G', 'HH', 'IH0', 'IH1', 'IH2', 'IY0', 'IY1', 'IY2', 'JH', 'K', 'L', 'M', 'N', 'NG', 'OW0',
          'OW1', 'OW2', 'OY0', 'OY1', 'OY2', 'P', 'R', 'S', 'SH', 'T', 'TH', 'UH0', 'UH1', 'UH2', 'UW', 'UW0', 'UW1', 'UW2',
          'V', 'W', 'Y', 'Z', 'ZH']

    def __init__(self):
        import importlib.util
        import numpy as np
        self.np = np
        where = importlib.util.find_spec('g2p_en').submodule_search_locations[0]
        self.v = dict(np.load(os.path.join(where, 'checkpoint20.npz')))
        self.g2idx = {g: i for i, g in enumerate(['<pad>', '<unk>', '</s>'] + list('abcdefghijklmnopqrstuvwxyz'))}

    def cell(self, x, h, k):
        np, v = self.np, self.v
        a = x @ v[k + '_w_ih'].T + v[k + '_b_ih']
        b = h @ v[k + '_w_hh'].T + v[k + '_b_hh']
        n3 = a.shape[-1] * 2 // 3
        r, z = np.split(1 / (1 + np.exp(-(a[:, :n3] + b[:, :n3]))), 2, -1)
        n = np.tanh(a[:, n3:] + r * b[:, n3:])
        return (1 - z) * n + z * h

    def predict(self, word):
        np, v = self.np, self.v
        x = np.take(v['enc_emb'], np.expand_dims([self.g2idx.get(c, 1) for c in list(word) + ['</s>']], 0), axis=0)
        h = np.zeros((1, v['enc_w_hh'].shape[-1]), np.float32)
        for t in range(len(word) + 1):
            h = self.cell(x[:, t, :], h, 'enc')
        dec, out = np.take(v['dec_emb'], [2], axis=0), []
        for _ in range(20):
            h = self.cell(dec, h, 'dec')
            p = int((h @ v['fc_w'].T + v['fc_b']).argmax())
            if p == 3:
                break
            out.append(self.PH[p] if p < len(self.PH) else '<unk>')
            dec = np.take(v['dec_emb'], [p], axis=0)
        return out


@engine('melo')
def melo(job, voices):
    """MyShell's MeloTTS English (MIT) as k2-fsa converted it for sherpa-onnx: one model, five accents (American,
    British, Indian, Australian and its default). sherpa-onnx reads only the words of the model's pronouncing
    dictionary — it spells out or leaves out the others, and every number — so the numbers are written in words first
    and every other word the dictionary lacks is added to a copy of it, pronounced by g2p_en (what MeloTTS itself does
    with such words). The dictionary's ARPAbet with MeloTTS's tones: 7 for a consonant, 8 – 10 for a vowel by stress."""
    import tempfile
    import numpy as np
    import sherpa_onnx
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['model.onnx', 'lexicon.txt', 'tokens.txt', 'LICENSE'])
    import unicodedata
    text = spoken(job['text'])
    # accents off (café → cafe: sherpa-onnx would cut the word at the é), other scripts left out (English model)
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    text = re.sub(r"(?<![A-Za-z])'|'(?![A-Za-z])", ' ', text)  # an apostrophe used as a quotation mark
    lex = open(os.path.join(d, 'lexicon.txt'), encoding='utf-8').read()
    known = {line.split(' ', 1)[0] for line in lex.splitlines()}
    # sherpa-onnx's words: letters, digits and apostrophes between the other signs, in lower case
    new = sorted({w for w in re.findall(r"[a-z0-9']+", text.lower()) if w not in known and re.search('[a-z]', w)})
    lines = []
    if new:
        g2p = G2pNet()
        for w in new:
            ph = [p for p in g2p.predict(re.sub('[^a-z]', '', w)) if re.fullmatch('[A-Z]+[0-2]?', p)]
            if ph:
                tones = [str(7 + (int(p[-1]) + 1 if p[-1].isdigit() else 0)) for p in ph]
                lines.append(f"{w} {' '.join(p.rstrip('012').lower() for p in ph)} {' '.join(tones)}")
        log(f'  ({len(lines)} word{"s" if len(lines) != 1 else ""} not in its dictionary, pronounced by g2p_en: {", ".join(l.split()[0] for l in lines[:12])}{" …" if len(lines) > 12 else ""})')
    with tempfile.NamedTemporaryFile('w', suffix='.txt', encoding='utf-8', delete=False) as f:
        f.write(lex.rstrip('\n') + '\n' + ''.join(l + '\n' for l in lines))
        lexicon = f.name
    try:
        cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=os.path.join(d, 'model.onnx'), lexicon=lexicon,
                                                      tokens=os.path.join(d, 'tokens.txt')),
            num_threads=max(1, min(8, os.cpu_count() or 1)), provider='cpu'), max_num_sentences=1)
        tts = sherpa_onnx.OfflineTts(cfg)
        for v in voices:
            t0 = time.time()
            parts, sr = [], 44100
            for c in chunks(text, 400):
                a = tts.generate(c, sid=int(v['speaker']), speed=float(job['speed']))
                sr = a.sample_rate
                parts.append(np.asarray(a.samples, dtype=np.float32))
                parts.append(silence(sr, 0.25))
            secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
            log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')
    finally:
        os.unlink(lexicon)


@engine('supertonic')
def supertonic(job, voices):
    """Supertone's Supertonic (models OpenRAIL-M, package MIT): small ONNX models, many times faster than real time
    on a processor; ten voices a model (F1 – F5, M1 – M5). Version 1 reads English only, 2 and 3 are multilingual
    and are told the text is English."""
    import numpy as np
    from supertonic import TTS
    groups = {}
    for v in voices:
        groups.setdefault((v['repo'], v['rev']), []).append(v)
    for (repo, rev), group in groups.items():
        d = fetch(repo, rev, ['config.json', 'LICENSE', 'onnx/*', 'voice_styles/*.json'])
        name = repo.split('/', 1)[1]
        tts = TTS(model=name, model_dir=d, auto_download=False)
        # characters the model has no symbol for would stop it ("₹", some dashes and quotes): said and left out
        ok, missing = tts.model.text_processor.validate_text(job['text'])
        text = job['text']
        if not ok:
            text = ''.join(' ' if c in missing else c for c in text)
            log(f'  ({name} cannot read these characters, left out: {" ".join(missing)})')
        lang = None if name == 'supertonic' else 'en'
        for v in group:
            t0 = time.time()
            style = tts.get_voice_style(v['voice'])
            # 1.05 is the makers' own pace for "normal"; 16 steps instead of their 8 — better sound, still quick
            wav, _ = tts.synthesize(text, voice_style=style, total_steps=16, speed=1.05 * float(job['speed']),
                                    lang=lang, silence_duration=0.3)
            secs = write_audio(os.path.join(job['out'], v['id']), np.asarray(wav).reshape(-1), tts.sample_rate, job.get('mp3', True))
            log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


@engine('indictiny')
def indictiny(job, voices):
    """Indic Tiny TTS: Indian English (Sulabh Katiyar; weights CC BY 4.0, code MIT) — a woman's and a man's voice from
    IISc's SYSPIN / LIMMITS corpus, its own small Python package from the same repository, run here on ONNX Runtime
    (no PyTorch). Its own text rules read Indian conventions (lakh and crore, ₹, Dr., dates)."""
    import numpy as np
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['config.json', 'LICENSE.md', 'pyproject.toml', 'indic_tiny_tts/*', 'onnx/*'])
    sys.path.insert(0, d)
    from indic_tiny_tts import TinyTTSOnnx
    tts = TinyTTSOnnx(d, threads=max(1, min(8, os.cpu_count() or 1)))
    for v in voices:
        t0 = time.time()
        wav = tts.synthesize(job['text'], voice=v['voice'], speed=float(job['speed']), seed=0)
        secs = write_audio(os.path.join(job['out'], v['id']), wav if len(wav) else silence(tts.sample_rate, 0.1), tts.sample_rate, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


@engine('bark')
def bark(job, voices):
    """Suno's Bark (MIT) through transformers: a GPT-style model that speaks in the manner of a voice preset —
    v2/en_speaker_0 … 9 (English speakers) and v2/hi_speaker_0 … 9 (Hindi speakers: English with an Indian accent). It
    speaks about 13 seconds at a time, so a text goes a sentence or two at a time, each with the same preset; its pace
    cannot be set, and on a processor it is slow."""
    import numpy as np
    import torch
    from transformers import AutoProcessor, BarkModel
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log(f'  (on the {"graphics card" if device == "cuda" else "processor"} — on a processor this takes a while)')
    groups = {}
    for v in voices:
        groups.setdefault((v['repo'], v['rev']), []).append(v)
    for (repo, rev), group in groups.items():
        files = ['config.json', 'generation_config.json', 'pytorch_model.bin', 'tokenizer.json', 'tokenizer_config.json',
                 'vocab.txt', 'special_tokens_map.json', 'speaker_embeddings_path.json']
        for v in group:
            files += [f'speaker_embeddings/{v["voice"]}_{k}_prompt.npy' for k in ('semantic', 'coarse', 'fine')]
        d = fetch(repo, rev, files)
        processor = AutoProcessor.from_pretrained(d)
        model = BarkModel.from_pretrained(d).to(device).eval()
        sr = model.generation_config.sample_rate
        for v in group:
            t0 = time.time()
            parts = []
            for c in chunks(job['text'], 180):
                torch.manual_seed(v.get('seed', 0))
                inputs = processor(c, voice_preset=v['voice']).to(device)
                with torch.inference_mode():
                    a = model.generate(**inputs, pad_token_id=processor.tokenizer.pad_token_id)
                parts.append(a.cpu().numpy().reshape(-1).astype(np.float32))
                parts.append(silence(sr, 0.25))
            secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
            log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')
        del model
        if device != 'cpu':
            torch.cuda.empty_cache()


@engine('omnivoice')
def omnivoice(job, voices):
    """k2-fsa's OmniVoice (Xiaomi; code Apache-2.0, model CC BY-NC — personal use): a diffusion language model that
    speaks in a voice made from a few words — sex, age, pitch and an accent (American, British, Australian, Canadian,
    Indian …), the same voice every time (a fixed seed). A long text is spoken in parts, each following the voice of
    the first part (OmniVoice's own way). Numbers are written in words first."""
    import numpy as np
    import torch
    from omnivoice import OmniVoice
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    dtype = torch.float16 if device != 'cpu' else torch.float32
    log(f'  (on the {"graphics card" if device != "cpu" else "processor"} — on a processor this takes a while)')
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json',
                                      'chat_template.jinja', 'audio_tokenizer/*'])
    model = OmniVoice.from_pretrained(d, device_map=device, dtype=dtype)
    sr = model.sampling_rate
    text = spoken(job['text'])
    for v in voices:
        t0 = time.time()
        torch.manual_seed(v.get('seed', 0))
        with torch.inference_mode():
            audio = model.generate(text=text, language='English', instruct=v['describe'], speed=float(job['speed']))
        secs = write_audio(os.path.join(job['out'], v['id']), np.asarray(audio[0], dtype=np.float32).reshape(-1), sr, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


@engine('chatterbox')
def chatterbox(job, voices):
    """Resemble AI's Chatterbox and Chatterbox Turbo (MIT) through the chatterbox-tts package: the model's own voice, or a
    voice taken from a 10-second recording. The package marks its output with Resemble's inaudible watermark (Perth).
    Its pace cannot be set. It runs on its own PyTorch (2.6, which the package pins)."""
    import numpy as np
    import torch
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log(f'  (on the {"graphics card" if device == "cuda" else "processor"})')
    groups = {}
    for v in voices:
        groups.setdefault((v['repo'], v['rev']), []).append(v)
    for (repo, rev), group in groups.items():
        if repo.endswith('-turbo'):
            from chatterbox.tts_turbo import ChatterboxTurboTTS as Model
        else:
            from chatterbox.tts import ChatterboxTTS as Model
        d = fetch(repo, rev, ['ve.safetensors', 't3_turbo_v1.safetensors', 't3_turbo_v1.yaml', 's3gen_meanflow.safetensors', 'vocab.json',
                              'merges.txt', 'added_tokens.json', 'special_tokens_map.json', 'tokenizer_config.json', 'conds.pt']
                  if repo.endswith('-turbo') else ['ve.safetensors', 't3_cfg.safetensors', 's3gen.safetensors', 'tokenizer.json', 'conds.pt'])
        model = Model.from_local(d, device)
        for v in group:
            t0 = time.time()
            prompt = clip(v) if v.get('clip') else None
            parts = []
            for c in chunks(job['text'], 300):
                torch.manual_seed(v.get('seed', 0))
                wav = model.generate(c, audio_prompt_path=prompt)
                prompt = None  # the voice stays prepared for the next pieces
                parts.append(wav.reshape(-1).detach().cpu().numpy().astype(np.float32))
                parts.append(silence(model.sr, 0.25))
            secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(model.sr, 0.1), model.sr, job.get('mp3', True))
            log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')
        del model


SNAC_24K = ('hubertsiuzdak/snac_24khz', 'd73ad176a12188fcf4f360ba3bf2c2fbbe8f58ec')


@engine('veena')
def veena(job, voices):
    """Maya Research's Veena (Apache-2.0): a 3-billion-parameter Llama model trained on Indian voices (Kavya, Agastya,
    Maitri, Vinaya), its speech decoded by SNAC 24 kHz (MIT) — as the model card does it. In bfloat16: about 7 GB of a
    graphics card's memory; on a processor it is very slow. Spoken a sentence at a time (the card's limit)."""
    import numpy as np
    import torch
    from snac import SNAC
    from transformers import AutoModelForCausalLM, AutoTokenizer
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log(f'  (on the {"graphics card" if device == "cuda" else "processor — this takes a long while"})')
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['config.json', 'generation_config.json', 'model-*.safetensors', 'model.safetensors.index.json',
                                      'special_tokens_map.json', 'tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja'])
    tok = AutoTokenizer.from_pretrained(d)
    model = AutoModelForCausalLM.from_pretrained(d, torch_dtype=torch.bfloat16).to(device).eval()
    snac = SNAC.from_pretrained(fetch(SNAC_24K[0], SNAC_24K[1], ['config.json', 'pytorch_model.bin'])).eval().to(device)
    SOS, EOS, SOH, EOH, SOA, EOA, BASE = 128257, 128258, 128259, 128260, 128261, 128262, 128266  # the card's tokens
    for v in voices:
        t0 = time.time()
        parts = []
        for c in chunks(spoken(job['text']), 120):
            torch.manual_seed(v.get('seed', 0))
            ids = [SOH, *tok.encode(f'<spk_{v["voice"]}> {c}', add_special_tokens=False), EOH, SOA, SOS]
            with torch.inference_mode():
                out = model.generate(torch.tensor([ids], device=device), max_new_tokens=min(int(len(c) * 1.3) * 7 + 21, 700),
                                     do_sample=True, temperature=0.4, top_p=0.9, repetition_penalty=1.05,
                                     pad_token_id=tok.pad_token_id, eos_token_id=[EOS, EOA])
            codes = [t for t in out[0][len(ids):].tolist() if BASE <= t < BASE + 7 * 4096]
            codes = codes[:len(codes) // 7 * 7]
            if not codes:
                continue
            lv = [[], [], []]  # the card's de-interleaving: 1 coarse, 2 medium, 4 fine codes a frame
            for i in range(0, len(codes), 7):
                f = [codes[i + k] - BASE - k * 4096 for k in range(7)]
                lv[0].append(f[0]); lv[1] += [f[1], f[4]]; lv[2] += [f[2], f[3], f[5], f[6]]
            with torch.inference_mode():
                a = snac.decode([torch.tensor(x, dtype=torch.int32, device=device).clamp(0, 4095).unsqueeze(0) for x in lv])
            parts.append(a.reshape(-1).float().cpu().numpy())
            parts.append(silence(24000, 0.2))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(24000, 0.1), 24000, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


@engine('voxcpm')
def voxcpm(job, voices):
    """OpenBMB's VoxCPM2 (Apache-2.0): a voice described in words (in brackets before the text, as its card shows), or
    a voice taken from a recording. A long text is spoken in parts; from the second part on the voice is taken from the
    first part, so it stays the same. Numbers are written in words first."""
    import tempfile
    import numpy as np
    import torch
    from voxcpm import VoxCPM
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['config.json', 'model.safetensors', 'audiovae.pth', 'special_tokens_map.json',
                                      'tokenization_voxcpm2.py', 'tokenizer.json', 'tokenizer_config.json'])
    model = VoxCPM.from_pretrained(d, load_denoiser=False, optimize=False)
    sr = model.tts_model.sample_rate
    s = float(job['speed'])
    pace = '' if 0.9 <= s <= 1.1 else ', speaking slowly' if s < 0.9 else ', speaking quickly'
    for v in voices:
        t0 = time.time()
        parts, ref = [], clip(v) if v.get('clip') else None
        tmp = None
        for c in chunks(spoken(job['text']), 300):
            torch.manual_seed(v.get('seed', 0))
            if ref:
                text = f'({pace.lstrip(", ")}){c}' if pace else c
                wav = model.generate(text=text, reference_wav_path=ref, cfg_value=2.0, inference_timesteps=10)
            else:
                wav = model.generate(text=f'({v["describe"]}{pace}){c}', cfg_value=2.0, inference_timesteps=10)
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                    tmp = f.name
                write_audio(tmp[:-4], np.asarray(wav, dtype=np.float32), sr, mp3=False)
                ref = tmp  # the next parts in the voice of this one
            parts.append(np.asarray(wav, dtype=np.float32).reshape(-1))
            parts.append(silence(sr, 0.25))
        if tmp:
            os.unlink(tmp)
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


@engine('coqui')
def coqui(job, voices):
    """Models made with Coqui TTS (here IISc SYSPIN's Indian English VITS voices, MIT), run by coqui-tts."""
    import numpy as np
    import torch
    from TTS.api import TTS
    for v in voices:
        d = fetch(v['repo'], v['rev'], ['best_model.pth', 'config.json'])
        tts = TTS(model_path=os.path.join(d, 'best_model.pth'), config_path=os.path.join(d, 'config.json'), progress_bar=False)
        if torch.cuda.is_available():
            tts.to('cuda')
        sr = tts.synthesizer.output_sample_rate
        m = tts.synthesizer.tts_model
        if hasattr(m, 'length_scale'):  # VITS: the pace is its length scale
            m.length_scale = float(m.length_scale) / float(job['speed'])
        t0 = time.time()
        parts = []
        for c in chunks(spoken(job['text']), 250):
            parts.append(np.asarray(tts.tts(text=c), dtype=np.float32).reshape(-1))
            parts.append(silence(sr, 0.2))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


@engine('mms')
def mms(job, voices):
    """Meta's MMS English voice (facebook/mms-tts-eng, CC BY-NC 4.0) through transformers' VITS."""
    import numpy as np
    import torch
    from transformers import AutoTokenizer, VitsModel
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['config.json', 'model.safetensors', 'special_tokens_map.json', 'tokenizer_config.json', 'vocab.json'])
    tok = AutoTokenizer.from_pretrained(d)
    model = VitsModel.from_pretrained(d).eval()
    model.speaking_rate = float(job['speed'])
    sr = model.config.sampling_rate
    for v in voices:
        t0 = time.time()
        parts = []
        for c in chunks(spoken(job['text']), 250):
            torch.manual_seed(v.get('seed', 0))
            with torch.inference_mode():
                parts.append(model(**tok(c, return_tensors='pt')).waveform.reshape(-1).numpy().astype(np.float32))
            parts.append(silence(sr, 0.2))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


def pace_words(speed):
    """The pace as an instruction, for models that take one (Qwen3-TTS 1.7B)."""
    s = float(speed)
    return '' if 0.9 <= s <= 1.1 else 'Speak very slowly.' if s < 0.7 else 'Speak slowly.' if s < 0.9 else 'Speak a little faster than usual.' if s <= 1.4 else 'Speak fast.'


@engine('qwen')
def qwen(job, voices):
    """Alibaba's Qwen3-TTS (Apache-2.0) through its qwen-tts package: the nine speakers of the CustomVoice models, and
    the VoiceDesign model, which speaks in a voice described in words. The 1.7B models take the pace as an instruction;
    the 0.6B model has no instructions (no speed). A text is spoken in parts of up to about 40 seconds."""
    import numpy as np
    import torch
    from qwen_tts import Qwen3TTSModel
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    dtype = torch.bfloat16 if device != 'cpu' else torch.float32
    log(f'  (on the {"graphics card" if device != "cpu" else "processor"} — on a processor this takes a while)')
    groups = {}
    for v in voices:
        groups.setdefault((v['repo'], v['rev']), []).append(v)
    for (repo, rev), group in groups.items():
        d = fetch(repo, rev, ['*.json', '*.txt', '*.safetensors', 'speech_tokenizer/*'])
        model = Qwen3TTSModel.from_pretrained(d, device_map=device, dtype=dtype)
        for v in group:
            t0 = time.time()
            parts, sr = [], 24000
            for c in chunks(job['text'], 600):
                torch.manual_seed(v.get('seed', 0))
                with torch.inference_mode():
                    if v.get('describe'):
                        how = (v['describe'] + ' ' + pace_words(job['speed'])).strip()
                        wavs, sr = model.generate_voice_design(text=c, language='English', instruct=how)
                    else:
                        wavs, sr = model.generate_custom_voice(text=c, language='English', speaker=v['speaker'],
                                                               instruct=pace_words(job['speed']) or None)
                parts.append(np.asarray(wavs[0], dtype=np.float32).reshape(-1))
                parts.append(silence(sr, 0.25))
            secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(sr, 0.1), sr, job.get('mp3', True))
            log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')
        del model
        if device != 'cpu':
            torch.cuda.empty_cache()


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
