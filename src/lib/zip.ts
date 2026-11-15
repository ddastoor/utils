// Bundle generated files into one .zip (zip.js). Already-compressed media is stored (level 0) by default.
export async function zipFiles(entries: Array<{ name: string; blob: Blob }>, level = 0): Promise<Blob> {
  const { ZipWriter, BlobWriter, BlobReader } = await import('@zip.js/zip.js');
  const w = new ZipWriter(new BlobWriter('application/zip'), { level });
  const used = new Set<string>();
  for (const e of entries) {
    let n = e.name, k = 1;
    while (used.has(n.toLowerCase())) n = e.name.replace(/(\.[^.]+)?$/, (x) => ` (${k++})${x}`);
    used.add(n.toLowerCase());
    await w.add(n, new BlobReader(e.blob));
  }
  return w.close();
}
