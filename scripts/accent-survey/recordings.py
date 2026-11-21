# recordings.py donations|others [WORK] — the recordings of kyutai/tts-voices that have embeddings for Kyutai TTS 1.6B (the
# voice donations, CC0; or VCTK, Expresso, EARS, Alba MacKenna, Unmute), as SpeechBrain CommonAccent hears them: the top
# three accents with their raw cosine scores, the median pitch and the seconds measured → WORK/heard-<which>.json, merged
# into scripts/data/kyutai-voices-heard.json. Run: uv run --python 3.12 --no-project --with speechbrain==1.1.2 --with
# librosa==0.11.0 --with torch --with torchaudio python -I recordings.py donations WORK
import json, os, re, sys
import numpy as np, librosa, torch
from huggingface_hub import hf_hub_download, snapshot_download
from speechbrain.inference.classifiers import EncoderClassifier
here = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else '.')  # a work folder (recordings, the classifier)
REV = '323332d33f997de8394f24a193e1a76df720e01a'
from huggingface_hub import list_repo_files
tree = set(list_repo_files('kyutai/tts-voices', revision=REV))
SUF = '.1e68beda@240.safetensors'
WHICH = sys.argv[1] if len(sys.argv) > 1 else 'donations'
if WHICH == 'donations':
    files = sorted(k for k in tree if re.fullmatch(r'voice-donations/[^/]+_enhanced\.wav', k) and k + SUF in tree)
else:  # Kyutai's other English voices with an embedding for TTS 1.6B
    files = sorted(k[:-len(SUF)] for k in tree if k.endswith(SUF) and k.split('/')[0] in ('expresso', 'ears', 'alba-mackenna', 'unmute-prod-website', 'vctk'))
d = snapshot_download('Jzuluaga/accent-id-commonaccent_ecapa', revision='14bebf44b7e7a34204d0acc2c897935945fb5c51', local_dir=os.path.join(here, 'commonaccent'))
clf = EncoderClassifier.from_hparams(source=d, savedir=os.path.join(here, 'commonaccent-run'), run_opts={'device': 'cpu'})
labels = [clf.hparams.label_encoder.decode_ndim(i) for i in range(16)]
out = {}
dl = os.path.join(here, 'donations')
for i, f in enumerate(files):
    p = hf_hub_download('kyutai/tts-voices', f, revision=REV, local_dir=dl)
    y, _ = librosa.load(p, sr=16000, mono=True, duration=30)
    if WHICH != 'donations':
        os.unlink(p)  # these recordings are large: measured, then deleted
    with torch.inference_mode():
        prob = clf.classify_batch(torch.from_numpy(y).unsqueeze(0))[0].reshape(-1)
    order = torch.argsort(prob, descending=True)[:3].tolist()
    f0, vf, _ = librosa.pyin(y, fmin=60, fmax=420, sr=16000, frame_length=1024)
    v = f0[vf & ~np.isnan(f0)]
    out[f] = {'acc': [[labels[j], round(float(prob[j]), 4)] for j in order], 'f0': round(float(np.median(v)), 1) if len(v) else 0, 'secs': round(len(y) / 16000, 1)}
    if i % 20 == 0:
        print(i, f, out[f], flush=True)
json.dump(out, open(os.path.join(here, f'heard-{WHICH}.json'), 'w'), indent=1)  # merged into scripts/data/kyutai-voices-heard.json
print('done', len(out))
