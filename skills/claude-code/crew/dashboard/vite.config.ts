// Builds the page into ../scaffold/dashboard/app/ with fixed file names (no hashes): the
// server sends no-cache and validates by ETag, and fixed names keep the installed copy tidy.
// `npm run dev` serves the page with hot reload against a running dashboard server
// (CREW_DASHBOARD_URL, default http://127.0.0.1:47406).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const target = process.env.CREW_DASHBOARD_URL || 'http://127.0.0.1:47406'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  base: './',
  build: {
    outDir: fileURLToPath(new URL('../scaffold/dashboard/app', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    proxy: {
      '/api': { target, changeOrigin: true },
      '/files': { target, changeOrigin: true },
    },
  },
})
