// PDF → EPUB for Kindle (Paperwhite / Scribe). MuPDF (official wasm) gives the text lines, fonts and images of each
// page; reading order and columns come from an XY-cut in textcore.wasm (own C); figures (raster and vector) are found
// as ink outside the text in imgproc.wasm (own C) and cropped from a page rendering. One XHTML file per PDF page keeps
// the page breaks; columns are labelled "Page N · Column K". EPUB 3 with a nav document and an NCX for older readers.
import { zipSync, strToU8 } from 'fflate';
import { mupdf } from './pdf';
import { textcore } from '../wasm/textcore';
import { imgprocDirect, type Img } from '../wasm/imgproc';
import { encodeImg } from './imgio';

export interface EpubOptions { mode: 'reflow' | 'columns'; width: number; grey: boolean; removeHeaders: boolean; labels: boolean; pages?: number[]; title?: string; author?: string }
export interface PageReport { page: number; columns: number; figures: number; how: 'text' | 'columns' | 'image'; note?: string }
type Line = { x0: number; y0: number; x1: number; y1: number; size: number; bold: boolean; italic: boolean; text: string };
type Fig = { x0: number; y0: number; x1: number; y1: number };
type Item = { kind: 'line'; l: Line } | { kind: 'fig'; f: Fig };

export const DEVICES = { paperwhite: 1236, scribe: 1860 } as const;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const median = (a: number[]) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const garbled = (t: string) => { const bad = (t.match(/[�-\u0000-\u0008]/g) || []).length; return t.length > 20 && bad / t.length > 0.1; };
const pageNumberLike = /^\s*(page\s*)?[\divxlc]{1,6}(\s*(of|\/)\s*\d+)?\s*$/i;

function readPage(page: any, W: number): { lines: Line[]; images: Fig[] } {
  const j = JSON.parse(page.toStructuredText('preserve-images,preserve-whitespace').asJSON());
  const lines: Line[] = [], images: Fig[] = [];
  for (const b of j.blocks || []) {
    if (b.type === 'image') { images.push({ x0: b.bbox.x, y0: b.bbox.y, x1: b.bbox.x + b.bbox.w, y1: b.bbox.y + b.bbox.h }); continue; }
    let last: Line | null = null;
    for (const l of b.lines || []) {
      const text = String(l.text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const cur: Line = { x0: l.bbox.x, y0: l.bbox.y, x1: Math.min(W, l.bbox.x + l.bbox.w), y1: l.bbox.y + l.bbox.h, size: l.font?.size || 10, bold: l.font?.weight === 'bold', italic: l.font?.style === 'italic', text };
      // MuPDF breaks a justified line at wide word gaps: join pieces on the same baseline
      const sameLine = !!last && Math.min(last.y1, cur.y1) - Math.max(last.y0, cur.y0) > 0.6 * Math.min(last.y1 - last.y0, cur.y1 - cur.y0) && cur.x0 > last.x1 - 1 && cur.x0 - last.x1 < cur.size * 3;
      if (sameLine && last) { last.text += ' ' + text; last.x1 = Math.max(last.x1, cur.x1); last.y0 = Math.min(last.y0, cur.y0); last.y1 = Math.max(last.y1, cur.y1); last.bold &&= cur.bold; continue; }
      lines.push(cur); last = cur;
    }
  }
  return { lines, images };
}

/** Running headers / footers: lines near the top or bottom that repeat (digits ignored) on many pages, and bare page numbers. */
function headerKeys(pages: Array<{ lines: Line[]; H: number }>) {
  const count = new Map<string, number>();
  // letters only, first 12: page numbers and OCR slips at the end ("VICKSBUEG") still match
  const key = (l: Line) => l.text.toLowerCase().replace(/[^\p{L}]+/gu, '').slice(0, 12) || l.text.replace(/\s+/g, '');
  for (const p of pages) {
    const seen = new Set<string>();
    for (const l of p.lines) if (l.y1 < p.H * 0.1 || l.y0 > p.H * 0.9) seen.add(key(l));
    for (const k of seen) count.set(k, (count.get(k) || 0) + 1);
  }
  const min = Math.max(2, Math.ceil(pages.length * 0.4));
  return (l: Line, H: number) => (l.y1 < H * 0.1 || l.y0 > H * 0.9) && (pageNumberLike.test(l.text) || (count.get(key(l)) || 0) >= min);
}

/** Paragraphs and headings from the lines of one column, in order. */
function toHtml(lines: Line[], body: number, pagePitch: number): string {
  const out: string[] = [];
  // line pitch (top to top) is steadier than the gaps between line boxes
  const pitch = pagePitch || body * 1.2, width = Math.max(...lines.map((l) => l.x1)) - Math.min(...lines.map((l) => l.x0));
  let para = '', kind: 'p' | 'h' = 'p', prev: Line | null = null, hsize = 0;
  const flush = () => { if (para.trim()) out.push(kind === 'h' ? `<h${hsize >= body * 1.6 ? 2 : 3}>${esc(para.trim())}</h${hsize >= body * 1.6 ? 2 : 3}>` : `<p>${esc(para.trim())}</p>`); para = ''; };
  for (const l of lines) {
    const isHead = l.size >= body * 1.18 || (l.bold && l.text.length < 80 && !/[.,;:]$/.test(l.text) && /^[\p{Lu}\d]/u.test(l.text));
    const newBlock = !prev || isHead !== (kind === 'h') || (isHead && Math.abs(l.size - hsize) > 0.5) || (Math.abs(l.size - prev.size) > 0.8 && /[.!?:"”)]$/.test(prev.text)) // caption → text (OCR layers vary the size line by line, so only after a sentence end)
      || l.y0 - prev.y0 > pitch * 1.35 + 0.5                                                                    // blank space
      || (!isHead && /[.!?:"”)]$/.test(prev.text) && (l.x0 > prev.x0 + body * 0.8 || prev.x1 < prev.x0 + width * 0.8)); // indent / short last line
    if (newBlock) { flush(); kind = isHead ? 'h' : 'p'; hsize = l.size; para = l.text; }
    else if (/\p{L}{2,}[-\u00ad]$/u.test(para) && /^\p{Ll}/u.test(l.text)) para = para.replace(/[-\u00ad]$/, '') + l.text; // de-hyphenate ("experi-ment")
    else if (/[-\u00ad]$/.test(para)) para += l.text; // "e-reader": a one-letter prefix keeps its hyphen
    else para += ' ' + l.text;
    prev = l;
  }
  flush();
  return out.join('\n');
}

export async function pdfToEpub(doc: any, o: EpubOptions, onProgress?: (done: number, of: number) => void): Promise<{ epub: Uint8Array; report: PageReport[] }> {
  const m = await mupdf(), tc = await textcore(), ip = await imgprocDirect();
  const n = doc.countPages(), list = (o.pages?.length ? o.pages : Array.from({ length: n }, (_, i) => i)).filter((i) => i >= 0 && i < n);
  // pass 1: text of every chosen page (needed to spot running headers)
  const pages = list.map((i) => { const p = doc.loadPage(i), [x0, y0, x1, y1] = p.getBounds(), W = x1 - x0, H = y1 - y0; return { i, p, W, H, ...readPage(p, W) }; });
  const isHeader = o.removeHeaders ? headerKeys(pages) : () => false;
  const files: Record<string, any> = {}, report: PageReport[] = [], manifest: string[] = [], spine: string[] = [], toc: Array<{ file: string; label: string }> = [];
  let imgNo = 0;
  const addImage = async (img: Img) => {
    let im = img; if (o.grey) im = ip.grayscale(im);
    const bytes = new Uint8Array(await (await encodeImg(im, 'jpeg', 80, o.grey ? { color_space: 1 } : {})).arrayBuffer());
    const name = `images/i${String(++imgNo).padStart(4, '0')}.jpg`;
    files[`OEBPS/${name}`] = [bytes, { level: 0 }]; manifest.push(`<item id="img${imgNo}" href="${name}" media-type="image/jpeg"/>`);
    return `<img src="${name}" alt=""/>`;
  };
  for (const [k, pg] of pages.entries()) {
    onProgress?.(k, pages.length);
    const lines = pg.lines.filter((l) => !isHeader(l, pg.H));
    const render = (sc: number) => { const pix = pg.p.toPixmap(m.Matrix.scale(sc, sc), m.ColorSpace.DeviceRGB, false, true); const im = ip.expand(pix.getPixels(), pix.getWidth(), pix.getHeight(), pix.getNumberOfComponents()); pix.destroy?.(); return im; };
    // figures and column pictures are rendered so that a column is as wide as the e-reader screen (set below)
    let scale = o.width / pg.W, full: Img | null = null;
    const crop = (r: Fig) => {
      full ||= render(scale);
      const c = ip.crop(full, Math.max(0, Math.floor(r.x0 * scale)), Math.max(0, Math.floor(r.y0 * scale)), Math.ceil((r.x1 - r.x0) * scale), Math.ceil((r.y1 - r.y0) * scale));
      return c.width > o.width ? ip.resize(c, o.width, Math.round((c.height * o.width) / c.width)) : c;
    };
    const pageNo = pg.i + 1, file = `p${String(pageNo).padStart(4, '0')}.xhtml`;
    let html = '', rep: PageReport;
    const coverage = pg.images.reduce((a, b) => Math.max(a, ((b.x1 - b.x0) * (b.y1 - b.y0)) / (pg.W * pg.H)), 0);
    if (lines.length < 2 && (coverage > 0.5 || !lines.length)) {
      // scanned page without a text layer, or an empty page: the page as a picture
      html = `<div class="fig full">${await addImage(render(o.width / pg.W))}</div>`;
      rep = { page: pageNo, columns: 0, figures: 0, how: 'image', note: lines.length ? undefined : 'no text layer' };
    } else {
      // figures: raster images (except a full-page scan under an OCR text layer) + vector drawings found as ink outside the text
      const s2 = 1.5, small = render(s2);
      const skip = lines.map((l) => [l.x0 * s2 - 2, l.y0 * s2 - 2, (l.x1 - l.x0) * s2 + 4, (l.y1 - l.y0) * s2 + 4] as [number, number, number, number]);
      const ink = ip.inkRegions(small, skip, { thr: 215, dil: 7, minArea: Math.round(36 * 36 * s2 * s2) }).map((r) => ({ x0: r.x / s2, y0: r.y / s2, x1: (r.x + r.w) / s2, y1: (r.y + r.h) / s2 }));
      const figs: Fig[] = [];
      for (const f of [...pg.images.filter((b) => ((b.x1 - b.x0) * (b.y1 - b.y0)) / (pg.W * pg.H) < 0.7), ...ink]) {
        if (f.x1 - f.x0 < 24 || f.y1 - f.y0 < 18) continue;
        const hit = figs.find((g) => f.x0 < g.x1 + 4 && f.x1 > g.x0 - 4 && f.y0 < g.y1 + 4 && f.y1 > g.y0 - 4);
        if (hit) { hit.x0 = Math.min(hit.x0, f.x0); hit.y0 = Math.min(hit.y0, f.y0); hit.x1 = Math.max(hit.x1, f.x1); hit.y1 = Math.max(hit.y1, f.y1); } else figs.push({ ...f });
      }
      // lines inside a figure (labels in a diagram) belong to the figure
      const textLines = lines.filter((l) => !figs.some((f) => l.x0 >= f.x0 - 1 && l.x1 <= f.x1 + 1 && l.y0 >= f.y0 - 1 && l.y1 <= f.y1 + 1));
      const items: Item[] = [...textLines.map((l) => ({ kind: 'line' as const, l })), ...figs.map((f) => ({ kind: 'fig' as const, f }))];
      const r = tc.xycut(items.map((it) => (it.kind === 'line' ? [it.l.x0, it.l.y0, it.l.x1, it.l.y1] : [it.f.x0, it.f.y0, it.f.x1, it.f.y1])), 8, 2);
      // the page's usual line pitch (top to top, same column) decides what counts as a blank line
      const sorted = [...textLines].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0), pagePitch = median(sorted.slice(1).map((l, i) => l.y0 - sorted[i].y0).filter((g, i) => g > 0 && g < 40 && Math.abs(sorted[i + 1].x0 - sorted[i].x0) < 30));
      const body = median(textLines.flatMap((l) => Array(Math.max(1, Math.round(l.text.length / 10))).fill(Math.round(l.size * 2) / 2)));
      // segments: runs of the same column
      const segs: Array<{ col: number; items: Item[] }> = [];
      r.order.forEach((ix, p) => { const c = r.col[p]; if (!segs.length || segs[segs.length - 1].col !== c) segs.push({ col: c, items: [] }); segs[segs.length - 1].items.push(items[ix]); });
      const columns = new Set(r.col.filter((c) => c > 0)).size;
      const wOf = (its: Item[]) => { const b = its.map((it) => (it.kind === 'line' ? it.l : it.f)); return Math.max(...b.map((x) => x.x1)) - Math.min(...b.map((x) => x.x0)); };
      const colW = Math.min(...segs.filter((sg) => sg.col > 0 || columns < 2).map((sg) => wOf(sg.items)).filter((w) => w > 40), pg.W);
      scale = Math.min(o.width / colW, (3 * o.width) / pg.W);
      const parts: string[] = [];
      for (const s of segs) {
        if (columns > 1 && s.col > 0 && o.labels) parts.push(`<h4 class="col">Page ${pageNo} · Column ${s.col}</h4>`);
        const segLines = s.items.filter((it) => it.kind === 'line').map((it) => (it as any).l as Line);
        if (o.mode === 'columns' || segLines.some((l) => garbled(l.text))) {
          // the column as one picture (chosen, or text that cannot be read)
          const b = s.items.map((it) => (it.kind === 'line' ? it.l : it.f));
          parts.push(`<div class="fig">${await addImage(crop({ x0: Math.min(...b.map((x) => x.x0)) - 2, y0: Math.min(...b.map((x) => x.y0)) - 2, x1: Math.max(...b.map((x) => x.x1)) + 2, y1: Math.max(...b.map((x) => x.y1)) + 2 }))}</div>`);
          continue;
        }
        let run: Line[] = [];
        const emit = () => { if (run.length) parts.push(toHtml(run, body || 10, pagePitch)); run = []; };
        for (const it of s.items) {
          if (it.kind === 'line') run.push(it.l);
          else { emit(); parts.push(`<div class="fig">${await addImage(crop({ x0: it.f.x0 - 3, y0: it.f.y0 - 3, x1: it.f.x1 + 3, y1: it.f.y1 + 3 }))}</div>`); }
        }
        emit();
      }
      html = parts.join('\n');
      rep = { page: pageNo, columns, figures: figs.length, how: o.mode === 'columns' ? 'columns' : 'text' };
    }
    report.push(rep);
    const firstHeading = /<h[23]>([^<]{1,80})<\/h[23]>/.exec(html)?.[1];
    files[`OEBPS/${file}`] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en"><head><meta charset="utf-8"/><title>Page ${pageNo}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body><section class="page" id="page${pageNo}" epub:type="chapter"><p class="pgno">Page ${pageNo}</p>\n${html}\n</section></body></html>\n`);
    manifest.push(`<item id="pg${pageNo}" href="${file}" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="pg${pageNo}"/>`);
    toc.push({ file, label: `Page ${pageNo}${firstHeading ? ` — ${firstHeading}` : ''}` });
  }
  onProgress?.(pages.length, pages.length);
  const title = esc(o.title || 'Document'), author = esc(o.author || ''), id = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files['OEBPS/style.css'] = strToU8(`body { margin: 0 3%; line-height: 1.45; } p { margin: 0 0 0.6em; text-indent: 0; text-align: left; } h2, h3 { margin: 1em 0 0.4em; line-height: 1.25; }
.pgno { font-size: 0.75em; color: #666; margin: 0 0 0.8em; border-bottom: 1px solid #bbb; } .page { page-break-before: always; }
h4.col { font-size: 0.8em; color: #555; font-weight: bold; margin: 1em 0 0.4em; text-transform: none; }
.fig { text-align: center; margin: 0.6em 0; } .fig img { max-width: 100%; height: auto; } .full img { width: 100%; }\n`);
  files['OEBPS/nav.xhtml'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><meta charset="utf-8"/><title>${title}</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${toc.map((t) => `<li><a href="${t.file}">${t.label}</a></li>`).join('')}</ol></nav></body></html>\n`);
  files['OEBPS/toc.ncx'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${title}</text></docTitle><navMap>${toc.map((t, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${t.label}</text></navLabel><content src="${t.file}"/></navPoint>`).join('')}</navMap></ncx>\n`);
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${title}</dc:title>${author ? `<dc:creator>${author}</dc:creator>` : ''}<dc:language>en</dc:language><meta property="dcterms:modified">${modified}</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>${manifest.join('')}</manifest>
<spine toc="ncx">${spine.join('')}</spine></package>\n`);
  const epub = zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n'),
    ...files,
  });
  return { epub, report };
}
