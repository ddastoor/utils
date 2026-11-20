// Line breaking of Text on Image (src/lib/textwrap.ts) with a fixed-width "font": every character is 10 units wide
// (an emoji or an accented letter made of several code points is one character on screen, so one width).
export default async (t, { load }) => {
  const { wrapLines } = await load('/src/lib/textwrap.ts');
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const g = { measureText: (s) => ({ width: [...seg.segment(s)].length * 10 }) };
  const W = (text, max) => wrapLines(g, text, max);
  t.eq(W('hello world', 200), ['hello world'], 'fits on one line');
  t.eq(W('hello world', 80), ['hello', 'world'], 'breaks between words');
  t.eq(W('one two three four', 90), ['one two', 'three', 'four'], 'greedy: as many words as fit');
  t.eq(W('a\nb', 100), ['a', 'b'], 'line breaks are kept');
  t.eq(W('a\r\nb', 100), ['a', 'b'], 'CR LF is one line break');
  t.eq(W('a\n\nb', 100), ['a', '', 'b'], 'an empty line stays');
  t.eq(W('   ', 100), [''], 'only spaces: an empty line');
  t.eq(W('word    word', 60), ['word', 'word'], 'spaces at a break are dropped');
  // words wider than the line
  t.eq(W('https://example.com/a/very/long/path', 100), ['https://ex', 'ample.com/', 'a/very/lon', 'g/path'], 'a web address is broken between characters');
  t.eq(W('see https://example.com/abc now', 100), ['see', 'https://ex', 'ample.com/', 'abc now'], 'a long word starts its own line; text goes on after it');
  t.eq(W('今日はとても良い天気ですね', 50), ['今日はとて', 'も良い天気', 'ですね'], 'Japanese (no spaces) is broken between characters');
  t.eq(W('这是一个很长的中文句子没有空格', 70), ['这是一个很长的', '中文句子没有空', '格'], 'Chinese likewise');
  t.eq(W('👍🏽👍🏽👍🏽👍🏽', 20), ['👍🏽👍🏽', '👍🏽👍🏽'], 'an emoji with its skin tone is never cut');
  t.eq(W('éééé', 20), ['éé', 'éé'], 'a letter with its combining accent stays whole');
  t.eq(W('नमस्ते दुनिया', 1000), ['नमस्ते दुनिया'], 'Hindi on one line when it fits');
  t.eq(W('x', 5), ['x'], 'a single character wider than the line still gets a line (never an endless loop)');
  t.eq(W('abcdef', 5), ['a', 'b', 'c', 'd', 'e', 'f'], 'each character on its own line when nothing more fits');
  // every line fits (unless it is a single character) and no character is lost
  const words = 'The quick brown fox jumps over the lazy dog supercalifragilisticexpialidocious 東京タワー 🙂🙂🙂'.split(' ');
  let bad = 0;
  for (let i = 0; i < 400; i++) {
    const text = Array.from({ length: 1 + (i % 9) }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(i % 5 ? ' ' : '  ');
    const max = 30 + (i * 13) % 200, lines = W(text, max);
    const fits = lines.every((l) => g.measureText(l).width <= max || [...seg.segment(l)].length === 1);
    const same = lines.join('').replace(/\s+/g, '') === text.replace(/\s+/g, '');
    if (!fits || !same) bad++;
  }
  t.eq(bad, 0, '400 random texts: every line fits and no character is lost or repeated');
};
