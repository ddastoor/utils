//! SuperTools config formats (wasm32-wasip1). Built twice (Cargo features): formats-yaml.wasm (YAML ⇄ JSON ⇄ TOML: the
//! parsers serde_yaml_ng — unsafe-libyaml, a Rust translation of libyaml — and toml, our lossless JSON reader, and
//! our own writers for the three formats, see conv.rs) and formats-schema.wasm (jsonschema).
//! Entry point: f_call(op, json) → JSON; errors come back as {"error": "...", "line": n, "column": n}.
#![allow(dead_code)]
use serde_json::{json, Value};
use std::cell::RefCell;

thread_local! { static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new()); }
#[no_mangle] pub extern "C" fn f_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn f_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))); }
#[no_mangle] pub extern "C" fn f_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle] pub extern "C" fn f_out_len() -> usize { OUT.with(|o| o.borrow().len()) }

type R = Result<Value, Value>;
fn s<'a>(v: &'a Value, k: &str) -> &'a str { v.get(k).and_then(|x| x.as_str()).unwrap_or("") }
fn e(msg: impl Into<String>) -> Value { json!({ "error": msg.into() }) }
fn el(msg: impl Into<String>, line: usize, col: usize) -> Value { json!({ "error": msg.into(), "line": line, "column": col }) }
/// White space that makes a text "empty" (not Unicode spaces such as U+00A0: those are content).
const BLANK: [char; 4] = [' ', '\t', '\r', '\n'];

// ------------------------------------------------------------------ YAML / JSON / TOML (conv.rs)
// The JSON reader is the one of the JSON Formatter tab (same messages, numbers and duplicate keys kept as written);
// the JSON Schema tab reads its two boxes with it as well.
#[path = "../../devcore/src/jsonfmt.rs"]
mod jsonfmt;
#[cfg(feature = "yaml")]
mod conv;

// ------------------------------------------------------------------ JSON Schema (schema.rs)
#[cfg(feature = "schema")]
mod schema;

#[no_mangle]
pub unsafe extern "C" fn f_call(op: *const u8, op_n: usize, inp: *const u8, in_n: usize) -> i32 {
    let op = std::str::from_utf8(std::slice::from_raw_parts(op, op_n)).unwrap_or("");
    let a: Value = serde_json::from_slice(if in_n == 0 { b"{}" } else { std::slice::from_raw_parts(inp, in_n) }).unwrap_or(Value::Null);
    let r: R = match op {
        #[cfg(feature = "yaml")]
        "convert" => conv::convert(&a),
        #[cfg(feature = "schema")]
        "validate" => schema::validate(&a),
        #[cfg(feature = "schema")]
        "infer" => schema::infer_op(&a),
        #[cfg(feature = "schema")]
        "verdicts" => schema::verdicts(&a),
        _ => Err(e(format!("unknown op {op}"))),
    };
    let (code, v) = match r { Ok(v) => (0, v), Err(v) => (-1, v) };
    OUT.with(|o| *o.borrow_mut() = serde_json::to_vec(&v).unwrap());
    code
}
