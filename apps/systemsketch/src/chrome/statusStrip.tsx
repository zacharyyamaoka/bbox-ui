// src/chrome/statusStrip.tsx — the bottom-right cluster: grid · frames ·
// problems · zoom (a menu, flanked by optional zoom± buttons) · dev · help.
//
// `@trunk/components/statusStrip` takes a flat `StatusStripItem[]` plus one
// `children` readout and stamps `data-slot="status-strip"`; the host decides
// what the launchers ARE and what "active" means. This file is that decision
// for SystemSketch.
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
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CircleHelp, Code2, Frame, Grid3x3, Minus, Plus } from "lucide-react";
import { useEditor, useValue } from "tldraw";

import type { MenuAction, MenuGroupSpec } from "@trunk/editor/appMenu";
import { readAppearancePreferences } from "@trunk/editor/appearancePreferences";
import { Button } from "@trunk/components/button";
import { ProblemsBadge } from "@trunk/editor/problemsPanel";
import { StatusStrip, type StatusStripItem } from "@trunk/editor/statusStrip";

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
export type ChromePanel = "frames" | "problems" | "inspector";

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

/**
 * WHY the test id sits on a WRAPPER around each item's icon rather than on
 * the button itself: `statusStrip.tsx`'s `StripButton` stamps `aria-label`,
 * `aria-pressed`, `aria-expanded`, `aria-controls` and `title` — and no
 * `data-testid` at all (read it: lines 93-122; `StatusStripItem` has no
 * `testIdPrefix` field either). The kit's own universal rule is
 * "`testIdPrefix?: string` — no test id derived from display text", which
 * this surface simply has not grown yet. A wrapper inside the button carries
 * the id onto a real element the acceptance suite can click, and the click
 * bubbles to the button that owns the behaviour — no fork of the kit, no
 * second button.
 *
 * OWED UPSTREAM: `StatusStripProps.testIdPrefix`, stamping
 * `${prefix}-${item.id}` on each `StripButton`. At that point this wrapper
 * comes out and `testIdPrefix="ss-status"` goes in.
 */
function idTag(testId: string, icon: ReactNode) {
  return (
    <span data-testid={testId} className="inline-flex items-center justify-center">
      {icon}
    </span>
  );
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
  const editor = useEditor();
  const zoom = useValue("ss zoom", () => Math.round(editor.getZoomLevel() * 100), [editor]);
  const showZoomButtons = useShowZoomButtons();

  // Reuses `useStockMenus()` — the same builder the burger's View ▸ and
  // Preferences ▸ submenus render from — rather than a second `useActions()`
  // subscription: one live read of tldraw's grid/zoom state, shared by every
  // surface that shows it.
  const stock = useStockMenus();
  const gridAction = actionById(stock.preferences, "toggle-grid");
  const zoomInAction = actionById(stock.view, "zoom-in");
  const zoomOutAction = actionById(stock.view, "zoom-out");
  const zoomRows = useMemo(
    () => ZOOM_ROW_IDS.map((id) => actionById(stock.view, id)).filter((action): action is MenuAction => action !== undefined),
    [stock.view],
  );

  // WHY named, individually-typed consts rather than one array literal with
  // inline ternaries: TypeScript infers a chained `.filter`'s callback
  // parameter from the LITERAL's own element type, not from a `const items:
  // (StatusStripItem | null)[]` annotation on the final assignment — so an
  // inline `cond ? {…} : null` array widens `icon` to the narrowest object
  // shape it saw instead of `StatusStripItem`'s own `ReactNode`. Typing each
  // row on its own `const` first is what makes every row genuinely a
  // `StatusStripItem | null` before the array (and the filter) ever forms.
  const gridItem: StatusStripItem | null = gridAction
    ? {
        id: "grid",
        label: "Grid",
        icon: idTag("ss-status-grid", <Grid3x3 className="size-4" aria-hidden="true" />),
        active: gridAction.checked === true,
        onSelect: gridAction.run,
      }
    : null;
  const framesItem: StatusStripItem = {
    id: "frames",
    label: "Frames",
    icon: idTag("ss-status-frames", <Frame className="size-4" aria-hidden="true" />),
    active: open === "frames",
    onSelect: () => onToggle("frames"),
    controlsId: panelId,
  };
  const problemsItem: StatusStripItem = {
    id: "problems",
    // The count belongs to the compound icon, not to `badge` — the kit
    // splits those two on purpose (`StatusStripItem.badge`'s own doc).
    label: problemCount === 1 ? "1 problem" : `${problemCount} problems`,
    icon: idTag("ss-status-problems", <ProblemsBadge count={problemCount} />),
    active: open === "problems",
    onSelect: () => onToggle("problems"),
    controlsId: panelId,
  };
  const devItem: StatusStripItem = {
    id: "dev",
    label: "Dev",
    icon: idTag("ss-status-dev", <Code2 className="size-4" aria-hidden="true" />),
    active: devPanelOpen,
    onSelect: onToggleDevPanel,
    // No `controlsId`: the dev panel is a modal dialog, not an inline
    // disclosure this button expands in place, so `aria-controls` /
    // `aria-expanded` (which only fire when `controlsId` is set — this
    // kit's own `StripButton`) would claim a relationship that is not
    // there.
  };
  const helpItem: StatusStripItem | null = stock.openKeyboardShortcuts
    ? {
        id: "help",
        label: "Keyboard shortcuts",
        icon: idTag("ss-status-help", <CircleHelp className="size-4" aria-hidden="true" />),
        onSelect: stock.openKeyboardShortcuts,
        // No `active`/`controlsId` either: same reasoning as `dev` above,
        // one step further — this one doesn't even toggle a panel this
        // component owns, it opens tldraw's own dialog.
      }
    : null;
  const items: StatusStripItem[] = [gridItem, framesItem, problemsItem, devItem, helpItem].filter(
    (item): item is StatusStripItem => item !== null,
  );

  // The stacked form's column count (`chrome/overlay.tsx`, STACKED_STRIP_CLASS).
  // `StatusStrip` puts `Math.ceil(n / 2)` items before the readout, separators
  // between neighbours: row 1 is `2*mid - 1` children, row 2 (readout first)
  // is `2*(n - mid) + 1`. The larger of the two, never a bare 5 — grid and
  // help are conditional (`gridAction`, `stock.openKeyboardShortcuts`).
  const leadingCount = Math.ceil(items.length / 2);
  const stackedColumns = Math.max(1, 2 * leadingCount - 1, 2 * (items.length - leadingCount) + 1);

  return (
    // `contents`: the wrapper only carries the custom property down to the
    // trunk's strip, which stays the flex item of the corner row.
    <div className="contents" style={{ "--ss-strip-columns": stackedColumns } as CSSProperties}>
    <StatusStrip items={items}>
      {/* The readout slot. Zach, 2026-09-20, reversing the prior "no zoom
          menu" decision recorded here (see the file header): the % is now a
          menu trigger (`ZoomMenu`, built from `stockMenus.ts`'s own
          `view-zoom` rows), optionally flanked by zoom−/zoom+ buttons when
          `showZoomButtons` is on — the appearance preference Settings ▸
          Appearance already exposed a control for, that nothing read until
          this file. */}
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
    </StatusStrip>
    </div>
  );
}
