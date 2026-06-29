// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Custom domain (maxhunt.design) is served from the dist root, so base stays '/'.
export default defineConfig({
  site: 'https://maxhunt.design',
  // Prefetch linked pages (small site) so ClientRouter navigations feel instant.
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
