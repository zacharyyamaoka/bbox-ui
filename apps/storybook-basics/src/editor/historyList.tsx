import { useState, type CSSProperties } from "react"

import { cn } from "../lib/utils"
import { FoldingChevron } from "../components/foldingChevron"
import { absoluteTime, relativeTime } from "./historyTime"

/**
 * src/editor/historyList.tsx — the Compare dialog's HISTORY rail and the
 * Block inspector's History tab: the SAME list at two densities
 * (docs/menus/screenshots/08-compare-changes.png).
 *
 * Ported from /home/bam/systemsketch/src/history/HistoryList.tsx:1-212,
 * already props-in/DOM-out in the donor, so this is close to a straight
 * lift — `./history.css` re-expressed as Tailwind utilities against this
 * app's shadcn tokens, `testidPrefix` kept verbatim.
 *
 * `HistoryAuthor`/`HistoryRecord` below and `metaLine` are
 * /home/bam/systemsketch/src/history/historyModel.ts:35-59,105-115. That
 * same donor file's `relativeTime`/`absoluteTime` (its own :75-103) already
 * live in this tree's `historyTime.ts` (Lane E's write set) and are
 * imported from there rather than re-declared — only the record shape and
 * the one line that reads it belong to this component.
 *
 * WHY one component, not two (Zach: "so there's a bit of unity and you only
 * have to understand the interaction pattern once"): the board-level rail
 * in the Compare dialog and the per-element tab in the Block inspector are
 * the SAME list, at two densities. `density` is a stamp on one
 * implementation, never a fork — the way that promise rots is two
 * components that merely look alike on the day they ship.
 *
 * WHY the optional description is disclosed on click, behind a chevron that
 * appears only on rows that carry one, rather than always shown or a
 * tooltip: Figma's own history list shows no description at all, so the
 * reference gave no answer here. A permanent third line breaks the rhythm
 * that makes the list read as Figma's — rows would be two lines or three
 * depending on their data, and a ragged list is the thing the reference
 * most obviously is not. A tooltip loses it to anyone on a touch screen and
 * hides it from anyone not already suspicious there is something there.
 * Disclosure keeps every row identical at rest, and is what Onshape's own
 * `Show changes…` does — the union of both prior arts, not a third
 * invention. The chevron is its own button, NOT the row: selecting a
 * version and reading about it are two different intents, and folding them
 * into one click would mean you could not read a row without also
 * re-pointing the diff at it.
 */

export type HistoryDensity = "comfortable" | "compact"

export interface HistoryAuthor {
  readonly id: string
  /** Display name. Rendered verbatim — never trimmed or initialised away. */
  readonly name: string
}

export interface HistoryRecord {
  readonly id: string
  /** Short — what changed. Primary text in the row. */
  readonly title: string
  /** Optional longer prose. Absent on most rows; disclosed on click. */
  readonly description?: string
  /** Epoch milliseconds, or null when genuinely unknown. */
  readonly timestamp: number | null
  /** Who made it, or null when the host records no author. */
  readonly author: HistoryAuthor | null
  /** Short glyph for the circular slot: 'v1', 'v2', a dot for the live board. */
  readonly badge: string
  /** Tints the badge — `compareModel.ts`'s three states, plus `current`/`mixed`/`none`. */
  readonly tone: "added" | "removed" | "modified" | "mixed" | "current" | "none"
  /** The live board rather than a saved snapshot. */
  readonly isCurrent: boolean
}

/**
 * The secondary line: `7 minutes ago` alone, or `7 minutes ago · Mitch`.
 *
 * The separator only appears with an author, so a host with no identity
 * (every one of this kit's own galleries included) never renders a
 * dangling "· " with nothing after it.
 */
export function metaLine(record: Pick<HistoryRecord, "timestamp" | "author">, now?: number): string {
  const when = relativeTime(record.timestamp, now)
  return record.author ? `${when} · ${record.author.name}` : when
}

export interface HistoryListProps {
  readonly records: readonly HistoryRecord[]
  /** Which record reads as active. Figma tints exactly one. */
  readonly selectedId: string | null
  readonly onSelect?: (id: string) => void
  /** `compact` is the inspector's narrower panel. Same anatomy, tighter metrics. */
  readonly density?: HistoryDensity
  /** Shown in place of the list when there is nothing to show. */
  readonly emptyCopy?: string
  /** Namespaces the test ids so two mounted lists never collide. */
  readonly testidPrefix: string
  /** Marks rows that cannot be picked (the live board is an endpoint, not a choice). */
  readonly isDisabled?: (record: HistoryRecord) => boolean
  /** Short trailing tag on a row — the Compare dialog uses it for `before` / `after`. */
  readonly pinOf?: (record: HistoryRecord) => string | null
}

/** Local layout metrics per density — a stamp on one row template, not a fork. */
const DENSITY_METRICS: Record<HistoryDensity, Record<"padY" | "padX" | "avatar" | "gap" | "title" | "meta", string>> = {
  comfortable: { padY: "7px", padX: "9px", avatar: "22px", gap: "9px", title: "12px", meta: "11px" },
  compact: { padY: "5px", padX: "7px", avatar: "18px", gap: "7px", title: "11.5px", meta: "10.5px" },
}

export function HistoryList({
  records,
  selectedId,
  onSelect,
  density = "comfortable",
  emptyCopy = "No history recorded yet.",
  testidPrefix,
  isDisabled,
  pinOf,
}: HistoryListProps) {
  /*
   * Which descriptions are open, by id — not a single `openId`.
   *
   * A single open row would make the disclosure an accordion, which quietly
   * adds a rule nobody asked for: opening one row closes another, so a
   * reader comparing two descriptions cannot. A Set costs nothing and has
   * no such rule.
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const toggle = (id: string) => {
    setExpanded((open) => {
      const next = new Set(open)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (records.length === 0) {
    return (
      <p className="m-0 px-[9px] py-2.5 text-[11.5px] leading-[1.45] text-muted-foreground" data-testid={`${testidPrefix}-empty`}>
        {emptyCopy}
      </p>
    )
  }

  const metrics = DENSITY_METRICS[density]

  return (
    <ul
      className="m-0 flex list-none flex-col gap-px p-0"
      data-density={density}
      data-testid={testidPrefix}
      style={
        {
          "--history-pad-y": metrics.padY,
          "--history-pad-x": metrics.padX,
          "--history-avatar": metrics.avatar,
          "--history-gap": metrics.gap,
          "--history-title": metrics.title,
          "--history-meta": metrics.meta,
        } as CSSProperties
      }
    >
      {records.map((record) => {
        const disabled = isDisabled?.(record) ?? false
        const open = expanded.has(record.id)
        const pin = pinOf?.(record) ?? null
        const selected = record.id === selectedId

        return (
          <li key={record.id} className="flex flex-col">
            <div
              className={cn(
                "relative flex items-stretch rounded-md",
                selected ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-muted",
              )}
              data-testid={`${testidPrefix}-row-${record.id}`}
              data-selected={selected || undefined}
              data-current={record.isCurrent || undefined}
            >
              {/*
               * Selection is a real accent bar, not a hue wash a reader has
               * to read as ink — the same "form difference, not a colour
               * difference" rule `propertyTable.tsx` carries for its own
               * selected row, so a selected history entry and a modified
               * property row read as the same KIND of mark everywhere in
               * this kit.
               */}
              {selected ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-blue-600 dark:bg-blue-400"
                />
              ) : null}
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-[var(--history-gap)] rounded-md px-[var(--history-pad-x)] py-[var(--history-pad-y)] text-left disabled:cursor-default disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                data-testid={`${testidPrefix}-pick-${record.id}`}
                disabled={disabled}
                aria-current={selected || undefined}
                onClick={() => onSelect?.(record.id)}
              >
                {/*
                 * Figma's circular avatar slot, carrying the only thing
                 * this kit can truthfully put in it: with no author
                 * supplied there is no face to draw, so the circle holds
                 * the version's own tone instead — same geometry, same
                 * left rail, same rhythm, real content rather than a
                 * decoration. `author` takes over the instant a host
                 * supplies one, which is what makes this a slot rather
                 * than a permanent placeholder.
                 */}
                <span
                  data-tone={record.tone}
                  data-kind={record.author ? "author" : "version"}
                  aria-hidden="true"
                  className={cn(
                    "inline-flex size-[var(--history-avatar)] shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold tracking-[0.01em]",
                    record.author
                      ? "border border-transparent bg-primary text-[11px] text-primary-foreground"
                      : cn(
                          "border bg-muted text-muted-foreground",
                          record.tone === "added" && "border-green-600 bg-transparent text-green-600 dark:border-green-400 dark:text-green-400",
                          record.tone === "removed" && "border-red-600 bg-transparent text-red-600 dark:border-red-400 dark:text-red-400",
                          (record.tone === "modified" || record.tone === "mixed") &&
                            "border-blue-600 bg-transparent text-blue-600 dark:border-blue-400 dark:text-blue-400",
                          // The live board is not a version — a filled dot
                          // reads as "you are here", not as one more entry
                          // in the list of things that changed.
                          record.tone === "current" && "border-transparent bg-blue-600 text-white dark:bg-blue-500",
                        ),
                  )}
                >
                  {record.author ? initialOf(record.author.name) : record.badge}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--history-title)] font-semibold text-foreground"
                    data-testid={`${testidPrefix}-title-${record.id}`}
                  >
                    {record.title}
                  </span>
                  {/*
                   * Clips with a real ellipsis rather than a hard cut: the
                   * full value stays reachable in the `title` attribute,
                   * which carries the absolute timestamp the relative
                   * phrase abbreviates.
                   */}
                  <span
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--history-meta)] text-muted-foreground"
                    data-testid={`${testidPrefix}-meta-${record.id}`}
                    title={absoluteTime(record.timestamp)}
                  >
                    {metaLine(record)}
                  </span>
                </span>
                {/* Tight on purpose: the pin competes with the title for the
                 *  rail's width, and the title is what a reader is scanning
                 *  for. */}
                {pin ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-[5px] py-px text-[9px] font-bold tracking-[0.03em] uppercase",
                      selected ? "bg-blue-600 text-white dark:bg-blue-500" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {pin}
                  </span>
                ) : null}
              </button>
              {record.description ? (
                <FoldingChevron
                  open={open}
                  onClick={() => toggle(record.id)}
                  data-testid={`${testidPrefix}-disclose-${record.id}`}
                  aria-label={open ? "Hide details" : "Show details"}
                  title={open ? "Hide details" : "Show details"}
                  className="mr-1 self-center"
                />
              ) : null}
            </div>
            {/*
             * Indented to the TITLE's left edge, not the row's — lining it
             * up under the row's text column rather than the avatar is what
             * makes it read as belonging to that row instead of starting a
             * new one.
             */}
            {record.description && open ? (
              <p
                className="m-0 mb-1 pr-[var(--history-pad-x)] pl-[calc(var(--history-pad-x)+var(--history-avatar)+var(--history-gap))] text-[length:var(--history-meta)] leading-[1.45] text-muted-foreground"
                data-testid={`${testidPrefix}-description-${record.id}`}
              >
                {record.description}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * First character of a name, for the avatar circle.
 *
 * Uses the code-point iterator rather than `name[0]`, so an author whose
 * name begins with an emoji or an astral character gets their actual first
 * character instead of half a surrogate pair — the same truthful-rendering
 * rule `propertyTable.tsx` follows for property values. The full name still
 * renders in the meta line; this only abbreviates inside the small circle.
 */
function initialOf(name: string): string {
  const first = [...name.trim()][0]
  return (first ?? "?").toUpperCase()
}
