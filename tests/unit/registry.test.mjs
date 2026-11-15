// Registry integrity: unique ids, valid categories/platforms/icons, keywords present.
export default async (t, { load }) => {
  const { TOOLS, CATEGORIES } = await load('/src/registry.ts');
  const { ICONS } = await load('/src/icons.gen.ts');
  const ids = new Set();
  for (const x of TOOLS) {
    t.ok(!ids.has(x.id), `unique id ${x.id}`); ids.add(x.id);
    t.ok(CATEGORIES.some((c) => c.id === x.cat), `category of ${x.id}`);
    t.ok(['both', 'pc', 'mobile'].includes(x.platform), `platform of ${x.id}`);
    t.ok(x.icon in ICONS, `icon ${x.icon} for ${x.id}`);
    t.ok(x.kw.length >= 4, `keywords for ${x.id}`);
    t.ok(/^[a-z0-9-]+$/.test(x.id), `id format ${x.id}`);
  }
  for (const c of CATEGORIES) t.ok(c.icon in ICONS, `category icon ${c.id}`);
  t.ok(TOOLS.filter((x) => x.cat === 'software').every((x) => x.platform === 'pc'), 'all Software tools are PC only (owner rule)');
};
