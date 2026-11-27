#!/usr/bin/env python3
"""Test PDFs of PDF Redact (tests/fixtures/redact/), with what is in them (truth.json):

    python3 scripts/make-redact-pdfs.py        (pip install reportlab pillow segno pypdf)

  statement.pdf  page 1: an Aadhaar number, its VID, a PAN, a GSTIN, phone numbers, an e-mail, a UPI ID, an account number
                 next to "A/c No.", an IFSC, a card number, a date of birth and a name — between lines set solid (10 on 10
                 points: their character boxes overlap, the lines must stay); a comment (FreeText) and a form field holding
                 numbers; the PAN in the document's title, the Aadhaar number in a bookmark; page 2 turned (/Rotate 90) with
                 an Aadhaar number and an e-mail; page 3 in DejaVu Sans embedded (Identity-H: digits are glyph numbers).
  scan.pdf       page 1: a picture of a printed page (no text layer) with an Aadhaar number, a PAN and a phone number, and a
                 QR code holding an Aadhaar number; page 2: the same picture with an invisible text layer (an OCR'd scan).
Every number is made up and passes its check (Verhoeff, Luhn, mod 36) so that the tab finds it.
"""
import io, json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image, ImageDraw, ImageFont
import segno
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject, DictionaryObject, ArrayObject, FloatObject, NumberObject

OUT = Path(__file__).resolve().parent.parent / 'tests/fixtures/redact'
OUT.mkdir(parents=True, exist_ok=True)
DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
W, H = A4

AADHAAR, VID, PAN, GSTIN = '2341 2341 2346', '2341 2341 2341 2341', 'AAAPL1234C', '27AAPFU0939F1ZV'
MOBILE, LANDLINE, EMAIL, UPI = '+91 98765 43210', '080-2233 4455', 'ravi.kumar@example.com', 'ravi@oksbi'
ACCOUNT, IFSC, CARD, DOB, NAME = '123456789012', 'SBIN0000691', '4111 1111 1111 1111', '12/08/1985', 'Ravi Kumar'
AADHAAR2, EMAIL2 = '9876 5432 1098', 'meera.iyer@example.org'   # page 2
AADHAAR3, PHONE3 = '4567 8912 3456', '+91 91234 56789'           # page 3 (embedded font)

def verhoeff_fix(d11):
    from stdnum import verhoeff
    return d11 + verhoeff.calc_check_digit(d11)

# make the page 2 / 3 / scan numbers valid Aadhaar numbers
AADHAAR2 = ' '.join([verhoeff_fix(AADHAAR2.replace(' ', '')[:11])[i:i + 4] for i in (0, 4, 8)])
AADHAAR3 = ' '.join([verhoeff_fix(AADHAAR3.replace(' ', '')[:11])[i:i + 4] for i in (0, 4, 8)])
SCAN_AADHAAR = ' '.join([verhoeff_fix('73648219056')[i:i + 4] for i in (0, 4, 8)])
QR_AADHAAR = verhoeff_fix('58204716393')
SCAN_PAN, SCAN_PHONE = 'BNZPM2501G', '+91 99887 76655'

LINES = [  # page 1, set solid: 10 pt type on 10 pt lines
    'Account statement for the quarter ending 30 September 2026, prepared for the account holder named below.',
    f'Name: {NAME}    Date of birth: {DOB}    Customer since 2011',
    f'Aadhaar No.: {AADHAAR}    VID {VID}',
    f'PAN {PAN}    GSTIN of the shop: {GSTIN}',
    f'Mobile {MOBILE}, landline {LANDLINE}; e-mail {EMAIL}',
    f'UPI {UPI}    A/c No. {ACCOUNT}    IFSC {IFSC}',
    f'Card {CARD} was used twice this quarter at merchants in Pune and Mumbai.',
    'These lines are set solid so that each line touches the next: the words around a number must stay.',
    'Closing balance carried forward to the next statement, with interest credited on the last working day.',
]

def statement():
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f'Statement of {NAME} — PAN {PAN}')
    c.setAuthor('SuperUtils test')
    c.setFont('Helvetica', 10)
    y = H - 72
    for line in LINES:
        c.drawString(56, y, line); y -= 10  # 10 on 10: set solid
    c.bookmarkPage('p1'); c.addOutlineEntry(f'Aadhaar {AADHAAR}', 'p1', level=0)
    c.showPage()
    # page 2 is turned 90 degrees: written on a portrait page, then /Rotate 90 is set with pypdf below
    c.setFont('Helvetica', 12)
    c.drawString(72, H - 100, f'Second page, turned: Aadhaar {AADHAAR2} and e-mail {EMAIL2}.')
    c.drawString(72, H - 120, 'The text around the numbers stays where it is.')
    c.showPage()
    pdfmetrics.registerFont(TTFont('DejaVu', DEJAVU))
    c.setFont('DejaVu', 12)
    c.drawString(72, H - 100, f'Embedded font page: Aadhaar {AADHAAR3}, phone {PHONE3}.')
    c.drawString(72, H - 120, 'Digits here are glyph numbers in the content stream, not ASCII.')
    c.showPage()
    c.save()
    r = PdfReader(io.BytesIO(buf.getvalue())); w = PdfWriter(clone_from=r)
    w.pages[1].rotate(90)
    # a comment (FreeText) with a phone number, and a text field holding the PAN
    p0 = w.pages[0]
    ft = DictionaryObject({NameObject('/Type'): NameObject('/Annot'), NameObject('/Subtype'): NameObject('/FreeText'),
        NameObject('/Rect'): ArrayObject([FloatObject(56), FloatObject(500), FloatObject(400), FloatObject(520)]),
        NameObject('/Contents'): TextStringObject(f'Call him on {MOBILE}'), NameObject('/DA'): TextStringObject('/Helv 10 Tf 0 g')})
    p0[NameObject('/Annots')] = ArrayObject([w._add_object(ft)])
    w.add_metadata({'/Subject': f'Aadhaar {AADHAAR}'})
    bio = io.BytesIO(); w.write(bio)
    data = bio.getvalue()
    # the form field: drawn by MuPDF in the e2e suite's fixture step would need MuPDF here; a widget made by pypdf instead
    r = PdfReader(io.BytesIO(data)); w = PdfWriter(clone_from=r)
    from pypdf.generic import RectangleObject
    field = DictionaryObject({NameObject('/Type'): NameObject('/Annot'), NameObject('/Subtype'): NameObject('/Widget'), NameObject('/FT'): NameObject('/Tx'),
        NameObject('/T'): TextStringObject('pan'), NameObject('/V'): TextStringObject(PAN), NameObject('/DA'): TextStringObject('/Helv 10 Tf 0 g'),
        NameObject('/Rect'): RectangleObject([300, 440, 450, 460]), NameObject('/F'): NumberObject(4)})
    ref = w._add_object(field)
    w.pages[0][NameObject('/Annots')].append(ref)
    w._root_object[NameObject('/AcroForm')] = DictionaryObject({NameObject('/Fields'): ArrayObject([ref]), NameObject('/NeedAppearances'): NameObject('/true') if False else TextStringObject('true')})
    w._root_object['/AcroForm'][NameObject('/NeedAppearances')] = __import__('pypdf').generic.BooleanObject(True)
    bio = io.BytesIO(); w.write(bio)
    (OUT / 'statement.pdf').write_bytes(bio.getvalue())

def page_picture():
    """A printed page as a scanner sees it: 150 dpi, grey paper, black text."""
    s = 150 / 72
    img = Image.new('L', (int(W * s), int(H * s)), 246)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(DEJAVU, int(12 * s))
    lines = ['Scanned letter', f'Aadhaar {SCAN_AADHAAR}', f'PAN {SCAN_PAN}   Phone {SCAN_PHONE}', 'The rest of the letter is ordinary text.']
    y = int(80 * s)
    for t in lines: d.text((int(72 * s), y), t, fill=20, font=f); y += int(24 * s)
    qr = segno.make(f'<uid>{QR_AADHAAR}</uid>', error='m')
    qb = io.BytesIO(); qr.save(qb, kind='png', scale=6, border=2); q = Image.open(qb).convert('L')
    img.paste(q, (int(400 * s), int(80 * s)))
    return img, s, lines

def scan():
    img, s, lines = page_picture()
    jb = io.BytesIO(); img.save(jb, format='JPEG', quality=90)
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4)
    from reportlab.lib.utils import ImageReader
    c.drawImage(ImageReader(io.BytesIO(jb.getvalue())), 0, 0, W, H); c.showPage()
    # page 2: the same picture, with an invisible text layer where the text stands (render mode 3)
    c.drawImage(ImageReader(io.BytesIO(jb.getvalue())), 0, 0, W, H)
    t = c.beginText(); t.setTextRenderMode(3); t.setFont('Helvetica', 12)
    y = H - 80 - 12
    for line in lines: t.setTextOrigin(72, y); t.textOut(line); y -= 24
    c.drawText(t); c.showPage(); c.save()
    (OUT / 'scan.pdf').write_bytes(buf.getvalue())

statement(); scan()
truth = {
    'statement.pdf': {'1': {'aadhaar': [AADHAAR], 'vid': [VID], 'pan': [PAN], 'gstin': [GSTIN], 'phone': [MOBILE, LANDLINE], 'email': [EMAIL], 'upi': [UPI],
                            'account': [ACCOUNT], 'ifsc': [IFSC], 'card': [CARD], 'dob': [DOB], 'words': [NAME]},
                      '2': {'aadhaar': [AADHAAR2], 'email': [EMAIL2]}, '3': {'aadhaar': [AADHAAR3], 'phone': [PHONE3]},
                      'comment': MOBILE, 'field': PAN, 'title': PAN, 'subject': AADHAAR, 'bookmark': AADHAAR,
                      'keep': ['quarter ending 30 September', 'Customer since 2011', 'merchants in Pune and Mumbai', 'each line touches the next', 'Closing balance carried forward', 'The text around the numbers stays', 'Digits here are glyph numbers']},
    'scan.pdf': {'1': {'aadhaar': [SCAN_AADHAAR], 'pan': [SCAN_PAN], 'phone': [SCAN_PHONE], 'qr': [QR_AADHAAR]}, '2': {'aadhaar': [SCAN_AADHAAR], 'pan': [SCAN_PAN], 'phone': [SCAN_PHONE], 'qr': [QR_AADHAAR]},
                 'keep': ['Scanned letter', 'ordinary text']},
}
(OUT / 'truth.json').write_text(json.dumps(truth, indent=1) + '\n')
for p in sorted(OUT.iterdir()): print(p.name, p.stat().st_size)
