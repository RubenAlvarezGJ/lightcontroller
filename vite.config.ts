/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://<user>.github.io/lightcontroller/ on GitHub Pages.
const base = '/lightcontroller/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // Precache fonts too, so the installed app works with no network.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      manifest: {
        name: 'Sunset Lamp Controller',
        short_name: 'Sunset Lamp',
        description: 'Control MeRGBW Sunset Lamps over Bluetooth.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#16110f',
        theme_color: '#16110f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
