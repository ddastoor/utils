// Piper (VITS) front end, as piper-phonemize does it: eSpeak NG IPA with clause punctuation, one sentence per line
// (our espeak.wasm, 'piper' mode); each Unicode code point → id from the voice's phoneme_id_map, BOS "^", a pad "_"
// after every symbol, EOS "$". Speed → length_scale = 1 / speed.
import type { Espeak } from '../wasm/espeak';

export interface PiperConfig { audio: { sample_rate: number }; espeak: { voice: string }; inference: { noise_scale: number; length_scale: number; noise_w: number }; phoneme_id_map: Record<string, number[]>; speaker_id_map?: Record<string, number>; num_speakers?: number }
export function sentencePhonemes(es: Espeak, text: string): string[] {
  es.voice('gmw/en-us');
  return es.phonemes(text.replace(/\s+/g, ' ').trim(), 'piper').split('\n').map((s) => s.trim()).filter(Boolean);
}
export function phonemeIds(ph: string, map: Record<string, number[]>): { ids: number[]; missing: string[] } {
  const pad = map._[0], ids = [...map['^'], pad], missing: string[] = [];
  for (const c of ph) { const id = map[c]; if (!id) { if (!missing.includes(c)) missing.push(c); continue; } ids.push(...id, pad); }
  ids.push(...map.$);
  return { ids, missing };
}
