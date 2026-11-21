#!/usr/bin/env python3
"""The voices of the Text-to-Speech tab's offline mode → src/lib/offline-tts/catalogue.json.

Owner, 21 Nov 2026: "include as many different variants of Indian, US and [UK] accents as you can, even if they are large
in size … it doesn't affect the size of … my GitHub project." Nothing listed here is on the site: the PC that runs the
script the tab writes downloads each model from where its makers publish it (Hugging Face), at the revision named here.

Sources (each fact below comes from one of them):
  Piper        rhasspy/piper-voices voices.json at PIPER_REV (files, sizes, speaker numbers); each voice's model card
               (dataset and licence); VCTK's speaker-info.txt (scripts/data/vctk-speaker-info.txt: age, sex, accent of
               the 109 speakers); L2-ARCTIC's speaker table (Zhao et al., Interspeech 2018: first language and sex of the
               24 speakers); CMU ARCTIC's documentation (the seven original speakers).
  Kokoro       hexgrad/Kokoro-82M VOICES.md at KOKORO_REV (voices, the authors' grades).
  Parler       the model cards of ai4bharat/indic-parler-tts (21 English speakers, Indian English) and
               parler-tts/parler-tts-large-v1 / -mini-v1.1 (34 named speakers).
  XTTS-v2      the 58 studio voices of coqui/XTTS-v2 (speakers_xtts.pth); reference clips from kyutai/tts-voices
               (voice donations CC0, VCTK CC BY 4.0).
  Pocket TTS   the voice table of pocket-tts 4.0.1 (pocket_tts/utils/utils.py) and the clips it was made from.
  MeloTTS      MeloTTS-English's config (speakers EN-US 0, EN-BR 1, EN_INDIA 2, EN-AU 3, EN-Default 4), the same in
               k2-fsa's ONNX conversion (csukuangfj/vits-melo-tts-en); all five are women's voices (pitch, below).
  Supertonic   the supertonic package 1.3.1 (its pinned revision of each model) and the model cards: ten voices a model,
               F1 – F5 and M1 – M5 (pitch, below).
  Indic Tiny   sulabhkatiyar/indic-tiny-tts-english's card (two voices: LIMMITS 2024 / IISc SYSPIN English, a woman and
               a man).
  Qwen3-TTS    the qwen-tts package 0.1.1 readme: the nine speakers of the CustomVoice models with the makers' words
               and native languages; the VoiceDesign voices are our descriptions.
  OmniVoice    omnivoice 0.2.1 (omnivoice/utils/voice_design.py): the words a voice can be made of — sex, age, pitch,
               accent.
  Bark         suno/bark's speaker presets v2/en_speaker_0 – 9 and v2/hi_speaker_0 – 9 (sex by pitch, below).
  Chatterbox   chatterbox-tts 0.1.7 (tts.py, tts_turbo.py: the files each model reads); its own voice and the Indian clips.
  Veena        maya-research/Veena's card (its four speakers and the decoding with SNAC 24 kHz).
  VoxCPM2      openbmb/VoxCPM2's card (a voice described in brackets before the text, or a recording) and voxcpm 2.0.3.
  SYSPIN       SYSPIN/vits_English_Female and _Male (IISc; Coqui TTS VITS, characters, 22.05 kHz).
  MMS          facebook/mms-tts-eng (Meta's Massively Multilingual Speech, English).
  Pocket clone the gated kyutai/pocket-tts at the revision pocket-tts 4.0.1's config/english.yaml pins (voice cloning).
  Kyutai 1.6B  kyutai/tts-1.6b-en_fr at KYUTAI_REV (CC BY 4.0) and the recordings of kyutai/tts-voices at CLIPS_REV that
               have an embedding for it (its README: the licence of each collection; EARS p003 a woman, p031 a man); the
               accent each recording was heard with and its pitch: scripts/data/kyutai-voices-heard.json (CommonAccent and
               pYIN on the recordings, scripts/accent-survey/recordings.py).
Sizes are the bytes of the files the driver fetches, from the Hugging Face API at the pinned revisions (MB = 10^6 bytes).

Run: python3 scripts/make-offline-tts-catalogue.py   (needs huggingface.co; caches its answers in /tmp/offline-tts-cat)
"""
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'lib', 'offline-tts', 'catalogue.json')
CACHE = '/tmp/offline-tts-cat'

PIPER_REPO, PIPER_REV = 'rhasspy/piper-voices', 'e9c8a39444359388adaa94255becb37a5a2b8e51'
KOKORO_REPO, KOKORO_REV = 'hexgrad/Kokoro-82M', 'f3ff3571791e'
SPACY_REPO, SPACY_REV = 'spacy/en_core_web_sm', '8fb6f8155286360bf5486fe399e2738d1df7ded2'
GOONJ_REPO, GOONJ_REV = 'BH-Builds/goonj-1-82M', '7056ccc1a0b58beaad09fe2057730545d74261cb'
INDIC_REPO, INDIC_REV = 'ai4bharat/indic-parler-tts', '660bc53c64ae83150613264111708a0465211237'
LARGE_REPO, LARGE_REV = 'parler-tts/parler-tts-large-v1', '50cb4b874c83902f930d7c2e753224c15654f11e'
MINI_REPO, MINI_REV = 'parler-tts/parler-tts-mini-v1.1', 'fbb2dd281092c5b414ef29cf9d8895f386f1feef'
T5_TOK = ['google/flan-t5-large', '0613663d0d48ea86ba8cb3d7a44f0f65dc596a2a']
XTTS_REPO, XTTS_REV = 'coqui/XTTS-v2', '6c2b0d75eae4b7047358e3b6bd9325f857d43f77'
CLIPS_REPO, CLIPS_REV = 'kyutai/tts-voices', '323332d33f997de8394f24a193e1a76df720e01a'
POCKET_REPO, POCKET_REV = 'kyutai/pocket-tts-without-voice-cloning', 'a7056f505a4a8ca72d8b5fb1440071d6f1a35739'
MELO_REPO, MELO_REV = 'csukuangfj/vits-melo-tts-en', '9969cf40233d9ee504a6e1cde8aee9bab3ecf985'
TINY_REPO, TINY_REV = 'sulabhkatiyar/indic-tiny-tts-english', 'eea5d4a578c0f18173825a037487cf9c47ed4247'
QWEN = [('qwen-1.7b', 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', '0c0e3051f131929182e2c023b9537f8b1c68adfe', 'Qwen3-TTS 1.7B CustomVoice'),
        ('qwen-0.6b', 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', '85e237c12c027371202489a0ec509ded67b5e4b5', 'Qwen3-TTS 0.6B CustomVoice')]
QWEN_VD = ('qwen-design', 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', '5ecdb67327fd37bb2e042aab12ff7391903235d3', 'Qwen3-TTS 1.7B VoiceDesign')
OMNI_REPO, OMNI_REV = 'k2-fsa/OmniVoice', '3fc979d1cd72492cd679c5ac2611e0d7ac047ba1'
CHATTERBOX = [('chatterbox', 'ResembleAI/chatterbox', '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18', 'Chatterbox (Resemble AI)',
               ['ve.safetensors', 't3_cfg.safetensors', 's3gen.safetensors', 'tokenizer.json', 'conds.pt']),
              ('chatterbox-turbo', 'ResembleAI/chatterbox-turbo', '749d1c1a46eb10492095d68fbcf55691ccf137cd', 'Chatterbox Turbo (Resemble AI)',
               ['ve.safetensors', 't3_turbo_v1.safetensors', 't3_turbo_v1.yaml', 's3gen_meanflow.safetensors', 'vocab.json', 'merges.txt',
                'added_tokens.json', 'special_tokens_map.json', 'tokenizer_config.json', 'conds.pt'])]
VEENA_REPO, VEENA_REV = 'maya-research/Veena', '8b770f9e69e6b35ef320d4cd70a99a4ab6dd022f'
SNAC_REPO, SNAC_REV = 'hubertsiuzdak/snac_24khz', 'd73ad176a12188fcf4f360ba3bf2c2fbbe8f58ec'
VOX_REPO, VOX_REV = 'openbmb/VoxCPM2', '7936080b41163874f38610f46f438e2c0757f9fd'
SYSPIN = [('syspin-female', 'SYSPIN/vits_English_Female', 'ce6219adea6faee308696de3851a7335f9af5dd3', 'f'),
          ('syspin-male', 'SYSPIN/vits_English_Male', '2e095770cf8ad748d974ccf0dd46f5a17e88d27b', 'm')]
MMS_REPO, MMS_REV = 'facebook/mms-tts-eng', 'c71de0fe7204c83f1c10820a7d696d0b450048ba'
POCKET_CLONE_REPO, POCKET_CLONE_REV = 'kyutai/pocket-tts', 'db04f0e653473e5c7333c69686ac92b7460b0c1d'
BARK = [('bark', 'suno/bark', '70a8a7d34168586dc5d028fa9666aceade177992', 'Bark (Suno)'),
        ('bark-small', 'suno/bark-small', '1dbd7a128513b8ae4a4e2130fed57b7ac9da5bcd', 'Bark small (Suno)')]
# the revisions the supertonic package 1.3.1 pins (supertonic/config.py)
SUPERTONIC = [('supertonic-3', 'Supertone/supertonic-3', '724fb5abbf5502583fb520898d45929e62f02c0b', 'Supertonic 3'),
              ('supertonic-2', 'Supertone/supertonic-2', '75e6727618a02f323c720cba9478152d4bc16ca4', 'Supertonic 2'),
              ('supertonic-1', 'Supertone/supertonic', 'b6856d033f622c63ea29441795be266a1133e227', 'Supertonic 1 (English only)')]


def get(url, name):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, re.sub(r'[^A-Za-z0-9._-]', '_', name))
    if not os.path.exists(p):
        with urllib.request.urlopen(url, timeout=60) as r:
            open(p, 'wb').write(r.read())
    return open(p, 'rb').read()


def tree(repo, rev):
    """Every file of a repository at a revision → {path: size} (the API answers in pages, linked by a Link header)."""
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, re.sub(r'[^A-Za-z0-9._-]', '_', f'tree-{repo}-{rev}.json'))
    if not os.path.exists(p):
        out, url = {}, f'https://huggingface.co/api/models/{repo}/tree/{rev}?recursive=1'
        while url:
            with urllib.request.urlopen(url, timeout=60) as r:
                for f in json.loads(r.read()):
                    if f['type'] == 'file':
                        out[f['path']] = f.get('size') or 0
                m = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get('Link') or '')
                url = m.group(1) if m else None
        json.dump(out, open(p, 'w'))
    return json.load(open(p))


def mb(n):
    return round(n / 1e6, 1)


def size_of(repo, rev, patterns):
    import fnmatch
    t = tree(repo, rev)
    return sum(s for p, s in t.items() if any(fnmatch.fnmatch(p, pat) for pat in patterns))


GROUPS = [
    ['in', 'Indian English'],
    ['us', 'American English'],
    ['uk', 'British and Irish English'],
    ['world', 'Other English accents'],
    ['any', 'English — accent not documented'],
]

# The engines: the Python packages each one runs with (the script installs them with `uv pip install` into an
# environment of the engine's own, envs/<engine> in its folder — made the first time, made again when the pins change),
# about how much they download the first time, and what the person should know. "torch": PyTorch (UV_TORCH_BACKEND=auto:
# uv picks the build for the graphics card there is — CUDA for NVIDIA, else the processor's, which is far smaller).
ENGINES = {
    'piper': {
        'name': 'Piper', 'url': 'https://github.com/OHF-Voice/piper1-gpl',
        'packages': ['piper-tts==1.8.0', 'huggingface-hub==2.4.0', 'lameenc==1.9.0', 'numpy==2.3.5'],
        'mb': 60, 'torch': False, 'speedControl': True, 'licence': 'GPL-3.0 (the piper-tts program)',
        'about': 'Small, quick voices (VITS) — several times faster than real time on any processor.',
    },
    'kokoro': {
        'name': 'Kokoro', 'url': 'https://huggingface.co/hexgrad/Kokoro-82M',
        'packages': ['kokoro==0.9.4', 'misaki[en]==0.9.4', 'spacy==3.7.5', 'thinc==8.2.5', 'numpy==1.26.4',
                     'transformers==5.23.0', 'huggingface-hub==2.4.0', 'lameenc==1.9.0', 'torch'],
        'mb': 400, 'torch': True, 'speedControl': True, 'licence': 'Apache-2.0',
        'about': "A small, highly rated neural model with hexgrad's own reading of English (every word spoken) — "
                 'about four times faster than real time on a processor.',
    },
    'parler': {
        'name': 'Parler-TTS', 'url': 'https://github.com/huggingface/parler-tts',
        'packages': ['parler-tts==0.2.3', 'transformers==4.46.1', 'sentencepiece==0.2.0', 'protobuf==4.25.9',
                     'huggingface-hub==0.36.2', 'lameenc==1.9.0', 'numpy==2.5.5', 'torch'],
        'mb': 450, 'torch': True, 'speedControl': True, 'licence': 'Apache-2.0', 'slow': True,
        'about': 'Large models that speak as a sentence describes (a named speaker, a pace, very clear audio). '
                 'Slow on a processor — a graphics card helps a lot.',
    },
    'xtts': {
        'name': 'XTTS-v2', 'url': 'https://huggingface.co/coqui/XTTS-v2',
        # six: coqui-tts 0.28.0 imports it without asking for it, and nothing else brings it any more (21 Nov 2026:
        # XTTS-v2 stopped with "No module named 'six'" — SYSPIN's engine, the same package, had the pin already)
        'packages': ['coqui-tts[codec]==0.28.0', 'six==1.17.0', 'lameenc==1.9.0', 'torch', 'torchaudio'],
        'mb': 450, 'torch': True, 'speedControl': True, 'accept': 'cpml', 'slow': True,
        'licence': 'Coqui Public Model License (non-commercial use only)',
        'about': "Coqui's large multilingual model: 58 studio voices, and voices taken from short recordings. "
                 'About real time on a fast processor.',
    },
    'supertonic': {
        'name': 'Supertonic', 'url': 'https://github.com/supertone-inc/supertonic',
        'packages': ['supertonic==1.3.1', 'onnxruntime==1.32.0', 'numpy==2.3.5', 'soundfile==0.14.0', 'huggingface-hub==2.4.0',
                     'lameenc==1.9.0'],
        'mb': 60, 'torch': False, 'speedControl': True, 'licence': 'MIT (the program); the models OpenRAIL-M',
        'about': "Supertone's small ONNX models — three to eight times faster than real time on a processor.",
    },
    'melo': {
        'name': 'MeloTTS', 'url': 'https://github.com/myshell-ai/MeloTTS',
        'packages': ['sherpa-onnx==2.0.2', 'numpy==2.3.5', 'huggingface-hub==2.4.0', 'lameenc==1.9.0', 'num2words==0.5.14',
                     'g2p-en==2.1.0', 'nltk==3.10.4', 'inflect==7.6.0', 'distance==0.1.3'],
        'mb': 50, 'torch': False, 'speedControl': True, 'licence': 'MIT (MeloTTS); sherpa-onnx Apache-2.0',
        'about': "MyShell's MeloTTS: one model with American, British, Indian and Australian accents (women's voices), run "
                 'by sherpa-onnx — about three times faster than real time on a processor.',
    },
    'indictiny': {
        'name': 'Indic Tiny TTS', 'url': 'https://huggingface.co/sulabhkatiyar/indic-tiny-tts-english',
        'packages': ['onnxruntime==1.32.0', 'numpy==2.3.5', 'huggingface-hub==2.4.0', 'lameenc==1.9.0'],
        'mb': 50, 'torch': False, 'speedControl': True, 'licence': 'MIT (the program); the model CC BY 4.0',
        'about': 'A tiny Indian English model (22.5 million parameters) trained on IISc’s SYSPIN recordings, with its own '
                 'Indian reading of numbers, ₹, lakh and crore — about seven times faster than real time on one processor core.',
    },
    'qwen': {
        'name': 'Qwen3-TTS', 'url': 'https://github.com/QwenLM/Qwen3-TTS',
        'packages': ['qwen-tts==0.1.1', 'transformers==4.57.3', 'accelerate==1.12.0', 'huggingface-hub==0.36.2', 'lameenc==1.9.0',
                     'torch', 'torchaudio'],
        'mb': 350, 'torch': True, 'speedControl': False, 'licence': 'Apache-2.0', 'slow': True,
        'about': "Alibaba's speech language models: nine named speakers, and a model that speaks in a voice described in "
                 'words (sex, age, manner — an accent asked for does not come through in English). Its pace cannot be '
                 'set (an instruction moved it by 5 % in our test). About four times slower than real time on a processor '
                 '(0.6B), the 1.7B models about five; a graphics card is many times faster.',
    },
    'omnivoice': {
        'name': 'OmniVoice', 'url': 'https://github.com/k2-fsa/OmniVoice',
        'packages': ['omnivoice==0.2.1', 'transformers==5.23.0', 'accelerate==1.16.0', 'huggingface-hub==2.4.0', 'num2words==0.5.14',
                     'lameenc==1.9.0', 'torch', 'torchaudio'],
        'mb': 350, 'torch': True, 'speedControl': True, 'licence': 'Apache-2.0 (the program); the model CC BY-NC', 'slow': True,
        'about': "k2-fsa's (Xiaomi) model that makes a voice from a few words — sex, age, pitch and an accent (Indian, "
                 'American, British, Australian, Canadian …).',
    },
    'bark': {
        'name': 'Bark', 'url': 'https://github.com/suno-ai/bark',
        'packages': ['transformers==4.57.3', 'huggingface-hub==0.36.2', 'lameenc==1.9.0', 'torch'],
        'mb': 300, 'torch': True, 'speedControl': False, 'licence': 'MIT', 'slow': True,
        'about': "Suno's expressive GPT-style model, speaking in the manner of a voice preset — English speakers and "
                 'Hindi speakers (English with an Indian accent, heard as such here). It draws its speech at random and '
                 'now and then says something else: listen to the result. About eight times slower than real time on a '
                 'processor (small); its pace cannot be set.',
    },
    'chatterbox': {
        'name': 'Chatterbox', 'url': 'https://github.com/resemble-ai/chatterbox',
        'packages': ['chatterbox-tts==0.1.7', 'lameenc==1.9.0'],
        'mb': 450, 'torch': True, 'ownTorch': True, 'speedControl': False, 'licence': 'MIT', 'slow': True,
        'about': "Resemble AI's expressive models: their own voice, or a voice taken from a recording. The program "
                 'marks the speech with an inaudible watermark and runs on its own PyTorch 2.6 (a second copy).',
    },
    'veena': {
        'name': 'Veena', 'url': 'https://huggingface.co/maya-research/Veena',
        'packages': ['transformers==4.57.3', 'accelerate==1.12.0', 'snac==1.2.1', 'huggingface-hub==0.36.2', 'num2words==0.5.14',
                     'lameenc==1.9.0', 'torch'],
        'mb': 300, 'torch': True, 'speedControl': False, 'licence': 'Apache-2.0', 'slow': True,
        'about': "Maya Research's 3-billion-parameter model trained on Indian voices. Made for a graphics card (about 7 GB of its "
                 'memory); on a processor alone it is very slow.',
    },
    'voxcpm': {
        'name': 'VoxCPM2', 'url': 'https://github.com/OpenBMB/VoxCPM',
        'packages': ['voxcpm==2.0.3', 'num2words==0.5.14', 'lameenc==1.9.0', 'torch', 'torchaudio'],
        'mb': 700, 'torch': True, 'speedControl': True, 'licence': 'Apache-2.0', 'slow': True,
        'about': "OpenBMB's 2-billion-parameter model at 48 kHz: a voice described in words, or taken from a recording.",
    },
    'coqui': {
        'name': 'Coqui TTS (VITS)', 'url': 'https://github.com/idiap/coqui-ai-TTS',
        # six: coqui-tts 0.28.0 imports it for its VITS models without asking for it (ModuleNotFoundError here)
        'packages': ['coqui-tts[codec]==0.28.0', 'six==1.17.0', 'num2words==0.5.14', 'lameenc==1.9.0', 'torch', 'torchaudio'],
        'mb': 450, 'torch': True, 'speedControl': True, 'licence': 'MPL-2.0 (the program)',
        'about': "IISc SYSPIN's Indian English voices, trained with Coqui TTS (VITS). Quick, but less clear than the newer models.",
    },
    'mms': {
        'name': 'MMS', 'url': 'https://huggingface.co/facebook/mms-tts-eng',
        'packages': ['transformers==4.57.3', 'huggingface-hub==0.36.2', 'num2words==0.5.14', 'lameenc==1.9.0', 'torch'],
        'mb': 300, 'torch': True, 'speedControl': True, 'licence': 'Apache-2.0 (transformers)',
        'about': "Meta's Massively Multilingual Speech: its small English voice (VITS).",
    },
    'kyutai': {
        'name': 'Kyutai TTS', 'url': 'https://github.com/kyutai-labs/delayed-streams-modeling',
        # moshi 0.2.13 asks for numpy < 2.3, huggingface-hub < 1.0 and PyTorch < 2.10: a PyTorch of its own (2.9)
        'packages': ['moshi==0.2.13', 'numpy==2.2.6', 'huggingface-hub==0.36.2', 'num2words==0.5.14', 'lameenc==1.9.0', 'torch'],
        'mb': 200, 'torch': True, 'ownTorch': True, 'speedControl': True, 'licence': 'CC BY 4.0 (the model); moshi MIT', 'slow': True,
        'about': "Kyutai's 1.6-billion-parameter model in the voice of any of 601 recordings — voice donations from around "
                 'the world, VCTK, EARS, Expresso — from the embedding Kyutai made of each (nothing is recorded or analysed '
                 'on your computer). About eight times slower than real time on a processor; a graphics card is many times '
                 'faster. On a processor it needs about 16 GB of memory (measured: 15 GB). Its pace is set through the pauses '
                 'between words: slower works well, faster only up to about 1.3×.',
    },
    'f5': {
        'name': 'F5-TTS', 'url': 'https://github.com/SWivid/F5-TTS',
        # f5-tts 1.1.22 with the versions it ran with here; torchaudio 2.9 and later read files through torchcodec, which
        # needs FFmpeg on the system — driver.py reads the recordings with soundfile instead
        'packages': ['f5-tts==1.1.22', 'x-transformers==2.32.1', 'vocos==0.1.0', 'transformers==5.24.0', 'num2words==0.5.14',
                     'lameenc==1.9.0', 'torch'],
        'mb': 700, 'torch': True, 'speedControl': True, 'licence': 'MIT (the model: CC BY-NC 4.0)', 'slow': True,
        'about': "SWivid's F5-TTS v1 (a flow-matching model of 336 million parameters, trained on 95,000 hours of English "
                 'and Chinese): English in the voice of a recording, given the words said in it — the catalogue carries a '
                 'transcript of each recording (Whisper large-v3 turbo). Personal use only (the model is CC BY-NC).',
    },
    'vibevoice': {
        'name': 'VibeVoice', 'url': 'https://github.com/microsoft/VibeVoice',
        # Microsoft's own package (its 1.5B inference code; it pins transformers 4.51.3 and accelerate 1.6.0 itself)
        'packages': ['vibevoice==0.0.1', 'diffusers==0.39.0', 'huggingface-hub==0.36.2', 'num2words==0.5.14', 'lameenc==1.9.0', 'torch'],
        'mb': 500, 'torch': True, 'speedControl': False, 'licence': 'MIT', 'slow': True,
        'about': "Microsoft's VibeVoice 1.5B: long-form speech (up to 90 minutes in one go) in the voice of a recording — Qwen2.5 "
                 '1.5B with a diffusion head. Microsoft’s card calls it a research model (English and Chinese; not for '
                 'commercial use without more testing). On a processor it needs about 12 GB of memory and is slow; an NVIDIA '
                 'card runs it in bfloat16. Its pace cannot be set.',
    },
    'pocket': {
        'name': 'Pocket TTS', 'url': 'https://huggingface.co/kyutai/pocket-tts-without-voice-cloning',
        'packages': ['pocket-tts==4.0.1', 'lameenc==1.9.0', 'torch'],
        'mb': 350, 'torch': True, 'speedControl': False, 'licence': 'CC BY 4.0',
        'about': "Kyutai's small, natural model — faster than real time on a processor. Its speed cannot be changed.",
    },
}


def vctk_speakers():
    rows = {}
    for line in open(os.path.join(ROOT, 'scripts', 'data', 'vctk-speaker-info.txt'), encoding='utf-8').read().splitlines()[1:]:
        p = line.split()
        if len(p) >= 4:
            # the region without the list's remarks in brackets ("(Text and mic2 files unavailable)")
            rows[p[0]] = {'age': p[1], 'sex': p[2].lower(), 'accent': p[3], 'region': re.sub(r'\s*\(.*', '', ' '.join(p[4:])).strip()}
    return rows


ACCENT_GROUP = {'Indian': 'in', 'American': 'us', 'English': 'uk', 'Scottish': 'uk', 'Irish': 'uk', 'NorthernIrish': 'uk',
                'Welsh': 'uk', 'British': 'uk', 'Canadian': 'world', 'SouthAfrican': 'world', 'Australian': 'world',
                'NewZealand': 'world', 'Unknown': 'any'}
ACCENT_WORD = {'NorthernIrish': 'Northern Irish', 'SouthAfrican': 'South African', 'NewZealand': 'New Zealand'}
SEX = {'f': 'woman', 'm': 'man'}

# L2-ARCTIC: 24 speakers of English as a second language (Zhao et al. 2018), first language and sex
L2 = {'ABA': ('Arabic', 'm'), 'SKA': ('Arabic', 'f'), 'YBAA': ('Arabic', 'm'), 'ZHAA': ('Arabic', 'f'),
      'BWC': ('Mandarin', 'm'), 'LXC': ('Mandarin', 'f'), 'NCC': ('Mandarin', 'f'), 'TXHC': ('Mandarin', 'm'),
      'ASI': ('Hindi', 'm'), 'RRBI': ('Hindi', 'm'), 'SVBI': ('Hindi', 'f'), 'TNI': ('Hindi', 'f'),
      'HJK': ('Korean', 'f'), 'HKK': ('Korean', 'm'), 'YDCK': ('Korean', 'f'), 'YKWK': ('Korean', 'm'),
      'EBVS': ('Spanish', 'm'), 'ERMS': ('Spanish', 'm'), 'MBMPS': ('Spanish', 'f'), 'NJS': ('Spanish', 'f'),
      'HQTV': ('Vietnamese', 'm'), 'PNV': ('Vietnamese', 'f'), 'THV': ('Vietnamese', 'f'), 'TLV': ('Vietnamese', 'm')}
# CMU ARCTIC: the seven speakers its documentation describes; the other eleven of Piper's model are not described there
ARCTIC = {'awb': ('uk', 'm', 'Scottish English'), 'bdl': ('us', 'm', 'American English'), 'clb': ('us', 'f', 'American English'),
          'jmk': ('world', 'm', 'Canadian English'), 'ksp': ('in', 'm', 'Indian English'), 'rms': ('us', 'm', 'American English'),
          'slt': ('us', 'f', 'American English')}

# single-speaker Piper voices: (group, sex, words for the label, licence, personal use only)
PIPER_ONE = {
    'en_GB-alan': ('uk', 'm', 'Alan', 'Mycroft mimic3 voice (see its card)', False),
    'en_GB-alba': ('uk', 'f', 'Alba — Scottish English', 'CC BY 4.0', False),
    'en_GB-cori': ('uk', 'f', 'Cori — British English (LibriVox reader)', 'public domain / CC BY 4.0', False),
    'en_GB-jenny_dioco': ('uk', 'f', 'Jenny', 'see the Jenny dataset', False),
    'en_GB-northern_english_male': ('uk', 'm', 'Northern English', 'CC BY-SA 4.0', False),
    'en_GB-southern_english_female': ('uk', 'f', 'Southern English', 'CC BY-SA 4.0', False),
    'en_US-amy': ('us', 'f', 'Amy', 'Mycroft mimic3 voice (see its card)', False),
    'en_US-bryce': ('us', 'm', 'Bryce', 'public domain', False),
    'en_US-danny': ('us', 'm', 'Danny', 'Mycroft mimic3 voice (see its card)', False),
    'en_US-hfc_female': ('us', 'f', 'Hi-Fi Captain (woman)', 'CC BY-NC-SA 4.0', True),
    'en_US-hfc_male': ('us', 'm', 'Hi-Fi Captain (man)', 'CC BY-NC-SA 4.0', True),
    'en_US-hifi_tts_92': ('us', 'f', 'Hi-Fi TTS reader 92', 'CC BY 4.0', False),
    'en_US-joe': ('us', 'm', 'Joe', 'CC0', False),
    'en_US-john': ('us', 'm', 'John (LibriVox reader)', 'public domain', False),
    'en_US-kathleen': ('us', 'f', 'Kathleen', 'CC0', False),
    'en_US-kristin': ('us', 'f', 'Kristin (LibriVox reader)', 'public domain', False),
    'en_US-kusal': ('any', 'm', 'Kusal (Mycroft)', 'Mycroft mimic2 voice (see its card)', False),
    'en_US-lessac': ('us', 'f', 'Lessac', 'Blizzard 2013 Lessac licence (see its card)', False),
    'en_US-ljspeech': ('us', 'f', 'LJ Speech', 'public domain', False),
    'en_US-mike': ('us', 'm', 'Mike', 'CC0', False),
    'en_US-norman': ('us', 'm', 'Norman (LibriVox reader)', 'public domain', False),
    'en_US-reza_ibrahim': ('any', 'm', 'Reza Ibrahim', 'CC0', False),
    'en_US-ryan': ('us', 'm', 'Ryan', 'CC BY-NC-SA 4.0', True),
    'en_US-sam': ('us', 'n', 'Sam (a non-binary voice)', 'Apache-2.0', False),
}
SEMAINE = {'prudence': 'f', 'spike': 'm', 'obadiah': 'm', 'poppy': 'f'}


def piper():
    models, voices = {}, []
    index = json.loads(get(f'https://huggingface.co/{PIPER_REPO}/resolve/{PIPER_REV}/voices.json', 'piper-voices.json'))
    vctk = vctk_speakers()
    for key, v in sorted(index.items()):
        if not key.startswith('en_') or v['num_speakers'] > 200:
            continue  # LibriTTS (904 readers, accents not described) left out
        onnx = next(p for p in v['files'] if p.endswith('.onnx'))
        name, quality = key.rsplit('-', 1)
        mid = f'piper-{key}'
        models[mid] = {'engine': 'piper', 'repo': PIPER_REPO, 'rev': PIPER_REV, 'file': onnx, 'page': 'https://rhasspy.github.io/piper-samples/',
                       'mb': mb(sum(f['size_bytes'] for p, f in v['files'].items() if not p.endswith('MODEL_CARD'))),
                       'name': f'Piper {name.split("-", 1)[1].replace("_", " ")} ({quality})'}
        q = '' if quality == 'medium' else f' · {quality} quality'
        if v['num_speakers'] == 1:
            g, sex, label, lic, nc = PIPER_ONE[name]
            models[mid].update({'licence': lic, 'personal': nc})
            voices.append({'id': f'piper-{key.lower()}', 'label': f'{label}{q}', 'group': g, 'sex': sex, 'model': mid})
            continue
        ids = v['speaker_id_map']
        if name == 'en_GB-vctk':
            models[mid].update({'licence': 'CC BY 4.0 (VCTK)', 'personal': False, 'name': 'Piper VCTK (109 speakers)'})
            for spk, n in sorted(ids.items()):
                s = vctk[spk]
                acc = ACCENT_WORD.get(s['accent'], s['accent'])
                where = f', {s["region"]}' if s['region'] else ''
                voices.append({'id': f'piper-vctk-{spk}', 'label': f'VCTK {spk} — {SEX[s["sex"]]}, {s["age"]}, {acc}{where}',
                               'group': ACCENT_GROUP[s['accent']], 'sex': s['sex'], 'model': mid, 'speaker': n})
        elif name == 'en_US-l2arctic':
            models[mid].update({'licence': 'CC BY-NC 4.0 (L2-ARCTIC)', 'personal': True, 'name': 'Piper L2-ARCTIC (24 speakers)'})
            for spk, n in sorted(ids.items()):
                l1, sex = L2[spk]
                voices.append({'id': f'piper-l2arctic-{spk.lower()}', 'label': f'L2-ARCTIC {spk} — {SEX[sex]}, first language {l1}',
                               'group': 'in' if l1 == 'Hindi' else 'world', 'sex': sex, 'model': mid, 'speaker': n})
        elif name == 'en_US-arctic':
            models[mid].update({'licence': 'CMU ARCTIC licence (free use, see its card)', 'personal': False, 'name': 'Piper CMU ARCTIC (18 speakers)'})
            for spk, n in sorted(ids.items()):
                g, sex, acc = ARCTIC.get(spk, ('any', '', 'accent not documented'))
                voices.append({'id': f'piper-arctic-{spk}', 'label': f'CMU ARCTIC {spk} — {SEX.get(sex, "speaker")}, {acc}',
                               'group': g, 'sex': sex, 'model': mid, 'speaker': n})
        elif name == 'en_GB-aru':
            models[mid].update({'licence': 'CC BY 4.0 (ARU speech corpus, University of Liverpool)', 'personal': False, 'name': 'Piper ARU (12 speakers)'})
            for spk, n in sorted(ids.items()):
                voices.append({'id': f'piper-aru-{spk}', 'label': f'ARU speaker {spk} — British English', 'group': 'uk', 'sex': '', 'model': mid, 'speaker': n})
        elif name == 'en_GB-semaine':
            models[mid].update({'licence': 'CC BY-NC-SA 4.0 (DFKI SEMAINE)', 'personal': True, 'name': 'Piper SEMAINE (4 speakers)'})
            for spk, n in sorted(ids.items()):
                voices.append({'id': f'piper-semaine-{spk}', 'label': f'SEMAINE {spk.title()} — {SEX[SEMAINE[spk]]}, British English',
                               'group': 'uk', 'sex': SEMAINE[spk], 'model': mid, 'speaker': n})
        else:
            sys.exit(f'Piper voice {key} with {v["num_speakers"]} speakers is not described here')
    return models, voices


def kokoro():
    md = get(f'https://huggingface.co/{KOKORO_REPO}/resolve/{KOKORO_REV}/VOICES.md', 'kokoro-VOICES.md').decode()
    t = tree(KOKORO_REPO, KOKORO_REV)
    base = t['kokoro-v1_0.pth'] + t['config.json'] + size_of(SPACY_REPO, SPACY_REV, ['config.cfg', 'meta.json', 'tokenizer', '*/*', '*/*/*'])
    models = {'kokoro': {'engine': 'kokoro', 'repo': KOKORO_REPO, 'rev': KOKORO_REV, 'file': 'kokoro-v1_0.pth', 'mb': mb(base + 32 * 523425), 'page': 'https://huggingface.co/spaces/hexgrad/Kokoro-TTS',
                         'licence': 'Apache-2.0', 'personal': False, 'name': 'Kokoro-82M v1.0'}}
    voices = []
    for m in re.finditer(r'^\| \**([abh][fm])\\?_(\w+?)\** \|[^|]*\|([^|]*)\|[^|]*\|\s*\**([A-F][+-]?)\**\s*\|', md, re.M):
        pre, name, grade = m.group(1), m.group(2), m.group(4)
        vid, sex = f'{pre}_{name}', 'f' if pre[1] == 'f' else 'm'
        title = name.title()
        if pre[0] in 'ab':
            voices.append({'id': f'kokoro-{vid}', 'label': f'{title} — {SEX[sex]} (Kokoro’s grade {grade})',
                           'group': 'us' if pre[0] == 'a' else 'uk', 'sex': sex, 'model': 'kokoro', 'voice': vid})
        else:
            # Kokoro's Hindi voices reading English: with the American or the British reading of the words, or with
            # eSpeak NG's Hindi rules (the pipeline of the Hindi voices)
            for lang, how in (('a', 'American reading of the words'), ('b', 'British reading of the words'), ('h', 'Hindi reading rules (eSpeak NG)')):
                voices.append({'id': f'kokoro-{vid}-{lang}', 'label': f'{title} — {SEX[sex]}, Kokoro’s Hindi voice, {how}',
                               'group': 'in', 'sex': sex, 'model': 'kokoro', 'voice': vid, 'lang': lang})
    if len(voices) != 28 + 12:
        sys.exit(f'Kokoro: {len(voices)} voices read from VOICES.md, expected 40')
    # goonj-1-82M (BH-Builds, Apache-2.0): Kokoro-82M trained further on Indian speakers — Indian English, Hindi and
    # Hinglish; its card: "en_*" personas are Indian English speakers, "hi_*" Hindi natives, all read English with
    # Kokoro's American English reading of the words
    g = tree(GOONJ_REPO, GOONJ_REV)
    models['goonj'] = {'engine': 'kokoro', 'repo': GOONJ_REPO, 'rev': GOONJ_REV, 'file': 'kokoro_hindi_final.pth',
                       'mb': mb(g['kokoro_hindi_final.pth'] + g['config.json'] + base - t['kokoro-v1_0.pth'] - t['config.json'] + 14 * 523824),
                       'licence': 'Apache-2.0', 'personal': False, 'name': 'goonj-1-82M (Kokoro trained on Indian voices)',
                       'page': f'https://huggingface.co/{GOONJ_REPO}'}
    for name, sex in GOONJ:
        if f'voices/{name}.pt' not in g:
            sys.exit(f'goonj: voices/{name}.pt is not in {GOONJ_REPO} at {GOONJ_REV}')
        kind = 'Indian English speaker' if name.startswith('en_') else 'Hindi-native speaker, reading English'
        who = f'{SEX[sex]}, {kind}' if sex else f'{kind}, a high voice'
        voices.append({'id': f'goonj-{name.replace("_", "-")}', 'label': f'{name[3:].title()} — {who}',
                       'group': 'in', 'sex': sex, 'model': 'goonj', 'voice': name, 'lang': 'a'})
    return models, voices


# goonj-1-82M's personas (its card names them only). The sex from the name, checked against the pitch of a sample made
# here (median F0 by pYIN): sameer 101 Hz, atul 155, dev 177, arjun 182, aman 184, ravi 188 — men; divya 177, tara 251,
# priya 253, shivani 241, meera 269, ananya 282, nisha 320 — women; kabir 282 Hz — a man's name with a woman's pitch, so
# its sex is left unsaid and its label says it is a high voice.
GOONJ = [('en_aman', 'm'), ('en_ananya', 'f'), ('en_arjun', 'm'), ('en_dev', 'm'), ('en_divya', 'f'), ('en_kabir', ''),
         ('en_nisha', 'f'), ('en_priya', 'f'), ('en_sameer', 'm'), ('en_tara', 'f'),
         ('hi_atul', 'm'), ('hi_meera', 'f'), ('hi_ravi', 'm'), ('hi_shivani', 'f')]


# Indic Parler-TTS: its card's English speakers ("officially supports Indian English accents through its English
# voices"); Thoma and Mary are the ones it recommends
INDIC_EN = [('Thoma', 'm'), ('Mary', 'f'), ('Swapna', 'f'), ('Dinesh', 'm'), ('Meera', 'f'), ('Jatin', 'm'), ('Aakash', 'm'),
            ('Sneha', 'f'), ('Kabir', 'm'), ('Tisha', 'f'), ('Chingkhei', 'f'), ('Thoibi', 'f'), ('Priya', 'f'), ('Tarun', 'm'),
            ('Gauri', 'f'), ('Nisha', 'f'), ('Raghav', 'm'), ('Kavya', 'f'), ('Ravi', 'm'), ('Vikas', 'm'), ('Riya', 'f')]
# Parler-TTS v1: the 34 speakers of its card (LibriTTS-R and MLS readers; accents not documented)
PARLER_34 = [('Laura', 'f'), ('Gary', 'm'), ('Jon', 'm'), ('Lea', 'f'), ('Karen', 'f'), ('Rick', 'm'), ('Brenda', 'f'), ('David', 'm'),
             ('Eileen', 'f'), ('Jordan', 'm'), ('Mike', 'm'), ('Yann', 'm'), ('Joy', 'f'), ('James', 'm'), ('Eric', 'm'), ('Lauren', 'f'),
             ('Rose', 'f'), ('Will', 'm'), ('Jason', 'm'), ('Aaron', 'm'), ('Naomie', 'f'), ('Alisa', 'f'), ('Patrick', 'm'), ('Jerry', 'm'),
             ('Tina', 'f'), ('Jenna', 'f'), ('Bill', 'm'), ('Tom', 'm'), ('Carol', 'f'), ('Barbara', 'f'), ('Rebecca', 'f'), ('Anna', 'f'),
             ('Bruce', 'm'), ('Emily', 'f')]
CONSISTENT = {'large': {'Will', 'Eric', 'Laura', 'Alisa', 'Patrick'}, 'mini': {'Jon', 'Lea', 'Gary', 'Jenna', 'Mike'}}
PARLER_FILES = ['config.json', 'generation_config.json', 'preprocessor_config.json', '*.safetensors', '*.safetensors.index.json',
                'tokenizer*', 'spiece.model', 'special_tokens_map.json']


def parler():
    t5 = size_of(T5_TOK[0], T5_TOK[1], ['tokenizer*', 'spiece.model', 'special_tokens_map.json', 'config.json'])
    models = {
        'indic-parler': {'engine': 'parler', 'repo': INDIC_REPO, 'rev': INDIC_REV, 'descTokenizer': T5_TOK, 'gated': True, 'page': 'https://huggingface.co/spaces/ai4bharat/indic-parler-tts',
                         'mb': mb(size_of(INDIC_REPO, INDIC_REV, PARLER_FILES) + t5), 'licence': 'Apache-2.0', 'personal': False,
                         'name': 'Indic Parler-TTS (AI4Bharat)'},
        'parler-large': {'engine': 'parler', 'repo': LARGE_REPO, 'rev': LARGE_REV, 'page': f'https://huggingface.co/{LARGE_REPO}',
                         'mb': mb(size_of(LARGE_REPO, LARGE_REV, PARLER_FILES)), 'licence': 'Apache-2.0', 'personal': False,
                         'name': 'Parler-TTS Large v1'},
        'parler-mini': {'engine': 'parler', 'repo': MINI_REPO, 'rev': MINI_REV, 'descTokenizer': T5_TOK, 'page': f'https://huggingface.co/{MINI_REPO}',
                        'mb': mb(size_of(MINI_REPO, MINI_REV, PARLER_FILES) + t5), 'licence': 'Apache-2.0', 'personal': False,
                        'name': 'Parler-TTS Mini v1.1'},
    }
    voices = []
    for name, sex in INDIC_EN:
        rec = ' (recommended by AI4Bharat)' if name in ('Thoma', 'Mary') else ''
        voices.append({'id': f'indic-parler-{name.lower()}', 'label': f'{name} — {SEX[sex]}{rec}', 'group': 'in', 'sex': sex,
                       'model': 'indic-parler',
                       'describe': f"{name} speaks {{pace}} with a clear, expressive voice, in a very close recording that has almost no background noise."})
    for key, mid in (('large', 'parler-large'), ('mini', 'parler-mini')):
        for name, sex in PARLER_34:
            steady = ' (one of its steadiest voices)' if name in CONSISTENT[key] else ''
            voices.append({'id': f'parler-{key}-{name.lower()}', 'label': f'{name} — {SEX[sex]}{steady}', 'group': 'any', 'sex': sex,
                           'model': mid,
                           'describe': f"{name}'s voice is clear and expressive, speaking {{pace}}, with very clear audio and no background noise."})
    return models, voices


# XTTS-v2's studio voices: their names say nothing reliable about the voice (made-up names), so each voice is
# described by the median pitch of a sample made here (pYIN, "This is how my voice sounds when I read aloud."):
# 75 – 121 Hz a deeper voice (sex 'm'), 177 – 235 Hz a higher one ('f'), 126 – 173 Hz left unsaid.
XTTS_PITCH = {'Aaron Dreschner': 98, 'Abrahan Mack': 94, 'Adde Michal': 98, 'Alexandra Hisakawa': 183, 'Alison Dietlinde': 216, 'Alma María': 216, 'Ana Florence': 136, 'Andrew Chipper': 213, 'Annmarie Nele': 192, 'Asya Anara': 168, 'Badr Odhiambo': 225, 'Baldur Sanjin': 89, 'Barbora MacLean': 201, 'Brenda Stern': 196, 'Camilla Holmström': 205, 'Chandra MacFarland': 203, 'Claribel Dervla': 126, 'Craig Gutsy': 177, 'Daisy Studious': 235, 'Damien Black': 75, 'Damjan Chapman': 96, 'Dionisio Schuyler': 78, 'Eugenio Mataracı': 116, 'Ferran Simen': 103, 'Filip Traverse': 101, 'Gilberto Mathias': 100, 'Gitta Nikolina': 189, 'Gracie Wise': 190, 'Henriette Usha': 188, 'Ige Behringer': 120, 'Ilkin Urbano': 101, 'Kazuhiko Atallah': 108, 'Kumar Dahl': 86, 'Lidiya Szekeres': 202, 'Lilya Stainthorpe': 192, 'Ludvig Milivoj': 101, 'Luis Moray': 103, 'Maja Ruoho': 208, 'Marcos Rudaski': 121, 'Narelle Moon': 211, 'Nova Hogarth': 164, 'Rosemary Okafor': 210, 'Royston Min': 100, 'Sofia Hellen': 142, 'Suad Qasim': 184, 'Szofi Granger': 204, 'Tammie Ema': 173, 'Tammy Grit': 138, 'Tanja Adelina': 161, 'Torcull Diarmuid': 107, 'Uta Obando': 207, 'Viktor Eka': 92, 'Viktor Menelaos': 116, 'Vjollca Johnnie': 150, 'Wulf Carlevaro': 138, 'Xavier Hayasaka': 107, 'Zacharie Aimilios': 106, 'Zofija Kendrick': 219}
XTTS_STUDIO = ['Claribel Dervla', 'Daisy Studious', 'Gracie Wise', 'Tammie Ema', 'Alison Dietlinde', 'Ana Florence',
               'Annmarie Nele', 'Asya Anara', 'Brenda Stern', 'Gitta Nikolina', 'Henriette Usha', 'Sofia Hellen',
               'Tammy Grit', 'Tanja Adelina', 'Vjollca Johnnie', 'Andrew Chipper', 'Badr Odhiambo',
               'Dionisio Schuyler', 'Royston Min', 'Viktor Eka', 'Abrahan Mack', 'Adde Michal', 'Baldur Sanjin',
               'Craig Gutsy', 'Damien Black', 'Gilberto Mathias', 'Ilkin Urbano', 'Kazuhiko Atallah',
               'Ludvig Milivoj', 'Suad Qasim', 'Torcull Diarmuid', 'Viktor Menelaos', 'Zacharie Aimilios',
               'Nova Hogarth', 'Maja Ruoho', 'Uta Obando', 'Lidiya Szekeres', 'Chandra MacFarland', 'Szofi Granger',
               'Camilla Holmström', 'Lilya Stainthorpe', 'Zofija Kendrick', 'Narelle Moon', 'Barbora MacLean',
               'Alexandra Hisakawa', 'Alma María', 'Rosemary Okafor', 'Ige Behringer', 'Filip Traverse',
               'Damjan Chapman', 'Wulf Carlevaro', 'Aaron Dreschner', 'Kumar Dahl', 'Eugenio Mataracı',
               'Ferran Simen', 'Xavier Hayasaka', 'Luis Moray', 'Marcos Rudaski']
# The voice donations (CC0) of kyutai/tts-voices whose names say India — the first Indian recordings the engines that
# clone were given (their voice ids stay as they were: xtts-clip-imran …); the sex as heard.
NAMED_DONATIONS = [('Imran', 'voice-donations/Imran_from_I_India_enhanced.wav', 'm'),
                   ('Indian guy', 'voice-donations/Indian_guy_enhanced.wav', 'm'),
                   ('Marshal', 'voice-donations/Marshal_Indian_enhanced.wav', 'm'),
                   ('Siddh', 'voice-donations/Siddh_Indian_enhanced.wav', 'm'),
                   ('Vinith', 'voice-donations/Vinith___English_India_enhanced.wav', 'm')]


def xtts():
    t = tree(XTTS_REPO, XTTS_REV)
    need = ['config.json', 'model.pth', 'vocab.json', 'speakers_xtts.pth', 'mel_stats.pth', 'LICENSE.txt']
    models = {'xtts': {'engine': 'xtts', 'repo': XTTS_REPO, 'rev': XTTS_REV, 'mb': mb(sum(t[f] for f in need)), 'page': f'https://huggingface.co/{XTTS_REPO}',
                       'licence': 'Coqui Public Model License — non-commercial use only', 'personal': True, 'accept': 'cpml',
                       'name': 'XTTS-v2 (Coqui)'}}

    def studio(n):
        hz = XTTS_PITCH[n]
        sex = 'm' if hz <= 125 else 'f' if hz >= 175 else ''
        how = {'m': 'a deeper voice', 'f': 'a higher voice', '': 'a middle voice'}[sex]
        return {'id': 'xtts-' + re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-'), 'label': f'{n} — studio voice, {how}', 'group': 'any',
                'sex': sex, 'model': 'xtts', 'speaker': n}
    if set(XTTS_PITCH) != set(XTTS_STUDIO):
        sys.exit('XTTS_PITCH must have every studio voice')
    voices = [studio(n) for n in XTTS_STUDIO] + clip_voices('xtts', 'xtts')
    return models, voices


# Pocket TTS 4.0.1's English voices and the recordings they were made from (pocket_tts/utils/utils.py)
POCKET = {'alba': 'alba-mackenna/casual.wav', 'anna': 'vctk/p228', 'azelma': 'vctk/p303', 'bill_boerst': 'voice-zero', 'caro_davy': 'voice-zero',
          'charles': 'vctk/p254', 'cosette': 'expresso', 'eponine': 'vctk/p262', 'eve': 'vctk/p361', 'fantine': 'vctk/p244', 'george': 'vctk/p315',
          'jane': 'vctk/p339', 'jean': 'ears', 'javert': 'voice-donations', 'marius': 'voice-donations', 'mary': 'vctk/p333', 'michael': 'vctk/p360',
          'paul': 'vctk/p259', 'peter_yearsley': 'voice-zero', 'stuart_bell': 'voice-zero', 'vera': 'vctk/p229'}


# the voices not made from VCTK: the sex by the pitch of a sample made here (median F0 — under 150 Hz a man, above
# 165 Hz a woman; Alba, at 127 Hz, is left unsaid)
POCKET_SEX = {'cosette': 'f', 'caro_davy': 'f', 'javert': 'm', 'jean': 'm', 'marius': 'm', 'bill_boerst': 'm',
              'peter_yearsley': 'm', 'stuart_bell': 'm'}


def pocket():
    t = tree(POCKET_REPO, POCKET_REV)
    models = {'pocket': {'engine': 'pocket', 'repo': POCKET_REPO, 'rev': POCKET_REV, 'page': 'https://kyutai.org/tts',
                         'mb': mb(t['languages/english/model.safetensors'] + t['languages/english/tokenizer.json'] + 21 * 6.5e6),
                         'licence': 'CC BY 4.0', 'personal': False, 'name': 'Pocket TTS (Kyutai)'}}
    vctk = vctk_speakers()
    voices = []
    for name, src in POCKET.items():
        label, group, sex = name.replace('_', ' ').title(), 'any', POCKET_SEX.get(name, '')
        if sex:
            label += f' — {SEX[sex]}'
        if src.startswith('vctk/'):
            label = name.replace('_', ' ').title()
            s = vctk[src[5:]]
            acc = ACCENT_WORD.get(s['accent'], s['accent'])
            label += f' — {SEX[s["sex"]]}, {acc} (from VCTK {src[5:]})'
            group, sex = ACCENT_GROUP[s['accent']], s['sex']
        if f'embeddings_v3/{name}.safetensors' not in t and f'languages/english/embeddings/{name}.safetensors' not in t:
            sys.exit(f'Pocket TTS voice {name} is not in {POCKET_REPO} at {POCKET_REV}')
        voices.append({'id': f'pocket-{name.replace("_", "-")}', 'label': label, 'group': group, 'sex': sex, 'model': 'pocket', 'voice': name})
    return models, voices


# MeloTTS English: the speaker numbers of its config, and the median pitch of a sample made here (pYIN) — all five are
# women's voices (174 – 274 Hz)
MELO = [('en-india', 2, 'in', 'Indian English', 274), ('en-us', 0, 'us', 'American English', 239),
        ('en-br', 1, 'uk', 'British English', 243), ('en-au', 3, 'world', 'Australian English', 205),
        ('en-default', 4, 'any', 'its default English voice', 174)]


def melo():
    size = size_of(MELO_REPO, MELO_REV, ['model.onnx', 'lexicon.txt', 'tokens.txt', 'LICENSE'])
    models = {'melo': {'engine': 'melo', 'repo': MELO_REPO, 'rev': MELO_REV, 'mb': mb(size), 'licence': 'MIT', 'personal': False,
                       'name': 'MeloTTS English (MyShell)', 'page': 'https://huggingface.co/myshell-ai/MeloTTS-English'}}
    voices = [{'id': f'melo-{k}', 'label': f'MeloTTS {acc} — woman', 'group': g, 'sex': 'f', 'model': 'melo', 'speaker': n}
              for k, n, g, acc, _ in MELO]
    return models, voices


# Supertonic's voices: F1 – F5 women, M1 – M5 men, as the makers name them — the median pitch of a sample of every voice of
# the three models made here agrees (pYIN: F 157 – 224 Hz, M 85 – 147 Hz). Their accents are not documented.
def supertonic():
    models, voices = {}, []
    for mid, repo, rev, name in SUPERTONIC:
        t = tree(repo, rev)
        files = [f for f in t if f in ('config.json', 'LICENSE') or f.startswith('onnx/') or re.fullmatch(r'voice_styles/[FM][1-5]\.json', f)]
        if sum(1 for f in files if f.startswith('voice_styles/')) != 10:
            sys.exit(f'{repo} at {rev}: expected ten voices')
        models[mid] = {'engine': 'supertonic', 'repo': repo, 'rev': rev, 'mb': mb(sum(t[f] for f in files)), 'licence': 'OpenRAIL-M',
                       'personal': False, 'name': name, 'page': f'https://huggingface.co/{repo}'}
        for sex in 'FM':
            for i in range(1, 6):
                voices.append({'id': f'{mid}-{sex.lower()}{i}', 'label': f'{name.split(" (")[0]} {sex}{i} — {SEX[sex.lower()]}',
                               'group': 'any', 'sex': sex.lower(), 'model': mid, 'voice': f'{sex}{i}'})
    return models, voices


def indictiny():
    size = size_of(TINY_REPO, TINY_REV, ['config.json', 'LICENSE.md', 'pyproject.toml', 'indic_tiny_tts/*', 'onnx/*'])
    models = {'indictiny': {'engine': 'indictiny', 'repo': TINY_REPO, 'rev': TINY_REV, 'mb': mb(size), 'licence': 'CC BY 4.0',
                            'personal': False, 'name': 'Indic Tiny TTS: Indian English', 'page': f'https://huggingface.co/{TINY_REPO}'}}
    # the two speakers of IISc's LIMMITS 2024 English set; pitch of a sample made here: 199 Hz and 169 Hz
    voices = [{'id': 'indictiny-female', 'label': 'Indic Tiny — woman, Indian English (IISc SYSPIN speaker)', 'group': 'in', 'sex': 'f',
               'model': 'indictiny', 'voice': 'female'},
              {'id': 'indictiny-male', 'label': 'Indic Tiny — man, Indian English (IISc SYSPIN speaker)', 'group': 'in', 'sex': 'm',
               'model': 'indictiny', 'voice': 'male'}]
    return models, voices


# Qwen3-TTS CustomVoice: its nine speakers as the qwen-tts readme describes them (native language; each speaks English).
# Run here (0.6B): their pitch agrees with the readme's sex (women 207 – 265 Hz, men 109 – 171 Hz); in English the accent
# model hears mostly American for all but Sohee and Eric — not documented, so only Aiden ("American") is filed by accent.
QWEN_SPEAKERS = [('Aiden', 'm', 'us', 'sunny American man, clear midrange'), ('Ryan', 'm', 'any', 'dynamic man, strong rhythm (native English)'),
                 ('Vivian', 'f', 'any', 'bright, slightly edgy young woman (native Chinese)'), ('Serena', 'f', 'any', 'warm, gentle young woman (native Chinese)'),
                 ('Uncle_Fu', 'm', 'any', 'seasoned man, low and mellow (native Chinese)'), ('Dylan', 'm', 'any', 'youthful Beijing man (native Chinese)'),
                 ('Eric', 'm', 'any', 'lively Chengdu man, slightly husky (native Chinese)'), ('Ono_Anna', 'f', 'any', 'playful Japanese woman (native Japanese)'),
                 ('Sohee', 'f', 'any', 'warm Korean woman (native Korean)')]
# Qwen3-TTS VoiceDesign: voices described in words (ours) by sex, age and manner. Tested here (21 Nov 2026): it speaks
# them clearly and the pitch follows the sex asked for, but in English it gives no accent asked for — descriptions of a
# light, a mild and a strong Indian accent, of a South Indian one and of RP all came out North American to the accent
# model (SpeechBrain CommonAccent: US or Canada first for all ten). So no accent is promised; like every voice whose
# accent its makers do not document, they are filed under "accent not documented", the label saying what the test heard.
QWEN_DESIGN = [
    ('woman-young', 'f', 'young woman, bright and friendly', 'A young woman in her twenties with a bright, clear and friendly voice, like a podcast host; a clean studio recording.'),
    ('man-young', 'm', 'young man, clear and energetic', 'A young man in his twenties with a clear, friendly and energetic voice, like a podcast host; a clean studio recording.'),
    ('woman-narrator', 'f', 'woman in her thirties, warm narrator', 'A woman in her thirties with a warm, natural voice, like an audiobook narrator; a clean studio recording.'),
    ('man-narrator', 'm', 'man in his thirties, warm narrator', 'A man in his thirties with a warm, natural voice, like an audiobook narrator; a clean studio recording.'),
    ('woman-presenter', 'f', 'woman in her forties, calm presenter', 'A woman in her forties with a calm, confident and clear voice, like a radio presenter; a clean studio recording.'),
    ('man-presenter', 'm', 'man in his forties, deep presenter', 'A man in his forties with a calm, deep and clear voice, like a radio presenter; a clean studio recording.'),
    ('woman-older', 'f', 'woman in her sixties, gentle and measured', 'A woman in her sixties with a gentle, measured and warm voice, like a teacher reading aloud; a clean studio recording.'),
    ('man-older', 'm', 'man in his sixties, documentary narrator', 'A man in his sixties with a deep, calm and measured voice, like a documentary narrator; a clean studio recording.'),
    ('woman-news', 'f', 'woman, crisp newsreader', 'A woman in her thirties with a crisp, formal and precise voice, like a newsreader; a clean studio recording.'),
    ('man-news', 'm', 'man, crisp newsreader', 'A man in his thirties with a crisp, formal and precise voice, like a newsreader; a clean studio recording.'),
    ('woman-soft', 'f', 'young woman, soft and soothing', 'A young woman with a soft, gentle and soothing voice, like a bedtime story; a clean studio recording.'),
    ('man-soft', 'm', 'man, soft and soothing', 'A man with a soft, low and soothing voice, like a meditation guide; a clean studio recording.'),
]


def qwen():
    pat = ['*.json', '*.txt', '*.safetensors', 'speech_tokenizer/*']
    models, voices = {}, []
    mid, repo, rev, name = QWEN_VD
    models[mid] = {'engine': 'qwen', 'repo': repo, 'rev': rev, 'mb': mb(size_of(repo, rev, pat)), 'licence': 'Apache-2.0', 'personal': False,
                   'name': name, 'page': f'https://huggingface.co/{repo}'}
    for key, sex, label, describe in QWEN_DESIGN:
        voices.append({'id': f'qwen-design-{key}', 'label': f'{label.capitalize()} (a voice described in words; sounds North American)', 'group': 'any',
                       'sex': sex, 'model': mid, 'describe': describe})
    for mid, repo, rev, name in QWEN:
        models[mid] = {'engine': 'qwen', 'repo': repo, 'rev': rev, 'mb': mb(size_of(repo, rev, pat)), 'licence': 'Apache-2.0', 'personal': False,
                       'name': name, 'page': f'https://huggingface.co/{repo}'}
        for sp, sex, g, words in QWEN_SPEAKERS:
            voices.append({'id': f'{mid.replace(".", "")}-{sp.lower().replace("_", "-")}', 'label': f'{sp.replace("_", " ")} — {words}',
                           'group': g, 'sex': sex, 'model': mid, 'speaker': sp})
    return models, voices


# OmniVoice: voices made of its own words (omnivoice/utils/voice_design.py) — sex, age and an English accent. Run here
# (21 Nov 2026, eight of them): the accent comes through — the accent model put Indian first for three of the four Indian
# voices (third for the older man), Australian, British and American first for theirs (the Canadian: US, then Canada);
# pitch follows the sex asked for (women 187 – 232 Hz, men 102 – 146 Hz); Whisper read every one back.
OMNI_MAIN = [('indian', 'in', 'Indian'), ('american', 'us', 'American'), ('british', 'uk', 'British'),
             ('australian', 'world', 'Australian'), ('canadian', 'world', 'Canadian')]
OMNI_OTHER = [('chinese', 'Chinese'), ('japanese', 'Japanese'), ('korean', 'Korean'), ('russian', 'Russian'), ('portuguese', 'Portuguese')]
OMNI_AGES = [('young adult', 'young'), ('middle-aged', 'middle-aged'), ('elderly', 'older')]


def omnivoice():
    size = size_of(OMNI_REPO, OMNI_REV, ['config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja', 'audio_tokenizer/*'])
    models = {'omnivoice': {'engine': 'omnivoice', 'repo': OMNI_REPO, 'rev': OMNI_REV, 'mb': mb(size), 'personal': True,
                            'licence': 'CC BY-NC (the model; its audio tokenizer: Boson Higgs Audio 2 Community License)',
                            'name': 'OmniVoice (voices made from a few words)', 'page': f'https://huggingface.co/{OMNI_REPO}'}}
    voices = []
    for acc, g, word in OMNI_MAIN:
        for sx, sex in (('female', 'f'), ('male', 'm')):
            for age, aw in OMNI_AGES:
                voices.append({'id': f'omni-{acc}-{sex}-{aw.replace("-aged", "")}', 'label': f'{word} accent — {aw} {SEX[sex]}', 'group': g, 'sex': sex,
                               'model': 'omnivoice', 'describe': f'{sx}, {age}, {acc} accent'})
    for acc, word in OMNI_OTHER:
        for sx, sex in (('female', 'f'), ('male', 'm')):
            voices.append({'id': f'omni-{acc}-{sex}', 'label': f'{word} accent — young {SEX[sex]}', 'group': 'world', 'sex': sex,
                           'model': 'omnivoice', 'describe': f'{sx}, young adult, {acc} accent'})
    return models, voices


# Bark's presets: the median pitch (pYIN) of each preset's own reference audio — its fine prompt, EnCodec 24 kHz codes,
# decoded with facebook/encodec_24khz (no generation). As for XTTS-v2: a deeper voice (≤ 130 Hz, 'm'), a higher one
# (≥ 200 Hz, 'f'), and between them a middle voice whose sex is left unsaid.
BARK_PITCH = {'en_0': 177, 'en_1': 178, 'en_2': 104, 'en_3': 89, 'en_4': 139, 'en_5': 88, 'en_6': 121, 'en_7': 126, 'en_8': 177, 'en_9': 254,
              'hi_0': 256, 'hi_1': 155, 'hi_2': 109, 'hi_3': 237, 'hi_4': 235, 'hi_5': 98, 'hi_6': 119, 'hi_7': 151, 'hi_8': 161, 'hi_9': 289}
BARK_SEX = {k: 'm' if hz <= 130 else 'f' if hz >= 200 else '' for k, hz in BARK_PITCH.items()}


def bark():
    models, voices = {}, []
    for mid, repo, rev, name in BARK:
        t = tree(repo, rev)
        base = ['config.json', 'generation_config.json', 'pytorch_model.bin', 'tokenizer.json', 'tokenizer_config.json', 'vocab.txt',
                'special_tokens_map.json', 'speaker_embeddings_path.json']
        prompts = [f for f in t if re.fullmatch(r'speaker_embeddings/v2/(en|hi)_speaker_\d_(semantic|coarse|fine)_prompt\.npy', f)]
        if len(prompts) != 60:
            sys.exit(f'{repo}: expected 20 voice presets')
        models[mid] = {'engine': 'bark', 'repo': repo, 'rev': rev, 'mb': mb(sum(t[f] for f in base) + sum(t[f] for f in prompts) / 20), 'licence': 'MIT',
                       'personal': False, 'name': name, 'page': f'https://huggingface.co/{repo}'}
        for lang, g, how in (('hi', 'in', 'Hindi speaker reading English (Indian accent)'), ('en', 'any', 'English speaker')):
            for i in range(10):
                sex = BARK_SEX[f'{lang}_{i}']
                who = {'m': 'man (a deep voice)', 'f': 'woman (a high voice)', '': 'a middle voice'}[sex]
                voices.append({'id': f'{mid}-{lang}-{i}', 'label': f'Preset {lang}_speaker_{i} — {who}, {how}', 'group': g, 'sex': sex,
                               'model': mid, 'voice': f'v2/{lang}_speaker_{i}'})
    return models, voices


# The recordings every engine that takes a voice from a recording is given (owner, 21 Nov 2026: "include as many
# different variants of Indian, US and UK accents as you can"): the five of NAMED_DONATIONS, the other
# Indian voice donations of kyutai/tts-voices (filed as for Kyutai: a donor whose name says India, a recording in an
# Indian language, an Indian accent heard clearly) and VCTK's speakers with the accents of VCTK's list — the
# cleaned ("enhanced") recordings. F5-TTS also needs the words said in each: scripts/data/clip-transcripts.json, from
# scripts/make-clip-transcripts.py (Whisper); it leaves out a recording in another language than English (its
# vocabulary has no other script).
TRANSCRIPTS = os.path.join(ROOT, 'scripts', 'data', 'clip-transcripts.json')


def clone_clips():
    """[{key, file, sex, group, who, lang}] — the recordings for the engines that clone, in their order."""
    clips = tree(CLIPS_REPO, CLIPS_REV)
    recs = json.load(open(HEARD_CLIPS, encoding='utf-8'))['recordings']
    out = []

    def add(key, f, sex, group, who, lang='en'):
        if f not in clips:
            sys.exit(f'{f} is not in {CLIPS_REPO} at {CLIPS_REV}')
        out.append({'key': key, 'file': f, 'sex': sex, 'group': group, 'who': who, 'lang': lang})
    for n, f, sx in NAMED_DONATIONS:
        add(slug(n), f, sx, 'in', f'{n} — {SEX[sx]}, Indian (the donor says so) (voice donation, CC0)')
    have = {c['file'] for c in out}
    for path, rec in sorted(recs.items()):
        if path.startswith('voice-donations/') and path not in have:
            d = donation(path, rec)
            if d['group'] == 'in':
                add('don-' + d['slug'], path, d['sex'], 'in', f'{d["title"]} — {d["how"]}, {d["acc"]} (voice donation, CC0)', d['lang'])
    for spk, r in sorted(vctk_speakers().items()):
        f = f'vctk/{spk}_023_enhanced.wav'
        if f not in clips:
            continue  # a speaker kyutai/tts-voices has no recording of
        where = f', {r["region"]}' if r['region'] else ''
        add('vctk-' + spk, f, r['sex'], ACCENT_GROUP[r['accent']],
            f'VCTK {spk} — {SEX[r["sex"]]}, {r["age"]}, {ACCENT_WORD.get(r["accent"], r["accent"])}{where} (CC BY 4.0)')
    return out


def clip_voices(prefix, mid, word='', transcribed=False):
    """The recordings of clone_clips() as voices of a model that takes a voice from a recording; with `transcribed`, each
    with the words said in it (and only the English ones)."""
    t = json.load(open(TRANSCRIPTS, encoding='utf-8')) if transcribed else {}
    said, cuts = t.get('clips', {}), t.get('cuts', {})
    out = []
    for c in clone_clips():
        v = {'id': f'{prefix}-clip-{c["key"]}', 'label': c['who'] + word, 'group': c['group'], 'sex': c['sex'], 'model': mid,
             'clip': {'repo': CLIPS_REPO, 'rev': CLIPS_REV, 'file': c['file']}}
        if transcribed:
            if c['lang'] != 'en':
                continue
            if not said.get(c['file']):
                sys.exit(f'{c["file"]}: no transcript in {TRANSCRIPTS} — run scripts/make-clip-transcripts.py')
            v['clip']['text'] = said[c['file']]
            if c['file'] in cuts:  # longer than F5's 12 s: cut after a whole word, the transcript ending there
                v['clip']['end'] = cuts[c['file']]
        out.append(v)
    return out


# F5-TTS v1 Base (SWivid; CC BY-NC 4.0 — trained on Emilia) and its vocoder, Vocos 24 kHz (charactr; MIT)
F5_REPO, F5_REV = 'SWivid/F5-TTS', '84e5a410d9cead4de2f847e7c9369a6440bdfaca'
F5_FILES = ['F5TTS_v1_Base/model_1250000.safetensors', 'F5TTS_v1_Base/vocab.txt']
VOCOS_REPO, VOCOS_REV = 'charactr/vocos-mel-24khz', '0feb3fdd929bcd6649e0e7c5a688cf7dd012ef21'


def f5():
    t, voc = tree(F5_REPO, F5_REV), tree(VOCOS_REPO, VOCOS_REV)
    models = {'f5': {'engine': 'f5', 'repo': F5_REPO, 'rev': F5_REV, 'mb': mb(sum(t[f] for f in F5_FILES) + voc['config.yaml'] + voc['pytorch_model.bin']),
                     'licence': 'CC BY-NC 4.0 — personal use (Vocos: MIT)', 'personal': True, 'name': 'F5-TTS v1 Base',
                     'page': f'https://huggingface.co/{F5_REPO}'}}
    return models, clip_voices('f5', 'f5', transcribed=True)


# VibeVoice 1.5B (Microsoft; MIT) and its text tokenizer, Qwen2.5 1.5B's (Apache-2.0)
VIBEVOICE_REPO, VIBEVOICE_REV = 'microsoft/VibeVoice-1.5B', 'c00898d257e6b46004e3e2866a47534085fb685a'
VIBEVOICE_FILES = ['config.json', 'preprocessor_config.json', 'model.safetensors.index.json', 'model-00001-of-00003.safetensors',
                   'model-00002-of-00003.safetensors', 'model-00003-of-00003.safetensors']
QWEN25_REPO, QWEN25_REV = 'Qwen/Qwen2.5-1.5B', '8faed761d45a263340a0528343f099c05c9a4323'
QWEN25_FILES = ['tokenizer.json', 'tokenizer_config.json', 'vocab.json', 'merges.txt']


def vibevoice():
    t, q = tree(VIBEVOICE_REPO, VIBEVOICE_REV), tree(QWEN25_REPO, QWEN25_REV)
    models = {'vibevoice-1.5b': {'engine': 'vibevoice', 'repo': VIBEVOICE_REPO, 'rev': VIBEVOICE_REV,
                                 'mb': mb(sum(t[f] for f in VIBEVOICE_FILES) + sum(q[f] for f in QWEN25_FILES)),
                                 'licence': 'MIT (Microsoft’s card: for research and development); Qwen2.5’s tokenizer Apache-2.0',
                                 'personal': False, 'name': 'VibeVoice 1.5B (Microsoft)', 'page': f'https://huggingface.co/{VIBEVOICE_REPO}'}}
    return models, clip_voices('vibevoice', 'vibevoice-1.5b')


def chatterbox():
    models, voices = {}, []
    for mid, repo, rev, name, files in CHATTERBOX:
        t = tree(repo, rev)
        models[mid] = {'engine': 'chatterbox', 'repo': repo, 'rev': rev, 'mb': mb(sum(t[f] for f in files)), 'licence': 'MIT', 'personal': False,
                       'name': name, 'page': f'https://huggingface.co/{repo}'}
        voices.append({'id': f'{mid}-default', 'label': f'{name.split(" (")[0]}’s own voice', 'group': 'any', 'sex': CHATTERBOX_SEX.get(mid, ''),
                       'model': mid})
        voices += clip_voices(mid, mid, '')
    return models, voices


# the sex of the Chatterbox models' own voices by pitch (filled in when measured)
CHATTERBOX_SEX = {}


def veena():
    t = tree(VEENA_REPO, VEENA_REV)
    files = [f for f in t if f.endswith(('.json', '.safetensors', '.jinja'))]
    snac = tree(SNAC_REPO, SNAC_REV)
    models = {'veena': {'engine': 'veena', 'repo': VEENA_REPO, 'rev': VEENA_REV, 'mb': mb(sum(t[f] for f in files) + snac['config.json'] + snac['pytorch_model.bin']),
                        'licence': 'Apache-2.0 (SNAC: MIT)', 'personal': False, 'name': 'Veena (Maya Research)', 'page': f'https://huggingface.co/{VEENA_REPO}'}}
    # the card names the four speakers only (not their sex)
    voices = [{'id': f'veena-{n}', 'label': f'{n.title()} — Indian voice (Veena)', 'group': 'in', 'sex': '', 'model': 'veena', 'voice': n}
              for n in ('kavya', 'agastya', 'maitri', 'vinaya')]
    return models, voices


VOX_DESIGN = [
    ('in-woman-young', 'in', 'f', 'Indian English, light accent — young woman', 'A young Indian woman with a light, neutral Indian English accent, clear, warm and articulate'),
    ('in-man-young', 'in', 'm', 'Indian English, light accent — young man', 'A young Indian man with a light, neutral Indian English accent, clear, friendly and articulate'),
    ('in-woman', 'in', 'f', 'Indian English, light accent — woman in her forties', 'An Indian woman in her forties with a light, educated Indian English accent, calm and confident'),
    ('in-man', 'in', 'm', 'Indian English, light accent — man in his forties', 'An Indian man in his forties with a light, educated Indian English accent, calm and deep'),
    ('us-woman', 'us', 'f', 'General American — woman', 'An American woman in her thirties with a General American accent, warm and clear'),
    ('us-man', 'us', 'm', 'General American — man', 'An American man in his thirties with a General American accent, warm and clear'),
    ('uk-woman', 'uk', 'f', 'Southern English (RP) — woman', 'An English woman in her thirties with a Received Pronunciation accent, clear and poised'),
    ('uk-man', 'uk', 'm', 'Southern English (RP) — man', 'An English man in his thirties with a Received Pronunciation accent, clear and poised'),
]


def voxcpm():
    t = tree(VOX_REPO, VOX_REV)
    files = ['config.json', 'model.safetensors', 'audiovae.pth', 'special_tokens_map.json', 'tokenization_voxcpm2.py', 'tokenizer.json', 'tokenizer_config.json']
    models = {'voxcpm2': {'engine': 'voxcpm', 'repo': VOX_REPO, 'rev': VOX_REV, 'mb': mb(sum(t[f] for f in files)), 'licence': 'Apache-2.0', 'personal': False,
                          'name': 'VoxCPM2 (OpenBMB)', 'page': 'https://openbmb.github.io/voxcpm2-demopage'}}
    voices = [{'id': f'voxcpm2-design-{k}', 'label': f'{label} (a voice described in words)', 'group': g, 'sex': sx, 'model': 'voxcpm2', 'describe': d}
              for k, g, sx, label, d in VOX_DESIGN]
    voices += clip_voices('voxcpm2', 'voxcpm2', '')
    return models, voices


# SYSPIN, run here (21 Nov 2026): 4.5× faster than real time; the accent model hears Indian first for both; 185 / 157 Hz
def syspin():
    models, voices = {}, []
    for mid, repo, rev, sx in SYSPIN:
        t = tree(repo, rev)
        models[mid] = {'engine': 'coqui', 'repo': repo, 'rev': rev, 'mb': mb(t['best_model.pth'] + t['config.json']), 'licence': 'MIT', 'personal': False,
                       'name': f'SYSPIN Indian English VITS ({SEX[sx]})', 'page': f'https://huggingface.co/{repo}'}
        voices.append({'id': f'{mid}', 'label': f'SYSPIN — {SEX[sx]}, Indian English (IISc)', 'group': 'in', 'sex': sx, 'model': mid})
    return models, voices


def mms():
    t = tree(MMS_REPO, MMS_REV)
    files = ['config.json', 'model.safetensors', 'special_tokens_map.json', 'tokenizer_config.json', 'vocab.json']
    models = {'mms-eng': {'engine': 'mms', 'repo': MMS_REPO, 'rev': MMS_REV, 'mb': mb(sum(t[f] for f in files)), 'licence': 'CC BY-NC 4.0', 'personal': True,
                          'name': 'MMS English (Meta)', 'page': f'https://huggingface.co/{MMS_REPO}'}}
    voices = [{'id': 'mms-eng', 'label': 'MMS English voice — man (sounds American in our test)', 'group': 'any', 'sex': MMS_SEX, 'model': 'mms-eng'}]
    return models, voices


MMS_SEX = 'm'  # run here: 121 Hz; the accent model hears American (not documented, so the label says so)


def pocket_clone():
    t = tree(POCKET_CLONE_REPO, POCKET_CLONE_REV)
    size = t['languages/english/model.safetensors'] + t['languages/english/tokenizer.json'] + t['languages/english/tokenizer.model']
    models = {'pocket-clone': {'engine': 'pocket', 'repo': POCKET_CLONE_REPO, 'rev': POCKET_CLONE_REV, 'mb': mb(size), 'licence': 'CC BY 4.0', 'personal': False,
                               'gated': True, 'name': 'Pocket TTS with voice cloning (Kyutai)', 'page': 'https://kyutai.org/tts'}}
    return models, clip_voices('pocket', 'pocket-clone', '')


# Kyutai TTS 1.6B: the model and the recordings of kyutai/tts-voices that have an embedding for it (".1e68beda@240"). The
# accent is filed as documented (VCTK's speaker list; a donor whose name says India) or, for recordings that come with
# no description (scripts/data/kyutai-voices-heard.json): a recording in another language — Whisper sure of it, 0.8 and
# more (scripts/accent-survey/languages.py) — as a speaker of that language (an Indian language: under Indian; the
# others under other accents); an English one as our accent model heard it, when it heard one accent clearly first (a
# margin of 0.05 over the next), else under "accent not documented" — the label says which it is. The sex: VCTK's list,
# the README (EARS p003, p031), Expresso by each speaker's median pitch (ex01 147 Hz, ex02 197, ex03 141, ex04 260 — the
# dataset's two men and two women), the rest in words by the recording's pitch.
KYUTAI_REPO, KYUTAI_REV = 'kyutai/tts-1.6b-en_fr', 'f65439609986c392cb12df63938abcc550c3fb15'
KYUTAI_FILES = ['config.json', 'dsm_tts_1e68beda@240.safetensors', 'tokenizer-e351c8d8-checkpoint125.safetensors',
                'tokenizer_spm_8k_en_fr_audio.model']
KYUTAI_SUFFIX = '.1e68beda@240.safetensors'
HEARD_CLIPS = os.path.join(ROOT, 'scripts', 'data', 'kyutai-voices-heard.json')
CA_GROUP = {'indian': 'in', 'us': 'us', 'england': 'uk', 'scotland': 'uk', 'ireland': 'uk', 'wales': 'uk'}
CA_WORD = {'england': 'English (England)', 'scotland': 'Scottish', 'wales': 'Welsh', 'ireland': 'Irish', 'us': 'American',
           'canada': 'Canadian', 'australia': 'Australian', 'newzealand': 'New Zealand', 'african': 'African', 'bermuda': 'Bermudian',
           'southatlandtic': 'South Atlantic', 'malaysia': 'Malaysian', 'philippines': 'Filipino', 'singapore': 'Singaporean',
           'hongkong': 'Hong Kong', 'indian': 'Indian'}
EXPRESSO_SEX = {'ex01': 'm', 'ex02': 'f', 'ex03': 'm', 'ex04': 'f'}
EXPRESSO_STYLE = {'default': 'plain', 'enunciated': 'enunciating', 'projected': 'projecting', 'nonverbal': 'nonverbal sounds',
                  'animal': 'talking to a pet', 'animaldir': 'talking with someone who talks to a pet', 'child': 'talking to a child',
                  'childdir': 'talking with someone who talks to a child'}
EARS_SEX = {'p003': 'f', 'p031': 'm'}
ALBA = {'casual': 'casual', 'merchant': 'a merchant', 'announcer': 'an announcer', 'a-moment-by': 'quiet narration'}
# Unmute's voices: the two Freesound clips are left out (the README does not give their licence)
UNMUTE = {'default_voice.wav': ('Unmute’s default voice', 'CC0', False),
          'degaulle-2.wav': ('Charles de Gaulle (his appeal of 18 June 1940)', 'public domain', False),
          'developer-1.mp3': ('Unmute “developer” voice', 'CC0', False),
          'developpeuse-3.wav': ('Unmute “développeuse” voice', 'CC0', False),
          'ex04_narration_longform_00001.wav': ('Expresso ex04, a long narration', 'CC BY-NC 4.0', True),
          'fabieng-enhanced-v2.wav': ('Unmute “Fabien” voice', 'CC0', False),
          'p329_022.wav': ('VCTK p329, another sentence', 'CC BY 4.0', False)}
# The languages Whisper heard in recordings of kyutai/tts-voices (a new one stops the generator until it is named here)
LANG_NAME = {'es': 'Spanish', 'fr': 'French', 'hi': 'Hindi', 'ms': 'Malay', 'bn': 'Bengali', 'pt': 'Portuguese', 'ru': 'Russian',
             'ar': 'Arabic', 'el': 'Greek', 'sw': 'Swahili', 'yo': 'Yoruba', 'la': 'Latin'}
INDIAN_LANGS = {'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'}


def pitch_words(hz):
    """The sex in the filter and words for the label, from the median pitch of a recording (as for XTTS's studio voices)."""
    return ('m', 'a deeper voice') if hz <= 125 else ('f', 'a higher voice') if hz >= 175 else ('', 'a middle voice')


def heard_accent(rec):
    """(group, words) for a recording without a described accent: a speaker of another language when Whisper heard
    that language (0.8 and more), else the accent heard first, when heard clearly."""
    lang, p = rec.get('lang', ['en', 1.0])
    if lang != 'en' and p >= 0.8:
        if lang not in LANG_NAME:
            sys.exit(f'Whisper heard the language "{lang}" in a recording: name it in LANG_NAME')
        return ('in' if lang in INDIAN_LANGS else 'world'), f'a {LANG_NAME[lang]} speaker (the recording is in {LANG_NAME[lang]})'
    (a1, s1), (a2, s2) = rec['acc'][0], rec['acc'][1]
    if s1 - s2 >= 0.05:
        return CA_GROUP.get(a1, 'world'), f'accent heard in our test: {CA_WORD[a1]}'
    return 'any', f'accent not clear in our test (nearest: {CA_WORD[a1]})'


def slug(x):
    return re.sub(r'[^a-z0-9]+', '-', x.lower()).strip('-')


def donation(path, rec):
    """A voice donation of kyutai/tts-voices: its name, the accent it is filed under and why, its sex by its pitch, and
    the language of the recording (another than English only when Whisper was sure of it)."""
    name = re.sub(r'\s+', ' ', path.split('/', 1)[1][:-len('_enhanced.wav')].replace('_', ' ')).strip()
    if re.search(r'india', name, re.I):
        group, acc = 'in', 'Indian (the donor says so)'
    else:
        group, acc = heard_accent(rec)
    lang, p = rec.get('lang', ['en', 1.0])
    sex, how = pitch_words(rec['f0'])
    return {'slug': slug(name), 'title': f'Voice donation {name}' if re.fullmatch(r'[0-9a-f]{4}', name) else name, 'group': group,
            'acc': acc, 'sex': sex, 'how': how, 'lang': lang if p >= 0.8 else 'en'}


def kyutai():
    t = tree(KYUTAI_REPO, KYUTAI_REV)
    clips = tree(CLIPS_REPO, CLIPS_REV)
    models = {'kyutai-1.6b': {'engine': 'kyutai', 'repo': KYUTAI_REPO, 'rev': KYUTAI_REV, 'mb': mb(sum(t[f] for f in KYUTAI_FILES)),
                              'licence': 'CC BY 4.0 (the model); each voice’s recording: its own licence, in its label',
                              'personal': False, 'name': 'Kyutai TTS 1.6B', 'page': 'https://kyutai.org/next/tts'}}
    recs = json.load(open(HEARD_CLIPS, encoding='utf-8'))['recordings']
    vctk = vctk_speakers()
    voices = []

    def add(path, vid, label, group, sex, personal=False):
        if path + KYUTAI_SUFFIX not in clips:
            sys.exit(f'{path}{KYUTAI_SUFFIX} is not in {CLIPS_REPO} at {CLIPS_REV}')
        v = {'id': vid, 'label': label, 'group': group, 'sex': sex, 'model': 'kyutai-1.6b',
             'clip': {'repo': CLIPS_REPO, 'rev': CLIPS_REV, 'file': path}}
        if personal:
            v['personal'] = True
        voices.append(v)

    for path, rec in sorted(recs.items()):
        coll, rest = path.split('/', 1)
        sex, how = pitch_words(rec['f0'])
        if coll == 'vctk':
            spk = rest.split('_')[0]
            s = vctk[spk]
            acc = ACCENT_WORD.get(s['accent'], s['accent'])
            where = f', {s["region"]}' if s['region'] else ''
            add(path, f'kyutai-vctk-{spk}', f'VCTK {spk} — {SEX[s["sex"]]}, {s["age"]}, {acc}{where} (CC BY 4.0)',
                ACCENT_GROUP[s['accent']], s['sex'])
        elif coll == 'voice-donations':
            d = donation(path, rec)
            add(path, 'kyutai-don-' + d['slug'], f'{d["title"]} — {how}, {d["acc"]} (voice donation, CC0)', d['group'], sex)
        elif coll == 'ears':
            spk, f = rest.split('/')
            style = 'free speech' if f.startswith('freeform') else f.split('_')[1]
            sx = EARS_SEX.get(spk, sex)
            who = SEX[sx] if spk in EARS_SEX else how
            group, acc = heard_accent(rec)
            add(path, f'kyutai-ears-{spk}-' + slug(style), f'EARS {spk} — {style}, {who}, {acc} (personal use only: CC BY-NC 4.0)',
                group, sx, True)
        elif coll == 'expresso':
            m = re.match(r'(ex\d\d)-(ex\d\d)_(.+?)_(\d{3})_channel([12])_(\d+)s\.wav$', rest)
            spk = m.group(1) if m.group(5) == '1' else m.group(2)
            kinds = m.group(3).split('-')
            kind = kinds[0] if m.group(5) == '1' or len(kinds) == 1 else kinds[1]
            group, acc = heard_accent(rec)
            add(path, f'kyutai-expresso-{spk}-' + slug(f'{m.group(3)}-{m.group(4)}-ch{m.group(5)}-{m.group(6)}'),
                f'Expresso {spk} — {EXPRESSO_STYLE.get(kind, kind)}, {SEX[EXPRESSO_SEX[spk]]}, {acc} (personal use only: CC BY-NC 4.0)',
                group, EXPRESSO_SEX[spk], True)
        elif coll == 'alba-mackenna':
            k = rest[:-4]
            group, acc = heard_accent(rec)
            add(path, f'kyutai-alba-{k}', f'Alba MacKenna — {ALBA[k]}, {how}, {acc} (voice actress, CC BY 4.0)', group, sex)
        elif coll == 'unmute-prod-website':
            if rest not in UNMUTE:
                continue  # the Freesound clips: no licence given
            title, lic, nc = UNMUTE[rest]
            group, acc = heard_accent(rec)
            add(path, 'kyutai-unmute-' + slug(rest.rsplit('.', 1)[0]), f'{title} — {how}, {acc} ({lic})', group, sex, nc)
        else:
            sys.exit(f'{path}: a collection of kyutai/tts-voices not described here')
    return models, voices


# Models whose engine was not run here, with the reason (shown as a tag in the tab; everything else was run on this
# project's test machine — Linux, a 4-core processor, no graphics card — and its output read back by Whisper)
UNTRIED = {
    'indic-parler': 'Not run here: Hugging Face gives it only to an account that has accepted its conditions.',
    'parler-large': 'Not run here: 9.3 GB, more than the test machine had room for (the same program as Parler Mini, which was run).',
    'bark': 'Not run here: 4.5 GB (the same program as Bark small).',
    'chatterbox': 'Not run yet: it needs a second PyTorch (2.6) beside the model, more than the test machine had room for.',
    'chatterbox-turbo': 'Not run yet: it needs a second PyTorch (2.6) beside the model, more than the test machine had room for.',
    'veena': 'Not run here: 7.6 GB, made for a graphics card.',
    'voxcpm2': 'Not run yet: 5 GB.',
    'vibevoice-1.5b': 'Not run yet: 5.4 GB.',
    'pocket-clone': 'Not run here: Hugging Face gives it only to an account that has accepted its conditions.',
}


# How each Indian English voice was heard by an accent-recognition model (owner, 21 Nov 2026: the voices ranked "in order
# of increasing Indian accent thickness"): scripts/data/indian-accents.json, measured by scripts/accent-survey/ (every
# voice reads the same British sentences; SpeechBrain's CommonAccent classifier scores the 16 accents it knows). A
# voice's `heard`: its Indian score minus its best other score (above 0 = heard as Indian first; the higher, the
# stronger), averaged over the sentences, and the other accent it was heard closest to.
ACCENTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'indian-accents.json')


def heard(voices):
    if not os.path.exists(ACCENTS):
        return None
    d = json.load(open(ACCENTS, encoding='utf-8'))
    ids = {v['id']: v for v in voices}
    unknown = sorted(set(d['voices']) - set(ids))
    if unknown:
        sys.exit(f'{ACCENTS}: voices not in the catalogue: {unknown[:5]}')
    for vid, r in d['voices'].items():
        sc = r['scores']
        margins = [s['indian'] - max(x for k, x in s.items() if k != 'indian') for s in sc]
        others = {k: sum(s[k] for s in sc) / len(sc) for k in sc[0] if k != 'indian'}
        ids[vid]['heard'] = {'indian': round(sum(margins) / len(margins), 4), 'like': max(others, key=others.get), 'n': len(sc)}
    return {'tool': d['tool'], 'texts': d['texts'], 'made': d['made']}


def main():
    models, voices = {}, []
    # the order of the list: in each accent the larger, newer models first — Indic Parler-TTS leads the Indian voices
    for part in (parler, qwen, veena, kokoro, omnivoice, voxcpm, vibevoice, kyutai, f5, melo, indictiny, chatterbox, xtts, pocket_clone, bark, syspin,
                 pocket, supertonic, mms, piper):
        m, v = part()
        models.update(m)
        voices.extend(v)
    for mid, why in UNTRIED.items():
        models[mid]['untried'] = why
    ids = [v['id'] for v in voices]
    if len(ids) != len(set(ids)) or not all(re.fullmatch(r'[a-z0-9][a-z0-9_.-]*', i) for i in ids):
        sys.exit('voice ids must be unique and safe as file names')
    survey = heard(voices)
    cat = {'made': '21 Nov 2026', 'groups': GROUPS, 'engines': ENGINES, 'models': models, 'voices': voices, **({'accentSurvey': survey} if survey else {})}
    json.dump(cat, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(OUT, 'a').write('\n')
    by = {}
    for v in voices:
        by[v['group']] = by.get(v['group'], 0) + 1
    print(f'{len(voices)} voices in {len(models)} models →', ', '.join(f'{g}: {by.get(g, 0)}' for g, _ in GROUPS))


if __name__ == '__main__':
    main()
