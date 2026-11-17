//! JSON formatter that changes nothing but white space. Member order, duplicate keys and the spelling of every
//! number and string are kept exactly (the browser's JSON.parse → JSON.stringify moves integer-like keys to the front,
//! drops duplicate keys and rewrites numbers such as 1.0, 1e5 or 12345678901234567890).
//! Op: "jsonfmt:<indent>:<sort>" — indent 2 | 4 | -1 (tab) | 0 (minify), sort 0 | 1; input = the text itself (UTF-8).
//! (The text is not wrapped in a JSON request: a text box can hold a lone surrogate, which no JSON envelope survives.)
//! Output JSON: { "out", "values", "objects", "arrays", "keys", "depth", "duplicates": [{ "key", "line" }] }
//! Errors: Err(JSON { "message", "line", "column", "pos" }) — pos in UTF-16 units, for selecting the spot in a text box.
#[cfg(feature = "json")]
use crate::{js, R};
#[cfg(feature = "json")]
use serde_json::json;

const MAX_DEPTH: usize = 512;

pub enum Node<'a> { Lit(&'a str), Arr(Vec<Node<'a>>), Obj(Vec<(&'a str, Node<'a>)>) }
struct P<'a> { s: &'a str, b: &'a [u8], i: usize, values: usize, objects: usize, arrays: usize, keys: usize, depth: usize, dups: Vec<(String, usize)> }
type E = (String, usize);

impl<'a> P<'a> {
    fn ws(&mut self) { while let Some(&c) = self.b.get(self.i) { if c == b' ' || c == b'\n' || c == b'\r' || c == b'\t' { self.i += 1; } else { break; } } }
    fn err<T>(&self, m: &str, at: usize) -> Result<T, E> { Err((m.to_string(), at)) }
    /// What is at `at`, in words, for "expected …" messages.
    fn found(&self, at: usize) -> String {
        match self.s[at..].chars().next() { None => "the end of the text".into(), Some(c) if c.is_control() => format!("a control character (U+{:04X})", c as u32), Some(c) => { let w: String = self.s[at..].chars().take_while(|x| x.is_alphanumeric() || *x == '_').take(12).collect(); if w.chars().count() > 1 { format!("“{w}”") } else { format!("“{c}”") } } }
    }
    fn value(&mut self, depth: usize) -> Result<Node<'a>, E> {
        self.ws();
        if depth > MAX_DEPTH { return self.err(&format!("Nested deeper than {MAX_DEPTH} levels"), self.i); }
        self.depth = self.depth.max(depth); self.values += 1;
        let at = self.i;
        match self.b.get(at).copied() {
            None => self.err(if at == 0 || self.s.trim().is_empty() { "Nothing to format — the text is empty" } else { "The text ends where a value should be" }, at),
            Some(b'{') => {
                self.i += 1; self.objects += 1; let mut m: Vec<(&'a str, Node<'a>)> = Vec::new(); let mut seen = std::collections::HashSet::new();
                self.ws();
                if self.b.get(self.i) == Some(&b'}') { self.i += 1; return Ok(Node::Obj(m)); }
                loop {
                    self.ws(); let k = self.i;
                    match self.b.get(k).copied() {
                        Some(b'"') => {}
                        Some(b'}') => return self.err("Trailing comma before } — remove the last comma", k),
                        Some(b'\'') => return self.err("Keys and strings need double quotes (\"), not single quotes", k),
                        None => return self.err("The text ends inside an object — a } is missing", k),
                        Some(c) if c.is_ascii_alphabetic() || c == b'_' || c == b'$' => return self.err("Object keys must be in double quotes", k),
                        _ => return self.err(&format!("Expected a key in double quotes, found {}", self.found(k)), k),
                    }
                    let key = self.string()?; self.keys += 1;
                    if !seen.insert(unescape(key)) { let line = 1 + self.s[..k].matches('\n').count(); self.dups.push((unescape(key), line)); }
                    self.ws();
                    if self.b.get(self.i) != Some(&b':') { let at = self.i; return self.err(&format!("Expected : after the key, found {}", self.found(at)), at); }
                    self.i += 1;
                    self.ws();
                    if self.b.get(self.i) == Some(&b'}') { return self.err("A value is missing after the colon", self.i); }
                    let v = self.value(depth + 1)?; m.push((key, v));
                    self.ws();
                    match self.b.get(self.i).copied() {
                        Some(b',') => self.i += 1,
                        Some(b'}') => { self.i += 1; return Ok(Node::Obj(m)); }
                        None => return self.err("The text ends inside an object — a } is missing", self.i),
                        Some(b'"') => return self.err("A comma is missing between two members", self.i),
                        _ => { let at = self.i; return self.err(&format!("Expected , or }} after a value, found {}", self.found(at)), at); }
                    }
                }
            }
            Some(b'[') => {
                self.i += 1; self.arrays += 1; let mut a = Vec::new();
                self.ws();
                if self.b.get(self.i) == Some(&b']') { self.i += 1; return Ok(Node::Arr(a)); }
                loop {
                    self.ws();
                    if self.b.get(self.i) == Some(&b']') { return self.err("Trailing comma before ] — remove the last comma", self.i); }
                    if self.b.get(self.i) == Some(&b',') { return self.err(if a.is_empty() { "A value is missing before this comma" } else { "Two commas in a row — a value is missing" }, self.i); }
                    a.push(self.value(depth + 1)?);
                    self.ws();
                    match self.b.get(self.i).copied() {
                        Some(b',') => self.i += 1,
                        Some(b']') => { self.i += 1; return Ok(Node::Arr(a)); }
                        None => return self.err("The text ends inside an array — a ] is missing", self.i),
                        _ => { let at = self.i; return self.err(&format!("Expected , or ] after a value, found {} — is a comma missing?", self.found(at)), at); }
                    }
                }
            }
            Some(b'"') => Ok(Node::Lit(self.string()?)),
            Some(b'-') | Some(b'0'..=b'9') => Ok(Node::Lit(self.number()?)),
            Some(b'\'') => self.err("Strings need double quotes (\"), not single quotes", at),
            Some(b'/') => self.err("Comments are not allowed in JSON", at),
            Some(b'+') => self.err("A number cannot start with +", at),
            Some(b'.') => self.err("A number needs a digit before the decimal point (0.5, not .5)", at),
            Some(b',') => self.err("A value is missing before this comma", at),
            Some(b']') | Some(b'}') => self.err(&format!("Unexpected {} — nothing is open here", self.found(at)), at),
            Some(c) if c.is_ascii_alphabetic() || c >= 0x80 => {
                let w: String = self.s[at..].chars().take_while(|x| x.is_alphanumeric() || *x == '_').collect();
                for lit in ["true", "false", "null"] { if w == lit { self.i += lit.len(); return Ok(Node::Lit(&self.s[at..at + lit.len()])); } }
                let hint = match w.as_str() {
                    "True" | "TRUE" => "write true in lower case", "False" | "FALSE" => "write false in lower case", "None" | "nil" | "NULL" | "Null" => "JSON's word is null",
                    "undefined" => "JSON has no undefined — use null or leave the member out", "NaN" | "Infinity" => "JSON has no NaN or Infinity — use null or a string", _ => "text must be in double quotes",
                };
                self.err(&format!("“{}” is not a JSON value — {hint}", w.chars().take(24).collect::<String>()), at)
            }
            Some(_) => self.err(&format!("Unexpected {} where a value should be", self.found(at)), at),
        }
    }
    fn string(&mut self) -> Result<&'a str, E> {
        let start = self.i; self.i += 1;
        loop {
            match self.b.get(self.i).copied() {
                None => return self.err("This string is never closed — a \" is missing", start),
                Some(b'"') => { self.i += 1; return Ok(&self.s[start..self.i]); }
                Some(b'\\') => {
                    let at = self.i;
                    match self.b.get(at + 1).copied() {
                        Some(b'"') | Some(b'\\') | Some(b'/') | Some(b'b') | Some(b'f') | Some(b'n') | Some(b'r') | Some(b't') => self.i += 2,
                        Some(b'u') => { let h = self.b.get(at + 2..at + 6); if h.map_or(false, |h| h.iter().all(|c| c.is_ascii_hexdigit())) { self.i += 6; } else { return self.err("\\u must be followed by four hex digits", at); } }
                        None => return self.err("This string is never closed — a \" is missing", start),
                        Some(_) => { let c = self.s[at + 1..].chars().next().unwrap_or(' '); return self.err(&format!("\\{c} is not an escape JSON knows (allowed: \\\" \\\\ \\/ \\b \\f \\n \\r \\t \\uXXXX)"), at); }
                    }
                }
                Some(c) if c < 0x20 => return self.err(match c { b'\n' | b'\r' => "A line break inside a string — write \\n, or close the string with \"", b'\t' => "A tab character inside a string — write \\t", _ => "A control character inside a string — write it as \\u00XX" }, self.i),
                Some(_) => self.i += 1,
            }
        }
    }
    fn number(&mut self) -> Result<&'a str, E> {
        let start = self.i; let d = |p: &P, i: usize| p.b.get(i).map_or(false, |c| c.is_ascii_digit());
        if self.b[self.i] == b'-' { self.i += 1; }
        if !d(self, self.i) { return self.err("A minus sign must be followed by a digit", start); }
        if self.b[self.i] == b'0' { self.i += 1; if d(self, self.i) { return self.err("Numbers cannot have leading zeros", start); } } else { while d(self, self.i) { self.i += 1; } }
        if self.b.get(self.i) == Some(&b'.') { self.i += 1; if !d(self, self.i) { return self.err("A decimal point must be followed by a digit", self.i - 1); } while d(self, self.i) { self.i += 1; } }
        if matches!(self.b.get(self.i), Some(b'e') | Some(b'E')) { let e = self.i; self.i += 1; if matches!(self.b.get(self.i), Some(b'+') | Some(b'-')) { self.i += 1; } if !d(self, self.i) { return self.err("An exponent (e) must be followed by digits", e); } while d(self, self.i) { self.i += 1; } }
        if self.b.get(self.i).map_or(false, |c| c.is_ascii_alphanumeric() || *c == b'.' || *c == b'_') {
            let c = self.b[self.i];
            return self.err(if c == b'x' || c == b'X' { "Hexadecimal numbers are not allowed in JSON" } else if c == b'_' { "Numbers cannot contain underscores" } else if c == b'.' { "A number can have only one decimal point" } else if c == b'n' { "Numbers cannot have a suffix (n)" } else { "Letters cannot follow a number" }, self.i);
        }
        Ok(&self.s[start..self.i])
    }
}
/// The text a key token stands for (for comparing and sorting keys): escapes resolved.
pub fn unescape(tok: &str) -> String { serde_json::from_str::<String>(tok).unwrap_or_else(|_| tok.trim_matches('"').to_string()) }

#[allow(dead_code)]
pub fn emit(n: &Node, ind: &str, depth: usize, sort: bool, o: &mut String) {
    let nl = |o: &mut String, d: usize| { if !ind.is_empty() { o.push('\n'); for _ in 0..d { o.push_str(ind); } } };
    match n {
        Node::Lit(t) => o.push_str(t),
        Node::Arr(a) => {
            if a.is_empty() { o.push_str("[]"); return; }
            o.push('[');
            for (i, x) in a.iter().enumerate() { if i > 0 { o.push(','); } nl(o, depth + 1); emit(x, ind, depth + 1, sort, o); }
            nl(o, depth); o.push(']');
        }
        Node::Obj(m) => {
            if m.is_empty() { o.push_str("{}"); return; }
            let mut order: Vec<usize> = (0..m.len()).collect();
            if sort { let keys: Vec<String> = m.iter().map(|(k, _)| unescape(k)).collect(); order.sort_by(|&x, &y| keys[x].encode_utf16().cmp(keys[y].encode_utf16())); } // the order JavaScript's sort gives; stable, so duplicate keys keep their order
            o.push('{');
            for (i, &j) in order.iter().enumerate() { if i > 0 { o.push(','); } nl(o, depth + 1); o.push_str(m[j].0); o.push(':'); if !ind.is_empty() { o.push(' '); } emit(&m[j].1, ind, depth + 1, sort, o); }
            nl(o, depth); o.push('}');
        }
    }
}
#[allow(dead_code)]
pub struct Parsed<'a> { pub root: Node<'a>, pub values: usize, pub objects: usize, pub arrays: usize, pub keys: usize, pub depth: usize, pub dups: Vec<(String, usize)> }
/// Where a problem is: (line, column in characters, position in UTF-16 units from the start of `text`).
#[allow(dead_code)]
pub struct Problem { pub message: String, pub line: usize, pub column: usize, pub pos: usize }
/// Parse a whole JSON text (a byte-order mark in front is skipped). Nothing is converted: the tree points into `text`.
pub fn parse(text: &str) -> Result<Parsed<'_>, Problem> {
    let s = text.strip_prefix('\u{feff}').unwrap_or(text); let skipped = text.len() - s.len(); // a byte-order mark is not part of the JSON
    let mut p = P { s, b: s.as_bytes(), i: 0, values: 0, objects: 0, arrays: 0, keys: 0, depth: 0, dups: Vec::new() };
    let r = p.value(0).and_then(|n| { p.ws(); if p.i < p.b.len() { let at = p.i; p.err(&format!("Unexpected {} after the end of the JSON value{}", p.found(at), if matches!(p.b[at], b'{' | b'[') { " — several values need to be inside one array, or use JSON Lines (one per line)" } else { "" }), at) } else { Ok(n) } });
    match r {
        Ok(root) => Ok(Parsed { root, values: p.values, objects: p.objects, arrays: p.arrays, keys: p.keys, depth: p.depth, dups: p.dups }),
        Err((message, at)) => { let before = &s[..at.min(s.len())];
            Err(Problem { message, line: 1 + before.matches('\n').count(), column: 1 + before.rsplit('\n').next().unwrap_or("").chars().count(), pos: text[..skipped].encode_utf16().count() + before.encode_utf16().count() }) }
    }
}
#[cfg(feature = "json")]
pub fn run(opts: &str, input: &[u8]) -> R {
    let mut o = opts.split(':');
    let indent: i64 = o.next().and_then(|x| x.parse().ok()).unwrap_or(2);
    let sort = o.next() == Some("1");
    let text = std::str::from_utf8(input).map_err(|_| json!({ "message": "The text is not valid UTF-8", "line": 1, "column": 1, "pos": 0 }).to_string())?;
    let ind = if indent < 0 { "\t".to_string() } else { " ".repeat(indent.min(16) as usize) };
    match parse(text) {
        Ok(p) => { let mut o = String::with_capacity(text.len() + text.len() / 4); emit(&p.root, &ind, 0, sort, &mut o);
            js(json!({ "out": o, "values": p.values, "objects": p.objects, "arrays": p.arrays, "keys": p.keys, "depth": p.depth, "duplicates": p.dups.iter().map(|(k, l)| json!({ "key": k, "line": l })).collect::<Vec<_>>() })) }
        Err(e) => Err(json!({ "message": e.message, "line": e.line, "column": e.column, "pos": e.pos }).to_string()),
    }
}
