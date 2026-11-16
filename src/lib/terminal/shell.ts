// SuperTools shell: a small POSIX-style shell that runs BusyBox applets (our wasm32-wasi build) as separate WASI
// instances on a shared in-memory filesystem. WebAssembly cannot fork, so pipelines run stage by stage (each stage's
// output becomes the next stage's input; an output cap stands in for SIGPIPE, so `yes | head` works).
// Supports: quoting, escapes, $VAR ${VAR} ${VAR:-x} $? $# $@, $(…) `…`, $((…)), ~, globbing (* ? […]), pipes,
// && || ; &, redirects (> >> < 2> 2>> &> 2>&1 >&2 << <<- <<<), VAR=x prefixes, if/elif/else, for, while, until,
// { … }, ( … ), comments, and builtins cd pwd export unset read history clear help type which exit : true false.
import { VFS, FsError } from './vfs';
import { runWasi, Abort } from './wasi';

const enc = new TextEncoder(), dec = new TextDecoder();
// ---------------------------------------------------------------- lexer
type Seg = { t: 'lit'; v: string; q: boolean } | { t: 'var'; v: string; q: boolean; op?: string; arg?: Word } | { t: 'cmd'; v: string; q: boolean } | { t: 'arith'; v: string; q: boolean } | { t: 'tilde'; v: string };
type Word = Seg[];
type Tok = { k: 'w'; w: Word; raw: string } | { k: 'op'; v: string } | { k: 'nl' } | { k: 'heredoc'; body: string; expand: boolean };
const OPS = ['<<<', '<<-', '&>>', '2>&1', '>&2', '1>&2', '2>>', '>>', '<<', '&&', '||', '&>', '2>', '1>', ';;', '|', '&', ';', '<', '>', '(', ')'];

export function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const pendingHeredocs: Array<{ tok: Tok & { k: 'heredoc' }; delim: string; strip: boolean }> = [];
  const readBalanced = (open: string, close: string) => { // after the opening, returns inner text
    let depth = 1, s = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i + 1] ?? ''); i += 2; continue; }
      if (c === "'") { const j = src.indexOf("'", i + 1); s += src.slice(i, j < 0 ? src.length : j + 1); i = j < 0 ? src.length : j + 1; continue; }
      if (src.startsWith(open, i)) depth++;
      else if (src.startsWith(close, i)) { depth--; if (!depth) { i += close.length; return s; } }
      s += c; i++;
    }
    throw new Error(`missing '${close}'`);
  };
  const readDollar = (q: boolean): Seg => {
    i++; // past $
    if (src.startsWith('((', i)) { i += 2; return { t: 'arith', v: readBalanced('((', '))'), q }; }
    if (src[i] === '(') { i++; return { t: 'cmd', v: readBalanced('(', ')'), q }; }
    if (src[i] === '{') {
      i++; const inner = readBalanced('{', '}');
      const m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9@#?$!*-])(?::?([-=+?]))?([\s\S]*)$/.exec(inner);
      if (!m) throw new Error(`bad substitution: \${${inner}}`);
      const op = m[2] ? (inner.slice(m[1].length).startsWith(':') ? ':' : '') + m[2] : undefined;
      return { t: 'var', v: m[1], q, op, arg: op ? lexWord(m[3]) : undefined };
    }
    const m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9@#?$!*-])/.exec(src.slice(i));
    if (!m) return { t: 'lit', v: '$', q };
    i += m[1].length; return { t: 'var', v: m[1], q };
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      out.push({ k: 'nl' }); i++;
      for (const h of pendingHeredocs.splice(0)) { // here-document bodies follow the line that introduced them
        let body = '';
        while (i < src.length) {
          const e = src.indexOf('\n', i), line = src.slice(i, e < 0 ? src.length : e);
          i = e < 0 ? src.length : e + 1;
          if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) break;
          body += (h.strip ? line.replace(/^\t+/, '') : line) + '\n';
        }
        h.tok.body = body;
      }
      continue;
    }
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    const op = OPS.find((o) => src.startsWith(o, i) && !(o[0] >= '0' && o[0] <= '9' && i > 0 && /\S/.test(src[i - 1]) && !/[;|&<>()]/.test(src[i - 1])));
    if (op) {
      i += op.length; out.push({ k: 'op', v: op });
      if (op === '<<' || op === '<<-') { // delimiter word
        while (src[i] === ' ' || src[i] === '\t') i++;
        let d = '', quoted = false;
        while (i < src.length && !/[\s;|&<>()]/.test(src[i])) { if (src[i] === "'" || src[i] === '"') { quoted = true; i++; continue; } d += src[i++]; }
        const tok = { k: 'heredoc' as const, body: '', expand: !quoted };
        out.push(tok); pendingHeredocs.push({ tok, delim: d, strip: op === '<<-' });
      }
      continue;
    }
    // a word
    const w: Word = [], start = i;
    let lit = '';
    const flush = (q: boolean) => { if (lit) { w.push({ t: 'lit', v: lit, q }); lit = ''; } };
    if (c === '~' && (src[i + 1] === undefined || /[\s/:;|&<>()]/.test(src[i + 1]))) { w.push({ t: 'tilde', v: '' }); i++; }
    while (i < src.length && !/[\s;|&<>()]/.test(src[i])) {
      const ch = src[i];
      if (ch === '\\') { lit += src[i + 1] ?? ''; flush(true); i += 2; continue; }
      if (ch === "'") { flush(false); const j = src.indexOf("'", i + 1); if (j < 0) throw new Error('unterminated quote'); w.push({ t: 'lit', v: src.slice(i + 1, j), q: true }); i = j + 1; continue; }
      if (ch === '"') {
        flush(false); i++;
        let s = '';
        while (i < src.length && src[i] !== '"') {
          if (src[i] === '\\' && '"\\$`\n'.includes(src[i + 1])) { if (src[i + 1] !== '\n') s += src[i + 1]; i += 2; continue; }
          if (src[i] === '$') { if (s) { w.push({ t: 'lit', v: s, q: true }); s = ''; } w.push(readDollar(true)); continue; }
          if (src[i] === '`') { if (s) { w.push({ t: 'lit', v: s, q: true }); s = ''; } i++; const j = src.indexOf('`', i); w.push({ t: 'cmd', v: src.slice(i, j), q: true }); i = j + 1; continue; }
          s += src[i++];
        }
        if (src[i] !== '"') throw new Error('unterminated quote');
        i++; w.push({ t: 'lit', v: s, q: true });
        continue;
      }
      if (ch === '$') { flush(false); w.push(readDollar(false)); continue; }
      if (ch === '`') { flush(false); i++; const j = src.indexOf('`', i); if (j < 0) throw new Error('unterminated `'); w.push({ t: 'cmd', v: src.slice(i, j), q: false }); i = j + 1; continue; }
      lit += ch; i++;
    }
    flush(false);
    out.push({ k: 'w', w, raw: src.slice(start, i) });
  }
  if (pendingHeredocs.length) for (const h of pendingHeredocs) h.tok.body = h.tok.body || '';
  return out;
}
function lexWord(s: string): Word { const t = lex(`x ${s}`).filter((x) => x.k === 'w') as Array<Tok & { k: 'w' }>; return t.slice(1).flatMap((x, i) => (i ? [{ t: 'lit' as const, v: ' ', q: true }, ...x.w] : x.w)); }

// ---------------------------------------------------------------- parser
type Redir = { op: string; target?: Word; fd: number; body?: string; expand?: boolean };
type Simple = { k: 'cmd'; assigns: Array<[string, Word]>; words: Word[]; redirs: Redir[] };
type Node =
  | Simple
  | { k: 'pipe'; cmds: Node[]; neg: boolean }
  | { k: 'and' | 'or'; a: Node; b: Node }
  | { k: 'list'; items: Node[] }
  | { k: 'if'; cond: Node; then: Node; els?: Node; redirs: Redir[] }
  | { k: 'while' | 'until'; cond: Node; body: Node; redirs: Redir[] }
  | { k: 'for'; name: string; items: Word[] | null; body: Node; redirs: Redir[] }
  | { k: 'group'; body: Node; sub: boolean; redirs: Redir[] }
  | { k: 'case'; word: Word; arms: Array<{ pats: Word[]; body: Node }>; redirs: Redir[] };

const KW = new Set(['if', 'then', 'elif', 'else', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', 'case', 'esac', '{', '}', '!']);
const plain = (w: Word) => (w.every((s) => s.t === 'lit' && !s.q) ? w.map((s) => (s as any).v).join('') : null);

export function parse(src: string): Node {
  const t = lex(src);
  let p = 0;
  const peek = () => t[p];
  const isKw = (v: string) => { const x = t[p]; return x?.k === 'w' && plain(x.w) === v; };
  const expectKw = (v: string) => { if (!isKw(v)) throw new Error(`syntax error: expected '${v}'`); p++; };
  const skipNl = () => { while (t[p] && (t[p].k === 'nl' || (t[p].k === 'op' && (t[p] as any).v === ';'))) p++; };
  const list = (stop: string[]): Node => {
    const items: Node[] = [];
    skipNl();
    while (p < t.length && !stop.some(isKw) && !(peek()?.k === 'op' && [')', ';;'].includes((peek() as any).v))) {
      items.push(andOr());
      const x = peek();
      if (x?.k === 'op' && (x.v === ';' || x.v === '&')) p++;
      skipNl();
    }
    return { k: 'list', items };
  };
  const andOr = (): Node => {
    let n = pipeline();
    while (peek()?.k === 'op' && ['&&', '||'].includes((peek() as any).v)) { const op = (t[p++] as any).v; skipNlOnly(); n = { k: op === '&&' ? 'and' : 'or', a: n, b: pipeline() }; }
    return n;
  };
  const skipNlOnly = () => { while (t[p]?.k === 'nl') p++; };
  const pipeline = (): Node => {
    let neg = false;
    if (isKw('!')) { neg = true; p++; }
    const cmds = [command()];
    while (peek()?.k === 'op' && (peek() as any).v === '|') { p++; skipNlOnly(); cmds.push(command()); }
    return cmds.length === 1 && !neg ? cmds[0] : { k: 'pipe', cmds, neg };
  };
  const redirs = (): Redir[] => {
    const r: Redir[] = [];
    for (;;) {
      const x = peek();
      if (x?.k !== 'op' || !['>', '>>', '<', '2>', '2>>', '&>', '&>>', '2>&1', '>&2', '1>&2', '1>', '<<', '<<-', '<<<'].includes(x.v)) return r;
      p++;
      if (x.v === '2>&1' || x.v === '>&2' || x.v === '1>&2') { r.push({ op: x.v, fd: x.v === '2>&1' ? 2 : 1 }); continue; }
      if (x.v === '<<' || x.v === '<<-') { const h = t[p++] as any; r.push({ op: '<<', fd: 0, body: h.body, expand: h.expand }); continue; }
      const w = t[p++]; if (w?.k !== 'w') throw new Error(`syntax error near '${x.v}'`);
      r.push({ op: x.v, target: w.w, fd: x.v.startsWith('2') ? 2 : x.v.startsWith('<') ? 0 : 1 });
    }
  };
  const command = (): Node => {
    if (isKw('if')) {
      p++; const cond = list(['then']); expectKw('then'); const then = list(['elif', 'else', 'fi']);
      const tail = (): Node | undefined => {
        if (isKw('elif')) { p++; const c = list(['then']); expectKw('then'); const b = list(['elif', 'else', 'fi']); return { k: 'if', cond: c, then: b, els: tail(), redirs: [] }; }
        if (isKw('else')) { p++; return list(['fi']); }
        return undefined;
      };
      const els = tail(); expectKw('fi');
      return { k: 'if', cond, then, els, redirs: redirs() };
    }
    if (isKw('while') || isKw('until')) {
      const k = isKw('while') ? 'while' : 'until'; p++;
      const cond = list(['do']); expectKw('do'); const body = list(['done']); expectKw('done');
      return { k, cond, body, redirs: redirs() };
    }
    if (isKw('for')) {
      p++; const nw = t[p++]; const name = nw?.k === 'w' ? plain(nw.w) : null; if (!name) throw new Error('syntax error: bad for loop variable');
      let items: Word[] | null = null;
      skipNlOnly();
      if (isKw('in')) { p++; items = []; while (peek()?.k === 'w' && !isKw('do')) items.push((t[p++] as any).w); }
      skipNl(); expectKw('do'); const body = list(['done']); expectKw('done');
      return { k: 'for', name, items, body, redirs: redirs() };
    }
    if (isKw('case')) {
      p++; const wt = t[p++]; if (wt?.k !== 'w') throw new Error('syntax error: case needs a word');
      skipNlOnly(); expectKw('in'); skipNl();
      const arms: Array<{ pats: Word[]; body: Node }> = [];
      while (!isKw('esac')) {
        if (p >= t.length) throw new Error("syntax error: expected 'esac'");
        if (peek()?.k === 'op' && (peek() as any).v === '(') p++;
        const pats: Word[] = [];
        for (;;) { const x = t[p++]; if (x?.k !== 'w') throw new Error('syntax error in case pattern'); pats.push(x.w); if (peek()?.k === 'op' && (peek() as any).v === '|') { p++; continue; } break; }
        if (!(peek()?.k === 'op' && (peek() as any).v === ')')) throw new Error("syntax error: expected ')' in case");
        p++;
        const body = list(['esac']);
        if (peek()?.k === 'op' && (peek() as any).v === ';;') p++;
        skipNl();
        arms.push({ pats, body });
      }
      expectKw('esac');
      return { k: 'case', word: wt.w, arms, redirs: redirs() };
    }
    if (isKw('{')) { p++; const body = list(['}']); expectKw('}'); return { k: 'group', body, sub: false, redirs: redirs() }; }
    if (peek()?.k === 'op' && (peek() as any).v === '(') { p++; const body = list([]); if (!(peek()?.k === 'op' && (peek() as any).v === ')')) throw new Error("syntax error: expected ')'"); p++; return { k: 'group', body, sub: true, redirs: redirs() }; }
    const c: Simple = { k: 'cmd', assigns: [], words: [], redirs: [] };
    for (;;) {
      c.redirs.push(...redirs());
      const x = peek();
      if (x?.k !== 'w') break;
      if (!c.words.length && KW.has(plain(x.w) || '') && !['{', '}', '!'].includes(plain(x.w)!)) break;
      if (!c.words.length && plain(x.w) === '}') break;
      const m = !c.words.length && x.w[0]?.t === 'lit' && !x.w[0].q ? /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(x.w[0].v) : null;
      p++;
      if (m) { const first = x.w[0] as any; c.assigns.push([m[1], [{ t: 'lit', v: first.v.slice(m[0].length), q: true }, ...x.w.slice(1)]]); continue; }
      c.words.push(x.w);
    }
    if (!c.words.length && !c.assigns.length && !c.redirs.length) {
      const x = peek();
      throw new Error(`syntax error near '${x ? (x.k === 'op' ? x.v : x.k === 'w' ? x.raw : 'newline') : 'end of input'}'`);
    }
    return c;
  };
  const root = list([]);
  if (p < t.length) { const x = t[p]; throw new Error(`syntax error near '${x.k === 'op' ? x.v : x.k === 'w' ? x.raw : 'newline'}'`); }
  return root;
}

// ---------------------------------------------------------------- glob
export function globToRegex(g: string, anyChar = false) {
  let r = '^';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '\\' && i + 1 < g.length) { r += g[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); continue; }
    if (c === '*') r += anyChar ? '.*' : '[^/]*'; else if (c === '?') r += anyChar ? '.' : '[^/]';
    else if (c === '[') { const j = g.indexOf(']', i + 2); if (j < 0) { r += '\\['; continue; } let cls = g.slice(i + 1, j); if (cls[0] === '!') cls = '^' + cls.slice(1); r += `[${cls.replace(/\\/g, '\\\\')}]`; i = j; }
    else r += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(r + '$');
}

// ---------------------------------------------------------------- interpreter
export interface ShellIO { out: (s: string) => void; err: (s: string) => void }
type Stream = { data: Uint8Array };
class ExitSignal extends Error { constructor(public code: number) { super('exit'); } }
class LoopSignal extends Error { constructor(public kind: 'break' | 'continue') { super(kind); } }

export class Shell {
  vars = new Map<string, string>();
  exported = new Set<string>(['HOME', 'PATH', 'PWD', 'USER', 'LOGNAME', 'SHELL', 'TERM', 'LANG', 'TZ', 'COLUMNS', 'HOSTNAME']);
  history: string[] = [];
  last = 0;
  cwd = '/home/user';
  applets: Set<string>;
  cols = 100;
  constructor(public vfs: VFS, public busybox: WebAssembly.Module, applets: string[], public io: ShellIO) {
    this.applets = new Set(applets);
    for (const [k, v] of Object.entries({ HOME: '/home/user', PATH: '/bin:/usr/bin', USER: 'user', LOGNAME: 'user', SHELL: '/bin/sh', TERM: 'xterm-256color', LANG: 'C.UTF-8', TZ: 'UTC', HOSTNAME: 'supertools', PS1: '\\u@\\h:\\w\\$ ' })) this.vars.set(k, v);
    this.vars.set('PWD', this.cwd);
    try { this.vfs.mkdirp(this.cwd); } catch { /* exists */ }
  }
  env() { const e: Record<string, string> = {}; for (const k of this.exported) if (this.vars.has(k)) e[k] = this.vars.get(k)!; e.PWD = this.cwd; e.COLUMNS = String(this.cols); return e; }
  prompt() { const home = this.vars.get('HOME') || '/home/user'; const w = this.cwd === home ? '~' : this.cwd.startsWith(home + '/') ? '~' + this.cwd.slice(home.length) : this.cwd; return `user@supertools:${w}$ `; }

  /** Run one line (or a script). Returns the exit status. */
  run(src: string, record = true): number {
    if (record && src.trim()) this.history.push(src);
    let ast: Node;
    try { ast = parse(src); } catch (e: any) { this.io.err(`sh: ${e.message}\n`); return (this.last = 2); }
    const out = (b: Uint8Array) => this.io.out(dec.decode(b, { stream: true })), err = (b: Uint8Array) => this.io.err(dec.decode(b, { stream: true }));
    try { return (this.last = this.exec(ast, { stdin: null, out, err, tty: true })); }
    catch (e) { if (e instanceof ExitSignal) return (this.last = e.code); if (e instanceof LoopSignal) return (this.last = 0); throw e; }
  }
  /** Run and capture stdout (used by $(…) and tests). */
  capture(src: string, stdin?: Uint8Array): { out: string; err: string; code: number } {
    const o: Uint8Array[] = [], e: Uint8Array[] = [];
    let ast: Node;
    try { ast = parse(src); } catch (er: any) { return { out: '', err: `sh: ${er.message}\n`, code: 2 }; }
    let code: number;
    try { code = this.exec(ast, { stdin: stdin ? { data: stdin } : null, out: (b) => o.push(b), err: (b) => e.push(b), tty: false }); }
    catch (x) { if (x instanceof ExitSignal) code = x.code; else throw x; }
    const cat = (a: Uint8Array[]) => dec.decode(concat(a));
    this.last = code;
    return { out: cat(o), err: cat(e), code };
  }

  private exec(n: Node, io: { stdin: Stream | null; out: (b: Uint8Array) => void; err: (b: Uint8Array) => void; tty: boolean }): number {
    switch (n.k) {
      case 'list': { let c = 0; for (const it of n.items) c = this.last = this.exec(it, io); return c; }
      case 'and': { const a = this.exec(n.a, io); this.last = a; return a === 0 ? this.exec(n.b, io) : a; }
      case 'or': { const a = this.exec(n.a, io); this.last = a; return a !== 0 ? this.exec(n.b, io) : a; }
      case 'pipe': {
        let input = io.stdin, code = 0;
        n.cmds.forEach((c, i) => {
          const lastStage = i === n.cmds.length - 1;
          if (lastStage) code = this.exec(c, { ...io, stdin: input });
          else { const buf: Uint8Array[] = []; this.exec(c, { stdin: input, out: (b) => buf.push(b), err: io.err, tty: false, pipe: true } as any); input = { data: concat(buf) }; }
        });
        return n.neg ? (code ? 0 : 1) : code;
      }
      case 'if': return this.withRedirs(n.redirs, io, (io2) => (this.exec(n.cond, io2) === 0 ? this.exec(n.then, io2) : n.els ? this.exec(n.els, io2) : 0));
      case 'while': case 'until': return this.withRedirs(n.redirs, io, (io2) => {
        let c = 0, guard = 0;
        while ((this.exec(n.cond, io2) === 0) === (n.k === 'while')) {
          if (++guard > 1_000_000) { io.err(enc.encode('sh: loop stopped after 1,000,000 iterations\n')); return 1; }
          try { c = this.exec(n.body, io2); } catch (e) { if (e instanceof LoopSignal) { if (e.kind === 'break') break; continue; } throw e; }
        }
        return c;
      });
      case 'for': return this.withRedirs(n.redirs, io, (io2) => {
        const items = n.items ? n.items.flatMap((w) => this.expand(w)) : (this.vars.get('@') || '').split(' ').filter(Boolean);
        let c = 0;
        for (const it of items) {
          this.vars.set(n.name, it);
          try { c = this.exec(n.body, io2); } catch (e) { if (e instanceof LoopSignal) { if (e.kind === 'break') break; continue; } throw e; }
        }
        return c;
      });
      case 'group': return this.withRedirs(n.redirs, io, (io2) => {
        if (!n.sub) return this.exec(n.body, io2);
        const save = { cwd: this.cwd, vars: new Map(this.vars), exported: new Set(this.exported) };
        try { return this.exec(n.body, io2); } catch (e) { if (e instanceof ExitSignal) return e.code; throw e; }
        finally { this.cwd = save.cwd; this.vars = save.vars; this.exported = save.exported; }
      });
      case 'case': return this.withRedirs(n.redirs, io, (io2) => {
        const v = this.expand(n.word, true).join('');
        for (const arm of n.arms) {
          for (const pw of arm.pats) {
            const pat = pw.map((sg) => (sg.t === 'lit' ? (sg.q ? sg.v.replace(/[*?[\]\\]/g, '\\$&') : sg.v) : this.expand([sg], true).join('').replace(/[*?[\]\\]/g, '\\$&'))).join('');
            if (globToRegex(pat, true).test(v)) return this.exec(arm.body, io2);
          }
        }
        return 0;
      });
      case 'cmd': return this.simple(n, io);
    }
  }

  private withRedirs(rs: Redir[], io: any, f: (io: any) => number): number {
    if (!rs.length) return f(io);
    const r = this.applyRedirs(rs, io);
    if (typeof r === 'number') return r;
    try { return f(r.io); } finally { r.done(); }
  }
  /** Apply redirections → new io (+ finaliser that writes captured output to files). */
  private applyRedirs(rs: Redir[], io: any): { io: any; done: () => void } | number {
    let stdin: Stream | null = io.stdin, out = io.out, err = io.err, tty = io.tty;
    const files: Array<{ path: string; append: boolean; chunks: Uint8Array[] }> = [];
    const fileSink = (path: string, append: boolean) => {
      let f = files.find((x) => x.path === path);
      if (!f) { f = { path, append, chunks: [] }; files.push(f); if (!append) this.vfs.writeFile(path, new Uint8Array(0), this.cwd); }
      const ff = f;
      return (b: Uint8Array) => { ff.chunks.push(b); };
    };
    try {
      for (const r of rs) {
        if (r.op === '2>&1') err = out;
        else if (r.op === '>&2' || r.op === '1>&2') out = err;
        else if (r.op === '<<') stdin = { data: enc.encode(r.expand ? this.expandHeredoc(r.body || '') : r.body || '') };
        else if (r.op === '<<<') stdin = { data: enc.encode(this.expand(r.target!, true).join(' ') + '\n') };
        else {
          const target = this.expand(r.target!);
          if (target.length !== 1) { io.err(enc.encode('sh: ambiguous redirect\n')); return 1; }
          const path = target[0] === '/dev/null' ? null : target[0];
          if (r.op === '<') {
            if (path === null) stdin = { data: new Uint8Array(0) };
            else stdin = { data: this.vfs.readFile(path, this.cwd) };
          } else {
            const append = r.op.endsWith('>>');
            const sink = path === null ? () => {} : fileSink(VFS.join(this.cwd.startsWith('/') && !path.startsWith('/') ? this.cwd : '/', path), append);
            if (r.op === '&>' || r.op === '&>>') { out = sink; err = sink; } else if (r.fd === 2) err = sink; else out = sink;
            tty = false;
          }
        }
      }
    } catch (e) {
      if (e instanceof FsError) { io.err(enc.encode(`sh: ${rs.find((r) => r.target)?.target ? this.expand(rs.find((r) => r.target)!.target!)[0] : ''}: ${errText(e.errno)}\n`)); return 1; }
      throw e;
    }
    return {
      io: { stdin, out, err, tty },
      done: () => { for (const f of files) { const node = this.vfs.tryLookup(f.path); const prev = f.append && node && node.kind === 'file' ? this.vfs.readFile(f.path) : new Uint8Array(0); this.vfs.writeFile(f.path, concat([prev, ...f.chunks])); } },
    };
  }

  private expandHeredoc(body: string) { return this.expand(lexHeredoc(body), true).join(''); }

  /** Expand a word: variables, command/arith substitution, tilde, field splitting and globbing (unquoted parts). */
  expand(w: Word, noSplit = false): string[] {
    // build fields: each piece carries whether it may split/glob
    let fields: Array<{ s: string; glob: boolean; hadQuote: boolean }> = [{ s: '', glob: false, hadQuote: false }];
    const add = (s: string, quoted: boolean) => {
      if (quoted || noSplit) { fields[fields.length - 1].s += quoted ? s.replace(/[*?[]/g, (c) => `\u0000${c}`) : s; fields[fields.length - 1].hadQuote ||= quoted; return; }
      const parts = s.split(/[ \t\n]+/);
      parts.forEach((p, i) => { if (i) fields.push({ s: '', glob: false, hadQuote: false }); fields[fields.length - 1].s += p; if (/[*?[]/.test(p)) fields[fields.length - 1].glob = true; });
    };
    for (const seg of w) {
      if (seg.t === 'lit') { if (seg.q) add(seg.v, true); else { fields[fields.length - 1].s += seg.v; if (/[*?[]/.test(seg.v)) fields[fields.length - 1].glob = true; } }
      else if (seg.t === 'tilde') fields[fields.length - 1].s += this.vars.get('HOME') || '/home/user';
      else if (seg.t === 'var') {
        let v = this.varValue(seg.v);
        if (seg.op) {
          const unset = seg.op.startsWith(':') ? !v : v === undefined, op = seg.op.replace(':', '');
          const arg = () => this.expand(seg.arg || [], true).join(' ');
          if (op === '-' && unset) v = arg(); else if (op === '=' && unset) { v = arg(); this.vars.set(seg.v, v); } else if (op === '+') v = unset ? '' : arg();
          else if (op === '?' && unset) throw Object.assign(new ExitSignal(1), { msg: `${seg.v}: ${arg() || 'parameter not set'}` });
        }
        add(v ?? '', seg.q);
      } else if (seg.t === 'cmd') add(this.capture(seg.v).out.replace(/\n+$/, ''), seg.q);
      else if (seg.t === 'arith') add(String(this.arith(seg.v)), seg.q);
    }
    if (!noSplit) fields = fields.filter((f, i) => f.s !== '' || f.hadQuote || (i === 0 && fields.length === 1 && w.some((s) => s.t === 'lit' && s.q)));
    const out: string[] = [];
    for (const f of fields) {
      if (f.glob && !noSplit) { const g = this.glob(f.s); if (g.length) { out.push(...g); continue; } }
      out.push(f.s.replace(/\u0000/g, ''));
    }
    return noSplit && !out.length ? [''] : out;
  }
  private varValue(name: string): string | undefined {
    if (name === '?') return String(this.last);
    if (name === '$') return '1';
    if (name === '#') return String((this.vars.get('@') || '').split(' ').filter(Boolean).length);
    if (name === 'PWD') return this.cwd;
    if (name === 'RANDOM') return String(crypto.getRandomValues(new Uint16Array(1))[0] & 0x7fff);
    return this.vars.get(name);
  }
  /** $((…)) — integers: + - * / % ** comparisons && || ! ~ & | ^ << >> ?: parentheses, variables. */
  arith(src: string): number {
    const toks = src.match(/\*\*|<<|>>|<=|>=|==|!=|&&|\|\||[0-9]+|0x[0-9a-fA-F]+|[A-Za-z_][A-Za-z0-9_]*|\$[A-Za-z_?#][A-Za-z0-9_]*|[-+*/%()<>!~&|^?:]/g) || [];
    let p = 0;
    const num = (): number => {
      const t = toks[p++];
      if (t === undefined) throw new Error('arithmetic: unexpected end');
      if (t === '(') { const v = ternary(); p++; return v; }
      if (t === '-') return -num(); if (t === '+') return num(); if (t === '!') return num() ? 0 : 1; if (t === '~') return ~num();
      if (/^\d|^0x/.test(t)) return Number(t);
      const name = t.replace(/^\$/, ''), v = this.varValue(name);
      return v ? Math.trunc(Number(v)) || 0 : 0;
    };
    const bin = (ops: string[][], i: number): number => {
      if (i === ops.length) return num();
      let a = bin(ops, i + 1);
      while (ops[i].includes(toks[p])) {
        const op = toks[p++], b = bin(ops, i + (op === '**' ? 0 : 1));
        a = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? (b ? Math.trunc(a / b) : (() => { throw new Error('arithmetic: division by zero'); })()) : op === '%' ? a % b : op === '**' ? a ** b
          : op === '<' ? +(a < b) : op === '>' ? +(a > b) : op === '<=' ? +(a <= b) : op === '>=' ? +(a >= b) : op === '==' ? +(a === b) : op === '!=' ? +(a !== b)
          : op === '&&' ? +(!!a && !!b) : op === '||' ? +(!!a || !!b) : op === '&' ? a & b : op === '|' ? a | b : op === '^' ? a ^ b : op === '<<' ? a << b : a >> b;
      }
      return a;
    };
    const LV = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%'], ['**']];
    const ternary = (): number => { const c = bin(LV, 0); if (toks[p] === '?') { p++; const a = ternary(); p++; const b = ternary(); return c ? a : b; } return c; };
    return ternary();
  }
  glob(pattern: string): string[] {
    const abs = pattern.startsWith('/');
    const parts = pattern.split('/').filter((x, i) => x || i === 0);
    let paths = [abs ? '/' : ''];
    for (const part of (abs ? parts.slice(1) : parts)) {
      const next: string[] = [];
      for (const base of paths) {
        if (!/[*?[]/.test(part)) { next.push(base + (base && !base.endsWith('/') ? '/' : '') + part.replace(/\u0000/g, '')); continue; }
        const dir = this.vfs.tryLookup(base || '.', this.cwd);
        if (!dir || dir.kind !== 'dir') continue;
        const re = globToRegex(part.replace(/\u0000(.)/g, '\\$1'));
        for (const name of [...dir.entries.keys()].sort()) if ((name[0] !== '.' || part[0] === '.') && re.test(name)) next.push(base + (base && !base.endsWith('/') ? '/' : '') + name);
      }
      paths = next;
    }
    return paths.filter((p) => this.vfs.tryLookup(p, this.cwd, false));
  }

  private simple(c: Simple, io: any): number {
    let words: string[];
    try { words = c.words.flatMap((w) => this.expand(w)); }
    catch (e: any) { if (e instanceof ExitSignal && (e as any).msg) { io.err(enc.encode(`sh: ${(e as any).msg}\n`)); return 1; } if (e?.message?.startsWith('arithmetic')) { io.err(enc.encode(`sh: ${e.message}\n`)); return 1; } throw e; }
    const assigns = c.assigns.map(([k, w]) => [k, this.expand(w, true).join('')] as [string, string]);
    if (!words.length) { for (const [k, v] of assigns) this.vars.set(k, v); return this.withRedirs(c.redirs, io, () => 0); }
    return this.withRedirs(c.redirs, io, (io2) => {
      const name = words[0];
      const b = this.builtin(name, words, io2);
      if (b !== null) return b;
      return this.external(words, assigns, io2);
    });
  }

  private builtin(name: string, a: string[], io: any): number | null {
    const say = (s: string) => io.out(enc.encode(s)), warn = (s: string) => io.err(enc.encode(s));
    switch (name) {
      case 'cd': {
        const target = a[1] === '-' ? this.vars.get('OLDPWD') || this.cwd : a[1] ?? this.vars.get('HOME') ?? '/';
        const dest = VFS.join(target.startsWith('/') ? target : `${this.cwd}/${target}`);
        const n = this.vfs.tryLookup(dest);
        if (!n) { warn(`cd: ${target}: No such file or directory\n`); return 1; }
        if (n.kind !== 'dir') { warn(`cd: ${target}: Not a directory\n`); return 1; }
        this.vars.set('OLDPWD', this.cwd); this.cwd = dest; this.vars.set('PWD', dest);
        if (a[1] === '-') say(dest + '\n');
        return 0;
      }
      case 'pwd': say(this.cwd + '\n'); return 0;
      case 'export': {
        if (a.length === 1 || a[1] === '-p') { for (const k of [...this.exported].sort()) if (this.vars.has(k)) say(`export ${k}='${this.vars.get(k)}'\n`); return 0; }
        for (const x of a.slice(1)) { const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/s.exec(x); if (!m) { warn(`export: ${x}: bad variable name\n`); return 1; } if (m[2] !== undefined) this.vars.set(m[1], m[2]); this.exported.add(m[1]); }
        return 0;
      }
      case 'unset': for (const x of a.slice(1)) { this.vars.delete(x); this.exported.delete(x); } return 0;
      case 'read': {
        const names = a.slice(1).filter((x) => !x.startsWith('-')), raw = a.includes('-r');
        const st = io.stdin as Stream | null;
        if (!st || !st.data.length) return 1;
        const s = dec.decode(st.data), nl = s.indexOf('\n'), line = nl < 0 ? s : s.slice(0, nl);
        st.data = st.data.subarray(enc.encode(nl < 0 ? s : s.slice(0, nl + 1)).length);
        const val = raw ? line : line.replace(/\\(.)/g, '$1');
        const fields = val.trim().split(/[ \t]+/);
        (names.length ? names : ['REPLY']).forEach((n, i, arr) => this.vars.set(n, i === arr.length - 1 ? fields.slice(i).join(' ') : fields[i] || ''));
        return nl < 0 && !s ? 1 : 0;
      }
      case 'history': this.history.forEach((h, i) => say(`${String(i + 1).padStart(5)}  ${h}\n`)); return 0;
      case 'clear': say('\x1b[2J\x1b[H'); return 0;
      case 'exit': throw new ExitSignal(a[1] ? parseInt(a[1], 10) || 0 : this.last);
      case 'break': case 'continue': throw new LoopSignal(name);
      case ':': return 0;
      case 'type': case 'which': {
        let rc = 0;
        for (const x of a.slice(1)) {
          if (BUILTINS.has(x)) say(name === 'type' ? `${x} is a shell builtin\n` : `${x}: shell builtin\n`);
          else if (this.applets.has(x)) say(name === 'type' ? `${x} is /bin/${x}\n` : `/bin/${x}\n`);
          else { rc = 1; if (name === 'type') warn(`${x}: not found\n`); }
        }
        return rc;
      }
      case 'help': say(HELP(this.applets)); return 0;
      case 'source': case '.': {
        if (!a[1]) { warn(`${name}: filename argument required\n`); return 2; }
        try { return this.exec(parse(dec.decode(this.vfs.readFile(a[1], this.cwd))), io); } catch (e) { if (e instanceof FsError) { warn(`${name}: ${a[1]}: ${errText(e.errno)}\n`); return 1; } throw e; }
      }
      case 'sh': {
        if (a[1] === '-c' && a[2] !== undefined) return this.exec(parse(a[2]), io);
        if (a[1]) { try { return this.exec(parse(dec.decode(this.vfs.readFile(a[1], this.cwd))), io); } catch (e) { if (e instanceof FsError) { warn(`sh: ${a[1]}: ${errText(e.errno)}\n`); return 127; } throw e; } }
        if (io.stdin) return this.exec(parse(dec.decode(io.stdin.data)), { ...io, stdin: null });
        return 0;
      }
    }
    return null;
  }

  private external(words: string[], assigns: Array<[string, string]>, io: any): number {
    let name = words[0];
    if (name.includes('/')) {
      const base = name.split('/').pop()!;
      if (/^\/?(usr\/)?s?bin\//.test(name.replace(/^\/+/, '/')) && this.applets.has(base)) name = base;
      else {
        const n = this.vfs.tryLookup(name, this.cwd);
        if (n && n.kind === 'file') return this.builtin('sh', ['sh', name, ...words.slice(1)], io) ?? 0; // run shell scripts
        io.err(enc.encode(`sh: ${words[0]}: ${n ? 'Permission denied' : 'not found'}\n`)); return n ? 126 : 127;
      }
    }
    if (name === 'busybox' && words[1] && this.applets.has(words[1])) { words = words.slice(1); name = words[0]; }
    if (!this.applets.has(name) && name !== 'busybox') { io.err(enc.encode(`sh: ${name}: command not found\n`)); return 127; }
    const tz = name === 'tar' ? this.tarCompression(words, assigns, io) : null;
    if (tz !== null) return tz;
    const env = { ...this.env(), ...Object.fromEntries(assigns) };
    return this.runApplet(words, env, io);
  }
  runApplet(argv: string[], env: Record<string, string>, io: any): number {
    const data = io.stdin ? io.stdin.data : new Uint8Array(0);
    try {
      const code = runWasi(this.busybox, {
        args: argv, env, vfs: this.vfs, cwd: this.cwd, stdin: data, stdout: io.out, stderr: io.err, tty: !!io.tty,
        maxOutput: io.pipe ? 32 * 1024 * 1024 : 64 * 1024 * 1024,
        onStdinUsed: (n) => { if (io.stdin) io.stdin.data = data.subarray(n); },
        extraImports: (m) => ({ supertools: {
          spawn: (argvPtr: number, argc: number, envp: number, inherit: number) => this.spawnFromWasm(m, argvPtr, argc, envp, !!inherit, env, io),
          ncpu: () => (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4,
        } }),
      });
      return code;
    } catch (e) {
      if (e instanceof Abort) return e.code;
      if (e instanceof WebAssembly.RuntimeError) { io.err(enc.encode(`${argv[0]}: crashed (${e.message})\n`)); return 139; }
      throw e;
    }
  }
  /** Host side of BusyBox's exec/spawn (xargs, find -exec, env, nice, nohup, flock…): run the program as another
   *  BusyBox instance (or a shell builtin) on the same filesystem; returns its exit status. exec() passes the
   *  remaining stdin through (inherit) and its own environment (envp). */
  private spawnFromWasm(m: { mem: () => DataView; str: (p: number) => string; stdinRest: () => Uint8Array; stdinUse: (n: number) => void }, argvPtr: number, argc: number, envp: number, inherit: boolean, env: Record<string, string>, io: any): number {
    const v = m.mem(), args: string[] = [];
    for (let i = 0; i < argc; i++) args.push(m.str(v.getUint32(argvPtr + i * 4, true)));
    if (!args.length) return 127;
    let childEnv = env;
    if (envp) { childEnv = {}; for (let i = 0; ; i++) { const p = v.getUint32(envp + i * 4, true); if (!p) break; const kv = m.str(p), eq = kv.indexOf('='); if (eq > 0) childEnv[kv.slice(0, eq)] = kv.slice(eq + 1); } }
    const stdin = inherit ? { data: m.stdinRest() } : null;
    const before = stdin?.data.length ?? 0;
    const sub = { ...io, stdin, tty: io.tty };
    let code: number;
    const name = args[0].split('/').pop()!;
    const b = BUILTINS.has(name) ? this.builtin(name, [name, ...args.slice(1)], sub) : null;
    if (b !== null) code = b;
    else if (!this.applets.has(name)) { io.err(enc.encode(`${args[0]}: No such file or directory\n`)); return 127; }
    else { args[0] = name; code = this.runApplet(args, childEnv, sub); }
    if (stdin) m.stdinUse(before - stdin.data.length);
    return code;
  }
  /** tar -z/-j/-J/-a: BusyBox would fork a compressor; build the pipeline ourselves instead. */
  private tarCompression(words: string[], assigns: Array<[string, string]>, io: any): number | null {
    let comp: 'gz' | 'bz2' | 'xz' | null = null, mode = '', file: string | null = null;
    const rest: string[] = [];
    const flagChars = (s: string) => { for (const ch of s) { if (ch === 'z') comp = 'gz'; else if (ch === 'j') comp = 'bz2'; else if (ch === 'J') comp = 'xz'; else { if ('cxt'.includes(ch)) mode = ch; rest[rest.length - 1] += ch; } } };
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      if (w === '--gzip' || w === '--gunzip') { comp = 'gz'; continue; } if (w === '--bzip2') { comp = 'bz2'; continue; } if (w === '--xz') { comp = 'xz'; continue; }
      if (i === 1 && /^[a-zA-Z]+$/.test(w)) { rest.push('-'); flagChars(w); if (rest[rest.length - 1] === '-') rest.pop(); continue; }
      if (/^-[a-zA-Z]+$/.test(w)) { rest.push('-'); flagChars(w.slice(1)); if (rest[rest.length - 1] === '-') rest.pop(); continue; }
      rest.push(w);
    }
    if (!comp) {
      // decompress automatically when listing/extracting a .tgz/.tar.gz/.tbz2/.tar.bz2/.txz/.tar.xz
      const fIdx = rest.findIndex((x) => /^-.*f$/.test(x) || x === '-f');
      const f = fIdx >= 0 ? rest[fIdx + 1] : null;
      if (f && /\.(tgz|tar\.gz)$/i.test(f)) comp = 'gz'; else if (f && /\.(tbz2?|tar\.bz2)$/i.test(f)) comp = 'bz2'; else if (f && /\.(txz|tar\.xz)$/i.test(f)) comp = 'xz';
      if (!comp || !rest.some((x) => /^-[a-zA-Z]*[xt]/.test(x))) return null;
      for (const x of rest) if (/^-[a-zA-Z]*[xt]/.test(x)) mode = x.includes('x') ? 'x' : 't';
    }
    // find and detach the archive name (-f FILE or -fFILE combined as last flag)
    for (let i = 0; i < rest.length; i++) {
      if (/^-[a-zA-Z]*f$/.test(rest[i])) { file = rest[i + 1] ?? null; rest.splice(i + 1, 1); rest.splice(i, 1, rest[i].slice(0, -1)); if (rest[i] === '-') rest.splice(i, 1); break; }
    }
    const env = { ...this.env(), ...Object.fromEntries(assigns) };
    const tool = comp === 'gz' ? ['gzip', 'gunzip'] : comp === 'bz2' ? ['bzip2', 'bunzip2'] : [null, 'unxz'];
    if (mode === 'c') {
      if (!tool[0]) { io.err(enc.encode('tar: creating .xz archives is not supported (BusyBox has no xz compressor) — use -z or -j\n')); return 1; }
      const tarOut: Uint8Array[] = [];
      const c1 = this.runApplet(['tar', ...rest, '-f', '-'], env, { ...io, stdin: null, out: (b: Uint8Array) => tarOut.push(b), pipe: true });
      if (c1) return c1;
      const z: Uint8Array[] = [];
      const c2 = this.runApplet([tool[0], '-c'], env, { ...io, stdin: { data: concat(tarOut) }, out: (b: Uint8Array) => z.push(b), pipe: true });
      if (c2) return c2;
      if (!file || file === '-') { io.out(concat(z)); return 0; }
      try { this.vfs.writeFile(file, concat(z), this.cwd); } catch (e) { if (e instanceof FsError) { io.err(enc.encode(`tar: ${file}: ${errText(e.errno)}\n`)); return 1; } throw e; }
      return 0;
    }
    let src: Uint8Array;
    try { src = !file || file === '-' ? (io.stdin?.data || new Uint8Array(0)) : this.vfs.readFile(file, this.cwd); } catch (e) { if (e instanceof FsError) { io.err(enc.encode(`tar: ${file}: ${errText(e.errno)}\n`)); return 2; } throw e; }
    const raw: Uint8Array[] = [];
    const c1 = this.runApplet([tool[1]!, '-c'], env, { ...io, stdin: { data: src }, out: (b: Uint8Array) => raw.push(b), pipe: true });
    if (c1) return c1;
    return this.runApplet(['tar', ...rest, '-f', '-'], env, { ...io, stdin: { data: concat(raw) } });
  }
}

function lexHeredoc(body: string): Word {
  // here-docs: $… and `…` expand, everything else literal (quotes are ordinary characters)
  const w: Word = [];
  let i = 0, lit = '';
  while (i < body.length) {
    if (body[i] === '\\' && '$`\\'.includes(body[i + 1])) { lit += body[i + 1]; i += 2; continue; }
    if (body[i] === '$' || body[i] === '`') {
      if (lit) { w.push({ t: 'lit', v: lit, q: true }); lit = ''; }
      let j = i + 1;
      if (body[i] === '`') { j = body.indexOf('`', i + 1); w.push({ t: 'cmd', v: body.slice(i + 1, j), q: true }); i = j + 1; continue; }
      const sub = lex(`x "${body.slice(i).replace(/"/g, '\u0001')}"`)[1] as any;
      const seg = sub?.w?.[0];
      if (seg && seg.t !== 'lit') {
        // measure how much the segment consumed by re-lexing just the dollar expression
        const m = /^\$(\(\([\s\S]*?\)\)|\([\s\S]*?\)|\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@#?$!*-])/.exec(body.slice(i));
        if (m) { const seg2 = (lex(`x "${m[0]}"`)[1] as any).w[0]; w.push(seg2); i += m[0].length; continue; }
      }
      lit += body[i++]; continue;
    }
    lit += body[i++];
  }
  if (lit) w.push({ t: 'lit', v: lit, q: true });
  return w;
}

export const BUILTINS = new Set(['cd', 'pwd', 'export', 'unset', 'read', 'history', 'clear', 'exit', 'break', 'continue', ':', 'type', 'which', 'help', 'source', '.', 'sh']);
export const concat = (a: Uint8Array[]) => { const n = a.reduce((s, b) => s + b.length, 0), o = new Uint8Array(n); let k = 0; for (const b of a) { o.set(b, k); k += b.length; } return o; };
export const errText = (e: number) => ({ 2: 'Permission denied', 8: 'Bad file descriptor', 20: 'File exists', 22: 'File too large', 28: 'Invalid argument', 31: 'Is a directory', 32: 'Too many levels of symbolic links', 44: 'No such file or directory', 54: 'Not a directory', 55: 'Directory not empty' } as Record<number, string>)[e] || `error ${e}`;
const HELP = (applets: Set<string>) => `SuperTools terminal — BusyBox ${[...applets].length} commands running as WebAssembly in your browser.
Files live in memory until you close the tab; use Upload/Download on the right to move files in and out.
Shell: pipes |, redirects > >> < 2> &> 2>&1, here-docs << and <<<, && || ;, $VAR, $(cmd), $((1+2)), *.txt,
       if/then/elif/else/fi, for/while/until … do … done, { …; }, ( … ), # comments.
Builtins: ${[...BUILTINS].join(' ')}
Commands: ${[...applets].sort().join(' ')}
`;
