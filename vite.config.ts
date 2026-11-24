import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api/scoresaber": {
        target: "https://scoresaber.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/scoresaber/, ""),
      },
      "/api/beatsaver": {
        target: "https://api.beatsaver.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/beatsaver/, ""),
      },
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
});
