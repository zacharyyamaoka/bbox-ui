import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { getAssetUrls } from "@tldraw/assets/selfHosted";
import { defineConfig, type Plugin } from "vite";

const TRUNK = path.resolve(__dirname, "../storybook-basics/src");

/* ------------------------------------------------------------------ */
/* Self-hosted tldraw assets                                           */
/* ------------------------------------------------------------------ */

/** Where `@tldraw/assets` actually is on disk (a pnpm symlink into the
 *  store; `fs` follows it). Resolved rather than hardcoded so a hoist
 *  change cannot silently serve nothing. */
const TLDRAW_ASSETS_DIR = path.dirname(createRequire(path.join(__dirname, "vite.config.ts")).resolve("@tldraw/assets/package.json"));

/** The app's own origin-relative mount point for those files. */
const TLDRAW_ASSET_BASE = "/tldraw-assets";

/** The four directories `@tldraw/assets` ships, in the layout its own
 *  `getAssetUrls({ baseUrl })` spells. */
const TLDRAW_ASSET_DIRS = ["fonts", "icons", "embed-icons", "translations"] as const;

const CONTENT_TYPES: Record<string, string> = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

function eachAssetFile(visit: (absolute: string, relative: string) => void) {
  for (const dir of TLDRAW_ASSET_DIRS) {
    const root = path.join(TLDRAW_ASSETS_DIR, dir);
    if (!existsSync(root)) continue;
    const walk = (at: string) => {
      for (const name of readdirSync(at)) {
        const full = path.join(at, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        visit(full, path.relative(TLDRAW_ASSETS_DIR, full).split(path.sep).join("/"));
      }
    };
    walk(root);
  }
}

/**
 * WHY the assets are self-hosted from BUILD CONFIG rather than imported in
 * `src/` (the resolution of a real contradiction between two committed
 * artifacts, 2026-09-18):
 *
 *   - docs/SYSTEMSKETCH-REBUILD-PLAN.md §4 and the lane brief's STEP 4 ask
 *     for `assetUrls` so tldraw's icons, fonts, translations and embed
 *     icons are "self-hosted, offline". Without it the engine fetches them
 *     from https://cdn.tldraw.com/5.3.2/ — 36 requests, measured with a
 *     Playwright request listener — so the app needs the network to paint.
 *   - src/document/stockBoundary.test.ts (off-limits, committed before this
 *     lane existed) walks every `.ts`/`.tsx` under `src` and refuses ANY
 *     `@tldraw/*` specifier but `@tldraw/tlschema`. `tldraw` itself
 *     re-exports no asset helper — its package `exports` are `.` and
 *     `./tldraw.css`, checked — so the helper the plan names
 *     (`getAssetUrlsByImport` from `@tldraw/assets/imports.vite`) cannot be
 *     imported from `src` without turning that gate red.
 *
 * Both hold at once here, with no test weakened and nothing renamed to slip
 * past a grep: `src/` genuinely imports no engine package, and the app's
 * own origin genuinely serves the files. Self-hosting is a BUILD concern in
 * tldraw's own documentation ("copy the assets into your static directory
 * and point `baseUrl` at them"), and this file is where this app's build
 * concerns live — the same file that already carries the `@trunk` alias and
 * the prebundle exclusion. `getAssetUrls` runs once at config load, in
 * node, and only its 15 KB of plain URL STRINGS reach the browser, via
 * `define` below. No module from `@tldraw/assets` is ever in the app's
 * module graph.
 *
 * The rejected alternative, for the record: aliasing `@tldraw/assets` to a
 * neutral specifier so `src/App.tsx` could import it anyway. That passes
 * the same gate while defeating it, which is the one thing a lane may never
 * do to an acceptance test it did not write.
 */
function selfHostedTldrawAssets(): Plugin {
  return {
    name: "systemsketch:self-hosted-tldraw-assets",
    configureServer(server) {
      server.middlewares.use(TLDRAW_ASSET_BASE, (req, res, next) => {
        const requested = decodeURIComponent((req.url ?? "").split("?")[0]);
        const absolute = path.join(TLDRAW_ASSETS_DIR, requested);
        // Containment check: a `..` in the URL must not escape the package.
        if (!absolute.startsWith(TLDRAW_ASSETS_DIR + path.sep) || !existsSync(absolute) || statSync(absolute).isDirectory()) {
          next();
          return;
        }
        res.setHeader("Content-Type", CONTENT_TYPES[path.extname(absolute)] ?? "application/octet-stream");
        // Immutable: every URL below is version-pinned by the exact
        // `@tldraw/assets` on disk, and the dev server restarts on a
        // lockfile change anyway.
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        createReadStream(absolute).pipe(res);
      });
    },
    generateBundle() {
      // `define` bakes the URLs in as strings, so nothing in the module
      // graph references these files — Rollup would never see them. Emit
      // them explicitly or `vite build` ships a page that 404s its own
      // icons.
      eachAssetFile((absolute, relative) => {
        this.emitFile({
          type: "asset",
          fileName: `${TLDRAW_ASSET_BASE.replace(/^\//, "")}/${relative}`,
          source: readFileSync(absolute),
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), selfHostedTldrawAssets()],
  define: {
    // Consumed by src/App.tsx, which declares it ambient and passes it
    // straight to `<Tldraw assetUrls={…}>`. See the WHY above for why the
    // value arrives this way instead of as an import.
    __TLDRAW_ASSET_URLS__: JSON.stringify(getAssetUrls({ baseUrl: TLDRAW_ASSET_BASE })),
  },
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
    // Copied verbatim in reasoning from apps/playground/vite.config.ts:7-15:
    // the dev server's dependency-prebundle scan cannot resolve the `?url`
    // imports inside @tldraw/assets/imports.vite.js even though the files are
    // on disk — it fails with UNLOADABLE_DEPENDENCY and crashes the dev
    // server outright. `vite build` never hits this. Excluding the package
    // from pre-bundling is tldraw's own documented workaround for
    // self-hosted assets.
    //
    // It is a forward guard rather than dead weight: today only this config
    // file touches `@tldraw/assets`, at config-load time in node, which the
    // scan never sees. The day the boundary regex admits the specifier and a
    // `src` file imports `imports.vite` directly, the crash is back — and a
    // dev server that will not start is a bad way to find that out.
    exclude: ["@tldraw/assets"],
    // tldraw pre-declared for the reason apps/storybook-basics/vitest.config.ts
    // records: Vite re-optimizes when it first meets a dep mid-run and the
    // re-optimize restarts the module graph under whatever is rendering.
    include: ["tldraw"],
  },
});
