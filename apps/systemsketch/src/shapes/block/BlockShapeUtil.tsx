// src/shapes/block/BlockShapeUtil.tsx — `ss-block`, THE node primitive.
//
// "Everything is really a block" (Zach, docs/ASK-2026-09-18…md): a function
// call, a function definition, a class, and — once L5 lands — a loop's or a
// branch's header contract are all THIS shape. A region does not grow ports;
// it holds a real `ss-block` in its corner instead.
//
// Frame-like only in `expanded` view, which is the same shape as the archive's
// Expanded Block: members are real tldraw children (plan §1.4), so drag-in,
// clipping and z-order stay the engine's rather than becoming ours.
import {
  BaseFrameLikeShapeUtil,
  Group2d,
  Rectangle2d,
  T,
  createShapePropsMigrationSequence,
  resizeBox,
  type TLBaseShape,
  type TLDragShapesInInfo,
  type TLResizeInfo,
  type TLShape,
  type TLShapeUtilCanBindOpts,
} from "tldraw";

import { PortAnchorV, PortSpecV } from "../shared/props";
import { BLOCK_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE, type PortSide } from "../types";
import { BlockFace } from "./BlockFace";

export interface BlockPortSpec {
  id: string;
  /** The one line this port's CodeEditor edits — `frame` or `frame: Frame`.
   *  Its type is PARSED out of it (`@trunk/scene/portDeclaration`), never
   *  stored beside it; see `PortSpecV`'s own note for the ruling. */
  declaration: string;
}

export interface BlockPortAnchor {
  portId: string;
  x: number;
  y: number;
  side: PortSide | null;
}

export type BlockView = "simple" | "port" | "expanded";

export interface BlockShapeProps {
  w: number;
  h: number;
  name: string;
  view: BlockView;
  /** RULING 9. The sentence under the title — one stored string, painted by
   *  the trunk's own `BlockDescription`. Empty is the "never written" state
   *  and paints nothing (`blockDescriptionIsPainted`). */
  description: string;
  /** RULING 9's eye, stored. Ported from the frozen v1 field
   *  (`packages/bbox-ui/src/block.fields.ts:120-124`, `defaultValue: true`),
   *  which is why the default below is `true` and not `false`.
   *
   *  WHY this is persisted rather than a runtime-only view flag, the way
   *  `received` is for a port (ARCHITECTURE.md's "Why `received` is
   *  runtime-only"): the opposite test applies. `received` is a fact only a
   *  live host can know, so persisting it would LIE after reload. "I do not
   *  want this block's description on the board" is an authoring decision
   *  about the document, and a board that forgot it on reload would be the
   *  thing that lies. */
  showDescription: boolean;
  /**
   * P-036 / P-043. The block's icon, stored as ONE encoded string in
   * `@bbox-ui/glyph-content`'s grammar — `""` (no icon), `lucide:<kebab>`,
   * `emoji:<char>`, a `data:`/`http(s):` image URL, or `text:<chars>`.
   *
   * WHY one string rather than a `{kind, value}` pair, which is what the
   * union it decodes to would suggest: the grammar's own header gives the
   * reason and this app inherits it — a glyph has to be the same
   * `string | number | boolean` FieldValue every other field already is, or
   * it cannot ride the same inspector rows, the same tldraw `T.string`
   * validator, or the same Storybook `args`. It is also the donor's
   * (`iconRef.ts`) spelling by value, so a board saved by the archive
   * carries icons this app can already read.
   *
   * WHY persisted, unlike a port's `received` state: same test ruling 9
   * applied to `showDescription`. "This block wears a rocket" is an
   * authoring decision about the document; a board that forgot it on reload
   * would be the thing that lies.
   */
  glyph: string;
  ports: Record<PortSide, BlockPortSpec[]>;
  /** MEASURED shape-local dot centres, written back by the host. A writer
   *  (pyblocks) leaves this `[]` and the first render fills it. */
  anchors: BlockPortAnchor[];
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-block": BlockShapeProps;
  }
}

export type BlockShape = TLBaseShape<"ss-block", BlockShapeProps>;

/**
 * Height of the expanded block's header band, shape-local px — the strip
 * `getGeometry` below hands tldraw as the block's one grab surface.
 *
 * MEASURED, not guessed: 37px, off the real app on :4340 via
 * `getComputedStyle`/`offsetHeight` of
 * `[data-slot="block"] > [data-slot="block-header"]`, and it is 37 for every
 * name length tried (the header is one line and truncates rather than wraps):
 * `py-2` 8 + 8, `text-sm` line-height 20, `border-b` 1.
 *
 * WHY A CONSTANT AND NOT A MEASURED PROP, which is what the donor's
 * `layoutBlock().header` and this repo's own `props.anchors` would suggest:
 * the header is CSS here, so the honest source IS a measurement — but the only
 * place to write one back is `shapes/shared/measure.ts` plus a new `headerH`
 * prop, and `document/documentModel.test.ts:77-84` pins `defaultsOf("ss-block")`
 * with an exact `toEqual`, i.e. a new prop turns a committed acceptance test
 * red. Both files are outside this lane. So: a measured constant, and the
 * failure direction is deliberately the safe one — if the header ever grows
 * (interface scale, a bigger font), the band UNDER-covers and the extra pixels
 * fall through to the hollow interior, which selects nothing. It never
 * over-claims body the user expects to be see-through.
 *
 * When the interface-scale lane lands, this becomes `props.headerH` written by
 * `measure.ts` from `offsetTop + offsetHeight` (NOT `getBoundingClientRect`,
 * which is multiplied by the camera zoom — `measure.ts:11-14`).
 */
const BLOCK_HEADER_BAND_PX = 37;

export class BlockShapeUtil extends BaseFrameLikeShapeUtil<BlockShape> {
  static override type = BLOCK_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    name: T.string,
    view: T.literalEnum("simple", "port", "expanded"),
    description: T.string,
    showDescription: T.boolean,
    // Deliberately `T.string` and not a validator that enforces the grammar:
    // `decodeGlyphContent`'s final `else` is a documented LENIENCY clause — a
    // bare `"🔍"` from before the grammar existed still renders, as text. A
    // validator that rejected anything unprefixed would turn that documented
    // fallback into a record the store refuses, i.e. a board that no longer
    // opens. The grammar is enforced where it is written, not where it is read.
    glyph: T.string,
    ports: T.object({
      left: T.arrayOf(PortSpecV),
      right: T.arrayOf(PortSpecV),
      top: T.arrayOf(PortSpecV),
      bottom: T.arrayOf(PortSpecV),
    }),
    anchors: T.arrayOf(PortAnchorV),
  };

  // Version 0 was an empty sequence, declared so that a later lane could add a
  // migration at all ("retrofitting the sequence after boards exist in the
  // wild cannot"). This is that later lane.
  //
  // WHY the fold is spelled out here instead of calling
  // `formatPortDeclaration`, which is the one place that mints `name: type`
  // everywhere else in this repo: a migration is a HISTORICAL record of what
  // one saved version meant, and it has to keep producing the same bytes for
  // that version forever. Wiring it to a live constructor makes every future
  // edit of that constructor silently rewrite the past — the one case where
  // "one spelling, cannot drift" is the wrong rule. tldraw says the same
  // thing about its own: a shipped migration is frozen.
  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        id: `com.tldraw.shape.${BLOCK_SHAPE_TYPE}/1`,
        // `{id, name, type}` → `{id, declaration}` (ruling 8).
        up: (props: { ports?: Record<string, { id: string; name?: string; type?: string; declaration?: string }[]> }) => {
          for (const side of Object.values(props.ports ?? {})) {
            for (const port of side) {
              const name = port.name ?? "";
              const type = (port.type ?? "").trim();
              port.declaration = type === "" ? name : `${name}: ${type}`;
              delete port.name;
              delete port.type;
            }
          }
        },
      },
      {
        id: `com.tldraw.shape.${BLOCK_SHAPE_TYPE}/2`,
        // Ruling 9: every board saved before the description existed gets the
        // v1 field's own default — no description, and the eye ON, so the
        // first sentence anyone types is visible without hunting for a
        // toggle. Frozen like the one above: it describes what version 1
        // meant, forever.
        up: (props: { description?: string; showDescription?: boolean }) => {
          props.description = "";
          props.showDescription = true;
        },
      },
      {
        id: `com.tldraw.shape.${BLOCK_SHAPE_TYPE}/3`,
        // P-036/P-043: every board saved before a block could carry an icon
        // gets the empty slot, which is the "never chosen" state and paints
        // nothing. Frozen like the two above.
        up: (props: { glyph?: string }) => {
          props.glyph = "";
        },
      },
    ],
  });

  override getDefaultProps(): BlockShapeProps {
    return {
      w: 160,
      h: 100,
      name: "block",
      view: "port",
      description: "",
      showDescription: true,
      glyph: "",
      ports: { left: [], right: [], top: [], bottom: [] },
      anchors: [],
    };
  }

  // WHY frame-like ONLY when expanded: a port-view block is a CALL — dragging
  // another block onto it must not silently make it a member. An expanded
  // block is a DEFINITION, and its body is where members belong.
  override isFrameLike(shape: BlockShape): boolean {
    return shape.props.view === "expanded";
  }

  override providesBackgroundForChildren(): boolean {
    return true;
  }

  override canReceiveNewChildrenOfType(shape: BlockShape, type: TLShape["type"]): boolean {
    // A wire is never a member. It is an edge between blocks, and containment
    // is control flow — the two must not be mixed (plan §2).
    //
    // WHY the widened local: `ss-wire` joins the engine's shape-type union
    // when L3 augments `TLGlobalShapePropsMap`, so until that lane lands the
    // comparison is correct at runtime and unprovable to the type checker.
    const childType: string = type;
    return shape.props.view === "expanded" && childType !== WIRE_SHAPE_TYPE;
  }

  override onDragShapesIn(shape: BlockShape, draggingShapes: TLShape[], info: TLDragShapesInInfo): void {
    // Archive: src/blocks/RegionShapeUtil.ts:22-27 — a locked container takes
    // nothing, and a drag that contains the container itself would adopt it
    // into its own body.
    if (shape.isLocked) return;
    if (draggingShapes.some((dragging) => dragging.id === shape.id)) return;
    super.onDragShapesIn(shape, draggingShapes, info);
  }

  // A block is a data endpoint: the one thing a wire may name, together with a
  // floating `ss-port`. Nothing else binds — and there is no control-line
  // binding to refuse, because control flow is never a cable.
  override canBind(opts: TLShapeUtilCanBindOpts): boolean {
    // Widened for the same reason as `canReceiveNewChildrenOfType` above.
    const fromType: string = opts.fromShapeType;
    return opts.bindingType === WIRE_BINDING_TYPE && fromType === WIRE_SHAPE_TYPE;
  }

  override canResize(): boolean {
    return true;
  }

  override onResize(shape: BlockShape, info: TLResizeInfo<BlockShape>) {
    return resizeBox(shape, info);
  }

  // A rotated block would rotate its rails and its labels with it, and every
  // port dot would still be reachable — but no diagram in this language reads
  // sideways. Rotation is off until something asks for it.
  override hideRotateHandle(): boolean {
    return true;
  }

  /**
   * WHY an expanded block's geometry is wrapped in a `Group2d` while the other
   * two views are a bare `Rectangle2d` — measured, 2026-09-19, not a style
   * choice:
   *
   * tldraw's `Editor.getShapeAtPoint` branches on `isFrameLike` and then
   * iterates `geometry.children` directly. `isFrameLike` is true here only in
   * `expanded` view (above), so an expanded block handing back a bare
   * `Rectangle2d` crashes that read with `TypeError: geometry.children is not
   * iterable`. It surfaces nowhere near the cause: the throw happens inside
   * the hover-update debounce, React unmounts the whole board into its
   * `<Crash>` boundary, and the only symptom is that every pointer gesture on
   * the page stops working. L3 met it as `src/wiring.smoke.test.tsx`'s
   * containment case timing out after 30s with
   * "element was detached from the DOM" — a wire drag between two blocks that
   * are not the frame, failing because a third shape existed.
   *
   * `BaseFrameLikeShapeUtil` ships its own `Group2d` for exactly this reason;
   * this class overrides `getGeometry` (to size the box from the MEASURED
   * `props.w`/`props.h` rather than the base's own) and so has to keep the
   * container the base's contract assumes.
   *
   * Owed upstream to L5: `ss-region` is frame-like too and will need the same
   * wrapper the day it stops being a placeholder.
   */
  override getGeometry(shape: BlockShape) {
    const box = new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
    if (shape.props.view !== "expanded") return box;

    // WHY the header is an `isLabel` CHILD and not `isFilled: true` on the body
    // (Zach, 2026-09-20: "in expanded view I can only select it by hovering
    // over the edge … if I hover over the header and other parts it should
    // also become selected!!!"):
    //
    // `isFilled` is NOT the knob, twice over. tldraw 5.3.2's frame-like branch
    // of `getShapeAtPoint` (Editor.js:4325-4344) never reads it — it answers in
    // three steps, and these are the whole contract: (1) a child with `isLabel`
    // whose BOUNDS hold the point returns the shape; (2) the outline within
    // `hitTestMargin` returns the shape — that 3px ring is the "edge" Zach can
    // hit today and the ONLY thing that answered before this band existed;
    // (3) anything else inside returns `undefined` and STOPS the search. And
    // the wrapper cannot be filled at all: `Group2d`'s constructor hard-codes
    // `super({ ...config, isClosed: true, isFilled: false })`, which is why the
    // live editor reports `Group2d { isFilled: false }` no matter what. The
    // body rect above was ALREADY `isFilled: true` while this bug was live.
    // A label band is the only seam there is.
    //
    // Only the HEADER, deliberately — the interior stays hollow:
    //   - step (3) is the same predicate `getDraggingOverShape` asks
    //     (`isPointInShape(…, { hitInside: true })`), so an interior that
    //     stopped answering "inside" is a container that can no longer adopt a
    //     dropped block;
    //   - every pixel promoted to chrome is a pixel where an `ss-wire` painted
    //     underneath stops being clickable. Donor's words for the full-fill
    //     version (systemsketch 93c84177): "a container ceasing to be one".
    // Label children are invisible to (3), to drops and to the marquee —
    // `Group2d.hitTestPoint` and `hitTestLineSegment` both default to
    // `Geometry2dFilters.EXCLUDE_LABELS` — so this cannot break either.
    //
    // Same three rules, and the same shape of fix, as this repo's own
    // `RegionShapeUtil.getGeometry` (shapes/region/RegionShapeUtil.tsx:375-408).
    const headerH = Math.min(BLOCK_HEADER_BAND_PX, shape.props.h);
    return new Group2d({
      children: [
        box,
        ...(headerH > 0
          ? [
              new Rectangle2d({
                x: 0,
                y: 0,
                width: shape.props.w,
                height: headerH,
                isFilled: true,
                isLabel: true,
                // Or a laid-out band widens `geometry.bounds` and a 1x1
                // drag-create placeholder snaps to its own layout on the first
                // pointer move (the failure `shapes/region/cornerBlock.ts`
                // records as "a drag-create whose frame lands 239px right of
                // the release point"). The `Math.min` above is the second half
                // of that guard: bounds are safe either way, but an unclamped
                // 37px band under a 1x1 placeholder would still CLAIM 37px of
                // empty canvas as "select me".
                excludeFromShapeBounds: true,
              }),
            ]
          : []),
      ],
    });
  }

  override getIndicatorPath(shape: BlockShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  override component(shape: BlockShape) {
    return <BlockFace shape={shape} />;
  }
}
