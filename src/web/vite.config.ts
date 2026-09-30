import { copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { siteMeta } from './scripts/site-meta.ts'

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

/**
 * GitHub Pages has no rewrite rules: it serves the file at the request path or
 * it serves `404.html`. A hard load of `/resume` therefore never reaches
 * `index.html`, and the app never boots.
 *
 * The fix Pages is designed around is to make `404.html` a copy of
 * `index.html`. React Router then reads the address bar and renders the right
 * page. The response still carries a 404 *status* — that is inherent to doing
 * client-side routing on Pages, and the alternative is hash URLs.
 *
 * Copied in `closeBundle` from what is actually on disk, so it cannot race the
 * HTML transforms or capture a half-built document.
 */
const pagesSpaFallback = (outDir: string): Plugin => ({
  name: 'pages-spa-fallback',
  apply: 'build',
  closeBundle() {
    copyFileSync(path.join(outDir, 'index.html'), path.join(outDir, '404.html'))
  },
})

const OUT_DIR = here('dist')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    siteMeta({ dataDir: here('src/content'), publicDir: here('public') }),
    pagesSpaFallback(OUT_DIR),
  ],
  // Served at the root of trevorhuval.com.
  base: '/',
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    // The photographs are the heavy part of this payload by an order of
    // magnitude; a source map per chunk on top of them earns nothing.
    sourcemap: false,
  },
  server: {
    port: 5173,
    // The studio API and the photos it serves. Start it with "npm run dev" in src/cms;
    // without it the site simply falls back to its bundled content.
    proxy: {
      '/api/cms': 'http://localhost:8787',
      '/media': 'http://localhost:8787',
    },
  },
})
