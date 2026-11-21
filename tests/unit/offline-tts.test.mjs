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

  const hostile = "Hello $(touch /tmp/pwned) `id` $HOME ${PATH} 'single' \"double\" \\back\\slash\nSUPERUTILS_JOB\nSUPERUTILS_DRIVER\n'@\n#>\n<#\nनमस्ते — ₹500";
  const job = { text: hostile, speed: 1.1, mp3: true, voices: [{ id: 'piper-vctk-p248', label: 'VCTK p248', engine: 'piper', repo: 'rhasspy/piper-voices', rev: 'e9c8a39444359388adaa94255becb37a5a2b8e51', file: 'en/en_GB/vctk/medium/en_GB-vctk-medium.onnx', speaker: 87 }] };
  const runs = [{ engine: 'piper', name: 'Piper', packages: ['piper-tts==1.8.0', 'huggingface-hub==2.4.0', 'lameenc==1.9.0', 'numpy==2.3.5'], voices: 1 }];
  const input = { job, driver, runs, made: '21 Nov 2026', site: 'https://ddastoor.github.io/utils/#/tts' };

  // Linux
  const sh = S.linuxScript(input), shf = join(tmp, 'tts.sh'), cmd0 = S.windowsScript(input);
  writeFileSync(shf, sh);
  const syn = spawnSync('bash', ['-n', shf], { encoding: 'utf8' });
  t.ok(syn.status === 0, `bash -n reads the Linux script (${syn.stderr.trim()})`);
  const between = (s, tag) => s.split(`<<'${tag}'\n`)[1].split(`\n${tag}\n`)[0];
  t.eq(JSON.parse(dec(between(sh, 'SUPERUTILS_JOB'))), job, 'Linux: the job decodes to exactly the job (the text with its $(…), backticks, quotes and the end markers)');
  t.eq(dec(between(sh, 'SUPERUTILS_DRIVER')), driver, 'Linux: driver.py decodes to exactly driver.py');
  t.ok(!sh.includes('touch /tmp/pwned') && !sh.includes('नमस्ते'), 'Linux: the text appears only as Base64');
  t.ok(sh.includes(S.UV.linux.x86_64.sha256) && sh.includes(S.UV.linux.aarch64.sha256) && sh.includes(`'${S.UV.member.linux}'`), 'Linux: uv for x86-64 and ARM64, checked by SHA-256, taken out of its wheel');
  t.ok(sh.includes(`envfor piper 'piper-tts==1.8.0' 'huggingface-hub==2.4.0' 'lameenc==1.9.0' 'numpy==2.3.5' && "$DIR/envs/piper/bin/python" "$DIR/driver.py" "$RUN/job.json" piper "$RUN"`), 'Linux: the engine runs in its own environment, made with its pinned packages');
  // PyTorch's build for the computer: uv pip install takes UV_TORCH_BACKEND (auto: CUDA for an NVIDIA card, else the
  // processor's); uv run has no such choice and gave every Linux computer the 4 GB CUDA build (21 Nov 2026)
  t.ok(/"\$DIR\/bin\/uv" pip install --python "\$e\/bin\/python" "\$@"/.test(sh) && !/uv" run[^\n]*driver\.py" "\$RUN\/job\.json" [a-z]+ "\$RUN"/.test(sh), 'Linux: the engines are installed with uv pip (which takes the PyTorch backend), not run through uv run');
  t.ok(/& \$uv pip install --python \$py @pins \| Out-Host/.test(cmd0) && cmd0.includes(`$py = EnvFor 'piper' @('piper-tts==1.8.0', 'huggingface-hub==2.4.0', 'lameenc==1.9.0', 'numpy==2.3.5')`) && /if \(\$py\) \{ & \$py "\$Dir\\driver\.py" "\$Run\\job\.json" piper "\$Run" \}/.test(cmd0), 'Windows: the same, each engine in envs\\<engine> (uv\'s lines go to the screen, not into the function\'s answer)');
  // a pin with extras is not a file pattern to bash: with a file that "misaki[en]==0.9.4" would match, the argument stays
  const ex = S.linuxScript({ ...input, runs: [{ ...runs[0], packages: ['misaki[en]==0.9.4'] }] });
  const line = ex.split('\n').find((l) => l.includes('misaki'));
  writeFileSync(join(tmp, 'misakie==0.9.4'), '');
  const argv = execFileSync('bash', ['-c', `set -- ${line.split('envfor piper ')[1].split(' && ')[0]}; printf '%s\\n' "$@"`], { cwd: tmp, encoding: 'utf8' });
  t.eq(argv.trim().split('\n'), ['misaki[en]==0.9.4'], 'Linux: a pin with extras reaches uv as written, though a file matches it as a pattern');
  t.ok(S.windowsScript({ ...input, runs: [{ ...runs[0], packages: ['misaki[en]==0.9.4'] }] }).includes("@('misaki[en]==0.9.4')"), 'Windows: the pin quoted too');
  t.throws(() => S.linuxScript({ ...input, runs: [{ ...runs[0], engine: '../x' }] }), 'an engine name that is no folder name is refused');
  t.ok(/UV_PYTHON_PREFERENCE:-only-managed/.test(sh) && /HF_HUB_DISABLE_XET:-1/.test(sh) && /UV_TORCH_BACKEND:-auto/.test(sh), 'Linux: its own Python, plain HTTPS downloads from Hugging Face, PyTorch for the GPU there is (CPU otherwise)');
  // the script decodes its parts with the system's base64 (coreutils) the same way
  const jobOut = execFileSync('bash', ['-c', `base64 -d <<'SUPERUTILS_JOB'\n${between(sh, 'SUPERUTILS_JOB')}\nSUPERUTILS_JOB`], { encoding: 'utf8' });
  t.eq(JSON.parse(jobOut).text, hostile, 'Linux: base64 -d gives the text back, untouched');
  t.ok(!existsSync('/tmp/pwned'), 'nothing in the text was run');

  // Windows
  const cmd = S.windowsScript(input);
  t.ok(/^[\x00-\x7f]*$/.test(cmd), 'Windows: the .cmd file is ASCII (cmd.exe reads it in the console code page)');
  t.ok(!/[^\r]\n/.test(cmd) && cmd.includes('\r\n'), 'Windows: CRLF line endings throughout');
  t.ok(cmd.startsWith('<# : ') && /\r\n#>\r\n/.test(cmd) && /set "SUPERUTILS_SELF=%~f0"/.test(cmd) && /iex \(\[IO\.File\]::ReadAllText\(\$env:SUPERUTILS_SELF\)\)/.test(cmd), 'Windows: a cmd / PowerShell hybrid (cmd runs PowerShell on the same file; PowerShell skips the batch lines as a comment)');
  const psStr = (name) => new RegExp(`${name}'\\), \\[Convert\\]::FromBase64String\\('([A-Za-z0-9+/=]+)'\\)`).exec(cmd)?.[1];
  t.eq(JSON.parse(dec(psStr('job.json') || '')), job, 'Windows: the job decodes to exactly the job');
  t.eq(dec(psStr('driver.py') || ''), driver, 'Windows: driver.py decodes to exactly driver.py');
  t.ok(cmd.includes(S.UV.windows.AMD64.sha256) && cmd.includes(S.UV.windows.ARM64.sha256) && cmd.includes(S.UV.member.windows), 'Windows: uv for x64 and ARM64, checked by SHA-256');
  t.ok(/\$LASTEXITCODE -ne 0/.test(cmd) && /catch \{/.test(cmd) && /\r\npause\r\n/.test(cmd), 'Windows: a failed engine is said, and the window waits for a key');
  // every PowerShell single-quoted string is closed on its line
  t.ok(cmd.split('\r\n').filter((l) => !/^\s*#/.test(l) && !/^@|^setlocal|^set |^powershell|^echo|^pause|^exit|^<#/.test(l)).every((l) => (l.replace(/''/g, '').match(/'/g) || []).length % 2 === 0), 'Windows: quotes balanced on every PowerShell line');

  // uv shows its downloads, and each engine's first run says what it downloads (owner, 21 Nov 2026: a first run sat
  // silent after "== Parler-TTS: 1 voice" while uv fetched PyTorch with --quiet — "is this stuck?")
  const quietOnly = (x) => x.split(/\r?\n/).filter((l) => l.includes('--quiet')).every((l) => / venv --quiet /.test(l));
  t.ok(quietOnly(sh) && quietOnly(cmd) && sh.includes(`"$DIR/bin/uv" python find 3.12 >/dev/null 2>&1 || "$DIR/bin/uv" python install 3.12`) && cmd.includes('& $uv python install 3.12 | Out-Host'), 'uv is not quiet where it downloads: Python (installed first, with its progress), the packages; only making the empty environment is (Linux and Windows)');
  const big = [{ ...runs[0], engine: 'parler', name: 'Parler-TTS', first: { programs: 800, cuda: 3100, models: 3766.6 } }, { ...runs[0], first: { programs: 170, cuda: 170, models: 63.2 } }];
  const note1 = '  First run: about 800 MB of programs (3.1 GB with an NVIDIA graphics card) and 3.8 GB of model files to download; uv and Hugging Face show the progress. Later runs reuse them.';
  const note2 = '  First run: about 170 MB of programs and 63 MB of model files to download; uv and Hugging Face show the progress. Later runs reuse them.';
  t.eq([S.firstRunNote(big[0]), S.firstRunNote(big[1]), S.firstRunNote(runs[0])], [note1, note2, ''], 'the first-run line: programs (with the NVIDIA size where PyTorch comes with it) and model files');
  const shBig = S.linuxScript({ ...input, runs: big }), cmdBig = S.windowsScript({ ...input, runs: big });
  t.ok(shBig.includes(`say 'Parler-TTS: 1 voice'\necho '${note1}'\n`) && shBig.includes(`echo '${note2}'`), 'Linux: the line under each engine’s heading');
  const winLines = cmdBig.split('\r\n').map((l) => l.trim()), at = winLines.indexOf("Say 'Parler-TTS: 1 voice'");
  t.ok(at > 0 && winLines[at + 1] === `Write-Host '${note1}'` && winLines.includes(`Write-Host '${note2}'`) && /^[\x00-\x7f]*$/.test(cmdBig), 'Windows: the same line under each heading, and the file stays ASCII');

  // package pins are checked before they reach a command line
  t.throws(() => S.linuxScript({ ...input, runs: [{ ...runs[0], packages: ['x; rm -rf ~'] }] }), 'a package pin with shell characters is refused (Linux)');
  t.throws(() => S.windowsScript({ ...input, runs: [{ ...runs[0], packages: ['x`; calc'] }] }), 'a package pin with shell characters is refused (Windows)');

  // an engine that fails does not stop the others: a stand-in uv that fails for one engine and notes the others
  const fake = mkdtempSync(join(tmpdir(), 'stts-fake-'));
  execFileSync('mkdir', ['-p', join(fake, 'bin')]);
  // (uv venv makes a stand-in python that notes its engine — the argument before the last — and fails for Kokoro)
  const fakePython = '#!/bin/sh\nfor a; do last2="$prev"; prev="$a"; done\necho "$last2" >> "$SUPERUTILS_TTS_DIR/ran"\n[ "$last2" != kokoro ]\n';
  const fakeUv = (run) => `#!/bin/sh\necho "$*" >> "$SUPERUTILS_TTS_DIR/uv.log"\ncase "$1" in\n  venv) for a; do e="$a"; done; mkdir -p "$e/bin"; printf '%s' '${fakePython}' > "$e/bin/python"; chmod +x "$e/bin/python" ;;\n  run) ${run} ;;\nesac\nexit 0\n`;
  writeFileSync(join(fake, 'bin', 'uv'), fakeUv('exit 1'), { mode: 0o755 });
  const three = [{ engine: 'piper', name: 'Piper', packages: ['piper-tts==1.8.0'], voices: 1 }, { engine: 'kokoro', name: 'Kokoro', packages: ['kokoro==0.9.4'], voices: 1 }, { engine: 'pocket', name: 'Pocket TTS', packages: ['pocket-tts==4.0.1'], voices: 1 }];
  const ff = join(fake, 'run.sh'); writeFileSync(ff, S.linuxScript({ ...input, runs: three }));
  const fr = spawnSync('bash', [ff], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: fake, PATH: '/usr/bin:/bin' } });
  t.eq(readFileSync(join(fake, 'ran'), 'utf8').trim().split('\n'), ['piper', 'kokoro', 'pocket'], 'Linux: every engine runs although Kokoro failed');
  t.ok(fr.status === 1 && /Stopped with an error: Kokoro \(the messages above say why\)/.test(fr.stderr), `Linux: the end names the engine that failed and exits 1 (${fr.status}: ${fr.stderr.trim().slice(-120)})`);
  writeFileSync(join(fake, 'ran'), '');
  const ok2 = spawnSync('bash', [ff], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: fake, PATH: '/usr/bin:/bin' } });
  t.ok(ok2.status === 1 && readFileSync(join(fake, 'ran'), 'utf8').trim().split('\n').length === 3, 'Linux: a second run runs again');
  const uvLog = readFileSync(join(fake, 'uv.log'), 'utf8').trim().split('\n');
  t.eq(uvLog.filter((l) => l.startsWith('venv ')).length, 3, `Linux: each environment is made once and kept for the next run (${uvLog.filter((l) => l.startsWith('venv ')).length} made in two runs)`);
  t.ok(uvLog.includes(`pip install --python ${fake}/envs/kokoro/bin/python kokoro==0.9.4`), 'Linux: the packages go into the engine\'s own environment');
  // new pins (another catalogue) make the environment again
  writeFileSync(join(fake, 'uv.log'), '');
  const bumped = join(fake, 'bumped.sh'); writeFileSync(bumped, S.linuxScript({ ...input, runs: [{ ...three[0], packages: ['piper-tts==1.9.0'] }] }));
  spawnSync('bash', [bumped], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: fake, PATH: '/usr/bin:/bin' } });
  t.ok(readFileSync(join(fake, 'uv.log'), 'utf8').includes('pip install --python ' + fake + '/envs/piper/bin/python piper-tts==1.9.0') && readFileSync(join(fake, 'envs', 'piper', '.pins'), 'utf8') === 'piper-tts==1.9.0', 'Linux: new pins make the environment again');
  // the lock (scripts/make-offline-tts-locks.py): written beside the environment, given to uv as constraints; a new lock
  // makes the environment again, the same lock keeps it
  { const lock = ['piper-tts==1.9.0', 'numpy==2.3.5', "colorama==0.4.6 ; sys_platform == 'win32'"];
    const locked = join(fake, 'locked.sh'); writeFileSync(locked, S.linuxScript({ ...input, runs: [{ ...three[0], packages: ['piper-tts==1.9.0'], lock }] }));
    writeFileSync(join(fake, 'uv.log'), '');
    spawnSync('bash', [locked], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: fake, PATH: '/usr/bin:/bin' } });
    const log1 = readFileSync(join(fake, 'uv.log'), 'utf8');
    t.ok(readFileSync(join(fake, 'envs', 'piper.lock'), 'utf8') === lock.join('\n') + '\n' && log1.includes(`pip install --python ${fake}/envs/piper/bin/python -c ${fake}/envs/piper.lock piper-tts==1.9.0`), `Linux: the lock is written and given to uv as constraints (${log1.trim().split('\n').pop()})`);
    t.ok(/^venv /m.test(log1), 'Linux: a lock where there was none makes the environment again');
    writeFileSync(join(fake, 'uv.log'), '');
    spawnSync('bash', [locked], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: fake, PATH: '/usr/bin:/bin' } });
    t.ok(!/^venv /m.test(readFileSync(join(fake, 'uv.log'), 'utf8')), 'Linux: the same lock keeps the environment');
    const relocked = join(fake, 'relocked.sh'); writeFileSync(relocked, S.linuxScript({ ...input, runs: [{ ...three[0], packages: ['piper-tts==1.9.0'], lock: [lock[0], 'numpy==2.3.6', lock[2]] }] }));
    spawnSync('bash', [relocked], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: fake, PATH: '/usr/bin:/bin' } });
    t.ok(/^venv /m.test(readFileSync(join(fake, 'uv.log'), 'utf8')), 'Linux: a new lock makes the environment again');
    const w = S.windowsScript({ ...input, runs: [{ ...three[0], packages: ['piper-tts==1.9.0'], lock }] });
    const b64 = (w.match(/\[IO\.File\]::WriteAllBytes\(\(Join-Path \$Dir 'envs\\piper\.lock'\), \[Convert\]::FromBase64String\('([A-Za-z0-9+/=]*)'\)\)/) || [])[1];
    t.ok(b64 !== undefined && Buffer.from(b64, 'base64').toString('utf8') === lock.join('\n') + '\n' && /& \$uv pip install --python \$py -c \$lock @pins/.test(w), 'Windows: the lock is written and given to uv as constraints');
    t.throws(() => S.linuxScript({ ...input, runs: [{ ...three[0], lock: ['numpy==2.3.5 ; $(rm -rf ~)'] }] }), 'a lock line that is no requirement is refused'); }
  const good = join(fake, 'good.sh'); writeFileSync(good, S.linuxScript({ ...input, runs: [three[0], three[2]] }));
  const g = spawnSync('bash', [good], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: fake, PATH: '/usr/bin:/bin' } });
  t.ok(g.status === 0 && /== Done\. The speech is in /.test(g.stdout), 'Linux: all engines well — "Done", exit 0');
  const noted = join(fake, 'noted.sh'); writeFileSync(noted, S.linuxScript({ ...input, runs: [{ ...three[0], first: { programs: 170, cuda: 170, models: 63.2 } }] }));
  const n = spawnSync('bash', [noted], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: fake, PATH: '/usr/bin:/bin' } });
  t.ok(n.status === 0 && n.stdout.includes('== Piper: 1 voice\n' + note2 + '\n'), `Linux: the first-run line is printed under the heading, before uv starts (${n.stdout.slice(0, 200)})`);
  const win = S.windowsScript({ ...input, runs: three });
  t.ok(/\$failed = @\(\)/.test(win) && (win.match(/if \(-not \$py -or \$LASTEXITCODE -ne 0\) \{ \$failed \+= '/g) || []).length === 3 && /if \(\$failed\.Count\) \{ throw/.test(win), 'Windows: each failure noted, the others run, the end says which');

  // a gated model: the token is checked right after it is given, before any engine (owner, 21 Nov 2026: Indic
  // Parler-TTS refused his token only after gigabytes of programs) — the check runs with huggingface-hub alone
  const gIn = { ...input, gated: ['ai4bharat/indic-parler-tts'] };
  const gsh = S.linuxScript(gIn), gcmd = S.windowsScript(gIn);
  const pos = (s, x) => s.indexOf(x);
  const ckL = "--with 'huggingface-hub==0.36.2' python \"$DIR/driver.py\" \"$RUN/job.json\" --check-access 'ai4bharat/indic-parler-tts'";
  t.ok(pos(gsh, ckL) > pos(gsh, "\nSUPERUTILS_JOB\n") && pos(gsh, ckL) < pos(gsh, "say 'Piper: 1 voice'") && pos(gsh, ckL) > pos(gsh, 'read -rsp'), 'Linux: the token is checked after it is asked for and the job is written, before the first engine');
  writeFileSync(join(tmp, 'gated.sh'), gsh);
  t.ok(spawnSync('bash', ['-n', join(tmp, 'gated.sh')]).status === 0, 'Linux: bash -n reads the script with the check');
  const ckW = "--with 'huggingface-hub==0.36.2' python \"$Dir\\driver.py\" \"$Run\\job.json\" --check-access 'ai4bharat/indic-parler-tts'";
  t.ok(pos(gcmd, ckW) > pos(gcmd, "'job.json'") && pos(gcmd, ckW) < pos(gcmd, "Say 'Piper: 1 voice'") && /if \(\$LASTEXITCODE -ne 0\) \{ throw 'Hugging Face refused the download/.test(gcmd) && /^[\x00-\x7f]*$/.test(gcmd), 'Windows: the same check in the same place; a refusal stops the script; ASCII');
  t.ok(!sh.includes('--check-access') && !cmd.includes('--check-access'), 'no check without a gated model');
  const gf = mkdtempSync(join(tmpdir(), 'stts-gated-'));
  execFileSync('mkdir', ['-p', join(gf, 'bin')]);
  writeFileSync(join(gf, 'bin', 'uv'), fakeUv('for a; do last2="$prev"; prev="$a"; done; echo "$last2" >> "$SUPERUTILS_TTS_DIR/ran"; if [ "$last2" = --check-access ] && [ -n "$FAKE_REFUSE" ]; then echo "refused (the driver says why)" >&2; exit 1; fi'), { mode: 0o755 });
  const runG = (env) => { writeFileSync(join(gf, 'ran'), ''); return spawnSync('bash', [join(tmp, 'gated.sh')], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: gf, PATH: '/usr/bin:/bin', HF_TOKEN: 'hf_stand_in', ...env } }); };
  const refused = runG({ FAKE_REFUSE: '1' }), ranR = readFileSync(join(gf, 'ran'), 'utf8').trim().split('\n');
  t.ok(refused.status === 1 && ranR.join() === '--check-access' && /Nothing else was downloaded\. Fix that, then run this again\./.test(refused.stderr), `Linux: a refused token stops the script before any engine (${refused.status}; ran ${ranR.join(', ')})`);
  const passed = runG({}), ranP = readFileSync(join(gf, 'ran'), 'utf8').trim().split('\n');
  t.ok(passed.status === 0 && ranP.join() === '--check-access,piper' && passed.stdout.includes('== Checking that Hugging Face lets this computer download ai4bharat/indic-parler-tts'), `Linux: an accepted token goes on to the engines (${ranP.join(', ')})`);

  // the real thing (opt-in: downloads uv, Python packages and a 63 MB voice)
  if (process.env.OFFLINE_TTS_E2E === '1') {
    const home = mkdtempSync(join(tmpdir(), 'stts-home-'));
    const small = { ...job, text: 'Hello from the offline mode. This sentence was made on this computer.', voices: [{ id: 'piper-lessac-low', label: 'Lessac (low)', engine: 'piper', repo: 'rhasspy/piper-voices', rev: 'e9c8a39444359388adaa94255becb37a5a2b8e51', file: 'en/en_US/lessac/low/en_US-lessac-low.onnx' }] };
    // the catalogue's own Piper — its pins and its lock (the versions installed are the lock's)
    const catL = JSON.parse(readFileSync(new URL('../../src/lib/offline-tts/catalogue.json', import.meta.url), 'utf8'));
    const f = join(home, 'tts.sh'); writeFileSync(f, S.linuxScript({ ...input, job: small, runs: [{ ...runs[0], packages: catL.engines.piper.packages, lock: catL.engines.piper.lock }] }));
    // (the sandbox reaches PyPI and Hugging Face but not GitHub, where uv's own Python builds are: a system 3.12 here)
    const r = spawnSync('bash', [f], { encoding: 'utf8', env: { ...process.env, SUPERUTILS_TTS_DIR: join(home, 'SuperUtils-TTS'), UV_PYTHON_PREFERENCE: 'system' }, timeout: 900000 });
    const out = join(home, 'SuperUtils-TTS', 'output'), runDir = existsSync(out) ? readdirSync(out)[0] : '';
    const files = runDir ? readdirSync(join(out, runDir)) : [];
    const freeze = spawnSync(join(home, 'SuperUtils-TTS', 'bin', 'uv'), ['pip', 'freeze', '--python', join(home, 'SuperUtils-TTS', 'envs', 'piper', 'bin', 'python')], { encoding: 'utf8' }).stdout.trim().split('\n');
    const lockOf = (l) => l.split(' ; ')[0];
    t.ok(freeze.length > 5 && freeze.every((l) => catL.engines.piper.lock.map(lockOf).includes(l)), `the Linux script installed exactly the lock's versions (${freeze.filter((l) => !catL.engines.piper.lock.map(lockOf).includes(l)).join(', ') || 'all of them'})`);
    t.ok(r.status === 0 && files.includes('piper-lessac-low.wav') && files.includes('piper-lessac-low.mp3'), `the Linux script ran: uv, Piper, a WAV and an MP3 (${files.join(', ')}; ${(r.stderr || '').slice(-400)})`);
  }
};
