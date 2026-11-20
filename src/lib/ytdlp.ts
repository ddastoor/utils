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

/** How to run it once downloaded (in the Downloads folder). */
export function runHint(f: YtdlpFile): string {
  if (f.file.endsWith('.exe')) return `In a terminal (PowerShell) in your Downloads folder: .\\${f.file} "<YouTube link>" — and .\\${f.file} -U updates it later.`;
  if (f.file === 'yt-dlp') return 'In a terminal: python3 yt-dlp "<YouTube link>" (Python 3.10 or newer) — or on Android in Termux: pip install yt-dlp.';
  return `In a terminal in your Downloads folder: chmod +x ${f.file} && ./${f.file} "<YouTube link>" — and ./${f.file} -U updates it later.`;
}
