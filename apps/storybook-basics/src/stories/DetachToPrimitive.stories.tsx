import { useCallback, useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import type { Editor } from "tldraw";

import type { BlockView } from "../components/blockPort.layout";
import type { HostScene } from "../hosts/hostScene";
import { shapeIdForNode, TldrawHost } from "../hosts/tldrawHost";
import { detachSelectedShapes, rebuildDetachedShapes, registerEditorContainer } from "../detach";

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

function sceneFor(view: BlockView): HostScene {
  return {
    nodes: [
      {
        id: "proc",
        type: "block",
        position: { x: 24, y: 24 },
        data: { name: "proc", view, w: 220, h: 140, ports: { left: ["in"], right: ["out"] } },
      },
    ],
    edges: [],
  };
}

type Phase = "before" | "detached" | "rebuilt";

async function nextPaint() {
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

function GalleryCell({ view, phase }: { view: BlockView; phase: Phase }) {
  const [scene, setScene] = useState<HostScene>(() => sceneFor(view));
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

interface OffsetRow {
  row: string;
  metric: string;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

function offsetsBetween(row: string, metric: string, before: DOMRect, after: DOMRect): OffsetRow {
  return {
    row,
    metric,
    dx: Math.abs(after.left - before.left),
    dy: Math.abs(after.top - before.top),
    dw: Math.abs(after.width - before.width),
    dh: Math.abs(after.height - before.height),
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

/* ------------------------------------------------------------------ */
/* The gallery — one row per BlockView, 3 columns each                  */
/* ------------------------------------------------------------------ */

const ROWS: { view: BlockView; label: string }[] = [
  { view: "simple", label: "Simple" },
  { view: "port", label: "Port" },
  { view: "expanded", label: "Expanded" },
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
      {ROWS.map(({ view, label }) => (
        <div key={view} data-gallery-row={view}>
          <div style={{ font: "12px system-ui", opacity: 0.7, marginBottom: 4 }}>{label}</div>
          <div style={{ display: "flex", gap: 16 }}>
            {COLUMNS.map(({ phase, label: colLabel }) => (
              <div key={phase}>
                <div style={{ font: "11px system-ui", opacity: 0.5, marginBottom: 2 }}>{colLabel}</div>
                <GalleryCell view={view} phase={phase} />
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
      const view = rowEl.getAttribute("data-gallery-row")!;
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

      const beforeVsDetached = offsetsBetween(view, "card before→detached", beforeRect, detachedRect);
      const beforeVsRebuilt = offsetsBetween(view, "card before→rebuilt (round trip)", beforeRect, rebuiltRect);
      offsets.push(beforeVsDetached, beforeVsRebuilt);

      // Port-level: the "in" dot's ring centre, before vs. detached vs.
      // rebuilt — the text-placement claim Zach specifically asked for an
      // adversarial loop over ("I don't like how when you convert there
      // are these pixel offsets"), measured on the element most likely to
      // carry one, not just the card's outer box.
      const liveCentre = livePortDotCentre(beforeEl, "in");
      if (liveCentre) {
        const asPointRect = (p: { x: number; y: number }) => new DOMRect(p.x, p.y, 0, 0);
        const detachedCentre = nearestEllipseCentre(detachedEl, liveCentre, 40);
        const rebuiltCentre = livePortDotCentre(rebuiltEl, "in");
        offsets.push(offsetsBetween(view, "port 'in' dot before→detached", asPointRect(liveCentre), asPointRect(detachedCentre)));
        if (rebuiltCentre) {
          offsets.push(offsetsBetween(view, "port 'in' dot before→rebuilt", asPointRect(liveCentre), asPointRect(rebuiltCentre)));
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
      expect(offset.dx, `${offset.row} ${offset.metric} dx`).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(offset.dy, `${offset.row} ${offset.metric} dy`).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(offset.dw, `${offset.row} ${offset.metric} dw`).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(offset.dh, `${offset.row} ${offset.metric} dh`).toBeLessThanOrEqual(TOLERANCE_PX);
    }
  },
};
