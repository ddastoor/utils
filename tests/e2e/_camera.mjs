// A stand-in for the camera (page.addInitScript(fakeTextCamera)): getUserMedia gives a canvas stream that shows a
// sentence, so what Snap takes can be read back (OCR) or recognised. Two cameras, "cam-a" and "cam-b", each with its own
// sentence (a phone's front camera is "cam-b"; one camera with window.__oneCam). Every getUserMedia call
// (window.__gumCalls) and every track handed out (window.__tracks) is kept; window.__gumDelay = ms answers only after
// that long (the person still deciding), window.__gumError = 'NotAllowedError' | 'NotFoundError' … fails like a browser.
export const fakeTextCamera = () => {
  window.__tracks = []; window.__gumCalls = [];
  navigator.mediaDevices.getUserMedia = async (c) => {
    window.__gumCalls.push(JSON.parse(JSON.stringify(c)));
    if (window.__gumDelay) await new Promise((r) => setTimeout(r, window.__gumDelay));
    if (window.__gumError) throw new DOMException('blocked by the test', window.__gumError);
    const id = c.video?.deviceId?.exact || (c.video?.facingMode?.ideal === 'user' ? 'cam-b' : 'cam-a');
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d');
    const paint = () => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, 1280, 720); g.fillStyle = '#111'; g.font = '56px "DejaVu Serif", "Liberation Serif", serif';
      g.fillText(id === 'cam-b' ? 'The second camera shows this line.' : 'The webcam reads this sentence well.', 60, 380);
    };
    paint(); setInterval(paint, 100);
    const s = cv.captureStream(10), t = s.getVideoTracks()[0], settings = t.getSettings.bind(t);
    t.getSettings = () => ({ ...settings(), deviceId: id });
    window.__tracks.push(t);
    return s;
  };
  navigator.mediaDevices.enumerateDevices = async () => (window.__oneCam ? ['cam-a'] : ['cam-a', 'cam-b']).map((deviceId) => ({ deviceId, kind: 'videoinput', label: deviceId, groupId: deviceId }));
};
/** the camera's picture has arrived and the view is open */
export const live = (p) => p.waitForFunction(() => [...document.querySelectorAll('.live-cam')].some((b) => !b.hidden && b.querySelector('video').videoWidth > 0), null, { timeout: 15000 });
/** every track handed out so far is stopped */
export const stopped = (p) => p.evaluate(() => window.__tracks.length > 0 && window.__tracks.every((t) => t.readyState === 'ended'));
/** the camera button inside `scope` (a locator; the page when omitted): "Use webcam" on PCs, "Use camera" on phones */
export const camButton = (scope) => scope.getByRole('button', { name: /^Use (webcam|camera)$/ });
/** open the camera in `scope` and wait for its picture */
export async function openCamera(p, scope = p) {
  await camButton(scope).first().click();
  await live(p);
}
/** press Snap on the open camera */
export const snap = (p) => p.locator('.live-cam-ctl:not([hidden])').getByRole('button', { name: 'Snap' }).click();
