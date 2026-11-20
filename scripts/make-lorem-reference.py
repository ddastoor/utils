#!/usr/bin/env python3
"""Reference for the Lorem Ipsum tab → tests/fixtures/lorem/reference.json.

From the two texts inside the `lipsum` crate (the classic passage and Cicero's De finibus, book I — the texts the
Markov chain of textkit-lorem.wasm learns), read here on their own:
  pairs     every two words that follow each other in a text (small letters, punctuation left off; a text is read as
            a circle — its last word is followed by its first); between them
            may stand only what the engine leaves out — a sign without letters ("--", "**") or a Roman initial
            ("L.", "Cn.") — so a pair of the engine's output that is not here was not learned from the texts;
  words     every word of the texts (small letters);
  starts    every word that begins a sentence of the texts;
  classic   the first sentence of the classic passage.

    python3 scripts/make-lorem-reference.py      (reads the crate from cargo's cache: build wasm/textkit once first)
"""
import glob, hashlib, json, os, re, tarfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRATE_SHA256 = '636860251af8963cc40f6b4baadee105f02e21b28131d76eba8e40ce84ab8064'  # lipsum 0.9.1, as crates.io publishes it
path = next(iter(glob.glob(os.path.expanduser('~/.cargo/registry/cache/*/lipsum-0.9.1.crate'))), None)
assert path, 'lipsum-0.9.1.crate is not in cargo\'s cache: build wasm/textkit first (wasm/textkit/build.sh)'
data = open(path, 'rb').read()
assert hashlib.sha256(data).hexdigest() == CRATE_SHA256, 'the crate is not the published one'
with tarfile.open(path) as tar:
    texts = [tar.extractfile(f'lipsum-0.9.1/src/{n}.txt').read().decode() for n in ('lorem-ipsum', 'liber-primus')]

def bare(tok): return re.sub(r"[^a-z]", '', tok.lower())
def skipped(tok):
    letters = re.sub(r"[^A-Za-z]", '', tok)
    return not letters or re.fullmatch(r"[A-Z][a-z]?\.,?", tok.strip("'")) is not None or "'." in tok
pairs, words, starts = set(), set(), set()
for text in texts:
    toks = [t for t in text.split() if not skipped(t)]
    # the engine reads each text as a circle: after its last word comes its first
    pairs.add(f'{bare(toks[-1])} {bare(toks[0])}')
    for i, t in enumerate(toks):
        words.add(bare(t))
        if i + 1 < len(toks): pairs.add(f'{bare(t)} {bare(toks[i + 1])}')
        if i == 0 or toks[i - 1].strip("'\"").endswith(('.', '?', '!')): starts.add(bare(t))
classic = re.match(r'[^.]*\.', ' '.join(texts[0].split())).group(0)
ref = {'_source': 'lipsum 0.9.1 (crates.io, SHA-256 ' + CRATE_SHA256[:12] + '…): src/lorem-ipsum.txt, src/liber-primus.txt',
       'classic': classic, 'pairs': sorted(pairs), 'words': sorted(words), 'starts': sorted(starts)}
out = os.path.join(ROOT, 'tests', 'fixtures', 'lorem', 'reference.json')
with open(out, 'w', encoding='utf8') as f: json.dump(ref, f, separators=(',', ':')); f.write('\n')
print(f'{len(pairs)} pairs, {len(words)} words, {len(starts)} sentence starts → {os.path.getsize(out):,} bytes')
