# SystemSketch → bbox-ui Parity Backlog

**Executed edition — 2026-09-20. Sources: 8 independent sweeps, cross-checked against `/home/bam/bbox-ui-toolbar` @ `claude/floating-toolbars-2026-09-20`. Spot-verified live (see "Verification" at the end).**

---

## Headline

**The gap is large but it is not mostly *unbuilt* — it is mostly *unmounted*, *unwired*, and *schema-blocked*, in that order.** Of ~430 raw findings across eight lenses, ~190 are genuine gaps after dedupe. Of those, **~55 are one-liners or straight wiring of code that already exists and passes tests inside this repo** (`@trunk/components/{draftBar,draftModel,compareDialog,compareModel,propertyTable,boardSearch,historyList,traceEditor,trace.tidy,trace.handles,trace.crossing,tunnel,traceBadge,highlighter,blockMembers,table}` and `@trunk/scene/{focus,collapse,linking,containment,availability,bubble,batchWire,layers}` — **none imported by the app**, verified by grepping every `@trunk/…` specifier in `apps/systemsketch/src`). Another ~60 are genuine ports blocked behind **two schema barriers**: `ss-block`/`PortSpecV` carry 6 and 3 fields against the donor's 43 and 18, and `ss-wire` has **no persisted route and no `getHandles`**, which alone kills rewire, bend, pin, tidy, reset and reconnect. The remaining ~75 are real product work (Behavior Tree, Table, the Python expression layer, Type blocks). **Three Settings panels currently lie to Zach** — Canvas gestures, Connections edge policy, and the zoom/paste preferences all persist a record that nothing reads.

**Do these five first, in this order:**

1. **The morning commit** — `B` arms the pencil before the Block (tldraw binds draw to `d,b,x`; nothing releases it; the dispatcher does not `break`). He already paid for this exact bug once, on the record. Ten lines. *(W1-01)*
2. **The wire-props lane** — `WireFace.tsx` passes 8 of `Trace`'s 25 props. Passing 4 more makes cables clickable (today the target is ±3 screen px), paints lint marks on them, draws crossing halos, and gives them arrowheads. Plus `keepConnectionsAtBottom` so cables stop painting *over* blocks. One file, half a day, five loud fixes. *(W1-02…06)*
3. **Mount Drafts + Compare** — 2,800 lines, 63 passing tests, a Storybook story, and a **committed-red acceptance suite** (`draft.smoke.test.tsx`) that nothing satisfies. He asked by name twice on 2026-09-19: *"Port over the draft view / Port over the compare view."* Wiring only — but land the **autosave draft-hold** with it or drafts will autosave over Main. *(W2-01…05)*
4. **The inspector dock** — the single loudest "this isn't SystemSketch". Select a Block in bbox-ui today and **nothing anywhere tells you about it**; `grep -rn "Inspector" apps/systemsketch/src` returns two unrelated hits. The donor resolves eight subjects and auto-opens. *(W2-10…14)*
5. **The block/port schema barrier** — `{w,h,name,view,ports,anchors}` and `{id,name,type}`. This is upstream of ~25% of the whole list (icon, description, type, fold, auto-resize, per-view size, port defaults, port visibility, definition linking, the unsatisfied-input lint rule). **Land it alone, first, before any lane that imports it.** *(W3-BARRIER)*

---

## Do not build — Zach rejected or reversed these

Anyone who ships one of these is undoing a decision he already made.

| Thing | His words | Where |
|---|---|---|
| **Delete / Duplicate in the selection pill** | Absent from the donor by design and from FigJam. bbox-ui *has* them and should **lose** them. | `docs/PARITY-SPEC-2026-09-20.md:79-104` |
| **Loud inverse/black DRAFT bar with hazard stripe** | "buggy and piecemeal" — only the IcePanel-quiet `← Exit / Draft 1 / ⋯ / Compare N Changes / Merge` survives. Lifecycle is settled as Draft + Version; do not re-litigate. | SystemSketch:4121-4160 |
| **Minimap** | *"I don't need a minimap for dom canvas, SKIP"* — he zooms out instead; the outline/TOC view is what he wants. | bbox-ui:3406, SystemSketch:2410-2420 |
| **Edge hops** | *"out of scope for now"* — tunnel edges + background halo are the two he asked for. | bbox-ui:2250 |
| **C4's four fixed depths** | *"I want to be able to have arbitrary depths"* | SystemSketch:384 |
| **Settings categories he did not list** — Interface as a category (only its scale survives, inside Appearance), Menu lab, Pill lab | *"If I didn't list it here don't port it"* | SystemSketch:840-852 |
| **Side-effect ports on header lines** | *"I have moved away from ports on the header lines… SKIP this for now"* | bbox-ui:2360 |
| **Two-line function ports** | *"get rid of this Two line function port. this is not apart of our visual languague"* | bbox-ui:1780 |
| **Named-channel edge tags** (100-ideas #2) | *"not important for now"* | bbox-ui 100-ideas |
| **vyflow z-order / drag items** | *"that is HOST!!"* | bbox-ui 100-ideas |
| **Multiple code-based versions of the app** | *"No I think that just adds more complexity, duplicate codebases… I just want two options. 1 is stable, 2 is preview"* | SystemSketch:4016 |
| **A separate repo for the app** | Reversed 2026-09-19: *"I thought about it further and I think you're right about having the apps within the black box UI."* | SystemSketch |
| **The worktree prohibition** | Reversed: *"I previously had like a workflow where I said I wanted the agents to not create work trees. But I changed my mind"* | SystemSketch:1461 |
| **Datasheets** | Not in the donor at all (`grep -ril datasheet /home/bam/systemsketch/src` → nothing). That vocabulary belongs to the CAD-exporter project. | — |
| **Execution traces / runtime telemetry** | Exists in neither repo as a runtime feature. The flight recorder **is** already ported and wired, and bbox even adds `GET /api/recordings/bundle` the donor lacks. | — |

Also **dropped from this backlog as already at parity or ahead** (do not re-port): burger File▸ menu and all four stock submenus, file title context menu, inline board rename + F2, file navigator + native/app toggle, Settings dialog with his 5 categories + dialog/page presentation, interface scale, status strip (ahead of the donor), Problems panel, Frames cards/previews/focus/rename/delete + per-row ⋯, dev panel (rebuilt data-driven per his own brief), flight recorder + viewer, quick switcher on bare `S`, tool aliases, `A` arrow-preset cycle, edge-drop-menu *mechanism*, confirm dialog, wheel pass-through, autosave 600ms/30s, digest fence, Untitled reservation, undo scope across document swap, migration sequence infrastructure, the Python file host (a superset of the donor's), port drag-reorder, producers count on `ss-block`, variant switch, one tool-dock family icon, reopen-to-last-board, six file chords, file-browser keyboard nav.

---

## Wave 1 — ships this week. Loud, and each is a one-liner or a prop pass.

*No new persisted fields. No new shapes. Nothing here needs Zach's sign-off.*

| # | Feature | What it does | Donor | Effort | Notice | Write set |
|---|---|---|---|---|---|---|
| **W1-01** | **Release `b` from the draw tool** | Pressing B arms the Block and nothing else — the pencil does not flash first. tldraw binds draw to `d,b,x`; `handleKeyDown` breaks only the inner loop so **both** fire, draw first. | `blocks/blockToolUi.tsx:18-27,43` | 1-liner | 5 | `chrome/dock.tsx` *(add `releaseShortcut`)*, `shapes/block/index.ts`; **new test** `shortcuts.smoke.test.tsx` |
| **W1-02** | **Wires are clickable** | A 2px wire gets a 12px hit corridor instead of tldraw's ±3 **screen** px. `Trace` already has `interactive` + `hitStrokePx`; `WireFace` passes neither. | `blocks/connections/connectionHit.ts:69-93` | 1-liner | 5 | `shapes/wire/WireFace.tsx`, `shapes/wire/WireShapeUtil.tsx` (`getGeometry` padding) |
| **W1-03** | **Cables paint UNDER blocks** | A cable crossing a block runs behind it. `createWire.ts:87` takes tldraw's default (top) index, per parent, on every completed op. | `blocks/connections/keepConnectionsAtBottom.ts:20-40` | 1-liner (~40 LOC) | 5 | `shapes/wire/createWire.ts`, **new** `shapes/wire/keepAtBottom.ts`, `App.tsx` (install) |
| **W1-04** | **Lint marks painted on the wire** | `problems.ts:234` already computes per-edge findings; `Trace` already takes `diagnostics` + `highlighterKind` with a tooltip built in. Nothing connects them. | `ConnectionShapeUtil.tsx:264` (`props.state`) | 1-liner | 4 | `shapes/wire/WireFace.tsx`, `chrome/problems.ts` (export per-edge map) |
| **W1-05** | **Crossing halo** | A cable crossing another paints a board-coloured casing so over/under reads. `trace.crossing.ts` (216 lines) is ported; `Trace.crossing` defaults `"none"`. | `prototypes/communication/arrowEdgeCrossing.ts` | 1-liner | 4 | `shapes/wire/WireFace.tsx` |
| **W1-06** | **Arrowheads at both ends** | Choose a cable's head and tail. `TRACE_MARKER_ENDS` is `["arrow","none"]` today — widen it, and pass `markerEnd`. | `contextualControlRegistry.ts:216-226` (9 options) | S | 4 | `@trunk/components/trace.layout.ts`, `shapes/wire/WireFace.tsx`, `chrome/selectionClusters.tsx` |
| **W1-07** | **The pill shows ANY control for a selected cable** | `SelectionSubject` is `{ids, only, blockView, codeLanguage}` — no wire branch, so selecting a cable offers Arrange/Opacity/Focus and nothing about the cable. **Prerequisite for W1-06/08.** | `contextualControlRegistry.ts:332-344` | S | 5 | `chrome/selectionActions.ts` **(BARRIER — freeze this contract first)** |
| **W1-08** | **Routing picker (Elbowed · Curved · Straight · Slanted)** | `ss-wire.routing` **already exists** (`WireShapeUtil.tsx:41`) and **nothing in the app writes it**. Today it is settable only by hand-editing Python. | `connectionCommands.ts:11` | 1-liner | 5 | `chrome/selectionClusters.tsx`, `chrome/floatingToolbar.tsx` |
| **W1-09** | **Pill hides while editing and under another tool** | Gate is `ids.length > 0 && geometry !== null` — no `getEditingShapeId()` check, no tool check, 3 manipulation states instead of 7. Rotate today and the pill rides under the cursor. | `SystemSketchChrome.tsx:517-522`, `SelectionContextualMenu.tsx:30-39` | 1-liner | 4 | `chrome/floatingToolbar.tsx` |
| **W1-10** | **Pill surface pinned dark in both themes** | `bg-foreground text-background` is a page inversion — in dark mode the pill is `#fafafa` with a `#343434` popover under it. | `tokens.css:120,128`, `appearance.css:143-155` | 1-liner | 5 | `chrome/floatingToolbar.tsx`, `app.css` |
| **W1-11** | **Geo shape picker in the pill** | Rectangle → ellipse is impossible from the pill today. | `contextualControlRegistry.ts:191-212` | S | 3 | `chrome/selectionClusters.tsx` |
| **W1-12** | **Vertical text alignment** | Top / Middle / Bottom over `DefaultVerticalAlignStyle`. Cheapest gap on the whole list. | `contextualControlRegistry.ts:258-261` | 1-liner | 2 | `chrome/selectionClusters.tsx` |
| **W1-13** | **Opacity slider marks history once per drag** | Today every tick is its own undo step. | `SystemSketchChrome.tsx:480-509` | 1-liner | 3 | `chrome/selectionClusters.tsx` |
| **W1-14** | **Install the gesture layer** | `<Tldraw>` takes **no `options` prop** and installs no gesture seam. Settings ▸ Canvas persists four rebindable wheel gestures, pan speed, zoom sensitivity, direct-wheel-zoom and paste-under-cursor — **and every one is inert.** The apply side already exists unused at `packages/inspector/src/chrome/useGestures.ts`. | `canvasGestures.ts:102-143`, `canvasCamera.ts:5-136` | M | 4 | `App.tsx`, **new** `chrome/gestures.ts`; reuse `packages/inspector/src/chrome/useGestures.ts` |
| **W1-15** | **`maxPages: 1` + `wheelBehavior: 'pan'` pinned** | One durable canvas; `files/resetDocument.ts:28` already *assumes* the ceiling in a comment. Falls out of W1-14. | `canvasCamera.ts:5-13` | 1-liner | 3 | `App.tsx` |
| **W1-16** | **Paste at cursor** | Ctrl+V drops where the pointer is. `@trunk/components/gestureSettings.ts:94` defaults it true and nothing applies it. Falls out of W1-14. | `pasteAtCursor.ts:12` | 1-liner | 4 | `App.tsx` / `chrome/gestures.ts` |
| **W1-17** | **The Connections settings actually gate what you can draw** | `appSettings.tsx:187` persists a 9-rule `EdgePolicy`; `wireGesture.ts`'s `connectionRules()` hardcodes `{portsOf, policy:{allowFanIn:true}}` and never reads it. Toggling "allow cycles" changes nothing. | `settings/edgePolicy.ts:268`, `connectionRules.ts:130-135` | S | 5 | `shapes/wire/wireGesture.ts` |
| **W1-18** | **Polarity rule goes live** | `in→in` is silently fine. `validateConnection` takes `directionOf`; `lint.ts:458` registers a `polarity` rule; `ss-port.direction` is right there. Nobody supplies the argument — at drag time *or* at rest. | `connectionModel.ts:93` | 1-liner | 4 | `shapes/wire/wireGesture.ts`, `chrome/problems.ts` |
| **W1-19** | **Type-mismatch rule goes live** | `Pose → bytes` is silently fine. Same shape as W1-18: `typeOf` hook exists in both `edgeValidation.ts:190` and `lint.ts:479`, supplied by nobody. | `connectionModel.ts:136` | 1-liner | 3 | `shapes/wire/wireGesture.ts`, `chrome/problems.ts` |
| **W1-20** | **A refused connection says why** | `wireGesture.ts:400-404` says out loud *"A refusal is silent for now, and that is a gap with an owner."* The verdict is already Diagnostic-shaped. | `connectionRules.ts:40-64` (11 named refusal codes) | 1-liner | 5 | `shapes/wire/wireGesture.ts` |
| **W1-21** | **Eligible-port highlight while a cable is in flight** | The legal dots light the moment a cable starts moving. **The `Port` component already has `hinting`, `availability` and `dimmed`; `BlockFace` passes none of them.** | `blocks/ports/portState.ts:39-47,103` | S | 5 | `shapes/wire/wireGesture.ts`, `shapes/block/BlockFace.tsx`, `shapes/port/PortFace.tsx`; wire `@trunk/scene/availability` |
| **W1-22** | **Magnetic port snapping on drop** | Land *near* the dot, not on it. Today `dotUnderPoint` requires the release over an actual `[data-slot="port-dot"]`. | `blockPorts.ts:39,525` (13px screen radius) | S | 4 | `shapes/wire/wireGesture.ts` |
| **W1-23** | **Nearest LEGAL dot wins** | Refusal judged per candidate in distance order, so an illegal dot never shadows a legal one behind it. Today `elementsFromPoint` returns the first dot and legality is asked afterwards, silently. | `connectionRules.ts:339` | S | 3 | `shapes/wire/wireGesture.ts` |
| **W1-24** | **The edge-drop catalogue: 14 presets, not 1** | Drop a cable in space and pick from a real domain vocabulary — Call · Transform · Branch · Store · Sink · Source · Value · Bundle · Unbundle · Copy · Set attributes · Select · Clock/Trigger · Expanded group. The trunk **deliberately** leaves this table to the host (`nodeCatalog.ts:12-20`). | `blockPicker.ts:37-54` | S | 5 | `shapes/wire/dropMenu.tsx` *(one array)* |
| **W1-25** | **Picker opens 120px along the cable's direction** | The offered node appears where the cable was heading, not under the cursor. | `PointingBlockPort.ts:40,117` | 1-liner | 2 | `shapes/wire/dropMenu.tsx` |
| **W1-26** | **Ctrl+F opens board Find & Replace** | bbox-ui has **no board text search at all**. `@trunk/components/boardSearch` is built and tested; `QuickSwitcher` has a `searchSources` prop (`:80`) that turns the whole Find half on. The app passes neither. | `SystemSketchChrome.tsx:1043`, `commands/boardSearch.ts` | S | 5 | `chrome/devtools.tsx` |
| **W1-27** | **Ctrl+P also opens the palette** | Three chords land on the right tab. Ctrl+P today hits tldraw's stock print action. | `SystemSketchChrome.tsx:1052-1062` | 1-liner | 2 | `chrome/devtools.tsx` |
| **W1-28** | **Escape closes the most-recent surface (LIFO)** | With a panel and a palette open, Escape peels newest-first. Today `panels.tsx:106` closes the one open right panel, bubble phase, no stack. **Carry the donor's two exemptions** (the inspector dock and an open toolbar surface own their own Escape). | `chrome/chromeState.ts`, `ChromeProvider.tsx:81-101` | S | 3 | `chrome/panels.tsx`, `chrome/overlay.tsx` |
| **W1-29** | **`C` and `O` both arm Ellipse** | Two drawing habits (Excalidraw C, Figma O) both reach the circle. Same `releaseShortcut` machinery as W1-01. | `code/codeToolUi.tsx:17-34` | 1-liner | 3 | `chrome/dock.tsx`, `chrome/families.tsx` |
| **W1-30** | **Window title names the open board** | Two open boards are tellable apart from the taskbar. | `LocalWorkspace.tsx:1141-1143` | 1-liner | 3 | `files/session.tsx` |
| **W1-31** | **Action-outcome toasts** | Every one-shot action says what it did; an illegal drag says why it refused. `useToasts` is already wired — for file errors only. | `SystemSketchChrome.tsx:733-745,1000-1045` | 1-liner | 2 | `chrome/chromeBar.tsx`, `shapes/wire/wireGesture.ts` |
| **W1-32** | **Interface-scale re-measure of floating surfaces** | Floating chrome re-places itself when scale changes instead of sitting at the old size's coordinates. `floatingToolbar.tsx:133-147` uses `ResizeObserver` only. | `SelectionContextualMenu.tsx:117-120` | 1-liner | 2 | `chrome/floatingToolbar.tsx` |
| **W1-33** | **Producers count on the standalone `ss-port`** | A floating port with three cables shows no count; `ss-block`'s ports do. | his own 2026-09-19 ruling, `bboxUi/core/port.tsx:336` | 1-liner | 4 | `shapes/port/PortFace.tsx` |
| **W1-34** | **Corner cluster flush over the licence watermark** | He asked **twice** (SystemSketch:657, :766) and it reads as unresolved to him. The real fix is a `TLDRAW_LICENSE_KEY` in the environment — `vite.config.ts` already reads it. | — | 1-liner + env | 4 | `.env` / deploy, `chrome/overlay.tsx` |
| **W1-35** | **`Shift+H` hit-area overlay (dev builds)** | Paints every hit region from the same functions the hit tests call. **This is the instrument you need to fix W1-02, W1-21, W1-22 and W2-19 honestly** — build it first inside this wave. | `blocks/ui/HitAreaOverlay.tsx:53-67` | S | 1 | `chrome/devtools.tsx`, **new** `chrome/hitAreaOverlay.tsx`; reuse `@trunk/hitRegions/` |

---

## Wave 2 — the mounting wave. Built, tested, unimported.

*Everything here exists in `apps/storybook-basics/src/` or in `packages/` and is not referenced by `apps/systemsketch/src`. This is hook-up work, and it is the best value-per-line on the entire document.*

### 2A · Drafts + Compare (the committed-red acceptance)

| # | Feature | What it does | Donor | Effort | Notice | Write set |
|---|---|---|---|---|---|---|
| **W2-01** | **Drafts chip beside the file title** | GitHub-style branch chip showing Main or the active draft with a count; popover to create/rename/delete/switch. `ChromeBar` **reserves the seat** (`chromeBar.tsx:176 draftChip?: ReactNode`) and the app never passes it. | `TitleBar.tsx:452-495`, `drafts/DraftsControl.tsx` | S | 5 | `chrome/chromeBar.tsx`; mount `@trunk/components/{branchChip,draftModel}` |
| **W2-02** | **Draft-mode bar** | `← Exit · Draft 1 · ⋯ · Compare N Changes · Merge` — a real chrome row that pushes the canvas down. **Quiet IcePanel variant only** (see Do-not-build). | `drafts/DraftModeBar.tsx` (465 lines) | S | 5 | `chrome/overlay.tsx`, **new** `chrome/draftBar.tsx`; mount `@trunk/components/{draftBar,draftChanges}` |
| **W2-03** | **Draft engine — fork, count, rebase, merge, pin version** | `@trunk/components/draftModel.ts` is a 426-line verbatim port with 452 lines of passing tests (`mergeDraft:370`, `rebaseDraft:322`, `pinVersion:349`). Zero callers. | `drafts/draftModel.ts` | S | 5 | **new** `document/drafts.tsx`; `App.tsx` |
| **W2-04** | 🔴 **Autosave suspends while a draft is held** | **Land this WITH W2-01/02/03 or drafts autosave over Main.** The donor's poll guard says it cannot tell "the draft is editing" from "Main changed on disk". | `LocalWorkspace.tsx:146-152,1062-1067` | S | 5 | `files/session.tsx` |
| **W2-05** | **Compare dialog + trigger + `Shift+D`** | History rail, side-by-side board render, property table with word diffs, code view. `compareDialog/compareModel/compareReview/compareSource/propertyTable/propertyRows/codeView/lineDiff/wordDiff` **all exist**; only `draft.smoke.test.tsx` touches them. | `compare/CompareDialog.tsx` (1,127 lines) | M | 5 | **new** `chrome/compare.tsx`; `chrome/overlay.tsx`, `chrome/chromeBar.tsx`, `App.tsx` |
| **W2-06** | **Board history rail data source** | The *presentation* is ported (`historyList.tsx`) but **nothing turns the `<stem>.vN.systemsketch` siblings beside the board into rows** — `boardHistoryRecords`/`discoverVersions`/`buildVersionChain` did not travel. | `history/boardHistory.ts` | M | 2 | **new** `document/boardHistory.ts`; `scripts/systemsketch_files.py` (sibling listing) |

### 2B · The inspector dock

| # | Feature | What it does | Donor | Effort | Notice | Write set |
|---|---|---|---|---|---|---|
| **W2-10** | 🔴 **Right-rail inspector dock, any subject** | Select anything and a right panel opens with an editor for it. **Today selecting a Block tells you nothing, anywhere.** | `SystemSketchChrome.tsx:271-296` | M | 5 | **new** `chrome/inspector.tsx`; `chrome/panels.tsx`, `chrome/statusStrip.tsx` **(BARRIER on `ChromePanel`)** |
| **W2-11** | **Inspector subject precedence + header ownership** | Decides which of seven panels a mixed selection resolves to, and whether the dock or the panel draws the title. | `chrome/inspectorSubject.ts` | S | 3 | **new** `chrome/inspectorSubject.ts` |
| **W2-12** | **Auto-opens on selection, remembers dismissal** | Clicking a shape opens its panel; closing it makes the close stick for that run of selections. | `SystemSketchChrome.tsx:810-830,1063-1076` | S | 4 | `chrome/inspector.tsx` |
| **W2-13** | **Shape Facts panel — the inspector for an ordinary shape** | Position, size, rotation, colour/fill/dash/size/font, line style, edge colour, thickness, Locked, Opacity + zoom-to-selection, unlock, slanted-routing toggle. **No schema change needed — this is the cheapest real inspector.** | `chrome/ShapeFactsPanel.tsx` (204), `shapeFactsModel.ts:96-190` | M | 4 | **new** `chrome/shapeFacts.tsx` |
| **W2-14** | **Connection (cable) inspector** | Routing, temporal kind, delay, tunnel, animation — per cable. | `blocks/ui/ConnectionInspector.tsx` (532) | M | 4 | **new** `chrome/inspectors/connection.tsx` |
| **W2-15** | **Right rail carries five surfaces + designed empty state** | Donor: `comments | inspector | board-overview | diagnostics | variable-registry`. bbox: `"frames" \| "problems"`. | `chrome/chromeState.ts:6` | S | 4 | `chrome/statusStrip.tsx` **(BARRIER)**, `chrome/panels.tsx` |

### 2C · Canvas + interaction ports

| # | Feature | What it does | Donor | Effort | Notice | Write set |
|---|---|---|---|---|---|---|
| **W2-20** | 🔴 **A block can be renamed on the canvas** | `ss-block` has **no `canEdit` override** and `BaseFrameLikeShapeUtil` supplies none, so `canEdit()` defaults false. No double-click-to-edit, no click-to-edit, no caret on a freshly drawn block. The only rename path in the app is the Frames panel. | `BlockShapeUtil.tsx:407,415-441` | M | 5 | `shapes/block/BlockShapeUtil.tsx`, `shapes/block/BlockFace.tsx`, **new** `shapes/block/inlineEdit.tsx` |
| **W2-21** | **Second click on a selected block opens the clicked field** | Two unhurried clicks — activate, then edit — instead of a rapid double-click. Guard on plain unmodified left click only. | `blocks/blockClickToEdit.ts:1-26,64-72` | S | 4 | **new** `shapes/block/clickToEdit.ts`, `App.tsx` |
| **W2-22** | **A freshly drawn shape opens its caret (never an arrow/line)** | Draw a box and start typing its name in one gesture. | `instantTextEditing.ts:1-60` | S | 4 | **new** `shapes/shared/instantText.ts`, `App.tsx` |
| **W2-23** | 🔴 **Press a simple/port-view block's BODY to select and drag it** | `pointerOwnership.ts:41-45` hides every press that isn't on `[data-slot="block-header"]`. Correct for *expanded*; wrong for simple and port views, where the donor's body is `isFilled: true`. | `BlockShapeUtil.tsx:494-513` | S | 5 | `shapes/shared/pointerOwnership.ts`, `blockHitTest.smoke.test.tsx` |
| **W2-24** | **Hover a block to reveal its quiet port dots** | A Simple block reads as a clean card until hovered. `grep -i hover apps/systemsketch/src` returns only Tailwind classes on chrome buttons. | `blocks/ui/block-canvas.css:1184-1191` | S | 3 | `shapes/block/BlockFace.tsx`, `app.css` |
| **W2-25** | **Wrap selection into Frame / Group / Block / Branch region** | Select shapes, wrap them in a container drawn around where they already are. `PARITY-SPEC` calls it *"the best value-per-line on this list. Half a day."* | `frames/wrapSelection.ts:43-103` | M | 4 | **new** `chrome/wrapSelection.ts`, `chrome/selectionClusters.tsx` |
| **W2-26** | **Reliable context menu** | Right-click works the second and third time. bbox uses `DefaultContextMenu` verbatim — the exact component the donor had to replace for tldraw 5.3.2. ⚠️ **Reproduce before building** — may not fire in this composition. | `blocks/ui/ReliableContextMenu.tsx:18-28` | S | 4 | `source/sourceContextMenu.tsx`, `App.tsx` |
| **W2-27** | **Domain right-click menu** | Right-click a Block/port/table/cable and get the domain vocabulary — Block view ▸, Type…, Ports ▸, Advanced ▸, Routing ▸, Edge type ▸, Turn into ▸, Add leader, Remove from container, Detach/Rebuild. 40 rows in the donor; bbox has stock + one conditional group. *(Rows gated on W3 schema land later.)* | `blocks/ui/BlockContextMenu.tsx` (891 lines) | M | 5 | `source/sourceContextMenu.tsx`, **new** `chrome/domainContextMenu.tsx` |
| **W2-28** | **Right-click a PORT and get port-scoped rows** | The menu's subject is the thing under the pointer. Add port above/below, Move up/down, Move to ▸, Mark unknown, Delete port. | `blocks/ports/portInteraction.ts:76-82` | M | 4 | `shapes/block/BlockFace.tsx`, `chrome/domainContextMenu.tsx` |
| **W2-29** | **Detach to primitives / Rebuild from primitives** | Explode a semantic shape into raw tldraw and back. `packages/adapter-tldraw/src/detach/` and `@trunk/detach/rebuildContextMenu.tsx` are built and unimported; no detachable kind is registered for any `ss-*`. | `detach/registeredKinds.ts:23-34`, `detachSweep.ts` | M | 4 | `shapes/*/index.ts` (register kinds), `source/sourceContextMenu.tsx` |
| **W2-30** | **Propagation focus lens** | Slide upstream N / downstream M and everything unreachable dims. `@trunk/scene/focus.ts` is a **verbatim port** and `@trunk/editor/focusControls.tsx` exists; neither imported. Note: the pill's current "Focus" is `zoomToSelection` — a different feature wearing the word. | `propagation/propagationFocus.ts` (434) | M | 5 | **new** `chrome/focusLens.tsx`, `chrome/selectionClusters.tsx` |
| **W2-31** | **Full / Focus / Isolated scene modes** | Click a Block and everything unrelated dims (Focus) or disappears (Isolated); dragging never triggers it. | SystemSketch:2960, 2392 | M | 4 | `chrome/focusLens.tsx`, `App.tsx` |
| **W2-32** | **Tunnel edges + tunnel layer bar** | A long cable ducks into a named layer and reappears. `@trunk/components/tunnel.ts` is a verbatim port; `@trunk/scene/layers.ts` too; `Trace` takes a `tunnel` prop. ⚠️ needs one additive `ss-wire` prop pair. | `tunnelEdge.ts:34,71`, `tunnelLayers.ts:21` | M | 3 | `shapes/wire/WireShapeUtil.tsx` *(additive)*, `WireFace.tsx`, **new** `chrome/tunnelBar.tsx` |
| **W2-33** | **Shape library browser + left Library popout + on-canvas Primitive Search** | Search/browse shape families with a Recents row and insert one. **The dock's Library slot is a literal "Coming soon / Nothing here yet" placeholder** (`dock.tsx:249-259`). `S` today opens a *centred* dialog; the donor anchors it at the cursor. | `library/ShapeLibraryBrowser.tsx` (198), `PrimitiveSearch.tsx` (160) | M | 4 | `chrome/dock.tsx`, **new** `chrome/library.tsx`, `chrome/devtools.tsx` |
| **W2-34** | **Command palette carries board commands** | `devtools.tsx:233` hands `QuickSwitcher` only `editor.setCurrentTool` rows. The donor's palette has 22 board commands with live `disabled()` gates, each printing its chord. | `SystemSketchChrome.tsx:833-1050` | M | 5 | `chrome/devtools.tsx`, **new** `chrome/commands.ts` |
| **W2-35** | **`S` guard set: dragging, readonly, editor-focus** | `quickSwitcherKeyDecision` is better than the donor's in three ways and thinner in three. Close the three. | `library/PrimitiveSearch.tsx:93-98` | 1-liner | 2 | `@trunk/components/commandModel.ts`, `chrome/devtools.tsx` |

### 2D · Appearance vocabulary

| # | Feature | What it does | Donor | Effort | Notice | Write set |
|---|---|---|---|---|---|---|
| **W2-40** | **FigJam 21-colour palette + custom colour picker with alpha** | His palette, 11-wide grid, not tldraw's 13. Plus a Custom cell mapped onto the document model, with Ctrl+Z working *inside* the picker. | `appearance/figjamPalette.ts:1-21`, `customColors.ts` | M | 4 | `chrome/selectionClusters.tsx`, **new** `chrome/palette.ts` |
| **W2-41** | **Line thickness + independent stroke colour** | A connector's weight and edge colour change without dragging its label's font size or colour along. `strokeMeta` exists in trunk `controlValue.ts`. | `contextualControlRegistry.ts:155-164`, `strokeMeta.ts` (499) | M | 3 | `chrome/selectionClusters.tsx` |
| **W2-42** | **Custom font size (px) with rung labels** | s/m/l/xl plus a Custom px cell, so "Extra large" never prints two different pixel sizes. | `appearance/customFontSize.ts` (234) | S | 2 | `chrome/selectionClusters.tsx` |
| **W2-43** | **Async line pattern on edges** | A sixth dash style meaning "asynchronous", settable from the pill. `ss-wire.variant` already has `async` and **nothing in the app sets it** — only the Python round-trip does. | `appearance/asyncEdge.tsx` | S | 2 | `chrome/selectionClusters.tsx`, `chrome/selectionActions.ts` |
| **W2-44** | **Code pill: line numbers, character width, font scale, 9 languages** | Sizes a cell by *columns* not pixels, so code never reflows unexpectedly. bbox has 4 languages and a dropdown. ⚠️ additive `ss-code` props. | `code/CodeSelectionControls.tsx` (266), `codeModel.ts:106-116` | M | 3 | `shapes/code/CodeShapeUtil.tsx` *(additive)*, `chrome/floatingToolbar.tsx` |
| **W2-45** | **Multi-Block batch write of the view switch** | Select ten Blocks, press Expanded, all ten switch. Today gated on `subject.only`. | `BlockSelectionMiniMenu.tsx:71-84` | 1-liner | 3 | `chrome/floatingToolbar.tsx`, `chrome/selectionActions.ts` |
| **W2-46** | **Block-title formatting pill while editing** | Typing a title swaps the pill for a text formatter; the shape pill never sits over your typing. *(Formatting props are W3; the swap itself is W2.)* | `BLOCK_TITLE_CONTEXTUAL_RECIPE`, `SystemSketchChrome.tsx:704+` | M | 5 | `chrome/floatingToolbar.tsx` — **depends on W2-20** |
| **W2-47** | **Selectable VS Code syntax theme** | `codeEditorTheme.ts` + tests + a story exist; no Settings row exposes it and the app never sets one. | bbox-ui:1520 | 1-liner | 2 | `chrome/appSettings.tsx` |

### 2E · Files, state and export

| # | Feature | What it does | Donor | Effort | Notice | Write set |
|---|---|---|---|---|---|---|
| **W2-50** | **External-change watcher** | Notices within ~1.5s that another window rewrote the file. The whole external-change half is gone; only the digest *fence* exists. | `LocalWorkspace.tsx:1048-1110` (1500ms single-flight) | M | 4 | `files/session.tsx`, `@trunk/files/workspaceModel.ts` *(restore `nextSyncAction`/`canApplyExternalReload`)* |
| **W2-51** | **Conflict banner with three named recoveries** | A persistent bar — Use disk version / Save my version as… / Overwrite — not one toast plus a red dot telling you to use the menu yourself. | `LocalWorkspace.tsx:1250-1334` | M | 4 | `files/session.tsx`, **new** `chrome/workspaceAlert.tsx` |
| **W2-52** | **"Moved or deleted" state** | The app stops autosaving into a void and says so. | `LocalWorkspace.tsx:100,1096,1279` | S | 3 | `files/session.tsx` |
| **W2-53** | **Autosave retry with backoff** | `AUTOSAVE_RETRY_DELAYS_MS = [1000,3000,8000]` and `autosaveRetryDelay` **are ported and unit-tested in the trunk with no caller.** | `workspaceModel.ts:25` | 1-liner | 3 | `files/session.tsx` |
| **W2-54** | **Boot loading + retry screen, and fallback to first readable recent** | A failed launch board shows status and a Retry instead of a blank canvas. | `LocalWorkspace.tsx:263-278,1233-1248` | S | 2 | `files/launchConfig.ts`, `files/session.tsx`, `main.tsx` |
| **W2-55** | **Dismissible top notice strip + recorder indicator placement** | A one-line status above the canvas, and a notice while a take is recording so you cannot forget. | `LocalWorkspace.tsx:1338-1350`, `chrome/topNoticePlacement.ts` | S | 3 | `chrome/overlay.tsx`, `chrome/devtools.tsx` |
| **W2-56** | 🔴 **`toSvg` on the custom shapes** | **This fails quietly today.** No `ss-*` util defines `toSvg`, so tldraw 5.3.2 wraps the React component in a `<foreignObject>` (`getSvgJsx.mjs:244-258`) — renders in Chrome, blank in Inkscape/Illustrator — *while the burger's Export ▸ SVG/PNG rows are live.* | `BlockShapeUtil.tsx`, `CodeShapeUtil.tsx`, `ConnectionShapeUtil.tsx:897-940` | M | 3 | `shapes/{block,code,port,region,wire}/*ShapeUtil.tsx` |
| **W2-57** | **Portable share / export to stock `.tldr`** | A top-right popover that downloads the board flattened to stock primitives, built in a *second* editor so the visible board never flashes. Depends on W2-29. | `export/portableTldraw.ts`, `PortableShareButton.tsx` | M | 2 | **new** `chrome/portableExport.ts`, `chrome/chromeBar.tsx` |
| **W2-58** | **Multi-page `.tldr` consolidated to one canvas of Frames** | Open a multi-page board today and pages 2..n are in the document, **invisible, with no way to reach them** — bbox ships no page UI. | `singlePageDocument.ts` | M | 3 | **new** `files/consolidatePages.ts`, `files/session.tsx` |
| **W2-59** | **Stale-connection cleanup** | A board whose blocks lost a *port* opens without half-attached cables. `WireBindingUtil` handles a lost shape, not a lost port. | `ConnectionBindingUtil.ts:555` | S | 2 | `shapes/wire/WireBindingUtil.ts`, `files/session.tsx` |
| **W2-60** | **Frames panel: drag-reorder + double-click to focus + saved camera views** | ⚠️ **Needs Zach's yes** — `panels.tsx:58-64` refuses on the record: *"this lane does not get to mint a persisted field from a panel."* But he asked for the outline view and landmarks in the vault. `FramesPanel` already has `saveView`/`reorder` props and mounts dnd-kit internally; `@trunk/components/framesOrder.ts` exists. **Recommendation: ship it, page-meta keyed, reversible.** | `framesPanelModel.ts`, `landmarks/boardLandmarks.ts:6-12` | S | 3 | `chrome/panels.tsx`, `chrome/frames.ts` |
| **W2-61** | **Comments panel + comment records** | Threads anchored to shapes, with reply/resolve/delete and a source reference — a whole persisted record type absent from the schema (`createTLStore` gets no `records` option). | `comments/LocalCommentsPanel.tsx` (312), `commentModel.ts:20-26` | L | 3 | `document/store.ts`, **new** `chrome/comments.tsx`, `chrome/statusStrip.tsx` |
| **W2-62** | **Version badge + changelog + "am I on the latest?"** | `devtools.tsx:138` hardcodes `version: "0.1.0"`. No changelog, no last-updated stamp, no update check. | SystemSketch:3411-3425 | S | 3 | `chrome/devtools.tsx`, `vite.config.ts`, `scripts/bboxui_server.py` |

---

## Wave 3 — real work, well-specified. Schema first.

### 🔴 W3-BARRIER-A · The block + port schema

**Land this alone, on a committed baseline, before any lane that reads `ss-block` or `PortSpecV`. Every Wave-3 block/port item and half of Wave 2's inspector depend on it. Two files; a dozen lanes import them.**

Write set: `shapes/block/BlockShapeUtil.tsx`, `shapes/shared/props.ts`, plus a **real** `createShapePropsMigrationSequence` (today `sequence: []` on every util — correct for a fresh schema, and every prop below needs one).

| # | Field(s) | Donor | Notice |
|---|---|---|---|
| W3-01 | `description` + `showDescription` (eye toggle on hover) | `blockModel.ts:428,468` | 5 |
| W3-02 | `blockType` (the kind label) | `blockModel.ts:429` | 4 |
| W3-03 | `icon` + `assetId` — **named exactly `assetId`** so tldraw's copy/export scan carries it | `blockModel.ts:439,460` | 5 |
| W3-04 | Title typography: `titleSize/titleFont/titleAlign/titleBold/titleColor` (incl. `custom-rrggbb`) | `blockModel.ts:420-425` | 4 |
| W3-05 | `headerAlign`, `showFooter`, `showHeaderDivider`, `notes` | `blockModel.ts:427,470,472,474` | 2 |
| W3-06 | `foldable` / `folded` / `foldControlSide` | `blockModel.ts:431-435` | 4 |
| W3-07 | `autoResize` + `blockAutoResize.ts` (`BLOCK_AUTO_RESIZE_PADDING_PX = 56`) | `blockModel.ts:437` | 5 |
| W3-08 | `views: {simple, port, expanded, value}` — **per-view remembered size** | `blockModel.ts:462-467` | 5 |
| W3-09 | `portLayout` (offset ↔ inline), a StyleProp | `blockModel.ts:486` | 4 |
| W3-10 | Member stack: `memberLayout/insetBackground/bodyLayout/memberGap/memberGutter/memberWidth`, `expandedWeights` | `blockModel.ts:488-498,517` | 4 |
| W3-11 | `definitionId/definitionKey/draftOrdinal` | `blockModel.ts:518-522` | 4 |
| W3-12 | `stockConfig {triggerSource, rateHz}` | `blockModel.ts:369-373` | 2 |
| W3-13 | Port: `defaultValue` (`window: int = 5`) | `blockModel.ts:262` | 5 |
| W3-14 | Port: `visible` (+ the `+X more` overflow chip) | `blockModel.ts:260` | 3 |
| W3-15 | Port: `row` / `branch` (heading band, parallel lanes, output arms) | `blockModel.ts:264-278` | 3 |
| W3-16 | Diff lens: `state`, `fieldDiffs`, `priorPose` on block and port | `blockModel.ts:502-516,330,345` | 2 |

### 🔴 W3-BARRIER-B · The wire route schema

**Same discipline. `ss-wire` has no persisted route and no `getHandles` — that single fact kills six features. `@trunk/components/{traceEditor,trace.handles,trace.bends,elbow/elbowPins,trace.tidy}` are all already ported and quote the donor line-for-line.**

Write set: `shapes/wire/WireShapeUtil.tsx`, `shapes/wire/wireGeometry.ts`, `shapes/wire/WireBindingUtil.ts`.

| # | Feature | Donor | Notice |
|---|---|---|---|
| W3-20 | `elbowRoute` + `routeMode` (automatic \| authored), `pins`, `curve`, `bends` | `ConnectionShapeUtil.tsx:236-252` | 5 |
| W3-21 | **Terminal handles — drag a cable's end to another port.** Today a wrong wire must be deleted and redrawn. | `ConnectionShapeUtil.tsx:556-563,765-833` | 5 |
| W3-22 | Rail / segment drag to hand-route an elbow (mount `traceEditor.tsx`) | `:583-614,679-760` | 4 |
| W3-23 | Midpoint drag bends a straight cable into a curve | `:616-630,662-677` | 3 |
| W3-24 | Reconnect: pressing an already-wired dot grabs that cable (+ the capture-phase press arbitration) | `connectionHit.ts:52-66`, `installConnections.ts:37-71` | 4 |
| W3-25 | Interior controls reveal on approach (`PAD 24px`, `MIN 64px`) | `connectorControlVisibility.ts:18-59` | 2 |
| W3-26 | **Tidy edges** (mount `trace.tidy.ts` — the outcome sentence is already ported verbatim) | `tidyEdges.ts:132` (344 lines) | 5 |
| W3-27 | **Reset routing to automatic**, gated on `connectionHasCustomRoute` | `resetEdges.ts:59` | 4 |
| W3-28 | Delay value + draggable pill along the cable (`z⁻¹ = 1.0`, clamp 0.05–0.95) — mount `traceBadge.tsx` | `:254`, `connectionModel.ts:47-56` | 3 |
| W3-29 | Marching-ants `animated`, opt-in per cable | `:262` | 2 |
| W3-30 | Cable reparented into its scope + `PortFace` (outer/inner identity) | `ConnectionBindingUtil.ts:492-534`, `connectionModel.ts:76-96` | 3 |

### 3C · Everything else that is real work

| # | Feature | What it does | Donor | Effort | Notice | Write set |
|---|---|---|---|---|---|---|
| **W3-40** | **Depth navigation** | Double-click into a Block's body as if it were a page — stepped-in visibility, camera frame, breadcrumbs, a viewport-move journal, back/forward. **This unblocks four dead chrome seats** (`crumbs={[]}`, `depth={0}`, `canGoBack:false`, `onJumpToLevel: ()=>{}`) whose renderers are already ported. | `depth/depthNavigation.ts`, `blockVisibility.ts:23-30`, `BlockShapeUtil.tsx:428-453` | L | 5 | **new** `document/depth.ts`, `shapes/block/BlockShapeUtil.tsx`, `chrome/chromeBar.tsx`, `App.tsx` |
| **W3-41** | Depth history on BrowserBack/Forward keys and mouse buttons 3/4, swallowing Chrome's own gesture | `depth/useDepthHistoryInputs.ts:44-77` | S | 3 | `chrome/chromeBar.tsx` — **after W3-40** |
| **W3-42** | **Add and remove ports at all** | Add a port to a block, rename it, retype it, delete it. Today the *only* port mutation in bbox-ui is reorder-within-a-rail; ports arrive from the pyblocks scene or the drop menu's fixed 1-in/1-out block. | `BlockInspector.tsx:1774,1910`, `blockCommands.ts` | M | 5 | `shapes/block/BlockFace.tsx`, `chrome/inspectors/block.tsx` — **after W3-BARRIER-A** |
| **W3-43** | **"+ add a port here" bead on lane-edge hover** | Ports added by pointing at the wall where you want one — laid out from the *hypothetical* block so the affordance cannot drift. | `blocks/ports/portAffordances.ts:1-60,94,179` | M | 4 | `shapes/block/BlockFace.tsx`, `@trunk/components/blockPort.tsx` |
| **W3-44** | **Port type drawn on the rail** | `BlockFace.tsx:53` drops the type with a 30-line WHY (two labels overlap at 160px) **and names the fix it owes: a `secondary` slot on `PortEdgeItem`.** | `PortSignatureField.tsx` | M | 5 | `@trunk/components/portEdge.tsx`, `shapes/block/BlockFace.tsx` |
| **W3-45** | **Long-press a port to reorder; press it to wire** | The donor's split. bbox reorders on an immediate 4px drag, so `wireGesture.ts:327` has to `stopPropagation` to keep the two apart. | `PointingBlockPort.ts:180-216`, `portInteraction.ts:99` | M | 3 | `shapes/wire/wireGesture.ts`, `@trunk/components/portEdge.tsx` |
| **W3-46** | **The block inspector itself** | Tabbed; view, header alignment, footer, divider, folding, fold side, auto-fit, port layout, body/member layout, inset background, member width, per-port state, semantic tags. Plus a **multi-select batch** inspector with mixed values. | `BlockInspector.tsx` (2,693), `BlockBatchInspector.tsx` | L | 5 | `chrome/inspectors/block.tsx` — **after W3-BARRIER-A + W2-10** |
| **W3-47** | **Definition linking** | Same name = same thing; rename one and every occurrence follows, with a badge, Unlink and Duplicate-unlinked. `@trunk/scene/linking.ts` is a **727-line verbatim port**, unimported; `definitionTable.ts` too. | `definitions/definitionLinking.ts:677` | M | 4 | `document/`, `shapes/block/`, mount `@trunk/scene/{linking,definitionTable}` |
| **W3-48** | **Group / ungroup algebra (collapse ↔ expand)** | Wrap a selection into a container promoting every crossing cable into a port, and unwrap. `@trunk/scene/collapse.ts:4-6` carries his own quote: ***"This is going to be the bread and butter of what we are doing here!!!"*** Complete, tested, unimported. | `frames/wrapSelection.ts`, `detach/` | M | 5 | mount `@trunk/scene/collapse`, `chrome/selectionClusters.tsx` |
| **W3-49** | **Containment judge (schema-declared nesting)** | f(scene, re-parent) → verdict — the containment twin of edge validation. He explicitly asked: *"this is exactly the schema that would allow us to do that!… lets implement this."* `@trunk/scene/containment.ts` exists, unimported. | `connectionScope.ts`, `branchScope.ts` | M | 3 | mount `@trunk/scene/containment`; `shapes/*/ShapeUtil.tsx` `onDragShapesIn` |
| **W3-50** | **Batch wiring (wire-within / wire-to)** | Drag from a *rail* and every compatible port pairs up, unavailable ones hidden as you go. `@trunk/scene/{batchWire,batchWireJudge}` built, unimported. | `batchWiring.ts` (473), `wireIntoState.ts` | M | 3 | mount `@trunk/scene/batchWire`, `shapes/wire/wireGesture.ts` |
| **W3-51** | **Magnetic wire proposals** | Move a node near a compatible port and a dotted proposal draws itself, committing on drop. `apps/storybook-basics/src/magnet/` is built and imported by nothing in the app. | bbox-ui:2908-2930 | M | 3 | mount `@trunk/magnet/*`, `App.tsx` |
| **W3-52** | **Errors bubble through collapsed groups** | A fault inside a collapsed container shows on the container; expand and it moves to the offender. `@trunk/scene/bubble.ts` carries his quote, unimported. | `blockVisibility.ts` | S | 4 | mount `@trunk/scene/bubble`, `chrome/problems.ts`, `shapes/block/BlockFace.tsx` |
| **W3-53** | **Invalid-state highlighters on the shape** | Stroke halo, mask, badge, squiggle, warning icon with a message popover — the JointJS vocabulary he chose. `@trunk/components/highlighter.tsx` is built and not in the app. | bbox-ui:2212-2244, 2700 | M | 4 | mount `@trunk/components/highlighter`, `shapes/block/BlockFace.tsx`, `shapes/wire/WireFace.tsx` |
| **W3-54** | **Obstacle-aware routing** | Cables route *around* blocks. The A* router (1,080 lines) and the VLSI nudger (623) are ported verbatim; `elbow/traceContract.ts:31-33` says out loud there is **no obstacle COLLECTOR, by design**. Write the collector. | `routingObstacles.ts:154,200,239`, `branchRoutingForbiddenRects:63` | L | 5 | **new** `shapes/wire/obstacles.ts`, `shapes/wire/wireGeometry.ts` |
| **W3-55** | **Organize nodes / ELK auto-layout** | One command lays the graph out; only positions come back from ELK. *"ELKJS seems to be exactly what I want."* ⚠️ orchestrator installs `elkjs`. | `blocks/layout/organizeGraph.ts`, `layoutBlock.ts` (1,674) | L | 4 | **new** `chrome/organize.ts`; `package.json` **(orchestrator-owned)** |
| **W3-56** | **Region: add an arm** | A dashed "+ arm" row under a selected branch; click to add an elif. Today `ss-region.arms` has no authoring affordance beyond `BranchTool.ts:31`'s preset. | `branchModel.ts:41`, `branchCommands.ts` | M | 5 | `shapes/region/RegionShapeUtil.tsx`, `RegionFace.tsx`, `chrome/selectionClusters.tsx` |
| **W3-57** | **Region: case view + active-arm focus fade (0.18)** | Pick one arm; every other arm, its blocks and its cables fade so you can read the live path. | `branchModel.ts:26,39,67` | M | 4 | `shapes/region/*` |
| **W3-58** | **Region: control ports on the band; Loop item port + turn chip** | A branch's condition arrives at named typed ports on its header; a for-loop declares what it emits per turn. | `branchModel.ts:55-68`, `loopModel.ts:69-81` | M | 3 | `shapes/region/*`, `shapes/region/cornerBlock.ts` |
| **W3-59** | **Region/Loop/Branch/Port inspectors** | A panel per region kind for arms, control ports, spacing. | `LoopInspector.tsx`, `BranchInspector.tsx`, `FloatingPortInspector.tsx` | M | 4 | `chrome/inspectors/*` |
| **W3-60** | **Branch arm adoption stamps the arm id** | Dropping a block into the `else:` band files it under `else`, not just "inside the branch". bbox models arms as *props*, so `onDragShapesIn` adopts into the region as a whole. | `BranchArmShapeUtil.tsx:181-198` | M | 3 | `shapes/region/RegionShapeUtil.tsx` |
| **W3-61** | **Pill / value capsule** | Press P, drag, get a capsule holding a literal that wires like any block. *"It is just a preset though of the block… hide the header and footer, calculate the corner radius to be equal to half the height."* Needs `view: "value"`. | `blocks/PillTool.ts`, `blockModel.ts:19` | M | 5 | `shapes/block/*` **(after W3-BARRIER-A)**, `shapes/registry.ts` |
| **W3-62** | **Icon shape + icon picker (lucide / emoji / upload)** | Standalone glyph on the board, click-to-edit, auto-open on create, searchable windowed grid. `packages/glyph-picker` exists and no kit registers it; `dropMenu.tsx:57-59` notes the app mounts **no `GlyphResolverProvider`.** | `icon/IconShapeUtil.tsx:78`, `blocks/ui/iconPicker/` | M | 4 | **new** `shapes/icon/`, `shapes/registry.ts`, `App.tsx` |
| **W3-63** | **Callout (card + independent leader arrows)** + **Async region** | An engineering callout with add/route/delete leaders; a frame that flips contained cables to async. | `callout/calloutModel.ts:28-39`, `asyncRegion/asyncRegionModel.ts:15-38` | M | 3 | **new** `shapes/{callout,asyncRegion}/`, `shapes/registry.ts` |
| **W3-64** | **Convert a rectangle into a Block; double-click empty canvas creates one; "Turn into ▸"** | Three conversion paths he asked for by name. | SystemSketch:2978, :974; `BlockContextMenu.tsx:875` | M | 4 | `chrome/domainContextMenu.tsx`, `App.tsx` |
| **W3-65** | **Search-as-you-type to reuse an existing component, or create it** | Obsidian-style: *"you kill 2 birds with one stone… Commonly created ones show up, so that you don't repeat components."* | `library/primitiveSearchModel.ts` | M | 4 | `chrome/library.tsx`, mount `@trunk/scene/definitionTable` |
| **W3-66** | **Tags on nodes and edges + bottom-left perspective control** | IcePanel's pattern, copied exactly, multi-tag. *"yes lets place it on the bottom."* | SystemSketch:3583-3640 | L | 3 | `document/`, `chrome/overlay.tsx`, **new** `chrome/tags.tsx` |
| **W3-67** | **Custom arrow util: real elbow arrows + `withAsyncEdge` on arrow/line/draw + configured stock geo/text** | The `A`-cycle is wired but the arrow util itself is **stock**, so there is no elbow arrow and no async-edge wrapper; stock text/line/draw arrive unconfigured from `<Tldraw>`. Also unlocks Excalidraw paste with table-cell + async-edge behaviour. | `systemSketchArrow.tsx:1196`, `stockPrimitiveVisuals.ts:275-279` | L | 4 | `shapes/registry.ts` **(BARRIER on `SHAPE_UTILS`)**, `App.tsx` |
| **W3-68** | **Click-to-place an arrow / a connector** | Click once to start, click again to finish — entering tldraw's own `select.dragging_handle` so binding, snapping, shift and Escape stay stock. Plus `A`-then-tap-a-port. | `arrowClickToPlace.ts:19-25` | S | 3 | **new** `chrome/arrowClickToPlace.ts`, `App.tsx` |
| **W3-69** | **Wire the gesture's stand-down rules** | `wireGesture.ts:296` checks only `button !== 0`. No readonly check, no `getEditingShapeId()`, no tool check. **This is a live bug, not polish** — pressing a dot while typing in a block starts a cable. | `installConnections.ts:55-58` | 1-liner | 4 | `shapes/wire/wireGesture.ts` ⚠️ *could be Wave 1 if the wireGesture lane opens early* |
| **W3-70** | **Problems row reveal: all affected shapes + undoable viewport; grouped by page; 4 domain lint rules** | Clicking a row selects **every** shape implicated and pushes a history entry. Plus blank title, duplicate port id, duplicate port name, **input has no value** (unexpressible until W3-13). | `diagnosticsModel.ts:35-38,555-611` | M | 4 | `chrome/problems.ts`, `@trunk/scene/lint.ts` |
| **W3-71** | **Zoom-threshold auto expand/collapse (opt-in)** | *"at a certain zoom-in threshold then it kind of automatically would expand… let's implement this but have this as like an opt-in feature."* | bbox-ui #19 | M | 2 | `chrome/zoomMenu.tsx`, `shapes/block/`, `chrome/appSettings.tsx` |
| **W3-72** | **Drag policy documented and uniform** | One click-and-drag moves a shape whether or not it was selected first; each component declares its drag behaviour and composites inherit it. Needs the policy table, not just `pointerOwnership.ts`. | bbox-ui:2586-2614 | M | 4 | `shapes/shared/pointerOwnership.ts`, `docs/drag_policy_manifest.json` |
| **W3-73** | **Hitbox tuning: on-canvas toggle + live slider in the real hosts** | He asked for the toggle **and** the slider, in tldraw/reactflow, not just the DOM lab. Extends W1-35. | bbox-ui:2306-2330 | S | 2 | `chrome/hitAreaOverlay.tsx`, `chrome/devtools.tsx` |
| **W3-74** | **Annotation mode that still pans, and hides its marks when closed** | *"right now I need to press 3 buttons to enable it and then I cannot move the canvas."* | SystemSketch:3439-3470 | M | 3 | **new** `chrome/annotate.tsx`, `App.tsx` |
| **W3-75** | **Typeface encodes provenance** | Scribbly = whiteboard-origin, mono = from code, sans = UI-derived. `originBadge.tsx` + `source/originResolution.ts` model provenance already; **no font mapping is driven by it.** | SystemSketch:1282-1290 | S | 3 | `shapes/*/[Face].tsx`, `app.css` |
| **W3-76** | **Curated styling vocabulary instead of tldraw's raw enums** | Small fixed set of sizes/weights; name typefaces Simple/Bookish/Technical/Scribbled; hide the two migrated legacy fill values. | SystemSketch:240-248 | S | 2 | `chrome/selectionClusters.tsx` |

---

## Wave 4 — real unbuilt product work

| # | Feature | Scope | Donor | Effort | Notice |
|---|---|---|---|---|---|
| **W4-01** | **The Python expression layer** — *the biggest single gap, no counterpart at all.* Every property box is a live Python expression: collapsed shows the resolved value, focused becomes CodeMirror, autocomplete over a 22-entry safe namespace **plus board variables**, wavy squiggle under unresolved names, and a board-wide Variable Registry panel + parked utility shape. **This is why the donor feels like a tool.** | `scripts/expression_eval.py` (237) + `POST /api/expression/evaluate` + `expression/ExpandingExpressionField.tsx` + `VariableRegistryPanel.tsx` + `variableRegistryModel.ts` + `pythonSafeNamespace.ts:14-37` | XL | 5 |
| **W4-02** | **Behavior Tree family** — BT.CPP v4 XML as the real document, tree↔process projection, control/insert-glyph shapes, orientation/node-face/control-face/edge-style, blackboard + dataflow lenses, drag-to-reorder with live wires, step into/out of subtrees, XML round-trip, **and a run engine** (play/pause/step tick/step transition, scrubber) with a py_trees parity oracle. | `src/behaviorTree/` (39 files), `runtime/BtRunOverlay.tsx`, `btMockEngine.ts` (519), `scripts/behavior_tree_pytrees_parity.py` | XL | 4 |
| **W4-03** | **Table family** — shape, row/col insert/delete/reorder, track resize + distribute, Tab navigation, cell clipboard, selection mini-menu, constraints, auto-populate, reflow. `@trunk/components/table.tsx` exists as a starting point. | `src/table/` (24 files) | L | 3 |
| **W4-04** | **Type Block + Type Mapping + type reference index + autocomplete + jump-to-definition** | `blocks/TypeTool.ts`, `TypeMappingTool.ts`, `babble/{typeReferenceIndex,typeNameCompletion,typeSourceJump}.ts` | L | 4 |
| **W4-05** | **Port-text babble** — author a Block's whole interface as text (`> pose: Pose = 10`), grammar, two-lane and sigil variants, syntax colouring | `blocks/babble/` | L | 5 |
| **W4-06** | **The full port semantics vocabulary** — semantic roles with analyzer provenance, variadic groups, adjacent link runs, the explicit `unknown` token, `mutates`/`effect`/`edgeT` effect ports + `effectPortFollow`, four-sided `commEdge`/`commEdgeT` communication lens. ⚠️ **Check scope: he said "SKIP this for now" on header-line side-effect ports.** | `blockModel.ts:43-98,280-356`, `semanticRoles.ts`, `effectPortFollow.ts` | XL | 3 |
| **W4-07** | **Hyperedge trunks** — cables going the same way merge into one trunk with junctions | `hyperedgeTrunks.ts:663` (680 lines, libavoid JunctionRef) | L | 2 |
| **W4-08** | **`.systemsketch` envelope + future-format guard + legacy pyblocks import** | ⚠️ **Product call, not a bug.** `chrome/fileActions.ts` states the omission deliberately, and a `.systemsketch` row currently navigates to the *archived app*. **His 31 real boards are `.systemsketch`.** Ask him. | `workspace/systemSketchFile.ts:1-126`, `import/legacyPyblocksSystemSketch.ts` | M | 5 |
| **W4-09** | **Embed protocol + VS Code/Cursor extension + Obsidian plugin** — including "Open in standalone" and the Obsidian clipboard override | `src/embed/`, `vscode-systemsketch/`, `obsidian-systemsketch/` | XL | 3 |
| **W4-10** | **Run code on the canvas (Marimo-style Shift+Enter)** + per-node width with no scrollbars | SystemSketch:4413, :4504 | XL | 3 |
| **W4-11** | **pyblocks write-back** — bbox's own unfinished half. `pyblocksConsumer.ts:150-158` prints `applied` *"even though it is always 0 tonight"*. Also surface `semanticKind/role/effect/certainty/sourceSpan` — all five ride in `PyblocksNodeData` and reach no badge, pill or panel. | bbox's follow-up F1 | L | 4 |
| **W4-12** | **Visual (pixel) diff for golden layouts** — *"I changed my mind. we need that visual diff engine when doing the golden layouts."* Only text/semantic diffs exist. | bbox-ui:2726-2732 | M | 2 |
| **W4-13** | **Excalidraw interaction-parity sweep** — the zero-relearning law as a checklist and a suite, not a vibe. *"I don't want to continue having to go through and be like oh hey, I am trying to do something I can usually do in excalidraw but I don't support it yet."* | SystemSketch:4357 | L | 4 |
| **W4-14** | Release channels: `/api/release`, rollback, git build identity, promoted workspace (12 open paths + allowlisted prefs), preview clone. `bboxui_server.py` has health/promote/start-preview only. | `scripts/server.py:503,510,513,877,1033` | M | 2 |
| **W4-15** | Icon fetch proxy (SSRF guard, pinned-IP opener, `image/*` check) — needed by W3-62's URL path | `scripts/server.py:174,224` | S | 2 |
| **W4-16** | `/api/settings/file-access` ("open files anywhere"). ⚠️ `systemsketch_files.py:33` states the omission deliberately; the host's `allow_any_path` parameter still exists with no way to set it. | `scripts/server.py:583,665` | S | 2 |
| **W4-17** | Communication / member-stack / BT scoped dnd hosts + tuning cockpit; prototype digit shortcuts | `SystemSketchChrome.tsx:1084-1093` | L | 2 |
| **W4-18** | Generic always-available scratch board + project-scoped preference overrides | SystemSketch:3508 | S | 2 |

---

## Conflicts — serialize these

**The orchestrator owns `package.json`/lockfile, the fixed-port dev server, the browser pane and the git index. Agents declare deps; they never install.** Batch-install `elkjs` and any CodeMirror language packs before the Wave-3 wave opens.

### Hard barriers — land alone, first, over a committed baseline

| Barrier | Files | Blocks |
|---|---|---|
| **B1 · `SelectionSubject`** | `chrome/selectionActions.ts` | W1-06, W1-07, W1-08, W2-40…46 — every pill lane |
| **B2 · Block/port schema** | `shapes/block/BlockShapeUtil.tsx`, `shapes/shared/props.ts` | W3-01…16, W3-42…46, W3-61, W3-70, W2-46, W4-05, W4-06 |
| **B3 · Wire schema + handles** | `shapes/wire/WireShapeUtil.tsx`, `wireGeometry.ts`, `WireBindingUtil.ts` | W3-20…30, W3-54, W2-32 |
| **B4 · `ChromePanel` union** | `chrome/statusStrip.tsx:36`, `chrome/panels.tsx` | W2-10, W2-15, W2-61, W3-59, W4-01's registry panel |
| **B5 · `SHAPE_UTILS` / `KITS`** | `shapes/registry.ts` | W3-62, W3-63, W3-67, W4-02, W4-03, W4-04 |
| **B6 · `App.tsx`** | install seams, `options`, `ContextMenu`, shape registration | W1-03, W1-14, W2-03, W2-05, W2-21, W2-22, W2-26, W3-40, W3-51, W3-67, W3-68 — **touched by ~12 lanes; batch its edits into one commit per wave** |

### Single-owner files — one lane each, never two in parallel

| File | Items | Note |
|---|---|---|
| `shapes/wire/WireFace.tsx` | W1-02, 04, 05, 06, W2-32, W2-43, W3-28, W3-53 | **Run W1-02…06 as ONE lane.** Five props, one file. |
| `shapes/wire/wireGesture.ts` | W1-17…23, W3-24, W3-45, W3-69 | **One lane.** Nine items, one gesture. |
| `chrome/selectionClusters.tsx` | W1-06, 08, 11, 12, 13, W2-25, 30, 40, 41, 42, 43, W3-26, 27, 48, 56 | **Serialize after B1.** Highest-traffic file on the list. |
| `chrome/floatingToolbar.tsx` | W1-08, 09, 10, 32, W2-44, 45, 46 | Serialize after B1. |
| `chrome/chromeBar.tsx` | W1-30, W2-01, W2-57, W3-41 | Drafts then depth, in that order. |
| `chrome/devtools.tsx` | W1-26, 27, 35, W2-33, 34, 35, 62, W3-73 | One lane. |
| `chrome/panels.tsx` | W2-10, 15, 60, 61, W3-59 | After B4. |
| `chrome/problems.ts` | W1-04, 18, 19, W3-52, W3-70 | One lane. |
| `shapes/block/BlockFace.tsx` | W1-21, W2-20, 24, W3-42, 43, 44, 45, 52, 53 | After B2. |
| `source/sourceContextMenu.tsx` | W2-26, 27, 28, 29, W3-64 | One lane. |
| `files/session.tsx` (1,069 lines) | W1-30, W2-04, 50, 51, 52, 53, 54, 58, 59 | **One lane, and W2-04 must not lag the drafts lane.** |
| `@trunk/components/trace.layout.ts` | W1-06 (marker vocabulary) | Trunk edit — a shared library change; announce it. |

### Semantic conflicts (clean merge, wrong result)

- **W2-01/02/03 (drafts) × W2-04 (draft-hold)** — individually correct, jointly a data-loss bug. **Same lane.**
- **W1-17 (edge policy) × W1-18/19 (polarity, type)** — all three feed `connectionRules()`; the policy shape must be settled before the two hooks land.
- **W1-21 (eligible highlight) × W1-22 (magnet) × W1-23 (nearest legal)** — three answers to "which dot is the target". Design them together.
- **W2-13 (Shape Facts) × W3-46 (Block inspector)** — both claim the dock's default subject. `inspectorSubject.ts` (W2-11) must land before either.
- **W3-54 (obstacles) × W3-26 (tidy)** — tidy replans through the router; the obstacle collector must exist first or Tidy tidies into blocks.
- **W1-02 (wire hit corridor) × W3-24 (reconnect)** — widening the corridor changes what a press on a wired dot resolves to. Re-measure with W1-35's overlay after both.

### Not conflicts — run these fully parallel

`files/*` (W2-50…59) · `shapes/region/*` (W3-56…60) · new shape kits under `shapes/{icon,callout,asyncRegion}/` · `scripts/*.py` (W4-14…16) · docs/report builders.

---

## Verification

Spot-checked live in `/home/bam/bbox-ui-toolbar` @ `claude/floating-toolbars-2026-09-20` before writing:

- **Trunk import list** — grepped every `@trunk/…` specifier in `apps/systemsketch/src`. Confirms `compareDialog`, `draftBar`, `draftModel`, `boardSearch`, `historyList`, `propertyTable`, `traceEditor`, `trace.tidy/handles/bends/crossing`, `tunnel`, `traceBadge`, `wireLayer`, `table`, `highlighter`, `codeView`, `breadcrumb`, `controlPanel`, `detach/*` and `scene/{focus,collapse,linking,containment,availability,bubble,batchWire,layers,regionView,boundary}` are **all absent**.
- **Correction to two sweeps:** `breadcrumb`, `inlineRename`, `toolAliasEditor` and `blockMembers` *are* reachable transitively (via trunk `chromeBar.tsx:53,78`, `settingsCategories.tsx:102`, `region.tsx:60`). Their gap is a **missing prop pass**, not a missing port — which is why W3-40's breadcrumbs are free once depth exists, and why W2-60 is an `S`.
- **`Trace` props** — 25 declared; `WireFace.tsx` passes 8 (`id, from, to, routing, variant, color, terminals, gap`). `interactive`, `hitStrokePx`, `diagnostics`, `crossing`, `animated`, `markerEnd`, `strokeWidth`, `tunnel`, `pins`, `bends`, `curve`, `obstacles`, `fromBox`, `toBox` all unpassed. **Wave 1's single best lane.**
- **Prop seats confirmed present and unfed:** `QuickSwitcher.searchSources:80`, `FramesPanel.{saveView:152, reorder:153}`, `ChromeBar.{draftChip:176, crumbs:164, history:134, onJumpToLevel:169}`, `Port.{hinting:102, availability:115, dimmed:101}`.
- **`B` bug confirmed:** `shapes/block/index.ts:34` sets `kbd:"b"`; tldraw `useTools.mjs:75` binds draw to `d,b,x`; `grep -rn "releaseShortcut\|d,b,x" apps/systemsketch/src packages apps/storybook-basics/src` → **nothing**.
- **Wire z-order confirmed:** `createWire.ts:87` sets `parentId` only — no index, no `sendToBack`.
- **`<Tldraw>` confirmed** to take no `options` prop (`App.tsx:177`).

Not re-verified from the sweeps (taken on their evidence): donor line numbers in `/home/bam/systemsketch`, the 63 draft/compare test counts, and the three "unknown" rows the sweeps themselves flagged (background halo on `ss-wire`, port label spacing in expanded view, code-paste line inflation) — those three need a rendered app, not a grep, and belong in the report's capture pass rather than as backlog rows.

**For the 3-column report:** columns map as *SystemSketch capture* → *bbox-ui today* → *bbox-ui after*, with Wave 1 filling column 3 this week and Waves 2–4 shipping as `Queued · W2/W3/W4` chips so the table is honest about what is done versus scheduled.