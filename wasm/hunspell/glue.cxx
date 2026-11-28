// hunspell.wasm: Hunspell 1.7.6 (the spell checker of LibreOffice, Firefox and Chrome) for the Spell Checker tab, driven from
// the page through these C functions. Its dictionaries are handed over in memory: Hunspell opens its .aff and .dic files through
// hunspell_open_file (wasm/hunspell/stdio_stream.hxx, which stands in for std::ifstream), and a name registered here with hs_file
// opens its bytes (fmemopen). Words and suggestions are UTF-8 (the dictionaries say SET UTF-8). Suggestions come in Hunspell's
// order or ranked by rank.hxx, once the word frequencies are given (hs_freq).
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>
#include "hunspell.hxx"
#include "hunversion.h"
#include "stdio_stream.hxx"
#include "rank.hxx"

#define API extern "C" __attribute__((visibility("default")))

static std::map<std::string, std::string> files;
static std::string out;
static spellrank::Freq freq;
static std::map<Hunspell*, std::vector<spellrank::Rep>> tables; // each instance's table of misspellings (its affix file's REP)

extern "C" FILE* hunspell_open_file(const char* name) {
  auto it = files.find(name);
  if (it == files.end() || it->second.empty()) return nullptr;
  return fmemopen(const_cast<char*>(it->second.data()), it->second.size(), "r");
}

API void* hs_alloc(size_t n) { return malloc(n ? n : 1); }
API void hs_free(void* p) { free(p); }
/** a file Hunspell may open: its name (NUL-terminated) and its bytes */
API void hs_file(const char* name, const char* data, size_t len) { files[name] = std::string(data, len ? len : 0); }
API void hs_unfile(const char* name) { files.erase(name); }
/** a Hunspell instance of an affix file and a dictionary (names given to hs_file); 0 if Hunspell could not read them */
API Hunspell* hs_create(const char* aff, const char* dic) {
  if (!files.count(aff) || !files.count(dic)) return nullptr;
  Hunspell* h = new Hunspell(aff, dic);
  tables[h] = spellrank::reps(files[aff]);
  return h;
}
API void hs_destroy(Hunspell* h) { tables.erase(h); delete h; }
/** a second dictionary for the same affixes (words of a region, of the reader) */
API int hs_add_dic(Hunspell* h, const char* dic) { return files.count(dic) ? h->add_dic(dic) : 1; }
/** 1 if the word is spelt right, 0 if not */
API int hs_spell(Hunspell* h, const char* word) { return h->spell(std::string(word)) ? 1 : 0; }
/** the word frequencies the suggestions are ranked by (public/data/dict/freq.txt): the number of words read */
API int hs_freq(const char* txt, size_t len) { return freq.load(txt, len); }
/** the suggestions for a word, best first — ranked (rank.hxx) when `ranked` and the frequencies are there, else in Hunspell's
 *  order: their count; the words joined by "\n" in hs_out() / hs_out_len() */
API int hs_suggest(Hunspell* h, const char* word, int ranked) {
  std::vector<std::string> s = h->suggest(std::string(word));
  if (ranked) s = spellrank::rank(freq, std::string(word), s, tables[h]);
  out.clear();
  for (size_t i = 0; i < s.size(); i++) { if (i) out += '\n'; out += s[i]; }
  return (int)s.size();
}
/** a list of suggestions (joined by "\n") in the tab's order: the tests rank what native Hunspell gave */
API int hs_rank(Hunspell* h, const char* word, const char* list) {
  std::vector<std::string> s;
  std::string l(list), w;
  size_t a = 0;
  while (a <= l.size()) { size_t b = l.find('\n', a); if (b == std::string::npos) b = l.size(); if (b > a) s.push_back(l.substr(a, b - a)); a = b + 1; }
  s = spellrank::rank(freq, std::string(word), s, tables[h]);
  out.clear();
  for (size_t i = 0; i < s.size(); i++) { if (i) out += '\n'; out += s[i]; }
  return (int)s.size();
}
API const char* hs_out() { return out.data(); }
API size_t hs_out_len() { return out.size(); }
/** a word added for this instance (the reader's own words); with an example, it takes the example's affixes */
API int hs_add(Hunspell* h, const char* word) { return h->add(std::string(word)); }
API int hs_add_with_affix(Hunspell* h, const char* word, const char* example) { return h->add_with_affix(std::string(word), std::string(example)); }
API int hs_remove(Hunspell* h, const char* word) { return h->remove(std::string(word)); }
API int hs_version() { return HUNSPELL_VERSION; }
