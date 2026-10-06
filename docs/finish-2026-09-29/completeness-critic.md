# Completeness critic — 2026-09-29 (Opus 5.5, read-only)

1. **Gate G3 does not measure the 100 cluster items the plan schedules. Many of them also have no acceptance line and no owned file.**
   - **Evidence:** `WORK-ORDER.md:76` counts "All 93 assigned open items", which is 110 − 4 done or obsolete − 13 deferred. The 20 scheduled clusters in `lanes.json` hold 100 more ids, and no gate or ledger row covers them.
   - **Clusters with no home:**
     - Cluster 20 (pages, cross-file imports, saved views; `untriaged-clusters.md:31`) sits in L-NAV, whose write set is only `depthModel`, `viewportHistory`, the crumbs and `frames.ts`.
     - Cluster 30 (release status in the help menu; `App.tsx:81` `HelpMenu: null`) is also in L-NAV, which does not own `App.tsx` or the help menu.
     - Cluster 18 wants an origin badge on the block face, but `BlockFace.tsx` is not in L-CODE's write set.
     - Cluster 12's ⇧H hit-area overlay has no file in L-GESTURES.
   - **Clusters with no acceptance:**
     - Cluster 8: 10 ids (per-side toggles, parking, count reveal, size cascade).
     - Cluster 9: batch wiring (`scene/batchWire.ts` is built but not mounted), long-press reorder, port selection.
     - Cluster 10: P-444 edge-to-edge and P-456 hyperedge trunks.
     - Cluster 14, cluster 33, cluster 22's retry and moved/deleted banner, and cluster 29's click-to-rename and recording indicator.
   - Cluster 24's P-448 (pixel diff) contradicts the verdict in `COMPARISON-NEXT-STEPS.md:149-170`.
   - **Recommendation:** add one ledger row per cluster id and extend G3 to 193. Move anything without an owned file or acceptance line into `deferredClusters` with a reason. Mark cluster 4 as already done.

2. **Leftover work from items marked PREMISE-FALSE or ALREADY-DONE was dropped. P-087 is only one case.** `backlog-verified.json` re-checked only the 110 ABSENT items. Leftovers still owed, from `docs/parity-backlog-triage-2026-09-21.md`:
   - **P-195** (line 275, the "real ask"): diff paint inside the trunk components. `block.tsx`, `port.tsx` and `trace.tsx` still take no `diff` prop.
   - **P-159** (239): the compare ghost overlay and was/now chips.
   - **P-205** (285): a drifted code origin has no path to Compare, and no re-read or keep-both action.
   - **P-197** (277): wrap a selection into a Frame or Block.
   - **P-111** (191): a bulk "reset cable route" command.
   - **P-092** (167): Simple/Advanced/Expert tiers in the inspector.
   - **P-108** (188): a layers surface and a designed empty state.
   - **P-163** (243): the URL fetch proxy for glyph upload.
   - **P-186** (266): wheel bindings and `modifierWheelZoomsOppositely`.
   - **P-189** (269): the control point is painted above the label.
   - **P-187** (267): a per-cable panel.
   - **Recommendation:** move P-092 into L-INSPECTOR, P-189 and P-187 into L-WIRE-PAINT, P-111 into L-ROUTE, and P-197's Frame/Block half into L-MENU-CONTEXT's "Turn into". Put the rest in `deferred` with reasons.
   - `residuals.json`, which the B-SCHEMA `extra` cites, does not exist. If it is meant to hold these, create it.

3. **The COMPARISON-NEXT-STEPS scope is wrong in both directions.**
   - **N1 is already built:** `editor/propertyRows.ts` has `elementSummaries` and `orderChanges`. L-COMPARE's `extra` still schedules it.
   - **N8 has no acceptance line.**
   - **S5 (`useLinkedCameras`) is missing,** so the app turns overlay off: `compareView.tsx:338-342` passes `canOverlay={false}`. Zach approved overlay with a blend slider as the committed treatment (`COMPARISON-NEXT-STEPS.md:100`).
   - **N2 (diff paint on components), N3 (the gallery) and N6 (the CompareView composition) are unscheduled and not deferred.**
   - **Recommendation:** mark N1 done in the ledger. Add N8 acceptance. Add S5 and `canOverlay` to L-COMPARE; its write set needs `TRUNK/hosts/useLinkedCameras.ts` and the app's `compareView.tsx`. Defer N2 and N3 explicitly: they write `block/port/trace/traceBadge`, which W3 lanes own, so they belong after W3.

4. **Two guard tests that W1 brings in will fail three later lanes, and none of those lanes owns them.** Both guards fail in both directions ("the list may only shrink").
   - `settingsAreWired.test.ts` (commit 51e3a36, `QUARANTINE` at lines 74-86) lists `allowHiddenPorts` and `allowFanOut` as dead. When L-WIRE-GESTURE wires them, the test goes red. They also need a lint rule in `TRUNK/scene/lint.ts`, which L-WIRE-GESTURE does not own either.
   - `chromeActionsAreWired.test.ts` (commit e50834c) quarantines `chromeBar.tsx :: onBack/onForward/onJumpToLevel/crumbs/depth` (lines 54-77). Line 163 asserts `onBack` is found inert. It only scans the app's `src/` (line 39). So L-NAV breaks it, and B-SHELL-P1's move of `chromeBar` into `TRUNK/shell` makes those entries stale and puts the lifted chrome outside the scan.
   - **Still dead after the run, and not listed in `deferred`:**
     - `bindings`: four visible rows in Settings.
     - `modifierWheelZoomsOppositely`.
     - The dock library cell reading "Coming soon".
   - **Recommendation:** add both test files to the write sets of L-WIRE-GESTURE, L-NAV and B-SHELL-P1, the last one re-scoping the scan to include `TRUNK/shell`. Either hide the rows that remain dead or list them in `deferred`.

5. **The pyblocks half of the studio's Python backend is stranded, and G1 cannot see it.**
   - **Evidence:** `storybook-basics/src/backend/pyblocksClient.ts:17-18` calls `/api/systemsketch/scene` and `/api/systemsketch/events`. Those routes exist only on pyblocks branches `claude/lane-pb-pyblocks-scene-projection-2026-09-18` and `claude/lane-scv-scv-definitions-partition-2026-09-18`. The two are stacked, 988 commits behind pyblocks `main` (0093175), and `git merge-tree` reports conflicts. W1 handles simple-reactflow-whiteboard but not pyblocks.
   - **Recommendation:** add it to W1's branch inventory as "port, don't merge, never push", or add a §6 question. Suggested default: leave pyblocks alone, and have the G1 evidence state that Open Python needs that branch.

6. **B-RENAME disagrees with itself about the target folder, and its peer-file rule blocks it.**
   - **Target:** the title and notes say `apps/studio` (`ARCHITECTURE.md:155,161`). The write set and `lanes.json:3` say `apps/bbox-tldraw`. So do `skills/bbox-review-board/SKILL.md:3,18,75`, `create_review_board.mjs:44`, and the `apps/systemsketch/CLAUDE.md` that W1 merges from the library-vs-host-rule branch. That branch names the apps after their hosts, beside `apps/bbox-reactflow` and `apps/bbox-no-host`.
   - **Peer files:** `rules.peerOwned` (`lanes.json:1211`) forbids editing `scripts/launch_systemsketch.py` and `stable-preview.json`, both of which B-RENAME has to touch.
   - **Display strings:** the acceptance greps only the path. After 7cdabba the app still calls itself SystemSketch in `session.tsx:386,544,758`, `appSettings.tsx:335` and `dock.tsx:256`. The root `package.json` script `systemsketch` also still uses the old name.
   - **Recommendation:** make the folder name a §6 decision with a default. Lift the peer-file rule for B-RENAME once EXT-SWITCHER has merged. Add a grep for user-visible "SystemSketch" names to the acceptance.

7. **The plan contradicts itself on simple-reactflow-whiteboard.** `WORK-ORDER.md:162` and `lanes.json:54` say merge `open-as-library` into its local main. D7 (`WORK-ORDER.md:288`) and `lanes.json:127,874` say never merge into its main. **Recommendation:** keep D7 and delete W1 item 9.

8. **W0 and the ledger do not match the current state.**
   - `WORK-ORDER.md:145` tells W0 to create a new `claude/finish-2026-09-29` from main. That branch already exists, checked out in `bbox-ui-plan-960af5` at 6596234 with three plan commits. The amended `WORK-ORDER.md` and `lanes.json` are uncommitted, and lane worktrees cut from HEAD will read the committed, older plan.
   - `LEDGER.md` still has L-CHANNELS (line 46), B-RENAME in W2 (24) and B-SHELL-P1 in W3 (26). It has no B-DEPS or EXT-SWITCHER rows and no per-item table for G3.
   - The scratch worktree `simmerge` at 587b950 is still registered, although `baseline.md` says it was removed.
   - **Recommendation:** commit the amendments, have W0 reuse the existing branch, and regenerate `LEDGER.md` from `lanes.json`.

9. **G2 only covers two test suites.**
   - **Evidence:** `WORK-ORDER.md:75` measures only the studio and storybook-basics suites.
   - **Not covered:**
     - `pnpm -r test` also runs `packages/{bbox-ui,adapter-*,schema,panel,inspector,glyph-*}`, `apps/playground`, `demos/scene` and `demos/compare-view`. L-REG changes the `packages/bbox-ui` and adapter imports that these, and nine `demos/*`, consume.
     - The Python tests in `scripts/tests` (`test_bbox_release.py`, `test_launch_file_routing.py`, …) name `apps/systemsketch` paths that B-RENAME moves.
   - **Recommendation:** define G2 as `pnpm -r test` plus the Python tests (`scripts/tests`, `docs/acceptance`, `docs/fixtures`), five times. B-RENAME's "suite counts identical" check should include the Python tests.

10. **No lane commits the regenerated registry files at the end.**
    - **Evidence:** `public/r/*.json` is tracked (43 files, fresh today). It is what `verify_registry_install.py:27` installs and what the site serves (`preflight.sh:88`).
    - **The gap:** W3 and W4 edit the source of registry items (`trace`, `traceBadge`, `portEdge`, `blockPort`, `blockMembers`, `codeEditor`, `controlStrip`, `controlRegistry`). W5-VERIFY's write set is only `LEDGER.md` and `build_finish_report.py`, and L-REG does not own `public/r/**`.
    - **Recommendation:** add `registry.json` and `public/r/**` to W5-VERIFY's write set. G5 should run `build_menu_registry_items.py --check` and a freshness check on `public/r`.

11. **Nothing builds the React Flow demo into the static docs site.**
    - **Evidence:** `wrangler.jsonc` deploys only `./apps/docs/out`, and `CLAUDE.md:647-649` says canvas demos iframe a separate app. L-DOCS-SCENE-HOSTS owns only content and demos; L-RF-HOST owns only `apps/bbox-reactflow/src/**`. No build step places the host bundle in `apps/docs/out`.
    - **Consequence:** the headless check passes against `docs:dev` while the exported site's iframe returns 404.
    - **Recommendation:** B-DEPS or L-DOCS-SCENE-HOSTS owns a build step that copies the output of `vite build --base /embed/reactflow/` into `apps/docs/public`. The headless check runs against `apps/docs/out`.

12. **The editor docs are written before the chrome they document.**
    - L-DOCS-EDITOR depends only on W1-LAND and B-DEPS (`lanes.json:978`). The W4 lanes (L-INSPECTOR, L-PILL, L-MENU-CONTEXT, L-FILES, L-NAV) then rewrite those surfaces. `editor/inspector.mdx` still documents `packages/panel` and `packages/inspector`.
    - Four registry items have no docs family: `bbox-layout` and `bbox-skin` (both `registry:lib`), `block-node-reactflow` and `block-shape-tldraw`.
    - **Recommendation:** make L-DOCS-EDITOR depend on the W4 chrome lanes, and add an item-to-family table.

13. **L-INSPECTOR would rebuild an engine that already exists and that Zach picked.**
    - `packages/schema/src/resolve.ts` holds the value cascade (override → inherited → preset → default), with a `FieldTrace` explaining which layer won; reset-to-default falls out of it.
    - `packages/panel` holds `fieldModel.ts` (multi-selection resolution), `fieldTiers.ts` (Simple/Advanced/Expert, his 2026-09-11 pick), `ComponentInspector`, `sections` and `members`. That is 3,889 lines in all.
    - L-INSPECTOR creates `TRUNK/editor/inspectorSchema.ts` and names no donor except ScrubNumber.
    - **Recommendation:** port the schema and panel field model into the trunk, cite them as donors, and add a tier acceptance line (this is P-092's leftover).

14. **New text fields are not bound by the "nothing typed is lost" and "one gesture, one undo" rules.**
    - **Evidence:** the P-030 gate added in 8d53164 covers only four named fields.
    - **New surfaces:** the run adds a wire label (L-WIRE-PAINT), inspector rows and ScrubNumber (L-INSPECTOR), and a member divider drag (L-MEMBERS).
    - **Why it matters:** two of the named donors hold typed text locally and save it only on blur, the pattern P-030 bans: `packages/inspector/.../ScrubNumber.tsx:249,417-418` and `packages/panel/src/NumberInput.tsx:57,83`.
    - **Recommendation:** add a rule to `lanes.json`: every new field writes on each keystroke and joins the P-030 block in `textEditing.smoke`, and every new gesture is one undo step (`document/gestureHistory.ts`).

15. **G3's title claims the studio replaces the archived app, but the studio can't open old boards.**
    - **Evidence:** `session.tsx:449-455` (with `legacyBoardHref` at :158) hands any `.systemsketch` file to the archived app. `~/SystemSketch` holds 85 `.systemsketch` boards against 34 `.bbox`/`.tldr`.
    - The importer is a follow-up in `SYSTEMSKETCH-REBUILD-PLAN.md` §8.4 and §11, defaulting to "not built". §7 does not list it.
    - **Recommendation:** list the importer in §7 with its reason (the vocabulary mapping needs Zach) and reword G3, or add a §6 question.

16. **The temporary variant switch is still open.** `chrome/DevMenu/variantSwitch.tsx:1-12,247` offers 5 port styles and 10 region drawings, labelled "a proposal, not yet chosen". Its own header says it comes out once he picks. Neither §6 nor §7 mentions it; D10 names only the 09-24 proposal. **Recommendation:** add it to D10 explicitly, keeping v1 as the default.

17. **Control-flow follow-ups inside the app are unowned.**
    - Region auto-fit happens once, at open (`OpenPython.tsx:436-440`, "Owed upstream to L5 … delete this"). L-BLOCK-VIEWS's `fitToContent(ids)` covers blocks only.
    - L-ROUTE treats only block rectangles as obstacles, so a cable that doesn't belong to a region can still cut through its frame (`CONTROL-FLOW-PLAN.md` §11 item 1).
    - `CONTROL-FLOW-PLAN.md` §11 item 6 (presets as registry items) is neither scheduled nor deferred.
    - **Recommendation:** extend `fitToContent` to regions, add region frames to L-ROUTE's obstacles, and defer the presets item explicitly.

18. **The `useDocumentScene` re-render leftover is only half covered.** The contract suite forces the tldraw host port to return a cached scene (host-less-shell `hostContract.ts:145-163`). But `focusLens.tsx:75`, `compareView.tsx:279` and `problems.ts:283` still call `useDocumentScene` (`sceneFromStore.ts:212-214`), which rebuilds the scene on every store tick. **Recommendation:** B-SHELL-P1 points those three callers at the port's cached `scene()`.

19. **The host-less-shell port in W1 leaves out the workspace entry.** The branch adds `apps/bbox-no-host` to `pnpm-workspace.yaml` and updates the lockfile. W1 item 8 doesn't name either, and B-DEPS only adds `apps/bbox-reactflow`. Without them, B-SHELL-P1's acceptance "`apps/bbox-no-host` renders every window" cannot pass. **Recommendation:** add both files to W1 item 8.

20. **Minor: the issue navigator promised in INVALID-STATES has no owner.** `INVALID-STATES-PLAN.md:247-251` owes the editor kit an IDE-style next/previous issue navigator. Clicking a Problems row already reveals the shape (`panels.tsx:86`), but there is no next-issue command. **Recommendation:** fold it into L-DIAG or defer it explicitly.