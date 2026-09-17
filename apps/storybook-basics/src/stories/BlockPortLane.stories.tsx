import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Block } from "../components/block";
import type { BlockMember } from "../components/blockMembers";
import { PortedBlock, railDotCentres, railPitches } from "../components/blockPortEdges";
import { railAxisFor, railPlanFor, type BlockPortLayout, type BlockView } from "../components/blockPortEdges.layout";
import type { BlockSide } from "../components/port.layout";
import { PortEdge, laneAvailability, type PortEdgeItem } from "../components/portEdge";
import { computeSlots, groupingSetFromText } from "../components/portEdge.layout";

/**
 * Basics/BlockPortLane — phase A2 of docs/BLOCK-PORT-EDGES-PLAN.md: the
 * multi-line port lane, RE-PROVEN on a rail that is mounted on a `Block`.
 *
 * Zach, 2026-09-17: "Make sure to test that the multi-line port editing
 * feature of the port edge works once you add it to the block, and that the
 * other features still work."
 *
 * Nothing in the lane changed for this phase — `portLane.ts` and
 * `portEdge.tsx`'s overlay are untouched here. What changed is the lane's
 * ENVIRONMENT, and the plan (§6) names exactly three ways an environment can
 * break it. Each gets a measured catch, never a DOM-presence one:
 *
 *   1. PITCH SOURCE. `useLaneGeometry` measures the live dots and hands the
 *      gap to CodeMirror as `.cm-line { height }`. On a bare edge the
 *      distribution was always the story's own; on a Block it is whatever
 *      `railPlanFor` derived from the VIEW — `aligned/start` in port view,
 *      `space-evenly` in expanded view, two different pitches from two
 *      different formulas. Both are re-measured here, every line against its
 *      own dot, never a sample. A rail whose lines drift 3px per row and one
 *      that is perfect have identical DOM.
 *   2. CONTAINING BLOCK. The overlay is `position: absolute` against the
 *      track. On a Block the track now sits inside a rail div that is itself
 *      absolutely positioned inside the wrapper — two more positioned
 *      ancestors than the lane ever had. Caught by measuring line centres
 *      against dot centres in VIEWPORT coordinates, which is false the
 *      instant the overlay resolves against the wrong box.
 *   3. CLIPPING. `Block`'s root is `overflow-hidden rounded-lg`
 *      (block.tsx:102). A LEFT-edge lane opens RIGHTWARD, straight INTO the
 *      Block's card — measured on `LaneOnPortView`: frame x[93.00, 146.14]
 *      y[189.00, 325.00] sits entirely inside block x[72.00, 292.00]
 *      y[165.00, 425.00]. It never leaves the card's own clip rect, so it is
 *      the one edge a Block clip CANNOT shear — `expectLaneAboveCard` is the
 *      reading that specimen can actually prove (z-order: does the lane
 *      paint on top of the card it overlaps). It is the RIGHT-wall lane that
 *      opens AWAY from the card and can be sheared — measured on
 *      `LaneOnRightWall`: frame.left 313.00 vs block.right 292.00, entirely
 *      past the wall. `expectLaneEscapesCardUnclipped` is the clipping
 *      reading, reserved for specimens like this one where the lane
 *      genuinely escapes. Neither reading is provable by "the element
 *      exists" (a clipped element still exists, and still reports a full
 *      `getBoundingClientRect`) — only `document.elementFromPoint` can tell
 *      a clipped pixel from a merely-covered one, which is why both helpers
 *      hit-test rather than compare rectangles.
 *
 * TWO FINDINGS came out of this phase. Both are REAL DEFECTS, both are
 * measured, and neither is papered over by a softened assertion — each gets
 * a story that pins today's wrong behaviour so the fix flips a `toBe` rather
 * than having to be rediscovered. Neither fix belongs in this file: both
 * seams live in `portEdge.tsx` / `blockPortEdges.tsx`, which are phase A1's.
 *
 *   F1 · THE LANE CANNOT OPEN ON THE COMMIT ITS TRACK MOUNTS.
 *        `useLaneGeometry` (portEdge.tsx:652-682) reads `trackRef.current`
 *        in a `useLayoutEffect` whose dep array is only the item-id string.
 *        React runs a child's layout effect BEFORE attaching the parent host
 *        element's ref, so when `<PortEdge editing>` mounts, the overlay's
 *        effect sees `trackRef.current === null`, returns early, and — the
 *        deps never changing — never runs again. `geometry` stays null,
 *        `PortLaneOverlay` returns null, and the lane silently does not
 *        exist. It is not Block-specific, but `PortedBlock` makes it
 *        UNAVOIDABLE: rails only mount once `useBlockBands` has measured, so
 *        a rail whose `editing` is already true always mounts its track and
 *        its overlay in the same commit. `LaneOpenedAtMount` pins it on both
 *        a rail and a bare `PortEdge`. Every other story here opens the lane
 *        after the first paint (`LaneBench`'s `openWhen`), which is the
 *        workaround, stated as one.
 *
 *   F2 · THE RESTING LABELS ARE NOT TURNED OFF UNDER AN OPEN LANE.
 *        `hideLabel` — PortEdge's "the lane IS the labels now" seam — is
 *        honoured only by PortEdge's DEFAULT fill (portEdge.tsx:312-317),
 *        and `PortedBlock` always supplies its own `renderItem`. See
 *        `restingLabels`' own doc. On a left wall the lane's opaque panel
 *        hides all but a ~2px sliver; on a right wall the labels flow inward
 *        while the lane opens outward, so every label is drawn twice, fully
 *        visible. `LaneOnRightWall` pins that.
 */

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function benchOf(canvasElement: HTMLElement, benchId: string): HTMLElement {
  return required<HTMLElement>(canvasElement, `[data-slot="lane-bench"][data-bench="${benchId}"]`, `the \`${benchId}\` bench`);
}

function wrapperOf(bench: HTMLElement): HTMLElement {
  return required<HTMLElement>(bench, '[data-slot="ported-block"]', "a PortedBlock");
}

function railOf(bench: HTMLElement, edge: BlockSide): HTMLElement {
  // A plain descendant query, not `:scope > …` — a rail reparented INSIDE
  // the Block by a mutation still has to be findable here, or the
  // structural check right below it never gets the chance to fire and a
  // reparenting defect just looks like "no rail found".
  const rail = required<HTMLElement>(bench, `[data-slot="ported-block-rail"][data-edge="${edge}"]`, `a ${edge} rail`);
  // THE property "not clipped by the Block" actually rests on (§5): rails
  // are siblings of `[data-slot="block"]` inside `[data-slot="ported-block"]`,
  // never descendants. Geometry cannot see this for a left lane — it opens
  // INTO the card either way (module doc's CLIPPING note) — which is exactly
  // how a reparenting mutation slipped past every hit-test reading below
  // until this direct structural check was added.
  if (rail.closest('[data-slot="block"]') !== null) {
    throw new Error(`${bench.getAttribute("data-bench")} · the ${edge} rail is a DESCENDANT of \`[data-slot="block"]\`, not a sibling in \`[data-slot="ported-block"]\` — it can be clipped by the Block's own overflow:hidden`);
  }
  return rail;
}

function blockRectOf(bench: HTMLElement): DOMRect {
  return required<HTMLElement>(wrapperOf(bench), ':scope > [data-slot="block"]', "the Block").getBoundingClientRect();
}

function toggleOf(bench: HTMLElement, edge: BlockSide): HTMLButtonElement {
  const button = required<HTMLElement>(bench, `[data-testid="lane-toggle-${edge}"]`, `the ${edge} lane toggle`);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`the ${edge} lane toggle is not a <button>`);
  return button;
}

/** The lane's own bordered frame — `codeEditor.css`'s `.bbox-code-editor`,
 *  which carries `overflow: hidden`, so anything outside it is genuinely
 *  gone rather than merely off-frame. */
function laneFrameOf(rail: HTMLElement): HTMLElement {
  return required<HTMLElement>(rail, '[data-slot="port-edge-lane"] [data-slot="code-editor"]', "the lane's editor frame");
}

function lineRectsOf(rail: HTMLElement): DOMRect[] {
  return Array.from(rail.querySelectorAll<HTMLElement>(".cm-line")).map((line) => line.getBoundingClientRect());
}

function lineTextsOf(rail: HTMLElement): (string | null)[] {
  return Array.from(rail.querySelectorAll<HTMLElement>(".cm-line")).map((line) => line.textContent);
}

function centreY(rect: DOMRect): number {
  return rect.top + rect.height / 2;
}

/* ------------------------------------------------------------------ */
/* Driving the lane                                                    */
/* ------------------------------------------------------------------ */

/**
 * Put the caret at the very END of the lane's document, then press Enter to
 * mint a row and type its label.
 *
 * WHY `Mod-End` and not "click the last `.cm-line`, then `{End}`": the
 * obvious version is WRONG here, and it failed silently in a way worth
 * recording. `userEvent`'s synthetic click carries no usable pointer
 * coordinates, so CodeMirror's own mousedown handler maps it through
 * `posAtCoords` and parks the caret at the top of the document regardless of
 * which `.cm-line` element was passed. Measured: `{End}{Enter}fault` on the
 * "status" line produced `cmd, fault, status` — the new row inserted after
 * `cmd`, the FIRST line. `Mod-End` is `cursorDocEnd` from CodeMirror's own
 * default keymap; it is coordinate-free, so it means what it says.
 *
 * The click on `.cm-content` is still there and still needed — it is what
 * focuses the editor if a previous step moved focus away.
 */
async function appendLaneRow(rail: HTMLElement, label: string): Promise<void> {
  const content = required<HTMLElement>(rail, '[data-slot="code-editor"] .cm-content', "the lane's editable content");
  await userEvent.click(content);
  await userEvent.keyboard("{Control>}{End}{/Control}{Enter}");
  if (label) await userEvent.keyboard(label);
}

/** Press the bench's own toggle and wait for the lane to actually go. The
 *  wait is generous because closing tears down a CodeMirror view, and under
 *  a full-suite run that has been measured to take longer than `waitFor`'s
 *  1s default. */
async function closeLane(bench: HTMLElement, rail: HTMLElement, edge: BlockSide): Promise<void> {
  await userEvent.click(toggleOf(bench, edge));
  await waitFor(() => expect(rail.querySelector('[data-slot="code-editor"]')).toBeNull(), { timeout: 5000 });
}

/**
 * A measured assertion that says what it measured when it fails. A bare
 * `toBeCloseTo` on two viewport numbers reports "expected 331.5 to be close
 * to 329" with no way to tell which line, which rail, or which rule broke.
 */
function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) {
    throw new Error(`${what} — measured ${actual.toFixed(2)}px, expected ${expected.toFixed(2)}px (±${tolerance}px), off by ${delta.toFixed(2)}px`);
  }
}

function expectUniform(values: number[], tolerance: number, what: string): void {
  if (values.length === 0) throw new Error(`${what} — no gaps to measure`);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!(max - min <= tolerance)) {
    throw new Error(`${what} — gaps [${values.map((v) => v.toFixed(2)).join(", ")}] span ${(max - min).toFixed(2)}px (±${tolerance}px allowed)`);
  }
}

/**
 * THE headline claim: one line per dot, and EVERY line's vertical centre on
 * its own dot's centre within 1px — not the first, not a sample. A lane that
 * drifts a fraction of a pixel per row is indistinguishable from a correct
 * one at row 0 and obviously broken at row 8, which is precisely why the
 * whole set is measured.
 */
function expectEveryLineOnItsDot(rail: HTMLElement, tolerance: number, what: string): { dots: { x: number; y: number }[]; lines: DOMRect[] } {
  const dots = railDotCentres(rail);
  const lines = lineRectsOf(rail);
  if (lines.length !== dots.length) {
    throw new Error(`${what} — ${lines.length} lane line(s) against ${dots.length} dot(s); the line↔dot bijection is what the lane IS`);
  }
  if (lines.length === 0) throw new Error(`${what} — no lane lines rendered at all`);
  for (let i = 0; i < lines.length; i++) {
    expectWithin(centreY(lines[i]), dots[i].y, tolerance, `${what} — line ${i} centre vs dot ${i} centre`);
  }
  return { dots, lines };
}

/**
 * Shared by both helpers below: (a) every line sits inside the lane's own
 * `overflow: hidden` frame. Near-tautological — it compares CodeMirror's
 * content box to its own lines — so it is kept as a redundant sanity check
 * and does NOT count as one of either helper's independent readings.
 */
function expectLinesInsideOwnFrame(rail: HTMLElement, frameRect: DOMRect, lines: DOMRect[], what: string): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.top < frameRect.top - 1 || line.bottom > frameRect.bottom + 1) {
      throw new Error(
        `${what} — line ${i} (${line.top.toFixed(2)}…${line.bottom.toFixed(2)}) escapes the lane frame (${frameRect.top.toFixed(2)}…${frameRect.bottom.toFixed(2)}), which clips its overflow`,
      );
    }
  }
}

/**
 * Z-ORDER: does the lane paint ON TOP of whatever else is under it, at every
 * one of its own lines? A hit test at each line's centre pixel — the §6
 * "Stacking" catch. This is the reading for a lane whose frame overlaps the
 * card WITHOUT necessarily escaping past its edge: a left-edge lane opens
 * RIGHTWARD, straight over the Block's card, and — module doc's CLIPPING
 * note — therefore stays entirely inside the card's own clip rect. There is
 * nothing there for a clipping probe to prove; stacking is the only claim a
 * left-wall specimen can actually make.
 *
 * Non-vacuity guard: `block` is the Block's own border box, and the frame
 * has to actually reach past its wall — `frameRect.right > block.left + 8`
 * — or "paints on top of the card" is trivially true because the two never
 * overlap in the first place.
 */
function expectLaneAboveCard(rail: HTMLElement, block: DOMRect, what: string): DOMRect {
  const frame = laneFrameOf(rail);
  const frameRect = frame.getBoundingClientRect();
  if (!(frameRect.right > block.left + 8)) {
    throw new Error(
      `${what} — the lane's frame ends at ${frameRect.right.toFixed(2)}px, only ${(frameRect.right - block.left).toFixed(2)}px past the Block's left wall (${block.left.toFixed(2)}px); "above the card" is not being tested by this specimen`,
    );
  }

  const lines = lineRectsOf(rail);
  expectLinesInsideOwnFrame(rail, frameRect, lines, what);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hit = document.elementFromPoint(Math.round(line.left + line.width / 2), Math.round(centreY(line)));
    if (!hit || !hit.closest(".cm-editor")) {
      const label = hit ? (hit.getAttribute("data-slot") ?? hit.tagName.toLowerCase()) : "nothing";
      throw new Error(`${what} — line ${i}'s own centre pixel is owned by \`${label}\`, not the lane; something paints over it`);
    }
  }
  return frameRect;
}

/**
 * CLIPPING: does the lane genuinely ESCAPE the card without being sheared
 * off by an ancestor's `overflow: hidden`? Two readings, because a clipped
 * element still exists and still reports a full `getBoundingClientRect` —
 * only a hit test can tell a clipped pixel from a merely-covered one:
 *
 *   (b) a real hit test at each line's centre resolves inside `.cm-editor`;
 *   (c) a hit test at the frame's far corner, the pixel furthest from the
 *       rail and therefore the first thing any ancestor clip would eat.
 *
 * Non-vacuity guard: at least one of those probed points has to land
 * OUTSIDE the Block's own border box — `block` — or this specimen's lane
 * never left the card in the first place and "unclipped" is untestable
 * here. This is the exact guard the original fused `expectLaneUnclipped`
 * was missing: pointed at a LEFT lane (which never escapes the card), every
 * probe below landed inside the card and the clipping claim passed having
 * tested nothing.
 */
function expectLaneEscapesCardUnclipped(rail: HTMLElement, block: DOMRect, what: string): DOMRect {
  const frame = laneFrameOf(rail);
  const frameRect = frame.getBoundingClientRect();
  const lines = lineRectsOf(rail);

  const cornerX = Math.round(frameRect.right - 2);
  const cornerY = Math.round(frameRect.bottom - 2);
  const linePoints = lines.map((line) => ({ x: Math.round(line.left + line.width / 2), y: Math.round(centreY(line)) }));
  const outsideBlock = (x: number, y: number) => x < block.left || x > block.right || y < block.top || y > block.bottom;
  if (![{ x: cornerX, y: cornerY }, ...linePoints].some((p) => outsideBlock(p.x, p.y))) {
    throw new Error(`${what} — this specimen cannot test clipping — every probe is inside the card's clip rect`);
  }

  expectLinesInsideOwnFrame(rail, frameRect, lines, what);
  for (let i = 0; i < lines.length; i++) {
    const hit = document.elementFromPoint(linePoints[i].x, linePoints[i].y);
    if (!hit || !hit.closest(".cm-editor")) {
      const label = hit ? (hit.getAttribute("data-slot") ?? hit.tagName.toLowerCase()) : "nothing";
      throw new Error(`${what} — line ${i}'s own centre pixel is owned by \`${label}\`, not the lane; it is clipped away or painted over`);
    }
  }

  const corner = document.elementFromPoint(cornerX, cornerY);
  if (!corner || !corner.closest('[data-slot="port-edge-lane"]')) {
    const label = corner ? (corner.getAttribute("data-slot") ?? corner.tagName.toLowerCase()) : "nothing";
    throw new Error(`${what} — the lane's far corner (${cornerX}, ${cornerY}) is owned by \`${label}\`; an ancestor is clipping the lane`);
  }
  return frameRect;
}

/**
 * The resting single-line labels, stated truthfully.
 *
 * F2, measured — not a design choice, and not weakened into a text-vanished
 * check: `portEdge.tsx` turns its resting labels off while the lane is open
 * by passing `hideLabel` down to `PortEdgeSlotBox`, which honours it ONLY on
 * its own default fill — `renderItem ? renderItem(item, {textLayout}) :
 * showPorts ? <LabeledPort labelSlot={hideLabel ? null : undefined}>`
 * (portEdge.tsx:312-317). The `renderItem` context is `{ textLayout }` and
 * carries no lane state, and `PortedBlock` ALWAYS supplies a `renderItem`
 * (it must: that is where `data-port-id` is stamped, which is how Group B's
 * wire layer will find a dot). So every `PortedBlock` rail keeps drawing its
 * resting labels under an open lane.
 *
 * The fix belongs in one of two places, neither of them this file:
 *   • `portEdge.tsx` — add `hideLabel` to the `renderItem` ctx, ~2 lines, so
 *     a host fill can honour the same seam the default fill does; or
 *   • `blockPortEdges.tsx` — let `portEdgeProps.renderItem` actually win.
 *     Its own doc comment already advertises `renderItem` as a reach-past
 *     override, but `BlockPortRail` spreads `{...spec.portEdgeProps}` BEFORE
 *     its own `renderItem={renderItem}`, so the override is unreachable and
 *     a story cannot patch this from outside.
 * Both files are phase A1's; this lane does not edit them.
 */
function restingLabels(rail: HTMLElement): HTMLElement[] {
  return Array.from(rail.querySelectorAll<HTMLElement>('[data-slot="port-label"]'));
}

function labelTexts(rail: HTMLElement): string[] {
  return restingLabels(rail).map((l) => l.textContent ?? "");
}

/**
 * What a reader actually SEES of a resting label, decided by a hit test at
 * the label's own text centre rather than by a rectangle-containment sum
 * with a tolerance somebody picked.
 *
 * The lane's frame is opaque (`.bbox-code-editor { background:
 * var(--color-card) }`) and paints above the cards, so "covered" and
 * "visible" are a real, binary property of the composited page — and that is
 * the only reading that can tell the two walls apart. On a LEFT wall the
 * lane opens over the labels and swallows them (measured: the label box
 * begins 2px left of the frame, so a sliver of the first glyph survives —
 * reported, not asserted, because the sliver's width is an artefact of
 * `LANE_GAP_PX` and not a property anyone designed). On a RIGHT wall the
 * labels flow inward and the lane opens outward, so every one of them stays
 * fully legible beside its duplicate.
 */
function expectLabelCentresOwnedBy(rail: HTMLElement, owner: "lane" | "label", what: string): void {
  const labels = restingLabels(rail);
  if (labels.length === 0) throw new Error(`${what} — no resting labels to hit-test`);
  for (const label of labels) {
    const rect = label.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(rect.left + rect.width / 2), Math.round(centreY(rect)));
    const inLane = hit != null && hit.closest(".cm-editor") != null;
    const inLabel = hit != null && hit.closest('[data-slot="port-label"]') != null;
    const got = inLane ? "lane" : inLabel ? "label" : (hit?.getAttribute("data-slot") ?? hit?.tagName.toLowerCase() ?? "nothing");
    if (got !== owner) {
      throw new Error(`${what} — the pixel at the centre of the resting label "${label.textContent}" belongs to \`${got}\`, expected \`${owner}\``);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** `pose` is deliberately `wired`: the identity check needs a state that is
 *  visible on the dot and must survive a row move through the lane. */
const INPUTS: PortEdgeItem[] = [
  { id: "pose", label: "pose", state: "wired" },
  { id: "gain", label: "gain", state: "valueSet" },
  { id: "reset", label: "reset", state: "empty" },
];

const OUTPUTS: PortEdgeItem[] = [
  { id: "cmd", label: "cmd", state: "wired" },
  { id: "status", label: "status", state: "empty" },
];

const MEMBER_IDS = ["clamp", "filter", "limit"] as const;

function memberFixtures(): BlockMember[] {
  return MEMBER_IDS.map((id) => ({
    id,
    content: (
      <div data-slot="lane-member-body" style={{ fontSize: 12, padding: "2px 4px", color: "var(--foreground)" }}>
        {id}
      </div>
    ),
  }));
}

/* ------------------------------------------------------------------ */
/* The bench — one Block, real rails, a real per-edge lane toggle        */
/* ------------------------------------------------------------------ */

/**
 * Lane availability, asked the way `PortEdgeBody` asks it — the SAME
 * exported `railPlanFor` → `groupingSetFromText` → `computeSlots` →
 * `laneAvailability` chain the component runs internally, never a
 * story-local re-statement of the predicate. A second copy of a gate is how
 * a control ends up enabled for a lane that cannot open (or, worse, disabled
 * for one that can) while both halves look correct in isolation.
 */
function laneStateFor(view: BlockView, portLayout: BlockPortLayout, edge: BlockSide, items: PortEdgeItem[], leadCount: number): { available: boolean; reason?: string } {
  const itemIds = items.map((i) => i.id);
  const plan = railPlanFor({ view, portLayout, edge, itemIds, leadCount, collapsePorts: view === "simple" });
  const { set } = groupingSetFromText(plan.groups, itemIds);
  const slots = computeSlots(itemIds, set, plan.groupMode);
  return laneAvailability(railAxisFor(edge), "auto", plan.groupMode, slots);
}

const VIEW_CAPTION: Record<BlockView, string> = {
  simple: "simple · collapsed wall",
  port: "port · rows packed from the body top",
  expanded: "expanded · evenly across the body band",
};

function LaneToggle({ edge, open, state, onToggle }: { edge: BlockSide; open: boolean; state: { available: boolean; reason?: string }; onToggle(): void }) {
  return (
    <button
      type="button"
      data-testid={`lane-toggle-${edge}`}
      data-open={open || undefined}
      disabled={!state.available}
      // Never a silent no-op: a refused lane says WHY, on the control
      // itself (PORT-EDGE-PLAN-PHASE4.md §5 — truthful rendering).
      title={state.reason}
      onClick={onToggle}
      style={{
        padding: "4px 10px",
        fontSize: 12,
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: open ? "var(--accent)" : "transparent",
        color: state.available ? "var(--foreground)" : "var(--muted-foreground)",
        cursor: state.available ? "pointer" : "not-allowed",
      }}
    >
      {`${edge} as lines`}
      {state.available ? "" : ` (${state.reason})`}
    </button>
  );
}

interface LaneBenchProps {
  benchId: string;
  view: BlockView;
  portLayout?: BlockPortLayout;
  /** Which edge's lane the bench opens for you — so a gallery panel is a
   *  picture of the feature, not of a button waiting to be pressed
   *  (Zach's follow-up item 3 on Phase 4: "show the feature working"). */
  openEdge?: BlockSide | null;
  /**
   * WHEN that lane opens, and the ONLY reason this prop exists — F1.
   *
   * `"mount"` passes the open edge as the INITIAL state — what any host
   * would naturally write — and silently renders no lane at all:
   * `useLaneGeometry`'s layout effect runs before the track div's ref is
   * attached, reads `null`, returns, and never re-runs. `LaneOpenedAtMount`
   * pins that, on a rail and on a bare `PortEdge`, so the defect cannot
   * quietly change.
   *
   * `"afterPaint"` (the default) flips `editing` in a
   * `requestAnimationFrame`, and the FRAME boundary is load-bearing rather
   * than defensive padding. A plain mount `useEffect` is not late enough,
   * measured: `useBlockBands`' layout effect schedules `setBands` during the
   * first commit, React flushes pending passive effects BEFORE starting that
   * re-render, so a mount effect lands `editing` in the very commit that
   * first mounts the rails — precisely the case F1 breaks, and every story
   * here rendered zero lane lines that way. After a paint the track element
   * provably exists, so the overlay mounts into an already-attached ref.
   */
  openWhen?: "mount" | "afterPaint";
  height?: number;
  width?: number;
  /** Render the Block's body region as a draggable member stack — the D13
   *  exclusivity check needs a real second DndContext inside the Block. */
  members?: boolean;
  caption?: ReactNode;
}

function LaneBench({ benchId, view, portLayout = "inline", openEdge = null, openWhen = "afterPaint", height = 240, width = 220, members = false, caption }: LaneBenchProps) {
  const [inputs, setInputs] = useState<PortEdgeItem[]>(INPUTS);
  const [outputs, setOutputs] = useState<PortEdgeItem[]>(OUTPUTS);
  const [memberList, setMemberList] = useState<BlockMember[]>(memberFixtures);
  const [editing, setEditing] = useState<BlockSide | null>(openWhen === "mount" ? openEdge : null);

  const leftState = laneStateFor(view, portLayout, "left", inputs, 0);
  const rightState = laneStateFor(view, portLayout, "right", outputs, inputs.length);

  // F1's workaround — see `openWhen`'s own doc for why this is a frame and
  // not a mount effect. Cancelled on unmount so a story that tears down
  // mid-frame never writes into an unmounted tree.
  useEffect(() => {
    if (openWhen !== "afterPaint" || !openEdge) return;
    const frame = requestAnimationFrame(() => setEditing(openEdge));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A lane whose availability lapses (the view collapses the wall under it)
  // must close, not sit there mismatched — PortEdge's own D12 effect calls
  // `onEditingChange(false)`; this keeps the bench's single-slot state
  // honest even before that effect runs, so a refused bench never paints a
  // half-open control.
  useEffect(() => {
    if (editing === "left" && !leftState.available) setEditing(null);
    if (editing === "right" && !rightState.available) setEditing(null);
  }, [editing, leftState.available, rightState.available]);

  const face = members ? (
    <Block header="Planner" footer="ready" width={width} height={height} members={memberList} membersLayout="stack" onMembersChange={setMemberList} showCards />
  ) : view === "simple" ? (
    <Block header="Planner" width={width} height={height} showHeaderDivider={false} />
  ) : (
    <Block header="Planner" body="trajectory" footer="ready" width={width} height={height} />
  );

  return (
    <div data-slot="lane-bench" data-bench={benchId} data-view={view} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div data-slot="lane-bench-caption" style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>
        {caption ?? VIEW_CAPTION[view]}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <LaneToggle edge="left" open={editing === "left"} state={leftState} onToggle={() => setEditing(editing === "left" ? null : "left")} />
        <LaneToggle edge="right" open={editing === "right"} state={rightState} onToggle={() => setEditing(editing === "right" ? null : "right")} />
      </div>
      <PortedBlock
        id={benchId}
        view={view}
        portLayout={portLayout}
        edges={{
          left: {
            items: inputs,
            onItemsChange: setInputs,
            editing: editing === "left",
            onEditingChange: (next) => setEditing(next ? "left" : null),
          },
          right: {
            items: outputs,
            onItemsChange: setOutputs,
            editing: editing === "right",
            onEditingChange: (next) => setEditing(next ? "right" : null),
          },
        }}
      >
        {face}
      </PortedBlock>
    </div>
  );
}

/**
 * Every specimen sits in a generously padded stage. Rails hang OUTSIDE the
 * Block's box by design, the lane hangs further out still, and the resting
 * labels are absolutely positioned overlays — so a tight stage would have
 * neighbouring panels overlapping each other's evidence.
 */
function Stage({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div data-slot="lane-stage" style={{ display: "flex", flexDirection: "column", gap: 28, padding: "48px 72px" }}>
      {label && <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>{label}</div>}
      {children}
    </div>
  );
}

const meta = {
  title: "Basics/BlockPortLane",
  component: PortedBlock,
  // Never read — every story supplies its own `render`, because the bench
  // owns the lane's open/closed state and the edges are controlled.
  args: { view: "port" as BlockView, edges: {}, children: null },
} satisfies Meta<typeof PortedBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* LaneOnPortView — the headline re-proof.                              */
/* ------------------------------------------------------------------ */

export const LaneOnPortView: Story = {
  render: () => (
    <Stage label="the lane, opened on a Block's left wall">
      <LaneBench benchId="port-view" view="port" openEdge="left" height={260} />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const bench = benchOf(canvasElement, "port-view");
    const rail = railOf(bench, "left");
    const block = blockRectOf(bench);

    // The lane is open on first paint — wait for CodeMirror's own mount,
    // then for `useLaneGeometry`'s post-measure repaint to settle.
    await waitFor(() => expect(rail.querySelectorAll(".cm-line").length).toBe(INPUTS.length));

    // 1 · Every line on its own dot — all of them, 1px.
    const { dots } = await waitFor(() => expectEveryLineOnItsDot(rail, 1, "port view · left lane"));
    expectUniform(railPitches(rail, "column"), 1, "port view · left rail pitch uniformity under an open lane");

    // 2 · Above the card, not merely present — a left lane opens INTO the
    // card and never escapes its clip rect (module doc's CLIPPING note), so
    // z-order is the claim this specimen can actually make.
    expectLaneAboveCard(rail, block, "port view · left lane");

    // 3 · F2, stated as it is (see `restingLabels`' own doc): the resting
    // labels are NOT removed under an open lane on a PortedBlock, because
    // `hideLabel` never reaches a host `renderItem`. On a LEFT rail the
    // opaque lane panel opens right over them, so the composited page still
    // reads correctly — every label's own text centre belongs to the lane.
    // That is the honest outcome here, measured by hit test rather than
    // assumed; `LaneOnRightWall` pins the wall where it is visible.
    await expect(restingLabels(rail)).toHaveLength(INPUTS.length);
    expectLabelCentresOwnedBy(rail, "lane", "port view · resting labels under the open lane");

    // 4 · Enter mints a port, its DOT appears at the new row, and the label
    // typed into that row is the one the port ends up wearing.
    await appendLaneRow(rail, "brake");
    await waitFor(() => expect(railDotCentres(rail).length).toBe(INPUTS.length + 1));
    await waitFor(() => expect(lineTextsOf(rail)).toEqual(["pose", "gain", "reset", "brake"]));
    await waitFor(() => expectEveryLineOnItsDot(rail, 1, "port view · after Enter"));

    const grown = railDotCentres(rail);
    expectWithin(grown[grown.length - 1].y - dots[dots.length - 1].y, grown[1].y - grown[0].y, 1, "port view · the minted dot sits exactly one pitch below the last original dot");
    expectUniform(railPitches(rail, "column"), 1, "port view · pitch uniformity after Enter");
    expectLaneAboveCard(rail, block, "port view · left lane after Enter");

    // 5 · Toggling the lane off restores the per-port labels — including
    // the one that only ever existed as a lane line.
    await closeLane(bench, rail, "left");
    await expect(labelTexts(rail)).toEqual(["pose", "gain", "reset", "brake"]);
    // …and they are genuinely VISIBLE, not merely present: the same hit test
    // as above, now expected to resolve the other way. "Restored" has to
    // mean the pixels came back, not that the nodes were always there.
    expectLabelCentresOwnedBy(rail, "label", "port view · after closing the lane");
  },
};

/* ------------------------------------------------------------------ */
/* LaneOnExpandedView — the OTHER pitch formula.                        */
/* ------------------------------------------------------------------ */

/**
 * Port view's pitch is a constant (`slot + gap`, `aligned/start`). Expanded
 * view's is a function of the band's own height (`space-evenly` over
 * whatever is left after the boxes) — a different number, from a different
 * formula, on a rail whose length is measured rather than derived. The lane
 * reads it from the DOM either way, so this is the story that proves
 * `useLaneGeometry`'s measured pitch really is measured and not quietly
 * agreeing with a constant.
 */
export const LaneOnExpandedView: Story = {
  render: () => (
    <Stage label="the lane on an evenly-spread wall">
      <LaneBench benchId="expanded-view" view="expanded" openEdge="left" height={300} width={240} />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const bench = benchOf(canvasElement, "expanded-view");
    const rail = railOf(bench, "left");
    const block = blockRectOf(bench);

    await waitFor(() => expect(rail.querySelectorAll(".cm-line").length).toBe(INPUTS.length));
    await waitFor(() => expectEveryLineOnItsDot(rail, 1, "expanded view · left lane"));
    // z-order, not clipping — this is a left lane, same reasoning as
    // `LaneOnPortView`: it never escapes the card's clip rect.
    expectLaneAboveCard(rail, block, "expanded view · left lane");

    const pitches = railPitches(rail, "column");
    expectUniform(pitches, 1, "expanded view · pitch uniformity under an open lane");

    // The pitch here is NOT port view's `slot + gap` (24 + 18 = 42) — if it
    // were, this story would be re-testing the aligned rule under a
    // different name and the measured-pitch claim would be untested.
    const measured = pitches[0];
    if (Math.abs(measured - 42) <= 1) {
      throw new Error(
        `expanded view · the spread pitch measured ${measured.toFixed(2)}px, indistinguishable from port view's constant 42px; this specimen proves nothing about a MEASURED pitch — grow or shrink the band`,
      );
    }

    // And CodeMirror really was handed that measured number: every line box
    // is one pitch tall, which is the mechanism the alignment rides on.
    for (const [i, line] of lineRectsOf(rail).entries()) {
      expectWithin(line.height, measured, 1, `expanded view · line ${i} box height vs the measured dot pitch`);
    }

    // Enter under a `distribute` scheme RE-SPACES the whole wall (one more
    // box to divide the same band between) — the dots move, the lane must
    // follow them, and that is a harder case than port view's append.
    await appendLaneRow(rail, "brake");
    await waitFor(() => expect(railDotCentres(rail).length).toBe(INPUTS.length + 1));
    await waitFor(() => expect(lineTextsOf(rail)).toEqual(["pose", "gain", "reset", "brake"]));
    await waitFor(() => expectEveryLineOnItsDot(rail, 1, "expanded view · after Enter re-spread the wall"));

    const after = railPitches(rail, "column");
    expectUniform(after, 1, "expanded view · pitch uniformity after Enter");
    if (!(after[0] < measured - 1)) {
      throw new Error(
        `expanded view · adding a port left the pitch at ${after[0].toFixed(2)}px (was ${measured.toFixed(2)}px); a space-evenly wall must tighten when it gains a box, so this is not the distribute rule running`,
      );
    }
    for (const [i, line] of lineRectsOf(rail).entries()) {
      expectWithin(line.height, after[0], 1, `expanded view · line ${i} box height re-pinned to the NEW pitch`);
    }
  },
};

/* ------------------------------------------------------------------ */
/* LaneOnRightWall — the lane that opens OUTSIDE the Block, and the      */
/* visible half of the `hideLabel` finding.                             */
/* ------------------------------------------------------------------ */

export const LaneOnRightWall: Story = {
  render: () => (
    <Stage label="the lane on the output wall — it opens away from the Block">
      <LaneBench benchId="right-wall" view="port" openEdge="right" height={240} />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const bench = benchOf(canvasElement, "right-wall");
    const rail = railOf(bench, "right");
    const block = blockRectOf(bench);

    await waitFor(() => expect(rail.querySelectorAll(".cm-line").length).toBe(OUTPUTS.length));
    await waitFor(() => expectEveryLineOnItsDot(rail, 1, "right wall · lane"));
    // The genuine clipping claim — this lane opens OUTSIDE the card, so the
    // non-vacuity guard has something real to find.
    const frameRect = expectLaneEscapesCardUnclipped(rail, block, "right wall · lane");

    // The lane ALWAYS opens rightward — Zach's rule, kept even on the wall
    // where the ports' own labels flow the other way ("nobody types
    // comfortably into right-aligned text", portEdge.tsx's own WHY). So on
    // this wall the panel sits outside the Block entirely, and the wrapper's
    // `width: max-content` must not clip it.
    if (!(frameRect.left >= block.right - 1)) {
      throw new Error(
        `right wall · the lane starts at ${frameRect.left.toFixed(2)}px, inside the Block (right wall at ${block.right.toFixed(2)}px); the lane is meant to open away from the card here`,
      );
    }

    // THE VISIBLE HALF OF F2. The resting labels flow INWARD on a right
    // wall, so the lane — which opens outward — cannot cover them: every
    // label is drawn a second time inside the card while the lane shows the
    // same text outside it. Pinned, so it cannot silently change. When the
    // seam is fixed in `portEdge.tsx` (ctx gains `hideLabel`) or in
    // `blockPortEdges.tsx` (`portEdgeProps.renderItem` wins), there will be
    // ZERO resting labels here and this block fails ON PURPOSE — that is the
    // signal to delete it, not to relax it.
    await expect(labelTexts(rail)).toEqual(["cmd", "status"]);
    expectLabelCentresOwnedBy(rail, "label", "right wall · F2 — the labels are double-drawn beside the lane");
    for (const label of restingLabels(rail)) {
      const rect = label.getBoundingClientRect();
      if (!(rect.right <= block.right + 1)) {
        throw new Error(`right wall · the resting label "${label.textContent}" is not inside the card; the inward flow this finding rests on has changed`);
      }
    }

    // The lane still works on this wall, finding notwithstanding.
    await appendLaneRow(rail, "fault");
    await waitFor(() => expect(railDotCentres(rail).length).toBe(OUTPUTS.length + 1));
    await waitFor(() => expect(lineTextsOf(rail)).toEqual(["cmd", "status", "fault"]));
    await waitFor(() => expectEveryLineOnItsDot(rail, 1, "right wall · after Enter"));

    await closeLane(bench, rail, "right");
    await expect(labelTexts(rail)).toEqual(["cmd", "status", "fault"]);
  },
};

/* ------------------------------------------------------------------ */
/* LaneRefusedInSimpleView — a present feature that cannot run says so.  */
/* ------------------------------------------------------------------ */

/**
 * §6's "Availability" row. Simple view collapses a wall to ONE dot standing
 * for N ports (`groupMode: "collapsed"`), which breaks the line↔dot
 * bijection the lane IS — so `laneAvailability` refuses it. The wrapper adds
 * no gate of its own; what this story pins is that the refusal SURFACES:
 * disabled control, non-empty reason, and — the part a disabled button
 * cannot prove by itself — no lane actually mounts even though the bench
 * asked for one.
 */
export const LaneRefusedInSimpleView: Story = {
  render: () => (
    <Stage label="simple view · the wall is one dot, so there are no lines to edit">
      <LaneBench benchId="simple-view" view="simple" openEdge="left" height={120} width={200} />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const bench = benchOf(canvasElement, "simple-view");
    const left = toggleOf(bench, "left");

    await expect(left.disabled).toBe(true);
    await expect(left.title).toBe("ungroup to edit as lines");
    await expect(left.textContent).toContain("ungroup to edit as lines");

    // The bench asked for the lane to be open on first paint. It is not,
    // and cannot be: no editor mounted anywhere in the specimen.
    await waitFor(() => expect(bench.querySelector('[data-slot="code-editor"]')).toBeNull());
    await expect(bench.querySelectorAll(".cm-line")).toHaveLength(0);

    // The wall really is collapsed — one dot for three ports — which is WHY
    // the refusal is correct rather than a missing feature.
    const rail = railOf(bench, "left");
    await expect(railDotCentres(rail)).toHaveLength(1);
    const collapsed = required<HTMLElement>(rail, "[data-collapsed-ports]", "the collapsed stand-in dot");
    await expect(collapsed.getAttribute("data-collapsed-ports")).toBe("pose,gain,reset");

    // The one-port right wall is refused for the same reason — the rule is
    // the VIEW's collapse, not "this wall happens to be crowded".
    await expect(toggleOf(bench, "right").disabled).toBe(true);
  },
};

/* ------------------------------------------------------------------ */
/* LaneVsMemberDrag — two DndContexts, one open lane (D13).              */
/* ------------------------------------------------------------------ */

/**
 * A real pointer drag session. `@dnd-kit`'s PointerSensor needs
 * `pointerdown` → a move that clears its 4px activation distance → the real
 * move → `pointerup`; `fireEvent.pointerDown` alone silently no-ops.
 */
async function pointerDrag(from: Element, to: Element): Promise<void> {
  const fire = (el: Element, type: string, x: number, y: number) =>
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }));
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;
  fire(from, "pointerdown", startX, startY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", startX, startY + 10);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", endX, endY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointerup", endX, endY);
  await new Promise((r) => setTimeout(r, 100));
}

/**
 * §6's "Member drag vs lane" row. A `Block` with a stacked member list
 * mounts its OWN `DndContext` (blockMembers.tsx:296) inside the very card
 * the rail is pinned to — a second drag system a few pixels from the first.
 * D13 says exactly one thing closes the lane: a pointerdown on a PORT card.
 * A member reorder must not, and the lane's text must survive it.
 *
 * The lane is opened on the RIGHT wall on purpose: it then sits outside the
 * card, so the member drag is a genuine test of D13's selector rather than
 * an accident of the lane not being in the way.
 */
export const LaneVsMemberDrag: Story = {
  render: () => (
    <Stage label="a member reorder inside the card, with the lane open beside it">
      <LaneBench benchId="member-drag" view="expanded" openEdge="right" height={300} width={240} members />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const bench = benchOf(canvasElement, "member-drag");
    const rail = railOf(bench, "right");

    await waitFor(() => expect(rail.querySelectorAll(".cm-line").length).toBe(OUTPUTS.length));
    await waitFor(() => expectEveryLineOnItsDot(rail, 1, "member drag · lane before the drag"));
    const textBefore = lineTextsOf(rail);

    const memberIdsNow = () => Array.from(bench.querySelectorAll<HTMLElement>('[data-slot="block-member"]')).map((m) => m.getAttribute("data-member-id"));
    await expect(memberIdsNow()).toEqual([...MEMBER_IDS]);

    const members = Array.from(bench.querySelectorAll<HTMLElement>('[data-slot="block-member"]'));
    await pointerDrag(members[0], members[2]);
    await waitFor(() => expect(memberIdsNow()).not.toEqual([...MEMBER_IDS]));

    // The reorder happened AND the lane is untouched: still mounted, same
    // text, still aligned to its dots after the card's contents moved.
    await expect(rail.querySelector('[data-slot="code-editor"]')).not.toBeNull();
    await expect(lineTextsOf(rail)).toEqual(textBefore);
    await waitFor(() => expectEveryLineOnItsDot(rail, 1, "member drag · lane after the drag"));

    // …and the one gesture that DOES close it still does: a pointerdown on
    // a port card, caught capture-phase on the track (D13).
    const card = required<HTMLElement>(rail, '[data-slot="port-edge-card"]', "a port card on the right rail");
    const cardRect = card.getBoundingClientRect();
    card.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 2,
        isPrimary: true,
        button: 0,
        buttons: 1,
        pointerType: "mouse",
        clientX: cardRect.left + cardRect.width / 2,
        clientY: cardRect.top + cardRect.height / 2,
      }),
    );
    await waitFor(() => expect(rail.querySelector('[data-slot="code-editor"]')).toBeNull());
  },
};

/* ------------------------------------------------------------------ */
/* LaneKeepsWiredIdentity — §6's last row.                              */
/* ------------------------------------------------------------------ */

/**
 * Moving a LINE moves a PORT — the same port, not a fresh one wearing the
 * old label. `portLane.ts`'s LCS keeps matched lines by reference and zips
 * the leftovers by RANK, so a row move is a reorder of `items`, and
 * everything hanging off a port's identity (its state today; its wires, once
 * Group B lands) rides along. Measured on the one property visible from
 * outside: the `wired` paint has to arrive at the new row, and the row it
 * left has to stop being wired.
 */
export const LaneKeepsWiredIdentity: Story = {
  render: () => (
    <Stage label="move a row · the wired dot moves with it">
      <LaneBench benchId="identity" view="port" openEdge="left" height={260} />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const bench = benchOf(canvasElement, "identity");
    const rail = railOf(bench, "left");
    const statesOf = () => Array.from(rail.querySelectorAll<HTMLElement>('[data-slot="port-dot"]')).map((d) => d.getAttribute("data-state"));

    await waitFor(() => expect(rail.querySelectorAll(".cm-line").length).toBe(INPUTS.length));
    await waitFor(() => expectEveryLineOnItsDot(rail, 1, "identity · lane before the move"));
    await expect(statesOf()).toEqual(["wired", "valueSet", "empty"]);

    const before = railDotCentres(rail);
    const pitch = before[1].y - before[0].y;

    // Ctrl+↓ is `moveLineDown`, bound explicitly in codeEditor.tsx:290
    // alongside CodeMirror's default Alt+↓ — the explicit binding is used
    // here because it does not depend on which platform keymap the browser
    // under test happens to resolve. `Mod-Home` puts the caret on the first
    // row without depending on click coordinates (see `appendLaneRow`).
    const content = required<HTMLElement>(rail, '[data-slot="code-editor"] .cm-content', "the lane's editable content");
    await userEvent.click(content);
    await userEvent.keyboard("{Control>}{Home}{/Control}");
    await userEvent.keyboard("{Control>}{ArrowDown}{/Control}");

    await waitFor(() => expect(lineTextsOf(rail)).toEqual(["gain", "pose", "reset"]));

    // The identity claim: `pose` is still `wired`, now at row 1 — and row 0
    // is `gain`'s own `valueSet`, not a re-used paint.
    await waitFor(() => expect(statesOf()).toEqual(["valueSet", "wired", "empty"]));

    const after = railDotCentres(rail);
    await expect(after).toHaveLength(before.length);
    expectWithin(after[1].y - before[0].y, pitch, 1, "identity · the wired dot moved exactly one pitch down");
    expectEveryLineOnItsDot(rail, 1, "identity · lane after the move");

    // Closing hands the labels back in the NEW order — the reorder is in
    // `items`, not a lane-local illusion.
    await closeLane(bench, rail, "left");
    await expect(labelTexts(rail)).toEqual(["gain", "pose", "reset"]);
    await expect(statesOf()).toEqual(["valueSet", "wired", "empty"]);
  },
};

/* ------------------------------------------------------------------ */
/* LaneOpenedAtMount — F1, pinned. A DEFECT story: every assertion here  */
/* describes behaviour that is WRONG, and is written so the fix breaks   */
/* it loudly instead of landing unnoticed.                              */
/* ------------------------------------------------------------------ */

/** A bare `PortEdge`, mounted with `editing` already true — no Block, no
 *  wrapper, no deferred mount. It is here to answer the one question that
 *  decides where F1 belongs: is this `PortedBlock`'s fault, or PortEdge's? */
function BareEdgeOpenAtMount() {
  const [items, setItems] = useState<PortEdgeItem[]>(INPUTS);
  const [editing, setEditing] = useState(true);
  return (
    <div data-slot="bare-edge" style={{ position: "relative", width: 240, height: 200 }}>
      <PortEdge edge="left" items={items} onItemsChange={setItems} editing={editing} onEditingChange={setEditing} size={{ width: 56, height: 180 }} />
    </div>
  );
}

/**
 * F1 · A rail that mounts with its lane already open renders NO LANE.
 *
 * This is the defect Zach's own Phase 4 follow-up ("Default ON — the point of
 * this story is to show the feature working") was asking for and did not
 * get: `PortEdge.stories.tsx:204-207` still carries that comment above a
 * `useState(false)`. The two halves of this story say exactly where it lives
 * — a bare `PortEdge` mounted with `editing` fails the same way, so the bug
 * is `useLaneGeometry`'s, and `PortedBlock` only makes it unavoidable by
 * deferring its rails one commit behind its own measurement.
 *
 * The fix is ~3 lines in `portEdge.tsx` (phase A1's file, not this one):
 * `useLaneGeometry` must survive a null `trackRef` on its first run — either
 * by observing the track once it exists, or by re-running when the ref
 * attaches. When that lands, the two `toBe(0)`s below become `toBe(3)` /
 * `toBe(2)`, the whole story inverts, and `LaneBench`'s `openWhen` prop
 * disappears. THAT is the intended end state; this story exists so the gap
 * between here and there is visible rather than folklore.
 */
export const LaneOpenedAtMount: Story = {
  render: () => (
    <Stage label="F1 · asking for the lane at mount time — a defect, pinned">
      <div style={{ display: "flex", gap: 150, alignItems: "flex-start" }}>
        <LaneBench benchId="at-mount" view="port" openEdge="left" openWhen="mount" height={260} caption="on a rail · editing=true from the first render" />
        <BareEdgeOpenAtMount />
        <LaneBench benchId="after-mount" view="port" openEdge="left" openWhen="afterPaint" height={260} caption="the control · opened after the first paint" />
      </div>
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const atMount = benchOf(canvasElement, "at-mount");
    const rail = railOf(atMount, "left");

    // The rail itself is fine — dots, at the right pitch. Only the lane is
    // missing, which is precisely why this is invisible without measuring.
    await waitFor(() => expect(railDotCentres(rail)).toHaveLength(INPUTS.length));
    expectUniform(railPitches(rail, "column"), 1, "F1 · the rail itself is healthy");

    // The control says OPEN…
    await expect(toggleOf(atMount, "left").getAttribute("data-open")).toBe("true");
    await expect(toggleOf(atMount, "left").disabled).toBe(false);
    // …and `laneAvailability` agrees it may open — this is not a refusal.
    await expect(laneStateFor("port", "inline", "left", INPUTS, 0).available).toBe(true);
    // …but nothing rendered. Today's behaviour. WRONG, and pinned as wrong.
    await expect(rail.querySelectorAll('[data-slot="port-edge-lane"]')).toHaveLength(0);
    await expect(rail.querySelectorAll(".cm-line")).toHaveLength(0);

    // Same story on a bare PortEdge, so the defect is attributed correctly:
    // this one has no `PortedBlock` anywhere near it.
    const bare = required<HTMLElement>(canvasElement, '[data-slot="bare-edge"]', "the bare PortEdge specimen");
    await waitFor(() => expect(bare.querySelectorAll('[data-slot="port-dot"]')).toHaveLength(INPUTS.length));
    await expect(bare.querySelectorAll(".cm-line")).toHaveLength(0);

    // The control panel: the identical bench, opened one commit later, does
    // render its lane — so the difference really is TIMING and nothing else.
    const afterMount = benchOf(canvasElement, "after-mount");
    const goodRail = railOf(afterMount, "left");
    await waitFor(() => expect(goodRail.querySelectorAll(".cm-line")).toHaveLength(INPUTS.length));
    await waitFor(() => expectEveryLineOnItsDot(goodRail, 1, "F1 control · deferred open"));

    // And the broken one recovers the moment a user presses the control —
    // the state was always right, only the first measurement was lost.
    await userEvent.click(toggleOf(atMount, "left"));
    await userEvent.click(toggleOf(atMount, "left"));
    await waitFor(() => expect(rail.querySelectorAll(".cm-line")).toHaveLength(INPUTS.length));
    await waitFor(() => expectEveryLineOnItsDot(rail, 1, "F1 · after toggling it off and on again"));
  },
};

/* ------------------------------------------------------------------ */
/* LaneGallery — every case at once, which is how this gets reviewed.   */
/* ------------------------------------------------------------------ */

/**
 * The deliverable Zach actually reads: four benches side by side, three with
 * a lane already open on first paint and one showing the refusal, so the
 * whole behaviour is one glance rather than four button presses. The play
 * function measures EVERY open lane in the gallery — a gallery that looks
 * right and measures wrong is the exact failure this phase exists to rule
 * out.
 */
export const LaneGallery: Story = {
  render: () => (
    <Stage label="one lane, four environments">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 150, rowGap: 80, alignItems: "flex-start" }}>
        <LaneBench benchId="g-port" view="port" openEdge="left" height={260} caption="port · inline — left lane" />
        <LaneBench benchId="g-offset" view="port" portLayout="offset" openEdge="right" height={300} caption="port · offset — right lane" />
        <LaneBench benchId="g-expanded" view="expanded" openEdge="left" height={300} width={240} caption="expanded — left lane" />
        <LaneBench benchId="g-simple" view="simple" openEdge="left" height={120} width={200} caption="simple — lane refused, with its reason" />
      </div>
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    // Only `g-offset`'s right lane actually escapes its card (checked below
    // against `offsetBlock`) — `g-port` and `g-expanded` are left lanes, so
    // they get the z-order helper, the claim they can actually prove.
    const open: { bench: string; edge: BlockSide; count: number; kind: "above" | "escapes" }[] = [
      { bench: "g-port", edge: "left", count: INPUTS.length, kind: "above" },
      { bench: "g-offset", edge: "right", count: OUTPUTS.length, kind: "escapes" },
      { bench: "g-expanded", edge: "left", count: INPUTS.length, kind: "above" },
    ];

    for (const { bench, edge, count, kind } of open) {
      const benchEl = benchOf(canvasElement, bench);
      const rail = railOf(benchEl, edge);
      const block = blockRectOf(benchEl);
      await waitFor(() => expect(rail.querySelectorAll(".cm-line").length).toBe(count));
      await waitFor(() => expectEveryLineOnItsDot(rail, 1, `gallery · ${bench} ${edge} lane`));
      if (kind === "escapes") {
        expectLaneEscapesCardUnclipped(rail, block, `gallery · ${bench} ${edge} lane`);
      } else {
        expectLaneAboveCard(rail, block, `gallery · ${bench} ${edge} lane`);
      }
      expectUniform(railPitches(rail, "column"), 1, `gallery · ${bench} ${edge} rail pitch`);
    }

    // The offset panel is the one whose rail does not start at the body top
    // — its lane has to follow the pushed-down dots, not the band.
    const offsetBench = benchOf(canvasElement, "g-offset");
    const offsetRail = railOf(offsetBench, "right");
    const offsetBlock = blockRectOf(offsetBench);
    const offsetDots = railDotCentres(offsetRail);
    const offsetLines = lineRectsOf(offsetRail);
    expectWithin(centreY(offsetLines[0]), offsetDots[0].y, 1, "gallery · the offset lane's first line follows the pushed-down first dot");
    if (!(offsetDots[0].y > offsetBlock.top + offsetBlock.height / 4)) {
      throw new Error(
        `gallery · the offset panel's first output dot sits at ${offsetDots[0].y.toFixed(2)}px, near the top of the card (${offsetBlock.top.toFixed(2)}px); nothing is actually offset, so this panel is not testing the offset lane`,
      );
    }

    // And the refusal is legible in the same picture.
    const simple = benchOf(canvasElement, "g-simple");
    await expect(toggleOf(simple, "left").disabled).toBe(true);
    await expect(toggleOf(simple, "left").title).toBe("ungroup to edit as lines");
    await expect(simple.querySelector('[data-slot="code-editor"]')).toBeNull();
  },
};
