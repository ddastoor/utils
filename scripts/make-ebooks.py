#!/usr/bin/env python3
"""Test books for the EPUB Reader (tests/unit/ebook.test.mjs, tests/e2e/ebook.e2e.mjs): one of each kind the tab opens,
written here from original text, with the truth each test needs in tests/fixtures/ebooks/index.json.

  python3 scripts/make-ebooks.py            (needs Pillow; checks its EPUBs with epubcheck and its MOBI files with
                                             KindleUnpack — `pip install mobi` — where they are installed)

- novel.epub   EPUB 3: a cover, a title page, nested contents (two parts of chapters), a footnote (epub:type noteref), a
               link to a later chapter and one to the web, a figure, a table, a poem, a code block, Greek and Cyrillic
               words, a paragraph in a font of its own (@font-face, Noto Sans Italic), a red heading in the book's CSS
- long.epub    EPUB 3 of 36 chapters, about 150,000 words (a long novel): layout time, the place kept, search with progress
- old.epub     EPUB 2.0.1 with an NCX only (nested)
- drm.epub     novel.epub with a chapter encrypted as Adobe's DRM does (encryption.xml + rights.xml)
- book.mobi    MOBI 6 (Mobipocket): PalmDOC-compressed text, a picture, EXTH title and author
- drm.mobi     the same with the PalmDOC header's encryption set (Mobipocket DRM)
- tale.fb2     FictionBook 2: title-info, a cover, sections, an epigraph, a poem, a footnote, a picture
- comic.cbz    twelve pages p1 … p12 stored out of order, each a colour of its own; ComicInfo.xml
- plain.txt    a plain-text book
"""
import io, json, os, random, shutil, struct, subprocess, sys, zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'ebooks')
NOTO_ITALIC = os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'noto-sans', '400Regular_Italic', 'NotoSans_400Regular_Italic.ttf')

# ---------------------------------------------------------------------------------------------------- the prose
SENTENCES = [
    "Mara climbed the iron stairs of the lighthouse before the sun had cleared the water.",
    "The lamp room smelled of brass polish, paraffin and the salt that crept in through every seam.",
    "Below the gallery the sea moved in long grey ridges, patient as a herd of sleeping animals.",
    "She wrote the wind, the swell and the colour of the sky in the ledger her father had kept before her.",
    "A gull settled on the rail, considered her with one yellow eye, and left without a sound.",
    "Some mornings the fog came in so thickly that the island seemed to float alone in a white room.",
    "On those mornings she wound the clockwork of the fog bell and counted the strokes under her breath.",
    "The supply boat came every second Thursday, weather permitting, and the weather seldom permitted.",
    "Her coat hung on a nail by the door, stiff with the memory of a hundred crossings to the landing stage.",
    "In the evenings she read by the stove, a blanket over her knees and the cat asleep against her ankle.",
    "The books on her shelf had swollen in the damp until their covers curled like dry leaves.",
    "Every ship that passed the rock was a story she would never hear the end of.",
    "She learned the voices of the weather the way other people learn the voices of their neighbours.",
    "When the wind turned to the north the windows sang a single high note that lasted all night.",
    "The garden behind the cottage gave her potatoes, a few stubborn onions and, once, a single rose.",
    "Twice a year an inspector arrived with a clipboard and left with wet boots and nothing to complain about.",
    "Her hands knew the lamp better than her eyes did, and in the dark they never made a mistake.",
    "Far out on the horizon the lights of the trawlers moved like slow stars along the edge of the world.",
    "At the turn of the tide the rocks below the lighthouse rang with a hollow, drumming sound.",
    "She kept a jar of sea glass on the windowsill, green and white and one rare piece of blue.",
    "Letters from the mainland arrived in bundles, and she read them in the order they were written.",
    "The almanac on the kitchen table listed the tides for a year she had not yet lived.",
    "In winter the waves threw stones as large as loaves against the door of the oil store.",
    "She had stopped counting the days long ago and counted the seasons instead.",
    "A fishing family once sheltered with her for three days while a storm tore at the slates.",
    "Their youngest child drew the lighthouse on the back of an envelope and left it pinned above the stove.",
    "The radio crackled with forecasts read by a calm voice that had never seen the rock.",
    "When the lamp turned, its beam swept across the water like a slow hand smoothing a tablecloth.",
    "There were nights when nothing passed at all, and the light kept faith with an empty sea.",
    "Spring came late to the island, first as a softening of the wind and then as birds.",
    "She painted the railings white every summer, and every winter the sea took the paint back.",
    "The keeper before her father had carved his initials into the lintel above the lamp room door.",
    "On clear days she could see the church tower on the mainland, small and certain as a pencil mark.",
    "Her boots stood by the stove each night, toes towards the heat, like two tired dogs.",
    "She liked the hour before dawn best, when the light was still working and the world was not.",
    "Sometimes she spoke aloud to the lamp, and it seemed only polite that it never interrupted.",
]

def prose(rng, n_par, lo=3, hi=6):
    """n_par paragraphs of lo…hi sentences each."""
    return [' '.join(rng.choice(SENTENCES) for _ in range(rng.randint(lo, hi))) for _ in range(n_par)]

def words_of(text):
    """The words of a text as the tests compare them: letters and digits, lower case, in order."""
    out, w = [], ''
    for ch in text:
        if ch.isalnum():
            w += ch.lower()
        else:
            if w: out.append(w)
            w = ''
    if w: out.append(w)
    return out

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

# ---------------------------------------------------------------------------------------------------- pictures
def font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default(size=size)

def picture(w, h, fill, label, fmt='PNG', ink=(255, 255, 255)):
    im = Image.new('RGB', (w, h), fill)
    d = ImageDraw.Draw(im)
    d.rectangle([6, 6, w - 7, h - 7], outline=ink, width=6)
    f = font(max(14, min(w, h) // 6))
    box = d.textbbox((0, 0), label, font=f)
    d.text(((w - (box[2] - box[0])) // 2 - box[0], (h - (box[3] - box[1])) // 2 - box[1]), label, font=f, fill=ink)
    b = io.BytesIO()
    im.save(b, fmt, **({'quality': 85} if fmt == 'JPEG' else {'optimize': True}))
    return b.getvalue()

def chart():
    """A small bar chart: the tides of a week."""
    w, h = 480, 260
    im = Image.new('RGB', (w, h), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.line([40, 220, 460, 220], fill=(0, 0, 0), width=2)
    d.line([40, 20, 40, 220], fill=(0, 0, 0), width=2)
    for i, v in enumerate([3.1, 4.2, 5.0, 4.4, 3.6, 2.9, 3.8]):
        x = 60 + i * 56
        d.rectangle([x, 220 - int(v * 36), x + 36, 219], fill=(30, 90, 160))
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return b.getvalue()

# ---------------------------------------------------------------------------------------------------- EPUB writer
CONTAINER = ('<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
             '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n')

def xhtml(title, body, css=('style.css',), epub3=True, lang='en'):
    links = ''.join(f'<link rel="stylesheet" type="text/css" href="{c}"/>' for c in css)
    if epub3:
        return (f'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" '
                f'xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}" lang="{lang}"><head><meta charset="UTF-8"/><title>{esc(title)}</title>{links}</head>'
                f'<body>{body}</body></html>\n')
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n'
            f'<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}"><head><title>{esc(title)}</title>{links}</head><body>{body}</body></html>\n')

def write_epub(path, files, opf):
    """files: [(name under OEBPS/, bytes or str)]; mimetype first and stored, as OCF requires."""
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', CONTAINER)
        z.writestr('OEBPS/content.opf', opf)
        for name, data in files:
            z.writestr('OEBPS/' + name, data)

def media_type(name):
    return {'xhtml': 'application/xhtml+xml', 'css': 'text/css', 'png': 'image/png', 'jpg': 'image/jpeg', 'ttf': 'font/ttf', 'ncx': 'application/x-dtbncx+xml'}[name.rsplit('.', 1)[1]]

def opf3(ident, title, author, files, spine, cover=None, nav='nav.xhtml'):
    items = []
    for name, _ in files:
        props = []
        if name == nav: props.append('nav')
        if name == cover: props.append('cover-image')
        items.append(f'<item id="i{len(items)}" href="{name}" media-type="{media_type(name)}"' + (f' properties="{" ".join(props)}"' if props else '') + '/>')
    ids = {name: f'i{k}' for k, (name, _) in enumerate(files)}
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">'
            '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
            f'<dc:identifier id="uid">urn:uuid:{ident}</dc:identifier><dc:title>{esc(title)}</dc:title><dc:creator>{esc(author)}</dc:creator>'
            '<dc:language>en</dc:language><meta property="dcterms:modified">2026-11-27T00:00:00Z</meta></metadata>'
            f'<manifest>{"".join(items)}</manifest><spine>{"".join(f"<itemref idref=\"{ids[s]}\"/>" for s in spine)}</spine></package>\n')

def nav_doc(entries):
    """entries: [(title, href, [children])]."""
    def ol(es):
        return '<ol>' + ''.join(f'<li><a href="{h}">{esc(t)}</a>' + (ol(c) if c else '') + '</li>' for t, h, c in es) + '</ol>'
    return xhtml('Contents', f'<nav epub:type="toc" id="toc"><h1>Contents</h1>{ol(entries)}</nav>', css=())

# ---------------------------------------------------------------------------------------------------- novel.epub
BOOK_CSS = ('body { margin: 0 5% } p { text-indent: 1.4em; margin: 0; text-align: justify } h1, h2 { text-align: center; margin: 1.5em 0 1em } '
            'h1.red { color: #a01010 } .title { font-size: 2em; text-align: center; margin-top: 30% } .byline { text-align: center; text-indent: 0 } '
            'figure { margin: 1em 0; text-align: center } figcaption { font-size: 0.85em } table { border-collapse: collapse; margin: 1em auto } '
            'td, th { border: 1px solid #555; padding: 0.2em 0.6em } .poem p { text-indent: 0; margin-left: 2em } pre { font-size: 0.8em } '
            '@font-face { font-family: "Book Letter"; src: url(fonts/letter.ttf) } .letter { font-family: "Book Letter", sans-serif; text-indent: 0; margin: 1em 2em } '
            'aside.note p { text-indent: 0 }')

def novel(rng):
    truth = {'kind': 'epub', 'title': 'The Lighthouse Almanac', 'author': 'Ines Farrow'}
    files, spine, text = [], [], []
    files.append(('style.css', BOOK_CSS))
    files.append(('images/cover.png', picture(600, 900, (24, 58, 94), 'Almanac')))
    files.append(('images/chart.png', chart()))
    files.append(('fonts/letter.ttf', open(NOTO_ITALIC, 'rb').read()))
    files.append(('cover.xhtml', xhtml('Cover', '<div style="text-align:center"><img src="images/cover.png" alt="The Lighthouse Almanac" style="height:95%"/></div>')))
    spine.append('cover.xhtml')
    files.append(('title.xhtml', xhtml('Title', '<p class="title">The Lighthouse Almanac</p><p class="byline">by Ines Farrow</p>'
                                       '<p class="byline">A story written for the tests of SuperUtils.</p>')))
    spine.append('title.xhtml')
    text += ['The Lighthouse Almanac', 'by Ines Farrow', 'A story written for the tests of SuperUtils.']
    chapters = []
    plan = [('part1.xhtml', 'Part One: The Rock', None), ('ch1.xhtml', 'Chapter 1. The Keeper', 24), ('ch2.xhtml', 'Chapter 2. Fog', 24),
            ('part2.xhtml', 'Part Two: The Ledger', None), ('ch3.xhtml', 'Chapter 3. Inventory', 24), ('ch4.xhtml', 'Chapter 4. Zephyrine', 24),
            ('ch5.xhtml', 'Chapter 5. Charts and Verses', 10)]
    for name, title, n in plan:
        body, words = f'<h1 id="top">{esc(title)}</h1>', [title]
        if n is None:
            body = f'<h1 class="red" id="top">{esc(title)}</h1>'
        else:
            paras = prose(rng, n)
            if name == 'ch4.xhtml':
                paras[2] += ' The schooner Zephyrine had been seen off the point at dusk.'
                paras[9] += ' Nobody on the mainland had heard of the Zephyrine, and nobody claimed her.'
                paras[5] += ' The old ledger mentioned a storm in the autumn of that year.'
            ps = ''.join(f'<p>{esc(p)}</p>' for p in paras)
            words += paras
            if name == 'ch4.xhtml':
                ps += ('<p>The ledger had a note in the margin.<a epub:type="noteref" href="notes.xhtml#n1" id="r1">1</a> '
                       'It is explained in <a href="ch5.xhtml#charts">the chapter of charts</a>, and the almanac itself is '
                       '<a href="https://example.com/almanac">described on the web</a>.</p>')
                words += ['The ledger had a note in the margin.', '1', 'It is explained in the chapter of charts, and the almanac itself is described on the web.']
            if name == 'ch5.xhtml':
                ps = (f'<h2 id="charts">The tides of a week</h2>' + ps +
                      '<figure><img src="images/chart.png" alt="A bar chart of seven tides"/><figcaption>Figure 1. The tides of a week, in metres.</figcaption></figure>'
                      '<table><tr><th>Day</th><th>Wind</th><th>Swell</th></tr><tr><td>Monday</td><td>NW 4</td><td>2 m</td></tr>'
                      '<tr><td>Tuesday</td><td>W 6</td><td>3 m</td></tr></table>'
                      '<div class="poem"><p>The lamp goes round, the lamp goes round,</p><p>and every ship is homeward bound.</p></div>'
                      '<pre>tide(hour) = 3.2 + 1.8 * cos(hour / 12.42)</pre>'
                      '<p>On the shelf: a Greek grammar (Καλημέρα, θάλασσα) and a Russian primer (Маяк, море).</p>'
                      '<p class="letter">Dear Mara, the inspector will come on Thursday. Yours, the Board.</p>'
                      '<p>Zephyrine was never seen again.</p>')
                words += ['The tides of a week'] + ['Figure 1. The tides of a week, in metres.', 'Day Wind Swell Monday NW 4 2 m Tuesday W 6 3 m',
                          'The lamp goes round, the lamp goes round,', 'and every ship is homeward bound.', 'tide(hour) = 3.2 + 1.8 * cos(hour / 12.42)',
                          'On the shelf: a Greek grammar (Καλημέρα, θάλασσα) and a Russian primer (Маяк, море).',
                          'Dear Mara, the inspector will come on Thursday. Yours, the Board.', 'Zephyrine was never seen again.']
                # the poem, the table … come after the prose, so the chapter's words are its heading, the h2 and then the paragraphs
                words = [title, 'The tides of a week'] + paras + words[1 + len(paras) + 1:]
            body += ps
        files.append((name, xhtml(title, body)))
        spine.append(name)
        chapters.append({'title': title, 'file': name, 'first': words_of(' '.join(words))[:12]})
        text += words
    notes = ('<h1>Notes</h1><aside epub:type="footnote" id="n1" class="note"><p>1. The note says only: “fair weather, '
             'one sail to the west”.</p></aside>')
    files.append(('notes.xhtml', xhtml('Notes', notes)))
    spine.append('notes.xhtml')
    text += ['Notes', '1. The note says only: “fair weather, one sail to the west”.']
    toc = [('Title page', 'title.xhtml', []),
           ('Part One: The Rock', 'part1.xhtml', [('Chapter 1. The Keeper', 'ch1.xhtml', []), ('Chapter 2. Fog', 'ch2.xhtml', [])]),
           ('Part Two: The Ledger', 'part2.xhtml', [('Chapter 3. Inventory', 'ch3.xhtml', []), ('Chapter 4. Zephyrine', 'ch4.xhtml', []),
                                                     ('Chapter 5. Charts and Verses', 'ch5.xhtml', [])]),
           ('Notes', 'notes.xhtml', [])]
    files.append(('nav.xhtml', nav_doc(toc)))
    opf = opf3('5a1b8f30-6c55-4e8a-9d3e-2f0e6a1c7b01', truth['title'], truth['author'], files, spine, cover='images/cover.png')
    write_epub(os.path.join(OUT, 'novel.epub'), files, opf)
    flat = []
    def walk(es, depth):
        for t, h, c in es:
            flat.append({'title': t, 'depth': depth, 'file': h}); walk(c, depth + 1)
    walk(toc, 0)
    truth.update(contents=flat, chapters=chapters, words=words_of(' '.join(text)),
                 search={'zephyrine': 4, 'lighthouse almanac': 1, 'nonexistentword': 0}, footnote='n1', web='https://example.com/almanac')
    return truth

# ---------------------------------------------------------------------------------------------------- long.epub
def long_book(rng):
    files, spine, chapters = [('style.css', 'p { text-indent: 1.4em; margin: 0 } h1 { text-align: center }')], [], []
    total = 0
    for k in range(1, 37):
        paras = prose(rng, 60, 4, 7)
        if k in (3, 17, 33):
            paras[30] += ' Quillwort grew in the shallows below the landing stage.'
        name = f'ch{k:02d}.xhtml'
        title = f'Chapter {k}'
        files.append((name, xhtml(title, f'<h1>{title}</h1>' + ''.join(f'<p>{esc(p)}</p>' for p in paras))))
        spine.append(name)
        n = len(words_of(title + ' ' + ' '.join(paras)))
        total += n
        chapters.append({'title': title, 'file': name, 'first': words_of(title + ' ' + paras[0])[:12], 'words': n})
    files.append(('nav.xhtml', nav_doc([(c['title'], c['file'], []) for c in chapters])))
    write_epub(os.path.join(OUT, 'long.epub'), files, opf3('7d0c3e9a-1f2b-4c5d-8e6f-0a1b2c3d4e5f', 'The Long Almanac', 'Ines Farrow', files, spine))
    return {'kind': 'epub', 'title': 'The Long Almanac', 'author': 'Ines Farrow', 'chapters': chapters, 'totalWords': total,
            'search': {'quillwort': 3}, 'quillwortChapters': [3, 17, 33]}

# ---------------------------------------------------------------------------------------------------- old.epub (EPUB 2)
def old_book(rng):
    files, spine, text, chapters = [('style.css', 'p { margin: 0.5em 0 }')], [], [], []
    for k, title in enumerate(['Preface', 'The First Watch', 'The Second Watch'], 1):
        paras = prose(rng, 8)
        name = f'c{k}.xhtml'
        files.append((name, xhtml(title, f'<h1>{esc(title)}</h1>' + ''.join(f'<p>{esc(p)}</p>' for p in paras), epub3=False)))
        spine.append(name)
        text += [title] + paras
        chapters.append({'title': title, 'file': name, 'first': words_of(title + ' ' + paras[0])[:12]})
    ncx = ('<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head>'
           '<meta name="dtb:uid" content="urn:uuid:3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7"/><meta name="dtb:depth" content="2"/>'
           '<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>'
           '<docTitle><text>An Older Book</text></docTitle><navMap>'
           '<navPoint id="p1" playOrder="1"><navLabel><text>Preface</text></navLabel><content src="c1.xhtml"/></navPoint>'
           '<navPoint id="p2" playOrder="2"><navLabel><text>The Watches</text></navLabel><content src="c2.xhtml"/>'
           '<navPoint id="p3" playOrder="2"><navLabel><text>The First Watch</text></navLabel><content src="c2.xhtml"/></navPoint>'
           '<navPoint id="p4" playOrder="3"><navLabel><text>The Second Watch</text></navLabel><content src="c3.xhtml"/></navPoint>'
           '</navPoint></navMap></ncx>\n')
    files.append(('toc.ncx', ncx))
    items = ''.join(f'<item id="i{k}" href="{n}" media-type="{media_type(n)}"/>' for k, (n, _) in enumerate(files))
    ids = {n: f'i{k}' for k, (n, _) in enumerate(files)}
    opf = ('<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">'
           '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">'
           '<dc:identifier id="uid" opf:scheme="UUID">urn:uuid:3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7</dc:identifier>'
           '<dc:title>An Older Book</dc:title><dc:creator opf:role="aut">Tomas Weir</dc:creator><dc:language>en</dc:language></metadata>'
           f'<manifest>{items}</manifest><spine toc="{ids["toc.ncx"]}">{"".join(f"<itemref idref=\"{ids[s]}\"/>" for s in spine)}</spine></package>\n')
    write_epub(os.path.join(OUT, 'old.epub'), files, opf)
    return {'kind': 'epub', 'title': 'An Older Book', 'author': 'Tomas Weir', 'chapters': chapters, 'words': words_of(' '.join(text)),
            'contents': [{'title': 'Preface', 'depth': 0}, {'title': 'The Watches', 'depth': 0}, {'title': 'The First Watch', 'depth': 1}, {'title': 'The Second Watch', 'depth': 1}]}

# ---------------------------------------------------------------------------------------------------- drm.epub
def drm_epub():
    src = zipfile.ZipFile(os.path.join(OUT, 'novel.epub'))
    with zipfile.ZipFile(os.path.join(OUT, 'drm.epub'), 'w', zipfile.ZIP_DEFLATED) as z:
        for it in src.infolist():
            data = src.read(it.filename)
            if it.filename == 'OEBPS/ch2.xhtml':
                data = bytes(b ^ 0x5A for b in data)  # stands for AES: unreadable without the key
            z.writestr(it.filename, data, compress_type=zipfile.ZIP_STORED if it.filename == 'mimetype' else zipfile.ZIP_DEFLATED)
        z.writestr('META-INF/encryption.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" '
                   'xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>'
                   '<KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><resource xmlns="http://ns.adobe.com/adept">urn:uuid:00000000-0000-0000-0000-000000000000</resource></KeyInfo>'
                   '<enc:CipherData><enc:CipherReference URI="OEBPS/ch2.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>\n')
        z.writestr('META-INF/rights.xml', '<?xml version="1.0"?><adept:rights xmlns:adept="http://ns.adobe.com/adept"><adept:licenseToken/></adept:rights>\n')
    return {'kind': 'epub', 'drm': True}

# ---------------------------------------------------------------------------------------------------- MOBI writer
def palmdoc_compress(data):
    """PalmDOC LZ77 (compression 2): literals, escaped runs, (distance, length) pairs, space + letter."""
    out, i, n = bytearray(), 0, len(data)
    while i < n:
        best_len = best_dist = 0
        start = max(0, i - 2047)
        for L in range(min(10, n - i), 2, -1):
            j = data.rfind(data[i:i + L], start, i + L - 1)
            if j != -1 and j < i:
                best_len, best_dist = L, i - j
                break
        if best_len >= 3:
            out += struct.pack('>H', 0x8000 | (best_dist << 3) | (best_len - 3)); i += best_len; continue
        c = data[i]
        if c == 0x20 and i + 1 < n and 0x40 <= data[i + 1] <= 0x7f:
            out.append(data[i + 1] ^ 0x80); i += 2; continue
        if c == 0 or 0x09 <= c <= 0x7f:
            out.append(c); i += 1; continue
        run = bytearray()
        while i < n and len(run) < 8 and not (data[i] == 0 or 0x09 <= data[i] <= 0x7f):
            run.append(data[i]); i += 1
        out.append(len(run)); out += run
    return bytes(out)

def palmdoc_decompress(data):
    out, i = bytearray(), 0
    while i < len(data):
        c = data[i]; i += 1
        if c == 0 or 0x09 <= c <= 0x7f: out.append(c)
        elif c <= 8: out += data[i:i + c]; i += c
        elif c >= 0xc0: out += bytes((0x20, c ^ 0x80))
        else:
            v = (c << 8) | data[i]; i += 1
            dist, L = (v & 0x3fff) >> 3, (v & 7) + 3
            for _ in range(L): out.append(out[-dist])
    return bytes(out)

def write_mobi(path, title, author, html, images=(), encryption=0):
    text = html.encode('utf-8')
    recs = []
    for k in range(0, len(text), 4096):
        chunk = text[k:k + 4096]
        body = palmdoc_compress(chunk)
        assert palmdoc_decompress(body) == chunk
        recs.append(body)
    first_img = len(recs) + 1
    exth_recs = [(100, author.encode('utf-8')), (503, title.encode('utf-8'))]
    exth = b''.join(struct.pack('>II', t, len(v) + 8) + v for t, v in exth_recs)
    exth = b'EXTH' + struct.pack('>II', 12 + len(exth), len(exth_recs)) + exth
    while len(exth) % 4: exth += b'\0'
    name = title.encode('utf-8')
    L = 232
    mh = bytearray(L)
    mh[0:4] = b'MOBI'
    struct.pack_into('>IIIII', mh, 4, L, 2, 65001, 0x5EB00C, 6)          # length, book, UTF-8, uid, version 6
    for off in range(0x28, 0x50, 4): struct.pack_into('>I', mh, off - 16, 0xFFFFFFFF)  # no indexes
    struct.pack_into('>I', mh, 0x50 - 16, first_img if images else len(recs) + 1)      # first non-book record
    struct.pack_into('>II', mh, 0x54 - 16, 16 + L + len(exth), len(name))               # full name
    struct.pack_into('>I', mh, 0x5C - 16, 9)                                            # English
    struct.pack_into('>I', mh, 0x68 - 16, 6)                                            # min version
    struct.pack_into('>I', mh, 0x6C - 16, first_img if images else 0xFFFFFFFF)          # first image
    struct.pack_into('>I', mh, 0x80 - 16, 0x40)                                         # EXTH present
    for off in (0xA4, 0xA8, 0xC8, 0xD0, 0xE0, 0xE8, 0xEC, 0xF4): struct.pack_into('>I', mh, off - 16, 0xFFFFFFFF)
    struct.pack_into('>HH', mh, 0xC0 - 16, 1, len(recs))                                # first / last content record
    struct.pack_into('>I', mh, 0xF0 - 16, 0)                                            # no trailing entries
    palm = struct.pack('>HHIHHHH', 2, 0, len(text), len(recs), 4096, encryption, 0)
    rec0 = palm + bytes(mh) + exth + name + b'\0\0'
    while len(rec0) % 4: rec0 += b'\0'
    records = [rec0] + recs + list(images) + [b'\xe9\x8e\r\n']
    n = len(records)
    hdr = bytearray(78)
    pdb_name = title.encode('ascii', 'replace')[:31].replace(b' ', b'_')
    hdr[0:len(pdb_name)] = pdb_name
    struct.pack_into('>III', hdr, 36, 0x7A000000, 0x7A000000, 0)
    hdr[60:68] = b'BOOKMOBI'
    struct.pack_into('>IIH', hdr, 68, 0, 2 * n - 1, n)
    offset, table = 78 + 8 * n + 2, bytearray()
    for k, r in enumerate(records):
        table += struct.pack('>II', offset, (2 * k) & 0x00FFFFFF)
        offset += len(r)
    with open(path, 'wb') as f:
        f.write(bytes(hdr) + bytes(table) + b'\0\0' + b''.join(records))

def mobi_book(rng):
    ch1, ch2 = prose(rng, 30), prose(rng, 30)
    html = ('<html><head><guide></guide></head><body><h1>The Harbour Log</h1><p>by Ines Farrow</p><mbp:pagebreak/>'
            '<h1>Chapter One. Arrivals</h1>' + ''.join(f'<p>{esc(p)}</p>' for p in ch1) +
            '<p><img recindex="00001"/></p><mbp:pagebreak/><h1>Chapter Two. Departures</h1>' + ''.join(f'<p>{esc(p)}</p>' for p in ch2) + '</body></html>')
    img = picture(360, 240, (40, 110, 80), 'harbour', 'JPEG')
    write_mobi(os.path.join(OUT, 'book.mobi'), 'The Harbour Log', 'Ines Farrow', html, [img])
    write_mobi(os.path.join(OUT, 'drm.mobi'), 'The Harbour Log', 'Ines Farrow', html, [img], encryption=2)
    text = ['The Harbour Log', 'by Ines Farrow', 'Chapter One. Arrivals'] + ch1 + ['Chapter Two. Departures'] + ch2
    return {'kind': 'mobi', 'title': 'The Harbour Log', 'author': 'Ines Farrow', 'words': words_of(' '.join(text)), 'images': 1,
            'contents': [{'title': 'The Harbour Log'}, {'title': 'Chapter One. Arrivals'}, {'title': 'Chapter Two. Departures'}]}

# ---------------------------------------------------------------------------------------------------- tale.fb2
def fb2_book(rng):
    import base64
    p1, p2 = prose(rng, 14), prose(rng, 14)
    cover = base64.b64encode(picture(300, 450, (90, 40, 30), 'Tale', 'JPEG')).decode()
    pic = base64.b64encode(picture(240, 140, (200, 170, 90), 'shore', 'JPEG', ink=(0, 0, 0))).decode()
    fb2 = ('<?xml version="1.0" encoding="UTF-8"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">'
           '<description><title-info><genre>prose</genre><author><first-name>Lena</first-name><last-name>Holm</last-name></author>'
           '<book-title>The Shore Tale</book-title><annotation><p>A short tale told for the tests.</p></annotation>'
           '<coverpage><image l:href="#cover.jpg"/></coverpage><lang>en</lang></title-info>'
           '<document-info><author><nickname>superutils</nickname></author><date>2026</date><id>shore-tale-1</id><version>1.0</version></document-info></description>'
           '<body><title><p>The Shore Tale</p></title>'
           '<section><title><p>Part One. Low Water</p></title><epigraph><p>The sea keeps what it is given.</p><text-author>A saying</text-author></epigraph>'
           + ''.join(f'<p>{esc(p)}</p>' for p in p1) +
           '<p>Mara found a bottle on the shingle.<a l:href="#n1" type="note">[1]</a></p><image l:href="#shore.jpg"/>'
           '<poem><stanza><v>Low water, slow water,</v><v>the stones come up to breathe.</v></stanza></poem></section>'
           '<section><title><p>Part Two. High Water</p></title>' + ''.join(f'<p>{esc(p)}</p>' for p in p2) + '</section></body>'
           '<body name="notes"><section id="n1"><title><p>1</p></title><p>It held a map of the island, drawn in pencil.</p></section></body>'
           f'<binary id="cover.jpg" content-type="image/jpeg">{cover}</binary><binary id="shore.jpg" content-type="image/jpeg">{pic}</binary></FictionBook>\n')
    open(os.path.join(OUT, 'tale.fb2'), 'w', encoding='utf-8').write(fb2)
    return {'kind': 'fb2', 'title': 'The Shore Tale', 'author': 'Lena Holm', 'images': 2,
            'contents': [{'title': 'Part One. Low Water'}, {'title': 'Part Two. High Water'}],
            'search': {'shingle': 1}}

# ---------------------------------------------------------------------------------------------------- comic.cbz
def comic():
    pages = []
    with zipfile.ZipFile(os.path.join(OUT, 'comic.cbz'), 'w', zipfile.ZIP_STORED) as z:
        order = list(range(1, 13))
        random.Random(5).shuffle(order)
        for k in order:
            hue = (k * 29) % 360
            im = Image.new('HSV', (1, 1), (int(hue / 360 * 255), 160, 230)).convert('RGB')
            col = im.getpixel((0, 0))
            z.writestr(f'p{k}.jpg', picture(480, 720, col, str(k), 'JPEG', ink=(0, 0, 0)))
            pages.append((k, col))
        z.writestr('ComicInfo.xml', '<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo><Title>Twelve Panels</Title><Writer>Ann Artist</Writer><PageCount>12</PageCount></ComicInfo>\n')
    pages.sort()
    return {'kind': 'cbz', 'title': 'Twelve Panels', 'author': 'Ann Artist', 'pages': [list(c) for _, c in pages], 'size': [480, 720], 'storedOrder': order}

# ---------------------------------------------------------------------------------------------------- plain.txt
def plain(rng):
    parts = ['THE QUIET SHORE', '', 'by Tomas Weir', '']
    for k in ('I', 'II'):
        parts += [f'CHAPTER {k}.', '']
        for p in prose(rng, 10):
            parts += [p, '']
    text = '\n'.join(parts)
    open(os.path.join(OUT, 'plain.txt'), 'w', encoding='utf-8').write(text)
    return {'kind': 'txt', 'words': words_of(text)}

# ---------------------------------------------------------------------------------------------------- checks
def epubcheck(path):
    jar = os.environ.get('EPUBCHECK') or next((os.path.join(r, 'epubcheck.jar') for r, _, fs in os.walk('/opt') if 'epubcheck.jar' in fs), None)
    if not jar or not shutil.which('java'):
        print('  epubcheck not found: skipped'); return
    r = subprocess.run(['java', '-jar', jar, '-q', path], capture_output=True, text=True)
    msgs = (r.stdout + r.stderr).strip()
    if r.returncode != 0 or 'ERROR' in msgs or 'WARNING' in msgs:
        sys.exit(f'epubcheck {os.path.basename(path)}:\n{msgs}')
    print(f'  epubcheck {os.path.basename(path)}: clean')

def kindleunpack(path, truth):
    try:
        from mobi.extract import extract
    except ImportError:
        print('  KindleUnpack (pip install mobi) not found: skipped'); return
    tmp, html = extract(path)
    try:
        import re
        got = words_of(re.sub(r'<[^>]+>', ' ', open(html, encoding='utf-8').read()))
        if got != truth['words']: sys.exit(f'KindleUnpack reads {os.path.basename(path)} otherwise than it was written')
        n = sum(1 for r, _, fs in os.walk(tmp) for f in fs if f.endswith(('.jpg', '.jpeg')))
        if n != truth['images']: sys.exit(f'KindleUnpack finds {n} pictures in {os.path.basename(path)}')
        print(f'  KindleUnpack {os.path.basename(path)}: {len(got)} words, {n} picture, as written')
    finally:
        shutil.rmtree(tmp)

def main():
    os.makedirs(OUT, exist_ok=True)
    rng = random.Random(1964)
    index = {'novel.epub': novel(rng), 'long.epub': long_book(rng), 'old.epub': old_book(rng)}
    index['drm.epub'] = drm_epub()
    index['book.mobi'] = mobi_book(rng)
    index['drm.mobi'] = {'kind': 'mobi', 'drm': True}
    index['tale.fb2'] = fb2_book(rng)
    index['comic.cbz'] = comic()
    index['plain.txt'] = plain(rng)
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=0)
    for name in ('novel.epub', 'long.epub', 'old.epub'):
        epubcheck(os.path.join(OUT, name))
    kindleunpack(os.path.join(OUT, 'book.mobi'), index['book.mobi'])
    for name in sorted(os.listdir(OUT)):
        print(f'  {name}: {os.path.getsize(os.path.join(OUT, name)):,} bytes')

if __name__ == '__main__':
    main()
