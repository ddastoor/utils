//! X.509 certificate / CSR decoder (x509-parser). Input: PEM text (one or more blocks: a chain) or DER bytes; also the
//! certificates inside a PKCS #7 bundle (.p7b) and lone public keys. PEM is read leniently (BOM, UTF-16, indentation,
//! quoting, literal \n).
//! Output JSON {"items": [ {kind, subject, issuer, serial, notBefore, notAfter (unix s), key, sigAlg, sans, ext…} ]}.
use crate::{js, R};
use serde_json::{json, Value};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use x509_parser::certification_request::X509CertificationRequest;
use x509_parser::extensions::{GeneralName, ParsedExtension};
use x509_parser::objects::{oid2sn, oid_registry};
use x509_parser::prelude::*;
use x509_parser::public_key::PublicKey;

fn hexc(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02X}")).collect::<Vec<_>>().join(":") }
fn oid_name(o: &x509_parser::der_parser::oid::Oid) -> String {
    let id = o.to_id_string();
    let extra = match id.as_str() { // names the registry lacks
        "2.16.840.1.101.3.4.3.1" => "dsa-with-SHA224", "2.16.840.1.101.3.4.3.2" => "dsa-with-SHA256", "2.16.840.1.101.3.4.3.3" => "dsa-with-SHA384", "2.16.840.1.101.3.4.3.4" => "dsa-with-SHA512",
        "1.2.840.10040.4.3" => "dsa-with-SHA1", "1.2.840.113549.1.1.10" => "RSASSA-PSS",
        "2.16.840.1.101.3.4.3.9" => "ecdsa-with-SHA3-224", "2.16.840.1.101.3.4.3.10" => "ecdsa-with-SHA3-256", "2.16.840.1.101.3.4.3.11" => "ecdsa-with-SHA3-384", "2.16.840.1.101.3.4.3.12" => "ecdsa-with-SHA3-512",
        _ => "",
    };
    oid2sn(o, oid_registry()).map(|s| s.to_string()).unwrap_or_else(|_| if extra.is_empty() { id.clone() } else { extra.to_string() })
}
fn gn(g: &GeneralName) -> String {
    match g {
        GeneralName::DNSName(s) => format!("DNS:{s}"), GeneralName::RFC822Name(s) => format!("email:{s}"), GeneralName::URI(s) => format!("URI:{s}"),
        GeneralName::IPAddress(b) => match b.len() { 4 => format!("IP:{}", std::net::Ipv4Addr::from(<[u8; 4]>::try_from(*b).unwrap())), 16 => format!("IP:{}", std::net::Ipv6Addr::from(<[u8; 16]>::try_from(*b).unwrap())), _ => format!("IP:{}", hexc(b)) },
        GeneralName::DirectoryName(n) => format!("DirName:{n}"), GeneralName::RegisteredID(o) => format!("RID:{}", o.to_id_string()),
        GeneralName::OtherName(o, _) => format!("othername:{}", o.to_id_string()), other => format!("{other:?}"),
    }
}
/// DER: (tag, content, rest) of the first TLV.
fn tlv(b: &[u8]) -> Option<(u8, &[u8], &[u8])> {
    let (&tag, r) = b.split_first()?; let (&l0, r) = r.split_first()?;
    let (len, r) = if l0 < 0x80 { (l0 as usize, r) } else { let n = (l0 & 0x7f) as usize; if n == 0 || n > 4 || r.len() < n { return None; } (r[..n].iter().fold(0usize, |a, &x| (a << 8) | x as usize), &r[n..]) };
    if r.len() < len { return None; }
    Some((tag, &r[..len], &r[len..]))
}
/// Bit length of the first INTEGER in a DER SEQUENCE body (RSA modulus, DSA prime p).
fn first_int_bits(body: &[u8]) -> Option<usize> {
    let (tag, v, _) = tlv(body)?; if tag != 0x02 { return None; }
    let v: &[u8] = { let mut i = 0; while i < v.len() && v[i] == 0 { i += 1; } &v[i..] };
    Some(if v.is_empty() { 0 } else { (v.len() - 1) * 8 + (8 - v[0].leading_zeros() as usize) })
}
fn key(spki: &SubjectPublicKeyInfo) -> Value {
    let alg = oid_name(&spki.algorithm.algorithm);
    match spki.parsed() {
        Ok(PublicKey::RSA(r)) => json!({ "type": "RSA", "bits": r.key_size(), "exponent": r.try_exponent().map(|e| e.to_string()).unwrap_or_default() }),
        Ok(PublicKey::EC(p)) => {
            let curve: String = spki.algorithm.parameters.as_ref().and_then(|a| a.as_oid().ok()).map(|o| match o.to_id_string().as_str() { "1.2.840.10045.3.1.7" => "P-256".into(), "1.3.132.0.34" => "P-384".into(), "1.3.132.0.35" => "P-521".into(), "1.3.132.0.10" => "secp256k1".into(), s => s.to_string() }).unwrap_or_default();
            // the size of a curve is a property of the curve (P-521 is 521 bits — its point is stored in 66 bytes = 528 bits)
            let bits = match curve.as_str() { "P-256" | "secp256k1" => 256, "P-384" => 384, "P-521" => 521, _ => p.key_size() };
            json!({ "type": "EC", "bits": bits, "curve": curve })
        }
        _ => {
            let id = spki.algorithm.algorithm.to_id_string();
            let data: &[u8] = &spki.subject_public_key.data;
            match id.as_str() {
                "1.3.101.112" => json!({ "type": "Ed25519", "bits": 256 }), "1.3.101.110" => json!({ "type": "X25519", "bits": 256 }),
                "1.3.101.113" => json!({ "type": "Ed448", "bits": 456 }), "1.3.101.111" => json!({ "type": "X448", "bits": 448 }),
                // RSASSA-PSS keys carry an ordinary RSAPublicKey: SEQUENCE { modulus, exponent }
                "1.2.840.113549.1.1.10" => json!({ "type": "RSA-PSS", "bits": tlv(data).and_then(|(_, body, _)| first_int_bits(body)).unwrap_or(data.len() * 8) }),
                // DSA: the size is that of the prime p in the algorithm parameters SEQUENCE { p, q, g }
                "1.2.840.10040.4.1" => json!({ "type": "DSA", "bits": spki.algorithm.parameters.as_ref().and_then(|a| first_int_bits(&a.data)).unwrap_or(0) }),
                _ => json!({ "type": alg, "bits": data.len() * 8 }),
            }
        }
    }
}
fn exts<'a>(it: impl Iterator<Item = &'a X509Extension<'a>>) -> (Vec<String>, Value) {
    let mut sans = Vec::new(); let mut o = serde_json::Map::new();
    for e in it {
        let crit = if e.critical { " (critical)" } else { "" };
        let (name, val): (String, String) = match e.parsed_extension() {
            ParsedExtension::SubjectAlternativeName(s) => { sans = s.general_names.iter().map(gn).collect(); ("Subject Alternative Name".into(), sans.join(", ")) }
            ParsedExtension::BasicConstraints(b) => ("Basic Constraints".into(), format!("CA: {}{}", if b.ca { "yes" } else { "no" }, b.path_len_constraint.map(|p| format!(", path length ≤ {p}")).unwrap_or_default())),
            ParsedExtension::KeyUsage(k) => ("Key Usage".into(), k.to_string()),
            ParsedExtension::ExtendedKeyUsage(k) => {
                let mut v = Vec::new();
                if k.server_auth { v.push("TLS Web Server Authentication".to_string()) } if k.client_auth { v.push("TLS Web Client Authentication".into()) }
                if k.code_signing { v.push("Code Signing".into()) } if k.email_protection { v.push("E-mail Protection".into()) } if k.time_stamping { v.push("Time Stamping".into()) }
                if k.ocsp_signing { v.push("OCSP Signing".into()) } if k.any { v.push("Any".into()) } v.extend(k.other.iter().map(|x| x.to_id_string()));
                ("Extended Key Usage".into(), v.join(", "))
            }
            ParsedExtension::SubjectKeyIdentifier(k) => ("Subject Key Identifier".into(), hexc(k.0)),
            ParsedExtension::AuthorityKeyIdentifier(a) => ("Authority Key Identifier".into(), a.key_identifier.as_ref().map(|k| hexc(k.0)).unwrap_or_default()),
            ParsedExtension::AuthorityInfoAccess(a) => ("Authority Information Access".into(), a.accessdescs.iter().map(|d| format!("{} – {}", match d.access_method.to_id_string().as_str() { "1.3.6.1.5.5.7.48.1" => "OCSP".to_string(), "1.3.6.1.5.5.7.48.2" => "CA Issuers".into(), s => s.into() }, gn(&d.access_location))).collect::<Vec<_>>().join("; ")),
            ParsedExtension::CRLDistributionPoints(c) => ("CRL Distribution Points".into(), c.points.iter().filter_map(|p| p.distribution_point.as_ref()).map(|n| match n { DistributionPointName::FullName(v) => v.iter().map(gn).collect::<Vec<_>>().join(", "), other => format!("{other:?}") }).collect::<Vec<_>>().join("; ")),
            ParsedExtension::CertificatePolicies(p) => ("Certificate Policies".into(), p.iter().map(|x| match x.policy_id.to_id_string().as_str() { "2.23.140.1.2.1" => "Domain Validated (2.23.140.1.2.1)".to_string(), "2.23.140.1.2.2" => "Organization Validated (2.23.140.1.2.2)".into(), "2.23.140.1.1" => "Extended Validation (2.23.140.1.1)".into(), s => s.into() }).collect::<Vec<_>>().join(", ")),
            ParsedExtension::SCT(v) => ("Signed Certificate Timestamps".into(), format!("{} SCTs (Certificate Transparency)", v.len())),
            ParsedExtension::NameConstraints(_) => ("Name Constraints".into(), "present".into()),
            _ => (oid_name(&e.oid), format!("{} bytes", e.value.len())),
        };
        o.insert(format!("{name}{crit}"), Value::String(val));
    }
    (sans, Value::Object(o))
}
fn cert(der: &[u8]) -> Result<Value, String> {
    let (_, c) = X509Certificate::from_der(der).map_err(|e| format!("Not an X.509 certificate: {e}"))?;
    let (sans, ext) = exts(c.iter_extensions());
    let self_signed = c.subject() == c.issuer();
    Ok(json!({
        "kind": "certificate", "version": c.version().0 + 1, "serial": hexc(c.raw_serial()), "subject": c.subject().to_string(), "issuer": c.issuer().to_string(),
        "cn": c.subject().iter_common_name().next().and_then(|x| x.as_str().ok()).unwrap_or(""),
        "notBefore": c.validity().not_before.timestamp(), "notAfter": c.validity().not_after.timestamp(), "key": key(c.public_key()),
        "sigAlg": oid_name(&c.signature_algorithm.algorithm), "sans": sans, "extensions": ext, "isCA": c.is_ca(), "selfSigned": self_signed,
        "sha1": hexc(&Sha1::digest(der)), "sha256": hexc(&Sha256::digest(der)), "size": der.len(),
    }))
}
fn csr(der: &[u8]) -> Result<Value, String> {
    let (_, r) = X509CertificationRequest::from_der(der).map_err(|e| format!("Not a certificate request: {e}"))?;
    let info = &r.certification_request_info;
    let mut sans = Vec::new();
    if let Some(it) = r.requested_extensions() { for e in it { if let ParsedExtension::SubjectAlternativeName(s) = e { sans = s.general_names.iter().map(gn).collect(); } } }
    Ok(json!({ "kind": "csr", "subject": info.subject.to_string(), "cn": info.subject.iter_common_name().next().and_then(|x| x.as_str().ok()).unwrap_or(""),
        "key": key(&info.subject_pki), "sigAlg": oid_name(&r.signature_algorithm.algorithm), "sans": sans, "sha256": hexc(&Sha256::digest(der)), "size": der.len() }))
}
/// A lone public key (PEM "PUBLIC KEY" = SubjectPublicKeyInfo): its type, size and the SHA-256 used for key pinning.
fn pubkey(der: &[u8]) -> Option<Value> {
    let (rest, spki) = SubjectPublicKeyInfo::from_der(der).ok()?;
    if !rest.is_empty() { return None; }
    Some(json!({ "kind": "pubkey", "key": key(&spki), "sha256": hexc(&Sha256::digest(der)), "pin": data_encoding_b64(&Sha256::digest(der)), "size": der.len() }))
}
fn data_encoding_b64(b: &[u8]) -> String {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut o = String::new();
    for c in b.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        o.push(A[(n >> 18) as usize & 63] as char); o.push(A[(n >> 12) as usize & 63] as char);
        o.push(if c.len() > 1 { A[(n >> 6) as usize & 63] as char } else { '=' }); o.push(if c.len() > 2 { A[n as usize & 63] as char } else { '=' });
    }
    o
}
fn b64_decode(t: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(t.len() * 3 / 4); let (mut acc, mut bits) = (0u32, 0u32);
    for c in t.bytes() {
        let v = match c { b'A'..=b'Z' => c - b'A', b'a'..=b'z' => c - b'a' + 26, b'0'..=b'9' => c - b'0' + 52, b'+' | b'-' => 62, b'/' | b'_' => 63, b'=' => continue, c if c.is_ascii_whitespace() => continue, _ => return None };
        acc = (acc << 6) | v as u32; bits += 6;
        if bits >= 8 { bits -= 8; out.push((acc >> bits) as u8); acc &= (1 << bits) - 1; }
    }
    Some(out)
}
/// The certificates inside a PKCS #7 / CMS SignedData bundle (.p7b, .p7c — what Windows and many CAs hand out as "the chain").
fn p7_certs(der: &[u8]) -> Option<Vec<&[u8]>> {
    let (t, ci, _) = tlv(der)?; if t != 0x30 { return None; }
    let (t, oid, rest) = tlv(ci)?; if t != 0x06 || oid != [0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x07, 0x02] { return None; }
    let (t, exp, _) = tlv(rest)?; if t != 0xA0 { return None; }
    let (t, sd, _) = tlv(exp)?; if t != 0x30 { return None; }
    let (_, _, r) = tlv(sd)?; let (_, _, r) = tlv(r)?; let (_, _, r) = tlv(r)?; // version, digestAlgorithms, encapContentInfo
    let mut out = Vec::new();
    if let Some((0xA0, mut certs, _)) = tlv(r) {
        while !certs.is_empty() { let (t, _, rest) = tlv(certs)?; let raw = &certs[..certs.len() - rest.len()]; if t == 0x30 { out.push(raw); } certs = rest; }
    }
    Some(out)
}
/// The text of a file as people have it: UTF-8 (BOM dropped), UTF-16 (Windows tools), or PEM after a preamble in another encoding.
fn as_text(input: &[u8]) -> Option<String> {
    let u16 = |be: bool, b: &[u8]| -> String { let v: Vec<u16> = b.chunks_exact(2).map(|c| if be { u16::from_be_bytes([c[0], c[1]]) } else { u16::from_le_bytes([c[0], c[1]]) }).collect(); String::from_utf16_lossy(&v) };
    let t = if input.starts_with(&[0xFF, 0xFE]) { u16(false, &input[2..]) } else if input.starts_with(&[0xFE, 0xFF]) { u16(true, &input[2..]) }
        else if input.len() > 20 && input[1] == 0 && input[3] == 0 && input[0] != 0 { u16(false, input) } else if input.len() > 20 && input[0] == 0 && input[2] == 0 && input[1] != 0 { u16(true, input) }
        else { String::from_utf8_lossy(input.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(input)).into_owned() };
    if t.contains("-----BEGIN") { Some(t) } else { None }
}
/// PEM blocks, read leniently: indented or quoted lines ("> "), CRLF, text around and between blocks, RFC 1421 header
/// lines, and PEM stored in JSON / .env files with literal \n between the lines.
fn pem_blocks(t: &str) -> Result<Vec<(String, Vec<u8>)>, String> {
    let t = if t.contains("\\n") { t.replace("\\r\\n", "\n").replace("\\n", "\n") } else { t.to_string() };
    let mut out = Vec::new(); let mut cur: Option<(String, String)> = None;
    // the label of a "-----BEGIN x-----" / "-----END x-----" marker anywhere in a line (JSON puts {"cert":" before it)
    let marker = |l: &str, kind: &str| -> Option<String> { let at = l.find(kind)?; let rest = &l[at + kind.len()..]; rest.find("-----").map(|e| rest[..e].trim().to_string()) };
    for line in t.lines() {
        let l = line.trim_matches(|c: char| c.is_whitespace() || c == '>' || c == '"' || c == '\'' || c == ',' || c == '\u{feff}');
        if let Some(lab) = marker(l, "-----BEGIN ") {
            if let Some((open, _)) = &cur { return Err(format!("The PEM block \"{open}\" has no -----END line (was it cut off?)")); }
            cur = Some((lab, String::new()));
            if marker(l, "-----END ").is_none() { continue; } // (BEGIN … END on one line falls through)
        }
        if let Some(lab) = marker(l, "-----END ") {
            let (open, mut body) = cur.take().ok_or_else(|| format!("-----END {lab}----- without a -----BEGIN line before it"))?;
            if open != lab { return Err(format!("-----BEGIN {open}----- is closed by -----END {lab}-----")); }
            if let (Some(b), Some(e)) = (l.find("-----BEGIN "), l.find("-----END ")) { if b < e { let inner = &l[b..e]; if let Some(p) = inner[11..].find("-----") { body.push_str(inner[11 + p + 5..].trim()); } } } // one-line PEM
            let der = b64_decode(&body).filter(|d| !d.is_empty()).ok_or_else(|| format!("The PEM block \"{open}\" is not valid Base64 (was part of it left out?)"))?;
            out.push((open, der));
        } else if let Some((_, body)) = cur.as_mut() {
            if !l.contains(':') { body.push_str(l); } // (lines like "Proc-Type: 4,ENCRYPTED" are headers)
        }
    }
    if let Some((open, _)) = cur { return Err(format!("The PEM block \"{open}\" has no -----END line (was it cut off?)")); }
    Ok(out)
}
fn p7_items(der: &[u8], items: &mut Vec<Value>) -> Result<bool, String> {
    match p7_certs(der) {
        Some(v) if v.is_empty() => Err("This PKCS #7 file holds no certificates".into()),
        Some(v) => { for c in v { items.push(cert(c)?); } Ok(true) }
        None => Ok(false),
    }
}
pub fn run(input: &[u8]) -> R {
    let mut items = Vec::new();
    if let Some(text) = as_text(input) {
        for (label, der) in pem_blocks(&text)? {
            match label.as_str() {
                "CERTIFICATE" | "X509 CERTIFICATE" | "TRUSTED CERTIFICATE" => items.push(cert(&der)?),
                "CERTIFICATE REQUEST" | "NEW CERTIFICATE REQUEST" => items.push(csr(&der)?),
                "PKCS7" | "CMS" | "PKCS #7 SIGNED DATA" => { if !p7_items(&der, &mut items)? { items.push(json!({ "kind": "other", "label": label, "size": der.len() })); } }
                "PUBLIC KEY" => items.push(pubkey(&der).unwrap_or_else(|| json!({ "kind": "other", "label": label, "size": der.len() }))),
                l => items.push(json!({ "kind": "other", "label": l, "size": der.len(), "private": l.contains("PRIVATE KEY") })),
            }
        }
        if items.is_empty() { return Err("No PEM blocks found".into()); }
    } else if input.is_empty() { return Err("Paste a certificate or choose a file".into()); }
    else if let Ok(c) = cert(input).or_else(|_| csr(input)) { items.push(c); }
    else if !p7_items(input, &mut items)? {
        if let Some(k) = pubkey(input) { items.push(k); } else { return Err("Not a certificate or certificate request (PEM or DER)".into()); }
    }
    js(json!({ "items": items }))
}
