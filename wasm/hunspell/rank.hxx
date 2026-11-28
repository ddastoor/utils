// The Spell Checker's order of suggestions: Hunspell's candidates, each scored by how common the word is in English (wordfreq's
// Zipf frequency — public/data/dict/freq.txt, the Photo Dictionary's list) and by how near it is to what was typed (a weighted edit
// distance), Hunspell's own order breaking ties. Fitted on half of codespell's list of common misspellings and tested on the other
// half (scripts/make-spell-reference.py, which holds a second implementation of these rules in Python):
//   score = Zipf − 3 × distance − 0.1 × Hunspell's rank − 1 if two words − 0.5 if capitalised where the typed word is not
//           + 2 if the dictionary's own table of misspellings (its REP lines: "alot" → "a lot") makes it of the typed word
// Two words ("a lot" for "alot") are as common as the two together would be by chance: Zipf₁ + Zipf₂ − 9. A word wordfreq does not
// know, and a part of one letter other than "a" and "i", counts as Zipf 0.5. The distance (optimal string alignment, on lower case):
// a letter for another 1, for the same letter with another accent 0.3, a vowel for a vowel 0.75, a key next to it 0.8 (QWERTY);
// a letter in or out 1, a doubled letter 0.5, a vowel 0.8, a space, hyphen or apostrophe 0.4; two letters swapped 0.9.
// Header-only: wasm/hunspell/glue.cxx (the module) and scripts/hunspell-ref/ref.cxx (the native reference) include it.
#pragma once
#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <set>
#include <string>
#include <vector>

namespace spellrank {

// ---------------------------------------------------------------- characters
static inline std::u32string decode(const std::string& s) {
  std::u32string out;
  size_t i = 0, n = s.size();
  while (i < n) {
    unsigned char c = (unsigned char)s[i];
    char32_t cp; int len;
    if (c < 0x80) { cp = c; len = 1; }
    else if ((c >> 5) == 6 && i + 1 < n) { cp = ((c & 0x1F) << 6) | (s[i + 1] & 0x3F); len = 2; }
    else if ((c >> 4) == 14 && i + 2 < n) { cp = ((c & 0x0F) << 12) | ((s[i + 1] & 0x3F) << 6) | (s[i + 2] & 0x3F); len = 3; }
    else if ((c >> 3) == 30 && i + 3 < n) { cp = ((c & 0x07) << 18) | ((s[i + 1] & 0x3F) << 12) | ((s[i + 2] & 0x3F) << 6) | (s[i + 3] & 0x3F); len = 4; }
    else { cp = 0xFFFD; len = 1; }
    out.push_back(cp); i += len;
  }
  return out;
}
static inline void encode(std::string& out, char32_t c) {
  if (c < 0x80) out += (char)c;
  else if (c < 0x800) { out += (char)(0xC0 | (c >> 6)); out += (char)(0x80 | (c & 0x3F)); }
  else if (c < 0x10000) { out += (char)(0xE0 | (c >> 12)); out += (char)(0x80 | ((c >> 6) & 0x3F)); out += (char)(0x80 | (c & 0x3F)); }
  else { out += (char)(0xF0 | (c >> 18)); out += (char)(0x80 | ((c >> 12) & 0x3F)); out += (char)(0x80 | ((c >> 6) & 0x3F)); out += (char)(0x80 | (c & 0x3F)); }
}
// upper case of Latin letters (Basic Latin, Latin-1, Latin Extended-A): what an English dictionary holds
static inline bool isUpper(char32_t c) {
  if (c >= 'A' && c <= 'Z') return true;
  if (c >= 0xC0 && c <= 0xDE) return c != 0xD7;
  if (c >= 0x100 && c <= 0x137) return c % 2 == 0;
  if (c >= 0x139 && c <= 0x148) return c % 2 == 1;
  if (c >= 0x14A && c <= 0x177) return c % 2 == 0;
  if (c == 0x178) return true;
  if (c >= 0x179 && c <= 0x17E) return c % 2 == 1;
  return false;
}
static inline char32_t lower(char32_t c) {
  if (!isUpper(c)) return c;
  if (c < 0x100) return c + 32;
  if (c == 0x178) return 0xFF;
  return c + 1;
}
// the letter without its accent (what NFD puts first), for lower-case letters
static inline char32_t base(char32_t c) {
  static const char* l1 = "aaaaaa\0ceeeeiiii\0nooooo\0\0uuuuy\0y"; // U+00E0 – U+00FF (æ, ð, ÷, ø, þ have none)
  if (c >= 0xE0 && c <= 0xFF) { char b = l1[c - 0xE0]; return b ? (char32_t)b : c; }
  if (c >= 0x100 && c <= 0x17F) {
    // U+0100 – U+017F in pairs (upper, lower): the base letter of each, '.' where NFD gives none
    static const char* xa = "aaaaaaccccccccdd..eeeeeeeeeegggggggghh..iiiiiiiii...jjkk.llllll....nnnnnn...oooooo..rrrrrrsssssssstttt..uuuuuuuuuuuuwwyyyzzzzzz.";
    size_t k = c - 0x100;
    if (k < strlen(xa) && xa[k] != '.') return (char32_t)xa[k];
  }
  return c;
}
static inline bool vowel(char32_t c) { return c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u' || c == 'y'; }
static inline bool keyPos(char32_t c, int& row, double& x) {
  static const char* rows[3] = { "qwertyuiop", "asdfghjkl", "zxcvbnm" };
  static const double off[3] = { 0, 0.25, 0.75 };
  for (int r = 0; r < 3; r++) for (int i = 0; rows[r][i]; i++) if ((char32_t)rows[r][i] == c) { row = r; x = i + off[r]; return true; }
  return false;
}
static inline bool nextKey(char32_t a, char32_t b) {
  int r1, r2; double x1, x2;
  if (a == b || !keyPos(a, r1, x1) || !keyPos(b, r2, x2)) return false;
  return std::abs(r1 - r2) <= 1 && std::abs(x1 - x2) <= 1;
}

// ---------------------------------------------------------------- the distance
static inline double sub(char32_t a, char32_t b) {
  if (a == b) return 0;
  if (base(a) == base(b)) return 0.3;
  if (vowel(a) && vowel(b)) return 0.75;
  if (nextKey(a, b)) return 0.8;
  return 1.0;
}
static inline double indel(const std::u32string& s, size_t k) {
  char32_t c = s[k];
  if (c == ' ' || c == '-' || c == '\'') return 0.4;
  if ((k > 0 && s[k - 1] == c) || (k + 1 < s.size() && s[k + 1] == c)) return 0.5;
  if (vowel(c)) return 0.8;
  return 1.0;
}
static inline double distance(const std::u32string& a, const std::u32string& b) {
  size_t n = a.size(), m = b.size();
  std::vector<double> d((n + 1) * (m + 1), 0.0);
  auto at = [&](size_t i, size_t j) -> double& { return d[i * (m + 1) + j]; };
  for (size_t i = 1; i <= n; i++) at(i, 0) = at(i - 1, 0) + indel(a, i - 1);
  for (size_t j = 1; j <= m; j++) at(0, j) = at(0, j - 1) + indel(b, j - 1);
  for (size_t i = 1; i <= n; i++)
    for (size_t j = 1; j <= m; j++) {
      double v = std::min(std::min(at(i - 1, j) + indel(a, i - 1), at(i, j - 1) + indel(b, j - 1)), at(i - 1, j - 1) + sub(a[i - 1], b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] && a[i - 1] != a[i - 2]) v = std::min(v, at(i - 2, j - 2) + 0.9);
      at(i, j) = v;
    }
  return at(n, m);
}

// ---------------------------------------------------------------- word frequencies
// freq.txt: a line per Zipf × 10, most frequent first: "77 the" / "74 to and of a" …; a word keeps its first (highest) value
struct Freq {
  std::string text; std::vector<uint32_t> slot; std::vector<uint8_t> z; uint32_t cap = 0;
  static uint32_t fnv(const char* s, size_t n) { uint32_t h = 2166136261u; for (size_t i = 0; i < n; i++) { h ^= (uint8_t)s[i]; h *= 16777619u; } return h; }
  int load(const char* txt, size_t len) {
    text.assign(txt, len); text.push_back('\0');
    size_t words = 0;
    for (size_t i = 0; i < len; i++) if (txt[i] == ' ') words++;
    cap = 1; while (cap < words * 2 + 16) cap <<= 1;
    slot.assign(cap, 0); z.assign(cap, 0);
    int count = 0; size_t i = 0;
    while (i < len) {
      int zz = 0;
      while (i < len && text[i] >= '0' && text[i] <= '9') zz = zz * 10 + (text[i++] - '0');
      while (i < len && text[i] != '\n') {
        if (text[i] == ' ') { text[i++] = '\0'; continue; }
        size_t s = i; while (i < len && text[i] != ' ' && text[i] != '\n') i++;
        size_t n = i - s;
        uint32_t h = fnv(text.data() + s, n) & (cap - 1);
        for (;;) {
          if (!slot[h]) { slot[h] = (uint32_t)s + 1; z[h] = (uint8_t)(zz > 255 ? 255 : zz); count++; break; }
          const char* o = text.data() + slot[h] - 1;
          if (strlen(o) == n && !memcmp(o, text.data() + s, n)) break;
          h = (h + 1) & (cap - 1);
        }
      }
      if (i < len) text[i++] = '\0';
    }
    return count;
  }
  /** Zipf × 10, or −1 */
  int get(const std::string& w) const {
    if (!cap || w.empty()) return -1;
    uint32_t h = fnv(w.data(), w.size()) & (cap - 1);
    while (slot[h]) {
      const char* o = text.data() + slot[h] - 1;
      if (!memcmp(o, w.data(), w.size()) && o[w.size()] == '\0') return z[h];
      h = (h + 1) & (cap - 1);
    }
    return -1;
  }
  bool ready() const { return cap != 0; }
};

/** how common a suggestion is: its Zipf frequency; for two words and more, the parts' together less 9 for each further one */
static inline double zipf(const Freq& f, const std::u32string& c) {
  std::vector<double> zs;
  std::u32string part;
  auto flush = [&]() {
    if (part.empty()) return;
    std::string w;
    for (char32_t ch : part) encode(w, ch == 0x2019 ? U'\'' : lower(ch));
    if (part.size() == 1 && w != "a" && w != "i") zs.push_back(0.5);
    else { int v = f.get(w); zs.push_back(v < 0 ? 0.5 : v / 10.0); }
    part.clear();
  };
  for (char32_t ch : c) { if (ch == ' ' || ch == '-') flush(); else part.push_back(ch); }
  flush();
  if (zs.empty()) return 0.5;
  if (zs.size() == 1) return zs[0];
  double s = 0;
  for (double v : zs) s += v;
  return s - 9.0 * (double)(zs.size() - 1);
}

// ---------------------------------------------------------------- the dictionary's table of misspellings
// REP lines of the affix file: "REP alot a_lot" (an underscore is a space; ^ and $ hold a pattern to the word's start or end)
struct Rep { std::u32string from, to; bool start = false, end = false; };
static inline std::vector<Rep> reps(const std::string& aff) {
  std::vector<Rep> out;
  size_t a = 0;
  while (a < aff.size()) {
    size_t b = aff.find('\n', a); if (b == std::string::npos) b = aff.size();
    std::string line = aff.substr(a, b - a); a = b + 1;
    if (line.compare(0, 4, "REP ") != 0) continue;
    std::vector<std::string> f;
    size_t i = 0;
    while (i < line.size()) {
      while (i < line.size() && (line[i] == ' ' || line[i] == '\t' || line[i] == '\r')) i++;
      size_t j = i; while (j < line.size() && line[j] != ' ' && line[j] != '\t' && line[j] != '\r') j++;
      if (j > i) f.push_back(line.substr(i, j - i));
      i = j;
    }
    if (f.size() != 3) continue; // "REP 90": the count
    Rep r;
    std::string from = f[1], to = f[2];
    if (!from.empty() && from[0] == '^') { r.start = true; from.erase(0, 1); }
    if (!from.empty() && from.back() == '$') { r.end = true; from.pop_back(); }
    for (char& c : to) if (c == '_') c = ' ';
    r.from = decode(from); r.to = decode(to);
    if (!r.from.empty()) out.push_back(r);
  }
  return out;
}
/** what one replacement of the table makes of a (lower-case) word */
static inline std::set<std::u32string> repForms(const std::u32string& w, const std::vector<Rep>& table) {
  std::set<std::u32string> out;
  for (const Rep& r : table)
    for (size_t i = w.find(r.from); i != std::u32string::npos; i = w.find(r.from, i + 1)) {
      if ((r.start && i != 0) || (r.end && i + r.from.size() != w.size())) continue;
      out.insert(w.substr(0, i) + r.to + w.substr(i + r.from.size()));
    }
  return out;
}

/** the suggestions in their new order */
static inline std::vector<std::string> rank(const Freq& f, const std::string& typed, const std::vector<std::string>& sugg,
                                            const std::vector<Rep>& table = {}) {
  if (!f.ready() || sugg.size() < 2) return sugg;
  std::u32string t = decode(typed), tl;
  for (char32_t c : t) tl.push_back(lower(c));
  bool typedCap = !t.empty() && isUpper(t[0]);
  std::set<std::u32string> known = repForms(tl, table);
  struct Row { double score; size_t k; };
  std::vector<Row> rows;
  for (size_t k = 0; k < sugg.size(); k++) {
    std::u32string c = decode(sugg[k]), cl;
    for (char32_t ch : c) cl.push_back(lower(ch));
    size_t parts = 0; bool in = false;
    for (char32_t ch : c) { bool sep = ch == ' ' || ch == '-'; if (!sep && !in) parts++; in = !sep; }
    double cap = (!c.empty() && isUpper(c[0]) && !typedCap) ? 1.0 : 0.0;
    double rep = known.count(cl) ? 1.0 : 0.0;
    double score = zipf(f, c) - 3.0 * distance(tl, cl) - 0.1 * (double)k - 1.0 * (parts > 1 ? 1.0 : 0.0) - 0.5 * cap + 2.0 * rep;
    rows.push_back({ score, k });
  }
  std::stable_sort(rows.begin(), rows.end(), [](const Row& a, const Row& b) { return a.score > b.score; });
  std::vector<std::string> out;
  for (const Row& r : rows) out.push_back(sugg[r.k]);
  return out;
}

}  // namespace spellrank
