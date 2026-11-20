#!/usr/bin/env python3
"""HEIC colour reference for tests/unit/heic.test.mjs and the HEIC e2e suite.
Makes tests/fixtures/images/p3-colours.heic — 96 × 64 patches of saturated colours in Display P3, carrying the Display P3
ICC profile of pug.heic (as an iPhone does) — and writes what pillow-heif decodes and Pillow's ImageCms (LittleCMS)
makes of both HEIC fixtures in sRGB (relative colorimetric), at sample points.
    pip install pillow-heif;  python3 scripts/make-heic-reference.py"""
import io, json, os
import pillow_heif
from PIL import Image, ImageCms
pillow_heif.register_heif_opener()
root = os.path.join(os.path.dirname(__file__), '..')
fx = lambda *p: os.path.join(root, 'tests', 'fixtures', *p)
icc = Image.open(fx('images', 'pug.heic')).info['icc_profile']
cols = [(220, 40, 40), (40, 200, 60), (40, 70, 220), (230, 200, 40), (200, 60, 200), (128, 128, 128)]
im = Image.new('RGB', (96, 64))
for i, c in enumerate(cols):
    x0, y0 = (i % 3) * 32, (i // 3) * 32
    for x in range(x0, x0 + 32):
        for y in range(y0, y0 + 32): im.putpixel((x, y), c)
im.save(fx('images', 'p3-colours.heic'), quality=-1, icc_profile=icc)  # lossless
srgb = ImageCms.createProfile('sRGB')
out = {}
for name, pts in [('p3-colours.heic', [((i % 3) * 32 + 16, (i // 3) * 32 + 16) for i in range(6)]), ('pug.heic', [(806, 604), (2016, 1512), (3225, 907), (1209, 2419), (2016, 302)])]:
    h = Image.open(fx('images', name)); rgb = h.convert('RGB')
    conv = ImageCms.profileToProfile(rgb, ImageCms.ImageCmsProfile(io.BytesIO(h.info['icc_profile'])), srgb, renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC, outputMode='RGB')
    out[name] = {'size': list(h.size), 'points': pts, 'decoded': [list(rgb.getpixel(p)) for p in pts], 'srgb': [list(conv.getpixel(p)) for p in pts]}
json.dump({'made_by': 'scripts/make-heic-reference.py (pillow-heif + Pillow ImageCms)', 'files': out}, open(fx('heic', 'reference.json'), 'w'), indent=1)
print(json.dumps(out)[:600])
