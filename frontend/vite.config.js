import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3302,
    // Running behind nginx reverse proxy at videox.app
    // Nginx handles /api/ and /hls/ routing to backend (10.13.8.2:3002)
    // This dev server handles the frontend routes
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
