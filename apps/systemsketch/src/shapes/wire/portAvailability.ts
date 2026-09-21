// src/shapes/wire/portAvailability.ts — P-005: which dots are legal targets
// for the cable currently in flight, published for the FACES to paint.
//
// Zach's rule, quoted in the trunk's own `scene/availability.ts`: "Show the
// legal move set during the gesture, not the error after it... Drag time
// validity preview! actually even langflow has this. yes 100% lets implement
// this feature... should be on by default!"
//
// NOTHING IS COMPUTED HERE. The map is `@trunk/scene/availability`'s
// `connectionAvailability`, a pure `f(scene, from) -> verdict per port`, and
// the JUDGE it is given is the very same `validateConnectionAtLevel` call the
// DROP runs (`./wireGesture.ts`'s `commit`). That identity is the whole point:
// a highlight computed by a second, nearly-identical rule is a highlight that
// eventually lies about what the drop will accept, and a preview that lies is
// worse than no preview.
//
// ONCE PER GESTURE, BY CONTRACT, not per pointermove. That is the trunk
// file's own [OBSERVATION WINS] finding, derived from JointJS's lifecycle
// (`_markAvailableMagnets` at drag-start, `_unmarkAvailableMagnets` at
// drag-end) — see its header. `./wireGesture.ts` sets this atom in
// `pointerdown` and clears it in `finish`; `onPointerMove` never touches it.
//
// WHY THE ATOM LIVES IN ITS OWN MODULE rather than beside the other two in
// `./wireGesture.ts`: the faces (`shapes/block/BlockFace.tsx`,
// `shapes/port/PortFace.tsx`) have to read it, and `wireGesture.ts` reaches
// `createWire` and the document scene — importing it from a face would draw a
// block's paint into the cable-creation graph and risk the module cycle
// `./index.ts`'s own header records being bitten by. This file imports tldraw
// and two pure trunk functions and nothing else in the app.
import { atom, type Atom, type Editor, type TLShapeId } from "tldraw";

import type { PortAvailability } from "@trunk/scene/availability";
import { portKey } from "@trunk/scene/scene";

/** What `Port`/`LabeledPort` take as their `availability` prop. */
export type PortAvailabilityPaint = "available" | "unavailable";

/** Every enumerable port on the board, judged against the cable in flight —
 *  keyed by `portKey(nodeId, portId)`. `null` when no cable is in flight. */
export type WireAvailabilityMap = ReadonlyMap<string, PortAvailability>;

/** Per-EDITOR, for the reason `./wireGesture.ts`'s `OVERLAY_BY_EDITOR` note
 *  gives: two `<App/>`s can share one module graph, and an unmounted board's
 *  gesture state must be collectable rather than leak into the next one. */
const BY_EDITOR = new WeakMap<Editor, Atom<WireAvailabilityMap | null>>();

export function wireAvailability(editor: Editor): Atom<WireAvailabilityMap | null> {
  let existing = BY_EDITOR.get(editor);
  if (!existing) {
    existing = atom<WireAvailabilityMap | null>("ss-wire eligible ports", null);
    BY_EDITOR.set(editor, existing);
  }
  return existing;
}

/**
 * How one dot should paint right now, or `undefined` for "no opinion" — which
 * is both "no cable is in flight" and "this is the dot the cable is coming
 * FROM".
 *
 * WHY the source dot is `undefined` rather than `"available"`: it is not a
 * target, and painting it with the eligible ring would say a cable may end
 * where it began. `connectionAvailability` already omits it (it skips
 * `fromKey`), so this function has nothing to special-case — the absence IS
 * the answer, and it is recorded here so a future reader does not "fix" it.
 *
 * WHY a port the board cannot enumerate is also `undefined`: the trunk's
 * kit-wide "undefined = unknown, no judgement" convention. Dimming a dot
 * because the vocabulary could not describe it would present ignorance as a
 * verdict.
 */
export function availabilityAt(map: WireAvailabilityMap | null, nodeId: TLShapeId, portId: string): PortAvailabilityPaint | undefined {
  if (!map) return undefined;
  const found = map.get(portKey(nodeId, portId));
  if (!found) return undefined;
  return found.verdict.allowed ? "available" : "unavailable";
}
