import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Like the PolyPaint demo, this is committed as a build output under the
// site's public/ folder, so GitHub Pages serves it at
// https://maxhunt.dev/gg-demo/ without building it in CI.
// Override the base with GG_BASE if it ever moves.
export default defineConfig({
  base: process.env.GG_BASE ?? '/gg-demo/',
  plugins: [react()],
  build: {
    outDir: '../../public/gg-demo',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: { port: 4340, host: '127.0.0.1' },
  preview: { port: 4341, host: '127.0.0.1' },
});
