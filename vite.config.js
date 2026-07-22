import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'apple-touch-icon.png', 'icons/*.png'],
      workbox: {
        // Take over immediately on update so a new deploy replaces the old
        // build without needing two reloads, and purge stale precaches.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Always try the network first for the app shell so online users get
        // the latest HTML/JS/CSS; fall back to cache when offline.
        navigateFallback: null,
        runtimeCaching: [
          // Map tiles you've viewed → render offline. Tiles are immutable per
          // URL, so CacheFirst; cap the cache so it can't grow unbounded.
          {
            urlPattern: ({ url }) => url.host.endsWith('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
            }
          },
          // App shell — network-first so online users get the latest build.
          {
            urlPattern: ({ request }) =>
              request.mode === 'navigate' ||
              request.destination === 'script' ||
              request.destination === 'style',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 40 }
            }
          }
        ]
      },
      manifest: {
        name: 'FairMenu',
        short_name: 'FairMenu',
        description: 'Vind jouw plek. Ontdek cafés en restaurants op FairMenu.',
        theme_color: '#4A5D23',
        background_color: '#FAFAED',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'logo.png', sizes: '1024x1024', type: 'image/png' }
        ]
      }
    })
  ]
});
