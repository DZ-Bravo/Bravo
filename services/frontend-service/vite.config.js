import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    watch: {
      usePolling: true,
      interval: 1000,
      binaryInterval: 1000
    },
    hmr: {
      host: 'localhost',
      port: 3000,
      protocol: 'ws'
    }
  }
})

