// The Code Formatter's engines for Node: the same files the tab's worker loads (src/workers/codefmt.worker.ts), read
// from node_modules, behind the loaders that src/lib/codefmt.ts asks for. Used by tests/unit/codefmt.test.mjs and by
// scripts that record or compare what the engines print.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), nm = (p) => join(root, 'node_modules', p);
const require = createRequire(import.meta.url);
const PLUGINS = {
  babel: ['babel', 'estree'], typescript: ['typescript', 'estree'], css: ['postcss'], scss: ['postcss'], json: ['babel', 'estree'], yaml: ['yaml'], markdown: ['markdown'], graphql: ['graphql'],
  html: ['html', 'postcss', 'babel', 'estree'], vue: ['html', 'postcss', 'babel', 'typescript', 'estree'],
};
/** Counts what was loaded, so a test can say "JSON never asked for Biome". */
export const loaded = { biome: 0, json: 0, markup: 0, prettier: [] };
let biome = null;
export const loaders = {
  async biome() {
    loaded.biome++;
    if (!biome) { biome = await import(nm('@biomejs/wasm-web/biome_wasm.js')); biome.initSync({ module: readFileSync(nm('@biomejs/wasm-web/biome_wasm_bg.wasm')) }); }
    return biome;
  },
  async dprint(plugin) {
    loaded[plugin]++;
    const { createFromBuffer } = require(nm('@dprint/formatter'));
    return createFromBuffer(readFileSync(nm(plugin === 'json' ? '@dprint/json/plugin.wasm' : 'dprint-plugin-markup/plugin.wasm')));
  },
  async prettier(parser) {
    loaded.prettier.push(parser);
    const core = await import(nm('prettier/standalone.mjs'));
    const plugins = await Promise.all(PLUGINS[parser].map((p) => import(nm(`prettier/plugins/${p}.mjs`)).then((m) => m.default ?? m)));
    return (text, options) => core.format(text, { ...options, parser, plugins });
  },
};
/** Prettier alone, with the tab's options: the yardstick some checks compare with. */
export async function prettierFormat(lang, text, o = {}) {
  const parser = { js: 'babel', ts: 'typescript', markdown: 'markdown' }[lang] ?? lang;
  return (await loaders.prettier(parser))(text, { printWidth: 80, tabWidth: 2, useTabs: false, semi: true, singleQuote: false, trailingComma: 'all', endOfLine: 'lf', ...(lang === 'markdown' ? { embeddedLanguageFormatting: 'off' } : {}), ...o });
}
/** The tab's engine module (src/lib/codefmt.ts) with the loaders above — for scripts and the e2e suite (Node 22
 *  reads the TypeScript file as it is); the unit suite loads the module through its own Vite loader. */
export async function engine() { const { makeFormatter } = await import('../../src/lib/codefmt.ts'); return makeFormatter(loaders); }
/** The hazard sections of tests/fixtures/codefmt/<lang>.txt: [[title, text], …]. */
export function hazards(lang) {
  const text = readFileSync(join(root, 'tests/fixtures/codefmt', `${lang}.txt`), 'utf8');
  return text.split(/^§§§§ /m).slice(1).map((s) => { const i = s.indexOf('\n'); return [s.slice(0, i), s.slice(i + 1)]; });
}
export const LANGS = ['js', 'ts', 'json', 'css', 'scss', 'yaml', 'graphql', 'markdown', 'html', 'vue'];
/** The file name a hazard section stands for (TypeScript sections with JSX are .tsx files). */
export const nameOf = (lang, title) => (lang === 'ts' && /TSX/.test(title) ? 'section.tsx' : '');
