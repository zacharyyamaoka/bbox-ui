/**
 * src/hosts/detach/primitives/textSlot.ts — the shared rule for "this slot is
 * a run of text": measure the live glyph ink box, emit one stock text shape.
 *
 * ONE factory, several primitives, rather than one hand-written file per
 * text slot: a Block header, a Block footer and a port label differ only in
 * which `data-slot` they answer to and what font size to assume if the
 * computed style is unreadable. Writing that rule three times is how the
 * three copies drift.
 *
 * The font size is READ off the live element, never assumed — the fallback
 * only covers a detached/unstyled element. STALE-COMMENT NOTE carried over
 * from `definitions/port.ts` (fixed 2026-09-18): port labels render at
 * `PORT_TEXT_SIZES.sm` (18px) by default
 * (`../../../components/port.layout.ts:158`), not 24px; the code always
 * read the computed style, so only the comment was ever wrong.
 *
 * `descend: false` — a text run has already accounted for everything inside
 * it via `textContent`, so walking into its children would paint the same
 * glyphs twice. The cost of that choice is real and worth naming: a header
 * that contains a registered NON-text primitive (a `Bar`, a `Glyph`) has
 * that part folded into the header's own string rather than lowered on its
 * own. That is exactly what the per-composite version did too, so it is not
 * a regression — but it is the seam to revisit when a glyph primitive lands.
 */
import type { TLDefaultColorStyle } from "tldraw";

import { textAtDom, textBoxRelativeTo } from "../stockShapes";
import type { DetachablePrimitive } from "./detachablePrimitive";

export interface TextSlotOptions {
  slot: string;
  /** Used only when the computed font size is unreadable. */
  fallbackPx: number;
  color?: TLDefaultColorStyle;
}

export function textSlotPrimitive(options: TextSlotOptions): DetachablePrimitive {
  return {
    slot: options.slot,
    descend: false,
    groupsSubtree: false,
    emit(context, el) {
      const text = el.textContent?.trim() ?? "";
      if (text === "") return [];
      const box = textBoxRelativeTo(context.origin, el, context.editor);
      const fontPx = Math.round(parseFloat(window.getComputedStyle(el).fontSize) || options.fallbackPx);
      return [
        textAtDom({
          text,
          px: fontPx,
          box,
          color: options.color ?? "black",
          measureRendered: context.measureRendered,
        }),
      ];
    },
  };
}

/** `../../../components/block.tsx:369`. 14px is the fallback the
 *  per-composite version used. */
export const blockHeaderPrimitive = textSlotPrimitive({ slot: "block-header", fallbackPx: 14 });

/** `../../../components/block.tsx:421`. FREE WIN: the per-composite version
 *  never lowered a footer at all — a Block with one simply lost it on
 *  detach. Registering the slot is the entire fix, and no composite changed. */
export const blockFooterPrimitive = textSlotPrimitive({ slot: "block-footer", fallbackPx: 14 });

/** `../../../components/labeledPort.tsx:231` — the display (non-editing)
 *  branch of a port's label. 18px per `port.layout.ts`'s `PORT_TEXT_SIZES.sm`. */
export const portLabelPrimitive = textSlotPrimitive({ slot: "port-label-display", fallbackPx: 18 });
