import type * as React from "react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Toolbar } from "./toolbar";
import type { SelectionMenuSide } from "./floatingToolbar.placement";

/**
 * floatingToolbar.tsx — the positioned shell for the FigJam-style pill
 * (screenshot 01, docs/menus/screenshots/01-floating-toolbar-fill-popover.png:
 * the dark rounded bar hovering above the blue selection outline).
 *
 * Ported from the SHELL half of
 * /home/bam/systemsketch/src/chrome/SelectionContextualMenu.tsx:107-224 (its
 * `PositionedSelectionMenu` function) and the paint rules at
 * /home/bam/systemsketch/src/chrome/systemsketch-chrome.css:825-926
 * (`.systemsketch-selection-menu` / `.systemsketch-selection-menu__bar`).
 * Everything ENGINE-SPECIFIC on the donor's side of that file is cut, per
 * CLAUDE.md's "The one rule the design rests on" — the donor reads
 * `editor.getSelectionRotatedScreenBounds()`, drives a `useQuickReactor`,
 * owns a ResizeObserver-backed size epoch, guards a monotonic
 * `placementPass` counter against a stale async resolution landing on a
 * detached node, and writes `--systemsketch-selection-menu-x/y` custom
 * properties imperatively from inside a `.then()` callback. None of that is
 * legal in a props-in/DOM-out core component — it is exactly the "measure,
 * react, place, gate on manipulation, guard async ordering" loop
 * docs/menus/MENU-KIT-DESIGN.md §4 ("Floating toolbar: host runs the loop
 * the kit refuses to own") assigns to the HOST. What survives here is only
 * the PAINT: a translate-positioned, opacity-faded pill whose `x`/`y`/`side`
 * are plain props the host computes by calling
 * `floatingToolbar.placement.ts`'s `placeFloatingToolbar` itself, on its own
 * clock, against its own measurements.
 *
 * WHY this renders `Toolbar` (toolbar.tsx) rather than a bare `<div>`, and
 * why that one `Toolbar` wraps ALL of `children` instead of each child
 * (a `ControlStrip`, an opacity slider, an arrange cluster) owning its own
 * root: the donor wraps the whole pill in exactly one `TldrawUiToolbar`, so
 * arrow-key roving focus travels across every cluster in the bar — from the
 * fill trigger straight through to the align trigger in screenshot 01 —
 * not just within one cluster. That is the same one-`Toolbar.Root`-per-pill
 * shape `Toolbar.stories.tsx` documents ("every one of those surfaces...
 * wants a `Toolbar` in that slot, not raw buttons"). A child that only
 * needs a boundary or a sub-grouping reaches for `ToolbarSeparator` /
 * `ToolbarGroup` (toolbar.tsx) directly; nothing here re-declares that
 * plumbing, and nothing here owns a second roving-focus root underneath it.
 */

export interface FloatingToolbarProps {
  /**
   * Computed by the host's own `placeFloatingToolbar` call, in whatever
   * local coordinate space the host's positioning container establishes —
   * the same space `placeFloatingToolbar`'s `selection`/`viewport` rects
   * are given in and its `{x, y}` result is returned in. This component
   * never re-derives or clamps either value; it only paints them.
   */
  x: number;
  y: number;
  /**
   * Which side of the selection the placement landed on. Drives nothing
   * visually by itself here (there is no caret/arrow to flip — screenshots
   * 01 and 02 both simply read "above"), but travels as `data-side` for a
   * host that wants to key an entrance transition, a screenshot diff, or a
   * test off it without re-deriving the policy client-side.
   */
  side: SelectionMenuSide;
  /**
   * Whether the current selection is on-screen and has a real measured
   * placement yet (the host's own `isSelectionOnScreen` gate, or simply
   * "no placement has resolved for this pass yet"). `false` fades and
   * disables the pill WITHOUT unmounting it — see the WHY on the rendered
   * className below for why unmounting or `display: none` would break the
   * host's own measure-then-place loop.
   */
  visible: boolean;
  /**
   * Mirrors `floatingToolbarMaxWidth(viewport, scale)` from
   * floatingToolbar.placement.ts. The host computes it (it needs the
   * viewport and the host's own interface-scale, neither of which this
   * component may read — no `window`/`document` queries), this only
   * applies it, so the CSS cap and the placement math's own assumption
   * about the pill's maximum width can never independently drift.
   */
  maxWidth?: number;
  "aria-label": string;
  /**
   * `ControlStrip`, an opacity slider, an arrange cluster — anything the
   * host wants inside one pill. Compose these as `ToolbarGroup` /
   * `ToolbarButton` / `ToolbarSeparator` (toolbar.tsx) so they participate
   * in the roving-focus root this shell provides; raw buttons dropped in
   * directly opt themselves out of arrow-key navigation silently.
   */
  children: ReactNode;
  /**
   * Host-applied styling layered on top of the shell's own — e.g. a
   * `--bbox-pill-*` token scope (docs/menus/MENU-KIT-DESIGN.md §4,
   * "Universal": "the 13 `--systemsketch-pill-*` names survive as optional
   * `--bbox-pill-*` overrides"). Never read by this file for anything of
   * its own; purely an escape hatch appended after the shell's classes.
   */
  className?: string;
  /**
   * The host measures THIS node (`getBoundingClientRect` / ResizeObserver)
   * for `placeFloatingToolbar`'s `menu` size, and attaches its own wheel
   * pass-through here (tldraw's `usePassThroughWheelEvents`, or nothing) —
   * never something this component arranges for itself. No self-
   * measurement, no pointer listeners of its own: CLAUDE.md's one rule.
   */
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Renders position as an inline `transform: translate(...)` and exposes
 * `data-side` / `data-visible` for host CSS — deliberately never
 * `position: fixed` (a host may portal this into an already-positioned
 * container that is not the viewport, e.g. a canvas surface scrolled inside
 * a larger page) and never a z-index of its own (§4: "the kit ships zero
 * z-index — the host owns layering", the drafts-bar
 * `--systemsketch-layer-modal` lesson).
 *
 * WHY opacity + `pointer-events: none`, never `display: none`, when
 * `!visible`: the same pair of rules the donor CSS states explicitly
 * (systemsketch-chrome.css:850-866) — buttons inside re-enable
 * `pointer-events` for themselves, so a hidden pill left at the default
 * `pointer-events: auto` would still answer hit tests through its own
 * children even though nothing is visibly there; and a `display: none`
 * pill reports a zero-size `getBoundingClientRect()`, which would break the
 * host's own measure-then-place loop on exactly the frame it needs to
 * re-measure this element to place it again.
 */
export function FloatingToolbar({
  x,
  y,
  side,
  visible,
  maxWidth,
  "aria-label": ariaLabel,
  children,
  className,
  ref,
}: FloatingToolbarProps) {
  return (
    <Toolbar
      ref={ref}
      aria-label={ariaLabel}
      data-slot="floating-toolbar"
      data-side={side}
      data-visible={visible}
      className={cn(
        "absolute top-0 left-0 flex flex-wrap items-stretch rounded-xl bg-foreground px-1 text-background shadow-lg transition-opacity duration-75 ease-in-out",
        // Wrap, never scroll — the same reasoning `floatingToolbarMaxWidth`'s
        // own doc comment gives (floatingToolbar.placement.ts): an
        // `overflow-x` scrollbar would turn this into a scroll container,
        // and a host wheel-redispatch hook (tldraw's
        // `usePassThroughWheelEvents`) refuses to pass a wheel event through
        // ANY scrollable descendant — canvas panning would silently stop
        // working while hovering an overflowed pill.
        "min-h-10 overflow-visible",
        !visible && "pointer-events-none opacity-0",
        visible && "opacity-100",
        className,
      )}
      style={{ transform: `translate(${x}px, ${y}px)`, maxWidth }}
    >
      {children}
    </Toolbar>
  );
}
