// The .NET flavour: .NET 10's own System.Text.RegularExpressions on Microsoft's WebAssembly runtime (browser-wasm) —
// wasm/dotnetregex, §5.1s. The files are served from public/engines/dotnet-regex/_framework/ as `dotnet publish` wrote
// them: dotnet.js finds its siblings by its own address. The answer is the JSON of RegexRun.cs, the same code that runs
// natively on .NET as the reference of the unit suite; indexes are UTF-16 code units, the page's own.
import { fromOffsets, PatternError, SHOWN, COUNTED, type EngineOut, type EngineReq } from './common';

/** `url`: the address of dotnet.js. One runtime for the worker's life. */
export async function dotnetEngine(url: string): Promise<(q: EngineReq) => EngineOut> {
  // dotnet.js runs the runtime as a "sidecar" in a worker only when the worker has no onmessage handler; the regex
  // worker has one, and then dotnet.create() waits for ever after loading the assemblies — so say it outright
  (globalThis as any).dotnetSidecar = true;
  const { dotnet } = await import(/* @vite-ignore */ url);
  const rt = await dotnet.create();
  const ex = await rt.getAssemblyExports('DotnetRegex.dll');
  return (q) => {
    const a = JSON.parse(ex.Exports.Run(q.pattern, q.flags, q.text, q.replacement ?? '', q.replacement !== null, q.all, SHOWN, COUNTED));
    if (a.error) throw new PatternError(a.error);
    return {
      total: a.total, names: a.names, version: a.version,
      matches: a.matches.map((o: number[]) => fromOffsets(q.text, o)),
      replaced: a.replaced ?? null, repError: a.repError,
    };
  };
}
