#!/bin/bash
# finish-7.sh WORK — the rest of to-do #7 (TTS offline: the Indian voices already in the catalogue), one heavy job at a
# time — 16 GB of memory: two models at once were killed. First the engines not yet run here (smoke.py, each with its
# lock), then the accent survey of every Indian voice not yet measured (run.py resumes from the recordings in WORK; F5 is
# left out: 34 minutes for 10 seconds of speech on the 4-core test machine). Safe to start again after a stop.
# Afterwards: python3 scripts/make-indian-accents.py WORK && python3 scripts/make-offline-tts-catalogue.py (docs/RESUME.md).
set -u
W=$1; H=$(cd "$(dirname "$0")" && pwd)
python3 "$H/smoke.py" "$W" chatterbox:chatterbox-default chatterbox:chatterbox-turbo-default vibevoice:vibevoice-clip-imran veena:veena-kavya
for e in kyutai xtts voxcpm chatterbox bark vibevoice veena; do
  echo "== survey $e $(date +%H:%M)"
  python3 "$H/run.py" "$W" --all "$e"
done
echo "== finished $(date +%H:%M)"
