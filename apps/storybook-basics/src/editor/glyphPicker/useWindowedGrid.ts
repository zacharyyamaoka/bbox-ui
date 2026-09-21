/**
 * src/editor/glyphPicker/useWindowedGrid.ts — the trunk-lineage copy of
 * packages/glyph-picker/src/useWindowedGrid.ts (see glyphPicker.tsx's header for why
 * two copies exist). Identical but for its import paths
 *
 * Ported BY VALUE from SystemSketch's `iconPicker/useWindowedGrid.ts` — the
 * whole reason this exists there still applies here unchanged: with no
 * virtualisation, painting all 1,818 Lucide cells (and, unfiltered, the
 * Emoji tab's 1,914 across nine groups) straight into the DOM measured
 * ~473ms to first paint / 11,065 nodes — the plan's own "1,818 icons paint
 * in one frame via the windowed grid" line is what this buys. Every
 * `.GlyphPicker-grid` is a fixed 12-column grid of equal-height rows, so
 * this renders only the rows intersecting the scroll viewport (± overscan)
 * and holds the rest of the scroll height with top/bottom spacers — the
 * standard technique, hand-rolled rather than a new dependency (this
 * repo's own off-the-shelf-first rule still points at a real virtualiser
 * for anything beyond a uniform grid; this donor already proved a fixed
 * 12-column grid doesn't need one).
 *
 * Only the CSS class name changed (`BlockIconPicker-body` →
 * `GlyphPicker-body`, this package's own scope); the measurement and
 * scheduling logic is untouched.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export const GRID_COLUMNS = 12;
const OVERSCAN_ROWS = 3;
/** Rows rendered before the first real measurement lands — see the WHY below. */
const INITIAL_ROWS = 6;

interface GridRange {
  start: number;
  end: number;
  topPad: number;
  bottomPad: number;
}

function initialRange(itemCount: number): GridRange {
  return { start: 0, end: Math.min(itemCount, GRID_COLUMNS * INITIAL_ROWS), topPad: 0, bottomPad: 0 };
}

/**
 * One windowed grid. Each call owns its own scroll/resize listeners on its
 * nearest `.GlyphPicker-body` ancestor (found via `closest`, not a prop
 * threaded down from the popover root) so the Icons grid, the Emoji tab's
 * filtered list, and each of its per-group grids in the unfiltered browse
 * view can all window independently off the one shared scroll container.
 *
 * WHY a conservative `INITIAL_ROWS` guess instead of measuring before the
 * first render: React has nothing to measure on the very first render (the
 * grid element doesn't exist in the DOM yet). Rendering a small fixed guess
 * keeps that first commit cheap regardless, and `useLayoutEffect` corrects
 * it against the real row height/scroll position before the browser paints
 * — so the guess itself is never what the user sees, only what a harness
 * would catch counting DOM nodes mid-commit.
 */
export function useWindowedGrid(itemCount: number) {
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [range, setRange] = useState<GridRange>(() => initialRange(itemCount));

  const recompute = useCallback(() => {
    if (!gridEl) return;
    const host = gridEl.closest<HTMLElement>(".GlyphPicker-body");
    if (!host) return;
    const style = getComputedStyle(gridEl);
    const gap = parseFloat(style.rowGap || style.gap || "0") || 0;
    const columnWidth = (gridEl.clientWidth - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    const rowHeight = columnWidth + gap;
    if (!(rowHeight > 0) || itemCount === 0) {
      setRange(initialRange(itemCount));
      return;
    }
    const totalRows = Math.ceil(itemCount / GRID_COLUMNS);
    // Grid's own top within the scroll container's content, in scroll
    // coordinates — not `offsetTop` (unreliable across offsetParents when a
    // sibling section like Recent sits above this grid, not an ancestor).
    const gridTop = gridEl.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop;
    const viewTop = Math.max(0, host.scrollTop - gridTop);
    const viewBottom = Math.max(0, host.scrollTop + host.clientHeight - gridTop);
    const firstRow = Math.max(0, Math.floor(viewTop / rowHeight) - OVERSCAN_ROWS);
    const lastRow = Math.min(totalRows, Math.ceil(viewBottom / rowHeight) + OVERSCAN_ROWS);
    setRange({
      start: firstRow * GRID_COLUMNS,
      end: Math.min(itemCount, lastRow * GRID_COLUMNS),
      topPad: firstRow * rowHeight,
      bottomPad: Math.max(0, (totalRows - lastRow) * rowHeight),
    });
  }, [gridEl, itemCount]);

  // Runs before paint so the `INITIAL_ROWS` guess above is corrected — not
  // flashed — the first time this grid mounts or its item count changes (a
  // new filter query, a tab switch onto a freshly-measured grid).
  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    if (!gridEl) return;
    const host = gridEl.closest<HTMLElement>(".GlyphPicker-body");
    if (!host) return;
    let frame = 0;
    const onScrollOrResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recompute);
    };
    host.addEventListener("scroll", onScrollOrResize, { passive: true });
    const observer = new ResizeObserver(onScrollOrResize);
    observer.observe(host);
    observer.observe(gridEl);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("scroll", onScrollOrResize);
      observer.disconnect();
    };
  }, [gridEl, recompute]);

  return { gridRef: setGridEl, ...range };
}
