# languages.py [WORK] — the language Whisper base (multilingual; Systran/faster-whisper-base at a pinned revision) hears in
# the recordings of kyutai/tts-voices that come without a word about their language (the voice donations and Unmute's
# voices): "lang": [code, probability] beside each one's accent in scripts/data/kyutai-voices-heard.json. A recording in
# another language is not filed by the accent our English accent model (CommonAccent) hears in it — that reading means
# nothing there — but as a speaker of that language (make-offline-tts-catalogue.py). VCTK, EARS, Expresso and Alba MacKenna
# are English recordings by their makers' word and are not looked at. Run after recordings.py, from WORK:
#   uv run --python 3.12 --no-project --with faster-whisper==1.2.1 --with librosa==0.11.0 python -I languages.py WORK
import json, os, sys
import librosa
from faster_whisper import WhisperModel
from huggingface_hub import hf_hub_download, snapshot_download
here = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
REV = '323332d33f997de8394f24a193e1a76df720e01a'
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'kyutai-voices-heard.json')
d = snapshot_download('Systran/faster-whisper-base', revision='ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66', local_dir=os.path.join(here, 'whisper-base'))
m = WhisperModel(d, device='cpu', compute_type='int8')
data = json.load(open(DATA, encoding='utf-8'))
todo = [k for k in sorted(data['recordings']) if k.split('/')[0] in ('voice-donations', 'unmute-prod-website')]
for i, f in enumerate(todo):
    p = hf_hub_download('kyutai/tts-voices', f, revision=REV, local_dir=os.path.join(here, 'donations'))
    y, _ = librosa.load(p, sr=16000, mono=True, duration=30)  # Whisper decides from the first 30 seconds
    lang, prob, _ = m.detect_language(y)
    data['recordings'][f]['lang'] = [lang, round(float(prob), 3)]
    if i % 25 == 0:
        print(i, f, data['recordings'][f]['lang'], flush=True)
json.dump(data, open(DATA, 'w', encoding='utf-8'), indent=0, ensure_ascii=False)  # the file's own layout
print('done', len(todo))
