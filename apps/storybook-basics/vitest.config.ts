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
        // WHY @xyflow/react is pre-declared: the host stories
        // (src/hosts/reactFlowHost.tsx) are the first runtime import of
        // React Flow in this app (scene.reactflow.test.ts imports types
        // only, which erase). Without the entry, a COLD first run
        // discovers the dep mid-suite, Vite re-optimizes and invalidates
        // the module graph, and React's hook dispatcher goes null inside
        // whatever story was mid-render — measured 2026-09-17: first run
        // 10 files failed with "Cannot read properties of null (reading
        // 'useMemo')", second run green on the warm cache. A fresh lane's
        // first `pnpm test-stories` must not depend on being the second
        // run.
        // tldraw is pre-declared beside it, but as INSURANCE, not a
        // measured necessity: a cold-cache run (node_modules/.vite
        // removed) with the tldraw host stories present and NO entry here
        // passed 196/197 with no mid-suite re-optimize (2026-09-17) —
        // unlike @xyflow/react, whose absence was measured red. tldraw is
        // a far bigger dependency, the failure mode is timing-dependent,
        // and the entry costs one line; keep it unless the day comes to
        // prove it matters.
        optimizeDeps: {
          // WHY each entry: Vite re-optimizes mid-suite when it first meets
          // a dep, and the re-optimize restarts the module graph under a
          // running test — measured as 10 files failing on a null hook
          // dispatcher (4ada3f8). Declaring them up front is the fix.
          // @codemirror/lint and @base-ui/react/popover joined the graph
          // with the diagnostic axis and were measured red the same way: a
          // "Re-optimizing dependencies because vite config has changed"
          // run failed once, then passed twice warm. Anything a component
          // imports lazily belongs in this list.
          include: [
            "@xyflow/react",
            "tldraw",
            "@codemirror/lint",
            "@base-ui/react/popover",
            "@base-ui/react/slider",
            // Joined the graph with the settings-panel rebuild (2026-09-22,
            // `components/scroll-area.tsx`) and was measured red the same way
            // the two above were: all 22 settings story tests failed at once
            // with "Cannot read properties of null (reading
            // 'useLayoutEffect')" in preview.tsx — the mid-suite re-optimize
            // restarting the module graph under a rendering story. Green on
            // the next run with this entry present.
            "@base-ui/react/scroll-area",
          ],
        },
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
      {
        // WHY a second project (docs/TRACE-PLAN.md D4): `src/components/elbow/`
        // is 2,500+ lines of orthogonal-routing math ported VERBATIM from
        // SystemSketch, and its 1,200-line donor test suite came with it. That
        // suite is an INDEPENDENT ORACLE — written against the donor, by the
        // donor, before this repo existed — so it cannot have been shaped to
        // whatever this port happens to do. Re-deriving those checks inside
        // play functions would produce something weaker AND authored by the
        // same hand as the port, which is the implementation grading its own
        // homework.
        //
        // It is a separate project because these are pure node tests: no DOM,
        // no browser, no Storybook. Running them in the Chromium project would
        // pay a browser tab per file for math that imports nothing.
        //
        // Run:  pnpm exec vitest --project=unit run
        // `pnpm test-stories` deliberately still runs ONLY the storybook
        // project — its name says stories, and silently widening what a
        // green `test-stories` covers is the kind of drift this config's
        // other comment exists to prevent.
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
    ],
  },
});
