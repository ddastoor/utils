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

# The engines: the Python packages each one runs with (uv installs them into a cache of its own on the PC), about how
# much they download the first time, and what the person should know. "torch": PyTorch (uv picks the build for the
# graphics card there is: CUDA for NVIDIA, else the processor's — the processor build is far smaller).
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
        'mb': 450, 'torch': True, 'speedControl': True, 'licence': 'Apache-2.0',
        'about': 'Large models that speak as a sentence describes (a named speaker, a pace, very clear audio). '
                 'Slow on a processor — a graphics card helps a lot.',
    },
    'xtts': {
        'name': 'XTTS-v2', 'url': 'https://huggingface.co/coqui/XTTS-v2',
        'packages': ['coqui-tts[codec]==0.28.0', 'lameenc==1.9.0', 'torch', 'torchaudio'],
        'mb': 450, 'torch': True, 'speedControl': True, 'accept': 'cpml',
        'licence': 'Coqui Public Model License (non-commercial use only)',
        'about': "Coqui's large multilingual model: 58 studio voices, and voices taken from short recordings. "
                 'About real time on a fast processor.',
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
            rows[p[0]] = {'age': p[1], 'sex': p[2].lower(), 'accent': p[3], 'region': ' '.join(p[4:])}
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
        voices.append({'id': f'goonj-{name.replace("_", "-")}', 'label': f'{name[3:].title()} — {SEX[sex]}, {kind}',
                       'group': 'in', 'sex': sex, 'model': 'goonj', 'voice': name, 'lang': 'a'})
    return models, voices


# goonj-1-82M's personas (its card) and their sex (checked by the pitch of a sample made here)
GOONJ = [('en_aman', 'm'), ('en_ananya', 'f'), ('en_arjun', 'm'), ('en_dev', 'm'), ('en_divya', 'f'), ('en_kabir', 'm'),
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


XTTS_STUDIO = [('Claribel Dervla', 'f'), ('Daisy Studious', 'f'), ('Gracie Wise', 'f'), ('Tammie Ema', 'f'), ('Alison Dietlinde', 'f'),
               ('Ana Florence', 'f'), ('Annmarie Nele', 'f'), ('Asya Anara', 'f'), ('Brenda Stern', 'f'), ('Gitta Nikolina', 'f'),
               ('Henriette Usha', 'f'), ('Sofia Hellen', 'f'), ('Tammy Grit', 'f'), ('Tanja Adelina', 'f'), ('Vjollca Johnnie', 'f'),
               ('Andrew Chipper', 'm'), ('Badr Odhiambo', 'm'), ('Dionisio Schuyler', 'm'), ('Royston Min', 'm'), ('Viktor Eka', 'm'),
               ('Abrahan Mack', 'm'), ('Adde Michal', 'm'), ('Baldur Sanjin', 'm'), ('Craig Gutsy', 'm'), ('Damien Black', 'm'),
               ('Gilberto Mathias', 'm'), ('Ilkin Urbano', 'm'), ('Kazuhiko Atallah', 'm'), ('Ludvig Milivoj', 'm'), ('Suad Qasim', 'm'),
               ('Torcull Diarmuid', 'm'), ('Viktor Menelaos', 'm'), ('Zacharie Aimilios', 'm'), ('Nova Hogarth', 'f'), ('Maja Ruoho', 'f'),
               ('Uta Obando', 'f'), ('Lidiya Szekeres', 'f'), ('Chandra MacFarland', 'f'), ('Szofi Granger', 'f'), ('Camilla Holmström', 'f'),
               ('Lilya Stainthorpe', 'f'), ('Zofija Kendrick', 'f'), ('Narelle Moon', 'f'), ('Barbora MacLean', 'f'), ('Alexandra Hisakawa', 'f'),
               ('Alma María', 'f'), ('Rosemary Okafor', 'f'), ('Ige Behringer', 'm'), ('Filip Traverse', 'm'), ('Damjan Chapman', 'm'),
               ('Wulf Carlevaro', 'm'), ('Aaron Dreschner', 'm'), ('Kumar Dahl', 'm'), ('Eugenio Mataracı', 'm'), ('Ferran Simen', 'm'),
               ('Xavier Hayasaka', 'm'), ('Luis Moray', 'm'), ('Marcos Rudaski', 'm')]
# Indian reference clips of kyutai/tts-voices: the voice donations (CC0) say "India" / "Indian" in their names; the three
# VCTK speakers whose accent is Indian (CC BY 4.0). The cleaned ("enhanced") recordings.
INDIAN_CLIPS = [('Imran', 'voice-donations/Imran_from_I_India_enhanced.wav', 'm', 'CC0 voice donation'),
                ('Indian guy', 'voice-donations/Indian_guy_enhanced.wav', 'm', 'CC0 voice donation'),
                ('Marshal', 'voice-donations/Marshal_Indian_enhanced.wav', 'm', 'CC0 voice donation'),
                ('Siddh', 'voice-donations/Siddh_Indian_enhanced.wav', 'm', 'CC0 voice donation'),
                ('Vinith', 'voice-donations/Vinith___English_India_enhanced.wav', 'm', 'CC0 voice donation'),
                ('VCTK p248', 'vctk/p248_023_enhanced.wav', 'f', 'VCTK, CC BY 4.0'),
                ('VCTK p251', 'vctk/p251_023_enhanced.wav', 'm', 'VCTK, CC BY 4.0'),
                ('VCTK p376', 'vctk/p376_023_enhanced.wav', 'm', 'VCTK, CC BY 4.0')]


def xtts():
    t = tree(XTTS_REPO, XTTS_REV)
    need = ['config.json', 'model.pth', 'vocab.json', 'speakers_xtts.pth', 'mel_stats.pth', 'LICENSE.txt']
    models = {'xtts': {'engine': 'xtts', 'repo': XTTS_REPO, 'rev': XTTS_REV, 'mb': mb(sum(t[f] for f in need)), 'page': f'https://huggingface.co/{XTTS_REPO}',
                       'licence': 'Coqui Public Model License — non-commercial use only', 'personal': True, 'accept': 'cpml',
                       'name': 'XTTS-v2 (Coqui)'}}
    clips = tree(CLIPS_REPO, CLIPS_REV)
    voices = [{'id': 'xtts-' + re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-'), 'label': f'{n} — {SEX[s]} (studio voice)', 'group': 'any',
               'sex': s, 'model': 'xtts', 'speaker': n} for n, s in XTTS_STUDIO]
    for n, f, s, lic in INDIAN_CLIPS:
        if f not in clips:
            sys.exit(f'{f} is not in {CLIPS_REPO} at {CLIPS_REV}')
        voices.append({'id': 'xtts-clip-' + re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-'),
                       'label': f'{n} — {SEX[s]}, taken from a 10-second recording ({lic})', 'group': 'in', 'sex': s, 'model': 'xtts',
                       'clip': {'repo': CLIPS_REPO, 'rev': CLIPS_REV, 'file': f}})
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


def main():
    models, voices = {}, []
    # the order of the list: in each accent the larger, newer models first — Indic Parler-TTS leads the Indian voices
    for part in (parler, kokoro, xtts, pocket, piper):
        m, v = part()
        models.update(m)
        voices.extend(v)
    ids = [v['id'] for v in voices]
    if len(ids) != len(set(ids)) or not all(re.fullmatch(r'[a-z0-9][a-z0-9_.-]*', i) for i in ids):
        sys.exit('voice ids must be unique and safe as file names')
    cat = {'made': '21 Nov 2026', 'groups': GROUPS, 'engines': ENGINES, 'models': models, 'voices': voices}
    json.dump(cat, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(OUT, 'a').write('\n')
    by = {}
    for v in voices:
        by[v['group']] = by.get(v['group'], 0) + 1
    print(f'{len(voices)} voices in {len(models)} models →', ', '.join(f'{g}: {by.get(g, 0)}' for g, _ in GROUPS))


if __name__ == '__main__':
    main()
