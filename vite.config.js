import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

function loadLocalEnv() {
  const cwd = process.cwd();
  const dotEnvLocal = path.join(cwd, '.env.local');
  const envLocal = path.join(cwd, 'env.local');
  if (fs.existsSync(dotEnvLocal)) dotenv.config({ path: dotEnvLocal });
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
}

export default defineConfig(({ mode }) => {
  loadLocalEnv();
  const VITE_OPEN_ROUTER_API_KEY = process.env.VITE_OPEN_ROUTER_API_KEY || '';
  const VITE_MODEL_NAME = process.env.VITE_MODEL_NAME || 'google/gemini-2.5-flash-lite';
  const VITE_OPEN_ROUTER_API_URL = process.env.VITE_OPEN_ROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_OPEN_ROUTER_API_KEY': JSON.stringify(VITE_OPEN_ROUTER_API_KEY),
      'import.meta.env.VITE_MODEL_NAME': JSON.stringify(VITE_MODEL_NAME),
      'import.meta.env.VITE_OPEN_ROUTER_API_URL': JSON.stringify(VITE_OPEN_ROUTER_API_URL)
    },
    server: {
      port: 5173,
      strictPort: false
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    }
  };
}); 