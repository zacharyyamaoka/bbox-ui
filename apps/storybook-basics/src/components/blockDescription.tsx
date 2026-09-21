// src/components/blockDescription.tsx — the sentence under a block's title,
// and the one boolean that decides whether it is painted at all.
//
// PORTED, not designed: packages/bbox-ui is the frozen v1 lineage and it
// already settled this feature's shape twice over —
//
//   - `src/block.fields.ts:120-124` — `{ id: "description", label:
//     "Description", kind: "toggle", defaultValue: true }`. Visibility is a
//     GOVERNED FIELD with a default of ON, not a prop someone remembers to
//     pass, which is why `showDescription` below defaults to `true`.
//   - `src/block.tsx:367-380` — `BlockDescription`: a `<p>` stamped
//     `data-slot="block-description"`, `text-muted-foreground`, an explicit
//     `fontSize`, caller `style` merged last.
//   - `src/blockFace.tsx:437-454` — WHERE it paints and WHEN: immediately
//     after the header, in BOTH header modes, and only when the resolved
//     boolean AND a non-empty string are both present
//     (`resolved.description && data.description`).
//
// This file restates those three facts for the trunk. `packages/bbox-ui` is
// not edited to match (ARCHITECTURE.md: "Never edit `packages/bbox-ui` to
// chase a trunk change").
import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

/**
 * The description's own type size, px.
 *
 * WHY this is 12 and the donor's `META_FONT_PX` is 18: the donor's number is
 * calibrated to its Simple View box, which `layout.ts` fixes at 384 × 258.
 * The trunk's `Block` defaults to 320 wide and the whiteboard's own `ss-block`
 * defaults to 160 (`BlockShapeUtil.getDefaultProps`), where an 18px sentence
 * is wider than the card it is describing. 12 is the trunk's own meta step —
 * one below `Block`'s root `text-sm` (14) — so the description reads as
 * subordinate to the title at every size the trunk actually ships.
 *
 * Exported because a spatial claim about this element has to be measured
 * against the component's own constant rather than a number retyped in a
 * test (`BlockDescription.stories.tsx` asserts exactly that).
 */
export const BLOCK_DESCRIPTION_FONT_PX = 12;

/**
 * The description's inset, px — horizontally the SAME 12 as `Block`'s own
 * header/footer `px-3`, so the sentence's left edge lines up with the title
 * above it instead of sitting in its own gutter. Vertically tighter (`py-1`)
 * because it is a continuation of the header, not a third region.
 */
export const BLOCK_DESCRIPTION_PADDING_X_PX = 12;
export const BLOCK_DESCRIPTION_PADDING_Y_PX = 4;

/**
 * The donor's gate (`blockFace.tsx:437`), as one named predicate instead of
 * two `&&`s repeated at every paint site.
 *
 * WHY an empty string paints NOTHING even when the toggle is on: the donor's
 * face reads `resolved.description && data.description`, i.e. a block that has
 * never been given a description looks identical to one whose description is
 * hidden. Without this, the eye toggle's "on" state would reserve an empty
 * line under every untouched block on the board.
 *
 * Pure, and used by exactly one component — so by this repo's placement rule
 * it lives WITH that component rather than in `scene/`.
 */
export function blockDescriptionIsPainted(description: string | undefined, showDescription: boolean): boolean {
  return showDescription && typeof description === "string" && description.trim() !== "";
}

/**
 * The text slot itself. `ComponentProps<"p">` and a merged `style`, exactly
 * the donor's own signature — a caller may restyle it; it may not make
 * authored characters disappear (`feedback_truthful_property_rendering`),
 * which is why nothing here truncates or clips.
 */
export function BlockDescription({ className, style, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="block-description"
      className={cn("text-muted-foreground", className)}
      style={{
        fontSize: BLOCK_DESCRIPTION_FONT_PX,
        lineHeight: 1.35,
        padding: `${BLOCK_DESCRIPTION_PADDING_Y_PX}px ${BLOCK_DESCRIPTION_PADDING_X_PX}px`,
        // The board stores one string; a newline the author typed is a
        // newline they meant. `pre-wrap` also keeps runs of spaces, which is
        // the same "render stored properties truthfully" rule the port
        // declaration already follows.
        whiteSpace: "pre-wrap",
        ...style,
      }}
      {...props}
    />
  );
}
