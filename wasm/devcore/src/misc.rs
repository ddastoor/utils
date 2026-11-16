//! cron (croner), semver (node-semver rules), glob (globset), unified-diff patch (diffy), SQL formatting (sqlformat),
//! hex dump.
#![allow(unused_imports)]
use crate::{arg, js, s, R};
use serde_json::{json, Value};

// ------------------------------------------------------------------ cron: {expr, tz, from (unix ms), count, seconds}
/// The time zone of the page: offsets come from the browser (Intl) through the `env.tz_offset` import, so no tz database
/// is compiled in (chrono-tz would add ~0.9 MB).
#[cfg(feature = "cron")]
mod host_tz {
    use chrono::{FixedOffset, LocalResult, NaiveDate, NaiveDateTime, Offset, TimeZone};
    #[link(wasm_import_module = "env")]
    extern "C" { fn tz_offset(utc_ms: f64) -> i32; }
    #[derive(Clone, Copy, Debug)]
    pub struct HostTz;
    fn at(utc: &NaiveDateTime) -> FixedOffset { let m = unsafe { tz_offset(utc.and_utc().timestamp_millis() as f64) }; FixedOffset::east_opt(m * 60).unwrap_or(FixedOffset::east_opt(0).unwrap()) }
    impl TimeZone for HostTz {
        type Offset = FixedOffset;
        fn from_offset(_: &FixedOffset) -> Self { HostTz }
        fn offset_from_local_date(&self, local: &NaiveDate) -> LocalResult<FixedOffset> { self.offset_from_local_datetime(&local.and_hms_opt(0, 0, 0).unwrap()) }
        fn offset_from_local_datetime(&self, local: &NaiveDateTime) -> LocalResult<FixedOffset> {
            // the offsets in force 14 h either side; keep those that read back as this wall time (two = repeated hour, none = skipped hour)
            let d = chrono::Duration::hours(14);
            let mut c: Vec<FixedOffset> = vec![at(&(*local - d)), at(&(*local + d))];
            c.dedup_by_key(|o| o.local_minus_utc());
            let mut ok: Vec<FixedOffset> = c.into_iter().filter(|o| at(&(*local - chrono::Duration::seconds(o.local_minus_utc() as i64))).local_minus_utc() == o.local_minus_utc()).collect();
            ok.sort_by_key(|o| -o.local_minus_utc()); // larger offset = earlier instant
            match ok.len() { 0 => LocalResult::None, 1 => LocalResult::Single(ok[0]), _ => LocalResult::Ambiguous(ok[0], ok[1]) }
        }
        fn offset_from_utc_date(&self, utc: &NaiveDate) -> FixedOffset { at(&utc.and_hms_opt(0, 0, 0).unwrap()) }
        fn offset_from_utc_datetime(&self, utc: &NaiveDateTime) -> FixedOffset { at(utc) }
    }
}

// ------------------------------------------------------------------ cron: {expr, from (unix ms), count}; zone = env.tz_offset
#[cfg(feature = "cron")]
pub fn cron(input: &[u8]) -> R {
    use croner::parser::{CronParser, Seconds};
    use chrono::TimeZone;
    let a = arg(input)?;
    let expr = s(&a, "expr").trim();
    if expr.is_empty() { return Err("Enter a cron expression, e.g. */15 * * * *".into()); }
    let c = CronParser::builder().seconds(Seconds::Optional).build().parse(expr).map_err(|e| format!("{e}"))?;
    let from = a.get("from").and_then(|v| v.as_i64()).unwrap_or(0);
    let n = a.get("count").and_then(|v| v.as_u64()).unwrap_or(10).min(100) as usize;
    let start = host_tz::HostTz.timestamp_millis_opt(from).single().ok_or("bad start time")?;
    let next: Vec<Value> = c.iter_after(start).take(n).map(|t| json!({ "ms": t.timestamp_millis() })).collect();
    js(json!({ "description": c.describe(), "next": next, "fields": expr.split_whitespace().count() }))
}

// ------------------------------------------------------------------ semver: {versions:[...], range, inc}
/// Strict SemVer 2.0.0 syntax (semver.org grammar; a leading "v" allowed like node-semver). The parser crate is looser
/// ("1.2.3.4", "01.2.3", "1.2.3abc" would be accepted), so versions are checked here first.
#[cfg(feature = "semver")]
fn strict(v: &str) -> bool {
    let v = v.strip_prefix('v').unwrap_or(v);
    let (rest, build) = match v.split_once('+') { Some((a, b)) => (a, Some(b)), None => (v, None) };
    let (core, pre) = match rest.split_once('-') { Some((a, b)) => (a, Some(b)), None => (rest, None) };
    let num = |x: &str| !x.is_empty() && x.bytes().all(|c| c.is_ascii_digit()) && (x == "0" || !x.starts_with('0'));
    let ident = |x: &str| !x.is_empty() && x.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-');
    let parts: Vec<&str> = core.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| num(p))
        && pre.map_or(true, |p| p.split('.').all(|i| ident(i) && (!i.bytes().all(|c| c.is_ascii_digit()) || num(i))))
        && build.map_or(true, |b| b.split('.').all(ident))
}
#[cfg(feature = "semver")]
pub fn semver(input: &[u8]) -> R {
    use nodejs_semver::{Range, Version};
    let a = arg(input)?;
    let range_s = s(&a, "range").trim();
    let range = if range_s.is_empty() { None } else { Some(Range::parse(range_s).map_err(|_| format!("\"{range_s}\" is not a valid range"))?) };
    let pre = a.get("prerelease").and_then(|v| v.as_bool()).unwrap_or(false);
    let mut good: Vec<Version> = Vec::new(); let mut rows = Vec::new();
    for raw in a.get("versions").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let t = raw.as_str().unwrap_or("").trim().to_string(); if t.is_empty() { continue; }
        match Version::parse(&t).ok().filter(|_| strict(&t)).ok_or(()) {
            Ok(v) => {
                let sat = range.as_ref().map(|r| v.satisfies_with_prerelease(r, pre));
                rows.push(json!({ "input": t, "valid": true, "version": v.to_string(), "satisfies": sat, "prerelease": v.is_prerelease() }));
                good.push(v);
            }
            Err(_) => rows.push(json!({ "input": t, "valid": false })),
        }
    }
    let mut sorted = good.clone(); sorted.sort();
    let max = range.as_ref().and_then(|r| good.iter().filter(|v| v.satisfies_with_prerelease(r, pre)).max()).map(|v| v.to_string());
    let min = range.as_ref().and_then(|r| good.iter().filter(|v| v.satisfies_with_prerelease(r, pre)).min()).map(|v| v.to_string());
    let bumps = good.first().map(|v| {
        let id = s(&a, "preid"); let id = if id.is_empty() { None } else { Some(id) };
        let mut o = serde_json::Map::new();
        for k in ["major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease"] { o.insert(k.into(), v.inc(k, id, None).map(|x| x.to_string().into()).unwrap_or(Value::Null)); }
        Value::Object(o)
    });
    let range_info = range.as_ref().map(|r| json!({ "normalized": r.to_string(), "min": r.min_version().map(|v| v.to_string()) }));
    js(json!({ "rows": rows, "sorted": sorted.iter().map(|v| v.to_string()).collect::<Vec<_>>(), "max": max, "min": min, "bumps": bumps, "range": range_info }))
}

// ------------------------------------------------------------------ glob: {patterns:[...], paths:[...], caseInsensitive, dot}
#[cfg(feature = "glob")]
pub fn glob(input: &[u8]) -> R {
    use globset::GlobBuilder;
    let a = arg(input)?;
    let ci = a.get("caseInsensitive").and_then(|v| v.as_bool()).unwrap_or(false);
    let dot = a.get("dot").and_then(|v| v.as_bool()).unwrap_or(true);
    let mut pats = Vec::new(); let mut errors = Vec::new();
    for (i, p) in a.get("patterns").and_then(|v| v.as_array()).cloned().unwrap_or_default().iter().enumerate() {
        let raw = p.as_str().unwrap_or("").trim(); if raw.is_empty() || raw.starts_with('#') { continue; }
        let (neg, body) = match raw.strip_prefix('!') { Some(b) => (true, b), None => (false, raw) };
        match GlobBuilder::new(body).literal_separator(true).case_insensitive(ci).backslash_escape(true).empty_alternates(true).build() {
            Ok(g) => pats.push((i, raw.to_string(), neg, g.compile_matcher())),
            Err(e) => errors.push(json!({ "pattern": raw, "error": e.kind().to_string() })),
        }
    }
    let has_pos = pats.iter().any(|p| !p.2);
    let rows: Vec<Value> = a.get("paths").and_then(|v| v.as_array()).cloned().unwrap_or_default().iter().filter_map(|p| p.as_str()).map(|x| x.trim()).filter(|x| !x.is_empty()).map(|path| {
        let hidden = !dot && path.split('/').any(|seg| seg.starts_with('.') && seg != "." && seg != "..");
        // the last pattern that matches decides (like .gitignore); with only negative patterns everything else matches
        let mut m = !has_pos; let mut by = Value::Null;
        for (_, raw, neg, g) in &pats { if g.is_match(path) { m = !*neg; by = Value::String(raw.clone()); } }
        if hidden { m = false; }
        json!({ "path": path, "match": m, "by": by })
    }).collect();
    js(json!({ "rows": rows, "errors": errors }))
}

// ------------------------------------------------------------------ patch: {original, patch, reverse}
#[cfg(feature = "patch")]
pub fn patch(input: &[u8]) -> R {
    let a = arg(input)?;
    let orig = s(&a, "original"); let p = s(&a, "patch");
    // keep only the first file of a multi-file diff and drop git's extended header lines
    let mut lines: Vec<&str> = Vec::new(); let mut files = 0;
    for l in p.lines() {
        if l.starts_with("diff --git") || (l.starts_with("--- ") && lines.iter().any(|x| x.starts_with("@@"))) { files += 1; if files > 1 { break; } if l.starts_with("diff --git") { continue; } }
        if l.starts_with("index ") || l.starts_with("new file mode") || l.starts_with("deleted file mode") || l.starts_with("similarity index") || l.starts_with("old mode") || l.starts_with("new mode") { continue; }
        lines.push(l);
    }
    let mut text = lines.join("\n"); if !text.ends_with('\n') { text.push('\n'); }
    if !text.contains("@@") { return Err("No hunks found — paste a unified diff (lines starting with @@, -, +)".into()); }
    if !text.starts_with("---") { text = format!("--- a\n+++ b\n{text}"); }
    let patch = diffy::Patch::from_str(&text).map_err(|e| format!("Could not read the patch: {e}"))?;
    let patch = if a.get("reverse").and_then(|v| v.as_bool()).unwrap_or(false) { patch.reverse() } else { patch };
    let hunks = patch.hunks().len();
    let (add, del) = patch.hunks().iter().flat_map(|h| h.lines()).fold((0, 0), |(a, d), l| match l { diffy::Line::Insert(_) => (a + 1, d), diffy::Line::Delete(_) => (a, d + 1), _ => (a, d) });
    let out = diffy::apply(orig, &patch).map_err(|e| format!("The patch does not apply: {e}"))?;
    js(json!({ "result": out, "hunks": hunks, "added": add, "removed": del, "files": files.max(1), "original": patch.original(), "modified": patch.modified() }))
}

// ------------------------------------------------------------------ SQL formatting: {sql, indent (spaces, 0 = tab), uppercase, lines}
#[cfg(feature = "sqlfmt")]
pub fn sqlfmt(input: &[u8]) -> R {
    use sqlformat::{format, FormatOptions, Indent, QueryParams};
    let a = arg(input)?;
    let ind = a.get("indent").and_then(|v| v.as_u64()).unwrap_or(2);
    let opts = FormatOptions {
        indent: if ind == 0 { Indent::Tabs } else { Indent::Spaces(ind as u8) },
        uppercase: a.get("uppercase").and_then(|v| v.as_bool()),
        lines_between_queries: a.get("lines").and_then(|v| v.as_u64()).unwrap_or(1) as u8,
        inline: a.get("inline").and_then(|v| v.as_bool()).unwrap_or(false),
        ..Default::default()
    };
    Ok(format(s(&a, "sql"), &QueryParams::None, &opts).into_bytes())
}

// ------------------------------------------------------------------ hex dump: [u32 offset LE][u32 width][u32 maxLines] + bytes
pub fn hexdump(input: &[u8]) -> R {
    if input.len() < 12 { return Err("bad hexdump input".into()); }
    let off = u32::from_le_bytes(input[0..4].try_into().unwrap()) as usize;
    let w = (u32::from_le_bytes(input[4..8].try_into().unwrap()) as usize).clamp(1, 64);
    let data = &input[12..];
    let mut o = String::with_capacity(data.len() * 4 + 64);
    let digits = if off + data.len() > 0xffff_ffff { 12 } else { 8 };
    for (i, c) in data.chunks(w).enumerate() {
        use std::fmt::Write;
        let _ = write!(o, "{:0digits$x}  ", off + i * w);
        for k in 0..w { if k < c.len() { let _ = write!(o, "{:02x} ", c[k]); } else { o.push_str("   "); } if k % 8 == 7 && k + 1 < w { o.push(' '); } }
        o.push_str(" |");
        for &b in c { o.push(if (0x20..0x7f).contains(&b) { b as char } else { '.' }); }
        o.push_str("|\n");
    }
    let _ = Value::Null;
    Ok(o.into_bytes())
}

// ------------------------------------------------------------------ find: [u32 from][u32 max hits][u32 needle len][needle][haystack] → JSON offsets
pub fn find(input: &[u8]) -> R {
    if input.len() < 12 { return Err("bad find input".into()); }
    let from = u32::from_le_bytes(input[0..4].try_into().unwrap()) as usize;
    let max = u32::from_le_bytes(input[4..8].try_into().unwrap()) as usize;
    let n = u32::from_le_bytes(input[8..12].try_into().unwrap()) as usize;
    if n == 0 || input.len() < 12 + n { return Err("empty search".into()); }
    let (needle, hay) = (&input[12..12 + n], &input[12 + n..]);
    let mut hits = Vec::new(); let mut i = from;
    while i + n <= hay.len() && hits.len() < max {
        match hay[i..].iter().position(|&b| b == needle[0]) { None => break, Some(k) => { i += k; if i + n <= hay.len() && &hay[i..i + n] == needle { hits.push(i); } i += 1; } }
    }
    js(json!({ "hits": hits, "more": hits.len() == max }))
}
