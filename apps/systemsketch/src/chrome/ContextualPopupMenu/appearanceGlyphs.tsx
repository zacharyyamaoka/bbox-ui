/**
 * The host half of the control kit's glyph table — the families that need
 * this editor and therefore cannot live in the trunk.
 *
 * The trunk's `controlGlyphs.tsx` ships every family that can be drawn from a
 * raw value alone (fill, dash, size, strokeWidth, font, align, routing,
 * arrowheads) and deliberately ships NO `swatch` and no `geo`: one needs the
 * live theme to resolve a palette name to a hex, the other needs tldraw's geo
 * vocabulary. Both are injected here by spreading over
 * `DEFAULT_GLYPH_FAMILIES`, which is the seam that file documents.
 *
 * The two FACE families are new, and they exist because of one sentence.
 * Zach, 2026-09-24, choosing the "Two Faces" toolbar:
 *
 *   "no need to put the text (inside and edge) on the drop down menu btw,
 *    we can learn to just know it by the icon"
 *
 * WHY that makes a drawn result the only option: with the words gone, the
 * face is the ONLY thing telling the two triggers apart. A paint-bucket and a
 * line icon would name their families and say nothing about the shape you
 * have selected — the bar would read identically whether the fill were solid
 * green or absent. A face painted from the selection's real fill treatment,
 * colour and opacity answers "what is it now" at rest, and that is what pays
 * for dropping the labels.
 */
import type { Editor } from "tldraw";

import {
  DEFAULT_GLYPH_FAMILIES,
  paintFaceGlyph,
  swatchGlyph,
  type GlyphFamilies,
} from "@trunk/editor/controlGlyphs";

import { swatchColorFor } from "./arrangeActions";

/** A regular n-gon inscribed in the glyph's 20-unit box. */
function polygon(sides: number, rotationDeg: number, radius = 7.4): string {
  const cx = 10;
  const cy = 10;
  const start = (rotationDeg * Math.PI) / 180;
  const points = Array.from({ length: sides }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / sides;
    return `${(cx + radius * Math.cos(a)).toFixed(2)} ${(cy + radius * Math.sin(a)).toFixed(2)}`;
  });
  return `M${points.join("L")}Z`;
}

/** A 5/2 star, the same construction tldraw's own star shape uses. */
function star(): string {
  const cx = 10;
  const cy = 10;
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? 8 : 3.4;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

/**
 * One path per geo value.
 *
 * Only the regular polygons are computed; the rest are drawn, because a
 * trapezoid and a cloud are not n-gons and pretending otherwise would draw
 * neither. A value with no entry falls through to the rectangle rather than
 * rendering an empty cell — tldraw adds geo shapes between minor versions,
 * and a missing preview should degrade to "a shape" rather than to nothing.
 */
const GEO_PATHS: Readonly<Record<string, string>> = {
  rectangle: "M3 5h14v10H3Z",
  "x-box": "M3 5h14v10H3ZM3 5l14 10M17 5 3 15",
  "check-box": "M3 5h14v10H3ZM6.5 10.2l2.4 2.4 4.6-5",
  ellipse: "M10 2.6a7.4 5.9 0 1 0 .01 0Z",
  oval: "M6.4 4.6h7.2a5.4 5.4 0 0 1 0 10.8H6.4a5.4 5.4 0 0 1 0-10.8Z",
  triangle: polygon(3, -90),
  diamond: polygon(4, -90),
  pentagon: polygon(5, -90),
  hexagon: polygon(6, -90),
  octagon: polygon(8, -90 + 22.5),
  star: star(),
  rhombus: "M6 4.6h10L14 15.4H4Z",
  "rhombus-2": "M4 4.6h10l-2 10.8H2Z",
  trapezoid: "M6.2 4.6h7.6L17 15.4H3Z",
  cloud:
    "M6.2 14.4a3.2 3.2 0 0 1-.2-6.4 4.2 4.2 0 0 1 8-1.3 3 3 0 0 1 .6 7.7Z",
  heart: "M10 15.4S3.4 11.3 3.4 7.9a3.3 3.3 0 0 1 6.6-1 3.3 3.3 0 0 1 6.6 1c0 3.4-6.6 7.5-6.6 7.5Z",
  "arrow-right": "M3 8h8V5l6 5-6 5v-3H3Z",
  "arrow-left": "M17 8H9V5l-6 5 6 5v-3h8Z",
  "arrow-up": "M8 17V9H5l5-6 5 6h-3v8Z",
  "arrow-down": "M8 3v8H5l5 6 5-6h-3V3Z",
};

/**
 * The geo family the trunk leaves to the host. Outlined, so it reads as a
 * shape picker rather than as a row of solid blobs — and so `controlGlyphs.css`
 * (`fill: none; stroke: currentcolor`) is doing the painting, which is what
 * keeps it matching every other family in the panel.
 */
function GeoGlyph(value: string | undefined) {
  const d = (value && GEO_PATHS[value]) || GEO_PATHS.rectangle;
  return (
    <svg viewBox="0 0 20 20" className="bbox-control-glyph" aria-hidden="true">
      <path d={d} strokeWidth={1.4} />
    </svg>
  );
}

/**
 * The Shape trigger's face: the FAMILY, not the current value.
 *
 * Zach, 2026-09-25, on the trigger that drew whichever geo was selected:
 * *"This icon should remain as it was before with like more of a shape
 * selector that shows a square that looks like the ones for the formatting
 * but then perhaps also a circle."*
 *
 * WHY a family mark here when Inside and Edge deliberately preview their
 * value: those two answer "what does this shape look like now", a question
 * whose answer is invisible until you look. The geo is the shape ITSELF —
 * it is already on the canvas at full size, so previewing it on a 24px
 * trigger repeats what the board already says and costs the one thing a
 * family mark buys, which is telling you what the button is for.
 *
 * The square is the faces' own idiom (a rounded rect, same corner radius),
 * so the four triggers read as one set; the circle beside it is what makes
 * it a picker rather than a fifth face.
 */
function GeoFamilyGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="bbox-control-glyph" aria-hidden="true">
      <circle cx="7.8" cy="7.8" r="4.4" strokeWidth={1.5} />
      <rect x="8.4" y="8.4" width="8.4" height="8.4" rx="2.4" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * The edge-link chips. Lucide's `link` / `unlink`, because the chain is a
 * convention people already read as "these two move together" — and because
 * the BROKEN state has to be as legible as the whole one. Zach's rule is that
 * the edge follows the fill "unless you specifically set the stroke color,
 * then it now indepently moves", so the chip row is both the readout and the
 * only way back.
 */
function LinkGlyph(value: string | undefined) {
  const broken = value === "custom";
  return (
    <svg viewBox="0 0 24 24" className="bbox-control-glyph" aria-hidden="true">
      {broken ? (
        <>
          <path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          <path d="m2 2 3 3" />
          <path d="m19 19 3 3" />
        </>
      ) : (
        <>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </>
      )}
    </svg>
  );
}

/**
 * The Text trigger's face: "Aa" drawn in the selection's own typeface, with
 * its real px beside it.
 *
 * WHY it is a glyph rather than the kit's `trigger: "text"` combobox: that
 * shape is a fixed 144px cell (`controlStrip.tsx`, matching FigJam's own
 * `TEXT_TRIGGER_WIDTH`), which is most of the width this bar was compacted to
 * save. "Aa" plus a number says the same two things — which family, and how
 * big it actually is — in a third of the space, and it keeps all three style
 * triggers the same shape.
 */
function typeFaceGlyph(read: () => { px: number | null; fontFamily?: string }) {
  return () => {
    const { px, fontFamily } = read();
    return (
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="bbox-control-glyph-font" style={fontFamily ? { fontFamily } : undefined}>
          Aa
        </span>
        {px === null ? null : (
          <span className="text-[11px] tabular-nums opacity-70">{formatPx(px)}</span>
        )}
      </span>
    );
  };
}

function formatPx(px: number): string {
  const rounded = Math.round(px * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * P-035's diff mark. Not a colour and not a paint: the value is a WORD
 * ("Added"), and the colour is how the board paints it, not what it is — which
 * is why the old bar gave it a family icon rather than a swatch, and why it
 * keeps one here.
 */
function DiffGlyph(value: string | undefined) {
  return (
    <svg viewBox="0 0 24 24" className="bbox-control-glyph" aria-hidden="true" data-diff={value}>
      <path d="M16 3h5v5" />
      <path d="M8 3H3v5" />
      <path d="M3 16v5h5" />
      <path d="M21 16v5h-5" />
      <path d="M9 12h6" />
    </svg>
  );
}

/** What the two paint faces need to read out of the live selection. */
export interface FaceReaders {
  inside(value: string | undefined): {
    hex?: string;
    fillStyle?: string;
    opacity?: number;
  };
  edge(value: string | undefined): {
    hex?: string;
    widthPx?: number;
    dash?: string;
    opacity?: number;
  };
  type(): { px: number | null; fontFamily?: string };
}

/**
 * The whole table this pill renders with: the trunk's drawn families, plus
 * the four that need the editor.
 *
 * Rebuilt per render rather than memoised on purpose — every family here is a
 * closure over the CURRENT selection, and a stale one would paint the
 * previous shape's colour on the new shape's trigger. The renderers are
 * cheap; the correctness is not negotiable.
 */
export function appearanceGlyphs(editor: Editor, read: FaceReaders): GlyphFamilies {
  return {
    ...DEFAULT_GLYPH_FAMILIES,
    geo: GeoGlyph,
    geoFamily: GeoFamilyGlyph,
    link: LinkGlyph,
    diff: DiffGlyph,
    swatch: swatchGlyph((name) => swatchColorFor(editor, name) ?? undefined),
    insideFace: paintFaceGlyph("inside", read.inside),
    edgeFace: paintFaceGlyph("edge", read.edge),
    typeFace: typeFaceGlyph(read.type),
  };
}
