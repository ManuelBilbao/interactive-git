import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` is relative so the built site works from any subpath (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
})
