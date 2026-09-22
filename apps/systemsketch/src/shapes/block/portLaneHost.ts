// src/shapes/block/portLaneHost.ts — which block rail has its multi-line port
// lane open, as one fact the board agrees on.
//
// P-056. The lane is the trunk's own `PortLaneOverlay`
// (@trunk/components/portEdge.tsx) and until now this app could not open it at
// all, so a person could not add or remove a port anywhere.
//
// WHY THE HOST OWNS THE OPEN BIT RATHER THAN `PortEdge`'s OWN ARMING, which
// is the shape F-1 built and the cheaper thing to reach for: arming
// (`editing`) makes a CLICK ON A PORT open the lane, and that click is
// already spent here. `PortEdgeSlotBox`'s capture listener calls
// `stopPropagation`, so an armed rail's click never reaches the port's own
// label — and a click on a rail label is exactly what opens the single-line
// rename this app shipped as P-037 (`src/railLabel.smoke.test.tsx` is its
// committed acceptance). Arming would have bought the lane a trigger by
// taking away a better one.
//
// So the trigger is the gesture this app had genuinely left free: a click on
// the DOT. `shapes/wire/wireGesture.ts` says so itself — "a press that goes
// nowhere is a CLICK, and a click on a dot is nothing" — and it is the one
// place on the board that already resolves an element to `{nodeId, portId}`
// correctly, through the trunk's own `data-port-id`/`data-block-id` stamps.
// Turning its documented no-op into this request is a two-line change there
// and needs no second hit-test to drift from the first.
//
// ONE lane at a time, board-wide: the overlay is a floating CodeEditor that
// takes focus, and two of them would fight over it and over the Escape key.
// Clicking a DIFFERENT dot therefore moves the lane rather than opening a
// second one, and clicking the SAME dot again puts it away — which matters
// because every other exit the lane has (Escape, Ctrl+Enter) is a key, and a
// pointer needs one too.
import { atom, type Atom, type Editor, type TLShapeId } from "tldraw";

/** The dot that was clicked. The SIDE is deliberately not carried: a block
 *  knows which of its walls owns a port id, and a request that named a side
 *  could disagree with the record it is about. */
export interface PortLaneRequest {
  nodeId: TLShapeId;
  portId: string;
}

// Per-EDITOR, not a module singleton, for the reason `wireGesture.ts`'s own
// atoms are: the smoke suite mounts and unmounts an `<App/>` per test, and a
// lane left open on a dead board must not arrive on the next one.
const BY_EDITOR = new WeakMap<Editor, Atom<PortLaneRequest | null>>();

/** Which rail's lane is open on this editor, or `null`. */
export function portLaneRequest(editor: Editor): Atom<PortLaneRequest | null> {
  let existing = BY_EDITOR.get(editor);
  if (!existing) {
    existing = atom<PortLaneRequest | null>("ss-block port lane", null);
    BY_EDITOR.set(editor, existing);
  }
  return existing;
}

/** Is this exact dot the one whose lane is open right now? */
export function portLaneIsOpenAt(editor: Editor, request: PortLaneRequest): boolean {
  const current = portLaneRequest(editor).get();
  return current !== null && current.nodeId === request.nodeId && current.portId === request.portId;
}

/**
 * Open a rail's lane, or close whatever is open (`null`).
 *
 * WHY THE CALLER PASSES THE ANSWER RATHER THAN THIS FUNCTION TOGGLING, which
 * is what it did first and what looks obviously simpler: by the time a click
 * COMPLETES, the lane it was meant to toggle has already been closed by
 * somebody else. `PortEdge` closes the rail-wide lane on a capture-phase
 * POINTERDOWN over any port card, deliberately — that is how it stops one
 * press from both editing the shared document and starting a reorder drag
 * (portEdge.tsx, the `onPointerDownCapture` beside `port-edge-card`). A port
 * dot lives inside a card, so pressing one closes the lane before the pointer
 * comes up, and a toggle read at pointer-UP always sees "closed" and always
 * re-opens. Measured 2026-09-21: clicking the same dot twice re-mounted the
 * lane instead of putting it away. So the gesture snapshots
 * `portLaneIsOpenAt` at pointer-DOWN — before anyone can react to the press —
 * and states the result here.
 */
export function setPortLane(editor: Editor, request: PortLaneRequest | null): void {
  portLaneRequest(editor).set(request);
}
