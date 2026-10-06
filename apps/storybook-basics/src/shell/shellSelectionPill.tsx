// src/shell/shellSelectionPill.tsx — the shell's floating selection pill: the
// trunk's `FloatingToolbar`, placed over `selection().screenBounds`, hidden
// while `interaction()` says a gesture is running, with Duplicate and Delete
// over `nodes()`.
//
// PROVENANCE: lifted from apps/systemsketch/src/chrome/ContextualPopupMenu/
// floatingToolbar.tsx at 75991ce (B-SHELL-P1 §4.2 row 6). The placement loop
// (STEPS 1-6 below, numbered as they were there) and the two universal rows
// moved; the content clusters — block view, code language, appearance, edge
// type, tunnel, arrange, focus, group — are host vocabulary and arrive as
// `content` (L-PILL owns them next).
//
// WHY the pill exists in this shape at all: Zach's reference is FigJam's
// contextual toolbar — it follows the selection, sits clear of it, and gets
// out of the way for the length of a drag. Each of those is a step below.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Trash2 } from "lucide-react";

import { FloatingToolbar } from "../editor/floatingToolbar";
import {
  floatingToolbarMaxWidth,
  isSelectionOnScreen,
  placeFloatingToolbar,
  type SelectionMenuSide,
} from "../editor/floatingToolbar.placement";
import { ToolbarButton, ToolbarSeparator } from "../editor/toolbar";

import { useAffordance, useHostPort, useHostValue } from "./BboxShell";

/** The pill's own cells, traced from FigJam (40px tall, 32 wide, white ink on
 *  the dark surface) — the studio's `CELL_ICON` / `PILL_SEPARATOR`
 *  (chrome/ContextualPopupMenu/selectionClusters.tsx at 75991ce), so the two
 *  rows that moved look exactly like the clusters that stayed. */
const PILL_CELL =
  "text-white hover:bg-[#383838] hover:text-white dark:hover:bg-[#383838]"
  + " aria-expanded:bg-[#383838] aria-expanded:text-white focus-visible:ring-white/40"
  + " h-10 w-8 shrink-0 rounded-[5px] border-0 p-0 [&_svg:not([class*='size-'])]:size-6";
const PILL_RULE = "h-10 self-center bg-[#383838]";

export interface ShellSelectionPillProps {
  /** The host's clusters, painted before Duplicate and Delete. */
  content?: ReactNode;
  /** The interface-scale factor the host applies to its chrome. */
  scale?: number;
  /** How far the engine draws its selection outline outside the selection's
   *  bounds, in screen px — tldraw's is `SELECTION_OVERLAY_INSET` (5). */
  overlayInset?: number;
  /** How much of the viewport's bottom edge the host's dock owns, so the pill
   *  is never drawn under it. */
  bottomObstacleHeight?: number;
  /** Stamps `${prefix}-duplicate` / `${prefix}-delete`. */
  testIdPrefix?: string;
}

/** The pill's own resolved placement. `null` = nothing has been placed for
 *  the current selection yet, which is NOT the same as "placed off-screen". */
interface Placement {
  x: number;
  y: number;
  side: SelectionMenuSide;
}

const NO_SELECTION = { ids: [] as readonly string[], screenBounds: null };
const NO_VIEWPORT = { zoom: 1, screenBounds: { x: 0, y: 0, w: 0, h: 0 } };

export function ShellSelectionPill({ content, scale = 1, overlayInset = 0, bottomObstacleHeight = 0, testIdPrefix }: ShellSelectionPillProps) {
  const port = useHostPort();
  const canDuplicate = useAffordance("selection.duplicate");
  const canDelete = useAffordance("selection.delete");
  const selection = useHostValue((p) => p.selection(), NO_SELECTION);
  const viewport = useHostValue((p) => p.viewport(), NO_VIEWPORT);
  /**
   * STEP 4 — the manipulation gate. A pill that follows the shape you are
   * dragging is a pill that is always under your cursor; FigJam hides it for
   * the length of the gesture and brings it back where the shape landed.
   */
  const manipulating = useHostValue((p) => p.interaction() !== "idle", false);

  const pill = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [placement, setPlacement] = useState<Placement | null>(null);
  /**
   * STEP 5 — the monotonic pass counter, ported in spirit from the donor's
   * `placementPass` (/home/bam/systemsketch/src/chrome/SelectionContextualMenu.tsx).
   * `placeFloatingToolbar` resolves in a microtask, so two passes started in
   * the same tick can settle in either order; without this guard the LOSER
   * writes last and the pill lands where the selection used to be.
   */
  const pass = useRef(0);

  /**
   * STEP 1 — measure the RENDERED pill. The kit's component takes a `ref` for
   * exactly this and measures nothing itself (its own "no self-measurement"
   * rule). The guard keeps an identical measurement from re-rendering.
   */
  const mounted = port !== null;
  useLayoutEffect(() => {
    const node = pill.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize((previous) => (previous.w === rect.width && previous.h === rect.height ? previous : { w: rect.width, h: rect.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted]);

  // STEP 2 — selection and viewport, already container-relative screen px
  // (HostPort constraint 6): the conversion the app used to do here is the
  // port's job now.
  const bounds = selection.screenBounds;
  const view = viewport.screenBounds;
  const selected = selection.ids.length > 0 && bounds !== null;

  /** STEP 3 + 6 — place, and re-place on every input that can change it:
   *  camera, selection, the pill's own size, the viewport's size. */
  useEffect(() => {
    if (!selected || !bounds || manipulating || size.w === 0 || size.h === 0) {
      setPlacement((previous) => (previous === null ? previous : null));
      return;
    }
    const ticket = ++pass.current;
    void placeFloatingToolbar({
      selection: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
      menu: { w: size.w, h: size.h },
      viewport: { w: view.w, h: view.h },
      ...(bottomObstacleHeight > 0 ? { bottomObstacleTop: view.h - bottomObstacleHeight } : {}),
      overlayInset,
    }).then((next) => {
      if (ticket !== pass.current) return;
      setPlacement((previous) =>
        previous && previous.x === next.x && previous.y === next.y && previous.side === next.side ? previous : next,
      );
    });
  }, [selected, bounds, view.w, view.h, manipulating, size.w, size.h, bottomObstacleHeight, overlayInset]);

  if (!port) return null;

  const visible =
    selected
    && !manipulating
    && placement !== null
    && bounds !== null
    && isSelectionOnScreen({ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }, { w: view.w, h: view.h });

  const testId = (row: string) => (testIdPrefix ? `${testIdPrefix}-${row}` : undefined);

  return (
    <FloatingToolbar
      ref={pill}
      x={placement?.x ?? 0}
      y={placement?.y ?? 0}
      side={placement?.side ?? "above"}
      visible={visible}
      scale={scale}
      maxWidth={view.w > 0 ? floatingToolbarMaxWidth({ w: view.w, h: view.h }, scale) : undefined}
      aria-label="Selection actions"
      className={visible ? "pointer-events-auto" : undefined}
    >
      {content}
      {content ? <ToolbarSeparator className={PILL_RULE} /> : null}
      {canDuplicate ? (
        <ToolbarButton
          data-testid={testId("duplicate")}
          aria-label="Duplicate"
          title="Duplicate"
          className={PILL_CELL}
          onClick={() => port.nodes({ kind: "duplicate", ids: port.selection().ids })}
        >
          <Copy />
        </ToolbarButton>
      ) : null}
      {canDelete ? (
        <ToolbarButton
          data-testid={testId("delete")}
          aria-label="Delete"
          title="Delete"
          className={PILL_CELL}
          onClick={() => port.nodes({ kind: "delete", ids: port.selection().ids })}
        >
          <Trash2 />
        </ToolbarButton>
      ) : null}
    </FloatingToolbar>
  );
}
