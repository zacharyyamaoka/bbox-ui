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
- FLAKY_FILES additions (W1f, 2026-09-30; same allowance, same G-FLAKE owner). None of these files is touched by W1f. For the storybook-basics files, every relative and `@trunk/*` import was resolved recursively, and the closure contains **zero** files W1f changed, so the code under test is byte-identical to PRE `6d43a70`. Each is green when re-run alone:
  - storybook-basics `BlockRegionViews.stories.tsx` "Empty": `:169` clicks a Select option that still has `pointer-events: none`, which is the popup-still-animating class already named for AppMenu and DevPanel. Red in both full runs on the W1f tip (loads 55–65 and 35–45), green alone 4/4, and green in a third full storybook run at load 45.
  - storybook-basics `ExpandedPortSpacing.stories.tsx` "Push Neighbours": drag measured 361.59 px against 250.39. `FitToContent.stories.tsx` "Distribution Changes The Floor": 29.3 against 42. `FrameAutoPortEdges.stories.tsx` "Drag a child port to each wall": 1 against 2. Each failed in one full run and was green alone (1/1, 1/1, 2/2).
  - storybook-basics unit `stockPrimitives.test.ts` "stock dialog …" and `editor/trunkOwnership.test.ts` "P2-7 … confirm surface": the 5,000 ms default timeout expired in a test that only reads files (load ~60). Green alone.
  - `packages/glyph-picker` `GlyphPicker.test.tsx`: all 11 tests pass, but vitest reports an unhandled `[vitest-worker]: Timeout calling "onTaskUpdate"` and exits 1. This happened in full run 1 AND alone at load ~55. The same error reproduced alone on a PRE scratch worktree, and `git diff --quiet 6d43a70 HEAD -- packages` is empty. The package was green in full run 2 at load ~40. This is the first non-app package on the allowance: a pure load symptom whose tests all pass.
  - APP `menus.smoke.test.tsx` "the undo/redo pill is gone; Edit ▸ Undo and Redo …": a 30 s test timeout on a test that takes 1.7–2.7 s alone. It fails by the same mechanism as the EXPECTED_RED `:130` case, a Base UI submenu under load. Green alone 6/6 on the W1f tip. It was red in 3 of 5 full studio runs on the tip: all 3 at load ≥50, and 0 of the 2 at load 36–39, which were exactly the 10 EXPECTED_RED. **Treat it as suspect, not proven innocent:** in this session the PRE scratch worktree ran the studio 4 times, including 2 at load 56–78, and never went red on it. W1a–W1e never listed it either. The studio does not pass `container` to ChromeBar, so the burger path is behaviour-identical to PRE. W1f's reachable changes on that path are `isolate` classes, portal `children` pass-through, ToolDock keys, and FramesPanel's KeyboardSensor. G-FLAKE should re-measure this test before trusting it.
  - APP `interfaceScale.smoke.test.tsx` "selection pill anchored" (already FLAKY, W1b) failed alone once on the tip (load ~60), which is the "fails again" case. It was then run alone, alternating: tip 3/3 green, PRE scratch 3/3 **red** with the identical `expected 165 to be less than 1`. PRE is worse, so this is not W1f. Like DevPanel, count it only after 3 alone re-runs fail.

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
| W1-LAND | W1 | opus | building | W1a merged: `1195b18` (7cdabba) · `ab22b4e` (rename-and-dead-actions) · `cab8be6` (dead-settings) · `9de050e` (file-navigator-fixes) · `8953d07` merge repair · W1b merged: `a53a98e` (truthful-branch-viz-e4c8d3, tip `8200f09`) · `0344938` merge repair · W1c merged: `a671d01` (bbox-ui-toolbar-redesign-91949c, tip `e7716f6`) · `f8d5f40` merge repair · W1d merged: `ebc2bd2` (visual-language-reports-moc-279480, tip `ceaa476`) · `36a5058` (visual-lang-design-issues-1e94f4, tip `ef2fdc3`) · `1931803` (python-syntax-visualization-b86806, tip `f91ae83`) · `5c97db5` (native-file-dialog-research-2026-09-22, tip `a2310e5`) · `a17f565` (file-navigator-slow-4354e7, tip `c603fb3`) · `2410e76` (library-vs-host-rule-2026-09-19, tip `21268c2`) · `e86f0e2` (component-proposal, tip `1311bc0`) · `4fba08f` (libavoid-routing-comparison-e5175e, tip `0d674f8`) · `13448ba` PORT (node-editor-library-research-41b089, tip `d9d2721`) · W1e: `c54b2f9` PORT (host-less-shell-2026-09-19, tip `ca04bfa`) · `6d03b3f` merge repair · W1f: `6f5da7e` (harden-menu-kit-533e7171, tip `8962371`, a real `--no-ff` merge) · W1g: `f97390f` PORT (orthogonal-design-styles-8d71d7, tip `484d530`) | not audited (merges of finished branches) | W1a: typecheck clean; `pnpm -r --no-bail --workspace-concurrency=1 test` → studio 10 failed / 714 passed = exactly EXPECTED_RED (was 672 passed; the four merges add 52 incl. settingsAreWired + chromeActionsAreWired, green); bbox-ui 672/672 after the repair; storybook-basics reds only in FLAKY_FILES (each passes alone); every other package green; `pytest scripts/tests` 210 passed. Repair: rename branch edited `chromeBar.tsx` without `registry:build` → `registrySnapshot` chrome-bar stale; regenerated `public/r/chrome-bar.json` (only file shadcn build changed). W1b (PRE `dc0f079`): clean `--no-ff` merge, 31 files, all under `apps/storybook-basics/src` (components, scene, hosts, skin stories) and `docs/` report builders — nothing in `apps/systemsketch`, `packages/`, `scripts/` or any lockfile, so no pytest run was owed. Typecheck clean. Full `pnpm -r --no-bail --workspace-concurrency=1 test` on `0344938`: bbox-ui 672/672; storybook-basics 6 failed / 3,777, all six in FLAKY_FILES (BlockPortHosts, Select, AppMenu, DevPanel, FileNavigatorGeometry, FitToContentHosts), each green re-run alone; studio = EXPECTED_RED + one new FLAKY_FILES entry (see EXPECTED_RED, W1b); every other package green. Studio alone ×2 more on `0344938`: run 3 exactly the 10 EXPECTED_RED, run 4 the 10 + app.smoke (order bleed, reproduced on PRE). Repair: the branch edited `block.tsx`, `blockPort.tsx`, `blockPort.layout.ts`, `blockRegion.tsx` without `registry:build`, so `registrySnapshot` went red on 5 payloads; `shadcn build` changed exactly block-card, block-port, port-edge, block-region, labeled-group. blockRegion's new value imports (`./labeledPort`, `./portEdge`) already ship as siblings; `docs/verify_registry_install.py` installs block-card + block-port + port-edge into a scratch project, `tsc` exit 0. Items: none settled — the grammar lands in the trunk (stories + components) only; cluster 16 (branch arms: P-254, P-283, P-309, P-380) stays deferred on D10, and the studio still has no arm hits. W1c (PRE `f040adb`): clean `--no-ff` merge of Two Faces, 32 files — trunk `apps/storybook-basics/src/editor` (controlStrip, controlPanel, controlGlyphs, controlRegistry, floatingToolbar + ControlStrip/controlPanel/PaintFace stories), studio `apps/systemsketch/src/appearance/*` (customFontSize, paintLink, strokeMeta, stockPaintOverrides + tests) and `chrome/ContextualPopupMenu/*` (appearanceModel, appearanceGlyphs; `StyleRowControl`/`StyleFace`/`StyleOption`/`StyleCluster`/`OpacityCluster` deleted, `AppearanceCluster` mounted at `floatingToolbar.tsx:340`), `shapes/registry.ts`, four studio smoke tests, `docs/` report builders. No `scripts/`, launcher, lockfile or peerOwned path touched, so no pytest run was owed. Typecheck clean. Full `pnpm -r --no-bail --workspace-concurrency=1 test` on `a671d01`: studio 10 failed / 759 passed = exactly EXPECTED_RED (+45 passing: the branch's appearance unit tests and pill smoke); storybook-basics 3 failed / 3,794, all in FLAKY_FILES (DevPanel ×2, FitToContentHosts "Drag A Member (tldraw)"), both files green re-run alone (9/9); bbox-ui 3 red = registrySnapshot on control-registry, control-strip, floating-toolbar; every other package green. Studio alone again on the final tree: exactly the 10 EXPECTED_RED, 759 passed. Repair `f8d5f40`: the branch edited five registry-shipped trunk files without `registry:build`; `shadcn build` changed exactly those three payloads; none of the five sources changed an import, and `docs/verify_registry_install.py` installs control-registry + control-strip + floating-toolbar into a scratch project, `tsc` exit 0; bbox-ui 672/672 after. Items: none of W1-LAND's settled (its only item is P-101). **For later jobs:** (1) P-076's evidence (`arrangeActions.ts:245-274` STYLE_ROWS) and residual P-206's (`selectionClusters.tsx:416-432` StyleCluster, `arrangeActions.ts:304` activeStyleRows) now point at deleted code — the pill is `TWO_FACES_RECIPE` in `appearanceModel.ts:289` (shape · inside · edge · text, then Diff), rows still derived from `getSharedStyles()`. Of P-076's "left", the shape switcher is now the Shape trigger (`GeoShapeGeoStyle`, `appearanceModel.ts:154`); the 21-colour palette (it paints tldraw's 13), vertical align, line shape and start/end point are still absent — L-PILL re-scopes from there. (2) Line width is now separate from text size via shape `meta`, not a StyleProp (`src/appearance/strokeMeta.ts`, `customFontSize.ts`), and `SHAPE_UTILS` re-registers tldraw's geo/draw/line/arrow utils (`shapes/registry.ts`, `STOCK_PAINT_SHAPE_UTILS`) — B-SCHEMA must keep those meta keys and not re-add them as props; L-PILL's "title size never tied to line width" acceptance starts from this. W1d (PRE `95f7906`): eight `--no-ff` merges and one path port, all docs, reports, CLAUDE.md and one new standalone app — `git diff --quiet 95f7906 HEAD -- apps/systemsketch/src apps/storybook-basics packages` is empty (studio source, trunk and every package byte-identical to PRE; the only studio file touched is the new `apps/systemsketch/CLAUDE.md`). visual-language-reports-moc: clean; adds `apps/vocab-boards` (React Flow, 705 boards, dev port 5471, 11.9 MiB of PNGs under `public/img` now in history), its `pnpm-workspace.yaml` entry and a pure-add lockfile importer; `pnpm install --frozen-lockfile` matched, so no lockfile repair was owed. visual-lang-design-issues, python-syntax-visualization, native-file-dialog-research, file-navigator-slow: clean, builders under `docs/` only. library-vs-host-rule: clean; adds CLAUDE.md "The host apps only host" and `apps/systemsketch/CLAUDE.md`, both naming the app `apps/bbox-tldraw` (B-RENAME must carry both). component-proposal: the expected `.gitignore` conflict — its two lines (`reports/media/`, `__pycache__/`) were already on the branch, so the resolution keeps both present with no duplicate. libavoid: clean. node-editor-library-research PORT `13448ba` (`git checkout <branch> -- <paths>`, per portHunks): the five `docs/build_*_report.py`, `hundred_ideas_data.py`/`idea_diagrams.py`/`idea_visuals.py`, `docs/ideas-pipeline/*`; `docs/report_feedback.py` was byte-identical to the copy visual-language-reports-moc brought (no change); the `.claude/feedback.md` entry '2026-09-18 · Bad · reports are an input surface too' added by hand, placed by date (between the 09-19 and 09-17 entries — the ledger is newest-first); SKIPPED `apps/anchor-lab/*` and its workspace/lockfile edits, `docs/WORK-ORDER-2026-09-18.md` + `docs/build_work_order_report.py`, `reports/*.html`. No `scripts/` or launcher changed, so no pytest was owed. Typecheck clean (24 projects, vocab-boards included). Full `pnpm -r --no-bail --workspace-concurrency=1 test` ×2: vocab-boards 31/31 (new); bbox-ui 672/672 (no registry source touched, no repair); every other package green; storybook-basics 4 then 7 red, all in FLAKY_FILES (BlockPortHosts, ContextMenu, DevPanel, FitToContentHosts; Select, FitToContentHosts ×3, ContextMenu, FileNavigatorGeometry, FramesPanel), each green re-run alone except DevPanel "Callbacks Carry The Row Id", which failed its first alone re-run as well — then DevPanel alone ×5 on a scratch worktree at PRE and ×5 on HEAD (load 50–88): PRE 1/5 red with the identical `pointer-events: none` at `DevPanel.stories.tsx:289`, HEAD 0/5 — baseline flake, not W1d. Studio: run 1 lost its browser project to a peer holding :63315 (only the 31 unit files ran); then 3 full studio runs (load 23–39), each = the 10 EXPECTED_RED + 2 extras from a rotating set (app.smoke + regionRigid; openWritesNothing + regionRigid; files.smoke P1-4 + interfaceScale), every extra green alone. Oracle: the studio suite ×2 on the PRE scratch worktree under the same load → 17 and 33 red, including the same files.smoke P1-4, openWritesNothing and a regionRigid test (see EXPECTED_RED, W1d). The first run after the lockfile change printed vite's "Re-optimizing dependencies because lockfile has changed" in both browser packages, plus the studio's pre-existing `optimizeDeps.include` warnings (`@codemirror/lint`, `@base-ui/react/*`, `vitest.config.ts:42`). The seven merges were re-created with `git commit-tree` on identical trees to add the Co-Authored-By trailer before this ledger commit (old tip `826b2fb`, same tree). Items: none settled — reports, research builders and a standalone app; clusters 5/16 stay deferred on D10 (the visual-grammar proposal these reports feed). W1e (PRE `4a31eee`): PORT of host-less-shell, never merged — its merge base is `21268c2` (the library-vs-host-rule tip W1d merged), so the whole branch is 8 commits / 22 files. A merge would have been the a18c906 trap: `shell/hostPort.ts` imports `../components/floatingToolbar.placement`, which `8b4bba4` moved to `editor/`, and the branch's engine wall names `layout/` and `presets/`, both gone. Grafted by `git checkout <branch> -- <paths>`: `apps/storybook-basics/src/shell/**` (hostPort, hostContract + test, fakeHost with its four breaks, BboxShell with no windows per I3, HOST-PORT.md), `apps/bbox-no-host/**` (runner, port 4360, A0.4 smoke), `scripts/chrome_gate.sh`, `docs/assets/{chrome-gate,three-reds}.txt`, `docs/build_host_less_shell_p0_p2.py`. Adapted: the Rect/Size import repointed to `../editor/floatingToolbar.placement` (same interfaces, lines 105/112); HOST-PORT.md's pointer follows plus a note that its `chrome/<file>:<line>` citations were measured at `21268c2`, before chrome/ was foldered (TitleBar/, Toolbar/, FileMenu/, DevMenu/, ContextualPopupMenu/). `engineFree.test.ts`: main's transitive walk and three kits kept, `shell` added to `ENGINE_FREE_DIRS`, `shell/{hostPort,hostContract,fakeHost}.ts` added to the required-files list, the direct-import test's name derived from the list (the branch's A0.2 intent). `.gitignore`: both sides. `pnpm-workspace.yaml` gains `apps/bbox-no-host`; `pnpm install` wrote a lockfile delta line-for-line identical to the branch's (one importer, no version moved). `docs/WORK-ORDER-HOST-LESS-SHELL.md` was already here, byte-identical, from W1d. Proof: `vitest --project=unit src/shell/hostContract.test.ts src/engineFree.test.ts` 51/51 (the 30 contract checks on the fake, zero skipped; each of the four broken fakes fails EXACTLY its named set; capability gating); the four breaks re-run through a scratch esbuild script print output byte-identical to `docs/assets/three-reds.txt`; `pnpm smoke` in `apps/bbox-no-host` → A0.4 OK in headless Chromium (zero console errors or warnings, shell measured, host disconnect and capability toggle driven), screenshot looked at (the P0 skeleton: capability picker + "No canvas behind this shell"), port 4360 released after. Repair `6d03b3f`: the port made `pnpm -r typecheck` red — 14 TS18047/18048 in `shell/hostContract.ts` after `assert(x !== null, …)` guards. Not port damage: a scratch worktree at the branch tip `ca04bfa` reports the same 14 on the same TypeScript 5.9.3 (the branch only measured vitest, which strips types). Fix: the local `assert` annotated `asserts condition`; behaviour unchanged (three-reds still byte-identical, 51/51). Verify on `6d03b3f`: `pnpm -r typecheck` clean (24 of 25 workspace projects, bbox-no-host included); `pytest scripts/tests` 210 passed (scripts/ gained a shell script); full `pnpm -r --no-bail --workspace-concurrency=1 test` (load 44): studio 17 failed / 752 passed = the 10 EXPECTED_RED + 7 in FLAKY_FILES (interfaceScale "selection pill anchored", fileNavigatorGeometry "fully on screen… 100/125/160%", validationLevel "strict with ONE switch flipped", variants ×2 "branch/for card corners", files.smoke "Save As…" + "P1-4"), each file green re-run alone (5/5, 6/6, 3/3, 11/11, 18/18); storybook-basics 2 failed / 3,838 (+44: the contract suite), both FitToContentHosts "Drag A Member", green alone 4/4; bbox-ui 672/672; every other package green. `git diff --quiet 4a31eee HEAD -- apps/systemsketch packages` is empty — no studio or package source changed. Items: none settled (W1-LAND's only item is P-101); completeness-critic #19 (the missing workspace entry) is closed by this port. **For B-SHELL-P1:** `scripts/chrome_gate.sh` is ported verbatim and still diffs against `main` — run against this branch it reports 7 touching incl. `claude/finish-2026-09-29` itself, so evaluate it against the integration branch as lanes.json says; its only DIRTY chrome worktree, `/home/bam/bbox-ui-wiring` (`claude/app-wiring-2026-09-20`: `chromeBar.tsx` + untracked `draftSession.tsx`), was last written 2026-09-20 02:29 — stale, not a live peer. `apps/bbox-no-host` has no `test` script, so `pnpm -r test` never runs its smoke; the headless render is `pnpm --filter bbox-no-host smoke`. W1f (PRE `6d43a70`): a real `git merge --no-ff` of harden-menu-kit (12 commits, stacked on 565fb78). Rename detection carried the branch's `src/components` + `src/stories` edits onto main's `src/editor` layout. There were EIGHT conflicts, not the six in portHunks: W1c's Two Faces added `ControlStrip.stories.tsx` and the modify/delete of `components/controlGlyphs.tsx`, which main moved to `editor/`. Resolutions: `dropdown-menu.tsx` keeps main's file plus only the `DropdownMenuPortal` children pass-through. The same prettier churn was dropped from four files that had auto-merged. `context-menu.tsx` keeps only `ContextMenuPortal`'s pass-through; `popover.tsx`, `editor/toolbar.tsx` and `editor/floatingToolbar.tsx` changed by whitespace or import order only and went back to main's bytes. `toolDock.tsx`: main's 40 px `TOOL_CELL_CLASS` cells and main's `data-current` tint are kept. The tint is Zach's 2026-09-21 call and it deleted the trailing check. On top of them, the branch's `container` and `order` props, `warnOnDuplicateIds` (no `process.env`), the id+occurrence keys and `rememberedFor` (`Object.prototype.hasOwnProperty.call`, not the ES2022 `Object.hasOwn`) are re-applied. The branch's `tool-dock-checked` data-slot is NOT ported, because the check it marked is gone. `ToolDock.stories.tsx` keeps main's stories and adds ScreenshotOrder, DefaultOrderUnchanged and PopoutOpenForCapture (portHunks' 'FamilyPopoutsOpen'). The branch's remembered-member re-open assertion is kept, reading `data-current` instead of the check. Mutation check: with the preference write removed, FamilyPopoutsExpanded goes red. `ChromeBar.stories.tsx`: main already had the same `findByText` fix, so main's comment was kept, and the whole-vector Back/Forward assertion auto-merged. `FloatingToolbar.stories.tsx`: imports repointed to `editor/`, so ScreenshotOnePill resolves. `ControlStrip.stories.tsx` keeps both main's `insideFace`/`edgeFace` and the branch's `textInk` glyph. The controlGlyphs citation fix went into `editor/controlGlyphs.tsx`. I checked it against systemsketch `10748b8`: `ColorSwatch` is `AppearanceGlyph.tsx:307-328` and the span is `:321-326`. `docs/capture_menu_kit_shots.mjs` takes the branch's shot list and its exit-1-on-miss, with main's story ids (`editor-menus-bars-*`, `editor-panels-dialogs-*`, `components-text-marks-*`); it was not run, since it needs Storybook on :5431. `docs/validate_registry_payloads.mjs` and `docs/menus/data/judge.json` were taken whole. `public/r/*.json` were taken from HEAD, then REGENERATED by `npx shadcn@latest build`, which rewrote 12 payloads: branch-chip, chrome-bar, compare-review, control-strip, draft-bar, frames-panel, inline-rename, panel-shell, problems-panel, property-table, split-button, tool-dock. `registry.json` was unchanged, and `build_menu_registry_items.py --check` agrees. Registry gates: `node docs/validate_registry_payloads.mjs` → 42 payloads valid; `--check` → 'published payloads match source' and shadcn schema valid. `docs/verify_registry_install.py --dir <scratch>` over the 18 installable menu items gives `tsc` exit 0. `packages/bbox-ui` `registrySnapshot.test.ts` is 86/86 with no repair owed. No `scripts/`, launcher, lockfile, workspace or `apps/systemsketch` path changed, so no pytest was owed. `pnpm -r typecheck` is clean (24 projects). Full `pnpm -r --no-bail --workspace-concurrency=1 test`, run 1 (load 55–70): storybook-basics 11 red / 3,852 and studio 24 red / 769, which is the 10 EXPECTED_RED plus FLAKY-file and new-allowance reds; glyph-picker's unhandled RPC timeout; every other package green, bbox-ui 672/672. Run 2 (load 35–45): storybook-basics 2 red (BlockRegionViews, FitToContentHosts); studio 11 red = the 10 EXPECTED_RED + files.smoke P1-4 (green alone 18/18); glyph-picker and every other package green. Every red outside the 10 was re-run alone: all green except glyph-picker and interfaceScale; see EXPECTED_RED, W1f. Extra studio runs on the tip: three at load 28–48 were the 10 EXPECTED_RED alone, twice exactly (769/759) and once with 4 FLAKY-file extras. Items: none settled (W1-LAND's only item is P-101). **For later jobs:** (1) `python3 docs/build_menu_registry_items.py --check` now exits 1. The branch made `--check` run every guard instead of returning after the freshness diff, and the hard guard fires on the pre-existing `block-region`/`labeled-group` → `@bbox-ui/glyph-content`. The same exit 1 happens on the write path at PRE, and `verify_registry_install.py` pins it in EXPECTED_UNINSTALLABLE. W5-VERIFY/G5 and L-REG must read that exit as this known condition, or fix the dependency; neither may 'fix' the gate. (2) New trunk props that hosts can wire: ToolDock `order`/`container`; FramesPanel, SplitButton and DraftBar `container`; ControlStrip `nested`/`customColorSlot`; CompareReview `defaultSelectedElementId`. (3) FramesPanel reorders from the keyboard now (dnd-kit `KeyboardSensor` + `sortableKeyboardCoordinates`). Its grip is a named 'Reorder <label>' control, no longer `aria-hidden`, and the view menu's label sits in a `DropdownMenuGroup`. (4) InlineRename commits the untrimmed draft; the branch removed `.trim()` under the truthful-rendering rule. It visibly refuses a value or paste containing a line break. (5) `isolate` was added to ButtonGroup, ToggleGroup, PanelShell's body, ProblemsPanel, FramesPanel and PropertyTable's scrollers. (6) The menus.smoke undo/redo suspicion in EXPECTED_RED is for G-FLAKE to settle. W1g (PRE `8167e12`): PORT of orthogonal-design-styles, not a merge. The branch was cut at `fc48b87`, before migration M8 (retired `--bbox-skin-crisp`/`--bbox-skin-outline`, the boundary-pass sketch) and before `Styles.stories.tsx` moved to `src/skin/` under the title `Skin/Styles`. Method: `git merge-file` per file, main as ours, the branch's merge commit `6317686` as base (byte-equal to `fc48b87` for these files), the tip as theirs. Conflicts were resolved by hand: skin.ts 1, skin.css 6, Styles.stories 2, skin.test.ts 0. Landed: `BBOX_SKINS`/`BBOX_SKIN_LABELS`/`BBOX_SKIN_BLURBS` are the ten skins in his picker order (`skin.ts:95`, `:114`). Unstyled, Sketch, Shadcn and No. 1–7 are Vellum, Blueprint, Brutal, Terminal, Porcelain, Notion and Obsidian. `default` is renamed `shadcn` (the same block, but with the branch's explicit Tailwind `shadow-sm` in place of `var(--shadow-sm, …)`). `plain` is dropped from the trunk; the frozen `packages/bbox-ui` still has it. The unstyled block keeps `ButtonBorder` + `line-override: currentColor`. **Adapted to M8:** the two retired declarations were dropped from all eight branch blocks, and the 13-token closed-set test still holds. The sketch block and the boundary-pass rules are main's bytes. The gallery column and the sketch rung wrap in `<SketchAtEdge>` via a new `AtEdge` helper (`Styles.stories.tsx:319`, WHY comment). `3. Sketch` (`:457`) now waits for the boundary twins (`SKETCH_TWIN_ATTR`) instead of the deleted `sketch-outline` slot. `AllComponents` compares shadcn against sketch. The unstyled test's `bbox-skin-outline` OFF row is dropped. Callers of the removed names were swept. The only one outside the frozen set was `docs/build_sep22_review_report.mjs:747` (`skin:default` → `skin:shadcn`, WHY comment). `.storybook/preview.tsx` maps `BBOX_SKINS` and needs no code change. Its comments still say `default`; they were left alone under CLAUDE.md's Storybook-is-opt-in rule. `demos/*` import the frozen `@bbox-ui/core` three and were left untouched. The registry's `bbox-skin` item ships `packages/bbox-ui`'s files, so no `public/r` payload moved. The studio imports the trunk `globals.css` → `skin.css`, but it stamps no `data-bbox-skin` anywhere. Docs: `docs/build_skins_report.py` and `docs/skin_shots.json` are new. The shot ids were renamed `styles--*` → `skin-styles--*`. `docs/capture_storybook_shots.mjs` keeps main's file plus ONLY the branch's additive `--color-scheme` / per-shot `scheme` hunk, a clean 3-way merge; without it the skin_shots.json light frames would silently capture dark. The report was NOT rebuilt, because it needs Storybook on a port plus captures. Proof: `vitest --project=unit src/skin/` 58/58 (skin.test.ts 31). Mutation: re-adding `--bbox-skin-crisp` plus a transparent unstyled stroke turns exactly 2 red (the closed set, and the ButtonBorder line). `vitest --project=storybook src/skin/` 53/53. Styles is 15/15 (the 11 rungs plus AllComponents, Sketch, SideBySide and NoSkinRegression). Mutation: with `AtEdge` unwrapped, `3. Sketch` goes red. Verify on `f97390f`: `pnpm -r typecheck` clean (24 projects). Full `pnpm -r --no-bail --workspace-concurrency=1 test` ran at load 18–25. Studio: 12 failed / 757 passed, which is the 10 EXPECTED_RED plus app.smoke "pressing the system face" and interfaceScale "selection pill anchored". Both are FLAKY_FILES from W1b and green alone (4/4, 5/5). storybook-basics: 6 failed / 3,876 (+24: the rungs and the skin.test additions), in AppMenu, DevPanel "Callbacks Carry The Row Id" and FitToContentHosts ×4. All are FLAKY_FILES, and each file is green alone (3/3, 5/5, 4/4). bbox-ui 672/672, and every other package is green. No `scripts/` or launcher path changed, so no pytest was owed. `git diff --quiet 8167e12 HEAD -- apps/systemsketch packages scripts` is empty. EXPECTED_RED is unchanged. Items: none settled (W1-LAND's only item is P-101). **For L-INSPECTOR (P-144, the studio skin picker):** its evidence `skin.ts:57` has moved to `skin.ts:95`. The trunk now has ten skins and no `default`/`plain`. The studio picker should map `BBOX_SKINS`/`BBOX_SKIN_LABELS` the way `.storybook/preview.tsx` does, with "no attribute" as its own first rung, not a member. The sketch skin needs `<SketchAtEdge active>` to draw at all, which is what preview.tsx does. **Still owed in W1-LAND:** w1-anchor-layout, notebook-lab's four trunk fixes + its builders, the StepIn bench, board-url's handoff half, simple-reactflow-whiteboard's `open-as-library` merge (never push), and the archive tags. |
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
