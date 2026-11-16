//! SuperTools key & hash engine (wasm32-wasip1). One entry point like devcore: k_call(op, json) → JSON.
//! RustCrypto crates: hmac + md-5/sha1/sha2/sha3, argon2, bcrypt, pbkdf2, scrypt (PHC strings), ssh-key (OpenSSH Ed25519,
//! bcrypt-pbkdf + AES-256-CTR passphrase protection). Randomness = WASI random_get → crypto.getRandomValues.
use serde_json::{json, Value};
use std::cell::RefCell;

thread_local! { static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new()); }
#[no_mangle] pub extern "C" fn k_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn k_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))); }
#[no_mangle] pub extern "C" fn k_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle] pub extern "C" fn k_out_len() -> usize { OUT.with(|o| o.borrow().len()) }

type R = Result<Value, String>;
fn s<'a>(v: &'a Value, k: &str) -> &'a str { v.get(k).and_then(|x| x.as_str()).unwrap_or("") }
fn n(v: &Value, k: &str, d: u64) -> u64 { v.get(k).and_then(|x| x.as_u64()).unwrap_or(d) }
fn b64(v: &Value, k: &str) -> Result<Vec<u8>, String> { data_encoding::BASE64.decode(s(v, k).as_bytes()).map_err(|e| format!("{k}: {e}")) }
fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }

// ------------------------------------------------------------------ HMAC
fn mac(alg: &str, key: &[u8], msg: &[u8]) -> Result<Vec<u8>, String> {
    use hmac::{Hmac, Mac};
    macro_rules! m { ($t:ty) => {{ let mut h = <Hmac<$t>>::new_from_slice(key).map_err(|e| e.to_string())?; h.update(msg); h.finalize().into_bytes().to_vec() }} }
    Ok(match alg {
        "md5" => m!(md5::Md5), "sha1" => m!(sha1::Sha1), "sha224" => m!(sha2::Sha224), "sha256" => m!(sha2::Sha256), "sha384" => m!(sha2::Sha384),
        "sha512" => m!(sha2::Sha512), "sha3-256" => m!(sha3::Sha3_256), "sha3-512" => m!(sha3::Sha3_512), _ => return Err(format!("unknown algorithm {alg}")),
    })
}
fn op_hmac(a: &Value) -> R {
    let d = mac(s(a, "alg"), &b64(a, "key")?, &b64(a, "msg")?)?;
    Ok(json!({ "hex": hex(&d), "base64": data_encoding::BASE64.encode(&d), "base64url": data_encoding::BASE64URL_NOPAD.encode(&d), "bytes": d.len() }))
}

// ------------------------------------------------------------------ HOTP / TOTP (RFC 4226 / 6238)
fn hotp(alg: &str, key: &[u8], counter: u64, digits: u32) -> Result<String, String> {
    let h = mac(alg, key, &counter.to_be_bytes())?;
    let o = (h[h.len() - 1] & 0x0f) as usize;
    let bin = ((h[o] as u32 & 0x7f) << 24) | ((h[o + 1] as u32) << 16) | ((h[o + 2] as u32) << 8) | h[o + 3] as u32;
    Ok(format!("{:0width$}", bin % 10u32.pow(digits), width = digits as usize))
}
fn secret(a: &Value) -> Result<Vec<u8>, String> {
    let raw: String = s(a, "secret").chars().filter(|c| !c.is_whitespace() && *c != '-').collect::<String>().to_uppercase();
    let raw = raw.trim_end_matches('=');
    if raw.is_empty() { return Err("Enter the secret (Base32, from the QR code or the \"enter key manually\" option)".into()); }
    let mut padded = raw.to_string(); while padded.len() % 8 != 0 { padded.push('='); }
    data_encoding::BASE32.decode(padded.as_bytes()).map_err(|_| "The secret is not valid Base32 (letters A–Z and digits 2–7)".to_string())
}
fn op_totp(a: &Value) -> R {
    let key = secret(a)?;
    let (alg, digits, period, t) = (match s(a, "alg") { "" => "sha1", x => x }, n(a, "digits", 6) as u32, n(a, "period", 30).max(1), n(a, "t", 0));
    if !(6..=10).contains(&digits) { return Err("Digits must be 6 to 10".into()); }
    if a.get("counter").is_some() { let c = n(a, "counter", 0); return Ok(json!({ "code": hotp(alg, &key, c, digits)?, "counter": c })); }
    let c = t / period;
    Ok(json!({ "code": hotp(alg, &key, c, digits)?, "prev": hotp(alg, &key, c.saturating_sub(1), digits)?, "next": hotp(alg, &key, c + 1, digits)?, "counter": c, "remaining": period - t % period, "keyBytes": key.len() }))
}

// ------------------------------------------------------------------ password hashes (PHC strings)
fn op_hash(a: &Value) -> R {
    let pw = s(a, "password").as_bytes();
    let out = match s(a, "alg") {
        "argon2id" | "argon2i" | "argon2d" => {
            use argon2::{password_hash::{PasswordHasher, SaltString}, Algorithm, Argon2, Params, Version};
            let alg = match s(a, "alg") { "argon2i" => Algorithm::Argon2i, "argon2d" => Algorithm::Argon2d, _ => Algorithm::Argon2id };
            let p = Params::new(n(a, "m", 19456) as u32, n(a, "t", 2) as u32, n(a, "p", 1) as u32, None).map_err(|e| e.to_string())?;
            let salt = SaltString::generate(&mut rand_core::OsRng);
            Argon2::new(alg, Version::V0x13, p).hash_password(pw, &salt).map_err(|e| e.to_string())?.to_string()
        }
        "bcrypt" => { if pw.len() > 72 { return Err("bcrypt only uses the first 72 bytes of a password — this one is longer".into()); } bcrypt::hash(pw, n(a, "cost", 12) as u32).map_err(|e| e.to_string())? }
        "pbkdf2-sha256" | "pbkdf2-sha512" => {
            use pbkdf2::{password_hash::{PasswordHasher, SaltString}, Algorithm, Params, Pbkdf2};
            let alg = if s(a, "alg") == "pbkdf2-sha512" { Algorithm::Pbkdf2Sha512 } else { Algorithm::Pbkdf2Sha256 };
            let salt = SaltString::generate(&mut rand_core::OsRng);
            Pbkdf2.hash_password_customized(pw, Some(alg.ident()), None, Params { rounds: n(a, "iterations", 600_000) as u32, output_length: 32 }, &salt).map_err(|e| e.to_string())?.to_string()
        }
        "scrypt" => {
            use scrypt::{password_hash::{PasswordHasher, SaltString}, Params, Scrypt};
            let salt = SaltString::generate(&mut rand_core::OsRng);
            let p = Params::new(n(a, "logn", 17) as u8, n(a, "r", 8) as u32, n(a, "p", 1) as u32, 32).map_err(|e| e.to_string())?;
            Scrypt.hash_password_customized(pw, None, None, p, &salt).map_err(|e| e.to_string())?.to_string()
        }
        x => return Err(format!("unknown algorithm {x}")),
    };
    Ok(json!({ "hash": out }))
}
fn op_verify(a: &Value) -> R {
    let (pw, h) = (s(a, "password").as_bytes(), s(a, "hash").trim());
    let (scheme, ok) = if h.starts_with("$2a$") || h.starts_with("$2b$") || h.starts_with("$2y$") || h.starts_with("$2x$") {
        ("bcrypt", bcrypt::verify(pw, h).map_err(|e| format!("Not a valid bcrypt hash: {e}"))?)
    } else {
        use password_hash::{PasswordHash, PasswordVerifier};
        let ph = PasswordHash::new(h).map_err(|e| format!("Not a recognised hash (PHC string like $argon2id$… or bcrypt $2b$…): {e}"))?;
        let id = ph.algorithm.as_str().to_string();
        let ok = match id.as_str() {
            "argon2id" | "argon2i" | "argon2d" => argon2::Argon2::default().verify_password(pw, &ph).is_ok(),
            "pbkdf2-sha256" | "pbkdf2-sha512" | "pbkdf2-sha1" | "pbkdf2" => pbkdf2::Pbkdf2.verify_password(pw, &ph).is_ok(),
            "scrypt" => scrypt::Scrypt.verify_password(pw, &ph).is_ok(),
            x => return Err(format!("Unsupported hash scheme ${x}$")),
        };
        (if id.starts_with("argon2") { "argon2" } else if id.starts_with("pbkdf2") { "pbkdf2" } else { "scrypt" }, ok)
    };
    Ok(json!({ "ok": ok, "scheme": scheme }))
}
/// Raw PBKDF2 (hex) for matching other systems: {password, salt (text), iterations, len, alg}
fn op_pbkdf2_raw(a: &Value) -> R {
    let (pw, salt, it, len) = (s(a, "password").as_bytes(), s(a, "salt").as_bytes(), n(a, "iterations", 600_000) as u32, n(a, "len", 32) as usize);
    let mut out = vec![0u8; len.clamp(1, 256)];
    match s(a, "alg") {
        "sha1" => pbkdf2::pbkdf2_hmac::<sha1::Sha1>(pw, salt, it, &mut out), "sha512" => pbkdf2::pbkdf2_hmac::<sha2::Sha512>(pw, salt, it, &mut out),
        _ => pbkdf2::pbkdf2_hmac::<sha2::Sha256>(pw, salt, it, &mut out),
    }
    Ok(json!({ "hex": hex(&out) }))
}

// ------------------------------------------------------------------ OpenSSH keys
fn op_sshkey(a: &Value) -> R {
    use ssh_key::{Algorithm, HashAlg, LineEnding, PrivateKey};
    let mut k = PrivateKey::random(&mut rand_core::OsRng, Algorithm::Ed25519).map_err(|e| e.to_string())?;
    k.set_comment(s(a, "comment"));
    let pubk = k.public_key().to_openssh().map_err(|e| e.to_string())?;
    let fp = k.fingerprint(HashAlg::Sha256);
    let pass = s(a, "passphrase");
    let k2 = if pass.is_empty() { k.clone() } else { k.encrypt(&mut rand_core::OsRng, pass).map_err(|e| e.to_string())? };
    let pem = k2.to_openssh(LineEnding::LF).map_err(|e| e.to_string())?.to_string();
    Ok(json!({ "private": pem, "public": pubk, "fingerprint": fp.to_string(), "randomart": fp.to_randomart("[ED25519 256]"), "encrypted": !pass.is_empty() }))
}
fn op_sshinfo(a: &Value) -> R {
    use ssh_key::{HashAlg, PrivateKey, PublicKey};
    let t = s(a, "key").trim();
    if t.starts_with("-----BEGIN OPENSSH PRIVATE KEY-----") {
        let k = PrivateKey::from_openssh(t).map_err(|e| e.to_string())?;
        let enc = k.is_encrypted();
        let k = if enc { let p = s(a, "passphrase"); if p.is_empty() { return Ok(json!({ "kind": "private", "encrypted": true, "needPassphrase": true, "fingerprint": k.fingerprint(HashAlg::Sha256).to_string(), "comment": k.comment() })); } k.decrypt(p).map_err(|_| "Wrong passphrase".to_string())? } else { k };
        return Ok(json!({ "kind": "private", "encrypted": enc, "algorithm": k.algorithm().to_string(), "comment": k.comment(), "public": k.public_key().to_openssh().map_err(|e| e.to_string())?, "fingerprint": k.fingerprint(HashAlg::Sha256).to_string() }));
    }
    let k = PublicKey::from_openssh(t).map_err(|e| format!("Not an OpenSSH key: {e}"))?;
    Ok(json!({ "kind": "public", "algorithm": k.algorithm().to_string(), "comment": k.comment(), "fingerprint": k.fingerprint(HashAlg::Sha256).to_string(), "md5": "" }))
}

// ------------------------------------------------------------------ API keys / random secrets
fn rand_bytes(n: usize) -> Vec<u8> { let mut b = vec![0u8; n]; getrandom::getrandom(&mut b).expect("random"); b }
const B62: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
fn uniform_chars(alpha: &[u8], len: usize) -> String {
    // rejection sampling: no modulo bias
    let lim = 256 - (256 % alpha.len()); let mut o = String::with_capacity(len);
    while o.len() < len { for b in rand_bytes(len * 2) { if (b as usize) < lim && o.len() < len { o.push(alpha[b as usize % alpha.len()] as char); } } }
    o
}
fn crc32(b: &[u8]) -> u32 { let mut c = !0u32; for &x in b { c ^= x as u32; for _ in 0..8 { c = if c & 1 != 0 { (c >> 1) ^ 0xEDB88320 } else { c >> 1 }; } } !c }
fn b62(mut v: u64, width: usize) -> String { let mut s = Vec::new(); while v > 0 { s.push(B62[(v % 62) as usize]); v /= 62; } while s.len() < width { s.push(b'0'); } s.reverse(); String::from_utf8(s).unwrap() }
fn op_apikey(a: &Value) -> R {
    let (fmt, bytes, count) = (s(a, "format"), n(a, "bytes", 32).clamp(8, 128) as usize, n(a, "count", 1).clamp(1, 100) as usize);
    let prefix = s(a, "prefix");
    let mut keys = Vec::new();
    for _ in 0..count {
        let body = match fmt {
            "hex" => hex(&rand_bytes(bytes)), "base64url" => data_encoding::BASE64URL_NOPAD.encode(&rand_bytes(bytes)), "base32" => data_encoding::BASE32_NOPAD.encode(&rand_bytes(bytes)).to_lowercase(),
            "alnum" => uniform_chars(B62, (bytes as f64 * 8.0 / 62f64.log2()).ceil() as usize),
            "github" => { let r = uniform_chars(B62, 30); format!("{r}{}", b62(crc32(r.as_bytes()) as u64, 6)) } // GitHub-style: 30 random base62 + CRC32 in base62
            _ => return Err(format!("unknown format {fmt}")),
        };
        keys.push(format!("{prefix}{body}"));
    }
    let bits = match fmt { "alnum" => ((bytes as f64 * 8.0 / 62f64.log2()).ceil() * 62f64.log2()).floor() as u64, "github" => (30.0 * 62f64.log2()).floor() as u64, _ => (bytes * 8) as u64 };
    Ok(json!({ "keys": keys, "bits": bits }))
}
fn op_crc_check(a: &Value) -> R { let k = s(a, "body"); if k.len() < 7 { return Ok(json!({ "ok": false })); } let (r, c) = k.split_at(k.len() - 6); Ok(json!({ "ok": b62(crc32(r.as_bytes()) as u64, 6) == c })) }

#[no_mangle]
pub unsafe extern "C" fn k_call(op: *const u8, op_n: usize, inp: *const u8, in_n: usize) -> i32 {
    let op = std::str::from_utf8(std::slice::from_raw_parts(op, op_n)).unwrap_or("");
    let a: Value = serde_json::from_slice(if in_n == 0 { b"{}" } else { std::slice::from_raw_parts(inp, in_n) }).unwrap_or(Value::Null);
    let r = match op { "hmac" => op_hmac(&a), "totp" => op_totp(&a), "hash" => op_hash(&a), "verify" => op_verify(&a), "pbkdf2" => op_pbkdf2_raw(&a), "sshkey" => op_sshkey(&a), "sshinfo" => op_sshinfo(&a), "apikey" => op_apikey(&a), "crc" => op_crc_check(&a), _ => Err(format!("unknown op {op}")) };
    let (code, v) = match r { Ok(v) => (0, v), Err(e) => (-1, json!({ "error": e })) };
    OUT.with(|o| *o.borrow_mut() = serde_json::to_vec(&v).unwrap());
    code
}
