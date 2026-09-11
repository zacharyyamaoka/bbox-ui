# bbox-ui

A shadcn-style component registry of **presentational** components for
black-box system design — blocks, ports, and (later) edges and regions.
Extends the idea of [React Flow UI](https://reactflow.dev/ui): copy-paste
components you own, not a library you depend on.

v1 ships exactly two components, built from the `bbox-ui-v2.systemsketch`
wireframe: **`Port`** and **`Block` (Simple View)**.

Both demos, same components, two hosts:

| React Flow (`demos/reactflow`) | tldraw (`demos/tldraw`) |
|---|---|
| ![React Flow demo](demos/screenshots/reactflow.png) | ![tldraw demo](demos/screenshots/tldraw.png) |

## The website

The public site is **bbox-ui.com** — `apps/docs`, a Fumadocs + Next.js app that
static-exports to Cloudflare Pages. Full notes in
[`apps/docs/README.md`](apps/docs/README.md).

```bash
pnpm docs:dev      # http://localhost:4100
pnpm docs:build    # -> apps/docs/out/
```

### Reference sites — copy these, do not invent

The site is deliberately unoriginal. Before designing any page or interaction,
look at how these solved it:

| Site | What to take from it |
|---|---|
| [Kibo UI](https://www.kibo-ui.com/components/avatar-stack) · [`shadcnblocks/kibo`](https://github.com/shadcnblocks/kibo) (MIT) | The canonical component page — hero preview, Preview/Code tabs, install command, features, per-variant examples. `content/docs/components/port.mdx` follows its shape. |
| [ReUI](https://reui.io) · [`keenthemes/reui`](https://github.com/keenthemes/reui) (MIT) | Landing-page craft, and a clean branding seam. |
| [React Flow UI](https://reactflow.dev/ui) (closed source) | The canvas pattern: it iframes a separate app rather than inlining live previews. Do the same for anything hosting tldraw or React Flow. |
| [shadcn/ui](https://ui.shadcn.com) · [`shadcn-ui/ui`](https://github.com/shadcn-ui/ui) (MIT) | The registry contract — `registry.json`, `shadcn build`, `/r/*.json`. |
| [Fumadocs](https://fumadocs.dev) (MIT) | The framework under `apps/docs`. Check its docs before hand-rolling anything. |

## Components

### Port

A circle with a text slot — the component does not define what goes in the
slot.

- **States**: `empty` (hollow ring) · `default` ("Default Value", filled
  neutral) · `wired` (accent dot inside the ring) · `received` ("Data
  Recived" on the board). `received` is a **runtime** prop, never persisted
  document state.
- **Text layout**: `top` · `bot` · `right` · `left` · `right-offset` ·
  `left-offset` — where the slot sits relative to the dot; offset variants
  sit the label further out for a dot hanging outside the block edge.
- **Text size**: `md` 24 / `lg` 36 / `xl` 44 (the board's h3/h2/h1 rungs).
- **Diameter**: `sm` 14 / `md` 25 / `lg` 36.

```tsx
<Port state="wired" size="md" textLayout="right">image</Port>
```

### Block — Simple View

Anatomy (the API vocabulary): **Container** (`Block`), **Header band**
(`BlockHeader`), **Glyph** (`BlockGlyph`), **Text slots** (`BlockTitle`,
`BlockDescription`, `BlockType`), **Chip** (`BlockChip`).

The Glyph and Title always go next to each other, and the glyph resizes with
the title rung at **0.9 ×** the title font size (44→40, 36→32, 24→22).

The Chip **reserves** its region rather than merely right-aligning: it sits
28px in from the container's right edge and the title's room ends 10px
before it (`CHIP_INSET_RIGHT`, `CHIP_TITLE_GAP`, `headerContentWidth()` in
`layout.ts` — all measured off the board). A title that no longer fits
truncates with a visible ellipsis and keeps the complete string on the
element's `title` attribute — presentation only, the stored data is never
shortened, and the chip is never painted over live text.

```tsx
<Block>
  <BlockHeader>
    <BlockGlyph>🔍</BlockGlyph>
    <BlockTitle>Detect</BlockTitle>
    <BlockChip>Draft 1</BlockChip>
  </BlockHeader>
  <BlockDescription>blackbox modelling</BlockDescription>
  <BlockType>dataflow</BlockType>
</Block>
```

## One core, two hosts — the adapter diff

The presentational core never imports a canvas engine. Each host wraps the
same JSX; the only lines that differ are the host's own concerns
(highlighted):

<table>
<tr><th>React Flow node</th><th>tldraw ShapeUtil</th></tr>
<tr><td>

```tsx
export function BBoxBlockNode(
  { data }: NodeProps<BBoxBlockNodeType>,   // ← host seam
) {
  return (
    <Block>                                  {/* same core */}
      <BlockHeader>
        <BlockGlyph>{data.icon}</BlockGlyph>
        <BlockTitle>{data.title}</BlockTitle>
      </BlockHeader>
      <BlockType>{data.blockType}</BlockType>
      {data.ports.map((p) => (
        <Handle                              // ← port is a DOM element
          id={p.id}
          position={Position.Left}
          className={portDotClass(p.state)}
          style={portDotPlacement("left", p.t)} // ← core places the dot
        />
      ))}
    </Block>
  );
}
// size: React Flow measures the DOM into
// node.measured.width/height (hug), or an
// explicit size arrives as CSS on the node
```

</td><td>

```tsx
class BBoxBlockShapeUtil
  extends ShapeUtil<BBoxBlockShape> {        // ← host seam
  getGeometry(s) {                           // ← size is computed,
    return new Rectangle2d({                 //   props.w/h authoritative
      width: s.props.w, height: s.props.h,
      isFilled: true });
  }
  component({ props }) {
    return (
      <HTMLContainer>
        <Block width={props.w} height={props.h}> {/* same core */}
          <BlockHeader>
            <BlockGlyph>{props.icon}</BlockGlyph>
            <BlockTitle>{props.title}</BlockTitle>
          </BlockHeader>
          <BlockType>{props.blockType}</BlockType>
          {props.ports.map((p) => {
            const a = portDotPlacement(p.side,
              p.t, props.w, props.h);        // ← port is a geometry point,
            return <PortDot state={p.state}   //   placed by the same core fn
              style={{ left: a.left, top: a.top }} />;
          })}
        </Block>
      </HTMLContainer>
    );
  }
}
```

</td></tr>
</table>

The full line is drawn in [ARCHITECTURE.md](ARCHITECTURE.md): layout geometry
is portable and lives in the core; interaction geometry (hit-testing,
snapping, z-order, drag) is host-owned and never travels. One consequence is
the size contract — *explicit size when the scene carries one, hug contents
when it does not* — so a block resized in either host paints the exact same
box in the other. The React Flow demo resizes through the adapter's opt-in
`<NodeResizer>` (select a block, drag a handle), tldraw through its stock
selection handles.

## Compare harness

`demos/compare` (port 5191) renders the one shared scene
([`demos/scene`](demos/scene)) through the reusable comparison view
([`demos/compare-view`](demos/compare-view)) — the same view the playground's
Compare button runs over a live board — and lets you flip between
**Split** / **React Flow** / **tldraw** / **Overlay**. Both panes are **live**:
pan (drag) and zoom (scroll) in either one and the other follows — the cameras
are linked bidirectionally, SystemSketch's `useLinkedCameras` pattern bridged
across the two camera models (`demos/compare/src/cameraBridge.ts` converts
tldraw `{x,y,z}` ↔ React Flow `{x,y,zoom}`, recomputing tldraw's
zoom-dependent HTML-layer compensation on every change; unit-tested
round-trip).

Overlay is an **opacity crossfade** by default — SystemSketch's Compare
screen shape, a `React Flow ⟷ tldraw` slider fading the top pane — with the
`mix-blend-mode: difference` proof one toggle away: matching pixels cancel to
black, so any divergence is the only thing that lights up. A readout panel
reports block bounding boxes and port-dot centres compared numerically from
the DOM, per block and port, in screen px, updating live as you pan and zoom.
Measured divergence: **0.00 px** at zooms 0.25 / 0.45 / 1.0 / 2.0 and after a
pan (blocks tldraw culls offscreen are dropped from the reading and counted).

```bash
pnpm demo:compare      # http://127.0.0.1:5191  (#split #reactflow #tldraw #overlay)
node demos/drive-compare.mjs   # headless: modes, blend, real pan/zoom gestures in each
                               # pane (asserting the other follows), divergence per zoom
```

## Playground

`apps/playground` (port 5193) is the **editable** tldraw canvas — place
bbox-ui primitives from the toolbar, adjust them, iterate. (`demos/tldraw`
stays a deterministic read-only pane for the compare harness; this is the one
you draw on. What you draw persists across reloads via `persistenceKey`.)

Everything goes through stock tldraw seams, cloning SystemSketch's toolbar
conventions: the stock tools are compacted into **family slots** (shapes,
drawing), and a new **Black box** family holds the bbox-ui primitives —
**Block** (`B`) and **Port** (`P`) today; adding a primitive later is one
menu entry plus one tool registration. A family button both selects the
family's current tool and opens its menu; the last-used tool per family is
remembered in `localStorage`. The tools themselves live in
`@bbox-ui/adapter-tldraw` (`BBoxBlockTool`, `BBoxPortTool`, and a minimal
standalone `bbox-port` shape painted by the same core `PortDot`).

**⇄ Compare** (top right) runs the React Flow ⟷ tldraw comparison over
whatever is on the board right now: the live shapes are projected into the
host-neutral scene (`sceneFromEditor` in [`demos/scene`](demos/scene)) and
handed to the same `CompareView` the fixed harness uses — Split / fullscreen /
Overlay, linked cameras, numeric divergence readout, and a Back button to
return to authoring. The tldraw pane in compare mode is a second, read-only
editor seeded from the derived scene, so the authoring board is never
disturbed. The counting is honest about its denominator:

- Stock tldraw shapes (rectangles, arrows, text, notes…) have no React Flow
  counterpart. They are **counted, not dropped** — the readout says e.g.
  `comparing 2 of 3 shapes — 1 stock tldraw shape (geo ×1) has no React Flow
  counterpart`.
- A standalone `bbox-port` has no natural React Flow equivalent (handles
  belong to nodes there), so it rides in a minimal chrome-less wrapper node at
  the same world point — and the readout **discloses the wrapper**.
- A board with zero bbox-ui shapes shows an explicit empty state, never
  `max |Δ| = 0.00 px` — zero things compared is not agreement.

```bash
pnpm demo:playground   # http://127.0.0.1:5193
node demos/drive-playground.mjs   # headless: family select-and-open, menu pick,
                                  # B/P shortcuts, shape creation, reload memory
node demos/drive-playground-compare.mjs  # headless: empty-board empty state, author
                                         # Block+Port+rectangle, RESIZE the block by a
                                         # real handle drag, enter compare, assert
                                         # "2 of 3" denominator + 0.00px divergence
                                         # (Δsize included — both hosts paint the
                                         # resized box), authoring board undisturbed
```

**Detach to primitives** (right-click a selection): every bbox-ui shape
converts to its closest stock-tldraw approximation — geo rectangle/ellipse
for card and dots, text for labels, oval for the chip — grouped, with one
**nested** group per port (dot + label move as one unit), so the result
unpeels top-down one grouping at a time. The group's `meta.bboxUi` carries
the complete original props; **Rebuild Block/Port** (same menu) reads it
back into the real shape, props identical — the detached `.tldr` opens as
plain shapes on tldraw.com and comes back to life here. The hierarchy is
real, not repeated: Block's reduction invokes Port's through one shared
contract (`packages/adapter-tldraw/src/detach/`), and the detached picture's
geometry comes from the same core layout modules the live renderer uses.
See [ARCHITECTURE.md](ARCHITECTURE.md#detach-to-primitives).

```bash
node demos/drive-playground-detach.mjs  # headless: seed Block+Port, detach via the
                                        # real context menu, assert stock-only types +
                                        # nested port groups + meta records, rebuild,
                                        # assert props deep-equal the originals
```

## Registry

`registry.json` follows the
[shadcn registry schema](https://ui.shadcn.com/docs/registry/registry-json);
`pnpm registry:build` (shadcn `build`) emits servable items to `public/r/`:
`port`, `block`, `bbox-layout`, `block-node-reactflow`, `block-shape-tldraw`.

## Develop

```bash
pnpm install
pnpm test              # unit tests: core layout (icon ratio, states, layouts)
                       # + compare camera bridge (tldraw ↔ React Flow round-trip)
                       # + sceneFromEditor (bbox shapes kept, stock counted, empty board)
                       # + the size contract (explicit w/h → CSS on the RF node; hug otherwise)
pnpm build             # typecheck everything + build every demo/app
pnpm demo             # all demos + the playground: React Flow 5183, tldraw 5189,
                      # compare 5191, playground 5193
pnpm demo:reactflow    # http://127.0.0.1:5183
pnpm demo:tldraw       # http://127.0.0.1:5189
pnpm demo:compare      # http://127.0.0.1:5191
pnpm demo:playground   # http://127.0.0.1:5193  (the editable one)
node demos/drive.mjs reactflow http://127.0.0.1:5183   # headless assert + screenshot
node demos/drive.mjs tldraw    http://127.0.0.1:5189
node demos/drive-compare.mjs                           # all four compare modes
node demos/drive-playground.mjs                        # toolbar + tools journey
node demos/drive-playground-compare.mjs                # live-board compare journey
node demos/drive-playground-detach.mjs                 # detach → stock shapes → rebuild
node demos/drive-playground-truncation.mjs             # detached-title ellipsis vs the
                                                       # browser's own DOM measurement
```

> **tldraw licence note**: tldraw's SDK licence forbids production use
> without a paid licence. The pinned `tldraw@5.3.2` here is for local
> development only — do not ship the tldraw adapter in a product without
> resolving licensing.
