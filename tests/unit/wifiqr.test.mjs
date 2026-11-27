// src/lib/wifilabel.ts — Wi-Fi QR from a Router Sticker (potentials #88): the network names and the password a router's label
// prints, read from the OCR's lines; what is not the Wi-Fi password (the router's own login, a WPS PIN) set aside; a QR code on
// the label read exactly. Known answers on label wording as routers print it, the WIFI: form against ZXing's rules, and the test
// photos of tests/fixtures/snaps (scripts/make-snap-photos.py) through the tabs' own reading path in Node (tests/lib/snapread.mjs)
// — every network and password as printed, nothing else taken for them.
import { readFileSync } from 'node:fs';
import { snapReader } from '../lib/snapread.mjs';

export default async (t, ctx) => {
  const W = await ctx.load('/src/lib/wifilabel.ts');
  const { linesOf, SNAP_READ } = await ctx.load('/src/lib/snaptext.ts');
  const Q = await ctx.load('/src/lib/qrdata.ts');
  const nets = (lines, codes) => W.readLabel(lines, codes).nets.map((n) => [n.ssid, n.password, n.band, n.sec].join(' · '));

  // ---- label wording, as routers print it (a tab or three spaces: parts of a line set apart)
  const cases = [
    ['SSID / Wireless Password/PIN, admin address', ['Default Access: http://tplinkwifi.net', 'SSID: TP-Link_7A3F', 'Wireless Password/PIN: 12345670', 'MAC: 5C-A6-E6-12-7A-3F'], ['TP-Link_7A3F · 12345670 ·  · WPA']],
    ['two bands, one password', ['SSID (2.4G): TP-Link_7A3F', 'SSID (5G): TP-Link_7A3F_5G', 'Wireless Password/PIN: 12345670'], ['TP-Link_7A3F · 12345670 · 2.4 · WPA', 'TP-Link_7A3F_5G · 12345670 · 5 · WPA']],
    ['two bands, a password each', ['Wi-Fi Name (2.4GHz): Home-24', 'Wi-Fi Password (2.4GHz): alpha1234', 'Wi-Fi Name (5GHz): Home-5', 'Wi-Fi Password (5GHz): beta56789'], ['Home-24 · alpha1234 · 2.4 · WPA', 'Home-5 · beta56789 · 5 · WPA']],
    ['band before the key', ['2.4G SSID: Fast_24', '5G SSID: Fast_5', 'WPA Key: f4stp4ss!'], ['Fast_24 · f4stp4ss! · 2.4 · WPA', 'Fast_5 · f4stp4ss! · 5 · WPA']],
    ['Network Name (SSID) / Network Key (Password), a login set aside', ['Network Name (SSID): ORBITAL42', 'Network Key (Password): quickbird512', 'Router Login: http://routerlogin.net', 'User Name: admin\tPassword: password', 'WPS PIN: 31948627'], ['ORBITAL42 · quickbird512 ·  · WPA']],
    ['WLAN Name / WLAN Key on one line', ['WLAN Name: HUAWEI-B2C1   WLAN Key: 9qR4mT2w', 'Web Address: 192.168.3.1'], ['HUAWEI-B2C1 · 9qR4mT2w ·  · WPA']],
    ['WiFi Network Name (SSID) with a bracketed qualifier', ['WiFi Network Name (SSID): NETGEAR12', 'Network Key (Password): smoothrabbit417'], ['NETGEAR12 · smoothrabbit417 ·  · WPA']],
    ['Default SSID: — a key after a word, with its colon', ['Default SSID: ASUS_A8_2G', 'Default Wi-Fi Password: purplefox99'], ['ASUS_A8_2G · purplefox99 ·  · WPA']],
    ['a plain "Password" under the network: the Wi-Fi password; the admin block after it set aside', ['SSID: JioFiber-qx29', 'Password: kT7mq2Vr9w', 'Admin Username: admin', 'Admin Password: Fiber@2026'], ['JioFiber-qx29 · kT7mq2Vr9w ·  · WPA']],
    ['a plain "Password" under "Username": the login, not the Wi-Fi', ['Username: admin', 'Password: admin', 'SSID: OfficeNet', 'WPA Key: sunrise2026'], ['OfficeNet · sunrise2026 ·  · WPA']],
    ['a key whose value stands apart (a label set as a table)', ['SSID\tAirtel_Zerotouch', 'Wi-Fi Password\tair12345'], ['Airtel_Zerotouch · air12345 ·  · WPA']],
    ['a WEP key', ['SSID: oldnet', 'WEP Key: 1A2B3C4D5E'], ['oldnet · 1A2B3C4D5E ·  · WEP']],
    ['a network without a password printed', ['SSID: CafeGuest'], ['CafeGuest ·  ·  · nopass']],
    ['a password without the name', ['Wi-Fi Key: onlythekey1'], [' · onlythekey1 ·  · WPA']],
    ['no colon, the OCR ran the colon away', ['SSID HomeNet', 'Password homepass99'], ['HomeNet · homepass99 ·  · WPA']],
    ['nothing of Wi-Fi on the label', ['Model: X200', 'Power: 12V 1A', 'Made in India'], []],
  ];
  for (const [name, lines, want] of cases) t.eq(nets(lines), want, `label: ${name}`);
  const sk = W.readLabel(['Network Name (SSID): ORBITAL42', 'Network Key (Password): quickbird512', 'Router Login: http://routerlogin.net', 'User Name: admin\tPassword: password', 'WPS PIN: 31948627']).skipped;
  t.eq(sk.map((x) => x.value), ['http://routerlogin.net', 'admin', 'password', '31948627'], 'set aside: the settings page, the login name, the login password, the WPS PIN');
  t.ok(/settings page/.test(sk[0].what) && /login name/.test(sk[1].what) && /login password/.test(sk[2].what) && /WPS PIN/.test(sk[3].what), 'each said for what it is');

  // ---- the WIFI: form, as ZXing writes it (the QR tab's writer) and reads it back
  const qr = (o) => W.wifiFromQr(Q.wifi(o).text);
  for (const o of [{ ssid: 'Home', pass: 'p4ss;word:"x"', sec: 'WPA', hidden: false }, { ssid: 'a;b,c\\d', pass: 'k\\e;y', sec: 'WPA', hidden: true }, { ssid: 'Old', pass: '12345', sec: 'WEP', hidden: false }, { ssid: 'Open Cafe', pass: '', sec: 'none', hidden: false }]) {
    const n = qr(o);
    t.ok(n && n.ssid === o.ssid && n.password === (o.sec === 'none' ? '' : o.pass) && n.sec === (o.sec === 'none' ? 'nopass' : o.sec) && n.hidden === o.hidden, `WIFI: round trip through the QR tab's writer — ${JSON.stringify(o)}`);
  }
  t.eq(W.wifiFromQr('WIFI:S:Lab;T:WPA;P:secret12;;')?.password, 'secret12', 'WIFI: fields in any order');
  t.eq(W.wifiFromQr('https://example.com'), null, 'not a WIFI: code');
  const both = W.readLabel(['WLAN Name: AirNet-K3P9', 'WLAN Key: 6hgk2mtr', 'WLAN Name (5G): AirNet-K3P9-5G'], ['WIFI:T:WPA;S:AirNet-K3P9;P:6hgk2mtr;;']).nets;
  t.ok(both.length === 2 && both[0].from === 'qr' && both[0].ssidLine === 0 && both[1].ssid === 'AirNet-K3P9-5G' && both[1].from === 'label', 'the QR code and the label agree: one network from the QR (its lines found on the label), the 5 GHz one from the label');

  // ---- what to look at again, and a password a phone would refuse
  t.eq(W.lookalikes('kT7mq2Vr9w'), ['2 and Z', '9, g and q', 'rn and m', 'vv and w'], 'characters the OCR may have confused, in a password');
  t.eq(W.lookalikes('ACEFHJKNPRTXY'), [], 'none in a password without them');
  t.ok(/7 characters/.test(W.passwordProblem('abc1234', 'WPA')) && !W.passwordProblem('abcd1234', 'WPA') && !W.passwordProblem('a'.repeat(64).replace(/a/g, 'f'), 'WPA') && !W.passwordProblem('abc', 'WEP'), 'a WPA password of 8 – 63 characters (or 64 hex digits)');

  // ---- the test photos, read as the tab reads them
  const dir = new URL('../fixtures/snaps/', import.meta.url).pathname, truth = JSON.parse(readFileSync(dir + 'truth.json', 'utf8'));
  const S = await snapReader(ctx);
  try {
    for (const name of ['router-a', 'router-a-sideways', 'router-b', 'router-c', 'router-d']) {
      const img = S.decode(dir + name + '.jpg');
      const r = await S.read(img, SNAP_READ), L = linesOf(r.r), got = W.readLabel(L, await S.codes(img));
      const want = truth[name];
      const pairs = got.nets.map((n) => `${n.ssid} / ${n.password}`).sort(), wantPairs = want.networks.map((n) => `${n.ssid} / ${n.password}`).sort();
      t.eq(pairs, wantPairs, `${name}: the networks and their password as printed`);
      const values = got.nets.flatMap((n) => [n.ssid, n.password]);
      t.ok(!(want.not || []).some((v) => values.includes(v)), `${name}: nothing else taken for a name or a password (${(want.not || []).join(', ') || '—'})`);
      if (want.qr) t.ok(got.nets.some((n) => n.from === 'qr'), `${name}: the label's QR code read`);
    }
    t.ok(true, 'the reading path closed');
  } finally { await S.close(); }
};
