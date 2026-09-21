# Parity backlog triage — 2026-09-21

**What this is.** Every wave-2/3/4 item at noticeability **5** and **4**, read against the
code as it stands on `claude/floating-toolbars-2026-09-20`, and classified. The backlog's
own `proofMissing` greps were NOT trusted: each item was judged by asking what the
capability would look like in this codebase and then going to read that code.

This document decides what future waves build. Where I was not sure, the verdict is
`UNSURE` rather than a guess.

## Counts

| | |
|---|---|
| Items in waves 2/3/4 | **430** |
| Triaged here (noticeability 5 and 4, complete) | **201** |
| Not triaged (noticeability 1–3) | **229** |

| verdict | count | share of triaged |
|---|---|---|
| **ABSENT** — genuinely not built | 110 | 54% |
| **DUPLICATE-OF** — another id covers the same capability | 49 | 24% |
| **PREMISE-FALSE** — the item describes the codebase wrongly | 27 | 13% |
| **ALREADY-DONE** — shipped, with a file:line that satisfies it | 14 | 6% |
| **UNSURE** | 1 | — |

**90 of 201 items (44%) should not be dispatched as written.**

The hand spot-check predicted "roughly a fifth semantically duplicated by work already
done", and that number is confirmed exactly: **ALREADY-DONE + PREMISE-FALSE = 41 of 201
(20%)** describe a codebase that no longer exists. The other 49 are *internal* duplicates —
the same capability filed under two to seven ids, mostly because the same absence was
re-observed from a different surface each time a lane looked at it. The mechanism behind
both is one thing: `proofMissing` is a grep, greps were written against a tree that has
since moved, and no item was ever re-read after the work landed.

## Read this before dispatching anything

Seven findings that change more than one item each.

1. **There IS an inspector panel.** `apps/systemsketch/src/chrome/panels.tsx:117`
   mounts `@trunk/editor/inspectorPanel` as a third right-rail surface, reachable from
   the rail's own switcher at `:209`. Six items (P-057, P-077, P-089, P-092, P-094,
   P-095) are filed as "there is no inspector panel at all". Five of them are
   PREMISE-FALSE; **P-057 is the one canonical residual** — the schema-driven property
   table. Re-file every inspector-row ask against it.

2. **A cable already has control points, and they travel with the block.**
   P-028 shipped `props.pins` plus `getHandles`/`onHandleDrag`/`onDoubleClickHandle`
   (`shapes/wire/WireShapeUtil.tsx:75,457,485,507`). Five items (P-081, P-085, P-153,
   P-157, P-216) are filed as "grep getHandles → 0 hits". Pins are stored as fractions of
   the endpoint frame *specifically* so a dragged corner moves with the block — which is
   Zach's own complaint, quoted in the code at `:63-66`. What is genuinely left is
   **terminal** handles (P-053) and bends on non-elbow routings.

3. **The multi-line port lane is still unreachable — the dispatch note is wrong.**
   `editMode` defaulting to `"multi"` (`@trunk/components/portEdge.tsx:1275`) only picks
   *which* editor a click opens. The gate is `editingEnabled = editing`
   (`portEdge.tsx:1324`), fed by `spec.editing ?? false`
   (`@trunk/components/blockPort.tsx:472`), and `BlockFace.tsx:500-550` never sets it.
   **P-055 / P-062 / P-088 / P-143 / P-160 are ABSENT, not done.** They are one prop from
   done, but a lane dispatched as "already default" would ship nothing.

4. **The glyph picker shipped, with all three tabs.** `BlockFace.tsx:117` mounts
   `@trunk/editor/glyphPicker`, whose `PickerTab` is `"emoji" | "icons" | "upload"`
   (`glyphPicker.tsx:136`) with a Recent row, paste/drop/file/URL upload and a filter.
   P-117, P-129, P-135 and P-163 are done. The proofs looked at `packages/glyph-picker`,
   which is the wrong copy — the trunk has its own.

5. **Connection validation already gates the gesture.** Ruling 3 landed on 2026-09-21:
   `wireGesture.ts:471` calls `validateConnectionAtLevel(..., currentValidationLevel(), ...)`
   and the hardcoded `allowFanIn: true` is gone. P-180 is done. The caveat is written
   into the code at `chrome/ShareMenu/validationLevelHost.ts:143-174`: six of the nine
   Settings switches reach the board; `allowHiddenPorts`, `allowFanOut` and
   `allowSamePolarity` still do not.

6. **Two items contradict each other and one is ruled out three times over.**
   P-181 ("a press on a wired dot picks up the existing cable") asks for exactly what
   P-106 rules out and what `wireGesture.ts:5-7` implements deliberately. And
   `docs/PARITY-PICKS-2026-09-21.md` records three explicit NOs from Zach, two of which
   are still live as items: P-182 (hide common ports) and P-222/P-228 (hover bead to add a
   port, superseded by the lane). **Four items to delete, not build.**

7. **Three confirmed live bugs hiding among the feature requests.**
   - **P-190**: `ss-block` never overrides `canResizeChildren`, which defaults `true`, so
     resizing an expanded block scales its children. `RegionShapeUtil.tsx:234` already
     fixed the identical problem one line at a time — the block did not.
   - **P-098**: the wire gesture still has no `getEditingShapeId()` / readonly / tool
     check (`wireGesture.ts:323`). This got *worse* since filing, because the block now has
     real in-place text editing to press a dot next to.
   - **P-221**: `createWire.ts:86` creates every cable with no `index`, so cables always
     land on top of the blocks they cross.

## The nine canonical ids the duplicates collapse onto

Dispatch these; everything marked DUPLICATE-OF points at one of them.

| canonical | absorbs | capability |
|---|---|---|
| **P-070** | P-082, P-192, P-193, P-199, P-237 | depth navigation — crumbs, depth badge, back/forward, step in/out |
| **P-074** | P-093, P-109 (schema), P-115, P-175, P-203, P-229, P-233 | definitions & calls / name-based linking |
| **P-055** | P-062, P-088, P-143, P-160 | the multi-line port lane |
| **P-081** | P-085, P-153, P-157, P-216 | authored cable geometry (mostly DONE — see finding 2) |
| **P-010** | P-072, P-140, P-172 | domain right-click menu |
| **P-057** | P-077, P-089, P-092, P-094, P-095, P-138, P-149, P-152, P-196, P-200, P-202, P-218, P-230 | schema-driven inspector content |
| **P-107** | P-158, P-173 | inline / offset port layout |
| **P-064** | P-113, P-132 | one shared completion menu |
| **P-090** | P-198, P-231 | communication view |

## Noticeability 5 — all 57 items

| id | verdict | evidence (file:line) or duplicate-of | why |
|---|---|---|---|
| **P-010** | ABSENT | apps/systemsketch/src/source/sourceContextMenu.tsx:240; App.tsx:75 | Context menu is still stock + one `bbox-source` group. Most of the CAPABILITIES the 40 rows want now exist in the pill (view toggle, edge type, group/ungroup, focus) — so build this as a second door onto existing actions, not as new behaviour. |
| **P-011** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:73 (`labelOf` → `parsePortDeclaration(...).name`) | Proof's line number is stale (53 → 73) but exact in substance: the rail still paints the name half only and the WHY still names the owed fix (a `secondary` on `PortEdgeItem`). See P-119 for the slot that would carry it. |
| **P-012** | PREMISE-FALSE | docs/PARITY-PICKS-2026-09-21.md ruling 1; apps/systemsketch/src/files/session.tsx:411; @trunk/files/workspaceModel.ts:45,53 | The file type is `.bbox` now, not `.systemsketch`, and `.systemsketch` deliberately hands off to the archived app. Envelope + future-format guard are still absent (see P-087) but must be built for `.bbox`. |
| **P-013** | ABSENT | apps/systemsketch/src/shapes/wire/wireGesture.ts:429 (`<= DRAG_THRESHOLD_PX` returns) | Click-move-click cable drawing is genuinely not built; a sub-threshold press is still discarded. |
| **P-014** | PREMISE-FALSE | 21 `markHistoryStoppingPoint` call sites; PortFace.tsx:235 (`beginEdit`); BlockFace.tsx:214,343 | Proof is stale — the port rename path marks, and so do 20 others. Residual is the opposite defect: block title/description mark PER KEYSTROKE, so one rename is N undo steps. Re-scope to that. |
| **P-015** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:49-50 (one `w`, one `h`) | Per-view sizes genuinely absent; BlockFace.tsx:597 still special-cases simple precisely because there is nowhere to keep the other two. |
| **P-016** | PREMISE-FALSE | apps/systemsketch/src/chrome/ContextualPopupMenu/floatingToolbar.tsx:342 (EdgeTypeCluster), :346 (TunnelCluster) | A selected cable now gets edge type (4 routings, drawn by the real router) and tunnel/layer. Residual is arrowheads only — fold that into P-206. |
| **P-017** | ABSENT | apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx:117-142 passes no `draftChip`; files/session.tsx:855 autosave listener has no draft branch | Drafts are still unmounted, so there is nothing for autosave to suspend for. Blocked on P-020. |
| **P-018** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:87 (`glyph`), :161 (`T.string`); no `assetId` anywhere | Narrowed: the ICON half shipped (P-036/P-043) as one encoded `glyph` string. Only the tldraw `assetId` spelling for uploaded images is missing — a real but much smaller item than written. |
| **P-019** | ABSENT | @trunk/components/blockPort.layout.ts:250 (collapse, not hide); no hover-reveal in apps/systemsketch/src | Simple view still collapses to one centred dot per wall rather than hiding ports, and nothing reveals on hover. |
| **P-020** | ABSENT | apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx:117-142 | `draftChip` is still never passed; `branchChip.tsx`/`draftModel.ts` have no app importer. |
| **P-050** | ALREADY-DONE | apps/systemsketch/src/shapes/port/PortFace.tsx:213 (`CodeEditor` on the whole declaration); BlockShapeUtil.tsx:32-36; @trunk/scene/portDeclaration.ts | Ruling 8 landed: a port stores ONE line and both faces edit it in a real single-line CodeEditor. Residual is the `= default` segment only, which `parsePortDeclaration` currently sweeps into `type`. |
| **P-051** | ABSENT | apps/systemsketch/src/chrome/DevMenu/devtools.tsx:160 (`useToolSwitcherItems` is the only feed) | Still tools-only. `quickSwitcherItemDisabled`/`groupQuickSwitcherItems` remain unused. (The Find half DID land — boardText.ts — but that is P-024, not this.) |
| **P-052** | ABSENT | apps/systemsketch/src/chrome/ContextualPopupMenu/floatingToolbar.tsx:172-202 (visibility gate reads no editing state) | No editing branch in the pill. Note it now MATTERS more: BlockFace.tsx:203 mounts a real title editor, so the pill genuinely sits over typing. |
| **P-053** | ABSENT | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:457 (`getHandles` emits `pin:` handles only) | Proof is stale — `getHandles`/`onHandleDrag` DO exist now (P-028) — but they address elbow segments, never a terminal. Re-aiming a cable's end is still impossible. |
| **P-054** | ABSENT | apps/systemsketch/src/shapes/wire/wireGeometry.ts:191-198 (`traceGeometry` called with no `obstacles`) | Nothing collects obstacles; confirmed unchanged. |
| **P-055** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:500-550 (`BlockEdgeSpec` sets `items`+`onItemsChange` only); @trunk/components/blockPort.tsx:472 (`spec.editing ?? false`); portEdge.tsx:1324 (`editingEnabled = editing`) | CORRECTION to the dispatch note: `editMode` defaulting to `"multi"` (portEdge.tsx:1275) does NOT make the lane reachable — it only picks WHICH editor a click opens once `editing` is true, and the app never sets `editing`. The lane is one prop away but is genuinely absent today. |
| **P-056** | ABSENT | apps/systemsketch/src/shapes/block/railLabel.ts:56-66 (`portsFromRailItems` drops an unknown id, never mints) | Narrowed: RENAME landed (P-037) and reorder already worked. Add/remove/retype from the board are still absent, and the drop-unknown-id rule is the wall. |
| **P-057** | ABSENT | apps/systemsketch/src/chrome/panels.tsx:117-158 (`InspectorSurface`), :209 (launcher) | The right-rail inspector DOCK exists and is reachable; what is absent is the schema-driven content (PropertyTable/field registry) and member-row retargeting. This is the canonical residual for the whole inspector cluster. |
| **P-058** | ABSENT | apps/systemsketch/src/shapes/wire/wireGesture.ts:471; @trunk/scene/edgeValidation `allowCrossScope` via chrome/ShareMenu/validationLevelHost.ts:182 | Partly stale: cross-boundary wiring IS gated now (one of the six switches that reach the board). The inner/outer FACE model of an expanded block is still absent. |
| **P-059** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:152 (`T.literalEnum("simple","port","expanded")`) | No `value` view. shapes/wire/edgeDropCatalog.ts:64 already records it as the first catalogue entry to add the day the enum grows. |
| **P-060** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:30-36 (`BlockPortSpec = {id, declaration}`) | Proof's prop list is stale (ruling 8 folded name/type into `declaration`), but `row`/`branch` are still absent from both port schemas. |
| **P-061** | ALREADY-DONE | apps/systemsketch/src/shapes/block/BlockFace.tsx:254 (title), :388 (description), :114 (glyph), :531 (rail labels) | Landed across P-039/P-026/P-043/P-037: every one writes per keystroke with no Enter to commit. Residual: a rail port's ANNOTATION (after the `:`) has no surface on the card — railLabel.ts:40-50 states it. |
| **P-062** | DUPLICATE-OF P-055 | same evidence as P-055 | Same capability, same single blocker (`BlockEdgeSpec.editing` is never set). |
| **P-063** | ABSENT | apps/systemsketch/src/chrome/panels.tsx:136 (`InspectorPanel` takes glyph + description only) | `blockMembers.tsx` still has no app importer; the inspector exists but has no members section. |
| **P-064** | ABSENT | @trunk/components/codeEditor.tsx:18-30 (`grammar`/completion dropped on both sides) | Confirmed unchanged: no completion source anywhere, so no slot-aware behaviour to gate. |
| **P-065** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:558-603 (`Block` gets header + descriptionSlot, no body slot) | Proof stale (there IS a description slot now) but the capability — a CodeEditor living inside a Block — is still absent; `ss-code` remains a standalone canvas cell. |
| **P-066** | PREMISE-FALSE | apps/systemsketch/src/shapes/block/BlockFace.tsx:114 (icon), :582 (description), :557 (port rails) | "A header-only card — no body, footer, members, description or icon" is now false on three of five counts. Residual is members + footer only; rewrite the item around those. |
| **P-067** | ALREADY-DONE | apps/systemsketch/src/chrome/CompareView/compareView.tsx:36-40,267; chrome/TitleBar/chromeBar.tsx:81; shapes/shared/diffMark.ts:121 | All three layers are now wired: `diffScene` engine, `compareScenes` contract, and both displays — a Compare dialog AND a persisted `ss:diff` StyleProp painted on the board. |
| **P-068** | ABSENT | apps/systemsketch/src/shapes/code/CodeShapeUtil.tsx:72-78 (props are w/h/code/language/origin) | No expand affordance and no larger viewer. |
| **P-069** | ABSENT | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:272 (`T.literalEnum("data","async","delayed")`) | Still three data variants. Note P-023 added a free-text `layer` (:100) which covers some of the grouping motivation but is not a semantic kind. |
| **P-070** | ABSENT | apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx:129 (history all false), :138 (`crumbs={[]}`), :139-141 | Canonical item for the whole depth-navigation cluster. Four seats still hard-coded, with the WHY stating there is no depth model. |
| **P-071** | DUPLICATE-OF P-060 | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:103 (`Record<PortSide, BlockPortSpec[]>`) | "Header is row 0" is a consequence of the row/branch model; it cannot be built separately. |
| **P-072** | DUPLICATE-OF P-010 | apps/systemsketch/src/source/sourceContextMenu.tsx:240 | Same surface as P-010's `Ports ▸` group; also blocked on P-056 (there is no add/remove port to invoke). |
| **P-073** | DUPLICATE-OF P-015 | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:49-50 | Identical capability, identical proof. |
| **P-074** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 (no `definitionId`); @trunk/scene/linking.ts has no app importer | Canonical item for the whole definitions/linking cluster. |
| **P-075** | ABSENT | @trunk/components/codeEditor.tsx:18-20 (rendered/source mode toggle dropped) | Confirmed unchanged. |
| **P-076** | ABSENT | apps/systemsketch/src/chrome/ContextualPopupMenu/arrangeActions.ts:245-274 (STYLE_ROWS read off tldraw's own enums), :391 (`editor.getTheme`) | Narrowed: the style bar itself SHIPPED (six tldraw rows + opacity + the app's own Diff row). What is absent is his 21-colour palette, the shape switcher and start/end point. |
| **P-077** | PREMISE-FALSE | apps/systemsketch/src/chrome/panels.tsx:117,209 | "panels.tsx:1-2 … Frames or Problems, never both" is stale: a third Inspector surface and its launcher exist. Residual is P-057's schema-driven content. |
| **P-078** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:500-550 (`onItemsChange` is per-side, rebuilt from `ports[side]`) | Cross-rail drag still impossible on both sides: the trunk mounts one `DndContext` per rail, and the app's handler drops an item from another rail. |
| **P-079** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:558 (`Block` gets no `members`) | `blockMembers.tsx`, `hosts/memberDrag.ts`, `codeCellFace.tsx` still have no app importer. |
| **P-080** | ALREADY-DONE | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:430 (`canEdit(): true`); BlockFace.tsx:254,191 | The exact case the grep missed: `canEdit` IS overridden now, and double-click opens an in-place title editor with the caret on the clicked character (P-021/P-039). |
| **P-081** | ALREADY-DONE | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:75 (`pins`), :457 (`getHandles`), :485 (`onHandleDrag`), :507 (double-click → auto) | P-028 landed. Pins are stored as fractions of the endpoint frame (:57-70) specifically so a dragged corner travels with the block — Zach's own complaint, quoted in the code. Residual: terminal handles (P-053) and bends on non-elbow routings. |
| **P-082** | DUPLICATE-OF P-070 | apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx:129,138 | Same four hard-coded seats; P-082 adds the camera/visibility half of the same feature. |
| **P-083** | ABSENT | apps/docs/package.json:40 is the only `react-arborist` dependency in the repo | Proof's claim that arborist is absent everywhere is slightly wrong (apps/docs has it), but no instance tree exists in bbox studio or the trunk. |
| **P-084** | ALREADY-DONE | apps/systemsketch/src/shapes/block/BlockFace.tsx:19 (`EditableText` import), :203, :333 | `grep EditableText → 0 hits` is now false. Title and description both read as plain text and become a real control on press. |
| **P-085** | DUPLICATE-OF P-081 | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:457-469 (`virtual` vs `vertex` handles) | Excalidraw-style per-segment handles are exactly what `getHandles` now emits. Residual reveal rule (selected AND near) is a tweak, not a build. |
| **P-086** | ABSENT | apps/systemsketch/src/chrome/ContextualPopupMenu/selectionActions.ts:138 (`setBlockView` writes `props.view` only) | Proof's "`@trunk/scene/collapse` never imported" is stale (document/grouping.ts:45), but that import is group/ungroup — switching a block's view still leaves its children painted. |
| **P-087** | PREMISE-FALSE | @trunk/files/workspaceModel.ts:45-53 (`BBOX_SUFFIX`, `DEFAULT_NEW_DOCUMENT_SUFFIX = .bbox`); apps/systemsketch/src/files/session.tsx:411 | Ruling 1 supersedes the ask: new boards are `.bbox`, which OPENS `.bbox`/`.tldr` and hands `.systemsketch` to the archive. What is genuinely left is the envelope/version key, not the extension. |
| **P-088** | DUPLICATE-OF P-055 | same evidence as P-055 | Third spelling of the same lane item. |
| **P-089** | PREMISE-FALSE | apps/systemsketch/src/chrome/panels.tsx:117,209 | "SystemSketch has no inspector panel at all" is false. Every row-level ask in this partition now has a surface to land on; re-file them against P-057. |
| **P-090** | ABSENT | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:272; no second canvas mode in App.tsx | Canonical item for the communication-view cluster. |
| **P-091** | ABSENT | @trunk/components/codeEditor.tsx:18-19 | No expression layer, no variable registry, and the completion machinery it needs was dropped in the port. |
| **P-092** | PREMISE-FALSE | apps/systemsketch/src/chrome/panels.tsx:45-49 (`PANEL_TITLE` has three entries), :117 | `PANEL_TITLE covers only Frames and Problems` is stale. Tiering (Simple/Advanced/Expert) is the residual — re-file against P-057. |
| **P-093** | DUPLICATE-OF P-074 | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 | Linked/non-linked attributes presuppose the linking model P-074 asks for. |
| **P-094** | PREMISE-FALSE | apps/systemsketch/src/chrome/panels.tsx:117,255 (`PanelShell` with a surface switcher) | "There is no inspector, no properties surface" is false; the six refinements now have somewhere to land. Re-file against P-057. |
| **P-095** | PREMISE-FALSE | apps/systemsketch/src/chrome/panels.tsx:117,182-215 | Same stale premise a fifth time. Note `grep -rni inspector` now returns the real surface, not two comments. |

## Noticeability 4 — all 144 items

| id | verdict | evidence (file:line) or duplicate-of | why |
|---|---|---|---|
| **P-096** | ABSENT | @trunk/components/trace.layout.ts (`TRACE_MARKER_ENDS`); WireFace.tsx:119-140 passes no marker props | Confirmed unchanged. |
| **P-097** | ABSENT | apps/systemsketch/src/shapes/wire/WireFace.tsx:119-140 (no `crossing` prop) | Confirmed unchanged. |
| **P-098** | ABSENT | apps/systemsketch/src/shapes/wire/wireGesture.ts:323-332 | Line number stale (296 → 323); the gate is still button + bindability + anchor, with no readonly / `getEditingShapeId()` / tool check. A live bug: the app now HAS in-block editing (BlockFace.tsx:203), so this fires more often than when it was filed. |
| **P-099** | ABSENT | apps/systemsketch/src/shapes/port/PortShapeUtil.tsx:143-147 (`path.rect(0,0,w,h)`) | Confirmed unchanged, and the box is now WIDER than when filed (PortFace's label spacer makes `w` the full token). |
| **P-100** | ABSENT | apps/systemsketch/src/shapes/wire/WireFace.tsx:119-140 (no `diagnostics`) | Confirmed. Lint findings still reach only chrome/problems.ts. |
| **P-101** | ABSENT | @trunk/components/gestureSettings.ts:146; no `pasteAtCursor` in apps/systemsketch/src | Confirmed unchanged. Note the rest of the wheel/camera settings DID get wired (see P-186) — this one and the four wheel bindings are what is left. |
| **P-102** | ABSENT | apps/systemsketch/src/chrome/ContextualPopupMenu/floatingToolbar.tsx:140-144 (three states), :194-202 (gate) | Confirmed: no `getEditingShapeId()` and no current-tool read. |
| **P-103** | ABSENT | no `elkjs` in any package.json; no auto-layout in apps/systemsketch/src | Canonical item for node auto-layout. |
| **P-104** | ABSENT | apps/systemsketch/src/backend/pyblocksConsumer.ts; `semanticKind` appears only in openPythonScope.smoke.test.tsx:63 | Confirmed: no renderer reads the five semantic fields, and write-back is still not implemented. |
| **P-105** | ABSENT | apps/systemsketch/src/files/session.tsx:847-853 (boot reads `initialBoard()` only) | Confirmed: `recents` (:182) is never consulted at boot. |
| **P-106** | ALREADY-DONE | apps/systemsketch/src/shapes/wire/wireGesture.ts:323-367 (`onPointerDown` always mints a new drag) | The stated behaviour IS today's behaviour, deliberately (wireGesture.ts:5-7). The second clause (drag a handle instead) is P-053. NOTE it directly contradicts P-181. |
| **P-107** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:557 (`<BlockPort id view edges>` — no `portLayout`) | Canonical item for inline/offset port layout. Confirmed unchanged. |
| **P-108** | PREMISE-FALSE | apps/systemsketch/src/chrome/panels.tsx:182-215 (`SurfaceSwitch`, three surfaces) | "Two surfaces" is stale — Frames · Problems · Inspector, with a switcher. Residual: comments/layers surfaces and a designed empty state. |
| **P-109** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 | The schema half of P-074. Proof's prop list is stale (description/showDescription/glyph/diff were added) but none of the three named fields exists. |
| **P-110** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:272-298 (stock frame-like containment) | Confirmed unchanged. |
| **P-111** | PREMISE-FALSE | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:507 (`onDoubleClickHandle` → `wireAutomaticRoute`); wireGeometry.ts:316 | "No custom-route state to reset and no command to do it" is false: `props.pins` IS the custom route and double-clicking a corner hands it back. Residual is a bulk "reset this cable" command. |
| **P-112** | ABSENT | apps/systemsketch/src/chrome/problems.ts:290-321 (one row per subject, no ancestor roll-up) | Confirmed unchanged. |
| **P-113** | DUPLICATE-OF P-064 | @trunk/components/codeEditor.tsx:18-30 | Same absent completion machinery. |
| **P-114** | DUPLICATE-OF P-058 | apps/systemsketch/src/shapes/wire/wireGesture.ts:465-489 | Boundary inner/outer faces are exactly P-058's scope model seen from the port. |
| **P-115** | DUPLICATE-OF P-074 | @trunk/scene/linking.ts has no app importer | Same linking model. |
| **P-116** | ABSENT | apps/systemsketch/src/shapes/wire/wireGesture.ts:197-203 (`dotUnderPoint` needs a real dot under the release), :431 | Confirmed unchanged. Note P-005 landed the eligibility HIGHLIGHT, which makes the missing snap more conspicuous, not less. |
| **P-117** | PREMISE-FALSE | apps/systemsketch/src/shapes/block/BlockFace.tsx:117 (`GlyphPicker`); @trunk/editor/glyphPicker/glyphPicker.tsx:136 (`"emoji"\|"icons"\|"upload"`) | The picker — lucide + emoji + upload, with paste/drop/URL — is built AND mounted (P-043). Residual is only the standalone glyph SHAPE, which is P-213. |
| **P-118** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:557 (no `mode`, no `freeOffsets`) | Confirmed unchanged: the app is permanently on the trunk's `auto`. |
| **P-119** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:36-72 (the WHY names `secondary` as owed upstream) | Confirmed. This is the seam P-011 needs; sequence them together. |
| **P-120** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 (no fold state) | Canonical item for block folding. |
| **P-121** | ABSENT | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:272 | Confirmed unchanged. |
| **P-122** | DUPLICATE-OF P-054 | apps/systemsketch/src/shapes/wire/wireGeometry.ts:191 (no obstacle set at all) | Vacuous until obstacle routing exists; it is a constraint ON P-054, not separate work. |
| **P-123** | ABSENT | apps/systemsketch/src/chrome/problems.ts:275-280; chrome/ShareMenu/validationLevelHost.ts:159-173 | Confirmed, and now doubly documented: `allowSamePolarity` is one of the three of nine Settings switches that reach nothing, because no port schema states a direction. |
| **P-124** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:557 (no `groups`/`groupMode`) | Confirmed: permanently `groupMode: "off"`. |
| **P-125** | PREMISE-FALSE | apps/systemsketch/src/shapes/shared/pointerOwnership.ts:94-101 (`bodyIsContent`); BlockShapeUtil.tsx:385-410 (header label band) | "Returns true for anything that is not a block-header" is stale: P-007 handed simple/port BODIES to tldraw and a header band was added to the geometry. Expanded stays hollow by a recorded ruling; residual is port text and a footer that does not exist. |
| **P-126** | ABSENT | apps/systemsketch/src/shapes/block/BlockTool.ts (no `setEditingShape` on create) | Confirmed. Cheaper than when filed — `ss-block` now has `canEdit`, so this is one call in the tool's completion path. |
| **P-127** | ABSENT | apps/systemsketch/src/chrome/ContextualPopupMenu/floatingToolbar.tsx:282-320 (language only) | Canonical item for code-cell pill controls. |
| **P-128** | ABSENT | @trunk/components/codeEditor.tsx:19-20 (`CodeEditorRows` dropped) | Confirmed unchanged. |
| **P-129** | ALREADY-DONE | apps/systemsketch/src/shapes/block/BlockFace.tsx:564-569 (`<BlockGlyph>` beside `<BlockTitle>` in the header line) | Landed as P-036/P-043. The proof's `grep @trunk/components/glyph → empty` missed it because the app mounts `@trunk/editor/glyphPicker`, which renders the glyph itself. |
| **P-130** | ABSENT | no `kanban` anywhere in either app | Confirmed unchanged. |
| **P-131** | ABSENT | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:272 | Blocked on P-069 (there is no kind to infer or filter by). |
| **P-132** | DUPLICATE-OF P-064 | @trunk/components/codeEditor.tsx:18-30 | Third spelling of the completion-menu item. |
| **P-133** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 | Proof's prop list is stale; no `showHeader`/`showFooter`/`headerDivider` exists. |
| **P-134** | ABSENT | apps/systemsketch/src/shapes/port/PortShapeUtil.tsx:70 (`T.literalEnum("in","out")`) | Confirmed unchanged. |
| **P-135** | ALREADY-DONE | @trunk/editor/glyphPicker/glyphPicker.tsx:136 (`PickerTab = "emoji"\|"icons"\|"upload"`), :157 (`RECENT_EMOJI_KEY`); mounted at BlockFace.tsx:117 | The emoji tab with a Recent row ships in the trunk picker the app already mounts. The proof looked at `packages/glyph-picker`, which is the wrong copy. |
| **P-136** | ALREADY-DONE | apps/systemsketch/src/shapes/wire/wireTunnel.ts:152; WireFace.tsx:104; selectionClusters.tsx:579 (`TunnelCluster`) | P-023 landed the whole four-state machine, the mouths, the layer model and the pill control. `grep tunnel → 0 files` is now 3 files. |
| **P-137** | ABSENT | apps/systemsketch/src/shapes/wire/WireFace.tsx:119-140 (no badge) | Confirmed: `variant: "delayed"` exists, the z⁻¹ pill does not. |
| **P-138** | ABSENT | apps/systemsketch/src/chrome/panels.tsx:136 (`InspectorPanel`, two rows) | No property table, so no overridden rows to reset. Blocked on P-057. |
| **P-139** | ABSENT | no `ScrubNumber` in either app | Confirmed unchanged. |
| **P-140** | DUPLICATE-OF P-010 | apps/systemsketch/src/source/sourceContextMenu.tsx:240 | Same surface; note the underlying actions (view toggle, focus/isolate) both exist now, so this is pure re-exposure. |
| **P-141** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:49-50 | Confirmed: bare w/h with no mode. Interacts with P-212 and P-166 — decide those three together. |
| **P-142** | ABSENT | apps/systemsketch/src/shapes/shared/diffMark.ts:5-44 (the diff half is a StyleProp; severity stays derived and unpainted) | Canonical item for on-shape lint marks. The channel split is already designed and recorded — this is the paint half of it. |
| **P-143** | DUPLICATE-OF P-055 | same evidence as P-055 | Fourth spelling of the lane item. |
| **P-144** | ABSENT | apps/systemsketch/src/chrome/DevMenu/variantSwitch.tsx:262 sets port/region VARIANTS, never `data-bbox-skin` | Confirmed: the skin axis has no setter and no picker in the app, though the variant pill is the obvious seat for one. |
| **P-145** | DUPLICATE-OF P-120 | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 | Same fold state. |
| **P-146** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:558 (`Block` gets no `footer`) | Confirmed unchanged. |
| **P-147** | DUPLICATE-OF P-059 | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:152 | Same fourth view. |
| **P-148** | ALREADY-DONE | apps/systemsketch/src/shapes/wire/portAvailability.ts:50; wireGesture.ts:366,387; BlockFace.tsx:478; PortFace.tsx:286 | P-005 landed: the drag lights every legal landing, judged by the SAME `validateConnectionAtLevel` the drop runs. Residual: the stronger 'hinting' state under the pointer. |
| **P-149** | ABSENT | apps/systemsketch/src/chrome/panels.tsx:136 | Blocked on P-057's property table. |
| **P-150** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:557 | Confirmed unchanged. |
| **P-151** | DUPLICATE-OF P-142 | apps/systemsketch/src/chrome/problems.ts:282-321 | Same paint-lint-on-the-shape capability. |
| **P-152** | ABSENT | apps/systemsketch/src/chrome/panels.tsx:136; BlockShapeUtil.tsx:49-50 | Blocked on both P-015 (per-view sizes to match) and P-057 (a panel to put the buttons in). |
| **P-153** | DUPLICATE-OF P-081 | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:457,485 | Segment drag on an elbow is exactly what P-028 shipped. |
| **P-154** | ABSENT | apps/systemsketch/src/source/sourceContextMenu.tsx:240; shapes/registry.ts:77 | Confirmed: the detach machine is in packages/adapter-tldraw and the trunk, and bbox studio mounts neither. |
| **P-155** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:313-315 (stock `resizeBox`) | Confirmed. Note P-190 is a live bug on the same seam — fix them together. |
| **P-156** | ABSENT | apps/systemsketch/src/shapes/wire/WireFace.tsx:119-140; WireShapeUtil.tsx:31-101 (no label field) | Confirmed unchanged. |
| **P-157** | PREMISE-FALSE | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:457-469 (`type: segment.pinned ? "vertex" : "virtual"`) | "Declares no getHandles" is false: an unpinned segment already publishes a `virtual` handle, which is stock tldraw's inert-dot-that-activates-on-drag. Residual is straight/curved runs, which get no handles by a recorded decision (:456). |
| **P-158** | DUPLICATE-OF P-107 | apps/systemsketch/src/shapes/block/BlockFace.tsx:557 | Same `portLayout` prop. |
| **P-159** | PREMISE-FALSE | apps/systemsketch/src/chrome/CompareView/compareView.tsx:36-40,237 (`SceneDiffMarks`) | "The app imports diffScene for ONE purpose and paints nothing" is false. Residual: the before-path ghost overlay and the was/now chips. |
| **P-160** | DUPLICATE-OF P-055 | @trunk/components/blockPort.tsx:472; BlockFace.tsx:557 | Same lane, expressed as two halves of the body. |
| **P-161** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:558 (no `members`/`membersLayout`) | Confirmed unchanged; free placement works, stack mode has no caller. |
| **P-162** | PREMISE-FALSE | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:55 (`description`); BlockFace.tsx:582 (`descriptionSlot`) | "`ss-block` has no description prop" is false as of P-026. Residual is the footer and a real body slot. |
| **P-163** | ALREADY-DONE | apps/systemsketch/src/shapes/block/BlockFace.tsx:117; chrome/panels.tsx:136-149; @trunk/editor/glyphPicker/glyphPicker.tsx:59-61 | Notion's three tabs, the filter, Remove, paste/drop/file/URL upload — all present in the trunk picker, mounted from two doors (canvas glyph and inspector row). Residual: the fetch proxy for the URL path. |
| **P-164** | DUPLICATE-OF P-136 | apps/systemsketch/src/shapes/wire/wireTunnel.ts:152 | Same tunnelling feature, already done. |
| **P-165** | ALREADY-DONE | apps/systemsketch/src/chrome/FocusLens/focusLens.tsx:73; overlay.tsx:351; App.tsx:204 (`getShapeVisibility`) | P-025 landed both lenses: DIM via one generated CSS rule, ISOLATE via tldraw's own visibility seam. |
| **P-166** | ABSENT | apps/systemsketch/src/shapes/shared/measure.ts:113 (hug write-back, no padding); BlockFace.tsx:597 | The measured hug exists but `autoResize` with padding does not. Decide alongside P-212, which asks for the opposite guarantee. |
| **P-167** | ABSENT | no `trace.tidy` importer in apps/systemsketch/src | Confirmed unchanged. |
| **P-168** | DUPLICATE-OF P-127 | apps/systemsketch/src/chrome/ContextualPopupMenu/floatingToolbar.tsx:282-320 | Same code-cell pill controls. |
| **P-169** | ABSENT | apps/storybook-basics/src/components/Block.stories.tsx (no `view` arg) | Confirmed, though the proof's path is wrong (`src/stories/` does not exist; the file is under `src/components/`). Trunk-side chore, no app impact. |
| **P-170** | ABSENT | @trunk/components/portEdge.tsx:471 (`EMPTY_SLOT_MIN_PX = 24`) | Confirmed unchanged. |
| **P-171** | ABSENT | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:31-101 (no label field) | Confirmed; same capability as P-156 from the pill's side — build once. |
| **P-172** | DUPLICATE-OF P-072 | apps/systemsketch/src/source/sourceContextMenu.tsx:240 | Same port-scoped context rows. |
| **P-173** | DUPLICATE-OF P-107 | apps/systemsketch/src/shapes/block/BlockFace.tsx:557 | Same toggle, named twice (inspector + context menu are surfaces, not separate work). |
| **P-174** | DUPLICATE-OF P-206 | apps/systemsketch/src/chrome/ContextualPopupMenu/floatingToolbar.tsx:240-390 | Same 'which control set for which selection' question. |
| **P-175** | DUPLICATE-OF P-074 | @trunk/scene/linking.ts has no app importer | Needs occurrence identity first. |
| **P-176** | ABSENT | @trunk/files/workspaceModel.ts:14-18 (watcher explicitly not ported); files/session.tsx has no poll | Confirmed unchanged; the digest fence still refuses to clobber, which is the current mitigation. |
| **P-177** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 | Confirmed unchanged. |
| **P-178** | ABSENT | apps/systemsketch/src/source/sourceContextMenu.tsx:240; App.tsx has no canvas double-click handler | Confirmed. Note shapes/block/blockPlacement.ts:82 now decides a drawn block's VIEW from its box, which is adjacent grammar worth reusing. |
| **P-179** | ABSENT | apps/systemsketch/src/shapes/shared/pointerOwnership.ts:42 (imports only `POINTER_OWNED_CLASS`) | Confirmed: the app still runs an ad-hoc per-shape rule. Its one rule has since grown a view-aware branch (:94), which makes adopting the declared policy MORE valuable, not less. |
| **P-180** | ALREADY-DONE | apps/systemsketch/src/shapes/wire/wireGesture.ts:390-398,471-476; chrome/ShareMenu/validationLevelHost.ts:227,241 | Ruling 3 landed 2026-09-21: the hardcoded `{allowFanIn: true}` is gone and the gesture validates at the level the nine switches derive. Caveat recorded at validationLevelHost.ts:143-174 — six of nine switches reach the board; `allowHiddenPorts`, `allowFanOut`, `allowSamePolarity` still do not. |
| **P-181** | PREMISE-FALSE | apps/systemsketch/src/shapes/wire/wireGesture.ts:5-7,323 | It asks for behaviour P-106 explicitly rules out ('the dot never picks up an existing cable; fan-in made that ambiguous'). Reconnect should be a terminal handle (P-053), not a press on the dot. DO NOT BUILD as written. |
| **P-182** | PREMISE-FALSE | docs/PARITY-PICKS-2026-09-21.md 'Explicit NO (3)' | Zach said no to hiding common ports. Superseded by tunnelling (P-136, shipped). DO NOT BUILD. |
| **P-183** | ABSENT | no `blackbox` in apps/systemsketch/src | Confirmed unchanged. |
| **P-184** | DUPLICATE-OF P-103 | no `elkjs` in any package.json | Same ELK auto-layout command. |
| **P-185** | ABSENT | apps/systemsketch/src/shapes/block/BlockFace.tsx:254 (tldraw's double-click session) | Narrowed: `ss-code` already behaves this way (CodeFace.tsx:217 mirrors CodeMirror focus, so one click edits). Block title/description and the port label still need a double-click. |
| **P-186** | PREMISE-FALSE | apps/systemsketch/src/App.tsx:147 (`installCameraGestures`); chrome/ShareMenu/cameraGestureHost.tsx:205-224 | "No options, no cameraOptions, no wheel seam" is false. Wheel convention, pan speed, zoom speed and invert are applied live. Residual, named in the code itself (:190-203): paste-at-cursor (P-101), the four wheel BINDINGS, and `modifierWheelZoomsOppositely`. |
| **P-187** | PREMISE-FALSE | apps/systemsketch/src/chrome/ContextualPopupMenu/floatingToolbar.tsx:342,346 | "Nothing exposes them per cable" is false: routing, tunnel and layer are all in the pill. Residual is delay + animation and a dedicated panel. |
| **P-188** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 | Confirmed: none of the member-stack props has a schema behind it. |
| **P-189** | PREMISE-FALSE | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:75 (`pins`); wireGeometry.ts:186-189 (pins survive a routing switch); :59 (`WIRE_TERMINAL_GAP`) | "There is no bends/rails/handles field at all" is false. The round-trip across a kind switch is explicitly implemented and documented. Residual: control point painted above the label. |
| **P-190** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:313-315 (`resizeBox`, and no `canResizeChildren` override — cf. RegionShapeUtil.tsx:234, which DOES override it) | CONFIRMED LIVE BUG: `ShapeUtil.canResizeChildren` defaults true, so resizing an expanded block scales its children. The region already fixed this one line; the block did not. |
| **P-191** | ABSENT | @trunk/scene/sceneDiff.ts (`DIFF_OPERATIONS` has no `unmatched`) | Confirmed unchanged. |
| **P-192** | DUPLICATE-OF P-070 | apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx:129 | Same dead history seats. |
| **P-193** | DUPLICATE-OF P-070 | apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx:120-133 | Same depth model. |
| **P-194** | ABSENT | @trunk/components/block.tsx (three slots); BlockFace.tsx:558 | Confirmed unchanged. |
| **P-195** | PREMISE-FALSE | apps/systemsketch/src/shapes/shared/diffMark.ts:194 (`diffMarkPaint`); WireFace.tsx:118,131; BlockFace.tsx:553 (`NodeShapeFrame diff=`) | "The diff can only ever be rendered in the Compare dialog, never on the board" is false as of P-035. Residual — and it is the real ask — is moving that paint INTO the trunk components so a removed port draws in the row it is missing from. |
| **P-196** | ABSENT | apps/systemsketch/src/chrome/panels.tsx:136 | Narrowed: style, opacity, arrange and zoom-to-selection are all on the pill already (floatingToolbar.tsx:335-359). What is left for a Shape Facts panel is X/Y/rotation/locked rows. |
| **P-197** | PREMISE-FALSE | apps/systemsketch/src/document/grouping.ts:313 (`groupSelection`); chrome/ContextualPopupMenu/selectionClusters.tsx:725 (`GroupCluster` in the pill) | "No menu row, hotkey or action ever calls collapseToRegion" is false — P-048 shipped Group/Ungroup on the pill. Residual: wrapping into a Frame / Block / Branch specifically. |
| **P-198** | DUPLICATE-OF P-090 | no communication mode in apps/systemsketch/src | Same view. |
| **P-199** | DUPLICATE-OF P-070 | apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx:138-141 | Same crumb/depth seats. |
| **P-200** | ABSENT | apps/systemsketch/src/chrome/panels.tsx:136 | Blocked on P-057 (a port list) and P-060 (rows/branches to mirror). |
| **P-201** | ABSENT | apps/systemsketch/src/shapes/port/PortFace.tsx:464 (`labelSlot` takes arbitrary React, but there is no member list) | Proof's line numbers are stale — the port now has a real `labelSlot` seam — but slots are still fixed, singular and not deletable members. |
| **P-202** | ABSENT | apps/systemsketch/src/chrome/panels.tsx:136 | Blocked on P-057. |
| **P-203** | DUPLICATE-OF P-074 | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 | Same definitions/calls model. |
| **P-204** | DUPLICATE-OF P-075 | @trunk/components/codeEditor.tsx:18-20 | The toggle and the two states are one item. |
| **P-205** | PREMISE-FALSE | apps/systemsketch/src/chrome/CompareView/compareView.tsx:36 (`CompareDialog` imported and mounted) | "grep compare finds no compareDialog import" is false. Residual is real: nothing connects a DRIFTED code origin to that surface, and there is no re-read / keep-both action. |
| **P-206** | PREMISE-FALSE | apps/systemsketch/src/chrome/ContextualPopupMenu/floatingToolbar.tsx:342 (a selected LINE now gets edge-type controls) | "A selected line gets no line controls" is stale. Residual: arrowheads (P-096) and the text-only state. |
| **P-207** | DUPLICATE-OF P-148 | apps/systemsketch/src/shapes/wire/portAvailability.ts:50 | Same eligibility highlight; already done. |
| **P-208** | ABSENT | apps/systemsketch/src/shapes/port/PortFace.tsx:464 | Proof is stale (`labelSlot` is a real slot the app already fills with two runs or a CodeEditor) but generic, multi-member slot contents are still absent. |
| **P-209** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:103 (one side per port), :106 (one anchor per portId) | Confirmed unchanged. |
| **P-210** | ABSENT | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:291 (`onDragShapesIn` is the only way in) | Confirmed; also blocked on P-074 for the linking half. |
| **P-211** | ABSENT | apps/systemsketch/src/source/sourceContextMenu.tsx:240; source/originResolution.ts (badge only) | Canonical item for go-to-definition; blocked on P-074. |
| **P-212** | ABSENT | apps/systemsketch/src/shapes/shared/measure.ts:113 (write-back guarded only by a 0.5px epsilon and `select.resizing`) | CONFIRMED: nothing records that a size was authored, so a re-measure may still overwrite it. Decide against P-166, which asks for the opposite. |
| **P-213** | ABSENT | apps/systemsketch/src/shapes/registry.ts:77 (`KITS = [block, code, port, wire, region]`) | Narrowed: the picker and the glyph grammar are both in use now (P-117/P-163). What is absent is a glyph SHAPE with a dock row. |
| **P-214** | DUPLICATE-OF P-078 | apps/systemsketch/src/shapes/block/BlockFace.tsx:500-550 | Same cross-rail drag. |
| **P-215** | ABSENT | apps/systemsketch/src/document/selectionHistory.ts; App.tsx:153 | Proof's grep is stale in a way that matters: mouse buttons 4/5 are ALREADY BOUND, to SELECTION history (P-029). A viewport journal has to share or displace that binding — say which before dispatching. |
| **P-216** | DUPLICATE-OF P-081 | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:457 | Same handles; the reveal-box refinement is a tweak on top. |
| **P-217** | DUPLICATE-OF P-120 | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 | Same fold state. |
| **P-218** | ABSENT | apps/systemsketch/src/chrome/panels.tsx:182-215 (a ToggleGroup switcher, not tabs) | Narrowed: the rail HAS a surface switcher now; what is absent is a Details\|Connections split and the neighbour list behind it. |
| **P-219** | ABSENT | @trunk/components/portEdge.tsx (dnd-kit default transform-in-place) | Confirmed unchanged. |
| **P-220** | DUPLICATE-OF P-211 | apps/systemsketch/src/source/sourceContextMenu.tsx:240 | Same navigate-to-definition command. |
| **P-221** | ABSENT | apps/systemsketch/src/shapes/wire/createWire.ts:86-101 (`createShape` with no `index`, no `sendToBack`) | CONFIRMED unchanged: every new cable lands on top of the page's z-order. |
| **P-222** | PREMISE-FALSE | docs/PARITY-PICKS-2026-09-21.md 'Explicit NO (3)' — 'Hover the end of a port lane to add a port (superseded by the multi-line editor)' | Ruled out by name. The replacement is the lane (P-055). DO NOT BUILD. |
| **P-223** | ABSENT | apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:272 | Blocked on P-069. |
| **P-224** | DUPLICATE-OF P-059 | apps/systemsketch/src/shapes/registry.ts:77 | Same pill primitive. |
| **P-225** | DUPLICATE-OF P-071 | @trunk/components/blockPort.layout.ts:156 (`RailBand = "block"\|"body"`) | Same header-band port question. |
| **P-226** | ABSENT | @trunk/components/region.tsx (static 1px divider, no handle) | Confirmed unchanged. |
| **P-227** | UNSURE | apps/systemsketch/src/shapes/registry.ts:77; @trunk/scene/portDeclaration.ts:5-16 (ruling 8: 'we don't have this cnocept of Type as a seperate thing') | The Type PRIMITIVE is absent, but ruling 8 removed the separate Type concept for a port's annotation. Whether a Type block is still wanted is a product question for Zach, not a build decision — ask before dispatching. |
| **P-228** | DUPLICATE-OF P-222 | docs/PARITY-PICKS-2026-09-21.md 'Explicit NO (3)' | Same hover bead, ruled out. DO NOT BUILD. |
| **P-229** | DUPLICATE-OF P-074 | @trunk/scene/linking.ts has no app importer | Same DEF model. |
| **P-230** | DUPLICATE-OF P-063 | apps/systemsketch/src/chrome/panels.tsx:136 | Same members section in the inspector. |
| **P-231** | DUPLICATE-OF P-090 | no communication mode in apps/systemsketch/src | Same view, plus the port auto-generation half. |
| **P-232** | ABSENT | apps/systemsketch/src/chrome/Toolbar/dock.tsx:248-259 (`librarySlot` with `eyebrow: "Coming soon"`) | Canonical item for the library. Narrowed: the `+` cell and its popover ARE mounted — only the contents are a placeholder, by an explicit recorded decision. |
| **P-233** | DUPLICATE-OF P-074 | apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx:47-107 | Same definitions model. |
| **P-234** | DUPLICATE-OF P-232 | apps/systemsketch/src/chrome/Toolbar/dock.tsx:248 | Same library surface. |
| **P-235** | DUPLICATE-OF P-232 | apps/systemsketch/src/chrome/Toolbar/dock.tsx:248 | Same library surface. |
| **P-236** | ABSENT | no extension package in the repo; chrome/TitleBar/chromeBar.tsx:20 is a forward-looking comment | Confirmed. Note the file extension in the item is stale — it would open `.bbox` now (ruling 1). |
| **P-237** | DUPLICATE-OF P-070 | apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx:120-133 | Same 'you are always inside a system' depth model. |
| **P-238** | ABSENT | apps/systemsketch/src/chrome/legacyApp.ts; chrome/DevMenu/devtools.tsx:259 (build channel is read-only) | Confirmed unchanged. |
| **P-239** | ABSENT | apps/systemsketch/src/*.smoke.test.tsx (24 files, none a gesture inventory) | Confirmed. Note the suite has grown since filing (arrowCycle, blockBodyPress, textEditing, wheelConvention, shortcuts smoke tests all exist) — the sweep should start from those, not from zero. |

## Provenance, freshness, and how the ALREADY-DONE verdicts were checked

**What tree this describes.** `claude/floating-toolbars-2026-09-20` at `7abecd0`, plus
whatever peer lanes had written to disk at 16:51 on 2026-09-21. Peers were actively
editing `BlockFace.tsx`, `portEdge.tsx`, `portLane.ts`, `panels.tsx`, `railLabel.ts` and
`wireGesture.ts` while this was written, and `portLaneHost.ts` +
`undoGranularity.smoke.test.tsx` appeared untracked during the pass. So:

- **P-055 / P-062 / P-088 / P-143 / P-160** (the port lane) are marked ABSENT, and an
  in-flight lane was adding `portLaneRequest` to `BlockFace.tsx` as this was written.
  Re-check before dispatching — this verdict may already be ALREADY-DONE by the time
  anyone reads it.
- **P-014** (one gesture, one undo step) is marked PREMISE-FALSE, and an in-flight lane
  had just created `undoGranularity.smoke.test.tsx`. Same caveat.

Every other verdict is against code that was committed and not being touched.

**Mutation test.** The ALREADY-DONE verdicts are the expensive ones to get wrong — a
future wave that trusts them and does not build the thing ships nothing. The one behind
**P-080 / P-084 / P-061** was broken on purpose to prove it is load-bearing:

| step | change | `vitest --project=smoke run src/textEditing.smoke.test.tsx` |
|---|---|---|
| baseline | — | **14 passed** |
| mutate | `shapes/block/BlockShapeUtil.tsx:430`, `canEdit(): true` → `false` | **8 failed, 6 passed** |
| restore | back to `true` | **14 passed** |

That suite drives a real headless Chromium tab: it double-clicks a block's painted title
and its painted description and asserts `props.name` / `props.description` afterwards. So
the `canEdit(): true` this document cites as evidence is genuinely what a real user action
reaches, not a line that merely exists.

## Where I stopped, and what is left

- **Complete**: every wave-2/3/4 item at noticeability 5 (57) and 4 (144) — 201 items.
- **Not triaged**: the 229 items at noticeability 1–3 (wave 3 carries 130 at n3 and 72 at
  n2; wave 4 carries 8 at n3, 11 at n2, 4 at n1).
- **Out of scope for this pass**: wave 1 (38 items, all n5). Several of them — P-003 (wire
  hit corridor), P-005 (eligible dots), P-008 (edge type) — have visibly landed since, so
  wave 1 deserves the same treatment before anyone re-reads it as a work list.
- **Method**: everything above was judged by reading `apps/systemsketch/src` end to end
  (~21k lines of non-test source) plus the trunk files each item points at. Where an item's
  own grep was the only evidence available I re-ran it; where the item names a capability I
  went to the seam that capability would have to pass through. `UNSURE` appears once
  (P-227) and is a product question, not a code one.
