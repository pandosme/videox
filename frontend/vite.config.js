import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3302,
    // In production: Running behind nginx reverse proxy at videox.app
    // Nginx handles /api/ and /hls/ routing to backend (10.13.8.2:3002)
    // In development: Vite proxy handles routing to local backend (localhost:3002)
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/hls': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
