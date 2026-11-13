import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The demo is committed as a build output under the site's public/ folder
// (like public/hosthunt-app and public/polymarket-lab), so GitHub Pages serves
// it at https://maxhunt.design/polypaint-demo/ without building it in CI.
// Override the base with POLYPAINT_BASE if it ever moves (e.g. '/' on its own domain).
export default defineConfig({
  base: process.env.POLYPAINT_BASE ?? '/polypaint-demo/',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    outDir: '../../public/polypaint-demo',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: { port: 4330, host: '127.0.0.1' },
  preview: { port: 4331, host: '127.0.0.1' },
});
