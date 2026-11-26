#!/usr/bin/env python3
# make-doc-photos.py OUT — photographs of the formatted pages of scripts/make-format-docs.mjs (OUT/pages/<name>.png and
# .txt), for scripts/measure-ocr.mjs (to-do #18: the OCR tab and the Photo Dictionary on documents with bullets,
# indentation, tables, columns and watermarks, "especially using the phone camera"). For every page:
#   OUT/<name>-scan.jpg   the page as a scanner gives it (200 dpi, no camera) — what the layout alone does to the reading
#   OUT/<name>-still.jpg  a phone's still (3024 × 4032), the camera model of scripts/make-kindle-photos.py: the page held
#                         under the phone — turned, tilted, on a table or in a hand, soft or shaken a little, the room's
#                         light, noise, a lamp's glare (paper: no moiré)
#   OUT/<name>-frame.jpg  a frame of the live video (1080 × 1920): the whole page small in the picture, as a webcam sees it
# each with <name>-….txt (the page's words) and OUT/index.json. Deterministic (the seed is the page's name; with
# PHOTO_SALT=<text> in the environment, the name and the salt: the same pages photographed anew — a second set to check
# a rule worked out on the first).
import importlib.util, json, os, random, sys, zlib
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('kindle', os.path.join(HERE, 'make-kindle-photos.py'))
kindle = importlib.util.module_from_spec(spec); spec.loader.exec_module(kindle)


def main():
    out = sys.argv[1]
    pages = sorted(f[:-4] for f in os.listdir(os.path.join(out, 'pages')) if f.endswith('.png'))
    index = []
    for name in pages:
        text = open(os.path.join(out, 'pages', name + '.txt'), encoding='utf-8').read()
        im = Image.open(os.path.join(out, 'pages', name + '.png')).convert('RGB')
        # the scan: 200 dpi (A4 = 1654 px wide)
        scan = im.resize((1654, round(im.height * 1654 / im.width)), Image.LANCZOS)
        scan.save(os.path.join(out, name + '-scan.jpg'), quality=92)
        open(os.path.join(out, name + '-scan.txt'), 'w', encoding='utf-8').write(text)
        index.append({'name': name + '-scan', 'page': name, 'kind': 'scan'})
        page = np.asarray(im)
        mask = np.full(page.shape[:2], 255, np.uint8)
        none = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]])  # no screen on paper: no moiré
        for kind, (ow, oh), still in (('still', (3024, 4032), True), ('frame', (1080, 1920), False)):
            rng = random.Random(zlib.crc32(f'{os.environ.get("PHOTO_SALT", "")}{name}-{kind}'.encode()))
            # held steadier than a hurried shot of a Kindle: a softer focus at worst, a short streak of shake now and then
            photo, cam = kindle.photograph(rng, page, mask, none, ow, oh, still, soft=(0.7, 1.8), shake=(0.25, 1, 3))
            q = rng.randrange(82, 93)
            cv2.imwrite(os.path.join(out, f'{name}-{kind}.jpg'), cv2.cvtColor(photo, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])
            open(os.path.join(out, f'{name}-{kind}.txt'), 'w', encoding='utf-8').write(text)
            index.append({'name': f'{name}-{kind}', 'page': name, 'kind': kind, 'size': [ow, oh], 'jpeg': q, **{k: v for k, v in cam.items() if k != 'screen'}})
        print(name, 'scan · still · frame')
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
