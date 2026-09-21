"use client";

// src/components/statusStrip.tsx — the bottom-right cluster
// (docs/menus/screenshots/06/07: frames icon · problems triangle+"99+" ·
// zoom readout · "</>" with a green dot · "?").
//
// Ported from /home/bam/systemsketch/src/SystemSketchUtilities.tsx:655-731
// — the donor's `systemsketch-utility-strip`, itself already a
// `TldrawUiToolbar` (roving-focus toolbar) of icon buttons: board-overview
// trigger, diagnostics trigger with its `problemCount > 99 ? '99+' :
// problemCount` badge, an optional zoom-out/`DefaultZoomMenu`/zoom-in
// cluster, a dev trigger with a "Preview available" dot, and a help
// trigger. This restates that same shape as data (`StatusStripItem[]`)
// instead of one hand-wired JSX literal per surface, so a host wires up
// however many launchers it actually has instead of this component
// hardcoding five.
//
// Stock-part table (docs/menus/MENU-KIT-DESIGN.md §5, "Roving-focus bar
// container"): this is `Toolbar.Root`/`Toolbar.Button`/`Toolbar.Separator`
// from `@base-ui/react/toolbar` via the trunk's own `toolbar.tsx` — the
// EXACT donor primitive (`TldrawUiToolbar` IS a roving-focus toolbar; this
// kit's `Toolbar` wraps the same contract over Base UI instead), never a
// new bespoke button row. "It is a toggle-bar of panel launchers with
// badges; type it that way" — `active`/`onSelect` is `aria-pressed` on a
// `ToolbarButton`, not a plain `<button>`.
import { Fragment, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "./toolbar";

/**
 * The strip's cell, sized to match the dock's (toolDock.tsx's
 * `TOOL_DOCK_CELL_HEIGHT` and its WHY, which carries the measurements): the
 * dock and this strip share the bottom row of the app, so a 40px dock cell
 * beside a 32px strip cell would trade Zach's "everything feels a bit off"
 * for a bottom row that is visibly two different sizes.
 *
 * WHY it is a second literal rather than an import from `toolDock`: the
 * status strip is a peer surface, not a part of the dock — a strip that
 * imported the dock would drag a dropdown menu, a popover and every family
 * type into any host that only wants the strip. The two constants are pinned
 * EQUAL by measurement instead
 * (apps/systemsketch/src/chromeSize.smoke.test.tsx asserts the two rendered
 * cells are the same height in the real app), which is the check that
 * actually matters — a shared constant would still let one of them be
 * overridden downstream without anyone noticing.
 *
 * WHY the width does not move (36px, as before): growing this strip widens
 * the bottom-right cluster, and `placeCornerCluster`
 * (apps/systemsketch/src/chrome/overlay.tsx) has only 13.89px of measured
 * clearance between it and the dock at 1400 x 900 before the whole row falls
 * through to the "above-licence" placement Zach rejected.
 */
const STRIP_CELL_CLASS = "h-10 w-9 px-0 [&_svg:not([class*='size-'])]:size-[18px]";

export interface StatusStripItem {
  id: string;
  icon: ReactNode;
  label: string;
  /** A plain numeric/text badge — e.g. a small count unrelated to the
   *  Problems-specific triangle+"99+" compound (that one is `ProblemsBadge`,
   *  passed whole via `icon` instead — see `problemsPanel.tsx`). */
  badge?: string | number;
  /** The dev-trigger's small dot (donor: `systemsketch-preview-indicator`,
   *  "a new Preview is available"). Generalized past "there's an update"
   *  into three tones so a host can reuse it for e.g. a saved/unsaved state. */
  indicator?: "success" | "warning" | "danger";
  active?: boolean;
  onSelect(): void;
  controlsId?: string;
}

export interface StatusStripProps {
  items: readonly StatusStripItem[];
  /**
   * The readout slot — e.g. the host's own zoom percentage + menu (donor:
   * `DefaultZoomMenu`, flanked by optional zoom±). Renders as its own
   * segment splitting `items` roughly down the middle
   * (`Math.ceil(items.length / 2)`), which is "ours, ad hoc": the design
   * doc's own interface has one flat `items` array and one `children` slot
   * with no position field, and splitting in half is what reproduces the
   * donor's actual layout (frames · problems | zoom | dev · help — 2 and 2)
   * without this component hardcoding which two items come first. A host
   * with an odd item count or a different desired split still gets a
   * reasonable middle segment; one that cares about the exact split point
   * can always pass `children` as `undefined` and fold the readout into its
   * own `items` icons instead.
   */
  children?: ReactNode;
}

function ItemBadge({ value }: { value: string | number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] leading-none font-bold text-white"
    >
      {value}
    </span>
  );
}

const INDICATOR_CLASS: Record<NonNullable<StatusStripItem["indicator"]>, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-destructive",
};

function ItemIndicator({ tone }: { tone: NonNullable<StatusStripItem["indicator"]> }) {
  return (
    <span
      aria-hidden="true"
      className={cn("absolute top-0.5 right-0.5 size-1.5 rounded-full", INDICATOR_CLASS[tone])}
    />
  );
}

function StripButton({ item }: { item: StatusStripItem }) {
  return (
    <ToolbarButton
      aria-label={item.label}
      // WHY the explicit `"true"`/`"false"` rather than `active || undefined`
      // (that presence-only idiom is right for a STYLING data-attribute —
      // `branchChip.tsx`'s `data-active` WHY — but wrong for the a11y
      // attribute itself): a genuine toggle button (`active` a real boolean,
      // even `false`) must announce its OFF state, not go silent; an item
      // that never toggles at all (`active` simply omitted, e.g. a plain
      // "?" help launcher) correctly gets no `aria-pressed` at all, since
      // it isn't a toggle.
      aria-pressed={item.active === undefined ? undefined : item.active}
      aria-expanded={item.controlsId ? Boolean(item.active) : undefined}
      aria-controls={item.active ? item.controlsId : undefined}
      title={item.label}
      onClick={item.onSelect}
      // WHY `overflow: visible` (design doc §3.3, statusStrip bullet, kept
      // verbatim): the badge/indicator both ride OUTSIDE this button's own
      // box (`-top-1 -right-1` etc) — the default `overflow-clip` most
      // buttons in this kit use (see `bar.tsx`'s `cellClass`) would clip
      // exactly the corner these two are drawn in.
      className={cn(STRIP_CELL_CLASS, "relative overflow-visible")}
    >
      {item.icon}
      {item.badge !== undefined ? <ItemBadge value={item.badge} /> : null}
      {item.indicator ? <ItemIndicator tone={item.indicator} /> : null}
    </ToolbarButton>
  );
}

export function StatusStrip({ items, children }: StatusStripProps) {
  const mid = children ? Math.ceil(items.length / 2) : items.length;
  const leading = items.slice(0, mid);
  const trailing = items.slice(mid);

  return (
    <Toolbar
      aria-label="Board navigation, zoom, development, and help"
      data-slot="status-strip"
      // WHY a bordered, rounded strip with hairline separators (design doc:
      // "Segmented hairline treatment, first/last rounding... all in the
      // component's own CSS, no `.tlui-*` selectors"): the donor's actual
      // visual is the same segmented pill every `Bar`-adjacent surface in
      // this kit uses, just built from `Toolbar` primitives instead of
      // hand-rolled flex + border-right-on-every-child-but-last.
      className="w-fit gap-0 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-sm"
    >
      {leading.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 ? <ToolbarSeparator /> : null}
          <StripButton item={item} />
        </Fragment>
      ))}
      {children ? (
        <>
          {leading.length > 0 ? <ToolbarSeparator /> : null}
          <span data-slot="status-strip-readout" className="flex items-center px-2 text-sm font-medium tabular-nums">
            {children}
          </span>
          {trailing.length > 0 ? <ToolbarSeparator /> : null}
        </>
      ) : null}
      {trailing.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 ? <ToolbarSeparator /> : null}
          <StripButton item={item} />
        </Fragment>
      ))}
    </Toolbar>
  );
}
