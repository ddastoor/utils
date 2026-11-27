#!/usr/bin/env python3
# Test PDFs for Make PDF Searchable (tests/unit/searchable.test.mjs, tests/e2e/pdf-ocr.e2e.mjs): "scanned" pages — pictures of
# text, no text layer — upright, lying a quarter to the left, upside down and one shown through /Rotate 90, and a page of real
# text, which is left as it is. truth.json holds every word of each page and its box on the page as shown (points from the top
# left), so the text layer's places can be checked. Text of our own; Noto Sans (OFL).
# Needs: pip install pillow numpy reportlab pypdf.   python3 scripts/make-searchable-pdfs.py
import io, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/fixtures/searchable'
OUT.mkdir(parents=True, exist_ok=True)
FONT = ROOT / 'node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'
W, H = A4  # points
DPI = 200
PX = DPI / 72
TEXTS = [
    'The harbour master counted seventeen boats before the evening tide turned. Each skipper signed the ledger, and the clerk '
    'copied their names onto a fresh page so that nothing would be lost if the paper got wet. Lanterns were lit along the quay '
    'while gulls argued over the last of the fish.',
    'Our quarterly report shows steady growth in three regions. Revenue rose by eleven percent, and the new warehouse in Nashik '
    'opened on schedule. Customer complaints fell for the fourth quarter in a row, thanks to faster delivery and clearer invoices.',
    'Please bring the original receipt, a photocopy of your identity card and the completed form to the counter. Refunds are '
    'paid within fourteen working days. Keep this letter for your records; the reference number appears at the top.',
    'Gardening notes for April: sow tomatoes indoors, water the seedlings every morning, and move them outside once the nights '
    'stay warm. Marigolds planted between the rows keep many pests away and brighten the beds.',
]

def page_image(text, w_px, h_px, seed):
    """Text set in lines on white at 200 dpi, with every word's box (pixels); a little noise and a JPEG's softness."""
    im = Image.new('L', (w_px, h_px), 255); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(str(FONT), 34)
    x0, y, maxw, words = 150, 180, w_px - 300, []
    line = []
    def flush(line, y):
        x = x0
        for wd in line:
            d.text((x, y), wd, font=f, fill=25)
            l, t, r, b = d.textbbox((x, y), wd, font=f)
            words.append({'text': wd, 'box': [l, t, r, b]})
            x += d.textlength(wd + ' ', font=f)
    for wd in text.split():
        trial = ' '.join(line + [wd])
        if line and d.textlength(trial, font=f) > maxw:
            flush(line, y); y += 56; line = []
        line.append(wd)
    if line: flush(line, y)
    a = np.asarray(im).astype(float) + np.random.default_rng(seed).normal(0, 2.5, (h_px, w_px))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), words

def jpeg(im):
    b = io.BytesIO(); im.save(b, "JPEG", quality=72); return b.getvalue()

pw, ph = round(W * PX), round(H * PX)
truth = {'pages': []}
buf = io.BytesIO(); cv = canvas.Canvas(buf, pagesize=A4)

def to_pt(box):  # pixels of an upright page → points of the page as shown
    return [round(v / PX, 2) for v in box]

# 1 — upright
im, words = page_image(TEXTS[0], pw, ph, 1)
cv.drawImage(canvas.ImageReader(io.BytesIO(jpeg(im))), 0, 0, W, H); cv.showPage()
truth['pages'].append({'kind': 'upright', 'turn': 0, 'words': [{'text': w['text'], 'box': to_pt(w['box'])} for w in words]})

# 2 — lying a quarter to the left: the text written across a landscape page, the picture turned 90° to the left onto portrait
im, words = page_image(TEXTS[1], ph, pw, 2)   # landscape picture
rot = im.rotate(90, expand=True)              # counter-clockwise: the text now runs up the portrait page
cv.drawImage(canvas.ImageReader(io.BytesIO(jpeg(rot))), 0, 0, W, H); cv.showPage()
# a word's box on the portrait page: (x, y) in the landscape picture → (y, pw_land - x) after a quarter turn to the left
lw = ph  # the landscape picture's width
def left(box):
    l, t, r, b = box
    return [t, lw - r, b, lw - l]
truth['pages'].append({'kind': 'sideways', 'turn': 1, 'words': [{'text': w['text'], 'box': to_pt(left(w['box']))} for w in words]})

# 3 — a page of real text: left as it is
cv.setFont('Helvetica', 12)
for i, line in enumerate(['This page has real text in it already.', 'It is not read again; its words are found as they are.', 'Customer since 2011.']):
    cv.drawString(72, H - 100 - 20 * i, line)
cv.showPage()
truth['pages'].append({'kind': 'text', 'turn': None, 'words': []})

# 4 — upside down
im, words = page_image(TEXTS[2], pw, ph, 4)
cv.drawImage(canvas.ImageReader(io.BytesIO(jpeg(im.rotate(180)))), 0, 0, W, H); cv.showPage()
def flip(box):
    l, t, r, b = box
    return [pw - r, ph - b, pw - l, ph - t]
truth['pages'].append({'kind': 'upside down', 'turn': 2, 'words': [{'text': w['text'], 'box': to_pt(flip(w['box']))} for w in words]})

# 5 — shown through /Rotate 90: the stored picture lies a quarter to the left, the page turned by the viewer shows it upright
im, words = page_image(TEXTS[3], pw, ph, 5)
cv.setPageSize((H, W))
cv.drawImage(canvas.ImageReader(io.BytesIO(jpeg(im.rotate(90, expand=True)))), 0, 0, H, W); cv.showPage()
truth['pages'].append({'kind': 'rotate 90', 'turn': 0, 'words': [{'text': w['text'], 'box': to_pt(w['box'])} for w in words]})
cv.save()

r = PdfReader(io.BytesIO(buf.getvalue())); wtr = PdfWriter()
for i, p in enumerate(r.pages):
    if i == 4: p[NameObject('/Rotate')] = NumberObject(90)
    wtr.add_page(p)
wtr.add_metadata({'/Title': 'Scanned letters (specimen)'})
with open(OUT / 'scan.pdf', 'wb') as fh: wtr.write(fh)
(OUT / 'truth.json').write_text(json.dumps(truth, indent=1) + '\n')
print('wrote', sorted(p.name for p in OUT.iterdir()))
