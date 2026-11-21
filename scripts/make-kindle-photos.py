#!/usr/bin/env python3
# make-kindle-photos.py OUT [--count N] — test photos for the Photo Dictionary and the OCR tab (owner, 21 Nov 2026: the
# Photo Dictionary "has to work extremely well on my phone, especially when I take pictures of my Kindle" — a Kindle
# Paperwhite — "But it should work for newspapers and other pages also"; and the OCR tab the same). Every photo comes with
# the exact words on it (OUT/<name>.txt) and how it was made (OUT/index.json), so a suite can measure the words read
# right. Deterministic: photo n is made from seed n.
#
# What a phone's photo of a Kindle Paperwhite looks like, and what is modelled here:
#  - the screen: 1236 × 1648 pixels at 300 ppi, light grey e-ink (never white), dark grey text, anti-aliased; a faint
#    ghost of the page before (e-ink keeps a trace); the front light uneven, warm when its "warmth" is up; a header line
#    (the book's title) and a footer ("Location …", "Page … of …", "12%")
#  - the reader's settings: Bookerly — here Literata, Google's reading typeface of the same kind (Bookerly is Amazon's
#    and cannot be used); Amazon Ember — here Noto Sans; Palatino / Baskerville — here Liberation Serif; and a rounded
#    sans, Comfortaa (owner, 21 Nov 2026: "the Kindle's Comforta font"); font sizes 3 – 6; line spacing; justified
#    text with words hyphenated at the end of a line, as the Kindle sets them
#  - the device: the black body around the screen, the screen set slightly into it
#  - the photo: the phone held over the device — turned, tilted (perspective), the device filling 45 – 90 % of the
#    picture, on a table or in a hand; out of focus or shaken a little; sensor noise (more in dim light), vignetting,
#    a lamp's glare on the glass, moiré where the screen's grid and the sensor's beat; the camera's still (4032 × 3024)
#    or a frame of the live video (1920 × 1080), saved as a phone saves a JPEG
#  - printed pages too: a newspaper column (newsprint, small type, two or three columns, a headline) and a book page.
import argparse, json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = {
    'literata': os.path.join(ROOT, 'node_modules/@fontsource/literata/files/literata-latin-400-normal.woff2'),
    'noto-sans': os.path.join(ROOT, 'node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'),
    'liberation-serif': '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
    'comfortaa': os.path.join(ROOT, 'node_modules/@fontsource/comfortaa/files/comfortaa-latin-400-normal.woff2'),
}
BOLD = {'literata': os.path.join(ROOT, 'node_modules/@fontsource/literata/files/literata-latin-700-normal.woff2'),
        'noto-sans': os.path.join(ROOT, 'node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf'),
        'liberation-serif': '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'}

# Original passages (CC0, written for this project), with the uncommon words a reader looks up.
PASSAGES = [
    "The expedition reached the escarpment at dusk, and the cartographer, a taciturn woman with an encyclopaedic memory "
    "for coastlines, unrolled her vellum maps beside the fire. Nobody spoke. The guide, whose garrulous stories had "
    "enlivened the long march, now sat in a lugubrious silence, whittling a stick into something that resembled a "
    "heron. Somewhere below, the river muttered over its stones. She traced the meandering line of the valley with one "
    "finger and frowned: the survey of 1888 was egregiously wrong, and the ford they had been promised did not exist. "
    "In the morning they would have to find another way across, or turn back with nothing to show for it but blisters "
    "and a sheaf of beautiful, useless charts.",
    "His aunt was a formidable woman, imperious in manner and parsimonious with praise, who kept a ledger of every "
    "kindness she had ever done and expected each one to be repaid with interest. She lived in a crenellated house on "
    "the hill, surrounded by topiary peacocks and an ornamental moat that had long since silted up. The villagers "
    "regarded her with a mixture of awe and exasperation. When the vicar, an ingenuous young man fresh from the "
    "seminary, proposed a fete on her lawn, she received him with such glacial courtesy that he left convinced he had "
    "committed some unpardonable solecism, though he could never say exactly what it was.",
    "The laboratory smelled of solder and burnt coffee. Priya adjusted the oscilloscope, watched the waveform settle "
    "into a tremulous sine, and allowed herself a small, sardonic smile. Three months of recalcitrant hardware, of "
    "intermittent faults that vanished whenever anyone came to look, and now the circuit behaved with an almost "
    "obsequious punctuality. She did not trust it. Experience had taught her that a system which worked the first "
    "time was merely waiting for a demonstration in front of the funding committee before it failed in some new and "
    "ingenious way. She wrote everything down, photographed the bench, and went home before the luck could change.",
    "On the third day the fog lifted and the archipelago appeared, a scattering of green islands on a pewter sea. The "
    "captain, a phlegmatic Scot who had sailed these waters for thirty years, pointed out the reefs with the stem of "
    "his pipe and named each island as if introducing old acquaintances. Gulls wheeled above the mast, raucous and "
    "insatiable. The passengers, emboldened by the sunshine, emerged from their cabins pale and blinking, like "
    "creatures released from hibernation, and lined the rail to watch a pod of dolphins cavort in the bow wave. Even "
    "the curmudgeonly professor, who had complained about everything since they left port, was seen to smile.",
]
TITLES = ['The Cartographer', 'A Formidable Aunt', 'Bench Notes', 'The Islands']


def font(name, size, bold=False):
    path = (BOLD if bold else FONTS).get(name) or FONTS[name]
    if not os.path.exists(path):
        sys.exit(f'missing font {path} (npm ci; the Comfortaa test font: npm i -D @fontsource/comfortaa)')
    return ImageFont.truetype(path, size)


def hyphenate(word):
    """Places to break a long word at a line end: after a vowel–consonant pair, keeping three letters on each side
    (enough for a test page; the Kindle uses real hyphenation patterns)."""
    core = word.rstrip('.,;:!?')
    out = []
    for i in range(3, len(core) - 3):
        if core[i - 1] in 'aeiou' and core[i] not in 'aeiou' and core[i + 1] in 'aeiouy':
            out.append(i)
    return out


def set_text(draw, words, fnt, width, rng, hyph=True):
    """Justified lines (the last of a paragraph flush left), with words hyphenated at a line end where a part fits.
    Returns [(words of the line, justified?)], and the words as they end up on the page (a hyphenated word counts as
    the one word it is)."""
    sp = draw.textlength(' ', font=fnt)
    lines, line, w = [], [], 0.0
    i = 0
    while i < len(words):
        word = words[i]
        ww = draw.textlength(word, font=fnt)
        if not line or w + sp + ww <= width:
            line.append(word); w += (sp if len(line) > 1 else 0) + ww; i += 1; continue
        # does a first part of the word fit with a hyphen?
        done = False
        if hyph and rng.random() < 0.85:
            for cut in reversed(hyphenate(word)):
                head = word[:cut] + '-'
                if w + sp + draw.textlength(head, font=fnt) <= width:
                    line.append(head); lines.append((line, True)); line, w = [word[cut:]], draw.textlength(word[cut:], font=fnt)
                    i += 1; done = True; break
        if not done:
            lines.append((line, True)); line, w = [], 0.0
    if line:
        lines.append((line, False))
    return lines


def draw_lines(draw, lines, fnt, x0, y0, width, pitch, ink):
    y = y0
    for words, just in lines:
        total = sum(draw.textlength(t, font=fnt) for t in words)
        gaps = len(words) - 1
        gap = (width - total) / gaps if just and gaps > 0 else draw.textlength(' ', font=fnt)
        x = x0
        for t in words:
            draw.text((x, y), t, font=fnt, fill=ink)
            x += draw.textlength(t, font=fnt) + gap
        y += pitch
    return y


def kindle_screen(rng, passage, title, face, size, spacing, warm):
    """The screen as the Kindle shows it: 1236 × 1648 at 300 ppi, grey e-ink, the page's words."""
    W, H = 1236, 1648
    paper = np.array([228, 227, 222], float) + rng.uniform(-6, 4)
    if warm:  # the front light's warmth turned up: amber
        paper = paper * np.array([1.0, 0.95, 0.82])
    ink = int(rng.uniform(22, 42))
    img = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(img)
    fnt = font(face, size)
    margin = int(rng.uniform(56, 96))
    width = W - 2 * margin
    pitch = int(size * spacing)
    small = font(face, max(18, int(size * 0.55)))
    d.text((margin, 34), title, font=small, fill=ink + 40)
    i0 = PASSAGES.index(passage)
    words = ' '.join(PASSAGES[(i0 + j) % len(PASSAGES)] for j in range(len(PASSAGES))).split()
    lines = set_text(d, words, fnt, width, rng)
    top = 34 + int(size * 1.6)
    room = (H - 120 - top) // pitch
    shown = lines[:room]
    draw_lines(d, shown, fnt, margin, top, width, pitch, ink)
    loc = rng.randrange(800, 6000)
    foot = rng.choice([f'Location {loc}', f'Page {loc // 30} of {loc // 30 + rng.randrange(40, 300)}', f'{rng.randrange(3, 97)}%'])
    d.text((margin, H - 70), foot, font=small, fill=ink + 40)
    # the words on the page, in reading order (a hyphenated word put together again)
    text = []
    for ws, _ in shown:
        text.extend(ws)
    joined, k = [], 0
    while k < len(text):
        t = text[k]
        if t.endswith('-') and k + 1 < len(text) and t[:-1].isalpha():
            joined.append(t[:-1] + text[k + 1]); k += 2; continue
        joined.append(t); k += 1
    # grey levels: ink on e-ink
    a = np.asarray(img, float) / 255.0
    rgb = (a[..., None] * paper + (1 - a[..., None]) * ink)
    # the page before, a faint ghost; the front light uneven; the e-ink's grain
    ghost = Image.new('L', (W, H), 255); gd = ImageDraw.Draw(ghost)
    draw_lines(gd, set_text(gd, ' '.join(PASSAGES[(i0 + 2 + j) % len(PASSAGES)] for j in range(len(PASSAGES))).split(), fnt, width, rng)[:room], fnt, margin + 7, top + 11, width, pitch, 0)
    g = np.asarray(ghost, float) / 255.0
    rgb *= (0.975 + 0.025 * g[..., None])
    yy, xx = np.mgrid[0:H, 0:W] / max(W, H)
    light = 1 + rng.uniform(-0.04, 0.03) * (yy - 0.5) + 0.05 * np.exp(-((yy - 1.05) ** 2) * 18)  # brighter at the light guide
    rgb *= light[..., None]
    rgb += rng_normal(rng, (H, W, 1), 1.6)
    return np.clip(rgb, 0, 255).astype(np.uint8), ' '.join(joined), foot


def device(rng, screen):
    """The Paperwhite: a black body around the screen (narrow at the sides, wider at the bottom), corners rounded."""
    H, W = screen.shape[:2]
    side, top, bottom = int(W * 0.085), int(W * 0.085), int(W * 0.16)
    DW, DH = W + 2 * side, H + top + bottom
    body = np.zeros((DH, DW, 3), np.uint8) + np.array([24, 24, 26], np.uint8)
    body[top:top + H, side:side + W] = screen
    # the screen sits a little into the body: a thin dark line around it
    cv2.rectangle(body, (side - 2, top - 2), (side + W + 1, top + H + 1), (12, 12, 13), 3)
    mask = np.zeros((DH, DW), np.uint8)
    r = int(W * 0.06)
    cv2.rectangle(mask, (r, 0), (DW - r, DH), 255, -1); cv2.rectangle(mask, (0, r), (DW, DH - r), 255, -1)
    for cx, cy in ((r, r), (DW - r, r), (r, DH - r), (DW - r, DH - r)):
        cv2.circle(mask, (cx, cy), r, 255, -1)
    corners = np.float32([[side, top], [side + W, top], [side + W, top + H], [side, top + H]])
    return body, mask, corners


def background(rng, W, H):
    kind = rng.choice(['wood', 'cloth', 'hand', 'desk'])
    base = {'wood': (118, 86, 60), 'cloth': (64, 72, 96), 'hand': (196, 150, 124), 'desk': (176, 172, 166)}[kind]
    bg = np.zeros((H, W, 3), float) + np.array(base, float)
    noise = cv2.resize(rng_normal(rng, (H // 16 + 1, W // 16 + 1, 1), 5), (W, H), interpolation=cv2.INTER_CUBIC)[..., None]
    if kind == 'wood':
        yy = np.arange(H)[:, None]
        bg += (8 * np.sin(yy / 23.0 + 3 * np.sin(np.arange(W)[None, :] / 410.0)))[..., None]
    return np.clip(bg + noise, 0, 255).astype(np.uint8), kind


def rng_normal(rng, shape, sd):
    return np.random.default_rng(rng.randrange(1 << 30)).normal(0, sd, shape)


def photograph(rng, page, mask, corners, out_w, out_h, still):
    """The phone over the page: a homography (turn, tilt, scale), focus and shake, the light, noise, glare, moiré."""
    ph, pw = page.shape[:2]
    fill = rng.uniform(0.55, 0.95)
    s = min(out_w * fill / pw, out_h * fill / ph)
    cx, cy = out_w / 2 + rng.uniform(-0.08, 0.08) * out_w, out_h / 2 + rng.uniform(-0.08, 0.08) * out_h
    ang = math.radians(rng.uniform(-7, 7))
    tilt_x, tilt_y = rng.uniform(-0.12, 0.12), rng.uniform(-0.16, 0.16)  # perspective: the phone not quite parallel
    src = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    dst = []
    for x, y in src:
        u, v = (x - pw / 2) * s, (y - ph / 2) * s
        k = 1 + tilt_x * (u / (pw * s)) + tilt_y * (v / (ph * s))
        u, v = u / k, v / k
        dst.append([cx + u * math.cos(ang) - v * math.sin(ang), cy + u * math.sin(ang) + v * math.cos(ang)])
    Hm = cv2.getPerspectiveTransform(src, np.float32(dst))
    bg, kind = background(rng, out_w, out_h)
    warped = cv2.warpPerspective(page, Hm, (out_w, out_h), flags=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    m = cv2.warpPerspective(mask, Hm, (out_w, out_h), flags=cv2.INTER_LINEAR).astype(float)[..., None] / 255
    img = warped * m + bg * (1 - m)
    # moiré: the screen's pixel grid beating with the sensor's (stronger when the screen is small in the picture)
    screen_q = cv2.perspectiveTransform(corners[None], Hm)[0]
    moire = rng.random() < 0.45
    if moire:
        yy, xx = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
        period = rng.uniform(5, 14) * (out_w / 4032) ** 0.3
        th = rng.uniform(0, math.pi)
        wave = 1 + rng.uniform(0.02, 0.05) * np.sin((xx * math.cos(th) + yy * math.sin(th)) * 2 * math.pi / period)
        smask = np.zeros((out_h, out_w), np.uint8); cv2.fillConvexPoly(smask, screen_q.astype(np.int32), 1)
        img = img * np.where(smask[..., None] > 0, wave[..., None], 1)
    # light: the room's light from one side, vignetting, exposure
    yy, xx = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
    gx, gy = rng.uniform(-1, 1), rng.uniform(-1, 1)
    grad = 1 + 0.16 * (gx * (xx / out_w - 0.5) + gy * (yy / out_h - 0.5))
    vig = 1 - 0.28 * (((xx / out_w - 0.5) ** 2 + (yy / out_h - 0.5) ** 2) / 0.5)
    expo = rng.uniform(0.82, 1.08)
    img = img * (grad * vig * expo)[..., None]
    # a lamp's glare on the glass: bright, low in contrast
    glare = rng.random() < 0.4
    if glare:
        gx0, gy0 = rng.uniform(0.25, 0.75) * out_w, rng.uniform(0.2, 0.8) * out_h
        r = rng.uniform(0.06, 0.16) * out_w
        spot = np.exp(-(((xx - gx0) ** 2 + ((yy - gy0) * 1.6) ** 2) / (2 * r * r)))
        a = rng.uniform(0.35, 0.7) * spot
        img = img * (1 - a[..., None]) + 250 * a[..., None]
    # focus and shake (in the photo's own pixels)
    # the lens and the focus: a still from slightly soft to in focus (σ 0.8 – 3 px of 4032), a video frame a little softer
    # than its own pixels (σ 0.6 – 1.6 px of 1080 – 1920: compressed, no still processing)
    k = max(out_w, out_h) / 4032
    blur = rng.uniform(0.8, 3.0) * k if still else rng.uniform(0.6, 1.6)
    img = cv2.GaussianBlur(img.astype(np.float32), (0, 0), max(0.3, blur))
    if rng.random() < 0.35:
        n = max(3, int(rng.uniform(3, 9) * k * 4)) | 1
        kern = np.zeros((n, n), np.float32); a = rng.uniform(0, math.pi)
        cv2.line(kern, (n // 2 - int(n / 2 * math.cos(a)), n // 2 - int(n / 2 * math.sin(a))), (n // 2 + int(n / 2 * math.cos(a)), n // 2 + int(n / 2 * math.sin(a))), 1, 1)
        img = cv2.filter2D(img, -1, kern / kern.sum())
    # sensor noise: more in dim light; a phone's noise reduction smooths it again a little
    dim = 1.08 - expo
    sd = 2.0 + 18 * max(0, dim)
    img = img + rng_normal(rng, img.shape[:2] + (1,), sd).astype(np.float32) + rng_normal(rng, img.shape, sd * 0.3).astype(np.float32)
    img = np.clip(img, 0, 255).astype(np.uint8)
    if still:
        img = cv2.bilateralFilter(img, 5, 12, 3)
    return img, {'fill': round(fill, 2), 'turn': round(math.degrees(ang), 1), 'tilt': [round(tilt_x, 3), round(tilt_y, 3)], 'background': kind,
                 'moire': moire, 'glare': glare, 'blur': round(blur, 2), 'exposure': round(expo, 2),
                 'screen': [[round(float(a), 1), round(float(b), 1)] for a, b in screen_q]}


def newspaper(rng):
    """A newspaper page: newsprint, a headline, two or three columns of small type."""
    W, H = 2400, 3000
    paper = np.array([222, 217, 203], float) + rng.uniform(-8, 4)
    img = Image.new('L', (W, H), 255); d = ImageDraw.Draw(img)
    face = rng.choice(['liberation-serif', 'noto-sans'])
    cols = rng.choice([2, 3])
    head = font(face, 92, bold=True)
    passage = rng.choice(PASSAGES)
    d.text((110, 90), rng.choice(['Survey Error Strands Expedition', 'Village Fete Plan Collapses', 'Lab Circuit Works At Last']), font=head, fill=20)
    size = rng.choice([34, 38, 42])
    fnt = font(face, size)
    gutter = 60
    colw = (W - 220 - gutter * (cols - 1)) // cols
    words = ' '.join(PASSAGES[(PASSAGES.index(passage) + j) % len(PASSAGES)] for j in range(len(PASSAGES) * 2)).split()  # every column full
    lines = set_text(d, words, fnt, colw, rng)
    pitch = int(size * 1.28)
    per = (H - 400) // pitch
    shown = []
    for c in range(cols):
        part = lines[c * per:(c + 1) * per]
        draw_lines(d, part, fnt, 110 + c * (colw + gutter), 300, colw, pitch, 25)
        shown.extend(part)
    text, k, flat = [], 0, [t for ws, _ in shown for t in ws]
    while k < len(flat):
        t = flat[k]
        if t.endswith('-') and k + 1 < len(flat) and t[:-1].isalpha():
            text.append(t[:-1] + flat[k + 1]); k += 2; continue
        text.append(t); k += 1
    a = np.asarray(img, float) / 255.0
    rgb = a[..., None] * paper + (1 - a[..., None]) * 30
    rgb += rng_normal(rng, (H, W, 1), 3)
    mask = np.full((H, W), 255, np.uint8)
    corners = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    return np.clip(rgb, 0, 255).astype(np.uint8), mask, corners, ' '.join(text), {'face': face, 'columns': cols, 'fontSize': size}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--count', type=int, default=24); ap.add_argument('--first', type=int, default=0)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    index = []
    faces = ['literata', 'noto-sans', 'liberation-serif', 'comfortaa']
    for n in range(a.first, a.first + a.count):
        rng = random.Random(n)
        still = rng.random() < 0.67             # two of three are the camera's still, one a video frame
        portrait = rng.random() < 0.7
        ow, oh = (3024, 4032) if still else (1080, 1920)
        if not portrait:
            ow, oh = oh, ow
        if n % 6 == 5:                          # every sixth: a newspaper
            page, mask, corners, text, info = newspaper(rng)
            kind = 'newspaper'
        else:
            face = faces[n % len(faces)]
            size = rng.choice([30, 36, 42, 50])
            p = rng.randrange(len(PASSAGES))
            screen, text, foot = kindle_screen(rng, PASSAGES[p], TITLES[p], face, size, rng.uniform(1.35, 1.7), rng.random() < 0.3)
            page, mask, corners = device(rng, screen)
            info = {'face': face, 'fontSize': size, 'footer': foot}
            kind = 'kindle'
        photo, cam = photograph(rng, page, mask, corners, ow, oh, still)
        name = f'{kind}-{n:02d}'
        q = rng.randrange(80, 93)
        cv2.imwrite(os.path.join(a.out, name + '.jpg'), cv2.cvtColor(photo, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])
        open(os.path.join(a.out, name + '.txt'), 'w', encoding='utf-8').write(text + '\n')
        index.append({'name': name, 'kind': kind, 'still': still, 'size': [ow, oh], 'jpeg': q, **info, **cam})
        print(name, kind, 'still' if still else 'frame', f'{ow}x{oh}', info.get('face'), info.get('fontSize'))
    json.dump(index, open(os.path.join(a.out, 'index.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
