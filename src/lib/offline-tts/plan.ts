// The offline mode's choices → what the script does (no DOM: the unit suite runs it). The catalogue
// (catalogue.json, made by scripts/make-offline-tts-catalogue.py) lists the voices; this file turns the chosen ones into
// the job (driver.py's input), the engine runs (pinned packages) and what the person is told (sizes, licences).
import { linuxScript, windowsScript, type EngineRun } from './scripts';

export type OS = 'windows' | 'linux';
export interface Engine { name: string; url: string; packages: string[]; mb: number; torch: boolean; speedControl: boolean; licence: string; about: string; accept?: string }
export interface Model { engine: string; repo: string; rev: string; mb: number; licence: string; personal: boolean; name: string; gated?: boolean; accept?: string; file?: string; descTokenizer?: [string, string]; page?: string }
export interface Clip { repo: string; rev: string; file: string }
export interface CVoice { id: string; label: string; group: string; sex: string; model: string; speaker?: number | string; voice?: string; lang?: string; describe?: string; clip?: Clip }
export interface Catalogue { made: string; groups: Array<[string, string]>; engines: Record<string, Engine>; models: Record<string, Model>; voices: CVoice[] }

/** The order in which the engines run: the quick ones first, so the first files are there soon. */
export const ENGINE_ORDER = ['piper', 'supertonic', 'melo', 'kokoro', 'pocket', 'xtts', 'parler'];
/** PyTorch, once for every engine that needs it (uv keeps one copy): the processor build, or the CUDA build with an
 *  NVIDIA graphics card (uv picks it by itself). Python 3.12 and uv come to about 50 MB. */
export const TORCH_MB = { cpu: 300, cuda: 2600 };
export const BASE_MB = 50;

/** Windows or Linux from the browser's report (Chromium's user-agent client hints, else the user agent); null for
 *  another system (macOS, ChromeOS …): the script is written for Windows and Linux only. */
export function detectOS(ua: string, platform = ''): OS | null {
  const p = platform.toLowerCase();
  if (p === 'windows' || (!p && /Windows/.test(ua))) return 'windows';
  if (p === 'linux' || (!p && /Linux|X11/.test(ua) && !/Android|CrOS/.test(ua))) return 'linux';
  return null;
}

export interface Plan {
  voices: CVoice[]; models: Model[]; engines: string[];
  modelMB: number; programMB: number; programMBcuda: number;
  gated: string[]; accept: string[]; personal: boolean; noSpeed: string[];
}

/** What the chosen voices need: models (each once), engines, downloads, licences. */
export function planOf(cat: Catalogue, ids: Iterable<string>): Plan {
  const want = new Set(ids);
  const voices = cat.voices.filter((v) => want.has(v.id));
  const mids = [...new Set(voices.map((v) => v.model))];
  const models = mids.map((m) => cat.models[m]);
  // a voice taken from a recording also downloads the recording (about 0.6 MB)
  const clips = new Set(voices.filter((v) => v.clip).map((v) => v.clip!.file));
  const engines = ENGINE_ORDER.filter((e) => models.some((m) => m.engine === e));
  const torch = engines.some((e) => cat.engines[e].torch);
  const programs = engines.reduce((a, e) => a + cat.engines[e].mb, 0) + (engines.length ? BASE_MB : 0);
  return {
    voices, models, engines,
    modelMB: models.reduce((a, m) => a + m.mb, 0) + clips.size * 0.7,
    programMB: programs + (torch ? TORCH_MB.cpu : 0), programMBcuda: programs + (torch ? TORCH_MB.cuda : 0),
    gated: [...new Set(models.filter((m) => m.gated).map((m) => m.repo))],
    accept: [...new Set(models.map((m) => m.accept || cat.engines[m.engine].accept).filter(Boolean) as string[])],
    personal: models.some((m) => m.personal),
    noSpeed: engines.filter((e) => !cat.engines[e].speedControl).map((e) => cat.engines[e].name),
  };
}

/** driver.py's job: the text, the speed, MP3 or not, and every chosen voice with what its engine needs to fetch it. */
export function buildJob(cat: Catalogue, p: Plan, text: string, speed: number, mp3: boolean) {
  return {
    text, speed: Math.round(speed * 100) / 100, mp3,
    voices: p.voices.map((v) => {
      const m = cat.models[v.model];
      const out: Record<string, unknown> = { id: v.id, label: v.label, engine: m.engine, repo: m.repo, rev: m.rev };
      if (m.file) out.file = m.file;
      if (m.descTokenizer) out.descTokenizer = m.descTokenizer;
      for (const k of ['speaker', 'voice', 'lang', 'describe', 'clip'] as const) if (v[k] != null) out[k] = v[k];
      return out;
    }),
  };
}

/** The engine runs of a plan (pinned packages; XTTS-v2 with its licence accepted). */
export function runsOf(cat: Catalogue, p: Plan): EngineRun[] {
  return p.engines.map((e) => ({
    engine: e, name: cat.engines[e].name, packages: cat.engines[e].packages,
    voices: p.voices.filter((v) => cat.models[v.model].engine === e).length,
    ...(cat.engines[e].accept === 'cpml' ? { env: { COQUI_TOS_AGREED: '1' } } : {}),
  }));
}

export const SCRIPT_NAME: Record<OS, string> = { windows: 'supertools-speech.cmd', linux: 'supertools-speech.sh' };

/** The script for a system, with the text, the voices and driver.py inside it. */
export function scriptFor(os: OS, cat: Catalogue, p: Plan, o: { text: string; speed: number; mp3: boolean; driver: string; made: string; site: string }): string {
  const input = { job: buildJob(cat, p, o.text, o.speed, o.mp3), driver: o.driver, runs: runsOf(cat, p), made: o.made, site: o.site, gated: p.gated };
  return os === 'windows' ? windowsScript(input) : linuxScript(input);
}

/** "1.2 GB" / "350 MB" (MB = 10⁶ bytes, as the catalogue counts). */
export function fmtMB(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(mb >= 10000 ? 0 : 1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}

/** Search: every word of the query in the voice's label, its model's name, its engine's name or its group's name. */
export function matches(cat: Catalogue, v: CVoice, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const m = cat.models[v.model];
  const hay = `${v.label} ${m.name} ${cat.engines[m.engine].name} ${cat.groups.find(([g]) => g === v.group)?.[1] || ''} ${v.id}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
