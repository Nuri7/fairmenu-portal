import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'images/*.png'],
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
          // Vendor photos you've opened → available offline. Immutable per
          // filename → CacheFirst. Match by path (robust for <img> and fetch).
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/menus/images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'vendor-photos',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
            }
          },
          // Menus you've opened → work offline; refresh in the background when
          // online (StaleWhileRevalidate) so edits still propagate.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/menus/') && url.pathname.endsWith('.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'menus',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 },
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
