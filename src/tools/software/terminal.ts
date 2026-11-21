// Linux Terminal (PC only): BusyBox compiled by us to WebAssembly (wasm32-wasi), our own shell and WASI host, an
// in-memory filesystem, and a file panel to upload files into it and download files out of it.
import { h, button, clear, toast, downloadBlob, fmtBytes, pickFiles, type Mount } from '../../ui';

type Reply = { id: number; [k: string]: any };
const SGR_COLORS = ['#3b3b3b', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#dcdfe4'];
const BRIGHT = ['#7f848e', '#ff7b86', '#b5e890', '#ffd68a', '#82c4ff', '#de95f0', '#6fd9e6', '#ffffff'];

/** Minimal ANSI renderer: SGR colours/bold/underline; clear-screen; everything else stripped. */
export function ansiToNodes(text: string, state: { fg?: string; bold?: boolean; ul?: boolean }, onClear: () => void): Node[] {
  const out: Node[] = [];
  const re = /\x1b\[([0-9;?]*)([A-Za-z])/g;
  let i = 0, m: RegExpExecArray | null;
  const push = (s: string) => {
    if (!s) return;
    if (!state.fg && !state.bold && !state.ul) { out.push(document.createTextNode(s)); return; }
    const sp = document.createElement('span'); sp.textContent = s;
    if (state.fg) sp.style.color = state.fg; if (state.bold) sp.style.fontWeight = '700'; if (state.ul) sp.style.textDecoration = 'underline';
    out.push(sp);
  };
  while ((m = re.exec(text))) {
    push(text.slice(i, m.index)); i = re.lastIndex;
    if (m[2] === 'm') {
      for (const c of (m[1] || '0').split(';').map(Number)) {
        if (c === 0) { state.fg = undefined; state.bold = false; state.ul = false; }
        else if (c === 1) state.bold = true; else if (c === 4) state.ul = true; else if (c === 22) state.bold = false; else if (c === 24) state.ul = false;
        else if (c >= 30 && c <= 37) state.fg = (state.bold ? BRIGHT : SGR_COLORS)[c - 30]; else if (c >= 90 && c <= 97) state.fg = BRIGHT[c - 90]; else if (c === 39) state.fg = undefined;
      }
    } else if (m[2] === 'J' && m[1] === '2') onClear();
  }
  push(text.slice(i).replace(/\x1b[^[]?/g, ''));
  return out;
}

export const mount: Mount = (root) => {
  let worker: Worker, seq = 0, busy = false, prompt = 'user@superutils:~$ ', cwd = '/home/user', live = true;
  const pend = new Map<number, (r: Reply) => void>();
  const ansi = {} as { fg?: string; bold?: boolean; ul?: boolean };
  const screen = h('pre', { class: 'term-out', 'aria-live': 'polite', 'aria-label': 'Terminal output' });
  const promptEl = h('span', { class: 'term-prompt' }, prompt);
  const inp = h('input', { class: 'term-in', 'aria-label': 'Command', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' }) as HTMLInputElement;
  const line = h('div', { class: 'term-line' }, promptEl, inp);
  const term = h('div', { class: 'term', onclick: () => { if (!getSelection()?.toString()) inp.focus(); } }, screen, line);
  const status = h('div', { class: 'muted small term-status' });
  const files = h('div', { class: 'term-files' });
  const pathEl = h('div', { class: 'term-path mono small' });
  const history: string[] = [];
  let hpos = 0;

  const write = (text: string, cls?: string) => {
    const nodes = ansiToNodes(text, ansi, () => clear(screen));
    if (cls) { const sp = document.createElement('span'); sp.className = cls; sp.append(...nodes); screen.append(sp); } else screen.append(...nodes);
    // keep the scrollback bounded
    while (screen.childNodes.length > 6000) screen.firstChild!.remove();
    term.scrollTop = term.scrollHeight;
  };
  /** The shell's worker. If it crashes (out of memory) its pending calls end with the reason and a new one starts —
   *  the terminal stayed dead before (every later command waited for ever); the files went with the old one. */
  function startWorker() {
    worker = new Worker(new URL('../../workers/terminal.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'out') write(m.text); else if (m.type === 'err') write(m.text, 'term-err');
      else if (m.type === 'reply') { pend.get(m.id)?.(m); pend.delete(m.id); }
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      if (!live) return;
      write(`\n[the terminal stopped (${e.message || 'out of memory?'}): starting a new one — the files of this one are gone]\n`, 'term-err');
      for (const f of pend.values()) f({ id: 0, error: 'The terminal stopped.' });
      pend.clear(); worker.terminate(); startWorker(); hello();
    };
  }
  startWorker();
  const call = (op: string, data: any = {}, transfer: Transferable[] = []) => new Promise<Reply>((res, rej) => {
    const id = ++seq; pend.set(id, (r) => (r.error ? rej(new Error(r.error)) : res(r))); worker.postMessage({ id, op, ...data }, transfer);
  });
  const cols = () => Math.max(40, Math.floor((screen.clientWidth || 800) / 8.4));
  const setPrompt = (p: string, c: string) => { prompt = p; cwd = c; promptEl.textContent = p; pathEl.textContent = c; };

  const refreshFiles = async () => {
    const r = await call('ls', { path: cwd });
    clear(files);
    if (cwd !== '/') files.append(h('button', { type: 'button', class: 'term-file dir', onclick: () => go('..') }, '📁 ..'));
    for (const it of r.items as Array<{ name: string; kind: string; size: number; target?: string }>) {
      const icon = it.kind === 'dir' ? '📁' : it.kind === 'symlink' ? '🔗' : it.kind === 'dev' ? '⚙️' : '📄';
      const row = h('div', { class: 'term-file-row' },
        h('button', { type: 'button', class: ['term-file', it.kind === 'dir' && 'dir'], title: it.kind === 'symlink' ? `→ ${it.target}` : it.name, onclick: () => (it.kind === 'dir' ? go(it.name) : insert(quote(it.name))) }, `${icon} ${it.name}`),
        h('span', { class: 'muted small' }, it.kind === 'file' ? fmtBytes(it.size) : ''),
        it.kind === 'file' ? button('', () => download(it.name), { icon: 'Download', small: true, variant: 'ghost', title: `Download ${it.name}` })
          : it.kind === 'dir' ? button('', () => downloadDir(it.name), { icon: 'FolderArchive', small: true, variant: 'ghost', title: `Download ${it.name} as .tar` }) : null);
      files.append(row);
    }
  };
  const quote = (s: string) => (/^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);
  const insert = (s: string) => { inp.value = (inp.value && !inp.value.endsWith(' ') ? inp.value + ' ' : inp.value) + s; inp.focus(); };
  const go = async (dir: string) => { const r = await call('cd', { path: dir }); setPrompt(r.prompt, r.cwd); refreshFiles(); };
  const download = async (name: string) => { const r = await call('read', { path: `${cwd}/${name}` }); downloadBlob(new Blob([r.bytes]), name); };
  const downloadDir = async (name: string) => { const r = await call('tar', { path: `${cwd}/${name}` }); downloadBlob(new Blob([r.bytes], { type: 'application/x-tar' }), r.name); };
  const upload = async (fs: File[]) => {
    if (!fs.length) return;
    const list = await Promise.all(fs.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    await call('write', { dir: cwd, files: list }, list.map((x) => x.bytes.buffer));
    write(`[uploaded ${fs.length} file${fs.length > 1 ? 's' : ''} to ${cwd}: ${fs.map((f) => f.name).join(', ')}]\n`, 'term-note');
    toast(`Uploaded ${fs.length} file${fs.length > 1 ? 's' : ''}`, 'ok');
    refreshFiles();
  };

  const run = async (cmd: string) => {
    if (busy) return;
    write(prompt, 'term-prompt-echo'); write(cmd + '\n');
    if (cmd.trim()) { history.push(cmd); hpos = history.length; }
    busy = true; line.classList.add('busy'); status.textContent = 'Running…';
    const slow = setTimeout(() => (status.textContent = 'Still running… (long-running commands stop automatically after 60 s)'), 2500);
    try {
      const r = await call('run', { line: cmd, cols: cols() });
      setPrompt(r.prompt, r.cwd);
      status.textContent = r.code ? `exit status ${r.code}` : '';
    } catch (e: any) { write(`${e.message}\n`, 'term-err'); }
    finally { clearTimeout(slow); busy = false; line.classList.remove('busy'); refreshFiles(); inp.focus(); }
  };

  inp.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = inp.value; inp.value = ''; run(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos > 0) inp.value = history[--hpos]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hpos < history.length - 1) inp.value = history[++hpos]; else { hpos = history.length; inp.value = ''; } }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const before = inp.value.slice(0, inp.selectionStart ?? inp.value.length);
      const r = await call('complete', { text: before });
      const items: string[] = r.items;
      if (!items.length) return;
      const cur = before.split(/\s+/).pop() || '';
      let common = items[0];
      for (const it of items) while (!it.startsWith(common)) common = common.slice(0, -1);
      if (items.length === 1) common = items[0] + (items[0].endsWith('/') ? '' : ' ');
      if (common.length > cur.length) inp.value = before.slice(0, before.length - cur.length) + common + inp.value.slice(before.length);
      else { write(prompt, 'term-prompt-echo'); write(before + '\n' + items.join('  ') + '\n'); }
    } else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); clear(screen); }
    else if (e.key === 'c' && e.ctrlKey && !inp.selectionStart !== !inp.selectionEnd) { /* let copy work when text is selected */ }
    else if (e.key === 'c' && e.ctrlKey && !busy) { e.preventDefault(); write(prompt, 'term-prompt-echo'); write(inp.value + '^C\n'); inp.value = ''; }
    else if (e.key === 'c' && e.ctrlKey && busy) { e.preventDefault(); status.textContent = 'A running command cannot be interrupted in a browser tab; it stops by itself after 60 s.'; } // it did nothing, without a word
  });
  // multi-line paste runs as one script
  inp.addEventListener('paste', (e) => {
    const t = e.clipboardData?.getData('text') || '';
    if (t.includes('\n')) { e.preventDefault(); run(t.replace(/\r\n/g, '\n').replace(/\n$/, '')); }
  });
  term.addEventListener('dragover', (e) => { e.preventDefault(); term.classList.add('over'); });
  term.addEventListener('dragleave', () => term.classList.remove('over'));
  term.addEventListener('drop', (e) => { e.preventDefault(); term.classList.remove('over'); upload([...(e.dataTransfer?.files || [])]); });

  root.append(h('div', { class: 'term-layout' },
    h('div', { class: 'term-main' }, term, status),
    h('aside', { class: 'term-side card' },
      h('div', { class: 'row' }, button('Upload', async () => upload(await pickFiles('*/*', true)), { icon: 'Upload', small: true, variant: 'primary', title: 'Upload files into the current folder' }),
        button('', () => refreshFiles(), { icon: 'RefreshCw', small: true, variant: 'ghost', title: 'Refresh' })),
      pathEl, files,
      h('p', { class: 'muted small' }, 'Files live in this tab\'s memory and disappear when you close it. Click a folder to cd into it, a file name to paste it into the command line.'))));
  async function hello() {
    const r = await call('hello');
    write(r.welcome, 'term-note');
    setPrompt(r.prompt, r.cwd);
    refreshFiles();
    inp.focus();
  }
  hello();
  return () => { live = false; worker.terminate(); };
};
