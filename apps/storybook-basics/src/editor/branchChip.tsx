// src/components/branchChip.tsx — the draft/branch selector beside the file
// title (docs/menus/screenshots/05-chrome-bar.png's "Main ▾", 09's outlined
// "Draft 1 (1) ▾"). Ported from
// /home/bam/systemsketch/src/drafts/DraftsControl.tsx:1-307 — the two-step
// "Discard?" confirm, the hover-revealed row actions, the explicit
// `${name}, ${secondary}` aria-label (adjacent `<b>`/`<small>` have no
// whitespace between them in the accessible-name computation), the
// `renderTrigger` re-skin seam, and the "no version has ever been pinned so
// `baseLabel` is fabricated" secondary-label guard all travel; the popover
// primitive, the rename field, and the drafts DATA (`DraftProvider`,
// `useDrafts`, `draftModel.ts`) do not — this component takes
// `DraftSummary[]`/callbacks instead (MENU-KIT-DESIGN.md §7:
// "`draftModel.ts` state reducers... are SystemSketch's localStorage
// branching bookkeeping. The kit ships the `DraftSummary` prop shape only").
"use client";

import { useState, type ReactElement } from "react";
import { ChevronDown, GitBranch, Pencil, Plus, Trash2 } from "lucide-react";

import { cn } from "../lib/utils";
import { Badge } from "../components/badge";
import { Button, buttonVariants } from "../components/button";
import { InlineRename } from "../components/inlineRename";
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover";

export interface DraftSummary {
  id: string;
  name: string;
  /** Computed host-side, deliberately — the donor's own `baseLabel` is
   *  fabricated the moment no version has ever been pinned (every draft
   *  read "based on v0.1" whether or not that meant anything); this kit
   *  refuses to guess and takes the finished string instead. */
  secondaryLabel: string;
}

export interface BranchChipProps {
  isDraftMode: boolean;
  draftCount: number;
  activeDraftName: string | null;
  drafts: readonly DraftSummary[];
  activeDraftId: string | null;
  onSwitchTo(id: string | null): void;
  onCreate(): void;
  onRename(id: string, name: string): void;
  onDiscard(id: string): void;
  /** The proven re-skin seam (DraftsControl.tsx:213-224): a caller supplies
   *  its own trigger without forking the popover. Receives the same state
   *  the default trigger renders from, so a host can compose it with
   *  `ToolbarButton`/`DropdownMenuTrigger` the way `chromeBar.tsx` composes
   *  every other bar control, without this file importing `toolbar.tsx`
   *  itself — `BranchChip` has no opinion on whether it lives inside a
   *  `Toolbar` at all (the gallery below shows it standalone). */
  renderTrigger?: (state: {
    isDraftMode: boolean;
    draftCount: number;
    activeDraftName: string | null;
  }) => ReactElement;
  container?: HTMLElement | null;
}

/**
 * Just the icon/name/badge/chevron — never the trigger element itself.
 *
 * WHY the default arm renders these as `PopoverTrigger`'s CHILDREN rather
 * than composing a separate `<Button render={...}/>` the way `chromeBar.tsx`
 * composes its own controls: `Button` (and every plain function component in
 * this kit) forwards unknown props via `{...props}`, which is what makes it
 * safe as a `render` TARGET — but this content is never one. Wrapping it in
 * an extra component here would put a non-forwarding function component
 * BETWEEN `PopoverTrigger` and its real props (onClick, `aria-expanded`,
 * `data-popup-open`, the ref Base UI's positioner anchors to), silently
 * dropping all of them the moment that wrapper's own signature doesn't
 * spread `...rest` onto something real. `PopoverTrigger` styled directly
 * (below) IS the host button; nothing sits between it and Base UI.
 */
function DefaultTriggerContent({
  draftCount,
  activeDraftName,
}: {
  draftCount: number;
  activeDraftName: string | null;
}) {
  return (
    <>
      <GitBranch aria-hidden="true" className="size-3.5" />
      <span className="max-w-32 truncate">{activeDraftName ?? "Main"}</span>
      {draftCount > 0 ? (
        <Badge variant="secondary" size="sm" shape="pill">
          {draftCount}
        </Badge>
      ) : null}
      <ChevronDown aria-hidden="true" className="size-3.5 opacity-60" />
    </>
  );
}

/**
 * The "you are here" mark on a row: a filled accent dot when current, the
 * branch glyph otherwise (screenshot 05's open popover — the Main row carries
 * a blue dot, nothing else does).
 *
 * WHY the dot REPLACES the glyph rather than sitting beside it: the row's
 * left edge is the only place a reader scans to answer "which one am I on",
 * and two marks in that slot make it a comparison rather than a glance. The
 * branch glyph is what a row looks like when it is somewhere you could go;
 * the dot is what it looks like when you are already there.
 */
function RowMark({ isCurrent }: { isCurrent: boolean }) {
  if (isCurrent) {
    return (
      <span
        aria-hidden="true"
        data-slot="branch-chip-current-dot"
        className="size-2 shrink-0 rounded-full bg-primary"
      />
    );
  }
  return <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />;
}

/**
 * The accent bar down the left edge of the current row (screenshot 05).
 *
 * WHY a bar AND ordinary foreground ink on the tint, rather than accent-
 * coloured text: accent-on-accent-soft was measured at 2.6–4.3:1 in every
 * palette this repo ships — sub-AA. The established fix here is ink for the
 * copy plus a saturated accent bar carrying the colour, which is exactly
 * what the donor's own popover does.
 */
function CurrentBar() {
  return (
    <span
      aria-hidden="true"
      data-slot="branch-chip-current-bar"
      className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-primary"
    />
  );
}

/**
 * One row: Main, or a draft with rename + a two-step discard.
 *
 * WHY discard is a two-step confirm inline in the row rather than a dialog
 * (ported, DraftsControl.tsx:128-134): this popover already renders as
 * floating chrome above the canvas, not inside a dialog stack — one local
 * pattern (`Trash2` → "Discard?" → click again) keeps "discard a draft"
 * behaving identically everywhere it appears instead of a modal in one
 * place and something else in another. Resets `onBlur` so a confirm state
 * never survives the row losing focus.
 */
function DraftRow({
  draft,
  isCurrent,
  onSelect,
  onRename,
  onDiscard,
}: {
  draft: DraftSummary;
  isCurrent: boolean;
  onSelect(): void;
  onRename(name: string): void;
  onDiscard(): void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  if (renaming) {
    return (
      <div
        data-slot="branch-chip-row"
        data-current={isCurrent || undefined}
        className="flex items-center gap-2 rounded-md px-2 py-1.5"
      >
        <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <InlineRename
          value={draft.name}
          onCommit={(next) => {
            onRename(next);
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
          size="row"
          aria-label={`Rename ${draft.name}`}
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <div
      data-slot="branch-chip-row"
      data-current={isCurrent || undefined}
      // WHY the actions are hover-revealed (`group` + `opacity-0
      // group-hover:opacity-100`) rather than always visible (ported,
      // DraftsControl.tsx's `.systemsketch-drafts-row__actions`): a list of
      // drafts is scanned by name far more often than acted on — two
      // buttons per row, always on, is noise the whole rest of the time.
      className="group relative flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted data-current:bg-primary/15"
    >
      {isCurrent ? <CurrentBar /> : null}
      <button
        type="button"
        onClick={onSelect}
        data-testid={`branch-chip-select-${draft.id}`}
        // WHY the accessible name is spelled out explicitly rather than
        // read from the row's own text nodes (ported verbatim,
        // DraftsControl.tsx:173-176): adjacent `<b>`/`<small>` are block-
        // adjacent with no whitespace between them in the accessible-name
        // computation ("Draft 1based on v0.1").
        aria-label={`${draft.name}, ${draft.secondaryLabel}`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left"
      >
        {/* Fixed-width slot: the dot (8px) and the glyph (14px) must not
            shift a row's copy sideways when the current row changes. */}
        <span className="flex w-3.5 shrink-0 justify-center">
          <RowMark isCurrent={isCurrent} />
        </span>
        <span className="flex min-w-0 flex-col">
          <b className="truncate text-sm font-medium">{draft.name}</b>
          <small className="truncate text-xs text-muted-foreground">{draft.secondaryLabel}</small>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Rename ${draft.name}`}
          onClick={() => {
            setConfirmingDiscard(false);
            setRenaming(true);
          }}
        >
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant={confirmingDiscard ? "destructive" : "ghost"}
          size={confirmingDiscard ? "xs" : "icon-xs"}
          aria-label={confirmingDiscard ? `Confirm discard ${draft.name}` : `Discard ${draft.name}`}
          onClick={() => {
            if (confirmingDiscard) onDiscard();
            else setConfirmingDiscard(true);
          }}
          onBlur={() => setConfirmingDiscard(false)}
        >
          {confirmingDiscard ? "Discard?" : <Trash2 aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

export function BranchChip({
  isDraftMode,
  draftCount,
  activeDraftName,
  drafts,
  activeDraftId,
  onSwitchTo,
  onCreate,
  onRename,
  onDiscard,
  renderTrigger,
  container,
}: BranchChipProps) {
  const [open, setOpen] = useState(false);
  const triggerState = { isDraftMode, draftCount, activeDraftName };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {renderTrigger ? (
        <PopoverTrigger render={renderTrigger(triggerState)} />
      ) : (
        <PopoverTrigger
          type="button"
          // WHY `data-active` is `isDraftMode || undefined` rather than the
          // boolean itself (ported verbatim, TitleBar.tsx:484-488 /
          // DraftsControl.tsx:251): Tailwind's bare `data-active:` variant
          // is a PRESENCE test — `data-active="false"` still matches it and
          // lights the chip up off-draft. `undefined` drops the attribute.
          data-active={isDraftMode || undefined}
          // WHY the outline is a `data-active:` variant on a semantic token
          // (`border-primary`/`text-primary`) rather than a literal colour:
          // the design brief's own instruction — draft-mode-active is DATA,
          // the pixels are the theme's.
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1.5 px-2 text-inherit data-active:border-primary data-active:text-primary data-active:ring-1 data-active:ring-primary/30",
          )}
          aria-label={isDraftMode ? `Draft ${activeDraftName}` : "Drafts · Main"}
        >
          <DefaultTriggerContent draftCount={draftCount} activeDraftName={activeDraftName} />
        </PopoverTrigger>
      )}
      <PopoverContent container={container} align="start" className="w-64" aria-label="Drafts">
        {/*
         * WHY an uppercase, letter-spaced, muted eyebrow rather than a plain
         * bold heading (screenshot 05's "DRAFTS"): the popover holds exactly
         * one list, so its title is a section marker, not a competing label —
         * at `text-sm font-semibold` it read as heavier than the rows it
         * introduces. The uppercasing is CSS typography, not a changed
         * string: the accessible name stays "Drafts".
         */}
        <p className="px-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Drafts
        </p>
        <div className="flex flex-col gap-0.5" data-slot="branch-chip-list">
          <button
            type="button"
            data-current={activeDraftId === null || undefined}
            data-testid="branch-chip-select-main"
            className="relative flex items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-muted data-current:bg-primary/15"
            onClick={() => {
              onSwitchTo(null);
              setOpen(false);
            }}
          >
            {activeDraftId === null ? <CurrentBar /> : null}
            <span className="flex w-3.5 shrink-0 justify-center">
              <RowMark isCurrent={activeDraftId === null} />
            </span>
            <b className="text-sm font-medium">Main</b>
          </button>
          {drafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              isCurrent={draft.id === activeDraftId}
              onSelect={() => {
                onSwitchTo(draft.id);
                setOpen(false);
              }}
              onRename={(name) => onRename(draft.id, name)}
              onDiscard={() => onDiscard(draft.id)}
            />
          ))}
        </div>
        {/*
         * WHY a dashed, full-width, CENTRED row rather than a left-aligned
         * ghost item (screenshot 05): a dashed outline is the established
         * "this is a slot you can fill", and centring it stops it reading as
         * another entry in the list above — the donor's own popover puts it
         * in a footer, below a divider, for the same reason. It is the one
         * action in this surface that CREATES something, so it must not be
         * scannable as one of the things that already exist.
         */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // `border-border dark:border-input` and not `border` alone: the
          // base `buttonVariants` class is `border border-transparent`, so a
          // bare `border-dashed` draws dashes in transparent and renders
          // nothing at all. Same literal pair `outline` uses (button.tsx:20)
          // — see its own WHY there for why `--input` is named in dark.
          className={cn(
            "mt-1 w-full justify-center gap-1.5 border border-dashed border-border text-muted-foreground hover:text-foreground dark:border-input",
          )}
          data-testid="branch-chip-new-draft"
          onClick={() => {
            onCreate();
            setOpen(false);
          }}
        >
          <Plus aria-hidden="true" />
          New draft
        </Button>
      </PopoverContent>
    </Popover>
  );
}
