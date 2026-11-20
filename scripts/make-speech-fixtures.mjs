// Speech fixtures for the Noise Remover's tests (real recordings, small):
//   speech/librispeech-1.flac  LibriSpeech test sample (CC BY 4.0, via huggingface.co/datasets/Narsil/asr_dummy),
//                              LibriSpeech test-clean 1089-134686-0000 ("He hoped there would be stew for dinner, …")
//   speech/noisy-speech.wav    librispeech-1 at 16 kHz + white noise at 5 dB SNR (seeded), 16-bit mono
// Sources are SHA-256 pinned. Run: node scripts/make-speech-fixtures.mjs (output is committed).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'tests/fixtures/speech');
mkdirSync(out, { recursive: true });
const SRC = {
  'librispeech-1.flac': ['https://huggingface.co/datasets/Narsil/asr_dummy/resolve/main/1.flac', '30885601173f96b0d8ddd020dc959b055c6c1582b85a33e3fcab8c4b08ed94c2'],
};
const cache = join(process.env.TMPDIR || '/tmp', 'speech-src'); mkdirSync(cache, { recursive: true });
const get = (name) => {
  const [url, sha] = SRC[name], p = join(cache, name);
  if (!existsSync(p)) execFileSync('curl', ['-fsSL', '--retry', '4', '-o', p, url]);
  const b = readFileSync(p), h = createHash('sha256').update(b).digest('hex');
  if (h !== sha) throw new Error(`${name}: SHA-256 ${h} ≠ pinned ${sha}`);
  return b;
};
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
const libri = get('librispeech-1.flac');
writeFileSync(join(out, 'librispeech-1.flac'), libri);
// clean speech at 16 kHz as float, then add seeded white noise at 5 dB SNR
const pcm = (await ffmpeg(['-y', '-i', 'in.flac', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'clean.raw'], { 'in.flac': libri }, ['clean.raw']))['clean.raw'];
const clean = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
let s = 0; for (const v of clean) s += v * v;
const sigRms = Math.sqrt(s / clean.length), noiseRms = sigRms / 10 ** (5 / 20);
let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const noisy = Buffer.alloc(44 + clean.length * 2);
noisy.write('RIFF', 0); noisy.writeUInt32LE(36 + clean.length * 2, 4); noisy.write('WAVEfmt ', 8); noisy.writeUInt32LE(16, 16); noisy.writeUInt16LE(1, 20); noisy.writeUInt16LE(1, 22);
noisy.writeUInt32LE(16000, 24); noisy.writeUInt32LE(32000, 28); noisy.writeUInt16LE(2, 32); noisy.writeUInt16LE(16, 34); noisy.write('data', 36); noisy.writeUInt32LE(clean.length * 2, 40);
for (let i = 0; i < clean.length; i++) noisy.writeInt16LE(Math.round(Math.max(-1, Math.min(1, clean[i] + gauss() * noiseRms)) * 32767), 44 + i * 2);
writeFileSync(join(out, 'noisy-speech.wav'), noisy);
console.log('speech fixtures written:', out);
