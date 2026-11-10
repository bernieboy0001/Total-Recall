import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Used only for `vite build` (the static frontend Vercel serves). The dev server
// still runs Vite in middleware mode with its own inline config in server/index.mjs.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
