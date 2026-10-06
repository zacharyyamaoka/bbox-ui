/**
 * STEP IN vs EXPAND, for the CodeEditor pseudo-code block.
 *
 * Zach, Daily Note 2026-09-19: "Also show this for the CodeEditor Psuedo code
 * block. I think we already kinda have this expand.. but I would be curious to
 * see what step in looks like for it..."
 *
 * ── THE "WE ALREADY KINDA HAVE THIS EXPAND" CHECK ───────────────────────────
 *
 * Measured before building anything, because it decides whether this file is a
 * new arm or an extension of an old one. **There is no expand in this package.**
 * Grepping `src/` for modal / overlay / fullscreen / backdrop / maximise turns
 * up only `blockMembers.tsx` and `portEdge.tsx`'s red DEBUG CARD overlays and
 * `labeledPort.tsx`'s label-positioning overlay — none of them a mode.
 *
 * The one thing named "expanded" here is `BlockPort`'s `view="expanded"`, and
 * it is an unrelated concept wearing the same word: it spreads a port RAIL
 * evenly across the body band instead of packing it (`BlockPort.stories.tsx`
 * "expanded view · evenly spread across the body band"). It has nothing to do
 * with filling the screen. The expand Zach remembers is `apps/notebook-lab`'s
 * (`Lab.tsx`'s `expandedId`, since moved with the lab to /home/bam/marimo-canvas),
 * which he reviewed the day before — a different app. So this story builds both arms from scratch, and the naming collision is
 * worth stating out loud so the next reader does not "reuse" the rail's flag.
 *
 * ── WHY THE CANVAS HERE IS SCENERY AND THE LAB'S IS REAL ────────────────────
 *
 * The siblings and wires below are drawn plainly (a Block and two hand-authored
 * SVG elbows) rather than wired through `BlockPort` + `WireLayer`. Their entire
 * job in this story is to LEAVE, and `WireLayer` re-measures against a
 * container that `fly` is actively transforming — so a real wire layer would
 * spend the transition chasing a moving frame and turn the thing being compared
 * into a wire-routing bug hunt. The lab is where the real ports and wires prove
 * this under `acceptance.mjs`; this story is where the CODE EDITOR's own
 * reading of it is judged.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { python } from "@codemirror/lang-python";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Block } from "./block";
import { CodeEditor } from "./codeEditor";
import { codeEditorWidthPx } from "./codeEditorLayout";
import {
  DEFAULT_STEP_IN_VARIANT,
  DEFAULT_TONE,
  MOTION,
  STEP_IN_VARIANTS,
  TONE_STOPS,
  cameraFit,
  plateColor,
  toneStop,
  type StepInVariantId,
} from "../stepIn/tokens";

/* ------------------------------------------------------------------ */

const PSEUDO_CODE = `def rolling(values, window, aggregation="mean"):
    """Reduce each window of \`window\` samples down to a single number."""
    results = []
    for index in range(len(values) - window + 1):
        span = values[index : index + window]
        if aggregation == "mean":
            results.append(sum(span) / window)
        elif aggregation == "max":
            results.append(max(span))
        else:
            raise ValueError(f"unknown aggregation: {aggregation!r}")
    return results
`;

const SIBLING_A = `samples = load("readings.csv")
window = 12`;

const SIBLING_B = `plot(rolling(samples, window))
show()`;

/** The stage ground for this bench. Unlike the lab (a pure-white canvas) the
 *  Storybook bench sits on `--background`, so the ground is stated once here
 *  and the tone ladder is a delta from it — same rule, different ground. */
const GROUND_L = 0.995;

/* ------------------------------------------------------------------ */
/* The bench                                                           */
/* ------------------------------------------------------------------ */

type Mode = "board" | "step-in" | "expand";

function StepInBench({
  initialMode = "board",
  initialVariant = DEFAULT_STEP_IN_VARIANT,
  initialTone = DEFAULT_TONE,
  /** Render only the target block — used by the tone-ladder gallery, where
   *  four benches sit side by side and the siblings are just noise. */
  bare = false,
  benchId = "bench",
}: {
  initialMode?: Mode;
  initialVariant?: StepInVariantId;
  initialTone?: string;
  bare?: boolean;
  benchId?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [variantId, setVariantId] = useState<StepInVariantId>(initialVariant);
  const [toneId, setToneId] = useState(initialTone);
  const [code, setCode] = useState(PSEUDO_CODE);
  const canvasRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<{ scale: number; tx: number; ty: number } | null>(null);

  const tone = toneStop(toneId);
  const plate = plateColor(GROUND_L, tone.delta);
  const stepping = mode === "step-in";
  const lifted = stepping && variantId !== "fly";
  const flying = stepping && variantId === "fly";
  const variant = STEP_IN_VARIANTS.find((v) => v.id === variantId) ?? STEP_IN_VARIANTS[0];

  /** The camera, measured off the real DOM at the moment of entry — the same
   *  pure `cameraFit` the lab uses, so both apps answer `fly` identically. */
  useEffect(() => {
    if (!flying) { setCamera(null); return; }
    const canvas = canvasRef.current;
    const target = targetRef.current;
    if (!canvas || !target) return;
    const canvasBox = canvas.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const frame = canvas.parentElement?.getBoundingClientRect() ?? canvasBox;
    setCamera(
      cameraFit({
        target: {
          x: targetBox.x - canvasBox.x,
          y: targetBox.y - canvasBox.y,
          width: targetBox.width,
          height: targetBox.height,
        },
        canvasOrigin: { x: canvasBox.x, y: canvasBox.y },
        viewport: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
        measurePx: Math.min(frame.width - 80, 760),
        padTopPx: 24,
        maxScale: 1.9,
      }),
    );
  }, [flying]);

  // Escape leaves whichever mode is open — a place is walked out of, a layer is
  // dismissed, and the KEY is the same for both on purpose: the two modes
  // differ in what they mean, not in how you get out.
  useEffect(() => {
    if (mode === "board") return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMode("board"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  /**
   * Block's `width` is a DEFAULT of 320 (block.tsx:96), not "hug contents" —
   * passing `undefined` gets 320px, it does not opt out. Measured: the plate
   * stayed 320 wide while the 92-column editor inside kept its own 778px inline
   * width, and Block's root is `overflow: hidden`, so every line lost its first
   * ~20 characters and the story still looked like it rendered. The width has
   * to be stated, and stated from the SAME column maths the editor itself uses
   * (`codeEditorWidthPx`, the trunk's own function) or the two drift apart the
   * next time either padding changes.
   *
   * CHROME_PX is Block's own body padding (px-3 a side) plus a little slack.
   */
  //
   // The `bare` benches sit two-across in the tone gallery, so their frame is
   // roughly half as wide as the main bench's. Handing them the same 92-column
   // measure put an 808px plate inside a ~580px frame and clipped every line's
   // first ~10 characters — the SAME failure as Block's 320px default, one
   // container further out, and just as invisible to a test that only asks
   // whether the plate rendered. The tone gallery is about TONE, so a narrower
   // measure costs it nothing.
  const columns = lifted ? (bare ? 52 : 92) : 62;
  const fontPx = lifted ? 13 : 11.5;
  const blockWidth = (codeEditorWidthPx(columns, fontPx, true, 8, 8) ?? 320) + 26;

  const editor = useMemo(
    () => (
      <CodeEditor
        value={code}
        onWrite={setCode}
        language={python()}
        multiline
        lineNumbers
        columns={columns}
        overflow="scroll"
        fontSizePx={fontPx}
        ariaLabel="rolling window pseudo-code"
        testId={`${benchId}-code`}
      />
    ),
    [code, columns, fontPx, benchId],
  );

  /** One render path for the target block, board and stage alike — two paths
   *  would drift, and the claim of step-in is that it is the SAME code. */
  const targetBlock = (
    <div data-testid={`${benchId}-target`} data-dissolved={stepping || undefined}>
      <Block
        header={stepping ? undefined : <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>rolling.py</span>}
        body={<div style={{ padding: stepping ? 0 : 2 }}>{editor}</div>}
        width={blockWidth}
      />
    </div>
  );

  return (
    <div
      className="stepin-bench"
      data-bench={benchId}
      data-bare={bare || undefined}
      data-mode={mode}
      data-step-variant={stepping ? variantId : undefined}
      style={
        {
          "--sb-plate": plate,
          "--sb-ground": `oklch(${GROUND_L} 0 0)`,
          "--sb-ms": `${MOTION.durationMs}ms`,
          "--sb-world-ms": `${MOTION.worldMs}ms`,
          "--sb-ease": MOTION.ease,
          "--sb-tx": `${camera?.tx ?? 0}px`,
          "--sb-ty": `${camera?.ty ?? 0}px`,
          "--sb-scale": String(camera?.scale ?? 1),
        } as React.CSSProperties
      }
    >
      <style>{BENCH_CSS}</style>

      {/* ---- the canvas ------------------------------------------------ */}
      <div className="stepin-frame">
        <div className="stepin-canvas" ref={canvasRef}>
          {!bare && (
            <>
              <svg className="stepin-wires" width="100%" height="100%" aria-hidden>
                <path d="M 232 118 L 300 118 L 300 214 L 352 214" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
                <path d="M 352 340 L 300 340 L 300 430 L 232 430" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
                <circle cx="352" cy="214" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
                <circle cx="352" cy="340" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
              </svg>
              <div className="stepin-sibling" style={{ left: 24, top: 78 }} data-testid={`${benchId}-sibling-a`}>
                <Block header={<span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>load.py</span>}
                  body={<pre className="stepin-scenery">{SIBLING_A}</pre>} width={200} />
              </div>
              <div className="stepin-sibling" style={{ left: 24, top: 390 }} data-testid={`${benchId}-sibling-b`}>
                <Block header={<span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>plot.py</span>}
                  body={<pre className="stepin-scenery">{SIBLING_B}</pre>} width={200} />
              </div>
            </>
          )}

          {/* The target keeps its board seat in every mode — `fly` needs it to
              still be there, and the lifted variants need something to measure
              the camera against even when they do not use it. */}
          <div className="stepin-seat" ref={targetRef} style={{ left: bare ? 24 : 360, top: 92 }}>
            {!lifted && targetBlock}
          </div>
        </div>

        {/* ---- the lifted stage ----------------------------------------- */}
        {lifted && (
          <div
            className="stepin-stage"
            data-testid={`${benchId}-stage`}
            onPointerDown={(event) => { if (event.target === event.currentTarget) setMode("board"); }}
          >
            <div className="stepin-plate" data-testid={`${benchId}-plate`}>{targetBlock}</div>
          </div>
        )}

        {/* ---- the modal layer ------------------------------------------ */}
        {mode === "expand" && (
          <div
            className="stepin-scrim"
            data-testid={`${benchId}-scrim`}
            onPointerDown={(event) => { if (event.target === event.currentTarget) setMode("board"); }}
          >
            <div className="stepin-modal" data-testid={`${benchId}-modal`}>
              <div className="stepin-modal-bar">
                {/* The modal bar says what the card's own header does NOT — the
                    reading measure. Repeating "rolling.py" here put the same
                    label twice in one capture and told the reader nothing. */}
                <span className="stepin-modal-title">92 columns</span>
                <button className="stepin-modal-close" onClick={() => setMode("board")} data-testid={`${benchId}-close`}>
                  close · esc
                </button>
              </div>
              <Block
                header={<span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>rolling.py</span>}
                body={
                  <CodeEditor
                    value={code} onWrite={setCode} language={python()} multiline lineNumbers
                    columns={92} overflow="scroll" fontSizePx={13}
                    ariaLabel="rolling window pseudo-code, expanded" testId={`${benchId}-modal-code`}
                  />
                }
                width={(codeEditorWidthPx(92, 13, true, 8, 8) ?? 320) + 26}
              />
            </div>
          </div>
        )}

        {/* The breadcrumb — a PLACE has an address and a way back up. */}
        {stepping && (
          <div className="stepin-crumb" data-testid={`${benchId}-crumb`}>
            <button onClick={() => setMode("board")} data-testid={`${benchId}-step-out`}>canvas</button>
            <span className="stepin-crumb-sep">›</span>
            <span className="stepin-crumb-here">rolling.py</span>
            <span className="stepin-crumb-esc">esc</span>
          </div>
        )}
      </div>

      {/* ---- the in-app control, never a URL flag ---------------------- */}
      <div className="stepin-controls" data-testid={`${benchId}-controls`}>
        <div className="stepin-seg" data-testid={`${benchId}-mode`}>
          {(["board", "step-in", "expand"] as const).map((id) => (
            <button
              key={id}
              data-testid={`${benchId}-mode-${id}`}
              aria-pressed={mode === id}
              data-active={mode === id || undefined}
              onClick={() => setMode(id)}
            >
              {id}
            </button>
          ))}
        </div>
        <label>
          how
          <select
            value={variantId} disabled={!stepping}
            data-testid={`${benchId}-variant`}
            onChange={(event) => setVariantId(event.target.value as StepInVariantId)}
          >
            {STEP_IN_VARIANTS.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
          </select>
        </label>
        <label>
          tone
          <select
            value={toneId} disabled={!stepping}
            data-testid={`${benchId}-tone`}
            onChange={(event) => setToneId(event.target.value)}
          >
            {TONE_STOPS.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
        </label>
        <p className="stepin-blurb" data-testid={`${benchId}-blurb`}>
          {mode === "board"
            ? "double-click the header, or pick a mode — step-in changes WHERE YOU ARE, expand changes WHAT IS ON TOP."
            : stepping
              ? variant.blurb
              : "a layer on top — the canvas stays where it is, dimmed but legible. Tone has no referent behind a scrim."}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const BENCH_CSS = `
.stepin-bench { display: flex; flex-direction: column; gap: 10px; color: var(--foreground, #111); }
.stepin-frame {
  position: relative;
  width: 100%;
  height: 560px;
  overflow: hidden;
  border: 1px solid var(--border, #e4e4e7);
  border-radius: 12px;
  background: var(--sb-ground);
}
.stepin-canvas {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(oklch(0.89 0 0) 1px, transparent 1px);
  background-size: 24px 24px;
  transform-origin: 0 0;
  transition: transform var(--sb-ms) var(--sb-ease), opacity var(--sb-ms) var(--sb-ease),
              filter var(--sb-ms) var(--sb-ease);
}
.stepin-sibling, .stepin-seat { position: absolute; transition: opacity var(--sb-world-ms) var(--sb-ease); }
.stepin-wires { position: absolute; inset: 0; color: #64748b; transition: opacity var(--sb-world-ms) var(--sb-ease); }
.stepin-scenery {
  margin: 0; padding: 6px 2px;
  font: 11px/1.5 ui-monospace, "SF Mono", Menlo, monospace;
  color: #52525b; white-space: pre;
}

/* ---- the world leaves ------------------------------------------------ */
/* dissolve and fly empty the canvas around the target; recede keeps the whole
   board and pushes it BACK instead. That difference is the variant, not a
   detail of it — see stepIn/tokens.ts. */
.stepin-bench[data-bare] .stepin-frame { height: 400px; }
.stepin-bench[data-step-variant="dissolve"] .stepin-sibling,
.stepin-bench[data-step-variant="dissolve"] .stepin-wires,
.stepin-bench[data-step-variant="fly"] .stepin-sibling,
.stepin-bench[data-step-variant="fly"] .stepin-wires { opacity: 0; pointer-events: none; }

.stepin-bench[data-step-variant="dissolve"] .stepin-canvas { opacity: 0; pointer-events: none; }
.stepin-bench[data-step-variant="dissolve"] .stepin-canvas,
.stepin-bench[data-step-variant="fly"] .stepin-canvas { background-image: none; }

.stepin-bench[data-step-variant="fly"] .stepin-canvas {
  transform: translate(var(--sb-tx), var(--sb-ty)) scale(var(--sb-scale));
}

.stepin-bench[data-step-variant="recede"] .stepin-canvas {
  transform: scale(0.9);
  transform-origin: 50% 40%;
  filter: blur(3px) saturate(0.45);
  opacity: 0.62;
  pointer-events: none;
}

/* ---- the chrome dissolves -------------------------------------------- */
/* Contract-guaranteed hooks only: Block emits data-slot="block"/"block-header",
   so this works for anything built from the trunk's Block without that
   component knowing the mode exists. */
.stepin-bench[data-mode="step-in"] [data-dissolved] [data-slot="block"] {
  border-color: transparent !important;
  box-shadow: none !important;
  background: var(--sb-plate) !important;
  transition: background var(--sb-ms) var(--sb-ease), border-color var(--sb-ms) var(--sb-ease),
              box-shadow var(--sb-ms) var(--sb-ease);
}
.stepin-bench[data-mode="step-in"] [data-dissolved] [data-slot="block-body"] { padding: 0 !important; }
.stepin-bench[data-mode="step-in"] [data-dissolved] [data-slot="code-editor"] {
  background: var(--sb-plate) !important;
  border-color: transparent !important;
  box-shadow: none !important;
  transition: background var(--sb-ms) var(--sb-ease), border-color var(--sb-ms) var(--sb-ease);
}
/* The gutter is part of the editor's surface, so it follows the plate rather
   than staying on its own tone — a gutter that keeps a card colour after the
   card dissolved is the one seam that gives the trick away. */
.stepin-bench[data-mode="step-in"] [data-dissolved] .cm-gutters {
  background: var(--sb-plate) !important;
  border-right-color: transparent !important;
}

/* ---- the lifted stage ------------------------------------------------ */
.stepin-stage {
  position: absolute; inset: 0; z-index: 3;
  display: flex; justify-content: center; overflow-y: auto;
  padding: 44px 20px 24px;
  animation: sb-stage-in var(--sb-ms) var(--sb-ease) both;
}
.stepin-bench[data-step-variant="dissolve"] .stepin-stage { background: var(--sb-ground); }
.stepin-bench[data-step-variant="recede"] .stepin-stage {
  background: color-mix(in oklab, var(--sb-ground) 78%, transparent);
}
/* flex:none is load-bearing, not tidiness. The plate is a flex ITEM, so its
   default flex-shrink:1 let it collapse to 320px while the CodeEditor inside
   kept its fixed 778px inline width — and Block's root is overflow:hidden, so
   the editor was centred inside the collapsed box and clipped on BOTH sides.
   Measured: plate x=430 w=320, editor x=201 w=778. Every line of code lost its
   first ~20 characters, and the story still "rendered". */
.stepin-plate {
  flex: none;
  height: fit-content; margin: auto;
  background: var(--sb-plate); border-radius: 12px;
}

/* ---- the modal layer -------------------------------------------------- */
.stepin-scrim {
  position: absolute; inset: 0; z-index: 4;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 28px 20px;
  overflow-y: auto;
  background: rgb(15 23 42 / 0.38);
  animation: sb-stage-in var(--sb-ms) var(--sb-ease) both;
}
.stepin-modal { flex: none; height: fit-content; filter: drop-shadow(0 20px 40px rgb(2 6 23 / 0.45)); }
.stepin-modal-bar {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  padding: 4px 12px; border-radius: 999px;
  background: rgb(15 23 42 / 0.75); color: rgb(255 255 255 / 0.9);
  font: 12px/1.6 ui-monospace, Menlo, monospace;
}
.stepin-modal-title { font-weight: 600; }
.stepin-modal-close {
  margin-left: auto; border: 0; cursor: pointer;
  border-radius: 999px; padding: 1px 10px;
  background: rgb(255 255 255 / 0.2); color: #fff; font: inherit;
}
.stepin-modal-close:hover { background: rgb(255 255 255 / 0.35); }

/* ---- the breadcrumb --------------------------------------------------- */
.stepin-crumb {
  position: absolute; top: 12px; left: 14px; z-index: 5;
  display: flex; align-items: center; gap: 8px;
  font: 12px/1 ui-monospace, "SF Mono", Menlo, monospace;
  animation: sb-crumb-in var(--sb-ms) var(--sb-ease) both;
}
.stepin-crumb button {
  border: 0; background: transparent; cursor: pointer; font: inherit;
  padding: 2px 4px; border-radius: 5px; color: #71717a;
}
.stepin-crumb button:hover { color: #18181b; background: oklch(0.95 0 0); }
.stepin-crumb-sep { color: #a1a1aa; }
.stepin-crumb-here { font-weight: 600; }
.stepin-crumb-esc {
  margin-left: 4px; padding: 2px 6px; border-radius: 4px;
  font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  color: #71717a; background: oklch(0.95 0 0);
}

/* ---- the control ------------------------------------------------------ */
.stepin-controls {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
}
.stepin-controls label { display: flex; align-items: center; gap: 6px; color: #71717a; }
.stepin-controls select {
  border: 1px solid var(--border, #e4e4e7); border-radius: 6px;
  padding: 3px 6px; background: #fff; font: inherit; color: #18181b;
}
.stepin-controls select:disabled { opacity: 0.4; }
.stepin-seg { display: flex; overflow: hidden; border: 1px solid var(--border, #e4e4e7); border-radius: 7px; }
.stepin-seg button {
  border: 0; cursor: pointer; padding: 4px 10px; background: #fff;
  font: 12px/1.4 ui-monospace, Menlo, monospace; color: #3f3f46;
}
.stepin-seg button[data-active] { background: #18181b; color: #fff; }
.stepin-blurb { flex: 1 1 260px; min-width: 240px; margin: 0; color: #71717a; }

@keyframes sb-stage-in { from { opacity: 0; transform: translateY(8px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes sb-crumb-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
`;

/* ------------------------------------------------------------------ */

const meta = {
  // Section/family/tags per `src/storyOrganisation.test.ts`: the donor's
  // `Blocks/StepInVsExpand` title and `area:blocks` tag (ported 2026-09-30
  // from worktree-agent-a45de5bb9101da160 `4a663fe`/`40572ff`, where the
  // file lived in the since-renamed `src/stories/`) predate that rule.
  // Still a VARIANTS gallery on purpose: Zach's pick among dissolve / fly /
  // recede is not recorded anywhere, and L-NAV's step in/out (P-015) is the
  // lane that will choose.
  title: "Components/Blocks/Step In Vs Expand",
  tags: ["object:block", "lane:step-in-expand"],
  component: StepInBench,
} satisfies Meta<typeof StepInBench>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The whole comparison in one bench — switch mode, variant and tone live.
 * Variant 1 (`dissolve`) is already the default, so ignoring the other two
 * costs nothing.
 */
export const Bench: Story = {
  render: () => <StepInBench benchId="bench" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // findBy* first: a getBy* on the first tick fails under load, and every
    // negative assertion below is VACUOUSLY true against an unmounted story.
    const stepIn = await canvas.findByTestId("bench-mode-step-in");

    const board = canvasElement.querySelector('[data-bench="bench"]');
    if (!(board instanceof HTMLElement)) throw new Error("expected the bench root");

    /* -- the board it departs from ---------------------------------- */
    const siblingA = canvas.getByTestId("bench-sibling-a");
    await expect(getComputedStyle(siblingA).opacity).toBe("1");

    /* -- STEP IN empties the canvas --------------------------------- */
    await userEvent.click(stepIn);
    await waitFor(async () => {
      await expect(board.getAttribute("data-mode")).toBe("step-in");
    });
    // MEASURED, not DOM-presence-asserted: the sibling is still in the tree —
    // the claim is that it is no longer visible, which only a computed style
    // can answer.
    await waitFor(async () => {
      await expect(getComputedStyle(canvas.getByTestId("bench-sibling-a")).opacity).toBe("0");
    });
    await expect(getComputedStyle(canvas.getByTestId("bench-sibling-a")).pointerEvents).toBe("none");

    // The code really is centred in the frame, within a pixel of tolerance for
    // sub-pixel layout — this is the sentence Zach actually wrote.
    const stage = await canvas.findByTestId("bench-stage");
    const plate = canvas.getByTestId("bench-plate");
    const stageBox = stage.getBoundingClientRect();
    const plateBox = plate.getBoundingClientRect();
    const dx = (plateBox.x + plateBox.width / 2) - (stageBox.x + stageBox.width / 2);
    await expect(Math.abs(dx)).toBeLessThan(2);

    // The chrome dissolved: the block's border went transparent.
    const card = plate.querySelector('[data-slot="block"]');
    if (!(card instanceof HTMLElement)) throw new Error('expected a [data-slot="block"] inside the plate');
    const borderColor = getComputedStyle(card).borderTopColor;
    await expect(borderColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

    // A breadcrumb, not a close button: step-in is a PLACE.
    await expect(canvas.getByTestId("bench-crumb")).toBeInTheDocument();
    await expect(canvas.queryByTestId("bench-scrim")).not.toBeInTheDocument();

    /* -- EXPAND is the opposite on every count ----------------------- */
    await userEvent.click(canvas.getByTestId("bench-mode-expand"));
    const scrim = await canvas.findByTestId("bench-scrim");
    await waitFor(async () => {
      await expect(board.getAttribute("data-mode")).toBe("expand");
    });
    // The canvas is still THERE and still legible — that is the definitional
    // difference, and it is the assertion that would fail if expand ever
    // started emptying the canvas too.
    //
    // Waited on rather than read once, and the reason is worth keeping: coming
    // from step-in the sibling is mid-fade, so the first tick caught it at
    // opacity 0.153 on its way BACK to 1. The claim is that it ends up fully
    // legible, not that it is legible within one frame of the click — reading
    // it once was testing the transition's duration, not expand's meaning.
    await waitFor(async () => {
      await expect(getComputedStyle(canvas.getByTestId("bench-sibling-a")).opacity).toBe("1");
    }, { timeout: 3000 });
    const scrimBg = getComputedStyle(scrim).backgroundColor;
    await expect(scrimBg).not.toBe("rgba(0, 0, 0, 0)");
    // And the block KEPT its chrome, where step-in dissolved it.
    const modalCard = canvas.getByTestId("bench-modal").querySelector('[data-slot="block"]');
    if (!(modalCard instanceof HTMLElement)) throw new Error("expected a Block inside the modal");
    await expect(getComputedStyle(modalCard).borderTopColor).not.toMatch(/rgba\(0, 0, 0, 0\)/);
    // A dismissal, not a way back up.
    await expect(canvas.queryByTestId("bench-crumb")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("bench-close")).toBeInTheDocument();

    /* -- and back out ------------------------------------------------ */
    await userEvent.click(canvas.getByTestId("bench-close"));
    await waitFor(async () => {
      await expect(board.getAttribute("data-mode")).toBe("board");
    });
  },
};

/**
 * `fly` on its own, because it is the one variant whose claim is SPATIAL —
 * the canvas is transformed rather than replaced, so the proof has to be a
 * measured transform, not a class name.
 */
export const FlyCamera: Story = {
  render: () => <StepInBench benchId="fly" initialMode="step-in" initialVariant="fly" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByTestId("fly-crumb");
    const seat = canvasElement.querySelector('[data-bench="fly"] .stepin-seat');
    const frame = canvasElement.querySelector('[data-bench="fly"] .stepin-frame');
    const surface = canvasElement.querySelector('[data-bench="fly"] .stepin-canvas');
    if (!(seat instanceof HTMLElement) || !(frame instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
      throw new Error("expected the fly bench's seat, frame and canvas");
    }

    // The canvas really is transformed — a non-identity matrix, measured.
    await waitFor(async () => {
      const transform = getComputedStyle(surface).transform;
      await expect(transform).not.toBe("none");
      await expect(transform).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
    });

    // And the block it flew to is genuinely centred horizontally in the frame.
    await waitFor(async () => {
      const seatBox = seat.getBoundingClientRect();
      const frameBox = frame.getBoundingClientRect();
      const dx = (seatBox.x + seatBox.width / 2) - (frameBox.x + frameBox.width / 2);
      await expect(Math.abs(dx)).toBeLessThan(3);
    }, { timeout: 3000 });

    // `fly` MAGNIFIES rather than re-measuring: the on-screen block is wider
    // than its authored box, which is the trade-off the variant exists to
    // put on screen (tokens.ts). A re-measured variant would leave scale at 1.
    const scale = new DOMMatrix(getComputedStyle(surface).transform).a;
    await expect(scale).toBeGreaterThan(1);
  },
};

/**
 * The tone question, side by side. Zach: "perhaps just a small tone
 * difference, then it could look quite good..." — four settings of it, with
 * the two ENDS included because they are wrong, so the middle has something to
 * be right against.
 */
export const ToneLadder: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      {TONE_STOPS.map((stop) => (
        <div key={stop.id}>
          <div style={{ marginBottom: 6, font: "12px/1.4 ui-monospace, Menlo, monospace", color: "#52525b" }}>
            {stop.name} — {stop.note}
          </div>
          <StepInBench benchId={`tone-${stop.id}`} bare initialMode="step-in" initialTone={stop.id} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByTestId("tone-whisper-plate");

    // The ladder is MONOTONIC on screen, not just in the source. Reading each
    // plate's rendered colour is what makes this a measurement rather than a
    // restatement of TONE_STOPS.
    const lightness = (testId: string) => {
      const plate = canvas.getByTestId(testId);
      const value = getComputedStyle(plate).backgroundColor;
      const oklch = /^okl(?:ch|ab)\(\s*([\d.]+)/.exec(value);
      if (oklch) return parseFloat(oklch[1]);
      const rgb = /rgba?\(([^)]+)\)/.exec(value);
      if (!rgb) throw new Error(`could not read a colour from ${testId}: ${value}`);
      const [r, g, b] = rgb[1].split(",").map((n) => parseFloat(n) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const flush = lightness("tone-flush-plate");
    const whisper = lightness("tone-whisper-plate");
    const paper = lightness("tone-paper-plate");
    const card = lightness("tone-card-plate");

    await expect(whisper).toBeLessThan(flush);
    await expect(paper).toBeLessThan(whisper);
    await expect(card).toBeLessThan(paper);

    // flush must be a genuine ZERO against the stage it sits on, or the ladder
    // is meaningless at its origin. Measured against the frame's own ground
    // rather than against itself — comparing a value to itself would pass for
    // any delta at all, which is exactly the kind of check that reads green and
    // proves nothing.
    const frame = canvasElement.querySelector('[data-bench="tone-flush"] .stepin-frame');
    if (!(frame instanceof HTMLElement)) throw new Error("expected the flush bench frame");
    await expect(getComputedStyle(frame).backgroundColor)
      .toBe(getComputedStyle(canvas.getByTestId("tone-flush-plate")).backgroundColor);

    // …and the far end must be visibly different from that same ground, so the
    // control has a real span rather than four indistinguishable settings.
    await expect(Math.abs(card - flush)).toBeGreaterThan(0.02);
  },
};
