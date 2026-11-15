import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works at https://<user>.github.io/utils/ (or any sub-path).
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 6000,
    sourcemap: false,
  },
  worker: { format: 'es' },
  optimizeDeps: {
    // Packages that load their own .wasm via import.meta.url must not be pre-bundled in dev.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@jsquash/jpeg', '@jsquash/webp', '@jsquash/oxipng', 'zxing-wasm', 'mediabunny'],
  },
  server: { port: 5173, strictPort: false },
});
