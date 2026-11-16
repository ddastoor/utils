//! Schema-less decoders for binary messages. Input: raw bytes. Output JSON {"text": <readable dump>, "count": n}.
//! protobuf → protoc --decode_raw style; MessagePack → JSON-like text; CBOR → RFC 8949 diagnostic notation.
use crate::{js, R};
use serde_json::json;
use std::fmt::Write;

// ------------------------------------------------------------------ protobuf wire format
fn varint(b: &[u8], i: &mut usize) -> Option<u64> {
    let mut v: u64 = 0;
    for k in 0..10 { let x = *b.get(*i)?; *i += 1; v |= ((x & 0x7f) as u64) << (7 * k); if x < 0x80 { return Some(v); } }
    None
}
fn quote(s: &str) -> String { let mut o = String::from("\""); for c in s.chars() { match c { '"' => o.push_str("\\\""), '\\' => o.push_str("\\\\"), '\n' => o.push_str("\\n"), '\r' => o.push_str("\\r"), '\t' => o.push_str("\\t"), c if (c as u32) < 32 => { let _ = write!(o, "\\x{:02x}", c as u32); } c => o.push(c) } } o.push('"'); o }
fn printable(s: &str) -> bool { !s.is_empty() && s.chars().all(|c| !c.is_control() || c == '\n' || c == '\r' || c == '\t') }

/// Parse a whole buffer as a message; Err if it is not one. Returns the dump at `depth` and the field count.
fn pb_msg(b: &[u8], depth: usize, end_group: Option<u64>, pos: &mut usize) -> Result<(String, usize), String> {
    let mut o = String::new(); let mut n = 0; let pad = "  ".repeat(depth);
    while *pos < b.len() {
        let at = *pos;
        let key = varint(b, pos).ok_or(format!("truncated key at byte {at}"))?;
        let (field, wire) = (key >> 3, key & 7);
        if field == 0 { return Err(format!("field number 0 at byte {at}")); }
        match wire {
            0 => { let v = varint(b, pos).ok_or(format!("truncated varint at byte {at}"))?; let z = ((v >> 1) as i64) ^ -((v & 1) as i64);
                   let _ = write!(o, "{pad}{field}: {v}"); if v > i64::MAX as u64 { let _ = write!(o, "  # int64 {}", v as i64); } else if z < 0 { let _ = write!(o, "  # sint {z}"); } o.push('\n'); }
            1 => { let s = b.get(*pos..*pos + 8).ok_or(format!("truncated fixed64 at byte {at}"))?; *pos += 8; let v = u64::from_le_bytes(s.try_into().unwrap());
                   let _ = writeln!(o, "{pad}{field}: 0x{v:016x}  # fixed64 {v}, double {}", f64::from_bits(v)); }
            5 => { let s = b.get(*pos..*pos + 4).ok_or(format!("truncated fixed32 at byte {at}"))?; *pos += 4; let v = u32::from_le_bytes(s.try_into().unwrap());
                   let _ = writeln!(o, "{pad}{field}: 0x{v:08x}  # fixed32 {v}, float {}", f32::from_bits(v)); }
            2 => {
                let len = varint(b, pos).ok_or(format!("truncated length at byte {at}"))? as usize;
                let s = b.get(*pos..pos.checked_add(len).ok_or("length overflow")?).ok_or(format!("field {field} at byte {at} says {len} bytes but only {} remain", b.len() - *pos))?; *pos += len;
                let text = std::str::from_utf8(s).ok().filter(|t| printable(t));
                let mut p2 = 0; let nested = if text.is_some() || s.is_empty() { None } else { pb_msg(s, depth + 1, None, &mut p2).ok().filter(|(_, c)| *c > 0) };
                if let Some((inner, _)) = nested { let _ = write!(o, "{pad}{field} {{\n{inner}{pad}}}\n"); }
                else if let Some(t) = text { let _ = writeln!(o, "{pad}{field}: {}", quote(t)); }
                else { let _ = writeln!(o, "{pad}{field}: {}  # {len} bytes", if s.is_empty() { "\"\"".to_string() } else { format!("0x{}", s.iter().map(|x| format!("{x:02x}")).collect::<String>()) }); }
            }
            3 => { let (inner, _) = pb_msg(b, depth + 1, Some(field), pos)?; let _ = write!(o, "{pad}{field} {{  # group\n{inner}{pad}}}\n"); }
            4 => { if end_group == Some(field) { return Ok((o, n)); } return Err(format!("unexpected end-group {field} at byte {at}")); }
            _ => return Err(format!("invalid wire type {wire} at byte {at}")),
        }
        n += 1;
    }
    if end_group.is_some() { return Err("group not closed".into()); }
    Ok((o, n))
}
pub fn protobuf(b: &[u8]) -> R {
    if b.is_empty() { return js(json!({ "text": "(empty message)", "count": 0 })); }
    let mut p = 0;
    let (t, n) = pb_msg(b, 0, None, &mut p).map_err(|e| format!("Not a valid protobuf message: {e}"))?;
    js(json!({ "text": t, "count": n }))
}

// ------------------------------------------------------------------ MessagePack
fn mp(v: &rmpv::Value, d: usize, o: &mut String) {
    use rmpv::Value as V;
    let pad = "  ".repeat(d + 1); let end = "  ".repeat(d);
    match v {
        V::Nil => o.push_str("null"), V::Boolean(b) => { let _ = write!(o, "{b}"); }
        V::Integer(i) => { let _ = write!(o, "{i}"); } V::F32(f) => { let _ = write!(o, "{f}"); } V::F64(f) => { let _ = write!(o, "{f}"); }
        V::String(s) => match s.as_str() { Some(t) => o.push_str(&quote(t)), None => { let _ = write!(o, "<invalid UTF-8 {} bytes>", s.as_bytes().len()); } },
        V::Binary(b) => { let _ = write!(o, "<bin {} bytes: {}>", b.len(), b.iter().map(|x| format!("{x:02x}")).collect::<String>()); }
        V::Array(a) => { if a.is_empty() { o.push_str("[]"); return; } o.push_str("[\n"); for (i, x) in a.iter().enumerate() { o.push_str(&pad); mp(x, d + 1, o); if i + 1 < a.len() { o.push(','); } o.push('\n'); } o.push_str(&end); o.push(']'); }
        V::Map(m) => { if m.is_empty() { o.push_str("{}"); return; } o.push_str("{\n"); for (i, (k, x)) in m.iter().enumerate() { o.push_str(&pad); mp(k, d + 1, o); o.push_str(": "); mp(x, d + 1, o); if i + 1 < m.len() { o.push(','); } o.push('\n'); } o.push_str(&end); o.push('}'); }
        V::Ext(t, b) => { if *t == -1 && (b.len() == 4 || b.len() == 8 || b.len() == 12) { let _ = write!(o, "<timestamp {}>", mp_ts(b)); } else { let _ = write!(o, "<ext type {t}: {}>", b.iter().map(|x| format!("{x:02x}")).collect::<String>()); } }
    }
}
fn mp_ts(b: &[u8]) -> String {
    let (sec, ns): (i64, u32) = match b.len() { 4 => (u32::from_be_bytes(b.try_into().unwrap()) as i64, 0), 8 => { let v = u64::from_be_bytes(b.try_into().unwrap()); ((v & 0x3_ffff_ffff) as i64, (v >> 34) as u32) } _ => (i64::from_be_bytes(b[4..12].try_into().unwrap()), u32::from_be_bytes(b[0..4].try_into().unwrap())) };
    chrono::DateTime::from_timestamp(sec, ns).map(|d| d.to_rfc3339()).unwrap_or(format!("{sec}s"))
}
pub fn msgpack(b: &[u8]) -> R {
    let mut cur = std::io::Cursor::new(b); let mut o = String::new(); let mut n = 0;
    while (cur.position() as usize) < b.len() {
        let at = cur.position();
        let v = rmpv::decode::read_value(&mut cur).map_err(|e| format!("Not valid MessagePack at byte {at}: {e}"))?;
        if n > 0 { o.push('\n'); } mp(&v, 0, &mut o); o.push('\n'); n += 1;
    }
    js(json!({ "text": o, "count": n }))
}

// ------------------------------------------------------------------ CBOR (diagnostic notation, RFC 8949 §8)
fn cb(v: &ciborium::Value, d: usize, o: &mut String) {
    use ciborium::Value as V;
    let pad = "  ".repeat(d + 1); let end = "  ".repeat(d);
    match v {
        V::Integer(i) => { let _ = write!(o, "{}", i128::from(*i)); }
        V::Bytes(b) => { let _ = write!(o, "h'{}'", b.iter().map(|x| format!("{x:02x}")).collect::<String>()); }
        V::Float(f) => { if f.is_nan() { o.push_str("NaN") } else if f.is_infinite() { o.push_str(if *f > 0.0 { "Infinity" } else { "-Infinity" }) } else if f.fract() == 0.0 && f.abs() < 1e16 { let _ = write!(o, "{f:.1}"); } else { let _ = write!(o, "{f}"); } }
        V::Text(t) => o.push_str(&quote(t)), V::Bool(b) => { let _ = write!(o, "{b}"); } V::Null => o.push_str("null"),
        V::Tag(t, x) => { let _ = write!(o, "{t}("); cb(x, d, o); o.push(')'); }
        V::Array(a) => { if a.is_empty() { o.push_str("[]"); return; } o.push_str("[\n"); for (i, x) in a.iter().enumerate() { o.push_str(&pad); cb(x, d + 1, o); if i + 1 < a.len() { o.push(','); } o.push('\n'); } o.push_str(&end); o.push(']'); }
        V::Map(m) => { if m.is_empty() { o.push_str("{}"); return; } o.push_str("{\n"); for (i, (k, x)) in m.iter().enumerate() { o.push_str(&pad); cb(k, d + 1, o); o.push_str(": "); cb(x, d + 1, o); if i + 1 < m.len() { o.push(','); } o.push('\n'); } o.push_str(&end); o.push('}'); }
        _ => o.push_str("undefined"),
    }
}
pub fn cbor(b: &[u8]) -> R {
    let mut cur = std::io::Cursor::new(b); let mut o = String::new(); let mut n = 0;
    while (cur.position() as usize) < b.len() {
        let at = cur.position();
        let v: ciborium::Value = ciborium::de::from_reader(&mut cur).map_err(|e| format!("Not valid CBOR at byte {at}: {e}"))?;
        if n > 0 { o.push('\n'); } cb(&v, 0, &mut o); o.push('\n'); n += 1;
    }
    js(json!({ "text": o, "count": n }))
}
