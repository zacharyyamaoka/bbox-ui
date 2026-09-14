import type { ComponentProps, ReactNode } from "react";
import { resolveField } from "@bbox-ui/schema";

import { cn } from "./lib/utils";
import type { AppearanceState } from "./appearance";
import { META_FONT_PX, type TextSize } from "./layout";
import {
  Block,
  BlockChip,
  BlockDescription,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
} from "./block";
import {
  BLOCK_FIELDS,
  type BlockHeaderMode,
  type BlockMembersMode,
  type BlockOrientation,
  type BlockPortsMode,
  type BlockTypePlacement,
} from "./block.fields";
import { BLOCK_PRESETS } from "./block.presets";
import type { BlockView } from "./block.view";
import { Bar } from "./bar";
import { Glyph } from "./glyph";
import { TextBox } from "./textBox";
import { Pill } from "./pill";
import { Flex } from "./flex";
import { Port, PortDot, PortLabel } from "./port";
import {
  PORT_DIAMETERS,
  PORT_DOT_CENTER_TRANSFORM,
  inwardTextLayout,
  portDotPlacement,
  portLabelPlacement,
  portSideForDirection,
  type BlockSide,
  type PortDirection,
  type PortSize,
  type PortSizeRung,
} from "./port.layout";

/**
 * packages/bbox-ui/src/blockFace.tsx
 *
 * The renderer half of P2 "views are presets"
 * (reports/view-switching-proposals-2026-09-11.html): `resolveBlockFace`
 * runs `view` and the eight governed fields through the SAME
 * `resolveField` cascade `block.presets.ts`'s `BLOCK_PRESETS` describes,
 * and `BlockFace` paints the result. Every structural decision below is a
 * TOTAL LOOKUP keyed by a RESOLVED field — never a `switch (view)`, never
 * a `view === "…"` comparison (a `data-view` attribute for probing is the
 * one place `view` shows up bare). That is the whole point of P2: a panel
 * tracing why a face looks the way it does is tracing this exact
 * computation, never a second, informal description of it.
 */

/* ------------------------------------------------------------------ */
/* Data shapes                                                         */
/* ------------------------------------------------------------------ */

export interface BlockFacePort {
  id: string;
  direction: PortDirection;
  name?: string;
  typeLabel?: string;
  state?: AppearanceState;
  /** 0→1 along whichever side `direction` maps to. Omit for an even
   * spread among the ports sharing that side (`BlockPortWalls`'s own
   * default). */
  t?: number;
}

export interface BlockFaceData {
  title: string;
  typeLabel?: string;
  description?: string;
  icon?: ReactNode;
  tag?: string;
  titleSize?: TextSize;
  ports?: BlockFacePort[];
}

export interface BlockFaceFields {
  view: BlockView;
  header: BlockHeaderMode;
  ports: BlockPortsMode;
  members: BlockMembersMode;
  description: boolean;
  typePlacement: BlockTypePlacement;
  footer: boolean;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/* resolveBlockFace — the cascade, run once, shared by panel and paint */
/* ------------------------------------------------------------------ */

const FACE_FIELD_IDS = [
  "view",
  "header",
  "ports",
  "members",
  "description",
  "typePlacement",
  "footer",
  "width",
  "height",
] as const;

// Looked up once from BLOCK_FIELDS (never re-typed) — pill.tsx's own
// PAINT_FIELD_BY_ID pattern — so `resolveField` runs the SAME computation
// a product inspector's trace panel would read.
const FACE_FIELD_BY_ID = Object.fromEntries(
  FACE_FIELD_IDS.map((id) => [id, BLOCK_FIELDS.find((f) => f.id === id)!]),
) as Record<(typeof FACE_FIELD_IDS)[number], (typeof BLOCK_FIELDS)[number]>;

/**
 * Resolves `view` and the eight governed face fields against
 * `BLOCK_FIELDS`/`BLOCK_PRESETS`.
 *
 * WHY exported: the same reason `pillResolutionSubject` (`pill.tsx`) is —
 * a story, a bench, or a product inspector's trace panel must resolve
 * against the SAME computation `BlockFace` itself paints with, or the
 * trace and the pixels drift apart (`pill.tsx`'s own WHY names the exact
 * bug this already caused once, for Pill's `tone`).
 */
export function resolveBlockFace(subject: Record<string, unknown>): BlockFaceFields {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(subject)) {
    if (subject[key] !== undefined) clean[key] = subject[key];
  }
  const value = (id: (typeof FACE_FIELD_IDS)[number]) =>
    resolveField(FACE_FIELD_BY_ID[id], clean, BLOCK_PRESETS).resolved;
  return {
    view: value("view") as BlockView,
    header: value("header") as BlockHeaderMode,
    ports: value("ports") as BlockPortsMode,
    members: value("members") as BlockMembersMode,
    description: value("description") as boolean,
    typePlacement: value("typePlacement") as BlockTypePlacement,
    footer: value("footer") as boolean,
    width: value("width") as number,
    height: value("height") as number,
  };
}

/* ------------------------------------------------------------------ */
/* PORTS — one total lookup per ports mode                             */
/* ------------------------------------------------------------------ */

/**
 * "anonymous": ports stay in the DOM with stable ids (so edges/bindings
 * survive a view switch) at their normal boundary anchor, but paint
 * nothing — no dot, `visibility: "hidden"`. Not exported: nothing outside
 * `PORTS_RENDER` needs "an anonymous port" as its own component.
 */
function anonymousPorts(ports: BlockFacePort[], width: number, height: number): ReactNode {
  return (
    <>
      {ports.map((port) => {
        const side = portSideForDirection(port.direction);
        const placement = portDotPlacement(side, port.t ?? 0.5, width, height);
        return (
          <div
            key={port.id}
            data-port-id={port.id}
            data-slot="block-port-anonymous"
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
  );
}

export interface BlockPortRowsProps {
  ports: BlockFacePort[];
  size?: PortSizeRung;
}

/**
 * "rows": one row per port in the body area, dot at the row's direction
 * edge with the name flowing inward, inputs before outputs.
 *
 * WHY this reuses `Port` wholesale rather than reassembling `PortDot` +
 * `PortLabel` by hand: `Port`'s own docblock (`port.tsx`) is explicit that
 * the paired flex-row rendering is for "a standalone specimen", and a row
 * in a list is exactly that — never a wall-mounted absolute position,
 * which is the one case `PortDot`/`PortLabel` must be split apart for
 * (`BlockPortWalls`, below). One real `Port` per row also gets the
 * direction-mirrored name/type ordering for free instead of a second copy
 * of it here.
 */
export function BlockPortRows({ ports, size = "sm" }: BlockPortRowsProps) {
  const ordered = [
    ...ports.filter((p) => p.direction === "input"),
    ...ports.filter((p) => p.direction === "output"),
  ];
  return (
    <Flex
      data-slot="block-port-rows"
      direction="column"
      align="stretch"
      gap={4}
      style={{ width: "100%" }}
    >
      {ordered.map((port) => (
        <div key={port.id} data-port-id={port.id} style={{ width: "100%" }}>
          <Port
            direction={port.direction}
            edge={portSideForDirection(port.direction)}
            name={port.name ?? ""}
            type={port.typeLabel ?? ""}
            state={port.state ?? "empty"}
            size={size}
          />
        </div>
      ))}
    </Flex>
  );
}

export interface BlockPortWallsProps {
  ports: BlockFacePort[];
  width: number;
  height: number;
  diameter?: PortSize;
}

/**
 * "walls": real `PortDot`s at their boundary anchor, label placed inward —
 * the same `portDotPlacement`/`PORT_DOT_CENTER_TRANSFORM`/
 * `portLabelPlacement` geometry `block-shape-util.tsx`'s live tldraw
 * adapter already uses for the Simple view's own ports. A port without an
 * authored `t` gets an even spread among the ports sharing its side —
 * `(index + 1) / (count + 1)` keeps every dot clear of both corners
 * whatever the count.
 */
export function BlockPortWalls({ ports, width, height, diameter = "md" }: BlockPortWallsProps) {
  const bySide = new Map<BlockSide, BlockFacePort[]>();
  for (const port of ports) {
    const side = portSideForDirection(port.direction);
    const siblings = bySide.get(side);
    if (siblings) siblings.push(port);
    else bySide.set(side, [port]);
  }
  const diameterPx = typeof diameter === "number" ? diameter : PORT_DIAMETERS[diameter];
  return (
    <>
      {ports.map((port) => {
        const side = portSideForDirection(port.direction);
        const siblings = bySide.get(side) ?? [port];
        const index = siblings.indexOf(port);
        const t = port.t ?? (index + 1) / (siblings.length + 1);
        const placement = portDotPlacement(side, t, width, height);
        const textLayout = inwardTextLayout(side);
        return (
          <div
            key={port.id}
            data-port-id={port.id}
            data-slot="block-port-wall"
            className="absolute"
            style={{ left: placement.left, top: placement.top, transform: PORT_DOT_CENTER_TRANSFORM }}
          >
            <PortDot state={port.state ?? "empty"} diameter={diameter} />
            {port.name && (
              <PortLabel
                className="absolute"
                style={portLabelPlacement(textLayout, { w: diameterPx, h: diameterPx })}
                name={port.name}
                type={port.typeLabel ?? ""}
                direction={port.direction}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

interface FaceRenderCtx {
  data: BlockFaceData;
  resolved: BlockFaceFields;
  orientation: BlockOrientation;
  bandContent?: ReactNode;
  /** The muted type node when `typePlacement === "header"` — computed
   * once by `TYPE_RENDER` and handed to whichever `HEADER_RENDER` entry
   * needs to place it, so there is exactly one node, never two. */
  typeInline: ReactNode;
}

/**
 * Block's own `overflow: clip` (block.tsx) exists so a Bar's line clips at
 * the rounded corner rather than poking past it — but a wall-mounted port
 * dot straddles the OUTER boundary on purpose (the usual port convention:
 * half in, half out), which clip amputates clean off. Measured live:
 * demos/screenshots/block-views-hosts/tl-port.png shows the flat-cut rings.
 * Only "walls" mode ever straddles the boundary, so only it relaxes clip —
 * a total lookup (not a ternary) so a future ports mode has to say what it
 * wants here rather than silently inheriting "anonymous"/"rows"' clip.
 */
const PORTS_OVERFLOW: Record<BlockPortsMode, "visible" | undefined> = {
  anonymous: undefined,
  rows: undefined,
  walls: "visible",
};

const PORTS_RENDER: Record<BlockPortsMode, (ctx: FaceRenderCtx) => ReactNode> = {
  anonymous: (ctx) => anonymousPorts(ctx.data.ports ?? [], ctx.resolved.width, ctx.resolved.height),
  rows: (ctx) => <BlockPortRows ports={ctx.data.ports ?? []} />,
  walls: (ctx) => (
    <BlockPortWalls ports={ctx.data.ports ?? []} width={ctx.resolved.width} height={ctx.resolved.height} />
  ),
};

/* ------------------------------------------------------------------ */
/* TYPE — one total lookup over typePlacement, returning BOTH the       */
/* bottom-pinned node and the in-header node (at most one is ever real) */
/* ------------------------------------------------------------------ */

interface TypeNodes {
  /** Rendered as a direct `Block` child, always — `null` under "header". */
  bottom: ReactNode;
  /** Handed to `HEADER_RENDER` to place inside the band's right cell (or,
   * for the centered+header hybrid, inline at the header row's end) —
   * `null` under "bottom". */
  inline: ReactNode;
}

const TYPE_RENDER: Record<BlockTypePlacement, (data: BlockFaceData) => TypeNodes> = {
  bottom: (data) => ({
    bottom: data.typeLabel ? <BlockType>{data.typeLabel}</BlockType> : null,
    inline: null,
  }),
  header: (data) => ({
    bottom: null,
    inline: data.typeLabel ? (
      <TextBox key="type-inline" size="sm" lines="single" className="text-muted-foreground">
        {data.typeLabel}
      </TextBox>
    ) : null,
  }),
};

/* ------------------------------------------------------------------ */
/* HEADER — one total lookup over header mode                          */
/* ------------------------------------------------------------------ */

/**
 * The band composes Block's first surface out of the shared Bar/Glyph/
 * TextBox primitives instead of a third hand-rolled header (T1-SPEC.md
 * §10's deferred item, done here for the band only). Simple's hand-rolled
 * centered header deliberately stays untouched — its pixels are pinned by
 * `blockLayout.ts`'s `layoutSimpleBlock` mirror and the detach/compare
 * harnesses, and rebuilding it atop `Bar` would be a large blast radius
 * for zero visual change.
 */
export interface BlockBandProps {
  data: BlockFaceData;
  /** The muted in-band type node (typePlacement === "header"), if any. */
  typeInline?: ReactNode;
}

/**
 * EXPORTED (not just BlockFace's internal default) because both host
 * adapters paint this same band around their own connectable port
 * elements — a hand-copied band in each adapter is exactly the drift the
 * one-Bar-band-composition exists to prevent.
 */
export function BlockBand({ data, typeInline }: BlockBandProps) {
  return (
    <Bar
      edge="bottom"
      size="md"
      left={
        <>
          {data.icon !== undefined && <Glyph size="md">{data.icon}</Glyph>}
          <TextBox size="md" lines="single">
            {data.title}
          </TextBox>
        </>
      }
      right={
        <>
          {typeInline}
          {data.tag ? <Pill size="sm">{data.tag}</Pill> : null}
        </>
      }
    />
  );
}

function defaultBand(ctx: FaceRenderCtx): ReactNode {
  return <BlockBand data={ctx.data} typeInline={ctx.typeInline} />;
}

const HEADER_RENDER: Record<BlockHeaderMode, (ctx: FaceRenderCtx) => ReactNode> = {
  centered: (ctx) => {
    const { data, resolved } = ctx;
    return (
      <>
        <BlockHeader orientation={ctx.orientation}>
          {data.icon !== undefined && <BlockGlyph size={data.titleSize}>{data.icon}</BlockGlyph>}
          <BlockTitle size={data.titleSize}>{data.title}</BlockTitle>
          {data.tag ? <BlockChip>{data.tag}</BlockChip> : null}
          {ctx.typeInline}
        </BlockHeader>
        {resolved.description && data.description ? (
          <BlockDescription>{data.description}</BlockDescription>
        ) : null}
      </>
    );
  },
  band: (ctx) => {
    const { data, resolved } = ctx;
    return (
      <>
        {ctx.bandContent ?? defaultBand(ctx)}
        {resolved.description && data.description ? (
          <p
            data-slot="block-face-description"
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

/**
 * Block's own default classes centre everything for the Simple face; a
 * band face is an edge-to-edge region stacked from the top instead — the
 * same override `bench.tsx`'s own slotted Block composition already uses
 * (`className="!justify-start !px-0 !text-left"`). No `!important` needed
 * here: `cn`'s `tailwind-merge` resolves the conflicting utility classes
 * on its own once these come after Block's own defaults.
 */
const CONTAINER_CLASS: Record<BlockHeaderMode, string | undefined> = {
  centered: undefined,
  band: "flex-col items-stretch justify-start px-0 text-left",
};

/* ------------------------------------------------------------------ */
/* MEMBERS — a total two-key lookup                                    */
/* ------------------------------------------------------------------ */

const MEMBERS_RENDER: Record<BlockMembersMode, (content: ReactNode) => ReactNode> = {
  hidden: () => null,
  // The record/list itself is untouched by this switch — hiding is
  // canvas-only (block.fields.ts's own MEMBERS_FIELD hint).
  shown: (content) => (
    <div data-slot="block-face-members" style={{ width: "100%" }}>
      {content}
    </div>
  ),
};

/* ------------------------------------------------------------------ */
/* BlockFace                                                           */
/* ------------------------------------------------------------------ */

export interface BlockFaceProps
  extends Partial<BlockFaceFields>,
    Omit<ComponentProps<"div">, "children"> {
  /** Ungoverned pass-through to `Block`'s own prop of the same name. */
  radius?: number;
  /** Ungoverned pass-through to `BlockHeader`'s own prop of the same name
   * — only consulted by the "centered" header mode. */
  orientation?: BlockOrientation;
  data: BlockFaceData;
  /** What the body shows when `members` resolves to "shown". */
  membersContent?: ReactNode;
  /** Overrides the whole band region when `header` resolves to "band" —
   * the `/create` bench injects its own composed `Bar` here. */
  bandContent?: ReactNode;
  footerContent?: ReactNode;
}

/**
 * `BlockFace` = Block's view-aware face: resolves `view` and its eight
 * governed fields through `resolveBlockFace`, then paints the result
 * through total lookups only (`HEADER_RENDER`/`PORTS_RENDER`/
 * `MEMBERS_RENDER`/`TYPE_RENDER`, plus the plain boolean `footer` gate —
 * see this file's own module doc for the hard rule this observes).
 *
 * WHY every resolved-field prop is destructured WITHOUT a JS default,
 * mirroring `Pill`'s own paint fields (`pill.tsx`): an explicit value is
 * exactly what makes a subject's OVERRIDE candidate present in
 * `resolveField`. A `= "simple"` default here would make every
 * `BlockFace`'s raw props carry a `view`, so the cascade would report
 * `winner: "override"` even when nobody reached past the preset.
 */
export function BlockFace({
  view,
  header,
  ports,
  members,
  description,
  typePlacement,
  footer,
  width,
  height,
  radius,
  orientation,
  data,
  membersContent,
  bandContent,
  footerContent,
  className,
  style,
  ...props
}: BlockFaceProps) {
  const resolved = resolveBlockFace({
    view,
    header,
    ports,
    members,
    description,
    typePlacement,
    footer,
    width,
    height,
  });
  const typeNodes = TYPE_RENDER[resolved.typePlacement](data);
  const ctx: FaceRenderCtx = {
    data,
    resolved,
    orientation: orientation ?? "horizontal",
    bandContent,
    typeInline: typeNodes.inline,
  };

  return (
    <Block
      data-slot="block-face"
      data-view={resolved.view}
      data-header={resolved.header}
      data-ports={resolved.ports}
      data-members={resolved.members}
      width={resolved.width}
      height={resolved.height}
      radius={radius}
      className={cn(CONTAINER_CLASS[resolved.header], className)}
      // WHY the conditional spread, not a bare `overflow: PORTS_OVERFLOW[…]`:
      // an `overflow: undefined` key would MERGE OVER Block's own
      // `overflow: "clip"` (block.tsx spreads this style last) and unset it —
      // React drops undefined-valued style keys, so the computed overflow
      // falls back to `visible` and the Bar-corner clip silently dies in
      // rows/anonymous modes. Measured live on the RF host, 2026-09-14.
      style={{ ...(PORTS_OVERFLOW[resolved.ports] ? { overflow: PORTS_OVERFLOW[resolved.ports] } : null), ...style }}
      {...props}
    >
      {HEADER_RENDER[resolved.header](ctx)}
      {MEMBERS_RENDER[resolved.members](membersContent)}
      {PORTS_RENDER[resolved.ports](ctx)}
      {typeNodes.bottom}
      {resolved.footer ? (footerContent ?? <Bar edge="top" size="md" />) : null}
    </Block>
  );
}
