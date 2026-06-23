import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The PWA builds to dist/client; the Worker (wrangler.toml) serves it as
// static assets. In dev, /api is proxied to a locally-running `wrangler dev`.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
