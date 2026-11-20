// Fake camera / microphone for the Device suites (addInitScript). getUserMedia is replaced:
//  video → a 640×480 canvas stream, left half red, right half blue (so mirroring can be checked in a snapshot);
//  audio → a Web Audio oscillator (window.__osc, window.__gain; frequency/amplitude set by the test).
// Every track handed out is kept in window.__tracks (to check they are stopped when the tab is left).
// window.__gumError = 'NotAllowedError' | 'NotFoundError' makes the next calls fail like a real browser;
// window.__gumDelay = ms answers only after that long (a permission question still open).
export const fakeMedia = ({ freq = 440, amp = 0.5 } = {}) => {
  window.__tracks = []; window.__gumCalls = [];
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    window.__gumCalls.push(JSON.parse(JSON.stringify(c)));
    if (window.__gumDelay) await new Promise((r) => setTimeout(r, window.__gumDelay)); // the browser still asking the person
    if (window.__gumError) throw new DOMException('blocked by the test', window.__gumError);
    if (window.__realGum) { const s = await real(c); window.__tracks.push(...s.getTracks()); return s; }
    const out = new MediaStream();
    if (c.video) {
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const g = cv.getContext('2d');
      const paint = () => { g.fillStyle = '#ff0000'; g.fillRect(0, 0, 320, 480); g.fillStyle = '#0000ff'; g.fillRect(320, 0, 320, 480); };
      paint(); setInterval(paint, 50);
      cv.captureStream(20).getVideoTracks().forEach((t) => out.addTrack(t));
    }
    if (c.audio) {
      const ac = new AudioContext(); ac.__fake = true; await ac.resume();
      const o = ac.createOscillator(), g = ac.createGain(), d = ac.createMediaStreamDestination();
      o.frequency.value = window.__freq ?? freq; g.gain.value = window.__amp ?? amp; o.connect(g).connect(d); o.start();
      window.__osc = o; window.__gain = g; window.__fakeAc = ac;
      d.stream.getAudioTracks().forEach((t) => out.addTrack(t));
    }
    window.__tracks.push(...out.getTracks());
    return out;
  };
};
/** all tracks handed out so far are stopped */
export const allStopped = (page) => page.evaluate(() => window.__tracks.length > 0 && window.__tracks.every((t) => t.readyState === 'ended'));
/** keep every AudioContext the page creates in window.__acs (to check the tab closes its own) */
export const trackAudioContexts = () => {
  const A = window.AudioContext; window.__acs = [];
  window.AudioContext = class extends A { constructor(...a) { super(...a); window.__acs.push(this); } };
};
