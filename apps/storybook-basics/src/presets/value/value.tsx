"use client";

/**
 * src/presets/value/value.tsx — the Value capsule: a PRESET of components
 * that already exist, not a component of its own.
 *
 * Zach, 2026-09-17 (his ruling, verbatim where it decides the design):
 * "A value for me is like a block — it can have many readers and writers
 * but its just we usually collapse them all. Maybe you want to expand them
 * though. **It is just a preset though of the block.** Port edges collapse
 * just like simple view. And then instead of a title, type, etc we just
 * have a single CodeEditor centered. We hide the header and footer, and
 * then you can almost like calculate the corner radius to be equal to half
 * the height."
 *
 * So everything here is a prop combination over the stock seams:
 *
 *  - `Block` with `header`/`footer` simply NOT PASSED — block.tsx already
 *    distinguishes an omitted region (no DOM at all) from an emptied one,
 *    so the capsule has no header/footer region, not a blank strip.
 *  - the one centred single-line `CodeEditor` as `body` — Block's own body
 *    wrapper is already `flex items-center justify-center`, so "centered"
 *    is the stock body contract, not new layout here.
 *  - `BlockPort` with `view="simple"` (collapsed, the usual reading) or
 *    `view="expanded"` (his "maybe you want to expand them"), writers on
 *    the left wall, readers on the right — the same collapse machinery
 *    simple view already ships (`railPlanFor`'s collapsed branch), reused
 *    untouched. His pill insight is exactly why the capsule works: "if you
 *    have collapsed ports they will always go to the center of the diameter
 *    anyways" — the collapsed dot sits at the block's vertical centre,
 *    which IS the centre of the pill's rounded end.
 *  - the pill radius, the ONE piece of geometry this module owns:
 *    `valueCapsuleRadiusPx` below.
 *
 * If a change here ever needs to re-derive a band, a distribution, or a
 * dot position, it has left the preset lane — that work belongs to (and
 * already lives in) blockPort.layout.ts.
 */

import type { LanguageSupport } from "@codemirror/language";
import type { CSSProperties } from "react";

import { Block } from "../../components/block";
import { BlockPort, type BlockEdgeSpec } from "../../components/blockPort";
import { CodeEditor, type CodeEditorProps } from "../../components/codeEditor";
import type { PortSize } from "../../components/port.layout";
import type { PortEdgeItem } from "../../components/portEdge";

/**
 * The radius handed to a capsule that HUGS its content (no `height` prop).
 *
 * WHY a huge constant renders as exactly the same pill as `height / 2`
 * would: CSS Backgrounds & Borders §5.5 ("Overlapping curves") requires
 * the used border-radius values to be proportionally reduced until no two
 * adjacent radii overlap — for a pill (width ≥ height) with equal corners,
 * the two radii sharing each vertical edge sum to 2r > height, so the used
 * value clamps to exactly height / 2, the same rendered geometry the
 * explicit-height branch computes in closed form. The constant is not a
 * magic "looks round enough" number; the CLAMP is the mechanism, and the
 * value only has to be safely larger than any real capsule's half-height.
 */
export const VALUE_PILL_RADIUS_CLAMP_PX = 9999;

/**
 * Zach's rule, as arithmetic: "calculate the corner radius to be equal to
 * half the height." With an explicit height the radius IS half of it; with
 * a hugging capsule the browser's overlap clamp produces the identical
 * used value (see `VALUE_PILL_RADIUS_CLAMP_PX`). This function is the whole
 * of the preset's own geometry.
 */
export function valueCapsuleRadiusPx(height?: number): number {
  return height !== undefined ? height / 2 : VALUE_PILL_RADIUS_CLAMP_PX;
}

/** Below this the hugging editor grows no narrower — a 1-2 char literal
 *  (`x`, `42`) still reads as a field, not a caret sliver. The same floor
 *  `DefaultPortLabel` (labeledPort.tsx) applies to its own editor. */
const MIN_VALUE_COLUMNS = 3;

export interface ValueCapsuleProps {
  /** The expression the capsule shows — its entire face. */
  value: string;
  /** Per-keystroke write, `CodeEditor`'s own contract. Optional because a
   *  gallery specimen may be read-only-by-neglect; a live capsule passes it. */
  onWrite?(value: string): void;
  /** Stamped as `data-block-id` (via `BlockPort`) so wires resolve to it. */
  id?: string;
  /** Ports that WRITE this value — mounted on the left wall. */
  writers?: PortEdgeItem[];
  /** Ports that READ this value — mounted on the right wall. */
  readers?: PortEdgeItem[];
  /**
   * "we usually collapse them all. Maybe you want to expand them though."
   * `false` (default): simple view, every wall collapsed to one centred
   * dot. `true`: expanded view, each port its own labelled dot, evenly
   * distributed — and since the capsule renders no header/footer, the body
   * band IS the whole block, so the spread spans the pill's full height.
   */
  expanded?: boolean;
  /** Explicit width. Omit to hug the value text. */
  width?: number;
  /** Explicit height — the radius becomes exactly `height / 2`. Omit to
   *  hug the editor line (the clamp mechanism keeps the pill exact). */
  height?: number;
  diameter?: PortSize;
  /** Syntax for the value expression, e.g. `python()`. */
  language?: LanguageSupport;
  /**
   * Reach-past overrides forwarded to the underlying `CodeEditor` — the
   * same idiom as `BlockEdgeSpec.portEdgeProps` (blockPort.tsx): the
   * preset's OWN derivation (`value`, `onWrite`, `multiline: false`,
   * `overflow`, `columns`, `language`) always wins over these, because the
   * single-line capsule face is the thing this preset is for.
   */
  codeEditorProps?: Partial<CodeEditorProps>;
  /** Extra style for the capsule (the Block root). `borderRadius` is the
   *  preset's own and deliberately wins — a capsule that is not a pill is
   *  not a Value capsule. */
  style?: CSSProperties;
}

export function ValueCapsule({
  value,
  onWrite,
  id,
  writers,
  readers,
  expanded = false,
  width,
  height,
  diameter = "md",
  language,
  codeEditorProps,
  style,
}: ValueCapsuleProps) {
  const edges: Partial<Record<"left" | "right", BlockEdgeSpec>> = {};
  if (writers && writers.length > 0) edges.left = { items: writers };
  if (readers && readers.length > 0) edges.right = { items: readers };

  return (
    <BlockPort id={id} view={expanded ? "expanded" : "simple"} edges={edges} diameter={diameter}>
      <Block
        width={width}
        height={height}
        // WHY `width: "max-content"` when no width is given: Block's own
        // default is a fixed 320 — a card assumption, not a capsule one. A
        // hugging pill should be exactly as wide as its expression, and the
        // editor below already fixes its own width from `columns`, so
        // max-content is just "wrap that", not a measurement.
        style={{
          borderRadius: valueCapsuleRadiusPx(height),
          ...(width === undefined ? { width: "max-content" } : null),
          ...style,
        }}
        body={
          <CodeEditor
            {...codeEditorProps}
            value={value}
            onWrite={onWrite ?? (() => {})}
            multiline={false}
            language={language}
            // An <input>-like face: a too-long expression is cut at the
            // pill's edge (never wrapped — a wrapped line would grow the
            // box and break the radius-follows-height contract).
            overflow="clip"
            // Sized to the text (DefaultPortLabel's recipe), then CLAMPED
            // by the body via maxWidth below. WHY content-sized rather
            // than fill-the-host: Block's own body is already
            // `justify-center`, so a text-width editor sits centred in the
            // pill ("a single CodeEditor centered") for free; an editor
            // that filled the body would pin a short value to the pill's
            // left edge instead — looked at and rejected on the first
            // visual pass. When the expression outgrows an explicit-width
            // capsule the maxWidth clamp takes over and the editor's own
            // `clip` cuts it at the box edge, start of the expression kept.
            columns={Math.max(MIN_VALUE_COLUMNS, value.length)}
            ariaLabel={codeEditorProps?.ariaLabel ?? "value"}
            // The pill IS the box: the editor's own card chrome (border +
            // background) is turned off via its public `style` seam so the
            // capsule reads as one shape with code text centred in it, not
            // a field floating inside a pill. Focus feedback stays real —
            // CodeMirror's caret and selection — it is only the second
            // border that goes.
            style={{ background: "transparent", borderColor: "transparent", maxWidth: "100%", ...codeEditorProps?.style }}
          />
        }
      />
    </BlockPort>
  );
}
