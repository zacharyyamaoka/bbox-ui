// src/chrome/statusStrip.tsx — the bottom-right cluster's HOST half: grid ·
// frames · problems · zoom (a menu, flanked by optional zoom± buttons) · dev ·
// help.
//
// Since B-SHELL-P1 the strip WINDOW is the shell's (`@trunk/shell/
// shellStatusStrip`, lifted from this file at 75991ce): the Frames/Problems
// launchers, the zoom readout over the port's `viewport().zoom`, and the
// stacked form's column count. This file hands it what speaks tldraw — the grid
// toggle (a tldraw preference), dev, help (tldraw's shortcuts dialog) and the
// zoom menu's rows (tldraw's stock `view-zoom` actions).
//
// WHY grid/help joined frames/problems/dev here (Zach, 2026-09-20, against
// old SystemSketch's bottom-right strip screenshot: grid toggle · warning
// triangle · zoom % · `</>` dev toggle · `?` help): this app already had
// frames and problems, which the donor's strip did not — dropping either
// would lose a surface this rebuild added on purpose. `items` is
// `[grid, frames, problems, dev, help]`, and `StatusStrip` splits it around
// the zoom readout at `Math.ceil(items.length / 2)` = 3, giving
// `grid · frames · problems | zoom | dev · help` — 3 and 2. That keeps the
// two PANEL launchers (frames, problems) adjacent to each other rather than
// split across the zoom readout, and keeps grid (a canvas toggle, like the
// donor's leading item) on the same side as them; dev and help stay
// trailing, exactly the donor's own order for that pair.
import { useMemo, useState } from "react";
import { CircleHelp, Code2, Grid3x3, Minus, Plus } from "lucide-react";

import type { MenuAction, MenuGroupSpec } from "@trunk/editor/appMenu";
import { readAppearancePreferences } from "@trunk/editor/appearancePreferences";
import { Button } from "@trunk/components/button";
import type { StatusStripItem } from "@trunk/editor/statusStrip";
import type { ShellPanel } from "@trunk/shell/shellPanelRail";
import { ShellStatusStrip, stripIcon } from "@trunk/shell/shellStatusStrip";

import { useStockMenus } from "./FileMenu";
import { ZoomMenu } from "./ZoomMenu";

/** Which right-hand panel is open. One at a time, or none.
 *
 *  `inspector` is RULING 9's host — Zach: "the eye visibility control for this
 *  is in the right hand inspector menu." It is a third surface of the SAME
 *  one-at-a-time rail (`./panels.tsx`), reached from that rail's own surface
 *  switcher rather than from a sixth launcher here.
 *
 *  WHY no launcher in this strip, which is where Frames and Problems get
 *  theirs and is the obvious place to put it — MEASURED in the running app at
 *  1400x900, keyless (2026-09-21): a sixth cell takes the strip from 301.7px
 *  to 339.7px, and the corner row it rides in has only ~7px of slack between
 *  the dock's right edge (870.5) and tldraw's licence watermark (1296). With
 *  the cell added `placeCornerCluster` reported `above-licence` and the
 *  cluster left the corner row — clearance -31.1px. That is exactly the
 *  placement Zach rejected on 2026-09-19 ("please move the right corner menu
 *  to be truly in the right corner right now its above this text 'get a
 *  license for production'"), and `src/corner.smoke.test.tsx` and
 *  `src/chromeSize.smoke.test.tsx` pin it. So the third surface pays no
 *  corner width; see `./panels.tsx`'s `SurfaceSwitch`. */
export type ChromePanel = ShellPanel;

export interface SystemSketchStatusStripProps {
  open: ChromePanel | null;
  onToggle(panel: ChromePanel): void;
  /** Rides the Problems triangle as its count chip. */
  problemCount: number;
  /** The panel element's own id, for `aria-controls`/`aria-expanded`. */
  panelId: string;
  /**
   * WHY this is its own boolean rather than a third `ChromePanel`: the dev
   * panel (`chrome/DevMenu/devtools.tsx`) is `@trunk/components/devPanel`'s own
   * dialog, not another member of `./panels.tsx`'s one-at-a-time right-rail
   * `SystemSketchPanel` — pressing it must not close Frames or Problems, and
   * pressing Frames must not close it. Overloading `ChromePanel` would make
   * those two genuinely different toggle policies look like one. The
   * overlay owns the boolean; this file only renders the button that flips
   * it.
   */
  devPanelOpen: boolean;
  onToggleDevPanel(): void;
}

/** True for a plain row inside a `MenuGroupSpec`, false for a submenu entry
 *  — `useStockMenus()`'s groups never nest a submenu under View ▸ or
 *  Preferences ▸, but the type allows it, so this narrows honestly instead
 *  of casting. */
function isMenuAction(item: MenuGroupSpec["items"][number]): item is MenuAction {
  return !("submenu" in item);
}

/** The `MenuAction` named `id`, wherever it lives inside `groups` — read by
 *  id rather than by array position so a reordering inside `stockMenus.ts`
 *  (which groups sit where) cannot silently break this file. `undefined`
 *  when this build of tldraw does not ship the action, the same "a row for
 *  an action that does not exist is a row that does nothing" rule
 *  `stockMenus.ts`'s own `actionRow` documents. */
function actionById(groups: readonly MenuGroupSpec[], id: string): MenuAction | undefined {
  for (const group of groups) {
    for (const item of group.items) {
      if (isMenuAction(item) && item.id === id) return item;
    }
  }
  return undefined;
}

const ZOOM_ROW_IDS = ["zoom-in", "zoom-out", "zoom-to-100", "zoom-to-fit", "zoom-to-selection"] as const;

/** The browser's own storage, or `null` when even touching it throws — the
 *  same guard `appSettings.tsx`'s `viewerStorage` uses, for the same
 *  reason (a blocked third-party context can throw on the PROPERTY access
 *  itself, before any method is called). */
function viewerStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Wires the ALREADY-EXISTING `showZoomButtons` appearance preference
 * (`@trunk/components/appearancePreferences`, storage key
 * `systemsketch.appearance.v1`) — shipped with a control in Settings ▸
 * Appearance that, until now, nothing read. Read once at mount, exactly the
 * shape `appSettings.tsx`'s `useAppSettings` already uses for this app's
 * other settings: its own doc comment states the reasoning this hook
 * inherits — a second window flipping a preference mid-session and silently
 * changing this window's chrome under it is a worse failure than the reload
 * it costs to pick the change up, and `settings.smoke.test.tsx` already
 * proves every OTHER preference in this dialog that way ("survives a
 * remount", never "propagates live"). This file does not import
 * `appSettings.tsx` (outside this lane's write set) — `usePersistedRecord`'s
 * read-once-at-mount shape is simply repeated here, one field, no write
 * path needed on this side.
 */
function useShowZoomButtons(): boolean {
  const [value] = useState(() => readAppearancePreferences(viewerStorage()).showZoomButtons);
  return value;
}

export function SystemSketchStatusStrip({
  open,
  onToggle,
  problemCount,
  panelId,
  devPanelOpen,
  onToggleDevPanel,
}: SystemSketchStatusStripProps) {
  const showZoomButtons = useShowZoomButtons();

  const stock = useStockMenus();
  const gridAction = actionById(stock.preferences, "toggle-grid");
  const zoomInAction = actionById(stock.view, "zoom-in");
  const zoomOutAction = actionById(stock.view, "zoom-out");
  const zoomRows = useMemo(
    () => ZOOM_ROW_IDS.map((id) => actionById(stock.view, id)).filter((action): action is MenuAction => action !== undefined),
    [stock.view],
  );

  // grid · [frames · problems, the shell's] | zoom | dev · help — the order
  // the file header argues for, unchanged by the lift.
  const leading = useMemo<StatusStripItem[]>(
    () =>
      gridAction
        ? [
            {
              id: "grid",
              label: "Grid",
              icon: stripIcon("ss-status-grid", <Grid3x3 className="size-4" aria-hidden="true" />),
              active: gridAction.checked === true,
              onSelect: gridAction.run,
            },
          ]
        : [],
    [gridAction],
  );
  const trailing = useMemo<StatusStripItem[]>(() => {
    const items: StatusStripItem[] = [
      {
        id: "dev",
        label: "Dev",
        icon: stripIcon("ss-status-dev", <Code2 className="size-4" aria-hidden="true" />),
        active: devPanelOpen,
        onSelect: onToggleDevPanel,
      },
    ];
    if (stock.openKeyboardShortcuts) {
      items.push({
        id: "help",
        label: "Keyboard shortcuts",
        icon: stripIcon("ss-status-help", <CircleHelp className="size-4" aria-hidden="true" />),
        onSelect: stock.openKeyboardShortcuts,
      });
    }
    return items;
  }, [devPanelOpen, onToggleDevPanel, stock.openKeyboardShortcuts]);

  return (
    <ShellStatusStrip
      panel={open}
      onTogglePanel={onToggle}
      panelId={panelId}
      problemCount={problemCount}
      leading={leading}
      trailing={trailing}
      testIdPrefix="ss-status"
      // The readout slot. Zach, 2026-09-20, reversing the prior "no zoom
      // menu" decision: the % is a menu trigger (`ZoomMenu`, built from
      // `stockMenus.ts`'s own `view-zoom` rows), optionally flanked by
      // zoom−/zoom+ buttons when `showZoomButtons` is on — the appearance
      // preference Settings ▸ Appearance exposes a control for.
      readout={(zoom) => (
        <span className="flex items-center gap-0.5">
          {showZoomButtons && zoomOutAction ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Zoom out"
              title="Zoom out"
              data-testid="ss-status-zoom-out"
              onClick={() => zoomOutAction.run()}
            >
              <Minus aria-hidden="true" />
            </Button>
          ) : null}
          <ZoomMenu rows={zoomRows} zoom={zoom} />
          {showZoomButtons && zoomInAction ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Zoom in"
              title="Zoom in"
              data-testid="ss-status-zoom-in"
              onClick={() => zoomInAction.run()}
            >
              <Plus aria-hidden="true" />
            </Button>
          ) : null}
        </span>
      )}
    />
  );
}
