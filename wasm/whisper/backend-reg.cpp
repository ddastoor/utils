// Static, CPU-only replacement for ggml's ggml-backend-reg.cpp (own code, MIT; same public API and behaviour as the
// upstream registry, minus dynamic backend loading, which needs dlopen/std::filesystem — neither exists in a browser).
#include "ggml-backend-impl.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "ggml-impl.h"
#include <cctype>
#include <vector>

namespace {
struct registry {
  std::vector<ggml_backend_reg_t> backends;
  std::vector<ggml_backend_dev_t> devices;
  registry() { add(ggml_backend_cpu_reg()); }
  void add(ggml_backend_reg_t reg) {
    if (!reg) return;
    backends.push_back(reg);
    for (size_t i = 0; i < ggml_backend_reg_dev_count(reg); i++) devices.push_back(ggml_backend_reg_dev_get(reg, i));
  }
};
registry &get() { static registry r; return r; }
bool striequals(const char *a, const char *b) {
  for (; *a && *b; a++, b++) if (std::tolower(*a) != std::tolower(*b)) return false;
  return *a == *b;
}
}  // namespace

void ggml_backend_register(ggml_backend_reg_t reg) { get().add(reg); }
void ggml_backend_device_register(ggml_backend_dev_t device) { get().devices.push_back(device); }
size_t ggml_backend_reg_count() { return get().backends.size(); }
ggml_backend_reg_t ggml_backend_reg_get(size_t i) { GGML_ASSERT(i < ggml_backend_reg_count()); return get().backends[i]; }
ggml_backend_reg_t ggml_backend_reg_by_name(const char *name) {
  for (auto r : get().backends) if (striequals(ggml_backend_reg_name(r), name)) return r;
  return nullptr;
}
size_t ggml_backend_dev_count() { return get().devices.size(); }
ggml_backend_dev_t ggml_backend_dev_get(size_t i) { GGML_ASSERT(i < ggml_backend_dev_count()); return get().devices[i]; }
ggml_backend_dev_t ggml_backend_dev_by_name(const char *name) {
  for (auto d : get().devices) if (striequals(ggml_backend_dev_name(d), name)) return d;
  return nullptr;
}
ggml_backend_dev_t ggml_backend_dev_by_type(enum ggml_backend_dev_type type) {
  for (auto d : get().devices) if (ggml_backend_dev_type(d) == type) return d;
  return nullptr;
}
ggml_backend_t ggml_backend_init_by_name(const char *name, const char *params) { auto d = ggml_backend_dev_by_name(name); return d ? ggml_backend_dev_init(d, params) : nullptr; }
ggml_backend_t ggml_backend_init_by_type(enum ggml_backend_dev_type type, const char *params) { auto d = ggml_backend_dev_by_type(type); return d ? ggml_backend_dev_init(d, params) : nullptr; }
ggml_backend_t ggml_backend_init_best(void) { auto d = ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU); return d ? ggml_backend_dev_init(d, nullptr) : nullptr; }
ggml_backend_reg_t ggml_backend_load(const char *) { return nullptr; }
void ggml_backend_unload(ggml_backend_reg_t) {}
void ggml_backend_load_all() {}
void ggml_backend_load_all_from_path(const char *) {}
