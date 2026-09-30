import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    host: true, // listen on 0.0.0.0 — reachable from other devices on the same Wi‑Fi
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        // Local Phi-4 replies can take 20–60s; default proxy idle timeout causes ECONNRESET
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
      '/sandbox': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
});
