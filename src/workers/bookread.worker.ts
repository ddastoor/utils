// The Audiobook tab's reading worker: MuPDF (Artifex's official WebAssembly build) reads the book — EPUB, MOBI, FictionBook,
// plain text, a web page, or a PDF through the PDF → EPUB engine — into tracks of text (src/lib/audiobook.ts). The worker
// ends when the book has been read (or the tab is left), and MuPDF's memory with it.
import { openFile, Refused, NeedsUnpacking } from '../lib/ebook';
import { readReflowable, readPdf } from '../lib/audiobook';
import { textcore } from '../wasm/textcore';
import { imgprocDirect } from '../wasm/imgproc';

const post = (m: unknown, transfer: Transferable[] = []) => (self as any).postMessage(m, transfer);
// MuPDF is imported here, not at the top: its module waits for its WebAssembly (a top-level await), and a message that
// reaches a module worker while it waits finds no handler and is lost (the EPUB Reader's first book never opened)
let mupdf: typeof import('mupdf');
const ready = import('mupdf').then((m) => { mupdf = m; m.setLog({ warning: () => {}, error: () => {} }); });
/** pictures of a PDF are not needed here (the engine asks for them; it gets an empty JPEG) */
const NO_PICTURE = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

/** A PDF's first page, as a picture for the MP3s' cover (at most 600 px wide). */
function pdfCover(doc: any): { bytes: Uint8Array; mime: string } | undefined {
  try {
    const page = doc.loadPage(0), b = page.getBounds(), s = Math.min(2, 600 / Math.max(1, b[2] - b[0]));
    const pix = page.toPixmap([s, 0, 0, s, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true);
    const bytes = new Uint8Array(pix.asPNG());
    pix.destroy?.(); page.destroy?.();
    return { bytes, mime: 'image/png' };
  } catch { return undefined; }
}

self.onmessage = async (ev: MessageEvent<{ id: number; bytes: Uint8Array; name: string; notes: boolean; password?: string }>) => {
  const m = ev.data;
  const reply = (result: unknown) => post({ id: m.id, type: 'done', result });
  try {
    await ready;
    const head = String.fromCharCode(...m.bytes.subarray(0, 5));
    if (head === '%PDF-') {
      const doc = mupdf.Document.openDocument(m.bytes, 'application/pdf');
      if (doc.needsPassword()) {
        if (!m.password) return reply({ password: true });
        if (!doc.authenticatePassword(m.password)) return reply({ password: true, wrong: true });
      }
      const [tc, ip] = await Promise.all([textcore(), imgprocDirect()]);
      const book = await readPdf(doc, { m: mupdf, tc, ip, jpeg: async () => NO_PICTURE }, { notes: m.notes }, (done, of, phase) => post({ id: m.id, type: 'progress', done, of, phase }));
      if (!book.words) return reply({ refused: `${m.name} has no text to read: its pages are pictures (a scan). The OCR tab reads the text of a page's picture.` });
      book.cover = pdfCover(doc);
      return reply({ book });
    }
    const o = openFile(m.bytes, m.name);
    if (o.kind === 'cbz' || o.kind === 'cbt') return reply({ refused: `${m.name} is a comic: its pages are pictures, with no text to read aloud.` });
    const book = readReflowable(mupdf, o, m.name, { notes: m.notes });
    if (!book.words) return reply({ refused: `${m.name} has no text to read.` });
    return reply({ book });
  } catch (e: any) {
    if (e instanceof Refused) return reply({ refused: e.message.replace(/The browser shows a PDF[\s\S]*$/, '').trim() });
    if (e instanceof NeedsUnpacking) return reply({ refused: `${m.name} is a comic (${e.format}): its pages are pictures, with no text to read aloud.` });
    post({ id: m.id, type: 'error', message: String(e?.message || e) });
  }
};
