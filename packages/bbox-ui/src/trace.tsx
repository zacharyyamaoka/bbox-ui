import type { ComponentProps, ReactNode } from "react";
import { toneOverride, type Tone } from "./appearance";
import { sketchPathData } from "./sketchPath";
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
/**
 * `style` for the crisp path and for its hand-drawn twin.
 *
 * WHY both are rendered and CSS picks, rather than the component choosing:
 * it cannot know the active skin. Everywhere else a skin blanks the crisp
 * version by recolouring it (`--bbox-skin-stroke: transparent`), which
 * works because a border can be transparent and still occupy its space. An
 * SVG path has no equivalent — and a Trace's geometry belongs to the HOST
 * (React Flow's `getBezierPath`, tldraw's arrow info), so there is nothing
 * here to re-derive. Paths do not affect layout, so the hidden twin costs
 * only the memoised math.
 *
 * WHY the twin is written out at each call site instead of behind a
 * `<TraceSegment>` component: `trace.test.ts` reads this component's
 * returned tree directly and asserts on real `<path>` elements. A
 * component boundary would have replaced every one of them with an
 * unrendered function and forced a rewrite of assertions that are about
 * the DOM contract, not about the internals. Flat stays testable.
 *
 * Zach, 2026-09-17: "it would be great of course if even the traces can
 * support a more sketchy appearance... perhaps thats just like another
 * styling thing for them. just like async, or animated" — so it is exactly
 * that: orthogonal to `variant`, to `animated` and to the dash cadence. A
 * sketched trace can still be an animated async one.
 */
const CRISP_STYLE = { display: "var(--bbox-skin-crisp, inline)" } as const;
const SKETCH_STYLE = { display: "var(--bbox-skin-outline, none)" } as const;

/** Wobble for a cable. Lower than a Block's: the same absolute wander read
 * across a long curve is a wave, not a drawn line. */
const TRACE_WOBBLE_PX = 1.4;

/**
 * Sketched paths, cached by the geometry that produced them.
 *
 * WHY a module-level Map and NOT `useMemo`: `TraceBody` is called
 * plain-function style, with no renderer at all — `trace.test.ts` does
 * exactly that, and its own describe block says so ("called plain-function
 * style (no DOM/jsdom)"). A hook there throws on a null dispatcher. That
 * property is worth keeping: it is what lets the paint be tested without
 * jsdom, and a cache keyed on the input is strictly better than a hook
 * here anyway — it is shared across instances and survives remounts.
 *
 * Bounded because a live drag produces a NEW `d` every frame, so an
 * unbounded cache would be a leak that looks like a memo. Insertion order
 * is eviction order, which is all this needs: the entries worth keeping
 * are the ones for edges sitting still, and those get re-inserted on their
 * next hit.
 */
const SKETCH_CACHE = new Map<string, string>();
const SKETCH_CACHE_MAX = 512;

function sketchedTracePath(d: string): string {
  const hit = SKETCH_CACHE.get(d);
  if (hit !== undefined) return hit;
  const out = sketchPathData(d, { seed: d, wobble: TRACE_WOBBLE_PX });
  if (SKETCH_CACHE.size >= SKETCH_CACHE_MAX) {
    const oldest = SKETCH_CACHE.keys().next().value;
    if (oldest !== undefined) SKETCH_CACHE.delete(oldest);
  }
  SKETCH_CACHE.set(d, out);
  return out;
}

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
  // Seeded from the geometry itself, so a cable keeps its own wander while
  // it sits still and re-draws honestly when it moves.
  const sketched = sketchedTracePath(path);
  const hasMarker = markerEnd !== "none";
  const markerAttr = hasMarker ? `url(#${markerId})` : undefined;

  if (variant === "delayed" && splitAtLabel) {
    const dash = splitDashArrays(length, clampLabelPosition(labelPosition));
    const splitSegment = {
      pathLength: PATH_LENGTH_UNITS,
      fill: "none",
      stroke,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      strokeWidth,
      vectorEffect,
    };
    return (
      <g data-slot="trace" data-variant={variant} {...props}>
        {hasMarker && (
          <defs>
            <TraceMarkerDef id={markerId} />
          </defs>
        )}
        <path {...splitSegment} d={path} strokeDasharray={dash.before} data-trace-segment="before" style={CRISP_STYLE} />
        <path {...splitSegment} d={sketched} strokeDasharray={dash.before} data-trace-segment="before" data-sketch="true" style={SKETCH_STYLE} />
        <path {...splitSegment} d={path} strokeDasharray={dash.after} markerEnd={markerAttr} data-trace-segment="after" style={CRISP_STYLE} />
        <path {...splitSegment} d={sketched} strokeDasharray={dash.after} markerEnd={markerAttr} data-trace-segment="after" data-sketch="true" style={SKETCH_STYLE} />
      </g>
    );
  }

  const dashStyle = traceStrokeStyle(variant, length, animated);
  const segment = {
    fill: "none",
    stroke,
    strokeWidth,
    strokeLinecap: dashStyle.strokeLinecap,
    strokeLinejoin: "round" as const,
    strokeDasharray: dashStyle.strokeDasharray,
    strokeDashoffset: dashStyle.strokeDashoffset,
    vectorEffect,
    className: dashStyle.className,
    markerEnd: markerAttr,
  };
  return (
    <g data-slot="trace" data-variant={variant} {...props}>
      {hasMarker && (
        <defs>
          <TraceMarkerDef id={markerId} />
        </defs>
      )}
      <path {...segment} d={path} style={CRISP_STYLE} />
      <path {...segment} d={sketched} data-sketch="true" style={SKETCH_STYLE} />
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
