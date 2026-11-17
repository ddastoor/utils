//! YAML ⇄ JSON ⇄ TOML. The three parsers are libraries (JSON: our lossless reader shared with the JSON Formatter,
//! wasm/devcore/src/jsonfmt.rs; YAML: serde_yaml_ng = libyaml in Rust; TOML: the toml crate). What they read is kept in
//! one small model, `V`, and written by our own three writers, so that nothing is lost or re-spelled on the way:
//!   - numbers: a JSON number keeps its digits (12345678901234567890, 1.10, 1e400 are not pushed through a 64-bit
//!     float), YAML integers up to 128 bits are exact, TOML gets an integer only if it fits its 64 bits — otherwise
//!     the conversion says so instead of writing a rounded float;
//!   - .inf / .nan travel between YAML and TOML (JSON has none: an error that says where);
//!   - TOML dates and times stay dates in TOML and YAML, and become strings in JSON;
//!   - YAML output quotes every string that some YAML parser would read as something else (no, yes, on, 1_000, 1:30,
//!     0x10, 2026-01-01, ~, …: the "Norway problem"), so the text comes back as the same data from YAML 1.1 parsers
//!     (PyYAML, Ruby, older Go) and YAML 1.2 parsers alike; floats are written as 1.0e+21 for the same reason;
//!   - TOML output: tables and arrays of tables as sections, short arrays on one line, multi-line strings as '''…'''.
use crate::jsonfmt::{self, Node};
use crate::{e, el, s, BLANK, R};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fmt::Write;

#[derive(Clone, Debug, PartialEq)]
pub enum V {
    Null,
    Bool(bool),
    /// A number as decimal text: a JSON literal exactly as written, or a YAML / TOML integer.
    Num(String),
    /// A YAML / TOML float (may be infinite or NaN).
    Float(f64),
    Str(String),
    /// A TOML date, time or date-time, as TOML writes it.
    Date(String),
    Seq(Vec<V>),
    /// Keys are scalars (YAML allows numbers, booleans and null as keys; JSON and TOML get their text).
    Map(Vec<(V, V)>),
}
type Notes = Vec<String>;

// ------------------------------------------------------------------ JSON in
/// The text of a JSON string token (quotes included). A lone surrogate (\ud800 without its partner) cannot be written
/// in YAML, TOML or UTF-8 at all: it becomes U+FFFD and a note says so.
fn json_str(tok: &str, notes: &mut Notes) -> String {
    let inner = &tok[1..tok.len() - 1];
    if !inner.contains('\\') { return inner.to_string(); }
    let mut o = String::with_capacity(inner.len());
    let mut it = inner.chars().peekable();
    let hex4 = |it: &mut std::iter::Peekable<std::str::Chars>| -> u32 { let mut n = 0; for _ in 0..4 { n = n * 16 + it.next().and_then(|c| c.to_digit(16)).unwrap_or(0); } n };
    let mut lone = false;
    while let Some(c) = it.next() {
        if c != '\\' { o.push(c); continue; }
        match it.next() {
            Some('n') => o.push('\n'), Some('t') => o.push('\t'), Some('r') => o.push('\r'), Some('b') => o.push('\u{8}'), Some('f') => o.push('\u{c}'),
            Some('u') => {
                let hi = hex4(&mut it);
                if (0xD800..0xDC00).contains(&hi) {
                    let mut look = it.clone();
                    if look.next() == Some('\\') && look.next() == Some('u') { let lo = hex4(&mut look); if (0xDC00..0xE000).contains(&lo) { it = look; o.push(char::from_u32(0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00)).unwrap_or('\u{fffd}')); continue; } }
                    lone = true; o.push('\u{fffd}');
                } else if (0xDC00..0xE000).contains(&hi) { lone = true; o.push('\u{fffd}'); } else { o.push(char::from_u32(hi).unwrap_or('\u{fffd}')); }
            }
            Some(x) => o.push(x), // \" \\ \/
            None => {}
        }
    }
    if lone && !notes.iter().any(|n| n.starts_with("A lone surrogate")) { notes.push("A lone surrogate (half of an emoji escape such as \\ud83d without its second half) is not a character: it was replaced by \u{fffd}.".into()); }
    o
}
fn from_json(n: &Node, notes: &mut Notes) -> V {
    match n {
        Node::Lit(t) => match t.as_bytes()[0] { b'"' => V::Str(json_str(t, notes)), b't' => V::Bool(true), b'f' => V::Bool(false), b'n' => V::Null, _ => V::Num(t.to_string()) },
        Node::Arr(a) => V::Seq(a.iter().map(|x| from_json(x, notes)).collect()),
        Node::Obj(m) => {
            // a key written twice: the last value, at the place of the first (as JSON.parse does); the caller adds the note
            let mut out: Vec<(V, V)> = Vec::with_capacity(m.len()); let mut at: HashMap<String, usize> = HashMap::new();
            for (k, v) in m {
                let key = json_str(k, notes); let val = from_json(v, notes);
                match at.get(&key) { Some(&i) => out[i].1 = val, None => { at.insert(key.clone(), out.len()); out.push((V::Str(key), val)); } }
            }
            V::Map(out)
        }
    }
}
fn read_json(t: &str, notes: &mut Notes) -> Result<Vec<V>, Value> {
    if t.trim_matches(BLANK).is_empty() { return Ok(vec![]); }
    let p = jsonfmt::parse(t).map_err(|x| el(format!("JSON: {}", x.message), x.line, x.column))?;
    for (k, line) in p.dups.iter().take(5) { notes.push(format!("The key \"{k}\" is there twice (line {line}): the last value is used.")); }
    if p.dups.len() > 5 { notes.push(format!("… and {} more keys that are there twice.", p.dups.len() - 5)); }
    Ok(vec![from_json(&p.root, notes)])
}

// ------------------------------------------------------------------ YAML in
struct Vis;
fn key_id(k: &V) -> String { match k { V::Str(x) => format!("s{x}"), V::Num(x) => format!("n{x}"), V::Float(f) => format!("f{f:?}"), V::Bool(b) => format!("b{b}"), V::Null => "~".into(), V::Date(x) => format!("d{x}"), other => format!("{other:?}") } }
impl<'de> serde::de::Visitor<'de> for Vis {
    type Value = V;
    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { f.write_str("any YAML value") }
    fn visit_bool<E>(self, b: bool) -> Result<V, E> { Ok(V::Bool(b)) }
    fn visit_i64<E>(self, n: i64) -> Result<V, E> { Ok(V::Num(n.to_string())) }
    fn visit_u64<E>(self, n: u64) -> Result<V, E> { Ok(V::Num(n.to_string())) }
    fn visit_i128<E>(self, n: i128) -> Result<V, E> { Ok(V::Num(n.to_string())) }
    fn visit_u128<E>(self, n: u128) -> Result<V, E> { Ok(V::Num(n.to_string())) }
    fn visit_f64<E>(self, f: f64) -> Result<V, E> { Ok(V::Float(f)) }
    fn visit_str<E>(self, x: &str) -> Result<V, E> { Ok(V::Str(x.to_string())) }
    fn visit_string<E>(self, x: String) -> Result<V, E> { Ok(V::Str(x)) }
    fn visit_unit<E>(self) -> Result<V, E> { Ok(V::Null) }
    fn visit_none<E>(self) -> Result<V, E> { Ok(V::Null) }
    fn visit_some<D: serde::Deserializer<'de>>(self, d: D) -> Result<V, D::Error> { serde::Deserialize::deserialize(d) }
    fn visit_seq<A: serde::de::SeqAccess<'de>>(self, mut a: A) -> Result<V, A::Error> { let mut v = Vec::new(); while let Some(x) = a.next_element::<V>()? { v.push(x); } Ok(V::Seq(v)) }
    fn visit_map<A: serde::de::MapAccess<'de>>(self, mut a: A) -> Result<V, A::Error> {
        let mut v: Vec<(V, V)> = Vec::new(); let mut seen: HashMap<String, ()> = HashMap::new();
        while let Some((k, x)) = a.next_entry::<V, V>()? {
            if seen.insert(key_id(&k), ()).is_some() { return Err(serde::de::Error::custom(format!("the key {} is there twice in one mapping (a YAML mapping can have each key only once)", match &k { V::Str(x) => format!("\"{x}\""), other => key_text(other).unwrap_or_default() }))); }
            v.push((k, x));
        }
        Ok(V::Map(v))
    }
    // a tagged value (!Ref x, !Sub "…", !!set {…}): the tag is dropped, the value kept
    fn visit_enum<A: serde::de::EnumAccess<'de>>(self, a: A) -> Result<V, A::Error> { use serde::de::VariantAccess; let (_tag, variant): (String, A::Variant) = a.variant()?; variant.newtype_variant::<V>() }
}
impl<'de> serde::Deserialize<'de> for V { fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<V, D::Error> { d.deserialize_any(Vis) } }

/// Merge keys: `<<: *base` (or a list of them) puts the keys of the base into the mapping, at the place of the `<<`.
/// The mapping's own keys win over merged ones, and an earlier base wins over a later one. A `<<` whose value is not
/// a mapping (or a list of mappings) is an ordinary key — a quoted "<<" key arrives here looking the same.
fn merge(v: V) -> V {
    match v {
        V::Seq(a) => V::Seq(a.into_iter().map(merge).collect()),
        V::Map(m) => {
            let m: Vec<(V, V)> = m.into_iter().map(|(k, x)| (k, merge(x))).collect();
            let is_merge = |k: &V, x: &V| matches!(k, V::Str(t) if t == "<<") && match x { V::Map(_) => true, V::Seq(a) => !a.is_empty() && a.iter().all(|i| matches!(i, V::Map(_))), _ => false };
            if !m.iter().any(|(k, x)| is_merge(k, x)) { return V::Map(m); }
            let own: HashMap<String, ()> = m.iter().filter(|(k, x)| !is_merge(k, x)).map(|(k, _)| (key_id(k), ())).collect();
            let mut out: Vec<(V, V)> = Vec::new(); let mut have: HashMap<String, ()> = HashMap::new();
            for (k, x) in m {
                if is_merge(&k, &x) {
                    let bases = match x { V::Map(b) => vec![b], V::Seq(a) => a.into_iter().filter_map(|i| if let V::Map(b) = i { Some(b) } else { None }).collect(), _ => vec![] };
                    for b in bases { for (bk, bv) in b { let id = key_id(&bk); if !own.contains_key(&id) && have.insert(id, ()).is_none() { out.push((bk, bv)); } } }
                } else { have.insert(key_id(&k), ()); out.push((k, x)); }
            }
            V::Map(out)
        }
        other => other,
    }
}
fn yaml_err(x: serde_yaml_ng::Error) -> Value {
    let msg = x.to_string(); let msg = msg.split(" at line").next().unwrap_or("").to_string();
    // "key: message" → the path serde adds in front is kept; libyaml's wording is clear enough as it is
    match x.location() { Some(l) => el(format!("YAML: {msg}"), l.line(), l.column()), None => e(format!("YAML: {msg}")) }
}
fn read_yaml(t: &str) -> Result<Vec<V>, Value> {
    // nothing but white space and comments: no document at all
    if t.lines().all(|l| { let l = l.trim_matches(BLANK); l.is_empty() || l.starts_with('#') }) { return Ok(vec![]); }
    let mut docs = Vec::new();
    for d in serde_yaml_ng::Deserializer::from_str(t) { docs.push(merge(<V as serde::Deserialize>::deserialize(d).map_err(yaml_err)?)); }
    Ok(docs)
}

// ------------------------------------------------------------------ TOML in
fn from_toml(v: toml::Value) -> V {
    match v {
        toml::Value::String(x) => V::Str(x), toml::Value::Integer(i) => V::Num(i.to_string()), toml::Value::Float(f) => V::Float(f), toml::Value::Boolean(b) => V::Bool(b),
        toml::Value::Datetime(d) => V::Date(d.to_string()), toml::Value::Array(a) => V::Seq(a.into_iter().map(from_toml).collect()),
        toml::Value::Table(t) => V::Map(t.into_iter().map(|(k, x)| (V::Str(k), from_toml(x))).collect()),
    }
}
fn read_toml(t: &str) -> Result<Vec<V>, Value> {
    let v: toml::Value = toml::from_str(t).map_err(|x| {
        let (l, c) = x.span().map(|sp| { let pre = &t[..sp.start.min(t.len())]; (pre.matches('\n').count() + 1, pre.rsplit('\n').next().unwrap_or("").chars().count() + 1) }).unwrap_or((0, 0));
        let m = x.message();
        let m = if m.contains("too large") || m.contains("too small") || m.contains("out of range") { "this number does not fit: TOML integers are 64-bit (-9223372036854775808 … 9223372036854775807)".to_string() } else { m.to_string() };
        if l > 0 { el(format!("TOML: {m}"), l, c) } else { e(format!("TOML: {m}")) }
    })?;
    Ok(vec![from_toml(v)])
}

// ------------------------------------------------------------------ shared by the writers
/// Shortest text that reads back as the same 64-bit float: 0.1, 1500.0, 1e21, 1.5e300, 5e-324.
fn float_text(f: f64) -> String { format!("{f:?}") }
fn is_int_text(t: &str) -> bool { let d = t.strip_prefix('-').unwrap_or(t); !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()) }
/// The text a key stands for in JSON and TOML (their keys are always strings).
fn key_text(k: &V) -> Result<String, Value> {
    Ok(match k {
        V::Str(x) | V::Num(x) | V::Date(x) => x.clone(), V::Bool(b) => b.to_string(), V::Null => "null".into(),
        V::Float(f) => if f.is_nan() { ".nan".into() } else if f.is_infinite() { if *f > 0.0 { ".inf".into() } else { "-.inf".into() } } else { float_text(*f) },
        V::Seq(_) => return Err(e("This YAML uses a list as a key — keys must be text, numbers, true / false or null to be converted")),
        V::Map(_) => return Err(e("This YAML uses a mapping as a key — keys must be text, numbers, true / false or null to be converted")),
    })
}
fn path_join(path: &str, k: &str) -> String { if path.is_empty() { k.to_string() } else { format!("{path}.{k}") } }

/// JSON and TOML keys are text: every key becomes its text. Two YAML keys that end up the same (1 and "1", true and
/// "true") are one key there — the last value is used, at the place of the first, and a note says so.
fn text_keys(v: V, notes: &mut Notes) -> Result<V, Value> {
    Ok(match v {
        V::Seq(a) => V::Seq(a.into_iter().map(|x| text_keys(x, notes)).collect::<Result<_, _>>()?),
        V::Map(m) => {
            let mut out: Vec<(V, V)> = Vec::with_capacity(m.len()); let mut at: HashMap<String, usize> = HashMap::new();
            for (k, x) in m {
                let kt = key_text(&k)?; let x = text_keys(x, notes)?;
                match at.get(&kt) {
                    Some(&i) => { out[i].1 = x; if notes.len() < 6 { notes.push(format!("Two keys become the same text key \"{kt}\": the last value is used.")); } }
                    None => { at.insert(kt.clone(), out.len()); out.push((V::Str(kt), x)); }
                }
            }
            V::Map(out)
        }
        other => other,
    })
}

// ------------------------------------------------------------------ JSON out
fn json_quote(x: &str, o: &mut String) { o.push_str(&serde_json::to_string(x).unwrap()); }
fn w_json(v: &V, ind: &str, depth: usize, o: &mut String, from: &str, path: &str) -> Result<(), Value> {
    let nl = |o: &mut String, d: usize| { if !ind.is_empty() { o.push('\n'); for _ in 0..d { o.push_str(ind); } } };
    match v {
        V::Null => o.push_str("null"), V::Bool(b) => o.push_str(if *b { "true" } else { "false" }), V::Num(t) => o.push_str(t),
        V::Float(f) => {
            if !f.is_finite() { return Err(e(format!("JSON has no Infinity or NaN — the value at {} is {} in the {}", if path.is_empty() { "the top" } else { path }, if f.is_nan() { if from == "yaml" { ".nan" } else { "nan" } } else if from == "yaml" { ".inf" } else { "inf" }, from.to_uppercase()))); }
            o.push_str(&float_text(*f));
        }
        V::Str(x) | V::Date(x) => json_quote(x, o),
        V::Seq(a) => {
            if a.is_empty() { o.push_str("[]"); return Ok(()); }
            o.push('[');
            for (i, x) in a.iter().enumerate() { if i > 0 { o.push(','); } nl(o, depth + 1); w_json(x, ind, depth + 1, o, from, &format!("{path}[{i}]"))?; }
            nl(o, depth); o.push(']');
        }
        V::Map(m) => {
            if m.is_empty() { o.push_str("{}"); return Ok(()); }
            o.push('{');
            for (i, (k, x)) in m.iter().enumerate() { if i > 0 { o.push(','); } nl(o, depth + 1); let kt = key_text(k)?; json_quote(&kt, o); o.push(':'); if !ind.is_empty() { o.push(' '); } w_json(x, ind, depth + 1, o, from, &path_join(path, &kt))?; }
            nl(o, depth); o.push('}');
        }
    }
    Ok(())
}

// ------------------------------------------------------------------ YAML out
/// Characters a plain, single-quoted or literal scalar cannot hold safely: control characters (the tab too) and the
/// Unicode line breaks / byte-order mark that YAML parsers treat specially. Such strings are written double-quoted
/// with escapes.
fn y_special(c: char) -> bool { (c < ' ' && c != '\n') || c == '\u{7f}' || c == '\u{85}' || c == '\u{2028}' || c == '\u{2029}' || c == '\u{feff}' || ('\u{80}'..='\u{9f}').contains(&c) }
/// Would some YAML parser read the plain text `x` as something other than this string? Covers YAML 1.1 (PyYAML, Ruby,
/// go-yaml v2: yes / no / on / off / y / n, 0o / 0x / 0b / 010, 1_000, sexagesimal 1:30, dates) and YAML 1.2.
fn y_ambiguous(x: &str) -> bool {
    let l = x.to_ascii_lowercase();
    if matches!(l.as_str(), "null" | "~" | "true" | "false" | "yes" | "no" | "on" | "off" | "y" | "n" | "<<" | "=" | "") { return true; }
    let unsigned = l.strip_prefix(['+', '-']).unwrap_or(&l);
    if matches!(unsigned, ".inf" | ".nan") { return true; }
    let b = unsigned.as_bytes();
    // anything made only of the characters numbers are made of, starting like a number: 12, 1.5, .5, 1e3, 0x1F, 1_000, 1:30, 1.2.3, 2026-01-01
    if !b.is_empty() && (b[0].is_ascii_digit() || (b[0] == b'.' && b.len() > 1 && (b[1].is_ascii_digit() || b[1] == b'_'))) && b.iter().all(|c| c.is_ascii_hexdigit() || matches!(c, b'x' | b'o' | b'_' | b'.' | b':' | b'+' | b'-')) { return true; }
    // a date with a time behind it: 2026-01-01T10:00:00Z, 2026-01-01 10:00
    let xb = x.as_bytes();
    xb.len() >= 8 && xb[..4].iter().all(|c| c.is_ascii_digit()) && xb[4] == b'-' && xb[5].is_ascii_digit() && (xb[6] == b'-' || (xb[6].is_ascii_digit() && xb[7] == b'-'))
}
fn y_plain_ok(x: &str) -> bool {
    let Some(first) = x.chars().next() else { return false };
    if x.starts_with([' ', '\t']) || x.ends_with([' ', '\t']) || x.contains('\n') || x.chars().any(y_special) { return false; }
    if matches!(first, '?' | ':' | ',' | '[' | ']' | '{' | '}' | '#' | '&' | '*' | '!' | '|' | '>' | '\'' | '"' | '%' | '@' | '`') { return false; }
    if first == '-' && (x.len() == 1 || x.as_bytes()[1] == b' ' || x.starts_with("---")) { return false; }
    if x.starts_with("...") || x.ends_with(':') || x.contains(": ") || x.contains(":\t") || x.contains(" #") || x.contains("\t#") { return false; }
    !y_ambiguous(x)
}
fn y_double(x: &str, o: &mut String) {
    o.push('"');
    for c in x.chars() {
        match c {
            '"' => o.push_str("\\\""), '\\' => o.push_str("\\\\"), '\n' => o.push_str("\\n"), '\t' => o.push_str("\\t"), '\r' => o.push_str("\\r"), '\0' => o.push_str("\\0"),
            c if y_special(c) => { if (c as u32) < 0x100 { let _ = write!(o, "\\x{:02x}", c as u32); } else { let _ = write!(o, "\\u{:04x}", c as u32); } }
            c => o.push(c),
        }
    }
    o.push('"');
}
/// A string as a YAML scalar. `block` = the indentation a literal block would get (None: not allowed here — keys).
fn y_str(x: &str, block: Option<usize>, o: &mut String) {
    if y_plain_ok(x) { o.push_str(x); return; }
    let odd = x.chars().any(y_special);
    if x.contains('\n') {
        // a literal block (|) for text with line breaks, when it can hold the text exactly
        let lines: Vec<&str> = x.split('\n').collect();
        let body_ok = !odd && !x.starts_with([' ', '\t', '\n']) && lines.iter().all(|l| !l.ends_with([' ', '\t'])) && x.chars().any(|c| c != '\n');
        if let (Some(ind), true) = (block, body_ok) {
            let trailing = x.len() - x.trim_end_matches('\n').len();
            o.push('|'); o.push_str(match trailing { 0 => "-", 1 => "", _ => "+" });
            let body = x.trim_end_matches('\n');
            for l in body.split('\n') { o.push('\n'); if !l.is_empty() { for _ in 0..ind { o.push(' '); } o.push_str(l); } }
            for _ in 1..trailing { o.push('\n'); }
            return;
        }
        y_double(x, o); return;
    }
    if odd { y_double(x, o); return; }
    o.push('\''); o.push_str(&x.replace('\'', "''")); o.push('\'');
}
/// A number literal for YAML: integers as they are; floats with a decimal point and a signed exponent (1.0e+21) —
/// YAML 1.1 parsers take 1e21 for a string.
fn y_num(t: &str, o: &mut String) {
    if is_int_text(t) { o.push_str(t); return; }
    let lower = t.to_ascii_lowercase();
    match lower.split_once('e') {
        None => o.push_str(&lower),
        Some((m, x)) => { o.push_str(m); if !m.contains('.') { o.push_str(".0"); } o.push('e'); if !x.starts_with(['+', '-']) { o.push('+'); } o.push_str(x); }
    }
}
fn y_scalar(v: &V, block: Option<usize>, o: &mut String) {
    match v {
        V::Null => o.push_str("null"), V::Bool(b) => o.push_str(if *b { "true" } else { "false" }),
        V::Num(t) => y_num(t, o),
        V::Float(f) => if f.is_nan() { o.push_str(".nan") } else if f.is_infinite() { o.push_str(if *f > 0.0 { ".inf" } else { "-.inf" }) } else { y_num(&float_text(*f), o) },
        V::Str(x) => y_str(x, block, o),
        // a date or date-time is one for YAML too; a time alone (17:32:00) would be read as a base-60 number: quoted
        V::Date(x) => if x.len() >= 10 && x.as_bytes()[4] == b'-' { o.push_str(x) } else { o.push('\''); o.push_str(x); o.push('\''); },
        V::Seq(_) => o.push_str("[]"), V::Map(_) => o.push_str("{}"),
    }
}
fn y_pad(n: usize, o: &mut String) { for _ in 0..n { o.push(' '); } }
fn y_map(m: &[(V, V)], ind: usize, o: &mut String, mut inline_first: bool) -> Result<(), Value> {
    for (k, v) in m {
        if !inline_first { y_pad(ind, o); } inline_first = false;
        let start = o.len();
        match k { V::Seq(_) | V::Map(_) => { key_text(k)?; } _ => y_scalar(k, None, o) }
        // "key: value" needs its colon within 1024 characters (libyaml's limit for such keys): a longer key is
        // written the explicit way, "? key" on one line and ": value" on the next
        let long = o.len() - start > 900;
        if long { o.insert_str(start, "? "); o.push('\n'); y_pad(ind, o); }
        o.push(':');
        match v {
            V::Map(x) if !x.is_empty() => { o.push('\n'); y_map(x, ind + 2, o, false)?; }
            V::Seq(x) if !x.is_empty() => { o.push('\n'); y_seq(x, if long { ind + 2 } else { ind }, o, false)?; }
            _ => { o.push(' '); y_scalar(v, Some(ind + 2), o); o.push('\n'); }
        }
    }
    Ok(())
}
fn y_seq(a: &[V], ind: usize, o: &mut String, mut inline_first: bool) -> Result<(), Value> {
    for v in a {
        if !inline_first { y_pad(ind, o); } inline_first = false;
        o.push_str("- ");
        match v {
            V::Map(x) if !x.is_empty() => y_map(x, ind + 2, o, true)?,
            V::Seq(x) if !x.is_empty() => y_seq(x, ind + 2, o, true)?,
            _ => { y_scalar(v, Some(ind + 2), o); o.push('\n'); }
        }
    }
    Ok(())
}
fn w_yaml(v: &V, o: &mut String) -> Result<(), Value> {
    match v {
        V::Map(x) if !x.is_empty() => y_map(x, 0, o, false),
        V::Seq(x) if !x.is_empty() => y_seq(x, 0, o, false),
        _ => { y_scalar(v, Some(2), o); o.push('\n'); Ok(()) }
    }
}

// ------------------------------------------------------------------ TOML out
fn t_key(k: &str, o: &mut String) { if !k.is_empty() && k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') { o.push_str(k); } else { t_basic(k, o); } }
fn t_basic(x: &str, o: &mut String) {
    o.push('"');
    for c in x.chars() {
        match c {
            '"' => o.push_str("\\\""), '\\' => o.push_str("\\\\"), '\n' => o.push_str("\\n"), '\t' => o.push_str("\\t"), '\r' => o.push_str("\\r"), '\u{8}' => o.push_str("\\b"), '\u{c}' => o.push_str("\\f"),
            c if c < ' ' || c == '\u{7f}' => { let _ = write!(o, "\\u{:04X}", c as u32); }
            c => o.push(c),
        }
    }
    o.push('"');
}
/// A string as the value of `key = …`: text with line breaks as a multi-line literal string when that holds it exactly.
fn t_string(x: &str, o: &mut String) {
    let clean = x.chars().all(|c| c == '\n' || c == '\t' || (c >= ' ' && c != '\u{7f}'));
    if x.contains('\n') && clean && !x.contains("'''") && !x.ends_with('\'') && x.chars().any(|c| c != '\n') { o.push_str("'''\n"); o.push_str(x); o.push_str("'''"); } else { t_basic(x, o); }
}
fn t_num(t: &str, path: &str, o: &mut String) -> Result<(), Value> {
    if is_int_text(t) {
        if t.parse::<i64>().is_err() { return Err(e(format!("TOML integers are 64-bit — {t} at {path} does not fit (-9223372036854775808 … 9223372036854775807). Write it as a string to keep every digit."))); }
        o.push_str(t); return Ok(());
    }
    match t.parse::<f64>() { Ok(f) if f.is_finite() => { o.push_str(t); Ok(()) } _ => Err(e(format!("TOML floats are 64-bit — {t} at {path} does not fit"))) }
}
fn t_null(path: &str) -> Value { e(format!("TOML has no null — the value at {} is null", if path.is_empty() { "the top" } else { path })) }
fn t_inline(v: &V, path: &str, o: &mut String) -> Result<(), Value> {
    match v {
        V::Null => return Err(t_null(path)),
        V::Bool(b) => o.push_str(if *b { "true" } else { "false" }), V::Num(t) => t_num(t, path, o)?,
        V::Float(f) => if f.is_nan() { o.push_str("nan") } else if f.is_infinite() { o.push_str(if *f > 0.0 { "inf" } else { "-inf" }) } else { o.push_str(&float_text(*f)) },
        V::Str(x) => t_basic(x, o), V::Date(x) => o.push_str(x),
        V::Seq(a) => { o.push('['); for (i, x) in a.iter().enumerate() { if i > 0 { o.push_str(", "); } t_inline(x, &format!("{path}[{i}]"), o)?; } o.push(']'); }
        V::Map(m) => {
            if m.is_empty() { o.push_str("{}"); return Ok(()); }
            o.push_str("{ ");
            for (i, (k, x)) in m.iter().enumerate() { if i > 0 { o.push_str(", "); } let kt = key_text(k)?; t_key(&kt, o); o.push_str(" = "); t_inline(x, &path_join(path, &kt), o)?; }
            o.push_str(" }");
        }
    }
    Ok(())
}
fn is_table_array(v: &V) -> bool { matches!(v, V::Seq(a) if !a.is_empty() && a.iter().all(|x| matches!(x, V::Map(_)))) }
fn t_header(keys: &[String], double: bool, o: &mut String) {
    if !o.is_empty() { o.push('\n'); }
    o.push_str(if double { "[[" } else { "[" });
    for (i, k) in keys.iter().enumerate() { if i > 0 { o.push('.'); } t_key(k, o); }
    o.push_str(if double { "]]\n" } else { "]\n" });
}
fn t_table(m: &[(V, V)], keys: &mut Vec<String>, path: &str, o: &mut String) -> Result<(), Value> {
    // first the plain values of this table, then its sub-tables and arrays of tables (TOML's sections)
    for (k, v) in m {
        if matches!(v, V::Map(_)) || is_table_array(v) { continue; }
        let kt = key_text(k)?; let p = path_join(path, &kt);
        t_key(&kt, o); o.push_str(" = ");
        match v {
            V::Str(x) => t_string(x, o),
            V::Seq(a) if !a.is_empty() => {
                let mut one = String::new(); t_inline(v, &p, &mut one)?;
                if one.len() + kt.len() + 3 <= 88 { o.push_str(&one); } else { o.push_str("[\n"); for (i, x) in a.iter().enumerate() { o.push_str("  "); t_inline(x, &format!("{p}[{i}]"), o)?; o.push_str(",\n"); } o.push(']'); }
            }
            _ => t_inline(v, &p, o)?,
        }
        o.push('\n');
    }
    for (k, v) in m {
        let kt = key_text(k)?; let p = path_join(path, &kt);
        match v {
            V::Map(sub) => {
                keys.push(kt);
                // a table that only holds other tables needs no header of its own ([a.b] implies [a])
                if sub.is_empty() || sub.iter().any(|(_, x)| !matches!(x, V::Map(_)) && !is_table_array(x)) { t_header(keys, false, o); }
                t_table(sub, keys, &p, o)?; keys.pop();
            }
            V::Seq(a) if is_table_array(v) => {
                keys.push(kt);
                for (i, x) in a.iter().enumerate() { if let V::Map(sub) = x { t_header(keys, true, o); t_table(sub, keys, &format!("{p}[{i}]"), o)?; } }
                keys.pop();
            }
            _ => {}
        }
    }
    Ok(())
}

// ------------------------------------------------------------------ the op
pub fn convert(a: &Value) -> R {
    let (text, from, to) = (s(a, "text"), s(a, "from"), s(a, "to"));
    let t = text.strip_prefix('\u{feff}').unwrap_or(text); // a byte-order mark in front is not part of the data
    let indent = a.get("indent").and_then(|x| x.as_u64()).unwrap_or(2).min(16) as usize;
    let mut notes: Notes = Vec::new();
    let docs: Vec<V> = match from {
        "json" => read_json(t, &mut notes)?,
        "yaml" => read_yaml(t)?,
        "toml" => if t.trim_matches(BLANK).is_empty() { vec![] } else { read_toml(t)? },
        _ => return Err(e("unknown input format")),
    };
    let n = docs.len();
    if n == 0 { return Ok(json!({ "out": "", "documents": 0, "notes": notes })); }
    let mut out = String::with_capacity(t.len() + t.len() / 4);
    match to {
        "json" => { let v = text_keys(if n > 1 { V::Seq(docs) } else { docs.into_iter().next().unwrap() }, &mut notes)?; w_json(&v, &" ".repeat(indent), 0, &mut out, from, "")?; }
        "yaml" => { for (i, d) in docs.iter().enumerate() { if i > 0 { out.push_str("---\n"); } w_yaml(d, &mut out)?; } }
        "toml" => {
            if n > 1 { return Err(e(format!("TOML holds one document — this YAML has {n} (separated by ---). Convert them one at a time."))); }
            match &text_keys(docs.into_iter().next().unwrap(), &mut notes)? { V::Map(m) => t_table(m, &mut Vec::new(), "", &mut out)?, V::Seq(_) => return Err(e("TOML needs a table (key = value pairs) at the top — this is a list")), _ => return Err(e("TOML needs a table (key = value pairs) at the top — this is a single value")) }
        }
        _ => return Err(e("unknown output format")),
    }
    Ok(json!({ "out": out, "documents": n, "notes": notes }))
}
