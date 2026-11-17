//! Schema-less decoders for binary messages. Input: raw bytes. Output JSON
//!   {"text": <readable dump>, "count": n, "error": null | "<why the rest could not be read>"}
//! (an Err only when nothing at all could be decoded).
//! protobuf → protoc --decode_raw style; MessagePack → JSON-like text; CBOR → RFC 8949 §8 diagnostic notation.
//! All three readers are our own code: the crates used before (ciborium, rmpv) could not show CBOR simple values or
//! `undefined`, refused large bignums, read MessagePack's unused byte 0xc1 as nil and reported errors as Rust debug text.
use crate::{js, R};
use serde_json::json;
use std::fmt::Write;

/// Deeper nesting than this is refused (protobuf's own limit is 100); it also keeps the wasm stack safe.
const MAX_DEPTH: usize = 100;
/// Longer byte strings are cut in the dump (the count is always given).
const HEX_SHOWN: usize = 256;

fn hexs(b: &[u8]) -> String { let mut o = String::with_capacity(b.len() * 2); for x in b { let _ = write!(o, "{x:02x}"); } o }
fn hex_cut(b: &[u8]) -> String { if b.len() > HEX_SHOWN { format!("{}…", hexs(&b[..HEX_SHOWN])) } else { hexs(b) } }
/// JSON-style string literal; control characters (C0, DEL, C1) and line/paragraph separators are escaped.
fn quote(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""), '\\' => o.push_str("\\\\"), '\n' => o.push_str("\\n"), '\r' => o.push_str("\\r"), '\t' => o.push_str("\\t"),
            c if (c as u32) < 32 || (0x7f..0xa0).contains(&(c as u32)) || c == '\u{2028}' || c == '\u{2029}' => { let _ = write!(o, "\\u{:04x}", c as u32); }
            c => o.push(c),
        }
    }
    o.push('"'); o
}
fn printable(s: &str) -> bool { !s.is_empty() && s.chars().all(|c| !c.is_control() || c == '\n' || c == '\r' || c == '\t') }
/// A float that cannot be mistaken for an integer, in the shortest digits that read back as the same value:
/// 1.0, -4.1, 100000.0, 1.0e+300, 5.0e-324 (RFC 8949 Appendix A writes them this way).
fn fshape(plain: String, sci: String, abs: f64) -> String {
    if abs != 0.0 && (abs >= 1e21 || abs < 1e-6) {
        let (m, e) = sci.split_once('e').unwrap_or((&sci, "0"));
        return format!("{m}{}e{}{e}", if m.contains('.') { "" } else { ".0" }, if e.starts_with('-') { "" } else { "+" });
    }
    if plain.contains('.') { plain } else { format!("{plain}.0") }
}
fn fnum(f: f64) -> String { if f.is_nan() { "NaN".into() } else if f.is_infinite() { (if f > 0.0 { "Infinity" } else { "-Infinity" }).into() } else { fshape(format!("{f}"), format!("{f:e}"), f.abs()) } }
fn fnum32(f: f32) -> String { if f.is_nan() { "NaN".into() } else if f.is_infinite() { (if f > 0.0 { "Infinity" } else { "-Infinity" }).into() } else { fshape(format!("{f}"), format!("{f:e}"), f.abs() as f64) } }
fn stamp(sec: i64, ns: u32) -> Option<String> { chrono::DateTime::from_timestamp(sec, ns).map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true)) }
fn finish(text: String, count: usize, error: Option<String>, empty: &str) -> R {
    match error {
        Some(e) if count == 0 => Err(e),
        e => js(json!({ "text": if count == 0 && text.is_empty() { empty.to_string() } else { text }, "count": count, "error": e })),
    }
}

/// Byte reader with errors in plain words.
struct Rd<'a> { b: &'a [u8], i: usize }
impl<'a> Rd<'a> {
    fn eof(&self, at: usize) -> String { if at >= self.b.len() { format!("the data ends at byte {at}, where another value should start") } else { format!("the data ends in the middle of the value that starts at byte {at}") } }
    fn u8(&mut self, at: usize) -> Result<u8, String> { let x = *self.b.get(self.i).ok_or_else(|| self.eof(at))?; self.i += 1; Ok(x) }
    /// n = 1, 2, 4 or 8 bytes, big-endian
    fn be(&mut self, n: usize, at: usize) -> Result<u64, String> { let s = self.b.get(self.i..self.i + n).ok_or_else(|| self.eof(at))?; self.i += n; Ok(s.iter().fold(0u64, |a, &x| (a << 8) | x as u64)) }
    fn take(&mut self, n: u64, what: &str, at: usize) -> Result<&'a [u8], String> {
        let left = (self.b.len() - self.i) as u64;
        if n > left { return Err(format!("the {what} at byte {at} says {n} bytes but only {left} remain")); }
        let s = &self.b[self.i..self.i + n as usize]; self.i += n as usize; Ok(s)
    }
}

// ------------------------------------------------------------------ protobuf wire format
fn varint(b: &[u8], i: &mut usize) -> Result<u64, String> {
    let at = *i; let mut v: u64 = 0;
    for k in 0..10 { let x = *b.get(*i).ok_or(format!("the data ends inside the varint that starts at byte {at}"))?; *i += 1; v |= ((x & 0x7f) as u64) << (7 * k); if x < 0x80 { return Ok(v); } }
    Err(format!("the varint at byte {at} is longer than 10 bytes"))
}
/// "3, 270, 86942" when the bytes are a run of at least two complete varints (a packed repeated field).
fn packed(s: &[u8]) -> Option<String> {
    let mut i = 0; let mut v = Vec::new();
    while i < s.len() { v.push(varint(s, &mut i).ok()?.to_string()); if v.len() > 64 { return None; } }
    if v.len() < 2 { None } else { Some(v.join(", ")) }
}
struct Pb { n: usize, strong: bool }
/// Dump the message in b[*pos..] at `depth` into `o`. `st.n` = fields read; `st.strong` = it holds a text or message
/// field (evidence that bytes which are also readable text really are a message).
fn pb_msg(b: &[u8], depth: usize, end_group: Option<u64>, pos: &mut usize, sint: bool, o: &mut String, st: &mut Pb) -> Result<(), String> {
    let pad = "  ".repeat(depth);
    while *pos < b.len() {
        let at = *pos;
        let key = varint(b, pos)?;
        let (field, wire) = (key >> 3, key & 7);
        if field == 0 { return Err(format!("field number 0 at byte {at}")); }
        if field > 536_870_911 { return Err(format!("field number {field} at byte {at} is above the limit 536870911")); }
        match wire {
            0 => { let v = varint(b, pos)?;
                   let _ = write!(o, "{pad}{field}: {v}");
                   let mut notes = Vec::new();
                   if v > i64::MAX as u64 { notes.push(format!("int64 {}", v as i64)); }
                   if sint { notes.push(format!("sint {}", ((v >> 1) as i64) ^ -((v & 1) as i64))); }
                   if !notes.is_empty() { let _ = write!(o, "  # {}", notes.join(", ")); }
                   o.push('\n'); }
            1 => { let s = b.get(*pos..*pos + 8).ok_or(format!("the data ends inside the fixed64 of field {field} at byte {at}"))?; *pos += 8; let v = u64::from_le_bytes(s.try_into().unwrap());
                   let _ = writeln!(o, "{pad}{field}: 0x{v:016x}  # fixed64 {v}, double {}", fnum(f64::from_bits(v))); }
            5 => { let s = b.get(*pos..*pos + 4).ok_or(format!("the data ends inside the fixed32 of field {field} at byte {at}"))?; *pos += 4; let v = u32::from_le_bytes(s.try_into().unwrap());
                   let _ = writeln!(o, "{pad}{field}: 0x{v:08x}  # fixed32 {v}, float {}", fnum32(f32::from_bits(v))); }
            2 => {
                let len = varint(b, pos)?; let left = (b.len() - *pos) as u64;
                if len > left { return Err(format!("field {field} at byte {at} says {len} bytes but only {left} remain")); }
                let s = &b[*pos..*pos + len as usize]; *pos += len as usize;
                if s.is_empty() { let _ = writeln!(o, "{pad}{field}: \"\""); st.n += 1; continue; }
                let text = std::str::from_utf8(s).ok().filter(|t| printable(t));
                let mut inner = String::new(); let mut ist = Pb { n: 0, strong: false }; let mut p2 = 0;
                let nested = depth + 1 < MAX_DEPTH && pb_msg(s, depth + 1, None, &mut p2, sint, &mut inner, &mut ist).is_ok() && ist.n > 0;
                // bytes that are both readable text and a well-formed message: a message when the text has control
                // characters ("\n\x05hello" is field 1 = "hello") or the message holds text / messages of its own
                let as_msg = nested && text.map_or(true, |t| ist.strong || t.chars().any(|c| (c as u32) < 32));
                if as_msg {
                    let alt = text.map(|t| { let q: String = t.chars().take(40).collect(); format!("  # or the text {}", quote(&if q.len() < t.len() { format!("{q}…") } else { q })) }).unwrap_or_default();
                    let _ = write!(o, "{pad}{field} {{{alt}\n{inner}{pad}}}\n"); st.strong = true;
                } else if let Some(t) = text {
                    let _ = writeln!(o, "{pad}{field}: {}{}", quote(t), if nested { "  # could also be a nested message" } else { "" });
                    if t.chars().count() >= 3 { st.strong = true; }
                } else {
                    let _ = writeln!(o, "{pad}{field}: 0x{}  # {len} bytes{}{}", hex_cut(s), if s.len() > HEX_SHOWN { format!(" (first {HEX_SHOWN} shown)") } else { String::new() },
                        packed(s).map(|p| format!("; as packed varints: {p}")).unwrap_or_default());
                }
            }
            3 => { if depth + 1 >= MAX_DEPTH { return Err(format!("nested deeper than {MAX_DEPTH} levels at byte {at}")); }
                   let mut inner = String::new(); let mut ist = Pb { n: 0, strong: false };
                   pb_msg(b, depth + 1, Some(field), pos, sint, &mut inner, &mut ist)?; let _ = write!(o, "{pad}{field} {{  # group\n{inner}{pad}}}\n"); st.strong = true; }
            4 => { if end_group == Some(field) { return Ok(()); } return Err(format!("unexpected end-group {field} at byte {at}")); }
            _ => return Err(format!("invalid wire type {wire} at byte {at}")),
        }
        st.n += 1;
    }
    if let Some(g) = end_group { return Err(format!("group {g} is not closed")); }
    Ok(())
}
pub fn protobuf(b: &[u8], sint: bool) -> R {
    let mut o = String::new(); let mut st = Pb { n: 0, strong: false }; let mut p = 0;
    let error = pb_msg(b, 0, None, &mut p, sint, &mut o, &mut st).err().map(|e| format!("Not a valid protobuf message: {e}"));
    finish(o, st.n, error, "(empty message)")
}

// ------------------------------------------------------------------ MessagePack
fn mp_seq(r: &mut Rd, n: u64, map: bool, d: usize, o: &mut String) -> Result<(), String> {
    if n == 0 { o.push_str(if map { "{}" } else { "[]" }); return Ok(()); }
    let pad = "  ".repeat(d + 1);
    o.push_str(if map { "{\n" } else { "[\n" });
    for i in 0..n {
        o.push_str(&pad); mp_item(r, d + 1, o)?;
        if map { o.push_str(": "); mp_item(r, d + 1, o)?; }
        if i + 1 < n { o.push(','); }
        o.push('\n');
    }
    o.push_str(&"  ".repeat(d)); o.push(if map { '}' } else { ']' }); Ok(())
}
fn mp_ext(t: i8, b: &[u8], o: &mut String) {
    if t == -1 && matches!(b.len(), 4 | 8 | 12) {
        let be = |s: &[u8]| s.iter().fold(0u64, |a, &x| (a << 8) | x as u64);
        let (sec, ns): (i64, u32) = match b.len() { 4 => (be(b) as i64, 0), 8 => { let v = be(b); ((v & 0x3_ffff_ffff) as i64, (v >> 34) as u32) } _ => (be(&b[4..12]) as i64, be(&b[..4]) as u32) };
        if ns > 999_999_999 { let _ = write!(o, "<timestamp invalid: {ns} nanoseconds>"); }
        else { match stamp(sec, ns) { Some(s) => { let _ = write!(o, "<timestamp {s}>"); } None => { let _ = write!(o, "<timestamp {sec} s (outside the calendar range)>"); } } }
    } else if b.is_empty() { let _ = write!(o, "<ext type {t}, 0 bytes>"); }
    else { let _ = write!(o, "<ext type {t}, {} byte{}: {}>", b.len(), if b.len() == 1 { "" } else { "s" }, hex_cut(b)); }
}
fn mp_item(r: &mut Rd, d: usize, o: &mut String) -> Result<(), String> {
    let at = r.i;
    if d > MAX_DEPTH { return Err(format!("nested deeper than {MAX_DEPTH} levels at byte {at}")); }
    let m = r.u8(at)?;
    let text = |s: &[u8], o: &mut String| match std::str::from_utf8(s) { Ok(t) => o.push_str(&quote(t)), Err(_) => { let _ = write!(o, "<invalid UTF-8, {} byte{}: {}>", s.len(), if s.len() == 1 { "" } else { "s" }, hex_cut(s)); } };
    let bin = |s: &[u8], o: &mut String| { if s.is_empty() { o.push_str("<bin 0 bytes>"); } else { let _ = write!(o, "<bin {} byte{}: {}>", s.len(), if s.len() == 1 { "" } else { "s" }, hex_cut(s)); } };
    match m {
        0x00..=0x7f => { let _ = write!(o, "{m}"); }
        0xe0..=0xff => { let _ = write!(o, "{}", m as i8); }
        0x80..=0x8f => mp_seq(r, (m & 15) as u64, true, d, o)?,
        0x90..=0x9f => mp_seq(r, (m & 15) as u64, false, d, o)?,
        0xa0..=0xbf => text(r.take((m & 31) as u64, "string", at)?, o),
        0xc0 => o.push_str("null"), 0xc2 => o.push_str("false"), 0xc3 => o.push_str("true"),
        0xc1 => return Err(format!("byte 0xc1 at {at} is never used in MessagePack")),
        0xc4..=0xc6 => { let n = r.be(1 << (m - 0xc4), at)?; bin(r.take(n, "bin", at)?, o); }
        0xc7..=0xc9 => { let n = r.be(1 << (m - 0xc7), at)?; let t = r.u8(at)? as i8; mp_ext(t, r.take(n, "ext", at)?, o); }
        0xca => o.push_str(&fnum32(f32::from_bits(r.be(4, at)? as u32))),
        0xcb => o.push_str(&fnum(f64::from_bits(r.be(8, at)?))),
        0xcc..=0xcf => { let _ = write!(o, "{}", r.be(1 << (m - 0xcc), at)?); }
        0xd0 => { let _ = write!(o, "{}", r.be(1, at)? as u8 as i8); }
        0xd1 => { let _ = write!(o, "{}", r.be(2, at)? as u16 as i16); }
        0xd2 => { let _ = write!(o, "{}", r.be(4, at)? as u32 as i32); }
        0xd3 => { let _ = write!(o, "{}", r.be(8, at)? as i64); }
        0xd4..=0xd8 => { let t = r.u8(at)? as i8; mp_ext(t, r.take(1 << (m - 0xd4), "ext", at)?, o); }
        0xd9..=0xdb => { let n = r.be(1 << (m - 0xd9), at)?; text(r.take(n, "string", at)?, o); }
        0xdc | 0xdd => { let n = r.be(if m == 0xdc { 2 } else { 4 }, at)?; mp_seq(r, n, false, d, o)?; }
        0xde | 0xdf => { let n = r.be(if m == 0xde { 2 } else { 4 }, at)?; mp_seq(r, n, true, d, o)?; }
    }
    Ok(())
}
pub fn msgpack(b: &[u8]) -> R {
    let mut r = Rd { b, i: 0 }; let mut o = String::new(); let mut n = 0; let mut error = None;
    while r.i < b.len() {
        let mut item = String::new();
        match mp_item(&mut r, 0, &mut item) { Ok(()) => { if n > 0 { o.push('\n'); } o.push_str(&item); o.push('\n'); n += 1; } Err(e) => { error = Some(format!("Not valid MessagePack: {e}")); break; } }
    }
    finish(o, n, error, "(nothing to decode)")
}

// ------------------------------------------------------------------ CBOR (diagnostic notation, RFC 8949 §8)
fn half(h: u16) -> f64 {
    let (e, m) = ((h >> 10) & 0x1f, (h & 0x3ff) as f64);
    let v = if e == 0 { m * 2f64.powi(-24) } else if e == 31 { if m == 0.0 { f64::INFINITY } else { f64::NAN } } else { (m + 1024.0) * 2f64.powi(e as i32 - 25) };
    if h & 0x8000 != 0 { -v } else { v }
}
/// The decimal digits of a big-endian unsigned integer of any length (+1 when `plus_one`), by long multiplication
/// in base 10^9.
fn big_dec(b: &[u8], plus_one: bool) -> String {
    let mut limbs: Vec<u32> = vec![0];
    for &x in b {
        let mut carry = x as u64;
        for l in limbs.iter_mut() { let v = (*l as u64) * 256 + carry; *l = (v % 1_000_000_000) as u32; carry = v / 1_000_000_000; }
        if carry > 0 { limbs.push(carry as u32); }
    }
    if plus_one { let mut i = 0; loop { if i == limbs.len() { limbs.push(1); break; } if limbs[i] == 999_999_999 { limbs[i] = 0; i += 1; } else { limbs[i] += 1; break; } } }
    let mut s = limbs.last().unwrap().to_string();
    for l in limbs.iter().rev().skip(1) { let _ = write!(s, "{l:09}"); }
    s
}
/// Read the argument of a head byte: Some(n), or None for the indefinite-length marker (allowed for strings, arrays, maps).
fn cb_arg(r: &mut Rd, ib: u8, at: usize) -> Result<Option<u64>, String> {
    match ib & 31 {
        ai @ 0..=23 => Ok(Some(ai as u64)), 24 => r.be(1, at).map(Some), 25 => r.be(2, at).map(Some), 26 => r.be(4, at).map(Some), 27 => r.be(8, at).map(Some),
        31 if (2..=5).contains(&(ib >> 5)) => Ok(None),
        _ => Err(format!("byte 0x{ib:02x} at {at} is not valid CBOR (a reserved length code)")),
    }
}
fn cb_str(major: u8, s: &[u8], at: usize, o: &mut String) -> Result<(), String> {
    if major == 2 { let _ = write!(o, "h'{}'", hex_cut(s)); if s.len() > HEX_SHOWN { let _ = write!(o, " / {} bytes, first {HEX_SHOWN} shown /", s.len()); } Ok(()) }
    else { o.push_str(&quote(std::str::from_utf8(s).map_err(|_| format!("the text string at byte {at} is not valid UTF-8"))?)); Ok(()) }
}
fn cb_item(r: &mut Rd, d: usize, o: &mut String) -> Result<(), String> {
    let at = r.i;
    if d > MAX_DEPTH { return Err(format!("nested deeper than {MAX_DEPTH} levels at byte {at}")); }
    let ib = r.u8(at)?; let major = ib >> 5;
    if major == 7 {
        match ib & 31 {
            20 => o.push_str("false"), 21 => o.push_str("true"), 22 => o.push_str("null"), 23 => o.push_str("undefined"),
            ai @ 0..=19 => { let _ = write!(o, "simple({ai})"); }
            24 => { let v = r.u8(at)?; if v < 32 { return Err(format!("simple value {v} at byte {at} must be written in one byte")); } let _ = write!(o, "simple({v})"); }
            25 => o.push_str(&fnum(half(r.be(2, at)? as u16))),
            26 => o.push_str(&fnum(f32::from_bits(r.be(4, at)? as u32) as f64)),
            27 => o.push_str(&fnum(f64::from_bits(r.be(8, at)?))),
            31 => return Err(format!("unexpected break (0xff) at byte {at}")),
            _ => return Err(format!("byte 0x{ib:02x} at {at} is not valid CBOR (reserved)")),
        }
        return Ok(());
    }
    let arg = cb_arg(r, ib, at)?;
    let is_break = |r: &mut Rd| -> Result<bool, String> { let x = *r.b.get(r.i).ok_or_else(|| r.eof(at))?; if x == 0xff { r.i += 1; } Ok(x == 0xff) };
    match (major, arg) {
        (0, Some(n)) => { let _ = write!(o, "{n}"); }
        (1, Some(n)) => { let _ = write!(o, "{}", -1 - n as i128); }
        (2 | 3, Some(n)) => cb_str(major, r.take(n, if major == 2 { "byte string" } else { "text string" }, at)?, at, o)?,
        (2 | 3, None) => { // indefinite length: definite chunks of the same kind until the break
            o.push_str("(_ "); let mut first = true;
            while !is_break(&mut *r)? {
                let at2 = r.i; let ib2 = r.u8(at2)?;
                if ib2 >> 5 != major || ib2 & 31 == 31 { return Err(format!("the chunk at byte {at2} of the indefinite-length string at byte {at} is not a {} string", if major == 2 { "byte" } else { "text" })); }
                let n = cb_arg(r, ib2, at2)?.unwrap_or(0);
                if !first { o.push_str(", "); } first = false;
                cb_str(major, r.take(n, "chunk", at2)?, at2, o)?;
            }
            o.push(')');
        }
        (4 | 5, _) => {
            let (map, open, close) = (major == 5, if major == 5 { '{' } else { '[' }, if major == 5 { '}' } else { ']' });
            let pad = "  ".repeat(d + 1); let mut i: u64 = 0;
            o.push(open); if arg.is_none() { o.push('_'); }
            loop {
                match arg { Some(n) => { if i == n { break; } } None => { if is_break(&mut *r)? { break; } } }
                if i > 0 { o.push(','); } o.push('\n'); o.push_str(&pad);
                cb_item(r, d + 1, o)?;
                if map { o.push_str(": "); cb_item(r, d + 1, o)?; }
                i += 1;
            }
            if i > 0 { o.push('\n'); o.push_str(&"  ".repeat(d)); } else if arg.is_none() { o.push(' '); }
            o.push(close);
        }
        (6, Some(tag)) => {
            // tags 2 and 3 around a byte string are big numbers: shown as the number (RFC 8949 §3.4.3)
            if (tag == 2 || tag == 3) && r.b.get(r.i).map_or(false, |x| x >> 5 == 2 && x & 31 != 31) {
                let at2 = r.i; let ib2 = r.u8(at2)?; let n = cb_arg(r, ib2, at2)?.unwrap_or(0); let s = r.take(n, "byte string", at2)?;
                if s.len() <= 4096 { if tag == 3 { o.push('-'); } o.push_str(&big_dec(s, tag == 3)); } else { let _ = write!(o, "{tag}(h'{}' / {} bytes /)", hex_cut(s), s.len()); }
                return Ok(());
            }
            let _ = write!(o, "{tag}("); let start = o.len();
            cb_item(r, d + 1, o)?;
            // tag 1 = seconds since 1970: say which moment that is
            let when = if tag == 1 { o[start..].parse::<f64>().ok().filter(|x| x.is_finite() && x.abs() < 1e14).and_then(|x| stamp(x.floor() as i64, ((x - x.floor()) * 1e9).round().min(999_999_999.0) as u32)) } else { None };
            o.push(')'); if let Some(w) = when { let _ = write!(o, " / {w} /"); }
        }
        _ => return Err(format!("byte 0x{ib:02x} at {at} is not valid CBOR")),
    }
    Ok(())
}
pub fn cbor(b: &[u8]) -> R {
    let mut r = Rd { b, i: 0 }; let mut o = String::new(); let mut n = 0; let mut error = None;
    while r.i < b.len() {
        let mut item = String::new();
        match cb_item(&mut r, 0, &mut item) { Ok(()) => { if n > 0 { o.push('\n'); } o.push_str(&item); o.push('\n'); n += 1; } Err(e) => { error = Some(format!("Not valid CBOR: {e}")); break; } }
    }
    finish(o, n, error, "(nothing to decode)")
}
