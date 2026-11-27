#!/usr/bin/env python3
# make-book-photos.py OUT [--count N] [--first K] [--focal F] — photos of an open printed book, for the Book Page Flattener (potentials
# #96; owner, 21 Nov 2026: "the OCR tab and the Photo Dictionary then read printed books as well as a Kindle page") and for
# the OCR and the Photo Dictionary on printed books. Every photo comes with the exact words on it — OUT/<name>.txt (the
# left page first), <name>.left.txt and <name>.right.txt —, the pages as they were printed (<name>.left.png, .right.png) and
# how it was made (OUT/index.json), so a suite can measure the words read right. Deterministic: photo n is made from seed n.
#
# What is modelled:
#  - two printed pages of a book (or one page): a running head, a page number, justified text in a book face, words
#    hyphenated at a line end;
#  - the paper: each page rises from the spine and levels out — its slope falls off from the spine, θ(s) = θ0·e^(−s/L),
#    the outer edge drooping a little, a different curl for each page and a slight change along the spine. Neither
#    page-dewarp's cubic sheet nor Leptonica's disparity model: a flattener is not tested on its own assumption;
#  - the light: the room's light on the paper's slope, the gutter in shadow, the paper's tint, the table around the book;
#  - the photo: a phone above the book — a still (4032 × 3024) or a frame of the live video (1920 × 1080) — turned, tilted,
#    the book filling 55 – 90 % of it; focus, shake, noise, saved as a phone saves a JPEG. A ray from the camera through
#    each pixel meets the curved paper (bisection along the ray); the page is read off where it lands. The lens: a phone's
#    main camera (1.46 half-widths of the longer side — about 69° across it, 26 mm as on 35 mm film), or --focal F (a
#    2× telephoto: 3.0, an ultra-wide: 0.75); with --exif the JPEG says it, as a phone's does (FocalLengthIn35mmFilm).
import argparse, importlib.util, json, math, os, random
import numpy as np
from PIL import Image, ImageDraw
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('kindle', os.path.join(HERE, 'make-kindle-photos.py'))
K = importlib.util.module_from_spec(spec); spec.loader.exec_module(K)

PW, PH = 1500, 2250   # a printed page in its own pixels (about 6 × 9 in at 250 dpi)
BOOKS = ['The Long Valley', 'A Formidable Aunt', 'Bench Notes', 'The Islands', 'Letters from the Coast']
FACES = ['literata', 'liberation-serif', 'noto-sans']


def page_words(rng):
    """Words enough for two pages: the passages in a random order, again and again."""
    out = []
    while len(out) < 1400:
        ps = K.PASSAGES[:]; rng.shuffle(ps)
        for p in ps: out += p.split()
    return out


def typeset(rng, words, face, size, left, number, book, start):
    """One printed page: text from words[start:]. Returns the page (RGB, PH × PW), the words printed on it, the index after
    them. The gutter margin is the wider one (on the right of a left page)."""
    img = Image.new('RGB', (PW, PH), (255, 255, 255)); d = ImageDraw.Draw(img)
    fnt, small = K.font(face, size), K.font(face, int(size * 0.72))
    inner, outer, top, bottom = 170, 125, 175, 190
    x0 = outer if left else inner
    width = PW - inner - outer
    pitch = int(size * rng.uniform(1.32, 1.5))
    head = book.upper() if left else K.TITLES[rng.randrange(len(K.TITLES))]
    hw = d.textlength(head, font=small)
    d.text((x0 + (width - hw) / 2, top - pitch * 1.6), head, font=small, fill=(40, 40, 40))
    num = str(number)
    d.text((x0 + (width - d.textlength(num, font=small)) / 2, PH - bottom + pitch * 0.9), num, font=small, fill=(40, 40, 40))
    rows = (PH - top - bottom) // pitch
    lines = K.set_text(d, words[start:start + 600], fnt, width, rng)
    take = lines[:rows]
    while take and take[-1][0] and take[-1][0][-1].endswith('-'): take = take[:-1]  # no word broken over two pages
    K.draw_lines(d, take, fnt, x0, top, width, pitch, (22, 22, 22))
    # the words printed, a word broken at a line end counted once
    printed, carry = [], ''
    for ws, _ in take:
        for i, w in enumerate(ws):
            if carry: w = carry + w; carry = ''
            if i == len(ws) - 1 and w.endswith('-') and w[:-1].isalpha(): carry = w[:-1]; continue
            printed.append(w)
    return np.array(img), printed, start + len(printed)


def sheet(rng, theta0, L, droop, n=4096):
    """The curve of one page from the spine (s = 0) to its outer edge (s = PW): x(s), z(s) on a fine grid of s."""
    s = np.linspace(0, PW, n)
    th = theta0 * np.exp(-s / L) - droop * (s / PW) ** 2
    ds = s[1] - s[0]
    x = np.concatenate([[0], np.cumsum(np.cos(th[:-1]) * ds)])
    z = np.concatenate([[0], np.cumsum(np.sin(th[:-1]) * ds)])
    return s, x, z, th


def render(rng, pages, out_w, out_h, still, thick=False, focal=None):
    """The open book photographed. pages: [left, right] (or [right] for a single page, its spine on the left)."""
    two = len(pages) == 2
    # each page's curl: steep at the spine, levelling out; a little more or less in the middle of the spine (bulge)
    # a thick book (--thick): the page climbs out of a deep gutter and stays curved well into the text
    curls = [dict(theta0=math.radians(rng.uniform(55, 78) if thick else rng.uniform(28, 62)), L=PW * (rng.uniform(0.22, 0.42) if thick else rng.uniform(0.09, 0.26)),
                  droop=math.radians(rng.uniform(0, 6)), bulge=rng.uniform(-0.15, 0.15)) for _ in pages]
    NY = 48
    ys = np.linspace(0, PH, NY)
    # lattice of the surface over (X, Y): height and where on which page
    xmax = PW * 1.02
    NX = 3072
    Xs = np.linspace(-xmax if two else 0, xmax, NX)
    hgrid = np.zeros((NY, NX), np.float32); sgrid = np.full((NY, NX), -1, np.float32); pgrid = np.full((NY, NX), -1, np.float32)
    slope = np.zeros((NY, NX), np.float32)
    for pi, c in enumerate(curls):
        side = -1 if (two and pi == 0) else 1
        for j, y in enumerate(ys):
            f = 1 + c['bulge'] * (1 - (2 * y / PH - 1) ** 2)
            s, x, z, th = sheet(rng, c['theta0'] * f, c['L'], c['droop'])
            sel = (Xs * side >= 0) & (Xs * side <= x[-1])
            X = np.abs(Xs[sel])
            hgrid[j, sel] = np.interp(X, x, z); sgrid[j, sel] = np.interp(X, x, s); pgrid[j, sel] = pi
            slope[j, sel] = np.interp(X, x, np.tan(th)) * side
    hmax = float(hgrid.max())
    # the camera: above the book, turned and tilted; a phone's lens (about 69° across the long side), or the one asked for
    f = 0.73 * max(out_w, out_h) if focal is None else focal / 2 * max(out_w, out_h)
    bw = (2 if two else 1) * PW * 1.0
    fill = rng.uniform(0.7, 0.97)
    span = max(bw / (out_w * fill), PH / (out_h * fill))  # book units per pixel at the table
    D = f * span
    yaw = math.radians(rng.uniform(-9, 9)); pitch = math.radians(rng.uniform(-11, 11)); roll = math.radians(rng.uniform(-11, 11))
    def rot(a, b, c):
        cz, sz = math.cos(a), math.sin(a); cx, sx = math.cos(b), math.sin(b); cy, sy = math.cos(c), math.sin(c)
        Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]); Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        return Rz @ Rx @ Ry
    R = rot(yaw, pitch, roll)
    # aimed at the middle of the book (a little off it), from straight along the camera's axis
    xend = sheet(rng, curls[-1]['theta0'], curls[-1]['L'], curls[-1]['droop'])[1][-1]
    aim = np.array([(0 if two else xend / 2) + rng.uniform(-0.04, 0.04) * bw, rng.uniform(-0.04, 0.04) * PH, hmax / 3])
    at = lambda D: aim + D * R[:, 2]
    # the whole book in the picture, 3 % from its edges: the camera moved back until every point of the pages' outline fits
    edge = []
    for pi, c in enumerate(curls):
        side = -1 if (two and pi == 0) else 1
        for y in np.linspace(0, PH, 9):
            fb = 1 + c['bulge'] * (1 - (2 * y / PH - 1) ** 2)
            s, x, z, th = sheet(rng, c['theta0'] * fb, c['L'], c['droop'])
            for k in range(0, len(s), len(s) // 16): edge.append([side * x[k], y - PH / 2, z[k]])
            edge.append([side * x[-1], y - PH / 2, z[-1]])
    edge = np.array(edge)
    def fits(D):
        q = (edge - at(D)) @ R
        if (q[:, 2] >= -1).any(): return False
        px, py = q[:, 0] / -q[:, 2] * f + out_w / 2, q[:, 1] / -q[:, 2] * f + out_h / 2
        m = 0.03 * min(out_w, out_h)
        return px.min() >= m and px.max() <= out_w - m and py.min() >= m and py.max() <= out_h - m
    while not fits(D): D *= 1.04
    C = at(D)
    q = (edge - C) @ R
    px, py = q[:, 0] / -q[:, 2] * f, q[:, 1] / -q[:, 2] * f
    fill = max((px.max() - px.min()) / out_w, (py.max() - py.min()) / out_h)  # how much of the picture the book takes
    # rays: camera looks down −Z; image x to the right = world +X, image y down = world +Y (the page's top at the top)
    u, v = np.meshgrid(np.arange(out_w, dtype=np.float32) - out_w / 2, np.arange(out_h, dtype=np.float32) - out_h / 2)
    dcam = np.stack([u / f, v / f, -np.ones_like(u)], -1).reshape(-1, 3)
    d = dcam @ R.T
    t_top = (C[2] - hmax) / -d[:, 2]; t_tab = C[2] / -d[:, 2]
    lo, hi = t_top.astype(np.float64), t_tab.astype(np.float64)
    toX = lambda X: ((X - Xs[0]) / (Xs[-1] - Xs[0]) * (NX - 1)).astype(np.float32)
    toY = lambda Y: ((Y + PH / 2) / PH * (NY - 1)).astype(np.float32)
    def look(grid, X, Y, inter=cv2.INTER_LINEAR):
        mx, my = toX(X).reshape(out_h, out_w), toY(Y).reshape(out_h, out_w)
        return cv2.remap(grid, mx, my, inter, borderMode=cv2.BORDER_CONSTANT, borderValue=-1 if grid is not hgrid else 0).reshape(-1)
    for _ in range(26):
        mid = (lo + hi) / 2
        P = C[None] + mid[:, None] * d
        g = P[:, 2] - look(hgrid, P[:, 0], P[:, 1])
        above = g > 0
        lo = np.where(above, mid, lo); hi = np.where(above, hi, mid)
    P = C[None] + hi[:, None] * d
    X, Y = P[:, 0], P[:, 1]
    s = look(sgrid, X, Y); pg = look(pgrid, X, Y, cv2.INTER_NEAREST); sl = look(slope, X, Y)
    on = (pg >= 0) & (s >= 0) & (Y > -PH / 2) & (Y < PH / 2)
    # the page read off where each ray lands
    col = np.where(pg == 0, (PW - 1 - s) if two else s, s)
    row = Y + PH / 2
    img = np.zeros((out_h * out_w, 3), np.float32)
    for pi, page in enumerate(pages):
        sel = on & (pg == pi)
        if not sel.any(): continue
        mx = np.zeros(out_h * out_w, np.float32); my = np.zeros(out_h * out_w, np.float32)
        mx[sel] = col[sel]; my[sel] = row[sel]
        tex = cv2.remap(page.astype(np.float32), mx.reshape(out_h, out_w), my.reshape(out_h, out_w), cv2.INTER_LINEAR).reshape(-1, 3)
        img[sel] = tex[sel]
    # light on the paper's slope (a lamp to one side, above), the gutter in shadow, the paper's tint
    lx, ly = rng.uniform(-0.6, 0.6), rng.uniform(-0.5, 0.5); l = np.array([lx, ly, 1.0]); l /= np.linalg.norm(l)
    n = np.stack([-sl, np.zeros_like(sl), np.ones_like(sl)], -1); n /= np.linalg.norm(n, axis=1, keepdims=True)
    shade = 0.42 + 0.58 * np.clip(n @ l, 0, 1)
    gut = 1 - rng.uniform(0.25, 0.45) * np.exp(-np.maximum(s, 0) / (PW * rng.uniform(0.02, 0.05)))
    tint = np.array([rng.uniform(236, 250), rng.uniform(230, 244), rng.uniform(212, 232)]) / 255
    paper = img * tint[None] * (shade * gut)[:, None]
    bg, kind = K.background(rng, out_w, out_h)
    out = np.where(on[:, None], paper, bg.reshape(-1, 3).astype(np.float32)).reshape(out_h, out_w, 3)
    # the camera: focus, shake, noise, JPEG (as make-kindle-photos.py's photograph, held a little steadier)
    k = max(out_w, out_h) / 4032
    blur = rng.uniform(0.7, 2.4) * k if still else rng.uniform(0.6, 1.4)
    out = cv2.GaussianBlur(out, (0, 0), max(0.3, blur))
    if rng.random() < 0.2:
        m = max(3, int(rng.uniform(2, 6) * k * 4)) | 1
        kern = np.zeros((m, m), np.float32); a = rng.uniform(0, math.pi)
        cv2.line(kern, (m // 2 - int(m / 2 * math.cos(a)), m // 2 - int(m / 2 * math.sin(a))), (m // 2 + int(m / 2 * math.cos(a)), m // 2 + int(m / 2 * math.sin(a))), 1, 1)
        out = cv2.filter2D(out, -1, kern / kern.sum())
    expo = rng.uniform(0.85, 1.08)
    out = out * expo
    sd = 2.0 + 14 * max(0, 1.05 - expo)
    out = out + K.rng_normal(rng, out.shape[:2] + (1,), sd).astype(np.float32)
    out = np.clip(out, 0, 255).astype(np.uint8)
    if still: out = cv2.bilateralFilter(out, 5, 12, 3)
    # where the spine is in the photo (for a test that wants to know): the top and bottom ends of the gutter
    spine = None
    if two:
        def proj(Pw):
            q = R.T @ (np.array(Pw) - C); return [float(q[0] / -q[2] * f + out_w / 2), float(q[1] / -q[2] * f + out_h / 2)]
        spine = [proj([0, -PH / 2, 0]), proj([0, PH / 2, 0])]
    # ground truth for a flattener's test: a grid of points of each printed page (column, row in the page's own pixels) and
    # where the camera saw them in the photo (x, y: pixel indices) — the paper's own curve and the camera, nothing fitted
    truth = []
    for pi, c in enumerate(curls):
        side = -1 if (two and pi == 0) else 1; pts = []
        for row in np.linspace(260, PH - 280, 9):
            fb = 1 + c['bulge'] * (1 - (2 * row / PH - 1) ** 2)
            s, x, z, th = sheet(rng, c['theta0'] * fb, c['L'], c['droop'])
            for col in np.linspace(150, PW - 150, 7):
                sv = (PW - 1 - col) if (two and pi == 0) else col  # the arc length from the spine
                X, Z = side * float(np.interp(sv, s, x)), float(np.interp(sv, s, z))
                q = R.T @ (np.array([X, row - PH / 2, Z]) - C)
                pts.append([round(float(col), 1), round(float(row), 1), round(float(q[0] / -q[2] * f + out_w / 2), 2), round(float(q[1] / -q[2] * f + out_h / 2), 2)])
        truth.append(pts)
    return out, {'curl': [{'theta0': round(math.degrees(c['theta0']), 1), 'L': round(c['L'] / PW, 3), 'droop': round(math.degrees(c['droop']), 1), 'bulge': round(c['bulge'], 3)} for c in curls],
                 'fill': round(fill, 2), 'yaw': round(math.degrees(yaw), 1), 'pitch': round(math.degrees(pitch), 1), 'roll': round(math.degrees(roll), 1),
                 'blur': round(blur, 2), 'exposure': round(expo, 2), 'background': kind, 'spine': spine, 'truth': truth}


def add_exif(path, f35):
    """An EXIF block as a phone writes one (make, model, FocalLengthIn35mmFilm) put into the JPEG after its JFIF header —
    the picture's own bytes untouched."""
    ex = Image.Exif(); ex[0x010F] = 'SuperUtils'; ex[0x0110] = 'Test camera'
    ex.get_ifd(0x8769)[0xA405] = int(f35)
    blob = ex.tobytes()  # b'Exif\0\0' + TIFF
    b = open(path, 'rb').read()
    at = 2 + 2 + int.from_bytes(b[4:6], 'big') if b[2:4] == b'\xff\xe0' else 2
    open(path, 'wb').write(b[:at] + b'\xff\xe1' + (len(blob) + 2).to_bytes(2, 'big') + blob + b[at:])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--count', type=int, default=12); ap.add_argument('--first', type=int, default=0)
    ap.add_argument('--thick', action='store_true', help='a thick book: steeper pages that stay curved into the text')
    ap.add_argument('--width', type=int, default=0, help='the photo made this many pixels across at the end (test fixtures)')
    ap.add_argument('--quality', type=int, default=90)
    ap.add_argument('--focal', type=float, default=None, help="the lens's focal length in half the photo's longer side (1.46: a phone's main camera)")
    ap.add_argument('--exif', action='store_true', help='write the 35 mm-equivalent focal length into the JPEG, as a phone does')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    index = []
    for n in range(a.first, a.first + a.count):
        rng = random.Random(n)
        face = FACES[n % len(FACES)]; size = rng.choice([34, 36, 38, 42])
        book = BOOKS[n % len(BOOKS)]
        words = page_words(rng)
        two = n % 4 != 3
        still = n % 3 != 2
        first = 2 * rng.randrange(20, 180)
        lp, lw, i = typeset(rng, words, face, size, True, first, book, 0)
        rp, rw, _ = typeset(rng, words, face, size, False, first + 1, book, i)
        out_w, out_h = (4032, 3024) if still else (1920, 1080)
        if not two: out_w, out_h = out_h, out_w  # one page: the phone held upright
        pages = [lp, rp] if two else [rp]
        photo, how = render(rng, pages, out_w, out_h, still, a.thick, a.focal)
        name = f'book-{n:03d}-{"thick-" if a.thick else ""}{"spread" if two else "page"}-{face}-{"still" if still else "frame"}'
        if a.width and a.width < photo.shape[1]:
            # smaller (a fixture): area resampling; the truth's photo positions scaled with it (pixel centres)
            k = a.width / photo.shape[1]
            photo = cv2.resize(photo, (a.width, round(photo.shape[0] * k)), interpolation=cv2.INTER_AREA)
            how['truth'] = [[[c, r, round((x + 0.5) * k - 0.5, 2), round((y + 0.5) * k - 0.5, 2)] for c, r, x, y in pg] for pg in how['truth']]
            if how['spine']: how['spine'] = [[(x + 0.5) * k - 0.5, (y + 0.5) * k - 0.5] for x, y in how['spine']]
        path = os.path.join(a.out, name + '.jpg')
        cv2.imwrite(path, photo[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, a.quality])
        # the lens as 35 mm film would need it for the same view (on the 43.27 mm diagonal of a 36 × 24 mm frame)
        L, Hh = max(out_w, out_h), min(out_w, out_h)
        focal = a.focal if a.focal is not None else 1.46
        how['focal'] = focal; how['focal35'] = round(focal * 0.5 * 43.267 * L / math.hypot(L, Hh))
        if a.exif: add_exif(path, how['focal35'])
        Image.fromarray(rp).save(os.path.join(a.out, name + '.right.png'))
        open(os.path.join(a.out, name + '.right.txt'), 'w').write(' '.join(rw) + '\n')
        if two:
            Image.fromarray(lp).save(os.path.join(a.out, name + '.left.png'))
            open(os.path.join(a.out, name + '.left.txt'), 'w').write(' '.join(lw) + '\n')
        open(os.path.join(a.out, name + '.txt'), 'w').write(' '.join((lw if two else []) + rw) + '\n')
        index.append({'name': name, 'seed': n, 'two': two, 'still': still, 'thick': a.thick, 'face': face, 'size': size, **how})
        print(name, json.dumps({k: how[k] for k in ('fill', 'yaw', 'pitch', 'roll', 'blur')}), flush=True)
    json.dump(index, open(os.path.join(a.out, 'index.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
