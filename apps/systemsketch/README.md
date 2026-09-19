# systemsketch

SystemSketch, rebuilt from scratch as **bbox-ui + stock tldraw**
(`docs/SYSTEMSKETCH-REBUILD-PLAN.md`). The archive at `/home/bam/systemsketch`
stays runnable and untouched; nothing is ported from it except cited patterns.

## Run it

```bash
pnpm --filter systemsketch dev
```

→ <http://127.0.0.1:4340> (`--strictPort`, so a busy port fails loudly rather
than silently moving). Ports **4321, 4322, 4323, 4325, 5421, 5193, 5199 and
4599** belong to other services on this machine — do not rebind them.

From the repo root, `pnpm systemsketch` is the same thing.

## The one alias

Every component, layout rule and pure scene function this app renders comes
from the trunk — `apps/storybook-basics/src` — through **one** path alias:

| where | how |
|---|---|
| Vite | `resolve.alias` `@trunk` → `../storybook-basics/src` (`vite.config.ts`) |
| TypeScript | `paths` `"@trunk/*"` (`tsconfig.json`) |
| CSS | `@import "../../storybook-basics/src/globals.css"` + two `@source` lines (`src/app.css`) |

There is **no vendored copy**. `src/document/stockBoundary.test.ts` fails if any
file here reaches into `storybook-basics` by a relative path instead.

### Why `bbox-storybook-basics` is a dependency

The alias resolves trunk files **by path**, which is not the same as resolving
what those files import. Every bare import a trunk file makes (`react`,
`@base-ui/react`, `@dnd-kit/core`, `@codemirror/*`, …) is resolved by Vite
relative to the importing file — i.e. out of `apps/storybook-basics/node_modules`.
Declaring the workspace dependency is what makes
`pnpm install --filter systemsketch...` populate that directory too.

### Tailwind

`src/app.css` imports the trunk's `globals.css`, which pulls in `tailwindcss`,
`tw-animate-css` and the skin system from the sibling's `node_modules`. The two
`@source` lines are `CLAUDE.md`'s own trap: Tailwind v4 only scans the app's own
sources, so a utility used **only** by a trunk component is never generated and
paints nothing. `tailwindcss` and `tw-animate-css` are also declared here as
devDependencies, so the sibling `@import` resolves either way.

## Test it

```bash
pnpm --filter systemsketch test          # both projects
pnpm --filter systemsketch test-unit     # node: document model + stock boundary
pnpm --filter systemsketch test-smoke    # real headless Chromium, the whole App
```

The whole harness (`vitest.config.ts`, `src/testing/harness.tsx`, and every
`*.test.ts` / `*.smoke.test.tsx` under `src`) was committed **before** any lane
existed and is off-limits to the lanes: they make it pass, they do not move it.
Each `describe` names the lane that turns it green, so a red suite is the
normal state until L1/L2/L3/L5 land.

If the browser project reports `Port 63315 is already in use`, a peer session
owns Vitest's default browser port; pass your own with
`--browser.api.port=<free port>`.

## The shape of the app

```
src/
  App.tsx              composition only: <Tldraw> + the six seams it documents
  main.tsx             StrictMode + createRoot
  app.css              the trunk's stylesheet, plus two host-level overrides
  shapes/
    types.ts           the closed vocabulary — every string a .tldr carries
    registry.ts        ShapeKit per kind → shapeUtils/bindingUtils/tools/dock rows
    shared/            props validators, measurement, the gesture boundary
    block/             ss-block: THE node primitive (lane L0)
    code|port|wire|region/   placeholders; lanes L1, L2, L3, L5 replace them
  chrome/
    dock.tsx           components.Toolbar = the trunk's ToolDock, ONE system slot
    families.tsx       the rows behind tldraw's own stock families
    preferences.ts     localStorage adapter for the dock's last-used memory
    overlay.tsx        components.InFrontOfTheCanvas, fanned out to the kits
  document/            the derived scene and the edit-event seam (stubs; lane L3)
```

**The tldraw store IS the document.** Every bbox thing is a tldraw shape whose
props are the persisted state, which is what makes `persistenceKey` and a plain
`.tldr` work with zero backend — Zach's "then its truly like a whiteboard".
Reload the tab and the board is still there.

**tldraw stays stock**, 5.3.2 pinned exactly. Everything enters through
`shapeUtils` / `bindingUtils` / `tools` / `components` / `overrides` / `onMount`.
`src/document/stockBoundary.test.ts` asserts that from day 0.
