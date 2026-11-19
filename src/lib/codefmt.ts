// Code Formatter (#/prettier): which engine formats which language, and the glue between them. Runs in the tab's
// worker (src/workers/codefmt.worker.ts) and, with loaders that read the files from disk, in the unit suite.
//
// Engines (docs/WASM-AUDIT.md, tab 54 — every one of them was held to independent parsers on hazard texts and on
// real files before it was let in):
//   JS / JSX, TypeScript / TSX, CSS, SCSS, YAML, GraphQL → Biome's official WebAssembly build (@biomejs/wasm-web)
//   JSON                                                 → @dprint/json (WebAssembly; leaves every number as typed)
//   HTML, Vue                                            → dprint-plugin-markup (WebAssembly) for the markup; what
//                                                          stands inside it (scripts, styles, the expressions of a
//                                                          Vue template, JSON blocks) goes to Biome / @dprint/json
//   Markdown                                             → Prettier (JavaScript): both WebAssembly Markdown
//                                                          formatters change what a document renders to
// Text one of the WebAssembly engines cannot read (CSS with old IE hacks, a YAML flow list over several lines, HTML
// with omitted end tags, a Vue file with a Pug template …) is formatted by Prettier instead, and the result says so.

export type Lang = 'js' | 'ts' | 'css' | 'scss' | 'html' | 'json' | 'yaml' | 'markdown' | 'graphql' | 'vue';
export type EngineName = 'biome' | 'dprint-json' | 'markup' | 'prettier';
export interface Options { printWidth: number; tabWidth: number; useTabs: boolean; semi: boolean; singleQuote: boolean; trailingComma: 'all' | 'es5' | 'none' }
export interface Formatted {
  text: string;
  /** the engine that wrote `text` */
  engine: EngineName;
  /** set when the language's own engine could not read the text and Prettier formatted it */
  instead?: { of: EngineName; why: string };
  /** things the reader of the result should know */
  notes: string[];
}
/** The slice of @dprint/formatter's Formatter that is used here. */
export interface DprintFormatter {
  setConfig(global: Record<string, unknown>, plugin: Record<string, unknown>): void;
  setHostFormatter(f: ((request: { filePath: string; fileText: string; overrideConfig?: Record<string, unknown> }) => string) | undefined): void;
  formatText(request: { filePath: string; fileText: string }): string;
}
export interface Loaders {
  /** Biome's module, instantiated: its Workspace class */
  biome(): Promise<{ Workspace: new () => any }>;
  /** a dprint plugin behind @dprint/formatter */
  dprint(plugin: 'json' | 'markup'): Promise<DprintFormatter>;
  /** Prettier with the plugins of one parser: format(text, options) */
  prettier(parser: string): Promise<(text: string, options: Record<string, unknown>) => Promise<string>>;
}

export const ENGINE: Record<Lang, EngineName> = { js: 'biome', ts: 'biome', css: 'biome', scss: 'biome', yaml: 'biome', graphql: 'biome', json: 'dprint-json', html: 'markup', vue: 'markup', markdown: 'prettier' };
export const ENGINE_LABEL: Record<EngineName, string> = { biome: 'Biome', 'dprint-json': 'dprint’s JSON formatter', markup: 'markup_fmt', prettier: 'Prettier' };
const PARSER: Record<Lang, string> = { js: 'babel', ts: 'typescript', css: 'css', scss: 'scss', html: 'html', json: 'json', yaml: 'yaml', markdown: 'markdown', graphql: 'graphql', vue: 'vue' };
export const DEFAULTS: Options = { printWidth: 80, tabWidth: 2, useTabs: false, semi: true, singleQuote: false, trailingComma: 'all' };

type BiomeKind = 'jsx' | 'ts' | 'tsx' | 'd.ts' | 'css' | 'scss' | 'yaml' | 'graphql';
class Refused extends Error {}

/** Line and column (from 1) of a UTF-8 byte offset. */
function position(text: string, byte: number): string {
  const before = new TextDecoder().decode(new TextEncoder().encode(text).subarray(0, byte));
  const line = before.split('\n').length, column = before.length - before.lastIndexOf('\n');
  return `line ${line}, column ${column}`;
}

function biomeEngine(mod: { Workspace: new () => any }) {
  const ws = new mod.Workspace();
  const { projectKey } = ws.openProject({ path: '/p', openUninitialized: true });
  let last = '', n = 0;
  return (kind: BiomeKind, text: string, o: Options): string => {
    // Tailwind's at-rules (@theme, @utility, @apply …) are read in CSS; in SCSS that switch breaks "@forward … as x-*"
    const tailwind = kind !== 'scss';
    const key = JSON.stringify([o, tailwind]);
    if (key !== last) {
      const quoteStyle = o.singleQuote ? 'single' : 'double';
      ws.updateSettings({ projectKey, workspaceDirectory: '/p', configuration: {
        formatter: { enabled: true, indentStyle: o.useTabs ? 'tab' : 'space', indentWidth: o.tabWidth, lineWidth: Math.max(1, Math.min(320, o.printWidth)), lineEnding: 'lf' },
        javascript: { parser: { unsafeParameterDecoratorsEnabled: true }, formatter: { quoteStyle, jsxQuoteStyle: 'double', semicolons: o.semi ? 'always' : 'asNeeded', trailingCommas: o.trailingComma } },
        css: { parser: { cssModules: true, tailwindDirectives: tailwind }, formatter: { enabled: true, quoteStyle } },
        graphql: { formatter: { enabled: true } },
        yaml: { formatter: { enabled: true, quoteStyle } },
        linter: { enabled: false }, assist: { enabled: false },
      } });
      last = key;
    }
    const path = `/p/f${n++}.${kind}`;
    ws.openFile({ projectKey, path, content: { type: 'fromClient', content: text, version: 0 } });
    try { return ws.formatFile({ projectKey, path }).code as string; } catch (e) {
      // "Code formatting aborted due to parsing errors": say which
      let why = String((e as Error)?.message ?? e).split('\n')[0];
      try {
        const d = ws.pullDiagnostics({ projectKey, path, categories: ['syntax'], pullCodeActions: false }).diagnostics?.find((x: any) => x.severity === 'error' || x.severity === 'fatal');
        if (d) why = `${String(d.description).replace(/\.$/, '')} (${position(text, d.location?.span?.[0] ?? 0)})`;
      } catch { /* the first line of the error will do */ }
      throw new Refused(why);
    } finally { ws.closeFile({ projectKey, path }); }
  };
}

/** Letters only, without their case: no formatter adds or removes one (digits may change: .5 → 0.5). The five
 *  entities of markup are left out — s == &quot;a&quot; may come back as s == 'a'. */
const letters = (s: string) => s.replace(/&(?:quot|apos|amp|lt|gt);/g, '').replace(/[^A-Za-z\u00C0-\uFFFF]+/g, '').toLowerCase();

export function makeFormatter(load: Loaders) {
  let biome: ReturnType<typeof biomeEngine> | null = null;
  const dprint: Partial<Record<'json' | 'markup', DprintFormatter>> = {};
  const prettier = new Map<string, (text: string, options: Record<string, unknown>) => Promise<string>>();
  const needBiome = async () => (biome ||= biomeEngine(await load.biome()));
  const needDprint = async (p: 'json' | 'markup') => (dprint[p] ||= await load.dprint(p));

  function json(text: string, o: Options, width = o.printWidth): string {
    const f = dprint.json!;
    f.setConfig({ lineWidth: width, indentWidth: o.tabWidth, useTabs: o.useTabs, newLineKind: 'lf' }, {});
    try { return f.formatText({ filePath: 'file.json', fileText: text }); } catch (e) { throw new Refused(String((e as Error)?.message ?? e).split('\n')[0]); }
  }

  /** TypeScript: without JSX, with JSX, or a declaration file ("const x: T;" is right only there) — whichever reads
   *  the text; `first` = what the file's name says. */
  function typescript(text: string, o: Options, first: 'ts' | 'tsx' | 'd.ts'): string {
    let refused: unknown;
    for (const kind of [first, ...(['ts', 'tsx', 'd.ts'] as const).filter((k) => k !== first)]) {
      try { return biome!(kind, text, o); } catch (e) { if (!(e instanceof Refused)) throw e; refused ??= e; }
    }
    throw refused;
  }

  // ── HTML and Vue: the markup plugin, with Biome and the JSON plugin behind its host callback
  async function markup(lang: 'html' | 'vue', text: string, o: Options, notes: string[]): Promise<string> {
    // a template in another language (Pug) is not markup the plugin can lay out — it would re-flow it —, and a Less
    // block is something neither Biome nor the plugin formats: such a file is Prettier's
    if (lang === 'vue' && /<template\b[^>]*\blang\s*=\s*["']?(?!html\b)[\w-]+/i.test(text)) throw new Refused('its <template> is written in another language');
    if (lang === 'vue' && /<style\b[^>]*\blang\s*=\s*["']?less\b/i.test(text)) throw new Refused('it has a Less block');
    const f = await needDprint('markup');
    // What will be asked of the host is decided from the text, since the callback cannot wait for a download: the
    // blocks of code and, in Vue, the expressions of the template. Attributes of plain HTML (style="…", onclick="…")
    // stay as typed — whether a page has a <script> must not decide how its attributes come out.
    if (lang === 'vue' || /<script\b|<style\b/i.test(text)) await needBiome();
    if (/<script\b[^>]*(?:json|importmap|speculationrules)/i.test(text)) await needDprint('json');
    const scripts = new Set<string>();
    for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) scripts.add(m[1]);
    let left = 0;
    f.setHostFormatter((r) => {
      const ext = r.filePath.split('.').pop() ?? '', src = r.fileText, c = r.overrideConfig ?? {};
      const width = Math.max(20, Math.min(320, Number(c.lineWidth ?? c.printWidth ?? o.printWidth) || o.printWidth));
      try {
        if (ext === 'json' || ext === 'jsonc' || ext === 'json5' || ext === 'importmap') return dprint.json ? json(src, o, width) : src;
        if (c.singleLineTopLevelDeclarations) return src;                               // a style="…" attribute
        if (ext === 'css' || ext === 'scss') return biome ? biome(ext, src, { ...o, printWidth: width }) : src;
        if (!/^[mc]?[jt]sx?$/.test(ext) || !biome) return src;                       // Less, Stylus, CoffeeScript …: as typed
        const kind: BiomeKind = /^[mc]?js/.test(ext) ? 'jsx' : ext.endsWith('x') ? 'tsx' : 'ts';
        if (scripts.has(src)) return kind === 'jsx' ? biome(kind, src, { ...o, printWidth: width }) : typescript(src, { ...o, printWidth: width }, kind as 'ts' | 'tsx');
        // An expression, wrapped by the plugin so that it is a program.
        if (lang === 'html') return src;                                                 // onclick="…"
        // A handler of several statements stays as its author wrote it: Vue needs the semicolons between them, and
        // laid out over lines inside an attribute it reads worse than before.
        if (/;\s*\S/.test(src)) return src;
        // For the plugin to take its wrapper off again and for the attribute to stay an attribute:
        //  · inside a double-quoted attribute no double quote comes back;
        //  · "let <pattern> = 0" (the variables of a slot or of v-for) comes back on one line.
        const inAttribute = c.quoteStyle === 'alwaysSingle' || c.javascriptQuoteStyle === 'single';
        const binding = /^let [\s\S]* = 0$/.test(src.trim());
        const out = biome(kind, src, { ...o, semi: true, trailingComma: 'none', singleQuote: inAttribute ? true : o.singleQuote, printWidth: binding ? 320 : width });
        if ((inAttribute && out.includes('"')) || (binding && !/^let .* = 0;?\s*$/.test(out))) { left++; return src; }
        return out;
      } catch { left++; return src; }
    });
    f.setConfig({ lineWidth: o.printWidth, indentWidth: o.tabWidth, useTabs: o.useTabs, newLineKind: 'lf' },
      { quotes: 'double', scriptFormatter: 'biome', scriptIndent: false, styleIndent: false, 'html.scriptIndent': true, 'html.styleIndent': true, doctypeKeywordCase: 'ignore' });
    let out: string;
    try { out = f.formatText({ filePath: lang === 'vue' ? 'file.vue' : 'file.html', fileText: text }); } catch (e) { throw new Refused(String((e as Error)?.message ?? e).split('\n')[0].replace(/^syntax error '?/, '').replace(/'? at line (\d+), column (\d+)$/, ' (line $1, column $2)')); } finally { f.setHostFormatter(undefined); }
    // the seam between two engines is ours: nothing but layout may have changed across it
    if (letters(out) !== letters(text)) throw new Refused('its result did not hold the same text');
    if (left) notes.push(`${left === 1 ? 'One expression of the template was' : `${left} expressions of the template were`} left as typed.`);
    return out;
  }

  async function withPrettier(lang: Lang, text: string, o: Options, notes: string[]): Promise<string> {
    const parser = PARSER[lang];
    let run = prettier.get(parser);
    if (!run) prettier.set(parser, run = await load.prettier(parser));
    const options: Record<string, unknown> = { printWidth: o.printWidth, tabWidth: o.tabWidth, useTabs: o.useTabs, semi: o.semi, singleQuote: o.singleQuote, trailingComma: o.trailingComma, endOfLine: 'lf' };
    // Markdown: the code inside ``` fences is somebody's example, not ours to rewrite
    if (lang === 'markdown') options.embeddedLanguageFormatting = 'off';
    // Vue: without semicolons Prettier writes "a = 1⏎ b()" into a handler, which Vue cannot compile
    if (lang === 'vue' && !o.semi && /(?:@|v-on:)[\w.:[\]-]+\s*=\s*(?:"[^"]*;[^"]*\S[^"]*"|'[^']*;[^']*\S[^']*')/.test(text)) { options.semi = true; notes.push('Semicolons were kept: a handler in the template has several statements, and Vue needs them there.'); }
    return run(text, options);
  }

  return {
    /** `name`: the file's name, when the text came from a file (tells .tsx from .ts). */
    async format(lang: Lang, text: string, opts: Partial<Options> = {}, name = ''): Promise<Formatted> {
      const o: Options = { ...DEFAULTS, ...opts };
      const engine = ENGINE[lang], notes: string[] = [];
      if (engine === 'prettier') return { text: await withPrettier(lang, text, o, notes), engine, notes };
      let refused: Refused;
      try {
        let out: string;
        if (engine === 'dprint-json') { await needDprint('json'); out = json(text, o); }
        else if (engine === 'markup') out = await markup(lang as 'html' | 'vue', text, o, notes);
        else {
          await needBiome();
          out = lang === 'ts' ? typescript(text, o, /\.tsx$/i.test(name) ? 'tsx' : /\.d\.[mc]?ts$/i.test(name) ? 'd.ts' : 'ts') : biome!(lang === 'js' ? 'jsx' : lang as BiomeKind, text, o);
        }
        return { text: out, engine, notes };
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        refused = e;
      }
      // what the WebAssembly engine cannot read, Prettier may; if it cannot either, its message (with the place) is shown
      const second: string[] = [];
      const out = await withPrettier(lang, text, o, second);
      return { text: out, engine: 'prettier', instead: { of: engine, why: refused.message }, notes: second };
    },
  };
}
