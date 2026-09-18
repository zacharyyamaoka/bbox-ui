import type { CSSProperties, ReactNode } from "react";

import { cn } from "../lib/utils";
import {
  BLOCK_MEMBER_GAP_PX,
  BLOCK_MEMBER_INSET_PX,
  BlockMembers,
  type BlockInsetBackground,
  type BlockMember,
  type BlockMembersLayout,
} from "./blockMembers";
import { SketchOutline, SKETCH_OUTLINE_BLEED_PX } from "../skin/sketchOutline";

/**
 * Block — header / body / footer, stacked. All three are plain slots: pass
 * text, pass nothing, or pass a <Bar> to compose the two components
 * together (that composition is the point of this reset pass — see
 * src/stories/Block.stories.tsx's "ComposedWithBar" story). A slot given
 * `undefined` is omitted entirely, not merely emptied, so a header-less
 * Block draws no stray divider line. Painted with Tailwind + the shadcn CSS
 * variables from src/globals.css.
 *
 * WHY this file imports no port concept, and must keep not doing so (Zach,
 * 2026-09-17, docs/BLOCK-PORT-EDGES-PLAN.md D-A1): Block is usable on its
 * own — a card with a header, a body, a footer — and ports are something
 * "we're starting to add more and more things to", not a fact about every
 * Block. `./blockPort.tsx`'s `BlockPort` is the wrapper that mounts ports on
 * a Block's walls; it composes THIS component from the outside rather than
 * this component growing port props, because Block's own root below is
 * `overflow-hidden` and would clip a rail dot that deliberately straddles
 * the border line. See blockPort.tsx's own header for the reciprocal note.
 *
 * WHY `body` is conditional like the other two, and `height` has no default:
 * Zach's folding-chevron requirement is "make sure that it hides the body and
 * footer when you click it." Body used to render unconditionally and `height`
 * defaulted to 240, so a collapsed Block stayed a 240px box with an empty
 * well under its header — the text vanished but nothing folded (measured:
 * 180px open, 180px closed, body GREW 80px → 125px as the footer left). Both
 * halves are needed: omitting the region is what removes the content, and an
 * absent height is what lets the box hug what remains. That also restores
 * this repo's own stated size contract (ARCHITECTURE.md): "Explicit size when
 * the scene carries one; hug contents when it does not" — a caller that wants
 * a fixed box still passes one.
 *
 * WHY the header/footer wrappers' `px-3 py-2` is cancelled with
 * `has-[>[data-slot=bar]]:p-0` rather than removed outright: Zach's bar
 * feedback wants a Bar filling the header/footer to sit edge-to-edge with
 * the divider — a Bar's OWN `px-3` (bar.tsx) supplies the inset instead, so
 * stacking both paddings would double it back up. A bare string/ReactNode
 * header (no Bar) still needs Block's own padding — it has none of its own
 * — so the wrapper keeps `px-3 py-2` as its default and only zeroes it when
 * a `<Bar>` is the direct child, detected via `data-slot="bar"` rather than
 * a new Block prop.
 */

export interface BlockProps {
  header?: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Explicit height in px. Omit to hug the rendered regions. */
  height?: number;
  style?: CSSProperties;
  /**
   * The divider line under the header. Defaults to shown, so no existing
   * caller changes. WHY a prop and not a className override: SystemSketch's
   * own Block chrome treats "Header divider: Show|Hide" as a first-class
   * toggle beside "Footer: Show|Hide" (blockModel.ts's
   * `BlockShowHeaderDividerStyle`) — a header-only card (Zach's minimal
   * "Attributes" variant) wants the title to sit directly on the body with
   * no line between. Footer hiding needs no prop: omit `footer` and the
   * region is omitted entirely (the existing contract).
   */
  showHeaderDivider?: boolean;
  /**
   * Membership — "boxes all the way down". Members render in their own
   * region between body and footer; `membersLayout` picks how the ONE
   * member list is laid out (free = a frame inside, stack = an ordered
   * column). See ./blockMembers.tsx for the vocabulary and its
   * SystemSketch provenance.
   */
  members?: BlockMember[];
  membersLayout?: BlockMembersLayout;
  /** Enables drag-to-reorder of stacked members, kanban-card style. */
  onMembersChange?(members: BlockMember[]): void;
  memberGap?: number;
  memberGutter?: number;
  insetBackground?: BlockInsetBackground;
  showMembers?: boolean;
  showCards?: boolean;
  /**
   * Stable string the sketch skin's hand-drawn outline is generated from —
   * same seed, same wobble, every render (see sketchPath.ts). Defaults to
   * a size-derived string so two same-sized Blocks don't draw identical
   * wobble by coincidence of both falling back the same way; pass an id
   * when two same-sized Blocks need visibly different hand-drawn lines.
   */
  sketchSeed?: string;
}

/**
 * The root's own border width, px — what `SketchOutline` draws on top of
 * and insets its bleed margin by. A literal, not `--bbox-skin-stroke-width`
 * read back out of CSS: this app carries no wall-anchor geometry that
 * needs the two to be the SAME variable (donor's block.tsx / skin.css both
 * flag that trap — see skin.css's own port-of-omission note), so a plain
 * constant is honest here. It still has to match the token's stroke-width
 * fallback (2px) or the drawn line and the CSS border would part ways the
 * moment a skin activates.
 */
const BLOCK_BORDER_PX = 2;

export function Block({
  header,
  body,
  footer,
  width = 320,
  height,
  style,
  showHeaderDivider = true,
  members,
  membersLayout = "free",
  onMembersChange,
  memberGap = BLOCK_MEMBER_GAP_PX,
  memberGutter = BLOCK_MEMBER_INSET_PX,
  insetBackground = "none",
  showMembers = true,
  showCards = false,
  sketchSeed,
}: BlockProps) {
  return (
    <div
      data-slot="block"
      className={cn(
        "relative flex flex-col text-sm",
        // Text colour is a skin token because a skin may remove the
        // surface it was contrasting against: the sketch skin paints no
        // fill, so `text-card-foreground` would be reading against a card
        // that is not there. Fallback is the exact class this replaced.
        "text-[color:var(--bbox-skin-fg,var(--color-card-foreground))]",
        // The skin seam (src/skin/skin.ts + skin.css). Each token carries
        // TODAY'S value as its own `var()` fallback — captured live off
        // this story before this port (`blocks-block--default`,
        // getComputedStyle) — so a consumer who never imports skin.css
        // renders the exact pixels this replaced: `rounded-lg border
        // border-border bg-card shadow-sm`. `border-solid` is explicit
        // because a host without Tailwind's preflight defaults to
        // `border-style: none`, where a width alone paints nothing.
        // WHY the fallback is 1px, not the token table's 2px: Block's own
        // border-width TODAY is Tailwind's plain `border` utility (1px) —
        // captured live (`blocks-block--default`, getComputedStyle) before
        // this port. skin.css's three blocks still all agree on 2px once
        // ANY skin is active (including the explicit "default" one) — see
        // skin.css's own header on why stroke-width has to be uniform
        // across every skinned component the moment a skin is switched
        // on. Only the UNSET case (no attribute at all) has to stay 1px.
        "border-solid border-[length:var(--bbox-skin-stroke-width,1px)] border-[color:var(--bbox-skin-stroke,var(--color-border))]",
        "bg-[var(--bbox-skin-surface,var(--color-card))] shadow-[var(--bbox-skin-shadow,0_1px_3px_0_rgb(0_0_0_/_0.1),0_1px_2px_-1px_rgb(0_0_0_/_0.1))]",
        // Set once on the container; every text slot inherits it, so the
        // sketch skin needs no per-slot font prop.
        "font-[family-name:var(--bbox-skin-font,inherit)]",
      )}
      // `overflow: clip` (not `hidden`) so the header/footer bars' corners
      // still cut cleanly without turning Block into a scroll container —
      // and so the drawn sketch outline's bleed isn't clipped at the
      // padding box; see `overflowClipMargin` below.
      style={{
        width,
        height,
        borderRadius: "var(--bbox-skin-radius, var(--radius-lg))",
        overflow: "clip",
        overflowClipMargin: `${BLOCK_BORDER_PX + SKETCH_OUTLINE_BLEED_PX}px`,
        ...style,
      }}
    >
      {/*
       * `stretch` when `height` is omitted (Block hugs its content): the
       * real pixel height isn't known until layout, and self-measurement
       * (ResizeObserver/getBoundingClientRect) is exactly what the core
       * does not do — sketchOutline.tsx's own `stretch` mode exists for
       * this (a Pill/Badge/Bar are in the same boat). The nominal 200
       * below only scales the wobble amplitude and is invisible once
       * `preserveAspectRatio="none"` stretches the path to whatever Block
       * actually renders at.
       */}
      <SketchOutline
        width={width}
        height={height ?? 200}
        borderWidth={BLOCK_BORDER_PX}
        stretch={height === undefined}
        seed={sketchSeed ?? `${width}x${height ?? "auto"}`}
      />
      {header !== undefined && (
        <div
          data-slot="block-header"
          className={cn(
            "px-3 py-2 has-[>[data-slot=bar]]:p-0",
            // `border-b-[color:…]`, NOT the bare `border-[color:…]` this
            // was first written as: a bracketed arbitrary value with no
            // side prefix sets the property on all FOUR sides, which
            // silently added a 1px left/right/top border the div never
            // had — measured live (BlockPort.stories.tsx's
            // `FunctionPortHeaderInset`, off by 2px) before this fix.
            // `border-b` alone still supplies the bottom width + solid
            // style; this only overrides ITS colour.
            showHeaderDivider && "border-b border-b-[color:var(--bbox-skin-stroke,var(--color-border))]",
          )}
        >
          {header}
        </div>
      )}
      {body !== undefined && (
        <div
          data-slot="block-body"
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2"
        >
          {body}
        </div>
      )}
      {members !== undefined && (
        <BlockMembers
          layout={membersLayout}
          members={members}
          onMembersChange={onMembersChange}
          gap={memberGap}
          gutter={memberGutter}
          insetBackground={insetBackground}
          showMembers={showMembers}
          showCards={showCards}
        />
      )}
      {footer !== undefined && (
        <div
          data-slot="block-footer"
          className="border-t border-t-[color:var(--bbox-skin-stroke,var(--color-border))] px-3 py-2 has-[>[data-slot=bar]]:p-0"
        >
          {footer}
        </div>
      )}
    </div>
  );
}
