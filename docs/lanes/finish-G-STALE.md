# Lane finish:G-STALE — stale burger pin and the narrow-corner layout

_Stream plan: `docs/finish-2026-09-29/WORK-ORDER.md` + `docs/finish-2026-09-29/lanes.json` (lanes.json wins) · repo: **bbox-ui** · base: `claude/finish-2026-09-29` @ `61e26e6` (W1, B-DEPS and the peer's EXT-SWITCHER merged; B-SHELL-P1 still queued) · wave W2, runs beside G-FLAKE · dependsOn: W1-LAND (merged) · model: sonnet · size S · barrier: False_

Re-issued 2026-10-06 from the interrupted run's brief
(`docs/finish-2026-09-29/salvage/finish-G-STALE.md`, written on `bfec965`),
every line re-checked against `61e26e6`. What changed since then:

- **The burger pin is no longer the builder's job.** The acceptance commit
  that carries this brief also updates `menus.smoke.test.tsx`'s burger case
  (the spec update D4 allows). It is green on `61e26e6` and is now read-only
  acceptance like the rest of the file.
- **The interrupted builder's work is salvaged** under
  `docs/finish-2026-09-29/salvage/` (`G-STALE-build.diff` +
  `G-STALE-build-untracked.tar`). `git apply --check` passes on `61e26e6`. It
  was never committed or gated. Take it over; do not trust it.
- **EXT-SWITCHER merged (`8779ef0`).** Its chrome edits are comment-only
  (`LEDGER.md`, EXT-SWITCHER row). Its floating channel chip is the
  `sps` runtime's, declared at `apps/systemsketch/stable-preview.json:20`
  (`"avoid": ["[data-slot=\"status-strip\"]"]`), so it reads the strip's live
  box. No app code renders it, and no test here sees it.
- Line numbers below are this tree's. Between `bfec965` and `61e26e6` the only
  changes under `apps/systemsketch/src/chrome/` are comment-only edits to
  `sites.ts`, `siteStatus.ts` and `legacyApp.ts`. Nothing under
  `apps/storybook-basics/src` changed. The geometry measured on 09-30 still
  holds, and the red below re-confirms it (`28`, unchanged).

| id | status | evidence (this tree, `61e26e6`) |
|---|---|---|
| `corner.smoke-narrow` (720×900) | **build** | `apps/systemsketch/src/corner.smoke.test.tsx:116-135` is red at `:132`: `AssertionError: expected 28 to be less than or equal to 8`. Fix the layout, never the test. |
| `menus.smoke-burger-order` (`:80`) | **done-already** (the feature) · **spec updated in this acceptance commit** | The channel rows render today. User action: burger ▸ `Open bbox-ui.com` / `Open Storybook`, built at `chrome/sites.ts` and wired at `chrome/TitleBar/chromeBar.tsx:107-111,128`. The pinned list was stale. It now pins 12 names and 6 separators with an exact `toEqual`/`toBe`, and it was green on `61e26e6`. Mutation-tested red both ways (order swap, separator 6→5). |
| backlog items | none | `lanes.json` G-STALE `items: []`. |
| clusters | none | `lanes.json` G-STALE `clusters: []`. No row of `backlog-verified.json`, `residuals.json` or `untriaged-clusters.md` names G-STALE, the corner cluster, the status strip, the watermark or the burger order. Re-scanned by regex on `61e26e6`. Only `baseline.md:18,20` mention them, as the W0 reds. |

## Write set (the ONLY paths you may create or edit)

Re-issued against `61e26e6`. B-SHELL-P1 has not run, so the corner cluster still lives in `APP/src/chrome/`. `TRUNK/shell/` holds no corner code: `grep -rl "status-strip\|corner-placement" apps/storybook-basics/src/shell/` is empty.

- `apps/systemsketch/src/chrome/overlay.tsx`: only these parts.
  - `useCornerPlacement`, at `:235-315`.
  - `CornerPlacementState`, `INITIAL_CORNER_PLACEMENT` and `sameCornerPlacementState`, at `:194-221`.
  - The corner wrapper `<div ref={corner}>`, at `:539-562`, and its `useCornerPlacement` call at `:390`.
  - The move of the pure half described in step 1.

  `placeCornerCluster` (`:96-133`) and `watermarkCoverRect` (`:176-183`) keep their signatures, their behaviour and their `./chrome/overlay` export, because `corner.smoke`'s pure cases import and pin both (`corner.smoke.test.tsx:30`).
- `apps/systemsketch/src/chrome/statusStrip.tsx`: only the stacked-form hook-up of `SystemSketchStatusStrip` (`:158-283`). The items, their order and their launch behaviour do not change.
- `apps/systemsketch/src/chrome/cornerClusterForm.ts` (new): the pure corner geometry, moved, plus the form decision. It has no tldraw and no React import, so the node `unit` project (`vitest.config.ts:30-32`, `src/**/*.test.ts`) can load it.
- `apps/systemsketch/src/chrome/cornerClusterForm.test.ts` (new, builder-owned): the unit cases for that decision.

## Do not touch

- `apps/systemsketch/src/corner.smoke.test.tsx`: the acceptance. Read-only.
- `apps/systemsketch/src/menus.smoke.test.tsx`, **the whole file, including the burger case at `:80`**. The acceptance author updated the burger case in this lane's acceptance commit. The undo/redo case at `:47-78` is on G-FLAKE's flaky list (LEDGER.md, W1f), and G-FLAKE may edit it in parallel. The View/Preferences/Export case (now `:164`) is L-FILES' acceptance and stays red.
- `apps/systemsketch/src/testing/menus.ts`, `apps/systemsketch/src/testing/harness.tsx`: the committed harness (`menus.ts:1-3`).
- Guards that must stay green. Never edit them:
  - `apps/systemsketch/src/chromeSize.smoke.test.tsx`
  - `railClose.smoke.test.tsx`
  - `inspector.smoke.test.tsx`
  - `cornerPlacementSettings.smoke.test.tsx`
  - `settings.smoke.test.tsx`
  - `sites.smoke.test.tsx`
  - `variants.smoke.test.tsx`
- `apps/systemsketch/src/chrome/Toolbar/dock.tsx`: the dock stays where tldraw's own toolbar sits (`dock.tsx:261-270` WHY).
- `apps/systemsketch/src/chrome/{sites,legacyApp,siteStatus}.ts`, `apps/systemsketch/stable-preview.json`, `apps/systemsketch/devFileHost.ts`. EXT-SWITCHER merged and `rules.peerOwned` is discharged, but B-RENAME owns those files next, and this lane needs none of them.
- `apps/storybook-basics/src/**` (TRUNK), including `editor/statusStrip.tsx` and `shell/**`. The stacked form is app-side styling on the trunk's own `data-slot`s. It is not a trunk prop.
- `apps/systemsketch/src/settingsAreWired.test.ts`, `apps/systemsketch/src/chromeActionsAreWired.test.ts`. This lane adds no setting and no chrome callback.
- `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `vite.config.ts`.
- `docs/finish-2026-09-29/**`: the dispatcher's ledger and plan. Read the salvage there; never edit it.
- `/home/bam/systemsketch`, `/home/bam/pyblocks`, `/home/bam/zach_brain`.

## Acceptance (assertions you cannot edit)

- `apps/systemsketch/src/corner.smoke.test.tsx`: all 6 cases green, **unmodified**.
  - Three are live mounts: desktop 1400×900 beside the licence; narrow 720×900, flush right, ≤8 px above the watermark, clear of dock and watermark, watermark hit-testable; and forced corner at 1400×900.
  - Three are pure: `placeCornerCluster` ×2 and `watermarkCoverRect`.
- `apps/systemsketch/src/menus.smoke.test.tsx` "the burger is File first…" (`:80`) stays green, exactly as committed.
- None of these may go red:
  - `chromeSize.smoke`: desktop row level, `beside-licence` (`:139`), strip cells 36×40 (`CELL = 40`, `:33`), cluster clear of the dock.
  - `railClose.smoke` at 720×900: it presses `ss-status-frames` and `ss-status-problems`, `:133-145`.
  - `inspector.smoke:111`: `beside-licence` at 1400.
  - `cornerPlacementSettings.smoke`, `settings.smoke`, `sites.smoke`.
  - `variants.smoke:200-206`: the pill sits beside the strip.
- `pnpm -r typecheck` exits 0. The studio suite's failing set is EXPECTED_RED minus `corner.smoke` narrow and `menus.smoke:80`. That leaves `draft.smoke` ×7 and `menus.smoke`'s View/Preferences/Export case, both L-FILES.

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/systemsketch/src/corner.smoke.test.tsx`
- `apps/systemsketch/src/menus.smoke.test.tsx`

### Red now, for the right reason

Run from `apps/systemsketch`: `pnpm exec vitest --project=smoke run src/corner.smoke.test.tsx src/menus.smoke.test.tsx`

Before the spec update, on `61e26e6`, 2026-10-06: 3 failed of 13.
- `corner.smoke` narrow, at `:132`: `AssertionError: expected 28 to be less than or equal to 8`. **This lane's build.**
- `menus.smoke:90`: `toEqual` received `… "Set compare baseline to this board", "Open bbox-ui.com(remote)", "Open Storybook(not running)", "Switch to old SystemSketch"`. That is the stale pin. The badge text differs from 09-30's `(preview · main · 705847c · +uncommitted) · different from this board`, because nothing held :5421 this time, which is exactly why the new pin reads names and not badges.
- `menus.smoke` View/Preferences/Export: `locator.click` timeout. L-FILES', not this lane's.

After the spec update (this commit), run with `-t "the burger is File first"`: 1 passed. The mutations went red and were then restored:
- `"Open Storybook"` moved after `"Switch to old SystemSketch"`: `expected [ 'File', … ] to deeply equal …`.
- `separatorsOf(root)` expected 5: `expected 6 to be 5`.

### What was measured (probe mounted in the real app, `bfec965`, 2026-09-30; geometry files unchanged on `61e26e6`)

| viewport | strip (x · y) | dock | watermark | placement | watermark.top − strip.bottom |
|---|---|---|---|---|---|
| 1400×900 | 993.3–1288 · 842–892 (294.7 wide) | 529.5–870.5 · 840–892 | 1296–1396 · 860–896 | `beside-licence` | on the bottom row ✓ |
| 800×900 | 497.3–792 · 782–832 | 229.5–570.5 · 840–892 | 696–796 · 860–896 | `above-licence` (lifted over dock) | 28 ✗ |
| **720×900** | **417.3–712 · 782–832** | **189.5–530.5 · 840–892** | **616–716 · 860–896** | `above-licence` (lifted over dock) | **28 ✗** |
| 720×900, **stacked** probe (CSS below, injected) | **552.3–712 · 762–852 (159.7×90)** | same | same | `above-licence` | **8 ✓**, 21.8 px clear of the dock |

**Root cause.** The strip grew from 152 px to 294.7 px on 09-20, when grid and help joined it at Zach's ask (`statusStrip.tsx:9-20`). The pure case at `corner.smoke:139` still uses 152. At 720 px the flush-right span (417.3–712) now reaches over the dock, whose right edge is at 530.5. Rule 3 (`overlay.tsx:111-120`) therefore lifts the cluster above the dock's top (840) instead of the watermark's (860): 860 − (840 − 8) = **28**.

**No placement alone can pass.** The strip's bottom must sit between 852 and 860, and the dock's top is at 840. The strip therefore overlaps the dock's rows, so it must clear the dock sideways: width ≤ 712 − 530.5 = **181.5 px**. One row is 294.7 px. At narrow widths the cluster has to change **form**, not only place.

## Builder brief

Work in `apps/systemsketch` only. Run `pnpm install --frozen-lockfile` once. Run git only as plain `git …` from your worktree root (`rules.isolatedGit`). Never `git add -A`: stage explicit pathspecs and read `git diff --cached --name-only` before committing. The acceptance files are read-only. If one cannot pass, return FAIL with the one-line reason. No audits (`rules.noAudits`). Stop every process you start.

**Start from the salvage, then verify it like anyone else's code.** Apply it with these two commands:
1. `git apply docs/finish-2026-09-29/salvage/G-STALE-build.diff`
2. `tar xf docs/finish-2026-09-29/salvage/G-STALE-build-untracked.tar`

The tar adds `chrome/cornerClusterForm.ts` and `chrome/cornerClusterForm.test.ts`. Both apply cleanly on `61e26e6`. The salvage covers steps 1–3 below: the pure module and its re-export, the form/placement deferral, `data-corner-form`, and `--ss-strip-columns`. It was written by a builder that was interrupted at 02:25 on 09-30, before any gate ran. **Read every hunk against steps 1–3, then run the gates.**

Two things in it to check first:
- **The re-export.** `overlay.tsx` must keep exporting `CORNER_INSET`, `placeCornerCluster`, `watermarkCoverRect` and `CornerRect` (`corner.smoke.test.tsx:30`).
- **`useLayoutEffect` ordering.** The form effect must see a live `measureRef`.

**Defaults already decided. Do not reopen them:**
- **D4** (WORK-ORDER.md §6): "Build what they specify (… the narrow corner …); update only the stale burger order." The burger order is updated already (see the table). You build the layout.
- **D2**: the lane lands on `claude/finish-2026-09-29` through the dispatcher. Never main, never push.
- **The narrow corner stacks. It does not drop cells, and it does not move the dock.** The acceptance author decided this with weighted criteria:
  - **(1) All six cells stay one click at every width.** Zach asked for grid and help on 09-20 (`statusStrip.tsx:9-20`), and `railClose.smoke:133-145` presses Frames and Problems at 720.
  - **(2) The dock stays where tldraw's toolbar sits** (`dock.tsx:261-270`).
  - **(3) App-only, no TRUNK edit.**

  Rejected:
  - **Overflow or compaction** in tldraw's style, where `DefaultNavigationPanel.mjs:29` collapses to the ZoomMenu below TABLET. It fails (1). Frames · Problems · zoom plus an overflow `⋯` cell measures about 204.7 px, which is over 181.5. Only dropping grid, dev and help from the strip altogether gets under the limit (about 159.7 px), and that takes away cells he asked for.
  - **Shifting the dock left.** It fails (2), and it creates a circular measurement: the dock would move off the cluster that measures the dock.
  - **Editing the test.** D4 rules it out.

### Build in this order

1. **`chrome/cornerClusterForm.ts`, the pure decision.**

   First move the pure half of `overlay.tsx` into this module verbatim, with their WHY blocks:
   - `CORNER_INSET`, `CornerRect`, `CornerPlacementKind`, `CornerPlacement`
   - `overlaps`, `placeCornerCluster`
   - `WatermarkCoverRect`, `WATERMARK_COVER_MARGIN`, `watermarkCoverRect`

   Then re-export them from `overlay.tsx` (`export { … } from "./cornerClusterForm"`). `corner.smoke` imports them from `./chrome/overlay`, so that path must keep resolving.

   Then add `type CornerClusterForm = "row" | "stacked"` and `cornerClusterForm({ container, row, watermark, obstacles }): CornerClusterForm`. `row` is the single-row cluster size.
   - It runs `placeCornerCluster` on `row`.
   - It returns `"stacked"` exactly when rule 3 had to lift the row over something other than the watermark: either the placement is `"above-dock"`, or it is `"above-licence"` with `bottom > container.bottom - watermark.top + CORNER_INSET`.
   - Otherwise it returns `"row"`.

   Unit cases go in `cornerClusterForm.test.ts`, using the measured numbers:
   - 1400×900, row 294.7×50 or 403.6×50 → `"row"`.
   - 720×900, row 294.7×50, dock 189.5–530.5/840–892, watermark 616–716/860–896 → `"stacked"`.
   - Forced corner at 720 (watermark `null`, the same dock) → `"stacked"`.
   - Licensed 1400 (watermark `null`) → `"row"`.

   Gate: `pnpm exec vitest --project=unit run src/chrome/cornerClusterForm.test.ts` is green.

2. **`useCornerPlacement` in `overlay.tsx`.** It returns `{ placement, watermarkCover, form }`.
   - Cache the row size in a ref, refreshed whenever the rendered form is `"row"`.
   - **Never decide from the stacked box.** The stacked box always fits, so deciding from it flips the form back and oscillates.
   - Each `measure()` decides the form from the cached row size first. If the form would change, **commit only the form and keep the previous placement**.
   - Then place in the measure that runs once the new form has rendered: a `useLayoutEffect` keyed on the form, which also covers the ResizeObserver path.

   **Invariant, and put it in a WHY comment:** `data-corner-placement` never publishes a placement computed for the form it is not rendering. `corner.smoke:120-122` waits for `"above-licence"` and then measures once. At 720 a lifted row also reports `"above-licence"`, so a lifted row that is ever committed turns into a flaky 28.

   Stamp `data-corner-form={form}` next to `data-corner-placement` on the wrapper (`:543`).

   Keep the ruler `placeCornerCluster` already gets: `offsetWidth`/`offsetHeight` for the cluster and `rectOf` for the rest (`:259-266`). Do not fold PARITY-SPEC's interface-scale ruler fix into this lane.

3. **The stacked form.** It is one `[data-slot="status-strip"]` element with two rows: the leading launchers (grid · frames · problems) over the readout and the trailing launchers (zoom · dev · help).
   - Cells stay 36×40, as `chromeSize.smoke` requires for strip cells.
   - Nothing is hidden, and nothing moves out of the strip.

   The probe that proved the geometry injected this CSS. Reproduce it as Tailwind arbitrary descendant variants on the wrapper, active only when the form is `"stacked"`:

   ```css
   [data-slot="status-strip"] { display: grid; grid-template-columns: repeat(var(--ss-strip-columns), auto); justify-items: center; align-items: center; }
   [data-slot="status-strip"] > [role="separator"]:has(+ [data-slot="status-strip-readout"]) { display: none; }
   [data-slot="status-strip"] > [data-slot="status-strip-readout"] { grid-column-start: 1; }
   ```

   Derive `--ss-strip-columns` in `statusStrip.tsx` from the `items` array it already builds (`:241`).
   - The trunk splits that array at `Math.ceil(n / 2)` (TRUNK `editor/statusStrip.tsx`, `StatusStrip`).
   - Row 1 holds `2·mid − 1` children, and row 2 holds `2·(n − mid) + 1`.
   - Use the larger count, never a bare `5`, because grid and help are conditional (`:191`, `:230`).

   WHY at the selectors: they read the trunk's own `data-slot`s and never its class names. The column count follows the 3 | readout | 2 split, so a new item updates one array.

   The `<VariantSwitch/>` (≥1024 px only) stays beside the strip in the same `items-end` row.

4. ~~The `menus.smoke` spec update~~: done by the acceptance author in this lane's acceptance commit. Do not edit `menus.smoke.test.tsx`.

### WHY comments to leave (cite the lines)

- **At `cornerClusterForm`.**
  - Zach, 2026-09-19: "please move the right corner menu to be truly in the right corner". The narrow case stacks immediately above the licence, as `corner.smoke:20-22`'s third bullet specifies.
  - It stacks rather than drops cells because of his 09-20 grid/help ask (`statusStrip.tsx:9-20`) and `railClose.smoke:133-145`.
  - Rule 3's lift over the dock (`overlay.tsx:89-94`) stays the last resort for windows too narrow even for the stack: below about 677 px, or with zoom± enabled in the readout.
  - There is no donor. The rule is ours, and the comment says so.
- **At the form/placement commit.** The invariant above.
- **At the stacked selectors.** The data-slot and column-count reasoning above.

### Mutation test (in the commit message)

1. Force `cornerClusterForm` to return `"row"`. `corner.smoke` narrow must go red with `28`. Then restore it.
2. Commit placement and form in the same `setState`, without the deferral. Run `corner.smoke` narrow with `--repeat 10` and report whether it ever reads 28, so the invariant is measured, not asserted. Then restore it.

### Gate

Run from `apps/systemsketch`:
- `pnpm exec vitest --project=unit run src/chrome/cornerClusterForm.test.ts`
- `pnpm exec vitest --project=smoke run src/corner.smoke.test.tsx src/menus.smoke.test.tsx src/chromeSize.smoke.test.tsx src/railClose.smoke.test.tsx src/inspector.smoke.test.tsx src/cornerPlacementSettings.smoke.test.tsx src/settings.smoke.test.tsx src/sites.smoke.test.tsx src/variants.smoke.test.tsx`

  Everything must be green except `menus.smoke`'s View/Preferences/Export case, which belongs to L-FILES. The undo/redo case is G-FLAKE's flaky allowance: re-run it alone once before calling it red.
- `pnpm -r typecheck`

Port 63315 is shared by every worktree. If it is busy, wait and retry, and never kill another process. `railClose` is on the PRE-only flaky allowance, so re-run it alone once before calling it red.

**The user action to name.** Resize the studio window to 720 px wide. The bottom-right strip renders stacked, flush right, directly above "Get a license for production", and every one of its six cells stays clickable. Cite `overlay.tsx`'s wrapper line (`data-corner-form`) and the `useCornerPlacement` line that decides it.

**Prove the six cells, since no committed test does.** At 720×900, in the stacked form, run an `elementFromPoint` check at the centre of each `ss-status-*` cell and of the zoom trigger. Each point must hit its own cell. Paste the numbers into the commit message. Also capture one headless screenshot each at 720×900 and 1400×900. A vitest failure screenshot is fine, because `__screenshots__/` is gitignored.

### Out of scope

- The dock's position and size.
- The watermark and the forced-corner cover patch (`watermarkCoverRect`).
- TRUNK `StatusStrip` and `TRUNK/shell/**`.
- The interface-scale ruler (`docs/PARITY-SPEC-2026-09-20.md:1075-1090`).
- `menus.smoke.test.tsx`: all of it, now acceptance.
- G-FLAKE's undo/redo case, and L-FILES' View/Preferences/Export case.
- EXT-SWITCHER's floating channel chip. The `sps` runtime places it bottom-right and avoids `[data-slot="status-strip"]` by its live box (`stable-preview.json:20`). A taller stacked strip needs no config change. That is unverified, because `sps` cannot serve this app until D11.
- `sites.ts` row labels.

## Notes for the dispatcher

- **EXPECTED_RED at merge.** Remove `corner.smoke narrow` and `menus.smoke:80`. Keep the View/Preferences/Export case (now `:164`, shifted +34 lines by the spec update) and `draft.smoke` ×7 until L-FILES.
- **G-FLAKE runs in parallel.** The acceptance commit edits only `menus.smoke.test.tsx`'s burger `it()`, from `:80` to the `separatorsOf(root)).toBe(6)` line. Nothing at `:1-79` changed, imports included. G-FLAKE edits at most `:47-78` and the harness, so the hunks do not touch. Re-run the whole file after the second merge anyway.
- **B-SHELL-P1 runs after this lane** and owns `APP/src/chrome/**`. It must carry `cornerClusterForm.ts`, the `data-corner-form` stamp and the stacked selectors along when it lifts the chrome. `corner.smoke` narrow is the guard that says whether it did.
- **Guard gap, stated rather than papered over.** At 720 px only Frames and Problems are pinned one-click, by `railClose`. Grid, zoom, dev and help being hit-testable in the stacked form rests on the builder's `elementFromPoint` numbers in the commit message. No committed test pins it, because this lane's instruction was "a brief, not new tests". Read those numbers at merge.
- **For Zach, a reversible default, not a question.** The stacked 2×3 strip at narrow widths is the default. He may prefer today's single row lifted above the dock, 28 px over the licence. That is a one-line amendment to `corner.smoke:132`, and it is his call. D4 says build.
