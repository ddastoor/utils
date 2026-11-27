// The Newspaper Clipper's steps (src/lib/clipper.ts): the blocks of a reading and which are headlines, a story found from
// its headline, the reading order, the text, where everything goes in the clipping and where its PDF pages end, the
// pictures, the second reading in black and white. Synthetic readings with known answers; and the readings Tesseract made
// of photographed newspaper pages (tests/fixtures/news/, recorded by scripts/measure-clipper.mjs --record) held to the
// stories the page was printed with (make-newspaper-photos.py's index.json — the generator's own words, nothing read).
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

export default async (t, { load, wasm }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const C = await load('/src/lib/clipper.ts');
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  const tc = bindTextcore(await wasm('textcore'));
  const xycut = (b, gx, gy) => tc.xycut(b, gx, gy).order;

  /** a reading made by hand: blocks of lines, each word `cw` px a letter and `hgt` px tall */
  const reading = () => {
    const words = [], lines = []; let para = 0;
    return {
      words, lines,
      block(id, x, y, rows, { cw = 10, hgt = 24, pitch = 32, tall = [] } = {}) {
        rows.forEach((row, k) => {
          const w0 = words.length; let cx = x;
          for (const tx of row.split(' ')) {
            const w = tx.length * cw, hh = tall.includes(k) ? 2 * hgt : hgt;
            words.push({ text: tx, conf: 95, x0: cx, y0: y + k * pitch, x1: cx + w, y1: y + k * pitch + hh }); cx += w + cw;
          }
          lines.push({ w0, w1: words.length, para, block: id });
        });
        para++;
        return this;
      },
    };
  };
  const BODY = ['the council will close the', 'northern lane of the bridge', 'from monday while bearings', 'beneath the central span are', 'replaced and the work will', 'last nine weeks in all'];
  const find = (blocks, text) => blocks.findIndex((b) => b.text.startsWith(text));

  // ---------------------------------------------------------------- the blocks and their headlines
  {
    t.eq(C.joinLines([['an', 'experi-'], ['ment', 'went'], ['well.']]), 'an experiment went well.', 'a word broken at a line end is joined');
    t.eq(C.joinLines([['the', 'e-'], ['reader']]), 'the e- reader', 'a one-letter prefix keeps its hyphen');
    t.eq(C.joinLines([['North-'], ['East', 'wind']]), 'North- East wind', 'a hyphen before a capital is kept');
    t.eq(C.joinLines([['a', 'well-'], ['known']]), 'a wellknown', 'a hyphen before lower case is taken as a break (as PDF → EPUB)');

    // a headline in two blocks of one line each (Tesseract's layout), and its story's three columns
    const r = reading()
      .block(0, 100, 100, ['Harbour Bridge Repairs'], { cw: 24, hgt: 50, pitch: 60 })
      .block(1, 100, 160, ['Begin Monday'], { cw: 24, hgt: 50, pitch: 60 })
      .block(2, 100, 250, BODY).block(3, 400, 250, BODY).block(4, 700, 250, BODY);
    const b = C.blocksOf(r);
    t.eq(b.filter((x) => x.headline).length, 1, 'the two lines of a headline are one headline');
    t.eq(b[0].text, 'Harbour Bridge Repairs Begin Monday', 'the headline reads its lines in order');
    t.eq(b[0].rows.length, 2, 'it keeps its lines (for the clipping)');
    t.eq(b.filter((x) => !x.headline).length, 3, 'three columns of text');

    // a headline glued to the top of its column (one block): its leading big lines are a headline of their own
    const g = C.blocksOf(reading()
      .block(0, 100, 100, ['Library Extends Hours'], { cw: 20, hgt: 44, pitch: 52 })
      .block(0, 100, 160, BODY).block(1, 420, 160, BODY).block(2, 740, 160, BODY));
    t.eq(g.filter((x) => x.headline).map((x) => x.text), ['Library Extends Hours'], 'a headline glued to its column comes apart');
    t.ok(g.some((x) => !x.headline && x.text.startsWith('the council')), '… and the column stays a column');

    // Tesseract's box of a word reaching into the next line (words twice as tall as their letters) is no headline: its
    // letters are as wide as the text's
    const tall = C.blocksOf(reading().block(0, 100, 100, BODY, { tall: [0, 1] }).block(1, 420, 100, BODY).block(2, 740, 100, BODY));
    t.eq(tall.filter((x) => x.headline).length, 0, 'tall boxes of ordinary letters make no headline');
    t.eq(tall.length, 3, '… and the column stays one block');

    // a line read across three columns just under a wide headline: its words go to the columns they stand over
    const across = reading().block(0, 100, 100, ['Market Traders Welcome Canopy'], { cw: 26, hgt: 52, pitch: 60 });
    // one block holding the three columns' first lines (as Tesseract made of one)
    {
      const w0 = across.words.length; let cx = 100;
      for (const [x, tx] of [[100, 'stallholders say a'], [400, 'canopy, paid for'], [700, 'customers now linger']]) for (const p of tx.split(' ')) { cx = Math.max(cx, x); across.words.push({ text: p, conf: 95, x0: cx, y0: 180, x1: cx + p.length * 10, y1: 204 }); cx += p.length * 10 + 10; }
      across.lines.push({ w0, w1: across.words.length, para: 99, block: 1 });
    }
    across.block(2, 100, 212, BODY).block(3, 400, 212, BODY).block(4, 700, 212, BODY);
    const ac = C.blocksOf(across);
    t.eq(ac.filter((x) => !x.headline).length, 3, 'the line across the columns is shared out among them');
    t.ok(ac.some((x) => x.text.startsWith('stallholders say a\nthe council') || x.text.startsWith('stallholders say a the council')), 'the first column starts with its share');
    t.ok(ac.some((x) => /^customers now linger/.test(x.text)), 'the third column starts with its share');
    t.ok(C.blocksOf({ words: [{ text: '•••', conf: 50, x0: 1, y0: 1, x1: 9, y1: 9 }], lines: [{ w0: 0, w1: 1, para: 0, block: 0 }] }).length === 0, 'a block without a letter or digit is left out');
    t.eq(C.blockLabel(b[0]), 'Headline: Harbour Bridge Repairs Begin Monday', 'a block is named by its kind and first words');
    t.eq(C.blockLabel({ picture: true, text: '' }), 'Picture', 'a picture is named as one');
  }

  // ---------------------------------------------------------------- a story from its headline; the reading order
  {
    // a page laid out as newspapers are: the masthead; a lead story across three columns; two stories in the fourth;
    // a story under the lead with a picture and its caption over two columns
    const r = reading()
      .block(0, 300, 20, ['THE COASTAL HERALD'], { cw: 40, hgt: 80, pitch: 90 })
      .block(1, 40, 140, ['Harbour Bridge Repairs Begin Monday'], { cw: 26, hgt: 54, pitch: 60 })
      .block(2, 40, 220, BODY).block(3, 380, 220, BODY).block(4, 720, 220, BODY)
      .block(5, 1060, 140, ['Choir Wins Prize'], { cw: 16, hgt: 36, pitch: 44 })
      .block(6, 1060, 200, BODY.slice(0, 4))
      .block(7, 1060, 360, ['Orchard Harvest'], { cw: 16, hgt: 36, pitch: 44 })
      .block(8, 1060, 420, BODY)
      .block(9, 40, 460, ['Rain Delays the Regatta'], { cw: 22, hgt: 46, pitch: 54 })
      .block(10, 40, 840, ['Dinghies on the estuary before the squall.'], { cw: 9, hgt: 20 })
      .block(11, 40, 880, BODY).block(12, 380, 880, BODY);
    const blocks = C.withPictures(C.blocksOf(r), [[40, 530, 680, 830]]);
    const id = (text) => find(blocks, text), names = (ids) => ids.map((i) => blocks[i].text.split(/\s+/).slice(0, 3).join(' '));
    t.ok(blocks[id('THE COASTAL')].headline, 'the masthead is set large, like a headline');
    const lead = C.storyOf(blocks, id('Harbour Bridge'));
    t.eq(lead.length, 4, `the lead story: its headline and three columns (${names(lead)})`);
    t.ok(!lead.includes(id('Choir Wins')) && !lead.includes(id('Rain Delays')), '… and no other story');
    const choir = C.storyOf(blocks, id('Choir Wins'));
    t.eq(names(choir), ['Choir Wins Prize', 'the council will'], 'a one-column story ends where the next headline stands');
    const orchard = C.storyOf(blocks, id('Orchard Harvest'));
    t.eq(orchard.length, 2, 'the next story in the column is its own');
    const rain = C.storyOf(blocks, id('Rain Delays'));
    const pic = blocks.findIndex((x) => x.picture);
    t.ok(rain.includes(pic), 'a picture under the headline belongs to its story');
    t.ok(rain.includes(id('Dinghies on')), '… and its caption');
    t.eq(rain.length, 5, `the story with a picture: headline, picture, caption, two columns (${names(rain)})`);
    t.eq(C.storyOf(blocks, 999), [], 'no such block: nothing');

    // the reading order: the headline across the columns first, then the columns left to right
    const order = C.readingOrder(blocks, [...lead].reverse(), xycut);
    t.eq(order[0], id('Harbour Bridge'), 'the headline comes first');
    t.eq(order.slice(1).map((i) => blocks[i].box[0]), [40, 380, 720], 'then the columns, left to right');
    const rainOrder = C.readingOrder(blocks, rain, xycut);
    t.eq(rainOrder.slice(0, 3), [id('Rain Delays'), pic, id('Dinghies on')], 'a headline, its picture and caption, then the columns');

    // the text: blocks a blank line apart, a word broken at a column's end joined with the next column
    const text = C.clipText([{ text: 'A Headline', headline: true }, { text: 'the first column ends with an experi-', headline: false }, { text: 'ment that went well.', headline: false }, { text: '', picture: true }]);
    t.eq(text, 'A Headline\n\nthe first column ends with an experiment that went well.', 'the clipping\'s text');
  }

  // ---------------------------------------------------------------- the clipping laid out; its PDF pages
  {
    const words = (y, xs) => xs.map(([x, tx]) => ({ text: tx, conf: 95, x0: x, y0: y, x1: x + tx.length * 24, y1: y + 50 }));
    const head = { id: 0, headline: true, box: [40, 100, 1000, 220], rows: [words(100, [[40, 'Harbour'], [260, 'Bridge'], [430, 'Repairs'], [640, 'Begin']]), words(170, [[40, 'Monday'], [220, 'Again']])], words: [], text: 'Harbour Bridge Repairs Begin Monday Again', size: 50 };
    const rowsOf = (x) => Array.from({ length: 6 }, (_, k) => [{ text: 'line', conf: 95, x0: x, y0: 260 + 32 * k, x1: x + 300, y1: 284 + 32 * k }]);
    const col = (id, x) => ({ id, headline: false, box: [x, 260, x + 300, 444], rows: rowsOf(x), words: rowsOf(x).flat(), text: 'column', size: 24 });
    const pic = { id: 9, headline: false, picture: true, box: [40, 500, 1000, 980], rows: [], words: [], text: '', size: 0 };
    const page = { width: 1200, height: 1100 };
    const parts = [head, col(1, 40), col(2, 380), pic].map((block) => ({ shot: 0, block, k: 1, page }));
    const plan = C.clipPlan(parts, { pad: 10, gap: 30, label: 40 });
    t.eq(plan.width, 320, 'the clipping is as wide as a column and its margins');
    t.ok(plan.pieces.every((p) => p.x >= 0 && p.x + p.w <= plan.width), 'every piece lies inside the clipping');
    const headPieces = plan.pieces.filter((p) => p.y < plan.labels[1].y);
    t.eq(headPieces.length, 6, 'the wide headline is set again word by word');
    t.ok(headPieces.every((p) => Math.abs(p.h - 50 - 2 * Math.round(0.12 * 50)) <= 1), '… each word as tall as it was printed (it keeps its size)');
    const lines = [...new Set(headPieces.map((p) => p.y))];
    t.ok(lines.length >= 3, `… on more lines than it had (${lines.length})`);
    for (let k = 1; k < headPieces.length; k++) {
      const a = headPieces[k - 1], b = headPieces[k];
      t.ok(b.y > a.y || (b.y === a.y && b.x > a.x), `word ${k + 1} of the headline comes after word ${k}`);
    }
    const colPieces = plan.pieces.filter((p) => p.crop[1] === 250);
    t.eq(colPieces.map((p) => [p.w, p.h]), [[320, 204], [320, 204]], 'a column is drawn at its own size');
    const picPiece = plan.pieces[plan.pieces.length - 1];
    t.eq([picPiece.w, picPiece.h], [320, Math.round(500 * 320 / 980)], 'a wide picture is made smaller to the width, its shape kept');
    t.eq(plan.labels.map((l) => l.text), ['Part 1', 'Part 2', 'Part 3', 'Part 4'], 'each part has its label');
    t.ok(plan.labels.every((l, k) => k === 0 || l.y > plan.labels[k - 1].y), 'the labels in order, top to bottom');
    t.eq(plan.height, picPiece.y + picPiece.h, 'the clipping ends with its last part');
    const colTop = colPieces[0].y;
    t.ok(plan.cuts.some((c) => c > colTop && c < colTop + 204), 'a page may end between two lines of a column');
    t.ok(plan.cuts.every((c, k) => k === 0 || c >= plan.cuts[k - 1]), 'the places to cut in order');
    const framed = C.clipPlan(parts, { pad: 10, gap: 30, label: 40, margin: 25 });
    t.eq([framed.width, framed.height], [plan.width + 50, plan.height + 50], 'a margin round the clipping: wider and taller by two margins');
    t.ok(framed.pieces.every((p, k) => p.x === plan.pieces[k].x + 25 && p.y === plan.pieces[k].y + 25) && framed.labels.every((l, k) => l.x === 25 && l.y === plan.labels[k].y + 25), '… every piece and label moved in by it');
    const plain = C.clipPlan(parts, { pad: 10, gap: 30, label: 0, labels: ['x'] });
    t.eq(plain.labels.length, 0, 'no labels when they are switched off');
    t.ok(plain.height < plan.height, '… and the clipping is shorter by them');
    // two photos: the second photo's text drawn as large as the first's
    t.eq(C.textScale([24, 48, 0]), [1, 0.5, 1], 'the scale of each photo\'s page (text as large as the first photo\'s)');
    t.eq(C.textScale([0, 30, 15]), [1, 1, 2], 'a photo without text is drawn as it is; the first with text sets the size');
    const two = C.clipPlan([{ shot: 0, block: col(1, 40), k: 1, page }, { shot: 1, block: col(2, 380), k: 0.5, page }], { pad: 10, gap: 30, label: 0 });
    t.eq(two.pieces.map((p) => p.w), [320, 160], 'a part of a photo taken closer is drawn smaller');

    const pages = C.pageCuts(1000, [100, 450, 700, 950], 500);
    t.eq(pages, [[0, 450], [450, 950], [950, 1000]], 'pages end at the last place to cut in their second half');
    t.eq(C.pageCuts(1000, [], 500), [[0, 500], [500, 1000]], 'without a place to cut, a page is cut at its height');
    t.eq(C.pageCuts(1000, [100, 200], 500), [[0, 500], [500, 1000]], 'a place in a page\'s first half is not taken (no half-empty pages)');
    t.eq(C.pageCuts(300, [100], 500), [[0, 300]], 'a short clipping is one page');
    const many = C.pageCuts(plan.height, plan.cuts, 300);
    t.ok(many[0][0] === 0 && many[many.length - 1][1] === plan.height && many.every(([a, b], k) => b > a && b - a <= 300 && (k === 0 || a === many[k - 1][1])), 'the pages cover the clipping, none taller than a page');

    t.eq(C.clipName('Rain Delays Final Day of the Regatta'), 'rain-delays-final-day-of-the', 'a file name from the headline');
    t.eq(C.clipName('Café — “Über” 2026!'), 'cafe-uber-2026', 'accents and signs left out');
    t.eq(C.clipName(''), 'clipping', 'no headline: "clipping"');
  }

  // ---------------------------------------------------------------- pictures; lines left unread
  {
    t.eq(C.picturesOf([{ x: 10, y: 10, w: 400, h: 300 }, { x: 0, y: 500, w: 1000, h: 4 }, { x: 600, y: 600, w: 30, h: 30 }], 20), [[10, 10, 410, 310]], 'a picture is an area three lines high and wide; a rule and a speck are not');
    t.eq(C.picturesOf([{ x: 10, y: 10, w: 400, h: 300 }, { x: 300, y: 200, w: 300, h: 300 }], 20), [[10, 10, 600, 500]], 'overlapping areas are one picture');
    const blocks = C.withPictures([{ id: 0, box: [0, 400, 100, 500], headline: false }, { id: 1, box: [0, 0, 100, 50], headline: true }], [[0, 100, 100, 300]]);
    t.eq(blocks.map((b) => [b.id, !!b.picture]), [[0, false], [1, true], [2, false]], 'pictures take their place among the blocks, top to bottom');

    // a page of lines of print, some of them read: the lines no word covers are counted
    const W = 1000, H = 700, img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) };
    const bar = (x, y, w, hh) => { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) img.data.fill(20, (yy * W + xx) * 4, (yy * W + xx) * 4 + 3); };
    const ys = [40, 100, 160, 220, 280, 340, 400, 460];
    // words 55 px long and 5 px apart (a word space is a quarter of the text's height)
    for (const y of ys) { for (let x = 50; x < 450; x += 60) bar(x, y, 55, 20); }
    const wordsAt = (yy) => yy.flatMap((y) => Array.from({ length: 7 }, (_, k) => ({ text: 'word', conf: 95, x0: 50 + 60 * k, y0: y, x1: 105 + 60 * k, y1: y + 20 })));
    t.eq(await C.unreadLines(img, { words: wordsAt(ys) }, ip), 0, 'every line read: none left');
    t.eq(await C.unreadLines(img, { words: wordsAt(ys.slice(0, 3)) }, ip), 5, 'five lines no word covers');

    // readClip: a page that leaves lines unread is read again, sharper, and the better reading kept
    const grey = { confidence: 90, words: wordsAt(ys.slice(0, 3)), lines: [{ w0: 0, w1: 21, para: 0, block: 0 }], text: '' };
    const full = { confidence: 85, words: wordsAt(ys), lines: [{ w0: 0, w1: 56, para: 0, block: 0 }], text: '' };
    let pages = [], amounts = [];
    const sops = { ...ip, sharpen: (im, a, sg) => { amounts.push(a); return ip.sharpen(im, a, sg); } };
    const eng = { ops: sops, read: async (im, _l, _p, layout) => { if (layout !== 'page') return grey; pages.push(im); return pages.length === 1 ? grey : full; } };
    let again = 0;
    const c = await C.readClip(img, eng, { onAgain: () => again++ });
    t.eq(again, 1, 'lines left unread: the page is read again');
    t.eq(pages.length, 2, '… twice in all');
    t.eq(amounts, [C.SHARPEN.amount, C.SHARPER.amount], '… sharpened, the second time sharper');
    t.eq(c.r.words.length, 56, '… and the reading with more words read surely is kept');
    t.ok(!c.found, 'a picture with no page edge is read as it is');
    pages = [];
    const once = await C.readClip(img, { ops: ip, read: async (im, _l, _p, layout) => { if (layout === 'page') pages.push(im); return layout === 'page' ? full : grey; } }, { onAgain: () => again++ });
    t.eq(pages.length, 1, 'every line read: the page is read once');
    t.eq(again, 1, '… and not again');
    t.eq(once.blocks.length, 1, '… its one block');
    t.eq(await C.readClip(img, eng, { stale: () => true }), null, 'a newer photo or the tab left: the reading stops');
    // words Tesseract took for vertical text: read again, sharper
    pages = [];
    const vert = { ...full, vertical: 12 };
    await C.readClip(img, { ops: ip, read: async (im, _l, _p, layout) => { if (layout !== 'page') return grey; pages.push(im); return pages.length === 1 ? vert : full; } }, { onAgain: () => again++ });
    t.eq(pages.length, 2, 'words taken for vertical text: the page is read again');
  }

  // ---------------------------------------------------------------- the readings of photographed newspaper pages
  {
    const dir = root + 'tests/fixtures/news/';
    if (!existsSync(dir + 'index.json')) { t.ok(false, 'tests/fixtures/news/index.json is missing'); return; }
    const { wordsOf, lcs, headlineFor, storyWords } = await import(root + 'scripts/measure-clipper.mjs');
    const idx = JSON.parse(readFileSync(dir + 'index.json', 'utf8'));
    for (const ent of idx) {
      const rec = JSON.parse(readFileSync(dir + ent.name + '.reading.json', 'utf8'));
      const blocks = C.withPictures(C.blocksOf(rec), rec.pictures);
      let whole = 0;
      for (const s of ent.stories) {
        const hb = headlineFor(blocks, s.headline);
        t.ok(hb >= 0, `${ent.name}: the headline “${s.headline}” is found`);
        if (hb < 0) continue;
        const text = C.clipText(C.readingOrder(blocks, C.storyOf(blocks, hb), xycut).map((i) => blocks[i]));
        const truth = storyWords(s), got = wordsOf(text), k = lcs(truth, got), mine = new Set(truth), extra = got.filter((x) => !mine.has(x)).length;
        t.ok(k >= 0.9 * truth.length, `${ent.name}, “${s.headline}”: ${k} of its ${truth.length} words in order`);
        t.ok(extra <= 0.05 * got.length, `${ent.name}, “${s.headline}”: ${extra} words of other stories`);
        if (k >= 0.95 * truth.length && extra <= 0.03 * got.length) whole++;
      }
      t.ok(whole >= ent.stories.length - 1, `${ent.name}: ${whole} of ${ent.stories.length} stories clipped whole`);
      t.ok(rec.pictures.length >= ent.stories.filter((s) => s.picture).length, `${ent.name}: its picture found`);
    }
  }
};
