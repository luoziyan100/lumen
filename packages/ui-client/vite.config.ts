import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri 期望固定 dev 端口 5173
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5180, strictPort: false },
})
