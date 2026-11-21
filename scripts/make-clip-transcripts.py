#!/usr/bin/env python3
# make-clip-transcripts.py WORK — the words said in each recording the engines that take a voice from a recording are
# given (clone_clips() of scripts/make-offline-tts-catalogue.py) → scripts/data/clip-transcripts.json. F5-TTS takes a
# voice from a recording together with what is said in it; the recordings come with no transcript (VCTK's text files
# are not in kyutai/tts-voices; the voice donations have none), so Whisper large-v3 turbo (the CTranslate2 build that
# faster-whisper names, pinned) writes them, in English. Recordings in another language are left out (F5-TTS leaves them
# out); one longer than F5's 12 seconds is cut after a whole word, and its words end there. Run (≈ 20 minutes on a 4-core
# processor; 1.6 GB for the model):
#   uv run --python 3.12 --no-project --with faster-whisper==1.2.1 --with librosa==0.11.0 python -I scripts/make-clip-transcripts.py WORK
import importlib.util, json, os, sys
import librosa
from faster_whisper import WhisperModel
from huggingface_hub import hf_hub_download, snapshot_download
here = os.path.dirname(os.path.abspath(__file__))
work = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
spec = importlib.util.spec_from_file_location('catalogue', os.path.join(here, 'make-offline-tts-catalogue.py'))
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)
WHISPER = ('dropbox-dash/faster-whisper-large-v3-turbo', '0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf')
d = snapshot_download(WHISPER[0], revision=WHISPER[1], local_dir=os.path.join(work, 'whisper-turbo'))
m = WhisperModel(d, device='cpu', compute_type='int8')
# F5-TTS cuts a reference longer than 12 seconds (at a silence, or anywhere) and its words would no longer match: a
# longer recording is cut after its last whole word before LIMIT − 0.2 s (Whisper's word times), and its transcript ends there
LIMIT = 11.5
clips = [c for c in gen.clone_clips() if c['lang'] == 'en']
old = json.load(open(gen.TRANSCRIPTS, encoding='utf-8')) if os.path.exists(gen.TRANSCRIPTS) else {}
out, cuts = old.get('clips', {}), old.get('cuts', {})
for i, c in enumerate(clips):
    f = c['file']
    p = hf_hub_download(gen.CLIPS_REPO, f, revision=gen.CLIPS_REV, local_dir=os.path.join(work, 'donations'))
    y, _ = librosa.load(p, sr=16000, mono=True)
    long = len(y) / 16000 > LIMIT
    if f in out and (not long or f in cuts):
        continue  # transcribed before: kept (delete the file to write them all again)
    segs, _ = m.transcribe(y, language='en', beam_size=5, condition_on_previous_text=False, vad_filter=False, word_timestamps=long)
    if long:
        keep = [w for s in segs for w in s.words if w.end <= LIMIT - 0.2]
        out[f] = ''.join(w.word for w in keep).strip()  # each word carries its own leading space
        cuts[f] = round(keep[-1].end + 0.15, 2)
    else:
        out[f] = ' '.join(s.text.strip() for s in segs).strip()
    if i % 10 == 0 or long:
        print(i, f, cuts.get(f), out[f], flush=True)
data = {'about': f'What is said in each recording of {gen.CLIPS_REPO} (revision {gen.CLIPS_REV}) the engines that clone are given, '
                 f'as Whisper large-v3 turbo ({WHISPER[0]} at {WHISPER[1][:8]}, faster-whisper 1.2.1, beam 5) wrote it in English; '
                 f'"cuts": where a recording longer than {LIMIT} s is cut (seconds, after its last whole word) — its transcript ends '
                 'there. Made by scripts/make-clip-transcripts.py; used by F5-TTS.',
        'clips': dict(sorted(out.items())), 'cuts': dict(sorted(cuts.items()))}
json.dump(data, open(gen.TRANSCRIPTS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(gen.TRANSCRIPTS, 'a', encoding='utf-8').write('\n')
print('done', len(out))
