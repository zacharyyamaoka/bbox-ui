# The ask — 2026-09-19 late morning (Zach's feedback on the overnight build)

Source: `/home/bam/zach_brain/Sources/Daily Notes/Daily Note - Sep 19 2026.md` §"System sketch".
Images are the spec — `Read` them: `/home/bam/zach_brain/Pasted image 20260919<stamp>.png`.

## Verbatim

> the ports look way too big right now and the port text size also seems too big. generally it
> looks very unprofessional (`114919` — the tldraw app on a pyblocks board: big orange dots,
> large labels, straight-ish cables, a dashed "ss-region — lane L5" placeholder).
>
> 1. by default elbow arrows should always be used. never straight arrows (`114952` — the
> Rung A story: straight arrows between blocks).
>
> Please make 5 proposals for how these regions could be drawn differently (`115050` — a Branch
> region in the tldraw app: the corner block is inset from the frame, its `input 1` port is
> huge and CUT OFF by the frame edge). Generally I want the port to be right on the edge, and it
> shouldn't be cut off by the frame. This is desired: (`115249` — the DOM-canvas render of the
> nested Branch: the corner block's `mode` port sits exactly on the region's left edge, the
> corner block is flush with the frame's top-left, arms are rows with chevrons, nested Branch
> inside an arm). I think perhaps though you need to draw a line here..? (`115353` — the same
> render; he means a header line/rule for the branch arms). idk I leave it up to you… please make
> 5 different proposals.
>
> very bad. edges should always leave from the center of the port. I don't like how you have 3
> edges coming out from different parts of the port (`115137` — three cables leaving `pose` at
> three stacked offsets) and attaching to different sides (`115156` — two cables entering a
> port from two different attach points). The port only should have 1 connection point in the
> center. Instead you should show the producer circle that has the number for the number of
> arrows intersecting at that port.
>
> I really like this for loop, you definitely understood my concept with the region (`115424` —
> the DOM-canvas For Loop: corner block flush top-left, `Iterable`/`Iter` typed ports, two
> member blocks inside; note `merge`'s `other`/`Pose` labels touching).
>
> Ok its a great start. My general feedback:
> 1. The ports need a lot of work. please make 5 proposals for different visual styles for them
> (vary the sizing etc.). I want the port text to be "small" by default.
>    1. one proposal should be based on the original SystemSketch source code
>    2. one proposal should be based on langflow: https://github.com/langflow-ai/langflow
>    3. I only want to see proposals that explore circular ports. There was a list in this vault
>    with like 10 good reactflow references… that is likely a treasure trove for ideas
>    (`/home/bam/pyblocks/reports/media/react-flow-references.md`)
>    I also just want to see proposals where the ports are on the edge, not where they are inset
>    (`115744` — a tiny crop of a node with square coloured handles inset inside the node body:
>    the thing NOT wanted).
> 2. the DOM render image and the one actually in tldraw seem different.. please make the one in
> tldraw more like the one in the DOM render image, for the regions. then also come up with 5
> variants for the regions (one is adding that line header for the branches).

## Dispatcher's reading — what is a FIX (objective, ship it) and what is a PROPOSAL (5 variants)

FIXES (lane `fix-edges`, Opus):
- Elbow routing is the default everywhere a cable is drawn without an explicit routing: the
  trunk (`components/wiring.ts`, `scene/sceneWires.ts`, `components/trace.layout.ts` defaults,
  the three hosts) and the app (`apps/systemsketch/src/shapes/wire/*`). Straight is never a
  default; it may remain a selectable style.
- ONE attach point per port, at the dot's centre, for every cable in and out. Today cables are
  spread across the dot (three stacked offsets leaving `pose`; two entering at different points).
  Find where that spread is computed (`trace.layout.ts` terminal specs, `portEdge.layout.ts`,
  `wireLayer.tsx`'s dot resolution, `hosts/portDotSightings.ts`, the app's `wireGeometry.ts`)
  and remove it; cables converge on the centre. Fan-out/fan-in of several cables at one dot is
  what the producer-count badge is for (lane `producers-count`).
- tldraw parity for regions: `apps/systemsketch/src/shapes/region/RegionFace.tsx` renders the
  trunk's `Region` component (`apps/storybook-basics/src/components/region.tsx`) — the same
  drawing as the DOM canvas — so the corner block sits flush with the frame's top-left, its port
  dots sit ON the frame edge and are never clipped (`overflow: visible` on the shape container,
  or the frame inset by the dot radius, whichever the trunk component already does), arms are
  rows with chevrons. Measure it against `115249`/`115424`.

PROPOSALS (5 each, rendered as switchable variants, not prose):
- Lane `ports` (Fable): five circular, ON-THE-EDGE port styles varying dot diameter, ring/fill,
  label size/weight/placement, type placement, hover/selected/wired states. Small text by
  default: add an `xs` rung (≈12–13 px) to `PORT_TEXT_SIZES` and a matching dot diameter, and
  make the smallest sensible pair the default at canvas zoom. One variant ports the original
  SystemSketch port (`/home/bam/systemsketch/src/bboxUi/core/port.tsx`, `port.layout.ts`,
  `port.presets.ts`, `portEdge.tsx`; and `src/blocks/ports/*` for the older one); one ports
  langflow's handle (clone `https://github.com/langflow-ai/langflow` shallow into the
  scratchpad and read `src/frontend/src/CustomNodes/**/handleRenderComponent*` and its CSS —
  circular handle on the node edge, colour by type, label inside the row); the other three come
  from the React Flow references list and your own judgment. Variant 1 is applied as the
  default so ignoring is free; the others switch live (see `app-variant-switch`).
- Lane `regions` (Fable): five region drawings varying frame stroke/fill/radius, corner-block
  integration (the labeled-group look Zach picked), arm header treatment (one variant adds the
  header RULE under the corner block / across each arm that Zach pointed at in `115353`), arm
  fold affordance, nested-region contrast, and the opaque card. Anchor: keep the For Loop
  reading he liked (`115424`). Variant 1 is the default.

AFTER BOTH LAND:
- Lane `producers-count` (Opus): compute, per port, the number of cables meeting it (scene
  kit, pure) and pass it through the hosts so the port renders the producer-count circle badge
  the `ports` lane defines (`producers?: number` on the port item). One centre attach point +
  a count is the whole language for fan-in/fan-out.
- Lane `app-variant-switch` (Opus): a temporary bottom-right dropdown in `apps/systemsketch`
  (and a Storybook toolbar/global in `apps/storybook-basics`) that switches the port variant
  and the region variant live and remembers the choice (localStorage), so Zach never types a
  URL flag. Captures of every variant in BOTH surfaces.

Contracts (spell them once, both sides obey):
- `apps/storybook-basics/src/skin/portVariants.ts` — `export const PORT_VARIANTS: Record<PortVariantId, PortVariant>`;
  `PortVariantId = "v1" | … | "v5"`; `PortVariant = { id, title, basedOn, dot: { diameter, ring, fill }, text: PortTextSize, … }` — the `ports` lane owns and documents it.
- `apps/storybook-basics/src/skin/regionVariants.ts` — same shape for regions — the `regions` lane owns it.
- `producers?: number` on the port item type in `blockPort.tsx` (and `PortProps`) — the `ports` lane adds and renders it; `producers-count` fills it.
- The variant in force is read from `document.documentElement.dataset.bboxPortVariant` / `bboxRegionVariant` (CSS custom properties + data attributes, no React context needed), defaulting to `v1` — so the app switch and the Storybook global are three lines each.

Settled and not re-opened: everything is a block; never mix data and control lines; the core
imports no canvas engine; tldraw stays stock; ports are circles (Zach: "I only want to see
proposals that explore circular ports").
