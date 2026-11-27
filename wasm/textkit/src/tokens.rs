//! PDF Compare (potentials #15): the differences of two documents' words. The page gives each document's tokens — its
//! words and signs in reading order, one a line, in the form it compares them (case folded or not, typographic quotes
//! made plain …); the `similar` crate compares the two lists, and this file makes its answer readable:
//! - the changes: runs of removed and added tokens between two equal ones;
//! - a short run of equal tokens between two changes is taken into them — the semantic clean-up of Google's
//!   diff-match-patch, weighed in characters: an equal run of at most 3 tokens no longer than the larger side of the change
//!   before it and of the change after it joins them ("thirty (30) days" → "sixty (60) days" is one change, not two around
//!   the "(");
//! - a run that is only added or only removed is put where it reads best (`slide`: from a sentence's end …);
//! - a removed run that comes back elsewhere — the same tokens, or 80 % of them in order — is a move.
//! The lists are compared with the patience algorithm (unique tokens as anchors, Myers' between them): on 60 stretches of
//! real legal prose with 615 known edits it found 609 exactly and nothing else — Myers' algorithm 598 and 10 changes that
//! were none (a "the" matched far away), histogram 608, but it described a moved clause as the two clauses around it moved
//! the other way (docs/WASM-AUDIT.md, PDF Compare; the unit suite holds patience to it).
use similar::{capture_diff_slices_deadline, Algorithm, DiffOp};
use std::time::{Duration, Instant};

#[derive(Clone, Copy)]
struct Ch { o0: usize, o1: usize, n0: usize, n1: usize }

fn split(t: &str) -> Vec<&str> { if t.is_empty() { Vec::new() } else { t.split('\n').collect() } }
/// prefix sums of the tokens' lengths in characters
fn weights(t: &[&str]) -> Vec<u64> {
    let mut w = Vec::with_capacity(t.len() + 1);
    w.push(0u64);
    for s in t { let last = *w.last().unwrap(); w.push(last + s.chars().count() as u64); }
    w
}

/// The changes of `ops`: each a run of removed and added tokens between two equal ones.
fn changes(ops: &[DiffOp]) -> Vec<Ch> {
    let mut out: Vec<Ch> = Vec::new();
    let mut cur: Option<Ch> = None;
    let grow = |cur: &mut Option<Ch>, o0: usize, o1: usize, n0: usize, n1: usize| match cur {
        None => *cur = Some(Ch { o0, o1, n0, n1 }),
        Some(c) => { c.o1 = c.o1.max(o1); c.n1 = c.n1.max(n1); }
    };
    for op in ops {
        match *op {
            DiffOp::Equal { .. } => { if let Some(c) = cur.take() { out.push(c); } }
            DiffOp::Delete { old_index, old_len, new_index } => grow(&mut cur, old_index, old_index + old_len, new_index, new_index),
            DiffOp::Insert { old_index, new_index, new_len } => grow(&mut cur, old_index, old_index, new_index, new_index + new_len),
            DiffOp::Replace { old_index, old_len, new_index, new_len } => grow(&mut cur, old_index, old_index + old_len, new_index, new_index + new_len),
        }
    }
    if let Some(c) = cur { out.push(c); }
    out
}

/// diff-match-patch's semantic clean-up on changes: an equal run between two changes that is no longer (in characters)
/// than the larger side of each of them is taken into one change with them; after a join the change before is looked
/// at again (the joined change is larger now). Here only for short runs — at most 3 tokens, 20 characters ("the", "of the"):
/// a paragraph between two large changes is no noise (a clause moved past it).
fn cleanup(ch: &mut Vec<Ch>, wa: &[u64], wb: &[u64]) {
    let side = |c: &Ch| (wa[c.o1] - wa[c.o0]).max(wb[c.n1] - wb[c.n0]);
    let mut i = 0;
    while i + 1 < ch.len() {
        let (l, r) = (ch[i], ch[i + 1]);
        let eq = wa[r.o0] - wa[l.o1];
        if r.o0 - l.o1 <= 3 && eq <= 20 && eq <= side(&l) && eq <= side(&r) {
            ch[i] = Ch { o0: l.o0, o1: r.o1, n0: l.n0, n1: r.n1 };
            ch.remove(i + 1);
            if i > 0 { i -= 1; }
        } else { i += 1; }
    }
}

/// A sentence's or a clause's end
fn ends(t: &str) -> bool { matches!(t, "." | "!" | "?" | ";" | ":") }
fn capital(t: &str) -> bool { t.chars().next().map_or(false, |c| c.is_uppercase() || c.is_ascii_digit()) }
fn word(t: &str) -> bool { t.chars().next().map_or(false, char::is_alphanumeric) }
/// How well a run of tokens reads as a change where it stands: from a sentence's end, ending with one, from a word.
fn score(run: &[&str], before: Option<&str>, after: Option<&str>) -> i32 {
    let mut s = 0;
    if before.map_or(true, ends) { s += 4; }
    if run.last().map_or(false, |t| ends(t)) { s += 2; }
    if run.first().map_or(false, |t| capital(t)) { s += 1; }
    if after.map_or(true, capital) { s += 1; }
    if run.first().map_or(false, |t| !word(t)) { s -= 2; }
    s
}
/// A run that is only added (or only removed) can often stand a token earlier or later with the same meaning — an added
/// sentence after "conform ." reads as "The Supplier … years ." or as ". The Supplier … years": it is put where it reads
/// best (`score`; git's indent heuristic, for words). Equal tokens only: a run never slides into another change.
fn slide(ch: &mut [Ch], ta: &[&str], tb: &[&str]) {
    for k in 0..ch.len() {
        let c = ch[k];
        let (po, pn) = if k > 0 { (ch[k - 1].o1, ch[k - 1].n1) } else { (0, 0) };
        let (no, nn) = if k + 1 < ch.len() { (ch[k + 1].o0, ch[k + 1].n0) } else { (ta.len(), tb.len()) };
        // the run (in t, from r0 to r1) and the place it stands at in the other list (at)
        let (t, mut r0, mut r1, mut at, lo_t, lo_at, hi_t, hi_at, ins) = if c.o0 == c.o1 && c.n1 > c.n0 { (tb, c.n0, c.n1, c.o0, pn, po, nn, no, true) }
            else if c.n0 == c.n1 && c.o1 > c.o0 { (ta, c.o0, c.o1, c.n0, po, pn, no, nn, false) } else { continue };
        while r0 > lo_t && at > lo_at && t[r0 - 1] == t[r1 - 1] { r0 -= 1; r1 -= 1; at -= 1; }
        let (mut best, mut bs) = ((r0, r1, at), i32::MIN);
        let orig = if ins { (c.n0, c.n1, c.o0) } else { (c.o0, c.o1, c.n0) };
        loop {
            let s = score(&t[r0..r1], if r0 > 0 { Some(t[r0 - 1]) } else { None }, t.get(r1).copied());
            if s > bs || (s == bs && (r0, r1, at) == orig) { bs = s; best = (r0, r1, at); }
            if !(r1 < hi_t && at < hi_at && t[r0] == t[r1]) { break; }
            r0 += 1; r1 += 1; at += 1;
        }
        let (b0, b1, bat) = best;
        ch[k] = if ins { Ch { o0: bat, o1: bat, n0: b0, n1: b1 } } else { Ch { o0: b0, o1: b1, n0: bat, n1: bat } };
    }
}

/// tokens the two runs share in order, by the diff of the two
fn shared(x: &[&str], y: &[&str]) -> usize {
    capture_diff_slices_deadline(Algorithm::Myers, x, y, None).iter().map(|op| if let DiffOp::Equal { len, .. } = op { *len } else { 0 }).sum()
}

pub fn tokens(a: &str, b: &str, limit_ms: u32) -> String {
    let start = Instant::now();
    let limit = Duration::from_millis(limit_ms.max(1) as u64);
    let (ta, tb) = (split(a), split(b));
    let ops = capture_diff_slices_deadline(Algorithm::Patience, &ta, &tb, Some(start + limit));
    let searched = start.elapsed();
    let (wa, wb) = (weights(&ta), weights(&tb));
    let mut ch = changes(&ops);
    slide(&mut ch, &ta, &tb);
    cleanup(&mut ch, &wa, &wb);
    // moves: a run that is only removed and a run that is only added elsewhere with the same tokens — all of them, or at
    // least 80 % in order (a moved clause renumbered, a word changed in it); the most alike first, each run once
    let big = |n: usize, w: u64| n >= 6 && w >= 20;
    let gone: Vec<usize> = (0..ch.len()).filter(|&i| ch[i].n0 == ch[i].n1 && big(ch[i].o1 - ch[i].o0, wa[ch[i].o1] - wa[ch[i].o0])).take(200).collect();
    let came: Vec<usize> = (0..ch.len()).filter(|&j| ch[j].o0 == ch[j].o1 && big(ch[j].n1 - ch[j].n0, wb[ch[j].n1] - wb[ch[j].n0])).take(200).collect();
    let mut pairs: Vec<(f64, usize, usize, bool)> = Vec::new();
    let until = start + limit + Duration::from_millis(500);
    'outer: for &i in &gone {
        let x = &ta[ch[i].o0..ch[i].o1];
        for &j in &came {
            if Instant::now() > until { break 'outer; }
            let y = &tb[ch[j].n0..ch[j].n1];
            let (n, m) = (x.len(), y.len());
            if n.min(m) * 10 < n.max(m) * 8 { continue; }
            let same = if x == y { n } else { shared(x, y) };
            let r = same as f64 / n.max(m) as f64;
            if r >= 0.8 { pairs.push((r, i, j, x == y)); }
        }
    }
    pairs.sort_by(|p, q| q.0.partial_cmp(&p.0).unwrap().then(p.1.cmp(&q.1)));
    let mut moves: Vec<(usize, usize, bool)> = Vec::new();
    for (_, i, j, exact) in pairs { if !moves.iter().any(|m| m.0 == i || m.1 == j) { moves.push((i, j, exact)); } }
    moves.sort();
    let (mut removed, mut added) = (0usize, 0usize);
    let mut out = String::with_capacity(32 * ch.len() + 128);
    out.push_str("\"changes\":[");
    for (k, c) in ch.iter().enumerate() {
        removed += c.o1 - c.o0; added += c.n1 - c.n0;
        if k > 0 { out.push(','); }
        out.push_str(&format!("[{},{},{},{}]", c.o0, c.o1 - c.o0, c.n0, c.n1 - c.n0));
    }
    out.push_str("],\"moves\":[");
    for (k, (i, j, e)) in moves.iter().enumerate() { if k > 0 { out.push(','); } out.push_str(&format!("[{},{},{}]", i, j, *e as u8)); }
    out.push(']');
    format!("{{\"same\":{},\"removed\":{},\"added\":{},\"approx\":{},{},\"ms\":{}}}", ta.len() - removed, removed, added, searched >= limit, out, start.elapsed().as_millis())
}
