// Device tabs (src/lib/sensors.ts): the compass heading from a phone's orientation, its tilt as the screen shows it, and
// the system's name from the browser's client hints. References: geometry worked out by hand (a phone lying flat,
// turned, tilted, upright, face down), and the W3C DeviceOrientation spec's own example function for the compass
// heading of a phone held upright (the direction its back faces), copied from the spec.
export default async (t, { load }) => {
  const { headingOf, screenTilt, platformName } = await load('/src/lib/sensors.ts');
  const near = (a, b, tol = 1e-6) => Math.abs((((a - b) % 360) + 540) % 360 - 180) <= tol;
  // flat, portrait: the plain formula 360 − alpha
  let bad = [];
  for (let a = 0; a < 360; a += 7.5) { const h = headingOf(a, 0, 0, 0); if (!near(h, (360 - a) % 360)) bad.push(`${a} → ${h}`); }
  t.ok(!bad.length, `flat in portrait: heading = 360 − alpha for 48 alphas ${bad.join(', ')}`);
  t.eq(headingOf(112.5, 0, 0, 0), 247.5, 'alpha 112.5 → exactly 247.5 (no 247.49999999999997, which rounds to 247° SW)');
  t.eq(headingOf(0, 0, 0, 0), 0, 'alpha 0 → 0 (not −0 or 360)');
  // flat, landscape: the screen's top is a side of the phone
  bad = [];
  for (const th of [90, 180, 270]) for (let a = 0; a < 360; a += 15) { const h = headingOf(a, 0, 0, th); if (!near(h, (720 - a + th) % 360)) bad.push(`θ ${th}, α ${a} → ${h}`); }
  t.ok(!bad.length, `flat, screen turned 90 / 180 / 270°: heading = 360 − alpha + angle ${bad.slice(0, 5).join(', ')}`);
  // tilted (not beyond 60° from flat): the top edge's heading does not depend on beta or gamma (rotating about its own axis)
  bad = [];
  for (const b of [-55, -30, -10, 10, 30, 55]) for (const g of [-60, -25, 0, 25, 60]) for (const a of [0, 45, 200, 333]) { const h = headingOf(a, b, g, 0); if (!near(h, (360 - a) % 360, 1e-6)) bad.push(`α ${a} β ${b} γ ${g} → ${h}`); }
  t.ok(!bad.length, `tilted forward / back up to 55° and sideways up to 60°: still where the top points (360 − alpha) ${bad.slice(0, 5).join(', ')}`);
  // face down: the top points the other way
  t.ok(near(headingOf(30, 180, 0, 0), 150), `face down (beta 180): 180 − alpha (${headingOf(30, 180, 0, 0)})`);
  // upright: where the back looks — the W3C spec's example (DeviceOrientation Event Specification, "compassHeading")
  const w3c = (alpha, beta, gamma) => {
    const degtorad = Math.PI / 180, _x = beta ? beta * degtorad : 0, _y = gamma ? gamma * degtorad : 0, _z = alpha ? alpha * degtorad : 0;
    const cX = Math.cos(_x), cY = Math.cos(_y), cZ = Math.cos(_z), sX = Math.sin(_x), sY = Math.sin(_y), sZ = Math.sin(_z);
    const Vx = -cZ * sY - sZ * sX * cY, Vy = -sZ * sY + cZ * sX * cY;
    let compassHeading = Math.atan(Vx / Vy);
    if (Vy < 0) compassHeading += Math.PI; else if (Vx < 0) compassHeading += 2 * Math.PI;
    return compassHeading * (180 / Math.PI);
  };
  bad = [];
  for (const b of [61, 70, 80, 90, 100, 115]) for (const g of [-20, -5, 0, 5, 20]) for (const a of [0, 10, 95, 180, 271, 359]) {
    const h = headingOf(a, b, g, 0), w = w3c(a, b, g); if (!near(h, w, 1e-6)) bad.push(`α ${a} β ${b} γ ${g}: ${h} ≠ ${w}`);
  }
  t.ok(!bad.length, `held upright (beta 61 – 115°): the back's heading, as the W3C spec's example computes it ${bad.slice(0, 4).join('; ')}`);
  t.ok(near(headingOf(30, 90, 20, 0), 310), `upright with gamma 20: 360 − alpha − gamma = 310 (the plain formula said 330) (${headingOf(30, 90, 20, 0)})`);
  // standing on its side in landscape (the phone's right side up: gamma −90): where the back looks. Flat with alpha 30, the
  // phone's right side points to 60°; turned up about its long axis, the back now faces that way.
  t.ok(near(headingOf(30, 0, -90, 90), 60), `upright in landscape: the back's heading, 60° (${headingOf(30, 0, -90, 90)})`);
  // tilt as the screen shows it
  const T = [[0, 3, 7, 7, 3], [90, 3, 7, 3, -7], [180, 3, 7, -7, -3], [270, 3, 7, -3, 7]];
  for (const [th, b, g, r, tp] of T) { const s = screenTilt(b, g, th); t.ok(Math.abs(s.right - r) < 1e-9 && Math.abs(s.top - tp) < 1e-9, `screen ${th}°: beta ${b}, gamma ${g} → right side lower by ${s.right}, top higher by ${s.top} (want ${r}, ${tp})`); }
  t.ok(screenTilt(-2.5, 1.25, 0).right === 1.25 && screenTilt(-2.5, 1.25, 0).top === -2.5, 'portrait: the readings exactly as the sensor gives them');
  // client hints
  const P = [['Windows', '15.0.0', 'Windows 11'], ['Windows', '13.0.0', 'Windows 11'], ['Windows', '10.0.0', 'Windows 10'], ['Windows', '1.0.0', 'Windows 10'], ['Windows', '0.3.0', 'Windows 7, 8 or 8.1'],
    ['Windows', '', 'Windows'], ['macOS', '14.5.0', 'macOS 14.5'], ['Android', '14.0.0', 'Android 14'], ['Linux', '', 'Linux'], ['Chrome OS', '16093.68.0', 'Chrome OS 16093.68'], ['', '1.0', '']];
  for (const [p, v, want] of P) t.eq(platformName(p, v), want, `${p || '(none)'} ${v || '(no version)'} → ${want || '(nothing)'}`);
};
