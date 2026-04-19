import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo.png', 'icons/*.png'],
      manifest: {
        name: 'TripMori 旅行手帳',
        short_name: 'TripMori',
        description: '團體旅遊規劃手帳',
        theme_color: '#6B7C58',
        background_color: '#F7F4EB',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192-light.png',    sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-light.png',    sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192-dark.png',     sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-dark.png',     sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-192-mono.png',     sizes: '192x192', type: 'image/png', purpose: 'monochrome' },
          { src: '/icons/icon-512-mono.png',     sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  resolve: { alias: { '@': '/src' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});