// Python Scratchpad — PC only. CPython 3.14.8 compiled by us to WebAssembly (wasm/python) with its standard library,
// run in a worker (src/workers/python.worker.ts): each Run is a fresh interpreter on a fresh in-memory filesystem.
// Input for input(), files to read, files the program writes come back as downloads. Stop terminates the worker.
// The output pane (src/lib/termtext.ts) shows what a terminal would: \r progress bars, colours, cleared screens.
import { h, card, field, textarea, clear, note, copy, button, filePicker, downloadBlob, fmtBytes, toast, type Mount } from '../../ui';
import { runPython, stopPython } from '../../lib/python-client';
import { termView } from '../../lib/termtext';
import { hint } from '../../lib/python-hints';
import { readTextFile } from '../../lib/textfile';

export const SAMPLES: Record<string, string> = {
  Hello: `name = input("What is your name? ")
print(f"Namaste, {name}!")
for i in range(1, 4):
    print(i, "×", 7, "=", i * 7)
`,
  'Data & stats': `import csv, io, statistics
data = """city,rain_mm
Mumbai,2422
Pune,722
Chennai,1400
Delhi,797
Kolkata,1582"""
rows = list(csv.DictReader(io.StringIO(data)))
rain = [int(r["rain_mm"]) for r in rows]
print("mean  ", statistics.mean(rain))
print("median", statistics.median(rain))
print("stdev ", round(statistics.stdev(rain), 1))
for r in sorted(rows, key=lambda r: -int(r["rain_mm"])):
    print(f'{r["city"]:<8} {"█" * (int(r["rain_mm"]) // 100)}')
`,
  'Dates & time zones': `from datetime import datetime, date
from zoneinfo import ZoneInfo
meeting = datetime(2026, 12, 1, 18, 30, tzinfo=ZoneInfo("Asia/Kolkata"))
for tz in ["Asia/Kolkata", "Europe/London", "America/New_York", "Asia/Tokyo"]:
    print(f"{tz:<18}", meeting.astimezone(ZoneInfo(tz)).strftime("%a %d %b %H:%M"))
print("Days to Diwali 2027:", (date(2027, 10, 29) - date(2026, 11, 16)).days)
`,
  'Text': `from collections import Counter
import re
text = """It was the best of times, it was the worst of times, it was the age of
wisdom, it was the age of foolishness, it was the epoch of belief"""
words = re.findall(r"[a-z']+", text.lower())
for word, n in Counter(words).most_common(5):
    print(f"{word:<8}{n}")
print(len(words), "words,", len(set(words)), "different")
`,
  'Write a file': `import json
people = [{"name": "Asha", "age": 31}, {"name": "Ravi", "age": 27}]
with open("people.json", "w") as f:
    json.dump(people, f, indent=2)
with open("report.txt", "w") as f:
    for p in people:
        f.write(f"{p['name']} is {p['age']}\\n")
print("Wrote people.json and report.txt — download them below.")
`,
  'Classes': `from dataclasses import dataclass, field
@dataclass(order=True)
class Item:
    price: float
    name: str = field(compare=False)
cart = [Item(120.0, "Tea"), Item(250.0, "Mug"), Item(90.0, "Jam")]
for it in sorted(cart):
    print(f"{it.name:<5} ₹{it.price:8.2f}")
print("Total ₹", sum(i.price for i in cart))
`,
  'Speed test': `import time
t = time.perf_counter()
primes = [n for n in range(2, 200_000) if all(n % p for p in range(2, int(n ** 0.5) + 1))]
print(len(primes), "primes below 200 000 in", round(time.perf_counter() - t, 2), "s")
`,
};
import './python.css';

export const mount: Mount = (root) => {
  let files: Array<{ name: string; bytes: Uint8Array }> = [], running = false, firstRun = true, errTail = '';
  const code = textarea({ rows: 20, mono: true, value: SAMPLES.Hello });
  code.setAttribute('aria-label', 'Python code'); code.spellcheck = false;
  // typed through the browser's own editing command, so that Ctrl+Z still undoes it
  const insert = (t: string) => { if (!document.execCommand('insertText', false, t)) code.setRangeText(t, code.selectionStart, code.selectionEnd, 'end'); };
  code.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); insert('    '); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      // keep the indentation of the line being left; one level more after a line that ends with ":"
      const s = code.selectionStart, v = code.value, from = v.lastIndexOf('\n', s - 1) + 1, before = v.slice(from, s);
      const indent = /^[ \t]*/.exec(before)![0] + (/:\s*(#.*)?$/.test(before) ? '    ' : '');
      if (!indent) return;
      e.preventDefault(); insert('\n' + indent);
    }
  });
  const stdin = textarea({ rows: 3, mono: true, value: 'Asha', placeholder: 'One line for every input() — or any text the program reads from sys.stdin' });
  stdin.setAttribute('aria-label', 'Input'); stdin.spellcheck = false;
  const out = h('pre', { class: 'py-out', role: 'log', 'aria-label': 'Output', tabindex: '0' }), status = h('div', { 'aria-live': 'polite' }), produced = h('div'), fileList = h('div', { class: 'chips' });
  const view = termView(out);
  const runBtn = button('Run', () => run(), { icon: 'Play', variant: 'primary' }), stopBtn = button('Stop', () => stopPython(), { icon: 'Square' });
  stopBtn.hidden = true;
  const showFiles = () => { clear(fileList); for (const f of files) fileList.append(button(`${f.name} ✕`, () => { files = files.filter((x) => x !== f); showFiles(); }, { small: true, title: `Remove ${f.name}` })); };
  async function run() {
    if (running) return;
    running = true; runBtn.disabled = true; stopBtn.hidden = false; view.clear(); clear(produced); errTail = '';
    clear(status).append(note(firstRun ? 'Starting Python (the first run loads about 13.5 MB)…' : 'Running…', 'info'));
    try {
      const r = await runPython(code.value, { stdin: stdin.value, files, io: (text, stream) => {
        view.write(text, stream);
        if (stream === 'e') errTail = (errTail + text).slice(-4000);
      } });
      firstRun = false; view.flush();
      const secs = (r.ms / 1000).toFixed(2), tip = r.code === 0 ? '' : hint(errTail);
      clear(status).append(note([r.note, r.code === 0 ? `Finished in ${secs} s.` : `Exited with status ${r.code} after ${secs} s.`].filter(Boolean).join(' '), r.code === 0 ? 'ok' : 'warn'));
      if (tip) status.append(note(tip, 'info'));
      if (r.files.length) {
        const save = (f: { name: string; bytes: Uint8Array }) => downloadBlob(new Blob([f.bytes as Uint8Array<ArrayBuffer>]), f.name.split('/').pop()!);
        const shown = r.files.slice(0, 40);
        produced.append(h('div', { class: 'row wrap' }, h('strong', null, r.files.length === 1 ? 'File written:' : `${r.files.length} files written:`),
          shown.map((f) => button(`${f.name} (${fmtBytes(f.bytes.length)})`, () => save(f), { small: true, icon: 'Download' })),
          r.files.length > shown.length ? h('span', { class: 'muted' }, `and ${r.files.length - shown.length} more`) : null,
          r.files.length > 1 ? button('All as .zip', async () => {
            const { zipFiles } = await import('../../lib/zip');
            downloadBlob(await zipFiles(r.files.map((f) => ({ name: f.name, blob: new Blob([f.bytes as Uint8Array<ArrayBuffer>]) })), 6), 'python-files.zip');
          }, { small: true, icon: 'FolderArchive' }) : null));
      }
    } catch (e: any) {
      view.flush();
      clear(status).append(note(e?.message === 'Stopped' ? 'Stopped.' : String(e?.message || e), 'warn'));
    } finally { running = false; runBtn.disabled = false; stopBtn.hidden = true; }
  }
  const samples = h('div', { class: 'chips' }, Object.entries(SAMPLES).map(([k, v]) => button(k, () => { code.value = v; if (k === 'Hello' && !stdin.value) stdin.value = 'Asha'; code.focus(); }, { small: true })));
  root.append(h('div', { class: 'grid2' },
    card(null, samples, field('Python code (Ctrl+Enter runs)', code),
      h('div', { class: 'row' }, runBtn, stopBtn,
        filePicker({ accept: '.py,.pyw,.txt,text/x-python,text/plain', label: 'Open a .py file', onFiles: async ([f]) => { code.value = (await readTextFile(f, 'a Python program is plain text')).replace(/\r\n?/g, '\n'); } }),
        button('Download .py', () => downloadBlob(new Blob([code.value], { type: 'text/x-python' }), 'main.py'), { small: true, icon: 'Download' }))),
    h('div', null,
      card('Output', status, out, produced, h('div', { class: 'row' },
        button('Copy output', () => copy(view.text()), { small: true, icon: 'Copy' }),
        button('Save output', () => { const t = view.text(); if (t) downloadBlob(new Blob([t], { type: 'text/plain' }), 'output.txt'); else toast('There is no output yet', 'info'); }, { small: true, icon: 'Download' }),
        button('Clear', () => { view.clear(); clear(status); clear(produced); }, { small: true }))),
      card('Input', field('Standard input', stdin),
        field('Files for the program', h('div', null, filePicker({ multiple: true, label: 'Add files (read them with open("name"))', onFiles: async (fs) => {
          for (const f of fs) {
            if (f.size > 50 * 1024 * 1024) { toast(`${f.name} is over 50 MB`, 'err'); continue; }
            if (f.name === 'main.py') { toast('main.py is the name of the program itself — rename that file first', 'err'); continue; }
            files = files.filter((x) => x.name !== f.name).concat({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
          }
          showFiles();
        } }), fileList))))),
  note('CPython 3.14 compiled from the official source to WebAssembly, with the standard library (math, statistics, decimal, fractions, datetime + zoneinfo, json, csv, re, collections, dataclasses, asyncio, zlib / gzip / zipfile, hashlib, xml, unittest, doctest…). Each run starts a fresh interpreter; clocks show your local time. Not here: pip packages, threads, other programs, the network, and the modules sqlite3, ssl, bz2, lzma, ctypes, tkinter and turtle. Your code and files never leave this browser.', 'info'));
  return () => { if (running) stopPython(); };
};
