// Asks the native Graphviz — the dot program built from the same release as graphviz.wasm — what every fixture graph
// looks like in every layout engine, and records it in tests/fixtures/graphviz/reference.json:
//   svg  a hash of each SVG (one per graph of the file)          sig  a hash of each graph's nodes and edges
//   n    [nodes, edges] of each graph                             err  what the tool said on stderr
// and, for the module's own rand() (wasm/graphviz/rand.c), what this machine's C library — glibc — returns:
// tests/fixtures/graphviz/glibc-rand.json (needs cc).
//
//   ZIG=/path/to/zig wasm/graphviz/build.sh                       (leaves the tool in $WORK/native/cmd/dot/dot_static)
//   DOT=/tmp/graphviz-build/native/cmd/dot/dot_static node scripts/make-graphviz-reference.mjs
//
// The unit suite (tests/unit/graphviz.test.mjs) then needs no native tool. Run this again after a new Graphviz
// release has been built, and READ THE DIFF of reference.json: a changed hash is a changed drawing.
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINES, sections, normSvg, short, plainGraphs, signature, splitSvgs, normErr } from '../tests/lib/graphviz-ref.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), fx = join(root, 'tests/fixtures/graphviz');
const DOT = process.env.DOT;
if (!DOT) { console.error('Set DOT to the native dot of the same Graphviz release (see the top of this file).'); process.exit(2); }
const run = (args, cwd) => new Promise((ok) => execFile(DOT, args, { cwd, timeout: 120000, maxBuffer: 1 << 28, encoding: 'utf8' }, (err, stdout, stderr) => ok({ rc: err ? (err.killed ? 'timeout' : err.code ?? `signal ${err.signal}`) : 0, stdout, stderr })));
const version = /version (\S+)/.exec((await run(['-V'])).stderr)?.[1];
if (!version) { console.error(`${DOT} -V did not name a version`); process.exit(2); }
const work = mkdtempSync(join(tmpdir(), 'gvref-'));

// every job: a file in the (empty) work directory, laid out by one engine
const jobs = [];
const out = { graphviz: version, graphs: {}, hazards: {} };
for (const f of readdirSync(join(fx, 'graphs')).sort()) {
  writeFileSync(join(work, f), readFileSync(join(fx, 'graphs', f)));
  out.graphs[f] = {};
  for (const e of ENGINES) jobs.push({ file: f, engine: e, put: (r) => { out.graphs[f][e] = r; } });
}
for (const f of readdirSync(join(fx, 'hazards')).sort()) {
  const text = readFileSync(join(fx, 'hazards', f), 'utf8'), parts = sections(text);
  if (!parts.length) {     // a file without cut marks is read whole (several graphs in one text)
    writeFileSync(join(work, `h-${f}`), text); out.hazards[f] = [{ title: '', whole: true }];
    for (const e of ENGINES) jobs.push({ file: `h-${f}`, engine: e, put: (r) => { out.hazards[f][0][e] = r; } });
    continue;
  }
  out.hazards[f] = parts.map((p) => ({ title: p.title }));
  parts.forEach((p, i) => {
    const name = `h-${f.replace(/\.gv$/, '')}-${i}.gv`; writeFileSync(join(work, name), p.text);
    for (const e of ENGINES) jobs.push({ file: name, engine: e, put: (r) => { out.hazards[f][i][e] = r; } });
  });
}
let next = 0, done = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    const svg = await run([`-K${j.engine}`, '-Tsvg', j.file], work), plain = await run([`-K${j.engine}`, '-Tplain', j.file], work);
    if (svg.rc === 'timeout' || plain.rc === 'timeout') throw new Error(`${j.file} with ${j.engine}: native dot did not finish — take the file out of the fixtures`);
    const graphs = plainGraphs(plain.stdout), r = { svg: splitSvgs(svg.stdout).map((s) => short(normSvg(s))), sig: graphs.map(signature), n: graphs.map((g) => [g.nodes.length, g.edges.length]) };
    const err = normErr(svg.stderr, j.file); if (err) r.err = err;
    if (svg.rc) r.rc = svg.rc;
    j.put(r);
    if (++done % 500 === 0) console.log(`${done} / ${jobs.length}`);
  }
}));
// glibc's rand(): for each seed the first five values and the 1000th
{
  const seeds = [0, 1, 2, 3, 7, 42, 123, 1000, 4711, 65535, 65536, 20261119, 2147483646, 2147483647, 2147483648, 4294967295];
  writeFileSync(join(work, 'r.c'), `#include <stdio.h>\n#include <stdlib.h>\n#include <gnu/libc-version.h>\nint main(void){unsigned s[]={${seeds.map((v) => `${v}u`).join(',')}};printf("{\\"glibc\\":\\"%s\\"",gnu_get_libc_version());for(unsigned k=0;k<sizeof s/sizeof*s;k++){srand(s[k]);printf(",\\n\\"%u\\":[",s[k]);for(int i=1;i<=1000;i++){int v=rand();if(i<=5)printf("%d,",v);if(i==1000)printf("%d]",v);}}printf("\\n}\\n");return 0;}\n`);
  execFileSync('cc', ['-o', join(work, 'r'), join(work, 'r.c')]);
  writeFileSync(join(fx, 'glibc-rand.json'), execFileSync(join(work, 'r'), { encoding: 'utf8' }));
}
rmSync(work, { recursive: true, force: true });
// one entry a line: the diff of a new run shows which drawing changed
const lines = ['{', ` "graphviz": ${JSON.stringify(version)},`, ' "graphs": {'];
const files = Object.keys(out.graphs);
files.forEach((f, i) => lines.push(`  ${JSON.stringify(f)}: {\n${ENGINES.map((e) => `   ${JSON.stringify(e)}: ${JSON.stringify(out.graphs[f][e])}`).join(',\n')}\n  }${i < files.length - 1 ? ',' : ''}`));
lines.push(' },', ' "hazards": {');
const hz = Object.keys(out.hazards);
hz.forEach((f, i) => lines.push(`  ${JSON.stringify(f)}: [\n${out.hazards[f].map((p) => `   {${Object.keys(p).map((k) => `${JSON.stringify(k)}: ${JSON.stringify(p[k])}`).join(',\n    ')}}`).join(',\n')}\n  ]${i < hz.length - 1 ? ',' : ''}`));
lines.push(' }', '}', '');
writeFileSync(join(fx, 'reference.json'), lines.join('\n'));
console.log(`Graphviz ${version}: ${jobs.length} drawings (${files.length} graph files, ${hz.length} hazard files × ${ENGINES.length} engines) → tests/fixtures/graphviz/reference.json`);
