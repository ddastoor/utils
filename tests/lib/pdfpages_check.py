#!/usr/bin/env python3
# An independent reading of a PDF for tests/unit/pdfpages.test.mjs (pypdf, not MuPDF): per page its rotation and
# annotations (subtype, contents, a web link's URI, the page an internal link goes to), the form's fields with their
# values, and the outline (title → page). Needs: pip install pypdf.   python3 tests/lib/pdfpages_check.py file.pdf
import json, sys
from pypdf import PdfReader
from pypdf.generic import ArrayObject, DictionaryObject, NameObject

r = PdfReader(sys.argv[1])
num = {p.indirect_reference.idnum: i for i, p in enumerate(r.pages)}


def dest_page(d):
    if isinstance(d, (str, bytes)) or hasattr(d, 'get_object') and isinstance(d.get_object(), (str, bytes)):
        name = d.get_object() if hasattr(d, 'get_object') else d
        nd = r.named_destinations.get(str(name))
        return r.get_destination_page_number(nd) if nd is not None else None
    d = d.get_object() if hasattr(d, 'get_object') else d
    if isinstance(d, DictionaryObject) and '/D' in d: d = d['/D']
    if isinstance(d, ArrayObject) and d:
        ref = d[0]
        return num.get(ref.idnum) if hasattr(ref, 'idnum') else None
    return None


pages = []
for p in r.pages:
    annots = []
    for a in p.get('/Annots', []) or []:
        a = a.get_object()
        e = {'subtype': str(a.get('/Subtype')), 'contents': str(a.get('/Contents', '')) or None}
        if e['subtype'] == '/Link':
            act = a.get('/A')
            act = act.get_object() if act is not None else None
            if act is not None and act.get('/S') == '/URI': e['uri'] = str(act.get('/URI'))
            elif '/Dest' in a: e['page'] = dest_page(a['/Dest'])
            elif act is not None and act.get('/S') == '/GoTo': e['page'] = dest_page(act['/D'])
        if e['subtype'] == '/Widget':
            f = a
            name = []
            while f is not None:
                if '/T' in f: name.insert(0, str(f['/T']))
                f = f.get('/Parent').get_object() if '/Parent' in f else None
            e['field'] = '.'.join(name)
        annots.append(e)
    pages.append({'rotate': int(p.get('/Rotate', 0)) % 360, 'annots': annots})
fields = {k: (str(v.get('/V')) if v.get('/V') is not None else None) for k, v in (r.get_fields() or {}).items()}
acro = r.trailer['/Root'].get('/AcroForm')
listed = len(acro.get_object().get('/Fields', [])) if acro is not None else 0


def outline(items):
    res = []
    for it in items:
        if isinstance(it, list): res.append(outline(it))
        else: res.append([str(it.title), r.get_destination_page_number(it)])
    return res


print(json.dumps({'pages': pages, 'fields': fields, 'listed': listed, 'outline': outline(r.outline)}))
