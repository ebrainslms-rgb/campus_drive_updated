import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Proxy API calls to the Spring Boot backend during development.
    // In production, configure your web server / reverse proxy to forward
    // /api/** to the backend the same way (see README).
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
  },
});
