# USODIUM1 — Sodium Encrypt file format

Used by the **Sodium Encrypt** and **Encrypted Share Link** tools. All integers little-endian.

| Offset | Size | Field |
|---|---|---|
| 0 | 8 | magic `USODIUM1` (ASCII) |
| 8 | 1 | KDF id: `2` = Argon2id v1.3 (`crypto_pwhash_ALG_ARGON2ID13`) |
| 9 | 4 | `opslimit` |
| 13 | 4 | `memlimit` in KiB |
| 17 | 4 | plaintext chunk size (65536) |
| 21 | 16 | salt (random) |
| 37 | 24 | `crypto_secretstream_xchacha20poly1305` header |
| 61 | … | ciphertext chunks |

Key = `crypto_pwhash(32 bytes, password (UTF-8), salt, opslimit, memlimit, ARGON2ID13)`.
Each chunk = `crypto_secretstream_xchacha20poly1305_push(plaintext[chunk], ad = empty)`, i.e. plaintext length + 17
bytes. The last chunk carries `TAG_FINAL`; data after it, or a missing final tag, is rejected. Wrong parameters in the
header derive a wrong key, so the first chunk fails to authenticate. Text mode = Base64 of the same bytes; share
links carry it as Base64url after `#/sharelink?d=`.

Reference decryptor: `tools/sodium_decrypt.py` (PyNaCl).
