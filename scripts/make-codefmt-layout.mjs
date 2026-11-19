// Writes tests/fixtures/codefmt/layout.json: what the Code Formatter prints, with its default options, for every
// hazard section of tests/fixtures/codefmt/<lang>.txt — as produced by the engines that are installed now
// (Biome, @dprint/json, dprint-plugin-markup, Prettier; versions in package-lock.json).
//
// Layout is a matter of taste, not of right and wrong, so this file is a record: READ ITS DIFF before committing it
// (git diff tests/fixtures/codefmt/layout.json) — after an engine is updated, every changed line is a change the users
// of the tab will see. That no engine changes what the text means is checked elsewhere, against independent parsers
// (tests/unit/codefmt.test.mjs, tests/e2e/prettier.e2e.mjs).
//
//   node scripts/make-codefmt-layout.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { engine, hazards, LANGS, nameOf } from '../tests/lib/codefmt-node.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const F = await engine();
const out = { about: 'What the Code Formatter prints for every hazard section (default options). Written by scripts/make-codefmt-layout.mjs — read its diff before committing it.', sections: {} };
let n = 0;
for (const lang of LANGS) {
  out.sections[lang] = {};
  for (const [title, src] of hazards(lang)) {
    let r; try { r = await F.format(lang, src, {}, nameOf(lang, title)); } catch (e) { r = { engine: 'none', error: String(e.message).split('\n')[0] }; }
    out.sections[lang][title] = r.error ? { engine: r.engine, error: r.error } : { engine: r.instead ? `prettier (${r.instead.of} could not read it)` : r.engine, out: r.text.split('\n') };
    n++;
  }
}
writeFileSync(join(root, 'tests/fixtures/codefmt/layout.json'), JSON.stringify(out, null, 1) + '\n');
console.log(n, 'sections written');
