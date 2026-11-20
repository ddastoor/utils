// Every CSS custom property the app uses is defined (src/styles.css): an undefined one falls back silently — the
// Passport tab's colour chips used var(--card, #fff), never defined, and were white with the dark theme's light text.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
export default async (t) => {
  const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const files = []; (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f)) files.push(p); } })(new URL('../../src', import.meta.url).pathname);
  const uses = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => ['styles.css', m[1]]);
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/var\((--[\w-]+)|col\('(--[\w-]+)'\)|getPropertyValue\('(--[\w-]+)'\)/g)) uses.push([f.split('/src/')[1], m[1] || m[2] || m[3]]);
  const missing = uses.filter(([, v]) => !defined.has(v));
  t.ok(uses.length > 100, `${uses.length} uses of ${new Set(uses.map((u) => u[1])).size} custom properties`);
  t.ok(!missing.length, `every custom property used is defined ${missing.map(([f, v]) => `${v} in ${f}`).join(', ')}`);
  // the two themes define the same colour tokens
  const dark = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root[^{]*\{([^}]*)\}/.exec(css)?.[1] || '';
  const light = /:root\s*\{([^}]*)\}/.exec(css)?.[1] || '';
  const names = (s) => new Set([...s.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const L = names(light), D = names(dark), colours = [...L].filter((v) => /#|rgb|hsl|color-mix/.test(new RegExp(`${v}\\s*:\\s*([^;]+)`).exec(light)?.[1] || ''));
  const notDark = colours.filter((v) => !D.has(v) && !['--code-bg'].includes(v));
  t.ok(D.size > 5 && !notDark.length, `every colour token of the light theme has a dark value (${D.size} in the dark theme) ${notDark.join(', ')}`);
};
