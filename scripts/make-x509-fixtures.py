# Makes tests/fixtures/x509/: throw-away certificates (no private keys are kept) with OpenSSL, and expected.json with what
# OpenSSL itself reports for each (fingerprints, dates, key size, names). Used by tests/unit/devcore.test.mjs and
# tests/e2e/x509.e2e.mjs.   Run: python3 scripts/make-x509-fixtures.py   (needs the openssl command and Python cryptography)
import json, os, re, subprocess, tempfile, calendar, time, hashlib, base64
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures', 'x509'); os.makedirs(OUT, exist_ok=True)
W = tempfile.mkdtemp()
def o(*a, **k): return subprocess.run(['openssl', *a], cwd=W, check=True, capture_output=True, **k).stdout.decode()
ext = '''[v3_ca]\nbasicConstraints=critical,CA:TRUE,pathlen:1\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n
[v3_leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth,clientAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n
subjectAltName=DNS:example.in,DNS:*.example.in,IP:192.0.2.7,IP:2001:db8::7,email:admin@example.in,URI:https://example.in/id\ncrlDistributionPoints=URI:http://crl.example.in/ca.crl\nauthorityInfoAccess=OCSP;URI:http://ocsp.example.in,caIssuers;URI:http://example.in/ca.crt\ncertificatePolicies=2.23.140.1.2.1\n
[v3_req]\nsubjectAltName=DNS:csr.example.in,DNS:www.csr.example.in\n'''
open(os.path.join(W, 'ext.cnf'), 'w').write(ext)
o('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '3650', '-subj', '/C=IN/ST=Maharashtra/O=SuperTools Test CA/CN=SuperTools Test Root', '-config', '/etc/ssl/openssl.cnf', '-extensions', 'v3_ca', '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:1')
o('req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', 'leaf.key', '-out', 'leaf.csr', '-subj', '/C=IN/L=Mumbai/O=Example Pvt Ltd/CN=example.in')
o('x509', '-req', '-in', 'leaf.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-set_serial', '0x00FFEEDDCCBBAA998877665544332211', '-days', '397', '-sha384', '-extfile', 'ext.cnf', '-extensions', 'v3_leaf', '-out', 'leaf.pem')
o('req', '-x509', '-newkey', 'ed25519', '-nodes', '-keyout', 'ed.key', '-out', 'ed25519.pem', '-days', '90', '-subj', '/CN=ed25519.example.in')
o('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-521', '-nodes', '-keyout', 'p521.key', '-out', 'p521.pem', '-days', '90', '-subj', '/CN=p521.example.in')
o('req', '-x509', '-newkey', 'rsa-pss', '-pkeyopt', 'rsa_keygen_bits:2048', '-nodes', '-keyout', 'pss.key', '-out', 'pss.pem', '-days', '90', '-subj', '/CN=pss.example.in')
# dates OpenSSL 3.0's req cannot set: "never expires" (31 Dec 9999) and a certificate that expired long ago — made with Python cryptography
from cryptography import x509 as cx
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
import datetime
for fname, cn, nb, na in [('forever.pem', 'forever.example.in', datetime.datetime(1970, 1, 1), datetime.datetime(9999, 12, 31, 23, 59, 59)), ('expired.pem', 'expired.example.in', datetime.datetime(2001, 1, 1), datetime.datetime(2002, 1, 1))]:
    k = ec.generate_private_key(ec.SECP256R1()); n = cx.Name([cx.NameAttribute(NameOID.COMMON_NAME, cn)])
    c = cx.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(7).not_valid_before(nb).not_valid_after(na).sign(k, hashes.SHA256())
    open(os.path.join(W, fname), 'wb').write(c.public_bytes(serialization.Encoding.PEM))
o('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'u.key', '-out', 'utf8.pem', '-days', '90', '-utf8', '-subj', '/C=IN/O=उदाहरण प्रा. लि./CN=Zoë’s café')
o('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'r.key', '-out', 'request.csr', '-subj', '/C=IN/O=Example Pvt Ltd/CN=csr.example.in', '-addext', 'subjectAltName=DNS:csr.example.in,DNS:www.csr.example.in')
o('crl2pkcs7', '-nocrl', '-certfile', 'leaf.pem', '-certfile', 'ca.pem', '-out', 'chain.p7b')
o('crl2pkcs7', '-nocrl', '-certfile', 'leaf.pem', '-certfile', 'ca.pem', '-outform', 'DER', '-out', 'chain.der.p7b')
o('x509', '-in', 'leaf.pem', '-outform', 'DER', '-out', 'leaf.der'); o('x509', '-in', 'leaf.pem', '-pubkey', '-noout', '-out', 'x'); open(os.path.join(W, 'leaf.pub.pem'), 'w').write(o('x509', '-in', 'leaf.pem', '-pubkey', '-noout'))
open(os.path.join(W, 'chain.pem'), 'w').write(open(os.path.join(W, 'leaf.pem')).read() + open(os.path.join(W, 'ca.pem')).read())
def ts(s): return calendar.timegm(time.strptime(s.strip(), '%b %d %H:%M:%S %Y GMT'))
exp = {}
for name in ['ca.pem', 'leaf.pem', 'ed25519.pem', 'p521.pem', 'pss.pem', 'forever.pem', 'expired.pem', 'utf8.pem']:
    if not os.path.exists(os.path.join(W, name)): continue
    text = o('x509', '-in', name, '-noout', '-text'); bits = re.search(r'Public-Key: \((\d+) bit', text)
    der = subprocess.run(['openssl', 'x509', '-in', name, '-outform', 'DER'], cwd=W, check=True, capture_output=True).stdout
    spki = subprocess.run('openssl x509 -in %s -pubkey -noout | openssl pkey -pubin -outform DER' % name, cwd=W, shell=True, check=True, capture_output=True).stdout
    exp[name] = {'sha256': o('x509', '-in', name, '-noout', '-fingerprint', '-sha256').split('=')[1].strip(), 'sha1': o('x509', '-in', name, '-noout', '-fingerprint', '-sha1').split('=')[1].strip(),
                 'serial': o('x509', '-in', name, '-noout', '-serial').split('=')[1].strip(), 'notBefore': ts(o('x509', '-in', name, '-noout', '-startdate').split('=')[1]), 'notAfter': ts(o('x509', '-in', name, '-noout', '-enddate').split('=')[1]),
                 'bits': int(bits.group(1)) if bits else None, 'sigAlg': re.search(r'Signature Algorithm: (\S+)', text).group(1), 'subject': o('x509', '-in', name, '-noout', '-subject', '-nameopt', 'RFC2253,-esc_msb,utf8').split('=', 1)[1].strip(),
                 'issuer': o('x509', '-in', name, '-noout', '-issuer', '-nameopt', 'RFC2253,-esc_msb,utf8').split('=', 1)[1].strip(), 'ca': 'CA:TRUE' in text, 'size': len(der), 'spkiSha256': hashlib.sha256(spki).hexdigest(), 'pin': base64.b64encode(hashlib.sha256(spki).digest()).decode()}
exp['request.csr'] = {'bits': 2048, 'subject': o('req', '-in', 'request.csr', '-noout', '-subject', '-nameopt', 'RFC2253').split('=', 1)[1].strip()}
for f in ['ca.pem', 'leaf.pem', 'ed25519.pem', 'p521.pem', 'pss.pem', 'forever.pem', 'expired.pem', 'utf8.pem', 'request.csr', 'chain.p7b', 'chain.der.p7b', 'leaf.der', 'leaf.pub.pem', 'chain.pem']:
    if os.path.exists(os.path.join(W, f)): open(os.path.join(OUT, f), 'wb').write(open(os.path.join(W, f), 'rb').read())
json.dump(exp, open(os.path.join(OUT, 'expected.json'), 'w'), indent=1, ensure_ascii=False)
print(sorted(os.listdir(OUT)))
