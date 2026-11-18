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
/// A whole number in [min, max]. A decimal, a negative number or text is an error — never a silent default.
fn int(v: &Value, k: &str, d: u64, min: u64, max: u64, label: &str) -> Result<u64, String> {
    match v.get(k) {
        None => Ok(d),
        Some(x) => match x.as_u64() { Some(n) if (min..=max).contains(&n) => Ok(n), _ => Err(format!("{label} must be a whole number from {min} to {max}")) },
    }
}
const GIB: u64 = 1 << 30; // most a hash may need in a browser tab
fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }

// ------------------------------------------------------------------ HMAC
// One enum over the eight HMACs (used by HOTP / TOTP here; the HMAC Generator tab uses hash-wasm, src/lib/hmac.ts).
macro_rules! mac_enum { ($($v:ident, $t:ty, $name:literal;)*) => {
    enum MacState { $($v(hmac::Hmac<$t>)),* }
    impl MacState {
        fn new(alg: &str, key: &[u8]) -> Result<Self, String> { use hmac::Mac; Ok(match alg { $($name => MacState::$v(<hmac::Hmac<$t>>::new_from_slice(key).map_err(|e| e.to_string())?),)* _ => return Err(format!("unknown algorithm {alg}")) }) }
        fn update(&mut self, d: &[u8]) { use hmac::Mac; match self { $(MacState::$v(h) => h.update(d)),* } }
        fn finish(self) -> Vec<u8> { use hmac::Mac; match self { $(MacState::$v(h) => h.finalize().into_bytes().to_vec()),* } }
    }
} }
mac_enum! { Md5, md5::Md5, "md5"; Sha1, sha1::Sha1, "sha1"; Sha224, sha2::Sha224, "sha224"; Sha256, sha2::Sha256, "sha256"; Sha384, sha2::Sha384, "sha384"; Sha512, sha2::Sha512, "sha512"; Sha3_256, sha3::Sha3_256, "sha3-256"; Sha3_512, sha3::Sha3_512, "sha3-512"; }
fn mac(alg: &str, key: &[u8], msg: &[u8]) -> Result<Vec<u8>, String> { let mut m = MacState::new(alg, key)?; m.update(msg); Ok(m.finish()) }

// ------------------------------------------------------------------ HOTP / TOTP (RFC 4226 / 6238)
fn hotp(alg: &str, key: &[u8], counter: u64, digits: u32) -> Result<String, String> {
    let h = mac(alg, key, &counter.to_be_bytes())?;
    let o = (h[h.len() - 1] & 0x0f) as usize;
    let bin = ((h[o] as u32 & 0x7f) << 24) | ((h[o + 1] as u32) << 16) | ((h[o + 2] as u32) << 8) | h[o + 3] as u32;
    Ok(format!("{:0width$}", bin as u64 % 10u64.pow(digits), width = digits as usize)) // u64: 10^10 does not fit in 32 bits
}
/// The Base32 secret as authenticator apps read it: any case, spaces / dashes / invisible characters ignored, padding
/// optional, and — like Google Authenticator — a last group of any length (left-over bits are dropped).
fn secret(a: &Value) -> Result<Vec<u8>, String> {
    let raw: String = s(a, "secret").chars().filter(|c| !c.is_whitespace() && !matches!(*c, '-' | '=' | '\u{200b}'..='\u{200d}' | '\u{2060}' | '\u{feff}')).collect::<String>().to_uppercase();
    if raw.is_empty() { return Err("Enter the secret (Base32, from the QR code or the \"enter key manually\" option)".into()); }
    let (mut acc, mut bits, mut out) = (0u32, 0u32, Vec::with_capacity(raw.len() * 5 / 8));
    for c in raw.chars() {
        let v = match c { 'A'..='Z' => c as u32 - 'A' as u32, '2'..='7' => c as u32 - '2' as u32 + 26,
            _ => return Err(format!("The secret is not valid Base32: \"{c}\" is not allowed (letters A–Z and digits 2–7{})", if matches!(c, '0' | '1' | '8' | '9') { "; 0, 1, 8 and 9 are never used — perhaps the letter O, I, L or B was meant" } else { "" })) };
        acc = (acc << 5) | v; bits += 5;
        if bits >= 8 { bits -= 8; out.push((acc >> bits) as u8); acc &= (1 << bits) - 1; }
    }
    if out.is_empty() { return Err("The secret is too short (at least two Base32 characters)".into()); }
    Ok(out)
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
            let (m, t, par) = (int(a, "m", 19456, 8, GIB / 1024, "Memory (KiB)")?, int(a, "t", 2, 1, 1000, "Iterations")?, int(a, "p", 1, 1, 64, "Parallelism")?);
            if m < 8 * par { return Err(format!("Memory must be at least 8 KiB per lane ({} KiB for parallelism {par})", 8 * par)); }
            let p = Params::new(m as u32, t as u32, par as u32, None).map_err(|e| e.to_string())?;
            let salt = SaltString::generate(&mut rand_core::OsRng);
            Argon2::new(alg, Version::V0x13, p).hash_password(pw, &salt).map_err(|e| e.to_string())?.to_string()
        }
        "bcrypt" => { if pw.len() > 72 { return Err("bcrypt only uses the first 72 bytes of a password — this one is longer".into()); } bcrypt::hash(pw, int(a, "cost", 12, 4, 18, "Cost")? as u32).map_err(|e| e.to_string())? }
        "pbkdf2-sha256" | "pbkdf2-sha512" => {
            use pbkdf2::{password_hash::{PasswordHasher, SaltString}, Algorithm, Params, Pbkdf2};
            let alg = if s(a, "alg") == "pbkdf2-sha512" { Algorithm::Pbkdf2Sha512 } else { Algorithm::Pbkdf2Sha256 };
            let salt = SaltString::generate(&mut rand_core::OsRng);
            Pbkdf2.hash_password_customized(pw, Some(alg.ident()), None, Params { rounds: int(a, "iterations", 600_000, 1, 50_000_000, "Iterations")? as u32, output_length: 32 }, &salt).map_err(|e| e.to_string())?.to_string()
        }
        "scrypt" => {
            use scrypt::{password_hash::{PasswordHasher, SaltString}, Params, Scrypt};
            let salt = SaltString::generate(&mut rand_core::OsRng);
            let (logn, r, par) = (int(a, "logn", 17, 1, 24, "log2(N)")?, int(a, "r", 8, 1, 64, "Block size r")?, int(a, "p", 1, 1, 16, "Parallelism")?);
            if (128 * r) << logn > GIB { return Err(format!("N = 2^{logn} with r = {r} needs {} MiB of memory — more than a browser tab can use (log2(N) is the exponent: 17 means N = 131072)", ((128 * r) << logn) >> 20)); }
            let p = Params::new(logn as u8, r as u32, par as u32, 32).map_err(|e| e.to_string())?;
            Scrypt.hash_password_customized(pw, None, None, p, &salt).map_err(|e| e.to_string())?.to_string()
        }
        x => return Err(format!("unknown algorithm {x}")),
    };
    Ok(json!({ "hash": out }))
}
fn op_verify(a: &Value) -> R {
    let (pw, h) = (s(a, "password").as_bytes(), s(a, "hash").trim());
    if h.is_empty() { return Err("Paste the hash to check".into()); }
    let (scheme, ok) = if h.starts_with("$2a$") || h.starts_with("$2b$") || h.starts_with("$2y$") || h.starts_with("$2x$") {
        let cost: u32 = h.get(4..6).and_then(|c| c.parse().ok()).unwrap_or(0);
        if cost > 18 { return Err(format!("This bcrypt hash has cost {cost} — checking it would freeze the page for minutes")); }
        ("bcrypt", bcrypt::verify(pw, h).map_err(|e| format!("Not a valid bcrypt hash: {e}"))?)
    } else {
        use password_hash::{Error, PasswordHash, PasswordVerifier};
        let ph = PasswordHash::new(h).map_err(|e| format!("Not a recognised hash (PHC string like $argon2id$… or bcrypt $2b$…): {e}"))?;
        let id = ph.algorithm.as_str().to_string();
        let dec = |k: &str| ph.params.get_decimal(k).map(u64::from);
        // "the password is wrong" and "this hash cannot be checked" are different answers
        let verdict = |r: Result<(), Error>| match r { Ok(()) => Ok(true), Err(Error::Password) => Ok(false), Err(e) => Err(format!("This hash cannot be checked: {e}")) };
        let ok = match id.as_str() {
            "argon2id" | "argon2i" | "argon2d" => {
                if dec("m").unwrap_or(0) > GIB / 1024 { return Err(format!("This Argon2 hash needs {} MiB of memory — more than a browser tab can use", dec("m").unwrap_or(0) >> 10)); }
                verdict(argon2::Argon2::default().verify_password(pw, &ph))?
            }
            "pbkdf2-sha256" | "pbkdf2-sha512" => verdict(pbkdf2::Pbkdf2.verify_password(pw, &ph))?,
            "pbkdf2-sha1" | "pbkdf2" => { // PBKDF2-HMAC-SHA1 (legacy): $pbkdf2-sha1$i=…,l=…$salt$hash or $pbkdf2$…
                let (salt, want) = (ph.salt.ok_or("This hash has no salt")?, ph.hash.ok_or("This hash has no hash value")?);
                let mut sb = [0u8; 64]; let salt = salt.decode_b64(&mut sb).map_err(|e| format!("This hash cannot be checked: {e}"))?;
                let it = dec("i").unwrap_or(1000);
                if it == 0 || it > 50_000_000 { return Err("This hash's iteration count is out of range".into()); }
                let mut out = vec![0u8; want.len()];
                pbkdf2::pbkdf2_hmac::<sha1::Sha1>(pw, salt, it as u32, &mut out);
                out.iter().zip(want.as_bytes()).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0
            }
            "scrypt" => {
                let (ln, r) = (dec("ln").unwrap_or(0), dec("r").unwrap_or(8));
                if ln > 24 || r > 64 || (128 * r) << ln > GIB { return Err(format!("This scrypt hash (N = 2^{ln}, r = {r}) needs more memory than a browser tab can use")); }
                verdict(scrypt::Scrypt.verify_password(pw, &ph))?
            }
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
// --- inspecting keys: our own reader of the SSH wire format, so every key type and every layout works -------------
struct Rd<'a>(&'a [u8]);
impl<'a> Rd<'a> {
    fn u32(&mut self) -> Result<u32, String> { if self.0.len() < 4 { return Err("The key is cut off".into()); } let (h, t) = self.0.split_at(4); self.0 = t; Ok(u32::from_be_bytes([h[0], h[1], h[2], h[3]])) }
    fn string(&mut self) -> Result<&'a [u8], String> { let n = self.u32()? as usize; if self.0.len() < n { return Err("The key is cut off".into()); } let (h, t) = self.0.split_at(n); self.0 = t; Ok(h) }
    fn text(&mut self) -> Result<String, String> { Ok(String::from_utf8_lossy(self.string()?).into_owned()) }
}
fn mpint_bits(b: &[u8]) -> u64 { let b: &[u8] = { let mut i = 0; while i < b.len() && b[i] == 0 { i += 1; } &b[i..] }; if b.is_empty() { 0 } else { (b.len() as u64 - 1) * 8 + (8 - b[0].leading_zeros() as u64) } }
/// Type, size and fingerprints of a public-key blob (the Base64 part of a public key line).
fn blob_info(blob: &[u8]) -> Result<Value, String> {
    use sha2::Digest;
    let mut r = Rd(blob); let alg = r.text()?;
    let bits: u64 = match alg.as_str() {
        "ssh-rsa" => { r.string()?; mpint_bits(r.string()?) }
        "ssh-dss" => mpint_bits(r.string()?),
        "ssh-ed25519" | "sk-ssh-ed25519@openssh.com" => 256,
        "ecdsa-sha2-nistp256" | "sk-ecdsa-sha2-nistp256@openssh.com" => 256, "ecdsa-sha2-nistp384" => 384, "ecdsa-sha2-nistp521" => 521,
        x if x.starts_with("ssh-") || x.starts_with("ecdsa-") || x.starts_with("sk-") || x.contains("-cert-") => 0,
        _ => return Err("This is not an SSH public key".into()),
    };
    let md5: Vec<String> = md5::Md5::digest(blob).iter().map(|x| format!("{x:02x}")).collect();
    Ok(json!({ "algorithm": alg, "bits": bits, "fingerprint": format!("SHA256:{}", data_encoding::BASE64_NOPAD.encode(&sha2::Sha256::digest(blob))), "md5": format!("MD5:{}", md5.join(":")) }))
}
const KEY_TYPE: &str = "ssh-rsa ssh-dss ssh-ed25519 ecdsa-sha2-nistp256 ecdsa-sha2-nistp384 ecdsa-sha2-nistp521 sk-ssh-ed25519@openssh.com sk-ecdsa-sha2-nistp256@openssh.com";
/// One line of a .pub file, authorized_keys (options first) or known_hosts (hosts first).
fn pub_line(line: &str) -> Result<Value, String> {
    let tok: Vec<&str> = line.split_whitespace().collect();
    let i = tok.iter().position(|t| KEY_TYPE.split(' ').any(|k| k == *t) || t.contains("-cert-v01@openssh.com")).ok_or("Not an OpenSSH public key (expected a line like: ssh-ed25519 AAAA… comment)")?;
    let b = tok.get(i + 1).ok_or("The key data after the key type is missing")?;
    let blob = data_encoding::BASE64.decode(b.as_bytes()).or_else(|_| data_encoding::BASE64_NOPAD.decode(b.trim_end_matches('=').as_bytes())).map_err(|_| "The key data is not valid Base64 (was the line cut off?)")?;
    let mut v = blob_info(&blob)?;
    if v["algorithm"] != tok[i] { return Err(format!("The line says {} but the key data is {}", tok[i], v["algorithm"].as_str().unwrap_or("?"))); }
    v["kind"] = json!("public"); v["comment"] = json!(tok[i + 2..].join(" "));
    if i > 0 { v["before"] = json!(tok[..i].join(" ")); } // authorized_keys options or known_hosts host names
    Ok(v)
}
/// An OpenSSH private key file ("openssh-key-v1"): the public key in it is never encrypted, the comment is.
fn priv_info(pem: &str, pass: &str) -> R {
    let body: String = pem.lines().map(str::trim).filter(|l| !l.starts_with("-----") && !l.is_empty()).collect::<String>().split_whitespace().collect();
    let raw = data_encoding::BASE64.decode(body.as_bytes()).or_else(|_| data_encoding::BASE64_NOPAD.decode(body.trim_end_matches('=').as_bytes())).map_err(|_| "The private key is not valid Base64 (was part of it left out?)")?;
    let magic = b"openssh-key-v1\0";
    if !raw.starts_with(magic) { return Err("Not an OpenSSH private key".into()); }
    let mut r = Rd(&raw[magic.len()..]);
    let (cipher, kdf, kdfopts, nkeys) = (r.text()?, r.text()?, r.string()?, r.u32()?);
    if nkeys != 1 { return Err(format!("This file holds {nkeys} keys — expected one")); }
    let blob = r.string()?; let mut v = blob_info(blob)?; let secret = r.string()?;
    let alg = v["algorithm"].as_str().unwrap_or("").to_string();
    let enc = cipher != "none";
    v["kind"] = json!("private"); v["encrypted"] = json!(enc);
    v["public"] = json!(format!("{alg} {}", data_encoding::BASE64.encode(blob)));
    let plain: Vec<u8> = if !enc { secret.to_vec() } else {
        if pass.is_empty() { v["needPassphrase"] = json!(true); return Ok(v); }
        let klen = match cipher.as_str() { "aes256-ctr" => 32, "aes192-ctr" => 24, "aes128-ctr" => 16, c => return Err(format!("This key is encrypted with {c}; only aes-ctr keys (the OpenSSH default) can be read here. Its fingerprint is {}", v["fingerprint"].as_str().unwrap_or(""))) };
        if kdf != "bcrypt" { return Err(format!("Unknown key derivation {kdf}")); }
        let mut k = Rd(kdfopts); let (salt, rounds) = (k.string()?, k.u32()?);
        if rounds == 0 || rounds > 2000 { return Err("This key's KDF rounds are out of range".into()); }
        let mut okm = vec![0u8; klen + 16];
        bcrypt_pbkdf::bcrypt_pbkdf(pass.as_bytes(), salt, rounds, &mut okm).map_err(|e| e.to_string())?;
        let mut data = secret.to_vec();
        use ctr::cipher::{KeyIvInit, StreamCipher};
        match klen {
            32 => ctr::Ctr128BE::<aes::Aes256>::new_from_slices(&okm[..32], &okm[32..]).map_err(|e| e.to_string())?.apply_keystream(&mut data),
            24 => ctr::Ctr128BE::<aes::Aes192>::new_from_slices(&okm[..24], &okm[24..]).map_err(|e| e.to_string())?.apply_keystream(&mut data),
            _ => ctr::Ctr128BE::<aes::Aes128>::new_from_slices(&okm[..16], &okm[16..]).map_err(|e| e.to_string())?.apply_keystream(&mut data),
        }
        data
    };
    let mut q = Rd(&plain);
    if q.u32()? != q.u32()? { return Err(if enc { "Wrong passphrase".into() } else { "The private key is damaged".into() }); }
    let kt = q.text()?;
    if kt != alg { return Err("The private key is damaged".into()); }
    // skip the key material to reach the comment (all fields are length-prefixed)
    let skip = match kt.as_str() { "ssh-ed25519" => 2, "ssh-rsa" => 6, "ssh-dss" => 5, "ecdsa-sha2-nistp256" | "ecdsa-sha2-nistp384" | "ecdsa-sha2-nistp521" => 3, _ => usize::MAX };
    if skip != usize::MAX {
        for _ in 0..skip { q.string()?; }
        let c = q.text()?; v["comment"] = json!(c);
        if !c.is_empty() { v["public"] = json!(format!("{} {c}", v["public"].as_str().unwrap_or(""))); }
    }
    Ok(v)
}
fn op_sshinfo(a: &Value) -> R {
    let t = s(a, "key").trim();
    if t.contains("-----BEGIN OPENSSH PRIVATE KEY-----") { return Ok(json!({ "keys": [priv_info(t, s(a, "passphrase"))?] })); }
    if t.contains("-----BEGIN") { return Err("Only OpenSSH keys are read here (\"-----BEGIN OPENSSH PRIVATE KEY-----\" or a public key line). PEM / PKCS#8 / PuTTY keys: convert with ssh-keygen -p -f key".into()); }
    let lines: Vec<&str> = t.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')).collect();
    if lines.is_empty() { return Err("Paste a key".into()); }
    let mut keys = Vec::new();
    for (i, l) in lines.iter().enumerate() { keys.push(pub_line(l).map_err(|e| if lines.len() > 1 { format!("Line {}: {e}", i + 1) } else { e })?); }
    Ok(json!({ "keys": keys }))
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
    let r = match op { "totp" => op_totp(&a), "hash" => op_hash(&a), "verify" => op_verify(&a), "pbkdf2" => op_pbkdf2_raw(&a), "sshkey" => op_sshkey(&a), "sshinfo" => op_sshinfo(&a), "apikey" => op_apikey(&a), "crc" => op_crc_check(&a), _ => Err(format!("unknown op {op}")) };
    let (code, v) = match r { Ok(v) => (0, v), Err(e) => (-1, json!({ "error": e })) };
    OUT.with(|o| *o.borrow_mut() = serde_json::to_vec(&v).unwrap());
    code
}
