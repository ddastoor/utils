// The offline speech script of the Text-to-Speech tab, run for real (to-do #13) — only with OFFLINE_TTS_E2E=1: on Linux the
// .sh; on Windows the .cmd, as a double-click runs it (the Windows check: .github/workflows/windows-tts.yml — this sandbox
// has no PowerShell). uv from PyPI (SHA-256), Python, Piper and a voice from Hugging Face (about 150 MB of downloads): a
// WAV and an MP3 checked, the installed versions held to the lock; on Windows also a voice that cannot be made, which
// must end with exit code 1 (the script ended with 0 whatever happened).
// OFFLINE_TTS_VOICES=id,id… runs those voices of the catalogue instead, in the script the tab writes for them
// (scriptFor): a WAV and an MP3 of each, every engine's packages held to its lock — the Windows check runs one engine
// a job (.github/workflows/windows-tts.yml, input "voices").
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export default async (t, { load }) => {
  if (process.env.OFFLINE_TTS_E2E !== '1') { t.ok(true, 'the script is run for real with OFFLINE_TTS_E2E=1 (about 150 MB of downloads)'); return; }
  const S = await load('/src/lib/offline-tts/scripts.ts');
  const win = process.platform === 'win32', sys = win ? 'Windows' : 'Linux';
  const cat = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/lib/offline-tts/catalogue.json', import.meta.url)), 'utf8'));
  // a WAV's length from its chunks (whatever wrote it); the versions an engine's environment holds against its lock
  // (PyTorch keeps its version, not its build: 2.9.1+cpu is 2.9.1)
  const wavInfo = (b) => {
    let rate = 0, bytesPerSec = 0, data = 0;
    for (let o = 12; o + 8 <= b.length; o += 8 + b.readUInt32LE(o + 4) + (b.readUInt32LE(o + 4) & 1)) {
      const id = b.toString('ascii', o, o + 4);
      if (id === 'fmt ') { rate = b.readUInt32LE(o + 12); bytesPerSec = b.readUInt32LE(o + 16); }
      if (id === 'data') { data = Math.min(b.readUInt32LE(o + 4), b.length - o - 8); break; }
    }
    return { riff: b.toString('ascii', 0, 4) === 'RIFF', rate, secs: bytesPerSec ? data / bytesPerSec : 0 };
  };
  const pins = (dir, engine) => (spawnSync(join(dir, 'bin', win ? 'uv.exe' : 'uv'), ['pip', 'freeze', '--python', join(dir, 'envs', engine, ...(win ? ['Scripts', 'python.exe'] : ['bin', 'python']))], { encoding: 'utf8' }).stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const offLock = (freeze, lock) => { const L = new Set(lock.map((l) => l.split(' ; ')[0].trim().toLowerCase())); return freeze.filter((l) => !L.has(l.replace(/\+[a-z0-9.]+$/i, '').toLowerCase())); };
  const runScript = (home, dir, script, timeout) => {
    if (win) { const f = join(home, 'tts.cmd'); writeFileSync(f, script); return spawnSync('cmd.exe', ['/d', '/c', f], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 256 << 20 }); }
    const f = join(home, 'tts.sh'); writeFileSync(f, script);
    return spawnSync('bash', [f], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: dir, UV_PYTHON_PREFERENCE: process.env.UV_PYTHON_PREFERENCE || 'system' }, timeout, maxBuffer: 256 << 20 });
  };
  if (process.env.OFFLINE_TTS_VOICES) {
    const ids = process.env.OFFLINE_TTS_VOICES.split(',').map((x) => x.trim()).filter(Boolean);
    const P = await load('/src/lib/offline-tts/plan.ts');
    const plan = P.planOf(cat, ids);
    t.eq(plan.voices.map((v) => v.id).sort(), [...ids].sort(), `the voices are in the catalogue (${ids.join(', ')})`);
    const home = mkdtempSync(join(tmpdir(), 'stts-home-')), dir = join(home, 'SuperUtils-TTS');
    const driverText = readFileSync(fileURLToPath(new URL('../../src/lib/offline-tts/driver.py', import.meta.url)), 'utf8');
    const script = P.scriptFor(win ? 'windows' : 'linux', cat, plan, { text: 'Hello from SuperUtils. This voice was made on this computer.', speed: 1, mp3: true, driver: driverText, made: '21 Nov 2026', site: 'https://ddastoor.github.io/utils/#/tts' });
    const t0 = Date.now(), r = runScript(home, dir, script, 6000000), mins = ((Date.now() - t0) / 60000).toFixed(1);
    const said = `${r.stdout || ''}${r.stderr || ''}`;
    const out = join(dir, 'output'), runDir = existsSync(out) ? readdirSync(out)[0] : '';
    const files = runDir ? readdirSync(join(out, runDir)) : [];
    console.log(`${sys}: ${plan.engines.join(', ')} — exit ${r.status} after ${mins} min; files: ${files.join(', ')}`);
    t.ok(r.status === 0 && /Done\. The speech is in/.test(said), `the ${sys} script ran to the end (exit ${r.status}, ${mins} min${r.error ? `, ${r.error.message}` : ''}): ${said.slice(-3000)}`);
    for (const v of plan.voices) {
      const w = files.includes(`${v.id}.wav`) ? wavInfo(readFileSync(join(out, runDir, `${v.id}.wav`))) : null;
      const mp3 = files.includes(`${v.id}.mp3`) ? readFileSync(join(out, runDir, `${v.id}.mp3`)).length : 0;
      console.log(`  ${v.id}: ${w ? `${w.secs.toFixed(1)} s at ${w.rate} Hz` : 'no WAV'}, MP3 ${mp3} bytes`);
      t.ok(w && w.riff && w.secs > 1 && w.secs < 30 && mp3 > 5000, `${sys}: ${v.id} — a WAV of ${w ? w.secs.toFixed(1) : 0} s and an MP3 of ${mp3} bytes`);
    }
    for (const e of plan.engines) {
      const got = pins(dir, e), off = offLock(got, cat.engines[e].lock || []);
      t.ok(got.length > 3 && !off.length, `${sys}: ${e}'s environment holds the lock's versions (${got.length} packages${off.length ? `; not in the lock: ${off.join(', ')}` : ''})`);
    }
    return;
  }
  const driver = readFileSync(fileURLToPath(new URL('../../src/lib/offline-tts/driver.py', import.meta.url)), 'utf8');
  const job = { speed: 1.1, mp3: true };
  const runs = [{ engine: 'piper', name: 'Piper', voices: 1 }];
  const input = { driver, made: '21 Nov 2026', site: 'https://ddastoor.github.io/utils/#/tts' };
  const home = mkdtempSync(join(tmpdir(), 'stts-home-'));
  const small = { ...job, text: 'Hello from the offline mode. This sentence was made on this computer.', voices: [{ id: 'piper-lessac-low', label: 'Lessac (low)', engine: 'piper', repo: 'rhasspy/piper-voices', rev: 'e9c8a39444359388adaa94255becb37a5a2b8e51', file: 'en/en_US/lessac/low/en_US-lessac-low.onnx' }] };
  // the catalogue's own Piper — its pins and its lock (the versions installed are the lock's)
  const catL = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/lib/offline-tts/catalogue.json', import.meta.url)), 'utf8'));
  const dir = join(home, 'SuperUtils-TTS');
  const small1 = { ...input, job: small, runs: [{ ...runs[0], packages: catL.engines.piper.packages, lock: catL.engines.piper.lock }] };
  let r;
  if (win) {
    // as a double-click runs it: cmd.exe on the .cmd (uv's own Python from GitHub, as on the owner's PC); no keyboard,
    // so the closing "pause" goes on at once
    const f = join(home, 'tts.cmd'); writeFileSync(f, S.windowsScript(small1));
    r = spawnSync('cmd.exe', ['/d', '/c', f], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 1800000 });
  } else {
    const f = join(home, 'tts.sh'); writeFileSync(f, S.linuxScript(small1));
    // (the sandbox reaches PyPI and Hugging Face but not GitHub, where uv's own Python builds are: a system 3.12 here)
    r = spawnSync('bash', [f], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: dir, UV_PYTHON_PREFERENCE: 'system' }, timeout: 900000 });
  }
  const out = join(dir, 'output'), runDir = existsSync(out) ? readdirSync(out)[0] : '';
  const files = runDir ? readdirSync(join(out, runDir)) : [];
  const freeze = (spawnSync(join(dir, 'bin', win ? 'uv.exe' : 'uv'), ['pip', 'freeze', '--python', join(dir, 'envs', 'piper', ...(win ? ['Scripts', 'python.exe'] : ['bin', 'python']))], { encoding: 'utf8' }).stdout || '').trim().split(/\r?\n/);
  const lockOf = (l) => l.split(' ; ')[0];
  t.ok(freeze.length > 5 && freeze.every((l) => catL.engines.piper.lock.map(lockOf).includes(l)), `the ${sys} script installed exactly the lock's versions (${freeze.filter((l) => !catL.engines.piper.lock.map(lockOf).includes(l)).join(', ') || 'all of them'})`);
  const said = `${r.stdout || ''}${r.stderr || ''}`;
  t.ok(r.status === 0 && files.includes('piper-lessac-low.wav') && files.includes('piper-lessac-low.mp3') && /Done\. The speech is in/.test(said), `the ${sys} script ran: uv, Piper, a WAV and an MP3 (${files.join(', ')}; exit ${r.status}; ${said.slice(-1500)})`);
  if (runDir) {
    const wav = readFileSync(join(out, runDir, 'piper-lessac-low.wav')), mp3 = readFileSync(join(out, runDir, 'piper-lessac-low.mp3'));
    const rate = wav.readUInt32LE(24), secs = (wav.length - 44) / 2 / rate;
    t.ok(wav.toString('ascii', 0, 4) === 'RIFF' && rate === 16000 && secs > 2 && secs < 15 && mp3.length > 10000, `${sys}: the WAV is ${secs.toFixed(1)} s at ${rate} Hz, the MP3 ${mp3.length} bytes`);
  }
  if (win) {
    // a run that cannot work says so with its exit code: a voice file that does not exist on Hugging Face
    const bad = { ...small1, job: { ...small, voices: [{ ...small.voices[0], id: 'piper-missing', file: 'en/en_US/lessac/low/no-such-voice.onnx' }] } };
    const f2 = join(home, 'bad.cmd'); writeFileSync(f2, S.windowsScript(bad));
    const r2 = spawnSync('cmd.exe', ['/d', '/c', f2], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    t.ok(r2.status === 1 && /It stopped: Stopped with an error: Piper/.test(`${r2.stdout}${r2.stderr}`), `Windows: a voice that cannot be made — exit code 1 and the reason (exit ${r2.status}; ${`${r2.stdout}${r2.stderr}`.slice(-600)})`);
  }
};
