// Software reference tabs: HTTP status codes, MIME types, port numbers, ASCII table, key-code inspector.
// Static tables + a filter box; nothing to compute (plain TypeScript per the compute rule).
import { h, card, input, clear, note, copy, toggle, button, type Mount } from '../../ui';

type Row = string[];
/** A searchable table: every whitespace-separated word of the query must appear in the row (case-insensitive). */
function refTable(root: HTMLElement, o: { head: string[]; rows: Row[]; placeholder: string; mono?: number[]; intro?: Node; rowClass?: (r: Row) => string; group?: (r: Row) => string; query?: string; exact?: (r: Row) => string[]; focus?: boolean; alias?: (r: Row) => string }) {
  const q = input({ type: 'search', placeholder: o.placeholder, value: o.query || '', attrs: { 'aria-label': 'Filter' } });
  const count = h('div', { class: 'muted' });
  const body = h('tbody');
  const hay = o.rows.map((r) => `${r.join(' \u0001 ')} \u0001 ${o.group?.(r) || ''} \u0001 ${o.alias?.(r) || ''}`.toLowerCase()); // alias = other words people search by (not shown)
  const render = () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    let hits = o.rows.filter((_, i) => words.every((w) => hay[i].includes(w)));
    // "80" should show port 80 before 8080 and 1080: rows whose key is exactly the query come first (order otherwise kept)
    if (words.length === 1 && o.exact && !o.group) { const w = words[0].replace(/^\./, ''), top = hits.filter((r) => o.exact!(r).includes(w)); if (top.length) hits = [...top, ...hits.filter((r) => !top.includes(r))]; }
    let lastGroup = '';
    clear(body).append(...hits.flatMap((r) => {
      const out: HTMLElement[] = [];
      const g = o.group?.(r);
      if (g && g !== lastGroup) { lastGroup = g; out.push(h('tr', { class: 'grp' }, h('th', { colspan: String(o.head.length) }, g))); }
      out.push(h('tr', { class: o.rowClass?.(r) || null }, r.map((c, j) => h('td', { class: o.mono?.includes(j) ? 'mono' : null }, c))));
      return out;
    }));
    count.textContent = words.length ? (hits.length ? `${hits.length} of ${o.rows.length} match` : `Nothing matches “${q.value.trim()}” (${o.rows.length} entries)`) : `${o.rows.length} entries`;
  };
  q.addEventListener('input', render);
  root.append(card(null, q, count), o.intro || '', card(null, h('div', { class: 'scroll-x' }, h('table', { class: 'tbl ref-tbl' }, h('thead', null, h('tr', null, o.head.map((x) => h('th', null, x)))), body))));
  render();
  if (o.focus !== false) setTimeout(() => q.focus(), 0);
  return { q, render };
}

// ------------------------------------------------------------------ HTTP status codes (IANA registry, RFC 9110 etc.)
const HTTP: Array<[number, string, string, string]> = [
  [100, 'Continue', 'The client should continue with the request body (sent after "Expect: 100-continue").', 'RFC 9110'],
  [101, 'Switching Protocols', 'The server is switching protocols as asked in the Upgrade header (e.g. to WebSocket).', 'RFC 9110'],
  [102, 'Processing', 'WebDAV: request received, still being processed (deprecated).', 'RFC 2518'],
  [103, 'Early Hints', 'Preliminary headers (usually Link: preload) before the final response.', 'RFC 8297'],
  [200, 'OK', 'The request succeeded.', 'RFC 9110'],
  [201, 'Created', 'A new resource was created; its URL is usually in the Location header.', 'RFC 9110'],
  [202, 'Accepted', 'Accepted for processing, but not finished (asynchronous jobs).', 'RFC 9110'],
  [203, 'Non-Authoritative Information', 'Success, but the content was modified by a proxy.', 'RFC 9110'],
  [204, 'No Content', 'Success with no body (common for DELETE and PUT).', 'RFC 9110'],
  [205, 'Reset Content', 'Success; the client should reset the form/document view.', 'RFC 9110'],
  [206, 'Partial Content', 'Only the requested byte range is sent (Range requests, video seeking, resumed downloads).', 'RFC 9110'],
  [207, 'Multi-Status', 'WebDAV: several status codes for several resources in an XML body.', 'RFC 4918'],
  [208, 'Already Reported', 'WebDAV: members already listed earlier in this response.', 'RFC 5842'],
  [226, 'IM Used', 'Delta encoding: the response is the result of instance manipulations.', 'RFC 3229'],
  [300, 'Multiple Choices', 'Several representations are available; the client should choose one.', 'RFC 9110'],
  [301, 'Moved Permanently', 'Permanent redirect to the Location URL (clients may change POST to GET).', 'RFC 9110'],
  [302, 'Found', 'Temporary redirect to the Location URL (clients may change POST to GET).', 'RFC 9110'],
  [303, 'See Other', 'Redirect: fetch the result with GET at the Location URL (after a POST).', 'RFC 9110'],
  [304, 'Not Modified', 'The cached copy is still valid (conditional GET with If-None-Match / If-Modified-Since).', 'RFC 9110'],
  [305, 'Use Proxy', 'Deprecated; do not use.', 'RFC 9110'],
  [307, 'Temporary Redirect', 'Temporary redirect; the method and body must not change.', 'RFC 9110'],
  [308, 'Permanent Redirect', 'Permanent redirect; the method and body must not change.', 'RFC 9110'],
  [400, 'Bad Request', 'The server cannot process the request (malformed syntax, invalid body).', 'RFC 9110'],
  [401, 'Unauthorized', 'Authentication is missing or failed; see the WWW-Authenticate header.', 'RFC 9110'],
  [402, 'Payment Required', 'Reserved; used by some APIs for billing limits.', 'RFC 9110'],
  [403, 'Forbidden', 'Authenticated (or not), but not allowed to access this resource.', 'RFC 9110'],
  [404, 'Not Found', 'No resource at this URL.', 'RFC 9110'],
  [405, 'Method Not Allowed', 'The method is not supported for this resource; see the Allow header.', 'RFC 9110'],
  [406, 'Not Acceptable', 'No representation matches the Accept headers.', 'RFC 9110'],
  [407, 'Proxy Authentication Required', 'The proxy needs authentication (Proxy-Authenticate header).', 'RFC 9110'],
  [408, 'Request Timeout', 'The client took too long to send the request.', 'RFC 9110'],
  [409, 'Conflict', 'The request conflicts with the current state (edit conflicts, duplicates).', 'RFC 9110'],
  [410, 'Gone', 'The resource was removed permanently and will not come back.', 'RFC 9110'],
  [411, 'Length Required', 'A Content-Length header is required.', 'RFC 9110'],
  [412, 'Precondition Failed', 'An If-Match / If-Unmodified-Since condition was false.', 'RFC 9110'],
  [413, 'Content Too Large', 'The request body is larger than the server accepts.', 'RFC 9110'],
  [414, 'URI Too Long', 'The URL is longer than the server accepts.', 'RFC 9110'],
  [415, 'Unsupported Media Type', 'The body\'s Content-Type is not supported.', 'RFC 9110'],
  [416, 'Range Not Satisfiable', 'The requested byte range is outside the resource.', 'RFC 9110'],
  [417, 'Expectation Failed', 'The Expect header cannot be met.', 'RFC 9110'],
  [418, "I'm a teapot", 'April Fools\' joke from HTCPCP; reserved, some servers use it for refusals.', 'RFC 2324'],
  [421, 'Misdirected Request', 'The request reached a server that cannot answer for this host (HTTP/2 connection reuse).', 'RFC 9110'],
  [422, 'Unprocessable Content', 'Well-formed, but semantically invalid (validation errors).', 'RFC 9110'],
  [423, 'Locked', 'WebDAV: the resource is locked.', 'RFC 4918'],
  [424, 'Failed Dependency', 'WebDAV: failed because an earlier request failed.', 'RFC 4918'],
  [425, 'Too Early', 'The server will not process a request that might be replayed (TLS early data).', 'RFC 8470'],
  [426, 'Upgrade Required', 'The client must switch to another protocol (Upgrade header).', 'RFC 9110'],
  [428, 'Precondition Required', 'The request must be conditional (to prevent lost updates).', 'RFC 6585'],
  [429, 'Too Many Requests', 'Rate limited; see the Retry-After header.', 'RFC 6585'],
  [431, 'Request Header Fields Too Large', 'Headers (or one header, often cookies) are too large.', 'RFC 6585'],
  [451, 'Unavailable For Legal Reasons', 'Blocked for legal reasons (censorship, court order).', 'RFC 7725'],
  [500, 'Internal Server Error', 'A generic server-side error.', 'RFC 9110'],
  [501, 'Not Implemented', 'The server does not support the method/functionality.', 'RFC 9110'],
  [502, 'Bad Gateway', 'A gateway/proxy got an invalid response from the upstream server.', 'RFC 9110'],
  [503, 'Service Unavailable', 'Overloaded or down for maintenance; see Retry-After.', 'RFC 9110'],
  [504, 'Gateway Timeout', 'A gateway/proxy did not get a response from upstream in time.', 'RFC 9110'],
  [505, 'HTTP Version Not Supported', 'The HTTP version of the request is not supported.', 'RFC 9110'],
  [506, 'Variant Also Negotiates', 'Content negotiation configuration error.', 'RFC 2295'],
  [507, 'Insufficient Storage', 'WebDAV: the server cannot store the representation.', 'RFC 4918'],
  [508, 'Loop Detected', 'WebDAV: an infinite loop was detected.', 'RFC 5842'],
  [510, 'Not Extended', 'Obsoleted (historic).', 'RFC 2774'],
  [511, 'Network Authentication Required', 'Log in to the network first (captive portal Wi-Fi).', 'RFC 6585'],
  // not in the IANA registry, but seen in logs every day
  [419, 'Page Expired', 'Laravel: the CSRF token is missing or expired.', 'unofficial (Laravel)'],
  [444, 'No Response', 'nginx closed the connection without sending a response (in access logs only).', 'unofficial (nginx)'],
  [499, 'Client Closed Request', 'nginx: the client went away before the server answered (in access logs only).', 'unofficial (nginx)'],
  [520, 'Web Server Returned an Unknown Error', 'Cloudflare: the origin sent an empty or unexpected response.', 'unofficial (Cloudflare)'],
  [521, 'Web Server Is Down', 'Cloudflare: the origin refused the connection.', 'unofficial (Cloudflare)'],
  [522, 'Connection Timed Out', 'Cloudflare: could not reach the origin (TCP handshake timed out).', 'unofficial (Cloudflare)'],
  [523, 'Origin Is Unreachable', 'Cloudflare: no route to the origin (DNS or routing problem).', 'unofficial (Cloudflare)'],
  [524, 'A Timeout Occurred', 'Cloudflare: connected to the origin, but it did not answer in time.', 'unofficial (Cloudflare)'],
  [525, 'SSL Handshake Failed', 'Cloudflare: the TLS handshake with the origin failed.', 'unofficial (Cloudflare)'],
  [526, 'Invalid SSL Certificate', 'Cloudflare: the origin\'s certificate could not be validated.', 'unofficial (Cloudflare)'],
].sort((a, b) => (a[0] as number) - (b[0] as number)) as Array<[number, string, string, string]>;
export const HTTP_CODES = HTTP;
/** Other names and spellings people search by (older RFC names, British spelling, everyday words). */
const HTTP_ALIAS: Record<number, string> = {
  200: 'success fine', 201: 'post created', 204: 'empty', 301: 'seo moved', 302: 'moved temporarily', 304: 'etag cached', 400: 'malformed invalid',
  401: 'unauthorised unauthenticated not logged in login token expired', 403: 'permission denied access denied not allowed', 404: 'missing page not found broken link',
  405: 'wrong method', 408: 'timed out', 409: 'duplicate already exists', 413: 'payload too large request entity too large upload too big', 414: 'request-uri too long url too long',
  415: 'wrong content type', 416: 'requested range not satisfiable', 422: 'unprocessable entity validation failed', 429: 'throttled throttling quota rate limit',
  500: 'crash exception bug', 502: 'upstream proxy nginx', 503: 'overloaded down maintenance unavailable', 504: 'upstream timed out proxy nginx', 499: 'cancelled aborted',
};
const httpClass = (c: number) => ['', 'Informational', 'Success', 'Redirection', 'Client error', 'Server error'][Math.floor(c / 100)];
export const httpstatus: Mount = (root) => {
  refTable(root, {
    head: ['Code', 'Name', 'Meaning', 'Spec'], mono: [0], placeholder: 'Search: 404, redirect, rate limit, 5xx…',
    rows: HTTP.map(([c, n, d, s]) => [String(c), n, d, s]), group: (r) => `${r[0][0]}xx · ${httpClass(+r[0])}`,
    rowClass: (r) => `http-${r[0][0]}xx${r[3].startsWith('unofficial') ? ' http-unofficial' : ''}`, alias: (r) => HTTP_ALIAS[+r[0]] || '',
  });
};

// ------------------------------------------------------------------ MIME types (IANA media types as servers send them)
const MIME: Array<[string, string, string]> = [
  // [extensions, media type, description]
  ['html htm', 'text/html', 'HTML document'], ['css', 'text/css', 'CSS stylesheet'], ['js mjs cjs', 'text/javascript', 'JavaScript (RFC 9239; application/javascript is obsolete)'],
  ['json', 'application/json', 'JSON'], ['jsonld', 'application/ld+json', 'JSON-LD'], ['map', 'application/json', 'Source map'], ['webmanifest', 'application/manifest+json', 'Web app manifest'],
  ['xml', 'application/xml', 'XML (text/xml also seen)'], ['xhtml', 'application/xhtml+xml', 'XHTML'], ['rss', 'application/rss+xml', 'RSS feed'], ['atom', 'application/atom+xml', 'Atom feed'],
  ['txt text log', 'text/plain', 'Plain text'], ['csv', 'text/csv', 'Comma-separated values'], ['tsv', 'text/tab-separated-values', 'Tab-separated values'], ['md markdown', 'text/markdown', 'Markdown'],
  ['ics', 'text/calendar', 'iCalendar'], ['vcf vcard', 'text/vcard', 'vCard contact'], ['yaml yml', 'application/yaml', 'YAML (RFC 9512)'], ['toml', 'application/toml', 'TOML'],
  ['wasm', 'application/wasm', 'WebAssembly module'], ['pdf', 'application/pdf', 'PDF document'], ['rtf', 'application/rtf', 'Rich Text Format'], ['epub', 'application/epub+zip', 'EPUB e-book'],
  ['doc', 'application/msword', 'Word 97–2003'], ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word document'],
  ['xls', 'application/vnd.ms-excel', 'Excel 97–2003'], ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel workbook'],
  ['xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12', 'Excel macro-enabled workbook'], ['ppt', 'application/vnd.ms-powerpoint', 'PowerPoint 97–2003'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PowerPoint presentation'],
  ['odt', 'application/vnd.oasis.opendocument.text', 'OpenDocument text'], ['ods', 'application/vnd.oasis.opendocument.spreadsheet', 'OpenDocument spreadsheet'],
  ['odp', 'application/vnd.oasis.opendocument.presentation', 'OpenDocument presentation'], ['odg', 'application/vnd.oasis.opendocument.graphics', 'OpenDocument drawing'],
  ['zip', 'application/zip', 'ZIP archive'], ['gz tgz', 'application/gzip', 'gzip'], ['bz2', 'application/x-bzip2', 'bzip2'], ['xz', 'application/x-xz', 'XZ'], ['zst', 'application/zstd', 'Zstandard'],
  ['tar', 'application/x-tar', 'tar archive'], ['7z', 'application/x-7z-compressed', '7-Zip archive'], ['rar', 'application/vnd.rar', 'RAR archive'],
  ['jar', 'application/java-archive', 'Java archive'], ['apk', 'application/vnd.android.package-archive', 'Android app package'], ['exe dll msi', 'application/vnd.microsoft.portable-executable', 'Windows executable (often sent as application/octet-stream)'],
  ['deb', 'application/vnd.debian.binary-package', 'Debian package'], ['rpm', 'application/x-rpm', 'RPM package'], ['dmg', 'application/x-apple-diskimage', 'macOS disk image'], ['iso', 'application/x-iso9660-image', 'ISO disc image'],
  ['bin', 'application/octet-stream', 'Unknown / arbitrary binary data'], ['sqlite db sqlite3', 'application/vnd.sqlite3', 'SQLite database'],
  ['sh', 'application/x-sh', 'Shell script'], ['py', 'text/x-python', 'Python source'], ['java', 'text/x-java-source', 'Java source'], ['c h', 'text/x-c', 'C source'], ['cpp hpp cc', 'text/x-c++src', 'C++ source'],
  ['ts', 'text/typescript', 'TypeScript (note: .ts is also video/mp2t for MPEG transport streams)'], ['go', 'text/x-go', 'Go source'], ['rs', 'text/rust', 'Rust source'], ['sql', 'application/sql', 'SQL'],
  ['jpg jpeg jfif', 'image/jpeg', 'JPEG image'], ['png', 'image/png', 'PNG image'], ['gif', 'image/gif', 'GIF image'], ['webp', 'image/webp', 'WebP image'], ['avif', 'image/avif', 'AVIF image'],
  ['heic', 'image/heic', 'HEIC image (iPhone)'], ['heif', 'image/heif', 'HEIF image'], ['jxl', 'image/jxl', 'JPEG XL image'], ['svg', 'image/svg+xml', 'SVG vector image'], ['ico', 'image/vnd.microsoft.icon', 'Icon (image/x-icon also seen)'],
  ['bmp', 'image/bmp', 'Bitmap image'], ['tif tiff', 'image/tiff', 'TIFF image'], ['psd', 'image/vnd.adobe.photoshop', 'Photoshop document'], ['dng', 'image/x-adobe-dng', 'Digital negative (RAW)'],
  ['mp3', 'audio/mpeg', 'MP3 audio'], ['m4a', 'audio/mp4', 'AAC audio in MP4'], ['aac', 'audio/aac', 'AAC audio (ADTS)'], ['wav', 'audio/wav', 'WAV audio (audio/x-wav also seen)'], ['flac', 'audio/flac', 'FLAC audio'],
  ['ogg oga', 'audio/ogg', 'Ogg audio (Vorbis/Opus)'], ['opus', 'audio/opus', 'Opus audio'], ['weba', 'audio/webm', 'WebM audio'], ['mid midi', 'audio/midi', 'MIDI'], ['amr', 'audio/amr', 'AMR voice note'],
  ['mp4 m4v', 'video/mp4', 'MP4 video'], ['webm', 'video/webm', 'WebM video'], ['mkv', 'video/x-matroska', 'Matroska video'], ['mov', 'video/quicktime', 'QuickTime video'], ['avi', 'video/x-msvideo', 'AVI video'],
  ['ogv', 'video/ogg', 'Ogg video'], ['3gp', 'video/3gpp', '3GPP video'], ['m2ts mts', 'video/mp2t', 'MPEG transport stream'], ['m3u8', 'application/vnd.apple.mpegurl', 'HLS playlist'], ['mpd', 'application/dash+xml', 'MPEG-DASH manifest'],
  ['woff', 'font/woff', 'Web font (WOFF)'], ['woff2', 'font/woff2', 'Web font (WOFF2)'], ['ttf', 'font/ttf', 'TrueType font'], ['otf', 'font/otf', 'OpenType font'],
  ['eml', 'message/rfc822', 'E-mail message'], ['mbox', 'application/mbox', 'Mailbox'], ['p7s', 'application/pkcs7-signature', 'S/MIME signature'],
  ['pem crt cer', 'application/x-pem-file', 'PEM certificate/key (application/x-x509-ca-cert for .crt downloads)'], ['der', 'application/pkix-cert', 'DER certificate'], ['p12 pfx', 'application/x-pkcs12', 'PKCS #12 keystore'],
  ['asc', 'application/pgp-keys', 'Armored OpenPGP key (application/pgp-signature for signatures)'], ['gpg pgp', 'application/pgp-encrypted', 'OpenPGP encrypted data'],
  ['glb', 'model/gltf-binary', '3D model (glTF binary)'], ['gltf', 'model/gltf+json', '3D model (glTF JSON)'], ['stl', 'model/stl', '3D printing model'], ['obj', 'model/obj', 'Wavefront 3D model'],
  ['kml', 'application/vnd.google-earth.kml+xml', 'Google Earth KML'], ['gpx', 'application/gpx+xml', 'GPS track'], ['geojson', 'application/geo+json', 'GeoJSON'],
  ['mpeg mpg', 'video/mpeg', 'MPEG video'], ['wmv', 'video/x-ms-wmv', 'Windows Media video'], ['flv', 'video/x-flv', 'Flash video'], ['aif aiff', 'audio/aiff', 'AIFF audio'], ['wma', 'audio/x-ms-wma', 'Windows Media audio'],
  ['vtt', 'text/vtt', 'WebVTT subtitles'], ['srt', 'application/x-subrip', 'SubRip subtitles'], ['eot', 'application/vnd.ms-fontobject', 'Embedded OpenType font (old Internet Explorer)'],
  ['torrent', 'application/x-bittorrent', 'BitTorrent file'], ['php', 'application/x-httpd-php', 'PHP source'], ['ipynb', 'application/x-ipynb+json', 'Jupyter notebook'], ['parquet', 'application/vnd.apache.parquet', 'Apache Parquet table'],
  ['ps eps', 'application/postscript', 'PostScript'], ['jsx', 'text/jsx', 'React JSX source'], ['tsx', 'text/tsx', 'React TSX source'], ['proto', 'text/x-protobuf', 'Protocol Buffers schema'],
  ['', 'multipart/form-data', 'HTML form upload with files'], ['', 'application/x-www-form-urlencoded', 'HTML form (default encoding)'], ['', 'text/event-stream', 'Server-sent events'],
  ['', 'application/problem+json', 'API error details (RFC 9457)'], ['', 'application/graphql-response+json', 'GraphQL response'], ['ndjson jsonl', 'application/x-ndjson', 'Newline-delimited JSON / JSON Lines (application/jsonl also seen)'],
];
export const MIME_TYPES = MIME;
/** Wrong-but-common and older names for the same type. */
const MIME_ALIAS: Record<string, string> = {
  'image/jpeg': 'image/jpg image/pjpeg photo', 'text/javascript': 'application/javascript application/x-javascript', 'application/xml': 'text/xml', 'audio/wav': 'audio/x-wav audio/wave',
  'image/vnd.microsoft.icon': 'image/x-icon favicon', 'application/gzip': 'application/x-gzip', 'application/zip': 'application/x-zip-compressed', 'audio/mpeg': 'audio/mp3',
  'application/x-ndjson': 'application/jsonl application/json-lines', 'application/yaml': 'text/yaml application/x-yaml text/x-yaml', 'video/mp4': 'movie', 'text/plain': 'text file',
  'application/pdf': 'acrobat', 'application/vnd.ms-excel': 'spreadsheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'powerpoint slides',
};
export const mime: Mount = (root) => {
  refTable(root, {
    head: ['Extension', 'MIME type', 'What it is'], mono: [0, 1], placeholder: 'Search: .docx, image/webp, video, font…',
    rows: MIME.map(([e, t, d]) => [e ? e.split(' ').map((x) => `.${x}`).join(' ') : '—', t, d]), exact: (r) => [...r[0].split(' ').map((x) => x.slice(1)), r[1]], alias: (r) => MIME_ALIAS[r[1]] || '',
    intro: note('Servers should send the type in the Content-Type header; browsers guess ("sniff") only when it is missing. Add "; charset=utf-8" to text types.', 'info'),
  });
};

// ------------------------------------------------------------------ Port numbers (IANA well-known + common registered)
const PORTS: Array<[string, string, string, string]> = [
  ['20', 'TCP', 'FTP data', 'Active-mode FTP data channel'], ['21', 'TCP', 'FTP', 'File Transfer Protocol (control)'], ['22', 'TCP', 'SSH', 'Secure Shell, SFTP, scp, git over SSH'],
  ['23', 'TCP', 'Telnet', 'Unencrypted remote login (avoid)'], ['25', 'TCP', 'SMTP', 'Mail between servers'], ['53', 'TCP/UDP', 'DNS', 'Domain Name System'], ['67', 'UDP', 'DHCP server', 'BOOTP/DHCP'],
  ['68', 'UDP', 'DHCP client', 'BOOTP/DHCP'], ['69', 'UDP', 'TFTP', 'Trivial File Transfer (PXE boot)'], ['80', 'TCP', 'HTTP', 'Web'], ['88', 'TCP/UDP', 'Kerberos', 'Authentication (Active Directory)'],
  ['110', 'TCP', 'POP3', 'Mail download'], ['111', 'TCP/UDP', 'rpcbind', 'ONC RPC portmapper (NFS)'], ['119', 'TCP', 'NNTP', 'Usenet news'], ['123', 'UDP', 'NTP', 'Network Time Protocol'],
  ['135', 'TCP', 'MS RPC', 'Microsoft RPC endpoint mapper'], ['137', 'UDP', 'NetBIOS-NS', 'NetBIOS name service'], ['138', 'UDP', 'NetBIOS-DGM', 'NetBIOS datagrams'], ['139', 'TCP', 'NetBIOS-SSN', 'SMB over NetBIOS'],
  ['143', 'TCP', 'IMAP', 'Mail access'], ['161', 'UDP', 'SNMP', 'Network monitoring'], ['162', 'UDP', 'SNMP trap', 'SNMP notifications'], ['179', 'TCP', 'BGP', 'Border Gateway Protocol'],
  ['389', 'TCP/UDP', 'LDAP', 'Directory access'], ['443', 'TCP/UDP', 'HTTPS', 'Web over TLS; UDP 443 = HTTP/3 (QUIC)'], ['445', 'TCP', 'SMB', 'Windows file sharing (Samba)'],
  ['465', 'TCP', 'SMTPS', 'Mail submission over implicit TLS'], ['500', 'UDP', 'IKE', 'IPsec key exchange'], ['514', 'UDP', 'Syslog', 'System logging'], ['515', 'TCP', 'LPD', 'Line printer daemon'],
  ['520', 'UDP', 'RIP', 'Routing Information Protocol'], ['546', 'UDP', 'DHCPv6 client', ''], ['547', 'UDP', 'DHCPv6 server', ''], ['554', 'TCP/UDP', 'RTSP', 'Streaming (IP cameras)'],
  ['587', 'TCP', 'Submission', 'Mail submission with STARTTLS'], ['631', 'TCP', 'IPP', 'Internet Printing Protocol (CUPS)'], ['636', 'TCP', 'LDAPS', 'LDAP over TLS'], ['853', 'TCP/UDP', 'DNS over TLS/QUIC', 'Encrypted DNS'],
  ['873', 'TCP', 'rsync', 'rsync daemon'], ['989', 'TCP', 'FTPS data', ''], ['990', 'TCP', 'FTPS', 'FTP over implicit TLS'], ['993', 'TCP', 'IMAPS', 'IMAP over TLS'], ['995', 'TCP', 'POP3S', 'POP3 over TLS'],
  ['1080', 'TCP', 'SOCKS', 'SOCKS proxy'], ['1194', 'UDP', 'OpenVPN', ''], ['1433', 'TCP', 'SQL Server', 'Microsoft SQL Server'], ['1521', 'TCP', 'Oracle', 'Oracle database listener'],
  ['1701', 'UDP', 'L2TP', ''], ['1723', 'TCP', 'PPTP', 'Legacy VPN'], ['1812', 'UDP', 'RADIUS', 'Authentication'], ['1813', 'UDP', 'RADIUS accounting', ''], ['1883', 'TCP', 'MQTT', 'IoT messaging'],
  ['1900', 'UDP', 'SSDP', 'UPnP discovery'], ['2049', 'TCP/UDP', 'NFS', 'Network File System'], ['2181', 'TCP', 'ZooKeeper', ''], ['2375', 'TCP', 'Docker', 'Docker API (unencrypted — never expose)'],
  ['2376', 'TCP', 'Docker TLS', 'Docker API over TLS'], ['2379', 'TCP', 'etcd', 'etcd client'], ['3000', 'TCP', 'Dev server', 'Node/Rails/Grafana default'], ['3306', 'TCP', 'MySQL', 'MySQL / MariaDB'],
  ['3389', 'TCP/UDP', 'RDP', 'Windows Remote Desktop'], ['3478', 'UDP', 'STUN/TURN', 'WebRTC NAT traversal'], ['4369', 'TCP', 'EPMD', 'Erlang port mapper (RabbitMQ)'], ['5000', 'TCP', 'Dev server', 'Flask / Docker registry default'],
  ['5060', 'TCP/UDP', 'SIP', 'VoIP signalling'], ['5061', 'TCP', 'SIPS', 'SIP over TLS'], ['5173', 'TCP', 'Vite', 'Vite dev server'], ['5222', 'TCP', 'XMPP', 'Jabber client'], ['5353', 'UDP', 'mDNS', 'Bonjour / Avahi'],
  ['5432', 'TCP', 'PostgreSQL', ''], ['5672', 'TCP', 'AMQP', 'RabbitMQ'], ['5900', 'TCP', 'VNC', 'Remote desktop (display :0)'], ['6379', 'TCP', 'Redis', ''], ['6443', 'TCP', 'Kubernetes API', 'kube-apiserver'],
  ['6881', 'TCP/UDP', 'BitTorrent', '6881–6889'], ['8000', 'TCP', 'HTTP alt', 'Django / python -m http.server'], ['8080', 'TCP', 'HTTP alt', 'Proxies, Tomcat, dev servers'], ['8443', 'TCP', 'HTTPS alt', ''],
  ['8883', 'TCP', 'MQTT over TLS', ''], ['9000', 'TCP', 'Various', 'PHP-FPM, SonarQube, MinIO'], ['9090', 'TCP', 'Prometheus', ''], ['9092', 'TCP', 'Kafka', ''], ['9100', 'TCP', 'Printer / node_exporter', 'Raw printing (JetDirect); Prometheus node exporter'],
  ['9200', 'TCP', 'Elasticsearch', 'HTTP API'], ['9418', 'TCP', 'Git', 'git:// protocol'], ['10250', 'TCP', 'Kubelet', 'Kubernetes node agent'], ['11211', 'TCP/UDP', 'Memcached', ''],
  ['25565', 'TCP', 'Minecraft', 'Java edition server'], ['27017', 'TCP', 'MongoDB', ''], ['51820', 'UDP', 'WireGuard', 'Default listen port'],
  ['43', 'TCP', 'WHOIS', 'Domain registration lookup'], ['1434', 'UDP', 'SQL Server Browser', 'Finds named SQL Server instances'], ['1935', 'TCP', 'RTMP', 'Live video streaming'], ['2380', 'TCP', 'etcd peer', 'etcd cluster traffic'],
  ['3100', 'TCP', 'Loki', 'Grafana Loki log store'], ['3128', 'TCP', 'Squid', 'HTTP proxy'], ['4200', 'TCP', 'Angular', 'Angular dev server'], ['4317', 'TCP', 'OTLP gRPC', 'OpenTelemetry collector'], ['4318', 'TCP', 'OTLP HTTP', 'OpenTelemetry collector'],
  ['4500', 'UDP', 'IPsec NAT-T', 'IPsec through NAT'], ['5044', 'TCP', 'Beats', 'Logstash Beats input'], ['5601', 'TCP', 'Kibana', ''], ['5984', 'TCP', 'CouchDB', ''], ['5985', 'TCP', 'WinRM', 'Windows Remote Management (HTTP)'],
  ['5986', 'TCP', 'WinRM TLS', 'Windows Remote Management (HTTPS)'], ['6667', 'TCP', 'IRC', 'Internet Relay Chat'], ['8086', 'TCP', 'InfluxDB', ''], ['8200', 'TCP', 'Vault', 'HashiCorp Vault'], ['8500', 'TCP', 'Consul', 'HashiCorp Consul'],
  ['8888', 'TCP', 'Jupyter', 'Jupyter notebook default'], ['9042', 'TCP', 'Cassandra', 'CQL native protocol'], ['9093', 'TCP', 'Alertmanager', 'Prometheus Alertmanager'], ['15672', 'TCP', 'RabbitMQ management', 'Web console'],
  ['19132', 'UDP', 'Minecraft Bedrock', 'Bedrock edition server'], ['32400', 'TCP', 'Plex', 'Plex media server'], ['33060', 'TCP', 'MySQL X', 'MySQL X protocol'], ['50051', 'TCP', 'gRPC', 'Common gRPC default'],
].sort((a, b) => +a[0] - +b[0]) as Array<[string, string, string, string]>;
/** Search words that are not in the visible columns: the kind of service and everyday names. */
const PORT_ALIAS: Array<[RegExp, string]> = [
  [/^(SQL Server|SQL Server Browser|Oracle|MySQL|MySQL X|PostgreSQL|MongoDB|Redis|Cassandra|CouchDB|InfluxDB|Elasticsearch|Memcached|etcd)$/, 'database db datastore'], [/^SQL Server/, 'mssql microsoft sql'],
  [/^PostgreSQL$/, 'postgres psql pg'], [/^(Redis|Memcached)$/, 'cache'], [/^(SMTP|SMTPS|Submission|POP3|POP3S|IMAP|IMAPS)$/, 'email e-mail mail'], [/Kube|etcd/, 'k8s kubernetes'],
  [/^(OpenVPN|WireGuard|IKE|IPsec NAT-T|L2TP|PPTP)$/, 'vpn'], [/^(HTTP|HTTPS|HTTP alt|HTTPS alt)$/, 'web website browser'], [/^(RDP|VNC|SSH|Telnet|WinRM|WinRM TLS)$/, 'remote access login'],
  [/^(AMQP|MQTT|MQTT over TLS|Kafka|RabbitMQ management)$/, 'queue message broker messaging'], [/^(Prometheus|Alertmanager|Loki|Kibana|Beats|OTLP gRPC|OTLP HTTP|SNMP|Syslog)$/, 'monitoring logs metrics observability'],
  [/^(Minecraft|Minecraft Bedrock)$/, 'game gaming'], [/^(SMB|NFS|FTP|FTPS|TFTP|rsync|NetBIOS-SSN)$/, 'file sharing files transfer'], [/^(DNS|mDNS|DNS over TLS\/QUIC)$/, 'name resolution domain'],
  [/^(Dev server|Vite|Angular|Jupyter|HTTP alt)$/, 'localhost development'],
];
export const PORT_LIST = PORTS;
export const ports: Mount = (root) => {
  refTable(root, {
    head: ['Port', 'Protocol', 'Service', 'Notes'], mono: [0], placeholder: 'Search: 22, ssh, database, mail, udp…',
    rows: PORTS, exact: (r) => [r[0], r[2].toLowerCase()], alias: (r) => PORT_ALIAS.filter(([re]) => re.test(r[2])).map((x) => x[1]).join(' '), intro: note('0–1023 are well-known (system) ports, 1024–49151 registered, 49152–65535 dynamic/private (used for outgoing connections).', 'info'),
  });
};

// ------------------------------------------------------------------ ASCII table
const CTRL = ['NUL Null', 'SOH Start of heading', 'STX Start of text', 'ETX End of text (Ctrl+C)', 'EOT End of transmission (Ctrl+D)', 'ENQ Enquiry', 'ACK Acknowledge', 'BEL Bell \\a',
  'BS Backspace \\b', 'HT Horizontal tab \\t', 'LF Line feed \\n', 'VT Vertical tab \\v', 'FF Form feed \\f', 'CR Carriage return \\r', 'SO Shift out', 'SI Shift in', 'DLE Data link escape',
  'DC1 Device control 1 (XON)', 'DC2 Device control 2', 'DC3 Device control 3 (XOFF)', 'DC4 Device control 4', 'NAK Negative acknowledge', 'SYN Synchronous idle', 'ETB End of block',
  'CAN Cancel', 'EM End of medium', 'SUB Substitute (Ctrl+Z)', 'ESC Escape \\e', 'FS File separator', 'GS Group separator', 'RS Record separator', 'US Unit separator'];
const ENT: Record<number, string> = { 34: '&quot;', 38: '&amp;', 39: '&#39;', 60: '&lt;', 62: '&gt;', 160: '&nbsp;', 169: '&copy;', 174: '&reg;', 176: '&deg;', 177: '&plusmn;', 215: '&times;', 247: '&divide;' };
/** Everyday names of control characters (the table shows the standard ones). */
const ASCII_ALIAS: Record<number, string> = { 0: 'zero terminator \\0', 8: 'erase', 9: 'tab indent', 10: 'newline new line enter linefeed unix line ending', 13: 'enter return windows line ending crlf', 27: 'esc ansi', 32: 'blank whitespace', 127: 'rubout' };
export function asciiRow(c: number): Row {
  const ch = c < 32 ? CTRL[c].split(' ')[0] : c === 32 ? 'Space' : c === 127 ? 'DEL' : c >= 128 && c < 160 ? '(C1 control)' : String.fromCharCode(c);
  const caret = (ch2: string, d: string) => (/Ctrl\+/.test(d) ? d.replace(/\(Ctrl\+(.)\)/, `(Ctrl+$1, ^$1)`) : `${d} (^${ch2})`); // every control code has a caret name: ^@ ^A … ^_ and ^?
  const desc = c < 32 ? caret(String.fromCharCode(c + 64), CTRL[c].split(' ').slice(1).join(' ')) : c === 32 ? 'Space' : c === 127 ? 'Delete (^?)' : c === 160 ? 'No-break space' : c >= 128 && c < 160 ? 'C1 control (Windows-1252 differs)' : c >= 48 && c <= 57 ? 'Digit' : /[A-Z]/.test(ch) ? 'Upper-case letter' : /[a-z]/.test(ch) ? 'Lower-case letter' : c > 127 ? 'Latin-1 character' : 'Punctuation / symbol';
  return [String(c), c.toString(16).toUpperCase().padStart(2, '0'), c.toString(8).padStart(3, '0'), c.toString(2).padStart(8, '0'), ch, ENT[c] || (c >= 32 && c !== 127 && !(c >= 128 && c < 160) ? `&#${c};` : ''), desc];
}
export const ascii: Mount = (root) => {
  let ext = false, tbl: ReturnType<typeof refTable> | null = null;
  const host = h('div');
  // the filter text survives the Latin-1 switch; a single typed character finds itself first ("a" → row 97, not every row with an a)
  const draw = () => { const query = tbl?.q.value || '', first = !tbl; clear(host); tbl = refTable(host, { focus: first, head: ['Dec', 'Hex', 'Oct', 'Binary', 'Char', 'HTML', 'Description'], mono: [0, 1, 2, 3, 4, 5], placeholder: 'Search: 65, 0x41, A, tab, newline…', query,
    exact: (r) => [r[0], r[1].toLowerCase(), r[4].toLowerCase()], alias: (r) => ASCII_ALIAS[+r[0]] || '', rows: Array.from({ length: ext ? 256 : 128 }, (_, i) => asciiRow(i)).map((r) => [...r.slice(0, 1), `0x${r[1]}`, ...r.slice(2)]) }); };
  root.append(card(null, toggle('Include Latin-1 (128–255)', false, (v) => { ext = v; draw(); })), host);
  draw();
};

// ------------------------------------------------------------------ Key codes (live event inspector)
export const keycode: Mount = (root) => {
  const big = h('div', { class: 'keycode-big mono' }, '—'), sub = h('div', { class: 'muted center' }, 'Press any key');
  const tbl = h('tbody'), hist = h('tbody');
  const fields = (e: KeyboardEvent): Array<[string, string]> => [['event.key', JSON.stringify(e.key)], ['event.code', e.code || '""'], ['event.keyCode (legacy)', String(e.keyCode)], ['event.which (legacy)', String(e.which)],
    ['event.location', `${e.location} (${['standard', 'left', 'right', 'numpad'][e.location] || '?'})`], ['Modifiers', (e.getModifierState?.('AltGraph') ? ['AltGr', e.shiftKey && 'Shift', e.metaKey && 'Meta'] : [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', e.metaKey && 'Meta']).filter(Boolean).join(' + ') || 'none'],
    ['event.repeat', String(e.repeat)], ['event.isComposing', String(e.isComposing)], ['getModifierState("CapsLock")', String(e.getModifierState?.('CapsLock') ?? false)]];
  const onKey = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement;
    if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return; // typing in the search box etc.
    e.stopPropagation(); // capture phase: the app's own shortcuts (/, Ctrl+K) must not fire here
    // The key is shown, but the browser keeps its own keys: Tab still moves the focus (no keyboard trap), F5 / Ctrl+R
    // still reload, Ctrl+L / Ctrl+T / Ctrl+W, the F-keys and Alt+arrows work. Everything else (letters, Space, arrows,
    // Backspace, '/') is held back so the page does not scroll or go back while keys are tried out.
    const browsers = e.key === 'Tab' || /^F\d{1,2}$/.test(e.key) || ((e.ctrlKey || e.metaKey) && !['k', 'K', 's', 'S', 'p', 'P', 'f', 'F'].includes(e.key)) || (e.altKey && /^Arrow|^Home$/.test(e.key));
    const pressing = (e.key === 'Enter' || e.key === ' ') && !!tgt?.closest?.('button, a[href], summary, [role="button"], [role="tab"]'); // a focused button must stay usable from the keyboard
    if (!browsers && !pressing) e.preventDefault();
    big.textContent = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key : e.key;
    sub.textContent = `code ${e.code} · keyCode ${e.keyCode}`;
    clear(tbl).append(...fields(e).map(([k, v]) => h('tr', null, h('td', null, k), h('td', { class: 'mono' }, v, ' ', h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => copy(v) }, 'Copy')))));
    hist.prepend(h('tr', null, h('td', { class: 'mono' }, JSON.stringify(e.key)), h('td', { class: 'mono' }, e.code), h('td', { class: 'mono num' }, String(e.keyCode))));
    while (hist.children.length > 20) hist.lastElementChild!.remove();
  };
  addEventListener('keydown', onKey, true);
  root.append(card(null, big, sub), card('Event properties', h('table', { class: 'tbl' }, tbl)),
    card('Recent keys', h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'key'), h('th', null, 'code'), h('th', { class: 'num' }, 'keyCode'))), hist), button('Clear', () => clear(hist), { small: true, icon: 'Eraser' })),
    note('Use event.key for the character and event.code for the physical key (layout independent). keyCode/which are deprecated but still sent. Browser and OS shortcuts (Ctrl+W, Alt+Tab, Win) may never reach the page.', 'info'));
  return () => removeEventListener('keydown', onKey, true);
};
