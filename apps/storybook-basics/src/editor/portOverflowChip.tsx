"use client";

// src/editor/portOverflowChip.tsx — RULING 7's chrome half: the "+X more"
// chip a capped `PortEdge` hands its overflow to.
//
// Zach, 2026-09-21: "ideally this just comes from the port edge
// implementation... but YOu do need to provide the chrome to do this...
// should be in bbox-editor."
//
// That sentence is a SPLIT, and this file is one side of it:
//
//   the DECISION + the COUNT + the anchor   ->  components/portEdge.tsx
//                                               (`maxVisible`,
//                                               `splitByMaxVisible`,
//                                               `useMoreIndicatorPosition`)
//   the CHROME that draws it                ->  here
//
// The seam between them is `PortEdgeProps.renderOverflow`, a render prop —
// the only shape that respects the DAG, since `components/` may not import
// `editor/` (ARCHITECTURE.md: "editor imports both; nothing imports
// editor"). A host writes:
//
//   <PortEdge maxVisible={3} renderOverflow={(o) => <PortOverflowChip overflow={o} />} />
//
// and `PortEdge` positions the returned node at the measured end of its own
// track.
//
// Engine-agnostic, per `src/editor/README.md`: plain data and callbacks in,
// no canvas engine, no pure algorithm reimplemented here. The dismissal
// idiom (Escape, outside-press, roving arrow keys) is `edgeDropMenu.tsx`'s,
// deliberately reused rather than re-invented — two floating editor
// surfaces that dismiss differently is a thing a user has to learn twice.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { paintTier } from "../components/paintOrder";
import type { PortEdgeItem, PortEdgeOverflow } from "../components/portEdge";

const ITEM_SELECTOR = "[data-slot='port-overflow-item']";

export interface PortOverflowChipProps {
  /** Straight from `PortEdge`'s `renderOverflow` — never assembled by the
   *  host, and never recomputed here. */
  overflow: PortEdgeOverflow;
  /** Picking a hidden port. A host typically scrolls/selects/raises
   *  `maxVisible` — this component has no opinion, it just reports which
   *  one was chosen and closes. Omit it and the list is read-only, which is
   *  still the point: "+3 more" becomes discoverable instead of merely
   *  honest. */
  onSelect?(item: PortEdgeItem): void;
  className?: string;
}

/**
 * The chip, and the disclosure behind it.
 *
 * WHY the count is rendered from `overflow.hiddenCount` rather than from
 * `overflow.hiddenItems.length`, which is the same number today: a chip that
 * counts for itself is a second source of truth for a fact `PortEdge`
 * already decided. If the two ever disagree, the component that made the cut
 * is right and this one is a bug — so it must not be able to disagree. Same
 * reason the chip does not re-apply `maxVisible`.
 *
 * WHY the chip is a real `<button>` with a list behind it, rather than the
 * inert text `PortEdge` falls back to: hiding ports is a truthful-rendering
 * problem (`feedback_truthful_property_rendering` — "keep the complete raw
 * value immediately discoverable"), and a count alone tells you how many you
 * lost without telling you which. One press is the whole recovery path.
 */
export function PortOverflowChip({ overflow, onSelect, className }: PortOverflowChipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  // Escape closes — `edgeDropMenu.tsx`'s own reasoning for binding to the
  // element's `ownerDocument` rather than a bare `window` (portals, iframed
  // hosts) applies here unchanged.
  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    const target = root.ownerDocument;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      root.querySelector<HTMLButtonElement>("[data-slot='port-overflow-chip']")?.focus();
    };
    target.addEventListener("keydown", onKeyDown, { capture: true });
    return () => target.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open]);

  // A press anywhere else is a decline, not a pick.
  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    const target = root.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (root.contains(event.target as Node)) return;
      setOpen(false);
    };
    target.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => target.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [open]);

  const onListKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
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

  // Defensive, and deliberately silent: `PortEdge` already refuses to render
  // any overflow chrome at all when nothing is hidden, so reaching this
  // branch means a host called this component directly with an empty cut.
  // "+0 more" would be a lie about a fact nobody asked about.
  if (overflow.hiddenCount <= 0) return null;

  return (
    <span ref={rootRef} data-slot="port-overflow" className={"relative inline-flex" + (className ? ` ${className}` : "")}>
      <button
        type="button"
        data-slot="port-overflow-chip"
        data-testid="port-overflow-chip"
        data-edge={overflow.edge}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${overflow.hiddenCount} more ports on the ${overflow.edge} edge`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-5 shrink-0 items-center rounded-full border border-border bg-muted px-2 text-[11px] font-medium text-muted-foreground whitespace-nowrap outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
      >
        +{overflow.hiddenCount} more
      </button>
      {open && (
        <div
          data-slot="port-overflow-list"
          data-testid="port-overflow-list"
          role="listbox"
          aria-label="Hidden ports"
          onKeyDown={onListKeyDown}
          // `absolute`, not `fixed`, for `edgeDropMenu.tsx`'s own reason:
          // this chrome belongs inside the host's positioned region — here,
          // the `PortEdge` track that placed the chip — not glued to the
          // browser window. The tier is the kit's ladder, never a literal
          // (`components/paintOrder.ts`).
          style={{ zIndex: paintTier("laneOverlay") }}
          // Drops from the chip on BOTH axes: the chip already sits at
          // whichever end of the track `PortEdge` measured (right of the
          // last port on a row edge, under it on a column edge), so the
          // list only ever has to open away from the chip itself.
          className="absolute left-0 top-full mt-1 flex max-h-48 w-40 flex-col gap-0.5 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {overflow.hiddenItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={false}
              data-slot="port-overflow-item"
              data-port-id={item.id}
              className="flex items-baseline gap-1.5 rounded-md px-1.5 py-1 text-left text-xs outline-none hover:bg-muted focus-visible:bg-muted"
              onClick={() => {
                onSelect?.(item);
                setOpen(false);
              }}
            >
              {/* Truthful rendering: the port's stored label verbatim, and
                  its type as the same muted secondary run `LabeledPort`
                  already draws — the row is the hidden port, restated, not
                  a paraphrase of it. */}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.type ? <span className="shrink-0 text-[10px] text-muted-foreground">{item.type}</span> : null}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
