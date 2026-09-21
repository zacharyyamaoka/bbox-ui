# Parity spec — SystemSketch → bbox-ui, 2026-09-20

Produced by four read-only investigations against the archived SystemSketch at
`/home/bam/systemsketch`, FigJam's own traced DOM, and this worktree.

**The oracle for anything FigJam-shaped is
`/home/bam/systemsketch/docs/assets/figjam-chrome-traced.json`** — a live
`getComputedStyle` + `getBoundingClientRect` dump of FigJam's real DOM captured
2026-09-01 by `tools/figjam/chrome_trace.py`. It is not a screenshot reading.
Prefer it over any prose, including this document.

> Trap, already sprung once: `systemsketch-chrome.css:906-977` spans TWO
> families. The 33x32 / radius-7 / 18px-stroked-icon family in the second half
> is SystemSketch's OWN INVENTION with no FigJam counterpart, and is the one
> family a re-implementation must NOT copy. Every real FigJam cell is 40px tall
> with a 5px radius.


---

# spec:control-inventory

> **READ-ONLY run.** Nothing under `/home/bam/systemsketch` or `/home/bam/bbox-ui-toolbar` was modified. Every claim below is cited to a line in one of the three sources.

## The headline

**bbox-ui's pill has 11 controls. The donor's has 34 across six selection surfaces.** The 11 that exist are the *cheap* ones — every control bbox-ui ships is either a stock tldraw `StyleProp` read off `getSharedStyles()` or a stock `Editor` call. Everything the donor added on top of tldraw — the FigJam palette, the shape picker, arrowheads, routing, wrap, depth, layout, the domain pills — is absent, and **three of bbox-ui's own controls (Focus, Duplicate, Delete) are in neither the donor nor FigJam.**

The single most load-bearing correction: **the donor does not have Delete in its pill.** `grep -rn "selection-delete\|pill-delete" /home/bam/systemsketch/src` returns nothing, and neither `SelectionContextualMenu.tsx` nor `SystemSketchChrome.tsx` contains a `deleteShapes` call. The FigJam spec row that says otherwise (`docs/build_figjam_contextual_menu_spec.py:66`) is dated 2026-09-01 and is the *historical record of the donor removing it*, not a description of the donor today. Reading that row forward inverts the finding.

---

## A — the donor's pill, in the order it renders

Composition is data, not JSX. The order is `CONTEXTUAL_SURFACE_REGISTRY` (`/home/bam/systemsketch/src/contextualMenus/contextualSurfaceRegistry.ts:36-49`), and the surface is picked at `/home/bam/systemsketch/src/chrome/SystemSketchChrome.tsx:655-660`:

```
table-selection          → table-actions · opacity · arrange
behavior-tree-selection  → behavior-tree-actions · opacity · arrange
branch-selection         → branch-actions · opacity · arrange
block-selection          → block-actions · appearance · opacity · arrange · code-actions · wrap · layout · propagation-focus
shape-selection          →                 appearance · opacity · arrange · code-actions · wrap · layout · propagation-focus
block-title-editing      → title-formatting
```

`appearance` itself expands through the shipped **V3 Figma Segmented** recipe (`contextualControlRegistry.ts:399-405`, made the default by Zach 2026-09-08):

```
group "appearance": geo · color · strokeColor · lineStyle · arrowheadStart · lineShape · arrowheadEnd
group "text":       codeLanguage · font · size · align · verticalAlign · addText
```

Gating: the pill renders only when something is selected **and** `getEditingShapeId() === null` **and** `getCurrentToolId() === 'select'` (`SystemSketchChrome.tsx:517-522`). It is removed for the whole of 7 manipulation states (`SelectionContextualMenu.tsx:30-39`).

## B — bbox-ui's pill, in the order it renders

`/home/bam/bbox-ui-toolbar/apps/systemsketch/src/chrome/floatingToolbar.tsx:246-325`:

```
[ss-block only]  Block view ToggleGroup — Simple · Ports · Expanded
[ss-code only]   Language dropdown
[native tldraw]  StyleCluster — color · fill · dash · size("Small") · font("Aa") · align
                 ToolbarSeparator (only when a block/code row rendered)
[always]         ArrangeCluster (popover) · OpacityCluster (slider + "100%") · FocusButton
                 ToolbarSeparator
[always]         Duplicate · Delete
```

Rows come from `STYLE_ROWS` (`chrome/arrangeActions.ts:234-243`) filtered by `editor.getSharedStyles()`. Gating is `subject.ids.length > 0 && geometry !== null` (`floatingToolbar.tsx:148`) — **no editing check, no tool check** — and 3 manipulation states (`floatingToolbar.tsx:122-127`).

## C — FigJam, measured

`/home/bam/systemsketch/docs/build_figjam_contextual_menu_spec.py:45-53` (`CONTROLS`) and `:55-67` (`DELTAS`), sampled from the real app 2026-09-01. Pill is 40px tall, 96–603px wide, `[role=toolbar][aria-label="Selection Properties Menu"]`. Widest observed state is *text editing* at 603px / 10 controls. **No opacity, no z-order, no destructive action anywhere in it.**

---

## The rulings

### (a) Delete: **take it out of the pill.** Also Duplicate.

Evidence, in order of weight:

1. **FigJam, measured:** "Destructive actions — never in the pill — FigJam keeps them in the right-click menu" (`build_figjam_contextual_menu_spec.py:66`).
2. **The donor already did this.** No delete testid, no `deleteShapes`, anywhere in its pill path.
3. **Delete is already reachable three other ways in bbox-ui today**, so removal costs zero capability: the stock right-click menu (`App.tsx:68` sets `ContextMenu: SourceContextMenu`, which is `DefaultContextMenu` + `DefaultContextMenuContent` verbatim — `source/sourceContextMenu.tsx:1-29`), the Del/Backspace chord tldraw binds itself, and **Edit ▸ Delete** in the burger — whose shortcut column was *deliberately restored* on 2026-09-19 rather than suppressed (`chrome/stockMenus.ts`, the `actionRow` doc comment: "Deleting a shortcut Zach uses… to make a broken reader happy is the product serving the test").

**The three call sites that must move together:**

| # | Site | What it is |
|---|---|---|
| 1 | `apps/systemsketch/src/chrome/floatingToolbar.tsx:314-324` | the `ToolbarButton` itself |
| 2 | `apps/systemsketch/src/chrome/selectionActions.ts:89-93` | `deleteSelection(editor)` |
| 3 | `apps/systemsketch/src/menus.smoke.test.tsx:150-165` | the acceptance: clicks `ss-selection-delete`, asserts the shape is gone **and** the toolbar hides |

**Site 3 is the one that will get this wrong.** That test carries two assertions, and only one of them is about Delete. `await waitFor(() => app!.root.querySelector('[data-slot="floating-toolbar"][data-visible="true"]') === null)` at `:164` is the *only* place in the suite that proves the pill disappears on an empty selection. Delete the test and that proof goes with it. **Rewrite it to empty the selection through the right-click menu (or `editor.deleteShapes` directly), keeping the toolbar-hides assertion intact.**

A fourth site is documentation, not code, and is easy to miss: the frozen test-id contract line naming `ss-selection-view / ss-selection-delete` is repeated verbatim in **all seven** lane briefs — `docs/lanes/ss-L0.md:186`, `ss-L1.md:147`, `ss-L2.md:147`, `ss-L3.md:156`, `ss-L4.md:41` and `:149`, `ss-L5.md:149`, `ss-L6.md:131`. Left alone, a future lane rebuilds the button from its brief.

Keep `deleteSelection()` in `selectionActions.ts` — it is one honest wrapper and the right-click path may want it. Only the button goes.

**Duplicate follows by the same argument** (not in FigJam's pill, not in the donor's) but it is non-destructive, so it is taste, not rule. My call: drop it with Delete; the pill is a bar over the drawing and every control spent is canvas taken away (`selectionClusters.tsx:22-28`).

**Focus: keep, provisionally.** It is not in FigJam's pill or the donor's, and it duplicates tldraw's own `zoom-to-selection` action. It is cheap and non-destructive. Drop it only if pill width becomes the binding constraint.

### (b) Wrap: **a port, and the best value-per-line on this list. Half a day.**

Two of its four targets are free. `WRAP_TARGET_DESCRIPTORS` (`/home/bam/systemsketch/src/frames/wrapSelection.ts:43-58`):

- **Frame** → `stockActionId: 'frame-selection'`, **Group** → `stockActionId: 'group'`. Both are pure `actions[id].onSelect(source)` dispatches through tldraw's own action table (`WrapSelectionControl.tsx:28-40`). **Two lines each**, and tldraw keeps ownership of history, analytics and the frame toggle.
- **Block** and **Branch region** need real code: `INSETS` (`wrapSelection.ts:89-97` — block `{top: 48, side: 16, bottom: 16}`), bounds-around-children math, and `reparentShapes` **keeping page positions** so the container is drawn *around* where the children already are rather than moving them (`wrapSelection.ts:99-103`).

bbox-ui already has both container kinds (`ss-block` with `view: "expanded"`, and `ss-region`), and already has the exact popover pattern this trigger needs — `StyleRowControl` in `selectionClusters.tsx:200-230` is the same shape. Gate is `canWrapSelection`: ≥2 wrappable shapes, not readonly, connections excluded (`wrapSelection.ts:65-86`; in bbox-ui the exclusion is `ss-wire`).

Budget: ~100 lines of trigger + popover, 4 lines of stock dispatch, ~150 lines of bounds + reparent. **Acceptance must assert the children's page positions did not move** and that the container's bounds enclose them — a presence assertion passes while the shapes jump.

### (b) Tidy: **not a port. Real unbuilt work, and it is blocked on a model change, not a UI one. Do not ship it this round.**

The donor's `tidyEdges.ts` is 344 lines, and "Reset to automatic" is gated on `connectionHasCustomRoute` (`SelectionLayoutActions.tsx:25`, `blocks/connections/resetEdges.ts`) — i.e. the donor's `connection` shape carries a **persisted custom route**.

**bbox-ui's `ss-wire` has no route to tidy and none to reset.** `shapes/wire/wireGeometry.ts` recomputes the polyline every frame from `traceGeometry` over `@trunk/components/trace.layout`; there is no stored route prop anywhere in the file. So shipping Tidy means *first* giving `ss-wire` a custom-route prop and a drag affordance that writes it — which is larger than the tidy pass itself and is a schema change, not a pill change.

"Organize nodes" is worse still: `canOrganizeNodes` comes out of `src/blocks/layoutBlock.ts`, **1,674 lines**.

A disabled Tidy button is worse than no Tidy button. Leave the `layout` slot out.

---

## What is missing, ranked by how much Zach would notice

1. **Arrowheads and line shape.** Draw an arrow in bbox-ui today and the pill offers colour, fill, dash, size, font, align — and no way to change the head, the tail, or elbow-vs-curve-vs-straight. The donor has `arrowheadStart`, `arrowheadEnd` (9 options each) and `lineShape` (`contextualControlRegistry.ts:186-213`). **Small port**: three `STYLE_ROWS` entries over tldraw's own `ArrowShapeArrowheadStartStyle` / `…EndStyle` / `LineShapeSplineStyle`, plus glyphs.
2. **Shape picker (geo).** 20 options in the donor (`contextualControlRegistry.ts:191-212`), first control in the appearance group, and FigJam's first control too. bbox-ui has none — rectangle→ellipse is impossible from the pill. **Small port** + a glyph set.
3. **The colour palette.** bbox-ui shows tldraw's 13 raw enum names; the donor shows FigJam's **21** in an 11-wide grid, plus a custom colour picker (`appearance/figjamPalette.ts`, `customColors.ts` 149 lines). **A port** — it is a tldraw *theme*, so `<Tldraw themes={…}>` and no shape util is forked.
4. **Wrap.** See ruling (b). Port.
5. **Step in / Step out of an expanded Block.** `BlockSelectionMiniMenu.tsx:86-98`. bbox-ui hardcodes `depth={0}` in its ChromeBar (`docs/lanes/ss-L4.md:41`) — no depth navigation exists. **Real unbuilt work.**
6. **The pill during text editing.** bbox-ui's gate has no `getEditingShapeId()` check, so the shape pill sits there while you type. The donor returns `null` and swaps in a Block-title formatter with Bold (`SystemSketchChrome.tsx:517-522`, `:704+`; `BLOCK_TITLE_CONTEXTUAL_RECIPE` at `contextualControlRegistry.ts:389-397`). FigJam's *widest* state is exactly this one. **Gate is one line; formatter is real unbuilt work** — see risk 8.
7. **Font size in px / Custom.** Donor `customFontSize.ts`, 234 lines, with `rungPx` so "Extra large" never prints the same words at two different sizes (`contextualControlRegistry.ts:106-113`). bbox-ui shows `s/m/l/xl` only. **A port.**
8. **Vertical alignment.** Donor has it; bbox-ui does not. **One-line prop** — one entry in `STYLE_ROWS` (`arrangeActions.ts:234-243`) over `DefaultVerticalAlignStyle`.
9. **Line thickness.** Donor's `strokeWidth` (thin/medium/thick) is metadata-backed and deliberately separate from font size (`contextualControlRegistry.ts:155-164`). **A port** — needs the meta channel.
10. **Tidy edges / Reset routing / Organize nodes.** See ruling (b). **Real unbuilt work, blocked on schema.**
11. **Branch region actions** — `+ port`, `+ arm`, `E`/`C` view, `◎` active arm (`branch/ui/BranchSelectionMiniMenu.tsx`, 81 lines). bbox-ui has `ss-region` with `BranchTool`/`LoopTool` but no pill row. **A port of the UI, unbuilt work for the four commands behind it.**
12. **Propagation focus** — upstream/downstream reachability sliders (`propagation/PropagationFocusControls.tsx`, 169 lines), and it *takes over the whole pill* when active (`SystemSketchChrome.tsx:623-632`). **Real unbuilt work**: needs a dataflow reachability model bbox-ui does not have.
13. **Code line numbers + character width** (`code/CodeSelectionControls.tsx`, 266 lines). bbox-ui has the language dropdown only. **A port.**
14. **Table actions** — add/delete row and column, per-cell (`table/ui/TableSelectionMiniMenu.tsx`, 194 lines). No table shape in bbox-ui. **Unbuilt.**
15. **Behavior Tree actions** — Tree/Process, direction, node face, data lens, arrangement, ▶/■ run, step into subtree (`behaviorTree/ui/BehaviorTreeSelectionMiniMenu.tsx`, 123 lines). No BT in bbox-ui. **Unbuilt.**

### And two invisible ones that read as "this doesn't feel like SystemSketch"

- **Manipulation gate: 3 states vs 7.** bbox-ui covers `translating`/`resizing`/`brushing` (`floatingToolbar.tsx:122-127`); the donor covers those plus `rotating`, `dragging_handle`, `scribble_brushing`, `crop` (`SelectionContextualMenu.tsx:30-39`). Rotate a shape in bbox-ui and the pill rides under your cursor. **One line.**
- **Tool gate.** The donor requires `getCurrentToolId() === 'select'`. bbox-ui does not, so the selection pill can appear while another tool is active. **One line.**

### What bbox-ui has that the donor deliberately does not

Focus, Duplicate, Delete. All three are absent from FigJam's pill; Delete is absent from the donor's *by a decision that was already made and recorded*.

## Report rows

| Feature | SystemSketch / FigJam | bbox-ui today | Change needed |
|---|---|---|---|
| Pill gating — editing state | Hidden entirely while `getEditingShapeId() !== null`; a Block-title formatter takes the slot instead (SystemSketchChrome.tsx:517-522) | No editing check at all — `selected = subject.ids.length > 0 && geometry !== null` (floatingToolbar.tsx:148). The shape pill sits there while you type. | One-line prop: add the `getEditingShapeId() === null` conjunct. The replacement title formatter is separate, unbuilt work. |
| Pill gating — active tool | Requires `getCurrentToolId() === 'select'` (SystemSketchChrome.tsx:521) | Absent — the pill can render while another tool is active | One-line prop, same conjunct. |
| Manipulation hide states | 7 states: translating, resizing, rotating, dragging_handle, brushing, scribble_brushing, crop (SelectionContextualMenu.tsx:30-39) | 3 states: translating, resizing, brushing (floatingToolbar.tsx:122-127) | One-line prop: extend the `isIn` list to the donor's 7. Rotate today and the pill rides under the cursor. |
| Block view switch (Simple / Ports / Expanded) | 3 buttons, one capital each with a hover hint; batch-writes across a multi-Block selection via `setBlockViewForSelection` (BlockSelectionMiniMenu.tsx:71-84, :137-142) | Present — full-word ToggleGroup, single `ss-block` only (`subject.only`, floatingToolbar.tsx:246-278) | Parity for one block. Missing the multi-Block batch write — a port of `blockStyleCommands`. |
| Step in / Step out of an expanded Block | A `Step in` / `Step out` button on an expanded Block, driving `toggleDepthScope` (BlockSelectionMiniMenu.tsx:86-98) | Absent. bbox-ui hardcodes `depth={0}` in its ChromeBar (docs/lanes/ss-L4.md:41) — no depth navigation exists. | Real unbuilt work: needs a depth-scope model, not just a button. |
| Branch region actions | `+ port` · `+ arm` · `E` · `C` · `◎ active`, each a Branch command (branch/ui/BranchSelectionMiniMenu.tsx, 81 lines) | Absent. `ss-region` exists (BranchTool.ts, LoopTool.ts) but contributes no pill row. | Port the 81-line UI; real unbuilt work for the four commands behind it (addBranchControl, addBranchArm, setBranchView, cycleBranchActiveArm). |
| Behavior Tree actions | Tree/Process · direction · node face · data lens · arrangement/tidy · ▶ run / ■ stop · step into subtree (behaviorTree/ui/BehaviorTreeSelectionMiniMenu.tsx, 123 lines) | Absent — no Behavior Tree shape in bbox-ui | Not applicable until the shape exists. Real unbuilt work. |
| Table actions | Add row / add column, insert and delete row/column per selected cell (table/ui/TableSelectionMiniMenu.tsx, 194 lines) | Absent — no table shape | Not applicable until the shape exists. Real unbuilt work. |
| Shape picker (geo) | 20 options behind one icon trigger — first control in the appearance group (contextualControlRegistry.ts:191-212, :399-405). FigJam has it too, as its first control. | Absent. Rectangle→ellipse is impossible from the pill. | Small port: one `STYLE_ROWS` entry over tldraw's `GeoShapeGeoStyle` + a 20-glyph set. |
| Colour palette | FigJam's 21 colours in an 11-wide grid, delivered as a tldraw THEME that spreads DEFAULT_THEME (appearance/figjamPalette.ts:1-21, :68-75) | tldraw's 13 stock colours, swatches painted from `editor.getTheme("default")` at call time (arrangeActions.ts swatchColorFor) | A port — `<Tldraw themes={…}>`, no shape util forked. MUST spread DEFAULT_THEME or `registerColorsFromThemes` unregisters tldraw's 13 and stored boards fail validation. |
| Custom colour picker | Present — `custom: true` on the colour control, with alpha mapped onto the document model (contextualControlRegistry.ts:222-228, appearance/customColors.ts, 149 lines) | Absent — the 13 named values only | A port (149 lines + the trigger's Custom cell). |
| Fill | 4 options — Solid · Hatched · Transparent · No fill, ordered so the two opaque-ink treatments sit together (contextualControlRegistry.ts:125-136) | Present — tldraw's own fill enum behind a PaintBucket face (arrangeActions.ts:236) | Parity in kind; the donor's vocabulary is curated (it deliberately hides two migrated legacy values). Optional polish. |
| Line style / dash | 6 options including an `Async` value carried in shape metadata; `draw` leads because it is tldraw's own default (contextualControlRegistry.ts:143-152, :231-236) | Present — tldraw's raw dash enum behind a Minus face (arrangeActions.ts:237) | Parity for stock values. The `Async` line pattern is a port (strokeMeta.ts, 499 lines). |
| Stroke colour (edge paint) | A separate swatch row backed by shape metadata, so a connector's edge paints independently of its label (contextualControlRegistry.ts:237-243) | Absent — one colour row for everything | A port: needs the `strokeMeta` channel. |
| Line thickness | Thin · Medium · Thick, metadata-backed, deliberately NOT the font-size style (contextualControlRegistry.ts:155-164, :244-247) | Absent | A port. The WHY matters: an earlier connector-only `weight` wrote the stock `size` style and dragged label font size along with it. |
| Line shape (routing) | Elbowed · Curved · Straight — ONE user concept over three stock StyleProps: arrow kind+bend, line spline, cable routing (contextualControlRegistry.ts:180-186, :263-265) | Absent. An arrow's routing cannot be changed from the pill. | Small port: one row over `LineShapeSplineStyle` (+ the arrow/cable mapping if those kinds are in scope). |
| Arrowhead start / end | 9 options each — None, Arrow, Triangle, Square, Dot, Diamond, Inverted, Bar, Line (contextualControlRegistry.ts:188-198, :266-273) | Absent. Draw an arrow and there is no way to change its head or tail. | Small port: two `STYLE_ROWS` entries over tldraw's own `ArrowShapeArrowheadStartStyle` / `…EndStyle` + glyphs. Highest-noticeability cheap win. |
| Add text | An explicit action for a connector with no label — FigJam keeps connector labels fixed and offers this instead (contextualControlRegistry.ts:288, CONNECTOR_CONTEXTUAL_RECIPE :378) | Absent | A port (small): a trigger plus `startEditingShapeWithRichText` on the resolved target. |
| Typeface | 4 named options — Simple · Bookish · Technical · Scribbled (contextualControlRegistry.ts:166-171, :256) | Present — face is the literal "Aa", options are tldraw's raw enum values (arrangeActions.ts:241) | Parity in kind. The donor's readable labels are a one-line `valueLabels` map. |
| Font size | s/m/l/xl PLUS a Custom px cell, bounded by the target's own size model, with `rungPx` so "Extra large" never prints the same words at two different pixel sizes (contextualControlRegistry.ts:78-113, appearance/customFontSize.ts, 234 lines) | s/m/l/xl only, relabelled Small/Medium/Large/X-Large (arrangeActions.ts:230, :240) | A port: 234 lines plus the `ContextualCustomSize` binding contract. |
| Text alignment (horizontal) | Left · Center · Right (contextualControlRegistry.ts:173-177, :257) | Present — tldraw's `DefaultHorizontalAlignStyle` behind an align glyph (arrangeActions.ts:242) | Parity. |
| Vertical alignment | Top · Middle · Bottom (contextualControlRegistry.ts:258-261, in the V3 text group) | Absent | One-line prop: one entry in STYLE_ROWS (arrangeActions.ts:234-243) over `DefaultVerticalAlignStyle`. Cheapest gap on the list. |
| Bold | A toggle on the Block-title editing surface (contextualControlRegistry.ts:287, BLOCK_TITLE_CONTEXTUAL_RECIPE :389-397) | Absent — no text-editing pill at all | Real unbuilt work: needs the editing-title surface first. FigJam has Bold, Strikethrough, Link and Bulleted list here; its widest measured state (603px) is exactly this one. |
| Code language | A list control riding directly after appearance — NOT its own surface, so a Code block gets exactly one pill (contextualControlRegistry.ts:249, surfaceRegistry :22-30) | Present — a DropdownMenu with 4 languages, single `ss-code` only (floatingToolbar.tsx:280-291) | Parity. |
| Code line numbers + character width | A line-numbers toggle and a character-width control with a custom cell (code/CodeSelectionControls.tsx, 266 lines) | Absent — language only | A port (266 lines). |
| Opacity | Inline slider; marks a history stopping point ONCE per drag gesture via a ref, so the whole drag is one undo (SystemSketchChrome.tsx:480-509) | Inline slider + a "100%" readout (selectionClusters.tsx OpacityCluster). Mixed selections read 100 rather than "mixed". | Parity in the control. MISSING the once-per-gesture history mark — today every slider tick is its own undo step. One small fix, copy the `draggingRef` pattern. |
| Arrange | 12 actions behind one trigger: 4 z-order, 3+3 align, 2 distribute; thresholds 1 / ≥2 / ≥3 (SystemSketchChrome.tsx:343-369, :422-425; ArrangeControls.tsx) | Same 12 behind one AlignStartVertical trigger, same thresholds — ported by value and the provenance is written into the file header (arrangeActions.ts:14-17, arrangeGroupsFor) | Full parity. Note FigJam has only "Alignment" here, no z-order — bbox-ui and the donor both deliberately exceed FigJam. |
| Wrap | A trigger + popover with 4 targets: Frame · Block · Branch region · Group. Frame and Group dispatch stock tldraw actions; Block and Branch compute insets and reparent keeping page positions (frames/WrapSelectionControl.tsx 99 lines, frames/wrapSelection.ts 196 lines). Gate: ≥2 wrappable shapes, connections excluded. | Absent | A PORT, ~half a day. 2 of 4 targets are 2-line stock dispatches (`frame-selection`, `group`); the other 2 are ~150 lines of bounds math + reparent against ss-block(expanded) and ss-region. bbox-ui already has the exact popover pattern (selectionClusters.tsx StyleRowControl). |
| Tidy edges / Reset routing / Organize nodes | 3 one-shot layout buttons, each gated on real availability — Reset only when an edge actually carries a custom route (SelectionLayoutActions.tsx:21-30; tidyEdges.ts 344 lines; resetEdges.ts 75; layoutBlock.ts 1,674) | Absent | REAL UNBUILT WORK, blocked on a schema change not a UI port: `ss-wire` has no persisted route — wireGeometry.ts recomputes the polyline every frame from `traceGeometry`. There is nothing to tidy and nothing to reset until a custom-route prop and a drag affordance exist. Do not ship a disabled button. |
| Propagation focus | Upstream/downstream step sliders with reachable maxima and a Clear button; when active it REPLACES the entire pill (propagation/PropagationFocusControls.tsx 169 lines, SystemSketchChrome.tsx:623-632) | Absent | Real unbuilt work: needs a dataflow reachability model over the wire graph. |
| Block-title formatting pill (editing state) | A distinct surface — Typeface · Font size · Bold · Colour · Align — mounted while a Block title is live (SystemSketchChrome.tsx:704+, BLOCK_TITLE_CONTEXTUAL_RECIPE) | Absent — and worse, the ordinary shape pill stays up while editing | Real unbuilt work. Ship the editing GATE first (one line) and accept no pill while typing; the formatter is a later round. |
| Interface-scale re-measure | The pill re-measures and re-places when interface scale changes (SelectionContextualMenu.tsx:117-120) | Absent — size is measured by ResizeObserver only (floatingToolbar.tsx:133-147) | Depends on bbox-ui shipping an interface-scale setting at all (open task #9/#10). One `useEffect` once it does. |
| Duplicate | NOT in the pill | Present (floatingToolbar.tsx:305-313) | Remove, with Delete. Non-destructive, so taste rather than rule — but absent from both FigJam and the donor. |
| Delete | NOT in the pill — `grep -rn "selection-delete\|pill-delete" /home/bam/systemsketch/src` is empty, and no `deleteShapes` in SystemSketchChrome.tsx or SelectionContextualMenu.tsx | Present (floatingToolbar.tsx:314-324) | REMOVE. FigJam: "Destructive actions — never in the pill" (build_figjam_contextual_menu_spec.py:66). Three call sites move together: floatingToolbar.tsx:314-324, selectionActions.ts:89-93, menus.smoke.test.tsx:150-165 — plus the frozen test-id line in all seven docs/lanes/ss-L*.md briefs. |
| Focus (zoom to selection) | NOT in the pill (no `zoomToSelection` anywhere in the donor's chrome) | Present (selectionClusters.tsx FocusButton, floatingToolbar.tsx:304) | Keep provisionally — non-destructive and cheap, though it duplicates tldraw's own zoom-to-selection action. Drop only if pill width becomes binding. |

## Risks

- The FigJam spec row `("Destructive actions", …, "SystemSketch puts <em>Delete</em> in the pill", "differs", …)` at /home/bam/systemsketch/docs/build_figjam_contextual_menu_spec.py:66 is dated 2026-09-01 and describes the donor AS IT WAS. The donor has since removed Delete — grep proves it. Reading that row as current inverts the ruling and keeps the button. Verify against src/, never against the spec page.
- Removing the Delete button without rewriting apps/systemsketch/src/menus.smoke.test.tsx:150-165 destroys the only assertion in the suite that the pill hides on an empty selection (`:164`). That test carries TWO claims and only one is about Delete. Re-point it at the right-click menu; do not delete it.
- The frozen test-id contract naming `ss-selection-delete` is repeated verbatim in all seven lane briefs (docs/lanes/ss-L0.md:186, ss-L1.md:147, ss-L2.md:147, ss-L3.md:156, ss-L4.md:41 and :149, ss-L5.md:149, ss-L6.md:131). Change the pill and leave those, and a future lane rebuilds the button straight from its brief.
- Width, not control count, is the ceiling. FigJam's widest measured state is 603px at 10 controls (build_figjam_contextual_menu_spec.py:45-53) and bbox-ui already renders 11. Every row added to STYLE_ROWS (arrangeActions.ts:234-243) is one line of code and real pill width. The donor's answer was one-family-one-trigger — collapse behind a face, never spill into the row (selectionClusters.tsx:22-28). Adding arrowheads, geo and vertical-align as three more inline faces would undo the very thing that makes it read as SystemSketch.
- Swapping in FigJam's 21-colour palette must go through `<Tldraw themes={…}>` and must SPREAD DEFAULT_THEME. `registerColorsFromThemes` REMOVES any registered colour absent from every theme, so a palette of only FigJam's names unregisters tldraw's `grey` and every board that ever stored a grey shape fails validation on load (appearance/figjamPalette.ts:11-17). Also: swatchColorFor reads the theme at call time and returns null rather than guessing when a value is absent — preserve that, a wrong swatch is worse than an honest label.
- Wrap's Block and Branch targets reparent children while KEEPING their page positions — the container is drawn around where the shapes already are (wrapSelection.ts:99-103). A port that moves the children instead looks correct on an empty board and wrong on a real one. The acceptance must measure page positions before and after, not assert the container's presence.
- Tidy is not a UI gap and must not be scheduled as one. `ss-wire` recomputes its polyline every frame from traceGeometry (shapes/wire/wireGeometry.ts) — there is no persisted route, so `connectionHasCustomRoute`'s equivalent cannot exist and Reset-to-automatic has nothing to reset. Shipping Tidy requires a schema change to ss-wire first. A greyed-out Tidy button is worse than no button: it advertises a capability that is a round away.
- The editing gate is one line and is a real improvement — but shipping it ALONE means bbox-ui has no pill at all while the user types, where FigJam's widest and richest state (603px: Shape, colour, line style, typeface, font size, Bold, Strikethrough, Link, Bulleted list, Text alignment) lives. The donor replaces the pill rather than removing it. Taking the gate without the formatter trades one wrong behaviour for a different wrong behaviour; decide that deliberately and say so in the handoff, do not let it land as an unremarked side effect.
- bbox-ui's opacity slider writes on every tick with no history stopping point, so a single drag becomes N undo steps. The donor solved this with a `draggingRef` that marks ONCE at drag start and not again until the next gesture (SystemSketchChrome.tsx:484-509). It is a small fix, but it is invisible in any DOM-presence test and will only ever be found by pressing Ctrl+Z after a drag.


---

# spec:pill-geometry

> **Verdict up front.** Report B is right about the primary family; Report A cited a real block but the wrong one. `systemsketch-chrome.css:906-977` spans **two** things: the pill **bar** (906-935) and the **arrange/layout icon-button** family (944-977). Report A read the second and called it "the pill's own CSS box." That 33×32 / radius-7 / 18px-stroked-icon family is **SystemSketch's own invention** — it has no FigJam counterpart and it is the one family a re-implementation should *not* copy. Every real FigJam cell is **40px tall with a 5px radius**, measured over CDP.

---

## 0. The ground truth, and why it settles everything

`/home/bam/systemsketch/docs/assets/figjam-chrome-traced.json` is a **live `getComputedStyle` + `getBoundingClientRect` dump of FigJam's own DOM**, captured 2026-09-01 by `tools/figjam/chrome_trace.py` (`capturedFrom` field). It is not a screenshot reading. Every number below marked **[traced]** came out of that file; `src/appearance/figjamTokens.ts` is the hand-transcription of it and agrees with it everywhere I checked.

Text-selection pill, as traced:

```
<div role=toolbar "Selection Properties Menu">  603x40  r=13px  bg=rgb(30,30,30)  pad=0px 4px
   shadow = rgba(0,0,0,.12) 0 0 .5px, rgba(0,0,0,.12) 0 10px 16px, rgba(0,0,0,.15) 0 2px 5px
   border = 0px none            font = 11px / 400 Inter
  button "Shape, square"                 56x40 @x=4    r=5px pad=0 4px
  div  (divider)                          1x40 @x=64   bg=rgb(56,56,56)
  button "Change color"                  54x40 @x=69   r=5px pad=0 4px
  button "Line style"                    56x40 @x=123  r=5px pad=0 4px
  button "Typeface, simple"              56x40 @x=188  r=5px pad=0 4px
  button "Font size, small" role=combobox 144x40 @x=253 r=5px pad=0 4px
  button "Bold"                          32x40 @x=406  r=5px pad=0 4px
  button "Strikethrough"                 32x40 @x=438  r=5px pad=0 4px
  button "Create link"                   32x40 @x=470  r=5px pad=0 4px
  button "Bulleted list"                 32x40 @x=502  r=5px pad=0 4px
  button "Text alignment, …center"       56x40 @x=543  r=5px pad=0 4px
```

Connector pill: identical shell (`336x40 r=13px bg=rgb(30,30,30) pad=0 4px`), buttons `54x40`, `56x40`, `32x40`, all `r=5px`.

**There is no 33×32 cell anywhere in FigJam.** There is no radius other than 5px on any cell and 13px on any surface.

---

## 1. The distinct cell families

### FigJam has exactly three (plus one popover cell)

| # | Family | Box | Inner content | Radius | Padding | Which controls |
|---|---|---|---|---|---|---|
| **F1** | **Trigger with value** | **56 × 40** | 24×24 glyph butted against a 16×16 chevron, inside a 48×24 span | **5px** | 4px on the button + 4px on the inner span = **8px effective each side** | Shape, Line style, Typeface, Text alignment, Start point, End point, Line shape |
| **F1c** | **Colour trigger** (F1 variant) | **54 × 40** | 18px disc inside a 22×22 ring box, + 16×16 chevron | 5px | same 8px | Change color |
| **F1t** | **Text-value combobox** (F1 variant) | **144 × 40** | label 11px/400 Inter left-aligned, 16×16 chevron right | 5px | 0 8px 0 12px | Font size ("Small") |
| **F2** | **Plain icon button** | **32 × 40** | one 24×24 glyph in a 24×24 span, **no chevron** | **5px** | 0 4px | Bold, Strikethrough, Create link, Bulleted list, Add text |
| **F3** | **Popover option cell** | **24 × 24** | 24×24 glyph | **5px** (`CELL_RADIUS`) | 0, on a 32px pitch (`gap: 8px`) | every icon row inside a popover |

Separator: `1 × 40`, `rgb(56,56,56)`, **4px clear each side** — traced (`…ends x=60, divider x=64, next button x=69`).

### SystemSketch's re-implementation has five, two of which are its own

| # | SystemSketch class | Box | Icon | Radius (unskinned) | Padding | Used by | FigJam basis |
|---|---|---|---|---|---|---|---|
| **A** | `.systemsketch-appearance__trigger` — `appearance.css:29-41` | h **40**, width intrinsic → 56 (54 colour) | 24×24 `__glyph` (`:461`, `stroke-width:1.5`, `[data-filled]` → filled) + 16×16 `__chevron` (`:133`) | `var(--systemsketch-pill-trigger-radius, **5px**)` | `var(--systemsketch-pill-trigger-pad, 0 8px)` | colour / fill / stroke / dash / shape / align triggers | **F1 — exact** |
| **A-t** | `.systemsketch-appearance__trigger[data-trigger='text']` — `appearance.css:44-48` | **144 × 40** | label 11px/400 + chevron, `space-between` | 5px | `0 8px 0 12px` | Font size | **F1t — exact** |
| **A-g** | `.systemsketch-appearance__option` — `appearance.css:164-180` | **24 × 24** | 24×24 glyph | 5px | 0, `gap:8px` | popover icon cells | **F3 — exact** |
| **D** | `.systemsketch-appearance__toggle` — `appearance.css:95-100` | **40 × 40** (`flex:0 0 40`) | 20px text glyph | 5px | 0 8px | italic/bold-style toggles | **F2, but 8px too wide** (FigJam is 32×40) |
| **B** | `.systemsketch-selection-layout-action` (`chrome.css:944-957`) **and** `.systemsketch-arrange__button` (`chrome.css:1036-1048`) | **33 × 32**, `display:grid; place-items:center` | **18×18**, `fill:none; stroke:currentColor; stroke-width:1.45`, source viewBox `0 0 20 20` | `var(--systemsketch-pill-trigger-radius, **7px**)` | `0` | Tidy edges, Reset routing, Organize nodes; every z-order / align / distribute button | **NONE. Invented.** |
| **C** | `.systemsketch-arrange__trigger` — `chrome.css:1098-1109` | h **32**, width = 6+18+2+16+4 = **46** | 18×18 icon + 16×16 chevron, `gap:2px` | `…, **7px**` | `0 4px 0 6px` | the single Arrange trigger | **NONE.** A shrunken F1 |

Families **B** and **C** are the "feels like tldraw stock" tell: 32px tall inside a 40px bar (so they do not fill the height the way every FigJam cell does), stroked 18px icons at 1.45 instead of filled 24px paths, and a radius nothing measured.

---

## 2. Which family to copy

- **Plain icon button** (Duplicate, Delete, Bold, Link) → **F2: 32 × 40, radius 5px, one 24×24 filled glyph, 0 4px padding.** Not 33×32. Not 28 or 36 tall. The cell fills the bar's full 40px height; the bar's own `padding: 0 4px` is the only inset.
- **Trigger with a value** ("Small", "Aa", a colour swatch) → **F1: 56 × 40, radius 5px, 24×24 glyph immediately followed by a 16×16 chevron with zero gap between them, 8px clear each side.**
  - colour → **54 × 40**: an 18px disc centred in a 22×22 box, then the chevron.
  - a named text value → **144 × 40**, `justify-content: space-between`, label 11px/400 Inter, padding `0 8px 0 12px`.
- The chevron is **one shared 16×16 filled path on every trigger** — `CHEVRON_PATH` / `CHEVRON_VIEWBOX` in `figjamTokens.ts:81-84`. Do not vary it per control.

---

## 3. Radius 5 vs 7 — settled

**5 is correct. 7 is legacy and carries no measurement.**

1. **Every FigJam cell traces at `r='5px'`** — all 15 buttons across both pills in `figjam-chrome-traced.json`. Nothing traces at 7.
2. `figjamTokens.ts:30` — `export const TRIGGER_RADIUS = 5` with the comment "Triggers are square-ish, full height, and only lightly rounded." `:63` — `CELL_RADIUS = 5`. **There is no `7` anywhere in `figjamTokens.ts`.**
3. The 7 is a fallback on a **variable, not a value**. Both numbers are fallbacks of the *same* custom property:
   - `appearance.css:37, 173` → `var(--systemsketch-pill-trigger-radius, 5px)`
   - `systemsketch-chrome.css:951, 1044, 1104` → `var(--systemsketch-pill-trigger-radius, 7px)`
   - The property is **declared nowhere except `pillSkins.css`** (5 skins, values 3/12/0/8/4px). Verified: `grep '^\s*--systemsketch-pill' src/ --include=*.css` returns only `pillSkins.css`.
4. `App.tsx:220` only stamps `data-ss-pill-skin` when the **pill lab's compare mode** is on and the skin is not `'default'`. So the shipping default has **no skin**, both fallbacks are live, and the app really does paint 5px on appearance triggers and 7px on arrange buttons simultaneously.
5. Provenance: `git log -S "border-radius: 7px" -- src/chrome/systemsketch-chrome.css` → earliest `c5502b6d 2026-09-01 "Land everything built on top of stock tldraw since Aug 30"`, then `e79ab7a2 2026-09-02 "Add contextual layout controls"`. The FigJam trace landed the same day in a *different* commit (`559c095a`/`2579140e`, 2026-09-01, "Copy FigJam's chrome from its DOM"). The 7 is pre-FigJam SystemSketch chrome that was never revisited.

**So: the donor itself treats trigger radius as ONE token.** Report B's "5 and 7 coexist unreconciled" is right as an observation of the source and wrong as a design conclusion — a re-implementation ships one value, and that value is **5**.

---

## 4. The pill surface

**Yes. The donor pill is dark with light ink, always — and the reason recorded in the source is literally Zach's bug.**

`src/theme/tokens.css:109-128`:

```css
[data-ss-theme='systemsketch'] .tl-container {
  /* The one value not taken from tldraw. The selection pill is FigJam's,
   * measured at rgb(30,30,30) …, and FigJam, Obsidian and VS Code all keep
   * that pill dark in a dark theme too; only tldraw's tooltip flips to white,
   * and following it would put the appearance controls' white glyphs on a
   * white bar. */
  --ss-surface-inverse: #1e1e1e;   /* :120 */
  --ss-text-inverse: #ffffff;      /* :128 */
}
```

| Property | Value | Light theme | Dark theme | Source |
|---|---|---|---|---|
| background | `#1e1e1e` = `rgb(30,30,30)` | same | **same — pinned** | `tokens.css:120`; **[traced]** `bg=rgb(30,30,30)` |
| ink | `#ffffff` | same | **same — pinned** | `tokens.css:128`; **[traced]** span `color=rgb(255,255,255)` |
| radius | **13px** | same | same | `chrome.css:922`; **[traced]** `r=13px` |
| padding | **0 4px** | same | same | `chrome.css:920`; **[traced]** `pad=0px 4px` |
| min-height | **40px** | same | same | `chrome.css:909` (`--systemsketch-selection-menu-height`, `:826`); **[traced]** `h=40` |
| border | **none** | — | — | **[traced]** `border=0px none` |
| shadow | `0 0 .5px rgb(0 0 0/12%), 0 10px 16px rgb(0 0 0/12%), 0 2px 5px rgb(0 0 0/15%)` | same | same | `figjamTokens.ts:141-145`; **[traced]** identical |
| divider | 1px × full 40px, 4px clear each side | `#383838` **[traced `rgb(56,56,56)`]** | same | `appearance.css:82-88` |
| font | **11px / 400 Inter** | same | same | **[traced]** `font=11px / 400 Inter` |
| hover | `#383838` | same | same | `appearance.css:92` |
| selected, icon cell | `#8a38f5` | same | same | `figjamTokens.ts:24` |
| selected, labelled chip | `#9747ff` | same | same | `figjamTokens.ts:17` |

**The one deliberate exception**, and it is not an accident: under the **VS Code host theme** (`tokens.css:148-168`) the pill maps to `--vscode-editorHoverWidget-background/-foreground`, so inside a *light* VS Code colour theme it follows the host and goes light. Obsidian (`:181-201`) maps to `--background-modifier-message` (`rgb(0 0 0 / 90%)`) and stays dark. The web/standalone app is hard-pinned dark.

**One trap to know about:** `tokens.css:323-333`, the zero-specificity root fallback under `@media (prefers-color-scheme: dark)` with `data-ss-color-scheme='system'`, *does* flip `--ss-surface-inverse` to `hsl(0 0% 100%)` and `--ss-text-inverse` to `hsl(210 13% 18%)` — it is a verbatim copy of tldraw's dark palette. It never reaches the pill (the pill lives under `.tl-container`, where the theme block at `:109` wins on both specificity and proximity), but **anyone porting tokens by copying that block will import exactly the light-pill bug.** That is almost certainly how bbox-ui got there.

---

## 5. Does the donor force the open popover onto the pill's surface? Yes — by construction, not by inheritance

**The rule:** *every* popover the pill opens renders the single class **`.systemsketch-appearance__panel`**, and that class re-declares the pill's four surface tokens.

```css
/* appearance.css:143-155 */
.systemsketch-appearance__panel {
  padding: 8px;
  border-radius: var(--systemsketch-pill-radius, 13px);
  color:      var(--systemsketch-pill-ink,     #fff);
  background: var(--systemsketch-pill-surface, #1e1e1e);
  box-shadow: var(--systemsketch-pill-shadow,  0 0 .5px rgb(0 0 0/12%),
                                               0 10px 16px rgb(0 0 0/12%),
                                               0 2px 5px rgb(0 0 0/15%));
}
```

vs. the bar, `systemsketch-chrome.css:920-924`, which reads the *same four names*. Callers:
- `contextualMenus/ContextualControls.tsx:278` — every appearance popover (colour, fill, dash, shape, typeface, font size, alignment).
- `chrome/SystemSketchChrome.tsx:456` — the Arrange popover, which is not an appearance control at all and still wears the class.

**It cannot be inheritance**, and the source says so: the popover portals out of the pill's DOM subtree entirely via tldraw's `useContainer()`. That is exactly why `pillSkins.css:15-23` scopes every `--systemsketch-pill-*` on **`.systemsketch-app`, the app root — "the nearest ancestor both the bar and its portaled popovers share."** The surface travels through a shared *ancestor variable scope*, not through the tree between bar and panel.

FigJam does the same thing, traced: `fontSize` popover `130.3×207 r=13px bg=rgb(30,30,30) pad=8px 0px`; `typeface` `119×113 r=13px bg=rgb(30,30,30)`; `alignment` `104×40 r=13px bg=rgb(30,30,30) pad=8px`; connector `lineStyle` `145×44 r=13px bg=rgb(30,30,30)`; the colour picker `184×310 r=13px bg=rgb(30,30,30)`. **Same surface, same radius, same three-layer shadow, every one.** The alignment popover's bottom edge sits at y=249 and the pill's top at y=257 → **8px gap**, confirming `POPOVER_GAP = 8` (`figjamTokens.ts:44`).

**Flagged, not settled:** the donor does **not** reset tldraw's wrapper. `node_modules/tldraw/tldraw.css:2377-2391` gives `.tlui-popover__content` its own `background-color: var(--tl-color-panel)`, `border-radius: var(--tl-radius-3)` (**9px**) and `overflow: hidden`. The 13px panel is painted inside a 9px-clipped light-panel box, so the *effective* outer radius of a donor popover is 9px, not 13px, and geometry says a thin light sliver is possible at the four corners in a light theme. I did not run the app (read-only task), so I cannot say whether that sliver is visible. **If you re-implement, reset the wrapper explicitly rather than relying on the panel covering it.**

---

## 6. What bbox-ui does today, and the exact seam

- **Pill:** `apps/storybook-basics/src/components/floatingToolbar.tsx:149` — `"… rounded-xl bg-foreground px-1 text-background shadow-lg … min-h-10 …"`.
- **Root cause of the light pill:** `apps/storybook-basics/src/globals.css:101-102`, inside `@media (prefers-color-scheme: dark)`, sets `--background: oklch(0.145 0 0)` and `--foreground: oklch(0.985 0 0)`. `oklch(0.985 0 0)` **is `#fafafa`**. So `bg-foreground` = #fafafa and `text-background` = #252525 → **light pill, dark icons, on a dark canvas.** The pill is not themed; it is `invert(page)`, and inverting a dark page gives a light pill. `apps/systemsketch/src/chrome/floatingToolbar.tsx:246-251` already documents the downstream symptom ("This pill is `bg-foreground text-background` — a dark bar") — the comment is true in light mode and false in dark, which is why the ToggleGroup fix there did not generalise.
- **Root cause of the mismatched panel:** `apps/storybook-basics/src/components/dropdown-menu.tsx:78` — `"… bg-popover text-popover-foreground … p-1 shadow-md ring-1 ring-foreground/10"` with `rounded-lg` at `:178`. `--popover` is an **independent token** (`globals.css:105` = `oklch(0.205 0 0)` ≈ `#343434` in dark). The panel has no relationship to the pill's surface at all. There is no `--bbox-pill-surface` equivalent, so there is nothing for a panel to opt into.
- **Buttons:** `components/toolbar.tsx:89-92` — `rounded-lg` (10px), `h-7`/`h-8`/`h-9` = 28/32/36px, `px-2`/`px-2.5`, `[&_svg…]:size-4` (**16px**), `gap-1.5`; `Toolbar` root `gap-1` (4px) at `:38, :50`.

**The fix is one token pair, not a restyle.** Introduce a pill-scoped surface — `--bbox-pill-surface: #1e1e1e` / `--bbox-pill-ink: #fff`, declared on the app root (not on the pill, so portalled popovers can read it), pinned in both colour schemes — have the pill and *every* menu the pill opens read that pair instead of `foreground`/`background` and `popover`/`popover-foreground`, and the mismatch and the polarity flip both disappear in one edit.

---

## 7. Copy-in values — the authoritative sheet

```
PILL BAR
  min-height        40px          [traced h=40]
  radius            13px          [traced r=13px]   figjamTokens.ts:28
  padding           0 4px         [traced]
  background        #1e1e1e       [traced rgb(30,30,30)]   figjamTokens.ts:13
  ink               #ffffff       [traced]
  border            none          [traced 0px none]
  shadow            0 0 .5px rgb(0 0 0/12%), 0 10px 16px rgb(0 0 0/12%), 0 2px 5px rgb(0 0 0/15%)
  font              11px / 400 Inter                  [traced]
  polarity          DARK IN BOTH THEMES — pinned      tokens.css:120,128
  overflow          flex-wrap: wrap  — never overflow-x:auto  chrome.css:908, and see Risks

CELL — plain icon button          [FigJam "Bold"]
  box               32 x 40       radius 5px      padding 0 4px
  glyph             24 x 24, filled path on a 0 0 24 24 viewBox, currentColor
  ink               #ffffff       hover bg #383838

CELL — trigger with value         [FigJam "Shape, square"]
  box               56 x 40       radius 5px      8px clear each side
  content           24x24 glyph, zero gap, 16x16 filled chevron (CHEVRON_PATH)

CELL — colour trigger
  box               54 x 40       radius 5px
  content           18px disc centred in a 22x22 box, then the 16x16 chevron

CELL — text-value combobox        [FigJam "Font size, small"]
  box               144 x 40      radius 5px      padding 0 8px 0 12px
  content           label 11px/400, justify-content: space-between, 16x16 chevron

CELL — popover option
  box               24 x 24       radius 5px      32px pitch (gap 8px)

SEPARATOR           1px x 40px    #383838         4px clear each side   [traced]

POPOVER
  radius            13px          background #1e1e1e      ink #ffffff
  padding           8px  (8px 0 for list layouts)
  shadow            identical to the bar's
  gap above pill    8px           [traced: 249 -> 257]
  collision pad     12px          (NOT FigJam — figjamTokens.ts:46-52 says so)
  RULE              ONE class for every popover; surface tokens on the APP ROOT,
                    because the popover portals out of the pill's subtree

SELECTED STATES
  icon-only cell    #8a38f5   (ACCENT_RADIO)      figjamTokens.ts:24
  labelled chip     #9747ff   (ACCENT)            figjamTokens.ts:17
  list row          check mark only, NO fill, ink returns to the panel ink
                                                   appearance.css:318-328
  swatch            0 0 0 2px <surface>, 0 0 0 4px #8a38f5
```

---

## 8. What I could not settle

1. **Whether the donor's popover shows a light corner sliver** where tldraw's 9px `overflow:hidden` clip meets the panel's 13px radius. Geometrically it must exist; whether it is perceptible needs the app run, which this task forbade.
2. **Family D's 40px width** (`.systemsketch-appearance__toggle`, `appearance.css:95`) vs FigJam's 32px for the same kind of control. No comment or commit explains the 8px. Treat 32 as correct and the 40 as drift, but I have no positive evidence the 40 was not deliberate.
3. **The divider/hover colour split.** `appearance.css:87, 92` fall back to the exact traced `#383838`; `chrome.css:940, 960, 1050, 1080` fall back to `--ss-border-inverse` / `--ss-surface-inverse-hover`, which are `color-mix(white 18%/14%, transparent)` — on `#1e1e1e` those composite to roughly `#414141` / `#3b3b3b`, **not** `#383838`. Same drift pattern as the radius, and I found no record of which was intended. **Ship `#383838`; it is the measured one.**
4. **Whether the 33×32 family should keep existing at all** in its own right (its controls — Tidy edges, Reset routing, Organize nodes — have no FigJam analogue, so there is no measurement to conform them to). My recommendation is to re-cut them as F2 (32×40, radius 5, 24px filled glyph) so the bar reads as one family, but that is a taste call, not a finding.


## Report rows

| Feature | SystemSketch / FigJam | bbox-ui today | Change needed |
|---|---|---|---|
| Pill surface polarity | #1e1e1e / rgb(30,30,30) with #ffffff ink, HARD-PINNED in both light and dark. tokens.css:120,128, inside [data-ss-theme='systemsketch'] .tl-container, with a comment naming the exact failure it prevents: following tldraw's tooltip flip "would put the appearance controls' white glyphs on a white bar". Traced: bg=rgb(30,30,30), span color=rgb(255,255,255). | `bg-foreground text-background` (floatingToolbar.tsx:149). Not a pill colour — an inversion of the page. globals.css:102, under @media (prefers-color-scheme: dark), sets --foreground: oklch(0.985 0 0) = #fafafa, so on a dark canvas the pill is #fafafa with #252525 icons. | Add an app-root-scoped `--bbox-pill-surface: #1e1e1e` / `--bbox-pill-ink: #fff`, declared identically in both colour schemes, and have the pill read that pair instead of foreground/background. Do NOT copy tokens.css:323-333 — that zero-specificity fallback block flips the inverse surface white and is the same bug in the donor's own tree. |
| Open dropdown / popover surface | Forced to share the pill's surface. EVERY pill popover renders one class, `.systemsketch-appearance__panel` (ContextualControls.tsx:278 for appearance, SystemSketchChrome.tsx:456 for Arrange), which re-declares the same four tokens as the bar: radius 13px, background #1e1e1e, ink #fff, the pill's three-layer shadow (appearance.css:143-155). Not inheritance — the popover portals out of the pill's subtree, so pillSkins.css:15-23 scopes the tokens on `.systemsketch-app`, "the nearest ancestor both the bar and its portaled popovers share". FigJam agrees: every traced popover is r=13px bg=rgb(30,30,30). | Independent surface. dropdown-menu.tsx:78 is `bg-popover text-popover-foreground … rounded-lg p-1 shadow-md ring-1 ring-foreground/10`; --popover is its own token (globals.css:105 = oklch(0.205 0 0) ≈ #343434 in dark). Nothing connects it to the pill, which is why the screenshot shows a light pill with a dark panel under it. | Make the pill's menus read `--bbox-pill-surface` / `--bbox-pill-ink` instead of popover/popover-foreground, radius 13px, padding 8px, same shadow. Declare the tokens on the app root, not on the pill, because the menu portals out. Also reset the portal wrapper's own background explicitly rather than relying on the panel to cover it. |
| Plain icon button (Duplicate, Delete) | FigJam F2: 32 x 40, radius 5px, padding 0 4px, ONE 24x24 filled glyph, no chevron. Traced on Bold/Strikethrough/Create link/Bulleted list/Add text. The cell fills the bar's full 40px height. | ToolbarButton (toolbar.tsx:89-92): h-7/h-8/h-9 = 28/32/36px tall, px-2 or px-2.5, rounded-lg = 10px, icons `size-4` = 16px, gap-1.5. Used at floatingToolbar.tsx:293,302. A 28-32px cell floating inside a 40px bar. | 32 x 40, radius 5px, padding 0 4px, 24px glyph. Three numbers change: height 28→40, radius 10→5, icon 16→24. The icon size is the biggest visual tell — 16px lucide strokes inside a 40px bar is the tldraw-stock look. |
| Trigger with a value ("Small", "Aa", colour swatch) | FigJam F1: 56 x 40, radius 5px, 8px clear each side (4px on the button + 4px on the inner span). Content is a 24x24 glyph butted with ZERO gap against a 16x16 filled chevron — one shared path, CHEVRON_PATH/CHEVRON_VIEWBOX, figjamTokens.ts:81-84. Colour variant is 54 x 40 (18px disc in a 22x22 ring box). Text variant is 144 x 40, justify-content: space-between, label 11px/400 Inter, padding 0 8px 0 12px. | No F1 equivalent. The one trigger that exists (language dropdown, floatingToolbar.tsx:263) is a `Button variant=ghost size=sm` — h-7 = 28px, rounded-lg, text only, no chevron, no glyph. | Build the F1 family: 56x40 icon+chevron, 54x40 for colour, 144x40 for a named text value. One chevron component at 16x16, filled, reused on every trigger — do not let each control draw its own. |
| Trigger radius | 5px. Every one of the 15 traced FigJam buttons across both pills is r='5px'; figjamTokens.ts:30 TRIGGER_RADIUS = 5 and :63 CELL_RADIUS = 5. The 7px in chrome.css:951,1044,1104 is the FALLBACK of the same variable the 5px is a fallback of (--systemsketch-pill-trigger-radius, declared only in pillSkins.css), sitting on the invented 33x32 family, first committed in c5502b6d (2026-09-01) as pre-FigJam chrome. No measurement anywhere yields 7. | rounded-lg = --radius-lg = 0.625rem = 10px on every toolbar button (toolbar.tsx:89). Pill is rounded-xl = calc(0.625rem + 4px) = 14px (globals.css:49,75). | Cell radius 10 → 5. Pill radius 14 → 13. Ship ONE trigger-radius token; the donor's 5/7 split is drift, not two families, and it collapses to one value the moment any skin is applied. |
| Bar geometry | min-height 40px (chrome.css:909), radius 13px, padding 0 4px, no border, shadow 0 0 .5px rgb(0 0 0/12%), 0 10px 16px rgb(0 0 0/12%), 0 2px 5px rgb(0 0 0/15%). Font 11px / 400 Inter. All traced. | min-h-10 = 40px ✓, px-1 = 4px ✓, rounded-xl = 14px, shadow-lg (Tailwind default, a 2-layer black/10 + black/10). floatingToolbar.tsx:149. | Height and horizontal padding already match. Change radius 14 → 13 and replace shadow-lg with FigJam's literal three-layer value — the 10px-offset middle layer is what gives the donor pill its float. |
| Icon drawing style | FigJam draws control icons as FILLED paths on a 0 0 24 24 viewBox, not stroked outlines — figjamTokens.ts:54-56, and appearance.css:474 `[data-filled] { fill: currentcolor; stroke: none }`. Stroke only where a glyph genuinely is a line (stroke-width 1.5, appearance.css:461-471). | lucide-react icons at size-4 = 16px, stroked, default lucide stroke-width 2 (floatingToolbar.tsx Copy/Trash2). | 24px, and prefer filled over stroked for control glyphs. If stroked icons stay, they still go at 24px, not 16px. Note the donor's OWN invented family (chrome.css:968-977: 18x18, stroke-width 1.45, viewBox 0 0 20 20) is the wrong model here — it is the family that has no FigJam basis. |
| Separator between groups | 1px x 40px (full bar height), #383838 = traced rgb(56,56,56), 4px clear each side — traced from positions: trigger ends x=60, divider x=64, next button x=69. figjamTokens.ts:41-42 SEPARATOR_MARGIN = 4; appearance.css:82-88. | ToolbarSeparator from the kit; Toolbar root spaces children with gap-1 = 4px (toolbar.tsx:38,50). | 4px gap already matches. Make the rule the bar's FULL height (40px, not inset) and colour it #383838 — a half-height divider reads as a generic toolbar. |
| Hover / pressed feedback | Pill-relative, always. Hover = #383838 (appearance.css:92); a skinned pill substitutes --systemsketch-pill-hover, and appearance.css:185 uses color-mix on the pill's OWN ink so a light skin still shows feedback. Selected icon cell #8a38f5, selected labelled chip #9747ff; appearance.css:189-206 carries a long WHY about --systemsketch-pill-accent-ink existing precisely because content on the accent does not sit on the pill surface. | Page-relative. toolbar.tsx:89 bakes in `hover:bg-muted hover:text-foreground` and `aria-pressed:bg-primary aria-pressed:text-primary-foreground` — all page tokens. On a `text-background` pill, hover:text-foreground sets the ink to the pill's own background colour. floatingToolbar.tsx:293,302 pass only `text-background`, so Duplicate and Delete inherit it; :263 explicitly re-adds `hover:text-foreground`. | Derive hover and pressed from the pill tokens, not the page: hover `color-mix(in srgb, var(--bbox-pill-ink) 14%, transparent)` (or the literal #383838), pressed on an accent with its own on-accent ink token. As shipped, the Duplicate and Delete icons go to the pill's background colour on hover — verify against the running app before treating that as cosmetic. |
| Popover offset and collision | 8px above the pill — traced: alignment popover bottom y=249, pill top y=257. figjamTokens.ts:44 POPOVER_GAP = 8, which is also tldraw's default. Collision padding 12px is explicitly NOT a FigJam number (figjamTokens.ts:46-52 records it as the app's own, added because a 455px palette opened flush at x=0 with its first column cut in half). | Base UI defaults; no sideOffset or collisionPadding set on the language DropdownMenuContent (floatingToolbar.tsx:264). | sideOffset 8, collisionPadding 12. Cite the 12 as the app's own choice, not a measurement — the donor is careful about that distinction and a reviewer will check. |
| Overflow policy | flex-wrap: wrap, never overflow-x. chrome.css:908, with ~40 lines of recorded reasoning: tldraw's usePassThroughWheelEvents refuses to redispatch a wheel event through ANY scrollable descendant (axis-agnostic scrollWidth > clientWidth), so the moment the bar needed its scrollbar, a vertical wheel over the pill silently stopped panning the canvas. Every nested cluster wraps too (appearance.css:16, chrome.css:1012, :1032) because a flex parent only wraps its own direct children. | Already correct and already carries the reasoning — floatingToolbar.tsx:159-167 (`flex-wrap`, `min-h-10 overflow-visible`, with the usePassThroughWheelEvents rationale quoted). | None. This one is ported faithfully. Keep it: if any control group is added as a single unwrapped flex child, it will overflow as one unbreakable block — the donor hit that exact regression twice (chrome.css:1002-1012, appearance.css:11-15). |

## Risks

- The donor contradicts itself on three values, always as a 5px-vs-7px style split between appearance.css and systemsketch-chrome.css falling back differently on the SAME variable: trigger radius (5 vs 7), divider colour (#383838 vs --ss-border-inverse ≈ #414141), hover (#383838 vs --ss-surface-inverse-hover ≈ #3b3b3b). An implementer who greps one stylesheet gets one answer and one who greps the other gets the other. Take the appearance.css value every time — it is the one transcribed from the CDP trace.
- Copying tokens.css wholesale imports the bug. Lines 323-333 (`:where([data-ss-theme][data-ss-color-scheme='system'])` under `@media (prefers-color-scheme: dark)`) flip --ss-surface-inverse to white and --ss-text-inverse to dark, because that block is a verbatim copy of tldraw's dark palette. It is inert in the donor only because the real theme block at :109 is declared on `.tl-container`, a descendant, and wins. Port the pinned #1e1e1e from :120 and leave that fallback block behind — it is the likeliest route by which bbox-ui's pill became #fafafa.
- The surface tokens MUST be declared on the app root, not on the pill element. The popover portals out of the pill's DOM subtree (tldraw's useContainer / Base UI's portal), so a variable scoped to the pill is invisible to its own menu and the panel silently falls back to the page's popover colour — reproducing exactly the light-pill/dark-panel screenshot. pillSkins.css:15-23 states this as the reason for its scoping choice; it is the single most load-bearing structural decision in the donor's pill and the easiest to lose in a port.
- Do not copy the 33x32 family. It is `systemsketch-chrome.css:944-977` and `:1036-1048`, it is what Report A cited, and it has no FigJam measurement behind it — 32px tall inside a 40px bar, 18px stroked icons at stroke-width 1.45, radius 7. Copying it reproduces the "feels like tldraw stock" complaint rather than fixing it. Every FigJam cell is 40px tall and fills the bar.
- Height and icon size are coupled and must move together. Going to a 40px cell while leaving 16px lucide icons gives a worse result than today — a small glyph adrift in a tall box. 40px cell, 24px glyph, or leave both alone; there is no safe halfway.
- `hover:text-foreground` on a `text-background` pill sets the ink to the pill's own background. toolbar.tsx:89 bakes it into the base variants, so it reaches every ToolbarButton on the pill (floatingToolbar.tsx:293, :302) regardless of what the call site passes. Fixing the surface without fixing the hover pair leaves icons that vanish under the cursor.
- Keep `flex-wrap`; never reach for `overflow-x: auto` on the bar. tldraw's usePassThroughWheelEvents checks `scrollWidth > clientWidth` axis-agnostically and refuses to redispatch a wheel through any scrollable descendant, so an overflowing scrollable pill silently kills canvas panning while hovered. The donor hit this in code review and recorded it at systemsketch-chrome.css:869-900. Wrapping must also be applied to every nested cluster — a flex parent wraps only its own direct children, and the donor hit THAT regression twice more (chrome.css:1002-1012, appearance.css:11-15).
- Unverified by inspection: the donor never resets tldraw's `.tlui-popover__content`, which keeps `background-color: var(--tl-color-panel)`, `border-radius: 9px` and `overflow: hidden` (node_modules/tldraw/tldraw.css:2377-2391). So a donor popover's effective outer radius is 9px, not the 13px its own panel declares, and geometry implies a light sliver at the four corners in a light theme. I could not run the app to confirm visibility. In a re-implementation, reset the portal wrapper explicitly instead of relying on the panel to cover it.


---

# spec:hittest

## The short version

Zach's report is exactly the donor's 2026-09-01 bug, and the donor fixed it by adding **one `isLabel` `Rectangle2d` for the header band** as a child of the frame's `Group2d`. bbox-ui has the same pattern already, in its own sibling shape (`RegionShapeUtil.getGeometry`) — `BlockShapeUtil` just never got it.

Two things I can state harder than "the donor preferred label-children to `isFilled`":

1. **`isFilled: true` is not a rejected alternative — it is a no-op, twice over.** bbox-ui's body rect is *already* `isFilled: true` (`BlockShapeUtil.tsx:178`) and the bug is present anyway, because tldraw's frame-like branch of `getShapeAtPoint` never reads `isFilled`. And you cannot make the wrapper filled either: `Group2d`'s constructor hard-codes it — `super({ ...config, isClosed: true, isFilled: false })` (`@tldraw/editor/dist-cjs/lib/primitives/geometry/Group2d.js:33`). That is why the live measurement read `Group2d { isFilled: false, isClosed: true }`: it is structurally impossible for it to read anything else.
2. **The parent/child worry does not arise.** tldraw resolves it by z-order before geometry is consulted at all (proof in §3). The donor's restraint is about a *different* hazard — the container swallowing what is painted underneath it.

---

## 1. Where bbox-ui builds this geometry

`/home/bam/bbox-ui-toolbar/apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:177-180` (branch `claude/floating-toolbars-2026-09-20`):

```ts
  override getGeometry(shape: BlockShape) {
    const box = new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
    return shape.props.view === "expanded" ? new Group2d({ children: [box] }) : box;
  }
```

The 30-line doc comment above it (`:152-176`) explains only *why the `Group2d` wrapper exists at all* — `isFrameLike` is true in `expanded` view (`:100-102`), and `getShapeAtPoint` iterates `geometry.children` directly for a frame-like shape, so a bare `Rectangle2d` throws `TypeError: geometry.children is not iterable` inside the hover debounce and unmounts the board. The wrapper was added to stop that crash. **It has exactly one child and no label children.** That is the whole bug.

For contrast, the same repo's `/home/bam/bbox-ui-toolbar/apps/systemsketch/src/shapes/region/RegionShapeUtil.tsx:375-408` already does the right thing, and its doc comment (`:353-374`) states the three rules verbatim:

```ts
  override getGeometry(shape: RegionShape) {
    const layout = regionLayoutOf(this.editor, shape);
    const width = shape.props.w;
    const chrome = [
      { y: 0, h: layout.corner.h },
      ...layout.arms.map((arm) => ({ y: arm.headerTop, h: arm.bodyTop - arm.headerTop })),
    ].filter((band) => band.h > 0);

    return new Group2d({
      children: [
        new Rectangle2d({ width, height: shape.props.h, isFilled: false }),
        ...chrome.map((band) => new Rectangle2d({
          x: 0, y: band.y, width, height: band.h,
          isFilled: true, isLabel: true, excludeFromShapeBounds: true,
        })),
      ],
    });
  }
```

> "every CHROME band is `isLabel`, because the frame-like branch of `getShapeAtPoint` returns the shape for a point inside a label's bounds and for nothing else inside the frame. That is the only way an arm header or the title strip selects the region" — `RegionShapeUtil.tsx:361-365`

So the fix is not a port of a foreign idea. It is applying this repo's own already-landed pattern to the one frame-like shape that missed it.

### The second gate, which nobody has named yet

There is a DOM gate *in front of* the geometry, and it matters for scoping the fix:

`/home/bam/bbox-ui-toolbar/apps/systemsketch/src/shapes/shared/pointerOwnership.ts:38-46`

```ts
  if (target.closest('[data-slot="block-port-rail"]')) return true;
  if (shapeType === BLOCK_SHAPE_TYPE) {
    const header = target.closest('[data-slot="block-header"]');
    if (!header) return true;
    const owner = header.closest("[data-block-id]")?.getAttribute("data-block-id");
    return owner !== nodeId;
  }
```

`true` → `editor.markEventAsHandled(event)` (`nodeShapeComponent.tsx:56-58`) → tldraw never sees the pointerdown. So today **the header is the only part of the face whose press reaches tldraw at all** — and its own doc comment already says that was the intent:

> "in tldraw select and translate are one gesture, so hiding a block-body press from tldraw also costs body-click SELECTION — a block is selected by its header or a marquee." — `pointerOwnership.ts:20-22`

The header press *does* get through, and tldraw then answers "nothing here" because the geometry never claims the header band. **Zach's symptom is purely the geometry gate.** Fixing `getGeometry` alone closes it, and the DOM gate is already aligned. Only `markEventAsHandled` is applied — to pointerdown only — so hover (`updateHoveredShapeId`, driven by pointermove) is unaffected and the hover indicator will light on the header the moment the geometry claims it.

The residual 3px edge Zach can hit today is `getHitTestMargin()` = `options.hitTestMargin: 3` ÷ zoom (`Editor.js:4254-4258`, `@tldraw/editor/dist-cjs/lib/options.js:56`) — the ring just *outside* the box, where no DOM sits to swallow the press. That is literally "hovering its EDGE".

---

## 2. What the donor builds

`/home/bam/systemsketch/src/blocks/BlockShapeUtil.tsx:494-528`:

```ts
	override getGeometry(shape: BlockShape) {
		const layout = layoutBlock(shape.props)
		const isContainer = isExpandedBlockShape(shape)
		return containerHitGeometry({
			body: shape.props.view === 'value'
				? new Stadium2d({ width: layout.bounds.w, height: layout.bounds.h, isFilled: true })
				: new Rectangle2d({
						width: layout.bounds.w,
						height: layout.bounds.h,
						isFilled: !isContainer,
					}),
			chrome: isContainer
				? [
						layout.header,
						...layout.ports.map((placed) => portLabelHitArea(placed, layout.width)),
						layout.footer,
					]
				: [],
			dots: layout.ports
				.filter((port) => !port.subtle)
				.map((port) => ({ x: port.x, y: port.y, radius: BLOCK_PORT_RADIUS })),
		})
	}
```

`containerHitGeometry` — `/home/bam/systemsketch/src/blocks/containerGeometry.ts:70-92`:

```ts
export function containerHitGeometry({ body, chrome = [], dots = [] }: ContainerHitSpec): Group2d {
	return new Group2d({
		children: [
			body,
			...chrome.filter(isPaintable).map((rect) => new Rectangle2d({
				x: rect.x ?? 0, y: rect.y ?? 0, width: rect.w, height: rect.h,
				isFilled: true, isLabel: true, excludeFromShapeBounds: true,
			})),
			...dots.map((dot) => new Circle2d({
				x: dot.x - dot.radius, y: dot.y - dot.radius, radius: dot.radius,
				isFilled: true, isLabel: true, excludeFromShapeBounds: true,
			})),
		],
	})
}
```

### Children of the expanded block's `Group2d`, in order

| # | Child | `isFilled` | `isLabel` | `excludeFromShapeBounds` |
|---|---|---|---|---|
| 0 | body `Rectangle2d`, full `w`×`h` | **`false`** (`isFilled: !isContainer`) | no | no |
| 1 | header band `{x:0, y:0, w:width, h:headerHeight}` | true | **yes** | yes |
| 2..n | one band per visible port, `portLabelHitArea(placed, width)` | true | **yes** | yes |
| n+1 | footer band `{x:0, y:footerTop, w:width, h:height-footerTop}` | true | **yes** | yes |
| last | one `Circle2d` per non-subtle port dot, `r = BLOCK_PORT_RADIUS` | true | **yes** | yes |

Child 0 is the only non-label. Everything grabbable is a label.

The 8px stop Zach's earlier vault read remembered is real and exact — `PORT_LABEL_HIT_PAD_PX = 8` (`/home/bam/systemsketch/src/blocks/layoutBlock.ts:69`), consumed in `portLabelHitArea` (`layoutBlock.ts:909-924`), which runs the band from the block's own wall to 8px past the last painted glyph and returns `null` for a top/bottom rail label (centring it on its socket would claim the whole body width).

### It was fixed twice, and the second fix is the tell

- **`93c84177`** "Expanded Block: its words and its footer now answer a click" (Sep 1 2026). Its own first line: *"It answered on its edge, a port dot **and its header**."* Confirmed by reading `git show 93c84177^:src/blocks/BlockShapeUtil.tsx:327-354` — the header was already a hand-built `isLabel` rect before that commit. This commit added the port text and the footer. Its rejection of the obvious alternative, in Zach's own words:

  > "It deliberately does not fill the rectangle the label is positioned in: that box is 46% of the Block wide, the two lanes' boxes meet in the middle, and handing tldraw those would make the centre of the frame selectable — **a container ceasing to be one**."

- **`ff12d256`** "A container's hit zones are one contract, and a cable is its child". Block, Branch and Loop had each hand-rolled the geometry and *"the Loop's copy had no footer rectangle at all, so the one band you reached for could not be clicked."* This is the commit that extracted `containerHitGeometry` so there is one place. The lesson for bbox-ui: do not hand-roll a fourth copy — but with only `ss-block` and `ss-region` needing it, and `ss-region`'s already inline, extracting a shared helper now is premature. Note it as owed if a third container lands.

---

## 3. The trade-off, stated precisely

**Does making the parent's interior hit-testable steal a click from a child block? No — and not because of anything in the geometry.**

Mechanism, read out of tldraw 5.3.2:

1. `getCurrentPageShapesSorted()` (`Editor.js:4520-4527`) is built by `pushShapeWithDescendants` (`Editor.js:8726-8734`), which pushes the parent **then** recurses into its children. A child is therefore always at a **higher index** than its parent.
2. `getShapeAtPoint` iterates that array **backwards**: `for (let i = shapesToCheck.length - 1; i >= 0; i--)` (`Editor.js:4317`). **Children are tested before parents.** A child `ss-block` in `port`/`simple` view is not frame-like, so it falls to the ordinary branch, is a closed filled `Rectangle2d`, and returns immediately — long before the parent's label loop is reached.
3. `getShapeToHover` (`tldraw/dist-cjs/lib/tools/selection-logic/updateHoveredShapeId.js:27-48`) then calls `getOutermostSelectableShape(hitShape)`, which promotes **only** shapes of type `"group"` (`Editor.js:4863-4878`). A frame-like parent never promotes. Frame children are directly selectable, by design.

So parent/child priority is settled by z-order, before geometry is consulted. This is safe with label children and would be equally safe with a filled body.

**The hazard the donor's restraint actually guards against is different: a frame swallows everything painted *under* it.** The frame-like branch, `Editor.js:4325-4344`:

```js
      if (isShapeFrameLike || (... getText ...)) {
        for (const childGeometry of geometry.children) {
          if (childGeometry.isLabel && childGeometry.isPointInBounds(pointInShapeSpace)) {
            return shape;                                   // (1) label BOUNDS win, first
          }
        }
      }
      if (isShapeFrameLike) {
        const distance2 = geometry.distanceToPoint(pointInShapeSpace, hitFrameInside);
        if (hitFrameInside ? ... : distance2 > 0 && distance2 <= outerMargin) {
          return inMarginClosestToEdgeHit || shape;         // (2) the OUTLINE, within margin
        }
        if (geometry.hitTestPoint(pointInShapeSpace, 0, true)) {
          return inMarginClosestToEdgeHit || inHollowSmallestAreaHit || (hitFrameInside ? shape : void 0);
        }                                                   // (3) inside → undefined, search STOPS
        continue;
      }
```

Note what is *absent*: `isFilled` is never read on this path. Steps (1)–(3) are the entire frame-like contract. That is the mechanical reason `isFilled: true` cannot fix this — and why it is already `true` in bbox-ui with no effect.

Step (1) is also not gated by `hitLabels` — the caller that drives hover passes `hitLabels: false` (`updateHoveredShapeId.js:28-34`) and the label loop still runs. That is what makes the approach work for hover as well as for the press.

Step (3) is the swallow, and it is the thing that must not be widened. The donor's `containerGeometry.ts:8-28` states why it cannot be tuned away:

> "`Group2d.hitTestPoint` excludes labels by default, so the body rectangle alone decides the second question — whether the pointer is 'inside the frame'. Inside a frame, `getShapeAtPoint` STOPS and answers nothing, which is why nothing painted under a container can be clicked. … `getDraggingOverShape` asks `isPointInShape(…, { hitInside: true })`, which reduces to that same body test. A container whose body stops answering is a container that can no longer adopt a dropped Block. (2) and (3) are the same predicate, so the swallow cannot be tuned away here."

Verified: `Group2d.hitTestPoint`'s filter defaults to `Geometry2dFilters.EXCLUDE_LABELS` (`Group2d.js:80`), and `isExcludedByFilter` drops every `isLabel` child (`Geometry2d.js:67-71`). So label bands are invisible to (3), to `getDraggingOverShape`, and to the marquee (`Brushing.js:147` uses `hitTestLineSegment`, whose `Group2d` override defaults to `EXCLUDE_LABELS` too — `Group2d.js:83`). **Adding label bands cannot break drops and cannot break brush selection.** That is the whole point of the seam.

The real, accepted cost — also in the donor's own words (`93c84177`):

> "cables are pinned under Blocks by `keepConnectionsAtBottom`, so a cable running beneath the footer or beneath a port's words is not clickable there. That is how `test:edges` caught the change — its teardown clicked a cable 25% along and pressed Delete, the point had moved under `out_1`'s new band, and Delete took the frame plus its whole subtree."

Every square pixel promoted to chrome is a square pixel where a wire underneath stops being clickable. **A full-interior `isFilled` equivalent would make the entire body of every expanded block a dead zone for wires and a refusal to be drawn into.** That is what "a container ceasing to be one" means, and it is why the answer is a band, not a fill.

---

## 4. The header specifically

**It is already a label child in the donor — it was the *first* one, predating the words/footer fix.** `git show 93c84177^:src/blocks/BlockShapeUtil.tsx:335-342`:

```ts
		const header = isContainer && layout.header
			? new Rectangle2d({
					width: layout.header.w,
					height: layout.header.h,
					isFilled: true,
					isLabel: true,
				})
			: null
```

Today it comes through `containerHitGeometry`'s `chrome` list as `layout.header` = `{ x: 0, y: 0, w: width, h: headerHeight }` (`/home/bam/systemsketch/src/blocks/layoutBlock.ts:1374`, returned at `:1644`), and picks up `excludeFromShapeBounds: true` from the helper. Full width, `y: 0`, height = the header band.

So for bbox-ui: **it needs adding.** Nothing else about the header changes — `contentOwnsPress` already lets its press through, and the `Block` component already stamps `data-slot="block-header"` (`apps/storybook-basics/src/components/block.tsx:369`) as the first stacked region of a `relative flex flex-col` root (`block.tsx:245-247`), inside a `BlockPort` wrapper that is itself `position: relative; width: max-content` at the `NodeShapeFrame` origin (`blockPort.tsx:366-377`). So the band really is `{ x: 0, y: 0, w: props.w, h: headerH }` in shape space.

**Where `headerH` comes from.** bbox-ui has no pure layout module for `Block` — its header is CSS (`px-3 py-2` + text, and the open "interface scale" task will move it). The repo's own answer for a non-constant band is to measure it and persist it: `props.anchors` is already exactly that (`BlockShapeUtil.tsx:48-50`, written by `useMeasuredShape`), and `RegionShapeUtil` reads a *measured* corner height for the identical reason (`cornerBlock.ts:487-489`: "generalised over a MEASURED corner block where the donor had a fixed 40px band"). So `headerH` joins `w`/`h`/`anchors` as a measured prop on the same pass.

---

## 5. Minimal diff, and the acceptance test

### File A — `/home/bam/bbox-ui-toolbar/apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx`

**A1.** `BlockShapeProps` (`:44-52`) and `static props` (`:66-78`) gain one field:

```ts
  /** MEASURED header band height, shape-local px. 0 = no header band. */
  headerH: number;
```
```ts
    headerH: T.number,
```

**A2.** `getDefaultProps` (`:86-95`) gains `headerH: 0`.

**A3.** The empty migration sequence at `:84` gets its first real entry — this is the lane the comment at `:80-83` was written for:

```ts
  static override migrations = createShapePropsMigrationSequence({
    sequence: [{ id: "com.systemsketch.ss-block/1", up: (props) => { props.headerH = 0 }, down: (props) => { delete props.headerH } }],
  });
```

**A4.** Replace `getGeometry` (`:177-180`):

```ts
  override getGeometry(shape: BlockShape) {
    const isContainer = shape.props.view === "expanded";
    const body = new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: !isContainer,
    });
    if (!isContainer) return body;
    // WHY the header is an `isLabel` CHILD and not `isFilled: true` on the body
    // (Zach, 2026-09-20: "if I hover over the header and other parts it should
    // also become selected!!!"):
    //
    // `isFilled` is not the knob. tldraw 5.3.2's frame-like branch of
    // `getShapeAtPoint` never reads it — it answers in three steps: a child
    // with `isLabel` whose BOUNDS hold the point returns the shape; the
    // outline within `hitTestMargin` returns the shape; anything else inside
    // returns `undefined` and STOPS the search. (That third step is also
    // exactly the predicate `getDraggingOverShape` uses, so the interior has
    // to keep answering "inside" or this stops adopting dropped blocks.)
    // `Group2d` cannot be filled at all — its constructor hard-codes
    // `isFilled: false` — and the body rect below WAS already `isFilled: true`
    // while this bug was live. A label band is the only seam there is.
    //
    // Only the header, deliberately: every pixel promoted to chrome is a pixel
    // where a wire painted underneath stops being clickable, and a container
    // whose whole interior answers has stopped being a container. Donor's
    // words, systemsketch 93c84177. Same three rules as this repo's own
    // RegionShapeUtil.getGeometry.
    const chrome = shape.props.headerH > 0
      ? [new Rectangle2d({
          x: 0,
          y: 0,
          width: shape.props.w,
          height: shape.props.headerH,
          isFilled: true,
          isLabel: true,
          // Or a laid-out band widens the bounds and snaps a 1x1 drag-create
          // placeholder to its own layout on the first pointer move.
          excludeFromShapeBounds: true,
        })]
      : [];
    return new Group2d({ children: [body, ...chrome] });
  }
```

`Group2d` and `Rectangle2d` are already imported (`:11-22`).

### File B — `/home/bam/bbox-ui-toolbar/apps/systemsketch/src/shapes/shared/measure.ts`

**B1.** `MeasuredProps` (`:33-37`) gains `headerH: number`.

**B2.** In the `measure` callback, between `:92` and `:94`:

```ts
    // `:scope >` is load-bearing (blockPort.tsx:230-233): a MEMBER of this
    // block is itself a BlockPort with its own `block-header`, and an unscoped
    // query would measure the child's band for the parent.
    //
    // WHY offsetTop/offsetHeight and not getBoundingClientRect: rule 1 at the
    // top of this file — offset* are unscaled layout px, i.e. shape-local px.
    // A client rect is multiplied by the camera zoom, so the band would be
    // right at 1x and wrong at every other zoom.
    const blockEl = wrapper.querySelector<HTMLElement>('[data-slot="block"]');
    const headerEl = blockEl?.querySelector<HTMLElement>(':scope > [data-slot="block-header"]') ?? null;
    const headerH = headerEl ? headerEl.offsetTop + headerEl.offsetHeight : 0;
    const headerMoved = Math.abs((props.headerH ?? 0) - headerH) > EPSILON_PX;
```

**B3.** Early return (`:100`) → `if (!boxMoved && !anchorsMoved && !headerMoved) return;`
Write partial (`:116`) → `props: { ...(boxMoved ? { w, h } : {}), ...(anchorsMoved ? { anchors } : {}), ...(headerMoved ? { headerH } : {}) },`

**B4.** The `ResizeObserver` at `:138` observes only the wrapper. An `expanded` block passes an explicit `height={h}` to `Block` (`BlockFace.tsx:159`), so a header that reflows or whose font settles changes the header's box **without** changing the wrapper's — the observer would sleep through it and the every-render `useLayoutEffect` only fires on a re-render. Also observe the header element, exactly as `blockPort.tsx:267-274` already does:

```ts
    const headerEl = wrapper.querySelector<HTMLElement>('[data-slot="block"] > [data-slot="block-header"]');
    if (headerEl) observer.observe(headerEl);
```

### Deliberately NOT in this diff

- **Port name/type/default rows.** The donor has them (`portLabelHitArea`, 8px pad). In bbox-ui they are blocked at the *other* gate: `contentOwnsPress` returns `true` for anything under `[data-slot="block-port-rail"]` (`pointerOwnership.ts:41`) because dnd-kit owns the rail for reorder. Adding label geometry there would light the hover indicator on a band whose press still reorders — worse than not having it. Unblocking needs the preempt/interlock ladder that file already records as deferred. Matches the donor's own order: header first (pre-`93c84177`), words later.
- **Footer band.** `BlockFace` passes no `footer` to `Block` (`BlockFace.tsx:147-166`), so `data-slot="block-footer"` does not exist on an `ss-block` — there is nothing to claim. The measurement in B2 should be written to take a list of band selectors so the footer drops in for free when one lands.
- **Extracting a `containerHitGeometry` helper.** Two call sites (`ss-block`, `ss-region`). The donor extracted at three, after the Loop shipped without a footer rect. Owed when a third container lands; premature now.

### Acceptance test

Two rungs, matching the donor (`blockSelectableArea.test.ts` + `tests/block_footer_drag_smoke.mjs`) and the two vitest projects already in `apps/systemsketch/package.json` (`unit`, `smoke`).

**Rung 1 — `apps/systemsketch/src/shapes/block/blockSelectableArea.test.ts`** (unit; `getGeometry` reads only `shape.props`, so `new BlockShapeUtil(null as unknown as Editor)` works, exactly as the donor's does at `blockSelectableArea.test.ts:55`). Transcribe the donor's `hitsChrome` helper (`:59-62`) verbatim — it is tldraw's frame-like rule as a pure predicate:

```ts
const hitsChrome = (g: Group2d, p: {x:number;y:number}) =>
  g.children.some((c) => c.isLabel && c.isPointInBounds(p));
```

| # | Assertion | Kills |
|---|---|---|
| 1 | `hitsChrome(g, {x: w/2, y: headerH/2})` === `true` | the bug |
| 2 | `hitsChrome(g, {x: w/2, y: h/2})` === `false` | a full-interior fill |
| 3 | `g.hitTestPoint({x: w/2, y: headerH/2}, 0, false)` === `false` | a band that leaks into brush hits |
| 4 | `g.bounds` matches `{x:0, y:0, w, h}` | a missing `excludeFromShapeBounds` |
| 5 | for `simple`/`port`: geometry is a bare `Rectangle2d`, `isFilled === true`, no label children | regressing the two non-container views |
| 6 | `headerH: 0` → `g.children.length === 1` | a zero-height band |

Mutation-test it red three ways before trusting it: drop `isLabel` → 1 fails; drop `excludeFromShapeBounds` → 4 fails; use `shape.props.h` instead of `headerH` → 2 fails.

**Rung 2 — browser smoke** (new `apps/systemsketch/src/blockSelect.smoke.test.tsx`, in the style of `src/region.smoke.test.tsx`, which already drives real presses with `userEvent` against the running editor). Three presses, each asserting `editor.getSelectedShapeIds()` — the engine's own record, not DOM presence:

| Press | Expected | Source of the expectation |
|---|---|---|
| **Header** of an expanded block | `[parentId]` | Zach's ask; donor `93c84177` first line |
| **A child block** inside its body | `[childId]`, **not** the parent | `pushShapeWithDescendants` + backwards iteration (§3); `getOutermostSelectableShape` promotes groups only |
| **Empty interior** | `[]` — **nothing selected** | The donor's answer, not invented. `getShapeAtPoint` reaches step (3), `hitFrameInside` is `false` on the hover path (`updateHoveredShapeId.js:28-34`), so it returns `undefined` and stops. Donor unit test asserts `'middle of child canvas' … stays drawable → false`; donor comment `containerGeometry.ts:15-19`. In bbox-ui the same point is *independently* swallowed at the DOM by `contentOwnsPress` (`pointerOwnership.ts:41-45`) — the two mechanisms agree, which is a good cross-check that the fix did not disturb either. |

Add a fourth if cheap: drag another block into the body and assert it is adopted (`parentId` becomes the expanded block) — this is the `getDraggingOverShape` predicate the label bands must not disturb, and the one thing a careless "just make it filled" fix would eventually break.

Run: `cd /home/bam/bbox-ui-toolbar/apps/systemsketch && pnpm test-unit` then `pnpm test-smoke`.

## Report rows

| Feature | SystemSketch / FigJam | bbox-ui today | Change needed |
|---|---|---|---|
| Frame geometry container | `containerHitGeometry({body, chrome, dots})` returns a `Group2d` whose child 0 is the body and whose remaining children are all `isLabel` chrome — one shared helper for Block, Branch, Loop, Table, BehaviorTree (`src/blocks/containerGeometry.ts:70-92`). | `new Group2d({ children: [box] })` — exactly one child, no labels (`BlockShapeUtil.tsx:177-180`). The wrapper exists only to stop `geometry.children is not iterable` crashing the hover debounce (comment at `:152-176`). | Add label children. Inline in `BlockShapeUtil.getGeometry` — do NOT extract a helper yet; the donor extracted at three call sites, bbox-ui has two (`ss-block`, `ss-region`). |
| Header band | `{x:0, y:0, w:width, h:headerHeight}` as `isFilled:true, isLabel:true, excludeFromShapeBounds:true`. Was the FIRST label child added, predating the words/footer fix (`git show 93c84177^:src/blocks/BlockShapeUtil.tsx:335-342`); now flows through `chrome` as `layout.header` (`layoutBlock.ts:1374`, returned `:1644`). | Absent. `contentOwnsPress` already lets a header press reach tldraw (`pointerOwnership.ts:42-45`) and the comment at `:20-22` says a block is meant to be "selected by its header or a marquee" — but the geometry never claims the band, so tldraw answers nothing. | One `Rectangle2d {x:0, y:0, width: props.w, height: props.headerH, isFilled:true, isLabel:true, excludeFromShapeBounds:true}`. This alone closes Zach's report. |
| Where the band's height comes from | Pure TS: `layoutBlock(shape.props).header`, `headerHeight` computed, never measured. | No pure layout module for `Block` — the header is CSS (`px-3 py-2` + text, `block.tsx:369-371`). `props.anchors` is already a MEASURED prop written by `useMeasuredShape` (`measure.ts:94-118`), and `RegionShapeUtil` already reads a measured corner height (`cornerBlock.ts:487-489`). | Add `headerH: T.number` (default 0, first real migration in the sequence reserved at `BlockShapeUtil.tsx:80-84`). Measure it in `measure.ts` from `[data-slot="block"] :scope > [data-slot="block-header"]` via `offsetTop + offsetHeight` (unscaled layout px = shape-local px, rule 1 at `measure.ts:11-14`) — NOT `getBoundingClientRect`, which is multiplied by camera zoom. |
| Port name / type / default rows | `portLabelHitArea(placed, width)` runs a band from the block's own wall to `PORT_LABEL_HIT_PAD_PX = 8` past the last painted glyph (`layoutBlock.ts:69`, `:909-924`); returns `null` for top/bottom rail labels. Deliberately NOT the positioned label box — that is 46% of the block wide and the two lanes meet in the middle. | Absent, and blocked at a second gate: `contentOwnsPress` returns `true` for anything under `[data-slot="block-port-rail"]` (`pointerOwnership.ts:41`) because dnd-kit owns the rail for reorder, so the press never reaches tldraw. | Defer. Adding geometry here would light hover on a band whose press still reorders. Unblocking needs the preempt/interlock ladder `pointerOwnership.ts:23-25` already records as deferred. Matches the donor's own order: header first, words in `93c84177`. |
| Footer band | `{x:0, y:footerTop, w:width, h:height-footerTop}` — one rectangle shared by paint and pointer. `ff12d256` exists because the Loop shipped with no footer rect at all and "the one band Zach reached for could not be clicked." | `BlockFace` passes no `footer` to `Block` (`BlockFace.tsx:147-166`), so `data-slot="block-footer"` is not in an `ss-block`'s DOM. Nothing to claim. | Nothing now. Write the measurement in B2 over a LIST of band selectors so a footer drops in for free when one lands — that is precisely the miss `ff12d256` was written to prevent. |
| Port dots | One `Circle2d` per non-subtle port, `r = BLOCK_PORT_RADIUS`, `isLabel:true, excludeFromShapeBounds:true` — grabbable slightly outside the face. | `props.anchors` already holds MEASURED shape-local dot centres (`BlockShapeUtil.tsx:48-50`, `measure.ts:94-97`) but no geometry is built from them; the dots are DOM only. | Out of scope for this bug, and a near-free follow-up once `headerH` proves the pattern — the centres are already persisted. Same rail-ownership caveat as the label rows applies to the press. |
| Body fill | `isFilled: !isContainer` — the expanded body is UNFILLED. It still answers `hitTestPoint(p, 0, true)`, which is what `getDraggingOverShape` asks, so drops keep working (`containerGeometry.ts:20-25`). | `isFilled: true` unconditionally (`BlockShapeUtil.tsx:178`) — and the bug is present anyway, which is the proof that `isFilled` is not the knob. `RegionShapeUtil` already uses `isFilled: false` for its frame body (`RegionShapeUtil.tsx:393`). | Flip to `isFilled: !isContainer` for donor and in-repo consistency. NOT load-bearing for the symptom — the frame-like branch of `getShapeAtPoint` (`Editor.js:4325-4344`) never reads `isFilled`. Verified safe: brush uses `hitTestLineSegment`, which skips frame-likes unless fully contained (`Brushing.js:135-151`); drops use `hitInside: true`, true for a closed rect either way (`Geometry2d.js:74`). |
| Acceptance gate | `src/blocks/blockSelectableArea.test.ts` — 8 unit assertions including the exact three that matter (header grabbable, "middle of child canvas stays drawable", bands out of brush hits and out of bounds), mutation-tested red four ways; plus browser `tests/block_footer_drag_smoke.mjs`, `npm run test:selectable` 12/12. | No selectable-area test for `ss-block` in either vitest project. `src/region.smoke.test.tsx` is the nearest pattern and drives real presses with `userEvent`. | New `src/shapes/block/blockSelectableArea.test.ts` (unit, 6 assertions, mutation-tested red 3 ways) + `src/blockSelect.smoke.test.tsx` asserting `editor.getSelectedShapeIds()` on three presses: header → parent, child block → child, empty interior → `[]`. |

## Risks

- The interior must stay hollow or dropping stops working. `getDraggingOverShape` asks `isPointInShape(…, {hitInside: true})`, which reduces to the SAME body test as the swallow at step (3) of the frame-like branch — the donor states this explicitly at `containerGeometry.ts:20-27` ("(2) and (3) are the same predicate, so the swallow cannot be tuned away here"). An implementer who "fixes" the interior by widening the body geometry, or by adding a full-size label rect, breaks child adoption and makes every wire painted under the block unclickable. Bands only.
- `excludeFromShapeBounds: true` is not decoration. Without it the header band widens `geometry.bounds`, and a 1x1 drag-create placeholder snaps to its own layout on the first pointer move — the donor's stated reason at `containerGeometry.ts:63-68`, and the failure mode `cornerBlock.ts:461-475` records for the Region ("a drag-create whose frame lands 239px right of the release point"). Assertion 4 in the unit test is the guard; drop the flag and it must go red.
- Measure with `offsetTop`/`offsetHeight`, never `getBoundingClientRect`. `measure.ts:11-14` states the rule: offset* are unscaled layout px and therefore ARE shape-local px, while a client rect is multiplied by the camera zoom. `useBlockBands` in `blockPort.tsx:249-258` uses client rects legitimately — it works in wrapper-local CSS space, not shape space — so copying that code into `measure.ts` gives a header band that is correct at 1x and wrong at every other zoom. It will look fine in a screenshot taken at default zoom.
- The `:scope >` in the header query is load-bearing. `blockPort.tsx:230-233` already records why: a MEMBER of an expanded block is itself a `BlockPort` with its own `block-header`, and an unscoped `querySelector` measures the child's band for the parent. The related 2026-09-17 audit finding is in `pointerOwnership.ts:12-17` — React Flow's unscoped `[data-slot="block-header"]` let a member's header move the parent by (57, 24).
- Fixing the geometry does NOT make the whole face selectable, and the handoff must say so plainly or Zach will read "other parts" as done. `contentOwnsPress` (`pointerOwnership.ts:38-46`) hides every non-header press on an `ss-block` from tldraw via `markEventAsHandled`. After this fix: header selects, empty interior selects nothing, port rails still reorder. That is the donor's shipped behaviour too — but it is narrower than a literal reading of "and other parts", so name the three outcomes explicitly rather than claiming the ask is closed.
- Do not "simplify" this to `isFilled: true` in a later refactor. It reads like the obvious one-line version and it does nothing: `Group2d`'s constructor hard-codes `isFilled: false` (`Group2d.js:33`), the body rect was ALREADY `isFilled: true` while this bug was live, and the frame-like branch never reads the flag. The WHY comment in the diff exists to stop exactly that refactor; it must ship with the code, not live only in this spec.
- The migration is the one irreversible part. `BlockShapeUtil.tsx:80-83` says the empty sequence was declared at version 0 precisely so a later lane could add one, and that retrofitting after boards exist in the wild cannot be done. Adding `headerH` without the `up`/`down` entry leaves saved boards with an undefined prop; `props.headerH > 0` happens to be false-y so the geometry degrades to today's behaviour rather than throwing — which means a missing migration will pass every test and only surface as "the fix silently does nothing on my old board."
- Every pixel promoted to chrome is a pixel where something painted underneath stops being clickable. This is not hypothetical: `93c84177`'s own commit message records `test:edges` catching it — a teardown clicked a cable 25% along and pressed Delete, the point had moved under `out_1`'s new band, and Delete took the frame plus its whole subtree. bbox-ui has wires (`ss-wire`). Before landing, check whether any existing smoke test clicks a point that now falls inside the header band, and make any wire-click helper assert a wire is really selected before acting on it.


---

# spec:interface-scale

> **Two premises in the brief are wrong, and they change the work.** (1) `appearancePreferences` does **not** carry an `interfaceScale`-ish field — it is wheel/zoom *input* behaviour only (`apps/storybook-basics/src/components/appearancePreferences.ts:55-90`, and its own header calls the name a "MISNOMER, KEPT ON PURPOSE"). (2) bbox-ui **already has** a complete, character-for-character port of the donor model at `apps/storybook-basics/src/components/interfaceScale.ts`, already wired to storage in `apps/systemsketch/src/chrome/appSettings.tsx:188`. The value **already persists today.** Nothing reads it. This is an apply-side bug only.

---

# Interface scale — implementation spec for bbox-ui

## 0. Donor verification — every claim in the brief, checked

Verified against `/home/bam/systemsketch` (read-only; nothing written).

| Brief's claim | Verdict | Evidence |
|---|---|---|
| Global user preference, never a document property | **Correct** | `src/settings/interfaceScale.ts:34-43` reads `window.localStorage` directly; no store record, no `.tldr` field. |
| Key `systemsketch.interface-scale.v1`, shape `{version:1,percent}` | **Correct** | `interfaceScale.ts:4`, `:11-14`, `:52` |
| 80–160% in 5% steps, default 100 | **Correct** | `interfaceScale.ts:5-8` |
| Presets 90/100/110/125/150 | **Correct** | `interfaceScale.ts:9` |
| Applied as CSS `zoom:` on the chrome root | **Correct, but it is TWO roots, not one** | `src/settings/interface-settings.css:8-11` applies `zoom` to **`.tlui-layout`** *and* **`.systemsketch-surface-host`**. The app root `.systemsketch-app` only *carries the variables* (`src/App.tsx:312-319`); it is never zoomed, because the canvas is inside it. |
| Inverse counter-zoom for tldraw-positioned layers | **Correct** | `interface-settings.css:29-35` — six selectors get `zoom: var(--systemsketch-interface-scale-inverse)` |
| `transform: scale()` + `transform-origin: 0 0` on the floating pill | **Correct** | `src/chrome/systemsketch-chrome.css:838-846` |
| Canvas must not scale | **Correct** | Neither zoomed element contains `.tl-canvas`; both are siblings of it. |

**One claim the brief missed, and it is load-bearing:** the donor *also* zooms tldraw's portaled surfaces — `interface-settings.css:37-43` covers `.tl-container > * > .tlui-menu`, `.tlui-popover__content`, `.tlui-dialog__positioner`, `.tlui-tooltip`, `.tlui-toast__container`. These portal *out* of `.tlui-layout`, so without that rule every menu and dialog stays at 100% while the bar that opened it grows.

**A second thing the brief missed:** the donor's max-width cap divides by the scale — `systemsketch-chrome.css:919` and `src/chrome/floatingToolbarPlacement.ts:169-177`. bbox-ui's port of that function **already takes the parameter** and the host **already fails to pass it**.

---

## 1. Measured browser facts (Chrome 153 headless, `/tmp/zoomprobe*.html`)

These are not inferred. They decide items 2, 3 and 5.

| Probe | Result | Consequence |
|---|---|---|
| `zoom:1.25` on `position:absolute; inset:0` | `getBoundingClientRect()` = 1000×600, unchanged | The chrome host still covers the canvas exactly. Safe. |
| Child at `right:8px; bottom:8px` inside that host | Paints **10px** from the real edge (8 × 1.25) | Edge insets grow with the setting — desired, matches donor. |
| Child `offsetWidth` vs `getBoundingClientRect().width` inside zoom | **150 vs 187.5** | `offsetWidth` is in **local/unzoomed** units. `getBoundingClientRect` is in **real viewport px**. **Mixing them is a bug.** |
| `transform: translate(300px,200px)` inside `zoom:1.25`, no counter-zoom | Paints at x = **375** | A screen-px anchor written into a zoomed layer lands at `x × scale`. This is the pill break. |
| Donor pattern: host `zoom:1.25` → child `zoom:0.8` → `translate(300,200) scale(1.25)`, `origin 0 0` | Paints at **exactly (300, 200)**, size **250×50** (= 200×40 × 1.25) | Counter-zoom restores real px; `getBoundingClientRect` already reports the painted, post-scale size. **No change needed to the placement loop's `menu` input.** |
| `ResizeObserver` on the bar, then change the `transform` scale | **0 callbacks** | Expected. |
| `ResizeObserver` on the bar, then change the ancestor `zoom` | **0 callbacks** | **Stronger than the donor documents.** RO reports the border box in the element's *own* layout units, so it is blind to **both** mechanisms. The epoch must be driven off the scale value itself, never off RO. |

---

## 2. WHICH element gets the scale

**Two hosts, mirroring the donor exactly. `.ss-chrome` alone is not enough.**

bbox-ui splits its chrome across two tldraw slots (`apps/systemsketch/src/App.tsx:36-38`):

```
Toolbar:            SystemSketchDock   → renders inside .tlui-layout__bottom__main
InFrontOfTheCanvas: Overlay            → renders .ss-chrome inside .tl-canvas__in-front
```

Confirmed in tldraw 5.3.2: `node_modules/.pnpm/tldraw@5.3.2*/node_modules/tldraw/dist-esm/lib/ui/TldrawUi.mjs:118` creates `.tlui-layout`, and `:152` renders the `Toolbar` component slot inside it. **Scaling only `.ss-chrome` would leave the tool dock — the thing Zach is actually looking at — at 100%.**

### The variable carrier

`apps/systemsketch/src/App.tsx:145`, the existing `<main data-testid="systemsketch-app">`:

```tsx
const scale = useInterfaceScale();            // new host store, §4
const css = interfaceScaleCssValues(scale);   // already exists in the trunk

<main
  data-testid="systemsketch-app"
  data-interface-scale={scale}
  style={{
    position: "fixed",
    inset: 0,
    "--ss-interface-scale": css.scale,
    "--ss-interface-scale-inverse": css.inverse,
  } as CSSProperties}
>
```

`data-interface-scale` is **not decoration** — `apps/storybook-basics/src/recording/flightRecorder.ts:828-830` already queries `document.querySelector('[data-interface-scale]')?.dataset.interfaceScale`. That selector matches nothing today.

### The zoom rules — new file `apps/systemsketch/src/interfaceScale.css`, imported from `app.css`

```css
/* Ported from /home/bam/systemsketch/src/settings/interface-settings.css:1-44.
 *
 * WHY two hosts and not the app root: the app root contains the CANVAS.
 * tldraw keeps its interface in layers that are SIBLINGS of .tl-canvas —
 * .tlui-layout (TldrawUi.mjs:118, where components.Toolbar renders) and
 * .tl-canvas__in-front (where components.InFrontOfTheCanvas renders
 * .ss-chrome). Zooming those two scales every pixel of chrome and leaves
 * board geometry and camera zoom untouched. Zooming the root would scale
 * the board with it, which is what "Canvas zoom stays unchanged" forbids.
 */
:root {
  --ss-interface-scale: 1;
  --ss-interface-scale-inverse: 1;
}

.tlui-layout,
.ss-chrome {
  zoom: var(--ss-interface-scale);
}

/* Menus, dialogs, tooltips and toasts portal OUT of .tlui-layout, so they
 * never inherit its zoom. Donor: interface-settings.css:37-43. */
.tl-container > * > .tlui-menu,
.tlui-popover__content,
.tlui-dialog__positioner,
.tlui-tooltip,
.tlui-toast__container {
  zoom: var(--ss-interface-scale);
}

/* Base UI portals to document.body, outside .tl-container entirely. The
 * zoom goes on the POPUP, never the Positioner — Floating UI writes real
 * viewport px into the positioner's transform, and zooming that would
 * multiply them the same way it multiplies the pill's translate. */
[data-slot="dropdown-menu-content"],
[data-slot="dropdown-menu-sub-content"],
[data-slot="context-menu-content"],
[data-slot="popover-content"],
[data-slot="dialog-content"],
[data-slot="tooltip-content"] {
  zoom: var(--ss-interface-scale);
}

/* ...but a surface positioned from tldraw's own MEASURED screen
 * coordinates must be exempt. `zoom` establishes a new coordinate scale,
 * so a child placed at translate(300px, 200px) inside zoom: 1.25 paints at
 * (375, 250) — MEASURED, /tmp/zoomprobe.html. That is right for chrome laid
 * out against the window and wrong for chrome positioned from the camera.
 * Cancelling the layer's zoom puts it back into real pixels; the pill then
 * re-applies the scale to its own painting, about its own anchor, as a
 * transform (see floatingToolbar.tsx's `scale` prop).
 */
.ss-chrome [data-slot="floating-toolbar"] {
  zoom: var(--ss-interface-scale-inverse);
}
```

No rule touches `.tl-canvas`, `.tl-html-layer`, `.tl-svg-container` or `.tl-overlays`. **Canvas does not scale.**

---

## 3. Exactly which layers need the inverse counter-zoom

Only **one**, and only because it is the only bbox-ui surface whose position is a per-frame screen measurement.

### 3a. The floating pill — counter-zoom, REQUIRED

`apps/systemsketch/src/chrome/floatingToolbar.tsx:96-113` reads `editor.getSelectionRotatedScreenBounds()` and subtracts `editor.getViewportScreenBounds()` to get a **real viewport-pixel** anchor. That number is handed to `placeFloatingToolbar`, and the trunk paints it as an inline `transform: translate(${x}px, ${y}px)` (`apps/storybook-basics/src/components/floatingToolbar.tsx:162`).

**What breaks without the counter-zoom:** measured, the pill lands at `x × scale, y × scale`. At 160% with a selection at screen (600, 400) the pill paints at (960, 640) — off the selection, probably off the viewport. It gets *worse* the further from the origin the selection is, which reads to a user as "the pill drifts as I pan".

**The fix, in three coupled edits:**

**(i) Trunk — add a `scale` prop** to `apps/storybook-basics/src/components/floatingToolbar.tsx`. The kit writes the transform *inline*, so a CSS rule cannot compose the scale onto it — an inline `transform` wins over any stylesheet. This is why the donor wrote `--systemsketch-selection-menu-x/y` custom properties instead (`SelectionContextualMenu.tsx:202-206`) and left the transform to CSS; the bbox-ui kit's contract is props-in/DOM-out, so the prop is the right seam here:

```tsx
  /**
   * The host's interface-scale factor (1 = 100%). Composed onto the
   * translate about `transform-origin: 0 0`, so the pill grows from the
   * exact point the placement policy put it and never walks off the
   * selection. Ported from /home/bam/systemsketch/src/chrome/
   * systemsketch-chrome.css:838-846.
   *
   * WHY a prop and not CSS: this component writes `transform` INLINE, and
   * an inline transform beats any stylesheet rule — the donor could use
   * CSS only because it wrote x/y as custom properties instead.
   */
  scale?: number;
```

```tsx
style={{
  transform: `translate(${x}px, ${y}px)${scale !== undefined && scale !== 1 ? ` scale(${scale})` : ""}`,
  transformOrigin: "0 0",
  maxWidth,
}}
```

`transform-origin: 0 0` is not optional: the placement policy positions the pill **by its top-left** and measures the scaled size (`floatingToolbar.placement.ts` clamps `x` into `[MARGIN, viewport.w - menu.w - MARGIN]`). Any other origin moves the anchor.

**(ii) Host — pass it, and pass it to the width cap too.** `apps/systemsketch/src/chrome/floatingToolbar.tsx:209` currently drops the second argument:

```tsx
// before
maxWidth={geometry ? floatingToolbarMaxWidth({ w: geometry.vw, h: geometry.vh }) : undefined}
// after
scale={scale}
maxWidth={geometry ? floatingToolbarMaxWidth({ w: geometry.vw, h: geometry.vh }, scale) : undefined}
```

`floatingToolbarMaxWidth(viewport, scale)` already exists with exactly this signature (`apps/storybook-basics/src/components/floatingToolbar.placement.ts:212`) and its doc comment already explains why. Without it, at 160% a cap of 860px paints at 1,376px — wider than the viewport it was computed to fit. This is the donor's Codex round-2 and round-4 finding, already ported, just unused.

**(iii) The counter-zoom** — the `.ss-chrome [data-slot="floating-toolbar"] { zoom: inverse }` rule in §2. Measured end to end: host `zoom:1.25` × pill `zoom:0.8` × `translate(300,200) scale(1.25)` paints at exactly (300, 200), 250×50.

### 3b. The corner cluster — NO counter-zoom; convert its measurement inputs instead

`placeCornerCluster` (`apps/systemsketch/src/chrome/overlay.tsx:92-128`) is **not** anchored to a camera coordinate. It is anchored to container edges and avoids two obstacles — tldraw's licence watermark and the dock — both read with `getBoundingClientRect` (`:158-161, :163-175`). Its output is applied as plain CSS `right`/`bottom` (`:361-365`).

**What breaks:** two separate errors.

1. **Ruler mismatch.** `:168` passes `cluster: { width: el.offsetWidth, height: el.offsetHeight }` while `:167` passes `container: rectOf(container)` — `getBoundingClientRect`. **Measured: 150 vs 187.5 at 125%.** The placement math believes the cluster is 150px wide when it paints 187.5px. Overlap detection against the watermark is wrong by 37.5px, `spanLeft` is wrong, and the cluster lands **on top of tldraw's licence notice** — the exact thing `:74-82` calls a hard wall ("Covering is removing").
2. **Output re-inflation.** `right: 8` written inside the zoomed layer paints at 10px at 125%. For the `corner` candidate that is *correct and wanted* (the inset should grow with everything else). For `beside-licence` / `above-licence` / `above-dock`, whose offsets are derived from real-px obstacle rects, it is wrong.

**The fix — convert at the seam, once.** Make `rectOf` container-relative and scale-aware, so every rect entering `placeCornerCluster` is in the **layer's local units**. Then `CORNER_INSET` stays 8 local px (and grows on screen, matching every other inset), and the outputs apply directly with no conversion:

```ts
/** A rect in the CHROME LAYER's own coordinate space: container-relative,
 *  divided by the interface scale.
 *
 *  WHY not raw getBoundingClientRect: `.ss-chrome` carries `zoom:
 *  var(--ss-interface-scale)`, so a CSS length written inside it paints at
 *  length * scale (MEASURED: `right: 8px` at 125% paints 10px from the
 *  edge). `placeCornerCluster`'s inputs and outputs therefore have to live
 *  in LOCAL units, not screen units. Converting here — at the one boundary
 *  where screen measurements enter — keeps `CORNER_INSET` a single honest
 *  8 that scales with the rest of the chrome, instead of scattering
 *  `/ scale` across four candidate branches.
 *
 *  WHY the cluster is measured with getBoundingClientRect().width / scale
 *  and not offsetWidth: offsetWidth reports the UNZOOMED border box
 *  (MEASURED: 150 vs 187.5 at 125%), which silently under-reports the
 *  painted cluster and walks it onto tldraw's licence watermark.
 */
function rectIn(container: Element, el: Element, scale: number): CornerRect {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    left: (r.left - c.left) / scale,
    top: (r.top - c.top) / scale,
    right: (r.right - c.left) / scale,
    bottom: (r.bottom - c.top) / scale,
  };
}
```

`measure()` at `:163-175` becomes:

```ts
const el = cluster.current;
if (!el) return;
const c = container.getBoundingClientRect();
const self = rectIn(container, el, scale);
const next = placeCornerCluster({
  container: { left: 0, top: 0, right: c.width / scale, bottom: c.height / scale },
  cluster: { width: self.right - self.left, height: self.bottom - self.top },
  watermark: watermark ? rectIn(container, watermark, scale) : null,
  obstacles: dock ? [rectIn(container, dock, scale)] : [],
});
```

`placeCornerCluster` itself is **unchanged** — every expression in it is a difference of same-space values.

### 3c. Everything else in `.ss-chrome` — plain zoom, nothing to do

| Surface | Positioning | Verdict |
|---|---|---|
| `SystemSketchChromeBar` | `absolute top-2 left-2` (`overlay.tsx:325`) | CSS-anchored → scales correctly under zoom |
| `SystemSketchPanel` | `absolute top-2 right-2 bottom-[6.5rem] w-[340px] max-w-[calc(100%-1rem)]` (`panels.tsx:122`) | CSS-anchored. `100%` resolves against the zoomed containing block in local units, so the max-width stays right. |
| `SystemSketchDevTools` | portals to `document.body` via Base UI | covered by the `[data-slot=…]` rules |
| `kit.Overlay` (in-flight wire) | tldraw page coordinates | **Must stay unscaled.** It traces the board. It is a sibling *inside* `.ss-chrome`, so it needs `zoom: var(--ss-interface-scale-inverse)` too — same class of exemption as the donor's `.systemsketch-depth-mask`, which "traces the board itself and therefore does not re-apply it at all" (`interface-settings.css:23-25`). Add its selector to the inverse rule and give it **no** compensating transform. |

---

## 4. `zoom` vs `transform: scale` — which, where, why

**`zoom` for the two chrome hosts. `transform: scale` for the pill only.** This is the donor's split verbatim, and both halves are forced.

| | `zoom` | `transform: scale` |
|---|---|---|
| Reflows | **Yes** — percentages, `min()`/`max()`, `100vw`, flex wrap all re-resolve in the new coordinate scale | No — the box is laid out once, then painted bigger |
| Hit-testing | Native and exact (it is a layout scale) | Correct in Chrome, but the layout box and the painted box disagree, so anything reading `offsetWidth` is wrong |
| `getBoundingClientRect` | Returns real painted px | Returns real painted px |
| `offsetWidth` | Returns **local, unzoomed** px (measured 150 vs 187.5) | Returns the untransformed px |
| Moves absolute anchors | **Yes** — `translate(300px)` inside `zoom:1.25` paints at 375 (measured) | It composes, so it can be corrected about a chosen origin |
| Fires `ResizeObserver` on change | **No** (measured — see §5) | **No** (measured) |

**Why `zoom` wins for the hosts.** A chrome layer at 160% must genuinely *reflow* — the pill wraps to two rows, a panel's `max-w-[calc(100%-1rem)]` must re-resolve, the dock's `flex-wrap` must wrap. `transform` would paint a 100%-laid-out bar at 160% and run it off the screen edge with no wrap. Donor: `interface-settings.css:6-7` — *"tldraw keeps its interface in a sibling layer to the canvas. Scaling that coordinate system preserves board geometry and canvas zoom."*

**Why `transform` wins for the pill.** The pill's position is not CSS — it is a screen coordinate recomputed every camera frame. Under `zoom` that coordinate is multiplied; under `transform: scale` with `transform-origin: 0 0` it is preserved exactly, and the pill grows *from* the placed point. Donor, `systemsketch-chrome.css:838-842`: *"Placed in real viewport pixels, then scaled about that exact point, so the interface setting makes the menu bigger without moving it off the selection. The origin has to be the top-left corner because the placement policy positions the menu by its top-left and measures the scaled size."*

**The trade-off you are accepting, stated plainly.** Because the pill is `transform`-scaled, its CSS `max-width` is in *local* units and re-inflates by the scale when painted. That is not a hypothetical — it is a shipped Codex finding on the donor (rounds 1–4), and the whole reason `floatingToolbarMaxWidth` takes a `scale` parameter. Passing it (§3a-ii) is what pays for choosing `transform` here.

---

## 5. Gotchas, with concrete mitigations

### 5a. `getBoundingClientRect` in the placement loops — safe, and one place is not

**The pill's loop is already correct.** `apps/systemsketch/src/chrome/floatingToolbar.tsx:137` uses `node.getBoundingClientRect()`, which measured **250×50 for a 200×40 box at 1.25** — the painted size, which is exactly what `placeFloatingToolbar` needs to clamp against the viewport. **No change.** The anchor side (`:96-113`) reads from the editor, not the DOM, so it is unaffected. `bottomObstacleTop` is a constant (`DOCK_OBSTACLE_HEIGHT = 96`, `:61`) in the same real-px space as the viewport — but see 5d.

**The corner loop is wrong** — `offsetWidth` at `overlay.tsx:168`. Fixed in §3b.

**Sweep rule for the reviewer:** inside a zoomed or scaled layer, `offsetWidth` / `offsetHeight` / `clientWidth` / `clientHeight` are **local** units and `getBoundingClientRect` is **screen** units. Grep both repos for `offsetWidth|offsetHeight` under `apps/systemsketch/src/chrome/` before landing; `overlay.tsx:168` is the only current hit.

### 5b. The ResizeObserver epoch — it is deader than the donor says

**Measured (`/tmp/zoomprobe2.html`): a `ResizeObserver` on the bar fired ZERO times across a `transform` scale change AND across an ancestor `zoom` change.** RO reports the border box in the element's *own* layout units; both mechanisms leave that box identical. The donor only documents the transform half (`SelectionContextualMenu.tsx:114-120`); the zoom half is just as blind.

**So: never drive a re-measure off RO for an interface-scale change. Drive it off the scale value.**

- **Pill** — `apps/systemsketch/src/chrome/floatingToolbar.tsx:146`, change `}, []);` → `}, [scale]);`. The effect re-runs `measure()` in the same commit that paints the new `transform`, so `getBoundingClientRect` returns the new painted size and `size` updates, which is already a dependency of the placement effect at `:174`. This is the donor's `useEffect(() => sizeEpoch.update(e => e + 1), [interfaceScale, sizeEpoch])` in React-effect form.
- **Corner cluster** — add `scale` to the `useLayoutEffect` deps at `overlay.tsx:213`; `useCornerPlacement` takes `scale` as a second argument. Do **not** rely on the `sizes` ResizeObserver at `:177`.

**Do not "fix" this by observing with `box: "device-pixel-content-box"`** — that fires on device-pixel-ratio changes, not on `zoom`, and it would make the pill re-measure on every OS zoom event for no benefit.

### 5c. Inline transform beats CSS

Covered in §3a-i, restated because it is the single most likely way a builder gets this wrong: you cannot add `scale()` to the pill from a stylesheet. `floatingToolbar.tsx:162` writes `transform` inline.

### 5d. `DOCK_OBSTACLE_HEIGHT` is now a lie

`floatingToolbar.tsx:61` hardcodes 96px of bottom-edge dock clearance, derived from an `h-9` row plus padding. Once the dock scales, at 160% it occupies ~150px and the pill will be placed **under** it for a low selection. Two options; take the first:

- **Recommended:** `bottomObstacleTop: geometry.vh - DOCK_OBSTACLE_HEIGHT * scale`. One multiplication, keeps the constant's documented derivation honest, and `geometry.vh` is already real px.
- Rejected: measuring the real dock rect per frame. It adds a DOM read to the camera-rate loop for a value that only changes with the setting, and `:53-60` deliberately errs high already.

### 5e. Scale × inverse is not exactly 1 in float

`interfaceScaleCssValues(110)` → `{scale: "1.1", inverse: "0.9090909090909091"}`; the product is `1.0000000000000002`. Sub-pixel, and the donor ships it. **Do not "fix" it** by rounding either string — both are derived from the same normalized percent, which is the property that matters. Worth knowing only if a pixel-diff test goes flaky at 110% or 130%.

### 5f. Base UI positioners must not be zoomed

The `[data-slot=…]` rules in §2 target the **popup**, never `Menu.Positioner` / `Popover.Positioner` (`dropdown-menu.tsx:66-74`). Floating UI writes real viewport px into the positioner's own transform; zooming it multiplies those the same way it multiplies the pill's translate. Zooming the popup instead changes its measured size, which Floating UI reads *after* layout, so flip/shift stay correct.

---

## 6. Persistence — extend nothing, add nothing

**The brief's instruction to "prefer extending `appearancePreferences`" should be declined, and it is not a close call.**

`apps/storybook-basics/src/components/appearancePreferences.ts:55-90` holds `showZoomButtons`, `directWheelZoom`, `scrollDownZoomsIn`, `modifierWheelZoomsOppositely`, `wheelZoomSensitivityPercent` — five wheel/zoom **input** fields. Its own header, `:4-12`, states the situation: *"MISNOMER, KEPT ON PURPOSE… every field here is wheel/zoom INPUT behaviour, not visual appearance."* There is no `interfaceScale`-ish field. The Settings *category* is called Appearance and renders both; the *storage models* are separate on purpose.

**The correct model already exists and is already correct:**

| | Value |
|---|---|
| File | `apps/storybook-basics/src/components/interfaceScale.ts` |
| Key | `systemsketch.interface-scale.v1` (`:33`) — byte-identical to the donor, deliberately, so an existing browser keeps its preference |
| Shape | `{ version: 1, percent: number }` (`:104`) |
| Range | 80–160, step 5, default 100 (`:34-37`) |
| Presets | `[90, 100, 110, 125, 150]` (`:40`) |
| Tests | `interfaceScale.test.ts`, already green, already pins the key at `:22` |

**Do not** fold it into `systemsketch.appearance.v1`. That would (a) break every browser that already saved the key, (b) put a per-viewer display preference into a record whose parse contract resets *all five* wheel fields when any one field is present-but-wrong (`appearancePreferences.ts:131-141`) — a corrupt scale would silently reset the user's wheel direction — and (c) contradict the donor, which keeps the two files apart for exactly that reason.

### What is actually missing: a host store

The trunk model deliberately drops React (`interfaceScale.ts:12-19`: *"NOTHING FROM REACT TRAVELS… A host that wants a live, subscribable value writes its own store around `readInterfaceScale`/`writeInterfaceScale`."*). Today the only consumer is `usePersistedValue` inside `SystemSketchSettings` (`appSettings.tsx:115-131, :188`) — local `useState`, invisible to `App.tsx`. **It persists; it just cannot be read by the element that needs to carry the variables.**

New file **`apps/systemsketch/src/chrome/interfaceScaleStore.ts`**, modelled on the existing host-store precedent `apps/systemsketch/src/chrome/preferences.ts:16-21` (*"WHY a module store (subscribe + snapshot) and not React state… two surfaces write it"*):

```ts
// WHY a module store rather than React state in the settings dialog: two
// surfaces need this value and they are not in the same subtree — the
// Settings slider WRITES it (chrome/appSettings.tsx), and App.tsx's <main>
// READS it to stamp --ss-interface-scale on the root. The dialog unmounts;
// the root does not. Same two-consumer problem ./preferences.ts solves the
// same way. The trunk model refuses to own this on purpose
// (@trunk/components/interfaceScale's header: "a host that wants a live,
// subscribable value writes its own store").
import { useSyncExternalStore } from "react";
import {
  DEFAULT_INTERFACE_SCALE,
  readInterfaceScale,
  writeInterfaceScale,
} from "@trunk/components/interfaceScale";

function viewerStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

let snapshot: number | null = null;
const listeners = new Set<() => void>();

export function getInterfaceScalePercent(): number {
  if (snapshot === null) snapshot = readInterfaceScale(viewerStorage());
  return snapshot;
}

export function setInterfaceScalePercent(percent: number): number {
  // writeInterfaceScale returns the NORMALIZED value it stored (clamped to
  // 80-160, snapped to 5), so the slider and the disk can never disagree —
  // the same reason appSettings.tsx's usePersistedValue re-reads.
  const next = writeInterfaceScale(viewerStorage(), percent);
  if (next === getInterfaceScalePercent()) return next;
  snapshot = next;
  for (const listener of listeners) listener();
  return next;
}

export function useInterfaceScalePercent(): number {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    getInterfaceScalePercent,
    () => DEFAULT_INTERFACE_SCALE,   // SSR / test snapshot
  );
}

/** The factor, not the percent — what CSS and the placement loops want. */
export function useInterfaceScale(): number {
  return useInterfaceScalePercent() / 100;
}
```

Then in `appSettings.tsx`, replace line 188:

```tsx
// before
const [interfaceScalePercent, setInterfaceScale] = usePersistedValue<number>(readInterfaceScale, writeInterfaceScale);
// after
const interfaceScalePercent = useInterfaceScalePercent();
const setInterfaceScale = setInterfaceScalePercent;
```

The `readInterfaceScale`/`writeInterfaceScale` imports at `:38` move to the new store. Nothing in `settingsCategories.tsx:259-283` changes — the Settings UI (slider, A/A legend, five presets, "Reset to 100%") is already a faithful port and needs no edit.

`usePersistedValue` stays for `aliases` (`:189`).

---

## 7. Should the default change? No — the BASE should rise

**Measured, from the stylesheets themselves, not from screenshots.**

| | Tool cell | Icon | Source |
|---|---|---|---|
| **tldraw 5.3.2 stock** | **48 × 48** hit target, **40 × 40** visible chip (`::after { inset: 4px }`) | **18 px** | `tldraw.css:1872-1881`, `:2034-2038` |
| **bbox-ui today** | **32 px tall × 36 px wide** (`h-8 px-2.5`) | **16 px** (`size-4`) | `apps/storybook-basics/src/components/toolbar.tsx:91`, `:88` |
| Excalidraw (Zach's measurement) | 40 × 40 | — | brief |
| tldraw.com (Zach's measurement) | 44 × 44 | — | brief — sits between the 48px hit target and the 40px chip, consistent |

**The donor's 100% was 100% of a LARGER base.** The donor renders tldraw's stock `DefaultToolbar` — a 48px hit target with a 40px chip — and its scale setting multiplied *that*. bbox-ui at 100% is **32px against the donor's 48px hit target (0.67×) and 40px chip (0.80×)**. bbox-ui at 100% is roughly *the donor at 67–80%*, i.e. below the donor's own 80% floor.

**So: keep `DEFAULT_INTERFACE_SCALE = 100`. Raise the base.** Three reasons, in order of weight:

1. **A default of 125% would make "Reset to 100%" a lie.** The whole contract of this control — donor's own copy, ported verbatim to `settingsCategories.tsx:280` — is that 100% is the designed size. Shipping a non-100 default means the app never looks the way it was designed at the value the reset button returns to.
2. **It burns the headroom Zach actually needs.** From a 125% default, the 160% ceiling leaves only 1.28× of remaining growth. From 100% on a correct base it leaves 1.6×. He is asking for this *because of a 4K display*; the headroom is the feature.
3. **It fixes the wrong layer.** 32px is a *component* bug, not a preference. Every consumer of the trunk — the Storybook, the docs app, the registry — is shipping a 32px tool cell today.

### The base fix, precisely

The root cause is one missing provider. `ToolDock` renders `<Toolbar aria-label="Tools">` (`apps/storybook-basics/src/components/toolDock.tsx:417`) with no `BarSizeProvider` above it, so `useBarSize()` returns `undefined`, `resolvedSize` falls to `"default"`, and every cell is `h-8` (`toolbar.tsx:81, :91`).

The existing ladder tops out too low: `BAR_SIZE_TO_BUTTON_SIZE` (`barSize.tsx:79-84`) clamps `xl` → `lg`, and `lg` is `h-9` = **36px** (`toolbar.tsx:92`). So the ladder cannot currently express tldraw's 40px chip.

**Recommended, two edits, both in the trunk (where `CLAUDE.md:61` says new design work belongs):**

1. Add the fourth rung to `ToolbarButton` — `resolvedSize === "xl" && "h-10 px-3"` (40px, matching tldraw's visible chip) — and stop `BAR_SIZE_TO_BUTTON_SIZE` clamping `xl` to `lg`. Note `BAR_HEIGHT` (`bar.tsx:62`) already declares an `xl` rung at 60; the button scale is the only ladder missing it.
2. Give `ToolDock` a `size?: BarSize` prop defaulting to `"xl"`, wrapping its `<Toolbar>` in `<BarSizeProvider size={size}>`, and bump the dock's icons from `size-4` to `size-[18px]` at that rung to match tldraw's 18px.

**Reversible smaller step, if the fourth rung is judged out of scope for this lane:** wrap the dock in `<BarSizeProvider size="lg">` from the host (`apps/systemsketch/src/chrome/dock.tsx:280`). That is **one line**, gets to 36px, and the remaining 40/36 = **111%** is one click off the existing 110% preset. I would still land the `xl` rung, because 111% is a workaround Zach would have to re-apply on every fresh profile.

**Say this out loud in the handoff:** raising the base makes *every* surface that consumes the Bar cascade taller, not just the dock. That is a visual change to the chrome bar and the status strip too, and it should be screenshotted in the real app before and after — `CLAUDE.md:351` already requires an in-app capture after a trunk change.

---

## 8. Landing order (these are not independent)

1. **Barrier.** `interfaceScaleStore.ts` + `App.tsx` variable carrier + `interfaceScale.css`. Everything else imports the store. Land alone.
2. Pill: trunk `scale` prop → host `scale=` + `floatingToolbarMaxWidth(…, scale)` + `[scale]` deps + `DOCK_OBSTACLE_HEIGHT * scale`. Trunk edit is a contract change → barrier against anything else importing `floatingToolbar`.
3. Corner cluster: `rectIn`, `useCornerPlacement(cluster, scale)`, deps. Disjoint from 2.
4. `appSettings.tsx:188` swap. Disjoint.
5. Base size (§7). Separate unit of work, separate review — it changes pixels everywhere and should not be entangled with the scale plumbing.

**Acceptance must be spatial, not DOM-presence.** Commit the assertions before dispatching any builder: at 100% and again at 160%, with a shape selected at a known page point, assert `pill.getBoundingClientRect()` sits within 1px of the same *screen* anchor at both scales and its height is `40 × scale ± 1`; assert the corner cluster does not overlap `.tl-watermark_SEE-LICENSE`'s rect at either scale; assert `.tl-canvas`'s rect and `editor.getCamera().z` are byte-identical at both.


## Report rows

| Feature | SystemSketch / FigJam | bbox-ui today | Change needed |
|---|---|---|---|
| Storage model + key | `systemsketch.interface-scale.v1`, `{version:1,percent}`, own module `src/settings/interfaceScale.ts:4,:11-14,:52`. Separate from `systemsketch.appearance.v1`. | IDENTICAL — already ported character-for-character at `apps/storybook-basics/src/components/interfaceScale.ts:33,:104`, and already written on every slider move via `appSettings.tsx:188`. The value persists today. | None. Do NOT extend `appearancePreferences` — its five fields are wheel/zoom INPUT behaviour (`appearancePreferences.ts:55-90`; its own header at :4-12 calls the name a deliberate misnomer) and its parse contract resets all five when any one is corrupt. |
| Range / step / default / presets | 80–160, step 5, default 100, presets 90/100/110/125/150 (`interfaceScale.ts:5-9`) | IDENTICAL (`interfaceScale.ts:34-40`), pinned by `interfaceScale.test.ts:22` | None. |
| Settings UI | Own `Interface` category, slider + A/A legend + 5 presets + "Reset to 100%" (`InterfaceSettings.tsx:793-852`) | Complete and faithful, folded into Appearance (`settingsCategories.tsx:259-283`) | None. The control is not the bug. |
| Live subscribable value | `useSyncExternalStore` module singleton — `getInterfaceScale`/`updateInterfaceScale`/`useInterfaceScale` (`interfaceScale.ts:64-92`) | MISSING. The trunk drops React on purpose (`interfaceScale.ts:12-19`). The only reader is `usePersistedValue`'s local `useState` inside the Settings dialog (`appSettings.tsx:115-131`), invisible to `App.tsx`. | New `apps/systemsketch/src/chrome/interfaceScaleStore.ts`, modelled on the existing host-store precedent `chrome/preferences.ts:16-21`. Swap `appSettings.tsx:188` to consume it. |
| Which element carries the variables | `.systemsketch-app` — the app root, which is NEVER zoomed because it contains the canvas (`App.tsx:312-319`) | Nothing. `flightRecorder.ts:828-830` already queries `[data-interface-scale]` and matches zero elements. | Stamp `--ss-interface-scale`, `--ss-interface-scale-inverse` and `data-interface-scale` on the existing `<main>` at `apps/systemsketch/src/App.tsx:145`. |
| Which element gets the zoom | TWO hosts, not one: `.tlui-layout` AND `.systemsketch-surface-host` (`interface-settings.css:8-11`). Both are siblings of `.tl-canvas`. | Nothing. bbox-ui splits the same way — `Toolbar: SystemSketchDock` renders inside `.tlui-layout` (tldraw 5.3.2 `TldrawUi.mjs:118,:152`), `InFrontOfTheCanvas: Overlay` renders `.ss-chrome` (`overlay.tsx:304`). | `.tlui-layout, .ss-chrome { zoom: var(--ss-interface-scale) }`. `.ss-chrome` alone would leave the TOOL DOCK at 100% — the surface Zach is looking at. |
| Portaled menus / dialogs / toasts | Explicitly re-zoomed: `.tl-container > * > .tlui-menu`, `.tlui-popover__content`, `.tlui-dialog__positioner`, `.tlui-tooltip`, `.tlui-toast__container` (`interface-settings.css:37-43`) | Nothing. bbox-ui has BOTH kinds: tldraw's own shortcuts dialog (`appSettings.tsx:155-157`) and Base UI portals to `document.body` (`dropdown-menu.tsx:65`). | Keep the donor's five tldraw selectors verbatim, plus `[data-slot="dropdown-menu-content"\|"context-menu-content"\|"popover-content"\|"dialog-content"\|"tooltip-content"]`. Zoom the POPUP, never the Positioner — Floating UI writes real px into the positioner's transform. |
| Floating pill — counter-zoom | `.systemsketch-selection-menu { zoom: inverse }` then `transform: translate(var(--x), var(--y)) scale(var(--scale)); transform-origin: 0 0` (`interface-settings.css:29-35`, `systemsketch-chrome.css:838-846`) | BREAKS. `floatingToolbar.tsx:96-113` computes a real-viewport-px anchor; the trunk paints it as an inline `transform: translate()` (`floatingToolbar.tsx:162`). MEASURED: `translate(300px,200px)` inside `zoom:1.25` paints at x=375. At 160% the pill drifts further the further you pan. | Counter-zoom `[data-slot="floating-toolbar"]`, add a `scale` prop to the trunk component composing `scale()` + `transform-origin: 0 0` (a CSS rule CANNOT do it — the inline transform wins), pass `scale` from the host. MEASURED end to end: paints at exactly (300, 200). |
| Pill width cap | `max-width: max(160px, 100vw - 2*margin) / var(--interface-scale)` (`systemsketch-chrome.css:919`); `selectionMenuMaxWidth(viewport, scale)` (`floatingToolbarPlacement.ts:169-177`). Four rounds of Codex findings. | The port ALREADY takes the parameter — `floatingToolbarMaxWidth(viewport, scale = 1)` at `floatingToolbar.placement.ts:212` — and the host ALREADY fails to pass it (`floatingToolbar.tsx:209`). At 160% an 860px cap paints at 1,376px. | One argument: `floatingToolbarMaxWidth({w: geometry.vw, h: geometry.vh}, scale)`. |
| Re-measure trigger (the RO epoch) | RO on the pill plus an explicit `useEffect(() => sizeEpoch.update(e => e+1), [interfaceScale])`, because "a transform does not fire a ResizeObserver" (`SelectionContextualMenu.tsx:104-120`) | RO only, `useLayoutEffect(..., [])` at `floatingToolbar.tsx:146`. MEASURED: RO fired ZERO times across a transform-scale change AND ZERO across an ancestor zoom change — blind to BOTH mechanisms, which is stronger than the donor documents. | Change deps to `[scale]` (pill) and add `scale` to `useCornerPlacement`'s deps at `overlay.tsx:213`. Never drive an interface-scale re-measure off ResizeObserver. |
| Corner cluster placement | No equivalent — the donor's bottom-right is tldraw's own chrome inside `.tlui-layout`. | BREAKS TWICE. `overlay.tsx:167-168` mixes `rectOf(container)` (getBoundingClientRect, screen px) with `el.offsetWidth` (MEASURED: local px — 150 vs 187.5 at 125%), so the math under-reports the cluster by 37.5px and walks it onto tldraw's licence watermark — the wall `overlay.tsx:74-82` calls non-negotiable. Its `right`/`bottom` outputs then re-inflate by the scale. | Convert at the seam: a `rectIn(container, el, scale)` that returns container-relative local units, used for all four rects. `placeCornerCluster` itself is unchanged — every expression in it is a same-space difference. No counter-zoom: the cluster is edge-anchored and SHOULD reflow. |
| Dock obstacle for the pill | Measured live from the DOM — `BOTTOM_CHROME_SELECTOR` + `getBoundingClientRect()` (`SelectionContextualMenu.tsx:184-187`) | Hardcoded `DOCK_OBSTACLE_HEIGHT = 96` (`floatingToolbar.tsx:61`), derived from an `h-9` row. Once the dock scales, at 160% it occupies ~150px and the pill is placed under it. | `bottomObstacleTop: geometry.vh - DOCK_OBSTACLE_HEIGHT * scale`. Rejected the alternative of measuring the dock per frame: a DOM read at camera rate for a value that only changes with the setting. |
| In-flight wire overlay | `.systemsketch-depth-mask` gets the inverse and NO compensating transform — "traces the board itself and therefore does not re-apply it at all" (`interface-settings.css:23-25`) | `kit.Overlay` (`overlay.tsx:23`) paints the in-flight cable in tldraw PAGE coordinates, inside `.ss-chrome`. | Add its selector to the inverse-zoom rule and give it no transform. Otherwise the cable detaches from the ports it connects. |
| Canvas | Never scaled — neither zoomed element contains `.tl-canvas` | Same structure, so the same guarantee holds once the rules are scoped to `.tlui-layout` / `.ss-chrome` | None, but assert it: `.tl-canvas`'s rect and `editor.getCamera().z` must be byte-identical at 100% and 160%. |
| Base tool-cell size | tldraw 5.3.2 stock `DefaultToolbar` — 48×48 hit target, 40×40 visible chip (`::after { inset: 4px }`), 18px icon (`tldraw.css:1872-1881`, `:2034-2038`). 100% meant 100% of THAT. | 32px tall × 36px wide, 16px icon. `ToolDock` renders `<Toolbar>` with no `BarSizeProvider` (`toolDock.tsx:417`), so `useBarSize()` → undefined → `resolvedSize = "default"` → `h-8` (`toolbar.tsx:81,:91`). bbox-ui at 100% is the donor at 0.67–0.80× — below the donor's own 80% FLOOR. | Keep the default at 100; raise the base. The `lg` rung is only `h-9` = 36px and `BAR_SIZE_TO_BUTTON_SIZE` clamps `xl` → `lg` (`barSize.tsx:79-84`), so add an `xl` rung (`h-10 px-3` = 40px, matching tldraw's chip), stop the clamp, and give `ToolDock` a `size` prop defaulting to `xl`. Reversible one-liner if the rung is out of scope: `<BarSizeProvider size="lg">` around the dock → 36px, one click from the existing 110% preset. |

## Risks

- The pill's scale CANNOT be applied from CSS. `apps/storybook-basics/src/components/floatingToolbar.tsx:162` writes `transform: translate(...)` INLINE, and an inline transform beats any stylesheet rule. The donor could use CSS only because it wrote x/y as custom properties and left the transform to the sheet (`SelectionContextualMenu.tsx:202-206`). A builder who adds a `.ss-chrome [data-slot=floating-toolbar] { transform: scale(...) }` rule will see it silently do nothing — and worse, will have destroyed the translate if they win the specificity fight. The scale must travel as a prop.
- `offsetWidth` and `getBoundingClientRect` are different rulers inside a zoomed layer, and the codebase already mixes them. MEASURED in Chrome 153: at `zoom:1.25` a 150px box reports `offsetWidth` 150 and `getBoundingClientRect().width` 187.5. `apps/systemsketch/src/chrome/overlay.tsx:167-168` feeds one of each into the same function. The failure is not cosmetic: the cluster is under-reported by 37.5px at 125%, overlap detection against tldraw's licence watermark returns false when it should return true, and the status strip lands on top of the licence notice — which `overlay.tsx:74-82` documents as a licence-terms violation ("Covering is removing"). Grep for `offsetWidth|offsetHeight|clientWidth|clientHeight` under `chrome/` before landing.
- ResizeObserver is blind to BOTH mechanisms, not just to transforms. MEASURED: zero callbacks across a `transform: scale` change AND zero across an ancestor `zoom` change — RO reports the border box in the element's own layout units, which neither mechanism alters. The donor only documents the transform half (`SelectionContextualMenu.tsx:114-116`). A builder who reasons "zoom affects layout, so RO will fire" will ship a pill that stays at its old measured size until the next unrelated resize, and lands mis-centred. The epoch must be driven off the scale VALUE (`[scale]` in the effect deps), never off RO. Do not substitute `box: "device-pixel-content-box"` — it fires on DPR changes, not on zoom.
- Zooming a Base UI Positioner instead of its Popup breaks every portaled menu. Floating UI writes real viewport pixels into the positioner's own transform; zooming that element multiplies them exactly the way it multiplies the pill's translate, and menus fly off their triggers at a rate proportional to distance from the origin. The rules must target `[data-slot="...-content"]` (the `Menu.Popup`, `dropdown-menu.tsx:76`), never the `Positioner` at `:66`.
- The counter-zoom factor must be exactly the reciprocal of the host zoom, computed from the same normalized percent. MEASURED the mismatched case: host `zoom:1.25` with child `zoom:0.625` and `scale(1.6)` put a translate(300,200) anchor at 234.38 instead of 300 — the anchor walks, and it walks further the further you pan. `interfaceScaleCssValues` (`interfaceScale.ts:118-124`) already derives both strings from one normalized value, which is the property that matters; the float product is 1.0000000000000002 at 110% and must NOT be 'fixed' by rounding either string independently.
- `DOCK_OBSTACLE_HEIGHT = 96` (`floatingToolbar.tsx:61`) becomes wrong the moment the dock scales. At 160% the dock occupies roughly 150px and the pill will be placed underneath it for a low selection — an unreachable toolbar, which the constant's own doc comment (`:53-60`) calls out as the failure it exists to prevent. Multiply it by the scale; do not switch to a per-frame DOM measurement of the dock.
- Raising the base size is NOT contained to the dock. The `xl` rung and the `BAR_SIZE_TO_BUTTON_SIZE` clamp change (`barSize.tsx:79-84`) affect every surface consuming the Bar cascade — the chrome bar, the status strip, the pill's own clusters — and every other trunk consumer (Storybook, docs app, registry). Land it as a separate unit of work with before/after in-app captures, not entangled with the scale plumbing. `CLAUDE.md:351` already requires the capture after a trunk change.
- A non-100 default would break the control's own contract. `settingsCategories.tsx:280` ships the donor's literal 'Reset to 100%' label; a 125% default means the app never renders at its designed size at the value reset returns to, and it burns 4K headroom (160/125 = 1.28x remaining vs 1.6x). The 32px cell is a component defect (one missing `BarSizeProvider`), not a preference default.
- Out of scope but found while verifying, and it will be blamed on this change: `apps/systemsketch/src/chrome/floatingToolbar.tsx:96` uses `editor.getSelectionRotatedScreenBounds()`. The donor documents at length (`SelectionContextualMenu.tsx:139-154`) that this is NOT the axis-aligned screen box — for a single shape it is the local unrotated w/h repositioned at the page-space point of the rotated top-left corner — and that feeding it in as an axis-aligned rect is exactly the bug Zach reported on 2026-09-15 (pill overlapping a rotated selection). The donor uses `getSelectionScreenBounds()`. Scaling will make the existing mis-placement more visible; fix it in the same lane or say explicitly that it predates this work.
- Landing order is a real constraint, not a preference. The store + variable carrier + stylesheet is a BARRIER — every other edit imports the store. The trunk `scale` prop on `floatingToolbar.tsx` is a second barrier against anything else importing that component. Two lanes editing the pill and the corner cluster in parallel over an unlanded store would each be individually correct and jointly wrong.
