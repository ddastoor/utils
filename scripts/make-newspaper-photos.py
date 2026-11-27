#!/usr/bin/env python3
# make-newspaper-photos.py OUT [--count N] [--first K] — photos of a printed newspaper page that holds several stories, for
# the Newspaper Clipper (potentials #110; owner, 21 Nov 2026: "photograph a newspaper article that runs over several
# columns → the page found and straightened, the reader taps the blocks of the article (a page holds several stories) →
# its columns stacked one under another in reading order with the headline on top"). Deterministic: photo n from seed n.
#
# The page: newsprint 2400 × 3200 px (a broadsheet's half at about 150 dpi), a masthead and a date line, five columns,
# and five or six stories laid out in one of a few designs a newspaper uses — a lead story whose headline spans three
# columns over its text, stories of two columns and of one, thin rules between them, a picture with its caption in one.
# Each story's words are an original passage written for this project (CC0). The photo: a phone over the page, as
# make-kindle-photos.py photographs it (turn, tilt, focus, shake, light, noise, JPEG), a still or a video frame.
#
# OUT/<name>.jpg and OUT/index.json: for every photo, every story — its headline, its blocks (the headline, then each
# column of its text, in reading order), each block's box on the page and its four corners in the photo (the camera's
# homography), each block's words —, the picture's box, the page's corners in the photo.
import argparse, importlib.util, json, math, os, random
import numpy as np
from PIL import Image, ImageDraw
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('kindle', os.path.join(HERE, 'make-kindle-photos.py'))
K = importlib.util.module_from_spec(spec); spec.loader.exec_module(K)

W, H = 2400, 3200
MARGIN, GUTTER, NCOL = 100, 44, 5
COLW = (W - 2 * MARGIN - GUTTER * (NCOL - 1)) // NCOL

# Original news stories (CC0, written for this project): a headline and its text.
STORIES = [
    ("Harbour Bridge Repairs Begin Monday",
     "Engineers from the county council will close the northern lane of the harbour bridge from Monday while corroded "
     "bearings beneath the central span are replaced. The work is expected to last nine weeks. Buses will keep running, "
     "but drivers have been asked to allow an extra twenty minutes at the morning peak. The council's surveyor said the "
     "bearings had outlived their design life by almost a decade and that the repairs could no longer be postponed. "
     "Fishermen who moor below the bridge have been told to move their boats to the eastern pontoons until the "
     "scaffolding comes down. A public meeting about the diversions will be held in the town hall on Thursday evening."),
    ("Library Extends Its Evening Hours",
     "The public library on Quay Street will stay open until nine o'clock on weekdays from next month, after a petition "
     "signed by more than two thousand residents. Students preparing for examinations had complained that the reading "
     "room closed just as they finished work. The librarian, who has run the branch for eighteen years, said the longer "
     "hours would be staffed by volunteers from the reading circle. The children's section will also host a storytelling "
     "evening on the first Friday of each month, and the local history collection, including the old shipping ledgers, "
     "will be available to browse without an appointment."),
    ("Rain Delays Final Day of the Regatta",
     "Squalls and a stiff westerly forced the organisers of the summer regatta to postpone the final races yesterday. "
     "Spectators who had gathered on the promenade watched the committee boat raise the postponement flag shortly after "
     "ten. The leading crew, a family from the estuary who have won the trophy three times, said they were disappointed "
     "but relieved: two dinghies capsized during the morning practice and the rescue launch was kept busy. The races "
     "will now be sailed on Sunday, weather permitting, and the prize giving moves to the yacht club's pavilion."),
    ("Market Traders Welcome New Canopy",
     "Stallholders in the covered market say a new glass canopy has already brought more shoppers through the gates. "
     "The canopy, paid for by a heritage grant, replaces corrugated sheets that leaked for years. A cheesemonger who has "
     "traded there since 1979 said customers now linger instead of hurrying through the drizzle. The market manager "
     "plans a night market in the spring, with lanterns strung between the iron columns and food stalls from the "
     "surrounding villages."),
    ("School Choir Wins Regional Prize",
     "The choir of St Bride's primary school has won the regional festival for the first time, singing a medley of sea "
     "shanties arranged by their music teacher. Thirty-two pupils travelled to the competition by coach. The judges "
     "praised the choir's diction and the confident solo by a nine year old soprano. The school hopes to raise money "
     "for the national final through a concert in the parish church."),
    ("Lighthouse Diary Found in Attic",
     "A diary kept by a lighthouse keeper in the winter of 1907 has been found in the attic of a cottage on Gull Lane. "
     "The new owners discovered the leather notebook wrapped in oilcloth beneath the floorboards. Its pages record "
     "storms, passing steamers and the keeper's daily ration of paraffin. The museum has offered to conserve the "
     "diary and display it beside the old lens from the headland light."),
    ("Cyclists Ask for a Safer Crossing",
     "Members of the cycling club have asked the council for a signal crossing where the coast path meets the main "
     "road. They say riders and walkers wait several minutes for a gap in the traffic on summer weekends. A council "
     "spokesperson said the junction would be surveyed in the autumn."),
    ("Orchard Harvest Best in a Decade",
     "Growers in the valley expect the best apple harvest in ten years after a warm spring and a wet August. The cider "
     "press at Mill Farm will run day and night through October, and pickers are still needed for the late varieties."),
]
CAPTIONS = ["The harbour bridge at low tide.", "Readers in the library's reading room.", "Dinghies on the estuary before the squall."]


def setcol(d, words, fnt, width, rng):
    return K.set_text(d, words, fnt, width, rng)


def place_story(d, rng, story, x0, y0, ncols, head_size, body, pitch, face, rules, picture=None):
    """A story at (x0, y0) over `ncols` columns: its headline across them, then its text balanced over the columns.
    Returns its blocks (headline, columns) with boxes and words, the picture's box, and the bottom of the story."""
    head, text = story
    width = ncols * COLW + (ncols - 1) * GUTTER
    hf = K.font(face, head_size, bold=True)
    # the headline: one or two lines that fit the width
    hw = head.split(); hl = []; line = []
    for w_ in hw:
        if line and d.textlength(' '.join(line + [w_]), font=hf) > width:
            hl.append(line); line = []
        line.append(w_)
    hl.append(line)
    y = y0; hp = int(head_size * 1.12); hbox = None
    for ln in hl:
        t = ' '.join(ln); d.text((x0, y), t, font=hf, fill=18)
        b = d.textbbox((x0, y), t, font=hf)
        hbox = list(b) if hbox is None else [min(hbox[0], b[0]), min(hbox[1], b[1]), max(hbox[2], b[2]), max(hbox[3], b[3])]
        y += hp
    blocks = [{'kind': 'headline', 'box': [int(hbox[0]), int(hbox[1]), int(hbox[2]), int(hbox[3])], 'words': head.split()}]
    y += int(pitch * 0.6)
    pic = None
    if picture is not None:
        # a picture over the first column's width … the story's full width, with its caption under it
        ph = int(width * rng.uniform(0.45, 0.6))
        pic = [x0, y, x0 + width, y + ph]
        d.rectangle(pic, fill=int(rng.uniform(110, 160)))
        # a few shapes so it is not flat (a picture, not a box of text)
        for _ in range(12):
            cx, cy, r = rng.uniform(x0, x0 + width), rng.uniform(y, y + ph), rng.uniform(20, 90)
            d.ellipse([cx - r, cy - r * 0.6, cx + r, cy + r * 0.6], fill=int(rng.uniform(60, 220)))
        y += ph + int(pitch * 0.3)
        cf = K.font(face, int(body.size * 0.85))
        d.text((x0, y), picture, font=cf, fill=60)
        cb = d.textbbox((x0, y), picture, font=cf)
        blocks.append({'kind': 'caption', 'box': [int(cb[0]), int(cb[1]), int(cb[2]), int(cb[3])], 'words': picture.split()})
        y += int(pitch * 1.5)
    lines = setcol(d, text.split(), body, COLW, rng)
    per = math.ceil(len(lines) / ncols)
    ytop = y; bottom = y
    for c in range(ncols):
        part = lines[c * per:(c + 1) * per]
        if not part: continue
        cx = x0 + c * (COLW + GUTTER)
        K.draw_lines(d, part, body, cx, ytop, COLW, pitch, 22)
        words = [t for ws, _ in part for t in ws]
        yb = ytop + len(part) * pitch
        blocks.append({'kind': 'column', 'box': [cx, ytop, cx + COLW, int(yb - pitch * 0.25)], 'words': words})
        bottom = max(bottom, yb)
    # the story's text as a reader reads it: the headline, then the columns (a word broken at a line end joined)
    flat = [t for b in blocks if b['kind'] != 'headline' and b['kind'] != 'caption' for t in b['words']]
    out, k = [], 0
    while k < len(flat):
        t = flat[k]
        if t.endswith('-') and k + 1 < len(flat) and t[:-1].isalpha():
            out.append(t[:-1] + flat[k + 1]); k += 2; continue
        out.append(t); k += 1
    if rules:
        d.line([x0, bottom + int(pitch * 0.4), x0 + width, bottom + int(pitch * 0.4)], fill=90, width=3)
    return {'headline': head, 'text': ' '.join(out), 'blocks': blocks, 'picture': pic, 'box': [x0, y0, x0 + width, int(bottom)]}, int(bottom + pitch * 1.1)


def page(rng):
    face = rng.choice(['liberation-serif', 'noto-sans'])
    size = rng.choice([30, 32, 34])
    body = K.font(face, size); pitch = int(size * 1.25)
    img = Image.new('L', (W, H), 255); d = ImageDraw.Draw(img)
    # the masthead
    mf = K.font('liberation-serif', 120, bold=True)
    name = rng.choice(['THE COASTAL HERALD', 'THE ESTUARY GAZETTE', 'HARBOUR TIMES'])
    d.text(((W - d.textlength(name, font=mf)) / 2, 60), name, font=mf, fill=10)
    df = K.font(face, 30)
    date = rng.choice(['Thursday, 27 November 2026', 'Saturday, 14 March 2026', 'Monday, 6 July 2026'])
    d.text((MARGIN, 215), date, font=df, fill=40); d.text((W - MARGIN - d.textlength('Price 1.20', font=df), 215), 'Price 1.20', font=df, fill=40)
    d.line([MARGIN, 262, W - MARGIN, 262], fill=30, width=5)
    order = list(range(len(STORIES))); rng.shuffle(order)
    rules = rng.random() < 0.7
    stories = []
    colx = lambda c: MARGIN + c * (COLW + GUTTER)
    design = rng.choice(['lead-left', 'lead-right'])
    lead, side = (0, 3) if design == 'lead-left' else (2, 0)
    state = {'img': img}

    def put(story, x, top, ncols, head_size, picture=None):
        """The story drawn on a copy of the page, kept only when it fits above the page's foot."""
        tmp = state['img'].copy()
        s, yb = place_story(ImageDraw.Draw(tmp), rng, story, x, top, ncols, head_size, body, pitch, face, rules, picture)
        if yb > H - 60: return None, top
        state['img'] = tmp; stories.append(s); return s, yb

    queue = [STORIES[i] for i in order]
    # the lead story over three columns (with a picture, half the time), a story of two columns beside it
    _, yl = put(queue.pop(0), colx(lead), 300, 3, rng.choice([84, 92]), rng.choice(CAPTIONS) if rng.random() < 0.5 else None)
    _, ys = put(queue.pop(0), colx(side), 300, 2, 58)
    # under them, while there is room: under the lead a story of two columns with one of one beside it, under the other
    # one of two columns — the region with the most room first
    regions = [{'x': colx(lead), 'top': yl, 'n': 3, 'full': False}, {'x': colx(side), 'top': ys, 'n': 2, 'full': False}]
    while queue:
        open_ = [r for r in regions if not r['full']]
        if not open_: break
        r = min(open_, key=lambda r: r['top'])
        if r['n'] == 3:
            s, yb = put(queue[0], r['x'], r['top'], 2, 54)
            if not s: r['full'] = True; continue
            queue.pop(0); y2 = r['top']
            if queue:
                s2, yb2 = put(queue[0], r['x'] + 2 * (COLW + GUTTER), r['top'], 1, 46)
                if s2: queue.pop(0); y2 = yb2
            r['top'] = max(yb, y2)
        else:
            s, yb = put(queue[0], r['x'], r['top'], 2, 50)
            if not s: r['full'] = True; continue
            queue.pop(0); r['top'] = yb
    img = state['img']
    paper = np.array([224, 219, 205], float) + rng.uniform(-8, 4)
    a = np.asarray(img, float) / 255.0
    rgb = a[..., None] * paper + (1 - a[..., None]) * 28
    rgb += K.rng_normal(rng, (H, W, 1), 3)
    return np.clip(rgb, 0, 255).astype(np.uint8), stories, {'face': face, 'fontSize': size, 'design': design, 'rules': rules, 'masthead': name}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--count', type=int, default=8); ap.add_argument('--first', type=int, default=0)
    ap.add_argument('--width', type=int, default=0, help='the photo made this many pixels across at the end (test fixtures)')
    ap.add_argument('--still', choices=['yes', 'no', 'any'], default='any')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    index = []
    for n in range(a.first, a.first + a.count):
        rng = random.Random(1000 + n)
        pg, stories, info = page(rng)
        still = rng.random() < 0.75 if a.still == 'any' else a.still == 'yes'
        ow, oh = (3024, 4032) if still else (1080, 1920)
        mask = np.full((H, W), 255, np.uint8); corners = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
        photo, cam = K.photograph(rng, pg, mask, corners, ow, oh, still, soft=(0.8, 2.2), shake=(0.15, 3, 6))
        quad = np.float32(cam['screen'])
        Hm = cv2.getPerspectiveTransform(corners, quad)
        k = 1.0
        if a.width and a.width < photo.shape[1]:
            k = a.width / photo.shape[1]
            photo = cv2.resize(photo, (a.width, round(photo.shape[0] * k)), interpolation=cv2.INTER_AREA)
        def to_photo(x, y):
            p = cv2.perspectiveTransform(np.float32([[[x, y]]]), Hm)[0][0]
            return [round(float((p[0] + 0.5) * k - 0.5), 1), round(float((p[1] + 0.5) * k - 0.5), 1)]
        for s in stories:
            for b in s['blocks']:
                x0, y0, x1, y1 = b['box']; b['photo'] = [to_photo(x0, y0), to_photo(x1, y0), to_photo(x1, y1), to_photo(x0, y1)]
            if s['picture']:
                x0, y0, x1, y1 = s['picture']; s['picturePhoto'] = [to_photo(x0, y0), to_photo(x1, y0), to_photo(x1, y1), to_photo(x0, y1)]
        name = f'news-{n:02d}-{"still" if still else "frame"}'
        q = rng.randrange(82, 93)
        cv2.imwrite(os.path.join(a.out, name + '.jpg'), cv2.cvtColor(photo, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])
        index.append({'name': name, 'seed': n, 'still': still, 'size': [photo.shape[1], photo.shape[0]], 'page': [W, H],
                      'corners': [to_photo(0, 0), to_photo(W, 0), to_photo(W, H), to_photo(0, H)], **info,
                      'camera': {kk: cam[kk] for kk in ('fill', 'turn', 'tilt', 'background', 'blur', 'exposure')}, 'stories': stories})
        print(name, info['design'], len(stories), 'stories', 'rules' if info['rules'] else 'no rules', f"{photo.shape[1]}x{photo.shape[0]}", flush=True)
    json.dump(index, open(os.path.join(a.out, 'index.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
