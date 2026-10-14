import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Template player-crm — standalone, deploy su Vercel
// en.html = stessa app con anteprima del link in inglese (servita su /download)
export default defineConfig({
  plugins: [react()],
  server: { port: 5190, host: true },
  build: { rollupOptions: { input: { main: 'index.html', en: 'en.html' } } },
})
