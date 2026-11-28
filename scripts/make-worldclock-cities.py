#!/usr/bin/env python3
"""The World Clock's cities (src/lib/worldcities.json), from GeoNames:

    python3 scripts/make-worldclock-cities.py          (pip install geonamescache==3.0.2)

GeoNames (geonames.org, CC BY 4.0 — the tab says so) as geonamescache 3.0.2 carries it: cities15000, countries, US states.
Kept: every city of 300,000 people and more, every country's capital, the largest city of every time zone (so that each zone
GeoNames uses has a city), and a few well-known smaller places people look for (EXTRA). Of two cities of one name in one country
and one zone the larger stays (the Chinese Suzhou of Anhui beside Jiangsu's); of one name in one country and two zones both stay,
named by their state. Ordered by population, largest first: the search gives ties to the larger city.

One line a city: "id|name|country|zone|lat|lon|state|aliases" — the id only where it is not the default (the name's letters and
digits, lower-case — accents dropped, ø as o, æ as ae … —, joined by "-", then "-" and the country in lower case:
"new-york-us", "tromso-no"); the zone as its number in "zones";
latitude and longitude to two decimals (about a kilometre: the sun's times move by seconds); the state a US state's code, a UK
nation's code, else empty; aliases separated by ",". tests/fixtures/worldclock/ids.json has every city's id as this script makes
it, and the unit suite makes them again in TypeScript.
"""
import json, re, unicodedata
from collections import defaultdict
from pathlib import Path

import geonamescache

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/lib/worldcities.json'
IDS = ROOT / 'tests/fixtures/worldclock/ids.json'
MIN_POP = 300_000

# names as English speakers write them (GeoNames gives the local name of some)
RENAME = {('New York City', 'US'): 'New York', ('Köln', 'DE'): 'Cologne', ('Washington', 'US', 'DC'): 'Washington, D.C.', ('Sevilla', 'ES'): 'Seville',
          ('Panjim', 'IN'): 'Panaji'}
# well-known places below 300,000 (name, country, state or None)
EXTRA = [
    ('Geneva', 'CH', None), ('Oxford', 'GB', None), ('Cambridge', 'GB', None), ('Cannes', 'FR', None), ('Venice', 'IT', None),
    ('Salzburg', 'AT', None), ('Siem Reap', 'KH', None), ('Phuket', 'TH', None), ('Shimla', 'IN', None), ('Gangtok', 'IN', None),
    ('Leh', 'IN', None), ('Cupertino', 'US', 'CA'), ('Palo Alto', 'US', 'CA'), ('Mountain View', 'US', 'CA'), ('Redmond', 'US', 'WA'),
    ('Sunnyvale', 'US', 'CA'), ('Santa Clara', 'US', 'CA'), ('Anchorage', 'US', 'AK'), ('Juneau', 'US', 'AK'), ('Key West', 'US', 'FL'),
    ('Santa Fe', 'US', 'NM'), ('Boulder', 'US', 'CO'), ('Berkeley', 'US', 'CA'), ('Princeton', 'US', 'NJ'),
    ('Cambridge', 'US', 'MA'), ('Stamford', 'US', 'CT'), ('Tromsø', 'NO', None), ('Bergen', 'NO', None), ('Hobart', 'AU', None),
    ('Darwin', 'AU', None), ('Cairns', 'AU', None), ('Lugano', 'CH', None), ('Monte-Carlo', 'MC', None), ('Nice', 'FR', None), ('Bordeaux', 'FR', None), ('Edinburgh', 'GB', None),
    ('Murmansk', 'RU', None), ('Norilsk', 'RU', None), ('Panjim', 'IN', None), ('Nuuk', 'GL', None),
]
# what else people call a place (lower case; the search folds accents and case)
ALIAS = {
    ('Mumbai', 'IN'): 'bombay', ('Bengaluru', 'IN'): 'bangalore', ('Chennai', 'IN'): 'madras', ('Kolkata', 'IN'): 'calcutta',
    ('Pune', 'IN'): 'poona', ('Gurugram', 'IN'): 'gurgaon', ('Thiruvananthapuram', 'IN'): 'trivandrum', ('Kochi', 'IN'): 'cochin,ernakulam',
    ('Vadodara', 'IN'): 'baroda', ('Varanasi', 'IN'): 'benares,banaras,kashi', ('Mysuru', 'IN'): 'mysore', ('Mangaluru', 'IN'): 'mangalore',
    ('Puducherry', 'IN'): 'pondicherry,pondy', ('Shimla', 'IN'): 'simla', ('Prayagraj', 'IN'): 'allahabad', ('Kozhikode', 'IN'): 'calicut',
    ('Visakhapatnam', 'IN'): 'vizag,vishakhapatnam', ('Guwahati', 'IN'): 'gauhati', ('Delhi', 'IN'): 'dilli', ('Hubballi', 'IN'): 'hubli',
    ('Belagavi', 'IN'): 'belgaum', ('Kalaburagi', 'IN'): 'gulbarga', ('Panaji', 'IN'): 'goa', ('Bhubaneswar', 'IN'): 'bhubaneshwar',
    ('Beijing', 'CN'): 'peking', ('Guangzhou', 'CN'): 'canton', ('Ho Chi Minh City', 'VN'): 'saigon,hcmc', ('Yangon', 'MM'): 'rangoon',
    ('Kyiv', 'UA'): 'kiev', ('Saint Petersburg', 'RU'): 'st petersburg,st. petersburg,leningrad', ('Istanbul', 'TR'): 'constantinople',
    ('Dhaka', 'BD'): 'dacca', ('Chongqing', 'CN'): 'chungking', ('Nanjing', 'CN'): 'nanking', ('Xi’an', 'CN'): 'xian',
    ('Almaty', 'KZ'): 'alma-ata', ('Astana', 'KZ'): 'nur-sultan', ('Chennai', 'IN'): 'madras', ('Male', 'MV'): 'malé,maldives',
    ('Denpasar', 'ID'): 'bali', ('Kuala Lumpur', 'MY'): 'kl', ('Mexico City', 'MX'): 'cdmx,ciudad de mexico',
    ('New York', 'US'): 'nyc,new york city,big apple', ('San Francisco', 'US'): 'sf,san fran,bay area', ('Los Angeles', 'US'): 'la,l.a.',
    ('Las Vegas', 'US'): 'vegas', ('Washington, D.C.', 'US'): 'washington dc,dc', ('Philadelphia', 'US'): 'philly', ('New Orleans', 'US'): 'nola',
    ('Cologne', 'DE'): 'köln,koln', ('Munich', 'DE'): 'münchen,munchen', ('Vienna', 'AT'): 'wien', ('Prague', 'CZ'): 'praha',
    ('Rome', 'IT'): 'roma', ('Lisbon', 'PT'): 'lisboa', ('Warsaw', 'PL'): 'warszawa', ('Moscow', 'RU'): 'moskva', ('Geneva', 'CH'): 'genève,geneve,genf',
    ('Zürich', 'CH'): 'zurich', ('Brussels', 'BE'): 'bruxelles,brussel', ('The Hague', 'NL'): 'den haag', ('Copenhagen', 'DK'): 'københavn,kobenhavn',
    ('Florence', 'IT'): 'firenze', ('Venice', 'IT'): 'venezia', ('Naples', 'IT'): 'napoli', ('Milan', 'IT'): 'milano', ('Turin', 'IT'): 'torino',
    ('Gothenburg', 'SE'): 'göteborg,goteborg', ('Macau', 'MO'): 'macao', ('Hanoi', 'VN'): 'ha noi',
    ('Reykjavík', 'IS'): 'reykjavik', ('Kraków', 'PL'): 'krakow,cracow', ('Monte-Carlo', 'MC'): 'monaco', ('Tel Aviv', 'IL'): 'tel aviv-yafo,jaffa',
    ('Bogotá', 'CO'): 'bogota', ('São Paulo', 'BR'): 'sao paulo,sampa', ('Rio de Janeiro', 'BR'): 'rio',
    ('Buenos Aires', 'AR'): 'baires', ('Johannesburg', 'ZA'): 'joburg,jozi,jhb', ('Cape Town', 'ZA'): 'kaapstad', ('Abu Dhabi', 'AE'): 'abudhabi',
    ('Dubai', 'AE'): 'dubayy', ('Kathmandu', 'NP'): 'katmandu', ('Thimphu', 'BT'): 'thimbu', ('Colombo', 'LK'): 'ceylon', ('Kuwait City', 'KW'): 'kuwait',
    ('Singapore', 'SG'): 'sg', ('Hong Kong', 'HK'): 'hk,victoria', ('Taipei', 'TW'): 'taibei', ('Seoul', 'KR'): 'soul',
}
# what else people call a country
COUNTRY_ALIAS = {
    'US': 'usa,us,america,united states of america', 'GB': 'uk,britain,great britain', 'AE': 'uae,emirates', 'KR': 'korea',
    'RU': 'russian federation', 'CN': 'prc,mainland china', 'NL': 'holland', 'CZ': 'czech republic', 'IR': 'persia', 'MM': 'burma',
    'CD': 'drc,congo-kinshasa', 'CG': 'congo-brazzaville', 'CI': "côte d'ivoire,cote d'ivoire", 'SZ': 'swaziland', 'MK': 'macedonia',
    'TR': 'türkiye,turkiye', 'IN': 'bharat', 'DE': 'deutschland', 'ES': 'españa,espana', 'CH': 'switzerland,schweiz,suisse',
    'NZ': 'aotearoa', 'LK': 'ceylon', 'TL': 'east timor', 'CV': 'cape verde', 'VA': 'vatican city,holy see', 'PS': 'palestine',
    'FM': 'micronesia', 'KP': 'dprk',
}
# GeoNames writes names of some countries in a scholar's transliteration (Ghāziābād, Kōfu, Hamhŭng, Sulţānah); English writes
# them without those marks (Ghaziabad, Kofu, Hamhung, Sultanah). Per country, the marks dropped — not the letters of the
# country's own spelling (Turkish ş, Vietnamese ơ, Portuguese ç stay).
_ARABIC = '\u0304\u0323\u0331\u0327'
PLAIN = {**{cc: '\u0304\u0323\u0331' for cc in ['IN', 'BD', 'PK', 'NP', 'LK', 'ET', 'CN', 'JP', 'TW']},
         **{cc: _ARABIC for cc in ['AF', 'IR', 'IQ', 'EG', 'SA', 'SY', 'KW', 'LB', 'YE', 'JO', 'OM', 'AE', 'QA', 'BH', 'LY', 'SD', 'PS']},
         'KP': '\u0306\u0304', 'KR': '\u0306\u0304'}
UK_NATIONS = {'ENG': 'England', 'SCT': 'Scotland', 'WLS': 'Wales', 'NIR': 'Northern Ireland'}


# letters that NFKD does not take apart (the same table is in src/lib/worldclock.ts)
TRANSLIT = {'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i', 'ħ': 'h', 'ŧ': 't', 'ŋ': 'ng'}


def slug(name):
    s = ''.join(TRANSLIT.get(c, c) for c in name.lower())
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def main():
    gc = geonamescache.GeonamesCache()
    cities = list(gc.get_cities().values())
    countries = gc.get_countries()
    states = {k: v['name'] for k, v in gc.get_us_states().items()}
    by_cc = defaultdict(list)
    for c in cities:
        by_cc[c['countrycode']].append(c)

    pick = {}
    def take(c):
        pick[c['geonameid']] = c
    for c in cities:
        if c['population'] >= MIN_POP:
            take(c)
    for cc, v in countries.items():                     # capitals
        cap = (v.get('capital') or '').strip()
        if not cap:
            continue
        cands = [c for c in by_cc[cc] if c['name'] == cap] or [c for c in by_cc[cc] if cap in c['alternatenames']]
        if cands:
            take(max(cands, key=lambda c: c['population']))
    by_zone = defaultdict(list)                         # the largest city of every zone
    for c in cities:
        by_zone[c['timezone']].append(c)
    for z, cs in by_zone.items():
        if not any(c['timezone'] == z for c in pick.values()):
            take(max(cs, key=lambda c: c['population']))
    for name, cc, st in EXTRA:
        cands = [c for c in by_cc[cc] if c['name'] == name and (st is None or c.get('admin1code') == st)]
        if not cands:
            print(f'not in GeoNames’ cities15000: {name}, {cc}')
            continue
        take(max(cands, key=lambda c: c['population']))

    # one name in one country and one zone: the larger
    seen = {}
    for c in sorted(pick.values(), key=lambda c: -c['population']):
        k = (c['name'], c['countrycode'], c['timezone'])
        if k not in seen:
            seen[k] = c
    chosen = sorted(seen.values(), key=lambda c: (-c['population'], c['geonameid']))

    def shown(c):
        n = RENAME.get((c['name'], c['countrycode'], c.get('admin1code'))) or RENAME.get((c['name'], c['countrycode'])) or c['name']
        drop = PLAIN.get(c['countrycode'])
        if drop:
            n = unicodedata.normalize('NFC', ''.join(ch for ch in unicodedata.normalize('NFD', n) if ch not in drop))
        return n

    def state(c):
        a = c.get('admin1code') or ''
        if c['countrycode'] == 'US' and a in states:
            return a
        if c['countrycode'] == 'GB' and a in UK_NATIONS:
            return a
        return ''

    zones = sorted({c['timezone'] for c in chosen})
    zi = {z: i for i, z in enumerate(zones)}
    # ids: name + country; where two cities would share one (one name in two zones of one country), the state, else the
    # GeoNames number
    base = defaultdict(list)
    for c in chosen:
        base[f'{slug(shown(c))}-{c["countrycode"].lower()}'].append(c)
    ids, lines, used_alias = {}, [], set()
    for c in chosen:
        default = f'{slug(shown(c))}-{c["countrycode"].lower()}'
        cid = default
        if len(base[default]) > 1 and c is not base[default][0]:
            st = (c.get('admin1code') or '').lower()
            cid = f'{default}-{st}' if st and re.fullmatch(r'[a-z0-9]+', st) and sum(1 for d in base[default] if (d.get('admin1code') or '').lower() == st) == 1 else f'{default}-{c["geonameid"]}'
        assert cid not in ids.values(), cid
        ids[c['geonameid']] = cid
        alias = ALIAS.get((shown(c), c['countrycode']), '')
        if shown(c) != c['name']:
            alias = ','.join(x for x in [c['name'].lower(), alias] if x)
        alias = ','.join(dict.fromkeys(x for x in alias.split(',') if x and x != shown(c).lower()))
        used_alias.add((shown(c), c['countrycode']))
        assert '|' not in alias and '|' not in shown(c)
        lines.append('|'.join([cid if cid != default else '', shown(c), c['countrycode'], str(zi[c['timezone']]),
                               f'{c["latitude"]:.2f}'.rstrip('0').rstrip('.'), f'{c["longitude"]:.2f}'.rstrip('0').rstrip('.'), state(c), alias]))
    unused = [k for k in ALIAS if k not in used_alias]
    assert not unused, f'aliases of cities not in the list: {unused}'
    used_cc = sorted({c['countrycode'] for c in chosen})
    data = {
        'source': 'GeoNames (geonames.org, CC BY 4.0) via geonamescache 3.0.2: cities of 300,000 people and more, the capitals, the largest city of every time zone',
        'zones': zones,
        'countries': {cc: countries[cc]['name'].strip() for cc in used_cc},
        'countryAlias': {cc: a for cc, a in COUNTRY_ALIAS.items() if cc in used_cc},
        'states': {**{k: states[k] for k in sorted(states)}, **UK_NATIONS},
        'cities': lines,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    IDS.parent.mkdir(parents=True, exist_ok=True)
    IDS.write_text(json.dumps({'ids': [ids[c['geonameid']] for c in chosen], 'names': [shown(c) for c in chosen],
                               'coords': [[round(c['latitude'], 2), round(c['longitude'], 2)] for c in chosen]}, ensure_ascii=False) + '\n')
    print(f'{len(chosen)} cities in {len(zones)} zones, {len(used_cc)} countries → {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
