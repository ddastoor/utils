#!/usr/bin/env python3
# make-paddle-reference.py — the reference of tests/unit/paddle.test.mjs: what RapidOCR 3.10.0 (PaddleOCR on ONNX
# Runtime, the project the app's second reader is ported from — src/lib/paddle.ts) and OpenCV give, written to
# tests/fixtures/paddle/reference.json:
#   - each step on inputs both sides can make exactly: cv2.resize INTER_LINEAR (down and up), get_rotate_crop_image on a
#     turned quad and a tall one, DBPostProcess on a probability map, CTCLabelDecode on made-up probabilities;
#   - the whole reading of three fixture photos (RapidOCR's own settings, as the app reads: without the direction
#     classifier — Global.use_cls false, see src/lib/paddle.ts — and the recogniser one line at a time, Rec.rec_batch_num
#     1): boxes, texts, scores.
# Needs: pip install rapidocr==3.10.0 onnxruntime (its wheel carries the models of scripts/assets.json — the SHA-256 of
# each is checked here).
import base64, hashlib, json, os, sys
import numpy as np
import cv2
from rapidocr import RapidOCR
from rapidocr.ch_ppocr_det.utils import DBPostProcess
from rapidocr.ch_ppocr_rec.utils import CTCLabelDecode
from rapidocr.utils.process_img import get_rotate_crop_image
import rapidocr

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
assets = json.load(open(os.path.join(ROOT, 'scripts/assets.json')))
models = os.path.join(os.path.dirname(rapidocr.__file__), 'models')
for name, a in assets.items():
    if not name.startswith('paddleocr/'): continue
    got = hashlib.sha256(open(os.path.join(models, os.path.basename(name)), 'rb').read()).hexdigest()
    if got != a['sha256']: sys.exit(f'{name}: the RapidOCR here carries another model ({got})')

def pattern(w, h):
    """RGB pixels both sides make: (x·37 + y·11 + c·91 + (x·y) mod 17) mod 256 — gradients with fine texture."""
    y, x = np.mgrid[0:h, 0:w]
    return np.stack([(x * 37 + y * 11 + c * 91 + (x * y) % 17) % 256 for c in range(3)], -1).astype(np.uint8)
b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
out = {'rapidocr': rapidocr.__version__ if hasattr(rapidocr, '__version__') else '3.10.0', 'resize': [], 'crop': [], 'db': None, 'ctc': None, 'photos': []}

# cv2.resize INTER_LINEAR, RGB (the app works on RGBA: the same three channels)
src = pattern(97, 61)
for (dw, dh) in ((50, 31), (160, 90), (97, 61), (33, 120)):
    r = cv2.resize(src, (dw, dh))
    out['resize'].append({'w': 97, 'h': 61, 'dw': dw, 'dh': dh, 'rgb': b64(r)})

# get_rotate_crop_image: a turned quad, a tall one (turned a quarter), one partly outside the picture
img = pattern(240, 180)
for q in ([[30.0, 40], [190, 60], [185, 100], [25, 80]], [[100.0, 20], [130, 20], [130, 160], [100, 160]], [[-10.0, 150], [120, 150], [120, 190], [-10, 190]]):
    c = get_rotate_crop_image(img, np.array(q, dtype=np.float32))
    out['crop'].append({'w': 240, 'h': 180, 'quad': [v for p in q for v in p], 'cw': c.shape[1], 'ch': c.shape[0], 'rgb': b64(c)})

# DBPostProcess on a probability map: soft-edged rectangles (one turned), two touching, specks, noise — 8-bit, read as
# v / 255 in double then float32 on both sides
rng = np.random.default_rng(7)
H, W = 160, 256
m = rng.integers(0, 40, (H, W)).astype(np.float64)
def rect(cx, cy, hw, hh, ang, val):
    y, x = np.mgrid[0:H, 0:W]; a = np.deg2rad(ang)
    u = (x - cx) * np.cos(a) + (y - cy) * np.sin(a); v = -(x - cx) * np.sin(a) + (y - cy) * np.cos(a)
    d = np.maximum(np.abs(u) - hw, np.abs(v) - hh)
    return np.where(d < 0, val, np.where(d < 3, val * (1 - d / 3), 0))
for args in ((60, 30, 45, 8, 0, 230), (170, 40, 60, 7, 6, 210), (128, 90, 100, 9, -3, 240), (40, 130, 20, 6, 0, 200), (75, 130, 18, 6, 0, 190), (220, 135, 3, 2, 0, 250)):
    m = np.maximum(m, rect(*args))
u8 = np.clip(m, 0, 255).astype(np.uint8)
pred = (u8.astype(np.float64) / 255).astype(np.float32)
post = DBPostProcess(thresh=0.3, box_thresh=0.5, max_candidates=1000, unclip_ratio=1.6, score_mode='fast', use_dilation=True)
boxes, scores = post(pred[None, None], (H * 2, W * 2))
out['db'] = {'w': W, 'h': H, 'dw': W * 2, 'dh': H * 2, 'u8': b64(u8), 'boxes': np.asarray(boxes).reshape(-1, 8).tolist(), 'scores': [float(s) for s in scores]}

# CTCLabelDecode on made-up probabilities (T × C, softmax of seeded logits; repeats and blanks among the arg-maxes)
T, C = 40, 12
lg = rng.normal(0, 1, (T, C)); lg[np.arange(T), rng.integers(0, C, T)] += 4; lg[10:14, 3] += 9; lg[20:22, 0] += 9
p = np.exp(lg) / np.exp(lg).sum(1, keepdims=True)
p32 = p.astype(np.float32)
dec = CTCLabelDecode(character=list('abcdefghij'))
line, _ = dec(p32[None])
out['ctc'] = {'T': T, 'C': C, 'probs': b64(p32), 'chars': 'abcdefghij', 'text': line[0][0], 'score': float(line[0][1])}

# the whole reading of three photos (RapidOCR's settings; the recogniser one line at a time)
eng = RapidOCR(params={'Rec.rec_batch_num': 1, 'Global.use_cls': False, 'Global.log_level': 'error'})
for f in ('doc-newsletter-frame.jpg', 'kindle-frame.jpg', 'doc-checklist-draft-still.jpg'):
    r = eng(os.path.join(ROOT, 'tests/fixtures/images', f))
    out['photos'].append({'file': f, 'boxes': np.asarray(r.boxes).reshape(-1, 8).tolist(), 'txts': list(r.txts), 'scores': [float(s) for s in r.scores]})
    print(f, len(r.txts), 'lines')
os.makedirs(os.path.join(ROOT, 'tests/fixtures/paddle'), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, 'tests/fixtures/paddle/reference.json'), 'w'), ensure_ascii=False)
print('db', len(out['db']['boxes']), 'boxes; ctc', repr(out['ctc']['text']))
