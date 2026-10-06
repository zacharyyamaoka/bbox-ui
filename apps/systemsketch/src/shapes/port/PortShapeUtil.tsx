// src/shapes/port/PortShapeUtil.tsx — `ss-port`, the FREE port: one wireable
// dot with a label and no enclosing block.
//
// The archive's own one-liner for it (/home/bam/systemsketch/src/floatingPort/
// FloatingPortShapeUtil.tsx:28): "The free Port primitive: a semantic, wireable
// endpoint with no enclosing Block." This rebuild states the same thing the
// other way round — a floating port is a ONE-PORT NODE, the smallest block
// ("everything is really a block", plan §2), which is why it binds a wire at
// all and why its single anchor always carries `FLOATING_PORT_ID`.
//
// Nothing here draws a line. Its one anchor is a DATA endpoint (an `ss-wire`
// terminal, L3); control flow is containment and marks, never a cable
// (plan §2, §6's L2 row).
import {
  Rectangle2d,
  ShapeUtil,
  T,
  createShapePropsMigrationSequence,
  type TLBaseShape,
  type TLShapeUtilCanBindOpts,
} from "tldraw";

import { PortAnchorV, PortFillV, SlotMemberV, SlotOriginV, type PortFill, type SlotMember, type SlotOrigin } from "../shared/props";
import { DiffMarkStyle, type DiffMark } from "../shared/diffMark";
import { PORT_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE, type PortSide } from "../types";
import { PortFace } from "./PortFace";

export interface PortShapeAnchor {
  portId: string;
  x: number;
  y: number;
  side: PortSide | null;
}

export type PortDirection = "in" | "out";

export interface PortShapeProps {
  w: number;
  h: number;
  /** The one line this port's CodeEditor edits — `port`, or `gain_x: float`.
   *  Its type is PARSED out of what follows the first `:`
   *  (`@trunk/scene/portDeclaration`), never stored beside it. See
   *  `shapes/shared/props.ts`'s `PortSpecV` for the ruling and what it
   *  rejects. */
  declaration: string;
  direction: PortDirection;
  /** P-035. What a comparison did to this port — see `../shared/diffMark.ts`
   *  for why the diff half is a `StyleProp` and the severity half is not, and
   *  `BlockShapeUtil`'s own `diff` note for why it persists. */
  diff: DiffMark;
  /** Exactly one MEASURED anchor, whose `portId` is `FLOATING_PORT_ID`. */
  anchors: PortShapeAnchor[];

  // ---- Schema v2 (B-SCHEMA). STORAGE ONLY: nothing in this commit reads any
  // of these, and every default paints today's pixels
  // (docs/finish-2026-09-29/schema-inventory.md §1.2).
  //
  // WHY there is no `frozen` here, although clusters 7/8 ask for a frozen
  // port: tldraw's own `isLocked` is already persisted on every shape and
  // already answers it. A `frozen` prop beside it would be two answers to one
  // question that can disagree — the routeMode-vs-pins argument in
  // `WireShapeUtil`'s `pins` note. L-PORTS-SHAPE paints "not selectable" from
  // `isLocked`. (A RAIL port has no shape and so no `isLocked`; its freeze is
  // `ss-block.portOptions[id].frozen`.)

  /** Cluster 7 P-399: `auto` = derived from the bindings, as `PortFace` does today. */
  fill: PortFill;
  /** Cluster 7 P-408: the trunk `Port.hidden` — gone, and not selectable either. */
  hidden: boolean;
  /** P-119: `null` = the direction's own text layout (`PortFace` `TEXT_LAYOUT_FOR`). */
  labelOrigin: SlotOrigin | null;
  secondaryOrigin: SlotOrigin | null;
  /**
   * P-201/P-208: the label and secondary slots as REAL member lists. A
   * `builtin` member is a part the face paints itself (`label` = the
   * declaration, today's `RestingLabel`; `producers` = P-250's badge, which
   * paints nothing below two producers); a `shape` member names a child shape
   * ("three input boxes" = three of them). A deleted default member stays
   * deleted because it is ABSENT from its list — see `SlotMemberV`.
   */
  slots: { label: SlotMember[]; secondary: SlotMember[] };
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-port": PortShapeProps;
  }
}

export type PortShape = TLBaseShape<"ss-port", PortShapeProps>;

export class PortShapeUtil extends ShapeUtil<PortShape> {
  static override type = PORT_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    declaration: T.string,
    direction: T.literalEnum("in", "out"),
    // P-035. The style IS the validator — see `BlockShapeUtil`'s note on the
    // same line for why this registration is the whole mechanism.
    diff: DiffMarkStyle,
    anchors: T.arrayOf(PortAnchorV),
    // ---- Schema v2 (B-SCHEMA).
    fill: PortFillV,
    hidden: T.boolean,
    labelOrigin: T.nullable(SlotOriginV),
    secondaryOrigin: T.nullable(SlotOriginV),
    slots: T.object({ label: T.arrayOf(SlotMemberV), secondary: T.arrayOf(SlotMemberV) }),
  };

  // Version 1 folds `name` + `type` into one `declaration` (ruling 8). Spelled
  // out rather than calling `formatPortDeclaration`, for the reason
  // BlockShapeUtil's own migration records: a shipped migration is frozen, so
  // it must not be wired to a constructor a later edit could change.
  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        id: `com.tldraw.shape.${PORT_SHAPE_TYPE}/1`,
        up: (props: { name?: string; type?: string; declaration?: string }) => {
          const name = props.name ?? "";
          const type = (props.type ?? "").trim();
          props.declaration = type === "" ? name : `${name}: ${type}`;
          delete props.name;
          delete props.type;
        },
      },
      {
        id: `com.tldraw.shape.${PORT_SHAPE_TYPE}/2`,
        // P-035. Every board written before a port could carry a diff mark
        // gets `normal`. Without it `DiffMarkStyle` rejects the absent value
        // and the board REFUSES TO OPEN — the P-028 `pins` regression, which
        // `src/document/diffMarkMigration.test.ts` exists to not repeat.
        up: (props: { diff?: string }) => {
          props.diff ??= "normal";
        },
      },
      {
        id: `com.tldraw.shape.${PORT_SHAPE_TYPE}/3`,
        // SCHEMA V2 (B-SCHEMA): every prop the finish run adds to a free port,
        // in ONE step (schema-inventory.md §1.2).
        //
        // WHY — the P-028 empty-migration incident: P-028 added `props.pins`
        // to `ss-wire` with an EMPTY sequence, every board saved before it
        // REFUSED TO OPEN, and the committed fixture `two-blocks.tldr` went
        // down with it. Each prop below is rejected as `undefined` by its
        // validator, so without this step every pre-v2 board would do the
        // same; `src/document/schemaV2Migration.test.ts` opens a real one.
        //
        // FILLS, NEVER RESETS (`??=`): a writer that already sent a v2 prop
        // keeps it. The defaults paint today's pixels and are LITERALS, never
        // `getDefaultProps` — a shipped migration is frozen.
        up: (props: Record<string, unknown>) => {
          props.fill ??= "auto";
          props.hidden ??= false;
          props.labelOrigin ??= null;
          props.secondaryOrigin ??= null;
          props.slots ??= { label: [{ kind: "builtin", id: "label" }], secondary: [{ kind: "builtin", id: "producers" }] };
        },
      },
    ],
  });

  // `w`/`h` here are the SEED the shape is born with, not a size it keeps:
  // `useMeasuredShape` overwrites both from the rendered face on the first
  // layout pass, the same way it does for `ss-block`. 120x32 is the
  // document-model contract (documentModel.test.ts:157 asserts exactly this
  // record), and it is also a sane box for the one frame before the face has
  // been laid out. A default-named port then SETTLES at 77x32, not 120x32,
  // because the face hugs "port" rather than padding out to it — measured in
  // the real app, not assumed. Nothing reads a port's `w` but the engine's
  // own geometry, so the hug is the whole story: `getGeometry` below.
  override getDefaultProps(): PortShapeProps {
    // `diff: "normal"` — a port is born unmarked; marking is something the
    // user does. `createShapes` replaces it with the ARMED value when one is
    // set, which is the StyleProp half that makes marking a whole new subgraph
    // one press instead of one press per shape.
    // Schema v2 (B-SCHEMA): the same literals `/3` fills an old board with,
    // so a fresh port and a migrated one cannot paint differently. Both slots
    // start with their DEFAULT member: the declaration in `label`, the
    // producers badge (P-250) in `secondary`.
    return {
      w: 120,
      h: 32,
      declaration: "port",
      direction: "out",
      diff: "normal",
      anchors: [],
      fill: "auto",
      hidden: false,
      labelOrigin: null,
      secondaryOrigin: null,
      slots: { label: [{ kind: "builtin", id: "label" }], secondary: [{ kind: "builtin", id: "producers" }] },
    };
  }

  // WHY the whole box is filled geometry rather than a circle for the dot plus
  // a separate label rect: the archive's own rule, recorded at
  // FloatingPortShapeUtil.tsx:47-52 — "A free Port's text is its movable face,
  // not an editor label … Keep the real label bounds hit-testable so one grab
  // starts the stock translating interaction immediately."
  //
  // One rectangle only keeps that promise while `w`/`h` really are the painted
  // face, LABEL INCLUDED — which is a fact about PortFace, not about this
  // method. It is load-bearing there and stated here because this is where it
  // gets broken: PortFace lays the face out as dot + clearance + a spacer the
  // width of the real label, so `NodeShapeFrame`'s `max-content` hug is the
  // whole token and the measurement pass writes it back. Pin that face to
  // `props.w` again (it was, once) and the measurement can only confirm the
  // number the shape was born with: the label then hangs outside this
  // rectangle, a press on it falls through to the canvas, and a double-click
  // on it makes tldraw draw a stray `text` shape instead of renaming the port.
  override getGeometry(shape: PortShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override getIndicatorPath(shape: PortShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  // A free port is a fixed-size token: its box is the dot plus the room its
  // label needs, not something to stretch. Resize and rotate are off for the
  // same reason the archive turned them off (FloatingPortShapeUtil.tsx:96-99).
  override canResize(): boolean {
    return false;
  }

  override hideResizeHandles(): boolean {
    return true;
  }

  override hideRotateHandle(): boolean {
    return true;
  }

  // Double-click enters editing (tldraw's select tool asks exactly this before
  // calling `setEditingShape`, SelectTool/childStates/Idle.mjs:334-350); the
  // NAME editor PortFace swaps in is what that editing session drives. Nothing
  // custom is needed to get there — `canEdit` is the whole subscription.
  override canEdit(): boolean {
    return true;
  }

  // WHY a floating port binds at all: it IS a wire endpoint — the smallest
  // block. `ss-block` and `ss-port` are the only two shapes a wire may name
  // (plan §3); code and regions refuse, so a data line can never be attached
  // to a thing that speaks no ports or to a control-flow container.
  //
  // The widened local mirrors BlockShapeUtil.canBind: `ss-wire` only joins the
  // engine's shape-type union when L3 augments `TLGlobalShapePropsMap`, so
  // until that lane lands the comparison is right at runtime and unprovable to
  // the type checker.
  override canBind(opts: TLShapeUtilCanBindOpts): boolean {
    const fromType: string = opts.fromShapeType;
    return opts.bindingType === WIRE_BINDING_TYPE && fromType === WIRE_SHAPE_TYPE;
  }

  override component(shape: PortShape) {
    return <PortFace shape={shape} />;
  }
}
