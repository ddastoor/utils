// The Spell Checker's native reference: Hunspell built from the same source and with the same change of its time limits as
// hunspell.wasm (wasm/hunspell/build.sh leaves it at $WORK/native/hsref). Reads the affix file, the dictionaries (more than one:
// the second and later ones are added as Hunspell's add_dic does) from the arguments, then one word a line on stdin;
// a line "+word" adds the word, "+word/example" adds it with the example's affixes, "-word" removes it. Writes one JSON line a
// word: {"ok":1} or {"ok":0,"s":["…", …]} — with --freq public/data/dict/freq.txt before the files also "r": the suggestions as
// the tab ranks them (wasm/hunspell/rank.hxx).
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include "hunspell.hxx"
#include "stdio_stream.hxx"
#include "rank.hxx"

extern "C" FILE* hunspell_open_file(const char* path) { return fopen(path, "rb"); }

static void json(const std::string& s) {
  std::cout << '"';
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') std::cout << '\\' << c;
    else if (c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); std::cout << b; }
    else std::cout << c;
  }
  std::cout << '"';
}
static void list(const char* key, const std::vector<std::string>& s) {
  std::cout << ",\"" << key << "\":[";
  for (size_t i = 0; i < s.size(); i++) { if (i) std::cout << ','; json(s[i]); }
  std::cout << ']';
}
int main(int argc, char** argv) {
  spellrank::Freq freq;
  int a = 1;
  if (argc > 2 && std::string(argv[1]) == "--freq") {
    std::ifstream f(argv[2], std::ios::binary); std::stringstream b; b << f.rdbuf(); std::string t = b.str();
    if (freq.load(t.data(), t.size()) <= 0) { std::cerr << "could not read " << argv[2] << "\n"; return 2; }
    a = 3;
  }
  if (argc - a < 2) { std::cerr << "usage: hsref [--freq freq.txt] file.aff file.dic [more.dic …] < words\n"; return 2; }
  Hunspell h(argv[a], argv[a + 1]);
  std::vector<spellrank::Rep> table;
  { std::ifstream f(argv[a], std::ios::binary); std::stringstream b; b << f.rdbuf(); table = spellrank::reps(b.str()); }
  for (int i = a + 2; i < argc; i++) h.add_dic(argv[i]);
  std::string w;
  while (std::getline(std::cin, w)) {
    if (!w.empty() && w[0] == '+') { size_t k = w.find('/', 1); if (k == std::string::npos) h.add(w.substr(1)); else h.add_with_affix(w.substr(1, k - 1), w.substr(k + 1)); std::cout << "{}\n"; continue; }
    if (!w.empty() && w[0] == '-') { h.remove(w.substr(1)); std::cout << "{}\n"; continue; }
    if (h.spell(w)) { std::cout << "{\"ok\":1}\n"; continue; }
    std::vector<std::string> s = h.suggest(w);
    std::cout << "{\"ok\":0";
    list("s", s);
    if (freq.ready()) list("r", spellrank::rank(freq, w, s, table));
    std::cout << "}\n";
  }
  return 0;
}
