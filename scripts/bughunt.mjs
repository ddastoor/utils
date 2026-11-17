// Tracker for docs/BUGHUNT.md (the second-pass bug hunt over every tab).
//   node scripts/bughunt.mjs set <id>[,<id>…] [R=✓] [B=<n>] [T=<n>] [N="note"]   — update cells of one or more tabs
//   node scripts/bughunt.mjs status                                               — totals and the tabs still open
import { readFileSync, writeFileSync } from 'node:fs';
const F = new URL('../docs/BUGHUNT.md', import.meta.url);
const lines = readFileSync(F, 'utf8').split('\n');
const [cmd, ids, ...kv] = process.argv.slice(2);
const row = (l) => /^\| `([a-z0-9-]+)` \|/.exec(l)?.[1];
if (cmd === 'set') {
  const set = Object.fromEntries(kv.map((x) => [x[0], x.slice(2)]));
  for (const id of ids.split(',')) {
    const i = lines.findIndex((l) => row(l) === id); if (i < 0) throw new Error(`no tab ${id}`);
    const c = lines[i].split('|').map((x) => x.trim());            // ['', id, tab, platform, area, R, B, T, notes, '']
    if (set.R != null) c[5] = set.R; if (set.B != null) c[6] = set.B; if (set.T != null) c[7] = set.T;
    if (set.N != null) c[8] = c[8] ? `${c[8]}; ${set.N}` : set.N;
    lines[i] = '| ' + c.slice(1, 9).join(' | ') + ' |';
  }
  writeFileSync(F, lines.join('\n'));
}
const rows = lines.filter(row).map((l) => l.split('|').map((x) => x.trim()));
const open = rows.filter((c) => !c[5]);
console.log(`${rows.length} tabs · reviewed ${rows.length - open.length} · bugs fixed ${rows.reduce((a, c) => a + (+c[6] || 0), 0)} · checks added ${rows.reduce((a, c) => a + (+c[7] || 0), 0)}`);
if (cmd === 'status' && open.length) console.log('open: ' + open.map((c) => c[1].replace(/`/g, '')).join(' '));
