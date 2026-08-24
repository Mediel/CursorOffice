import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: resolve(__dirname, '../CursorOffice.Extension/media'),
    emptyOutDir: true,
    cssCodeSplit: false,
    // Webview keeps one local bundle so Cursor's nonce-based CSP stays simple.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        entryFileNames: 'office.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'office.[ext]'
      }
    }
  }
});
