// Create Zip (7-Zip compiled to WebAssembly — 7z-wasm — for zip and 7z with AES-256; zip.js only for zips larger than
// fit in memory) and Extract Archive (zip via zip.js incl. passwords; 7z / rar / tar / gz / bz2 / xz via libarchive
// compiled to WebAssembly).
import { h, card, field, input, button, filePicker, toggle, slider, segmented, clear, stack, note, progress, downloadBlob, fmtBytes, extOf, toast, type Mount } from '../ui';
import { has, isMobile } from '../platform';
import { createArchive, stopSevenZip, Stopped } from '../lib/sevenzip-client';
import { archivePaths, passwordProblem, archiveName } from '../lib/archive-names';

const zipjs = () => import('@zip.js/zip.js');

/** Above this much input, the zip is written by zip.js, which streams; 7-Zip holds the archive in memory. */
const IN_MEMORY = isMobile ? 256 << 20 : 1536 << 20;

export const zip: Mount = (root) => {
  let files: Array<{ file: File; path: string }> = [];
  let level = 6, encrypt = false, format: 'zip' | '7z' = 'zip', encryptNames = true;
  const list = h('div', { class: 'file-list' });
  const name = input({ value: 'archive', attrs: { 'aria-label': 'Archive name' } });
  const pw = input({ type: 'password', placeholder: 'Password', attrs: { autocomplete: 'new-password', 'aria-label': 'Password' } });
  const pw2 = input({ type: 'password', placeholder: 'Repeat password', attrs: { autocomplete: 'new-password', 'aria-label': 'Repeat password' } });
  const namesToggle = toggle('Encrypt the file names too (7z only)', true, (v) => { encryptNames = v; });
  const pwField = stack(field('Password', pw), field('Repeat password', pw2), namesToggle);
  pwField.hidden = true;
  const formatNote = h('div');
  const prog = progress();
  const stopBtn = button('Stop', () => stopSevenZip(), { icon: 'Square' });
  stopBtn.hidden = true;
  const total = () => files.reduce((a, f) => a + f.file.size, 0);
  const render = () => {
    const paths = archivePaths(files.map((f) => f.path));
    clear(list).append(...files.map((f, i) => h('div', { class: 'file-row' }, h('span', { class: 'file-name' }, paths[i]), h('span', { class: 'muted small' }, fmtBytes(f.file.size)),
      button('', () => { files.splice(i, 1); render(); }, { icon: 'X', small: true, variant: 'ghost', title: `Remove ${paths[i]}` }))));
    if (files.length) list.append(h('div', { class: 'muted small' }, `${files.length} file${files.length === 1 ? '' : 's'} · ${fmtBytes(total())}`));
    sync();
  };
  const sync = () => {
    namesToggle.hidden = format !== '7z';
    clear(formatNote);
    if (total() > IN_MEMORY) formatNote.append(note(format === '7z'
      ? `${fmtBytes(total())} is more than a 7z archive can be made of in this browser (${fmtBytes(IN_MEMORY)}) — choose Zip.`
      : `${fmtBytes(total())}: the zip is written piece by piece (zip.js) instead of by 7-Zip, which holds an archive in memory.`, format === '7z' ? 'err' : 'info'));
  };
  const add = (fs: File[]) => { files.push(...fs.map((file) => ({ file, path: (file as any).webkitRelativePath || file.name }))); render(); };
  const folderBtn = h('input', { type: 'file', hidden: true, webkitdirectory: true, multiple: true, onchange: (e: any) => add([...e.target.files]) } as any);
  root.append(card(null, stack(filePicker({ multiple: true, label: 'Add files', onFiles: add }), !('ontouchstart' in window) ? button('Add a folder', () => folderBtn.click(), { small: true, icon: 'FolderPlus' }) : null, folderBtn, list)),
    card('Options', stack(
      field('Format', segmented([['zip', 'Zip — opens everywhere'], ['7z', '7z — smaller, any password']], format, (v) => { format = v as 'zip' | '7z'; sync(); })),
      field('Archive name', name),
      slider({ label: 'Compression level', min: 0, max: 9, value: level, onInput: (v) => (level = v), fmt: (v) => (v === 0 ? 'store (no compression)' : v === 9 ? '9 (smallest, slowest)' : String(v)) }),
      toggle('Password-protect (AES-256)', false, (v) => { encrypt = v; pwField.hidden = !v; }), pwField, formatNote, prog)),
    h('div', { class: 'actions' }, button('Create archive', async () => {
      if (!files.length) throw new Error('Add some files first.');
      const password = encrypt ? pw.value : '';
      if (encrypt) { const why = passwordProblem(pw.value, pw2.value, format); if (why) throw new Error(why); }
      const big = total() > IN_MEMORY;
      if (big && format === '7z') throw new Error(`${fmtBytes(total())} is more than a 7z archive can be made of in this browser — choose Zip.`);
      const paths = archivePaths(files.map((f) => f.path)), items = files.map((f, i) => ({ path: paths[i], file: f.file }));
      const fname = archiveName(name.value, format);
      if (!big) {
        stopBtn.hidden = false;
        try {
          const data = await createArchive(items, { format, level, password, encryptNames }, (p) => prog.set(p / 100, `7-Zip: ${p} %`));
          downloadBlob(new Blob([data as BlobPart], { type: format === 'zip' ? 'application/zip' : 'application/x-7z-compressed' }), fname);
        } catch (e) { if (e instanceof Stopped) { toast('Stopped.'); return; } throw e; }
        finally { prog.done(); stopBtn.hidden = true; }
        return;
      }
      // beyond what fits in memory: zip.js writes the zip piece by piece (the browser's own deflate; WinZip AES)
      const { ZipWriter, BlobWriter, BlobReader } = await zipjs();
      const w = new ZipWriter(new BlobWriter('application/zip'), { level, password: password || undefined, encryptionStrength: 3, useUnicodeFileNames: true } as any);
      const all = total() || 1;
      let done = 0;
      for (const it of items) {
        await w.add(it.path, new BlobReader(it.file), { lastModDate: new Date(it.file.lastModified), onprogress: async (p) => prog.set((done + p) / all, `Adding ${it.path}`) });
        done += it.file.size;
      }
      const blob = await w.close();
      prog.done();
      downloadBlob(blob, fname);
    }, { variant: 'primary', icon: 'FileArchive' }), stopBtn),
    note('Made by 7-Zip (compiled to WebAssembly) on this device. Password-protected zips use AES-256: Windows\' own zip folders and macOS Archive Utility cannot open them — use 7-Zip, WinRAR, PeaZip, Keka (Mac) or this site\'s Extract Archive tab. 7z archives open in the same tools.'));
  sync();
};

type Entry = { path: string; size: number; dir: boolean; get: () => Promise<Blob> };

let libarchiveReady: Promise<any> | null = null;
async function libarchive() {
  libarchiveReady ||= import('libarchive.js/dist/libarchive.js').then((m: any) => { m.Archive.init({ workerUrl: `${import.meta.env.BASE_URL}vendor/libarchive/worker-bundle.js` }); return m.Archive; });
  return libarchiveReady;
}

export const unzip: Mount = (root) => {
  const pw = input({ type: 'password', placeholder: 'Password (only if the archive is encrypted)' });
  const out = h('div', { class: 'stack' });
  const prog = progress();
  let entries: Entry[] = [];
  let srcName = 'archive';
  const open = async (f: File) => {
    clear(out); entries = []; srcName = f.name.replace(/\.(zip|7z|rar|tar|gz|tgz|bz2|xz|tbz2|txz)$/i, '');
    prog.set(null, 'Reading archive…');
    try {
      if (extOf(f.name) === 'zip' || (await f.slice(0, 4).arrayBuffer().then((b) => new Uint8Array(b).join(','))) === '80,75,3,4') {
        const { ZipReader, BlobReader, BlobWriter } = await zipjs();
        const r = new ZipReader(new BlobReader(f), { password: pw.value || undefined });
        for (const e of await r.getEntries()) entries.push({ path: e.filename, size: e.uncompressedSize, dir: e.directory, get: () => (e as any).getData(new BlobWriter(), { password: pw.value || undefined }) });
      } else {
        const Archive = await libarchive();
        const a = await Archive.open(f);
        if (pw.value) await a.usePassword?.(pw.value);
        for (const { file, path } of await a.getFilesArray()) entries.push({ path: path + file.name, size: file.size, dir: false, get: async () => file.extract() });
      }
    } catch (e: any) { prog.done(); throw new Error(/password|encrypt/i.test(e?.message || '') ? 'This archive is encrypted — enter the password and choose the file again.' : `Could not open: ${e?.message || e}`); }
    prog.done();
    const files = entries.filter((e) => !e.dir);
    const save = async (e: Entry) => {
      try { downloadBlob(await e.get(), e.path.split('/').pop() || 'file'); }
      catch (err: any) { throw new Error(/password|encrypt/i.test(err?.message || '') ? 'Wrong or missing password.' : err?.message || String(err)); } // zip.js: "File contains encrypted entry"
    };
    out.append(card(`${files.length} files · ${fmtBytes(files.reduce((a, e) => a + e.size, 0))}`, h('div', { class: 'file-list' }, files.slice(0, 2000).map((e) => h('div', { class: 'file-row' },
      h('span', { class: 'file-name' }, e.path), h('span', { class: 'muted small' }, fmtBytes(e.size)), button('', () => save(e), { icon: 'Download', small: true, variant: 'ghost', title: 'Download' }))))),
    h('div', { class: 'actions' },
      has.savePicker ? button('Save all to a folder', async () => {
        const dir = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        let n = 0;
        for (const e of files) {
          const parts = e.path.split('/').filter(Boolean); let d = dir;
          for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
          const fh = await d.getFileHandle(parts[parts.length - 1], { create: true }), w = await fh.createWritable();
          await w.write(await e.get()); await w.close(); prog.set(++n / files.length, e.path);
        }
        prog.done();
      }, { variant: 'primary', icon: 'FolderDown' }) : null,
      button('Download all as .zip', async () => {
        const { ZipWriter, BlobWriter, BlobReader } = await zipjs();
        const w = new ZipWriter(new BlobWriter('application/zip'));
        let n = 0;
        for (const e of files) { await w.add(e.path, new BlobReader(await e.get())); prog.set(++n / files.length, e.path); }
        prog.done();
        downloadBlob(await w.close(), `${srcName}.zip`);
      }, { icon: 'FileArchive', variant: has.savePicker ? 'secondary' : 'primary' })));
  };
  root.append(card(null, stack(filePicker({ accept: '.zip,.7z,.rar,.tar,.gz,.tgz,.bz2,.tbz2,.xz,.txz,.cab,.iso,application/zip,application/x-7z-compressed', label: 'Choose an archive', hint: 'zip, 7z, rar, tar, gz, bz2, xz, iso…', onFiles: ([f]) => open(f).catch((e) => out.append(note(e.message, 'err'))) }), pw, prog)), out);
};
void has;
