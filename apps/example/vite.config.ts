import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Example Vite configuration for the workspace
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: true,
  },
})
