// The offline mode's catalogue (src/lib/offline-tts/catalogue.json, made by scripts/make-offline-tts-catalogue.py) and
// its planner (src/lib/offline-tts/plan.ts). Independent references: the speaker numbers of Piper's multi-speaker
// models as read from the .onnx.json files inside sherpa-onnx's archives (a separate copy of the same models — p248 87,
// p251 92, p376 26; L2-ARCTIC SVBI 2, TNI 9, ASI 10, RRBI 19; ARCTIC ksp 3), VCTK's own speaker list
// (scripts/data/vctk-speaker-info.txt), Kokoro's VOICES.md grades, and bash -n for every script.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async (t, { load }) => {
  const P = await load('/src/lib/offline-tts/plan.ts');
  const cat = JSON.parse(readFileSync(new URL('../../src/lib/offline-tts/catalogue.json', import.meta.url), 'utf8'));
  const driver = readFileSync(new URL('../../src/lib/offline-tts/driver.py', import.meta.url), 'utf8');
  const byId = new Map(cat.voices.map((v) => [v.id, v]));
  const tmp = mkdtempSync(join(tmpdir(), 'otts-plan-'));
  const dec = (s) => Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');

  // ---- the catalogue
  const groups = new Set(cat.groups.map(([g]) => g));
  const ids = cat.voices.map((v) => v.id);
  t.ok(new Set(ids).size === ids.length, `every voice id is unique (${ids.length} voices)`);
  t.ok(ids.every((i) => /^[a-z0-9][a-z0-9_.-]*$/.test(i)), 'every voice id is safe as a file name (it names the output files)');
  t.ok(cat.voices.every((v) => groups.has(v.group) && cat.models[v.model] && v.label && ['f', 'm', 'n', ''].includes(v.sex)), 'every voice has a known group, a model, a label and a sex code');
  t.ok(Object.values(cat.models).every((m) => /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/.test(m.repo) && /^[0-9a-f]{7,40}$/.test(m.rev) && m.mb > 0 && cat.engines[m.engine] && m.licence),
    'every model: a Hugging Face repository at a fixed commit, a size, an engine, a licence');
  const count = (g) => cat.voices.filter((v) => v.group === g).length;
  t.ok(count('in') >= 45 && count('us') >= 60 && count('uk') >= 100, `many Indian, American and British voices (in ${count('in')}, us ${count('us')}, uk ${count('uk')})`);
  const per = (e) => cat.voices.filter((v) => cat.models[v.model].engine === e);
  t.ok(per('piper').every((v) => cat.models[v.model].file?.endsWith('.onnx')), 'Piper voices name their .onnx file');
  t.ok(per('kokoro').every((v) => /^[abh][fm]_[a-z]+$/.test(v.voice) && (!v.lang || 'abh'.includes(v.lang))), 'Kokoro voices name a voice file and a reading');
  t.ok(per('parler').every((v) => v.describe.includes('{pace}')), 'Parler voices are described with the pace left open');
  t.ok(per('xtts').every((v) => (typeof v.speaker === 'string') !== !!v.clip), 'XTTS voices: a studio voice or a clip, never both');
  t.ok(per('pocket').every((v) => /^[a-z_]+$/.test(v.voice)) && per('pocket').length === 21, 'Pocket TTS: its 21 English voices');

  // speaker numbers: the same as in sherpa-onnx's copies of these Piper models
  const spk = { 'piper-vctk-p248': 87, 'piper-vctk-p251': 92, 'piper-vctk-p376': 26, 'piper-l2arctic-svbi': 2, 'piper-l2arctic-tni': 9,
    'piper-l2arctic-asi': 10, 'piper-l2arctic-rrbi': 19, 'piper-arctic-ksp': 3 };
  for (const [id, n] of Object.entries(spk)) t.eq(byId.get(id)?.speaker, n, `${id} is speaker ${n}`);
  t.ok(Object.keys(spk).every((id) => byId.get(id).group === 'in'), 'those eight are Indian English');
  // VCTK: each voice's accent as VCTK's list says
  const vctk = Object.fromEntries(readFileSync(new URL('../../scripts/data/vctk-speaker-info.txt', import.meta.url), 'utf8').split('\n').slice(1)
    .map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 4).map((p) => [p[0], p]));
  const vv = cat.voices.filter((v) => v.id.startsWith('piper-vctk-'));
  t.eq(vv.length, 109, 'all 109 VCTK speakers');
  t.ok(vv.every((v) => { const r = vctk[v.id.slice(11)]; return r && v.sex === r[2].toLowerCase() && v.label.includes(`, ${r[1]},`); }), 'every VCTK voice has the sex and age of VCTK’s list');
  t.eq(vv.filter((v) => v.group === 'in').map((v) => v.id).sort(), ['piper-vctk-p248', 'piper-vctk-p251', 'piper-vctk-p376'], 'the Indian VCTK speakers are p248, p251 and p376');
  t.ok(/grade A\)/.test(byId.get('kokoro-af_heart').label) && /grade A-\)/.test(byId.get('kokoro-af_bella').label) && /grade B-\)/.test(byId.get('kokoro-bf_emma').label), 'Kokoro grades as VOICES.md gives them (Heart A, Bella A-, Emma B-)');
  t.eq(per('kokoro').filter((v) => v.group === 'in').length, 12, 'four Hindi Kokoro voices × three readings');
  t.ok(cat.models['indic-parler'].gated && !cat.models['parler-large'].gated, 'Indic Parler-TTS needs a Hugging Face account, Parler Large does not');
  t.ok(cat.models.xtts.personal && cat.engines.xtts.accept === 'cpml', 'XTTS-v2: personal use, its licence must be accepted');

  // ---- the planner
  t.eq(P.detectOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'), 'windows', 'Windows from the user agent');
  t.eq(P.detectOS('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36'), 'linux', 'Linux from the user agent');
  t.eq(P.detectOS('Mozilla/5.0 (X11; Linux x86_64) Chrome/140', 'Windows'), 'windows', 'the client hint wins');
  t.eq(P.detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140'), null, 'macOS: neither');
  t.eq(P.detectOS('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/140'), null, 'ChromeOS: neither');
  t.eq(P.detectOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140 Mobile'), null, 'Android: neither');

  const starters = ['indic-parler-thoma', 'indic-parler-mary', 'kokoro-hf_alpha-a', 'piper-vctk-p248'];
  let p = P.planOf(cat, starters);
  t.eq(p.voices.length, 4, 'four voices'); t.eq(p.models.length, 3, 'three models (Thoma and Mary share Indic Parler)');
  t.eq(p.engines, ['piper', 'kokoro', 'parler'], 'engines in their running order');
  t.eq(p.gated, ['ai4bharat/indic-parler-tts'], 'the gated repository named');
  t.near(p.modelMB, cat.models['indic-parler'].mb + cat.models.kokoro.mb + cat.models['piper-en_GB-vctk-medium'].mb, 0.01, 'model download = each model once');
  t.ok(p.programMBcuda - p.programMB === P.TORCH_MB.cuda - P.TORCH_MB.cpu, 'PyTorch counted once, CUDA build larger');
  p = P.planOf(cat, ['xtts-clip-vinith', 'pocket-alba']);
  t.eq(p.accept, ['cpml'], 'XTTS-v2 needs its licence accepted'); t.ok(p.personal, 'XTTS-v2 is personal use'); t.eq(p.noSpeed, ['Pocket TTS'], 'Pocket TTS has no speed');
  t.near(p.modelMB, cat.models.xtts.mb + cat.models.pocket.mb + 0.7, 0.01, 'a clip adds its recording');
  t.eq(P.planOf(cat, []).programMB, 0, 'nothing chosen, nothing to download');

  const job = P.buildJob(cat, P.planOf(cat, ['piper-vctk-p248', 'kokoro-hm_psi-b', 'indic-parler-thoma', 'xtts-ana-florence', 'xtts-clip-vctk-p248', 'pocket-anna']), 'Hello.', 1.234, false);
  const jv = Object.fromEntries(job.voices.map((v) => [v.id, v]));
  t.eq(job.speed, 1.23, 'speed to two decimals'); t.eq(job.mp3, false, 'MP3 off as chosen');
  t.eq(jv['piper-vctk-p248'], { id: 'piper-vctk-p248', label: byId.get('piper-vctk-p248').label, engine: 'piper', repo: 'rhasspy/piper-voices', rev: cat.models['piper-en_GB-vctk-medium'].rev, file: 'en/en_GB/vctk/medium/en_GB-vctk-medium.onnx', speaker: 87 }, 'a Piper voice: its file and speaker');
  t.ok(jv['kokoro-hm_psi-b'].voice === 'hm_psi' && jv['kokoro-hm_psi-b'].lang === 'b', 'a Kokoro voice: its voice file and reading');
  t.ok(jv['indic-parler-thoma'].descTokenizer?.[0] === 'google/flan-t5-large' && jv['indic-parler-thoma'].describe.startsWith('Thoma '), 'a Parler voice: its description and the tokenizer of descriptions');
  t.ok(jv['xtts-ana-florence'].speaker === 'Ana Florence' && jv['xtts-clip-vctk-p248'].clip.file === 'vctk/p248_023_enhanced.wav', 'XTTS: a studio voice by name, a clip by file');
  t.eq(jv['pocket-anna'].voice, 'anna', 'Pocket: its voice');

  // every voice of the catalogue in one script: the pins are accepted, bash reads it, the job comes back whole
  const all = P.planOf(cat, ids);
  const o = { text: 'Hello from every voice. नमस्ते — “quotes”, $HOME and `id`.', speed: 1, mp3: true, driver, made: '21 Nov 2026', site: 'https://ddastoor.github.io/utils/#/tts' };
  const sh = P.scriptFor('linux', cat, all, o), shf = join(tmp, 'all.sh');
  writeFileSync(shf, sh);
  const syn = spawnSync('bash', ['-n', shf], { encoding: 'utf8' });
  t.ok(syn.status === 0, `bash -n reads the script of all ${ids.length} voices (${syn.stderr.trim()})`);
  const between = (s, tag) => s.split(`<<'${tag}'\n`)[1].split(`\n${tag}\n`)[0];
  const back = JSON.parse(dec(between(sh, 'SUPERTOOLS_JOB')));
  t.eq(back.voices.length, ids.length, 'the job carries every voice'); t.eq(back.text, o.text, 'and the text, untouched');
  for (const e of P.ENGINE_ORDER) t.ok(sh.includes(` python "$DIR/driver.py" "$RUN/job.json" ${e} "$RUN"`), `the Linux script runs ${e}`);
  t.ok(/COQUI_TOS_AGREED=1 "\$DIR\/bin\/uv" run/.test(sh), 'XTTS-v2 runs with its licence accepted');
  t.ok(sh.includes('read -rsp') && sh.includes('https://huggingface.co/ai4bharat/indic-parler-tts') && sh.includes('(umask 077;'), 'the token is asked for, the repository named, the token file private');
  t.ok(!P.scriptFor('linux', cat, P.planOf(cat, ['piper-vctk-p248']), o).includes('read -rsp'), 'no token is asked for without a gated model');
  const cmd = P.scriptFor('windows', cat, all, o);
  t.ok(/^[\x00-\x7f]*$/.test(cmd) && !/[^\r]\n/.test(cmd), 'the Windows script: ASCII, CRLF');
  t.ok(cmd.includes("$env:COQUI_TOS_AGREED = '1'") && cmd.includes('Read-Host -AsSecureString') && cmd.includes('ai4bharat/indic-parler-tts'), 'Windows: licence setting, token asked for (hidden)');
  t.ok(cmd.split('\r\n').filter((l) => !/^\s*#/.test(l) && !/^@|^setlocal|^set |^powershell|^echo|^pause|^exit|^<#/.test(l)).every((l) => (l.replace(/''/g, '').match(/'/g) || []).length % 2 === 0), 'Windows: quotes balanced on every line');

  t.eq([P.fmtMB(0.3), P.fmtMB(359.2), P.fmtMB(999), P.fmtMB(1000), P.fmtMB(3766.6), P.fmtMB(12345)], ['1 MB', '359 MB', '999 MB', '1.0 GB', '3.8 GB', '12 GB'], 'sizes in MB / GB');
  t.ok(P.matches(cat, byId.get('piper-vctk-p248'), 'indian woman') && !P.matches(cat, byId.get('piper-vctk-p251'), 'indian woman'), 'search: every word must match');
  t.ok(P.matches(cat, byId.get('indic-parler-thoma'), 'parler thoma') && P.matches(cat, byId.get('kokoro-af_heart'), 'american'), 'search finds the model and the group');

  // driver.py: Python reads it; the text pieces and the pace words
  const py = (code) => execFileSync('python3', ['-I', '-c', code], { cwd: tmp, encoding: 'utf8', env: { ...process.env, PYTHONPATH: '' } });
  writeFileSync(join(tmp, 'driver.py'), driver);
  const r = JSON.parse(py(`import sys, json; sys.path.insert(0, '.'); import driver
t = ' '.join(['Sentence number %d is here, with a clause.' % i for i in range(60)]) + '\\n\\nA new paragraph.'
c = driver.chunks(t, 240)
print(json.dumps({'max': max(map(len, c)), 'same': ' '.join(c).split() == t.split(), 'n': len(c), 'pace': [driver.pace(s) for s in (0.5, 0.8, 1, 1.3, 2)], 'engines': sorted(driver.ENGINES)}))`));
  t.ok(r.max <= 240 && r.same && r.n > 5, `driver.py cuts a long text into pieces of at most 240 characters, every word kept (${r.n} pieces)`);
  t.eq(r.pace, ['very slowly', 'slowly', 'at a moderate pace', 'slightly fast', 'fast'], 'Parler’s pace words');
  t.eq(r.engines, [...P.ENGINE_ORDER].sort(), 'driver.py has every engine the planner runs');
};
