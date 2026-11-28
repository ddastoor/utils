#!/usr/bin/env python3
# The reference of tests/unit/deadlines.test.mjs (Paper Deadlines → Calendar): dates as papers write them, each read by Python's
# dateutil (parser.parse, day first as in India and month first as in the US, a default date for the missing year) — the
# independent reader; and dates counted on from another (dateutil's relativedelta for months, timedelta for days and weeks).
# Needs: pip install python-dateutil.   python3 scripts/make-deadlines-reference.py
import json
from datetime import datetime, timedelta
from pathlib import Path
from dateutil import parser
from dateutil.relativedelta import relativedelta

OUT = Path(__file__).resolve().parent.parent / 'tests/fixtures/deadlines/reference.json'
DATES = ['15/12/2026', '15-12-2026', '15.12.2026', '5/1/2027', '05/01/27', '28/11/2026', '01/12/2026', '25-01-2027', '29/02/2028', '31/12/2099',
         '06/12/2026', '12/06/2026', '12/25/2026', '2026-12-15', '2027-1-5',
         '1 December 2026', '6th December 2026', '6th Dec 2026', '31 January 2027', '1st of March 2027', '22nd Feb, 2027', '3rd Mar 2027',
         'Saturday, 6th December 2026', 'Sat, 6 Dec 2026', 'Monday 1 March 2027', '07-Nov-2026', '7 Nov 2026', '30 Sept 2026',
         'December 6, 2026', 'Dec 6, 2026', 'Dec. 6th, 2026', 'January 31 2027', 'Saturday, December 6, 2026', 'Jul 4, 2027', 'March 1st, 2027',
         '30 Nov', '1 Jan', 'Dec 25', '15 August', 'Feb 3']
OUT_DATES = []
for s in DATES:
    for mf in (False, True):
        # a date that starts with its year is year, month, day (ISO 8601) — dateutil reads it so when told the year comes first
        d = parser.parse(s, yearfirst=True, dayfirst=False) if s[:4].isdigit() else parser.parse(s, dayfirst=not mf, default=datetime(2026, 1, 1))
        OUT_DATES.append({'text': s, 'monthFirst': mf, 'date': d.strftime('%Y-%m-%d')})
COUNT = [('2026-11-28', 7, 'day'), ('2026-12-01', 15, 'day'), ('2027-01-31', 30, 'day'), ('2026-12-25', 10, 'day'), ('2028-02-20', 10, 'day'),
         ('2027-01-31', 1, 'month'), ('2028-01-31', 1, 'month'), ('2026-10-31', 4, 'month'), ('2026-12-15', 2, 'week'), ('2026-05-31', 9, 'month')]
OUT_COUNT = []
for base, n, unit in COUNT:
    b = datetime.strptime(base, '%Y-%m-%d')
    d = b + (relativedelta(months=n) if unit == 'month' else timedelta(days=n * (7 if unit == 'week' else 1)))
    OUT_COUNT.append({'from': base, 'n': n, 'unit': unit, 'date': d.strftime('%Y-%m-%d')})
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({'dates': OUT_DATES, 'counted': OUT_COUNT}, indent=1) + '\n')
print(f'wrote {OUT} — {len(OUT_DATES)} dates, {len(OUT_COUNT)} counted')
