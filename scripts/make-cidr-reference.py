# Makes tests/fixtures/cidr/reference.json: answers from Python's ipaddress module (standard library) for seeded random
# IPv4 / IPv6 networks, ranges and subnet splits. Used by tests/unit/devcore.test.mjs to check devcore-cidr.wasm.
# Run: python3 scripts/make-cidr-reference.py > tests/fixtures/cidr/reference.json
import ipaddress as ip, json, random
random.seed(20261117)
v4, v6, ranges, splits = [], [], [], []
special4 = ['0.0.0.0/0', '0.0.0.0/32', '255.255.255.255/32', '255.255.255.255/0', '127.0.0.1/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.1.1/16', '100.64.0.1/10', '224.0.0.1/4', '240.0.0.1/4',
            '192.0.2.1/24', '198.51.100.7/24', '203.0.113.9/24', '198.18.0.1/15', '1.1.1.1/31', '1.1.1.0/31', '9.9.9.9/30', '128.0.0.0/1', '127.255.255.255/1', '191.255.255.255/2', '223.255.255.255/3']
for spec in special4 + [f'{ip.IPv4Address(random.getrandbits(32))}/{random.randint(0, 32)}' for _ in range(120)]:
    i = ip.ip_interface(spec); n = i.network; hosts = n.num_addresses
    first, last = (n.network_address, n.broadcast_address) if n.prefixlen >= 31 else (n.network_address + 1, n.broadcast_address - 1)
    v4.append({'in': spec, 'cidr': str(n), 'netmask': str(n.netmask), 'wildcard': str(n.hostmask), 'broadcast': None if n.prefixlen >= 31 else str(n.broadcast_address), 'first': str(first), 'last': str(last),
               'total': str(hosts), 'usable': str(1 if n.prefixlen == 32 else 2 if n.prefixlen == 31 else hosts - 2), 'integer': str(int(i.ip)), 'reverse': i.ip.reverse_pointer, 'isNetwork': i.ip == n.network_address})
special6 = ['::/0', '::1/128', '::/128', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/128', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/0', 'fe80::1/64', 'fd12:3456:789a::1/48', 'ff02::1/16', '2001:db8::/32', '::ffff:192.0.2.1/96',
            '2001:db8:0:0:1:0:0:1/64', '2001:0db8:0000:0000:0000:0000:0000:0001/127', '1::/1', '8000::/1', '2002:c000:204::/48', '64:ff9b::192.0.2.33/96', '2001:db8::1:0:0:1/100', '0:0:0:1::/64', '1:0:0:2:0:0:0:3/64']
for spec in special6 + [f'{ip.IPv6Address(random.getrandbits(128) & ~((1 << random.choice([0, 0, 16, 48, 64, 80])) - 1))}/{random.randint(0, 128)}' for _ in range(80)]:
    i = ip.ip_interface(spec); n = i.network
    v6.append({'in': spec, 'address': str(i.ip), 'expanded': i.ip.exploded, 'cidr': str(n), 'first': str(n.network_address), 'last': str(n.broadcast_address), 'total': str(n.num_addresses), 'reverse': i.ip.reverse_pointer, 'isNetwork': i.ip == n.network_address})
def rng(cls, bits):
    a = random.getrandbits(bits); span = random.choice([0, 1, 2, 255, 256, 1000, 65535, 1 << 20, random.getrandbits(random.randint(1, bits - 1))]); b = min(a + span, (1 << bits) - 1)
    return cls(a), cls(b)
for a, b in [(ip.IPv4Address('0.0.0.0'), ip.IPv4Address('255.255.255.255')), (ip.IPv4Address('10.0.0.1'), ip.IPv4Address('10.0.0.1')), (ip.IPv4Address('0.0.0.1'), ip.IPv4Address('255.255.255.254')), (ip.IPv6Address('::'), ip.IPv6Address('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')), (ip.IPv6Address('::1'), ip.IPv6Address('ffff:ffff:ffff:ffff:ffff:ffff:ffff:fffe'))] \
        + [rng(ip.IPv4Address, 32) for _ in range(40)] + [rng(ip.IPv6Address, 128) for _ in range(30)]:
    ranges.append({'a': str(a), 'b': str(b), 'total': str(int(b) - int(a) + 1), 'blocks': [str(n) for n in ip.summarize_address_range(a, b)]})
for spec, new in [('10.0.0.0/8', 12), ('192.168.4.0/22', 24), ('172.16.0.0/16', 20), ('203.0.113.0/24', 31), ('203.0.113.128/25', 32), ('0.0.0.0/0', 3), ('100.64.0.0/10', 14), ('2001:db8::/32', 36), ('fd00::/8', 12), ('2001:db8:1::/48', 52), ('::/0', 4), ('2001:db8::/126', 128)]:
    n = ip.ip_network(spec); subs = list(n.subnets(new_prefix=new))
    row = {'in': spec, 'split': new, 'count': str(len(subs)), 'list': [str(s) for s in subs]}
    if n.version == 4: row['hosts'] = str(1 if new == 32 else 2 if new == 31 else subs[0].num_addresses - 2); row['firstLast'] = [[str(s.network_address if new >= 31 else s.network_address + 1), str(s.broadcast_address if new >= 31 else s.broadcast_address - 1)] for s in subs]
    splits.append(row)
print(json.dumps({'source': 'Python ipaddress (standard library)', 'v4': v4, 'v6': v6, 'ranges': ranges, 'splits': splits}, separators=(',', ':')))
