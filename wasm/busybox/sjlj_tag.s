# Exception tag used by wasi-libc's setjmp/longjmp runtime (rt.c: __builtin_wasm_throw(1, …)) when C code is built
# with -mllvm -wasm-enable-sjlj. The payload is a pointer to the jmp_buf argument block (i32 on wasm32).
	.globl	__c_longjmp
	.tagtype	__c_longjmp i32
__c_longjmp:
