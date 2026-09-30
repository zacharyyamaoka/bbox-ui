# LEDGER — finish-2026-09-29

The resume record for `WORK-ORDER.md` §5, generated from `lanes.json`. The dispatcher (merge/integration agents only) updates a row and **commits this file** after every state change. A resumed session reads it first and skips `merged` rows.

status ∈ queued · acceptance · building · auditing · merged · failed · blocked · skipped

## EXPECTED_RED

Starts as the W0 set (`baseline.md`). A merge may not add a red outside this list. Shrinks as G-STALE, G-FLAKE and L-FILES merge.

- APP draft.smoke.test.tsx ×7 (until L-FILES)
- APP corner.smoke.test.tsx narrow 720×900 (until G-STALE)
- APP menus.smoke.test.tsx:80 burger order (until G-STALE)
- APP menus.smoke.test.tsx:130 View/Preferences/Export (until L-FILES)
- FLAKY_FILES allowance (re-run once alone; counts only if it fails again) until G-FLAKE: storybook-basics DraftBar, DevPanel, FileNavigatorGeometry, FitToContentHosts, BlockPortHosts, Grouping
- FLAKY_FILES additions (W1a, 2026-09-29; same allowance, same G-FLAKE owner): storybook-basics ContextMenu, Select, FramesPanel, QuickSwitcher, AppMenu. Evidence: 7 full storybook-basics runs on PRE `2535683` (a scratch worktree, load average 11–15 from peer sessions) failed a different 0–5 each time, including ContextMenu "Keyboard Opens Moves Activates" (2/7), Select "Default", FramesPanel "Inline Rename Failure", QuickSwitcher "Press S" — none touched by W1a. AppMenu "Rows Run And Toggles Are Checkboxes" failed 2/5 full runs on W1a's tip and 0/7 on PRE, passed 4/4 alone; its only changed import is `chromeBar.tsx`'s `title` forwarding on the file-title rows, not the burger path it fails on (`AppMenu.stories.tsx:121-135`: `openRoot` takes the first `[data-slot="dropdown-menu-content"]`, which can be the previous popup still animating closed with `pointer-events: none`). G-FLAKE: treat AppMenu as suspect, not proven innocent.
- FLAKY_FILES additions (W1b, 2026-09-29; same allowance, same G-FLAKE owner) — the first STUDIO entries, each root-caused to cross-file `localStorage` bleed between vitest-browser iframes, and neither file nor mechanism touched by W1b (the merge changed nothing under `apps/systemsketch`):
  - APP `app.smoke.test.tsx` "pressing the system face arms the Block tool…" — **order-dependent, reproduced deterministically on PRE `dc0f079`**: `vitest run src/region.smoke.test.tsx src/app.smoke.test.tsx --no-file-parallelism` fails it every time. `region.smoke.test.tsx:50` / `regionRigid.smoke.test.tsx:468` pick Loop from the system family, which persists `lastSystemTool: loop` under `systemsketch.dock-preferences.v1` (`src/chrome/ShareMenu/preferences.ts:32`); app.smoke never clears it, so its face press arms Loop (failure screenshot shows the flyout with Loop highlighted). Failed 2 of 4 full studio runs on W1b's tip; passes alone. G-FLAKE fix: clear `PREFERENCES_KEY` in the harness's `mountApp` (or app.smoke's setup), not in the acceptance assertions.
  - APP `interfaceScale.smoke.test.tsx` "keeps the selection pill anchored…" (pill walked 242 px at 150%) and APP `fileNavigatorGeometry.smoke.test.tsx` "scales what is INSIDE the frame…" — `interfaceScaleHost.tsx:82-85` listens for `storage` events, which fire in every same-origin iframe, so a concurrent file's `removeItem(INTERFACE_SCALE_STORAGE_KEY)` (settings / interfaceScaleCommit / fileNavigatorGeometry / interfaceScale teardowns) resets the scale mid-test. interfaceScale failed 1 of 4 full runs on W1b's tip, passes alone; fileNavigatorGeometry failed 1 of 2 co-runs of those four files on PRE `dc0f079`.

## W0 Baseline

Copied from `baseline.md` (planner, 2026-09-29, main `705847c`; integration branch cut at `2535683`, same code). W1a re-measures it on its own merges.

- **Typecheck:** `pnpm -r typecheck` clean across every package.
- **Studio** (`apps/systemsketch`, `pnpm exec vitest run`): **10 failed / 672 passed** (86 files, 3 failed files).
  - `draft.smoke.test.tsx` ×7 — chip reads Main; New draft enters draft mode; counts an edit; Compare opens the trunk dialog; Merge promotes; Exit leaves; survives a remount (acceptance ahead of the draft engine → L-FILES)
  - `corner.smoke.test.tsx` — narrow (720×900), bottom-right cluster 28 px over its limit (→ G-STALE)
  - `menus.smoke.test.tsx:130` — View ▸ Zoom to 100% …; Preferences ▸ always-snap …; Export … — 30 s timeout (→ L-FILES)
  - `menus.smoke.test.tsx:80` — the burger order, stale since the 09-22 channel rows (→ G-STALE)
- **storybook-basics** (`pnpm exec vitest run`): health run 1 failed / 3,676 (`DraftBar.stories.tsx:185`, `toHaveFocus`); the simulated W1 stack gave a different 0–4 failures per run in DraftBar, DevPanel, FileNavigatorGeometry, FitToContentHosts, BlockPortHosts — flaky under load (→ G-FLAKE), not merge damage.
- **Simulated W1 stack** (objects only, since removed): zero conflicts, typecheck clean, studio red = exactly main's 10.
- **Peers:** no worktree modified after 2026-09-23 at plan time; `merge-ready-integrator-2c63dc` holds a dead uncommitted merge of `1f9fd45` (already on main).

## Lanes

| lane | wave | model | status | branch/sha | audit | evidence |
|---|---|---|---|---|---|---|
| W1-LAND | W1 | opus | building | W1a merged: `1195b18` (7cdabba) · `ab22b4e` (rename-and-dead-actions) · `cab8be6` (dead-settings) · `9de050e` (file-navigator-fixes) · `8953d07` merge repair · W1b merged: `a53a98e` (truthful-branch-viz-e4c8d3, tip `8200f09`) · `0344938` merge repair | not audited (merges of finished branches) | W1a: typecheck clean; `pnpm -r --no-bail --workspace-concurrency=1 test` → studio 10 failed / 714 passed = exactly EXPECTED_RED (was 672 passed; the four merges add 52 incl. settingsAreWired + chromeActionsAreWired, green); bbox-ui 672/672 after the repair; storybook-basics reds only in FLAKY_FILES (each passes alone); every other package green; `pytest scripts/tests` 210 passed. Repair: rename branch edited `chromeBar.tsx` without `registry:build` → `registrySnapshot` chrome-bar stale; regenerated `public/r/chrome-bar.json` (only file shadcn build changed). W1b (PRE `dc0f079`): clean `--no-ff` merge, 31 files, all under `apps/storybook-basics/src` (components, scene, hosts, skin stories) and `docs/` report builders — nothing in `apps/systemsketch`, `packages/`, `scripts/` or any lockfile, so no pytest run was owed. Typecheck clean. Full `pnpm -r --no-bail --workspace-concurrency=1 test` on `0344938`: bbox-ui 672/672; storybook-basics 6 failed / 3,777, all six in FLAKY_FILES (BlockPortHosts, Select, AppMenu, DevPanel, FileNavigatorGeometry, FitToContentHosts), each green re-run alone; studio = EXPECTED_RED + one new FLAKY_FILES entry (see EXPECTED_RED, W1b); every other package green. Studio alone ×2 more on `0344938`: run 3 exactly the 10 EXPECTED_RED, run 4 the 10 + app.smoke (order bleed, reproduced on PRE). Repair: the branch edited `block.tsx`, `blockPort.tsx`, `blockPort.layout.ts`, `blockRegion.tsx` without `registry:build`, so `registrySnapshot` went red on 5 payloads; `shadcn build` changed exactly block-card, block-port, port-edge, block-region, labeled-group. blockRegion's new value imports (`./labeledPort`, `./portEdge`) already ship as siblings; `docs/verify_registry_install.py` installs block-card + block-port + port-edge into a scratch project, `tsc` exit 0. Items: none settled — the grammar lands in the trunk (stories + components) only; cluster 16 (branch arms: P-254, P-283, P-309, P-380) stays deferred on D10, and the studio still has no arm hits. Remaining W1 items (toolbar-redesign onward) not started. |
| G-FLAKE | W2 | sonnet | queued | | | |
| G-STALE | W2 | sonnet | queued | | | |
| B-DEPS | W2 | opus | queued | | | |
| B-SCHEMA | W2 | opus | queued | | | |
| B-SHELL-P1 | W2 | opus | queued | | | |
| L-WIRE-GESTURE | W3 | sonnet | queued | | | |
| L-WIRE-PAINT | W3 | sonnet | queued | | | |
| L-ROUTE | W3 | sonnet | queued | | | |
| L-BLOCK-VIEWS | W3 | sonnet | queued | | | |
| L-PORTS-RAIL | W3 | sonnet | queued | | | |
| L-PORTS-SHAPE | W3 | sonnet | queued | | | |
| L-MEMBERS | W3 | opus | queued | | | |
| L-CODE | W3 | sonnet | queued | | | |
| L-DIAG | W3 | sonnet | queued | | | |
| L-LINKING | W3 | opus | queued | | | |
| L-GLYPH | W3 | sonnet | queued | | | |
| L-COMPARE | W3 | sonnet | queued | | | |
| L-GESTURES | W3 | sonnet | queued | | | |
| L-MENU-CONTEXT | W4 | sonnet | queued | | | |
| L-PILL | W4 | sonnet | queued | | | |
| L-INSPECTOR | W4 | opus | queued | | | |
| L-FILES | W4 | sonnet | queued | | | |
| L-NAV | W4 | sonnet | queued | | | |
| L-RF-HOST | W4 | opus | queued | | | |
| EXT-SWITCHER | W4 | (peer) | queued | | | |
| L-REG | W3 | opus | queued | | | |
| L-DOCS-COMPONENTS | W4 | sonnet | queued | | | |
| L-DOCS-EDITOR | W4 | sonnet | queued | | | |
| L-DOCS-SCENE-HOSTS | W4 | sonnet | queued | | | |
| B-RENAME | W5 | sonnet | queued | | | |
| W5-VERIFY | W5 | opus | queued | | | |

## Items and cluster ids (G3)

| id | lane | status | user action / command (file:line) or reason |
|---|---|---|---|
| P-101 | W1-LAND | done | Settings ▸ Mouse and scrolling ▸ "Copy/paste under cursor" switch `apps/storybook-basics/src/editor/settingsCategories.tsx:389` → `onGesturesChange` = `patchGestures` `apps/systemsketch/src/chrome/ShareMenu/appSettings.tsx:263` → `installPasteAtCursor` (mounted `apps/systemsketch/src/App.tsx:169`) writes `editor.user.updateUserPreferences({ isPasteAtCursorMode })` at `apps/systemsketch/src/chrome/ShareMenu/cameraGestureHost.tsx:248` → read by tldraw 5.3.2's own paste handler `node_modules/tldraw/src/lib/ui/hooks/useClipboardEvents.ts:959` (and :945 for Shift+paste). Duplicate half: `apps/systemsketch/src/chrome/ShareMenu/duplicateAtPointer.ts` via `OVERRIDES.actions`. Test: `apps/systemsketch/src/pasteUnderCursor.smoke.test.tsx` (5 tests, green; tracks both directions and a live change). Merged `cab8be6`. |
| P-098 | L-WIRE-GESTURE | queued | |
| P-221 | L-WIRE-GESTURE | queued | |
| P-013 | L-WIRE-GESTURE | queued | |
| P-116 | L-WIRE-GESTURE | queued | |
| P-058 | L-WIRE-GESTURE | queued | |
| P-123 | L-WIRE-GESTURE | queued | |
| P-268 (cluster 9: Port and wiring gestures) | L-WIRE-GESTURE | queued | |
| P-299 (cluster 9: Port and wiring gestures) | L-WIRE-GESTURE | queued | |
| P-340 (cluster 9: Port and wiring gestures) | L-WIRE-GESTURE | queued | |
| P-361 (cluster 9: Port and wiring gestures) | L-WIRE-GESTURE | queued | |
| P-392 (cluster 9: Port and wiring gestures) | L-WIRE-GESTURE | queued | |
| P-247 (cluster 10: Arrow tool, routing kinds, edge topology) | L-WIRE-GESTURE | queued | |
| P-316 (cluster 10: Arrow tool, routing kinds, edge topology) | L-WIRE-GESTURE | queued | |
| P-360 (cluster 10: Arrow tool, routing kinds, edge topology) | L-WIRE-GESTURE | queued | |
| P-434 (cluster 10: Arrow tool, routing kinds, edge topology) | L-WIRE-GESTURE | queued | |
| P-444 (cluster 10: Arrow tool, routing kinds, edge topology) | L-WIRE-GESTURE | queued | |
| P-456 (cluster 10: Arrow tool, routing kinds, edge topology) | L-WIRE-GESTURE | queued | |
| P-097 | L-WIRE-PAINT | queued | |
| P-096 | L-WIRE-PAINT | queued | |
| P-156 | L-WIRE-PAINT | queued | |
| P-171 | L-WIRE-PAINT | queued | |
| P-137 | L-WIRE-PAINT | queued | |
| P-121 | L-WIRE-PAINT | queued | |
| P-257 (cluster 11: Cable anchoring, appearance, control points) | L-WIRE-PAINT | queued | |
| P-328 (cluster 11: Cable anchoring, appearance, control points) | L-WIRE-PAINT | queued | |
| P-364 (cluster 11: Cable anchoring, appearance, control points) | L-WIRE-PAINT | queued | |
| P-416 (cluster 11: Cable anchoring, appearance, control points) | L-WIRE-PAINT | queued | |
| P-054 | L-ROUTE | queued | |
| P-167 | L-ROUTE | queued | |
| P-103 | L-ROUTE | queued | |
| P-015 | L-BLOCK-VIEWS | queued | |
| P-212 | L-BLOCK-VIEWS | queued | |
| P-141 | L-BLOCK-VIEWS | queued | |
| P-166 | L-BLOCK-VIEWS | queued | |
| P-155 | L-BLOCK-VIEWS | queued | |
| P-190 | L-BLOCK-VIEWS | queued | |
| P-019 | L-BLOCK-VIEWS | queued | |
| P-059 | L-BLOCK-VIEWS | queued | |
| P-086 | L-BLOCK-VIEWS | queued | |
| P-183 | L-BLOCK-VIEWS | queued | |
| P-169 | L-BLOCK-VIEWS | queued | |
| P-185 | L-BLOCK-VIEWS | queued | |
| P-146 | L-BLOCK-VIEWS | queued | |
| P-177 | L-BLOCK-VIEWS | queued | |
| P-242 (cluster 13: Multi-select batch edits) | L-BLOCK-VIEWS | queued | |
| P-275 (cluster 13: Multi-select batch edits) | L-BLOCK-VIEWS | queued | |
| P-315 (cluster 13: Multi-select batch edits) | L-BLOCK-VIEWS | queued | |
| P-355 (cluster 13: Multi-select batch edits) | L-BLOCK-VIEWS | queued | |
| P-398 (cluster 13: Multi-select batch edits) | L-BLOCK-VIEWS | queued | |
| P-246 (cluster 14: Block sizing and defaults) | L-BLOCK-VIEWS | queued | |
| P-255 (cluster 14: Block sizing and defaults) | L-BLOCK-VIEWS | queued | |
| P-273 (cluster 14: Block sizing and defaults) | L-BLOCK-VIEWS | queued | |
| P-400 (cluster 14: Block sizing and defaults) | L-BLOCK-VIEWS | queued | |
| P-461 (cluster 14: Block sizing and defaults) | L-BLOCK-VIEWS | queued | |
| P-011 | L-PORTS-RAIL | queued | |
| P-119 | L-PORTS-RAIL | queued | |
| P-107 | L-PORTS-RAIL | queued | |
| P-118 | L-PORTS-RAIL | queued | |
| P-134 | L-PORTS-RAIL | queued | |
| P-078 | L-PORTS-RAIL | queued | |
| P-219 | L-PORTS-RAIL | queued | |
| P-269 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-270 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-271 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-345 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-356 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-358 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-386 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-395 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-433 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-458 (cluster 8: Port view customization (Altium-style)) | L-PORTS-RAIL | queued | |
| P-099 | L-PORTS-SHAPE | queued | |
| P-248 (cluster 4: Type-mismatch validation) | L-PORTS-SHAPE | queued | |
| P-332 (cluster 4: Type-mismatch validation) | L-PORTS-SHAPE | queued | |
| P-272 (cluster 6: Port defaults, literal display, grammar pick) | L-PORTS-SHAPE | queued | |
| P-313 (cluster 6: Port defaults, literal display, grammar pick) | L-PORTS-SHAPE | queued | |
| P-432 (cluster 6: Port defaults, literal display, grammar pick) | L-PORTS-SHAPE | queued | |
| P-446 (cluster 6: Port defaults, literal display, grammar pick) | L-PORTS-SHAPE | queued | |
| P-450 (cluster 6: Port defaults, literal display, grammar pick) | L-PORTS-SHAPE | queued | |
| P-451 (cluster 6: Port defaults, literal display, grammar pick) | L-PORTS-SHAPE | queued | |
| P-250 (cluster 7: Port paint states) | L-PORTS-SHAPE | queued | |
| P-287 (cluster 7: Port paint states) | L-PORTS-SHAPE | queued | |
| P-399 (cluster 7: Port paint states) | L-PORTS-SHAPE | queued | |
| P-408 (cluster 7: Port paint states) | L-PORTS-SHAPE | queued | |
| P-188 | L-MEMBERS | queued | |
| P-161 | L-MEMBERS | queued | |
| P-079 | L-MEMBERS | queued | |
| P-201 | L-MEMBERS | queued | |
| P-208 | L-MEMBERS | queued | |
| P-110 | L-MEMBERS | queued | |
| P-226 | L-MEMBERS | queued | |
| P-064 | L-CODE | queued | |
| P-065 | L-CODE | queued | |
| P-068 | L-CODE | queued | |
| P-075 | L-CODE | queued | |
| P-128 | L-CODE | queued | |
| P-091 | L-CODE | queued | |
| P-127 | L-CODE | queued | |
| P-264 (cluster 18: Code cell: origin state and display) | L-CODE | queued | |
| P-278 (cluster 18: Code cell: origin state and display) | L-CODE | queued | |
| P-279 (cluster 18: Code cell: origin state and display) | L-CODE | queued | |
| P-321 (cluster 18: Code cell: origin state and display) | L-CODE | queued | |
| P-431 (cluster 18: Code cell: origin state and display) | L-CODE | queued | |
| P-442 (cluster 18: Code cell: origin state and display) | L-CODE | queued | |
| P-142 | L-DIAG | queued | |
| P-100 | L-DIAG | queued | |
| P-112 | L-DIAG | queued | |
| P-074 | L-LINKING | queued | |
| P-109 | L-LINKING | queued | |
| P-210 | L-LINKING | queued | |
| P-211 | L-LINKING | queued | |
| P-213 | L-GLYPH | queued | |
| P-191 | L-COMPARE | queued | |
| P-330 (cluster 24: Diff, lint, golden tooling) | L-COMPARE | queued | |
| P-368 (cluster 24: Diff, lint, golden tooling) | L-COMPARE | queued | |
| P-413 (cluster 24: Diff, lint, golden tooling) | L-COMPARE | queued | |
| P-425 (cluster 24: Diff, lint, golden tooling) | L-COMPARE | queued | |
| P-448 (cluster 24: Diff, lint, golden tooling) | L-COMPARE | queued | |
| P-449 (cluster 24: Diff, lint, golden tooling) | L-COMPARE | queued | |
| P-464 (cluster 24: Diff, lint, golden tooling) | L-COMPARE | queued | |
| P-239 | L-GESTURES | queued | |
| P-126 | L-GESTURES | queued | |
| P-260 (cluster 12: Hit-region tuning and overlays) | L-GESTURES | queued | |
| P-318 (cluster 12: Hit-region tuning and overlays) | L-GESTURES | queued | |
| P-331 (cluster 12: Hit-region tuning and overlays) | L-GESTURES | queued | |
| P-406 (cluster 12: Hit-region tuning and overlays) | L-GESTURES | queued | |
| P-437 (cluster 12: Hit-region tuning and overlays) | L-GESTURES | queued | |
| P-462 (cluster 12: Hit-region tuning and overlays) | L-GESTURES | queued | |
| P-241 (cluster 34: Selection/edit chrome parity nits) | L-GESTURES | queued | |
| P-244 (cluster 34: Selection/edit chrome parity nits) | L-GESTURES | queued | |
| P-297 (cluster 34: Selection/edit chrome parity nits) | L-GESTURES | queued | |
| P-327 (cluster 34: Selection/edit chrome parity nits) | L-GESTURES | queued | |
| P-010 | L-MENU-CONTEXT | queued | |
| P-133 | L-MENU-CONTEXT | queued | |
| P-178 | L-MENU-CONTEXT | queued | |
| P-154 | L-MENU-CONTEXT | queued | |
| P-056 | L-MENU-CONTEXT | queued | |
| P-130 | L-MENU-CONTEXT | queued | |
| P-051 | L-MENU-CONTEXT | queued | |
| P-052 | L-PILL | queued | |
| P-102 | L-PILL | queued | |
| P-076 | L-PILL | queued | |
| P-319 (cluster 15: Text/size vocabulary) | L-PILL | queued | |
| P-396 (cluster 15: Text/size vocabulary) | L-PILL | queued | |
| P-404 (cluster 15: Text/size vocabulary) | L-PILL | queued | |
| P-415 (cluster 15: Text/size vocabulary) | L-PILL | queued | |
| P-447 (cluster 15: Text/size vocabulary) | L-PILL | queued | |
| P-057 | L-INSPECTOR | queued | |
| P-063 | L-INSPECTOR | queued | |
| P-138 | L-INSPECTOR | queued | |
| P-139 | L-INSPECTOR | queued | |
| P-149 | L-INSPECTOR | queued | |
| P-152 | L-INSPECTOR | queued | |
| P-196 | L-INSPECTOR | queued | |
| P-202 | L-INSPECTOR | queued | |
| P-218 | L-INSPECTOR | queued | |
| P-200 | L-INSPECTOR | queued | |
| P-083 | L-INSPECTOR | queued | |
| P-144 | L-INSPECTOR | queued | |
| P-194 | L-INSPECTOR | queued | |
| P-274 (cluster 33: Inspector presentation and field commit) | L-INSPECTOR | queued | |
| P-439 (cluster 33: Inspector presentation and field commit) | L-INSPECTOR | queued | |
| P-020 | L-FILES | queued | |
| P-017 | L-FILES | queued | |
| P-105 | L-FILES | queued | |
| P-176 | L-FILES | queued | |
| P-329 (cluster 21: Export) | L-FILES | queued | |
| P-393 (cluster 21: Export) | L-FILES | queued | |
| P-407 (cluster 21: Export) | L-FILES | queued | |
| P-249 (cluster 22: File resilience and format housekeeping) | L-FILES | queued | |
| P-277 (cluster 22: File resilience and format housekeeping) | L-FILES | queued | |
| P-312 (cluster 22: File resilience and format housekeeping) | L-FILES | queued | |
| P-346 (cluster 22: File resilience and format housekeeping) | L-FILES | queued | |
| P-405 (cluster 22: File resilience and format housekeeping) | L-FILES | queued | |
| P-435 (cluster 22: File resilience and format housekeeping) | L-FILES | queued | |
| P-070 | L-NAV | queued | |
| P-215 | L-NAV | queued | |
| P-276 (cluster 20: Pages, frames panel, imports, history) | L-NAV | queued | |
| P-307 (cluster 20: Pages, frames panel, imports, history) | L-NAV | queued | |
| P-311 (cluster 20: Pages, frames panel, imports, history) | L-NAV | queued | |
| P-323 (cluster 20: Pages, frames panel, imports, history) | L-NAV | queued | |
| P-350 (cluster 20: Pages, frames panel, imports, history) | L-NAV | queued | |
| P-240 (cluster 29: Toolbar/title chrome and notices) | L-NAV | queued | |
| P-280 (cluster 29: Toolbar/title chrome and notices) | L-NAV | queued | |
| P-284 (cluster 29: Toolbar/title chrome and notices) | L-NAV | queued | |
| P-381 (cluster 29: Toolbar/title chrome and notices) | L-NAV | queued | |
| P-384 (cluster 29: Toolbar/title chrome and notices) | L-NAV | queued | |
| P-418 (cluster 29: Toolbar/title chrome and notices) | L-NAV | queued | |
| P-262 (cluster 30: Release/version status) | L-NAV | queued | |
| P-303 (cluster 30: Release/version status) | L-NAV | queued | |
| P-463 (cluster 30: Release/version status) | L-NAV | queued | |
| P-238 | EXT-SWITCHER | queued | |

## Found done or obsolete at dispatch; follow-ups outside a write set

| id | lane | verdict | evidence |
|---|---|---|---|
| P-186 residual (paste-at-cursor) | W1-LAND | done (via P-101) | `residuals.json` `alreadyCoveredBy: P-101`; same wiring as the P-101 row, merged `cab8be6`. The sibling residual P-186/P-245 (wheel bindings, `cameraGestureHost.tsx:190-203` "NOT APPLIED, and deliberately") is unchanged and stays deferred. |

## Finish-line gates (W5)

| gate | evidence |
|---|---|
| G1 nothing stranded | |
| G2 green ×5 | |
| G3 studio parity (items + cluster ids) | |
| G4 one shell, two hosts | |
| G5 registry ships | |
| G6 stable / preview (peer lane merged; serving waits on D11) | |
