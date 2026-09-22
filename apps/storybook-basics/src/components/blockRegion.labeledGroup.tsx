"use client";
/**
 * src/components/blockRegion.labeledGroup.tsx — the Labeled Group: a PRESET
 * of BlockRegion, not a component of its own.
 *
 * Zach, 2026-09-22: "labeled group should be a preset of Block Region", "its a
 * region with only a title showing." The look is React Flow UI's Labeled Group
 * Node, the reference he pasted: a thin rounded frame, and a label inside it
 * at the top-left that shares the frame's rounding there, is square where it
 * meets the frame, and rounds its own bottom-right corner.
 *
 * WHY the label is a real Block and not a text chip: BlockRegion draws the
 * `title` as a header-only Block with `shape="region-corner"`, the same card
 * a loop wears in its corner. So there is ONE frame renderer and ONE corner
 * card, every region drawing in `skin/regionVariants` styles a labeled group
 * too, and a group that later needs ports passes a full `corner` without
 * changing component. The first version of this preset drew its own chip,
 * and repeated the corner radii by hand; this replaces it.
 */
import { BlockRegion, type BlockRegionProps, type RegionText } from "./blockRegion";

/**
 * WHY every corner prop is omitted, `cornerCard` included (Codex re-judge,
 * 2026-09-22): BlockRegion gives `cornerCard` precedence over `title`, so a
 * `cornerCard` let through here silently replaced the label this preset
 * exists to draw. And `label` is TEXT: it is the auto-measured corner
 * (`RegionCornerProps`), whose hidden measuring copy must never render a node.
 */
export type LabeledGroupProps = Omit<BlockRegionProps, "title" | "type" | "corner" | "cornerCard" | "cornerSize" | "kind" | "arms"> & {
  /** The group's title. Rendered as authored — no trimming or casing. */
  label: RegionText;
};

export function LabeledGroup({ label, ...region }: LabeledGroupProps) {
  return <BlockRegion {...region} kind="group" title={label} />;
}
