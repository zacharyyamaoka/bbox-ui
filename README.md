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
// size: React Flow measures the DOM
// into node.measured.width/height
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
snapping, z-order, drag) is host-owned and never travels.

## Compare harness

`demos/compare` (port 5191) renders the one shared scene
([`demos/scene`](demos/scene)) in both hosts and lets you flip between
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
pnpm build             # typecheck everything + build both demos
pnpm demo             # all three demos: React Flow 5183, tldraw 5189, compare 5191
pnpm demo:reactflow    # http://127.0.0.1:5183
pnpm demo:tldraw       # http://127.0.0.1:5189
pnpm demo:compare      # http://127.0.0.1:5191
node demos/drive.mjs reactflow http://127.0.0.1:5183   # headless assert + screenshot
node demos/drive.mjs tldraw    http://127.0.0.1:5189
node demos/drive-compare.mjs                           # all four compare modes
```

> **tldraw licence note**: tldraw's SDK licence forbids production use
> without a paid licence. The pinned `tldraw@5.3.2` here is for local
> development only — do not ship the tldraw adapter in a product without
> resolving licensing.
