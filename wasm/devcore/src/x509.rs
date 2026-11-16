//! X.509 certificate / CSR decoder (x509-parser). Input: PEM text (one or more blocks: a chain) or DER bytes.
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
fn oid_name(o: &x509_parser::der_parser::oid::Oid) -> String { oid2sn(o, oid_registry()).map(|s| s.to_string()).unwrap_or_else(|_| o.to_id_string()) }
fn gn(g: &GeneralName) -> String {
    match g {
        GeneralName::DNSName(s) => format!("DNS:{s}"), GeneralName::RFC822Name(s) => format!("email:{s}"), GeneralName::URI(s) => format!("URI:{s}"),
        GeneralName::IPAddress(b) => match b.len() { 4 => format!("IP:{}", std::net::Ipv4Addr::from(<[u8; 4]>::try_from(*b).unwrap())), 16 => format!("IP:{}", std::net::Ipv6Addr::from(<[u8; 16]>::try_from(*b).unwrap())), _ => format!("IP:{}", hexc(b)) },
        GeneralName::DirectoryName(n) => format!("DirName:{n}"), GeneralName::RegisteredID(o) => format!("RID:{}", o.to_id_string()),
        GeneralName::OtherName(o, _) => format!("othername:{}", o.to_id_string()), other => format!("{other:?}"),
    }
}
fn key(spki: &SubjectPublicKeyInfo) -> Value {
    let alg = oid_name(&spki.algorithm.algorithm);
    match spki.parsed() {
        Ok(PublicKey::RSA(r)) => json!({ "type": "RSA", "bits": r.key_size(), "exponent": r.try_exponent().map(|e| e.to_string()).unwrap_or_default() }),
        Ok(PublicKey::EC(p)) => {
            let curve = spki.algorithm.parameters.as_ref().and_then(|a| a.as_oid().ok()).map(|o| match o.to_id_string().as_str() { "1.2.840.10045.3.1.7" => "P-256".into(), "1.3.132.0.34" => "P-384".into(), "1.3.132.0.35" => "P-521".into(), "1.3.132.0.10" => "secp256k1".into(), s => s.to_string() }).unwrap_or_default();
            json!({ "type": "EC", "bits": p.key_size(), "curve": curve })
        }
        _ => {
            let id = spki.algorithm.algorithm.to_id_string();
            let t = match id.as_str() { "1.3.101.112" => "Ed25519", "1.3.101.113" => "Ed448", "1.3.101.110" => "X25519", "1.2.840.10040.4.1" => "DSA", _ => alg.as_str() };
            json!({ "type": t, "bits": if t == "Ed25519" || t == "X25519" { 256 } else if t == "Ed448" { 456 } else { spki.subject_public_key.data.len() * 8 } })
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
pub fn run(input: &[u8]) -> R {
    let text = std::str::from_utf8(input).ok().filter(|t| t.contains("-----BEGIN"));
    let mut items = Vec::new();
    if text.is_some() {
        for p in Pem::iter_from_buffer(input) {
            let p = p.map_err(|e| format!("Bad PEM: {e}"))?;
            items.push(match p.label.as_str() {
                "CERTIFICATE" | "X509 CERTIFICATE" | "TRUSTED CERTIFICATE" => cert(&p.contents)?,
                "CERTIFICATE REQUEST" | "NEW CERTIFICATE REQUEST" => csr(&p.contents)?,
                l => json!({ "kind": "other", "label": l, "size": p.contents.len() }),
            });
        }
        if items.is_empty() { return Err("No PEM blocks found".into()); }
    } else if input.is_empty() { return Err("Paste a certificate or choose a file".into()); }
    else { items.push(cert(input).or_else(|_| csr(input)).map_err(|_| "Not a certificate or certificate request (PEM or DER)".to_string())?); }
    js(json!({ "items": items }))
}
