#!/usr/bin/env python3
"""Test books for PDF / EPUB → Audiobook (tests/unit/audiobook.test.mjs, tests/e2e/audiobook.e2e.mjs), written here from
original text, with what a listener should hear in tests/fixtures/audiobook/index.json: every track's title and its words
in order — and what must not be heard (running heads, page numbers, a figure's labels, footnote marks).

  python3 scripts/make-audiobook-books.py           (needs reportlab: pip install reportlab)

- book.pdf       a 6 × 9 in book of 14 pages in PDF's standard fonts (reportlab): a title page, a contents page, two parts
                 of chapters with nested bookmarks — Chapter 2 starts in the middle of a page (an XYZ destination) —,
                 running heads (the book's title on left pages, the chapter's on right pages) and page numbers, words
                 broken over lines with a hyphen, a footnote (a raised 1 and the note under a rule at the page's foot), a
                 drawn figure with axis labels, Chapter 3 set in two columns, a scene break, and an index
- gutenberg.epub an EPUB 3 laid out as Project Gutenberg's are: the whole book in one XHTML file, its contents pointing at
                 #ids inside it; footnote marks of three kinds (epub:type noteref, a raised link, a bracketed [2]) with the
                 notes in <aside epub:type="footnote">, a drop cap, scene breaks, a web address, and paragraphs set without
                 space between them (text-indent only)
- noheads.txt    a plain text of about 9,000 words without a heading: made into parts by length
"""
import json, os, random, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'audiobook')
os.makedirs(OUT, exist_ok=True)
WHEN = (2026, 11, 27, 0, 0, 0)

# ---------------------------------------------------------------------------------------------------- the prose
rnd = random.Random(14)
NOUNS = ['keeper', 'lantern', 'harbour', 'ledger', 'gull', 'trawler', 'tide', 'shingle', 'bell', 'cottage', 'stove', 'compass',
         'anchor', 'lamp', 'oar', 'net', 'barometer', 'kettle', 'window', 'ferry', 'reef', 'channel', 'beacon', 'pier']
ADJS = ['grey', 'patient', 'salt-stained', 'quiet', 'restless', 'brass', 'narrow', 'distant', 'stubborn', 'faded', 'cold', 'bright']
VERBS = ['watched', 'measured', 'remembered', 'carried', 'counted', 'mended', 'followed', 'polished', 'answered', 'crossed']
PLACES = ['before the dawn', 'under the gallery', 'beyond the breakwater', 'along the landing stage', 'in the long evening',
          'below the lamp room', 'across the bay', 'after the storm', 'by the oil store', 'at the turn of the tide']

def sentence():
    return f"The {rnd.choice(ADJS)} {rnd.choice(NOUNS)} {rnd.choice(VERBS)} the {rnd.choice(NOUNS)} {rnd.choice(PLACES)}."

def paragraph(n):
    return ' '.join(sentence() for _ in range(n))

def words(text):
    """The words a listener hears, as the tests compare them: lower case, letters and digits."""
    import re
    return re.findall(r"[a-z0-9]+", text.lower().replace('’', "'").replace("'", ''))

# ---------------------------------------------------------------------------------------------------- book.pdf
def make_pdf():
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase.pdfmetrics import stringWidth
    W, H = 432, 648
    path = os.path.join(OUT, 'book.pdf')
    c = canvas.Canvas(path, pagesize=(W, H), invariant=1)
    c.setTitle('The Book of Tides'); c.setAuthor('Mara Lindqvist'); c.setSubject('A test book for SuperUtils')
    BODY, LEAD, LEFT, RIGHT, TOP, BOTTOM = 11, 15, 54, W - 54, H - 72, 72
    state = {'page': 1, 'head': '', 'y': TOP, 'pagehead': '', 'opening': False}
    truth = {'title': 'The Book of Tides', 'author': 'Mara Lindqvist', 'tracks': [], 'never': []}
    cur = None

    def folio():
        # a book's habit: the book's title on left (even) pages, the chapter the page begins in on right pages; no head on
        # a page that opens a chapter or a part; the page number at the foot
        n = state['page']
        if n > 2:
            c.setFont('Times-Roman', 9)
            if not state['opening']:
                head = 'THE BOOK OF TIDES' if n % 2 == 0 else state['pagehead'].upper()
                c.drawCentredString(W / 2, H - 40, head)
                truth['never'].append(head)
            c.drawCentredString(W / 2, 40, str(n))

    def new_page():
        folio(); c.showPage(); state['page'] += 1; state['y'] = TOP; state['pagehead'] = state['head']; state['opening'] = False

    def need(h):
        if state['y'] - h < BOTTOM: new_page()

    def lines_of(text, width, font='Times-Roman', size=BODY, first_indent=0):
        out, line, ind = [], '', first_indent
        for w in text.split(' '):
            trial = (line + ' ' + w).strip()
            if stringWidth(trial, font, size) <= width - ind:
                line = trial; continue
            # a long word that does not fit is broken with a hyphen (half of it on this line, when that half fits)
            if len(w) >= 8 and '-' not in w:
                k = len(w) // 2
                head = (line + ' ' + w[:k] + '-').strip()
                if stringWidth(head, font, size) <= width - ind:
                    out.append((head, ind)); line = w[k:]; ind = 0; continue
            out.append((line, ind)); line = w; ind = 0
        if line: out.append((line, ind))
        return out

    def para(text, x0=LEFT, x1=RIGHT, size=BODY):
        for ln, ind in lines_of(text, x1 - x0, size=size, first_indent=14):
            need(LEAD)
            c.setFont('Times-Roman', size); c.drawString(x0 + ind, state['y'] - size, ln)
            state['y'] -= LEAD
        state['y'] -= 4
        cur['words'] += words(text)

    def heading(text, size=18, gap=36):
        need(gap + size + 24)
        state['y'] -= gap
        c.setFont('Times-Bold', size); c.drawString(LEFT, state['y'] - size, text)
        state['y'] -= size + 18
        cur['words'] += words(text)

    def track(title, page_break=True, level=0, key=None):
        nonlocal cur
        if page_break and state['y'] < TOP: new_page()
        if state['y'] >= TOP: state['opening'] = True
        cur = {'title': title, 'words': []}
        truth['tracks'].append(cur)
        key = key or f"k{len(truth['tracks'])}"
        c.bookmarkPage(key, fit='XYZ', left=0, top=state['y'] + 6, zoom=0)
        c.addOutlineEntry(title, key, level=level)
        state['head'] = title
        return cur

    # title page and contents (no running heads on pages 1 and 2)
    cur = {'title': 'The Book of Tides', 'words': []}
    truth['front'] = cur
    c.setFont('Times-Bold', 26); c.drawCentredString(W / 2, H - 220, 'The Book of Tides')
    c.setFont('Times-Italic', 14); c.drawCentredString(W / 2, H - 260, 'Mara Lindqvist')
    cur['words'] += words('The Book of Tides Mara Lindqvist')
    new_page()
    cur = {'title': 'Contents', 'words': []}
    truth['contents'] = cur
    c.setFont('Times-Bold', 16); c.drawString(LEFT, TOP - 16, 'Contents')
    for i, t in enumerate(['Part One: The Rock', 'Chapter 1. The Keeper', 'Chapter 2. Fog', 'Part Two: The Ledger', 'Chapter 3. Inventory', 'Chapter 4. Zephyrine', 'Index']):
        c.setFont('Times-Roman', 11); c.drawString(LEFT + (14 if t.startswith('Chapter') else 0), TOP - 50 - i * 18, t)
    new_page()

    # Part One (a page of its own), Chapter 1 (a footnote), Chapter 2 (starts mid-page; a figure)
    track('Part One: The Rock', page_break=False, level=0, key='p1')
    c.setFont('Times-Bold', 22); c.drawCentredString(W / 2, H / 2, 'Part One: The Rock'); cur['words'] += words('Part One: The Rock')
    state['y'] = BOTTOM
    track('Chapter 1. The Keeper', level=1)
    heading('Chapter 1. The Keeper')
    para(paragraph(5))
    # a footnote mark after "ledger", and the note at the foot of this page
    note_page = state['page']
    s1 = 'Every evening she wrote the weather in the ledger'
    need(LEAD); c.setFont('Times-Roman', BODY); c.drawString(LEFT + 14, state['y'] - BODY, s1)
    wx = LEFT + 14 + stringWidth(s1, 'Times-Roman', BODY)
    c.setFont('Times-Roman', 7); c.drawString(wx + 0.5, state['y'] - BODY + 4, '1')
    c.setFont('Times-Roman', BODY); c.drawString(wx + 5, state['y'] - BODY, 'that her father had kept.')
    state['y'] -= LEAD + 4
    cur['words'] += words(s1 + ' that her father had kept.')
    c.setLineWidth(0.5); c.line(LEFT, BOTTOM - 6, LEFT + 100, BOTTOM - 6)
    c.setFont('Times-Roman', 8); c.drawString(LEFT, BOTTOM - 18, '1 The ledger is kept in the oil store, wrapped in sailcloth.')
    truth['note'] = words('The ledger is kept in the oil store, wrapped in sailcloth.')
    truth['never'].append('1 The ledger is kept in the oil store')
    for _ in range(11): para(paragraph(6))
    # Chapter 2 starts in the middle of a page, under the end of Chapter 1
    while not (BOTTOM + 200 < state['y'] < TOP - 150): para(paragraph(2))
    track('Chapter 2. Fog', page_break=False, level=1)
    heading('Chapter 2. Fog', gap=24)
    para(paragraph(4))
    # a figure: a frame, a curve, axis labels (never to be heard)
    need(150)
    y0 = state['y'] - 130
    c.rect(LEFT + 40, y0, 220, 110)
    pts = [(LEFT + 40 + i * 11, y0 + 55 + 40 * ((-1) ** (i // 3)) * (i % 3) / 3) for i in range(21)]
    for (a, b), (p, q) in zip(pts, pts[1:]): c.line(a, b, p, q)
    c.setFont('Helvetica', 7)
    for i, lab in enumerate(['0', '5', '10', '15', '20']): c.drawString(LEFT + 38 + i * 55, y0 - 9, lab)
    c.drawString(LEFT + 120, y0 - 19, 'Hours after noon')
    c.drawString(LEFT + 10, y0 + 50, 'Metres')
    truth['never'] += ['Hours after noon', 'Metres']
    state['y'] = y0 - 34
    for _ in range(8): para(paragraph(6))
    # a scene break
    need(LEAD * 2); c.setFont('Times-Roman', BODY); c.drawCentredString(W / 2, state['y'] - BODY, '*   *   *'); state['y'] -= LEAD * 2
    cur['break'] = True
    para(paragraph(5))

    # Part Two; Chapter 3 in two columns; Chapter 4
    new_page()
    track('Part Two: The Ledger', page_break=False, level=0, key='p2')
    c.setFont('Times-Bold', 22); c.drawCentredString(W / 2, H / 2, 'Part Two: The Ledger'); cur['words'] += words('Part Two: The Ledger')
    state['y'] = BOTTOM
    track('Chapter 3. Inventory', level=1)
    heading('Chapter 3. Inventory')
    mid, gut = (LEFT + RIGHT) / 2, 10
    for col_page in range(3):
        top = state['y']
        for x0, x1 in [(LEFT, mid - gut), (mid + gut, RIGHT)]:
            state['y'] = top
            while state['y'] - LEAD * 6 > BOTTOM:
                text = paragraph(3)
                ls = lines_of(text, x1 - x0, first_indent=10)
                if state['y'] - LEAD * len(ls) < BOTTOM: break
                for ln, ind in ls:
                    c.setFont('Times-Roman', BODY); c.drawString(x0 + ind, state['y'] - BODY, ln); state['y'] -= LEAD
                state['y'] -= 4
                cur['words'] += words(text)
        new_page()
    track('Chapter 4. Zephyrine', page_break=False, level=1)
    heading('Chapter 4. Zephyrine')
    for _ in range(12): para(paragraph(6))
    new_page()
    track('Index', page_break=False, level=0)
    heading('Index')
    for t in ['Bell, fog, 4', 'Ledger, 5, 9', 'Lamp room, 3', 'Zephyrine, 12']:
        need(LEAD); c.setFont('Times-Roman', 10); c.drawString(LEFT, state['y'] - 10, t); state['y'] -= LEAD; cur['words'] += words(t)
    folio(); c.showPage(); c.save()
    truth['pages'] = state['page']
    return truth

# ---------------------------------------------------------------------------------------------------- gutenberg.epub
def make_epub():
    chapters, notes, body, truth = [], [], [], {'title': 'Letters from the Rock', 'author': 'Tomas Weir', 'tracks': [], 'never': [], 'notes': []}
    def esc(s): return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    nid = 0
    for k, title in enumerate(['Chapter I. The Crossing', 'Chapter II. The Lamp', 'Chapter III. Winter', 'Chapter IV. The Letter'], 1):
        tw = words(title)
        body.append(f'<h2 id="ch{k}">{esc(title)}</h2>')
        for p in range(5):
            text = paragraph(4)
            tw += words(text)
            html = esc(text)
            if p == 0 and k == 1:
                # a drop cap: the first letter in a span of its own, floated
                html = f'<span class="dropcap">{html[0]}</span>{html[1:]}'
            if p == 1:
                nid += 1
                kind = nid % 3
                note = f'The note number {nid} says the {rnd.choice(NOUNS)} was {rnd.choice(ADJS)}.'
                truth['notes'].append(words(note))
                mark = [f'<a epub:type="noteref" href="#fn{nid}" id="r{nid}">{nid}</a>',
                        f'<sup><a href="#fn{nid}" id="r{nid}">{nid}</a></sup>',
                        f'<a href="#fn{nid}" id="r{nid}" class="pginternal">[{nid}]</a>'][kind]
                html = html[:-1] + mark + '.'
                notes.append(f'<aside epub:type="footnote" id="fn{nid}"><p>{esc(note)}</p></aside>')
                body.append(f'<p>{html}</p>')
                body.append(notes[-1])
                continue
            if p == 3 and k == 2:
                body.append('<p class="break">* * *</p>')
            if p == 2 and k == 3:
                html += ' The almanac is at https://example.com/almanac/tides.html for anyone who asks.'
                tw += words('The almanac is at example.com for anyone who asks.')
                truth['never'].append('https')
            body.append(f'<p>{html}</p>')
        truth['tracks'].append({'title': title, 'words': tw})
    xhtml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en"><head><meta charset="UTF-8"/><title>Letters from the Rock</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>
<h1>Letters from the Rock</h1><p class="by">by Tomas Weir</p>
{chr(10).join(body)}
</body></html>'''
    truth['front'] = words('Letters from the Rock by Tomas Weir')
    css = 'p { margin: 0; text-indent: 1.5em; } h1, h2 { text-align: center; } .dropcap { float: left; font-size: 3em; line-height: 1; } p.break { text-align: center; margin: 1em 0; }'
    nav = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>' + ''.join(f'<li><a href="book.xhtml#ch{k}">{t["title"]}</a></li>' for k, t in enumerate(truth['tracks'], 1)) + '</ol></nav></body></html>'
    opf = '''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:7f6c4b1e-6d55-4d0c-9a7b-14a8f0c2e014</dc:identifier><dc:title>Letters from the Rock</dc:title><dc:creator>Tomas Weir</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-11-27T00:00:00Z</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/><item id="book" href="book.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="book"/></spine></package>'''
    def put(z, name, data, stored=False):
        info = zipfile.ZipInfo(name, date_time=WHEN); info.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED; info.external_attr = 0o644 << 16; z.writestr(info, data)
    with zipfile.ZipFile(os.path.join(OUT, 'gutenberg.epub'), 'w') as z:
        put(z, 'mimetype', 'application/epub+zip', stored=True)
        put(z, 'META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        put(z, 'OEBPS/content.opf', opf); put(z, 'OEBPS/nav.xhtml', nav); put(z, 'OEBPS/style.css', css); put(z, 'OEBPS/book.xhtml', xhtml)
    return truth

# ---------------------------------------------------------------------------------------------------- noheads.txt
def make_txt():
    paras, ws = [], []
    while len(ws) < 9000:
        p = paragraph(rnd.randint(3, 7)); paras.append(p); ws += words(p)
    with open(os.path.join(OUT, 'noheads.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n\n'.join(paras) + '\n')
    return {'words': ws, 'paragraphs': len(paras)}

index = {'book.pdf': make_pdf(), 'gutenberg.epub': make_epub(), 'noheads.txt': make_txt()}
with open(os.path.join(OUT, 'index.json'), 'w') as f:
    json.dump(index, f, indent=1)
print({k: (len(v.get('tracks', [])), sum(len(t['words']) for t in v.get('tracks', [])) or len(v.get('words', []))) for k, v in index.items()})
