//! Text Diff: the differences of two texts by lines (with the changed part of a changed line marked), by words or
//! by characters. The comparing is the `similar` crate's (Myers' algorithm in linear space, with a time limit after
//! which it settles for a diff that is correct but not the shortest); this file turns its answer into what the page
//! draws and into a unified diff (`diff -u`) that `patch` can apply.
use similar::{Algorithm, ChangeTag, DiffOp, InlineChangeOptions, TextDiff};
use std::time::{Duration, Instant};

fn kind(t: ChangeTag) -> u8 { match t { ChangeTag::Equal => 0, ChangeTag::Delete => 1, ChangeTag::Insert => 2 } }
fn strip_break(s: &str) -> &str { s.strip_suffix("\r\n").or_else(|| s.strip_suffix('\n')).or_else(|| s.strip_suffix('\r')).unwrap_or(s) }
fn ends_with_break(s: &str) -> bool { s.ends_with('\n') || s.ends_with('\r') }
/// The text with a line break at its end (an empty text stays empty).
fn closed(t: &str) -> std::borrow::Cow<'_, str> { if t.is_empty() || ends_with_break(t) { std::borrow::Cow::Borrowed(t) } else { std::borrow::Cow::Owned(format!("{t}\n")) } }

/// mode 0: lines → {"mode":0,"added","removed","same","approx","rows":[[kind,lineA,lineB,[[marked,text],…]],…],
///                  "unified":"…","endA":bool,"endB":bool}        (kind 0 same, 1 only in A, 2 only in B)
/// mode 3: lines side by side → the same, with "rows":[[0,lineA,lineB,parts] | [1,lineA,0,parts] | [2,0,lineB,parts]
///                  | [3,lineA,lineB,partsA,partsB],…]  (kind 3: a removed and an added line in one row — see `side`)
/// mode 1: words, mode 2: characters → {"mode","added","removed","same","approx","spans":[[kind,text],…]}
pub fn diff(a: &str, b: &str, mode: u32, limit_ms: u32) -> String {
    let start = Instant::now();
    let limit = Duration::from_millis(limit_ms.max(1) as u64);
    let mut cfg = TextDiff::configure();
    cfg.algorithm(Algorithm::Myers).deadline(start + limit);
    let (mut added, mut removed, mut same) = (0u64, 0u64, 0u64);
    let mut searched: Option<Duration> = None;
    let mut out = String::with_capacity(a.len() + b.len() + 256);
    if mode == 0 || mode == 3 {
        // A last line is the same line whether or not a line break follows it: both texts are compared as if they
        // ended with one. (The unified diff below is made from the texts as they are — `patch` needs to know.)
        let (na, nb) = (closed(a), closed(b));
        let d = cfg.diff_lines(na.as_ref(), nb.as_ref());
        // the comparing ran into its time limit (what follows — the marks, the pairing — does not make the diff longer)
        searched = Some(start.elapsed());
        // the marking inside changed lines gets what is left of the time, and at least a little
        let inline_until = Instant::now() + limit.saturating_sub(start.elapsed()).max(Duration::from_millis(200));
        let mut opts = InlineChangeOptions::default();
        opts.semantic_cleanup(true);
        out.push_str("\"rows\":[");
        if mode == 3 { side(&d, &opts, inline_until, &mut out, (&mut same, &mut removed, &mut added)); } else {
        let mut first = true;
        for op in d.ops() {
            for ch in d.iter_inline_changes_with_options_deadline(op, opts.clone(), Some(inline_until)) {
                match ch.tag() { ChangeTag::Equal => same += 1, ChangeTag::Delete => removed += 1, ChangeTag::Insert => added += 1 }
                if !first { out.push(','); }
                first = false;
                out.push_str(&format!("[{},{},{},", kind(ch.tag()), ch.old_index().map_or(0, |i| i + 1), ch.new_index().map_or(0, |i| i + 1)));
                let parts: Vec<(bool, std::borrow::Cow<str>)> = ch.iter_strings_lossy().collect();
                write_parts(&mut out, &parts);
                out.push(']');
            }
        }
        }
        out.push_str("],\"unified\":");
        let unified = if a == b { String::new() } else if na.as_ref() == a && nb.as_ref() == b { d.unified_diff().context_radius(3).header("original", "changed").to_string() }
            else { cfg.diff_lines(a, b).unified_diff().context_radius(3).header("original", "changed").to_string() };
        crate::json_str(&mut out, &unified);
        out.push_str(&format!(",\"endA\":{},\"endB\":{},", ends_with_break(a), ends_with_break(b)));
    } else {
        let d = if mode == 1 { cfg.diff_unicode_words(a, b) } else { cfg.diff_graphemes(a, b) };
        out.push_str("\"spans\":[");
        let (mut cur, mut text, mut first) = (255u8, String::new(), true);
        let flush = |cur: u8, text: &mut String, out: &mut String, first: &mut bool| {
            if cur == 255 || text.is_empty() { return; }
            if !*first { out.push(','); }
            *first = false;
            out.push_str(&format!("[{},", cur));
            crate::json_str(out, text);
            out.push(']');
            text.clear();
        };
        for ch in d.iter_all_changes() {
            let v: &str = ch.value();
            // what is counted: in words, the pieces that hold a letter or a digit (not the spaces and signs between)
            if mode == 2 || v.chars().any(char::is_alphanumeric) { match ch.tag() { ChangeTag::Equal => same += 1, ChangeTag::Delete => removed += 1, ChangeTag::Insert => added += 1 } }
            let k = kind(ch.tag());
            if k != cur { flush(cur, &mut text, &mut out, &mut first); cur = k; }
            text.push_str(v);
        }
        flush(cur, &mut text, &mut out, &mut first);
        out.push_str("],");
    }
    let approx = searched.unwrap_or_else(|| start.elapsed()) >= limit;
    format!("{{\"mode\":{},\"added\":{},\"removed\":{},\"same\":{},\"approx\":{},{}\"ms\":{}}}", mode, added, removed, same, approx, out, start.elapsed().as_millis())
}

/// One line's pieces as [[marked, text], …] — the line break of the last piece left out, and an empty piece with it
/// (a line keeps one piece, "" for an empty line).
fn write_parts(out: &mut String, parts: &[(bool, std::borrow::Cow<str>)]) {
    out.push('[');
    let n = parts.len();
    let mut wrote = false;
    for (i, (marked, text)) in parts.iter().enumerate() {
        let t = if i + 1 == n { strip_break(text) } else { text.as_ref() };
        if t.is_empty() && n > 1 { continue; }
        if wrote { out.push(','); }
        wrote = true;
        out.push_str(if *marked { "[1," } else { "[0," });
        crate::json_str(out, t);
        out.push(']');
    }
    out.push(']');
}
fn plain(out: &mut String, t: &str) { out.push_str("[[0,"); crate::json_str(out, t); out.push_str("]]"); }

/// Side by side (mode 3): the rows of the line view in two columns. An unchanged line stands on both sides. A run of
/// changes — the lines between two unchanged ones — shows its removed lines on the left and its added lines on the
/// right (`pair_lines`); a row with a line on each side gets the marks of what differs between those two lines, by the
/// same inline refinement as the line view (which marks what differs within the whole run).
fn side(d: &TextDiff<'_, '_, str>, opts: &InlineChangeOptions, until: Instant, out: &mut String, counts: (&mut u64, &mut u64, &mut u64)) {
    let (same, removed, added) = counts;
    let ops = d.ops();
    let weigh_until = until.min(Instant::now() + std::time::Duration::from_millis(WEIGH_MS));
    fn line(s: Option<&str>) -> &str { strip_break(s.unwrap_or("")) }
    let mut first = true;
    let mut k = 0;
    while k < ops.len() {
        if let DiffOp::Equal { old_index, new_index, len } = ops[k] {
            for t in 0..len {
                *same += 1;
                if !first { out.push(','); }
                first = false;
                out.push_str(&format!("[0,{},{},", old_index + t + 1, new_index + t + 1));
                plain(out, line(d.old_slice(old_index + t)));
                out.push(']');
            }
            k += 1;
            continue;
        }
        let (mut olds, mut news) = (Vec::new(), Vec::new());
        while k < ops.len() && !matches!(ops[k], DiffOp::Equal { .. }) {
            let (_, o, n) = ops[k].as_tag_tuple();
            olds.extend(o);
            news.extend(n);
            k += 1;
        }
        *removed += olds.len() as u64;
        *added += news.len() as u64;
        let a: Vec<&str> = olds.iter().map(|&i| line(d.old_slice(i))).collect();
        let b: Vec<&str> = news.iter().map(|&j| line(d.new_slice(j))).collect();
        for (x, y) in pair_lines(&a, &b, weigh_until) {
            if !first { out.push(','); }
            first = false;
            match (x, y) {
                (Some(x), Some(y)) => {
                    out.push_str(&format!("[3,{},{},", olds[x] + 1, news[y] + 1));
                    let (la, lb) = (format!("{}\n", a[x]), format!("{}\n", b[y]));
                    let pd = TextDiff::configure().algorithm(Algorithm::Myers).deadline(until).diff_lines(la.as_str(), lb.as_str());
                    let (mut pa, mut pb) = (String::new(), String::new());
                    for op in pd.ops() {
                        for ch in pd.iter_inline_changes_with_options_deadline(op, opts.clone(), Some(until)) {
                            let parts: Vec<(bool, std::borrow::Cow<str>)> = ch.iter_strings_lossy().collect();
                            match ch.tag() {
                                ChangeTag::Delete => write_parts(&mut pa, &parts),
                                ChangeTag::Insert => write_parts(&mut pb, &parts),
                                ChangeTag::Equal => { write_parts(&mut pa, &parts); write_parts(&mut pb, &parts); }
                            }
                        }
                    }
                    out.push_str(&pa);
                    out.push(',');
                    out.push_str(&pb);
                    out.push(']');
                }
                (Some(x), None) => { out.push_str(&format!("[1,{},0,", olds[x] + 1)); plain(out, a[x]); out.push(']'); }
                (None, Some(y)) => { out.push_str(&format!("[2,0,{},", news[y] + 1)); plain(out, b[y]); out.push(']'); }
                (None, None) => unreachable!(),
            }
        }
    }
}

/// How alike two lines must be to be paired, in millionths: 2·M / (|a| + |b|) ≥ 0.6 — M the characters the two lines
/// have in common in order (their longest common subsequence: the ratio of Python's difflib); for two lines longer than
/// SHORT characters together, the words and signs they have in common in order, over their words and signs (two
/// unrelated paragraphs share many letters in order, few words — and words are fewer to compare).
const SIMILAR: u64 = 600_000;
const SHORT: usize = 400;
/// The pairs of lines weighed in one run of changes at most (100 × 100 lines); a larger run is paired in order.
const MAX_WEIGHED: usize = 10_000;
/// The weighing of one diff ends after this long (or at the diff's own time limit); a run not weighed by then is paired in order.
const WEIGH_MS: u64 = 300;

/// What a line is compared by: its characters (a short pair) or its words and signs, each as a number; and the same
/// sorted, for the bound below.
struct Toks { chars: Vec<u32>, words: Vec<u32>, chars_sorted: Vec<u32>, words_sorted: Vec<u32>, blank: bool }
fn toks(s: &str, dict: &mut std::collections::HashMap<String, u32>) -> Toks {
    let chars: Vec<u32> = s.chars().map(|c| c as u32).collect();
    // words: runs of letters and digits; every other sign on its own; spaces left out
    let mut words = Vec::new();
    let mut word = String::new();
    let id = |w: &str, dict: &mut std::collections::HashMap<String, u32>| { let n = dict.len() as u32; *dict.entry(w.to_string()).or_insert(n) };
    for c in s.chars() {
        if c.is_alphanumeric() { word.push(c); continue; }
        if !word.is_empty() { words.push(id(&word, dict)); word.clear(); }
        if !c.is_whitespace() { let mut b = [0u8; 4]; words.push(id(c.encode_utf8(&mut b), dict)); }
    }
    if !word.is_empty() { words.push(id(&word, dict)); }
    let sorted = |v: &Vec<u32>| { let mut x = v.clone(); x.sort_unstable(); x };
    Toks { chars_sorted: sorted(&chars), words_sorted: sorted(&words), blank: s.trim().is_empty(), chars, words }
}

/// The rows of a run of changes, `a` removed and `b` added (indexes into them): of all the pairings that keep the
/// order on both sides and pair only lines at least SIMILAR alike, the one most alike in all — a line of nothing but
/// spaces is paired with none — stands row by row; the lines left between two such pairs stand side by side in
/// order, the longer side's last ones alone. Equal totals: the pairs as early as they can be. A run of more than
/// MAX_WEIGHED pairs of lines, or one met when the time for weighing is up, is paired in order.
pub fn pair_lines(a: &[&str], b: &[&str], until: Instant) -> Vec<(Option<usize>, Option<usize>)> {
    let (n, m) = (a.len(), b.len());
    let mut pairs: Vec<(usize, usize)> = Vec::new();
    // one line on each side stand in one row whatever their likeness: nothing to weigh
    if n > 0 && m > 0 && n * m > 1 && n * m <= MAX_WEIGHED && Instant::now() < until {
        let mut dict = std::collections::HashMap::new();
        let ta: Vec<Toks> = a.iter().map(|s| toks(s, &mut dict)).collect();
        let tb: Vec<Toks> = b.iter().map(|s| toks(s, &mut dict)).collect();
        // the weight of a pair: its likeness in millionths, 0 = not to be paired
        let mut w = vec![0u64; n * m];
        let mut in_time = true;
        'weigh: for i in 0..n {
            if ta[i].blank { continue; }
            for j in 0..m {
                if tb[j].blank { continue; }
                let (x, y) = (&ta[i], &tb[j]);
                let (p, q, ps, qs) = if x.chars.len() + y.chars.len() <= SHORT { (&x.chars, &y.chars, &x.chars_sorted, &y.chars_sorted) } else { (&x.words, &y.words, &x.words_sorted, &y.words_sorted) };
                let tot = (p.len() + q.len()) as u64;
                if tot == 0 { continue; }
                // bounds first: the shorter one's length, then what the two have in common in any order
                if 2 * (p.len().min(q.len()) as u64) * 1_000_000 < SIMILAR * tot || 2 * common(ps, qs) * 1_000_000 < SIMILAR * tot { continue; }
                // at least SIMILAR alike ⇔ at most this many insertions and deletions turn one into the other
                let dmax = ((1_000_000 - SIMILAR) * tot / 1_000_000) as usize;
                match indels(p, q, dmax, until) {
                    Ok(Some(d)) => w[i * m + j] = 1_000_000 * (tot - d as u64) / tot,
                    Ok(None) => {}
                    Err(()) => { in_time = false; break 'weigh; }
                }
            }
        }
        if in_time {
            // the greatest total weight of an order-keeping pairing of a[..i] and b[..j]
            let at = |i: usize, j: usize| i * (m + 1) + j;
            let mut s = vec![0u64; (n + 1) * (m + 1)];
            for i in 1..=n {
                for j in 1..=m {
                    let x = w[(i - 1) * m + j - 1];
                    let mut v = s[at(i - 1, j)].max(s[at(i, j - 1)]);
                    if x > 0 { v = v.max(s[at(i - 1, j - 1)] + x); }
                    s[at(i, j)] = v;
                }
            }
            // back from the end, a line passed over where that costs nothing: the pairs come as early as they can
            let (mut i, mut j) = (n, m);
            while i > 0 && j > 0 {
                if s[at(i, j)] == s[at(i, j - 1)] { j -= 1; }
                else if s[at(i, j)] == s[at(i - 1, j)] { i -= 1; }
                else { pairs.push((i - 1, j - 1)); i -= 1; j -= 1; }
            }
            pairs.reverse();
        }
    }
    let mut rows = Vec::with_capacity(n.max(m));
    let (mut pi, mut pj) = (0, 0);
    for &(mi, mj) in pairs.iter().chain(std::iter::once(&(n, m))) {
        let (gi, gj) = (mi - pi, mj - pj);
        for t in 0..gi.max(gj) { rows.push(((t < gi).then_some(pi + t), (t < gj).then_some(pj + t))); }
        if mi < n { rows.push((Some(mi), Some(mj))); }
        pi = mi + 1;
        pj = mj + 1;
    }
    rows
}
/// How many items two sorted lists have in common, each counted as often as both have it.
fn common(x: &[u32], y: &[u32]) -> u64 {
    let (mut i, mut j, mut c) = (0, 0, 0u64);
    while i < x.len() && j < y.len() {
        if x[i] == y[j] { c += 1; i += 1; j += 1; } else if x[i] < y[j] { i += 1; } else { j += 1; }
    }
    c
}
/// The fewest insertions and deletions that turn `x` into `y` (|x| + |y| − 2 × their longest common subsequence), if
/// they are at most `dmax` — Myers' O((N + M) D) search, stopped at `dmax` (the crate's searches cannot stop there);
/// Err when the time is up (two long lines that are not alike can take long: a minified file is one line).
fn indels(x: &[u32], y: &[u32], dmax: usize, until: Instant) -> Result<Option<usize>, ()> {
    let (n, m) = (x.len() as isize, y.len() as isize);
    let off = dmax as isize + 1;
    let mut v = vec![0isize; 2 * dmax + 3];
    let mut work = 0usize;
    for d in 0..=dmax as isize {
        work += (d as usize + 1) + 16;
        if work > 1 << 16 { work = 0; if Instant::now() >= until { return Err(()); } }
        let mut k = -d;
        while k <= d {
            let mut px = if k == -d || (k != d && v[(k - 1 + off) as usize] < v[(k + 1 + off) as usize]) { v[(k + 1 + off) as usize] } else { v[(k - 1 + off) as usize] + 1 };
            let mut py = px - k;
            while px < n && py < m && x[px as usize] == y[py as usize] { px += 1; py += 1; }
            v[(k + off) as usize] = px;
            if px >= n && py >= m { return Ok(Some(d as usize)); }
            k += 2;
        }
    }
    Ok(None)
}
