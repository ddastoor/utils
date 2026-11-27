#!/usr/bin/env python3
# Test PDFs for PDF Compare (tests/unit/pdfcompare.test.mjs, tests/e2e/pdf-compare.e2e.mjs): two versions of one supply
# agreement (our own text, Noto Sans — OFL). The second is set in another size and width, so its lines and pages break
# elsewhere; its running head and page count differ; it uses straight quotes where the first has curly ones; the first
# breaks some long words over two lines with a hyphen. Ten edits are made to it — truth.json lists each (what was there,
# what is there now) — and nothing else may show as a change. Beside them: the second version scanned (pictures only, for
# the OCR), turned (every page /Rotate 90) and the first locked with a password.
# Needs: pip install reportlab pypdf pillow; pdftoppm (poppler-utils).   python3 scripts/make-compare-pdfs.py
import io, json, subprocess, tempfile
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/fixtures/compare'
OUT.mkdir(parents=True, exist_ok=True)
FONTS = ROOT / 'node_modules/@expo-google-fonts/noto-sans'
pdfmetrics.registerFont(TTFont('Noto', str(FONTS / '400Regular/NotoSans_400Regular.ttf')))
pdfmetrics.registerFont(TTFont('NotoB', str(FONTS / '700Bold/NotoSans_700Bold.ttf')))
W, H = A4

PREAMBLE = 'This Supply Agreement (the “Agreement”) is made on 1 April 2026 between Kaveri Foods Private Limited (the “Buyer”) and Narmada Packaging LLP (the “Supplier”).'
CLAUSES = [
    ('Definitions', 'In this Agreement, “Goods” means the packaging described in Schedule 1, and “Delivery Date” means the date agreed in each purchase order. Words in the singular include the plural, and headings do not affect the interpretation of this Agreement.'),
    ('Supply', 'The Supplier shall supply the Goods to the Buyer in accordance with each purchase order. The Supplier shall recieve purchase orders by e-mail and confirm them within two working days, stating the quantity and the Delivery Date.'),
    ('Price and Payment', 'The Buyer shall pay each invoice within thirty (30) days of its receipt. The prices are set out in Schedule 1 and include packing, but not transport, which the Buyer arranges and pays for separately.'),
    ('Delivery', 'The Supplier shall deliver the Goods to the Buyer’s warehouse at Nashik between 9 am and 6 pm, including weekends and public holidays. Risk in the Goods passes to the Buyer on delivery, and title passes on payment.'),
    ('Quality', 'The Goods shall conform to the specification and be free from defects in material and workmanship. The Buyer may inspect the Goods within seven days of delivery and reject any that do not conform.'),
    ('Indemnity', 'The Supplier shall indemnify the Buyer against all losses, damages and expenses arising from defective Goods, notwithstanding any inspection or acceptance of the Goods by the Buyer.'),
    ('Termination', 'Either party may terminate this Agreement by giving ninety days’ written notice to the other. The agreement ends at once if either party becomes insolvent or commits a material breach that it does not remedy.'),
    ('Notices', 'Notices under this Agreement shall be in writing and sent to the addresses above by registered post or e-mail. A notice sent by e-mail is treated as received on the next working day after it is sent.'),
    ('Confidentiality', 'Each party shall keep confidential the terms of this Agreement and all information it receives from the other, and shall disclose it only to its employees, advisers and auditors who need to know it.'),
    ('Governing Law', 'This Agreement is governed by the laws of India, and the courts at Mumbai have exclusive jurisdiction over any dispute arising out of or in connection with it.'),
]
SCHEDULE = ['Corrugated boxes, 5 ply: Rs. 1,25,000 per lot of 10,000 boxes', 'Printed labels: Rs. 18,500 per lot of 50,000 labels', 'Shrink film, 25 microns: Rs. 42,000 per tonne']

def edited():
    pre = PREAMBLE.replace('1 April 2026', '1 May 2026')
    cl = [list(c) for c in CLAUSES]
    d = {c[0]: c for c in cl}
    d['Supply'][1] = d['Supply'][1].replace('recieve', 'receive')
    d['Price and Payment'][1] = d['Price and Payment'][1].replace('thirty (30)', 'sixty (60)')
    d['Delivery'][1] = d['Delivery'][1].replace(', including weekends and public holidays', '')
    d['Quality'][1] += ' The Supplier shall keep all records of production for seven years.'
    d['Termination'][0] = 'Termination and Suspension'
    d['Termination'][1] = d['Termination'][1].replace('The agreement ends', 'The Agreement ends')
    d['Confidentiality'][1] = d['Confidentiality'][1].replace('advisers and auditors', 'advisers, and auditors')
    notices = cl.pop([h for h, _ in cl].index('Notices'))
    cl.insert([h for h, _ in cl].index('Governing Law') + 1, notices)
    sched = [s.replace('1,25,000', '1,50,000') for s in SCHEDULE]
    return pre, [tuple(c) for c in cl], sched

TRUTH = [
    {'kind': 'changed', 'was': 'April', 'now': 'May'},
    {'kind': 'changed', 'was': 'recieve', 'now': 'receive'},
    {'kind': 'changed', 'was': 'thirty (30', 'now': 'sixty (60'},
    {'kind': 'removed', 'was': ', including weekends and public holidays', 'now': ''},
    {'kind': 'added', 'was': '', 'now': 'The Supplier shall keep all records of production for seven years.'},
    {'kind': 'added', 'was': '', 'now': 'and Suspension'},
    {'kind': 'changed', 'was': 'agreement', 'now': 'Agreement', 'case': True},
    {'kind': 'moved', 'was': 'Notices Notices under this Agreement shall be in writing and sent to the addresses above by registered post or e-mail. A notice sent by e-mail is treated as received on the next working day after it is sent.', 'now': 'Notices Notices under this Agreement shall be in writing and sent to the addresses above by registered post or e-mail. A notice sent by e-mail is treated as received on the next working day after it is sent.'},
    {'kind': 'added', 'was': '', 'now': ','},
    {'kind': 'changed', 'was': '1,25,000', 'now': '1,50,000'},
]

def plain(s):
    return s.replace('“', '"').replace('”', '"').replace('’', "'")

def layout(blocks, size, width, hyphens):
    """blocks: (font, text, space after) → lines (font, text, x, gap before) with words broken as allowed"""
    lines, broke = [], []
    for font, text, after in blocks:
        cur = ''
        words = text.split(' ')
        i = 0
        while i < len(words):
            w = words[i]
            trial = (cur + ' ' + w) if cur else w
            if pdfmetrics.stringWidth(trial, font, size) <= width:
                cur = trial; i += 1; continue
            core = w.rstrip('.,;:)')
            # a long word (7 letters and more) is broken at the latest place that fits, three letters on each side at least
            if hyphens and cur and len(core) >= 7 and core.isalpha():
                k = next((k for k in range(len(core) - 3, 2, -1) if pdfmetrics.stringWidth(cur + ' ' + core[:k] + '-', font, size) <= width), 0)
                if k:
                    lines.append((font, cur + ' ' + core[:k] + '-', 0)); broke.append(core)
                    words[i] = w[k:]; cur = ''; continue
            lines.append((font, cur, 0)); cur = ''
        if cur: lines.append((font, cur, after))
        else: lines[-1] = (lines[-1][0], lines[-1][1], after)
    return lines, broke

def draw(path, pre, clauses, sched, size, margin, head, hyphens, curly, leading):
    q = (lambda s: s) if curly else plain
    blocks = [('NotoB', 'Supply Agreement', 10), ('Noto', q(pre), 8)]
    for hd, tx in clauses:
        blocks += [('NotoB', hd, 2), ('Noto', q(tx), 8)]
    blocks += [('NotoB', 'Schedule 1 — Prices', 2)] + [('Noto', s, 2) for s in sched]
    blocks += [('Noto', 'Signed for the Buyer ____________    Signed for the Supplier ____________', 0)]
    lines, broke = layout(blocks, size, W - 2 * margin, hyphens)
    lead = size * leading
    pages, cur, y = [], [], H - margin - 20
    for ln in lines:
        if y - lead < margin + 30: pages.append(cur); cur, y = [], H - margin - 20
        cur.append((ln, y)); y -= lead + ln[2]
    pages.append(cur)
    cv = canvas.Canvas(str(path), pagesize=A4)
    for n, pg in enumerate(pages, 1):
        cv.setFont('Noto', 8); cv.drawString(margin, H - 36, head)
        cv.drawRightString(W - margin, 30, f'Page {n} of {len(pages)}')
        for (font, text, _), y in pg:
            cv.setFont(font, size); cv.drawString(margin, y, text)
        cv.showPage()
    cv.setTitle('Supply Agreement'); cv.save()
    return len(pages), broke

n1, broke = draw(OUT / 'v1.pdf', PREAMBLE, CLAUSES, SCHEDULE, 13.5, 72, 'DRAFT — Supply Agreement — version 1', True, True, 1.9)
assert broke, 'the first version must break a word over two lines'
pre2, cl2, sch2 = edited()
n2, _ = draw(OUT / 'v2.pdf', pre2, cl2, sch2, 10, 90, 'FINAL — Supply Agreement — version 2', False, False, 1.4)

# the second version scanned: its pages as pictures (200 dpi, grey JPEG), no text
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(['pdftoppm', '-r', '200', '-gray', '-jpeg', '-jpegopt', 'quality=80', str(OUT / 'v2.pdf'), f'{tmp}/p'], check=True)
    cv = canvas.Canvas(str(OUT / 'v2-scan.pdf'), pagesize=A4)
    for f in sorted(Path(tmp).glob('p-*.jpg')):
        cv.drawImage(str(f), 0, 0, W, H); cv.showPage()
    cv.save()
# the second version turned: every page shown a quarter turn to the right
r = PdfReader(str(OUT / 'v2.pdf')); w = PdfWriter()
for p in r.pages:
    p[NameObject('/Rotate')] = NumberObject(90); w.add_page(p)
with open(OUT / 'v2-turned.pdf', 'wb') as fh: w.write(fh)
# the first version locked (password compare1)
r = PdfReader(str(OUT / 'v1.pdf')); w = PdfWriter()
for p in r.pages: w.add_page(p)
w.encrypt(user_password='compare1', owner_password='compare1-owner', algorithm='AES-256')
with open(OUT / 'v1-locked.pdf', 'wb') as fh: w.write(fh)

(OUT / 'truth.json').write_text(json.dumps({'pages': [n1, n2], 'hyphenated': broke, 'edits': TRUTH}, indent=1, ensure_ascii=False) + '\n')
print('pages', n1, n2, 'hyphenated', broke, sorted(p.name for p in OUT.iterdir()))
