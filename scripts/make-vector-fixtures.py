#!/usr/bin/env python3
"""Test pictures of the Image to SVG tab (potentials #1), with what is known about each: tests/fixtures/vector/.

  logo.png       a flat logo (640 × 400): a red disc in a black ring, a blue rounded square with a white bar across it, a yellow
                 triangle, on white — drawn at 4× and made smaller, so its edges are smooth as a real logo's are. Its five colours
                 are in truth.json; a tracing is held to it pixel by pixel (the nearest of the five colours).
  signature.jpg  a signature photographed on paper (640 × 300): blue ink, the paper lit unevenly (brighter at the left, a shadow at
                 a corner), a camera's noise, JPEG at 85. signature-mask.png is the ink as it was drawn (white on black): a tracing
                 in black and white is held to it.
  pixel.png      pixel art, 24 × 24 pixels in six colours: traced as pixels it must give every pixel back exactly.

Needs Pillow and numpy. Run: python3 scripts/make-vector-fixtures.py (deterministic: a fixed seed)."""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures', 'vector')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20261128)

# ---------------------------------------------------------------- the logo
S = 4
W, H = 640, 400
COL = {'white': (255, 255, 255), 'red': (214, 40, 40), 'blue': (29, 78, 216), 'yellow': (244, 180, 0), 'black': (17, 17, 17)}
big = Image.new('RGB', (W * S, H * S), COL['white'])
d = ImageDraw.Draw(big)


def circle(cx, cy, r, fill):
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=fill)


circle(150, 200, 122, COL['black'])
circle(150, 200, 108, COL['white'])
circle(150, 200, 96, COL['red'])
d.rounded_rectangle([300 * S, 100 * S, 470 * S, 300 * S], radius=30 * S, fill=COL['blue'])
d.rectangle([325 * S, 188 * S, 445 * S, 212 * S], fill=COL['white'])
d.polygon([(495 * S, 300 * S), (625 * S, 300 * S), (560 * S, 105 * S)], fill=COL['yellow'])
logo = big.resize((W, H), Image.LANCZOS)
logo.save(os.path.join(OUT, 'logo.png'), optimize=True)

# ---------------------------------------------------------------- the signature
SW, SH = 640, 300
mask_big = Image.new('L', (SW * S, SH * S), 0)
md = ImageDraw.Draw(mask_big)


def stroke(points, w0, w1):
    """a pen's stroke: discs along the points, the width going from w0 to w1 and back (the pressure)"""
    n = len(points)
    for i, (x, y) in enumerate(points):
        t = i / max(1, n - 1)
        w = w0 + (w1 - w0) * math.sin(math.pi * t)
        r = w * S / 2
        md.ellipse([x * S - r, y * S - r, x * S + r, y * S + r], fill=255)


def path(f, n=2400):
    return [f(i / (n - 1)) for i in range(n)]


# a cursive name: loops along a baseline, then a flourish and an underline
stroke(path(lambda t: (70 + 330 * t + 28 * math.sin(14 * math.pi * t), 150 - 48 * math.sin(7 * math.pi * t) ** 2 + 18 * math.cos(14 * math.pi * t))), 2.6, 5.2)
stroke(path(lambda t: (400 + 150 * t, 160 - 70 * math.sin(math.pi * t) + 25 * math.sin(4 * math.pi * t))), 2.4, 4.6)
stroke(path(lambda t: (90 + 470 * t, 215 + 14 * math.sin(math.pi * t) - 6 * t)), 2.2, 3.8)
mask = mask_big.resize((SW, SH), Image.LANCZOS)
Image.fromarray(((np.asarray(mask) >= 128) * 255).astype(np.uint8)).save(os.path.join(OUT, 'signature-mask.png'), optimize=True)

# paper lit unevenly, the ink on it, a camera's noise and softness
yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32)
light = 1.0 - 0.18 * (xx / SW) - 0.10 * (yy / SH)
light -= 0.22 * np.exp(-(((xx - SW) ** 2 + (yy - SH) ** 2) / (2 * 120.0 ** 2)))  # a shadow at the bottom right
paper = np.stack([238 * light, 233 * light, 222 * light], -1)
ink = np.array([22, 32, 96], np.float32)
a = (np.asarray(mask.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255.0)[..., None]
photo = paper * (1 - a) + ink * a
photo += rng.normal(0, 3.5, photo.shape)
Image.fromarray(np.clip(photo, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'signature.jpg'), quality=85)

# ---------------------------------------------------------------- pixel art
PAL = [(255, 255, 255), (20, 20, 20), (230, 60, 60), (255, 200, 40), (60, 140, 230), (90, 190, 90)]
art = np.zeros((24, 24), np.uint8)
yy, xx = np.mgrid[0:24, 0:24]
art[(xx - 11.5) ** 2 + (yy - 11.5) ** 2 <= 10.5 ** 2] = 3           # a yellow face
ring = ((xx - 11.5) ** 2 + (yy - 11.5) ** 2 <= 11.5 ** 2) & (art == 0)
art[ring] = 1                                                        # its outline
art[7:10, 7:10] = 1; art[7:10, 14:17] = 1                            # eyes
art[8, 8] = 0; art[8, 15] = 0                                         # their shine
art[15, 7:17] = 2; art[16, 8:16] = 2; art[14, 6] = 2; art[14, 17] = 2  # a red smile
art[0:3, 0:3] = 4; art[21:24, 21:24] = 5                              # two corner blocks
rgb = np.array(PAL, np.uint8)[art]
Image.fromarray(rgb).save(os.path.join(OUT, 'pixel.png'), optimize=True)

truth = {
    'logo': {'size': [W, H], 'colours': [list(c) for c in COL.values()]},
    'signature': {'size': [SW, SH], 'ink': [22, 32, 96], 'mask': 'signature-mask.png'},
    'pixel': {'size': [24, 24], 'palette': [list(c) for c in PAL]},
}
with open(os.path.join(OUT, 'truth.json'), 'w') as f:
    json.dump(truth, f, indent=1)
print('wrote', sorted(os.listdir(OUT)), file=sys.stderr)
