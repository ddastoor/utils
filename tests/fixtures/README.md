# Test fixtures (real media)

Regenerate with `node scripts/make-fixtures.mjs` (downloads pinned sdists, verifies SHA-256, extracts files, and
generates media with the project's own ffmpeg.wasm and Chromium). Used only by tests — never shipped in the site.

| File | Source | Licence |
|---|---|---|
| images/astronaut.png | scikit-image 0.26.0 sample data (NASA portrait of Eileen Collins) | Public domain (NASA) |
| images/chelsea.png | scikit-image 0.26.0 sample data (cat photo) | CC0 |
| images/coffee.png | scikit-image 0.26.0 sample data | CC0 |
| images/page.png, images/text.png | scikit-image 0.26.0 sample data (scanned page, text) | scikit-image BSD-3 data |
| images/coffee.jpg | coffee.png → JPEG q90 (Chromium) | CC0 |
| images/coffee-orientation6.jpg | coffee rotated 90° CCW + EXIF Orientation=6 (displays upright) | CC0 |
| images/coffee-gps.jpg | coffee.jpg + valid EXIF (make/model/exposure/ISO/date) + GPS 18°55′19.56″N 72°50′4.8″E | CC0 |
| images/exif_gps.jpg, images/flower.jpg | Pillow 13.0.0 test images (real EXIF / GPS) | Pillow (MIT-CMU) |
| images/pug.heic, images/xiaomi.heic | pillow-heif 1.8.1 test images (real HEIC photos) | pillow-heif test data (BSD-3) |
| pdf/crazyones.pdf, form.pdf, two-different-pages.pdf, side-by-side-subfig.pdf, jpeg.pdf | pypdf 7.1.0 test resources | pypdf test data (BSD-3) |
| pdf/vicksburg-ocr.pdf | pypdf 7.1.0 test resource (scanned book pages with an OCR text layer, running headers) | pypdf test data (BSD-3; public-domain book) |
| pdf/two-column-paper.pdf | `node scripts/make-paper-pdf.mjs`: original text, two columns, figure (chelsea.png), running header/footer | CC0 (text), CC0 (image) |
| pdf/rc4-128-asdfzxcv.pdf, aes128-asdfzxcv.pdf, aes256-asdfzxcv.pdf | pypdf 7.1.0 encryption tests (user password `asdfzxcv`) | pypdf test data (BSD-3) |
| images/book-page.jpg | `node scripts/make-page-photo.mjs`: original paragraph written for this project, set in Literata (OFL), then "photographed" (tilt, keystone, uneven light, shadow, blur, noise, JPEG) | CC0 (text), OFL (font) |
| sheets/base.{xlsx,xls,xlsb,ods}, any_sheets.xlsx, password.xlsx, empty_file.xlsx | python-calamine 0.9.1 test data (real Excel / LibreOffice files) | MIT |
| media/clip.mp4 | ffmpeg.wasm: testsrc2 640×360 3 s + 440 Hz, H.264/AAC | generated |
| media/clip.webm | same, VP8/Vorbis | generated |
| media/tone.wav, tone.mp3, noisy-tone.wav | ffmpeg.wasm sine (+ white noise) | generated |
| speech/librispeech-1.flac | LibriSpeech test-clean 1089-134686-0000 via huggingface.co/datasets/Narsil/asr_dummy (SHA-256 pinned): "He hoped there would be stew for dinner, turnips and carrots and bruised potatoes and fat mutton pieces to be ladled out in thick peppered flour fattened sauce." | CC BY 4.0 (LibriSpeech, Panayotov et al.) |
| speech/jfk.flac | JFK inaugural address excerpt via huggingface.co/datasets/Xenova/transformers.js-docs (pinned), 16 kHz mono FLAC (our ffmpeg.wasm): "And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country." | public domain (US government work) |
| speech/noisy-speech.wav | librispeech-1 + seeded white noise at 5 dB SNR, 16 kHz mono (`node scripts/make-speech-fixtures.mjs`) | CC BY 4.0 (derived) |
| ssh/keys.json | OpenSSH key pairs made with Python `cryptography` 44 for the SSH Key tests: Ed25519 (plain, encrypted, UTF-8 passphrase), RSA 2048 (plain, encrypted), ECDSA P-256 and P-521 — each with its public line, SHA256 fingerprint and passphrase. Throw-away test keys, used nowhere else | generated |
| x509/*.pem, *.der, *.p7b, *.csr, expected.json | `python3 scripts/make-x509-fixtures.py` (OpenSSL 3 + Python `cryptography`): a test CA, a CA-signed leaf with every kind of SAN and extension, Ed25519 / P-521 / RSA-PSS / UTF-8-named / never-expiring / expired certificates, a CSR, PKCS #7 bundles (PEM + DER), a lone public key; `expected.json` = what OpenSSL reports for each. No private keys are kept | generated |
| cidr/reference.json | `python3 scripts/make-cidr-reference.py`: Python `ipaddress` (standard library) answers for 143 IPv4 and 99 IPv6 networks, 75 ranges and 12 subnet splits (seeded) | generated |
| zxcvbn/reference.json | `python3 scripts/make-zxcvbn-reference.py`: guesses, score and pattern kinds from the Python port of zxcvbn 4.5.0 (MIT) for 304 passwords + 6 with personal words | generated |
| glob/reference.json | `python3 scripts/make-glob-reference.py` (Python ≥ 3.13): which of 46 paths each of 420 patterns matches by `glob.translate(recursive=True, include_hidden=True)` (with the POSIX rule that a bracket expression never matches "/") | generated |
