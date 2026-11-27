#!/usr/bin/env python3
"""The Word documents the Watermark tab's suites watermark (to-do #17): tests/fixtures/docs/sections.docx — and, for
to-do #34 (the cover without the mark), tests/fixtures/docs/cover.docx (below).

Four sections of three page shapes, so that every way Word picks a header is there:
  1. A4 portrait, its own default header ("Header of section 1"), two pages;
  2. A4 landscape on a new page, its headers linked to the previous section (no references of its own — Word uses
     section 1's);
  3. US Letter portrait, "different first page" (titlePg) with a first-page header of its own, two pages;
  4. A4 portrait again, its default header its own with a table at the top of it; "different first page" on, with no
     first-page header of its own (Word uses section 3's).
"Different odd and even pages" is on for the whole document, so even pages have headers of their own (section 1's
even header; the others inherit it or have none).
Needs: pip install python-docx  (1.2.0 used). Deterministic: python-docx writes no dates of its own here."""
import sys
from pathlib import Path
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.shared import Mm, Inches

out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'tests/fixtures/docs/sections.docx')
d = Document()
d.settings.odd_and_even_pages_header_footer = True
cp = d.core_properties
cp.author = 'SuperUtils tests'; cp.title = 'Sections'; cp.revision = 1
import datetime
cp.created = cp.modified = datetime.datetime(2026, 11, 26, 12, 0, 0)
lorem = ('The quick brown fox jumps over the lazy dog. ' * 9).strip()

def body(n, label):
    for i in range(n):
        d.add_paragraph(f'{label}, paragraph {i + 1}. {lorem}')

s1 = d.sections[0]
s1.page_width, s1.page_height = Mm(210), Mm(297)
s1.orientation = WD_ORIENT.PORTRAIT
s1.header.is_linked_to_previous = False
s1.header.paragraphs[0].text = 'Header of section 1'
s1.even_page_header.is_linked_to_previous = False
s1.even_page_header.paragraphs[0].text = 'Even header of section 1'
d.add_heading('Section 1 — A4 portrait', 1)
body(14, 'Section 1')

s2 = d.add_section(WD_SECTION.NEW_PAGE)
s2.orientation = WD_ORIENT.LANDSCAPE
s2.page_width, s2.page_height = Mm(297), Mm(210)
s2.header.is_linked_to_previous = True
s2.even_page_header.is_linked_to_previous = True
d.add_heading('Section 2 — A4 landscape, headers linked to section 1', 1)
body(6, 'Section 2')

s3 = d.add_section(WD_SECTION.NEW_PAGE)
s3.orientation = WD_ORIENT.PORTRAIT
s3.page_width, s3.page_height = Inches(8.5), Inches(11)
s3.different_first_page_header_footer = True
s3.first_page_header.is_linked_to_previous = False
s3.first_page_header.paragraphs[0].text = 'First-page header of section 3'
s3.header.is_linked_to_previous = True
d.add_heading('Section 3 — US Letter, a different first page', 1)
body(14, 'Section 3')

s4 = d.add_section(WD_SECTION.NEW_PAGE)
s4.page_width, s4.page_height = Mm(210), Mm(297)
s4.header.is_linked_to_previous = False
s4.different_first_page_header_footer = True  # its first page: section 3's first-page header, inherited
s4.first_page_header.is_linked_to_previous = True
h4 = s4.header
h4.paragraphs[0].text = 'Under the table of section 4'
t = h4.add_table(1, 2, Inches(6))
t.cell(0, 0).text, t.cell(0, 1).text = 'Section 4', 'a table in the header'
# the table first: move it before the paragraph
h4._element.remove(t._tbl); h4._element.insert(0, t._tbl)
d.add_heading('Section 4 — A4 portrait, a table at the top of its header', 1)
body(4, 'Section 4')

out.parent.mkdir(parents=True, exist_ok=True)
d.save(out)
print(out, out.stat().st_size, 'bytes')

# ---------------------------------------------------------------- cover.docx (to-do #34: the first page, the cover,
# without the mark). A report of two sections:
#   1. A4 portrait, three pages, "Different first page" OFF — its default header ("Report header") and its default
#      footer ("Report footer · page" and a PAGE field) are on page 1 too; and a first-page header and footer that are
#      NOT in use ("Stale first-page header / footer": Word keeps them when "Different first page" is switched off);
#   2. A4 portrait on a new page, "Different first page" ON with no first-page header or footer of its own: Word gives
#      its first page section 1's first-page header and footer (the stale ones) — the watermark must keep them there.
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
c = Document()
cp = c.core_properties
cp.author = 'SuperUtils tests'; cp.title = 'Cover'; cp.revision = 1
cp.created = cp.modified = datetime.datetime(2026, 11, 27, 12, 0, 0)
r1 = c.sections[0]
r1.page_width, r1.page_height = Mm(210), Mm(297)
r1.header.is_linked_to_previous = False
r1.header.paragraphs[0].text = 'Report header'
r1.footer.is_linked_to_previous = False
fp = r1.footer.paragraphs[0]
fp.text = 'Report footer · page '
fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'), 'PAGE')
run = OxmlElement('w:r'); t = OxmlElement('w:t'); t.text = '1'; run.append(t); fld.append(run); fp._p.append(fld)
r1.different_first_page_header_footer = True
r1.first_page_header.is_linked_to_previous = False
r1.first_page_header.paragraphs[0].text = 'Stale first-page header'
r1.first_page_footer.is_linked_to_previous = False
r1.first_page_footer.paragraphs[0].text = 'Stale first-page footer'
r1.different_first_page_header_footer = False   # switched off again: the two stay in the file, not in use
c.add_heading('Annual report — the cover page', 0)
c.add_paragraph('Prepared for the board. ' * 3)
c.add_page_break()
for i in range(10):
    c.add_paragraph(f'Report, paragraph {i + 1}. {lorem}')
r2 = c.add_section(WD_SECTION.NEW_PAGE)
r2.page_width, r2.page_height = Mm(210), Mm(297)
r2.different_first_page_header_footer = True     # no first-page header or footer of its own: section 1's
r2.header.is_linked_to_previous = True
r2.footer.is_linked_to_previous = True
c.add_heading('Appendix — a section of its own', 1)
for i in range(3):
    c.add_paragraph(f'Appendix, paragraph {i + 1}. {lorem}')
cover = out.parent / 'cover.docx'
c.save(cover)
print(cover, cover.stat().st_size, 'bytes')
