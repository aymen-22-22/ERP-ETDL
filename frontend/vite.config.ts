import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["favicon.svg"],
      manifest: {
        id: "/",
        scope: "/",
        lang: "en",
        name: "ERP SaaS",
        short_name: "ERP",
        description: "Multi-tenant ERP for small and medium businesses",
        theme_color: "#201e1a",
        background_color: "#fdfcf9",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        // No runtimeCaching for /api: there's no offline write queue anymore
        // (the sync engine was removed), so caching API GETs bought nothing
        // but a real hazard -- a service worker installed before a deploy
        // keeps serving stale cached responses from its own cache storage
        // regardless of server Cache-Control headers, since Workbox's
        // NetworkFirst still writes every response to cache even when told
        // not to store it. API calls now always hit the network.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/sync/],
        runtimeCaching: [
          {
            // Uploaded media (product/category/warehouse photos and their
            // webp thumbnails) is immutable: every upload gets a fresh uuid7
            // filename, so a URL never changes meaning and the server already
            // serves it with `Cache-Control: max-age=31536000, immutable`.
            // A cache-first layer here is strictly additive — it serves
            // instantly from Cache Storage and reuses the same file for every
            // card on every page instead of re-reading the HTTP cache. The
            // 500-entry cap keeps the storage footprint bounded.
            urlPattern: /\/media\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "media",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
