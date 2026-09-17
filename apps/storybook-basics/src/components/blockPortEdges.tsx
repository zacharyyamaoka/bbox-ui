"use client";

/**
 * src/components/blockPortEdges.tsx — `PortedBlock`: a Block with real
 * `PortEdge` rails mounted on its walls (docs/BLOCK-PORT-EDGES-PLAN.md §2,
 * phase A1).
 *
 * Zach, 2026-09-17: "the port edge is literally just a line. **its Z level
 * should be above the block.** The classic is the input output dag view — we
 * should put a port edge on the left body edge and one on the right body
 * edge."
 *
 * WHY a wrapper and not new `Block` props (D-A1): `Block`'s root IS the
 * `overflow-hidden rounded-lg` card (block.tsx:100-103). A rail drawn inside
 * it is clipped at the border — and a rail's dots deliberately STRADDLE the
 * border line, so half of every dot, the whole 40px hit halo, and the lane
 * overlay would vanish. Giving Block an outer wrapper div would instead
 * change its DOM contract under every landed story (`[data-slot="block"]`
 * box assertions, CollapsibleHeader's height-shrink check). So `Block` stays
 * a stock seam, untouched, and this wrapper owns the overlay geometry.
 * Reversible: if a host ever wants `<Block ports>`, this body folds in
 * behind a prop.
 *
 * WHY the rails paint ABOVE the block, reversing the donor (D-B1):
 * SystemSketch pins cables UNDER blocks (`keepConnectionsAtBottom.ts`:
 * "Cables paint under Blocks, per parent"). Zach's brief says the opposite
 * for this component, and it has to be the opposite — a wire attaches to a
 * dot that sits on the wall, so a dot painting under the block would have
 * its inner half swallowed by the card.
 *
 * WHAT ACTUALLY IMPLEMENTS IT — corrected against the plan, which says "DOM
 * order is the z-rule; the explicit index exists solely so the lane overlay
 * stacks". Measured, that is not the mechanism. The rail is ABSOLUTELY
 * POSITIONED and the Block is static, so the rail already paints in CSS's
 * positioned-descendants step, after every step the static Block's
 * background and content occupy — DOM order never enters into it, because
 * the two are not at the same painting step. Proven by mutation: rendering
 * the rails BEFORE `children` leaves the hit test green, and only
 * `zIndex: -1` (the donor's posture) turns it red. So `zIndex: 1` is doing
 * real work — it is what a future `position: static` rail, or a Block that
 * grows its own stacking context, would still be held up by — and it is
 * additionally what lets the lane overlay's `zIndex: 5` clear block content
 * (D-A6). DOM order is kept as a third, redundant guarantee, and asserted
 * as a structural invariant by `StackingAboveBlock`. Do not "fix" any of
 * the three back to the donor.
 *
 * WHAT IS NOT HERE, on purpose: no layout engine. Every placement rule is a
 * `PortEdge` prop combination computed by `./blockPortEdges.layout.ts`; the
 * donor's `layoutBlock.ts` is the spec for the behaviour and the source of
 * exactly zero lines. No wires either — `Trace` and the wire layer are
 * Group B, and no file in Group A imports them.
 */
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import { LabeledPort } from "./labeledPort";
import { Port, type PortState } from "./port";
import { BLOCK_SIDES, type BlockSide, type PortSize } from "./port.layout";
import { PortEdge, type PortEdgeItem, type PortEdgeProps } from "./portEdge";
import {
  PORT_EDGE_SLOT_MIN_PX,
  RAIL_CROSS_PX,
  railAxisFor,
  railBoxFor,
  railPlanFor,
  type BlockBands,
  type BlockPortLayout,
  type BlockView,
  type RailPlan,
} from "./blockPortEdges.layout";

export type { BlockPortLayout, BlockView } from "./blockPortEdges.layout";

/* ------------------------------------------------------------------ */
/* Surface                                                             */
/* ------------------------------------------------------------------ */

export interface BlockEdgeSpec {
  items: PortEdgeItem[];
  onItemsChange?(items: PortEdgeItem[]): void;
  /** The multi-line lane, per edge (Phase 4's `PortEdge.editing`). */
  editing?: boolean;
  onEditingChange?(next: boolean): void;
  /**
   * Reach-past overrides forwarded to the underlying `PortEdge`
   * (`textLayout`, `showCard`, `renderItem`, `laneLanguage`…). The
   * wrapper's OWN derivation — `edge`, `size`, `distribution`, `groups`,
   * `groupMode`, `showContainer`, `showCenterLine` — always wins over
   * these, because those are the view rule and the attachment geometry,
   * which is the whole thing this component is for.
   */
  portEdgeProps?: Partial<PortEdgeProps>;
}

export interface PortedBlockProps {
  /**
   * The Block itself — composed, never rebuilt from props. The story builds
   * each view's face (a bare card, a header+body, an expanded members
   * frame); this component only places ports on its walls.
   */
  children: ReactNode;
  view: BlockView;
  /** Port view only. `inline` = both lanes start at the body top; `offset`
   *  = the right lane starts below the last left-edge port. Donor default
   *  is `inline` (`blockModel.ts:622`). */
  portLayout?: BlockPortLayout;
  edges: Partial<Record<BlockSide, BlockEdgeSpec>>;
  /**
   * Defaults to `view === "simple"`. Passing `false` on a simple face is
   * the donor's communication reading, which spreads ports along the walls
   * instead of collapsing them (`layoutBlock.ts:1286-1296`) — the
   * configuration the async gallery (Group B) will want, and what
   * `FourEdges` shows today.
   */
  collapsePorts?: boolean;
  /** Painted diameter for rail dots and for collapsed stand-in dots. */
  diameter?: PortSize;
  /**
   * Stamped as `data-block-id`. Group B's wire layer resolves a `WireEnd`
   * by looking for `[data-port-id]` inside `[data-block-id]` (plan §5), so
   * the attribute is stamped now even though nothing reads it yet — the
   * alternative is a second pass over this file the day wires land.
   */
  id?: string;
}

/* ------------------------------------------------------------------ */
/* Measurement (D-A5 / the D8 precedent: the APP may measure itself)   */
/* ------------------------------------------------------------------ */

const BAND_EPSILON_PX = 0.5;

function sameBands(a: BlockBands | null, b: BlockBands | null): boolean {
  if (a == null || b == null) return a === b;
  return (
    Math.abs(a.blockLeft - b.blockLeft) < BAND_EPSILON_PX &&
    Math.abs(a.blockTop - b.blockTop) < BAND_EPSILON_PX &&
    Math.abs(a.blockWidth - b.blockWidth) < BAND_EPSILON_PX &&
    Math.abs(a.blockHeight - b.blockHeight) < BAND_EPSILON_PX &&
    Math.abs(a.bodyTop - b.bodyTop) < BAND_EPSILON_PX &&
    Math.abs(a.bodyBottom - b.bodyBottom) < BAND_EPSILON_PX
  );
}

/**
 * Reads the Block's own regions out of `children`'s rendered subtree and
 * returns them in WRAPPER-LOCAL pixels.
 *
 * WHY measured and not computed from props (D-A5): `Block`'s `height` is
 * intentionally optional with no default — absent means "hug the rendered
 * regions" — so there is no closed form for where the body band starts. A
 * header that wraps to two lines, a member list that folds, a footer that
 * appears: each moves the band, and each would silently desynchronise a
 * computed rail. `apps/storybook-basics` is an app, not the core, so
 * measuring here is the same legality the multi-line lane already relies on
 * (`useLaneGeometry`).
 *
 * `:scope >` on header/footer is load-bearing: a member of this Block may
 * itself be a `PortedBlock` with its own `block-header`, and an unscoped
 * query would happily measure the child's band for the parent's rails.
 */
function useBlockBands(wrapperRef: RefObject<HTMLDivElement | null>, layoutKey: string): BlockBands | null {
  const [bands, setBands] = useState<BlockBands | null>(null);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => {
      const block = wrapper.querySelector<HTMLElement>('[data-slot="block"]');
      if (!block) {
        setBands((prev) => (prev == null ? prev : null));
        return;
      }
      const wrapperRect = wrapper.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      const header = block.querySelector<HTMLElement>(':scope > [data-slot="block-header"]');
      const footer = block.querySelector<HTMLElement>(':scope > [data-slot="block-footer"]');
      const next: BlockBands = {
        blockLeft: blockRect.left - wrapperRect.left,
        blockTop: blockRect.top - wrapperRect.top,
        blockWidth: blockRect.width,
        blockHeight: blockRect.height,
        bodyTop: (header ? header.getBoundingClientRect().bottom : blockRect.top) - wrapperRect.top,
        bodyBottom: (footer ? footer.getBoundingClientRect().top : blockRect.bottom) - wrapperRect.top,
      };
      setBands((prev) => (sameBands(prev, next) ? prev : next));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    const block = wrapper.querySelector<HTMLElement>('[data-slot="block"]');
    if (block) {
      observer.observe(block);
      for (const selector of ['[data-slot="block-header"]', '[data-slot="block-footer"]', '[data-slot="block-body"]', '[data-slot="block-members"]']) {
        const region = block.querySelector<HTMLElement>(`:scope > ${selector}`);
        if (region) observer.observe(region);
      }
    }
    return () => observer.disconnect();
  }, [wrapperRef, layoutKey]);

  return bands;
}

/* ------------------------------------------------------------------ */
/* The rail's fill — one port, and the collapsed stand-in              */
/* ------------------------------------------------------------------ */

/**
 * D-A2: a collapsed wall's one dot reads `wired` if ANY member is wired,
 * not if the first one happens to be.
 *
 * WHY that differs from `PortEdge`'s own `+N more` chip (which borrows the
 * first member's state): the chip is a summary of a family that is still a
 * family, so "the first one" is a defensible sample. This dot is a WIRE
 * ANCHOR standing in for every port on the wall — once Group B lands, every
 * wire into any of those ports terminates here — so "is anything here
 * wired?" is the only reading that can be true of the thing drawn.
 */
function collapsedState(members: PortEdgeItem[]): PortState {
  if (members.some((m) => m.state === "wired")) return "wired";
  return members[0]?.state ?? "empty";
}

/* ------------------------------------------------------------------ */
/* PortedBlock                                                         */
/* ------------------------------------------------------------------ */

export function PortedBlock({
  children,
  view,
  portLayout = "inline",
  edges,
  collapsePorts,
  diameter = "md",
  id,
}: PortedBlockProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const collapse = collapsePorts ?? view === "simple";

  const populated = BLOCK_SIDES.filter((side) => (edges[side]?.items.length ?? 0) > 0);
  // Re-measure whenever anything that can move a band changes. Counts are in
  // the key because a rail's own length depends on them through the view
  // rule, and `ResizeObserver` fires on the BLOCK's box — which does not
  // move when only a rail does.
  const layoutKey = [view, portLayout, String(collapse), ...BLOCK_SIDES.map((s) => `${s}:${edges[s]?.items.length ?? 0}`)].join("|");
  const bands = useBlockBands(wrapperRef, layoutKey);

  // The lane the `offset` rule pushes the trailing lane below (donor:
  // `outputStart = slot + inputs.length`, i.e. the INPUT count).
  const leadCount = edges.left?.items.length ?? 0;

  return (
    <div
      data-slot="ported-block"
      data-view={view}
      data-port-layout={portLayout}
      data-block-id={id}
      ref={wrapperRef}
      style={{ position: "relative", width: "max-content" }}
    >
      {children}
      {bands &&
        populated.map((side) => {
          const spec = edges[side]!;
          const plan = railPlanFor({
            view,
            portLayout,
            edge: side,
            itemIds: spec.items.map((i) => i.id),
            leadCount,
            collapsePorts: collapse,
          });
          return <BlockPortRail key={side} edge={side} spec={spec} plan={plan} bands={bands} diameter={diameter} />;
        })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One rail                                                            */
/* ------------------------------------------------------------------ */

function BlockPortRail({
  edge,
  spec,
  plan,
  bands,
  diameter,
}: {
  edge: BlockSide;
  spec: BlockEdgeSpec;
  plan: RailPlan;
  bands: BlockBands;
  diameter: PortSize;
}) {
  const box = railBoxFor(edge, plan, bands);
  const axis = railAxisFor(edge);

  // Just a default — the wrapper deliberately adds no gating of its own.
  // `laneAvailability` already refuses a lane a wall cannot host (a
  // collapsed real family, i.e. exactly simple view) and D12/A12 already
  // closes one whose availability lapses mid-edit. Re-deciding that here
  // would be a second, divergent copy of a predicate PortEdge owns; A2
  // re-proves the lane ON a rail rather than re-implementing its gate.
  const editing = spec.editing ?? false;

  /**
   * The default fill. Two jobs beyond `PortEdge`'s own default: stamp
   * `data-port-id` (plan §5 — how a wire end resolves to a dot), and, in a
   * collapsed view, draw the donor's bare label-less midpoint dot instead
   * of a labelled port.
   *
   * The one-member collapsed case comes through HERE rather than through
   * `renderCollapsed`, because a groups line naming a single id is dropped
   * by the parser (a group of one is just an ungrouped port) — so a
   * one-port wall never reaches the collapsed branch at all. Drawing it the
   * same bare dot, with the same `data-collapsed-ports` stamp, is what
   * makes "exactly one dot per wall, carrying every id it stands for" true
   * for EVERY wall in simple view rather than only the crowded ones.
   */
  const renderItem: PortEdgeProps["renderItem"] = (item, ctx) =>
    plan.collapsed ? (
      <span data-slot="ported-block-port" data-port-id={item.id} data-collapsed-ports={item.id} style={{ display: "inline-flex" }}>
        <Port state={item.state ?? "empty"} diameter={diameter} />
      </span>
    ) : (
      <span data-slot="ported-block-port" data-port-id={item.id} style={{ display: "inline-flex" }}>
        <LabeledPort edge={edge} state={item.state ?? "empty"} diameter={diameter} textLayout={ctx.textLayout}>
          {item.label}
        </LabeledPort>
      </span>
    );

  /** D-A7's seam: simple view's bare centred dot, standing for the wall. */
  const renderCollapsed: PortEdgeProps["renderCollapsed"] = (members) => (
    <span
      data-slot="ported-block-collapsed-port"
      data-collapsed-ports={members.map((m) => m.id).join(",")}
      style={{ display: "inline-flex" }}
    >
      <Port state={collapsedState(members)} diameter={diameter} />
    </span>
  );

  const style: CSSProperties = {
    position: "absolute",
    left: box.left,
    top: box.top,
    // D-A6, with the module doc's correction: `position: absolute` is what
    // already lifts this above the static Block, and this index is what
    // keeps that true if either of those facts ever changes — plus it is
    // the stacking context the lane overlay's own `zIndex: 5` needs.
    zIndex: 1,
  };

  return (
    <div data-slot="ported-block-rail" data-edge={edge} data-rail-band={plan.band} data-collapsed={plan.collapsed || undefined} style={style}>
      <PortEdge
        {...spec.portEdgeProps}
        id={`${edge}-rail`}
        edge={edge}
        items={spec.items}
        onItemsChange={spec.onItemsChange}
        editing={editing}
        onEditingChange={spec.onEditingChange}
        // The Block's own border IS the line, and its own card IS the
        // container — `portEdge.tsx:151-155` documents exactly this intent
        // for both dev-time guides.
        showContainer={false}
        showCenterLine={false}
        showCard={false}
        size={axis === "column" ? { width: RAIL_CROSS_PX, height: box.height } : { width: box.width, height: RAIL_CROSS_PX }}
        distribution={plan.distribution}
        groups={plan.groups}
        groupMode={plan.groupMode}
        renderItem={renderItem}
        renderCollapsed={renderCollapsed}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement helpers the stories assert with — exported so the same   */
/* reading is used by every acceptance rather than re-typed per story.  */
/* ------------------------------------------------------------------ */

/** Every rendered dot centre on one rail, in viewport coordinates, in
 *  visual order. */
export function railDotCentres(rail: Element): { x: number; y: number }[] {
  return Array.from(rail.querySelectorAll<HTMLElement>('[data-slot="port-dot"]')).map((dot) => {
    const rect = dot.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

/** Consecutive centre-to-centre deltas along a rail's MAIN axis — every
 *  one of them, which is what "uniform pitch" has to be measured over.
 *  Sampling two of them cannot tell a uniform rail from a drifting one. */
export function railPitches(rail: Element, axis: "row" | "column"): number[] {
  const centres = railDotCentres(rail);
  const pitches: number[] = [];
  for (let i = 1; i < centres.length; i++) {
    pitches.push(axis === "column" ? centres[i].y - centres[i - 1].y : centres[i].x - centres[i - 1].x);
  }
  return pitches;
}

export const RAIL_SLOT_MAIN_PX = PORT_EDGE_SLOT_MIN_PX;
