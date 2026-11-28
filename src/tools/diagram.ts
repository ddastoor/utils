// Diagram Editor (potentials #54; owner, 26 Nov 2026: "a Draw.io clone app - pc only with standard diagram shapes, uml, flowcharts
// etc"; 21 Nov 2026: for this tab a JavaScript editor is fine). The editor is draw.io 32.7.7 itself (Apache-2.0), served from this
// site (scripts/fetch-drawio.mjs → public/drawio/) in a frame of its own with a strict Content-Security-Policy, and driven by its embed
// protocol (postMessage, JSON). Stateless like the whole site: a diagram is opened from the device, edited, and saved to the device —
// .drawio, an editable PNG or SVG (the diagram inside the picture), or a PDF through the browser's print window. While the page is
// open the diagram stays here (visiting another tab keeps it); a change not yet saved is warned about before the page is closed.
import { h, button, ic, note, toast, errMsg, downloadBlob, pickFiles, type Mount } from '../ui';
import { BLANK, kindOf, xmlDiagram, svgDiagram, pngDiagram, diagramName, safeName } from '../lib/diagramfile';
import './diagram.css';

/** the frame's address: embed mode, JSON messages; English; no service, storage or plugin of draw.io's own (stealth, lockdown,
 *  local); no Exit button, Save without exiting; the libraries' "More Shapes"; "Unsaved changes" in its status line; the system's
 *  light or dark */
export const FRAME = 'drawio/index.html?embed=1&proto=json&spin=1&lang=en&stealth=1&lockdown=1&local=1&pwa=0&noExitBtn=1&saveAndExit=0&libraries=1&modified=unsavedChanges&dark=auto';
const ACCEPT = '.drawio,.dio,.xml,.png,.svg,.vsdx,.vsdm,.vssx,.vsd,.gliffy,.mmd,.mermaid,.puml,.plantuml,.txt';
const INIT_WAIT = 60_000; // ms for the editor to say it is ready once its page has loaded

/** kept while the page is open (nothing is stored): the diagram as the editor last sent it, its name, the diagram as it was when it
 *  was opened, made or saved (a change from it is not saved), and the file it was last saved as */
const kept: { xml: string; name: string; base: string; savedAs: string | null } = { xml: BLANK, name: 'Diagram', base: BLANK, savedAs: null };
const dirty = () => kept.xml !== kept.base;
/** the page asks before it is closed while the diagram has changes not saved (after the tab is left too: the diagram is still here) */
const onUnload = (e: BeforeUnloadEvent) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } };
const watchUnload = () => { window.removeEventListener('beforeunload', onUnload); if (dirty()) window.addEventListener('beforeunload', onUnload); };

type Msg = { event?: string; xml?: string; data?: string; format?: string; error?: string; message?: any; name?: string; blank?: boolean; exit?: boolean };
interface Editor { importVisio(f: Blob, done: (xml: string) => void, err: (e: any) => void, name?: string): void; importGliffy(text: string, done: (xml: string) => void, err: (e: any) => void, name?: string): void }

export const mount: Mount = (root) => {
  let gone = false, ready = false, waitTimer = 0, loading: { fresh: boolean; name: string } | null = null;
  const exports = new Map<string, { done: (m: Msg) => void; timer: number }>(); // an export asked of the editor, by format

  // ---------------------------------------------------------------- the frame
  const frame = h('iframe', { class: 'dg-frame', title: 'Diagram editor', src: FRAME, allow: 'clipboard-read; clipboard-write; fullscreen' }) as HTMLIFrameElement;
  const post = (msg: Record<string, unknown>) => frame.contentWindow?.postMessage(JSON.stringify(msg), '*');
  const editor = () => (frame.contentWindow as any)?.superutilsEditor as Editor | undefined;
  const status = h('span', { class: 'dg-status', role: 'status', 'aria-live': 'polite' });
  const problem = h('div', { class: 'dg-problem', hidden: true });
  const say = () => {
    if (!ready) { status.textContent = 'Loading the editor…'; return; }
    status.replaceChildren(dirty() ? h('span', { class: 'dg-dirty' }, ic('CircleDot'), 'Unsaved changes') : kept.savedAs ? h('span', null, ic('CircleCheck'), `Saved as ${kept.savedAs}`) : '');
    watchUnload();
  };
  const fail = (why: string) => {
    ready = false; clearTimeout(waitTimer); say(); status.textContent = '';
    problem.hidden = false;
    problem.replaceChildren(note(h('span', null, why, ' ', button('Try again', () => { problem.hidden = true; start(); }, { small: true, icon: 'RotateCw' })), 'err'));
    setButtons();
  };
  const start = () => {
    ready = false; setButtons(); say();
    frame.src = `${FRAME}&t=${Date.now()}`; // a new page every time (a frame whose page failed keeps showing the failure otherwise)
  };
  frame.addEventListener('load', () => {
    if (gone) return;
    let ok = false;
    // the page has loaded with its scripts (draw.io chains them so that its load waits for every one): the editor's code is there
    try { const w = frame.contentWindow as any; ok = /\/drawio\/index\.html$/.test(w.location.pathname) && typeof w.EditorUi === 'function'; } catch { ok = false; }
    if (!ok) return fail('The editor could not be fetched from this site — is the connection there?');
    clearTimeout(waitTimer);
    waitTimer = window.setTimeout(() => { if (!ready) fail('The editor did not start.'); }, INIT_WAIT);
  });

  // what the editor says
  const onMessage = (e: MessageEvent) => {
    if (gone || e.source !== frame.contentWindow || typeof e.data !== 'string') return;
    let m: Msg;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.event === 'init') {
      clearTimeout(waitTimer); problem.hidden = true;
      // the diagram kept while the page is open (empty at first): what it is now counts as its state unless it has changes
      load(kept.xml, kept.name, !dirty());
    } else if (m.event === 'load') {
      ready = true;
      const l = loading; loading = null;
      if (m.error) toast(`The diagram could not be opened: ${m.error}`, 'err', 7000);
      else if (typeof m.xml === 'string') {
        kept.xml = m.xml;
        if (l) { kept.name = l.name; nameBox.value = l.name; if (l.fresh) kept.base = m.xml; }
      }
      setButtons(); say();
    } else if (m.event === 'autosave') {
      if (typeof m.xml === 'string') kept.xml = m.xml;
      say();
    } else if (m.event === 'save') {
      if (typeof m.xml === 'string') save(m.xml);
    } else if (m.event === 'export') {
      const fmt = m.message?.format as string | undefined, wait = fmt ? exports.get(fmt) : undefined;
      if (fmt && wait) { exports.delete(fmt); clearTimeout(wait.timer); wait.done(m); }
    } else if (m.event === 'template') {
      if (typeof m.xml === 'string') open(m.xml, m.name?.trim() ? diagramName(m.name) : 'Diagram');
    }
  };
  window.addEventListener('message', onMessage);

  // ---------------------------------------------------------------- files
  const fileName = (ext = '.drawio') => `${safeName(kept.name)}${ext}`;
  const save = (xml: string) => {
    const name = fileName();
    downloadBlob(new Blob([xml], { type: 'application/vnd.jgraph.mxfile' }), name);
    kept.xml = xml; kept.base = xml; kept.savedAs = name;
    post({ action: 'status', message: '', modified: false });
    say();
  };
  /** a diagram into the editor (`fresh`: what it is now counts as its state — just opened or made) */
  function load(xml: string | { descriptor: { format: string; data: string } }, name: string, fresh: boolean) {
    loading = { fresh, name };
    if (fresh) kept.savedAs = null;
    post({ action: 'load', autosave: 1, ...(typeof xml === 'string' ? { xml } : xml) });
  }
  const open = (xml: string | { descriptor: { format: string; data: string } }, name: string) => load(xml, name, true);
  const replaceOk = () => !dirty() || confirm(`“${kept.name}” has changes that are not saved. Open another diagram anyway?`);
  const openFile = async (f: File) => {
    if (!ready) return toast('The editor is still loading.', 'info');
    if (!replaceOk()) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const name = diagramName(f.name), kind = kindOf(f.name, bytes.subarray(0, 4096));
    const text = () => new TextDecoder().decode(bytes);
    const fromEditor = (run: (ed: Editor, done: (xml: string) => void, err: (e: any) => void) => void) => new Promise<void>((res, rej) => {
      const ed = editor();
      if (!ed) return rej(new Error('The editor is not ready yet.'));
      run(ed, (xml) => { open(xml, name); res(); }, (e) => rej(new Error(e?.message || 'The file could not be read.')));
    });
    if (kind === 'xml') {
      const d = xmlDiagram(text());
      if (!d) throw new Error(`${f.name} holds no diagram.`);
      if ('library' in d) throw new Error(`${f.name} is a shape library: in the editor, File → Open Library from → Device.`);
      return open(d.xml, name);
    }
    if (kind === 'png') {
      const xml = await pngDiagram(bytes);
      if (!xml) throw new Error(`${f.name} is a picture without a diagram in it. To put the picture into a diagram, drop it onto the editor.`);
      return open(xml, name);
    }
    if (kind === 'svg') {
      const xml = svgDiagram(text());
      if (!xml) throw new Error(`${f.name} is a drawing without a diagram in it (not saved as an editable SVG). To put it into a diagram, drop it onto the editor.`);
      return open(xml, name);
    }
    if (kind === 'visio') return fromEditor((ed, done, err) => ed.importVisio(f, done, err, f.name));
    if (kind === 'gliffy') return fromEditor((ed, done, err) => ed.importGliffy(text(), done, err, f.name));
    if (kind === 'mermaid' || kind === 'plantuml') return open({ descriptor: { format: kind, data: text() } }, name);
    throw new Error(`${f.name} is not a diagram this editor opens (.drawio, .xml, an editable PNG or SVG, Visio, Gliffy, Mermaid, PlantUML).`);
  };
  const exportAs = (format: 'xmlpng' | 'xmlsvg', ext: string, type: string) => new Promise<void>((res, rej) => {
    if (!ready) return rej(new Error('The editor is still loading.'));
    const timer = window.setTimeout(() => { exports.delete(format); rej(new Error('The editor did not answer.')); }, 60_000);
    exports.set(format, { timer, done: (m) => {
      const data = m.data || '';
      const comma = data.indexOf(',');
      if (!data.startsWith('data:') || comma < 0) return rej(new Error(m.error || 'The editor sent no picture.'));
      const b64 = /;base64$/.test(data.slice(0, comma)), body = data.slice(comma + 1);
      const bytes = b64 ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body));
      downloadBlob(new Blob([bytes], { type }), fileName(ext));
      res();
    } });
    post({ action: 'export', format, spinKey: 'saving', ...(format === 'xmlpng' ? { scale: 2, border: 10 } : { border: 10 }) });
  });

  // ---------------------------------------------------------------- the bar above the editor
  const nameBox = h('input', { class: 'input dg-name', type: 'text', value: kept.name, maxlength: 120, spellcheck: 'false', 'aria-label': 'Diagram name (the file is saved under it)' }) as HTMLInputElement;
  nameBox.addEventListener('input', () => { kept.name = nameBox.value.trim() || 'Diagram'; say(); });
  const openBtn = button('Open…', async () => { const [f] = await pickFiles(ACCEPT); if (f) await openFile(f); }, { icon: 'FolderOpen', title: 'Open a diagram from this device: .drawio, .xml, an editable PNG or SVG, Visio (.vsdx, .vsd), Gliffy, Mermaid or PlantUML' });
  const newBtn = button('New…', () => { if (!ready) return; if (!dirty() || confirm(`“${kept.name}” has changes that are not saved. Start a new diagram anyway?`)) post({ action: 'template', callback: 1 }); }, { icon: 'FilePlus', title: 'A new diagram: blank, or from a template' });
  const saveBtn = button('Save', () => { if (ready) post({ action: 'invokeAction', actionName: 'save' }); }, { variant: 'primary', icon: 'Download', title: 'Save the diagram to this device as a .drawio file (Ctrl+S in the editor does the same)' });
  const pngBtn = button('PNG', () => exportAs('xmlpng', '.drawio.png', 'image/png'), { icon: 'Image', title: 'Save as a PNG picture with the diagram inside it: open it here again to edit' });
  const svgBtn = button('SVG', () => exportAs('xmlsvg', '.drawio.svg', 'image/svg+xml'), { icon: 'PenTool', title: 'Save as an SVG drawing with the diagram inside it: open it here again to edit' });
  const pdfBtn = button('PDF…', () => { if (ready) post({ action: 'invokeAction', actionName: 'exportPdf' }); }, { icon: 'FileText', title: 'Save as a PDF: the browser’s print window opens — choose “Save as PDF”' });
  const all = [openBtn, newBtn, saveBtn, pngBtn, svgBtn, pdfBtn];
  function setButtons() { for (const b of all) b.disabled = !ready; nameBox.disabled = !ready; }

  // files dropped on the bar open (dropped on the editor, draw.io puts them into the diagram)
  const bar = h('div', { class: 'dg-bar' },
    h('div', { class: 'dg-group' }, openBtn, newBtn),
    h('label', { class: 'dg-namefield' }, h('span', { class: 'dg-namelabel' }, 'Name'), nameBox, h('span', { class: 'dg-ext' }, '.drawio')),
    h('div', { class: 'dg-group' }, saveBtn, pngBtn, svgBtn, pdfBtn),
    status);
  bar.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); bar.classList.add('over'); } });
  bar.addEventListener('dragleave', () => bar.classList.remove('over'));
  bar.addEventListener('drop', (e) => { e.preventDefault(); bar.classList.remove('over'); const f = e.dataTransfer?.files[0]; if (f) openFile(f).catch((err) => toast(errMsg(err), 'err', 7000)); });

  const about = h('details', { class: 'dg-about' },
    h('summary', null, 'About the editor'),
    h('ul', null,
      h('li', null, 'Diagrams stay on this device: open one, edit it, Save. Nothing is kept in the browser — while this page is open the diagram stays here when you visit another tab; close the page and it is gone, so save first (the page asks).'),
      h('li', null, h('strong', null, 'PNG'), ' and ', h('strong', null, 'SVG'), ' are saved with the diagram inside the picture: open the picture here again to go on editing it. More formats and options (JPEG, WebP, HTML, transparent background, size): the editor’s File → Export as.'),
      h('li', null, h('strong', null, 'PDF'), ': the browser’s print window opens — choose “Save as PDF” as the printer.'),
      h('li', null, 'Opens draw.io files (.drawio, .xml), editable PNG and SVG pictures, Visio (.vsdx, .vsd), Gliffy, and Mermaid or PlantUML text (made into shapes you can edit). Pictures dropped onto the editor are put into the diagram.'),
      h('li', null, 'Nothing is fetched from other sites: a picture that a diagram links from the web, or a web font, does not show.'),
      h('li', null, 'The editor is draw.io 32.7.7 by draw.io Ltd and draw.io AG (Apache License 2.0; the templates CC BY 4.0), served from this site and changed only so that it keeps nothing and fetches nothing — ',
        h('a', { href: 'drawio/README.txt', target: '_blank', rel: 'noopener' }, 'its licences and what was changed'), '. This site is not affiliated with draw.io.')));

  root.append(h('div', { class: 'dg' }, bar, problem, h('div', { class: 'dg-wrap' }, frame), about));
  setButtons(); say();

  return () => {
    gone = true; clearTimeout(waitTimer);
    window.removeEventListener('message', onMessage);
    for (const w of exports.values()) clearTimeout(w.timer); // an export not answered is dropped without a word (the tab is gone)
    exports.clear();
    frame.src = 'about:blank'; frame.remove();
    watchUnload(); // the diagram is still here: the page goes on asking before it is closed while it has changes
  };
};
