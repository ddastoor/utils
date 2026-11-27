// The neural voices made on the device (src/lib/speech.ts): US and British English — Kokoro-82M; Indian English — Piper
// (L2-ARCTIC speakers whose first language is Hindi). Shared by the Text-to-Speech tab and the Audiobook tab.
export interface Voice { id: string; label: string; engine: 'kokoro' | 'piper' | 'system'; lang: 'a' | 'b'; speaker: number }
export const V = (id: string, label: string, engine: Voice['engine'], lang: Voice['lang'] = 'a', speaker = 0): Voice => ({ id, label, engine, lang, speaker });
export const VOICES: Array<[string, Voice[]]> = [
  ['US English', [V('af_heart', 'Heart — female', 'kokoro'), V('af_bella', 'Bella — female', 'kokoro'), V('af_nicole', 'Nicole — female, soft', 'kokoro'), V('af_sarah', 'Sarah — female', 'kokoro'),
    V('am_michael', 'Michael — male', 'kokoro'), V('am_fenrir', 'Fenrir — male', 'kokoro'), V('am_puck', 'Puck — male', 'kokoro')]],
  ['British English', [V('bf_emma', 'Emma — female', 'kokoro', 'b'), V('bf_isabella', 'Isabella — female', 'kokoro', 'b'), V('bm_george', 'George — male', 'kokoro', 'b'), V('bm_fable', 'Fable — male', 'kokoro', 'b')]],
  ['Indian English', [V('in_svbi', 'Female voice 1 (SVBI)', 'piper', 'a', 2), V('in_tni', 'Female voice 2 (TNI)', 'piper', 'a', 9), V('in_asi', 'Male voice 1 (ASI)', 'piper', 'a', 10), V('in_rrbi', 'Male voice 2 (RRBI)', 'piper', 'a', 19)]],
];
export const voiceById = (id: string) => VOICES.flatMap(([, vs]) => vs).find((v) => v.id === id);
