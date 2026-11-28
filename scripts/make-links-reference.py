# make-links-reference.py — the independent readings the link checker (devcore-links.wasm, wasm/devcore/src/links.rs) is held to
# by tests/unit/links.test.mjs → tests/fixtures/links/reference.json:
#   psl       — the Public Suffix List as the Python package publicsuffixlist reads it (its own copy of the list, which must be
#               the one the psl crate was made from: the suite checks the list's VERSION line): each host's public suffix,
#               registrable domain, and both again with the ICANN section alone (a service's suffix — github.io — is in the
#               list's PRIVATE section);
#   skeleton  — UTS #39 skeletons made here from Unicode's own confusables.txt of the version the unicode-security crate was made
#               from (18.0.0, unicode-org/unicodetools at a pinned commit, SHA-256 checked): NFD, each character's prototype,
#               NFD again; and as ICU makes them (PyICU's SpoofChecker.getSkeleton, ICU 74: Unicode 15.1) — with whether every
#               character of the text maps alike in 15.1 and 18.0 (then ICU's skeleton must be ours too);
#               each text's restriction level by ICU, its identifier profile set to UTS #39's (IdentifierStatus.txt 18.0.0: the
#               characters "Allowed"; ICU's default allows every character): the least of ICU's levels its check accepts.
# Needs: pip install publicsuffixlist; PyICU (apt install python3-icu — run with the Python that has both, e.g.
# /usr/bin/python3.12 -I scripts/make-links-reference.py). Fetches the three Unicode files into node_modules/.cache/superutils-links.
import hashlib, json, os, sys, unicodedata, urllib.request
from pathlib import Path

import icu
import publicsuffixlist
from publicsuffixlist import PublicSuffixList

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/fixtures/links/reference.json'
CACHE = ROOT / 'node_modules/.cache/superutils-links'
UTOOLS = '013a5971c6dd7b2129a4048a58a0db38d289f2dd'  # github.com/unicode-org/unicodetools, main on 28 Nov 2026
FILES = {
    '18.0.0/confusables.txt': '6ed3ee967c9dfdf6677d563c9985182fbc50a2efb7d6059cd57b2e2ce18f5b92',
    '15.1.0/confusables.txt': '8289f833e4cf78fde56b2080dc0e42934ef5182c9c3f4dd1fbdf2bced69fd5ed',
    '18.0.0/IdentifierStatus.txt': '5863c7d99ca18f213c41c7318aa5528bebfb6d32ec0f1d5944e37192c119aebd',
}


def unicode_file(name):
    path = CACHE / name.replace('/', '_')
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        url = f'https://raw.githubusercontent.com/unicode-org/unicodetools/{UTOOLS}/unicodetools/data/security/{name}'
        path.write_bytes(urllib.request.urlopen(url, timeout=60).read())
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != FILES[name]:
        path.unlink()
        sys.exit(f'{name}: not the file pinned here')
    return data.decode('utf-8-sig')


def confusables(text):
    m = {}
    for line in text.splitlines():
        line = line.split('#', 1)[0].strip()
        if not line:
            continue
        src, dst = [x.strip() for x in line.split(';')[:2]]
        m[chr(int(src, 16))] = ''.join(chr(int(c, 16)) for c in dst.split())
    return m


def allowed(text):
    out = []
    for line in text.splitlines():
        line = line.split('#', 1)[0].strip()
        if not line or 'Allowed' not in line:
            continue
        r = line.split(';')[0].strip()
        a, b = (r.split('..') + [r])[:2]
        out.append((int(a, 16), int(b, 16)))
    return out


C18 = confusables(unicode_file('18.0.0/confusables.txt'))
C15 = confusables(unicode_file('15.1.0/confusables.txt'))
ALLOWED = allowed(unicode_file('18.0.0/IdentifierStatus.txt'))


def skeleton(t, table):
    return unicodedata.normalize('NFD', ''.join(table.get(c, c) for c in unicodedata.normalize('NFD', t)))

HOSTS = [
    # banks, shops, government
    'www.hdfcbank.com', 'netbanking.hdfcbank.com', 'www.onlinesbi.sbi', 'sbi.co.in', 'www.sbi.bank.in', 'retail.onlinesbi.sbi.bank.in',
    'www.icicibank.com', 'www.amazon.in', 'amazon.co.uk', 'www.flipkart.com', 'dl.flipkart.com', 'www.irctc.co.in', 'uidai.gov.in',
    'myaadhaar.uidai.gov.in', 'incometax.gov.in', 'www.gov.uk', 'pmkisan.gov.in', 'x.nic.in', 'x.mil.in', 'x.ac.in', 'x.res.in',
    'x.edu.in', 'x.fin.in', 'bank.in', 'gov.in', 'co.in', 'firm.in', 'x.firm.in', 'x.gen.in', 'x.ind.in', 'x.org.in', 'x.net.in',
    # services anyone can make a site on (the list's private section)
    'x.github.io', 'github.io', 'sbi-kyc.web.app', 'x.firebaseapp.com', 'x.blogspot.com', 'x.blogspot.in', 'x.vercel.app',
    'x.netlify.app', 'x.pages.dev', 'x.workers.dev', 'a.b.workers.dev', 'x.herokuapp.com', 'x.azurewebsites.net', 'x.r2.dev',
    'x.glitch.me', 'x.000webhostapp.com', 'x.weebly.com', 'x.wixsite.com', 'x.myshopify.com', 'x.ngrok-free.app',
    'x.trycloudflare.com', 'x.s3.amazonaws.com', 'bucket.s3.ap-south-1.amazonaws.com', 'x.appspot.com', 'x.duckdns.org',
    'x.ddns.net', 'x.repl.co', 'sites.google.com', 'x.translate.goog', 'x.onrender.com', 'x.fly.dev', 'x.surge.sh',
    # endings
    'hdfcbank.com.verify-kyc.top', 'x.xyz', 'x.shop', 'x.icu', 'x.cc', 'x.co', 'x.io', 'x.in', 'x.top', 'x.live', 'x.online',
    'x.site', 'x.click', 'x.link', 'x.info', 'x.edu', 'x.gov', 'x.example', 'x.localhost', 'example.unknowntld', 'localhost',
    'a.b.c.d.e.example.com', 'www.ck', 'x.ck', 'a.x.ck', 'city.kobe.jp', 'x.city.kobe.jp', 'x.kobe.jp', 'tokyo.jp', 'x.tokyo.jp',
    'a.pvt.k12.ma.us', 'x.compute.amazonaws.com', 'ec2-1-2-3-4.compute-1.amazonaws.com', 'x.co.uk', 'x.uk', 'x.com.au',
    # letters outside A – Z (as they travel: punycode)
    'xn--80ak6aa92e.com', 'xn--pypal-4ve.com', 'xn--h2brj9c', 'xn--i1b6b1a6a2e.xn--h2brj9c', 'xn--fiqs8s', 'x.xn--fiqs8s',
    'xn--fsqu00a.xn--fiqs8s', 'xn--mgbaam7a8h', 'x.xn--mgbaam7a8h', 'xn--p1ai', 'xn--e1afmkfd.xn--p1ai', 'xn--90ae',
    'xn--hdfcbnk-2nf.com', 'xn--mazon-3ve.in', 'xn--flipkrt-ynf.com',
]

# texts for the skeletons and restriction levels: brands as written, look-alikes, scripts
TEXTS = [
    'paytm', 'paytrn', 'paypal', 'pаypal', 'раураl', 'hdfcbank', 'hdfcbаnk', 'hdfcbαnk', 'icicibank', 'icicіbank', 'ici1cibank',
    'flipkart', 'flipkаrt', 'fIipkart', 'amazon', 'аmаzоn', 'amaz0n', 'arnazon', 'google', 'g00gle', 'goog1e', 'googIe',
    'microsoft', 'rnicrosoft', 'whatsapp', 'whatsаpp', 'vvhatsapp', 'phonepe', 'ρhonepe', 'phonеpe', 'irctc', 'ⅰrctc', 'ｐａｙｔｍ',
    'sbi', 'sbі', 'onlinesbi', 'onIinesbi', 'apple', 'аррlе', 'netflix', 'netflіx', 'lic', 'Iic', '1ic', 'uidai', 'uidaі',
    'incometax', 'lncometax', 'axisbank', 'аxisbank', 'kotak', 'kоtak', 'bankofbaroda', 'bank0fbaroda', 'cleartrip', 'c1eartrip',
    'पंजाब', 'भारत', 'भारतpay', 'пример', 'testпример', 'xn', '日本語', '日本語abc', 'テスト', '한국어', '中国', '例子', 'عربي',
    'abc123', 'abc-123', 'a-b', 'ǀnstagram', 'İnstagram', 'ınstagram', 'instagrаm', 'facebook', 'faceb00k', 'facebооk',
    'yοutube', 'youtube', 'yоutube', 'linkedin', 'Iinkedin', 'linkedіn', 'twitter', 'twіtter', 'tvvitter', 'dhl', 'dhI', 'fedex',
    'fedеx', 'bluedart', 'b1uedart', 'swiggy', 'swіggy', 'zomato', 'zоmato', 'meesho', 'meеsho', 'myntra', 'myntrа',
]

LEVELS = [('ASCIIOnly', icu.URestrictionLevel.ASCII), ('SingleScript', icu.URestrictionLevel.SINGLE_SCRIPT_RESTRICTIVE),
          ('HighlyRestrictive', icu.URestrictionLevel.HIGHLY_RESTRICTIVE),
          ('ModeratelyRestrictive', icu.URestrictionLevel.MODERATELY_RESTRICTIVE),
          ('MinimallyRestrictive', icu.URestrictionLevel.MINIMALLY_RESTRICTIVE)]


PROFILE = icu.UnicodeSet()
for a, b in ALLOWED:
    PROFILE.add(chr(a), chr(b))


def level(text):
    for name, lv in LEVELS:
        sc = icu.SpoofChecker()
        sc.setAllowedUnicodeSet(PROFILE)
        sc.setChecks(icu.USpoofChecks.RESTRICTION_LEVEL)
        sc.setRestrictionLevel(lv)
        if not (sc.check(text) & icu.USpoofChecks.RESTRICTION_LEVEL):
            return name
    return 'Unrestricted'


def main():
    dat = Path(os.path.dirname(publicsuffixlist.__file__)) / 'public_suffix_list.dat'
    version = next(l.split('VERSION:')[1].strip() for l in dat.read_text(encoding='utf-8').splitlines() if 'VERSION:' in l)
    full, icann = PublicSuffixList(), PublicSuffixList(only_icann=True)
    psl = []
    for h in HOSTS:
        psl.append({'host': h, 'suffix': full.publicsuffix(h), 'site': full.privatesuffix(h),
                    'icannSuffix': icann.publicsuffix(h), 'icannSite': icann.privatesuffix(h)})
    sc = icu.SpoofChecker()
    nfd = lambda t: unicodedata.normalize('NFD', t)
    skel = [{'text': t, 'skeleton': skeleton(t, C18), 'icu': sc.getSkeleton(0, t),
             'stable': all(C18.get(c, c) == C15.get(c, c) for c in nfd(t)), 'level': level(t),
             'odd': [c for c in t if not any(a <= ord(c) <= b for a, b in ALLOWED)]} for t in TEXTS]
    OUT.write_text(json.dumps({'pslVersion': version, 'publicsuffixlist': publicsuffixlist.__version__ if hasattr(publicsuffixlist, '__version__') else None,
                               'icu': icu.ICU_VERSION, 'icuUnicode': icu.UNICODE_VERSION, 'unicodeData': '18.0.0', 'unicodetools': UTOOLS, 'psl': psl, 'skeleton': skel},
                              ensure_ascii=False, indent=0) + '\n', encoding='utf-8')
    print(len(psl), 'hosts,', len(skel), 'texts →', OUT, '(list', version + ')')


main()
