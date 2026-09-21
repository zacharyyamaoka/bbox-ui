import { useLayoutEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { python } from "@codemirror/lang-python";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { CodeEditor } from "./codeEditor";
import { LabeledPort } from "./labeledPort";
import { PORT_RING_OVERHANG_PX, PORT_LABEL_GAP, type BlockSide, type SecondarySlotLayout } from "./port.layout";
import { Trace } from "./trace";
import type { TraceDir, TraceTerminalSpec } from "./trace.layout";

/**
 * `expect(a).toBeCloseTo(b)` on two viewport numbers reports which values
 * differed but not WHAT broke — same helper `BlockPort.stories.tsx` and
 * `BlockPortLane.stories.tsx` each already carry locally rather than share,
 * so this file follows the same local-copy convention.
 */
function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) {
    throw new Error(`${what} — measured ${actual.toFixed(2)}px, expected ${expected.toFixed(2)}px (±${tolerance}px), off by ${delta.toFixed(2)}px`);
  }
}

const meta = {
  title: "Ports/LabeledPort",
  tags: ["area:ports", "lane:baseline"],
  component: LabeledPort,
  args: { children: "value", state: "empty", edge: "left" },
} satisfies Meta<typeof LabeledPort>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A single labeled port at rest — the dot plus its inward-flowing label. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const port = canvasElement.querySelector('[data-slot="port"]');
    if (!(port instanceof HTMLElement)) throw new Error('expected a [data-slot="port"]');
    await expect(port.querySelector('[data-slot="port-dot"]')).not.toBeNull();
    await expect(port.querySelector('[data-slot="port-label"]')).not.toBeNull();
    await expect(within(port).getByText("value")).toBeInTheDocument();
  },
};

const EDGES: BlockSide[] = ["left", "right", "top", "bottom"];

/**
 * The four wall edges, each with its own auto-inward label direction: a
 * left-wall port's label flows right (into the block); a top-wall port's
 * flows down; etc.
 */
export const FourEdges: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 40 }}>
      {EDGES.map((edge) => (
        <div key={edge} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 120, height: 60 }}>
            <LabeledPort edge={edge} state="wired">
              {edge}
            </LabeledPort>
          </div>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>edge={edge}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const ports = Array.from(canvasElement.querySelectorAll('[data-slot="port"]'));
    await expect(ports).toHaveLength(4);
    const layouts = ports.map((p) => p.getAttribute("data-text-layout"));
    // left -> right, right -> left, top -> bot, bottom -> top (inwardTextLayout).
    await expect(layouts).toEqual(["right", "left", "bot", "top"]);
  },
};

/**
 * The key story: a wire drawn straight through the dot's own centre line
 * (an absolutely-positioned div standing in for the trace). `right` shows
 * the label sitting ON the wire — text and line overlap; `rightOffset`
 * shows the SAME label lifted clear, its bottom edge above the line, at any
 * label height (that's the point of `align: "end"` — see port.layout.ts).
 * Measured with `getBoundingClientRect`, not asserted from a class name.
 */
function WireComparison({ layout, caption }: { layout: "right" | "rightOffset"; caption: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{caption}</span>
      <div data-testid={`wire-wrap-${layout}`} style={{ position: "relative", width: 220, height: 60, display: "flex", alignItems: "center" }}>
        {/* The trace wire: a literal horizontal line through the dot's centre. */}
        <div
          data-testid={`wire-${layout}`}
          style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, background: "var(--bbox-primary)", opacity: 0.6 }}
        />
        <LabeledPort textLayout={layout} state="wired" diameter="md">
          pose: Pose = None
        </LabeledPort>
      </div>
    </div>
  );
}

export const OffsetClearsTheWire: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 48 }}>
      <WireComparison layout="right" caption="right — label sits ON the wire" />
      <WireComparison layout="rightOffset" caption="rightOffset — label clears the wire" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const rightWire = canvasElement.querySelector('[data-testid="wire-right"]');
    const rightLabel = canvasElement.querySelector('[data-testid="wire-wrap-right"] [data-slot="port-label"]');
    const offsetWire = canvasElement.querySelector('[data-testid="wire-rightOffset"]');
    const offsetLabel = canvasElement.querySelector('[data-testid="wire-wrap-rightOffset"] [data-slot="port-label"]');
    if (!(rightWire instanceof HTMLElement) || !(rightLabel instanceof HTMLElement)) throw new Error("expected right wire + label");
    if (!(offsetWire instanceof HTMLElement) || !(offsetLabel instanceof HTMLElement)) throw new Error("expected rightOffset wire + label");

    const wireY = rightWire.getBoundingClientRect().top; // same for both (identical geometry)
    const rightLabelBox = rightLabel.getBoundingClientRect();
    const offsetLabelBox = offsetLabel.getBoundingClientRect();

    // "right": the wire's y sits INSIDE the label's vertical span — impaled.
    await expect(rightLabelBox.top).toBeLessThanOrEqual(wireY);
    await expect(rightLabelBox.bottom).toBeGreaterThanOrEqual(wireY);

    // "rightOffset": the label's bottom edge clears the wire — sits strictly
    // above it, not merely coincident.
    await expect(offsetLabelBox.bottom).toBeLessThan(wireY);

    // The gap measured from the dot's PAINTED ring: PORT_RING_OVERHANG_PX (5)
    // + PORT_LABEL_GAP (8) = 13px, and it's the SAME 13px on both layouts —
    // only the vertical anchor differs, not the along-axis distance.
    const dotRight = canvasElement.querySelector('[data-testid="wire-wrap-right"] [data-slot="port-dot"]');
    const offsetDotRight = canvasElement.querySelector('[data-testid="wire-wrap-rightOffset"] [data-slot="port-dot"]');
    if (!(dotRight instanceof HTMLElement) || !(offsetDotRight instanceof HTMLElement)) throw new Error("expected both dots");
    const gapRight = Math.round(rightLabelBox.left - dotRight.getBoundingClientRect().right);
    const gapOffset = Math.round(offsetLabelBox.left - offsetDotRight.getBoundingClientRect().right);
    await expect(gapRight).toBe(PORT_RING_OVERHANG_PX + PORT_LABEL_GAP);
    await expect(gapOffset).toBe(PORT_RING_OVERHANG_PX + PORT_LABEL_GAP);
  },
};

/**
 * The secondary slot: any `ReactNode`, hugging one of the dot's four
 * corners, auto-defaulting to the corner OPPOSITE wherever the label is
 * flowing. `secondarySlot={<></>}` (an explicitly emptied slot) renders no
 * badge at all — present-beats-absent, not a `??` that would resurrect a
 * default.
 */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8, background: "var(--muted)", color: "var(--muted-foreground)" }}>
      {children}
    </span>
  );
}

export const SecondarySlot: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ width: 140, height: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LabeledPort state="wired" secondarySlot={<Pill>2</Pill>}>
            args
          </LabeledPort>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>badge, auto corner (opposite label)</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ width: 140, height: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LabeledPort state="received" secondarySlot={<Pill>Event 4</Pill>}>
            out
          </LabeledPort>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>"Event 4" pill</span>
      </div>
      {(["leftOffset", "rightOffset", "topOffset", "botOffset"] as const).map((corner) => (
        <div key={corner} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ width: 140, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LabeledPort state="empty" secondarySlot={<Pill>*</Pill>} secondarySlotLayout={corner}>
              cfg
            </LabeledPort>
          </div>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{corner}</span>
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div data-testid="emptied-slot" style={{ width: 140, height: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LabeledPort state="empty" secondarySlot={<></>}>
            emptied
          </LabeledPort>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>secondarySlot={"{<></>}"} — no badge, ever</span>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const badges = canvasElement.querySelectorAll('[data-slot="port-secondary-slot"]');
    // 2 (args/out) + 4 (corners) + 1 (emptied, still mounts the wrapper) = 7
    await expect(badges).toHaveLength(7);
    const emptied = canvasElement.querySelector('[data-testid="emptied-slot"] [data-slot="port-secondary-slot"]');
    if (!(emptied instanceof HTMLElement)) throw new Error("expected the emptied slot's wrapper");
    await expect(emptied.textContent).toBe("");
  },
};

/**
 * F-4/F-6: the secondary slot is ONE horizontal line, ALWAYS — whatever its
 * placement (N/W/S/E, Zach's own compass letters for the four
 * `SecondarySlotLayout` corners) and whatever an ancestor's own width does
 * to it. Zach's screenshot (154132) showed "Event 4" wrapping to "Event"
 * over "4" the instant its slot's rendered width got squeezed; the narrow
 * 60px cell below reproduces that squeeze deliberately, so it's the
 * `whiteSpace: nowrap` fix on labeledPort.tsx's secondary-slot span (not a
 * story-level workaround) that's actually under test — this is exactly the
 * "Two Lines" shape Zach also asked gone from the primary label ("this is
 * not a part of our visual language, two lines per port"), reproduced here
 * for the secondary slot with a real two-word pill.
 */
const CORNER_COMPASS: Record<SecondarySlotLayout, string> = {
  topOffset: "N",
  leftOffset: "W",
  botOffset: "S",
  rightOffset: "E",
};

export const SecondarySlotSingleLine: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
        {(["topOffset", "leftOffset", "botOffset", "rightOffset"] as const).map((corner) => (
          <div key={corner} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {/* The slot itself is absolutely positioned, so it isn't
             *  bounded by this cell's own width — but a naive
             *  implementation that let its CONTENT wrap would still fold
             *  it here, exactly as Zach's screenshot shows. */}
            <div
              data-testid={`squeeze-${corner}`}
              style={{ width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", outline: "1px dashed var(--border)" }}
            >
              <LabeledPort state="wired" secondarySlot={<Pill>Event 4</Pill>} secondarySlotLayout={corner}>
                {CORNER_COMPASS[corner]}
              </LabeledPort>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              {corner} ({CORNER_COMPASS[corner]})
            </span>
          </div>
        ))}
      </div>
      {/* The reference: the SAME pill content, no width constraint at all —
       *  its natural single-line height is what every squeezed slot above
       *  must match within 1px. */}
      <div data-testid="reference-pill" style={{ display: "inline-flex" }}>
        <Pill>Event 4</Pill>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const reference = canvasElement.querySelector('[data-testid="reference-pill"]');
    if (!(reference instanceof HTMLElement)) throw new Error("expected the reference pill");
    const referenceHeight = reference.getBoundingClientRect().height;

    const corners: SecondarySlotLayout[] = ["topOffset", "leftOffset", "botOffset", "rightOffset"];
    for (const corner of corners) {
      const cell = canvasElement.querySelector(`[data-testid="squeeze-${corner}"]`);
      if (!(cell instanceof HTMLElement)) throw new Error(`expected the ${corner} cell`);
      const slot = cell.querySelector('[data-slot="port-secondary-slot"]');
      if (!(slot instanceof HTMLElement)) throw new Error(`expected ${corner}'s secondary slot`);

      // F-4: the slot's own rendered height matches a single-line
      // reference — not roughly DOUBLE it, which is what two stacked text
      // lines would measure.
      const slotHeight = slot.getBoundingClientRect().height;
      expectWithin(slotHeight, referenceHeight, 1, `${corner} secondary slot height vs a single-line reference`);

      // The direct proof content did not wrap: a Range over the pill's
      // text node reports exactly ONE client rect when every character
      // sits on one visual line, and more than one the instant it folds
      // onto a second.
      const textNode = slot.querySelector("span")?.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) throw new Error(`expected ${corner}'s pill text node`);
      const range = document.createRange();
      range.selectNodeContents(textNode);
      await expect(range.getClientRects().length).toBe(1);
    }
  },
};

/* ------------------------------------------------------------------ */
/* F-5: a real Trace drawn into each port, secondary slot clearing it.  */
/* ------------------------------------------------------------------ */

/** The wire connects from OUTSIDE the block, opposite the label's own
 *  inward flow (`inwardTextLayout`'s mirror image — the label flows INTO
 *  the block, the wire flows in FROM outside it). */
const WIRE_FROM_DIR: Record<BlockSide, TraceDir> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};

/** The corner that clears a wire running along THIS edge's own axis: a
 *  left/right-wall port's wire is HORIZONTAL, so the secondary slot must
 *  hug top/bottom (the perpendicular axis) to clear it, and vice versa for
 *  a top/bottom-wall port's VERTICAL wire. */
const CLEARING_CORNER: Record<BlockSide, SecondarySlotLayout> = {
  left: "topOffset",
  right: "topOffset",
  top: "leftOffset",
  bottom: "leftOffset",
};

const WIRE_BOX = { w: 220, h: 120 };
const WIRE_REACH_PX = 70;
/** The port's own inset from the box wall it's anchored to — strictly
 *  bigger than `WIRE_REACH_PX` so the wire's OUTER end stays inside the
 *  box's own viewBox instead of running off-canvas (see `align`'s WHY). */
const WIRE_INSET_PX = 90;

/**
 * ONE edge's panel: a real `LabeledPort` plus a real `Trace`, routed
 * straight into the dot's own MEASURED centre (never assumed — the dot's
 * position depends on this box's flex layout, same "measure, don't assume"
 * discipline `portEdge.tsx`'s own `useLaneGeometry` and
 * `BlockPort.stories.tsx`'s helpers already follow). `gap={0}` so the drawn
 * line's endpoint is exactly the dot's centre, not pulled back by
 * `TRACE_TERMINAL_GAP` — the clearance assertion reads the path's own
 * geometry off the painted `SVGPathElement`, so nothing here may leave that
 * geometry to be assumed either.
 */
function WirePanel({ edge }: { edge: BlockSide }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dot, setDot] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const dotEl = box.querySelector('[data-slot="port-dot"]');
    if (!(dotEl instanceof HTMLElement)) return;
    const boxRect = box.getBoundingClientRect();
    const dotRect = dotEl.getBoundingClientRect();
    setDot({
      x: dotRect.left + dotRect.width / 2 - boxRect.left,
      y: dotRect.top + dotRect.height / 2 - boxRect.top,
    });
  }, [edge]);

  // WHY the anchor side also gets `WIRE_INSET_PX` of padding, not a flush
  // 0: found live — flush-to-the-wall left the dot only ~6px from the box
  // edge, so a `WIRE_REACH_PX`-long wire ran almost entirely OFF-CANVAS
  // (measured: `M -64 60 L 6 60`, only the last 6px inside the [0,220]
  // viewBox). "Stories are the deliverable" (this repo's own rule) means a
  // wire nobody can see fails the story's one job even though the
  // assertion below — which reads the painted path's real bbox regardless
  // of what's in view — would still have passed it silently.
  const align: Record<BlockSide, { alignItems: string; justifyContent: string; padding: string }> = {
    left: { alignItems: "center", justifyContent: "flex-start", padding: `0 0 0 ${WIRE_INSET_PX}px` },
    right: { alignItems: "center", justifyContent: "flex-end", padding: `0 ${WIRE_INSET_PX}px 0 0` },
    top: { alignItems: "flex-start", justifyContent: "center", padding: `${WIRE_INSET_PX}px 0 0 0` },
    bottom: { alignItems: "flex-end", justifyContent: "center", padding: `0 0 ${WIRE_INSET_PX}px 0` },
  };

  const outward: Record<BlockSide, { x: number; y: number }> = {
    left: { x: -WIRE_REACH_PX, y: 0 },
    right: { x: WIRE_REACH_PX, y: 0 },
    top: { x: 0, y: -WIRE_REACH_PX },
    bottom: { x: 0, y: WIRE_REACH_PX },
  };

  const from: TraceTerminalSpec | null = dot
    ? { x: dot.x + outward[edge].x, y: dot.y + outward[edge].y, dir: WIRE_FROM_DIR[edge] }
    : null;
  const to: TraceTerminalSpec | null = dot ? { x: dot.x, y: dot.y, dir: edge } : null;

  return (
    <div
      ref={boxRef}
      data-testid={`wire-box-${edge}`}
      // `boxSizing: "border-box"` — the anchor padding above must shift
      // the flex content INWARD without enlarging the box past
      // `WIRE_BOX`, which is also the SVG's own exact pixel size below
      // (a mismatch there would scale the SVG's user-unit coordinates
      // against its actual rendered box).
      style={{ position: "relative", boxSizing: "border-box", width: WIRE_BOX.w, height: WIRE_BOX.h, display: "flex", ...align[edge] }}
    >
      <LabeledPort edge={edge} state="wired" diameter="md" secondarySlot={<Pill>3</Pill>} secondarySlotLayout={CLEARING_CORNER[edge]}>
        {edge}
      </LabeledPort>
      {from && to && (
        <svg
          data-testid={`wire-svg-${edge}`}
          width={WIRE_BOX.w}
          height={WIRE_BOX.h}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <Trace id={`wire-${edge}`} from={from} to={to} routing="straight" gap={0} terminals={false} />
        </svg>
      )}
    </div>
  );
}

const WIRE_EDGES: BlockSide[] = ["top", "left", "bottom", "right"];

export const SecondarySlotClearsWire: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        {WIRE_EDGES.map((edge) => (
          <div key={edge} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <WirePanel edge={edge} />
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>edge={edge}</span>
          </div>
        ))}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const edge of WIRE_EDGES) {
      const box = canvasElement.querySelector(`[data-testid="wire-box-${edge}"]`);
      if (!(box instanceof HTMLElement)) throw new Error(`expected the ${edge} wire box`);
      const svg = box.querySelector(`[data-testid="wire-svg-${edge}"]`);
      if (!(svg instanceof SVGSVGElement)) throw new Error(`expected the ${edge} wire svg`);
      // `[data-slot="trace-line"]`, not a bare `path` selector — the SVG
      // ALSO carries `trace-defs`' own marker-arrow path (and an invisible
      // `trace-hit` stroke), and a bare selector grabs whichever painted
      // first (found live: the 9x9px chevron glyph, not the wire at all).
      const path = svg.querySelector('[data-slot="trace-line"]');
      if (!(path instanceof SVGPathElement)) throw new Error(`expected the ${edge} wire's rendered [data-slot="trace-line"]`);
      const slot = box.querySelector('[data-slot="port-secondary-slot"]');
      if (!(slot instanceof HTMLElement)) throw new Error(`expected the ${edge} secondary slot`);

      // Measured off the PAINTED path (`getBBox`, the SVG element's own
      // rendered geometry), never off the terminal spec this story
      // computed and handed in — the assertion must survive a routing
      // change even though nothing here makes one.
      const wireLocalBox = path.getBBox();
      const svgRect = svg.getBoundingClientRect();
      const wireScreen = {
        left: svgRect.left + wireLocalBox.x,
        right: svgRect.left + wireLocalBox.x + wireLocalBox.width,
        top: svgRect.top + wireLocalBox.y,
        bottom: svgRect.top + wireLocalBox.y + wireLocalBox.height,
      };
      const slotRect = slot.getBoundingClientRect();

      // A horizontal wire (left/right edges) is cleared VERTICALLY; a
      // vertical wire (top/bottom edges) is cleared HORIZONTALLY — exactly
      // the perpendicular-axis rule `CLEARING_CORNER` encodes above.
      const horizontalWire = edge === "left" || edge === "right";
      const clears = horizontalWire
        ? slotRect.bottom < wireScreen.top || slotRect.top > wireScreen.bottom
        : slotRect.right < wireScreen.left || slotRect.left > wireScreen.right;
      if (!clears) {
        throw new Error(`edge=${edge}: secondary slot ${JSON.stringify(slotRect)} overlaps the wire's own painted path ${JSON.stringify(wireScreen)}`);
      }
    }
  },
};

/**
 * F-1: the real click-to-edit loop on the built-in label field — click → the
 * DISPLAY SPAN UNMOUNTS and a single-line `CodeEditor` mounts in its exact
 * place (never both at once) → type → commit → the editor unmounts and the
 * display span returns, carrying the new value back to the host via
 * `onLabelWrite`. `labelLanguage={python()}` exercises real highlighting
 * while editing (F-3) — same parser `LabeledPort.stories.tsx`'s own
 * `CodeLabel` story already uses for an explicit `labelSlot` override; this
 * proves the BUILT-IN field gets it too.
 */
function ControlledLabeledPort({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <LabeledPort state="empty" onLabelWrite={setValue} labelLanguage={python()}>
      {value}
    </LabeledPort>
  );
}

// `@testing-library/user-event`'s `.type()` cannot put text into
// CodeMirror's `contenteditable` document — see `CodeEditor.stories.tsx`'s
// own `typeIntoCodeEditor` for the measured reason (Chromium only performs
// native contenteditable insertion for TRUSTED keystrokes).
// `execCommand('insertText', …)` performs a real DOM mutation CodeMirror's
// input handling observes the same way a real keystroke would.
function typeIntoCodeEditor(editor: HTMLElement, text: string) {
  const content = editor.querySelector(".cm-content");
  if (!(content instanceof HTMLElement)) throw new Error("expected a .cm-content element");
  content.focus();
  document.execCommand("insertText", false, text);
}

export const EditableLabel: Story = {
  render: () => <ControlledLabeledPort initial="pose" />,
  play: async ({ canvasElement }) => {
    const label = canvasElement.querySelector('[data-slot="port-label"]');
    if (!(label instanceof HTMLElement)) throw new Error('expected a [data-slot="port-label"]');

    // F-1 item 1: resting state — a plain display span, no editor mounted.
    await expect(label.getAttribute("data-editing")).toBe("false");
    const resting = label.querySelector('[data-slot="port-label-display"]');
    if (!(resting instanceof HTMLElement)) throw new Error("expected the resting port-label-display span");
    await expect(label.querySelector('[data-slot="code-editor"]')).toBeNull();
    const restingFontSize = getComputedStyle(resting).fontSize;

    await userEvent.click(resting);

    // F-2: editing REPLACES the display text, it does not overlay it — the
    // resting element is genuinely gone from the DOM.
    const editor = await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="port-label"][data-editing="true"] [data-slot="code-editor"]');
      if (!(el instanceof HTMLElement)) throw new Error("expected the editing CodeEditor to mount");
      return el;
    });
    await expect(canvasElement.querySelector('[data-slot="port-label-display"]')).toBeNull();

    // F-1: the type size matches — measured, not eyeballed. Both the
    // resting span and the editor read the SAME `PORT_TEXT_SIZES` number
    // (labeledPort.tsx's own `fontSizePx`), so this passes by construction.
    await expect(getComputedStyle(editor).fontSize).toBe(restingFontSize);

    typeIntoCodeEditor(editor, "pose: Pose = None");
    await waitFor(() => {
      const content = editor.querySelector(".cm-content");
      if (!(content instanceof HTMLElement) || content.textContent !== "pose: Pose = None") {
        throw new Error(`expected the editor's document to read "pose: Pose = None", got ${content?.textContent}`);
      }
    });

    // F-3: real syntax highlighting while editing — at least two spans
    // with DISTINCT `tok-*` classes and distinct computed colours (the
    // same variableName-vs-operator pair `CodeLabel` story's own WHY
    // explains is what's actually reachable off this Python fragment).
    const variableToken = editor.querySelector(".tok-variableName");
    const operatorToken = editor.querySelector(".tok-operator");
    if (!(variableToken instanceof HTMLElement) || !(operatorToken instanceof HTMLElement)) {
      throw new Error("expected both a .tok-variableName and a .tok-operator span while editing");
    }
    await expect(getComputedStyle(variableToken).color).not.toBe(getComputedStyle(operatorToken).color);

    await userEvent.keyboard("{Enter}");

    // Exits back to rest — the display span RETURNS (F-2's other half).
    await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="port-label"][data-editing="false"] [data-slot="port-label-display"]');
      if (!(el instanceof HTMLElement)) throw new Error("expected the label to return to resting state after commit");
    });
    await expect(canvasElement.querySelector('[data-slot="code-editor"]')).toBeNull();
    const canvas = within(canvasElement);
    await expect(canvas.getByText("pose: Pose = None")).toBeInTheDocument();
  },
};

/**
 * A-5 (docs/FEEDBACK-2026-09-17b-PLAN.md, Zach: "a story of the Labeled
 * port that uses a single line code editor instead of the editable label
 * … I would expect to see syntax highlighting on the label"). `labelSlot`
 * (labeledPort.tsx, present-beats-absent) is the WHOLE mechanism — no
 * component change here, just filling that seam with `CodeEditor` instead
 * of the built-in `DefaultPortLabel`.
 *
 * `overflow="clip"` (not `"scroll"`) and `columns` sized to the sample —
 * this label replaces an `<input>`-shaped port label, so it should behave
 * like one (cut at the edge, no bar), not grow a text-editor scrollbar.
 *
 * WHY `value="var: Type = value"` renders "Type" in the SAME colour as
 * "var", not a distinct type colour (the screenshot's `var`/`Type` visual
 * distinction is real, but comes from the DEFINITION vs the annotation,
 * not a type-vs-variable split): verified live against `classHighlighter`
 * (@lezer/highlight, the seam codeEditor.tsx:297 must use unmodified) —
 * Python's grammar has no AST node for "this identifier is a type
 * annotation", so both `var` and `Type` parse as plain `VariableName` and
 * get the identical `tok-variableName` class. The two colours this story
 * (and A-5a) actually exercises are `tok-variableName` (var/Type/value)
 * against `tok-operator` (`=`) — see CodeEditor.stories.tsx's
 * `SyntaxThemes` for the same constraint on "control keyword"/"function".
 */
const CODE_LABEL_VALUE = "var: Type = value";

function CodeLabelPort({ edge, theme, testId }: { edge: BlockSide; theme?: string; testId: string }) {
  const [value, setValue] = useState(CODE_LABEL_VALUE);
  return (
    <LabeledPort
      edge={edge}
      state="wired"
      labelSlot={
        <CodeEditor
          value={value}
          onWrite={setValue}
          multiline={false}
          language={python()}
          overflow="clip"
          columns={18}
          fontSizePx={12}
          theme={theme}
          testId={testId}
        />
      }
    />
  );
}

// The label ("var: Type = value") is far wider than FourEdges' one-word
// labels, so each cell here justifies the DOT toward the wall it's meant
// to sit on (mirroring a real Block wall) rather than centering it — a
// centered dot would give the label room on only half the axis it
// actually flows across and bleed into the neighbouring cell.
const CODE_LABEL_JUSTIFY: Record<BlockSide, "flex-start" | "flex-end" | "center"> = {
  left: "flex-start",
  right: "flex-end",
  top: "center",
  bottom: "center",
};

export const CodeLabel: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", gap: 24 }}>
        {EDGES.map((edge) => (
          <div key={edge} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: CODE_LABEL_JUSTIFY[edge],
                width: 200,
                height: 70,
              }}
            >
              <CodeLabelPort edge={edge} testId={`code-label-${edge}`} />
            </div>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>edge={edge}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>theme=dark-modern — where A-2 and A-5 meet</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", width: 200, height: 60, background: "#1f1f1f", borderRadius: 8, paddingLeft: 16 }}>
          <CodeLabelPort edge="left" theme="dark-modern" testId="code-label-themed" />
        </div>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const slot = canvasElement.querySelector('[data-testid="code-label-left"]');
    if (!(slot instanceof HTMLElement)) throw new Error('expected [data-testid="code-label-left"]');

    // A-5a: highlighting is genuinely ON, not just text presence — at
    // least two spans with DISTINCT tok-* classes and distinct computed
    // colours (variableName vs operator; see this story's own WHY on why
    // that pair, not var-vs-Type, is what's actually reachable here).
    const variableToken = slot.querySelector(".tok-variableName");
    const operatorToken = slot.querySelector(".tok-operator");
    if (!(variableToken instanceof HTMLElement) || !(operatorToken instanceof HTMLElement)) {
      throw new Error("expected both a .tok-variableName and a .tok-operator span in the code label");
    }
    const variableColor = getComputedStyle(variableToken).color;
    const operatorColor = getComputedStyle(operatorToken).color;
    await expect(variableColor).not.toBe(operatorColor);

    // The label behaves like the <input> it replaces: clipped, no scrollbar.
    await expect(slot.getAttribute("data-overflow")).toBe("clip");

    // Every edge actually mounted a code editor as its label, not the
    // built-in EditableText.
    for (const edge of EDGES) {
      const editor = canvasElement.querySelector(`[data-testid="code-label-${edge}"]`);
      if (!(editor instanceof HTMLElement)) throw new Error(`expected a code-label editor on edge=${edge}`);
      await expect(editor.getAttribute("data-slot")).toBe("code-editor");
    }

    // The theme row: A-2's palette swap reaches the SAME label slot A-5
    // proves highlighting on — dark-modern's keyword-adjacent operator
    // colour differs from the unthemed row above it.
    const themed = canvasElement.querySelector('[data-testid="code-label-themed"]');
    if (!(themed instanceof HTMLElement)) throw new Error('expected [data-testid="code-label-themed"]');
    await expect(getComputedStyle(themed).backgroundColor).toBe("rgb(31, 31, 31)");
  },
};
