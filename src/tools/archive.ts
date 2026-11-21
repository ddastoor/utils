// Create Zip and Extract Archive: 7-Zip compiled to WebAssembly (7z-wasm) makes and reads every archive (zip and 7z with
// AES-256; zip, 7z, rar, tar, gz, bz2, xz, iso, cab … with passwords); zip.js only writes zips larger than fit in memory.
import { h, card, field, input, button, filePicker, toggle, slider, segmented, clear, stack, row, note, progress, downloadBlob, fmtBytes, toast, type Mount } from '../ui';
import { has, isMobile, isWindows, isMac } from '../platform';
import { createArchive, listArchive, extractArchive, extractAsZip, stopSevenZip, Stopped, type ArchiveEntry, type ArchiveList } from '../lib/sevenzip-client';
import { archivePaths, passwordProblem, archiveName, safeParts, freeName } from '../lib/archive-names';

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
  const SHOWN = 500;
  const render = () => {
    const paths = archivePaths(files.map((f) => f.path));
    // the first SHOWN rows (a folder of 150,000 files drew 150,000 rows, and spreading them into append() overflowed the
    // call stack); every file goes into the archive
    clear(list);
    for (const [i, f] of files.slice(0, SHOWN).entries()) list.append(h('div', { class: 'file-row' }, h('span', { class: 'file-name' }, paths[i]), h('span', { class: 'muted small' }, fmtBytes(f.file.size)),
      button('', () => { files.splice(i, 1); render(); }, { icon: 'X', small: true, variant: 'ghost', title: `Remove ${paths[i]}` })));
    if (files.length > SHOWN) list.append(h('div', { class: 'muted small' }, `… and ${(files.length - SHOWN).toLocaleString('en-IN')} more (the first ${SHOWN} are listed)`));
    if (files.length) list.append(h('div', { class: 'muted small' }, `${files.length.toLocaleString('en-IN')} file${files.length === 1 ? '' : 's'} · ${fmtBytes(total())}`));
    sync();
  };
  const sync = () => {
    namesToggle.hidden = format !== '7z';
    clear(formatNote);
    if (total() > IN_MEMORY) formatNote.append(note(format === '7z'
      ? `${fmtBytes(total())} is more than a 7z archive can be made of in this browser (${fmtBytes(IN_MEMORY)}) — choose Zip.`
      : `${fmtBytes(total())}: the zip is written piece by piece (zip.js) instead of by 7-Zip, which holds an archive in memory.`, format === '7z' ? 'err' : 'info'));
  };
  // one by one: push(...) of a folder of 150,000 files (a project with node_modules) overflowed the call stack
  const add = (fs: File[]) => { for (const file of fs) files.push({ file, path: (file as any).webkitRelativePath || file.name }); render(); };
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

const TYPE_NAMES: Record<string, string> = { zip: 'Zip', '7z': '7z', rar: 'RAR', rar5: 'RAR5', tar: 'tar', gzip: 'gzip', bzip2: 'bzip2', xz: 'xz', iso: 'ISO image', cab: 'Cabinet', wim: 'WIM', cpio: 'cpio', arj: 'ARJ', lzh: 'LZH', rpm: 'RPM', ar: 'ar', dmg: 'Apple disk image', udf: 'UDF', vhd: 'VHD', vhdx: 'VHDX', nsis: 'NSIS installer', msi: 'Windows Installer' };

export const unzip: Mount = (root) => {
  const pw = input({ type: 'password', placeholder: 'Password (only if the archive is encrypted)', attrs: { 'aria-label': 'Password', autocomplete: 'off' } });
  const out = h('div', { class: 'stack' });
  const ask = h('div');
  const prog = progress();
  const stopBtn = button('Stop', () => stopSevenZip(), { icon: 'Square' });
  stopBtn.hidden = true;
  let src: { blob: Blob; name: string; outer: string } | null = null;
  const busy = async <T>(label: string, f: () => Promise<T>): Promise<T | undefined> => {
    prog.set(null, label); stopBtn.hidden = false;
    try { return await f(); }
    catch (e) { if (e instanceof Stopped) { toast('Stopped.'); return undefined; } throw e; }
    finally { prog.done(); stopBtn.hidden = true; }
  };
  /** 7-Zip's coded errors, said for a person. */
  const said = (e: unknown, type: string) => {
    const m = e instanceof Error ? e.message : String(e);
    if (m === 'PASSWORD') return 'This archive is protected by a password — type it above and press Open.';
    if (m === 'WRONG_PASSWORD') return 'Wrong password.';
    if (m === 'PASSWORD_OR_DAMAGED') return 'This archive is protected by a password — type it above and press Open. (If it has none, it is damaged.)';
    if (m === 'WRONG_OR_DAMAGED') return 'Wrong password — or the archive is damaged.';
    if (m === 'NOT_ARCHIVE') return 'Could not open: this is not an archive 7-Zip can read (zip, 7z, rar, tar, gz, bz2, xz, iso, cab …).';
    if (m.startsWith('DAMAGED:')) return `Could not open: the archive is damaged or cut short (${m.slice(8)}).`;
    if (/internal error/.test(m) && type === 'zip' && /[^\x20-\x7e]/.test(pw.value)) return '7-Zip cannot take a zip password with letters beyond English (zips made elsewhere with such a password open only in the tool that made them).';
    return m;
  };
  const open = async () => {
    if (!src) return;
    clear(out); clear(ask);
    let list: ArchiveList | undefined;
    try { list = await busy('Reading the archive…', () => listArchive(src!.blob, src!.name, pw.value)); }
    catch (e) {
      const m = said(e, '');
      if (/password/i.test(m)) { ask.append(note(m, 'warn')); pw.focus(); return; }
      out.append(note(m, 'err')); return;
    }
    if (!list) return;
    if (list.inner) { // a tar inside gzip / bzip2 / xz
      src = { blob: new Blob([list.inner.data as BlobPart]), name: list.inner.name, outer: `tar inside ${TYPE_NAMES[list.type.toLowerCase()] ?? list.type}` };
      return open();
    }
    const type = list.type.toLowerCase(), files = list.entries.filter((e) => !e.dir);
    const total = files.reduce((a, e) => a + e.size, 0), anyEnc = files.some((e) => e.encrypted);
    if (anyEnc && !pw.value) ask.append(note('Some files are protected by a password — type it above before you download them.', 'warn'));
    const kind = src.outer || TYPE_NAMES[type] || list.type;
    const save = async (e: ArchiveEntry) => {
      if (e.size > IN_MEMORY) throw new Error(`${fmtBytes(e.size)} is more than this browser can unpack in memory (${fmtBytes(IN_MEMORY)}).`);
      if (e.encrypted && !pw.value) throw new Error('This file is protected by a password — type it above.');
      const got = await busy(`Unpacking ${e.path}…`, () => extractArchive(src!.blob, src!.name, pw.value, [e.path]).catch((err) => { throw new Error(said(err, type)); }));
      if (!got) return;
      const f = got.find((x) => x.path === safeParts(e.path).join('/')) ?? got[0];
      if (!f) throw new Error('7-Zip found nothing to unpack for that name.');
      downloadBlob(new Blob([f.data as BlobPart]), safeParts(e.path).pop() || 'file');
    };
    const tooBig = total > IN_MEMORY;
    out.append(card(`${files.length} file${files.length === 1 ? '' : 's'} · ${fmtBytes(total)} · ${kind}`,
      tooBig ? note(`Together more than this browser can unpack in memory (${fmtBytes(IN_MEMORY)}) — download the files one by one.`, 'warn') : null,
      h('div', { class: 'file-list' }, files.slice(0, 2000).map((e) => h('div', { class: 'file-row' },
        e.encrypted ? h('span', { class: 'file-lock', title: 'Protected by a password', 'aria-label': 'Protected by a password' }, '🔒') : null, h('span', { class: 'file-name' }, e.path), h('span', { class: 'muted small' }, fmtBytes(e.size)),
        button('', () => save(e), { icon: 'Download', small: true, variant: 'ghost', title: `Download ${safeParts(e.path).pop() || e.path}` })))),
      files.length > 2000 ? note(`The first 2,000 of ${files.length.toLocaleString('en-IN')} files are listed; "Download all" takes every one.`) : null),
    h('div', { class: 'actions' },
      has.savePicker ? button('Save all to a folder', async () => {
        if (tooBig) throw new Error('Too much to unpack at once in this browser — download the files one by one.');
        const dir = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        const got = await busy('Unpacking…', () => extractArchive(src!.blob, src!.name, pw.value, null, (p) => prog.set(p / 100, `Unpacking: ${p} %`)).catch((err) => { throw new Error(said(err, type)); }));
        if (!got) return;
        let n = 0;
        // names as this system can create them (Windows: no device names …), and no two that the folder cannot tell
        // apart (Windows and macOS: README and readme are one file)
        const foldCase = isWindows || isMac, taken = new Map<string, Set<string>>();
        for (const f of got) {
          const parts = safeParts(f.path, isWindows); let d = dir;
          for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
          const folder = parts.slice(0, -1).join('/'), key = foldCase ? folder.toLowerCase() : folder;
          if (!taken.has(key)) taken.set(key, new Set());
          const fh = await d.getFileHandle(freeName(parts[parts.length - 1], taken.get(key)!, foldCase), { create: true }), w = await fh.createWritable();
          await w.write(f.data); await w.close(); prog.set(++n / got.length, f.path);
        }
        prog.done(); toast(`${n} file${n === 1 ? '' : 's'} saved.`);
      }, { variant: 'primary', icon: 'FolderDown' }) : null,
      button('Download all as .zip', async () => {
        if (tooBig) throw new Error('Too much to unpack at once in this browser — download the files one by one.');
        const data = await busy('Unpacking…', () => extractAsZip(src!.blob, src!.name, pw.value, (p) => prog.set(p / 100, `7-Zip: ${p} %`)).catch((err) => { throw new Error(said(err, type)); }));
        if (data) downloadBlob(new Blob([data as BlobPart], { type: 'application/zip' }), `${src!.name.replace(/\.(zip|7z|rar|tar|gz|tgz|bz2|tbz2?|xz|txz|iso|cab)$/i, '').replace(/\.tar$/i, '') || 'archive'}.zip`);
      }, { icon: 'FileArchive', variant: has.savePicker ? 'secondary' : 'primary' })));
  };
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  root.append(card(null, stack(filePicker({ accept: '.zip,.7z,.rar,.tar,.gz,.tgz,.bz2,.tbz,.tbz2,.xz,.txz,.cab,.iso,.wim,.cpio,.arj,.lzh,.rpm,.deb,.dmg,application/zip,application/x-7z-compressed', label: 'Choose an archive', hint: 'zip, 7z, rar, tar, gz, bz2, xz, iso, cab…', onFiles: ([f]) => { src = { blob: f, name: f.name, outer: '' }; return open(); } }),
    row(pw, button('Open', () => open(), { icon: 'LockOpen', small: true })), ask, prog, stopBtn)), out,
    note('Read by 7-Zip (compiled to WebAssembly) on this device; nothing is uploaded.'));
};
