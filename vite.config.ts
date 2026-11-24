/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['libavoid-js'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
