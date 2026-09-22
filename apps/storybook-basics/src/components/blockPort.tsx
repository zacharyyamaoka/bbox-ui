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
import type { CSSProperties, ReactElement, ReactNode, RefObject } from "react";
import { cloneElement, isValidElement, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Diagnostic } from "./highlighter";
// The visual-variant registry (lane `ports`, 2026-09-19): pinned per
// BlockPort for a gallery; omitted, every port reads the document.
import type { PortVariantId } from "../skin/portVariants";
import { LabeledPort } from "./labeledPort";
import { Port, type PortState } from "./port";
import { BLOCK_SIDES, PORT_RING_OVERHANG_PX, type BlockSide, type PortSize } from "./port.layout";
import { PortEdge, type PortEdgeGroupMode, type PortEdgeItem, type PortEdgeProps } from "./portEdge";
import type { Distribution } from "./portEdge.layout";
import {
  PORT_EDGE_SLOT_MIN_PX,
  RAIL_CROSS_PX,
  floorMinHeight,
  functionPortCenterPx,
  minBlockHeightFor,
  railAxisFor,
  railBoxFor,
  railPlanFor,
  type BlockBands,
  type BlockPortLayout,
  type BlockView,
  type RailPlan,
} from "./blockPort.layout";
import { ISOLATED_ROOT_STYLE, paintTier } from "./paintOrder";
import { MutationLineMark, SideEffectDivider } from "./sideEffectMarks";
import {
  hasSideEffects,
  mutationRoute,
  partitionMutations,
  sideEffectWallLayout,
  type BlockSideEffects,
  type MutationLink,
  type MutationRoute,
  type SideEffectDirection,
  type SideEffectPort,
} from "./sideEffects.layout";

export type { BlockSideEffects, MutationLink, SideEffectDirection, SideEffectPort } from "./sideEffects.layout";

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
  /**
   * Side-effect ports (./sideEffects.layout.ts) — drawn ON the top wall,
   * inputs left of a centre divider tick and outputs right of it. Omit (the
   * normal case) and nothing on the top wall changes: no divider, no row.
   *
   * WHY a sibling of `edges` and not a fifth `edges` key or a `top` rail:
   * a side effect is not an ordinary top-wall port. Its seat is a rule
   * about DIRECTION (Zach, 2026-09-22: "Splits down the middle… put it
   * towards the back end"), not a `PortEdge` distribution a caller could
   * reorder or respace, and the divider between the two halves is not
   * something a `PortEdge` rail knows how to draw. Keyed by direction for
   * the same reason `edges` is keyed by side (see `BlockSideEffects`).
   */
  sideEffects?: BlockSideEffects;
  /**
   * "This input is mutated and leaves through that output side effect" —
   * each drawn as a dotted line INSIDE the block, from the input port's
   * dot (a `left`-wall item) to the output effect's dot. A link that names
   * anything else is not drawn, and its `from→to` is listed on this
   * wrapper's `data-unresolved-mutations`.
   */
  mutations?: readonly MutationLink[];
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
  sideEffects,
  mutations,
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

  // The floor the walls' ports impose (`minBlockHeightFor`), from the
  // MEASURED header/footer bands and the same plan the rails are placed
  // with. Handed to the Block as a CSS `min-height`, so an authored or
  // stored `height` that is too short renders clamped UP and every other
  // height is untouched.
  //
  // WHY: Zach, 2026-09-22 — "Please enforce a minimum height on the blocks
  // … that can be calculated from the minimum port spacing. You should never
  // have a rendering issue like this", on a port hanging below its block.
  // WHY here, once, rather than in each host: every host (DOM canvas, React
  // Flow node, tldraw bench, the SystemSketch app's `ss-block`) mounts its
  // Block inside a `BlockPort`, and this is the one place that already
  // knows both the walls and the measured bands. WHY `min-height` and not a
  // replaced `height`: a floor RAISES a short box and leaves a taller one
  // alone (`resolveBlockHeight`'s own rule) — a deliberately tall block is
  // never "corrected". Growing the box is the truthful-rendering answer;
  // clipping or overlapping the ports is not.
  //
  // Depends only on header/footer, never on the Block's own height, so the
  // clamp cannot feed back into itself: measure → floor → grow → re-measure
  // yields the same floor.
  const floorPx = bands
    ? minBlockHeightFor({
        view,
        portLayout,
        collapsePorts: collapse,
        ports: Object.fromEntries(BLOCK_SIDES.map((side) => [side, edges[side]?.items.length ?? 0])),
        distributions: Object.fromEntries(
          BLOCK_SIDES.flatMap((side) => (edges[side]?.distribution ? [[side, edges[side]!.distribution!]] : [])),
        ),
        headerPx: bands.bodyTop - bands.blockTop,
        footerPx: bands.blockTop + bands.blockHeight - bands.bodyBottom,
      })
    : 0;
  // `cloneElement` adds ONE style key to the caller's own element and
  // changes nothing else about it — `children` stays "composed, never rebuilt
  // from props" (`BlockPortProps.children`). `Block` spreads its caller's
  // `style` last, so this lands on its root.
  const floored =
    floorPx > 0 && isValidElement<{ style?: CSSProperties }>(children)
      ? cloneElement(children as ReactElement<{ style?: CSSProperties }>, {
          // Never LOWER a caller's own larger `minHeight` — the floor only
          // ever raises (`floorMinHeight`).
          style: {
            ...(children.props as { style?: CSSProperties }).style,
            minHeight: floorMinHeight((children.props as { style?: CSSProperties }).style?.minHeight, floorPx),
          },
        })
      : children;

  const mutationSplit = partitionMutations(
    mutations,
    sideEffects,
    (edges.left?.items ?? []).map((item) => item.id),
  );

  return (
    <div
      data-slot="block-port"
      data-view={view}
      data-port-layout={portLayout}
      data-block-id={id}
      data-unresolved-mutations={mutations ? mutationSplit.unresolved.map((link) => `${link.from}→${link.to}`).join(",") : undefined}
      ref={wrapperRef}
      // The isolation invariant (paintOrder.ts): this wrapper emits the
      // `portDot` tier below (the function port and every rail), so it
      // must wall that off from anything outside it, same reasoning as
      // Block's own root.
      style={{ ...ISOLATED_ROOT_STYLE, position: "relative", width: "max-content" }}
    >
      {floored}
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
      {bands && hasSideEffects(sideEffects) && <BlockSideEffectRail effects={sideEffects!} bands={bands} diameter={diameter} variant={variant} />}
      {bands && mutationSplit.resolved.length > 0 && (
        <MutationLines wrapperRef={wrapperRef} links={mutationSplit.resolved} bands={bands} measureKey={layoutKey} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Side effects — the top wall's own row                               */
/* ------------------------------------------------------------------ */

/**
 * Every side-effect dot and the divider tick, on the Block's top border
 * line. Positions come from `sideEffectWallLayout` alone.
 *
 * WHY this element is stamped `data-slot="block-port-rail"` +
 * `data-edge="top"` although it is not a `PortEdge`: that pair is the
 * kit's one published answer to "which wall is this dot on", and three
 * readers already ask it — `wireLayer.tsx`'s `railEdgeOf` (a wire leaves
 * or arrives along the wall's normal), `hosts/portDotSightings.ts`, and
 * the drag policy's `"block-port-rail": "owns-pointer"`. Stamped, an
 * effect dot is wireable, host-resolvable and pointer-owning with zero
 * code in any of them. `data-rail-kind` is what tells the two kinds of
 * top-wall row apart for anyone who needs to.
 *
 * WHY it paints at `portDot`, above the Block, like every rail: the dots
 * straddle the border and the labels and divider sit wholly OUTSIDE it,
 * so inside the Block's `overflow: clip` card they would be cut in half
 * or vanish, and under the header chrome they would not be hittable.
 */
function BlockSideEffectRail({
  effects,
  bands,
  diameter,
  variant,
}: {
  effects: BlockSideEffects;
  bands: BlockBands;
  diameter?: PortSize;
  variant?: PortVariantId;
}) {
  const inputs = effects.inputs ?? [];
  const outputs = effects.outputs ?? [];
  const layout = sideEffectWallLayout(bands.blockWidth, inputs.length, outputs.length);
  return (
    <div
      data-slot="block-port-rail"
      data-edge="top"
      data-rail-kind="side-effects"
      style={{ position: "absolute", left: bands.blockLeft, top: bands.blockTop, width: bands.blockWidth, height: 0, zIndex: paintTier("portDot") }}
    >
      <SideEffectDivider x={layout.dividerX} />
      {inputs.map((effect, index) => (
        <SideEffectDot key={effect.id} effect={effect} direction="input" x={layout.inputXs[index]} diameter={diameter} variant={variant} />
      ))}
      {outputs.map((effect, index) => (
        <SideEffectDot key={effect.id} effect={effect} direction="output" x={layout.outputXs[index]} diameter={diameter} variant={variant} />
      ))}
    </div>
  );
}

/**
 * One side-effect dot, centred on the wall line at `x`. The holder is
 * EXACTLY the dot's box (the label is absolutely positioned off it, the
 * same pattern as `renderCollapsed`'s count below), so a wire resolving
 * `[data-port-id]` measures the dot's own centre and nothing else.
 */
function SideEffectDot({
  effect,
  direction,
  x,
  diameter,
  variant,
}: {
  effect: SideEffectPort;
  direction: SideEffectDirection;
  x: number;
  diameter?: PortSize;
  variant?: PortVariantId;
}) {
  return (
    <span
      data-slot="block-side-effect"
      data-side-effect-direction={direction}
      data-port-id={effect.id}
      style={{ position: "absolute", left: x, top: 0, display: "flex", transform: "translate(-50%, -50%)" }}
    >
      <Port state={effect.state ?? "empty"} diameter={diameter} variant={variant} />
      {effect.label !== undefined && (
        <span
          data-slot="block-side-effect-label"
          style={{
            position: "absolute",
            // Beside the dot and wholly above the wall: its bottom edge
            // clears the wall line (the dot's own centre) by the ring's
            // overhang, and it starts past the dot's painted ring.
            //
            // WHY an input's label reads LEFT of its dot and an output's
            // RIGHT: both grow AWAY from the divider. Measured on the
            // gallery, an input label written rightward ("input port" at
            // the quarter point of a 240px wall) ran straight through the
            // divider tick into the outputs' half — the one ambiguity the
            // divider exists to remove.
            ...(direction === "input" ? { right: `calc(100% + ${PORT_RING_OVERHANG_PX + 2}px)` } : { left: `calc(100% + ${PORT_RING_OVERHANG_PX + 2}px)` }),
            bottom: `calc(50% + ${PORT_RING_OVERHANG_PX}px)`,
            fontSize: 11,
            lineHeight: 1,
            // `pre`, not `nowrap`: every authored character — a double
            // space included — survives exactly as typed.
            whiteSpace: "pre",
            color: "var(--foreground)",
            pointerEvents: "none",
          }}
        >
          {effect.label}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Mutation lines — drawn INSIDE the Block, under its content           */
/* ------------------------------------------------------------------ */

/** The dot a mutation end sits on, owned by THIS wrapper (never a member's
 *  own nested BlockPort — the same ownership rule `wireLayer.tsx`'s
 *  `resolveDot` applies). */
function ownDot(wrapper: HTMLElement, selector: string): HTMLElement | null {
  for (const holder of wrapper.querySelectorAll<HTMLElement>(selector)) {
    if (holder.closest('[data-slot="block-port"]') !== wrapper) continue;
    return holder.querySelector<HTMLElement>('[data-slot="port-dot"]');
  }
  return null;
}

interface DrawnMutation {
  link: MutationLink;
  route: MutationRoute;
}

function sameRoutes(a: DrawnMutation[], b: DrawnMutation[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (drawn, i) =>
        drawn.link.from === b[i].link.from &&
        drawn.link.to === b[i].link.to &&
        drawn.route.points.every((p, j) => Math.abs(p.x - b[i].route.points[j].x) < 0.25 && Math.abs(p.y - b[i].route.points[j].y) < 0.25),
    )
  );
}

/**
 * Every resolved mutation link as a dotted orthogonal line with a small
 * arrowhead at the effect end, routed by `mutationRoute`.
 *
 * WHY it is portalled INTO the Block, at the `underlay` tier, when every
 * other thing this wrapper draws sits beside the Block above it: the line
 * runs through the Block's interior, and in an expanded Block that
 * interior is member cards. Drawn in this wrapper it could only paint
 * wholly above the Block (over every member) or wholly below it (under the
 * card's own opaque surface, i.e. invisible) — the Block is an isolated
 * root, so nothing outside it can slot in between its surface and its
 * content. Inside it, a negative tier paints after the card's own
 * background and before the header, body and members, so the line reads
 * on the card and disappears behind a member, never across one.
 *
 * Measured, not computed: both ends are rendered dots whose position the
 * rail and the side-effect row already decided, so reading them back is
 * the one derivation (the rule `wireLayer.tsx` states for itself: it never
 * invents a point). Coordinates are the Block's PADDING box, which is what
 * an absolutely-positioned child of it is laid out against.
 */
function MutationLines({
  wrapperRef,
  links,
  bands,
  measureKey,
}: {
  wrapperRef: RefObject<HTMLDivElement | null>;
  links: MutationLink[];
  bands: BlockBands;
  measureKey: string;
}) {
  const [block, setBlock] = useState<HTMLElement | null>(null);
  const [routes, setRoutes] = useState<DrawnMutation[]>([]);
  const linkKey = links.map((link) => `${link.from}>${link.to}`).join(",");

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const blockElement = wrapper.querySelector<HTMLElement>('[data-slot="block"]');
    setBlock(blockElement);
    if (!blockElement) return;

    const measure = () => {
      const blockRect = blockElement.getBoundingClientRect();
      const originX = blockRect.left + blockElement.clientLeft;
      const originY = blockRect.top + blockElement.clientTop;
      const next: DrawnMutation[] = [];
      for (const link of links) {
        const fromDot = ownDot(wrapper, `[data-slot="block-port-rail"][data-edge="left"] [data-port-id="${link.from}"]`);
        const toDot = ownDot(wrapper, `[data-slot="block-side-effect"][data-port-id="${link.to}"]`);
        if (!fromDot || !toDot) continue;
        const fromRect = fromDot.getBoundingClientRect();
        const toRect = toDot.getBoundingClientRect();
        next.push({
          link,
          route: mutationRoute(
            { x: fromRect.left + fromRect.width / 2 - originX, y: fromRect.top + fromRect.height / 2 - originY },
            { x: toRect.left + toRect.width / 2 - originX, y: toRect.top + toRect.height / 2 - originY },
            fromRect.width / 2,
            toRect.height / 2,
          ),
        });
      }
      setRoutes((previous) => (sameRoutes(previous, next) ? previous : next));
    };

    // The rails' dots land one pass after `bands` does (the same race
    // `wireLayer.tsx` documents), so measure now AND once more next frame.
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    observer.observe(blockElement);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrapperRef, bands, measureKey, linkKey]);

  if (!block || routes.length === 0) return null;
  return createPortal(
    <svg
      data-slot="block-mutation-lines"
      aria-hidden
      width="100%"
      height="100%"
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", zIndex: paintTier("underlay") }}
    >
      {routes.map(({ link, route }) => (
        <MutationLineMark key={`${link.from}>${link.to}`} from={link.from} to={link.to} route={route} />
      ))}
    </svg>,
    block,
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

/**
 * Exported (lane `collapsed-members`, 2026-09-22) so `blockPortMembers.tsx`
 * can mount a collapsed member's rail on its PARENT's wall with this exact
 * fill — the same `data-port-id` stamp, the same `LabeledPort` — instead of
 * a second copy of it. `BlockPort` itself is unchanged.
 */
export function BlockPortRail({
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
          // P-037. `LabeledPort`'s built-in label is click-to-edit by DEFAULT
          // (`DefaultPortLabel`'s `disabled = false`) and its `onLabelWrite` is
          // optional, so a rail whose host never wired one opened a real
          // `CodeEditor`, took every keystroke and dropped them on the floor —
          // "an unwired label simply reflects whatever the host passes", which
          // is a fine preview in a story and a lie on a board. Measured in the
          // real app 2026-09-21: double-clicking a rail label of a port storing
          // `gain_x: float`, typing `gain_y`, and finding the record unchanged
          // and the label snapped back.
          //
          // WHY this pair is needed HERE at all, when `PortEdge` already
          // threads `editingEnabled`/`onLabelWrite` through its own default
          // fill: this `renderItem` REPLACES that fill (portEdge.tsx:553), so
          // everything the fill forwards has to be forwarded again — the same
          // trap this file already records for `diagnostics`/`availability`.
          //
          // WHY the write routes through `onItemsChange` rather than a new
          // `onLabelWrite` on `BlockEdgeSpec`: that is exactly what `PortEdge`
          // does with its own (`handlePortLabelWrite`, portEdge.tsx:1340), so a
          // rail and a bare edge report a rename identically and a host needs
          // one handler, not two. It also makes the gate honest — a label is
          // editable exactly when the host said where the text should go.
          disabled={!spec.onItemsChange}
          onLabelWrite={spec.onItemsChange ? (value) => spec.onItemsChange?.(spec.items.map((it) => (it.id === item.id ? { ...it, label: value } : it))) : undefined}
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
    // WHY `pointer-events: none` HERE, at the rail's own box: `railBoxFor`
    // deliberately makes this box `RAIL_CROSS_PX` (56px) wide/tall so its
    // CROSS centre lands on the Block's border line — which means HALF of
    // it, by construction, sits outside the Block, over whatever the host
    // paints underneath (a cable, the canvas). Only the dots/labels/rail
    // controls PortEdge actually draws inside this box are real content;
    // the surrounding `CONTAINER_PADDING` margin is empty on purpose (it's
    // what keeps the dots centred on the wall). Before this, the whole box
    // was hit-testable, so a press on that empty margin resolved its
    // `elementFromPoint` target to THIS div — and every host's
    // `contentOwnsPress`/`pointerOwnership` reads `.closest('[data-slot=
    // "block-port-rail"]')` as "content owns it", so the press never
    // reached the cable or the canvas underneath (measured 2026-09-22:
    // `wireGrab.smoke.test.tsx`'s curved-cable press at (475, 206) landing
    // in this margin, after 4b49cd4 moved a trace's endpoint onto the
    // dot's own ring and out from under the rail). `PortEdgeSlotBox`'s
    // sortable card (`data-slot="port-edge-card"`), the lane's own editor
    // overlay (`data-slot="port-edge-lane"`) and the "+N more" chrome each
    // re-arm `pointer-events: auto` on themselves — the only parts of this
    // box a press should ever resolve to.
    pointerEvents: "none",
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
