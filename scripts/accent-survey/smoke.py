#!/usr/bin/env python3
# smoke.py WORK ENGINE:VOICE … — each offline speech engine run once with its lock (run.py's envfor: the packages and
# versions the tab's scripts install), one voice, one short sentence; prints the length of speech made or the error. The
# model is deleted after each engine (disk). Engines are run one after another; with --wait-gb N each one starts only when
# N GB of memory are free (a long survey may be running beside it). Example:
#   python3 scripts/accent-survey/smoke.py WORK --wait-gb 6 chatterbox:chatterbox-default voxcpm:voxcpm2-design-in-woman-young
import json, os, shutil, subprocess, sys, time, wave
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import run  # noqa: E402

TEXT = 'Good morning. This is a short test of the voice, at 9:30 on 21 November.'


def free_gb():
    for line in open('/proc/meminfo'):
        if line.startswith('MemAvailable:'):
            return int(line.split()[1]) / 1048576
    return 99


def main():
    args = sys.argv[1:]
    work = os.path.abspath(args.pop(0))
    wait = 0
    if args and args[0] == '--wait-gb':
        wait = float(args[1]); args = args[2:]
    cat = json.load(open(os.path.join(ROOT, 'src/lib/offline-tts/catalogue.json'), encoding='utf-8'))
    for spec in args:
        e, vid = spec.split(':', 1)
        while wait and free_gb() < wait:
            time.sleep(30)
        print(f'== {time.strftime("%H:%M")} {spec} (free: {free_gb():.0f} GB, disk: {shutil.disk_usage("/").free / 1e9:.1f} GB)', flush=True)
        d = os.path.join(work, 'smoke-' + e)
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        shutil.copy(os.path.join(ROOT, 'src/lib/offline-tts/driver.py'), d)
        t0 = time.time()
        try:
            py = run.envfor(work, e, cat['engines'][e]['packages'], cat['engines'][e].get('lock', ()))
        except Exception as ex:
            print(f'{e}: environment failed: {ex}', flush=True); continue
        t1 = time.time()
        json.dump(run.job(cat, [vid], TEXT), open(os.path.join(d, 'job.json'), 'w'))
        r = subprocess.run([py, '-I', 'driver.py', 'job.json', e, 'out'], cwd=d, env=run.ENV, capture_output=True, text=True)
        w = os.path.join(d, 'out', vid + '.wav')
        if r.returncode == 0 and os.path.exists(w):
            with wave.open(w) as f:
                secs = f.getnframes() / f.getframerate()
            print(f'{e}: OK {vid} — {secs:.1f} s of speech; environment {t1 - t0:.0f} s, speech {time.time() - t1:.0f} s', flush=True)
        else:
            print(f'{e}: FAILED {vid} (exit {r.returncode}): {(r.stderr or r.stdout)[-1500:]}', flush=True)
        shutil.rmtree(os.path.join(d, 'models'), ignore_errors=True)


if __name__ == '__main__':
    main()
