// Every icon name used in the source must exist in the generated (self-hosted) icon set.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
export default async (t, { load, root }) => {
  const gen = await load('/src/icons.gen.ts');
  const set = gen.ICONS || gen.default || Object.values(gen).find((v) => v && typeof v === 'object');
  const files = [];
  (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f) && !f.endsWith('.gen.ts')) files.push(p); } })(join(root, 'src'));
  const used = new Map();
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const re of [/icon:\s*'([A-Za-z0-9]+)'/g, /\bic\('([A-Za-z0-9]+)'/g, /icon\('([A-Za-z0-9]+)'/g]) for (const m of s.matchAll(re)) used.set(m[1], f.replace(root + '/', ''));
  }
  const { TOOLS, CATEGORIES } = await load('/src/registry.ts');
  for (const x of [...TOOLS, ...CATEGORIES]) used.set(x.icon, `registry: ${x.id}`);
  for (const [name, where] of used) t.ok(name in set, `icon "${name}" (${where}) is in src/icons.gen.ts — run node scripts/gen-icons.mjs`);
  t.ok(used.size > 50, `checked ${used.size} icon names`);
};
