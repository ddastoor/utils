// Builds tests/fixtures/ from pinned, checksum-verified open-source test corpora + media generated with the
// project's own ffmpeg.wasm (run in Node). Output is committed; re-run only to refresh.
//   node scripts/make-fixtures.mjs [cacheDir]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests/fixtures');
const cache = process.argv[2] || join(root, 'node_modules/.cache/fixtures');
mkdirSync(cache, { recursive: true });
for (const d of ['images', 'pdf', 'media', 'sheets']) mkdirSync(join(out, d), { recursive: true });

const SDISTS = {
  pillow: ['https://files.pythonhosted.org/packages/ce/a4/9cc30690a394a8305e8be4c9036aa16d0dfddadd09079860b582f562496d/pillow-13.0.0.tar.gz', 'cdcd1ba258178f7356d74170c9a81ba4eab6a5d55748bc402a5a2a6fe6be3510'],
  heif: ['https://files.pythonhosted.org/packages/44/c1/82145984920ca055675af2c2795bd30da6f7461215c41f3c1eacb3d66353/pillow_heif-1.8.1.tar.gz', '521ebffb8a181d56c3904e5a61f20903edee0d9d3275967b8fb345f866215c06'],
  pypdf: ['https://files.pythonhosted.org/packages/60/d3/367aa9baefaededd3321cde46bbcb9f008bb51cef3a6b745608352a99534/pypdf-7.1.0.tar.gz', 'ca3fa902369e98a6d2cb7b56396de902b72ef9bb3c1e8706c1bfc7d8bd0cf0d7'],
  skimage: ['https://files.pythonhosted.org/packages/a1/b4/2528bb43c67d48053a7a649a9666432dc307d66ba02e3a6d5c40f46655df/scikit_image-0.26.0.tar.gz', 'f5f970ab04efad85c24714321fcc91613fcb64ef2a892a13167df2f3e59199fa'],
  calamine: ['https://files.pythonhosted.org/packages/68/ec/923684e9d817b4b317942c9dd36a66cd213a3c0abcb3c58d2cb22e3a4355/python_calamine-0.9.1.tar.gz', '458094c3dd41bd330c0a43d20e23489964ba28b3301687f1c5acc03c81d06a9f'],
};
const PICK = [
  ['skimage', 'scikit_image-0.26.0/src/skimage/data/astronaut.png', 'images/astronaut.png'],
  ['skimage', 'scikit_image-0.26.0/src/skimage/data/chelsea.png', 'images/chelsea.png'],
  ['skimage', 'scikit_image-0.26.0/src/skimage/data/coffee.png', 'images/coffee.png'],
  ['skimage', 'scikit_image-0.26.0/src/skimage/data/page.png', 'images/page.png'],
  ['skimage', 'scikit_image-0.26.0/src/skimage/data/text.png', 'images/text.png'],
  ['pillow', 'pillow-13.0.0/Tests/images/exif_gps.jpg', 'images/exif_gps.jpg'],
  ['pillow', 'pillow-13.0.0/Tests/images/flower.jpg', 'images/flower.jpg'],
  ['heif', 'pillow_heif-1.8.1/tests/images/heif_other/pug.heic', 'images/pug.heic'],
  ['heif', 'pillow_heif-1.8.1/tests/images/heif_special/xiaomi.heic', 'images/xiaomi.heic'],
  ['pypdf', 'pypdf-7.1.0/resources/crazyones.pdf', 'pdf/crazyones.pdf'],
  ['pypdf', 'pypdf-7.1.0/resources/form.pdf', 'pdf/form.pdf'],
  ['pypdf', 'pypdf-7.1.0/resources/two-different-pages.pdf', 'pdf/two-different-pages.pdf'],
  ['pypdf', 'pypdf-7.1.0/resources/side-by-side-subfig.pdf', 'pdf/side-by-side-subfig.pdf'],
  ['pypdf', 'pypdf-7.1.0/resources/jpeg.pdf', 'pdf/jpeg.pdf'],
  ['pypdf', 'pypdf-7.1.0/resources/Seige_of_Vicksburg_Sample_OCR.pdf', 'pdf/vicksburg-ocr.pdf'],
  ['pypdf', 'pypdf-7.1.0/resources/encryption/r3-user-password.pdf', 'pdf/rc4-128-asdfzxcv.pdf'],
  ['pypdf', 'pypdf-7.1.0/resources/encryption/r4-aes-user-password.pdf', 'pdf/aes128-asdfzxcv.pdf'],
  ['pypdf', 'pypdf-7.1.0/resources/encryption/r6-user-password.pdf', 'pdf/aes256-asdfzxcv.pdf'],
  ...['base.xlsx', 'base.xls', 'base.xlsb', 'base.ods', 'any_sheets.xlsx', 'password.xlsx', 'empty_file.xlsx'].map((f) => ['calamine', `python_calamine-0.9.1/tests/data/${f}`, `sheets/${f}`]),
];

const sha = (b) => createHash('sha256').update(b).digest('hex');
for (const [k, [url, digest]] of Object.entries(SDISTS)) {
  const f = join(cache, url.split('/').pop());
  if (!existsSync(f)) execFileSync('curl', ['-fsSL', '-o', f, url]);
  if (sha(readFileSync(f)) !== digest) throw new Error(`checksum mismatch for ${k}`);
}
for (const [k, member, dest] of PICK) {
  const tgz = join(cache, SDISTS[k][0].split('/').pop());
  execFileSync('tar', ['-xzf', tgz, '-C', cache, member]);
  copyFileSync(join(cache, member), join(out, dest));
}

// ------------------------------------------------------------------ media via ffmpeg.wasm (Node shim)
globalThis.self = globalThis;
globalThis.location = { href: 'file:///ffmpeg-core.js' };
const require = createRequire(import.meta.url);
const coreDir = join(root, 'node_modules/@ffmpeg/core/dist/umd');
const createCore = require(join(coreDir, 'ffmpeg-core.js'));
async function ffmpeg(args, inputs = {}, outputs = []) {
  const core = await (createCore.default || createCore)({ wasmBinary: readFileSync(join(coreDir, 'ffmpeg-core.wasm')) });
  core.setLogger?.(() => {});
  for (const [name, data] of Object.entries(inputs)) core.FS.writeFile(name, data);
  core.exec(...args);
  return Object.fromEntries(outputs.map((o) => [o, core.FS.readFile(o)]));
}
const save = (name, data) => writeFileSync(join(out, name), data);
const lavfi = ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3'];
save('media/clip.mp4', (await ffmpeg(['-y', ...lavfi, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'clip.mp4'], {}, ['clip.mp4']))['clip.mp4']);
save('media/clip.webm', (await ffmpeg(['-y', ...lavfi, '-c:v', 'libvpx', '-b:v', '400k', '-c:a', 'libvorbis', '-shortest', 'clip.webm'], {}, ['clip.webm']))['clip.webm']);
save('media/tone.wav', (await ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=2', '-c:a', 'pcm_s16le', 'tone.wav'], {}, ['tone.wav']))['tone.wav']);
save('media/tone.mp3', (await ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=44100:duration=2', '-c:a', 'libmp3lame', '-b:a', '128k', 'tone.mp3'], {}, ['tone.mp3']))['tone.mp3']);
save('media/noisy-tone.wav', (await ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=3', '-f', 'lavfi', '-i', 'anoisesrc=color=white:amplitude=0.08:sample_rate=48000:duration=3', '-filter_complex', 'amix=inputs=2:normalize=0', '-c:a', 'pcm_s16le', 'n.wav'], {}, ['n.wav']))['n.wav']);
// JPEGs made with Chromium's encoder (ffmpeg.wasm's PNG decoder is unreliable under Node):
// coffee.jpg, and coffee-orientation6.jpg whose pixels are rotated 90° CCW with EXIF Orientation=6 (displays upright).
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
const png = readFileSync(join(out, 'images/coffee.png')).toString('base64');
const [plainB64, rotB64] = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const enc = (c) => c.toDataURL('image/jpeg', 0.9).split(',')[1];
  const a = document.createElement('canvas'); a.width = img.width; a.height = img.height; a.getContext('2d').drawImage(img, 0, 0);
  const r = document.createElement('canvas'); r.width = img.height; r.height = img.width;
  const g = r.getContext('2d'); g.translate(0, img.width); g.rotate(-Math.PI / 2); g.drawImage(img, 0, 0);
  return [enc(a), enc(r)];
}, png);
await browser.close();
save('images/coffee.jpg', Buffer.from(plainB64, 'base64'));
const rot = Buffer.from(rotB64, 'base64');
const tiff = Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0]);
const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), Buffer.from('Exif\0\0'), tiff]);
app1.writeUInt16BE(app1.length - 2, 2);
save('images/coffee-orientation6.jpg', Buffer.concat([rot.subarray(0, 2), app1, rot.subarray(2)]));
// coffee-gps.jpg: a fully valid EXIF block (camera, date, exposure, GPS = Gateway of India, Mumbai).
function tiffExif() {
  const entries = (list) => list; // [tag, type, count, valueBytes]
  const ascii = (s) => Buffer.from(s + '\0', 'ascii');
  const rat = (pairs) => { const b = Buffer.alloc(pairs.length * 8); pairs.forEach(([n, d], i) => { b.writeUInt32BE(n, i * 8); b.writeUInt32BE(d, i * 8 + 4); }); return b; };
  const short = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
  const ifds = {
    ifd0: entries([[0x010f, 2, 'SuperToolsCam'], [0x0110, 2, 'Fixture One'], [0x0131, 2, 'make-fixtures'], [0x8769, 4, 'EXIF'], [0x8825, 4, 'GPS']]),
    exif: entries([[0x829a, 5, [[1, 250]]], [0x829d, 5, [[18, 10]]], [0x8827, 3, 200], [0x9003, 2, '2025:12:31 18:45:00'], [0x920a, 5, [[26, 10]]]]),
    gps: entries([[1, 2, 'N'], [2, 5, [[18, 1], [55, 1], [1956, 100]]], [3, 2, 'E'], [4, 5, [[72, 1], [50, 1], [480, 100]]]]),
  };
  // layout: header(8) | ifd0 | exif | gps | data
  const size = (n) => 2 + n * 12 + 4;
  const off0 = 8, offE = off0 + size(5), offG = offE + size(5), dataStart = offG + size(4);
  const data = []; let dataOff = dataStart;
  const enc = (tag, type, v) => {
    let bytes = type === 2 ? ascii(v) : type === 5 ? rat(v) : type === 3 ? short(v) : null;
    if (type === 4) { const b = Buffer.alloc(4); b.writeUInt32BE(v === 'EXIF' ? offE : offG); return [tag, 4, 1, b]; }
    const count = type === 2 ? bytes.length : type === 5 ? v.length : 1;
    if (bytes.length <= 4) { const b = Buffer.alloc(4); bytes.copy(b); return [tag, type, count, b]; }
    const b = Buffer.alloc(4); b.writeUInt32BE(dataOff); data.push(bytes); dataOff += bytes.length + (bytes.length & 1); if (bytes.length & 1) data.push(Buffer.alloc(1));
    return [tag, type, count, b];
  };
  const ifd = (list) => { const b = Buffer.alloc(size(list.length)); b.writeUInt16BE(list.length, 0); list.map(([t, ty, v]) => enc(t, ty, v)).forEach(([t, ty, c, val], i) => { const o = 2 + i * 12; b.writeUInt16BE(t, o); b.writeUInt16BE(ty, o + 2); b.writeUInt32BE(c, o + 4); val.copy(b, o + 8); }); return b; };
  const head = Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8]);
  return Buffer.concat([head, ifd(ifds.ifd0), ifd(ifds.exif), ifd(ifds.gps), ...data]);
}
{
  const t = tiffExif();
  const a1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), Buffer.from('Exif\0\0'), t]);
  a1.writeUInt16BE(a1.length - 2, 2);
  const base = readFileSync(join(out, 'images/coffee.jpg'));
  save('images/coffee-gps.jpg', Buffer.concat([base.subarray(0, 2), a1, base.subarray(2)]));
}
console.log('fixtures written to tests/fixtures/');
