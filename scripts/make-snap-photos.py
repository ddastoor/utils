#!/usr/bin/env python3
# Test photos for the camera helpers (group 4 of the suggested order in docs/potentials.md): router labels (Router Sticker →
# Wi-Fi QR), visiting cards (Visiting Card → Contact), a bill, a renewal letter and a school circular (Paper Deadlines →
# Calendar), a restaurant bill (Bill Splitter by Photo) and a printed leaflet (Camera Reader). Every label, card and paper is
# of our own making — no real product's or company's design; names, numbers and addresses made up — set in Noto Sans (OFL),
# DejaVu Sans Mono and Literata (OFL), then "photographed" on a desk: perspective, a shadow, light falling off, a little blur,
# noise and JPEG. truth.json says what each photo holds.
# Needs: pip install pillow numpy segno.   python3 scripts/make-snap-photos.py
import io, json, zlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import segno

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/fixtures/snaps'
OUT.mkdir(parents=True, exist_ok=True)
NOTO = ROOT / 'node_modules/@expo-google-fonts/noto-sans'
REG, BOLD = NOTO / '400Regular/NotoSans_400Regular.ttf', NOTO / '700Bold/NotoSans_700Bold.ttf'
LIT = ROOT / 'node_modules/@expo-google-fonts/literata/400Regular/Literata_400Regular.ttf'
MONO, MONOB = Path('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf')

def font(p, s): return ImageFont.truetype(str(p), s)
def qrpic(text, scale=4): b = io.BytesIO(); segno.make(text, error='m').save(b, kind='png', scale=scale, border=2); return Image.open(b).convert('RGB')

def barcode(d, x, y, w, h, seed):
    """stripes like a barcode (no real symbology: noise for the reader to ignore)"""
    r = np.random.default_rng(seed); px = x
    while px < x + w:
        bw = int(r.integers(1, 4)); d.rectangle([px, y, px + bw - 1, y + h], fill=(20, 20, 20)); px += bw + int(r.integers(1, 4))

# ---- the camera

def coeffs(dst, src):
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()

def desk(W, H, seed, tone=(118, 84, 58)):
    r = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W]
    grain = 10 * np.sin(yy / 7.0 + 2.5 * np.sin(xx / 90.0)) + 5 * np.sin(yy / 2.3)
    base = np.stack([tone[0] + grain, tone[1] + grain * 0.8, tone[2] + grain * 0.6], -1) + r.normal(0, 3, (H, W, 1))
    light = 1 + 0.18 * (1 - ((xx - W * 0.4) ** 2 + (yy - H * 0.35) ** 2) / (W ** 2))
    return Image.fromarray(np.clip(base * light[..., None], 0, 255).astype(np.uint8))

def photo(pic, corners, seed, size=(1600, 1200), blur=0.6, noise=2.5, tone=(118, 84, 58), turn=0):
    """pic placed on a desk at the four corners (clockwise from top left), shadow, blur, noise; turned a quarter `turn` times
    to the left at the end (a phone held sideways)"""
    W, H = size
    bg = desk(W, H, seed, tone)
    src = [(0, 0), (pic.width, 0), (pic.width, pic.height), (0, pic.height)]
    c = coeffs(corners, src)
    warped = pic.transform(size, Image.PERSPECTIVE, c, Image.BICUBIC)
    mask = Image.new('L', pic.size, 255).transform(size, Image.PERSPECTIVE, c, Image.BICUBIC)
    shadow = Image.new('L', size, 0); ImageDraw.Draw(shadow).polygon([(x + 14, y + 18) for x, y in corners], fill=110)
    bg = Image.composite(Image.new('RGB', size, (20, 14, 10)), bg, shadow.filter(ImageFilter.GaussianBlur(14)))
    out = Image.composite(warped, bg, mask).filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(out).astype(float) + np.random.default_rng(seed).normal(0, noise, (H, W, 3))
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    return out.rotate(90 * turn, expand=True) if turn else out

truth = {}

# ---- router labels: the network name, its password, and the things that are not the password (the admin's, a WPS PIN)

def label(lines, size=(1000, 620), title=None, qr=None, seed=1, mono=False):
    im = Image.new('RGB', size, (246, 246, 244)); d = ImageDraw.Draw(im)
    d.rectangle([6, 6, size[0] - 7, size[1] - 7], outline=(150, 150, 150), width=3)
    y = 30
    if title: d.text((34, y), title, font=font(BOLD, 34), fill=(25, 25, 25)); y += 64
    f, fb = font(MONO if mono else REG, 27), font(MONOB if mono else BOLD, 27)
    for row in lines:
        x = 34
        for k, (text, bold) in enumerate(row):
            d.text((x, y), text, font=fb if bold else f, fill=(18, 18, 18)); x += d.textlength(text, font=fb if bold else f) + (60 if k < len(row) - 1 else 0)
        y += 44
    barcode(d, 34, size[1] - 110, 380, 70, seed)
    d.rectangle([size[0] - 300, size[1] - 110, size[0] - 220, size[1] - 40], outline=(60, 60, 60), width=3); d.text((size[0] - 290, size[1] - 95), 'CE', font=font(BOLD, 40), fill=(60, 60, 60))
    if qr: q = qrpic(qr, 4).resize((200, 200), Image.NEAREST); im.paste(q, (size[0] - 240, 100))
    return im

T = lambda s: [(s, False)]
routers = {
  'router-a': (label([T('Model: AX1500 Wi-Fi 6 Router'), T('Default Access: http://192.168.0.1'), T('SSID: NetLink_7A3F'), T('Wireless Password/PIN: 48271935'),
                      T('MAC: 5C-A6-E6-12-7A-3F'), T('S/N: 2231470009812'), T('Power: 12V DC 1A')], title='Dual Band Wi-Fi Router', seed=11),
               {'networks': [{'ssid': 'NetLink_7A3F', 'password': '48271935'}], 'not': ['192.168.0.1']}),
  'router-b': (label([T('SSID: HomeFiber-qx29'), T('SSID 5G: HomeFiber-qx29-5G'), T('Password: kT7mq2Vr9w'), T('Admin Username: admin'),
                      T('Admin Password: Fiber@2026'), T('GPON SN: HFBR1A2B3C4D')], title='Home Fiber Gateway', seed=12),
               {'networks': [{'ssid': 'HomeFiber-qx29', 'password': 'kT7mq2Vr9w'}, {'ssid': 'HomeFiber-qx29-5G', 'password': 'kT7mq2Vr9w'}], 'not': ['Fiber@2026', 'admin']}),
  'router-c': (label([T('Network Name (SSID): ORBITAL42'), T('Network Key (Password): quickbird512'), T('Router Login: http://routerlogin.net'),
                      [('User Name: admin', False), ('Password: password', False)], T('WPS PIN: 31948627')], title='WIRELESS ROUTER', seed=13),
               {'networks': [{'ssid': 'ORBITAL42', 'password': 'quickbird512'}], 'not': ['password', '31948627']}),
  'router-d': (label([[('WLAN Name: AirNet-K3P9', False)], [('WLAN Key: 6hgk2mtr', False)], [('WLAN Name (5G): AirNet-K3P9-5G', False)], T('Scan to join:')],
                     title='4G LTE CPE', qr='WIFI:T:WPA;S:AirNet-K3P9;P:6hgk2mtr;;', seed=14),
               {'networks': [{'ssid': 'AirNet-K3P9', 'password': '6hgk2mtr'}, {'ssid': 'AirNet-K3P9-5G', 'password': '6hgk2mtr'}], 'qr': 'WIFI:T:WPA;S:AirNet-K3P9;P:6hgk2mtr;;'}),
}
corners = {'router-a': [(240, 260), (1330, 230), (1360, 920), (210, 950)], 'router-b': [(300, 240), (1320, 290), (1290, 960), (260, 900)],
           'router-c': [(220, 300), (1350, 260), (1380, 930), (190, 960)], 'router-d': [(260, 250), (1340, 250), (1340, 920), (260, 920)]}
for k, (pic, t) in routers.items():
    photo(pic, corners[k], zlib.crc32(k.encode()) % 1000, tone=(140, 140, 146)).save(OUT / f'{k}.jpg', quality=88); truth[k] = t
# the first one again, the phone held sideways
photo(routers['router-a'][0], corners['router-a'], 21, tone=(140, 140, 146), turn=1).save(OUT / 'router-a-sideways.jpg', quality=88)
truth['router-a-sideways'] = routers['router-a'][1]

# ---- visiting cards

def vcard_pic(rows, size=(1050, 600), bg=(252, 251, 248), accent=None):
    im = Image.new('RGB', size, bg); d = ImageDraw.Draw(im)
    if accent: d.rectangle([0, 0, 18, size[1]], fill=accent)
    for (x, y, text, f, col) in rows: d.text((x, y), text, font=f, fill=col)
    return im

ink, grey = (25, 25, 30), (70, 72, 80)
card_a = vcard_pic([(60, 50, 'ANANYA IYER', font(BOLD, 50), ink), (60, 118, 'Senior Product Manager', font(REG, 30), grey),
                    (60, 170, 'Kaveri Software Solutions Pvt. Ltd.', font(BOLD, 30), (30, 70, 140)),
                    (60, 300, '+91 98450 12345 (M)', font(REG, 28), ink), (60, 345, '080 4112 3456 (O)', font(REG, 28), ink),
                    (60, 390, 'ananya.iyer@kaverisoft.in', font(REG, 28), ink), (60, 435, 'www.kaverisoft.in', font(REG, 28), ink),
                    (60, 500, '4th Floor, Prestige Tower, MG Road, Bengaluru 560001', font(REG, 25), grey)], accent=(30, 70, 140))
card_b = vcard_pic([(330, 40, 'NARMADA PACKAGING LLP', font(BOLD, 34), (150, 60, 20)), (60, 150, 'Rajesh Patel', font(BOLD, 46), ink),
                    (60, 212, 'Director', font(REG, 30), grey), (60, 300, 'Mob: 98250 67890  |  Tel: +91 79 2656 7788', font(REG, 28), ink),
                    (60, 345, 'Email: rajesh@narmadapack.com', font(REG, 28), ink),
                    (60, 420, 'Plot 12, GIDC Estate, Vatva,', font(REG, 26), grey), (60, 458, 'Ahmedabad, Gujarat 382445', font(REG, 26), grey)])
card_c = vcard_pic([(60, 60, 'Dr. Meera Krishnan', font(BOLD, 44), ink), (60, 122, 'Consultant Cardiologist', font(REG, 28), grey),
                    (60, 165, "St Mary's Heart Clinic", font(REG, 28), grey),
                    (600, 330, '+44 20 7946 0958', font(REG, 27), ink), (600, 372, 'meera.k@stmaryheart.co.uk', font(REG, 25), ink),
                    (60, 330, '12 Harley Street', font(REG, 26), grey), (60, 370, 'London W1G 9PF', font(REG, 26), grey), (60, 410, 'United Kingdom', font(REG, 26), grey)],
                   bg=(245, 247, 250))
cards = {
  'card-a': (card_a, [(250, 280), (1330, 300), (1310, 920), (240, 880)], {'name': 'Ananya Iyer', 'title': 'Senior Product Manager', 'org': 'Kaveri Software Solutions Pvt. Ltd.',
             'phones': [['+919845012345', 'cell'], ['+918041123456', 'work']], 'email': 'ananya.iyer@kaverisoft.in', 'url': 'www.kaverisoft.in',
             'address': '4th Floor, Prestige Tower, MG Road, Bengaluru 560001'}),
  'card-b': (card_b, [(280, 250), (1340, 230), (1370, 860), (300, 890)], {'name': 'Rajesh Patel', 'title': 'Director', 'org': 'NARMADA PACKAGING LLP',
             'phones': [['+919825067890', 'cell'], ['+917926567788', 'work']], 'email': 'rajesh@narmadapack.com', 'url': '',
             'address': 'Plot 12, GIDC Estate, Vatva, Ahmedabad, Gujarat 382445'}),
  'card-c': (card_c, [(260, 300), (1320, 300), (1320, 905), (260, 905)], {'name': 'Meera Krishnan', 'prefix': 'Dr.', 'title': 'Consultant Cardiologist', 'org': "St Mary's Heart Clinic",
             'phones': [['+442079460958', 'work']], 'email': 'meera.k@stmaryheart.co.uk', 'url': '', 'address': '12 Harley Street, London W1G 9PF, United Kingdom'}),
}
for k, (pic, cn, t) in cards.items():
    photo(pic, cn, zlib.crc32(k.encode()) % 1000 + 7).save(OUT / f'{k}.jpg', quality=88); truth[k] = t

# ---- paper deadlines: a bill, a renewal letter, a school circular (A5 pages, photographed)

def page(lines, size=(1240, 1754), f=None):
    im = Image.new('RGB', size, (250, 250, 247)); d = ImageDraw.Draw(im)
    y = 90
    for t in lines:
        if t is None: y += 30; continue
        fnt, text = (font(BOLD, 40), t[2:]) if t.startswith('# ') else ((font(BOLD, 30), t[2:]) if t.startswith('* ') else (f or font(REG, 30), t))
        d.text((90, y), text, font=fnt, fill=(22, 22, 25)); y += int(fnt.size * 1.55)
    return im

bill = page(['# Godavari Power Distribution Co. Ltd.', 'Consumer number 170012345678', 'Ms Asha Deshpande, 14 Gangapur Road, Nashik 422013', None,
             '* Electricity bill for November 2026', 'Bill date: 28/11/2026', 'Due date: 15/12/2026', 'Amount payable: ₹ 2,032.71', None,
             'Please pay by the due date to avoid a late payment', 'charge of 1.25 % a month. If the bill is not paid,', 'supply may be disconnected after 30/12/2026.', None,
             'Pay online within 7 days of the bill date for a', 'prompt payment discount of 1 %.'])
letter = page(['# Sahyadri General Insurance', 'Policy number: SGI/MTR/2026/0047713', 'Dear Mr. Kulkarni,', None,
               'Your motor insurance policy expires on', '31 January 2027. Please renew it by 25-01-2027', 'to keep your no-claim bonus of 35 %.', None,
               'Renewal premium: Rs. 14,250.00 (including GST)', None, 'A grace period of 30 days after expiry applies', 'to the no-claim bonus only.', None, 'Date: 01/12/2026'])
circular = page(['# Green Valley Public School', 'Circular No. 42/2026-27            Date: 1 December 2026', None, 'Dear Parents,', None,
                 'The parent-teacher meeting will be held on', 'Saturday, 6th December 2026 at 10:00 am.', None,
                 'Fees for the third term (Rs. 18,500) are due by', '10 December 2026. Consent forms for the science', 'trip must be returned within 15 days of the', 'date of this circular.', None, 'Principal'])
papers = {
  'notice-bill': (bill, [(330, 120), (1250, 150), (1290, 1150), (300, 1130)], {'dates': [['2026-11-28', 'Bill date'], ['2026-12-15', 'Due date'], ['2026-12-30', 'disconnected after']],
                  'amounts': [['2032.71', 'Amount payable']], 'relative': [['2026-12-05', 'within 7 days of the bill date']]}),
  'notice-renewal': (letter, [(320, 110), (1270, 140), (1300, 1150), (280, 1120)], {'dates': [['2027-01-31', 'expires on'], ['2027-01-25', 'renew it by'], ['2026-12-01', 'Date']],
                  'amounts': [['14250', 'Renewal premium']], 'relative': [['2027-03-02', '30 days after expiry']]}),
  'notice-school': (circular, [(310, 130), (1260, 110), (1300, 1140), (290, 1160)], {'dates': [['2026-12-01', 'Date'], ['2026-12-06', 'parent-teacher meeting'], ['2026-12-10', 'are due by']],
                  'times': [['2026-12-06', '10:00']], 'amounts': [['18500', 'Fees']], 'relative': [['2026-12-16', 'within 15 days of the date of this circular']]}),
}
for k, (pic, cn, t) in papers.items():
    photo(pic, cn, zlib.crc32(k.encode()) % 1000 + 3, size=(1600, 1300)).save(OUT / f'{k}.jpg', quality=88); truth[k] = t

# ---- a restaurant bill (thermal paper, monospace)

items = [('Paneer Tikka', 1, 320.00), ('Butter Naan', 4, 60.00), ('Dal Makhani', 1, 280.00), ('Veg Biryani', 2, 250.00), ('Masala Chaas', 3, 70.00), ('Gulab Jamun', 2, 90.00)]
sub = sum(q * r for _, q, r in items)                 # 1730.00
service = round(sub * 0.05, 2)                         # 86.50
cgst = round((sub + service) * 0.025, 2)               # 45.41
total_exact = round(sub + service + 2 * cgst, 2)       # 1907.32
total = round(total_exact)                             # 1907
rows = ['      SPICE GARDEN RESTAURANT', '     12 MG Road, Pune 411001', '    GSTIN: 27ABCDE1234F1Z5', '', 'Date: 27/11/2026     Table: 7', '-' * 36,
        f'{"Item":<16}{"Qty":>4}{"Rate":>8}{"Amount":>8}']
rows += [f'{n:<16}{q:>4}{r:>8.2f}{q * r:>8.2f}' for n, q, r in items]
rows += ['-' * 36, f'{"Sub Total":<26}{sub:>10.2f}', f'{"Service Charge 5%":<26}{service:>10.2f}', f'{"CGST 2.5%":<26}{cgst:>10.2f}', f'{"SGST 2.5%":<26}{cgst:>10.2f}',
         f'{"Round Off":<26}{total - total_exact:>10.2f}', '-' * 36, f'{"TOTAL":<26}{total:>10.2f}', '', '      Thank you! Visit again']
rc = Image.new('RGB', (760, 70 + 46 * len(rows)), (250, 249, 244)); d = ImageDraw.Draw(rc)
for i, t in enumerate(rows): d.text((30, 35 + 46 * i), t, font=font(MONOB if t.strip().startswith(('SPICE', 'TOTAL')) else MONO, 30), fill=(35, 35, 40))
photo(rc, [(500, 70), (1130, 90), (1110, 1250), (480, 1230)], 77, size=(1600, 1320)).save(OUT / 'restaurant.jpg', quality=88)
truth['restaurant'] = {'items': [[n, q, round(q * r, 2)] for n, q, r in items], 'subtotal': sub, 'service': service, 'cgst': cgst, 'sgst': cgst, 'roundoff': round(total - total_exact, 2), 'total': total}

# ---- a printed leaflet for the Camera Reader

leaflet_text = ['How to take this medicine', None, 'Take one tablet twice a day, after breakfast and', 'after dinner, with a full glass of water.',
                'Do not take more than two tablets in a day.', None, 'Keep the tablets in a cool, dry place, out of the', 'reach of children.',
                None, 'If you feel dizzy or sick, stop taking them and', 'speak to your doctor.']
lp = page(['# ' + leaflet_text[0]] + leaflet_text[1:], size=(1240, 1100), f=font(LIT, 34))
photo(lp, [(260, 160), (1340, 190), (1360, 1080), (230, 1050)], 91, size=(1600, 1250)).save(OUT / 'leaflet.jpg', quality=88)
truth['leaflet'] = {'text': ' '.join(t for t in leaflet_text if t)}

(OUT / 'truth.json').write_text(json.dumps(truth, indent=1, ensure_ascii=False) + '\n')
print('wrote', sorted(p.name for p in OUT.iterdir()))
