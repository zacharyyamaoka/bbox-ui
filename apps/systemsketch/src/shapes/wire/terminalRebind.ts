// src/shapes/wire/terminalRebind.ts — P-053: where a cable's END may be
// dropped, and what happens to the bindings when it lands.
//
// THE SAME JUDGE AS A FRESH CABLE, and that is the item's one hard
// requirement: "a re-pointed cable that lands somewhere a new cable could not
// is a bug." So this file asks `validateConnectionAtLevel` at
// `currentValidationLevel()` with `connectionVocabulary(scene)` — the exact
// three arguments `wireGesture.ts`'s `commit` passes, imported from it rather
// than restated, because a second nearly-identical vocabulary is how a
// "validated" graph grows edges the gate would have refused
// (`@trunk/editor/README.md` card 23, the failure `portAvailability.ts`'s
// header already quotes from the other direction).
//
// WHY THE SCENE IS READ WITH THE CABLE'S BINDING ALREADY GONE, which looks
// like an accident and is the design: `WireShapeUtil.onHandleDragStart`
// removes the dragged terminal's binding so the end can follow the pointer at
// all, and `sceneFromRecords` omits a half-bound wire outright
// (`document/sceneFromStore.ts:188`, `if (!start || !end) continue`). So the
// board the judge sees is the board WITHOUT this cable — which is precisely
// the board a fresh cable would be judged against. Fan-in counts, duplicate
// checks and cycle checks therefore all answer as they would for a new one,
// and the cable cannot collide with itself.
//
// PLACEMENT (README.md's rule): this renders nothing and touches no DOM, but
// it is not pure either — it reads the editor and writes bindings — so it is
// host code and lives with the shape whose gesture it serves, not in
// `scene/`.
import { type Editor, type TLShapeId, createBindingId } from "tldraw";

import { validateConnectionAtLevel } from "@trunk/scene/validationLevel";

import { currentValidationLevel } from "../../chrome/ShareMenu/validationLevelHost";
import { sceneFromRecords } from "../../document/sceneFromStore";
import { WIRE_BINDING_TYPE } from "../types";
import type { WireBinding } from "./WireBindingUtil";
import { connectionVocabulary } from "./wireGesture";
import type { WireShape } from "./WireShapeUtil";

/** One end of a cable, as a port. */
export interface TerminalTarget {
  nodeId: TLShapeId;
  portId: string;
}

/** The two terminal handles, spelled once. `terminal:` and not `pin:` is what
 *  keeps `pinHandleIndex` from ever reading one as a segment index. */
export const TERMINAL_HANDLE_PREFIX = "terminal:";

export function terminalHandleId(terminal: "start" | "end"): string {
  return `${TERMINAL_HANDLE_PREFIX}${terminal}`;
}

/** `terminal:start` -> `"start"`, anything else -> `null`. Never a
 *  `startsWith` on the bare word: a pin handle must not be read as a
 *  terminal, and vice versa. */
export function terminalOfHandle(handleId: string): "start" | "end" | null {
  if (handleId === terminalHandleId("start")) return "start";
  if (handleId === terminalHandleId("end")) return "end";
  return null;
}

/**
 * How close, in SCREEN px, a dropped end has to come to a dot to land on it.
 *
 * WHY a radius at all, when the press-drag gesture that CREATES a cable
 * requires the pointer to be over the dot's own element
 * (`wireGesture.ts`'s `dotUnderPoint`): the two gestures aim differently. A
 * new cable is dragged BY the dot and released over a target the user is
 * looking straight at; a terminal handle is a ~9px circle the engine paints,
 * dragged by its centre, and the thing under the pointer at release is the
 * handle overlay itself. Asking for an exact element hit there means the
 * common drop — "onto that dot" — misses by three pixels and silently snaps
 * back. tldraw makes the same call for its own handles (`hitTestMargin`), and
 * the generosity is in the same direction: easier to land, never easier to
 * land somewhere ILLEGAL, because the verdict below is unchanged.
 *
 * Screen px rather than page px, divided by the zoom at the call site: a
 * fixed page radius would be a tiny target zoomed out and a huge one zoomed
 * in, which is the bug `hitTestMargin` divides by zoom to avoid.
 */
export const TERMINAL_DROP_RADIUS_PX = 20;

/** A shape that carries measured dot centres. Read structurally, the same way
 *  `wireGeometry.ts`'s `MeasuredAnchors` is, so this file never grows a
 *  per-kind branch — a new kind that measures anchors is a drop target the
 *  day it exists. */
interface MeasuredAnchors {
  anchors?: readonly { portId: string; x: number; y: number }[];
}

/**
 * The port dot nearest `page`, within the drop radius, or `null`.
 *
 * Measured anchors rather than a DOM hit test, deliberately: the anchors ARE
 * the dot centres the host wrote back into the record (ARCHITECTURE.md, "the
 * host measures and writes the result back into the scene as data"), so this
 * answers in page space, needs no document, and can be reasoned about from a
 * record alone. `wireGesture.ts` reads the DOM because its gesture starts
 * from a real `pointerdown` on a real element; this one starts from a
 * geometry point the engine handed us.
 *
 * `exclude` drops the cable's OTHER end from the candidates. Without it a
 * short cable dragged onto itself resolves to the end that is not moving, and
 * the judge would be asked about a self-connection that the user never aimed
 * at — a refusal where a snap-back is the honest answer.
 */
export function portNearPoint(
  editor: Editor,
  page: { x: number; y: number },
  exclude?: TerminalTarget | null,
): TerminalTarget | null {
  const radius = TERMINAL_DROP_RADIUS_PX / editor.getZoomLevel();
  let best: { target: TerminalTarget; distance: number } | null = null;
  for (const shape of editor.getCurrentPageShapes()) {
    const anchors = (shape.props as MeasuredAnchors).anchors;
    if (!anchors || anchors.length === 0) continue;
    const transform = editor.getShapePageTransform(shape.id);
    if (!transform) continue;
    for (const anchor of anchors) {
      if (exclude && exclude.nodeId === shape.id && exclude.portId === anchor.portId) continue;
      const at = transform.applyToPoint({ x: anchor.x, y: anchor.y });
      const distance = Math.hypot(at.x - page.x, at.y - page.y);
      if (distance > radius) continue;
      if (!best || distance < best.distance) best = { target: { nodeId: shape.id, portId: anchor.portId }, distance };
    }
  }
  return best?.target ?? null;
}

/** This wire's bindings, by terminal. */
export function wireBindings(editor: Editor, wireId: TLShapeId): { start?: WireBinding; end?: WireBinding } {
  const all = editor.getBindingsFromShape<WireBinding>(wireId, WIRE_BINDING_TYPE);
  return {
    start: all.find((binding) => binding.props.terminal === "start"),
    end: all.find((binding) => binding.props.terminal === "end"),
  };
}

/** Where a terminal is bound right now, or `null` when it is loose. */
export function boundTarget(editor: Editor, wireId: TLShapeId, terminal: "start" | "end"): TerminalTarget | null {
  const binding = wireBindings(editor, wireId)[terminal];
  return binding ? { nodeId: binding.toId as TLShapeId, portId: binding.props.portId } : null;
}

/**
 * Both ends of the cable this drop would make, in the order the JUDGE says to
 * commit them — or `null` if it refuses.
 *
 * `fixed` is the end that is not moving; `landed` is where the dragged end
 * came down. The candidate is written in the cable's own start→end order so
 * the gesture's own orientation is what the judge is asked about, and then
 * `oriented.ends` is what comes back out: a judge that flips it has decided
 * the dataflow runs the other way and `apply` below writes BOTH bindings
 * accordingly (docs/peps/0002-the-judge-owns-edge-orientation.md — the same
 * read `wireGesture.ts`'s `commit` does, for the same reason).
 */
export function terminalDropVerdict(
  editor: Editor,
  wire: WireShape,
  terminal: "start" | "end",
  landed: TerminalTarget,
): { source: TerminalTarget; target: TerminalTarget } | null {
  const fixed = boundTarget(editor, wire.id, terminal === "start" ? "end" : "start");
  if (!fixed) return null; // a cable with no other end is not a document fact
  const target = editor.getShape(landed.nodeId);
  if (!target) return null;
  // Ask the ENGINE whether this kind can be a cable endpoint at all, exactly
  // as `createWire` and the press-drag gesture do — so a dot painted by a
  // kind that refuses bindings can never take a re-pointed cable either.
  if (!editor.canBindShapes({ fromShape: wire, toShape: target, binding: WIRE_BINDING_TYPE })) return null;

  const scene = sceneFromRecords(editor.store.allRecords());
  const ends =
    terminal === "start"
      ? { source: landed, target: fixed }
      : { source: fixed, target: landed };
  const verdict = validateConnectionAtLevel(
    scene,
    {
      // The wire's OWN id, which is safe for exactly the reason this file's
      // header gives: its dragged binding is already gone, so
      // `sceneFromRecords` has omitted it and there is nothing for the
      // duplicate gate to match it against but OTHER cables. Using the real
      // id means a refusal message names the cable the user is holding.
      id: wire.id,
      source: ends.source.nodeId,
      sourceHandle: ends.source.portId,
      target: ends.target.nodeId,
      targetHandle: ends.target.portId,
    },
    currentValidationLevel(),
    connectionVocabulary(scene),
  );
  if (!verdict.allowed) return null;
  const oriented = verdict.oriented.ends;
  return {
    source: { nodeId: oriented.source as TLShapeId, portId: oriented.sourceHandle ?? "" },
    target: { nodeId: oriented.target as TLShapeId, portId: oriented.targetHandle ?? "" },
  };
}

/**
 * Point the cable at `source` -> `target`, replacing BOTH bindings.
 *
 * WHY both and not just the one that moved: the judge owns orientation, so an
 * allowed drop may come back reversed — and a cable whose `start` binding
 * says one thing while its arrowhead points the other way is a document that
 * contradicts itself. Rewriting the pair from one verdict makes that
 * impossible to express.
 *
 * Inside ONE `editor.run` for `createWire`'s own two reasons: undo (this
 * whole gesture is a single entry under the mark `DraggingHandle` already
 * opened) and `document/editEvents.ts`, which derives one batch per store
 * transaction — so a re-point publishes as one change and not as a removal
 * followed by an addition.
 */
export function applyTerminalDrop(editor: Editor, wire: WireShape, ends: { source: TerminalTarget; target: TerminalTarget }): void {
  const existing = editor.getBindingsFromShape<WireBinding>(wire.id, WIRE_BINDING_TYPE);
  editor.run(() => {
    for (const binding of existing) editor.deleteBinding(binding.id);
    editor.createBindings<WireBinding>([
      { id: createBindingId(), type: WIRE_BINDING_TYPE, fromId: wire.id, toId: ends.source.nodeId, props: { terminal: "start", portId: ends.source.portId } },
      { id: createBindingId(), type: WIRE_BINDING_TYPE, fromId: wire.id, toId: ends.target.nodeId, props: { terminal: "end", portId: ends.target.portId } },
    ]);
  });
}

/** Unbind one terminal so the dragged end can follow the pointer. The
 *  binding's own record is what `wireTerminals` prefers over `props.start` /
 *  `props.end`, so the end cannot move at all while it exists. */
export function releaseTerminal(editor: Editor, wire: WireShape, terminal: "start" | "end"): void {
  const binding = wireBindings(editor, wire.id)[terminal];
  if (binding) editor.deleteBinding(binding.id);
}

/** Put a terminal back on the port it came from — the snap-back a refused or
 *  missed drop takes. A cable with one end is not a document fact
 *  (`WireBindingUtil`'s own rule), so "leave it loose" is not an option. */
export function restoreTerminal(editor: Editor, wire: WireShape, terminal: "start" | "end", to: TerminalTarget): void {
  if (!editor.getShape(to.nodeId)) return;
  if (wireBindings(editor, wire.id)[terminal]) return;
  editor.createBindings<WireBinding>([
    { id: createBindingId(), type: WIRE_BINDING_TYPE, fromId: wire.id, toId: to.nodeId, props: { terminal, portId: to.portId } },
  ]);
}
