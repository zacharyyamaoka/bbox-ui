import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig } from "vite";

import { statusEndpointPlugin } from "./statusEndpoint.ts";

/**
 * Now on the shadcn/Tailwind "stable floor" (Zach, 2026-09-16) — the
 * Tailwind v4 Vite plugin is the one thing this reset lineage adds beyond
 * the framework, same as apps/storybook/.storybook/main.ts does. No shared
 * theme import (src/globals.css is self-contained, not packages/bbox-ui's
 * theme.css) and no host-switching decorator — this app still starts a new
 * component lineage from zero, just styled now instead of unstyled.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-vitest"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(viteConfig) {
    // WHY: every component here only ever imports `react` as a type
    // (`ReactNode`/`CSSProperties`), which the automatic JSX runtime erases
    // at compile time — so Vite's dependency-scanner crawl never finds a
    // real runtime `import ... from "react"` to pre-bundle. `@storybook/react`
    // itself does default-import `react` internally, and without
    // pre-bundling, its raw CJS file gets served straight over `@fs` with no
    // default export attached: "does not provide an export named 'default'",
    // and the preview hangs forever on its loading spinner. Forcing these
    // into the optimizer sidesteps the scanner instead of fighting it.
    return mergeConfig(viteConfig, {
      // WHY statusEndpointPlugin here too, not just tailwindcss: this
      // config runs for EVERY `storybook dev` against this app — Zach's own
      // review Storybook on :5421 included — so it's the one place that
      // reaches all of them. See statusEndpoint.ts's own header.
      plugins: [tailwindcss(), statusEndpointPlugin()],
      optimizeDeps: {
        include: ["react", "react/jsx-dev-runtime", "react-dom", "react-dom/client"],
      },
    });
  },
};

export default config;
