import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const TRUNK = path.resolve(__dirname, "../storybook-basics/src");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // WHY ONE alias instead of a vendored copy: this app's only source of
    // design is the trunk (apps/storybook-basics/src). A copy is what the
    // 2026-09-18 ASK ends — "we have kinda like continually extracted from
    // system sketch and now we are basically going to reimport it" — and
    // ARCHITECTURE.md:44-81 measured the last vendored copy diverging inside
    // a day. Matched by tsconfig.json's `paths` so `tsc` and Vite resolve
    // the same file; src/document/stockBoundary.test.ts fails if any source
    // file here reaches into `storybook-basics` by a relative path instead.
    alias: {
      "@trunk": TRUNK,
    },
  },
  server: {
    port: 4340,
    strictPort: true,
    fs: {
      // The alias points OUTSIDE this app's root, so the dev server has to be
      // allowed to serve the monorepo (the trunk's files and the shared pnpm
      // store both live above `apps/systemsketch`).
      allow: [path.resolve(__dirname, "../..")],
    },
  },
  optimizeDeps: {
    // NOTE: nothing imports `@tldraw/assets` today — src/App.tsx says why
    // (stockBoundary.test.ts:105 refuses the specifier from anywhere under
    // `src`, so the app runs on tldraw's CDN assets). This line and the
    // dependency are kept, not dead weight by accident: they are what makes
    // flipping back to self-hosted assets a two-line change the moment that
    // regex admits `@tldraw/assets`, and re-adding the dep later would churn
    // the lockfile for every lane.
    //
    // Copied verbatim in reasoning from apps/playground/vite.config.ts:7-15:
    // the dev server's dependency-prebundle scan cannot resolve the `?url`
    // imports inside @tldraw/assets/imports.vite.js even though the files are
    // on disk — it fails with UNLOADABLE_DEPENDENCY and crashes the dev
    // server outright. `vite build` never hits this. Excluding the package
    // from pre-bundling is tldraw's own documented workaround for
    // self-hosted assets.
    exclude: ["@tldraw/assets"],
    // tldraw pre-declared for the reason apps/storybook-basics/vitest.config.ts
    // records: Vite re-optimizes when it first meets a dep mid-run and the
    // re-optimize restarts the module graph under whatever is rendering.
    include: ["tldraw"],
  },
});
