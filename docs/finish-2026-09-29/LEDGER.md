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
- FLAKY_FILES additions (W1d, 2026-09-29; same allowance, same G-FLAKE owner) — studio smoke files that went red on code byte-identical to PRE (W1d changed nothing under `apps/systemsketch/src`, the trunk or `packages/`), each reproduced on a scratch worktree at PRE `95f7906` under the same load:
  - APP `regionRigid.smoke.test.tsx` — HEAD: "a press-drag on the card's body moves frame + card + members…" (`:531`, the aimed body point is not on the card) and "a port-rail drag on the card reorders its ports…" (`:742`, `waitFor` 10 s timeout); PRE: "NO OVERLAP … Loop (placed with the tool)". Green alone 2/2 on HEAD. Likely the cross-file `localStorage` bleed W1b named (the Loop tool preference and the interface-scale `storage` event), not proven.
  - APP `openWritesNothing.smoke.test.tsx` "an edit inside the autosave debounce is written to A before B replaces it" — `:424` asserts B opened within 600 ms of the edit; 748 ms under load. Red on PRE in both runs; green alone on HEAD.
  - APP `files.smoke.test.tsx` — "P1-4: leaving a board writes the edit still inside the autosave debounce…" red on HEAD once, on PRE in both runs (PRE also: Save As…, Open recent, P1-3, native Rename); green alone on HEAD 18/18.
  - Red on PRE only (same code, run 2 at load 52–58, 33 red) — allowed on that evidence, for G-FLAKE to fix: APP interfaceScaleCommit, validationLevel, variants, arrowCycle, edgeType, railClose, settings, textEditing, traceDefaults, undoGranularity, wireTerminal, zoom (all `*.smoke.test.tsx`).
  - storybook-basics `DevPanel.stories.tsx` "Callbacks Carry The Row Id" also fails ALONE (PRE 1/5, HEAD 1/9; `:289` `userEvent.click` on an option that still has `pointer-events: none` — the popup-still-animating cause suspected for AppMenu), so one alone re-run cannot clear it: re-run it alone up to 3× before counting it. G-FLAKE fixes the test, not the allowance.

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
| W1-LAND | W1 | opus | building | W1a merged: `1195b18` (7cdabba) · `ab22b4e` (rename-and-dead-actions) · `cab8be6` (dead-settings) · `9de050e` (file-navigator-fixes) · `8953d07` merge repair · W1b merged: `a53a98e` (truthful-branch-viz-e4c8d3, tip `8200f09`) · `0344938` merge repair · W1c merged: `a671d01` (bbox-ui-toolbar-redesign-91949c, tip `e7716f6`) · `f8d5f40` merge repair · W1d merged: `ebc2bd2` (visual-language-reports-moc-279480, tip `ceaa476`) · `36a5058` (visual-lang-design-issues-1e94f4, tip `ef2fdc3`) · `1931803` (python-syntax-visualization-b86806, tip `f91ae83`) · `5c97db5` (native-file-dialog-research-2026-09-22, tip `a2310e5`) · `a17f565` (file-navigator-slow-4354e7, tip `c603fb3`) · `2410e76` (library-vs-host-rule-2026-09-19, tip `21268c2`) · `e86f0e2` (component-proposal, tip `1311bc0`) · `4fba08f` (libavoid-routing-comparison-e5175e, tip `0d674f8`) · `13448ba` PORT (node-editor-library-research-41b089, tip `d9d2721`) · W1e: `c54b2f9` PORT (host-less-shell-2026-09-19, tip `ca04bfa`) · `6d03b3f` merge repair | not audited (merges of finished branches) | W1a: typecheck clean; `pnpm -r --no-bail --workspace-concurrency=1 test` → studio 10 failed / 714 passed = exactly EXPECTED_RED (was 672 passed; the four merges add 52 incl. settingsAreWired + chromeActionsAreWired, green); bbox-ui 672/672 after the repair; storybook-basics reds only in FLAKY_FILES (each passes alone); every other package green; `pytest scripts/tests` 210 passed. Repair: rename branch edited `chromeBar.tsx` without `registry:build` → `registrySnapshot` chrome-bar stale; regenerated `public/r/chrome-bar.json` (only file shadcn build changed). W1b (PRE `dc0f079`): clean `--no-ff` merge, 31 files, all under `apps/storybook-basics/src` (components, scene, hosts, skin stories) and `docs/` report builders — nothing in `apps/systemsketch`, `packages/`, `scripts/` or any lockfile, so no pytest run was owed. Typecheck clean. Full `pnpm -r --no-bail --workspace-concurrency=1 test` on `0344938`: bbox-ui 672/672; storybook-basics 6 failed / 3,777, all six in FLAKY_FILES (BlockPortHosts, Select, AppMenu, DevPanel, FileNavigatorGeometry, FitToContentHosts), each green re-run alone; studio = EXPECTED_RED + one new FLAKY_FILES entry (see EXPECTED_RED, W1b); every other package green. Studio alone ×2 more on `0344938`: run 3 exactly the 10 EXPECTED_RED, run 4 the 10 + app.smoke (order bleed, reproduced on PRE). Repair: the branch edited `block.tsx`, `blockPort.tsx`, `blockPort.layout.ts`, `blockRegion.tsx` without `registry:build`, so `registrySnapshot` went red on 5 payloads; `shadcn build` changed exactly block-card, block-port, port-edge, block-region, labeled-group. blockRegion's new value imports (`./labeledPort`, `./portEdge`) already ship as siblings; `docs/verify_registry_install.py` installs block-card + block-port + port-edge into a scratch project, `tsc` exit 0. Items: none settled — the grammar lands in the trunk (stories + components) only; cluster 16 (branch arms: P-254, P-283, P-309, P-380) stays deferred on D10, and the studio still has no arm hits. W1c (PRE `f040adb`): clean `--no-ff` merge of Two Faces, 32 files — trunk `apps/storybook-basics/src/editor` (controlStrip, controlPanel, controlGlyphs, controlRegistry, floatingToolbar + ControlStrip/controlPanel/PaintFace stories), studio `apps/systemsketch/src/appearance/*` (customFontSize, paintLink, strokeMeta, stockPaintOverrides + tests) and `chrome/ContextualPopupMenu/*` (appearanceModel, appearanceGlyphs; `StyleRowControl`/`StyleFace`/`StyleOption`/`StyleCluster`/`OpacityCluster` deleted, `AppearanceCluster` mounted at `floatingToolbar.tsx:340`), `shapes/registry.ts`, four studio smoke tests, `docs/` report builders. No `scripts/`, launcher, lockfile or peerOwned path touched, so no pytest run was owed. Typecheck clean. Full `pnpm -r --no-bail --workspace-concurrency=1 test` on `a671d01`: studio 10 failed / 759 passed = exactly EXPECTED_RED (+45 passing: the branch's appearance unit tests and pill smoke); storybook-basics 3 failed / 3,794, all in FLAKY_FILES (DevPanel ×2, FitToContentHosts "Drag A Member (tldraw)"), both files green re-run alone (9/9); bbox-ui 3 red = registrySnapshot on control-registry, control-strip, floating-toolbar; every other package green. Studio alone again on the final tree: exactly the 10 EXPECTED_RED, 759 passed. Repair `f8d5f40`: the branch edited five registry-shipped trunk files without `registry:build`; `shadcn build` changed exactly those three payloads; none of the five sources changed an import, and `docs/verify_registry_install.py` installs control-registry + control-strip + floating-toolbar into a scratch project, `tsc` exit 0; bbox-ui 672/672 after. Items: none of W1-LAND's settled (its only item is P-101). **For later jobs:** (1) P-076's evidence (`arrangeActions.ts:245-274` STYLE_ROWS) and residual P-206's (`selectionClusters.tsx:416-432` StyleCluster, `arrangeActions.ts:304` activeStyleRows) now point at deleted code — the pill is `TWO_FACES_RECIPE` in `appearanceModel.ts:289` (shape · inside · edge · text, then Diff), rows still derived from `getSharedStyles()`. Of P-076's "left", the shape switcher is now the Shape trigger (`GeoShapeGeoStyle`, `appearanceModel.ts:154`); the 21-colour palette (it paints tldraw's 13), vertical align, line shape and start/end point are still absent — L-PILL re-scopes from there. (2) Line width is now separate from text size via shape `meta`, not a StyleProp (`src/appearance/strokeMeta.ts`, `customFontSize.ts`), and `SHAPE_UTILS` re-registers tldraw's geo/draw/line/arrow utils (`shapes/registry.ts`, `STOCK_PAINT_SHAPE_UTILS`) — B-SCHEMA must keep those meta keys and not re-add them as props; L-PILL's "title size never tied to line width" acceptance starts from this. W1d (PRE `95f7906`): eight `--no-ff` merges and one path port, all docs, reports, CLAUDE.md and one new standalone app — `git diff --quiet 95f7906 HEAD -- apps/systemsketch/src apps/storybook-basics packages` is empty (studio source, trunk and every package byte-identical to PRE; the only studio file touched is the new `apps/systemsketch/CLAUDE.md`). visual-language-reports-moc: clean; adds `apps/vocab-boards` (React Flow, 705 boards, dev port 5471, 11.9 MiB of PNGs under `public/img` now in history), its `pnpm-workspace.yaml` entry and a pure-add lockfile importer; `pnpm install --frozen-lockfile` matched, so no lockfile repair was owed. visual-lang-design-issues, python-syntax-visualization, native-file-dialog-research, file-navigator-slow: clean, builders under `docs/` only. library-vs-host-rule: clean; adds CLAUDE.md "The host apps only host" and `apps/systemsketch/CLAUDE.md`, both naming the app `apps/bbox-tldraw` (B-RENAME must carry both). component-proposal: the expected `.gitignore` conflict — its two lines (`reports/media/`, `__pycache__/`) were already on the branch, so the resolution keeps both present with no duplicate. libavoid: clean. node-editor-library-research PORT `13448ba` (`git checkout <branch> -- <paths>`, per portHunks): the five `docs/build_*_report.py`, `hundred_ideas_data.py`/`idea_diagrams.py`/`idea_visuals.py`, `docs/ideas-pipeline/*`; `docs/report_feedback.py` was byte-identical to the copy visual-language-reports-moc brought (no change); the `.claude/feedback.md` entry '2026-09-18 · Bad · reports are an input surface too' added by hand, placed by date (between the 09-19 and 09-17 entries — the ledger is newest-first); SKIPPED `apps/anchor-lab/*` and its workspace/lockfile edits, `docs/WORK-ORDER-2026-09-18.md` + `docs/build_work_order_report.py`, `reports/*.html`. No `scripts/` or launcher changed, so no pytest was owed. Typecheck clean (24 projects, vocab-boards included). Full `pnpm -r --no-bail --workspace-concurrency=1 test` ×2: vocab-boards 31/31 (new); bbox-ui 672/672 (no registry source touched, no repair); every other package green; storybook-basics 4 then 7 red, all in FLAKY_FILES (BlockPortHosts, ContextMenu, DevPanel, FitToContentHosts; Select, FitToContentHosts ×3, ContextMenu, FileNavigatorGeometry, FramesPanel), each green re-run alone except DevPanel "Callbacks Carry The Row Id", which failed its first alone re-run as well — then DevPanel alone ×5 on a scratch worktree at PRE and ×5 on HEAD (load 50–88): PRE 1/5 red with the identical `pointer-events: none` at `DevPanel.stories.tsx:289`, HEAD 0/5 — baseline flake, not W1d. Studio: run 1 lost its browser project to a peer holding :63315 (only the 31 unit files ran); then 3 full studio runs (load 23–39), each = the 10 EXPECTED_RED + 2 extras from a rotating set (app.smoke + regionRigid; openWritesNothing + regionRigid; files.smoke P1-4 + interfaceScale), every extra green alone. Oracle: the studio suite ×2 on the PRE scratch worktree under the same load → 17 and 33 red, including the same files.smoke P1-4, openWritesNothing and a regionRigid test (see EXPECTED_RED, W1d). The first run after the lockfile change printed vite's "Re-optimizing dependencies because lockfile has changed" in both browser packages, plus the studio's pre-existing `optimizeDeps.include` warnings (`@codemirror/lint`, `@base-ui/react/*`, `vitest.config.ts:42`). The seven merges were re-created with `git commit-tree` on identical trees to add the Co-Authored-By trailer before this ledger commit (old tip `826b2fb`, same tree). Items: none settled — reports, research builders and a standalone app; clusters 5/16 stay deferred on D10 (the visual-grammar proposal these reports feed). W1e (PRE `4a31eee`): PORT of host-less-shell, never merged — its merge base is `21268c2` (the library-vs-host-rule tip W1d merged), so the whole branch is 8 commits / 22 files. A merge would have been the a18c906 trap: `shell/hostPort.ts` imports `../components/floatingToolbar.placement`, which `8b4bba4` moved to `editor/`, and the branch's engine wall names `layout/` and `presets/`, both gone. Grafted by `git checkout <branch> -- <paths>`: `apps/storybook-basics/src/shell/**` (hostPort, hostContract + test, fakeHost with its four breaks, BboxShell with no windows per I3, HOST-PORT.md), `apps/bbox-no-host/**` (runner, port 4360, A0.4 smoke), `scripts/chrome_gate.sh`, `docs/assets/{chrome-gate,three-reds}.txt`, `docs/build_host_less_shell_p0_p2.py`. Adapted: the Rect/Size import repointed to `../editor/floatingToolbar.placement` (same interfaces, lines 105/112); HOST-PORT.md's pointer follows plus a note that its `chrome/<file>:<line>` citations were measured at `21268c2`, before chrome/ was foldered (TitleBar/, Toolbar/, FileMenu/, DevMenu/, ContextualPopupMenu/). `engineFree.test.ts`: main's transitive walk and three kits kept, `shell` added to `ENGINE_FREE_DIRS`, `shell/{hostPort,hostContract,fakeHost}.ts` added to the required-files list, the direct-import test's name derived from the list (the branch's A0.2 intent). `.gitignore`: both sides. `pnpm-workspace.yaml` gains `apps/bbox-no-host`; `pnpm install` wrote a lockfile delta line-for-line identical to the branch's (one importer, no version moved). `docs/WORK-ORDER-HOST-LESS-SHELL.md` was already here, byte-identical, from W1d. Proof: `vitest --project=unit src/shell/hostContract.test.ts src/engineFree.test.ts` 51/51 (the 30 contract checks on the fake, zero skipped; each of the four broken fakes fails EXACTLY its named set; capability gating); the four breaks re-run through a scratch esbuild script print output byte-identical to `docs/assets/three-reds.txt`; `pnpm smoke` in `apps/bbox-no-host` → A0.4 OK in headless Chromium (zero console errors or warnings, shell measured, host disconnect and capability toggle driven), screenshot looked at (the P0 skeleton: capability picker + "No canvas behind this shell"), port 4360 released after. Repair `6d03b3f`: the port made `pnpm -r typecheck` red — 14 TS18047/18048 in `shell/hostContract.ts` after `assert(x !== null, …)` guards. Not port damage: a scratch worktree at the branch tip `ca04bfa` reports the same 14 on the same TypeScript 5.9.3 (the branch only measured vitest, which strips types). Fix: the local `assert` annotated `asserts condition`; behaviour unchanged (three-reds still byte-identical, 51/51). Verify on `6d03b3f`: `pnpm -r typecheck` clean (24 of 25 workspace projects, bbox-no-host included); `pytest scripts/tests` 210 passed (scripts/ gained a shell script); full `pnpm -r --no-bail --workspace-concurrency=1 test` (load 44): studio 17 failed / 752 passed = the 10 EXPECTED_RED + 7 in FLAKY_FILES (interfaceScale "selection pill anchored", fileNavigatorGeometry "fully on screen… 100/125/160%", validationLevel "strict with ONE switch flipped", variants ×2 "branch/for card corners", files.smoke "Save As…" + "P1-4"), each file green re-run alone (5/5, 6/6, 3/3, 11/11, 18/18); storybook-basics 2 failed / 3,838 (+44: the contract suite), both FitToContentHosts "Drag A Member", green alone 4/4; bbox-ui 672/672; every other package green. `git diff --quiet 4a31eee HEAD -- apps/systemsketch packages` is empty — no studio or package source changed. Items: none settled (W1-LAND's only item is P-101); completeness-critic #19 (the missing workspace entry) is closed by this port. **For B-SHELL-P1:** `scripts/chrome_gate.sh` is ported verbatim and still diffs against `main` — run against this branch it reports 7 touching incl. `claude/finish-2026-09-29` itself, so evaluate it against the integration branch as lanes.json says; its only DIRTY chrome worktree, `/home/bam/bbox-ui-wiring` (`claude/app-wiring-2026-09-20`: `chromeBar.tsx` + untracked `draftSession.tsx`), was last written 2026-09-20 02:29 — stale, not a live peer. `apps/bbox-no-host` has no `test` script, so `pnpm -r test` never runs its smoke; the headless render is `pnpm --filter bbox-no-host smoke`. **Still owed in W1-LAND:** harden-menu-kit (a real merge, regenerate public/r), orthogonal-design-styles (the seven skins), w1-anchor-layout, notebook-lab's four trunk fixes + its builders, the StepIn bench, board-url's handoff half, simple-reactflow-whiteboard's `open-as-library` merge (never push), and the archive tags. |
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
| P-076 | L-PILL | queued | re-scope first: W1c (Two Faces, `a671d01`) landed the shape switcher and replaced STYLE_ROWS with `TWO_FACES_RECIPE` (`apps/systemsketch/src/chrome/ContextualPopupMenu/appearanceModel.ts:289`); still owed: 21-colour palette, vertical align, line shape, start/end point |
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
