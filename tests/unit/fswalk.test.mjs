// The walk over the files 7-Zip extracted (src/lib/fswalk.ts), on a stand-in for Emscripten's FS: nested folders,
// and one folder of 200,000 files — spreading a folder's list into its parent's (push(...walk())) overflowed V8's call
// stack past ~150,000 files, so "Save all to a folder" failed for big archives (node_modules, datasets).
export default async (t, { load }) => {
  const { walk } = await load('/src/lib/fswalk.ts');
  const DIR = 0o040000, FILE = 0o100000;
  const fake = (tree) => {
    const at = (p) => p.split('/').filter(Boolean).reduce((n, k) => n?.[k], tree);
    return { FS: { readdir: (d) => ['.', '..', ...Object.keys(at(d))], stat: (p) => ({ mode: at(p) instanceof Uint8Array ? FILE : DIR }), isDir: (m) => m === DIR, readFile: (p) => at(p) } };
  };
  const b = (s) => new TextEncoder().encode(s);
  const small = fake({ out: { 'a.txt': b('A'), docs: { 'b.txt': b('B'), deep: { 'c.txt': b('C') } }, empty: {} } });
  const got = walk(small, '/out').map((f) => `${f.path}=${new TextDecoder().decode(f.data)}`).sort();
  t.eq(got, ['a.txt=A', 'docs/b.txt=B', 'docs/deep/c.txt=C'], 'nested folders: every file with its path below the root; an empty folder gives nothing');
  // a folder of 1,000,000 files, made up as they are asked for (one shared byte): more than any stack holds as arguments
  // (a browser's ~1 MB overflows past ~150,000, this harness's 4 MB worker stack past ~500,000)
  const N = 1000000, one = b('x'), names = Array.from({ length: N }, (_, i) => `f${i}.txt`);
  const lazy = { FS: { readdir: (d) => (d === '/out' ? ['node_modules'] : d === '/out/node_modules' ? ['pkg'] : ['.', '..', ...names]), stat: (p) => ({ mode: /\.txt$/.test(p) ? FILE : DIR }), isDir: (m) => m === DIR, readFile: () => one } };
  const files = walk(lazy, '/out');
  t.ok(files.length === N && files[0].path === 'node_modules/pkg/f0.txt' && files[N - 1].path === `node_modules/pkg/f${N - 1}.txt`, `a folder of 1,000,000 files: ${files.length.toLocaleString()} found (push(...walk()) overflowed the call stack)`);
  let old = 'returned';
  try { const a = []; a.push(...names); } catch (e) { old = e.message; }
  t.ok(/call stack/.test(old), `the old way, push(...list) of that folder, overflows here too ("${old}")`);
};
