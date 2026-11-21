// Create Zip: names inside the archive and the password rules. String glue (§3a); the archive is 7-Zip's (7z-wasm).

/** Paths for the archive: "/" separators, no leading "/" or "./", no ".." parts; the same path twice gets " (2)" before
 *  its extension (two files of one name chosen from different folders). */
export function archivePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.map((p0) => {
    let p = p0.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..').join('/') || 'file';
    if (seen.has(p.toLowerCase())) {
      const m = /^(.*?)(\.[^./]{1,10})?$/.exec(p)!;
      for (let k = 2; ; k++) { const q = `${m[1]} (${k})${m[2] ?? ''}`; if (!seen.has(q.toLowerCase())) { p = q; break; } }
    }
    seen.add(p.toLowerCase());
    return p;
  });
}

/** Why a password cannot be used for this format, or null. 7-Zip (and WinRAR, Windows) read a zip password as
 *  plain ASCII only; a 7z password may hold any letters (it is stored as UTF-16). */
export function passwordProblem(pw: string, again: string, format: 'zip' | '7z'): string | null {
  if (pw.length < 4) return 'Choose a password of at least 4 characters.';
  if (pw !== again) return 'The passwords do not match — the archive could not be opened.';
  if (format === 'zip' && /[^\x20-\x7e]/.test(pw)) return 'A zip password can hold only English letters, digits, spaces and the symbols on a keyboard — 7-Zip, WinRAR and other tools cannot take any other letter for a zip. Use such a password, or choose the 7z format (any letters).';
  return null;
}

/** The archive name with the extension of the format ("my files" → "my files.zip"; "a.zip" as 7z → "a.7z"). */
export function archiveName(name: string, format: 'zip' | '7z'): string {
  const base = (name.trim() || 'archive').replace(/[\\/:*?"<>|]+/g, '-').replace(/\.(zip|7z)$/i, '');
  return `${base}.${format}`;
}

const DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)$/i;
/** The parts of a path from an archive, safe to create in a folder: no empty, "." or ".." parts; < > : " | ? * and
 *  control characters replaced. `windows` (the browser runs on Windows — to-do #13): also no device names, which Windows
 *  cannot create whatever the extension (aux.c → aux_.c, as in the Linux kernel's sources), and no dot or space at the end
 *  of a name (Windows drops them: "notes." would become "notes"). */
export const safeParts = (p: string, windows = false) => p.replace(/\\/g, '/').split('/').filter((x) => x && x !== '.' && x !== '..').map((x) => {
  let s = x.replace(/[<>:"|?*\u0000-\u001f]/g, '_');
  if (windows) {
    s = s.replace(/[. ]+$/, (m) => '_'.repeat(m.length));
    const dot = s.indexOf('.'), stem = dot < 0 ? s : s.slice(0, dot);
    if (DEVICE.test(stem)) s = `${stem}_${s.slice(stem.length)}`;
  }
  return s;
});

/** A file name not yet taken in a folder. Windows and macOS do not tell README from readme — the second file written would
 *  overwrite the first — so with `foldCase` a name taken in any case gets " (2)", " (3)" … before its extension. `taken`:
 *  the names used so far in that folder (kept up to date here). */
export function freeName(name: string, taken: Set<string>, foldCase: boolean): string {
  const key = (n: string) => (foldCase ? n.toLowerCase() : n);
  let out = name;
  if (taken.has(key(out))) {
    const m = /^(.+?)(\.[^.]{1,10})?$/.exec(name) ?? [name, name, ''];
    for (let i = 2; taken.has(key(out = `${m[1]} (${i})${m[2] ?? ''}`)); i++);
  }
  taken.add(key(out));
  return out;
}
