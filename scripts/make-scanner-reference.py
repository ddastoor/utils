#!/usr/bin/env python3
# Reference for tests/unit/pagefind.test.mjs: OpenCV's area resize (cv2.resize with INTER_AREA). The Doc Scanner's
# page model was trained on photos made 224 × 224 this way, so imgproc.wasm's p_resize_area must give the same pixels.
# The source pictures are made from a formula that the unit suite repeats (no source is stored); only OpenCV's output
# is written. Needs: pip install opencv-python-headless numpy
#   python3 scripts/make-scanner-reference.py  →  tests/fixtures/scanner/resize-area.json
import base64, json, os
import numpy as np
import cv2

M = 0xFFFFFFFF


def picture(kind, w, h):
    """The same pictures as `picture()` in the unit suite: 'noise' (a hash of x, y, channel), 'ramp' (gradients),
    'edges' (a checkerboard of 7-pixel squares with a diagonal) — opaque RGBA."""
    a = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            for c in range(3):
                if kind == 'noise':
                    v = (((x * 73856093) & M) ^ ((y * 19349663) & M) ^ (((c + 1) * 83492791) & M)) >> 8 & 255
                elif kind == 'ramp':
                    v = (x * 255 // max(1, w - 1) + c * 40 + y * 3) % 256
                else:
                    v = 230 if ((x // 7) + (y // 7)) % 2 == 0 else 25
                    if abs(x - y) < 2: v = 128 + c * 20
                a[y, x, c] = v
            a[y, x, 3] = 255
    return a


CASES = [  # (kind, w, h, dw, dh) — shrinking by whole and odd factors, enlarging, mixed, the tab's own factor (≈ 4.9)
    ('noise', 37, 23, 10, 7), ('ramp', 64, 48, 16, 12), ('edges', 50, 50, 50, 50), ('noise', 30, 20, 71, 45),
    ('edges', 120, 40, 90, 60), ('ramp', 491, 367, 60, 45), ('noise', 491, 367, 100, 75),
    ('edges', 9, 5, 3, 2), ('ramp', 1, 1, 3, 3), ('noise', 40, 40, 40, 40), ('edges', 300, 7, 61, 3),
]

out = []
for kind, w, h, dw, dh in CASES:
    src = picture(kind, w, h)
    res = cv2.resize(src, (dw, dh), interpolation=cv2.INTER_AREA)
    out.append({'kind': kind, 'w': w, 'h': h, 'dw': dw, 'dh': dh, 'out': base64.b64encode(res.tobytes()).decode()})
dest = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'scanner', 'resize-area.json')
os.makedirs(os.path.dirname(dest), exist_ok=True)
json.dump({'opencv': cv2.__version__, 'cases': out}, open(dest, 'w'), indent=0)
print(f'{len(out)} cases → {os.path.relpath(dest)} (OpenCV {cv2.__version__})')
