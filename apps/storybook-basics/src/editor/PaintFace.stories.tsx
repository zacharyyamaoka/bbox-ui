import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { cn } from "../lib/utils";
import { ControlPanel } from "./controlPanel";
import {
  EDGE_CONTRAST_MIN,
  PAINT_FACE_DEFAULT_SURFACE,
  paintFaceGlyph,
  type FacePaint,
} from "./controlGlyphs";
import { demoGlyphs, demoRegistry } from "./ControlStrip.stories";
import { PILL_RADIUS, PILL_SURFACE, PILL_SURFACE_HEX } from "./floatingToolbar";

/**
 * src/editor/PaintFace.stories.tsx — `paintFaceGlyph` (controlGlyphs.tsx), the
 * trigger face that draws the selection's REAL paint, plus the continuous
 * channel (`ContinuousBinding`) that took opacity off the bar.
 *
 * WHY this page exists beside `controlGlyphs.stories.tsx`: that one is the
 * contact sheet for `DEFAULT_GLYPH_FAMILIES`, families whose drawing names a
 * VALUE from a closed vocabulary. A paint face is the opposite — it names
 * nothing and draws the answer, because Zach's 2026-09-24 pick dropped the
 * words off the Inside/Edge/Text triggers ("we can learn to just know it by
 * the icon"). With the words gone the face is the only thing distinguishing
 * two triggers, so "do the faces actually differ" stops being a nicety and
 * becomes the contract.
 *
 * WHY the play functions read COMPUTED STYLE rather than DOM presence:
 * controlGlyphs.css's own header records the exact failure this page is
 * written against — every glyph once shipped as an identical near-invisible
 * black square because its stylesheet was never ported, and every story
 * still passed, "because a play function asserts roles and presence and
 * never asks what colour anything is." A `<rect>` being in the document
 * proves nothing about a face whose whole job is to be visibly different
 * from its neighbour. So `FacesAreDistinguishable` below asks Chrome what it
 * actually painted — `fill`, `fill-opacity`, `opacity`, `stroke-width`, and
 * which element was chosen — and counts distinct answers.
 *
 * Every assertion here has been watched to fail (2026-09-24), because a gate
 * nobody has seen go red is not a gate:
 *   • collapse the four fill treatments to one → the Set drops 4 → 1;
 *   • let the `draw` cadence fall through to the plain rect → the cadence Set
 *     drops 6 → 5 and the named `draw` vs `solid` check reports the collision;
 *   • drop the mixed face's slash → the `none`-vs-mixed check reports that a
 *     mixed face is a shade away from "no fill".
 */

// ---------------------------------------------------------------------------
// Demo paint — a HOST's vocabulary, not the module's. `paintFaceGlyph` takes
// `(value) => FacePaint`, so what a value MEANS is the host's business; these
// records are this page standing in for one.
// ---------------------------------------------------------------------------

const FACE_HEX = "#22c55e";

/** Every treatment `FacePaint.fillStyle` is documented to carry. */
const FILL_TREATMENTS = ["solid", "semi", "pattern", "none"] as const;

/** Every key of `DASH_ARRAYS` (controlGlyphs.tsx — module-private, so the
    list is restated here rather than imported). `none` is both a dash key
    and the face's own "no edge" case. */
const DASH_KEYS = ["solid", "draw", "dashed", "dotted", "async", "none"] as const;

/** The three rungs `STROKE_WIDTH_PX` paints at (controlGlyphs.tsx, private
    for the same reason). The face compresses these; it must not reorder them. */
const EDGE_WIDTHS = [2, 3.5, 7] as const;

/** The value a face resolves to nothing for — a mixed selection. `read`
    returns a `FacePaint` with no `hex`, which is the documented "no answer"
    input, never one member's colour standing in for all. */
const MIXED = "mixed";

const INSIDE_PAINTS: Record<string, FacePaint> = {
  ...Object.fromEntries(FILL_TREATMENTS.map((fillStyle) => [fillStyle, { hex: FACE_HEX, fillStyle }])),
  [MIXED]: {},
};

/**
 * tldraw's light-mode `black`, the one palette colour that cannot be seen
 * on the pill unaided (1.01:1 against #1e1e1e). The face lifts it with an
 * ink hairline; every other colour on this page is drawn bare.
 */
const LOW_CONTRAST_HEX = "#1d1d1d";

const EDGE_PAINTS: Record<string, FacePaint> = {
  ...Object.fromEntries(
    DASH_KEYS.map((dash) => [`dash-${dash}`, { hex: FACE_HEX, dash, widthPx: 3.5, surface: PILL_SURFACE_HEX }]),
  ),
  ...Object.fromEntries(
    EDGE_WIDTHS.map((widthPx) => [
      `width-${widthPx}`,
      { hex: FACE_HEX, dash: "solid", widthPx, surface: PILL_SURFACE_HEX },
    ]),
  ),
  ...Object.fromEntries(
    DASH_KEYS.filter((dash) => dash !== "none").map((dash) => [
      `lift-${dash}`,
      { hex: LOW_CONTRAST_HEX, dash, widthPx: 3.5, surface: PILL_SURFACE_HEX },
    ]),
  ),
  [MIXED]: {},
};

const insideFace = paintFaceGlyph("inside", (value) => INSIDE_PAINTS[value ?? MIXED] ?? {});
const edgeFace = paintFaceGlyph("edge", (value) => EDGE_PAINTS[value ?? MIXED] ?? {});

const INSIDE_KEYS = [...FILL_TREATMENTS, MIXED];
const EDGE_KEYS = [
  ...DASH_KEYS.map((dash) => `dash-${dash}`),
  ...EDGE_WIDTHS.map((px) => `width-${px}`),
  MIXED,
];
const LIFT_KEYS = DASH_KEYS.filter((dash) => dash !== "none").map((dash) => `lift-${dash}`);

function Cell({ testId, label, children }: { testId: string; label: string; children: ReactNode }) {
  return (
    <div
      data-testid={testId}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 64 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 6,
          border: "1px solid color-mix(in oklab, currentColor 15%, transparent)",
        }}
      >
        {children}
      </div>
      <span style={{ fontSize: 9, opacity: 0.6 }}>{label}</span>
    </div>
  );
}

/**
 * Every face on this page sits on the pill — the surface the faces exist
 * for, and the one `PAINT_FACE_DEFAULT_SURFACE` names. Photographing them on
 * the page background would show a face nobody ships.
 */
function OnThePill({ children }: { children: ReactNode }) {
  return <div className={cn(PILL_SURFACE, PILL_RADIUS, "flex w-fit flex-col gap-4 p-3")}>{children}</div>;
}

function FaceRow({
  part,
  keys,
  title,
}: {
  part: "inside" | "edge";
  keys: readonly string[];
  title: string;
}) {
  const render = part === "inside" ? insideFace : edgeFace;
  return (
    <div data-testid={`faces-${part}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600 }}>{title}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {keys.map((key) => (
          <Cell key={key} testId={`face-${part}-${key}`} label={key}>
            {render(key)}
          </Cell>
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: "Editor/Menus & Bars/PaintFace",
  // WHY no `host:` tag despite this being DOM-only: `storyOrganisation.test.ts`
  // MEASURES host tags by walking a file's runtime imports, and `host:dom`
  // means specifically "reaches src/hosts/domCanvas.tsx". A paint face draws
  // through no host at all — that is the point of a kit importing no canvas
  // engine — so declaring one would be a claim the test can prove false.
  tags: ["object:chrome", "lane:two-faces-toolbar"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The inside face across every fill treatment, plus the mixed case.
 *
 * The four treatments are the whole reason this face is drawn rather than
 * iconified: a paint bucket icon reads the same whether the shape is filled
 * solid green, washed at 28%, hatched, or empty.
 */
export const InsideFaces: Story = {
  render: () => (
    <OnThePill>
      <FaceRow part="inside" keys={INSIDE_KEYS} title="inside — one face per fill treatment" />
    </OnThePill>
  ),
};

/**
 * The edge face across every `DASH_ARRAYS` key and every painted width rung.
 *
 * Two axes, shown separately on purpose: a dash is a SHAPE (the face
 * reproduces the array) while a width is a QUANTITY the face deliberately
 * compresses — 7px drawn at 7 units would swallow a 20-unit box whole. Only
 * the ordering survives compression, which is what `FacesAreDistinguishable`
 * pins.
 *
 * The third row is the one colour the pill cannot show unaided — tldraw's
 * light-mode `black`, 1.01:1 against the bar — at every cadence. That is
 * the only row on this page with anything drawn besides the rectangle
 * itself: a half-unit hairline of the pill's ink hugging the stroke's own
 * shape. Zach, 2026-09-25: "ideally the edge is rendered as if it itself
 * was just the rectangle you are formatting.. you wouldn't see that
 * background" — so rows one and two are exactly that, and row three is the
 * least that keeps a black edge findable on a black bar.
 */
export const EdgeFaces: Story = {
  render: () => (
    <OnThePill>
      <FaceRow
        part="edge"
        keys={[...DASH_KEYS.map((dash) => `dash-${dash}`), MIXED]}
        title="edge — every dash, at one width"
      />
      <FaceRow
        part="edge"
        keys={EDGE_WIDTHS.map((px) => `width-${px}`)}
        title="edge — every painted width, solid"
      />
      <FaceRow part="edge" keys={LIFT_KEYS} title="edge — black on the pill, lifted by a hairline" />
    </OnThePill>
  ),
};

function rectsIn(face: Element): SVGRectElement[] {
  const rects = [...face.querySelectorAll("rect")];
  if (rects.length === 0) throw new Error("a face drew no rect at all");
  return rects;
}

/** Every `<rect>` a face painted, as the browser resolved it. */
function paintSignature(face: Element): string {
  return rectsIn(face)
    .map((rect) => {
      const style = getComputedStyle(rect);
      return `${style.fill}|${style.fillOpacity}|${style.opacity}`;
    })
    .join(" + ");
}

/** The rect an INSIDE face answers its colour with — the filled one, not the
    keyline that keeps an empty face from reading as a rendering failure. */
function bodyRect(face: Element): SVGRectElement {
  const rect = rectsIn(face).find((candidate) => getComputedStyle(candidate).fill !== "none");
  if (!rect) throw new Error("this face filled nothing");
  return rect;
}

/** Everything a face drew, in paint order. */
function faceMarks(face: Element): SVGElement[] {
  return [...face.querySelectorAll<SVGElement>("svg > *")];
}

/**
 * The mark carrying the SELECTION's colour, or `null` when the face is
 * deliberately painting none.
 *
 * WHY nullable: two cadences are the control's own ink and nothing else on
 * purpose — `none` draws a `data-role="keyline"` alone, a mixed face the
 * keyline plus its slash — so "which element is the colour" genuinely has
 * no answer there, and a helper that insisted on one would hand back the
 * keyline and quietly compare the wrong thing. A lifted face (a black edge
 * on the pill) also draws a `data-role="hairline"` under its colour, in ink;
 * it is not the colour either.
 *
 * WHY it cannot assume a tag either: `draw` is a `<g>` of four overshooting
 * strokes, every other cadence a `<rect>`. `data-dash` is the stamp both
 * branches share, and the stamp only the coloured mark carries.
 */
function colourMark(face: Element): SVGElement | null {
  return face.querySelector<SVGElement>("svg > [data-dash]");
}

/** The ink hairline a lifted edge face draws under its colour, or `null`
    when the face judged its stroke visible on its own. */
function hairline(face: Element): SVGElement | null {
  return face.querySelector<SVGElement>('svg > [data-role="hairline"]');
}

/**
 * What one edge cadence resolved to — every mark it drew, the element it
 * chose as well as the geometry.
 *
 * WHY the whole face and not just the coloured mark: `none` paints no
 * coloured mark at all and says "no edge" through its keyline alone, so a
 * signature scoped to the colour could not tell it from a mixed face. And
 * `draw` differs from `solid` by TAG before it differs by anything a
 * dasharray can express, which is the collision this exists to catch.
 *
 * WHY `data-dash` is deliberately NOT in it, although it is right there and
 * would be the obvious thing to read: it is an identity stamp, not paint.
 * Including it makes every cadence trivially unique — the set-size check
 * below could then never fail, which is the shape of assertion this whole
 * file exists to avoid. Measured: with the stamp in, collapsing `draw` into
 * the plain rect left the signatures distinct and the gate green. Every
 * field here is something a reader of the glyph can actually see.
 */
function dashSignature(face: Element): string {
  return faceMarks(face)
    .map((mark) => {
      const style = getComputedStyle(mark);
      return [
        mark.tagName,
        style.strokeDasharray,
        style.strokeWidth,
        style.strokeLinecap,
        style.strokeOpacity,
        // The selection's colour, or the control's own ink — the difference
        // between "this edge is green" and "there is no edge".
        style.stroke === style.color ? "ink" : "colour",
        // `draw` is four overshooting strokes; a box is one shape.
        `${mark.childElementCount}`,
      ].join("|");
    })
    .join(" + ");
}

/**
 * The gate. Four properties, each of which a presence-only assertion would
 * pass while the face was broken:
 *
 *   1. the four fill treatments resolve to four DIFFERENT painted signatures,
 *   2. a mixed face paints no colour at all — not a dimmed member's colour —
 *      and is told apart from "no fill" by a slash, not by a shade,
 *   3. every dash cadence paints differently, `draw` and `solid` included,
 *   4. the compressed widths stay strictly ordered.
 *
 * Each one is mutation-tested; see the file header.
 */
export const FacesAreDistinguishable: Story = {
  render: () => (
    <OnThePill>
      <FaceRow part="inside" keys={INSIDE_KEYS} title="inside" />
      <FaceRow part="edge" keys={EDGE_KEYS} title="edge" />
    </OnThePill>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // WHY findBy first (CLAUDE.md): every assertion below is comparative or
    // negative, and both are vacuously true against a DOM that has not
    // mounted yet. Awaiting one real element is what gives the rest
    // something to be false about.
    await canvas.findByTestId("face-inside-solid");
    const face = (part: string, key: string) => canvas.getByTestId(`face-${part}-${key}`);

    // ---- 1. four treatments, four different paintings ----------------------
    const signatures = FILL_TREATMENTS.map((treatment) => paintSignature(face("inside", treatment)));
    await expect(
      new Set(signatures).size,
      `the four fill treatments collapsed to ${new Set(signatures).size} painting(s): ${signatures.join(" / ")}`,
    ).toBe(FILL_TREATMENTS.length);

    // The hatched treatment genuinely hatches (a paint server, not a flat
    // colour that merely differs by a hair of opacity).
    await expect(getComputedStyle(bodyRect(face("inside", "pattern"))).fill).toContain("url(");

    // ---- 2. a mixed face paints NO colour ---------------------------------
    const painted = new Set(
      FILL_TREATMENTS.filter((treatment) => treatment !== "none").map(
        (treatment) => getComputedStyle(bodyRect(face("inside", treatment))).fill,
      ),
    );
    for (const rect of rectsIn(face("inside", MIXED))) {
      const fill = getComputedStyle(rect).fill;
      await expect(fill).toBe("none");
      await expect(painted.has(fill)).toBe(false);
    }

    // "No fill" and "we don't know" are different answers, so they must not
    // be told apart by a shade: a mixed face carries the swatch family's
    // diagonal slash, a `none` face carries the keyline alone.
    await expect(
      face("inside", MIXED).querySelector('[data-role="slash"]'),
      "a mixed inside face drew no slash — it is a shade away from `none`",
    ).not.toBeNull();
    await expect(
      face("inside", "none").querySelector('[data-role="slash"]'),
      "a `none` face drew a slash, so it now reads as mixed",
    ).toBeNull();
    // Neither of them may leak a palette colour in doing it.
    for (const key of [MIXED, "none"]) {
      for (const mark of face("inside", key).querySelectorAll("svg > *")) {
        const style = getComputedStyle(mark);
        await expect(painted.has(style.fill)).toBe(false);
        await expect(painted.has(style.stroke)).toBe(false);
      }
    }

    // The edge half of the same rule. A resolved edge inks itself in the
    // SELECTION's colour (so its stroke is not the control's own ink)…
    const colouredEdge = colourMark(face("edge", "dash-solid"));
    await expect(colouredEdge).not.toBeNull();
    const solidEdge = getComputedStyle(colouredEdge!);
    await expect(solidEdge.stroke).not.toBe(solidEdge.color);
    // …and a mixed one never does: it paints no coloured mark at all, and
    // EVERY mark it does draw — keyline and slash — is the control's own
    // `currentColor`, so no member's colour can leak out as if it spoke for
    // the whole selection.
    await expect(colourMark(face("edge", MIXED))).toBeNull();
    for (const mark of faceMarks(face("edge", MIXED))) {
      const style = getComputedStyle(mark);
      await expect(style.stroke).toBe(style.color);
      await expect(style.stroke).not.toBe(solidEdge.stroke);
    }

    // ---- 3. every cadence paints differently ------------------------------
    // Withheld on the first pass, because `draw` and `solid` genuinely
    // collided: both are `undefined` in `DASH_ARRAYS`, and the face read only
    // the cadence. `draw` now emits a freehand `<path>` the way `DashGlyph`
    // has always drawn it, so the whole key set can be pinned.
    const dashes = DASH_KEYS.map((dash) => dashSignature(face("edge", `dash-${dash}`)));
    await expect(
      new Set(dashes).size,
      `the ${DASH_KEYS.length} cadences collapsed to ${new Set(dashes).size}: ${dashes.join(" / ")}`,
    ).toBe(DASH_KEYS.length);
    // Named explicitly, because this pair is the one that regressed and a
    // set-size check alone would not say which two collided.
    await expect(
      dashSignature(face("edge", "dash-draw")),
      "a hand-drawn edge paints the same as a ruled one",
    ).not.toBe(dashSignature(face("edge", "dash-solid")));
    // The resolved ELEMENT, not only its attributes: `draw` is a group of
    // overshooting strokes, `solid` a single rounded box.
    await expect(colourMark(face("edge", "dash-draw"))!.tagName.toLowerCase()).toBe("g");
    await expect(colourMark(face("edge", "dash-solid"))!.tagName.toLowerCase()).toBe("rect");
    // "No edge" paints no colour — `controlGlyphs.tsx`'s own WHY: a 1px
    // dashed stroke in the edge's colour read as "a thin dashed green edge",
    // the one thing `none` does not mean.
    await expect(
      colourMark(face("edge", "dash-none")),
      "`none` painted a coloured mark, so it reads as a thin coloured edge",
    ).toBeNull();

    // ---- 4. compressed widths stay strictly ordered ------------------------
    const drawn = EDGE_WIDTHS.map((px) =>
      Number.parseFloat(getComputedStyle(colourMark(face("edge", `width-${px}`))!).strokeWidth),
    );
    for (const width of drawn) await expect(width).toBeGreaterThan(0);
    for (let i = 1; i < drawn.length; i += 1) {
      await expect(
        drawn[i],
        `width ${EDGE_WIDTHS[i]}px drew at ${drawn[i]}, not above ${EDGE_WIDTHS[i - 1]}px's ${drawn[i - 1]}`,
      ).toBeGreaterThan(drawn[i - 1]);
    }
    // …and they really are COMPRESSED, not reproduced: the thickest rung is
    // drawn far below its real px, which is the trade monotonicity pays for.
    await expect(drawn[drawn.length - 1]).toBeLessThan(EDGE_WIDTHS[EDGE_WIDTHS.length - 1]);

    // ---- 5. a visible colour is the rectangle and NOTHING else --------------
    // Every green face above cleared the pill on its own, so none of them
    // may carry a hairline: the face is only the shape being formatted.
    for (const key of EDGE_KEYS) {
      await expect(
        hairline(face("edge", key)),
        `${key} drew a hairline it did not need — that is the plate Zach rejected`,
      ).toBeNull();
    }
  },
};

// ---------------------------------------------------------------------------
// The edge on the surface it is actually on — every palette colour, both
// schemes
// ---------------------------------------------------------------------------

/**
 * tldraw's default palette, `solid` of each colour, both schemes — copied
 * from the file on disk, not from memory:
 * `node_modules/@tldraw/editor/dist-esm/lib/editor/managers/ThemeManager/
 * defaultThemes.mjs` at tldraw 5.3.2 (`apps/storybook-basics/package.json`
 * pins the version), light block lines 137–329, dark block lines 360–553.
 *
 * WHY a copied table rather than an import: the palette lives in
 * `@tldraw/editor`, which is not a dependency of this app, and importing
 * `tldraw` for one constant would (a) pull the whole engine into a story
 * about a kit component that imports no engine and (b) make
 * `storyOrganisation.test.ts` demand a `host:tldraw` tag on a page that
 * renders in no host. The version pin is the drift guard: a tldraw bump is
 * the moment to re-read those lines.
 */
const TLDRAW_PALETTE: Record<"light" | "dark", Record<string, string>> = {
  light: {
    black: "#1d1d1d",
    grey: "#9fa8b2",
    "light-violet": "#e085f4",
    violet: "#ae3ec9",
    blue: "#4465e9",
    "light-blue": "#4ba1f1",
    yellow: "#f1ac4b",
    orange: "#e16919",
    green: "#099268",
    "light-green": "#4cb05e",
    "light-red": "#f87777",
    red: "#e03131",
    white: "#FFFFFF",
  },
  dark: {
    black: "#f2f2f2",
    grey: "#9398b0",
    "light-violet": "#e599f7",
    violet: "#ae3ec9",
    blue: "#4f72fc",
    "light-blue": "#4dabf7",
    yellow: "#ffc034",
    orange: "#f76707",
    green: "#099268",
    "light-green": "#40c057",
    "light-red": "#ff8787",
    red: "#e03131",
    white: "#f3f3f3",
  },
};

const PALETTE_NAMES = Object.keys(TLDRAW_PALETTE.light);

/** A second, LIGHT skin — the mirror case: `white` is the colour that
    vanishes here, `black` the one that does not. Ink is tldraw's own dark
    text colour so the hairline this skin lifts with is a real ink. */
const LIGHT_SKIN = { surface: "#ffffff", ink: "#1d1d1d" };

interface SurfaceSpec {
  id: string;
  title: string;
  surface: string;
  ink: string;
  scheme: "light" | "dark";
}

const SURFACES: readonly SurfaceSpec[] = [
  { id: "pill-light", title: "the pill, light-scheme palette", surface: PILL_SURFACE_HEX, ink: "#ffffff", scheme: "light" },
  { id: "pill-dark", title: "the pill, dark-scheme palette", surface: PILL_SURFACE_HEX, ink: "#ffffff", scheme: "dark" },
  { id: "light-skin", title: "a light skin (#fff), light-scheme palette", ...LIGHT_SKIN, scheme: "light" },
];

/** One face per palette colour on one surface, at solid/medium — the edge a
    fresh shape gets, in the colour the user picked. */
function PaletteRow({ spec }: { spec: SurfaceSpec }) {
  const render = paintFaceGlyph("edge", (name) => ({
    hex: name ? TLDRAW_PALETTE[spec.scheme][name] : undefined,
    dash: "solid",
    widthPx: 3.5,
    surface: spec.surface,
  }));
  return (
    <div
      data-testid={`surface-${spec.id}`}
      data-surface={spec.surface}
      style={{ background: spec.surface, color: spec.ink, borderRadius: 13, padding: 12, width: "fit-content" }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{spec.title}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PALETTE_NAMES.map((name) => (
          <Cell key={name} testId={`face-${spec.id}-${name}`} label={name}>
            {render(name)}
          </Cell>
        ))}
      </div>
    </div>
  );
}

/** A face told NOTHING about its surface, at the low-contrast colour: it
    must behave exactly as one told it sits on the pill. */
const untoldFace = paintFaceGlyph("edge", () => ({ hex: LOW_CONTRAST_HEX, dash: "solid", widthPx: 3.5 }));

// --- the story's own ruler: what the browser painted, never the module's
// own arithmetic. These read computed `rgb(...)` strings.

function rgbOf(css: string): [number, number, number, number] {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (!m) throw new Error(`not an rgb colour: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

function hexToRgb(hex: string): [number, number, number, number] {
  const six = hex.replace("#", "");
  return [
    Number.parseInt(six.slice(0, 2), 16),
    Number.parseInt(six.slice(2, 4), 16),
    Number.parseInt(six.slice(4, 6), 16),
    1,
  ];
}

/** `top` at `alpha` composited over an opaque `under`. */
function over(top: [number, number, number, number], alpha: number, under: [number, number, number, number]) {
  return [0, 1, 2].map((i) => top[i] * alpha + under[i] * (1 - alpha)) as unknown as [number, number, number, number];
}

function luminance([r, g, b]: [number, number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: [number, number, number, number], b: [number, number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The gate for the conditional lift, on every one of tldraw's thirteen
 * palette colours, in both schemes, plus the mirror case on a light skin.
 * Two halves, and the SECOND is the one that pins Zach's ask:
 *
 *   1. the mark that ends up on the surface clears WCAG's 3:1 graphics
 *      floor — the coloured stroke on its own where it can, the ink hairline
 *      (as the browser composited it, stroke-opacity and all) where it must;
 *   2. a colour that clears the floor on its own is drawn with NO hairline
 *      — the face is the rectangle and nothing else. Named for red, green
 *      and blue in both schemes so a regression says which colour grew a
 *      plate; then swept across every colour that measures above the floor.
 *
 * Both halves are mutation-tested (2026-09-25): making the lift
 * unconditional turns half 2 red (the first colour it reports is
 * pill-light/grey); deleting the lift turns half 1 red on pill-light
 * `black`, and the light skin's `white` behind it.
 */
export const EdgeMarkClearsTheSurface: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {SURFACES.map((spec) => (
        <PaletteRow key={spec.id} spec={spec} />
      ))}
      <OnThePill>
        <Cell testId="face-untold-black" label="no surface given">
          {untoldFace(undefined)}
        </Cell>
      </OnThePill>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByTestId("face-pill-light-black");

    // The two literals that have to agree: the default surface the face
    // assumes is the pill's, and the pill's class string still paints it.
    await expect(PAINT_FACE_DEFAULT_SURFACE).toBe(PILL_SURFACE_HEX);
    await expect(PILL_SURFACE).toContain(PILL_SURFACE_HEX);

    const lifted: Record<string, string[]> = {};
    for (const spec of SURFACES) {
      const surfaceEl = canvas.getByTestId(`surface-${spec.id}`);
      const surface = rgbOf(getComputedStyle(surfaceEl).backgroundColor);
      lifted[spec.id] = [];
      for (const name of PALETTE_NAMES) {
        const face = canvas.getByTestId(`face-${spec.id}-${name}`);
        const mark = colourMark(face);
        await expect(mark, `${spec.id}/${name} drew no coloured mark`).not.toBeNull();
        const stroke = rgbOf(getComputedStyle(mark!).stroke);
        const strokeRatio = ratio(stroke, surface);
        const hair = hairline(face);
        if (strokeRatio >= EDGE_CONTRAST_MIN) {
          // ---- 2. visible on its own → the rectangle and nothing else ----
          await expect(
            hair,
            `${spec.id}/${name} is ${strokeRatio.toFixed(2)}:1 on its surface and still drew a hairline`,
          ).toBeNull();
        } else {
          // ---- 1. not visible on its own → lifted, and the lift is visible --
          await expect(hair, `${spec.id}/${name} is ${strokeRatio.toFixed(2)}:1 and was not lifted`).not.toBeNull();
          const style = getComputedStyle(hair!);
          const hairColour = over(rgbOf(style.stroke), Number.parseFloat(style.strokeOpacity), surface);
          await expect(
            ratio(hairColour, surface),
            `${spec.id}/${name}'s hairline composites to ${ratio(hairColour, surface).toFixed(2)}:1 on its surface`,
          ).toBeGreaterThanOrEqual(EDGE_CONTRAST_MIN);
          // It is the mark's own shape, a hair wider, in the surface's ink —
          // never a plate: same tag, same dash, barely past the stroke.
          await expect(hair!.tagName).toBe(mark!.tagName);
          await expect(style.strokeDasharray).toBe(getComputedStyle(mark!).strokeDasharray);
          const reach = (Number.parseFloat(style.strokeWidth) - Number.parseFloat(getComputedStyle(mark!).strokeWidth)) / 2;
          await expect(reach).toBeGreaterThan(0);
          await expect(reach).toBeLessThanOrEqual(0.6);
          await expect(style.stroke).toBe(style.color);
          lifted[spec.id].push(name);
        }
      }
    }

    // Named, so a failure says which colour grew a plate.
    for (const spec of SURFACES) {
      for (const name of ["red", "green", "blue"]) {
        await expect(hairline(canvas.getByTestId(`face-${spec.id}-${name}`)), `${spec.id}/${name}`).toBeNull();
      }
    }
    // And the two colours the whole mechanism exists for, in the one scheme
    // each needs it: light `black` on the pill, and nothing else there;
    // `white` on a light skin, where `black` must NOT lift. (Measured, a
    // white skin also lifts the pale half of the palette — grey, yellow, the
    // three `light-*`s — which is what 3:1 on white honestly says about
    // them; the mirror case pins the two ends, not the count.)
    await expect(lifted["pill-light"]).toEqual(["black"]);
    await expect(lifted["pill-dark"]).toEqual([]);
    await expect(lifted["light-skin"]).toContain("white");
    await expect(lifted["light-skin"]).not.toContain("black");

    // A face told nothing about its surface assumes the pill — so black
    // lifts exactly as it does when told.
    await expect(hairline(canvas.getByTestId("face-untold-black"))).not.toBeNull();
  },
};

// ---------------------------------------------------------------------------
// The continuous channel — opacity, in the paint's own panel
// ---------------------------------------------------------------------------

interface ApplyCall {
  value: number;
  continuous: boolean;
}

/** A real drag: set the value the way the browser does, then let React's own
    `input` listener see it. Assigning `input.value` directly would update
    React's value tracker too, and React would swallow the event as a
    no-change. */
function dragTo(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function release(input: HTMLInputElement) {
  input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}

function ContinuousDemo() {
  const [opacity, setOpacity] = useState(0.5);
  const [calls, setCalls] = useState<ApplyCall[]>([]);

  const bound = demoRegistry.bindControl("inside", {
    id: "inside",
    value: { type: "shared", value: "c5" },
    onSelect: () => {},
    continuous: {
      label: "Opacity",
      value: opacity,
      min: 0,
      max: 1,
      step: 0.01,
      format: (n) => `${Math.round(n * 100)}%`,
      apply: (value, opts) => {
        setOpacity(value);
        setCalls((prev) => [...prev, { value, continuous: Boolean(opts?.continuous) }]);
      },
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="w-fit rounded-lg border bg-popover p-2.5 shadow-md">
        <ControlPanel control={bound} glyphs={demoGlyphs} />
      </div>
      {/* The gesture, visible. One undo per drag is the whole reason
          `continuous` exists, and a reviewer cannot see a flag. */}
      <pre data-testid="continuous-apply-log" style={{ fontSize: 10, margin: 0 }}>
        {JSON.stringify(calls)}
      </pre>
    </div>
  );
}

/**
 * Opacity as a `ContinuousBinding` inside the Fill panel — where Zach moved
 * it on 2026-09-24 ("that is something that relates to the fill and stroke"),
 * off the toolbar that now has no room for it.
 *
 * The play function pins the flag contract, which is the part that cannot be
 * seen: every in-flight `input` applies with `{continuous: true}` so a host
 * marks no history step, and the release applies WITHOUT it so exactly one
 * undo covers the whole drag.
 */
export const ContinuousChannel: Story = {
  render: () => <ContinuousDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const slider = (await canvas.findByTestId("control-continuous-input")) as HTMLInputElement;
    const row = canvasElement.querySelector('[data-slot="control-continuous"]')!;
    const readout = row.querySelector("output")!;

    await expect(slider.min).toBe("0");
    await expect(slider.max).toBe("1");
    await expect(slider.step).toBe("0.01");
    const before = readout.textContent;
    await expect(before).toBe("50%");

    // Mid-drag.
    dragTo(slider, 0.8);
    await waitFor(() => expect(readout.textContent).not.toBe(before));
    await expect(readout.textContent).toBe("80%");
    // The readout is also the slider's accessible value — a screen reader
    // hears the same number the eye reads.
    await expect(slider.getAttribute("aria-valuetext")).toBe("80%");

    const midDrag: ApplyCall[] = JSON.parse(canvas.getByTestId("continuous-apply-log").textContent ?? "[]");
    await expect(midDrag.length).toBeGreaterThan(0);
    await expect(midDrag.every((call) => call.continuous)).toBe(true);
    await expect(midDrag[midDrag.length - 1].value).toBeCloseTo(0.8, 5);

    // Release.
    release(slider);
    await waitFor(() => {
      const log: ApplyCall[] = JSON.parse(canvas.getByTestId("continuous-apply-log").textContent ?? "[]");
      expect(log.length).toBe(midDrag.length + 1);
    });
    const settled: ApplyCall[] = JSON.parse(canvas.getByTestId("continuous-apply-log").textContent ?? "[]");
    await expect(settled[settled.length - 1].continuous).toBe(false);
    await expect(settled[settled.length - 1].value).toBeCloseTo(0.8, 5);
  },
};
