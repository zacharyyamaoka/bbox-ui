import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * WHY this exists: `storyRenders[].reportedException` (read directly off
 * the Storybook preview's in-page render object) is NOT a real property —
 * it always reads `undefined`, so a story whose play function throws looks
 * identical to one that passed. That false-green probe cost hours of
 * agents trusting two silently-broken stories (PortEdge `CardsOnly`,
 * Collapsible `Reveal`). This config wires Storybook's own supported
 * mechanism instead: every story with a play function runs as a real
 * Vitest test in a real Chromium tab, with a real process exit code.
 * Run with `pnpm test-stories` (see package.json).
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
            // WHY a fixed URL, not just storybookScript: a dev server is
            // already running on 5421 (see .storybook/main.ts's `-p 5421`)
            // and must stay up for the human reviewer. The plugin probes
            // this URL first and only falls back to spawning
            // storybookScript if nothing answers — so reruns reuse the
            // live server instead of racing a second instance for the port.
            storybookUrl: "http://localhost:5421",
            storybookScript: "pnpm storybook -- --ci",
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
          // WHY no setupFiles/setProjectAnnotations here: Storybook 10.3+
          // has addon-vitest apply preview.tsx's annotations (decorators,
          // GlyphResolverProvider) automatically. A manual
          // setProjectAnnotations call makes the plugin skip that
          // automatic provisioning to avoid a conflict — confirmed via its
          // own warning banner on the first run — so omitting it is what
          // keeps the decorator wired up.
        },
      },
    ],
  },
});
