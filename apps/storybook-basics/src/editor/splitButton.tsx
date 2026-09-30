// src/editor/splitButton.tsx — ours, ported behavior. Interaction
// contract and the three-state model are ported from
// /home/bam/systemsketch/src/drafts/DraftModeBar.tsx:123-180
// (`MergeSplitButton`) and its accompanying styling in
// /home/bam/systemsketch/src/drafts/drafts.css:619-663; the markup itself is
// NEW, composing this app's own `Button` (button.tsx) and `DropdownMenu`
// (dropdown-menu.tsx) rather than the donor's hand-rolled
// `useOutsideDismiss` + raw `<div role="menu">` (docs/menus/MENU-KIT-DESIGN.md
// §3.1: "do not re-implement a menu" — Base UI's Menu already owns focus
// return, Escape, and outside-dismiss for free).
"use client";

import { ChevronDown } from "lucide-react";
import type { RefObject } from "react";

import { cn } from "../lib/utils";
import { Button } from "../components/button";
import type { ButtonToggleSize } from "../components/barSize";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/dropdown-menu";

export interface SplitButtonItem {
  id: string;
  label: string;
  onSelect(): void;
}

export interface SplitButtonProps {
  /** The primary segment's label, e.g. "Merge". */
  label: string;
  onPrimary(): void;
  items: readonly SplitButtonItem[];
  /**
   * `disabled` greys both segments; `blocked` greys the primary but keeps
   * the chevron accented.
   *
   * WHY (ported, drafts.css:632-655 — the donor's own comment, kept): when
   * merge is blocked the chevron must still point at Rebase. `blocked` is a
   * LOOK, not a lock — the donor's `hasConflict` flag is only ever
   * advisory, so the primary segment stays genuinely clickable even while
   * it reads as blocked; whatever re-checks the real precondition at the
   * moment of the click is host code, this component only renders the
   * three states it's told.
   */
  state?: "normal" | "disabled" | "blocked";
  size?: ButtonToggleSize;
  /** aria-label for the chevron segment; defaults to "`{label}` options". */
  menuLabel?: string;
  /** Portal target inside the host's token scope (host-contract §4,
   *  docs/menus/MENU-KIT-DESIGN.md:661). Forwarded straight to the chevron's
   *  `DropdownMenuContent` — without it the menu portals to `document.body`,
   *  outside a themed host's own scope, and paints with the document's CSS
   *  variables instead of the host's. */
  container?: HTMLElement | ShadowRoot | RefObject<HTMLElement | ShadowRoot | null> | null;
  className?: string;
}

/**
 * The "Merge ▾" control (docs/menus/screenshots/09-draft-title-bar.png) and
 * the chevron-under-icon tool-dock cells (screenshot 04): one primary
 * action plus a chevron opening a menu of alternates — GitHub's
 * merge-button shape, "the shape Zach specifically asked for" (donor
 * comment, DraftModeBar.tsx:102-103).
 */
export function SplitButton({
  label,
  onPrimary,
  items,
  state = "normal",
  size,
  menuLabel,
  container,
  className,
}: SplitButtonProps) {
  const disabled = state === "disabled";
  const blocked = state === "blocked" && !disabled;
  // WHY the primary segment drops to `secondary` while the chevron segment
  // stays `default` (accent) when `blocked`: ported verbatim from
  // drafts.css:645-655's `[data-blocked='true']:not([data-disabled='true'])
  // .split-chevron { color: var(--ss-accent) }` — the muted/accent split IS
  // the "points at Rebase" affordance, not incidental styling.
  const primaryVariant = disabled || blocked ? "secondary" : "default";
  const chevronVariant = disabled ? "secondary" : "default";

  return (
    <div
      data-slot="split-button"
      data-state={state}
      className={cn("inline-flex items-stretch overflow-hidden rounded-lg", className)}
    >
      <Button
        variant={primaryVariant}
        size={size}
        disabled={disabled}
        onClick={onPrimary}
        className="rounded-r-none"
      >
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={chevronVariant}
              size={size === "lg" ? "icon-lg" : size === "sm" ? "icon-sm" : "icon"}
              disabled={disabled}
              aria-label={menuLabel ?? `${label} options`}
              className={cn(
                "rounded-l-none border-l",
                primaryVariant === chevronVariant ? "border-l-primary-foreground/20" : "border-l-border",
              )}
            >
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent align="end" container={container}>
          {items.map((item) => (
            <DropdownMenuItem key={item.id} onClick={item.onSelect}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
