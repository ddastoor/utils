#!/usr/bin/env python3
# Test screenshots for the Long Screenshot Stitcher (potentials #87): phone screenshots of a chat and of a web page, taken
# while scrolling. Every chat, page, name and number is of our own making — a chat in the manner of a messaging app, a news
# page in the manner of a newspaper's, no real app's or site's design — set in Noto Sans (OFL).
# What makes them hard is what real ones have: the chat's wallpaper stays put while the messages scroll over it; the clock,
# the battery and the contact's line ("online", "typing…") change between screenshots; a date chip floats over the top of
# the messages after a scroll and a "scroll down" button over their bottom; a scrollbar's thumb shows at the right; a
# browser's address bar is there in the first screenshot only, a page's own header and a cookie banner stay put over the
# page; screenshots forwarded through a chat app come smaller and as JPEG.
# truth.json, for every set: the screenshots; for each, `offset` — its row y in the part that scrolls shows page row
# y + offset (a float for a set made smaller) —, that part (`top` … `bottom`), and what floats over it (`float`, boxes);
# `order` the screenshots top to bottom; `alone` those that share nothing with the others; `same` duplicates.
# Needs: pip install pillow numpy.   python3 scripts/make-stitch-shots.py
import json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/fixtures/stitch'
OUT.mkdir(parents=True, exist_ok=True)
NOTO = ROOT / 'node_modules/@expo-google-fonts/noto-sans'
REG, BOLD = NOTO / '400Regular/NotoSans_400Regular.ttf', NOTO / '700Bold/NotoSans_700Bold.ttf'
_fonts = {}
def font(bold, size):
    k = (bold, int(size))
    if k not in _fonts: _fonts[k] = ImageFont.truetype(str(BOLD if bold else REG), int(size))
    return _fonts[k]

def wrap(text, f, width):
    lines, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if f.getlength(t) <= width or not cur: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

THEMES = {
    'light': dict(wall=(239, 231, 222), doodle=(225, 214, 202), bar=(255, 255, 255), bartext=(17, 27, 33), sub=(102, 119, 129),
                  inb=(255, 255, 255), outb=(217, 253, 211), text=(17, 27, 33), time=(102, 119, 129), tick=(83, 189, 235),
                  chip=(255, 255, 255), chiptext=(84, 101, 111), field=(255, 255, 255), nav=(255, 255, 255), pill=(60, 60, 60),
                  accent=(0, 168, 132), sep=(225, 245, 254)),
    'dark': dict(wall=(11, 20, 26), doodle=(20, 32, 40), bar=(31, 44, 52), bartext=(233, 237, 239), sub=(134, 150, 160),
                 inb=(32, 44, 51), outb=(0, 92, 75), text=(233, 237, 239), time=(150, 166, 175), tick=(83, 189, 235),
                 chip=(24, 34, 41), chiptext=(134, 150, 160), field=(42, 57, 66), nav=(11, 20, 26), pill=(200, 200, 200),
                 accent=(0, 168, 132), sep=(24, 34, 41)),
}

class Phone:
    """a phone's screen: W × H, the bars' heights scaled from a 1080-px design"""
    def __init__(self, W, H):
        self.W, self.H, self.s = W, H, W / 1080
        s = self.s
        self.SB, self.AB, self.IB, self.NB = round(84 * s), round(156 * s), round(168 * s), round(84 * s)
        self.TOP, self.BOT = self.SB + self.AB, H - self.IB - self.NB
    def px(self, v): return round(v * self.s)

# ------------------------------------------------------------------ a chat
CHAT = [
    ('date', 'Yesterday'),
    ('in', 'Hi! Are we still on for Saturday? Amma is asking what time we leave.', '19:02'),
    ('out', 'Yes, leaving Pune at 6 am sharp. Tell her to pack the theplas.', '19:04'),
    ('in', 'Haha she already made two boxes. Did you book the train back?', '19:05'),
    ('out', 'Booked. PNR 4521 678 903, coach B2, seats 41 and 42.', '19:07'),
    ('out', 'Train leaves Lonavala at 17:35 on Sunday.', '19:07'),
    ('in', 'Perfect. Which hotel did you finally pick?', '19:10'),
    ('out', 'Hill View Residency, near the market. Room 207, check in after noon.', '19:12'),
    ('in', 'Send me the address, I will share it with Ravi too.', '19:13'),
    ('out', 'Plot 14, Old Market Road, Lonavala 410401. Phone 0211 427 3388.', '19:15'),
    ('photo', 'Lonavala last year — the view from the old fort', '19:16'),
    ('in', 'Wow that view! Let us go up to the fort again this time.', '19:20'),
    ('out', 'Only if you carry the water bottles this time.', '19:21'),
    ('in', 'Deal. What about Tiger Point on Sunday morning?', '19:22'),
    ('out', 'Sure, we can take an auto from the hotel at 7. Should take 25 minutes.', '19:24'),
    ('in', 'Okay. Ravi wants to know if he should bring his camera.', '19:30'),
    ('out', 'Yes please! Mine broke last month.', '19:31'),
    ('date', 'Today'),
    ('in', 'Good morning! Weather says light rain in the evening.', '08:12'),
    ('out', 'Carry umbrellas then. And the power bank.', '08:14'),
    ('in', 'Also the Wi-Fi password at the hotel is HillView@2026 according to their site.', '08:15'),
    ('out', 'Noted. Network name HillView_Guest, right?', '08:16'),
    ('in', 'Yes. Breakfast is from 7:30 to 10:30 in the dining hall.', '08:17'),
    ('out', 'Great, we can eat before the fort.', '08:18'),
    ('in', 'Amma says please do not forget the medicines box on the table.', '08:25'),
    ('out', 'Already in my bag. Paracetamol, ORS and the cough syrup.', '08:26'),
    ('in', 'You are the best. Ravi is reaching the station at 5:40.', '08:30'),
    ('out', 'Tell him platform 3, the Deccan Queen. I will wait near the bookstall.', '08:31'),
    ('in', 'He says ok. Also bring cash, the auto drivers there do not take UPI.', '08:33'),
    ('out', 'Will withdraw 3,000 tonight.', '08:34'),
    ('in', 'And the return tickets, print them or just the SMS?', '08:36'),
    ('out', 'The SMS is enough, but I will keep a screenshot too.', '08:37'),
    ('in', 'Smart. See you tomorrow then!', '08:40'),
    ('out', 'See you! 6 am, do not be late.', '08:41'),
    ('in', 'One more thing, Ravi asks whether we need jackets up at the fort.', '09:02'),
    ('out', 'A light one. It gets windy after four, and the steps are slippery in the rain.', '09:04'),
    ('in', 'Okay. Should I bring the small speaker for the evening?', '09:06'),
    ('out', 'Sure, but keep it low, the hotel has a quiet hours rule after 10 pm.', '09:07'),
    ('in', 'Haha fine. What is the plan for lunch on Saturday?', '09:15'),
    ('out', 'There is a Maharashtrian thali place near the station, Annapurna Bhojanalay.', '09:16'),
    ('out', 'Opens at 11:30. The thali is 280 rupees and unlimited.', '09:16'),
    ('in', 'Amma will love that. Book a table for four?', '09:18'),
    ('out', 'They do not take bookings, we just go early.', '09:19'),
    ('in', 'Got it. And dinner, should we eat at the hotel?', '09:25'),
    ('out', 'Their restaurant closes at 9:30, so let us order by 8:45.', '09:26'),
    ('in', 'Okay. I just transferred 2,450 to you for my share of the room.', '09:40'),
    ('out', 'Received, thanks! Reference ends 7731.', '09:41'),
    ('in', 'Also Ravi says his train from Thane gets in at 5:20, not 5:40.', '09:55'),
    ('out', 'Even better. Coffee at the station before we leave then.', '09:56'),
    ('in', 'Last question, is the fort open on Saturdays?', '10:05'),
    ('out', 'Open every day from 8 am to 6 pm, ticket 25 rupees each.', '10:06'),
    ('in', 'Perfect. All set then!', '10:10'),
    ('out', 'All set. Sleep early tonight.', '10:11'),
]

def doodles(W, H, base, ink, seed):
    """a wallpaper that stays put: faint shapes on a ground colour"""
    im = Image.new('RGB', (W, H), base); d = ImageDraw.Draw(im); r = np.random.default_rng(seed)
    for _ in range(int(W * H / 9000)):
        x, y, k = int(r.integers(0, W)), int(r.integers(0, H)), int(r.integers(0, 4))
        z = int(r.integers(8, 22))
        if k == 0: d.ellipse([x - z, y - z, x + z, y + z], outline=ink, width=2)
        elif k == 1: d.line([x - z, y - z // 2, x + z, y + z // 2], fill=ink, width=2)
        elif k == 2: d.rectangle([x - z // 2, y - z // 2, x + z // 2, y + z // 2], outline=ink, width=2)
        else: d.polygon([(x, y - z), (x + z, y + z), (x - z, y + z)], outline=ink, width=2)
    return im

def photo(w, h, seed):
    """a made-up photo: sky, hills, a fort's wall — each seed its own"""
    r = np.random.default_rng(seed)
    y = np.linspace(0, 1, h)[:, None]
    tint = r.uniform(-25, 25, 3)
    sky = (np.stack([120 + 80 * y, 170 + 50 * y, 230 - 20 * y], -1) + tint) * np.ones((1, w, 1))
    im = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    ph0, fx = r.uniform(0, 6), r.uniform(0.15, 0.6)
    for k, col in enumerate([(70, 110, 80), (50, 90, 60), (40, 70, 50)]):
        pts = [(0, h)] + [(x, int(h * (0.45 + 0.12 * k) + 30 * math.sin(x / (60 + 20 * k) + k + ph0) + r.normal(0, 3))) for x in range(0, w + 20, 20)] + [(w, h)]
        d.polygon(pts, fill=col)
    x0, x1 = int(w * fx), int(w * (fx + 0.25))
    d.rectangle([x0, int(h * 0.35), x1, int(h * 0.6)], fill=(150, 130, 110))
    for x in range(x0, x1, 18): d.rectangle([x, int(h * 0.31), x + 9, int(h * 0.35)], fill=(150, 130, 110))
    return im

def chat_page(ph, th, items, photo_seed=7):
    """the messages one under another (RGBA: opaque where a bubble or a date stands; the wallpaper shows elsewhere);
       returns the page and where each date group begins (for the chip)"""
    s, W = ph.s, ph.W
    tf, sf, df = font(False, 40 * s), font(False, 27 * s), font(True, 30 * s)
    maxw, padx, pady, lh = 700 * s, 26 * s, 16 * s, 54 * s
    blocks, groups, y, prev = [], [], round(24 * s), None
    for it in items:
        kind = it[0]
        if kind == 'date':
            tw = df.getlength(it[1]); bw, bh = int(tw + 48 * s), int(60 * s)
            x0 = (W - bw) // 2; y += round(16 * s)
            blocks.append(('date', x0, y, bw, bh, it[1])); groups.append((y, it[1])); y += bh + round(16 * s); prev = None; continue
        gap = round(6 * s) if prev == kind else round(18 * s)
        y += gap
        if kind == 'photo':
            pw, phh = int(640 * s), int(400 * s)
            lines = wrap(it[1], tf, pw - 2 * padx)
            bw, bh = int(pw + 12 * s), int(phh + 12 * s + len(lines) * lh + pady * 2 + 30 * s)
            x0 = W - bw - round(24 * s)
            blocks.append(('photo', x0, y, bw, bh, lines, it[2], pw, phh)); y += bh; prev = 'out'; continue
        lines = wrap(it[1], tf, maxw - 2 * padx)
        tw = max(tf.getlength(l) for l in lines)
        stamp = sf.getlength(it[2]) + (60 * s if kind == 'out' else 20 * s)
        last = tf.getlength(lines[-1])
        extra_line = last + stamp + 20 * s > maxw - 2 * padx
        bw = int(min(maxw, max(tw, last + stamp) + 2 * padx + 10 * s))
        bh = int(len(lines) * lh + 2 * pady + (lh * 0.7 if extra_line else 0))
        x0 = round(24 * s) if kind == 'in' else W - bw - round(24 * s)
        blocks.append((kind, x0, y, bw, bh, lines, it[2], extra_line)); y += bh; prev = kind
    Hp = y + round(30 * s)
    page = Image.new('RGBA', (W, Hp), (0, 0, 0, 0)); d = ImageDraw.Draw(page)
    for b in blocks:
        kind, x0, y0, bw, bh = b[:5]
        if kind == 'date':
            d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=int(16 * s), fill=th['sep'] + (255,))
            d.text((x0 + bw / 2, y0 + bh / 2), b[5], font=df, fill=th['chiptext'], anchor='mm'); continue
        fill = th['inb'] if kind == 'in' else th['outb']
        d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=int(20 * s), fill=fill + (255,))
        if kind == 'photo':
            lines, stamp, pw, phh = b[5], b[6], b[7], b[8]
            page.paste(photo(pw, phh, photo_seed), (x0 + int(6 * s), y0 + int(6 * s)))
            ty = y0 + int(6 * s) + phh + pady
            for l in lines: d.text((x0 + padx, ty), l, font=tf, fill=th['text']); ty += lh
            d.text((x0 + bw - padx - 50 * s, y0 + bh - pady), stamp, font=sf, fill=th['time'], anchor='rd')
            continue
        lines, stamp, extra = b[5], b[6], b[7]
        ty = y0 + pady
        for l in lines: d.text((x0 + padx, ty), l, font=tf, fill=th['text']); ty += lh
        sx = x0 + bw - padx - (44 * s if kind == 'out' else 0)
        d.text((sx, y0 + bh - pady * 0.6), stamp, font=sf, fill=th['time'], anchor='rd')
        if kind == 'out':  # two ticks
            tx, ty2 = x0 + bw - padx - 34 * s, y0 + bh - pady * 0.6 - 16 * s
            for k in (0, 1):
                ox = tx + k * 10 * s
                d.line([(ox, ty2 + 6 * s), (ox + 6 * s, ty2 + 12 * s), (ox + 18 * s, ty2)], fill=th['tick'], width=max(2, int(3 * s)))
    return page, groups

def status_bar(d, ph, th, clock, battery, dark_icons=True):
    s, W = ph.s, ph.W
    d.rectangle([0, 0, W, ph.SB], fill=th['bar'])
    d.text((40 * s, ph.SB / 2), clock, font=font(True, 36 * s), fill=th['bartext'], anchor='lm')
    x = W - 40 * s  # battery, wi-fi, signal from the right
    d.text((x, ph.SB / 2), f'{battery}%', font=font(False, 30 * s), fill=th['bartext'], anchor='rm')
    bx = x - 80 * s - font(False, 30 * s).getlength(f'{battery}%')
    d.rounded_rectangle([bx, ph.SB / 2 - 14 * s, bx + 50 * s, ph.SB / 2 + 14 * s], radius=int(4 * s), outline=th['bartext'], width=max(1, int(3 * s)))
    d.rectangle([bx + 4 * s, ph.SB / 2 - 10 * s, bx + 4 * s + 42 * s * battery / 100, ph.SB / 2 + 10 * s], fill=th['bartext'])
    for k in range(4):  # signal bars
        sx = bx - 90 * s + k * 14 * s
        d.rectangle([sx, ph.SB / 2 + 14 * s - (k + 1) * 7 * s, sx + 9 * s, ph.SB / 2 + 14 * s], fill=th['bartext'])

def chat_shot(ph, th, page, wall, offset, clock, battery, line2, chip=None, button=False, thumb=None):
    """one screenshot: the page rows offset … under the bars; `chip` the date floating at the top, `button` the
       scroll-down button, `thumb` the scrollbar's thumb (its top in the part that scrolls); returns it and what floats"""
    s, W, H, TOP, BOT = ph.s, ph.W, ph.H, ph.TOP, ph.BOT
    im = Image.new('RGB', (W, H), th['bar']); d = ImageDraw.Draw(im)
    region = wall.copy()
    part = page.crop((0, offset, W, offset + (BOT - TOP)))
    region.paste(part, (0, 0), part)
    im.paste(region, (0, TOP))
    floats = []
    if chip:
        cf = font(True, 30 * s); tw = cf.getlength(chip); bw, bh = int(tw + 48 * s), int(60 * s)
        x0, y0 = (W - bw) // 2, TOP + int(14 * s)
        d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=int(16 * s), fill=th['chip'])
        d.text((x0 + bw / 2, y0 + bh / 2), chip, font=cf, fill=th['chiptext'], anchor='mm')
        floats.append([x0, y0, x0 + bw, y0 + bh])
    if button:
        cx, cy, r = W - 80 * s, BOT - 90 * s, 44 * s
        d.ellipse([cx - r, cy - r + 3 * s, cx + r, cy + r + 3 * s], fill=(150, 150, 150))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=th['chip'])
        d.line([(cx - 14 * s, cy - 6 * s), (cx, cy + 8 * s), (cx + 14 * s, cy - 6 * s)], fill=th['chiptext'], width=max(2, int(4 * s)))
        floats.append([int(cx - r), int(cy - r), int(cx + r) + 1, int(cy + r + 3 * s) + 1])
    if thumb is not None:
        th_h = int(160 * s); x0 = W - int(9 * s)
        d.rounded_rectangle([x0, TOP + thumb, W - int(3 * s), TOP + thumb + th_h], radius=int(3 * s), fill=(150, 150, 150))
        floats.append([x0, TOP + thumb, W, TOP + thumb + th_h + 1])
    # the bars
    status_bar(d, ph, th, clock, battery)
    d.rectangle([0, ph.SB, W, TOP], fill=th['bar'])
    cy = ph.SB + ph.AB / 2
    d.line([(36 * s, cy), (70 * s, cy)], fill=th['bartext'], width=max(2, int(5 * s)))
    d.line([(36 * s, cy), (52 * s, cy - 16 * s)], fill=th['bartext'], width=max(2, int(5 * s)))
    d.line([(36 * s, cy), (52 * s, cy + 16 * s)], fill=th['bartext'], width=max(2, int(5 * s)))
    d.ellipse([90 * s, cy - 40 * s, 170 * s, cy + 40 * s], fill=(214, 140, 70))
    d.text((130 * s, cy), 'A', font=font(True, 40 * s), fill=(255, 255, 255), anchor='mm')
    d.text((194 * s, cy - 22 * s), 'Asha Iyer', font=font(True, 42 * s), fill=th['bartext'], anchor='lm')
    d.text((194 * s, cy + 26 * s), line2, font=font(False, 30 * s), fill=th['sub'] if line2 != 'typing…' else th['accent'], anchor='lm')
    for k, x in enumerate((W - 250 * s, W - 150 * s)):
        d.rounded_rectangle([x, cy - 16 * s, x + 44 * s, cy + 16 * s], radius=int(6 * s), outline=th['bartext'], width=max(2, int(4 * s)))
    for k in range(3): d.ellipse([W - 58 * s, cy - 26 * s + k * 22 * s, W - 48 * s, cy - 16 * s + k * 22 * s], fill=th['bartext'])
    d.rectangle([0, BOT, W, BOT + ph.IB], fill=th['wall'])
    d.rounded_rectangle([20 * s, BOT + 30 * s, W - 150 * s, BOT + ph.IB - 30 * s], radius=int(54 * s), fill=th['field'])
    d.text((110 * s, BOT + ph.IB / 2), 'Message', font=font(False, 40 * s), fill=th['sub'], anchor='lm')
    d.ellipse([46 * s, BOT + ph.IB / 2 - 20 * s, 86 * s, BOT + ph.IB / 2 + 20 * s], outline=th['sub'], width=max(2, int(4 * s)))
    d.ellipse([W - 130 * s, BOT + 30 * s, W - 20 * s, BOT + ph.IB - 30 * s], fill=th['accent'])
    d.rounded_rectangle([W - 85 * s, BOT + ph.IB / 2 - 22 * s, W - 65 * s, BOT + ph.IB / 2 + 12 * s], radius=int(10 * s), fill=(255, 255, 255))
    d.rectangle([0, H - ph.NB, W, H], fill=th['nav'])
    d.rounded_rectangle([W / 2 - 140 * s, H - ph.NB / 2 - 6 * s, W / 2 + 140 * s, H - ph.NB / 2 + 6 * s], radius=int(6 * s), fill=th['pill'])
    return im, floats

def chip_at(groups, offset):
    """the date of the messages at the top of the part that scrolls"""
    label = groups[0][1]
    for y, g in groups:
        if y <= offset + 40: label = g
    return label

def save(im, name, jpeg=None):
    p = OUT / name
    if jpeg: im.convert('RGB').save(p, quality=jpeg, subsampling=2 if jpeg < 90 else 0)
    else: im.save(p, optimize=True)
    return name

def chat_set(prefix, ph, theme, offsets, shots_meta, *, items=CHAT, scale=None, jpeg=None, names=None, seed=3):
    """screenshots of the chat at the page offsets; shots_meta[i] = (clock, battery, line2, chip?, button?, thumb?)"""
    th = THEMES[theme]
    page, groups = chat_page(ph, th, items)
    region_h = ph.BOT - ph.TOP
    wall = doodles(ph.W, region_h, th['wall'], th['doodle'], seed)
    shots = []
    for i, (off, meta) in enumerate(zip(offsets, shots_meta)):
        off = max(0, min(off, page.height - region_h))
        clock, battery, line2, chip, button, thumb = meta
        tpos = None
        if thumb:
            span = region_h - int(160 * ph.s)
            tpos = int(span * off / max(1, page.height - region_h))
        im, fl = chat_shot(ph, th, page, wall, off, clock, battery, line2, chip_at(groups, off) if chip else None, button, tpos)
        top, bottom, o = ph.TOP, ph.BOT, off - ph.TOP
        if scale:
            W2, H2 = round(ph.W * scale), round(ph.H * scale)
            im = im.resize((W2, H2), Image.LANCZOS)
            fl = [[math.floor(v * scale) if k < 2 else math.ceil(v * scale) for k, v in enumerate(b)] for b in fl]
            top, bottom, o = math.ceil(top * scale), math.floor(bottom * scale), o * scale
        name = names[i] if names else f'{prefix}-{i + 1}.{"jpg" if jpeg else "png"}'
        save(im, name, jpeg)
        shots.append({'file': name, 'offset': o, 'top': top, 'bottom': bottom, 'float': fl})
    return {'width': round(ph.W * (scale or 1)), 'height': round(ph.H * (scale or 1)), 'page': page.height,
            'shots': shots, 'order': [x['file'] for x in sorted(shots, key=lambda x: x['offset'])]}

# ------------------------------------------------------------------ a web page in a phone's browser
ARTICLE = [
    ('h1', 'Metro Line 3 opens to riders this weekend after six years of work'),
    ('by', 'By Priya Nair · 28 November 2026 · 6 min read'),
    ('img', 1),
    ('p', 'The long-awaited underground line between Aarey and Cuffe Parade carried its first passengers on Saturday morning, with the first train leaving the depot at 6:30 am to cheers from a small crowd of commuters who had queued since before dawn.'),
    ('p', 'Officials said the 33.5 km line has 27 stations, of which 26 are underground, and is expected to carry about 13 lakh riders a day once all its trains are running. Fares start at 10 rupees and go up to 70 rupees for the full length of the line.'),
    ('h2', 'What changes for daily commuters'),
    ('p', 'For people travelling between the western suburbs and the business districts in the south, the line promises to cut a journey of more than ninety minutes by road to under an hour. Trains will run every six minutes during the morning and evening peaks.'),
    ('li', 'First train from both ends at 6:30 am, last at 10:30 pm'),
    ('li', 'Every station has lifts and step-free access'),
    ('li', 'Tickets by QR code, a travel card or a phone app'),
    ('p', 'Several stations connect with the suburban railway and with other metro lines. Walkways at the airport station link both terminals, which the operator expects to be one of the busiest interchanges on the network.'),
    ('quote', '“We wanted a line that a grandmother with two bags can use without asking anyone for help,” the project director said.'),
    ('img', 2),
    ('h2', 'Questions that remain'),
    ('p', 'Residents near two of the stations have complained of noise from the ventilation shafts, and the operator has promised to fit silencers before the monsoon. Parking near stations remains limited, and feeder buses have been announced only for four of them.'),
    ('p', 'Transport experts say the real test will come in the first month, when the number of riders grows and the trains run at their full frequency. They point out that the first phase of the line saw only a third of the forecast riders in its first year.'),
    ('h2', 'How to plan your first ride'),
    ('p', 'Travel cards bought for the older lines work on the new one. Riders without a card can buy a single-journey QR ticket at the station or through the operator’s app, which also shows the next trains and the crowding in each coach.'),
    ('p', 'The operator asks first-time riders to avoid the peak hours for the first week, while staff help people find their way through the larger stations. Lost and found counters are at Bandra Kurla Complex and at the airport.'),
]

def web_page(ph):
    s, W = ph.s, ph.W
    pad, hdr = round(40 * s), round(120 * s)
    h1, by, pf, h2, qf = font(True, 56 * s), font(False, 30 * s), font(False, 40 * s), font(True, 46 * s), font(False, 42 * s)
    parts, y = [], hdr + round(30 * s)
    for kind, val in ARTICLE:
        if kind == 'img':
            ih = round(560 * s); parts.append(('img', y, ih, val)); y += ih + round(36 * s); continue
        f = {'h1': h1, 'by': by, 'p': pf, 'h2': h2, 'li': pf, 'quote': qf}[kind]
        lh = round({'h1': 72, 'by': 44, 'p': 60, 'h2': 62, 'li': 60, 'quote': 62}[kind] * s)
        indent = round(56 * s) if kind == 'li' else round(48 * s) if kind == 'quote' else 0
        lines = wrap(val, f, W - 2 * pad - indent)
        if kind in ('h2',): y += round(24 * s)
        parts.append((kind, y, lines, f, lh, indent)); y += len(lines) * lh + round(28 * s)
    foot = round(520 * s)
    Hp = y + round(40 * s) + foot
    page = Image.new('RGBA', (W, Hp), (255, 255, 255, 255)); d = ImageDraw.Draw(page)
    fy = Hp - foot  # the site's footer: sections, links, the copyright line
    d.rectangle([0, fy, W, Hp], fill=(30, 34, 40))
    d.text((pad, fy + 40 * s), 'The Example Times', font=font(True, 44 * s), fill=(255, 255, 255))
    for k, t in enumerate(['City', 'India', 'World', 'Business', 'Sport', 'Opinion']):
        d.text((pad + (k % 3) * 220 * s, fy + 130 * s + (k // 3) * 70 * s), t, font=font(False, 34 * s), fill=(200, 205, 212))
    d.text((pad, fy + 320 * s), 'About us · Contact · Privacy · Terms', font=font(False, 30 * s), fill=(160, 166, 175))
    d.text((pad, fy + 400 * s), '© 2026 The Example Times. A made-up newspaper.', font=font(False, 28 * s), fill=(130, 136, 145))
    for p in parts:
        if p[0] == 'img':
            page.paste(photo(W, p[2], 20 + p[3]).convert('RGBA'), (0, p[1])); continue
        kind, y0, lines, f, lh, indent = p
        col = {'h1': (20, 20, 20), 'by': (110, 110, 110), 'p': (34, 34, 34), 'h2': (20, 20, 20), 'li': (34, 34, 34), 'quote': (60, 60, 90)}[kind]
        if kind == 'li': d.ellipse([pad + 18 * s, y0 + lh / 2 - 6 * s, pad + 30 * s, y0 + lh / 2 + 6 * s], fill=col)
        if kind == 'quote': d.rectangle([pad, y0, pad + 8 * s, y0 + len(lines) * lh], fill=(200, 40, 40))
        for k, l in enumerate(lines): d.text((pad + indent, y0 + k * lh), l, font=f, fill=col)
    return page, hdr

def web_shot(ph, page, hdr, doc_top, with_url, clock, battery):
    """a screenshot: the browser's address bar (first screenshot only), the page from doc_top under the site's own header
       (which stays at the top), a cookie banner that stays at the bottom"""
    s, W, H = ph.s, ph.W, ph.H
    im = Image.new('RGB', (W, H), (255, 255, 255)); d = ImageDraw.Draw(im)
    V = ph.SB + (round(156 * s) if with_url else 0)
    banner = round(120 * s); bottom = H - ph.NB - banner
    doc_top = max(0, min(doc_top, page.height - (bottom - V)))
    part = page.crop((0, doc_top, W, doc_top + (bottom - V)))
    im.paste(part.convert('RGB'), (0, V))
    # the site's header, over the page's top
    d.rectangle([0, V, W, V + hdr], fill=(14, 42, 92))
    d.text((40 * s, V + hdr / 2), 'The Example Times', font=font(True, 46 * s), fill=(255, 255, 255), anchor='lm')
    for k in range(3): d.rectangle([W - 90 * s, V + hdr / 2 - 22 * s + k * 18 * s, W - 40 * s, V + hdr / 2 - 14 * s + k * 18 * s], fill=(255, 255, 255))
    if with_url:
        d.rectangle([0, ph.SB, W, V], fill=(241, 243, 244))
        d.rounded_rectangle([24 * s, ph.SB + 26 * s, W - 170 * s, V - 26 * s], radius=int(52 * s), fill=(255, 255, 255))
        d.text((70 * s, (ph.SB + V) / 2), 'news.example.in/city/metro-line-3', font=font(False, 34 * s), fill=(60, 64, 67), anchor='lm')
        d.rounded_rectangle([W - 140 * s, (ph.SB + V) / 2 - 24 * s, W - 92 * s, (ph.SB + V) / 2 + 24 * s], radius=int(8 * s), outline=(60, 64, 67), width=max(2, int(4 * s)))
        for k in range(3): d.ellipse([W - 52 * s, (ph.SB + V) / 2 - 26 * s + k * 20 * s, W - 42 * s, (ph.SB + V) / 2 - 16 * s + k * 20 * s], fill=(60, 64, 67))
    d.rectangle([0, bottom, W, bottom + banner], fill=(50, 50, 50))
    d.text((40 * s, bottom + banner / 2), 'We use cookies to improve your visit.', font=font(False, 32 * s), fill=(255, 255, 255), anchor='lm')
    d.rounded_rectangle([W - 220 * s, bottom + 28 * s, W - 40 * s, bottom + banner - 28 * s], radius=int(10 * s), fill=(255, 196, 0))
    d.text((W - 130 * s, bottom + banner / 2), 'Accept', font=font(True, 32 * s), fill=(20, 20, 20), anchor='mm')
    th = dict(bar=(255, 255, 255), bartext=(32, 33, 36))
    status_bar(d, ph, th, clock, battery)
    d.rectangle([0, H - ph.NB, W, H], fill=(255, 255, 255))
    d.rounded_rectangle([W / 2 - 140 * s, H - ph.NB / 2 - 6 * s, W / 2 + 140 * s, H - ph.NB / 2 + 6 * s], radius=int(6 * s), fill=(60, 60, 60))
    # what scrolls: below the site's header, above the banner; screen row y shows page row y − V + doc_top
    return im, V + hdr, bottom, doc_top - V

def web_set(prefix, ph, tops, *, jpeg=None):
    page, hdr = web_page(ph)
    shots = []
    for i, t in enumerate(tops):
        im, top, bottom, off = web_shot(ph, page, hdr, t, i == 0, ['9:05', '9:05', '9:06', '9:06'][i % 4], [64, 64, 63, 63][i % 4])
        name = f'{prefix}-{i + 1}.{"jpg" if jpeg else "png"}'
        save(im, name, jpeg)
        shots.append({'file': name, 'offset': off, 'top': top, 'bottom': bottom, 'float': []})
    return {'width': ph.W, 'height': ph.H, 'page': page.height, 'shots': shots, 'order': [x['file'] for x in sorted(shots, key=lambda x: x['offset'])]}

# ------------------------------------------------------------------ the sets
for f in OUT.iterdir(): f.unlink()
truth = {}
P = Phone(720, 1600)
R = P.BOT - P.TOP  # rows that scroll
# 1. a chat scrolled down: five screenshots, overlaps from a sixth to a third of what scrolls; the first before any scroll
meta5 = [('10:31', 76, 'online', False, True, False), ('10:31', 76, 'online', True, True, True), ('10:32', 75, 'typing…', True, True, True),
         ('10:32', 75, 'online', True, True, True), ('10:33', 75, 'online', True, False, False)]
off5 = [0, int(R * 0.82), int(R * 1.5), int(R * 2.25), int(R * 3.1)]
truth['chat'] = chat_set('chat', P, 'light', off5, meta5)
# 2. dark theme, four screenshots
offd = [0, int(R * 0.9), int(R * 1.7), int(R * 2.5)]
metad = [('22:10', 41, 'online', False, True, False), ('22:10', 41, 'online', True, True, True), ('22:11', 40, 'typing…', True, True, True), ('22:11', 40, 'online', True, False, False)]
truth['chat-dark'] = chat_set('chatdark', P, 'dark', offd, metad, seed=5)
# 3. forwarded through a chat app: two thirds the size, JPEG at quality 75 (from a 1080 × 2400 phone: the shifts are no whole rows)
Pf = Phone(1080, 2400); Rf = Pf.BOT - Pf.TOP
truth['chat-sent'] = chat_set('chatsent', Pf, 'light', [0, int(Rf * 0.8), int(Rf * 1.55), int(Rf * 2.3)], metad[:1] + meta5[1:3] + meta5[4:5], scale=2 / 3, jpeg=75)
# 4. a news page in a phone's browser: the address bar in the first screenshot only; the site's header and a cookie banner stay
truth['web'] = web_set('web', P, [0, 1000, 2000, 10_000])
# 5. the same page saved as JPEG by the phone (quality 80)
truth['web-jpeg'] = web_set('webjpeg', P, [0, 1100, 2150], jpeg=80)
# 6. a small overlap (a twentieth of what scrolls) and a large one (nine tenths)
truth['small'] = chat_set('small', P, 'light', [0, int(R * 0.95)], meta5[:2])
truth['large'] = chat_set('large', P, 'light', [int(R * 0.5), int(R * 0.6)], meta5[1:3])
# 7. repeated messages: the same "Ok" again and again inside the part two screenshots share
REP = [('date', 'Today')] + [('in', 'Did everyone get the tickets?', '09:00'), ('out', 'Yes, all four of us. Seats together in coach C1.', '09:00')] + [('out', 'Ok', '09:01')] * 14 + \
      [('in', 'Ravi says the cab is at gate 2.', '09:05'), ('out', 'Coming down now, two minutes.', '09:05')] + [('in', 'Ok', '09:06')] * 6 + \
      [('out', 'Here. Grey Innova, number ends 4471.', '09:09'), ('in', 'Got it, see you.', '09:09')] + \
      [('in', 'Ok', '09:12')] * 12 + [('out', 'Reached the station, platform 3 is crowded.', '09:20'), ('in', 'Wait near the bookstall.', '09:21')]
truth['repeat'] = chat_set('repeat', P, 'light', [0, int(R * 0.6), int(R * 1.3)], meta5[:3], items=REP)
def copy(src, dst): (OUT / dst).write_bytes((OUT / src).read_bytes()); return dst
def shot_of(set_, file, to=None, **kw):
    """a screenshot of another set (copied to `to`) with its truth"""
    s0 = next(x for x in truth[set_]['shots'] if x['file'] == file)
    if to: copy(file, to)
    return {**s0, 'file': to or file, **kw}
# 8. a forwarded copy among full-size ones: the third of the chat's four first screenshots came through a chat app (480 px wide, JPEG 80)
im = Image.open(OUT / 'chat-3.png'); im.resize((480, round(1600 * 480 / 720)), Image.LANCZOS).convert('RGB').save(OUT / 'mix-3.jpg', quality=80)
mix = [shot_of('chat', 'chat-1.png', 'mix-1.png'), shot_of('chat', 'chat-2.png', 'mix-2.png'),
       {**shot_of('chat', 'chat-3.png'), 'file': 'mix-3.jpg', 'scaled': 480}, shot_of('chat', 'chat-4.png', 'mix-4.png')]
truth['mix'] = {'width': 720, 'height': 1600, 'page': truth['chat']['page'], 'shots': mix, 'order': [x['file'] for x in mix]}
# 9. names out of order, the same screenshot twice and a screenshot of something else
shuf = [shot_of('chat', 'chat-2.png', 'IMG_2041.png'), shot_of('chat', 'chat-1.png', 'IMG_2038.png'),
        shot_of('chat', 'chat-4.png', 'IMG_2044.png'), shot_of('chat', 'chat-3.png', 'IMG_2040.png')]
copy('chat-3.png', 'IMG_2042.png'); copy('web-2.png', 'IMG_2039.png')
truth['shuffled'] = {'width': 720, 'height': 1600, 'page': truth['chat']['page'], 'shots': shuf, 'order': [x['file'] for x in sorted(shuf, key=lambda x: x['offset'])],
                     'same': {'IMG_2042.png': 'IMG_2040.png'}, 'alone': ['IMG_2039.png']}

(OUT / 'truth.json').write_text(json.dumps(truth, indent=1, ensure_ascii=False) + '\n')
tot = sum(p.stat().st_size for p in OUT.iterdir())
print(f'{len(list(OUT.iterdir()))} files, {tot / 1e6:.2f} MB in {OUT.relative_to(ROOT)}')
