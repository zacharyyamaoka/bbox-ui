import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const TRUNK = path.resolve(__dirname, "../storybook-basics/src");

/**
 * The React Flow host. Same shape as `apps/systemsketch/vite.config.ts` minus
 * everything that file carries for tldraw (self-hosted assets, licence key):
 * React Flow is plain MIT and needs neither.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // WHY one alias and no vendored copy: the trunk is this app's only source
    // of design, exactly as it is for the tldraw studio — see
    // apps/systemsketch/vite.config.ts for the full WHY. Matched by
    // tsconfig.json's `paths`, so `tsc` and Vite resolve the same file.
    alias: { "@trunk": TRUNK },
  },
  server: {
    port: 4370,
    strictPort: true,
    watch: {
      // WHY: `./simple-reactflow-whiteboard` is a symlink to the whiteboard's
      // pinned worktree (see README.md). The app consumes that package's
      // built `dist/` through node_modules, never its source, so watching
      // the linked repo (its own src/, tests/, reports/) only costs file
      // handles and fires reloads for edits this app cannot see.
      ignored: [`${path.resolve(__dirname, "simple-reactflow-whiteboard")}/**`],
    },
    fs: {
      // The alias points outside this app's root (the trunk and the shared
      // pnpm store both live above apps/bbox-reactflow).
      allow: [path.resolve(__dirname, "../..")],
    },
  },
  optimizeDeps: {
    // Pre-declared for the reason apps/storybook-basics/vitest.config.ts
    // records: Vite re-optimizes when it first meets a dep mid-run, and the
    // re-optimize restarts the module graph under whatever is rendering.
    include: ["@xyflow/react"],
  },
});
