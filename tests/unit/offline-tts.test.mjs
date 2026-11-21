// The Text-to-Speech tab's offline mode (src/lib/offline-tts/): the scripts it writes for Windows (.cmd with PowerShell)
// and Linux (.sh), and driver.py. bash -n reads the Linux script; the Base64 parts decode to exactly the job and the
// driver; a text that a shell would act on stays text. With OFFLINE_TTS_E2E=1 the Linux script is run for real here:
// uv from PyPI (SHA-256), Piper and a voice from Hugging Face, a WAV and an MP3 made (about 150 MB of downloads).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async (t, { load }) => {
  const S = await load('/src/lib/offline-tts/scripts.ts');
  const driver = readFileSync(new URL('../../src/lib/offline-tts/driver.py', import.meta.url), 'utf8');
  const dec = (s) => Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');
  const tmp = mkdtempSync(join(tmpdir(), 'offline-tts-'));

  // Base64 of UTF-8: every script, every character
  for (const s of ['', 'plain', 'नमस्ते दुनिया', 'emoji 👍🏽 and “quotes”', '€ ₹ £', 'a'.repeat(100000)]) t.eq(dec(S.b64(s)), s, `Base64 round trip (${s.slice(0, 12) || 'empty'}…)`);

  const hostile = "Hello $(touch /tmp/pwned) `id` $HOME ${PATH} 'single' \"double\" \\back\\slash\nSUPERTOOLS_JOB\nSUPERTOOLS_DRIVER\n'@\n#>\n<#\nनमस्ते — ₹500";
  const job = { text: hostile, speed: 1.1, mp3: true, voices: [{ id: 'piper-vctk-p248', label: 'VCTK p248', engine: 'piper', repo: 'rhasspy/piper-voices', rev: 'e9c8a39444359388adaa94255becb37a5a2b8e51', file: 'en/en_GB/vctk/medium/en_GB-vctk-medium.onnx', speaker: 87 }] };
  const runs = [{ engine: 'piper', name: 'Piper', packages: ['piper-tts==1.8.0', 'huggingface-hub==2.4.0', 'lameenc==1.9.0', 'numpy==2.3.5'], voices: 1 }];
  const input = { job, driver, runs, made: '21 Nov 2026', site: 'https://ddastoor.github.io/utils/#/tts' };

  // Linux
  const sh = S.linuxScript(input), shf = join(tmp, 'tts.sh');
  writeFileSync(shf, sh);
  const syn = spawnSync('bash', ['-n', shf], { encoding: 'utf8' });
  t.ok(syn.status === 0, `bash -n reads the Linux script (${syn.stderr.trim()})`);
  const between = (s, tag) => s.split(`<<'${tag}'\n`)[1].split(`\n${tag}\n`)[0];
  t.eq(JSON.parse(dec(between(sh, 'SUPERTOOLS_JOB'))), job, 'Linux: the job decodes to exactly the job (the text with its $(…), backticks, quotes and the end markers)');
  t.eq(dec(between(sh, 'SUPERTOOLS_DRIVER')), driver, 'Linux: driver.py decodes to exactly driver.py');
  t.ok(!sh.includes('touch /tmp/pwned') && !sh.includes('नमस्ते'), 'Linux: the text appears only as Base64');
  t.ok(sh.includes(S.UV.linux.x86_64.sha256) && sh.includes(S.UV.linux.aarch64.sha256) && sh.includes(`'${S.UV.member.linux}'`), 'Linux: uv for x86-64 and ARM64, checked by SHA-256, taken out of its wheel');
  t.ok(/--with piper-tts==1\.8\.0 --with huggingface-hub==2\.4\.0 --with lameenc==1\.9\.0 --with numpy==2\.3\.5 python "\$DIR\/driver\.py" "\$RUN\/job\.json" piper "\$RUN"/.test(sh), 'Linux: the engine runs with its pinned packages');
  t.ok(/UV_PYTHON_PREFERENCE:-only-managed/.test(sh) && /HF_HUB_DISABLE_XET:-1/.test(sh) && /UV_TORCH_BACKEND:-auto/.test(sh), 'Linux: its own Python, plain HTTPS downloads from Hugging Face, PyTorch for the GPU there is (CPU otherwise)');
  // the script decodes its parts with the system's base64 (coreutils) the same way
  const jobOut = execFileSync('bash', ['-c', `base64 -d <<'SUPERTOOLS_JOB'\n${between(sh, 'SUPERTOOLS_JOB')}\nSUPERTOOLS_JOB`], { encoding: 'utf8' });
  t.eq(JSON.parse(jobOut).text, hostile, 'Linux: base64 -d gives the text back, untouched');
  t.ok(!existsSync('/tmp/pwned'), 'nothing in the text was run');

  // Windows
  const cmd = S.windowsScript(input);
  t.ok(/^[\x00-\x7f]*$/.test(cmd), 'Windows: the .cmd file is ASCII (cmd.exe reads it in the console code page)');
  t.ok(!/[^\r]\n/.test(cmd) && cmd.includes('\r\n'), 'Windows: CRLF line endings throughout');
  t.ok(cmd.startsWith('<# : ') && /\r\n#>\r\n/.test(cmd) && /set "SUPERTOOLS_SELF=%~f0"/.test(cmd) && /iex \(\[IO\.File\]::ReadAllText\(\$env:SUPERTOOLS_SELF\)\)/.test(cmd), 'Windows: a cmd / PowerShell hybrid (cmd runs PowerShell on the same file; PowerShell skips the batch lines as a comment)');
  const psStr = (name) => new RegExp(`${name}'\\), \\[Convert\\]::FromBase64String\\('([A-Za-z0-9+/=]+)'\\)`).exec(cmd)?.[1];
  t.eq(JSON.parse(dec(psStr('job.json') || '')), job, 'Windows: the job decodes to exactly the job');
  t.eq(dec(psStr('driver.py') || ''), driver, 'Windows: driver.py decodes to exactly driver.py');
  t.ok(cmd.includes(S.UV.windows.AMD64.sha256) && cmd.includes(S.UV.windows.ARM64.sha256) && cmd.includes(S.UV.member.windows), 'Windows: uv for x64 and ARM64, checked by SHA-256');
  t.ok(/\$LASTEXITCODE -ne 0/.test(cmd) && /catch \{/.test(cmd) && /\r\npause\r\n/.test(cmd), 'Windows: a failed engine is said, and the window waits for a key');
  // every PowerShell single-quoted string is closed on its line
  t.ok(cmd.split('\r\n').filter((l) => !/^\s*#/.test(l) && !/^@|^setlocal|^set |^powershell|^echo|^pause|^exit|^<#/.test(l)).every((l) => (l.replace(/''/g, '').match(/'/g) || []).length % 2 === 0), 'Windows: quotes balanced on every PowerShell line');

  // package pins are checked before they reach a command line
  t.throws(() => S.linuxScript({ ...input, runs: [{ ...runs[0], packages: ['x; rm -rf ~'] }] }), 'a package pin with shell characters is refused (Linux)');
  t.throws(() => S.windowsScript({ ...input, runs: [{ ...runs[0], packages: ['x`; calc'] }] }), 'a package pin with shell characters is refused (Windows)');

  // the real thing (opt-in: downloads uv, Python packages and a 63 MB voice)
  if (process.env.OFFLINE_TTS_E2E === '1') {
    const home = mkdtempSync(join(tmpdir(), 'stts-home-'));
    const small = { ...job, text: 'Hello from the offline mode. This sentence was made on this computer.', voices: [{ id: 'piper-lessac-low', label: 'Lessac (low)', engine: 'piper', repo: 'rhasspy/piper-voices', rev: 'e9c8a39444359388adaa94255becb37a5a2b8e51', file: 'en/en_US/lessac/low/en_US-lessac-low.onnx' }] };
    const f = join(home, 'tts.sh'); writeFileSync(f, S.linuxScript({ ...input, job: small }));
    // (the sandbox reaches PyPI and Hugging Face but not GitHub, where uv's own Python builds are: a system 3.12 here)
    const r = spawnSync('bash', [f], { encoding: 'utf8', env: { ...process.env, SUPERTOOLS_TTS_DIR: join(home, 'SuperTools-TTS'), UV_PYTHON_PREFERENCE: 'system' }, timeout: 900000 });
    const out = join(home, 'SuperTools-TTS', 'output'), runDir = existsSync(out) ? readdirSync(out)[0] : '';
    const files = runDir ? readdirSync(join(out, runDir)) : [];
    t.ok(r.status === 0 && files.includes('piper-lessac-low.wav') && files.includes('piper-lessac-low.mp3'), `the Linux script ran: uv, Piper, a WAV and an MP3 (${files.join(', ')}; ${(r.stderr || '').slice(-400)})`);
  }
};
