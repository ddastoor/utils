// Camera Reader (potentials #81): src/lib/readertext.ts — a printed piece as it is spoken (amounts in rupees, medicine units
// and doses, dates, times, phone numbers and PIN codes, the abbreviations of leaflets and letters, a menu's dot leaders and signs
// a reader misread); sentences (not after Mr., Tab., e.g., an initial or a list's number); a page's paragraphs and pieces from
// made-up readings (a menu, an address, a list, a word broken over two lines, a heading by its size and by capitals); and the
// four papers of tests/fixtures/snaps (scripts/make-snap-photos.py: a leaflet, a medicine leaflet in small print with a list,
// a café's menu with dot leaders, a letter) and a two-column newsletter frame (tests/fixtures/images) read as the tab reads
// them, in Node: the pieces as printed, their kinds, what is spoken.
import { readFileSync } from 'node:fs';
import { snapReader } from '../lib/snapread.mjs';

const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
/** the share of `want`'s words found in `got` in order (longest common subsequence) */
const inOrder = (want, got) => { const d = Array.from({ length: want.length + 1 }, () => new Uint16Array(got.length + 1)); for (let i = 1; i <= want.length; i++) for (let j = 1; j <= got.length; j++) d[i][j] = want[i - 1] === got[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[want.length][got.length] / Math.max(1, want.length); };

export default async (t, ctx) => {
  const R = await ctx.load('/src/lib/readertext.ts');
  const { listText } = await ctx.load('/src/lib/listtext.ts');

  // ---- what is spoken
  const S = R.spokenText;
  t.eq([S('Masala Dosa .......... ₹ 90'), S('Total: Rs. 1,25,000/-'), S('Fees Rs.18,500.50'), S('Price: INR 45.50'), S('Filter Coffee ¥40'), S('Poha 60.00'), S('₹1')],
    ['Masala Dosa, 90 rupees', 'Total: 125000 rupees', 'Fees 18500 rupees 50 paise', 'Price: 45 rupees 50 paise', 'Filter Coffee 40 rupees', 'Poha 60', '1 rupee'],
    'amounts: ₹, Rs., INR (a ₹ read as ¥), Indian commas, paise, "/-", a menu\'s dot leaders; a whole amount\'s .00');
  t.eq([S('Paracetamol 500 mg'), S('5 ml of the syrup'), S('take 1 mg'), S('8 tablets (4 g)'), S('Store below 30 °C'), S('below 25*C'), S('2.5 mcg'), S('0.5 L'), S('5G network'), S('Plot 5 L'), S('12%')],
    ['Paracetamol 500 milligrams', '5 millilitres of the syrup', 'take 1 milligram', '8 tablets (4 grams)', 'Store below 30 degrees Celsius', 'below 25 degrees Celsius', '2.5 micrograms', '0.5 litres', '5G network', 'Plot 5 litres', '12 percent'],
    'units after a number (one and many; °C read as *C; "5G" left alone)');
  t.eq([S('Tab. Azithromycin 500 mg 1-0-1 x 5 days'), S('1-2 tablets every 4–6 hours'), S('Cap. Omeprazole 0-0-1'), S('Syp. Cetirizine ½-0-½'), S('strip of 1 x 10 tablets')],
    ['Tablet Azithromycin 500 milligrams 1, 0, 1 for 5 days', '1 to 2 tablets every 4 to 6 hours', 'Capsule Omeprazole 0, 0, 1', 'Syrup Cetirizine half, 0, half', 'strip of 1 by 10 tablets'],
    'prescriptions: Tab. / Cap. / Syp., doses 1-0-1 (morning, afternoon, night) and ½-0-½, "x 5 days" for 5 days, ranges, a strip of 1 x 10');
  t.eq([S('Dated 27/11/2026.'), S('on 5-6-2026'), S('by 01.12.26'), S('31/02/2026'), S('between 10:00 am and 2:00 p.m.'), S('at 10.30 AM'), S('at 9:45 pm.')],
    ['Dated 27 November 2026.', 'on 5 June 2026', 'by 1 December 2026', '31/02/2026', 'between 10 AM and 2 PM', 'at 10.30 AM', 'at 9:45 PM'],
    'dates day first (an impossible one left), times as AM and PM');
  t.eq([S('Nashik 422013'), S('Mob: +91 98450 12345'), S('Call 080-4112-3456'), S('Consumer number 170012345678'), S('Rs. 125000'), S('In 2026')],
    ['Nashik 4 2 2 0 1 3', 'Mobile: plus 9 1, 9 8 4 5 0, 1 2 3 4 5', 'Call 0 8 0, 4 1 1 2, 3 4 5 6', 'Consumer number 1 7 0 0 1 2 3 4 5 6 7 8', '125000 rupees', 'In 2026'],
    'phone numbers, PIN codes and long numbers digit by digit (an amount and a year not)');
  t.eq([S('Govt. of India, Dept. of Posts'), S('e.g. a fever'), S('i.e. twice'), S('No. 42 and Nos. 3'), S('Dr. Mehta'), S('approx. 5 min'), S('• Keep out of reach'), S('☑ Done'), S('Pvt. Ltd.')],
    ['Government of India, Department of Posts', 'for example a fever', 'that is twice', 'number 42 and numbers 3', 'Doctor Mehta', 'approximately 5 minutes', 'Keep out of reach', 'Done', 'Private Limited'],
    'abbreviations of letters and leaflets; list marks left out');
  t.eq([S('Filter Coffee 于40'), S('KAVERI | CAFE'), S('...')], ['Filter Coffee 40', 'KAVERI CAFE', ''], 'signs a reader misread left out');
  t.eq([R.speakable({ say: S('— —') }), R.speakable({ say: S('• ') }), R.speakable({ say: S('Go.') })], [false, false, true], 'a piece of signs only has nothing to say');

  // ---- sentences
  t.eq(R.sentencesOf('Dear Mr. Kulkarni, thank you. Your pension is due. Please call Dr. Mehta at 10 a.m. tomorrow.'),
    ['Dear Mr. Kulkarni, thank you.', 'Your pension is due.', 'Please call Dr. Mehta at 10 a.m. tomorrow.'], 'not after Mr., Dr. or a.m. before a small letter');
  t.eq(R.sentencesOf("Doctor's advice: Tab. Paracetamol 500 mg after food. Take it with water! Is that clear? Yes."),
    ["Doctor's advice: Tab. Paracetamol 500 mg after food.", 'Take it with water!', 'Is that clear?', 'Yes.'], 'not after Tab.; after ! and ?');
  t.eq(R.sentencesOf('A. P. J. Abdul Kalam wrote it. 1. Take one. E.g. Rest.'), ['A. P. J. Abdul Kalam wrote it.', '1. Take one.', 'E.g. Rest.'], 'initials, a list\'s number, e.g.');
  t.eq(R.sentencesOf('Take it daily. e.g. with food.'), ['Take it daily. e.g. with food.'], 'no new sentence before a small letter');
  t.eq(R.sentencesOf('He said "Go." Then he left.'), ['He said "Go."', 'Then he left.'], 'a closing quotation mark');

  // ---- pages from made-up readings: words with their boxes, lines with their paragraph and block
  const reading = (rows) => {
    const words = [], lines = [];
    rows.forEach(([text, x0, x1, y, h, para = 0, block = 0]) => {
      const ws = text.split(' '), w0 = words.length, step = (x1 - x0) / ws.length;
      // each word's box as tall as its letters reach (h: the type's size): small letters alone about half of it (see emOf)
      ws.forEach((w, k) => { const top = /[bdfhkl()]/.test(w) ? 0.76 : /[A-Z0-9₹•]/.test(w) ? 0.72 : /[tij]/.test(w) ? 0.66 : 0.52, bottom = /[gjpqy()]/.test(w) ? 0.24 : /[,;]/.test(w) ? 0.12 : 0;
        words.push({ text: w, conf: 95, x0: Math.round(x0 + k * step), x1: Math.round(x0 + (k + 1) * step - 8), y0: Math.round(y + (0.76 - top) * h), y1: Math.round(y + (0.76 + bottom) * h) }); });
      lines.push({ w0, w1: words.length, para, block });
    });
    let para = -1, text = '';
    lines.forEach((l) => { if (para >= 0 && l.para !== para) text += '\n'; para = l.para; text += words.slice(l.w0, l.w1).map((w) => w.text).join(' ') + '\n'; });
    return { text, words, lines, confidence: 95 };
  };
  const show = (ps) => ps.map((p) => `${p.kind}: ${p.pieces.map((x) => x.text + (x.br ? ' ⏎' : '')).join(' | ')}`);
  {
    const r = reading([['Take the tablets with plenty of water and swallow them', 100, 900, 100, 30], ['whole. Do not chew them or crush them before you take', 100, 905, 145, 30],
      ['them. Ask your pharmacist about anything you are not', 100, 890, 190, 30], ['sure about.', 100, 260, 235, 30]]);
    t.eq(show(R.pageParas(r)), ['text: Take the tablets with plenty of water and swallow them whole. | Do not chew them or crush them before you take them. | Ask your pharmacist about anything you are not sure about.'], 'prose: lines that reach the column\'s width run on, cut into sentences');
  }
  {
    const r = reading([['Breakfast', 100, 260, 100, 30], ['Masala Dosa . . . . . . . . ₹ 90', 100, 900, 145, 30], ['Idli Vada (2 pcs) . . . . . ₹ 70', 100, 900, 190, 30], ['Beverages', 100, 260, 240, 30], ['Filter Coffee . . . . . . . ₹ 40', 100, 900, 285, 30]]);
    const ps = R.pageParas(r);
    t.eq(show(ps), ['text: Breakfast ⏎ | Masala Dosa . . . . . . . . ₹ 90 ⏎ | Idli Vada (2 pcs) . . . . . ₹ 70 ⏎ | Beverages ⏎ | Filter Coffee . . . . . . . ₹ 40'], 'a menu: each item and its price a line of its own (a line ending with a number, a short line)');
    t.eq(ps[0].pieces.map((x) => x.say), ['Breakfast', 'Masala Dosa, 90 rupees', 'Idli Vada (2 pieces), 70 rupees', 'Beverages', 'Filter Coffee, 40 rupees'], '… spoken with the prices in rupees');
  }
  {
    const r = reading([['14 Gangapur Road', 100, 400, 100, 30, 0], ['Nashik 422013', 100, 330, 145, 30, 0], ['Dear Sir,', 100, 260, 230, 30, 1],
      ['The meeting of the residents will be held in the commu-', 100, 900, 290, 30, 2], ['nity hall on Sunday at 10 am.', 100, 560, 335, 30, 2]]);
    t.eq(show(R.pageParas(r)), ['text: 14 Gangapur Road ⏎ | Nashik 422013', 'text: Dear Sir,', 'text: The meeting of the residents will be held in the community hall on Sunday at 10 am.'], 'an address a line at a time; a word broken over two lines made whole');
  }
  {
    const r = reading([['WARNINGS', 100, 300, 100, 30], ['• Do not take with other medicines that contain', 100, 900, 145, 30], ['paracetamol.', 140, 330, 190, 30],
      ['• Keep out of the reach of children.', 100, 700, 235, 30], ['Store in a cool, dry place.', 100, 560, 290, 30]]);
    const listed = 'WARNINGS\n• Do not take with other medicines that contain\n  paracetamol.\n• Keep out of the reach of children.\nStore in a cool, dry place.';
    t.eq(show(R.pageParas(r, listed)), ['heading: WARNINGS', 'item: • Do not take with other medicines that contain paracetamol.', 'item: • Keep out of the reach of children.', 'text: Store in a cool, dry place.'],
      'a heading in capitals; list items (an item\'s next line joined to it); a line after the list');
  }
  {
    const r = reading([['How to take this medicine', 100, 560, 100, 44], ['Take one tablet twice a day, after breakfast and', 100, 900, 175, 30], ['after dinner, with a full glass of water.', 100, 760, 220, 30]]);
    r.lines[0].para = 0; r.lines[1].para = 1; r.lines[2].para = 1;
    const ps = R.pageParas(reading([['How to take this medicine', 100, 560, 100, 44, 0], ['Take one tablet twice a day, after breakfast and', 100, 900, 175, 30, 1], ['after dinner, with a full glass of water.', 100, 760, 220, 30, 1]]));
    t.eq(ps.map((p) => p.kind), ['heading', 'text'], 'a heading by the size of its letters');
    t.eq(ps.map((p) => p.pieces.map((x) => x.pause)), [[R.PAUSE.heading], [R.PAUSE.para]], 'the pauses after a heading and a paragraph');
  }
  t.eq(R.pageParas({ text: '', words: [], lines: [] }), [], 'nothing read: nothing to say');
  t.eq(R.pageParas({ text: 'One line.\n\nAnother paragraph here.', words: [], lines: undefined }).map((p) => p.pieces.map((x) => x.text)), [['One line.'], ['Another paragraph here.']], 'a reading without lines: its text as it stands');

  // ---- the papers, read as the tab reads them
  const dir = new URL('../fixtures/snaps/', import.meta.url).pathname, T = JSON.parse(readFileSync(dir + 'truth.json', 'utf8'));
  const SR = await snapReader(ctx);
  const read = async (path) => { const res = await SR.read(SR.decode(path), { invertDark: true, retryTurns: true }); return { res, paras: R.pageParas(res.r, listText(res.r, res.listMarks, res.xh)) }; };
  const pieces = (ps) => ps.flatMap((p) => p.pieces);
  try {
    {
      const { paras } = await read(dir + 'leaflet.jpg');
      t.ok(inOrder(tokens(T.leaflet.text), tokens(pieces(paras).map((x) => x.text).join(' '))) >= 0.98 && paras[0].kind === 'heading' && paras[0].pieces[0].text === 'How to take this medicine',
        `the leaflet: every word in order, its title a heading (${show(paras).join(' / ')})`);
    }
    {
      const { paras } = await read(dir + 'leaflet-b.jpg');
      const ps = pieces(paras), says = ps.map((x) => x.say).join(' ');
      t.eq(ps.map((x) => tokens(x.text).join(' ')), T['leaflet-b'].say.map((x) => tokens(x).join(' ')), 'the medicine leaflet in small print: every piece as printed, in order (the heading, the bold labels, sentences, the list\'s items)');
      t.eq([paras[0].kind, paras.filter((p) => p.kind === 'item').length], ['heading', T['leaflet-b'].items], '… its heading and its three list items');
      t.ok(['500 milligrams', '4 grams', '5 millilitres', '30 degrees Celsius', 'Tablet Paracetamol', '1, 0, 1', '4 to 6 hours'].every((w) => says.includes(w)), `… spoken with the units, the dose and the range in words: ${says}`);
    }
    {
      const { res, paras } = await read(dir + 'menu.jpg');
      const ps = pieces(paras);
      t.ok(ps.length === T.menu.say.length && ps.every((x, k) => inOrder(tokens(T.menu.say[k]).filter((w) => w !== 'pcs'), tokens(x.text)) >= 0.6), `the menu (read by ${res.engine}): each line a piece — the café's name, its address, the headings, each item with its price (${ps.map((x) => x.text).join(' | ')})`);
      t.ok(paras[0].kind === 'heading' && /^KAVERI CAFE$/.test(paras[0].pieces[0].text) && ps.filter((x) => /rupees|\b\d\d$/.test(x.say)).length === 6, `… the name a heading, the six prices spoken (${ps.map((x) => x.say).join(' | ')})`);
    }
    {
      const { paras } = await read(dir + 'letter.jpg');
      const ps = pieces(paras), says = ps.map((x) => x.say);
      t.eq(ps.map((x) => x.text), T.letter.say, 'the letter: its address a line at a time, the date, the greeting, three sentences, the closing');
      t.ok(says.includes('4 2 2 0 1 3'.replace(/^/, 'Nashik ')) && says.includes('27 November 2026') && says.some((x) => x.includes('20 November 2026')) && says.some((x) => x.includes('10 AM and 2 PM')),
        `… the PIN code digit by digit, the dates and the times in words: ${says.join(' | ')}`);
      t.ok(paras.every((p) => p.kind !== 'heading'), 'a letter in one size has no heading');
    }
    {
      // a two-column newsletter, a video frame (soft): its columns read in order
      const img = new URL('../fixtures/images/', import.meta.url).pathname;
      const { res, paras } = await read(img + 'doc-newsletter-frame.jpg');
      const want = tokens(readFileSync(img + 'doc-newsletter-frame.txt', 'utf8')), got = tokens(pieces(paras).map((x) => x.text).join(' '));
      t.ok(inOrder(want, got) >= 0.85, `a two-column newsletter (a soft video frame, read by ${res.engine}): ${Math.round(inOrder(want, got) * 100)} % of its words in order`);
    }
    {
      const res = await SR.read(SR.decode(new URL('../fixtures/images/coffee.jpg', import.meta.url).pathname), { invertDark: true, retryTurns: true });
      const ps = res.r.text.trim() ? pieces(R.pageParas(res.r, listText(res.r, res.listMarks, res.xh))).filter(R.speakable) : [];
      t.ok(ps.length <= 1, `a photo of a cup of coffee: nothing (or a speck) to read (${ps.map((x) => x.text).join(' | ')})`);
    }
  } finally { await SR.close(); }
};
