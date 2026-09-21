// src/shapes/block/blockPlacement.ts — what the PLACEMENT GESTURE means: the
// `b` tool's whole grammar, pure, free of tldraw and of this app's store.
//
// P-045. Zach's rule, verbatim (vault `DP - Block.md`
// ^systemsketch-block-placement-contract):
//
//   "if I just click a point it should b in simple mode / if you drag a very
//    small shape it should be simple mode / if I draw a biger shape then it
//    should enter port mode / if you draw a frame that encompases other
//    blocks, recntagles, etc. then it should be in expanded mode. this is like
//    drawin a frame a bit! / If you draw a really big frame, even if its not
//    encompsaseing anything it should be in expanded mode."
//
// Five sentences, five branches below, in that order.
//
// WHY a CLICK is its own branch rather than "the default box run through the
// size ladder": a click is not a drawn box. tldraw's own box tool completes a
// click at the shape's `getDefaultProps()` size (`BaseBoxShapeTool`'s
// `Pointing.complete()`), and that box is EXACTLY the port rung below — so a
// ladder applied to it would answer `port` and contradict Zach's first
// sentence. The donor hit the same collision from the other side and recorded
// it rather than papering over it ("a click lands 320x206, which is LARGER
// than the port rung — so clicking gives you a card while drawing that same
// box gives you a port block"). Here the gesture kind is named in the type, so
// the two cases cannot be confused by a caller and the first sentence is a
// tested fact instead of an accident of whatever `getDefaultProps` happens to
// say.
//
// WHY BOTH dimensions must clear a rung (the donor's rule, kept): a wide short
// band is a caption card, not a frame, and a tall narrow strip is not a canvas
// to wire inside.
//
// WHAT IS DELIBERATELY NOT PORTED from the donor: its 200x120 minimum drawing
// size. Zach rejected that in the very next round of feedback on the same note
// (^systemsketch-blank-live-edit-contract): "There should be no minium size to
// the block... I should be able to draw it as small as I want." So this file
// has a floor of zero — the smallest box you can draw is a simple block, and
// nothing here clamps what tldraw handed us.
import type { BlockView } from "./BlockShapeUtil";

/**
 * Both dimensions at or above this ⇒ `port`.
 *
 * This is the app's OWN canonical port-view block, not a transplanted donor
 * number. Two places already agree on 160x100 and this is the third:
 * `BlockShapeUtil.getDefaultProps()` (`w: 160, h: 100`) and
 * `shapes/wire/edgeDropCatalog.ts`'s `BLOCK_W`/`BLOCK_H`, which size the
 * "Block" / "Source" / "Sink" presets. The donor's own rung is 280x170 — but
 * it belongs to a tree whose port block is 320x206, twice this one's scale, so
 * copying its pixels would have put the rung above every block this app
 * itself mints and NO drag would ever have reached `port`.
 *
 * Restated rather than imported: `getDefaultProps` is a method on a module
 * that pulls in React and the engine, and this file is the pure one. The
 * coupling that matters is asserted instead — see `blockPlacement.test.ts`,
 * which reads the real `getDefaultProps()` and fails if the two drift.
 */
export const BLOCK_PORT_PLACEMENT_W_PX = 160;
export const BLOCK_PORT_PLACEMENT_H_PX = 100;

/**
 * Both dimensions at or above this ⇒ `expanded` even around empty canvas —
 * Zach's "really big frame, even if its not encompsaseing anything".
 *
 * Same anchoring: 320x240 is `GROUP_W` x `GROUP_H` in
 * `shapes/wire/edgeDropCatalog.ts:116-117`, the box the app's own "Expanded
 * group" preset drops on the board. Draw something at least as big as this
 * app's own group and you get a group.
 */
export const BLOCK_EXPANDED_PLACEMENT_W_PX = 320;
export const BLOCK_EXPANDED_PLACEMENT_H_PX = 240;

/** What the user actually did with the pointer. */
export type BlockPlacementGesture =
  | { kind: "click" }
  /** `enclosesShapes`: did the finished box land around at least one shape the
   *  block could adopt? The caller answers that — it needs the editor — and
   *  this module stays pure. */
  | { kind: "drag"; w: number; h: number; enclosesShapes: boolean };

/** The view a placement gesture asks for. */
export function blockViewForPlacement(gesture: BlockPlacementGesture): BlockView {
  // Sentence 1.
  if (gesture.kind === "click") return "simple";
  // Sentence 4 — and it wins outright, at any size, because encircling things
  // is an unambiguous statement of intent (the donor's words, and its rule).
  if (gesture.enclosesShapes) return "expanded";
  // Sentence 5.
  if (gesture.w >= BLOCK_EXPANDED_PLACEMENT_W_PX && gesture.h >= BLOCK_EXPANDED_PLACEMENT_H_PX) return "expanded";
  // Sentence 3.
  if (gesture.w >= BLOCK_PORT_PLACEMENT_W_PX && gesture.h >= BLOCK_PORT_PLACEMENT_H_PX) return "port";
  // Sentence 2.
  return "simple";
}
