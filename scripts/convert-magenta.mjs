// Converts Magenta's legacy TF.js "arbitrary image stylization" checkpoints (tensorflowjs_model.pb GraphDef +
// weights_manifest.json, the format TF.js < 1.0 loaded) into the current graph-model format (model.json) that
// tf.loadGraphModel understands. Pure Node, no dependencies: a minimal protobuf reader for the GraphDef subset used.
//   node scripts/convert-magenta.mjs <dir-with-tensorflowjs_model.pb-and-weights_manifest.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DT = ['DT_INVALID', 'DT_FLOAT', 'DT_DOUBLE', 'DT_INT32', 'DT_UINT8', 'DT_INT16', 'DT_INT8', 'DT_STRING', 'DT_COMPLEX64', 'DT_INT64', 'DT_BOOL', 'DT_QINT8', 'DT_QUINT8', 'DT_QINT32', 'DT_BFLOAT16', 'DT_QINT16', 'DT_QUINT16', 'DT_UINT16', 'DT_COMPLEX128', 'DT_HALF', 'DT_RESOURCE', 'DT_VARIANT', 'DT_UINT32', 'DT_UINT64'];
const dt = (n) => (n >= 101 ? DT[n - 100] + '_REF' : DT[n]);

const TD = new TextDecoder();
class R {
  constructor(b, s = 0, e = b.length) { this.b = b; this.p = s; this.e = e; }
  more() { return this.p < this.e; }
  varint() { let x = 0n, s = 0n; for (;;) { const c = this.b[this.p++]; x |= BigInt(c & 0x7f) << s; if (!(c & 0x80)) return x; s += 7n; } }
  key() { const k = Number(this.varint()); return [k >>> 3, k & 7]; }
  bytes() { const n = Number(this.varint()); const s = this.p; this.p += n; return this.b.subarray(s, s + n); }
  str() { return TD.decode(this.bytes()); }
  sub() { const n = Number(this.varint()); const r = new R(this.b, this.p, this.p + n); this.p += n; return r; }
  f32() { const v = Buffer.from(this.b.buffer, this.b.byteOffset + this.p, 4).readFloatLE(0); this.p += 4; return v; }
  skip(w) { if (w === 0) this.varint(); else if (w === 1) this.p += 8; else if (w === 2) this.bytes(); else if (w === 5) this.p += 4; else throw new Error('wire ' + w); }
}
const i64 = (v) => BigInt.asIntN(64, v).toString();
const packed = (r, w, read) => { const out = []; if (w === 2) { const s = r.sub(); while (s.more()) out.push(read(s)); } else out.push(read(r)); return out; };
const b64 = (u8) => Buffer.from(u8).toString('base64');

function shape(r) { const o = { dim: [] }; while (r.more()) { const [f, w] = r.key(); if (f === 2) { const d = r.sub(), dim = {}; while (d.more()) { const [g, w2] = d.key(); if (g === 1) dim.size = i64(d.varint()); else if (g === 2) dim.name = d.str(); else d.skip(w2); } o.dim.push(dim); } else if (f === 3) o.unknownRank = !!Number(r.varint()); else r.skip(w); } if (!o.dim.length) delete o.dim; return o; }
function tensor(r) {
  const o = {};
  while (r.more()) {
    const [f, w] = r.key();
    if (f === 1) o.dtype = dt(Number(r.varint()));
    else if (f === 2) o.tensorShape = shape(r.sub());
    else if (f === 3) o.versionNumber = Number(r.varint());
    else if (f === 4) o.tensorContent = b64(r.bytes());
    else if (f === 5) (o.floatVal ||= []).push(...packed(r, w, (s) => s.f32()));
    else if (f === 7) (o.intVal ||= []).push(...packed(r, w, (s) => Number(BigInt.asIntN(32, s.varint()))));
    else if (f === 8) (o.stringVal ||= []).push(b64(r.bytes()));
    else if (f === 10) (o.int64Val ||= []).push(...packed(r, w, (s) => i64(s.varint())));
    else if (f === 11) (o.boolVal ||= []).push(...packed(r, w, (s) => !!Number(s.varint())));
    else r.skip(w);
  }
  return o;
}
function list(r) {
  const o = {};
  while (r.more()) {
    const [f, w] = r.key();
    if (f === 2) (o.s ||= []).push(b64(r.bytes()));
    else if (f === 3) (o.i ||= []).push(...packed(r, w, (s) => i64(s.varint())));
    else if (f === 4) (o.f ||= []).push(...packed(r, w, (s) => s.f32()));
    else if (f === 5) (o.b ||= []).push(...packed(r, w, (s) => !!Number(s.varint())));
    else if (f === 6) (o.type ||= []).push(...packed(r, w, (s) => dt(Number(s.varint()))));
    else if (f === 7) (o.shape ||= []).push(shape(r.sub()));
    else if (f === 8) (o.tensor ||= []).push(tensor(r.sub()));
    else r.skip(w);
  }
  return o;
}
function attr(r) {
  const o = {};
  while (r.more()) {
    const [f, w] = r.key();
    if (f === 1) o.list = list(r.sub());
    else if (f === 2) o.s = b64(r.bytes());
    else if (f === 3) o.i = i64(r.varint());
    else if (f === 4) o.f = r.f32();
    else if (f === 5) o.b = !!Number(r.varint());
    else if (f === 6) o.type = dt(Number(r.varint()));
    else if (f === 7) o.shape = shape(r.sub());
    else if (f === 8) o.tensor = tensor(r.sub());
    else if (f === 9) o.placeholder = r.str();
    else r.skip(w);
  }
  return o;
}
function node(r) {
  const o = { name: '', op: '', input: [], attr: {} };
  while (r.more()) {
    const [f, w] = r.key();
    if (f === 1) o.name = r.str();
    else if (f === 2) o.op = r.str();
    else if (f === 3) o.input.push(r.str());
    else if (f === 4) o.device = r.str();
    else if (f === 5) { const e = r.sub(); let k = '', v = {}; while (e.more()) { const [g, w2] = e.key(); if (g === 1) k = e.str(); else if (g === 2) v = attr(e.sub()); else e.skip(w2); } o.attr[k] = v; }
    else r.skip(w);
  }
  if (!o.input.length) delete o.input;
  return o;
}
export function convert(dir) {
  const pb = new Uint8Array(readFileSync(join(dir, 'tensorflowjs_model.pb')));
  const r = new R(pb), nodes = [], versions = {};
  while (r.more()) {
    const [f, w] = r.key();
    if (f === 1) nodes.push(node(r.sub()));
    else if (f === 4) { const v = r.sub(); while (v.more()) { const [g, w2] = v.key(); if (g === 1) versions.producer = Number(v.varint()); else if (g === 2) versions.minConsumer = Number(v.varint()); else v.skip(w2); } }
    else r.skip(w);
  }
  const weightsManifest = JSON.parse(readFileSync(join(dir, 'weights_manifest.json'), 'utf8'));
  const model = { format: 'graph-model', generatedBy: 'magenta (legacy tfjs)', convertedBy: 'SuperUtils scripts/convert-magenta.mjs', modelTopology: { node: nodes, library: {}, versions }, weightsManifest };
  writeFileSync(join(dir, 'model.json'), JSON.stringify(model));
  return { nodes: nodes.length, ops: [...new Set(nodes.map((n) => n.op))].sort() };
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(convert(process.argv[2])));
