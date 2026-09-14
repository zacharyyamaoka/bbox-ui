import type { ReactNode } from "react";
import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import {
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
  Flex,
  PORT_DIAMETERS,
  PORT_DOT_CENTER_TRANSFORM,
  PortLabel,
  TextBox,
  cn,
  inwardTextLayout,
  parkViewSize,
  portDotClass,
  portDotPlacement,
  portDotStyle,
  portLabelPlacement,
  portSideForDirection,
  resolveBlockFace,
  BLOCK_VIEW_DEFAULT_SIZES,
  type AppearanceState,
  type BlockFaceData,
  type BlockFaceFields,
  type BlockHeaderMode,
  type BlockMembersMode,
  type BlockPortsMode,
  type BlockTypePlacement,
  type BlockView,
  type BlockViewSizes,
  type PortSize,
  type PortTextLayout,
  type TextSize,
} from "@bbox-ui/core";

/**
 * One port on a block's edge. `t` runs 0→1 down the side.
 * WHY `state: "received"` is legal here but not in the tldraw adapter's shape
 * props: React Flow node data is React state, not a persisted document — a
 * runtime-only state can live in it without ever being written to disk.
 *
 * INTEGRATION (docs/T1-SPEC.md §0/§2): `PortState` (4 members) was Lane P's
 * old, now-deleted type — the rebuilt Port paints from the shared
 * `AppearanceState` (6 members, appearance.ts) instead. `state` here keeps
 * the same field name and now accepts that wider vocabulary.
 */
export interface BBoxPortSpec {
  id: string;
  direction: "input" | "output";
  state?: AppearanceState;
  size?: PortSize;
  label?: string;
  textLayout?: PortTextLayout;
  textSize?: TextSize;
  t?: number;
}

export type BBoxBlockData = {
  title: string;
  blockType?: string;
  description?: string;
  icon?: ReactNode;
  tag?: string;
  titleSize?: TextSize;
  orientation?: "horizontal" | "vertical";
  ports?: BBoxPortSpec[];
  /**
   * Explicit container size — the size contract: explicit when the scene
   * carries one, hug contents when it does not. React Flow's node
   * `width`/`height` fields are where it stores what it MEASURED; size is
   * controlled through CSS, so whoever sets `w`/`h` here must also put
   * `style: { width: w, height: h }` on the node (the scene converter
   * does). The core Block then fills that box and the port anchors follow
   * the real boundary. Both or neither — a half-specified size is hug.
   */
  w?: number;
  h?: number;
  /**
   * Opt-in interactive resizing (a `<NodeResizer>` on the selected node).
   * Only for editable surfaces — the compare panes are read-only by design:
   * their camera bridge and divergence measurement assume no interaction,
   * so a resize handle there could de-calibrate the measurement.
   */
  resizable?: boolean;
  /**
   * P2 "views are presets" (reports/view-switching-proposals-2026-09-11.html):
   * when set, the node renders through the face pipeline (`resolveBlockFace`)
   * instead of the pinned Simple-only JSX below. Left `undefined` — never
   * even `"simple"` — is the compatibility fork every existing scene, the
   * compare harness's divergence measurement, and `demos/drive.mjs` pin
   * their pixels against; see the fork in `BBoxBlockNode` below.
   */
  view?: BlockView;
  /**
   * Per-view remembered box, threaded through `parkViewSize` on every
   * switch (`applyBlockNodeView`, below) so re-opening Expanded doesn't
   * inherit whatever size Port happened to be left at.
   */
  views?: BlockViewSizes;
  /**
   * The Expanded face's member-list region (`members: "shown"`) — a
   * host/demo-provided content surface, not something Block itself knows
   * how to build. Block only decides whether to mount the region; what
   * fills it is the caller's.
   */
  members?: ReactNode;
};

export type BBoxBlockNodeType = Node<BBoxBlockData, "bboxBlock">;

/* ------------------------------------------------------------------ */
/* Face pipeline — data.view present. Every branch below is a TOTAL     */
/* lookup keyed by a RESOLVED face field, never a `data.view === "…"`   */
/* comparison, mirroring blockFace.tsx's own hard rule for this repo's  */
/* other host adapter.                                                  */
/* ------------------------------------------------------------------ */

/**
 * The wall-mounted port rendering shared by the pre-view compatibility
 * path (below) and the face pipeline's "walls" ports mode — a single
 * function so the two can never quietly drift apart, per the walls-mode
 * contract ("reuse/factor the existing loop, do not duplicate subtle
 * details"). `width`/`height` are optional and forwarded straight to
 * `portDotPlacement`, which already defaults them to `SIMPLE_BLOCK` — the
 * exact behavior the compatibility path relied on when `data.w`/`data.h`
 * are unset. The face pipeline always passes concrete numbers
 * (`face.width`/`face.height`).
 */
function renderWallPort(port: BBoxPortSpec, width?: number, height?: number): ReactNode {
  const state = port.state ?? "empty";
  const size = port.size ?? "md";
  // PortSize is `keyof typeof PORT_DIAMETERS | number` (an "Exact" escape
  // hatch, port.layout.ts) — mirrors PortDot's own resolution (port.tsx).
  const diameter = typeof size === "number" ? size : PORT_DIAMETERS[size];
  const side = portSideForDirection(port.direction);
  const textLayout = port.textLayout ?? inwardTextLayout(side);
  const placement = portDotPlacement(side, port.t ?? 0.5, width, height);
  return (
    <Handle
      key={port.id}
      id={port.id}
      type={port.direction === "input" ? "target" : "source"}
      position={side === "left" ? Position.Left : Position.Right}
      data-state={state}
      className={cn(portDotClass(), "absolute overflow-visible")}
      style={{
        width: diameter,
        height: diameter,
        ...placement,
        transform: PORT_DOT_CENTER_TRANSFORM,
        ...portDotStyle({ state }),
      }}
    >
      {port.label != null && (
        <PortLabel
          textSize={port.textSize ?? "md"}
          className="pointer-events-none absolute"
          style={portLabelPlacement(textLayout, { w: diameter, h: diameter })}
        >
          {port.label}
        </PortLabel>
      )}
    </Handle>
  );
}

/**
 * "rows": one row per port in the body area — the Handle IS the row's dot
 * (`position: relative` overriding React Flow's default absolute anchor to
 * the node boundary), so an edge attaches to exactly the circle painted
 * beside the port's own name — the adapter's own existing rule for every
 * other ports mode, applied here too. Inputs before outputs, stable order.
 */
function BlockPortRowsRF({ ports }: { ports: BBoxPortSpec[] }) {
  const ordered = [
    ...ports.filter((p) => p.direction === "input"),
    ...ports.filter((p) => p.direction === "output"),
  ];
  return (
    <Flex
      data-slot="block-node-port-rows"
      direction="column"
      align="stretch"
      gap={4}
      style={{ width: "100%" }}
    >
      {ordered.map((port) => {
        const state = port.state ?? "empty";
        const size = port.size ?? "md";
        const diameter = typeof size === "number" ? size : PORT_DIAMETERS[size];
        const side = portSideForDirection(port.direction);
        return (
          <Flex
            key={port.id}
            data-port-id={port.id}
            gap={8}
            // WHY row-reverse for outputs: an output's dot sits at the row's
            // RIGHT edge, name flowing inward — the same direction mirror
            // the core's BlockPortRows gets from Port's own edge-driven
            // flex layout, so the two hosts read identically.
            style={{ width: "100%", flexDirection: port.direction === "output" ? "row-reverse" : "row" }}
          >
            <Handle
              id={port.id}
              type={port.direction === "input" ? "target" : "source"}
              position={side === "left" ? Position.Left : Position.Right}
              data-state={state}
              // WHY position/left/top/transform overridden: React Flow
              // absolutely anchors every Handle to the node boundary by
              // default — a row's dot must stay in-flow beside its own
              // name instead, so the paint (portDotClass/portDotStyle) is
              // kept but the positioning is not.
              className={cn(portDotClass(), "relative overflow-visible")}
              style={{
                position: "relative",
                left: "auto",
                top: "auto",
                transform: "none",
                width: diameter,
                height: diameter,
                flexShrink: 0,
                ...portDotStyle({ state }),
              }}
            />
            {port.label != null && (
              <TextBox size="sm" lines="single">
                {port.label}
              </TextBox>
            )}
          </Flex>
        );
      })}
    </Flex>
  );
}

const PORTS_RENDER: Record<
  BlockPortsMode,
  (ports: BBoxPortSpec[], face: BlockFaceFields) => ReactNode
> = {
  // "anonymous": ports stay mounted with stable ids (so edges survive a
  // view switch) at their normal boundary anchor, but paint nothing — no
  // dot, `visibility: "hidden"`. Still a real `<Handle>` (not a plain div,
  // core's own host-agnostic choice) — React Flow edges only ever bind to
  // a Handle element.
  anonymous: (ports, face) => (
    <>
      {ports.map((port) => {
        const side = portSideForDirection(port.direction);
        const placement = portDotPlacement(side, port.t ?? 0.5, face.width, face.height);
        return (
          <Handle
            key={port.id}
            id={port.id}
            type={port.direction === "input" ? "target" : "source"}
            position={side === "left" ? Position.Left : Position.Right}
            className="absolute"
            style={{
              left: placement.left,
              top: placement.top,
              transform: PORT_DOT_CENTER_TRANSFORM,
              visibility: "hidden",
            }}
          />
        );
      })}
    </>
  ),
  rows: (ports) => <BlockPortRowsRF ports={ports} />,
  walls: (ports, face) => (
    <>{ports.map((port) => renderWallPort(port, face.width, face.height))}</>
  ),
};

interface FaceTypeNodes {
  /** Rendered as a direct `Block` child, always — `null` under "header". */
  bottom: ReactNode;
  /** Handed to `HEADER_RENDER` to place inside the band's right cell (or,
   * for the centered+header hybrid, inline at the header row's end) —
   * `null` under "bottom". Mirrors blockFace.tsx's own `TYPE_RENDER`. */
  inline: ReactNode;
}

const TYPE_RENDER: Record<BlockTypePlacement, (data: BBoxBlockData) => FaceTypeNodes> = {
  bottom: (data) => ({
    bottom: data.blockType != null ? <BlockType>{data.blockType}</BlockType> : null,
    inline: null,
  }),
  header: (data) => ({
    bottom: null,
    inline:
      data.blockType != null ? (
        <TextBox key="type-inline" size="sm" lines="single" className="text-muted-foreground">
          {data.blockType}
        </TextBox>
      ) : null,
  }),
};

interface FaceHeaderCtx {
  data: BBoxBlockData;
  face: BlockFaceFields;
  titleSize: TextSize;
  /** The muted type node when `typePlacement === "header"` — computed once
   * so there is exactly one node, never two. */
  typeInline: ReactNode;
}

const HEADER_RENDER: Record<BlockHeaderMode, (ctx: FaceHeaderCtx) => ReactNode> = {
  centered: (ctx) => {
    const { data, face, titleSize } = ctx;
    return (
      <>
        <BlockHeader orientation={data.orientation}>
          {data.icon != null && <BlockGlyph size={titleSize}>{data.icon}</BlockGlyph>}
          <BlockTitle size={titleSize}>{data.title}</BlockTitle>
          {data.tag != null && <BlockChip>{data.tag}</BlockChip>}
          {ctx.typeInline}
        </BlockHeader>
        {face.description && data.description != null ? (
          <BlockDescription>{data.description}</BlockDescription>
        ) : null}
      </>
    );
  },
  band: (ctx) => {
    const { data, face } = ctx;
    const faceData: BlockFaceData = {
      title: data.title,
      typeLabel: data.blockType,
      description: data.description,
      icon: data.icon,
      tag: data.tag,
      titleSize: data.titleSize,
    };
    return (
      <>
        <BlockBand data={faceData} typeInline={ctx.typeInline} />
        {/* WHY the band ALSO honours `description` (inert under the stock
            port/expanded presets, which set it false): `description` is a
            governed field, and a governed field must move pixels in every
            face — `view: "port", description: true` is a legal override the
            cascade can produce, so silently dropping it here would be the
            "view silently ignores a row" failure P2 exists to remove.
            Mirrors blockFace.tsx's own band branch. */}
        {face.description && data.description != null ? (
          <p
            data-slot="block-node-description"
            className="text-muted-foreground"
            style={{ fontSize: META_FONT_PX, padding: "0 8px" }}
          >
            {data.description}
          </p>
        ) : null}
      </>
    );
  },
};

const MEMBERS_RENDER: Record<BlockMembersMode, (data: BBoxBlockData) => ReactNode> = {
  hidden: () => null,
  shown: (data) => (
    <div data-slot="block-node-members" style={{ width: "100%" }}>
      {data.members ?? null}
    </div>
  ),
};

/**
 * Block's own default classes center everything for the Simple face; a
 * band face is an edge-to-edge region stacked from the top instead —
 * mirrors blockFace.tsx's own `CONTAINER_CLASS`, kept as a separate total
 * lookup here rather than imported so this adapter never has to reach past
 * `@bbox-ui/core`'s public surface for an internal render-time constant.
 */
const CONTAINER_CLASS: Record<BlockHeaderMode, string | undefined> = {
  centered: undefined,
  band: "flex-col items-stretch justify-start px-0 text-left",
};

/**
 * Parks the box the view being LEFT is at right now under its own slot,
 * then hands back the box the target view should use — the one helper
 * both host adapters must route every view switch through (`parkViewSize`'s
 * own WHY, `block.view.ts`): skip it in one and Expanded opens at whatever
 * Port's box happened to be, instead of its own remembered size.
 *
 * WHY the caller still has work to do: React Flow's node `style.width`/
 * `style.height` is a separate, CSS-level fact from `data.w`/`data.h` (see
 * `BBoxBlockData.w`'s own doc) — a host that calls `updateNode` with this
 * function's return value must ALSO mirror `w`/`h` into `node.style`, the
 * same explicit-size contract the `NodeResizer`'s own `onResize` observes
 * above.
 */
export function applyBlockNodeView(data: BBoxBlockData, view: BlockView): BBoxBlockData {
  const sizes = data.views ?? BLOCK_VIEW_DEFAULT_SIZES;
  const from = data.view ?? "simple";
  const current = { w: data.w ?? sizes[from].w, h: data.h ?? sizes[from].h };
  const parked = parkViewSize(sizes, from, view, current);
  return { ...data, view, views: parked.sizes, w: parked.size.w, h: parked.size.h };
}

/**
 * A React Flow custom node wrapping the presentational core. Each port is a
 * real `<Handle>` DOM element painted with the shared port-dot classes, so
 * edges connect to exactly the circle the user sees. React Flow measures the
 * node from the DOM into `node.measured.width/height` — hug-contents is the
 * default in this host, and an explicit size (`data.w/h` + node `style`)
 * overrides it through CSS.
 */
export function BBoxBlockNode({
  id,
  data,
  selected,
}: NodeProps<BBoxBlockNodeType>) {
  const titleSize = data.titleSize ?? "xl";
  const { updateNode } = useReactFlow();
  const sized = data.w != null && data.h != null;

  // WHY this fork happens before any JSX, and why the branch below it is
  // never touched: every existing scene, the compare harness's divergence
  // measurement, and demos/drive.mjs pin the ORIGINAL Simple-only pixels to
  // an absent `data.view` — the face pipeline (`resolveBlockFace`) is what
  // a view-carrying document opts INTO. `data.view` unset is a
  // compatibility seam, not a view of its own, so nothing inside this
  // branch may ever be reshaped by it.
  if (data.view != null) {
    const face = resolveBlockFace({
      view: data.view,
      ...(data.w != null ? { width: data.w } : {}),
      ...(data.h != null ? { height: data.h } : {}),
    });
    const ports = data.ports ?? [];
    const typeNodes = TYPE_RENDER[face.typePlacement](data);
    const headerCtx: FaceHeaderCtx = { data, face, titleSize, typeInline: typeNodes.inline };
    return (
      <>
        {data.resizable && (
          <NodeResizer
            isVisible={selected ?? false}
            onResize={(_event, params) =>
              updateNode(id, (node) => ({
                data: { ...node.data, w: params.width, h: params.height },
                style: {
                  ...node.style,
                  width: params.width,
                  height: params.height,
                },
              }))
            }
          />
        )}
        <Block
          data-block-id={id}
          data-view={face.view}
          data-header={face.header}
          data-ports={face.ports}
          data-members={face.members}
          width={face.width}
          height={face.height}
          className={CONTAINER_CLASS[face.header]}
          style={sized ? { width: "100%", height: "100%" } : undefined}
        >
          {HEADER_RENDER[face.header](headerCtx)}
          {MEMBERS_RENDER[face.members](data)}
          {PORTS_RENDER[face.ports](ports, face)}
          {typeNodes.bottom}
          {face.footer ? <Bar edge="top" size="md" /> : null}
        </Block>
      </>
    );
  }

  return (
    <>
      {data.resizable && (
        <NodeResizer
          isVisible={selected ?? false}
          // WHY write back on every tick: the resizer sizes the node
          // WRAPPER (React Flow applies the new width/height as CSS); the
          // core Block only follows because it fills a sized box, and the
          // port anchors only follow through data.w/h. Mirroring the size
          // into data + style keeps ports live during the drag and leaves
          // the node exactly as the scene converter would have emitted it —
          // the explicit-size contract round-trips.
          onResize={(_event, params) =>
            updateNode(id, (node) => ({
              data: { ...node.data, w: params.width, h: params.height },
              style: {
                ...node.style,
                width: params.width,
                height: params.height,
              },
            }))
          }
        />
      )}
      {/* WHY data-block-id: the compare harness pairs each block with its
          twin in the other host by id, not by title — titles are user text
          and can repeat on an authored board, and a title collision would
          mispair the measurement. */}
      <Block
        data-block-id={id}
        // The size contract: explicit size fills the node's CSS-sized box
        // (100%, so it tracks a live NodeResizer drag frame-perfectly);
        // no size means hug contents — the core's own default box.
        style={sized ? { width: "100%", height: "100%" } : undefined}
      >
        <BlockHeader orientation={data.orientation}>
          {data.icon != null && (
            <BlockGlyph size={titleSize}>{data.icon}</BlockGlyph>
          )}
          <BlockTitle size={titleSize}>{data.title}</BlockTitle>
          {data.tag != null && <BlockChip>{data.tag}</BlockChip>}
        </BlockHeader>
        {data.description != null && (
          <BlockDescription>{data.description}</BlockDescription>
        )}
        {data.blockType != null && <BlockType>{data.blockType}</BlockType>}
        {(data.ports ?? []).map((port) => renderWallPort(port, data.w, data.h))}
      </Block>
    </>
  );
}
