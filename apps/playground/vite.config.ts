import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // The dev server's dependency-prebundle scan cannot resolve the `?url`
    // imports inside @tldraw/assets/imports.vite.js (used by the inspector
    // package's hidden stock mount and icon glyphs) even though the files are
    // on disk — it fails with UNLOADABLE_DEPENDENCY errors and crashes the
    // dev server outright. `vite build` never hits this. Excluding the
    // package from pre-bundling is tldraw's own documented workaround for
    // self-hosted assets.
    exclude: ["@tldraw/assets"],
  },
});
