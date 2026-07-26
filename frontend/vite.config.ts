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
      injectRegister: false, // registered explicitly from src/pwa/registerServiceWorker.ts
      includeAssets: ["favicon.svg"],
      manifest: {
        id: "/",
        scope: "/",
        lang: "en",
        name: "ERP SaaS",
        short_name: "ERP",
        description: "Multi-tenant ERP for small and medium businesses",
        // Matches the Warm Brass palette (see src/index.css) and the
        // theme-color meta tags in index.html.
        theme_color: "#201e1a",
        background_color: "#fdfcf9",
        display: "standalone",
        start_url: "/",
        // NOTE: `maskable` needs a real raster asset with safe-zone padding —
        // an SVG can't stand in for it. Drop 192/512 PNGs into `public/` and
        // add them here to get a properly masked icon on Android.
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        // SPA app-shell fallback: any uncached navigation (including the very
        // first offline visit, once the shell itself has been precached once)
        // resolves to the cached index.html rather than a browser offline error.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/sync/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api"),
            method: "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
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
