// Subnet / CIDR Calculator (#/cidr, PC only): every row checked against an independent IPv4 calculation done here with
// 32-bit integers (network = ip & mask, broadcast = network | ~mask, hosts = 2^(32−p) − 2), dotted netmask input,
// /31 and /32 rules, splitting into subnets, ranges → CIDR blocks (verified to cover exactly the range), IPv6 /64 and
// expanded form, special-range labels, bad input messages, example chips, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
const ip2n = (s) => s.split('.').reduce((a, o) => a * 256 + +o, 0), n2ip = (n) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
const calc = (ip, p) => { const a = ip2n(ip), size = 2 ** (32 - p), net = Math.floor(a / size) * size, bc = net + size - 1, mask = 2 ** 32 - size;
  return { Network: `${n2ip(net)}/${p}`, Netmask: `${n2ip(mask)}  (/${p})`, Wildcard: n2ip(size - 1), Broadcast: p >= 31 ? null : n2ip(bc), 'First usable': p >= 31 ? n2ip(net) : n2ip(net + 1), 'Last usable': p >= 31 ? n2ip(bc) : n2ip(bc - 1),
    Addresses: size.toLocaleString('en-IN'), 'Usable hosts': (p === 32 ? 1 : p === 31 ? 2 : size - 2).toLocaleString('en-IN'), Integer: String(a), Hex: `0x${a.toString(16).toUpperCase().padStart(8, '0')}` }; };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/cidr`);
  const inp = page.locator('input[aria-label=Address]'); await inp.waitFor();
  const rows = () => page.evaluate(() => { const s = [...document.querySelectorAll('.tool-body .kv')].flatMap((k) => [...k.children]).map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  const set = async (v) => { await inp.fill(v); await page.waitForTimeout(250); return rows(); };
  await page.waitForSelector('.tool-body .kv');
  const bad = [];
  for (const [ip, p] of [['192.168.1.10', 24], ['10.37.201.9', 13], ['172.16.5.4', 20], ['8.8.8.8', 32], ['203.0.113.77', 31], ['0.0.0.0', 0], ['255.255.255.255', 1], ['100.64.12.200', 10], ['198.51.100.200', 27]]) {
    const r = await set(`${ip}/${p}`), w = calc(ip, p);
    for (const [k, v] of Object.entries(w)) { const got = r[k]; if (v === null ? !/none/.test(got) : got !== v) bad.push(`${ip}/${p} ${k}: ${got} ≠ ${v}`); }
  }
  ok(!bad.length, `9 blocks: network, mask, wildcard, broadcast, first/last host, counts, integer, hex ${bad.slice(0, 6).join('; ')}`);
  let r = await set('172.16.5.4 255.255.240.0'); ok(r.Network === '172.16.0.0/20' && r.Type === 'Private (RFC 1918)', 'address + dotted netmask → /20, private');
  r = await set('192.168.1.10'); ok(r.Network === '192.168.1.10/32' && r['Usable hosts'] === '1', 'bare address = /32');
  r = await set('10.1.2.3/8'); ok(r['Reverse DNS'] === '3.2.1.10.in-addr.arpa' && r.Class === 'A' && r.Binary === '00001010.00000001.00000010.00000011', 'reverse DNS, class, binary');
  ok(await page.locator('.tool-body .card-title', { hasText: '10.1.2.3 is in 10.0.0.0/8' }).count() === 1, 'title says the address is inside the network');
  await set('192.168.0.0/24'); await page.locator('select').selectOption('26'); await page.waitForTimeout(150);
  let sub = await page.$$eval('.tool-body table tbody tr', (t) => t.map((r) => [...r.children].map((c) => c.textContent)));
  ok(JSON.stringify(sub) === JSON.stringify([0, 64, 128, 192].map((o) => [`192.168.0.${o}/26`, `192.168.0.${o + 1}`, `192.168.0.${o + 62}`, `192.168.0.${o + 63}`, '62'])), `split /24 into 4 × /26 (${sub.length} rows)`);
  ok(/^4 subnets of \/26/.test(await page.locator('.card-title', { hasText: 'subnets of' }).textContent()), 'subnet count heading');
  await set('10.0.0.0/8'); await page.locator('select').selectOption('24'); await page.waitForTimeout(150);
  ok(/65,536 subnets of \/24 \(first 1024 shown\)/.test(await page.locator('.card-title', { hasText: 'subnets of' }).textContent()) && await page.locator('.tool-body table tbody tr').count() === 1024, '65,536 /24s in a /8: first 1024 listed');
  // range: blocks must tile the range exactly
  await inp.fill('192.168.1.10 - 192.168.2.200'); await page.waitForTimeout(250);
  const blocks = (await page.locator('.cidr-blocks').textContent()).split('\n');
  let cur = ip2n('192.168.1.10'), tiled = true; for (const b of blocks) { const [a, p] = b.split('/'); if (ip2n(a) !== cur || ip2n(a) % 2 ** (32 - p)) tiled = false; cur += 2 ** (32 - p); }
  ok(tiled && cur === ip2n('192.168.2.200') + 1, `range → ${blocks.length} aligned CIDR blocks covering exactly the range`);
  r = await rows(); ok(r.Addresses === (ip2n('192.168.2.200') - ip2n('192.168.1.10') + 1).toLocaleString('en-IN'), 'range address count');
  r = await set('2001:db8:abcd:12:a:b:c:d/64');
  ok(r.Network === '2001:db8:abcd:12::/64' && r['Last address'] === '2001:db8:abcd:12:ffff:ffff:ffff:ffff' && r.Addresses === (2n ** 64n).toLocaleString('en-IN') && r.Expanded === '2001:0db8:abcd:0012:000a:000b:000c:000d' && /Documentation/.test(r.Type), 'IPv6 /64: network, last, 2^64 addresses, expanded form');
  r = await set('fe80::1'); ok(/Link-local/.test(r.Type) && r.Network === 'fe80::1/128', 'IPv6 link-local, bare = /128');
  for (const [v, msg] of [['300.1.2.3/24', /not an IPv4 or IPv6/], ['10.0.0.1/33', /too long/], ['10.0.0.1 255.0.255.0', /not a valid netmask/], ['10.0.0.9 - 10.0.0.1', /before its start/]]) {
    await inp.fill(v); await page.waitForTimeout(250); ok(msg.test(await page.locator('.tool-body .note-warn').textContent().catch(() => '')), `"${v}" → ${msg}`);
  }
  await page.locator('.chip-btn', { hasText: '100.64.0.0/10' }).click(); r = await rows();
  ok(/Carrier-grade NAT/.test(r.Type) && await inp.inputValue() === '100.64.0.0/10', 'example chip fills the box (CGNAT)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'cidr');
};
