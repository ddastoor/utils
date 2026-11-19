// Search quality: realistic queries must rank the expected tool first; every tool needs at least one case.
export default async (t, { load, wasm }) => {
  const { searchTools, setSearchEngine } = await load('/src/search.ts');
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  setSearchEngine(bindTextcore(await wasm('textcore')));
  const { TOOLS, loadKeywords } = await load('/src/registry.ts');
  await loadKeywords();
  const cases = (await import('../search-cases.mjs')).default;
  for (const [q, want] of cases) t.eq(searchTools(TOOLS, q)[0]?.id, want, `search "${q}"`);
  const covered = new Set(cases.map((c) => c[1]));
  for (const tool of TOOLS) t.ok(covered.has(tool.id), `search case exists for ${tool.id}`);
  // engine edge cases (C): empty/odd input, typo tolerance, stop words only, very long words, re-indexing
  t.eq(searchTools(TOOLS, '').length, 0, 'empty query → nothing');
  t.eq(searchTools(TOOLS, '   ').length, 0, 'blank query → nothing');
  t.ok(searchTools(TOOLS, 'the and of').length >= 0, 'stop-words-only query does not crash');
  t.eq(searchTools(TOOLS, 'x'.repeat(500)).length, 0, 'very long word → no match, no crash');
  t.eq(searchTools(TOOLS, 'pasport phto')[0]?.id, 'passport', 'typos in two words');
  t.eq(searchTools(TOOLS, 'ÉXÍF')[0]?.id, 'exif', 'accents and case folded');
  const sub = TOOLS.slice(0, 20);
  t.ok(searchTools(sub, 'pdf').every((x) => sub.includes(x)), 're-index for a different tool list');
  t.eq(searchTools(TOOLS, 'merge pdf')[0]?.id, 'pdf-merge', 'switching back re-indexes the full list');
  const t0 = performance.now(); for (let i = 0; i < 300; i++) searchTools(TOOLS, ['compres jpg', 'qr', 'remove backgrund', 'sip calculator'][i % 4]);
  t.ok(performance.now() - t0 < 1500, `300 queries fast (${(performance.now() - t0).toFixed(0)} ms)`);
};
