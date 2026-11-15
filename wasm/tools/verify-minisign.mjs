// Verifies a minisign "ED" (prehashed) signature with Node's built-in crypto.
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
const [file, sigFile, pubB64] = process.argv.slice(2);
const pub = Buffer.from(pubB64, 'base64');
const lines = readFileSync(sigFile, 'utf8').split('\n');
const sig = Buffer.from(lines[1], 'base64');
const trusted = lines[2].replace(/^trusted comment: /, '');
const gsig = Buffer.from(lines[3], 'base64');
if (sig.subarray(0, 2).toString() !== 'ED') throw new Error('not prehashed ED sig');
if (!sig.subarray(2, 10).equals(pub.subarray(2, 10))) throw new Error('key id mismatch');
const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10)]), format: 'der', type: 'spki' });
const digest = crypto.createHash('blake2b512').update(readFileSync(file)).digest();
const ok1 = crypto.verify(null, digest, key, sig.subarray(10));
const ok2 = crypto.verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted)]), key, gsig);
console.log('file signature:', ok1, ' trusted comment signature:', ok2, ' |', trusted);
process.exit(ok1 && ok2 ? 0 : 1);
