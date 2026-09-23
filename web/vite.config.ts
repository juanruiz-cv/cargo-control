import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    // T18: cache-friendly vendor bundles — react/router get their own chunk
    // so an app release stays small and the framework churn never re-downloads.
    // The remaining app chunk (~581 kB raw / 152 kB gzip incl. Tailwind CSS)
    // is below this warning threshold.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'vendor-react'
          }
        },
      },
    },
  },
})