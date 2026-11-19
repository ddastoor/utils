#!/usr/bin/env python3
"""Reference for Number to Words → tests/fixtures/words/reference.json

The words of whole numbers by **num2words** (the reference library for spelling numbers out; `pip install num2words
--no-deps` — its docopt dependency is only for its command line): lang 'en' for the international system (British
"and": one thousand and one) and lang 'en_IN' for lakh and crore. num2words separates groups with commas, which a
cheque does not: they are taken out. Its Indian converter stops below 10^10; beyond that the number of crore is put in
words by the same converter and " crore" is appended, as Indian usage has it ("one lakh crore").

    python3 scripts/make-words-reference.py
"""
import json, os, random
from importlib.metadata import version
from num2words import num2words

random.seed(20261119)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'words', 'reference.json')
plain = lambda s: s.replace(',', '')

def intl(n): return plain(num2words(n, lang='en'))
def indian(n):
    if n < 10 ** 10: return plain(num2words(n, lang='en_IN'))
    crore, rest = divmod(n, 10 ** 7)
    head = indian(crore) + ' crore'
    if not rest: return head
    return head + (' and ' if rest < 100 else ' ') + indian(rest)

nums = set(range(0, 301)) | {10 ** k + d for k in range(2, 19) for d in (-1, 0, 1, 11, 99, 100, 101)} | {d * 10 ** k for k in range(2, 19) for d in (2, 5, 9, 12, 25, 99)}
nums |= {99, 999, 9999, 99999, 999999, 9999999, 99999999, 999999999, 9999999999, 10 ** 10, 10 ** 10 + 1, 123456789, 1234567890, 1234567, 100001, 1001001, 10010000000, 2000019, 1000100,
         9223372036854775807, 9223372036854775808, 9999999999999999999, 1000000000000000000, 1111111111111111111, 1010101010101010101}
for _ in range(900):
    k = random.randint(3, 19)
    nums.add(random.randint(10 ** (k - 1), 10 ** k - 1))
for _ in range(200):  # numbers with long runs of zeros: where "and" and the group names go wrong
    k = random.randint(4, 19); n = random.randint(1, 999) * 10 ** random.randint(0, k - 1) + random.randint(0, 99)
    if n < 10 ** 19: nums.add(n)
cases = [[str(n), indian(n), intl(n)] for n in sorted(nums) if 0 <= n < 10 ** 19]

# the sentences of num2words' own currency forms, for the singular and plural of the small units
money = [[x, cur, plain(num2words(float(x), lang=lang, to='currency', currency=cur))] for x, lang, cur in
         [('1.01', 'en_IN', 'INR'), ('2.50', 'en_IN', 'INR'), ('1.00', 'en_IN', 'INR'), ('21.01', 'en_IN', 'INR'), ('1.01', 'en', 'USD'), ('19.99', 'en', 'USD'), ('2.01', 'en', 'USD'), ('1.00', 'en', 'USD')]]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'made_with': f'num2words {version("num2words")}', 'numbers': cases, 'money': money}, f, separators=(',', ':'), ensure_ascii=False)
print(len(cases), 'numbers,', len(money), 'currency sentences,', os.path.getsize(OUT), 'bytes'); print(money)
