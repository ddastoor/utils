// "Download the latest yt-dlp" (YouTube Clip tab): links to yt-dlp's own GitHub releases. GitHub's
// `releases/latest/download/<file>` address always redirects to the newest release, so the browser downloads the
// current version straight from GitHub — this page fetches nothing (a link, not a request: the CSP stays as it is).

export const YTDLP_RELEASES = 'https://github.com/yt-dlp/yt-dlp/releases/latest';
export const ytdlpUrl = (file: string) => `${YTDLP_RELEASES}/download/${file}`;

export interface YtdlpFile { file: string; system: string; note: string }
/** The files of every release (checked against GitHub on 20 Nov 2026, release 2026.10.26). */
export const YTDLP_FILES: YtdlpFile[] = [
  { file: 'yt-dlp.exe', system: 'Windows (64-bit)', note: 'runs on its own — nothing to install' },
  { file: 'yt-dlp_arm64.exe', system: 'Windows on ARM', note: 'runs on its own' },
  { file: 'yt-dlp_x86.exe', system: 'Windows (32-bit)', note: 'runs on its own' },
  { file: 'yt-dlp_macos', system: 'macOS', note: 'runs on its own (Intel and Apple silicon)' },
  { file: 'yt-dlp_linux', system: 'Linux (x86-64)', note: 'runs on its own' },
  { file: 'yt-dlp_linux_aarch64', system: 'Linux (ARM64)', note: 'runs on its own' },
  { file: 'yt-dlp', system: 'Any system with Python 3.10+', note: 'needs Python' },
];

/** The file for this computer, from the browser's user agent and — where Chromium reports them (its user agent says
 *  "Win64; x64" on every Windows) — the architecture ("x86", "arm") and bitness ("64", "32"). */
export function pickYtdlp(ua: string, arch = '', bitness = ''): YtdlpFile {
  const arm = /arm|aarch64/i.test(arch);
  const by = (f: string) => YTDLP_FILES.find((x) => x.file === f)!;
  if (/Windows/.test(ua)) return by(arm ? 'yt-dlp_arm64.exe' : bitness === '32' ? 'yt-dlp_x86.exe' : 'yt-dlp.exe');
  if (/Android|CrOS/.test(ua)) return by('yt-dlp');
  if (/Macintosh|Mac OS X/.test(ua)) return by('yt-dlp_macos');
  if (/Linux/.test(ua)) return by(arm || /aarch64|armv8/i.test(ua) ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux');
  return by('yt-dlp');
}

/** What else yt-dlp needs for YouTube on this kind of computer. Since November 2025 yt-dlp runs YouTube's player code
 *  with a JavaScript runtime (yt-dlp's wiki, "EJS"): Deno by default (2.3 or newer); Node 22+ or QuickJS with
 *  `--js-runtimes`. Without one it warns "No supported JavaScript runtime could be found" and YouTube often refuses the
 *  download ("HTTP error 403 Forbidden") — what the owner met on 20 Nov 2026 with Ubuntu's months-old apt package.
 *  The standalone files carry yt-dlp's solver scripts; with pip it is the "default" extra. */
export function needsHint(f: YtdlpFile): string {
  if (f.file.endsWith('.exe')) return 'For YouTube it also needs a JavaScript runtime, Deno, and ffmpeg: winget install DenoLand.Deno, then winget install Gyan.FFmpeg.';
  if (f.file === 'yt-dlp_macos') return 'For YouTube it also needs a JavaScript runtime, Deno, and ffmpeg: brew install deno, then brew install ffmpeg.';
  if (f.file.startsWith('yt-dlp_linux')) return 'For YouTube it also needs a JavaScript runtime, Deno: curl -fsSL https://deno.land/install.sh | sh — and your distribution’s ffmpeg package. Use this file rather than the yt-dlp of apt or your distribution: that one is usually months old, and YouTube refuses old versions (“HTTP error 403 Forbidden”).';
  return 'For YouTube it also needs a JavaScript runtime: Deno, or Node 22 or newer with --js-runtimes node added to the command. On Android in Termux: pkg install python ffmpeg nodejs, then pip install "yt-dlp[default]".';
}

/** What the two messages mean, said beside the command. */
export const TROUBLE_403 = '“HTTP error 403 Forbidden” or “No supported JavaScript runtime could be found”? The yt-dlp is too old or Deno is missing: YouTube changes often and refuses old versions. Get the newest yt-dlp (the button below; yt-dlp -U keeps it current — not for the copy installed by apt, which updates only with the system) and install Deno, then run the command again.';

/** How to run it once downloaded (in the Downloads folder). */
export function runHint(f: YtdlpFile): string {
  if (f.file.endsWith('.exe')) return `In a terminal (PowerShell) in your Downloads folder: .\\${f.file} "<YouTube link>" — and .\\${f.file} -U updates it later.`;
  if (f.file === 'yt-dlp') return 'In a terminal: python3 yt-dlp "<YouTube link>" (Python 3.10 or newer) — or on Android in Termux: pip install yt-dlp.';
  return `In a terminal in your Downloads folder: chmod +x ${f.file} && ./${f.file} "<YouTube link>" — and ./${f.file} -U updates it later.`;
}
