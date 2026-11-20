#!/usr/bin/env python3
"""Reference reading order for the PDF → EPUB tab: poppler's pdftotext (an independent reader, in its default
reading-order mode) on each page of the fixture PDFs → tests/fixtures/epub/reference.json.
Needs poppler-utils (pdftotext, pdfinfo): `apt install poppler-utils`. Run from the repository root."""
import json, re, subprocess, sys
# (not two-column-paper.pdf: poppler reads its right column's first paragraph before the left column's heading; the unit
# suite holds that one to the order its generator wrote)
FILES = ['federal-register-3p.pdf', 'vicksburg-ocr.pdf']
out = {'pdftotext': subprocess.run(['pdftotext', '-v'], capture_output=True, text=True).stderr.split('\n')[0], 'files': {}}
for f in FILES:
    path = f'tests/fixtures/pdf/{f}'
    pages = int(re.search(r'^Pages:\s+(\d+)', subprocess.run(['pdfinfo', path], capture_output=True, text=True, check=True).stdout, re.M).group(1))
    out['files'][f] = [subprocess.run(['pdftotext', '-enc', 'UTF-8', '-f', str(p), '-l', str(p), path, '-'], capture_output=True, text=True, check=True).stdout for p in range(1, pages + 1)]
json.dump(out, open('tests/fixtures/epub/reference.json', 'w'), ensure_ascii=False, indent=0)
print({f: len(v) for f, v in out['files'].items()}, out['pdftotext'], file=sys.stderr)
