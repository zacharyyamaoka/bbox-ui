// src/editor/controlGlyphs.tsx — ported from SystemSketch, read-only
// donor at /home/bam/systemsketch, revision
// `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/appearance/AppearanceGlyph.tsx:54-81` — `GLYPH_FAMILIES`, the
//     dispatch-table WHY (quoted below, unedited).
//   • `src/appearance/AppearanceGlyph.tsx:330-506` — every drawn glyph
//     function (`FillGlyph`, `DashGlyph`, `SizeGlyph`, `StrokeWidthGlyph`,
//     `FontGlyph`, `AlignGlyph`, `RoutingGlyph`, `ArrowheadGlyph`) and their
//     small supporting tables (`DASH_ARRAYS`, `SIZE_HEIGHTS`,
//     `GLYPH_UNITS_PER_PX`, `FONT_STACKS`, `VERTICAL_ALIGN_ROWS`) —
//     "already editor-free except swatch" (task brief), copied verbatim.
//   • `src/appearance/AppearanceGlyph.tsx:196-230` — `ColorSwatch`'s shape
//     (an `<span>` painted with a resolved hex, or a `data-mixed` empty
//     swatch when none resolves), reworked as `swatchGlyph` below.
//   • `src/appearance/strokeMeta.ts:87-91` — `STROKE_WIDTH_PX` (the three
//     rung→px values `StrokeWidthGlyph` draws at) and, at `:195-199`,
//     `strokeWidthPxForRung`'s one-line lookup — inlined here as a local
//     const + helper since the donor file itself is not ported (it also
//     carries live shape-metadata read/write this kit has no shape model
//     for; only the three numbers travel).
//
// WHAT CHANGED in the port:
//
//   1. THE GLYPH TABLE BECOMES HOST-EXTENDABLE (design's second required
//      change). The donor's `GLYPH_FAMILIES` is keyed by the closed
//      `ContextualGlyphFamily` union and dispatches through `AppearanceGlyph`/
//      `TriggerGlyph`, both of which also reach for FigJam's traced icon set
//      and an Excalidraw vendored-icon layer ahead of these drawn fallbacks
//      (`AppearanceGlyph.tsx:196-320`) — real engine/app coupling (a `tldraw`
//      `Editor` parameter, `FIGJAM_ICONS`, `TLDRAW_GEO_ICONS`) that has no
//      place in a kit importing no canvas engine. What ports is the
//      DISPATCH SHAPE, not the multi-layer fallback: `GlyphFamilies` is a
//      plain `Record<string, GlyphRenderer>` (an open string key, not the
//      closed union — a host names its own families) exported as
//      `DEFAULT_GLYPH_FAMILIES`, and a host renderer merges its own by
//      spreading (`{ ...DEFAULT_GLYPH_FAMILIES, myKind: myRenderer }`) —
//      still a table, never an if-chain, so a new control that previews
//      like an existing one needs zero renderer changes, same as the donor.
//      The `geo` family is deliberately NOT ported: it dispatches on
//      `TLDRAW_GEO_ICONS`, a tldraw-vendored icon set, i.e. canvas-engine
//      data. A host wanting shape-preview glyphs supplies its own family.
//   2. `swatch` becomes an INJECTED renderer, not a table entry. The donor's
//      `ColorSwatch` reads a live theme via `editor.getCurrentTheme()` — the
//      one genuinely editor-coupled family (this file's own header says so).
//      `swatchGlyph(hexFor)` takes the resolver as a plain function and
//      returns an ordinary `GlyphRenderer`, so a host wires
//      `swatchGlyph((name) => myPalette[name])` into its own merged
//      `GlyphFamilies` under whatever key its vocabulary uses.
//   3. `ArrowheadGlyph`'s `atStart` boolean is no longer a component prop —
//      `GlyphRenderer` takes only `(value)`. The donor's registry keyed
//      START and END as two separate glyph families
//      (`arrowheadStart`/`arrowheadEnd`) precisely so each can close over its
//      own `atStart`; `DEFAULT_GLYPH_FAMILIES` keeps that same two-key split
//      rather than smuggling a second parameter into `GlyphRenderer`.
//   4. `FillGlyph`'s `data-role="solid"` `<rect>` used a fixed `opacity`
//      switch (`value === 'semi' ? 0.35 : 1`) matching a donor constant
//      (`fillPaint.TRANSPARENT_FILL_ALPHA`) this kit does not import — the
//      literal `0.35` travels as a comment-cited number, not a live import.
import type { ReactElement, ReactNode } from "react";

// The glyphs are written AGAINST this stylesheet's contract (outlined by
// default, `[data-role="solid"]` to mean painted), so importing it here rather
// than leaving it to the host is what makes the component self-contained —
// same call codeEditor.tsx:62 makes for codeEditor.css, and what lets the
// registry generator ship it without anyone declaring it by hand.
import "./controlGlyphs.css";

/** One family's preview renderer: a control's raw value in, a drawn (or
    absent) preview out. No editor, no DOM measurement, no engine types. */
export type GlyphRenderer = (value: string | undefined) => ReactNode;

/** An open, host-extendable table — see change (1) above. A host merges its
    own families in by spreading over `DEFAULT_GLYPH_FAMILIES`. */
export type GlyphFamilies = Readonly<Record<string, GlyphRenderer>>;

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" className="bbox-control-glyph" aria-hidden="true">
      {children}
    </svg>
  );
}

/** The fill treatments, drawn on the same square so they can be compared. */
function FillGlyph(value: string | undefined): ReactNode {
  const box = <rect x="3.5" y="3.5" width="13" height="13" rx="2" />;
  if (value === "none") return <Svg>{box}</Svg>;
  if (value === "pattern" || value === "lined-fill") {
    const lines =
      value === "pattern" ? ["M4 12l8-8", "M4 16l12-12", "M8 16l8-8"] : ["M4 8h12", "M4 11.5h12", "M4 15h12"];
    return (
      <Svg>
        {box}
        {lines.map((d) => (
          <path key={d} d={d} strokeWidth={1} />
        ))}
      </Svg>
    );
  }
  // The glyph says what the fill does: Solid is fully painted, Transparent is
  // a wash you can read through. 0.35 matches the donor's own
  // `fillPaint.TRANSPARENT_FILL_ALPHA` closely enough to be recognised in a
  // 16px cell (see change (4) above — the constant travels, the import doesn't).
  const opacity = value === "semi" ? 0.35 : 1;
  return (
    <Svg>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" data-role="solid" opacity={opacity} />
      {box}
    </Svg>
  );
}

/**
 * The glyph's cadence per line style. `async` is a cable's own packet
 * rhythm — a long carrier, a hair of a gap, a short packet — scaled from the
 * 56/4/10/4 the donor canvas paints
 * (`connectionPresentation.ASYNC_PACKET_DASHARRAY`) down to the 14 units this
 * glyph has to say it in.
 */
const DASH_ARRAYS: Record<string, string | undefined> = {
  draw: undefined,
  solid: undefined,
  dashed: "4 3",
  dotted: "0.1 3.2",
  async: "9 1 2 1",
  none: undefined,
};

function DashGlyph(value: string | undefined): ReactNode {
  if (value === "none") {
    return (
      <Svg>
        <path d="M3 17 17 3" data-role="slash" />
        <circle cx="10" cy="10" r="7" />
      </Svg>
    );
  }
  return (
    <Svg>
      <path
        d={value === "draw" ? "M3 12.5c4-6 6 2 14-4.5" : "M3 10h14"}
        strokeDasharray={DASH_ARRAYS[value ?? "solid"]}
        strokeLinecap={value === "dotted" ? "round" : "butt"}
        data-dash={value}
      />
    </Svg>
  );
}

/** A host draws each size at its own size; four bars do the same job compactly. */
const SIZE_HEIGHTS: Record<string, number> = { s: 3, m: 6, l: 9, xl: 13 };

function SizeGlyph(value: string | undefined): ReactNode {
  const height = SIZE_HEIGHTS[value ?? "m"] ?? 6;
  return (
    <Svg>
      <rect x="3" y={10 - height / 2} width="14" height={height} rx={height / 2} data-role="solid" />
    </Svg>
  );
}

// Ported from strokeMeta.ts:87-91 — the three rungs `StrokeWidthGlyph` draws
// at. Not re-exported: a host that needs the pixel value elsewhere owns its
// own copy, same as any other app-side stroke-width policy.
const STROKE_WIDTH_PX: Record<string, number> = { thin: 2, medium: 3.5, thick: 7 };

/** Ported from strokeMeta.ts:195-199 (`strokeWidthPxForRung`). */
function strokeWidthPxForRung(value: string | undefined): number | undefined {
  return value !== undefined && value in STROKE_WIDTH_PX ? STROKE_WIDTH_PX[value] : undefined;
}

/**
 * The thickness rung drawn at the width it actually paints.
 *
 * WHY drawn rather than a traced pair (ported, AppearanceGlyph.tsx:365-372):
 * there are three rungs and a traced icon set commonly has two, so a traced
 * pair plus one invented sibling would be exactly the mismatch a
 * truthful-rendering rule refuses. Plain rules of increasing weight serve
 * both a stacked shape row and a connector's row beside its line styles.
 *
 * The 20-unit box is painted at 24px, so a rung's scene-unit width is
 * divided by that 1.2 ratio to land on screen at the width it will draw on
 * canvas.
 */
const GLYPH_UNITS_PER_PX = 24 / 20;

function StrokeWidthGlyph(value: string | undefined): ReactNode {
  const px = strokeWidthPxForRung(value) ?? STROKE_WIDTH_PX.medium;
  const height = px / GLYPH_UNITS_PER_PX;
  return (
    <Svg>
      <rect x="3" y={10 - height / 2} width="14" height={height} rx={height / 2} data-role="solid" data-width={value} />
    </Svg>
  );
}

const FONT_STACKS: Record<string, string> = {
  sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  draw: '"Comic Sans MS", "Segoe Print", cursive',
};

function FontGlyph(value: string | undefined): ReactNode {
  return (
    <span className="bbox-control-glyph-font" style={{ fontFamily: FONT_STACKS[value ?? "sans"] ?? FONT_STACKS.sans }} aria-hidden="true">
      Aa
    </span>
  );
}

/** Three lines: stacked to one side for vertical, ragged to one side for horizontal. */
const VERTICAL_ALIGN_ROWS: Record<string, readonly number[]> = {
  start: [5, 8.5, 12],
  middle: [6.5, 10, 13.5],
  end: [8, 11.5, 15],
};

function AlignGlyph(value: string | undefined, vertical?: boolean): ReactNode {
  if (vertical) {
    const rows = VERTICAL_ALIGN_ROWS[value ?? "middle"] ?? VERTICAL_ALIGN_ROWS.middle;
    return (
      <Svg>
        {rows.map((y) => (
          <path key={y} d={`M4 ${y}h12`} />
        ))}
      </Svg>
    );
  }
  // The short middle line is what makes the alignment readable at 20px.
  const widths = [14, 8, 14];
  const start = (width: number) => (value === "end" ? 17 - width : value === "middle" ? 10 - width / 2 : 3);
  return (
    <Svg>
      {widths.map((width, index) => (
        <path key={index} d={`M${start(width)} ${6 + index * 4}h${width}`} />
      ))}
    </Svg>
  );
}

function RoutingGlyph(value: string | undefined): ReactNode {
  if (value === "elbow") {
    return (
      <Svg>
        <path d="M3 15h6V5h8" />
      </Svg>
    );
  }
  // `straight` is the canonical Line shape value; `line` is a stock spline
  // style's word for the same thing, kept so a raw style value still draws.
  if (value === "straight" || value === "line") {
    return (
      <Svg>
        <path d="M3 15 17 5" />
      </Svg>
    );
  }
  return (
    <Svg>
      <path d="M3 15c5 0 3-10 14-10" />
    </Svg>
  );
}

/** The line is always drawn the same way; only the cap changes. See change
    (3) above for why `atStart` is baked in per-family rather than a second
    `GlyphRenderer` parameter. */
function arrowheadGlyph(value: string | undefined, atStart: boolean): ReactNode {
  const tip = atStart ? 4 : 16;
  const away = atStart ? 1 : -1;
  const caps: Record<string, ReactElement | null> = {
    none: null,
    arrow: <path d={`M${tip} 10l${4 * away} -3.4M${tip} 10l${4 * away} 3.4`} />,
    triangle: <path d={`M${tip} 10l${5 * away} -3.4v6.8z`} data-role="solid" />,
    inverted: <path d={`M${tip + 5 * away} 10l${-5 * away} -3.4v6.8z`} data-role="solid" />,
    square: <rect x={tip - (atStart ? 0 : 4)} y="7" width="4" height="6" data-role="solid" />,
    dot: <circle cx={tip + 2 * away} cy="10" r="2.6" data-role="solid" />,
    diamond: <path d={`M${tip} 10l${3 * away} -3l${3 * away} 3l${-3 * away} 3z`} data-role="solid" />,
    pipe: <path d={`M${tip} 6.5v7`} />,
    bar: <path d={`M${tip} 6.5v7`} />,
  };
  return (
    <Svg>
      <path d={atStart ? "M6 10h11" : "M3 10h11"} />
      {caps[value ?? "none"]}
    </Svg>
  );
}

/**
 * Every way a value can be previewed without a host renderer's help, keyed
 * by the family name a `ControlDefinition.glyph` names.
 *
 * WHY a lookup instead of a kind if-chain (ported verbatim,
 * AppearanceGlyph.tsx:54-63): a control's KIND is its identity; how its
 * values are drawn is a separate, shareable fact the registry entry
 * declares. Dispatching on kinds is how one donor renderer once missed a
 * routing branch and had its options drawn by the arrowhead renderer
 * instead. A new registry entry that previews like an existing one names its
 * family and touches nothing here; only a genuinely new drawing earns a new
 * entry — or, in the kit, a new key a host spreads in.
 *
 * `swatch` and `geo` are deliberately absent — see changes (1) and (2)
 * above.
 */
export const DEFAULT_GLYPH_FAMILIES: GlyphFamilies = {
  fill: FillGlyph,
  dash: DashGlyph,
  size: SizeGlyph,
  strokeWidth: StrokeWidthGlyph,
  font: FontGlyph,
  align: (value) => AlignGlyph(value, false),
  verticalAlign: (value) => AlignGlyph(value, true),
  routing: RoutingGlyph,
  arrowheadStart: (value) => arrowheadGlyph(value, true),
  arrowheadEnd: (value) => arrowheadGlyph(value, false),
};

/**
 * The one editor-coupled family, injected rather than baked in — see change
 * (2) above. `hexFor` resolves a palette name to a paintable colour; a name
 * with no resolution draws the same empty `data-mixed` swatch the donor drew
 * for a shape with no matching theme entry (ported, AppearanceGlyph.tsx:307-328).
 */
export function swatchGlyph(hexFor: (name: string) => string | undefined): GlyphRenderer {
  return (value) => {
    const fill = value ? hexFor(value) : undefined;
    return <span className="bbox-control-glyph-swatch" data-mixed={fill ? undefined : true} style={fill ? { background: fill } : undefined} />;
  };
}

// ── the paint face ─────────────────────────────────────────────────────────
//
// Ours, not the donor's. The archived app's triggers were a swatch (colour)
// or a fixed traced icon (line style); neither draws the RESULT. This family
// exists because of Zach's 2026-09-24 pick of the "Two Faces" proposal —
// three style triggers, "Inside", "Edge" and text — followed by:
//
//   "no need to put the text (inside and edge) on the drop down menu btw,
//    we can learn to just know it by the icon"
//
// WHY that sentence forces a drawn result rather than a nicer icon: with the
// words gone, the face is the ONLY thing distinguishing the two triggers. A
// paint-bucket and a line icon would name their families and say nothing
// about the shape you have selected, so the bar would read the same whether
// the fill were solid green or absent. A face that paints the actual fill
// treatment, colour and opacity answers "what is it now" at rest, which is
// what pays for dropping the labels.

/** What one face paints. Plain values — no editor, no shape, no engine. */
export interface FacePaint {
  /** Absent, or `hex: undefined`, draws the "no answer" face (a mixed
      selection), never a guess at one member's colour. */
  hex?: string;
  /** `solid` | `semi` | `pattern` | `none`, the fill treatment. Only read by
      an `inside` face. */
  fillStyle?: string;
  /** Painted stroke width in px. Only read by an `edge` face. */
  widthPx?: number;
  /** A `DASH_ARRAYS` key. Only read by an `edge` face. */
  dash?: string;
  /** 0–1. Applies to whichever half this face draws. */
  opacity?: number;
  /** The colour this face is painted ON, as a `#rrggbb` hex. An `edge` face
      compares its stroke against it to decide whether the stroke needs
      lifting off the surface at all (see `PaintFace`). Defaults to
      `PAINT_FACE_DEFAULT_SURFACE`, the pill's; a host that skins the trigger
      names its own surface here, the same seam as `ControlStrip`'s
      `triggerClassName`. */
  surface?: string;
}

/**
 * The surface an edge face assumes when its host names none: the pill's,
 * `PILL_SURFACE` in `floatingToolbar.tsx`.
 *
 * WHY a default at all, and why THIS one is trustworthy rather than a guess
 * the face has no business making: the paint faces exist for the pill's
 * triggers (the "Two Faces" section above — there is no other surface in
 * the kit that mounts one), and the pill's surface is the one colour the kit
 * ships FIXED in both colour schemes, by construction (`PILL_SURFACE`'s own
 * WHY: no token is left for a `prefers-color-scheme` block to flip). So the
 * default is not an assumption about an unknown host; it is the kit's own
 * constant restated, and `PaintFace.stories.tsx` pins the two literals
 * against each other so they cannot drift. Restated rather than imported
 * for the same reason `STROKE_WIDTH_PX` is (above): `floatingToolbar.tsx`
 * pulls the whole Base UI toolbar in, and a glyph module that imports a
 * toolbar to learn one hex would drag that into every registry item this
 * file ships in.
 *
 * WHY not measure the computed background behind the glyph, which would
 * "read" the surface instead of being told it: that is self-measurement,
 * the one thing CLAUDE.md's rule forbids a kit component ("props in, DOM
 * out"), and it would turn this module's plain render functions into a
 * hook-bearing component that paints one frame without the answer and a
 * second with it. A host that re-skins the pill passes `surface` — one
 * field, from the same place it already passes `hex`.
 */
export const PAINT_FACE_DEFAULT_SURFACE = "#1e1e1e";

/**
 * WCAG 2.x relative luminance of a `#rgb` / `#rrggbb` hex, or `undefined`
 * when the string is not one (a `rgb()` string, a palette NAME that never
 * resolved). Formula: WCAG 2.1 §1.4.3, "relative luminance" definition —
 * sRGB channels linearised at the 0.03928 knee, weighted 0.2126/0.7152/0.0722.
 */
function relativeLuminance(hex: string): number | undefined {
  const digits = hex.trim().replace(/^#/, "");
  const six =
    digits.length === 3 ? digits.split("").map((d) => d + d).join("") : digits.length === 6 ? digits : null;
  if (six === null || !/^[0-9a-fA-F]{6}$/.test(six)) return undefined;
  const channel = (offset: number) => {
    const c = Number.parseInt(six.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio (1–21) between two hexes, `undefined` if either does
    not parse — the caller treats "unknown" as "assume the worst". */
export function contrastRatio(a: string, b: string): number | undefined {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === undefined || lb === undefined) return undefined;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG 1.4.11 (non-text contrast): the minimum a graphical mark needs
    against what it sits on. Below it the edge face lifts its stroke. */
export const EDGE_CONTRAST_MIN = 3;

/** The lift, in the face's 20-unit box: how far the ink hairline shows past
    EACH side of the coloured stroke, and how strongly. Half a unit is a hair
    at 24px, and half the ink (5.2:1 on the pill, well over the 3:1 floor)
    is the weight at which a black edge still reads as BLACK with a light
    rim rather than as a grey box — read off 4x captures of the running app,
    2026-09-25; 60% was the first cut and the rim swallowed the stroke. The
    mark stays "the rectangle", edged, not "a rectangle on a plate" (see the
    edge branch of `PaintFace`). */
const HAIRLINE_REACH = 0.5;
const HAIRLINE_OPACITY = 0.5;

/**
 * A trigger face that draws the selection's real paint.
 *
 * Injected the same way `swatchGlyph` is, and for the same reason: resolving
 * a palette name to a paintable colour needs the host's theme, which a kit
 * importing no canvas engine cannot reach. `read` receives the control's own
 * current value (the colour name, or `undefined` when the selection is
 * mixed) and returns everything else the face needs.
 */
export function paintFaceGlyph(
  part: "inside" | "edge",
  read: (value: string | undefined) => FacePaint,
): GlyphRenderer {
  return (value) => <PaintFace part={part} paint={read(value)} />;
}

function PaintFace({ part, paint }: { part: "inside" | "edge"; paint: FacePaint }) {
  const { hex, fillStyle, dash, opacity = 1 } = paint;
  // WHY the id is derived from the colour rather than `useId()`: two faces
  // that hatch the same hex want the SAME pattern, and a bare `id="hatch"`
  // on both would make every face resolve `url(#hatch)` to whichever mounted
  // last. Deriving it also keeps this module hook-free, so it stays the
  // plain render-function module the rest of the file is.
  const patternId = `bbox-face-hatch-${(hex ?? "none").replace("#", "")}`;
  // No resolved colour means a mixed selection: draw the empty face the
  // swatch family draws, never one member's colour standing in for all.
  const mixed = !hex;

  if (part === "inside") {
    const treatment = fillStyle ?? "solid";
    const body =
      mixed || treatment === "none" ? null : treatment === "pattern" ? (
        <>
          <pattern
            id={patternId}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="4" stroke={hex} strokeWidth="1.6" />
          </pattern>
          <rect x="3" y="3" width="14" height="14" rx="3" fill={`url(#${patternId})`} stroke="none" />
        </>
      ) : (
        <rect
          x="3"
          y="3"
          width="14"
          height="14"
          rx="3"
          fill={hex}
          // 0.28 is the alpha the mock's own `semi` face used, close enough
          // to tldraw's transparent fill to be recognised in a 24px cell.
          fillOpacity={treatment === "semi" ? 0.28 : 1}
          stroke="none"
        />
      );
    return (
      <svg viewBox="0 0 20 20" className="bbox-control-glyph" aria-hidden="true" opacity={opacity}>
        {body}
        {/* The keyline is what stops an empty or transparent face reading as
            a rendering failure — there is still a square there. */}
        <rect
          x="3"
          y="3"
          width="14"
          height="14"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity={0.5}
        />
        {/* A mixed selection gets the swatch family's diagonal slash
            (`controlGlyphs.css`'s `[data-mixed]`), and "no fill" does not.
            They were separated only by a keyline opacity of 0.5 vs 0.35 —
            two states that mean "definitely nothing" and "we don't know",
            told apart by a shade. Caught by an audit of this file, not by a
            test: nothing here asserts on how two faces DIFFER.

            No `strokeWidth` on the slash on purpose: `controlGlyphs.css`'s
            `[data-role="slash"]` rule sets 1.5, and a CSS rule outranks a
            presentation attribute — an authored number here would be a number
            this never paints. */}
        {mixed ? (
          <path d="M5 15 15 5" stroke="currentColor" opacity="0.75" data-role="slash" />
        ) : null}
      </svg>
    );
  }

  const widthPx = paint.widthPx ?? 2;
  // The face is a 20-unit box standing for a shape that may be 400px wide, so
  // the real width is compressed rather than reproduced: a 7px "thick" edge
  // drawn at 7 units would swallow the face whole. The ladder stays monotonic,
  // which is the property the face has to preserve.
  const drawn = Math.max(1, Math.min(3.4, 0.9 + widthPx * 0.36));
  const array = dash ? DASH_ARRAYS[dash] : undefined;
  const painted = !mixed && dash !== "none";

  // WHY the lift is CONDITIONAL, and on a measured number: the face used to
  // draw a `currentColor` keyline under every coloured stroke, 1.6 units
  // wider than the stroke at 22% ink — a grey plate the stroke sat on. Zach,
  // 2026-09-25: "I don't like the grey background behind the edge. ideally
  // the edge is rendered as if it itself was just the rectangle you are
  // formatting.. you wouldn't see that background." So a stroke that can be
  // seen on its own is drawn ALONE — for twelve of tldraw's thirteen palette
  // colours in light mode and all thirteen in dark, the face is the rectangle
  // and nothing else.
  //
  // The tempting fix was to delete the keyline outright, and that ships the
  // bug it existed for straight back: measured in the running app, a fresh
  // geo's edge is tldraw's light-mode `black` (#1d1d1d) and the pill is
  // #1e1e1e — 1.01:1 — so a bare black stroke on the bar is invisible and
  // the trigger reads as a lone chevron. The other tempting fix, a thinner
  // plate, keeps a plate. So: compute the stroke's contrast against the
  // surface it is actually on, and only when it misses WCAG's 3:1 graphics
  // floor add the least that makes the stroke findable — a hairline of the
  // surface's own ink hugging the mark's exact shape (same path, same dash,
  // same cap, half a unit past each side), painted under it. It reads as the
  // rectangle's own edge, not as something behind it. A hex that does not
  // parse counts as failing: lifting a stroke that did not need it costs a
  // hairline; not lifting one that did costs the whole face.
  const surface = paint.surface ?? PAINT_FACE_DEFAULT_SURFACE;
  const contrast = painted && hex ? contrastRatio(hex, surface) : undefined;
  const lifted = painted && !(contrast !== undefined && contrast >= EDGE_CONTRAST_MIN);

  // One mark, drawn twice at most: once as the ink hairline (when lifted),
  // once in the selection's colour on top. Sharing the geometry is what
  // guarantees the hairline can never be a different shape from the stroke.
  const mark = (
    stroke: string,
    strokeWidth: number,
    stamp: { "data-dash": string | undefined } | { "data-role": "hairline"; strokeOpacity: number },
  ): ReactNode =>
    dash === "draw" ? (
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" {...stamp}>
        {/* WHY four separate strokes that OVERSHOOT and cross at the corners,
            not a wobbled outline: the wobble shipped first and was
            indistinguishable from `solid` at 24px — a 14-unit box cannot
            carry a deviation small enough to look like a hand and large
            enough to see. Gaps at the corners were the second attempt and
            did not survive contact with the round caps: at the thick rung
            the cap radius is 1.7 units and the gaps were 1, so the caps
            closed them and the face was a rounded rect again. Crossing
            cannot be closed by a cap, so it reads at every width, and it is
            what a sketched box actually looks like. */}
        <path d="M4.0 3.8 16.4 2.9" />
        <path d="M16.0 3.6 17.0 16.2" />
        <path d="M16.2 16.0 3.7 17.0" />
        <path d="M4.0 16.4 3.0 3.9" />
      </g>
    ) : (
      <rect
        x="3"
        y="3"
        width="14"
        height="14"
        rx="3"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={array}
        strokeLinecap={dash === "dotted" ? "round" : "butt"}
        {...stamp}
      />
    );

  return (
    <svg viewBox="0 0 20 20" className="bbox-control-glyph" aria-hidden="true" opacity={opacity}>
      {/* `none` and `mixed` paint NO colour, so a neutral keyline IS the face.
          `none` first shipped as a 1px dashed stroke in the edge's own colour,
          which on a green shape read as "a thin dashed green edge" — the one
          thing it does not mean; the ink keyline alone is the honest drawing
          of "there is no edge", and without it the trigger is a bare chevron
          that reads as a rendering failure. `mixed` adds the swatch family's
          diagonal slash so "we don't know" cannot be confused with "there is
          no edge". Every one of these was read off a contact sheet rather
          than reasoned about. */}
      {painted ? null : (
        <rect
          x="3"
          y="3"
          width="14"
          height="14"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.45}
          strokeWidth={1.2}
          data-role="keyline"
        />
      )}
      {mixed ? <path d="M5 15 15 5" stroke="currentColor" opacity="0.75" data-role="slash" /> : null}
      {lifted
        ? mark("currentColor", drawn + 2 * HAIRLINE_REACH, {
            "data-role": "hairline",
            strokeOpacity: HAIRLINE_OPACITY,
          })
        : null}
      {painted ? mark(hex!, drawn, { "data-dash": dash }) : null}
    </svg>
  );
}
