//! JSON diff → RFC 6902 patch, on the lossless tree of jsonfmt.rs (nothing is converted, so 12345678901234567890 and
//! 1e400 survive, and 1 = 1.0 = 1e0 as numbers).
//! Arrays are aligned by their longest common subsequence of equal elements, so removing the first element of a
//! list is one "removed" row — not a "changed" row for every element (what an index-by-index comparison gives).
//! Between equal elements, records that all carry an "id" are matched by it, so a record that changed is compared
//! member by member with its own earlier version, not with whatever now sits at the same index.
//! Input JSON { "a": "<left text>", "b": "<right text>" }
//! Output JSON { "equal", "count", "patch": "<pretty-printed RFC 6902 patch>",
//!               "rows": [{ "op": "add" | "remove" | "replace", "path", "left", "right" }], "notes": [..] }
//! `path` of a row points into the left document for removed / changed values and into the right one for added
//! values; the patch itself uses RFC 6902 paths (each operation sees the result of the ones before it).
use crate::jsonfmt::{emit, parse, unescape, Node};
use crate::{arg, js, s, R};
use serde_json::json;
use std::collections::HashMap;

/// Arrays larger than this (old length × new length) are compared index by index: the alignment table would be too big.
const LCS_CELLS: usize = 4_000_000;

/// A number token as (negative, digits without leading or trailing zeros, power of ten of the last digit): equal
/// numbers give equal triples whatever their spelling.
fn num_key(t: &str) -> (bool, String, i64) {
    let neg = t.starts_with('-'); let t = t.trim_start_matches('-');
    let (m, e) = match t.find(|c| c == 'e' || c == 'E') { Some(i) => (&t[..i], t[i + 1..].parse::<i64>().unwrap_or(0)), None => (t, 0) };
    let (int, frac) = match m.find('.') { Some(i) => (&m[..i], &m[i + 1..]), None => (m, "") };
    let mut digits: String = format!("{int}{frac}"); let mut exp = e - frac.len() as i64;
    while digits.ends_with('0') { digits.pop(); exp += 1; }
    let digits = digits.trim_start_matches('0').to_string();
    if digits.is_empty() { (false, String::new(), 0) } else { (neg, digits, exp) }
}
/// A text that is the same for equal values and different for different ones (keys sorted, numbers and strings
/// by value). With duplicate keys the last one counts, as for most JSON readers.
fn canon(n: &Node, o: &mut String) {
    match n {
        Node::Lit(t) => {
            if t.starts_with('"') { o.push('s'); o.push_str(&serde_json::to_string(&unescape(t)).unwrap_or_default()); }
            else if t.starts_with(|c: char| c == '-' || c.is_ascii_digit()) { let (neg, d, e) = num_key(t); o.push('n'); if neg { o.push('-'); } o.push_str(&d); o.push('e'); o.push_str(&e.to_string()); }
            else { o.push_str(t); }
        }
        Node::Arr(a) => { o.push('['); for x in a { canon(x, o); o.push(','); } o.push(']'); }
        Node::Obj(m) => {
            let mut last: Vec<(String, &Node)> = Vec::new();
            for (k, v) in m { let k = unescape(k); if let Some(e) = last.iter_mut().find(|e| e.0 == k) { e.1 = v; } else { last.push((k, v)); } }
            last.sort_by(|x, y| x.0.cmp(&y.0));
            o.push('{'); for (k, v) in last { o.push_str(&serde_json::to_string(&k).unwrap_or_default()); o.push(':'); canon(v, o); o.push(','); } o.push('}');
        }
    }
}
fn canon_of(n: &Node) -> String { let mut o = String::new(); canon(n, &mut o); o }
fn raw(n: &Node) -> String { let mut o = String::new(); emit(n, "", 0, false, &mut o); o }
fn ptr(base: &str, seg: &str) -> String { format!("{base}/{}", seg.replace('~', "~0").replace('/', "~1")) }

/// Matched index pairs (i, j), in order, of equal keys — a longest common subsequence. Too many cells for the
/// table: equal keys at the same index only.
fn lcs_pairs(cx: &[String], cy: &[String]) -> Vec<(usize, usize)> {
    let (n, m) = (cx.len(), cy.len()); let mut pairs = Vec::new();
    if n * m <= LCS_CELLS {
        let w = m + 1; let mut t = vec![0u32; (n + 1) * w];
        for i in (0..n).rev() { for j in (0..m).rev() { t[i * w + j] = if cx[i] == cy[j] { t[(i + 1) * w + j + 1] + 1 } else { t[(i + 1) * w + j].max(t[i * w + j + 1]) }; } }
        let (mut i, mut j) = (0, 0);
        while i < n && j < m { if cx[i] == cy[j] { pairs.push((i, j)); i += 1; j += 1; } else if t[(i + 1) * w + j] >= t[i * w + j + 1] { i += 1; } else { j += 1; } }
    } else { for i in 0..n.min(m) { if cx[i] == cy[i] { pairs.push((i, i)); } } }
    pairs
}
/// What identifies a record in a list: the value of its "id" member (a string, number, true / false / null).
fn id_of(n: &Node) -> Option<String> {
    match n { Node::Obj(m) => m.iter().rev().find(|(k, _)| unescape(k) == "id").and_then(|(_, v)| if matches!(v, Node::Lit(_)) { Some(canon_of(v)) } else { None }), _ => None }
}
struct Out { ops: Vec<String>, rows: Vec<serde_json::Value> }
impl Out {
    fn push(&mut self, op: &str, patch_path: &str, shown: &str, left: Option<&Node>, right: Option<&Node>) {
        let q = serde_json::to_string(patch_path).unwrap_or_default();
        self.ops.push(match right { Some(v) if op != "remove" => format!("{{\"op\":\"{op}\",\"path\":{q},\"value\":{}}}", raw(v)), _ => format!("{{\"op\":\"remove\",\"path\":{q}}}") });
        self.rows.push(json!({ "op": op, "path": shown, "left": left.map(raw), "right": right.map(raw) }));
    }
}
/// `pp` = patch path (in the document as the earlier operations left it), `lp` / `rp` = where the value sits in the left / right text.
fn diff(a: &Node, b: &Node, pp: &str, lp: &str, rp: &str, o: &mut Out) {
    match (a, b) {
        (Node::Obj(x), Node::Obj(y)) => {
            // members by key; a key written twice counts once, with its last value
            let last = |m: &'_ [(&str, Node)]| -> Vec<(String, usize)> { let mut v: Vec<(String, usize)> = Vec::new(); for (i, (k, _)) in m.iter().enumerate() { let k = unescape(k); if let Some(e) = v.iter_mut().find(|e| e.0 == k) { e.1 = i; } else { v.push((k, i)); } } v };
            let (lx, ly) = (last(x), last(y));
            let iy: HashMap<&str, usize> = ly.iter().map(|(k, i)| (k.as_str(), *i)).collect();
            let ix: HashMap<&str, usize> = lx.iter().map(|(k, i)| (k.as_str(), *i)).collect();
            for (k, i) in &lx { match iy.get(k.as_str()) { Some(&j) => diff(&x[*i].1, &y[j].1, &ptr(pp, k), &ptr(lp, k), &ptr(rp, k), o), None => o.push("remove", &ptr(pp, k), &ptr(lp, k), Some(&x[*i].1), None) } }
            for (k, j) in &ly { if !ix.contains_key(k.as_str()) { o.push("add", &ptr(pp, k), &ptr(rp, k), None, Some(&y[*j].1)); } }
        }
        (Node::Arr(x), Node::Arr(y)) => {
            let (cx, cy): (Vec<String>, Vec<String>) = (x.iter().map(canon_of).collect(), y.iter().map(canon_of).collect());
            let (n, m) = (x.len(), y.len());
            let mut pairs = lcs_pairs(&cx, &cy);
            pairs.push((n, m));
            let (mut i, mut j, mut cur) = (0usize, 0usize, 0usize); // cur = index in the array as the patch has left it so far
            for (pi, pj) in pairs {
                // between two equal elements: records are matched by their "id" where every element has one, the rest in order
                let (ix, iy): (Option<Vec<String>>, Option<Vec<String>>) = (x[i..pi].iter().map(id_of).collect(), y[j..pj].iter().map(id_of).collect());
                let mut sub = match (&ix, &iy) { (Some(a), Some(b)) if !a.is_empty() && !b.is_empty() => lcs_pairs(a, b), _ => Vec::new() };
                sub.push((pi - i, pj - j));
                let (mut si, mut sj) = (0usize, 0usize);
                for (qi, qj) in sub {
                    let both = (qi - si).min(qj - sj);
                    for t in 0..both { diff(&x[i + si + t], &y[j + sj + t], &format!("{pp}/{cur}"), &format!("{lp}/{}", i + si + t), &format!("{rp}/{}", j + sj + t), o); cur += 1; }
                    for t in si + both..qi { o.push("remove", &format!("{pp}/{cur}"), &format!("{lp}/{}", i + t), Some(&x[i + t]), None); }
                    for t in sj + both..qj { o.push("add", &format!("{pp}/{cur}"), &format!("{rp}/{}", j + t), None, Some(&y[j + t])); cur += 1; }
                    if qi < pi - i && qj < pj - j { diff(&x[i + qi], &y[j + qj], &format!("{pp}/{cur}"), &format!("{lp}/{}", i + qi), &format!("{rp}/{}", j + qj), o); cur += 1; } // the same id: compared member by member
                    si = qi + 1; sj = qj + 1;
                }
                i = pi + 1; j = pj + 1; cur += 1;
            }
        }
        _ => { if canon_of(a) != canon_of(b) { o.push("replace", pp, lp, Some(a), Some(b)); } }
    }
}
pub fn run(input: &[u8]) -> R {
    let a = arg(input)?;
    let side = |name: &str, key: &str| -> Result<String, String> { let t = s(&a, key).to_string(); if t.trim().is_empty() { return Err(format!("{name} is empty — paste JSON on both sides")); } match parse(&t) { Ok(_) => Ok(t), Err(e) => Err(format!("{name}: {} (line {}, column {})", e.message, e.line, e.column)) } };
    let (lt, rt) = (side("Left", "a")?, side("Right", "b")?);
    let (l, r) = (parse(&lt).map_err(|e| e.message)?, parse(&rt).map_err(|e| e.message)?);
    let mut o = Out { ops: Vec::new(), rows: Vec::new() };
    diff(&l.root, &r.root, "", "", "", &mut o);
    let flat = format!("[{}]", o.ops.join(","));
    let mut pretty = String::new();
    match parse(&flat) { Ok(p) => emit(&p.root, "  ", 0, false, &mut pretty), Err(_) => pretty = flat.clone() }
    let mut notes: Vec<String> = Vec::new();
    for (name, p) in [("Left", &l), ("Right", &r)] { if !p.dups.is_empty() { notes.push(format!("{name} has {} duplicate key{} ({}): the last value of each is compared.", p.dups.len(), if p.dups.len() == 1 { "" } else { "s" }, p.dups.iter().take(3).map(|d| format!("\"{}\" on line {}", d.0, d.1)).collect::<Vec<_>>().join(", "))); } }
    js(json!({ "equal": o.ops.is_empty(), "count": o.ops.len(), "patch": pretty, "rows": o.rows, "notes": notes }))
}
