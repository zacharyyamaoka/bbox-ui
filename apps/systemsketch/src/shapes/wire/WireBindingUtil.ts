// src/shapes/wire/WireBindingUtil.ts — `ss-wire-binding`: which PORT a
// wire's terminal landed on, as a first-class record.
//
// The pattern is the one both tldraw starter kits use and
// docs/TLDRAW-STARTER-KITS.md:169-206 records: "a connection is a custom
// shape AND two real bindings" — one binding per terminal, each naming the
// port id it landed on, and the shape's own `start`/`end` props used ONLY
// while a terminal is unbound. The binding stores IDENTITY (which node,
// which port), never a position: a position would drift on every drag and
// would make a saved board's wiring a coordinate comparison rather than a
// fact (the same reasoning `@trunk/scene/sceneDiff.ts`'s header quotes from
// its own donor: "so a coordinate diff would call every dragged board a
// rewiring").
//
// NEVER MIX DATA AND CONTROL LINES (plan §2) is enforced at this seam and
// at two others. Here: `fromId` is always an `ss-wire` and `toId` is only
// ever a shape whose own util says `canBind` — `ss-block` and `ss-port` say
// yes, `ss-region` and `ss-code` say no, so a region can never become a
// cable endpoint. The other two seams are `WireShapeUtil.canBind` (a wire is
// never an endpoint either) and `sceneFromRecords` (containment is never an
// edge).
import {
  BindingUtil,
  T,
  createBindingPropsMigrationSequence,
  type BindingOnShapeDeleteOptions,
  type BindingOnShapeIsolateOptions,
  type TLBaseBinding,
} from "tldraw";

import { WIRE_BINDING_TYPE } from "../types";

export interface WireBindingProps {
  terminal: "start" | "end";
  portId: string;
}

declare module "@tldraw/tlschema" {
  interface TLGlobalBindingPropsMap {
    "ss-wire-binding": WireBindingProps;
  }
}

export type WireBinding = TLBaseBinding<"ss-wire-binding", WireBindingProps>;

export class WireBindingUtil extends BindingUtil<WireBinding> {
  static override type = WIRE_BINDING_TYPE;

  static override props = {
    terminal: T.literalEnum("start", "end"),
    portId: T.string,
  };

  // Version 0, declared now for the reason BlockShapeUtil records: the
  // sequence is what gives these props a version number in a saved file, and
  // it cannot be retrofitted once boards exist.
  static override migrations = createBindingPropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): Partial<WireBindingProps> {
    // `start` is the SOURCE; the arrowhead is at `end` (plan §3).
    return { terminal: "start", portId: "" };
  }

  /**
   * Deleting a node deletes every cable bound to it.
   *
   * WHY the wire goes rather than the binding alone (the rule
   * docs/TLDRAW-STARTER-KITS.md:196 lists as `onBeforeDeleteToShape`): a wire
   * without an end is not a document fact. `sceneFromRecords` already omits a
   * half-bound wire — "skipped, not guessed at" — so leaving the shape behind
   * would leave a record that paints a loose cable nobody dragged and that no
   * consumer can read. `src/wiring.smoke.test.tsx` asserts exactly this:
   * delete a bound block and the wire is gone with it.
   *
   * The tempting alternative — let tldraw's own binding cleanup drop the
   * binding and keep the shape — is what leaves those orphans: tldraw removes
   * bindings whose endpoints vanish, but it has no opinion about the shape on
   * the other side of them. That opinion is this method.
   */
  override onBeforeDeleteToShape({ binding }: BindingOnShapeDeleteOptions<WireBinding>): void {
    this.editor.deleteShape(binding.fromId);
  }

  /**
   * Isolation is the same fact arriving by a different route: a node copied
   * or duplicated WITHOUT its cable leaves that cable pointing at a shape
   * that is not coming along (`BindingOnShapeIsolateOptions`' own doc, and
   * docs/TLDRAW-STARTER-KITS.md:195). Same answer as deletion, for the same
   * reason — a wire with one end is not a document fact.
   */
  override onBeforeIsolateToShape({ binding }: BindingOnShapeIsolateOptions<WireBinding>): void {
    this.editor.deleteShape(binding.fromId);
  }

  // WHY there is no `onAfterChangeToShape` here, though the lane brief offers
  // it as an option: it is not needed, and adding it would be a write.
  // `WireShapeUtil.getGeometry` and `WireFace` both resolve their terminals by
  // READING the bound shape's record (`wireGeometry.ts`'s `resolveWireEnds`),
  // and both run inside a tracked computation — tldraw's geometry cache is a
  // `createComputedCache` and the face's is a `useValue` — so moving a bound
  // block invalidates them on its own. The alternative (`editor.updateShape(
  // wire, {})` on every change to a bound shape) would put a store
  // transaction, an edit event and an undo-stack entry behind every frame of
  // a block drag. Measured on the acceptance run: with nothing here, the
  // wire's painted endpoint follows a moved block by >60px
  // (src/wiring.smoke.test.tsx, "moving a bound block moves the wire live").
}
