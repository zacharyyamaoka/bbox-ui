// src/chrome/ZoomMenu/zoomMenu.tsx — the zoom % readout, as a menu trigger.
//
// Zach, 2026-09-20, looking at a screenshot of old SystemSketch's zoom menu
// (its status-strip zoom control opened a five-row popout: Zoom in, Zoom out,
// Zoom to 100%, Zoom to fit, Zoom to selection): reversing
// `statusStrip.tsx`'s prior "no zoom menu" decision. See that file's own
// header for the WHY of the reversal itself; this file is the menu it asked
// for.
//
// WHY the five rows are `stockMenus.ts`'s own `view-zoom` group and not a
// second hand-written table: that group already builds exactly these five
// rows from tldraw's own action table, in this order, with the shortcut this
// app's burger prints for View ▸ Zoom in / Zoom out / etc — the caller
// (`statusStrip.tsx`) passes those same `MenuAction`s straight through, so
// the burger's View ▸ submenu and this trigger can never disagree about a
// zoom row's label, order or shortcut.
//
// WHY disabled state is computed HERE rather than read off the `MenuAction`:
// tldraw's own action table (`useActions()`, which `stockMenus.ts` builds
// every row from) carries no enabled/disabled predicate for zoom-to-100 or
// zoom-to-selection — tldraw's DEFAULT UI computes that in two small
// components this app does not mount (`ZoomTo100MenuItem`,
// `ZoomToSelectionMenuItem`, tldraw's menu-items.tsx:187-222:
// `editor.getEfficientZoomLevel() === 1` and `useCanApplySelectionAction()`).
// This file reads the SAME public hook tldraw's own zoom menu reads for
// selection (`useCanApplySelectionAction`, exported from the `tldraw`
// package), and `editor.getZoomLevel()` — the exact value the trigger's own
// `${zoom}%` label is already rounded from — rather than
// `getEfficientZoomLevel()`, which intentionally lags while the camera is
// mid-move on a 500+ shape board (`debouncedZoom`). Neither this app's own
// boards nor its tests approach that threshold, so matching the readout's
// own read is simpler and never disagrees with what `${zoom}%` shows, where
// the debounced read occasionally would.
import { useMemo } from "react";
import { useCanApplySelectionAction, useEditor, useValue } from "tldraw";

import type { MenuAction } from "@trunk/editor/appMenu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@trunk/components/dropdown-menu";

export interface ZoomMenuProps {
  /** `useStockMenus().view`'s own `view-zoom` group items, five rows in the
   *  order View ▸ Zoom prints them — see the file header for why these are
   *  passed in rather than rebuilt. */
  rows: readonly MenuAction[];
  /** The rounded percentage the trigger displays — `statusStrip.tsx`'s own
   *  `Math.round(editor.getZoomLevel() * 100)`, so the label and the
   *  disabled check below can never read two different zooms. */
  zoom: number;
}

export function ZoomMenu({ rows, zoom }: ZoomMenuProps) {
  const editor = useEditor();
  const zoomedTo100 = useValue("ss zoomed to 100", () => editor.getZoomLevel() === 1, [editor]);
  const canZoomToSelection = useCanApplySelectionAction();

  const items = useMemo(
    () =>
      rows.map((row): MenuAction => {
        if (row.id === "zoom-to-100") return { ...row, disabled: zoomedTo100 };
        if (row.id === "zoom-to-selection") return { ...row, disabled: !canZoomToSelection };
        return row;
      }),
    [rows, zoomedTo100, canZoomToSelection],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="ss-status-zoom"
        aria-label={`Zoom ${zoom} percent`}
        title={`Zoom ${zoom}%`}
        className="rounded-md px-1 py-0.5 tabular-nums hover:bg-accent hover:text-accent-foreground data-popup-open:bg-accent"
      >
        {zoom}%
      </DropdownMenuTrigger>
      {/* Opens UPWARD, right-aligned — the same posture `variantSwitch.tsx`'s
          `VariantMenu` uses for the same reason: this trigger sits on the
          bottom-right row, so the list has to grow into the board rather
          than off the bottom of the screen.

          WHY a fixed `min-w-64` and not `w-max`: the trunk's default
          `w-(--anchor-width)` (`dropdown-menu.tsx`'s own
          `DropdownMenuContent`) sizes the popup to its TRIGGER's width —
          right for a submenu whose trigger is already a full row, wrong
          here where the trigger is just "100%". Left alone the popup
          inherited that ~40px width and clipped its own rows — measured
          (Zach, 2026-09-20, driving the real app): "Zoom in" painted as
          "Zoom …", "Zoom to selection" as "Zoom to s…", and every shortcut
          wrapped onto a second line. `w-max` (size to the widest row) was
          tried first and STILL clipped "Zoom in" by 2px (measured:
          scrollWidth 54px vs clientWidth 52px): the label span is a
          `flex: 1 1 0%` item, and a 0%-basis flex child does not count its
          own text width toward a `max-content`-sized ancestor, so the
          container came out exactly as wide as the chord column plus
          padding and no wider. A fixed `min-w-64` sidesteps that
          intrinsic-sizing ambiguity entirely — 256px comfortably clears the
          widest real row ("Zoom to selection" + "⇧ + 2", ~200px including
          padding) — and CSS gives `min-width` precedence over a narrower
          `width` regardless of what produced it, so a genuinely wider
          trigger is still respected. Truthful-property-rendering says an
          authored label keeps every character or shows an explicit,
          still-discoverable ellipsis; with this margin no row here should
          ever need to abbreviate at all. */}
      <DropdownMenuContent side="top" align="end" sideOffset={6} className="min-w-64" data-testid="ss-status-zoom-menu">
        {items.map((item) => (
          <DropdownMenuItem key={item.id} disabled={item.disabled} title={item.label} onClick={() => item.run()}>
            <span className="truncate">{item.label}</span>
            {item.shortcut ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
