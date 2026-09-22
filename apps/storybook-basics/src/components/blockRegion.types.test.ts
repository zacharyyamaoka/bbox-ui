// src/components/blockRegion.types.test.ts — COMPILE-TIME pins for
// `RegionCornerProps` and `LabeledGroupProps` (Codex re-judge 3, 2026-09-22).
// Every `@ts-expect-error` below is the assertion: if the error it expects
// ever disappears, `pnpm typecheck` fails with "Unused '@ts-expect-error'
// directive". The one runtime test only exists so the unit project runs the
// file; the checks are the type errors themselves.

import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { BlockRegionProps, RegionView } from "./blockRegion";
import type { LabeledGroupProps } from "./blockRegion.labeledGroup";

/** Rich content — a node, as a Popover-holding title/header would be. */
const rich: ReactNode = createElement("span", null, "rich");
/** A view the region can be opaque in — what a stateful host passes. */
const canBeOpaque = "opaque" as RegionView;

// Auto-measured (no `cornerSize`): primitive text only.
const textTitle: BlockRegionProps = { id: "a", view: canBeOpaque, title: "Loop", type: "for" };
const textHeader: BlockRegionProps = { id: "b", view: canBeOpaque, cornerCard: { header: "Kit corner", chips: { badge: 3 } } };

// @ts-expect-error — a rich `title` in a region that can be opaque must carry `cornerSize`.
const richTitle: BlockRegionProps = { id: "c", view: canBeOpaque, title: rich };
// @ts-expect-error — a rich `type` likewise.
const richType: BlockRegionProps = { id: "d", view: canBeOpaque, title: "Loop", type: rich };
// @ts-expect-error — a rich `cornerCard.header` likewise.
const richHeader: BlockRegionProps = { id: "e", view: canBeOpaque, cornerCard: { header: rich } };
// @ts-expect-error — an arbitrary `corner` likewise (the earlier fix, still pinned).
const richCorner: BlockRegionProps = { id: "f", view: canBeOpaque, corner: rich };

// With `cornerSize`, rich content is allowed — it is never copied.
const sizedRich: BlockRegionProps = { id: "g", view: canBeOpaque, title: rich, cornerCard: { header: rich }, cornerSize: { w: 160, h: 40 } };
// Re-judge 4: rich content and an arbitrary corner need `cornerSize` WHATEVER
// `view` says — a view is runtime state a wrapper's default can flip.
// @ts-expect-error — rich `title` with `view: "expanded"` still needs `cornerSize`.
const richExpanded: BlockRegionProps = { id: "h", view: "expanded", title: rich };
// @ts-expect-error — rich `title` with no `view` at all, likewise.
const richNoView: BlockRegionProps = { id: "i", title: rich };
// @ts-expect-error — an arbitrary `corner` with no `view`, likewise.
const cornerNoView: BlockRegionProps = { id: "j", corner: rich };
// @ts-expect-error — an arbitrary `corner` in a `port` view, likewise.
const cornerPort: BlockRegionProps = { id: "k", view: "port", corner: rich };
// Text needs nothing: it is measured, safely, whatever the view.
const textNoView: BlockRegionProps = { id: "l", title: "Loop" };

// LabeledGroup: the label is the corner; nothing may replace it.
const labeled: LabeledGroupProps = { id: "g1", label: "Authored label" };
// @ts-expect-error — `cornerCard` would silently replace the label (BlockRegion gives it precedence).
const labeledWithCard: LabeledGroupProps = { id: "g2", label: "Authored label", cornerCard: { header: "Different" } };
// @ts-expect-error — `corner` likewise.
const labeledWithCorner: LabeledGroupProps = { id: "g3", label: "Authored label", corner: rich };
// @ts-expect-error — the label is measured text, never a node.
const labeledRich: LabeledGroupProps = { id: "g4", label: rich };
// Re-judge 4: `Omit` let these back in through a SPREAD; `never` refuses it.
const injected = { cornerCard: { header: "Replacement" } };
// @ts-expect-error — a spread carrying `cornerCard` no longer typechecks.
const labeledSpread: LabeledGroupProps = { id: "g5", label: "Authored label", ...injected };

describe("RegionCornerProps / LabeledGroupProps type pins", () => {
  it("compiles exactly the allowed shapes (the @ts-expect-error lines are the assertions)", () => {
    const allowed = [textTitle, textHeader, sizedRich, textNoView, labeled];
    const refused = [richTitle, richType, richHeader, richCorner, richExpanded, richNoView, cornerNoView, cornerPort, labeledWithCard, labeledWithCorner, labeledRich, labeledSpread];
    expect(allowed.length + refused.length).toBe(17);
  });
});
