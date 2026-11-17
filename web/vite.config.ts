/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// WEB_BASE is where the site is served from. "/next/" while the old pages are still live, "/" at the final switch.
const base = process.env.WEB_BASE || '/next/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { proxy: { '/health': 'http://127.0.0.1:3000', '/api': 'http://127.0.0.1:3000' } },
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false },
});
