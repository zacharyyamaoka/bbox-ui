// apps/systemsketch/vitest.config.ts — the acceptance harness for the
// rebuild (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5). COMMITTED BEFORE ANY LANE
// EXISTS and off-limits to builders: the lanes make it pass, they do not
// move it.
//
// Two projects, the same split as apps/storybook-basics/vitest.config.ts:
//   unit   — plain node, `src/**/*.test.ts`. The stock-boundary test, the
//            document-model round trip, the edit-event translation. No DOM.
//   smoke  — real headless Chromium via @vitest/browser-playwright,
//            `src/**/*.smoke.test.tsx`. Mounts the actual <App/>, drives it
//            with Playwright-backed input, reads the editor and the DOM.
//
// Both `extends: true` so the app's own vite.config.ts (React plugin,
// Tailwind plugin, the `@trunk` alias, strict port) is the single source of
// resolution — a test that resolved `@trunk` differently from the dev server
// would test a different app.
import { defineConfig, mergeConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            environment: "node",
            include: ["src/**/*.test.ts"],
          },
        },
        {
          extends: true,
          // WHY these are pre-declared (copied reasoning from
          // apps/storybook-basics/vitest.config.ts:52-88): Vite re-optimizes
          // mid-suite when it first meets a dep, and the re-optimize restarts
          // the module graph under a running test.
          optimizeDeps: {
            include: ["tldraw", "@codemirror/lint", "@base-ui/react/popover", "@base-ui/react/menu", "@base-ui/react/toolbar"],
          },
          test: {
            name: "smoke",
            include: ["src/**/*.smoke.test.tsx"],
            // A whole tldraw editor per test: give it room.
            testTimeout: 30_000,
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
              instances: [{ browser: "chromium" }],
            },
          },
        },
      ],
    },
  }),
);
