import type { ComponentProps, ReactNode } from "react";
import { toneOverride, type Tone } from "./appearance";
import { paintColor, Pill, type PillProps } from "./pill";
import type { PaintToken } from "./pill.fields";
import type { TraceMarkerEnd } from "./trace.fields";
import {
  ASYNC_PACKET_DASHARRAY,
  DATA_MARCH_DASHARRAY,
  DELAY_DOT_GAP_PX,
  DELAY_DOT_PX,
  LABEL_POSITION_DEFAULT,
  PATH_LENGTH_UNITS,
  asyncDashOffsetForLength,
  clampLabelPosition,
  safeElementId,
  splitDashArrays,
  type TraceVariant,
} from "./trace.layout";

/**
 * packages/bbox-ui/src/trace.tsx
 *
 * Trace = the paint for a two-ended shape whose PATH a host computes
 * (React Flow's `getBezierPath`, tldraw's own arrow info) and whose ROUTE
 * a host owns interaction for. Trace never derives a point, never binds a
 * terminal, never listens for a pointer — same promise `ARCHITECTURE.md`
 * makes for `Port`/`Block`. See the proposal this implements:
 * `reports/trace-edge-primitive-proposal-2026-09-14.html`.
 */

export interface TraceProps extends Omit<ComponentProps<"g">, "className" | "style" | "id"> {
  /**
   * The host's own id for this trace (React Flow's edge `id`, a tldraw
   * shape's `id`) — hex-encoded into the marker's DOM id
   * (`safeElementId("bbox-trace-head", id)`, `trace.layout.ts`) so
   * multiple Trace instances on one page never collide. See that
   * function's own doc comment for two rounds of adversarial review this
   * genuinely needed: a strip-based v1 was lossy, and a hash-based v2
   * "essentially never" collided until a real counter-example was found
   * in seconds — hex-encoding is BIJECTIVE, not probabilistic, which is
   * why it's what ships. Deliberately NOT generated internally (no
   * `useId()`):
   * an id `TraceBody` invents itself would be identity this component
   * doesn't own, and it would make `TraceBody` uncallable as the plain
   * function this repo's own tests rely on (`pill.fields.test.ts`'s
   * documented pattern) — hooks require a real render. Matches
   * SystemSketch's own precedent: its marker id is
   * `systemsketch-slanted-arrowhead-${shape.id}`, derived from the real
   * shape, never generated.
   */
  id: string;
  /** The finished path — a host computes this. Trace never derives its own points. */
  path: string;
  /**
   * Arc length of `path`, for dash-phase math (async centering, the
   * delayed split). NOT the straight endpoint distance — a curve is
   * longer than its chord. Neither host hands this over uniformly (RF's
   * path helpers return no length at all; tldraw has one only for some
   * arrow types) — the host-agnostic way to get it is
   * `SVGPathElement.getTotalLength()` on the mounted path, which is
   * adapter work this core package does not perform itself.
   */
  length: number;
  variant?: TraceVariant;
  /** Ungoverned — always freely editable. `tone` overrides it when set. */
  strokeColor?: PaintToken;
  tone?: Tone;
  /** Marching-ants, `variant:"data"` only, opt-in. */
  animated?: boolean;
  /** `variant:"delayed"` only — see `trace.fields.ts`'s own doc. */
  splitAtLabel?: boolean;
  /** Where 0..1 along the path the delayed split lands — clamped to
   * 0.05..0.95 regardless of what's passed (`clampLabelPosition`). */
  labelPosition?: number;
  markerEnd?: TraceMarkerEnd;
  strokeWidth?: number;
  vectorEffect?: "non-scaling-stroke";
}

/**
 * The resolved stroke colour — `strokeColor` (or its "foreground"
 * default), reached past by `tone` when set. Deliberately NOT a
 * preset/`resolveField` cascade: see `trace.fields.ts`'s own deviation
 * note for why `variant` never governs colour here. Exported so an
 * adapter's marker colour and stroke colour are always the SAME call,
 * never two independently-derived values.
 */
export function resolveTraceStrokeColor(tone: Tone, strokeColor: PaintToken = "foreground"): string {
  const subject: Record<string, unknown> = { strokeColor, ...toneOverride(tone, ["strokeColor"]) };
  const token = (subject.strokeColor as PaintToken | undefined) ?? "foreground";
  return paintColor(token, 1);
}

export interface TraceStrokeStyle {
  strokeDasharray?: string;
  strokeDashoffset?: number;
  strokeLinecap: "round" | "butt";
  /** Marching-ants class — DATA ONLY, never applied as a side effect by
   * this function. The caller puts it on the rendered element's
   * `className`, never inside `style`. */
  className?: string;
}

/**
 * Pure — no DOM. Dash MECHANICS only (pattern, phase/offset, the
 * marching-ants class NAME), never colour — see `resolveTraceStrokeColor`
 * for that separate resolution. An adapter calls this directly when
 * assembling React Flow's own `BaseEdge` `style` prop for the
 * single-stroke variants (`data`/`async`).
 */
export function traceStrokeStyle(
  variant: TraceVariant,
  length: number,
  animated = false,
): TraceStrokeStyle {
  if (variant === "async") {
    return {
      strokeDasharray: ASYNC_PACKET_DASHARRAY,
      strokeDashoffset: asyncDashOffsetForLength(length),
      strokeLinecap: "butt",
    };
  }
  if (variant === "delayed") {
    return {
      strokeDasharray: `${DELAY_DOT_PX} ${DELAY_DOT_GAP_PX}`,
      strokeLinecap: "round",
    };
  }
  const marching = animated;
  return {
    strokeDasharray: marching ? DATA_MARCH_DASHARRAY : undefined,
    strokeLinecap: marching ? "butt" : "round",
    className: marching ? "bbox-trace-march" : undefined,
  };
}

/** Marker geometry lives once, referenced by every variant that draws a
 * head — the open two-stroke chevron `SlantedArrowBody` established,
 * `context-stroke` (a real SVG2 paint keyword, confirmed via
 * `CSS.supports("stroke", "context-stroke")` in this session's own
 * Chromium; broad Chromium/Firefox support per MDN, NOT YET Safari —
 * there the marker falls back to its own unspecified default stroke
 * rather than erroring, a degraded look, not a broken one) makes it
 * inherit whatever stroke paints the line beside it, so it never needs a
 * second colour derivation or a duplicate
 * marker per colour. */
export function TraceMarkerDef({ id }: { id: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="8.5"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto"
      overflow="visible"
    >
      <path
        d="M 1 1 L 9 5 L 1 9"
        fill="none"
        stroke="context-stroke"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </marker>
  );
}

/**
 * The paint — one `<path>` for `data`/`async`, two for a `delayed` trace
 * with `splitAtLabel`. Zero imports of either canvas engine.
 */
export function TraceBody({
  id,
  path,
  length,
  variant = "data",
  strokeColor = "foreground",
  tone = "neutral",
  animated = false,
  splitAtLabel = false,
  labelPosition = LABEL_POSITION_DEFAULT,
  markerEnd = "arrow",
  strokeWidth = 2,
  vectorEffect,
  ...props
}: TraceProps) {
  const markerId = safeElementId("bbox-trace-head", id);
  const stroke = resolveTraceStrokeColor(tone, strokeColor);
  const hasMarker = markerEnd !== "none";
  const markerAttr = hasMarker ? `url(#${markerId})` : undefined;

  if (variant === "delayed" && splitAtLabel) {
    const dash = splitDashArrays(length, clampLabelPosition(labelPosition));
    return (
      <g data-slot="trace" data-variant={variant} {...props}>
        {hasMarker && (
          <defs>
            <TraceMarkerDef id={markerId} />
          </defs>
        )}
        <path
          d={path}
          pathLength={PATH_LENGTH_UNITS}
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          strokeDasharray={dash.before}
          vectorEffect={vectorEffect}
          data-trace-segment="before"
        />
        <path
          d={path}
          pathLength={PATH_LENGTH_UNITS}
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          strokeDasharray={dash.after}
          vectorEffect={vectorEffect}
          markerEnd={markerAttr}
          data-trace-segment="after"
        />
      </g>
    );
  }

  const dashStyle = traceStrokeStyle(variant, length, animated);
  return (
    <g data-slot="trace" data-variant={variant} {...props}>
      {hasMarker && (
        <defs>
          <TraceMarkerDef id={markerId} />
        </defs>
      )}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap={dashStyle.strokeLinecap}
        strokeLinejoin="round"
        strokeDasharray={dashStyle.strokeDasharray}
        strokeDashoffset={dashStyle.strokeDashoffset}
        vectorEffect={vectorEffect}
        className={dashStyle.className}
        markerEnd={markerAttr}
      />
    </g>
  );
}

/**
 * The label chip. Reuses `Pill` rather than inventing a twin — stays DOM
 * like every other bbox-ui text slot. `TraceBody` never renders this: a
 * label's PIXEL position needs the host's own point-at-fraction over a
 * REAL point array, which an opaque SVG `path` string doesn't carry
 * (`trace.layout.ts`'s `pointAtFraction` is exactly that math, for a host
 * that has the points). Positioning is entirely host-owned — React Flow's
 * `EdgeLabelRenderer`, tldraw's own `HTMLContainer`/absolute div — so this
 * component only ever renders the chip itself, never a transform. `tone`
 * is NOT automatic from a sibling `TraceBody`: pass it explicitly to
 * both, same as `PortEdge`'s `cascadeInto` never auto-cascades `tone`
 * either.
 */
export function TraceLabel({ children, ...pillProps }: PillProps): ReactNode {
  return (
    <Pill data-slot="trace-label" {...pillProps}>
      {children}
    </Pill>
  );
}
