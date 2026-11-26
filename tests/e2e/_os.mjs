// The system a test page believes it runs on — its user agent AND its client hints and navigator.platform (CDP):
// Playwright's userAgent option alone leaves navigator.userAgentData and navigator.platform saying what the machine
// is. The suites run in this Linux sandbox and on GitHub's Windows runner (the Windows check, to-do #13), so a check
// that means "Linux" or "Windows" sets it, whichever machine runs it (on the Windows runner every "Linux" check saw
// Windows: yt-dlp.exe offered, no X11 / Wayland note, Windows' file names).
export const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const meta = (platform, platformVersion) => ({
  brands: [{ brand: 'Google Chrome', version: '141' }, { brand: 'Chromium', version: '141' }, { brand: 'Not?A_Brand', version: '24' }],
  fullVersionList: [{ brand: 'Google Chrome', version: '141.0.7390.55' }, { brand: 'Chromium', version: '141.0.7390.55' }],
  fullVersion: '141.0.7390.55', platform, platformVersion, architecture: 'x86', model: '', mobile: false, bitness: '64', wow64: false,
});
export const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const WIN_META = meta('Windows', '15.0.0');
export const LINUX_META = meta('Linux', '6.8.0');
export const MAC_META = meta('macOS', '15.0.0');
/** Make `page` (before it navigates) believe it runs on Windows, on Linux (x86-64) or on a Mac. */
export async function asOS(page, os) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setUserAgentOverride', os === 'windows'
    ? { userAgent: WIN_UA, platform: 'Win32', userAgentMetadata: WIN_META }
    : os === 'mac' ? { userAgent: MAC_UA, platform: 'MacIntel', userAgentMetadata: MAC_META }
      : { userAgent: LINUX_UA, platform: 'Linux x86_64', userAgentMetadata: LINUX_META });
}
