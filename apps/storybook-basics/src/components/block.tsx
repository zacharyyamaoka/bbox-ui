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

/**
 * Block — header / body / footer, stacked. All three are plain slots: pass
 * text, pass nothing, or pass a <Bar> to compose the two components
 * together (that composition is the point of this reset pass — see
 * src/stories/Block.stories.tsx's "ComposedWithBar" story). A slot given
 * `undefined` is omitted entirely, not merely emptied, so a header-less
 * Block draws no stray divider line. Painted with Tailwind + the shadcn CSS
 * variables from src/globals.css.
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
}

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
}: BlockProps) {
  return (
    <div
      data-slot="block"
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-sm text-card-foreground shadow-sm"
      style={{ width, height, ...style }}
    >
      {header !== undefined && (
        <div
          data-slot="block-header"
          className={cn(
            "px-3 py-2 has-[>[data-slot=bar]]:p-0",
            showHeaderDivider && "border-b border-border",
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
          className="border-t border-border px-3 py-2 has-[>[data-slot=bar]]:p-0"
        >
          {footer}
        </div>
      )}
    </div>
  );
}
