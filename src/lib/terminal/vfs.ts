// In-memory POSIX-like filesystem for the Linux Terminal (shared by every BusyBox instance and the shell).
// Files, directories, symlinks and hard links; nanosecond timestamps; no permissions (single user).
export type Node = FileNode | DirNode | LinkNode;
interface Base { ino: number; nlink: number; atime: bigint; mtime: bigint; ctime: bigint }
export interface FileNode extends Base { kind: 'file'; data: Uint8Array; size: number }
export interface DirNode extends Base { kind: 'dir'; entries: Map<string, Node>; parent: DirNode | null }
export interface LinkNode extends Base { kind: 'symlink'; target: string }

export const E = { OK: 0, BADF: 8, EXIST: 20, FBIG: 22, INVAL: 28, ISDIR: 31, LOOP: 32, NAMETOOLONG: 37, NOENT: 44, NOSYS: 52, NOTDIR: 54, NOTEMPTY: 55, NOTSUP: 58, PERM: 63, SPIPE: 70, XDEV: 75, NOTCAPABLE: 76 } as const;
export class FsError extends Error { constructor(public errno: number, msg = '') { super(msg || `errno ${errno}`); } }

const now = () => BigInt(Math.round((performance.timeOrigin + performance.now()) * 1e6));
let inoSeq = 1;
const base = () => { const t = now(); return { ino: inoSeq++, nlink: 1, atime: t, mtime: t, ctime: t }; };
export const newFile = (data = new Uint8Array(0)): FileNode => ({ kind: 'file', data, size: data.length, ...base() });
export const newDir = (parent: DirNode | null): DirNode => ({ kind: 'dir', entries: new Map(), parent, ...base() });

export class VFS {
  root: DirNode = newDir(null);
  /** Total bytes stored (for the 'df' shim and a safety limit). */
  bytes = 0;
  constructor(public limit = 512 * 1024 * 1024) {}

  /** Split and normalise an absolute path (relative paths are resolved against cwd). */
  static parts(path: string, cwd = '/'): string[] {
    const abs = path.startsWith('/') ? path : `${cwd}/${path}`;
    const out: string[] = [];
    for (const p of abs.split('/')) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p); }
    return out;
  }
  static join(...p: string[]) { return '/' + VFS.parts(p.join('/')).join('/'); }

  /** Walk to a node. follow = follow a symlink in the last component. Intermediate symlinks are always followed. */
  lookup(path: string, cwd = '/', follow = true, depth = 0): Node {
    if (depth > 32) throw new FsError(E.LOOP);
    const parts = VFS.parts(path, cwd);
    let cur: Node = this.root;
    const walked: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (cur.kind !== 'dir') throw new FsError(E.NOTDIR);
      const next: Node | undefined = parts[i] === '..' ? cur.parent || cur : cur.entries.get(parts[i]);
      if (!next) throw new FsError(E.NOENT);
      if (next.kind === 'symlink' && (i < parts.length - 1 || follow)) {
        const tgt = next.target.startsWith('/') ? next.target : `/${walked.join('/')}/${next.target}`;
        cur = this.lookup([tgt, ...parts.slice(i + 1)].join('/'), '/', follow, depth + 1);
        return cur;
      }
      walked.push(parts[i]);
      cur = next;
    }
    return cur;
  }
  /** Parent directory node + final name (intermediate symlinks followed). */
  parentOf(path: string, cwd = '/'): { dir: DirNode; name: string } {
    const parts = VFS.parts(path, cwd);
    if (!parts.length) throw new FsError(E.INVAL);
    const name = parts.pop()!;
    const dir = this.lookup('/' + parts.join('/'), '/', true);
    if (dir.kind !== 'dir') throw new FsError(E.NOTDIR);
    if (new TextEncoder().encode(name).length > 255) throw new FsError(E.NAMETOOLONG);
    return { dir, name };
  }
  tryLookup(path: string, cwd = '/', follow = true): Node | null { try { return this.lookup(path, cwd, follow); } catch { return null; } }

  mkdir(path: string, cwd = '/'): DirNode {
    const { dir, name } = this.parentOf(path, cwd);
    if (dir.entries.has(name)) throw new FsError(E.EXIST);
    const d = newDir(dir); dir.entries.set(name, d); dir.mtime = now();
    return d;
  }
  mkdirp(path: string): DirNode {
    let cur = this.root;
    for (const p of VFS.parts(path)) {
      let n = cur.entries.get(p);
      if (!n) { n = newDir(cur); cur.entries.set(p, n); }
      if (n.kind !== 'dir') throw new FsError(E.NOTDIR);
      cur = n;
    }
    return cur;
  }
  writeFile(path: string, data: Uint8Array, cwd = '/') {
    const { dir, name } = this.parentOf(path, cwd);
    const old = dir.entries.get(name);
    if (old && old.kind === 'dir') throw new FsError(E.ISDIR);
    if (old && old.kind === 'file') { this.resize(old, 0); this.write(old, 0, data); return old; }
    const f = newFile(); dir.entries.set(name, f); dir.mtime = now();
    this.write(f, 0, data);
    return f;
  }
  readFile(path: string, cwd = '/'): Uint8Array {
    const n = this.lookup(path, cwd);
    if (n.kind === 'dir') throw new FsError(E.ISDIR);
    if (n.kind !== 'file') throw new FsError(E.INVAL);
    return n.data.slice(0, n.size);
  }
  symlink(target: string, path: string, cwd = '/') {
    const { dir, name } = this.parentOf(path, cwd);
    if (dir.entries.has(name)) throw new FsError(E.EXIST);
    dir.entries.set(name, { kind: 'symlink', target, ...base() });
  }
  /** Bytes [off, off+len) of a file. */
  read(f: FileNode, off: number, len: number) { f.atime = now(); return f.data.subarray(Math.min(off, f.size), Math.min(off + len, f.size)); }
  write(f: FileNode, off: number, data: Uint8Array) {
    const end = off + data.length;
    if (end > f.size) this.resize(f, end);
    f.data.set(data, off);
    f.mtime = f.ctime = now();
    return data.length;
  }
  resize(f: FileNode, size: number) {
    if (size > f.data.length) {
      if (this.bytes + (size - f.size) > this.limit) throw new FsError(E.FBIG, 'The in-browser filesystem is full');
      const d = new Uint8Array(Math.max(size, Math.min(f.data.length * 2 + 4096, size + 64 * 1024 * 1024)));
      d.set(f.data.subarray(0, f.size)); f.data = d;
    } else if (size < f.size) f.data.fill(0, size, f.size);
    this.bytes += size - f.size;
    f.size = size; f.mtime = f.ctime = now();
  }
  unlink(dir: DirNode, name: string) {
    const n = dir.entries.get(name);
    if (!n) throw new FsError(E.NOENT);
    if (n.kind === 'dir') throw new FsError(E.ISDIR);
    dir.entries.delete(name); dir.mtime = now();
    n.nlink--;
    if (n.kind === 'file' && n.nlink <= 0) this.bytes -= n.size;
  }
  /** Everything under a path, for the file browser (sorted, dirs first). */
  list(path: string): Array<{ name: string; kind: Node['kind']; size: number; mtime: number; target?: string }> {
    const d = this.lookup(path);
    if (d.kind !== 'dir') throw new FsError(E.NOTDIR);
    return [...d.entries].map(([name, n]) => ({ name, kind: n.kind, size: n.kind === 'file' ? n.size : 0, mtime: Number(n.mtime / 1000000n), target: n.kind === 'symlink' ? n.target : undefined }))
      .sort((a, b) => (a.kind === 'dir' ? 0 : 1) - (b.kind === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
  }
}
