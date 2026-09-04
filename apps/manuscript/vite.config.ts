import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@xgc2/ui-manuscript': fileURLToPath(new URL('../../packages/manuscript/src/index.ts', import.meta.url)),
      '@xgc2/ui-manuscript/styles.css': fileURLToPath(new URL('../../packages/manuscript/src/styles.css', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['monaco-editor', 'pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 3281,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3280',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
