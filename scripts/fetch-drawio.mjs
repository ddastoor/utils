// The Diagram Editor's engine (potentials #54): draw.io 32.7.7 (Apache-2.0, draw.io Ltd / draw.io AG), fetched at build time,
// checked and served from this site — never from another site while the page runs (CLAUDE.md §1, rule 2).
//   node scripts/fetch-drawio.mjs     run by predev / prebuild; does nothing when public/drawio/ is up to date
// The release file draw.war is taken from the layer of draw.io's own Docker image jgraph/drawio:32.7.7 that holds it (Docker
// Hub serves a layer by its SHA-256 — the pin; no manifest is read), else from the GitHub release; either way the war must
// have the SHA-256 pinned below. It is kept in node_modules/.cache/superutils-assets (never deployed). The editor's files
// (53 MB of the war's 126) are unpacked into public/drawio/ (gitignored); index.html, js/PreConfig.js and js/PostConfig.js are written from
// scripts/drawio/ (our changes, Apache-2.0 §4(b) — listed in public/drawio/README.txt), with js/superutils-frame.js, the
// licence and the README.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, renameSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = '32.7.7';
const WAR_SHA256 = 'ffca456f234c0a51160ea19eec1329a675fd8e84ea472fcf18b74cb87f5d9ca5', WAR_SIZE = 52890254;
// jgraph/drawio:32.7.7 (index sha256:9911eb71…, linux/amd64 manifest sha256:5bf76551…): its layer "COPY /tmp/drawio/build/draw.war /tmp"
const LAYER = 'sha256:3be6d761ee86978101bed61706a0064b66e8d7876f627ada8d3ef6078cac0b6b', IMAGE = 'jgraph/drawio';
const RELEASE = `https://github.com/jgraph/drawio/releases/download/v${VERSION}/draw.war`;
const out = join(root, 'public/drawio'), mine = join(root, 'scripts/drawio');
const cacheDir = join(root, 'node_modules/.cache/superutils-assets'), cached = join(cacheDir, `drawio-${VERSION}.war`);
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** What of the war the editor does not need (or must not have): left out. */
export const LEAVE_OUT = [
  /^(WEB-INF|META-INF)\//,                                   // the Java server's parts (with its cloud keys)
  /^js\/(diagramly|grapheditor|desktop)\//, /^mxgraph\/src\//, /^mxgraph\/mxClient\.js$/, // unminified sources: the editor runs js/app.min.js
  /^js\/integrate\.min\.js$/,                                // the cloud integrations (Google Drive, OneDrive, Dropbox, GitHub, GitLab, Trello)
  /^js\/viewer(-static)?\.min\.js$/,                         // the stand-alone viewers
  /^js\/(simplepeer|onedrive)\//, /^connect\//,              // live collaboration, OneDrive, Atlassian's Confluence and Jira
  /^js\/(embed\.dev|export|export-init|clear|open|vsdxImporter)\.js$/, // scripts of the hosted site's other pages
  /^[^/]+\.html$/,                                           // the hosted site's pages (index.html is written from scripts/drawio)
  /^(service-worker|workbox-[0-9a-f]+)\.js$/, /\.map$/,      // the service worker (this site has none) and source maps
  /^resources\/dia_.+\.txt$/, /^resources\/[^/]+\.md$/,      // the other languages (English: resources/dia.txt)
  /^images\/(manifest\.json|browserconfig\.xml)$/, /^monday-app-association\.json$/, /^favicon\.ico$/, // the hosted site's app files
  /^plugins\/(cConf-[^/]+|connect|connectJira|monday|nextcloud|trello|update)\.js$/, // plugins that talk to other services
  /^js\/(PreConfig|PostConfig)\.js$/,                         // ours (scripts/drawio/PreConfig.js, PostConfig.js)
];
/** Our files: [from scripts/drawio, to public/drawio]. */
const OURS = [['index.html', 'index.html'], ['PreConfig.js', 'js/PreConfig.js'], ['PostConfig.js', 'js/PostConfig.js'], ['frame.js', 'js/superutils-frame.js'], ['LICENSE', 'LICENSE'], ['README.txt', 'README.txt']];

/** The files of a zip archive (its central directory; stored or deflated; names that would leave the folder refused). */
export function* zipEntries(zip) {
  let e = zip.length - 22;
  while (e >= 0 && zip.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip archive');
  let p = zip.readUInt32LE(e + 16);
  for (let i = 0, n = zip.readUInt16LE(e + 10); i < n; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('a damaged zip archive');
    const flags = zip.readUInt16LE(p + 8), method = zip.readUInt16LE(p + 10), csize = zip.readUInt32LE(p + 20), usize = zip.readUInt32LE(p + 24);
    const nl = zip.readUInt16LE(p + 28), xl = zip.readUInt16LE(p + 30), cl = zip.readUInt16LE(p + 32), off = zip.readUInt32LE(p + 42);
    const name = zip.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nl);
    p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    if (name.startsWith('/') || name.includes('\\') || name.split('/').some((s) => s === '..' || s === '')) throw new Error(`a file name that would leave the folder: ${name}`);
    yield {
      name, size: usize, data() {
        const start = off + 30 + zip.readUInt16LE(off + 26) + zip.readUInt16LE(off + 28), raw = zip.subarray(start, start + csize);
        const d = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
        if (!d) throw new Error(`${name}: compression method ${method}`);
        if (d.length !== usize) throw new Error(`${name}: ${d.length} bytes, not ${usize}`);
        return d;
      },
    };
  }
}
/** One file of a tar archive. */
export function tarMember(tar, name) {
  for (let p = 0; p + 512 <= tar.length;) {
    const h = tar.subarray(p, p + 512);
    if (h.every((b) => b === 0)) break;
    const field = (a, b) => h.toString('latin1', a, b).replace(/\0[\s\S]*$/, '');
    let n = field(0, 100);
    const prefix = field(345, 500);
    if (h.toString('latin1', 257, 262) === 'ustar' && prefix) n = `${prefix}/${n}`;
    const size = parseInt(field(124, 136).trim() || '0', 8), type = String.fromCharCode(h[156]);
    p += 512;
    if ((type === '0' || type === '\0') && n.replace(/^\.\//, '') === name) return tar.subarray(p, p + size);
    p += Math.ceil(size / 512) * 512;
  }
  throw new Error(`${name} is not in the archive`);
}
const curl = (args) => execFileSync('curl', ['-fsSL', '--retry', '4', '--retry-delay', '3', '--connect-timeout', '30', ...args], { maxBuffer: 1 << 30 });
/** The war from draw.io's Docker image: the layer by its digest (Docker Hub's anonymous token; the blob itself counts against no pull limit). */
function fromDockerHub() {
  const { token } = JSON.parse(curl([`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${IMAGE}:pull`]).toString());
  const part = join(cacheDir, 'drawio-layer.part');
  try {
    curl(['-o', part, '-H', `Authorization: Bearer ${token}`, `https://registry-1.docker.io/v2/${IMAGE}/blobs/${LAYER}`]);
    const layer = readFileSync(part);
    if (`sha256:${sha(layer)}` !== LAYER) throw new Error('the layer is not the one pinned');
    return Buffer.from(tarMember(gunzipSync(layer), 'tmp/draw.war'));
  } finally { rmSync(part, { force: true }); }
}
const fromRelease = () => curl([RELEASE]);

async function war() {
  mkdirSync(cacheDir, { recursive: true });
  if (existsSync(cached)) { const b = readFileSync(cached); if (b.length === WAR_SIZE && sha(b) === WAR_SHA256) return b; }
  const why = [];
  for (const [what, get] of [['draw.io\'s Docker image', fromDockerHub], ['the GitHub release', fromRelease]]) {
    process.stdout.write(`drawio: fetching draw.war ${VERSION} from ${what} … `);
    try {
      const b = get();
      if (sha(b) !== WAR_SHA256) throw new Error(`SHA-256 ${sha(b)}, not the pinned ${WAR_SHA256}`);
      writeFileSync(`${cached}.part`, b); renameSync(`${cached}.part`, cached);
      console.log(`ok (${(b.length / 1e6).toFixed(1)} MB)`);
      return b;
    } catch (e) { console.log(`✗ ${e.message.split('\n')[0]}`); why.push(`${what}: ${e.message.split('\n')[0]}`); }
  }
  throw new Error(`draw.war ${VERSION} could not be fetched (${why.join('; ')})`);
}

async function main() {
  // up to date: the same war and the same files of ours (this script and scripts/drawio)
  const inputs = sha(Buffer.concat([readFileSync(fileURLToPath(import.meta.url)), ...readdirSync(mine).sort().map((f) => Buffer.concat([Buffer.from(f), readFileSync(join(mine, f))]))]));
  const stampFile = join(out, '.superutils.json');
  try { const s = JSON.parse(readFileSync(stampFile, 'utf8')); if (s.war === WAR_SHA256 && s.inputs === inputs) return console.log('drawio: up to date'); } catch { /* make it */ }
  const zip = await war();
  const tmp = `${out}.part`;
  rmSync(tmp, { recursive: true, force: true });
  let files = 0, bytes = 0;
  const dirs = new Set();
  for (const f of zipEntries(zip)) {
    if (LEAVE_OUT.some((r) => r.test(f.name))) continue;
    const dest = join(tmp, ...f.name.split('/')), dir = dirname(dest);
    if (!dirs.has(dir)) { mkdirSync(dir, { recursive: true }); dirs.add(dir); }
    writeFileSync(dest, f.data()); files++; bytes += f.size;
  }
  for (const [from, to] of OURS) {
    const b = readFileSync(join(mine, from)), dest = join(tmp, ...to.split('/'));
    mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, b); files++; bytes += b.length;
  }
  writeFileSync(join(tmp, '.superutils.json'), JSON.stringify({ version: VERSION, war: WAR_SHA256, inputs, files, bytes }) + '\n');
  rmSync(out, { recursive: true, force: true });
  renameSync(tmp, out);
  console.log(`drawio: ${files} files, ${(bytes / 1e6).toFixed(1)} MB in public/drawio/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
