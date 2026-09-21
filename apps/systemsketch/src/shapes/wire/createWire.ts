// src/shapes/wire/createWire.ts — the ONE constructor for a data line.
//
// A wire shape plus its two bindings, created inside ONE `editor.run`. That
// single transaction is load-bearing twice over:
//   - undo: Ctrl+Z removes the whole cable, not a shape with two orphan
//     bindings behind it;
//   - the edit-event seam: `src/document/editEvents.ts` derives one batch per
//     store transaction, so a wire and its bindings arriving together become
//     exactly ONE `wire.added` with both ends resolved — which is what
//     `src/document/editEvents.test.ts` asserts and what stream 3 (pyblocks)
//     will read.
//
// There is no `variant: "control"` and there never will be: control flow is
// containment and arms, never a cable (plan §2).
import { createBindingId, createShapeId, type Editor, type TLShapeId } from "tldraw";

import type { WireEnd } from "../../document/editEvents";
import { WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../types";
import type { WireBinding } from "./WireBindingUtil";
import type { WireShape, WireShapeProps } from "./WireShapeUtil";

export interface CreateWireOptions {
  from: WireEnd;
  to: WireEnd;
  /** Every style field is OPTIONAL and omitted means "whatever
   *  `WireShapeUtil.getDefaultProps` says" — a gesture that states none gets
   *  Zach's datum (`variant: "data"`, `routing: "elbow"`, no colour).
   *
   *  WHY `routing` and `color` are here at all, when the press-drag gesture
   *  never sets either: `applySceneDiff.ts` re-creates a cable whose ENDS
   *  moved, and a constructor that could only carry `variant` silently
   *  answered a caller's `routing: "straight"` with the default elbow and its
   *  `color` with `""` (measured 2026-09-19). A constructor that cannot state
   *  the whole shape is a constructor its callers have to patch up
   *  afterwards, in a second transaction, which is exactly the undo story the
   *  single `editor.run` below exists to prevent. */
  variant?: WireShapeProps["variant"];
  routing?: WireShapeProps["routing"];
  color?: string;
  /** Stock `shape.meta`, verbatim.
   *
   *  WHY a constructor takes it rather than the caller patching it on
   *  afterwards: `applySceneDiff.ts` tags what it creates so a later apply can
   *  tell its own cables from the person's, and a second `updateShape` would
   *  put that tag in a different store transaction from the shape it
   *  describes — which is exactly the split `editor.run` below exists to
   *  prevent, and would publish the cable on the edit-event seam once as an
   *  untagged `wire.added` and again as a change. */
  meta?: Record<string, string>;
}

/**
 * Wire `from` to `to`, or `null` if either end refuses the binding.
 *
 * The refusal is asked of the ENGINE (`editor.canBindShapes`), which routes
 * to each target's own `ShapeUtil.canBind` — the same wall
 * `documentModel.test.ts` interrogates directly (`ss-block` yes, `ss-port`
 * yes, `ss-region` no, `ss-code` no). Asking the engine rather than listing
 * the bindable types here is what keeps "never mix data and control lines"
 * a property of the shape kinds instead of a list this file could forget to
 * update when L5 lands.
 *
 * This is deliberately NOT where the graph rules live. Whether a connection
 * is sensible — self-connection, fan-in, type mismatch — is
 * `@trunk/scene/edgeValidation.ts`'s `validateConnection`, asked by the
 * gesture before it ever calls this (`wireGesture.ts`). One gate, at the
 * gesture; this function is the constructor behind it.
 */
export function createWire(editor: Editor, options: CreateWireOptions): TLShapeId | null {
  const fromShape = editor.getShape(options.from.nodeId as TLShapeId);
  const toShape = editor.getShape(options.to.nodeId as TLShapeId);
  if (!fromShape || !toShape) return null;
  const bindable = (target: typeof fromShape) =>
    editor.canBindShapes({ fromShape: { type: WIRE_SHAPE_TYPE }, toShape: target, binding: WIRE_BINDING_TYPE });
  if (!bindable(fromShape) || !bindable(toShape)) return null;

  // Only the fields the caller actually stated: naming a key with `undefined`
  // would still land in the record and defeat `getDefaultProps`.
  const props: Partial<WireShapeProps> = {
    ...(options.variant ? { variant: options.variant } : {}),
    ...(options.routing ? { routing: options.routing } : {}),
    ...(options.color ? { color: options.color } : {}),
  };

  const id = createShapeId();
  editor.run(() => {
    editor.createShape<WireShape>({
      id,
      type: WIRE_SHAPE_TYPE,
      // WHY the page is named explicitly rather than left to tldraw's
      // "parent under the point" default: a wire is never a member. An
      // expanded block already refuses one
      // (`BlockShapeUtil.canReceiveNewChildrenOfType`), but a cable created
      // over a frame would otherwise be re-based into that frame's
      // coordinates, and `WireFace`'s whole geometry rests on shape space
      // being page space.
      parentId: editor.getCurrentPageId(),
      x: 0,
      y: 0,
      ...(Object.keys(props).length > 0 ? { props } : {}),
      ...(options.meta ? { meta: options.meta } : {}),
    });
    editor.createBindings<WireBinding>([
      { id: createBindingId(), type: WIRE_BINDING_TYPE, fromId: id, toId: fromShape.id, props: { terminal: "start", portId: options.from.portId } },
      { id: createBindingId(), type: WIRE_BINDING_TYPE, fromId: id, toId: toShape.id, props: { terminal: "end", portId: options.to.portId } },
    ]);
  });
  return id;
}
