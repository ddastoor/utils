// Builds the Photo Dictionary data in public/data/dict/ (committed; regenerate by hand when you want newer data):
//   freq.txt         English word frequencies from wordfreq 3.1.1 "large_en" (CC-BY-SA 4.0), one line per Zipf×10
//                    bucket: "<zipf10> word word word…", read by textcore.wasm (t_freq_load) for ranking.
//   <xx>.json        English Wiktionary entries (kaikki.org / wiktextract, CC-BY-SA 4.0 + GFDL) sharded by the first two
//                    letters of the word (accents folded, other characters → "_"), only for words wordfreq knows (plus
//                    the lemmas their inflected forms point to). Anything rarer is looked up online by the tool.
//   meta.json        sources, SHA-256 of every input, counts, licences.
// Usage: node scripts/build-dict.mjs [--kaikki <local .jsonl>]   (default: streams the file from kaikki.org, ~3.4 GB)
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, rmSync, createReadStream, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public/data/dict');
const WORDFREQ = { url: 'https://files.pythonhosted.org/packages/24/61/62835c475d69872d30689f284497853fe33fe1d6dd18f57346d13305861d/wordfreq-3.1.1-py3-none-any.whl', sha256: '4b1c6ecffc6198be3396d5cf871c4423ca71c907c231348d352dd54d62b97473' };
const KAIKKI = 'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl';
const args = process.argv.slice(2), localKaikki = args.includes('--kaikki') ? args[args.indexOf('--kaikki') + 1] : null;

// ------------------------------------------------------------------ tokens and shards (the tool uses the same rules)
const TOKEN = /^\p{L}[\p{L}'-]*$/u;
export const keyOf = (w) => w.normalize('NFC').replace(/[’ʼ]/g, "'").toLowerCase();
const SPLIT = 300_000;
const fold = (key, n) => [...key.normalize('NFD').replace(/\p{M}/gu, '').slice(0, n).padEnd(n, '_')].map((c) => (/[a-z]/.test(c) ? c : '_')).join('');
/** Shard file name for a key: first two letters (accents folded, others "_"), three for the shards listed in `split`. */
export const shardOf = (key, split = []) => { const two = fold(key, 2); return split.includes(two) ? fold(key, 3) : two; };

// ------------------------------------------------------------------ wordfreq (cBpack: msgpack [header, bucket0, bucket1, …])
function msgpack(buf) {
  let p = 0;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), td = new TextDecoder();
  const str = (n) => { const s = td.decode(buf.subarray(p, p + n)); p += n; return s; };
  const arr = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(read()); return a; };
  const map = (n) => { const o = {}; for (let i = 0; i < n; i++) { const k = read(); o[k] = read(); } return o; };
  function read() {
    const b = buf[p++];
    if (b <= 0x7f) return b; if (b >= 0xe0) return b - 256;
    if ((b & 0xf0) === 0x80) return map(b & 15); if ((b & 0xf0) === 0x90) return arr(b & 15); if ((b & 0xe0) === 0xa0) return str(b & 31);
    switch (b) {
      case 0xc0: return null; case 0xc2: return false; case 0xc3: return true;
      case 0xcc: return buf[p++]; case 0xcd: p += 2; return dv.getUint16(p - 2); case 0xce: p += 4; return dv.getUint32(p - 4);
      case 0xd0: p += 1; return dv.getInt8(p - 1); case 0xd1: p += 2; return dv.getInt16(p - 2); case 0xd2: p += 4; return dv.getInt32(p - 4);
      case 0xcb: p += 8; return dv.getFloat64(p - 8);
      case 0xd9: return str(buf[p++]); case 0xda: p += 2; return str(dv.getUint16(p - 2)); case 0xdb: p += 4; return str(dv.getUint32(p - 4));
      case 0xdc: p += 2; return arr(dv.getUint16(p - 2)); case 0xdd: p += 4; return arr(dv.getUint32(p - 4));
      case 0xde: p += 2; return map(dv.getUint16(p - 2)); case 0xdf: p += 4; return map(dv.getUint32(p - 4));
    }
    throw new Error(`msgpack: unsupported byte 0x${b.toString(16)} at ${p - 1}`);
  }
  return read();
}
function wordfreq() {
  const whl = execFileSync('curl', ['-fsSL', '--retry', '4', WORDFREQ.url], { maxBuffer: 1 << 28 });
  const got = createHash('sha256').update(whl).digest('hex');
  if (got !== WORDFREQ.sha256) throw new Error(`wordfreq wheel SHA-256 mismatch: ${got}`);
  const files = unzipSync(new Uint8Array(whl), { filter: (f) => f.name === 'wordfreq/data/large_en.msgpack.gz' });
  const [header, ...buckets] = msgpack(gunzipSync(files['wordfreq/data/large_en.msgpack.gz']));
  if (header?.format !== 'cB') throw new Error('unexpected wordfreq format');
  const zipf = new Map(); // key → zipf × 10 (bucket i = −i centibels → Zipf = 9 − i/100)
  buckets.forEach((words, i) => { const z = Math.max(0, Math.round((9 - i / 100) * 10)); for (const w of words) { const k = keyOf(w); if (TOKEN.test(k) && !zipf.has(k)) zipf.set(k, z); } });
  return zipf;
}

// ------------------------------------------------------------------ Wiktionary entries → compact form
const SKIP_POS = new Set(['name', 'character', 'symbol', 'punct', 'prefix', 'suffix', 'infix', 'interfix', 'circumfix', 'affix', 'phrase', 'proverb', 'romanization', 'contraction', 'prep_phrase']);
const LABELS = new Set(['obsolete', 'archaic', 'rare', 'slang', 'informal', 'dated', 'figuratively', 'US', 'UK', 'British', 'dialectal', 'colloquial', 'historical', 'formal', 'literary', 'poetic', 'humorous', 'derogatory', 'offensive', 'vulgar', 'euphemistic', 'nonstandard', 'Internet', 'Australia', 'India', 'Canada', 'Scotland', 'Ireland']);
const LATE = new Set(['obsolete', 'archaic', 'rare', 'dated', 'nonstandard']);
const POS_NAME = { adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction', pron: 'pronoun', det: 'determiner', intj: 'interjection', num: 'numeral' };
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

function compact(e) {
  const ipa = (e.sounds || []).filter((s) => s.ipa);
  const us = ipa.find((s) => (s.tags || []).some((t) => t === 'US' || t === 'General-American')) || ipa.find((s) => !s.tags) || ipa[0];
  let lemma = null, formGloss = null;
  const senses = [];
  for (const s of e.senses || []) {
    const tags = s.tags || [];
    const gl = s.raw_glosses || s.glosses || [];
    let g = gl[gl.length - 1];
    if (!g) continue;
    // a subsense like "…because it has already been mentioned" needs its parent sense in front
    if (gl.length > 1 && /^(\.\.\.|…)/.test(g)) g = `${gl[gl.length - 2].replace(/[.;:…]+\s*$/, '')}: ${g.replace(/^(\.\.\.|…)\s*/, '')}`;
    // "Commonwealth and Ireland standard spelling of color." → treat like an alternative spelling of color
    const spelled = !s.form_of && !s.alt_of ? /\bspelling of ([\p{L}'-]+)\.?$/u.exec(g)?.[1] : null;
    const target = (s.form_of || s.alt_of || [])[0]?.word || spelled;
    if (target) { lemma ||= target; formGloss ||= clip(g, 160); continue; } // "plural of goose", "alternative spelling of color"
    const ex = (s.examples || []).find((x) => x.type === 'example' && x.text && x.text.length <= 200);
    const lab = tags.filter((t) => LABELS.has(t));
    senses.push({ g: clip(g, 300), ...(lab.length ? { t: lab.join(', ') } : {}), ...(ex ? { x: ex.text } : {}), late: tags.some((t) => LATE.has(t)) });
  }
  if (!senses.length && !lemma) return null;
  senses.sort((a, b) => a.late - b.late); // current senses first, obsolete / archaic ones last
  const out = { p: POS_NAME[e.pos] || e.pos };
  if (us) out.i = us.ipa;
  if (senses.length) out.s = senses.slice(0, 5).map(({ late, ...s }) => s);
  if (lemma && keyOf(lemma) !== keyOf(e.word)) { out.l = keyOf(lemma); out.f = formGloss; }
  return out;
}

async function* lines() {
  if (localKaikki) { yield* createInterface({ input: createReadStream(localKaikki), crlfDelay: Infinity }); return; }
  const c = spawn('curl', ['-fsSL', '--retry', '4', KAIKKI], { stdio: ['ignore', 'pipe', 'inherit'] });
  yield* createInterface({ input: c.stdout, crlfDelay: Infinity });
  const code = await new Promise((r) => (c.exitCode !== null ? r(c.exitCode) : c.on('close', r)));
  if (code) throw new Error(`curl failed (${code})`);
}

async function main() {
  console.log('wordfreq …');
  const zipf = wordfreq();
  console.log(`  ${zipf.size} English words`);
  const keep = new Map(), other = new Map(); // key → [entries]
  const hash = createHash('sha256');
  let n = 0, bytes = 0, en = 0;
  const t0 = Date.now();
  for await (const line of lines()) {
    hash.update(line); hash.update('\n'); bytes += Buffer.byteLength(line) + 1;
    if (++n % 200000 === 0) console.log(`  ${n} lines, ${(bytes / 1e9).toFixed(2)} GB, ${keep.size} kept, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (!line.includes('"lang_code": "en"')) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.lang_code !== 'en' || SKIP_POS.has(e.pos)) continue;
    const key = keyOf(e.word);
    if (!TOKEN.test(key) || key.length > 32) continue;
    const c = compact(e); if (!c) continue;
    en++;
    if (e.word !== key) c.w = e.word; // keep the dictionary spelling (capitals) when it differs from the lookup key
    const m = zipf.has(key) ? keep : other;
    (m.get(key) || m.set(key, []).get(key)).push(c);
  }
  // lemma closure: include the entries that kept inflected forms point to
  let added = 0;
  for (const list of [...keep.values()]) for (const c of list) if (c.l && !keep.has(c.l) && other.has(c.l)) { keep.set(c.l, other.get(c.l)); added++; }
  console.log(`  ${n} lines, ${en} English entries, ${keep.size} words kept (+${added} lemmas)`);

  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  // two-letter shards; any over SPLIT bytes is split again by the third letter (listed in meta.split)
  const sorted = [...keep].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const size2 = new Map();
  for (const [k, v] of sorted) { const s = shardOf(k); size2.set(s, (size2.get(s) || 0) + k.length + JSON.stringify(v).length + 4); }
  const split = [...size2].filter(([, n]) => n > SPLIT).map(([s]) => s).sort();
  const shards = new Map();
  for (const [k, v] of sorted) { const s = shardOf(k, split); (shards.get(s) || shards.set(s, {}).get(s))[k] = v; }
  let total = 0;
  for (const [s, obj] of shards) { const json = JSON.stringify(obj); total += json.length; writeFileSync(join(OUT, `${s}.json`), json); }
  // frequency table: one line per Zipf×10 bucket, highest first
  const byZ = new Map(); for (const [w, z] of zipf) (byZ.get(z) || byZ.set(z, []).get(z)).push(w);
  const freq = [...byZ.keys()].sort((a, b) => b - a).map((z) => `${z} ${byZ.get(z).join(' ')}`).join('\n') + '\n';
  writeFileSync(join(OUT, 'freq.txt'), freq);
  const meta = {
    built: new Date().toISOString().slice(0, 10),
    wiktionary: { source: KAIKKI, sha256: hash.digest('hex'), bytes, lines: n, englishEntries: en, words: keep.size, license: 'CC-BY-SA-4.0 AND GFDL-1.3 (Wiktionary contributors; extraction: wiktextract / kaikki.org, Tatu Ylonen)' },
    wordfreq: { source: WORDFREQ.url, sha256: WORDFREQ.sha256, words: zipf.size, license: 'CC-BY-SA-4.0 (data), Apache-2.0 (code); Robyn Speer, wordfreq 3.1.1' },
    shards: shards.size, split, files: [...shards.keys()].sort(), jsonBytes: total, freqBytes: freq.length,
  };
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(meta);
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main();
