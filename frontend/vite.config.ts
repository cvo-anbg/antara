import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // PREVIEW_TUNNEL=1 relaxes host checks so the dev server can be reached
    // through a public tunnel (e.g. cloudflared) for remote/phone previews.
    ...(process.env.PREVIEW_TUNNEL
      ? { host: true, allowedHosts: true as const }
      : {}),
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
