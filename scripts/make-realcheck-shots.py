#!/usr/bin/env python3
# Test pictures for "Is This Screenshot Real?" (potentials #82): a payment receipt of a made-up UPI app ("Kaveri Pay" — no real app's
# design; every name and number made up), as a phone's screenshot (PNG), as it arrives after being sent through a chat app (made
# smaller, JPEG at quality 78, no metadata), and doctored in the ways people doctor them:
#   receipt-edited.jpg      the chat app's JPEG with the amount repainted (₹1,250 → ₹7,250) and saved again at quality 92 —
#                           saved twice; the repainted area was not in the first save
#   receipt-photoshop.png   the PNG with the amount repainted, saved by "Adobe Photoshop" (its Software tag and XMP history)
#   receipt-thumb.jpg       the amount repainted, saved as JPEG by "Snapseed" with EXIF whose thumbnail still shows ₹1,250 and a
#                           modify date 2 h 38 min after the original date (written by the native exiftool)
#   receipt-impossible.png  what a receipt cannot say: the status bar's clock (8:47) before the payment (9:01 am the same day), a
#                           weekday that is not that date's (Sat, 6 Nov 2026 — a Friday), a UPI reference of 11 digits, two amounts
# and photos: photo-cloned.jpg (the astronaut — NASA, public domain — with the mission patch hidden under fabric copied from the
# suit's other side, JPEG 92),
# photo-camera.jpg (Pillow's test photo flower.jpg: a Canon camera's JPEG with its own thumbnail — nothing edited).
# testorig.jpg, testimgari.jpg: libjpeg-turbo's own test pictures (testimages/, IJG licence; copied by hand from libjpeg-turbo
# 3.1.3) — a baseline and an arithmetic-coded JPEG of one picture. coefs-base.jpg / coefs-prog.jpg: one set of pixels saved
# baseline and progressive at one quality (the same coefficients).
# truth.json: each picture's signs, the areas edited, the qualities it was saved at.
# Needs: pip install pillow numpy; apt install libimage-exiftool-perl.   python3 scripts/make-realcheck-shots.py
import json, shutil, subprocess, tempfile, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/fixtures/realcheck'
OUT.mkdir(parents=True, exist_ok=True)
NOTO = ROOT / 'node_modules/@expo-google-fonts/noto-sans'
REG, BOLD = NOTO / '400Regular/NotoSans_400Regular.ttf', NOTO / '700Bold/NotoSans_700Bold.ttf'
_f = {}
def font(bold, size):
    k = (bold, size)
    if k not in _f: _f[k] = ImageFont.truetype(str(BOLD if bold else REG), size)
    return _f[k]

W, H = 1080, 2400
INK, GREY, GREEN = (24, 28, 33), (96, 104, 112), (22, 150, 88)

def receipt(clock='9:02', when='Fri, 6 Nov 2026, 9:01 am', ref='631009412785', amount='₹1,250', row_amount='₹1,250.00'):
    """the receipt and where its amount stands"""
    im = Image.new('RGB', (W, H), (255, 255, 255)); d = ImageDraw.Draw(im)
    d.text((48, 18), clock, font=font(True, 34), fill=INK)
    d.text((W - 190, 20), '5G  81%', font=font(True, 30), fill=INK)
    d.text((48, 120), 'Kaveri Pay', font=font(True, 40), fill=INK)
    cx, cy, r = W // 2, 430, 110
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN)
    d.line([(cx - 52, cy + 4), (cx - 14, cy + 44), (cx + 56, cy - 40)], fill=(255, 255, 255), width=22, joint='curve')
    def centre(y, text, f, fill):
        w = d.textlength(text, font=f); x = (W - w) / 2
        d.text((x, y), text, font=f, fill=fill)
        return [int(x), *d.textbbox((x, y), text, font=f)[1:2], int(x + w + 1), d.textbbox((x, y), text, font=f)[3]]
    centre(590, 'Payment successful', font(True, 56), INK)
    box = centre(700, amount, font(True, 128), INK)
    centre(900, 'Paid to', font(False, 36), GREY)
    centre(950, 'Asha Iyer', font(True, 48), INK)
    centre(1014, 'asha.iyer@okaxis', font(False, 36), GREY)
    d.line([(48, 1110), (W - 48, 1110)], fill=(222, 226, 230), width=3)
    y = 1150
    for label, value in [('Date', when), ('Amount', row_amount), ('UPI Ref No', ref), ('From', 'Kaveri Bank XX4512'), ('Note', 'dinner at Spice Garden')]:
        d.text((48, y), label, font=font(False, 36), fill=GREY)
        f = font(False, 38); d.text((W - 48 - d.textlength(value, font=f), y), value, font=f, fill=INK)
        y += 86
    d.rounded_rectangle([140, 1700, W - 140, 1810], 55, outline=GREEN, width=4)
    centre(1730, 'Share receipt', font(True, 40), GREEN)
    return im, box

def repaint(im, box, text, size, pad=10):
    """the amount painted over with the page's white and written again, centred where it was"""
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = box
    d.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], fill=(255, 255, 255))
    f = font(True, size); w = d.textlength(text, font=f); cx = (x0 + x1) / 2
    top = d.textbbox((0, 0), text, font=f)[1]
    x = cx - w / 2; d.text((x, y0 - top), text, font=f, fill=INK)
    return [int(min(x0, x) - pad), y0 - pad, int(max(x1, x + w) + pad), y1 + pad]

truth = {}
# 1. the receipt as the phone took it
im, amount_box = receipt()
im.save(OUT / 'receipt-genuine.png', optimize=True)
truth['receipt-genuine.png'] = {'kind': 'screenshot', 'signs': [], 'amount': amount_box}

# 2. sent through a chat app: 720 × 1600, JPEG 78, no metadata
k = 720 / W
wa = im.resize((720, 1600), Image.LANCZOS)
wa.save(OUT / 'IMG-20261106-WA0007.jpg', quality=78, subsampling=2, optimize=False)
truth['IMG-20261106-WA0007.jpg'] = {'kind': 'screenshot', 'quality': 78, 'signs': ['sent'], 'amount': [round(v * k) for v in amount_box]}

# 3. the chat app's JPEG edited and saved again at 92
ed = Image.open(OUT / 'IMG-20261106-WA0007.jpg').convert('RGB')
edit = repaint(ed, [round(v * k) for v in amount_box], '₹7,250', round(128 * k))
ed.save(OUT / 'receipt-edited.jpg', quality=92, subsampling=2, optimize=False)
truth['receipt-edited.jpg'] = {'kind': 'screenshot', 'quality': 92, 'previous': 78, 'edit': edit, 'signs': ['twice', 'changed-area']}

# 4. the PNG edited in "Photoshop"
ps, _ = receipt()
edit_ps = repaint(ps, amount_box, '₹7,250', 128)
info = PngImagePlugin.PngInfo()
info.add_text('Software', 'Adobe Photoshop 26.1 (Windows)')
xmp = ('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
       '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" '
       'xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#" xmp:CreatorTool="Adobe Photoshop 26.1 (Windows)" '
       'xmp:CreateDate="2026-11-06T09:02:11+05:30" xmp:ModifyDate="2026-11-06T11:40:05+05:30">'
       '<xmpMM:History><rdf:Seq><rdf:li stEvt:action="saved" stEvt:when="2026-11-06T11:40:05+05:30" '
       'stEvt:softwareAgent="Adobe Photoshop 26.1 (Windows)" stEvt:changed="/"/></rdf:Seq></xmpMM:History>'
       '</rdf:Description></rdf:RDF></x:xmpmeta>')
info.add_itxt('XML:com.adobe.xmp', xmp)
ps.save(OUT / 'receipt-photoshop.png', pnginfo=info, optimize=True)
truth['receipt-photoshop.png'] = {'kind': 'screenshot', 'edit': edit_ps, 'software': 'Adobe Photoshop 26.1 (Windows)', 'signs': ['software', 'history']}

# 5. edited and saved by "Snapseed": EXIF with the old thumbnail and a later modify date
th, _ = receipt()
edit_th = repaint(th, amount_box, '₹7,250', 128)
th.save(OUT / 'receipt-thumb.jpg', quality=90, subsampling=2)
with tempfile.TemporaryDirectory() as tmp:
    small = Image.open(OUT / 'receipt-genuine.png').convert('RGB').resize((72, 160), Image.LANCZOS)
    small.save(os.path.join(tmp, 't.jpg'), quality=90)
    subprocess.run(['exiftool', '-q', '-overwrite_original', '-Software=Snapseed 2.0', '-DateTimeOriginal=2026:11:06 09:02:11',
                    '-CreateDate=2026:11:06 09:02:11', '-ModifyDate=2026:11:06 11:40:05', f'-ThumbnailImage<={os.path.join(tmp, "t.jpg")}',
                    str(OUT / 'receipt-thumb.jpg')], check=True)
truth['receipt-thumb.jpg'] = {'kind': 'screenshot', 'quality': 90, 'edit': edit_th, 'signs': ['software', 'thumbnail', 'modified-later']}

# 6. what a receipt cannot say
imp, _ = receipt(clock='8:47', when='Sat, 6 Nov 2026, 9:01 am', ref='63100941278', row_amount='₹1,520.00')
imp.save(OUT / 'receipt-impossible.png', optimize=True)
truth['receipt-impossible.png'] = {'kind': 'screenshot', 'signs': ['clock-before', 'weekday', 'ref-digits', 'amounts-differ']}

# 6b. the chat app's JPEG edited and saved as a PNG (as editing apps export): a PNG that was a JPEG, with a part painted after
sent = Image.open(OUT / 'IMG-20261106-WA0007.jpg').convert('RGB')
edit_s = repaint(sent, [round(v * k) for v in amount_box], '₹4,250', round(128 * k))
sent.save(OUT / 'receipt-sent.png', optimize=True)
truth['receipt-sent.png'] = {'kind': 'screenshot', 'previous': 78, 'edit': edit_s, 'signs': ['was-jpeg', 'changed-area']}

# 6c. a greyscale JPEG (one component), saved once
Image.open(ROOT / 'tests/fixtures/images/astronaut.png').convert('L').resize((128, 128), Image.LANCZOS).save(OUT / 'grey.jpg', quality=85)
truth['grey.jpg'] = {'kind': 'photo', 'quality': 85, 'signs': []}

# 6d. the same pixels saved as a baseline and as a progressive JPEG at one quality: the same coefficients, coded two ways
cp = Image.open(ROOT / 'tests/fixtures/images/astronaut.png').convert('RGB').resize((160, 160), Image.LANCZOS)
cp.save(OUT / 'coefs-base.jpg', quality=80); cp.save(OUT / 'coefs-prog.jpg', quality=80, progressive=True)

# 7. a photo with a patch copied over another part
ast = Image.open(ROOT / 'tests/fixtures/images/astronaut.png').convert('RGB')
src, dst, n = (36, 380), (140, 352), 72  # the suit's fabric over the mission patch
ast.paste(ast.crop((src[0], src[1], src[0] + n, src[1] + n)), dst)
ast.save(OUT / 'photo-cloned.jpg', quality=92, subsampling=2)
truth['photo-cloned.jpg'] = {'kind': 'photo', 'quality': 92, 'clone': {'from': [src[0], src[1], src[0] + n, src[1] + n], 'to': [dst[0], dst[1], dst[0] + n, dst[1] + n]}, 'signs': ['copy']}

# 8. a camera's photo, as it came (Pillow's test photo)
shutil.copy(ROOT / 'tests/fixtures/images/flower.jpg', OUT / 'photo-camera.jpg')
truth['photo-camera.jpg'] = {'kind': 'photo', 'signs': []}

(OUT / 'truth.json').write_text(json.dumps(truth, indent=1, ensure_ascii=False))
print('wrote', len(truth), 'pictures to', OUT)
