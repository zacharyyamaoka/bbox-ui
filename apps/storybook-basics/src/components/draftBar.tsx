// src/components/draftBar.tsx — ours, ported behavior. Ported from
// /home/bam/systemsketch/src/drafts/DraftModeBar.tsx (465 lines): the exit
// control, the click-to-rename name field, the "···" overflow menu, the
// conflict banner, the status line, the Compare button and the Merge▾ split
// button. Composed from this kit's own `Bar` (bar.tsx), `Button`,
// `DropdownMenu`, `Separator`, `InlineRename` (inlineRename.tsx) and
// `SplitButton` (splitButton.tsx) rather than the donor's hand-rolled
// `useOutsideDismiss` popups and raw `<div role="menu">` markup — see
// splitButton.tsx's own header for why (docs/menus/MENU-KIT-DESIGN.md §3.1:
// "do not re-implement a menu").
//
// What does NOT travel (docs/menus/MENU-KIT-DESIGN.md §4 "Draft bar" +
// §7 "Deliberately left out"): the Compare/Merge/Rebase orchestration
// (`useDrafts()`/`useCompare()`, ~130 donor lines — opening the Compare
// dialog, computing rebase previews, the 5s status-message expiry) is host
// code. `draftModel.ts`'s state reducers are SystemSketch's own localStorage
// branching bookkeeping; a git-backed host would never use them, so this
// component only takes the shapes it actually renders — every action below
// is a callback, not a store subscription.
"use client";

import { AlertTriangle, ArrowLeft, MoreHorizontal } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useCallback, useRef, useState } from "react";

import { Bar } from "./bar";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { InlineRename } from "./inlineRename";
import { Separator } from "./separator";
import { SplitButton, type SplitButtonItem } from "./splitButton";

/**
 * The overflow ("···") menu's item shape — matches
 * `docs/menus/MENU-KIT-DESIGN.md`'s `ChromeBarProps.fileActions` (§3.3,
 * `chromeBar.tsx`, not yet in this tree at the time this lane was written).
 * Defined locally rather than imported: `draftBar.tsx`'s own write set is
 * this file and its story alone (build-order §6, Lane L), so it cannot
 * depend on Lane I landing first. A later pass that lands `chromeBar.tsx`
 * should re-point this to that file's export and delete the duplicate —
 * the shape is identical on purpose.
 */
export interface MenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  run(): void;
}

export interface DraftBarProps {
  draftName: string;
  onExit(): void;
  /** Rename is local UI state (click the name → an `InlineRename` opens in
   *  its place); the host only hears about it once a NEW name is actually
   *  committed. `validate` is the same swappable policy `InlineRename`
   *  itself exposes — omit it for the shared "Give this draft a name."
   *  default (ported, DraftsControl.tsx:73 / DraftModeBar.tsx:236). */
  rename: {
    onCommit(next: string): void;
    validate?(next: string): string | null;
  };
  /** Discard lives here — a slot the host populates, never a hardcoded
   *  "Discard" item baked into this component (ported donor:
   *  `OverflowMenu`, DraftModeBar.tsx:63-99, whose only item today happens
   *  to be Discard). */
  overflowItems: readonly MenuAction[];
  /** Banner text; `null`/omitted renders nothing. Truncates to one line
   *  with the full text on `title` — see the WHY on `ConflictBanner` below
   *  (ported, drafts.css:516-548: at ~760px an un-truncated banner used to
   *  push the Merge▾ chevron off-screen entirely). */
  conflict?: string | null;
  /** A self-clearing status line (a Rebase result, mostly). Controlled —
   *  the donor's 5s auto-expiry (`STATUS_TIMEOUT_MS`, DraftModeBar.tsx:25)
   *  is host-owned timing, not this component's. */
  status?: string | null;
  changeCount: number;
  /** `undefined` disables the Compare button (donor: `disabled={!compare}`,
   *  DraftModeBar.tsx:337 — no compare surface mounted yet). */
  onCompare?(): void;
  /**
   * DELIBERATELY separate from `changeCount`: the donor's `hasUnpromotedEdits`
   * is a mergeability check the diff engine can't see through — a draft
   * that's purely a MOVE has no display-diff rows (`changes.total === 0`)
   * and is still perfectly mergeable (DraftModeBar.tsx:404-407's own
   * comment: `"Merge 0 changes" needs real words, not a count`). Gating
   * Merge on `changeCount > 0` instead of this prop would silently disable
   * merging a pure move.
   */
  canMerge: boolean;
  onMerge(): void;
  /**
   * The resolved LOOK for the split button's two segments. Omit it and this
   * component derives `"normal"` / `"disabled"` from `canMerge` alone —
   * `"blocked"` (ported: `hasConflict`, a LOOK, not a lock; see
   * `SplitButton`'s own WHY) is something only the host can know, since
   * conflict detection is part of the orchestration this component doesn't
   * own. Pass it explicitly whenever the host wants the "points at Rebase"
   * treatment.
   */
  mergeState?: "normal" | "disabled" | "blocked";
  /** Rebase lives here (donor: `MergeSplitButton`'s own chevron menu,
   *  DraftModeBar.tsx:172-179) — typed as `SplitButtonItem` directly rather
   *  than repeating its `{id, label, onSelect()}` shape under a new name. */
  mergeMenuItems: readonly SplitButtonItem[];
  /** Portal target inside the host's token scope (host-contract §4,
   *  docs/menus/MENU-KIT-DESIGN.md:661). Forwarded to the "···" overflow
   *  menu and passed straight through to `SplitButton` for its own Merge
   *  chevron menu — one prop set once on `DraftBar` covers both popups.
   *  Without it either menu portals to `document.body`, outside a themed
   *  host's scope, and paints with the document's CSS variables instead of
   *  the host's. */
  container?: HTMLElement | ShadowRoot | RefObject<HTMLElement | ShadowRoot | null> | null;
  className?: string;
}

/**
 * Ink text on a tinted background plus a colored left bar — ported
 * (drafts.css:516-548's own WHY comment, kept): this app's established
 * pattern for a warning ON a tint, rather than colored text directly on a
 * colored background (measured there at ~3.03:1, sub-AA at 11px). No
 * semantic "warning" token exists yet in this trunk's CSS variables (only
 * `destructive` does), so this reaches for literal `amber-*` Tailwind
 * swatches the same way `portEdge.layout.ts:354`'s wire-status amber does,
 * rather than inventing a `--warning` variable unilaterally in a single
 * lane's write set.
 *
 * `min-width: 0` + a truncating `span` (ported, same file, same comment):
 * this banner is a flex child of the bar's `left` slot, and un-truncated
 * `white-space: nowrap` forced the WHOLE banner text into the row's minimum
 * content size — wide enough, on its own, to push the Merge▾ chevron off
 * the visible bar. Truncating it (full text still on `title` — truthful
 * rendering; nothing about the string itself is altered) is what lets the
 * row keep shrinking gracefully instead of hard-clipping something else.
 */
function ConflictBanner({ text }: { text: string }) {
  return (
    <div
      data-slot="draft-bar-conflict"
      className="flex min-w-0 shrink items-center gap-1.5 rounded-r-md border-l-2 border-l-amber-500 bg-amber-500/10 px-2 py-1 dark:border-l-amber-400 dark:bg-amber-400/10"
    >
      <AlertTriangle
        className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <span className="min-w-0 truncate text-xs font-medium" title={text}>
        {text}
      </span>
    </div>
  );
}

/**
 * The draft-mode title bar (docs/menus/screenshots/09-draft-title-bar.png:
 * "← Exit | Draft 1 | ···" on the left; "Compare 0 Changes" and a split
 * "Merge ▾" on the right). Built on this kit's own `Bar` — no `center`
 * slot, so its grid collapses to the "unchanged (stock seam)" left-grows /
 * right-hugs layout the screenshot shows (bar.tsx's `barGridTemplateColumns`
 * WHY).
 */
export function DraftBar({
  draftName,
  onExit,
  rename,
  overflowItems,
  conflict,
  status,
  changeCount,
  onCompare,
  canMerge,
  onMerge,
  mergeState,
  mergeMenuItems,
  container,
  className,
}: DraftBarProps) {
  const [renaming, setRenaming] = useState(false);
  const nameTriggerRef = useRef<HTMLButtonElement>(null);

  // WHY requestAnimationFrame (ported, DraftModeBar.tsx `cancelRename` /
  // `commitRename`): focus returns to the trigger a frame late — the
  // trigger button doesn't exist yet THIS tick, it's mid-remount back in
  // from the input's place.
  const closeRename = useCallback(() => {
    setRenaming(false);
    window.requestAnimationFrame(() => nameTriggerRef.current?.focus());
  }, []);

  const resolvedMergeState = mergeState ?? (canMerge ? "normal" : "disabled");
  const changeLabel = `Compare ${changeCount} Change${changeCount === 1 ? "" : "s"}`;

  return (
    // WHY a plain wrapping `div`, not a `className` prop on `Bar` itself:
    // `Bar` (bar.tsx) is the "unchanged (stock seam)" three-slot layout
    // primitive and deliberately has no `className` of its own — a caller
    // that needs to size or position the WHOLE bar wraps it, the same way
    // `Bar.stories.tsx`'s `Widths` gallery does.
    <div data-slot="draft-bar" className={className}>
      <Bar
        size="sm"
        left={
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onExit}
              className="text-muted-foreground hover:text-foreground gap-1.5 px-2"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Exit
            </Button>
            <Separator orientation="vertical" className="h-4" />
            {renaming ? (
              <InlineRename
                value={draftName}
                size="bar"
                aria-label="Rename draft"
                validate={rename.validate}
                onCommit={(next) => {
                  rename.onCommit(next);
                  closeRename();
                }}
                onCancel={closeRename}
                className="w-40"
              />
            ) : (
              <Button
                ref={nameTriggerRef}
                variant="ghost"
                size="sm"
                title={draftName}
                aria-label={`${draftName}. Click to rename.`}
                onClick={() => setRenaming(true)}
                // WHY `max-w-40` here rather than nothing (ported,
                // drafts.css:440-444's own `.systemsketch-draft-bar__name`):
                // a long draft name must elide, not push the overflow menu
                // and (if present) the conflict banner out of the bar — the
                // truncation is purely visual (`truncate`, CSS ellipsis); the
                // full, untouched string is still what's rendered and what's
                // on `title` above.
                className="max-w-40 justify-start gap-0 px-2 font-semibold"
              >
                <span className="min-w-0 truncate">{draftName}</span>
              </Button>
            )}
            {overflowItems.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Draft options"
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="start" container={container}>
                  {overflowItems.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      disabled={item.disabled}
                      variant={item.destructive ? "destructive" : "default"}
                      onClick={item.run}
                    >
                      {item.icon}
                      {item.label}
                      {item.shortcut ? (
                        <DropdownMenuShortcut>
                          {item.shortcut}
                        </DropdownMenuShortcut>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {conflict ? <ConflictBanner text={conflict} /> : null}
          </div>
        }
        right={
          <div className="flex items-center gap-3">
            {status ? (
              <span
                role="status"
                className="text-muted-foreground max-w-[320px] truncate text-xs"
                title={status}
              >
                {status}
              </span>
            ) : null}
            {/*
             * WHY `outline` here, not the filled look the donor's CSS used
             * to ship (ported, drafts.css:407-424's own comment): sitting
             * next to the solid-accent Merge▾ split button, a borderless
             * "Compare N" read as a static badge rather than something
             * clickable. `outline` is this kit's own "clickable, not
             * primary" register — it keeps Merge▾ as the ONLY filled
             * control in the row, so the hierarchy between the two reads
             * at a glance without a bespoke border/tint combination
             * reinvented just for this bar.
             */}
            <Button
              variant="outline"
              size="sm"
              disabled={!onCompare}
              onClick={onCompare}
            >
              {changeLabel}
            </Button>
            <SplitButton
              label="Merge"
              size="sm"
              onPrimary={onMerge}
              items={mergeMenuItems}
              state={resolvedMergeState}
              menuLabel="Merge options"
              container={container}
            />
          </div>
        }
      />
    </div>
  );
}
