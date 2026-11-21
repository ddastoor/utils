// The offline mode's choices → what the script does (no DOM: the unit suite runs it). The catalogue
// (catalogue.json, made by scripts/make-offline-tts-catalogue.py) lists the voices; this file turns the chosen ones into
// the job (driver.py's input), the engine runs (pinned packages) and what the person is told (sizes, licences).
import { linuxScript, windowsScript, fmtMB, type EngineRun } from './scripts';

export { fmtMB };

export type OS = 'windows' | 'linux';
export interface Engine { name: string; url: string; packages: string[]; lock?: string[]; mb: number; torch: boolean; speedControl: boolean; licence: string; about: string; accept?: string; slow?: boolean; ownTorch?: boolean }
export interface Model { engine: string; repo: string; rev: string; mb: number; licence: string; personal: boolean; name: string; gated?: boolean; accept?: string; file?: string; descTokenizer?: [string, string]; page?: string; untried?: string }
export interface Clip { repo: string; rev: string; file: string }
/** How an accent-recognition model heard the voice (`scripts/data/indian-accents.json`): `indian` = its score for an
 *  Indian accent minus its best score for any other (above 0: heard as Indian first; the higher, the stronger),
 *  averaged over the sentences measured; `like` = the other accent it was heard closest to. */
export interface Heard { indian: number; like: string; n: number }
/** `personal`: the voice's own recording is for personal use only (Kyutai's EARS and Expresso voices), whatever the model's licence. */
export interface CVoice { id: string; label: string; group: string; sex: string; model: string; speaker?: number | string; voice?: string; lang?: string; describe?: string; clip?: Clip; heard?: Heard; personal?: boolean }
export interface Catalogue { made: string; groups: Array<[string, string]>; engines: Record<string, Engine>; models: Record<string, Model>; voices: CVoice[]; accentSurvey?: { tool: string; texts: string[]; made: string } }

/** The order in which the engines run: the quick ones first, so the first files are there soon. */
export const ENGINE_ORDER = ['piper', 'supertonic', 'melo', 'indictiny', 'mms', 'coqui', 'kokoro', 'pocket', 'chatterbox', 'xtts', 'f5', 'qwen',
  'omnivoice', 'kyutai', 'voxcpm', 'vibevoice', 'bark', 'parler', 'veena'];
/** PyTorch, once for every engine that needs it (uv keeps one copy) — and once more for an engine that pins a version
 *  of its own (Chatterbox: 2.6): the processor build, or the CUDA build with an NVIDIA graphics card (uv picks it by
 *  itself). Python 3.12 and uv come to about 50 MB. */
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
  gated: string[]; accept: string[]; personal: boolean; noSpeed: string[]; slow: string[];
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
  const torch = engines.filter((e) => cat.engines[e].torch && !cat.engines[e].ownTorch).length ? 1 : 0;
  const torches = torch + engines.filter((e) => cat.engines[e].ownTorch).length;
  const programs = engines.reduce((a, e) => a + cat.engines[e].mb, 0) + (engines.length ? BASE_MB : 0);
  return {
    voices, models, engines,
    modelMB: models.reduce((a, m) => a + m.mb, 0) + clips.size * 0.7,
    programMB: programs + torches * TORCH_MB.cpu, programMBcuda: programs + torches * TORCH_MB.cuda,
    gated: [...new Set(models.filter((m) => m.gated).map((m) => m.repo))],
    accept: [...new Set(models.map((m) => m.accept || cat.engines[m.engine].accept).filter(Boolean) as string[])],
    personal: models.some((m) => m.personal) || voices.some((v) => v.personal),
    noSpeed: engines.filter((e) => !cat.engines[e].speedControl).map((e) => cat.engines[e].name),
    slow: engines.filter((e) => cat.engines[e].slow).map((e) => cat.engines[e].name),
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

/** The engine runs of a plan (pinned packages; XTTS-v2 with its licence accepted), each with what its first run
 *  downloads: Python and uv with the first engine, PyTorch with the first engine that needs the shared one and with
 *  every engine that pins its own — the same sums as planOf. */
export function runsOf(cat: Catalogue, p: Plan): EngineRun[] {
  let sharedTorch = false;
  return p.engines.map((e, i) => {
    const E = cat.engines[e];
    const voices = p.voices.filter((v) => cat.models[v.model].engine === e);
    const models = [...new Set(voices.map((v) => v.model))].map((m) => cat.models[m]);
    const clips = new Set(voices.filter((v) => v.clip).map((v) => v.clip!.file)).size;
    const torch = E.torch && (E.ownTorch || !sharedTorch);
    if (E.torch && !E.ownTorch) sharedTorch = true;
    const programs = E.mb + (i === 0 ? BASE_MB : 0);
    return {
      engine: e, name: E.name, packages: E.packages, lock: E.lock, voices: voices.length,
      first: {
        programs: programs + (torch ? TORCH_MB.cpu : 0), cuda: programs + (torch ? TORCH_MB.cuda : 0),
        models: models.reduce((a, m) => a + m.mb, 0) + clips * 0.7,
      },
      ...(E.accept === 'cpml' ? { env: { COQUI_TOS_AGREED: '1' } } : {}),
    };
  });
}

/** The accents of CommonAccent (the model of the survey) in words. */
export const ACCENT_WORDS: Record<string, string> = {
  england: 'English (England)', scotland: 'Scottish', wales: 'Welsh', ireland: 'Irish', us: 'American', canada: 'Canadian',
  australia: 'Australian', newzealand: 'New Zealand', african: 'African', bermuda: 'Bermudian', southatlandtic: 'South Atlantic',
  malaysia: 'Malaysian', philippines: 'Filipino', singapore: 'Singaporean', hongkong: 'Hong Kong', indian: 'Indian',
};
/** The strength of the Indian accent heard, in words, by `Heard.indian` (the Indian score minus the best other one, raw
 *  scores of the classifier). Set on the survey of 21 Nov 2026 (63 voices, −0.60 … +0.49): at −0.2 and below Indian is
 *  far down the list (5th – 15th of 16) — very light; up to 0 it is close behind another accent — light; above 0 it is
 *  heard first — clear, and above 0.25 (the middle of those heard first) strong. */
export function strength(m: number): string {
  return m <= -0.2 ? 'very light' : m <= 0 ? 'light' : m <= 0.25 ? 'clear' : 'strong';
}
/** Every Indian English voice, the lightest accent first (owner, 21 Nov 2026: "ranked … in order of increasing Indian
 *  accent thickness … the topmost … as British sounding as possible"); those the survey could not run, by model, with
 *  the reason. A tie keeps the catalogue's order. */
export function rankIndian(cat: Catalogue): { measured: CVoice[]; unmeasured: Array<{ model: string; reason: string; voices: CVoice[] }> } {
  const ind = cat.voices.filter((v) => v.group === 'in');
  const measured = ind.filter((v) => v.heard).sort((a, b) => a.heard!.indian - b.heard!.indian);
  const rest = new Map<string, CVoice[]>();
  for (const v of ind) if (!v.heard) rest.set(v.model, [...(rest.get(v.model) || []), v]);
  return {
    measured,
    unmeasured: [...rest].map(([model, voices]) => {
      const m = cat.models[model];
      return { model, voices, reason: m.untried || (m.gated ? 'It needs a Hugging Face account, which this survey did not have.' : 'Not measured yet.') };
    }),
  };
}

export const SCRIPT_NAME: Record<OS, string> = { windows: 'superutils-speech.cmd', linux: 'superutils-speech.sh' };

/** The script for a system, with the text, the voices and driver.py inside it. */
export function scriptFor(os: OS, cat: Catalogue, p: Plan, o: { text: string; speed: number; mp3: boolean; driver: string; made: string; site: string }): string {
  const input = { job: buildJob(cat, p, o.text, o.speed, o.mp3), driver: o.driver, runs: runsOf(cat, p), made: o.made, site: o.site, gated: p.gated };
  return os === 'windows' ? windowsScript(input) : linuxScript(input);
}

/** Search: every word of the query in the voice's label, its model's name, its engine's name or its group's name. */
export function matches(cat: Catalogue, v: CVoice, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const m = cat.models[v.model];
  const hay = `${v.label} ${m.name} ${cat.engines[m.engine].name} ${cat.groups.find(([g]) => g === v.group)?.[1] || ''} ${v.id}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
