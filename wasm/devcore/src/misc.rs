//! cron (croner), semver (node-semver rules), glob (globset), unified-diff patch,
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
    // A date that never comes (30 February, 31 April): croner would search day by day to the year 5000 — seconds of
    // work — and return nothing. Look at the next 30 years of dates first (covers every leap-year / weekday combination).
    let fields = expr.split_whitespace().count();
    let possible = {
        use chrono::Datelike;
        let (p, d0) = (&c.pattern, start.date_naive());
        (0..366 * 30).filter_map(|i| d0.checked_add_days(chrono::Days::new(i))).any(|d| p.year_match(d.year()).unwrap_or(false) && p.month_match(d.month()).unwrap_or(false) && p.day_match(d.year(), d.month(), d.day(), croner::Weekday::from_days_from_sunday(d.weekday().num_days_from_sunday())).unwrap_or(false))
    };
    let next: Vec<Value> = if possible || fields == 7 { c.iter_after(start).take(n).map(|t| json!({ "ms": t.timestamp_millis() })).collect() } else { Vec::new() };
    js(json!({ "description": c.describe(), "next": next, "fields": fields, "never": next.is_empty() }))
}

// ------------------------------------------------------------------ semver: {versions:[...], range, prerelease, preid}
/// npm's rules, by our port of the `semver` package (semver_npm.rs).
#[cfg(feature = "semver")]
pub fn semver(input: &[u8]) -> R {
    use crate::semver_npm::{Range, Ver};
    use std::cmp::Ordering;
    let a = arg(input)?;
    let range_s = s(&a, "range").trim();
    let pre = a.get("prerelease").and_then(|v| v.as_bool()).unwrap_or(false);
    let range = if range_s.is_empty() { None } else { Some(Range::parse(range_s, pre).map_err(|_| format!("\"{range_s}\" is not a valid range"))?) };
    let mut good: Vec<(String, Ver)> = Vec::new(); let mut rows = Vec::new();
    for raw in a.get("versions").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let t = raw.as_str().unwrap_or("").trim().to_string(); if t.is_empty() { continue; }
        match Ver::parse(&t) {
            Ok(v) => {
                let sat = range.as_ref().map(|r| r.test(&v));
                rows.push(json!({ "input": t, "valid": true, "version": v.version(), "satisfies": sat, "prerelease": !v.pre.is_empty() }));
                good.push((t, v));
            }
            Err(e) => rows.push(json!({ "input": t, "valid": false, "why": e })),
        }
    }
    let mut sorted: Vec<&Ver> = good.iter().map(|g| &g.1).collect(); sorted.sort_by(|x, y| x.compare_build(y));
    // maxSatisfying / minSatisfying: the first of equal versions wins, as in the package
    let pick = |want: Ordering| -> Option<String> {
        let r = range.as_ref()?; let mut best: Option<&(String, Ver)> = None;
        for g in good.iter().filter(|g| r.test(&g.1)) { if best.map_or(true, |b| g.1.compare(&b.1) == want) { best = Some(g); } }
        best.map(|b| b.1.version())
    };
    let (max, min) = (pick(Ordering::Greater), pick(Ordering::Less));
    let bumps = good.first().map(|(_, v)| {
        let id = s(&a, "preid"); let id = if id.is_empty() { None } else { Some(id) };
        let mut o = serde_json::Map::new();
        for k in ["major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease"] { let mut n = v.clone(); o.insert(k.into(), n.inc(k, id).map(|_| n.version().into()).unwrap_or(Value::Null)); }
        Value::Object(o)
    });
    let range_info = range.as_ref().map(|r| json!({ "normalized": r.formatted(), "min": r.min_version().map(|v| v.version()) }));
    js(json!({ "rows": rows, "sorted": sorted.iter().map(|v| v.with_build()).collect::<Vec<_>>(), "max": max, "min": min, "bumps": bumps, "range": range_info }))
}

// ------------------------------------------------------------------ glob: {patterns:[...], paths:[...], caseInsensitive, dot}
/// Our own glob matcher (was the globset crate, which matches bytes: "?" and "[…]" took one BYTE, so "?.txt" did not
/// match "न.txt" or "é.txt", and case-insensitive matching only knew ASCII). Rules, the same as before otherwise:
/// * and ? and […] never cross "/"; ** as a whole path component crosses folders ("**/" zero or more folders, "/**"
/// everything inside); {a,b} alternatives (nested, may be empty); [abc] [a-z] [!abc] [^abc]; backslash escapes.
#[cfg(feature = "glob")]
mod globm {
    #[derive(Debug)]
    pub enum Tok { Lit(char), Any, Star, Class(bool, Vec<(char, char)>), Dirs, Rest, All }
    /// {a,b{c,d}} → every alternative (as bash does), at most 4096 patterns.
    pub fn braces(p: &str) -> Result<Vec<String>, String> {
        let c: Vec<char> = p.chars().collect();
        let (mut depth, mut open, mut i, mut in_class) = (0usize, None, 0usize, false);
        let mut commas: Vec<usize> = Vec::new();
        while i < c.len() {
            match c[i] {
                '\\' => { i += 1; }
                '[' if !in_class => { in_class = c[i + 1..].contains(&']'); }
                ']' if in_class => { in_class = false; }
                '{' if !in_class => { if depth == 0 { open = Some(i); commas.clear(); } depth += 1; }
                ',' if !in_class && depth == 1 => commas.push(i),
                '}' if !in_class => {
                    if depth == 0 { return Err("unopened alternate group; missing '{' (to match a real brace write \\})".into()); }
                    depth -= 1;
                    if depth == 0 {
                        let o = open.unwrap(); let (pre, post): (String, String) = (c[..o].iter().collect(), c[i + 1..].iter().collect());
                        let mut cuts = vec![o]; cuts.extend(&commas); cuts.push(i);
                        let mut out = Vec::new();
                        for w in cuts.windows(2) { let alt: String = c[w[0] + 1..w[1]].iter().collect(); for e in braces(&format!("{pre}{alt}{post}"))? { out.push(e); if out.len() > 4096 { return Err("too many {…} alternatives (more than 4,096 patterns)".into()); } } }
                        return Ok(out);
                    }
                }
                _ => {}
            }
            i += 1;
        }
        if depth > 0 { return Err("unclosed alternate group; missing '}' (to match a real brace write \\{)".into()); }
        Ok(vec![p.to_string()])
    }
    pub fn compile(p: &str) -> Result<Vec<Tok>, String> {
        let c: Vec<char> = p.chars().collect(); let mut t = Vec::new(); let mut i = 0;
        while i < c.len() {
            match c[i] {
                '\\' => { let n = *c.get(i + 1).ok_or("dangling '\\' (a backslash at the end escapes nothing)")?; t.push(Tok::Lit(n)); i += 2; }
                '?' => { t.push(Tok::Any); i += 1; }
                '*' => {
                    let mut j = i; while j < c.len() && c[j] == '*' { j += 1; }
                    let (at_start, at_end) = (i == 0 || c[i - 1] == '/', j == c.len() || c[j] == '/');
                    if j - i >= 2 && at_start && at_end {
                        if i == 0 && j == c.len() { t.push(Tok::All); }                                   // "**"
                        else if j < c.len() { t.push(Tok::Dirs); j += 1; }                                 // "**/" → zero or more folders
                        else { if matches!(t.last(), Some(Tok::Lit('/'))) { t.pop(); } t.push(Tok::Rest); } // "/**" at the end → "/" + everything
                    } else { t.push(Tok::Star); }
                    i = j;
                }
                '[' => {
                    let mut j = i + 1; let neg = matches!(c.get(j), Some('!') | Some('^')); if neg { j += 1; }
                    let (mut items, first) = (Vec::new(), j);
                    loop {
                        let Some(&ch) = c.get(j) else { return Err("unclosed character class; missing ']'".into()) };
                        if ch == ']' && j > first { j += 1; break; }
                        let lo = if ch == '\\' { j += 1; *c.get(j).ok_or("unclosed character class; missing ']'")? } else { ch };
                        j += 1;
                        if c.get(j) == Some(&'-') && c.get(j + 1).map_or(false, |x| *x != ']') {
                            let mut hi = c[j + 1]; j += 2; if hi == '\\' { hi = *c.get(j).ok_or("unclosed character class; missing ']'")?; j += 1; }
                            if lo > hi { return Err(format!("invalid range; '{lo}' > '{hi}'")); }
                            items.push((lo, hi));
                        } else { items.push((lo, lo)); }
                    }
                    t.push(Tok::Class(neg, items)); i = j;
                }
                ch => { t.push(Tok::Lit(ch)); i += 1; }
            }
        }
        Ok(t)
    }
    fn fold(c: char) -> char { let mut l = c.to_lowercase(); match (l.next(), l.next()) { (Some(x), None) => x, _ => c } }
    fn eq(a: char, b: char, ci: bool) -> bool { a == b || (ci && fold(a) == fold(b)) }
    fn in_class(items: &[(char, char)], c: char, ci: bool) -> bool {
        let hit = |c: char| items.iter().any(|&(lo, hi)| lo <= c && c <= hi);
        hit(c) || (ci && (hit(fold(c)) || c.to_uppercase().next().map_or(false, hit) || items.iter().any(|&(lo, hi)| lo == hi && fold(lo) == fold(c))))
    }
    /// Does the whole path match? (table over token × position: no pattern can take exponential time)
    pub fn is_match(t: &[Tok], path: &[char], ci: bool) -> bool {
        let (n, m) = (t.len(), path.len());
        let mut ok = vec![false; (n + 1) * (m + 1)]; let at = |ti: usize, pi: usize| ti * (m + 1) + pi;
        ok[at(n, m)] = true;
        for ti in (0..n).rev() {
            // for Dirs: is there a "/" at or after pi such that the rest matches just after it?
            let mut dirs_after = false;
            for pi in (0..=m).rev() {
                let c = path.get(pi).copied();
                let v = match &t[ti] {
                    Tok::Lit(l) => c.map_or(false, |c| eq(*l, c, ci)) && ok[at(ti + 1, pi + 1)],
                    Tok::Any => c.map_or(false, |c| c != '/') && ok[at(ti + 1, pi + 1)],
                    Tok::Class(neg, items) => c.map_or(false, |c| c != '/' && in_class(items, c, ci) != *neg) && ok[at(ti + 1, pi + 1)],
                    Tok::Star => ok[at(ti + 1, pi)] || (c.map_or(false, |c| c != '/') && ok[at(ti, pi + 1)]),
                    Tok::All => true,
                    Tok::Rest => c == Some('/'),
                    Tok::Dirs => { if c == Some('/') && ok[at(ti + 1, pi + 1)] { dirs_after = true; } ok[at(ti + 1, pi)] || dirs_after }, // nothing, or anything up to a "/"
                };
                ok[at(ti, pi)] = v;
            }
        }
        ok[at(0, 0)]
    }
}
#[cfg(feature = "glob")]
pub fn glob(input: &[u8]) -> R {
    let a = arg(input)?;
    let ci = a.get("caseInsensitive").and_then(|v| v.as_bool()).unwrap_or(false);
    let dot = a.get("dot").and_then(|v| v.as_bool()).unwrap_or(true);
    let mut pats: Vec<(String, bool, Vec<Vec<globm::Tok>>)> = Vec::new(); let mut errors = Vec::new();
    for p in a.get("patterns").and_then(|v| v.as_array()).cloned().unwrap_or_default().iter() {
        let raw = p.as_str().unwrap_or("").trim(); if raw.is_empty() || raw.starts_with('#') { continue; }
        let (neg, body) = match raw.strip_prefix('!') { Some(b) => (true, b), None => (false, raw) };
        match globm::braces(body).and_then(|alts| alts.iter().map(|x| globm::compile(x)).collect::<Result<Vec<_>, _>>()) {
            Ok(g) => pats.push((raw.to_string(), neg, g)),
            Err(e) => errors.push(json!({ "pattern": raw, "error": e })),
        }
    }
    let has_pos = pats.iter().any(|p| !p.1);
    let rows: Vec<Value> = a.get("paths").and_then(|v| v.as_array()).cloned().unwrap_or_default().iter().filter_map(|p| p.as_str()).map(|x| x.trim()).filter(|x| !x.is_empty()).map(|path| {
        let hidden = !dot && path.split('/').any(|seg| seg.starts_with('.') && seg != "." && seg != "..");
        let chars: Vec<char> = path.chars().collect();
        // the last pattern that matches decides (like .gitignore); with only negative patterns everything else matches
        let mut m = !has_pos; let mut by = Value::Null;
        for (raw, neg, alts) in &pats { if alts.iter().any(|t| globm::is_match(t, &chars, ci)) { m = !*neg; by = Value::String(raw.clone()); } }
        if hidden { m = false; }
        json!({ "path": path, "match": m, "by": by })
    }).collect();
    js(json!({ "rows": rows, "errors": errors }))
}

// ------------------------------------------------------------------ patch: {original, patch, reverse}
/// Our own unified-diff reader and applier (was the diffy crate, which refused most patches as people have them: the
/// output of git show / format-patch, a diffstat, SVN "Index:" headers, a ```diff fence, CRLF files, removed lines that
/// start with "-- "). Like GNU patch: text outside hunks is ignored, a hunk's body is read by the line counts of its
/// @@ header, hunks are found at an offset when the file has moved, then ignoring trailing white space, then with up
/// to two lines of context dropped ("fuzz").
#[cfg(feature = "patch")]
mod patchm {
    #[derive(Clone, Debug)]
    pub struct Hunk { pub old_start: usize, pub old_count: usize, pub new_start: usize, pub new_count: usize, pub lines: Vec<(char, String)>, pub old_no_eol: bool, pub new_no_eol: bool, pub recounted: bool }
    pub struct FilePatch { pub name: String, pub hunks: Vec<Hunk> }
    fn header(l: &str) -> Option<(usize, usize, usize, usize)> {
        let r = l.strip_prefix("@@ -")?; let (old, r) = r.split_once(" +")?; let end = r.find(" @@")?; let new = &r[..end];
        let pair = |x: &str| -> Option<(usize, usize)> { match x.split_once(',') { Some((a, b)) => Some((a.parse().ok()?, b.parse().ok()?)), None => Some((x.parse().ok()?, 1)) } };
        let ((os, oc), (ns, nc)) = (pair(old)?, pair(new)?); Some((os, oc, ns, nc))
    }
    pub fn parse(text: &str) -> Vec<FilePatch> {
        let lines: Vec<&str> = text.lines().map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
        let mut files: Vec<FilePatch> = Vec::new(); let mut pending_name: Option<String> = None; let mut i = 0;
        while i < lines.len() {
            let l = lines[i];
            if l.starts_with("diff --git ") || l.starts_with("Index: ") { pending_name = Some(l.rsplit(' ').next().unwrap_or("").trim_start_matches("b/").to_string()); files.push(FilePatch { name: pending_name.clone().unwrap(), hunks: Vec::new() }); i += 1; continue; }
            if l.starts_with("--- ") && lines.get(i + 1).map_or(false, |n| n.starts_with("+++ ")) {
                let name = lines[i + 1][4..].split('\t').next().unwrap_or("").trim().trim_start_matches("b/").to_string();
                let name = if name == "/dev/null" { l[4..].split('\t').next().unwrap_or("").trim().trim_start_matches("a/").to_string() } else { name };
                // a new file section, unless this header belongs to the "diff --git" line just seen
                if files.last().map_or(true, |f| !f.hunks.is_empty()) || pending_name.is_none() { if files.last().map_or(true, |f| !f.hunks.is_empty()) { files.push(FilePatch { name: name.clone(), hunks: Vec::new() }); } }
                if let Some(f) = files.last_mut() { if f.hunks.is_empty() { f.name = name; } }
                pending_name = None; i += 2; continue;
            }
            if let Some((os, oc, ns, nc)) = header(l) {
                if files.is_empty() { files.push(FilePatch { name: String::new(), hunks: Vec::new() }); }
                let mut h = Hunk { old_start: os, old_count: oc, new_start: ns, new_count: nc, lines: Vec::new(), old_no_eol: false, new_no_eol: false, recounted: false };
                let (mut o, mut n) = (0usize, 0usize); i += 1;
                while i < lines.len() && (o < oc || n < nc) {
                    let b = lines[i];
                    match b.chars().next() {
                        Some(' ') => { h.lines.push((' ', b[1..].to_string())); o += 1; n += 1; }
                        None => { h.lines.push((' ', String::new())); o += 1; n += 1; }       // a blank context line whose leading space was trimmed
                        Some('-') => { h.lines.push(('-', b[1..].to_string())); o += 1; }
                        Some('+') => { h.lines.push(('+', b[1..].to_string())); n += 1; }
                        Some('\\') => { match h.lines.last().map(|x| x.0) { Some('-') => h.old_no_eol = true, Some('+') => h.new_no_eol = true, Some(_) => { h.old_no_eol = true; h.new_no_eol = true; } None => {} } }
                        _ => { h.recounted = true; break; }                                    // the header promised more lines than there are
                    }
                    i += 1;
                }
                if o < oc || n < nc { h.recounted = true; }
                // "\ No newline at end of file" after the last line; and a header whose counts were too small: take the rest of the body
                while i < lines.len() {
                    let b = lines[i];
                    if b.starts_with('\\') { match h.lines.last().map(|x| x.0) { Some('-') => h.old_no_eol = true, Some('+') => h.new_no_eol = true, Some(_) => { h.old_no_eol = true; h.new_no_eol = true; } None => {} } i += 1; continue; }
                    let more = (b.starts_with('+') && !b.starts_with("+++ ")) || (b.starts_with('-') && !b.starts_with("--- ") && b != "-- ") || (b.starts_with(' ') && lines.get(i + 1).map_or(false, |x| x.starts_with('+') || x.starts_with('-') || x.starts_with(' ')));
                    if more && header(b).is_none() && (o > oc || n > nc || h.recounted) { h.lines.push((b.chars().next().unwrap(), b[1..].to_string())); h.recounted = true; i += 1; } else { break; }
                }
                if let Some(f) = files.last_mut() { f.hunks.push(h); }
                continue;
            }
            i += 1;
        }
        files.retain(|f| !f.hunks.is_empty());
        files
    }
    pub struct Applied { pub lines: Vec<String>, pub final_eol: bool, pub offset: i64, pub fuzz: usize, pub ws: bool }
    fn trim_end(s: &str) -> &str { s.trim_end_matches([' ', '\t', '\r']) }
    /// Where does this hunk's old side sit in `file`? Tried at the expected line, then ever further away.
    fn locate(file: &[String], old: &[&str], want: usize, ws: bool) -> Option<usize> {
        let fits = |at: usize| at + old.len() <= file.len() && old.iter().enumerate().all(|(k, l)| if ws { trim_end(&file[at + k]) == trim_end(l) } else { file[at + k] == *l });
        if old.is_empty() { return Some(want.min(file.len())); }
        let max = file.len();
        for d in 0..=max { if want + d <= max && fits(want + d) { return Some(want + d); } if d > 0 && d <= want && fits(want - d) { return Some(want - d); } }
        None
    }
    pub fn apply(orig: &str, hunks: &[Hunk], reverse: bool) -> Result<Applied, usize> {
        let crlf = orig.contains("\r\n");
        let mut file: Vec<String> = orig.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l).to_string()).collect();
        let mut final_eol = orig.is_empty() || orig.ends_with('\n'); if final_eol { file.pop(); }
        let _ = crlf;
        let (mut delta, mut max_off, mut max_fuzz, mut used_ws) = (0i64, 0i64, 0usize, false);
        for (hi, h) in hunks.iter().enumerate() {
            let (del, add) = if reverse { ('+', '-') } else { ('-', '+') };
            let mut done = false;
            'fuzz: for fuzz in 0..=2usize {
                // drop up to `fuzz` context lines from each end
                let lead = h.lines.iter().take_while(|l| l.0 == ' ').count().min(fuzz); let trail = h.lines.iter().rev().take_while(|l| l.0 == ' ').count().min(fuzz);
                if fuzz > 0 && lead + trail == 0 { break; }
                let body = &h.lines[lead..h.lines.len() - trail];
                let old: Vec<&str> = body.iter().filter(|l| l.0 == ' ' || l.0 == del).map(|l| l.1.as_str()).collect();
                let new: Vec<String> = body.iter().filter(|l| l.0 == ' ' || l.0 == add).map(|l| l.1.clone()).collect();
                // "@@ -5,0 +6 @@" (nothing removed): the start is the line AFTER which to insert, not the first line of the range
                let (start, count) = if reverse { (h.new_start, h.new_count) } else { (h.old_start, h.old_count) };
                let base = if count == 0 { start as i64 } else { (start as i64 - 1).max(0) };
                let want = (base + delta + lead as i64).max(0) as usize;
                for ws in [false, true] {
                    if let Some(at) = locate(&file, &old, want, ws) {
                        // context lines keep the file's own text (its white space), only real changes are written
                        let mut repl = Vec::with_capacity(new.len()); let mut k = at;
                        for l in body { match l.0 { ' ' => { repl.push(file[k].clone()); k += 1; } c if c == del => { k += 1; } _ => repl.push(l.1.clone()) } }
                        let touches_end = at + old.len() == file.len();
                        file.splice(at..at + old.len(), repl);
                        delta += new.len() as i64 - old.len() as i64;
                        max_off = if (at as i64 - want as i64).abs() > max_off.abs() { at as i64 - want as i64 } else { max_off }; max_fuzz = max_fuzz.max(fuzz); used_ws |= ws;
                        let (old_ne, new_ne) = if reverse { (h.new_no_eol, h.old_no_eol) } else { (h.old_no_eol, h.new_no_eol) };
                        if touches_end && old_ne != new_ne { final_eol = !new_ne; }
                        done = true; break 'fuzz;
                    }
                }
            }
            if !done { return Err(hi + 1); }
        }
        Ok(Applied { lines: file, final_eol, offset: max_off, fuzz: max_fuzz, ws: used_ws })
    }
}
#[cfg(feature = "patch")]
pub fn patch(input: &[u8]) -> R {
    let a = arg(input)?;
    let orig = s(&a, "original"); let p = s(&a, "patch");
    let reverse = a.get("reverse").and_then(|v| v.as_bool()).unwrap_or(false);
    let files = patchm::parse(p);
    if files.is_empty() { return Err("No hunks found — paste a unified diff (it has lines like “@@ -1,3 +1,4 @@” followed by lines starting with a space, - or +)".into()); }
    // a diff of several files: use the first whose hunks fit this text
    let mut failed: Option<(usize, usize)> = None;
    for (fi, f) in files.iter().enumerate() {
        match patchm::apply(orig, &f.hunks, reverse) {
            Ok(r) => {
                let eol = if orig.contains("\r\n") { "\r\n" } else { "\n" };
                let mut out = r.lines.join(eol); if r.final_eol && !r.lines.is_empty() { out.push_str(eol); }
                let (mut add, mut del) = (0, 0); for h in &f.hunks { for l in &h.lines { match l.0 { '+' => add += 1, '-' => del += 1, _ => {} } } }
                if reverse { std::mem::swap(&mut add, &mut del); }
                let mut notes: Vec<String> = Vec::new();
                if r.offset != 0 { notes.push(format!("found {} line{} {} than the patch says", r.offset.abs(), if r.offset.abs() == 1 { "" } else { "s" }, if r.offset > 0 { "lower" } else { "higher" })); }
                if r.ws { notes.push("matched ignoring spaces at the ends of lines".into()); }
                if r.fuzz > 0 { notes.push(format!("applied with fuzz {} (some context lines did not match and were ignored)", r.fuzz)); }
                if f.hunks.iter().any(|h| h.recounted) { notes.push("the line counts in a @@ header were wrong; the lines were counted again".into()); }
                if files.len() > 1 { notes.push(format!("the diff covers {} files; used the part for {}", files.len(), if f.name.is_empty() { format!("file {}", fi + 1) } else { f.name.clone() })); }
                return js(json!({ "result": out, "hunks": f.hunks.len(), "added": add, "removed": del, "files": files.len(), "file": f.name, "notes": notes }));
            }
            Err(h) => { if failed.is_none() { failed = Some((fi, h)); } }
        }
    }
    let (fi, h) = failed.unwrap_or((0, 1));
    // does it fit the other way round? Then it is already applied (or, with Reverse ticked, was never applied).
    if files.iter().any(|f| patchm::apply(orig, &f.hunks, !reverse).is_ok()) {
        return Err(if reverse { "The patch does not apply in reverse: this text looks like the ORIGINAL (the patch has not been applied to it). Untick “Reverse” to apply it.".into() } else { "This patch looks already applied: the text contains the patch’s new lines. Tick “Reverse” to undo it.".into() });
    }
    let f = &files[fi]; let hk = &f.hunks[h - 1];
    let first = hk.lines.iter().find(|l| l.0 != if reverse { '-' } else { '+' }).map(|l| l.1.clone()).unwrap_or_default();
    Err(format!("The patch does not apply: hunk {h} of {} (@@ -{} …) does not match this text{} — its first line “{}” was not found with its neighbours.", f.hunks.len(), hk.old_start, if files.len() > 1 { format!(" (tried all {} files of the diff)", files.len()) } else { String::new() }, first.chars().take(60).collect::<String>()))
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
    let max = u32::from_le_bytes(input[4..8].try_into().unwrap());
    let (ci, max) = (max & 0x8000_0000 != 0, (max & 0x7fff_ffff) as usize); // top bit: ignore the case of ASCII letters
    let n = u32::from_le_bytes(input[8..12].try_into().unwrap()) as usize;
    if n == 0 || input.len() < 12 + n { return Err("empty search".into()); }
    let (needle, hay) = (&input[12..12 + n], &input[12 + n..]);
    let same = |a: u8, b: u8| a == b || (ci && a.eq_ignore_ascii_case(&b));
    let mut hits = Vec::new(); let mut i = from;
    while i + n <= hay.len() && hits.len() < max {
        match hay[i..].iter().position(|&b| same(b, needle[0])) { None => break, Some(k) => { i += k; if i + n <= hay.len() && hay[i..i + n].iter().zip(needle).all(|(a, b)| same(*a, *b)) { hits.push(i); } i += 1; } }
    }
    js(json!({ "hits": hits, "more": hits.len() == max }))
}

// ------------------------------------------------------------------ JSON diff (RFC 6902 patch) and patch apply
#[cfg(feature = "jsondiff")]
fn parse_json(label: &str, t: &str) -> Result<Value, String> {
    serde_json::from_str(t).map_err(|e| format!("{label}: {} (line {}, column {})", e.to_string().split(" at line").next().unwrap_or(""), e.line(), e.column()))
}
#[cfg(feature = "jsondiff")]
pub fn jsonpatch(input: &[u8]) -> R {
    let a = arg(input)?;
    let mut doc = parse_json("Document", s(&a, "doc"))?;
    let p: json_patch::Patch = serde_json::from_value(parse_json("Patch", s(&a, "patch"))?).map_err(|e| format!("Not an RFC 6902 patch: {e}"))?;
    json_patch::patch(&mut doc, &p).map_err(|e| format!("The patch does not apply: {e}"))?;
    js(json!({ "result": doc }))
}
