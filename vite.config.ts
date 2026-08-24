import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Melody Songbook',
        short_name: 'Songbook',
        description: "A classroom play-along for Lacie's Melody Songbook.",
        display: 'standalone',
        theme_color: '#4338ca',
        background_color: '#4338ca',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Take over immediately rather than waiting for every tab to close.
        // Without this a teacher who reloads still gets yesterday's bundle,
        // which is exactly the failure this caused in testing.
        skipWaiting: true,
        clientsClaim: true,
        // The main JS chunk runs ~1.8 MB; the default 2 MB-ish cutoff is too
        // tight once VexFlow and Tone are bundled in, so raise it well clear.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
})
