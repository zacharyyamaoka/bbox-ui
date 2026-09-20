// src/components/quickSwitcher.tsx — the editor component behind the bare
// `S` key. Zach, PROJECT - System Sketch.md, 2026-09-19:
//   "Press S and it should open the quick switcher / See system sketch from
//    source code reference / WE likely need a new editor component for this. /
//    Please search for shadcn reference I belive there are lots!!!"
//
// It is the SystemSketch command palette
// (/home/bam/systemsketch/src/commands/SystemSketchCommandPalette.tsx, 504
// lines) rebuilt on the stock parts, and the point of the rebuild is how much
// of those 504 lines stops existing:
//
//   donor, hand-rolled                     here, stock
//   ------------------------------------   ---------------------------------
//   `focusableElements` + a Tab cycle       Dialog's own focus trap
//   window `focusin` capture listener       Dialog's own focus containment
//   window `keydown` capture for Escape     Dialog's own Escape
//   `nextPaletteIndex` + `activeIndex`      cmdk's roving selection
//   `aria-activedescendant` bookkeeping     cmdk's, on its own listbox
//   `role="listbox"` / `role="option"`      cmdk's List/Item
//   `EditorPortal` (a tldraw seam)          Dialog's portal
//   `commands.css`                          the trunk's Tailwind tokens
//
// What survives the rebuild is the part that is actually ours: the token-aware
// matching rule (`commandModel.ts`), the text search (`boardSearch.ts`), and
// the keyboard rule that decides whether a BARE LETTER may open this at all.
//
// It owns no knowledge of boards, tldraw or files, by the trunk rule
// (CLAUDE.md, "The core imports no canvas engine"). Everything it lists
// arrives as props. `apps/systemsketch` mounts it, fills `items` and
// `searchSources`, and calls `quickSwitcherKeyDecision` from its own
// window-level listener.
"use client";

import * as React from "react";

import {
  filterQuickSwitcherItems,
  groupQuickSwitcherItems,
  quickSwitcherItemDisabled,
  type QuickSwitcherItem,
} from "./commandModel";
import {
  replaceAllInSources,
  replacedTextForMatch,
  searchMatchSnippet,
  searchTextSources,
  type SearchableText,
  type TextSearchMatch,
  type TextSearchOptions,
  type TextSourceUpdate,
} from "./boardSearch";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./command";
import { Button } from "./button";
import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { Toggle } from "./toggle";
import { cn } from "../lib/utils";

export type QuickSwitcherMode = "go-to" | "find";

const MODE_LABELS: ReadonlyArray<{ mode: QuickSwitcherMode; label: string }> = [
  { mode: "go-to", label: "Go to" },
  { mode: "find", label: "Find" },
];

export interface QuickSwitcherProps<TMeta = unknown> {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Everything `S` can jump to or run. Grouped by each item's `group`. */
  items?: readonly QuickSwitcherItem[];
  /** Text the Find half searches. Omit it and there is no Find half. */
  searchSources?: readonly SearchableText<TMeta>[];
  onSelectMatch?(match: TextSearchMatch<TMeta>): void;
  onReplace?(update: TextSourceUpdate<TMeta>, match: TextSearchMatch<TMeta>): void;
  onReplaceAll?(updates: Array<TextSourceUpdate<TMeta>>): void;
  /** Show the Find half, but refuse to offer replacement. */
  readOnly?: boolean;
  title?: string;
  description?: string;
  placeholder?: string;
  findPlaceholder?: string;
  emptyMessage?: string;
  initialMode?: QuickSwitcherMode;
  onModeChange?(mode: QuickSwitcherMode): void;
  onError?(error: unknown): void;
  className?: string;
  testIdPrefix?: string;
}

/**
 * WHY our rows override the stock selected-row background.
 *
 * The stock `CommandItem` (copied verbatim) paints selection with
 * `data-selected:bg-muted`, and in Tailwind v4 that variant means "the
 * attribute is PRESENT", not "it equals true". cmdk stamps
 * `data-selected="false"` on every unselected row — React renders a boolean
 * `false` on a `data-*` attribute as the string — so the attribute is always
 * present and every row painted `bg-muted`. Measured in the live page: all six
 * rows `oklch(0.97 0 0)`, selected and not, which makes the thing Enter is
 * about to run invisible.
 *
 * Fixed here rather than in `command.tsx` because that file is verbatim stock
 * under an oracle (`stockPrimitives.test.ts`) — editing it would be a silent
 * fork of the upstream part. `!` because `[data-selected]` and
 * `[data-selected=false]` have identical specificity, so without it the winner
 * is whatever order Tailwind happens to emit them in.
 *
 * `QuickSwitcher.stories.tsx > PressS` measures the two backgrounds and fails
 * if they match again.
 */
const ROW = "data-[selected=false]:bg-transparent!";

function MatchText({ match }: { match: TextSearchMatch }) {
  const snippet = searchMatchSnippet(match);
  return (
    <span className="truncate text-xs text-muted-foreground">
      {snippet.before}
      <mark className="rounded-xs bg-transparent font-medium text-foreground underline decoration-foreground/40">
        {snippet.found}
      </mark>
      {snippet.after}
    </span>
  );
}

export function QuickSwitcher<TMeta = unknown>(props: QuickSwitcherProps<TMeta>): React.ReactElement {
  const {
    open,
    onOpenChange,
    items = [],
    searchSources,
    onSelectMatch,
    onReplace,
    onReplaceAll,
    readOnly = false,
    title = "Quick switcher",
    description = "Jump to anything, or search every word on the board.",
    placeholder = "Go to a board, a block, or a command…",
    findPlaceholder = "Find text…",
    emptyMessage = "No results",
    initialMode = "go-to",
    onModeChange,
    onError,
    className,
    testIdPrefix = "quick-switcher",
  } = props;

  const P = testIdPrefix;
  const testId = React.useCallback((suffix: string) => `${P}-${suffix}`, [P]);

  const findAvailable = Array.isArray(searchSources);
  // WHY hoisted instead of `searchSources ?? []` at each call site: the inline
  // fallback widens to `never[]` and TypeScript then infers `TMeta = unknown`,
  // which silently strips the host's payload type off every match it gets back.
  const sources: readonly SearchableText<TMeta>[] = React.useMemo(() => searchSources ?? [], [searchSources]);
  const [mode, setMode] = React.useState<QuickSwitcherMode>(findAvailable ? initialMode : "go-to");
  const [goToQuery, setGoToQuery] = React.useState("");
  const [findQuery, setFindQuery] = React.useState("");
  const [replacement, setReplacement] = React.useState("");
  const [options, setOptions] = React.useState<TextSearchOptions>({});
  const [status, setStatus] = React.useState("");

  // WHY the query is cleared on every open rather than remembered: this is a
  // JUMP surface, not a search session. The donor's palette was opened from a
  // menu item and could sit on one query for a while; a bare letter is pressed
  // dozens of times an hour, and finding yesterday's query already in the box
  // — with yesterday's list under it — is one keystroke of confusion every
  // single time. `initialMode` is re-applied for the same reason.
  React.useEffect(() => {
    if (!open) return;
    setGoToQuery("");
    setFindQuery("");
    setStatus("");
    setMode(findAvailable ? initialMode : "go-to");
  }, [open, initialMode, findAvailable]);

  const visibleItems = React.useMemo(
    () => filterQuickSwitcherItems(items, goToQuery),
    [items, goToQuery],
  );
  const matches = React.useMemo(
    () => (findAvailable ? searchTextSources(sources, findQuery, options) : []),
    [findAvailable, sources, findQuery, options],
  );
  const groups = React.useMemo(() => groupQuickSwitcherItems(visibleItems), [visibleItems]);
  const replaceableCount = matches.filter((match) => match.replaceable).length;
  const replaceEnabled = Boolean(onReplace || onReplaceAll) && !readOnly;

  const runItem = React.useCallback(
    async (item: QuickSwitcherItem) => {
      if (quickSwitcherItemDisabled(item)) return;
      try {
        await item.run();
        if (!item.keepOpen) onOpenChange(false);
      } catch (error) {
        setStatus(`Could not run ${item.label}.`);
        onError?.(error);
      }
    },
    [onOpenChange, onError],
  );

  const selectMatch = React.useCallback(
    (match: TextSearchMatch<TMeta>) => {
      onSelectMatch?.(match);
      setStatus(`Selected ${match.field.toLocaleLowerCase()} in ${match.group ?? "the document"}.`);
    },
    [onSelectMatch],
  );

  const replaceOne = React.useCallback(
    (match: TextSearchMatch<TMeta> | undefined) => {
      if (!match || !onReplace || readOnly || !match.replaceable) return;
      onReplace(
        {
          sourceId: match.sourceId,
          field: match.field,
          text: replacedTextForMatch(match, replacement),
          meta: match.meta,
        },
        match,
      );
      setStatus("Replaced 1 match.");
    },
    [onReplace, readOnly, replacement],
  );

  const replaceEvery = React.useCallback(() => {
    if (!onReplaceAll || readOnly) return;
    const result = replaceAllInSources(sources, findQuery, replacement, options);
    onReplaceAll(result.updates);
    setStatus(
      result.replacedCount > 0
        ? `Replaced ${result.replacedCount} ${result.replacedCount === 1 ? "match" : "matches"}${
            result.skippedCount ? `; skipped ${result.skippedCount}` : ""
          }.`
        : "No matches changed.",
    );
  }, [onReplaceAll, readOnly, sources, findQuery, replacement, options]);

  const switchMode = React.useCallback(
    (next: QuickSwitcherMode) => {
      setMode(next);
      setStatus("");
      onModeChange?.(next);
    },
    [onModeChange],
  );

  const query = mode === "go-to" ? goToQuery : findQuery;
  const setQuery = mode === "go-to" ? setGoToQuery : setFindQuery;
  const resultCount = mode === "go-to" ? visibleItems.length : matches.length;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className={cn("sm:max-w-xl", className)}
    >
      <Command
        shouldFilter={false}
        loop
        label={title}
        data-testid={testId("root")}
        className="rounded-xl!"
      >
        {findAvailable ? (
          <Tabs
            value={mode}
            onValueChange={(value) => switchMode(value as QuickSwitcherMode)}
            className="px-1 pt-1"
          >
            <TabsList variant="line" data-testid={testId("modes")}>
              {MODE_LABELS.map((candidate) => (
                <TabsTrigger
                  key={candidate.mode}
                  value={candidate.mode}
                  data-testid={testId(`mode-${candidate.mode}`)}
                >
                  {candidate.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}

        <CommandInput
          value={query}
          onValueChange={(value) => {
            setQuery(value);
            setStatus("");
          }}
          placeholder={mode === "go-to" ? placeholder : findPlaceholder}
          aria-label={mode === "go-to" ? "Search everything" : "Find text"}
          data-testid={testId("input")}
        />

        {mode === "find" ? (
          <div
            className="flex items-center gap-1 px-1 pt-1"
            data-testid={testId("find-controls")}
            // WHY this row stops its own keys from reaching cmdk: cmdk's root
            // owns ArrowUp/ArrowDown/Home/End/Enter for the LIST, and it does
            // not care which descendant the key came from — so without this,
            // pressing Enter to replace moves the list selection instead, and
            // Ctrl+K inside the replace box scrolls the results. Escape and
            // Tab are deliberately let through: they belong to the Dialog.
            onKeyDown={(event) => {
              if (event.key === "Escape" || event.key === "Tab") return;
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                replaceOne(matches[0]);
              }
            }}
          >
            <Toggle
              size="sm"
              variant="outline"
              aria-label="Match case"
              title="Match case"
              pressed={Boolean(options.matchCase)}
              onPressedChange={(pressed) => setOptions((current) => ({ ...current, matchCase: pressed }))}
              data-testid={testId("match-case")}
            >
              Aa
            </Toggle>
            <Toggle
              size="sm"
              variant="outline"
              aria-label="Match whole words"
              title="Match whole words"
              pressed={Boolean(options.wholeWord)}
              onPressedChange={(pressed) => setOptions((current) => ({ ...current, wholeWord: pressed }))}
              data-testid={testId("whole-word")}
            >
              Word
            </Toggle>
            {replaceEnabled ? (
              <>
                <input
                  value={replacement}
                  aria-label="Replace with"
                  placeholder="Replace with…"
                  autoComplete="off"
                  spellCheck={false}
                  data-testid={testId("replacement")}
                  onChange={(event) => {
                    setReplacement(event.currentTarget.value);
                    setStatus("");
                  }}
                  className="h-7 min-w-0 flex-1 rounded-lg border border-input/30 bg-input/30 px-2 text-sm outline-hidden focus-visible:border-ring"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!onReplace || replaceableCount === 0}
                  data-testid={testId("replace")}
                  onClick={() => replaceOne(matches[0])}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!onReplaceAll || replaceableCount === 0}
                  data-testid={testId("replace-all")}
                  onClick={replaceEvery}
                >
                  All
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        <CommandList data-testid={testId("list")}>
          <CommandEmpty data-testid={testId("empty")}>{emptyMessage}</CommandEmpty>

          {mode === "go-to"
            ? groups.map((bucket, bucketIndex) => (
                // WHY the index is in the key: an ungrouped bucket has no name,
                // and bucket order is first-appearance order, so `index:name` is
                // unique by construction. (It was a NUL sentinel for one commit,
                // which made the whole file read as binary to git and grep.)
                <CommandGroup key={`${bucketIndex}:${bucket.group ?? ""}`} heading={bucket.group}>
                  {bucket.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      className={ROW}
                      disabled={quickSwitcherItemDisabled(item)}
                      data-testid={testId(`item-${item.id}`)}
                      data-item-id={item.id}
                      onSelect={() => void runItem(item)}
                    >
                      {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{item.label}</span>
                        {item.description ? (
                          <span className="truncate text-xs text-muted-foreground">{item.description}</span>
                        ) : null}
                      </span>
                      {item.detail ? (
                        <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{item.detail}</span>
                      ) : null}
                      {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            : matches.map((match) => (
                <CommandItem
                  key={match.id}
                  value={match.id}
                  className={ROW}
                  data-testid={testId(`match-${match.id}`)}
                  data-source-id={match.sourceId}
                  data-replaceable={match.replaceable}
                  onSelect={() => selectMatch(match)}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">
                      {match.group ? <strong className="font-medium">{match.group}</strong> : null}
                      {match.group ? " · " : null}
                      {match.field}
                    </span>
                    <MatchText match={match} />
                  </span>
                  {match.replaceBlocker ? (
                    <span className="ml-auto pl-2 text-xs text-muted-foreground">{match.replaceBlocker}</span>
                  ) : null}
                </CommandItem>
              ))}
        </CommandList>

        <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5 text-xs text-muted-foreground">
          <span role="status" aria-live="polite" data-testid={testId("status")}>
            {status ||
              (mode === "go-to"
                ? `${resultCount} ${resultCount === 1 ? "result" : "results"}`
                : findQuery
                  ? `${resultCount} ${resultCount === 1 ? "match" : "matches"}`
                  : "Searches every word the host exposes")}
          </span>
          <span data-testid={testId("hints")}>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate · <kbd>↵</kbd> Open · <kbd>Esc</kbd> Close
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
