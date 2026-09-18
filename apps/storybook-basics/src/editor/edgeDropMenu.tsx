"use client";

// src/editor/edgeDropMenu.tsx — card 14: "a cable that landed on nothing is
// a question, not a mistake." Dropping a loose wire end on empty canvas
// opens this, a type-filtered node search anchored to the loose end. Zach:
// "agree this is nice. Let's please add this to editor-components. We
// already have the implementation in SystemSketch."
//
// Engine-agnostic chrome, per `src/editor/README.md`: props and callbacks
// in, no canvas-engine import, no pure graph algorithm reimplemented here
// (that's `nodeCatalog.ts` and `../scene/edgeValidation.ts`). A host wires
// this over a `DomCanvas`, a `ReactFlowHost`, or a tldraw shape with the
// same three callbacks; nothing here knows which.
//
// Re-expression of SystemSketch's `src/blocks/ui/OnCanvasBlockPicker.tsx`
// (read in full 2026-09-18; donor is READ-ONLY, never edited) and its
// caller `src/blocks/connections/ConnectionShapeUtil.tsx:2652-2700`
// (`offerBlockForLooseTerminal`). What travelled, cited at its own seam
// below, and what didn't:
//   - NOT ported: `useEditor`/`useValue`/`useQuickReactor`/`useAtom` (all
//     tldraw) — the donor tracks a LIVE cable shape via a reactive atom and
//     re-measures on every camera change. This component takes `anchor`/
//     `viewport` as plain props instead; a host's own drag handler is what
//     re-renders them on move, same division of labour `focusControls.tsx`
//     already documents (this kit takes callbacks and data, never an
//     editor handle).
//   - NOT ported: the donor's `.OnCanvasBlockPicker.css` file and its
//     "Quick insert" / "Other Blocks" preset grouping — that grouping is
//     SystemSketch's OWN preset table (`stockBlocks.ts`), not a kit
//     concept; this file renders `entries` as one flat list, Tailwind
//     utility classes matching the rest of `src/components/` (`Bar`/
//     `focusControls.tsx`'s inline-class convention, no separate CSS file).
//   - NOT ported: `pickerCreationMarks`/`bailToMark`/history-mark plumbing
//     — that is tldraw's own undo-mark mechanism, host-owned by the same
//     rule cards 21-26 draw between "the kit hands over a history
//     CONTRACT" and "hosts own the undo stack."
//
// PORTED AS RE-EXPRESSED BEHAVIOUR (see each seam below for the exact
// donor lines): flip-then-clamp placement, first-item focus on open,
// outside-press-declines, Escape/Undo-key dismisses.
//
// CARD 23's rule, non-negotiable per this lane's brief: the convenience
// gesture must route through the SAME judge as the raw press — JointJS's
// own `Connect` tool skips `validateMagnet` where the raw press gates it
// (`joint-core/src/dia/ElementView.mjs:785-802` vs
// `src/cellTools/Connect.mjs:60-68`, both opened on disk 2026-09-18), and
// that is exactly how a "validated" graph grows invalid edges. So `judge`
// below is not a convenience filter layered on top of pre-trusted
// `entries` — it is the ONLY gate: an entry `judge` refuses is never
// rendered, full stop, not merely disabled. One gate, no second entry
// point.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { Glyph } from "../components/glyph";
import type { NodeCatalogEntry } from "./nodeCatalog";

const ITEM_SELECTOR = "[data-slot='edge-drop-menu-item']";

/* ------------------------------------------------------------------ */
/* Placement — pure, unit-testable without mounting anything.          */
/* ------------------------------------------------------------------ */

export interface EdgeDropMenuAnchor {
  /** The loose cable end's point, in the coordinate frame of the host's
   *  own nearest positioned ancestor (this component renders
   *  `position: absolute` — see the container's className below) — the
   *  same relationship the donor's `pickerAnchorPagePoint` → viewport
   *  point has to its `useQuickReactor` (`OnCanvasBlockPicker.tsx:38-45,
   *  99`), re-expressed against a host-supplied box instead of a live
   *  tldraw `Editor`'s screen bounds. */
  readonly x: number;
  readonly y: number;
}

export interface EdgeDropMenuViewport {
  /** The box `anchor` and the clamp math are both relative to — a host's
   *  own canvas viewport, not necessarily the browser window. */
  readonly width: number;
  readonly height: number;
}

interface EdgeDropMenuSize {
  readonly width: number;
  readonly height: number;
}

/** Which side of the anchor the menu prefers to open on before any
 *  flip/clamp is applied. `"start"` = prefer opening to the anchor's left
 *  (donor: `wantsProducer`, a cable asking for a producer); `"end"` =
 *  prefer the right (donor: `!wantsProducer`). Named for side rather than
 *  polarity because placement is a pure geometry concern — which polarity
 *  maps to which side is the HOST's call (it already knows via
 *  `NodeCatalogWant`), not this file's. */
export type EdgeDropMenuSide = "start" | "end";

export interface EdgeDropMenuPlacement {
  readonly x: number;
  readonly y: number;
  /** The side the menu actually opened on, after any flip. */
  readonly side: EdgeDropMenuSide;
}

const DEFAULT_MARGIN = 8;

/**
 * Prefer the flow-facing side, then flip, then clamp inside the viewport.
 * Re-expression of `OnCanvasBlockPicker.tsx:109-121` (`useQuickReactor`'s
 * `leftOfCable`/`rightOfCable`/`preferred`/final `x`/`y` clamp) as a pure
 * function of already-measured sizes rather than a live DOM reactor —
 * the DOM measurement itself is `EdgeDropMenu`'s effect, below.
 *
 * Simplified from the donor in one place, noted here rather than left
 * implicit: the donor vertically anchors the FIRST ITEM's own center to
 * the cable point (`anchor` local var, :107 — because its list is grouped
 * into "Quick insert" / "Other Blocks" and the quick items must stay at
 * eye level). This kit's menu is one flat list with no such grouping, so
 * vertical placement anchors the MENU's own center instead — the fair
 * equivalent when there is no privileged first row.
 */
export function placeEdgeDropMenu(
  anchor: EdgeDropMenuAnchor,
  viewport: EdgeDropMenuViewport,
  size: EdgeDropMenuSize,
  preferSide: EdgeDropMenuSide,
  margin: number = DEFAULT_MARGIN,
): EdgeDropMenuPlacement {
  const startSideX = anchor.x - size.width;
  const endSideX = anchor.x;

  let rawX: number;
  let side: EdgeDropMenuSide;
  if (preferSide === "start") {
    const fits = startSideX >= margin;
    rawX = fits ? startSideX : endSideX;
    side = fits ? "start" : "end";
  } else {
    const fits = endSideX + size.width <= viewport.width - margin;
    rawX = fits ? endSideX : startSideX;
    side = fits ? "end" : "start";
  }

  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const x = Math.min(Math.max(rawX, margin), maxX);

  const idealY = anchor.y - size.height / 2;
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  const y = Math.min(Math.max(idealY, margin), maxY);

  return { x, y, side };
}

/* ------------------------------------------------------------------ */
/* The chrome                                                          */
/* ------------------------------------------------------------------ */

export interface EdgeDropMenuProps {
  anchor: EdgeDropMenuAnchor;
  viewport: EdgeDropMenuViewport;
  /** Every candidate the host is willing to offer BEFORE the judge runs —
   *  typically `catalogFor`'s own result (polarity/type already narrowed).
   *  `judge` below is what decides which of these actually render. */
  entries: readonly NodeCatalogEntry[];
  /**
   * Card 23's gate: would picking `entry` produce an edge the host's own
   * `validateConnection` allows? The host wires this to that function
   * (typically: build the hypothetical edge for `entry`, call
   * `validateConnection`, return `verdict.allowed`) — this component
   * never re-implements or bypasses that judgement, it only asks it once
   * per entry and renders nothing for a refusal.
   */
  judge: (entry: NodeCatalogEntry) => boolean;
  onPick: (entry: NodeCatalogEntry) => void;
  onDismiss: () => void;
  preferSide?: EdgeDropMenuSide;
  title?: string;
  className?: string;
}

/** Both event families the donor's own keyboard guard watches
 *  (`OnCanvasBlockPicker.tsx:144-160`): Escape, or Ctrl/Cmd+Z. The donor
 *  binds this to also swallow an in-flight Undo so cancelling the offer
 *  never also undoes document history behind it; this kit has no history
 *  stack of its own to protect (cards 21-26 leave the stack host-owned),
 *  so here the key's only job is calling `onDismiss` — what dismissal
 *  MEANS (delete the half-bound cable, or something else) is the host's
 *  decision, exactly as `ConnectionShapeUtil.tsx`'s `onClose` callback
 *  decides it for the donor. */
function cancelsOffer(event: KeyboardEvent): boolean {
  return event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z");
}

export function EdgeDropMenu({
  anchor,
  viewport,
  entries,
  judge,
  onPick,
  onDismiss,
  preferSide = "end",
  title = "Insert a node",
  className,
}: EdgeDropMenuProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<EdgeDropMenuSize | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Card 23: the judge is the ONLY gate. An entry it refuses is filtered
  // out of the list this component renders — not disabled, not shown
  // greyed-out; absent, so "offered" and "would be accepted" can never
  // drift apart.
  const offered = useMemo(() => entries.filter((entry) => judge(entry)), [entries, judge]);

  // Measure after paint, re-measuring whenever the rendered content could
  // change size (the offered list itself, or the title). Re-expression of
  // the donor's `ResizeObserver` (`OnCanvasBlockPicker.tsx:73-78`) minus
  // its separate `sizeEpoch` atom — a plain state setter serves the same
  // "re-run the position effect" purpose without a tldraw atom.
  useLayoutEffect(() => {
    if (!container) return;
    const measure = () => setSize({ width: container.offsetWidth, height: container.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [container, offered.length, title]);

  const placement = useMemo(
    () => (size ? placeEdgeDropMenu(anchor, viewport, size, preferSide) : null),
    [anchor, viewport, size, preferSide],
  );

  // Focus the first offer so the gesture that opened this never becomes a
  // pointer trap. Re-expression of `OnCanvasBlockPicker.tsx:165-171`.
  useEffect(() => {
    if (!container) return;
    const frame = requestAnimationFrame(() => {
      container.querySelector<HTMLButtonElement>(ITEM_SELECTOR)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [container]);

  // Escape or Undo closes the offer. Re-expression of
  // `OnCanvasBlockPicker.tsx:147-160` — attached to the container's own
  // `ownerDocument` (not a bare `window`) so this behaves the same inside
  // a portal or an iframe'd host, same reasoning as the donor's comment.
  useEffect(() => {
    if (!container) return;
    const target = container.ownerDocument;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!cancelsOffer(event)) return;
      event.stopPropagation();
      event.preventDefault();
      dismissRef.current();
    };
    target.addEventListener("keydown", onKeyDown, { capture: true });
    return () => target.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [container]);

  // A press anywhere else is a decline, not a pick. Re-expression of
  // `OnCanvasBlockPicker.tsx:173-186`.
  useEffect(() => {
    if (!container) return;
    const target = container.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (container.contains(event.target as Node)) return;
      dismissRef.current();
    };
    target.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => target.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [container]);

  const onMenuKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR));
    if (items.length === 0) return;
    const current = items.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
    else next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  }, []);

  return (
    <div
      ref={setContainer}
      data-slot="edge-drop-menu"
      data-testid="edge-drop-menu"
      data-side={placement?.side}
      role="menu"
      aria-label={title}
      onKeyDown={onMenuKeyDown}
      className={
        // `absolute`, not `fixed`: this chrome is meant to sit inside the
        // host's own positioned canvas region (ARCHITECTURE.md — the host
        // owns the viewport transform), not glued to the browser window.
        // The host is responsible for a `position: relative` ancestor at
        // the origin `anchor`/`viewport` are both expressed against.
        "absolute z-50 flex max-h-[min(70vh,420px)] w-56 flex-col gap-0.5 overflow-y-auto rounded-lg bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10" +
        (className ? ` ${className}` : "")
      }
      style={{
        left: placement ? placement.x : anchor.x,
        top: placement ? placement.y : anchor.y,
        visibility: placement ? "visible" : "hidden",
      }}
    >
      <div className="px-1.5 py-1 text-[11px] font-medium text-muted-foreground" role="heading" aria-level={1}>
        {title}
      </div>
      {offered.length === 0 ? (
        <div className="px-1.5 py-1 text-xs text-muted-foreground">Nothing here fits.</div>
      ) : (
        offered.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            data-slot="edge-drop-menu-item"
            data-testid={`edge-drop-menu-item-${entry.id}`}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
            onClick={() => onPick(entry)}
          >
            <Glyph content={entry.icon} sizePreset="sm" />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {entry.inputs} in · {entry.outputs} out
            </span>
          </button>
        ))
      )}
    </div>
  );
}
