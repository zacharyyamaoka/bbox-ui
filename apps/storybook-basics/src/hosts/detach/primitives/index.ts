/**
 * src/hosts/detach/primitives/index.ts — the one place a component's
 * detach rule is registered.
 *
 * RULING 5, in one array. Zach: "by making it work on the basic components
 * a primitive so then it comes for free for the higher level things." Every
 * entry below is a PRIMITIVE keyed by the `data-slot` its component already
 * stamps; no composite lists them, and no composite needs editing when one
 * is added. Registering a slot here is the ENTIRE cost of teaching every
 * existing and future composite to lower that part.
 *
 * WHAT IS DELIBERATELY NOT HERE, so the gap is stated rather than implied:
 * `glyph` (`../../../components/glyph.tsx:124`) and `badge`
 * (`../../../components/badge.tsx:87`) have no honest stock approximation
 * yet — an icon lowered to a rectangle is worse than a missing icon, and
 * Zach's own acceptance bar is "getting Port, Block and one composite
 * genuinely pixel-accurate is worth far more than eleven components at
 * roughly right." `bar` is the same judgement. They are one entry each when
 * a rule for them is decided; nothing else changes.
 */
import { registryOf, type DetachablePrimitive } from "./detachablePrimitive";
import { blockCardPrimitive } from "./blockCard";
import { portDotPrimitive } from "./portDot";
import { portRowPrimitive } from "./portRow";
import { blockFooterPrimitive, blockHeaderPrimitive, portLabelPrimitive } from "./textSlot";

export const DETACHABLE_PRIMITIVES: readonly DetachablePrimitive[] = [
  blockCardPrimitive,
  blockHeaderPrimitive,
  blockFooterPrimitive,
  portRowPrimitive,
  portDotPrimitive,
  portLabelPrimitive,
];

export const PRIMITIVE_REGISTRY = registryOf(DETACHABLE_PRIMITIVES);

export { registryOf, type DetachablePrimitive, type PrimitiveContext, type PrimitiveRegistry } from "./detachablePrimitive";
export { lowerSubtree, type LoweredSubtree } from "./lowerSubtree";
export { blockCardPrimitive, BLOCK_CARD_SLOT } from "./blockCard";
export { portDotPrimitive, PORT_DOT_SLOT } from "./portDot";
export { portRowPrimitive, PORT_ROW_SLOT } from "./portRow";
export { blockFooterPrimitive, blockHeaderPrimitive, portLabelPrimitive, textSlotPrimitive, type TextSlotOptions } from "./textSlot";
