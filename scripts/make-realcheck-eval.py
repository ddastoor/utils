# make-realcheck-eval.py OUT — the set "Is This Screenshot Real?" is measured on (scripts/measure-realcheck.mjs OUT; CLAUDE.md §3).
# Pictures of the repository (the Screenshot Finder's screenshots, the Stitcher's chats and pages, the realcheck receipt, the
# astronaut and the JPEG photos of tests/fixtures/images), in two parts:
#   OUT/jpeg/ — each saved once at ten qualities (s<q>), saved twice (d<q0>-<q1>: q0 below q1, and above), and edited between
#               the two saves (e<q0>-<q1>: a rectangle painted the colour around it and an amount drawn in it — "₹48,213", dark on a
#               light ground, light on a dark one — the way an amount is changed in a payment screenshot);
#   OUT/png/  — each as a PNG that never was a JPEG, a JPEG made a PNG (j<q0>), and a JPEG edited and saved as a PNG (e<q0>).
# OUT/truth.json: for every file its part, kind (screenshot or photo), q1 (the last JPEG save), q0 (the save before it, or null —
# a photo that was a JPEG before it came here counts its own quality, worked out from its tables by Pillow), and the edited box.
# Needs Pillow. Deterministic (fixed seeds).
import json, random, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1])
FONT = ImageFont.truetype(str(ROOT / 'node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf'), 40)
# libjpeg's standard tables (ITU-T T.81 Annex K), in natural order
LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
        18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99]


def scaled(q):
    s = 5000 // q if q < 50 else 200 - 2 * q
    return [min(255, max(1, (v * s + 50) // 100)) for v in LUMA]


def jpeg_quality(path):
    """the libjpeg quality whose standard luminance table the file carries (None: not libjpeg's tables, or not a JPEG)"""
    im = Image.open(path)
    if im.format != 'JPEG':
        return None
    natural = list(im.quantization[0])  # Pillow (12) gives the tables in natural order
    for q in range(1, 101):
        if scaled(q) == natural:
            return q
    return None


def edit(im, rnd):
    """a rectangle painted the colour just above its corner and an amount drawn in it (its box)"""
    w, h = im.size
    x0, y0 = rnd.randrange(40, w - 340), rnd.randrange(h // 5, h - 200)
    box = [x0, y0, x0 + 300, y0 + 70]
    d = ImageDraw.Draw(im)
    ground = im.getpixel((x0 - 5, y0 - 5))
    d.rectangle(box, fill=ground)
    # the amount in a colour that reads on the ground (light on a dark screen), as a forger draws it
    ink = (20, 20, 20) if 0.299 * ground[0] + 0.587 * ground[1] + 0.114 * ground[2] >= 128 else (235, 235, 235)
    d.text((x0 + 8, y0 + 6), '₹%d,%03d' % (rnd.randrange(1, 99), rnd.randrange(0, 999)), font=FONT, fill=ink)
    return box


def main():
    shots = sorted((ROOT / 'tests/fixtures/finder').glob('Screenshot*.png')) + sorted((ROOT / 'tests/fixtures/stitch').glob('chat*-1.png')) + \
        sorted((ROOT / 'tests/fixtures/stitch').glob('web-*.png'))[:2] + [ROOT / 'tests/fixtures/realcheck/receipt-genuine.png']
    photos = [ROOT / 'tests/fixtures/images/astronaut.png'] + [ROOT / 'tests/fixtures/images' / n for n in
                                                              ('book-page.jpg', 'coffee-gps.jpg', 'coffee-orientation6.jpg', 'coffee.jpg')]
    pngs = sorted((ROOT / 'tests/fixtures/finder').glob('Screenshot*.png')) + sorted((ROOT / 'tests/fixtures/stitch').glob('*-1.png')) + \
        sorted((ROOT / 'tests/fixtures/stitch').glob('web-*.png')) + [ROOT / 'tests/fixtures/realcheck/receipt-genuine.png', ROOT / 'tests/fixtures/images/astronaut.png']
    (OUT / 'jpeg').mkdir(parents=True, exist_ok=True)
    (OUT / 'png').mkdir(parents=True, exist_ok=True)
    truth, tmp = {}, OUT / 'tmp.jpg'
    rnd = random.Random(7)
    for src in shots + photos:
        base = Image.open(src).convert('RGB')
        kind = 'photo' if src in photos else 'screenshot'
        if kind == 'screenshot' and base.width > 1000:
            base = base.resize((720, round(base.height * 720 / base.width)), Image.LANCZOS)
        stem, own = src.stem.replace(' ', '_')[:28], jpeg_quality(src)
        for q in (60, 70, 75, 78, 80, 85, 90, 92, 95, 98):
            n = f'jpeg/{stem}-s{q}.jpg'
            base.save(OUT / n, quality=q)
            truth[n] = {'part': 'jpeg', 'kind': kind, 'q1': q, 'q0': own if own and own < q else None, 'edit': None}
        for q0, q1 in ((70, 90), (75, 85), (78, 92), (80, 95), (85, 95), (90, 98), (60, 80), (92, 78), (95, 85)):
            base.save(tmp, quality=q0)
            im = Image.open(tmp).convert('RGB')
            n = f'jpeg/{stem}-d{q0}-{q1}.jpg'
            im.save(OUT / n, quality=q1)
            truth[n] = {'part': 'jpeg', 'kind': kind, 'q1': q1, 'q0': q0, 'edit': None}
            im = Image.open(tmp).convert('RGB')
            box = edit(im, rnd)
            n = f'jpeg/{stem}-e{q0}-{q1}.jpg'
            im.save(OUT / n, quality=q1)
            truth[n] = {'part': 'jpeg', 'kind': kind, 'q1': q1, 'q0': q0, 'edit': box}
    rnd = random.Random(11)
    for src in pngs:
        base = Image.open(src).convert('RGB')
        stem = src.stem.replace(' ', '_')[:28]
        n = f'png/{stem}-png.png'
        base.save(OUT / n)
        truth[n] = {'part': 'png', 'kind': 'photo' if 'astronaut' in stem else 'screenshot', 'q1': None, 'q0': None, 'edit': None}
        for q0 in (60, 75, 85, 92):
            base.save(tmp, quality=q0)
            im = Image.open(tmp).convert('RGB')
            n = f'png/{stem}-j{q0}.png'
            im.save(OUT / n)
            truth[n] = {'part': 'png', 'kind': truth[f'png/{stem}-png.png']['kind'], 'q1': None, 'q0': q0, 'edit': None}
            box = edit(im, rnd)
            n = f'png/{stem}-e{q0}.png'
            im.save(OUT / n)
            truth[n] = {'part': 'png', 'kind': truth[f'png/{stem}-png.png']['kind'], 'q1': None, 'q0': q0, 'edit': box}
    tmp.unlink()
    (OUT / 'truth.json').write_text(json.dumps(truth, indent=0))
    print(len(truth), 'files in', OUT)


main()
