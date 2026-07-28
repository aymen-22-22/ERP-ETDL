declare function defineConfig(config: any): any;
export default defineConfig({
  plugins: [
      react(),
      tailwindcss(),
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
  },
});
