#!/usr/bin/env python3
"""The Cartoonizer's anime looks (src/lib/anime.ts) — three things made from the four ONNX graphs in public/models/animegan
(node scripts/fetch-assets.mjs first) by NATIVE ONNX Runtime (pip install onnxruntime numpy pillow):

1. tests/fixtures/anime/<look>.png — the reference of tests/unit/anime.test.mjs: a 100 × 66 crop of the scikit-image coffee photo
   (CC0; 100 × 66 is no multiple of 8, so the padding is tested) drawn in each look as AnimeGAN's own code and bryandlee's make it —
   RGB as x / 127.5 − 1, the last row and column repeated to a multiple of 8 (512 × 512 for the face portrait), the output's
   (y + 1) × 127.5 held to 0 … 255 and truncated, the padding cut off. The suite runs src/lib/anime.ts on ONNX Runtime Web and must
   give these pixels, within a step of rounding.
2. tests/fixtures/anime/blocks.json — the reference of tests/e2e/cartoon-anime.e2e.mjs: each look on a whole photo the tab draws at
   its own size (the coffee photo, 600 × 400, for the scene looks; the astronaut, 512 × 512, for the face portrait), as the mean
   colour of every 20 × 20 block — the tab's canvas is held to it.
3. public/data/anime/<look>.jpg — the tiles the tab shows for the looks (160 px): the coffee photo for the three scene looks, the
   astronaut's face (public domain, NASA) for the face portrait.

    python3 scripts/make-anime-reference.py
"""
import os, sys
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MODELS = os.path.join(ROOT, 'public', 'models', 'animegan')
LOOKS = [('hayao', 'AnimeGANv2_Hayao.onnx', 'nhwc'), ('shinkai', 'AnimeGANv2_Shinkai.onnx', 'nhwc'),
         ('paprika', 'AnimeGANv2_Paprika.onnx', 'nhwc'), ('face', 'face_paint_512_v2.onnx', 'nchw512')]

def draw(sess, rgb, layout):
    h, w, _ = rgb.shape
    H, W = (512, 512) if layout == 'nchw512' else ((h + 7) // 8 * 8, (w + 7) // 8 * 8)
    x = np.pad(rgb.astype(np.float32) / 127.5 - 1, ((0, H - h), (0, W - w), (0, 0)), mode='edge')
    x = x[None] if layout == 'nhwc' else x.transpose(2, 0, 1)[None]
    y = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]
    if layout != 'nhwc':
        y = y.transpose(1, 2, 0)
    return np.clip((y[:h, :w] + 1) * 127.5, 0, 255).astype(np.uint8)  # astype truncates, as the reference code does

def main():
    so = ort.SessionOptions(); so.intra_op_num_threads = 1
    coffee = np.asarray(Image.open(os.path.join(ROOT, 'tests', 'fixtures', 'images', 'coffee.png')).convert('RGB'))
    crop = coffee[140:206, 200:300]  # 100 × 66: the cup's rim and the saucer
    face = np.asarray(Image.open(os.path.join(ROOT, 'tests', 'fixtures', 'images', 'astronaut.png')).convert('RGB'))
    face = np.asarray(Image.fromarray(face[0:300, 100:400]).resize((512, 512), Image.LANCZOS))
    fix = os.path.join(ROOT, 'tests', 'fixtures', 'anime'); os.makedirs(fix, exist_ok=True)
    tiles = os.path.join(ROOT, 'public', 'data', 'anime'); os.makedirs(tiles, exist_ok=True)
    Image.fromarray(crop).save(os.path.join(fix, 'input.png'))
    astro = np.asarray(Image.open(os.path.join(ROOT, 'tests', 'fixtures', 'images', 'astronaut.png')).convert('RGB'))
    blocks = {}
    for look, file, layout in LOOKS:
        sess = ort.InferenceSession(os.path.join(MODELS, file), so, providers=['CPUExecutionProvider'])
        whole = draw(sess, coffee if layout == 'nhwc' else astro, layout).astype(np.float64)
        H, W = whole.shape[0] // 20, whole.shape[1] // 20
        blocks[look] = {'photo': 'coffee.png' if layout == 'nhwc' else 'astronaut.png', 'width': whole.shape[1], 'height': whole.shape[0],
                        'means': np.round(whole[:H * 20, :W * 20].reshape(H, 20, W, 20, 3).mean(axis=(1, 3)), 2).reshape(-1).tolist()}
        Image.fromarray(draw(sess, crop, layout)).save(os.path.join(fix, f'{look}.png'))
        if layout == 'nhwc':
            small = np.asarray(Image.fromarray(coffee).resize((480, 320), Image.LANCZOS))
            tile = Image.fromarray(draw(sess, small, layout)).resize((160, 107), Image.LANCZOS)
        else:
            tile = Image.fromarray(draw(sess, face, layout)).resize((160, 160), Image.LANCZOS)
        tile.save(os.path.join(tiles, f'{look}.jpg'), quality=82, optimize=True, progressive=True)
        print(look, 'reference and tile made')
    import json
    with open(os.path.join(fix, 'blocks.json'), 'w') as f:
        json.dump(blocks, f, separators=(',', ':'))

if __name__ == '__main__':
    sys.exit(main())
