// The Java flavour: OpenJDK 21's own java.util.regex — Pattern, Matcher and the JDK's Unicode tables — compiled to
// WebAssembly (GC) by TeaVM (wasm/javaregex, §5.1r). The answer is the JSON of RegexRun.java, the same code that runs
// natively on the JDK as the reference of the unit suite; indexes are Java's, UTF-16 code units — the page's own.
import { load } from './teavm-runtime.js';
import { fromOffsets, PatternError, SHOWN, COUNTED, type EngineOut, type EngineReq } from './common';

/** What RegexRun answers when Java's recursive matcher runs out of stack; here it is the browser's stack that runs out. */
export const OVERFLOW = 'StackOverflowError: Java\'s regex engine is recursive, and this pattern goes too deep on this text';

async function instantiate(wasm: Uint8Array) {
  return (await load(wasm as Uint8Array<ArrayBuffer>)).exports as { run(p: string, f: string, t: string, r: string, hasRep: boolean, all: boolean, shown: number, counted: number): string };
}

/** The engine: `wasm` is java-regex.wasm. A run that exhausts the stack leaves the instance in an unknown state: the
 *  next run gets a new one. */
export async function javaEngine(wasm: Uint8Array): Promise<(q: EngineReq) => Promise<EngineOut>> {
  let e = await instantiate(wasm);
  return async (q) => {
    let out: string;
    try { out = e.run(q.pattern, q.flags, q.text, q.replacement ?? '', q.replacement !== null, q.all, SHOWN, COUNTED); }
    catch (err) {
      // the stack ran out (Java throws StackOverflowError there), or a fault of the WebAssembly build (TeaVM traps where
      // Java would throw, e.g. a remainder by zero): either leaves the instance in an unknown state — the next run gets
      // a new one
      if (err instanceof RangeError) { e = await instantiate(wasm); throw new PatternError(OVERFLOW); }
      if (err instanceof WebAssembly.RuntimeError) { e = await instantiate(wasm); throw new Error(`The Java engine failed (${err.message}) — a fault of its WebAssembly build, not an answer of Java's`); }
      throw err;
    }
    const a = JSON.parse(out);
    if (a.error) throw new PatternError(a.error);
    return {
      total: a.total, names: a.names, version: a.version,
      matches: a.matches.map((o: number[]) => fromOffsets(q.text, o)),
      replaced: a.replaced ?? null, repError: a.repError,
    };
  };
}
