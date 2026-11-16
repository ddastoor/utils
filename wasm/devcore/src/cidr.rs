//! Subnet / CIDR calculator. Input JSON {"input": "...", "split": <new prefix, optional>}.
//! Accepts 10.1.2.3/24, 10.1.2.3 255.255.255.0, 10.1.2.3/255.255.255.0, a bare address, IPv6 2001:db8::1/48, and ranges
//! "a - b" (→ the smallest list of CIDR blocks covering exactly that range).
use crate::{arg, js, s, R};
use ipnet::{IpNet, Ipv4AddrRange, Ipv4Net, Ipv4Subnets, Ipv6Net, Ipv6Subnets};
use serde_json::{json, Value};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

fn mask_to_prefix(m: Ipv4Addr) -> Result<u8, String> {
    let v = u32::from(m);
    if v.leading_ones() + v.trailing_zeros() != 32 { return Err(format!("{m} is not a valid netmask (the 1-bits must be contiguous)")); }
    Ok(v.leading_ones() as u8)
}

fn parse(inp: &str) -> Result<(IpAddr, u8), String> {
    let t = inp.trim();
    if t.is_empty() { return Err("Enter an address, e.g. 192.168.1.10/24".into()); }
    let (a, p) = if let Some((a, p)) = t.split_once('/') { (a.trim(), Some(p.trim())) }
        else if let Some((a, p)) = t.split_once(char::is_whitespace) { (a.trim(), Some(p.trim())) } else { (t, None) };
    let addr: IpAddr = a.parse().map_err(|_| format!("\"{a}\" is not an IPv4 or IPv6 address"))?;
    let max = if addr.is_ipv4() { 32 } else { 128 };
    let prefix = match p {
        None => max,
        Some(p) if p.contains('.') => {
            if !addr.is_ipv4() { return Err("A dotted netmask only works with IPv4".into()); }
            mask_to_prefix(p.parse().map_err(|_| format!("\"{p}\" is not a netmask"))?)?
        }
        Some(p) => { let n: u8 = p.parse().map_err(|_| format!("\"/{p}\" is not a prefix length"))?; if n > max { return Err(format!("Prefix /{n} is too long for IPv{} (max /{max})", if max == 32 { 4 } else { 6 })); } n }
    };
    Ok((addr, prefix))
}

fn kind4(a: Ipv4Addr) -> &'static str {
    let o = a.octets();
    if a.is_unspecified() { "Unspecified (0.0.0.0)" } else if a.is_loopback() { "Loopback (127.0.0.0/8)" }
    else if o[0] == 10 || (o[0] == 172 && (16..=31).contains(&o[1])) || (o[0] == 192 && o[1] == 168) { "Private (RFC 1918)" }
    else if o[0] == 100 && (64..=127).contains(&o[1]) { "Carrier-grade NAT (100.64.0.0/10)" }
    else if o[0] == 169 && o[1] == 254 { "Link-local (169.254.0.0/16)" }
    else if (o[0] == 192 && o[1] == 0 && o[2] == 2) || (o[0] == 198 && o[1] == 51 && o[2] == 100) || (o[0] == 203 && o[1] == 0 && o[2] == 113) { "Documentation (RFC 5737)" }
    else if o[0] == 198 && (o[1] == 18 || o[1] == 19) { "Benchmarking (198.18.0.0/15)" }
    else if a.is_multicast() { "Multicast (224.0.0.0/4)" } else if a.is_broadcast() { "Limited broadcast" }
    else if o[0] >= 240 { "Reserved (240.0.0.0/4)" } else if o[0] == 0 { "\"This network\" (0.0.0.0/8)" } else { "Public" }
}
fn kind6(a: Ipv6Addr) -> &'static str {
    let s = a.segments();
    if a.is_unspecified() { "Unspecified (::)" } else if a.is_loopback() { "Loopback (::1)" }
    else if s[0] & 0xffc0 == 0xfe80 { "Link-local (fe80::/10)" } else if s[0] & 0xfe00 == 0xfc00 { "Unique local (fc00::/7)" }
    else if s[0] & 0xff00 == 0xff00 { "Multicast (ff00::/8)" } else if s[0] == 0x2001 && s[1] == 0x0db8 { "Documentation (2001:db8::/32)" }
    else if a.to_ipv4_mapped().is_some() { "IPv4-mapped (::ffff:0:0/96)" } else if s[0] == 0x2002 { "6to4 (2002::/16)" }
    else if s[0] == 0x0064 && s[1] == 0xff9b { "NAT64 (64:ff9b::/96)" } else if s[0] & 0xe000 == 0x2000 { "Global unicast (2000::/3)" } else { "Reserved" }
}
fn bin4(a: Ipv4Addr) -> String { a.octets().iter().map(|o| format!("{o:08b}")).collect::<Vec<_>>().join(".") }
fn expand6(a: Ipv6Addr) -> String { a.segments().iter().map(|x| format!("{x:04x}")).collect::<Vec<_>>().join(":") }
fn pow2(bits: u32) -> String { if bits >= 128 { "340282366920938463463374607431768211456".into() } else { (1u128 << bits).to_string() } }

fn v4(addr: Ipv4Addr, p: u8, split: Option<u8>) -> Result<Value, String> {
    let net = Ipv4Net::new(addr, p).map_err(|e| e.to_string())?;
    let (nw, bc) = (net.network(), net.broadcast());
    let total = 1u64 << (32 - p as u32);
    let (first, last, usable) = match p { 32 => (nw, nw, 1), 31 => (nw, bc, 2), _ => (Ipv4Addr::from(u32::from(nw) + 1), Ipv4Addr::from(u32::from(bc) - 1), total - 2) };
    let o = addr.octets()[0];
    let class = if o < 128 { "A" } else if o < 192 { "B" } else if o < 224 { "C" } else if o < 240 { "D (multicast)" } else { "E (reserved)" };
    let rev = { let x = addr.octets(); format!("{}.{}.{}.{}.in-addr.arpa", x[3], x[2], x[1], x[0]) };
    let mut out = json!({
        "version": 4, "address": addr.to_string(), "cidr": format!("{nw}/{p}"), "prefix": p, "netmask": net.netmask().to_string(), "wildcard": net.hostmask().to_string(),
        "network": nw.to_string(), "broadcast": if p >= 31 { Value::Null } else { bc.to_string().into() }, "first": first.to_string(), "last": last.to_string(),
        "total": total.to_string(), "usable": usable.to_string(), "class": class, "kind": kind4(addr), "binary": bin4(addr), "maskBinary": bin4(net.netmask()),
        "hex": format!("0x{:08X}", u32::from(addr)), "integer": u32::from(addr).to_string(), "reverse": rev, "isNetwork": addr == nw,
        "mapped6": format!("::ffff:{addr}"),
    });
    if let Some(sp) = split { out["subnets"] = subnets4(net, sp)?; }
    Ok(out)
}
fn subnets4(net: Ipv4Net, sp: u8) -> Result<Value, String> {
    if sp < net.prefix_len() || sp > 32 { return Err(format!("Split prefix must be between /{} and /32", net.prefix_len())); }
    let count = 1u64 << (sp - net.prefix_len()) as u32;
    let list: Vec<Value> = net.subnets(sp).map_err(|e| e.to_string())?.take(1024).map(|n| {
        let hosts = match sp { 32 => 1, 31 => 2, _ => (1u64 << (32 - sp as u32)) - 2 };
        let (f, l) = if sp >= 31 { (n.network(), n.broadcast()) } else { (Ipv4Addr::from(u32::from(n.network()) + 1), Ipv4Addr::from(u32::from(n.broadcast()) - 1)) };
        json!({ "cidr": n.to_string(), "first": f.to_string(), "last": l.to_string(), "broadcast": if sp >= 31 { Value::Null } else { n.broadcast().to_string().into() }, "hosts": hosts.to_string() })
    }).collect();
    Ok(json!({ "count": count.to_string(), "shown": list.len(), "list": list }))
}

fn v6(addr: Ipv6Addr, p: u8, split: Option<u8>) -> Result<Value, String> {
    let net = Ipv6Net::new(addr, p).map_err(|e| e.to_string())?;
    let rev: String = { let h: String = expand6(addr).replace(':', ""); let mut v: Vec<String> = h.chars().rev().map(|c| c.to_string()).collect(); v.push("ip6.arpa".into()); v.join(".") };
    let mut out = json!({
        "version": 6, "address": addr.to_string(), "expanded": expand6(addr), "cidr": format!("{}/{p}", net.network()), "prefix": p,
        "network": net.network().to_string(), "netmask": net.netmask().to_string(), "first": net.network().to_string(), "last": net.broadcast().to_string(),
        "lastExpanded": expand6(net.broadcast()), "total": pow2(128 - p as u32), "kind": kind6(addr), "reverse": rev, "isNetwork": addr == net.network(),
        "v4": addr.to_ipv4_mapped().map(|x| x.to_string()),
    });
    if let Some(sp) = split {
        if sp < p || sp > 128 { return Err(format!("Split prefix must be between /{p} and /128")); }
        let bits = (sp - p) as u32;
        let list: Vec<Value> = net.subnets(sp).map_err(|e| e.to_string())?.take(1024).map(|n| json!({ "cidr": n.to_string(), "first": n.network().to_string(), "last": n.broadcast().to_string() })).collect();
        out["subnets"] = json!({ "count": pow2(bits), "shown": list.len(), "list": list });
    }
    Ok(out)
}

fn range(a: &str, b: &str) -> Result<Value, String> {
    let (x, y): (IpAddr, IpAddr) = (a.trim().parse().map_err(|_| format!("\"{}\" is not an address", a.trim()))?, b.trim().parse().map_err(|_| format!("\"{}\" is not an address", b.trim()))?);
    let blocks: Vec<String> = match (x, y) {
        (IpAddr::V4(x), IpAddr::V4(y)) => { if x > y { return Err("The range end is before its start".into()); } Ipv4Subnets::new(x, y, 0).map(|n| n.to_string()).collect() }
        (IpAddr::V6(x), IpAddr::V6(y)) => { if x > y { return Err("The range end is before its start".into()); } Ipv6Subnets::new(x, y, 0).map(|n| n.to_string()).collect() }
        _ => return Err("Both ends of a range must be the same IP version".into()),
    };
    let total = match (x, y) { (IpAddr::V4(x), IpAddr::V4(y)) => (u32::from(y) as u128 - u32::from(x) as u128 + 1).to_string(), (IpAddr::V6(x), IpAddr::V6(y)) => { let d = u128::from(y) - u128::from(x); if d == u128::MAX { pow2(128) } else { (d + 1).to_string() } } _ => unreachable!() };
    let _ = Ipv4AddrRange::new(Ipv4Addr::UNSPECIFIED, Ipv4Addr::UNSPECIFIED);
    Ok(json!({ "range": true, "start": x.to_string(), "end": y.to_string(), "total": total, "blocks": blocks }))
}

pub fn run(input: &[u8]) -> R {
    let a = arg(input)?;
    let t = s(&a, "input").trim().to_string();
    let split = a.get("split").and_then(|v| v.as_u64()).map(|v| v.min(255) as u8);
    if let Some((x, y)) = t.split_once(" - ").or_else(|| if !t.contains(':') { t.split_once('-') } else { None }) {
        return js(range(x, y)?);
    }
    let (addr, p) = parse(&t)?;
    let _ = IpNet::from(addr);
    js(match addr { IpAddr::V4(x) => v4(x, p, split)?, IpAddr::V6(x) => v6(x, p, split)? })
}
