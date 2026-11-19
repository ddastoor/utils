// The Code Formatter's worker: the engines behind src/lib/codefmt.ts. Each one is fetched from this site the first
// time a language needs it — Biome's module (70 MB) only for JS, TS, CSS, SCSS, YAML, GraphQL and the code inside
// HTML and Vue; JSON and plain HTML never ask for it. Leaving the tab terminates the worker and frees them all.
import { makeFormatter, type Lang, type Options } from '../lib/codefmt';
import biomeUrl from '@biomejs/wasm-web/biome_wasm_bg.wasm?url';
import jsonUrl from '@dprint/json/plugin.wasm?url';
import markupUrl from 'dprint-plugin-markup/plugin.wasm?url';

const post = (m: unknown) => (self as any).postMessage(m);
const babel = () => import('prettier/plugins/babel'), estree = () => import('prettier/plugins/estree'), typescript = () => import('prettier/plugins/typescript');
const postcss = () => import('prettier/plugins/postcss'), html = () => import('prettier/plugins/html');
// Prettier's plugins per parser (the fallback, and Markdown)
const PLUGINS: Record<string, Array<() => Promise<any>>> = {
  babel: [babel, estree], typescript: [typescript, estree], css: [postcss], scss: [postcss], json: [babel, estree],
  yaml: [() => import('prettier/plugins/yaml')], markdown: [() => import('prettier/plugins/markdown')], graphql: [() => import('prettier/plugins/graphql')],
  html: [html, postcss, babel, estree], vue: [html, postcss, babel, typescript, estree],
};
const bytes = async (url: string, what: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${what} could not be loaded (HTTP ${r.status})`); return r.arrayBuffer(); };
const fmt = makeFormatter({
  async biome() {
    post({ loading: 'biome' });
    try { const m: any = await import('@biomejs/wasm-web'); await m.default({ module_or_path: biomeUrl }); return m; } finally { post({ loading: null }); }
  },
  async dprint(plugin) {
    const { createFromBuffer } = await import('@dprint/formatter');
    return createFromBuffer(await bytes(plugin === 'json' ? jsonUrl : markupUrl, plugin === 'json' ? 'The JSON formatter' : 'The HTML formatter')) as any;
  },
  async prettier(parser) {
    const [core, ...plugins] = await Promise.all([import('prettier/standalone'), ...PLUGINS[parser].map((f) => f())]);
    return (text, options) => core.format(text, { ...options, parser, plugins: plugins.map((m: any) => m.default ?? m) });
  },
});
self.onmessage = async (e: MessageEvent<{ id: number; lang: Lang; text: string; opts: Partial<Options>; name: string }>) => {
  const { id, lang, text, opts, name } = e.data;
  try { post({ id, result: await fmt.format(lang, text, opts, name) }); } catch (err: any) { post({ id, error: String(err?.message || err) }); }
};
