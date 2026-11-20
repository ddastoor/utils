// Create Zip / Extract Archive: 7-Zip 24.09 compiled to WebAssembly (7z-wasm, LGPL-2.1 + unRAR restriction; the
// Emscripten build of the 7zz command line). Input files are mounted read-only with WORKERFS (not copied into memory);
// a fresh instance runs each command (7zz is a command-line program: one run, one process).
import SevenZip from '7z-wasm';
import wasmUrl from '7z-wasm/7zz.wasm?url';
import { parseList } from '../lib/sevenzip-text';

export type CreateJob = { id: number; op: 'create'; files: Array<{ path: string; file: File }>; format: 'zip' | '7z'; level: number; password: string; encryptNames: boolean };
export type ListJob = { id: number; op: 'list'; file: Blob; name: string; password: string };
export type ExtractJob = { id: number; op: 'extract'; file: Blob; name: string; password: string; paths: string[] | null; zip: boolean };
type Job = CreateJob | ListJob | ExtractJob;
const post = (m: unknown, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);

/** Runs 7zz with `args` on a fresh instance; `prepare` mounts what it needs. Progress: the percentages 7zz prints. */
async function run(id: number, prepare: (z: any) => void, args: string[], headerCanBeEncrypted = false) {
  const errBytes: number[] = [], outBytes: number[] = [];
  let pct = '', last = -1;
  const z: any = await (SevenZip as any)({
    locateFile: (p: string) => (p.endsWith('.wasm') ? wasmUrl : p),
    stdout: (c: number) => {
      if (outBytes.length < (8 << 20)) outBytes.push(c);
      if (c >= 48 && c <= 57) pct += String.fromCharCode(c);
      else { if (c === 37 && pct) { const v = +pct; if (v !== last) { last = v; post({ id, type: 'progress', pct: v }); } } pct = ''; }
    },
    stderr: (c: number) => { if (errBytes.length < 65536) errBytes.push(c); },
  });
  prepare(z);
  let rc: number;
  const text = () => new TextDecoder().decode(new Uint8Array(outBytes));
  try { rc = z.callMain(args); } catch (e) {
    if (/Enter password/.test(text())) throw new Error('PASSWORD'); // 7zz asked for one on its (empty) input
    // 7-Zip throws (a C++ exception, uncaught in this build) when an encrypted header does not decrypt: no password, a
    // wrong one — or a damaged archive, which it cannot tell apart
    if (/Listing archive:|Extracting archive:/.test(text())) {
      if (!headerCanBeEncrypted) throw new Error('DAMAGED:7-Zip stopped reading it');
      throw new Error(args.some((a) => /^-p./.test(a)) ? 'WRONG_OR_DAMAGED' : 'PASSWORD_OR_DAMAGED');
    }
    throw new Error(`7-Zip stopped with an internal error (${typeof e === 'number' ? `code ${e}` : e instanceof Error ? e.message : String(e)}).`);
  }
  const err = new TextDecoder().decode(new Uint8Array(errBytes)).replace(/\s+/g, ' ').trim();
  return { z, rc, err, out: text() };
}

/** Every file under `dir` of the in-memory file system, with its path below `dir`. */
function walk(z: any, dir: string, base = ''): Array<{ path: string; data: Uint8Array }> {
  const out: Array<{ path: string; data: Uint8Array }> = [];
  for (const n of z.FS.readdir(dir)) {
    if (n === '.' || n === '..') continue;
    const p = `${dir}/${n}`, st = z.FS.stat(p);
    if (z.FS.isDir(st.mode)) out.push(...walk(z, p, `${base}${n}/`));
    else out.push({ path: base + n, data: z.FS.readFile(p) });
  }
  return out;
}

/** 7zz's complaint, said for a person. */
function why(rc: number, err: string, hasPassword: boolean): Error {
  if (/Wrong password|encrypted archive/i.test(err)) return new Error(hasPassword ? 'WRONG_PASSWORD' : 'PASSWORD');
  if (/Can ?not open (the )?file as (an )?archive|Is not archive/i.test(err)) return new Error('NOT_ARCHIVE');
  if (/Unexpected end|Headers Error|Data Error|CRC Failed|Unsupported Method/i.test(err)) return new Error(`DAMAGED:${err.replace(/^ERROR:\s*/i, '').slice(0, 300)}`);
  return new Error(`7-Zip could not read it (exit code ${rc})${err ? `: ${err.slice(0, 300)}` : '.'}`);
}

self.onmessage = async (ev: MessageEvent<Job>) => {
  const j = ev.data;
  try {
    if (j.op === 'list' || j.op === 'extract') {
      const at = `/in/${j.name}`;
      const mount = (z: any) => { z.FS.mkdir('/in'); z.FS.mkdir('/out'); z.FS.mount(z.WORKERFS, { blobs: [{ name: j.name, data: j.file }] }, '/in'); };
      const pw = `-p${j.password}`; // always given (empty = none): 7zz must never wait for one on its input
      // only 7z and RAR archives can hide their file list behind the password
      const head = new Uint8Array(new (self as any).FileReaderSync().readAsArrayBuffer(j.file.slice(0, 6)));
      const hidden = (head[0] === 0x37 && head[1] === 0x7a && head[2] === 0xbc && head[3] === 0xaf) || String.fromCharCode(...head.slice(0, 4)) === 'Rar!';
      if (j.op === 'list') {
        const { z, rc, err, out } = await run(j.id, mount, ['l', '-slt', pw, at], hidden);
        if (rc !== 0) throw why(rc, err, !!j.password);
        const list = parseList(out, j.name);
        // a tar inside gzip / bzip2 / xz: hand back the tar, to be opened in its turn
        const one = list.entries.length === 1 ? list.entries[0] : null;
        if (one && /^(gzip|bzip2|xz|lzma|zstd|z)$/i.test(list.type) && /\.tar$/i.test(one.path)) {
          const x = z.callMain(['x', '-y', '-o/out', pw, at]);
          if (x === 0) { const data: Uint8Array = z.FS.readFile(`/out/${one.path}`); post({ id: j.id, type: 'done', result: { ...list, inner: { name: one.path, data } } }, [data.buffer]); return; }
        }
        post({ id: j.id, type: 'done', result: list });
        return;
      }
      const { z, rc, err } = await run(j.id, mount, ['x', '-y', '-o/out', '-spd', '-bsp1', pw, at, ...(j.paths ? ['--', ...j.paths] : [])], true);
      if (rc !== 0) throw why(rc, err, !!j.password);
      if (j.zip) {
        z.FS.chdir('/out');
        z.FS.mkdir('/zip');
        const r = z.callMain(['a', '-tzip', '-mx5', '-mcu=on', '-bsp1', '/zip/all.zip', '*']);
        if (r !== 0) throw new Error(`7-Zip could not make the zip (exit code ${r}).`);
        const data: Uint8Array = z.FS.readFile('/zip/all.zip');
        post({ id: j.id, type: 'done', result: data }, [data.buffer]);
        return;
      }
      const files = walk(z, '/out');
      post({ id: j.id, type: 'done', result: files }, files.map((f) => f.data.buffer));
      return;
    }
    if (j.op === 'create') {
      const out = `/out/archive.${j.format}`;
      const args = ['a', `-t${j.format}`, `-mx${j.level}`, '-bsp1', '-bso0', '-y'];
      if (j.format === 'zip') args.push('-mcu=on'); // UTF-8 names (the zip "language encoding" flag)
      if (j.password) { args.push(`-p${j.password}`); if (j.format === 'zip') args.push('-mem=AES256'); else if (j.encryptNames) args.push('-mhe=on'); }
      args.push(out, '*');
      const { z, rc, err } = await run(j.id, (z) => {
        z.FS.mkdir('/in'); z.FS.mkdir('/out');
        z.FS.mount(z.WORKERFS, { blobs: j.files.map((f) => ({ name: f.path, data: f.file })) }, '/in');
        for (const f of j.files) z.FS.utime(`/in/${f.path}`, f.file.lastModified, f.file.lastModified); // WORKERFS gives blobs "now"
        z.FS.chdir('/in');
      }, args);
      if (rc !== 0) throw new Error(rc === 8 ? 'Not enough memory for this archive in the browser.' : `7-Zip could not make the archive (exit code ${rc})${err ? `: ${err}` : '.'}`);
      const data: Uint8Array = z.FS.readFile(out);
      post({ id: j.id, type: 'done', result: data }, [data.buffer]);
    }
  } catch (e) {
    post({ id: j.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
