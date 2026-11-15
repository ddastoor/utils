// Regenerates docs/TOOLS.md from src/registry.ts (the single source of truth for tabs).
//   node scripts/gen-toollist.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const { TOOLS, CATEGORIES } = await server.ssrLoadModule('/src/registry.ts');
await server.close();
const P = { both: 'PC + mobile', pc: '**PC only**', mobile: '**Mobile only**' };
const count = (p) => TOOLS.filter((t) => t.platform === p).length;
let md = `# Tool list (generated)\n\nGenerated from \`src/registry.ts\` by \`npm run docs\` — do not edit by hand.\n\n`;
md += `**${TOOLS.length} tabs** in ${CATEGORIES.length} categories — ${count('both')} PC + mobile, ${count('pc')} PC only, ${count('mobile')} mobile only.\n\n`;
for (const c of CATEGORIES) {
  const ts = TOOLS.filter((t) => t.cat === c.id);
  md += `## ${c.title} (${ts.length})\n\n| id | Tab | Platform | What it does | Search keywords |\n|---|---|---|---|---|\n`;
  for (const t of ts) md += `| \`${t.id}\` | ${t.title} | ${P[t.platform]} | ${t.desc} | ${t.kw.slice(0, 8).join(', ')}${t.kw.length > 8 ? ', …' : ''} |\n`;
  md += '\n';
}
writeFileSync(new URL('../docs/TOOLS.md', import.meta.url), md);
console.log(`docs/TOOLS.md: ${TOOLS.length} tools`);
