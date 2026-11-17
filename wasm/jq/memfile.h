// Force-included into every jq source file by build.sh. jq's input reader (src/util.c) opens its input files with
// fopen(); a browser tab has no files, so fopen is sent to glue.c's jq_mem_fopen, which serves the one input the page
// passed in ("input.json") from memory and answers "no such file" for every other name. fclose is sent there as well:
// jq does not close its input when a run ends early (halt, a parse error — the command line just exits), so the glue
// has to know whether the stream is still open to close it itself.
#ifndef SUPERTOOLS_JQ_MEMFILE_H
#define SUPERTOOLS_JQ_MEMFILE_H
#include <stdio.h>
FILE *jq_mem_fopen(const char *name, const char *mode);
#define fopen jq_mem_fopen
int jq_mem_fclose(FILE *f);
#define fclose jq_mem_fclose
#endif
