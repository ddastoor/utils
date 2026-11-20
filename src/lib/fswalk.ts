// The files 7-Zip extracted into its in-memory file system (Emscripten's FS), for the Extract Archive tab's worker.
export interface WalkFs { readdir(dir: string): string[]; stat(p: string): { mode: number }; isDir(mode: number): boolean; readFile(p: string): Uint8Array }

/** Every file under `dir`, with its path below `dir`. One list for the whole walk: a folder's files spread into its
 *  parent's list (push(...walk())) overflowed the call stack past ~150,000 files. */
export function walk(z: { FS: WalkFs }, dir: string, base = '', out: Array<{ path: string; data: Uint8Array }> = []): Array<{ path: string; data: Uint8Array }> {
  for (const n of z.FS.readdir(dir)) {
    if (n === '.' || n === '..') continue;
    const p = `${dir}/${n}`, st = z.FS.stat(p);
    if (z.FS.isDir(st.mode)) walk(z, p, `${base}${n}/`, out);
    else out.push({ path: base + n, data: z.FS.readFile(p) });
  }
  return out;
}
