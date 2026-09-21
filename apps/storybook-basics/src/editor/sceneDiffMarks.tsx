// src/editor/sceneDiffMarks.tsx — the diff LENS: an outline drawn around every
// node a comparison says changed, painted OVER a rendered scene rather than
// into it.
//
// WHY a measured overlay and not a prop on the node: `scene/sceneDiff.ts`'s
// own header sets the rule — a diff mark is written into a node's `data` under
// one convention key by a paint layer, or it is drawn on top; what it must
// never do is become a second opinion inside the component. This layer reads
// the node's REAL rendered box off the DOM (`getBoundingClientRect`) and
// inflates it, so a mark can never disagree with what is on screen: there is
// no second geometry to get wrong. It also means a host that resizes, folds or
// re-lays-out a node gets a correct mark with no cooperation from the node.
//
// WHY it does not reuse `hosts/nodeViews.tsx`'s `decorate` seam, which is the
// obvious-looking place: `decorate` feeds `Block.diagnostics` and
// `Port.availability` — the LINT lane. `sceneDiff.ts` quotes the donor's own
// WHY for keeping the two apart ("the diff lane must not depend on the lint
// lane"), and routing diff marks through a diagnostics prop would put a
// comparison's output into the channel a validator owns, where a reader cannot
// tell which producer drew it.
//
// WHY `editor/` and not `components/`: it is chrome applied on top of a board
// to drive a review, it holds its own measurement state, and it imports the
// scene kit's `DiffOperation` — three separate reasons `components/` is wrong
// (props in, DOM out, no state, never imports scene).

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

import type { DiffOperation } from "../scene/sceneDiff";

/**
 * The attribute a DOM host stamps on each top-level node wrapper.
 * `hosts/domCanvas.tsx` already writes it (`data-scene-node={node.id}`); this
 * layer only READS it, so the two share a convention rather than an import —
 * which is what lets a non-`DomCanvas` host (the app's tldraw board, a future
 * React Flow pane) opt in by stamping the same attribute.
 */
export const SCENE_NODE_ATTRIBUTE = "data-scene-node";

/** How far outside the node's own box the outline sits, in CSS pixels.
 *  Exported because it is the ONLY number in this file a test may assert
 *  against — a story measures the mark and the node and checks the gap is
 *  this, never a literal. */
export const DIFF_MARK_INSET = 6;

/** The outline's stroke width, in CSS pixels. Same reason it is exported. */
export const DIFF_MARK_BORDER = 2;

/**
 * One hue per operation.
 *
 * These are `scene/SceneDiff.stories.tsx`'s own three literals, deliberately
 * the same values rather than a second palette: added is seagreen because
 * `globals.css` ships no success token (checked there, recorded there), removed
 * is the destructive token, modified is darkorange because it is neither.
 */
export const DIFF_MARK_COLOR: Readonly<Record<DiffOperation, string>> = {
  added: "seagreen",
  removed: "var(--destructive)",
  modified: "darkorange",
};

export interface SceneDiffMark {
  /** The node id — matched against `SCENE_NODE_ATTRIBUTE` in the container. */
  readonly id: string;
  readonly operation: DiffOperation;
  /** What the mark is called, for assistive tech and the title attribute. */
  readonly label?: string;
}

export interface SceneDiffMarksProps {
  readonly marks: readonly SceneDiffMark[];
  /** The positioned element the marks are drawn inside — the same ref the host
   *  gives its canvas. Marks are placed relative to THIS box. */
  readonly containerRef: RefObject<HTMLElement | null>;
  /** The change currently under review. Its mark is drawn heavier; every other
   *  mark stays visible, because a diff whose other rows disappear on
   *  selection is a diff you cannot navigate. */
  readonly selectedId?: string | null;
  /** Any value that changes when the scene's layout might have. Same signal
   *  `hosts/domCanvas.tsx` hands `WireLayer` as `layoutKey`, and for the same
   *  reason: a reorder moves a box without resizing anything an observer sees. */
  readonly layoutKey?: unknown;
  readonly testIdPrefix?: string;
}

interface PlacedMark extends SceneDiffMark {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Outlines over the nodes a comparison names.
 *
 * A mark whose node is not in this container is SKIPPED, never drawn at a
 * guessed position — the same "skipped, not guessed at" channel
 * `hosts/domCanvas.tsx`'s `WireLayer` uses for an unresolved anchor. That is
 * what makes the layer correct on the `before` pane, where every `added` node
 * is legitimately absent, with no per-side filtering by the caller.
 */
export function SceneDiffMarks({
  marks,
  containerRef,
  selectedId = null,
  layoutKey,
  testIdPrefix = "scene-diff-mark",
}: SceneDiffMarksProps) {
  const [placed, setPlaced] = useState<readonly PlacedMark[]>([]);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      setPlaced([]);
      return;
    }
    const origin = container.getBoundingClientRect();
    const next: PlacedMark[] = [];
    for (const mark of marks) {
      const node = container.querySelector<HTMLElement>(`[${SCENE_NODE_ATTRIBUTE}="${CSS.escape(mark.id)}"]`);
      if (!node) continue;
      const box = node.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      next.push({
        ...mark,
        left: box.left - origin.left - DIFF_MARK_INSET,
        top: box.top - origin.top - DIFF_MARK_INSET,
        width: box.width + DIFF_MARK_INSET * 2,
        height: box.height + DIFF_MARK_INSET * 2,
      });
    }
    setPlaced(next);
  }, [containerRef, marks]);

  useLayoutEffect(() => {
    measure();
  }, [measure, layoutKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    // The node boxes are what moved, so the observer watches the container they
    // live in — a block that grows a port row resizes inside it, and the
    // container's own content box follows.
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    for (const child of container.querySelectorAll(`[${SCENE_NODE_ATTRIBUTE}]`)) observer.observe(child);
    return () => observer.disconnect();
  }, [containerRef, measure, layoutKey]);

  return (
    <div
      data-slot="scene-diff-marks"
      data-testid={testIdPrefix}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {placed.map((mark) => (
        <div
          key={mark.id}
          data-testid={`${testIdPrefix}-${mark.id}`}
          data-operation={mark.operation}
          data-selected={mark.id === selectedId || undefined}
          title={mark.label ?? mark.id}
          style={{
            position: "absolute",
            left: mark.left,
            top: mark.top,
            width: mark.width,
            height: mark.height,
            borderRadius: DIFF_MARK_INSET + DIFF_MARK_BORDER,
            border: `${DIFF_MARK_BORDER}px ${mark.operation === "removed" ? "dashed" : "solid"} ${DIFF_MARK_COLOR[mark.operation]}`,
            // WHY the selected mark gets a wash and not a heavier stroke: the
            // stroke width is what a story measures against DIFF_MARK_BORDER,
            // and a selection that changed it would make the geometry depend
            // on which row a reviewer happened to click.
            background: mark.id === selectedId ? `color-mix(in srgb, ${DIFF_MARK_COLOR[mark.operation]} 14%, transparent)` : undefined,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The marks for ONE side of a comparison, straight off `BoardCompare`-shaped
 * rows.
 *
 * Takes the two anchor fields rather than a whole `CompareChange` so this file
 * needs no import from `components/compareModel` — the anchors are the only
 * part of a change this layer can draw, and a host with its own change record
 * can feed it the same two fields.
 */
export function diffMarksForSide(
  changes: readonly { id: string; kind: DiffOperation; name: string; anchorBefore: string | null; anchorAfter: string | null }[],
  side: "before" | "after",
): SceneDiffMark[] {
  const marks: SceneDiffMark[] = [];
  const seen = new Set<string>();
  for (const change of changes) {
    const anchor = side === "before" ? change.anchorBefore : change.anchorAfter;
    if (!anchor || seen.has(anchor)) continue;
    seen.add(anchor);
    marks.push({ id: anchor, operation: change.kind, label: change.name });
  }
  return marks;
}
