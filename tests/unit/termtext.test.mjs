// src/lib/termtext.ts — the text model behind the Python Scratchpad's output pane: what a terminal would show for a
// stream of characters with \r, \b, ESC[K, clears and colours. Known answers, the take() protocol the view relies on,
// escape sequences cut at every possible place, and a seeded comparison with a second, character-cell implementation
// written here (a list of cells per line — nothing shared with the run-based code under test).
export default async (t, { load }) => {
  const { TermText } = await load('src/lib/termtext.ts');
  const E = '\x1b';
  const text = (s, k = 'o') => { const m = new TermText(); m.write(s, k); return m.text(); };
  const runs = (s) => { const m = new TermText(); m.write(s, 'o'); const u = m.take(); return [...u.done, ...u.line].map((r) => `${r.c}|${r.t}`); };

  // ---- plain text, carriage return, backspace
  t.eq(text('one\ntwo\n'), 'one\ntwo\n', 'plain lines come out as written');
  t.eq(text('no newline at the end'), 'no newline at the end', 'an open last line is part of the text');
  t.eq(text('abc\rX\n'), 'Xbc\n', '\\r goes back to the start; what follows writes over');
  t.eq(text('\rprogress 0%\rprogress 25%\rprogress 50%\rprogress 100%\n'), 'progress 100%\n', 'a progress line rewritten with \\r shows its last state');
  t.eq(text('hello world\rbye\n'), 'byelo world\n', 'a shorter rewrite leaves the rest of the old line, as a terminal does');
  t.eq(text('dos line\r\nnext\r\n'), 'dos line\nnext\n', '\\r\\n is a line break');
  t.eq(text('a\r\r\rb\n'), 'b\n', 'repeated \\r');
  t.eq(text('back\b\bXY\n'), 'baXY\n', '\\b steps back one place without erasing');
  t.eq(text('\b\bx'), 'x', '\\b at the start of a line does nothing');
  t.eq(text('ab\b\b\b\bX'), 'Xb', 'more \\b than characters stops at the start');
  t.eq(text('|\b/\b-\b\\\b|\n'), '|\n', 'a spinner drawn with \\b');
  t.eq(text('a\x00b\x07c\x7fd\x01e\n'), 'abcde\n', 'NUL, BEL, DEL and other control characters are not shown');
  t.eq(text('a\tb\n'), 'a\tb\n', 'tabs stay');
  t.eq(text('नमस्ते 😀 café\n'), 'नमस्ते 😀 café\n', 'text outside ASCII');

  // ---- erase in line, clear
  t.eq(text(`hello world\rbye${E}[K\n`), 'bye\n', 'ESC[K erases from the cursor to the end of the line');
  t.eq(text(`hello world\rbye${E}[0K\n`), 'bye\n', 'ESC[0K is the same');
  t.eq(text(`abcdef\r${E}[2Kxy\n`), 'xy\n', 'ESC[2K erases the whole line');
  t.eq(text(`abcdef${E}[2Kxy\n`), '      xy\n', 'after ESC[2K the cursor stays in its column');
  t.eq(text(`abcdef\b\b\b${E}[1K\n`), '    ef\n', 'ESC[1K blanks the line up to and including the cursor');
  t.eq(text(`a\nb\n${E}[2Jc\n`), 'c\n', 'ESC[2J clears everything written so far');
  t.eq(text(`a\nb${E}[3Jc`), 'c', 'ESC[3J too');
  t.eq(text(`a\nb\n${E}[H${E}[Jc\n`), 'c\n', 'ESC[H ESC[J (what "clear" sends) clears');
  t.eq(text(`a\nb\n${E}[1;1H${E}[0Jc\n`), 'c\n', 'ESC[1;1H ESC[0J clears');
  t.eq(text(`a\nb\n${E}cc\n`), 'c\n', 'ESC c (reset) clears');
  t.eq(text(`a\nbcd\r${E}[Jx\n`), 'a\nx\n', 'ESC[J without a "home" before it only erases the rest of the line');
  t.eq(text(`a\n${E}[Hb${E}[Jc\n`), 'a\nbc\n', 'text between ESC[H and ESC[J: nothing is cleared');
  t.eq(text(`a\n${E}[5;3H${E}[Jc\n`), 'a\nc\n', 'a cursor position other than home does not arm the clear');
  { const m = new TermText(); m.write('a\nb\n', 'o'); m.take(); m.write(`${E}[2Jc`, 'o'); const u = m.take(); t.ok(u.cleared && u.redraw && u.done.length === 0 && u.line[0].t === 'c', 'take() reports a clear, and only what came after it'); }

  // ---- colours and styles
  t.eq(runs(`${E}[31mred${E}[0m plain`), ['o;#e06c75;;|red', 'o| plain'], 'ESC[31m … ESC[0m: a red run, then plain');
  t.eq(runs(`${E}[1;4;3mx${E}[22my${E}[24mz${E}[23mw`), ['o;;;biu|x', 'o;;;iu|y', 'o;;;i|z', 'o|w'], 'bold, underline, italic on and off');
  t.eq(runs(`${E}[92;44mx${E}[39my${E}[49mz`), ['o;#b5e890;#61afef;|x', 'o;;#61afef;|y', 'o|z'], 'bright colours, background, default colour codes');
  t.eq(runs(`${E}[38;5;196mx${E}[38;5;244my${E}[38;5;3mz${E}[38;5;11mw`), ['o;rgb(255,0,0);;|x', 'o;rgb(128,128,128);;|y', 'o;#e5c07b;;|z', 'o;#ffd68a;;|w'], '256-colour codes: cube, grey ramp, the 16 basic colours');
  t.eq(runs(`${E}[38;2;1;2;300mx${E}[48;2;9;8;7my`), ['o;rgb(1,2,255);;|x', 'o;rgb(1,2,255);rgb(9,8,7);|y'], '24-bit colours (values kept within 0–255)');
  t.eq(runs(`${E}[38:5:21mx`), ['o;rgb(0,0,255);;|x'], 'colon-separated colour codes');
  t.eq(runs(`${E}[mx${E}[7;8;53my`), ['o|xy'], 'ESC[m resets; codes without a meaning here are ignored');
  t.eq(runs(`${E}[32mgreen\nstill green\n${E}[0mplain\n`), ['o;#98c379;;|green\nstill green\n', 'o|plain\n'], 'a colour lasts across lines until it is reset');
  t.eq(text(`${E}[31mred${E}[0m plain\n`), 'red plain\n', 'text() has no trace of the colour codes');
  { const m = new TermText(); m.write('out ', 'o'); m.write('err ', 'e'); m.write('in\n', 'i'); m.write(`${E}[31mx`, 'e');
    const u = m.take(); t.eq([...u.done, ...u.line].map((r) => `${r.c}|${r.t}`), ['o|out ', 'e|err ', 'i|in\n', 'e;#e06c75;;|x'], 'stdout, stderr and echoed input keep their own stream letter'); }
  t.eq(runs(`ab${E}[31m\rX`), ['o;#e06c75;;|X', 'o|b'], 'writing over part of a line in another colour splits the run');
  t.eq(runs(`${E}[31mab${E}[0m\rab`), ['o|ab'], 'writing over a coloured run with plain text removes the colour');

  // ---- other escape sequences are left out
  t.eq(text(`a${E}[2Ab${E}[10;20Hc${E}[?25ld${E}[?25he${E}[sf${E}[ug\n`), 'abcdefg\n', 'cursor movement and private modes are dropped');
  t.eq(text(`${E}]0;window title\x07text\n`), 'text\n', 'OSC (window title) ended by BEL');
  t.eq(text(`${E}]8;;https://example.in${E}\\link${E}]8;;${E}\\ after\n`), 'link after\n', 'OSC 8 hyperlinks ended by ESC \\ keep their text');
  t.eq(text(`a${E}(Bb${E}7c${E}8d${E}=e\n`), 'abcde\n', 'charset selection and two-character escapes');
  t.eq(text(`a${E}[${'1;'.repeat(40)}`), `a[${'1;'.repeat(40)}`, 'a control sequence that never ends is shown without its ESC, not swallowed for ever');
  t.eq(text(`a${E}[3\nb\n`), 'a\nb\n', 'a control sequence broken by a line break');
  t.eq(text(`a${E}`), 'a', 'a lone ESC at the very end waits for what follows');

  // ---- every way of cutting the stream gives the same result
  const TRICKY = [`${E}[1;31mbold red${E}[0m\rXY\n`, `a${E}]0;t\x07b${E}[2Kc\r\nd`, `${E}[38;2;10;20;30mx${E}[H${E}[Jy`, `p 10%\rp 100%${E}[K\n\b\bz`, `नम\rस्ते😀${E}[4mu\n`, `a\nb\n${E}cc${E}(Bd`];
  let cutOk = 0, cuts = 0;
  for (const s of TRICKY) {
    const whole = new TermText(); whole.write(s, 'o'); const wu = whole.take(), want = JSON.stringify([whole.text(), wu.done, wu.line]);
    const byChar = new TermText(); for (const ch of s.split('')) byChar.write(ch, 'o');
    let u = byChar.take(); cuts++; if (JSON.stringify([byChar.text(), u.done, u.line]) === want) cutOk++;
    for (let i = 1; i < s.length; i++) {
      const m = new TermText(); m.write(s.slice(0, i), 'o'); m.write(s.slice(i), 'o'); u = m.take();
      cuts++; if (JSON.stringify([m.text(), u.done, u.line]) === want) cutOk++;
    }
  }
  t.eq(cutOk, cuts, `${cuts} ways of cutting 6 tricky streams into pieces (every position, and one character at a time) all give the same text and runs`);

  // ---- the protocol with the view
  { const m = new TermText(); let u;
    m.write('ab', 'o'); u = m.take(); t.eq([u.redraw, u.added, u.done], [false, [{ t: 'ab', c: 'o' }], []], 'text at the end of the open line is reported as "added"');
    m.write('c', 'o'); m.write('d', 'o'); u = m.take(); t.eq([u.redraw, u.added], [false, [{ t: 'cd', c: 'o' }]], 'added pieces of one style are joined');
    m.write('\rX', 'o'); u = m.take(); t.eq([u.redraw, u.added, u.line], [true, [], [{ t: 'Xbcd', c: 'o' }]], 'writing over asks for the line to be redrawn');
    m.write('e\n', 'o'); u = m.take(); t.eq([u.redraw, u.done, u.line], [true, [{ t: 'Xecd\n', c: 'o' }], []], 'a line break moves the line to "done" and empties the open line');
    m.write('\n\n', 'o'); u = m.take(); t.eq([u.redraw, u.done, u.line], [false, [{ t: '\n\n', c: 'o' }], []], 'empty lines need no redraw');
    u = m.take(); t.eq([u.cleared, u.redraw, u.done, u.added], [false, false, [], []], 'nothing new → nothing to do');
    m.write('x\ny\nz', 'o'); m.write('!\n', 'e'); u = m.take(); t.eq(u.done, [{ t: 'x\ny\n', c: 'o' }, { t: 'z', c: 'o' }, { t: '!\n', c: 'e' }].reduce((a, r) => { const l = a[a.length - 1]; if (l && l.c === r.c) l.t += r.t; else a.push({ ...r }); return a; }, []), 'done runs of one style are joined across lines');
    m.clear(); u = m.take(); t.ok(u.cleared && m.text() === '', 'clear() empties the model'); }

  // ---- a second implementation: one list of cells per line
  const cells = (ops) => {
    let lines = [[]], col = 0;
    for (const op of ops) {
      const line = lines[lines.length - 1];
      if (op === '\n') { lines.push([]); col = 0; }
      else if (op === '\r') col = 0;
      else if (op === '\b') col = Math.max(0, col - 1);
      else if (op === 'K0') line.length = Math.min(line.length, col);
      else if (op === 'K1') { for (let i = 0; i <= col && i < line.length; i++) line[i] = ' '; }
      else if (op === 'K2') line.length = 0;
      else if (op === 'J2') { lines = [[]]; col = 0; }
      else for (const ch of op) { while (line.length < col) line.push(' '); line[col++] = ch; }
    }
    return lines.map((l) => l.join('')).join('\n');
  };
  const SEQ = { K0: `${E}[K`, K1: `${E}[1K`, K2: `${E}[2K`, J2: `${E}[2J` };
  let seed = 20261117; const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
  const WORDS = ['a', 'bc', 'def', 'progress 42%', '  ', 'x'.repeat(30), 'नम', '12345', '.'];
  let same = 0; const N = 3000; let firstBad = '';
  for (let k = 0; k < N; k++) {
    const ops = [];
    for (let i = 0, n = 1 + rnd(25); i < n; i++) {
      const r = rnd(100);
      ops.push(r < 45 ? WORDS[rnd(WORDS.length)] : r < 60 ? '\n' : r < 75 ? '\r' : r < 85 ? '\b' : r < 90 ? 'K0' : r < 94 ? 'K1' : r < 98 ? 'K2' : 'J2');
    }
    const stream = ops.map((o) => SEQ[o] || o).join(''), m = new TermText();
    for (let i = 0; i < stream.length;) { const n = 1 + rnd(9); m.write(stream.slice(i, i + n), rnd(2) ? 'o' : 'e'); i += n; if (!rnd(4)) m.take(); }
    if (m.text() === cells(ops)) same++; else firstBad ||= JSON.stringify(ops) + ' → ' + JSON.stringify(m.text()) + ' ≠ ' + JSON.stringify(cells(ops));
  }
  t.eq(same, N, `${N} seeded random streams (words, \\n, \\r, \\b, erases, clears; written in random pieces): the text equals a cell-by-cell terminal's ${firstBad}`);

  // ---- floods
  { const m = new TermText(), t0 = performance.now(); let want = 0;
    for (let i = 0; i < 300000; i++) { const s = String(i); m.write(s, 'o'); m.write('\n', 'o'); want += s.length + 1; if (i % 5000 === 0) m.take(); }
    const all = m.text(), ms = performance.now() - t0;
    t.ok(all.length === want && all.endsWith('299998\n299999\n') && all.startsWith('0\n1\n2\n') && ms < 3000, `300,000 lines in 600,000 writes: ${all.length} characters kept, ${Math.round(ms)} ms`);
    const u = m.take(); t.ok(u.done.length === 1, 'a flood of one style reaches the view as one run'); }
  { const m = new TermText(), big = 'x'.repeat(3_000_000); m.write(big, 'o'); m.write('\n', 'o'); t.ok(m.text().length === 3_000_001, 'a line of 3 million characters'); }
  { const m = new TermText(), t0 = performance.now(); for (let i = 0; i < 20000; i++) m.write(`\r${i} of 20000`, 'o'); m.write('\n', 'o');
    t.ok(m.text() === '19999 of 20000\n' && performance.now() - t0 < 2000, '20,000 rewrites of one progress line'); }
};
