// src/shapes/wire/wireGesture.ts — a wire is a PRESS-DRAG FROM A DOT.
//
// There is no wire TOOL and there never will be (src/shapes/types.ts says so
// where the tool ids live): arming a mode and then drawing is what a
// whiteboard does with a line, and a cable is not a line — it is a statement
// about two ports. So the gesture starts on the thing it is about.
//
// This file is `wireKit.install`, run once from the app's `onMount`
// (src/App.tsx) and torn down by the function it returns.
//
// GESTURE OWNERSHIP (ARCHITECTURE.md, "Where an interaction belongs"): a
// gesture bounded by one component's box is the COMPONENT's; a gesture
// spanning the canvas is the HOST's. A press on a port dot LOOKS bounded and
// is not — it ends wherever the pointer ends, possibly on another shape,
// possibly on empty canvas — so it is the host's, and this is the host.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THE IN-FLIGHT CABLE IS NOT A SHAPE, against this lane's own brief
// (which asked for "a provisional wire with the start binding and a loose
// end"). It was built that way first, and then measured, 2026-09-19:
//
//   tldraw renders the shapes layer sorted by ID, not by z-order —
//   `Editor.getRenderingShapes` is literally `renderingShapes.sort(sortById)`
//   (@tldraw/editor), because a stable DOM order is what stops a z-order
//   change from remounting every shape's React tree. So a shape created
//   mid-gesture lands at whatever position its RANDOM id sorts to, and every
//   sibling after it shifts one place in `.tl-shapes`.
//
//   Measured, on a failing run: `[block-a, provisional-wire, block-b]`, ids
//   `3bAIh…`, `BNqL9…`, `nMyw9…` — sorted, wire in the middle. The acceptance
//   test's Playwright locator for block b's dot is a POSITIONAL path
//   (`div:nth-child(2) > .tl-html-container > …`) generated before the press;
//   after the press it names the wire's div, which owns no port dot, and the
//   drag times out 30s later having never reached its target. Red or green
//   run to run purely on how three random ids happened to sort — it took
//   every case of the suite in turn.
//
// So the in-flight cable is painted in the OVERLAY instead
// (`components.InFrontOfTheCanvas` via this kit's `Overlay`), where it is not
// a sibling of the shapes and cannot renumber them. Three things get better
// for free, and one gets worse:
//   + an abandoned drag writes NOTHING to the document, so the edit-event
//     stream (`src/document/editEvents.ts`) never carries a `wire.added` for
//     a cable nobody made;
//   + no `history: "ignore"` gymnastics to keep a provisional record off the
//     undo stack;
//   + `sceneFromRecords` never has to see a half-bound wire.
//   − the in-flight paint is a second renderer beside `WireFace` (it works in
//     SCREEN space, because `InFrontOfTheCanvas` is not camera-transformed),
//     so the two could drift. They are kept honest by sharing every input:
//     the same `portTerminal`, the same `Trace`, the same
//     `WIRE_TERMINAL_GAP`.
import { atom, type Atom, type Editor, type TLShape, type TLShapeId } from "tldraw";

import type { TraceTerminalSpec } from "@trunk/components/trace.layout";
import type { PortDirection } from "@trunk/scene/lint";
import { validateConnectionAtLevel, type ValidationVocabulary } from "@trunk/scene/validationLevel";
import { portTypeOfDeclaration } from "@trunk/scene/portDeclaration";

import { sceneFromRecords, type DocumentScene } from "../../document/sceneFromStore";
import { portTypesOfScene } from "../../document/sceneVocabulary";
import { currentValidationLevel } from "../../chrome/ShareMenu/validationLevelHost";
import type { WireEnd } from "../../document/editEvents";
import { PORT_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../types";
import { createWire } from "./createWire";
import { portTerminal } from "./wireGeometry";

/** How far the pointer must travel before a press counts as a drag. Below it,
 *  a press on a dot is a CLICK and a click on a dot is nothing — never a
 *  zero-length cable the user then has to find and delete. */
const DRAG_THRESHOLD_PX = 3;

/** The id the judge sees for a cable that does not exist yet. It is never
 *  persisted: `validateConnection` needs a candidate to carry an id so its
 *  refusal messages can name one, and the real shape id is minted by
 *  `createWire` only after the verdict is in. */
const CANDIDATE_EDGE_ID = "ss-wire-candidate";

/* ------------------------------------------------------------------ */
/* What the overlay paints and offers                                  */
/* ------------------------------------------------------------------ */

/** A cable being dragged, in PAGE space. `./WireFace.tsx`'s `InFlightWire` is
 *  the only reader. */
export interface WireDragState {
  /** The anchored end's dot, as a terminal — position AND flow tangent. */
  anchor: TraceTerminalSpec;
  /** Where the pointer is now. */
  pointer: { x: number; y: number };
}

/**
 * "A cable that landed on nothing is a question, not a mistake"
 * (@trunk/editor/README.md, card 14). This is that question, published for
 * `./dropMenu.tsx` to render.
 */
export interface PendingEdgeDrop {
  /** Where the loose end landed, in px relative to the editor container —
   *  the frame `EdgeDropMenu` places itself against, and the frame
   *  `components.InFrontOfTheCanvas` mounts in (`.tl-canvas__in-front` is
   *  `position: absolute; inset: 0` on the container). */
  anchor: { x: number; y: number };
  /** The same landing, in PAGE space — where a picked node gets created. */
  page: { x: number; y: number };
  /** The end that IS bound. The offer exists to find the other one. */
  from: WireEnd;
  /** What a picked entry has to supply to answer this cable. */
  want: { direction: PortDirection; types?: readonly string[] };
}

interface WireOverlayState {
  drag: Atom<WireDragState | null>;
  drop: Atom<PendingEdgeDrop | null>;
}

/**
 * WHY these atoms are per-EDITOR and not module singletons: two `<App/>`s can
 * share one module graph — the smoke suite mounts and unmounts one per test,
 * and a story could show two boards side by side. tldraw's own guidance says
 * the same thing about its state ("instead of stored in a global atom can
 * prevent issues with state being shared between editors", @tldraw/editor).
 * A `WeakMap` keyed by the editor means an unmounted board's in-flight cable
 * is collectable rather than leaking into the next one.
 */
const OVERLAY_BY_EDITOR = new WeakMap<Editor, WireOverlayState>();

function overlayState(editor: Editor): WireOverlayState {
  let existing = OVERLAY_BY_EDITOR.get(editor);
  if (!existing) {
    existing = {
      drag: atom<WireDragState | null>("ss-wire in flight", null),
      drop: atom<PendingEdgeDrop | null>("ss-wire pending drop", null),
    };
    OVERLAY_BY_EDITOR.set(editor, existing);
  }
  return existing;
}

/** The cable currently being dragged on this editor, or `null`. */
export function wireDrag(editor: Editor): Atom<WireDragState | null> {
  return overlayState(editor).drag;
}

/** The offer a loose end left behind on this editor, or `null`. */
export function pendingEdgeDrop(editor: Editor): Atom<PendingEdgeDrop | null> {
  return overlayState(editor).drop;
}

/* ------------------------------------------------------------------ */
/* Reading the document                                                */
/* ------------------------------------------------------------------ */

interface DotRef {
  nodeId: TLShapeId;
  portId: string;
}

/**
 * Which port dot is under this element, by the DOM contracts the TRUNK
 * stamps — `[data-slot="port-dot"]` inside `[data-port-id]` inside
 * `[data-block-id]`, the same three `@trunk/hosts/portDotSightings.ts` reads
 * to measure anchors. `data-block-id` carries the tldraw shape id because
 * `BlockFace` passes `id={shape.id}` to `BlockPort`; that is the whole reason
 * a DOM reading can name a document record here.
 *
 * NOT handled yet, and it would be silent if it were not written down: a
 * COLLAPSED rail renders one stand-in dot carrying `data-collapsed-ports`
 * (a comma list) instead of one `[data-port-id]` per port. `sightPortDots`
 * already resolves those; wiring FROM one needs a disambiguation the gesture
 * has no UI for, so a press on a collapsed stand-in currently starts no
 * cable. Owed: either a menu on the stand-in, or "expand, then wire".
 */
function dotRefFrom(element: Element | null | undefined): DotRef | null {
  const dot = element?.closest('[data-slot="port-dot"]');
  if (!dot) return null;
  const portId = dot.closest("[data-port-id]")?.getAttribute("data-port-id");
  const nodeId = dot.closest("[data-block-id]")?.getAttribute("data-block-id");
  if (!portId || !nodeId) return null;
  return { nodeId: nodeId as TLShapeId, portId };
}

/**
 * The port dot under a client point, looking THROUGH whatever else is stacked
 * there.
 *
 * `elementsFromPoint` (plural) rather than `elementFromPoint`: the topmost
 * element at a dot's centre is not always the dot. A wire's own `Trace` puts
 * a 12px transparent hit path over the dot it ends at the moment
 * `interactive` is switched on, a badge rides the middle of a cable, and L4's
 * chrome will stack more. Asking only the top element makes the drop fail
 * silently — the gesture would end, the in-flight cable would vanish, and
 * nothing would say why. Walking the stack asks the question actually being
 * asked: is there a dot here?
 */
function dotUnderPoint(doc: Document, clientX: number, clientY: number): DotRef | null {
  for (const element of doc.elementsFromPoint(clientX, clientY)) {
    const ref = dotRefFrom(element);
    if (ref) return ref;
  }
  return null;
}

/** Every port id a node declares — the vocabulary `dangling-edge` checks a
 *  candidate against. Derived from the SCENE rather than the shape so the
 *  judge and the projection can never disagree about what a node's ports are. */
function portsOfScene(scene: DocumentScene): (nodeId: string) => readonly string[] | undefined {
  const byNode = new Map<string, string[]>();
  for (const node of scene.nodes) {
    const ports = node.data.ports;
    byNode.set(node.id, ports ? Object.values(ports).flatMap((ids) => ids ?? []) : node.data.kind === "port" ? ["port"] : []);
  }
  return (nodeId) => byNode.get(nodeId);
}

/**
 * What this board KNOWS about its own ports — the vocabulary the judge reads.
 * Which of the judge's gates actually run is not here: that is the chosen
 * level's answer, and `validateConnectionAtLevel` takes it separately.
 *
 * WHAT HAPPENED TO `allowFanIn: true`, because it was a stated taste and not a
 * convenience. It read: `@trunk/components/wiring.ts:20-22` says "draw as many
 * wires as you want... even multiple wires between the same two ports...
 * nothing here validates", `DUPLICATE_FAN_PX` exists so several cables into
 * one dot stay visibly several, and `src/wiring.smoke.test.tsx` holds it as an
 * assertion. That intent is PRESERVED, not deleted — it now lives at the two
 * rungs where it is the user's own answer: `whiteboard` and `guided` both
 * carry `allowFanIn: true` (`scene/validationLevel.ts`), and `guided` is the
 * shipped default, so the board a person opens without ever touching Settings
 * still takes as many cables into a dot as they draw. `typed` and `strict`
 * turn it off, and that is the whole point of choosing them — "each input
 * takes one producer" is the sentence the settings row prints for `typed`.
 * Hardcoding it here OVERRODE that choice, which is the bug ruling 3 names.
 *
 * `typeOf` IS now supplied, and the same reasoning governs it. It used to be
 * withheld so `type-mismatch` could never gate — Zach, 2026-09-17: "by default
 * I think everything should connect and everything after that should have a
 * reason... Whether we choose to display that reason, allow it in an error
 * state or not allow it at all, is a later decision that can be made." Ruling 3
 * IS that later decision, and it is a dial rather than a verdict: at
 * `whiteboard` and `guided` the level withholds this resolver itself
 * (`vocabularyForLevel`, `types: "off"`), so a mismatched cable is still drawn
 * and still only annotated at rest. At `typed` and `strict` the user has asked
 * for prevention and gets it.
 *
 * `portsOf` is unconditional, because `dangling-edge` is structural: a
 * candidate naming a port no node has is not a taste question, and it is the
 * one gate no rung can switch off.
 */
export function connectionVocabulary(scene: DocumentScene): ValidationVocabulary {
  return { portsOf: portsOfScene(scene), typeOf: portTypesOfScene(scene) };
}

/**
 * What a loose end is asking a catalog for.
 *
 * An `ss-port` declares its own `direction`, so the answer is exact: an `in`
 * port needs something that EMITS. A block's ports declare no direction at
 * all (a block's port is `{id, declaration}` — ruling 8), so there is nothing
 * to invert and the honest default is "find me a consumer": dragging out of a
 * block reads as "and then this goes to…". Stated as a call rather than a
 * fact, because the day `ss-block` ports carry a direction this function is
 * the one place that changes.
 */
function wantFor(editor: Editor, ref: DotRef): PendingEdgeDrop["want"] {
  const shape = editor.getShape(ref.nodeId);
  if (!shape) return { direction: "sink" };
  const props = shape.props as { direction?: string; declaration?: string };
  if (shape.type === PORT_SHAPE_TYPE) {
    const declared = portTypeOfDeclaration(props.declaration ?? "");
    return {
      direction: props.direction === "in" ? "source" : "sink",
      ...(declared === undefined ? {} : { types: [declared] }),
    };
  }
  const declared = blockPortType(shape, ref.portId);
  return { direction: "sink", ...(declared === undefined ? {} : { types: [declared] }) };
}

/** The declared datatype of one of a block's ports, PARSED out of its one
 *  declaration line (ruling 8 — there is no second field to read), or
 *  `undefined` when it states none: the same "undefined = unknown, no
 *  judgement" reading `sceneFromRecords` applies. */
function blockPortType(shape: TLShape, portId: string): string | undefined {
  const ports = (shape.props as { ports?: Record<string, { id: string; declaration: string }[]> }).ports;
  if (!ports) return undefined;
  for (const side of Object.values(ports)) {
    const found = side.find((port) => port.id === portId);
    if (found) return portTypeOfDeclaration(found.declaration);
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* The gesture                                                         */
/* ------------------------------------------------------------------ */

interface ActiveDrag {
  pointerId: number;
  from: DotRef;
  /** Where the press landed, in client px. The drop is judged against this
   *  and nothing else — see `finish`. */
  origin: { x: number; y: number };
}

export function installWireGesture(editor: Editor): () => void {
  const container = editor.getContainer();
  const doc = container.ownerDocument;
  const { drag: dragAtom, drop: dropAtom } = overlayState(editor);
  let drag: ActiveDrag | null = null;

  const pagePointOf = (event: PointerEvent) => editor.screenToPage({ x: event.clientX, y: event.clientY });

  const onPointerDown = (event: PointerEvent) => {
    if (drag || event.button !== 0) return;
    const ref = dotRefFrom(event.target as Element | null);
    if (!ref) return;
    const shape = editor.getShape(ref.nodeId);
    if (!shape) return;
    // Ask the ENGINE whether this kind can be a cable endpoint at all, so a
    // dot rendered by a kind that refuses bindings can never start a wire
    // that `createWire` would then silently drop.
    if (!editor.canBindShapes({ fromShape: { type: WIRE_SHAPE_TYPE }, toShape: shape, binding: WIRE_BINDING_TYPE })) return;
    // The anchored dot has to be MEASURED before a cable can leave it: with
    // no anchor there is no point to draw from, and guessing one is exactly
    // the failure `portTerminal`'s `null` exists to prevent.
    const anchor = portTerminal(editor, ref.nodeId, ref.portId, "start");
    if (!anchor) return;

    // TWO different jobs, and both are needed.
    //
    // `markEventAsHandled` hides the press from TLDRAW — the device the
    // archive settled on (src/blocks/memberStackDnd.tsx:485) and the one
    // `shapes/shared/pointerOwnership.ts` already documents: `stopPropagation`
    // on a wrapper breaks a child's own pointer capture, marking does not.
    //
    // `stopPropagation` hides it from the RAIL. A port dot lives inside
    // `PortEdge`'s dnd-kit sortable (`@trunk/components/portEdge.tsx:824`,
    // `PointerSensor` with a 4px activation constraint), whose activation
    // listener is a React BUBBLE handler at the React root — i.e. strictly
    // after this capture-phase listener on the container. Stopping here is
    // what prevents one press from starting a reorder drag and a wire drag at
    // once. This is the case `pointerOwnership.ts`'s trade-off note is about
    // from the other side: the rail owns a press on the RAIL, this owns a
    // press on a DOT, and a dot is not a reorder handle.
    editor.markEventAsHandled(event);
    event.stopPropagation();

    const page = pagePointOf(event);
    drag = { pointerId: event.pointerId, from: ref, origin: { x: event.clientX, y: event.clientY } };
    dropAtom.set(null);
    dragAtom.set({ anchor, pointer: { x: page.x, y: page.y } });
  };

  // Paint only. Whether this press BECOMES a cable is decided in `finish`,
  // from the pointer's own release position — never from whether these fired.
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const page = pagePointOf(event);
    const live = dragAtom.get();
    if (live) dragAtom.set({ ...live, pointer: { x: page.x, y: page.y } });
  };

  const finish = (event: PointerEvent, cancelled: boolean) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const active = drag;
    drag = null;
    dragAtom.set(null);
    if (cancelled) return;
    // WHY the travel is measured HERE, from the press point to the release
    // point, instead of being accumulated by the move handler: a `moved` flag
    // set in `pointermove` makes the whole gesture depend on intermediate
    // events being delivered, and they are not guaranteed — a synthesised or
    // coalesced drag can go down, jump and come up with no move in between.
    // The release point is a fact the `pointerup` itself carries, so this
    // reading cannot be missed. Same rule either way: a press that goes
    // nowhere is a CLICK, and a click on a dot is nothing.
    if (Math.hypot(event.clientX - active.origin.x, event.clientY - active.origin.y) <= DRAG_THRESHOLD_PX) return;

    const landed = dotUnderPoint(doc, event.clientX, event.clientY);
    if (landed) {
      commit(active.from, landed);
      return;
    }
    const page = pagePointOf(event);
    // Landed on a shape but not on a dot — a block's body, a code cell. That
    // is a miss, not a question: the user aimed at something and got its
    // middle. Offering a "create a node here" menu on top of the node they
    // were aiming at would be noise.
    if (editor.getShapesAtPoint(page, { hitInside: true }).length > 0) return;
    const rect = container.getBoundingClientRect();
    dropAtom.set({
      anchor: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      page: { x: page.x, y: page.y },
      from: { nodeId: active.from.nodeId, portId: active.from.portId },
      want: wantFor(editor, active.from),
    });
  };

  /**
   * ONE gate, at the gesture — `@trunk/editor/README.md`'s card 23 rule, and
   * the reason `dropMenu.tsx` asks the same `validateConnection` rather than
   * a filter of its own: JointJS's `Connect` tool skips `validateMagnet`
   * where its raw press gates it, and that is how a "validated" graph grows
   * invalid edges.
   *
   * The verdict's ORIENTATION is used, not the gesture's order
   * (docs/peps/0002-the-judge-owns-edge-orientation.md): a person drags from
   * whichever end they touched first, and that is not the dataflow direction.
   * Today no port declares a direction so the judge answers `by: "gesture"`
   * and the order stands — but reading `oriented.ends` means the day one
   * does, nothing here changes.
   */
  function commit(from: DotRef, to: DotRef) {
    const scene = sceneFromRecords(editor.store.allRecords());
    // Ruling 3's gate, read at pointer-up rather than at install: the level is
    // a module store (`chrome/ShareMenu/validationLevelHost.ts`) precisely so a
    // change in the Settings dialog governs the very next cable, with no
    // reload and nothing to re-install.
    const verdict = validateConnectionAtLevel(
      scene,
      { id: CANDIDATE_EDGE_ID, source: from.nodeId, sourceHandle: from.portId, target: to.nodeId, targetHandle: to.portId },
      currentValidationLevel(),
      connectionVocabulary(scene),
    );
    // A refusal is silent for now, and that is a gap with an owner rather
    // than a decision: `verdict.refusal` is already `Diagnostic`-shaped, so
    // surfacing it is "mint an id and it IS one" — and where it surfaces (a
    // toast, the problems panel, a red flash on the dot) is L4's chrome, not
    // this lane's.
    if (!verdict.allowed) return;
    const ends = verdict.oriented.ends;
    editor.markHistoryStoppingPoint("connect");
    createWire(editor, {
      from: { nodeId: ends.source, portId: ends.sourceHandle ?? "" },
      to: { nodeId: ends.target, portId: ends.targetHandle ?? "" },
    });
  }

  const onPointerUp = (event: PointerEvent) => finish(event, false);
  const onPointerCancel = (event: PointerEvent) => finish(event, true);

  container.addEventListener("pointerdown", onPointerDown, { capture: true });
  // Move/up ride the DOCUMENT, not the container: a drag that leaves the
  // canvas (over the dock, off the window) must still end, and end once.
  doc.addEventListener("pointermove", onPointerMove, { capture: true });
  doc.addEventListener("pointerup", onPointerUp, { capture: true });
  doc.addEventListener("pointercancel", onPointerCancel, { capture: true });

  return () => {
    container.removeEventListener("pointerdown", onPointerDown, { capture: true });
    doc.removeEventListener("pointermove", onPointerMove, { capture: true });
    doc.removeEventListener("pointerup", onPointerUp, { capture: true });
    doc.removeEventListener("pointercancel", onPointerCancel, { capture: true });
    // An unmount mid-drag leaves nothing behind: there was never a record to
    // clean up, but the in-flight paint and the offer would otherwise outlive
    // the board they were made on.
    dragAtom.set(null);
    dropAtom.set(null);
    drag = null;
  };
}
