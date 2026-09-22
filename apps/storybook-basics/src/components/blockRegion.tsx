"use client";

// src/components/blockRegion.tsx — BlockRegion: a thin scope FRAME with a
// real Block integral to its top-left corner, an optional free body, and an
// ordered list of arm rows. Props in, DOM out (docs/CONTROL-FLOW-PLAN.md
// §3.2); it imports no scene module and no canvas engine, so the same
// element renders under the DOM canvas, React Flow and tldraw unchanged.
//
// WHY "BlockRegion" and a composite rather than a frame with a slot (Zach,
// 2026-09-22: "Block Region is stanadlone component that composes the Block
// with a 'region'"): the corner IS a Block. Give it a `title` and this
// component draws that Block itself, `shape="region-corner"`, so the square
// junctions come with it. The Labeled Group is exactly that with nothing
// else (`blockRegion.labeledGroup.tsx`). A host that needs ports on the card
// still passes its own `BlockPort`-wrapped Block as `corner`, and gives that
// Block the same shape: the shape is the Block's, not the region's
// (block.tsx, `BlockShape`).
//
// ── ONE NODE, TWO PIECES OF PAINT (plan §2.A, Zach's "everything is a
//    block" made structural) ──────────────────────────────────────────
// A region is ONE scene node. The FRAME is how that node renders its
// SCOPE; the CORNER BLOCK is how it renders its INTERFACE. There is no
// second node, no head child, and the frame carries no value ports of its
// own — a loop's `Iterable`/`Iter` and a branch's conditions are ports on
// the corner card, resolved by exactly the same `[data-block-id]` ->
// `[data-port-id]` walk as any other block's.
//
// WHY the root and the frame carry `data-region-id` and NEVER
// `data-block-id`: `wireLayer.tsx`'s `resolveDot` takes the FIRST
// `[data-block-id="<id>"]` in document order (wireLayer.tsx:81). If the
// frame carried the region's id it would win that lookup, and every wire
// into the corner card would resolve against a box that owns no dot. The
// corner card owns the id; the frame owns the region id. The tempting
// alternative — stamping both and "letting the more specific one win" —
// cannot work, because document order, not specificity, is the rule.
//
// LOOK: React Flow UI's Labeled Group Node (`Pasted image 20260918192040.png`,
// the reference Zach named): a thin rounded frame with a transparent fill
// and a label chip INSIDE the frame at its top-left, sharing the frame's
// rounding there and square where it meets the frame. Ours is a whole
// Block rather than a text chip, which is the entire point.
//
// ── FIVE DRAWINGS, ONE COMPONENT (2026-09-19, `skin/regionVariants.ts`) ──
// Zach asked for five proposals for how a region could be drawn
// differently. They are NOT five components and not five props: every
// paint value below is a CSS custom property (`--bbox-region-*`) read with
// today's value as its `var()` fallback, and a variant is a block of those
// properties keyed on `data-bbox-region-variant` on any ancestor
// (`skin/regionVariants.css`, the skin.css mechanism). The two things CSS
// cannot drive — the arm header's height, which the pure layout twin must
// be told, and the fold chevron's `reveal`, which is a prop — come from
// the TS spec via `useRegionVariant`, keyed on the SAME attribute. So no
// variant is ever a fork of this file, and a consumer who never imports
// the CSS renders the pixels this component rendered before variants
// existed (`v1`).
//
// What every variant keeps, because Zach's ruling is not a variant axis:
// the corner block flush with the frame's top-left; its dots ON the frame
// edge and never clipped; arms stacked under it and folded by the chevron;
// the opaque card untouched.
//
// Pure: no React state beyond two measurements (the corner's box and the
// variant in force), no DOM outside its own subtree, no scene import (the
// `layering.test.ts` import wall).

import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { Bar } from "./bar";
import { Block, REGION_FRAME_RADIUS } from "./block";
import { BlockMembers, type BlockMember } from "./blockMembers";
import { FoldingChevron } from "./foldingChevron";
import {
  REGION_ARM_FADE_OPACITY,
  REGION_CORNER_WIDTH_PX,
  regionLayout,
  type RegionLayout,
} from "./blockRegion.layout";
import {
  DEFAULT_REGION_VARIANT,
  REGION_VARIANT_ATTR,
  REGION_VARIANTS,
  readRegionVariant,
  type RegionVariantId,
} from "../skin/regionVariants";

export type RegionKind = "loop" | "branch" | "group";
export type RegionView = "expanded" | "opaque";

export interface RegionArm {
  id: string;
  /** Free text, human readable — `if fast:`, `case "pet":`. Never code. */
  title: ReactNode;
  open: boolean;
  onOpenChange?(open: boolean): void;
  /** Absent is ACTIVE. Donor branchModel.ts:11-12 — "no active arm means
   *  every arm is active". */
  active?: boolean;
  /** Body height while open; remembered while folded (`regionLayout`). */
  bodyHeight?: number;
  members?: BlockMember[];
}

export interface BlockRegionProps {
  /** Stamped as `data-region-id` on the root AND the frame — never
   *  `data-block-id`. See this file's header. */
  id: string;
  kind?: RegionKind;
  view?: RegionView;
  /**
   * The corner card's title. With no `corner`, BlockRegion draws the card
   * itself: a header-only `Block`, `shape="region-corner"` while expanded and
   * a plain card while opaque, hugging its title. Rendered as authored.
   */
  title?: ReactNode;
  /**
   * The corner card, supplied whole — for a card with ports: a `BlockPort`
   * whose `id` IS this region's id, around a `Block` with
   * `shape="region-corner"`. Takes precedence over `title`. Omit both for a
   * bare scope with nothing in its corner.
   */
  corner?: ReactNode;
  /** Skip the measurement when a host already knows the corner's box. */
  cornerSize?: { w: number; h: number };
  width?: number;
  /** Omitted = hug (`regionLayout`). */
  height?: number;
  /** The free body a loop/group drops into — `BlockMembers layout="free"`. */
  members?: BlockMember[];
  arms?: RegionArm[];
  className?: string;
  style?: CSSProperties;
}

/** The frame's own border, px — the number the corner is pulled back by so
 *  the two borders sit on ONE line rather than doubling into a 2px rule.
 *  Every variant keeps this 1px of GEOMETRY (a variant may paint it
 *  transparent, never widen it), which is what keeps every row, member and
 *  dot exactly where it was under `v1`. */
const FRAME_BORDER_PX = 1;

/** The frame's shared top-left radius — the corner card's too, which is why
 *  it lives beside `Block`'s `"region-corner"` shape and is read from there:
 *  the frame and the card curve together only while they read one string. */
const FRAME_RADIUS = REGION_FRAME_RADIUS;

/**
 * The corner's measured box.
 *
 * WHY measured and not computed: the corner is a whole `Block` whose height
 * hugs its own header, ports and footer — there is no closed form for it
 * (the same reason `blockPort.tsx`'s `useBlockBands` measures rather than
 * derives). The first render has no box yet and falls back to
 * `{w: REGION_CORNER_WIDTH_PX, h: 0}`; `useLayoutEffect` corrects it BEFORE
 * the browser paints, so the guess is never on screen — the same
 * first-frame device `tldrawHost.tsx` uses, tightened one frame because
 * this measurement has no engine to wait for.
 */
function useCornerSize(given: { w: number; h: number } | undefined): {
  ref: (node: HTMLDivElement | null) => void;
  size: { w: number; h: number };
} {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const skip = given !== undefined;

  useLayoutEffect(() => {
    if (skip || !node) return;
    const read = () => {
      const rect = node.getBoundingClientRect();
      // Identity-preserving: a sub-pixel re-measure that says the same
      // thing must not re-render, or the observer feeds itself.
      setMeasured((previous) =>
        previous && Math.abs(previous.w - rect.width) < 0.5 && Math.abs(previous.h - rect.height) < 0.5
          ? previous
          : { w: rect.width, h: rect.height },
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [skip, node]);

  return { ref: setNode, size: given ?? measured ?? { w: REGION_CORNER_WIDTH_PX, h: 0 } };
}

/**
 * The variant in force for THIS region — the nearest ancestor carrying
 * `data-bbox-region-variant`, else `<html>`'s, else `v1`
 * (`readRegionVariant`).
 *
 * WHY it is measured off the DOM in a layout effect, like the corner, and
 * not passed as a prop or read from a context: the contract's switch is an
 * ATTRIBUTE (so the app's dropdown and Storybook's global are three lines
 * each, and CSS reads the same thing), and an attribute change re-renders
 * nothing here on its own. The CSS tokens follow it for free; the two
 * values that are not CSS — the header height the layout twin needs and
 * the chevron's `reveal` — follow it through the observer below, without
 * any React state outside this file. The first render assumes `v1` and the
 * layout effect corrects it before paint, the device `useCornerSize` uses.
 *
 * WHY the observer is shaped as it is — the failure it closes is a
 * HALF-SWITCHED region, CSS on the new drawing and layout/chevron on the
 * old (`RegionVariants.stories.tsx`'s `SwitchOnAncestor*` and
 * `SwitchNeverHalfPainted`, each red against the alternative named here):
 *   • It watches the WHOLE document (`subtree`), filtered to the one
 *     attribute — `<html>`'s dataset from an app dropdown, a wrapper
 *     written by hand, and a React-owned wrapper (the Storybook global)
 *     whether or not this region re-rendered with it. Observing only
 *     `<html>` (the first cut) left a nearer ancestor's switch unseen
 *     forever. The filter keeps it cheap: records exist only for this
 *     attribute, which changes when someone picks a drawing.
 *   • It applies the change with `flushSync`. Its callback is a microtask,
 *     and a plain `setState` from there is scheduled as a later TASK —
 *     after the browser has painted the new CSS over the old layout, one
 *     visible frame of jitter per switch. `flushSync` renders inside the
 *     same microtask checkpoint, before paint; when the resolved variant
 *     did not change (another subtree's switch) the same-value bail-out
 *     makes it a `closest()` walk and nothing else.
 */
function useRegionVariant(node: HTMLElement | null): RegionVariantId {
  const [variant, setVariant] = useState<RegionVariantId>(DEFAULT_REGION_VARIANT);
  useLayoutEffect(() => {
    if (!node) return;
    setVariant(readRegionVariant(node));
    const observer = new MutationObserver(() => {
      const next = readRegionVariant(node);
      flushSync(() => setVariant(next));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [REGION_VARIANT_ATTR], subtree: true });
    return () => observer.disconnect();
  }, [node]);
  return variant;
}

function ArmRow({
  arm,
  row,
  index,
  chevron,
}: {
  arm: RegionArm;
  row: RegionLayout["arms"][number];
  index: number;
  chevron: "always" | "hover";
}) {
  const active = arm.active ?? true;
  return (
    <div
      data-slot="region-arm"
      data-arm-id={arm.id}
      data-open={String(row.open)}
      data-active={String(active)}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: row.rowTop,
        height: row.bottom - row.rowTop,
        // WHY a single opacity token on the ROW and not per-element
        // styling: the donor fades "non-active arms, their Blocks and
        // their cables" with ONE number (branchModel.ts:38-39,
        // BRANCH_FADE_OPACITY = 0.18), and a row-level opacity carries the
        // arm's members with it for free. Cable fade is a follow-up — the
        // wires live in a sibling layer, not inside this box.
        opacity: active ? undefined : REGION_ARM_FADE_OPACITY,
      }}
    >
      {/*
        The arm's DECOR box — `v5`'s inset card, `v4`'s indent guide, nothing
        at all by default (`display: none`). WHY a real element and not a
        `::before`: this component is props in, DOM out, and a box the
        acceptance can measure (`RegionVariants.stories.tsx` reads its rect)
        has to be in the DOM. It is absolutely positioned and comes FIRST,
        and the header and body are positioned after it, so it paints
        BEHIND both in DOM order — no z-index, which the paint-order
        invariant (paintOrder.ts) would otherwise have to account for. The
        row's own box never moves for it: `expectArmsStacked` and every
        member's authored position hold in all five drawings.
      */}
      <div
        data-slot="region-arm-decor"
        aria-hidden
        style={{
          display: "var(--bbox-region-arm-decor-display, none)",
          position: "absolute",
          inset: "var(--bbox-region-arm-decor-inset, 0px)",
          width: "var(--bbox-region-arm-decor-width, auto)",
          borderStyle: "solid",
          borderWidth: "var(--bbox-region-arm-decor-stroke-widths, 0px)",
          borderColor: "var(--bbox-region-arm-decor-stroke, var(--border))",
          borderRadius: "var(--bbox-region-arm-decor-radius, 0px)",
          background: "var(--bbox-region-arm-decor-fill, transparent)",
          pointerEvents: "none",
        }}
      />
      <div
        data-slot="region-arm-header"
        style={{
          // Positioned so it paints after the decor box above (DOM order
          // among positioned boxes), never under it.
          position: "relative",
          height: row.bodyTop - row.headerTop,
          paddingLeft: "var(--bbox-region-arm-header-inset, 0px)",
          // `v3`'s band; transparent otherwise.
          background: "var(--bbox-region-arm-header-fill, transparent)",
          // A divider between rows only, never above the first — the
          // donor's own `dividerY: index === 0 ? null : rowTop`
          // (branchModel.ts). `v3`/`v4`/`v5` set its width to 0.
          borderTop: index > 0 ? "var(--bbox-region-arm-divider-width, 1px) solid var(--bbox-region-arm-divider-stroke, var(--border))" : undefined,
          // `v2`'s rule under every header; 0 otherwise.
          borderBottom: "var(--bbox-region-arm-header-rule-width, 0px) solid var(--bbox-region-arm-header-rule-stroke, var(--border))",
        }}
      >
        <Bar
          size="sm"
          // WHY `100%` and not the rung's own 28px: the header row is the
          // variant's height (26 for the bracket, 32 for the ruled), and
          // the strip fills it so the chevron and title are centred in the
          // row rather than top-biased by whatever the difference is.
          style={{ height: "100%" }}
          left={
            <>
              <FoldingChevron open={row.open} onClick={() => arm.onOpenChange?.(!row.open)} reveal={chevron} />
              <span
                data-slot="region-arm-title"
                className="truncate"
                // No fallbacks on purpose: an UNSET token is invalid at
                // computed-value time, and for these four inherited
                // properties that means `inherit` — the Bar's own text.
                // That is how `v1` says "leave the title alone" without
                // this file naming a font it does not own
                // (regionVariants.ts's own note on `initial`).
                style={{
                  fontSize: "var(--bbox-region-arm-title-size)",
                  fontWeight: "var(--bbox-region-arm-title-weight)",
                  fontFamily: "var(--bbox-region-arm-title-font)",
                  color: "var(--bbox-region-arm-title-color)",
                }}
              >
                {arm.title}
              </span>
            </>
          }
        />
      </div>
      {row.open && (
        // WHY the body LEAVES THE DOM when folded rather than collapsing to
        // `height: 0`: `expectArmsStacked` measures a folded arm as "no
        // body", and a zero-height box that still contains members would
        // keep them hit-testable and focusable while invisible — a folded
        // arm has to be genuinely absent, not merely unpainted.
        <div
          data-slot="region-arm-body"
          style={{ position: "relative", height: row.bodyHeight }}
        >
          <BlockMembers
            layout="free"
            members={arm.members ?? []}
            gap={0}
            gutter={0}
            insetBackground="none"
            showMembers
            showCards={false}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The corner card BlockRegion draws for itself when it is given a `title` and
 * no `corner`: a header-only Block that hugs its title.
 *
 * WHY no header divider: the header is the whole card, so its rule would sit
 * on the card's own bottom border and double it. WHY it hugs instead of taking
 * `REGION_CORNER_WIDTH_PX`: this is the Labeled Group's label, and React Flow's
 * reference label is as wide as its text. A region whose card carries ports
 * passes its own sized card as `corner`.
 */
function TitleCorner({ title, opaque }: { title: ReactNode; opaque: boolean }) {
  return (
    <Block
      header={title}
      showHeaderDivider={false}
      shape={opaque ? "card" : "region-corner"}
      style={{ width: "max-content" }}
    />
  );
}

export function BlockRegion({
  id,
  kind = "group",
  view = "expanded",
  title,
  corner: givenCorner,
  cornerSize,
  width,
  height,
  members,
  arms,
  className,
  style,
}: BlockRegionProps) {
  const corner = givenCorner ?? (title === undefined ? null : <TitleCorner title={title} opaque={view === "opaque"} />);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const variant = useRegionVariant(root);
  const spec = REGION_VARIANTS[variant];
  const { ref: cornerRef, size } = useCornerSize(cornerSize);
  const layout = regionLayout({
    width: width ?? REGION_CORNER_WIDTH_PX,
    ...(height === undefined ? null : { height }),
    corner: size,
    armHeaderPx: spec.arms.headerPx,
    arms: (arms ?? []).map((arm) => ({
      id: arm.id,
      open: arm.open,
      ...(arm.bodyHeight === undefined ? null : { bodyHeight: arm.bodyHeight }),
    })),
  });

  /** Does THIS region paint the header rule at all? See the rule's own WHY
   *  below for the two halves. Computed here so the frame and any future
   *  reader agree on one answer. */
  const drawsHeaderRuleHere = kind !== "loop" && layout.arms.length > 0;

  const rootProps = {
    "data-slot": "region",
    "data-region-id": id,
    "data-region-kind": kind,
    "data-region-view": view,
    // Informational — which drawing this region resolved to. NOT the switch
    // attribute (`data-bbox-region-variant`), which stays the host's to
    // stamp: writing it here would shadow every ancestor's choice.
    "data-region-variant": variant,
  } as const;

  // P5, opaque: the root wraps ONLY the corner card — the host's, or with
  // `title` the one `TitleCorner` draws, which turns itself back into a plain
  // `card` here. No frame, no arms, no body — the whole point of the view is
  // that the inside is not drawn. The card's own ports and footer are the
  // host's business (`nodeViews.tsx`), which is why this branch renders
  // `corner` untouched — and why no variant token is read here: the opaque
  // card reads the same in every drawing by design.
  if (view === "opaque") {
    return (
      <div {...rootProps} ref={setRoot} className={className} style={{ width: "max-content", ...style }}>
        {corner}
      </div>
    );
  }

  return (
    <div
      {...rootProps}
      ref={setRoot}
      className={className}
      style={{
        position: "relative",
        width: "max-content",
        // The fill THIS frame paints, captured at the root: the token as
        // inherited from outside this region. The frame below re-declares
        // `--bbox-region-frame-fill` for its DESCENDANTS as the variant's
        // nested fill, so a region inside this one reads "one tone deeper"
        // while this frame itself still reads the outer value — the
        // capture on the root is what breaks the self-reference.
        ...({ "--bbox-region-fill-here": "var(--bbox-region-frame-fill, transparent)" } as CSSProperties),
        ...style,
      }}
    >
      <div
        data-slot="region-frame"
        data-region-id={id}
        style={{
          position: "relative",
          width: layout.width,
          height: layout.height,
          // Four widths so the bracket (`v4`) can open the right and the
          // bottom; every variant keeps the top and the left at
          // FRAME_BORDER_PX, the corner card's home.
          borderWidth: `var(--bbox-region-frame-stroke-widths, ${FRAME_BORDER_PX}px)`,
          borderStyle: "var(--bbox-region-frame-dash, solid)",
          borderColor: "var(--bbox-region-frame-stroke, var(--border))",
          borderRadius: `var(--bbox-region-frame-radii, ${FRAME_RADIUS})`,
          // Transparent by default, so a cable routed UNDER the frame still
          // reads, and `visible` so the corner card's wall dots may
          // straddle the frame's own edge instead of being clipped off at
          // it (plan §9's "no clip" default — and Zach's `115050`, where
          // the app's frame cut a port in half).
          background: "var(--bbox-region-fill-here)",
          overflow: "visible",
          // For descendants only (see the root's note): a nested frame
          // reads the variant's nested fill, or this frame's own fill when
          // the variant draws no nesting contrast.
          ...({ "--bbox-region-frame-fill": "var(--bbox-region-nested-fill, var(--bbox-region-fill-here))" } as CSSProperties),
        }}
      >
        {/*
          `v2`'s header RULE — the line Zach pointed at in `Pasted image
          20260919115353.png`: the corner card's bottom edge continued across
          the full width of the frame. Rendered BEFORE the corner so the
          card paints over its left run, and placed on the card's own bottom
          border row — the card is pulled back by FRAME_BORDER_PX, so its
          last pixel row is `corner.h - 2 * FRAME_BORDER_PX` in the frame's
          padding box — so the two are one line, not two a pixel apart.
          `display: none` unless the variant turns it on.

          WHY it is ALSO gated on having arms (Zach, 2026-09-20, on v9: "For
          loop and while loops like this no inside lines", against a Branch
          shown WITH them): this rule is the bottom edge of the HEADER BAND —
          it exists to divide the header from the titled arm rows underneath.
          A `for`/`while` region has no arms at all (`FOR_LOOP_PRESET.arms:
          []`; its body is the frame itself), so under v2/v9/v10 — the three
          variants that set `--bbox-region-header-rule-display: block` — it
          was drawing a full-width line across an empty body, dividing
          nothing from nothing.

          BOTH halves of the predicate are load-bearing. `arms.length > 0`
          is the honest test — the arm rows are what the line separates, so a
          branch that lost its arms loses the rule with them. `kind !== "loop"`
          is the belt: a loop must never draw it even holding malformed data,
          and that case is REAL, not hypothetical — `variants.smoke.test.tsx`'s
          own `regionOfKind` helper mints every kind with one `body` arm, so an
          arms-only gate would have kept painting the rule on the very for/while
          regions Zach is complaining about. A future arm-bearing kind (match /
          case) still keeps its rule, because only `"loop"` is excluded.

          The tempting alternative — scoping the token in `regionVariants.css`
          off the already-stamped `[data-region-kind]` — cannot work: this
          display is an INLINE style, so it outranks any stylesheet rule no
          matter how specific.
        */}
        <div
          data-slot="region-header-rule"
          aria-hidden
          style={{
            display: drawsHeaderRuleHere ? "var(--bbox-region-header-rule-display, none)" : "none",
            position: "absolute",
            left: 0,
            right: 0,
            top: layout.corner.h - 2 * FRAME_BORDER_PX,
            height: FRAME_BORDER_PX,
            background: "var(--bbox-region-header-rule-stroke, var(--border))",
            pointerEvents: "none",
          }}
        />
        <div
          ref={cornerRef}
          data-slot="region-corner"
          style={{
            position: "absolute",
            // Pulled back by the frame's border so the two borders land on
            // one line: the corner reads as PART of the frame, which is the
            // whole Labeled Group Node look.
            top: -FRAME_BORDER_PX,
            left: -FRAME_BORDER_PX,
            width: "max-content",
          }}
        >
          {corner}
        </div>
        <div
          data-slot="region-body"
          style={{ position: "absolute", left: 0, top: layout.body.y, width: "100%", height: layout.body.h }}
        >
          <BlockMembers
            layout="free"
            members={members ?? []}
            gap={0}
            gutter={0}
            insetBackground="none"
            showMembers
            showCards={false}
          />
        </div>
        {layout.arms.map((row, index) => (
          <ArmRow key={row.id} arm={(arms ?? [])[index]} row={row} index={index} chevron={spec.arms.chevron} />
        ))}
      </div>
    </div>
  );
}
