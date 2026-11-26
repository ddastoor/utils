// Sound fixtures for the FFmpeg tab's level checks (to-do #23): every media fixture before was mono, and the tab's FFmpeg
// crashed on stereo Opus unseen. Made by the native FFmpeg (apt install ffmpeg) from LibriSpeech's sentence in
// tests/fixtures/speech/ — run once, the outputs are committed:  node scripts/make-sound-fixtures.mjs
//   media/stereo.mp4    3 s, 160 × 90 H.264 + stereo AAC 160 kb/s: the voice as two microphones hear it — the right
//                       side 0.29 ms later and 2 dB lower — with a little room noise on each side
//   media/surround.mkv  3 s, 160 × 90 H.264 + AC-3 320 kb/s in 5.1(side), the layout of AC-3 and DTS (libopus refuses it,
//                       FFmpeg's AAC encoder writes it as an "unknown" layout): the voice in the centre, two chords
//                       left and right, room noise on the sides, 50 Hz on the LFE
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const F = (p) => fileURLToPath(new URL(`../tests/fixtures/${p}`, import.meta.url));
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const speech = ['-ss', '0.6', '-t', '3', '-i', F('speech/librispeech-1.flac')];
const video = ['-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=25:d=3'];
const noise = (seed, a) => ['-f', 'lavfi', '-i', `anoisesrc=d=3:c=pink:r=48000:a=${a}:seed=${seed}`];
const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '32', '-pix_fmt', 'yuv420p'];

ff([...video, ...speech, ...noise(5, 0.004), ...noise(6, 0.004),
  '-filter_complex', '[1:a]aresample=48000,volume=2,asplit=2[l0][r0];[r0]volume=0.8,adelay=14S[r1];[l0][2:a]amix=inputs=2:normalize=0[l];[r1][3:a]amix=inputs=2:normalize=0[r];[l][r]join=inputs=2:channel_layout=stereo[a]',
  '-map', '0:v', '-map', '[a]', ...x264, '-c:a', 'aac', '-b:a', '160k', '-t', '3', '-movflags', '+faststart', F('media/stereo.mp4')]);

const chord = (f) => ['-f', 'lavfi', '-i', `aevalsrc='0.06*sin(2*PI*${f}*t)+0.03*sin(2*PI*${2 * f}*t)+0.02*sin(2*PI*${3 * f}*t)':s=48000:d=3`];
ff([...video, ...speech, ...chord(220), ...chord(277.18), '-f', 'lavfi', '-i', 'sine=f=50:r=48000:d=3', ...noise(7, 0.02), ...noise(8, 0.02),
  '-filter_complex', '[1:a]aresample=48000,volume=2[c];[4:a]volume=0.3[lfe];[2:a][3:a][c][lfe][5:a][6:a]join=inputs=6:channel_layout=5.1(side):map=0.0-FL|1.0-FR|2.0-FC|3.0-LFE|4.0-SL|5.0-SR[a]',
  '-map', '0:v', '-map', '[a]', ...x264, '-c:a', 'ac3', '-b:a', '320k', '-t', '3', F('media/surround.mkv')]);

for (const f of ['media/stereo.mp4', 'media/surround.mkv'])
  console.log(f, execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,channels,channel_layout:format=size,duration', '-of', 'csv=p=0', F(f)]).toString().trim().replace(/\n/g, ' · '));
