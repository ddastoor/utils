// Reading a text file as people have them — shared by the tabs that open code, data, logs and patches (no DOM: the
// unit suite runs it in Node).

/** The text of a file's bytes: UTF-16 by its byte-order mark; UTF-8 when the bytes are valid UTF-8 (a UTF-8 mark is
 *  dropped); else Windows-1252, what Windows programs save — File.text() read everything as UTF-8 and turned "café" from
 *  Notepad into "caf�". `null` when the bytes are not text: a NUL among the first 8 KB without a UTF-16 mark (a picture
 *  or a program opened by mistake was put into the editor as garbage). */
export function textOf(bytes: Uint8Array): { text: string; how: '' | 'UTF-16' | 'Windows-1252' } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), how: 'UTF-16' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), how: 'UTF-16' };
  if (bytes.subarray(0, 8192).includes(0)) return null;
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), how: '' }; }
  catch { return { text: new TextDecoder('windows-1252').decode(body), how: 'Windows-1252' }; }
}

/** Whether a text ends its lines with CR LF, as Windows programs write them (most of its line breaks are). A text box
 *  gives its text back with LF only, so a tab that saves a file it opened puts them back (to-do #13). */
export const crlfText = (s: string) => { const crlf = s.split('\r\n').length - 1; return crlf > 0 && crlf * 2 >= s.split('\n').length - 1; };

/** A chosen file as text; a file that is not text is refused in words ("photo.jpg is not a text file — …"). */
export async function readTextFile(f: Blob & { name: string }, hint = ''): Promise<string> {
  const r = textOf(new Uint8Array(await f.arrayBuffer()));
  if (!r) throw new Error(`${f.name} is not a text file${hint ? ` — ${hint}` : ''}.`);
  return r.text;
}
