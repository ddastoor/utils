// The Settings' file (to-do #39; owner, 28 Nov 2026: "whenever something is changed in the overall consolidated settings, a new settings
// file should be immediately downloaded to the local device. So something like superutils_settings_ mmdd_ hour minute"). Fetched the first
// time a file is due. The name: superutils_settings_YYYYMMDD_HHMM.json (the year added so the files sort across years — told to the
// owner). Where it goes: on a PC whose browser can write into a folder (File System Access: Chrome, Edge) the folder chosen once on the
// Settings page — its handle kept in this browser's IndexedDB (a handle cannot be put in localStorage); a second change in the same minute
// replaces that minute's file — else a download. Reading a file back: `readSettingsText`.
import type { SettingsFile } from '../settings';

/** superutils_settings_20261128_1042.json */
export function settingsFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `superutils_settings_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
}
export const settingsText = (snap: SettingsFile) => `${JSON.stringify(snap, null, 2)}\n`;

// ------------------------------------------------------------------ the folder (IndexedDB holds its handle)
type Dir = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
};
const DB = 'superutils-settings', STORE = 'handles', KEY = 'folder';
/** can this browser write into a folder (File System Access)? */
export const folderSupported = () => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error('the browser’s storage cannot be opened'));
  });
}
async function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  try {
    return await new Promise<T>((res, rej) => {
      const r = f(d.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => res(r.result as T);
      r.onerror = () => rej(r.error ?? new Error('the browser’s storage refused'));
    });
  } finally { d.close(); }
}
/** A private (Incognito) window? Chromium closes itself — the whole browser — when a page reads a folder's handle back from
 *  IndexedDB in one (seen in Chromium 153 with real folders, 28 Nov 2026: docs/BUGHUNT.md "Settings"); a normal profile is fine, and
 *  a page cannot ask which it is in. A private window's storage quota is a share of the memory, a normal profile's a share of the
 *  disk: below twice the limit of the script heap the window is taken as private — the folder is then kept for this visit only,
 *  never stored and never read back. Unsure (no estimate): the same, the safe side. */
let priv: Promise<boolean> | null = null;
export function privateWindow(): Promise<boolean> {
  return priv ??= (async () => {
    try {
      const { quota } = await navigator.storage.estimate();
      const heap = (performance as unknown as { memory?: { jsHeapSizeLimit?: number } }).memory?.jsHeapSizeLimit || 2 ** 30;
      return !quota || quota < 2 * heap;
    } catch { return true; }
  })();
}
/** the folder of this visit: read from IndexedDB once (never again while the page is open), or the one chosen now */
let mem: Dir | null = null, known = false;
// another open tab of the site chose a folder or let it go: read it again at the next file
const chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel('superutils-settings-folder') : null;
if (chan) chan.onmessage = () => { mem = null; known = false; };
/** the folder chosen, or null */
export async function folder(): Promise<Dir | null> {
  if (!folderSupported()) return null;
  if (known) return mem;
  if (!(await privateWindow())) {
    try { mem = (await idb<Dir | undefined>('readonly', (s) => s.get(KEY))) ?? null; } catch { mem = null; }
  }
  known = true;
  return mem;
}
/** the folder chosen, whether the browser lets the page write there now ('prompt': after a restart, a click allows it again), and
 *  whether it is kept for this visit only (a private window) */
export async function folderState(): Promise<{ name: string; permission: PermissionState; visitOnly: boolean } | null> {
  const d = await folder();
  if (!d) return null;
  let permission: PermissionState = 'prompt';
  try { permission = await d.queryPermission({ mode: 'readwrite' }); } catch { /* older browsers: ask */ }
  return { name: d.name, permission, visitOnly: await privateWindow() };
}
/** choose the folder (in a click): returns its name */
export async function chooseFolder(): Promise<string> {
  const pick = (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> }).showDirectoryPicker;
  const d = await pick.call(window, { id: 'superutils-settings', mode: 'readwrite' });
  if (!(await privateWindow())) await idb('readwrite', (s) => s.put(d, KEY));
  mem = d; known = true; chan?.postMessage('folder');
  return d.name;
}
/** let the page write to the folder again (in a click, after the browser was restarted) */
export async function allowFolder(): Promise<boolean> {
  const d = await folder();
  if (!d) return false;
  try { return (await d.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch { return false; }
}
export async function forgetFolder(): Promise<void> {
  mem = null; known = true;
  try { await idb('readwrite', (s) => s.delete(KEY)); } catch { /* nothing kept */ }
  chan?.postMessage('folder');
}

// ------------------------------------------------------------------ writing
/** a download of `text` under `name` (the shared way: an anchor with download, its address let go after) */
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
/** the settings file written: into the folder where it may (a second change in the same minute replaces that minute's file), else
 *  downloaded. Returns its name and where it went. */
export async function writeSettingsFile(snap: SettingsFile, now = new Date()): Promise<{ name: string; where: 'folder' | 'download' }> {
  const name = settingsFileName(now), text = settingsText(snap);
  const d = await folder();
  if (d) {
    let ok = false;
    try { ok = (await d.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch { ok = false; }
    if (ok) {
      const fh = await d.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(text); await w.close();
      return { name, where: 'folder' };
    }
  }
  download(text, name);
  return { name, where: 'download' };
}
/** a settings file's text read: the object, or the reason it is no settings file */
export function readSettingsText(text: string): unknown {
  let v: unknown;
  try { v = JSON.parse(text.replace(/^﻿/, '')); } catch { throw new Error('This file is not a SuperUtils settings file (it is not JSON).'); }
  return v;
}
