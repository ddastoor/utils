#!/usr/bin/env python3
"""Fixtures and reference values for the CSV / Excel tab (tests/unit/sheet.test.mjs, tests/e2e/sheet.e2e.mjs).

Writes into tests/fixtures/sheets/:
  kinds.xlsx    (openpyxl) Excel's error values, durations past 24 hours, a sum with binary noise, very large and very
                small numbers, a 16-digit number, booleans, a date, a date with a time, a time
  bank.xls      a web page with a table, as many banks and web apps save "Excel" files (UTF-8, colspan, rowspan, a
                table that only lays out another one)
  xml2003.xml   Excel 2003 XML (SpreadsheetML): two worksheets, ss:Index gaps, MergeAcross, Number / String / Boolean
                / DateTime cells
  cp1252.csv    what Excel on Windows saves as "CSV": Windows-1252, semicolons, decimal commas
  utf16.txt     what Excel saves as "Unicode Text": UTF-16 LE with a byte-order mark, tabs, CRLF
and tests/fixtures/sheets/reference.json: every sheet of those files (and of base.xlsx / base.xls / base.ods) as
LibreOffice Calc shows it ("soffice --convert-to csv", the cells as shown, all sheets), and the two text files as
Python's csv module reads them with their known encodings.
Needs: pip install openpyxl; LibreOffice (apt install libreoffice-calc). Run from the repository root."""
import csv, datetime, glob, io, json, os, shutil, subprocess, tempfile
import openpyxl

D = 'tests/fixtures/sheets'

# kinds.xlsx
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Kinds'
ws.append(['Kind', 'Value'])
for e in ['#DIV/0!', '#N/A', '#NAME?', '#NULL!', '#NUM!', '#REF!', '#VALUE!']:
    ws.append(['error', e])                                       # openpyxl stores these as error cells (t="e")
for td in [datetime.timedelta(hours=30), datetime.timedelta(hours=2, minutes=30, seconds=15), datetime.timedelta(hours=255, minutes=10, seconds=10)]:
    ws.append(['duration', td]); ws.cell(ws.max_row, 2).number_format = '[h]:mm:ss'
ws.append(['sum', 0.1 + 0.2])
ws.append(['large', 1e21])
ws.append(['small', 1.25e-7])
ws.append(['2^53', 2 ** 53])
ws.append(['16 digits', 1234567890123456])
ws.append(['third', 1 / 3])
ws.append(['bool', True])
ws.append(['date', datetime.date(2026, 11, 20)]); ws.cell(ws.max_row, 2).number_format = 'yyyy-mm-dd'
ws.append(['datetime', datetime.datetime(2026, 11, 20, 10, 30, 15)]); ws.cell(ws.max_row, 2).number_format = 'yyyy-mm-dd hh:mm:ss'
ws.append(['time', datetime.time(10, 30, 15)]); ws.cell(ws.max_row, 2).number_format = 'hh:mm:ss'
wb.save(f'{D}/kinds.xlsx')

# bank.xls — an HTML page
open(f'{D}/bank.xls', 'w', encoding='utf-8').write('''<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>Statement</title></head>
<body><table><tr><td>
<table border="1">
<tr><th colspan="4">Account statement — Asha Rao</th></tr>
<tr><th>Date</th><th>Narration</th><th>Amount (₹)</th><th>Balance</th></tr>
<tr><td>01/11/2026</td><td>UPI/CHAI   STALL</td><td>-45.00</td><td rowspan="2">1,23,455.00</td></tr>
<tr><td>02/11/2026</td><td>Salary &amp; bonus</td><td>50,000.00</td></tr>
<tr><td>03/11/2026</td><td>NEFT
   to   Ravi</td><td>-2,500.50</td><td>1,70,954.50</td></tr>
</table>
</td></tr></table></body></html>
''')

# xml2003.xml — SpreadsheetML
open(f'{D}/xml2003.xml', 'w', encoding='utf-8').write('''<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Orders">
  <Table>
   <Row><Cell><Data ss:Type="String">Item</Data></Cell><Cell><Data ss:Type="String">Qty</Data></Cell><Cell><Data ss:Type="String">Paid</Data></Cell><Cell><Data ss:Type="String">When</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Tea</Data></Cell><Cell><Data ss:Type="Number">3</Data></Cell><Cell><Data ss:Type="Boolean">1</Data></Cell><Cell><Data ss:Type="DateTime">2026-11-20T00:00:00.000</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Coffee</Data></Cell><Cell><Data ss:Type="Number">2.5</Data></Cell><Cell><Data ss:Type="Boolean">0</Data></Cell><Cell><Data ss:Type="DateTime">2026-11-21T10:30:00.000</Data></Cell></Row>
   <Row ss:Index="5"><Cell ss:MergeAcross="1"><Data ss:Type="String">Total</Data></Cell><Cell ss:Index="4"><Data ss:Type="Number">5.5</Data></Cell></Row>
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Notes">
  <Table>
   <Row><Cell ss:Index="2"><Data ss:Type="String">second column</Data></Cell></Row>
  </Table>
 </Worksheet>
</Workbook>
''')

# cp1252.csv and utf16.txt
open(f'{D}/cp1252.csv', 'wb').write('Name;Price;Note\r\ncafé;3,50;crème brûlée\r\nJürgen;12;"a; b"\r\n'.encode('cp1252'))
open(f'{D}/utf16.txt', 'wb').write('﻿Name\tCity\tAmount\r\nZoë\tMünchen\t12.5\r\n"Rao, Asha"\tPune\t7\r\n'.encode('utf-16-le'))

# reference: LibreOffice's CSV of every sheet, the cells as shown
ref = {'libreoffice': subprocess.run(['soffice', '--version'], capture_output=True, text=True).stdout.strip(), 'files': {}}
tmp = tempfile.mkdtemp()
for f, infilter in [('kinds.xlsx', None), ('base.xlsx', None), ('base.xls', None), ('base.ods', None), ('bank.xls', 'HTML (StarCalc)'), ('xml2003.xml', 'MS Excel 2003 XML')]:
    out = os.path.join(tmp, f.replace('.', '_')); os.makedirs(out)
    cmd = ['soffice', '--headless', '--norestore']
    if infilter: cmd += [f'--infilter={infilter}']
    # 44 comma, 34 quote, 76 UTF-8, row 1, formatting, language default, quoted text no, numbers as shown, formulas no,
    # … sheet -1 = every sheet into its own file
    cmd += ['--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1', os.path.abspath(f'{D}/{f}'), '--outdir', out]
    subprocess.run(cmd, check=True, capture_output=True, timeout=180)
    sheets = {}
    stem = os.path.splitext(f)[0]
    for p in sorted(glob.glob(f'{out}/*.csv')):
        name = os.path.basename(p)[len(stem) + 1:-4] if os.path.basename(p).startswith(stem + '-') else os.path.basename(p)[:-4]
        rows = list(csv.reader(io.StringIO(open(p, encoding='utf-8').read())))
        sheets[name] = rows
    ref['files'][f] = sheets
shutil.rmtree(tmp)
ref['files']['cp1252.csv'] = {'CSV': list(csv.reader(io.StringIO(open(f'{D}/cp1252.csv', encoding='cp1252', newline='').read()), delimiter=';'))}
ref['files']['utf16.txt'] = {'CSV': list(csv.reader(io.StringIO(open(f'{D}/utf16.txt', encoding='utf-16', newline='').read()), delimiter='\t'))}
json.dump(ref, open(f'{D}/reference.json', 'w'), ensure_ascii=False, indent=0)
print({f: {k: len(v) for k, v in s.items()} for f, s in ref['files'].items()})
