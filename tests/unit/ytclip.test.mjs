// YouTube Clip: links and times as people paste them (src/lib/ytclip.ts). Known answers; the times of yt-dlp's
// --download-sections are seconds, so every reading is checked as seconds.
export default async (t, { load }) => {
  const { parseTime, parseYouTube, hms } = await load('/src/lib/ytclip.ts');
  const T = [['62', 62], ['62.5', 62.5], ['1:02', 62], ['01:02', 62], ['1:02:03', 3723], ['1:02:03.5', 3723.5], ['0:59', 59], ['1h2m3s', 3723], ['90s', 90], ['2m', 120], ['1h', 3600], ['1m30.25s', 90.25], [' 1:02 ', 62],
    ['1:60', NaN], ['1:61:00', NaN], ['0:00:60', NaN], ['', NaN], ['abc', NaN], ['-5', NaN], ['1:2:3:4', NaN], ['h', NaN]];
  for (const [s, want] of T) { const got = parseTime(s); t.ok(Number.isNaN(want) ? Number.isNaN(got) : got === want, `parseTime(${JSON.stringify(s)}) = ${got} (${want})`); }
  const L = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=62', 'dQw4w9WgXcQ', 62], ['https://youtu.be/dQw4w9WgXcQ?t=1m2s', 'dQw4w9WgXcQ', 62], ['youtu.be/dQw4w9WgXcQ?si=abc&t=90', 'dQw4w9WgXcQ', 90],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ#t=1:02', 'dQw4w9WgXcQ', 62], ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', NaN], ['https://www.youtube.com/live/dQw4w9WgXcQ?t=5', 'dQw4w9WgXcQ', 5],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30', 'dQw4w9WgXcQ', 30], ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', NaN]];
  for (const [u, id, tt] of L) { const r = parseYouTube(u); t.ok(r && r.id === id && (Number.isNaN(tt) ? Number.isNaN(r.t) : r.t === tt), `${u} → ${r?.id} at ${r?.t}`); }
  for (const u of ['https://vimeo.com/123', 'https://www.youtube.com/watch?v=short', 'not a link', 'https://www.youtube.com/channel/UCxyz']) t.eq(parseYouTube(u), null, `${u}: not a video link`);
  const H = [[62, '1:02'], [62.5, '1:02.5'], [0, '0:00'], [59.996, '1:00'], [3599.999, '1:00:00'], [3723, '1:02:03'], [9.5, '0:09.5'], [119.994, '1:59.99']];
  for (const [s, want] of H) t.eq(hms(s), want, `hms(${s}) = ${want} (59.996 came out "0:60")`);
};
