// A file read through C's stdio, standing in for the few things Hunspell does with std::ifstream — open, is_open, getline into
// a buffer, read, gcount, close and the failure test —, because the C++ library of a WebAssembly build has no file streams.
// Applied by wasm/hunspell/build.sh to the WebAssembly module and to the native reference alike, so both run the same code.
// getline and read follow std::istream's rules: getline stores up to n - 1 characters up to a '\n' (taken, not stored) and
// fails when it takes nothing, or when it stored n - 1 and the next is not '\n' (that one stays); read fails when it gets
// fewer than n bytes; once failed, every later call fails. A file is opened by hunspell_open_file, which the program defines:
// the WebAssembly glue opens the dictionaries handed to it in memory (wasm/hunspell/glue.cxx), the native reference opens files
// (scripts/hunspell-ref/ref.cxx).
#ifndef STDIO_STREAM_HXX_
#define STDIO_STREAM_HXX_
#include <cstdio>
#include <ios>

extern "C" FILE* hunspell_open_file(const char* path);

class StdioStream {
  FILE* f = nullptr;
  bool failed = false;
  std::streamsize count = 0;

 public:
  StdioStream() = default;
  StdioStream(const StdioStream&) = delete;
  StdioStream& operator=(const StdioStream&) = delete;
  ~StdioStream() { close(); }
  void open(const char* path, std::ios_base::openmode) { close(); f = hunspell_open_file(path); failed = !f; }
  bool is_open() const { return f != nullptr; }
  void close() { if (f) { fclose(f); f = nullptr; } }
  bool fail() const { return failed; }
  bool operator!() const { return failed; }
  explicit operator bool() const { return !failed; }
  std::streamsize gcount() const { return count; }
  StdioStream& getline(char* s, std::streamsize n) {
    count = 0;
    std::streamsize stored = 0;
    if (failed || !f || n < 1) { failed = true; if (n > 0) s[0] = '\0'; return *this; }
    for (;;) {
      int c = fgetc(f);
      if (c == EOF) { if (count == 0) failed = true; break; }
      if (c == '\n') { count++; break; }
      if (stored == n - 1) { ungetc(c, f); failed = true; break; }
      s[stored++] = static_cast<char>(c); count++;
    }
    s[stored] = '\0';
    return *this;
  }
  StdioStream& read(char* s, std::streamsize n) {
    count = (failed || !f) ? 0 : static_cast<std::streamsize>(fread(s, 1, static_cast<size_t>(n), f));
    if (count < n) failed = true;
    return *this;
  }
};
#endif
