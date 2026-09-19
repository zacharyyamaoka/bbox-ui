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
    code|port|wire|region/   SCHEMA-ONLY placeholders; L1, L2, L3, L5 replace them
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

### Why the four placeholders carry a schema

`code/`, `port/`, `wire/` and `region/` each publish a `ShapeUtil` with the
**persisted props of plan §3 and nothing else** — no tool, no dock row, no face,
no bind rules. Their lanes replace the file whole.

The vocabulary is frozen in L0 because the document model is **one** contract,
not five. A record only enters a tldraw store if a registered util validates it,
so an app whose `wire/` kit is empty does not *degrade* on a board that contains
wires — it **refuses the file**. `documentModel.test.ts`'s `registry` describe is
that rule executable, and it is one of L0's acceptance lines.

Schema is shared and frozen early. Behaviour is what a lane owns — which is why
`documentModel.test.ts` still has two red cases (`canBind` on wire/region) that
belong to L3 and L5, and why `editEvents.ts` is still a throwing stub.

## Problems this lane cannot fix

Three acceptance assertions cannot be satisfied from this app's source, because
the defect is in the **committed harness**, which is off-limits to lanes. Each is
one line for whoever owns those files.

| where | what | the fix |
|---|---|---|
| `src/app.smoke.test.tsx:75,124` and 12 more sites across the later-lane smoke tests | `app.editor.createShapeId()` — `createShapeId` is a top-level `tldraw` export, not an `Editor` method. Neither the type nor the runtime has it (`grep createShapeId @tldraw/editor/dist-cjs/lib/editor/Editor.js` → nothing). 2 of 4 L0 smoke cases die on it with `TypeError: app.editor.createShapeId is not a function` | `import { createShapeId } from "tldraw"` and call it directly |
| `src/document/documentModel.test.ts:30-49`, `editEvents.test.ts` | `shapeRecord()` is typed `type: string`, but `TLShape` is a mapped type over *literal* keys (`@tldraw/tlschema` `TLGlobalShapePropsMap`), so no `string` is ever assignable. 29 `TS2322`s | type the parameter `TLShape["type"]` |
| `documentModel.test.ts:25`, `editEvents.test.ts:18` | `store.ensureStoreIsUsable()` — real at runtime, but `@internal`: `/* Excluded from this release type */` in `@tldraw/store`'s `.d.ts`. 2 `TS2339`s | call `store.ensureStoreIsUsable` through a cast, or seed the page record directly |

With those three lines changed, `pnpm --filter systemsketch typecheck` is clean:
**every one of the 45 remaining errors is in a `*.test.ts(x)` file and traces to
exactly those three causes** — zero in this app's own source
(`npx tsc -p tsconfig.json | grep -vE '\.test\.tsx?\('` prints nothing).

### And one decision nobody has made yet: tldraw's assets

`src/App.tsx` passes **no `assetUrls`**, so tldraw fetches icons, fonts,
translations and embed icons from `https://cdn.tldraw.com/5.3.2/` — 78 requests,
measured. **The app needs the network on first paint.**

The plan asks for `getAssetUrlsByImport()` from `@tldraw/assets/imports.vite`
("self-hosted, offline"). `stockBoundary.test.ts:105` refuses any `@tldraw/*`
import except `@tldraw/tlschema` from every file under `src`, and `tldraw`
re-exports no asset helper. The two rules as written cannot both hold, and a
lane may edit neither the test nor a path outside its write set.

This lane took the reversible half — CDN assets cost offline use; the source
change would turn a green acceptance gate red. `@tldraw/assets` is still a
declared dependency and still in `optimizeDeps.exclude`, so the flip is two
lines once someone rules:

- **whitelist** `@tldraw/assets` beside `tlschema` in that regex → add the
  import and `assetUrls={ASSET_URLS}`; or
- **keep the CDN** → drop the dependency and the `optimizeDeps.exclude` line.
