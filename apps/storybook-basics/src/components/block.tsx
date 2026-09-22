import type { CSSProperties, ReactNode } from "react";

import { cn } from "../lib/utils";
import {
  DEFAULT_HIGHLIGHTER_KIND,
  DiagnosticFlag,
  DIAGNOSTIC_FLAG_SIZE_PX,
  diagnosticColorVar,
  highlighterMaskFrameStyle,
  highlighterStrokeOutlineStyle,
  maxDiagnosticSeverity,
  type Diagnostic,
  type HighlighterKind,
} from "./highlighter";
import { HIT_REGION_FILL, HIT_REGION_OUTLINE } from "./hitRegion";
import {
  BLOCK_MEMBER_GAP_PX,
  BLOCK_MEMBER_INSET_PX,
  BlockMembers,
  type BlockInsetBackground,
  type BlockMember,
  type BlockMembersLayout,
} from "./blockMembers";
import { BlockDescription, blockDescriptionIsPainted } from "./blockDescription";
import type { ReorderChord } from "./keyboardReorder";
import { ISOLATED_ROOT_STYLE, paintTier } from "./paintOrder";

/**
 * Block — header / body / footer, stacked. All three are plain slots: pass
 * text, pass nothing, or pass a <Bar> to compose the two components
 * together (that composition is the point of this reset pass — see
 * src/components/Block.stories.tsx's "ComposedWithBar" story). A slot given
 * `undefined` is omitted entirely, not merely emptied, so a header-less
 * Block draws no stray divider line. Painted with Tailwind + the shadcn CSS
 * variables from src/globals.css.
 *
 * WHY this file imports no port concept, and must keep not doing so (Zach,
 * 2026-09-17, docs/BLOCK-PORT-EDGES-PLAN.md D-A1): Block is usable on its
 * own — a card with a header, a body, a footer — and ports are something
 * "we're starting to add more and more things to", not a fact about every
 * Block. `./blockPort.tsx`'s `BlockPort` is the wrapper that mounts ports on
 * a Block's walls; it composes THIS component from the outside rather than
 * this component growing port props, because Block's own root below is
 * `overflow-hidden` and would clip a rail dot that deliberately straddles
 * the border line. See blockPort.tsx's own header for the reciprocal note.
 *
 * WHY `body` is conditional like the other two, and `height` has no default:
 * Zach's folding-chevron requirement is "make sure that it hides the body and
 * footer when you click it." Body used to render unconditionally and `height`
 * defaulted to 240, so a collapsed Block stayed a 240px box with an empty
 * well under its header — the text vanished but nothing folded (measured:
 * 180px open, 180px closed, body GREW 80px → 125px as the footer left). Both
 * halves are needed: omitting the region is what removes the content, and an
 * absent height is what lets the box hug what remains. That also restores
 * this repo's own stated size contract (ARCHITECTURE.md): "Explicit size when
 * the scene carries one; hug contents when it does not" — a caller that wants
 * a fixed box still passes one.
 *
 * WHY the header/footer wrappers' `px-3 py-2` is cancelled with
 * `has-[>[data-slot=bar]]:p-0` rather than removed outright: Zach's bar
 * feedback wants a Bar filling the header/footer to sit edge-to-edge with
 * the divider — a Bar's OWN `px-3` (bar.tsx) supplies the inset instead, so
 * stacking both paddings would double it back up. A bare string/ReactNode
 * header (no Bar) still needs Block's own padding — it has none of its own
 * — so the wrapper keeps `px-3 py-2` as its default and only zeroes it when
 * a `<Bar>` is the direct child, detected via `data-slot="bar"` rather than
 * a new Block prop.
 */

export interface BlockProps {
  header?: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Explicit height in px. Omit to hug the rendered regions. */
  height?: number;
  style?: CSSProperties;
  /**
   * The divider line under the header. Defaults to shown, so no existing
   * caller changes. WHY a prop and not a className override: SystemSketch's
   * own Block chrome treats "Header divider: Show|Hide" as a first-class
   * toggle beside "Footer: Show|Hide" (blockModel.ts's
   * `BlockShowHeaderDividerStyle`) — a header-only card (Zach's minimal
   * "Attributes" variant) wants the title to sit directly on the body with
   * no line between. Footer hiding needs no prop: omit `footer` and the
   * region is omitted entirely (the existing contract).
   */
  showHeaderDivider?: boolean;
  /**
   * The sentence under the title. Ported from the frozen v1 lineage —
   * `packages/bbox-ui/src/blockFace.tsx:437-454` paints it immediately after
   * the header in both header modes, which is the placement restated here.
   *
   * WHY it is a Block prop and not something a caller stuffs into `body`:
   * v1 governs it as a FIELD (`block.fields.ts`'s `DESCRIPTION_FIELD`) with
   * its own visibility toggle, so "is there a description, and is it shown"
   * is a question about the block, answerable without inspecting whatever
   * ReactNode a host happened to pass. The whiteboard's right-hand inspector
   * asks exactly that question.
   */
  description?: string;
  /**
   * Whether the description paints. Defaults to `true` — the donor field's
   * own `defaultValue: true` (`block.fields.ts:120-124`), so no existing
   * caller changes and a newly-typed description is visible immediately.
   *
   * WHY a separate boolean rather than clearing `description` to hide it
   * (Zach, ruling 9 — the control is an EYE, in the right-hand inspector):
   * an eye hides; it does not delete. Folding the two into one field would
   * mean toggling visibility off threw the author's text away, and toggling
   * it back on gave them an empty block.
   */
  showDescription?: boolean;
  /**
   * The description region, rendered BY THE HOST instead of by this component.
   * When present it replaces the whole region — the `<p>` included — and both
   * `description` and `showDescription` are then the host's business.
   *
   * WHY a host would need this at all: a host that lets a person edit the
   * description WHERE IT IS PAINTED has to swap the sentence for a control in
   * this exact spot, between the header and the body, and a `string` prop
   * cannot carry a control. `header` and `body` already work this way; this is
   * the same seam for the one region that did not have it. Zach's "edit it in
   * place, on the card, not in a panel field somewhere else" (P-039/P-026) is
   * what it is for, and `apps/systemsketch/src/shapes/block/BlockFace.tsx` is
   * the caller.
   *
   * WHY it is additive rather than widening `description` to a `ReactNode`,
   * which is the obvious move: `description` is a governed FIELD (see its own
   * doc above) and `blockDescriptionIsPainted` has to be able to ask whether
   * it is empty. A ReactNode cannot be asked that, so widening the prop would
   * either drop the gate or make it lie. Every existing caller is byte
   * -identical, because a caller that passes nothing here takes the branch it
   * always took.
   */
  descriptionSlot?: ReactNode;
  /**
   * Membership — "boxes all the way down". Members render in their own
   * region between body and footer; `membersLayout` picks how the ONE
   * member list is laid out (free = a frame inside, stack = an ordered
   * column). See ./blockMembers.tsx for the vocabulary and its
   * SystemSketch provenance.
   */
  members?: BlockMember[];
  membersLayout?: BlockMembersLayout;
  /** Enables drag-to-reorder of stacked members, kanban-card style. */
  onMembersChange?(members: BlockMember[]): void;
  /** The IDE move-line chord for stacked members — `BlockMembersProps.reorderChord`. */
  membersReorderChord?: ReorderChord;
  memberGap?: number;
  memberGutter?: number;
  insetBackground?: BlockInsetBackground;
  showMembers?: boolean;
  showCards?: boolean;
  /**
   * The diagnostic axis (docs/INVALID-STATES-PLAN.md §5's Block row,
   * amended by Zach's report feedback — see `HighlighterKind`'s own doc
   * in ./highlighter.tsx). `error`/`warning` get a mark in whichever
   * `highlighterKind` the caller asked for, plus the corner
   * `DiagnosticFlag`; `info` paints nothing at all, matching §5's
   * board-scale calm rule. The flag carries a COUNT once the list is
   * longer than one (`DiagnosticFlag`'s own doc).
   *
   * The `"halo"` kind keeps its ORIGINAL, narrower rule — `error` alone,
   * "warning must not shout" — because a soft ambient glow is genuinely
   * loud; `"stroke"`/`"mask"` mark both severities uniformly (a crisp
   * outline does not have the same shouting problem), matching how
   * JointJS's own highlighters behave.
   */
  diagnostics?: Diagnostic[];
  /** Which `HighlighterKind` draws the mark. Defaults to
   *  `DEFAULT_HIGHLIGHTER_KIND` ("stroke") — Zach's own lean from the
   *  report feedback; `"halo"` is the pre-existing treatment, kept as a
   *  sibling, not deleted. */
  highlighterKind?: HighlighterKind;
  /**
   * Suppress the corner `DiagnosticFlag` while keeping the mark (default
   * `true` — every existing caller unchanged). `ValueCapsule`
   * (presets/value/value.tsx) is the one caller that sets this `false`:
   * §5's own words are "no flag — a capsule is too small, the glow is the
   * beacon and the message rides a hover Tooltip" — the mark is still
   * this component's, the flag specifically is not.
   */
  showDiagnosticFlag?: boolean;
  /**
   * Let `warning` earn the `"halo"` kind's mark too (default `false` —
   * Block's own row: "warning must not shout"). Only meaningful with
   * `highlighterKind="halo"` — `"stroke"`/`"mask"` already mark both
   * severities regardless. `ValueCapsule` sets this `true` for its OWN
   * row ("warning: amber glow"), because a capsule has no flag at all to
   * carry warning instead. Block itself never sets this.
   */
  diagnosticWarningGlow?: boolean;
  /**
   * Stable string the sketch skin's hand-drawn outline is generated from —
   * same seed, same wobble, every render (see sketchPath.ts). Defaults to
   * a size-derived string so two same-sized Blocks don't draw identical
   * wobble by coincidence of both falling back the same way; pass an id
   * when two same-sized Blocks need visibly different hand-drawn lines.
   */
  sketchSeed?: string;
  /**
   * Paint Block's hit region. Block has NO hit constant — deliberately: as
   * a DOM element its pointer target is the browser's own hit test, which
   * stops at the border box exactly (the same "there was no number to
   * choose" React Flow's DOM nodes have; contrast tldraw's ±3 screen px
   * `hitTestMargin`). So what this paints IS that fact: a wash over the
   * border box, nothing outside it. Pure paint — absolutely positioned,
   * `pointer-events: none`, moves no layout and eats no clicks.
   */
  showHitRegion?: boolean;
}

/**
 * The root's own border width, px, used only to size `overflowClipMargin`
 * below. A literal, not `--bbox-skin-stroke-width` read back out of CSS:
 * this app carries no wall-anchor geometry that needs the two to be the
 * SAME variable (donor's block.tsx / skin.css both flag that trap — see
 * skin.css's own port-of-omission note), so a plain constant is honest
 * here. It still has to match the token's stroke-width fallback (2px) or
 * the clip margin would come up short the moment a skin activates.
 *
 * WHY this no longer feeds a drawn line: before
 * docs/peps/0001-sketch-skin-at-the-boundary.md, this fed `SketchOutline`
 * directly. The boundary pass now measures its own pen width off
 * `getComputedStyle(el).borderTopWidth` (`sketchAtEdge.ts`'s `measureBox`),
 * which is more honest than a duplicated literal — this constant only
 * has to stay right for the clip allowance, not for two things at once.
 */
const BLOCK_BORDER_PX = 2;

/**
 * WHY: docs/peps/0001-sketch-skin-at-the-boundary.md M2. Slack for any
 * decorative child that paints just outside the border box — NOT a skin
 * import, and not a number the skin gets to set. Before this migration
 * this was `SKETCH_OUTLINE_BLEED_PX`, imported from the skin because the
 * in-core `SketchOutline` was that decorative child; the boundary's own
 * twin is now appended as a child of THIS element (`sketchAtEdge.ts`'s
 * `upsertBoxTwin`) after this component has already rendered, so the same
 * clip allowance is still needed, just granted generically rather than
 * borrowed from the thing that used to need it. Value unchanged: 5, the
 * same `Math.ceil(SKETCH_WOBBLE_PX + 2)` the donor computed.
 */
const OUTLINE_BLEED_PX = 5;

export function Block({
  header,
  body,
  footer,
  width = 320,
  height,
  style,
  showHeaderDivider = true,
  description,
  showDescription = true,
  descriptionSlot,
  members,
  membersLayout = "free",
  onMembersChange,
  membersReorderChord,
  memberGap = BLOCK_MEMBER_GAP_PX,
  memberGutter = BLOCK_MEMBER_INSET_PX,
  insetBackground = "none",
  showMembers = true,
  showCards = false,
  diagnostics,
  highlighterKind = DEFAULT_HIGHLIGHTER_KIND,
  showDiagnosticFlag = true,
  diagnosticWarningGlow = false,
  sketchSeed,
  showHitRegion = false,
}: BlockProps) {
  const diagnosticSeverity = maxDiagnosticSeverity(diagnostics);
  const markedSeverity = diagnosticSeverity !== "info" ? diagnosticSeverity : undefined;
  // "Warning must not shout" (§5's own words for this row) is the
  // "halo" kind's OWN, narrower rule — an error-only escalation by
  // default, never amber, unless the caller (ValueCapsule) has no other
  // channel and opts warning in. `stroke`/`mask` mark both severities
  // uniformly — a crisp outline is not the loud thing "must not shout"
  // was written about.
  const showGlow =
    highlighterKind === "halo" &&
    (markedSeverity === "error" || (markedSeverity === "warning" && diagnosticWarningGlow));
  const showStroke = highlighterKind === "stroke" && markedSeverity != null;
  const showMask = highlighterKind === "mask" && markedSeverity != null;
  const showFlag = showDiagnosticFlag && markedSeverity != null;
  // Half the flag's own diameter pokes outside the border — "straddling
  // the corner the way wall ports straddle walls" (§5). `overflowClipMargin`
  // below has to widen to let it, exactly the mechanism already in place
  // for the sketch outline's own bleed (this file's existing WHY on
  // `overflow: clip`). The "mask" kind renders a SIBLING frame (below) that
  // pokes out by the same amount for the same reason; "stroke" needs no
  // widening at all — a CSS `outline` paints outside the border box but is
  // NOT part of what the element's own `overflow` clips (same rule that
  // already let the pre-existing glow's box-shadow skip this entirely).
  const flagOverhangPx = DIAGNOSTIC_FLAG_SIZE_PX / 2;
  const MASK_OFFSET_PX = 4;
  const maskOverhangPx = showMask ? MASK_OFFSET_PX : 0;
  return (
    <div
      data-slot="block"
      data-diagnostic={diagnosticSeverity}
      data-highlighter-kind={markedSeverity ? highlighterKind : undefined}
      className={cn(
        "relative flex flex-col text-sm",
        // Text colour is a skin token because a skin may remove the
        // surface it was contrasting against: the sketch skin paints no
        // fill, so `text-card-foreground` would be reading against a card
        // that is not there. Fallback is the exact class this replaced.
        "text-[color:var(--bbox-skin-fg,var(--color-card-foreground))]",
        // The skin seam (src/skin/skin.ts + skin.css). Each token carries
        // TODAY'S value as its own `var()` fallback — captured live off
        // this story before this port (`blocks-block--default`,
        // getComputedStyle) — so a consumer who never imports skin.css
        // renders the exact pixels this replaced: `rounded-lg border
        // border-border bg-card shadow-sm`. `border-solid` is explicit
        // because a host without Tailwind's preflight defaults to
        // `border-style: none`, where a width alone paints nothing.
        // WHY the fallback is 1px, not the token table's 2px: Block's own
        // border-width TODAY is Tailwind's plain `border` utility (1px) —
        // captured live (`blocks-block--default`, getComputedStyle) before
        // this port. skin.css's three blocks still all agree on 2px once
        // ANY skin is active (including the explicit "default" one) — see
        // skin.css's own header on why stroke-width has to be uniform
        // across every skinned component the moment a skin is switched
        // on. Only the UNSET case (no attribute at all) has to stay 1px.
        "border-solid border-[length:var(--bbox-skin-stroke-width,1px)] border-[color:var(--bbox-skin-stroke,var(--color-border))]",
        "bg-[var(--bbox-skin-surface,var(--color-card))] shadow-[var(--bbox-skin-shadow,0_1px_3px_0_rgb(0_0_0_/_0.1),0_1px_2px_-1px_rgb(0_0_0_/_0.1))]",
        // Set once on the container; every text slot inherits it, so the
        // sketch skin needs no per-slot font prop.
        "font-[family-name:var(--bbox-skin-font,inherit)]",
      )}
      // `overflow: clip` (not `hidden`) so the header/footer bars' corners
      // still cut cleanly without turning Block into a scroll container —
      // and so a decorative child painting just outside the padding box
      // (a boundary-drawn twin; see `OUTLINE_BLEED_PX`) isn't clipped;
      // see `overflowClipMargin` below.
      style={{
        // The isolation invariant (paintOrder.ts's own header comment):
        // this root emits paint tiers (the diagnostic flag below, and
        // headerChrome on the header/footer slots), so it MUST wall them
        // off in their own stacking context — otherwise a deeply nested
        // Block (via `BlockMembers`, "boxes all the way down") could leak
        // an interior z-index past this box and outrank an ANCESTOR's
        // own header. See PaintOrder.stories.tsx's
        // `NestedChildStaysBehindHeader`.
        ...ISOLATED_ROOT_STYLE,
        width,
        height,
        borderRadius: "var(--bbox-skin-radius, var(--radius-lg))",
        overflow: "clip",
        // Widened to let the corner flag straddle the border (see
        // `flagOverhangPx` above) and, with `highlighterKind="mask"`, the
        // sibling mask frame (below) poke out too — the same clip-margin
        // mechanism this rule already grants a decorative child's own
        // bleed; every reason to widen it is independent, so this takes
        // whichever is largest rather than stacking them. `"stroke"` needs
        // no widening — see this file's own WHY on `showStroke` above.
        overflowClipMargin: `${BLOCK_BORDER_PX + Math.max(OUTLINE_BLEED_PX, showFlag ? flagOverhangPx : 0, maskOverhangPx)}px`,
        // PREPENDED ahead of the resting `shadow-[…]` utility (§3: "outer
        // halo... prepended") — an inline `boxShadow` beats a class at
        // equal specificity by cascade ORDER regardless, so this only sets
        // one when there is something to prepend; `undefined` otherwise
        // leaves the Tailwind utility above untouched, byte-identical to
        // before this axis existed. The wash is a soft, blurred colour-mix
        // of the SAME token as the ring, never a hardcoded red/amber — dark
        // mode gets the dark token variant for free.
        ...(showGlow && markedSeverity
          ? {
              boxShadow: `0 0 0 1.5px ${diagnosticColorVar(markedSeverity)}, 0 0 18px color-mix(in srgb, ${diagnosticColorVar(markedSeverity)} 45%, transparent), var(--bbox-skin-shadow, 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1))`,
            }
          : null),
        // `"stroke"` (HighlighterKind's own doc): a plain CSS outline, the
        // cheap JointJS-style approximation — same corner radius as the
        // box itself, not truly equidistant on a rounded rect.
        ...(showStroke && markedSeverity ? highlighterStrokeOutlineStyle(diagnosticColorVar(markedSeverity), 4) : null),
        ...style,
      }}
    >
      {showMask && markedSeverity && (
        // `"mask"` (HighlighterKind's own doc): a sibling frame whose
        // `border-radius` grows by EXACTLY the offset — the Minkowski-sum
        // arithmetic that makes this genuinely equidistant at the corners,
        // unlike `"stroke"`'s plain `outline-offset` above.
        <div
          data-slot="block-highlighter-mask"
          aria-hidden
          style={highlighterMaskFrameStyle(diagnosticColorVar(markedSeverity), MASK_OFFSET_PX, "var(--bbox-skin-radius, var(--radius-lg))")}
        />
      )}
      {showFlag && diagnostics && (
        // Straddles the top-right corner — half in, half out — the same
        // convergence Appendix B's own table names (maxGraph's
        // `defaultOverlap: 0.5`, JointJS's `Button` at `x:'100%'`, Vyuh's
        // "-8px offset"). `zIndex` clears the sketch outline's own drawn
        // stroke, which otherwise paints OVER a flag sitting this close to
        // the corner.
        <div
          data-slot="block-diagnostic-flag"
          style={{ position: "absolute", top: -flagOverhangPx, right: -flagOverhangPx, zIndex: paintTier("flagBadge") }}
        >
          <DiagnosticFlag diagnostics={diagnostics} />
        </div>
      )}
      {showHitRegion && (
        <div
          data-slot="block-hit-region"
          aria-hidden
          style={{
            position: "absolute",
            // `inset: 0` covers the PADDING box; the hit region is the
            // BORDER box, so reach back out by the live border width —
            // the same token the root's own border reads.
            inset: "calc(-1 * var(--bbox-skin-stroke-width, 1px))",
            pointerEvents: "none",
            background: HIT_REGION_FILL,
            outline: HIT_REGION_OUTLINE,
            outlineOffset: -1,
            borderRadius: "var(--bbox-skin-radius, var(--radius-lg))",
          }}
        />
      )}
      {header !== undefined && (
        <div
          data-slot="block-header"
          className={cn(
            "px-3 py-2 has-[>[data-slot=bar]]:p-0",
            // `border-b-[color:…]`, NOT the bare `border-[color:…]` this
            // was first written as: a bracketed arbitrary value with no
            // side prefix sets the property on all FOUR sides, which
            // silently added a 1px left/right/top border the div never
            // had — measured live (BlockPort.stories.tsx's
            // `FunctionPortHeaderInset`, off by 2px) before this fix.
            // `border-b` alone still supplies the bottom width + solid
            // style; this only overrides ITS colour.
            showHeaderDivider && "border-b border-b-[color:var(--bbox-skin-stroke,var(--color-border))]",
          )}
          // `headerChrome` (paintOrder.ts) — the nesting tier: a Block's
          // own header must paint ABOVE its own `BlockMembers` region no
          // matter how deeply that region nests other Blocks inside it
          // (Card 04). Needs BOTH `position` (z-index is a no-op on a
          // static element) and the explicit tier (a `BlockMembers`
          // region in `free` mode is itself `position: relative` with
          // z-index:auto, i.e. stack level 0 — a merely-positioned
          // header with no z-index would still lose the DOM-order
          // tie-break, since members renders AFTER header). This was
          // NOT one of the five pre-existing literals; it is the one
          // new capability this lane adds. See
          // `PaintOrder.stories.tsx`'s `NestedChildStaysBehindHeader`.
          style={{ position: "relative", zIndex: paintTier("headerChrome") }}
        >
          {header}
        </div>
      )}
      {/* The donor's placement, verbatim in intent: directly after the
          header, before the body, in every view. `blockDescriptionIsPainted`
          is v1's own `resolved.description && data.description` gate — an
          empty string paints nothing even with the eye on, so an untouched
          block never reserves a blank line. */}
      {descriptionSlot !== undefined
        ? descriptionSlot
        : blockDescriptionIsPainted(description, showDescription) && (
            <BlockDescription>{description}</BlockDescription>
          )}
      {body !== undefined && (
        <div
          data-slot="block-body"
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2"
        >
          {body}
        </div>
      )}
      {members !== undefined && (
        <BlockMembers
          layout={membersLayout}
          members={members}
          onMembersChange={onMembersChange}
          reorderChord={membersReorderChord}
          gap={memberGap}
          gutter={memberGutter}
          insetBackground={insetBackground}
          showMembers={showMembers}
          showCards={showCards}
        />
      )}
      {footer !== undefined && (
        <div
          data-slot="block-footer"
          className="border-t border-t-[color:var(--bbox-skin-stroke,var(--color-border))] px-3 py-2 has-[>[data-slot=bar]]:p-0"
          // Same tier as the header — see the header's own comment above.
          // Not covered by the nesting acceptance test (only the header
          // relationship is), but a footer is the same "chrome" role and
          // leaving it non-positioned would make it lose to members the
          // header no longer does.
          style={{ position: "relative", zIndex: paintTier("headerChrome") }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
