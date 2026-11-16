/* Force-included into every eSpeak NG source: file reads go to the in-memory data in glue.c. */
#ifndef ES_MEMFS_H
#define ES_MEMFS_H
#include <stdio.h>
#include <sys/stat.h>
FILE *es_fopen(const char *path, const char *mode);
int es_stat(const char *path, struct stat *st);
#define fopen es_fopen
#endif
