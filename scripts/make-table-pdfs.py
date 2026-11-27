#!/usr/bin/env python3
# Test PDFs for PDF Tables → Excel (tests/unit/pdftables.test.mjs, tests/e2e/pdf-tables.e2e.mjs): bank statements and a bill of
# our own (names, numbers and accounts made up; Noto Sans — OFL), with every table's rows as printed in truth.json.
#   statement.pdf      — two pages, no ruled lines: an account block above, the table's header on every page, narrations that
#                        wrap over two or three lines, amounts right-aligned, "Page n of N" below, the totals after the table
#   statement-ruled.pdf — the same transactions in a ruled grid (every cell boxed), the header shaded
#   bill.pdf           — an electricity bill: two small tables (the charges, ruled only between rows; the last six months'
#                        use, no rules) among paragraphs of text
#   statement-scan.pdf — the first page of statement.pdf as a picture (200 dpi), for the OCR
# Needs: pip install reportlab pypdf; pdftoppm (poppler-utils).   python3 scripts/make-table-pdfs.py
import json, random, subprocess, tempfile
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/fixtures/tables'
OUT.mkdir(parents=True, exist_ok=True)
FONTS = ROOT / 'node_modules/@expo-google-fonts/noto-sans'
pdfmetrics.registerFont(TTFont('Noto', str(FONTS / '400Regular/NotoSans_400Regular.ttf')))
pdfmetrics.registerFont(TTFont('NotoB', str(FONTS / '700Bold/NotoSans_700Bold.ttf')))
W, H = A4
rnd = random.Random(20261127)

def inr(v):
    """1,25,000.00 — Indian grouping"""
    s = f'{v:.2f}'; whole, frac = s.split('.')
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2: parts.insert(0, head[-2:]); head = head[:-2]
        if head: parts.insert(0, head)
        whole = ','.join(parts + [tail])
    return f'{whole}.{frac}'

# ---- the transactions
NARR = [
    'UPI/CR/432198765432/RAVI KUMAR/HDFC/ravi@okhdfcbank/Payment for groceries',
    'NEFT/N123456789012/KAVERI FOODS PVT LTD/SALARY NOVEMBER',
    'ATM WDL/SBI ATM NASHIK ROAD/CARD 4321',
    'POS/AMAZON PAY INDIA/BANGALORE',
    'IMPS/P2A/612345678901/PRIYA SHARMA/Rent for November 2026, flat 12B',
    'ACH/D/HDFC LIFE INSURANCE/POLICY 998877665',
    'UPI/DR/512398761234/ZOMATO ORDER/YES BANK',
    'INTEREST CREDIT',
    'BIL/ONL/000123456/MAHAVITARAN ELECTRICITY/CONSUMER 170012345678',
    'CHQ DEP/CLEARING/CHEQUE 004521/NARMADA PACKAGING LLP',
    'UPI/DR/519988776655/IRCTC/TICKET PNR 4567891230',
    'SI/RD INSTALMENT/ACCOUNT 30012345',
]
rows, bal = [], 48250.75
day = 1
for i in range(46):
    day += rnd.choice([0, 1, 1, 2])
    d = f'{min(day, 30):02d}/11/2026'
    narr = rnd.choice(NARR)
    ref = rnd.choice(['', f'{rnd.randrange(10**11, 10**12)}', f'00{rnd.randrange(1000, 9999)}'])
    if rnd.random() < 0.45:
        amt = round(rnd.choice([250, 1200, 3499.5, 15000, 899, 64.75, 125000]) * rnd.choice([1, 1, 2]), 2)
        if amt > bal: amt = round(bal / 3, 2)
        bal -= amt; wd, dp = inr(amt), ''
    else:
        amt = round(rnd.choice([500, 2500, 15000, 85000.0, 1234.56, 47.1]), 2)
        bal += amt; wd, dp = '', inr(amt)
    rows.append([d, narr, ref, d, wd, dp, inr(bal)])
HEAD = ['Date', 'Narration', 'Chq./Ref. No.', 'Value Date', 'Withdrawal', 'Deposit', 'Closing Balance']

def wrap(text, font, size, width):
    out, cur = [], ''
    for word in text.replace('/', '/ ').split(' '):
        w = word if not cur else (cur + ('' if cur.endswith('/') else ' ') + word)
        if pdfmetrics.stringWidth(w, font, size) <= width or not cur: cur = w
        else: out.append(cur); cur = word
    if cur: out.append(cur)
    # a piece longer than the column on its own (a long reference) is cut where it fits
    res = []
    for line in out:
        while pdfmetrics.stringWidth(line, font, size) > width:
            k = len(line)
            while k > 1 and pdfmetrics.stringWidth(line[:k], font, size) > width: k -= 1
            res.append(line[:k]); line = line[k:]
        res.append(line)
    return res

COLS = [(40, 62, 'l'), (106, 150, 'l'), (262, 78, 'l'), (346, 58, 'l'), (408, 58, 'r'), (470, 58, 'r'), (532, 60, 'r')]  # x, width, align

def statement(path, ruled):
    cv = canvas.Canvas(str(path), pagesize=A4)
    size, lead = 7.2, 9.4
    # layout first, to know the page count
    pages, cur, y = [], [], None
    top = H - 190
    for r in rows:
        lines = wrap(r[1], 'Noto', size, COLS[1][1] - 4)
        hgt = lead * len(lines) + (6 if ruled else 3)
        if y is None or y - hgt < 90:
            if cur: pages.append(cur)
            cur, y = [], (top if not pages else H - 110) - 22
        cur.append((r, lines, y, hgt)); y -= hgt
    pages.append(cur)
    for pn, pg in enumerate(pages, 1):
        if pn == 1:
            cv.setFont('NotoB', 13); cv.drawString(40, H - 60, 'Narmada Co-operative Bank Ltd.')
            cv.setFont('Noto', 8.5)
            for k, t in enumerate(['Statement of account for the period 01/11/2026 to 30/11/2026', 'Account holder: Ms Asha Deshpande, 14 Gangapur Road, Nashik 422013',
                                   'Account number: 30019876543210        IFSC: NARM0000123        Branch: Nashik Main', 'Opening balance: 48,250.75 Cr']):
                cv.drawString(40, H - 82 - 13 * k, t)
            hy = top
        else:
            cv.setFont('Noto', 8); cv.drawString(40, H - 60, 'Narmada Co-operative Bank Ltd. — account 30019876543210 (continued)')
            hy = H - 110
        # the header
        if ruled:
            cv.setFillGray(0.88); cv.rect(COLS[0][0] - 2, hy - 6, COLS[-1][0] + COLS[-1][1] - COLS[0][0] + 4, 18, stroke=0, fill=1); cv.setFillGray(0)
        cv.setFont('NotoB', size)
        for (x, w, al), t in zip(COLS, HEAD):
            if al == 'r': cv.drawRightString(x + w - 2, hy, t)
            else: cv.drawString(x, hy, t)
        if not ruled: cv.setLineWidth(0.6); cv.line(COLS[0][0], hy - 5, COLS[-1][0] + COLS[-1][1], hy - 5)
        cv.setFont('Noto', size)
        gridy = [hy + 12, hy - 6]
        for r, lines, y, hgt in pg:
            for (x, w, al), t, k in zip(COLS, r, range(7)):
                if k == 1:
                    for j, ln in enumerate(lines): cv.drawString(x, y - j * lead, ln)
                elif al == 'r': cv.drawRightString(x + w - 2, y, t)
                else: cv.drawString(x, y, t)
            gridy.append(y - hgt + lead - 2)
        if ruled:
            cv.setLineWidth(0.5)
            x0, x1 = COLS[0][0] - 2, COLS[-1][0] + COLS[-1][1] + 2
            for gy in gridy: cv.line(x0, gy, x1, gy)
            for x, w, al in COLS: cv.line(x - 2, gridy[0], x - 2, gridy[-1])
            cv.line(x1, gridy[0], x1, gridy[-1])
        if pn == len(pages):
            ty = gridy[-1] - 26
            cv.setFont('NotoB', 8.5); cv.drawString(40, ty, 'Total withdrawals and deposits are shown on the next statement summary.')
            cv.setFont('Noto', 8); cv.drawString(40, ty - 13, 'This is a computer generated statement and needs no signature.')
        cv.setFont('Noto', 7.5); cv.drawRightString(W - 40, 40, f'Page {pn} of {len(pages)}')
        cv.showPage()
    cv.save()
    return len(pages)

n1 = statement(OUT / 'statement.pdf', False)
n2 = statement(OUT / 'statement-ruled.pdf', True)

# ---- the bill: two small tables among paragraphs
CHARGES = [['Fixed charge', '', '', '128.00'], ['Energy charge', '186 units', '7.21', '1,341.06'], ['Wheeling charge', '186 units', '1.17', '217.62'],
           ['Fuel adjustment', '186 units', '0.35', '65.10'], ['Electricity duty', '16 %', '', '280.93'], ['Total', '', '', '2,032.71']]
USE = [['Jun 2026', '214', '2,318.40'], ['Jul 2026', '238', '2,597.10'], ['Aug 2026', '201', '2,190.55'], ['Sep 2026', '176', '1,921.00'], ['Oct 2026', '169', '1,850.25'], ['Nov 2026', '186', '2,032.71']]
cv = canvas.Canvas(str(OUT / 'bill.pdf'), pagesize=A4)
cv.setFont('NotoB', 14); cv.drawString(50, H - 60, 'Godavari Power Distribution Co. Ltd.')
cv.setFont('Noto', 9)
para = ['Consumer number 170012345678 · Ms Asha Deshpande, 14 Gangapur Road, Nashik 422013.',
        'Bill for November 2026. Please pay by 15 December 2026 to avoid a late payment charge of 1.25 % a month.',
        'Your meter was read on 28 November 2026; the reading was 12,486 units.']
for k, t in enumerate(para): cv.drawString(50, H - 90 - 14 * k, t)
cv.setFont('NotoB', 10); cv.drawString(50, H - 150, 'Charges for this month')
cx = [(50, 'l'), (250, 'r'), (350, 'r'), (470, 'r')]
cv.setFont('NotoB', 8.5)
for (x, al), t in zip(cx, ['Charge', 'Quantity', 'Rate (Rs.)', 'Amount (Rs.)']):
    (cv.drawRightString if al == 'r' else cv.drawString)(x, H - 172, t)
cv.setLineWidth(0.5)
y = H - 172
for r in CHARGES:
    cv.line(48, y - 5, 474, y - 5); y -= 16
    cv.setFont('NotoB' if r[0] == 'Total' else 'Noto', 8.5)
    for (x, al), t in zip(cx, r): (cv.drawRightString if al == 'r' else cv.drawString)(x, y, t)
cv.setFont('Noto', 9)
for k, t in enumerate(['Electricity duty is charged at 16 % of the energy charge. Units are kilowatt-hours.',
                       'If you pay online within seven days you get a prompt payment discount of 1 %.']):
    cv.drawString(50, y - 30 - 14 * k, t)
uy = y - 90
cv.setFont('NotoB', 10); cv.drawString(50, uy, 'Your use over the last six months')
ux = [(50, 'l'), (200, 'r'), (320, 'r')]
cv.setFont('NotoB', 8.5)
for (x, al), t in zip(ux, ['Month', 'Units', 'Bill (Rs.)']): (cv.drawRightString if al == 'r' else cv.drawString)(x, uy - 22, t)
cv.setFont('Noto', 8.5)
for k, r in enumerate(USE):
    for (x, al), t in zip(ux, r): (cv.drawRightString if al == 'r' else cv.drawString)(x, uy - 38 - 13 * k, t)
cv.setFont('Noto', 9); cv.drawString(50, uy - 140, 'Thank you for paying on time. Save energy: switch off what you do not use.')
cv.showPage(); cv.save()

# ---- the statement's first page scanned
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(['pdftoppm', '-r', '200', '-gray', '-jpeg', '-jpegopt', 'quality=82', '-f', '1', '-l', '1', str(OUT / 'statement.pdf'), f'{tmp}/p'], check=True)
    cv = canvas.Canvas(str(OUT / 'statement-scan.pdf'), pagesize=A4)
    for f in sorted(Path(tmp).glob('p-*.jpg')): cv.drawImage(str(f), 0, 0, W, H); cv.showPage()
    cv.save()

truth = {'statement': {'pages': n1, 'head': HEAD, 'rows': rows}, 'statement-ruled': {'pages': n2, 'head': HEAD, 'rows': rows},
         'bill': {'tables': [{'head': ['Charge', 'Quantity', 'Rate (Rs.)', 'Amount (Rs.)'], 'rows': CHARGES}, {'head': ['Month', 'Units', 'Bill (Rs.)'], 'rows': USE}]}}
(OUT / 'truth.json').write_text(json.dumps(truth, indent=1, ensure_ascii=False) + '\n')
print('pages', n1, n2, sorted(p.name for p in OUT.iterdir()))
