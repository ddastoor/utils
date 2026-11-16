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
