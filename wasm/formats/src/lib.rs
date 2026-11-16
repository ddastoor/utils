//! SuperTools config formats (wasm32-wasip1). Built twice (Cargo features): formats-yaml.wasm (YAML ⇄ JSON ⇄ TOML with
//! serde_yaml_ng — unsafe-libyaml, a Rust translation of libyaml — and toml) and formats-schema.wasm (jsonschema).
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
fn parse_json(label: &str, t: &str) -> Result<Value, Value> {
    serde_json::from_str(t).map_err(|x| el(format!("{label}: {}", x.to_string().split(" at line").next().unwrap_or("")), x.line(), x.column()))
}

// ------------------------------------------------------------------ YAML / JSON / TOML
#[cfg(feature = "yaml")]
mod conv {
    use super::*;
    fn yaml_err(x: serde_yaml_ng::Error) -> Value {
        match x.location() { Some(l) => el(x.to_string().split(" at line").next().unwrap_or("").to_string(), l.line(), l.column()), None => e(x.to_string()) }
    }
    /// YAML text → JSON values (one per document). Anchors/aliases are resolved and `<<` merge keys applied.
    pub fn read_yaml(t: &str) -> Result<Vec<Value>, Value> {
        use serde::Deserialize;
        let mut docs = Vec::new();
        for d in serde_yaml_ng::Deserializer::from_str(t) {
            let mut y = serde_yaml_ng::Value::deserialize(d).map_err(yaml_err)?;
            y.apply_merge().map_err(yaml_err)?;
            if matches!(y, serde_yaml_ng::Value::Null) && t.trim().is_empty() { continue; }
            docs.push(yaml_to_json(y)?);
        }
        Ok(docs)
    }
    fn yaml_to_json(y: serde_yaml_ng::Value) -> Result<Value, Value> {
        use serde_yaml_ng::Value as Y;
        Ok(match y {
            Y::Null => Value::Null, Y::Bool(b) => Value::Bool(b), Y::String(s) => Value::String(s),
            Y::Number(n) => if let Some(i) = n.as_i64() { json!(i) } else if let Some(u) = n.as_u64() { json!(u) } else { let f = n.as_f64().unwrap_or(0.0); if f.is_finite() { json!(f) } else { return Err(e("JSON has no Infinity or NaN (.inf / .nan in the YAML)")) } },
            Y::Sequence(s) => Value::Array(s.into_iter().map(yaml_to_json).collect::<Result<_, _>>()?),
            Y::Mapping(m) => { let mut o = serde_json::Map::new(); for (k, v) in m { let key = match k { Y::String(s) => s, Y::Number(n) => n.to_string(), Y::Bool(b) => b.to_string(), Y::Null => "null".into(), other => return Err(e(format!("JSON keys must be text; this YAML uses a {} as a key", match other { Y::Sequence(_) => "list", Y::Mapping(_) => "map", _ => "tagged value" }))) }; o.insert(key, yaml_to_json(v)?); } Value::Object(o) }
            Y::Tagged(t) => yaml_to_json(t.value)?,
        })
    }
    fn toml_to_json(v: toml::Value) -> Value {
        match v {
            toml::Value::String(s) => Value::String(s), toml::Value::Integer(i) => json!(i), toml::Value::Float(f) => json!(f), toml::Value::Boolean(b) => Value::Bool(b),
            toml::Value::Datetime(d) => Value::String(d.to_string()), toml::Value::Array(a) => Value::Array(a.into_iter().map(toml_to_json).collect()),
            toml::Value::Table(t) => Value::Object(t.into_iter().map(|(k, v)| (k, toml_to_json(v))).collect()),
        }
    }
    fn json_to_toml(v: &Value, path: &str) -> Result<toml::Value, Value> {
        Ok(match v {
            Value::Null => return Err(e(format!("TOML has no null — the value at {} is null", if path.is_empty() { "the top" } else { path }))),
            Value::Bool(b) => toml::Value::Boolean(*b), Value::String(s) => toml::Value::String(s.clone()),
            Value::Number(n) => if let Some(i) = n.as_i64() { toml::Value::Integer(i) } else { toml::Value::Float(n.as_f64().unwrap_or(0.0)) },
            Value::Array(a) => toml::Value::Array(a.iter().enumerate().map(|(i, x)| json_to_toml(x, &format!("{path}[{i}]"))).collect::<Result<_, _>>()?),
            Value::Object(o) => { let mut t = toml::map::Map::new(); for (k, x) in o { t.insert(k.clone(), json_to_toml(x, &if path.is_empty() { k.clone() } else { format!("{path}.{k}") })?); } toml::Value::Table(t) }
        })
    }
    pub fn convert(a: &Value) -> R {
        let (t, from, to) = (s(a, "text"), s(a, "from"), s(a, "to"));
        let indent = a.get("indent").and_then(|x| x.as_u64()).unwrap_or(2) as usize;
        let docs: Vec<Value> = match from {
            "json" => { if t.trim().is_empty() { vec![] } else { vec![parse_json("JSON", t)?] } }
            "yaml" => read_yaml(t)?,
            "toml" => { let v: toml::Value = toml::from_str(t).map_err(|x| { let (l, c) = x.span().map(|sp| { let pre = &t[..sp.start.min(t.len())]; (pre.matches('\n').count() + 1, sp.start - pre.rfind('\n').map(|i| i + 1).unwrap_or(0) + 1) }).unwrap_or((0, 0)); el(x.message().to_string(), l, c) })?; vec![toml_to_json(v)] }
            _ => return Err(e("unknown input format")),
        };
        let multi = docs.len() > 1;
        let value = if multi { Value::Array(docs.clone()) } else { docs.into_iter().next().unwrap_or(Value::Null) };
        let out = match to {
            "json" => { let mut buf = Vec::new(); let ind = " ".repeat(indent); let f = serde_json::ser::PrettyFormatter::with_indent(ind.as_bytes()); let mut ser = serde_json::Serializer::with_formatter(&mut buf, f); serde::Serialize::serialize(&value, &mut ser).map_err(|x| e(x.to_string()))?; if indent == 0 { serde_json::to_string(&value).unwrap() } else { String::from_utf8(buf).unwrap() } }
            "yaml" => { if multi { value.as_array().unwrap().iter().map(|d| serde_yaml_ng::to_string(d).unwrap()).collect::<Vec<_>>().join("---\n") } else { serde_yaml_ng::to_string(&value).map_err(|x| e(x.to_string()))? } }
            "toml" => { let tv = json_to_toml(&value, "")?; match tv { toml::Value::Table(t) => toml::to_string_pretty(&t).map_err(|x| e(x.to_string()))?, _ => return Err(e("TOML needs a table (key = value pairs) at the top, not a list or a single value")) } }
            _ => return Err(e("unknown output format")),
        };
        Ok(json!({ "out": out, "documents": if multi { value.as_array().unwrap().len() } else { 1 } }))
    }
}

// ------------------------------------------------------------------ JSON Schema
#[cfg(feature = "schema")]
mod schema {
    use super::*;
    pub fn validate(a: &Value) -> R {
        let sch = parse_json("Schema", s(a, "schema"))?; let data = parse_json("Data", s(a, "data"))?;
        let v = jsonschema::options().should_validate_formats(true).build(&sch).map_err(|x| e(format!("The schema itself is invalid: {x}")))?;
        let errors: Vec<Value> = v.iter_errors(&data).take(200).map(|x| json!({ "path": x.instance_path().to_string(), "schemaPath": x.schema_path().to_string(), "message": x.to_string() })).collect();
        let draft = sch.get("$schema").and_then(|x| x.as_str()).unwrap_or("(none — 2020-12 assumed)").to_string();
        Ok(json!({ "valid": errors.is_empty(), "errors": errors, "draft": draft }))
    }
    fn ty(v: &Value) -> &'static str { match v { Value::Null => "null", Value::Bool(_) => "boolean", Value::Number(n) => if n.is_i64() || n.is_u64() { "integer" } else { "number" }, Value::String(_) => "string", Value::Array(_) => "array", Value::Object(_) => "object" } }
    fn fmt(s: &str) -> Option<&'static str> {
        let b = s.as_bytes();
        if b.len() == 10 && b[4] == b'-' && b[7] == b'-' && s.chars().filter(|c| c.is_ascii_digit()).count() == 8 { return Some("date"); }
        if b.len() >= 20 && b.get(10) == Some(&b'T') && b[4] == b'-' && (s.ends_with('Z') || s[19..].contains('+') || s[19..].contains('-')) { return Some("date-time"); }
        if s.contains('@') && !s.contains(' ') && s.split('@').count() == 2 && s.split('@').nth(1).map_or(false, |d| d.contains('.')) { return Some("email"); }
        if (s.starts_with("http://") || s.starts_with("https://")) && !s.contains(' ') { return Some("uri"); }
        if s.len() == 36 && s.chars().enumerate().all(|(i, c)| if [8, 13, 18, 23].contains(&i) { c == '-' } else { c.is_ascii_hexdigit() }) { return Some("uuid"); }
        None
    }
    /// Infer a draft 2020-12 schema from example values (several examples = items of a list are merged).
    fn infer(vals: &[&Value]) -> Value {
        let mut types: Vec<&str> = Vec::new();
        for v in vals { let t = ty(v); if !types.contains(&t) { types.push(t); } }
        if types.contains(&"integer") && types.contains(&"number") { types.retain(|t| *t != "integer"); }
        let mut out = serde_json::Map::new();
        out.insert("type".into(), if types.len() == 1 { json!(types[0]) } else { json!(types) });
        let objs: Vec<&serde_json::Map<String, Value>> = vals.iter().filter_map(|v| v.as_object()).collect();
        if !objs.is_empty() {
            let mut keys: Vec<String> = Vec::new(); for o in &objs { for k in o.keys() { if !keys.contains(k) { keys.push(k.clone()); } } }
            let props: serde_json::Map<String, Value> = keys.iter().map(|k| { let xs: Vec<&Value> = objs.iter().filter_map(|o| o.get(k)).collect(); (k.clone(), infer(&xs)) }).collect();
            let req: Vec<&String> = keys.iter().filter(|k| objs.iter().all(|o| o.contains_key(*k))).collect();
            out.insert("properties".into(), Value::Object(props)); if !req.is_empty() { out.insert("required".into(), json!(req)); }
            out.insert("additionalProperties".into(), json!(false));
        }
        let items: Vec<&Value> = vals.iter().filter_map(|v| v.as_array()).flatten().collect();
        if vals.iter().any(|v| v.is_array()) && !items.is_empty() { out.insert("items".into(), infer(&items)); }
        let strs: Vec<&str> = vals.iter().filter_map(|v| v.as_str()).collect();
        if !strs.is_empty() { if let Some(f) = fmt(strs[0]) { if strs.iter().all(|s| fmt(s) == Some(f)) { out.insert("format".into(), json!(f)); } } }
        Value::Object(out)
    }
    pub fn infer_op(a: &Value) -> R {
        let data = parse_json("Data", s(a, "data"))?;
        let mut sch = serde_json::Map::new(); sch.insert("$schema".into(), json!("https://json-schema.org/draft/2020-12/schema"));
        if let Value::Object(o) = infer(&[&data]) { sch.extend(o); }
        Ok(json!({ "schema": Value::Object(sch) }))
    }
}

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
        _ => Err(e(format!("unknown op {op}"))),
    };
    let (code, v) = match r { Ok(v) => (0, v), Err(v) => (-1, v) };
    OUT.with(|o| *o.borrow_mut() = serde_json::to_vec(&v).unwrap());
    code
}
