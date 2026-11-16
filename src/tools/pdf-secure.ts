// Unlock PDF (remove a password you know) and Protect PDF (AES-256 password, optional restrictions) — MuPDF wasm.
import { h, card, field, stack, note, actions, button, toggle, input, type Mount } from '../ui';
import { savePdf } from '../lib/pdf';
import { pdfInput, savePdfFile, stem, type LoadedPdf } from '../lib/pdfui';

const encryption = (f: LoadedPdf) => f.doc.getMetaData('encryption') || 'None';
const isEncrypted = (f: LoadedPdf) => !/^none$/i.test(encryption(f));

export const unlock: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null;
  const info = h('div', { class: 'stack' });
  const inp = pdfInput({ onLoad: ([x]) => {
    f = x;
    info.replaceChildren(isEncrypted(x)
      ? note(x.password !== undefined ? `${x.name}: password accepted (${encryption(x)}). Save to get a copy that opens without it.` : `${x.name} has no open password but has restrictions (${encryption(x)}). Save to remove them.`, 'ok')
      : note(`${x.name} is not protected — there is nothing to remove.`, 'info'));
  } });
  root.append(card(null, inp.el, info, note('Only for PDFs whose password you know (bank statements, Aadhaar, Form 16…). The password never leaves this browser.')),
    actions(button('Save without password', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      if (!isEncrypted(f)) throw new Error('This PDF is not protected.');
      await savePdfFile(savePdf(f.doc, 'encrypt=none'), `${stem(f.name)}-unlocked.pdf`, ctx.isMobile);
    }, { variant: 'primary', icon: 'LockOpen' })));
};

// PDF permission bits (ISO 32000 table 22): print 3 + high-quality print 12, modify 4 + annotate 6 + fill 9 + assemble 11,
// copy 5 + accessibility 10. Unlisted bits must be 1, so P = ~ALL | allowed (a negative 32-bit number).
const PRINT = 4 | 2048, EDIT = 8 | 32 | 256 | 1024, COPY = 16 | 512, ALL = PRINT | EDIT | COPY;
export const permissionsValue = (o: { print: boolean; copy: boolean; edit: boolean }) => (~ALL | (o.print ? PRINT : 0) | (o.copy ? COPY : 0) | (o.edit ? EDIT : 0)) | 0;

export const protect: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null;
  const perm = { print: true, copy: true, edit: true };
  const info = h('div', { class: 'muted small' });
  const pw = input({ type: 'password', placeholder: 'Password', autocomplete: 'new-password' } as any) as HTMLInputElement;
  const pw2 = input({ type: 'password', placeholder: 'Repeat the password', autocomplete: 'new-password' } as any) as HTMLInputElement;
  const owner = input({ type: 'password', placeholder: 'Optional — a random one is used if empty', autocomplete: 'new-password' } as any) as HTMLInputElement;
  const show = toggle('Show passwords', false, (v) => { for (const e of [pw, pw2, owner]) e.type = v ? 'text' : 'password'; });
  const inp = pdfInput({ onLoad: ([x]) => { f = x; info.textContent = `${x.name}${isEncrypted(x) ? ` (currently ${encryption(x)} — it will be replaced)` : ''}`; } });
  root.append(card(null, inp.el, info),
    card('Password', stack(field('Password to open the PDF', pw), field('Repeat', pw2), show)),
    card('Restrictions (optional)', stack(
      toggle('Allow printing', true, (v) => (perm.print = v)), toggle('Allow copying text', true, (v) => (perm.copy = v)), toggle('Allow changes (edit, comment, fill forms)', true, (v) => (perm.edit = v)),
      field('Permissions password', owner, 'Lets you lift the restrictions later. Restrictions are honoured by most PDF apps but are not a security boundary.'))),
    note('AES-256 encryption (PDF 2.0 / Acrobat X standard): opens in every current PDF reader. Keep the password safe — it cannot be recovered.'),
    actions(button('Protect PDF', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      const p = pw.value, o = owner.value || Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
      if (!p) throw new Error('Enter a password.');
      if (p !== pw2.value) throw new Error('The passwords do not match.');
      if (/[,]/.test(p + owner.value)) throw new Error('Passwords cannot contain commas (a limit of the PDF engine’s options).');
      const opts = `encrypt=aes-256,user-password=${p},owner-password=${o},permissions=${permissionsValue(perm)}`;
      await savePdfFile(savePdf(f.doc, opts), `${stem(f.name)}-protected.pdf`, ctx.isMobile);
    }, { variant: 'primary', icon: 'FileLock' })));
};
