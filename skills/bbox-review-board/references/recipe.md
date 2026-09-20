# Review recipe (tldraw app)

A recipe describes **intent**. The generator lets the running editor fill defaults, validate custom records against the installed schema, and serialize the file. Nothing here is a schema you maintain by hand.

## Shape

```json
{
  "feature": "Short human name",
  "viewport": { "width": 1280, "height": 720 },
  "shapes": [],
  "connections": [],
  "bindings": [],
  "callouts": []
}
```

- `feature` — required.
- `viewport` — optional, sets the screenshot size (default 1280×720, a conservative size so a fitted camera stays legible; go larger only when the interaction needs it).
- `shapes` — **required, non-empty**: partials accepted by `Editor.createShapes`. A review board is never blank. `id` is a short local id (`estimate`); the generator expands it to `shape:estimate`, and `parentId` takes the same shorthand. Parents are created before children.
- `connections` — cables between two seeded objects, built by the app's own `createWire` (one `ss-wire` + two bindings in one transaction). See [Cables](#cables).
- `bindings` — raw tldraw bindings partials. Rare; for a real semantic binding the app documents. Never for cue arrows.
- `callouts` — cue cards, see [Callouts](#callouts).

`text` on a **stock** `geo`, `text` or `note` shape is shorthand for tldraw rich text. The app's own shapes keep their names in their own props (`name`, …); the shorthand is deliberately not applied to them.

## Objects in the tldraw app

The document's vocabulary is closed: `apps/systemsketch/src/shapes/types.ts` (`ss-block`, `ss-code`, `ss-port`, `ss-wire`, `ss-region`, binding `ss-wire-binding`), plus tldraw's own stock shapes. A saved `.tldr` carries exactly those strings.

### Block — `ss-block`

```json
{
  "id": "estimate",
  "type": "ss-block",
  "x": 540, "y": 300,
  "props": {
    "name": "estimate()",
    "view": "port",
    "w": 200, "h": 120,
    "ports": {
      "left": [],
      "right": [{ "id": "out", "name": "out", "type": "Pose" }],
      "top": [],
      "bottom": []
    }
  }
}
```

- `view` is `simple` | `port` | `expanded`. Defaults are `w:160 h:100 view:"port"`, no ports.
- A port is `{id, name, type}`. **`id` is what a cable names**; `name` is what the rail paints.
- Leave `anchors` out. The app **measures** each dot once it has rendered and writes the reading back onto the shape; the generator waits for it. Consequence: a seeded Block must be **on screen** when built, because tldraw does not render what it cannot see. The camera is fitted to the board before it waits.
- An **expanded** Block is frame-like; its children need `parentId` = the Block's id (parent-local `x`/`y`).

### Other shapes

`ss-port` (a floating one-port node; its single port id is `"port"`), `ss-code`, `ss-region` and the stock shapes are accepted, but this reference carries **no verified example** for them yet. The first time a review needs one: read its `getDefaultProps()` and props validators under `apps/systemsketch/src/shapes/<kind>/`, seed the smallest instance, add the worked example here, and only then rely on it. Facts already established: `ss-code` and `ss-region` are **not** cable ends (`canBind` is false for both); a region is never a wire target, because control flow is never a cable.

## Cables

```json
{ "from": { "shape": "estimate", "port": "out" },
  "to":   { "shape": "encode",   "port": "in"  },
  "routing": "elbow", "color": "" }
```

`routing` and `color` are optional; omitted means the app's own defaults (elbow, no colour) — Zach's datum. A cable to something the app refuses (`canBind` false) makes the build fail with the connection's index. Two cables between the same pair of ports are legal and are what the "shared port shows a count" example draws — the app's linter flags them as `duplicate-edge`, and the generator prints that under **Problems badge**.

## Callouts

```json
{
  "id": "step-1",
  "kind": "step",
  "text": "1 · Drag estimate() 120 px down",
  "x": 40, "y": 285, "w": 400, "h": 110,
  "target": { "shapeId": "estimate", "anchor": "left", "dy": -20 }
}
```

- `kind` is `step` (orange), `note` (blue) or `pass` (green). A `pass` card normally has no target and begins `PASS WHEN`.
- Each callout becomes a stock **`geo` rectangle**; one with a `target` also gets a stock **elbow `arrow`**, bound to the card. Everything stays editable in the resulting board.
- `target` is `{shapeId, anchor: "top|right|bottom|left", dx?, dy?}` or an absolute `{x, y}`. `anchor` is a **geometry contract**, not a label: the card must sit *outside* that edge. `dy` slides the point along a `left`/`right` edge, `dx` along a `top`/`bottom` edge; an offset that would pull the tip off its edge is rejected, and a `center` anchor is rejected as ambiguous. When several cues target one edge, separate them by at least 48 along it.
- **Align the card with the target point** (choose `dy`/`dx`) and the arrow is a single straight segment. The example's first cue uses `dy: -20` for exactly that.
- Text must fit the card: about `floor((w−44)/10)` characters per line and `floor((h−34)/24)` lines. The validator estimates it and fails "enlarge or shorten" rather than let it clip.

### Arrows and moved targets

The arrow's tip is a **fixed point** on the target's edge, not a binding, because the app's shapes refuse arrow bindings (see SKILL.md). The generator measures the tip against the named edge point (±1.5) and checks the last segment is perpendicular to that edge, from the arrow's painted path. It never trusts `x`/`y` props.

## Review quality

- Pre-arrange the state immediately before the primary gesture. One step per physical action; if setup takes three gestures, encode it in the file.
- State observable success ("the doubled port shows a 2"), not internals ("the callback fired").
- Cards at least 340×100, at least 48 apart, at least **80 from any object** (enforced from real bounds). Prefer width to height.
- Keep the whole scene inside the viewport with margin; `zoomToFit` is not permission to place a card partly off-screen.
- If the review is about something the recipe cannot represent (a run state, a hover), seed the smallest honest board and put the literal gesture in a cue. Do not hand-author derived records.
