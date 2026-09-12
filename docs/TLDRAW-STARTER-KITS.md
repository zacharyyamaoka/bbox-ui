# How tldraw built its two node-graph starter kits

**Read for:** bbox-ui — a component library whose components must render inside both a tldraw
shape and a React Flow node — and SystemSketch, which already solves most of this differently.

**Scope of evidence.** Everything below was read from primary source: the pristine kits on
GitHub, the vendored fork on disk, SystemSketch's own tree, and the installed tldraw 5.3.2
type declarations. Where a claim could not be verified it is marked **UNVERIFIED** and says
why. Citations are bare numbers keyed to the Source Index at the bottom; line numbers are
given inline as `file:line`.

---

## 0. What is on disk, and what is not

| kit | on this machine? | where |
|---|---|---|
| **image-pipeline** | **Yes — as a fork, not pristine** | `/home/bam/pyblocks/src/pipeline/` |
| **workflow** | **No. Not anywhere.** | — |

`pyblocks/src/pipeline/` is tldraw's image-pipeline template with weeks of Zach's changes on
top; pyblocks' own docs say 71 files came across "copied verbatim from the template except for
the two changes listed" — a file-backed board replacing `persistenceKey`, and a board-file
strip 35. So it is the kit **plus** divergence, never the kit alone.

The workflow kit is genuinely absent. Searched: every directory under `/home/bam` at depth ≤ 4
for `*workflow*` / `*starter*kit*` / `*image-pipeline*`; a content grep for `SliderNode`,
`ConditionalNode`, `WorkflowNode`, `workflow-template`, `NodeShapeUtil` across the whole home
tree excluding `node_modules`; and `/home/bam/tldraw_styling_lab`, which is a styling lab, not a
kit checkout. The only `NodeShapeUtil` on disk is pyblocks'. **Every workflow-kit claim in this
document therefore comes from the network**, from `github.com/tldraw/workflow-template` at
`main` (pushed 2026-09-10).

One caveat on provenance. Both tldraw.dev pages point at the **monorepo** paths
`github.com/tldraw/tldraw/tree/main/templates/workflow` and `.../templates/image-pipeline` 31,32.
I confirmed those directories exist — `templates/` in `tldraw/tldraw@main` lists `agent`,
`branching-chat`, `chat`, `image-pipeline`, `nextjs`, `shader`, `simple-server-example`,
`socketio-server-example`, `sync-cloudflare`, `vite`, `vue`, `workflow` — but I read the
**standalone mirror repos** `tldraw/workflow-template` and `tldraw/image-pipeline-template`,
both pushed the same day. **UNVERIFIED:** I did not byte-compare mirror against monorepo. If a
line number below is off by a few in the monorepo copy, that is why.

### Version gap, and why it turns out not to matter

The kits pin `tldraw: ^5.4.2` 19,30. SystemSketch and pyblocks are on **5.3.2 exactly**, and
SystemSketch's whole design rests on not moving it. So the first question is whether the kits
use seams that do not exist yet in 5.3.2. They do not:

| seam the kits use | in installed 5.3.2? | evidence |
|---|---|---|
| `ShapeUtil`, `BindingUtil` | yes | `@tldraw/editor` d.ts:391 51 |
| `OverlayUtil` + the `overlayUtils` prop | **yes** | d.ts:5821, and `overlayUtils?: readonly TLAnyOverlayUtilConstructor[]` at d.ts:7987 51 |
| `HTMLContainer`, `SVGContainer` | yes | d.ts:5159, 7429 51 |
| `Circle2d`, `Group2d`, `Rectangle2d`, `CubicBezier2d` | yes | d.ts:677, 5015, 6140, 902 51 |
| `StateNode`, `resizeBox`, `TldrawUiSlider` | yes | d.ts:207, 6166, 4608 51 |
| `editor.markEventAsHandled` | yes | d.ts:4506 51 |
| `createComputedCache` | yes | SystemSketch already imports it from `'tldraw'` at `blockPorts.ts:3` and `ConnectionShapeUtil.tsx:11` 41 |

`OverlayUtil` is the one I expected to be missing — it is the newest-looking API in either kit
and it is what draws the `+` splice handle. It is present. **UNVERIFIED:** I did not diff 5.3.2
against 5.4.2 for signature drift inside these APIs; presence of the export is not proof the
shape of it is identical.

---

## 1. Shape architecture

### The count

**Both kits define exactly two `ShapeUtil`s and one `BindingUtil`.** Not one per node kind —
two, total, for the entire app.

```ts
// workflow: src/App.tsx:24-28
const shapeUtils = [NodeShapeUtil, ConnectionShapeUtil]
const bindingUtils = [ConnectionBindingUtil]
const overlayUtils = [ConnectionCenterHandleOverlayUtil]
```
1

The image-pipeline kit is the same pair 21,27 plus the same binding util.

### A node is ONE shape, and node-kind is a prop

This is the central architectural decision in both kits and it is worth stating plainly: the
node kind is **data inside the shape's props**, validated as a discriminated union, not a
separate registered shape type.

```ts
// workflow: src/nodes/NodeShapeUtil.tsx:25-30
declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[NODE_TYPE]: { node: NodeType; isOutOfDate: boolean }
	}
}
```
2

`NodeType` is a `T.union` keyed on `'type'`, assembled by walking a plain registry object:

```ts
// workflow: src/nodes/nodeTypes.tsx:24-43
export const NodeDefinitions = {
	add: AddNodeDefinition, subtract: SubtractNodeDefinition, multiply: MultiplyNodeDefinition,
	divide: DivideNodeDefinition, conditional: ConditionalNodeDefinition,
	slider: SliderNodeDefinition, earthquake: EarthquakeNodeDefinition,
} satisfies Record<string, NodeDefinitionConstructor<any>>

export const NodeType = T.union('type', Object.fromEntries(
	Object.values(NodeDefinitions).map((type) => [type.type, type.validator])) as {...})
```
3

Adding a node kind is one file exporting a `NodeDefinition` subclass plus one line in that
object 3. The abstract base declares exactly what a kind must answer 5 `shared.tsx:46-67`:
`getDefault()`, `getBodyHeightPx()`, `getPorts()`, `getOutputInfo()`, `execute()`, a
`Component`, and optional `onPortConnect`/`onPortDisconnect` hooks. Seven kinds in workflow 3,
eighteen in image-pipeline — and **zero** `ShapeUtil` work per kind.

The `ShapeUtil` then becomes a pure dispatcher. Every method delegates through the registry:

```ts
// workflow: src/nodes/nodeTypes.tsx:69-84
export function getNodeBodyHeightPx(editor, shape) {
	return getNodeDefinition(editor, shape.props.node).getBodyHeightPx(shape, shape.props.node)
}
export function getNodeTypePorts(editor, shape): Record<string, ShapePort> {
	return getNodeDefinition(editor, shape.props.node).getPorts(shape, shape.props.node)
}
```
3

This matters for bbox-ui more than anything else in the kits. It is the same insight the
SystemSketch primitive-seam audit reached from the other direction — don't rebuild the
primitives, rebuild the dispatchers. tldraw arrived at it first and it is only ~115 lines.

### Ports are geometry inside the node's shape — never their own shape

Both kits build the node's geometry as a `Group2d` of one body rectangle plus one `Circle2d`
per port:

```ts
// workflow: src/nodes/NodeShapeUtil.tsx:77-102
getGeometry(shape: NodeShape) {
	const ports = getNodePorts(this.editor, shape)
	const portGeometries = Object.values(ports).map((port) => new Circle2d({
		x: port.x - PORT_RADIUS_PX, y: port.y - PORT_RADIUS_PX,
		radius: PORT_RADIUS_PX, isFilled: true,
		// not a label, but this hack excludes them from the selection bounds which is useful
		isLabel: true,
		excludeFromShapeBounds: true,
	}))
	const bodyGeometry = new Rectangle2d({ width: NODE_WIDTH_PX, height: getNodeHeightPx(...), isFilled: true })
	return new Group2d({ children: [bodyGeometry, ...portGeometries] })
}
```
2

That `isLabel: true` comment is the kit author admitting to a hack — and he filed it against
his own SDK: item 10 of `alex-notes.md`, *"A way to have things in geometry that don't
contribute to `bounds` calculations. I achieved this by marking them as labels, but that feels
wrong maybe?"* 18. Note both flags are set, `isLabel` **and** `excludeFromShapeBounds` 2. Zach's
`containerGeometry.ts:83-90` constructs port circles with `isLabel: true` but **not**
`excludeFromShapeBounds` 40 — worth a look, since the kit apparently needed both.

Ports also get drawn into the selection indicator by hand, so the blue outline traces the dots
rather than a bare rectangle 2 `NodeShapeUtil.tsx:112-122`.

### A connection is a custom shape AND two real bindings

Not an arrow. Both kits define `ConnectionShapeUtil` — a cubic bezier with two vertex handles —
whose props hold only fallback terminal positions 12 `ConnectionShapeUtil.tsx:36-43,100-130`.
The actual attachment is a first-class `BindingUtil`:

```ts
// workflow: src/connection/ConnectionBindingUtil.tsx:22-42
declare module 'tldraw' {
	export interface TLGlobalBindingPropsMap {
		[CONNECTION_TYPE]: { portId: PortId; terminal: 'start' | 'end' }
	}
}
export class ConnectionBindingUtil extends BindingUtil<ConnectionBinding> {
	static override type = CONNECTION_TYPE
	static override props = { portId: T.string, terminal: T.literalEnum('start', 'end') }
```
13

One connection shape, **two** bindings — one per terminal — each naming the port id it landed
on 13 `:31-35`. The shape's own `start`/`end` props are used *only* when a terminal is unbound,
i.e. mid-drag; the doc comment says so 12 `:45-53` and `getConnectionTerminals` implements
exactly that fallback 12 `:361-386`.

The binding util carries four lifecycle rules that are easy to miss and expensive to rediscover:

| hook | rule | cite |
|---|---|---|
| `onBeforeIsolateToShape` | duplicating a node **without** its connection deletes the connection | 13 `:48-51` |
| `onBeforeDeleteToShape` | deleting a node deletes every cable bound to it | 13 `:53-56` |
| `onAfterCreate` / `onAfterDelete` | fire the node kind's `onPortConnect` / `onPortDisconnect` | 13 `:58-63, 86-91` |
| `onAfterChange` | a rebind (different port **or** different node) fires disconnect-then-connect | 13 `:65-84` |

And `createOrUpdateConnectionBinding` defensively deletes extras so a connection can never end
up with three bindings 13 `:161-168`.

---

## 2. Where the node's UI lives

**HTML, with React inside, via `HTMLContainer`.** No canvas drawing of node bodies at all 2
`:145-163`, 21 `:194-248`.

Hit-testing stays correct because the kits **never let the DOM be the hit target for geometry
purposes**. The two are kept completely separate:

- **Geometry** is declared in `getGeometry()` from numbers — `NODE_WIDTH_PX` is a constant 16,
  and height is arithmetic over row counts: `NODE_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX +
  getNodeBodyHeightPx(...) + NODE_ROW_BOTTOM_PADDING_PX` 3 `:73-80`. Each node kind returns its
  own body height as a pure function, e.g. `NODE_ROW_HEIGHT_PX * 5 - NODE_ROW_BOTTOM_PADDING_PX`
  for the conditional 7 `:95-97`.
- **The DOM** is `pointer-events: none` except where explicitly opted in (§4). So a pointer
  lands on tldraw's geometry, not on a `<div>`, unless the kit has decided otherwise.

The port dots are the clearest case of the split: `<Port>` renders a real absolutely-positioned
`<div>` 8 `:73-86`, **and** a `Circle2d` exists at the same coordinates 2 `:80-91`. They are two
representations of one number — `ShapePort extends VecModel` 8 `:20-23`, so the port's `x`/`y`
is the single source and CSS pins the div to it 15 `:147-153`.

That is the same line bbox-ui's ARCHITECTURE.md already draws: *"Layout geometry is portable and
lives in the core; interaction geometry (hit-testing, snapping, z-order, drag) is host-owned and
never travels"* 47. The kits agree, and got there by the same route.

---

## 3. Ports

### Position

A port is a plain data object — a point, an id, a terminal, and (pipeline only) a data type:

```ts
// workflow: src/ports/Port.tsx:20-23
export interface ShapePort extends VecModel { id: PortId; terminal: 'start' | 'end' }

// image-pipeline: src/ports/Port.tsx:21-27
export interface ShapePort extends VecModel {
	id: PortId; terminal: 'start' | 'end'; dataType: PortDataType
	/** When true, this input port accepts multiple simultaneous connections. */
	multi?: boolean
}
```
8,24

Positions are computed, not stored, by each node kind's `getPorts()` — arithmetic over the row
constants, e.g. `y: NODE_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX + NODE_ROW_HEIGHT_PX * 2.5`
7 `:107-112`. `getNodePorts()` wraps that in a `createComputedCache` so it only recomputes when
the underlying records change 4 `:15-20`.

### Hit target

Two different targets for two different gestures, and this is the part worth copying:

1. **Starting a drag** uses the **DOM** dot. `<Port>`'s `onPointerDown` transitions the select
   tool straight into a custom state:
   ```tsx
   // workflow: src/ports/Port.tsx:79-85
   onPointerDown={() => {
   	editor.setCurrentTool('select.pointing_port', { shapeId, portId, terminal: port.terminal })
   }}
   ```
   8 (pipeline passes `dataType` too 24 `:83-90`).
2. **Landing a drag** uses **geometry + nearest-point**, never the DOM. `getPortAtPoint` finds
   the node shape at the page point with `hitInside: true`, then linearly scans that node's
   ports for the smallest `Vec.Dist` — with no radius cutoff at all:
   ```ts
   // workflow: src/ports/getPortAtPoint.tsx:10-39
   const shape = editor.getShapeAtPoint(point, { hitInside: true,
   	filter: (shape) => editor.isShapeOfType(shape, 'node'), ...opts })
   ...
   for (const port of Object.values(ports)) {
   	if (opts?.terminal && port.terminal !== opts.terminal) continue
   	const distance = Vec.Dist(point, shapeTransform.applyToPoint(port))
   	if (distance < bestDistance) { bestPort = port; bestDistance = distance }
   }
   ```
   10, identically 26. The margin (`margin: 8`) is passed to `getShapeAtPoint`, so it widens
   *the node*, not the port 12 `:145-148`. **Consequence: anywhere inside a node is a valid
   landing, and it snaps to that node's nearest port of the right terminal.** That is a much
   more forgiving drop target than a 12 px dot, and it is three lines of code.

### What decides whether a connection is allowed

In the **workflow** kit, one place: `ConnectionShapeUtil.onHandleDrag` 12 `:133-203`. Three
rules, evaluated live on every pointer move:

```ts
// workflow: src/connection/ConnectionShapeUtil.tsx:150-173
const allowsMultipleConnections = draggingTerminal === 'start'   // outputs fan out, inputs don't
const hasExistingConnection = target?.existingConnections.some((c) => c.connectionId !== connection.id) ?? false
const nodesWhichWouldCreateACycle = oppositeTerminalShapeId
	? getAllConnectedNodes(this.editor, oppositeTerminalShapeId, draggingTerminal) : null
...
if (!target || (hasExistingConnection && !allowsMultipleConnections) || wouldCreateACycle) { ... }
```
12

Cycle detection is a BFS over the graph from the *other* end of the cable, in the drag
direction 4 `getAllConnectedNodes:132-157`.

The **image-pipeline** kit adds two more and changes one:

- **Type compatibility.** Resolve the opposite terminal's `dataType`, refuse a mismatch unless
  either side is `'any'` 27 `:151-176`. The standalone predicate is two lines:
  `a === 'any' || b === 'any' || a === b` 25 `:3-5`. `findFirstCompatiblePort` prefers an exact
  match over `'any'` "so that e.g. a text source connects to the 'prompt' port rather than a
  generic 'any' port" 25 `:12-21`.
- **`multi` ports.** An input with `multi: true` accepts many cables 24 `:25-26`.
- **Occupied-input replacement, deferred to commit.** Instead of refusing a busy input, it
  records what *would* be replaced and deletes it only in `onHandleDragEnd`:
  ```ts
  // image-pipeline: src/connection/ConnectionShapeUtil.tsx:193-198
  // Track the connection that would be replaced, but don't delete it yet.
  // Multi-ports accept multiple connections, so skip replacement for them.
  this.pendingReplacementId = existingConnectionOnTarget && draggingTerminal === 'end' && !target.port.multi
  	? existingConnectionOnTarget.connectionId : null
  ```
  27, then deleted at 27 `:216-220`. Nothing is destroyed until the user commits — so waving the
  cursor over a busy input never eats an existing cable.

### Feedback while dragging — the part SystemSketch does not have

Both kits keep a tiny editor-scoped atom of drag UI state:

```ts
// workflow: src/ports/portState.ts:8-21
export interface PortState {
	hintingPort: PortIdentifier | null
	eligiblePorts: { terminal: 'start' | 'end'; excludeNodes: Set<TLShapeId> | null } | null
}
export const portState = new EditorAtom<PortState>('port state', () => ({ hintingPort: null, eligiblePorts: null }))
```
9 (pipeline adds `dataType` to `eligiblePorts` 27 `:162-168`).

`onHandleDrag` writes it every move 12 `:164-169, 191-193`; `<Port>` reads it and paints itself
`Port_eligible` (ring) or `Port_hinting` (filled) 8 `:44-77`; `onHandleDragEnd` **and**
`onHandleDragCancel` both clear it 12 `:206-211, 277-280`. That cancel path is not decoration —
`alex-notes.md` item 3 says getting `onHandleDragCancel` into the SDK mattered precisely because
*"`cancel` is important for state management"* 18.

So during a drag the user sees: every port that could accept this cable ringed, the one under
the cursor filled, everything that would cycle or mistype left plain. **That is the single most
visible thing these kits have that SystemSketch does not.**

### Compared with SystemSketch today

| | tldraw kits | SystemSketch |
|---|---|---|
| port shape | `Circle2d` in a `Group2d` 2 | `Circle2d` in a `Group2d` via `containerHitGeometry` 39 `BlockShapeUtil.tsx:497-533`, 40 `containerGeometry.ts:83-90` |
| landing hit-test | nearest port on the node at point, no cutoff 10 | `getBlockPortDotsNear()` — distance within an explicit magnet radius 41 `blockPorts.ts:516` |
| who judges | one method, 3 rules (workflow) / 5 (pipeline) 12,27 | `judgeConnection()` — ~10 named rules behind a policy 37 `connectionRules.ts:136` |
| judges after the yes | none | **two more**: `connectionBindingIsValid()` 38 `:93` and `connectionEndpointsAreValid()` 38 `:125`, which delete cables post-hoc |
| live eligible/hinting paint | yes 9,8 | **no equivalent found** |
| binding util | `ConnectionBindingUtil` 13 | `ConnectionBindingUtil` 38 `:152` — same shape |
| computed cache | `createComputedCache` 4 | `createComputedCache` 41 `:299,434` — same |

Zach's connection *policy* is strictly richer — scope, polarity, fan-in/fan-out, hidden ports,
a three-judge pipeline. The kits' *feedback* is strictly richer. Those are independent axes and
the second one is cheap: one atom, two CSS classes, four call sites.

---

## 4. In-place text editing — the actual answer

**Neither kit uses tldraw's editing state. Both explicitly opt out.**

```ts
// workflow: src/nodes/NodeShapeUtil.tsx:49-51
override canEdit(_shape: NodeShape) { return false }
```
2, and identically in image-pipeline 21 `:64-66`. There is no `setEditingShape`, no
`select.editing_shape`, no `onDoubleClick`, no `useEditablePlainText` anywhere in either kit.

Instead, the fields are **always live, real form controls** rendered straight into the
`HTMLContainer`: `<input type="text">` 5 `:166-186`, `<select>` 7 `:185-199`,
`<textarea>` 23 `:69-86`, and tldraw's own `TldrawUiSlider` 6 `:72-82`. Four mechanisms make
that work, and all four are load-bearing.

### 4a. The CSS state-chart gate — this is the answer to "drag across text"

tldraw stamps its current state-chart path onto the container as `data-state`. The kits gate
`pointer-events` on it:

```css
/* workflow: src/index.css:71-89 — inside .NodeRow */
input, select {
	...
	[data-state='select.idle'] & { pointer-events: all; }
}
/* :139-141 (.Port), :228-230 (.SliderNode), :256-258 (.WorkflowRegion-button) — same gate */
```
15

The image-pipeline kit widens it to the whole body and says exactly why:

```css
/* image-pipeline: src/index.css:78-80 */
/* Enable pointer events on the entire node body so all interactive
   elements work. The heading stays inert (drag handle for tldraw). */
[data-state='select.idle'] & > :not(.NodeShape-heading) { pointer-events: all; }
```
29

**A drag across text cannot select text, because by the time a drag exists the editor is no
longer in `select.idle`** — it has moved to pointing/translating/brushing, the selector stops
matching, and every input inside every node reverts to `pointer-events: none` mid-gesture. The
text is not a pointer target to be selected. There is no `user-select: none` anywhere in either
stylesheet; the gate alone does it.

The same gate does double duty: while any non-select tool is armed, the port dots are inert too
15 `:139-141`, so pressing on a port while the rectangle tool is active draws a rectangle
instead of a cable. And image-pipeline's version deliberately leaves one region — the heading —
permanently inert, to keep a guaranteed drag handle 29.

### 4b. `stopPropagation` on pointerdown — the "click reaches the field" half

```tsx
// workflow: src/nodes/types/shared.tsx:149-151
const onPointerDown = useCallback((event: PointerEvent) => { event.stopPropagation() }, [])
```
5, applied to the `<input>` at `:178` and to both spinner buttons at `:191, 199`. Same in
image-pipeline 22 `:192-194, 230`, on the textarea 23 `:84`, and on the footer play button and
menu 21 `:234, 323`.

In `select.idle` the pointer *can* reach the input; stopping propagation keeps tldraw's own
canvas listener from ever seeing the pointerdown, so no selection or translate gesture begins
and the browser's native caret placement runs unimpeded.

The newer idiom, in the slider, uses tldraw's own API instead of raw DOM:

```tsx
// workflow: src/nodes/types/SliderNode.tsx:71
<NodeRow className="SliderNode" onPointerDown={editor.markEventAsHandled}>
```
6 — `markEventAsHandled` is present in 5.3.2 51 `d.ts:4506`.

### 4c. Focus selects the shape — the direction is inverted

Because tldraw never saw the pointerdown, it also never selected the node. So the field tells
the editor:

```tsx
// workflow: src/nodes/types/shared.tsx:183-185
onFocus={() => { editor.setSelectedShapes([shapeId]) }}
```
5, same in pipeline 22 `:235-237`, on the textarea 23 `:85`, and the slider does it inside
`onValueChange` 6 `:78`.

**This is the mechanism to internalise.** The path is not *select the shape → enter an edit
state → focus a field*. It is *focus the field → the field selects the shape*. There is no
"click once to select, click again to edit" ladder at all, because there is no edit state to
enter. A single click on a field both focuses it and selects the node.

### 4d. Writes go straight to the store on every keystroke

```ts
// workflow: src/nodes/types/shared.tsx:88-99
export function updateNode<T extends NodeType>(editor, shape, update: (node: T) => T, isOutOfDate = true) {
	editor.updateShape({ id: shape.id, type: shape.type, props: { node: update(shape.props.node as T), isOutOfDate } })
}
```
5. No commit-on-blur, no draft. The only local state is a `pendingValue` string so a half-typed
`"1."` or `"-"` is not clobbered by the numeric round-trip 5 `:147, 172-177`; it is cleared on
blur 5 `:179-182`. The `isOutOfDate` flag is how a typed edit marks downstream results stale.

### 4e. One more trap the pipeline hit

```tsx
// image-pipeline: src/nodes/NodeShapeUtil.tsx:200-206
onContextMenu={(e) => {
	const target = e.target as HTMLElement
	const tag = target.tagName
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { e.stopPropagation() }
}}
```
21 — right-clicking inside a text field must give the browser's cut/copy/paste menu, not
tldraw's canvas context menu. Not covered by the `select.idle` gate, because the gate governs
pointer targeting and this is a separate event.

### 4f. Where Zach already diverges — and it is a real divergence

Both his codebases went the *other* way and use tldraw's editing lifecycle:

- **pyblocks.** `canEdit()` true; `requestBlockInlineEdit` calls `editor.setSelectedShapes` then
  `editor.setEditingShape` on the next animation frame ("lets Radix close its context-menu layer
  first, otherwise the menu's focus restoration can immediately end the edit that this command
  started") 34 `:57-70`. Because tldraw's editing state is one-shape-at-a-time and a Block has
  many editable values, a `WeakMap<Editor, Map<TLShapeId, BlockInlineField>>` remembers *which*
  nested field the single editing state currently exposes 34 `:12-50`. Its own docs are explicit
  that the lifecycle is tldraw's and only the field mapping is theirs 36.
- **SystemSketch.** `canEdit()` returns `true` 39 `BlockShapeUtil.tsx:407-409`. Click-to-edit is
  an editor-level `before-event`/`event` pair: arm a candidate on `pointer_down` *before* the
  state chart runs ("this reads the selection the user actually saw when they pressed"), drop
  the pending click if `getIsDragging()` on `pointer_up`, resolve the field under the pointer,
  then `setEditingShape` — and only if the Block is already active 42
  `blockClickToEdit.ts:99-160`. The CSS gate is widened to admit the editing state too:
  ```css
  /* systemsketch: src/blocks/ui/block-canvas.css:71-75 */
  [data-state='select.idle'] .systemsketch-block-canvas [data-pb-inline-field],
  [data-state='select.editing_shape'] .systemsketch-block-canvas [data-pb-inline-field] {
  	pointer-events: all; cursor: text;
  }
  ```
  43

**The honest comparison.** The kits' approach is ~10 lines and gives a field that is always
live. Zach's is a few hundred lines and gives select-then-edit, Escape/Enter, drag-vs-click
discrimination, and a field that is inert until you mean it. Those are different products, not
better and worse — but note that **the same `[data-state='select.idle']` CSS gate sits under
both**, independently arrived at 15,29,43. That gate is the portable part.

---

## 5. Layout and size

### Workflow: fixed width, computed height, not resizable

`NODE_WIDTH_PX = 235` is a module constant 16. Height is pure arithmetic from row counts 3
`:73-80`. And the node refuses to resize:

```ts
// workflow: src/nodes/NodeShapeUtil.tsx:52-74
override canResize(_shape) { return false }
override hideResizeHandles(_shape) { return true }
override hideRotateHandle(_shape) { return true }
override hideSelectionBoundsBg(_shape) { return true }
override hideSelectionBoundsFg(_shape) { return true }
override getBoundsSnapGeometry(_shape) { return { points: [{ x: 0, y: 0 }] } }
```
2

So **there is no reconciliation problem, because there is no second source of truth.** Geometry
is derived from props by arithmetic; the DOM is told to be that size by CSS (`.NodeShape { width:
100%; height: fit-content }` 15 `:29-30`) and is never measured. `getBoundsSnapGeometry`
returning the single top-left point means nodes snap corner-to-corner instead of edge-to-edge —
a deliberate simplification worth noticing.

The kit author flagged the gap this leaves, twice, in his own SDK wishlist: item 12, *"A
canonical way (or at least an example) to have the size of an element derived from how it's
rendered in the DOM"*, and item 13, *"A better way of having geometry derived from the DOM (ie
port locations)"* 18. **tldraw does not claim to have solved DOM-derived sizing. It sidestepped
it.**

### Image-pipeline: opt-in resize, size stored under `props.node`

Per-kind, via a flag on the definition: `readonly canResizeNode: boolean = false` 22 `:85`, read
by `canResize()` 21 `:67-69` — and `hideResizeHandles` / `hideSelectionBoundsBg` / `...Fg` all
derive from it 21 `:70-81`, so an unresizable kind shows no handles and a resizable one does.

The wrinkle: the size lives at `shape.props.node.w/h`, not at top-level `w/h`, so tldraw's stock
`resizeBox` does not fit. The kit ships a **fork of `resizeBox`** — `resizeNode.ts`, ~130 lines
of the same handle/offset/min-size switch statement, differing only in writing to
`props.node.w/h` 28. `onResize` then re-derives the body height by subtracting header, gap,
padding and footer, with `Math.max(200, …)` / `Math.max(120, …)` floors 21 `:118-151`.

That fork is the cost of putting the box under `props.node` instead of at the top level. Worth
naming, because pyblocks paid the tax and then reversed the decision: its `NodeShapeUtil` now
extends `BaseFrameLikeShapeUtil` with canonical top-level `w`/`h` plus a migration to seed them,
keeping `node.views` as a *side* record of each view's remembered box 33 `:65-115`. Its docs
state the rule directly: *"Each view remembers its own box… Sizing one view from another's
content is how the React Flow app grew its two worst bugs"* 35.

### SystemSketch is ahead here

`blockAutoResizePresentation()` measures child geometry vertices via
`editor.getShapeGeometry(id).vertices`, builds a `Box.FromPoints`, pads it, and returns a **live
paint-only frame during the gesture**; stock `fitFrameToContent` commits the box once on settle
46 `blockAutoResize.ts:87,103`. The `WHY:` comment on `getGeometry` explains the constraint the
kits never had to face — *"shape geometry is one of tldraw's cached reactive roots. Reading live
SelectTool state or descendant geometry from here makes the parent cache depend on the very
interaction computations that ask for it and can recurse through `haveParentsChanged`"* 39
`:497-503`.

**That is a solved problem in SystemSketch and an open wishlist item in tldraw.** Do not go
looking in the kits for it.

---

## 6. What to copy, what not to

### bbox-ui's current position

| | React Flow | tldraw |
|---|---|---|
| size authority | the DOM; RF measures into `node.measured.*` 47,49 | the shape record; `props.w/h` 47, 48 `:258-264` |
| a port is | a real `<Handle>` element 49 `:174-212` | a geometry point from `portAnchor()` / `portDotPlacement()` 50 `:225,253`, painted with `PortDot` 48 `:289-321` |
| hit-test / drag / z-order | React Flow | tldraw |

Both adapters render the same core `<Block>` into `HTMLContainer` / an RF node 48 `:270-325`, 49.
That is already the kits' architecture, arrived at independently.

### Copy — three things, in order of value

**1. The `[data-state='select.idle']` pointer-events gate, generalised into a per-host
"interactive" hook.** 15 `:86-88`, 29 `:78-80`, 43 `:71-75`

This is the single highest-value transfer, and it is the one thing that is *exactly* the
dual-host problem. Both hosts have the same hazard — an interactive control inside a node body
stealing a gesture that belongs to the canvas — and both have a one-line solution, but they are
*different* one-liners:

| host | the gate | verified |
|---|---|---|
| tldraw | `[data-state='select.idle'] &{ pointer-events: all }` | 15,29 |
| React Flow | the `nodrag` (and `nopan`) class names | `@xyflow/react@12.11.2` emits `'nodrag'` on its own resize control at `index.js:4939`, and its own JSDoc example for interactive node content is `className="nodrag nopan"` at `index.js:3788` |

So: the **core** components should emit a stable, host-neutral marker on every interactive
element — one data attribute, e.g. `data-bbox-interactive` — and own nothing else. Each
**adapter** supplies the gate: the tldraw adapter ships the `[data-state='select.idle']` rule,
the React Flow adapter maps the marker to `nodrag nopan`. That is precisely the line
ARCHITECTURE.md already draws — *"interaction geometry … is host-owned and never travels"* 47 —
applied to a case the doc does not yet enumerate. Do it before the first editable field lands,
not after; retrofitting means touching every component.

**2. The `NodeDefinition` registry — one shape, kind-as-prop, `ShapeUtil` as pure dispatcher.**
2,3,5

Seven node kinds in workflow, eighteen in image-pipeline, **two** `ShapeUtil`s total 1. Every
`ShapeUtil` method is a one-line delegation to `getNodeDefinition(editor, shape.props.node)` 3
`:69-108`, and the union validator is assembled mechanically from the registry object 3 `:38-43`.

For bbox-ui this is the answer to a question it will hit soon: when the library grows past
Block and Port, do you add a `ShapeUtil` per component? The kits say no — add a definition, keep
two utils. It is also the cheaper shape for the React Flow side, where "one `nodeType` with a
kind discriminator" maps onto exactly the same registry.

**3. The drag-feedback triple: eligible / hinting, plus a forgiving landing.** 9,8,10,12

Three small parts that compose:
- an editor-scoped atom holding `{ hintingPort, eligiblePorts }` 9 `:8-21`;
- `<Port>` subscribing to it and painting two extra classes 8 `:44-77`;
- `getPortAtPoint` landing on *the nearest port of the node under the cursor*, with the margin
  applied to the node rather than the dot 10, 12 `:145-148`.

That last one is worth ~20 lines and makes cable-dropping dramatically more forgiving than a
12 px target. **And critically it must be cleared in `onHandleDragCancel`, not just
`onHandleDragEnd`** 12 `:277-280` — the kit author pushed for that SDK callback specifically
because cancel is where this state leaks 18.

Also worth lifting, cheaply, from image-pipeline: **defer the destructive part of a replacement
to commit.** Record `pendingReplacementId` during the drag, delete only in `onHandleDragEnd`
27 `:193-198, 216-220`. A hover should never destroy a cable.

### Do not copy — five things

**1. Do not copy the kits' editing model into SystemSketch.** Always-live `<input>`s with
`canEdit() === false` 2,21 are a fine fit for a fixed 235 px calculator node. They are wrong for
a Block with title, type, icon, description and per-port names, where select-then-edit is the
muscle memory and the field must be inert until meant. Zach's `blockClickToEdit` 42 and
pyblocks' field-mapping WeakMap 34 solve a problem the kits do not have. **Take 4a's gate, leave
4c's inversion.** (For bbox-ui specifically, where a component may be a read-only specimen in a
compare pane, the always-live model is actively harmful.)

**2. Do not copy `resizeNode.ts`.** 28 It is a 130-line fork of stock `resizeBox` that exists
only because the kit stored `w`/`h` under `props.node` instead of at the top level. pyblocks
already reversed that decision and moved to canonical top-level `w`/`h` on
`BaseFrameLikeShapeUtil` with a migration 33 `:65-115`; bbox-ui's tldraw adapter already has
top-level `w`/`h` and plain `resizeBox` 48 `:230-241, 266-268`. **Zach is ahead. Nothing to do.**

**3. Do not copy the kits' geometry — bbox-ui's is deliberately different, and correctly so.**
The kits put a `Circle2d` per port into a `Group2d` 2; bbox-ui's `getGeometry` returns a single
`Rectangle2d` 48 `:258-264`, because in bbox-ui a port dot is *painted* by the core and
*anchored* by `portDotPlacement()` 50 while hit-testing belongs to the host. Adding port circles
to bbox-ui's geometry would import tldraw's hit model into a library that must also run under
React Flow. **Leave it.** (SystemSketch, which is tldraw-only, is right to have them 40.)

**4. Do not adopt `isLabel: true` as a bounds-exclusion idiom without reading the note.** The
kit's own comment calls it a hack 2 `:87-88` and the author asked the SDK team for a real
mechanism 18 `item 10`. It also sets `excludeFromShapeBounds: true` alongside it 2 `:89` —
SystemSketch sets only `isLabel` 40 `:83-90`. Worth a deliberate look at whether that difference
is intentional; this document does not resolve it.

**5. Do not look to the kits for DOM-derived sizing.** Workflow is unresizable with a constant
width 2,16; image-pipeline resizes by arithmetic, never measurement 21 `:118-151`. The author
lists DOM-derived size and DOM-derived port location as *unsolved* 18 `items 12, 13`.
SystemSketch's `blockAutoResize.ts` 46 and bbox-ui's explicit size contract 47 are both further
along.

### Where Zach is already ahead — stated plainly, so no one re-derives it

| capability | kits | Zach |
|---|---|---|
| connection policy | 3 rules (workflow) / 5 (pipeline) in one method 12,27 | `judgeConnection` with ~10 named rules behind a policy 37, plus two post-hoc judges 38 |
| in-place editing lifecycle | none — `canEdit() === false` 2,21 | tldraw's real editing state + field mapping + drag-vs-click discrimination 42,34 |
| auto-size to content | wishlist item 18 | live paint + stock `fitFrameToContent` on settle 46 |
| size stored canonically | forked `resizeBox` 28 | top-level `w`/`h` + migration 33; plain `resizeBox` in bbox-ui 48 |
| portable across two engines | not a goal | core / adapter split with a stated line 47 |

### Where the kits are ahead

Live eligible/hinting port feedback 9,8; the node-at-point landing rule 10; deferred
replacement 27; the `NodeDefinition` registry's economy 3; and the binding-lifecycle rules
(isolate-on-duplicate, delete-with-node, rebind fires disconnect-then-connect) 13.

---

## Source Index

**tldraw/workflow-template @ main** — `https://github.com/tldraw/workflow-template`
(raw: `https://raw.githubusercontent.com/tldraw/workflow-template/main/<path>`)

1. `src/App.tsx`
2. `src/nodes/NodeShapeUtil.tsx`
3. `src/nodes/nodeTypes.tsx`
4. `src/nodes/nodePorts.tsx`
5. `src/nodes/types/shared.tsx`
6. `src/nodes/types/SliderNode.tsx`
7. `src/nodes/types/ConditionalNode.tsx`
8. `src/ports/Port.tsx`
9. `src/ports/portState.ts`
10. `src/ports/getPortAtPoint.tsx`
11. `src/ports/PointingPort.tsx`
12. `src/connection/ConnectionShapeUtil.tsx`
13. `src/connection/ConnectionBindingUtil.tsx`
14. `src/connection/ConnectionCenterHandleOverlayUtil.tsx`
15. `src/index.css`
16. `src/constants.tsx`
17. `README.md`
18. `alex-notes.md` — the kit author's own SDK wishlist
19. `package.json` — pins `tldraw: ^5.4.2`
20. `src/hooks/useDragToCreate.ts`

**tldraw/image-pipeline-template @ main** — `https://github.com/tldraw/image-pipeline-template`

21. `src/nodes/NodeShapeUtil.tsx`
22. `src/nodes/types/shared.tsx`
23. `src/nodes/types/PromptNode.tsx`
24. `src/ports/Port.tsx`
25. `src/ports/portCompatibility.ts`
26. `src/ports/getPortAtPoint.tsx`
27. `src/connection/ConnectionShapeUtil.tsx`
28. `src/nodes/resizeNode.ts`
29. `src/index.css`
30. `package.json` — pins `tldraw: ^5.4.2`

**tldraw.dev documentation**

31. `https://tldraw.dev/starter-kits/workflow`
32. `https://tldraw.dev/starter-kits/image-pipeline`

**pyblocks — the vendored image-pipeline fork**

33. `/home/bam/pyblocks/src/pipeline/nodes/NodeShapeUtil.tsx`
34. `/home/bam/pyblocks/src/pipeline/nodes/inlineBlockEditing.ts`
35. `/home/bam/pyblocks/docs/pipeline-kit-base.md`
36. `/home/bam/pyblocks/docs/reference-implementations.md`

**SystemSketch**

37. `/home/bam/systemsketch/src/blocks/connections/connectionRules.ts`
38. `/home/bam/systemsketch/src/blocks/connections/ConnectionBindingUtil.ts`
39. `/home/bam/systemsketch/src/blocks/BlockShapeUtil.tsx`
40. `/home/bam/systemsketch/src/blocks/containerGeometry.ts`
41. `/home/bam/systemsketch/src/blocks/connections/blockPorts.ts`
42. `/home/bam/systemsketch/src/blocks/blockClickToEdit.ts`
43. `/home/bam/systemsketch/src/blocks/ui/block-canvas.css`
44. `/home/bam/systemsketch/src/blocks/ui/BlockCanvas.tsx`
45. `/home/bam/systemsketch/src/blocks/memberStack.ts`
46. `/home/bam/systemsketch/src/blocks/blockAutoResize.ts`

**bbox-ui** (this worktree, `.claude/worktrees/port-t0`)

47. `ARCHITECTURE.md`
48. `packages/adapter-tldraw/src/block-shape-util.tsx`
49. `packages/adapter-reactflow/src/block-node.tsx`
50. `packages/bbox-ui/src/port.layout.ts`

**Installed SDKs**

51. `/home/bam/systemsketch/node_modules/@tldraw/editor/dist-cjs/index.d.ts` — tldraw 5.3.2
52. `/home/bam/bam_ws/src/python_block_viewer/frontend/node_modules/@xyflow/react/dist/esm/index.js` — @xyflow/react 12.11.2

---

## Unverified claims, collected

1. **Mirror vs monorepo.** I read `tldraw/workflow-template` and `tldraw/image-pipeline-template`;
   tldraw.dev links to `tldraw/tldraw/templates/{workflow,image-pipeline}` 31,32. Both monorepo
   directories exist and both mirrors were pushed 2026-09-10, but I did not byte-compare them.
   Line numbers may drift slightly against the monorepo copy.
2. **5.3.2 vs 5.4.2 behaviour.** Every API the kits use is *exported* by the installed 5.3.2 51.
   I did not diff signatures or semantics between the two versions.
3. **`isLabel` vs `excludeFromShapeBounds`.** The kits set both 2; SystemSketch sets only
   `isLabel` 40. I did not test what difference that makes.
4. **Nothing here was run.** No server was started, no port bound, nothing installed. Every claim
   is read from source, not observed in a running app.
