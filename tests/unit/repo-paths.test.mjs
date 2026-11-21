// Every file of the repository can exist on Windows (to-do #13: the Windows check's first run could not even check the
// repository out — public/data/dict/con.json: CON is a device name there, whatever the extension).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
export default async (t, { load }) => {
  const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
  t.ok(paths.length > 1000, `${paths.length} files in the repository`);
  const DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)$/i;
  const bad = paths.filter((p) => p.split('/').some((part) => DEVICE.test(part.split('.')[0]) || /[<>:"\\|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part)));
  t.eq(bad, [], 'no file or folder named after a Windows device (CON, PRN, AUX, NUL, COM1 …, LPT1 …), none with < > : " \\ | ? * or a control character, none ending with a dot or a space');
  const seen = new Map(), clash = [];
  for (const p of paths) { const k = p.toLowerCase(); if (seen.has(k)) clash.push(`${seen.get(k)} / ${p}`); else seen.set(k, p); }
  t.eq(clash, [], 'no two paths differ only by the case of their letters (one folder on Windows and macOS)');
  t.ok(paths.every((p) => p.length <= 200), `no path longer than 200 characters (Windows' 260 with room for the folder it is cloned to; the longest: ${Math.max(...paths.map((p) => p.length))})`);

  // the dictionary's shards: the file of each, as the page fetches it
  const { shardFile } = await load('src/lib/dictionary.ts');
  t.eq([shardFile('con'), shardFile('PRN'), shardFile('nul'), shardFile('com1'), shardFile('co'), shardFile('cona'), shardFile('lpt')], ['con_.json', 'PRN_.json', 'nul_.json', 'com1_.json', 'co.json', 'cona.json', 'lpt.json'], 'a shard named after a device takes an underscore, the others keep their names');
  const meta = JSON.parse(readFileSync('public/data/dict/meta.json', 'utf8'));
  const missing = meta.files.filter((n) => !existsSync(`public/data/dict/${shardFile(n)}`));
  t.eq(missing, [], `every one of the ${meta.files.length} shards of meta.json is there under the name the page asks for`);
  const extra = readdirSync('public/data/dict').filter((f) => !['meta.json', 'freq.txt'].includes(f) && !meta.files.some((n) => shardFile(n) === f));
  t.eq(extra, [], 'and no other file');
  const con = JSON.parse(readFileSync('public/data/dict/con_.json', 'utf8'));
  t.ok(con.conundrum && con.contrite, 'con_.json holds the words that begin with "con" (conundrum, contrite)');
};
