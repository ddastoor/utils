#!/usr/bin/env python3
"""SliceDiceGrapher's fixtures and the reference of its pivots (potentials #75).

  python3 scripts/make-slicedice-fixtures.py      (needs pandas, numpy, openpyxl)

tests/fixtures/slicedice/
  sales.csv            240 sales of two years: Date (dd/mm/yyyy), Region, City, Product, Units, Price (₹), Sales (₹, Indian grouping),
                       Discount (%) — and a last row "Total", as a pasted range often ends
  sales.xlsx           the same as a workbook: real dates, numbers with their formats
  paste-excel.html     the first 30 rows as Excel puts them on the clipboard (x:num with the real value, dates as serials)
  paste-libre.html     … as LibreOffice Calc does (sdval / sdnum)
  paste-gsheets.html   … as Google Sheets does (data-sheets-value)
  paste.tsv            … as the clipboard's plain text (tab-separated, the cells as shown)
  reference.json       pandas' answers for the pivots the unit suite runs on Perspective: each case's cells by row path and split
"""
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from openpyxl import Workbook

OUT = Path(__file__).resolve().parent.parent / 'tests' / 'fixtures' / 'slicedice'
OUT.mkdir(parents=True, exist_ok=True)
rnd = random.Random(75)

REGIONS = {'North': ['Delhi', 'Chandigarh', 'Lucknow'], 'South': ['Bengaluru', 'Chennai', 'Kochi'], 'East': ['Kolkata', 'Bhubaneswar'], 'West': ['Mumbai', 'Pune', 'Ahmedabad']}
PRODUCTS = {'Tea': 240.0, 'Coffee': 380.0, 'Juice': 120.0, 'Snacks': 95.5, 'Biscuits': 45.25, 'Honey': 610.0}

rows = []
d0 = date(2025, 1, 1)
for i in range(240):
    dt = d0 + timedelta(days=rnd.randrange(0, 730))
    region = rnd.choice(list(REGIONS))
    city = rnd.choice(REGIONS[region])
    product = rnd.choice(list(PRODUCTS))
    units = rnd.randrange(1, 60)
    price = PRODUCTS[product]
    disc = rnd.choice([0, 0, 0.05, 0.1, 0.125, 0.2])
    sales = round(units * price * (1 - disc), 2)
    rows.append({'Date': dt, 'Region': region, 'City': city, 'Product': product, 'Units': units, 'Price': price, 'Sales': sales, 'Discount': disc})
df = pd.DataFrame(rows)


def inr(v, dec=2):
    """₹1,23,456.00 — Indian grouping"""
    neg = v < 0
    s = f'{abs(v):.{dec}f}'
    whole, _, frac = s.partition('.')
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ','.join(parts + [tail])
    return ('-' if neg else '') + '₹' + whole + ('.' + frac if frac else '')


def shown(r):
    return [r['Date'].strftime('%d/%m/%Y'), r['Region'], r['City'], r['Product'], str(r['Units']), inr(r['Price']), inr(r['Sales']), f"{r['Discount'] * 100:g}%"]


HEAD = ['Date', 'Region', 'City', 'Product', 'Units', 'Price', 'Sales', 'Discount']
lines = [HEAD] + [shown(r) for r in rows]
total = ['Total', '', '', '', str(int(df.Units.sum())), '', inr(df.Sales.sum()), '']


def csv_cell(c):
    return f'"{c}"' if (',' in c or '"' in c) else c


(OUT / 'sales.csv').write_text('\n'.join(','.join(csv_cell(c) for c in ln) for ln in lines + [total]) + '\n', encoding='utf-8')

wb = Workbook()
ws = wb.active
ws.title = 'Sales'
ws.append(HEAD)
for r in rows:
    ws.append([r['Date'], r['Region'], r['City'], r['Product'], r['Units'], r['Price'], r['Sales'], r['Discount']])
for row in ws.iter_rows(min_row=2):
    row[0].number_format = 'DD/MM/YYYY'
    row[5].number_format = '[$₹-4009]#,##0.00'
    row[6].number_format = '[$₹-4009]#,##,##0.00'
    row[7].number_format = '0%'
wb.save(OUT / 'sales.xlsx')

# the clipboard: the first 30 rows
part = rows[:30]
serial = lambda d: (d - date(1899, 12, 30)).days


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def excel_html():
    out = ['<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">',
           '<head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=ProgId content=Excel.Sheet><meta name=Generator content="Microsoft Excel 15">',
           '<style>.xl65{mso-number-format:"\\[\\$₹-4009\\]\\#\\,\\#\\#0\\.00";}.xl66{mso-number-format:"Short Date";}.xl67{mso-number-format:0%;}</style></head><body link="#0563C1" vlink="#954F72">',
           '<table border=0 cellpadding=0 cellspacing=0 width=600 style=\'border-collapse:collapse;width:450pt\'>', '<!--StartFragment-->']
    out.append('<tr height=20 style=\'height:15.0pt\'>' + ''.join(f'<td height=20 width=75 style=\'height:15.0pt;width:56pt\'>{h}</td>' for h in HEAD) + '</tr>')
    for r in part:
        s = shown(r)
        out.append('<tr height=20 style=\'height:15.0pt\'>'
                   f'<td height=20 class=xl66 align=right x:num="{serial(r["Date"])}">{s[0]}</td>'
                   f'<td>{esc(s[1])}</td><td>{esc(s[2])}</td><td>{esc(s[3])}</td>'
                   f'<td align=right x:num>{s[4]}</td>'
                   f'<td class=xl65 align=right x:num="{r["Price"]}">{esc(s[5])}</td>'
                   f'<td class=xl65 align=right x:num="{r["Sales"]}">{esc(s[6])}</td>'
                   f'<td class=xl67 align=right x:num="{r["Discount"]}">{s[7]}</td></tr>')
    out += ['<!--EndFragment-->', '</table></body></html>']
    return '\n'.join(out)


def libre_html():
    out = ['<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN"><html><head><meta http-equiv="content-type" content="text/html; charset=utf-8"/><title></title><meta name="generator" content="LibreOffice 25.2.4.3 (Linux)"/></head><body>',
           '<table cellspacing="0" border="0"><colgroup width="85" span="8"></colgroup>']
    out.append('<tr>' + ''.join(f'<td height="17" align="left">{h}</td>' for h in HEAD) + '</tr>')
    for r in part:
        s = shown(r)
        out.append('<tr>'
                   f'<td height="17" align="right" sdval="{serial(r["Date"])}" sdnum="16393;16393;DD/MM/YYYY">{s[0]}</td>'
                   f'<td align="left">{esc(s[1])}</td><td align="left">{esc(s[2])}</td><td align="left">{esc(s[3])}</td>'
                   f'<td align="right" sdval="{r["Units"]}" sdnum="16393;">{s[4]}</td>'
                   f'<td align="right" sdval="{r["Price"]}" sdnum="16393;0;[$₹-4009]#,##0.00">{esc(s[5])}</td>'
                   f'<td align="right" sdval="{r["Sales"]}" sdnum="16393;0;[$₹-4009]#,##,##0.00">{esc(s[6])}</td>'
                   f'<td align="right" sdval="{r["Discount"]}" sdnum="16393;0;0%">{s[7]}</td></tr>')
    out += ['</table></body></html>']
    return '\n'.join(out)


def gsheets_html():
    def dv(kind, v):
        return esc(json.dumps({'1': kind, '3' if kind == 3 else '2': v}, separators=(',', ':'))).replace('"', '&quot;')
    out = ['<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>',
           '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none" data-sheets-root="1"><colgroup>' + '<col width="100"/>' * 8 + '</colgroup><tbody>']
    out.append('<tr style="height:21px;">' + ''.join(f'<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;" data-sheets-value="{dv(2, h)}">{h}</td>' for h in HEAD) + '</tr>')
    for r in part:
        s = shown(r)
        cells = [(3, serial(r['Date']), s[0]), (2, r['Region'], s[1]), (2, r['City'], s[2]), (2, r['Product'], s[3]), (3, r['Units'], s[4]), (3, r['Price'], s[5]), (3, r['Sales'], s[6]), (3, r['Discount'], s[7])]
        out.append('<tr style="height:21px;">' + ''.join(f'<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;{"text-align:right;" if k == 3 else ""}" data-sheets-value="{dv(k, v)}">{esc(t)}</td>' for k, v, t in cells) + '</tr>')
    out += ['</tbody></table></google-sheets-html-origin>']
    return ''.join(out)


(OUT / 'paste-excel.html').write_text(excel_html(), encoding='utf-8')
(OUT / 'paste-libre.html').write_text(libre_html(), encoding='utf-8')
(OUT / 'paste-gsheets.html').write_text(gsheets_html(), encoding='utf-8')
(OUT / 'paste.tsv').write_text('\r\n'.join('\t'.join(ln) for ln in [HEAD] + [shown(r) for r in part]) + '\r\n', encoding='utf-8')

# ---------------------------------------------------------------- pandas' answers
df['Month'] = df.Date.apply(lambda d: date(d.year, d.month, 1).isoformat())
df['Quarter'] = df.Date.apply(lambda d: date(d.year, 3 * ((d.month - 1) // 3) + 1, 1).isoformat())
df['Year'] = df.Date.apply(lambda d: str(d.year))
df['MonthOfYear'] = df.Date.apply(lambda d: d.month)
df['Rows'] = 1

AGG = {'sum': 'sum', 'avg': 'mean', 'min': 'min', 'max': 'max', 'count': 'count', 'distinct': 'nunique'}
GRAIN_COL = {'month': 'Month', 'quarter': 'Quarter', 'year': 'Year', 'month_of_year': 'MonthOfYear'}


def col_of(f):
    return GRAIN_COL[f['grain']] if f.get('grain') else f['name']


def key(v):
    if isinstance(v, (np.integer,)):
        return int(v)
    return v if isinstance(v, str) else str(v)


def case(name, rows_, values, cols=None, filt=None):
    """cells by 'a/b|split|value index' for every row level (the total '' too)"""
    data = df if filt is None else df[filt(df)]
    out = {}
    levels = [col_of(f) for f in rows_]
    split = col_of(cols) if cols else None
    for depth in range(len(levels) + 1):
        keys = levels[:depth]
        for vi, v in enumerate(values):
            field = 'Rows' if v['field'] == 'Rows' else v['field']
            fn = 'sum' if v['field'] == 'Rows' else AGG[v['agg']]
            groups = keys + ([split] if split else [])
            if groups:
                g = data.groupby(groups)[field].agg(fn)
                for idx, val in g.items():
                    idx = idx if isinstance(idx, tuple) else (idx,)
                    path = '/'.join(key(x) for x in idx[:depth])
                    sp = key(idx[depth]) if split else ''
                    out[f'{path}|{sp}|{vi}'] = None if pd.isna(val) else float(val)
            else:
                val = data[field].agg(fn)
                out[f'||{vi}'] = float(val)
            if split:   # the row totals (no split)
                if keys:
                    for idx, val in data.groupby(keys)[field].agg(fn).items():
                        idx = idx if isinstance(idx, tuple) else (idx,)
                        out[f'{"/".join(key(x) for x in idx)}|*|{vi}'] = float(val)
                else:
                    out[f'|*|{vi}'] = float(data[field].agg(fn))
    return {'name': name, 'rows': rows_, 'cols': cols, 'values': values, 'cells': out}


S = lambda f, a='sum': {'field': f, 'agg': a, 'show': 'value'}
cases = [
    case('sum by region', [{'name': 'Region'}], [S('Sales')]),
    case('sum by region and product', [{'name': 'Region'}, {'name': 'Product'}], [S('Sales'), S('Units')]),
    case('sum by region split by product', [{'name': 'Region'}], [S('Sales')], cols={'name': 'Product'}),
    case('average price by product', [{'name': 'Product'}], [S('Price', 'avg')]),
    case('rows by city', [{'name': 'City'}], [S('Rows')]),
    case('distinct cities by region', [{'name': 'Region'}], [S('City', 'distinct')]),
    case('min and max sales by product', [{'name': 'Product'}], [S('Sales', 'min'), S('Sales', 'max')]),
    case('sales by month', [{'name': 'Date', 'grain': 'month'}], [S('Sales')]),
    case('sales by quarter', [{'name': 'Date', 'grain': 'quarter'}], [S('Sales')]),
    case('sales by year', [{'name': 'Date', 'grain': 'year'}], [S('Sales')]),
    case('year against year', [{'name': 'Date', 'grain': 'month_of_year'}], [S('Sales')], cols={'name': 'Date', 'grain': 'year'}),
    case('north and south only', [{'name': 'Product'}], [S('Sales')], filt=lambda d: d.Region.isin(['North', 'South'])),
    case('sales of 5000 and more', [{'name': 'Region'}], [S('Sales'), S('Rows')], filt=lambda d: d.Sales >= 5000),
    case('first half of 2026', [{'name': 'Region'}], [S('Sales')], filt=lambda d: (d.Date >= date(2026, 1, 1)) & (d.Date <= date(2026, 6, 30))),
]
# the spread: numpy's quartiles by each method, to see which the engine follows; the histogram's bins
spread = {}
for prod, g in df.groupby('Product'):
    v = g.Sales.to_numpy()
    spread[prod] = {m: [float(np.percentile(v, 25, method=m)), float(np.median(v)), float(np.percentile(v, 75, method=m))] for m in ['linear', 'lower', 'higher', 'nearest', 'midpoint', 'inverted_cdf', 'averaged_inverted_cdf', 'closest_observation', 'interpolated_inverted_cdf', 'hazen', 'weibull', 'median_unbiased', 'normal_unbiased']}
    spread[prod]['min'] = float(v.min()); spread[prod]['max'] = float(v.max())
lo, hi = float(df.Sales.min()), float(df.Sales.max())
ref = {'rows': len(rows), 'total_sales': float(df.Sales.sum()), 'total_units': int(df.Units.sum()), 'cases': cases, 'spread': spread,
       'sales_min': lo, 'sales_max': hi, 'sales': [float(x) for x in df.Sales]}
(OUT / 'reference.json').write_text(json.dumps(ref, ensure_ascii=False, indent=0) + '\n', encoding='utf-8')
print(f'{len(rows)} rows, {len(cases)} cases → {OUT}')
