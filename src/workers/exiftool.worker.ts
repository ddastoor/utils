// ExifTool in a worker: reading and stripping metadata off the page's thread (a 25 MB WebAssembly module, Perl's
// start-up and ~0.3 s a photo), and released when the tab is left (src/lib/exiftool-client.ts).
// zeroperl decides it runs in a browser by `window` and `document` (a worker has neither) and would otherwise try
// Node's file system; these two names, and a fetch that finds the module where this site serves it, are all it needs.
(self as any).window = self;
(self as any).document = {};
import { readPreviews, readTags, stripFile } from '../lib/exiftool';

let base = '';
const fetchWasm = () => fetch(new URL('vendor/exiftool/zeroperl.wasm', base));

type Job = { id: number; op: 'read' | 'strip' | 'previews'; file: File; base: string };
async function handle({ id, op, file, base: b }: Job) {
  base = b;
  try {
    if (op === 'read') (self as any).postMessage({ id, tags: await readTags(file, file.name, fetchWasm) });
    else if (op === 'previews') { const p = await readPreviews(file, file.name, fetchWasm); (self as any).postMessage({ id, previews: p }, Object.values(p).map((b) => b.buffer)); }
    else { const out = await stripFile(file, file.name, fetchWasm); (self as any).postMessage({ id, buf: out.buffer }, [out.buffer]); }
  } catch (err: any) {
    (self as any).postMessage({ id, error: err?.message || String(err) });
  }
}
// one job at a time: the Perl interpreter is one instance, and two runs interleaved at its awaits crashed the page
let queue: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<Job>) => { queue = queue.then(() => handle(e.data)); };
