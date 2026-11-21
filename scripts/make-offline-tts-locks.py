#!/usr/bin/env python3
# make-offline-tts-locks.py — the exact version of every package each offline speech engine runs with →
# scripts/data/offline-tts-locks.json, which the catalogue generator puts beside each engine's packages. The scripts of
# the tab install an engine with them as constraints (uv pip install -c), so a PC gets the versions that ran here and a
# new release of a library cannot break an engine overnight (found 21 Nov 2026: coqui-tts asks only for transformers
# >= 4.57, and transformers 5.24, out that day, broke XTTS-v2 on every fresh install).
# One lock for every system (uv pip compile --universal, Python 3.12); PyTorch's own packages keep their version but not
# their build (+cpu …: uv picks the build for the PC's graphics card), and NVIDIA's libraries and Triton are left to that
# build. Needs uv. Run after a change to an engine's packages, then the generator; run the engine (driver.py) after.
import importlib.util, json, os, re, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('catalogue', os.path.join(here, 'make-offline-tts-catalogue.py'))
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)
OUT = os.path.join(here, 'data', 'offline-tts-locks.json')
TORCH = {'torch', 'torchaudio', 'torchvision', 'torchcodec'}
UV = os.environ.get('UV') or 'uv'


def lock(packages):
    with tempfile.TemporaryDirectory() as d:
        req = os.path.join(d, 'req.in')
        open(req, 'w').write('\n'.join(packages) + '\n')
        r = subprocess.run([UV, 'pip', 'compile', '--universal', '--python-version', '3.12', '--torch-backend', 'cpu', '--no-header',
                            '--no-annotate', '--quiet', req], capture_output=True, text=True, env={**os.environ, 'UV_NO_CONFIG': '1'})
        if r.returncode:
            sys.exit(f'uv pip compile failed for {packages}:\n{r.stderr}')
    out = []
    for line in r.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith(('#', '-')):
            continue
        spec, _, mark = line.partition(' ; ')
        name = re.split(r'[=<>!~\[ ]', spec, maxsplit=1)[0].lower()
        if name.startswith('nvidia-') or name == 'triton':
            continue  # what PyTorch's CUDA build needs comes with that build
        if re.search(r"sys_platform == 'emscripten'", mark) and '!=' not in mark:
            continue  # a browser's Python: never on a PC
        spec = re.sub(r'\+(cpu|cu\d+|rocm[\d.]+|xpu)$', '', spec)
        if name in TORCH:
            mark = ''  # the same version everywhere; the build is uv's choice (UV_TORCH_BACKEND=auto)
        item = spec + (f' ; {mark}' if mark else '')
        if item not in out:
            out.append(item)
    return out


def main():
    ver = subprocess.run([UV, '--version'], capture_output=True, text=True).stdout.strip()
    locks = {}
    for name, e in gen.ENGINES.items():
        locks[name] = {'packages': e['packages'], 'lock': lock(e['packages'])}
        print(f'{name}: {len(locks[name]["lock"])} packages', flush=True)
    for extra, pkgs in (('check-access', gen.CHECK_PINS),) if hasattr(gen, 'CHECK_PINS') else ():
        locks[extra] = {'packages': pkgs, 'lock': lock(pkgs)}
    data = {'about': 'The exact packages each offline speech engine runs with (uv pip compile --universal, Python 3.12; PyTorch '
                     'without its build suffix; NVIDIA libraries and Triton left to the PyTorch build). Made by '
                     f'scripts/make-offline-tts-locks.py with {ver}.', 'engines': locks}
    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(OUT, 'a', encoding='utf-8').write('\n')


if __name__ == '__main__':
    main()
