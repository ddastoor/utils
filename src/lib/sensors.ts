// Phone sensors and the browser's client hints, worked out for the Device tabs (no DOM: the unit suite runs this in Node).

/** The compass heading (0 – 360°, clockwise from north) of the way the phone points, from its absolute orientation
 *  (W3C DeviceOrientation: alpha, beta, gamma = rotations Z-X'-Y'' from east-north-up). Lying flat or tilted it is where
 *  the top of the screen points — in landscape the screen's top is a side of the phone (`angle`); held upright (within
 *  30°) it is where the back camera looks, the top then pointing at the sky. The formula 360 − alpha it replaces is right
 *  only for a phone lying flat in portrait. */
export function headingOf(alpha: number, beta: number, gamma: number, angle = 0): number | null {
  const r = Math.PI / 180, cZ = Math.cos(alpha * r), sZ = Math.sin(alpha * r), cX = Math.cos(beta * r), sX = Math.sin(beta * r), cY = Math.cos(gamma * r), sY = Math.sin(gamma * r);
  // east and north parts of the phone's x (right), y (top) and z (out of the screen) axes
  const xe = cZ * cY - sZ * sX * sY, xn = sZ * cY + cZ * sX * sY, ye = -sZ * cX, yn = cZ * cX, ze = cZ * sY + sZ * sX * cY, zn = sZ * sY - cZ * sX * cY;
  const t = angle * r;
  let e = Math.sin(t) * xe + Math.cos(t) * ye, n = Math.sin(t) * xn + Math.cos(t) * yn; // the top of the screen
  if (Math.hypot(e, n) < 0.5) { e = -ze; n = -zn; } // upright: the back
  if (Math.hypot(e, n) < 1e-6) return null;
  const d = ((Math.atan2(e, n) / r) % 360 + 360) % 360;
  return (Math.round(d * 1e9) / 1e9) % 360; // without the last bits of the trigonometry: 247.5° must not read 247.49999999999997 (247° SW)
}

/** A phone's tilt (W3C DeviceOrientation beta = front-to-back, gamma = left-to-right, in degrees, after calibration) as
 *  the screen shows it: `right` = how far the screen's right side is lower, `top` = how far its top edge is higher. In
 *  landscape the phone's sides are the screen's top and bottom (`angle` 90 = turned counter-clockwise). */
export function screenTilt(beta: number, gamma: number, angle = 0): { right: number; top: number } {
  const t = (angle * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), r = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  return { right: r(gamma * c + beta * s), top: r(beta * c - gamma * s) };
}

/** The system a browser's client hints name, in the words people use. Windows reports its own version numbers: 13 and
 *  above is Windows 11, 1 – 10 Windows 10, 0 Windows 7, 8 or 8.1 (Microsoft's guidance for client hints) — "Windows 15.0.0"
 *  was shown on Windows 11. */
export function platformName(p: string, v: string): string {
  if (!p) return '';
  const major = parseInt(v, 10), short = (v || '').replace(/(\.0)+$/, '');
  if (p === 'Windows') return !Number.isFinite(major) ? 'Windows' : major >= 13 ? 'Windows 11' : major >= 1 ? 'Windows 10' : 'Windows 7, 8 or 8.1';
  return short ? `${p} ${short}` : p;
}
