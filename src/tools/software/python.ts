// Python Scratchpad — PC only. CPython 3.14.8 compiled by us to WebAssembly (wasm/python) with its standard library,
// run in a worker (src/workers/python.worker.ts): each Run is a fresh interpreter on a fresh in-memory filesystem.
// Input for input(), files to read, files the program writes come back as downloads. Stop terminates the worker.
import { h, card, field, textarea, clear, note, copy, button, filePicker, downloadBlob, toast, type Mount } from '../../ui';
import { runPython, stopPython } from '../../lib/python-client';

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

export const mount: Mount = (root) => {
  let files: Array<{ name: string; bytes: Uint8Array }> = [], running = false, firstRun = true;
  const code = textarea({ rows: 20, mono: true, value: SAMPLES.Hello });
  code.setAttribute('aria-label', 'Python code');
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const s = code.selectionStart, t = code.selectionEnd; code.setRangeText('    ', s, t, 'end'); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
  });
  const stdin = textarea({ rows: 3, mono: true, value: 'Asha', placeholder: 'Lines read by input() / sys.stdin' });
  stdin.setAttribute('aria-label', 'Input');
  const out = h('pre', { class: 'py-out', 'aria-live': 'polite', 'aria-label': 'Output' }), status = h('div'), produced = h('div'), fileList = h('div', { class: 'chips' });
  const runBtn = button('Run', () => run(), { icon: 'Play', variant: 'primary' }), stopBtn = button('Stop', () => stopPython(), { icon: 'Square' });
  stopBtn.hidden = true;
  const showFiles = () => { clear(fileList); for (const f of files) fileList.append(button(`${f.name} ✕`, () => { files = files.filter((x) => x !== f); showFiles(); }, { small: true, title: 'Remove' })); };
  const add = (text: string, cls: string) => { const last = out.lastElementChild as HTMLElement | null; if (last && last.className === cls) last.textContent += text; else out.append(h('span', { class: cls }, text)); out.scrollTop = out.scrollHeight; };
  async function run() {
    if (running) return;
    running = true; runBtn.disabled = true; stopBtn.hidden = false; clear(out); clear(produced);
    clear(status).append(note(firstRun ? 'Starting Python (first run loads about 12 MB)…' : 'Running…', 'info'));
    try {
      const r = await runPython(code.value, { stdin: stdin.value, files, out: (s) => add(s, 'py-stdout'), err: (s) => add(s, 'py-stderr') });
      firstRun = false;
      const secs = (r.ms / 1000).toFixed(2);
      clear(status).append(note([r.note, r.code === 0 ? `Finished in ${secs} s.` : `Exited with status ${r.code} after ${secs} s.`].filter(Boolean).join(' '), r.code === 0 ? 'ok' : 'warn'));
      if (r.files.length) produced.append(h('div', { class: 'row wrap' }, h('strong', null, 'Files written:'), r.files.map((f) => button(`${f.name} (${f.bytes.length} B)`, () => downloadBlob(new Blob([f.bytes as Uint8Array<ArrayBuffer>]), f.name.split('/').pop()!), { small: true, icon: 'Download' }))));
    } catch (e: any) {
      clear(status).append(note(e?.message === 'Stopped' ? 'Stopped.' : String(e?.message || e), 'warn'));
    } finally { running = false; runBtn.disabled = false; stopBtn.hidden = true; }
  }
  const samples = h('div', { class: 'chips' }, Object.entries(SAMPLES).map(([k, v]) => button(k, () => { code.value = v; }, { small: true })));
  root.append(h('div', { class: 'grid2' },
    card(null, samples, field('Python code (Ctrl+Enter runs)', code),
      h('div', { class: 'row' }, runBtn, stopBtn,
        filePicker({ accept: '.py,.txt', label: 'Open a .py file', onFiles: async ([f]) => { code.value = await f.text(); } }),
        button('Download .py', () => downloadBlob(new Blob([code.value], { type: 'text/x-python' }), 'main.py'), { small: true, icon: 'Download' }))),
    h('div', null,
      card('Output', status, out, produced, h('div', { class: 'row' }, button('Copy output', () => copy(out.textContent || ''), { small: true, icon: 'Copy' }), button('Clear', () => { clear(out); clear(status); clear(produced); }, { small: true }))),
      card('Input', field('Standard input', stdin),
        field('Files for the program', h('div', null, filePicker({ multiple: true, label: 'Add files (read them with open("name"))', onFiles: async (fs) => {
          for (const f of fs) { if (f.size > 50 * 1024 * 1024) { toast(`${f.name} is over 50 MB`, 'err'); continue; } files = files.filter((x) => x.name !== f.name).concat({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); }
          showFiles();
        } }), fileList))))),
  note('CPython 3.14 compiled from the official source to WebAssembly, with the standard library (math, statistics, decimal, fractions, datetime + zoneinfo, json, csv, re, collections, dataclasses, zlib/gzip/zipfile, hashlib, xml…). Each run starts a fresh interpreter. No pip packages, threads, sockets or internet access. Your code and files never leave this browser.', 'info'));
  return () => { if (running) stopPython(); };
};
