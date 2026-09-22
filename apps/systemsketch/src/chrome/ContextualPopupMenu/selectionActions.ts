// src/chrome/ContextualPopupMenu/selectionActions.ts — what the floating pill can DO to whatever
// is selected, as plain functions over the editor.
//
// EVERYTHING IS A BLOCK (plan §2, Zach's 2026-09-18 ASK). That rule is the
// reason this file is short and has no `kind` switch worth speaking of: the
// pill never creates a node kind, never converts one into another, and never
// grows a "turn this into a loop" row. A Block's three views are the SAME
// shape wearing three faces, so changing one is a props write on the shape
// that is already there — `editor.updateShape`, not a replace.
//
// NEVER MIX DATA AND CONTROL LINES: nothing here makes an edge at all. The
// one edge kind is `ss-wire`, and it is born from a press-drag on a port dot
// (`shapes/wire/wireGesture.ts`), never from a menu.
import type { Editor, TLShape, TLShapeId } from "tldraw";

import type { BlockShape, BlockShapeProps } from "../../shapes/block";
import type { CodeLanguage, CodeShape } from "../../shapes/code";
import { isRegionCornerBlock } from "../../shapes/region";
import type { WireShape, WireShapeProps } from "../../shapes/wire";
import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "../../shapes/types";

/** `ss-block`'s `view`, read off the schema rather than re-spelled here —
 *  `src/shapes/block/index.ts` publishes the props type but not this union,
 *  and a hand-written copy is a second place for the enum to be wrong. */
export type BlockView = BlockShapeProps["view"];

/** The Block's three faces, in the order they grow. Labels are the person's
 *  words, not the schema's — `port` reads as "Ports" in a menu. */
export const BLOCK_VIEWS: readonly { id: BlockView; label: string; hint: string }[] = [
  { id: "simple", label: "Simple", hint: "Name only" },
  { id: "port", label: "Ports", hint: "Name plus its port rails" },
  { id: "expanded", label: "Expanded", hint: "A frame its members live inside" },
];

/** `ss-code`'s four-value `language` enum (plan §3), spelled for a menu. */
export const CODE_LANGUAGES: readonly { id: CodeLanguage; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "plaintext", label: "Plain text" },
];

/* ------------------------------------------------------------------ */
/* The edge type (P-008)                                               */
/* ------------------------------------------------------------------ */

/** `ss-wire`'s `routing`, read off the schema rather than re-spelled — the
 *  same rule `BlockView` follows one screen up. */
export type WireRouting = WireShapeProps["routing"];

/**
 * The four shapes a cable can take, in the order they read as a family:
 * two direct routes, then the two that leave along the wall normal.
 *
 * PARITY NOTE, so nobody "fixes" this list to three. The archived
 * SystemSketch shipped exactly three
 * (`CONNECTION_ROUTING_KINDS = ['curved', 'straight', 'elbow']`,
 * /home/bam/systemsketch/src/blocks/connections/connectionModel.ts:9) and has
 * no S-curve of its own. The backlog entry asks for "straight / curved /
 * elbow, with an S-curve button", quoting Zach: "I need a button as well for
 * the beizer curve (S curve) … That is the default one that looks like this".
 * In THIS repo that default bezier IS `curved` — `getConnectionControlPoints`
 * leaves each end along its own wall normal, which is what draws the S — so
 * `curved` is the S-curve button and is labelled as such. `slanted` is the
 * fourth value `ss-wire.routing` has always validated
 * (`WireShapeUtil.props.routing`) and it is offered rather than hidden,
 * because a value a saved board can legally carry with no control to reach it
 * is how a board becomes uneditable by its own app.
 *
 * WHY no glyph is named here: each option paints itself with the REAL router
 * (`RoutingGlyph`, ./selectionClusters.tsx), so the picture in the menu is
 * the route, not an artist's impression of it.
 */
export const WIRE_ROUTINGS: readonly { id: WireRouting; label: string; hint: string }[] = [
  { id: "straight", label: "Straight", hint: "A chord, ignoring both walls" },
  { id: "slanted", label: "Slanted", hint: "A short run off each wall, then one slope" },
  { id: "curved", label: "S-curve", hint: "The default bezier: leaves each wall perpendicular" },
  { id: "elbow", label: "Elbow", hint: "Orthogonal runs — the board's default" },
];

/** Everything the pill needs to decide which rows to render, read once. */
export interface SelectionSubject {
  ids: TLShapeId[];
  /** The one selected shape, when exactly one is selected — otherwise null.
   *  A per-kind control over a mixed selection would have to pick a winner,
   *  and the honest answer is that there isn't one. */
  only: TLShape | null;
  /** The selected Block's current view, when the selection IS one Block. */
  blockView: BlockView | null;
  /** The selected Code cell's language, same rule. */
  codeLanguage: CodeLanguage | null;
  /**
   * The selected cables.
   *
   * WHY a LIST where `blockView` and `codeLanguage` take the single-selection
   * rule: those two are per-kind FACES, and a face over a mixed bag has no
   * honest winner. Routing is not a face — it is one property of one kind,
   * and "select these five cables and make them all elbows" is the whole
   * point of having the control. So the row appears whenever ANY cable is
   * selected, and it writes to every cable in the selection and to nothing
   * else.
   */
  wires: TLShapeId[];
  /** The routing every selected cable agrees on, or `null` for a mixed
   *  selection (and for no selection at all — `wires` is the emptiness test,
   *  not this). */
  wireRouting: WireRouting | null;
  /** P-023. Whether every selected cable agrees on tunnelling, or `null` when
   *  they disagree. Same `wires`-is-the-emptiness-test rule as `wireRouting`,
   *  and same reason it is a LIST question rather than a lone-selection one:
   *  tunnelling a bundle in one press is most of the value. */
  wireTunnel: boolean | null;
  /** P-023. The layer every selected cable agrees on (`""` for none), or
   *  `null` when they disagree. */
  wireLayer: string | null;
}

export function selectionSubjectOf(editor: Editor): SelectionSubject {
  const ids = editor.getSelectedShapeIds();
  const shapes = editor.getSelectedShapes();
  const only = shapes.length === 1 ? shapes[0] : null;
  const wires = shapes.filter((shape): shape is WireShape => shape.type === WIRE_SHAPE_TYPE);
  const routings = new Set(wires.map((wire) => wire.props.routing));
  const tunnels = new Set(wires.map((wire) => wire.props.tunnel));
  const layers = new Set(wires.map((wire) => wire.props.layer));
  return {
    ids,
    only,
    blockView: only && only.type === BLOCK_SHAPE_TYPE && !isRegionCornerBlock(editor, only.id) ? (only as BlockShape).props.view : null,
    codeLanguage: only && only.type === CODE_SHAPE_TYPE ? (only as CodeShape).props.language : null,
    wires: wires.map((wire) => wire.id),
    wireRouting: routings.size === 1 ? [...routings][0] : null,
    wireTunnel: tunnels.size === 1 ? [...tunnels][0] : null,
    wireLayer: layers.size === 1 ? [...layers][0] : null,
  };
}

/**
 * Switch the selected Block's face. Same shape, different view.
 *
 * A region's CORNER CARD is refused, and `selectionSubjectOf` offers it no
 * toggle. WHY: Zach, 2026-09-22 — "I don't want to give people the option to
 * expand the region header block". The card is the region's header, not a
 * block you open; an expanded card would be a frame inside the frame's own
 * corner slot. The card is selectable alone only mid-rename (the selection
 * redirect's one carve-out, `shapes/region/cornerBlock.ts`), and that is
 * exactly when the pill was offering Simple/Ports/Expanded for it. The guard
 * lives HERE, in the one setter the pill and the 1/2/3 hotkeys
 * (`viewHotkeys.tsx`) both call, so neither door can reopen it.
 */
export function setBlockView(editor: Editor, id: TLShapeId, view: BlockView): void {
  if (isRegionCornerBlock(editor, id)) return;
  editor.updateShape<BlockShape>({ id, type: BLOCK_SHAPE_TYPE, props: { view } });
}

/** Switch the selected Code cell's language. */
export function setCodeLanguage(editor: Editor, id: TLShapeId, language: CodeLanguage): void {
  editor.updateShape<CodeShape>({ id, type: CODE_SHAPE_TYPE, props: { language } });
}

/**
 * Set the routing on every cable handed in — ONE undo step for the whole
 * selection.
 *
 * WHY a plain `updateShapes` and not `editor.setStyleForSelectedShapes`, which
 * is how every OTHER row in this pill writes: the archived SystemSketch made
 * routing a `StyleProp` ("Routing is a style for the same reason a Block's
 * view is", connectionModel.ts:12-17) and this app deliberately did not —
 * `ss-wire` keeps `routing` as a plain prop with no StyleProp
 * (`shapes/wire/WireShapeUtil.tsx`, and `chrome/Toolbar/dock.tsx` records the
 * decision where it declined to make `A` steer wires). A style would also
 * write to the OTHER kinds in a mixed selection, which is exactly what the
 * explicit id list below refuses to do.
 *
 * The batch is what makes it one history entry: `markHistoryStoppingPoint`
 * then a single `updateShapes` call, the same shape as `setStyle`'s own
 * two lines in ./arrangeActions.ts.
 */
export function setWireRouting(editor: Editor, ids: readonly TLShapeId[], routing: WireRouting): void {
  if (ids.length === 0) return;
  editor.markHistoryStoppingPoint("wire routing");
  editor.updateShapes<WireShape>(ids.map((id) => ({ id, type: WIRE_SHAPE_TYPE, props: { routing } })));
}

/**
 * P-023. Turn tunnelling on or off for every cable handed in — ONE undo step,
 * the same batched-undoable-write idiom as `setWireRouting` above and
 * `setStyle` in ./arrangeActions.ts.
 *
 * A plain prop write and not a `StyleProp`, for the reason `setWireRouting`
 * already records: a style writes to the OTHER kinds in a mixed selection, and
 * tunnelling is a fact about a cable that no block or code cell has an answer
 * for.
 */
export function setWireTunnel(editor: Editor, ids: readonly TLShapeId[], tunnel: boolean): void {
  if (ids.length === 0) return;
  editor.markHistoryStoppingPoint("wire tunnel");
  editor.updateShapes<WireShape>(ids.map((id) => ({ id, type: WIRE_SHAPE_TYPE, props: { tunnel } })));
}

/**
 * P-023. File every cable handed in onto `layer` — `""` takes them off every
 * layer.
 *
 * The caller resolves the typed name through `canonicalBoardLayer` FIRST
 * (`shapes/wire/wireTunnel.ts`), so that typing `diagnostics` beside an
 * existing `Diagnostics` joins that layer instead of forking it. Doing the
 * case-fold here instead would hide it from the control that has to SHOW the
 * resolved name back to the person typing.
 */
export function setWireLayer(editor: Editor, ids: readonly TLShapeId[], layer: string): void {
  if (ids.length === 0) return;
  editor.markHistoryStoppingPoint("wire layer");
  editor.updateShapes<WireShape>(ids.map((id) => ({ id, type: WIRE_SHAPE_TYPE, props: { layer } })));
}

/** Offset of a duplicate from its original, in page units. Small enough to
 *  read as "a copy of that", big enough that the copy is grabbable. */
const DUPLICATE_OFFSET = { x: 24, y: 24 };

export function duplicateSelection(editor: Editor): void {
  const ids = editor.getSelectedShapeIds();
  if (ids.length === 0) return;
  // tldraw's own duplicate: it re-mints ids, copies children, and selects the
  // copies. Rewriting that here would be a second, worse implementation of
  // something the engine already owns.
  editor.duplicateShapes(ids, DUPLICATE_OFFSET);
}

export function deleteSelection(editor: Editor): void {
  const ids = editor.getSelectedShapeIds();
  if (ids.length === 0) return;
  editor.deleteShapes(ids);
}
