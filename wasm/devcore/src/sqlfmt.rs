//! SQL formatter — our own code (the `sqlformat` crate changed the meaning of SQL: see docs/WASM-AUDIT.md, tab 53).
//!
//! Four steps:
//!  1. `lex`     — a tokenizer that knows the dialects' lexical rules (standard SQL, PostgreSQL, MySQL / MariaDB,
//!                 SQLite, SQL Server, Oracle): what a string, a quoted name, a comment, a number, a variable and an
//!                 operator look like in each of them.
//!  2. `analyse` — decides for every word whether it is used as a keyword (only those change case) and gives the
//!                 keywords their part in the layout (clause, line break, block …).
//!  3. `layout`  — writes the tokens out again. Between two tokens it writes white space or nothing; it never
//!                 changes a token other than the case of a keyword.
//!  4. the guard — the result is tokenized again and must hold exactly the tokens of the input, in order. If it
//!                 does not, the input is given back untouched (`kept`).
use crate::{arg, js, s, R};
use serde_json::json;

// ====================================================================================================== tokens
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum D { Std, Pg, My, Lite, Ms, Ora }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum K { Word, QId, Str, Num, Var, Op, Comma, Semi, Dot, Open, Close, SqOpen, SqClose, BrOpen, BrClose, LineC, BlockC, Other }

/// One token: `s` is a slice of the input, `nl` the line breaks in the white space before it, `sp` whether there
/// was any white space before it, `bad` that it never ends (a string, a quoted name or a comment).
#[derive(Clone, Copy)]
struct T<'a> { k: K, s: &'a str, nl: u32, sp: bool, bad: bool }

fn is_ws(c: u8) -> bool { matches!(c, b' ' | b'\t' | b'\n' | b'\r' | 0x0b | 0x0c) }
fn id_start(c: u8) -> bool { c.is_ascii_alphabetic() || c == b'_' || c >= 0x80 }
fn id_char(c: u8, d: D) -> bool {
    c.is_ascii_alphanumeric() || c == b'_' || c == b'$' || c >= 0x80 || (c == b'#' && matches!(d, D::Ms | D::Ora)) || (c == b'@' && d == D::Ms)
}

/// `i` is the opening quote; returns the end and whether the closing quote was found. A doubled quote is part
/// of the text; `bs`: a backslash takes the next character with it (MySQL, PostgreSQL E'…').
fn quoted(b: &[u8], i: usize, q: u8, bs: bool) -> (usize, bool) {
    let n = b.len();
    let mut j = i + 1;
    while j < n {
        let c = b[j];
        if bs && c == b'\\' { j += 2; continue; }
        if c == q {
            if j + 1 < n && b[j + 1] == q { j += 2; continue; }
            return (j + 1, true);
        }
        j += 1;
    }
    (n, false)
}
fn block_comment(b: &[u8], i: usize, nest: bool) -> (usize, bool) {
    let n = b.len();
    let (mut j, mut depth) = (i + 2, 1);
    while j < n {
        if b[j] == b'*' && j + 1 < n && b[j + 1] == b'/' {
            depth -= 1; j += 2;
            if depth == 0 { return (j, true); }
        } else if nest && b[j] == b'/' && j + 1 < n && b[j + 1] == b'*' { depth += 1; j += 2; } else { j += 1; }
    }
    (n, false)
}
/// The first `c` after `i` on the same line, looking at most `max` bytes ahead.
fn near(b: &[u8], i: usize, c: u8, max: usize) -> Option<usize> {
    let mut j = i + 1;
    while j < b.len() && j <= i + max && b[j] != b'\n' && b[j] != b'\r' {
        if b[j] == c { return Some(j); }
        j += 1;
    }
    None
}
fn eol(b: &[u8], i: usize) -> usize {
    let mut j = i;
    while j < b.len() && b[j] != b'\n' && b[j] != b'\r' { j += 1; }
    j
}
/// PostgreSQL `$tag$ … $tag$` at `i`: the end and whether the closing tag was found; None when this is no opening tag.
fn dollar(b: &[u8], i: usize) -> Option<(usize, bool)> {
    let n = b.len();
    let mut j = i + 1;
    if j < n && b[j].is_ascii_digit() { return None; }
    while j < n && (b[j].is_ascii_alphanumeric() || b[j] == b'_' || b[j] >= 0x80) { j += 1; }
    if j >= n || b[j] != b'$' { return None; }
    let tag = &b[i..=j];
    let mut k = j + 1;
    while k + tag.len() <= n {
        if b[k] == b'$' && &b[k..k + tag.len()] == tag { return Some((k + tag.len(), true)); }
        k += 1;
    }
    Some((n, false))
}
/// Oracle `q'[ … ]'` — `q` is the index of the quote.
fn qquote(b: &[u8], q: usize) -> Option<(usize, bool)> {
    let n = b.len();
    let o = *b.get(q + 1)?;
    if is_ws(o) || o >= 0x80 || o == b'\'' { return None; }
    let c = match o { b'[' => b']', b'{' => b'}', b'(' => b')', b'<' => b'>', x => x };
    let mut k = q + 2;
    while k + 1 < n {
        if b[k] == c && b[k + 1] == b'\'' { return Some((k + 2, true)); }
        k += 1;
    }
    Some((n, false))
}
fn number(b: &[u8], i: usize) -> usize {
    let n = b.len();
    let mut j = i;
    if b[j] == b'0' && j + 2 < n && matches!(b[j + 1] | 0x20, b'x' | b'b' | b'o') && b[j + 2].is_ascii_alphanumeric() {
        j += 2;
        while j < n && (b[j].is_ascii_alphanumeric() || b[j] == b'_') { j += 1; }
        return j;
    }
    while j < n && (b[j].is_ascii_digit() || b[j] == b'_') { j += 1; }
    if j < n && b[j] == b'.' {
        let c = if j + 1 < n { b[j + 1] } else { b' ' };
        if c.is_ascii_digit() {
            j += 1;
            while j < n && (b[j].is_ascii_digit() || b[j] == b'_') { j += 1; }
        } else if c != b'.' && !id_start(c) && j > i {
            j += 1; // "5."
        } else if (c | 0x20) == b'e' && j > i && j + 2 < n && (b[j + 2].is_ascii_digit() || (matches!(b[j + 2], b'+' | b'-') && j + 3 < n && b[j + 3].is_ascii_digit())) {
            j += 1; // "1.e5"
        }
    }
    if j < n && (b[j] | 0x20) == b'e' {
        let mut k = j + 1;
        if k < n && matches!(b[k], b'+' | b'-') { k += 1; }
        if k < n && b[k].is_ascii_digit() {
            while k < n && b[k].is_ascii_digit() { k += 1; }
            j = k;
        }
    }
    // a suffix (Oracle 1.5d, 2f) or the rest of a name that starts with digits
    while j < n && (b[j].is_ascii_alphanumeric() || b[j] == b'_' || b[j] == b'$' || b[j] >= 0x80) { j += 1; }
    j
}
const PG_OPCH: &[u8] = b"+-*/<>=~!@#%^&|?";
/// PostgreSQL's own rule for operators: a run of operator characters; it stops before a comment, and a run of
/// several characters does not end in + or − unless it holds one of ~ ! @ # % ^ & | ` ?
fn pg_op(b: &[u8], i: usize) -> usize {
    let n = b.len();
    let mut j = i;
    while j < n && PG_OPCH.contains(&b[j]) {
        if j + 1 < n && ((b[j] == b'-' && b[j + 1] == b'-') || (b[j] == b'/' && b[j + 1] == b'*')) { break; }
        j += 1;
    }
    if j == i { return i + 1; }
    if j - i > 1 && !b[i..j].iter().any(|c| b"~!@#%^&|?".contains(c)) {
        while j - i > 1 && matches!(b[j - 1], b'+' | b'-') { j -= 1; }
    }
    j
}
fn op_table(d: D) -> &'static [&'static str] {
    match d {
        D::My => &["<=>", "->>", "->", "<<", ">>", "<>", "!=", "<=", ">=", "&&", "||"],
        D::Ms => &["<>", "!=", "<=", ">=", "!<", "!>", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "||", "<<", ">>"],
        D::Lite => &["->>", "->", "||", "<<", ">>", "<=", ">=", "==", "!=", "<>"],
        D::Ora => &["||", "=>", "**", "<>", "!=", "^=", "~=", "<=", ">=", "<<", ">>"],
        D::Std => &["<=>", "->>", "#>>", "!~*", "||/", "<->", "->", "#>", "@>", "<@", "?|", "?&", "~*", "!~", "|/", "<<", ">>", "<>", "!=", "<=", ">=", "==", "&&", "||", "=>", "**", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "!<", "!>"],
        D::Pg => &[],
    }
}
/// Words after which a value must follow (so a "%s" there is a placeholder, not the modulo operator).
fn wants_value(w: &str) -> bool {
    const L: &[&str] = &["LIMIT", "OFFSET", "SELECT", "WHERE", "AND", "OR", "NOT", "IN", "VALUES", "SET", "BETWEEN", "LIKE", "ILIKE", "THEN", "ELSE", "WHEN", "BY", "ON", "TOP", "INTERVAL", "CASE", "RETURNING", "HAVING", "FROM", "JOIN", "INTO", "UPDATE", "TABLE", "AS", "IS", "ANY", "ALL", "DISTINCT"];
    w.len() <= 9 && L.iter().any(|x| x.eq_ignore_ascii_case(w))
}

fn lex(src: &str, d: D) -> (Vec<T<'_>>, u32) {
    let b = src.as_bytes();
    let n = b.len();
    let mut i = if src.starts_with('\u{feff}') { 3 } else { 0 };
    let mut out: Vec<T> = Vec::with_capacity(n / 5 + 8);
    let (mut errs, mut sq, mut no_dollar, mut no_qq) = (0u32, 0u32, false, false);
    let ops = op_table(d);
    loop {
        let w0 = i;
        let mut nl = 0u32;
        while i < n && is_ws(b[i]) {
            if b[i] == b'\n' || (b[i] == b'\r' && b.get(i + 1) != Some(&b'\n')) { nl += 1; }
            i += 1;
        }
        if i >= n { break; }
        let sp = i > w0;
        let c = b[i];
        let c1 = if i + 1 < n { b[i + 1] } else { 0 };
        let c2 = if i + 2 < n { b[i + 2] } else { 0 };
        let prev = out.iter().rev().find(|t| !matches!(t.k, K::LineC | K::BlockC));
        // the token before ends a value (a name, a literal, a closing bracket)
        let after_value = prev.map_or(false, |p| matches!(p.k, K::QId | K::Str | K::Num | K::Var | K::Close | K::SqClose | K::BrClose) || (p.k == K::Word && !wants_value(p.s)));
        // … and this one touches it
        let glued = !sp && out.last().map_or(false, |p| matches!(p.k, K::Word | K::QId | K::Str | K::Num | K::Var | K::Close | K::SqClose));
        let (mut k, mut e, mut bad) = (K::Other, i + 1, false);
        match c {
            // MySQL wants white space after "--" (there "5--5" is 5 − −5). It is a comment here all the same: that
            // leaves such text as it was typed, while the other reading would rewrite a real comment as code.
            b'-' if c1 == b'-' => { k = K::LineC; e = eol(b, i); }
            b'/' if c1 == b'*' => { let (x, ok) = block_comment(b, i, matches!(d, D::Pg | D::Ms | D::Std)); k = K::BlockC; e = x; bad = !ok; }
            b'\'' => { let (x, ok) = quoted(b, i, b'\'', d == D::My); k = K::Str; e = x; bad = !ok; }
            b'"' => { let (x, ok) = quoted(b, i, b'"', d == D::My); k = if d == D::My { K::Str } else { K::QId }; e = x; bad = !ok; }
            b'`' => { let (x, ok) = quoted(b, i, b'`', false); k = K::QId; e = x; bad = !ok; }
            b'[' => {
                let name = match d {
                    D::Ms | D::Lite => true,
                    D::Std | D::My | D::Ora => !glued && !prev.map_or(false, |p| p.k == K::Word && p.s.eq_ignore_ascii_case("array")) && c1 != b']' && near(b, i, b']', 300).is_some(),
                    _ => false,
                };
                if name { let (x, ok) = quoted(b, i, b']', false); k = K::QId; e = x; bad = !ok; } else { k = K::SqOpen; sq += 1; }
            }
            b']' => { if sq > 0 { sq -= 1; k = K::SqClose; } }
            b'(' => { if c1 == b'+' && c2 == b')' && matches!(d, D::Ora | D::Std) && after_value { e = i + 3; } else { k = K::Open; } }
            b')' => k = K::Close,
            b',' => k = K::Comma,
            b';' => k = K::Semi,
            b'{' => {
                // template text ({{ … }}, {% … %}, {# … #}) is kept as it is
                let close: &[u8] = match c1 { b'{' => b"}}", b'%' => b"%}", b'#' => b"#}", _ => b"" };
                match if close.is_empty() { None } else { b[i + 2..(i + 8000).min(n)].windows(2).position(|w| w == close) } {
                    Some(x) => { k = K::Var; e = i + 2 + x + 2; }
                    None => k = K::BrOpen,
                }
            }
            b'}' => k = K::BrClose,
            b'.' => {
                if c1.is_ascii_digit() && !glued { k = K::Num; e = number(b, i); } else if c1 == b'.' {
                    while e < n && b[e] == b'.' { e += 1; }
                } else { k = K::Dot; }
            }
            b'0'..=b'9' => { k = K::Num; e = number(b, i); }
            b'$' => {
                if let (b'{', Some(x)) = (c1, near(b, i, b'}', 200)) {
                    k = K::Var; e = x + 1;
                } else if c1.is_ascii_digit() {
                    k = K::Var; e = i + 1;
                    while e < n && b[e].is_ascii_digit() { e += 1; }
                    if matches!(d, D::Ms | D::Std) {
                        // money: $12.50
                        if e + 1 < n && b[e] == b'.' && b[e + 1].is_ascii_digit() { e += 1; while e < n && b[e].is_ascii_digit() { e += 1; } k = K::Num; } else if d == D::Ms { k = K::Num; }
                    }
                } else {
                    let dq = if d == D::Pg || (d == D::Std && !no_dollar) { dollar(b, i) } else { None };
                    match dq {
                        Some((x, ok)) if ok || d == D::Pg => { k = K::Str; e = x; bad = !ok; }
                        other => {
                            if other.is_some() { no_dollar = true; }
                            if id_start(c1) { k = K::Var; e = i + 1; while e < n && id_char(b[e], d) { e += 1; } }
                        }
                    }
                }
            }
            b'@' if d != D::Pg && (id_start(c1) || (c1 == b'@' && id_start(c2)) || (d == D::My && matches!(c1, b'`' | b'\'' | b'"'))) => {
                k = K::Var;
                if matches!(c1, b'`' | b'\'' | b'"') { let (x, ok) = quoted(b, i + 1, c1, c1 != b'`'); e = x; bad = !ok; } else {
                    e = if c1 == b'@' { i + 2 } else { i + 1 };
                    while e < n && id_char(b[e], d) { e += 1; }
                }
            }
            b':' => {
                if c1 == b':' || c1 == b'=' { k = K::Op; e = i + 2; } else if sq > 0 { /* a slice: arr[1:2] */ } else if id_start(c1) || c1.is_ascii_digit() {
                    k = K::Var; e = i + 1;
                    while e < n && id_char(b[e], d) { e += 1; }
                } else if matches!(c1, b'\'' | b'"') && matches!(d, D::Pg | D::Std) {
                    let (x, ok) = quoted(b, i + 1, c1, false);
                    if ok { k = K::Var; e = x; }
                }
            }
            b'?' if d != D::Pg && !(d == D::Std && matches!(c1, b'|' | b'&') && c2 != c1) => {
                k = K::Var;
                while e < n && b[e].is_ascii_digit() { e += 1; }
            }
            b'%' if !after_value && ((c1 == b's' && !id_char(c2, d)) || c1 == b'(') => {
                // Python DB-API placeholders: %s and %(name)s
                if c1 == b's' { k = K::Var; e = i + 2; } else {
                    let mut j = i + 2;
                    while j < n && id_char(b[j], D::Std) { j += 1; }
                    if j > i + 2 && j + 1 < n && b[j] == b')' && b[j + 1] == b's' { k = K::Var; e = j + 2; } else { k = K::Op; }
                }
            }
            b'#' if matches!(d, D::My | D::Lite | D::Ora) && c1 != b'{' => { k = K::LineC; e = eol(b, i); }
            b'#' if c1 == b'{' && near(b, i, b'}', 200).is_some() => { k = K::Var; e = near(b, i, b'}', 200).unwrap() + 1; }
            b'#' if d == D::Ms => {
                if id_char(c1, d) { k = K::Word; while e < n && id_char(b[e], d) { e += 1; } } else { k = K::LineC; e = eol(b, i); }
            }
            b'#' if d == D::Std && !matches!(c1, b'>' | b'-') => {
                // a MySQL comment, or the name of a SQL Server temporary table
                if (id_start(c1) || (c1 == b'#' && id_start(c2))) && nl == 0 && !out.is_empty() {
                    k = K::Word;
                    while e < n && (id_char(b[e], d) || b[e] == b'#') { e += 1; }
                } else { k = K::LineC; e = eol(b, i); }
            }
            b'\\' => { while e < n && !is_ws(b[e]) { e += 1; } }
            b'<' if c1 == b'<' && id_start(c2) && !after_value && matches!(d, D::Ora | D::Std) => {
                // a PL/SQL label: <<name>>
                let mut j = i + 2;
                while j < n && id_char(b[j], d) { j += 1; }
                if j + 1 < n && b[j] == b'>' && b[j + 1] == b'>' { e = j + 2; } else { k = K::Op; e = i + 2; }
            }
            _ if id_start(c) => {
                let mut j = i + 1;
                while j < n && id_char(b[j], d) { j += 1; }
                k = K::Word; e = j;
                let wl = j - i;
                let lc = c | 0x20;
                if j < n && b[j] == b'\'' {
                    if wl == 1 && matches!(lc, b'n' | b'x' | b'b' | b'e') {
                        let (x, ok) = quoted(b, j, b'\'', d == D::My || (lc == b'e' && matches!(d, D::Pg | D::Std)));
                        k = K::Str; e = x; bad = !ok;
                    } else if (d == D::Ora || (d == D::Std && !no_qq)) && ((wl == 1 && lc == b'q') || (wl == 2 && lc == b'n' && (b[i + 1] | 0x20) == b'q')) {
                        if let Some((x, ok)) = qquote(b, j) {
                            if ok || d == D::Ora { k = K::Str; e = x; bad = !ok; } else { no_qq = true; }
                        }
                    }
                } else if wl == 1 && lc == b'u' && j + 1 < n && b[j] == b'&' && matches!(b[j + 1], b'\'' | b'"') {
                    let (x, ok) = quoted(b, j + 1, b[j + 1], false);
                    k = if b[j + 1] == b'"' { K::QId } else { K::Str }; e = x; bad = !ok;
                }
            }
            _ => {
                if d == D::Pg && PG_OPCH.contains(&c) {
                    e = pg_op(b, i);
                    k = if e - i == 1 && c == b'?' { K::Var } else { K::Op };
                } else if let Some(o) = ops.iter().find(|o| b[i..].starts_with(o.as_bytes())) {
                    k = K::Op; e = i + o.len();
                } else if b"+-*/%=<>!~^&|".contains(&c) { k = K::Op; }
            }
        }
        let e = e.min(n);
        if bad { errs += 1; }
        let text = &src[i..e];
        let text = if k == K::LineC { text.trim_end() } else { text };
        out.push(T { k, s: text, nl, sp, bad });
        i = e;
    }
    (out, errs)
}

// ====================================================================================================== document
const NONE: u32 = u32::MAX;
struct Doc<'a> {
    d: D,
    t: Vec<T<'a>>,
    sig: Vec<u32>,       // the tokens that are not comments
    pos: Vec<u32>,       // token → its place in `sig`
    up: String,          // upper-case copies of the words (ASCII, at most 24 letters — nothing longer is a keyword)
    ur: Vec<(u32, u8)>,
    wsum: Vec<u32>,      // running width of the tokens, to know whether a bracket fits on one line
    fsum: Vec<u32>,      // running count of what forbids that: comments, line breaks inside a token, semicolons
    mate: Vec<u32>,      // ( ↔ ), [ ↔ ], { ↔ }
}
impl<'a> Doc<'a> {
    fn new(src: &'a str, d: D) -> (Doc<'a>, u32) {
        let (t, errs) = lex(src, d);
        let n = t.len();
        let mut doc = Doc { d, sig: Vec::with_capacity(n), pos: vec![NONE; n], up: String::new(), ur: vec![(0, 0); n], wsum: vec![0; n + 1], fsum: vec![0; n + 1], mate: vec![NONE; n], t };
        let mut stack: Vec<usize> = vec![];
        for i in 0..n {
            let tk = doc.t[i];
            let c = matches!(tk.k, K::LineC | K::BlockC);
            if !c { doc.pos[i] = doc.sig.len() as u32; doc.sig.push(i as u32); }
            doc.wsum[i + 1] = doc.wsum[i] + if c { 0 } else { tk.s.len() as u32 + 1 };
            doc.fsum[i + 1] = doc.fsum[i] + (c || tk.k == K::Semi || tk.s.contains('\n')) as u32;
            match tk.k {
                K::Word if tk.s.len() <= 24 && tk.s.is_ascii() => {
                    let a = doc.up.len();
                    doc.up.push_str(tk.s);
                    doc.up[a..].make_ascii_uppercase();
                    doc.ur[i] = (a as u32, tk.s.len() as u8);
                }
                K::Open | K::SqOpen | K::BrOpen => stack.push(i),
                K::Close | K::SqClose | K::BrClose => {
                    if let Some(o) = stack.pop() { doc.mate[o] = i as u32; doc.mate[i] = o as u32; }
                }
                K::Semi => stack.clear(),
                _ => {}
            }
        }
        (doc, errs)
    }
    fn u(&self, i: usize) -> &str { let (a, l) = self.ur[i]; &self.up[a as usize..a as usize + l as usize] }
    fn width(&self, a: usize, b: usize) -> u32 { self.wsum[b + 1] - self.wsum[a] }
    fn plain(&self, a: usize, b: usize) -> bool { self.fsum[b + 1] == self.fsum[a] }
}

// ====================================================================================================== words
const H: u8 = 1; // a keyword wherever it stands
const S: u8 = 2; // a keyword only where `soft` says so — elsewhere it is somebody's column
const TY: u8 = 4; // the name of a type: upper-cased where a type is expected
fn class(w: &str) -> u8 {
    match w {
        "ALL" | "ALTER" | "AND" | "AS" | "BETWEEN" | "BY" | "CASE" | "CHECK" | "COLLATE" | "CONSTRAINT" | "CREATE" | "CROSS" | "CURRENT_DATE" | "CURRENT_TIME"
        | "CURRENT_TIMESTAMP" | "DEFAULT" | "DELETE" | "DISTINCT" | "DROP" | "ELSE" | "END" | "EXCEPT" | "EXISTS" | "FALSE" | "FOREIGN" | "FROM" | "GROUP" | "HAVING"
        | "IN" | "INNER" | "INSERT" | "INTERSECT" | "INTO" | "IS" | "JOIN" | "LIKE" | "NATURAL" | "NOT" | "NULL" | "ON" | "OR" | "ORDER" | "OUTER" | "PRIMARY"
        | "REFERENCES" | "SELECT" | "SET" | "TABLE" | "THEN" | "TRUE" | "UNION" | "UNIQUE" | "UPDATE" | "USING" | "VALUES" | "WHEN" | "WHERE" | "WITH" => H,
        "INT" | "INTEGER" | "SMALLINT" | "BIGINT" | "TINYINT" | "MEDIUMINT" | "DECIMAL" | "NUMERIC" | "NUMBER" | "FLOAT" | "REAL" | "DOUBLE" | "BOOLEAN" | "BOOL" | "BIT"
        | "CHAR" | "VARCHAR" | "VARCHAR2" | "NCHAR" | "NVARCHAR" | "NVARCHAR2" | "TEXT" | "TINYTEXT" | "MEDIUMTEXT" | "LONGTEXT" | "NTEXT" | "CLOB" | "NCLOB" | "BLOB"
        | "TINYBLOB" | "MEDIUMBLOB" | "LONGBLOB" | "BYTEA" | "BINARY" | "VARBINARY" | "RAW" | "DATETIME" | "DATETIME2" | "SMALLDATETIME" | "DATETIMEOFFSET"
        | "TIMESTAMPTZ" | "TIMETZ" | "JSON" | "JSONB" | "XML" | "UUID" | "UNIQUEIDENTIFIER" | "SERIAL" | "BIGSERIAL" | "SMALLSERIAL" | "MONEY" | "SMALLMONEY" | "ENUM"
        | "INT2" | "INT4" | "INT8" | "FLOAT4" | "FLOAT8" | "LONG" | "NATIONAL" | "ROWVERSION" | "SQL_VARIANT" | "IMAGE" | "SYSNAME" | "INET" | "CIDR" | "TSVECTOR"
        | "TSQUERY" | "BINARY_FLOAT" | "BINARY_DOUBLE" | "PLS_INTEGER" => TY,
        "DATE" | "TIME" | "TIMESTAMP" | "INTERVAL" | "YEAR" | "CHARACTER" | "UNSIGNED" | "SIGNED" | "VARYING" | "PRECISION" => S | TY,
        "ABORT" | "ACTION" | "ADD" | "AFTER" | "AGAINST" | "ALWAYS" | "ANALYSE" | "ANALYZE" | "ANY" | "APPLY" | "ASC" | "AT" | "ATOMIC" | "ATTACH" | "AUTOINCREMENT"
        | "AUTO_INCREMENT" | "BEFORE" | "BEGIN" | "CALL" | "CASCADE" | "CATCH" | "CHANGE" | "CHARSET" | "CHECKPOINT" | "CLUSTERED" | "COLUMN" | "COLUMNS" | "COMMENT"
        | "COMMIT" | "COMMITTED" | "CONCURRENTLY" | "CONFLICT" | "CONNECT" | "COPY" | "CSV" | "CUBE" | "CURRENT" | "DATA" | "DATABASE" | "DATABASES" | "DAY"
        | "DEALLOCATE" | "DECLARE" | "DEFERRABLE" | "DEFERRED" | "DEFINER" | "DELIMITER" | "DESC" | "DESCRIBE" | "DETACH" | "DETERMINISTIC" | "DISABLE" | "DISCARD"
        | "DISTINCTROW" | "DIV" | "DO" | "DOMAIN" | "DUPLICATE" | "EACH" | "ELSEIF" | "ELSIF" | "ENABLE" | "ENCLOSED" | "ENGINE" | "ENGINES" | "ERRORS" | "ESCAPE"
        | "ESCAPED" | "EVENTS" | "EXCEPTION" | "EXCLUDE" | "EXCLUSIVE" | "EXEC" | "EXECUTE" | "EXPLAIN" | "EXTENDED" | "EXTENSION" | "FAIL" | "FETCH" | "FIELDS" | "FILTER" | "FIRST"
        | "FOLLOWING" | "FOR" | "FORCE" | "FULL" | "FULLTEXT" | "FUNCTION" | "FUNCTIONS" | "GENERATED" | "GLOB" | "GLOBAL" | "GO" | "GRANT" | "GRANTS" | "GROUPING" | "GROUPS"
        | "HEADER" | "HOUR" | "IDENTITY" | "IF" | "IGNORE" | "ILIKE" | "IMMEDIATE" | "IMMUTABLE" | "INCLUDE" | "INDEX" | "INDEXES" | "INFILE" | "INITIALLY" | "INOUT"
        | "INSTEAD" | "INVOKER" | "ISNULL" | "ISOLATION" | "KEY" | "KEYS" | "LANGUAGE" | "LAST" | "LATERAL" | "LEFT" | "LEVEL" | "LIMIT" | "LINES" | "LISTEN" | "LOAD"
        | "LOCAL" | "LOCK" | "LOCKED" | "LOOP" | "MATCH" | "MATCHED" | "MATERIALIZED" | "MERGE" | "MICROSECOND" | "MINUS" | "MINUTE" | "MOD" | "MODIFY" | "MONTH"
        | "NAMES" | "NEXT" | "NO" | "NOCYCLE" | "NONCLUSTERED" | "NOTHING" | "NOTIFY" | "NOTNULL" | "NOWAIT" | "NULLS" | "OF" | "OFFSET" | "ONLY" | "OPTION"
        | "OPTIONALLY" | "ORDINALITY" | "OUT" | "OUTPUT" | "OVER" | "OWNER" | "PACKAGE" | "PARTIAL" | "PARTITION" | "PERCENT" | "PERSISTED" | "PIVOT" | "PLAN"
        | "POLICY" | "PRAGMA" | "PRECEDING" | "PREPARE" | "PRINT" | "PRIOR" | "PRIVILEGES" | "PROC" | "PROCEDURE" | "PROCESSLIST" | "QUALIFY" | "QUARTER" | "QUERY"
        | "RAISERROR" | "RANGE" | "READ" | "RECURSIVE" | "REFRESH" | "REGEXP" | "REINDEX" | "RELEASE" | "RENAME" | "REPEATABLE" | "REPLACE" | "RESET" | "RESTRICT"
        | "RETURN" | "RETURNING" | "RETURNS" | "REVOKE" | "RIGHT" | "RLIKE" | "ROLE" | "ROLLBACK" | "ROLLUP" | "ROW" | "ROWID" | "ROWS" | "SAVEPOINT" | "SCHEMA"
        | "SCHEMAS" | "SECOND" | "SECURITY" | "SEPARATOR" | "SEQUENCE" | "SEQUENCES" | "SERIALIZABLE" | "SESSION" | "SETOF" | "SETS" | "SHARE" | "SHOW" | "SIBLINGS"
        | "SIMILAR" | "SIMPLE" | "SKIP" | "SNAPSHOT" | "SOME" | "SOUNDS" | "SOURCE" | "SPATIAL" | "SQL_CALC_FOUND_ROWS" | "SQL_NO_CACHE" | "STABLE" | "START" | "STARTING"
        | "STATEMENT" | "STATUS" | "STDIN" | "STDOUT" | "STORED" | "STRAIGHT_JOIN" | "STRICT" | "SYMMETRIC" | "SYNONYM" | "TABLES" | "TABLESAMPLE" | "TABLESPACE"
        | "TARGET" | "TEMP" | "TEMPORARY" | "TERMINATED" | "THROW" | "TIES" | "TO" | "TOP" | "TRAN" | "TRANSACTION" | "TRIGGER" | "TRIGGERS" | "TRUNCATE" | "TRY"
        | "TYPE" | "UNBOUNDED" | "UNCOMMITTED" | "UNKNOWN" | "UNLOCK" | "UNLOGGED" | "UNPIVOT" | "USE" | "USER" | "VACUUM" | "VARIABLES" | "VERBOSE" | "VIEW"
        | "VIRTUAL" | "VOLATILE" | "WAITFOR" | "WARNINGS" | "WEEK" | "WHILE" | "WINDOW" | "WITHIN" | "WITHOUT" | "WORK" | "WRITE" | "XOR" | "ZEROFILL" | "ZONE" => S,
        _ => 0,
    }
}
/// Words that end a value or start a clause: a word in front of one of them is a name, not a command.
fn clause_word(w: &str) -> bool {
    matches!(w, "FROM" | "WHERE" | "AND" | "OR" | "AS" | "ON" | "GROUP" | "ORDER" | "HAVING" | "UNION" | "JOIN" | "LIMIT" | "INNER" | "LEFT" | "RIGHT" | "CROSS" | "SET"
        | "VALUES" | "IN" | "IS" | "LIKE" | "BETWEEN" | "THEN" | "ELSE" | "END" | "WHEN" | "ASC" | "DESC" | "INTO" | "USING" | "NOT" | "EXCEPT" | "INTERSECT")
}
/// After these, the next word names something (a table, a column, a constraint).
fn sets_slot(w: &str) -> bool {
    matches!(w, "TABLE" | "INDEX" | "VIEW" | "TRIGGER" | "FUNCTION" | "PROCEDURE" | "PROC" | "DATABASE" | "SCHEMA" | "SEQUENCE" | "DOMAIN" | "EXTENSION" | "ROLE"
        | "USER" | "POLICY" | "SYNONYM" | "PACKAGE" | "COLUMN" | "CONSTRAINT" | "TO" | "REFERENCES" | "ON" | "MODIFY" | "CHANGE" | "RENAME" | "ADD" | "EXISTS" | "ONLY"
        | "CONCURRENTLY" | "COLLATE" | "TABLESPACE")
}
/// Keywords that may stand where a name is expected.
fn slot_word(w: &str) -> bool {
    matches!(w, "IF" | "NOT" | "EXISTS" | "ONLY" | "CONCURRENTLY" | "COLUMN" | "CONSTRAINT" | "PRIMARY" | "FOREIGN" | "UNIQUE" | "CHECK" | "INDEX" | "KEY" | "FULLTEXT"
        | "SPATIAL" | "PARTITION" | "TO" | "DEFAULT" | "DELETE" | "UPDATE" | "COMMIT" | "TABLE" | "SCHEMA" | "DATABASE" | "ALL" | "FUNCTION" | "SEQUENCE" | "AS" | "SET" | "ON"
        | "VIEW" | "CONFLICT" | "DUPLICATE" | "TRIGGER" | "PROCEDURE")
}
fn is_object(w: &str) -> bool {
    matches!(w, "TABLE" | "INDEX" | "VIEW" | "TRIGGER" | "FUNCTION" | "PROCEDURE" | "PROC" | "DATABASE" | "SCHEMA" | "SEQUENCE" | "TYPE" | "DOMAIN" | "EXTENSION" | "ROLE"
        | "USER" | "POLICY" | "SYNONYM" | "PACKAGE" | "SESSION" | "TABLESPACE")
}

// ====================================================================================================== analysis
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Role {
    No,
    Part,     // a further word of a phrase (GROUP *BY*, LEFT *OUTER JOIN*)
    Top,      // a clause: on its own line; what follows is indented under it
    Line,     // starts a line; what follows stays on it (ON CONFLICT …, FOR UPDATE, WHEN MATCHED …)
    SetOp,    // UNION, EXCEPT …: on its own line between two queries
    Join,     // starts a line inside the clause (JOIN …)
    AndOr,    // AND / OR: starts a line
    Hang,     // the first action of an ALTER TABLE with several actions
    CaseOpen, CaseWhen, CaseEnd,
    WinBrk,   // PARTITION BY / ORDER BY / ROWS inside OVER ( … )
    CommaNl,  // a comma that ends a line
}
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Pre { No, Start, Body, BlockEnd, Mid, Line }
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Post { No, BlockOpen, Cont, Stmt }
const P_LIST: u8 = 0;
const P_QUERY: u8 = 1;
const P_WIN: u8 = 2;
const P_SQ: u8 = 3;
const P_DEF: u8 = 4; // for the layout only: a list that is not squeezed onto the line
const P_STMT: u8 = 9;
const B_BEGIN: u8 = 0;
const B_IF: u8 = 1;
const B_LOOP: u8 = 2;

struct An {
    kw: Vec<bool>,     // this word is a keyword
    unary: Vec<bool>,  // this − + ~ is a sign
    role: Vec<Role>,
    until: Vec<u32>,   // last token of the phrase a Top / SetOp / Join starts
    pre: Vec<Pre>,
    post: Vec<Post>,
    pk: Vec<u8>,       // for an opening bracket: what it holds
    cmate: Vec<u32>,   // CASE → its END
}
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Cl { None, Select, From, Cond, Limit, Set, With, Window, Flat, Other }
#[derive(Clone)]
struct Fr<'b> {
    kind: u8,
    def: bool,       // a list of definitions: CREATE TABLE t ( … ), the parameters of a procedure
    query: bool,     // clause keywords are live
    first: &'b str,  // first keyword of the statement
    obj: &'b str,    // CREATE / ALTER / DROP what
    head: &'b str,   // the word in front of the bracket
    ntok: u32,
    item: u32,       // tokens since the last comma
    cur: Cl,
    seen_select: bool, has_update: bool, merge: bool, merge_when: bool, insert_all: bool, cte: bool, connect: bool,
    between: u32,
    cases: Vec<usize>,
    slot: bool, named: bool, def_done: bool, ddl: bool, trigger: bool,
    hang: u8,
}
impl<'b> Fr<'b> {
    fn new(kind: u8) -> Fr<'b> {
        Fr { kind, def: false, query: kind == P_QUERY, first: "", obj: "", head: "", ntok: 0, item: 0, cur: Cl::None, seen_select: false, has_update: false, merge: false,
            merge_when: false, insert_all: false, cte: false, connect: false, between: 0, cases: vec![], slot: false, named: false, def_done: false, ddl: false, trigger: false, hang: 0 }
    }
}
struct Az<'a, 'b> { d: &'b Doc<'a>, r: An, p: usize, fr: Vec<Fr<'b>>, blocks: Vec<u8>, fresh_at: usize }

impl<'a, 'b> Az<'a, 'b> {
    // ---- looking around: k is relative to the current token, counted in tokens that are not comments
    fn ti(&self, k: isize) -> Option<usize> {
        let q = self.p as isize + k;
        if q < 0 { None } else { self.d.sig.get(q as usize).map(|&x| x as usize) }
    }
    fn kd(&self, k: isize) -> Option<K> { self.ti(k).map(|i| self.d.t[i].k) }
    fn w(&self, k: isize) -> &'b str {
        let d: &'b Doc<'a> = self.d;
        match self.ti(k) { Some(i) if d.t[i].k == K::Word => d.u(i), _ => "" }
    }
    /// the word at k, if it has been found to be a keyword (only behind the current token)
    fn pk(&self, k: isize) -> &'b str {
        let d: &'b Doc<'a> = self.d;
        match self.ti(k) { Some(i) if self.r.kw[i] => d.u(i), _ => "" }
    }
    fn raw(&self, k: isize) -> &'a str { self.ti(k).map_or("", |i| self.d.t[i].s) }
    fn f(&self) -> &Fr<'b> { self.fr.last().unwrap() }
    fn top(&self) -> bool { self.fr.len() == 1 }
    /// a value (a name, a literal, a closing bracket) ends just before this token
    fn value_before(&self) -> bool {
        match self.ti(-1) {
            None => false,
            Some(i) => match self.d.t[i].k {
                K::QId | K::Str | K::Num | K::Var | K::Close | K::SqClose | K::BrClose | K::Other => true,
                K::Word => !self.r.kw[i] || matches!(self.d.u(i), "END" | "NULL" | "TRUE" | "FALSE" | "CURRENT_DATE" | "CURRENT_TIME" | "CURRENT_TIMESTAMP"),
                _ => false,
            },
        }
    }
    /// the token before leaves a value open: a name or a literal has to follow
    fn value_wanted(&self) -> bool {
        match self.ti(-1) {
            None => true,
            Some(i) => match self.d.t[i].k {
                K::Comma | K::Open | K::SqOpen | K::Op => true,
                K::Word => self.r.kw[i] && matches!(self.d.u(i), "SELECT" | "DISTINCT" | "ALL" | "WHERE" | "AND" | "OR" | "NOT" | "ON" | "BY" | "HAVING" | "WHEN" | "THEN" | "ELSE"
                    | "CASE" | "SET" | "BETWEEN" | "LIKE" | "ILIKE" | "IN" | "IS" | "RETURNING" | "LIMIT" | "OFFSET" | "FROM" | "JOIN" | "INTO" | "UPDATE" | "TABLE" | "USING" | "AS"
                    | "DEFAULT" | "RETURN" | "VALUES" | "REFERENCES" | "IF" | "WHILE" | "PRINT" | "TOP" | "UNION" | "EXCEPT" | "INTERSECT"),
                _ => false,
            },
        }
    }
    /// what follows can only come after a value
    fn value_closed_after(&self) -> bool {
        match self.ti(1) {
            None => true,
            Some(i) => match self.d.t[i].k {
                K::Semi | K::Comma | K::Close | K::SqClose | K::Dot | K::Op => true,
                K::Word => clause_word(self.d.u(i)),
                _ => false,
            },
        }
    }
    /// between a token that wants a value and one that closes it: this word is a name
    fn name_pos(&self) -> bool { self.value_wanted() && self.value_closed_after() }
    fn value_starts(&self, k: isize) -> bool {
        match self.kd(k) {
            Some(K::Word) => !clause_word(self.w(k)),
            Some(K::QId | K::Str | K::Num | K::Var | K::Open) => true,
            Some(K::Op) => matches!(self.raw(k), "-" | "+" | "~"),
            _ => false,
        }
    }
    /// the keyword in front of the value (or the bracket) that ends just before this token
    fn before_value(&self) -> &'b str {
        let d: &'b Doc<'a> = self.d;
        match self.ti(-1) {
            Some(i) if d.t[i].k == K::Close && d.mate[i] != NONE => {
                let q = d.pos[d.mate[i] as usize] as usize;
                if q == 0 { "" } else { let j = d.sig[q - 1] as usize; if self.r.kw[j] { d.u(j) } else { "" } }
            }
            _ => self.pk(-2),
        }
    }
    fn type_before(&self) -> bool { self.ti(-1).map_or(false, |i| self.r.kw[i] && class(self.d.u(i)) & TY != 0) }
    // absolute positions in `sig`
    fn wa(&self, q: usize) -> &'b str {
        let d: &'b Doc<'a> = self.d;
        match d.sig.get(q) { Some(&i) if d.t[i as usize].k == K::Word => d.u(i as usize), _ => "" }
    }
    fn ka(&self, q: usize) -> Option<K> { self.d.sig.get(q).map(|&i| self.d.t[i as usize].k) }
    /// makes the word at `q` part of the phrase that starts at the current token; returns its token
    fn mark(&mut self, q: usize) -> usize {
        let i = self.d.sig[q] as usize;
        if self.d.t[i].k == K::Word { self.r.kw[i] = true; self.r.role[i] = Role::Part; }
        i
    }
    fn count(&mut self, i: usize) {
        let k = self.d.t[i].k;
        let f = self.fr.last_mut().unwrap();
        if f.slot && k != K::Word && k != K::Dot { f.slot = false; if matches!(k, K::QId | K::Var) { f.named = true; } }
        f.ntok += 1;
        f.item += 1;
    }

    // ---------------------------------------------------------------- is this word a keyword here?
    fn hard(&self, w: &str) -> bool {
        match w {
            // MySQL and SQLite let a column be called "end": where a value is wanted, it is that column
            "END" => match self.ti(-1) {
                None => true,
                Some(i) => match self.d.t[i].k {
                    K::Comma | K::Open | K::Op => false,
                    K::Word => !(self.r.kw[i] && (matches!(self.d.u(i), "SELECT" | "DISTINCT" | "WHERE" | "AND" | "OR" | "NOT" | "ON" | "BY" | "HAVING" | "WHEN" | "SET" | "BETWEEN" | "LIKE" | "IN" | "RETURNING" | "FROM" | "JOIN" | "INTO" | "UPDATE" | "TABLE" | "USING")
                        // CASE … THEN end END: a value has to follow THEN and ELSE
                        || (matches!(self.d.u(i), "THEN" | "ELSE") && !self.f().cases.is_empty()))),
                    _ => true,
                },
            },
            _ => true,
        }
    }
    /// a window frame follows: ROWS BETWEEN …, RANGE UNBOUNDED PRECEDING, ROWS 3 PRECEDING
    fn frame_at(&self, k: isize) -> bool {
        if self.w(k) == "BETWEEN" { return matches!(self.w(k + 1), "UNBOUNDED" | "CURRENT") || matches!(self.w(k + 2), "PRECEDING" | "FOLLOWING") || matches!(self.w(k + 3), "PRECEDING" | "FOLLOWING"); }
        matches!(self.w(k), "UNBOUNDED" | "CURRENT") || (matches!(self.kd(k), Some(K::Num | K::Var | K::Str)) && matches!(self.w(k + 1), "PRECEDING" | "FOLLOWING"))
    }
    fn soft(&self, w: &str, i: usize) -> bool {
        let d = self.d;
        let tk = &d.t[i];
        let f = self.f();
        let s0 = &self.fr[0];
        let (p1, n1, n2) = (self.pk(-1), self.w(1), self.w(2));
        let (pkd, nkd) = (self.kd(-1), self.kd(1));
        let vb = self.value_before();
        let top = self.top();
        let first = s0.first;
        let start = top && s0.ntok == 0;
        // can stand at the start of a statement that has no semicolon before it: first on its line, after
        // something complete, in front of something it can work on
        let arg = matches!(nkd, Some(K::Word | K::QId | K::Var | K::Str | K::Num | K::Open)) && !clause_word(n1);
        let line = top && tk.nl > 0 && s0.ntok > 0 && (vb || matches!(p1, "ON" | "OFF" | "END" | "TRANSACTION" | "TRAN" | "WORK" | "TRY" | "CATCH"));
        let alone = match self.ti(1) { None => true, Some(j) => d.t[j].k == K::Semi || d.t[j].nl > 0 };
        let begins = start || (line && arg);
        let begins0 = begins || (line && alone);
        let cond = top && matches!(first, "IF" | "WHILE") && vb; // IF @n > 0 ROLLBACK
        let branch = top && f.cases.is_empty() && matches!(p1, "THEN" | "ELSE"); // IF … THEN ROLLBACK
        let set = top && first == "SET" && s0.ntok == 1 && p1 == "SET" && nkd != Some(K::Op); // the word after SET in a SET statement
        let ddl = top && s0.ddl;
        let coldef = (f.def && f.item > 0) || (ddl && first == "ALTER");
        let closed = matches!(nkd, None | Some(K::Semi | K::Comma | K::Close));
        match w {
            // ---- joins and order
            "LEFT" | "RIGHT" => matches!(n1, "JOIN" | "OUTER" | "SEMI" | "ANTI"),
            "FULL" => matches!(n1, "JOIN" | "OUTER") || matches!(p1, "MATCH" | "SHOW" | "VACUUM"),
            "ASC" | "DESC" => (vb && !matches!(nkd, Some(K::Op | K::Dot | K::Open))) || (w == "DESC" && start && arg),
            "ANY" | "SOME" => nkd == Some(K::Open) && (pkd == Some(K::Op) || matches!(p1, "LIKE" | "ILIKE" | "NOT")),
            "IF" => matches!(n1, "EXISTS" | "NOT") || begins || branch || (top && matches!(p1, "END" | "BEGIN")),
            // ---- the end of a query
            "LIMIT" => matches!(nkd, Some(K::Num | K::Var)) || n1 == "ALL" || (vb && matches!(nkd, Some(K::Word | K::Open | K::Op))),
            "OFFSET" => (!self.value_wanted() || p1 == "ALL") && (matches!(nkd, Some(K::Num | K::Var | K::Open)) || (nkd == Some(K::Word) && matches!(n2, "ROWS" | "ROW"))),
            "FETCH" => matches!(n1, "FIRST" | "NEXT") || begins,
            "FIRST" | "NEXT" | "LAST" => matches!(p1, "FETCH" | "NULLS") || (w == "FIRST" && ddl && first == "ALTER" && vb && closed) || (w == "NEXT" && n1 == "VALUE"),
            "NULLS" => matches!(n1, "FIRST" | "LAST") || matches!(p1, "IGNORE" | "RESPECT"),
            "ROW" | "ROWS" => {
                matches!(p1, "CURRENT" | "EACH")
                    || (matches!(p1, "FIRST" | "NEXT") && n1 == "ONLY")
                    || (matches!(pkd, Some(K::Num | K::Var | K::Close)) && (matches!(self.pk(-2), "FIRST" | "NEXT" | "OFFSET") || matches!(n1, "ONLY" | "FETCH") || self.before_value() == "OFFSET"))
                    || (w == "ROWS" && self.frame_at(1))
            }
            "ONLY" => matches!(p1, "ROW" | "ROWS" | "READ") || (d.d == D::Pg && matches!(p1, "FROM" | "TABLE") && matches!(nkd, Some(K::Word | K::QId))),
            "TIES" => matches!(p1, "WITH" | "EXCLUDE"),
            "EXCLUDE" => matches!(p1, "PRECEDING" | "FOLLOWING" | "ROW") && matches!(n1, "TIES" | "CURRENT" | "GROUP" | "NO"),
            // ---- windows
            "UNBOUNDED" => matches!(n1, "PRECEDING" | "FOLLOWING"),
            "PRECEDING" | "FOLLOWING" => p1 == "UNBOUNDED" || (vb && (matches!(nkd, None | Some(K::Close)) || matches!(n1, "AND" | "EXCLUDE"))),
            "CURRENT" => n1 == "ROW" || (set && n1 == "SCHEMA"),
            "RANGE" | "GROUPS" => self.frame_at(1),
            "OVER" => pkd == Some(K::Close) && (nkd == Some(K::Open) || (nkd == Some(K::Word) && !clause_word(n1))),
            "FILTER" => pkd == Some(K::Close) && nkd == Some(K::Open) && n2 == "WHERE",
            "WITHIN" => n1 == "GROUP",
            "PARTITION" => n1 == "BY",
            "WINDOW" => !self.value_wanted() && nkd == Some(K::Word) && n2 == "AS",
            "RETURNING" => !self.value_wanted() && (self.value_starts(1) || self.raw(1) == "*" || n1 == "END"),
            // ---- operators that are words
            "ILIKE" | "REGEXP" | "RLIKE" | "GLOB" | "XOR" | "DIV" | "MOD" => (vb || p1 == "NOT") && self.value_starts(1),
            "MATCH" => ((vb || p1 == "NOT") && self.value_starts(1) && nkd != Some(K::Open)) || (coldef && matches!(n1, "FULL" | "SIMPLE" | "PARTIAL")) || (nkd == Some(K::Open) && self.after_group(1) == "AGAINST"),
            "AGAINST" => pkd == Some(K::Close) && nkd == Some(K::Open),
            "SIMPLE" | "PARTIAL" => p1 == "MATCH",
            "SIMILAR" => n1 == "TO",
            "SOUNDS" => n1 == "LIKE" && vb,
            "FORCE" => matches!(n1, "INDEX" | "KEY") && vb,
            "TO" => matches!(p1, "SIMILAR" | "RENAME" | "OWNER" | "ROLLBACK" | "TRANSACTION" | "WORK" | "YEAR" | "DAY" | "HOUR" | "MINUTE") || (top && vb && matches!(first, "ALTER" | "RENAME" | "GRANT" | "COPY")),
            "ESCAPE" => vb && matches!(nkd, Some(K::Str | K::Var)),
            "ISNULL" | "NOTNULL" => vb && nkd != Some(K::Open) && self.value_closed_after(),
            "LATERAL" => (matches!(p1, "JOIN" | "FROM" | "APPLY") || (pkd == Some(K::Comma) && f.cur == Cl::From)) && (nkd == Some(K::Open) || (matches!(nkd, Some(K::Word | K::QId)) && !clause_word(n1))),
            "RECURSIVE" => matches!(p1, "WITH" | "CREATE"),
            "MATERIALIZED" => (p1 == "AS" && nkd == Some(K::Open)) || (p1 == "NOT" && self.pk(-2) == "AS") || matches!(p1, "CREATE" | "DROP" | "REFRESH" | "ALTER"),
            "ORDINALITY" => matches!(p1, "WITH" | "FOR"),
            "SYMMETRIC" => p1 == "BETWEEN",
            "UNKNOWN" => matches!(p1, "IS" | "NOT"),
            "TOP" => matches!(p1, "SELECT" | "DELETE" | "UPDATE" | "INSERT" | "DISTINCT" | "ALL") && matches!(nkd, Some(K::Num | K::Open | K::Var)),
            "PERCENT" => vb && self.before_value() == "TOP",
            "APPLY" => matches!(p1, "CROSS" | "OUTER"),
            "PIVOT" | "UNPIVOT" => vb && nkd == Some(K::Open),
            "OPTION" => (vb && nkd == Some(K::Open)) || matches!(p1, "GRANT" | "CHECK"),
            "OUTPUT" => matches!(n1, "INSERTED" | "DELETED") || self.raw(1).eq_ignore_ascii_case("$action") || (top && matches!(first, "CREATE" | "ALTER" | "EXEC" | "EXECUTE" | "DECLARE") && vb && (closed || n1 == "AS")),
            "STRAIGHT_JOIN" | "SQL_CALC_FOUND_ROWS" | "SQL_NO_CACHE" | "DISTINCTROW" | "AUTOINCREMENT" | "AUTO_INCREMENT" | "NOCYCLE" | "UNLOGGED" | "ELSEIF" | "ELSIF"
            | "NONCLUSTERED" | "CLUSTERED" | "DEFERRABLE" | "TABLESAMPLE" | "QUALIFY" => !self.name_pos(),
            "CONCURRENTLY" => matches!(p1, "INDEX" | "VIEW"),
            "SEPARATOR" => !self.value_wanted() && nkd == Some(K::Str),
            "ROLLUP" | "CUBE" => (nkd == Some(K::Open) && (p1 == "BY" || pkd == Some(K::Comma))) || p1 == "WITH",
            "GROUPING" => n1 == "SETS",
            "SETS" => p1 == "GROUPING",
            "SIBLINGS" => p1 == "ORDER",
            "CONNECT" => n1 == "BY",
            "PRIOR" => f.connect && (matches!(p1, "BY" | "AND" | "OR" | "NOCYCLE") || pkd == Some(K::Op)) && matches!(nkd, Some(K::Word | K::QId)),
            "START" => n1 == "WITH" || (begins && n1 == "TRANSACTION"),
            "MINUS" => vb && (n1 == "SELECT" || nkd == Some(K::Open)),
            "AT" => (n1 == "TIME" && n2 == "ZONE") || n1 == "LOCAL",
            "ZONE" => p1 == "TIME",
            "WITHOUT" => (n1 == "TIME" && n2 == "ZONE") || matches!(n1, "ROWID" | "OIDS"),
            "ROWID" => p1 == "WITHOUT",
            "STRICT" => top && first == "CREATE" && matches!(pkd, Some(K::Close | K::Comma)),
            "SKIP" => n1 == "LOCKED",
            "LOCKED" => p1 == "SKIP",
            "NOWAIT" => (vb || matches!(p1, "UPDATE" | "SHARE")) && matches!(nkd, None | Some(K::Semi | K::Close)),
            "SHARE" => matches!(p1, "FOR" | "KEY"),
            "OF" => matches!(p1, "UPDATE" | "SHARE" | "INSTEAD" | "AS" | "TYPE"),
            "KEY" => matches!(p1, "PRIMARY" | "FOREIGN" | "UNIQUE" | "DUPLICATE" | "NO" | "FULLTEXT" | "SPATIAL" | "FORCE" | "USE" | "IGNORE") || (p1 == "FOR" && n1 == "SHARE") || (ddl && s0.slot && self.names_index()),
            "FOR" => {
                matches!(n1, "UPDATE" | "SHARE" | "NO" | "KEY" | "JSON" | "XML" | "EACH" | "BROWSE" | "READ" | "SYSTEM_TIME" | "ORDINALITY" | "PORTION")
                    || start
                    || (top && matches!(first, "DECLARE" | "OPEN") && matches!(n1, "SELECT" | "WITH"))
                    || (vb && matches!(f.head, "SUBSTRING" | "SUBSTR" | "OVERLAY" | "PIVOT" | "UNPIVOT"))
                    || (matches!(p1, "INDEX" | "KEY") && matches!(n1, "JOIN" | "ORDER" | "GROUP"))
                    || (ddl && vb && matches!(n1, "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "ALL" | "VALUES"))
            }
            "EACH" => p1 == "FOR",
            "STATEMENT" => p1 == "EACH",
            "INSTEAD" => n1 == "OF" || p1 == "DO",
            "BEFORE" | "AFTER" => {
                (ddl && s0.obj == "TRIGGER" && matches!(n1, "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE"))
                    || (w == "AFTER" && ddl && first == "ALTER" && vb && matches!(nkd, Some(K::Word | K::QId)) && matches!(self.kd(2), None | Some(K::Comma | K::Semi)))
            }
            // ---- changing data
            "REPLACE" => (start && nkd != Some(K::Open)) || (p1 == "OR" && matches!(self.pk(-2), "CREATE" | "INSERT" | "UPDATE")) || p1 == "CONFLICT",
            "IGNORE" => matches!(p1, "INSERT" | "UPDATE" | "DELETE" | "OR" | "CONFLICT") || n1 == "NULLS" || (vb && matches!(n1, "INDEX" | "KEY")) || (top && first == "LOAD" && matches!(nkd, Some(K::Num))),
            "CONFLICT" => p1 == "ON",
            "NOTHING" => p1 == "DO",
            "DO" => matches!(n1, "NOTHING" | "UPDATE" | "INSTEAD" | "ALSO") || start || (top && first == "WHILE" && vb),
            "DUPLICATE" => p1 == "ON" && n1 == "KEY",
            "MATCHED" => f.merge && matches!(p1, "WHEN" | "NOT"),
            "SOURCE" | "TARGET" => p1 == "BY" && self.pk(-2) == "MATCHED",
            "ABORT" | "FAIL" => (p1 == "OR" && matches!(self.pk(-2), "INSERT" | "UPDATE")) || p1 == "CONFLICT" || (w == "ABORT" && begins0),
            // ---- transactions
            "ROLLBACK" => begins0 || cond || branch || (p1 == "OR" && matches!(self.pk(-2), "INSERT" | "UPDATE")) || p1 == "CONFLICT",
            "BEGIN" => begins0 || line || branch || (top && matches!(p1, "LOOP" | "DO" | "ROW" | "STATEMENT" | "DETERMINISTIC" | "TRY" | "CATCH")) || (top && vb && matches!(first, "CREATE" | "ALTER" | "IF" | "WHILE" | "ELSE" | "FOR")),
            "COMMIT" => begins0 || cond || branch || p1 == "ON",
            "SAVEPOINT" => begins || matches!(p1, "TO" | "RELEASE"),
            "TRANSACTION" | "TRAN" | "WORK" => (top && matches!(p1, "BEGIN" | "COMMIT" | "ROLLBACK" | "START" | "END" | "RELEASE")) || set,
            "ISOLATION" => n1 == "LEVEL",
            "LEVEL" => p1 == "ISOLATION",
            "READ" => p1 == "REPEATABLE" || matches!(n1, "COMMITTED" | "UNCOMMITTED" | "ONLY" | "WRITE"),
            "COMMITTED" | "UNCOMMITTED" | "WRITE" => p1 == "READ",
            "REPEATABLE" => n1 == "READ",
            "SERIALIZABLE" | "SNAPSHOT" => p1 == "LEVEL",
            "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE" => matches!(p1, "INITIALLY" | "BEGIN") || (w == "IMMEDIATE" && p1 == "EXECUTE"),
            "INITIALLY" => matches!(n1, "DEFERRED" | "IMMEDIATE"),
            // ---- commands
            "USE" => begins || (vb && matches!(n1, "INDEX" | "KEY")),
            "PRAGMA" | "REINDEX" | "ATTACH" | "DETACH" | "SHOW" | "DESCRIBE" | "CALL" | "TRUNCATE" | "REVOKE" | "COPY" | "LOCK" | "UNLOCK" | "RESET" | "LOAD" | "PRINT" | "RAISERROR"
            | "PREPARE" | "DEALLOCATE" | "MERGE" | "LISTEN" | "NOTIFY" | "REFRESH" | "WAITFOR" | "EXPLAIN" | "RELEASE" | "DELIMITER" => begins || (cond && arg && matches!(w, "PRINT" | "RAISERROR" | "TRUNCATE")),
            "WHILE" => begins || p1 == "END",
            "VACUUM" | "CHECKPOINT" | "THROW" | "DISCARD" => begins0 || (cond && w == "THROW"),
            "GRANT" => begins || n1 == "OPTION",
            "DECLARE" => begins || (top && nkd == Some(K::Var) && !self.value_wanted()),
            "EXEC" => begins || (cond && arg) || branch,
            "EXECUTE" => begins || matches!(n1, "FUNCTION" | "PROCEDURE" | "IMMEDIATE") || branch,
            "RENAME" => begins || (ddl && first == "ALTER" && (vb || pkd == Some(K::Comma))),
            "ANALYZE" | "ANALYSE" | "VERBOSE" | "EXTENDED" => (w != "EXTENDED" && begins0) || matches!(p1, "EXPLAIN" | "ANALYZE" | "VACUUM" | "VERBOSE"),
            "QUERY" => p1 == "EXPLAIN" && n1 == "PLAN",
            "PLAN" => p1 == "QUERY",
            "RETURN" => start || line || cond || branch || (top && p1 == "BEGIN"),
            "RETURNS" => top && matches!(first, "CREATE" | "ALTER") && vb,
            "GO" => {
                matches!(d.d, D::Ms | D::Std) && top
                    && (((tk.nl > 0 || self.p == 0) && alone && (start || !self.value_wanted()))
                        || (start && matches!(n1, "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CREATE" | "ALTER" | "DROP" | "DECLARE" | "EXEC" | "USE" | "SET" | "IF" | "PRINT" | "BEGIN" | "WITH" | "MERGE" | "TRUNCATE" | "GRANT")))
            }
            "EXCEPTION" => start && n1 == "WHEN" && self.blocks.last() == Some(&B_BEGIN),
            "LOOP" => top && (start || matches!(first, "FOR" | "WHILE") || p1 == "END"),
            "TRY" | "CATCH" => matches!(p1, "BEGIN" | "END"),
            // ---- definitions
            "TEMPORARY" | "TEMP" => matches!(p1, "CREATE" | "GLOBAL" | "LOCAL" | "DROP"),
            "GLOBAL" | "LOCAL" => (p1 == "CREATE" && matches!(n1, "TEMPORARY" | "TEMP")) || (set && nkd == Some(K::Word)) || (w == "LOCAL" && matches!(p1, "DATA" | "AT")),
            "SESSION" => (set && nkd == Some(K::Word)) || p1 == "ALTER",
            "INDEX" => matches!(p1, "CREATE" | "UNIQUE" | "DROP" | "ALTER" | "FULLTEXT" | "SPATIAL" | "CLUSTERED" | "NONCLUSTERED" | "RENAME" | "FORCE" | "USE" | "IGNORE") || (p1 == "ADD" && self.names_index()),
            "VIEW" => matches!(p1, "CREATE" | "REPLACE" | "DROP" | "ALTER" | "MATERIALIZED" | "TEMP" | "TEMPORARY" | "RECURSIVE"),
            "TRIGGER" => matches!(p1, "CREATE" | "REPLACE" | "DROP" | "ALTER" | "TEMP" | "TEMPORARY" | "CONSTRAINT" | "ENABLE" | "DISABLE"),
            "FUNCTION" | "PROCEDURE" | "PROC" => matches!(p1, "CREATE" | "REPLACE" | "DROP" | "ALTER" | "EXECUTE"),
            "DATABASE" | "SCHEMA" | "SEQUENCE" | "EXTENSION" | "ROLE" | "USER" | "DOMAIN" | "POLICY" | "SYNONYM" | "PACKAGE" | "TABLESPACE" => {
                matches!(p1, "CREATE" | "REPLACE" | "DROP" | "ALTER" | "ATTACH" | "DETACH")
                    || (w == "SCHEMA" && (matches!(p1, "IN" | "CURRENT") || (p1 == "ON" && matches!(first, "GRANT" | "REVOKE" | "COMMENT"))))
                    || (w == "ROLE" && set)
            }
            "TYPE" => matches!(p1, "CREATE" | "DROP" | "DATA") || (ddl && first == "ALTER" && s0.ntok > 2 && (vb || p1 == "ALTER") && nkd == Some(K::Word)),
            "COLUMN" => matches!(p1, "ADD" | "DROP" | "ALTER" | "RENAME" | "MODIFY" | "CHANGE" | "ON"),
            "ADD" | "MODIFY" | "CHANGE" => ddl && first == "ALTER" && (vb || pkd == Some(K::Comma)),
            "OWNER" => n1 == "TO",
            "CASCADE" | "RESTRICT" => matches!(p1, "DELETE" | "UPDATE") || (top && matches!(first, "DROP" | "TRUNCATE" | "ALTER" | "REVOKE") && vb && closed),
            "NO" => matches!(n1, "ACTION" | "KEY"),
            "ACTION" => p1 == "NO",
            "GENERATED" => matches!(n1, "ALWAYS" | "BY"),
            "ALWAYS" => p1 == "GENERATED",
            "IDENTITY" => matches!(p1, "AS" | "DEFAULT") || (f.def && f.item > 0),
            "STORED" | "VIRTUAL" | "PERSISTED" => (coldef && pkd == Some(K::Close)) || (w == "VIRTUAL" && p1 == "CREATE"),
            "ENGINE" | "CHARSET" => ddl && self.raw(1) == "=",
            "CHARACTER" => matches!(n1, "SET" | "VARYING"),
            "VARYING" => p1 == "CHARACTER",
            "PRECISION" => p1 == "DOUBLE",
            "UNSIGNED" | "SIGNED" | "ZEROFILL" => self.type_before() || class(self.before_value()) & TY != 0,
            "COMMENT" => (begins && n1 == "ON") || ((coldef || ddl) && nkd == Some(K::Str)) || (ddl && self.raw(1) == "=" && self.kd(2) == Some(K::Str)),
            "INCLUDE" => ddl && pkd == Some(K::Close) && nkd == Some(K::Open),
            "FULLTEXT" | "SPATIAL" => matches!(n1, "INDEX" | "KEY"),
            "LANGUAGE" => top && matches!(first, "CREATE" | "ALTER" | "DO") && matches!(nkd, Some(K::Word | K::Str)),
            "PRIVILEGES" => p1 == "ALL",
            "TABLES" | "SEQUENCES" | "FUNCTIONS" => (p1 == "ALL" && matches!(first, "GRANT" | "REVOKE")) || (w == "TABLES" && matches!(p1, "SHOW" | "FULL" | "LOCK" | "UNLOCK")),
            "COLUMNS" | "DATABASES" | "SCHEMAS" | "INDEXES" | "KEYS" | "STATUS" | "VARIABLES" | "PROCESSLIST" | "GRANTS" | "WARNINGS" | "ERRORS" | "ENGINES" | "TRIGGERS" | "EVENTS" => {
                top && first == "SHOW" && matches!(p1, "SHOW" | "FULL" | "GLOBAL" | "SESSION")
            }
            "NAMES" => set,
            "DATA" => (p1 == "SET" && n1 == "TYPE" && ddl) || p1 == "LOAD",
            "INFILE" | "TERMINATED" | "ENCLOSED" | "OPTIONALLY" | "ESCAPED" | "LINES" | "FIELDS" | "STARTING" => top && first == "LOAD",
            "STDIN" | "STDOUT" | "CSV" | "HEADER" => top && first == "COPY",
            "IMMUTABLE" | "STABLE" | "VOLATILE" | "DETERMINISTIC" => top && first == "CREATE" && matches!(s0.obj, "FUNCTION" | "PROCEDURE"),
            "SECURITY" => matches!(n1, "DEFINER" | "INVOKER"),
            "DEFINER" | "INVOKER" => p1 == "SECURITY",
            "ATOMIC" => p1 == "BEGIN",
            "SETOF" => p1 == "RETURNS",
            "OUT" | "INOUT" => f.def && f.item <= 1 && matches!(nkd, Some(K::Word | K::Var)),
            "ENABLE" | "DISABLE" => ddl && first == "ALTER" && matches!(n1, "TRIGGER" | "ROW" | "KEYS" | "CONSTRAINT" | "RULE" | "VALIDATE" | "NOVALIDATE"),
            // ---- dates and times
            "INTERVAL" => nkd == Some(K::Str) || (matches!(nkd, Some(K::Num | K::Var | K::Open)) && !vb),
            "DATE" | "TIMESTAMP" => nkd == Some(K::Str) && !vb,
            "TIME" => (nkd == Some(K::Str) && !vb) || (matches!(p1, "AT" | "WITH" | "WITHOUT") && n1 == "ZONE"),
            "DAY" | "HOUR" | "MINUTE" | "SECOND" | "MONTH" | "YEAR" | "WEEK" | "QUARTER" | "MICROSECOND" => {
                (matches!(pkd, Some(K::Num | K::Str | K::Var | K::Close)) && (self.pk(-2) == "INTERVAL" || self.before_value() == "INTERVAL")) || (p1 == "TO" && matches!(self.pk(-2), "YEAR" | "DAY" | "HOUR" | "MINUTE"))
            }
            _ => false,
        }
    }
    /// keywords that can follow AS; any other word there is the name being given
    fn after_as(&self, w: &str) -> bool {
        match w {
            "SELECT" | "WITH" | "VALUES" | "INSERT" | "UPDATE" | "DELETE" | "MERGE" | "TABLE" | "OF" | "ON" | "CASE" | "NULL" => true,
            "NOT" => self.w(1) == "MATERIALIZED",
            "MATERIALIZED" => self.kd(1) == Some(K::Open),
            "IDENTITY" => matches!(self.pk(-2), "ALWAYS" | "DEFAULT"),
            "ENUM" | "RANGE" => self.top() && self.fr[0].first == "CREATE",
            _ => false,
        }
    }
    /// ADD KEY idx (col) / ADD INDEX (col) — not ADD key VARCHAR(10), where "key" is the column
    fn names_index(&self) -> bool {
        match self.kd(1) {
            Some(K::Open) => true,
            Some(K::Word) => class(self.w(1)) & TY == 0 && matches!(self.kd(2), Some(K::Open | K::Word)),
            Some(K::QId) => matches!(self.kd(2), Some(K::Open | K::Word)),
            _ => false,
        }
    }
    /// the word after the bracket that opens at k
    fn after_group(&self, k: isize) -> &'b str {
        match self.ti(k) {
            Some(i) if self.d.mate[i] != NONE => self.wa(self.d.pos[self.d.mate[i] as usize] as usize + 1),
            _ => "",
        }
    }
    /// a type is expected here
    fn type_pos(&self, w: &str) -> bool {
        let f = self.f();
        let s0 = &self.fr[0];
        let p1 = self.pk(-1);
        let pkd = self.kd(-1);
        let top = self.top();
        if pkd == Some(K::Op) && self.raw(-1) == "::" { return true; }
        if p1 == "AS" && matches!(f.head, "CAST" | "TRY_CAST" | "SAFE_CAST") { return true; }
        if matches!(f.head, "CONVERT" | "TRY_CONVERT") && pkd == Some(K::Open) { return true; }
        if f.def && f.item > 0 && !f.slot { return true; }
        if matches!(p1, "RETURNS" | "SETOF" | "TYPE" | "OUT" | "INOUT") { return true; }
        if pkd == Some(K::Var) && top && matches!(s0.first, "DECLARE" | "CREATE" | "ALTER") { return true; }
        if pkd == Some(K::Word) && top && s0.first == "DECLARE" && self.pk(-1).is_empty() && s0.ntok >= 2 { return true; }
        // ALTER TABLE t ADD c INT, MODIFY c INT, CHANGE a b INT
        if top && s0.ddl && s0.first == "ALTER" && self.value_before() && matches!(pkd, Some(K::Word | K::QId)) {
            let name = |k: isize| matches!(self.kd(k), Some(K::Word | K::QId)) && self.pk(k).is_empty();
            if matches!(self.pk(-2), "ADD" | "COLUMN" | "MODIFY" | "CHANGE" | "EXISTS") || (name(-2) && matches!(self.pk(-3), "CHANGE" | "COLUMN")) { return true; }
        }
        // a type of several words: DOUBLE PRECISION, CHARACTER VARYING, INT UNSIGNED
        if self.type_before() && !matches!(w, "DATE" | "TIME" | "TIMESTAMP" | "YEAR" | "INTERVAL") { return true; }
        false
    }
    /// the first word of an entry in a definition list that is a keyword all the same
    fn def_starter(&self, w: &str) -> bool {
        match w {
            "CONSTRAINT" | "PRIMARY" | "FOREIGN" | "UNIQUE" | "CHECK" => true,
            "KEY" | "INDEX" => self.names_index(),
            "FULLTEXT" | "SPATIAL" => matches!(self.w(1), "INDEX" | "KEY"),
            "LIKE" => matches!(self.kd(1), Some(K::Word | K::QId)) && class(self.w(1)) & TY == 0,
            "IN" | "OUT" | "INOUT" => matches!(self.kd(1), Some(K::Word | K::Var | K::QId)) && matches!(self.kd(2), Some(K::Word)),
            _ => false,
        }
    }

    // ---------------------------------------------------------------- statements without a semicolon between them
    fn boundary(&self, w: &str, i: usize) -> bool {
        let f = &self.fr[0];
        let p1 = self.pk(-1);
        // a command that was recognised because it is the first word of its line
        if self.d.t[i].nl > 0 && class(w) & H == 0 && p1 != "END" && matches!(w, "PRAGMA" | "REINDEX" | "ATTACH" | "DETACH" | "SHOW" | "DESCRIBE" | "USE" | "CALL" | "TRUNCATE" | "REVOKE" | "COPY"
            | "LOCK" | "UNLOCK" | "RESET" | "LOAD" | "PRINT" | "RAISERROR" | "PREPARE" | "DEALLOCATE" | "WHILE" | "MERGE" | "LISTEN" | "NOTIFY" | "REFRESH" | "WAITFOR" | "EXPLAIN" | "RELEASE"
            | "VACUUM" | "CHECKPOINT" | "THROW" | "DISCARD" | "GRANT" | "DECLARE" | "EXEC" | "EXECUTE" | "RENAME" | "ANALYZE" | "RETURN" | "COMMIT" | "ROLLBACK" | "SAVEPOINT" | "IF" | "FETCH"
            | "START" | "ABORT" | "COMMENT" | "DESC" | "FOR" | "DO")
            // … but inside a query FETCH FIRST, START WITH and FOR UPDATE are its own clauses, which the layout puts on a new line
            && !(f.query && matches!(w, "FETCH" | "START" | "FOR" | "DO" | "DESC")) && !self.value_wanted() && !f.trigger { return f.ntok > 0; }
        // what stands before must be complete
        if !(self.value_before() || matches!(p1, "END" | "TRANSACTION" | "TRAN" | "WORK" | "ONLY" | "ROWS" | "ROW" | "ASC" | "DESC" | "TRY" | "CATCH" | "NOWAIT" | "TIES" | "COMMIT" | "ROLLBACK") || (matches!(p1, "ON" | "OFF") && f.first == "SET")) { return false; }
        if matches!(f.first, "GRANT" | "REVOKE" | "LOCK" | "LOAD") || f.trigger || (p1 == "END" && matches!(w, "IF" | "WHILE")) { return false; }
        if f.query {
            match w {
                "SELECT" => f.seen_select || f.cur == Cl::Set || (matches!(f.first, "UPDATE" | "DELETE") && !f.cte),
                "INSERT" | "MERGE" | "DELETE" | "UPDATE" => !f.cte && !f.merge,
                "SET" => !(matches!(f.first, "UPDATE" | "INSERT" | "REPLACE" | "MERGE") || f.has_update || f.cte),
                "CREATE" | "ALTER" | "DROP" | "TRUNCATE" | "DECLARE" | "EXEC" | "EXECUTE" | "PRINT" | "IF" | "WHILE" | "RETURN" | "USE" | "COMMIT" | "ROLLBACK" | "GRANT" | "REVOKE" | "RAISERROR" | "THROW" | "WAITFOR" => true,
                _ => false,
            }
        } else {
            let ddl = matches!(f.first, "CREATE" | "ALTER" | "DROP" | "COMMENT" | "RENAME" | "TRUNCATE");
            match w {
                "SELECT" | "INSERT" | "MERGE" | "DECLARE" | "EXEC" | "PRINT" | "WHILE" | "USE" => true,
                "UPDATE" | "DELETE" | "SET" | "IF" | "RETURN" | "COMMIT" | "ROLLBACK" | "CREATE" | "ALTER" | "DROP" | "TRUNCATE" | "EXECUTE" | "RAISERROR" | "THROW" | "WAITFOR" => !ddl && f.first != "SHOW",
                _ => false,
            }
        }
    }
    fn block_begin(&self) -> bool {
        !matches!(self.w(1), "TRANSACTION" | "TRAN" | "WORK" | "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE" | "ISOLATION" | "READ" | "DISTRIBUTED" | "NOT") && !matches!(self.kd(1), None | Some(K::Semi))
    }
    fn has_top_comma(&self) -> bool {
        let (mut q, mut depth) = (self.p + 1, 0i32);
        while let Some(k) = self.ka(q) {
            match k {
                K::Semi => return false,
                K::Open | K::SqOpen | K::BrOpen => depth += 1,
                K::Close | K::SqClose | K::BrClose => depth -= 1,
                K::Comma if depth == 0 => return true,
                _ => {}
            }
            q += 1;
        }
        false
    }

    // ---------------------------------------------------------------- one word
    fn word(&mut self, i: usize) {
        let d: &'b Doc<'a> = self.d;
        let w = d.u(i);
        let dotted = self.kd(-1) == Some(K::Dot) || self.kd(1) == Some(K::Dot);
        // the body of a view, a procedure, a trigger, an EXPLAIN: a statement of its own
        if self.top() && !w.is_empty() && !dotted && self.fr[0].ntok > 0 {
            let f = &self.fr[0];
            let p1 = self.pk(-1);
            let body = (matches!(p1, "AS" | "IS") && ((matches!(f.first, "CREATE" | "ALTER") && matches!(f.obj, "VIEW" | "TABLE" | "PROCEDURE" | "PROC" | "FUNCTION" | "TRIGGER")) || f.first == "PREPARE"))
                || (p1 == "FOR" && matches!(f.first, "DECLARE" | "OPEN") && matches!(w, "SELECT" | "WITH"))
                || (matches!(f.first, "EXPLAIN" | "DESCRIBE" | "DESC") && matches!(w, "SELECT" | "WITH" | "INSERT" | "UPDATE" | "DELETE" | "MERGE" | "VALUES" | "REPLACE" | "CREATE" | "TABLE"))
                || (p1 == "ROW" && f.trigger && !matches!(w, "WHEN" | "BEGIN"));
            if body { self.r.pre[i] = Pre::Body; self.fr[0] = Fr::new(P_STMT); }
        }
        let c = if w.is_empty() || dotted { 0 } else { class(w) };
        let f = self.f();
        let mut kw = false;
        if c != 0 {
            let ty = c & TY != 0 && self.type_pos(w);
            if f.def && f.item == 0 {
                // the first word of an entry is the name of a column or a parameter
                kw = self.def_starter(w);
            } else {
                kw = ty || (c & H != 0 && self.hard(w)) || (c & S != 0 && self.soft(w, i));
                // the word after AS is a name, unless it starts something
                if kw && !ty && f.ntok > 0 && self.pk(-1) == "AS" && !self.after_as(w) { kw = false; }
                if kw && f.slot && !slot_word(w) { kw = false; }
            }
        }
        {
            let f = self.fr.last_mut().unwrap();
            if f.slot && !(kw && (sets_slot(w) || matches!(w, "IF" | "NOT"))) { f.slot = false; if !kw { f.named = true; } }
        }
        self.r.kw[i] = kw;
        if kw { self.keyword(w, i); }
        self.count(i);
    }

    fn keyword(&mut self, w: &'b str, i: usize) {
        let d: &'b Doc<'a> = self.d;
        let top = self.top();
        let mut in_case = !self.f().cases.is_empty();
        // a CASE that was never closed
        if in_case && (matches!(w, "WHERE" | "SELECT" | "GROUP" | "ORDER" | "HAVING" | "UNION" | "LIMIT") || (w == "FROM" && self.pk(-1) != "DISTINCT")) {
            self.fr.last_mut().unwrap().cases.clear();
            in_case = false;
        }
        if top && !in_case && self.fr[0].ntok > 0 && self.r.pre[i] == Pre::No && self.boundary(w, i) {
            self.r.pre[i] = Pre::Start;
            self.fr[0] = Fr::new(P_STMT);
        }
        if self.f().ntok == 0 {
            let f = self.fr.last_mut().unwrap();
            f.first = w;
            if f.kind == P_STMT {
                f.query = matches!(w, "SELECT" | "WITH" | "INSERT" | "UPDATE" | "DELETE" | "MERGE" | "VALUES" | "REPLACE");
                f.ddl = matches!(w, "CREATE" | "ALTER" | "DROP" | "TRUNCATE" | "COMMENT" | "RENAME");
            }
        }
        // ---- blocks: BEGIN … END, IF … THEN … END IF, LOOP … END LOOP
        if top && !in_case {
            let ntok = self.fr[0].ntok;
            let first = self.fr[0].first;
            let n1 = self.w(1);
            match w {
                "END" if !self.blocks.is_empty() => {
                    let b = *self.blocks.last().unwrap();
                    let fits = match n1 { "CASE" => false, "IF" => b == B_IF, "LOOP" | "WHILE" | "REPEAT" | "FOR" => b == B_LOOP, _ => b == B_BEGIN };
                    if fits {
                        self.blocks.pop();
                        self.r.pre[i] = Pre::BlockEnd;
                        self.fr[0] = Fr::new(P_STMT);
                        self.fr[0].first = "END";
                        return;
                    }
                }
                "ELSE" => {
                    self.r.pre[i] = if self.blocks.last() == Some(&B_IF) && ntok == 0 { Pre::Mid } else { Pre::Line };
                    self.r.post[i] = Post::Cont;
                    self.fresh_at = i;
                    return;
                }
                "ELSEIF" | "ELSIF" if self.blocks.last() == Some(&B_IF) && ntok == 0 => { self.r.pre[i] = Pre::Mid; return; }
                "EXCEPTION" => { self.r.pre[i] = Pre::Mid; self.r.post[i] = Post::Cont; self.fresh_at = i; return; }
                "THEN" if first == "IF" => { self.blocks.push(B_IF); self.r.post[i] = Post::BlockOpen; self.fresh_at = i; return; }
                "THEN" if matches!(first, "ELSEIF" | "ELSIF") => { self.r.post[i] = Post::Cont; self.fresh_at = i; return; }
                "BEGIN" if self.block_begin() => {
                    // the block of the statement it stands in (IF … BEGIN, CREATE TRIGGER … BEGIN) — or, after a
                    // statement that is complete without it, the start of a new one
                    if ntok > 0 { self.r.pre[i] = if matches!(first, "CREATE" | "ALTER" | "IF" | "WHILE" | "ELSE" | "FOR" | "END" | "DECLARE") { Pre::Line } else { Pre::Start }; }
                    let last = if matches!(n1, "TRY" | "CATCH" | "ATOMIC") { self.mark(self.p + 1) } else { i };
                    self.blocks.push(B_BEGIN);
                    self.r.post[last] = Post::BlockOpen;
                    self.fresh_at = last;
                    return;
                }
                "LOOP" if self.pk(-1) != "END" => { self.blocks.push(B_LOOP); self.r.post[i] = Post::BlockOpen; self.fresh_at = i; return; }
                "DO" if first == "WHILE" => { self.blocks.push(B_LOOP); self.r.post[i] = Post::BlockOpen; self.fresh_at = i; return; }
                "GO" => { if ntok > 0 { self.r.pre[i] = Pre::Start; } self.r.post[i] = Post::Stmt; self.fresh_at = i; return; }
                _ => {}
            }
            // what a CREATE / ALTER / DROP is about; where its names are
            let f = &mut self.fr[0];
            if f.ddl {
                if !f.named && is_object(w) { f.obj = w; if w == "TRIGGER" { f.trigger = true; } }
                if w == "WHERE" { f.ddl = false; }
            }
        }
        {
            let slot = (top && self.fr[0].ddl && (sets_slot(w) || (matches!(w, "DROP" | "ALTER") && self.fr[0].ntok > 0) || (w == "TYPE" && matches!(self.pk(-1), "CREATE" | "DROP" | "ALTER")))) || (self.f().def && matches!(w, "CONSTRAINT" | "REFERENCES" | "COLLATE"));
            if slot { self.fr.last_mut().unwrap().slot = true; }
        }
        // ---- CASE … END
        match w {
            "CASE" if self.pk(-1) != "END" => { self.fr.last_mut().unwrap().cases.push(i); self.r.role[i] = Role::CaseOpen; return; }
            "END" if in_case => {
                let c = self.fr.last_mut().unwrap().cases.pop().unwrap();
                self.r.cmate[c] = i as u32;
                self.r.role[i] = Role::CaseEnd;
                return;
            }
            "WHEN" | "ELSE" if in_case => { self.r.role[i] = Role::CaseWhen; return; }
            _ => {}
        }
        if in_case { return; }
        let kind = self.f().kind;
        if kind == P_WIN {
            let f = self.fr.last_mut().unwrap();
            if f.ntok > 0 && matches!(w, "PARTITION" | "ORDER" | "ROWS" | "RANGE" | "GROUPS") { self.r.role[i] = Role::WinBrk; }
            return;
        }
        if !self.f().query {
            match w {
                "BETWEEN" => self.fr.last_mut().unwrap().between += 1,
                "AND" | "OR" | "XOR" if kind == P_LIST => {
                    let f = self.fr.last_mut().unwrap();
                    if w == "AND" && f.between > 0 { f.between -= 1; } else { self.r.role[i] = Role::AndOr; }
                }
                "ADD" | "DROP" | "ALTER" | "MODIFY" | "CHANGE" | "RENAME" | "SET" | "OWNER" | "ENABLE" | "DISABLE"
                    if top && self.fr[0].hang == 0 && self.fr[0].first == "ALTER" && self.fr[0].obj == "TABLE" && self.fr[0].named && self.fr[0].ntok >= 3 =>
                {
                    let multi = self.has_top_comma();
                    self.fr[0].hang = if multi { 2 } else { 1 };
                    if multi { self.r.role[i] = Role::Hang; }
                }
                _ => {}
            }
            return;
        }
        let _ = d;
        self.clause(w, i);
    }

    /// the keywords that shape a query
    fn clause(&mut self, w: &'b str, i: usize) {
        let d: &'b Doc<'a> = self.d;
        let (n1, n2, p1) = (self.w(1), self.w(2), self.pk(-1));
        let (pkd, nkd) = (self.kd(-1), self.kd(1));
        let p = self.p;
        let fr = self.f();
        let stmt_pos = fr.ntok == 0 || (fr.cte && pkd == Some(K::Close));
        if fr.merge_when && !matches!(w, "WHEN" | "OUTPUT") { return; }
        let (cur0, merge, insert_all, seen_select, first, between) = (fr.cur, fr.merge, fr.insert_all, fr.seen_select, fr.first, fr.between);
        let mut role = Role::No;
        let mut last = p; // last token of the phrase, as a place in `sig`
        let mut cur: Option<Cl> = None;
        match w {
            "SELECT" => {
                role = Role::Top; cur = Some(Cl::Select);
                let mut q = p + 1;
                if matches!(self.wa(q), "DISTINCT" | "ALL" | "DISTINCTROW") {
                    self.mark(q); last = q; q += 1;
                    if self.wa(q) == "ON" && self.ka(q + 1) == Some(K::Open) {
                        let o = d.sig[q + 1] as usize;
                        if d.mate[o] != NONE { self.mark(q); last = d.pos[d.mate[o] as usize] as usize; q = last + 1; }
                    }
                }
                if self.wa(q) == "TOP" && matches!(self.ka(q + 1), Some(K::Num | K::Var | K::Open)) {
                    self.mark(q);
                    let o = d.sig[q + 1] as usize;
                    last = if d.t[o].k == K::Open && d.mate[o] != NONE { d.pos[d.mate[o] as usize] as usize } else { q + 1 };
                    q = last + 1;
                    if self.wa(q) == "PERCENT" { self.mark(q); last = q; q += 1; }
                    if self.wa(q) == "WITH" && self.wa(q + 1) == "TIES" { self.mark(q); self.mark(q + 1); last = q + 1; }
                }
                let f = self.fr.last_mut().unwrap();
                f.seen_select = true; f.cte = false; f.insert_all = false;
            }
            "FROM" => { if !(p1 == "DISTINCT" && matches!(self.pk(-2), "IS" | "NOT")) { role = Role::Top; cur = Some(Cl::From); } }
            "WHERE" | "HAVING" | "QUALIFY" => { role = Role::Top; cur = Some(Cl::Cond); }
            "RETURNING" => { role = Role::Top; cur = Some(Cl::Other); }
            "OUTPUT" => { if matches!(n1, "INSERTED" | "DELETED") || self.raw(1).eq_ignore_ascii_case("$action") { role = Role::Top; cur = Some(Cl::Other); } }
            "GROUP" | "ORDER" => {
                if p1 == "FOR" {}
                else if n1 == "BY" { role = Role::Top; cur = Some(Cl::Other); self.mark(p + 1); last = p + 1; }
                else if w == "ORDER" && n1 == "SIBLINGS" && n2 == "BY" { role = Role::Top; cur = Some(Cl::Other); self.mark(p + 1); self.mark(p + 2); last = p + 2; }
            }
            "WINDOW" => { role = Role::Top; cur = Some(Cl::Window); }
            "LIMIT" => { role = Role::Top; cur = Some(Cl::Limit); }
            "OFFSET" => { if cur0 != Cl::Limit { role = Role::Top; cur = Some(Cl::Limit); } }
            "FETCH" => { if matches!(n1, "FIRST" | "NEXT") { role = Role::Top; cur = Some(Cl::Limit); self.mark(p + 1); last = p + 1; } }
            "UNION" | "INTERSECT" | "EXCEPT" | "MINUS" => {
                role = Role::SetOp; cur = Some(Cl::None);
                if matches!(n1, "ALL" | "DISTINCT") { self.mark(p + 1); last = p + 1; }
                self.fr.last_mut().unwrap().seen_select = false;
            }
            "WITH" => {
                if stmt_pos && (n1 == "RECURSIVE" || matches!(nkd, Some(K::Word | K::QId))) {
                    role = Role::Top; cur = Some(Cl::With);
                    if n1 == "RECURSIVE" { self.mark(p + 1); last = p + 1; }
                    self.fr.last_mut().unwrap().cte = true;
                }
            }
            "VALUES" => {
                // not the MySQL function VALUES(col), not INSERT … DEFAULT VALUES
                if stmt_pos || (p1 != "DEFAULT" && !insert_all && !matches!(pkd, Some(K::Op | K::Comma | K::Open))) { role = Role::Top; cur = Some(Cl::Other); self.fr.last_mut().unwrap().cte = false; }
            }
            "SET" => { if p1 != "CHARACTER" { role = Role::Top; cur = Some(Cl::Set); self.fr.last_mut().unwrap().has_update = true; } }
            "INSERT" | "REPLACE" => {
                if stmt_pos {
                    role = Role::Top; cur = Some(Cl::Other);
                    let mut q = p + 1;
                    let mut all = false;
                    while matches!(self.wa(q), "OR" | "REPLACE" | "ROLLBACK" | "ABORT" | "FAIL" | "IGNORE" | "LOW_PRIORITY" | "DELAYED" | "HIGH_PRIORITY" | "ALL" | "FIRST" | "OVERWRITE" | "INTO") && q < p + 5 {
                        let x = self.wa(q);
                        if x == "INTO" && all { break; }
                        self.mark(q); last = q; q += 1;
                        if matches!(x, "ALL" | "FIRST") { all = true; }
                        if x == "INTO" { break; }
                    }
                    let f = self.fr.last_mut().unwrap();
                    f.insert_all = all; f.cte = false;
                }
            }
            "UPDATE" => {
                let f = self.fr.last_mut().unwrap();
                f.has_update = true;
                if stmt_pos { role = Role::Top; cur = Some(Cl::From); f.cte = false; }
            }
            "DELETE" => {
                if stmt_pos {
                    role = Role::Top; cur = Some(Cl::Other);
                    if n1 == "FROM" { self.mark(p + 1); last = p + 1; }
                    self.fr.last_mut().unwrap().cte = false;
                }
            }
            "MERGE" => {
                if stmt_pos {
                    role = Role::Top; cur = Some(Cl::Other);
                    if n1 == "INTO" { self.mark(p + 1); last = p + 1; }
                    let f = self.fr.last_mut().unwrap();
                    f.merge = true; f.cte = false;
                }
            }
            "USING" => { if merge || first == "DELETE" { role = Role::Top; cur = Some(Cl::From); } }
            "WHEN" => {
                if merge && matches!(n1, "MATCHED" | "NOT") { role = Role::Line; cur = Some(Cl::Flat); self.fr.last_mut().unwrap().merge_when = true; }
            }
            "ON" => {
                if n1 == "CONFLICT" { role = Role::Line; cur = Some(Cl::Flat); self.mark(p + 1); }
                else if n1 == "DUPLICATE" && n2 == "KEY" && self.wa(p + 3) == "UPDATE" {
                    role = Role::Top; cur = Some(Cl::Set);
                    for q in p + 1..=p + 3 { self.mark(q); }
                    last = p + 3;
                    self.fr.last_mut().unwrap().has_update = true;
                }
            }
            "INTO" => { if insert_all { role = Role::Join; } }
            "FOR" => { if seen_select && matches!(n1, "UPDATE" | "SHARE" | "NO" | "KEY" | "JSON" | "XML" | "BROWSE" | "READ") { role = Role::Line; cur = Some(Cl::Flat); } }
            "OPTION" => { if nkd == Some(K::Open) { role = Role::Line; cur = Some(Cl::Flat); } }
            "START" => { if n1 == "WITH" { role = Role::Top; cur = Some(Cl::Cond); self.mark(p + 1); last = p + 1; } }
            "CONNECT" => {
                if n1 == "BY" {
                    role = Role::Top; cur = Some(Cl::Cond); self.mark(p + 1); last = p + 1;
                    if n2 == "NOCYCLE" { self.mark(p + 2); last = p + 2; }
                    self.fr.last_mut().unwrap().connect = true;
                }
            }
            "BETWEEN" => self.fr.last_mut().unwrap().between += 1,
            "AND" | "OR" | "XOR" => {
                if w == "AND" && between > 0 { self.fr.last_mut().unwrap().between -= 1; } else if matches!(cur0, Cl::Cond | Cl::From) { role = Role::AndOr; }
            }
            "JOIN" | "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "NATURAL" | "OUTER" | "STRAIGHT_JOIN" if p1 != "FOR" && !(w == "STRAIGHT_JOIN" && cur0 != Cl::From) => {
                let mut q = p;
                let mut ok = matches!(w, "JOIN" | "STRAIGHT_JOIN");
                while !ok {
                    q += 1;
                    match self.wa(q) { "JOIN" | "APPLY" => ok = true, "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "OUTER" | "NATURAL" | "SEMI" | "ANTI" => {} _ => break }
                }
                if ok {
                    for x in p + 1..=q { self.mark(x); }
                    if self.wa(q + 1) == "LATERAL" { self.mark(q + 1); q += 1; }
                    role = Role::Join; last = q;
                }
            }
            _ => {}
        }
        if role != Role::No {
            self.r.role[i] = role;
            self.r.until[i] = d.sig[last];
        }
        if let Some(c) = cur { self.fr.last_mut().unwrap().cur = c; }
    }

    fn open(&mut self, i: usize) {
        let d: &'b Doc<'a> = self.d;
        let sq = d.t[i].k != K::Open;
        let head = self.w(-1);
        let p1 = self.pk(-1);
        let mut q = self.p + 1;
        while self.ka(q) == Some(K::Open) { q += 1; }
        let iw = self.wa(q);
        let query = !sq
            && (matches!(iw, "SELECT" | "VALUES")
                || (iw == "WITH" && matches!(self.ka(q + 1), Some(K::Word | K::QId)))
                || (matches!(iw, "INSERT" | "UPDATE" | "DELETE" | "MERGE") && matches!(self.ka(q + 1), Some(K::Word | K::QId)) && matches!(p1, "AS" | "MATERIALIZED")));
        let s0 = &self.fr[0];
        let win = !sq && (p1 == "OVER" || (p1 == "AS" && self.f().cur == Cl::Window));
        let def = !sq && !query && self.top()
            && ((s0.ddl && s0.named && !s0.def_done && s0.first == "CREATE" && matches!(s0.obj, "TABLE" | "FUNCTION" | "PROCEDURE" | "PROC"))
                || (p1 == "TABLE" && matches!(s0.first, "DECLARE" | "CREATE"))
                || (p1 == "ADD" && s0.first == "ALTER"));
        if self.top() && self.fr[0].ntok == 0 && query { self.fr[0].query = true; self.fr[0].seen_select = true; }
        self.count(i);
        if def { self.fr[0].def_done = true; }
        let mut nf = Fr::new(if sq { P_SQ } else if query { P_QUERY } else if win { P_WIN } else { P_LIST });
        nf.def = def;
        nf.head = head;
        self.r.pk[i] = if def { P_DEF } else { nf.kind };
        self.fr.push(nf);
    }
    fn comma(&mut self, i: usize) {
        let f = self.fr.last_mut().unwrap();
        let nl = match f.kind {
            P_LIST => true,
            P_WIN | P_SQ => false,
            _ => f.cases.is_empty() && ((f.query && !f.merge_when && !matches!(f.cur, Cl::None | Cl::Limit | Cl::Flat)) || f.hang == 2),
        };
        if nl { self.r.role[i] = Role::CommaNl; }
        f.ntok += 1;
        f.item = 0;
        f.slot = false;
    }
}

fn analyse<'a, 'b>(d: &'b Doc<'a>) -> An {
    let n = d.t.len();
    let r = An { kw: vec![false; n], unary: vec![false; n], role: vec![Role::No; n], until: (0..n as u32).collect(), pre: vec![Pre::No; n], post: vec![Post::No; n], pk: vec![P_LIST; n], cmate: vec![NONE; n] };
    let mut z = Az { d, r, p: 0, fr: vec![Fr::new(P_STMT)], blocks: vec![], fresh_at: usize::MAX };
    let mut fresh = false; // the next token begins a statement
    while z.p < d.sig.len() {
        let i = d.sig[z.p] as usize;
        if fresh { z.fr.truncate(1); z.fr[0] = Fr::new(P_STMT); fresh = false; }
        match d.t[i].k {
            K::Semi => fresh = true,
            K::Open | K::SqOpen | K::BrOpen => z.open(i),
            K::Close | K::SqClose | K::BrClose => { if z.fr.len() > 1 { z.fr.pop(); } z.count(i); }
            K::Comma => z.comma(i),
            K::Op => {
                if matches!(d.t[i].s, "-" | "+" | "~" | "!") && z.value_wanted() { z.r.unary[i] = true; }
                z.count(i);
            }
            K::Word => { if z.r.role[i] == Role::Part { z.count(i); } else { z.word(i); } }
            _ => z.count(i),
        }
        if z.fresh_at == i { fresh = true; z.fresh_at = usize::MAX; }
        z.p += 1;
    }
    z.r
}

// ====================================================================================================== layout
pub struct Opts { pub indent: String, pub case: u8 /* 0 as typed, 1 UPPER, 2 lower */, pub lines: usize, pub oneline: bool }
const INLINE: u32 = 50; // a bracket whose content is at most this wide stays on its line
const FILL: usize = 72; // long lists of plain values are filled up to this width
const WIDTH: usize = 80; // … and so does one that still fits on its line
const DEEP: usize = 50; // lines are not indented further than this many levels (20,000 open brackets would need 400 MB)

#[derive(Clone, Copy)]
struct Pend { level: usize, n: usize, hard: bool }
struct LFr {
    kind: u8,
    inline: bool,
    fill: bool,
    base: usize,   // level of the clause keywords (statement, query) or of the entries (list)
    close: usize,  // level of the closing bracket
    clause: bool,  // inside a clause: its content is one level deeper
    join: bool,    // after JOIN: its AND / OR lines go one level deeper still
    cases: Vec<(usize, bool)>,
}
struct Lay<'a, 'b> {
    d: &'b Doc<'a>, a: &'b An, o: &'b Opts,
    out: String,
    fr: Vec<LFr>,
    level: usize,            // depth of BEGIN … END blocks
    pend: Option<Pend>,      // a line break that is due before the next token
    bol: bool,               // nothing on the current line yet
    line_level: usize, line_pos: usize,
    last: Option<usize>, last2: Option<usize>,
    gap: bool,               // a comment was written after the last token
    after: Vec<(usize, usize)>,
    emitted: Vec<u32>,
}
fn is_atom(k: K) -> bool { matches!(k, K::Word | K::QId | K::Str | K::Num | K::Var) }
/// keywords after which an opening bracket always gets a space
fn space_kw(w: &str) -> bool {
    matches!(w, "AND" | "OR" | "NOT" | "IN" | "AS" | "ON" | "FROM" | "WHERE" | "SELECT" | "JOIN" | "BY" | "WHEN" | "THEN" | "ELSE" | "UNION" | "ALL" | "ANY" | "SOME" | "EXISTS"
        | "USING" | "OVER" | "FILTER" | "GROUP" | "INTO" | "HAVING" | "LIKE" | "ILIKE" | "BETWEEN" | "IS" | "CASE" | "DISTINCT" | "KEY" | "CHECK" | "UNIQUE" | "TABLE" | "SET"
        | "LIMIT" | "OFFSET" | "RETURNING" | "WITH" | "LATERAL" | "EXCEPT" | "INTERSECT" | "UPDATE" | "DELETE" | "DEFAULT" | "REFERENCES" | "INDEX" | "WITHIN" | "OPTION"
        | "PARTITION" | "END" | "ONLY" | "APPLY" | "PIVOT" | "UNPIVOT" | "MATERIALIZED" | "RECURSIVE" | "CONFLICT" | "INCLUDE" | "MINUS" | "AGAINST" | "MATCH" | "ADD")
}
impl<'a, 'b> Lay<'a, 'b> {
    fn top(&self) -> &LFr { self.fr.last().unwrap() }
    fn top_mut(&mut self) -> &mut LFr { self.fr.last_mut().unwrap() }
    /// the level of a line that continues the clause or the list we are in
    fn content(&self) -> usize {
        let f = self.top();
        if let Some(&(b, inl)) = f.cases.last() { if !inl { return b + 1; } }
        match f.kind { P_STMT | P_QUERY => f.base + f.clause as usize, _ => f.base }
    }
    fn col(&self) -> usize { self.out.len() - self.line_pos }
    fn brk(&mut self, level: usize) {
        self.pend = Some(match self.pend { Some(p) => Pend { level, ..p }, None => Pend { level, n: 1, hard: false } });
    }
    fn hard(&mut self, level: usize, n: usize) {
        let m = self.pend.map_or(0, |p| if p.hard { p.n } else { 0 });
        self.pend = Some(Pend { level, n: n.max(m).max(1), hard: true });
    }
    fn flush(&mut self) {
        if let Some(p) = self.pend.take() {
            if self.out.is_empty() { self.bol = true; return; }
            if self.o.oneline && !p.hard { return; }
            while self.out.ends_with(' ') || self.out.ends_with('\t') { self.out.pop(); }
            for _ in 0..p.n { self.out.push('\n'); }
            self.line_pos = self.out.len();
            if !self.o.oneline { for _ in 0..p.level.min(DEEP) { self.out.push_str(&self.o.indent); } self.line_level = p.level; }
            self.bol = true;
        }
    }
    fn reset(&mut self) {
        self.fr.truncate(1);
        self.fr[0] = LFr { kind: P_STMT, inline: false, fill: false, base: self.level, close: self.level, clause: false, join: false, cases: vec![] };
        self.after.clear();
    }
    fn space(&self, p: usize, c: usize) -> bool {
        let (a, b) = (&self.d.t[p], &self.d.t[c]);
        let kw = &self.a.kw;
        if matches!(b.k, K::Comma | K::Semi | K::Close | K::SqClose | K::BrClose) { return false; }
        if matches!(a.k, K::Open | K::SqOpen | K::BrOpen) { return false; }
        // tokens we do not understand keep the spacing they came with; so do dots
        if a.k == K::Other || b.k == K::Other { return b.sp; }
        if a.k == K::Dot || b.k == K::Dot { return false; }
        if (a.k == K::Op && a.s == "::") || (b.k == K::Op && b.s == "::") { return false; }
        if a.k == K::Op && self.a.unary[p] { return b.sp; }
        // two operators that touch stay together unless the second is a sign: they may be one operator we do not know
        if a.k == K::Op && b.k == K::Op && !b.sp { return matches!(b.s, "-" | "+" | "~"); }
        match b.k {
            K::Open => match a.k {
                K::Word if kw[p] => {
                    let w = self.d.u(p);
                    if w == "SET" && self.last2.map_or(false, |q| is_atom(self.d.t[q].k) && !kw[q]) { return b.sp; }
                    if w == "VALUES" { return !self.last2.map_or(false, |q| matches!(self.d.t[q].k, K::Op | K::Comma | K::Open)) || b.sp; }
                    if space_kw(w) { true } else if class(w) & TY != 0 && w != "INTERVAL" { false } else { b.sp }
                }
                // a function and its bracket stay as they were typed: MySQL reads "count (" differently from "count("
                K::Word | K::QId | K::Str | K::Num | K::Var | K::Close | K::SqClose => b.sp,
                _ => true,
            },
            K::SqOpen => b.sp,
            // two values that touch (a prefix and its string, a name and its variable) stay together
            _ => !(!b.sp && is_atom(a.k) && is_atom(b.k) && !(a.k == K::Word && kw[p]) && !(b.k == K::Word && kw[c])),
        }
    }
    fn emit(&mut self, i: usize) {
        self.flush();
        let tk = &self.d.t[i];
        if !self.bol {
            let sp = match self.last {
                Some(p) => if self.gap { !matches!(tk.k, K::Comma | K::Semi | K::Close | K::SqClose | K::BrClose) } else { self.space(p, i) },
                None => !self.out.is_empty(),
            };
            if sp { self.out.push(' '); }
        }
        if self.a.kw[i] && self.o.case != 0 {
            let a = self.out.len();
            self.out.push_str(tk.s);
            if self.o.case == 1 { self.out[a..].make_ascii_uppercase(); } else { self.out[a..].make_ascii_lowercase(); }
        } else {
            self.out.push_str(tk.s);
        }
        self.bol = false;
        self.gap = false;
        self.last2 = self.last;
        self.last = Some(i);
        self.emitted.push(i as u32);
        while let Some(&(at, lv)) = self.after.last() {
            if at == i { self.after.pop(); self.brk(lv); } else { break; }
        }
    }
    /// writes token i; the line break of its phrase follows the phrase's last token
    fn emit_until(&mut self, i: usize, level: usize) {
        let u = self.a.until[i] as usize;
        if u > i { self.after.push((u, level)); }
        self.emit(i);
        if u <= i { self.brk(level); }
    }
    fn comment(&mut self, i: usize) {
        let tk = self.d.t[i];
        let line = tk.k == K::LineC;
        // on a line of its own: a line break before it — or, for the very first thing in the text, after it
        let own = !self.o.oneline && (tk.nl > 0 || (self.out.is_empty() && self.d.t.get(i + 1).map_or(true, |t| t.nl > 0)));
        if self.out.is_empty() {
        } else if own {
            if self.pend.is_none() && !self.bol { let c = self.content(); self.brk(c); }
            let mut j = i;
            while j < self.d.t.len() && matches!(self.d.t[j].k, K::LineC | K::BlockC) { j += 1; }
            if j < self.d.t.len() && !self.top().inline && matches!(self.a.role[j], Role::Top | Role::Line | Role::SetOp) { let b = self.top().base; self.brk(b); }
            self.flush();
        } else {
            // one line per statement: a comment from a later line still must not run into a "--" comment before it
            if tk.nl > 0 && self.pend.map_or(false, |p| p.hard) { self.flush(); }
            if !self.bol { self.out.push(' '); }
        }
        self.out.push_str(tk.s);
        self.bol = false;
        self.gap = true;
        if line || own {
            // what follows starts a new line
            let (level, n, hard) = match self.pend { Some(p) => (p.level, p.n, p.hard), None => (if own { self.line_level } else { self.content() }, 1, false) };
            self.pend = Some(Pend { level, n, hard: hard || line });
        }
    }
    fn open(&mut self, i: usize) {
        self.emit(i);
        let d = self.d;
        let kind = self.a.pk[i];
        let m = d.mate[i];
        let mut inline = self.top().inline || kind == P_SQ || d.t[i].k != K::Open;
        if !inline && m != NONE {
            let m = m as usize;
            inline = m == i + 1 || (kind != P_QUERY && d.plain(i, m) && {
                let w = d.width(i + 1, m - 1) as usize;
                w <= INLINE as usize + 1 || (kind == P_LIST && self.col() + w <= WIDTH)
            });
        }
        let kind = if kind == P_DEF { P_LIST } else { kind };
        // a long list of plain values (IN (1, 2, 3, …)) is filled line by line instead of one value a line
        let fill = !inline && self.a.pk[i] == P_LIST && m != NONE && self.short_items(i, m as usize);
        let (base, close) = (self.line_level + 1, self.line_level);
        self.fr.push(LFr { kind, inline, fill, base, close, clause: false, join: false, cases: vec![] });
        if !inline { self.brk(base); }
    }
    /// every entry of the list between the brackets at i and m is short — a name, a literal, a call without
    /// arguments: at most three tokens
    fn short_items(&self, i: usize, m: usize) -> bool {
        let d = self.d;
        let mut len = 0;
        for j in i + 1..m {
            match d.t[j].k {
                K::Comma => len = 0,
                K::LineC | K::BlockC => return false,
                K::Word if self.a.kw[j] && !matches!(d.u(j), "NULL" | "TRUE" | "FALSE" | "DEFAULT" | "CURRENT_DATE" | "CURRENT_TIME" | "CURRENT_TIMESTAMP") => return false,
                _ => { len += 1; if len > 3 { return false; } }
            }
        }
        true
    }
    fn close(&mut self, i: usize) {
        if self.fr.len() > 1 {
            let f = self.fr.pop().unwrap();
            if !f.inline { self.brk(f.close); }
        }
        self.emit(i);
    }
    fn token(&mut self, i: usize) {
        let r = self.a.role[i];
        if self.top().inline { self.emit(i); return; }
        let base = self.top().base;
        match r {
            Role::Top => {
                self.brk(base);
                let f = self.top_mut();
                f.clause = true; f.join = false;
                self.emit_until(i, base + 1);
            }
            Role::Line => {
                self.brk(base);
                let f = self.top_mut();
                f.clause = false; f.join = false;
                self.emit(i);
            }
            Role::SetOp => {
                self.brk(base);
                let f = self.top_mut();
                f.clause = false; f.join = false;
                self.emit_until(i, base);
            }
            Role::Join => {
                let c = self.content();
                self.brk(c);
                self.top_mut().join = true;
                self.emit(i);
            }
            Role::AndOr => {
                let f = self.top();
                let c = self.content() + (f.join && matches!(f.kind, P_STMT | P_QUERY)) as usize;
                self.brk(c);
                self.emit(i);
            }
            Role::Hang => {
                self.brk(base + 1);
                self.top_mut().clause = true;
                self.emit(i);
            }
            Role::WinBrk => { self.brk(base); self.emit(i); }
            Role::CaseOpen => {
                self.emit(i);
                let m = self.a.cmate[i];
                if m != NONE {
                    let inline = self.d.width(i, m as usize) <= INLINE + 10 && self.d.plain(i, m as usize);
                    let lv = self.line_level;
                    self.top_mut().cases.push((lv, inline));
                }
            }
            Role::CaseWhen => {
                if let Some(&(b, inl)) = self.top().cases.last() { if !inl { self.brk(b + 1); } }
                self.emit(i);
            }
            Role::CaseEnd => {
                if let Some((b, inl)) = self.top_mut().cases.pop() { if !inl { self.brk(b); } }
                self.emit(i);
            }
            Role::CommaNl => {
                self.emit(i);
                if self.top().fill { if self.col() > FILL { self.brk(base); } } else { let c = self.content(); self.brk(c); }
                self.top_mut().join = false;
            }
            Role::No | Role::Part => self.emit(i),
        }
    }
    fn one(&mut self, i: usize) {
        let (d, a) = (self.d, self.a);
        let tk = d.t[i];
        match a.pre[i] {
            Pre::Start => { self.reset(); self.hard(self.level, 1); }
            Pre::Body | Pre::Line => { self.reset(); self.brk(self.level); }
            Pre::BlockEnd => { self.level = self.level.saturating_sub(1); self.reset(); self.brk(self.level); }
            Pre::Mid => { self.reset(); self.brk(self.level.saturating_sub(1)); }
            Pre::No => {}
        }
        match tk.k {
            K::Semi => {
                if let Some(p) = self.pend { if !p.hard { self.pend = None; } }
                self.emit(i);
                self.reset();
                if self.level == 0 { self.hard(0, self.o.lines); } else { self.brk(self.level); }
            }
            K::Open | K::SqOpen | K::BrOpen => self.open(i),
            K::Close | K::SqClose | K::BrClose => self.close(i),
            // 'a' ⏎ 'b' is one string in standard SQL only when a line break stands between the parts
            K::Str if tk.nl > 0 && !self.gap && self.last.map_or(false, |p| d.t[p].k == K::Str) => { let c = self.content(); self.hard(c, 1); self.emit(i); }
            _ => self.token(i),
        }
        match a.post[i] {
            Post::BlockOpen => { self.level += 1; self.reset(); self.brk(self.level); }
            Post::Cont => { self.reset(); self.brk(self.level); }
            Post::Stmt => { self.reset(); self.hard(self.level, 1); }
            Post::No => {}
        }
    }
}
fn layout(d: &Doc, a: &An, o: &Opts) -> (String, Vec<u32>) {
    let cap = d.t.iter().map(|t| t.s.len() + 3).sum::<usize>();
    let mut l = Lay { d, a, o, out: String::with_capacity(cap), fr: vec![], level: 0, pend: None, bol: true, line_level: 0, line_pos: 0, last: None, last2: None, gap: false, after: vec![], emitted: Vec::with_capacity(d.sig.len()) };
    l.fr.push(LFr { kind: P_STMT, inline: false, fill: false, base: 0, close: 0, clause: false, join: false, cases: vec![] });
    let n = d.t.len();
    let mut i = 0;
    while i < n {
        if matches!(d.t[i].k, K::LineC | K::BlockC) {
            // a comma that follows comments goes in front of them: "a -- note ⏎ , b" becomes "a, -- note ⏎ b"
            // Only across text that is a comment in every dialect: "--x" is code in MySQL, and "/* a /* b */" ends at
            // the first "*/" where comments do not nest.
            let mut j = i;
            let mut sure = true;
            while j < n && matches!(d.t[j].k, K::LineC | K::BlockC) {
                let c = d.t[j].s.as_bytes();
                sure &= if d.t[j].k == K::BlockC { !d.t[j].bad && !d.t[j].s[2..].contains("/*") } else { c[0] == b'-' && (c.len() == 2 || c[2] <= b' ') || (c[0] == b'#' && d.d == D::My) };
                j += 1;
            }
            let comma = sure && j < n && d.t[j].k == K::Comma && l.last.is_some();
            if comma { l.one(j); }
            for c in i..j { l.comment(c); }
            i = if comma { j + 1 } else { j };
        } else {
            l.one(i);
            i += 1;
        }
    }
    (l.out, l.emitted)
}

// ====================================================================================================== the guard
/// The formatted text, read again, holds the tokens of the input: the same ones, in the same order (keywords may
/// differ in case; comments keep their own order).
fn same_tokens(d: &Doc, a: &An, out: &str, emitted: &[u32]) -> bool {
    if emitted.len() != d.sig.len() || emitted.iter().zip(&d.sig).any(|(x, y)| x != y) { return false; }
    let (t2, _) = lex(out, d.d);
    let mut sig = d.sig.iter();
    let mut cm = d.t.iter().filter(|t| matches!(t.k, K::LineC | K::BlockC));
    for x in &t2 {
        if matches!(x.k, K::LineC | K::BlockC) {
            match cm.next() { Some(y) if y.k == x.k && y.s == x.s => {} _ => return false }
        } else {
            match sig.next() {
                Some(&i) => {
                    let y = &d.t[i as usize];
                    if y.k != x.k || !(if a.kw[i as usize] { y.s.eq_ignore_ascii_case(x.s) } else { y.s == x.s }) { return false; }
                }
                None => return false,
            }
        }
    }
    sig.next().is_none() && cm.next().is_none()
}

// ====================================================================================================== which dialect?
fn any(w: &str, list: &[(&str, i32)]) -> i32 { list.iter().find(|(x, _)| x.eq_ignore_ascii_case(w)).map_or(0, |x| x.1) }
/// How much a text, read as dialect `d`, looks like that dialect.
fn evidence(t: &[T], d: D) -> i32 {
    const PG: &[(&str, i32)] = &[("ILIKE", 3), ("JSONB", 4), ("SERIAL", 3), ("BIGSERIAL", 4), ("TIMESTAMPTZ", 4), ("PLPGSQL", 5), ("GENERATE_SERIES", 4), ("ARRAY_AGG", 2), ("BYTEA", 4),
        ("REGCLASS", 4), ("CONCURRENTLY", 3), ("UNLOGGED", 4), ("TSVECTOR", 4), ("TO_TSQUERY", 4), ("LATERAL", 1), ("RETURNING", 1), ("JSONB_BUILD_OBJECT", 4), ("UNNEST", 2),
        ("STRING_AGG", 1), ("PG_CATALOG", 5), ("NOTNULL", 1), ("SYMMETRIC", 2), ("DATE_TRUNC", 2), ("TABLESAMPLE", 1), ("ORDINALITY", 2), ("PERCENTILE_CONT", 1), ("STDIN", 3),
        ("STDOUT", 3)];
    const MY: &[(&str, i32)] = &[("AUTO_INCREMENT", 5), ("UNSIGNED", 2), ("IFNULL", 1), ("GROUP_CONCAT", 3), ("STRAIGHT_JOIN", 5), ("SQL_CALC_FOUND_ROWS", 5), ("REGEXP", 2),
        ("RLIKE", 3), ("TINYINT", 3), ("MEDIUMINT", 4), ("LONGTEXT", 4), ("MEDIUMTEXT", 4), ("DATE_ADD", 2), ("DATE_SUB", 2), ("CURDATE", 3), ("DATE_FORMAT", 3), ("STR_TO_DATE", 3),
        ("UNIX_TIMESTAMP", 2), ("FULLTEXT", 2), ("ZEROFILL", 4), ("INNODB", 5), ("MYISAM", 5), ("UTF8MB4", 5), ("JSON_EXTRACT", 2), ("JSON_UNQUOTE", 3),
        ("LAST_INSERT_ID", 4), ("FOUND_ROWS", 4), ("INFILE", 4), ("ELSEIF", 2), ("DUPLICATE", 3)];
    const LITE: &[(&str, i32)] = &[("PRAGMA", 6), ("AUTOINCREMENT", 5), ("GLOB", 2), ("SQLITE_MASTER", 6), ("SQLITE_SCHEMA", 6), ("SQLITE_SEQUENCE", 6), ("STRFTIME", 3), ("JULIANDAY", 4),
        ("TYPEOF", 2), ("IFNULL", 1), ("TOTAL_CHANGES", 4), ("LAST_INSERT_ROWID", 5), ("JSON_EACH", 3), ("JSON_TREE", 3), ("UNIXEPOCH", 3), ("RANDOMBLOB", 4), ("ZEROBLOB", 4),
        ("INSTR", 1), ("PRINTF", 1), ("ROWID", 2), ("VACUUM", 1), ("ATTACH", 2), ("REINDEX", 1), ("GROUP_CONCAT", 1), ("IIF", 1), ("NOTNULL", 1), ("JSON_EXTRACT", 1),
        ("JSON_GROUP_ARRAY", 4), ("JSON_GROUP_OBJECT", 4), ("TOTAL", 1)];
    const MS: &[(&str, i32)] = &[("NOLOCK", 5), ("NVARCHAR", 3), ("DATETIME2", 4), ("UNIQUEIDENTIFIER", 5), ("GETDATE", 4), ("GETUTCDATE", 4), ("SYSUTCDATETIME", 4), ("SYSDATETIME", 4),
        ("DATEADD", 2), ("DATEDIFF", 2), ("CHARINDEX", 3), ("SP_EXECUTESQL", 5), ("NOCOUNT", 5), ("IIF", 1), ("TRY_CAST", 3), ("TRY_CONVERT", 3), ("PRINT", 2), ("RAISERROR", 3),
        ("OPENJSON", 4), ("DBO", 3), ("SYSNAME", 3), ("PATINDEX", 3), ("NEWID", 4), ("SCOPE_IDENTITY", 5), ("OBJECT_ID", 4), ("DATEPART", 3), ("DATENAME", 3), ("EXEC", 2),
        ("MAXRECURSION", 5), ("SMALLDATETIME", 3), ("DATETIMEOFFSET", 4), ("LEN", 1), ("STUFF", 2), ("INSERTED", 2), ("TRANCOUNT", 2)];
    const ORA: &[(&str, i32)] = &[("VARCHAR2", 5), ("NVARCHAR2", 5), ("NVL", 3), ("NVL2", 4), ("DECODE", 2), ("ROWNUM", 4), ("DUAL", 3), ("SYSDATE", 3), ("SYSTIMESTAMP", 3), ("MINUS", 3),
        ("LISTAGG", 3), ("ELSIF", 2), ("DBMS_OUTPUT", 5), ("PLS_INTEGER", 5), ("CLOB", 2), ("NCLOB", 3), ("BFILE", 4), ("TO_DATE", 1), ("TO_CHAR", 1), ("TO_NUMBER", 1), ("NUMBER", 2),
        ("NOCYCLE", 4), ("SIBLINGS", 5), ("SYS_CONNECT_BY_PATH", 5), ("REGEXP_LIKE", 2), ("MULTISET", 3), ("ADD_MONTHS", 3), ("NEXTVAL", 1), ("CONNECT_BY_ROOT", 5)];
    let words = match d { D::Pg => PG, D::My => MY, D::Lite => LITE, D::Ms => MS, D::Ora => ORA, D::Std => return 1 };
    let (mut s, mut names, mut vars, mut casts) = (0i32, 0i32, 0i32, 0i32);
    let sig: Vec<&T> = t.iter().filter(|x| !matches!(x.k, K::LineC | K::BlockC)).collect();
    for x in t {
        match (d, x.k) {
            (D::My, K::LineC) if x.s.starts_with('#') => s += 2,
            (D::My, K::BlockC) if x.s.starts_with("/*!") => s += 4,
            _ => {}
        }
    }
    for (q, x) in sig.iter().enumerate() {
        let next = sig.get(q + 1);
        let prev = if q > 0 { sig.get(q - 1) } else { None };
        let nw = |w: &str| next.map_or(false, |y| y.k == K::Word && y.s.eq_ignore_ascii_case(w));
        let pw = |w: &str| prev.map_or(false, |y| y.k == K::Word && y.s.eq_ignore_ascii_case(w));
        match x.k {
            K::Word => {
                if x.s.len() <= 20 { s += any(x.s, words); }
                let w = x.s;
                match d {
                    D::Pg => {
                        if w.eq_ignore_ascii_case("array") && next.map_or(false, |y| y.k == K::SqOpen) { s += 3; }
                        if w.eq_ignore_ascii_case("distinct") && nw("on") { s += 2; }
                        if w.eq_ignore_ascii_case("conflict") && pw("on") { s += 2; }
                        if w.eq_ignore_ascii_case("filter") && next.map_or(false, |y| y.k == K::Open) { s += 1; }
                    }
                    D::My => {
                        if w.eq_ignore_ascii_case("engine") && next.map_or(false, |y| y.s == "=") { s += 3; }
                        if w.eq_ignore_ascii_case("ignore") && pw("insert") { s += 3; }
                        if w.eq_ignore_ascii_case("delimiter") && (x.nl > 0 || q == 0) { s += 3; }
                        if w.eq_ignore_ascii_case("filter") && next.map_or(false, |y| y.k == K::Open) { s -= 3; }
                    }
                    D::Lite => {
                        if w.eq_ignore_ascii_case("or") && (pw("insert") || pw("update")) { s += 4; }
                        if w.eq_ignore_ascii_case("rowid") && pw("without") { s += 4; }
                        if w.eq_ignore_ascii_case("conflict") && pw("on") { s += 2; }
                        if w.eq_ignore_ascii_case("filter") && next.map_or(false, |y| y.k == K::Open) { s += 2; }
                    }
                    D::Ms => {
                        if w.starts_with('#') { s += 4; }
                        if w.eq_ignore_ascii_case("top") && (pw("select") || pw("delete") || pw("distinct")) && next.map_or(false, |y| matches!(y.k, K::Num | K::Open | K::Var)) { s += 4; }
                        if w.eq_ignore_ascii_case("apply") && (pw("cross") || pw("outer")) { s += 4; }
                        if w.eq_ignore_ascii_case("go") && x.nl > 0 && next.map_or(true, |y| y.nl > 0) { s += 4; }
                        if (w.eq_ignore_ascii_case("try") || w.eq_ignore_ascii_case("catch")) && pw("begin") { s += 4; }
                        if w.eq_ignore_ascii_case("identity") && next.map_or(false, |y| y.k == K::Open) { s += 3; }
                        if w.eq_ignore_ascii_case("isnull") && next.map_or(false, |y| y.k == K::Open) { s += 2; }
                    }
                    D::Ora => {
                        if w.eq_ignore_ascii_case("connect") && nw("by") { s += 5; }
                        if w.eq_ignore_ascii_case("immediate") && pw("execute") { s += 4; }
                    }
                    D::Std => {}
                }
            }
            K::QId => {
                let c = x.s.as_bytes()[0];
                match d {
                    D::My if c == b'`' => { names += 1; s += if names == 1 { 3 } else if names < 5 { 1 } else { 0 }; }
                    D::My | D::Ora if c == b'[' => s -= 4,
                    D::Lite if c == b'`' || c == b'[' => { names += 1; if names <= 2 { s += 1; } }
                    D::Ms if c == b'[' => { names += 1; s += if names == 1 { 2 } else if names < 5 { 1 } else { 0 }; }
                    D::Ms | D::Pg | D::Ora if c == b'`' => s -= 3,
                    _ => {}
                }
            }
            K::Str => {
                let b = x.s.as_bytes();
                match d {
                    D::Pg => { if b[0] == b'$' { s += 4; } else if b[0] | 0x20 == b'e' && b.len() > 1 && b[1] == b'\'' { s += 3; } }
                    D::My => { if x.s.contains("\\'") || x.s.contains("\\\"") { s += 3; } }
                    D::Ms => { if b[0] == b'N' && b.len() > 1 && b[1] == b'\'' && vars < 100 { s += 1; } }
                    D::Ora => { if matches!(b[0] | 0x20, b'q') || (b.len() > 2 && b[0] | 0x20 == b'n' && b[1] | 0x20 == b'q') { s += 5; } }
                    _ => {}
                }
            }
            K::Var => {
                let b = x.s.as_bytes();
                vars += 1;
                match d {
                    D::Pg => { if b[0] == b'$' && b.len() > 1 && b[1].is_ascii_digit() && vars <= 2 { s += 2; } else if b[0] == b':' && b.len() > 1 && matches!(b[1], b'\'' | b'"') { s += 3; } }
                    D::My => { if b[0] == b'@' && vars <= 2 { s += 1; } }
                    D::Lite => { if b[0] == b'?' && b.len() > 1 { s += 3; } }
                    D::Ms => { if x.s.starts_with("@@") { s += 2; } else if b[0] == b'@' && vars <= 3 { s += 1; } }
                    D::Ora => { if b[0] == b':' && vars <= 2 { s += if b.len() > 1 && b[1].is_ascii_digit() { 2 } else { 1 }; } }
                    D::Std => {}
                }
            }
            K::Op => match d {
                D::Pg => {
                    if x.s == "::" { casts += 1; if casts <= 3 { s += 3; } }
                    if matches!(x.s, "@>" | "<@" | "#>" | "#>>" | "~*" | "!~" | "!~*" | "||/" | "<->" | "?|" | "?&" | "@@") { s += 3; }
                }
                D::My => { if x.s == "<=>" { s += 3; } if x.s == ":=" && prev.map_or(false, |y| y.k == K::Var) { s += 3; } }
                D::Ms => { if matches!(x.s, "+=" | "-=" | "*=" | "/=") { s += 2; } if matches!(x.s, "!<" | "!>") { s += 4; } }
                D::Ora => { if x.s == ":=" && casts == 0 { casts = 1; s += 1; } }
                _ => {}
            },
            // PostgreSQL has no [bracketed names]: a bracket that follows white space is not a subscript
            K::SqOpen => { if d == D::Pg && x.sp && !pw("array") { s -= 4; } }
            K::Num => { if d == D::Ms && x.s.starts_with('$') && x.s.contains('.') { s += 2; } }
            K::Other => { if d == D::Ora && (x.s == "(+)" || x.s.starts_with("<<")) { s += 5; } }
            _ => {}
        }
    }
    s
}
fn detect(src: &str) -> D {
    // the beginning of a long text is enough
    let mut cut = src.len().min(200_000);
    while !src.is_char_boundary(cut) { cut -= 1; }
    let head = match src[..cut].rfind('\n') { Some(x) if cut < src.len() => &src[..x], _ => &src[..cut] };
    let mut best = (D::Std, i32::MIN);
    for d in [D::Std, D::Pg, D::My, D::Ms, D::Ora, D::Lite] {
        let (t, errs) = lex(head, d);
        let score = evidence(&t, d) - 8 * errs as i32;
        if score > best.1 { best = (d, score); }
    }
    best.0
}

// ====================================================================================================== entry
pub struct Res { pub text: String, pub dialect: D, pub kept: bool, pub warn: Vec<String> }
pub fn format(src: &str, dialect: Option<D>, o: &Opts) -> Res {
    let d = dialect.unwrap_or_else(|| detect(src));
    let (doc, _) = Doc::new(src, d);
    let an = analyse(&doc);
    let (mut text, emitted) = layout(&doc, &an, o);
    let mut warn = vec![];
    let line = |t: &T| 1 + src[..t.s.as_ptr() as usize - src.as_ptr() as usize].matches('\n').count();
    for (i, t) in doc.t.iter().enumerate() {
        if warn.len() >= 5 { break; }
        if t.bad {
            warn.push(match t.k {
                K::BlockC => format!("The comment that starts on line {} is never closed (*/ is missing).", line(t)),
                K::QId => format!("The quoted name that starts on line {} is never closed.", line(t)),
                _ => format!("The text in quotes that starts on line {} is never closed.", line(t)),
            });
        } else if t.k == K::Open && doc.mate[i] == NONE {
            warn.push(format!("The bracket opened on line {} is never closed.", line(t)));
        } else if t.k == K::Close && doc.mate[i] == NONE {
            warn.push(format!("The closing bracket on line {} has no opening bracket.", line(t)));
        }
    }
    let kept = !same_tokens(&doc, &an, &text, &emitted);
    if kept { text = src.to_string(); }
    Res { text, dialect: d, kept, warn }
}
fn dialect_name(d: D) -> &'static str { match d { D::Std => "standard", D::Pg => "postgres", D::My => "mysql", D::Lite => "sqlite", D::Ms => "tsql", D::Ora => "oracle" } }

/// {sql, dialect ("auto" | standard | postgres | mysql | sqlite | tsql | oracle), indent (spaces; 0 = tab),
///  keywords ("upper" | "lower" | "keep"), lines (line breaks between statements), inline}
///  → {text, dialect, kept, warn}
pub fn run(input: &[u8]) -> R {
    let a = arg(input)?;
    let ind = a.get("indent").and_then(|v| v.as_u64()).unwrap_or(2).min(16) as usize;
    let case = match s(&a, "keywords") {
        "lower" => 2,
        "keep" => 0,
        "upper" => 1,
        _ => if a.get("uppercase").and_then(|v| v.as_bool()) == Some(false) { 2 } else { 1 },
    };
    let o = Opts {
        indent: if ind == 0 { "\t".into() } else { " ".repeat(ind) },
        case,
        lines: a.get("lines").and_then(|v| v.as_u64()).unwrap_or(1).clamp(1, 5) as usize,
        oneline: a.get("inline").and_then(|v| v.as_bool()).unwrap_or(false),
    };
    let d = match s(&a, "dialect") { "standard" => Some(D::Std), "postgres" => Some(D::Pg), "mysql" => Some(D::My), "sqlite" => Some(D::Lite), "tsql" => Some(D::Ms), "oracle" => Some(D::Ora), _ => None };
    let r = format(s(&a, "sql"), d, &o);
    js(json!({ "text": r.text, "dialect": dialect_name(r.dialect), "kept": r.kept, "warn": r.warn }))
}
/// the tokens of a text, for the tests: [[kind, text], …]
pub fn tokens(input: &[u8]) -> R {
    let a = arg(input)?;
    let d = match s(&a, "dialect") { "postgres" => D::Pg, "mysql" => D::My, "sqlite" => D::Lite, "tsql" => D::Ms, "oracle" => D::Ora, _ => D::Std };
    let (doc, _) = Doc::new(s(&a, "sql"), d);
    let an = analyse(&doc);
    js(json!(doc.t.iter().enumerate().map(|(i, t)| json!([format!("{:?}", t.k), t.s, an.kw[i]])).collect::<Vec<_>>()))
}
