"use client";

/**
 * src/components/blockPortMembers.tsx — `BlockPortMembers`: a Block whose
 * STACKED members each carry their own ports, shown in one of two views
 * (lane `collapsed-members`, 2026-09-22).
 *
 * Zach, 2026-09-22: "Collapsed member regions... a block in stack mode,
 * displayed with both an expanded view and the port view. The key idea here
 * is that we collapse each of the children members to a port state, and then
 * make them go edge to edge. We can optionally show or hide the header of the
 * children members."
 *
 * - `view: "expanded"` is today's stack, unchanged: each member is its own
 *   card (a `BlockPort` around a `Block`), inset, with gaps, its dots on its
 *   OWN walls.
 * - `view: "port"` collapses every member into a full-width BAND: the same
 *   member list in the same `BlockMembers` stack, but `edge-to-edge` with a
 *   zero gap, so the bands tile the parent with only a rule between them. Each
 *   member's dots move onto the PARENT's outer walls, level with its band.
 *
 * WHY `view` reuses `BlockView`'s words and not a new "collapsed" flag: the
 * collapse IS the port view, applied one level down. Zach calls it "collapse
 * each of the children members to a port state", which is `BlockPort`'s own
 * `view="port"` vocabulary. A second word for the same state would make a host
 * translate between two names for one thing. `"simple"` is left out on
 * purpose. What a simple face does with members has not been decided, and
 * guessing it here would be inventing a relationship.
 *
 * WHY a collapsed member's dot keeps the MEMBER's `data-block-id`, drawn on the
 * parent's wall, and not the parent's id: a cable to "Func 1.port" is a cable
 * to Func 1. If the parent owned the dot, the same wire would resolve against
 * a different block in each view, and two members that both name a port
 * `port` (the sketch has four of them) would collide inside one block. So
 * every band gets an overlay that spans the parent's full outer width, carries
 * the member's own `data-block-id`, and holds that member's rails.
 * `wireLayer.tsx`'s `resolveDot` then finds `[data-port-id]` inside
 * `[data-block-id=<member>]`, the same lookup it does in the expanded view. A
 * wire into a collapsed member names the parent in `through`, because the
 * parent is the container it enters (`wiring.ts`'s `keepOutsFor`).
 *
 * WHY the overlays sit OUTSIDE the parent `Block`, in this wrapper: `Block`'s
 * root clips (`overflow: clip`), and a dot on the wall straddles the border.
 * Drawn inside a band, half of every dot would be cut off. This is the same
 * reason `BlockPort` is a wrapper (blockPort.tsx, D-A1), so the overlays are
 * positioned from the bands' MEASURED boxes, the same app-level measuring
 * `BlockPort`'s `useBlockBands` does.
 *
 * WHY a component and not new `Block` props: `Block` imports no port concept
 * (block.tsx's own header). This composes `Block`, `BlockMembers`, `BlockPort`
 * and `BlockPortRail` from the outside and edits none of them.
 */
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import type { PortVariantId } from "../skin/portVariants";
import { Bar } from "./bar";
import { Block } from "./block";
import { BLOCK_MEMBER_INSET_PX, type BlockMember } from "./blockMembers";
import { BlockPort, BlockPortRail, type BlockEdgeSpec } from "./blockPort";
import { railPlanFor, type BlockBands, type BlockView } from "./blockPort.layout";
import { memberPortsLengthPx } from "./blockPortMembers.layout";
import type { BlockSide, PortSize } from "./port.layout";
import type { PortEdgeItem } from "./portEdge";
import { ISOLATED_ROOT_STYLE } from "./paintOrder";

export { memberPortsLengthPx } from "./blockPortMembers.layout";

/* ------------------------------------------------------------------ */
/* Surface                                                             */
/* ------------------------------------------------------------------ */

/**
 * Whether each member draws its own header row (its name).
 *
 * WHY a `"show" | "hide"` pair and not a boolean: it is the same toggle
 * SystemSketch's Block chrome spells "Header divider: Show|Hide" /
 * "Footer: Show|Hide" (block.tsx's `showHeaderDivider` doc), and Zach asked
 * for exactly that switch: "We can optionally show or hide the header of the
 * children members." It sits beside `BlockMemberInset` and
 * `BlockInsetBackground`, the two-valued string unions members already use.
 * It applies to BOTH views, so switching views never changes whether a name
 * is visible.
 */
export type BlockMemberHeaders = "show" | "hide";

/** The two views a stacked member can take. See the module doc for why
 *  `"simple"` is not one of them. */
export type BlockPortMembersView = Exclude<BlockView, "simple">;

/** Walls a member's ports go on. The stack runs top to bottom, so only the
 *  left and right walls have a band to line up with. */
export type BlockPortMemberSide = Extract<BlockSide, "left" | "right">;
const MEMBER_SIDES: BlockPortMemberSide[] = ["left", "right"];

export interface BlockPortMember {
  /** Stamped as `data-block-id` on whatever carries this member's dots, in
   *  either view, so a wire to one of its ports resolves the same way in both. */
  id: string;
  /** Rendered literally in the member's header row, when headers are shown. */
  name: string;
  left?: PortEdgeItem[];
  right?: PortEdgeItem[];
}

export interface BlockPortMembersProps {
  /** The PARENT's `data-block-id`. */
  id?: string;
  view: BlockPortMembersView;
  /** The parent's own header and footer, passed straight to `Block`. */
  header?: ReactNode;
  footer?: ReactNode;
  width?: number;
  members: BlockPortMember[];
  /** Defaults to `"show"`. */
  memberHeaders?: BlockMemberHeaders;
  diameter?: PortSize;
  variant?: PortVariantId;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** The parent's border width: the `--bbox-skin-stroke-width` fallback
 *  block.tsx paints with. Used only to size an expanded member card to the
 *  parent's inner width. */
const PARENT_BORDER_PX = 1;

/** `Block`'s body padding (`p-2`, block.tsx). An expanded card's body is a
 *  spacer shortened by this on both sides, so the body band, which a
 *  port-view rail spans, is exactly the ports length. */
const BLOCK_BODY_PADDING_PX = 8;

/** The divider between bands and under a band's header. It is the same
 *  class block.tsx's own header divider uses, so a band rule matches the
 *  rule under the parent's header. */
const RULE_TOP = "border-t border-t-[color:var(--bbox-skin-stroke,var(--color-border))]";
const RULE_BOTTOM = "border-b border-b-[color:var(--bbox-skin-stroke,var(--color-border))]";

function portCountOf(member: BlockPortMember): number {
  return Math.max(member.left?.length ?? 0, member.right?.length ?? 0);
}

function populatedSides(member: BlockPortMember): BlockPortMemberSide[] {
  return MEMBER_SIDES.filter((side) => (member[side]?.length ?? 0) > 0);
}

function edgesOf(member: BlockPortMember): Partial<Record<BlockPortMemberSide, BlockEdgeSpec>> {
  return Object.fromEntries(populatedSides(member).map((side) => [side, { items: member[side]! }]));
}

/**
 * A member's name, in the same `Bar` either view puts it in. The name is
 * rendered as given. When the row is too narrow it shows an ellipsis and the
 * full name stays in `title`, so no character disappears without a sign.
 */
function MemberHeaderBar({ name }: { name: string }) {
  return (
    <Bar
      size="sm"
      left={
        <span data-slot="block-member-header" title={name} className="truncate" style={{ fontSize: 12 }}>
          {name}
        </span>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Measurement: the bands, in wrapper-local px                         */
/* ------------------------------------------------------------------ */

interface BandBox {
  top: number;
  height: number;
  /** Where the ports area starts, relative to the band's own top. */
  portsTop: number;
}

interface BandGeometry {
  blockLeft: number;
  blockWidth: number;
  bands: Record<string, BandBox>;
}

const EPSILON_PX = 0.5;

function sameGeometry(a: BandGeometry | null, b: BandGeometry | null): boolean {
  if (a == null || b == null) return a === b;
  if (Math.abs(a.blockLeft - b.blockLeft) >= EPSILON_PX || Math.abs(a.blockWidth - b.blockWidth) >= EPSILON_PX) return false;
  const ids = Object.keys(a.bands);
  if (ids.length !== Object.keys(b.bands).length) return false;
  return ids.every((id) => {
    const x = a.bands[id];
    const y = b.bands[id];
    return (
      y != null &&
      Math.abs(x.top - y.top) < EPSILON_PX &&
      Math.abs(x.height - y.height) < EPSILON_PX &&
      Math.abs(x.portsTop - y.portsTop) < EPSILON_PX
    );
  });
}

/**
 * Reads the parent `Block`'s box and every band's box. Only in the port view,
 * because that is the only view that draws overlays. The expanded view's
 * dots belong to each member's own `BlockPort`, which measures itself.
 */
function useBandGeometry(wrapperRef: RefObject<HTMLDivElement | null>, enabled: boolean, layoutKey: string): BandGeometry | null {
  const [geometry, setGeometry] = useState<BandGeometry | null>(null);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !enabled) {
      setGeometry(null);
      return;
    }

    const measure = () => {
      const block = wrapper.querySelector<HTMLElement>(':scope > [data-slot="block"]');
      if (!block) {
        setGeometry((prev) => (prev == null ? prev : null));
        return;
      }
      const wrapperRect = wrapper.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      const bands: Record<string, BandBox> = {};
      for (const band of block.querySelectorAll<HTMLElement>('[data-slot="block-member-band"][data-member-id]')) {
        const bandRect = band.getBoundingClientRect();
        const ports = band.querySelector<HTMLElement>(':scope > [data-slot="block-member-band-ports"]');
        bands[band.getAttribute("data-member-id")!] = {
          top: bandRect.top - wrapperRect.top,
          height: bandRect.height,
          portsTop: ports ? ports.getBoundingClientRect().top - bandRect.top : 0,
        };
      }
      const next: BandGeometry = { blockLeft: blockRect.left - wrapperRect.left, blockWidth: blockRect.width, bands };
      setGeometry((prev) => (sameGeometry(prev, next) ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    const block = wrapper.querySelector<HTMLElement>(':scope > [data-slot="block"]');
    if (block) {
      observer.observe(block);
      for (const band of block.querySelectorAll<HTMLElement>('[data-slot="block-member-band"]')) observer.observe(band);
    }
    return () => observer.disconnect();
  }, [wrapperRef, enabled, layoutKey]);

  return geometry;
}

/* ------------------------------------------------------------------ */
/* The two views' member content                                       */
/* ------------------------------------------------------------------ */

/** Expanded: today's member card. A `BlockPort` in port view around a
 *  `Block`, dots on the card's own walls. */
function ExpandedMemberCard({
  member,
  cardWidth,
  memberHeaders,
  diameter,
  variant,
}: {
  member: BlockPortMember;
  cardWidth: number;
  memberHeaders: BlockMemberHeaders;
  diameter?: PortSize;
  variant?: PortVariantId;
}) {
  const portsLength = memberPortsLengthPx(portCountOf(member));
  return (
    <BlockPort id={member.id} view="port" edges={edgesOf(member)} diameter={diameter} variant={variant}>
      <Block
        width={cardWidth}
        header={memberHeaders === "show" ? <MemberHeaderBar name={member.name} /> : undefined}
        body={<div aria-hidden data-slot="block-member-ports" style={{ height: Math.max(0, portsLength - 2 * BLOCK_BODY_PADDING_PX) }} />}
        footer={<Bar size="sm" />}
      />
    </BlockPort>
  );
}

/** Port view: one full-width band. Its header row (if shown), then a ports
 *  area exactly as tall as its rail. The dots are NOT in here; they are on
 *  the overlay this band's measured box positions. */
function CollapsedMemberBand({ member, index, memberHeaders }: { member: BlockPortMember; index: number; memberHeaders: BlockMemberHeaders }) {
  return (
    <div data-slot="block-member-band" data-member-id={member.id} className={index > 0 ? RULE_TOP : undefined}>
      {memberHeaders === "show" && (
        <div data-slot="block-member-band-header" className={RULE_BOTTOM}>
          <MemberHeaderBar name={member.name} />
        </div>
      )}
      <div data-slot="block-member-band-ports" style={{ height: memberPortsLengthPx(portCountOf(member)) }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BlockPortMembers                                                    */
/* ------------------------------------------------------------------ */

export function BlockPortMembers({
  id,
  view,
  header,
  footer,
  width = 240,
  members,
  memberHeaders = "show",
  diameter,
  variant,
}: BlockPortMembersProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const collapsed = view === "port";
  const layoutKey = [view, memberHeaders, width, ...members.map((m) => `${m.id}:${m.left?.length ?? 0}:${m.right?.length ?? 0}`)].join("|");
  const geometry = useBandGeometry(wrapperRef, collapsed, layoutKey);

  const cardWidth = width - 2 * PARENT_BORDER_PX - 2 * BLOCK_MEMBER_INSET_PX;
  const blockMembers: BlockMember[] = members.map((member, index) => ({
    id: member.id,
    // Port view: flush to both inner walls, so a band is the parent's full
    // inner width. Expanded: today's inset card.
    inset: collapsed ? "edge-to-edge" : "inset",
    content: collapsed ? (
      <CollapsedMemberBand member={member} index={index} memberHeaders={memberHeaders} />
    ) : (
      <ExpandedMemberCard member={member} cardWidth={cardWidth} memberHeaders={memberHeaders} diameter={diameter} variant={variant} />
    ),
  }));

  return (
    <div
      data-slot="block-port-members"
      data-view={view}
      data-member-headers={memberHeaders}
      data-block-id={id}
      ref={wrapperRef}
      // The isolation invariant (paintOrder.ts): the rails below emit the
      // `portDot` tier, so this root walls it off, as `BlockPort` does.
      style={{ ...ISOLATED_ROOT_STYLE, position: "relative", width: "max-content" }}
    >
      <Block
        width={width}
        header={header}
        footer={footer}
        members={blockMembers}
        membersLayout="stack"
        // Zero gap is what makes the bands tile: `BlockMembers`' stack uses
        // `gap` for the space between members AND its top/bottom padding.
        memberGap={collapsed ? 0 : undefined}
      />
      {collapsed &&
        geometry &&
        members.map((member) => {
          const band = geometry.bands[member.id];
          if (!band) return null;
          return (
            <CollapsedMemberRails
              key={member.id}
              member={member}
              band={band}
              blockLeft={geometry.blockLeft}
              blockWidth={geometry.blockWidth}
              diameter={diameter}
              variant={variant}
            />
          );
        })}
    </div>
  );
}

/**
 * One collapsed member's dots, on the parent's walls. The overlay spans the
 * parent's full OUTER width and the band's height, so its own left and right
 * edges ARE the parent's walls, and `railBoxFor` puts every dot centre on
 * them. The rail plan is the port view's own (`railPlanFor`), so a band's
 * ports are spaced exactly as a port-view `BlockPort`'s are.
 */
function CollapsedMemberRails({
  member,
  band,
  blockLeft,
  blockWidth,
  diameter,
  variant,
}: {
  member: BlockPortMember;
  band: BandBox;
  blockLeft: number;
  blockWidth: number;
  diameter?: PortSize;
  variant?: PortVariantId;
}) {
  const populated = populatedSides(member);
  const bands: BlockBands = {
    blockLeft: 0,
    blockTop: 0,
    blockWidth,
    blockHeight: band.height,
    bodyTop: band.portsTop,
    bodyBottom: band.height,
  };
  const style: CSSProperties = {
    position: "absolute",
    left: blockLeft,
    top: band.top,
    width: blockWidth,
    height: band.height,
    // The overlay is only a coordinate frame and a `data-block-id`. It
    // covers the band, so it must not take the band's pointer events. The
    // rails turn them back on for themselves.
    pointerEvents: "none",
  };
  return (
    <div data-slot="block-member-ports-overlay" data-block-id={member.id} data-member-id={member.id} style={style}>
      <div style={{ pointerEvents: "auto" }}>
        {populated.map((side) => {
          const items = member[side]!;
          const plan = railPlanFor({
            view: "port",
            portLayout: "inline",
            edge: side,
            itemIds: items.map((item) => item.id),
            leadCount: member.left?.length ?? 0,
            collapsePorts: false,
            populatedEdges: populated,
          });
          return <BlockPortRail key={side} edge={side} spec={{ items }} plan={plan} bands={bands} diameter={diameter} variant={variant} />;
        })}
      </div>
    </div>
  );
}
