//! Binary-to-text encodings. enc:<alg> takes raw bytes and returns ASCII text; dec:<alg> takes text and returns bytes.
//! Algorithms: base16, base32, base32hex, crockford, base58, base58check, ascii85, z85, base64, base64url.
use crate::R;
use data_encoding::{Encoding, Specification, BASE32, BASE32HEX, BASE64, BASE64URL_NOPAD, HEXUPPER_PERMISSIVE};
use sha2::{Digest, Sha256};

fn crockford() -> Encoding {
    let mut s = Specification::new();
    s.symbols.push_str("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
    s.translate.from.push_str("abcdefghjkmnpqrstvwxyzOoIiLl");
    s.translate.to.push_str("ABCDEFGHJKMNPQRSTVWXYZ001111");
    s.ignore.push('-');
    s.encoding().unwrap()
}
const Z85: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#";

fn a85_enc(d: &[u8]) -> String {
    let mut o = String::new();
    for c in d.chunks(4) {
        let mut b = [0u8; 4]; b[..c.len()].copy_from_slice(c);
        let v = u32::from_be_bytes(b);
        if v == 0 && c.len() == 4 { o.push('z'); continue; }
        let mut t = [0u8; 5]; let mut x = v;
        for i in (0..5).rev() { t[i] = (x % 85) as u8 + 33; x /= 85; }
        for &ch in &t[..c.len() + 1] { o.push(ch as char); }
    }
    o
}
fn a85_dec(s: &str) -> Result<Vec<u8>, String> {
    let s = s.trim(); let s = s.strip_prefix("<~").unwrap_or(s); let s = s.strip_suffix("~>").unwrap_or(s);
    let mut out = Vec::new(); let mut grp: Vec<u32> = Vec::new();
    for (i, ch) in s.chars().enumerate() {
        if ch.is_whitespace() { continue; }
        if ch == 'z' { if !grp.is_empty() { return Err(format!("'z' inside a group at position {i}")); } out.extend_from_slice(&[0; 4]); continue; }
        if !('!'..='u').contains(&ch) { return Err(format!("invalid Ascii85 character '{ch}' at position {i}")); }
        grp.push(ch as u32 - 33);
        if grp.len() == 5 { let v = grp.iter().try_fold(0u32, |a, &d| a.checked_mul(85).and_then(|a| a.checked_add(d))).ok_or("Ascii85 group overflows 32 bits")?; out.extend_from_slice(&v.to_be_bytes()); grp.clear(); }
    }
    if grp.len() == 1 { return Err("a final Ascii85 group needs at least 2 characters".into()); }
    if !grp.is_empty() {
        let n = grp.len(); while grp.len() < 5 { grp.push(84); }
        let v = grp.iter().try_fold(0u32, |a, &d| a.checked_mul(85).and_then(|a| a.checked_add(d))).ok_or("Ascii85 group overflows 32 bits")?;
        out.extend_from_slice(&v.to_be_bytes()[..n - 1]);
    }
    Ok(out)
}
fn z85_enc(d: &[u8]) -> Result<String, String> {
    if d.len() % 4 != 0 { return Err(format!("Z85 needs a multiple of 4 bytes (this is {} bytes)", d.len())); }
    let mut o = String::new();
    for c in d.chunks(4) { let mut v = u32::from_be_bytes([c[0], c[1], c[2], c[3]]); let mut t = [0u8; 5]; for i in (0..5).rev() { t[i] = Z85[(v % 85) as usize]; v /= 85; } o.extend(t.iter().map(|&b| b as char)); }
    Ok(o)
}
fn z85_dec(s: &str) -> Result<Vec<u8>, String> {
    let s: Vec<u8> = s.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if s.len() % 5 != 0 { return Err(format!("Z85 text must be a multiple of 5 characters (this is {})", s.len())); }
    let mut out = Vec::new();
    for c in s.chunks(5) {
        let mut v: u64 = 0;
        for &ch in c { let d = Z85.iter().position(|&z| z == ch).ok_or(format!("invalid Z85 character '{}'", ch as char))?; v = v * 85 + d as u64; }
        if v > u32::MAX as u64 { return Err("Z85 group overflows 32 bits".into()); }
        out.extend_from_slice(&(v as u32).to_be_bytes());
    }
    Ok(out)
}
fn check(d: &[u8]) -> [u8; 4] { let h = Sha256::digest(Sha256::digest(d)); [h[0], h[1], h[2], h[3]] }

pub fn encode(alg: &str, d: &[u8]) -> R {
    let t = match alg {
        "base16" => HEXUPPER_PERMISSIVE.encode(d), "base32" => BASE32.encode(d), "base32hex" => BASE32HEX.encode(d), "crockford" => crockford().encode(d),
        "base58" => bs58::encode(d).into_string(), "base58check" => { let mut v = d.to_vec(); v.extend_from_slice(&check(d)); bs58::encode(v).into_string() }
        "ascii85" => a85_enc(d), "z85" => z85_enc(d)?, "base64" => BASE64.encode(d), "base64url" => BASE64URL_NOPAD.encode(d),
        _ => return Err(format!("unknown encoding {alg}")),
    };
    Ok(t.into_bytes())
}
pub fn decode(alg: &str, d: &[u8]) -> R {
    let text = std::str::from_utf8(d).map_err(|_| "input is not text")?;
    let clean: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    let de = |e: &Encoding, s: &str| e.decode(s.as_bytes()).map_err(|e| format!("{e}"));
    match alg {
        "base16" => de(&HEXUPPER_PERMISSIVE, &clean),
        "base32" => de(&BASE32, &clean.to_uppercase()), "base32hex" => de(&BASE32HEX, &clean.to_uppercase()), "crockford" => de(&crockford(), &clean),
        "base58" => bs58::decode(&clean).into_vec().map_err(|e| format!("{e}")),
        "base58check" => { let v = bs58::decode(&clean).into_vec().map_err(|e| format!("{e}"))?; if v.len() < 4 { return Err("too short for Base58Check".into()); } let (p, c) = v.split_at(v.len() - 4); if check(p) != c { return Err("Base58Check checksum does not match".into()); } Ok(p.to_vec()) }
        "ascii85" => a85_dec(text), "z85" => z85_dec(text),
        "base64" => { let mut s = clean.replace('-', "+").replace('_', "/"); while s.len() % 4 != 0 { s.push('='); } de(&BASE64, &s) }
        "base64url" => { let s = clean.trim_end_matches('=').replace('+', "-").replace('/', "_"); de(&BASE64URL_NOPAD, &s) }
        _ => Err(format!("unknown encoding {alg}")),
    }
}
