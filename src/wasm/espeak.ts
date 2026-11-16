// Wrapper for espeak.wasm: eSpeak NG 1.52.0 (C, GPL-3.0+) built by us (wasm/espeak) with the English data linked in.
// Text → IPA phonemes for the neural voices: mode 'kokoro' (clauses joined by spaces) or 'piper' (clause punctuation
// kept, one sentence per line, like piper-phonemize).
export type EspeakVoice = 'gmw/en-us' | 'gmw/en';
export function bindEspeak(e: any) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const mem = () => new Uint8Array(e.memory.buffer);
  const cstr = (s: string) => { const b = enc.encode(`${s}\0`), p = e.es_malloc(b.length); mem().set(b, p); return p; };
  const read = (p: number) => { const m = mem(); let n = p; while (m[n]) n++; return dec.decode(m.subarray(p, n)); };
  const rc = e.es_init();
  if (rc !== 0) throw new Error(`eSpeak NG did not start (${rc})`);
  let cur: EspeakVoice = 'gmw/en-us';
  return {
    version: () => read(e.es_version()),
    voice(v: EspeakVoice) { if (v === cur) return; const p = cstr(v); try { if (e.es_voice(p) !== 0) throw new Error(`eSpeak voice ${v} not found`); cur = v; } finally { e.es_free(p); } },
    phonemes(text: string, mode: 'kokoro' | 'piper' = 'kokoro'): string {
      const p = cstr(text);
      try { const o = e.es_phonemes(p, mode === 'piper' ? 1 : 0); try { return read(o); } finally { e.es_free(o); } } finally { e.es_free(p); }
    },
  };
}
export type Espeak = ReturnType<typeof bindEspeak>;
