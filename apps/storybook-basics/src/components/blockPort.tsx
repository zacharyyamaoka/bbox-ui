"use client";

/**
 * src/components/blockPort.tsx — `BlockPort`: a Block with real
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
 * `PortEdge` prop combination computed by `./blockPort.layout.ts`; the
 * donor's `layoutBlock.ts` is the spec for the behaviour and the source of
 * exactly zero lines. No wires either — `Trace` and the wire layer are
 * Group B, and no file in Group A imports them.
 *
 * WHY this is its own component and not `Block` itself (the reciprocal of
 * block.tsx's own note): Zach, 2026-09-17 — "just the Block itself can be
 * used even without the ports" and this is "starting to add more and more
 * things to" — a plain Block should stay exactly a header/body/footer card.
 * `Block` stays a stock seam this file composes from the outside, never a
 * file this one edits.
 */
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import type { Diagnostic } from "./highlighter";
// The visual-variant registry (lane `ports`, 2026-09-19): pinned per
// BlockPort for a gallery; omitted, every port reads the document.
import type { PortVariantId } from "../skin/portVariants";
import { LabeledPort } from "./labeledPort";
import { Port, type PortState } from "./port";
import { BLOCK_SIDES, type BlockSide, type PortSize } from "./port.layout";
import { PortEdge, type PortEdgeGroupMode, type PortEdgeItem, type PortEdgeProps } from "./portEdge";
import type { Distribution } from "./portEdge.layout";
import {
  PORT_EDGE_SLOT_MIN_PX,
  RAIL_CROSS_PX,
  functionPortCenterPx,
  railAxisFor,
  railBoxFor,
  railPlanFor,
  type BlockBands,
  type BlockPortLayout,
  type BlockView,
  type RailPlan,
} from "./blockPort.layout";
import { ISOLATED_ROOT_STYLE, paintTier } from "./paintOrder";

export type { BlockPortLayout, BlockView } from "./blockPort.layout";
// D-5: the header-content inset a caller applies to its OWN header (see
// blockPort.layout.ts's own doc) — re-exported here so a story only needs
// one import path for everything this component's callers reach for.
export { functionPortHeaderInsetPx } from "./blockPort.layout";

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
   * E-3 (Zach, 2026-09-17): "an explicit per-edge `distribution` from the
   * caller always wins" over the population-derived default
   * `railPlanFor` computes. A sibling field to `portEdgeProps`, not folded
   * into it — `portEdgeProps.distribution` is one of the reach-past props
   * the wrapper's own derivation deliberately overwrites (see that prop's
   * own doc below), so an override that is meant to actually win needs its
   * own, higher-precedence seam.
   */
  distribution?: Distribution;
  /**
   * The same higher-precedence seam as `distribution`, for the same reason
   * and found the same way (2026-09-17): a lane building the async
   * communication gallery passed `groups` through `portEdgeProps` and the
   * grouped look never rendered, because the wrapper's own derivation
   * overwrites that field — see `portEdgeProps`' doc below.
   *
   * WHY grouping needs to be reachable at all, when the view rule usually
   * should win: a Service family whose `request` and `response` must sit
   * ADJACENT on one wall is, by this repo's own refactor rule, "a `groups`
   * entry plus a distribution setting" rather than a ported layout engine.
   * That makes grouping a property of the DOMAIN the caller is drawing, not
   * of the attachment geometry this component owns — so a caller has to be
   * able to state it. Omit both and the derived plan is used unchanged,
   * which is why no landed story moved.
   */
  groups?: string;
  groupMode?: PortEdgeGroupMode;
  /**
   * Reach-past overrides forwarded to the underlying `PortEdge`
   * (`textLayout`, `showCard`, `renderItem`, `laneLanguage`…). The
   * wrapper's OWN derivation — `edge`, `size`, `distribution`, `groups`,
   * `groupMode`, `showContainer`, `showCenterLine` — always wins over
   * these, because those are the view rule and the attachment geometry,
   * which is the whole thing this component is for. (`distribution`
   * itself has its own override seam above, for the one case — E-3 — where
   * a caller legitimately needs to win.)
   */
  portEdgeProps?: Partial<PortEdgeProps>;
}

export interface BlockPortProps {
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
  /** Painted diameter for rail dots and for collapsed stand-in dots.
   *  Omit (since 2026-09-19; was `"md"`) and the VARIANT decides — that
   *  is how the default small dot reaches every block nobody sized. */
  diameter?: PortSize;
  /**
   * Stamped as `data-block-id`. Group B's wire layer resolves a `WireEnd`
   * by looking for `[data-port-id]` inside `[data-block-id]` (plan §5), so
   * the attribute is stamped now even though nothing reads it yet — the
   * alternative is a second pass over this file the day wires land.
   */
  id?: string;
  /**
   * The header's reserved "pin 1" — the port a variable that is ITSELF a
   * function gets, per Zach (2026-09-17): "we reserve a special port on the
   * header left edge... at most 1 port there and you cannot move it... a
   * toggle on or off port." Defaults `false`, so nothing existing changes.
   * Deliberately NOT a `BlockEdgeSpec` — it is not a `PortEdge` lane, has no
   * `items`, cannot reorder, and never gains a second one; its meaning
   * comes from always being in this one spot. See `functionPortCenterPx`
   * (blockPort.layout.ts) for where, and this file's own `BlockPort`
   * render for why it bypasses `PortEdge`/the rail machinery entirely.
   */
  functionPort?: boolean;
  /**
   * The visual variant for every port on every wall (src/skin/
   * portVariants.ts). Omit — the normal case — and each port reads the
   * document-wide `<html data-bbox-port-variant>` (default `v1`, the
   * small pair); set it to pin this block, as the variant gallery does.
   */
  variant?: PortVariantId;
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
    Math.abs(a.bodyBottom - b.bodyBottom) < BAND_EPSILON_PX &&
    (a.headerTop == null || b.headerTop == null
      ? a.headerTop === b.headerTop
      : Math.abs(a.headerTop - b.headerTop) < BAND_EPSILON_PX)
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
 * itself be a `BlockPort` with its own `block-header`, and an unscoped
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
        headerTop: header ? header.getBoundingClientRect().top - wrapperRect.top : undefined,
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

/**
 * The IDE-tree-view rule (docs/INVALID-STATES-PLAN.md ruling 3), one level
 * down: a collapsed stand-in dot is itself a fold — every member's
 * diagnostics are things "hidden" behind this one dot, so they all surface
 * here, concatenated rather than picking a sample the way `collapsedState`
 * picks a representative STATE. `[]` when nothing has anything (never
 * `undefined`) so a caller can hand this straight to `Port.diagnostics`
 * without an extra `|| undefined` — `Port` itself already treats an empty
 * list as "nothing to mark" (`maxDiagnosticSeverity`'s own `[0]` guard).
 *
 * 2026-09-18 (validation-stack story lane): added alongside
 * `collapsedAvailability` below when the ValidityPreview/FoldBubbling
 * stories found `renderItem`'s default fill dropping `item.diagnostics`/
 * `item.availability` entirely — `PortEdgeItem` has carried both fields
 * since the component lane's port.tsx/portEdge.tsx work landed, but
 * nothing in this file (untouched by either lane) forwarded them. Real
 * finding, not a story-only fixture: without this, `decorate`'s paint
 * seam (nodeViews.tsx) can set every field correctly and the rendered
 * `Port` will still show nothing.
 */
function collapsedDiagnostics(members: PortEdgeItem[]): Diagnostic[] {
  return members.flatMap((m) => m.diagnostics ?? []);
}

/** Same fold, for `availability` — "available" wins over "unavailable"
 *  (an ambiguous stand-in should invite the gesture rather than block it;
 *  the individual ports underneath still carry their own true verdicts
 *  once a view stops hiding them). `undefined` only when no member — the
 *  drag itself isn't in flight — has an opinion at all. */
function collapsedAvailability(members: PortEdgeItem[]): "available" | "unavailable" | undefined {
  if (members.some((m) => m.availability === "available")) return "available";
  if (members.some((m) => m.availability === "unavailable")) return "unavailable";
  return undefined;
}

/* ------------------------------------------------------------------ */
/* BlockPort                                                         */
/* ------------------------------------------------------------------ */

export function BlockPort({
  children,
  view,
  portLayout = "inline",
  edges,
  collapsePorts,
  diameter,
  id,
  functionPort = false,
  variant,
}: BlockPortProps) {
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
      data-slot="block-port"
      data-view={view}
      data-port-layout={portLayout}
      data-block-id={id}
      ref={wrapperRef}
      // The isolation invariant (paintOrder.ts): this wrapper emits the
      // `portDot` tier below (the function port and every rail), so it
      // must wall that off from anything outside it, same reasoning as
      // Block's own root.
      style={{ ...ISOLATED_ROOT_STYLE, position: "relative", width: "max-content" }}
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
            // E-3: the whole block's populated set, not just `side` — see
            // blockPort.layout.ts's own note on why a single edge cannot
            // decide this alone.
            populatedEdges: populated,
          });
          // E-3: an explicit caller `distribution` always wins over the
          // population default above — the one field of the derived plan a
          // caller may reach past (`BlockEdgeSpec.distribution`'s own doc).
          const finalPlan = {
            ...plan,
            ...(spec.distribution ? { distribution: spec.distribution } : null),
            ...(spec.groups !== undefined ? { groups: spec.groups } : null),
            ...(spec.groupMode !== undefined ? { groupMode: spec.groupMode } : null),
          };
          return <BlockPortRail key={side} edge={side} spec={spec} plan={finalPlan} bands={bands} diameter={diameter} variant={variant} />;
        })}
      {bands && functionPort && <BlockFunctionPort bands={bands} diameter={diameter} variant={variant} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The function port — the header's pin 1                              */
/* ------------------------------------------------------------------ */

/**
 * Renders the header's single reserved port, positioned by
 * `functionPortCenterPx` alone — no `PortEdge`, no rail, no distribution.
 * `LabeledPort` with `labelSlot={null}` is the donor-decided shape ("make
 * that a labeled port, just without a label for now, or disable the
 * label" — Zach, 2026-09-17): the label slot exists in the DOM contract
 * from day one, present-but-empty, so a real label is later one prop
 * change here, not a second component.
 */
function BlockFunctionPort({ bands, diameter, variant }: { bands: BlockBands; diameter?: PortSize; variant?: PortVariantId }) {
  const center = functionPortCenterPx(bands);
  if (center == null) return null;
  return (
    <div
      data-slot="block-port-function"
      // WHY `display: flex` (lane `ports`, 2026-09-19): as a plain block this
      // holder was a LINE BOX — 24px tall from the inherited strut, with the
      // port sitting on its baseline — so `translate(-50%, -50%)` centred
      // the line, not the dot. The 12px `md` dot happened to land at the
      // line's middle; the 6px default landed 3px low (measured). A flex
      // holder is exactly the port's own box, so the translate centres the
      // dot at any diameter.
      style={{ position: "absolute", display: "flex", left: center.x, top: center.y, transform: "translate(-50%, -50%)", zIndex: paintTier("portDot") }}
    >
      <LabeledPort edge="left" diameter={diameter} variant={variant} labelSlot={null} />
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
  variant,
}: {
  edge: BlockSide;
  spec: BlockEdgeSpec;
  plan: RailPlan;
  bands: BlockBands;
  diameter?: PortSize;
  variant?: PortVariantId;
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
      <span data-slot="block-port-item" data-port-id={item.id} data-collapsed-ports={item.id} style={{ display: "inline-flex" }}>
        <Port state={item.state ?? "empty"} diameter={diameter} variant={variant} diagnostics={item.diagnostics} availability={item.availability} producers={item.producers} selected={item.selected} />
      </span>
    ) : (
      <span data-slot="block-port-item" data-port-id={item.id} style={{ display: "inline-flex" }}>
        <LabeledPort
          edge={edge}
          state={item.state ?? "empty"}
          diameter={diameter}
          variant={variant}
          textLayout={ctx.textLayout}
          diagnostics={item.diagnostics}
          availability={item.availability}
          // Lane `ports` (2026-09-19): the type run, the fan-in count and
          // selection travel from the item exactly as `diagnostics` does —
          // the PORT is the subject, the rail is furniture.
          type={item.type}
          typeColor={item.typeColor}
          producers={item.producers}
          selected={item.selected}
        >
          {item.label}
        </LabeledPort>
      </span>
    );

  /**
   * D-A7's seam: simple view's bare centred dot, standing for the wall —
   * plus the "+X ports" count (Zach, 2026-09-17, screenshot 153001: "In
   * simple view perhaps have option to show text here showing +X ports").
   * `members` is every port this ONE dot stands in for, so `members.length`
   * IS the true hidden count — no separate accounting needed, and nothing
   * to keep in sync if a caller adds or removes an item on this wall.
   *
   * The count is an ABSOLUTELY POSITIONED overlay off the dot's own box —
   * `LabeledPort`'s own pattern (labeledPort.tsx's B4 note), not a flex
   * sibling. A flex sibling would widen this span, and the RAIL centres
   * this whole span on the wall line (`alignItems:"center"` on the
   * track's cross axis) — so the DOT itself would drift off the wall the
   * moment the label made the span asymmetric (measured live: 23px off,
   * failing `SimpleView`'s own wall-line assertion). Absolute positioning
   * keeps the span's LAYOUT box exactly the dot's box, same as before this
   * label existed.
   */
  const renderCollapsed: PortEdgeProps["renderCollapsed"] = (members) => (
    <span
      data-slot="block-port-collapsed"
      data-collapsed-ports={members.map((m) => m.id).join(",")}
      style={{ position: "relative", display: "inline-flex" }}
    >
      <Port
        state={collapsedState(members)}
        diameter={diameter}
        variant={variant}
        diagnostics={collapsedDiagnostics(members)}
        availability={collapsedAvailability(members)}
      />
      <span
        data-slot="block-port-collapsed-count"
        data-collapsed-count={members.length}
        style={{
          position: "absolute",
          left: "calc(100% + 4px)",
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 11,
          lineHeight: 1,
          whiteSpace: "nowrap",
          color: "var(--muted-foreground)",
        }}
      >
        +{members.length} ports
      </span>
    </span>
  );

  const style: CSSProperties = {
    position: "absolute",
    left: box.left,
    top: box.top,
    // D-A6, with the module doc's correction: `position: absolute` is what
    // already lifts this above the static Block, and this index is what
    // keeps that true if either of those facts ever changes — plus it is
    // the stacking context the lane overlay's own `laneOverlay` tier
    // needs. Named `portDot` (paintOrder.ts) — same tier as the function
    // port above; a rail IS a run of port dots.
    zIndex: paintTier("portDot"),
  };

  return (
    <div data-slot="block-port-rail" data-edge={edge} data-rail-band={plan.band} data-collapsed={plan.collapsed || undefined} style={style}>
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
