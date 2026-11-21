#!/usr/bin/env python3
# run.py WORK [ENGINE…] — the Indian-accent survey of the offline Text-to-Speech voices (owner, 21 Nov 2026: rank them
# "in order of increasing Indian accent thickness"). Every voice of the Indian group that can run here (not gated, not
# tagged "not run") reads the two sentences below through driver.py, model by model (its download deleted after it),
# then accent.py scores every recording into WORK/scores.json. Then: python3 scripts/make-indian-accents.py WORK, and
# python3 scripts/make-offline-tts-catalogue.py. A recording already in WORK is not made again. Needs uv (~/.local/bin/uv or on the PATH), several GB of disk, hours
# on a processor (Bark small, OmniVoice and Kyutai are slow). Each engine runs in WORK/envs/<engine>, made with
# `uv pip install --torch-backend cpu` (as the scripts of the tab do — `uv run --with torch` takes no backend and puts
# PyPI's CUDA build, 4 GB of NVIDIA libraries, on a machine without a graphics card).
import json, os, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEXTS = ['Good morning. I do hope you had a pleasant journey. The weather in London has been rather lovely this week, '
         'and the gardens are looking their very best.',
         'Please remember to bring an umbrella this afternoon. We shall meet at the station at half past four, and then '
         'walk to the theatre together.']
UV = shutil.which('uv') or os.path.expanduser('~/.local/bin/uv')
ENV = {**os.environ, 'UV_TORCH_BACKEND': 'cpu', 'HF_HUB_DISABLE_XET': '1', 'HF_HUB_DISABLE_TELEMETRY': '1', 'UV_NO_CONFIG': '1',
       'UV_PYTHON_PREFERENCE': 'only-managed', 'PYTHONUTF8': '1', 'COQUI_TOS_AGREED': '1'}


def envfor(work, name, pins):
    """WORK/envs/<name> with these packages (PyTorch's processor build), made once; its python."""
    e = os.path.join(work, 'envs', name)
    py, mark = os.path.join(e, 'bin', 'python'), os.path.join(e, '.pins')
    if os.path.exists(py) and os.path.exists(mark) and open(mark).read() == ' '.join(pins):
        return py
    shutil.rmtree(e, ignore_errors=True)
    subprocess.run([UV, 'venv', '--quiet', '--python', '3.12', e], env=ENV, check=True)
    subprocess.run([UV, 'pip', 'install', '--python', py, '--torch-backend', 'cpu', *pins], env=ENV, check=True)
    open(mark, 'w').write(' '.join(pins))
    return py


def job(cat, ids, text):
    vs = []
    for v in cat['voices']:
        if v['id'] in ids:
            m = cat['models'][v['model']]
            o = {'id': v['id'], 'label': v['label'], 'engine': m['engine'], 'repo': m['repo'], 'rev': m['rev']}
            for k in ('file', 'descTokenizer'):
                if k in m: o[k] = m[k]
            for k in ('speaker', 'voice', 'lang', 'describe', 'clip'):
                if k in v: o[k] = v[k]
            vs.append(o)
    return {'text': text, 'speed': 1, 'mp3': False, 'voices': vs}


def main():
    work, only = os.path.abspath(sys.argv[1]), set(sys.argv[2:])
    cat = json.load(open(os.path.join(ROOT, 'src/lib/offline-tts/catalogue.json'), encoding='utf-8'))
    by = {}
    for v in cat['voices']:
        m = cat['models'][v['model']]
        if v['group'] == 'in' and not m.get('gated') and not m.get('untried') and (not only or m['engine'] in only):
            by.setdefault(v['model'], []).append(v['id'])
    # the recordings made before, sentence by sentence (an earlier survey wrote the first sentence's into "out"): a run that
    # stopped (out of memory, a reboot) goes on where it was
    have = [set(), set()]
    for r, _, fs in os.walk(work):
        k = {'out': 0, 'out1': 0, 'out2': 1}.get(os.path.basename(r))
        if k is not None:
            have[k] |= {f[:-4] for f in fs if f.endswith('.wav')}
    for mid, ids in by.items():
        if all(i in have[0] and i in have[1] for i in ids):
            continue
        e, d = cat['models'][mid]['engine'], os.path.join(work, mid)
        os.makedirs(d, exist_ok=True)
        shutil.copy(os.path.join(ROOT, 'src/lib/offline-tts/driver.py'), d)
        py = envfor(work, e, cat['engines'][e]['packages'])
        for i, t in enumerate(TEXTS, 1):
            todo = [v for v in ids if v not in have[i - 1]]
            if not todo:
                continue
            json.dump(job(cat, todo, t), open(os.path.join(d, f'job{i}.json'), 'w'), ensure_ascii=False)
            print(f'== {mid} ({i}): {len(todo)} voices', flush=True)
            subprocess.run([py, '-I', 'driver.py', f'job{i}.json', e, f'out{i}'], cwd=d, env=ENV)
        shutil.rmtree(os.path.join(d, 'models'), ignore_errors=True)
    wavs = [os.path.join(r, f) for r, _, fs in os.walk(work) for f in fs if f.endswith('.wav') and os.path.basename(r) in ('out1', 'out2')]
    py = envfor(work, 'accent', ['speechbrain==1.1.2', 'librosa==0.11.0', 'torch', 'torchaudio'])
    subprocess.run([py, '-I', os.path.join(ROOT, 'scripts/accent-survey/accent.py'), os.path.join(work, 'scores.json'), *sorted(wavs)], env=ENV, check=True)


if __name__ == '__main__':
    main()
