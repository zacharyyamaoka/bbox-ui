import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { ControlPanel } from "./controlPanel";
import { paintFaceGlyph, type FacePaint } from "./controlGlyphs";
import { demoGlyphs, demoRegistry } from "./ControlStrip.stories";

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
 * actually painted — `fill`, `fill-opacity`, `opacity`, `stroke-width` — and
 * counts distinct answers. Mutation-tested red (2026-09-24) by collapsing
 * the four fill treatments to one: the Set drops from 4 to 1 and the story
 * fails.
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

const EDGE_PAINTS: Record<string, FacePaint> = {
  ...Object.fromEntries(DASH_KEYS.map((dash) => [`dash-${dash}`, { hex: FACE_HEX, dash, widthPx: 3.5 }])),
  ...Object.fromEntries(
    EDGE_WIDTHS.map((widthPx) => [`width-${widthPx}`, { hex: FACE_HEX, dash: "solid", widthPx }]),
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
          border: "1px solid var(--border)",
        }}
      >
        {children}
      </div>
      <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{label}</span>
    </div>
  );
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
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <FaceRow part="inside" keys={INSIDE_KEYS} title="inside — one face per fill treatment" />
    </div>
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
 */
export const EdgeFaces: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
    </div>
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

/**
 * The rect an EDGE face answers its colour with.
 *
 * WHY not simply the first rect: `controlGlyphs.tsx` draws a wider
 * `data-role="keyline"` UNDERNEATH the real stroke, so a dark edge stays
 * visible on a dark bar. It is deliberately the control's own ink, never the
 * selection's — so "what colour is this edge" is always a question about the
 * one on top, and asking the first rect silently asks the keyline instead.
 */
function strokeRect(face: Element): SVGRectElement {
  const rect = rectsIn(face).find((candidate) => candidate.getAttribute("data-role") !== "keyline");
  if (!rect) throw new Error("this face drew a keyline and nothing else");
  return rect;
}

/**
 * The gate. Three properties, each of which a presence-only assertion would
 * pass while the face was broken:
 *
 *   1. the four fill treatments resolve to four DIFFERENT painted signatures,
 *   2. a mixed face paints no colour at all — not a dimmed member's colour,
 *   3. the compressed widths stay strictly ordered.
 */
export const FacesAreDistinguishable: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <FaceRow part="inside" keys={INSIDE_KEYS} title="inside" />
      <FaceRow part="edge" keys={EDGE_KEYS} title="edge" />
    </div>
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

    // The edge half of the same rule. A resolved edge inks itself in the
    // SELECTION's colour (so its stroke is not the control's own ink)…
    const solidEdge = getComputedStyle(strokeRect(face("edge", "dash-solid")));
    await expect(solidEdge.stroke).not.toBe(solidEdge.color);
    // …and a mixed one never does: EVERY rect it draws, keyline included, is
    // the control's own `currentColor`, so no member's colour can leak out as
    // if it spoke for the whole selection.
    for (const rect of rectsIn(face("edge", MIXED))) {
      const style = getComputedStyle(rect);
      await expect(style.stroke).toBe(style.color);
      await expect(style.stroke).not.toBe(solidEdge.stroke);
    }

    // ---- 3. compressed widths stay strictly ordered ------------------------
    const drawn = EDGE_WIDTHS.map((px) =>
      Number.parseFloat(getComputedStyle(strokeRect(face("edge", `width-${px}`))).strokeWidth),
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
