// Fixtures for the FFmpeg tab's 22 jobs of to-do #32, made by the native FFmpeg (apt install ffmpeg; libx265 for the HDR
// clip) — run once, the outputs are committed:  node scripts/make-ffmpeg-fixtures.mjs
// Each is small and holds a known answer for its job (tests/fixtures/README.md lists them):
//   media/sync.mp4         4 s, 320 × 180: white flashes at 1.00 and 2.40 s, 1 kHz beeps at 1.30 and 2.70 s — the sound 300 ms late
//   media/left-voice.mp4   3 s, 160 × 90: the LibriSpeech sentence on the left side only (the right: faint room noise)
//   media/hum.wav          3 s, 16 kHz stereo: the sentence + mains hum (50 Hz and its overtones) on the left, the same
//                          sentence without the hum on the right — what the job does to the speech cancels between the sides
//   media/lecture.wav      8 s, 16 kHz mono: the sentence 20 dB down (a far speaker), then as it is (a near one), room noise
//   media/hdr.mp4          2 s, 640 × 360 HEVC Main 10, BT.2020 HLG (as an iPhone records), made from media/hdr-sdr.png
//   media/hdr-pq.mp4       the same as PQ (HDR10, as Android phones record), with mastering metadata (1000 cd/m²)
//   media/hdr-sdr.png      the SDR BT.709 picture the HDR clips were made from: colour bars, skin, a grey ramp
//   media/bars.mp4         2 s, 640 × 360: a 640 × 272 picture with black bars of 44 px above and below
//   media/obs.mkv          2 s, 320 × 180 H.264 + AAC stereo + PCM 16 kHz stereo ("Mic") + an SRT track + an attachment, as OBS records
//   media/logo.mp4         2 s, 640 × 360: a smooth gradient, a white logo box at 500,20 (120 × 40) from 1 s on
//   media/phone.mov        2 s, 320 × 180: QuickTime as an iPhone writes it — place, dates, make, model, software, a
//                          timecode track, a chapter
//   media/green.mp4        2 s, 320 × 240: a red square moving on a green screen (0x00FF00)
//   media/equirect.mp4     2 s, 1024 × 512 equirectangular: sky above, ground below, a red square at 90° right, yellow ahead
//   media/fisheye.mp4      2 s, 640 × 360: a grid of straight lines bent outwards like a GoPro's wide lens (barrel): the
//                          inverse, to the third order, of the correction FFmpeg users give a GoPro (k1 −0.227, k2 −0.022)
//   media/dot.mp4          2 s, 320 × 180: a white dot moving left to right on black (light trails, motion blur)
//   media/scenes.mp4       3 s, 320 × 180: three scenes of one second each (red, blue, a test pattern)
//   media/analyse.mp4      6.5 s, 320 × 180 + mono AAC: black + silence 0 – 1 s, a picture + tone 1 – 3 s, the picture
//                          frozen 3 – 5.5 s (tone), moving again + silence 5.5 – 6.5 s
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const F = (p) => fileURLToPath(new URL(`../tests/fixtures/${p}`, import.meta.url));
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const tmp = mkdtempSync(join(tmpdir(), 'ffx-'));
const x264 = (crf = 30) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
const speech = (t = 3) => ['-ss', '0.6', '-t', String(t), '-i', F('speech/librispeech-1.flac')];

// ---------------------------------------------------------------- sync: the sound 300 ms late
ff(['-f', 'lavfi', '-i', "color=black:s=320x180:r=25:d=4,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n\\,25)+eq(n\\,60)'",
  '-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*1000*t)*(between(t\\,1.3\\,1.35)+between(t\\,2.7\\,2.75))':s=48000:d=4",
  '-map', '0:v', '-map', '1:a', ...x264(35), '-c:a', 'aac', '-b:a', '96k', '-t', '4', '-movflags', '+faststart', F('media/sync.mp4')]);

// ---------------------------------------------------------------- a voice on the left side only
ff(['-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=25:d=3', ...speech(), '-f', 'lavfi', '-i', 'anoisesrc=d=3:c=pink:r=48000:a=0.001:seed=11',
  '-filter_complex', '[1:a]aresample=48000,volume=2[l];[l][2:a]join=inputs=2:channel_layout=stereo[a]',
  '-map', '0:v', '-map', '[a]', ...x264(32), '-c:a', 'aac', '-b:a', '128k', '-t', '3', '-movflags', '+faststart', F('media/left-voice.mp4')]);

// ---------------------------------------------------------------- hum: 50 Hz and overtones (odd ones stronger, as mains buzz)
const hum = [[50, 0.1], [100, 0.04], [150, 0.06], [200, 0.02], [250, 0.035], [300, 0.01], [350, 0.02], [450, 0.012]]
  .map(([f, a]) => `${a}*sin(2*PI*${f}*t+${(f / 50) * 0.7})`).join('+');
ff([...speech(), '-f', 'lavfi', '-i', `aevalsrc='${hum}':s=16000:d=3`,
  '-filter_complex', '[0:a]aresample=16000,volume=2,asplit=2[s1][s2];[s1][1:a]amix=inputs=2:normalize=0[l];[l][s2]join=inputs=2:channel_layout=stereo[a]',
  '-map', '[a]', '-c:a', 'pcm_s16le', '-t', '3', F('media/hum.wav')]);

// ---------------------------------------------------------------- a lecture: a far speaker, then a near one, in a room's noise
ff(['-ss', '0.6', '-t', '4', '-i', F('speech/librispeech-1.flac'), '-ss', '0.6', '-t', '4', '-i', F('speech/librispeech-1.flac'),
  '-f', 'lavfi', '-i', 'anoisesrc=d=8:c=pink:r=16000:a=0.003:seed=21',
  '-filter_complex', '[0:a]volume=-20dB[q];[1:a]volume=0dB[l];[q][l]concat=n=2:v=0:a=1[s];[s][2:a]amix=inputs=2:normalize=0[a]', '-map', '[a]', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', F('media/lecture.wav')]);

// ---------------------------------------------------------------- HDR: an SDR picture as HLG and as PQ, by BT.2100's formulas
// with BT.2408's mapping (SDR white → 203 cd/m², HLG at 75 %, PQ at 58 %) — not by the converter the job runs (zscale), so the
// test is not circular; the bottom 20 rows a grey ramp of highlights from 203 to 1000 cd/m², which the SDR picture cannot hold
ff(['-f', 'lavfi', '-i', 'smptehdbars=s=640x240,format=rgb24', '-f', 'lavfi', '-i', "color=c=0xE0AC8C:s=320x120,format=rgb24",
  '-f', 'lavfi', '-i', "nullsrc=s=320x120,geq=r='X*255/W':g='X*255/W':b='X*255/W',format=rgb24",
  '-filter_complex', '[1:v][2:v]hstack[b];[0:v][b]vstack,format=rgb24', '-frames:v', '1', '-update', '1', F('media/hdr-sdr.png')]);
{
  const W = 640, H = 360, sdr = execFileSync('ffmpeg', ['-v', 'error', '-i', F('media/hdr-sdr.png'), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  const M709to2020 = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0114], [0.0164, 0.0880, 0.8956]]; // BT.2087
  const hlgOetf = (e) => (e <= 1 / 12 ? Math.sqrt(3 * e) : 0.17883277 * Math.log(12 * e - 0.28466892) + 0.55991073);
  const m1 = 2610 / 16384, m2 = (2523 / 4096) * 128, c1 = 3424 / 4096, c2 = (2413 / 4096) * 32, c3 = (2392 / 4096) * 32;
  const pqInverseEotf = (nits) => { const p = (Math.max(0, nits) / 10000) ** m1; return ((c1 + c2 * p) / (1 + c3 * p)) ** m2; };
  for (const [kind, out] of [['hlg', 'media/hdr.mp4'], ['pq', 'media/hdr-pq.mp4']]) {
    const Y = new Float64Array(W * H), Cb = new Float64Array(W * H), Cr = new Float64Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const lin = [0, 1, 2].map((c) => (sdr[i * 3 + c] / 255) ** 2.4); // BT.1886
      let F2 = M709to2020.map((r) => 203 * (r[0] * lin[0] + r[1] * lin[1] + r[2] * lin[2])); // display light, cd/m²
      if (Math.floor(i / W) >= H - 20) { const nits = 203 + (797 * (i % W)) / (W - 1); F2 = [nits, nits, nits]; }
      let E;
      if (kind === 'hlg') { // the inverse of HLG's OOTF for a 1000 cd/m² display (system gamma 1.2), then the OETF
        const YS = ((0.2627 * F2[0] + 0.678 * F2[1] + 0.0593 * F2[2]) / 1000) ** (1 / 1.2);
        E = F2.map((f) => (YS > 0 ? hlgOetf(f / (1000 * YS ** 0.2)) : 0));
      } else E = F2.map(pqInverseEotf);
      const y = 0.2627 * E[0] + 0.678 * E[1] + 0.0593 * E[2];
      Y[i] = y; Cb[i] = (E[2] - y) / 1.8814; Cr[i] = (E[0] - y) / 1.4746; // BT.2020 non-constant luminance
    }
    const q = (v, lo, span) => Math.max(4, Math.min(1019, Math.round(lo + span * v))); // 10-bit, limited range
    const fr = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) fr.writeUInt16LE(q(Y[i], 64, 876), i * 2);
    let o = W * H * 2;
    for (const C of [Cb, Cr]) for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { fr.writeUInt16LE(q((C[y * W + x] + C[y * W + x + 1] + C[(y + 1) * W + x] + C[(y + 1) * W + x + 1]) / 4, 512, 896), o); o += 2; }
    writeFileSync(join(tmp, `${kind}.yuv`), Buffer.concat(Array(50).fill(fr)));
    const trc = kind === 'hlg' ? 'arib-std-b67' : 'smpte2084';
    const x265 = `log-level=error:colorprim=bt2020:transfer=${trc}:colormatrix=bt2020nc${kind === 'pq' ? ':hdr10=1:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400' : ''}`;
    ff(['-f', 'rawvideo', '-pix_fmt', 'yuv420p10le', '-s', `${W}x${H}`, '-r', '25', '-i', join(tmp, `${kind}.yuv`), '-c:v', 'libx265', '-preset', 'fast', '-crf', '22', '-x265-params', x265,
      '-color_primaries', 'bt2020', '-color_trc', trc, '-colorspace', 'bt2020nc', '-color_range', 'tv', '-tag:v', 'hvc1', '-movflags', '+faststart', F(out)]);
  }
}

// ---------------------------------------------------------------- letterboxed: black bars above and below
ff(['-i', F('media/clip.mp4'), '-t', '2', '-vf', 'scale=640:272,pad=640:360:0:44:black,setsar=1', ...x264(30), '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', F('media/bars.mp4')]);

// ---------------------------------------------------------------- OBS-style MKV: two sound tracks, subtitles, an attachment
writeFileSync(join(tmp, 'font.ttf'), Buffer.alloc(1024, 7));
ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=2', ...speech(2), '-f', 'lavfi', '-i', 'sine=f=330:r=48000:d=2', '-i', F('media/subs.srt'),
  '-filter_complex', '[1:a]aresample=48000,volume=2,asplit=2[a][b];[b]volume=0.5[c];[a][c]join=inputs=2:channel_layout=stereo[t1];[2:a]volume=0.5,pan=stereo|c0=c0|c1=c0[t2]',
  '-map', '0:v', '-map', '[t1]', '-map', '[t2]', '-map', '3:0', ...x264(30), '-c:a:0', 'aac', '-b:a:0', '128k', '-c:a:1', 'pcm_s16le', '-ar:a:1', '16000', '-c:s', 'srt',
  '-metadata:s:a:1', 'title=Mic', '-attach', join(tmp, 'font.ttf'), '-metadata:s:t', 'mimetype=application/x-truetype-font', '-t', '2', F('media/obs.mkv')]);

// ---------------------------------------------------------------- a logo box on a smooth gradient, from 1 s on
ff(['-f', 'lavfi', '-i', "nullsrc=s=640x360:r=25:d=2,geq=r='60+120*X/W':g='90+80*Y/H':b='200-90*X/W'",
  '-f', 'lavfi', '-i', 'color=yellow:s=30x30:r=25:d=2',
  '-filter_complex', "[0:v]drawbox=x=500:y=20:w=120:h=40:color=white:t=fill:enable='gte(t\\,1)',drawbox=x=506:y=26:w=108:h=28:color=0x202020:t=4:enable='gte(t\\,1)'[b];[b][1:v]overlay=x='20+t*100':y=300,format=yuv420p",
  ...x264(24), '-movflags', '+faststart', F('media/logo.mp4')]);

// ---------------------------------------------------------------- a phone's video: QuickTime with Apple's keys, a timecode, a chapter
writeFileSync(join(tmp, 'chapters.txt'), ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=2000\ntitle=Birthday\n');
ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=440:r=44100:d=2', '-i', join(tmp, 'chapters.txt'),
  '-map', '0:v', '-map', '1:a', '-map_chapters', '2', ...x264(32), '-c:a', 'aac', '-b:a', '96k', '-timecode', '10:15:30:00',
  '-movflags', 'use_metadata_tags', '-metadata', 'creation_time=2026-11-20T04:45:30.000000Z',
  '-metadata', 'com.apple.quicktime.location.ISO6709=+28.6139+077.2090+215.000/', '-metadata', 'com.apple.quicktime.make=Apple',
  '-metadata', 'com.apple.quicktime.model=iPhone 15 Pro', '-metadata', 'com.apple.quicktime.software=18.1',
  '-metadata', 'com.apple.quicktime.creationdate=2026-11-20T10:15:30+0530', '-metadata:s:v', 'handler_name=Core Media Video',
  '-metadata:s:a', 'handler_name=Core Media Audio', '-t', '2', F('media/phone.mov')]);

// ---------------------------------------------------------------- a green screen with a red square moving across it
ff(['-f', 'lavfi', '-i', 'color=0x00FF00:s=320x240:r=25:d=2', '-f', 'lavfi', '-i', 'color=red:s=80x80:r=25:d=2',
  '-filter_complex', "[0:v][1:v]overlay=x='40+t*80':y=80,format=yuv420p", ...x264(20), '-movflags', '+faststart', F('media/green.mp4')]);

// ---------------------------------------------------------------- 360°: equirectangular, a red square 90° to the right, yellow ahead
ff(['-f', 'lavfi', '-i', "nullsrc=s=1024x512:r=25:d=2,geq=r='if(lt(Y,256),60+Y/3,40)':g='if(lt(Y,256),120+Y/3,150-(Y-256)/4)':b='if(lt(Y,256),230,40)'",
  '-vf', 'drawbox=x=736:y=224:w=64:h=64:color=red:t=fill,drawbox=x=480:y=224:w=64:h=64:color=yellow:t=fill', ...x264(26), '-movflags', '+faststart', F('media/equirect.mp4')]);

// ---------------------------------------------------------------- a wide lens: straight grid lines bent outwards (barrel)
ff(['-f', 'lavfi', '-i', "nullsrc=s=640x360:r=25:d=2,geq=lum='if(lt(mod(X\\,64)\\,3)+lt(mod(Y\\,60)\\,3)\\,235\\,30)':cb=128:cr=128",
  '-vf', 'lenscorrection=k1=0.227:k2=0.1766', ...x264(24), '-movflags', '+faststart', F('media/fisheye.mp4')]);

// ---------------------------------------------------------------- a white dot moving on black
ff(['-f', 'lavfi', '-i', 'color=black:s=320x180:r=25:d=2', '-f', 'lavfi', '-i', 'color=white:s=8x8:r=25:d=2',
  '-filter_complex', "[0:v][1:v]overlay=x='20+t*130':y=86,format=yuv420p", ...x264(20), '-movflags', '+faststart', F('media/dot.mp4')]);

// ---------------------------------------------------------------- three scenes
ff(['-f', 'lavfi', '-i', 'color=red:s=320x180:r=25:d=1', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=25:d=1',
  '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=1', '-f', 'lavfi', '-i', 'color=white:s=40x100:r=25:d=1', '-f', 'lavfi', '-i', 'color=yellow:s=40x100:r=25:d=1',
  '-filter_complex', "[0:v][3:v]overlay=x='t*200':y=40[a];[1:v][4:v]overlay=x='280-t*200':y=40[b];[a][b][2:v]concat=n=3:v=1:a=0,format=yuv420p[v]", '-map', '[v]', ...x264(26), '-movflags', '+faststart', F('media/scenes.mp4')]);

// ---------------------------------------------------------------- a file to analyse: black, silence, a frozen picture
ff(['-f', 'lavfi', '-i', 'color=black:s=320x180:r=25:d=1', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=2',
  '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=2', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=1',
  '-f', 'lavfi', '-i', "aevalsrc='0.1*sin(2*PI*440*t)*between(t\\,1\\,5.5)':s=48000:d=6.5",
  '-filter_complex', '[2:v]trim=end_frame=1,loop=loop=62:size=1:start=0,setpts=N/25/TB[f];[0:v][1:v][f][3:v]concat=n=4:v=1:a=0,format=yuv420p[v]',
  '-map', '[v]', '-map', '4:a', ...x264(28), '-c:a', 'aac', '-b:a', '64k', '-t', '6.5', '-movflags', '+faststart', F('media/analyse.mp4')]);

for (const f of ['sync.mp4', 'left-voice.mp4', 'hum.wav', 'lecture.wav', 'hdr.mp4', 'hdr-pq.mp4', 'hdr-sdr.png', 'bars.mp4', 'obs.mkv', 'logo.mp4', 'phone.mov', 'green.mp4', 'equirect.mp4', 'fisheye.mp4', 'dot.mp4', 'scenes.mp4', 'analyse.mp4'])
  console.log(f, execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=size,duration', '-of', 'csv=p=0', F(`media/${f}`)]).toString().trim());
