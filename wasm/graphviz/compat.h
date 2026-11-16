/* Force-included into every Graphviz C file of the wasm build: prototypes wasi-libc leaves out, so calls are not
 * implicitly declared (an implicit declaration gets the wrong wasm signature and traps at run time). */
#pragma once
#ifndef __cplusplus
#include <stdio.h>
#include <unistd.h>
void flockfile(FILE *f);
void funlockfile(FILE *f);
#endif
