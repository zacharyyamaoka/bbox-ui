import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  atom,
  resizeBox,
  type Atom,
  type Editor,
  type TLBaseShape,
  type TLResizeInfo,
} from "tldraw";

import type { ReactNode } from "react";
import {
  BLOCK_VIEW_DEFAULT_SIZES,
  Bar,
  Block,
  BlockBand,
  BlockChip,
  BlockDescription,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
  META_FONT_PX,
  PORT_DIAMETERS,
  PORT_DOT_CENTER_TRANSFORM,
  PortDot,
  PortLabel,
  SIMPLE_BLOCK,
  TextBox,
  parkViewSize,
  portDotPlacement,
  portLabelPlacement,
  resolveBlockFace,
  type AppearanceState,
  type BlockFaceFields,
  type BlockHeaderMode,
  type BlockMembersMode,
  type BlockPortsMode,
  type BlockSide,
  type BlockTypePlacement,
  type BlockView,
  type BlockViewSizes,
  type PortTextLayout,
  type TextSize,
} from "@bbox-ui/core";

/**
 * A port stored on the shape record. Note the state validator below admits
 * only "empty" | "valueSet" | "wired".
 * WHY: `received` is a RUNTIME prop, never persisted document state — a
 * .tldr file that recorded "data arrived here" would be lying after reload.
 * Runtime delivery goes through the per-editor received-ports table instead.
 *
 * INTEGRATION (docs/T1-SPEC.md §2): "default" renamed to "valueSet" — the
 * rebuilt Port's `AppearanceState` name for the same resting state, and
 * (2026-09-12) its full persistable range: `outOfFocus` left the value
 * axis for the host-only, never-persisted `dimmed`, and `hidden` became
 * its own author-set boolean beside `state`, not a value of it — neither
 * is added to this persisted shape here; see detach/portPrimitives.ts's
 * `DetachablePortState` note. `size` stays the literal three rungs the
 * validator below enforces — not
 * the live `Port`'s wider `PortSize` (which also admits an exact numeric
 * diameter, `port.layout.ts`'s "Exact" escape hatch) — a persisted shape
 * has never offered that escape hatch and the validator would reject it.
 */
export interface BBoxShapePort {
  id: string;
  direction: "input" | "output";
  state: "empty" | "valueSet" | "wired";
  size: "sm" | "md" | "lg";
  label: string;
  textLayout: PortTextLayout;
  side: BlockSide;
  t: number;
}

export interface BBoxBlockShapeProps {
  w: number;
  h: number;
  title: string;
  titleSize: TextSize;
  blockType: string;
  description: string;
  icon: string;
  tag: string;
  orientation: "horizontal" | "vertical";
  ports: BBoxShapePort[];
  /**
   * `null` = the legacy hand-authored composition below — every existing
   * scene, the compare harness's divergence measurement and demos/drive.mjs
   * pin those exact pixels. A `BlockView` engages `resolveBlockFace`'s
   * preset-governed face pipeline instead (P2 "views are presets",
   * reports/view-switching-proposals-2026-09-11.html).
   */
  view: BlockView | null;
  /** The remembered box per view, kept current by `onResize` below —
   * `parkViewSize`'s bookkeeping (block.view.ts). `null` until the first
   * view switch seeds it from `BLOCK_VIEW_DEFAULT_SIZES`. */
  views: BlockViewSizes | null;
}

// tldraw 5.x custom shapes register their props on the global map so the
// shape type participates in TLShape (the documented augmentation path).
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "bbox-block": BBoxBlockShapeProps;
  }
}

export type BBoxBlockShape = TLBaseShape<"bbox-block", BBoxBlockShapeProps>;

/** Runtime `received` flags: shape id → port id → lit. */
export type ReceivedPortFlags = Record<string, Record<string, true>>;

/**
 * Runtime-only "data received" flags, one table PER EDITOR. A tldraw atom
 * so `component()` (which is reactive) repaints when a flag flips.
 *
 * WHY a side table and not a shape prop: shape props are the persisted
 * document; `received` must never survive a save/load. See BBoxShapePort.
 *
 * WHY per editor and not module-global: `editor.dispose()` drops a document
 * WITHOUT deleting its shapes, so no delete handler ever fires — a global
 * table outlived the editor, and a later editor opening a different
 * document that reuses a shape id (and port id) painted a port received
 * that never received anything. The WeakMap scopes each table to its
 * editor and lets a disposed editor's flags be collected with it.
 *
 * WHY nested keys and not `${shapeId}:${portId}`: both ids may contain
 * ":", so the flat key was ambiguous — `shape:a` + `b:c` and `shape:a:b` +
 * `c` collided on one flag, lighting and clearing each other.
 */
const receivedPortsByEditor = new WeakMap<Editor, Atom<ReceivedPortFlags>>();

export function receivedPortsAtom(editor: Editor): Atom<ReceivedPortFlags> {
  let flags = receivedPortsByEditor.get(editor);
  if (!flags) {
    flags = atom<ReceivedPortFlags>("bbox received ports", {});
    receivedPortsByEditor.set(editor, flags);
  }
  return flags;
}

export function setPortReceived(
  editor: Editor,
  shapeId: string,
  portId: string,
  received: boolean,
) {
  receivedPortsAtom(editor).update((current) => {
    const forShape = current[shapeId];
    // A false flag IS the absence of a flag — storing it would grow the map
    // by one dead entry per delivery, forever.
    if (!received) {
      if (!forShape || !(portId in forShape)) return current;
      const nextShape = { ...forShape };
      delete nextShape[portId];
      const next = { ...current };
      if (Object.keys(nextShape).length === 0) {
        delete next[shapeId];
      } else {
        next[shapeId] = nextShape;
      }
      return next;
    }
    if (forShape?.[portId]) return current;
    return { ...current, [shapeId]: { ...forShape, [portId]: true } };
  });
}

/** Drop every runtime `received` flag keyed under one shape id. */
export function clearReceivedPorts(editor: Editor, shapeId: string) {
  receivedPortsAtom(editor).update((current) => {
    if (!(shapeId in current)) return current;
    const next = { ...current };
    delete next[shapeId];
    return next;
  });
}

/**
 * Prune the runtime `received` flags of any shape the moment it leaves the
 * document, and drop the whole table when the editor is disposed. Returns
 * the unsubscribe function.
 *
 * WHY the delete handler: the table is keyed by shape id and nothing else
 * ever deletes — a received flow, a detach (which rekeys onto the carrier
 * group) and then a plain delete of that carrier left the carrier's flags
 * in the map forever, and repeated flows grew it without bound. The handler
 * covers every owner of a flag — live bbox shapes AND the stock carrier
 * groups detach mints — which is why it hangs off the editor, not off one
 * shape util. Detach and rebuild both hand flags to the replacement id
 * BEFORE deleting the old shape, so this pruning never races the rekey.
 *
 * WHY the disposable: `dispose()` tears the document down without deleting
 * its shapes, so the delete handler never fires for them; dropping the
 * table with the editor keeps a dead document's deliveries out of memory.
 */
export function registerReceivedPortCleanup(editor: Editor): () => void {
  const stop = editor.sideEffects.registerAfterDeleteHandler("shape", (shape) => {
    clearReceivedPorts(editor, shape.id);
  });
  const dropTable = () => receivedPortsByEditor.delete(editor);
  editor.disposables.add(dropTable);
  return () => {
    stop();
    editor.disposables.delete(dropTable);
  };
}

/**
 * Move every runtime `received` flag keyed under one shape id to another.
 *
 * WHY: detach and rebuild both replace a shape with a freshly minted id, and
 * a flag keyed to the dead id would leave a port that is receiving right now
 * dark after the swap. The hand-off stays entirely in this runtime atom —
 * the flags never travel through `meta` or props, so nothing about
 * "received" ever reaches the persisted document.
 */
export function rekeyReceivedPorts(
  editor: Editor,
  fromShapeId: string,
  toShapeId: string,
) {
  receivedPortsAtom(editor).update((current) => {
    const moving = current[fromShapeId];
    if (!moving) return current;
    const next = { ...current };
    delete next[fromShapeId];
    next[toShapeId] = { ...next[toShapeId], ...moving };
    return next;
  });
}

const portValidator: T.Validator<BBoxShapePort> = T.object({
  id: T.string,
  direction: T.literalEnum("input", "output"),
  // Deliberately excludes "received" — see BBoxShapePort.
  state: T.literalEnum("empty", "valueSet", "wired"),
  size: T.literalEnum("sm", "md", "lg"),
  label: T.string,
  textLayout: T.literalEnum("top", "bot", "right", "left"),
  side: T.literalEnum("left", "right", "top", "bottom"),
  t: T.number,
});

const viewSizeValidator = T.object({ w: T.number, h: T.number });

/**
 * WHY not a tldraw `StyleProp`: the report that proposed view-switching also
 * proposed StyleProp for stock multi-select batching — but a StyleProp
 * cannot be null, and every legacy shape (`view: null`) would be forced
 * into a face the moment the prop existed. Declaring that batching a
 * follow-up (via `getSharedStyles`) keeps `view` a plain nullable prop,
 * matching `views` and the rest of this shape's persisted fields.
 */
const viewValidator = T.literalEnum("simple", "port", "expanded").nullable();

const viewSizesValidator = T.object({
  simple: viewSizeValidator,
  port: viewSizeValidator,
  expanded: viewSizeValidator,
}).nullable();

/**
 * Applies a view switch to a shape's props: parks the box the view being
 * left is at RIGHT NOW under its own slot in `views`, then hands back the
 * box the target view remembers (seeding `views` from
 * `BLOCK_VIEW_DEFAULT_SIZES` the first time a shape ever switches).
 *
 * WHY one shared `parkViewSize` (block.view.ts) rather than each host
 * adapter doing its own bookkeeping: forget to route through it in one
 * adapter and Expanded opens at whatever box Port happened to be at,
 * instead of Expanded's own remembered size — exactly the bug
 * `parkViewSize`'s own docblock warns about.
 */
export function applyBlockShapeView(
  props: BBoxBlockShapeProps,
  view: BlockView,
): BBoxBlockShapeProps {
  const sizes = props.views ?? BLOCK_VIEW_DEFAULT_SIZES;
  const from = props.view ?? "simple";
  const parked = parkViewSize(sizes, from, view, { w: props.w, h: props.h });
  return { ...props, view, views: parked.sizes, w: parked.size.w, h: parked.size.h };
}

/* -------------------------------------------------------------------- */
/* View-engaged face rendering (P2 "views are presets") — every lookup   */
/* below is TOTAL over a resolved face field, mirroring blockFace.tsx's  */
/* own hard rule: never a `switch (view)`, never a bare `view === "…"`   */
/* comparison outside the `data-view` probe attribute. `view === null`   */
/* (the legacy composition, untouched) is the one branch that IS a bare  */
/* comparison, because it opts OUT of the face pipeline entirely.        */
/* -------------------------------------------------------------------- */

type ShapePortState = (port: BBoxShapePort) => AppearanceState;

/**
 * "anonymous": every port stays in the DOM with a stable `data-port-id` (so
 * bindings/probes survive a view switch) at its normal wall anchor, but
 * paints nothing — no dot, `visibility: "hidden"`.
 */
function anonymousShapePorts(ports: BBoxShapePort[], width: number, height: number): ReactNode {
  return (
    <>
      {ports.map((port) => {
        const placement = portDotPlacement(port.side, port.t, width, height);
        return (
          <div
            key={port.id}
            data-port-id={port.id}
            data-slot="block-shape-port-anonymous"
            className="absolute"
            style={{ ...placement, transform: PORT_DOT_CENTER_TRANSFORM, visibility: "hidden" }}
          />
        );
      })}
    </>
  );
}

/** "rows": one in-flow row per port in the body area, inputs before outputs. */
function shapePortRows(ports: BBoxShapePort[], portState: ShapePortState): ReactNode {
  const ordered = [
    ...ports.filter((port) => port.direction === "input"),
    ...ports.filter((port) => port.direction === "output"),
  ];
  return (
    <div
      data-slot="block-shape-port-rows"
      // WHY the 8px horizontal padding: rows mode renders inside Block's
      // edge-to-edge (px-0) band, so a row dot at the row's very end paints
      // its ring past the padding box and Block's overflow:clip flat-cuts
      // it at the wall. 8px matches the bench body's own inset.
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
        width: "100%",
        padding: "0 8px",
      }}
    >
      {ordered.map((port) => (
        <div
          key={port.id}
          data-port-id={port.id}
          // WHY row-reverse for outputs: an output's dot sits at the row's
          // RIGHT edge, name flowing inward — the same direction mirror the
          // core's BlockPortRows gets from Port's edge-driven flex layout,
          // so every host reads identically.
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            flexDirection: port.direction === "output" ? "row-reverse" : "row",
          }}
        >
          <PortDot state={portState(port)} diameter={port.size} className="block" />
          {port.label !== "" && <PortLabel>{port.label}</PortLabel>}
        </div>
      ))}
    </div>
  );
}

/**
 * "walls": exactly the per-port absolute rendering the legacy (view: null)
 * composition below already paints — dot at (side, t), label placed inward.
 */
function shapePortWalls(
  ports: BBoxShapePort[],
  width: number,
  height: number,
  portState: ShapePortState,
): ReactNode {
  return (
    <>
      {ports.map((port) => {
        const placement = portDotPlacement(port.side, port.t, width, height);
        const diameter = PORT_DIAMETERS[port.size];
        return (
          <div
            key={port.id}
            data-port-id={port.id}
            data-slot="block-shape-port-wall"
            className="absolute"
            style={{ ...placement, transform: PORT_DOT_CENTER_TRANSFORM }}
          >
            <PortDot state={portState(port)} diameter={port.size} className="block" />
            {port.label !== "" && (
              <PortLabel
                className="absolute"
                style={portLabelPlacement(port.textLayout, { w: diameter, h: diameter })}
              >
                {port.label}
              </PortLabel>
            )}
          </div>
        );
      })}
    </>
  );
}

const PORTS_MODE_RENDER: Record<
  BlockPortsMode,
  (ports: BBoxShapePort[], width: number, height: number, portState: ShapePortState) => ReactNode
> = {
  anonymous: (ports, width, height) => anonymousShapePorts(ports, width, height),
  rows: (ports, _width, _height, portState) => shapePortRows(ports, portState),
  walls: (ports, width, height, portState) => shapePortWalls(ports, width, height, portState),
};

interface TypeModeNodes {
  /** Rendered as a direct `Block` child, always — `null` under "header". */
  bottom: ReactNode;
  /** Handed to whichever `HEADER_MODE_RENDER` entry places it — `null`
   * under "bottom". Mirrors blockFace.tsx's own `TYPE_RENDER` split. */
  inline: ReactNode;
}

const TYPE_MODE_RENDER: Record<BlockTypePlacement, (blockType: string) => TypeModeNodes> = {
  bottom: (blockType) => ({
    bottom: blockType !== "" ? <BlockType>{blockType}</BlockType> : null,
    inline: null,
  }),
  header: (blockType) => ({
    bottom: null,
    inline:
      blockType !== "" ? (
        <TextBox key="type-inline" size="sm" lines="single" className="text-muted-foreground">
          {blockType}
        </TextBox>
      ) : null,
  }),
};

interface FaceHeaderCtx {
  props: BBoxBlockShapeProps;
  face: BlockFaceFields;
  typeInline: ReactNode;
}

const HEADER_MODE_RENDER: Record<BlockHeaderMode, (ctx: FaceHeaderCtx) => ReactNode> = {
  centered: ({ props, face, typeInline }) => (
    <>
      <BlockHeader orientation={props.orientation}>
        {props.icon !== "" && <BlockGlyph size={props.titleSize}>{props.icon}</BlockGlyph>}
        <BlockTitle size={props.titleSize}>{props.title}</BlockTitle>
        {props.tag !== "" && <BlockChip>{props.tag}</BlockChip>}
        {typeInline}
      </BlockHeader>
      {face.description && props.description !== "" && (
        <BlockDescription>{props.description}</BlockDescription>
      )}
    </>
  ),
  band: ({ props, face, typeInline }) => (
    <>
      <BlockBand
        data={{
          title: props.title,
          typeLabel: props.blockType || undefined,
          description: props.description || undefined,
          icon: props.icon || undefined,
          tag: props.tag || undefined,
          titleSize: props.titleSize,
        }}
        typeInline={typeInline}
      />
      {face.description && props.description !== "" ? (
        <p
          data-slot="block-shape-face-description"
          className="text-muted-foreground"
          style={{ fontSize: META_FONT_PX, padding: "0 8px" }}
        >
          {props.description}
        </p>
      ) : null}
    </>
  ),
};

// band → mirrors blockFace.tsx's own CONTAINER_CLASS: an edge-to-edge
// region stacked from the top, instead of Block's own centered default.
const FACE_CONTAINER_CLASS: Record<BlockHeaderMode, string | undefined> = {
  centered: undefined,
  band: "flex-col items-stretch justify-start px-0 text-left",
};

// Mirrors blockFace.tsx's own `PORTS_OVERFLOW`: only "walls" mode straddles
// the block's outer boundary, so only it needs Block's `overflow: clip`
// relaxed — clip otherwise amputates the outer half of every wall dot.
const FACE_PORTS_OVERFLOW: Record<BlockPortsMode, "visible" | undefined> = {
  anonymous: undefined,
  rows: undefined,
  walls: "visible",
};

// "shown" is an austere placeholder region — no member list is wired up
// yet. WHY no tldraw drop-in containment (isFrameLike) here: that is the
// view-switching report's own explicit "later, for drop-in" scope-out, not
// an oversight of this pass.
const MEMBERS_MODE_RENDER: Record<BlockMembersMode, () => ReactNode> = {
  hidden: () => null,
  shown: () => <div data-slot="block-shape-members" style={{ width: "100%" }} />,
};

/**
 * tldraw host adapter. The same presentational core renders inside
 * `HTMLContainer`, but here `props.w`/`props.h` on the shape record are
 * authoritative and the body geometry comes from `getGeometry()` — port
 * anchors are geometry points computed by the shared layout module, not DOM
 * elements the engine could measure.
 */
export class BBoxBlockShapeUtil extends ShapeUtil<BBoxBlockShape> {
  static override type = "bbox-block" as const;

  static override props = {
    w: T.number,
    h: T.number,
    title: T.string,
    titleSize: T.literalEnum("md", "lg", "xl"),
    blockType: T.string,
    description: T.string,
    icon: T.string,
    tag: T.string,
    orientation: T.literalEnum("horizontal", "vertical"),
    ports: T.arrayOf(portValidator),
    view: viewValidator,
    views: viewSizesValidator,
  };

  override getDefaultProps(): BBoxBlockShape["props"] {
    return {
      w: SIMPLE_BLOCK.width,
      h: SIMPLE_BLOCK.height,
      title: "Title",
      titleSize: "xl",
      blockType: "",
      description: "",
      icon: "",
      tag: "",
      orientation: "horizontal",
      ports: [],
      view: null,
      views: null,
    };
  }

  override getGeometry(shape: BBoxBlockShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: BBoxBlockShape, info: TLResizeInfo<BBoxBlockShape>) {
    const resized = resizeBox(shape, info);
    // WHY view/views are read from the ORIGINAL shape, never from
    // `resized.props`: tldraw's `resizeBox` returns a PARTIAL props bag —
    // `{ w, h }` and nothing else — so `resized.props.view` is `undefined`
    // for every shape, the `null` guard never fires, and the bag gains a
    // literal "undefined" key the props validator then rejects, killing
    // the whole resize gesture. Caught by the demo-host CDP journey
    // (capture-block-views-hosts.mjs), not by typecheck — `resizeBox`'s
    // declared return type still says full props.
    const { view, views } = shape.props;
    if (view == null) return resized;
    // Lockstep with `views[view]` — the tldraw-adapter half of the SAME
    // rule `applyBlockShapeView` (below) applies on a view switch, and
    // SystemSketch's `resizeBlockProps` before it. Resize in one view,
    // switch away and back, and the exact box returns because the bag was
    // kept current the whole time instead of only at switch time.
    const sizes = views ?? BLOCK_VIEW_DEFAULT_SIZES;
    return {
      ...resized,
      props: {
        ...resized.props,
        views: { ...sizes, [view]: { w: resized.props.w, h: resized.props.h } },
      },
    };
  }

  override component(shape: BBoxBlockShape) {
    const { props } = shape;
    const received = receivedPortsAtom(this.editor).get();

    if (props.view === null) {
      // The legacy hand-authored composition — UNTOUCHED. See
      // `BBoxBlockShapeProps.view`'s own docblock for why this stays a bare
      // `=== null` branch rather than routing through the face pipeline
      // below: every existing scene, the compare harness's divergence
      // measurement and demos/drive.mjs pin these exact pixels.
      return (
        <HTMLContainer style={{ overflow: "visible" }}>
          {/* data-block-id lets the compare harness pair this block with its
              React Flow twin by id (titles are user text and can repeat). */}
          {/* `overflow: "visible"` unconditionally: this legacy composition
              always renders wall-mounted ports below, which Block's own
              `overflow: clip` would otherwise amputate at the boundary. */}
          <Block width={props.w} height={props.h} data-block-id={shape.id} style={{ overflow: "visible" }}>
            <BlockHeader orientation={props.orientation}>
              {props.icon !== "" && (
                <BlockGlyph size={props.titleSize}>{props.icon}</BlockGlyph>
              )}
              <BlockTitle size={props.titleSize}>{props.title}</BlockTitle>
              {props.tag !== "" && <BlockChip>{props.tag}</BlockChip>}
            </BlockHeader>
            {props.description !== "" && (
              <BlockDescription>{props.description}</BlockDescription>
            )}
            {props.blockType !== "" && <BlockType>{props.blockType}</BlockType>}
            {props.ports.map((port) => {
              const placement = portDotPlacement(
                port.side,
                port.t,
                props.w,
                props.h,
              );
              const state: AppearanceState = received[shape.id]?.[port.id]
                ? "received"
                : port.state;
              const diameter = PORT_DIAMETERS[port.size];
              return (
                <div
                  key={port.id}
                  data-port-id={port.id}
                  className="absolute"
                  style={{ ...placement, transform: PORT_DOT_CENTER_TRANSFORM }}
                >
                  <PortDot state={state} diameter={port.size} className="block" />
                  {port.label !== "" && (
                    <PortLabel
                      className="absolute"
                      style={portLabelPlacement(port.textLayout, {
                        w: diameter,
                        h: diameter,
                      })}
                    >
                      {port.label}
                    </PortLabel>
                  )}
                </div>
              );
            })}
          </Block>
        </HTMLContainer>
      );
    }

    // View-engaged: shape.props.w/h are authoritative in tldraw (unlike a
    // bare BlockFace consumer), so they are always passed as resolveField
    // overrides — face.width/face.height below can never disagree with
    // props.w/props.h.
    const face = resolveBlockFace({ view: props.view, width: props.w, height: props.h });
    const portState: ShapePortState = (port) =>
      received[shape.id]?.[port.id] ? "received" : port.state;
    const typeNodes = TYPE_MODE_RENDER[face.typePlacement](props.blockType);
    const headerCtx: FaceHeaderCtx = { props, face, typeInline: typeNodes.inline };

    return (
      <HTMLContainer style={{ overflow: "visible" }}>
        <Block
          width={props.w}
          height={props.h}
          data-block-id={shape.id}
          data-view={face.view}
          data-header={face.header}
          data-ports={face.ports}
          data-members={face.members}
          className={FACE_CONTAINER_CLASS[face.header]}
          // WHY the conditional spread: `overflow: undefined` would merge
          // over Block's own `overflow: "clip"` and unset it (React drops
          // undefined-valued style keys), silently killing the Bar-corner
          // clip in rows/anonymous modes — measured live 2026-09-14.
          style={FACE_PORTS_OVERFLOW[face.ports] ? { overflow: FACE_PORTS_OVERFLOW[face.ports] } : undefined}
        >
          {HEADER_MODE_RENDER[face.header](headerCtx)}
          {MEMBERS_MODE_RENDER[face.members]()}
          {PORTS_MODE_RENDER[face.ports](props.ports, props.w, props.h, portState)}
          {typeNodes.bottom}
          {face.footer ? <Bar edge="top" size="md" /> : null}
        </Block>
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: BBoxBlockShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
