# Lane finish:B-SHELL-P1 — lift the chrome behind HostPort (host-less shell P1)

_Stream plan: `docs/finish-2026-09-29/WORK-ORDER.md` + `docs/finish-2026-09-29/lanes.json` (lanes.json wins) + `docs/WORK-ORDER-HOST-LESS-SHELL.md` §P1 (the source of truth for P1; lanes.json overrides it on the gate, the peer files and the two extras) · repo: **bbox-ui** · base: `claude/finish-2026-09-29` @ `75991ce` · wave W2, beside B-SCHEMA (disjoint write sets) · dependsOn: G-STALE (merged `74c79c1`), G-FLAKE (queued at BASE — the dispatcher cuts the builder after it merges) · model: opus · size L · **barrier on `chrome/`**: no canvas lane is cut until this merges_

APP = `apps/systemsketch` (display name "bbox studio"; no rename here — B-RENAME runs at the end). TRUNK = `apps/storybook-basics/src`.

## What changed since the host-less order was written (09-19)

- **P0 is on the base.** W1e ported it (`c54b2f9`): `TRUNK/shell/{hostPort,hostContract,fakeHost,BboxShell}.ts(x)`, `HOST-PORT.md`, `apps/bbox-no-host` (in `pnpm-workspace.yaml:8`), `scripts/chrome_gate.sh`. The contract is green on the fake host and its four broken fakes fail exactly their named checks (`hostContract.test.ts`, 51/51 together with `engineFree.test.ts` on BASE). The port has 4 capabilities (`history`, `tools`, `duplicate`, `documentIo`), not the order's 5 — `HOST-PORT.md` "Capabilities — four, not five".
- **`chrome/` was foldered by surface** (Two Faces, the file-navigator and settings work): `TitleBar/chromeBar.tsx`, `Toolbar/dock.tsx`, `ContextualPopupMenu/*`, `FileMenu/*`, `DevMenu/*`, `ShareMenu/*`, `FocusLens/*`, `CompareView/*`, `ZoomMenu/*`, plus flat `overlay.tsx`, `panels.tsx`, `statusStrip.tsx`, `problems.ts`, `frames.ts`, `families.tsx`, `cornerClusterForm.ts`, `inspectorFollowsSelection.ts`, and the peer's `sites/legacyApp/siteStatus.ts`. 44 non-test source files, 25 importing from `tldraw` (some type-only). Every `chrome/<file>:<line>` in the host-less order and in `HOST-PORT.md` is stale; the table below is this tree's.
- **Undo/Redo are no longer a pill.** They are Edit ▸ rows running tldraw's own actions (`FileMenu/stockMenus.ts`; Zach 2026-09-19 "Undo redo should be hidden"), pinned by `menus.smoke.test.tsx:47`. The `chrome.undoRedo` affordance (`hostPort.ts`) therefore gates the Edit ▸ Undo/Redo rows the SHELL supplies to a host that brings none (the no-host app); the studio keeps tldraw's rows.
- **The right rail has a third surface, the Inspector** (`panels.tsx`, `inspectorFollowsSelection.ts`), owned next by L-INSPECTOR (W4).
- **G-STALE stacked the narrow corner** (`cornerClusterForm.ts`, `overlay.tsx:86-93` `STACKED_STRIP_CLASS`, `data-corner-form`, `statusStrip.tsx:256` `--ss-strip-columns`). LEDGER follow-up: this lane carries all of it through the lift; `corner.smoke.test.tsx:116` is the guard.
- **The Stable/Preview switcher is held back from main** (`ad5e8e5` reverts `8779ef0`): `scripts/launch_systemsketch.py` is live again and `apps/systemsketch/stable-preview.json` does not exist. Leave both, and every peer file, alone.

## Status of every id this lane carries

`lanes.json` B-SHELL-P1 has `items: []` and `clusters: []`; no row of `backlog-verified.json`, `residuals.json` or `untriaged-clusters.md` names it (re-scanned by regex on BASE; only `completeness-critic.md` #4, #18, #19 and two LEDGER follow-ups do). The ids are therefore its four acceptance lines, its six `extra` lines, and the follow-ups routed to it.

| id | status | evidence (this tree, `75991ce`) |
|---|---|---|
| `SHELL-P1/contract-fake` — contract green on the fake host, broken fakes red (acceptance 1, first half) | **done-already** (guard) | `TRUNK/shell/hostContract.test.ts` green on BASE, 4 broken fakes each failing their exact set (`:86-111`). Read-only for the builder. |
| `SHELL-P1/contract-tldraw` — contract green on the tldraw host (acceptance 1, A1.2) | **build** | `tldrawHostPort.smoke.test.tsx` "SHELL-P1/contract-tldraw" — red: the adapter does not exist. |
| `SHELL-P1/engine-wall` — nothing under TRUNK/shell imports tldraw or @xyflow (acceptance 2, A1.3) | **done-already** (guard) | `engineFree.test.ts:88` (`ENGINE_FREE_DIRS` has `shell`), `:108-110` (named shell files). Green on BASE; must stay green with the lifted files. |
| `SHELL-P1/no-red` — no red outside EXPECTED_RED; no chrome smoke edited (acceptance 3) | **build** (dispatcher measures at merge) | `pnpm -r --workspace-concurrency=1 test` vs `LEDGER.md` EXPECTED_RED; `git diff --stat <BASE>..<tip> -- 'apps/systemsketch/src/*.smoke.test.tsx' apps/systemsketch/src/testing` must be EMPTY. |
| `SHELL-P1/no-host-windows` — bbox-no-host renders every window on the fake host, headless screenshot (acceptance 4, A1.5) | **build** | `apps/bbox-no-host/scripts/windows.acceptance.mjs` — red: 12 of 14 checks. |
| extra 1 — §P1, D1–D5 frozen | **build** (the lane) | D1 is pinned by `SHELL-P1/residual-scene` + `HOST-PORT.md` constraint 7: the shell holds no document copy. |
| extra 2 — re-confirm the §4.2 disposition table | **done** (this brief, table below) + **build** | `shellLift.test.ts` "SHELL-P1/disposition" ×7 — red: the app mounts all seven windows, the shell none. |
| extra 3 — beside B-SCHEMA, disjoint | **done-already** | B-SCHEMA writes `APP/src/shapes/**/[A-Z]*ShapeUtil.tsx`, `shapes/shared/props.ts`, `document/*` tests + fixtures; this lane none of them (write set below). Scheduling is the dispatcher's. |
| extra 4 — the gate, against the integration branch | **done** (measured below) | Gate open. |
| extra 5 — focusLens / compareView / problems read the port's cached `scene()` (`SHELL-P1/residual-scene`) | **build** | `shellLift.test.ts` "SHELL-P1/residual-scene" — red: `compareView.tsx`, `focusLens.tsx`, `problems.ts` ×1 each. `tldrawHostPort.smoke.test.tsx` "SHELL-P1/residual-scene" — red: no adapter. |
| extra 6 — chromeActionsAreWired scans TRUNK/shell, quarantine re-homed (`SHELL-P1/guard-scan`) | **build** | `chromeActionsAreWired.test.ts` "B-SHELL-P1 …" ×2 — red: shell not in the corpus; `chrome/TitleBar/chromeBar.tsx :: onBack` still keyed to the app. |
| A1.4 pointer pass-through (`SHELL-P1/pass-through`) | **build** | `shellLift.smoke.test.tsx` — red: no `[data-slot="bbox-shell"]` in the studio. |
| A1.4 pill tracks `selection().screenBounds`, hides mid-drag (`SHELL-P1/pill-tracks`) | **build** | `shellLift.smoke.test.tsx` — red: no adapter. |
| the lift itself — windows inside the shell (`SHELL-P1/windows-in-shell`) | **build** | `shellLift.smoke.test.tsx` — red: no `[data-slot="bbox-shell"]`. |
| A1.4 journey: burger ▸ File, dock tools, A cycles arrows, undo/redo, Frames/Problems, zoom readout, open/save — "behaviour must match" | **done-already** (guards) | Pinned by the existing smoke files, which the builder may not edit: `menus.smoke`, `arrowCycle.smoke`, `app.smoke`, `railClose.smoke`, `zoom.smoke`, `files.smoke`, `selectionPill.smoke`, `pillGeometry.smoke`, `chromeSize.smoke`, `corner.smoke`, `interfaceScale.smoke`, `inspector.smoke`, `focusLens.smoke`, `compare.smoke`, `devtools.smoke`, `variants.smoke`. |
| G-STALE → B-SHELL-P1: carry the narrow-corner stack | **build** (guard) | `corner.smoke.test.tsx:116` (narrow) green on BASE; must stay green, unedited. |
| G-STALE → W5 "or the B-SHELL-P1 lift": grid / zoom / dev / help one click when stacked | **build** (guard, green at BASE) | `shellLift.smoke.test.tsx` "G-STALE carry" — green on BASE (every strip button hit-tests to itself at 720×900); the lift moves the strip, so it must stay green. |
| completeness-critic #19 — bbox-no-host in the workspace | **done-already** | `pnpm-workspace.yaml:8`; `pnpm --filter bbox-no-host typecheck` exit 0 on BASE. |
| ARCHITECTURE.md shell layer + the D1–D5 decision record (host-less order §7) | **follow-up** → dispatcher at merge | Outside this write set (`ARCHITECTURE.md`, `docs/`). |
| a `test` script for `apps/bbox-no-host` so `pnpm -r test` carries the windows acceptance | **follow-up** → dispatcher | Lanes never touch `package.json` (WORK-ORDER §3 W2). Until then the dispatcher runs `node apps/bbox-no-host/scripts/windows.acceptance.mjs` at every merge. |
| owners for the tldraw-side files P1 leaves under `chrome/**` (`rules.writeSets`) | **follow-up** → dispatcher | Table below names the owner lanes.json already gives; the unnamed ones need one before W3/W4 is cut. |

## The gate (lanes.json extra 4) — measured on BASE, against `claude/finish-2026-09-29`, not main

For every branch, `git diff --quiet $(git merge-base claude/finish-2026-09-29 <b>) <b> -- apps/systemsketch/src/chrome apps/systemsketch/src/main.tsx apps/systemsketch/src/App.tsx`: 3 of 287 refs touch the chrome write set, **all three dispositioned** (`branch-dispositions.json`, LEDGER G1):

- `claude/board-url-2026-09-20`: ported, W1i `824529f`.
- `claude/review-boards-2026-09-19`: archived, superseded.
- `worktree-bridge-cse_017xqRi8VPYSzshszPLmYuKu`: archived, superseded.

`lab-extract` is unrelated history. EXT-SWITCHER (the one live chrome writer) merged and was then held back (`ad5e8e5`). **Gate open** on branches. One thing a branch diff cannot see (`scripts/chrome_gate.sh`'s own caveat): at authoring time the MAIN checkout `/home/bam/bbox-ui` had chrome files with mtimes under 3 h old (`statusStrip.tsx`, `cornerClusterForm.ts`, `overlay.tsx`, `TitleBar/chromeBar.tsx`, `ShareMenu/*`, `arrangeActions.ts` …) — the G-STALE files among them, so most likely a checkout; besides this run's own fresh lane worktrees no other worktree had any. The dispatcher confirms no live peer is editing there before the builder starts (`rules.peerOwned`, "a peer is observed").

## §4.2, re-confirmed against this tree

"Shell" = the window is mounted and wired in `TRUNK/shell` over `HostPort`. "Host" = stays in the app as the tldraw slot adapter or as host-supplied content the shell renders. Each "host" call is the acceptance author's, made because the code speaks tldraw or the app's own vocabulary (`DocNodeData`, `PORT_SIDES`, `BlockShape` props), and is reversible by a later lane.

| today (`APP/src/chrome/…`) | disposition in P1 | owner of what stays app-side | pinned by |
|---|---|---|---|
| `TitleBar/chromeBar.tsx` | **shell**: `ChromeBar` + burger assembly (`buildAppMenu`), the inert depth arrows/badge exactly as today, board name from `documentName()` / `setDocumentName()` with the `"Untitled board"` fallback, the confirm dialog. **Host-supplied**: the file session's group, title, rename and navigator (`files/session.tsx`, outside this write set), the Settings surface (`ShareMenu/appSettings.tsx`), the Compare group, the site + legacy rows (peer files), tldraw's Edit/View/Export/Preferences rows (`FileMenu/stockMenus.ts`), toasts | L-NAV (crumbs, arrows, help — in shell), L-FILES (draft chip — in shell) | disposition `ChromeBar`; windows-in-shell; guard-scan; `menus.smoke`, `files.smoke`, `settings.smoke`, `sites.smoke`, `legacy.smoke` |
| `Toolbar/dock.tsx` | **shell**: `ToolDock` over `tools()` / `setTool()`, the remembered member per family, the library cell. **Host**: the catalogue rows and icons (`families.tsx`, `shapes/registry` `SYSTEM_FAMILY_ITEMS`), `withArrowPresetCycle`, `installArrowPresets`, and the variant→style translation inside the port's `setTool` (`dock.tsx:206-227` is the reference; HOST-PORT.md "a variant is just a tool id") | L-GLYPH owns `families.tsx` | disposition `ToolDock`; `arrowCycle.smoke`, `app.smoke`, `chromeSize.smoke`, `corner.smoke` (the dock's box) |
| `statusStrip.tsx`, `ZoomMenu/zoomMenu.tsx` | **shell**: `StatusStrip`, the Frames/Problems launchers, the zoom readout over `viewport().zoom`, the stacked-form column count. **Host-supplied items, in today's order**: grid (a tldraw preference), dev, help (tldraw's shortcuts dialog), and the zoom menu's rows (tldraw's stock `view-zoom` actions) | — | disposition `StatusStrip`; no-host zoom check; `zoom.smoke`, `railClose.smoke`, `chromeSize.smoke`, G-STALE carry |
| `panels.tsx` | **shell**: `PanelShell`, one surface at a time, Escape closes, the surface switch, `FramesPanel`, `ProblemsPanel`. **Host-supplied**: the Inspector surface (`InspectorPanel` stays app-side until L-INSPECTOR), the Frames items (`frames.ts`: regions and expanded blocks are app vocabulary, previews need page bounds) and the Problems findings (`problems.ts`: `PORT_SIDES`, `FLOATING_PORT_ID`, the validation level). Reveal = `select` + `view({ kind: "fit", ids })` | L-INSPECTOR (Inspector + `inspectorFollowsSelection.ts`), L-NAV (`frames.ts`), L-WIRE-GESTURE then L-DIAG (`problems.ts`) | disposition `PanelShell`/`FramesPanel`/`ProblemsPanel`; `railClose.smoke`, `inspector.smoke`, `inspectorOpens.smoke`, `menus.smoke:211,225` |
| `problems.ts`, `FocusLens/focusLens.tsx`, `CompareView/compareView.tsx` | **host**, but each reads the PORT's cached `scene()`, never `useDocumentScene` (the residual) | L-WIRE-GESTURE/L-DIAG, — , L-COMPARE | residual-scene ×2; `focusLens.smoke`, `compare.smoke`, `backend/backend.test.ts` |
| `ContextualPopupMenu/floatingToolbar.tsx` | **shell**: the placement loop over `selection().screenBounds`, `viewport()`, `interaction()`; Duplicate (gated by `duplicate`) and Delete over `nodes()`. **Host-supplied**: the content clusters (`selectionClusters.tsx`, view/language/edge-type/tunnel/arrange/appearance/focus/group), the overlay inset (tldraw's `SELECTION_OVERLAY_INSET` = 5) and the dock obstacle height | L-PILL (clusters), L-ROUTE (`arrangeActions.ts`) | disposition `FloatingToolbar`; pill-tracks; `selectionPill.smoke`, `pillGeometry.smoke`, `interfaceScale.smoke` |
| `overlay.tsx` | **host — the slot adapter**: mounts the shell (`BboxShell` + its windows) in `InFrontOfTheCanvas`, supplies the port, keeps the kits' `Overlay`s, `usePassThroughWheelEvents`, and the corner placement against tldraw's licence watermark; keeps re-exporting `CORNER_INSET`, `placeCornerCluster`, `watermarkCoverRect`, `CornerRect` | — | pass-through; windows-in-shell; `corner.smoke`, `cornerPlacementSettings.smoke` |
| `cornerClusterForm.ts` (+ test) | **host** (moves only if the corner placement does; the `./chrome/overlay` re-export stays) | — | `corner.smoke`, `cornerClusterForm.test.ts` |
| `FileMenu/fileActions.ts` | **host**: the body of the port's `serialize()` / `load()` (`serializeBoard`, `loadBoardText`); exports stay at this path | — | contract-tldraw (document group); `regionRigid.smoke` imports it |
| `FileMenu/stockMenus.ts`, `ContextualPopupMenu/{selectionActions,arrangeActions,appearanceModel,appearanceGlyphs,selectionClusters,viewHotkeys}`, `DevMenu/{devtools,variantSwitch}`, `ShareMenu/*`, `FocusLens/focusVisibility.ts`, `inspectorFollowsSelection.ts`, `families.tsx` | **host** (tldraw actions, shape props, `getShapeVisibility`, the app's settings and preference stores). `variantSwitch` is TEMPORARY and stays in the corner row | L-MENU-CONTEXT (`devtools.tsx`), L-ROUTE, L-PILL, L-INSPECTOR, L-GLYPH, L-WIRE-GESTURE (`validationLevelHost.ts`); the rest unnamed | the smoke files that import them (list in "Do not touch") |
| `sites.ts`, `legacyApp.ts`, `siteStatus.ts` (+ tests) | **untouched** — host-supplied burger rows (lanes.json `rules.peerOwned`) | peer / B-RENAME | `sites.smoke`, `files.smoke` |

## Write set (the ONLY paths you may create or edit) — re-issued against `75991ce`

- `apps/storybook-basics/src/shell/**`, **except** `hostContract.ts` and `hostContract.test.ts` (P0's contract and its teeth are the ruler now).
- `apps/systemsketch/src/chrome/**`, **except** `sites.ts`, `legacyApp.ts`, `siteStatus.ts` and their `*.test.ts`. New: `apps/systemsketch/src/chrome/tldrawHostPort.ts`. Existing `chrome/**/*.test.ts` files: import-path fixes only, each declared in the commit message.
- `apps/systemsketch/src/App.tsx`, `apps/systemsketch/src/main.tsx`.
- `apps/bbox-no-host/**`, **except** `scripts/windows.acceptance.mjs` and `package.json`.
- `apps/systemsketch/src/chromeActionsAreWired.test.ts`: ONLY `sourceFiles` / `FILES` (add `TRUNK/shell` as a root, key its files `@trunk/shell/<path>`), the header's `SCOPE:` paragraph (it says "deliberately not the trunk"; make it say why `shell/` is the exception), and the `QUARANTINE` keys (re-home a moved control's key; its excuse text unchanged). Never the corpus case, the ratchet cases or the `B-SHELL-P1` block.
- `apps/systemsketch/src/chrome/README.md` (the folder map).

## Do not touch

- The acceptance: `apps/systemsketch/src/tldrawHostPort.smoke.test.tsx`, `apps/systemsketch/src/shellLift.smoke.test.tsx`, `apps/systemsketch/src/shellLift.test.ts`, `apps/bbox-no-host/scripts/windows.acceptance.mjs`, and the parts of `chromeActionsAreWired.test.ts` named above.
- `TRUNK/shell/hostContract.ts`, `TRUNK/shell/hostContract.test.ts`, `TRUNK/engineFree.test.ts`, `APP/src/document/stockBoundary.test.ts`.
- **Every `APP/src/*.smoke.test.tsx`** and `APP/src/testing/**` (lanes.json: "no chrome smoke edited"). These test files import from chrome paths and must keep resolving — keep a re-export at each path if what they import moves:
  - `./chrome/overlay` → `CORNER_INSET`, `placeCornerCluster`, `watermarkCoverRect`, `CornerRect` (`corner.smoke`)
  - `./chrome/ShareMenu` → `PREFERENCES_KEY`, `setInterfaceScalePercent`, `patchGestureSettings`, `resetCameraGestureCache`, `patchAppearancePreferences` (`arrowCycle`, `fileNavigatorGeometry`, `interfaceScale(Commit)`, `pasteUnderCursor`, `settings`, `wheelConvention` smoke)
  - `./chrome/ShareMenu/cornerPlacementHost` → `CORNER_PLACEMENT_STORAGE_KEY`; `./chrome/ShareMenu/validationLevelHost` → `resetValidationLevelCache`, `setValidationLevel`
  - `./chrome/FileMenu/fileActions` → `loadBoardText`, `serializeBoard`; `./chrome/ContextualPopupMenu/selectionActions` → `setBlockView` (`regionRigid.smoke`)
  - `./chrome/DevMenu/variantSwitch` → `PORT_VARIANT_STORAGE_KEY`, `REGION_VARIANT_STORAGE_KEY`, `APP_DEFAULT_PORT_VARIANT`, `APP_DEFAULT_REGION_VARIANT`
  - `./chrome/legacyApp` → `LEGACY_SYSTEMSKETCH_URL`; `./chrome/sites` → `BBOX_UI_SITE_URL`, `STORYBOOK_URL`
  - `../chrome/problems` → `boardLintFindings`, `shapeIdOfSubject` (`backend/backend.test.ts`)
- Peer-owned (`rules.peerOwned`): `scripts/launch_systemsketch.py`, `scripts/tests/*launch*`, `assets/bbox-ui.desktop`, `APP/src/chrome/{sites,legacyApp,siteStatus}.ts`, `APP/devFileHost.ts`, `scripts/dock_icon.py`, `scripts/launch_bboxui.py`, `APP/stable-preview.json` (absent since `ad5e8e5`; do not recreate it).
- `APP/src/{files,document,shapes,backend,source,review,appearance}/**` (B-SCHEMA runs beside you in `shapes/` and `document/`).
- `TRUNK` outside `shell/`: `editor/`, `components/`, `scene/`, `hosts/`, `skin/`, `lib/`. If the shell needs a trunk-kit change, stop and report it.
- `package.json` (every one), `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `vite.config.ts`, `vitest.config.ts`.
- `packages/**`, `apps/docs/**`, `apps/bbox-reactflow/**`, `ARCHITECTURE.md`, `CLAUDE.md`, `docs/finish-2026-09-29/**`.
- `/home/bam/systemsketch`, `/home/bam/pyblocks`, `/home/bam/zach_brain`, `/home/bam/simple-reactflow-whiteboard*`.

## Acceptance (assertions you cannot edit)

1. `apps/systemsketch`: `pnpm exec vitest --project=smoke run src/tldrawHostPort.smoke.test.tsx src/shellLift.smoke.test.tsx` — all 6 green:
   - **SHELL-P1/contract-tldraw** — `runHostContract` over `createTldrawHostPort(editor)` on a seeded two-block board: zero violations, **zero skipped**, ≥ 30 checks.
   - **SHELL-P1/residual-scene** — `port.scene()` keeps its reference through a camera move, a pointer move and a selection change (while `useDocumentScene`'s derivation provably rebuilds over the same ticks), and a document write replaces it with the new position.
   - **SHELL-P1/windows-in-shell** — the studio has `[data-slot="bbox-shell"]`; the chrome bar (`[role=toolbar][aria-label="Board and depth navigation"]`), the status strip, the visible pill and the right rail are inside its `[data-slot="bbox-shell-windows"]`, each measured on screen.
   - **SHELL-P1/pass-through** — the press point on a block is inside the shell's box, `elementFromPoint` lands on `.tl-canvas`, and a CDP press-drag of (150, 90) moves the block by (150, 90) ± 2 px.
   - **SHELL-P1/pill-tracks** — `selection().screenBounds` equals the engine's selection bounds, container-relative (± 0.5 px); the pill's top-left equals the trunk's `placeFloatingToolbar` fed the PORT's bounds and `SELECTION_OVERLAY_INSET` (± 2 px), on select and after `nodes(update)` moves the block; mid-drag `interaction()` reads `"moving"` and the pill is hidden; after the drop `"idle"` and placed again.
   - **G-STALE carry** (green at BASE) — at 720×900 the strip is two rows and every one of its buttons hit-tests to itself.
2. `apps/systemsketch`: `pnpm exec vitest --project=unit run src/shellLift.test.ts src/chromeActionsAreWired.test.ts` — all green:
   - **SHELL-P1/disposition** ×7 — `ChromeBar`, `ToolDock`, `StatusStrip`, `PanelShell`, `FloatingToolbar`, `FramesPanel`, `ProblemsPanel` are each value-imported by a file under `TRUNK/shell` and by **no** app file. Parts of those modules (`ChromeBarIcons`, `StatusDot`, `PILL_POPOVER`, `PILL_SURFACE_HEX`, `ProblemsBadge`) may stay where they are.
   - **SHELL-P1/residual-scene** — no `useDocumentScene(` call in `APP/src` or `TRUNK/shell` (comments stripped; the definition in `document/sceneFromStore.ts` stays).
   - **SHELL-P1/guard-scan** ×2 — `@trunk/shell/BboxShell.tsx` and > 4 shell files are in the corpus; every quarantined `onBack`/`onForward`/`onJumpToLevel`/`crumbs`/`depth` key starts with `@trunk/shell/` and is found by the scan. The guard's own ratchet stays green (nothing deleted, nothing newly inert).
3. `node apps/bbox-no-host/scripts/windows.acceptance.mjs` exits 0 (14 checks; its own vite on :4362 — set `NO_HOST_ACCEPTANCE_PORT` if taken), and **look at** the screenshot it prints. The checks: the dev handle `window.bboxNoHost.port`; chrome bar, dock and strip on screen, inside the windows layer, not overlapping; readout 100 % → `zoomTo(2)` → 200 %; Frames → Problems → closed; the pill centred on `selection().screenBounds` ± 2 px and clear of it; Duplicate / Delete through the port; Edit ▸ Undo and Redo, Undo restoring; File ▸ `Open…` and `Save`; each capability off hides exactly its affordance (dock; Duplicate; Undo/Redo; Open…/Save); no host → no dock, no pill; no console error or warning all run.
4. Guards, unedited and green: `pnpm --filter bbox-storybook-basics exec vitest --project=unit run src/shell/hostContract.test.ts src/engineFree.test.ts`; `apps/systemsketch` `pnpm exec vitest --project=unit run src/document/stockBoundary.test.ts`; every smoke file named in the status table; `git grep -n -E "from ['\"](tldraw|@tldraw|@xyflow)" apps/storybook-basics/src/shell` empty.
5. `pnpm -r typecheck` exit 0. At merge the dispatcher runs `pnpm -r --workspace-concurrency=1 test` and the windows script: no red outside `LEDGER.md` EXPECTED_RED, and `git diff --stat <BASE>..<tip> -- 'apps/systemsketch/src/*.smoke.test.tsx' apps/systemsketch/src/testing apps/storybook-basics/src/shell/hostContract.ts apps/storybook-basics/src/shell/hostContract.test.ts` EMPTY.

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/systemsketch/src/tldrawHostPort.smoke.test.tsx`
- `apps/systemsketch/src/shellLift.smoke.test.tsx`
- `apps/systemsketch/src/shellLift.test.ts`
- `apps/systemsketch/src/chromeActionsAreWired.test.ts` (the corpus case and the `B-SHELL-P1` block)
- `apps/bbox-no-host/scripts/windows.acceptance.mjs`

### Red now, for the right reason (BASE `75991ce`, 2026-10-06)

- `vitest --project=unit run src/shellLift.test.ts src/chromeActionsAreWired.test.ts`: **10 failed, 12 passed.** The 7 disposition cases fail at the shell half (`no file under TRUNK/shell mounts ChromeBar — it has not been lifted`; the app mounts them from `TitleBar/chromeBar.tsx`, `Toolbar/dock.tsx`, `statusStrip.tsx`, `panels.tsx` ×3, `ContextualPopupMenu/floatingToolbar.tsx`). Residual: `["chrome/CompareView/compareView.tsx ×1", "chrome/FocusLens/focusLens.tsx ×1", "chrome/problems.ts ×1"]`. Guard-scan: `TRUNK/shell is not in this guard's corpus` and `chrome/TitleBar/chromeBar.tsx :: onBack still names the app's copy of the bar`. The reader's self-test and the non-vacuity case pass; the guard's own 10 cases pass.
- `vitest --project=smoke run src/tldrawHostPort.smoke.test.tsx src/shellLift.smoke.test.tsx`: **5 failed, 1 passed.** contract-tldraw, residual-scene, pill-tracks: `B-SHELL-P1 builds apps/systemsketch/src/chrome/tldrawHostPort.ts … — it does not exist yet` (loaded through `import.meta.glob`, so it is an assertion, not a resolution error). windows-in-shell, pass-through: `waitFor timed out … the studio mounts the shell's container ([data-slot=bbox-shell] …)`. G-STALE carry: green.
- `node apps/bbox-no-host/scripts/windows.acceptance.mjs`: **12 of 14 checks failed** (`window.bboxNoHost.port is not set`; no chrome bar, readout, launcher, dock or burger on the fake host). The two that pass ("no host → no dock, no pill"; "no console error") pass because nothing is rendered yet; they keep their teeth once windows exist.

### Feasibility, measured (a throwaway spike, NEVER committed)

The acceptance author wrote a ~150-line `createTldrawHostPort` against tldraw signals, ran the three adapter-dependent tests, then deleted it: **contract-tldraw green (30 checks, 0 skipped — with a two-tool catalogue, see Traps), residual-scene green, pill-tracks green against today's pill.** Then mutated it — each went red for the stated reason:
- the scene derived over `editor.store.allRecords()` → residual-scene: `scene() was rebuilt by a camera/pointer/selection tick`;
- the test's overlay inset 0 instead of 5 → pill-tracks: `pill at (423.0, 359.0) … says (423, 364)`;
- `interaction()` never "moving" → `interaction() to read "moving" mid-drag (reads idle)`;
- `undo()` a no-op → contract-tldraw: 3 `[history]` violations.

## Builder brief

Work in your isolated worktree. First Bash call `pwd`; run git only as plain `git …` there (`rules.isolatedGit`). `pnpm install --frozen-lockfile` once. Never `git add -A`: stage explicit pathspecs and read `git diff --cached --name-only` before every commit. The acceptance files are read-only; "cannot pass → FAIL plus the one-line fix" is a valid return. No audits (`rules.noAudits`). Browser tests share vitest's port 63315 with every other worktree: run only the files you need; if it is busy, wait (`timeout 570 tail --pid=<holder> -f /dev/null`) and retry, never kill. Stop every process you start (`rules.processes`). Long suites: `rules.longRuns`.

READ FIRST: `docs/WORK-ORDER-HOST-LESS-SHELL.md` §1–§5 and §P1; `apps/storybook-basics/src/shell/HOST-PORT.md` (all — constraint 7, the stability rule, is the one that bites); `shell/hostPort.ts`, `shell/BboxShell.tsx` (`useHostPort`, `useAffordance`, `useHostValue`), `shell/fakeHost.ts`; `CLAUDE.md` "The host apps only host"; `.claude/feedback.md` 2026-09-19 (chrome lives in the trunk, the app only mounts and configures); then every chrome file in the disposition table, and the acceptance files.

**Defaults already decided — do not reopen them:**
- **D1 (host-less order):** the host owns its document; the shell reads a derived `scene()` and issues commands. No shell-side copy, no sync engine.
- **D3 / I1:** the shell is the trunk kit `TRUNK/shell` (+ the thin runner `apps/bbox-no-host`), reached through `@trunk/*`; no `packages/` dir, no npm.
- **D4 / I3:** the contract landed first (P0, on the base); this lane lifts the windows; the React Flow host is L-RF-HOST (W4), which mounts THIS shell — so everything a second host would need lives in `TRUNK/shell`, not the app.
- **I4 / WORK-ORDER D3:** no rename; `apps/systemsketch` stays (B-RENAME runs at the end).
- **WORK-ORDER D2:** the lane lands on `claude/finish-2026-09-29` through the dispatcher. Never main, never push.
- **WORK-ORDER D9 is overridden by `rules.noAudits`:** no audit of any kind.
- **The stop rule (host-less §P1, kept):** any behaviour change, or the port needs more than two verbs beyond what `hostPort.ts` has today (19 members), or a trunk-kit file outside `shell/` must change → stop and report which call site forced it. Do not bend a contract or a test to pass.
- **The acceptance author's calls (in the table above), each reversible:** the adapter is `APP/src/chrome/tldrawHostPort.ts` exporting `createTldrawHostPort(editor: Editor): HostPort` and declaring all four capabilities; the studio mounts P0's `BboxShell` (its `data-slot`s unchanged) in tldraw's `InFrontOfTheCanvas` through `overlay.tsx`, with tldraw as the canvas behind it; the studio keeps tldraw's toasts and dialogs (`menus.smoke:43`) — the shell takes them as a host-supplied seam; the Frames items, the Problems findings, the Inspector surface and the pill's content clusters stay host-supplied; `useDocumentScene`'s three callers read `port.scene()`; `bbox-no-host` exposes `window.bboxNoHost = { port }` (the live port, `null` when disconnected) in dev, the way the studio exposes `window.editor` (`main.tsx:19-21`).

**Build in this order** (each step leaves the studio's own smoke files green before the next):

1. **`chrome/tldrawHostPort.ts`, alone.** `HostPort` over `Editor`: `scene()` = `sceneFromRecords` over the SHAPE and BINDING records only (`editor.store.query.records("shape" | "binding")`), memoised as a tldraw `computed`, so a camera/pointer/selection tick cannot rebuild it; `NodePatch.data` keys the projection does not own are merged and round-tripped (the contract writes `contractProbe` and `variant`; the spike kept them in `shape.meta`); `selection()` covers every selected record, stock geo/arrow too (`pillGeometry.smoke` selects geo), bounds = `getSelectionRotatedScreenBounds()` minus `getViewportScreenBounds()`'s origin (`floatingToolbar.tsx:117-133` is the reference); `interaction()` maps the four `isIn` reads at `floatingToolbar.tsx:142`; `tools()` = the dock's catalogue with variant ids, `setTool` translating them (`dock.tsx:206-227`); `nodes()` is one undo step unless inside `transact`; `transact(…, { undoable: false })` = `editor.run(fn, { history: "ignore" })` (`variantSwitch.tsx`'s call site); `serialize`/`load` = `serializeBoard`/`loadBoardText` (`FileMenu/fileActions.ts`). Gate: `tldrawHostPort.smoke.test.tsx` green.
2. **The shell's windows in `TRUNK/shell`**, one per §4.2 "shell" row, each moved with a provenance header naming the source file and `75991ce` and keeping its WHY comments (Zach's stated preferences live in them — the pill is FigJam's, the corner avoids the licence watermark, undo/redo hidden, honestly-disabled arrows, one rail surface at a time). Re-express `editor.*` over the port; take host-only content as props/slots. Each window hides when `useAffordance` says the host lacks it — never a disabled control, never a throw.
3. **The slot adapter.** `overlay.tsx` mounts the shell in `InFrontOfTheCanvas` with the port and the host-supplied content; `App.tsx` keeps its `components` slots (the dock may stay in `components.Toolbar` if that is what keeps its box — `chromeSize.smoke`/`corner.smoke` measure it). The shell's container must let a press through anywhere no window is (`pass-through`). Re-export every path in "Do not touch". Gate: the smoke files in the status table, then `shellLift.smoke.test.tsx`.
4. **The residual.** `focusLens.tsx`, `compareView.tsx`, `problems.ts` read the port's `scene()` (through `useHostValue`/`useHostPort`, or the port handed in), never `useDocumentScene`. Gate: `shellLift.test.ts`, `focusLens.smoke`, `compare.smoke`, `backend/backend.test.ts`.
5. **The guard.** Extend `chromeActionsAreWired.test.ts`'s `sourceFiles`/`FILES` to `TRUNK/shell` keyed `@trunk/shell/<path>`; re-home the moved `QUARANTINE` keys, excuse text unchanged. Mutation-test it (WORK-ORDER §4 step 4): add a scratch `onFoo={() => {}}` to a shell file → red; remove → green. Say so in the commit.
6. **`apps/bbox-no-host`.** Mount the same shell windows on `createFakeHost`, with the capability picker it already has; give the fake host whatever host-supplied content the windows need (empty Frames, `lintScene` problems, no Inspector); `window.bboxNoHost`. Gate: `windows.acceptance.mjs` exit 0 — and open the screenshot.
7. **`chrome/README.md`**: the folder map after the lift.

**Traps, measured:**
- tldraw's `store.listen` is throttled to the next frame; the contract's `subscribe` check counts a notification synchronously after `select`. A tldraw `react()` effect is synchronous (the spike used it, skipping its first run).
- **What the spike did NOT prove:** its catalogue was only `select` and `hand`. The contract arms EVERY catalogue id and reads it back through `tools().active` ("setTool is readable back, including a variant id"), so with the real dock catalogue each arrow preset and geo variant must report itself as active after `setTool` — `dock.tsx:206-227` translates them one way only today.
- Node order must survive `serialize` → `load` byte-for-byte (`hostContract.ts` compares JSON snapshots); the spike sorted the scene's nodes by id. Choose an order and say why in a WHY.
- `BboxShell` paints `EmptyCanvas` when `background` is nullish — on the studio that text would sit over tldraw. Its root and canvas layer are not `pointer-events: none` today; the pass-through test is what says whether yours are.
- `useHostValue` caches by notification version (`BboxShell.tsx`); a selector that allocates is fine, a getter that allocates is not (constraint 7).
- `scripts/smoke.mjs` (A0.4) writes `docs/assets/no-host-shell.png`, untracked and outside your write set — never stage it.
- The vitest iframe is CSS-scaled ~0.8×; drive real pointers through the CDP affine map the acceptance already carries (`interfaceScaleCommit.smoke.test.tsx:53-134`, copied into `shellLift.smoke.test.tsx`).

**Name the user action** (WORK-ORDER §4 step 3): for each lifted window, the `file:line` in `TRUNK/shell` where the control a person presses calls the port, in the commit message.

**Out of scope:** wiring any quarantined control (L-NAV: arrows, crumbs, help), the context menu (L-MENU-CONTEXT), the Inspector rebuild (L-INSPECTOR), the draft chip (L-FILES), pill content (L-PILL), the React Flow host (L-RF-HOST), the rename (B-RENAME), `ARCHITECTURE.md` and the D1–D5 decision record (dispatcher, at merge), a `test` script for bbox-no-host (dispatcher), deploys.

## Ownership after P1 (`rules.writeSets` — one owner per tldraw-side file left under `chrome/**`)

Named by `lanes.json` today: `problems.ts` → L-WIRE-GESTURE (polarity rows) then L-DIAG (subject index); `ShareMenu/validationLevelHost.ts` → L-WIRE-GESTURE; `ContextualPopupMenu/arrangeActions.ts` → L-ROUTE; `families.tsx` → L-GLYPH; `CompareView/**` → L-COMPARE; `DevMenu/devtools.tsx` → L-MENU-CONTEXT; `inspectorFollowsSelection.ts` → L-INSPECTOR; `frames.ts` → L-NAV; the pill's app-side wiring (`selectionClusters.tsx`, `selectionActions.ts`, `appearance*`) → L-PILL; `Drafts/**` (new) → L-FILES. **Unnamed, for the dispatcher before W3/W4 is cut:** `tldrawHostPort.ts`, `overlay.tsx`, `cornerClusterForm.ts`, `FocusLens/**`, `FileMenu/**`, `ShareMenu/*` (other than validationLevelHost), `DevMenu/variantSwitch.tsx`, `ContextualPopupMenu/viewHotkeys.tsx`, and whatever of `statusStrip.tsx` / `Toolbar/dock.tsx` / `ZoomMenu/` stays app-side.
