// The link checker shared by "Scam & QR Check" (potentials #83) and "Clean Link" (#101).
//   links:analyse {url}  → one link: the site it really is (the Public Suffix List), the brand it is — or imitates (UTS #39's
//                          skeletons, one letter away, its name inside another site), what else to know (a short link, a
//                          service anyone can make a site on, an IP address, a port, http, an app to install …), and the link
//                          cleaned (ClearURLs' rules: tracking parts taken off, redirect wrappers unwrapped; Amazon and
//                          Flipkart product links cut to the product's own address).
//   links:scan {text}    → a message: its links, e-mail addresses, UPI IDs and phone numbers, the wording scams use, and a
//                          verdict. Spans are in UTF-16 code units (the page's string indices).
//   links:clean {url}    → the cleaning alone, step by step.
//   links:skeleton {texts}, links:site {hosts}, links:info → for the tests and the tab's foot.
// Nothing is fetched: a short link cannot be followed here (the tab says so).
use crate::links_data::*;
use crate::{arg, js, s, R};
use serde_json::{json, Map, Value};
use std::cell::OnceCell;
use unicode_script::{Script, UnicodeScript};
use unicode_security::{GeneralSecurityProfile, MixedScript, RestrictionLevel, RestrictionLevelDetection};
use url::{Host, Url};

include!("upi_handles.in");

pub const CLEARURLS_COMMIT: &str = "7c30a16c37c13526bd43eead3135459e79975585";
pub const CLEARURLS_SHA256: &str = "6778b151d3cc9f9e08a05b333f7268df835d0419d40ce7e6c3ad166ac507165d";
static CLEARURLS_JSON: &str = include_str!("../data/links/clearurls.json");

// ———————————————————————————————————— ClearURLs ————————————————————————————————————

struct Provider {
    name: String,
    pattern: Option<regex_lite::Regex>,
    complete: bool,
    src: Value,
    compiled: OnceCell<Compiled>,
}
struct Compiled {
    rules: Vec<(String, regex_lite::Regex)>,
    raw: Vec<(String, regex_lite::Regex)>,
    exceptions: Vec<regex_lite::Regex>,
    redirections: Vec<regex_lite::Regex>,
}

thread_local! {
    static PROVIDERS: OnceCell<(Vec<Provider>, Vec<String>)> = const { OnceCell::new() };
}

/// A rule of ClearURLs as JavaScript reads it (`new RegExp(p, "i")`): the patterns are written for JavaScript, and
/// regex-lite reads the same syntax for everything they use (no look-arounds, no back-references — checked by the suite).
fn re(p: &str, bad: &mut Vec<String>) -> Option<regex_lite::Regex> {
    match regex_lite::Regex::new(&format!("(?i){p}")) {
        Ok(r) => Some(r),
        Err(e) => {
            bad.push(format!("{p}: {e}"));
            None
        }
    }
}
fn list(v: &Value, k: &str) -> Vec<String> {
    v.get(k).and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

fn with_providers<T>(f: impl FnOnce(&[Provider], &[String]) -> T) -> T {
    PROVIDERS.with(|c| {
        let (p, bad) = c.get_or_init(|| {
            let data: Value = serde_json::from_str(CLEARURLS_JSON).expect("clearurls.json");
            let mut bad = Vec::new();
            let mut out = Vec::new();
            if let Some(m) = data.get("providers").and_then(|x| x.as_object()) {
                for (name, v) in m {
                    let pattern = v.get("urlPattern").and_then(|x| x.as_str()).and_then(|p| re(p, &mut bad));
                    let complete = v.get("completeProvider").and_then(|x| x.as_bool()).unwrap_or(false);
                    out.push(Provider { name: name.clone(), pattern, complete, src: v.clone(), compiled: OnceCell::new() });
                }
            }
            (out, bad)
        });
        f(p, bad)
    })
}

impl Provider {
    fn c(&self) -> &Compiled {
        self.compiled.get_or_init(|| {
            let mut bad = Vec::new();
            // the rules and, as ClearURLs does by default ("allow referral marketing" off), the referral-marketing ones
            let mut rules = Vec::new();
            for r in list(&self.src, "rules").into_iter().chain(list(&self.src, "referralMarketing")) {
                if let Some(x) = re(&format!("^{r}$"), &mut bad) {
                    rules.push((r, x));
                }
            }
            let raw = list(&self.src, "rawRules").into_iter().filter_map(|r| re(&r, &mut bad).map(|x| (r, x))).collect();
            let exceptions = list(&self.src, "exceptions").iter().filter_map(|r| re(r, &mut bad)).collect();
            let redirections = list(&self.src, "redirections").iter().filter_map(|r| re(r, &mut bad)).collect();
            Compiled { rules, raw, exceptions, redirections }
        })
    }
    fn matches(&self, url: &str) -> bool {
        match &self.pattern {
            Some(p) if p.is_match(url) => !self.c().exceptions.iter().any(|e| e.is_match(url)),
            _ => false,
        }
    }
}

/// decodeURIComponent, again and again until nothing changes (ClearURLs' decodeURL); a malformed escape ends it.
fn decode_uri_once(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let h = |c: u8| (c as char).to_digit(16);
            match (b.get(i + 1).and_then(|&c| h(c)), b.get(i + 2).and_then(|&c| h(c))) {
                (Some(x), Some(y)) => {
                    out.push((x * 16 + y) as u8);
                    i += 3;
                }
                _ => return None,
            }
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}
fn decode_uri(s: &str) -> String {
    let mut a = s.to_string();
    for _ in 0..8 {
        match decode_uri_once(&a) {
            Some(n) if n != a => a = n,
            _ => break,
        }
    }
    a
}

/// x-www-form-urlencoded decoding of one name or value (URLSearchParams: + is a space, bad bytes become U+FFFD)
fn form_decode(s: &str) -> String {
    url::form_urlencoded::parse(format!("k={s}").as_bytes()).next().map(|(_, v)| v.into_owned()).unwrap_or_default()
}

/// One part of a query or a fragment, kept as it was written.
#[derive(Clone)]
struct Part {
    key: String,
    value: String,
}
fn query_parts(q: &str) -> Vec<Part> {
    q.split('&').filter(|p| !p.is_empty()).map(|p| {
        let (k, v) = p.split_once('=').unwrap_or((p, ""));
        Part { key: form_decode(k), value: form_decode(v) }
    }).collect()
}
/// ClearURLs' checkLocalURL: localhost, or a host that begins with a digit and is in a private range
fn check_local(u: &Url) -> bool {
    let host = u.host_str().unwrap_or("");
    if host == "localhost" {
        return true;
    }
    if !host.starts_with(|c: char| c.is_ascii_digit()) {
        return false;
    }
    let Ok(ip) = host.parse::<std::net::Ipv4Addr>() else { return false };
    let v = u32::from(ip);
    let within = |base: [u8; 4], bits: u32| {
        let b = u32::from(std::net::Ipv4Addr::from(base));
        let m = u32::MAX << (32 - bits);
        (v & m) == (b & m)
    };
    within([10, 0, 0, 0], 8) || within([172, 16, 0, 0], 12) || within([192, 168, 0, 0], 16) || within([100, 64, 0, 0], 10)
        || within([169, 254, 0, 0], 16) || ip == std::net::Ipv4Addr::new(127, 0, 0, 1)
}

thread_local! {
    static LEGACY: OnceCell<[regex_lite::Regex; 5]> = const { OnceCell::new() };
}

/// ClearURLs' decodeLegacyRedirect: decodeURIComponent until nothing changes; then an http(s) link with a host, or a bare
/// host made one — never another scheme. None: the next redirection rule is tried.
fn decode_legacy(capture: &str) -> Option<String> {
    LEGACY.with(|c| {
        let [incomplete, ff, http, network, known] = c.get_or_init(|| [
            regex_lite::Regex::new(r"(?i)^https?(?:-[^/?#\\]*)?$").unwrap(),
            regex_lite::Regex::new(r"(?i)^(https?://[^%/?#\\]+)%3F([a-z\d_.~-]+%FF)%26([a-z\d_.~-]+)%3D([a-z\d_.~-]+)$").unwrap(),
            regex_lite::Regex::new(r"(?i)^https?://").unwrap(),
            regex_lite::Regex::new(r"(?i)^[a-z][a-z\d+.-]*:[/\\]{2}").unwrap(),
            regex_lite::Regex::new(r"(?i)^(?:https?|about|blob|data|file|ftp|geo|javascript|mailto|sms|tel|urn|ws|wss):").unwrap(),
        ]);
        let with_host = |v: &str| Url::parse(v).ok().map(|u| u.host_str().map(|h| !h.is_empty()).unwrap_or(false)).unwrap_or(false);
        let validate = |v: &str| -> Option<String> {
            if http.is_match(v) {
                return with_host(v).then(|| v.to_string());
            }
            if network.is_match(v) || known.is_match(v) {
                return None;
            }
            let net_path = v.starts_with("//");
            if !net_path && (v.starts_with('/') || v.starts_with('\\')) {
                return None;
            }
            let t = if net_path { format!("http:{v}") } else { format!("http://{v}") };
            with_host(&t).then_some(t)
        };
        let valid = |v: &str| !v.is_empty() && !v.chars().any(|c| (c as u32) < 0x20 || (0x7f..=0x9f).contains(&(c as u32)));
        let mut v = capture.to_string();
        while valid(&v) && !incomplete.is_match(&v) {
            match decode_uri_once(&v) {
                None => {
                    let repaired = ff.replace(&v, "${1}?${2}&${3}=${4}").into_owned();
                    return if repaired != v { validate(&repaired) } else { None };
                }
                Some(d) if d == v => return validate(&v),
                Some(d) => v = d,
            }
        }
        None
    })
}

enum Outcome {
    Unchanged,
    Changed(String),
    Redirect(String),
    Cancel,
}

type Removal = (String, String, String, String); // (place: query | fragment | path, name, value, rule)

/// ClearURLs' removeFieldsFormURL (1.28.0): a redirect wrapper's target; a complete provider; the raw rules on the whole
/// link; then each rule against the query's names (decoded, as URLSearchParams gives them — the parts kept as written)
/// and the fragment's parts (as written, and decoded).
fn remove_fields(p: &Provider, pure: &str, rm: &mut Vec<Removal>) -> Outcome {
    let Ok(u0) = Url::parse(pure) else { return Outcome::Unchanged };
    if check_local(&u0) {
        return Outcome::Unchanged;
    }
    let c = p.c();
    for r in &c.redirections {
        if let Some(t) = r.captures(pure).and_then(|m| m.get(1)).map(|x| x.as_str()).filter(|t| !t.is_empty()) {
            if let Some(target) = decode_legacy(t) {
                return Outcome::Redirect(target);
            }
        }
    }
    if p.complete {
        return Outcome::Cancel;
    }
    let mut url = pure.to_string();
    let mut changes = false;
    for (rule, r) in &c.raw {
        let gone: Vec<String> = r.find_iter(&url).map(|m| m.as_str().to_string()).filter(|m| !m.is_empty()).collect();
        let after = r.replace_all(&url, "").into_owned();
        if after != url {
            changes = true;
            rm.push(("path".into(), String::new(), gone.join(" "), rule.clone()));
            url = after;
        }
    }
    let Ok(u) = Url::parse(&url) else { return if changes { Outcome::Changed(url) } else { Outcome::Unchanged } };
    let query = u.query().unwrap_or("").to_string();
    let mut fields = query.clone();
    let mut has_query = !fields.is_empty() || u.query() == Some("");
    let keep_empty_hash = u.fragment() == Some("");
    let raw_fields: Vec<&str> = query.split('&').collect();
    let names: Vec<(String, String)> = url::form_urlencoded::parse(query.as_bytes()).map(|(k, v)| (k.into_owned(), v.into_owned())).collect();
    let mut remaining: Vec<String> = Vec::new();
    for (k, _) in &names {
        if !remaining.contains(k) {
            remaining.push(k.clone());
        }
    }
    let hash = u.fragment().unwrap_or("");
    let mut frags: Vec<Option<(String, Option<String>)>> = if hash.is_empty() { Vec::new() } else {
        hash.split('&').map(|x| if x.is_empty() { None } else {
            Some(match x.find('=') { Some(i) => (x[..i].to_string(), Some(x[i + 1..].to_string())), None => (x.to_string(), None) })
        }).collect()
    };
    let domain = {
        let mut x = u.clone();
        x.set_query(None);
        x.set_fragment(None);
        x.as_str().to_string()
    };
    if !names.is_empty() || !frags.is_empty() {
        for (rule, re) in &c.rules {
            let before = remaining.len();
            let mut gone = Vec::new();
            remaining.retain(|n| if re.is_match(n) { gone.push(n.clone()); false } else { true });
            for g in gone {
                changes = true;
                let v = names.iter().find(|(k, _)| *k == g).map(|x| x.1.clone()).unwrap_or_default();
                rm.push(("query".into(), g, v, rule.clone()));
            }
            if remaining.len() != before {
                let mut idx = 0;
                let kept: Vec<&str> = raw_fields.iter().copied().filter(|f| {
                    if f.is_empty() { return true; }
                    let k = names.get(idx).map(|x| x.0.as_str()).unwrap_or("");
                    idx += 1;
                    remaining.iter().any(|r| r == k)
                }).collect();
                fields = kept.join("&");
                has_query = !kept.is_empty();
            }
            frags.retain(|e| {
                let Some((k, v)) = e else { return true };
                let del = if re.is_match(k) {
                    true
                } else if v.is_none() || k.starts_with('?') {
                    false
                } else {
                    match decode_uri_once(k) {
                        None => false,
                        Some(d) => {
                            let nested = d.as_bytes().windows(3).any(|w| w[0] == b'%' && w[1].is_ascii_hexdigit() && w[2].is_ascii_hexdigit());
                            !nested && (re.is_match(&d) || d.strip_prefix('?').map(|x| re.is_match(&format!("%3F{x}"))).unwrap_or(false))
                        }
                    }
                };
                if del {
                    changes = true;
                    rm.push(("fragment".into(), k.clone(), v.clone().unwrap_or_default(), rule.clone()));
                }
                !del
            });
        }
        let fstr = frags.iter().map(|e| match e {
            None => String::new(),
            Some((k, Some(v))) => format!("{k}={v}"),
            Some((k, None)) => k.clone(),
        }).collect::<Vec<_>>().join("&");
        let mut out = domain;
        if has_query {
            out.push('?');
            out.push_str(&fields);
        }
        if !frags.is_empty() || keep_empty_hash {
            out.push('#');
            out.push_str(&fstr);
        }
        url = out;
    }
    if changes { Outcome::Changed(url) } else { Outcome::Unchanged }
}

struct Step {
    kind: &'static str, // "redirect" | "removed"
    provider: String,
    removed: Vec<Removal>,
    url: String,
}

/// ClearURLs' pureCleaning — what its "copy clean link" gives: every provider that matches, in the order of the rules
/// file, one after another on the link as it stands (a redirect wrapper ends the pass with its target), again until the
/// link stays the same. Also: whether a provider that blocks whole addresses matched (ClearURLs blocks such a page).
fn clearurls(start: &str) -> (String, Vec<Step>, Option<String>) {
    with_providers(|providers, _| {
        let mut after = start.to_string();
        let mut steps: Vec<Step> = Vec::new();
        let mut blocked: Option<String> = None;
        for _ in 0..32 {
            let before = after.clone();
            let mut clean = before.clone();
            for p in providers {
                if !p.matches(&clean) {
                    continue;
                }
                let mut rm = Vec::new();
                match remove_fields(p, &clean, &mut rm) {
                    Outcome::Redirect(t) => {
                        steps.push(Step { kind: "redirect", provider: p.name.clone(), removed: Vec::new(), url: t.clone() });
                        clean = t;
                        break;
                    }
                    Outcome::Cancel => if blocked.is_none() { blocked = Some(p.name.clone()) },
                    Outcome::Changed(x) => {
                        steps.push(Step { kind: "removed", provider: p.name.clone(), removed: rm, url: x.clone() });
                        clean = x;
                    }
                    Outcome::Unchanged => {}
                }
            }
            after = clean;
            if after == before {
                break;
            }
        }
        (after, steps, blocked)
    })
}

/// Amazon's and Flipkart's product links cut to the product's own address (ours, beside ClearURLs): an Amazon product is
/// its ASIN (amazon.in/dp/B0CHX1W1XY); a Flipkart product its page and the variant chosen (pid, which ClearURLs takes off).
fn product(u: &Url, before: &Url) -> Option<(String, &'static str)> {
    let host = u.host_str()?.to_ascii_lowercase();
    let site = psl::domain_str(&host).unwrap_or("").to_string();
    let path = u.path();
    if site.starts_with("amazon.") {
        let segs: Vec<&str> = path.split('/').filter(|x| !x.is_empty()).collect();
        let is_asin = |x: &str| x.len() == 10 && x.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit());
        for (i, seg) in segs.iter().enumerate() {
            let next = segs.get(i + 1).copied().unwrap_or("");
            let hit = match *seg {
                "dp" | "product" | "d" | "ASIN" | "asin" => is_asin(next),
                _ => false,
            };
            if hit {
                return Some((format!("https://{host}/dp/{next}"), "Amazon"));
            }
        }
        return None;
    }
    if site == "flipkart.com" {
        let segs: Vec<&str> = path.split('/').collect();
        if let Some(i) = segs.iter().position(|x| *x == "p") {
            let item = segs.get(i + 1).copied().unwrap_or("");
            if item.starts_with("itm") && item.len() > 3 && item[3..].bytes().all(|b| b.is_ascii_alphanumeric()) {
                let mut out = format!("https://{host}{}", segs[..i + 2].join("/"));
                let pid = before.query_pairs().find(|(k, _)| k == "pid").map(|(_, v)| v.into_owned());
                if let Some(pid) = pid.filter(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_alphanumeric())) {
                    out.push_str("?pid=");
                    out.push_str(&pid);
                }
                return Some((out, "Flipkart"));
            }
        }
    }
    None
}

fn param_what(key: &str) -> Option<&'static str> {
    let k = key.to_ascii_lowercase();
    if let Some(x) = PARAMS.iter().find(|(p, _)| p.to_ascii_lowercase() == k) {
        return Some(x.1);
    }
    if k.starts_with("utm_") || k.starts_with("mtm_") || k.starts_with("pk_") {
        return Some("a campaign tag (which advert or e-mail the click came from)");
    }
    if k.starts_with("pd_rd_") || k.starts_with("pf_rd_") {
        return Some("Amazon's record of the page and spot you clicked from");
    }
    None
}

fn provider_words(p: &str) -> String {
    if p == "globalRules" { "for every site".into() } else { format!("for {p}") }
}

/// The cleaning of one link: ClearURLs, then our product rule; every part taken off, with what it is.
fn clean_url(input: &Url) -> Value {
    let (url, steps, blocked_by) = clearurls(input.as_str());
    let blocked = blocked_by.is_some();
    let last_target = steps.iter().rev().find(|s| s.kind == "redirect").map(|s| s.url.clone());
    let before = last_target.as_deref().and_then(|t| Url::parse(t).ok()).unwrap_or_else(|| input.clone());
    let mut removed: Vec<Value> = Vec::new();
    let mut via: Vec<Value> = Vec::new();
    for st in &steps {
        match st.kind {
            "redirect" => via.push(json!({"provider": st.provider, "to": st.url})),
            "removed" => {
                for (place, k, v, rule) in &st.removed {
                    if place == "path" {
                        removed.push(json!({"place": "path", "key": "", "value": v, "what": "a tracking piece of the address's path", "rule": rule, "by": provider_words(&st.provider)}));
                    } else {
                        removed.push(json!({"place": place, "key": k, "value": v, "what": param_what(k), "rule": rule, "by": provider_words(&st.provider)}));
                    }
                }
            }
            _ => {}
        }
    }
    let mut out = url.clone();
    let mut product_of: Option<&str> = None;
    if !blocked {
        if let Ok(u) = Url::parse(&url) {
            if let Some((p, who)) = product(&u, &before) {
                if p != out {
                    // everything of the address before ClearURLs' cleaning that the product address leaves out
                    let kept: Vec<String> = Url::parse(&p).map(|x| x.query_pairs().map(|(k, _)| k.into_owned()).collect()).unwrap_or_default();
                    for part in query_parts(u.query().unwrap_or("")) {
                        if !kept.contains(&part.key) {
                            removed.push(json!({"place": "query", "key": part.key, "value": part.value, "what": param_what(&part.key), "rule": "", "by": "the product's own address"}));
                        }
                    }
                    let pp = Url::parse(&p).map(|x| x.path().to_string()).unwrap_or_default();
                    if u.path() != pp {
                        let tail = pp.rsplit('/').next().unwrap_or("");
                        let gone = u.path().split(tail).next().unwrap_or(u.path()).trim_end_matches("dp/").trim_end_matches("/p/").trim_matches('/');
                        let gone = if gone.is_empty() { u.path().to_string() } else { gone.to_string() };
                        removed.push(json!({"place": "path", "key": "", "value": gone, "what": "the product's name in the address — the shop finds the product by its code", "rule": "", "by": "the product's own address"}));
                    }
                    removed.retain(|x| !(x.get("place").and_then(|v| v.as_str()) == Some("query") && x.get("key").and_then(|v| v.as_str()).map(|k| kept.iter().any(|q| q == k)).unwrap_or(false)));
                    if u.fragment().is_some() {
                        removed.push(json!({"place": "fragment", "key": u.fragment().unwrap_or(""), "value": "", "what": null, "rule": "", "by": "the product's own address"}));
                    }
                    out = p;
                }
                product_of = Some(who);
            }
        }
    }
    let changed = out != input.as_str();
    json!({
        "url": out,
        "changed": changed,
        "blocked": blocked,
        "blockedBy": blocked_by,
        "via": via,
        "removed": removed,
        "product": product_of,
    })
}

// ———————————————————————————————————— the site, the brand ————————————————————————————————————

/// The look-alike key of a name (UTS #39): its skeleton, in lower case, so that 0 and O, 1, I and l, rn and m … match.
pub fn key(s: &str) -> String {
    let low = s.to_lowercase();
    let sk: String = unicode_security::skeleton(&low).collect();
    sk.to_lowercase()
}

fn damerau1(a: &str, b: &str) -> bool {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a == b || a.len().abs_diff(b.len()) > 1 {
        return false;
    }
    let (n, m) = (a.len(), b.len());
    let mut d = vec![vec![0usize; m + 1]; n + 1];
    for i in 0..=n { d[i][0] = i; }
    for j in 0..=m { d[0][j] = j; }
    for i in 1..=n {
        for j in 1..=m {
            let c = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            d[i][j] = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + c);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[n][m] == 1
}

struct Site {
    host: String,      // ASCII (punycode), lower case
    unicode: String,   // as a person reads it
    site: String,      // the registrable domain (ASCII), or the host itself
    suffix: String,    // its public suffix (ASCII)
    known: bool,       // the suffix is in the list
    private: bool,     // the suffix is a service's (the list's private section)
    icann_site: String,
}

fn site_of(host: &str) -> Site {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    let unicode = idna::domain_to_unicode(&host).0;
    let sfx = psl::suffix(host.as_bytes());
    let suffix = sfx.map(|x| String::from_utf8_lossy(x.trim().as_bytes()).into_owned()).unwrap_or_default();
    let known = sfx.map(|x| x.is_known()).unwrap_or(false);
    let private = sfx.and_then(|x| x.typ()) == Some(psl::Type::Private);
    let site = psl::domain_str(&host).map(String::from).unwrap_or_else(|| host.clone());
    // for a service's suffix (github.io), the ICANN one below it names who runs the service
    let mut icann_site = site.clone();
    if private {
        let parts: Vec<&str> = suffix.split('.').collect();
        for i in 1..parts.len() {
            let rest = parts[i..].join(".");
            if let Some(x) = psl::suffix(rest.as_bytes()) {
                if x.typ() == Some(psl::Type::Icann) && x.trim().as_bytes() == rest.as_bytes() {
                    icann_site = format!("{}.{}", parts[i - 1], rest);
                    break;
                }
            }
        }
    }
    Site { host, unicode, site, suffix, known, private, icann_site }
}

fn label_of(site: &str, suffix: &str) -> String {
    site.strip_suffix(suffix).map(|x| x.trim_end_matches('.').to_string()).unwrap_or_else(|| site.to_string())
}

/// The brand whose own address this is — the most specific of its domains that the host is, or is under
fn own_brand(host: &str) -> Option<(&'static Brand, &'static str)> {
    let mut best: Option<(&'static Brand, &'static str)> = None;
    for b in BRANDS {
        for d in b.domains {
            if host == *d || host.ends_with(&format!(".{d}")) {
                if best.map(|(_, x)| d.len() > x.len()).unwrap_or(true) {
                    best = Some((b, d));
                }
            }
        }
    }
    best
}

fn tokens(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut digit = false;
    for c in s.chars() {
        let d = c.is_ascii_digit();
        if !c.is_alphanumeric() || (!cur.is_empty() && d != digit) {
            if !cur.is_empty() { out.push(std::mem::take(&mut cur)); }
            if !c.is_alphanumeric() { continue; }
        }
        digit = d;
        cur.push(c);
    }
    if !cur.is_empty() { out.push(cur); }
    out
}

/// Whether `rest` is made of filler words only (kyc, login, update, …)
fn fillers(rest: &str) -> bool {
    if rest.is_empty() { return true; }
    (1..=rest.len()).rev().any(|i| rest.is_char_boundary(i) && FILLERS.contains(&&rest[..i]) && fillers(&rest[i..]))
}

/// A brand's name inside a label: a whole token, a long name anywhere, or a name with filler words around it
fn names_brand(label: &str) -> Option<(&'static Brand, &'static str)> {
    let low = label.to_lowercase();
    let toks = tokens(&low);
    for b in BRANDS {
        for w in b.words {
            if toks.iter().any(|t| t == w) || (w.len() >= 7 && low.contains(w)) {
                return Some((b, w));
            }
            for t in &toks {
                if let Some(rest) = t.strip_prefix(w) { if fillers(rest) { return Some((b, w)); } }
                if let Some(rest) = t.strip_suffix(w) { if fillers(rest) { return Some((b, w)); } }
            }
        }
    }
    None
}

/// Where two names differ, in words: "‘rn’ where paytm has ‘m’", with the alphabet of letters outside A – Z
fn differ(theirs: &str, ours: &str) -> String {
    let a: Vec<char> = theirs.chars().collect();
    let b: Vec<char> = ours.chars().collect();
    let mut p = 0;
    while p < a.len() && p < b.len() && a[p] == b[p] { p += 1; }
    let mut q = 0;
    while q < a.len() - p && q < b.len() - p && a[a.len() - 1 - q] == b[b.len() - 1 - q] { q += 1; }
    let x: String = a[p..a.len() - q].iter().collect();
    let y: String = b[p..b.len() - q].iter().collect();
    let script = |s: &str| -> String {
        let mut names: Vec<&str> = s.chars().filter(|c| !c.is_ascii() && c.script() != Script::Latin).map(|c| c.script().full_name()).collect();
        names.dedup();
        if names.is_empty() { String::new() } else { format!(" ({} letters)", names.join(", ")) }
    };
    let what = |s: &str| -> String {
        if s.chars().all(|c| c.is_ascii_digit()) && !s.is_empty() { format!("the digit{} ‘{s}’", if s.len() > 1 { "s" } else { "" }) } else { format!("‘{s}’") }
    };
    if x.is_empty() || y.is_empty() {
        return String::new();
    }
    format!("{}{} where {} has ‘{}’", what(&x), script(&x), ours, y)
}

/// Every brand's addresses that name a site (with a dot), the sites themselves first: a look-alike of google.com is Google's
/// before it is Google Pay's pay.google.com.
fn brand_sites() -> Vec<(&'static Brand, &'static str)> {
    let mut out: Vec<(&'static Brand, &'static str, bool)> = Vec::new();
    for b in BRANDS {
        for d in b.domains.iter().filter(|d| d.contains('.')) {
            let own = psl::domain_str(d) == Some(*d);
            out.push((b, d, own));
        }
    }
    out.sort_by_key(|x| !x.2);
    out.into_iter().map(|(b, d, _)| (b, d)).collect()
}

fn sign(level: &str, id: &str, text: String) -> Value {
    json!({"level": level, "id": id, "text": text})
}

fn rank(level: &str) -> u8 {
    match level { "danger" => 3, "warn" => 2, "good" => 1, _ => 0 }
}

fn calling(digits: &str) -> Option<(&'static str, &'static str)> {
    (1..=3).rev().filter(|&n| digits.len() > n).find_map(|n| CALLING.iter().find(|(c, _)| *c == &digits[..n]).map(|(c, n)| (*c, *n)))
}

/// One link, all there is to say about it
fn analyse_url(raw: &str, depth: u32) -> Value {
    let (prepared, notes) = prepare(raw);
    let mut signs: Vec<Value> = notes;
    let Ok(u) = Url::parse(&prepared) else {
        return json!({"input": raw, "url": prepared, "kind": "bad", "verdict": "none",
            "signs": [sign("info", "bad", "This is not a web address that can be opened.".into())]});
    };
    let scheme = u.scheme().to_string();
    match scheme.as_str() {
        "javascript" | "data" | "vbscript" => {
            signs.push(sign("danger", "script", format!("A {scheme}: link runs code or shows a page made up inside the link itself — no web site is behind it. Never open one from a message.")));
            return json!({"input": raw, "url": u.as_str(), "kind": "script", "verdict": "danger", "signs": signs});
        }
        "upi" | "tez" | "phonepe" | "paytmmp" | "gpay" | "bhim" => return upi_link(raw, &u, signs),
        "tel" | "sms" | "smsto" => {
            let n = u.path().to_string();
            signs.push(sign("info", "tel", format!("Calls or texts the number {n}.")));
            return json!({"input": raw, "url": u.as_str(), "kind": "tel", "verdict": "none", "signs": signs, "number": n});
        }
        "mailto" => {
            signs.push(sign("info", "mailto", format!("Writes an e-mail to {}.", decode_uri(u.path()))));
            return json!({"input": raw, "url": u.as_str(), "kind": "mailto", "verdict": "none", "signs": signs});
        }
        "intent" => return intent_link(raw, &u, signs, depth),
        "http" | "https" => {}
        _ => {
            signs.push(sign("info", "scheme", format!("A {scheme}: link — it opens an app, not a web page.")));
            return json!({"input": raw, "url": u.as_str(), "kind": "other", "verdict": "none", "signs": signs});
        }
    }
    let mut out = Map::new();
    out.insert("input".into(), json!(raw));
    out.insert("url".into(), json!(u.as_str()));
    out.insert("kind".into(), json!("web"));
    out.insert("scheme".into(), json!(scheme));
    let host = match u.host() {
        Some(Host::Domain(d)) => d.to_string(),
        Some(Host::Ipv4(ip)) => {
            let local = ip.is_private() || ip.is_loopback() || ip.is_link_local();
            signs.push(if local {
                sign("info", "ip-local", format!("Goes to {ip}, a computer on your own network (a router, a printer)."))
            } else {
                sign("warn", "ip", format!("Goes to a bare number, {ip}, instead of a site's name. Banks, shops and government offices always use a name."))
            });
            ip.to_string()
        }
        Some(Host::Ipv6(ip)) => {
            signs.push(sign("warn", "ip", format!("Goes to a bare number, [{ip}], instead of a site's name. Banks, shops and government offices always use a name.")));
            ip.to_string()
        }
        None => {
            signs.push(sign("info", "bad", "This link names no site.".into()));
            return json!({"input": raw, "url": u.as_str(), "kind": "bad", "verdict": "none", "signs": signs});
        }
    };
    let is_name = matches!(u.host(), Some(Host::Domain(_)));
    if !u.username().is_empty() || u.password().is_some() {
        let fake = decode_uri(u.username());
        signs.push(sign("danger", "userinfo", format!("Starts with “{fake}@”: everything before the @ is ignored — the link goes to {host}. A trick to make a link look like another site's.")));
    }
    if scheme == "http" {
        signs.push(sign("warn", "http", "Not secure (http, not https): what is typed into the page can be read on the way.".into()));
    }
    if let Some(port) = u.port() {
        signs.push(sign("warn", "port", format!("Uses a special port (:{port}) — sites people visit do not.")));
    }
    let path_low = u.path().to_ascii_lowercase();
    for ext in [".apk", ".xapk", ".apks", ".exe", ".msi", ".scr", ".bat", ".cmd", ".vbs", ".jar", ".ipa"] {
        if path_low.ends_with(ext) {
            signs.push(sign("danger", "app", format!("Downloads an app to install ({ext}). Apps from a link — not the Play Store or the App Store — can read your SMS and OTPs; banks and government offices never send them.")));
            break;
        }
    }
    let mut brand_json = Value::Null;
    let mut imitates = Value::Null;
    let mut open_place: Option<&str> = None;
    let mut weak = !is_name || scheme == "http";
    if is_name {
        let st = site_of(&host);
        out.insert("host".into(), json!(st.host));
        out.insert("hostUnicode".into(), json!(st.unicode));
        out.insert("site".into(), json!(st.site));
        out.insert("siteUnicode".into(), json!(idna::domain_to_unicode(&st.site).0));
        out.insert("suffix".into(), json!(st.suffix));
        let sub = st.host.strip_suffix(&st.site).map(|x| x.trim_end_matches('.').to_string()).unwrap_or_default();
        out.insert("sub".into(), json!(sub));
        if !st.known {
            signs.push(sign("warn", "tld", format!("Ends in .{}, which is not a real ending — the link cannot open, or the text is not a link.", st.suffix)));
        }
        // letters outside A – Z
        if st.host.split('.').any(|l| l.starts_with("xn--")) {
            signs.push(sign("info", "idn", format!("Written with letters outside A – Z: {} (as the address travels: {}).", st.unicode, st.host)));
        }
        for label in st.unicode.split('.') {
            if label.is_ascii() { continue; }
            let level = label.detect_restriction_level();
            let mut scripts: Vec<Script> = Vec::new();
            for c in label.chars() {
                let sc = c.script();
                if !matches!(sc, Script::Common | Script::Inherited | Script::Unknown) && !scripts.contains(&sc) { scripts.push(sc); }
            }
            let names: Vec<&str> = scripts.iter().map(|x| x.full_name()).collect();
            // characters no name is written with (UTS #39's identifier profile): a phonetic ɑ or ɡ, a click letter ǀ, a small capital ᴘ
            let mut odd: Vec<char> = label.chars().filter(|c| !c.is_ascii() && !c.identifier_allowed()).collect();
            odd.dedup();
            if !odd.is_empty() {
                let list: Vec<String> = odd.iter().map(|c| format!("‘{c}’")).collect();
                signs.push(sign("danger", "odd", format!("“{label}” is written with {} — {} no name is written with, used to make it look like another name; Chrome shows such names as xn--… to warn you.",
                    list.join(", "), if odd.len() > 1 { "characters" } else { "a character" })));
                continue;
            }
            if level > RestrictionLevel::HighlyRestrictive || !label.is_single_script() {
                signs.push(sign("danger", "mixed", format!("“{label}” mixes letters of different alphabets ({}) — a trick to imitate another name; Chrome shows such names as xn--… to warn you.", names.join(" and "))));
            } else if !names.contains(&"Latin") {
                signs.push(sign("info", "script", format!("“{label}” is written in {} letters.", names.join(", "))));
            }
        }
        // whose site
        let own = own_brand(&st.host).filter(|(_, d)| !(st.private && (st.suffix == *d || st.suffix.ends_with(&format!(".{d}")))));
        let open = own.and_then(|_| OPEN_PLACES.iter().find(|(h, path, _)| (st.host == *h || st.host.ends_with(&format!(".{h}"))) && u.path().starts_with(path)).map(|x| x.2));
        let weak_site = st.private || RISKY_TLDS.contains(&st.suffix.as_str());
        open_place = open;
        let trusted = TRUSTED_ENDINGS.iter().find(|(e, _)| st.suffix == *e || st.suffix.ends_with(&format!(".{e}")) || st.host.ends_with(&format!(".{e}")));
        if let Some((b, d)) = own {
            brand_json = json!({"name": b.name, "short": b.short, "domain": d, "open": open});
            if let Some(what) = open {
                let form = what == "a form";
                signs.push(sign("info", "open", format!("This is {}'s own address ({d}) — but anyone can make {what} there: it says nothing about who made it.{}",
                    b.name, if form { " Never type a password, an OTP or your card's details into a form someone sent you." } else { "" })));
            } else {
                signs.push(sign("good", "own", format!("This is {}'s own address ({d}).", b.name)));
            }
        } else if let Some((_, what)) = trusted {
            signs.push(sign("good", "trusted", format!("This is {what}.")));
        } else {
            let label_u = label_of(&idna::domain_to_unicode(&st.site).0, &idna::domain_to_unicode(&st.suffix).0);
            let lk = key(&label_u);
            let lk_flat: String = lk.chars().filter(|c| *c != '-').collect();
            // 1. looks like a brand's name with letters swapped for look-alikes (UTS #39)
            for (b, d) in brand_sites() {
                let sd = site_of(d);
                let bl = label_of(&sd.site, &sd.suffix);
                if bl.len() < 3 { continue; }
                let bk = key(&bl);
                if (lk == bk || lk_flat == bk) && label_u != bl {
                    let how = differ(&label_u, &bl);
                    signs.push(sign("danger", "lookalike", format!("Imitates {d}, {}'s address: “{}” is written with look-alike letters{}. The site is {}, not {d}.",
                        b.name, label_u, if how.is_empty() { String::new() } else { format!(" — {how}") }, idna::domain_to_unicode(&st.site).0)));
                    imitates = json!({"name": b.name, "short": b.short, "domain": d, "how": "letters"});
                    break;
                }
            }
            // 2. the brand's whole address in front of another site (hdfcbank.com.verify-kyc.top)
            if imitates.is_null() {
                let h = &st.host;
                'outer: for b in BRANDS {
                    for d in b.domains.iter().filter(|d| d.contains('.')) {
                        let inside = h.starts_with(&format!("{d}.")) || h.starts_with(&format!("{d}-")) || h.contains(&format!(".{d}.")) || h.contains(&format!(".{d}-"));
                        if inside && h != d && !h.ends_with(&format!(".{d}")) {
                            signs.push(sign("danger", "front", format!("Starts with {d}, {}'s address — but the site is {}. Whatever comes before a site's name is chosen by whoever owns the site.", b.name, st.site)));
                            imitates = json!({"name": b.name, "short": b.short, "domain": d, "how": "front"});
                            break 'outer;
                        }
                    }
                }
            }
            // 3. one letter away from a brand's name (hdfcbnak, flipcart)
            if imitates.is_null() && lk.chars().count() >= 6 {
                for (b, d) in brand_sites() {
                    let sd = site_of(d);
                    let bl = label_of(&sd.site, &sd.suffix);
                    if bl.chars().count() < 6 { continue; }
                    if damerau1(&lk, &key(&bl)) {
                        signs.push(sign(if weak_site { "danger" } else { "warn" }, "typo", format!("One letter away from {d}, {}'s address: the site is {}.", b.name, idna::domain_to_unicode(&st.site).0)));
                        imitates = json!({"name": b.name, "short": b.short, "domain": d, "how": "typo"});
                        break;
                    }
                }
            }
            // 4. a brand's name inside the site's name or in front of it
            if imitates.is_null() {
                let named = names_brand(&label_u).map(|x| (x, false)).or_else(|| sub.split('.').find_map(names_brand).map(|x| (x, true)));
                if let Some(((b, _w), in_front)) = named {
                    let main = b.domains.iter().find(|d| d.contains('.')).copied().unwrap_or("");
                    let words: Vec<String> = tokens(&st.unicode.to_lowercase());
                    let scammy = words.iter().find(|w| SCAM_WORDS.contains(&w.as_str()));
                    signs.push(sign(if weak_site || scammy.is_some() { "danger" } else { "warn" }, "names", if in_front {
                        format!("Puts {}'s name in front of the site {}: that part is chosen by whoever owns the site. {}'s address is {main}.", b.short, st.site, b.short)
                    } else {
                        format!("Has {}'s name in it, but it is not one of {}'s addresses ({main}): the site is {}.", b.short, b.name, idna::domain_to_unicode(&st.site).0)
                    }));
                    imitates = json!({"name": b.name, "short": b.short, "domain": main, "how": "name"});
                }
            }
        }
        // a site on a service anyone can make sites on
        if st.private && own.is_none() {
            let svc = SERVICES.iter().find(|(d, _)| st.suffix == *d || st.suffix.ends_with(&format!(".{d}"))).map(|x| x.1);
            let maker = st.icann_site.clone();
            signs.push(sign(if imitates.is_null() { "info" } else { "warn" }, "service", match svc {
                Some(name) => format!("Made on {} — {name} — where anyone can make a site: its name says nothing about who made it.", st.suffix),
                None => format!("Made on {}, a service whose customers make their own sites under it ({maker}'s): its name says nothing about who made it.", st.suffix),
            }));
            out.insert("service".into(), json!({"suffix": st.suffix, "name": svc, "operator": maker}));
        }
        // a short link
        if let Some((d, who)) = SHORTENERS.iter().find(|(d, _)| (st.host == *d || st.site == *d) && own.is_some() && OWN_SHORT.contains(d)) {
            signs.push(sign("info", "short-own", format!("A short link of {who}'s own ({d}): it leads to one of {who}'s pages — which one shows when it is opened.")));
            out.insert("short".into(), json!(d));
        } else if let Some((d, who)) = SHORTENERS.iter().find(|(d, _)| st.host == *d || st.site == *d) {
            signs.push(sign("warn", "short", format!("A short link ({d}, {who}): it hides where it leads until it is opened. This page sends nothing to the internet, so it cannot look — open short links only from people you trust.")));
            out.insert("short".into(), json!(d));
        }
        weak |= (st.private && own.is_none()) || !st.known || RISKY_TLDS.contains(&st.suffix.as_str());
        if !st.private && RISKY_TLDS.contains(&st.suffix.as_str()) && own.is_none() {
            signs.push(sign("info", "risky-tld", format!("Ends in .{}, an ending that scam sites use often — on its own it proves nothing.", st.suffix)));
        }
        // WhatsApp and Telegram chats
        if st.site == "wa.me" || (st.site == "whatsapp.com" && u.path().starts_with("/send")) {
            let num: String = if st.site == "wa.me" { u.path().trim_matches('/').to_string() } else { u.query_pairs().find(|(k, _)| k == "phone").map(|(_, v)| v.into_owned()).unwrap_or_default() };
            let digits: String = num.chars().filter(|c| c.is_ascii_digit()).collect();
            if !digits.is_empty() {
                let c = calling(&digits).map(|(_, n)| format!(" — {n}")).unwrap_or_default();
                signs.push(sign("info", "whatsapp", format!("Opens a WhatsApp chat with +{digits}{c}.")));
            }
        }
    }
    // a brand's name in the path of a site that is weak already (a bare number, a site anyone could make, a risky ending)
    if imitates.is_null() && (brand_json.is_null() || open_place.is_some()) && (weak || open_place.is_some()) {
        if let Some((b, _)) = u.path().split(['/', '.', '_']).find_map(names_brand) {
            let main = b.domains.iter().find(|d| d.contains('.')).copied().unwrap_or("");
            signs.push(sign("warn", "names-path", match open_place {
                Some(what) => format!("Names {} in its address, but it is {what} someone made on {host} — {}'s address is {main}.", b.short, b.short),
                None => format!("Names {} in its path, but the site is {} — {}'s address is {main}.", b.short, out.get("site").and_then(|x| x.as_str()).unwrap_or(&host), b.short),
            }));
            imitates = json!({"name": b.name, "short": b.short, "domain": main, "how": "path"});
        }
    }
    out.insert("brand".into(), brand_json);
    out.insert("imitates".into(), imitates);
    let clean = clean_url(&u);
    // a wrapper of another link: what the target is
    if depth < 3 {
        if let Some(to) = clean.get("via").and_then(|v| v.as_array()).and_then(|a| a.last()).and_then(|x| x.get("to")).and_then(|x| x.as_str()) {
            let t = analyse_url(to, depth + 1);
            let site = t.get("site").and_then(|x| x.as_str()).unwrap_or(to).to_string();
            signs.push(sign("info", "via", format!("Passes through {} and leads to {site}.", out.get("site").and_then(|x| x.as_str()).unwrap_or(&host))));
            out.insert("leadsTo".into(), t);
        }
    }
    if clean.get("blocked").and_then(|x| x.as_bool()) == Some(true) {
        signs.push(sign("info", "tracker", "An advertising or tracking address — ClearURLs blocks it outright.".into()));
    }
    out.insert("clean".into(), clean);
    let mut verdict = signs.iter().map(|x| x.get("level").and_then(|l| l.as_str()).unwrap_or("info")).max_by_key(|l| rank(l)).unwrap_or("none").to_string();
    if let Some(t) = out.get("leadsTo") {
        let tv = t.get("verdict").and_then(|x| x.as_str()).unwrap_or("none");
        if rank(tv) > rank(&verdict) || (verdict == "good" && tv != "good") { verdict = tv.to_string(); }
    }
    if verdict == "info" { verdict = "none".into(); }
    out.insert("verdict".into(), json!(verdict));
    out.insert("signs".into(), Value::Array(signs));
    Value::Object(out)
}

/// An Android intent: link — the app it opens, and the address it falls back to (analysed as where the link leads).
fn intent_link(raw: &str, u: &Url, mut signs: Vec<Value>, depth: u32) -> Value {
    let frag = u.fragment().unwrap_or("");
    let field = |k: &str| frag.split(';').find_map(|x| x.strip_prefix(k)).map(decode_uri).filter(|x| !x.is_empty());
    let app = field("package=");
    signs.push(sign("warn", "intent", match &app {
        Some(p) => format!("Opens the Android app {p} (an intent: link) — what it does depends on that app."),
        None => "Opens an app on an Android phone (an intent: link) — what it does depends on that app.".into(),
    }));
    let mut out = json!({"input": raw, "url": u.as_str(), "kind": "intent", "app": app, "signs": Value::Null, "verdict": "warn"});
    if let Some(f) = field("S.browser_fallback_url=") {
        if depth < 3 {
            let t = analyse_url(&f, depth + 1);
            let site = t.get("site").and_then(|x| x.as_str()).unwrap_or(&f).to_string();
            signs.push(sign("info", "via", format!("Without the app it opens {site}.")));
            let tv = t.get("verdict").and_then(|x| x.as_str()).unwrap_or("none");
            if rank(tv) > rank("warn") { out["verdict"] = json!(tv); }
            out["leadsTo"] = t;
        }
    }
    out["signs"] = Value::Array(signs);
    out
}

/// What a person pasted, made a link: spaces and brackets round it trimmed, a defanged link (hxxp, [.]) put back, https://
/// added to a bare name.
fn prepare(raw: &str) -> (String, Vec<Value>) {
    let mut t = raw.trim().trim_matches(|c: char| matches!(c, '<' | '>' | '"' | '\'' | '“' | '”' | '‘' | '’' | '(' | ')' | '[' | ']')).to_string();
    let mut notes = Vec::new();
    let low = t.to_ascii_lowercase();
    if low.starts_with("hxxp") || t.contains("[.]") || t.contains("(.)") || t.contains("[dot]") || t.contains("[:]") {
        t = t.replacen("hxxp", "http", 1).replacen("HXXP", "HTTP", 1).replace("[.]", ".").replace("(.)", ".").replace("[dot]", ".").replace("[:]", ":");
        notes.push(sign("info", "defanged", "Written so that it cannot be clicked (hxxp, [.]) — read as the link it stands for.".into()));
    }
    let has_scheme = t.split_once(':').map(|(a, b)| !a.is_empty() && a.chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c)) && (b.starts_with("//") || !a.contains('.'))).unwrap_or(false);
    let looks_like_host = t.split(['/', '?', '#']).next().map(|h| h.contains('.') && !h.contains(' ')).unwrap_or(false);
    if !has_scheme && looks_like_host {
        t = format!("https://{t}");
    }
    (t, notes)
}

// ———————————————————————————————————— UPI ————————————————————————————————————

fn handle_of(id: &str) -> Option<&'static str> {
    let h = id.rsplit_once('@').map(|x| x.1.to_ascii_lowercase())?;
    UPI_HANDLES.iter().find(|(a, _)| *a == h).map(|x| x.1)
}

fn upi_link(raw: &str, u: &Url, mut signs: Vec<Value>) -> Value {
    let what = u.host_str().map(|h| h.to_ascii_lowercase()).unwrap_or_else(|| u.path().trim_matches('/').to_ascii_lowercase());
    let q: Vec<(String, String)> = u.query_pairs().map(|(k, v)| (k.to_ascii_lowercase(), v.trim().to_string())).collect();
    let get = |k: &str| q.iter().find(|(a, _)| a == k).map(|x| x.1.clone()).unwrap_or_default();
    let (pa, pn, am, tn, cu, mc) = (get("pa"), get("pn"), get("am"), get("tn"), get("cu"), get("mc"));
    let money = if am.is_empty() { "money".to_string() } else { format!("{}{am}", if cu.is_empty() || cu.eq_ignore_ascii_case("INR") { "₹" } else { "" }) };
    let to = if pn.is_empty() { pa.clone() } else { format!("{pn} ({pa})") };
    if what == "mandate" || q.iter().any(|(k, _)| k == "mn" || k == "recur") {
        signs.push(sign("danger", "upi-mandate", format!("Sets up a mandate (AutoPay) for {to}: once approved, {money} can be taken from your account again and again.")));
    } else {
        signs.push(sign("warn", "upi-pay", format!("Asks YOU to pay {money} to {to}. Approving it with your UPI PIN sends money out of your account — you never need a PIN, or to scan a code, to receive money.")));
    }
    if !am.is_empty() {
        signs.push(sign("info", "upi-amount", format!("The amount is filled in: {money}.")));
    }
    let local = pa.split('@').next().unwrap_or("");
    let digits = local.chars().filter(|c| c.is_ascii_digit()).count();
    if let Some(h) = handle_of(&pa) {
        signs.push(sign("info", "upi-handle", format!("The UPI ID ends in @{} — {h}.", pa.rsplit_once('@').map(|x| x.1).unwrap_or(""))));
    } else if pa.contains('@') {
        signs.push(sign("info", "upi-handle", format!("The UPI ID ends in @{}, a handle this tab does not know.", pa.rsplit_once('@').map(|x| x.1).unwrap_or(""))));
    }
    if digits >= 10 && local.len() <= 13 {
        signs.push(sign("info", "upi-phone", "The UPI ID is a phone number: a person's own account.".into()));
    }
    let note = format!("{pn} {tn}").to_lowercase();
    let bait = ["refund", "cashback", "cash back", "prize", "reward", "lottery", "kyc", "receive", "credit", "winner", "bonus", "gift", "claim", "unblock", "verify", "verification"];
    if let Some(w) = bait.iter().find(|w| note.contains(*w)) {
        signs.push(sign("danger", "upi-bait", format!("Its name or note speaks of “{w}” — but this code takes money from you; it can never pay you.")));
    }
    if let Some(((b, _), _)) = names_brand(&pn.replace(' ', "-")).map(|x| (x, ())) {
        let own_handle = handle_of(&pa).map(|h| h.to_lowercase().contains(&b.short.to_lowercase())).unwrap_or(false);
        if !own_handle {
            signs.push(sign("danger", "upi-name", format!("The name says {}, but anyone can type any name into a UPI code: the money goes to {pa}.", b.short)));
        }
    }
    if let Some((b, _)) = names_brand(local) {
        if !signs.iter().any(|x| x.get("id").and_then(|i| i.as_str()) == Some("upi-name")) {
            signs.push(sign("warn", "upi-brand", format!("The UPI ID {pa} uses {}'s name, but anyone can make an ID with any name: it is no proof that the money goes to {}.", b.short, b.short)));
        }
    }
    if mc.len() == 4 && mc != "0000" {
        signs.push(sign("info", "upi-merchant", format!("A merchant's code (category {mc}).")));
    }
    let verdict = signs.iter().map(|x| x.get("level").and_then(|l| l.as_str()).unwrap_or("info")).max_by_key(|l| rank(l)).unwrap_or("none").to_string();
    json!({"input": raw, "url": u.as_str(), "kind": "upi", "verdict": if verdict == "info" { "none".to_string() } else { verdict }, "signs": signs,
        "upi": {"pa": pa, "pn": pn, "am": am, "cu": cu, "tn": tn, "mc": mc, "what": what, "handle": handle_of(&get("pa"))}})
}

// ———————————————————————————————————— a message ————————————————————————————————————

struct Rule {
    id: &'static str,
    level: &'static str,
    pattern: &'static str,
    negatable: bool,
    text: &'static str,
}
const fn r(id: &'static str, level: &'static str, pattern: &'static str, negatable: bool, text: &'static str) -> Rule {
    Rule { id, level, pattern, negatable, text }
}

/// The wording scam messages use (Indian English; RBI's, NPCI's, CERT-In's and the police's warnings name these tricks).
static RULES: &[Rule] = &[
    r("otp", "danger", r"\b(?:share|send|tell|forward|give|provide|read out|disclose|confirm)\b[^.!?\n]{0,40}?\b(?:otp|one[- ]?time[- ]?password|upi pin|atm pin|m-?pin|pin|cvv|cvc|password|passcode|verification code|security code)s?\b", true,
      "It asks for a secret code (an OTP, PIN, CVV or password). No bank, shop or government office ever asks for one — whoever does is after your money."),
    r("otp", "danger", r"\b(?:otp|one[- ]?time[- ]?password|upi pin|atm pin|m-?pin|cvv|password)\b[^.!?\n]{0,30}?\b(?:share|send|tell|forward|give|provide|read out)\b", true,
      "It asks for a secret code (an OTP, PIN, CVV or password). No bank, shop or government office ever asks for one — whoever does is after your money."),
    r("receive", "danger", r"\b(?:scan|enter|use|put|type)\b[^.!?\n]{0,50}?\b(?:qr|pin|upi pin)\b[^.!?\n]{0,50}?\b(?:receiv|get|credit|claim|refund|cash ?back|reward|prize|accept)\w*", false,
      "It asks you to scan a code or enter your UPI PIN to receive money. A PIN only ever sends money out: you never need it, or a QR code, to receive."),
    r("receive", "danger", r"\b(?:receive|get|claim)\b[^.!?\n]{0,40}?\b(?:money|payment|amount|refund|cash ?back|reward|prize)\b[^.!?\n]{0,50}?\b(?:scan|pin|qr)\b", false,
      "It asks you to scan a code or enter your UPI PIN to receive money. A PIN only ever sends money out: you never need it, or a QR code, to receive."),
    r("collect", "warn", r"\b(?:accept|approve|confirm|authori[sz]e)\b[^.!?\n]{0,40}?\b(?:request|collect request|payment request|mandate|autopay)\b", true,
      "It asks you to approve a payment request. Approving a UPI request pays the other side — money you receive needs nothing from you."),
    r("remote", "danger", r"\b(?:any ?desk|team ?viewer|quick ?support|rust ?desk|airdroid|ultra ?viewer|supremo|screen[- ]?shar(?:e|ing))\b", false,
      "It names a screen-sharing app (AnyDesk, TeamViewer …). With it a stranger sees your screen — your OTPs and passwords too — and can work your phone."),
    r("app", "danger", r"\.apk\b|\bapk (?:file|download)\b", false,
      "It offers an app file (.apk) to install. Apps from a link, not the Play Store, can read your SMS and OTPs; banks and government offices never send them."),
    r("app", "warn", r"\b(?:download|install)\b[^.!?\n]{0,30}?\b(?:app|application)\b", false,
      "It asks you to install an app. Get apps only from the Play Store or the App Store, and only the ones you went looking for."),
    r("kyc", "warn", r"\b(?:e-?kyc|re-?kyc|kyc)\b[^.!?\n]{0,40}?\b(?:updat\w*|expir\w*|pending|suspend\w*|block\w*|verif\w*|complete|incomplete|link\w*|submit\w*|due|fail\w*)", false,
      "It asks you to update your KYC, PAN or Aadhaar. Banks never ask for that in a message — use the bank's own app, or go to a branch."),
    r("kyc", "warn", r"\b(?:updat\w*|complete|verify|submit|link)\b[^.!?\n]{0,30}?\b(?:e-?kyc|re-?kyc|kyc|pan card|pan|aadhaa?r)\b", false,
      "It asks you to update your KYC, PAN or Aadhaar. Banks never ask for that in a message — use the bank's own app, or go to a branch."),
    r("kyc", "warn", r"\b(?:pan|pan card|aadhaa?r(?: card)?)\b[^.!?\n]{0,30}?\b(?:not linked|unlinked|link\w*|block\w*|expir\w*|suspend\w*|inactive|deactivat\w*|misus\w*)", false,
      "It asks you to update your KYC, PAN or Aadhaar. Banks never ask for that in a message — use the bank's own app, or go to a branch."),
    r("threat", "warn", r"\b(?:account|a/c|acct|card|debit card|credit card|sim|number|mobile number|connection|service|wallet|upi id|net ?banking|pan|aadhaa?r|gas connection)\b[^.!?\n]{0,40}?\b(?:block\w*|suspend\w*|deactivat\w*|disconnect\w*|clos(?:e|ed|ing)|frozen|freez\w*|cut off|terminat\w*|barred|discontinu\w*|cancel\w*|disabled?)\b", false,
      "It threatens to block or cut off something of yours. Scams do that to make you act before you think."),
    r("power", "warn", r"\b(?:electricity|power|light|bijli)\b[^.!?\n]{0,30}?\b(?:connection|supply|bill)\b[^.!?\n]{0,60}?\b(?:disconnect\w*|cut|unpaid|pending|not (?:been )?updated|tonight|today)\b", false,
      "It says your electricity will be cut off. Electricity boards do not message you to call an officer or pay through a link — check your bill on the board's own site or app."),
    r("power", "warn", r"\byour\b[^.!?\n]{0,25}?\b(?:electricity|power|light|bijli)\b[^!?\n]{0,40}?\b(?:disconnect\w*|cut off|discontinu\w*)", false,
      "It says your electricity will be cut off. Electricity boards do not message you to call an officer or pay through a link — check your bill on the board's own site or app."),
    r("urgent", "warn", r"\b(?:within|in)\s+(?:\d{1,2}|one|two|three|twenty[- ]four)\s*(?:hours?|hrs?|minutes?|mins?)\b|\b(?:immediately|urgent(?:ly)?|asap|right now|tonight|last (?:date|day|chance|warning|reminder)|final (?:notice|warning|reminder)|expires? today|today itself|before midnight)\b", false,
      "It hurries you. A real notice gives you time to check."),
    r("prize", "warn", r"\b(?:you(?:'ve| have)? won|you are (?:the )?(?:lucky )?winner|lottery|lucky draw|jackpot|prizes?|reward points?|redeem|gift (?:card|voucher|hamper)s?|free (?:gift|recharge|data|iphone|laptop|scooty)|claim (?:now|your|it))\b|\bcongratulations\b[^.!?\n]{0,40}?\b(?:won|winner|selected|prize|reward|lucky|gift|lottery)\b", false,
      "It offers a prize or a reward. Nobody gives money away by message; a prize that needs a fee, your card or your PIN is a scam."),
    r("refund", "info", r"\b(?:refund\w*|cash ?back)\b", false,
      "It speaks of a refund or cashback. Scams offer them to make you scan a code, enter your PIN or call a number to 'receive' them — a real refund needs nothing from you."),
    r("fee", "warn", r"\b(?:registration|processing|security|joining|verification|activation|refundable|advance|clearance|release) (?:fee|fees|charges?|deposit|amount)\b", false,
      "It asks for a fee or a deposit first. A real job, loan, prize or parcel never makes you pay to receive it."),
    r("job", "warn", r"\b(?:part[- ]?time (?:job|work|income)|work from home|home[- ]based (?:job|work)|earn (?:rs\.?|inr|₹)?\s?\d[\d,]*|(?:daily|per day|per hour) (?:income|earning|salary|payment|pay)|like (?:and|&) subscribe|online task|simple task|prepaid task|task[- ]based)\b|\b(?:like|rate|review|follow)\b[^.!?\n]{0,25}?\b(?:videos?|youtube|hotels?|products?|pages?)\b", false,
      "It offers easy money for small tasks. Such 'jobs' end with you paying 'deposits' to get your earnings back."),
    r("invest", "warn", r"\b(?:guaranteed (?:returns?|profit|income)|double (?:your )?money|risk[- ]free (?:returns?|profit|trading|investment)|\d{1,3}\s?% (?:daily|weekly|monthly|per day|per month) (?:returns?|profit)|crypto\w*|bitcoin|usdt|forex|trading (?:group|tips|platform|app)|stock (?:market )?tips|ipo allotment|vip (?:group|trading))\b", false,
      "It promises high or sure returns. That is the mark of an investment scam."),
    r("authority", "warn", r"\b(?:police|cbi|crime branch|cyber ?(?:crime|cell|police)|narcotics|ncb|customs (?:department|officer|duty)|enforcement directorate|money laundering|arrest(?:ed)?|warrant|court (?:notice|case|summons)|legal action|trai|department of telecommunications|income tax (?:notice|raid))\b", false,
      "It speaks for the police, a court or a regulator. They never settle a case over a call or a message, and never ask for money to do it."),
    r("arrest", "danger", r"\bdigital(?:ly)? arrest\w*\b", false,
      "It speaks of a 'digital arrest'. There is no such thing: no police or agency in India arrests anyone over a call or a video call."),
    r("parcel", "warn", r"\b(?:parcel|package|shipment|courier|consignment)\b[^.!?\n]{0,60}?\b(?:held|on hold|returned|undeliver\w*|failed|pending|seized|detained|stuck|incomplete|incorrect|invalid)\b|\bcustoms (?:duty|fee|charges?|clearance)\b|\bre-?delivery\b", false,
      "It says a parcel is held. Courier scams ask for a small fee, or your card's details, to 'release' it."),
    r("loan", "warn", r"\b(?:pre-?approved|instant|guaranteed) (?:personal )?loans?\b|\bloans? (?:approved|sanctioned)\b", false,
      "It offers a loan you did not ask for. Loan scams take a 'processing fee', or copy your contacts and photos to threaten you."),
    r("call", "warn", r"\b(?:call|contact|whatsapp|message|sms|ring|dial)\b(?: us| our| the| on| at)?[^.!?\n]{0,30}?(?:\+\d|\b[6-9]\d{4}\s?\d{5}\b|\b0\d{2,4}[\s-]?\d{6,8}\b)", false,
      "It asks you to call or message a number in the message. Call a company on the number on its own site, your card or your bill instead."),
    r("generic", "info", r"\bdear (?:customer|user|sir|madam|member|valued customer|account holder|subscriber)\b|\bclick (?:here|on the link|the link|below|on link)\b|\b(?:verify|confirm|update) your (?:account|details|identity|information|card)\b|\bunusual (?:activity|login|sign-?in|transaction)\b", false,
      "Words that scam messages use often — on their own they prove nothing."),
];

const NEGATIONS: &[&str] = &["do not", "don't", "dont", "don’t", "never", "not to", "no one", "nobody", "not share", "avoid", "beware", "nor"];

thread_local! {
    static COMPILED_RULES: OnceCell<Vec<regex_lite::Regex>> = const { OnceCell::new() };
}

fn u16_at(text: &str, byte: usize) -> usize {
    text[..byte].chars().map(|c| c.len_utf16()).sum()
}

fn negated(text: &str, start: usize, end: usize) -> bool {
    let from = text[..start].char_indices().rev().take(40).last().map(|x| x.0).unwrap_or(0);
    let before = &text[from..end];
    let sentence = before.rsplit(['.', '!', '?', '\n']).next().unwrap_or(before).to_lowercase();
    NEGATIONS.iter().any(|n| sentence.contains(n))
}

pub fn scan(input: &[u8]) -> R {
    let v = arg(input)?;
    let text = s(&v, "text");
    let mut items: Vec<Value> = Vec::new();
    let mut taken: Vec<(usize, usize)> = Vec::new();
    let mut links: Vec<Value> = Vec::new();
    // links and e-mail addresses
    let mut finder = linkify::LinkFinder::new();
    finder.url_must_have_scheme(false);
    for l in finder.links(text) {
        let (a, b) = (l.start(), l.end());
        let t = l.as_str();
        match l.kind() {
            linkify::LinkKind::Email => {
                items.push(json!({"kind": "email", "text": t, "start": u16_at(text, a), "end": u16_at(text, b)}));
                taken.push((a, b));
            }
            _ => {
                // a bare name counts only with a real ending (Rs.500, a.m. and file.txt are no links)
                let (p, _) = prepare(t);
                let ok = Url::parse(&p).ok().map(|u| match u.host() {
                    Some(Host::Domain(d)) => psl::suffix(d.as_bytes()).map(|x| x.is_known()).unwrap_or(false) && d.contains('.'),
                    Some(_) => true,
                    None => !matches!(u.scheme(), "http" | "https"),
                }).unwrap_or(false);
                if !ok { continue; }
                let a16 = u16_at(text, a);
                let an = analyse_url(t, 0);
                items.push(json!({"kind": "link", "text": t, "start": a16, "end": u16_at(text, b), "link": links.len()}));
                links.push(an);
                taken.push((a, b));
            }
        }
    }
    // upi:// and the like, which linkify does not take for links
    let upi_re = regex_lite::Regex::new(r"(?i)\b(?:upi|tez|phonepe|paytmmp)://[^\s<>]+").unwrap();
    for m in upi_re.find_iter(text) {
        if taken.iter().any(|(a, b)| m.start() < *b && m.end() > *a) { continue; }
        let an = analyse_url(m.as_str(), 0);
        items.push(json!({"kind": "link", "text": m.as_str(), "start": u16_at(text, m.start()), "end": u16_at(text, m.end()), "link": links.len()}));
        links.push(an);
        taken.push((m.start(), m.end()));
    }
    // UPI IDs
    let id_re = regex_lite::Regex::new(r"(?i)\b[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,30}\b").unwrap();
    let mut upis: Vec<Value> = Vec::new();
    for m in id_re.find_iter(text) {
        if taken.iter().any(|(a, b)| m.start() < *b && m.end() > *a) { continue; }
        if text[m.end()..].starts_with('.') && text[m.end() + 1..].chars().next().map(|c| c.is_alphabetic()).unwrap_or(false) { continue; }
        let id = m.as_str();
        let h = handle_of(id);
        items.push(json!({"kind": "upi", "text": id, "start": u16_at(text, m.start()), "end": u16_at(text, m.end())}));
        upis.push(json!({"id": id, "handle": h}));
        taken.push((m.start(), m.end()));
    }
    // phone numbers
    let ph_re = regex_lite::Regex::new(r"(?:\+|\b00)\d{1,3}[\s.-]?\(?\d{1,5}\)?(?:[\s.-]?\d{2,5}){1,4}\b|\b0?[6-9]\d{4}[\s-]?\d{5}\b|\b1[89]\d0[\s-]?\d{3}[\s-]?\d{4}\b|\b0\d{2,4}[\s-]\d{6,8}\b").unwrap();
    let mut phones: Vec<Value> = Vec::new();
    let mut phone_spans: Vec<(usize, usize)> = Vec::new();
    for m in ph_re.find_iter(text) {
        if taken.iter().any(|(a, b)| m.start() < *b && m.end() > *a) { continue; }
        let t = m.as_str();
        let digits: String = t.chars().filter(|c| c.is_ascii_digit()).collect();
        if digits.len() < 10 || digits.len() > 15 { continue; }
        let intl = t.starts_with('+') || t.starts_with("00");
        let d = if t.starts_with("00") { digits[2..].to_string() } else { digits.clone() };
        let (code, country) = if intl {
            calling(&d).map(|(c, n)| (c.to_string(), n.to_string())).unwrap_or_default()
        } else {
            ("91".into(), "India".into())
        };
        let toll = !intl && (digits.starts_with("1800") || digits.starts_with("1860"));
        items.push(json!({"kind": "phone", "text": t, "start": u16_at(text, m.start()), "end": u16_at(text, m.end())}));
        phones.push(json!({"text": t, "code": code, "country": country, "abroad": intl && code != "91", "tollFree": toll}));
        phone_spans.push((m.start(), m.end()));
    }
    // the wording
    let mut words: Vec<Value> = Vec::new();
    COMPILED_RULES.with(|c| {
        let rx = c.get_or_init(|| RULES.iter().map(|r| regex_lite::Regex::new(&format!("(?i){}", r.pattern)).expect(r.pattern)).collect());
        for (rule, re) in RULES.iter().zip(rx) {
            for m in re.find_iter(text) {
                if rule.negatable && negated(text, m.start(), m.end()) { continue; }
                if taken.iter().any(|(a, b)| m.start() < *b && m.end() > *a) { continue; }
                if words.iter().any(|w| w.get("id").and_then(|x| x.as_str()) == Some(rule.id) && w.get("level").and_then(|x| x.as_str()) == Some(rule.level)) {
                    // one sign a kind; every place it was said is marked
                    items.push(json!({"kind": "words", "id": rule.id, "text": m.as_str(), "start": u16_at(text, m.start()), "end": u16_at(text, m.end())}));
                    continue;
                }
                items.push(json!({"kind": "words", "id": rule.id, "text": m.as_str(), "start": u16_at(text, m.start()), "end": u16_at(text, m.end())}));
                words.push(json!({"id": rule.id, "level": rule.level, "text": rule.text, "said": m.as_str()}));
            }
        }
    });
    // a sign of the same kind at a higher level replaces the lower one (an .apk over "install an app")
    let mut keep: Vec<Value> = Vec::new();
    for w in words {
        let id = w.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let lv = rank(w.get("level").and_then(|x| x.as_str()).unwrap_or("info"));
        if let Some(i) = keep.iter().position(|k| k.get("id").and_then(|x| x.as_str()) == Some(&id)) {
            if lv > rank(keep[i].get("level").and_then(|x| x.as_str()).unwrap_or("info")) { keep[i] = w; }
        } else {
            keep.push(w);
        }
    }
    if keep.iter().any(|w| w.get("id").and_then(|x| x.as_str()) == Some("power")) {
        keep.retain(|w| w.get("id").and_then(|x| x.as_str()) != Some("threat"));
    }
    let words = keep;
    items.sort_by_key(|x| x.get("start").and_then(|s| s.as_u64()).unwrap_or(0));
    // the verdict of the message
    let mut signs: Vec<Value> = Vec::new();
    for p in &phones {
        if p.get("abroad").and_then(|x| x.as_bool()) == Some(true) {
            signs.push(sign("warn", "abroad", format!("A phone number from abroad ({} — {}). An Indian bank, company or government office would not call or message from there.",
                p.get("text").and_then(|x| x.as_str()).unwrap_or(""), p.get("country").and_then(|x| x.as_str()).unwrap_or(""))));
        }
    }
    for u in &upis {
        let id = u.get("id").and_then(|x| x.as_str()).unwrap_or("");
        let h = u.get("handle").and_then(|x| x.as_str()).map(|h| format!(" ({h})")).unwrap_or_default();
        signs.push(sign("info", "upi-id", format!("A UPI ID, {id}{h}: paying it sends money to whoever it belongs to — your UPI app shows that person's name before you pay.")));
        if let Some((b, _)) = names_brand(id.split('@').next().unwrap_or("")) {
            signs.push(sign("warn", "upi-brand", format!("The UPI ID {id} uses {}'s name, but anyone can make an ID with any name: it is no proof that the money goes to {}.", b.short, b.short)));
        }
    }
    let mut level = 0u8;
    for w in &words { level = level.max(rank(w.get("level").and_then(|x| x.as_str()).unwrap_or("info"))); }
    for l in &links { level = level.max(rank(l.get("verdict").and_then(|x| x.as_str()).unwrap_or("none")).min(3)); }
    for x in &signs { level = level.max(rank(x.get("level").and_then(|x| x.as_str()).unwrap_or("info"))); }
    if level == 1 { level = 0; } // a brand's own link alone says nothing about the message
    let warn_kinds: Vec<&str> = words.iter().filter(|w| w.get("level").and_then(|x| x.as_str()) == Some("warn")).filter_map(|w| w.get("id").and_then(|x| x.as_str())).collect();
    let actionable = !links.is_empty() || !phones.is_empty() || !upis.is_empty();
    let mut together = false;
    if level < 3 && warn_kinds.len() >= 2 && actionable {
        level = 3;
        together = true;
    }
    let verdict = match level { 3 => "danger", 2 => "warn", _ => "none" };
    js(json!({"verdict": verdict, "together": together, "items": items, "links": links, "words": words, "signs": signs, "phones": phones, "upis": upis}))
}

pub fn analyse(input: &[u8]) -> R {
    let v = arg(input)?;
    js(analyse_url(s(&v, "url"), 0))
}

pub fn clean(input: &[u8]) -> R {
    let v = arg(input)?;
    let (p, notes) = prepare(s(&v, "url"));
    let u = Url::parse(&p).map_err(|e| format!("not a link: {e}"))?;
    let mut c = clean_url(&u);
    c.as_object_mut().unwrap().insert("notes".into(), Value::Array(notes));
    c.as_object_mut().unwrap().insert("input".into(), json!(u.as_str()));
    js(c)
}

/// For the tests: the ClearURLs steps alone (as the extension would leave the link, before our product rule)
pub fn clearurls_only(input: &[u8]) -> R {
    let v = arg(input)?;
    let (url, steps, blocked) = clearurls(s(&v, "url"));
    js(json!({"url": url, "blocked": blocked, "steps": steps.iter().map(|s| json!({"kind": s.kind, "provider": s.provider, "url": s.url,
        "removed": s.removed.iter().map(|r| json!({"place": r.0, "key": r.1, "value": r.2, "rule": r.3})).collect::<Vec<_>>()})).collect::<Vec<_>>()}))
}

pub fn skeleton(input: &[u8]) -> R {
    let v = arg(input)?;
    let texts = v.get("texts").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    js(Value::Array(texts.iter().map(|t| {
        let t = t.as_str().unwrap_or("");
        json!({"skeleton": unicode_security::skeleton(t).collect::<String>(), "key": key(t), "level": format!("{:?}", t.detect_restriction_level()), "single": t.is_single_script()})
    }).collect()))
}

pub fn site(input: &[u8]) -> R {
    let v = arg(input)?;
    let hosts = v.get("hosts").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    js(Value::Array(hosts.iter().map(|h| {
        let h = h.as_str().unwrap_or("");
        let ascii = Url::parse(&format!("https://{h}/")).ok().and_then(|u| u.host_str().map(String::from)).unwrap_or_else(|| h.to_string());
        let st = site_of(&ascii);
        json!({"host": st.host, "unicode": st.unicode, "site": st.site, "suffix": st.suffix, "known": st.known, "private": st.private, "icannSite": st.icann_site,
            "brand": own_brand(&st.host).map(|(b, d)| json!({"name": b.name, "domain": d}))})
    }).collect()))
}

pub fn info() -> R {
    let (n, bad) = with_providers(|p, bad| (p.len(), bad.to_vec()));
    // every rule of every provider compiled, so that a pattern regex-lite cannot read is known (the suite wants none)
    let mut bad2 = bad.clone();
    with_providers(|p, _| {
        for x in p {
            let mut b = Vec::new();
            for k in ["rules", "referralMarketing"] { for r in list(&x.src, k) { if re(&format!("^{r}$"), &mut b).is_none() {} } }
            for k in ["rawRules", "exceptions", "redirections"] { for r in list(&x.src, k) { let _ = re(&r, &mut b); } }
            bad2.extend(b);
        }
    });
    bad2.sort();
    bad2.dedup();
    js(json!({"clearurls": {"commit": CLEARURLS_COMMIT, "sha256": CLEARURLS_SHA256, "providers": n, "unreadable": bad2},
        "unicode": format!("{}.{}.{}", unicode_security::UNICODE_VERSION.0, unicode_security::UNICODE_VERSION.1, unicode_security::UNICODE_VERSION.2),
        "brands": BRANDS.len(), "shorteners": SHORTENERS.len(), "rules": RULES.len()}))
}
