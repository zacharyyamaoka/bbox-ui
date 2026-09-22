"use client";
/**
 * src/components/region.labeledGroup.tsx — the Labeled Group: a PRESET of
 * Region, not a component of its own.
 *
 * Zach, 2026-09-22: "a region is a labeled group + a block in the upper left
 * corner where the simple label would have gone... labeled group is actually
 * a subset (preset) of the Region. its a region with only a title showing."
 * The look is React Flow UI's Labeled Group Node, the reference he pasted:
 * a thin rounded frame, and a label tab inside it at the top-left that shares
 * the frame's rounding there and rounds its own bottom-right corner.
 *
 * WHY a preset and not a new Frame component: Region already IS the frame,
 * and its corner slot takes any element. A labeled group is `kind="group"`
 * with a text tab in that slot, so there stays ONE frame renderer — every
 * region drawing in `skin/regionVariants` styles a labeled group too, and a
 * group that later needs ports swaps the tab for a Block without changing
 * component.
 */
import type { CSSProperties, ReactNode } from "react";
import { Region, type RegionProps } from "./region";

export type LabeledGroupProps = Omit<RegionProps, "corner" | "cornerSize" | "kind" | "arms"> & {
  /** The group's title. Rendered as authored — no trimming or casing. */
  label: ReactNode;
};

/**
 * WHY this repeats region.tsx's FRAME_RADIUS chain instead of importing it:
 * that constant is module-private, and the tab must round with the SAME
 * token the frame reads. The `LabeledGroup` stories compare the two rendered
 * radii, so a drift that changes what either draws fails a test — a string
 * edit that happens to resolve to the same pixels would not, so keep the
 * two chains identical by hand.
 */
const TAB_RADIUS = "var(--bbox-region-frame-radius, var(--bbox-skin-radius, var(--radius-lg)))";

const tabStyle: CSSProperties = {
  padding: "4px 12px",
  fontSize: 13,
  lineHeight: "20px",
  whiteSpace: "nowrap",
  color: "var(--foreground)",
  background: "var(--bbox-region-label-fill, var(--muted))",
  border: "1px solid var(--bbox-region-frame-stroke, var(--border))",
  borderTopLeftRadius: TAB_RADIUS,
  borderBottomRightRadius: TAB_RADIUS,
  borderTopRightRadius: 0,
  borderBottomLeftRadius: 0,
};

export function LabeledGroupTab({ children }: { children: ReactNode }) {
  return (
    <div data-slot="labeled-group-label" style={tabStyle}>
      {children}
    </div>
  );
}

export function LabeledGroup({ label, ...region }: LabeledGroupProps) {
  return <Region {...region} kind="group" corner={<LabeledGroupTab>{label}</LabeledGroupTab>} />;
}
