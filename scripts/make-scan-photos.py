#!/usr/bin/env python3
# Test photos for the Doc Scanner (tests/unit/pagefind.test.mjs, tests/e2e/scanner.e2e.mjs): a document "photographed"
# on a desk — paper with text, a receipt, a magazine page — put into a photo with perspective, light, shadows, a thumb,
# blur, noise and JPEG, so that the four corners are known exactly. Nothing here was ever seen by the page model.
# Backgrounds: scikit-image's sample photos (BSD-3 data) and plain desks made here; text in Noto Sans (OFL).
# Needs: pip install scikit-image pillow numpy.   python3 scripts/make-scan-photos.py → tests/fixtures/scanner/
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import skimage.data as skd

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'tests', 'fixtures', 'scanner')
D = os.path.dirname(skd.__file__)
FONT = os.path.join(HERE, '..', 'node_modules', '@expo-google-fonts', 'noto-sans', '400Regular', 'NotoSans_400Regular.ttf')
if not os.path.exists(FONT):
    import glob
    FONT = glob.glob(os.path.join(HERE, '..', 'node_modules', '@expo-google-fonts', 'noto-sans', '**', 'NotoSans_400Regular.ttf'), recursive=True)[0]
WORDS = 'the quick brown fox jumps over a lazy dog while seven bold wizards quietly judge zesty jam'.split()


def rng(seed): return np.random.default_rng(seed)


def bg_photo(name, W, H, zoom, at):
    im = Image.open(os.path.join(D, name)).convert('RGB')
    s = max(W / im.width, H / im.height) * zoom
    im = im.resize((math.ceil(im.width * s), math.ceil(im.height * s)), Image.LANCZOS)
    x, y = int((im.width - W) * at[0]), int((im.height - H) * at[1])
    return im.crop((x, y, x + W, y + H))


def bg_desk(W, H, grey, seed, grain=True):
    r = rng(seed)
    a = np.ones((H, W, 3)) * np.array(grey, float)
    if grain:
        yy = np.arange(H)[:, None]; xx = np.arange(W)[None, :]
        a += (6 * np.sin(yy / 5.5 + np.sin(xx / 60) * 3))[..., None]
    a += r.normal(0, 3, (H, W, 1))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def doc_text(w, h, seed, paper=(246, 243, 236)):
    r = rng(seed); im = Image.new('RGB', (w, h), paper); g = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, max(10, h // 45)); big = ImageFont.truetype(FONT, max(12, h // 28))
    y = int(h * 0.07); g.text((int(w * 0.08), y), 'INVOICE  No. 2026-%03d' % (seed % 1000), fill=(20, 20, 20), font=big)
    y += int(h * 0.08)
    while y < h * 0.9:
        g.text((int(w * 0.08), y), ' '.join(WORDS[i] for i in r.integers(0, len(WORDS), int(r.integers(6, 11)))), fill=(30, 30, 35), font=f)
        y += int(h / 45 * 1.6)
    return im


def doc_magazine(w, h, seed, photo):
    im = doc_text(w, h, seed, (250, 250, 250)); ph = Image.open(os.path.join(D, photo)).convert('RGB').resize((int(w * 0.84), int(h * 0.4)))
    im.paste(ph, (int(w * 0.08), int(h * 0.3))); return im


def homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
    return np.linalg.solve(np.array(A, float), np.array([c for p in dst for c in p], float))


def shoot(name, W, H, bg, doc, corners, seed, thumb=None, band=None, light=(0.85, 1.0, 0.95, 0.85), blur=0.8, noise=3, quality=85, note=''):
    dw, dh = doc.size
    Hm = homography(corners, [(0, 0), (dw, 0), (dw, dh), (0, dh)])  # photo pixel → document pixel
    warped = doc.transform((W, H), Image.PERSPECTIVE, tuple(Hm), Image.BICUBIC)
    mask = Image.new('L', (dw, dh), 255).transform((W, H), Image.PERSPECTIVE, tuple(Hm), Image.BILINEAR)
    shadow = Image.new('L', (W, H), 0); shadow.paste(mask.filter(ImageFilter.GaussianBlur(8)), (6, 7))
    img = np.array(bg, float) * (1 - np.array(shadow, float)[..., None] / 255 * 0.35)
    m = np.array(mask, float)[..., None] / 255
    img = img * (1 - m) + np.array(warped, float) * m
    if thumb is not None:  # a thumb over the middle of one edge (a page held up)
        a, b = corners[thumb], corners[(thumb + 1) % 4]; px, py = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        t = Image.new('L', (W, H), 0); ImageDraw.Draw(t).ellipse((px - 45, py - 70, px + 45, py + 70), fill=255)
        t = np.array(t.filter(ImageFilter.GaussianBlur(3)), float)[..., None] / 255
        img = img * (1 - t) + np.array([205, 150, 120], float) * t
    gx = np.linspace(light[0], light[1], W)[None, :, None]; gy = np.linspace(light[2], light[3], H)[:, None, None]
    img = img * gx * gy
    if band is not None:  # a soft shadow across part of the page
        t = Image.new('L', (W, H), 0); ImageDraw.Draw(t).polygon(band, fill=255)
        img = img * (1 - np.array(t.filter(ImageFilter.GaussianBlur(25)), float)[..., None] / 255 * 0.4)
    img += rng(seed).normal(0, noise, img.shape)
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    if blur: out = out.filter(ImageFilter.GaussianBlur(blur))
    out.save(os.path.join(OUT, name + '.jpg'), quality=quality, optimize=True)
    return {'name': name + '.jpg', 'width': W, 'height': H, 'corners': [round(c, 2) for p in corners for c in p], 'note': note}


def placed(cx, cy, w, h, deg, keystone=0.0, far=0):
    """Corners TL TR BR BL of a w × h page centred at (cx, cy), turned by deg, the edge `far` (0 top, 1 right …) narrowed
    by `keystone` × its length (seen from an angle)."""
    a = math.radians(deg); pts = []
    for x, y in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]:
        pts.append([cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)])
    p, q = pts[far], pts[(far + 1) % 4]; mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
    for v in (p, q):
        v[0] -= (v[0] - mx) * keystone; v[1] -= (v[1] - my) * keystone
    return [tuple(v) for v in pts]


os.makedirs(OUT, exist_ok=True)
items = []
W, H = 825, 1100
items.append(shoot('white-page-light-desk', W, H, bg_desk(W, H, (214, 210, 204), 1), doc_text(700, 990, 11),
                   placed(410, 560, 560, 790, 7, 0.06, 0), 1, note='white paper on a light desk (the outline finder takes the desk)'))
items.append(shoot('receipt-dark-wood', W, H, bg_desk(W, H, (58, 40, 30), 2), doc_text(300, 900, 12, (250, 250, 248)),
                   placed(400, 540, 260, 780, -9, 0.05, 2), 2, note='a receipt on dark wood'))
items.append(shoot('magazine-brick', 1100, 825, bg_photo('brick.png', 1100, 825, 1.2, (0.3, 0.6)), doc_magazine(700, 990, 13, 'astronaut.png'),
                   placed(560, 410, 430, 610, 14, 0.04, 1), 3, note='a magazine page on bricks'))
items.append(shoot('page-held-thumb', W, H, bg_photo('coffee.png', W, H, 1.3, (0.5, 0.4)), doc_text(700, 990, 14),
                   placed(420, 545, 600, 850, -4, 0.03, 0), 4, thumb=3, note='a page held up, a thumb over its left edge'))
items.append(shoot('shadow-grey-desk', W, H, bg_desk(W, H, (188, 190, 192), 5, grain=False), doc_text(700, 990, 15),
                   placed(400, 560, 520, 735, 12, 0.08, 0), 5, band=[(300, 0), (520, 0), (380, 1100), (150, 1100)], note='a shadow across the page, grey desk'))
items.append(shoot('page-gravel-angle', 1100, 825, bg_photo('gravel.png', 1100, 825, 1.1, (0.2, 0.2)), doc_text(700, 990, 16),
                   placed(540, 420, 470, 660, -18, 0.14, 0), 6, note='seen from an angle on gravel'))
json.dump({'note': 'Corners TL TR BR BL in pixels of each photo; made by scripts/make-scan-photos.py', 'photos': items},
          open(os.path.join(OUT, 'photos.json'), 'w'), indent=1)
print(len(items), 'photos →', os.path.relpath(OUT))
