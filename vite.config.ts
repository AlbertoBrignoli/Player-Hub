import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Template player-crm — standalone, deploy su Vercel
export default defineConfig({
  plugins: [react()],
  server: { port: 5190, host: true },
})
