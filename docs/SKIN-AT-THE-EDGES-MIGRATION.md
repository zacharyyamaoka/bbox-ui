# Migration — move the sketch skin to the boundary

Staged plan for making `docs/peps/0001-sketch-skin-at-the-boundary.md` true.
Line numbers are against base commit `064be4b`; re-grep before editing, a
concurrent lane is adding a `diagnostics` prop across all of
`apps/storybook-basics/src/components/`.

**Dispatch order matters.** M6 is a *barrier*: it publishes a colour channel
the boundary depends on. Land it first, alone. M1–M5 then run in parallel —
disjoint files, no shared contract. M7 and M8 are cleanup and land last.

---

## Who is actually guilty

The brief this plan answers said "14 files import the skin". That is wrong,
and the distinction matters because it is the difference between a six-file
change and a fourteen-file one.

Measured with `grep -rl 'from "\.\./skin' components/`:

| verdict | count | files |
|---|---|---|
| **Guilty** — real `import` of skin geometry | **6** | `badge.tsx`, `block.tsx`, `port.tsx`, `portEdge.tsx`, `trace.tsx`, `traceTerminal.tsx` |
| **Innocent** — the string "skin" appears only in a *comment* | 9 | `blockMembers.tsx`, `button.tsx`, `dropdown-menu.tsx`, `editableText.tsx`, `foldingChevron.tsx`, `labeledPort.tsx`, `text.tsx`, `toggle.tsx`, `tooltip.tsx` |
| **Innocent** — comment only, non-component | 2 | `trace.routing.ts`, `tunnel.ts` |

The nine innocent files have **zero module coupling to the skin**. They
consume tokens the way any CSS consumer does — `var(--bbox-skin-radius,
var(--radius-lg))` written inline in their own `style`. That is a value the
edge supplied, resolved by CSS, which is exactly how a skin is meant to
work. Their comments reference `src/skin/skin.ts` as documentation of where
the token vocabulary is defined.

**Do not touch them.** Rewriting a correct file to look more obedient is
churn, and it would put nine extra files into a merge with a concurrent
lane for no behavioural gain.

---

## M6 · BARRIER — publish state-owned colour (do this first, alone)

**Why this is a barrier and not a detail.** The skin's mechanism for hiding
a crisp border is to make it *transparent* while keeping its 2px width, so
nothing moves — `skin.test.ts` pins that width across every skin. Measured
on `skin-styles--sketch` at base commit: a `Block`'s computed `border-color`
under the sketch skin is `rgba(0, 0, 0, 0)`.

So a boundary pass that reads `getComputedStyle(el).borderColor` gets
**transparent** and draws invisible outlines. A build lane that does the
obvious thing here ships a silently broken skin that still passes every
test that only checks for element presence.

The fix: where a *state* owns the colour, the component publishes its own
resolved colour in a channel the skin never writes.

| file | change |
|---|---|
| `port.tsx` | on the `[data-slot="port-dot"]` root (`:225`), add `style={{ "--bbox-ink-state": ringColor }}` alongside the existing style. `ringColor` is already computed at `:222`. |
| `portEdge.tsx` | on `[data-slot="port-edge-group-outline"]` (`:619`), add `"--bbox-ink-state": color ?? "var(--border)"`. Already in scope. |
| `traceTerminal.tsx` | on `[data-slot="trace-terminal"]` (`:141`), add `style={{ "--bbox-ink-state": color }}`. |
| `badge.tsx` | on `[data-slot="badge"]` (`:82`), publish the variant's resolved line colour the same way. |

This adds **no skin import** — the component is naming a colour it already
computed. It is strictly more honest than today, where the same colour is
passed as a React prop *into* a skin component (`SketchOutline`'s `stroke`).

Verify: `getComputedStyle(el).getPropertyValue("--bbox-ink-state")` is
non-empty for every state, and a child `<path>` with
`stroke: var(--bbox-ink-state, …)` resolves to it. Both confirmed working at
base commit (a port dot published `oklch(0.65 0.19 48)` and an injected
child path resolved exactly that).

---

## M1 · `trace.tsx` — delete both twins and the second path rewriter

The largest single win: this file is the only one running two path
rewriters, and it is where the permanent-twin tax is worst.

| line(s) | action |
|---|---|
| `:94` | delete `import { sketchPathData } from "../skin/sketchPath";` |
| `:115-116` | delete `CRISP_STYLE` and `SKETCH_STYLE` |
| `:118` | delete `TRACE_WOBBLE_PX` — it moves to `skin/sketchAtEdge.ts`, which already holds the identical value and whose test asserts the two agree until this line is gone |
| `:125-141` | delete `SKETCH_CACHE`, `SKETCH_CACHE_MAX`, `sketchedTracePath` |
| `:473` | delete `const sketched = sketchedTracePath(drawnPath);` |
| `:505`, `:507`, `:555` | delete the three `data-sketch="true"` twin `<path>` elements |
| `:504`, `:506`, `:554` | drop `style={CRISP_STYLE}` from the three surviving crisp paths |

**Leave the tunnel code entirely alone.** `tunnelVisualForPoints` /
`tunnelMouths` / `drawnPath` (`:369-383`) are semantic, not cosmetic — they
decide *which* geometry is painted. The sketch step was purely downstream of
them (`sketchedTracePath(drawnPath)`), so removing it cannot affect
tunnelling. Verified: a tunnelled cable is two subpaths in one `d`, and the
boundary's `sketchPathData` treats each `M` as its own run and pins that
run's two endpoints — both mouths stay anchored with zero tunnel awareness.

Also update `:100-113`'s module comment: its "it cannot know the active
skin" rationale is the thing this migration resolves, so it should point at
`docs/peps/0001-…` rather than defend the twins.

---

## M2 · `block.tsx` — remove the outline, keep a skin-neutral bleed

| line(s) | action |
|---|---|
| `:13` | delete `import { SketchOutline, SKETCH_OUTLINE_BLEED_PX } from "../skin/sketchOutline";` |
| `:198-204` | delete the `<SketchOutline>` element and the `:186-197` comment that explains its `stretch` mode |
| `:184` | **do not delete.** Replace `SKETCH_OUTLINE_BLEED_PX` with a local `const OUTLINE_BLEED_PX = 5;` |

`:184` is the one genuine residual. The root sets `overflow: clip` and
`overflowClipMargin: ${BLOCK_BORDER_PX + SKETCH_OUTLINE_BLEED_PX}px`,
because a drawn line bleeds slightly outside the border box and would
otherwise be sliced flat. The boundary appends its twin as a *child* of the
block, so the clip still applies.

Keep the allowance, drop the skin name. A `WHY:` should say: *slack for any
decorative child that paints just outside the border box; not a skin
import, and not a number the skin gets to set.* That is honest — the block
is granting generic bleed room, exactly like padding, and has no idea what
draws there.

---

## M3 · `badge.tsx` — remove the nominal-size outline

| line(s) | action |
|---|---|
| `:8` | delete the `SketchOutline` import |
| `:98-109` | delete the `<SketchOutline stretch width={40} height={20} …>` element and its comment |

This is the case with the measured payoff. Two chips in one row rendered at
41.7px and 121.2px both authored their outline at a 40-unit viewBox with
`preserveAspectRatio="none"` — x-scales of **1.04 and 3.03** against a
y-scale of 1.10 either way. The wide chip's wobble was stretched 2.75× more
horizontally than vertically. The boundary measures and draws 1.00/1.00.

Needs M6 (badge's semantic variants own their line colour) and M7 (the seed
`badge:${size}:${shape}` is prop-derived).

---

## M4 · `port.tsx` — remove the drawn ring

| line(s) | action |
|---|---|
| `:23` | delete the `SketchOutline` import |
| `:247-256` | delete the `<SketchOutline shape="ellipse" …>` element and `:239-246`'s comment |

The `ringColor != null` guard at `:247` disappears with it; M6 carries that
colour instead. The boundary already draws `[data-slot="port-dot"]` as an
ellipse.

Note the diameter arithmetic at `:249-251`
(`diameterPx + SURFACE*2 + STATE*3`) exists to land the drawn ring on the
same centre-line the box-shadow rings use. **This is solved, not an open
question** — `ringExpansion` in `skin/sketchAtEdge.ts` derives it from the
element's own computed `box-shadow` spreads, and the algebra reduces exactly
(`SURFACE*2 + STATE*3 == 3*s2 - s1`, `STATE == s2 - s1`). Verified: the edge
emits viewBox `0 0 25 25` and pen `3` for a 12px dot, identical to the
core's own output, asserted per state in `SideBySide`.

**But replace the parser here.** Reading another component's `box-shadow` is
DOM archaeology; it exists only because this lane could not edit `port.tsx`.
When you are already in the file for M6, publish the two numbers alongside
the colour and delete `ringExpansion`'s parsing branch. The function's own
header says so.

---

## M5 · `portEdge.tsx` — remove the group outline

| line(s) | action |
|---|---|
| `:65` | delete the `SketchOutline` import |
| `:632-638` | delete the `<SketchOutline>` element |
| `:605-616` | rewrite the comment — its "it renders always and CSS decides which one paints" claim is what this migration retires |

Then add `[data-slot="port-edge-group-outline"]` to `BOX_SELECTOR` in
`skin/sketchAtEdge.ts`. The wrapping div is already `position: absolute`,
which establishes the containing block the twin positions against.

---

## M5b · `traceTerminal.tsx` — remove the hand-rolled ellipse twin

| line(s) | action |
|---|---|
| `:25` | delete `import { sketchEllipsePath } from "../skin/sketchPath";` |
| `:135-138` | delete the `ringD` memo |
| `:156-…` | delete the `[data-slot="trace-terminal-ring-sketch"]` `<path>` |
| `:152` | drop `var(--bbox-skin-line-override, …)` from the circle's stroke — M6's channel replaces it |

This one gets *easier* at the boundary, not harder. `:124-134`'s comment
explains that `SketchOutline` could not be used here because it assumes
HTML/CSS positioning while this glyph is pure SVG positioned by its own
`<g transform>`. The boundary has no such problem: it appends into the same
`<g>`, which inherits the transform. The hand-rolled duplicate exists only
because the core's own abstraction could not reach this case.

Add `[data-slot="trace-terminal-ring"]` to `DOT_SELECTOR`.

---

## M7 · seeds travel as one attribute

Three components seed semantically rather than geometrically, and the edge
cannot see props:

| file | current seed | add |
|---|---|---|
| `badge.tsx` | `` `badge:${resolvedSize}:${resolvedShape}` `` | `data-bbox-seed` on `[data-slot="badge"]` |
| `port.tsx` | `` `port:${state}:${diameter}` `` | `data-bbox-seed` on `[data-slot="port-dot"]` |
| `traceTerminal.tsx` | `` `trace-terminal:${dir}:${radius}` `` | `data-bbox-seed` on `[data-slot="trace-terminal"]` |
| `portEdge.tsx` | `` `port-edge-group:${slot.slotId}` `` | `data-bbox-seed` on the group outline |

`seedForBox` in `skin/sketchAtEdge.ts` already reads `data-bbox-seed` first
and falls back to a geometry string. `block.tsx` needs nothing — its default
seed is already `` `${width}x${height}` ``, which the boundary reproduces.

Without M7 the wobble *pattern* differs from today while its character and
amplitude do not. With it, byte-identical everywhere.

---

## M8 · the edge, and the cleanup

1. **`.storybook/preview.tsx`** — wrap the existing skin decorator's output
   in `<SketchAtEdge active={skin === "sketch"}>`. That decorator already
   knows the skin (`context.globals`), which is the proof the edge was
   always the right place. Keep the no-wrapper-when-unset behaviour at
   `:68-82` intact; it is what keeps S1 (no skin → byte-identical DOM) true.
   **A concurrent lane owns `.storybook/`** — coordinate or land this last.
2. **`skin.css`** — move `SKETCH_AT_EDGE_CSS`'s three rules in permanently.
   Retire `--bbox-skin-crisp` (`:70`, `:97`, `:140`) and
   `--bbox-skin-outline`'s `display` role (`:58`, `:90`, `:124`): with the
   core emitting no twins, there is nothing to switch between. That drops
   `BBOX_SKIN_TOKENS` from 15 entries to 13.
3. **`skin.test.ts`** — it asserts the CSS defines *exactly* the closed
   token set, so it fails loudly on the two removals. That is the test
   working; update the table, do not weaken the assertion.
4. **`sketchOutline.tsx`** — `SketchOutline` and `SketchLine` become
   unreferenced. Delete them, or keep `SketchLine` if `Bar` still needs a
   drawn rule (it is not in the guilty six, so check before deleting).
5. **`docs/ALGORITHM-PROVENANCE.md`** — add the `src/skin/` section (see
   below).

---

## Acceptance for the build lane

Baseline at `064be4b`, plus this lane's additions:

| gate | before | after this lane | must hold post-migration |
|---|---|---|---|
| `pnpm --filter bbox-storybook-basics run typecheck` | clean | clean | clean |
| `pnpm test-stories` | 47 files / 192 | **48 / 197** | ≥ 48 / 197 |
| `npx vitest --project=unit run` | 24 files / 393 | **25 / 415** | ≥ 25 / 415 |

Plus, specific to the migration:

- `grep -rl 'from "\.\./skin' apps/storybook-basics/src/components/` returns
  **nothing**. That single command is the whole point of the exercise.
- `Skin/At the edges → BoundaryMatchesCoreExactly` will need rewriting once
  the core's twin is deleted — its oracle *is* that twin. Replace it with a
  golden-path assertion captured from this lane's output before deleting the
  core's half, or the byte-identity evidence is lost with it. **Capture the
  golden strings first.**
- `Styles/*` must still render all three skins, and the toolbar picker must
  still switch live. That is Zach's review surface; a correct architecture
  that loses it is a failed deliverable.
- **Assert on the injected node's own rendered box, not its attributes.** A
  boundary twin lives in the host's cascade: `Badge`'s
  `[&>svg]:size-3` beat a `width="121.2"` attribute and collapsed an outline
  to 12×12 while every presence-based check stayed green. The pass now sets
  size as inline style and `MeasuredNotNominal` measures the twin's own
  `getBoundingClientRect`. Any new slot added to `BOX_SELECTOR` needs the
  same guard — check what descendant `svg` rules its component already has.
- Measure, do not assert: every visual claim via `getBoundingClientRect`,
  `getComputedStyle`, or the real `d` string read out of the DOM.
  `storyRenders[0].reportedException` is not a real property.

---

## Provenance addendum owed

`docs/ALGORITHM-PROVENANCE.md` scopes itself to
`apps/storybook-basics/src/components` and therefore covers **none** of
`src/skin/` — `sketchPath.ts`, `sketchOutline.tsx` and now `sketchAtEdge.ts`
are all unclassified there. (The brief for this lane claimed the document
"classifies `sketchPath.ts` already"; it does not — verified by grep, zero
matches for `sketch`, `skin`, `wobble` or `jitter`.)

This is a scope gap in the index, not a citation gap in the code:
`sketchPath.ts` carries an unusually thorough in-file provenance header —
tldraw 5.3.2 `lib/shapes/shared/PathBuilder.mjs` (`toDrawD`),
`lib/shapes/geo/GeoShapeBody.mjs`, `@tldraw/utils`'s `rng` ported verbatim,
with every deviation marked `DEVIATION` and reasoned.

Rows to add:

| File | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `skin/sketchPath.ts` | (a) + (c) | (a) tldraw 5.3.2 `rng` verbatim; `toDrawD`'s displacement model. (c) `sketchWobbleFor`, `SKETCH_EDGE_POINTS`, `smoothThrough`, `flattenPathData` are ours — marked `DEVIATION` in-file with the calibration reasoning | In-file header cites exact tldraw module paths; deviations self-declared |
| `skin/sketchOutline.tsx` | (a) | `packages/bbox-ui/src/sketchOutline.tsx` @ `c83c8b2`, byte-identical body | Header states verbatim port |
| `skin/sketchAtEdge.ts` | (c) + model | (c) the DOM-walk, twin protocol and measured seeding are ours, ad hoc. Model: SystemSketch keeps hand-drawn at the host renderer via tldraw's own `dash: "draw"` shape prop — `/home/bam/systemsketch/src/inspector/inspectorModel.ts:742`, read read-only 2026-09-17 | Donor line opened; SystemSketch confirmed to have **zero** custom sketch geometry, no roughjs, no `feTurbulence` |
