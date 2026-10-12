import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { seaRoomPlugin } from "./viteSea";

export default defineConfig({
  plugins: [react(), seaRoomPlugin()],
  server: { host: "127.0.0.1", port: 5183, strictPort: true },
  preview: { host: "127.0.0.1", port: 5183, strictPort: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
