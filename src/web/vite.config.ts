import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { siteMeta } from './scripts/site-meta.ts'

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

const OUT_DIR = here('dist')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    siteMeta({ dataDir: here('src/content'), publicDir: here('public') }),
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
