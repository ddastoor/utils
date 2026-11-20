// Create Zip / Extract Archive: 7-Zip 24.09 compiled to WebAssembly (7z-wasm, LGPL-2.1 + unRAR restriction; the
// Emscripten build of the 7zz command line). Input files are mounted read-only with WORKERFS (not copied into memory);
// a fresh instance runs each command (7zz is a command-line program: one run, one process).
import SevenZip from '7z-wasm';
import wasmUrl from '7z-wasm/7zz.wasm?url';

export type CreateJob = { id: number; op: 'create'; files: Array<{ path: string; file: File }>; format: 'zip' | '7z'; level: number; password: string; encryptNames: boolean };
const post = (m: unknown, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);

/** Runs 7zz with `args` on a fresh instance; `prepare` mounts what it needs. Progress: the percentages 7zz prints. */
async function run(id: number, prepare: (z: any) => void, args: string[]) {
  const errBytes: number[] = [];
  let pct = '', last = -1;
  const z: any = await (SevenZip as any)({
    locateFile: (p: string) => (p.endsWith('.wasm') ? wasmUrl : p),
    stdout: (c: number) => {
      if (c >= 48 && c <= 57) pct += String.fromCharCode(c);
      else { if (c === 37 && pct) { const v = +pct; if (v !== last) { last = v; post({ id, type: 'progress', pct: v }); } } pct = ''; }
    },
    stderr: (c: number) => { if (errBytes.length < 65536) errBytes.push(c); },
  });
  prepare(z);
  let rc: number;
  try { rc = z.callMain(args); } catch (e) {
    throw new Error(`7-Zip stopped with an internal error (${typeof e === 'number' ? `code ${e}` : e instanceof Error ? e.message : String(e)}).`);
  }
  const err = new TextDecoder().decode(new Uint8Array(errBytes)).replace(/\s+/g, ' ').trim();
  return { z, rc, err };
}

self.onmessage = async (ev: MessageEvent<CreateJob>) => {
  const j = ev.data;
  try {
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
