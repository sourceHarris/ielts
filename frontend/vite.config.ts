import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import privateLibrary from './server/privateLibrary.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), privateLibrary()],
  server: { host: '127.0.0.1', fs: { deny: ['**/.env*', '**/*.{crt,pem}', '**/.git/**', '**/private-content/**', '**/*.local'] } },
  preview: { host: '127.0.0.1' },
})
