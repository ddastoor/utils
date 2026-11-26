#!/usr/bin/env python3
"""Reference decryptor for SuperUtils "Sodium Encrypt" files (USODIUM1 format).

Usage:  pip install pynacl
        python3 sodium_decrypt.py secret.pdf.usodium [output_file]
        python3 sodium_decrypt.py --text 'BASE64...'
The password is asked for at a terminal; from a pipe or a script it is the first line of the standard input
(echo "$PASSWORD" | python3 sodium_decrypt.py file.usodium).
The format is documented in docs/sodium-format.md.
"""
import base64, getpass, struct, sys
from nacl import pwhash, bindings

MAGIC, CHUNK_OVERHEAD, HEADER_LEN = b"USODIUM1", 17, 61


def decrypt(blob: bytes, password: bytes) -> bytes:
    if blob[:8] != MAGIC or blob[8] != 2:
        raise SystemExit("not a USODIUM1 file")
    ops, mem_kib, chunk = struct.unpack_from("<III", blob, 9)
    salt, header = blob[21:37], blob[37:61]
    key = pwhash.argon2id.kdf(32, password, salt, opslimit=ops, memlimit=mem_kib * 1024)
    state = bindings.crypto_secretstream_xchacha20poly1305_state()
    bindings.crypto_secretstream_xchacha20poly1305_init_pull(state, header, key)
    out, off, final = bytearray(), HEADER_LEN, False
    while off < len(blob):
        c = blob[off:off + chunk + CHUNK_OVERHEAD]
        off += len(c)
        m, tag = bindings.crypto_secretstream_xchacha20poly1305_pull(state, c, None)
        out += m
        if tag == bindings.crypto_secretstream_xchacha20poly1305_TAG_FINAL:
            final = True
            break
    if not final:
        raise SystemExit("file is truncated")
    if off != len(blob):
        raise SystemExit("unexpected data after the final chunk")
    return bytes(out)


def password() -> bytes:
    """At a terminal: asked for, not shown. Otherwise the first line of the standard input — getpass reads the console
    on Windows and the terminal on Linux, never a pipe, so a script that pipes the password in would wait for ever."""
    if sys.stdin is not None and not sys.stdin.isatty():
        return sys.stdin.readline().rstrip("\r\n").encode()
    return getpass.getpass().encode()


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--text":
        print(decrypt(base64.b64decode(sys.argv[2]), password()).decode())
    elif len(sys.argv) >= 2:
        src = sys.argv[1]
        dst = sys.argv[2] if len(sys.argv) > 2 else (src[:-8] if src.endswith(".usodium") else src + ".dec")
        data = decrypt(open(src, "rb").read(), password())
        open(dst, "wb").write(data)
        print(f"wrote {dst} ({len(data)} bytes)")
    else:
        print(__doc__)
