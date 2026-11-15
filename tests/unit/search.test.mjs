// Search quality: realistic queries must rank the expected tool first; every tool needs at least one case.
export default async (t, { load }) => {
  const { searchTools } = await load('/src/search.ts');
  const { TOOLS } = await load('/src/registry.ts');
  const cases = (await import('../search-cases.mjs')).default;
  for (const [q, want] of cases) t.eq(searchTools(TOOLS, q)[0]?.id, want, `search "${q}"`);
  const covered = new Set(cases.map((c) => c[1]));
  for (const tool of TOOLS) t.ok(covered.has(tool.id), `search case exists for ${tool.id}`);
};
