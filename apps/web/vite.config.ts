import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/socket.io": { target: "http://localhost:4000", ws: true },
      "/health": "http://localhost:4000",
      "/api": "http://localhost:4000"
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          motion: ["framer-motion"],
          animation: ["gsap"],
          socket: ["socket.io-client"]
        }
      }
    }
  }
});
