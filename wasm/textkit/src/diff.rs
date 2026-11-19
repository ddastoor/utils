//! Text Diff: the differences of two texts by lines (with the changed part of a changed line marked), by words or
//! by characters. The comparing is the `similar` crate's (Myers' algorithm in linear space, with a time limit after
//! which it settles for a diff that is correct but not the shortest); this file turns its answer into what the page
//! draws and into a unified diff (`diff -u`) that `patch` can apply.
use similar::{Algorithm, ChangeTag, InlineChangeOptions, TextDiff};
use std::time::{Duration, Instant};

fn kind(t: ChangeTag) -> u8 { match t { ChangeTag::Equal => 0, ChangeTag::Delete => 1, ChangeTag::Insert => 2 } }
fn strip_break(s: &str) -> &str { s.strip_suffix("\r\n").or_else(|| s.strip_suffix('\n')).or_else(|| s.strip_suffix('\r')).unwrap_or(s) }
fn ends_with_break(s: &str) -> bool { s.ends_with('\n') || s.ends_with('\r') }
/// The text with a line break at its end (an empty text stays empty).
fn closed(t: &str) -> std::borrow::Cow<'_, str> { if t.is_empty() || ends_with_break(t) { std::borrow::Cow::Borrowed(t) } else { std::borrow::Cow::Owned(format!("{t}\n")) } }

/// mode 0: lines → {"mode":0,"added","removed","same","approx","rows":[[kind,lineA,lineB,[[marked,text],…]],…],
///                  "unified":"…","endA":bool,"endB":bool}        (kind 0 same, 1 only in A, 2 only in B)
/// mode 1: words, mode 2: characters → {"mode","added","removed","same","approx","spans":[[kind,text],…]}
pub fn diff(a: &str, b: &str, mode: u32, limit_ms: u32) -> String {
    let start = Instant::now();
    let limit = Duration::from_millis(limit_ms.max(1) as u64);
    let mut cfg = TextDiff::configure();
    cfg.algorithm(Algorithm::Myers).deadline(start + limit);
    let (mut added, mut removed, mut same) = (0u64, 0u64, 0u64);
    let mut out = String::with_capacity(a.len() + b.len() + 256);
    if mode == 0 {
        // A last line is the same line whether or not a line break follows it: both texts are compared as if they
        // ended with one. (The unified diff below is made from the texts as they are — `patch` needs to know.)
        let (na, nb) = (closed(a), closed(b));
        let d = cfg.diff_lines(na.as_ref(), nb.as_ref());
        // the marking inside changed lines gets what is left of the time, and at least a little
        let inline_until = Instant::now() + limit.saturating_sub(start.elapsed()).max(Duration::from_millis(200));
        let mut opts = InlineChangeOptions::default();
        opts.semantic_cleanup(true);
        out.push_str("\"rows\":[");
        let mut first = true;
        for op in d.ops() {
            for ch in d.iter_inline_changes_with_options_deadline(op, opts.clone(), Some(inline_until)) {
                match ch.tag() { ChangeTag::Equal => same += 1, ChangeTag::Delete => removed += 1, ChangeTag::Insert => added += 1 }
                if !first { out.push(','); }
                first = false;
                out.push_str(&format!("[{},{},{},[", kind(ch.tag()), ch.old_index().map_or(0, |i| i + 1), ch.new_index().map_or(0, |i| i + 1)));
                let parts: Vec<(bool, std::borrow::Cow<str>)> = ch.iter_strings_lossy().collect();
                let n = parts.len();
                let mut wrote = false;
                for (i, (marked, text)) in parts.iter().enumerate() {
                    let t = if i + 1 == n { strip_break(text) } else { text.as_ref() };
                    if t.is_empty() && n > 1 { continue; }
                    if wrote { out.push(','); }
                    wrote = true;
                    out.push_str(if *marked { "[1," } else { "[0," });
                    crate::json_str(&mut out, t);
                    out.push(']');
                }
                out.push_str("]]");
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
    let approx = start.elapsed() >= limit;
    format!("{{\"mode\":{},\"added\":{},\"removed\":{},\"same\":{},\"approx\":{},{}\"ms\":{}}}", mode, added, removed, same, approx, out, start.elapsed().as_millis())
}
