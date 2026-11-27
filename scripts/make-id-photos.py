#!/usr/bin/env python3
# Test pictures for Safe ID Copy (tests/unit/idcopy.test.mjs, tests/e2e/idcopy.e2e.mjs): made-up specimen ID cards —
# not any real card's design — "photographed" on a desk with perspective, light and JPEG, and an e-letter PDF behind a
# password. Every number is made up (valid check digits, so the Number Detective's scan finds them); truth.json says what
# is where. Needs: pip install pillow numpy segno reportlab pypdf python-stdnum.   python3 scripts/make-id-photos.py
import io, json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import segno
from stdnum import verhoeff
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/fixtures/idcopy'
OUT.mkdir(parents=True, exist_ok=True)
NOTO = ROOT / 'node_modules/@expo-google-fonts/noto-sans'
REG, BOLD = NOTO / '400Regular/NotoSans_400Regular.ttf', NOTO / '700Bold/NotoSans_700Bold.ttf'

def check(d): return d + verhoeff.calc_check_digit(d)
def groups(d): return ' '.join(d[i:i + 4] for i in range(0, len(d), 4))
NUMBER = check('61849302751')            # the card's number (12 digits)
VID = check('913456781234567')           # its VID (16 digits)
LETTER = check('40172958361')            # the e-letter's number
NAME, DOB = 'Ravi Kumar', '12/08/1985'
OLD_QR = f'<?xml version="1.0" encoding="UTF-8"?><PrintLetterBarcodeData uid="{NUMBER}" name="{NAME}" gender="M" yob="1985" co="S/O Mohan Kumar" pc="411001"/>'
rng = np.random.default_rng(93)
SECURE_QR = ''.join(str(d) for d in rng.integers(0, 10, 420))  # a long signed number, as a "secure" QR holds: no full number in it

def font(p, s): return ImageFont.truetype(str(p), s)
def qrpic(text, err, scale): b = io.BytesIO(); segno.make(text, error=err).save(b, kind='png', scale=scale, border=2); return Image.open(b).convert('RGB')

def card(side):
    """A specimen card, 85.6 × 54 mm at 12 px/mm (1027 × 648)."""
    W, H = 1027, 648
    im = Image.new('RGB', (W, H), (250, 248, 241))
    d = ImageDraw.Draw(im)
    for y in range(0, H, 6): d.line([(0, y), (W, y + 40)], fill=(243, 239, 228))  # a faint pattern
    d.rectangle([0, 0, W, 70], fill=(36, 77, 140))
    d.text((24, 14), 'SPECIMEN IDENTITY CARD', font=font(BOLD, 34), fill=(255, 255, 255))
    if side == 'front':
        d.rectangle([28, 100, 228, 350], fill=(214, 218, 224), outline=(150, 156, 164), width=2)
        d.ellipse([88, 140, 168, 220], fill=(160, 166, 176)); d.rectangle([68, 230, 188, 340], fill=(160, 166, 176))
        f = font(REG, 32)
        d.text((260, 110), NAME, font=font(BOLD, 36), fill=(20, 20, 20))
        d.text((260, 165), f'DOB: {DOB}', font=f, fill=(30, 30, 30))
        d.text((260, 215), 'Male', font=f, fill=(30, 30, 30))
        qr = qrpic(OLD_QR, 'm', 3)
        im.paste(qr.resize((230, 230), Image.NEAREST), (770, 95))
        d.line([(28, 520), (W - 28, 520)], fill=(200, 60, 40), width=3)
        num = groups(NUMBER); fb = font(BOLD, 54)
        tw = d.textlength(num, font=fb); d.text(((W - tw) / 2, 535), num, font=fb, fill=(15, 15, 15))
    else:
        f = font(REG, 28)
        lines = ['Address:', 'S/O Mohan Kumar, 14 Lake View Road,', 'Shivaji Nagar, Pune, Maharashtra 411001']
        for i, t in enumerate(lines): d.text((32, 100 + i * 40), t, font=f if i else font(BOLD, 28), fill=(25, 25, 25))
        d.text((32, 245), f'VID : {groups(VID)}', font=font(REG, 30), fill=(25, 25, 25))
        qr = qrpic(SECURE_QR, 'l', 2)
        im.paste(qr.resize((250, 250), Image.NEAREST), (745, 92))
        d.line([(28, 520), (W - 28, 520)], fill=(200, 60, 40), width=3)
        num = groups(NUMBER); fb = font(BOLD, 54)
        tw = d.textlength(num, font=fb); d.text(((W - tw) / 2, 535), num, font=fb, fill=(15, 15, 15))
    return im

def coeffs(dst, src):
    """PIL's perspective coefficients mapping output points dst to input points src."""
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()

def desk(W, H, seed):
    r = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W]
    grain = 10 * np.sin(yy / 7.0 + 2.5 * np.sin(xx / 90.0)) + 5 * np.sin(yy / 2.3)
    base = np.stack([118 + grain, 84 + grain * 0.8, 58 + grain * 0.6], -1) + r.normal(0, 3, (H, W, 1))
    light = 1 + 0.18 * (1 - ((xx - W * 0.4) ** 2 + (yy - H * 0.35) ** 2) / (W ** 2))
    return Image.fromarray(np.clip(base * light[..., None], 0, 255).astype(np.uint8))

def photo(side, corners, seed, size=(1600, 1200)):
    c = card(side); W, H = size
    bg = desk(W, H, seed)
    src = [(0, 0), (c.width, 0), (c.width, c.height), (0, c.height)]
    warped = c.transform(size, Image.PERSPECTIVE, coeffs(corners, src), Image.BICUBIC)
    mask = Image.new('L', (c.width, c.height), 255).transform(size, Image.PERSPECTIVE, coeffs(corners, src), Image.BICUBIC)
    shadow = Image.new('L', size, 0); ImageDraw.Draw(shadow).polygon([(x + 14, y + 18) for x, y in corners], fill=110)
    bg = Image.composite(Image.new('RGB', size, (20, 14, 10)), bg, shadow.filter(ImageFilter.GaussianBlur(14)))
    out = Image.composite(warped, bg, mask).filter(ImageFilter.GaussianBlur(0.6))
    a = np.asarray(out).astype(float) + np.random.default_rng(seed).normal(0, 2.5, (H, W, 3))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

truth = {'number': groups(NUMBER), 'vid': groups(VID), 'letter': groups(LETTER), 'oldQr': OLD_QR, 'secureQr': SECURE_QR, 'name': NAME, 'dob': DOB}
photo('front', [(260, 230), (1350, 270), (1310, 960), (230, 900)], 1).save(OUT / 'card-front.jpg', quality=90)
photo('back', [(300, 250), (1360, 215), (1395, 905), (275, 935)], 2).save(OUT / 'card-back.jpg', quality=90)

# an e-letter of one A4 page behind a password: the number three times, the VID, the old QR (its uid) — real text
pdfmetrics.registerFont(TTFont('Noto', str(REG))); pdfmetrics.registerFont(TTFont('NotoB', str(BOLD)))
tmp = OUT / '_letter.pdf'
cv = canvas.Canvas(str(tmp), pagesize=A4); W, H = A4
cv.setTitle('Specimen e-letter'); cv.setFont('NotoB', 18); cv.drawString(56, H - 70, 'Specimen e-letter (not a real document)')
cv.setFont('Noto', 12)
for i, t in enumerate([f'To: {NAME}', 'S/O Mohan Kumar, 14 Lake View Road, Shivaji Nagar, Pune 411001', f'Date of birth: {DOB}',
                       f'Your number: {groups(LETTER)}', f'VID: {groups(VID)}']):
    cv.drawString(56, H - 120 - i * 20, t)
cv.setFont('NotoB', 26); cv.drawCentredString(W / 2, H - 330, groups(LETTER))
img = qrpic(OLD_QR.replace(NUMBER, LETTER), 'm', 4); qp = OUT / '_qr.png'; img.save(qp)
cv.drawImage(str(qp), W - 56 - 150, H - 300, 150, 150)
cv.setFont('Noto', 11); cv.drawString(56, 90, f'Keep this letter safe. Number: {groups(LETTER)}')
cv.showPage(); cv.save()
w = PdfWriter(clone_from=PdfReader(str(tmp))); w.encrypt('RAVI1985', 'owner-1985', algorithm='AES-256')
with open(OUT / 'e-letter.pdf', 'wb') as f: w.write(f)
tmp.unlink(); qp.unlink()
truth['letterPassword'] = 'RAVI1985'
(OUT / 'truth.json').write_text(json.dumps(truth, indent=1) + '\n')
print('wrote', sorted(p.name for p in OUT.iterdir()))
