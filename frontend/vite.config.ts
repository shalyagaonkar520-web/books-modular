import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

const apiProxy = {
  '/api': {
    target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000',
    changeOrigin: true,
  },
};

// Phones only open the camera (Point of Sale barcode scanner) on HTTPS pages:
// `VITE_HTTPS=1 npm run dev -- --host` serves the dev server with a self-signed
// certificate for testing on a phone over Wi-Fi.
const devHttps = process.env.VITE_HTTPS === '1';

export default defineConfig({
  plugins: devHttps ? [react(), basicSsl()] : [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  server: {
    port: 3000,
    proxy: apiProxy,
  },
  // `vite preview` does not inherit the dev server proxy, so declare it here too
  // for anyone checking a production build locally.
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    // Full-page renders in jsdom (the app-content editor shows thousands of texts) need more
    // than the 5s default on a busy CI runner.
    testTimeout: 20000,
  },
});
