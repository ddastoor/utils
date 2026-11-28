#!/usr/bin/env python3
"""The Clipart Maker's cut-out network as rembg runs it, for the unit suite: tests/fixtures/vector/u2net-<name>.png.

rembg (danielgatis/rembg, MIT) runs U²-Net small like this (sessions/base.py normalize, sessions/u2netp.py predict): the picture
resized to 320 × 320 with PIL's Lanczos filter, divided by its largest value, less ImageNet's means over its deviations, as one
1 × 3 × 320 × 320 tensor; the network's first output stretched to 0 … 1 between its least and greatest value, × 255 as 8-bit grey.
This script does exactly that with ONNX Runtime's Python build on the model the site serves (public/models/u2netp/u2netp.onnx, fetched
by scripts/fetch-assets.mjs) and writes each 320 × 320 mask — the suite holds imgproc.wasm's p_u2_planes and p_u2_mask with ONNX
Runtime Web to it. Needs onnxruntime, Pillow and numpy. Run: python3 scripts/make-u2net-reference.py"""
import os

import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MODEL = os.path.join(ROOT, 'public', 'models', 'u2netp', 'u2netp.onnx')
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'vector')
PICS = {'chelsea': 'tests/fixtures/images/chelsea.png', 'astronaut': 'tests/fixtures/images/astronaut.png', 'coffee': 'tests/fixtures/images/coffee.png'}

sess = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider'])
mean, std = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
for name, rel in PICS.items():
    img = Image.open(os.path.join(ROOT, rel)).convert('RGB')
    im = np.array(img.resize((320, 320), Image.Resampling.LANCZOS)).astype(np.float64)
    im = im / max(np.max(im), 1e-6)
    x = np.zeros((320, 320, 3))
    for c in range(3):
        x[:, :, c] = (im[:, :, c] - mean[c]) / std[c]
    x = np.expand_dims(x.transpose((2, 0, 1)), 0).astype(np.float32)
    pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][:, 0, :, :]
    pred = np.squeeze((pred - pred.min()) / (pred.max() - pred.min()))
    Image.fromarray((pred * 255).astype('uint8'), mode='L').save(os.path.join(OUT, f'u2net-{name}.png'), optimize=True)
    print(name, 'subject share', round(float((pred >= 0.5).mean()), 3))
