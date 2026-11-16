// Shared UI for the PDF tools: a PDF picker that asks for the password of protected files, and output helpers.
import { h, filePicker, button, input, toast, errMsg, downloadBlob, shareOrDownload, baseName } from '../ui';
import { openPdf, PdfPasswordError } from './pdf';

export type MDoc = Awaited<ReturnType<typeof openPdf>>;
export interface LoadedPdf { name: string; bytes: Uint8Array; doc: MDoc; pages: number; password?: string }

/** Picker for PDFs. Protected files show a password box (the password is only used in this tab). */
export function pdfInput(o: { multiple?: boolean; label?: string; onLoad: (files: LoadedPdf[]) => void }) {
  const asks = h('div', { class: 'stack' });
  const ask = (name: string, wrong: boolean) => new Promise<string | null>((resolve) => {
    const pw = input({ type: 'password', placeholder: 'Password' }) as HTMLInputElement;
    const done = (v: string | null) => { box.remove(); resolve(v); };
    pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(pw.value); });
    const box = h('div', { class: 'card pdf-pw' },
      h('div', null, h('strong', null, name), wrong ? ' — wrong password, try again:' : ' is password-protected. Enter its password to open it:'),
      h('div', { class: 'row' }, pw, button('Open', () => done(pw.value), { variant: 'primary', small: true }), button('Skip', () => done(null), { variant: 'ghost', small: true })));
    asks.append(box); pw.focus();
  });
  const handle = async (files: File[]) => {
    const out: LoadedPdf[] = [];
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let password: string | undefined, wrong = false;
      for (;;) {
        try { const doc = await openPdf(bytes, password); out.push({ name: f.name, bytes, doc, pages: doc.countPages(), password }); break; }
        catch (e) {
          if (!(e instanceof PdfPasswordError)) { toast(`${f.name}: ${errMsg(e)}`, 'err'); break; }
          const p = await ask(f.name, wrong); if (p === null) break; password = p; wrong = true;
        }
      }
    }
    if (out.length) o.onLoad(out);
  };
  const picker = filePicker({ accept: 'application/pdf,.pdf', multiple: o.multiple, label: o.label || (o.multiple ? 'Choose PDF files' : 'Choose a PDF'), onFiles: handle });
  return { el: h('div', { class: 'stack' }, picker, asks), picker };
}

/** Save bytes as a file (share sheet on phones). */
export const savePdfFile = (bytes: Uint8Array, name: string, mobile: boolean) => {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  return mobile ? shareOrDownload(blob, name) : downloadBlob(blob, name);
};
export const stem = (name: string) => baseName(name).replace(/[\\/:*?"<>|]+/g, '_') || 'document';
