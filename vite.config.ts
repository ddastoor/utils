import { defineConfig, type Plugin } from 'vite';

/** MediaPipe Tasks ≥ 1.2 sends usage logs to odml.pa.googleapis.com every 60 s and on close(). The owner's rule is
 *  "no analytics": the logger's flush is made a no-op that drops the queue (the CSP would block it anyway).
 *  Fails the build if the code changes shape, so a MediaPipe upgrade cannot silently bring logging back. */
const noMediapipeTelemetry = (): Plugin => ({
  name: 'no-mediapipe-telemetry',
  enforce: 'pre',
  transform(code, id) {
    if (!/@mediapipe[\\/]tasks-vision[\\/]vision_bundle\.m?js/.test(id)) return null;
    const from = 'flush(t,e){if(this.error)';
    if (!code.includes('odml.pa.googleapis.com')) return null;
    if (code.split(from).length !== 2) throw new Error('MediaPipe usage logger changed: update noMediapipeTelemetry in vite.config.ts');
    return { code: code.replace(from, 'flush(t,e){this.i=[];t?.();return;if(this.error)'), map: null };
  },
});

export default defineConfig({
  plugins: [noMediapipeTelemetry()],
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
