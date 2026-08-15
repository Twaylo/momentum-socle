import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Port de l'API en développement. Le front (5173) proxifie /api vers lui : le
// navigateur ne voit qu'une seule origine, donc le cookie du verrou se comporte
// exactement comme en production, sans CORS.
const API = 'http://localhost:8787'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@noyau': fileURLToPath(new URL('./noyau', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
    },
  },
})
