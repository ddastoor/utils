// Subnet / CIDR Calculator (#/cidr, PC only): every row checked against an independent IPv4 calculation done here with
// 32-bit integers (network = ip & mask, broadcast = network | ~mask, hosts = 2^(32−p) − 2), dotted netmask input,
// /31 and /32 rules, splitting into subnets, ranges → CIDR blocks (verified to cover exactly the range), IPv6 /64 and
// expanded form, special-range labels, bad input messages, example chips; rows, ranges and subnet tables compared with
// Python's ipaddress module (tests/fixtures/cidr/reference.json); wildcard masks, zones, brackets, "a to b"; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { readFileSync } from 'node:fs';
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
  // ---- bug hunt, Nov 2026: more forms of input, every row compared with Python's ipaddress fixture, splits, chips
  const REF = JSON.parse(readFileSync(new URL('../fixtures/cidr/reference.json', import.meta.url), 'utf8'));
  const grp = (v) => BigInt(v).toLocaleString('en-IN'), wrong = [];
  for (const w of REF.v4.filter((_, i) => i % 4 === 0)) {
    r = await set(w.in);
    const want = { Network: w.cidr, Netmask: `${w.netmask}  (/${w.cidr.split('/')[1]})`, Wildcard: w.wildcard, 'First usable': w.first, 'Last usable': w.last, Addresses: grp(w.total), 'Usable hosts': grp(w.usable), Integer: w.integer, 'Reverse DNS': w.reverse };
    for (const [k, v] of Object.entries(want)) if (r[k] !== v) wrong.push(`${w.in} ${k}: ${r[k]} ≠ ${v}`);
    if (w.broadcast === null ? !/none/.test(r.Broadcast) : r.Broadcast !== w.broadcast) wrong.push(`${w.in} Broadcast: ${r.Broadcast}`);
  }
  ok(!wrong.length, `${Math.ceil(REF.v4.length / 4)} IPv4 blocks on the page = Python ipaddress (network, masks, broadcast, hosts, counts with Indian grouping, PTR) ${wrong.slice(0, 4).join(' | ')}`);
  wrong.length = 0;
  for (const w of REF.v6.filter((_, i) => i % 4 === 0)) {
    r = await set(w.in); const want = { Network: w.cidr, Prefix: `/${w.cidr.split('/')[1]}`, 'First address': w.first, 'Last address': w.last, Addresses: grp(w.total), Compressed: w.address, 'Reverse DNS': w.reverse };
    for (const [k, v] of Object.entries(want)) if (r[k] !== v) wrong.push(`${w.in} ${k}: ${r[k]} ≠ ${v}`);
  }
  ok(!wrong.length, `${Math.ceil(REF.v6.length / 4)} IPv6 blocks on the page = Python ipaddress (network, first/last, 2^n with digit grouping, short form, ip6.arpa) ${wrong.slice(0, 4).join(' | ')}`);
  wrong.length = 0;
  for (const w of REF.ranges.filter((_, i) => i % 6 === 0)) {
    await inp.fill(`${w.a} - ${w.b}`); await page.waitForTimeout(250); r = await rows();
    const bl = (await page.locator('.cidr-blocks').textContent()).split('\n');
    if (JSON.stringify(bl) !== JSON.stringify(w.blocks) || r.Addresses !== grp(w.total) || r['CIDR blocks'] !== String(w.blocks.length)) wrong.push(`${w.a} - ${w.b}`);
  }
  ok(!wrong.length, `ranges on the page (IPv4 + IPv6, incl. 0.0.0.0 – 255.255.255.255 = one /0) = ipaddress.summarize_address_range ${wrong.join(' | ')}`);
  r = await set('10.1.2.3 0.0.0.255'); ok(r.Network === '10.1.2.0/24' && r.Wildcard === '0.0.0.255', 'wildcard mask (0.0.0.255) accepted as /24');
  r = await set('fe80::a00:27ff:fe4e:66a1%eth0/64'); ok(r.Network === 'fe80::/64' && /Link-local/.test(r.Type), 'IPv6 with a zone (%eth0), as "ip a" prints it');
  r = await set('[2001:db8::1]/48'); ok(r.Network === '2001:db8::/48', 'bracketed IPv6');
  r = await set('::ffff:192.0.2.128'); ok(r['Embedded IPv4'] === '192.0.2.128' && /IPv4-mapped/.test(r.Type), 'IPv4-mapped IPv6 shows the embedded IPv4 address');
  r = await set('10.0.0.1'); ok(r['IPv4-mapped IPv6'] === '::ffff:10.0.0.1' && !('Embedded IPv4' in r), 'IPv4 → its IPv4-mapped IPv6 form');
  // the result title of a range can be pasted back (it uses an en dash)
  await inp.fill('192.168.1.10 - 192.168.1.20'); await page.waitForTimeout(250);
  const title = (await page.locator('.tool-body .card-title', { hasText: 'Range' }).textContent()).replace(/^Range /, '');
  await inp.fill(title); await page.waitForTimeout(250); ok(/–/.test(title) && (await page.locator('.cidr-blocks').textContent()).split('\n').length === 4 && (await rows()).Addresses === '11', `the range as the title prints it ("${title}") is read back`);
  ok(await page.locator('select').isDisabled() && (await page.locator('select option').count()) === 1, 'a range cannot be split: the split choice is switched off (it used to stay active and do nothing)');
  await inp.fill('2001:db8::1-2001:db8::9'); await page.waitForTimeout(250); ok((await page.locator('.cidr-blocks').textContent()).split('\n').join() === '2001:db8::1/128,2001:db8::2/127,2001:db8::4/126,2001:db8::8/127' && (await rows()).Addresses === '9', 'IPv6 range written with a bare dash');
  await inp.fill('10.0.0.0/24'); await page.waitForTimeout(250); ok(await page.locator('select').isEnabled() && (await page.locator('select option').count()) === 9, 'back to a block: the split choice is on again');
  await inp.fill('10.0.0.1 to 10.0.0.4'); await page.waitForTimeout(250); ok((await page.locator('.cidr-blocks').textContent()) === '10.0.0.1/32\n10.0.0.2/31\n10.0.0.4/32', '"a to b" works as a range');
  // splits: options offered, IPv6, /31 and /32 rows, selection kept or dropped sensibly
  await set('192.168.4.0/22'); const sel = page.locator('select');
  const opts = await sel.locator('option').allTextContents();
  ok(opts.length === 11 && opts[0] === 'Don’t split' && opts[1] === '/23 (2 subnets)' && opts[10] === '/32 (1,024 subnets)', `split choices for a /22: /23 … /32 (${opts.length - 1})`);
  for (const w of REF.splits.filter((x) => +x.count <= 1024 && +x.split - +x.in.split('/')[1] <= 16)) {
    await set(w.in); await sel.selectOption(String(w.split)); await page.waitForTimeout(200);
    const tb = await page.$$eval('.tool-body table tbody tr', (t) => t.map((x) => [...x.children].map((c) => c.textContent)));
    const okList = JSON.stringify(tb.map((x) => x[0])) === JSON.stringify(w.list) && (!w.firstLast || JSON.stringify(tb.map((x) => [x[1], x[2]])) === JSON.stringify(w.firstLast));
    if (!okList || !(await page.locator('.card-title', { hasText: 'subnets of' }).textContent()).startsWith(`${grp(w.count)} subnets of /${w.split}`)) wrong.push(`${w.in} → /${w.split}`);
  }
  ok(!wrong.length, `subnet tables for ${REF.splits.length} splits (IPv4 to /31 and /32, IPv6 to /128) = Python ipaddress ${wrong.join(' | ')}`);
  await set('203.0.113.0/24'); await sel.selectOption('31'); await page.waitForTimeout(200);
  let tb = await page.$$eval('.tool-body table tbody tr', (t) => t.slice(0, 2).map((x) => [...x.children].map((c) => c.textContent)));
  ok(JSON.stringify(tb) === JSON.stringify([['203.0.113.0/31', '203.0.113.0', '203.0.113.1', '—', '2'], ['203.0.113.2/31', '203.0.113.2', '203.0.113.3', '—', '2']]), '/31 subnets: both addresses usable, no broadcast');
  await set('192.168.0.0/24'); await sel.selectOption('26'); await page.waitForTimeout(150); await set('192.168.7.0/24');
  ok(await sel.inputValue() === '26' && await page.locator('.tool-body table tbody tr').count() === 4 && (await page.locator('.tool-body table tbody tr').first().textContent()).startsWith('192.168.7.0/26'), 'changing the address keeps the chosen split');
  await set('2001:db8::/64'); ok(await sel.inputValue() === '' && await page.locator('.tool-body table').count() === 0, 'a split that no longer fits (IPv4 /26 → IPv6 /64) is dropped');
  await sel.selectOption('66'); await page.waitForTimeout(200); tb = await page.$$eval('.tool-body table tbody tr', (t) => t.map((x) => x.children[0].textContent));
  ok(JSON.stringify(tb) === JSON.stringify(['2001:db8::/66', '2001:db8:0:0:4000::/66', '2001:db8:0:0:8000::/66', '2001:db8:0:0:c000::/66']), `IPv6 /64 split into four /66 (${tb[1]})`);
  await set('10.0.0.5/32'); ok((await sel.locator('option').count()) === 1, 'a /32 cannot be split: only "Don’t split"');
  // messages for more kinds of bad input; the previous result is not left on screen
  for (const [v, msg] of [['10.0.0.1/', /prefix length after the \/ is missing/], ['/24', /address before the \/ is missing/], ['example.com', /not an IPv4 or IPv6/], ['2001:db8::/129', /max \/128/], ['10.0.0.1 - 2001:db8::1', /same IP version/], ['192.168.001.010', /not an IPv4/]]) {
    await inp.fill(v); await page.waitForTimeout(250); if (!msg.test(await page.locator('.tool-body .note-warn').textContent().catch(() => '')) || await page.locator('.tool-body .kv').count()) wrong.push(v);
  }
  ok(!wrong.length, `six more kinds of bad input each get a plain message and no stale result ${wrong.join(' | ')}`);
  await inp.fill(''); await page.waitForTimeout(250); ok(/Enter an address/.test(await page.locator('.tool-body .note-info').first().textContent()), 'empty box → prompt');
  const chipsAll = await page.locator('.chip-btn').allTextContents(); const chipBad = [];
  for (const c of chipsAll) { await page.locator('.chip-btn', { hasText: c }).first().click(); await page.waitForTimeout(120); if (await inp.inputValue() !== c || await page.locator('.tool-body .note-warn').count() || !(await page.locator('.tool-body .kv').count())) chipBad.push(c); }
  ok(chipsAll.length === 7 && !chipBad.length, `all ${chipsAll.length} example chips give a result ${chipBad.join(' | ')}`);
  for (const [a, kind] of [['192.0.0.8', /IETF protocol/], ['2001::1', /Teredo/], ['3fff::1', /Documentation \(3fff::\/20\)/], ['198.18.5.5', /Benchmarking/], ['255.255.255.255', /Limited broadcast/], ['fd00::1', /Unique local/]]) { r = await set(a); if (!kind.test(r.Type)) wrong.push(`${a}: ${r.Type}`); }
  ok(!wrong.length, `special-purpose blocks are named (IETF protocol assignments, Teredo, 3fff::/20, benchmarking, limited broadcast, unique local) ${wrong.join(' | ')}`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'cidr');
};
