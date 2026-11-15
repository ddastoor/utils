// Search quality test: realistic queries must put the expected tool first.
// Runs the real search code (TypeScript) via Vite's module loader.
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const { searchTools } = await server.ssrLoadModule('/src/search.ts');
const { TOOLS } = await server.ssrLoadModule('/src/registry.ts');
await server.close();

const cases = (await import('./search-cases.mjs')).default;
let fail = 0;
for (const [q, want] of cases) {
  const got = searchTools(TOOLS, q)[0]?.id;
  if (got !== want) { fail++; console.log(`✗ "${q}" → ${got ?? '(none)'}; expected ${want}`); }
}
const ids = new Set(TOOLS.map((t) => t.id));
const covered = new Set(cases.map((c) => c[1]));
const missing = [...ids].filter((id) => !covered.has(id));
if (missing.length) { fail++; console.log('tools without search cases:', missing.join(', ')); }
console.log(`${cases.length - (fail && fail)} / ${cases.length} search cases passed`);
process.exit(fail ? 1 : 0);
