#!/usr/bin/env python3
"""Test pages for Articles → Kindle (tests/fixtures/articles/): web articles as a reader saves them, with what is known
about each — the title, author, site, date, the article's sentences in order, what is no part of it (adverts, menus,
comments, the cookie banner), and its pictures.

  python3 scripts/make-article-pages.py            the pages, their pictures, the web archives and the saved folders
  node scripts/make-article-mhtml.mjs              (runs this first) then Chrome's own MHTML of every page, then the
                                                   reference (--reference)
  python3 scripts/make-article-pages.py --reference   reference.json: every part of every MHTML and web archive as
                                                   Python's email package and plistlib read them (type, address, the
                                                   SHA-256 of the bytes) — what article.wasm's readers are held to

Pages (all made up): news — a newspaper's story with its site around it (navigation, a cookie banner, adverts, a sign-up
form, related links, share buttons, comments), a figure, a <picture> with WebP and JPEG, a lazy-loaded picture, a
YouTube embed, a table, a footnote; blog — a developer's post in Tailwind's classes (code under "overflow-hidden
md:hidden", a "scroll-mt-2" container), srcset, a transparent PNG, a GIF, an SVG picture, a picture of 3,000 px, a
tracking pixel, inline SVG icons, an <ol start>, a <dl>; fr — a French article saved in Windows-1252; home — a site's
front page (headlines and teasers): no article.

Saved as: <page>.mhtml (Chrome, "Webpage, Single File" — by the Node script), <page>.webarchive (Safari's binary
property list), complete/<page>/ (Chrome's "Webpage, Complete": the .html with a "saved from" mark and its _files
folder), <page>.html (HTML only)."""
import hashlib, io, json, os, plistlib, sys, email, email.policy
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'tests', 'fixtures', 'articles')

def jpeg(w, h, colour, mark, q=82):
    im = Image.new('RGB', (w, h), colour)
    d = ImageDraw.Draw(im)
    for i in range(0, w, max(8, w // 40)):
        d.line([(i, 0), (i + h // 2, h)], fill=tuple(max(0, c - 40) for c in colour), width=2)
    d.rectangle([w // 10, h // 10, w // 10 + w // 5, h // 10 + h // 5], fill=mark)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=q); return b.getvalue()

def png_alpha(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m, bw = h // 8, w // 6
    for k, (c, v) in enumerate([((220, 60, 60, 255), 0.8), ((60, 140, 220, 255), 0.5), ((60, 180, 90, 255), 0.65)]):
        x = m + k * (bw + bw // 2)
        d.rectangle([x, int(h - m - v * (h - 2 * m)), x + bw, h - m], fill=c)
    d.line([(m // 2, h - m), (w - m // 2, h - m)], fill=(20, 20, 20, 255), width=3)
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()

def gif(w, h):
    frames = [Image.new('P', (w, h), 0) for _ in range(2)]
    for k, f in enumerate(frames):
        f.putpalette([255, 255, 255, 30, 30, 160, 200, 40, 40] + [0] * (256 * 3 - 9))
        ImageDraw.Draw(f).ellipse([20 + 60 * k, 20, 80 + 60 * k, 80], fill=1 + k)
    b = io.BytesIO(); frames[0].save(b, 'GIF', save_all=True, append_images=frames[1:], duration=400, loop=0); return b.getvalue()

def webp(w, h, colour, mark):
    im = Image.new('RGB', (w, h), colour)
    ImageDraw.Draw(im).ellipse([w // 3, h // 4, w // 3 + w // 4, h // 4 + h // 3], fill=mark)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=80); return b.getvalue()

PIXEL = bytes.fromhex('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b')
SVG = b'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240"><rect width="480" height="240" fill="#fff"/><rect x="20" y="20" width="140" height="80" fill="#2e7d32"/><rect x="200" y="140" width="140" height="80" fill="#6a1b9a"/><path d="M160 60 L200 180" stroke="#000" stroke-width="4"/></svg>'

def para(*sentences): return '<p>' + ' '.join(sentences) + '</p>'

# ---------------------------------------------------------------------------------------------------- the pages
NEWS_URL = 'https://coastal-gazette.example/2026/11/20/lighthouse-keepers'
NEWS_SENT = [
    'For two hundred years the lighthouse on Kestrel Rock was kept by families who rowed out with the spring tide and stayed until the autumn gales.',
    'The keepers wrote the weather into a ledger three times a day, and the ledgers survive in a cupboard of the harbour office.',
    'Mara Ellison, whose grandfather kept the light until 1961, has spent the last year reading them page by page.',
    'She found storms that are still talked about in the village, and quiet weeks in which the only entry is the colour of the sea.',
    'A life on the rock was ruled by the lamp and the clock.',
    'The wick was trimmed at dusk and at midnight, the lens was polished every morning, and the brass was cleaned on Saturdays whatever the weather.',
    'Supplies came by boat once a fortnight, and when the boat could not land the keepers lived on salted fish and the potatoes they grew in a sheltered corner of the rock.',
    'We were never lonely, Ellison remembers her grandfather saying, because the sea was always talking.',
    'The light was automated in 1961, and the last keepers rowed ashore for good on a calm morning in October.',
    'The harbour office plans to put the ledgers on show next spring, beside the lamp that was taken down when the light went electric.',
    'Visitors will be able to read the entries for the night of the great storm of 1893, when the keepers kept the light burning for thirty hours without sleep.',
]
NEWS_NOT = ['ADVERTISEMENT', 'Subscribe to our newsletter', 'We use cookies', 'Most read', 'Comments (3)', 'Share on', 'Sign in', 'Gazette Weather Desk', 'Great article, thank you']

BLOG_URL = 'https://ferris-notes.example/posts/flamegraphs'
BLOG_SENT = [
    'A flamegraph shows where a program spends its time, one box for every function on the stack, as wide as the time it took.',
    'Reading one takes a little practice, but after a few minutes the wide plateaus jump out at you and the narrow spikes stop being distracting.',
    'To record a profile, build the program in release mode with debug symbols and run it under perf with call graphs turned on.',
    'The first thing to look for is a plateau that should not be there, a function that you expected to be cheap taking a quarter of the width.',
    'In our case it was the hash function of a map that was rebuilt for every request instead of once at start-up.',
    'Moving the map into a static that is built lazily cut the time for a request from eleven milliseconds to four.',
    'Flamegraphs are not the only view worth having, and a flat profile sorted by self time still answers some questions faster.',
    'The second profile, after the fix, has no plateau at all: the time is spread across parsing, the database and writing the answer.',
]
BLOG_CODE = 'fn main() { let map = build_map_once(); serve(&map); }'
BLOG_NOT = ['Related posts', 'Subscribe', 'Join the discussion', 'Toggle theme', 'Edit this page on GitHub']

FR_URL = 'https://journal-littoral.example/culture/phare-de-cordouan'
FR_SENT = [
    'Le phare de Cordouan se dresse au large de l’estuaire de la Gironde depuis le début du dix-septième siècle.',
    'On l’appelle parfois le roi des phares, parce que ses architectes ont voulu qu’il ressemble à un palais autant qu’à une tour.',
    'Les gardiens y vivaient par équipes de trois et se relayaient tous les quinze jours, quand la mer le permettait.',
    'Aujourd’hui le phare est automatisé, mais des visiteurs traversent encore à marée basse pour monter ses trois cents marches.',
    'Depuis la lanterne, par temps clair, on voit à la fois l’océan, l’estuaire et les forêts de pins de la côte.',
]
FR_NOT = ['PUBLICITÉ', 'Abonnez-vous', 'Les plus lus']

def news_html(img):
    """img(name) → the address of a picture in the saved page."""
    s = NEWS_SENT
    return f'''<!DOCTYPE html>
<html lang="en-GB"><head><meta charset="utf-8"><title>The lighthouse keepers of Kestrel Rock | The Coastal Gazette</title>
<meta property="og:site_name" content="The Coastal Gazette"><meta property="og:title" content="The lighthouse keepers of Kestrel Rock"><meta property="og:image" content="{img('keepers.jpg')}">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="{NEWS_URL}">
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"NewsArticle","headline":"The lighthouse keepers of Kestrel Rock","author":{{"@type":"Person","name":"Priya Sharma"}},"datePublished":"2026-11-20T07:30:00+00:00","publisher":{{"@type":"Organization","name":"The Coastal Gazette"}}}}</script>
<style>body{{font-family:sans-serif}} .ad-slot{{background:#eee}}</style><script>window.dataLayer=[];</script>
</head><body>
<div class="cookie-banner" id="cookies">We use cookies to improve your experience. <button>Accept all</button> <button>Settings</button></div>
<header class="site-header"><a href="/" class="logo"><img src="{img('logo.png')}" alt="The Coastal Gazette"></a>
<nav class="main-nav"><ul><li><a href="/news">News</a></li><li><a href="/sport">Sport</a></li><li><a href="/weather">Weather</a></li><li><a href="/opinion">Opinion</a></li><li><a href="/account">Sign in</a></li></ul></nav></header>
<div class="ad-slot ad-top">ADVERTISEMENT <a href="https://ads.example/click">Buy a boat today</a></div>
<main class="layout"><article class="story">
<h1 class="headline">The lighthouse keepers of Kestrel Rock</h1>
<p class="byline">By <a href="/authors/priya-sharma" rel="author">Priya Sharma</a> · <time datetime="2026-11-20T07:30:00Z">20 November 2026</time></p>
<div class="share-bar"><a href="https://social.example/share">Share on Social</a> <a href="mailto:?subject=x">Share on Email</a></div>
<figure class="lead-image"><img src="{img('keepers.jpg')}" alt="The lighthouse on Kestrel Rock at dusk" width="800" height="500"><figcaption>The lighthouse on Kestrel Rock, kept by hand until 1961.</figcaption></figure>
<div class="story-body">
{para(s[0], s[1])}
{para(s[2], s[3])}
<div class="ad-slot ad-inline">ADVERTISEMENT <a href="https://ads.example/click2">Insure your cottage</a></div>
<h2>A life on the rock</h2>
{para(s[4], s[5])}
{para(s[6])}
<blockquote><p>{s[7]}</p></blockquote>
<picture><source type="image/webp" srcset="{img('lamp.webp')}"><img src="{img('lamp.jpg')}" alt="The old lamp" width="640" height="400"></picture>
<ul><li>Trim the wick at dusk and at midnight.</li><li>Polish the lens every morning.</li><li>Clean the brass on Saturdays.</li></ul>
<form class="newsletter" action="/subscribe"><p>Subscribe to our newsletter for the week's best stories.</p><input type="email" placeholder="Your e-mail"><button>Subscribe</button></form>
<h2>The last keepers</h2>
{para(s[8], f'The ledgers record it in a single line.<sup><a href="#fn1" id="r1">1</a></sup>')}
<table><thead><tr><th>Year</th><th>Keeper</th></tr></thead><tbody><tr><td>1893</td><td>Thomas Ellison</td></tr><tr><td>1961</td><td>John Ellison</td></tr></tbody></table>
<p><img loading="lazy" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="{img('ledger.jpg')}" alt="A page of the ledger"></p>
{para(s[9], s[10])}
<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/abc123XYZ" title="Kestrel Rock from the air" allowfullscreen></iframe>
<ol class="footnotes"><li id="fn1">Harbour office, ledger 14, page 202. <a href="#r1">↩</a></li></ol>
</div></article>
<aside class="sidebar"><h3>Most read</h3><ol><li><a href="/a">Ferry timetable changes</a></li><li><a href="/b">Harbour wall repairs</a></li><li><a href="/c">Gazette Weather Desk: a wet weekend</a></li></ol></aside>
</main>
<section class="comments"><h3>Comments (3)</h3><div class="comment">Great article, thank you for this.</div><div class="comment">My great-uncle kept the light too.</div></section>
<footer class="site-footer"><p>© 2026 The Coastal Gazette. All rights reserved.</p><p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></footer>
<img src="{img('pixel.gif')}" width="1" height="1" alt="">
</body></html>
'''

def blog_html(img):
    s = BLOG_SENT
    icon = '<svg class="w-4 h-4" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v12H2z"/></svg>'
    return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Profiling Rust code with flamegraphs – Ferris Notes</title>
<meta property="og:site_name" content="Ferris Notes"><meta name="author" content="Anika Rao"><meta property="article:published_time" content="2026-10-05T09:00:00Z">
<meta property="og:title" content="Profiling Rust code with flamegraphs">
</head><body class="bg-white text-slate-900 antialiased">
<header class="sticky top-0 z-50 flex items-center justify-between px-4 py-2 shadow"><a href="/" class="font-bold">{icon} Ferris Notes</a><button class="p-2" aria-label="Toggle theme">{icon} Toggle theme</button></header>
<div class="mx-auto max-w-3xl px-4 scroll-mt-2">
<main id="content" class="prose prose-slate lg:prose-lg scroll-mt-2">
<h1 class="text-3xl font-extrabold tracking-tight">Profiling Rust code with flamegraphs</h1>
<p class="text-sm text-slate-500">Anika Rao · 5 October 2026 · 6 min read</p>
{para(s[0], s[1])}
<img class="rounded-xl shadow" src="{img('hero-400.jpg')}" srcset="{img('hero-400.jpg')} 400w, {img('hero-800.jpg')} 800w, {img('hero-1600.jpg')} 1600w" sizes="(max-width: 800px) 100vw, 800px" alt="A flamegraph of the server">
<h2 id="recording" class="group scroll-mt-20">Recording a profile <a href="#recording" class="opacity-0 group-hover:opacity-100">#</a></h2>
{para(s[2])}
<div class="relative overflow-hidden md:hidden rounded-lg bg-slate-900"><pre class="overflow-x-auto p-4 text-sm"><code class="language-rust">{BLOG_CODE}</code></pre></div>
<ol start="3"><li>Build with <code>--release</code>.</li><li>Run under <code>perf record -g</code>.</li><li>Fold the stacks and draw the graph.</li></ol>
<h2>Reading the graph</h2>
{para(s[3], s[4])}
<p><img src="{img('chart.png')}" alt="Time per request before and after"></p>
{para(s[5])}
<h3>Other views</h3>
{para(s[6])}
<dl><dt>Self time</dt><dd>The time spent in the function itself.</dd><dt>Total time</dt><dd>The time spent in it and everything it calls.</dd></dl>
<p><img src="{img('anim.gif')}" alt="The two profiles side by side"></p>
<p><img src="{img('diagram.svg')}" alt="Where the time went"></p>
<p><img src="{img('wide.jpg')}" alt="The whole flamegraph"></p>
{para(s[7])}
<img src="{img('pixel.gif')}" width="1" height="1" alt="">
</main>
<aside class="mt-12 border-t pt-6"><h2 class="text-xl font-bold">Related posts</h2><ul class="grid grid-cols-2 gap-4"><li><a href="/posts/a">Benchmarking with criterion</a></li><li><a href="/posts/b">Async without tears</a></li></ul>
<p><a href="https://github.example/ferris/notes/edit/main/flamegraphs.md">Edit this page on GitHub</a></p>
<form><input type="email"><button>Subscribe</button></form><div id="comments"><h3>Join the discussion</h3></div></aside>
</div></body></html>
'''

def fr_html(img):
    s = FR_SENT
    return f'''<!DOCTYPE html>
<html lang="fr"><head><meta charset="windows-1252"><title>Le phare de Cordouan, roi des phares - Le Journal du Littoral</title>
<meta property="og:site_name" content="Le Journal du Littoral"><meta name="author" content="Claire Dubois"><meta property="article:published_time" content="2026-09-14T06:00:00+02:00">
</head><body><div class="pub">PUBLICITÉ</div><nav><a href="/">Accueil</a> <a href="/culture">Culture</a> <a href="/abonnement">Abonnez-vous</a></nav>
<article><h1>Le phare de Cordouan, roi des phares</h1><p class="auteur">Par Claire Dubois</p>
{para(s[0], s[1])}<figure><img src="{img('cordouan.jpg')}" alt="Le phare au coucher du soleil"><figcaption>Le phare de Cordouan au large de la Gironde.</figcaption></figure>
{para(s[2])}{para(s[3], s[4])}</article><aside><h3>Les plus lus</h3><ul><li><a href="/a">Marées d’automne</a></li></ul></aside></body></html>
'''

HOME_URL = 'https://coastal-gazette.example/'
def home_html(img):
    items = ''.join(f'<li class="teaser"><a href="/2026/11/{i:02d}/story-{i}"><img src="{img("logo.png")}" alt=""><h3>Headline number {i}</h3></a><p>A short teaser.</p></li>' for i in range(1, 25))
    return f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>The Coastal Gazette — News from the coast</title></head><body>
<header><nav><a href="/news">News</a> <a href="/sport">Sport</a></nav></header><main><h1>Latest</h1><ul class="grid">{items}</ul></main><footer>© 2026</footer></body></html>
'''

def pictures():
    return {
        'logo.png': png_alpha(120, 60), 'keepers.jpg': jpeg(800, 500, (70, 90, 120), (230, 60, 50)), 'lamp.webp': webp(640, 400, (40, 60, 40), (240, 200, 60)),
        'lamp.jpg': jpeg(640, 400, (40, 60, 40), (240, 200, 60)), 'ledger.jpg': jpeg(600, 800, (200, 190, 160), (60, 60, 60)), 'pixel.gif': PIXEL,
        'hero-400.jpg': jpeg(400, 225, (30, 30, 30), (250, 120, 30)), 'hero-800.jpg': jpeg(800, 450, (30, 30, 30), (250, 120, 30)), 'hero-1600.jpg': jpeg(1600, 900, (30, 30, 30), (250, 120, 30)),
        'chart.png': png_alpha(560, 320), 'anim.gif': gif(200, 100), 'diagram.svg': SVG, 'wide.jpg': jpeg(3000, 1500, (120, 40, 40), (40, 200, 200), q=40),
        'cordouan.jpg': jpeg(700, 460, (200, 120, 60), (40, 40, 120)),
    }

PAGES = {
    # name: (url, html maker, the pictures of the article in order — as the article shows them, the base of their addresses)
    'news': (NEWS_URL, news_html, ['keepers.jpg', 'lamp.jpg', 'ledger.jpg'], 'https://coastal-gazette.example/media/'),
    'blog': (BLOG_URL, blog_html, ['hero-800.jpg', 'chart.png', 'anim.gif', 'diagram.svg', 'wide.jpg'], 'https://cdn.ferris-notes.example/img/'),
    'fr': (FR_URL, fr_html, ['cordouan.jpg'], 'https://journal-littoral.example/images/'),
    'home': (HOME_URL, home_html, [], 'https://coastal-gazette.example/media/'),
}
TYPES = {'jpg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml'}

def encoded(name, html): return html.encode('cp1252') if name == 'fr' else html.encode('utf-8')

def main():
    os.makedirs(OUT, exist_ok=True)
    pics = pictures()
    # the site as a server would give it (the Node script serves it to Chromium for the MHTML)
    site = os.path.join(OUT, 'site')
    for name, (url, make, _, base) in PAGES.items():
        html = make(lambda n: base + n)
        d = os.path.join(site, name); os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, 'index.html'), 'wb') as f: f.write(encoded(name, html))
        # HTML only: the page as it came, its pictures on the website
        with open(os.path.join(OUT, f'{name}.html'), 'wb') as f: f.write(encoded(name, html))
        # Chrome's "Webpage, Complete": "saved from", the pictures in "<title>_files" beside the page
        title = {'news': 'The lighthouse keepers of Kestrel Rock', 'blog': 'Profiling Rust code with flamegraphs', 'fr': 'Le phare de Cordouan', 'home': 'The Coastal Gazette'}[name]
        folder = f'{title}_files'
        comp = os.path.join(OUT, 'complete', name); os.makedirs(os.path.join(comp, folder), exist_ok=True)
        # Chrome writes the folder's name as it is (spaces and all); written escaped for two of the pages
        rel = lambda n: './' + (folder if name == 'news' else folder.replace(' ', '%20')) + '/' + n
        saved = make(rel).replace('<!DOCTYPE html>', f'<!DOCTYPE html>\n<!-- saved from url=({len(url):04d}){url} -->', 1)
        with open(os.path.join(comp, f'{title}.html'), 'wb') as f: f.write(encoded(name, saved))
        used = sorted({n for n in pics if (base + n) in html})
        for n in used:
            with open(os.path.join(comp, folder, n), 'wb') as f: f.write(pics[n])
            with open(os.path.join(d, n), 'wb') as f: f.write(pics[n])
        # Safari's web archive: the page and the pictures it showed — the WebP of a <picture>, the largest of a srcset (a
        # Retina screen); a picture that a script would have loaded (data-src) never loaded
        subs = [{'WebResourceData': pics[n], 'WebResourceMIMEType': TYPES[n.rsplit('.', 1)[1]], 'WebResourceURL': base + n,
                 'WebResourceResponse': b'bplist00-not-read'} for n in used if n not in ('ledger.jpg', 'lamp.jpg', 'hero-400.jpg', 'hero-800.jpg')]
        archive = {'WebMainResource': {'WebResourceData': encoded(name, html), 'WebResourceFrameName': '', 'WebResourceMIMEType': 'text/html',
                                       'WebResourceTextEncodingName': 'windows-1252' if name == 'fr' else 'UTF-8', 'WebResourceURL': url},
                   'WebSubresources': subs}
        with open(os.path.join(OUT, f'{name}.webarchive'), 'wb') as f: plistlib.dump(archive, f, fmt=plistlib.FMT_BINARY, sort_keys=False)
    index = {
        'news': {'url': NEWS_URL, 'title': 'The lighthouse keepers of Kestrel Rock', 'author': 'Priya Sharma', 'site': 'The Coastal Gazette', 'date': '2026-11-20', 'lang': 'en-GB', 'sentences': NEWS_SENT, 'not': NEWS_NOT, 'pictures': PAGES['news'][2], 'lead': 'keepers.jpg', 'embeds': 1, 'canonical': True},
        'blog': {'url': BLOG_URL, 'title': 'Profiling Rust code with flamegraphs', 'author': 'Anika Rao', 'site': 'Ferris Notes', 'date': '2026-10-05', 'lang': 'en', 'sentences': BLOG_SENT[:3] + [BLOG_CODE] + BLOG_SENT[3:], 'not': BLOG_NOT, 'pictures': PAGES['blog'][2]},
        'fr': {'url': FR_URL, 'title': 'Le phare de Cordouan, roi des phares', 'author': 'Claire Dubois', 'site': 'Le Journal du Littoral', 'date': '2026-09-14', 'lang': 'fr', 'sentences': FR_SENT, 'not': FR_NOT, 'pictures': PAGES['fr'][2]},
        'home': {'url': HOME_URL, 'title': 'The Coastal Gazette — News from the coast', 'article': False},
        'complete': {'news': 'The lighthouse keepers of Kestrel Rock', 'blog': 'Profiling Rust code with flamegraphs', 'fr': 'Le phare de Cordouan', 'home': 'The Coastal Gazette'},
    }
    with open(os.path.join(OUT, 'index.json'), 'w') as f: json.dump(index, f, indent=1, ensure_ascii=False)
    print('pages, pictures, web archives and saved folders in', os.path.relpath(OUT))

def reference():
    """Every part of every MHTML (Python's email package) and web archive (plistlib): type, address, SHA-256."""
    ref = {}
    for f in sorted(os.listdir(OUT)):
        p = os.path.join(OUT, f)
        if f.endswith('.mhtml'):
            with open(p, 'rb') as fh: msg = email.message_from_binary_file(fh, policy=email.policy.compat32)
            parts = []
            for part in msg.walk():
                if part.is_multipart(): continue
                data = part.get_payload(decode=True) or b''
                parts.append({'type': part.get_content_type(), 'url': (part.get('Content-Location') or '').strip(), 'sha256': hashlib.sha256(data).hexdigest(), 'len': len(data)})
            ref[f] = {'url': (msg.get('Snapshot-Content-Location') or '').strip(), 'parts': parts}
        elif f.endswith('.webarchive'):
            with open(p, 'rb') as fh: a = plistlib.load(fh)
            res = [a['WebMainResource']] + a.get('WebSubresources', [])
            ref[f] = {'url': a['WebMainResource']['WebResourceURL'], 'parts': [{'type': r['WebResourceMIMEType'], 'url': r['WebResourceURL'], 'sha256': hashlib.sha256(r['WebResourceData']).hexdigest(), 'len': len(r['WebResourceData'])} for r in res]}
    with open(os.path.join(OUT, 'reference.json'), 'w') as f: json.dump(ref, f, indent=1)
    print('reference.json:', ', '.join(f'{k} {len(v["parts"])} parts' for k, v in ref.items()))

if __name__ == '__main__':
    reference() if '--reference' in sys.argv else main()
