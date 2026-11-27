//! MHTML (RFC 2557: MIME's multipart/related, the "Webpage, Single File" of Chrome and Edge and the "Download page" of
//! Chrome on Android): the page and every file it showed, each part with its address. Our own reader — headers (folded
//! lines, quoted parameters, encoded words), the parts between the boundaries (nested multiparts too), base64 and
//! quoted-printable undone. Nothing is changed in the bytes otherwise: a text part keeps its own character set (the page
//! decodes it).

/// A part: its type, character set, address (Content-Location), Content-ID and where its bytes are in the blob.
pub struct Part { pub ctype: String, pub charset: String, pub location: String, pub cid: String, pub at: usize, pub len: usize }

pub struct Mhtml { pub url: String, pub subject: String, pub parts: Vec<Part> }

/// The headers and the body of a MIME entity (the body starts after the first empty line).
fn split(b: &[u8]) -> (&[u8], &[u8]) {
    let mut i = 0;
    while i < b.len() {
        // an empty line: CR LF CR LF or LF LF (or LF CR LF)
        if b[i] == b'\n' {
            if b.get(i + 1) == Some(&b'\n') { return (&b[..i], &b[i + 2..]); }
            if b.get(i + 1) == Some(&b'\r') && b.get(i + 2) == Some(&b'\n') { return (&b[..i], &b[i + 3..]); }
        }
        i += 1;
    }
    (b, &[])
}

/// Header lines, unfolded (a line that starts with a space or a tab goes on the one before), names in lower case.
pub fn headers(h: &[u8]) -> Vec<(String, String)> {
    let text = String::from_utf8_lossy(h);
    let mut out: Vec<(String, String)> = Vec::new();
    for line in text.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() { continue; }
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some(last) = out.last_mut() { last.1.push_str(line); }
            continue;
        }
        if let Some((k, v)) = line.split_once(':') { out.push((k.trim().to_ascii_lowercase(), v.trim().to_string())); }
    }
    out
}
fn header<'a>(hs: &'a [(String, String)], name: &str) -> Option<&'a str> { hs.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str()) }

/// A Content-Type: the type (lower case) and its parameters (names in lower case; quoted values unquoted).
pub fn content_type(v: &str) -> (String, Vec<(String, String)>) {
    let mut it = v.char_indices().peekable();
    let mut mime = String::new();
    while let Some(&(_, c)) = it.peek() { if c == ';' { break; } mime.push(c); it.next(); }
    let mut params = Vec::new();
    loop {
        // skip ; and white space
        while let Some(&(_, c)) = it.peek() { if c == ';' || c.is_whitespace() { it.next(); } else { break; } }
        let mut name = String::new();
        while let Some(&(_, c)) = it.peek() { if c == '=' || c == ';' { break; } name.push(c); it.next(); }
        if name.trim().is_empty() { if it.peek().is_none() { break; } it.next(); continue; }
        let mut value = String::new();
        if let Some(&(_, '=')) = it.peek() {
            it.next();
            while let Some(&(_, c)) = it.peek() { if c == ' ' || c == '\t' { it.next(); } else { break; } }
            if let Some(&(_, '"')) = it.peek() {
                it.next();
                while let Some((_, c)) = it.next() {
                    if c == '\\' { if let Some((_, d)) = it.next() { value.push(d); } continue; }
                    if c == '"' { break; }
                    value.push(c);
                }
            } else {
                while let Some(&(_, c)) = it.peek() { if c == ';' { break; } value.push(c); it.next(); }
                value = value.trim().to_string();
            }
        }
        params.push((name.trim().to_ascii_lowercase(), value));
        if it.peek().is_none() { break; }
    }
    (mime.trim().to_ascii_lowercase(), params)
}
fn param<'a>(ps: &'a [(String, String)], name: &str) -> Option<&'a str> { ps.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str()) }

fn find(h: &[u8], n: &[u8], from: usize) -> Option<usize> {
    if n.is_empty() || from >= h.len() { return None; }
    h[from..].windows(n.len()).position(|w| w == n).map(|p| p + from)
}

/// The parts of a multipart body: what stands between delimiter lines ("--boundary"), up to the closing one
/// ("--boundary--") or the end of a cut-off file.
pub fn multipart<'a>(body: &'a [u8], boundary: &str) -> Vec<&'a [u8]> {
    let delim = format!("--{boundary}").into_bytes();
    let mut starts = Vec::new();
    let mut i = 0;
    while let Some(p) = find(body, &delim, i) {
        if p == 0 || body[p - 1] == b'\n' { starts.push(p); }
        i = p + delim.len();
    }
    let mut out = Vec::new();
    for (k, &p) in starts.iter().enumerate() {
        let after = p + delim.len();
        if body[after..].starts_with(b"--") { break; }
        // the rest of the delimiter's line (white space) and its line end
        let Some(nl) = body[after..].iter().position(|&c| c == b'\n') else { break };
        let s = after + nl + 1;
        let mut e = starts.get(k + 1).copied().unwrap_or(body.len());
        // the line end before the next delimiter belongs to the delimiter
        if starts.get(k + 1).is_some() {
            if e > s && body[e - 1] == b'\n' { e -= 1; }
            if e > s && body[e - 1] == b'\r' { e -= 1; }
        }
        if e >= s { out.push(&body[s..e]); }
    }
    out
}

pub fn base64(b: &[u8]) -> Vec<u8> {
    let val = |c: u8| -> Option<u32> { match c { b'A'..=b'Z' => Some((c - b'A') as u32), b'a'..=b'z' => Some((c - b'a' + 26) as u32), b'0'..=b'9' => Some((c - b'0' + 52) as u32), b'+' | b'-' => Some(62), b'/' | b'_' => Some(63), _ => None } };
    let mut out = Vec::with_capacity(b.len() * 3 / 4);
    let (mut acc, mut n) = (0u32, 0);
    for &c in b {
        if c == b'=' { break; }
        let Some(v) = val(c) else { continue };
        acc = (acc << 6) | v; n += 1;
        if n == 4 { out.extend_from_slice(&[(acc >> 16) as u8, (acc >> 8) as u8, acc as u8]); acc = 0; n = 0; }
    }
    if n == 2 { out.push((acc >> 4) as u8); }
    if n == 3 { out.extend_from_slice(&[(acc >> 10) as u8, (acc >> 2) as u8]); }
    out
}

pub fn quoted_printable(b: &[u8]) -> Vec<u8> {
    let hex = |c: u8| (c as char).to_digit(16);
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c == b'=' {
            // a soft line break: "=" then white space to the line end
            let mut j = i + 1;
            while j < b.len() && (b[j] == b' ' || b[j] == b'\t') { j += 1; }
            if j < b.len() && b[j] == b'\n' { i = j + 1; continue; }
            if j + 1 < b.len() && b[j] == b'\r' && b[j + 1] == b'\n' { i = j + 2; continue; }
            if j >= b.len() { i = j; continue; }
            if i + 2 < b.len() {
                if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) { out.push((h * 16 + l) as u8); i += 3; continue; }
            }
        }
        out.push(c);
        i += 1;
    }
    out
}

/// RFC 2047 encoded words (=?UTF-8?Q?…?= / =?…?B?…?=) in a header — Chrome writes a non-ASCII title so.
pub fn decode_words(v: &str) -> String {
    let mut out = String::new();
    let mut rest = v;
    let mut last_word = false;
    while let Some(p) = rest.find("=?") {
        let (before, after) = rest.split_at(p);
        // white space between two encoded words is dropped
        if !(last_word && before.trim().is_empty()) { out.push_str(before); }
        let parts: Vec<&str> = after[2..].splitn(3, '?').collect();
        if parts.len() < 3 { out.push_str(after); return out; }
        let (cs, enc, tail) = (parts[0].to_ascii_lowercase(), parts[1].to_ascii_uppercase(), parts[2]);
        let Some(end) = tail.find("?=") else { out.push_str(after); return out; };
        let text = &tail[..end];
        let bytes = match enc.as_str() {
            "B" => base64(text.as_bytes()),
            "Q" => quoted_printable(text.replace('_', " ").as_bytes()),
            _ => text.as_bytes().to_vec(),
        };
        if cs.starts_with("utf-8") || cs == "us-ascii" { out.push_str(&String::from_utf8_lossy(&bytes)); }
        else { out.extend(bytes.iter().map(|&b| b as char)); } // Latin-1 and the like: near enough for a title
        rest = &tail[end + 2..];
        last_word = true;
    }
    out.push_str(rest);
    out
}

fn decode(cte: &str, body: &[u8]) -> Vec<u8> {
    match cte.trim().to_ascii_lowercase().as_str() {
        "base64" => base64(body),
        "quoted-printable" => quoted_printable(body),
        _ => body.to_vec(),
    }
}

fn walk(entity: &[u8], blob: &mut Vec<u8>, parts: &mut Vec<Part>, depth: usize) {
    let (h, body) = split(entity);
    let hs = headers(h);
    let (mime, ps) = content_type(header(&hs, "content-type").unwrap_or("text/plain"));
    if mime.starts_with("multipart/") && depth < 8 {
        if let Some(b) = param(&ps, "boundary") {
            for p in multipart(body, b) { walk(p, blob, parts, depth + 1); }
            return;
        }
    }
    let bytes = decode(header(&hs, "content-transfer-encoding").unwrap_or(""), body);
    let at = blob.len();
    blob.extend_from_slice(&bytes);
    let cid = header(&hs, "content-id").unwrap_or("").trim().trim_start_matches('<').trim_end_matches('>').to_string();
    parts.push(Part { ctype: mime, charset: param(&ps, "charset").unwrap_or("").to_ascii_lowercase(), location: header(&hs, "content-location").unwrap_or("").trim().to_string(), cid, at, len: bytes.len() });
}

/// An MHTML file: the page's address (Snapshot-Content-Location, else the first page part's), its subject (the title
/// Chrome writes) and every part, the bytes of each appended to `blob`.
pub fn read(b: &[u8], blob: &mut Vec<u8>) -> Result<Mhtml, String> {
    let (h, _) = split(b);
    let hs = headers(h);
    let ct = header(&hs, "content-type").ok_or("it has no Content-Type header: not a saved web page (MHTML)")?;
    let (mime, _) = content_type(ct);
    if !mime.starts_with("multipart/") && !mime.starts_with("text/html") { return Err(format!("it is {mime}, not a saved web page")); }
    let mut parts = Vec::new();
    walk(b, blob, &mut parts, 0);
    if parts.is_empty() { return Err("no parts were found in it".into()); }
    let url = header(&hs, "snapshot-content-location").map(str::to_string)
        .or_else(|| parts.iter().find(|p| p.ctype == "text/html" && !p.location.is_empty()).map(|p| p.location.clone()))
        .unwrap_or_default();
    Ok(Mhtml { url: url.trim().to_string(), subject: decode_words(header(&hs, "subject").unwrap_or("")), parts })
}
