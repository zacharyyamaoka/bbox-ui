"use client";

// src/components/traceMark.tsx — NET-NEW (docs/INVALID-STATES-PLAN.md D4,
// ruling 4). A `DiagnosticFlag` (./highlighter.tsx) that rides a trace's
// polyline at a `PathAddress` (./trace.layout.ts) instead of sitting in a
// fixed slot — the same "1-D coordinate along a cable" ruling that widened
// `TraceBadge.t`, applied to a diagnostic mark instead of a label pill.
//
// Zach's ruling, verbatim: "Interesting idea for marks on cable getting 1d
// coordinate. I guess we already support this for the placement of the
// pill... for example if there is a pill already we don't likely want to
// render it directly on the pill." So `occupied` exists specifically to
// name the pill's own slot as an obstacle: pass `TraceBadge`'s resolved
// `t`/width and this component yields around it via `separateAlongPath`
// (trace.layout.ts) — the pill itself never moves (it is the PINNED entry),
// only the mark does.
//
// The negative-address use case this component exists to serve: pinning a
// flag at the BROKEN end of a dangling edge (`at={{ px: -24 }}`) — the
// hardest case named in the ruling, and the reason `resolvePathAddress`
// clamps to the full `[0, 1]` range rather than the label's 0.05..0.95
// band (see that function's own doc).
//
// WHY DOM and not SVG, same reasoning as `traceBadge.tsx`'s own header:
// `DiagnosticFlag` is a Tailwind-styled button + Popover, not SVG content.
// It is an absolutely-positioned sibling of the trace's `<svg>`, and
// `points` are read in the same coordinate space `TraceBadge` already
// documents (its `offsetParent`'s padding box) — so a `TraceMark` and a
// `TraceBadge` on the same trace agree on where "0.5" is without either
// one knowing the other exists.
//
// STATIC, NOT DRAGGABLE (unlike `TraceBadge`): a diagnostic's position is a
// PRODUCER'S judgement (dangling end, mismatched type), not something a
// person drags around — ruling 2's layering rule again, one level down:
// this component receives a resolved address, it does not invent one.

import type { CSSProperties, ReactNode } from "react";

import { DIAGNOSTIC_FLAG_SIZE_PX, DiagnosticFlag, type Diagnostic } from "./highlighter";
import {
  pointAtFraction,
  polylineLength,
  resolvePathAddress,
  separateAlongPath,
  tangentAtFraction,
  type PathAddress,
  type Point,
} from "./trace.layout";

/** One already-occupied slot on the same polyline — `TraceBadge`'s own
 *  resolved `t` and rendered width, so this mark can yield around it
 *  instead of landing on top of it. Absent or empty: the mark renders
 *  exactly at its own resolved address, nothing to yield around. */
export interface TraceMarkOccupiedSlot {
  t: number;
  widthPx: number;
}

export interface TraceMarkProps {
  /** The same polyline `Trace`/`TraceBadge` were handed — see
   *  `TraceBadgeProps.points`'s own doc for the coordinate-space contract. */
  points: readonly Point[];
  /** Where along the polyline this mark wants to sit. Defaults to the
   *  midpoint. `{px: -24}` pins 24px back from the END — the dangling-edge
   *  case (see this file's header). */
  at?: PathAddress;
  /** Perpendicular offset from the polyline, in px. Sign picks which side
   *  of the line the mark sits on (rotating `tangentAtFraction`'s unit
   *  tangent 90° gives the "positive" side; a negative value flips it). */
  offsetPx?: number;
  /** Slots already spoken for on this polyline — typically `TraceBadge`'s
   *  own resolved `{t, widthPx}`. The mark yields around every entry here;
   *  none of them move. */
  occupied?: readonly TraceMarkOccupiedSlot[];
  /** Minimum clear path, in px, between this mark and any occupied slot.
   *  Forwarded to `separateAlongPath` untouched — see its own default. */
  gapPx?: number;
  /** Non-empty — same contract as `DiagnosticFlagProps.diagnostics`. */
  diagnostics: Diagnostic[];
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const MARK_YIELD_EPSILON = 1e-6;

export function TraceMark({
  points,
  at = 0.5,
  offsetPx = 12,
  occupied,
  gapPx,
  diagnostics,
  actions,
  footer,
  className,
  style,
}: TraceMarkProps) {
  const requestedT = resolvePathAddress(points, at);
  const length = polylineLength(points);

  let resolvedT = requestedT;
  if (occupied && occupied.length > 0) {
    const placements = [
      ...occupied.map((slot) => ({ t: slot.t, widthPx: slot.widthPx, pinned: true as const })),
      { t: requestedT, widthPx: DIAGNOSTIC_FLAG_SIZE_PX },
    ];
    const resolved = separateAlongPath(length, placements, gapPx);
    resolvedT = resolved[resolved.length - 1];
  }

  const yielded = Math.abs(resolvedT - requestedT) > MARK_YIELD_EPSILON;
  const anchor = pointAtFraction(points, resolvedT);
  const tangent = tangentAtFraction(points, resolvedT);
  // Rotate the unit tangent 90° to get a perpendicular; the sign of
  // `offsetPx` is what actually picks the side, so either rotation
  // direction here is an equally valid "positive side" — this one just
  // has to be fixed and documented, which it now is.
  const normal: Point = { x: -tangent.y, y: tangent.x };

  return (
    <div
      data-slot="trace-mark"
      data-t={resolvedT}
      data-yielded={yielded || undefined}
      className={className}
      style={{
        position: "absolute",
        left: anchor.x + normal.x * offsetPx,
        top: anchor.y + normal.y * offsetPx,
        transform: "translate(-50%, -50%)",
        ...style,
      }}
    >
      <DiagnosticFlag diagnostics={diagnostics} actions={actions} footer={footer} />
    </div>
  );
}
