import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const certDir = path.join(os.homedir(), '.dopamine', 'certs');

export default defineConfig({
  root: 'src/client',
  plugins: [svelte()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: fs.existsSync(path.join(certDir, 'server.key')) ? {
      key: fs.readFileSync(path.join(certDir, 'server.key')),
      cert: fs.readFileSync(path.join(certDir, 'server.cert')),
    } : undefined,
    proxy: {
      '/api': {
        target: 'https://localhost:3000',
        secure: false,
      },
      '/ws': {
        target: 'wss://localhost:3000',
        secure: false,
        ws: true,
      },
    },
  },
});
