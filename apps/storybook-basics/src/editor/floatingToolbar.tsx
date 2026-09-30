import type * as React from "react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import type { SelectionMenuSide } from "./floatingToolbar.placement";
import { Toolbar } from "./toolbar";

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

/**
 * THE PILL SURFACE — dark ink-on-#1e1e1e, in BOTH colour schemes, always.
 *
 * WHY a literal hex rather than `bg-foreground text-background`, which is
 * what this file shipped until 2026-09-20: `foreground`/`background` are not
 * a pill colour, they are an INVERSION OF THE PAGE. `globals.css:101-102`,
 * inside `@media (prefers-color-scheme: dark)`, sets
 * `--foreground: oklch(0.985 0 0)` — that is `#fafafa` — so on a dark canvas
 * the pill rendered near-WHITE with near-black icons. Measured in the running
 * app at 4340, dark scheme: `backgroundColor: oklch(0.985 0 0)`. That is
 * tldraw's stock floating-toolbar look, and it is the thing Zach named:
 * "It feels like you are making this look like the tldraw stock floating
 * toolbar which I don't like ... Our goal was for it to be more like system
 * sketch which is copying the figjam floating tool bar."
 *
 * FigJam's own DOM traces at `bg=rgb(30,30,30)` with `color=rgb(255,255,255)`
 * (`/home/bam/systemsketch/docs/assets/figjam-chrome-traced.json`), and the
 * donor pins exactly that pair in BOTH themes with the reason written at the
 * seam (`src/theme/tokens.css:109-128`): following tldraw's tooltip flip
 * "would put the appearance controls' white glyphs on a white bar."
 *
 * WHY exported constants rather than the donor's `--systemsketch-pill-*`
 * custom properties declared on the app root: the popovers this pill opens
 * PORTAL OUT of its DOM subtree, so a variable scoped to the pill element is
 * invisible to its own menu — the donor says so at `pillSkins.css:15-23` and
 * scopes the tokens on `.systemsketch-app`, "the nearest ancestor both the bar
 * and its portaled popovers share". Declaring that root scope means editing
 * `globals.css`, which another lane owns this round. A literal shared through
 * the module system reaches the portaled popover just as reliably AND is
 * theme-independent by construction — there is no token left for a
 * `prefers-color-scheme` block to flip. When the root scope lands, these two
 * constants become `var(--bbox-pill-surface)` / `var(--bbox-pill-ink)` and
 * nothing else moves.
 *
 * That pair is ALREADY declared here, ahead of the root scope, for one
 * consumer: `controlPanel.tsx`'s chosen chip, which inverts — the ink for
 * its fill, the surface for its word (see that file's change 4). CSS has no
 * "the background behind me" value, and `currentColor` is no substitute for
 * "the ink around me" either: measured, a chip painted `bg-current` with its
 * text set to the surface came out #1e1e1e on #1e1e1e, 1:1, because
 * `currentColor` is the element's OWN `color`, which the chip had just set.
 * So the skin that sets the pair says both once more as custom properties,
 * and the panel falls back to the theme's `--popover` /
 * `--popover-foreground` when no skin declared them — the exact colours an
 * unskinned popover already paints in. The hexes are written twice on this
 * line on purpose: Tailwind v4 scans source for literal class names, so a
 * `bg-[${hex}]` built from `PILL_SURFACE_HEX` would never be generated.
 * `PaintFace.stories.tsx` pins that the class string still contains the
 * constant.
 */
export const PILL_SURFACE_HEX = "#1e1e1e";
export const PILL_SURFACE =
  "bg-[#1e1e1e] text-white [--bbox-pill-surface:#1e1e1e] [--bbox-pill-ink:#fff]";

/** FigJam's three-layer float, traced verbatim. The 10px-offset middle layer
 *  is what lifts the bar off the canvas; Tailwind's `shadow-lg` is a
 *  two-layer `-3px`/`-4px` spread and reads flat beside it. */
export const PILL_SHADOW =
  "shadow-[0_0_0.5px_rgb(0_0_0/12%),0_10px_16px_rgb(0_0_0/12%),0_2px_5px_rgb(0_0_0/15%)]";

/** 13px on the bar and on every popover it opens — traced `r=13px` on the
 *  FigJam toolbar and on all five of its traced popovers. */
export const PILL_RADIUS = "rounded-[13px]";

/**
 * The one class every popover the pill opens must wear — the donor's rule,
 * ported. There, it is literally one CSS class
 * (`.systemsketch-appearance__panel`, `appearance.css:143-155`) re-declaring
 * the bar's four surface tokens, worn by every appearance popover
 * (`ContextualControls.tsx:278`) AND by the Arrange popover
 * (`SystemSketchChrome.tsx:456`), which is not an appearance control at all.
 * Without it the trigger and its own menu do not share a surface: measured
 * before this change, the bar was `oklch(0.985 0 0)` and the open panel
 * `oklch(0.205 0 0)` — a light pill with a dark menu hanging off it.
 *
 * `ring-0` because the stock popover ring is `ring-foreground/10`, a PAGE
 * token: on a fixed dark surface in light mode it draws a near-black hairline.
 */
export const PILL_POPOVER = `${PILL_SURFACE} ${PILL_SHADOW} ${PILL_RADIUS} border-0 ring-0`;

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
  /**
   * The host's interface-scale factor (1 = 100%). Applied as a `scale()`
   * composed INSIDE the same `transform` as the translate below.
   *
   * WHY it has to travel as a prop rather than as CSS, measured: this
   * component writes `transform` INLINE, and an inline transform beats any
   * stylesheet rule, so an `interface-scale.css` rule can never reach it. The
   * standalone `scale:` property is not a substitute either — it composes
   * OUTSIDE `transform`, so it re-multiplies the translate and walks the pill
   * off its own selection by (scale - 1) x the offset. Composing both in ONE
   * transform, with `transform-origin: 0 0`, is what keeps the pill anchored
   * to the point the placement policy chose while still growing with the rest
   * of the chrome. The donor does the same thing for the same reason
   * (`systemsketch-chrome.css:838-846`).
   */
  scale?: number;
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
  scale = 1,
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
        // WHY `items-center` and not `items-stretch`, which is what this line
        // carried until 2026-09-20 and is the whole of defect 1: `cn` is
        // `twMerge`, this className is passed THROUGH to `Toolbar`, and
        // `Toolbar`'s own root sets `items-center` — so the class named here
        // wins the merge and `align-items: stretch` reached the bar. Stretch
        // does nothing to a flex child that already has a definite height; it
        // drops it at CROSS-START instead. Measured in the running app at
        // 4340 with the old line, dark scheme, one geo box selected:
        //   ss-style-* (h28, inside an items-center wrapper)  centreY 20
        //   ss-selection-arrange (h28, a direct bar child)    centreY 14
        //   ss-selection-focus/duplicate/delete (h32)         centreY 16
        // Three baselines in a 40px bar. The cause is this one word; the
        // cells' matching 40px heights (selectionClusters.tsx) are the other
        // half — FigJam's every cell fills the bar, traced 40px tall.
        "absolute top-0 left-0 flex flex-wrap items-center px-1 transition-opacity duration-75 ease-in-out",
        PILL_SURFACE,
        PILL_SHADOW,
        PILL_RADIUS,
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
      style={{
        // ONE transform: translate then scale, origin at the placed point, so
        // growing the pill never moves the corner the placement policy chose.
        transform: scale === 1 ? `translate(${x}px, ${y}px)` : `translate(${x}px, ${y}px) scale(${scale})`,
        transformOrigin: "0 0",
        maxWidth,
      }}
    >
      {children}
    </Toolbar>
  );
}
