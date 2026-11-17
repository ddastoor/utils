// A program's output as a terminal would show it: a model without the DOM (unit-tested) and a view for a <pre>.
//   \r and \b move the cursor (progress bars, spinners); ESC[K erases in the line; ESC[2J, ESC[H ESC[J and ESC c
//   clear; ESC[…m sets colours, bold, italic and underline; every other control character and escape sequence is
//   left out. stdout ('o'), stderr ('e') and echoed input ('i') keep their own look.
// The view is built for floods: text arrives in the model, the page is updated once per frame, finished lines sit in
// blocks of ~16 KB (so a new line re-lays out one block, not the whole output) and only the last `cap` characters
// stay on screen, and of one line at most a third of that — text() always gives everything.
export type Stream = 'o' | 'e' | 'i';
export interface Run { t: string; c: string }          // c = stream letter + ";fg;bg;flags" when a style is set

const BASE = ['#3b3b3b', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#dcdfe4'];
const BRIGHT = ['#7f848e', '#ff7b86', '#b5e890', '#ffd68a', '#82c4ff', '#de95f0', '#6fd9e6', '#ffffff'];
const lv = (v: number) => (v ? 55 + 40 * v : 0), byte = (v: number) => Math.max(0, Math.min(255, v | 0));
const c256 = (n: number) => {
  n = byte(n);
  if (n < 8) return BASE[n];
  if (n < 16) return BRIGHT[n - 8];
  if (n >= 232) { const g = 8 + 10 * (n - 232); return `rgb(${g},${g},${g})`; }
  n -= 16; return `rgb(${lv(Math.floor(n / 36))},${lv(Math.floor(n / 6) % 6)},${lv(n % 6)})`;
};
const slice = (runs: Run[], from: number, to: number): Run[] => {
  const out: Run[] = []; let pos = 0;
  for (const r of runs) {
    const e = pos + r.t.length, a = Math.max(from, pos), b = Math.min(to, e);
    if (b > a) out.push({ t: r.t.slice(a - pos, b - pos), c: r.c });
    pos = e; if (pos >= to) break;
  }
  return out;
};
const join = (runs: Run[]): Run[] => {
  const out: Run[] = [];
  for (const r of runs) { const l = out[out.length - 1]; if (l && l.c === r.c) l.t += r.t; else if (r.t) out.push(r); }
  return out;
};

export class TermText {
  private done: Run[] = [];          // finished lines the view has not taken yet
  private line: Run[] = [];          // the last line, still open
  private added: Run[] = [];         // what was appended to the open line since the view last looked
  private redraw = false; private cleared = false;
  private len = 0; private col = 0;  // length of the open line, cursor inside it
  private esc = '';                  // an escape sequence cut off at the end of a chunk
  private home = false;              // ESC[H seen: a following ESC[J clears everything
  private st = { fg: '', bg: '', b: false, i: false, u: false }; private key = '';
  private chunks: string[] = []; private tail = '';     // everything finished, as plain text

  write(s: string, k: Stream) {
    if (this.esc) { s = this.esc + s; this.esc = ''; }
    const n = s.length; let i = 0;
    while (i < n) {
      let j = i;
      while (j < n) { const c = s.charCodeAt(j); if ((c < 32 && c !== 9) || c === 127) break; j++; }
      if (j > i) { this.put(s.slice(i, j), k + this.key); i = j; continue; }
      const c = s.charCodeAt(i);
      if (c === 10) { this.newline(k); i++; }
      else if (c === 13) { this.col = 0; i++; }
      else if (c === 8) { if (this.col > 0) this.col--; i++; }
      else if (c === 27) { const used = this.escape(s, i); if (!used) { this.esc = s.slice(i); return; } i += used; }
      else i++;
    }
  }
  /** Everything written so far as plain text (what Copy and Save give). */
  text() { return this.chunks.join('') + this.tail + this.line.map((r) => r.t).join(''); }
  clear() { this.done = []; this.line = []; this.added = []; this.len = this.col = 0; this.chunks = []; this.tail = ''; this.cleared = this.redraw = true; this.home = false; }
  /** For the view: what changed since the last call. `line` is the open line (all of it when `redraw`). */
  take() {
    const u = { cleared: this.cleared, done: this.done, redraw: this.redraw, line: this.line, added: this.added };
    this.cleared = this.redraw = false; this.done = []; this.added = [];
    return u;
  }

  private fin(t: string, c: string) {
    const l = this.done[this.done.length - 1];
    if (l && l.c === c) l.t += t; else this.done.push({ t, c });
    this.tail += t; if (this.tail.length > 1 << 20) { this.chunks.push(this.tail); this.tail = ''; }
  }
  private newline(k: Stream) {
    for (const r of this.line) this.fin(r.t, r.c);
    this.fin('\n', k + this.key);
    if (this.len || this.added.length) this.redraw = true;
    this.line = []; this.added = []; this.len = this.col = 0; this.home = false;
  }
  private put(t: string, c: string) {
    this.home = false;
    if (this.col > this.len) { const pad = ' '.repeat(this.col - this.len); this.col = this.len; this.put(pad, c[0]); }
    if (this.col === this.len) {
      const l = this.line[this.line.length - 1];
      if (l && l.c === c) l.t += t; else this.line.push({ t, c });
      if (!this.redraw) { const a = this.added[this.added.length - 1]; if (a && a.c === c) a.t += t; else this.added.push({ t, c }); }
    } else {
      const a = this.col, b = Math.min(this.len, a + t.length);
      this.line = join([...slice(this.line, 0, a), { t, c }, ...slice(this.line, b, this.len)]);
      this.len = Math.max(this.len, a + t.length); this.col = a + t.length; this.redraw = true; this.added = [];
      return;
    }
    this.len += t.length; this.col = this.len;
  }
  private erase(mode: number) {
    if (mode === 2) { this.line = []; this.len = 0; }
    else if (mode === 1) { const col = this.col, n = Math.min(this.len, col + 1); if (n) { this.col = 0; this.put(' '.repeat(n), this.line[0]?.c[0] || 'o'); this.col = col; } }
    else if (this.col < this.len) { this.line = slice(this.line, 0, this.col); this.len = this.col; }
    this.redraw = true; this.added = [];
  }
  /** One escape sequence starting at s[i]; returns how many characters it took, 0 = not complete yet. */
  private escape(s: string, i: number): number {
    const n = s.length; if (i + 1 >= n) return 0;
    const t = s[i + 1];
    if (t === '[') {
      let j = i + 2;
      while (j < n) { const c = s.charCodeAt(j); if (c >= 0x40 && c <= 0x7e) break; if (c < 0x20 || c > 0x3f) return j - i; j++; }
      if (j >= n) return j - i > 64 ? 1 : 0;
      const p = s.slice(i + 2, j), f = s[j];
      if (f === 'm') this.sgr(p);
      else if (f === 'K') this.erase(+p || 0);
      else if (f === 'J') { if (p === '2' || p === '3' || this.home) this.clear(); else if (!p || p === '0') this.erase(0); }
      else if (f === 'H' || f === 'f') this.home = /^[01]?(;[01]?)?$/.test(p);
      return j - i + 1;
    }
    if (t === ']' || t === 'P' || t === '^' || t === '_') {          // OSC / DCS / PM / APC: up to BEL or ESC \
      for (let j = i + 2; j < n; j++) {
        if (s.charCodeAt(j) === 7) return j - i + 1;
        if (s.charCodeAt(j) === 27) return j + 1 < n ? (s[j + 1] === '\\' ? j - i + 2 : j - i) : 0;
      }
      return n - i > 4096 ? 2 : 0;
    }
    if (t === 'c') { this.clear(); return 2; }
    if ('()*+#%'.includes(t)) return i + 2 < n ? 3 : 0;
    return 2;
  }
  private sgr(p: string) {
    const a = (p || '0').split(/[;:]/).map((x) => +x || 0), s = this.st;
    for (let i = 0; i < a.length; i++) {
      const c = a[i];
      if (c === 0) { s.fg = s.bg = ''; s.b = s.i = s.u = false; }
      else if (c === 1) s.b = true; else if (c === 3) s.i = true; else if (c === 4) s.u = true;
      else if (c === 22) s.b = false; else if (c === 23) s.i = false; else if (c === 24) s.u = false;
      else if (c >= 30 && c <= 37) s.fg = BASE[c - 30]; else if (c >= 90 && c <= 97) s.fg = BRIGHT[c - 90]; else if (c === 39) s.fg = '';
      else if (c >= 40 && c <= 47) s.bg = BASE[c - 40]; else if (c >= 100 && c <= 107) s.bg = BRIGHT[c - 100]; else if (c === 49) s.bg = '';
      else if (c === 38 || c === 48) {
        let col = '';
        if (a[i + 1] === 5) { col = c256(a[i + 2] || 0); i += 2; }
        else if (a[i + 1] === 2) { col = `rgb(${byte(a[i + 2])},${byte(a[i + 3])},${byte(a[i + 4])})`; i += 4; }
        if (c === 38) s.fg = col; else s.bg = col;
      }
    }
    this.key = s.fg || s.bg || s.b || s.i || s.u ? `;${s.fg};${s.bg};${s.b ? 'b' : ''}${s.i ? 'i' : ''}${s.u ? 'u' : ''}` : '';
  }
}

const CLS: Record<string, string> = { o: 'term-out', e: 'term-err', i: 'term-in', n: 'term-note' };
const CHUNK = 16384;
/** Shows a TermText in `pre`. write() is cheap (the page is touched once per frame); flush() draws now. */
export function termView(pre: HTMLElement, cap = 600_000) {
  const model = new TermText(), doc = pre.ownerDocument;
  const cut = doc.createElement('div'), body = doc.createElement('div'), cur = doc.createElement('div');
  cut.className = 'term-cut'; cut.hidden = true;
  pre.replaceChildren(cut, body, cur);
  const lineCap = Math.floor(cap / 3);          // so that an endless line cannot push everything else off the screen
  let raf = 0, shown = 0, hidden = 0, curLen = 0, curTotal = 0, curCut = false;
  let chunk: { el: HTMLElement; n: number } | null = null, lineLen = 0, skipped = 0;
  const sizes = new WeakMap<Element, number>();
  const span = (t: string, c: string) => {
    const e = doc.createElement('span'); e.className = CLS[c[0]] || CLS.o; (e as any)._c = c; e.append(t);
    if (c.length > 1) {
      const [, fg, bg, fl] = c.split(';');
      if (fg) e.style.color = fg; if (bg) e.style.background = bg;
      if (fl.includes('b')) e.style.fontWeight = '700'; if (fl.includes('i')) e.style.fontStyle = 'italic'; if (fl.includes('u')) e.style.textDecoration = 'underline';
    }
    return e;
  };
  const into = (box: HTMLElement, t: string, c: string) => {
    const l = box.lastChild as any;
    if (l && l._c === c) (l.firstChild as Text).appendData(t); else box.append(span(t, c));
  };
  const more = (n: number) => `  … ${n.toLocaleString('en-IN')} more characters on this line are not shown here — Copy or Save gives all of it`;
  const piece = (t: string, c: string) => {
    if (!chunk) { chunk = { el: doc.createElement('div'), n: 0 }; chunk.el.className = 'term-chunk'; body.append(chunk.el); }
    into(chunk.el, t, c); chunk.n += t.length; shown += t.length; sizes.set(chunk.el, chunk.n);
    if (chunk.n >= CHUNK && t.endsWith('\n')) chunk = null;
  };
  /** Finished text: whole lines, in blocks; a line longer than `lineCap` is cut with a remark. */
  const finished = (t: string, c: string) => {
    let i = 0; const n = t.length;
    while (i < n) {
      let nl = t.indexOf('\n', i), end = nl < 0 ? n : nl + 1;
      if (nl >= 0 && end - i < CHUNK && lineLen + (end - i) <= lineCap && !skipped) {
        // many short lines: take them together up to a block's worth
        const stop = t.lastIndexOf('\n', Math.min(n, i + CHUNK) - 1); if (stop + 1 > end) end = stop + 1;
        piece(t.slice(i, end), c); lineLen = 0; i = end; continue;
      }
      const len = nl < 0 ? end - i : end - i - 1, room = Math.max(0, lineCap - lineLen);
      if (len > room) { if (room) piece(t.slice(i, i + room), c); skipped += len - room; lineLen += room; }
      else if (len) { piece(t.slice(i, i + len), c); lineLen += len; }
      if (nl >= 0) { if (skipped) { piece(more(skipped), 'n'); skipped = 0; } piece('\n', c); lineLen = 0; }
      i = end;
    }
  };
  /** The open line: all of it again (`all`) or what was added at its end; never more than `lineCap` characters. */
  const openLine = (runs: Run[], all: boolean) => {
    if (curCut) { cur.lastChild!.remove(); curCut = false; }
    if (all) { cur.replaceChildren(); curLen = curTotal = 0; }
    for (const r of runs) {
      curTotal += r.t.length;
      const room = lineCap - curLen; if (room <= 0) continue;
      into(cur, r.t.length > room ? r.t.slice(0, room) : r.t, r.c); curLen += Math.min(room, r.t.length);
    }
    if (curTotal > curLen) { cur.append(span(more(curTotal - curLen), 'n')); curCut = true; }
  };
  function draw() {
    raf = 0;
    const u = model.take(), stick = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
    if (u.cleared) { body.replaceChildren(); cur.replaceChildren(); chunk = null; shown = hidden = curLen = curTotal = lineLen = skipped = 0; curCut = false; }
    for (const r of u.done) finished(r.t, r.c);
    while (shown > cap && body.childElementCount > 1) { const f = body.firstElementChild!, n = sizes.get(f) || 0; f.remove(); shown -= n; hidden += n; }
    cut.hidden = !hidden;
    cut.textContent = hidden ? `The first ${hidden.toLocaleString('en-IN')} characters of the output are not shown here — Copy or Save gives all of it.` : '';
    if (u.redraw) openLine(u.line, true); else if (u.added.length) openLine(u.added, false);
    if (stick) pre.scrollTop = pre.scrollHeight;
  }
  const later = () => { if (!raf) raf = requestAnimationFrame(draw); };
  return {
    model,
    write(t: string, k: Stream) { model.write(t, k); later(); },
    flush() { if (raf) cancelAnimationFrame(raf); draw(); },
    clear() { model.clear(); if (raf) cancelAnimationFrame(raf); draw(); },
    text: () => model.text(),
    /** how many characters at the start of the output are no longer on screen */
    get hidden() { return hidden; },
  };
}
