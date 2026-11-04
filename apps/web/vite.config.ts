import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173, proxy: {
      '/api': {
        target: 'http://localhost:3000',
        // Solo en desarrollo: al abrir desde el móvil (http://192.168.x.x:5173) el Origin no coincide con CORS_ORIGINS
        // y la API respondería 403 BAD_ORIGIN. Se presenta como el origen local permitido.
        configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('origin', 'http://localhost:5173')),
      },
    },
  },
});
