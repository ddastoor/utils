//! Password strength for wasm32-wasip1: zxcvbn 3 (Rust port of Dropbox's zxcvbn; MIT). One call: zx(password, inputs).
use serde_json::{json, Value};
use std::cell::RefCell;
use zxcvbn::matching::patterns::MatchPattern;

thread_local! { static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new()); }
#[no_mangle] pub extern "C" fn z_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn z_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))); }
#[no_mangle] pub extern "C" fn z_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle] pub extern "C" fn z_out_len() -> usize { OUT.with(|o| o.borrow().len()) }

/// input JSON {"password": "...", "inputs": ["name", "email", ...]}
#[no_mangle]
pub unsafe extern "C" fn z_check(p: *const u8, n: usize) -> i32 {
    let a: Value = serde_json::from_slice(std::slice::from_raw_parts(p, n)).unwrap_or(Value::Null);
    let pw = a.get("password").and_then(|x| x.as_str()).unwrap_or("");
    let inputs: Vec<String> = a.get("inputs").and_then(|x| x.as_array()).map(|v| v.iter().filter_map(|x| x.as_str().map(|s| s.to_lowercase())).collect()).unwrap_or_default();
    let refs: Vec<&str> = inputs.iter().map(|s| s.as_str()).collect();
    let e = zxcvbn::zxcvbn(pw, &refs);
    let ct = e.crack_times();
    let t = |c: zxcvbn::time_estimates::CrackTimeSeconds| -> Value { json!({ "text": c.to_string(), "seconds": match c { zxcvbn::time_estimates::CrackTimeSeconds::Integer(i) => i as f64, zxcvbn::time_estimates::CrackTimeSeconds::Float(f) => f } }) };
    let seq: Vec<Value> = e.sequence().iter().map(|m| {
        let (kind, detail) = match &m.pattern {
            MatchPattern::Dictionary(d) => ("dictionary", format!("{:?}{}{}", d.dictionary_name, if d.reversed { ", reversed" } else { "" }, if d.l33t { ", l33t" } else { "" })),
            MatchPattern::Spatial(s) => ("keyboard", format!("{} ({} turns)", s.graph, s.turns)),
            MatchPattern::Repeat(r) => ("repeat", format!("\"{}\" × {}", r.base_token, r.repeat_count)),
            MatchPattern::Sequence(s) => ("sequence", s.sequence_name.to_string()),
            MatchPattern::Regex(r) => ("pattern", r.regex_name.to_string()),
            MatchPattern::Date(d) => ("date", format!("{}-{:02}-{:02}", d.year, d.month, d.day)),
            MatchPattern::BruteForce => ("bruteforce", String::new()),
        };
        json!({ "token": m.token, "i": m.i, "j": m.j, "kind": kind, "detail": detail, "guesses": m.guesses })
    }).collect();
    let fb = e.feedback();
    let out = json!({
        "score": u8::from(e.score()), "guesses": e.guesses(), "log10": e.guesses_log10(),
        "times": { "online_throttled": t(ct.online_throttling_100_per_hour()), "online": t(ct.online_no_throttling_10_per_second()), "offline_slow": t(ct.offline_slow_hashing_1e4_per_second()), "offline_fast": t(ct.offline_fast_hashing_1e10_per_second()) },
        "warning": fb.and_then(|f| f.warning()).map(|w| w.to_string()), "suggestions": fb.map(|f| f.suggestions().iter().map(|s| s.to_string()).collect::<Vec<_>>()).unwrap_or_default(),
        "sequence": seq,
    });
    OUT.with(|o| *o.borrow_mut() = serde_json::to_vec(&out).unwrap());
    0
}
