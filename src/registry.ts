// Every tool (tab) in the app. Each utility is its own tab inside a category tab.
// `kw` = search keywords. `platform`: 'both' (default), 'pc' (desktop only, hidden on phones) or
// 'mobile' (phone only, hidden on desktop).
import type { Mount } from './ui';

export type CatId = 'images' | 'documents' | 'security' | 'media' | 'calculators' | 'math' | 'text' | 'software' | 'codes' | 'everyday' | 'device';

export type Platform = 'both' | 'pc' | 'mobile';
export interface Category { id: CatId; title: string; icon: string }
export interface Tool {
  id: string;
  title: string;
  desc: string;
  cat: CatId;
  icon: string;
  kw: string[];
  platform: Platform;
  load: () => Promise<Mount>;
}

export const CATEGORIES: Category[] = [
  { id: 'images', title: 'Images', icon: 'Image' },
  { id: 'documents', title: 'Documents', icon: 'FileText' },
  { id: 'security', title: 'Security', icon: 'ShieldCheck' },
  { id: 'media', title: 'Media', icon: 'Clapperboard' },
  { id: 'calculators', title: 'Calculators', icon: 'Calculator' },
  { id: 'math', title: 'Math & Science', icon: 'Sigma' },
  { id: 'text', title: 'Text', icon: 'LetterText' },
  { id: 'software', title: 'Software', icon: 'SquareTerminal' },
  { id: 'codes', title: 'Codes & Files', icon: 'QrCode' },
  { id: 'everyday', title: 'Everyday', icon: 'Timer' },
  { id: 'device', title: 'Device', icon: 'Smartphone' },
];

const t = (
  id: string, title: string, desc: string, cat: CatId, icon: string,
  load: () => Promise<Mount>, platform: Platform = 'both',
): Tool => ({ id, title, desc, cat, icon, kw: [], load, platform });

const img = () => import('./tools/images');
const canv = () => import('./tools/canvas-tools');
const pdf = () => import('./tools/pdf');
const sec = () => import('./tools/security');
const calcs = () => import('./tools/calculators');
const text = () => import('./tools/text');
const swData = () => import('./tools/software/data');
const swDev1 = () => import('./tools/software/dev1');
const swNet = () => import('./tools/software/net');
const swMisc = () => import('./tools/software/misc');
const codes = () => import('./tools/codes');
const files = () => import('./tools/archive');
const every = () => import('./tools/everyday');
const math = () => import('./tools/math');
const fin = () => import('./tools/finance2');
const docgen = () => import('./tools/docgen');
const swRef = () => import('./tools/software/ref');
const swBits = () => import('./tools/software/bits');
const swWeb = () => import('./tools/software/web');
const dev = () => import('./tools/device');

export const TOOLS: Tool[] = [
  // ---------------------------------------------------------------- Images
  t('image', 'Image Editor', 'Crop, rotate, adjust colours and reduce file size.', 'images', 'SlidersHorizontal', () => import('./tools/image-editor').then((m) => m.mount)),
  t('batch', 'Batch Images', 'Resize and convert many images at once.', 'images', 'Images', () => import('./tools/batch').then((m) => m.mount), 'pc'),
  t('heic', 'HEIC → JPG', 'Convert iPhone HEIC/HEIF photos to JPG or PNG.', 'images', 'FileImage', () => import('./tools/heic').then((m) => m.mount)),
  t('passport', 'Passport Photo', 'Take or upload a photo; white background; Indian & world sizes.', 'images', 'SquareUser', () => import('./tools/passport').then((m) => m.mount)),
  t('formphoto', 'Photo & Signature Resizer', 'Exact pixel size and KB limits for exam and job forms.', 'images', 'IdCard', () => import('./tools/formphoto').then((m) => m.mount)),
  t('bgremove', 'Background Remover', 'Remove or replace the background of a portrait.', 'images', 'Eraser', () => import('./tools/bgremove').then((m) => m.mount)),
  t('cartoon', 'Cartoonizer', 'Turn a photo into a cartoon, painting or sketch.', 'images', 'Palette', () => import('./tools/cartoon').then((m) => m.mount)),
  t('redact', 'Blur & Redact', 'Blur faces or hide parts of an image before sharing.', 'images', 'EyeOff', () => import('./tools/redact').then((m) => m.mount)),
  t('watermark', 'Watermark', 'Add a text or logo watermark to photos.', 'images', 'Stamp', () => canv().then((m) => m.watermark)),
  t('caption', 'Text on Image', 'Add captions or meme text to a picture.', 'images', 'Type', () => canv().then((m) => m.caption)),
  t('collage', 'Collage Maker', 'Combine photos into a grid.', 'images', 'LayoutGrid', () => canv().then((m) => m.collage)),
  t('exif', 'EXIF / Photo Info', 'See hidden photo details (camera, date, GPS) and strip them.', 'images', 'Info', () => img().then((m) => m.exif)),
  t('scanner', 'Doc Scanner', 'Photograph documents, straighten and clean them, save as PDF.', 'images', 'ScanLine', () => import('./tools/scanner').then((m) => m.mount)),
  t('clipper', 'Newspaper Clipper', 'Photograph a newspaper page and clip one article: its columns in order, as one picture, a PDF or its text.', 'images', 'Newspaper', () => import('./tools/clipper').then((m) => m.mount)),
  t('bookflat', 'Book Page Flattener', 'Photograph an open book: the curved pages flattened, split and straightened.', 'images', 'BookOpen', () => import('./tools/bookflat').then((m) => m.mount)),
  t('ocr', 'OCR', 'Extract text from an image (English, French, Spanish, German).', 'images', 'ScanText', () => import('./tools/ocr').then((m) => m.mount)),
  t('signature', 'Signature Maker', 'Draw your signature and save a transparent PNG.', 'images', 'PenLine', () => import('./tools/signature').then((m) => m.mount)),

  // ---------------------------------------------------------------- Documents
  t('pdf-merge', 'Merge PDF', 'Combine several PDFs into one.', 'documents', 'Merge', () => pdf().then((m) => m.merge)),
  t('pdf-split', 'Split PDF', 'Split a PDF into parts or pick pages.', 'documents', 'Split', () => pdf().then((m) => m.split)),
  t('pdf-organize', 'Organize PDF', 'Reorder, rotate and delete pages.', 'documents', 'Layers', () => pdf().then((m) => m.organize)),
  t('img2pdf', 'Images → PDF', 'Turn photos into a PDF.', 'documents', 'FileInput', () => pdf().then((m) => m.img2pdf)),
  t('pdf2img', 'PDF → Images', 'Save PDF pages as JPG or PNG.', 'documents', 'FileOutput', () => pdf().then((m) => m.pdf2img)),
  t('pdf-compress', 'Compress PDF', 'Make a PDF smaller, optionally under a size limit.', 'documents', 'Minimize2', () => import('./tools/pdf-compress').then((m) => m.mount)),
  t('pdf-sign', 'Sign PDF', 'Draw or type your signature and place it on a PDF.', 'documents', 'Signature', () => import('./tools/pdf-sign').then((m) => m.sign)),
  t('pdf-fill', 'Fill PDF Form', 'Fill in PDF form fields or type on any PDF.', 'documents', 'ClipboardPen', () => import('./tools/pdf-sign').then((m) => m.fill)),
  t('pdf-unlock', 'Unlock PDF', 'Remove the password from a PDF you can open.', 'documents', 'LockOpen', () => import('./tools/pdf-secure').then((m) => m.unlock)),
  t('pdf-protect', 'Protect PDF', 'Add a password to a PDF (AES-256).', 'documents', 'FileLock', () => import('./tools/pdf-secure').then((m) => m.protect)),
  t('pdf2text', 'PDF → Text', 'Extract all text from a PDF.', 'documents', 'FileText', () => pdf().then((m) => m.pdf2text)),
  t('pdf-pagenum', 'PDF Page Numbers', 'Add page numbers to a PDF.', 'documents', 'ListOrdered', () => pdf().then((m) => m.pagenum)),
  t('pdf-watermark', 'PDF Watermark', 'Stamp text like CONFIDENTIAL on every page.', 'documents', 'Droplet', () => pdf().then((m) => m.watermark)),
  t('epub', 'PDF → EPUB', 'Convert PDFs to Kindle-friendly EPUB, column by column.', 'documents', 'BookOpen', () => import('./tools/epub/epub').then((m) => m.mount), 'pc'),
  t('sheet', 'CSV / Excel', 'View CSV and Excel files; convert CSV ⇄ XLSX ⇄ JSON.', 'documents', 'Sheet', () => import('./tools/sheet').then((m) => m.mount), 'pc'),
  t('markdown', 'Markdown Editor', 'Write Markdown with live preview; export HTML or PDF.', 'documents', 'NotebookPen', () => import('./tools/markdown').then((m) => m.mount)),
  t('invoice', 'GST Invoice', 'Create a GST invoice and save it as PDF.', 'documents', 'ReceiptText', () => docgen().then((m) => m.invoice)),
  t('rent', 'Rent Receipt', 'Monthly rent receipts for HRA claims.', 'documents', 'House', () => docgen().then((m) => m.rent)),
  t('resume', 'Resume Builder', 'Fill a form and get a clean PDF resume.', 'documents', 'FileUser', () => docgen().then((m) => m.resume)),

  // ---------------------------------------------------------------- Security
  t('pgp', 'OpenPGP', 'Keys, encrypt, decrypt, sign and verify (GnuPG compatible).', 'security', 'KeyRound', () => import('./tools/pgp').then((m) => m.mount)),
  t('sodium', 'Sodium Encrypt', 'Password-encrypt files or text (Argon2id + XChaCha20).', 'security', 'Lock', () => sec().then((m) => m.sodium)),
  t('sharelink', 'Encrypted Share Link', 'Turn a secret message into a password-protected link.', 'security', 'Link', () => sec().then((m) => m.sharelink)),
  t('hash', 'Hash / Checksum', 'SHA-256, MD5, SHA-3, BLAKE2/3, CRC, xxHash of files or text — and check a download against its checksum.', 'security', 'Fingerprint', () => sec().then((m) => m.hash)),
  t('password', 'Password Generator', 'Strong random passwords.', 'security', 'Asterisk', () => sec().then((m) => m.password)),
  t('passphrase', 'Passphrase Generator', 'Memorable diceware passphrases.', 'security', 'BookKey', () => sec().then((m) => m.passphrase)),

  // ---------------------------------------------------------------- Media
  t('video', 'Video Compressor', 'Shrink videos to a target size (e.g. for WhatsApp).', 'media', 'Video', () => import('./tools/video').then((m) => m.mount)),
  t('audio', 'Audio Recorder', 'Record your voice, trim, and save.', 'media', 'AudioWaveform', () => import('./tools/audio').then((m) => m.mount)),
  t('tts', 'Text-to-Speech', 'Read text aloud with on-device voices.', 'media', 'AudioLines', () => import('./tools/tts').then((m) => m.mount)),
  t('noise', 'Noise Remover', 'Remove background noise from voice recordings.', 'media', 'AudioWaveform', () => import('./tools/noise').then((m) => m.mount)),
  t('pitch', 'Pitch & Speed', 'Change tempo or pitch of audio independently.', 'media', 'Gauge', () => import('./tools/pitch').then((m) => m.mount)),
  t('slideshow', 'Slideshow Maker', 'Photos + music → MP4 video.', 'media', 'GalleryHorizontal', () => import('./tools/slideshow').then((m) => m.mount)),

  t('ffmpeg', 'FFmpeg', 'Convert, trim, extract audio, compress — FFmpeg in your browser.', 'media', 'Clapperboard', () => import('./tools/ffmpeg').then((m) => m.mount), 'pc'),
  t('screencast', 'Screencast', 'Record your screen, a window, a tab or an area to MP4.', 'media', 'MonitorPlay', () => import('./tools/screencast').then((m) => m.mount), 'pc'),
  t('screenshot', 'Screenshot', 'Delayed screenshots of a screen, window, tab or area.', 'media', 'Camera', () => import('./tools/screenshot').then((m) => m.mount), 'pc'),
  t('youtube', 'YouTube Clip', 'Clip a YouTube video between two times to MP4.', 'media', 'Film', () => import('./tools/youtube').then((m) => m.mount), 'pc'),

  // ---------------------------------------------------------------- Calculators
  t('calc', 'Scientific Calculator', 'Scientific calculator with history.', 'calculators', 'Calculator', () => import('./tools/calc').then((m) => m.mount)),
  t('units', 'Unit Converter', 'Length, weight, temperature, area, volume, speed, data…', 'calculators', 'ArrowLeftRight', () => calcs().then((m) => m.units)),
  t('dates', 'Date Calculator', 'Days between dates, add days, age, weekday.', 'calculators', 'CalendarDays', () => calcs().then((m) => m.dates)),
  t('emi', 'EMI Calculator', 'Loan EMI with amortisation schedule.', 'calculators', 'Landmark', () => calcs().then((m) => m.emi)),
  t('gst', 'GST Calculator', 'Add or remove GST at any rate, to the paisa: CGST + SGST or IGST.', 'calculators', 'Receipt', () => calcs().then((m) => m.gst)),
  t('sip', 'SIP Calculator', 'Mutual fund SIP / lumpsum returns.', 'calculators', 'TrendingUp', () => calcs().then((m) => m.sip)),
  t('fd', 'FD / RD Calculator', 'Fixed and recurring deposit maturity.', 'calculators', 'PiggyBank', () => calcs().then((m) => m.fd)),
  t('percent', 'Percentage Calculator', 'X% of Y, % change, what percent, discount, the whole from a part.', 'calculators', 'Percent', () => calcs().then((m) => m.percent)),
  t('words', 'Number to Words', 'Amount in words — lakh/crore or million.', 'calculators', 'IndianRupee', () => calcs().then((m) => m.words)),
  t('timezone', 'Time Zone Converter', 'Convert a time between any two zones, with the world\'s cities beside it.', 'calculators', 'Globe', () => calcs().then((m) => m.timezone)),
  t('bmi', 'BMI Calculator', 'Body mass index, with Indian and WHO cut-offs and your healthy weight range.', 'calculators', 'Scale', () => calcs().then((m) => m.bmi)),
  t('calories', 'Calorie Calculator', 'BMR and daily calories (TDEE).', 'calculators', 'Flame', () => calcs().then((m) => m.calories)),
  t('duedate', 'Pregnancy Due Date', 'Estimated due date and week.', 'calculators', 'Baby', () => calcs().then((m) => m.duedate)),
  t('tip', 'Tip & Bill Splitter', 'Split a bill with tip among people.', 'calculators', 'HandCoins', () => calcs().then((m) => m.tip)),
  t('fuel', 'Fuel Cost Calculator', 'Trip fuel cost and mileage.', 'calculators', 'Fuel', () => calcs().then((m) => m.fuel)),
  t('gpa', 'GPA Calculator', 'GPA / CGPA from grades and credits; CGPA to %.', 'calculators', 'GraduationCap', () => calcs().then((m) => m.gpa)),
  t('base', 'Number Base Converter', 'Binary, octal, decimal, hex.', 'calculators', 'Binary', () => calcs().then((m) => m.base)),
  t('roman', 'Roman Numerals', 'Convert to and from Roman numerals.', 'calculators', 'ScrollText', () => calcs().then((m) => m.roman)),
  t('prepay', 'Loan Prepayment', 'Interest and months saved by prepaying a loan — once or every year, shorter tenure or lower EMI.', 'calculators', 'BanknoteArrowDown', () => fin().then((m) => m.prepay)),
  t('ppf', 'PPF Calculator', 'Public Provident Fund: balance at maturity for a yearly deposit, 15 years and extensions.', 'calculators', 'Landmark', () => fin().then((m) => m.ppf)),
  t('epf', 'EPF Calculator', 'Employee Provident Fund corpus at retirement: your 12 %, the employer\'s share, the pension scheme, yearly interest.', 'calculators', 'Briefcase', () => fin().then((m) => m.epf)),
  t('nps', 'NPS Calculator', 'National Pension System: corpus at 60, lump sum, annuity and monthly pension.', 'calculators', 'Umbrella', () => fin().then((m) => m.nps)),
  t('inflation', 'Inflation Calculator', 'Future cost of things and what today\'s money will be worth, years for prices to double.', 'calculators', 'TrendingDown', () => fin().then((m) => m.inflation)),
  t('sleep', 'Sleep Cycle', 'Best times to go to bed or to wake up, in 90-minute sleep cycles — also from now.', 'calculators', 'Moon', () => fin().then((m) => m.sleep)),
  t('bodyfat', 'Body Fat', 'Body fat % from a tape measure (US Navy method), its class, fat and lean mass.', 'calculators', 'PersonStanding', () => fin().then((m) => m.bodyfat)),
  t('idealweight', 'Ideal Weight', 'Healthy weight range for a height (BMI) and ideal body weight by four formulas, kg or lb.', 'calculators', 'Weight', () => fin().then((m) => m.idealweight)),
  t('coords', 'Coordinates Converter', 'Decimal ⇄ degrees-minutes-seconds, and the distance and bearing between two points (WGS-84).', 'calculators', 'MapPin', () => fin().then((m) => m.coords)),

  // ---------------------------------------------------------------- Math & Science
  t('graph', 'Graphing Calculator', 'Plot up to six functions of x; zoom, pan, read values, save as PNG.', 'math', 'ChartSpline', () => math().then((m) => m.graph)),
  t('equation', 'Equation Solver', 'Any equation in x, quadratic, cubic and simultaneous linear equations — exact for the numbers typed.', 'math', 'Variable', () => math().then((m) => m.equation)),
  t('stats', 'Statistics', 'Mean, median, mode, quartiles, standard deviation, skewness; regression line and correlation.', 'math', 'ChartColumn', () => math().then((m) => m.stats)),
  t('matrix', 'Matrix Calculator', 'Add, multiply, invert, determinant, rank, powers — exact, in fractions or decimals.', 'math', 'Grid3x3', () => math().then((m) => m.matrix)),
  t('fraction', 'Fraction Calculator', 'Exact arithmetic with fractions and mixed numbers; repeating decimals.', 'math', 'Divide', () => math().then((m) => m.fraction)),
  t('primes', 'Prime / LCM / GCD', 'Prime check, prime factors, next prime, GCD (HCF) and LCM of whole numbers up to 64 bits.', 'math', 'Sigma', () => math().then((m) => m.primes)),
  t('periodic', 'Periodic Table', 'The 118 elements: search by symbol, name or number; mass, group, period, block, electron configuration.', 'math', 'Atom', () => math().then((m) => m.periodic)),

  // ---------------------------------------------------------------- Text
  t('wordcount', 'Word Counter', 'Words, characters, sentences, reading time.', 'text', 'WholeWord', () => text().then((m) => m.wordcount)),
  t('case', 'Case Converter', 'UPPER, lower, Title, camelCase, snake_case…', 'text', 'CaseSensitive', () => text().then((m) => m.caseConv)),
  t('lines', 'Line Tools', 'Sort, dedupe, trim, reverse, shuffle lines.', 'text', 'ListFilter', () => text().then((m) => m.lines)),
  t('replace', 'Find & Replace', 'Find and replace, with regex support.', 'text', 'Replace', () => text().then((m) => m.replace)),
  t('diff', 'Text Diff', 'Compare two texts side by side.', 'text', 'Diff', () => text().then((m) => m.diff)),
  t('json', 'JSON Formatter', 'Format, minify and validate JSON.', 'software', 'Braces', () => text().then((m) => m.json), 'pc'),
  t('regex', 'Regex Tester', 'Test regular expressions with live highlighting.', 'software', 'Regex', () => text().then((m) => m.regex), 'pc'),
  t('base64', 'Base64', 'Encode/decode Base64 text or files.', 'software', 'FileDigit', () => swDev1().then((m) => m.base64), 'pc'),
  t('urlenc', 'URL Encoder', 'Percent-encode or decode URLs; inspect query strings.', 'software', 'Link2', () => swDev1().then((m) => m.urlenc), 'pc'),
  t('epoch', 'Epoch Converter', 'Unix timestamp ⇄ date.', 'software', 'Clock', () => swDev1().then((m) => m.epoch), 'pc'),
  t('uuid', 'UUID Generator', 'UUID v4 and v7.', 'software', 'Hash', () => swDev1().then((m) => m.uuid), 'pc'),
  t('color', 'Color Converter', 'HEX, RGB, HSL, OKLCH with a picker.', 'software', 'Pipette', () => swDev1().then((m) => m.color), 'pc'),
  t('jwt', 'JWT Decoder', 'Decode JSON Web Tokens.', 'software', 'KeySquare', () => swDev1().then((m) => m.jwt), 'pc'),
  t('fancy', 'Fancy Text', 'Stylish Unicode text for bios and posts.', 'text', 'Sparkles', () => text().then((m) => m.fancy)),
  t('emoji', 'Emoji & Symbols', 'Search and copy emoji and symbols.', 'text', 'Smile', () => text().then((m) => m.emoji)),
  t('morse', 'Morse Code', 'Text ⇄ Morse, with sound.', 'text', 'Radio', () => text().then((m) => m.morse)),
  t('lorem', 'Lorem Ipsum', 'Placeholder text generator.', 'text', 'Text', () => text().then((m) => m.lorem)),
  t('photodict', 'Photo Dictionary', 'Photograph a page; get the hardest words with their dictionary meanings.', 'text', 'BookOpenText', () => import('./tools/photodict').then((m) => m.mount), 'both'),

  // ---------------------------------------------------------------- Software (all PC only)
  t('sqlite', 'SQLite Playground', 'Open a .db or CSV, run SQL, export results.', 'software', 'Database', () => swData().then((m) => m.sqlite), 'pc'),
  t('jq', 'jq Playground', 'Run jq filters on JSON.', 'software', 'Filter', () => swData().then((m) => m.jq), 'pc'),
  t('yaml', 'YAML ⇄ JSON ⇄ TOML', 'Convert and validate config formats.', 'software', 'FileCog', () => swData().then((m) => m.yaml), 'pc'),
  t('xml', 'XML Formatter / XPath', 'Pretty-print XML and evaluate XPath.', 'software', 'CodeXml', () => swData().then((m) => m.xml), 'pc'),
  t('json2types', 'JSON → Types', 'Generate TypeScript, Go, Rust, Java or Python types.', 'software', 'FileType', () => swData().then((m) => m.json2types), 'pc'),
  t('jsondiff', 'JSON Diff', 'Structural diff of two JSON documents.', 'software', 'GitCompare', () => swData().then((m) => m.jsondiff), 'pc'),
  t('sqlfmt', 'SQL Formatter', 'Format SQL for PostgreSQL, MySQL, SQLite, SQL Server and Oracle: clauses, indentation, keyword case — nothing else changes.', 'software', 'TextQuote', () => swData().then((m) => m.sqlfmt), 'pc'),
  t('prettier', 'Code Formatter', 'Tidy JS, TS, CSS, SCSS, HTML, JSON, YAML, Markdown, GraphQL and Vue.', 'software', 'Wand', () => swData().then((m) => m.prettier), 'pc'),
  t('mockdata', 'Mock Data Generator', 'Fake rows as JSON, CSV or SQL inserts.', 'software', 'DatabaseZap', () => swData().then((m) => m.mockdata), 'pc'),
  t('mdtable', 'Markdown Table', 'Build Markdown tables from a grid or CSV.', 'software', 'Table', () => swData().then((m) => m.mdtable), 'pc'),
  t('cidr', 'Subnet / CIDR Calculator', 'IPv4/IPv6 ranges, masks, hosts, subnetting.', 'software', 'Network', () => swNet().then((m) => m.cidr), 'pc'),
  t('chmod', 'chmod Calculator', 'Unix permissions ⇄ octal.', 'software', 'FileKey', () => swNet().then((m) => m.chmod), 'pc'),
  t('x509', 'Certificate Decoder', 'Decode X.509 certificates and CSRs (PEM/DER).', 'software', 'ShieldCheck', () => swNet().then((m) => m.x509), 'pc'),
  t('sshkey', 'SSH Key Generator', 'Ed25519 key pairs in OpenSSH format.', 'software', 'KeySquare', () => swNet().then((m) => m.sshkey), 'pc'),
  t('hmac', 'HMAC Generator', 'HMAC-SHA256/512 for webhook signatures.', 'software', 'BadgeCheck', () => swNet().then((m) => m.hmac), 'pc'),
  t('pwhash', 'Password Hash Tool', 'Generate and verify Argon2id, bcrypt, PBKDF2 hashes.', 'software', 'LockKeyhole', () => swNet().then((m) => m.pwhash), 'pc'),
  t('apikey', 'API Key Generator', 'Random secrets as hex, base64url, prefixed tokens.', 'software', 'KeyRound', () => swNet().then((m) => m.apikey), 'pc'),
  t('curl', 'cURL Converter', 'curl command → fetch, Python, Go, Node.', 'software', 'Terminal', () => swNet().then((m) => m.curl), 'pc'),
  t('cron', 'Cron Explainer', 'Explain cron expressions and list next runs.', 'software', 'CalendarClock', () => swMisc().then((m) => m.cron), 'pc'),
  t('escape', 'String Escape', 'Escape/unescape JSON, Java/C, SQL, shell, HTML, regex.', 'software', 'Quote', () => swMisc().then((m) => m.escape), 'pc'),
  t('unicode', 'Unicode Inspector', 'Code points; find invisible and look-alike characters.', 'software', 'Search', () => swMisc().then((m) => m.unicode), 'pc'),
  t('hexview', 'Hex Viewer', 'Hex dump any file; detect file type.', 'software', 'Binary', () => swMisc().then((m) => m.hexview), 'pc'),
  t('logview', 'Log Viewer', 'Filter logs by level/regex; parse JSON logs.', 'software', 'ScrollText', () => swMisc().then((m) => m.logview), 'pc'),
  t('mermaid', 'Mermaid Diagrams', 'Sequence, flow, ER, Gantt diagrams → SVG/PNG.', 'software', 'Workflow', () => swMisc().then((m) => m.mermaid), 'pc'),
  t('sla', 'SLA / Uptime Calculator', 'Allowed downtime for an availability target.', 'software', 'Activity', () => swMisc().then((m) => m.sla), 'pc'),
  t('transfer', 'Data Transfer Calculator', 'Size, bandwidth and transfer time.', 'software', 'Gauge', () => swMisc().then((m) => m.transfer), 'pc'),
  t('semver', 'Semver Checker', 'Check version ranges, compare and bump versions.', 'software', 'Tag', () => swMisc().then((m) => m.semver), 'pc'),
  t('glob', 'Glob Tester', 'Test glob patterns against paths.', 'software', 'FolderSearch', () => swMisc().then((m) => m.glob), 'pc'),
  t('terminal', 'Linux Terminal', 'BusyBox shell with an in-browser filesystem (upload/download files).', 'software', 'SquareTerminal', () => import('./tools/software/terminal').then((m) => m.mount), 'pc'),
  t('graphviz', 'Graphviz (DOT)', 'Draw graphs written in the DOT language: eight layout engines, SVG / PNG, positions as text.', 'software', 'Share2', () => import('./tools/software/graphviz').then((m) => m.mount), 'pc'),
  t('python', 'Python Scratchpad', 'Run Python 3.14 (CPython) in the browser.', 'software', 'FileCode', () => import('./tools/software/python').then((m) => m.mount), 'pc'),
  t('totp', 'TOTP / 2FA Codes', 'Generate one-time codes from a 2FA secret.', 'software', 'ShieldEllipsis', () => swNet().then((m) => m.totp), 'pc'),
  t('pwstrength', 'Password Strength', 'Estimate how hard a password is to crack.', 'software', 'ShieldQuestion', () => swNet().then((m) => m.pwstrength), 'pc'),
  t('jsonschema', 'JSON Schema', 'Validate JSON against a schema; infer a schema.', 'software', 'FileCheck', () => swData().then((m) => m.jsonschema), 'pc'),
  t('bitwise', 'Bitwise Calculator', 'AND, OR, XOR, shifts with a bit view.', 'software', 'ToggleRight', () => swBits().then((m) => m.bitwise), 'pc'),
  t('ieee754', 'IEEE-754 Inspector', 'How floats and doubles are stored.', 'software', 'Microchip', () => swBits().then((m) => m.ieee754), 'pc'),
  t('contrast', 'Contrast Checker', 'WCAG colour contrast ratio.', 'software', 'Contrast', () => swWeb().then((m) => m.contrast), 'pc'),
  t('baseenc', 'Base32 / Base58 / Ascii85', 'Encode and decode binary-to-text formats.', 'software', 'FileDigit', () => swBits().then((m) => m.baseenc), 'pc'),
  t('bindecode', 'Protobuf / MsgPack / CBOR', 'Decode binary messages without a schema.', 'software', 'Binary', () => swBits().then((m) => m.bindecode), 'pc'),
  t('httpstatus', 'HTTP Status Codes', 'What every HTTP status code means.', 'software', 'Server', () => swRef().then((m) => m.httpstatus), 'pc'),
  t('mime', 'MIME Types', 'File extension ⇄ MIME type lookup.', 'software', 'FileType2', () => swRef().then((m) => m.mime), 'pc'),
  t('ports', 'Port Numbers', 'Well-known TCP/UDP ports.', 'software', 'Cable', () => swRef().then((m) => m.ports), 'pc'),
  t('ascii', 'ASCII Table', 'ASCII codes in dec, hex, oct, binary.', 'software', 'Table2', () => swRef().then((m) => m.ascii), 'pc'),
  t('keycode', 'Key Codes', 'Inspect keyboard events (key, code, keyCode).', 'software', 'Command', () => swRef().then((m) => m.keycode), 'pc'),
  t('gradient', 'CSS Gradient', 'Build linear/radial gradients.', 'software', 'Blend', () => swWeb().then((m) => m.gradient), 'pc'),
  t('shadow', 'CSS Box Shadow', 'Design box shadows visually.', 'software', 'SquareDashed', () => swWeb().then((m) => m.shadow), 'pc'),
  t('svgo', 'SVG Optimizer', 'Minify SVG files.', 'software', 'PenTool', () => swWeb().then((m) => m.svgo), 'pc'),
  t('patch', 'Patch Applier', 'Apply a unified diff to text.', 'software', 'FileDiff', () => swMisc().then((m) => m.patch), 'pc'),

  // ---------------------------------------------------------------- Codes & Files
  t('qr', 'QR Generator', 'QR codes for links, Wi-Fi, UPI, contacts…', 'codes', 'QrCode', () => codes().then((m) => m.qr)),
  t('barcode', 'Barcode Generator', 'EAN, UPC, Code 128, Data Matrix, PDF417…', 'codes', 'Barcode', () => codes().then((m) => m.barcode)),
  t('scan', 'QR & Barcode Scanner', 'Scan with the camera or from an image.', 'codes', 'ScanQrCode', () => codes().then((m) => m.scan)),
  t('zip', 'Create Zip', 'Zip files, optionally with a password.', 'codes', 'FileArchive', () => files().then((m) => m.zip)),
  t('unzip', 'Extract Archive', 'Open zip, 7z, rar, tar, gz files.', 'codes', 'PackageOpen', () => files().then((m) => m.unzip)),

  // ---------------------------------------------------------------- Everyday
  t('stopwatch', 'Stopwatch', 'Stopwatch with laps.', 'everyday', 'Timer', () => every().then((m) => m.stopwatch)),
  t('countdown', 'Countdown Timer', 'Countdown with alarm.', 'everyday', 'Hourglass', () => every().then((m) => m.countdown)),
  t('pomodoro', 'Pomodoro', 'Focus / break cycles.', 'everyday', 'AlarmClock', () => every().then((m) => m.pomodoro)),
  t('interval', 'Interval Timer', 'Work/rest rounds for workouts.', 'everyday', 'Repeat', () => every().then((m) => m.interval)),
  t('dice', 'Dice Roller', 'Roll one or more dice.', 'everyday', 'Dices', () => every().then((m) => m.dice)),
  t('coin', 'Coin Flip', 'Heads or tails.', 'everyday', 'Coins', () => every().then((m) => m.coin)),
  t('rng', 'Random Number', 'Random numbers in a range.', 'everyday', 'Shuffle', () => every().then((m) => m.rng)),
  t('picker', 'List Picker', 'Pick random items from a list.', 'everyday', 'ListChecks', () => every().then((m) => m.picker)),
  t('teams', 'Team Splitter', 'Split names into random teams.', 'everyday', 'Users', () => every().then((m) => m.teams)),

  // ---------------------------------------------------------------- Device
  t('webcam', 'Webcam Test', 'Check your camera and its resolution.', 'device', 'Webcam', () => dev().then((m) => m.webcam)),
  t('mic', 'Microphone Test', 'Check your microphone level and playback.', 'device', 'Mic', () => dev().then((m) => m.mic)),
  t('speaker', 'Speaker Test', 'Left/right channel and frequency test.', 'device', 'Speaker', () => dev().then((m) => m.speaker)),
  t('keyboard', 'Keyboard Test', 'See which keys register.', 'device', 'Keyboard', () => dev().then((m) => m.keyboard), 'pc'),
  t('pixels', 'Dead Pixel Test', 'Full-screen colours to spot dead pixels.', 'device', 'Monitor', () => dev().then((m) => m.pixels)),
  t('touch', 'Touch Test', 'Draw to test the touchscreen.', 'device', 'Hand', () => dev().then((m) => m.touch), 'mobile'),
  t('screen', 'Screen Info', 'Resolution, pixel ratio, browser and device details.', 'device', 'MonitorSmartphone', () => dev().then((m) => m.screen)),
  t('level', 'Bubble Level', 'Spirit level using motion sensors.', 'device', 'Crosshair', () => dev().then((m) => m.level), 'mobile'),
  t('compass', 'Compass', 'Compass heading.', 'device', 'Compass', () => dev().then((m) => m.compass), 'mobile'),
  t('soundmeter', 'Sound Meter', 'Approximate noise level in dB.', 'device', 'Gauge', () => dev().then((m) => m.soundmeter)),
  t('ruler', 'Ruler', 'On-screen ruler (calibrate with a card).', 'device', 'Ruler', () => dev().then((m) => m.ruler)),
];

export const TOOL_BY_ID = new Map(TOOLS.map((x) => [x.id, x]));

/** The search keywords of every tab live in their own file (src/keywords.ts, 20 KB): the start page does not need
 *  them. The search box calls this the first time it is used; `kw` of every tool is filled then. */
let keywordsLoaded: Promise<void> | null = null;
export function loadKeywords(): Promise<void> {
  return (keywordsLoaded ||= import('./keywords').then(({ KEYWORDS }) => {
    for (const tool of TOOLS) tool.kw = (KEYWORDS[tool.id] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }));
}

