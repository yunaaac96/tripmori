import { defineConfig } from 'vite';
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
      includeAssets: ['favicon.svg', 'favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'TripMori 旅行手帳',
        short_name: 'TripMori',
        description: '團體旅遊規劃手帳',
        theme_color: '#8FAF7E',
        background_color: '#F7F4EB',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          // Light mode icons (cream background)
          { src: '/icons/icon-192-light.png', sizes: '192x192', type: 'image/png', purpose: 'any', media: '(prefers-color-scheme: light)' },
          { src: '/icons/icon-512-light.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable', media: '(prefers-color-scheme: light)' },
          // Dark mode icons (forest green background)
          { src: '/icons/icon-192-dark.png', sizes: '192x192', type: 'image/png', purpose: 'any', media: '(prefers-color-scheme: dark)' },
          { src: '/icons/icon-512-dark.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable', media: '(prefers-color-scheme: dark)' },
          // Fallback (no media query) for Play Store / universal use
          { src: '/icons/icon-192-light.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-light.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  resolve: { alias: { '@': '/src' } },
});