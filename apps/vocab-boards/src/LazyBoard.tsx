import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Board, buildGraph } from "./Board";
import { BOARD_BY_ID } from "./boards";
import { boardSize } from "./site";

/**
 * A board drawn small enough to browse, mounted only near the viewport and
 * UNMOUNTED again when it is not.
 *
 * WHY unmounting is as important as lazy mounting, and is the thing this file
 * exists for: 705 React Flow instances is tens of thousands of DOM nodes plus
 * 705 ResizeObservers and 705 zustand stores, and the page stops scrolling. But
 * mount-on-intersect ALONE only defers that — scroll to the bottom of an
 * unfiltered gallery and all 705 have intersected at some point, so all 705 are
 * still live behind you and the page is exactly as heavy as if nothing had been
 * lazy at all. `setLive(entry.isIntersecting)` is the whole fix: one observer,
 * mount on the way in, unmount on the way out. `scripts/verify.mjs` does not
 * see this path (it drives `?board=<id>`, one board, no gallery), so the proof
 * is the live `.react-flow` count measured at the top, the middle and the
 * bottom of the list — see the handoff.
 *
 * WHY `rootMargin` is a screen and a half rather than 0: a board that starts
 * mounting the moment its top edge crosses the fold arrives visibly late. This
 * has it ready before it is seen, and the same margin on the way out is the
 * hysteresis that stops a card parked exactly on the boundary from thrashing.
 */
const MOUNT_MARGIN = "1400px 0px";

/** The thumbnail's shape. Boards are wide and short — measured across all 705,
 *  the median is 524x158, i.e. 3.3:1 — so a 16:9 slot would be mostly empty
 *  background. 2.6:1 is close enough to the median that a typical board fills
 *  the box on both axes. */
export const THUMB_ASPECT = 2.6;

function useNearViewport<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setLive(entry.isIntersecting);
      },
      { rootMargin: MOUNT_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, live];
}

/**
 * One board scaled into a fixed box.
 *
 * `width` is the card's real track width, measured once by the gallery from the
 * browser's own resolved `grid-template-columns` (see `useTrackWidth`) — not
 * per card, and not by recomputing what `auto-fill` would have done.
 */
export function BoardThumb({
  boardId,
  width,
  className = "",
}: {
  boardId: string;
  width: number;
  className?: string;
}): JSX.Element {
  const entry = BOARD_BY_ID.get(boardId);
  const { w, h } = boardSize(boardId);
  const [ref, live] = useNearViewport<HTMLDivElement>();
  const graph = useMemo(
    () => (live && entry ? buildGraph(entry.spec, entry.id) : null),
    [live, entry],
  );

  const slotH = Math.max(1, Math.round(width / THUMB_ASPECT));
  // Never enlarged past the size it was authored at: the geometry is the thing
  // under review, and an upscaled board would be the only surface in the app
  // showing these boards at a size `layout.ts` never computed.
  const scale = w && h ? Math.min(width / w, slotH / h, 1) : 1;
  const dx = Math.round((width - w * scale) / 2);
  const dy = Math.round((slotH - h * scale) / 2);

  return (
    <div
      ref={ref}
      data-board-slot={boardId}
      className={`relative overflow-hidden bg-[#0e0f12] ${className}`}
      style={{ height: slotH }}
    >
      {live && graph && entry ? (
        <div
          className="vb-thumb"
          style={{ width: w, height: h, transform: `translate(${dx}px, ${dy}px) scale(${scale})` }}
        >
          <Board spec={entry.spec} boardId={entry.id} graph={graph} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One board at its authored size, mounted lazily. Used where a board is meant
 * to be READ rather than glanced at — the three boards under a mechanism on a
 * scenario page. It scrolls horizontally when the board is wider than the
 * column, because shrinking it is what makes a wire label unreadable.
 */
export function BoardFigure({ boardId }: { boardId: string }): JSX.Element {
  const entry = BOARD_BY_ID.get(boardId);
  const { w, h } = boardSize(boardId);
  const [ref, live] = useNearViewport<HTMLDivElement>();
  const graph = useMemo(
    () => (live && entry ? buildGraph(entry.spec, entry.id) : null),
    [live, entry],
  );

  // WHY an overflow flag rather than just letting it scroll: three boards sit
  // side by side under a mechanism, and boards run from 110px to 3,927px wide
  // (measured across all 705). A board wider than its third of the row looks
  // CUT rather than scrollable — nothing on screen says the rest exists. This
  // measures the real overflow (scrollWidth vs clientWidth, not a guess from
  // `w`, because the column width is whatever the layout gave it) and the
  // caller prints the board's full width beside its "open" link.
  const scroller = useRef<HTMLDivElement | null>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => setClipped(el.scrollWidth - el.clientWidth > 1);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!entry) return <div className="p-4 text-xs text-destructive">no board with id {boardId}</div>;
  return (
    <div ref={ref} className="grid gap-1">
      <div
        ref={scroller}
        data-clipped={clipped ? "yes" : "no"}
        className="vb-scroller overflow-x-auto rounded-lg border bg-[#0e0f12]"
      >
        {/* The placeholder is the board's REAL size, so the page does not
            reflow when the board swaps in and the scrollbar never lies about
            how much there is. */}
        <div style={{ width: w, height: h }}>
          {live && graph ? <Board spec={entry.spec} boardId={entry.id} graph={graph} /> : null}
        </div>
      </div>
      {clipped ? (
        <p data-testid="board-clipped" className="text-[10px] text-ink-gold/90">
          ⇄ {Math.round(w)} px wide — scroll it, or open it whole
        </p>
      ) : null}
    </div>
  );
}

/**
 * The gallery's track width, read from the browser's OWN resolution of
 * `grid-template-columns` rather than recomputed.
 *
 * WHY: the grid uses `auto-fill` with a floor, so the number of seated columns
 * is the browser's answer, not the slider's — at a narrow width it drops a
 * column instead of shrinking a card below legible (the reference viewer's
 * `GALLERY_MIN_TRACK_PX` trick). Re-deriving that arithmetic here would be a
 * second implementation of the same rule, drifting the moment either changes.
 * `getComputedStyle().gridTemplateColumns` is the used value — a list of real
 * pixel lengths — so this asks the layout engine what it did.
 */
export function useTrackWidth(ref: React.RefObject<HTMLElement | null>, deps: unknown[]): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean);
      const first = Number.parseFloat(tracks[0] ?? "");
      if (Number.isFinite(first) && first > 0) setWidth(first);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return width;
}
