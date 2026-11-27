// Every icon name used in the source must exist in the generated (self-hosted) icon set; the start page's part
// (src/icons.gen.ts) holds every icon the shell can show, the tabs' part (src/icons-tabs.gen.ts) the rest.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
export default async (t, { load, root }) => {
  const keys = (f) => new Set([...readFileSync(join(root, 'src', f), 'utf8').matchAll(/^ {2}([A-Za-z0-9]+): "/gm)].map((m) => m[1]));
  const shell = keys('icons.gen.ts'), tabs = keys('icons-tabs.gen.ts'), set = new Set([...shell, ...tabs]);
  const files = [];
  (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f) && !f.endsWith('.gen.ts')) files.push(p); } })(join(root, 'src'));
  const used = new Map();
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const re of [/icon:\s*'([A-Za-z0-9]+)'/g, /\bic\('([A-Za-z0-9]+)'/g, /icon\('([A-Za-z0-9]+)'/g]) for (const m of s.matchAll(re)) used.set(m[1], f.replace(root + '/', ''));
  }
  const { TOOLS, CATEGORIES } = await load('/src/registry.ts');
  for (const x of [...TOOLS, ...CATEGORIES]) used.set(x.icon, `registry: ${x.id}`);
  for (const [name, where] of used) t.ok(set.has(name), `icon "${name}" (${where}) is in src/icons.gen.ts or src/icons-tabs.gen.ts — run node scripts/gen-icons.mjs`);
  t.ok(used.size > 50, `checked ${used.size} icon names`);
  // the start page's part: the categories' and the tabs' icons (the cards, the tab rows, the search) and the shell's own
  for (const x of [...TOOLS, ...CATEGORIES]) t.ok(shell.has(x.icon), `icon "${x.icon}" of ${x.id} is on the start page (src/icons.gen.ts)`);
  const gen = await import(pathToFileURL(join(root, 'scripts/gen-icons.mjs')).href);
  const shellFiles = gen.shellFiles().map((f) => relative(join(root, 'src'), f).split('\\').join('/'));
  t.ok(['main.ts', 'registry.ts', 'ui.ts', 'icons.ts'].every((f) => shellFiles.includes(f)) && !shellFiles.some((f) => f.startsWith('tools/')), `the shell's files: the start page and what it imports, no tab (${shellFiles.join(' ')})`);
  for (const f of shellFiles) for (const m of readFileSync(join(root, 'src', f), 'utf8').matchAll(/'([A-Z][A-Za-z0-9]*)'/g)) if (set.has(m[1])) t.ok(shell.has(m[1]), `icon "${m[1]}" named in ${f} (the shell) is on the start page`);
  t.ok([...shell].every((n) => !tabs.has(n)), 'no icon in both parts');
  const p = gen.plan();
  t.eq([p.shell.join(' '), p.tabs.join(' ')], [[...shell].sort().join(' '), [...tabs].sort().join(' ')], 'the generated files are up to date (node scripts/gen-icons.mjs)');
  t.ok(tabs.size > 30, `the tabs' own icons come with the first tab: ${tabs.size} of ${set.size}`);
  // the tabs' part adds itself to the start page's map
  const { ICONS } = await load('/src/icons.gen.ts');
  await load('/src/icons-tabs.gen.ts');
  t.ok([...tabs].every((n) => n in ICONS), 'loading src/icons-tabs.gen.ts adds its icons to the map');
  const { icon } = await load('/src/icons.ts');
  t.ok(/data-missing="NoSuchIcon"/.test(icon('NoSuchIcon')) && !/data-missing/.test(icon('Camera')), 'an icon the map does not hold is drawn as a circle and named in data-missing');
};
