#!/usr/bin/env python3
# make-indian-accents.py WORK — scripts/data/indian-accents.json from the survey's WORK/scores.json (run by
# scripts/accent-survey/run.py): for every voice, the accent scores of each sentence it read ("out1" = the first
# sentence, "out2" = the second; also "out" for the first). The catalogue generator turns them into each voice's
# `heard` (scripts/make-offline-tts-catalogue.py, heard()).
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'accent-survey'))
from run import TEXTS  # noqa: E402
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
work = sys.argv[1]
scores = json.load(open(os.path.join(work, 'scores.json')))
cat = json.load(open(os.path.join(ROOT, 'src/lib/offline-tts/catalogue.json'), encoding='utf-8'))
known = {v['id'] for v in cat['voices']}
voices = {}
for path, s in sorted(scores.items()):
    vid, part = os.path.basename(path)[:-4], os.path.basename(os.path.dirname(path))
    if vid not in known:
        continue  # a variant tried in the survey only
    k = 1 if part == 'out2' else 0
    voices.setdefault(vid, [None, None])[k] = s
out = {'tool': 'SpeechBrain CommonAccent, an ECAPA-TDNN trained on Common Voice (16 accents)', 'texts': TEXTS, 'made': '21 Nov 2026',
       'voices': {vid: {'scores': [s for s in sc if s]} for vid, sc in sorted(voices.items())}}
json.dump(out, open(os.path.join(ROOT, 'scripts/data/indian-accents.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out['voices']), 'voices,', sum(len(v['scores']) for v in out['voices'].values()), 'recordings')
