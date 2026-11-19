#!/usr/bin/env python3
"""Reference for the Word Counter (tests/unit/wordcount.test.mjs, tests/e2e/wordcount.e2e.mjs).

Reads tests/fixtures/wordcount/corpus.json (texts written for the suite) and writes reference.json with what other
programs say about each text:
  words       pieces between white space that hold a letter or a digit — what `wc -w` and Microsoft Word count
              (the corpus is written so that this is also the count a reader makes)
  chars       extended grapheme clusters by the `regex` module's \\X (an implementation of UAX #29 that is neither
              the Rust crate inside textkit.wasm nor ICU)
  noSpace     … of them, those that are not white space
  sentences   pySBD's count (English texts only); the unit suite lists the texts where pySBD is wrong
  lines, paragraphs   the tab's rule, written again here
and the classic English stop-word list (Snowball's 174 words, read from the source archive of the stop-words
package 2018.7.23, which pip fetches from PyPI; its SHA-256 is checked — later releases of that package carry a list
of 1,333 words, which is another thing).

  pip install pysbd regex
  python3 scripts/make-wordcount-reference.py
"""
import glob, hashlib, json, os, re, subprocess, sys, tarfile, tempfile
import pysbd, regex

STOP_SHA256 = '6df3ad5f5de697daa437e4445c86c73604e6bc138dd0dc0fac55664aa4e6b03e'
def snowball_english():
    with tempfile.TemporaryDirectory() as d:
        subprocess.run([sys.executable, '-m', 'pip', 'download', '-q', '--no-deps', '--no-binary', ':all:', '-d', d, 'stop-words==2018.7.23'], check=True)
        f = glob.glob(os.path.join(d, 'stop-words-2018.7.23*'))[0]
        got = hashlib.sha256(open(f, 'rb').read()).hexdigest()
        assert got == STOP_SHA256, f'stop-words archive: SHA-256 {got}'
        with tarfile.open(f) as t:
            return t.extractfile('stop-words-2018.7.23/stop_words/stop-words/english.txt').read().decode('utf8').split()

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, '..', 'tests', 'fixtures', 'wordcount')
corpus = json.load(open(os.path.join(DIR, 'corpus.json'), encoding='utf8'))
seg = pysbd.Segmenter(language='en', clean=False)

def lines_paragraphs(text):
    if not text: return 0, 0
    rows = re.split(r'\r\n|[\n\r  ]', text)
    if rows[-1] == '': rows.pop()                      # a line break at the very end starts no line
    filled = [bool(re.search(r'[^\W_]', r)) or any(ord(c) >= 0x1F000 for c in r) for r in rows]
    blocks, inside, blank_between = 0, False, False
    for f in filled:
        if f and not inside:
            if blocks: blank_between = True
            blocks += 1
        inside = f
    return len(rows), (blocks if blank_between else sum(filled))

out = {'texts': {}}
for c in corpus:
    t = c['text']
    clusters = regex.findall(r'\X', t)
    lines, paragraphs = lines_paragraphs(t)
    r = {'words': sum(1 for piece in t.split() if any(ch.isalnum() for ch in piece)), 'chars': len(clusters),
         'noSpace': sum(1 for g in clusters if not g.isspace()), 'lines': lines, 'paragraphs': paragraphs}
    if c['lang'] == 'en': r['sentences'] = sum(len(seg.segment(p)) for p in re.split(r'\n+', t) if re.search(r'\w', p))
    out['texts'][c['id']] = r
stop = sorted(snowball_english())
assert len(stop) == 174, len(stop)
out['stop'] = stop
json.dump(out, open(os.path.join(DIR, 'reference.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(len(out['texts']), 'texts,', len(stop), 'stop words')
