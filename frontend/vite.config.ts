import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
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
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
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
  };
});
