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

import type { BlockInsetBackground, BlockMemberInset, BlockMembersLayout, BlockMemberWidth } from "@trunk/components/blockMembers";
import type { BlockPortLayout, BlockView as TrunkBlockView } from "@trunk/components/blockPort.layout";

import { BlockRailV, PortAnchorV, PortSpecV, RailPortOptionsV, ViewSizeV, type BlockRail, type RailPortOptions, type ViewSize } from "../shared/props";
import { DiffMarkStyle, type DiffMark } from "../shared/diffMark";
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

/** P-059 adds `value`, the fourth view. The trunk's own `BlockView`
 *  (`components/blockPort.layout.ts:45`) still has three — see
 *  `trunkBlockViewOf` for how the app hands a `value` block to it. */
export type BlockView = "simple" | "port" | "expanded" | "value";

/**
 * The trunk view a block of this app's `view` is drawn with.
 *
 * WHY `value` → `port`: the trunk has no `value` face until L-BLOCK-VIEWS
 * mounts `components/block.value.tsx` (P-059), and of the three it has, `port`
 * is the one that keeps a value's outlet WIREABLE — `simple` folds the rails
 * away and `expanded` makes the block a frame that adopts drops. This is type
 * plumbing, not behaviour: no stored block can be `value` until a lane writes
 * one, and this mapping disappears the day L-BLOCK-VIEWS renders a real value
 * face.
 */
export function trunkBlockViewOf(view: BlockView): TrunkBlockView {
  return view === "value" ? "port" : view;
}

/** P-177 / cluster 15's typeface vocabulary (P-404 names them Simple /
 *  Bookish / Technical / Scribbled). `null` on the prop = the inherited
 *  family, i.e. today's face. */
export type BlockTitleFont = "sans" | "serif" | "mono" | "draw";

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
  /**
   * P-035. What a comparison did to this block — `normal` when it is not part
   * of one. A real tldraw `StyleProp`, so one press marks every selected
   * block, port and cable at once and the NEXT block drawn is born with the
   * same mark; the full argument, including why this is the diff half alone
   * and not the backlog's six-value `state`, is `../shared/diffMark.ts`.
   *
   * WHY persisted, unlike a port's `received` and unlike the severity half:
   * ruling 9's test again. "This block is part of the change I am proposing"
   * is an authoring decision about the document, and a board that forgot it on
   * reload would be the thing that lies. `error`/`warning` fail the same test
   * from the other side — they are derived by `lintScene`, so persisting a
   * hand-painted one would contradict the board it sits on.
   */
  diff: DiffMark;
  ports: Record<PortSide, BlockPortSpec[]>;
  /** MEASURED shape-local dot centres, written back by the host. A writer
   *  (pyblocks) leaves this `[]` and the first render fills it. */
  anchors: BlockPortAnchor[];

  // ---- Schema v2 (B-SCHEMA). STORAGE ONLY: nothing in this commit reads any
  // of these, and every default paints today's pixels. Type, default, item and
  // owning lane for each: docs/finish-2026-09-29/schema-inventory.md §1.1.

  /** P-015/P-212: the size each view was last left at; `null` = never left. */
  viewSizes: Record<BlockView, ViewSize | null>;
  /** P-141: `fixed` keeps the authored box (today's port/expanded); `hug` is
   *  opt-in. Fit-to-content is a COMMAND, never a mode (Q-P166). */
  sizeMode: "fixed" | "hug";
  /** Cluster 14 P-255: `null` = the skin's own radius. */
  cornerRadius: number | null;
  /** P-133: `buildBlockMenu`'s four toggles, stored. */
  showHeader: boolean;
  showHeaderDivider: boolean;
  /** `true` = "paint the footer once the face has one" (Q-P146; inventory §5 Q1). */
  showFooter: boolean;
  showFooterDivider: boolean;
  /** P-130: forwarded to the trunk `BlockPort`'s `showCard`. */
  showCard: boolean;
  /** P-177 / cluster 15: px, `null` = `BLOCK_TITLE_FONT_PX`. A number, so a
   *  size ladder only LABELS numbers and never prints two sizes for one name. */
  titleSizePx: number | null;
  titleFont: BlockTitleFont | null;
  /** P-107: the trunk `BlockPort`'s `layout`. */
  portLayout: BlockPortLayout;
  /** P-134: the trunk `BlockPort`'s function port. */
  functionPort: boolean;
  /** P-118 + cluster 8: one entry per wall. */
  rails: Record<PortSide, BlockRail>;
  /** P-119 + clusters 7/8 for RAIL ports, keyed by port id — see
   *  `RailPortOptionsV` for why a map here and not fields on `PortSpecV`. An
   *  absent entry is the port as painted today. */
  portOptions: Record<string, RailPortOptions>;
  /** P-188 (+ P-161, P-226): the trunk `Block`'s member vocabulary
   *  (`components/blockMembers.tsx:64-73`), donor fields renamed to it
   *  (inventory §2; donor systemsketch `blockModel.ts:487-522`). */
  membersLayout: BlockMembersLayout;
  memberInset: BlockMemberInset;
  memberWidth: BlockMemberWidth;
  memberGap: number;
  memberGutter: number;
  insetBackground: BlockInsetBackground;
  expandedWeights: Record<string, number>;
  blockType: string;
  /** P-074/P-109: linking's identity. `""` = none minted yet; the trunk's
   *  `definitionKey` is DERIVED from it (`scene/linking.ts:52-56`), never stored. */
  definitionId: string;
  /** P-109: `null` = canonical, a number = the n-th draft. */
  draftOrdinal: number | null;
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
    view: T.literalEnum("simple", "port", "expanded", "value"),
    description: T.string,
    showDescription: T.boolean,
    // Deliberately `T.string` and not a validator that enforces the grammar:
    // `decodeGlyphContent`'s final `else` is a documented LENIENCY clause — a
    // bare `"🔍"` from before the grammar existed still renders, as text. A
    // validator that rejected anything unprefixed would turn that documented
    // fallback into a record the store refuses, i.e. a board that no longer
    // opens. The grammar is enforced where it is written, not where it is read.
    glyph: T.string,
    // P-035. The validator IS the style: a `StyleProp` is a `T.Validatable`,
    // and putting it here (rather than a bare `T.literalEnum`) is what makes
    // tldraw index it in `editor.styleProps["ss-block"]` — which is the ONE
    // registration that buys all three StyleProp behaviours at once. Hand-
    // rolling the enum would give the shape a prop and nothing else.
    diff: DiffMarkStyle,
    ports: T.object({
      left: T.arrayOf(PortSpecV),
      right: T.arrayOf(PortSpecV),
      top: T.arrayOf(PortSpecV),
      bottom: T.arrayOf(PortSpecV),
    }),
    anchors: T.arrayOf(PortAnchorV),
    // ---- Schema v2 (B-SCHEMA). Vocabularies copied from the trunk types the
    // interface above imports; `RecordProps` makes `tsc` hold the two together.
    viewSizes: T.object({ simple: ViewSizeV, port: ViewSizeV, expanded: ViewSizeV, value: ViewSizeV }),
    sizeMode: T.literalEnum("fixed", "hug"),
    cornerRadius: T.nullable(T.number),
    showHeader: T.boolean,
    showHeaderDivider: T.boolean,
    showFooter: T.boolean,
    showFooterDivider: T.boolean,
    showCard: T.boolean,
    titleSizePx: T.nullable(T.number),
    titleFont: T.nullable(T.literalEnum("sans", "serif", "mono", "draw")),
    portLayout: T.literalEnum("inline", "offset"),
    functionPort: T.boolean,
    rails: T.object({ left: BlockRailV, right: BlockRailV, top: BlockRailV, bottom: BlockRailV }),
    portOptions: T.dict(T.string, RailPortOptionsV),
    membersLayout: T.literalEnum("free", "stack"),
    memberInset: T.literalEnum("inset", "edge-to-edge"),
    memberWidth: T.literalEnum("fill", "own"),
    memberGap: T.number,
    memberGutter: T.number,
    insetBackground: T.literalEnum("none", "soft-gray"),
    expandedWeights: T.dict(T.string, T.number),
    blockType: T.string,
    definitionId: T.string,
    draftOrdinal: T.nullable(T.number),
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
      {
        id: `com.tldraw.shape.${BLOCK_SHAPE_TYPE}/4`,
        // P-035. EVERY board written before a block could carry a diff mark
        // gets `normal`, the same answer `getDefaultProps` gives a new block —
        // the only value that leaves an old board painting exactly as it did.
        //
        // This step is not optional and it is not paperwork. `DiffMarkStyle`
        // rejects `undefined`, so without it every legacy board fails
        // validation and REFUSES TO OPEN — not "opens unpainted". That is the
        // regression P-028 shipped when it added `props.pins` with an empty
        // sequence and took the committed fixture
        // `src/review/__fixtures__/two-blocks.tldr` down with it, caught a
        // wave later by an unrelated lane. `src/document/diffMarkMigration.test.ts`
        // is this lane's version of not repeating it, and it opens that same
        // real file.
        up: (props: { diff?: string }) => {
          props.diff ??= "normal";
        },
      },
      {
        id: `com.tldraw.shape.${BLOCK_SHAPE_TYPE}/5`,
        // SCHEMA V2 (B-SCHEMA): every prop the finish run adds to a block, in
        // ONE step (docs/finish-2026-09-29/schema-inventory.md §1.1).
        //
        // WHY this step exists at all — the P-028 empty-migration incident:
        // P-028 added `props.pins` to `ss-wire` and left its sequence EMPTY,
        // so every board saved before it failed validation and REFUSED TO
        // OPEN, and the committed fixture `two-blocks.tldr` went down with it.
        // Every prop below is rejected as `undefined` by its validator, so
        // without this step the same thing happens to every board saved
        // before v2. `src/document/schemaV2Migration.test.ts` opens a real
        // one (`fixtures/legacy-v1.bbox`), and its pixels are pinned too.
        //
        // FILLS, NEVER RESETS: `??=`, so a writer that already sent a v2 prop
        // to a pre-v2 board (pyblocks, a newer host) keeps it. Each default
        // paints today's pixels, and they are written out as LITERALS, never
        // via `getDefaultProps`: a shipped migration is frozen (`/1`'s WHY),
        // so a later change of a new-shape default must not rewrite the past.
        up: (props: Record<string, unknown>) => {
          props.viewSizes ??= { simple: null, port: null, expanded: null, value: null };
          props.sizeMode ??= "fixed";
          props.cornerRadius ??= null;
          props.showHeader ??= true;
          props.showHeaderDivider ??= true;
          props.showFooter ??= true;
          props.showFooterDivider ??= true;
          props.showCard ??= false;
          props.titleSizePx ??= null;
          props.titleFont ??= null;
          props.portLayout ??= "inline";
          props.functionPort ??= false;
          props.rails ??= {
            left: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
            right: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
            top: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
            bottom: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
          };
          props.portOptions ??= {};
          props.membersLayout ??= "free";
          props.memberInset ??= "inset";
          props.memberWidth ??= "fill";
          props.memberGap ??= 12;
          props.memberGutter ??= 12;
          props.insetBackground ??= "none";
          props.expandedWeights ??= {};
          props.blockType ??= "";
          props.definitionId ??= "";
          props.draftOrdinal ??= null;
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
      // A block is born UNMARKED, for the same reason a cable is born
      // untunnelled and with no pins: a mark is something the user does, never
      // a state a shape is born in. `createShapes` overwrites this with the
      // ARMED value when one is set (Editor.mjs:6336-6338), which is exactly
      // how "draw three more added blocks" works.
      diff: "normal",
      ports: { left: [], right: [], top: [], bottom: [] },
      anchors: [],
      // ---- Schema v2 (B-SCHEMA). Each value paints today's pixels; the same
      // literals `/5` fills an old board with, so a fresh block and a migrated
      // one cannot paint differently. `documentModel.test.ts` pins this bag.
      viewSizes: { simple: null, port: null, expanded: null, value: null },
      // WHY `fixed`: Fit-to-content is a command, never automatic (Q-P166).
      sizeMode: "fixed",
      cornerRadius: null,
      showHeader: true,
      showHeaderDivider: true,
      // WHY `true`: the donor's default (systemsketch blockModel.ts:619) and
      // P-133's own words — "hide footer" is the action. A call Zach may
      // reverse (inventory §5 Q1); nothing paints a footer yet.
      showFooter: true,
      showFooterDivider: true,
      showCard: false,
      titleSizePx: null,
      titleFont: null,
      portLayout: "inline",
      functionPort: false,
      rails: {
        left: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
        right: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
        top: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
        bottom: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
      },
      portOptions: {},
      membersLayout: "free",
      memberInset: "inset",
      memberWidth: "fill",
      memberGap: 12,
      memberGutter: 12,
      insetBackground: "none",
      expandedWeights: {},
      blockType: "",
      definitionId: "",
      draftOrdinal: null,
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

  /**
   * P-039: the block's title edits in place, and this one line is the whole
   * subscription to tldraw's editing lifecycle — the same "canEdit is the
   * whole subscription" note `PortShapeUtil` carries. The select tool asks
   * exactly this before a double-click (or Enter on a selected shape) calls
   * `setEditingShape`; `BlockFace`'s `BlockTitle` reads that id back and swaps
   * the painted title for the trunk's `EditableText`.
   *
   * WHAT IT TAKES AWAY, which matters as much as what it adds: with `canEdit`
   * false, tldraw's own double-click branch falls through to
   * `handleDoubleClickOnCanvas` (SelectTool/childStates/Idle.ts:465-472) —
   * "if the shape cannot edit, then create a text shape and begin editing the
   * text shape". So a double-click on a block CREATED A STRAY STOCK `text`
   * SHAPE lying on top of it and typed the new name into that. Same failure
   * PortFace.tsx:317-322 records meeting on an overflowing port label.
   */
  override canEdit(): boolean {
    return true;
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
