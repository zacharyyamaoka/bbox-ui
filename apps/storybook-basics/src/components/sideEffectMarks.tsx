"use client";

/**
 * src/components/sideEffectMarks.tsx — the two marks side effects add to a
 * Block that are PAINT, not ports: the divider tick on the top wall and the
 * dotted mutation line. `BlockPort` decides where they go
 * (`sideEffects.layout.ts`) and mounts them; this file decides what they
 * look like.
 *
 * WHY they live here and not inline in `blockPort.tsx`: `skin.test.ts`'s S4
 * coverage holds `blockPort.tsx` to "paints nothing of its own — no border,
 * background, box-shadow or stroke". The wrapper places things; the paint
 * belongs to a component a skin can be pointed at. Both marks read theme
 * tokens only (`--muted-foreground`, `--destructive`), so dark mode needs
 * nothing extra.
 */
import { SIDE_EFFECT_DIVIDER_PX, type MutationRoute } from "./sideEffects.layout";

/** The short grey tick splitting input side effects from output ones —
 *  "a little grey line on the outside" (Zach, 2026-09-22). Its foot sits on
 *  the wall line at `x`; the tick sticks out above it. */
export function SideEffectDivider({ x }: { x: number }) {
  return (
    <span
      data-slot="block-side-effect-divider"
      aria-hidden
      style={{
        position: "absolute",
        left: x - 1,
        top: -SIDE_EFFECT_DIVIDER_PX,
        width: 2,
        height: SIDE_EFFECT_DIVIDER_PX,
        background: "var(--muted-foreground)",
        pointerEvents: "none",
      }}
    />
  );
}

/** One mutation line: dotted, in the destructive token, with a filled
 *  arrowhead at the effect end. Geometry arrives resolved. */
export function MutationLineMark({ from, to, route }: { from: string; to: string; route: MutationRoute }) {
  return (
    <g data-slot="block-mutation-line" data-mutation-from={from} data-mutation-to={to}>
      <polyline
        points={route.points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke="var(--destructive)"
        strokeWidth={1.5}
        strokeDasharray="2 3"
        strokeLinecap="round"
      />
      <polygon points={route.arrowhead.map((p) => `${p.x},${p.y}`).join(" ")} fill="var(--destructive)" />
    </g>
  );
}
