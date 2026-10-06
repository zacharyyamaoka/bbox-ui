// apps/bbox-reactflow/vitest.config.ts — the same two-project split as
// apps/systemsketch/vitest.config.ts, so the React Flow host is tested the way
// the tldraw studio is:
//   unit   — plain node, `src/**/*.test.ts`.
//   smoke  — real headless Chromium via @vitest/browser-playwright,
//            `src/**/*.smoke.test.tsx`, mounting the actual app.
//
// Both `extends: true`, so this app's vite.config.ts (React, Tailwind, the
// `@trunk` alias) is the single source of resolution: a test that resolved
// `@trunk` differently from the dev server would test a different app.
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";

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
          test: {
            name: "smoke",
            include: ["src/**/*.smoke.test.tsx"],
            testTimeout: 30_000,
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
              // WHY 1400×900 and not Vitest's default: the default browser
              // viewport is a PHONE (414×896), which put the studio's fixture
              // blocks off-screen and failed every drag (measured in
              // apps/systemsketch/vitest.config.ts). The two hosts are
              // compared side by side, so they share one desktop posture.
              viewport: { width: 1400, height: 900 },
              instances: [{ browser: "chromium" }],
            },
          },
        },
      ],
    },
  }),
);
