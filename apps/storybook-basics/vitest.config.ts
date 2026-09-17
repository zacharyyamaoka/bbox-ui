import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// WHY the port is read from the environment instead of being written here:
// an agent working in its own isolated git worktree must test ITS OWN code.
// With a hardcoded `http://localhost:5421` the plugin probes that URL, finds
// the human reviewer's long-running dev server answering, and happily runs
// the whole suite against a DIFFERENT worktree's source — reporting green for
// code it never loaded. That is a silent false pass, the same failure class
// as the `reportedException` probe described below, so it gets the same
// treatment: make the shared default explicit and overridable.
//   main worktree  → nothing set, reuses the reviewer's server on 5421
//   isolated lane  → STORYBOOK_PORT=54xx, probes its own port, finds nothing,
//                    spawns its own Storybook via `storybookScript`
const STORYBOOK_PORT = process.env.STORYBOOK_PORT ?? "5421";
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? `http://localhost:${STORYBOOK_PORT}`;

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
            // WHY a URL at all, not just storybookScript: the plugin probes
            // this URL first and only falls back to spawning storybookScript
            // if nothing answers — so a rerun in the main worktree reuses the
            // reviewer's live server instead of racing it for the port. The
            // value is env-derived (see above) so an isolated lane points at
            // its own port and therefore spawns, and tests, its own source.
            storybookUrl: STORYBOOK_URL,
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
