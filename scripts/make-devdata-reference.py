#!/usr/bin/env python3
"""Reference answers for the small developer tabs (Base64, URL encoder, Epoch converter, UUID, Color converter, JWT,
XML formatter), made with independent implementations: Python's base64, urllib.parse, datetime + zoneinfo, uuid,
colorsys, PyJWT and lxml. Seeded, so the output is the same on every run.

    python3 scripts/make-devdata-reference.py        # writes tests/fixtures/devdata/reference.json

Used by tests/unit/devdata.test.mjs and the e2e suites of those tabs. Needs: pip install pyjwt lxml tzdata."""
import base64, colorsys, datetime as dt, json, math, os, random, urllib.parse, uuid, zoneinfo
import jwt
from lxml import etree

R = random.Random(20261117)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'devdata', 'reference.json')

WORDS = ['chai', 'samosa', 'मुंबई', 'नमस्ते', 'café', 'naïve', '東京', '😀', 'a&b', 'x=y', '50%', 'c++', 'a b', 'q?', '#tag', 'path/to', "it's", '(ok)', 'tilde~', 'star*', 'excl!', 'Ünï', '€', '£', 'рус', 'عربى', '\t', 'line\nbreak', '"quote"', '<tag>', 'semi;colon', 'at@sign', 'dollar$', 'comma,', 'plus+', '[br]', '{cu}', '|pipe', '\\back', '^hat', '`tick']


def rand_text(n):
    return ' '.join(R.choice(WORDS) for _ in range(n)) if R.random() < 0.7 else ''.join(R.choice(WORDS) for _ in range(n))


# ------------------------------------------------------------------ Base64
def b64_cases():
    rows = []
    for i in range(90):
        n = R.choice([0, 1, 2, 3, 4, 5, 16, 31, 57, 58, 100, 255, 400])
        data = bytes(R.randrange(256) for _ in range(n)) if i % 3 else rand_text(R.randrange(1, 8)).encode()
        std = base64.b64encode(data).decode()
        rows.append({
            'hex': data.hex(), 'std': std, 'url': base64.urlsafe_b64encode(data).decode().rstrip('='),
            # the same bytes as they turn up: MIME line breaks, URL-safe with padding, percent-encoded, no padding, a data: URL
            'messy': [base64.encodebytes(data).decode(), base64.urlsafe_b64encode(data).decode(), urllib.parse.quote(std, safe=''), std.rstrip('='),
                      'data:application/octet-stream;base64,' + std, ' ' + ' '.join(std[j:j + 4] for j in range(0, len(std), 4)) + '\r\n'],
        })
    return rows


# ------------------------------------------------------------------ URL
def url_cases():
    rows = []
    for _ in range(160):
        s = rand_text(R.randrange(1, 7))
        comp = urllib.parse.quote(s, safe="!~*'()")  # what encodeURIComponent leaves alone
        rows.append({'text': s, 'component': comp, 'form': comp.replace('%20', '+')})
    legacy = []
    for s in ['café', 'naïve façade', 'Ünïcödé', '£100 & €5', 'señor ¿qué?', 'Zoë — “quoted”', 'ß', '©2026', 'crème brûlée 50%']:
        legacy.append({'text': s, 'cp1252': urllib.parse.quote(s, safe='', encoding='cp1252'), 'utf8': urllib.parse.quote(s, safe='')})
    return {'random': rows, 'legacy': legacy}


# ------------------------------------------------------------------ Epoch
ZONES = ['Asia/Kolkata', 'America/St_Johns', 'Pacific/Chatham', 'Europe/London', 'America/New_York', 'UTC']
EPOCH = dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)


def iso_ms(ns):
    """ISO 8601 in UTC with milliseconds, as JavaScript's toISOString writes it (floor to the millisecond)."""
    ms = ns // 1_000_000
    d = EPOCH + dt.timedelta(milliseconds=ms)
    return d.strftime('%Y-%m-%dT%H:%M:%S.') + f'{ms % 1000:03d}Z'


def iso_local(ms, zone):
    d = (EPOCH + dt.timedelta(milliseconds=ms)).astimezone(zoneinfo.ZoneInfo(zone))
    off = d.utcoffset().total_seconds() / 60
    frac = f'.{ms % 1000:03d}' if ms % 1000 else ''
    return d.strftime('%Y-%m-%dT%H:%M:%S') + frac + ('+' if off >= 0 else '-') + f'{int(abs(off)) // 60:02d}:{int(abs(off)) % 60:02d}'


def epoch_cases():
    rows = []
    for i in range(120):
        # instants between 1973 (so that milliseconds have 12+ digits... the unit rule) and 2200, with nanoseconds
        ns = R.randrange(100_000_000_000 * 10**6 if i % 4 else 0, 7_258_118_400 * 10**9)
        if i % 5 == 0:
            ns -= ns % 10**9  # whole seconds
        ms = ns // 10**6
        rows.append({
            's': str(ns // 10**9), 'ms': str(ms), 'us': str(ns // 1000), 'ns': str(ns), 'iso': iso_ms(ns), 'isoSeconds': iso_ms((ns // 10**9) * 10**9),
            'restUs': str(ns // 1000 % 1000).zfill(3).rstrip('0'), 'restNs': str(ns % 10**6).zfill(6).rstrip('0'),
            'local': {z: iso_local(ms, z) for z in ZONES},
        })
    # day/month/year strings written in a zone → the instant
    dmy = []
    for _ in range(40):
        z = R.choice(ZONES)
        d = dt.datetime(R.randrange(1975, 2100), R.randrange(1, 13), R.randrange(1, 29), R.randrange(0, 24), R.randrange(0, 60), R.randrange(0, 60), tzinfo=zoneinfo.ZoneInfo(z))
        if d.astimezone(dt.timezone.utc).astimezone(zoneinfo.ZoneInfo(z)).replace(tzinfo=None) != d.replace(tzinfo=None):
            continue  # a time that does not exist (spring forward)
        if d.replace(fold=1).utcoffset() != d.utcoffset():
            continue  # a time that happens twice (autumn)
        dmy.append({'zone': z, 'text': d.strftime('%d/%m/%Y %H:%M:%S'), 'dashes': d.strftime('%d-%m-%Y %H:%M'), 's': int(d.timestamp()), 'sMinute': int(d.replace(second=0).timestamp())})
    return {'instants': rows, 'dmy': dmy}


# ------------------------------------------------------------------ UUID
VARIANT = {uuid.RESERVED_NCS: 'NCS', uuid.RFC_4122: 'RFC', uuid.RESERVED_MICROSOFT: 'Microsoft', uuid.RESERVED_FUTURE: 'reserved'}
GREG = 0x01b21dd213814000


def uuid_cases():
    rows = []

    def add(u, time_iso=None):
        row = {'text': str(u), 'variant': VARIANT[u.variant], 'version': u.version if u.variant == uuid.RFC_4122 else None}
        if u.variant == uuid.RFC_4122 and u.version == 1:
            row['time'] = iso_ms((u.time - GREG) * 100) if (u.time - GREG) * 100 // 10**6 >= -8.64e15 else None
            row['clockSeq'] = u.clock_seq
            row['node'] = ':'.join(f'{u.node:012x}'[i:i + 2] for i in range(0, 12, 2))
        if time_iso:
            row['time'] = time_iso
        rows.append(row)

    for _ in range(40):
        ts = GREG + R.randrange(0, 7_258_118_400 * 10**7)  # 1970 … 2200 in 100 ns ticks
        add(uuid.UUID(fields=(ts & 0xffffffff, (ts >> 32) & 0xffff, ((ts >> 48) & 0x0fff) | 0x1000, 0x80 | R.randrange(64), R.randrange(256), R.randrange(1 << 48))))
    for i in range(15):
        add(uuid.uuid3(uuid.NAMESPACE_DNS, f'host{i}.example.in')); add(uuid.uuid5(uuid.NAMESPACE_URL, f'https://example.in/{i}'))
    for _ in range(30):
        add(uuid.UUID(int=R.getrandbits(128), version=4))
    for _ in range(25):  # version 7: 48-bit Unix milliseconds in front
        ms = R.randrange(0, 7_258_118_400_000)
        n = ((ms << 80) | R.getrandbits(80)) & ~(0xf << 76) & ~(0x3 << 62) | (0x7 << 76) | (0x2 << 62)  # version 7, RFC variant (Python < 3.14 cannot make one)
        u = uuid.UUID(int=n)
        add(u, iso_ms(ms * 10**6))
    for _ in range(25):  # version 6: the version-1 timestamp with its bits in sorting order
        ts = GREG + R.randrange(0, 7_258_118_400 * 10**7)
        hi, mid, lo = ts >> 28, (ts >> 12) & 0xffff, ts & 0xfff
        u = uuid.UUID(fields=(hi, mid, 0x6000 | lo, 0x80 | R.randrange(64), R.randrange(256), R.randrange(1 << 48)))
        rows.append({'text': str(u), 'variant': 'RFC', 'version': 6, 'time': iso_ms((ts - GREG) * 100), 'clockSeq': u.clock_seq, 'node': ':'.join(f'{u.node:012x}'[i:i + 2] for i in range(0, 12, 2))})
    for _ in range(20):  # other variants: random bits, any variant nibble
        add(uuid.UUID(int=R.getrandbits(128)))
    return rows


# ------------------------------------------------------------------ Colour
def srgb_lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def oklch(r, g, b):
    """sRGB → OKLCH after Björn Ottosson's reference (https://bottosson.github.io/posts/oklab/)."""
    R_, G_, B_ = srgb_lin(r), srgb_lin(g), srgb_lin(b)
    l = (0.4122214708 * R_ + 0.5363325363 * G_ + 0.0514459929 * B_) ** (1 / 3)
    m = (0.2119034982 * R_ + 0.6806995451 * G_ + 0.1073969566 * B_) ** (1 / 3)
    s = (0.0883024619 * R_ + 0.2817188376 * G_ + 0.6299787005 * B_) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return [L * 100, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360]


def color_cases():
    rows = []
    fixed = [(0, 0, 0), (255, 255, 255), (255, 0, 0), (0, 255, 0), (0, 0, 255), (128, 128, 128), (79, 70, 229), (1, 2, 3), (254, 254, 255), (255, 255, 0), (0, 255, 255), (255, 0, 255)]
    for i in range(260):
        r, g, b = fixed[i] if i < len(fixed) else (R.randrange(256), R.randrange(256), R.randrange(256))
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        rows.append({'rgb': [r, g, b], 'hex': f'#{r:02x}{g:02x}{b:02x}', 'hsl': [h * 360, s * 100, l * 100], 'oklch': oklch(r, g, b)})
    return rows


# ------------------------------------------------------------------ JWT
def jwt_cases():
    rows = []
    now = 1794900000
    for i in range(40):
        claims = {'sub': f'user-{R.randrange(10**6)}', 'name': rand_text(2), 'iat': now - R.randrange(0, 10**6)}
        if i % 2:
            claims['exp'] = now + R.randrange(-10**6, 10**6)
        if i % 3 == 0:
            claims['nbf'] = now + R.randrange(-10**5, 10**5)
        if i % 4 == 0:
            claims['aud'] = ['web', 'mobile']; claims['roles'] = {'admin': bool(i % 8), 'level': i}
        if i % 5 == 0:
            claims['big'] = 12345678901234567890 + i
        alg = ['HS256', 'HS384', 'HS512'][i % 3]
        headers = {'kid': f'key-{i}'} if i % 2 else None
        token = jwt.encode(claims, f'secret-{i}-' + 'x' * 64, algorithm=alg, headers=headers)
        rows.append({'token': token, 'header': jwt.get_unverified_header(token), 'payload': claims, 'sigBytes': {'HS256': 32, 'HS384': 48, 'HS512': 64}[alg], 'alg': alg})
    unsigned = jwt.encode({'sub': 'nobody'}, None, algorithm='none')
    rows.append({'token': unsigned, 'header': jwt.get_unverified_header(unsigned), 'payload': {'sub': 'nobody'}, 'sigBytes': 0, 'alg': 'none'})
    return rows


# ------------------------------------------------------------------ XML
XML_DOCS = {
    'rss': '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>News &amp; views</title><atom:link href="https://example.in/feed" rel="self"/><item><title>One</title><description><![CDATA[<p>Hello <b>world</b></p>]]></description><pubDate>Tue, 17 Nov 2026 10:00:00 +0530</pubDate></item><item><title>Two</title><guid isPermaLink="false">2</guid></item></channel></rss>',
    'svg': '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><!-- a dot --><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs><circle cx="5" cy="5" r="4" fill="url(#g)"/><text x="1" y="9">A <tspan font-weight="bold">b</tspan> c</text></svg>',
    'soap': '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body><m:GetPrice xmlns:m="https://example.in/prices"><m:Item>Chai</m:Item><m:Qty>2</m:Qty></m:GetPrice></soap:Body></soap:Envelope>',
    'pom': '<?xml version="1.0"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n\n\n  <groupId>in.example</groupId><artifactId>app</artifactId>\n  <dependencies>\n    <dependency><groupId>junit</groupId><artifactId>junit</artifactId><version>4.13.2</version><scope>test</scope></dependency>\n  </dependencies>\n</project>\n',
    'plist': '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Name</key><string>Asha &amp; Co</string><key>Tags</key><array><string>a</string><string> b </string></array><key>On</key><true/></dict></plist>',
    'entities': '<!DOCTYPE note [<!ENTITY w "World"><!ENTITY copy "&#169;">]><note xml:lang="en"><to>&w; &amp; &copy; &#x1F600; &lt;tag&gt;</to><attr a="1&#10;2" b=\'say "hi"\' c="a &gt; b"/></note>',
    'mixed': '<article><p>Hello <b>bold</b> and <i>italic <u>nested</u></i>.</p><p>  leading and trailing  </p><p> </p><empty></empty><self/><ws> </ws></article>',
    'preserve': '<doc><pre xml:space="preserve">  <a> x </a>\n  <b/>\n</pre><code xml:space=\'preserve\'><x/> <y/></code><plain>   <z/>   </plain></doc>',
    'pi': '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="style.xsl"?><!-- before --><root><?php echo 1; ?><a/><!-- in --><b>t</b></root><!-- after -->',
    'deep': '<a>' * 60 + '<leaf>x</leaf>' + '</a>' * 60,
    'manifest': '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="in.example.app"><uses-permission android:name="android.permission.CAMERA"/><application android:label="@string/app" android:icon="@mipmap/ic"><activity android:name=".Main" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>',
    'hindi': '<सूची भाषा="हिन्दी"><वस्तु क्रम="१">चाय</वस्तु><वस्तु क्रम="२">समोसा &amp; चटनी</वस्तु></सूची>',
    'gt-in-attr': '<a title="1 > 0" data-x=\'<not a tag>\'><b note="/>"/><c>ok</c></a>',
    'cdata-only': '<s><![CDATA[a]]><![CDATA[]]></s>',
    'comments': '<r><!-- one --><!-- two --><a/><!----><b><!-- inside text -->t</b></r>',
}


def rand_xml(depth=0):
    name = R.choice(['a', 'b', 'item', 'row', 'ns:el', 'x-y', 'n1'])
    attrs = ''.join(f' {R.choice(["id", "k", "xml:lang", "data-v"])}{i}="{R.choice(["1", "a b", "x&amp;y", "&lt;", ""])}"' for i in range(R.randrange(3)))
    kind = R.random()
    if depth > 4 or kind < 0.2:
        return f'<{name}{attrs}/>' if R.random() < 0.5 else f'<{name}{attrs}>{R.choice(["text", " padded ", "a &amp; b", "", "x<![CDATA[<raw>]]>y"])}</{name}>'
    kids = [rand_xml(depth + 1) for _ in range(R.randrange(1, 4))]
    if kind < 0.45:  # mixed content
        return f'<{name}{attrs}>' + ''.join(R.choice(['t ', ' u', '']) + k for k in kids) + R.choice(['', ' tail']) + f'</{name}>'
    sep = R.choice(['', '\n', '  ', '\n\t', '\r\n  '])
    extra = R.choice(['', '<!-- c -->', '<?pi d?>'])
    return f'<{name}{attrs}>' + sep + sep.join(kids) + extra + sep + f'</{name}>'


def xml_cases():
    """Documents for the formatter tests (hand-written shapes of real formats + random trees); lxml only checks that
    each one is well-formed. The tests compare the formatted text with the source through a real XML parser."""
    rows = [{'name': k, 'src': v} for k, v in XML_DOCS.items()]
    for i in range(60):
        body = rand_xml()
        end = body.index('>')
        tag = body[:end]
        closing = '/' if tag.endswith('/') else ''
        src = R.choice(['', '<?xml version="1.0" encoding="UTF-8"?>\n']) + tag.rstrip('/') + ' xmlns:ns="urn:n"' + closing + body[end:]
        rows.append({'name': f'random{i}', 'src': src})
    out = []
    for r in rows:
        try:
            etree.fromstring(r['src'].encode(), etree.XMLParser(resolve_entities=True))
        except etree.XMLSyntaxError:
            continue  # the random generator can repeat an attribute name: not well-formed, skip
        out.append(r)
    return out


def main():
    ref = {'b64': b64_cases(), 'url': url_cases(), 'epoch': epoch_cases(), 'uuid': uuid_cases(), 'color': color_cases(), 'jwt': jwt_cases(), 'xml': xml_cases()}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(ref, f, ensure_ascii=False, separators=(',', ':'))
    print({k: (len(v) if isinstance(v, list) else {a: len(b) for a, b in v.items()}) for k, v in ref.items()}, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
