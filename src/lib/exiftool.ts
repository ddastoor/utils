// ExifTool 13.42 (Phil Harvey's, the reference tool for photo metadata) running on zeroperl — Perl 5 compiled to
// WebAssembly with ExifTool's library inside (`@uswriting/exiftool`, Apache-2.0; ExifTool: Perl's licence). Used by
// the worker (src/workers/exiftool.worker.ts) and by the unit suite under Node.
import { parseMetadata, writeMetadata } from '@uswriting/exiftool';
import { READ_ARGS, STRIP_ARGS, innerName, exiftoolError, type Tags } from './photoinfo';

type Fetch = (...a: unknown[]) => Promise<Response>;

export async function readTags(file: Blob, name: string, fetchWasm?: Fetch): Promise<Tags> {
  if (!file.size) throw new Error('The file is empty (0 bytes).'); // zeroperl answers "Unknown error" for that
  const r = await parseMetadata<Tags[]>({ name: innerName(name), data: file }, { args: READ_ARGS, transform: (d) => JSON.parse(d), fetch: fetchWasm });
  if (!r.success) throw new Error(exiftoolError(r.error) || 'ExifTool could not read this file.');
  const tags = r.data[0] || {};
  // a file ExifTool does not recognise still gives an object: its error is a tag ("Unknown file type", "File format error")
  if (tags['ExifTool:Error']) throw new Error(String(tags['ExifTool:Error']));
  return tags;
}

/** The pictures kept inside the file — EXIF's thumbnail, a camera's larger preview, Photoshop's thumbnail — as their JPEG bytes,
 *  by tag (IFD1:ThumbnailImage …); {} when there are none. */
export async function readPreviews(file: Blob, name: string, fetchWasm?: Fetch): Promise<Record<string, Uint8Array>> {
  if (!file.size) return {};
  const r = await parseMetadata<Array<Record<string, unknown>>>({ name: innerName(name), data: file }, { args: ['-json', '-b', '-G1', '-m', '-ThumbnailImage', '-PreviewImage', '-PhotoshopThumbnail'], transform: (d) => JSON.parse(d), fetch: fetchWasm });
  if (!r.success) return {};
  const out: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(r.data[0] || {})) {
    if (typeof v !== 'string' || !v.startsWith('base64:')) continue;
    const bin = atob(v.slice(7)), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    out[k] = b;
  }
  return out;
}

/** The file without its metadata (the picture's bytes untouched). */
export async function stripFile(file: Blob, name: string, fetchWasm?: Fetch): Promise<Uint8Array> {
  const r = await writeMetadata({ name: innerName(name), data: file }, {}, { args: STRIP_ARGS, fetch: fetchWasm });
  if (!r.success) throw new Error(exiftoolError(r.error) || 'ExifTool could not write this file.');
  return new Uint8Array(r.data);
}
