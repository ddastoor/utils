// WASI preview 1 host for running BusyBox (our wasm32-wasi build) against the in-memory VFS. Synchronous: run it
// inside a Web Worker (browsers only allow synchronous instantiation of large modules off the main thread) or Node.
// Implements exactly the 30 calls BusyBox imports plus a few more; anything else → ENOSYS.
import { VFS, E, FsError, newFile, type Node, type FileNode, type DirNode, type DevNode } from './vfs';
import { zoneInfo } from '../tzinfo';

export class ProcExit extends Error { constructor(public code: number) { super(`exit ${code}`); } }
/** Thrown from inside a syscall to stop the program: output limit (like SIGPIPE) or time limit. */
export class Abort extends Error { constructor(public reason: 'output' | 'time', public code: number) { super(reason); } }

type FD =
  | { t: 'in'; data: Uint8Array; pos: number }
  | { t: 'out'; write: (b: Uint8Array) => void }
  | { t: 'file'; node: FileNode; pos: number; append: boolean; path: string }
  | { t: 'dir'; node: DirNode; path: string; preopen?: string }
  | { t: 'dev'; node: DevNode };

export interface RunOpts {
  args: string[]; env: Record<string, string>; vfs: VFS; cwd: string;
  stdin?: Uint8Array; stdout: (b: Uint8Array) => void; stderr: (b: Uint8Array) => void;
  /** max bytes on stdout+stderr before the program is stopped (default 16 MB) */
  maxOutput?: number;
  /** wall-clock limit checked at every syscall (ms, default 60 s) */
  timeLimit?: number;
  /** told how many stdin bytes the program consumed (so `while read …; do cmd; done < f` leaves the rest) */
  onStdinUsed?: (n: number) => void;
  /** hand stdin over one line per read, as a terminal does (a program that asks a question gets one answer), and
   *  tell the caller what each read took (an empty chunk = end of input) — used to echo answers after prompts */
  stdinLines?: boolean;
  onStdinRead?: (chunk: Uint8Array) => void;
  /** called at every system call — a blocked worker's only chance to send what it has buffered */
  onCall?: () => void;
  /** stdout/stderr are a terminal (isatty → colours, columns) — false for pipes and redirects */
  tty?: boolean;
  /** debugging: called for every syscall that returns an error */
  trace?: (name: string, args: any[], errno: number) => void;
  /** IANA time zone for programs that ask the host about local time (supertools.tz_info); default: this machine's */
  timeZone?: string;
  /** tzdata's abbreviations for that zone (an entry of src/lib/tzabbr.json); without it the names are Intl's */
  timeZoneNames?: string;
  /** told why the program was stopped by a limit, before runWasi returns its exit code (141 output, 124 time) */
  onAbort?: (reason: 'output' | 'time') => void;
  /** extra import modules, e.g. { supertools: { spawn } } */
  extraImports?: (ctx: { mem: () => DataView; bytes: () => Uint8Array; str: (p: number, n?: number) => string; stdinRest: () => Uint8Array; stdinUse: (n: number) => void }) => Record<string, Record<string, Function>>;
}
const FT = { unknown: 0, char: 2, dir: 3, file: 4, symlink: 7 } as const;
const ftOf = (n: Node) => (n.kind === 'dir' ? FT.dir : n.kind === 'symlink' ? FT.symlink : n.kind === 'dev' ? FT.char : FT.file);
const ALL_RIGHTS = 0x1fffffffn;
const enc = new TextEncoder(), dec = new TextDecoder();

export function runWasi(module: WebAssembly.Module, o: RunOpts): number {
  let zone: ReturnType<typeof zoneInfo> | null = null;
  const vfs = o.vfs, maxOut = o.maxOutput ?? 16 * 1024 * 1024, t0 = performance.now(), tl = o.timeLimit ?? 60000;
  let outBytes = 0;
  const limit = (n: number) => { outBytes += n; if (outBytes > maxOut) throw new Abort('output', 141); };
  const check = () => { if (performance.now() - t0 > tl) throw new Abort('time', 124); };
  const fds: Array<FD | undefined> = [
    { t: 'in', data: o.stdin || new Uint8Array(0), pos: 0 },
    { t: 'out', write: (b) => { limit(b.length); o.stdout(b); } },
    { t: 'out', write: (b) => { limit(b.length); o.stderr(b); } },
    { t: 'dir', node: vfs.root, path: '/', preopen: '/' },
  ];
  let inst: WebAssembly.Instance;
  const mem = () => new DataView((inst.exports.memory as WebAssembly.Memory).buffer);
  const bytes = () => new Uint8Array((inst.exports.memory as WebAssembly.Memory).buffer);
  const str = (p: number, n?: number) => { const b = bytes(); if (n === undefined) { n = 0; while (b[p + n]) n++; } return dec.decode(b.subarray(p, p + n)); };
  const argv = o.args.map((a) => enc.encode(a + '\0'));
  const envv = Object.entries(o.env).map(([k, v]) => enc.encode(`${k}=${v}\0`));
  const fd = (n: number) => fds[n];
  // wasi-libc resolves every path through the preopen it found at start-up (fd 3 = "/"). Programs such as unzip
  // move their own files onto fd 3 (dup2/renumber); keep resolving fd-3-relative paths through "/" regardless.
  const pathOf = (dirfd: number, p: string) => {
    const d = fd(dirfd);
    const base = d && d.t === 'dir' ? d.path : dirfd === 3 ? '/' : null;
    if (base === null) throw new FsError(E.BADF);
    return p.startsWith('/') ? p : VFS.join(base, p);
  };
  const origFds = fds.slice(0, 3);
  const devRead = (d: DevNode, len: number): Uint8Array | number => {
    if (d.dev === 'zero' || d.dev === 'full') return new Uint8Array(len);
    if (d.dev === 'random') { const b = new Uint8Array(len); for (let i = 0; i < len; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(len, i + 65536))); return b; }
    if (d.dev === 'stdin') { const f = origFds[0] as { data: Uint8Array; pos: number }; const c = f.data.subarray(f.pos, f.pos + len); f.pos += c.length; return c; }
    return new Uint8Array(0);
  };
  const devWrite = (d: DevNode, data: Uint8Array): number => {
    if (d.dev === 'full') return E.NOSPC ?? 51;
    if (d.dev === 'stdout' || d.dev === 'stderr') (origFds[d.dev === 'stdout' ? 1 : 2] as { write: (b: Uint8Array) => void }).write(data);
    return 0;
  };
  let curName = '';
  const wrap = (f: (...a: any[]) => number | void) => (...a: any[]) => {
    check(); o.onCall?.();
    let r: number;
    try { r = (f(...a) ?? 0) as number; } catch (e) { if (e instanceof FsError) r = e.errno; else throw e; }
    if (r && o.trace) o.trace(curName, a, r);
    return r;
  };
  const filestat = (p: number, n: Node) => {
    const v = mem();
    v.setBigUint64(p, 1n, true); v.setBigUint64(p + 8, BigInt(n.ino), true); v.setUint8(p + 16, ftOf(n));
    v.setBigUint64(p + 24, BigInt(n.nlink), true); v.setBigUint64(p + 32, BigInt(n.kind === 'file' ? n.size : n.kind === 'symlink' ? enc.encode(n.target).length : 4096), true);
    v.setBigUint64(p + 40, n.atime, true); v.setBigUint64(p + 48, n.mtime, true); v.setBigUint64(p + 56, n.ctime, true);
  };
  const iovs = (p: number, n: number) => { const v = mem(), r: Array<[number, number]> = []; for (let i = 0; i < n; i++) r.push([v.getUint32(p + i * 8, true), v.getUint32(p + i * 8 + 4, true)]); return r; };
  const nowNs = () => BigInt(Math.round((performance.timeOrigin + performance.now()) * 1e6));
  const setTimes = (n: Node, atim: bigint, mtim: bigint, fl: number) => {
    const t = nowNs();
    if (fl & 2) n.atime = t; else if (fl & 1) n.atime = atim;
    if (fl & 8) n.mtime = t; else if (fl & 4) n.mtime = mtim;
    n.ctime = t;
  };

  const w: Record<string, Function> = {
    args_sizes_get: wrap((c: number, s: number) => { mem().setUint32(c, argv.length, true); mem().setUint32(s, argv.reduce((a, b) => a + b.length, 0), true); }),
    args_get: wrap((ptrs: number, buf: number) => { let off = buf; argv.forEach((a, i) => { mem().setUint32(ptrs + i * 4, off, true); bytes().set(a, off); off += a.length; }); }),
    environ_sizes_get: wrap((c: number, s: number) => { mem().setUint32(c, envv.length, true); mem().setUint32(s, envv.reduce((a, b) => a + b.length, 0), true); }),
    environ_get: wrap((ptrs: number, buf: number) => { let off = buf; envv.forEach((a, i) => { mem().setUint32(ptrs + i * 4, off, true); bytes().set(a, off); off += a.length; }); }),
    clock_res_get: wrap((_id: number, p: number) => { mem().setBigUint64(p, 1000n, true); }),
    clock_time_get: wrap((id: number, _prec: bigint, p: number) => { mem().setBigUint64(p, id === 0 ? nowNs() : BigInt(Math.round(performance.now() * 1e6)), true); }),
    random_get: wrap((p: number, n: number) => { for (let i = 0; i < n; i += 65536) crypto.getRandomValues(bytes().subarray(p + i, p + Math.min(n, i + 65536))); }),
    proc_exit: (code: number) => { throw new ProcExit(code); },
    proc_raise: () => E.NOSYS,
    sched_yield: () => 0,
    poll_oneoff: wrap((inP: number, outP: number, n: number, nevP: number) => {
      // clock subscriptions: sleep (busy-wait — we are in a worker, and Atomics.wait needs cross-origin isolation)
      const v = mem();
      let wait = 0n;
      for (let i = 0; i < n; i++) {
        const s = inP + i * 48;
        if (v.getUint8(s + 8) === 0) {
          // clock subscription: id at +16 (0 realtime, else monotonic), timeout at +24, flags at +40 (1 = absolute)
          const id = v.getUint32(s + 16, true), to = v.getBigUint64(s + 24, true), abs = v.getUint16(s + 40, true) & 1;
          const now = id === 0 ? nowNs() : BigInt(Math.round(performance.now() * 1e6));
          const d = abs ? to - now : to; if (d > wait) wait = d;
        }
      }
      const end = performance.now() + Math.min(Number(wait) / 1e6, tl);
      while (performance.now() < end) check();
      for (let i = 0; i < n; i++) {
        const s = inP + i * 48, e = outP + i * 32;
        v.setBigUint64(e, v.getBigUint64(s, true), true); v.setUint16(e + 8, 0, true); v.setUint8(e + 10, v.getUint8(s + 8));
        if (v.getUint8(s + 8) !== 0) v.setBigUint64(e + 16, 0n, true);
      }
      v.setUint32(nevP, n, true);
    }),
    fd_close: wrap((n: number) => { if (!fds[n]) return E.BADF; fds[n] = undefined; }),
    fd_renumber: wrap((from: number, to: number) => { if (!fds[from]) return E.BADF; fds[to] = fds[from]; fds[from] = undefined; }),
    fd_fdstat_get: wrap((n: number, p: number) => {
      const f = fd(n); if (!f) return E.BADF;
      const v = mem();
      v.setUint8(p, f.t === 'dir' ? FT.dir : f.t === 'file' ? FT.file : f.t === 'dev' ? FT.char : f.t === 'out' && o.tty ? FT.char : FT.unknown);
      v.setUint16(p + 2, f.t === 'file' && f.append ? 1 : 0, true);
      // wasi-libc's isatty() = character device without seek/tell rights
      const rights = f.t === 'out' || f.t === 'in' || f.t === 'dev' ? ALL_RIGHTS & ~(4n | 32n) : ALL_RIGHTS;
      v.setBigUint64(p + 8, rights, true); v.setBigUint64(p + 16, rights, true);
    }),
    fd_fdstat_set_flags: wrap((n: number, flags: number) => { const f = fd(n); if (!f) return E.BADF; if (f.t === 'file') f.append = !!(flags & 1); }),
    fd_prestat_get: wrap((n: number, p: number) => { const f = fd(n); if (!f || f.t !== 'dir' || !f.preopen) return E.BADF; mem().setUint8(p, 0); mem().setUint32(p + 4, enc.encode(f.preopen).length, true); }),
    fd_prestat_dir_name: wrap((n: number, p: number, len: number) => { const f = fd(n); if (!f || f.t !== 'dir' || !f.preopen) return E.BADF; bytes().set(enc.encode(f.preopen).subarray(0, len), p); }),
    fd_filestat_get: wrap((n: number, p: number) => {
      const f = fd(n); if (!f) return E.BADF;
      if (f.t === 'file' || f.t === 'dir' || f.t === 'dev') filestat(p, f.node);
      else { const v = mem(); for (let i = 0; i < 64; i += 8) v.setBigUint64(p + i, 0n, true); v.setUint8(p + 16, FT.char); v.setBigUint64(p + 24, 1n, true); }
    }),
    fd_filestat_set_size: wrap((n: number, size: bigint) => { const f = fd(n); if (!f || f.t !== 'file') return E.BADF; vfs.resize(f.node, Number(size)); }),
    fd_filestat_set_times: wrap((n: number, a: bigint, m: bigint, fl: number) => { const f = fd(n); if (!f || (f.t !== 'file' && f.t !== 'dir')) return E.BADF; setTimes(f.node, a, m, fl); }),
    fd_read: wrap((n: number, iov: number, cnt: number, nread: number) => {
      const f = fd(n); if (!f) return E.BADF;
      let total = 0;
      for (const [p, len] of iovs(iov, cnt)) {
        let chunk: Uint8Array;
        if (f.t === 'in') {
          let end = Math.min(f.data.length, f.pos + len);
          if (o.stdinLines) { const nl = f.data.indexOf(10, f.pos); if (nl >= 0 && nl + 1 < end) end = nl + 1; }
          chunk = f.data.subarray(f.pos, end); f.pos = end; o.onStdinRead?.(chunk);
        }
        else if (f.t === 'file') { chunk = vfs.read(f.node, f.pos, len); f.pos += chunk.length; }
        else if (f.t === 'dir') return E.ISDIR;
        else if (f.t === 'dev') { const r = devRead(f.node, len); if (typeof r === 'number') return r; chunk = r; }
        else return E.BADF;
        bytes().set(chunk, p); total += chunk.length;
        if (chunk.length < len || (f.t === 'in' && o.stdinLines)) break;
      }
      mem().setUint32(nread, total, true);
    }),
    fd_pread: wrap((n: number, iov: number, cnt: number, off: bigint, nread: number) => {
      const f = fd(n); if (!f || f.t !== 'file') return E.BADF;
      let total = 0, pos = Number(off);
      for (const [p, len] of iovs(iov, cnt)) { const c = vfs.read(f.node, pos, len); bytes().set(c, p); pos += c.length; total += c.length; if (c.length < len) break; }
      mem().setUint32(nread, total, true);
    }),
    fd_write: wrap((n: number, iov: number, cnt: number, nw: number) => {
      const f = fd(n); if (!f) return E.BADF;
      let total = 0;
      for (const [p, len] of iovs(iov, cnt)) {
        const data = bytes().slice(p, p + len);
        if (f.t === 'out') f.write(data);
        else if (f.t === 'file') { if (f.append) f.pos = f.node.size; vfs.write(f.node, f.pos, data); f.pos += len; }
        else if (f.t === 'dev') { const r = devWrite(f.node, data); if (r) return r; }
        else return E.BADF;
        total += len;
      }
      mem().setUint32(nw, total, true);
    }),
    fd_pwrite: wrap((n: number, iov: number, cnt: number, off: bigint, nw: number) => {
      const f = fd(n); if (!f || f.t !== 'file') return E.BADF;
      let total = 0, pos = Number(off);
      for (const [p, len] of iovs(iov, cnt)) { vfs.write(f.node, pos, bytes().slice(p, p + len)); pos += len; total += len; }
      mem().setUint32(nw, total, true);
    }),
    fd_seek: wrap((n: number, off: bigint, whence: number, p: number) => {
      const f = fd(n); if (!f) return E.BADF;
      if (f.t === 'dev') { mem().setBigUint64(p, 0n, true); return; }
      if (f.t !== 'file') return E.SPIPE;
      const base = whence === 0 ? 0 : whence === 1 ? f.pos : f.node.size;
      const np = base + Number(off); if (np < 0) return E.INVAL;
      f.pos = np; mem().setBigUint64(p, BigInt(np), true);
    }),
    fd_tell: wrap((n: number, p: number) => { const f = fd(n); if (!f) return E.BADF; if (f.t !== 'file') return E.SPIPE; mem().setBigUint64(p, BigInt(f.pos), true); }),
    fd_sync: () => 0, fd_datasync: () => 0, fd_advise: () => 0, fd_allocate: () => 0,
    fd_readdir: wrap((n: number, buf: number, len: number, cookie: bigint, used: number) => {
      const f = fd(n); if (!f || f.t !== 'dir') return E.BADF;
      const ents: Array<[string, Node]> = [['.', f.node], ['..', f.node.parent || f.node], ...f.node.entries];
      const v = mem(), b = bytes();
      let off = 0;
      for (let i = Number(cookie); i < ents.length && off < len; i++) {
        const name = enc.encode(ents[i][0]), head = new DataView(new ArrayBuffer(24));
        head.setBigUint64(0, BigInt(i + 1), true); head.setBigUint64(8, BigInt(ents[i][1].ino), true); head.setUint32(16, name.length, true); head.setUint8(20, ftOf(ents[i][1]));
        const rec = new Uint8Array(24 + name.length); rec.set(new Uint8Array(head.buffer)); rec.set(name, 24);
        const take = Math.min(rec.length, len - off);
        b.set(rec.subarray(0, take), buf + off); off += take;
      }
      v.setUint32(used, off, true);
    }),
    path_open: wrap((dirfd: number, lookup: number, pp: number, pl: number, oflags: number, _rb: bigint, _ri: bigint, fdflags: number, out: number) => {
      const path = pathOf(dirfd, str(pp, pl));
      const follow = !!(lookup & 1);
      let node = vfs.tryLookup(path, '/', follow);
      if (node && (oflags & 1) && (oflags & 4)) return E.EXIST;
      if (!node) {
        if (!(oflags & 1)) return E.NOENT;
        const { dir, name } = vfs.parentOf(path);
        node = newFile(); dir.entries.set(name, node); dir.mtime = node.mtime;
      }
      if ((oflags & 2) && node.kind !== 'dir') return E.NOTDIR;
      if (node.kind === 'symlink') return E.LOOP;
      if (node.kind === 'dev') fds.push({ t: 'dev', node });
      else if (node.kind === 'dir') { fds.push({ t: 'dir', node, path }); }
      else { if (oflags & 8) vfs.resize(node, 0); fds.push({ t: 'file', node, pos: 0, append: !!(fdflags & 1), path }); }
      mem().setUint32(out, fds.length - 1, true);
    }),
    path_filestat_get: wrap((dirfd: number, lookup: number, pp: number, pl: number, out: number) => { filestat(out, vfs.lookup(pathOf(dirfd, str(pp, pl)), '/', !!(lookup & 1))); }),
    path_filestat_set_times: wrap((dirfd: number, lookup: number, pp: number, pl: number, a: bigint, m: bigint, fl: number) => { setTimes(vfs.lookup(pathOf(dirfd, str(pp, pl)), '/', !!(lookup & 1)), a, m, fl); }),
    path_create_directory: wrap((dirfd: number, pp: number, pl: number) => { vfs.mkdir(pathOf(dirfd, str(pp, pl))); }),
    path_remove_directory: wrap((dirfd: number, pp: number, pl: number) => {
      const { dir, name } = vfs.parentOf(pathOf(dirfd, str(pp, pl)));
      const n = dir.entries.get(name); if (!n) return E.NOENT; if (n.kind !== 'dir') return E.NOTDIR; if (n.entries.size) return E.NOTEMPTY;
      dir.entries.delete(name);
    }),
    path_unlink_file: wrap((dirfd: number, pp: number, pl: number) => { const { dir, name } = vfs.parentOf(pathOf(dirfd, str(pp, pl))); vfs.unlink(dir, name); }),
    path_rename: wrap((fd1: number, op: number, ol: number, fd2: number, np: number, nl: number) => {
      const a = vfs.parentOf(pathOf(fd1, str(op, ol))), b = vfs.parentOf(pathOf(fd2, str(np, nl)));
      const n = a.dir.entries.get(a.name); if (!n) return E.NOENT;
      const ex = b.dir.entries.get(b.name);
      if (ex === n) return;
      if (ex) { if (ex.kind === 'dir' && (n.kind !== 'dir' || ex.entries.size)) return ex.kind === 'dir' && n.kind === 'dir' ? E.NOTEMPTY : E.ISDIR; if (ex.kind !== 'dir' && n.kind === 'dir') return E.NOTDIR; }
      for (let p: DirNode | null = b.dir; p; p = p.parent) if (p === n) return E.INVAL; // into itself
      a.dir.entries.delete(a.name); b.dir.entries.set(b.name, n);
      if (n.kind === 'dir') n.parent = b.dir;
    }),
    path_symlink: wrap((op: number, ol: number, dirfd: number, np: number, nl: number) => { vfs.symlink(str(op, ol), pathOf(dirfd, str(np, nl))); }),
    path_readlink: wrap((dirfd: number, pp: number, pl: number, buf: number, len: number, used: number) => {
      const n = vfs.lookup(pathOf(dirfd, str(pp, pl)), '/', false); if (n.kind !== 'symlink') return E.INVAL;
      const t = enc.encode(n.target).subarray(0, len); bytes().set(t, buf); mem().setUint32(used, t.length, true);
    }),
    path_link: wrap((fd1: number, _fl: number, op: number, ol: number, fd2: number, np: number, nl: number) => {
      const n = vfs.lookup(pathOf(fd1, str(op, ol)), '/', false); if (n.kind === 'dir') return E.PERM;
      const { dir, name } = vfs.parentOf(pathOf(fd2, str(np, nl))); if (dir.entries.has(name)) return E.EXIST;
      dir.entries.set(name, n); n.nlink++;
    }),
  };
  if (o.trace) for (const k of Object.keys(w)) { const f = w[k]; w[k] = (...a: any[]) => { curName = k; return f(...a); }; }
  const imports: WebAssembly.Imports = {
    wasi_snapshot_preview1: new Proxy(w as any, { get: (t, k: string) => t[k] || ((...a: any[]) => { o.trace?.(String(k), a, E.NOSYS); return E.NOSYS; }) }),
    // defaults; the shell supplies real spawn / ncpu via extraImports. tz_info: local time for programs built on
    // wasi-libc, which has no time zones (wasm/python/wasi_start.c) — answered from Intl, the zone made on first use
    supertools: { spawn: () => 127, ncpu: () => 1, tz_info: (secs: bigint, local: number, out: number, name: number, cap: number) => {
      const z = (zone ||= zoneInfo(o.timeZone, o.timeZoneNames))(Number(secs), !!local), dv = mem();
      dv.setInt32(out, z.offset, true); dv.setInt32(out + 4, z.isdst ? 1 : 0, true); dv.setInt32(out + 8, z.other, true);
      const b = enc.encode(z.name).subarray(0, Math.max(0, cap - 1)); bytes().set(b, name); dv.setUint8(name + b.length, 0);
    } },
  };
  const inFd = fds[0] as { data: Uint8Array; pos: number };
  if (o.extraImports) Object.assign(imports, o.extraImports({ mem, bytes, str, stdinRest: () => inFd.data.subarray(inFd.pos), stdinUse: (n) => { inFd.pos += n; } }));
  inst = new WebAssembly.Instance(module, imports);
  const stdinFd = inFd;
  try { (inst.exports._start as Function)(); return 0; }
  catch (e) {
    if (e instanceof ProcExit) return e.code;
    if (e instanceof Abort) { o.onAbort?.(e.reason as 'output' | 'time'); o.stderr(enc.encode(e.reason === 'time' ? '\n[stopped: time limit reached]\n' : '')); return e.code; }
    throw e;
  } finally { o.onStdinUsed?.(stdinFd.pos); }
}
