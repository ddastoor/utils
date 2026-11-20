// "Download latest yt-dlp" (src/lib/ytdlp.ts): the file for each system, the links, the run hints.
export default async (t, { load }) => {
  const Y = await load('/src/lib/ytdlp.ts');
  const UA = {
    win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    linuxArm: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    cros: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  };
  const pick = (ua, a, b) => Y.pickYtdlp(ua, a, b).file;
  t.eq(pick(UA.win), 'yt-dlp.exe', 'Windows → yt-dlp.exe');
  t.eq(pick(UA.win, 'x86', '64'), 'yt-dlp.exe', 'Windows x86-64 (Chromium\'s architecture) → yt-dlp.exe');
  t.eq(pick(UA.win, 'arm', '64'), 'yt-dlp_arm64.exe', 'Windows on ARM → yt-dlp_arm64.exe');
  t.eq(pick(UA.win, 'x86', '32'), 'yt-dlp_x86.exe', '32-bit Windows → yt-dlp_x86.exe');
  t.eq(pick(UA.firefoxWin), 'yt-dlp.exe', 'Firefox on Windows → yt-dlp.exe');
  t.eq(pick(UA.mac), 'yt-dlp_macos', 'macOS → yt-dlp_macos');
  t.eq(pick(UA.mac, 'arm', '64'), 'yt-dlp_macos', 'Apple silicon → yt-dlp_macos (universal)');
  t.eq(pick(UA.linux), 'yt-dlp_linux', 'Linux x86-64 → yt-dlp_linux');
  t.eq(pick(UA.linux, 'arm', '64'), 'yt-dlp_linux_aarch64', 'Linux ARM (Chromium\'s architecture) → yt-dlp_linux_aarch64');
  t.eq(pick(UA.linuxArm), 'yt-dlp_linux_aarch64', 'Linux aarch64 user agent → yt-dlp_linux_aarch64');
  t.eq(pick(UA.android), 'yt-dlp', 'Android → the Python zipapp (Termux)');
  t.eq(pick(UA.cros), 'yt-dlp', 'ChromeOS → the Python zipapp (Linux container)');
  t.eq(pick('something else'), 'yt-dlp', 'unknown → the Python zipapp');
  t.eq(Y.ytdlpUrl('yt-dlp.exe'), 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', 'the "latest" address on GitHub');
  t.eq(Y.YTDLP_FILES.map((f) => f.file), ['yt-dlp.exe', 'yt-dlp_arm64.exe', 'yt-dlp_x86.exe', 'yt-dlp_macos', 'yt-dlp_linux', 'yt-dlp_linux_aarch64', 'yt-dlp'], 'every file of a release, once');
  t.ok(Y.YTDLP_FILES.every((f) => /^https:\/\/github\.com\/yt-dlp\/yt-dlp\/releases\/latest\/download\/[\w.-]+$/.test(Y.ytdlpUrl(f.file))), 'every link is GitHub\'s latest-release address');
  t.eq(Y.runHint(Y.pickYtdlp(UA.win)), 'In a terminal (PowerShell) in your Downloads folder: .\\yt-dlp.exe "<YouTube link>" — and .\\yt-dlp.exe -U updates it later.', 'Windows run hint');
  t.eq(Y.runHint(Y.pickYtdlp(UA.linux)), 'In a terminal in your Downloads folder: chmod +x yt-dlp_linux && ./yt-dlp_linux "<YouTube link>" — and ./yt-dlp_linux -U updates it later.', 'Linux run hint (chmod first)');
  t.ok(/python3 yt-dlp/.test(Y.runHint(Y.pickYtdlp(UA.android))), 'zipapp run hint');

  // What else yt-dlp needs for YouTube. Owner, 20 Nov 2026: Ubuntu's yt-dlp (apt, 2026.03.17) without a JavaScript
  // runtime warned "No supported JavaScript runtime could be found" and the download failed with "HTTP error 403
  // Forbidden" — the tab had said nothing about either. Since November 2025 yt-dlp runs YouTube's player code with a
  // JavaScript runtime: Deno by default (2.3 or newer), Node 22+ or QuickJS with --js-runtimes (yt-dlp's EJS wiki).
  const need = (ua) => Y.needsHint(Y.pickYtdlp(ua));
  t.ok(/winget install DenoLand\.Deno/.test(need(UA.win)) && /Gyan\.FFmpeg/.test(need(UA.win)), `Windows: Deno and ffmpeg by winget (${need(UA.win)})`);
  t.ok(/brew install deno/.test(need(UA.mac)) && /brew install ffmpeg/.test(need(UA.mac)), `macOS: Deno and ffmpeg by Homebrew (${need(UA.mac)})`);
  t.ok(/curl -fsSL https:\/\/deno\.land\/install\.sh \| sh/.test(need(UA.linux)), `Linux: Deno's own installer (${need(UA.linux)})`);
  t.ok(/apt/.test(need(UA.linux)) && /403/.test(need(UA.linux)), 'Linux: why the yt-dlp of apt will not do (months old; YouTube answers 403)');
  t.eq(need(UA.linuxArm), need(UA.linux), 'Linux ARM: the same advice');
  t.ok(/--js-runtimes node/.test(need(UA.android)) && /pkg install python ffmpeg nodejs/.test(need(UA.android)) && /yt-dlp\[default\]/.test(need(UA.android)), `Android (Termux): Node with --js-runtimes node, and yt-dlp with its solver (${need(UA.android)})`);
  t.ok(Y.YTDLP_FILES.every((f) => /JavaScript runtime/.test(Y.needsHint(f))), 'every system is told that YouTube needs a JavaScript runtime');
  t.ok(/403/.test(Y.TROUBLE_403) && /yt-dlp -U/.test(Y.TROUBLE_403) && /Deno/.test(Y.TROUBLE_403) && /No supported JavaScript runtime/.test(Y.TROUBLE_403), 'what "HTTP Error 403" and "No supported JavaScript runtime" mean, in words');
};
