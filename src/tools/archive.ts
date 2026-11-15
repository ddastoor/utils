// Create Zip (zip.js: deflate + optional AES-256) and Extract Archive (zip via zip.js incl. passwords;
// 7z / rar / tar / gz / bz2 / xz via libarchive compiled to WebAssembly).
import { h, card, field, input, button, filePicker, toggle, slider, clear, stack, note, progress, downloadBlob, fmtBytes, extOf, type Mount } from '../ui';
import { has } from '../platform';

const zipjs = () => import('@zip.js/zip.js');

export const zip: Mount = (root) => {
  let files: Array<{ file: File; path: string }> = [];
  let level = 6, encrypt = false;
  const list = h('div', { class: 'file-list' });
  const name = input({ value: 'archive.zip' });
  const pw = input({ type: 'password', placeholder: 'Password', attrs: { autocomplete: 'new-password' } });
  const pwField = field('Password (AES-256)', pw);
  pwField.hidden = true;
  const prog = progress();
  const render = () => {
    clear(list).append(...files.map((f, i) => h('div', { class: 'file-row' }, h('span', { class: 'file-name' }, f.path), h('span', { class: 'muted small' }, fmtBytes(f.file.size)),
      button('', () => { files.splice(i, 1); render(); }, { icon: 'X', small: true, variant: 'ghost', title: 'Remove' }))));
    if (files.length) list.append(h('div', { class: 'muted small' }, `${files.length} files · ${fmtBytes(files.reduce((a, f) => a + f.file.size, 0))}`));
  };
  const add = (fs: File[]) => { files.push(...fs.map((file) => ({ file, path: (file as any).webkitRelativePath || file.name }))); render(); };
  const folderBtn = h('input', { type: 'file', hidden: true, webkitdirectory: true, multiple: true, onchange: (e: any) => add([...e.target.files]) } as any);
  root.append(card(null, stack(filePicker({ multiple: true, label: 'Add files', onFiles: add }), !('ontouchstart' in window) ? button('Add a folder', () => folderBtn.click(), { small: true, icon: 'FolderPlus' }) : null, folderBtn, list)),
    card('Options', stack(field('Zip file name', name), slider({ label: 'Compression level', min: 0, max: 9, value: level, onInput: (v) => (level = v), fmt: (v) => (v === 0 ? 'store (no compression)' : String(v)) }),
      toggle('Password-protect (AES-256)', false, (v) => { encrypt = v; pwField.hidden = !v; }), pwField, prog)),
    h('div', { class: 'actions' }, button('Create zip', async () => {
      if (!files.length) throw new Error('Add some files first.');
      if (encrypt && pw.value.length < 4) throw new Error('Choose a longer password.');
      const { ZipWriter, BlobWriter, BlobReader } = await zipjs();
      const w = new ZipWriter(new BlobWriter('application/zip'), { level, password: encrypt ? pw.value : undefined, encryptionStrength: 3 });
      const total = files.reduce((a, f) => a + f.file.size, 0) || 1;
      let done = 0;
      for (const f of files) {
        await w.add(f.path, new BlobReader(f.file), { lastModDate: new Date(f.file.lastModified), onprogress: async (p) => prog.set((done + p) / total, `Adding ${f.path}`) });
        done += f.file.size;
      }
      const blob = await w.close();
      prog.done();
      downloadBlob(blob, name.value.endsWith('.zip') ? name.value : name.value + '.zip');
    }, { variant: 'primary', icon: 'FileArchive' })),
    note('Password-protected zips use WinZip AES-256 — open them with 7-Zip, WinRAR, macOS Archive Utility or this tool.'));
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
      catch (err: any) { throw new Error(/password/i.test(err?.message || '') ? 'Wrong or missing password.' : err?.message || String(err)); }
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
