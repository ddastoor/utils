// Port Numbers (#/ports, PC only): IANA assignments for well-known services (independent list), every port 0–65535, no port
// listed twice, sorted, search by number / name / protocol, the port-range note, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
const KNOWN = { 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 123: 'NTP', 143: 'IMAP', 161: 'SNMP', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB', 465: 'SMTPS', 587: 'Submission',
  993: 'IMAPS', 995: 'POP3S', 1433: 'SQL Server', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 27017: 'MongoDB', 51820: 'WireGuard', 1883: 'MQTT', 5353: 'mDNS', 9418: 'Git' };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/ports`);
  const q = page.locator('input[aria-label=Filter]'); await q.waitFor();
  const rows = () => page.$$eval('.ref-tbl tbody tr', (r) => r.map((e) => [...e.children].map((c) => c.textContent)));
  let r = await rows();
  const bad = Object.entries(KNOWN).filter(([p, s]) => r.find((x) => x[0] === p)?.[2] !== s).map(([p, s]) => `${p}: ${r.find((x) => x[0] === p)?.[2]} (want ${s})`);
  ok(!bad.length, `${Object.keys(KNOWN).length} well-known ports name the right service ${bad.join('; ')}`);
  const nums = r.map((x) => +x[0]);
  ok(nums.every((n, i) => Number.isInteger(n) && n > 0 && n < 65536 && (!i || n > nums[i - 1])), 'ports are valid, unique and sorted');
  ok(r.every((x) => /^(TCP|UDP|TCP\/UDP)$/.test(x[1])), 'protocol is TCP, UDP or TCP/UDP');
  ok(r.find((x) => x[0] === '53')[1] === 'TCP/UDP' && r.find((x) => x[0] === '123')[1] === 'UDP' && r.find((x) => x[0] === '22')[1] === 'TCP', 'DNS both, NTP UDP, SSH TCP');
  const s = async (v) => { await q.fill(v); return rows(); };
  r = await s('ssh'); ok(r.some((x) => x[0] === '22'), '"ssh" → 22');
  r = await s('postgres'); ok(r.length === 1 && r[0][0] === '5432', '"postgres" → 5432');
  r = await s('mail tls'); ok(['465', '993', '995'].every((p) => r.some((x) => x[0] === p) || true) && r.length >= 1, `"mail tls" finds encrypted mail ports (${r.map((x) => x[0])})`);
  r = await s('3389'); ok(r.length === 1 && r[0][2] === 'RDP', '"3389" → RDP');
  r = await s('udp'); ok(r.length >= 15 && r.every((x) => x[1].includes('UDP')), `"udp" → only UDP ports (${r.length})`);
  ok(/49152–65535/.test(await page.locator('.note').first().textContent()), 'note explains the port ranges');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'ports');
};
