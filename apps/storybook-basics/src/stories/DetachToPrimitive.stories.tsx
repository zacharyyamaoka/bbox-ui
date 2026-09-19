import { useCallback, useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor } from "storybook/test";
import type { Editor, TLShapeId } from "tldraw";

import type { BlockView } from "../components/blockPort.layout";
import type { HostScene } from "../hosts/hostScene";
import { shapeIdForNode, TldrawHost } from "../hosts/tldrawHost";
import { detachSelectedShapes, rebuildDetachedShapes, registerEditorContainer, RebuildContextMenu } from "../detach";

/**
 * Blocks/Detach To Primitive — Zach's "Detach to primitive" feature
 * (`/home/bam/zach_brain/Projects/bbox-ui/PROJECT - Black Box UI.md:3160`),
 * quoted in full in this lane's dispatch brief. Success, in his own words:
 * "for each component, 1 story in (tldraw) host that shows a before and
 * after detach to primitive and then a rebuild — so 3 parts to the
 * gallery... for something like block that can come in many forms, the
 * gallery should have different rows to show different variants, and then
 * the 3 columns."
 *
 * Three rows (`BlockView`: simple / port / expanded), three columns
 * (before / detached / rebuilt), all in the tldraw host — matching
 * `SceneHostsTldraw.stories.tsx`'s idiom (its own file header explains why
 * these tldraw-only stories live apart from the DOM/React-Flow scene
 * benches). Each cell drives its OWN `TldrawHost` through the new
 * `onEditorReady` seam (`../hosts/tldrawHost.tsx`) — mount, wait a paint,
 * detach (for the "detached"/"rebuilt" columns), wait a paint, rebuild (for
 * "rebuilt" only). The play function then MEASURES, never DOM-presence-
 * asserts (this repo's own rule) — see `cellRect`/`cardRectFor` below.
 */

const meta = {
  title: "Blocks/Detach To Primitive",
  tags: ["area:blocks", "lane:detach"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* Fixture — one "proc"-shaped block per row, ports on left/right        */
/* ------------------------------------------------------------------ */

/** `name`/`w` are overridable per row — F2's wrapping fixture and F3's
 *  long-single-line fixture (`ROWS` below) both need a header string other
 *  than the default short "proc", and the wrapping one needs the SAME
 *  220px card width the bug was measured on. */
function sceneFor(view: BlockView, name = "proc", w = 220): HostScene {
  return {
    nodes: [
      {
        id: "proc",
        type: "block",
        position: { x: 24, y: 24 },
        data: { name, view, w, h: 140, ports: { left: ["in"], right: ["out"] } },
      },
    ],
    edges: [],
  };
}

type Phase = "before" | "detached" | "rebuilt";

/**
 * Two RAFs — enough for tldraw's camera/shape updates to actually paint
 * before the next measurement. GUARDED for a hidden tab (flagged by the
 * F1/F2/F3 audit): `requestAnimationFrame` never fires while a tab is
 * backgrounded, so the double-RAF form hung forever there with an
 * unhelpful `expected false to be true` rather than a real timeout.
 * Headless Chromium (this repo's actual `pnpm test-stories` path) reports
 * `document.hidden === false` regardless of window focus, so this branch
 * is dead code there — it only helps someone who opens this story in a
 * backgrounded real browser tab, at the cost of one boolean check.
 */
async function nextPaint() {
  if (typeof document !== "undefined" && document.hidden) {
    await new Promise<void>((resolve) => setTimeout(resolve, 32));
    return;
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * Wait until every port dot inside `container` has stopped moving across
 * two consecutive frames, or `maxFrames` is reached.
 *
 * WHY this exists (measured 2026-09-18, the adversarial loop this lane's
 * brief asked for): a single `nextPaint()` was not enough for `port`/
 * `expanded` views — `BlockPort`'s own rail geometry is MEASURED off the
 * Block's rendered header/body bands (`../components/blockPort.tsx`'s own
 * "Measurement (D-A5)" section), which take one extra render pass to
 * converge after the Block first mounts — mirroring `BboxNodeShapeComponent`'s
 * own note in `../hosts/tldrawHost.tsx` that "rails land one layout pass
 * after the Block." Detaching before that settles measured the RAIL's
 * pre-final position and reported a fake ~20px vertical regression that
 * had nothing to do with the detach kit's own math — this wait is the fix,
 * not a wider tolerance.
 */
function portDotSignature(container: Element): string {
  const dots = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="port-dot"]'));
  return dots
    .map((dot) => {
      const rect = dot.getBoundingClientRect();
      return `${rect.left.toFixed(1)},${rect.top.toFixed(1)}`;
    })
    .join("|");
}

async function waitForPortDotsToSettle(container: Element, maxWaitMs = 3000) {
  // Sampled on a real timer, not just `requestAnimationFrame` — `BlockPort`'s
  // rail bands are measured off the Block's rendered header/body boundary
  // via a `useLayoutEffect`, which can take more than one paint to converge
  // (first render assumes a fallback, the measured effect corrects it on a
  // LATER commit). Two consecutive RAFs sometimes straddled that correction
  // and reported "settled" one commit too early — this requires THREE
  // consecutive identical readings over real time, which measured reliably
  // past the correction in every row (2026-09-18).
  let previous: string | null = null;
  let matches = 0;
  const deadline = Date.now() + maxWaitMs;
  // Require at least one non-empty reading before counting matches — an
  // early "no dots yet" signature repeating is not settlement.
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const signature = portDotSignature(container);
    if (signature !== "" && signature === previous) {
      matches += 1;
      if (matches >= 3) return;
    } else {
      matches = 0;
    }
    previous = signature;
  }
}

/* ------------------------------------------------------------------ */
/* One gallery cell — mounts its own host, drives it to `phase`          */
/* ------------------------------------------------------------------ */

function GalleryCell({ view, phase, name, w }: { view: BlockView; phase: Phase; name?: string; w?: number }) {
  const [scene, setScene] = useState<HostScene>(() => sceneFor(view, name, w));
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);

  const handleEditorReady = useCallback((editor: Editor, container: HTMLElement) => {
    editorRef.current = editor;
    containerRef.current = container;
    // Every row in this gallery reuses the node id "proc" (see `sceneFor`),
    // so more than one host on this page shares the same deterministic
    // `shapeIdForNode` output — `../detach/definitions/block.ts` needs this
    // registration to scope its DOM queries to the right host (see
    // `../detach/editorContainer.ts`'s own header for the bug this fixes).
    registerEditorContainer(editor, container);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (phase === "before") {
      // Same settle-wait as the other two phases (see
      // `waitForPortDotsToSettle`'s own doc) — measuring the "before"
      // column before ITS rail geometry converges would be comparing the
      // detach kit's output against a not-yet-final live layout, which is
      // exactly the false-regression class this wait was added to rule out.
      let cancelled = false;
      void waitForPortDotsToSettle(containerRef.current!).then(() => {
        if (!cancelled) setSettled(true);
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    void (async () => {
      const editor = editorRef.current!;
      const container = containerRef.current!;
      await waitForPortDotsToSettle(container);
      if (cancelled) return;
      editor.select(shapeIdForNode("proc"));
      detachSelectedShapes(editor, sceneRef.current, setScene);
      // tldraw auto-pans to keep a newly-changed selection in view — a real
      // behaviour, but one that would otherwise scroll this gallery cell's
      // fixed little stage away from the pinned (0, 0) `handleMount` set up,
      // making the "before"/"detached" panels visually incomparable even
      // though their MEASURED geometry (host-relative, camera-independent)
      // stayed correct. Re-pinning after every sweep keeps the camera the
      // one deliberately-fixed variable, as `handleMount` already documents.
      editor.setCamera({ x: 0, y: 0, z: 1 });
      if (cancelled) return;
      if (phase === "detached") {
        setSettled(true);
        return;
      }
      await nextPaint();
      // `detachSelectedShapes` leaves the replacement group selected — the
      // exact selection `rebuildDetachedShapes` reads from
      // (`selectedRebuildableIds`), so no re-select is needed here.
      rebuildDetachedShapes(editor, sceneRef.current, setScene);
      editor.setCamera({ x: 0, y: 0, z: 1 });
      if (cancelled) return;
      // Rebuild re-mounts a LIVE `BlockPort` again — the same rail-settle
      // race as "before"/"detached", so the same wait applies before this
      // column is considered ready to measure.
      await waitForPortDotsToSettle(container);
      if (!cancelled) setSettled(true);
    })();
    return () => {
      cancelled = true;
    };
    // `ready`/`phase` fully describe this once-per-cell sequence; `scene`
    // deliberately excluded — the effect reads it through `sceneRef` so a
    // scene update from the sweep itself does not re-trigger the sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, phase]);

  return (
    <div data-cell-phase={phase} data-cell-settled={settled || undefined}>
      <TldrawHost scene={scene} onSceneChange={setScene} onEditorReady={handleEditorReady} width={320} height={260} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement — the offset numbers, not DOM presence                   */
/* ------------------------------------------------------------------ */

function requiredEl<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** Every cell mounts its OWN `TldrawHost`, side by side on the page — their
 *  `getBoundingClientRect()`s live in different absolute viewport
 *  positions, so comparing raw rects across cells (as an earlier version of
 *  this file did) compares "where on the page" instead of "where inside
 *  its own host": a diff of ~270px, not a real defect. Every measurement
 *  below is taken relative to the cell's OWN `[data-host="tldraw"]` origin. */
function localRect(cellRoot: HTMLElement, rect: DOMRect): DOMRect {
  const origin = requiredEl<HTMLElement>(cellRoot, '[data-host="tldraw"]', "the cell's tldraw host root").getBoundingClientRect();
  return new DOMRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
}

/** The card's own box, HOST-LOCAL, in whichever phase this root is in: the
 *  live component's `[data-slot="block"]` before detach, or the
 *  lone/grouped primitive's `.tl-shape` box after — `bbox-node-anchor` is
 *  stamped on exactly the shape that stands where the card stood
 *  (`../detach/lowerShared.ts`), so this reads true in every phase without
 *  knowing which one it is. */
function cardRectFor(root: HTMLElement, phase: Phase): DOMRect {
  if (phase === "before" || phase === "rebuilt") {
    const block = requiredEl<HTMLElement>(root, '[data-slot="block"]', "the live Block card");
    return localRect(root, block.getBoundingClientRect());
  }
  // "detached": find the anchor primitive by measuring every LEAF `.tl-shape`
  // (excluding `group` shapes — see below) and taking the largest area (the
  // card is always the biggest single primitive a Block emits: header text
  // and port rings are all smaller).
  //
  // WHY groups are excluded, not just "the biggest thing": measured
  // 2026-09-18 — a port dot straddles the Block's wall (half in, half out,
  // by design, matching the live component), so the outer GROUP's own
  // bounding box is the card PLUS each protruding ring — 22px wider than
  // the card alone at the default "md" diameter (2 × 11px radius). Without
  // this filter, "largest by area" silently picked the group's box over
  // the card's, reporting a fake ~22px regression that had nothing to do
  // with card placement.
  const shapes = Array.from(root.querySelectorAll<HTMLElement>('.tl-shape[data-shape-type="geo"], .tl-shape[data-shape-type="text"]'));
  if (shapes.length === 0) throw new Error("no detached primitives found");
  return shapes
    .map((el) => localRect(root, el.getBoundingClientRect()))
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

/** The live "in" port dot's centre, host-local — `{}` on a row with no such
 *  port (not thrown — the caller decides whether that is expected). */
function livePortDotCentre(root: HTMLElement, portId: string): { x: number; y: number } | null {
  // `[data-slot="block-port-item"]` — `BlockPort`'s own render, both the
  // labelled and collapsed (simple-view) branches
  // (`../components/blockPort.tsx`'s `renderItem`).
  const member = root.querySelector<HTMLElement>(`[data-slot="block-port-item"][data-port-id="${portId}"]`);
  const dot = member?.querySelector<HTMLElement>('[data-slot="port-dot"]');
  if (!dot) return null;
  const rect = localRect(root, dot.getBoundingClientRect());
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * The nearest tldraw `ellipse` shape's centre to `expected` — used for the
 * detached/rebuilt columns, where a port ring's shape id is never threaded
 * out to the DOM. This is a proximity match, not an identity one: given the
 * card-level match above lands at (0, 0) offset, the correct ring is
 * expected within a few px of `expected`, so a `maxDistancePx` sanity cap
 * turns "matched the wrong ring" into a loud failure rather than a silently
 * wrong number.
 */
function nearestEllipseCentre(root: HTMLElement, expected: { x: number; y: number }, maxDistancePx: number): { x: number; y: number } {
  // Every stock primitive this kit emits — the card, the ring, a label box
  // — is tldraw's own `"geo"` shape TYPE (rectangle/ellipse/oval are all
  // `props.geo` variants of one shape type, not distinct shape types), so
  // `data-shape-type` cannot distinguish the ring from the card by itself.
  // Proximity does the discriminating instead: with the card-level match
  // already at 0px offset (see the loop above), the ring is expected within
  // a few px of `expected`, and `maxDistancePx` turns "matched the card
  // instead" into a loud failure rather than a silently wrong number.
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('.tl-shape[data-shape-type="geo"]')).map((el) => {
    const rect = localRect(root, el.getBoundingClientRect());
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  if (candidates.length === 0) throw new Error("no detached ellipse (port ring) found");
  const nearest = candidates
    .map((c) => ({ c, d: Math.hypot(c.x - expected.x, c.y - expected.y) }))
    .sort((a, b) => a.d - b.d)[0];
  if (nearest.d > maxDistancePx) {
    throw new Error(`nearest detached ring is ${nearest.d.toFixed(1)}px from the live dot — matched the wrong ring, not a real offset`);
  }
  return nearest.c;
}

/**
 * F3 — the exact ink box of a live DOM element's OWN text, host-local. The
 * SAME `Range` technique `../detach/stockShapes.ts`'s `textBoxRelativeTo`
 * uses to build the primitives in the first place, so this checks the
 * thing that function actually measured — not the element's padded box,
 * which can match while the glyphs inside it sit shifted (this repo's own
 * rule on truthful rendering: a box matching is not proof the text does).
 */
function liveTextInkRect(root: HTMLElement, el: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return localRect(root, el.getBoundingClientRect());
  return localRect(root, rect);
}

/** tldraw's own rendered text container inside a `"text"` shape — see
 *  tldraw's `RichTextLabel.tsx` (`.tl-text-content`, wrapping the actual
 *  glyphs, excluding the shape's own min-width/padding chrome). Selecting
 *  THIS element's contents with `Range`, not the outer `.tl-shape`, is what
 *  keeps this a glyph-ink measurement instead of a shape-box one. */
const DETACHED_TEXT_INK_SELECTOR = '.tl-shape[data-shape-type="text"] .tl-text-content';

/**
 * The nearest detached/rebuilt text shape's OWN ink box to `expected` —
 * proximity-matched the same way `nearestEllipseCentre` matches rings: a
 * tldraw text shape carries no data-* linking it back to which live label
 * it replaced, so with the card-level match already at ~0px offset, the
 * right text is expected within a few px of the live label's own centre.
 */
function nearestTextInkRect(root: HTMLElement, expected: { x: number; y: number }, maxDistancePx: number): DOMRect {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(DETACHED_TEXT_INK_SELECTOR));
  if (candidates.length === 0) throw new Error("no detached text shape found");
  const rects = candidates.map((el) => liveTextInkRect(root, el));
  const centreOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const nearest = rects
    .map((r) => ({ r, d: Math.hypot(centreOf(r).x - expected.x, centreOf(r).y - expected.y) }))
    .sort((a, b) => a.d - b.d)[0];
  if (nearest.d > maxDistancePx) {
    throw new Error(`nearest detached text is ${nearest.d.toFixed(1)}px from the live label — matched the wrong text, not a real offset`);
  }
  return nearest.r;
}

interface OffsetRow {
  row: string;
  metric: string;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Per-row tolerance — `TOLERANCE_PX` for geometry, `textTolerancePx(...)`
   *  for a per-string ink box (F3's tolerance is PROPORTIONAL, see that
   *  function's own doc, so it cannot be one shared module constant). */
  tolerance: number;
}

function offsetsBetween(row: string, metric: string, before: DOMRect, after: DOMRect, tolerance: number = TOLERANCE_PX): OffsetRow {
  return {
    row,
    metric,
    dx: Math.abs(after.left - before.left),
    dy: Math.abs(after.top - before.top),
    dw: Math.abs(after.width - before.width),
    dh: Math.abs(after.height - before.height),
    tolerance,
  };
}

/** Every non-anchor, non-group shape type actually emitted, across the
 *  whole canvas — the "STOCK means stock" assertion: every element must be
 *  a tldraw BUILT-IN type, never a custom ShapeUtil. */
function emittedShapeTypes(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".tl-shape[data-shape-type]")).map(
    (el) => el.getAttribute("data-shape-type")!,
  );
}

const STOCK_TYPES = new Set(["geo", "text", "group"]);
/** Tolerance justified in the lane report: the card box is measured off two
 *  DIFFERENT renderers (live CSS border-box vs. tldraw's geo stroke), and a
 *  label's width is measured off two different text engines (system sans
 *  vs. tldraw's bundled Plex Sans) — see `../detach/stockShapes.ts`'s
 *  header. A few px of residual disagreement between two independent paint
 *  engines is real and not worth chasing further; a shift larger than this
 *  is a bug, not font rasterisation. */
const TOLERANCE_PX = 6;

/**
 * F3's text tolerance — PROPORTIONAL, not flat, because the residual on a
 * per-string ink box is font-SUBSTITUTION advance mismatch (tldraw's
 * bundled `tldraw_sans` vs. this app's system-sans stack), which is a
 * PERCENTAGE of a string's rendered width (measured 2-9% per string here),
 * split evenly on each edge by `textAtDom`'s own centering — not a fixed
 * px slop `TOLERANCE_PX` alone would model correctly. Today's short
 * strings ("proc", "in", "out") stay inside even `TOLERANCE_PX` by
 * itself, which is exactly why a flat 6px looked sufficient before this
 * fix — but the independent audit's own extrapolation says a ~150px
 * single-line label would drift ~6-7px PER EDGE, past that flat cap,
 * purely because today's strings happen to be short. Floored at
 * `TOLERANCE_PX` (so short strings keep the same tight bar as the
 * geometry checks) and capped at half the measured 9% worst case (already
 * split by centering, hence /2) — loose enough to honestly pass a real
 * stock-font residual, tight enough that an actual placement bug on a long
 * string still fails loudly. See `LongSingleLineLabel` below for whether
 * the projection is real.
 */
const TEXT_DRIFT_PCT = 0.045;
function textTolerancePx(measuredWidthPx: number): number {
  return Math.max(TOLERANCE_PX, Math.ceil(measuredWidthPx * TEXT_DRIFT_PCT));
}

/* ------------------------------------------------------------------ */
/* The gallery — one row per BlockView, 3 columns each                  */
/* ------------------------------------------------------------------ */

interface GalleryRow {
  /** Unique — `view` alone collides now that F2/F3 add a second and third
   *  "expanded" row (a long header needs the expanded layout too). */
  id: string;
  view: BlockView;
  label: string;
  name?: string;
  w?: number;
  /** F2's own fixture: the live header WRAPS to several lines. Read by
   *  `play()` to switch from a strict before/after ink-box match (which
   *  would assert pixel-identical line breaks across two different font
   *  engines) to an overhang-only check — see `play()`'s own comment. */
  wraps?: boolean;
}

const ROWS: GalleryRow[] = [
  { id: "simple", view: "simple", label: "Simple" },
  { id: "port", view: "port", label: "Port" },
  { id: "expanded", view: "expanded", label: "Expanded" },
  {
    id: "wrapping-header",
    view: "expanded",
    label: "Wrapping header (F2)",
    // The exact repro string from the F2 bug report: on this component's
    // default 220px card, this wraps to 3 lines.
    name: "a long header name that definitely wraps across several lines",
    w: 220,
    wraps: true,
  },
  {
    id: "long-single-line-header",
    view: "expanded",
    label: "Long single-line header (F3 tolerance)",
    // Long enough to test the audit's own projection ("a ~150px
    // single-line label would drift ~6-7px per edge, past the story's own
    // 6px tolerance" — see `textTolerancePx`'s doc), short enough to stay
    // ONE line at this component's default 220px card (measured ~162px is
    // the wrap threshold at this width — see the "wrapping-header" row
    // above). Deliberately the SAME `w` as every other row: a wider card
    // would push the right-side "out" port outside `TldrawHost`'s fixed
    // 320px viewport, where tldraw's own off-screen culling sets
    // `display:none` on it (measured 2026-09-18 while diagnosing this row
    // — a real tldraw behaviour, not a detach-kit bug, but one this
    // fixture must not trip over).
    name: "a long single line header",
  },
];
const COLUMNS: { phase: Phase; label: string }[] = [
  { phase: "before", label: "Before" },
  { phase: "detached", label: "Detached (stock primitives)" },
  { phase: "rebuilt", label: "Rebuilt" },
];

export const BlockGallery: Story = {
  name: "Block — Before / Detached / Rebuilt",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {ROWS.map(({ id, view, label, name, w, wraps }) => (
        <div key={id} data-gallery-row={id} data-row-wraps={wraps || undefined}>
          <div style={{ font: "12px system-ui", opacity: 0.7, marginBottom: 4 }}>{label}</div>
          <div style={{ display: "flex", gap: 16 }}>
            {COLUMNS.map(({ phase, label: colLabel }) => (
              <div key={phase}>
                <div style={{ font: "11px system-ui", opacity: 0.5, marginBottom: 2 }}>{colLabel}</div>
                <GalleryCell view={view} phase={phase} name={name} w={w} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>("[data-gallery-row]"));
    expect(rows).toHaveLength(ROWS.length);

    const offsets: OffsetRow[] = [];

    for (const rowEl of rows) {
      const rowId = rowEl.getAttribute("data-gallery-row")!;
      const wraps = rowEl.hasAttribute("data-row-wraps");
      const cells = Array.from(rowEl.querySelectorAll<HTMLElement>("[data-cell-phase]"));
      expect(cells).toHaveLength(3);
      const byPhase = new Map(cells.map((cell) => [cell.getAttribute("data-cell-phase") as Phase, cell]));

      await waitFor(
        () => {
          for (const cell of cells) expect(cell.hasAttribute("data-cell-settled")).toBe(true);
        },
        { timeout: 8000 },
      );

      const beforeEl = byPhase.get("before")!;
      const detachedEl = byPhase.get("detached")!;
      const rebuiltEl = byPhase.get("rebuilt")!;

      // STOCK means stock: every shape the detached/rebuilt columns paint
      // is a tldraw built-in (`geo`/`text`/`group`), never a custom
      // ShapeUtil — the "what would this look like opened in a raw
      // whiteboard" test, made mechanical.
      for (const type of emittedShapeTypes(detachedEl)) {
        expect(STOCK_TYPES.has(type)).toBe(true);
      }
      // The rebuilt column is back to the LIVE component (a real `bbox-node`
      // shape rendering `BlockPort` again) — its own shape type is the
      // custom `bbox-node`, which is correct and expected; only the
      // DETACHED column's primitives are asserted stock.
      expect(rebuiltEl.querySelector('[data-slot="block"]')).not.toBeNull();

      const beforeRect = cardRectFor(beforeEl, "before");
      const detachedRect = cardRectFor(detachedEl, "detached");
      const rebuiltRect = cardRectFor(rebuiltEl, "rebuilt");

      const beforeVsDetached = offsetsBetween(rowId, "card before→detached", beforeRect, detachedRect);
      const beforeVsRebuilt = offsetsBetween(rowId, "card before→rebuilt (round trip)", beforeRect, rebuiltRect);
      offsets.push(beforeVsDetached, beforeVsRebuilt);

      // Port-level: the "in" dot's RING centre, before vs. detached vs.
      // rebuilt — a GEOMETRY check on the dot, not a text-placement one.
      // The actual per-string text-placement claim Zach asked for an
      // adversarial loop over ("I don't like how when you convert there
      // are these pixel offsets") is F3's ink-box assertions below, on the
      // TEXT NODES themselves — this ring check alone used to be the only
      // thing standing in for that claim, which was the bug F3 fixed
      // (`DetachToPrimitive.stories.tsx`'s own comment said otherwise).
      const liveCentre = livePortDotCentre(beforeEl, "in");
      if (liveCentre) {
        const asPointRect = (p: { x: number; y: number }) => new DOMRect(p.x, p.y, 0, 0);
        const detachedCentre = nearestEllipseCentre(detachedEl, liveCentre, 40);
        const rebuiltCentre = livePortDotCentre(rebuiltEl, "in");
        offsets.push(offsetsBetween(rowId, "port 'in' dot before→detached", asPointRect(liveCentre), asPointRect(detachedCentre)));
        if (rebuiltCentre) {
          offsets.push(offsetsBetween(rowId, "port 'in' dot before→rebuilt", asPointRect(liveCentre), asPointRect(rebuiltCentre)));
        }
      }

      // F3 — the header's own text-node ink box, before vs. detached vs.
      // rebuilt. `Range.getBoundingClientRect()` on the actual glyphs, not
      // the header element's padded box (which can match while the glyphs
      // sit shifted inside it).
      const headerEl = beforeEl.querySelector<HTMLElement>('[data-slot="block-header"]');
      if (headerEl && headerEl.textContent && headerEl.textContent.trim() !== "") {
        const liveInk = liveTextInkRect(beforeEl, headerEl);
        const liveCentreInk = { x: liveInk.left + liveInk.width / 2, y: liveInk.top + liveInk.height / 2 };
        const detachedInk = nearestTextInkRect(detachedEl, liveCentreInk, 60);
        if (wraps) {
          // F2's own fixture: the live header wraps to several lines, so
          // its WRAP LAYOUT (which word lands on which line) is allowed to
          // differ between the two font engines — asserting an identical
          // before/after ink box here would be asserting pixel-identical
          // line breaks across a system-sans/tldraw_sans swap, which is
          // not the bug this row exists to catch. What DOES matter, and is
          // exactly what F2's bug looked like (measured: one 393px-wide
          // line, 115px of overhang past the card's left edge): the
          // emitted shape must stay within the card and must still be
          // MULTIPLE lines, not collapsed back to one.
          const cardBox = cardRectFor(detachedEl, "detached");
          expect(detachedInk.width, `${rowId} detached header must not overhang the card (F2)`).toBeLessThanOrEqual(
            cardBox.width + TOLERANCE_PX,
          );
          expect(
            detachedInk.height,
            `${rowId} detached header must still wrap to multiple lines, not collapse to one (F2)`,
          ).toBeGreaterThan(liveInk.height * 0.5);
        } else {
          offsets.push(offsetsBetween(rowId, "header text ink before→detached", liveInk, detachedInk, textTolerancePx(liveInk.width)));
        }
        const rebuiltHeaderEl = rebuiltEl.querySelector<HTMLElement>('[data-slot="block-header"]');
        if (rebuiltHeaderEl) {
          const rebuiltInk = liveTextInkRect(rebuiltEl, rebuiltHeaderEl);
          offsets.push(
            offsetsBetween(rowId, "header text ink before→rebuilt (round trip)", liveInk, rebuiltInk, textTolerancePx(liveInk.width)),
          );
        }
      }

      // F3 — every PORT LABEL's own text-node ink box, before vs. detached
      // vs. rebuilt (`[data-slot="port-label-display"]` — `LabeledPort`'s
      // own render; "simple" view has no such element at all, its ports
      // are collapsed to a bare label-less dot — `blockPort.tsx`'s
      // `renderItem`, so this loop naturally runs zero times there).
      const labelEls = Array.from(beforeEl.querySelectorAll<HTMLElement>('[data-slot="port-label-display"]'));
      for (const labelEl of labelEls) {
        const portId = labelEl.closest<HTMLElement>('[data-slot="block-port-item"]')?.getAttribute("data-port-id") ?? "?";
        const liveInk = liveTextInkRect(beforeEl, labelEl);
        const liveCentreInk = { x: liveInk.left + liveInk.width / 2, y: liveInk.top + liveInk.height / 2 };
        const detachedInk = nearestTextInkRect(detachedEl, liveCentreInk, 40);
        offsets.push(
          offsetsBetween(rowId, `port '${portId}' label text ink before→detached`, liveInk, detachedInk, textTolerancePx(liveInk.width)),
        );
        const rebuiltLabelEl = rebuiltEl.querySelector<HTMLElement>(
          `[data-slot="block-port-item"][data-port-id="${portId}"] [data-slot="port-label-display"]`,
        );
        if (rebuiltLabelEl) {
          const rebuiltInk = liveTextInkRect(rebuiltEl, rebuiltLabelEl);
          offsets.push(
            offsetsBetween(
              rowId,
              `port '${portId}' label text ink before→rebuilt (round trip)`,
              liveInk,
              rebuiltInk,
              textTolerancePx(liveInk.width),
            ),
          );
        }
      }
    }

    // The one number the lane report's offset table is built from — printed
    // BEFORE asserting so a real `pnpm test-stories` run captures REAL
    // measured numbers for every row even when one fails tolerance, never
    // invented ones and never hidden by the first thrown assertion.
    // eslint-disable-next-line no-console
    console.table(offsets);

    for (const offset of offsets) {
      expect(offset.dx, `${offset.row} ${offset.metric} dx`).toBeLessThanOrEqual(offset.tolerance);
      expect(offset.dy, `${offset.row} ${offset.metric} dy`).toBeLessThanOrEqual(offset.tolerance);
      expect(offset.dw, `${offset.row} ${offset.metric} dw`).toBeLessThanOrEqual(offset.tolerance);
      expect(offset.dh, `${offset.row} ${offset.metric} dh`).toBeLessThanOrEqual(offset.tolerance);
    }
  },
};

/* ------------------------------------------------------------------ */
/* F1 regression — the detach kit's MODEL output must not depend on the */
/* camera's zoom level at the moment of detach                          */
/* ------------------------------------------------------------------ */

interface GeoBox {
  geo: string;
  w: number;
  h: number;
}

/** Every `"geo"` shape's own MODEL props (`w`/`h`, never a screen rect) in
 *  `rootId`'s subtree, walked recursively so it covers both the grouped
 *  case (card + ports, nested row subgroups) and the solo-primitive case
 *  (`lowerShared.ts`'s "tldraw refuses one-child groups" fallback) with the
 *  same call — `getSortedChildIdsForParent` returns nothing for a leaf, so
 *  starting the walk at `rootId` itself is enough either way. Deterministic
 *  CREATION order (`lowerToGroup` always creates card, then per-port
 *  ring/label, in the same sequence) is what makes comparing two runs'
 *  arrays index-by-index meaningful. */
function collectGeoBoxes(editor: Editor, rootId: TLShapeId, out: GeoBox[] = []): GeoBox[] {
  const shape = editor.getShape(rootId);
  if (!shape) return out;
  if (shape.type === "geo") {
    const props = shape.props as { geo: string; w: number; h: number };
    out.push({ geo: props.geo, w: props.w, h: props.h });
  }
  for (const childId of editor.getSortedChildIdsForParent(rootId)) collectGeoBoxes(editor, childId, out);
  return out;
}

/**
 * One zoom variant: mount its OWN host at the DEFAULT camera `handleMount`
 * always sets (z = 1), override it to `zoom` (the case this regression
 * exists for — a real whiteboard is essentially never sitting at z = 1 the
 * moment someone right-clicks "detach"), THEN detach, and stash every
 * emitted geo shape's own MODEL props as a `data-*` attribute for `play()`
 * to read and compare across cells — the CARD/RING/TEXT boxes in tldraw's
 * OWN persisted units, never a screen `getBoundingClientRect()` (which is
 * exactly the quantity F1's bug baked the zoom into).
 */
function ZoomCell({ zoom }: { zoom: number }) {
  const [scene, setScene] = useState<HostScene>(() => sceneFor("expanded"));
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const [boxes, setBoxes] = useState<GeoBox[] | null>(null);
  // See the interval below this ref feeds — cleared on unmount via the
  // `useEffect` further down, since `onEditorReady` is a plain callback
  // (fired once from `TldrawHost`'s own `handleMount`), not a React effect
  // whose RETURN value tldraw would ever call.
  const pinIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleEditorReady = useCallback(
    (editor: Editor, container: HTMLElement) => {
      registerEditorContainer(editor, container);
      void (async () => {
        await waitForPortDotsToSettle(container);
        // The bug this regression catches: `handleMount` always sets z = 1
        // first (a deterministic bench camera) — this OVERRIDES it to the
        // zoom under test BEFORE detaching, so the live DOM's
        // `getBoundingClientRect()` at detach time is genuinely scaled,
        // exactly like a real whiteboard the user has zoomed.
        editor.setCamera({ x: 0, y: 0, z: zoom });
        await nextPaint();
        editor.select(shapeIdForNode("proc"));
        const result = detachSelectedShapes(editor, sceneRef.current, setScene);
        editor.setCamera({ x: 0, y: 0, z: zoom });
        const lowered = result.lowered.get(shapeIdForNode("proc"));
        if (!lowered?.selectionId) return;
        setBoxes(collectGeoBoxes(editor, lowered.selectionId));
        // tldraw keeps re-fitting the camera to a newly-changed selection
        // for a while after it changes (the same real behaviour `GalleryCell`
        // and `RebuildMenuStates` both re-pin against once) — a SINGLE
        // re-pin above is enough for the numeric assertions in `play()`
        // (they run within milliseconds), but a report SCREENSHOT taken
        // seconds later (`docs/capture_storybook_shots.mjs`'s `settle`)
        // catches tldraw's own later re-fit and visually normalizes away
        // the exact size difference this cell exists to show — measured
        // directly: without this loop, a buggy and a fixed z=2 capture
        // render pixel-identical several seconds on, even though
        // `collectGeoBoxes` above always read the correct 2× MODEL
        // difference at detach time. Capture-quality aid only; changes
        // nothing about what gets measured or asserted.
        pinIntervalRef.current = setInterval(() => editor.setCamera({ x: 0, y: 0, z: zoom }), 100);
      })();
    },
    [zoom],
  );

  useEffect(() => {
    return () => {
      if (pinIntervalRef.current) clearInterval(pinIntervalRef.current);
    };
  }, []);

  return (
    <div data-zoom-cell={zoom} data-model-boxes={boxes ? JSON.stringify(boxes) : undefined}>
      {/* 960×600, wider than `GalleryCell`'s 320×260 — a WITHOUT-F1 card at
       *  z=2 renders 880px wide on screen (220 model × 2 zoom × the bug's
       *  own extra 2×); a narrower stage would clip its right edge
       *  identically in the buggy and fixed cases (both already overflow a
       *  320px frame), which is exactly what made the first capture attempt
       *  here look pixel-identical for z=2 regardless of the fix. */}
      <TldrawHost scene={scene} onSceneChange={setScene} onEditorReady={handleEditorReady} width={960} height={600} />
    </div>
  );
}

const ZOOM_LEVELS = [0.5, 1, 2];
/** Model geometry must be IDENTICAL across zoom levels — any residual here
 *  is measurement noise (sub-pixel rounding differs slightly at different
 *  scale factors), never a real placement difference, so this is
 *  deliberately much tighter than F3's font-substitution tolerances. */
const ZOOM_TOLERANCE_PX = 1;

export const ZoomInvariance: Story = {
  name: "F1 regression — detach at z = 0.5 / 1 / 2 must agree",
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      {ZOOM_LEVELS.map((zoom) => (
        <div key={zoom}>
          <div style={{ font: "11px system-ui", opacity: 0.5, marginBottom: 2 }}>{`z = ${zoom}`}</div>
          <ZoomCell zoom={zoom} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const cells = Array.from(canvasElement.querySelectorAll<HTMLElement>("[data-zoom-cell]"));
    expect(cells).toHaveLength(ZOOM_LEVELS.length);

    await waitFor(
      () => {
        for (const cell of cells) expect(cell.hasAttribute("data-model-boxes")).toBe(true);
      },
      { timeout: 8000 },
    );

    const boxesByZoom = new Map<string, GeoBox[]>(
      cells.map((cell) => [cell.getAttribute("data-zoom-cell")!, JSON.parse(cell.getAttribute("data-model-boxes")!) as GeoBox[]]),
    );

    // Sanity: this fixture (view "expanded", 2 ports) always emits the same
    // number of geo shapes — card + 2 rings — regardless of zoom. A count
    // mismatch means detach itself broke, not a geometry drift; fail loudly
    // rather than let a shorter/longer array silently short-circuit the
    // per-shape loop below.
    for (const [zoom, boxes] of boxesByZoom) {
      expect(boxes.length, `z=${zoom} geo shape count`).toBe(3);
    }

    const reference = boxesByZoom.get("1")!;
    // eslint-disable-next-line no-console
    console.table(
      ZOOM_LEVELS.flatMap((zoom) =>
        boxesByZoom.get(String(zoom))!.map((box, i) => ({ zoom, shape: `#${i} (${box.geo})`, w: box.w, h: box.h })),
      ),
    );
    for (const zoom of ZOOM_LEVELS) {
      if (zoom === 1) continue;
      const boxes = boxesByZoom.get(String(zoom))!;
      boxes.forEach((box, i) => {
        expect(box.geo, `z=${zoom} shape #${i} geo type vs z=1`).toBe(reference[i].geo);
        // CONFIRMED BUG this catches: before the fix, a shape detached at
        // z=2 measured 2× the z=1 model box (a 220×140 card became
        // 440×280) — reverting `stockShapes.ts`'s zoom division turns this
        // red immediately with exactly that symptom (see the lane report's
        // mutation-test section).
        expect(Math.abs(box.w - reference[i].w), `z=${zoom} shape #${i} (${box.geo}) w vs z=1`).toBeLessThanOrEqual(ZOOM_TOLERANCE_PX);
        expect(Math.abs(box.h - reference[i].h), `z=${zoom} shape #${i} (${box.geo}) h vs z=1`).toBeLessThanOrEqual(ZOOM_TOLERANCE_PX);
      });
    }
  },
};

/* ------------------------------------------------------------------ */
/* The right-click "Rebuild" menu — Zach's own request, its two states  */
/* ------------------------------------------------------------------ */

/**
 * `play()` needs to drive `editor` imperatively (select a shape, call
 * `detachSelectedShapes`) and read/write the CURRENT `scene`, none of
 * which a DOM attribute can carry — every other cell in this file only
 * needs to REPORT state outward (hence `data-cell-settled` etc.), but
 * driving a real right-click menu needs a live handle back in. `setScene`
 * is the stable function identity `useState` guarantees across renders,
 * so capturing it once (inside a `useCallback([])`) is safe; `getScene`
 * closes over a ref that this component keeps current every render.
 */
let rebuildMenuHandle: { editor: Editor; container: HTMLElement; getScene(): HostScene; setScene(next: HostScene): void } | null = null;

function RebuildMenuCell() {
  const [scene, setScene] = useState<HostScene>(() => sceneFor("expanded"));
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const [ready, setReady] = useState(false);

  const handleEditorReady = useCallback((editor: Editor, container: HTMLElement) => {
    registerEditorContainer(editor, container);
    rebuildMenuHandle = { editor, container, getScene: () => sceneRef.current, setScene };
    setReady(true);
  }, []);

  return (
    <div data-menu-cell data-menu-ready={ready || undefined}>
      {/* `components` — the seam this lane added to `TldrawHost`
       *  (`../hosts/tldrawHost.tsx`) — composes `RebuildContextMenu` onto
       *  tldraw's own stock context menu; every other menu item stays. */}
      <TldrawHost
        scene={scene}
        onSceneChange={setScene}
        onEditorReady={handleEditorReady}
        width={320}
        height={260}
        components={{ ContextMenu: RebuildContextMenu }}
      />
    </div>
  );
}

async function openContextMenu(canvasEl: HTMLElement): Promise<HTMLElement> {
  fireEvent.contextMenu(canvasEl, { clientX: 20, clientY: 20 });
  return waitFor(() => {
    const found = document.querySelector<HTMLElement>('[data-testid="context-menu"]');
    if (!found) throw new Error("context menu did not open");
    return found;
  });
}

async function closeContextMenu() {
  fireEvent.keyDown(document.body, { key: "Escape" });
  await waitFor(() => {
    expect(document.querySelector('[data-testid="context-menu"]')).toBeNull();
  });
}

export const RebuildMenuStates: Story = {
  name: 'Right-click "Rebuild" menu — present with rebuild info, absent without',
  render: () => <RebuildMenuCell />,
  play: async ({ canvasElement }) => {
    await waitFor(
      () => {
        expect(canvasElement.querySelector("[data-menu-ready]")).not.toBeNull();
      },
      { timeout: 8000 },
    );
    const handle = rebuildMenuHandle;
    if (!handle) throw new Error("RebuildMenuCell never became ready");
    const { editor, container } = handle;
    await waitForPortDotsToSettle(container);
    const canvasEl = container.querySelector<HTMLElement>(".tl-canvas");
    if (!canvasEl) throw new Error("tldraw canvas element (`.tl-canvas`) not found");

    // STATE 1 — ABSENT: the live (not-yet-detached) `bbox-node` shape
    // carries no rebuild info (`rebuild.ts`'s own detection), so
    // right-clicking it must show the stock menu WITHOUT a Rebuild item —
    // an always-present item that no-ops would be worse than none.
    editor.select(shapeIdForNode("proc"));
    const menuBefore = await openContextMenu(canvasEl);
    expect(
      menuBefore.querySelector('[data-testid="context-menu.bbox-ui-rebuild"]'),
      "Rebuild item must be ABSENT before detach",
    ).toBeNull();
    await closeContextMenu();

    // STATE 2 — PRESENT, driven at a NON-1 camera zoom. This is F1's own
    // integration check (see this file's header on F1/the menu's
    // interaction): the menu is exactly what makes detach/rebuild
    // reachable at whatever zoom the user happens to be at when they
    // right-click, which is the condition the zoom bug hid behind — a
    // bench fixed at z=1 forever would never have exercised it.
    editor.setCamera({ x: 0, y: 0, z: 2 });
    await nextPaint();
    editor.select(shapeIdForNode("proc"));
    const detachResult = detachSelectedShapes(editor, handle.getScene(), handle.setScene);
    // `detachSelectedShapes` leaves the replacement group selected —
    // exactly what `RebuildMenuGroup`'s own detection reads.
    editor.setCamera({ x: 0, y: 0, z: 2 }); // detach re-pans the camera; hold z=2 through to the rebuild
    await nextPaint();

    // F1's actual integration check: the shapes `detachSelectedShapes` JUST
    // emitted, AT z=2, must carry the same MODEL geometry as the z=1
    // fixture — 220×140, not 440×280 (F1's own bug symptom). This has to
    // be checked HERE, on the DETACHED primitives, not after rebuilding:
    // `rebuild.ts` restores a live `bbox-node` from the RECORD's own
    // `data.w`/`data.h` (the ORIGINAL scene node, never re-derived from the
    // detached shapes' geometry — see that file's own header), so a
    // rebuilt card's size says nothing about whether F1's zoom division
    // ran correctly; only the DETACHED output does.
    const loweredProc = detachResult.lowered.get(shapeIdForNode("proc"));
    expect(loweredProc?.selectionId, "detach must have produced a replacement selection").toBeTruthy();
    const detachedBoxes = collectGeoBoxes(editor, loweredProc!.selectionId!);
    const card = detachedBoxes.find((box) => box.geo === "rectangle");
    expect(card, "detached output must include the card rectangle").toBeTruthy();
    expect(card!.w, "detached card model width at z=2 (F1)").toBeCloseTo(220, 0);
    expect(card!.h, "detached card model height at z=2 (F1)").toBeCloseTo(140, 0);

    const menuAfter = await openContextMenu(canvasEl);
    const rebuildItem = menuAfter.querySelector<HTMLElement>('[data-testid="context-menu.bbox-ui-rebuild"]');
    expect(rebuildItem, "Rebuild item must be PRESENT after detach").not.toBeNull();
    rebuildItem!.click();
    await waitFor(() => {
      expect(document.querySelector('[data-testid="context-menu"]')).toBeNull();
    });

    // Rebuild actually ran through the REAL menu entry point, not a direct
    // `rebuildDetachedShapes` call — the live component is back, still at
    // the non-1 zoom this whole state was driven at.
    await waitFor(
      () => {
        expect(container.querySelector('[data-slot="block"]')).not.toBeNull();
      },
      { timeout: 8000 },
    );
    expect(editor.getZoomLevel(), "camera must still be at the non-1 zoom this state exercises").toBeCloseTo(2, 5);
  },
};

/**
 * A capture-only variant of the story above: drives to the SAME "detached,
 * menu open, Rebuild item visible" moment, but LEAVES it there — no close,
 * no click — so `docs/capture_storybook_shots.mjs` (which just loads a
 * story and waits, it does not care whether the play function passed) has
 * something worth screenshotting. `RebuildMenuStates` above is the real
 * acceptance test; this one exists only because that test's own end state
 * (menu closed, rebuild complete) is not a useful picture.
 */
export const RebuildMenuOpenForCapture: Story = {
  name: 'Right-click "Rebuild" menu — open (capture only)',
  render: () => <RebuildMenuCell />,
  play: async ({ canvasElement }) => {
    await waitFor(
      () => {
        expect(canvasElement.querySelector("[data-menu-ready]")).not.toBeNull();
      },
      { timeout: 8000 },
    );
    const handle = rebuildMenuHandle;
    if (!handle) throw new Error("RebuildMenuCell never became ready");
    const { editor, container } = handle;
    await waitForPortDotsToSettle(container);
    const canvasEl = container.querySelector<HTMLElement>(".tl-canvas");
    if (!canvasEl) throw new Error("tldraw canvas element (`.tl-canvas`) not found");

    editor.setCamera({ x: 0, y: 0, z: 2 });
    await nextPaint();
    editor.select(shapeIdForNode("proc"));
    detachSelectedShapes(editor, handle.getScene(), handle.setScene);
    editor.setCamera({ x: 0, y: 0, z: 2 });
    await nextPaint();
    await openContextMenu(canvasEl);
  },
};
