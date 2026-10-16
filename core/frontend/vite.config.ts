import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Node's `process` (this file runs in Node). Declared here so the type check needs no @types/node,
// which the production image does not install.
declare const process: { env: Record<string, string | undefined> };

const apiProxy = {
  '/api': {
    target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8001',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 3001, proxy: apiProxy },
  preview: { port: 4174, proxy: apiProxy },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
