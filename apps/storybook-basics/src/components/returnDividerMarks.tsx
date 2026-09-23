"use client";

/**
 * src/components/returnDividerMarks.tsx — the PAINT half of "multiple
 * returns"' divider mark: a plain rectangle in the muted-foreground token,
 * "a little grey line" either outside the wall (Expanded) or inward across
 * it (Port view).
 *
 * WHY it lives here and not inline in `blockPort.tsx`: the exact same split
 * `sideEffectMarks.tsx` already uses for its own divider tick
 * (`SideEffectDivider`), and for the reason that file's own header names —
 * `skin.test.ts`'s S4 coverage holds `blockPort.tsx` to "paints nothing of
 * its own — no border, background, box-shadow or stroke". The wrapper
 * PLACES things (`BlockPortReturnDividers`, blockPort.tsx, owns the
 * measured position/size); the paint belongs to a component a skin can be
 * pointed at. FOUND the hard way: this mark originally rendered its
 * `background` directly inside `blockPort.tsx` and broke that exact
 * invariant test (`skin.test.ts`'s "blockPort.tsx paints nothing of its
 * own") — a real, deterministic failure, caught by running the FULL suite
 * rather than only this feature's own stories.
 */
import type { CSSProperties } from "react";

import type { BlockSide } from "./port.layout";

export interface ReturnDividerMarkProps {
  edge: BlockSide;
  markView: "expanded" | "port";
  /** Position and size ONLY — `position`, `left`/`top`, `width`/`height`,
   *  `zIndex`. The paint (`background`) is this component's own; a caller
   *  passing paint here would defeat the whole point of the split. */
  style: CSSProperties;
}

export function ReturnDividerMark({ edge, markView, style }: ReturnDividerMarkProps) {
  return (
    <span
      data-slot="block-port-return-divider"
      data-mark-view={markView}
      data-edge={edge}
      aria-hidden
      style={{ ...style, background: "var(--muted-foreground)", pointerEvents: "none" }}
    />
  );
}
