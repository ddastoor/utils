//! Safari's web archive (.webarchive — an iPhone's "Web Archive" in Share → Options, a Mac's "Save As… Web Archive"): a
//! binary property list (Apple's "bplist00") holding the page (WebMainResource), the files it showed (WebSubresources)
//! and its frames (WebSubframeArchives), each with its bytes, address, type and text encoding. Our own reader of the
//! binary format (CFBinaryPList's layout: the objects, an offset table, a 32-byte trailer), bounds-checked, nesting held
//! to 64 levels.
use crate::mhtml::Part;

enum Val<'a> { Data(&'a [u8]), Str(String), Array(Vec<usize>), Dict(Vec<(usize, usize)>), Other }

struct Plist<'a> { b: &'a [u8], offsets: Vec<usize>, refsize: usize }

fn be(b: &[u8]) -> u64 { b.iter().fold(0u64, |a, &x| (a << 8) | x as u64) }

impl<'a> Plist<'a> {
    fn new(b: &'a [u8]) -> Result<(Self, usize), String> {
        if b.len() < 40 || &b[..8] != b"bplist00" { return Err("it is not a binary property list".into()); }
        let t = &b[b.len() - 32..];
        let (osize, refsize) = (t[6] as usize, t[7] as usize);
        let (n, top, table) = (be(&t[8..16]) as usize, be(&t[16..24]) as usize, be(&t[24..32]) as usize);
        if !(1..=8).contains(&osize) || !(1..=8).contains(&refsize) || n == 0 || top >= n { return Err("its property list is damaged".into()); }
        let end = table.checked_add(n.checked_mul(osize).ok_or("damaged")?).ok_or("damaged")?;
        if end > b.len() - 32 { return Err("its property list is damaged (the offset table runs past the end)".into()); }
        let offsets = (0..n).map(|i| be(&b[table + i * osize..table + (i + 1) * osize]) as usize).collect();
        Ok((Plist { b, offsets, refsize }, top))
    }
    /// A length: the low four bits of the marker, or (0xF) an integer object after it. Returns (length, start of the content).
    fn len(&self, at: usize) -> Option<(usize, usize)> {
        let m = *self.b.get(at)?;
        if m & 0x0f != 0x0f { return Some(((m & 0x0f) as usize, at + 1)); }
        let im = *self.b.get(at + 1)?;
        if im >> 4 != 1 { return None; }
        let w = 1usize << (im & 0x0f);
        if w > 8 { return None; }
        let v = be(self.b.get(at + 2..at + 2 + w)?) as usize;
        Some((v, at + 2 + w))
    }
    fn refs(&self, at: usize, n: usize) -> Option<Vec<usize>> {
        let bytes = self.b.get(at..at.checked_add(n.checked_mul(self.refsize)?)?)?;
        Some(bytes.chunks(self.refsize).map(|c| be(c) as usize).collect())
    }
    fn obj(&self, i: usize) -> Option<Val<'a>> {
        let at = *self.offsets.get(i)?;
        let m = *self.b.get(at)?;
        Some(match m >> 4 {
            0x4 => { let (n, s) = self.len(at)?; Val::Data(self.b.get(s..s.checked_add(n)?)?) }
            0x5 => { let (n, s) = self.len(at)?; Val::Str(self.b.get(s..s.checked_add(n)?)?.iter().map(|&c| c as char).collect()) }
            0x6 => { let (n, s) = self.len(at)?; let u: Vec<u16> = self.b.get(s..s.checked_add(n.checked_mul(2)?)?)?.chunks(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect(); Val::Str(String::from_utf16_lossy(&u)) }
            0x7 => { let (n, s) = self.len(at)?; Val::Str(String::from_utf8_lossy(self.b.get(s..s.checked_add(n)?)?).into_owned()) }
            0xa => { let (n, s) = self.len(at)?; Val::Array(self.refs(s, n)?) }
            0xd => { let (n, s) = self.len(at)?; let ks = self.refs(s, n)?; let vs = self.refs(s.checked_add(n.checked_mul(self.refsize)?)?, n)?; Val::Dict(ks.into_iter().zip(vs).collect()) }
            _ => Val::Other,
        })
    }
    fn get(&self, dict: usize, key: &str) -> Option<usize> {
        let Val::Dict(kv) = self.obj(dict)? else { return None };
        kv.into_iter().find(|&(k, _)| matches!(self.obj(k), Some(Val::Str(s)) if s == key)).map(|(_, v)| v)
    }
    fn string(&self, dict: usize, key: &str) -> String { match self.get(dict, key).and_then(|v| self.obj(v)) { Some(Val::Str(s)) => s, _ => String::new() } }
    fn data(&self, dict: usize, key: &str) -> Option<&'a [u8]> { match self.get(dict, key).and_then(|v| self.obj(v)) { Some(Val::Data(d)) => Some(d), Some(Val::Str(s)) if s.is_empty() => Some(&[]), _ => None } }
    fn array(&self, dict: usize, key: &str) -> Vec<usize> { match self.get(dict, key).and_then(|v| self.obj(v)) { Some(Val::Array(a)) => a, _ => Vec::new() } }
}

fn resource(p: &Plist, r: usize, blob: &mut Vec<u8>, parts: &mut Vec<Part>) {
    let Some(data) = p.data(r, "WebResourceData") else { return };
    let at = blob.len();
    blob.extend_from_slice(data);
    let ctype = p.string(r, "WebResourceMIMEType").to_ascii_lowercase();
    parts.push(Part { ctype, charset: p.string(r, "WebResourceTextEncodingName").to_ascii_lowercase(), location: p.string(r, "WebResourceURL"), cid: String::new(), at, len: data.len() });
}

fn archive(p: &Plist, a: usize, blob: &mut Vec<u8>, parts: &mut Vec<Part>, depth: usize) {
    if depth > 64 { return; }
    if let Some(main) = p.get(a, "WebMainResource") { resource(p, main, blob, parts); }
    for r in p.array(a, "WebSubresources") { resource(p, r, blob, parts); }
    for f in p.array(a, "WebSubframeArchives") { archive(p, f, blob, parts, depth + 1); }
}

/// A web archive: the page's address and every resource (the page first), the bytes of each appended to `blob`.
pub fn read(b: &[u8], blob: &mut Vec<u8>) -> Result<(String, Vec<Part>), String> {
    if b.starts_with(b"<?xml") || b.starts_with(b"<!DOCTYPE plist") || b.starts_with(b"<plist") { return Err("it is a web archive in Apple's XML form, which this tab does not read — save the page again as a Web Archive from Safari".into()); }
    let (p, top) = Plist::new(b)?;
    if p.get(top, "WebMainResource").is_none() { return Err("it is a property list, but not a web archive (no WebMainResource)".into()); }
    let mut parts = Vec::new();
    archive(&p, top, blob, &mut parts, 0);
    if parts.is_empty() { return Err("the web archive holds no page".into()); }
    let url = parts[0].location.clone();
    Ok((url, parts))
}
