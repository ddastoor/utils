# accent.py OUT.json WAV… — the accent scores of SpeechBrain's CommonAccent classifier (ECAPA-TDNN trained on Common
# Voice, 16 English accents; Jzuluaga/accent-id-commonaccent_ecapa at a pinned revision) for each recording: the raw
# cosine score of every class (a softmax over cosines is nearly flat, so the scores themselves are kept), added to
# OUT.json as {file: {accent: score}}. Audio read with librosa at 16 kHz mono (torchaudio's file reading needs FFmpeg).
# Run by run.py:  uv run --python 3.12 --no-project --with speechbrain==1.1.2 --with librosa==0.11.0 --with torch
#                 --with torchaudio python -I accent.py OUT.json WAV…
import json, os, sys
import librosa, torch
from huggingface_hub import snapshot_download
from speechbrain.inference.classifiers import EncoderClassifier
REPO, REV = 'Jzuluaga/accent-id-commonaccent_ecapa', '14bebf44b7e7a34204d0acc2c897935945fb5c51'
work = os.path.dirname(os.path.abspath(sys.argv[1]))
d = snapshot_download(REPO, revision=REV, local_dir=os.path.join(work, 'commonaccent'))
clf = EncoderClassifier.from_hparams(source=d, savedir=os.path.join(work, 'commonaccent-run'), run_opts={'device': 'cpu'})
labels = [clf.hparams.label_encoder.decode_ndim(i) for i in range(16)]
out = json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}
for p in sys.argv[2:]:
    y, _ = librosa.load(p, sr=16000, mono=True)
    with torch.inference_mode():
        s = clf.classify_batch(torch.from_numpy(y).unsqueeze(0))[0].reshape(-1)
    out[p] = {labels[i]: round(float(s[i]), 4) for i in range(16)}
json.dump(out, open(sys.argv[1], 'w'), indent=0)
print('scored', len(sys.argv) - 2)
