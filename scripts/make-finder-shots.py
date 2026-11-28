#!/usr/bin/env python3
# Test pictures for the Screenshot Finder (potentials #76): a phone's "Screenshots" folder as people have it — chats (light and
# dark), a bank's SMS, an order e-mail, the phone's settings, a payment, a PC's screenshot of a booking page — and photos (a
# school circular and a restaurant bill from the camera helpers' fixtures, a cup of coffee with no text). Every chat, name,
# number and page is of our own making, in the manner of such apps (no real app's design), set in Noto Sans (OFL).
# truth.json: every file, the words that must be found in it, queries with the files they must find (in the order the tab
# shows them: all the words before some, then the better match, then the newest — by the date in the file's name), the
# pictures without text, and every text drawn on each screenshot (the measure of a reading).
# Needs: pip install pillow pillow-heif.   python3 scripts/make-finder-shots.py
import json, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/fixtures/finder'
OUT.mkdir(parents=True, exist_ok=True)
NOTO = ROOT / 'node_modules/@expo-google-fonts/noto-sans'
REG, BOLD = NOTO / '400Regular/NotoSans_400Regular.ttf', NOTO / '700Bold/NotoSans_700Bold.ttf'
_f = {}
DRAWN, BOXES = [], []  # every text drawn on the picture being made (truth.json's 'texts': what a reading should find) and each word's box
def T(d, xy, text, **kw):
    d.text(xy, text, **kw); DRAWN.append(text)
    f, (x, y) = kw['font'], xy
    _, top, _, bottom = d.textbbox(xy, text, font=f)
    at = 0
    for w in text.split(' '):
        if w:
            x0 = x + f.getlength(text[:at]); BOXES.append([w, round(x0, 1), top, round(x0 + f.getlength(w), 1), bottom])
        at += len(w) + 1
def font(bold, size):
    k = (bold, size)
    if k not in _f: _f[k] = ImageFont.truetype(str(BOLD if bold else REG), size)
    return _f[k]
def wrap(text, f, width):
    lines, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if f.getlength(t) <= width or not cur: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

W, H = 720, 1600
def status(d, clock, fg):
    T(d, (28, 14), clock, font=font(True, 22), fill=fg)
    T(d, (W - 110, 14), '5G  81%', font=font(True, 20), fill=fg)

def chat(name, msgs, dark=False, clock='19:07'):
    bg, bar, fg, sub = ((11, 20, 26), (31, 44, 52), (233, 237, 239), (134, 150, 160)) if dark else ((239, 231, 222), (255, 255, 255), (17, 27, 33), (102, 119, 129))
    inb, outb = ((32, 44, 51), (0, 92, 75)) if dark else ((255, 255, 255), (217, 253, 211))
    DRAWN.clear(); BOXES.clear(); im = Image.new('RGB', (W, H), bg); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 160], fill=bar); status(d, clock, fg)
    d.ellipse([24, 74, 84, 134], fill=(232, 140, 70)); d.text((44, 86), name[0], font=font(True, 28), fill=(255, 255, 255))  # the avatar's letter: not counted
    T(d, (104, 74), name, font=font(True, 28), fill=fg); T(d, (104, 110), 'online', font=font(False, 20), fill=sub)
    y = 190
    for who, text, at in msgs:
        f = font(False, 25); lines = wrap(text, f, 470); hgt = 36 * len(lines) + 46
        wid = max(f.getlength(l) for l in lines) + 40
        x = 24 if who == 'in' else W - 24 - wid
        d.rounded_rectangle([x, y, x + wid, y + hgt], 14, fill=inb if who == 'in' else outb)
        for i, l in enumerate(lines): T(d, (x + 20, y + 12 + 36 * i), l, font=f, fill=fg)
        T(d, (x + wid - 70, y + hgt - 30), at, font=font(False, 17), fill=sub)
        y += hgt + 18
    d.rounded_rectangle([16, H - 110, W - 100, H - 40], 35, fill=bar); T(d, (50, H - 92), 'Message', font=font(False, 25), fill=sub)
    return im

def page(title, rows, clock='08:15', dark=False, appbar=(255, 255, 255), size=(W, H)):
    w, h = size
    bg, fg, sub = ((18, 18, 18), (235, 235, 235), (160, 160, 160)) if dark else ((255, 255, 255), (20, 20, 20), (95, 99, 104))
    DRAWN.clear(); BOXES.clear(); im = Image.new('RGB', size, bg); d = ImageDraw.Draw(im)
    if h > w: status(d, clock, fg)
    top = 60 if h > w else 20
    d.rectangle([0, top, w, top + 90], fill=appbar); T(d, (28, top + 24), title, font=font(True, 32), fill=fg if appbar == (255, 255, 255) else (255, 255, 255))
    y = top + 120
    for r in rows:
        if r is None: y += 18; continue
        bold = r.startswith('**'); t = r.strip('*').lstrip('~')
        f = font(bold, 26 if not bold else 28)
        for l in wrap(t, f, w - 56): T(d, (28, y), l, font=f, fill=fg if bold or not r.startswith('~') else sub); y += 40
        y += 10
    return im

shots, texts, boxes = {}, {}, {}
def keep(name, im): shots[name] = im; texts[name] = ' '.join(DRAWN); boxes[name] = list(BOXES)
# 1. a chat: the train booking
keep('Screenshot_20261102-190712_WhatsApp.png', chat('Asha Iyer', [
    ('in', 'Hi! Are we still on for Saturday? Amma is asking what time we leave.', '19:02'),
    ('out', 'Yes, leaving Pune at 6 am sharp. Tell her to pack the theplas.', '19:04'),
    ('in', 'Did you book the train back?', '19:05'),
    ('out', 'Booked. PNR 4521 678 903, coach B2, seats 41 and 42.', '19:07'),
    ('out', 'Train leaves Lonavala at 17:35 on Sunday.', '19:07'),
    ('in', 'Perfect. Which hotel did you finally pick?', '19:10'),
    ('out', 'Hill View Residency, near the market. Room 207.', '19:12'),
]))
# 2. a dark chat: the Wi-Fi password someone sent
keep('Screenshot_20261020-213344_WhatsApp.png', chat('Rohan', [
    ('out', 'What is the wifi at your place?', '21:30'),
    ('in', 'Network SuperHome_5G and the password is kT7mq2Vr9w', '21:32'),
    ('in', 'The router restarts at midnight, just reconnect.', '21:33'),
    ('out', 'Thanks, connected!', '21:33'),
], dark=True, clock='21:33'))
# 3. a bank's SMS
keep('Screenshot_20261105-081530_Messages.png', page('KAVBNK', [
    '~5 November 2026',
    'Rs.2,032.71 debited from A/c XX4512 on 05-11-26 to GODAVARI POWER via UPI. Avl Bal Rs.18,402.10.',
    'Not you? Call 1800 425 3800 to block your account. -Kaveri Bank',
    None,
    '~Today 08:15',
    'Your OTP for login is 551927. Valid for 5 minutes. Do not share it with anyone. -Kaveri Bank',
], appbar=(25, 118, 210)))
# 4. an order e-mail
keep('Screenshot_20261101-120001_Mail.png', page('Inbox', [
    '**Your order has shipped',
    '~From: orders@shopkart.example',
    'Hello Priya, your order #402-7765131-9902211 has shipped and will be delivered by Thursday, 7 November.',
    'Air fryer 4.1 L, black  x 1   Rs. 6,499',
    'Track your package with the tracking ID SK2290045731IN.',
    None, '~Need help? Visit the help centre.',
], clock='12:00'))
# 5. the phone's settings
keep('Screenshot_20261015-100203_Settings.png', page('About phone', [
    '**Device name', 'Galaxy of Ravi', None,
    '**Model name', 'SM-A556E', None,
    '**Serial number', 'R58N21ABCDX', None,
    '**IMEI (slot 1)', '352094112746229', None,
    '**Android version', '15', None,
    '**Build number', 'UP1A.231005.007',
], clock='10:02'))
# 6. a payment
keep('Screenshot_20261106-090102_Pay.png', page('Payment successful', [
    '**Rs. 1,250 paid to Asha Iyer',
    '~6 Nov 2026, 9:01 am',
    'UPI Ref No 432187650912',
    'From: Kaveri Bank XX4512',
    'Note: dinner at Spice Garden',
], appbar=(46, 125, 50), clock='09:01'))
# 7. a PC's screenshot of a booking page
keep('Screenshot 2026-11-03 at 10.12.44.png', page('Hill View Residency - Booking confirmed', [
    '**Booking ID SU-88124',
    'Guest: Priya Nair   Check-in: Sat 8 Nov 2026, from 14:00   Check-out: Sun 9 Nov 2026, by 11:00',
    'Room: Deluxe Double, 1 room, 2 adults   Total paid: Rs. 4,720 (incl. taxes)',
    'Address: Plot 14, Old Market Road, Lonavala 410401   Phone 0211 427 3388',
    None, '~Free cancellation until 6 Nov 2026, 18:00.',
], size=(1280, 800), appbar=(33, 33, 33)))
# 8. a picture as an iPhone keeps its photos: HEIC (the browser cannot open it itself; libheif reads it), no date in its name
keep('IMG_4471.HEIC', page('Boarding pass', [
    '**Flight 6E 2134  Pune to Goa',
    'Gate 14   Seat 22A   Boarding 06:40',
    'Ref QX7RTA   Passenger: Ravi Kumar',
], appbar=(81, 45, 168), clock='06:12'))
heic = shots.pop('IMG_4471.HEIC'); texts.pop('IMG_4471.HEIC'); boxes.pop('IMG_4471.HEIC')
import pillow_heif
pillow_heif.from_pillow(heic).save(OUT / 'IMG_4471.HEIC', quality=92)
for name, im in shots.items(): im.save(OUT / name, optimize=True)
# photos: two papers from the camera helpers' set, and a picture with no text
SNAPS = ROOT / 'tests/fixtures/snaps'
shutil.copy(SNAPS / 'notice-school.jpg', OUT / 'IMG_20261201_081530.jpg')
shutil.copy(SNAPS / 'restaurant.jpg', OUT / 'IMG_20261127_213012.jpg')
shutil.copy(ROOT / 'tests/fixtures/images/coffee.jpg', OUT / 'IMG_20261012_073000.jpg')

truth = {
    'words': {
        'Screenshot_20261102-190712_WhatsApp.png': ['PNR', '4521', '678', '903', 'Lonavala', 'Residency'],
        'Screenshot_20261020-213344_WhatsApp.png': ['password', 'kT7mq2Vr9w', 'SuperHome_5G'],
        'Screenshot_20261105-081530_Messages.png': ['debited', '2,032.71', 'OTP', '551927'],
        'Screenshot_20261101-120001_Mail.png': ['shipped', 'SK2290045731IN', 'fryer'],
        'Screenshot_20261015-100203_Settings.png': ['Serial', 'R58N21ABCDX', 'IMEI', '352094112746229'],
        'Screenshot_20261106-090102_Pay.png': ['432187650912', '1,250', 'UPI'],
        'Screenshot 2026-11-03 at 10.12.44.png': ['SU-88124', 'Check-in', 'Lonavala'],
        'IMG_20261127_213012.jpg': ['SPICE', 'GARDEN', 'Paneer'],
    },
    'queries': [
        ['PNR', ['Screenshot_20261102-190712_WhatsApp.png']],
        ['4521678903', ['Screenshot_20261102-190712_WhatsApp.png']],
        ['pnr 4521 678 903', ['Screenshot_20261102-190712_WhatsApp.png']],
        ['wifi password', ['Screenshot_20261020-213344_WhatsApp.png']],
        ['kT7mq2Vr9w', ['Screenshot_20261020-213344_WhatsApp.png']],
        ['debited', ['Screenshot_20261105-081530_Messages.png']],
        ['OTP', ['Screenshot_20261105-081530_Messages.png']],
        ['order shipped', ['Screenshot_20261101-120001_Mail.png']],
        ['tracking id', ['Screenshot_20261101-120001_Mail.png']],
        ['serial number', ['Screenshot_20261015-100203_Settings.png']],
        ['IMEI', ['Screenshot_20261015-100203_Settings.png']],
        ['UPI ref', ['Screenshot_20261106-090102_Pay.png']],
        ['432187650912', ['Screenshot_20261106-090102_Pay.png']],
        ['booking id', ['Screenshot 2026-11-03 at 10.12.44.png']],
        ['lonavala', ['Screenshot 2026-11-03 at 10.12.44.png', 'Screenshot_20261102-190712_WhatsApp.png']],  # equals: the newest first (the date in the name)
        ['spice garden', ['IMG_20261127_213012.jpg', 'Screenshot_20261106-090102_Pay.png']],
        ['paneer tikka', ['IMG_20261127_213012.jpg']],
    ],
    'none': ['IMG_20261012_073000.jpg'],
    # the HEIC picture (read in the browser only: MuPDF, the unit suite's decoder, has no HEIC)
    'heic': {'file': 'IMG_4471.HEIC', 'words': ['Boarding', 'QX7RTA', '22A'], 'queries': [['boarding pass', ['IMG_4471.HEIC']], ['seat 22a', ['IMG_4471.HEIC']]]},
    # every text drawn on each screenshot (the measure of a reading: the words of these found in it)
    'texts': texts,
    # and where each word was drawn: [word, x0, y0, x1, y1] in the picture's pixels (the marks on a picture are held to them)
    'boxes': boxes,
}
(OUT / 'truth.json').write_text(json.dumps(truth, indent=1))
print('wrote', len(shots) + 4, 'pictures to', OUT)
