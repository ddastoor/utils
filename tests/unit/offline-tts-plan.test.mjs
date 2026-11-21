// The offline mode's catalogue (src/lib/offline-tts/catalogue.json, made by scripts/make-offline-tts-catalogue.py) and
// its planner (src/lib/offline-tts/plan.ts). Independent references: the speaker numbers of Piper's multi-speaker
// models as read from the .onnx.json files inside sherpa-onnx's archives (a separate copy of the same models — p248 87,
// p251 92, p376 26; L2-ARCTIC SVBI 2, TNI 9, ASI 10, RRBI 19; ARCTIC ksp 3), VCTK's own speaker list
// (scripts/data/vctk-speaker-info.txt), Kokoro's VOICES.md grades, and bash -n for every script.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
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
  t.ok(per('kokoro').every((v) => (v.model === 'goonj' ? /^(en|hi)_[a-z]+$/ : /^[abh][fm]_[a-z]+$/).test(v.voice) && (!v.lang || 'abh'.includes(v.lang))), 'Kokoro-family voices name a voice file and a reading');
  t.ok(per('kokoro').filter((v) => v.model === 'goonj').every((v) => v.lang === 'a'), 'goonj’s personas read English with the American reading (their card)');
  t.ok(per('parler').every((v) => v.describe.includes('{pace}')), 'Parler voices are described with the pace left open');
  t.ok(per('xtts').every((v) => (typeof v.speaker === 'string') !== !!v.clip), 'XTTS voices: a studio voice or a clip, never both');
  const pk = per('pocket').filter((v) => v.model === 'pocket'), pkc = per('pocket').filter((v) => v.model === 'pocket-clone');
  t.ok(pk.every((v) => /^[a-z_]+$/.test(v.voice) && !v.clip) && pk.length === 21, 'Pocket TTS: its 21 English voices');
  t.ok(pkc.length === 8 && pkc.every((v) => v.clip && !v.voice && v.group === 'in') && cat.models['pocket-clone'].gated, 'Pocket TTS with voice cloning: the eight Indian recordings, a gated model');
  // the voices taken from recordings: the same eight clips for every engine that clones
  const clips = (m) => cat.voices.filter((v) => v.model === m).filter((v) => v.clip).map((v) => v.clip.file).sort();
  for (const m of ['chatterbox', 'chatterbox-turbo', 'voxcpm2', 'pocket-clone']) t.eq(clips(m), clips('xtts'), `${m}: the eight Indian recordings of XTTS-v2`);
  t.ok(cat.engines.chatterbox.ownTorch && P.planOf(cat, ['chatterbox-default', 'kokoro-af_heart']).programMB - P.planOf(cat, ['kokoro-af_heart']).programMB === cat.engines.chatterbox.mb + P.TORCH_MB.cpu, 'Chatterbox brings its own PyTorch (counted again)');
  t.eq(per('veena').map((v) => v.voice).sort(), ['agastya', 'kavya', 'maitri', 'vinaya'], 'Veena: the four speakers of its card');
  t.ok(per('voxcpm').filter((v) => !v.clip).every((v) => v.describe && !v.describe.includes('(') && !v.describe.includes(')')), 'VoxCPM2: descriptions without brackets (the driver puts them in brackets)');
  t.ok(Object.keys(cat.engines).every((e) => P.ENGINE_ORDER.includes(e)) && P.ENGINE_ORDER.every((e) => cat.engines[e]), 'every engine of the catalogue is in the running order (an engine left out would never run)');
  // MeloTTS: MeloTTS-English's speaker numbers (its config: EN-US 0, EN-BR 1, EN_INDIA 2, EN-AU 3, EN-Default 4)
  t.eq(per('melo').map((v) => [v.speaker, v.id, v.group]).sort(), [[0, 'melo-en-us', 'us'], [1, 'melo-en-br', 'uk'], [2, 'melo-en-india', 'in'], [3, 'melo-en-au', 'world'], [4, 'melo-en-default', 'any']], 'MeloTTS: its five speakers and their accents');
  t.ok(per('melo').every((v) => v.sex === 'f'), 'MeloTTS: five women’s voices');
  // Supertonic: three models, ten voices each, F1 – F5 women and M1 – M5 men
  t.eq(per('supertonic').length, 30, 'Supertonic: 3 models × 10 voices');
  t.ok(per('supertonic').every((v) => /^[FM][1-5]$/.test(v.voice) && v.sex === v.voice[0].toLowerCase()), 'Supertonic: F voices women, M voices men');
  t.eq(['supertonic-1', 'supertonic-2', 'supertonic-3'].map((m) => cat.models[m].repo), ['Supertone/supertonic', 'Supertone/supertonic-2', 'Supertone/supertonic-3'], 'Supertonic: its three models');
  // Indic Tiny TTS: its two voices (the card: voice="female" / "male"), both Indian English
  t.eq(per('indictiny').map((v) => [v.voice, v.sex, v.group]).sort(), [['female', 'f', 'in'], ['male', 'm', 'in']], 'Indic Tiny TTS: a woman’s and a man’s voice, Indian English');
  // Qwen3-TTS: the nine speakers of the qwen-tts readme in both CustomVoice models; the VoiceDesign voices described in words
  const QWEN9 = ['Aiden', 'Dylan', 'Eric', 'Ono_Anna', 'Ryan', 'Serena', 'Sohee', 'Uncle_Fu', 'Vivian'];
  for (const m of ['qwen-0.6b', 'qwen-1.7b']) t.eq(per('qwen').filter((v) => v.model === m).map((v) => v.speaker).sort(), QWEN9, `${m}: the nine speakers of the readme`);
  const design = per('qwen').filter((v) => v.model === 'qwen-design');
  t.ok(design.length >= 12 && design.every((v) => v.describe && !v.speaker && v.describe.length < 300), `Qwen3-TTS VoiceDesign: ${design.length} voices, each a description`);
  t.ok(design.every((v) => v.group === 'any' && !/accent/i.test(v.describe) && /North American/.test(v.label)), 'VoiceDesign promises no accent (tested: Indian and British descriptions came out North American)');
  t.ok(!cat.engines.qwen.speedControl, 'Qwen3-TTS has no speed control (an instruction moved the 1.7B model’s pace by 5 % in the test)');
  // OmniVoice: every description made of omnivoice 0.2.1's own words (omnivoice/utils/voice_design.py)
  const OMNI_WORDS = new Set(['male', 'female', 'child', 'teenager', 'young adult', 'middle-aged', 'elderly', 'very low pitch', 'low pitch', 'moderate pitch',
    'high pitch', 'very high pitch', 'whisper', 'american accent', 'british accent', 'australian accent', 'chinese accent', 'canadian accent', 'indian accent',
    'korean accent', 'portuguese accent', 'russian accent', 'japanese accent']);
  t.ok(per('omnivoice').length >= 30 && per('omnivoice').every((v) => v.describe.split(', ').every((w) => OMNI_WORDS.has(w))), `OmniVoice: ${per('omnivoice').length} voices, each described in its own words`);
  t.ok(per('omnivoice').every((v) => v.describe.includes(v.sex === 'f' ? 'female' : 'male') && (v.group !== 'in' || v.describe.includes('indian accent'))), 'OmniVoice: sex and the Indian accent as labelled');
  t.ok(cat.models.omnivoice.personal, 'OmniVoice: personal use (CC BY-NC)');
  // Bark: the twenty v2 presets in both models; the Hindi speakers are the Indian ones
  for (const m of ['bark', 'bark-small']) {
    const b = per('bark').filter((v) => v.model === m);
    t.eq(b.map((v) => v.voice).sort(), [...Array(10).keys()].flatMap((i) => [`v2/en_speaker_${i}`, `v2/hi_speaker_${i}`]).sort(), `${m}: presets v2/en_speaker_0 – 9 and v2/hi_speaker_0 – 9`);
    t.ok(b.every((v) => (v.group === 'in') === v.voice.startsWith('v2/hi_')), `${m}: the Hindi presets in the Indian group`);
  }

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
  t.eq(per('kokoro').filter((v) => v.group === 'in' && v.model === 'kokoro').length, 12, 'four Hindi Kokoro voices × three readings');
  t.eq(per('kokoro').filter((v) => v.model === 'goonj').map((v) => v.voice).filter((x) => x.startsWith('en_')).length, 10, 'goonj-1-82M: ten Indian English personas');
  t.ok(cat.models.goonj.file === 'kokoro_hindi_final.pth' && cat.models.kokoro.file === 'kokoro-v1_0.pth', 'each Kokoro-family model names its weights');
  t.ok(cat.models['indic-parler'].gated && !cat.models['parler-large'].gated, 'Indic Parler-TTS needs a Hugging Face account, Parler Large does not');
  t.ok(cat.models.xtts.personal && cat.engines.xtts.accept === 'cpml', 'XTTS-v2: personal use, its licence must be accepted');
  // Kyutai TTS 1.6B: a voice for every recording of kyutai/tts-voices that has an embedding for it (as surveyed in
  // scripts/data/kyutai-voices-heard.json) but the two Freesound clips, whose licence the README does not give
  {
    const heardK = JSON.parse(readFileSync(new URL('../../scripts/data/kyutai-voices-heard.json', import.meta.url), 'utf8')).recordings;
    const kv = per('kyutai'), xclip = per('xtts').find((v) => v.clip).clip;
    t.eq(kv.map((v) => v.clip?.file).sort(), Object.keys(heardK).filter((f) => !f.includes('/freesound/')).sort(), `Kyutai: a voice for each recording with an embedding (${kv.length}), the Freesound clips left out`);
    t.ok(kv.every((v) => v.clip.repo === xclip.repo && v.clip.rev === xclip.rev && !v.speaker && !v.voice), 'Kyutai: every voice a recording of kyutai/tts-voices at the revision the clips of XTTS-v2 come from');
    t.ok(cat.engines.kyutai.ownTorch && cat.engines.kyutai.speedControl && cat.engines.kyutai.slow && cat.engines.kyutai.packages.some((p) => /^moshi==/.test(p)), 'Kyutai: moshi with a PyTorch of its own (below 2.10), a speed, slow on a processor');
    // VCTK's speakers filed as VCTK's own list files them — as the Piper voices of the same speakers are
    // (p315 and s5 have no Piper voice: their accent straight from the list)
    const kvctk = kv.filter((v) => v.clip.file.startsWith('vctk/'));
    t.ok(kvctk.length >= 100 && kvctk.every((v) => {
      const s = v.clip.file.slice(5).split('_')[0], r = vctk[s], p = byId.get(`piper-vctk-${s}`);
      return r && v.sex === r[2].toLowerCase() && v.label.includes(`, ${r[1]},`) && !v.label.includes('unavailable') && (p ? p.group === v.group : v.group === { American: 'us', British: 'uk' }[r[3]]);
    }), `Kyutai: its ${kvctk.length} VCTK voices have the accent, sex and age of VCTK’s list`);
    // the recordings without a description: a language Whisper is sure of (0.8+) → its speakers (an Indian language under
    // Indian, any other under other accents); else the accent our accent model heard first by 0.05 and more; else not
    // documented. Worked out again here from the raw survey.
    const CA = { indian: 'in', us: 'us', england: 'uk', scotland: 'uk', ireland: 'uk', wales: 'uk' };
    const expect = (r) => {
      const [lang, p] = r.lang || ['en', 1];
      if (lang !== 'en' && p >= 0.8) return ['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'].includes(lang) ? 'in' : 'world';
      return r.acc[0][1] - r.acc[1][1] >= 0.05 ? CA[r.acc[0][0]] || 'world' : 'any';
    };
    const free = kv.filter((v) => !v.clip.file.startsWith('vctk/') && !/^voice-donations\/.*india/i.test(v.clip.file));
    const wrong = free.filter((v) => v.group !== expect(heardK[v.clip.file]));
    t.eq(wrong.map((v) => v.id), [], `Kyutai: the ${free.length} recordings without a described accent filed by the language and accent heard`);
    t.ok(kv.filter((v) => /^voice-donations\/.*india/i.test(v.clip.file)).every((v) => v.group === 'in' && /the donor says so/.test(v.label)), 'Kyutai: a donor whose name says India is Indian, and the label says why');
    t.ok(free.every((v) => /accent heard in our test: |accent not clear in our test|a [A-Z][a-z]+ speaker \(the recording is in [A-Z][a-z]+\)/.test(v.label)), 'Kyutai: every label says how its accent was found');
    t.eq(['kyutai-unmute-degaulle-2', 'kyutai-unmute-developpeuse-3', 'kyutai-unmute-fabieng-enhanced-v2', 'kyutai-don-2181'].map((i) => byId.get(i)?.group), ['world', 'world', 'world', 'world'], 'Kyutai: the French recordings are French speakers, not an English accent');
    t.ok(byId.get('kyutai-don-4189').group === 'in' && /Hindi speaker/.test(byId.get('kyutai-don-4189').label), 'Kyutai: a recording in Hindi is an Indian voice');
    // EARS and Expresso recordings are CC BY-NC: personal use, whatever the model's licence (CC BY 4.0)
    const nc = kv.filter((v) => /^(ears|expresso)\//.test(v.clip.file));
    t.ok(nc.length > 200 && nc.every((v) => v.personal && /personal use only/.test(v.label)) && !cat.models['kyutai-1.6b'].personal, 'Kyutai: EARS and Expresso voices are personal use, the model is not');
    t.ok(P.planOf(cat, [nc[0].id]).personal && !P.planOf(cat, ['kyutai-vctk-p248']).personal, 'Kyutai: a personal recording makes the choice personal use, a VCTK one does not');
  }

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
  p = P.planOf(cat, ['qwen-06b-ryan', 'qwen-design-in-woman-young', 'bark-small-hi-0']);
  t.eq(p.noSpeed, ['Qwen3-TTS', 'Bark'], 'no speed: the engines without it, in their running order');
  t.eq(p.slow, ['Qwen3-TTS', 'Bark'], 'slow engines named');
  t.eq(P.planOf(cat, ['kokoro-af_heart']).noSpeed, [], 'Kokoro has a speed');

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
  const back = JSON.parse(dec(between(sh, 'SUPERUTILS_JOB')));
  t.eq(back.voices.length, ids.length, 'the job carries every voice'); t.eq(back.text, o.text, 'and the text, untouched');
  for (const e of P.ENGINE_ORDER) t.ok(sh.includes(`"$DIR/envs/${e}/bin/python" "$DIR/driver.py" "$RUN/job.json" ${e} "$RUN"`), `the Linux script runs ${e} in its own environment`);
  t.ok(sh.includes('COQUI_TOS_AGREED=1 "$DIR/envs/xtts/bin/python" "$DIR/driver.py"'), 'XTTS-v2 runs with its licence accepted');
  t.ok(sh.includes('read -rsp') && sh.includes('https://huggingface.co/ai4bharat/indic-parler-tts') && sh.includes('(umask 077;'), 'the token is asked for, the repository named, the token file private');
  t.ok(!P.scriptFor('linux', cat, P.planOf(cat, ['piper-vctk-p248']), o).includes('read -rsp'), 'no token is asked for without a gated model');
  const cmd = P.scriptFor('windows', cat, all, o);
  t.ok(/^[\x00-\x7f]*$/.test(cmd) && !/[^\r]\n/.test(cmd), 'the Windows script: ASCII, CRLF');
  t.ok(cmd.includes("$env:COQUI_TOS_AGREED = '1'") && cmd.includes('Read-Host -AsSecureString') && cmd.includes('ai4bharat/indic-parler-tts'), 'Windows: licence setting, token asked for (hidden)');
  t.ok(cmd.split('\r\n').filter((l) => !/^\s*#/.test(l) && !/^@|^setlocal|^set |^powershell|^echo|^pause|^exit|^<#/.test(l)).every((l) => (l.replace(/''/g, '').match(/'/g) || []).length % 2 === 0), 'Windows: quotes balanced on every line');

  // each engine's first-run downloads add up to the plan's totals: Python and uv with the first engine, the shared
  // PyTorch once (with the first engine that needs it), again for an engine that pins its own (Chatterbox)
  {
    const pick = ['piper-vctk-p248', 'kokoro-af_heart', 'chatterbox-default', 'parler-mini-jon'].filter((id) => cat.voices.some((v) => v.id === id));
    const pl = P.planOf(cat, pick), rs = P.runsOf(cat, pl);
    t.eq(pick.length, 4, 'the four voices of the first-run check exist');
    t.eq(rs.map((r) => r.engine), ['piper', 'kokoro', 'chatterbox', 'parler'], 'runs in the planner’s order');
    t.eq(rs.map((r) => r.first.cuda !== r.first.programs), [false, true, true, false], 'PyTorch with Kokoro (first to need the shared one) and Chatterbox (its own), not again with Parler-TTS');
    const sum = (k) => Math.round(rs.reduce((a, r) => a + r.first[k], 0) * 10) / 10, r1 = (x) => Math.round(x * 10) / 10;
    t.eq([sum('programs'), sum('cuda'), sum('models')], [r1(pl.programMB), r1(pl.programMBcuda), r1(pl.modelMB)], 'the runs’ first downloads add up to the plan’s programs, NVIDIA programs and models');
    t.eq(rs[0].first.programs, cat.engines.piper.mb + P.BASE_MB, 'Python and uv come with the first engine');
  }
  t.eq([P.fmtMB(0.3), P.fmtMB(359.2), P.fmtMB(999), P.fmtMB(1000), P.fmtMB(3766.6), P.fmtMB(12345)], ['1 MB', '359 MB', '999 MB', '1.0 GB', '3.8 GB', '12 GB'], 'sizes in MB / GB');
  t.ok(P.matches(cat, byId.get('piper-vctk-p248'), 'indian woman') && !P.matches(cat, byId.get('piper-vctk-p251'), 'indian woman'), 'search: every word must match');
  t.ok(P.matches(cat, byId.get('indic-parler-thoma'), 'parler thoma') && P.matches(cat, byId.get('kokoro-af_heart'), 'american'), 'search finds the model and the group');

  // driver.py: Python reads it; the text pieces and the pace words
  const py = (code) => execFileSync('python3', ['-I', '-c', code], { cwd: tmp, encoding: 'utf8', env: { ...process.env, PYTHONPATH: '' } });
  writeFileSync(join(tmp, 'driver.py'), driver);
  const r = JSON.parse(py(`import sys, json; sys.path.insert(0, '.'); import driver
t = ' '.join(['Sentence number %d is here, with a clause.' % i for i in range(60)]) + '\\n\\nA new paragraph.'
c = driver.chunks(t, 240)
print(json.dumps({'max': max(map(len, c)), 'same': ' '.join(c).split() == t.split(), 'n': len(c), 'pace': [driver.pace(s) for s in (0.5, 0.8, 1, 1.3, 2)], 'kyutai': [round(driver.kyutai_bonus(s), 6) for s in (0.25, 0.5, 1, 1.3, 2, 4)], 'engines': sorted(driver.ENGINES)}))`));
  t.ok(r.max <= 240 && r.same && r.n > 5, `driver.py cuts a long text into pieces of at most 240 characters, every word kept (${r.n} pieces)`);
  t.eq(r.pace, ['very slowly', 'slowly', 'at a moderate pace', 'slightly fast', 'fast'], 'Parler’s pace words');
  t.eq(r.engines, [...P.ENGINE_ORDER].sort(), 'driver.py has every engine the planner runs');
  t.eq(r.kyutai, [2.25, 1.5, 0, -0.9, -3, -3], 'Kyutai’s pace: padding between words, more when slower, held within ±3 (measured: 0.62× – 1.3× the normal pace)');

  // the Indian voices by accent (owner, 21 Nov 2026): every one ranked or listed as not measured, lightest first; the
  // catalogue's numbers worked out again here from the survey's raw scores (scripts/data/indian-accents.json)
  {
    const data = JSON.parse(readFileSync(new URL('../../scripts/data/indian-accents.json', import.meta.url), 'utf8'));
    const ind = cat.voices.filter((v) => v.group === 'in'), r = P.rankIndian(cat);
    const all = [...r.measured.map((v) => v.id), ...r.unmeasured.flatMap((u) => u.voices.map((v) => v.id))];
    t.eq(all.slice().sort(), ind.map((v) => v.id).sort(), 'every Indian voice once: ranked, or listed as not measured');
    t.ok(r.measured.every((v, i) => !i || r.measured[i - 1].heard.indian <= v.heard.indian), 'ranked lightest first');
    t.ok(r.unmeasured.every((u) => u.reason.length > 10), `each unmeasured model has its reason (${r.unmeasured.map((u) => u.model).join(', ')})`);
    t.ok(r.unmeasured.some((u) => u.model === 'indic-parler' && /Hugging Face/.test(u.reason)), 'Indic Parler-TTS: not measured, needs an account');
    let same = 0, bad = [];
    for (const [id, d] of Object.entries(data.voices)) {
      const ms = d.scores.map((s) => s.indian - Math.max(...Object.entries(s).filter(([k]) => k !== 'indian').map(([, x]) => x)));
      const others = Object.keys(d.scores[0]).filter((k) => k !== 'indian').map((k) => [k, d.scores.reduce((a, s) => a + s[k], 0) / d.scores.length]);
      const like = others.sort((a, b) => b[1] - a[1])[0][0], v = cat.voices.find((x) => x.id === id);
      if (v && Math.abs(v.heard.indian - ms.reduce((a, x) => a + x, 0) / ms.length) < 1e-4 && v.heard.like === like && v.heard.n === d.scores.length) same++; else bad.push(id);
    }
    t.ok(!bad.length && same === Object.keys(data.voices).length, `each voice's accent in the catalogue is its scores' (${same} voices; ${bad.slice(0, 3).join(', ')})`);
    t.ok(Object.values(data.voices).every((d) => d.scores.every((s) => Object.keys(s).every((k) => P.ACCENT_WORDS[k]))), 'every accent of the survey has its words');
    t.eq([-0.6, -0.2, -0.1, 0, 0.01, 0.25, 0.26, 0.49].map(P.strength), ['very light', 'very light', 'light', 'light', 'clear', 'clear', 'strong', 'strong'], 'strength in words, at the thresholds of the survey (−0.2, 0, 0.25)');
    const words = new Set(r.measured.map((v) => P.strength(v.heard.indian)));
    t.ok(['very light', 'light', 'clear', 'strong'].every((w) => words.has(w)), `the survey's voices use all four words (${[...words].join(', ')})`);
    t.eq(data.texts.length, 2, 'two sentences in the survey');
  }

  // a gated model refused: which of the three cases it is, in words (owner, 21 Nov 2026: Indic Parler-TTS refused his
  // token and the message could not say why) — with a stand-in huggingface_hub
  mkdirSync(join(tmp, 'hfstub', 'huggingface_hub'), { recursive: true });
  writeFileSync(join(tmp, 'hfstub', 'huggingface_hub', '__init__.py'), [
    'import os',
    'class GatedRepoError(Exception): pass',
    'def whoami(token=None):',
    "    w = os.environ.get('STUB_WHOAMI', 'read')",
    "    if w == 'bad': raise Exception('401 Client Error: Unauthorized (Invalid username or password.)')",
    "    return {'name': 'asha', 'auth': {'accessToken': {'role': 'fineGrained' if w == 'fine' else 'read'}}}",
    'class HfApi:',
    '    def auth_check(self, repo, **k):',
    "        if os.environ.get('STUB_ACCESS') == 'no': raise GatedRepoError('403 Client Error. Cannot access gated repo. You are not in the authorized list.')",
    "def hf_hub_download(*a, **k): raise GatedRepoError('403 Client Error. Cannot access gated repo.')",
    "def snapshot_download(*a, **k): raise GatedRepoError('403 Client Error. Cannot access gated repo.')", ''].join('\n'));
  const check = (env, how = 'check') => spawnSync('python3', ['-I', '-c', `import sys, runpy; sys.path.insert(0, 'hfstub'); sys.path.insert(0, '.')
if '${how}' == 'check':
    sys.argv = ['driver.py', 'job.json', '--check-access', 'ai4bharat/indic-parler-tts']
    try: runpy.run_path('driver.py', run_name='__main__'); print('OK')
    except SystemExit as e: print('EXIT', e.code)
else:
    import driver
    try: driver.fetch('ai4bharat/indic-parler-tts', 'abc', ['config.json']); print('OK')
    except SystemExit as e: print('EXIT', e.code)`], { cwd: tmp, encoding: 'utf8', env: { ...process.env, PYTHONPATH: '', HF_HOME: '/home/u/SuperUtils-TTS/cache/huggingface', ...env } }).stdout;
  const ok = check({ STUB_ACCESS: 'ok' });
  t.ok(/ai4bharat\/indic-parler-tts: this computer may download it\.\nOK/.test(ok), `the check passes an open model (${ok.trim()})`);
  const bad = check({ STUB_ACCESS: 'no', STUB_WHOAMI: 'bad' });
  t.ok(/^EXIT Hugging Face refused the token saved on this computer/.test(bad) && bad.includes('type "Read"') && bad.includes('delete /home/u/SuperUtils-TTS/cache/huggingface/token and run the script again'), `a token Hugging Face does not know: make a Read token, delete the saved one (${bad.trim().slice(0, 120)})`);
  const notYet = check({ STUB_ACCESS: 'no', STUB_WHOAMI: 'read' });
  t.ok(notYet.includes('The token belongs to the account "asha", which has not been given access to ai4bharat/indic-parler-tts') && notYet.includes('"Agree and access repository"') && notYet.includes('the same token works'), 'an account that has not accepted the conditions: its name, the page, the button');
  const fine = check({ STUB_ACCESS: 'no', STUB_WHOAMI: 'fine' });
  t.ok(fine.includes('fine-grained token') && fine.includes('Read access to contents of all public gated repos you can access'), 'a fine-grained token: the box to tick, or a Read token');
  const dl = check({ STUB_WHOAMI: 'read' }, 'fetch');
  t.ok(dl.includes('\nEXIT The token belongs to the account "asha"'), `a download refused later says the same (fetch: ${dl.trim().slice(0, 160)})`);
  // the libraries' SyntaxWarnings (an escape in a docstring) are not shown once driver.py is loaded
  writeFileSync(join(tmp, 'noisy.py'), 's = "lru\\_cache"\n');
  const noisy = (pre) => spawnSync('python3', ['-I', '-c', `import sys; sys.path.insert(0, '.')\n${pre}\nexec(compile(open('noisy.py').read(), 'noisy.py', 'exec'))`], { cwd: tmp, encoding: 'utf8' }).stderr;
  t.ok(/SyntaxWarning/.test(noisy('')) && !/Warning/.test(noisy('import driver')), 'a module with an invalid escape: warned without driver.py, silent with it');
};
