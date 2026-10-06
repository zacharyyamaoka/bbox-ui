import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const TRUNK = path.resolve(__dirname, "../storybook-basics/src");

/**
 * The no-host runner. Deliberately the SMALLEST config in the repo: no engine,
 * no assets to self-host, no licence key. Everything that made
 * `apps/systemsketch/vite.config.ts` long is tldraw's, which is the point of
 * this app existing.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // One alias, same as the tldraw app: the trunk is this app's only source
    // of design. See apps/systemsketch/vite.config.ts for the full WHY.
    alias: { "@trunk": TRUNK },
  },
  server: {
    port: 4360,
    strictPort: true,
    fs: {
      // The alias points outside this app's root.
      allow: [path.resolve(__dirname, "../..")],
    },
  },
});
