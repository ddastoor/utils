//! SuperTools developer-tool engine (wasm32-wasip1, no JS glue). One entry point:
//!   dc_call(op, input) → 0 and the result in dc_out, or −1 and an error message in dc_out.
//! Ops take JSON or raw bytes (see each function) and return JSON, text or bytes.
use serde_json::{json, Value};
use std::cell::RefCell;

mod bin;
mod cidr;
mod enc;
mod misc;
mod x509;

thread_local! { static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new()); }

#[no_mangle]
pub extern "C" fn dc_alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}
#[no_mangle]
pub unsafe extern "C" fn dc_free(p: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(p, 0, n.max(1)));
}
#[no_mangle]
pub extern "C" fn dc_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle]
pub extern "C" fn dc_out_len() -> usize { OUT.with(|o| o.borrow().len()) }

pub type R = Result<Vec<u8>, String>;
pub fn js(v: Value) -> R { Ok(serde_json::to_vec(&v).unwrap()) }
pub fn arg(input: &[u8]) -> Result<Value, String> { serde_json::from_slice(input).map_err(|e| format!("bad input: {e}")) }
pub fn s<'a>(v: &'a Value, k: &str) -> &'a str { v.get(k).and_then(|x| x.as_str()).unwrap_or("") }

#[no_mangle]
pub unsafe extern "C" fn dc_call(op: *const u8, op_n: usize, inp: *const u8, in_n: usize) -> i32 {
    let op = std::str::from_utf8(std::slice::from_raw_parts(op, op_n)).unwrap_or("");
    let input = if in_n == 0 { &[][..] } else { std::slice::from_raw_parts(inp, in_n) };
    let r: R = match op {
        "cidr" => cidr::run(input),
        "cron" => misc::cron(input),
        "semver" => misc::semver(input),
        "glob" => misc::glob(input),
        "patch" => misc::patch(input),
        "sqlfmt" => misc::sqlfmt(input),
        "hexdump" => misc::hexdump(input),
        "x509" => x509::run(input),
        "bin:protobuf" => bin::protobuf(input),
        "bin:msgpack" => bin::msgpack(input),
        "bin:cbor" => bin::cbor(input),
        _ if op.starts_with("enc:") => enc::encode(&op[4..], input),
        _ if op.starts_with("dec:") => enc::decode(&op[4..], input),
        _ => Err(format!("unknown op {op}")),
    };
    let (code, bytes) = match r { Ok(b) => (0, b), Err(e) => (-1, e.into_bytes()) };
    OUT.with(|o| *o.borrow_mut() = bytes);
    code
}

pub fn ok_json() -> Value { json!({}) }
