import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Build to api/frontend_dist/ for production serving
    outDir: path.resolve(__dirname, '../api/frontend_dist'),
    emptyOutDir: true,
  },
})
