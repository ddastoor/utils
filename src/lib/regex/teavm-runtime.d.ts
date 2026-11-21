// Types of teavm-runtime.js (TeaVM's WebAssembly GC runtime, made by wasm/javaregex/build.sh): what java.ts uses.
export interface TeaVM {
  exports: Record<string, (...args: any[]) => any>;
  instance: WebAssembly.Instance;
  module: WebAssembly.Module;
}
export function load(src: string | BufferSource, options?: { nodejs?: boolean }): Promise<TeaVM>;
