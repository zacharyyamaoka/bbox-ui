# Lane finish:G-STALE — stale burger pin and the narrow-corner layout

_Stream plan: `docs/finish-2026-09-29/WORK-ORDER.md` + `docs/finish-2026-09-29/lanes.json` (lanes.json wins) · repo: **bbox-ui** · base: `claude/finish-2026-09-29` @ `bfec965` (every W1 lane merged) · wave W2, runs beside G-FLAKE · dependsOn: W1-LAND (merged) · model: sonnet · size S · barrier: False_

**The acceptance author wrote no new test for this lane.** Both acceptance lines
are already tests on the tip, and both are red for the reason this lane exists.
One of them is a layout to build. The other is a pinned list to update.

| id | status | evidence (this tree, `bfec965`) |
|---|---|---|
| `corner.smoke` narrow 720×900 | **build** | `apps/systemsketch/src/corner.smoke.test.tsx:116-135` is red at `:132`: `expected 28 to be less than or equal to 8`. The layout does not meet it yet. Fix the layout, never the test. |
| `menus.smoke:80` burger order | **build (spec update)** | `apps/systemsketch/src/menus.smoke.test.tsx:90` `toEqual` gets two extra rows, `Open bbox-ui.com` and `Open Storybook`. These are the channel rows Zach asked for on 09-21/22 (`chrome/sites.ts:4-8`), wired in at `chrome/TitleBar/chromeBar.tsx:128`. The pinned list is stale. |
| backlog items | none | `lanes.json` G-STALE `items: []`. |
| clusters | none | `lanes.json` G-STALE `clusters: []`. No row of `backlog-verified.json`, `residuals.json` or `untriaged-clusters.md` names the corner cluster, the status strip, the watermark or the burger order. Scanned by regex. |

## Write set (the ONLY paths you may create or edit)

These are re-issued against `bfec965`. Chrome has not been lifted yet, because B-SHELL-P1 runs after this lane.

- `apps/systemsketch/src/chrome/overlay.tsx`: only `useCornerPlacement` (`:235-314`), the corner wrapper `<div ref={corner}>` (`:539-562`), and the move of the pure half described in step 1. `placeCornerCluster` (`:96-133`) and `watermarkCoverRect` keep their signatures, their behaviour and their `./chrome/overlay` export, because the pure cases of `corner.smoke` import and pin both.
- `apps/systemsketch/src/chrome/statusStrip.tsx`: only the stacked-form hook-up of `SystemSketchStatusStrip` (`:158-283`). The items, their order and their launch behaviour do not change.
- `apps/systemsketch/src/chrome/cornerClusterForm.ts` (new): the pure corner geometry (moved) plus the form decision. It has no tldraw and no React import, so the node `unit` project can load it.
- `apps/systemsketch/src/chrome/cornerClusterForm.test.ts` (new, builder-owned): the unit cases for that decision.
- `apps/systemsketch/src/menus.smoke.test.tsx`: only the `it("the burger is File first…")` block at `:80-128`.

## Do not touch

- `apps/systemsketch/src/corner.smoke.test.tsx`: the acceptance. Read-only.
- `apps/systemsketch/src/testing/menus.ts` and `apps/systemsketch/src/testing/harness.tsx`: the committed harness, off-limits to builders (`menus.ts:1-3`).
- Every other `it()` in `menus.smoke.test.tsx`. The undo/redo case at `:47-78` is on G-FLAKE's flaky list (LEDGER.md, W1f), and G-FLAKE may edit it in parallel. The View/Preferences/Export case at `:130` is L-FILES' acceptance and stays red.
- `apps/systemsketch/src/chromeSize.smoke.test.tsx`, `railClose.smoke.test.tsx`, `inspector.smoke.test.tsx`, `cornerPlacementSettings.smoke.test.tsx`, `settings.smoke.test.tsx`, `sites.smoke.test.tsx`, `variants.smoke.test.tsx`: guards that must stay green. Never edit them.
- `apps/systemsketch/src/chrome/Toolbar/dock.tsx`: the dock stays where tldraw's own toolbar sits (`dock.tsx:261-270` WHY).
- `apps/storybook-basics/src/**` (TRUNK), including `editor/statusStrip.tsx`. The stacked form is app-side styling on the trunk's own `data-slot`s. It is not a trunk prop.
- `rules.peerOwned`, all of them. They belong to the peer's EXT-SWITCHER lane: `apps/systemsketch/stable-preview.json`, `scripts/launch_systemsketch.py`, `scripts/tests/*launch*`, `assets/bbox-ui.desktop`, `apps/systemsketch/src/chrome/{sites,legacyApp,siteStatus}.ts`, `apps/systemsketch/devFileHost.ts`, `scripts/dock_icon.py`, `scripts/launch_bboxui.py`.
- `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `vite.config.ts`.
- `/home/bam/systemsketch`, `/home/bam/pyblocks`, `/home/bam/zach_brain`.

## Acceptance (assertions you cannot edit)

- `cd apps/systemsketch && pnpm exec vitest --project=smoke run src/corner.smoke.test.tsx` must be all 6 green, **unmodified**. The file mounts three live sizes: desktop 1400×900 (beside the licence), narrow 720×900 (flush right, ≤8 px above the watermark, clear of dock and watermark, watermark hit-testable), and forced corner at 1400×900. Its three pure cases are `placeCornerCluster` ×2 and `watermarkCoverRect`.
- `menus.smoke.test.tsx` "the burger is File first…" goes green and stays an **exact** `toEqual` on the row order plus an exact separator count.
- None of these may go red: `chromeSize.smoke` (desktop row level, `beside-licence`, cluster clear of dock), `railClose.smoke` at 720×900 (it presses `ss-status-frames` and `ss-status-problems`, `:133-145`), `inspector.smoke:110` (`beside-licence` at 1400), `cornerPlacementSettings.smoke`, `settings.smoke`, `sites.smoke`, `variants.smoke:204`.
- `pnpm -r typecheck` exits 0. The studio suite's failing set is EXPECTED_RED minus these two tests. That leaves `draft.smoke` ×7 and `menus.smoke:130`, both L-FILES.

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/systemsketch/src/corner.smoke.test.tsx`
- `apps/systemsketch/src/menus.smoke.test.tsx`: every `it()` except the one at `:80`, whose pinned list you update as specified below.

### Red now, for the right reason

Run: `cd apps/systemsketch && pnpm exec vitest --project=smoke run src/corner.smoke.test.tsx src/menus.smoke.test.tsx`

Result on `bfec965`, 2026-09-30:
- `corner.smoke`: 1 failed of 6, "narrow (720×900…)" at `:132`, `AssertionError: expected 28 to be less than or equal to 8`.
- `menus.smoke`: 2 failed of 7:
  - `:90` `toEqual` received `… "Set compare baseline to this board", "Open bbox-ui.com(remote)", "Open Storybook(preview · main · 705847c · +uncommitted) · different from this board", "Switch to old SystemSketch"`.
  - `:150` is the L-FILES Export timeout, which is not this lane's.

### What was measured (probe mounted in the real app, this tree)

| viewport | strip (x · y) | dock | watermark | placement | watermark.top − strip.bottom |
|---|---|---|---|---|---|
| 1400×900 | 993.3–1288 · 842–892 (294.7 wide) | 529.5–870.5 · 840–892 | 1296–1396 · 860–896 | `beside-licence` | on the bottom row ✓ |
| 800×900 | 497.3–792 · 782–832 | 229.5–570.5 · 840–892 | 696–796 · 860–896 | `above-licence` (lifted over dock) | 28 ✗ |
| **720×900** | **417.3–712 · 782–832** | **189.5–530.5 · 840–892** | **616–716 · 860–896** | `above-licence` (lifted over dock) | **28 ✗** |
| 720×900, **stacked** probe (CSS below, injected) | **552.3–712 · 762–852 (159.7×90)** | same | same | `above-licence` | **8 ✓**, 21.8 px clear of the dock |

**Root cause.** The strip grew from 152 px to 294.7 px on 09-20, when grid and help joined it at Zach's ask (`statusStrip.tsx:9-20`). The pure case at `corner.smoke:139` still uses 152. At 720 px the flush-right span (417.3–712) now reaches over the dock, whose right edge is at 530.5. Rule 3 (`overlay.tsx:111-120`) therefore lifts the cluster above the dock's top (840) instead of the watermark's (860): 860 − (840 − 8) = **28**.

**No placement alone can pass.** The strip's bottom must sit between 852 and 860, and the dock's top is at 840. The strip therefore overlaps the dock's rows, so it must clear the dock sideways: width ≤ 712 − 530.5 = **181.5 px**. One row is 294.7 px. At narrow widths the cluster has to change **form**, not only place.

## Builder brief

Work in `apps/systemsketch` only. Run `pnpm install --frozen-lockfile` once. Never `git add -A`: stage explicit pathspecs and read `git diff --cached --name-only` before committing. The acceptance files are read-only. If one cannot pass, return FAIL with the one-line reason.

**Defaults already decided. Do not reopen them:**
- **D4** (WORK-ORDER.md §6): "Build what they specify (… the narrow corner …); update only the stale burger order." You build the layout and update exactly one pinned list.
- **D2**: the lane lands on `claude/finish-2026-09-29` through the dispatcher. Never main, never push.
- **The narrow corner stacks. It does not drop cells, and it does not move the dock.** The acceptance author decided this with weighted criteria:
  - **(1) All six cells stay one click at every width.** Zach asked for grid and help on 09-20 (`statusStrip.tsx:9-20`), and `railClose.smoke:133-145` presses Frames and Problems at 720.
  - **(2) The dock stays where tldraw's toolbar sits** (`dock.tsx:261-270`).
  - **(3) App-only, no TRUNK edit.**

  Rejected:
  - **Overflow or compaction** in tldraw's style, where `DefaultNavigationPanel.mjs:29` collapses to the ZoomMenu below TABLET. It fails (1). `railClose` needs Frames and Problems visible at 720, and Frames · Problems · zoom plus an overflow `⋯` cell measures about 204.7 px, which is over 181.5. Only dropping grid, dev and help from the strip altogether gets under the limit (about 159.7 px), and that takes away cells he asked for.
  - **Shifting the dock left.** It fails (2), and it creates a circular measurement: the dock would move off the cluster that measures the dock.
  - **Editing the test.** D4 rules it out.

### Build in this order

1. **`chrome/cornerClusterForm.ts`, the pure decision.** First move the pure half of `overlay.tsx` into this module verbatim: `CORNER_INSET`, `CornerRect`, `CornerPlacementKind`, `CornerPlacement`, `overlaps`, `placeCornerCluster`, `WatermarkCoverRect`, `WATERMARK_COVER_MARGIN` and `watermarkCoverRect`, with their WHY blocks. Then re-export them from `overlay.tsx` (`export { … } from "./cornerClusterForm"`). `corner.smoke` imports them from `./chrome/overlay`, so that path must keep resolving. The move keeps tldraw out of the node unit test.

   Then add `type CornerClusterForm = "row" | "stacked"` and `cornerClusterForm({ container, row, watermark, obstacles }): CornerClusterForm`. `row` is the single-row cluster size. The function runs `placeCornerCluster` on `row` and returns `"stacked"` exactly when rule 3 had to lift the row over something other than the watermark. Either the placement is `"above-dock"`, or it is `"above-licence"` with `bottom > container.bottom - watermark.top + CORNER_INSET`. Otherwise it returns `"row"`.

   Unit cases go in `cornerClusterForm.test.ts`, using this tree's numbers:
   - 1400×900, row 294.7×50 or 403.6×50 → `"row"`.
   - 720×900, row 294.7×50, dock 189.5–530.5/840–892, watermark 616–716/860–896 → `"stacked"`.
   - Forced corner at 720 (watermark `null`, the same dock) → `"stacked"`.
   - Licensed 1400 (watermark `null`) → `"row"`.

   Gate: `pnpm exec vitest --project=unit run src/chrome/cornerClusterForm.test.ts` is green.

2. **`useCornerPlacement` in `overlay.tsx`.** It returns `{ placement, watermarkCover, form }`.
   - Cache the row size in a ref, refreshed whenever the rendered form is `"row"`.
   - **Never decide from the stacked box.** The stacked box always fits, so deciding from it flips the form back and oscillates.
   - Each `measure()` decides the form from the cached row size first. If the form would change, **commit only the form and keep the previous placement**. Then place in the measure that runs once the new form has rendered: a `useLayoutEffect` keyed on the form, which also covers the ResizeObserver path.

   **Invariant, and put it in a WHY comment:** `data-corner-placement` never publishes a placement computed for the form it is not rendering. `corner.smoke:120-122` waits for `"above-licence"` and then measures once. At 720 a lifted row also reports `"above-licence"`, so a lifted row that is ever committed turns into a flaky 28.

   Stamp `data-corner-form={form}` next to `data-corner-placement` on the wrapper at `:543`.

   Keep the ruler `placeCornerCluster` already gets: `offsetWidth`/`offsetHeight` for the cluster and `rectOf` for the rest (`:259-266`). Do not fold PARITY-SPEC's interface-scale ruler fix into this lane.

3. **The stacked form.** It is one `[data-slot="status-strip"]` element with two rows: the leading launchers (grid · frames · problems) over the readout and the trailing launchers (zoom · dev · help). Cells stay 36×40, as `chromeSize.smoke` requires for strip cells. Nothing is hidden and nothing moves out of the strip.

   The probe that proved the geometry injected this CSS. Reproduce it as Tailwind arbitrary descendant variants on the wrapper, active only when the form is `"stacked"`:

   ```css
   [data-slot="status-strip"] { display: grid; grid-template-columns: repeat(var(--ss-strip-columns), auto); justify-items: center; align-items: center; }
   [data-slot="status-strip"] > [role="separator"]:has(+ [data-slot="status-strip-readout"]) { display: none; }
   [data-slot="status-strip"] > [data-slot="status-strip-readout"] { grid-column-start: 1; }
   ```

   Derive `--ss-strip-columns` in `statusStrip.tsx` from the `items` array it already builds (`:241`). The trunk splits that array at `Math.ceil(n / 2)` (TRUNK `editor/statusStrip.tsx`, `StatusStrip`). Row 1 holds `2·mid − 1` children and row 2 holds `2·(n − mid) + 1`. Use the larger count, never a bare `5`, because grid and help are conditional (`:191`, `:230`).

   WHY at the selectors: they read the trunk's own `data-slot`s and never its class names. The column count follows the 3 | readout | 2 split, so a new item updates one array.

   The `<VariantSwitch/>` (≥1024 px only) stays beside the strip in the same `items-end` row.

4. **`menus.smoke.test.tsx:80-128`, the spec update.**
   - The title gains the doors out: "… Compare, the doors out (bbox-ui.com, Storybook), and the old-app switch …".
   - The pinned list becomes `["File", "Settings", "Edit", "View", "Export", "Preferences", "Keyboard shortcuts", "Compare changes…", "Set compare baseline to this board", "Open bbox-ui.com", "Open Storybook", "Switch to old SystemSketch"]`.
   - `separatorsOf(root)` goes from 5 to **6**, with the comment updated: `File | Settings | Edit View Export | Preferences Keyboard shortcuts | Compare ×2 | bbox-ui.com Storybook | old app`. The sites group is its own group (`chromeBar.tsx:94-111`). A probe measured exactly these 12 names and 6 separators in the running app.
   - Read row **names**, not `row.label`. Add a local `nameOf(row: MenuRow)` that walks `row.element`'s text nodes and skips any inside `[data-slot="dropdown-menu-shortcut"]` or `[data-slot="site-channel-badge"]`. The skip is by **node**, never by subtracting text; `testing/menus.ts:28-45` explains why. Copy the walker shape from `sites.smoke.test.tsx:95-104` and cite it.

   WHY comment (replace `:82-89`, keep its "a stale list here means the test was asserting the absence of a feature" point): the channel rows landed 09-21/22 on Zach's ask. Their badge is live status (`siteStatus.ts:133-152`). This run measured `(preview · main · 705847c · +uncommitted) · different from this board`, because a peer's Storybook answered on :5421. Pinning the badge would make the burger order depend on what else runs on the box, and on probe timing. `sites.ts:112-121` guarantees the row name never carries the badge. `sites.smoke.test.tsx:314` pins the badge text itself with a stubbed `/api/health`.

   The File submenu assertion and the serializer check below it stay as they are.

### WHY comments to leave (cite the lines)

- **At `cornerClusterForm`.** Zach, 2026-09-19: "please move the right corner menu to be truly in the right corner". The narrow case stacks immediately above the licence, as `corner.smoke:20-22`'s third bullet specifies. It stacks rather than drops cells because of his 09-20 grid/help ask (`statusStrip.tsx:9-20`) and `railClose.smoke:133-145`. Rule 3's lift-over-the-dock (`overlay.tsx:89-94`) stays the last resort for windows too narrow even for the stack: below about 677 px, or with zoom± enabled in the readout. There is no donor. The rule is ours, stated as such.
- **At the form/placement commit.** The invariant above.
- **At the stacked selectors.** The data-slot and column-count reasoning above.
- **In `menus.smoke`.** The badge-is-live-status reasoning above.

### Mutation test (in the commit message)

1. Force `cornerClusterForm` to return `"row"`. `corner.smoke` narrow must go red with `28`, then be restored.
2. Commit placement and form in the same `setState` without the deferral. Run `corner.smoke` narrow `--repeat 10` and report whether it ever reads 28, so the invariant is measured, not asserted. Then restore.
3. Put `"Open Storybook"` after `"Switch to old SystemSketch"` in the pinned list. It must go red, then be restored.

### Gate

Run from `apps/systemsketch`:
- `pnpm exec vitest --project=unit run src/chrome/cornerClusterForm.test.ts`
- `pnpm exec vitest --project=smoke run src/corner.smoke.test.tsx src/menus.smoke.test.tsx src/chromeSize.smoke.test.tsx src/railClose.smoke.test.tsx src/inspector.smoke.test.tsx src/cornerPlacementSettings.smoke.test.tsx src/settings.smoke.test.tsx src/sites.smoke.test.tsx src/variants.smoke.test.tsx`. Everything must be green except `menus.smoke`'s `:130` case, which belongs to L-FILES.
- `pnpm -r typecheck`

Port 63315 is shared by every worktree. If it is busy, wait and retry, and never kill another process. `railClose` is on the PRE-only flaky allowance, so re-run it alone once before calling it red.

**The user action to name.** Resize the studio window to 720 px wide. The bottom-right strip renders stacked, flush right, directly above "Get a license for production", and every one of its six cells stays clickable. Cite `overlay.tsx`'s wrapper line and the `useCornerPlacement` line that decides it.

Also capture one headless screenshot each at 720×900 and 1400×900 for the audit. A vitest failure screenshot is fine: `__screenshots__/` is gitignored.

### Out of scope

- The dock's position and size.
- The watermark and the forced-corner cover patch (`watermarkCoverRect`).
- TRUNK `StatusStrip`.
- The interface-scale ruler (`docs/PARITY-SPEC-2026-09-20.md:1075-1090`).
- `menus.smoke:130` (L-FILES).
- G-FLAKE's undo/redo case.
- EXT-SWITCHER's floating channel chip, which the peer places "above the bottom-right menu" (`lanes.json` EXT-SWITCHER).
- `sites.ts` row labels, which are peer-owned. The peer's worktree still renders the same two names as of its 2026-09-29 20:18 mtime.

## Notes for the dispatcher

- **EXPECTED_RED at merge.** Remove `corner.smoke narrow` and `menus.smoke:80`. Keep `menus.smoke:130` and `draft.smoke` ×7 until L-FILES.
- **G-FLAKE runs in parallel.** Both lanes may edit `menus.smoke.test.tsx`: G-STALE only `:80-128`, G-FLAKE at most `:47-78` and the harness. The hunks do not touch, so a textual merge should be clean. Re-run the whole file after the second merge anyway.
- **At the EXT-SWITCHER merge,** re-run `corner.smoke` and `menus.smoke`. If the peer's chip joins the corner's measured row, or its rows change the burger, the 12-name list is the app's whole menu and is meant to change with it (`menus.smoke:82-89`).
- **Guard gap, stated rather than papered over.** At 720 px, only Frames and Problems are pinned one-click (by `railClose`). Grid, zoom, dev and help being hit-testable in the stacked form is the builder's screenshot plus the audit's `elementFromPoint` check. No committed test pins it, because this lane's instruction was "a brief, not new tests".
- **For Zach, a reversible default, not a question.** The stacked 2×3 strip at narrow widths is the default. If he would rather keep today's single row lifted above the dock, 28 px over the licence, the change is a one-line amendment to `corner.smoke:132`, and it is his call. D4 says build.
