import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
        },
        preload: {
          input: 'electron/preload.ts',
        },
        renderer: {},
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      'import.meta.env.VITE_TURSO_DATABASE_URL': JSON.stringify(env.VITE_TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || ''),
      'import.meta.env.VITE_TURSO_AUTH_TOKEN': JSON.stringify(env.VITE_TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || ''),
    },
  };
});
