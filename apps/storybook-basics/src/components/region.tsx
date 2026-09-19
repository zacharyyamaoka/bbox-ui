"use client";

// src/components/region.tsx — the Region: a thin scope FRAME with a real
// Block integral to its top-left corner, an optional free body, and an
// ordered list of arm rows. Props in, DOM out (docs/CONTROL-FLOW-PLAN.md
// §3.2); it imports no scene module and no canvas engine, so the same
// element renders under the DOM canvas, React Flow and tldraw unchanged.
//
// ── ONE NODE, TWO PIECES OF PAINT (plan §2.A, Zach's "everything is a
//    block" made structural) ──────────────────────────────────────────
// A region is ONE scene node. The FRAME is how that node renders its
// SCOPE; the CORNER BLOCK is how it renders its INTERFACE. There is no
// second node, no head child, and the frame carries no value ports of its
// own — a loop's `Iterable`/`Iter` and a branch's conditions are ports on
// the corner card, resolved by exactly the same `[data-block-id]` ->
// `[data-port-id]` walk as any other block's.
//
// WHY the root and the frame carry `data-region-id` and NEVER
// `data-block-id`: `wireLayer.tsx`'s `resolveDot` takes the FIRST
// `[data-block-id="<id>"]` in document order (wireLayer.tsx:81). If the
// frame carried the region's id it would win that lookup, and every wire
// into the corner card would resolve against a box that owns no dot. The
// corner card owns the id; the frame owns the region id. The tempting
// alternative — stamping both and "letting the more specific one win" —
// cannot work, because document order, not specificity, is the rule.
//
// LOOK: React Flow UI's Labeled Group Node (`Pasted image 20260918192040.png`,
// the reference Zach named): a thin rounded frame with a transparent fill
// and a label chip INSIDE the frame at its top-left, sharing the frame's
// rounding there and square where it meets the frame. Ours is a whole
// Block rather than a text chip, which is the entire point.
//
// Pure: no React state beyond the corner measurement, no DOM outside its
// own subtree, no scene import (the `layering.test.ts` import wall).

import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";

import { Bar } from "./bar";
import { BlockMembers, type BlockMember } from "./blockMembers";
import { FoldingChevron } from "./foldingChevron";
import { cn } from "../lib/utils";
import {
  REGION_ARM_FADE_OPACITY,
  REGION_CORNER_WIDTH_PX,
  regionLayout,
  type RegionLayout,
} from "./region.layout";

export type RegionKind = "loop" | "branch" | "group";
export type RegionView = "expanded" | "opaque";

export interface RegionArm {
  id: string;
  /** Free text, human readable — `if fast:`, `case "pet":`. Never code. */
  title: ReactNode;
  open: boolean;
  onOpenChange?(open: boolean): void;
  /** Absent is ACTIVE. Donor branchModel.ts:11-12 — "no active arm means
   *  every arm is active". */
  active?: boolean;
  /** Body height while open; remembered while folded (`regionLayout`). */
  bodyHeight?: number;
  members?: BlockMember[];
}

export interface RegionProps {
  /** Stamped as `data-region-id` on the root AND the frame — never
   *  `data-block-id`. See this file's header. */
  id: string;
  kind?: RegionKind;
  view?: RegionView;
  /** The REAL Block: a `BlockPort` whose `id` IS this region's id. */
  corner: ReactNode;
  /** Skip the measurement when a host already knows the corner's box. */
  cornerSize?: { w: number; h: number };
  width?: number;
  /** Omitted = hug (`regionLayout`). */
  height?: number;
  /** The free body a loop/group drops into — `BlockMembers layout="free"`. */
  members?: BlockMember[];
  arms?: RegionArm[];
  className?: string;
  style?: CSSProperties;
}

/** The frame's own border, px — the number the corner is pulled back by so
 *  the two borders sit on ONE line rather than doubling into a 2px rule. */
const FRAME_BORDER_PX = 1;

/**
 * The corner Block's radii: the frame's own at the shared top-left, square
 * at both corners where it MEETS the frame's edges, and the frame's again
 * at its one free corner (bottom-right). That is the Labeled Group Node
 * look — the chip reads as part of the frame, not as a card that happens
 * to be parked in it.
 *
 * WHY an inline style and not a Tailwind `[&_[data-slot=block]]:rounded-*!`
 * wrapper class: `Block` spreads its caller's `style` AFTER its own
 * `borderRadius` (block.tsx:321), so an inline value is the mechanism the
 * component already documents as winning. A `!important` class would also
 * win, but only by out-shouting a value Block deliberately publishes as
 * overridable — the quieter seam is the one Block itself points at.
 */
export const REGION_CORNER_BLOCK_STYLE: CSSProperties = {
  borderTopLeftRadius: "var(--bbox-skin-radius, var(--radius-lg))",
  borderTopRightRadius: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: "var(--bbox-skin-radius, var(--radius-lg))",
};

/**
 * The corner's measured box.
 *
 * WHY measured and not computed: the corner is a whole `Block` whose height
 * hugs its own header, ports and footer — there is no closed form for it
 * (the same reason `blockPort.tsx`'s `useBlockBands` measures rather than
 * derives). The first render has no box yet and falls back to
 * `{w: REGION_CORNER_WIDTH_PX, h: 0}`; `useLayoutEffect` corrects it BEFORE
 * the browser paints, so the guess is never on screen — the same
 * first-frame device `tldrawHost.tsx` uses, tightened one frame because
 * this measurement has no engine to wait for.
 */
function useCornerSize(given: { w: number; h: number } | undefined): {
  ref: (node: HTMLDivElement | null) => void;
  size: { w: number; h: number };
} {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const skip = given !== undefined;

  useLayoutEffect(() => {
    if (skip || !node) return;
    const read = () => {
      const rect = node.getBoundingClientRect();
      // Identity-preserving: a sub-pixel re-measure that says the same
      // thing must not re-render, or the observer feeds itself.
      setMeasured((previous) =>
        previous && Math.abs(previous.w - rect.width) < 0.5 && Math.abs(previous.h - rect.height) < 0.5
          ? previous
          : { w: rect.width, h: rect.height },
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [skip, node]);

  return { ref: setNode, size: given ?? measured ?? { w: REGION_CORNER_WIDTH_PX, h: 0 } };
}

function ArmRow({
  arm,
  row,
  index,
}: {
  arm: RegionArm;
  row: RegionLayout["arms"][number];
  index: number;
}) {
  const active = arm.active ?? true;
  return (
    <div
      data-slot="region-arm"
      data-arm-id={arm.id}
      data-open={String(row.open)}
      data-active={String(active)}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: row.rowTop,
        height: row.bottom - row.rowTop,
        // WHY a single opacity token on the ROW and not per-element
        // styling: the donor fades "non-active arms, their Blocks and
        // their cables" with ONE number (branchModel.ts:38-39,
        // BRANCH_FADE_OPACITY = 0.18), and a row-level opacity carries the
        // arm's members with it for free. Cable fade is a follow-up — the
        // wires live in a sibling layer, not inside this box.
        opacity: active ? undefined : REGION_ARM_FADE_OPACITY,
      }}
    >
      <div
        data-slot="region-arm-header"
        // A divider between rows only, never above the first — the donor's
        // own `dividerY: index === 0 ? null : rowTop` (branchModel.ts).
        className={cn(index > 0 && "border-t border-border")}
        style={{ height: row.bodyTop - row.headerTop }}
      >
        <Bar
          size="sm"
          left={
            <>
              <FoldingChevron open={row.open} onClick={() => arm.onOpenChange?.(!row.open)} />
              <span data-slot="region-arm-title" className="truncate">
                {arm.title}
              </span>
            </>
          }
        />
      </div>
      {row.open && (
        // WHY the body LEAVES THE DOM when folded rather than collapsing to
        // `height: 0`: `expectArmsStacked` measures a folded arm as "no
        // body", and a zero-height box that still contains members would
        // keep them hit-testable and focusable while invisible — a folded
        // arm has to be genuinely absent, not merely unpainted.
        <div
          data-slot="region-arm-body"
          style={{ position: "relative", height: row.bodyHeight }}
        >
          <BlockMembers
            layout="free"
            members={arm.members ?? []}
            gap={0}
            gutter={0}
            insetBackground="none"
            showMembers
            showCards={false}
          />
        </div>
      )}
    </div>
  );
}

export function Region({
  id,
  kind = "group",
  view = "expanded",
  corner,
  cornerSize,
  width,
  height,
  members,
  arms,
  className,
  style,
}: RegionProps) {
  const { ref: cornerRef, size } = useCornerSize(cornerSize);
  const layout = regionLayout({
    width: width ?? REGION_CORNER_WIDTH_PX,
    ...(height === undefined ? null : { height }),
    corner: size,
    arms: (arms ?? []).map((arm) => ({
      id: arm.id,
      open: arm.open,
      ...(arm.bodyHeight === undefined ? null : { bodyHeight: arm.bodyHeight }),
    })),
  });

  const rootProps = {
    "data-slot": "region",
    "data-region-id": id,
    "data-region-kind": kind,
    "data-region-view": view,
  } as const;

  // P5, opaque: the root wraps ONLY the card the host hands it. No frame,
  // no arms, no body — the whole point of the view is that the inside is
  // not drawn. The card's own ports and footer are the host's business
  // (`nodeViews.tsx`), which is why this branch renders `corner` untouched.
  if (view === "opaque") {
    return (
      <div {...rootProps} className={className} style={{ width: "max-content", ...style }}>
        {corner}
      </div>
    );
  }

  return (
    <div {...rootProps} className={className} style={{ position: "relative", width: "max-content", ...style }}>
      <div
        data-slot="region-frame"
        data-region-id={id}
        style={{
          position: "relative",
          width: layout.width,
          height: layout.height,
          borderWidth: FRAME_BORDER_PX,
          borderStyle: "solid",
          borderColor: "var(--border)",
          borderRadius: "var(--bbox-skin-radius, var(--radius-lg))",
          // Transparent, so a cable routed UNDER the frame still reads, and
          // `visible` so the corner card's wall dots may straddle the
          // frame's own edge instead of being clipped off at it (plan §9's
          // "no clip" default).
          background: "transparent",
          overflow: "visible",
        }}
      >
        <div
          ref={cornerRef}
          data-slot="region-corner"
          style={{
            position: "absolute",
            // Pulled back by the frame's border so the two borders land on
            // one line: the corner reads as PART of the frame, which is the
            // whole Labeled Group Node look.
            top: -FRAME_BORDER_PX,
            left: -FRAME_BORDER_PX,
            width: "max-content",
          }}
        >
          {corner}
        </div>
        <div
          data-slot="region-body"
          style={{ position: "absolute", left: 0, top: layout.body.y, width: "100%", height: layout.body.h }}
        >
          <BlockMembers
            layout="free"
            members={members ?? []}
            gap={0}
            gutter={0}
            insetBackground="none"
            showMembers
            showCards={false}
          />
        </div>
        {layout.arms.map((row, index) => (
          <ArmRow key={row.id} arm={(arms ?? [])[index]} row={row} index={index} />
        ))}
      </div>
    </div>
  );
}
