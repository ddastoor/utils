//! JSON Schema tab: validate data against a schema (the jsonschema crate: drafts 4, 6, 7, 2019-09, 2020-12, formats
//! checked, big numbers and decimals compared exactly) and make a schema from an example.
//! Both text boxes are read with the JSON reader of the JSON Formatter tab first (wasm/devcore/src/jsonfmt.rs: worded
//! messages with line and column, keys written twice), then handed to the validator.
use crate::jsonfmt;
use crate::{e, el, s, BLANK, R};
use jsonschema::Draft;
use serde_json::{json, Value};

fn read(label: &str, text: &str, notes: &mut Vec<String>) -> Result<Value, Value> {
    let t = text.strip_prefix('\u{feff}').unwrap_or(text);
    if t.trim_matches(BLANK).is_empty() { return Err(e(format!("{label}: nothing here yet — {}", if label == "Schema" { "paste a JSON Schema, or make one from the data" } else { "paste the JSON to check" }))); }
    let p = jsonfmt::parse(t).map_err(|x| el(format!("{label}: {}", x.message), x.line, x.column))?;
    for (k, line) in p.dups.iter().take(3) { notes.push(format!("{label}: the key \"{k}\" is there twice (line {line}) — the last one counts.")); }
    serde_json::from_str(t).map_err(|x| {
        let m = x.to_string();
        let m = if m.contains("surrogate") || m.contains("hex escape") { "a lone surrogate escape (half of an emoji, such as \\ud83d without its second half) is not a character".to_string() }
            else if m.contains("recursion limit") { "nested deeper than 128 levels — more than this validator reads".to_string() }
            else { m.split(" at line").next().unwrap_or("").to_string() };
        el(format!("{label}: {m}"), x.line(), x.column())
    })
}
fn kind(v: &Value) -> &'static str { match v { Value::Null => "null", Value::Bool(_) => "true / false", Value::Number(_) => "a number", Value::String(_) => "a text", Value::Array(_) => "a list", Value::Object(_) => "an object" } }
fn draft_name(d: Draft) -> &'static str { match d { Draft::Draft4 => "Draft 4", Draft::Draft6 => "Draft 6", Draft::Draft7 => "Draft 7", Draft::Draft201909 => "Draft 2019-09", Draft::Draft202012 => "Draft 2020-12", _ => "an unknown draft" } }

/// Does the validator check this `format` in this draft? (jsonschema's own table, keywords/format.rs)
fn format_known(d: Draft, f: &str) -> Result<(), &'static str> {
    let from = |min: Draft, since: &'static str| if d >= min { Ok(()) } else { Err(since) };
    match f {
        "date" | "date-time" | "email" | "hostname" | "idn-email" | "ipv4" | "ipv6" | "regex" | "time" | "uri" => Ok(()),
        "json-pointer" | "uri-reference" | "uri-template" => from(Draft::Draft6, "Draft 6"),
        "idn-hostname" | "iri" | "iri-reference" | "relative-json-pointer" => from(Draft::Draft7, "Draft 7"),
        "duration" | "uuid" => from(Draft::Draft201909, "Draft 2019-09"),
        _ => Err(""),
    }
}
fn unchecked_formats(v: &Value, d: Draft, out: &mut Vec<String>) {
    match v {
        Value::Object(o) => {
            if let Some(Value::String(f)) = o.get("format") {
                if let Err(since) = format_known(d, f) {
                    let line = if since.is_empty() { format!("\"{f}\" (not a format this validator knows)") } else { format!("\"{f}\" (part of JSON Schema from {since} on)") };
                    if !out.contains(&line) && out.len() < 8 { out.push(line); }
                }
            }
            // values that are data, not schemas, are not looked into
            for (k, x) in o { if !matches!(k.as_str(), "enum" | "const" | "default" | "examples") { unchecked_formats(x, d, out); } }
        }
        Value::Array(a) => for x in a { unchecked_formats(x, d, out); },
        _ => {}
    }
}
/// The crate's messages, made a little plainer; very long ones (they quote the value) are cut in the middle.
fn polish(m: String) -> String {
    let m = match m.rfind(" is not a \"") { Some(i) if m.ends_with('"') => format!("{} does not have the format {}", &m[..i], &m[i + 10..]), _ => m };
    let n = m.chars().count();
    if n <= 420 { return m; }
    let head: String = m.chars().take(240).collect(); let tail: String = m.chars().skip(n - 140).collect();
    format!("{head} … {tail}")
}
fn build_error(msg: &str, at: &str, uri: Option<&str>) -> String {
    let quoted = |after: &str| msg.find(after).map(|i| { let r = &msg[i + after.len()..]; r[..r.find('\'').unwrap_or(r.len())].to_string() });
    if msg.contains("Unknown meta-schema") || msg.contains("nknown specification") {
        return format!("The \"$schema\" of this schema is {} — this tab knows Draft 4, 6, 7, 2019-09 and 2020-12 (for example \"https://json-schema.org/draft/2020-12/schema\"). Remove that line to use the newest.", uri.map(|u| format!("\"{u}\"")).unwrap_or_else(|| "not one of the known drafts".into()));
    }
    if msg.contains("is not present in a registry") || msg.contains("No base URI") {
        return format!("A \"$ref\" points to another file or web address ({}). This tab fetches nothing: put that schema under \"$defs\" in this one and refer to it with \"#/$defs/name\".", quoted("Resource '").unwrap_or_else(|| "outside this schema".into()));
    }
    if let (Some(p), true) = (quoted("Pointer '"), msg.contains("does not exist")) { return format!("A \"$ref\" points to \"#{p}\", which does not exist in this schema."); }
    if msg.contains("recursion limit") { return "The schema is nested too deeply.".into(); }
    format!("The schema itself is not valid{}: {}", if at.is_empty() { String::new() } else { format!(" at {at}") }, polish(msg.to_string()))
}

pub fn validate(a: &Value) -> R {
    let mut notes: Vec<String> = Vec::new();
    let sch = read("Schema", s(a, "schema"), &mut notes)?; let data = read("Data", s(a, "data"), &mut notes)?;
    if !(sch.is_object() || sch.is_boolean()) { return Err(e(format!("Schema: a JSON Schema is an object (or just true / false) — this is {}", kind(&sch)))); }
    let uri = sch.get("$schema").and_then(|x| x.as_str());
    let draft = Draft::default().detect(&sch);
    let v = jsonschema::options().should_validate_formats(true).build(&sch).map_err(|x| e(build_error(&x.to_string(), &x.instance_path().to_string(), uri)))?;
    const SHOWN: usize = 200; const COUNTED: usize = 5000;
    let mut errors: Vec<Value> = Vec::new(); let mut total = 0usize;
    for x in v.iter_errors(&data) {
        total += 1;
        if errors.len() < SHOWN { errors.push(json!({ "path": x.instance_path().to_string(), "schemaPath": x.schema_path().to_string(), "message": polish(x.to_string()) })); }
        if total >= COUNTED { break; }
    }
    let mut un: Vec<String> = Vec::new(); unchecked_formats(&sch, draft, &mut un);
    if !un.is_empty() { notes.push(format!("Not checked: format {}.", un.join(", "))); }
    let label = if uri.is_some() { draft_name(draft).to_string() } else { format!("{} (the schema has no \"$schema\" line, so the newest draft is used)", draft_name(draft)) };
    Ok(json!({ "valid": total == 0, "errors": errors, "total": total, "more": total >= COUNTED, "draft": label, "notes": notes }))
}

/// One schema, many documents: { schema, datas: [JSON text, …] } → { valid: [true | false | null (not JSON), …] }.
/// The validator is built once (the unit tests check thousands of pairs this way).
pub fn verdicts(a: &Value) -> R {
    let mut notes: Vec<String> = Vec::new();
    let sch = read("Schema", s(a, "schema"), &mut notes)?;
    let uri = sch.get("$schema").and_then(|x| x.as_str());
    let v = jsonschema::options().should_validate_formats(true).build(&sch).map_err(|x| e(build_error(&x.to_string(), &x.instance_path().to_string(), uri)))?;
    let out: Vec<Value> = a.get("datas").and_then(|x| x.as_array()).map(|l| l.iter().map(|d| match serde_json::from_str::<Value>(d.as_str().unwrap_or("")) { Ok(x) => json!(v.is_valid(&x)), Err(_) => Value::Null }).collect()).unwrap_or_default();
    Ok(json!({ "valid": out }))
}

// ------------------------------------------------------------------ a schema from an example
fn ty(v: &Value) -> &'static str {
    match v {
        Value::Null => "null", Value::Bool(_) => "boolean", Value::String(_) => "string", Value::Array(_) => "array", Value::Object(_) => "object",
        // by the spelling: 1 and 12345678901234567890 are integers, 1.0 and 1e3 are numbers
        Value::Number(n) => if n.to_string().bytes().any(|b| matches!(b, b'.' | b'e' | b'E')) { "number" } else { "integer" },
    }
}
struct Formats(Vec<(&'static str, jsonschema::Validator)>);
impl Formats {
    fn new() -> Formats {
        Formats(["date-time", "date", "email", "uri", "uuid"].iter().filter_map(|f| jsonschema::options().should_validate_formats(true).build(&json!({ "format": f })).ok().map(|v| (*f, v))).collect())
    }
    /// A quick look first (so that ordinary text is not given to five validators), then the validator itself decides:
    /// a format is only put in the schema when every example really has it.
    fn of(&self, x: &str) -> Option<&'static str> {
        let b = x.as_bytes();
        let guess = if b.len() == 10 && b[4] == b'-' && b[7] == b'-' { "date" }
            else if b.len() >= 20 && b[4] == b'-' && b[7] == b'-' && (b[10] == b'T' || b[10] == b't') { "date-time" }
            else if b.len() == 36 && b[8] == b'-' && b[13] == b'-' && b[18] == b'-' && b[23] == b'-' { "uuid" }
            else if (x.starts_with("http://") || x.starts_with("https://")) && !x.contains(' ') { "uri" }
            else if x.contains('@') && !x.contains(' ') { "email" } else { return None };
        self.0.iter().find(|(f, _)| *f == guess).filter(|(_, v)| v.is_valid(&Value::String(x.to_string()))).map(|(f, _)| *f)
    }
}
/// A draft 2020-12 schema that the examples satisfy (several examples: the items of a list are merged).
fn infer(vals: &[&Value], fm: &Formats) -> Value {
    let mut types: Vec<&str> = Vec::new();
    for v in vals { let t = ty(v); if !types.contains(&t) { types.push(t); } }
    if types.contains(&"integer") && types.contains(&"number") { types.retain(|t| *t != "integer"); }
    let mut out = serde_json::Map::new();
    out.insert("type".into(), if types.len() == 1 { json!(types[0]) } else { json!(types) });
    let objs: Vec<&serde_json::Map<String, Value>> = vals.iter().filter_map(|v| v.as_object()).collect();
    if !objs.is_empty() {
        let mut keys: Vec<&String> = Vec::new(); let mut seen = std::collections::HashSet::new();
        for o in &objs { for k in o.keys() { if seen.insert(k) { keys.push(k); } } }
        let props: serde_json::Map<String, Value> = keys.iter().map(|k| { let xs: Vec<&Value> = objs.iter().filter_map(|o| o.get(*k)).collect(); ((*k).clone(), infer(&xs, fm)) }).collect();
        let req: Vec<&String> = keys.iter().filter(|k| objs.iter().all(|o| o.contains_key(**k))).cloned().collect();
        out.insert("properties".into(), Value::Object(props)); if !req.is_empty() { out.insert("required".into(), json!(req)); }
        out.insert("additionalProperties".into(), json!(false));
    }
    let items: Vec<&Value> = vals.iter().filter_map(|v| v.as_array()).flatten().collect();
    if !items.is_empty() { out.insert("items".into(), infer(&items, fm)); }
    let strs: Vec<&str> = vals.iter().filter_map(|v| v.as_str()).collect();
    if let Some(f) = strs.first().and_then(|x| fm.of(x)) { if strs.iter().all(|x| fm.of(x) == Some(f)) { out.insert("format".into(), json!(f)); } }
    Value::Object(out)
}
pub fn infer_op(a: &Value) -> R {
    let mut notes: Vec<String> = Vec::new();
    let data = read("Data", s(a, "data"), &mut notes)?;
    let mut sch = serde_json::Map::new(); sch.insert("$schema".into(), json!("https://json-schema.org/draft/2020-12/schema"));
    if let Value::Object(o) = infer(&[&data], &Formats::new()) { sch.extend(o); }
    Ok(json!({ "schema": Value::Object(sch), "notes": notes }))
}
