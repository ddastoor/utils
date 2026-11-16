// HTTP Status Codes (#/httpstatus, PC only): every code of the IANA registry that is in use is listed exactly once under
// the right class heading, names follow RFC 9110 (413 Content Too Large, 422 Unprocessable Content), search by number,
// words, several words and a class like "5xx", no match, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
// independent list: IANA HTTP Status Code Registry (2026), codes with a registered meaning (306 unused, 418 reserved but listed)
const IANA = { 100: 'Continue', 101: 'Switching Protocols', 102: 'Processing', 103: 'Early Hints', 200: 'OK', 201: 'Created', 202: 'Accepted', 203: 'Non-Authoritative Information', 204: 'No Content', 205: 'Reset Content', 206: 'Partial Content', 207: 'Multi-Status', 208: 'Already Reported', 226: 'IM Used',
  300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 305: 'Use Proxy', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable', 407: 'Proxy Authentication Required', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 411: 'Length Required', 412: 'Precondition Failed', 413: 'Content Too Large', 414: 'URI Too Long', 415: 'Unsupported Media Type', 416: 'Range Not Satisfiable', 417: 'Expectation Failed', 421: 'Misdirected Request', 422: 'Unprocessable Content', 423: 'Locked', 424: 'Failed Dependency', 425: 'Too Early', 426: 'Upgrade Required', 428: 'Precondition Required', 429: 'Too Many Requests', 431: 'Request Header Fields Too Large', 451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Version Not Supported', 506: 'Variant Also Negotiates', 507: 'Insufficient Storage', 508: 'Loop Detected', 510: 'Not Extended', 511: 'Network Authentication Required' };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/httpstatus`);
  const q = page.locator('input[type=search][aria-label=Filter]'); await q.waitFor();
  const rows = () => page.$$eval('.ref-tbl tbody tr:not(.grp)', (r) => r.map((e) => [...e.children].map((c) => c.textContent)));
  const groups = () => page.$$eval('.ref-tbl tbody tr.grp', (r) => r.map((e) => e.textContent));
  const search = async (s) => { await q.fill(s); return rows(); };
  let r = await rows();
  const codes = r.map((x) => +x[0]);
  const missing = Object.keys(IANA).filter((c) => !codes.includes(+c)), dup = codes.filter((c, i) => codes.indexOf(c) !== i);
  ok(!missing.length && !dup.length, `every registered code listed once (${r.length} rows; missing ${missing}, duplicates ${dup})`);
  const wrong = r.filter((x) => IANA[x[0]] && IANA[x[0]] !== x[1]).map((x) => `${x[0]} "${x[1]}"`);
  ok(!wrong.length, `names match the registry ${wrong.join(', ')}`);
  ok(r.find((x) => x[0] === '418')?.[1] === "I'm a teapot", '418 I\'m a teapot included');
  ok(JSON.stringify(await groups()) === JSON.stringify(['1xx · Informational', '2xx · Success', '3xx · Redirection', '4xx · Client error', '5xx · Server error']), `class headings in order (${await groups()})`);
  ok(codes.every((c, i) => !i || c > codes[i - 1]), 'sorted by code');
  ok(r.every((x) => x[2].length > 10 && /^RFC \d+$/.test(x[3])), 'every code has a meaning and its RFC');
  r = await search('404'); ok(r.length === 1 && r[0][1] === 'Not Found', 'search "404" → Not Found');
  r = await search('redirect'); ok(['301', '302', '303', '307', '308'].every((c) => r.some((x) => x[0] === c)), `"redirect" finds the redirects (${r.map((x) => x[0])})`);
  r = await search('rate limit'); ok(r.length === 1 && r[0][0] === '429', '"rate limit" (two words) → 429');
  r = await search('5xx'); ok(r.length === Object.keys(IANA).filter((c) => c[0] === '5').length && (await groups()).length === 1, `"5xx" → all ${r.length} server errors`);
  r = await search('CAPTIVE portal'); ok(r.length === 1 && r[0][0] === '511', 'case-insensitive: "CAPTIVE portal" → 511');
  r = await search('zzzz'); ok(r.length === 0 && /0 of \d+ match/.test(await page.locator('.card .muted').first().textContent()), 'no match → "0 of N match"');
  r = await search(''); ok(r.length === Object.keys(IANA).length + 1, 'clearing the search shows everything again');
  ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Filter'), 'search box focused on open');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'httpstatus');
};
